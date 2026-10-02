/**
 * QUROXA — PHASE 1 FOCUSED REGRESSION TEST: MRP-ONLY SELECTION SEMANTICS
 *
 * Verifies that hospital Item Master selection is driven ONLY by MRP:
 *
 * Required test matrix:
 * Case 1: MRP=350, NetRate=250  → SELECTED
 * Case 2: MRP blank, NetRate=250 → NOT_SELECTED (Net Rate must NEVER independently select)
 * Case 3: MRP blank, NetRate=blank → NOT_SELECTED
 * Case 4: MRP=0, NetRate=0     → SELECTED (Zero-price preservation)
 * Case 5: MRP=0, NetRate=250   → SELECTED (Zero MRP with NetRate)
 *
 * Tested across categories where Net Rate exists:
 * - Pathology (Columns: 'MRP ', 'Net Rate')
 * - Service   (Columns: 'MRP', 'Net Rate')
 *
 * Also verified for:
 * - Pharmacy (MRP entered → SELECTED, MRP blank → NOT_SELECTED)
 * - Lab Operation (MRP entered → SELECTED, MRP blank → NOT_SELECTED)
 *
 * End-to-End Ingestion:
 * - MRP blank, NetRate=250 → 0 configs created, skippedCount incremented.
 * - MRP=0, NetRate=250 → Config created with mrp=0, netRate=250.
 */

const assert = require('assert');
const mongoose = require('mongoose');
const XLSX = require('xlsx');
require('dotenv').config();

const ItemMaster = require('../models/ItemMaster');
const HospitalMasterConfig = require('../models/HospitalMasterConfig');
const HospitalMasterImportSession = require('../models/HospitalMasterImportSession');
const { generateHospitalCommercialExportWorkbook } = require('../services/masterExportService');
const { parseWorkbook } = require('../services/masterWorkbookParser');
const { matchParsedRows } = require('../services/masterMatchingEngine');
const { confirmImportSession } = require('../services/hospitalCatalogIngestionService');

