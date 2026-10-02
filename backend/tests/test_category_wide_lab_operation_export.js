const assert = require('assert');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const mongoose = require('mongoose');
const XLSX = require('xlsx');

const {
  generateHospitalCommercialExportWorkbook,
  generateCanonicalMasterExportWorkbook
} = require('../services/masterExportService');
const { MASTER_SCHEMA_REGISTRY } = require('../config/masterSchemaRegistry');

async function runCategoryWideLabOperationTests() {
  console.log('========================================================');
  console.log('   CATEGORY-WIDE LAB OPERATION EXPORT & AUDIT TEST');
  console.log('========================================================\n');

  await mongoose.connect(process.env.MONGO_URI);
  console.log('MongoDB connected.');

  const expected13LabDepts = [
    'Biochemistry',
    'Hematology',
    'Serology',
    'Molecular Biology',
    'Immunology',
    'Histopathology',
    'Microbiology',
    'Clinical Pathology',
    'Flowcytometry',
    'Cytology',
    'Immunohistochemistry',
    'Special Biochemistry',
    'Miscellaneous'
  ];

  let testsPassed = 0;
  let testsTotal = 0;

  function runTest(name, fn) {
    testsTotal++;
    try {
      fn();
      console.log(`  ✓ [PASS] ${name}`);
      testsPassed++;
    } catch (err) {
      console.error(`  ✗ [FAIL] ${name}`);
      console.error(`     Error: ${err.message}`);
    }
  }

  // ── TEST 1: CATEGORY-WIDE HOSPITAL COMMERCIAL EXPORT FOR LAB OPERATION ──
  console.log('\n--- 1. Lab Operation Category-Wide Commercial Export ---');
  const catWideResult = await generateHospitalCommercialExportWorkbook('Lab Operation', '');

  runTest('Buffer is generated and filename is correct', () => {
    assert(Buffer.isBuffer(catWideResult.buffer), 'Expected a valid buffer');
    assert.strictEqual(catWideResult.filename, 'Quroxa_Hospital_Commercial_Lab_Operation.xlsx');
    assert.strictEqual(catWideResult.exportType, 'HOSPITAL_COMMERCIAL');
  });

  const catWideWb = XLSX.read(catWideResult.buffer, { type: 'buffer' });
  const firstSheetName = catWideWb.SheetNames[0];
  const catWideSheet = catWideWb.Sheets[firstSheetName];
  const catWideJson = XLSX.utils.sheet_to_json(catWideSheet, { header: 1 });

  runTest('Headers count is 25 (24 canonical + 1 MRP at Col Y / index 24)', () => {
    const headers = catWideJson[0];
    assert.strictEqual(headers.length, 25, `Expected 25 columns, got ${headers.length}`);
    assert.strictEqual(headers[24], 'MRP', `Col Y (index 24) should be MRP, got ${headers[24]}`);
    assert.strictEqual(headers[0], 'S.No');
    assert.strictEqual(headers[1], 'Category');
    assert.strictEqual(headers[2], 'Department');
    assert.strictEqual(headers[3], 'itemTypeName');
    assert.strictEqual(headers[4], 'ItemCode');
    assert.strictEqual(headers[5], 'ItemName');
  });

  runTest('Contains records for all 13 Lab Operation departments', () => {
    const rows = catWideJson.slice(1);
    assert(rows.length >= 13, `Expected at least 13 rows, got ${rows.length}`);

    // Department is at index 2 (Column C)
    const deptsInExport = new Set();
    rows.forEach(r => {
      const dept = r[2];
      if (dept) deptsInExport.add(dept);
    });

    console.log(`     Found ${deptsInExport.size} unique departments in export:`, Array.from(deptsInExport).sort());

    expected13LabDepts.forEach(expectedDept => {
      assert(
        deptsInExport.has(expectedDept),
        `Export missing required Lab Operation department: "${expectedDept}"`
      );
    });
  });

  runTest('Commercial MRP column is present and initial values are empty strings', () => {
    const rows = catWideJson.slice(1);
    rows.forEach((r, idx) => {
      const mrpValue = r[24];
      assert(
        mrpValue === undefined || mrpValue === '' || mrpValue === null,
        `Row ${idx + 1} has unexpected pre-filled MRP: ${mrpValue}`
      );
    });
  });

  // ── TEST 2: SPECIFIC DEPARTMENT EXPORT FOR LAB OPERATION ──
  console.log('\n--- 2. Lab Operation Department-Specific Export (Biochemistry) ---');
  const deptSpecificResult = await generateHospitalCommercialExportWorkbook('Lab Operation', 'Biochemistry');

  runTest('Filename reflects Biochemistry department', () => {
    assert.strictEqual(deptSpecificResult.filename, 'Quroxa_Hospital_Commercial_Lab_Operation_Biochemistry.xlsx');
  });

  const deptSpecificWb = XLSX.read(deptSpecificResult.buffer, { type: 'buffer' });
  const deptSpecificSheet = deptSpecificWb.Sheets[deptSpecificWb.SheetNames[0]];
  const deptSpecificJson = XLSX.utils.sheet_to_json(deptSpecificSheet, { header: 1 });

  runTest('All rows strictly belong to Biochemistry', () => {
    const rows = deptSpecificJson.slice(1);
    assert(rows.length > 0, 'Expected at least 1 Biochemistry row');
    rows.forEach((r, idx) => {
      assert.strictEqual(r[2], 'Biochemistry', `Row ${idx + 1} department is "${r[2]}", expected "Biochemistry"`);
    });
  });

  // ── TEST 3: CANONICAL RAW MASTER EXPORT (24 columns, 0 pricing columns) ──
  console.log('\n--- 3. Canonical Global Master Export for Lab Operation ---');
  const canonicalResult = await generateCanonicalMasterExportWorkbook('Lab Operation', '');

  runTest('Canonical export has exactly 24 columns without commercial MRP', () => {
    const wb = XLSX.read(canonicalResult.buffer, { type: 'buffer' });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const json = XLSX.utils.sheet_to_json(sheet, { header: 1 });
    const headers = json[0];
    assert.strictEqual(headers.length, 24, `Expected 24 columns, got ${headers.length}`);
    assert(!headers.includes('MRP'), 'Canonical export must NOT include MRP column');
  });

  // ── TEST 4: OTHER CATEGORIES CATEGORY-WIDE EXPORT ──
  console.log('\n--- 4. Other Categories Category-Wide Commercial Exports ---');

  // Pharmacy: 25 canonical + 1 MRP = 26 cols
  const pharmResult = await generateHospitalCommercialExportWorkbook('Pharmacy', '');
  runTest('Pharmacy category-wide export has 26 columns with Col Z MRP', () => {
    const wb = XLSX.read(pharmResult.buffer, { type: 'buffer' });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const json = XLSX.utils.sheet_to_json(sheet, { header: 1 });
    const headers = json[0];
    assert.strictEqual(headers.length, 26, `Expected 26 columns, got ${headers.length}`);
    assert.strictEqual(headers[25], 'MRP');
  });

  // Pathology: 12 columns, Col K "MRP ", Col L "Net Rate"
  const pathResult = await generateHospitalCommercialExportWorkbook('Pathology', '');
  runTest('Pathology category-wide export has 12 columns with exact "MRP " and "Net Rate"', () => {
    const wb = XLSX.read(pathResult.buffer, { type: 'buffer' });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const json = XLSX.utils.sheet_to_json(sheet, { header: 1 });
    const headers = json[0];
    assert.strictEqual(headers.length, 12, `Expected 12 columns, got ${headers.length}`);
    assert.strictEqual(headers[10], 'MRP ');
    assert.strictEqual(headers[11], 'Net Rate');
  });

  // Service: 8 columns, Col G "MRP", Col H "Net Rate"
  const serviceResult = await generateHospitalCommercialExportWorkbook('Service', '');
  runTest('Service category-wide export has 8 columns with "MRP" and "Net Rate"', () => {
    const wb = XLSX.read(serviceResult.buffer, { type: 'buffer' });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const json = XLSX.utils.sheet_to_json(sheet, { header: 1 });
    const headers = json[0];
    assert.strictEqual(headers.length, 8, `Expected 8 columns, got ${headers.length}`);
    assert.strictEqual(headers[6], 'MRP');
    assert.strictEqual(headers[7], 'Net Rate');
  });

  // Assets: 15 columns, Col O "MRP", hasDepartment: false
  const assetsResult = await generateHospitalCommercialExportWorkbook('Assets', '');
  runTest('Assets category-wide export has 15 columns with Col O "MRP" and no department', () => {
    const wb = XLSX.read(assetsResult.buffer, { type: 'buffer' });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const json = XLSX.utils.sheet_to_json(sheet, { header: 1 });
    const headers = json[0];
    assert.strictEqual(headers.length, 15, `Expected 15 columns, got ${headers.length}`);
    assert.strictEqual(headers[14], 'MRP');
    assert(!headers.includes('Department'), 'Assets must not have Department column');
  });

  await mongoose.disconnect();
  console.log('\nMongoDB connection closed.');

  console.log(`\n========================================================`);
  console.log(`   TOTAL TESTS: ${testsTotal} | PASSED: ${testsPassed} | FAILED: ${testsTotal - testsPassed}`);
  console.log(`========================================================`);

  if (testsPassed !== testsTotal) {
    process.exit(1);
  }
}

runCategoryWideLabOperationTests().catch(err => {
  console.error('Test execution fatal error:', err);
  process.exit(1);
});
