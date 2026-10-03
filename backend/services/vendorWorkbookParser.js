const XLSX = require('xlsx');
const crypto = require('crypto');
const GlobalVendor = require('../models/GlobalVendor');
const HospitalVendorAssociation = require('../models/HospitalVendorAssociation');
const VendorRequest = require('../models/VendorRequest');
const SuperAdminHospital = require('../models/SuperAdminHospital');
const { VENDOR_FIELDS } = require('../config/vendorSchemaRegistry');
const { getNextVendorRequestNo } = require('../utils/vendorCodeGenerator');

function normalizeStr(val) {
  return String(val || '').trim();
}

function normalizeKey(val) {
  return String(val || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * Parse uploaded Vendor Master Excel file against the 49-column Store Vendor Master schema.
 */
function parseVendorWorkbook(fileBuffer) {
  if (!fileBuffer || !fileBuffer.length) {
    throw new Error('Empty file buffer provided.');
  }

  const fileHash = crypto.createHash('sha256').update(fileBuffer).digest('hex');
  const workbook = XLSX.read(fileBuffer, { type: 'buffer', cellDates: false });
  if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
    throw new Error('Invalid Excel file: No worksheets found.');
  }

  let sheetName = workbook.SheetNames.find(s => s.trim().toLowerCase() === 'store vendor master'.toLowerCase());
  if (!sheetName) sheetName = workbook.SheetNames[0];

  const sheet = workbook.Sheets[sheetName];
  if (!sheet) {
    throw new Error('Target worksheet could not be read.');
  }

  const matrix = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', blankrows: false });
  if (matrix.length < 1) {
    throw new Error('The uploaded worksheet is empty.');
  }

  const rawHeaders = (matrix[0] || []).map(h => String(h).trim());
  const expectedHeaders = VENDOR_FIELDS.map(f => f.clientHeader);

  // Validate headers - check if primary vendor columns are present
  const headerMap = new Map();
  rawHeaders.forEach((h, idx) => {
    if (h) headerMap.set(normalizeKey(h), idx);
  });

  // Ensure key required headers exist (SupplierName at minimum)
  const supplierNameIdx = headerMap.get(normalizeKey('SupplierName')) ?? headerMap.get(normalizeKey('VendorName')) ?? headerMap.get(normalizeKey('Supplier Name'));
  if (supplierNameIdx === undefined) {
    throw new Error('Header validation failed: "SupplierName" column not found. Expected 49-column Store Vendor Master format.');
  }

  const parsedRows = [];
  for (let r = 1; r < matrix.length; r++) {
    const rowCells = matrix[r];
    if (!rowCells || rowCells.length === 0 || rowCells.every(c => c === '' || c === null || c === undefined)) {
      continue;
    }

    const rowNumber = r + 1;
    const rawRowData = {};

    VENDOR_FIELDS.forEach((field, defaultIdx) => {
      const matchedIdx = headerMap.get(normalizeKey(field.clientHeader)) ?? defaultIdx;
      let val = rowCells[matchedIdx];
      if (val === undefined || val === null) val = '';
      rawRowData[field.fieldKey] = typeof val === 'string' ? val.trim() : val;
    });

    const supplierName = normalizeStr(rawRowData.supplierName);
    if (!supplierName) {
      continue; // Skip rows without supplier name
    }

    const sourceRowHash = crypto.createHash('sha256').update(JSON.stringify(rawRowData)).digest('hex');

    parsedRows.push({
      rowNumber,
      sourceRowHash,
      supplierName,
      rawRowData
    });
  }

  return {
    sheetName,
    fileHash,
    totalRows: parsedRows.length,
    rows: parsedRows
  };
}

/**
 * Match parsed vendor rows against canonical Global Vendors and existing hospital associations.
 */
async function matchAndProcessVendorRows(parsedRows, tenantId) {
  const allGlobalVendors = await GlobalVendor.find().lean();
  const existingAssocs = await HospitalVendorAssociation.find({ tenantId, status: 'ACTIVE' }).lean();
  const associatedVendorIdSet = new Set(existingAssocs.map(a => a.vendorId.toString()));

  const results = [];
  let matchedCount = 0;
  let unmatchedCount = 0;
  let alreadyAssociatedCount = 0;

  for (const row of parsedRows) {
    const data = row.rawRowData;
    const nameNorm = normalizeKey(data.supplierName);
    const gstNorm = normalizeStr(data.gstNo).toUpperCase();
    const panNorm = normalizeStr(data.panCardNo).toUpperCase();
    const emailNorm = normalizeStr(data.emailId).toLowerCase();
    const phoneNorm = normalizeKey(data.primaryContactPersonMobileNo || data.officeTelephoneNo);
    const codeNorm = normalizeStr(data.supplierCode).toUpperCase();

    // Matching cascade:
    // 1. Code match
    // 2. GST match
    // 3. PAN match
    // 4. Exact Name match
    // 5. Email match
    let matchedVendor = null;
    let matchField = '';

    if (codeNorm) {
      matchedVendor = allGlobalVendors.find(g => normalizeStr(g.supplierCode).toUpperCase() === codeNorm);
      if (matchedVendor) matchField = 'supplierCode';
    }
    if (!matchedVendor && gstNorm) {
      matchedVendor = allGlobalVendors.find(g => normalizeStr(g.gstNo).toUpperCase() === gstNorm);
      if (matchedVendor) matchField = 'gstNo';
    }
    if (!matchedVendor && panNorm) {
      matchedVendor = allGlobalVendors.find(g => normalizeStr(g.panCardNo).toUpperCase() === panNorm);
      if (matchedVendor) matchField = 'panCardNo';
    }
    if (!matchedVendor && nameNorm) {
      matchedVendor = allGlobalVendors.find(g => normalizeKey(g.supplierName) === nameNorm);
      if (matchedVendor) matchField = 'supplierName';
    }
    if (!matchedVendor && emailNorm) {
      matchedVendor = allGlobalVendors.find(g => normalizeStr(g.emailId).toLowerCase() === emailNorm);
      if (matchedVendor) matchField = 'emailId';
    }

    if (matchedVendor) {
      matchedCount++;
      const isAlreadyAssociated = associatedVendorIdSet.has(matchedVendor._id.toString());
      if (isAlreadyAssociated) alreadyAssociatedCount++;

      results.push({
        rowNumber: row.rowNumber,
        sourceRowHash: row.sourceRowHash,
        supplierName: data.supplierName,
        matchType: 'MATCHED_GLOBAL',
        matchField,
        globalVendorId: matchedVendor._id,
        matchedSupplierCode: matchedVendor.supplierCode,
        matchedSupplierName: matchedVendor.supplierName,
        isAlreadyAssociated,
        status: isAlreadyAssociated ? 'ALREADY_ASSOCIATED' : 'READY_TO_ASSOCIATE',
        vendorData: data
      });
    } else {
      unmatchedCount++;
      results.push({
        rowNumber: row.rowNumber,
        sourceRowHash: row.sourceRowHash,
        supplierName: data.supplierName,
        matchType: 'UNMATCHED_NEW_REQUEST',
        status: 'ROUTES_TO_SUPERADMIN_APPROVAL',
        vendorData: data
      });
    }
  }

  return {
    summary: {
      totalRows: results.length,
      matchedCount,
      unmatchedCount,
      alreadyAssociatedCount,
      newAssociationsToCreate: matchedCount - alreadyAssociatedCount
    },
    rows: results
  };
}

/**
 * Confirm and ingest parsed vendor upload:
 * - Matched vendors: Additively associate with hospital (preserves existing associations).
 * - Unmatched vendors: Creates VendorRequest with status 'PENDING' for SuperAdmin approval.
 */
async function commitVendorImport({ tenantId, rows, superAdminUser }) {
  if (!tenantId) {
    throw new Error('tenantId is required.');
  }

  let hospitalName = tenantId;
  const hosp = await SuperAdminHospital.findOne({ code: tenantId }).lean();
  if (hosp && hosp.name) hospitalName = hosp.name;

  let associatedCount = 0;
  let requestsCreatedCount = 0;
  const auditDetails = [];

  for (const item of rows) {
    if (item.matchType === 'MATCHED_GLOBAL' && item.globalVendorId) {
      // Additive association
      await HospitalVendorAssociation.findOneAndUpdate(
        { tenantId, vendorId: item.globalVendorId },
        {
          $setOnInsert: {
            tenantId,
            vendorId: item.globalVendorId,
            status: 'ACTIVE',
            associatedBy: superAdminUser?.name || 'Super Admin',
            associatedAt: new Date()
          }
        },
        { upsert: true, new: true }
      );
      associatedCount++;
      auditDetails.push(`Associated global vendor [${item.matchedSupplierCode}] ${item.matchedSupplierName}`);
    } else if (item.matchType === 'UNMATCHED_NEW_REQUEST') {
      // Create Pending Vendor Request
      const requestNo = await getNextVendorRequestNo();
      await VendorRequest.create({
        requestNo,
        tenantId,
        hospitalName,
        vendorData: item.vendorData,
        status: 'PENDING',
        submittedBy: superAdminUser?.name || 'Super Admin Upload Center',
        submittedByStaffId: superAdminUser?.staff_id || superAdminUser?.id || 'superadmin'
      });
      requestsCreatedCount++;
      auditDetails.push(`Routed unmatched vendor "${item.supplierName}" to SuperAdmin approval as ${requestNo}`);
    }
  }

  return {
    success: true,
    tenantId,
    hospitalName,
    associatedCount,
    requestsCreatedCount,
    auditDetails
  };
}

module.exports = {
  parseVendorWorkbook,
  matchAndProcessVendorRows,
  commitVendorImport
};