async function runMrpOnlySelectionSemanticsTests() {
  console.log('========================================================================');
  console.log('   QUROXA — FOCUSED REGRESSION: MRP-ONLY SELECTION SEMANTICS');
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

  const TEST_TENANT_ID = 'test_mrp_only_tenant_' + Date.now();

  try {
    // Clean test state
    await HospitalMasterConfig.deleteMany({ tenantId: TEST_TENANT_ID });
    await HospitalMasterImportSession.deleteMany({ tenantId: TEST_TENANT_ID });

    // ─────────────────────────────────────────────────────────────────────────
    // SECTION 1: PATHOLOGY (Net Rate exists in schema: 'MRP ', 'Net Rate')
    // ─────────────────────────────────────────────────────────────────────────
    console.log('--- 1. PATHOLOGY (5 Required Cases) ---');
    try {
      const { buffer: exportBuffer } = await generateHospitalCommercialExportWorkbook('Pathology', 'Hematology');
      const exportedWb = XLSX.read(exportBuffer, { type: 'buffer' });
      const sheetName = exportedWb.SheetNames[0];
      const headers = XLSX.utils.sheet_to_json(exportedWb.Sheets[sheetName], { header: 1 })[0];
      const mrpColIdx = headers.indexOf('MRP ');
      const netRateColIdx = headers.indexOf('Net Rate');

      assert(mrpColIdx !== -1, 'Col "MRP " must exist in Pathology export');
      assert(netRateColIdx !== -1, 'Col "Net Rate" must exist in Pathology export');

      // 5 test rows matching required cases:
      const testCases = [
        { desc: 'Case 1: MRP=350, NetRate=250', mrp: 350, netRate: 250, expSelected: true, expStatus: 'SELECTED', expMrp: 350, expNet: 250 },
        { desc: 'Case 2: MRP blank, NetRate=250 (NetRate must NOT select)', mrp: '', netRate: 250, expSelected: false, expStatus: 'NOT_SELECTED', expMrp: undefined, expNet: 250 },
        { desc: 'Case 3: MRP blank, NetRate blank', mrp: '', netRate: '', expSelected: false, expStatus: 'NOT_SELECTED', expMrp: undefined, expNet: undefined },
        { desc: 'Case 4: MRP=0, NetRate=0 (Zero price)', mrp: 0, netRate: 0, expSelected: true, expStatus: 'SELECTED', expMrp: 0, expNet: 0 },
        { desc: 'Case 5: MRP=0, NetRate=250 (Zero MRP with NetRate)', mrp: 0, netRate: 250, expSelected: true, expStatus: 'SELECTED', expMrp: 0, expNet: 250 }
      ];

      const rows = [headers];
      testCases.forEach((tc, idx) => {
        const row = [
          idx + 1,
          'Pathology',
          'Observation',
          'Hematology',
          `PATH_TEST_CODE_${idx + 1}`,
          `Pathology Test Item ${idx + 1}`,
          `Description ${idx + 1}`,
          'Whole Blood',
          'Both',
          'Required',
          tc.mrp,
          tc.netRate
        ];
        rows.push(row);
      });

      const ws = XLSX.utils.aoa_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, sheetName);
      const testBuffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

      const parsed = parseWorkbook(testBuffer, 'Pathology', 'Hematology');
      const matched = await matchParsedRows(parsed.rows, TEST_TENANT_ID, 'Pathology', 'Hematology');

      testCases.forEach((tc, idx) => {
        const pRow = parsed.rows[idx];
        const mRow = matched[idx];

        assert.strictEqual(pRow.importedPricing.mrp, tc.expMrp, `${tc.desc} - Parser importedPricing.mrp mismatch`);
        assert.strictEqual(pRow.importedPricing.netRate, tc.expNet, `${tc.desc} - Parser importedPricing.netRate mismatch`);
        assert.strictEqual(mRow.isSelected, tc.expSelected, `${tc.desc} - Matcher isSelected mismatch`);
        assert.strictEqual(mRow.selectionStatus, tc.expStatus, `${tc.desc} - Matcher selectionStatus mismatch`);

        pass(`Pathology ${tc.desc} → isSelected=${mRow.isSelected}, selectionStatus="${mRow.selectionStatus}"`);
      });
    } catch (err) {
      fail('Pathology test cases failed', err);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // SECTION 2: SERVICE (Net Rate exists in schema: 'MRP', 'Net Rate')
    // ─────────────────────────────────────────────────────────────────────────
    console.log('\n--- 2. SERVICE (5 Required Cases) ---');
    try {
      const { buffer: exportBuffer } = await generateHospitalCommercialExportWorkbook('Service', 'OPD');
      const exportedWb = XLSX.read(exportBuffer, { type: 'buffer' });
      const sheetName = exportedWb.SheetNames[0];
      const headers = XLSX.utils.sheet_to_json(exportedWb.Sheets[sheetName], { header: 1 })[0];
      const mrpColIdx = headers.indexOf('MRP');
      const netRateColIdx = headers.indexOf('Net Rate');

      assert(mrpColIdx !== -1, 'Col "MRP" must exist in Service export');
      assert(netRateColIdx !== -1, 'Col "Net Rate" must exist in Service export');

      const testCases = [
        { desc: 'Case 1: MRP=800, NetRate=650', mrp: 800, netRate: 650, expSelected: true, expStatus: 'SELECTED', expMrp: 800, expNet: 650 },
        { desc: 'Case 2: MRP blank, NetRate=650 (NetRate must NOT select)', mrp: '', netRate: 650, expSelected: false, expStatus: 'NOT_SELECTED', expMrp: undefined, expNet: 650 },
        { desc: 'Case 3: MRP blank, NetRate blank', mrp: '', netRate: '', expSelected: false, expStatus: 'NOT_SELECTED', expMrp: undefined, expNet: undefined },
        { desc: 'Case 4: MRP=0, NetRate=0 (Zero price)', mrp: 0, netRate: 0, expSelected: true, expStatus: 'SELECTED', expMrp: 0, expNet: 0 },
        { desc: 'Case 5: MRP=0, NetRate=650 (Zero MRP with NetRate)', mrp: 0, netRate: 650, expSelected: true, expStatus: 'SELECTED', expMrp: 0, expNet: 650 }
      ];

      const rows = [headers];
      testCases.forEach((tc, idx) => {
        const row = [
          idx + 1,
          'Service',
          'OPD',
          'Consultation',
          `Dr. Specialist ${idx + 1}`,
          `94000000${idx + 1}`,
          tc.mrp,
          tc.netRate
        ];
        rows.push(row);
      });

      const ws = XLSX.utils.aoa_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, sheetName);
      const testBuffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

      const parsed = parseWorkbook(testBuffer, 'Service', 'OPD');
      const matched = await matchParsedRows(parsed.rows, TEST_TENANT_ID, 'Service', 'OPD');

      testCases.forEach((tc, idx) => {
        const pRow = parsed.rows[idx];
        const mRow = matched[idx];

        assert.strictEqual(pRow.importedPricing.mrp, tc.expMrp, `${tc.desc} - Parser importedPricing.mrp mismatch`);
        assert.strictEqual(pRow.importedPricing.netRate, tc.expNet, `${tc.desc} - Parser importedPricing.netRate mismatch`);
        assert.strictEqual(mRow.isSelected, tc.expSelected, `${tc.desc} - Matcher isSelected mismatch`);
        assert.strictEqual(mRow.selectionStatus, tc.expStatus, `${tc.desc} - Matcher selectionStatus mismatch`);

        pass(`Service ${tc.desc} → isSelected=${mRow.isSelected}, selectionStatus="${mRow.selectionStatus}"`);
      });
    } catch (err) {
      fail('Service test cases failed', err);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // SECTION 3: PHARMACY (Commercial MRP Column)
    // ─────────────────────────────────────────────────────────────────────────
    console.log('\n--- 3. PHARMACY (Entered vs Blank vs Zero) ---');
    try {
      const { buffer: exportBuffer } = await generateHospitalCommercialExportWorkbook('Pharmacy', 'Medicine');
      const exportedWb = XLSX.read(exportBuffer, { type: 'buffer' });
      const sheetName = exportedWb.SheetNames[0];
      const headers = XLSX.utils.sheet_to_json(exportedWb.Sheets[sheetName], { header: 1 })[0];
      const mrpColIdx = headers.indexOf('MRP');
      assert.strictEqual(mrpColIdx, 25, 'Pharmacy commercial MRP column must be index 25 (Col Z)');

      const testCases = [
        { desc: 'MRP entered (150)', mrp: 150, expSelected: true, expStatus: 'SELECTED', expMrp: 150 },
        { desc: 'MRP blank', mrp: '', expSelected: false, expStatus: 'NOT_SELECTED', expMrp: undefined },
        { desc: 'MRP=0', mrp: 0, expSelected: true, expStatus: 'SELECTED', expMrp: 0 }
      ];

      const rows = [headers];
      testCases.forEach((tc, idx) => {
        const row = new Array(26).fill('');
        row[0] = idx + 1;
        row[1] = 'Pharmacy';
        row[2] = 'Tablets';
        row[3] = 'Medicine';
        row[4] = `PHARM_TEST_${idx + 1}`;
        row[5] = `Paracetamol ${idx + 1}`;
        row[6] = 'Cipla';
        row[25] = tc.mrp;
        rows.push(row);
      });

      const ws = XLSX.utils.aoa_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, sheetName);
      const testBuffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

      const parsed = parseWorkbook(testBuffer, 'Pharmacy', 'Medicine');
      const matched = await matchParsedRows(parsed.rows, TEST_TENANT_ID, 'Pharmacy', 'Medicine');

      testCases.forEach((tc, idx) => {
        const pRow = parsed.rows[idx];
        const mRow = matched[idx];

        assert.strictEqual(pRow.importedPricing.mrp, tc.expMrp, `${tc.desc} - Parser importedPricing.mrp mismatch`);
        assert.strictEqual(mRow.isSelected, tc.expSelected, `${tc.desc} - Matcher isSelected mismatch`);
        assert.strictEqual(mRow.selectionStatus, tc.expStatus, `${tc.desc} - Matcher selectionStatus mismatch`);

        pass(`Pharmacy ${tc.desc} → isSelected=${mRow.isSelected}, selectionStatus="${mRow.selectionStatus}"`);
      });
    } catch (err) {
      fail('Pharmacy test cases failed', err);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // SECTION 4: LAB OPERATION (Commercial MRP Column)
    // ─────────────────────────────────────────────────────────────────────────
    console.log('\n--- 4. LAB OPERATION (Entered vs Blank vs Zero) ---');
    try {
      const { buffer: exportBuffer } = await generateHospitalCommercialExportWorkbook('Lab Operation', 'Biochemistry');
      const exportedWb = XLSX.read(exportBuffer, { type: 'buffer' });
      const sheetName = exportedWb.SheetNames[0];
      const headers = XLSX.utils.sheet_to_json(exportedWb.Sheets[sheetName], { header: 1 })[0];
      const mrpColIdx = headers.indexOf('MRP');
      assert.strictEqual(mrpColIdx, 24, 'Lab Operation commercial MRP column must be index 24 (Col Y)');

      const testCases = [
        { desc: 'MRP entered (950)', mrp: 950, expSelected: true, expStatus: 'SELECTED', expMrp: 950 },
        { desc: 'MRP blank', mrp: '', expSelected: false, expStatus: 'NOT_SELECTED', expMrp: undefined },
        { desc: 'MRP=0', mrp: 0, expSelected: true, expStatus: 'SELECTED', expMrp: 0 }
      ];

      const rows = [headers];
      testCases.forEach((tc, idx) => {
        const row = new Array(25).fill('');
        row[0] = idx + 1;
        row[1] = 'Lab Operation';
        row[2] = 'Reagents';
        row[3] = 'Biochemistry';
        row[4] = `LAB_TEST_${idx + 1}`;
        row[5] = `Glucose Reagent ${idx + 1}`;
        row[24] = tc.mrp;
        rows.push(row);
      });

      const ws = XLSX.utils.aoa_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, sheetName);
      const testBuffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

      const parsed = parseWorkbook(testBuffer, 'Lab Operation', 'Biochemistry');
      const matched = await matchParsedRows(parsed.rows, TEST_TENANT_ID, 'Lab Operation', 'Biochemistry');

      testCases.forEach((tc, idx) => {
        const pRow = parsed.rows[idx];
        const mRow = matched[idx];

        assert.strictEqual(pRow.importedPricing.mrp, tc.expMrp, `${tc.desc} - Parser importedPricing.mrp mismatch`);
        assert.strictEqual(mRow.isSelected, tc.expSelected, `${tc.desc} - Matcher isSelected mismatch`);
        assert.strictEqual(mRow.selectionStatus, tc.expStatus, `${tc.desc} - Matcher selectionStatus mismatch`);

        pass(`Lab Operation ${tc.desc} → isSelected=${mRow.isSelected}, selectionStatus="${mRow.selectionStatus}"`);
      });
    } catch (err) {
      fail('Lab Operation test cases failed', err);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // SECTION 5: END-TO-END INGESTION COMMITTAL PROOF
    // ─────────────────────────────────────────────────────────────────────────
    console.log('\n--- 5. END-TO-END INGESTION COMMITTAL PROOF ---');
    try {
      // Seed two canonical Pathology items:
      // Item 1: Uploaded with MRP blank, NetRate 250 -> MUST BE SKIPPED (0 configs created)
      // Item 2: Uploaded with MRP 0, NetRate 250 -> MUST BE CREATED with mrp=0, netRate=250
      const itemUnselected = await ItemMaster.findOneAndUpdate(
        { itemCode: 'TEST_E2E_UNSELECTED' },
        {
          itemCode: 'TEST_E2E_UNSELECTED',
          itemName: 'E2E Item With NetRate Only',
          category: 'Pathology',
          department: 'Hematology',
          scope: 'GLOBAL',
          status: 'ACTIVE'
        },
        { upsert: true, returnDocument: 'after' }
      );

      const itemSelectedZero = await ItemMaster.findOneAndUpdate(
        { itemCode: 'TEST_E2E_SELECTED_ZERO' },
        {
          itemCode: 'TEST_E2E_SELECTED_ZERO',
          itemName: 'E2E Item With Zero MRP',
          category: 'Pathology',
          department: 'Hematology',
          scope: 'GLOBAL',
          status: 'ACTIVE'
        },
        { upsert: true, returnDocument: 'after' }
      );

      const { buffer: exportBuffer } = await generateHospitalCommercialExportWorkbook('Pathology', 'Hematology');
      const exportedWb = XLSX.read(exportBuffer, { type: 'buffer' });
      const sheetName = exportedWb.SheetNames[0];
      const headers = XLSX.utils.sheet_to_json(exportedWb.Sheets[sheetName], { header: 1 })[0];
      const mrpColIdx = headers.indexOf('MRP ');
      const netRateColIdx = headers.indexOf('Net Rate');

      const rows = [
        headers,
        [
          1, 'Pathology', 'Observation', 'Hematology',
          itemUnselected.itemCode, itemUnselected.itemName, itemUnselected.itemName,
          'Whole Blood', 'Both', 'Required',
          '', // MRP BLANK
          250 // NetRate PRESENT (must NOT select)
        ],
        [
          2, 'Pathology', 'Observation', 'Hematology',
          itemSelectedZero.itemCode, itemSelectedZero.itemName, itemSelectedZero.itemName,
          'Whole Blood', 'Both', 'Required',
          0, // MRP = 0 (MUST SELECT)
          250 // NetRate = 250
        ]
      ];

      const ws = XLSX.utils.aoa_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, sheetName);
      const uploadBuffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

      const parsed = parseWorkbook(uploadBuffer, 'Pathology', 'Hematology');
      const matched = await matchParsedRows(parsed.rows, TEST_TENANT_ID, 'Pathology', 'Hematology');

      assert.strictEqual(matched[0].isSelected, false, 'Row 1 (Blank MRP, NetRate=250) must NOT be selected');
      assert.strictEqual(matched[1].isSelected, true, 'Row 2 (MRP=0, NetRate=250) must BE selected');

      const previewId = 'prev-mrp-only-' + Date.now();
      await HospitalMasterImportSession.create({
        previewId,
        tenantId: TEST_TENANT_ID,
        category: 'Pathology',
        department: 'Hematology',
        superAdminId: 'admin_mrp_test',
        superAdminName: 'Super Admin',
        originalFileName: 'mrp_only_semantics.xlsx',
        fileHash: parsed.fileHash || 'sha256-test',
        rows: matched,
        summary: matched.summary,
        status: 'PREVIEW_READY',
        expiresAt: new Date(Date.now() + 3600000),
        cleanupAt: new Date(Date.now() + 86400000)
      });

      const ingestionResult = await confirmImportSession({
        previewId,
        tenantId: TEST_TENANT_ID,
        category: 'Pathology',
        department: 'Hematology',
        allowRepricing: false,
        ambiguousResolutions: {},
        superAdminUser: { id: 'admin_mrp_test', name: 'Super Admin' }
      });

      assert.strictEqual(ingestionResult.success, true);
      assert.strictEqual(ingestionResult.metrics.newConfigsCreated, 1, 'Exactly 1 new config must be created');
      assert.strictEqual(ingestionResult.metrics.skippedCount, 1, 'Exactly 1 row must be skipped');

      // Verify DB: Unselected item (Row 1 with NetRate=250) has ZERO configs
      const unselectedConfig = await HospitalMasterConfig.findOne({
        tenantId: TEST_TENANT_ID,
        masterItemId: itemUnselected._id
      });
      assert.strictEqual(unselectedConfig, null, 'NetRate alone MUST NEVER create HospitalMasterConfig');
      pass('Proof: Net Rate alone without MRP created 0 HospitalMasterConfig records (skipped)');

      // Verify DB: Selected zero-MRP item (Row 2 with MRP=0, NetRate=250) created with exact rates
      const zeroConfig = await HospitalMasterConfig.findOne({
        tenantId: TEST_TENANT_ID,
        masterItemId: itemSelectedZero._id
      });
      assert(zeroConfig, 'MRP=0 item must create HospitalMasterConfig');
      assert.strictEqual(zeroConfig.mrp, 0, 'MRP=0 must be preserved as 0 in HospitalMasterConfig');
      assert.strictEqual(zeroConfig.netRate, 250, 'NetRate=250 must be saved alongside MRP=0');
      pass('Proof: MRP=0 created HospitalMasterConfig with mrp=0 strictly preserved');

      // Cleanup
      await HospitalMasterConfig.deleteMany({ tenantId: TEST_TENANT_ID });
      await HospitalMasterImportSession.deleteMany({ tenantId: TEST_TENANT_ID });
      await ItemMaster.deleteMany({
        itemCode: { $in: ['TEST_E2E_UNSELECTED', 'TEST_E2E_SELECTED_ZERO'] }
      });
    } catch (err) {
      fail('End-to-End committal proof failed', err);
    }

    console.log('\n========================================================================');
    console.log(`   ALL MRP-ONLY SELECTION SEMANTICS TESTS PASSED (${passed}/${total})`);
    console.log('========================================================================\n');
  } finally {
    await mongoose.disconnect();
  }
}

runMrpOnlySelectionSemanticsTests().catch((err) => {
  console.error('Test suite failed:', err);
  process.exit(1);
});
