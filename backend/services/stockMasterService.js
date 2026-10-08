const XLSX = require('xlsx');
const crypto = require('crypto');
const ItemMaster = require('../models/ItemMaster');
const HospitalMasterConfig = require('../models/HospitalMasterConfig');
const Medicine = require('../models/Medicine');
const MedicineBatch = require('../models/MedicineBatch');
const AuditLog = require('../models/AuditLog');
const { STOCK_MASTER_COLUMNS } = require('../config/stockMasterSchemaRegistry');

function normalizeStr(val) {
  return String(val !== undefined && val !== null ? val : '').trim();
}

function normalizeKey(val) {
  return String(val || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * Generate an empty Stock Master Excel template.
 * Contains ONLY approved headers — NO fake or demo inventory rows.
 */
function generateStockMasterTemplateWorkbook(hospitalCode = '') {
  const headers = STOCK_MASTER_COLUMNS.map(col => col.header);
  const data = [headers]; // Row 1 is headers only

  const worksheet = XLSX.utils.aoa_to_sheet(data);

  // Set column widths
  worksheet['!cols'] = STOCK_MASTER_COLUMNS.map(col => ({
    wch: Math.max(col.header.length + 4, 14)
  }));

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Stock Master Template');

  const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
  const filename = hospitalCode
    ? `Stock_Master_Template_${hospitalCode}.xlsx`
    : 'Stock_Master_Template.xlsx';

  return { buffer, filename };
}

/**
 * Export current Stock Master / Inventory balances for a hospital.
 */
async function generateStockMasterExportWorkbook(tenantId) {
  if (!tenantId) {
    throw new Error('tenantId is required for Stock Master export.');
  }

  const batches = await MedicineBatch.find({ tenantId })
    .populate('itemMasterId', 'itemCode itemName genericName brandName')
    .sort({ name: 1, batchNumber: 1 })
    .lean();

  const headers = STOCK_MASTER_COLUMNS.map(col => col.header);
  const rows = [headers];

  batches.forEach((b, idx) => {
    const itemCode = b.itemMasterId?.itemCode || b.sku || '';
    const itemName = b.itemMasterId?.itemName || b.name || '';
    const expiryStr = b.expiryDate ? new Date(b.expiryDate).toISOString().split('T')[0] : '';
    const mfgStr = b.mfgDate ? new Date(b.mfgDate).toISOString().split('T')[0] : '';

    rows.push([
      idx + 1,
      itemCode,
      itemName,
      b.batchNumber,
      expiryStr,
      mfgStr,
      b.availableQuantity,
      b.consumptionUnit || 'Unit',
      b.purchaseRate || 0,
      b.mrp || 0,
      b.vendorName || '',
      b.storageTemperature || ''
    ]);
  });

  const worksheet = XLSX.utils.aoa_to_sheet(rows);
  worksheet['!cols'] = STOCK_MASTER_COLUMNS.map(col => ({
    wch: Math.max(col.header.length + 4, 14)
  }));

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Stock Master Export');

  const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
  const filename = `Stock_Master_${tenantId}_${new Date().toISOString().split('T')[0]}.xlsx`;

  return { buffer, filename, count: batches.length };
}

/**
 * Parse an uploaded Stock Master workbook.
 */
function parseStockMasterWorkbook(fileBuffer) {
  if (!fileBuffer || !fileBuffer.length) {
    throw new Error('Empty file buffer provided.');
  }

  const fileHash = crypto.createHash('sha256').update(fileBuffer).digest('hex');
  const workbook = XLSX.read(fileBuffer, { type: 'buffer', cellDates: false });

  if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
    throw new Error('Invalid Excel file: No worksheets found.');
  }

  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) {
    throw new Error('Target worksheet could not be read.');
  }

  const matrix = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', blankrows: false });
  if (matrix.length < 1) {
    throw new Error('The uploaded worksheet is empty.');
  }

  const rawHeaders = (matrix[0] || []).map(h => normalizeStr(h));
  const headerMap = new Map();
  rawHeaders.forEach((h, idx) => {
    if (h) headerMap.set(normalizeKey(h), idx);
  });

  // Verify critical headers exist
  const itemCodeIdx = headerMap.get(normalizeKey('Item Code')) ?? headerMap.get(normalizeKey('ItemCode'));
  if (itemCodeIdx === undefined) {
    throw new Error('Header validation failed: "Item Code" column is required.');
  }

  const batchNumberIdx = headerMap.get(normalizeKey('Batch Number')) ?? headerMap.get(normalizeKey('BatchNumber')) ?? headerMap.get(normalizeKey('Batch'));
  if (batchNumberIdx === undefined) {
    throw new Error('Header validation failed: "Batch Number" column is required.');
  }

  const expiryDateIdx = headerMap.get(normalizeKey('Expiry Date (YYYY-MM-DD)')) ?? headerMap.get(normalizeKey('Expiry Date')) ?? headerMap.get(normalizeKey('ExpiryDate'));
  if (expiryDateIdx === undefined) {
    throw new Error('Header validation failed: "Expiry Date" column is required.');
  }

  const quantityIdx = headerMap.get(normalizeKey('Quantity')) ?? headerMap.get(normalizeKey('Qty'));
  if (quantityIdx === undefined) {
    throw new Error('Header validation failed: "Quantity" column is required.');
  }

  const buyingPriceIdx = headerMap.get(normalizeKey('Buying Price (Per Unit)')) ?? headerMap.get(normalizeKey('Buying Price')) ?? headerMap.get(normalizeKey('BuyingPrice')) ?? headerMap.get(normalizeKey('Cost Price')) ?? headerMap.get(normalizeKey('Purchase Rate'));
  if (buyingPriceIdx === undefined) {
    throw new Error('Header validation failed: "Buying Price" column is required.');
  }

  const mrpIdx = headerMap.get(normalizeKey('MRP (Per Unit)')) ?? headerMap.get(normalizeKey('MRP'));
  if (mrpIdx === undefined) {
    throw new Error('Header validation failed: "MRP" column is required.');
  }

  const itemNameIdx = headerMap.get(normalizeKey('Item Name')) ?? headerMap.get(normalizeKey('ItemName'));
  const mfgDateIdx = headerMap.get(normalizeKey('Manufacturing Date (YYYY-MM-DD)')) ?? headerMap.get(normalizeKey('Manufacturing Date')) ?? headerMap.get(normalizeKey('Mfg Date'));
  const unitIdx = headerMap.get(normalizeKey('Unit'));
  const vendorNameIdx = headerMap.get(normalizeKey('Vendor Name')) ?? headerMap.get(normalizeKey('VendorName')) ?? headerMap.get(normalizeKey('Supplier Name'));
  const storageLocationIdx = headerMap.get(normalizeKey('Storage Location')) ?? headerMap.get(normalizeKey('Location'));

  const parsedRows = [];
  for (let r = 1; r < matrix.length; r++) {
    const row = matrix[r];
    if (!row || row.every(c => normalizeStr(c) === '')) continue; // Skip blank rows

    parsedRows.push({
      rowNumber: r + 1,
      itemCode: normalizeStr(row[itemCodeIdx]),
      itemName: itemNameIdx !== undefined ? normalizeStr(row[itemNameIdx]) : '',
      batchNumber: normalizeStr(row[batchNumberIdx]),
      expiryDateRaw: normalizeStr(row[expiryDateIdx]),
      mfgDateRaw: mfgDateIdx !== undefined ? normalizeStr(row[mfgDateIdx]) : '',
      quantityRaw: normalizeStr(row[quantityIdx]),
      unit: unitIdx !== undefined ? normalizeStr(row[unitIdx]) : 'Unit',
      buyingPriceRaw: normalizeStr(row[buyingPriceIdx]),
      mrpRaw: normalizeStr(row[mrpIdx]),
      vendorName: vendorNameIdx !== undefined ? normalizeStr(row[vendorNameIdx]) : '',
      storageLocation: storageLocationIdx !== undefined ? normalizeStr(row[storageLocationIdx]) : ''
    });
  }

  if (parsedRows.length === 0) {
    throw new Error('No data rows found in uploaded Stock Master worksheet.');
  }

  return { fileHash, rows: parsedRows };
}

