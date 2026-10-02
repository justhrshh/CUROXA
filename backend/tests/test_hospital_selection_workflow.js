/**
 * QUROXA — HOSPITAL EXCEL SELECTION WORKFLOW TEST SUITE
 *
 * Verifies the business workflow:
 * - Hospital selects items by entering MRP.
 * - Blank MRP = NOT SELECTED (skipped during import, no config created).
 * - Zero MRP (0) = VALID SELECTED PRICE (preserved as 0, not coerced or skipped).
 * - Blank MRP for item with existing HospitalMasterConfig = STRICTLY RETAINED (not deleted or repriced).
 * - Valid price change on existing item = REPRICING DIFF detected.
 * - Multi-tenant isolation and Global ItemMaster purity preserved.
 */

const assert = require('assert');
const mongoose = require('mongoose');
const XLSX = require('xlsx');
require('dotenv').config();

const ItemMaster = require('../models/ItemMaster');
const HospitalMasterConfig = require('../models/HospitalMasterConfig');
const SuperAdminHospital = require('../models/SuperAdminHospital');
const HospitalMasterImportSession = require('../models/HospitalMasterImportSession');
const { generateMasterExportWorkbook } = require('../services/masterExportService');
const { parseWorkbook } = require('../services/masterWorkbookParser');
const { matchParsedRows } = require('../services/masterMatchingEngine');
const { confirmImportSession } = require('../services/hospitalCatalogIngestionService');

