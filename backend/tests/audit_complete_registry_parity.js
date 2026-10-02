/**
 * audit_complete_registry_parity.js
 * 
 * Strict end-to-end source parity audit across ALL categories in MASTER_SCHEMA_REGISTRY:
 * - Lab Operation (24 client fields)
 * - Pharmacy (25 client fields)
 * - Pathology (12 client fields)
 * - Service (8 client fields)
 * - Assets (15 client fields)
 * - Radiology (0 client fields - SOURCE-CONFIRMATION-REQUIRED)
 *
 * Compares registry fields directly against the client's Excel workbook:
 * C:\Users\lenovo\OneDrive\Documents\master structure.xlsx
 */

const fs = require('fs');
const path = require('path');
const xlsx = require('../../frontend/node_modules/xlsx');

const backendRegistryModule = require('../config/masterSchemaRegistry');
const backendRegistry = backendRegistryModule.MASTER_SCHEMA_REGISTRY;

const EXCEL_PATH = 'C:\\Users\\lenovo\\OneDrive\\Documents\\master structure.xlsx';
const FRONTEND_REGISTRY_PATH = path.resolve(__dirname, '../../frontend/src/config/masterSchemaRegistry.js');

console.log('================================================================');
console.log('  QUROXA COMPLETE MASTER SCHEMA REGISTRY SOURCE-PARITY AUDIT');
console.log('================================================================\n');

// 1. Read Excel workbook
const wb = xlsx.readFile(EXCEL_PATH);

const SHEET_MAP = {
  'Lab Operation': { sheetName: 'Lab Operation', expectedCount: 24 },
  'Pharmacy': { sheetName: 'Pharmacy', expectedCount: 25 },
  'Pathology': { sheetName: 'Pathology', expectedCount: 12 },
  'Service': { sheetName: 'Service', expectedCount: 8 },
  'Assets': { sheetName: 'Asset', expectedCount: 15 }
};

let auditReport = {
  totalCategories: 6,
  passedCategories: 0,
  details: {}
};

function readSheetHeaders(sheetName) {
  const ws = wb.Sheets[sheetName];
  if (!ws) return null;
  const ref = ws['!ref'];
  const range = xlsx.utils.decode_range(ref);
  const headers = [];
  for (let c = range.s.c; c <= range.e.c; c++) {
    const cellAddr = xlsx.utils.encode_cell({ r: 0, c });
    const colLetter = xlsx.utils.encode_col(c);
    const cell = ws[cellAddr];
    headers.push({
      col: colLetter,
      colIndex: c + 1,
      header: cell ? String(cell.v) : ''
    });
  }
  return headers;
}