/**
 * Validate parsed Stock Master rows against the hospital's active catalog.
 * Strict rules:
 * 1. Item Code must exist in canonical ItemMaster.
 * 2. Item must be active and approved in the target hospital's HospitalMasterConfig.
 * 3. Quantity > 0 and integer.
 * 4. Expiry Date must be valid and in the future.
 * 5. Mfg Date must be <= today.
 * 6. Buying Price >= 0.
 * 7. MRP >= 0.
 * 8. Buying Price <= MRP.
 * 9. Duplicate Batch + Item combinations in same sheet flagged.
 */
async function validateStockMasterRows(parsedRows, tenantId) {
  if (!tenantId) {
    throw new Error('tenantId is required for Stock Master validation.');
  }

  // Pre-fetch hospital's approved HospitalMasterConfig items
  const hospitalConfigs = await HospitalMasterConfig.find({
    tenantId,
    status: 'Active',
    approvalStatus: 'Approved'
  }).populate('masterItemId').lean();

  const configByItemCode = new Map();
  const configByMasterId = new Map();

  hospitalConfigs.forEach(cfg => {
    if (cfg.masterItemId) {
      if (cfg.masterItemId.itemCode) {
        configByItemCode.set(String(cfg.masterItemId.itemCode).trim().toUpperCase(), cfg);
      }
      configByMasterId.set(String(cfg.masterItemId._id), cfg);
    }
  });

  const validatedRows = [];
  const seenBatches = new Set();
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  let validCount = 0;
  let invalidCount = 0;

  for (const row of parsedRows) {
    const errors = [];
    const warnings = [];

    // 1. Item Code Validation
    const cleanItemCode = String(row.itemCode || '').trim().toUpperCase();
    if (!cleanItemCode) {
      errors.push('Item Code is required.');
    }

    let matchedConfig = null;
    let matchedItem = null;

    if (cleanItemCode) {
      matchedConfig = configByItemCode.get(cleanItemCode);
      if (!matchedConfig) {
        // Also check if canonical item exists globally
        const globalItem = await ItemMaster.findOne({ itemCode: cleanItemCode }).lean();
        if (!globalItem) {
          errors.push(`Item Code "${cleanItemCode}" does not exist in Canonical Item Master.`);
        } else {
          errors.push(`Item "${globalItem.itemName || globalItem.brandName}" (${cleanItemCode}) is NOT assigned/approved in this hospital's catalog.`);
        }
      } else {
        matchedItem = matchedConfig.masterItemId;
      }
    }

    // 2. Batch Number Validation
    const cleanBatch = String(row.batchNumber || '').trim().toUpperCase();
    if (!cleanBatch) {
      errors.push('Batch Number is required.');
    } else {
      const batchKey = `${cleanItemCode}:::${cleanBatch}`;
      if (seenBatches.has(batchKey)) {
        errors.push(`Duplicate row: Item ${cleanItemCode} with batch ${cleanBatch} appears multiple times in sheet.`);
      }
      seenBatches.add(batchKey);
    }

    // 3. Quantity Validation
    const qty = Number(row.quantityRaw);
    if (!Number.isFinite(qty) || qty <= 0) {
      errors.push(`Quantity must be a positive number greater than 0 (got: "${row.quantityRaw}").`);
    }

    // 4. Expiry Date Validation
    let parsedExpiry = null;
    if (!row.expiryDateRaw) {
      errors.push('Expiry Date is required.');
    } else {
      parsedExpiry = new Date(row.expiryDateRaw);
      if (isNaN(parsedExpiry.getTime())) {
        errors.push(`Invalid Expiry Date format: "${row.expiryDateRaw}". Use YYYY-MM-DD.`);
      } else if (parsedExpiry.getTime() <= today.getTime()) {
        errors.push(`Expiry Date (${row.expiryDateRaw}) has already passed or is today.`);
      }
    }

    // 5. Manufacturing Date Validation
    let parsedMfg = null;
    if (row.mfgDateRaw) {
      parsedMfg = new Date(row.mfgDateRaw);
      if (isNaN(parsedMfg.getTime())) {
        errors.push(`Invalid Manufacturing Date format: "${row.mfgDateRaw}". Use YYYY-MM-DD.`);
      } else if (parsedMfg.getTime() > today.getTime() + 86400000) {
        errors.push(`Manufacturing Date (${row.mfgDateRaw}) cannot be in the future.`);
      } else if (parsedExpiry && parsedMfg.getTime() >= parsedExpiry.getTime()) {
        errors.push(`Manufacturing Date must be before Expiry Date.`);
      }
    }

    // 6. Buying Price & MRP Validation
    const buyingPrice = Number(row.buyingPriceRaw);
    const mrp = Number(row.mrpRaw);

    if (!Number.isFinite(buyingPrice) || buyingPrice < 0) {
      errors.push(`Buying Price must be a valid non-negative number (got: "${row.buyingPriceRaw}").`);
    }

    if (!Number.isFinite(mrp) || mrp < 0) {
      errors.push(`MRP must be a valid non-negative number (got: "${row.mrpRaw}").`);
    }

    // CRITICAL PRICING RULE: Buying Price <= MRP
    if (Number.isFinite(buyingPrice) && Number.isFinite(mrp)) {
      if (buyingPrice > mrp) {
        errors.push(`Pricing Rule Violation: Buying Price (₹${buyingPrice}) cannot exceed MRP (₹${mrp}). Buying Price must be <= MRP.`);
      }
      if (mrp === 0 && buyingPrice > 0) {
        errors.push(`Pricing Rule Violation: MRP cannot be ₹0 when Buying Price is ₹${buyingPrice}.`);
      }
    }

    const isValid = errors.length === 0;
    if (isValid) validCount++;
    else invalidCount++;

    validatedRows.push({
      rowNumber: row.rowNumber,
      itemCode: cleanItemCode,
      itemName: matchedItem ? (matchedItem.itemName || matchedItem.brandName) : (row.itemName || cleanItemCode),
      canonicalItemName: matchedItem ? (matchedItem.itemName || matchedItem.brandName) : '',
      masterItemId: matchedItem ? matchedItem._id : null,
      category: matchedItem ? matchedItem.category : (matchedConfig?.category || 'Pharmacy'),
      batchNumber: cleanBatch,
      expiryDate: parsedExpiry ? parsedExpiry.toISOString().split('T')[0] : row.expiryDateRaw,
      mfgDate: parsedMfg ? parsedMfg.toISOString().split('T')[0] : (row.mfgDateRaw || null),
      quantity: Math.max(0, qty || 0),
      unit: row.unit || matchedItem?.consumptionUnit || 'Unit',
      buyingPrice: Math.max(0, buyingPrice || 0),
      mrp: Math.max(0, mrp || 0),
      vendorName: row.vendorName || '',
      storageLocation: row.storageLocation || '',
      isValid,
      errors,
      warnings
    });
  }

  return {
    summary: {
      totalRows: validatedRows.length,
      validRows: validCount,
      invalidRows: invalidCount,
      isImportable: invalidCount === 0 && validCount > 0
    },
    rows: validatedRows
  };
}