async function runSelectionWorkflowTests() {
  console.log('========================================================================');
  console.log('   QUROXA HOSPITAL EXCEL SELECTION WORKFLOW TEST SUITE');
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
    console.error(`  [FAIL] ${total}. ${msg}:`, err.message);
  }

  const uri = process.env.MONGO_URI;
  assert(uri, 'MONGO_URI is required');
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 });

  const TEST_TENANT_ID = 'test_selection_hospital';

  try {
    // 0. Ensure clean test state for test tenant
    await HospitalMasterConfig.deleteMany({ tenantId: TEST_TENANT_ID });
    await HospitalMasterImportSession.deleteMany({ tenantId: TEST_TENANT_ID });

    // 1. Fetch 4 items from Pathology -> Hematology
    const dept = 'Hematology';
    const pathologyItems = await ItemMaster.find({ category: 'Pathology', department: dept }).limit(4);
    assert(pathologyItems.length >= 4, 'Need at least 4 Pathology -> Hematology items seeded in DB');
    const itemsToTest = pathologyItems.slice(0, 4);
    pass(`Retrieved ${itemsToTest.length} canonical Pathology (${dept}) items for selection test`);

    // 2. Pre-configure an existing HospitalMasterConfig for Item 0 (will be blank in upload -> must be retained)
    // and for Item 1 (will have new price in upload -> repricing diff)
    const existingRetainedConfig = await HospitalMasterConfig.create({
      tenantId: TEST_TENANT_ID,
      masterItemId: itemsToTest[0]._id,
      category: 'Pathology',
      department: dept,
      itemCode: itemsToTest[0].itemCode,
      itemName: itemsToTest[0].itemName,
      mrp: 200,
      netRate: 150,
      status: 'ACTIVE',
      assignedVia: 'EXCEL_UPLOAD'
    });

    const existingRepricedConfig = await HospitalMasterConfig.create({
      tenantId: TEST_TENANT_ID,
      masterItemId: itemsToTest[1]._id,
      category: 'Pathology',
      department: dept,
      itemCode: itemsToTest[1].itemCode,
      itemName: itemsToTest[1].itemName,
      mrp: 300,
      netRate: 220,
      status: 'ACTIVE',
      assignedVia: 'EXCEL_UPLOAD'
    });
    pass('Pre-configured 2 existing hospital catalog items (one to test blank retention, one to test repricing diff)');

    // 3. Generate REAL Global Master Export for Pathology -> Hematology
    const { buffer: exportBuffer } = await generateMasterExportWorkbook('Pathology', dept);
    const exportedWb = XLSX.read(exportBuffer, { type: 'buffer' });
    const sheetName = exportedWb.SheetNames[0];
    const exportedRows = XLSX.utils.sheet_to_json(exportedWb.Sheets[sheetName], { header: 1 });

    // Header row is index 0
    const headers = exportedRows[0];
    const mrpColIdx = headers.indexOf('MRP ');
    const netRateColIdx = headers.indexOf('Net Rate');
    const itemCodeColIdx = headers.indexOf('ItemCode');

    assert(mrpColIdx !== -1, 'Must have Col K exact "MRP "');
    assert(netRateColIdx !== -1, 'Must have Col L exact "Net Rate"');

    // 4 test rows covering all 4 core business cases:
    // Row 1 (Item 0): Blank MRP (already has config at 200 -> MUST RETAIN untouched)
    // Row 2 (Item 1): MRP = 350 (reprice from 300)
    // Row 3 (Item 2): MRP = 0 (zero price preservation -> MUST BE SELECTED, not skipped)
    // Row 4 (Item 3): Blank MRP (new unselected item -> MUST BE SKIPPED, no config)

    const updatedDataRows = [headers];
    itemsToTest.forEach((item, idx) => {
      let row = exportedRows.slice(1).find(r => String(r[itemCodeColIdx]).trim() === String(item.itemCode).trim());
      if (!row) {
        row = [
          idx + 1,
          'Pathology',
          item.categoryData?.itemTypeName || 'Observation',
          dept,
          item.itemCode,
          item.itemName,
          item.categoryData?.description || item.itemName,
          item.categoryData?.sampleType || 'Whole Blood',
          item.categoryData?.gender || 'Both',
          item.categoryData?.sampleOption || 'Required',
          '',
          ''
        ];
      } else {
        row = [...row];
      }

      if (idx === 0) {
        row[mrpColIdx] = ''; // Blank (retained config)
        row[netRateColIdx] = '';
      } else if (idx === 1) {
        row[mrpColIdx] = 350; // Reprice 300 -> 350
        row[netRateColIdx] = 260;
      } else if (idx === 2) {
        row[mrpColIdx] = 0; // Zero price (preserved!)
        row[netRateColIdx] = 0;
      } else if (idx === 3) {
        row[mrpColIdx] = ''; // Blank (skipped new item)
        row[netRateColIdx] = '';
      }

      updatedDataRows.push(row);
    });

    const newWs = XLSX.utils.aoa_to_sheet(updatedDataRows);
    const newWb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(newWb, newWs, sheetName);
    const fileBuffer = XLSX.write(newWb, { type: 'buffer', bookType: 'xlsx' });

    // 4. Parse workbook
    const parseResult = parseWorkbook(fileBuffer, 'Pathology', dept);
    assert.strictEqual(parseResult.rows.length, 4, 'Parser must parse 4 rows');
    pass('Workbook parsed accurately with 4 simulated rows');

    // 5. Match rows
    const matchResult = await matchParsedRows(
      parseResult.rows,
      TEST_TENANT_ID,
      'Pathology',
      dept
    );

    // Verify metrics
    assert.strictEqual(matchResult.summary.totalRows, 4);
    assert.strictEqual(matchResult.summary.selected, 2, 'Exactly 2 rows should be selected (Row 2, Row 3)');
    assert.strictEqual(matchResult.summary.notSelected, 2, 'Exactly 2 rows should be unselected (Row 1, Row 4)');
    assert.strictEqual(matchResult.summary.repricingDiffs, 1, 'Exactly 1 repricing diff should be detected (Row 2)');
    pass('Matching metrics accurately computed: 2 selected, 2 unselected, 1 repricing diff');

    // Verify row-level selection status
    // Row 1: Blank MRP, existing config exists -> isSelected: false, selectionStatus: 'NOT_SELECTED'
    assert.strictEqual(matchResult[0].isSelected, false);
    assert.strictEqual(matchResult[0].selectionStatus, 'NOT_SELECTED');
    pass('Row 1 (Blank MRP for existing item): isSelected=false, selectionStatus="NOT_SELECTED"');

    // Row 2: MRP 350, existing was 300 -> isSelected: true, selectionStatus: 'REPRICING'
    assert.strictEqual(matchResult[1].isSelected, true);
    assert.strictEqual(matchResult[1].selectionStatus, 'REPRICING');
    assert.strictEqual(matchResult[1].pricingDiff.hasDiff, true);
    assert.strictEqual(matchResult[1].pricingDiff.diffs.mrp.current, 300);
    assert.strictEqual(matchResult[1].pricingDiff.diffs.mrp.imported, 350);
    pass('Row 2 (Repriced item): isSelected=true, selectionStatus="REPRICING", diff 300->350');

    // Row 3: MRP 0 -> isSelected: true, zero preserved!
    assert.strictEqual(matchResult[2].isSelected, true);
    assert.strictEqual(matchResult[2].extractedPricing.mrp, 0);
    assert.strictEqual(matchResult[2].selectionStatus, 'NEW_SELECTION');
    pass('Row 3 (Zero MRP): isSelected=true, mrp=0 preserved, selectionStatus="NEW_SELECTION"');

    // Row 4: Blank MRP, new -> isSelected: false, selectionStatus: 'NOT_SELECTED'
    assert.strictEqual(matchResult[3].isSelected, false);
    assert.strictEqual(matchResult[3].selectionStatus, 'NOT_SELECTED');
    pass('Row 4 (Blank MRP for new item): isSelected=false, selectionStatus="NOT_SELECTED"');

    // 6. Create Server-Authoritative Preview Session
    const previewId = 'prev-test-sel-' + Date.now();
    const session = await HospitalMasterImportSession.create({
      previewId,
      tenantId: TEST_TENANT_ID,
      category: 'Pathology',
      department: dept,
      superAdminId: 'admin_test_1',
      superAdminName: 'Super Admin',
      originalFileName: 'hospital_selection_test.xlsx',
      fileHash: 'sha256-test-hash',
      rows: matchResult,
      summary: matchResult.summary,
      status: 'PREVIEW_READY',
      expiresAt: new Date(Date.now() + 3600000),
      cleanupAt: new Date(Date.now() + 86400000)
    });
    pass('Server-authoritative preview session persisted');

    // 7. Execute Ingestion with allowRepricing = true
    const ingestionResult = await confirmImportSession({
      previewId,
      tenantId: TEST_TENANT_ID,
      category: 'Pathology',
      department: dept,
      allowRepricing: true,
      ambiguousResolutions: {},
      superAdminUser: { id: 'admin_test_1', name: 'Super Admin' }
    });

    assert.strictEqual(ingestionResult.success, true);
    assert.strictEqual(ingestionResult.metrics.newConfigsCreated, 1, '1 new item created (Row 3 at 0)');
    assert.strictEqual(ingestionResult.metrics.existingConfigsRepriced, 1, '1 item repriced (Row 2 at 350)');
    assert.strictEqual(ingestionResult.metrics.skippedCount, 2, '2 unselected rows skipped (Row 1 retained, Row 4 skipped)');
    pass(`Import committed: Batch ${ingestionResult.importBatchId} (Created: ${ingestionResult.metrics.newConfigsCreated}, Repriced: ${ingestionResult.metrics.existingConfigsRepriced}, Skipped: ${ingestionResult.metrics.skippedCount})`);

    // 8. Verify HospitalMasterConfig database state
    // Check Item 0 (Blank in sheet): Must still exist with original price 200 (NOT deleted, NOT modified)
    const item0Config = await HospitalMasterConfig.findOne({
      tenantId: TEST_TENANT_ID,
      masterItemId: itemsToTest[0]._id
    });
    assert(item0Config, 'Existing config for unselected item must NOT be deleted');
    assert.strictEqual(item0Config.mrp, 200, 'Existing config MRP must be retained untouched at 200');
    assert.strictEqual(item0Config.netRate, 150, 'Existing config Net Rate must be retained untouched at 150');
    pass('Verification: Blank row for existing catalog item left existing configuration 100% untouched');

    // Check Item 1 (Repriced to 350): Updated to 350
    const item1Config = await HospitalMasterConfig.findOne({
      tenantId: TEST_TENANT_ID,
      masterItemId: itemsToTest[1]._id
    });
    assert(item1Config, 'Repriced config must exist');
    assert.strictEqual(item1Config.mrp, 350, 'Repriced MRP must be updated to 350');
    assert.strictEqual(item1Config.netRate, 260, 'Repriced Net Rate must be updated to 260');
    pass('Verification: Repriced item updated to new rate (MRP: 350, Net Rate: 260)');

    // Check Item 2 (Zero MRP): Created with mrp = 0
    const item2Config = await HospitalMasterConfig.findOne({
      tenantId: TEST_TENANT_ID,
      masterItemId: itemsToTest[2]._id
    });
    assert(item2Config, 'Zero price item config must be created');
    assert.strictEqual(item2Config.mrp, 0, 'MRP must be preserved as 0, not coerced or null');
    assert.strictEqual(item2Config.assignedVia, 'EXCEL_UPLOAD');
    pass('Verification: Zero price item created with mrp=0 strictly preserved');

    // Check Item 3 (Blank MRP, new): Must NOT exist in HospitalMasterConfig
    const item3Config = await HospitalMasterConfig.findOne({
      tenantId: TEST_TENANT_ID,
      masterItemId: itemsToTest[3]._id
    });
    assert.strictEqual(item3Config, null, 'Unselected new item must NOT have any config created');
    pass('Verification: Unselected new item was skipped (0 configs created)');

    // 9. Verify Global ItemMaster purity
    const globalItem0 = await ItemMaster.findById(itemsToTest[0]._id);
    const globalItem1 = await ItemMaster.findById(itemsToTest[1]._id);
    assert.strictEqual(globalItem0.mrp, undefined, 'Global master must never store hospital-specific prices');
    assert.strictEqual(globalItem1.mrp, undefined, 'Global master must never store hospital-specific prices');
    pass('Verification: Global ItemMaster remains 100% pure and immutable');

    // Clean up test data
    await HospitalMasterConfig.deleteMany({ tenantId: TEST_TENANT_ID });
    await HospitalMasterImportSession.deleteMany({ tenantId: TEST_TENANT_ID });

  } catch (err) {
    fail('Workflow test failure', err);
  } finally {
    await mongoose.disconnect();
    console.log('\nMongoDB connection closed.');
  }

  console.log('\n========================================================================');
  console.log(`   SELECTION WORKFLOW SUMMARY: ${passed} / ${total} TESTS PASSED`);
  console.log('========================================================================\n');

  if (passed !== total) {
    process.exit(1);
  }
}

runSelectionWorkflowTests().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
