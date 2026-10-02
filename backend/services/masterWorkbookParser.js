const XLSX = require('xlsx');
const crypto = require('crypto');
const { getCategoryConfig } = require('../config/masterSchemaRegistry');

/**
 * masterWorkbookParser.js
 * 
 * Strict workbook parser validating uploaded hospital spreadsheets against
 * MASTER_SCHEMA_REGISTRY and the formal Hospital Commercial Export Contract (Version 1).
 * 
 * Enforces:
 * 1. Category context & Department rules (Assets bypasses department; Radiology blocked).
 * 2. Exact client headers verbatim (e.g. "MRP " trailing space in Pathology, "Doctors Name" in Service).
 * 3. Exact column ordering and expected column counts.
 * 4. Formal commercial selection column support (Col Z "MRP" in Pharmacy, Col Y "MRP" in Lab Operation).
 * 5. Zero-price preservation: explicit MRP=0 is preserved as 0, not coerced or null.
 * 6. Blank-price preservation: blank/null/undefined MRP marks row as unselected.
 * 7. Cryptographic row hashing (sourceRowHash via SHA-256).
 */

const HOSPITAL_EXPORT_VERSION = 1;

const HOSPITAL_COMMERCIAL_COLUMNS = {
  'Pathology': ['MRP ', 'Net Rate'],
  'Service': ['MRP', 'Net Rate'],
  'Assets': ['MRP'],
  'Pharmacy': ['MRP'],
  'Lab Operation': ['MRP']
};

function resolveNumericPrice(val) {
  if (val === null || val === undefined || val === '') return null;
  // If already number 0, return 0
  if (typeof val === 'number' && !isNaN(val)) return val;
  const str = String(val).trim();
  if (str === '') return null;
  const num = Number(str);
  return isNaN(num) ? null : num;
}

