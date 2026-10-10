const XLSX = require('xlsx');
const ItemMaster = require('../models/ItemMaster');
const HospitalMasterConfig = require('../models/HospitalMasterConfig');
const { getCategoryConfig } = require('../config/masterSchemaRegistry');

/**
 * masterExportService.js
 * 
 * QUROXA MASTER EXPORT SERVICE
 * 
 * Two explicit export contracts:
 * 1. GLOBAL MASTER EXPORT (GLOBAL_CANONICAL)
 *    - Exact client Excel structure / source of truth strictly matching MASTER_SCHEMA_REGISTRY.
 *    - Lab Operation: 24 columns, 0 pricing columns.
 *    - Pharmacy: 25 columns, 0 pricing columns.
 *    - Pathology: 12 columns, Col K exact "MRP " (trailing space), Col L "Net Rate".
 *    - Service: 8 columns, Col G "MRP", Col H "Net Rate".
 *    - Assets: 15 columns, Col O "MRP", strictly department-free.
 * 
 * 2. HOSPITAL COMMERCIAL WORKBOOK (HOSPITAL_COMMERCIAL - Common Master Center)
 *    - Export generated for a hospital review and commercial selection.
 *    - Contains all canonical master fields to identify the item + commercial columns:
 *      MRP and Net Rate.
 *    - Existing pricing populated from HospitalMasterConfig if configured; otherwise blank.
 *    - Category-wide download preserves all departments across the entire category in one workbook.
 */

const HOSPITAL_EXPORT_VERSION = 1;

const HOSPITAL_COMMERCIAL_COLUMNS = {
  'Pathology': ['MRP ', 'Net Rate'],
  'Service': ['MRP', 'Net Rate'],
  'Assets': ['MRP', 'Net Rate'],
  'Pharmacy': ['MRP', 'Net Rate'],
  'Lab Operation': ['MRP', 'Net Rate']
};

function parseDepartmentFilter(department, catConfig) {
  if (!catConfig || !catConfig.hasDepartment || !department || department === 'all') {
    return { isSpecificDept: false, depts: [], safeDeptStr: '' };
  }
  const depts = (Array.isArray(department) ? department : String(department).split(','))
    .map(d => d.trim())
    .filter(d => d && d !== 'all');
  if (depts.length === 0) {
    return { isSpecificDept: false, depts: [], safeDeptStr: '' };
  }
  const safeDeptStr = depts.length === 1
    ? `_${depts[0].replace(/\s+/g, '_')}`
    : `_${depts.length}_Departments`;
  return { isSpecificDept: true, depts, safeDeptStr };
}

async function queryExportItems(category, department, customItems = null, catConfig) {
  if (customItems) return customItems;

  const query = {
    scope: 'GLOBAL',
    $or: [{ category }, { categoryType: category }]
  };

  const { isSpecificDept, depts } = parseDepartmentFilter(department, catConfig);
  if (isSpecificDept) {
    if (depts.length === 1) {
      query.$and = [
        { $or: [{ department: depts[0] }, { departmentType: depts[0] }] }
      ];
    } else {
      query.$and = [
        { $or: [{ department: { $in: depts } }, { departmentType: { $in: depts } }] }
      ];
    }
  }

  return await ItemMaster.find(query).sort({ itemCode: 1 }).lean();
}

/**
 * Build canonical data row for an item
 */
function buildCanonicalRow(item, index, fields, category, department, catConfig, hospitalPricing = {}) {
  const { isSpecificDept, depts } = parseDepartmentFilter(department, catConfig);

  return fields.map(field => {
    const key = field.fieldKey;

    if (key === 'sNo') return index + 1;
    if (key === 'category') return category;
    if (key === 'department') {
      if (!catConfig.hasDepartment) return '';
      return item.department || item.departmentType || (isSpecificDept && depts.length === 1 ? depts[0] : '');
    }
    if (key === 'itemCode') return item.itemCode || '';
    if (key === 'itemName') return item.itemName || item.genericName || '';
    if (key === 'status') return item.status || 'Active';

    // Pricing fields: populate from hospitalPricing if available, else blank
    if (field.pricingScope === 'HOSPITAL_SPECIFIC') {
      if (key === 'mrp') {
        return hospitalPricing.mrp !== undefined && hospitalPricing.mrp !== null ? hospitalPricing.mrp : '';
      }
      if (key === 'netRate') {
        return hospitalPricing.netRate !== undefined && hospitalPricing.netRate !== null ? hospitalPricing.netRate : '';
      }
      return '';
    }

    const catData = item.categoryData || {};
    if (catData[key] !== undefined && catData[key] !== null) {
      return catData[key];
    }
    if (item[key] !== undefined && item[key] !== null) {
      return item[key];
    }
    if (field.defaultValue !== null && field.defaultValue !== undefined) {
      return field.defaultValue;
    }
    return '';
  });
}

