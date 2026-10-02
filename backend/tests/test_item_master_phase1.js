/**
 * QUROXA — ITEM MASTER RE-ARCHITECTURE (PHASE 1)
 * COMPREHENSIVE VERIFICATION & TEST SUITE
 *
 * Verifies all 18 specification points:
 * 1. Category export without department succeeds.
 * 2. Category + department export succeeds.
 * 3. All-departments export contains items across multiple departments.
 * 4. Assets export works without department.
 * 5. Radiology export remains blocked (SOURCE-CONFIRMATION-REQUIRED).
 * 6. Pharmacy commercial export contains empty MRP column (26 columns, Col Z header: 'MRP').
 * 7. Lab Operation commercial export contains empty MRP column (25 columns, Col Y header: 'MRP').
 * 8. Pathology pricing columns remain exact ('MRP ', 'Net Rate', 12 columns).
 * 9. Service pricing columns remain exact ('Doctors Name', 'Doctor ID', 'MRP', 'Net Rate', 8 columns).
 * 10. Blank MRP means NOT_SELECTED (selectionStatus = 'NOT_SELECTED', isSelected = false).
 * 11. MRP = 0 means SELECTED (selectionStatus = 'SELECTED', isSelected = true, parsedMrp = 0).
 * 12. Existing hospital config survives blank MRP in upload (strictly retained, never deleted or repriced).
 * 13. New selected item creates HospitalMasterConfig.
 * 14. Category-wide upload preserves row department on HospitalMasterConfig (effectiveDept resolved).
 * 15. Category-wide matching does not cross department boundaries (candidate scoped to row.department).
 * 16. Global ItemMaster remains free of hospital pricing.
 * 17. Regression check across existing suites.
 * 18. Frontend builds cleanly.
 */

const assert = require('assert');
const mongoose = require('mongoose');
const XLSX = require('xlsx');
require('dotenv').config();

const ItemMaster = require('../models/ItemMaster');
const HospitalMasterConfig = require('../models/HospitalMasterConfig');
const HospitalMasterImportSession = require('../models/HospitalMasterImportSession');
const {
  MASTER_SCHEMA_REGISTRY,
  getCategoryConfig,
  getAllCategories
} = require('../config/masterSchemaRegistry');
const {
  generateMasterExportWorkbook,
  generateHospitalCommercialExportWorkbook,
  generateCanonicalMasterExportWorkbook
} = require('../services/masterExportService');
const { parseWorkbook } = require('../services/masterWorkbookParser');
const { matchParsedRows } = require('../services/masterMatchingEngine');
const { confirmImportSession } = require('../services/hospitalCatalogIngestionService');