// 2. Audit each category
for (const [categoryKey, meta] of Object.entries(SHEET_MAP)) {
  console.log(`\n----------------------------------------------------------------`);
  console.log(`AUDITING CATEGORY: ${categoryKey} (Excel Sheet: "${meta.sheetName}")`);
  console.log(`----------------------------------------------------------------`);

  const regCat = backendRegistry[categoryKey];
  if (!regCat) {
    console.error(`[FAIL] Category ${categoryKey} missing from backend registry!`);
    continue;
  }

  const excelHeaders = readSheetHeaders(meta.sheetName);
  if (!excelHeaders) {
    console.error(`[FAIL] Sheet "${meta.sheetName}" missing from Excel!`);
    continue;
  }

  const catDetails = {
    excelCount: excelHeaders.length,
    registryCount: regCat.sharedFields.length,
    expectedCount: meta.expectedCount,
    fieldMismatches: [],
    columnOrderMismatches: [],
    forbiddenFields: [],
    sampleFields: [],
    pricingFields: []
  };

  // Check counts
  if (excelHeaders.length !== meta.expectedCount || regCat.sharedFields.length !== meta.expectedCount) {
    catDetails.fieldMismatches.push(`Count mismatch: Excel has ${excelHeaders.length}, Registry has ${regCat.sharedFields.length}, expected ${meta.expectedCount}`);
  }

  // Check each column
  excelHeaders.forEach((eh, idx) => {
    const rf = regCat.sharedFields[idx];
    if (!rf) {
      catDetails.fieldMismatches.push(`Missing registry field at index ${idx} (Col ${eh.col}: "${eh.header}")`);
      return;
    }

    if (rf.excelColumn !== eh.col) {
      catDetails.columnOrderMismatches.push(`Col mismatch at index ${idx}: Excel has ${eh.col}, Registry has ${rf.excelColumn}`);
    }

    if (rf.clientHeader !== eh.header) {
      catDetails.fieldMismatches.push(`Header mismatch at index ${idx} (Col ${eh.col}): Excel "${eh.header}" vs Registry "${rf.clientHeader}"`);
    }

    // Check pricing scope
    if (rf.pricingScope === 'HOSPITAL_SPECIFIC') {
      catDetails.pricingFields.push({ col: rf.excelColumn, header: rf.clientHeader, key: rf.fieldKey });
    }

    // Check sample values
    if (rf.optionsSource === 'SAMPLE_VALUES_ONLY') {
      catDetails.sampleFields.push({ col: rf.excelColumn, header: rf.clientHeader, samples: rf.allowedValues });
    }
  });

  const categoryPassed = catDetails.fieldMismatches.length === 0 && catDetails.columnOrderMismatches.length === 0;
  console.log(`  Expected Count: ${meta.expectedCount} | Excel Count: ${excelHeaders.length} | Registry Count: ${regCat.sharedFields.length}`);
  console.log(`  Parity Status: ${categoryPassed ? 'PASSED (100% MATCH)' : 'FAILED'}`);

  if (categoryPassed) {
    auditReport.passedCategories++;
  } else {
    console.log('  Mismatches:', catDetails.fieldMismatches, catDetails.columnOrderMismatches);
  }

  auditReport.details[categoryKey] = catDetails;
}

// 3. Radiology Audit
console.log(`\n----------------------------------------------------------------`);
console.log(`AUDITING CATEGORY: Radiology (Product Requirement)`);
console.log(`----------------------------------------------------------------`);
const radCat = backendRegistry['Radiology'];
const radPassed = radCat &&
  radCat.status === 'SOURCE-CONFIRMATION-REQUIRED' &&
  radCat.sharedFields.length === 0 &&
  Object.keys(radCat.departments || {}).length === 0 &&
  !wb.SheetNames.includes('Radiology');

console.log(`  Sheet in Excel: ${wb.SheetNames.includes('Radiology') ? 'YES' : 'NONE (CONFIRMED ABSENT)'}`);
console.log(`  Registry Status: ${radCat ? radCat.status : 'MISSING'}`);
console.log(`  Registry Fields: ${radCat ? radCat.sharedFields.length : -1}`);
console.log(`  Registry Departments: ${radCat ? Object.keys(radCat.departments || {}).length : -1}`);
console.log(`  Parity Status: ${radPassed ? 'PASSED (STRICT PENDING SPECIFICATION)' : 'FAILED'}`);
if (radPassed) auditReport.passedCategories++;

// 4. Frontend vs Backend Registry Parity
console.log(`\n----------------------------------------------------------------`);
console.log(`AUDITING FRONTEND VS BACKEND REGISTRY PARITY`);
console.log(`----------------------------------------------------------------`);
const frontendCode = fs.readFileSync(FRONTEND_REGISTRY_PATH, 'utf8');

let frontendMatches = true;
for (const [catName, catConfig] of Object.entries(backendRegistry)) {
  if (!frontendCode.includes(`"${catName}": {`)) {
    console.error(`  [FAIL] Frontend missing category "${catName}"`);
    frontendMatches = false;
  }
  catConfig.sharedFields.forEach(f => {
    if (!frontendCode.includes(`clientHeader: "${f.clientHeader}"`)) {
      console.error(`  [FAIL] Frontend missing field "${f.clientHeader}" in ${catName}`);
      frontendMatches = false;
    }
  });
}
console.log(`  Frontend Registry Parity Status: ${frontendMatches ? 'PASSED (100% MATCH)' : 'FAILED'}`);

// Output summary
console.log(`\n================================================================`);
console.log(`  FINAL RESULT: ${auditReport.passedCategories}/6 CATEGORIES PASSED AUDIT`);
console.log(`================================================================\n`);