function parseWorkbook(fileBuffer, category, department) {
  if (!fileBuffer || !fileBuffer.length) {
    throw new Error('Empty file buffer provided.');
  }

  if (!category) {
    throw new Error('Category context is required for master workbook upload.');
  }

  // 1. Radiology Block
  if (category === 'Radiology') {
    const blockedErr = new Error('Radiology uploads are blocked: Category remains SOURCE-CONFIRMATION-REQUIRED. Client specifications pending.');
    blockedErr.statusCode = 400;
    throw blockedErr;
  }

  const catConfig = getCategoryConfig(category);
  if (!catConfig) {
    const invalidCatErr = new Error(`Invalid category "${category}".`);
    invalidCatErr.statusCode = 400;
    throw invalidCatErr;
  }

  if (catConfig.status === 'SOURCE-CONFIRMATION-REQUIRED') {
    const pendingErr = new Error(`Category "${category}" is pending client specification and cannot accept uploads.`);
    pendingErr.statusCode = 400;
    throw pendingErr;
  }

  // 2. Department Check (Optional in Phase 1: Assets bypasses department; other categories support optional department for category-wide uploads)
  const isSpecificDept = category !== 'Assets' && catConfig.hasDepartment && department && department !== 'all' && department.trim() !== '';

  // 3. Compute fileHash
  const fileHash = crypto.createHash('sha256').update(fileBuffer).digest('hex');

  // 4. Parse XLSX workbook
  const workbook = XLSX.read(fileBuffer, { type: 'buffer', cellDates: false });
  if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
    throw new Error('Invalid Excel file: No worksheets found.');
  }

  // Find target sheet
  const expectedSheet = catConfig.excelSheet;
  let targetSheetName = workbook.SheetNames.find(s => s.trim().toLowerCase() === expectedSheet.trim().toLowerCase());
  if (!targetSheetName) {
    targetSheetName = workbook.SheetNames[0]; // Fallback to first sheet
  }
  const sheet = workbook.Sheets[targetSheetName];
  if (!sheet) {
    throw new Error(`Target worksheet "${expectedSheet}" could not be read.`);
  }

  // Convert to 2D array matrix (preserving raw cell values)
  const matrix = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', blankrows: false });
  if (matrix.length < 1) {
    throw new Error('The uploaded worksheet is empty.');
  }

  const rawHeaders = (matrix[0] || []).map(h => String(h).trim());
  const expectedFields = catConfig.sharedFields || [];
  const expectedHeaders = expectedFields.map(f => f.clientHeader);

  // 5. Exact Header Validation
  const headerErrors = [];
  expectedFields.forEach((field, idx) => {
    const actual = matrix[0] && matrix[0][idx] !== undefined ? String(matrix[0][idx]) : undefined;
    const expected = field.clientHeader;

    if (actual === undefined || actual === '') {
      headerErrors.push(`Missing column ${field.excelColumn}: Expected exact header "${expected}".`);
    } else if (actual !== expected) {
      headerErrors.push(`Column ${field.excelColumn} header mismatch: Found "${actual}", expected exact "${expected}".`);
    }
  });

  if (headerErrors.length > 0) {
    const mismatchErr = new Error(`Excel Header Validation Failed:\n- ${headerErrors.join('\n- ')}`);
    mismatchErr.statusCode = 400;
    mismatchErr.validationErrors = headerErrors;
    throw mismatchErr;
  }

  // Check if hospital commercial columns are present
  let hasCommercialColumns = false;
  let commercialMrpColIdx = -1;

  if (category === 'Pharmacy' || category === 'Lab Operation') {
    // Check if extra column at index expectedFields.length has "MRP"
    for (let c = expectedFields.length; c < (matrix[0] || []).length; c++) {
      const h = String(matrix[0][c] || '').trim();
      if (/^mrp$/i.test(h) || /^hospital\s*mrp$/i.test(h) || /^select\s*\/\s*mrp$/i.test(h)) {
        hasCommercialColumns = true;
        commercialMrpColIdx = c;
        break;
      }
    }
  } else {
    // In Pathology, Service, Assets, pricing is in canonical columns
    hasCommercialColumns = true;
  }

  // 6. Row Extraction & Formatting
  const parsedRows = [];
  for (let r = 1; r < matrix.length; r++) {
    const rowCells = matrix[r];
    if (!rowCells || rowCells.length === 0 || rowCells.every(c => c === '' || c === null || c === undefined)) {
      continue; // Skip blank row
    }

    const rowNumber = r + 1; // 1-indexed Excel row
    const rawRowData = {};
    const sourceData = {};
    const rowErrors = [];

    // Map each expected field by fieldKey and verify exact registry cell
    expectedFields.forEach((field, colIdx) => {
      let cellVal = rowCells[colIdx];
      if (cellVal === undefined) cellVal = '';
      rawRowData[field.fieldKey] = cellVal;
      sourceData[field.clientHeader] = cellVal;
    });

    // Capture any optional operational hospital columns beyond standard schema (e.g. Hospital MRP)
    for (let colIdx = expectedFields.length; colIdx < (matrix[0] || []).length; colIdx++) {
      const header = String(matrix[0][colIdx] || '').trim();
      if (header) {
        sourceData[header] = rowCells[colIdx] !== undefined ? rowCells[colIdx] : '';
      }
    }

    // Compute deterministic sourceRowHash
    const sourceRowHash = crypto.createHash('sha256').update(JSON.stringify(rawRowData)).digest('hex');

    // Context validation: Category column (if present in sheet)
    if (rawRowData.category && String(rawRowData.category).trim() !== '' && String(rawRowData.category).trim().toLowerCase() !== category.toLowerCase()) {
      rowErrors.push(`Row Category "${rawRowData.category}" does not match upload category context "${category}".`);
    }

    // Context validation: Department column (if present and applicable)
    const rowDept = rawRowData.department ? String(rawRowData.department).trim() : '';
    if (category !== 'Assets' && catConfig.hasDepartment && rowDept) {
      const isSpecificDeptContext = department && department !== 'all' && department.trim() !== '';
      if (isSpecificDeptContext) {
        if (rowDept.toLowerCase() !== department.trim().toLowerCase()) {
          rowErrors.push(`Row Department "${rowDept}" does not match upload department context "${department}".`);
        }
      } else if (catConfig.departments) {
        const validDeptKeys = Object.keys(catConfig.departments);
        const isValidDept = validDeptKeys.some(d => d.toLowerCase() === rowDept.toLowerCase());
        if (!isValidDept) {
          rowErrors.push(`Row Department "${rowDept}" is not a recognized department for category "${category}".`);
        }
      }
    }

    // Category-specific pricing extraction
    const importedPricing = { mrp: undefined, netRate: undefined, hospitalCost: undefined };

    if (category === 'Pathology') {
      // Col K: "MRP " (mrp), Col L: "Net Rate" (netRate)
      const parsedMrp = resolveNumericPrice(rawRowData.mrp);
      const parsedNetRate = resolveNumericPrice(rawRowData.netRate);
      if (parsedMrp !== null) importedPricing.mrp = parsedMrp;
      if (parsedNetRate !== null) importedPricing.netRate = parsedNetRate;
    } else if (category === 'Service') {
      // Col G: "MRP" (mrp), Col H: "Net Rate" (netRate)
      const parsedMrp = resolveNumericPrice(rawRowData.mrp);
      const parsedNetRate = resolveNumericPrice(rawRowData.netRate);
      if (parsedMrp !== null) importedPricing.mrp = parsedMrp;
      if (parsedNetRate !== null) importedPricing.netRate = parsedNetRate;
    } else if (category === 'Assets') {
      // Col O: "MRP" (mrp)
      const parsedMrp = resolveNumericPrice(rawRowData.mrp);
      if (parsedMrp !== null) importedPricing.mrp = parsedMrp;
    } else {
      // Lab Operation & Pharmacy: Commercial selection MRP column
      let operationalMrp = null;
      if (commercialMrpColIdx !== -1 && rowCells[commercialMrpColIdx] !== undefined) {
        operationalMrp = rowCells[commercialMrpColIdx];
      } else if (sourceData['MRP'] !== undefined) {
        operationalMrp = sourceData['MRP'];
      } else if (sourceData['Hospital MRP'] !== undefined) {
        operationalMrp = sourceData['Hospital MRP'];
      } else if (sourceData['Select / MRP'] !== undefined) {
        operationalMrp = sourceData['Select / MRP'];
      } else if (rawRowData.mrp !== undefined) {
        operationalMrp = rawRowData.mrp;
      }

      if (operationalMrp !== null && operationalMrp !== undefined) {
        const parsedMrp = resolveNumericPrice(operationalMrp);
        if (parsedMrp !== null) {
          importedPricing.mrp = parsedMrp;
          rawRowData.mrp = parsedMrp;
        }
      }
    }

    parsedRows.push({
      rowNumber,
      sourceRowHash,
      rawRowData,
      sourceData,
      importedPricing,
      extractedPricing: importedPricing,
      validationErrors: rowErrors
    });
  }

  return {
    success: true,
    sheetName: targetSheetName,
    fileHash,
    hospitalExportVersion: hasCommercialColumns ? HOSPITAL_EXPORT_VERSION : 0,
    hasCommercialColumns,
    hasMrpColumn: hasCommercialColumns,
    totalRowsParsed: parsedRows.length,
    rows: parsedRows
  };
}

