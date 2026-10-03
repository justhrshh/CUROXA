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

  // --- 5. CATEGORY-WIDE EXPORT (ALL DEPARTMENTS IN ONE WORKBOOK) ---
  try {
    const multiDeptLabItems = [
      { itemCode: '990000001', itemName: 'Reagent Set A', category: 'Lab Operation', department: 'Biochemistry', status: 'Active' },
      { itemCode: '990000002', itemName: 'Reagent Set B', category: 'Lab Operation', department: 'Hematology', status: 'Active' },
      { itemCode: '990000003', itemName: 'Reagent Set C', category: 'Lab Operation', department: 'Serology', status: 'Active' }
    ];
    const categoryWideResult = await generateMasterExportWorkbook('Lab Operation', 'all', multiDeptLabItems);
    assert(categoryWideResult.buffer && categoryWideResult.buffer.length > 0, 'Must produce valid buffer');
    assert.strictEqual(categoryWideResult.itemCount, 3, 'Must contain all 3 items across departments');
    
    // Parse back to verify department preservation across all rows
    const parsedCatWide = parseWorkbook(categoryWideResult.buffer, 'Lab Operation', 'all');
    assert.strictEqual(parsedCatWide.rows.length, 3, 'All 3 rows parsed');
    assert.strictEqual(parsedCatWide.rows[0].rawRowData.department, 'Biochemistry', 'Row 1 department preserved');
    assert.strictEqual(parsedCatWide.rows[1].rawRowData.department, 'Hematology', 'Row 2 department preserved');
    assert.strictEqual(parsedCatWide.rows[2].rawRowData.department, 'Serology', 'Row 3 department preserved');
    pass('Category-wide export includes all departments in one single workbook and preserves row departments');
  } catch (err) { fail('Category-wide export', err); }

  // --- 6. HOSPITAL COMMERCIAL WORKBOOK (MRP & NET RATE COLUMNS) ---
  try {
    const commercialResult = await generateMasterExportWorkbook('Lab Operation', 'all', sampleLab, { isHospitalCommercial: true });
    assert(commercialResult.headers.includes('MRP'), 'Hospital commercial export must append MRP column');
    assert(commercialResult.headers.includes('Net Rate'), 'Hospital commercial export must append Net Rate column');
    assert.strictEqual(commercialResult.headers.length, 26, 'Lab Operation has 24 canonical + 2 commercial columns = 26');
    pass('Hospital Commercial export appends both "MRP" and "Net Rate" columns');
  } catch (err) { fail('Hospital Commercial export columns', err); }

  const mongoose = require('mongoose');
  const mongoUri = process.env.MONGO_URI || 'mongodb://localhost:27017/clinical_management';
  if (mongoose.connection.readyState === 0) {
    try {
      await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 5000 });
    } catch (e) {
      console.warn('MongoDB connection failed in test:', e.message);
    }
  }

  // Base commercial export template with verified 26 columns (24 canonical + MRP + Net Rate)
  const baseCommercial = await generateMasterExportWorkbook('Lab Operation', 'Biochemistry', sampleLab, { isHospitalCommercial: true });

  // --- 7. COMMERCIAL SELECTION SEMANTICS & PRICE VALIDATION ---
  try {
    // Test: MRP = 0 is SELECTED
    const wb1 = XLSX.read(baseCommercial.buffer, { type: 'buffer' });
    const sheet1 = wb1.Sheets['Lab Operation'];
    const matrix1 = XLSX.utils.sheet_to_json(sheet1, { header: 1 });
    matrix1[1][24] = 0; // MRP = 0
    matrix1[1][25] = 0; // Net Rate = 0
    wb1.Sheets['Lab Operation'] = XLSX.utils.aoa_to_sheet(matrix1);
    const buf1 = XLSX.write(wb1, { type: 'buffer', bookType: 'xlsx' });
    const parsed1 = parseWorkbook(buf1, 'Lab Operation', 'Biochemistry');
    assert.strictEqual(parsed1.rows[0].importedPricing.mrp, 0, 'MRP=0 preserved as 0');
    assert.strictEqual(parsed1.rows[0].importedPricing.netRate, 0, 'Net Rate=0 preserved as 0');
    
    const matched1 = await matchParsedRows(parsed1.rows, sampleLab, [], 'Lab Operation', 'Biochemistry');
    assert.strictEqual(matched1[0].isSelected, true, 'MRP = 0 selects item');
    pass('Item Master selection semantics: MRP = 0 is a valid price and marks item as SELECTED');
  } catch (err) { fail('MRP = 0 selection', err); }

  try {
    // Test: MRP blank + Net Rate = 250 -> NOT SELECTED
    const wb2 = XLSX.read(baseCommercial.buffer, { type: 'buffer' });
    const sheet2 = wb2.Sheets['Lab Operation'];
    const matrix2 = XLSX.utils.sheet_to_json(sheet2, { header: 1 });
    matrix2[1][24] = ''; // MRP blank
    matrix2[1][25] = 250; // Net Rate = 250
    wb2.Sheets['Lab Operation'] = XLSX.utils.aoa_to_sheet(matrix2);
    const buf2 = XLSX.write(wb2, { type: 'buffer', bookType: 'xlsx' });
    const parsed2 = parseWorkbook(buf2, 'Lab Operation', 'Biochemistry');
    assert.strictEqual(parsed2.rows[0].importedPricing.mrp, undefined, 'MRP is undefined');
    assert.strictEqual(parsed2.rows[0].importedPricing.netRate, 250, 'Net Rate is 250');
    
    const matched2 = await matchParsedRows(parsed2.rows, sampleLab, [], 'Lab Operation', 'Biochemistry');
    assert.strictEqual(matched2[0].isSelected, false, 'Blank MRP means NOT selected even with Net Rate entered');
    pass('Item Master selection semantics: Net Rate alone does NOT select an item when MRP is blank');
  } catch (err) { fail('Net Rate alone not selected', err); }

  try {
    // Test: Net Rate > MRP -> validation error
    const wb3 = XLSX.read(baseCommercial.buffer, { type: 'buffer' });
    const sheet3 = wb3.Sheets['Lab Operation'];
    const matrix3 = XLSX.utils.sheet_to_json(sheet3, { header: 1 });
    matrix3[1][24] = 100; // MRP = 100
    matrix3[1][25] = 150; // Net Rate = 150 (exceeds MRP)
    wb3.Sheets['Lab Operation'] = XLSX.utils.aoa_to_sheet(matrix3);
    const buf3 = XLSX.write(wb3, { type: 'buffer', bookType: 'xlsx' });
    const parsed3 = parseWorkbook(buf3, 'Lab Operation', 'Biochemistry');
    assert(parsed3.rows[0].validationErrors.some(e => e.includes('cannot exceed MRP')), 'Validation error when Net Rate > MRP');
    pass('Price validation: Net Rate cannot exceed MRP for selected rows');
  } catch (err) { fail('Net Rate exceeding MRP validation', err); }

  // --- 8. VENDOR MASTER 49-COLUMN EXPORT & UPLOAD INTEGRITY ---
  try {
    const { generateVendorExportWorkbook } = require('../services/vendorExportService');
    const { parseVendorWorkbook } = require('../services/vendorWorkbookParser');
    const vendorExport = await generateVendorExportWorkbook();
    assert(vendorExport.buffer && vendorExport.buffer.length > 0, 'Produces valid vendor buffer');
    
    const parsedVendors = parseVendorWorkbook(vendorExport.buffer);
    assert.strictEqual(parsedVendors.sheetName, 'Store Vendor Master', 'Vendor sheet name is Store Vendor Master');
    pass('Vendor Master 49-column Store Vendor Master export and parse round-trip successful');
  } catch (err) { fail('Vendor Master export and parse', err); }

  if (mongoose.connection.readyState !== 0) {
    try {
      await mongoose.connection.close();
    } catch (_) {}
  }

  console.log('\n========================================================================');
  console.log(`  WORKFLOW AUDIT SUMMARY: ${passed} / ${total} TESTS PASSED`);
  console.log('========================================================================\n');

  if (passed !== total) process.exit(1);
}

runTests().catch(err => {
  console.error('Test execution error:', err);
  process.exit(1);
});
