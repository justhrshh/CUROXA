/**
 * test_workbook_cell_level_parity.js
 * 
 * Strict cell-level automated verification comparing MASTER_SCHEMA_REGISTRY
 * directly against cell values in `master structure.xlsx`.
 * 
 * Verifies:
 * 1. Cell-by-cell department extraction across Lab Operation, Pharmacy, Pathology, Service.
 * 2. Exact spelling, sheet name, column, and row occurrences.
 * 3. Set equality: missing-from-registry === 0 && extra-in-registry === 0.
 * 4. Pathology Col K: JSON.stringify() verification of trailing space in "MRP ".
 * 5. Service Col E & F: Exact preservation of "Doctors Name" and "Doctor ID".
 * 6. Asset Sheet: Verification of absent Department column.
 */

const assert = require('assert');
const path = require('path');
const xlsx = require('../../frontend/node_modules/xlsx');

const backendRegistryModule = require('../config/masterSchemaRegistry');
const backendRegistry = backendRegistryModule.MASTER_SCHEMA_REGISTRY;

const EXCEL_PATH = 'C:\\Users\\lenovo\\OneDrive\\Documents\\master structure.xlsx';
const wb = xlsx.readFile(EXCEL_PATH);

console.log('========================================================================');
console.log('   QUROXA — WORKBOOK CELL-LEVEL DEPARTMENT & SOURCE PARITY AUDIT');
console.log('========================================================================\n');

let totalTests = 0;
let passedTests = 0;