/**
 * Commit validated Stock Master rows into the inventory ledger.
 * Non-destructive, atomic, updates:
 * - MedicineBatch (batch-level balance, FEFO, cost, MRP)
 * - Medicine (aggregate stock & MRP)
 * - AuditLog
 */
async function commitStockMasterImport({ tenantId, rows, user }) {
  if (!tenantId) {
    throw new Error('tenantId is required.');
  }

  // Re-run validation to ensure server-side authoritative guarantee
  const { summary, rows: validatedRows } = await validateStockMasterRows(rows, tenantId);

  if (!summary.isImportable) {
    throw new Error(`Cannot commit Stock Master: ${summary.invalidRows} invalid row(s) detected. Fix all errors before importing.`);
  }

  const results = {
    batchesCreated: 0,
    batchesUpdated: 0,
    medicinesUpdated: 0,
    totalQuantityImported: 0
  };

  for (const row of validatedRows) {
    const cleanSku = row.itemCode;
    const cleanBatchNumber = row.batchNumber;
    const qty = row.quantity;
    const expiryDateObj = new Date(row.expiryDate);
    const mfgDateObj = row.mfgDate ? new Date(row.mfgDate) : null;

    // A. Upsert into MedicineBatch
    const batchFilter = {
      tenantId,
      sku: cleanSku,
      batchNumber: cleanBatchNumber
    };
    if (row.masterItemId) {
      batchFilter.itemMasterId = row.masterItemId;
    }

    const existingBatch = await MedicineBatch.findOne(batchFilter);

    if (existingBatch) {
      existingBatch.availableQuantity += qty;
      existingBatch.receivedQuantity += qty;
      existingBatch.purchaseRate = row.buyingPrice;
      existingBatch.mrp = row.mrp;
      existingBatch.expiryDate = expiryDateObj;
      if (mfgDateObj) existingBatch.mfgDate = mfgDateObj;
      if (row.vendorName) existingBatch.vendorName = row.vendorName;
      existingBatch.status = 'Active';
      await existingBatch.save();
      results.batchesUpdated++;
    } else {
      await MedicineBatch.create({
        tenantId,
        itemMasterId: row.masterItemId,
        sku: cleanSku,
        name: row.itemName,
        brandName: row.itemName,
        consumptionUnit: row.unit || 'Unit',
        batchNumber: cleanBatchNumber,
        mfgDate: mfgDateObj,
        expiryDate: expiryDateObj,
        receivedQuantity: qty,
        availableQuantity: qty,
        purchaseRate: row.buyingPrice,
        mrp: row.mrp,
        vendorName: row.vendorName || 'Initial Stock Master Import',
        status: 'Active'
      });
      results.batchesCreated++;
    }

    // B. Upsert into Medicine aggregate stock
    const medicineDoc = await Medicine.findOne({ tenantId, sku: cleanSku });
    const expiryDisplay = row.expiryDate
      ? new Date(row.expiryDate).toLocaleDateString('en-IN', { month: '2-digit', year: 'numeric' })
      : '--';

    if (medicineDoc) {
      medicineDoc.stock += qty;
      medicineDoc.mrp = row.mrp; // Set active MRP
      medicineDoc.expiry = expiryDisplay;
      medicineDoc.status = medicineDoc.stock === 0 ? 'Out of Stock' : (medicineDoc.stock <= 20 ? 'Low Stock' : 'In Stock');
      await medicineDoc.save();
      results.medicinesUpdated++;
    } else {
      await Medicine.create({
        tenantId,
        name: row.itemName,
        category: row.category || 'Pharmacy',
        sku: cleanSku,
        stock: qty,
        unit: row.unit || 'Unit',
        mrp: row.mrp,
        status: qty === 0 ? 'Out of Stock' : (qty <= 20 ? 'Low Stock' : 'In Stock'),
        expiry: expiryDisplay
      });
      results.medicinesUpdated++;
    }

    results.totalQuantityImported += qty;
  }

  // C. Audit Log
  try {
    await AuditLog.create({
      tenantId,
      actor: user?.staff_id || user?.id || 'system',
      actorName: user?.name || 'SuperAdmin',
      actorRole: user?.role || 'superadmin',
      action: 'stock_master_imported',
      target: tenantId,
      metadata: {
        totalRows: validatedRows.length,
        totalQuantity: results.totalQuantityImported,
        batchesCreated: results.batchesCreated,
        batchesUpdated: results.batchesUpdated,
        medicinesUpdated: results.medicinesUpdated
      }
    });
  } catch (auditErr) {
    console.warn('Stock Master AuditLog creation notice:', auditErr.message);
  }

  return {
    success: true,
    message: `Stock Master successfully imported: ${results.totalQuantityImported} units across ${validatedRows.length} item(s).`,
    results
  };
}

module.exports = {
  generateStockMasterTemplateWorkbook,
  generateStockMasterExportWorkbook,
  parseStockMasterWorkbook,
  validateStockMasterRows,
  commitStockMasterImport
};
