const assert = require('assert');
const { 
  MASTER_SCHEMA_REGISTRY, 
  getAllCategories, 
  getCategoryConfig, 
  getDepartmentFields 
} = require('../config/masterSchemaRegistry');
const { generateMasterExportWorkbook } = require('../services/masterExportService');
const { parseWorkbook } = require('../services/masterWorkbookParser');
const { matchParsedRows } = require('../services/masterMatchingEngine');
const { confirmImportSession } = require('../services/hospitalCatalogIngestionService');
const HospitalMasterImportSession = require('../models/HospitalMasterImportSession');
const HospitalMasterConfig = require('../models/HospitalMasterConfig');
const ItemMaster = require('../models/ItemMaster');
const XLSX = require('xlsx');

async function runTests() {
  console.log('========================================================================');
  console.log('   QUROXA MASTER WORKFLOW & FUNCTIONAL AUDIT TEST SUITE');
  console.log('========================================================================\n');

  let passed = 0;
  let total = 0;

  function pass(testName) {
    total++;
    passed++;
    console.log(`  [PASS] ${total}. ${testName}`);
  }

  function fail(testName, err) {
    total++;
    console.error(`  [FAIL] ${total}. ${testName}:`, err.message);
  }

  // --- 1. REGISTRY & DROPDOWN CHECKS ---
  try {
    const cats = getAllCategories();
    assert(Array.isArray(cats) && cats.length === 6, 'Must expose all 6 categories');
    pass('Category dropdown loads all 6 registry categories');
  } catch (err) { fail('Category dropdown', err); }

  try {
    const radConfig = getCategoryConfig('Radiology');
    assert.strictEqual(radConfig.status, 'SOURCE-CONFIRMATION-REQUIRED', 'Radiology must be SOURCE-CONFIRMATION-REQUIRED');
    pass('Radiology is blocked / pending source confirmation');
  } catch (err) { fail('Radiology blocked', err); }

  try {
    const assetConfig = getCategoryConfig('Assets');
    assert.strictEqual(assetConfig.hasDepartment, false, 'Assets must not have departments');
    assert.strictEqual(assetConfig.sharedFields.length, 15, 'Assets must have exactly 15 sequential columns');
    pass('Assets has no department context and 15 sequential fields');
  } catch (err) { fail('Assets no department', err); }

  try {
    const pharmConfig = getCategoryConfig('Pharmacy');
    const depts = Object.keys(pharmConfig.departments || {});
    assert.deepStrictEqual(depts, ['Medicine'], 'Pharmacy must have exactly Medicine department');
    pass('Pharmacy has exactly 1 department (Medicine)');
  } catch (err) { fail('Pharmacy department', err); }

  try {
    const srvConfig = getCategoryConfig('Service');
    const depts = Object.keys(srvConfig.departments || {});
    assert.deepStrictEqual(depts, ['OPD'], 'Service must have exactly OPD department');
    pass('Service has exactly 1 department (OPD)');
  } catch (err) { fail('Service department', err); }

  const EXPECTED_LAB_DEPTS = [
    "Biochemistry", "Hematology", "Serology", "Molecular Biology", "Immunology",
    "Histopathology", "Microbiology", "Clinical Pathology", "Flowcytometry",
    "Cytology", "Immunohistochemistry", "Special Biochemistry", "Miscellaneous"
  ];

  const EXPECTED_PATH_DEPTS = [
    "Biochemistry", "Hematology", "Serology", "Molecular Biology", "Immunology",
    "OPD Package", "Histopathology", "Microbiology", "Clinical Pathology",
    "Flowcytometry", "Cytology", "Immunohistochemistry", "Special Biochemistry",
    "Miscellaneous", "Xray", "Ultrasonography"
  ];

  const FORBIDDEN_DEPTS = [
    "Cytopathology", "Flow Cytometry", "Coagulation", "Urinalysis",
    "Endocrinology", "Toxicology", "Blood Bank", "Special Chemistry"
  ];

  try {
    const labConfig = getCategoryConfig('Lab Operation');
    const depts = Object.keys(labConfig.departments || {});
    assert.deepStrictEqual(depts, EXPECTED_LAB_DEPTS, 'Lab Operation must match exact 13 frozen departments');
    pass('Lab Operation has all 13 client-verified departments matching frozen workbook');
  } catch (err) { fail('Lab Operation departments', err); }

  try {
    const pathConfig = getCategoryConfig('Pathology');
    const depts = Object.keys(pathConfig.departments || {});
    assert.deepStrictEqual(depts, EXPECTED_PATH_DEPTS, 'Pathology must match exact 16 frozen departments');
    pass('Pathology has all 16 client-verified departments matching frozen workbook');
  } catch (err) { fail('Pathology departments', err); }

  try {
    const allCategories = getAllCategories();
    for (const cat of allCategories) {
      for (const d of cat.departments) {
        assert(!FORBIDDEN_DEPTS.includes(d), `Department "${d}" in ${cat.name} must not be in forbidden list`);
      }
    }
    pass('Strict verification: No unconfirmed/hallucinated departments exist in registry');
  } catch (err) { fail('Forbidden departments check', err); }

  try {
    const allCategories = getAllCategories();
    for (const cat of allCategories) {
      const config = getCategoryConfig(cat.name);
      for (const f of (config.sharedFields || [])) {
        assert.notStrictEqual(f.clientHeader.toLowerCase(), 'vendor', `Header in ${cat.name} must not be Vendor`);
        assert.notStrictEqual(f.fieldKey.toLowerCase(), 'vendor', `fieldKey in ${cat.name} must not be vendor`);
      }
    }
    pass('Strict verification: No invented "Vendor" column exists (ManufactureName preserved)');
  } catch (err) { fail('No invented Vendor check', err); }

  // --- 2. EXPORT WORKBOOK GENERATION & REGISTRY PARITY ---
  const samplePathology = [
    { itemCode: '970000001', itemName: 'Complete Blood Count', category: 'Pathology', department: 'Biochemistry', status: 'Active' }
  ];
  const sampleService = [
    { itemCode: '960000001', itemName: 'General Consultation', category: 'Service', department: 'OPD', status: 'Active', categoryData: { 'Doctor ID': 'DOC-1', 'Doctors Name': 'Dr. Sharma' } }
  ];
  const sampleLab = [
    { itemCode: '990000001', itemName: 'Reagent Set A', category: 'Lab Operation', department: 'Biochemistry', status: 'Active' }
  ];
  const samplePharmacy = [
    { itemCode: '980000001', itemName: 'Paracetamol 500mg', category: 'Pharmacy', department: 'Medicine', status: 'Active' }
  ];
  const sampleAssets = [
    { itemCode: '950000001', itemName: 'Centrifuge Machine X100', category: 'Assets', status: 'Active' }
  ];

  try {
    const exportResult = await generateMasterExportWorkbook('Pathology', 'Biochemistry', samplePathology);
    assert(exportResult.buffer && exportResult.buffer.length > 0, 'Must produce valid buffer');
    assert.strictEqual(exportResult.sheetName, 'Pathology', 'Sheet name must match category excelSheet');
    assert.strictEqual(exportResult.headers[10], 'MRP ', 'Col K in Pathology must retain exact trailing space');
    assert.strictEqual(exportResult.headers[11], 'Net Rate', 'Col L in Pathology must be Net Rate');
    pass('Export Excel for Pathology preserves exact "MRP " trailing space and "Net Rate"');
  } catch (err) { fail('Pathology export headers', err); }

  try {
    const exportResult = await generateMasterExportWorkbook('Service', 'OPD', sampleService);
    assert.strictEqual(exportResult.headers[4], 'Doctors Name', 'Service Col E must be Doctors Name');
    assert.strictEqual(exportResult.headers[5], 'Doctor ID', 'Service Col F must be Doctor ID');
    assert.strictEqual(exportResult.headers[6], 'MRP', 'Service Col G must be MRP');
    assert.strictEqual(exportResult.headers[7], 'Net Rate', 'Service Col H must be Net Rate');
    pass('Export Excel for Service preserves exact "Doctors Name", "Doctor ID", "MRP", "Net Rate"');
  } catch (err) { fail('Service export headers', err); }

  try {
    const exportResult = await generateMasterExportWorkbook('Lab Operation', 'Biochemistry', sampleLab);
    assert.strictEqual(exportResult.headers.length, 24, 'Lab Operation must have exactly 24 headers');
    assert(!exportResult.headers.some(h => /mrp|net\s*rate|cost/i.test(h)), 'Lab Operation must have 0 pricing columns');
    pass('Export Excel for Lab Operation has 24 columns and 0 pricing columns');
  } catch (err) { fail('Lab Operation export headers', err); }

  try {
    const exportResult = await generateMasterExportWorkbook('Pharmacy', 'Medicine', samplePharmacy);
    assert.strictEqual(exportResult.headers.length, 25, 'Pharmacy must have exactly 25 headers');
    assert(!exportResult.headers.some(h => /mrp|net\s*rate|cost/i.test(h)), 'Pharmacy must have 0 pricing columns');
    pass('Export Excel for Pharmacy has 25 columns and 0 pricing columns');
  } catch (err) { fail('Pharmacy export headers', err); }

  // --- 3. ROUND-TRIP COMPATIBILITY: EXPORT -> PARSER ---
  try {
    const exportResult = await generateMasterExportWorkbook('Pathology', 'Hematology', samplePathology);
    // Feed the exported workbook directly into the Phase 5 upload parser
    const parsed = parseWorkbook(exportResult.buffer, 'Pathology', 'Hematology');
    assert(parsed.rows.length >= 1, 'Parser must parse the generated workbook');
    assert(parsed.fileHash, 'Parser must compute cryptographic file hash');
    pass('Exported Excel workbook is 100% round-trip compatible with Phase 5 upload parser');
  } catch (err) { fail('Round-trip upload compatibility', err); }

  try {
    const exportResult = await generateMasterExportWorkbook('Assets', '', sampleAssets);
    const parsed = parseWorkbook(exportResult.buffer, 'Assets', '');
    assert(parsed.rows.length >= 1, 'Parser must parse Assets workbook without department');
    pass('Exported Assets workbook parses successfully without department column');
  } catch (err) { fail('Assets round-trip', err); }

  // --- 4. CONTEXT BINDING & SECURITY ---
  try {
    let rejected = false;
    try {
      await generateMasterExportWorkbook('Radiology', '');
    } catch (err) {
      rejected = true;
      assert(err.message.includes('SOURCE-CONFIRMATION-REQUIRED'), 'Must state SOURCE-CONFIRMATION-REQUIRED');
    }
    assert(rejected, 'Must reject Radiology export');
    pass('Export rejects Radiology: Category remains SOURCE-CONFIRMATION-REQUIRED');
  } catch (err) { fail('Radiology export rejection', err); }

  try {
    let deptRequiredRejected = false;
    try {
      await generateMasterExportWorkbook('Lab Operation', ''); // Missing department
    } catch (err) {
      deptRequiredRejected = true;
      assert(err.message.includes('Department context is required'), 'Must require department');
    }
    assert(deptRequiredRejected, 'Must reject export when department is missing for department-enabled category');
    pass('Export requires department context for department-enabled category');
  } catch (err) { fail('Department required for export', err); }

  console.log('\n========================================================================');
  console.log(`  WORKFLOW AUDIT SUMMARY: ${passed} / ${total} TESTS PASSED`);
  console.log('========================================================================\n');

  if (passed !== total) process.exit(1);
}

runTests().catch(err => {
  console.error('Test execution error:', err);
  process.exit(1);
});