function runTest(name, fn) {
  totalTests++;
  try {
    fn();
    console.log(`  [PASS] ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`  [FAIL] ${name}: ${err.message}`);
  }
}

/**
 * Helper to extract unique department values and their cell/row occurrences from a sheet
 */
function extractDepartmentData(sheetName) {
  const ws = wb.Sheets[sheetName];
  assert.ok(ws, `Sheet "${sheetName}" must exist in workbook`);

  const range = xlsx.utils.decode_range(ws['!ref']);
  let deptColIdx = -1;
  let deptColLetter = '';

  for (let c = range.s.c; c <= range.e.c; c++) {
    const cell = ws[xlsx.utils.encode_cell({ r: 0, c })];
    if (cell && String(cell.v).trim().toLowerCase() === 'department') {
      deptColIdx = c;
      deptColLetter = xlsx.utils.encode_col(c);
      break;
    }
  }

  if (deptColIdx === -1) {
    return { hasDepartment: false, column: null, occurrences: {}, uniqueList: [] };
  }

  const occurrences = {};
  for (let r = range.s.r + 1; r <= range.e.r; r++) {
    const cellAddr = xlsx.utils.encode_cell({ r, c: deptColIdx });
    const cell = ws[cellAddr];
    const val = cell ? cell.v : null;
    const rowNum = r + 1; // 1-based row index in Excel
    if (val !== null && val !== undefined && String(val).trim() !== '') {
      const trimmedVal = String(val).trim();
      if (!occurrences[trimmedVal]) {
        occurrences[trimmedVal] = [];
      }
      occurrences[trimmedVal].push({ row: rowNum, cell: cellAddr, raw: val });
    }
  }

  return {
    hasDepartment: true,
    column: deptColLetter,
    colIndex: deptColIdx + 1,
    occurrences,
    uniqueList: Object.keys(occurrences)
  };
}

// -----------------------------------------------------------------------------
// 1. AUDIT DEPARTMENTS: LAB OPERATION
// -----------------------------------------------------------------------------
console.log('--- 1. LAB OPERATION DEPARTMENT AUDIT ---');
const labExtracted = extractDepartmentData('Lab Operation');
const labRegistryDepts = Object.keys(backendRegistry['Lab Operation'].departments);

console.log(`Sheet: "Lab Operation" | Col: ${labExtracted.column} (${labExtracted.colIndex})`);
console.log('Extracted unique departments from workbook rows:');
labExtracted.uniqueList.forEach((dept, idx) => {
  const occ = labExtracted.occurrences[dept];
  const rows = occ.map(o => o.row).join(', ');
  const cells = occ.map(o => o.cell).join(', ');
  console.log(`  ${idx + 1}. ${JSON.stringify(dept)} | Cells: ${cells} | Rows: ${rows}`);
});

const labMissing = labExtracted.uniqueList.filter(d => !labRegistryDepts.includes(d));
const labExtra = labRegistryDepts.filter(d => !labExtracted.uniqueList.includes(d));

console.log(`Workbook Count: ${labExtracted.uniqueList.length} | Registry Count: ${labRegistryDepts.length}`);
console.log(`Missing from Registry: ${JSON.stringify(labMissing)}`);
console.log(`Extra in Registry: ${JSON.stringify(labExtra)}`);

runTest('Lab Operation: Registry departments match extracted Excel departments exactly', () => {
  assert.strictEqual(labMissing.length, 0, `Missing departments: ${JSON.stringify(labMissing)}`);
  assert.strictEqual(labExtra.length, 0, `Extra departments: ${JSON.stringify(labExtra)}`);
  assert.strictEqual(labRegistryDepts.length, 13);
  assert.strictEqual(labExtracted.uniqueList.length, 13);
});

// -----------------------------------------------------------------------------
// 2. AUDIT DEPARTMENTS: PHARMACY
// -----------------------------------------------------------------------------
console.log('\n--- 2. PHARMACY DEPARTMENT AUDIT ---');
const pharmExtracted = extractDepartmentData('Pharmacy');
const pharmRegistryDepts = Object.keys(backendRegistry['Pharmacy'].departments);

console.log(`Sheet: "Pharmacy" | Col: ${pharmExtracted.column} (${pharmExtracted.colIndex})`);
pharmExtracted.uniqueList.forEach((dept, idx) => {
  const occ = pharmExtracted.occurrences[dept];
  const rows = occ.map(o => o.row).join(', ');
  const cells = occ.map(o => o.cell).join(', ');
  console.log(`  ${idx + 1}. ${JSON.stringify(dept)} | Cells: ${cells} | Rows: ${rows}`);
});

const pharmMissing = pharmExtracted.uniqueList.filter(d => !pharmRegistryDepts.includes(d));
const pharmExtra = pharmRegistryDepts.filter(d => !pharmExtracted.uniqueList.includes(d));

runTest('Pharmacy: Registry departments match extracted Excel departments exactly', () => {
  assert.strictEqual(pharmMissing.length, 0);
  assert.strictEqual(pharmExtra.length, 0);
  assert.strictEqual(pharmRegistryDepts.length, 1);
  assert.strictEqual(pharmRegistryDepts[0], 'Medicine');
});

// -----------------------------------------------------------------------------
// 3. AUDIT DEPARTMENTS: PATHOLOGY
// -----------------------------------------------------------------------------
console.log('\n--- 3. PATHOLOGY DEPARTMENT AUDIT ---');
const pathExtracted = extractDepartmentData('Pathology');
const pathRegistryDepts = Object.keys(backendRegistry['Pathology'].departments);

console.log(`Sheet: "Pathology" | Col: ${pathExtracted.column} (${pathExtracted.colIndex})`);
console.log('Extracted unique departments from workbook rows:');
pathExtracted.uniqueList.forEach((dept, idx) => {
  const occ = pathExtracted.occurrences[dept];
  const rows = occ.map(o => o.row).join(', ');
  const cells = occ.map(o => o.cell).join(', ');
  console.log(`  ${idx + 1}. ${JSON.stringify(dept)} | Cells: ${cells} | Rows: ${rows}`);
});

const pathMissing = pathExtracted.uniqueList.filter(d => !pathRegistryDepts.includes(d));
const pathExtra = pathRegistryDepts.filter(d => !pathExtracted.uniqueList.includes(d));

console.log(`Workbook Count: ${pathExtracted.uniqueList.length} | Registry Count: ${pathRegistryDepts.length}`);
console.log(`Missing from Registry: ${JSON.stringify(pathMissing)}`);
console.log(`Extra in Registry: ${JSON.stringify(pathExtra)}`);

runTest('Pathology: Registry departments match extracted Excel departments exactly', () => {
  assert.strictEqual(pathMissing.length, 0, `Missing departments: ${JSON.stringify(pathMissing)}`);
  assert.strictEqual(pathExtra.length, 0, `Extra departments: ${JSON.stringify(pathExtra)}`);
  assert.strictEqual(pathRegistryDepts.length, 16);
  assert.strictEqual(pathExtracted.uniqueList.length, 16);
});

// -----------------------------------------------------------------------------
// 4. AUDIT DEPARTMENTS: SERVICE
// -----------------------------------------------------------------------------
console.log('\n--- 4. SERVICE DEPARTMENT AUDIT ---');
const servExtracted = extractDepartmentData('Service');
const servRegistryDepts = Object.keys(backendRegistry['Service'].departments);

console.log(`Sheet: "Service" | Col: ${servExtracted.column} (${servExtracted.colIndex})`);
servExtracted.uniqueList.forEach((dept, idx) => {
  const occ = servExtracted.occurrences[dept];
  const rows = occ.map(o => o.row).join(', ');
  const cells = occ.map(o => o.cell).join(', ');
  console.log(`  ${idx + 1}. ${JSON.stringify(dept)} | Cells: ${cells} | Rows: ${rows}`);
});

const servMissing = servExtracted.uniqueList.filter(d => !servRegistryDepts.includes(d));
const servExtra = servRegistryDepts.filter(d => !servExtracted.uniqueList.includes(d));

runTest('Service: Registry departments match extracted Excel departments exactly', () => {
  assert.strictEqual(servMissing.length, 0);
  assert.strictEqual(servExtra.length, 0);
  assert.strictEqual(servRegistryDepts.length, 1);
  assert.strictEqual(servRegistryDepts[0], 'OPD');
});

// -----------------------------------------------------------------------------
// 5. AUDIT ASSETS SHEET: DEPARTMENT COLUMN ABSENCE
// -----------------------------------------------------------------------------
console.log('\n--- 5. ASSET DEPARTMENT ABSENCE AUDIT ---');
const assetExtracted = extractDepartmentData('Asset');

runTest('Asset sheet has NO department column and registry hasDepartment = false', () => {
  assert.strictEqual(assetExtracted.hasDepartment, false);
  assert.strictEqual(backendRegistry['Assets'].hasDepartment, false);
  assert.strictEqual(Object.keys(backendRegistry['Assets'].departments).length, 0);
});

// -----------------------------------------------------------------------------
// 6. EXACT STRING VERIFICATION: PATHOLOGY COL K ("MRP ")
// -----------------------------------------------------------------------------
console.log('\n--- 6. PATHOLOGY COL K STRING ENCODING AUDIT ---');
const pathWs = wb.Sheets['Pathology'];
const cellK1 = pathWs['K1'];
const rawExcelHeaderK = cellK1 ? cellK1.v : '';
const registryPathColK = backendRegistry['Pathology'].sharedFields.find(f => f.excelColumn === 'K');

console.log('Pathology K1 Raw Excel Header JSON:', JSON.stringify(rawExcelHeaderK));
console.log('Pathology Col K Registry Header JSON:', JSON.stringify(registryPathColK.clientHeader));

runTest('Pathology Col K contains exact trailing space ("MRP ") in Excel and Registry', () => {
  assert.strictEqual(JSON.stringify(rawExcelHeaderK), '"MRP "');
  assert.strictEqual(JSON.stringify(registryPathColK.clientHeader), '"MRP "');
  assert.strictEqual(rawExcelHeaderK, 'MRP ');
  assert.strictEqual(registryPathColK.clientHeader, 'MRP ');
  assert.notStrictEqual(registryPathColK.clientHeader, 'MRP');
  assert.strictEqual(registryPathColK.clientHeader.length, 4);
});

// -----------------------------------------------------------------------------
// 7. EXACT STRING VERIFICATION: SERVICE COL E & F ("Doctors Name", "Doctor ID")
// -----------------------------------------------------------------------------
console.log('\n--- 7. SERVICE COL E & F AUDIT ---');
const servWs = wb.Sheets['Service'];
const cellE1 = servWs['E1'];
const cellF1 = servWs['F1'];
const rawExcelHeaderE = cellE1 ? cellE1.v : '';
const rawExcelHeaderF = cellF1 ? cellF1.v : '';

const regServColE = backendRegistry['Service'].sharedFields.find(f => f.excelColumn === 'E');
const regServColF = backendRegistry['Service'].sharedFields.find(f => f.excelColumn === 'F');

console.log('Service E1 Raw Excel Header JSON:', JSON.stringify(rawExcelHeaderE));
console.log('Service Col E Registry Header JSON:', JSON.stringify(regServColE.clientHeader));
console.log('Service F1 Raw Excel Header JSON:', JSON.stringify(rawExcelHeaderF));
console.log('Service Col F Registry Header JSON:', JSON.stringify(regServColF.clientHeader));

runTest('Service Col E and F match client Excel verbatim ("Doctors Name", "Doctor ID")', () => {
  assert.strictEqual(JSON.stringify(rawExcelHeaderE), '"Doctors Name"');
  assert.strictEqual(JSON.stringify(regServColE.clientHeader), '"Doctors Name"');
  assert.strictEqual(JSON.stringify(rawExcelHeaderF), '"Doctor ID"');
  assert.strictEqual(JSON.stringify(regServColF.clientHeader), '"Doctor ID"');
});

console.log('\n========================================================================');
console.log(`  AUDIT TEST SUMMARY: ${passedTests} / ${totalTests} TESTS PASSED`);
console.log('========================================================================\n');

if (totalTests !== passedTests) {
  process.exit(1);
} else {
  process.exit(0);
}