function generateWorkbookTemplate(category, department, options = {}) {
  if (category === 'Radiology') {
    const blockedErr = new Error('Radiology uploads are blocked: Category remains SOURCE-CONFIRMATION-REQUIRED. Client specifications pending.');
    blockedErr.statusCode = 400;
    throw blockedErr;
  }
  const catConfig = getCategoryConfig(category);
  if (!catConfig) {
    throw new Error(`Invalid category: "${category}".`);
  }
  const fields = catConfig.sharedFields || [];
  const headers = fields.map(f => f.clientHeader);

  // For Pharmacy and Lab Operation, append commercial MRP column only if hospital commercial template is requested
  const isCommercialAppended = options.isHospitalCommercial && (category === 'Pharmacy' || category === 'Lab Operation');
  if (isCommercialAppended) {
    headers.push('MRP');
  }

  const sampleRow = fields.map(f => {
    if (f.defaultValue !== null && f.defaultValue !== undefined) return f.defaultValue;
    if (f.allowedValues && f.allowedValues.length > 0) return f.allowedValues[0];
    if (f.clientHeader === 'Category') return category;
    if (f.clientHeader === 'Department') return department || (catConfig.hasDepartment ? Object.keys(catConfig.departments || {})[0] : '');
    return '';
  });
  if (isCommercialAppended) {
    sampleRow.push(''); // Blank commercial input
  }

  const ws = XLSX.utils.aoa_to_sheet([headers, sampleRow]);
  ws['!cols'] = headers.map(h => ({ wch: Math.max(h.length + 4, 15) }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, catConfig.excelSheet || category);
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

module.exports = {
  HOSPITAL_EXPORT_VERSION,
  HOSPITAL_COMMERCIAL_COLUMNS,
  parseWorkbook,
  parseMasterWorkbook: parseWorkbook,
  generateWorkbookTemplate,
  resolveNumericPrice
};