/**
 * Generate Hospital Commercial Workbook (.xlsx)
 * Always provides visible MRP and Net Rate columns for hospital commercial selection.
 * Populates existing pricing from HospitalMasterConfig if tenantId is provided; otherwise blank.
 */
async function generateHospitalCommercialExportWorkbook(category, department, customItems = null, options = {}) {
  if (!category) {
    throw new Error('Category is required for Hospital Commercial export.');
  }
  if (category === 'Radiology') {
    throw new Error('Radiology export is unavailable: Category remains SOURCE-CONFIRMATION-REQUIRED.');
  }

  const catConfig = getCategoryConfig(category);
  if (!catConfig) {
    throw new Error(`Invalid category: "${category}".`);
  }
  if (catConfig.status === 'SOURCE-CONFIRMATION-REQUIRED') {
    throw new Error(`Category "${category}" is pending client specification.`);
  }

  const tenantId = (typeof options === 'string' ? options : options.tenantId || options.hospital) || '';

  let existingPricingMap = new Map();
  if (tenantId) {
    try {
      const configs = await HospitalMasterConfig.find({ tenantId, category }).lean();
      configs.forEach(c => {
        if (c.masterItemId) {
          existingPricingMap.set(c.masterItemId.toString(), c);
        }
      });
    } catch (e) {
      console.warn('Error querying HospitalMasterConfig for commercial export:', e.message);
    }
  }

  const { isSpecificDept, depts, safeDeptStr } = parseDepartmentFilter(department, catConfig);
  const items = await queryExportItems(category, department, customItems, catConfig);
  const canonicalFields = catConfig.sharedFields || [];
  const canonicalHeaders = canonicalFields.map(f => f.clientHeader);

  // Determine commercial columns to append
  const extraCommercialHeaders = [];
  const hasMrp = canonicalHeaders.some(h => /mrp/i.test(h));
  const hasNetRate = canonicalHeaders.some(h => /net\s*rate/i.test(h));
  if (!hasMrp) extraCommercialHeaders.push('MRP');
  if (!hasNetRate) extraCommercialHeaders.push('Net Rate');

  const headers = [...canonicalHeaders, ...extraCommercialHeaders];

  // Build rows
  const rows = items.map((item, index) => {
    let itemMrp = '';
    let itemNetRate = '';
    if (item._id && existingPricingMap.has(item._id.toString())) {
      const cfg = existingPricingMap.get(item._id.toString());
      if (cfg.mrp !== undefined && cfg.mrp !== null) itemMrp = cfg.mrp;
      if (cfg.netRate !== undefined && cfg.netRate !== null) itemNetRate = cfg.netRate;
    }

    const row = buildCanonicalRow(item, index, canonicalFields, category, department, catConfig, { mrp: itemMrp, netRate: itemNetRate });
    // Append extra commercial cells
    extraCommercialHeaders.forEach(header => {
      if (/mrp/i.test(header)) row.push(itemMrp);
      else if (/net\s*rate/i.test(header)) row.push(itemNetRate);
      else row.push('');
    });
    return row;
  });

  // Sample row if empty
  const defaultRow = canonicalFields.map(f => {
    if (f.fieldKey === 'sNo') return 1;
    if (f.fieldKey === 'category') return category;
    if (f.fieldKey === 'department') return catConfig.hasDepartment ? (isSpecificDept && depts.length === 1 ? depts[0] : Object.keys(catConfig.departments || {})[0] || '') : '';
    if (f.defaultValue !== null && f.defaultValue !== undefined) return f.defaultValue;
    if (f.allowedValues && f.allowedValues.length > 0) return f.allowedValues[0];
    return '';
  });
  extraCommercialHeaders.forEach(() => defaultRow.push(''));

  const worksheetData = [headers, ...(rows.length > 0 ? rows : [defaultRow])];
  const ws = XLSX.utils.aoa_to_sheet(worksheetData);
  ws['!cols'] = headers.map(h => ({ wch: Math.max(h.length + 4, 15) }));

  const wb = XLSX.utils.book_new();
  const sheetName = catConfig.excelSheet || category;
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  wb.Props = {
    Title: `Quroxa Hospital Commercial Workbook - ${category}`,
    Subject: 'HOSPITAL_EXPORT_V1',
    Author: 'Quroxa Medical Systems'
  };

  const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  const safeCat = category.replace(/\s+/g, '_');
  const filename = `Quroxa_Hospital_Commercial_${safeCat}${safeDeptStr}.xlsx`;

  return {
    buffer,
    filename,
    itemCount: items.length,
    sheetName,
    headers,
    exportType: 'HOSPITAL_COMMERCIAL',
    hospitalExportVersion: HOSPITAL_EXPORT_VERSION,
    hasMrpColumn: headers.some(h => /mrp/i.test(h)),
    hasNetRateColumn: headers.some(h => /net\s*rate/i.test(h))
  };
}