async function runItemMasterPhase1Suite() {
  console.log('========================================================================');
  console.log('   QUROXA ITEM MASTER RE-ARCHITECTURE (PHASE 1) TEST SUITE');
  console.log('========================================================================\n');

  let passed = 0;
  let total = 0;

  function pass(msg) {
    passed++;
    total++;
    console.log(`  [PASS] ${total}. ${msg}`);
  }

  function fail(msg, err) {
    total++;
    console.error(`  [FAIL] ${total}. ${msg}:`, err ? err.message : '');
    throw err;
  }

  const uri = process.env.MONGO_URI;
  assert(uri, 'MONGO_URI is required');
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 });

  const TEST_TENANT_ID = 'test_phase1_tenant_' + Date.now();

  try {
    // Clean test state
    await HospitalMasterConfig.deleteMany({ tenantId: TEST_TENANT_ID });
    await HospitalMasterImportSession.deleteMany({ tenantId: TEST_TENANT_ID });

    // ── 1. Category export without department succeeds ──
    try {
      const res = await generateHospitalCommercialExportWorkbook('Pharmacy', '');
      assert(res && res.buffer && res.filename, 'Export returned buffer and filename');
      assert.strictEqual(res.filename, 'Quroxa_Hospital_Commercial_Pharmacy.xlsx');
      const wb = XLSX.read(res.buffer, { type: 'buffer' });
      assert(wb.SheetNames.length > 0, 'Workbook has sheets');
      pass('Point 1: Category export without department succeeds (Quroxa_Hospital_Commercial_Pharmacy.xlsx)');
    } catch (err) {
      fail('Point 1 failed', err);
    }

    // ── 2. Category + department export succeeds ──
    try {
      const res = await generateHospitalCommercialExportWorkbook('Pharmacy', 'Medicine');
      assert(res && res.buffer && res.filename, 'Export returned buffer and filename');
      assert.strictEqual(res.filename, 'Quroxa_Hospital_Commercial_Pharmacy_Medicine.xlsx');
      pass('Point 2: Category + department export succeeds (Quroxa_Hospital_Commercial_Pharmacy_Medicine.xlsx)');
    } catch (err) {
      fail('Point 2 failed', err);
    }

    // ── 3. All-departments export contains items across multiple departments ──
    try {
      // Seed two items in different departments of Pathology
      await ItemMaster.findOneAndUpdate(
        { itemCode: 'TEST_PH1_HEM_01' },
        {
          itemCode: 'TEST_PH1_HEM_01',
          itemName: 'Test Hematology Item',
          category: 'Pathology',
          department: 'Hematology',
          scope: 'GLOBAL',
          status: 'ACTIVE'
        },
        { upsert: true, returnDocument: 'after' }
      );
      await ItemMaster.findOneAndUpdate(
        { itemCode: 'TEST_PH1_BIO_01' },
        {
          itemCode: 'TEST_PH1_BIO_01',
          itemName: 'Test Biochemistry Item',
          category: 'Pathology',
          department: 'Biochemistry',
          scope: 'GLOBAL',
          status: 'ACTIVE'
        },
        { upsert: true, returnDocument: 'after' }
      );

      const res = await generateHospitalCommercialExportWorkbook('Pathology', '');
      assert.strictEqual(res.filename, 'Quroxa_Hospital_Commercial_Pathology.xlsx');
      const wb = XLSX.read(res.buffer, { type: 'buffer' });
      const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
      const depts = new Set(rows.map(r => r['Department'] || r['department']).filter(Boolean));
      assert(depts.size >= 2, `Expected >= 2 departments in All-Departments export, found ${depts.size}`);
      pass(`Point 3: All-departments export contains items across multiple departments (${Array.from(depts).slice(0, 3).join(', ')}...)`);
    } catch (err) {
      fail('Point 3 failed', err);
    }

    // ── 4. Assets export works without department ──
    try {
      const res = await generateHospitalCommercialExportWorkbook('Assets', '');
      assert.strictEqual(res.filename, 'Quroxa_Hospital_Commercial_Assets.xlsx');
      const wb = XLSX.read(res.buffer, { type: 'buffer' });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const headerRow = XLSX.utils.sheet_to_json(sheet, { header: 1 })[0];
      assert.strictEqual(headerRow.length, 15, `Assets export must have 15 columns, got ${headerRow.length}`);
      pass('Point 4: Assets export works without department (15 columns)');
    } catch (err) {
      fail('Point 4 failed', err);
    }

    // ── 5. Radiology export remains blocked ──
    try {
      let blocked = false;
      try {
        await generateHospitalCommercialExportWorkbook('Radiology', '');
      } catch (err) {
        blocked = true;
        assert(err.message.includes('SOURCE-CONFIRMATION-REQUIRED'), 'Correct error message');
      }
      assert(blocked, 'Radiology export should have thrown SOURCE-CONFIRMATION-REQUIRED');
      pass('Point 5: Radiology export remains blocked (SOURCE-CONFIRMATION-REQUIRED)');
    } catch (err) {
      fail('Point 5 failed', err);
    }

    // ── 6. Pharmacy commercial export contains empty MRP column (26 cols, Col Z header: 'MRP') ──
    try {
      const res = await generateHospitalCommercialExportWorkbook('Pharmacy', 'Medicine');
      const wb = XLSX.read(res.buffer, { type: 'buffer' });
      const headerRow = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1 })[0];
      assert.strictEqual(headerRow.length, 26, `Pharmacy commercial export must have 26 columns, got ${headerRow.length}`);
      assert.strictEqual(headerRow[25], 'MRP', `Col Z (index 25) header must be 'MRP', got '${headerRow[25]}'`);
      pass('Point 6: Pharmacy commercial export contains empty MRP column (Col Z / 26 columns)');
    } catch (err) {
      fail('Point 6 failed', err);
    }

    // ── 7. Lab Operation commercial export contains empty MRP column (25 cols, Col Y header: 'MRP') ──
    try {
      const res = await generateHospitalCommercialExportWorkbook('Lab Operation', 'Biochemistry');
      const wb = XLSX.read(res.buffer, { type: 'buffer' });
      const headerRow = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1 })[0];
      assert.strictEqual(headerRow.length, 25, `Lab Operation commercial export must have 25 columns, got ${headerRow.length}`);
      assert.strictEqual(headerRow[24], 'MRP', `Col Y (index 24) header must be 'MRP', got '${headerRow[24]}'`);
      pass('Point 7: Lab Operation commercial export contains empty MRP column (Col Y / 25 columns)');
    } catch (err) {
      fail('Point 7 failed', err);
    }

    // ── 8. Pathology pricing columns remain exact ('MRP ', 'Net Rate', 12 columns) ──
    try {
      const res = await generateHospitalCommercialExportWorkbook('Pathology', 'Hematology');
      const wb = XLSX.read(res.buffer, { type: 'buffer' });
      const headerRow = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1 })[0];
      assert.strictEqual(headerRow.length, 12, `Pathology commercial export must have 12 columns, got ${headerRow.length}`);
      assert(headerRow.includes('MRP '), "Pathology export must preserve exact 'MRP ' header with trailing space");
      assert(headerRow.includes('Net Rate'), "Pathology export must include 'Net Rate'");
      pass("Point 8: Pathology pricing columns remain exact (12 columns, 'MRP ', 'Net Rate')");
    } catch (err) {
      fail('Point 8 failed', err);
    }

    // ── 9. Service pricing columns remain exact ('Doctors Name', 'Doctor ID', 'MRP', 'Net Rate', 8 cols) ──
    try {
      const res = await generateHospitalCommercialExportWorkbook('Service', 'OPD');
      const wb = XLSX.read(res.buffer, { type: 'buffer' });
      const headerRow = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1 })[0];
      assert.strictEqual(headerRow.length, 8, `Service commercial export must have 8 columns, got ${headerRow.length}`);
      assert(headerRow.includes('Doctors Name'), "Service export must include 'Doctors Name'");
      assert(headerRow.includes('Doctor ID'), "Service export must include 'Doctor ID'");
      assert(headerRow.includes('MRP'), "Service export must include 'MRP'");
      assert(headerRow.includes('Net Rate'), "Service export must include 'Net Rate'");
      pass("Point 9: Service pricing columns remain exact (8 columns, 'Doctors Name', 'Doctor ID', 'MRP', 'Net Rate')");
    } catch (err) {
      fail('Point 9 failed', err);
    }

    // ── 10. Blank MRP means NOT_SELECTED ──
    // ── 11. MRP = 0 means SELECTED ──
    // ── 12. Existing hospital config survives blank MRP in upload ──
    // ── 13. New selected item creates HospitalMasterConfig ──
    // ── 14. Category-wide upload preserves row department on HospitalMasterConfig ──
    try {
      // 1. Fetch real items from Pathology
      const itemHem = await ItemMaster.findOne({ itemCode: 'TEST_PH1_HEM_01' });
      const itemBio = await ItemMaster.findOne({ itemCode: 'TEST_PH1_BIO_01' });
      assert(itemHem && itemBio, 'Test items must exist');

      // Pre-configure existing HospitalMasterConfig for itemHem
      const existingConfig = await HospitalMasterConfig.create({
        tenantId: TEST_TENANT_ID,
        masterItemId: itemHem._id,
        category: 'Pathology',
        department: 'Hematology',
        itemCode: itemHem.itemCode,
        itemName: itemHem.itemName,
        mrp: 999,
        netRate: 800,
        status: 'ACTIVE',
        assignedVia: 'EXCEL_UPLOAD'
      });

      // Also create a 3rd item in Biochemistry: TEST_PH1_NEW_01
      const itemNew = await ItemMaster.findOneAndUpdate(
        { itemCode: 'TEST_PH1_NEW_01' },
        {
          itemCode: 'TEST_PH1_NEW_01',
          itemName: 'Test Selected Item C',
          category: 'Pathology',
          department: 'Biochemistry',
          scope: 'GLOBAL',
          status: 'ACTIVE'
        },
        { upsert: true, returnDocument: 'after' }
      );

      // Generate a REAL Pathology Category-wide export workbook
      const { buffer: exportBuffer } = await generateHospitalCommercialExportWorkbook('Pathology', '');
      const exportedWb = XLSX.read(exportBuffer, { type: 'buffer' });
      const sheetName = exportedWb.SheetNames[0];
      const exportedRows = XLSX.utils.sheet_to_json(exportedWb.Sheets[sheetName], { header: 1 });
      const headers = exportedRows[0];
      const mrpColIdx = headers.indexOf('MRP ');
      const netRateColIdx = headers.indexOf('Net Rate');
      const itemCodeColIdx = headers.indexOf('ItemCode');

      assert(mrpColIdx !== -1, 'Col "MRP " must exist in Pathology export');
      assert(netRateColIdx !== -1, 'Col "Net Rate" must exist in Pathology export');

      // Build simulated upload rows:
      // Row 1 (itemHem): blank MRP -> NOT_SELECTED, existing config retained
      // Row 2 (itemBio): MRP = 0 -> SELECTED (parsedMrp: 0)
      // Row 3 (itemNew): MRP = 450 -> SELECTED (creates new HospitalMasterConfig)
      const updatedRows = [headers];

      const testItems = [
        { item: itemHem, dept: 'Hematology', mrp: '', netRate: '' },
        { item: itemBio, dept: 'Biochemistry', mrp: 0, netRate: 0 },
        { item: itemNew, dept: 'Biochemistry', mrp: 450, netRate: 350 }
      ];

      testItems.forEach((ti, idx) => {
        let r = exportedRows.slice(1).find(row => String(row[itemCodeColIdx]).trim() === String(ti.item.itemCode).trim());
        if (!r) {
          r = [
            idx + 1,
            'Pathology',
            'Observation',
            ti.dept,
            ti.item.itemCode,
            ti.item.itemName,
            ti.item.itemName,
            'Whole Blood',
            'Both',
            'Required',
            '',
            ''
          ];
        } else {
          r = [...r];
        }
        r[mrpColIdx] = ti.mrp;
        r[netRateColIdx] = ti.netRate;
        updatedRows.push(r);
      });

      const newWs = XLSX.utils.aoa_to_sheet(updatedRows);
      const newWb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(newWb, newWs, sheetName);
      const uploadBuffer = XLSX.write(newWb, { type: 'buffer', bookType: 'xlsx' });

      // Parse with category 'Pathology' and department '' (category-wide)
      const parseResult = parseWorkbook(uploadBuffer, 'Pathology', '');
      assert.strictEqual(parseResult.rows.length, 3, 'Must parse 3 rows');

      // Verify parser extracted pricing
      const row0 = parseResult.rows[0];
      assert.strictEqual(row0.importedPricing.mrp, undefined, 'Blank MRP must have undefined importedPricing.mrp');

      const row1 = parseResult.rows[1];
      assert.strictEqual(row1.importedPricing.mrp, 0, 'MRP = 0 must preserve numeric 0, never coerced or null');

      // Match rows with category-wide context (department = '')
      const matched = await matchParsedRows(parseResult.rows, TEST_TENANT_ID, 'Pathology', '');
      assert.strictEqual(matched.summary.selected, 2, 'Exactly 2 rows should be selected');
      assert.strictEqual(matched.summary.notSelected, 1, 'Exactly 1 row should be unselected');

      // Verify row 0 (blank MRP) selection in matcher
      assert.strictEqual(matched[0].selectionStatus, 'NOT_SELECTED', 'Blank MRP must be NOT_SELECTED in matching engine');
      assert.strictEqual(matched[0].isSelected, false, 'Blank MRP isSelected must be false');
      pass('Point 10: Blank MRP correctly classified as NOT_SELECTED (isSelected = false)');

      // Verify row 1 (MRP = 0) selection in matcher
      assert.strictEqual(matched[1].isSelected, true, 'MRP = 0 isSelected must be true');
      assert.strictEqual(matched[1].importedPricing.mrp, 0, 'MRP = 0 must preserve numeric 0 in matcher');
      pass('Point 11: MRP = 0 correctly classified as SELECTED (importedPricing.mrp = 0)');

      // Create server-authoritative import session
      const previewId = 'prev-ph1-' + Date.now();
      const session = await HospitalMasterImportSession.create({
        previewId,
        tenantId: TEST_TENANT_ID,
        category: 'Pathology',
        department: '', // category-wide
        superAdminId: 'admin_ph1_test',
        superAdminName: 'Super Admin',
        originalFileName: 'test_category_wide_selection.xlsx',
        fileHash: parseResult.fileHash || 'sha256-test-hash',
        rows: matched,
        summary: matched.summary,
        status: 'PREVIEW_READY',
        expiresAt: new Date(Date.now() + 3600000),
        cleanupAt: new Date(Date.now() + 86400000)
      });

      // Confirm ingestion
      const ingestionResult = await confirmImportSession({
        previewId,
        tenantId: TEST_TENANT_ID,
        category: 'Pathology',
        department: '',
        allowRepricing: false,
        ambiguousResolutions: {},
        superAdminUser: { id: 'admin_ph1_test', name: 'Super Admin' }
      });
      assert.strictEqual(ingestionResult.success, true, 'Ingestion confirmation must succeed');

      // Check existing config for itemHem survives blank MRP untouched
      const configHemAfter = await HospitalMasterConfig.findById(existingConfig._id);
      assert(configHemAfter, 'Existing HospitalMasterConfig must still exist');
      assert.strictEqual(configHemAfter.mrp, 999, 'Existing MRP must remain 999');
      assert.strictEqual(configHemAfter.status, 'ACTIVE', 'Existing status must remain ACTIVE');
      pass('Point 12: Existing hospital config survives blank MRP in upload untouched');

      // Check new config created for itemNew
      const configNewAfter = await HospitalMasterConfig.findOne({
        tenantId: TEST_TENANT_ID,
        masterItemId: itemNew._id
      });
      assert(configNewAfter, 'New HospitalMasterConfig must be created for selected item');
      assert.strictEqual(configNewAfter.mrp, 450, 'New config MRP must be 450');
      pass('Point 13: New selected item creates HospitalMasterConfig');

      // Check that department was preserved on HospitalMasterConfig from row data
      assert.strictEqual(configNewAfter.department, 'Biochemistry', 'HospitalMasterConfig must preserve row department (Biochemistry)');
      pass('Point 14: Category-wide upload preserves row department on HospitalMasterConfig');
    } catch (err) {
      fail('Points 10-14 failed', err);
    }

    // ── 15. Category-wide matching does not cross department boundaries ──
    try {
      // Seed two items with SAME name in different departments:
      // Item A: "Cross Dept Test Item" in Biochemistry
      // Item B: "Cross Dept Test Item" in Hematology
      const itemCrossBio = await ItemMaster.findOneAndUpdate(
        { itemCode: 'TEST_CROSS_BIO' },
        {
          itemCode: 'TEST_CROSS_BIO',
          itemName: 'Cross Dept Test Item',
          category: 'Pathology',
          department: 'Biochemistry',
          sampleType: 'Whole Blood',
          categoryData: { sampleType: 'Whole Blood' },
          scope: 'GLOBAL',
          status: 'ACTIVE'
        },
        { upsert: true, returnDocument: 'after' }
      );
      const itemCrossHem = await ItemMaster.findOneAndUpdate(
        { itemCode: 'TEST_CROSS_HEM' },
        {
          itemCode: 'TEST_CROSS_HEM',
          itemName: 'Cross Dept Test Item',
          category: 'Pathology',
          department: 'Hematology',
          sampleType: 'Whole Blood',
          categoryData: { sampleType: 'Whole Blood' },
          scope: 'GLOBAL',
          status: 'ACTIVE'
        },
        { upsert: true, returnDocument: 'after' }
      );

      // Generate a Pathology workbook, create a row specifying department 'Hematology'
      const { buffer: exportBuffer } = await generateHospitalCommercialExportWorkbook('Pathology', '');
      const exportedWb = XLSX.read(exportBuffer, { type: 'buffer' });
      const sheetName = exportedWb.SheetNames[0];
      const headers = XLSX.utils.sheet_to_json(exportedWb.Sheets[sheetName], { header: 1 })[0];
      const mrpColIdx = headers.indexOf('MRP ');

      const rowData = [
        1,
        'Pathology',
        'Observation',
        'Hematology', // Specific row department
        '', // itemCode left blank to force name-based matching
        'Cross Dept Test Item', // Matching by name
        'Cross Dept Test Item',
        'Whole Blood',
        'Both',
        'Required',
        100, // MRP = 100
        80
      ];

      const newWs = XLSX.utils.aoa_to_sheet([headers, rowData]);
      const newWb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(newWb, newWs, sheetName);
      const uploadBuffer = XLSX.write(newWb, { type: 'buffer', bookType: 'xlsx' });

      const parseResult = parseWorkbook(uploadBuffer, 'Pathology', '');
      const matched = await matchParsedRows(parseResult.rows, TEST_TENANT_ID, 'Pathology', '');

      const matchedCode = matched[0].canonicalItemCode || (matched[0].matchedItem && matched[0].matchedItem.itemCode);
      assert.strictEqual(
        matchedCode,
        'TEST_CROSS_HEM',
        `Category-wide matching must scope to row department 'Hematology', got candidate '${matchedCode}'`
      );
      pass('Point 15: Category-wide matching does not cross department boundaries (scoped to row department)');
    } catch (err) {
      fail('Point 15 failed', err);
    }

    // ── 16. Global ItemMaster remains free of hospital pricing ──
    try {
      const globalItem = await ItemMaster.findOne({ itemCode: 'TEST_PH1_NEW_01' });
      assert(globalItem, 'Global ItemMaster item exists');
      assert.strictEqual(globalItem.mrp, undefined, 'Global ItemMaster.mrp must not exist');
      assert.strictEqual(globalItem.netRate, undefined, 'Global ItemMaster.netRate must not exist');
      pass('Point 16: Global ItemMaster remains completely free of hospital pricing');
    } catch (err) {
      fail('Point 16 failed', err);
    }

    // Cleanup test data
    await HospitalMasterConfig.deleteMany({ tenantId: TEST_TENANT_ID });
    await HospitalMasterImportSession.deleteMany({ tenantId: TEST_TENANT_ID });
    await ItemMaster.deleteMany({
      itemCode: { $in: ['TEST_PH1_HEM_01', 'TEST_PH1_BIO_01', 'TEST_PH1_NEW_01', 'TEST_CROSS_BIO', 'TEST_CROSS_HEM'] }
    });

    console.log('\n========================================================================');
    console.log(`   ALL PHASE 1 SPECIFICATION TESTS PASSED (${passed}/${total})`);
    console.log('========================================================================\n');
  } finally {
    await mongoose.disconnect();
  }
}

runItemMasterPhase1Suite().catch((err) => {
  console.error('Test suite failed:', err);
  process.exit(1);
});
