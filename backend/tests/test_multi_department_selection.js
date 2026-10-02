const assert = require('assert');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const mongoose = require('mongoose');
const XLSX = require('xlsx');

const ItemMaster = require('../models/ItemMaster');
const {
  generateHospitalCommercialExportWorkbook,
  generateCanonicalMasterExportWorkbook
} = require('../services/masterExportService');

async function runMultiDepartmentTests() {
  console.log('========================================================================');
  console.log('   QUROXA — MULTI-DEPARTMENT SELECTION & EXPORT TEST SUITE');
  console.log('========================================================================\n');

  await mongoose.connect(process.env.MONGO_URI);
  console.log('MongoDB connected.');

  let passed = 0;
  let total = 0;

  function test(name, fn) {
    total++;
    try {
      fn();
      console.log(`  [PASS] ${total}. ${name}`);
      passed++;
    } catch (err) {
      console.error(`  [FAIL] ${total}. ${name}`);
      console.error(`     Error: ${err.message}`);
    }
  }

  // ── TEST 1: DB Query with 2 Departments (Biochemistry, Hematology) ──
  console.log('--- 1. Multi-Department Query Filtering ---');
  const depts2 = ['Biochemistry', 'Hematology'];
  const items2 = await ItemMaster.find({
    scope: 'GLOBAL',
    $or: [{ category: 'Lab Operation' }, { categoryType: 'Lab Operation' }],
    $and: [
      { $or: [{ department: { $in: depts2 } }, { departmentType: { $in: depts2 } }] }
    ]
  }).lean();

  test('Query with 2 departments returns only items from Biochemistry or Hematology', () => {
    assert(items2.length > 0, 'Expected at least 1 item returned');
    const returnedDepts = new Set(items2.map(i => i.department || i.departmentType));
    returnedDepts.forEach(d => {
      assert(depts2.includes(d), `Unexpected department returned: "${d}"`);
    });
    assert(returnedDepts.has('Biochemistry'), 'Expected Biochemistry items');
    assert(returnedDepts.has('Hematology'), 'Expected Hematology items');
  });

  // ── TEST 2: Multi-Department Commercial Export (2 Departments) ──
  console.log('\n--- 2. Commercial Export with 2 Departments ---');
  const export2 = await generateHospitalCommercialExportWorkbook('Lab Operation', 'Biochemistry,Hematology');

  test('Export filename reflects 2 departments', () => {
    assert.strictEqual(export2.filename, 'Quroxa_Hospital_Commercial_Lab_Operation_2_Departments.xlsx');
  });

  const wb2 = XLSX.read(export2.buffer, { type: 'buffer' });
  const sheet2 = wb2.Sheets[wb2.SheetNames[0]];
  const json2 = XLSX.utils.sheet_to_json(sheet2, { header: 1 });

  test('Workbook headers count is 25 with Column Y MRP', () => {
    const headers = json2[0];
    assert.strictEqual(headers.length, 25);
    assert.strictEqual(headers[24], 'MRP');
    assert.strictEqual(headers[2], 'Department');
  });

  test('Rows in 2-department export contain only Biochemistry and Hematology', () => {
    const rows = json2.slice(1);
    assert(rows.length >= 2, `Expected at least 2 rows, got ${rows.length}`);
    const foundDepts = new Set();
    rows.forEach(r => {
      const dept = r[2]; // Column C = Department
      foundDepts.add(dept);
      assert(['Biochemistry', 'Hematology'].includes(dept), `Row department "${dept}" not in selected list`);
    });
    assert(foundDepts.has('Biochemistry'), 'Expected Biochemistry rows in export');
    assert(foundDepts.has('Hematology'), 'Expected Hematology rows in export');
  });

  // ── TEST 3: Multi-Department Commercial Export (3 Departments) ──
  console.log('\n--- 3. Commercial Export with 3 Departments ---');
  const depts3Str = 'Biochemistry,Hematology,Microbiology';
  const export3 = await generateHospitalCommercialExportWorkbook('Lab Operation', depts3Str);

  test('Export filename reflects 3 departments', () => {
    assert.strictEqual(export3.filename, 'Quroxa_Hospital_Commercial_Lab_Operation_3_Departments.xlsx');
  });

  const wb3 = XLSX.read(export3.buffer, { type: 'buffer' });
  const sheet3 = wb3.Sheets[wb3.SheetNames[0]];
  const json3 = XLSX.utils.sheet_to_json(sheet3, { header: 1 });

  test('Rows in 3-department export contain only Biochemistry, Hematology, Microbiology', () => {
    const rows = json3.slice(1);
    const foundDepts = new Set();
    rows.forEach(r => {
      const dept = r[2];
      foundDepts.add(dept);
      assert(['Biochemistry', 'Hematology', 'Microbiology'].includes(dept), `Row department "${dept}" not in selected list`);
    });
    assert(foundDepts.has('Biochemistry'), 'Biochemistry present');
    assert(foundDepts.has('Hematology'), 'Hematology present');
    assert(foundDepts.has('Microbiology'), 'Microbiology present');
  });

  // ── TEST 4: Canonical Master Export with Multiple Departments ──
  console.log('\n--- 4. Canonical Master Export with Multiple Departments ---');
  const canonicalMulti = await generateCanonicalMasterExportWorkbook('Lab Operation', 'Biochemistry,Serology');

  test('Canonical multi-dept export has 24 columns without commercial MRP', () => {
    const wb = XLSX.read(canonicalMulti.buffer, { type: 'buffer' });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const json = XLSX.utils.sheet_to_json(sheet, { header: 1 });
    const headers = json[0];
    assert.strictEqual(headers.length, 24);
    assert(!headers.includes('MRP'));
    const rows = json.slice(1);
    const foundDepts = new Set(rows.map(r => r[2]));
    assert(foundDepts.has('Biochemistry'));
    assert(foundDepts.has('Serology'));
    assert(!foundDepts.has('Microbiology'));
  });

  // ── TEST 5: Single-Department and All-Department exports still function identically ──
  console.log('\n--- 5. Backward Compatibility (Single & All Departments) ---');
  const singleExport = await generateHospitalCommercialExportWorkbook('Lab Operation', 'Biochemistry');
  test('Single department export retains single dept filename', () => {
    assert.strictEqual(singleExport.filename, 'Quroxa_Hospital_Commercial_Lab_Operation_Biochemistry.xlsx');
  });

  const allExport = await generateHospitalCommercialExportWorkbook('Lab Operation', '');
  test('All department export retains category-wide filename', () => {
    assert.strictEqual(allExport.filename, 'Quroxa_Hospital_Commercial_Lab_Operation.xlsx');
  });

  await mongoose.disconnect();
  console.log('\nMongoDB connection closed.');

  console.log(`\n========================================================================`);
  console.log(`   MULTI-DEPARTMENT TEST RESULTS: ${passed} / ${total} PASSED`);
  console.log(`========================================================================`);

  if (passed !== total) {
    process.exit(1);
  }
}

runMultiDepartmentTests().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