/**
 * Generate Raw Canonical Master Export Workbook (.xlsx)
 * Strictly matches MASTER_SCHEMA_REGISTRY without extra commercial columns.
 */
async function generateCanonicalMasterExportWorkbook(category, department, customItems = null) {
  if (!category) {
    throw new Error('Category is required for Global Master export.');
  }
  if (category === 'Radiology') {
    throw new Error('Radiology export is unavailable: Category remains SOURCE-CONFIRMATION-REQUIRED.');
  }

  const catConfig = getCategoryConfig(category);
  if (!catConfig) {
    throw new Error(`Invalid category: "${category}".`);
  }
  if (catConfig.status === 'SOURCE-CONFIRMATION-REQUIRED') {
    throw new Error(`Category "${category}" is pending client specification.`);
  }

  const { isSpecificDept, depts, safeDeptStr } = parseDepartmentFilter(department, catConfig);
  const items = await queryExportItems(category, department, customItems, catConfig);
  const fields = catConfig.sharedFields || [];
  const headers = fields.map(f => f.clientHeader);

  const rows = items.map((item, index) => {
    return buildCanonicalRow(item, index, fields, category, department, catConfig);
  });

  const defaultRow = fields.map(f => {
    if (f.fieldKey === 'sNo') return 1;
    if (f.fieldKey === 'category') return category;
    if (f.fieldKey === 'department') return catConfig.hasDepartment ? (isSpecificDept && depts.length === 1 ? depts[0] : Object.keys(catConfig.departments || {})[0] || '') : '';
    if (f.defaultValue !== null && f.defaultValue !== undefined) return f.defaultValue;
    if (f.allowedValues && f.allowedValues.length > 0) return f.allowedValues[0];
    return '';
  });

  const worksheetData = [headers, ...(rows.length > 0 ? rows : [defaultRow])];
  const ws = XLSX.utils.aoa_to_sheet(worksheetData);
  ws['!cols'] = headers.map(h => ({ wch: Math.max(h.length + 4, 15) }));

  const wb = XLSX.utils.book_new();
  const sheetName = catConfig.excelSheet || category;
  XLSX.utils.book_append_sheet(wb, ws, sheetName);

  const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  const safeCat = category.replace(/\s+/g, '_');
  const filename = `Quroxa_Master_${safeCat}${safeDeptStr}.xlsx`;

  return {
    buffer,
    filename,
    itemCount: items.length,
    sheetName,
    headers,
    exportType: 'GLOBAL_CANONICAL'
  };
}

/**
 * Unified entry point
 * Preserves backward compatibility: if options.exportType === 'HOSPITAL_COMMERCIAL',
 * generates the hospital commercial format with visible MRP.
 * Defaults to 'GLOBAL_CANONICAL' for unit tests calling generateMasterExportWorkbook directly.
 */
async function generateMasterExportWorkbook(category, department, customItems = null, options = {}) {
  const exportType = options.exportType || (options.isHospitalCommercial ? 'HOSPITAL_COMMERCIAL' : 'GLOBAL_CANONICAL');
  if (exportType === 'HOSPITAL_COMMERCIAL') {
    return await generateHospitalCommercialExportWorkbook(category, department, customItems, options);
  }
  return await generateCanonicalMasterExportWorkbook(category, department, customItems);
}

module.exports = {
  HOSPITAL_EXPORT_VERSION,
  HOSPITAL_COMMERCIAL_COLUMNS,
  generateMasterExportWorkbook,
  generateHospitalCommercialExportWorkbook,
  generateCanonicalMasterExportWorkbook
};
