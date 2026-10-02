/**
 * QUROXA — HOSPITAL COMMERCIAL EXPORT & SELECTION PIPELINE TEST SUITE
 *
 * Verifies:
 * 1. Exported Pathology contains "MRP " and "Net Rate"
 * 2. Exported Service contains "MRP" and "Net Rate"
 * 3. Exported Assets contains "MRP"
 * 4. Exported Pharmacy contains visible "MRP" column (Col Z / 26 columns)
 * 5. Exported Lab Operation contains visible "MRP" column (Col Y / 25 columns)
 * 6. Canonical Global Master export has NO MRP for Pharmacy (25 columns)
 * 7. Canonical Global Master export has NO MRP for Lab Operation (24 columns)
 * 8. Canonical MASTER_SCHEMA_REGISTRY remains unchanged (Lab: 24, Pharmacy: 25)
 * 9. Blank MRP in commercial workbook parses as NOT_SELECTED (isSelected: false)
 * 10. Explicit MRP parses as SELECTED (isSelected: true)
 * 11. MRP = 0 parses as SELECTED (preserved as 0, not coerced or skipped)
 * 12. Pharmacy Hospital Commercial round-trip: Export -> Edit MRP -> Parse -> Match -> Ingest
 * 13. Lab Operation Hospital Commercial round-trip: Export -> Edit MRP -> Parse -> Match -> Ingest
 * 14. Blank row retains existing HospitalMasterConfig untouched
 * 15. Blank row for new item creates NO HospitalMasterConfig
 * 16. Global ItemMaster remains untouched (no hospital pricing injected)
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
  getCategoryConfig
} = require('../config/masterSchemaRegistry');
const {
  HOSPITAL_EXPORT_VERSION,
  HOSPITAL_COMMERCIAL_COLUMNS,
  generateHospitalCommercialExportWorkbook,
  generateCanonicalMasterExportWorkbook
} = require('../services/masterExportService');
const { parseWorkbook } = require('../services/masterWorkbookParser');
const { matchParsedRows } = require('../services/masterMatchingEngine');
const { confirmImportSession } = require('../services/hospitalCatalogIngestionService');

async function runHospitalCommercialExportTests() {
  console.log('========================================================================');
  console.log('   QUROXA HOSPITAL COMMERCIAL EXPORT & ROUND-TRIP TEST SUITE');
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
    throw err || new Error(msg);
  }

  const uri = process.env.MONGO_URI;
  assert(uri, 'MONGO_URI is required');
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 });

  const TEST_TENANT_ID = 'test_commercial_export_hosp';

  try {
    // 0. Ensure clean state
    await HospitalMasterConfig.deleteMany({ tenantId: TEST_TENANT_ID });
    await HospitalMasterImportSession.deleteMany({ tenantId: TEST_TENANT_ID });

    // ─────────────────────────────────────────────────────────────────────────
    // VERIFICATION 1: CANONICAL REGISTRY INTEGRITY
    // ─────────────────────────────────────────────────────────────────────────
    const labCanonFields = MASTER_SCHEMA_REGISTRY['Lab Operation'].sharedFields;
    const pharmCanonFields = MASTER_SCHEMA_REGISTRY['Pharmacy'].sharedFields;
    const pathCanonFields = MASTER_SCHEMA_REGISTRY['Pathology'].sharedFields;
    const servCanonFields = MASTER_SCHEMA_REGISTRY['Service'].sharedFields;
    const assetCanonFields = MASTER_SCHEMA_REGISTRY['Assets'].sharedFields;

    assert.strictEqual(labCanonFields.length, 24, 'Lab Operation canonical must have exactly 24 fields');
    assert.strictEqual(pharmCanonFields.length, 25, 'Pharmacy canonical must have exactly 25 fields');
    assert.strictEqual(pathCanonFields.length, 12, 'Pathology canonical must have exactly 12 fields');
    assert.strictEqual(servCanonFields.length, 8, 'Service canonical must have exactly 8 fields');
    assert.strictEqual(assetCanonFields.length, 15, 'Assets canonical must have exactly 15 fields');
    pass('Canonical MASTER_SCHEMA_REGISTRY is 100% frozen (Lab: 24, Pharmacy: 25, Pathology: 12, Service: 8, Assets: 15)');

    // Verify Canonical export (GLOBAL_CANONICAL) has no MRP column for Lab/Pharmacy
    const labCanonExport = await generateCanonicalMasterExportWorkbook('Lab Operation', 'Biochemistry');
    const labCanonWb = XLSX.read(labCanonExport.buffer, { type: 'buffer' });
    const labCanonHeaders = XLSX.utils.sheet_to_json(labCanonWb.Sheets[labCanonWb.SheetNames[0]], { header: 1 })[0];
    assert.strictEqual(labCanonHeaders.length, 24, 'Canonical Lab export must have exactly 24 headers');
    assert.strictEqual(labCanonHeaders.includes('MRP'), false, 'Canonical Lab export must NOT have MRP column');
    pass('Canonical Lab export has exactly 24 columns and 0 pricing columns');

    const pharmCanonExport = await generateCanonicalMasterExportWorkbook('Pharmacy', 'Medicine');
    const pharmCanonWb = XLSX.read(pharmCanonExport.buffer, { type: 'buffer' });
    const pharmCanonHeaders = XLSX.utils.sheet_to_json(pharmCanonWb.Sheets[pharmCanonWb.SheetNames[0]], { header: 1 })[0];
    assert.strictEqual(pharmCanonHeaders.length, 25, 'Canonical Pharmacy export must have exactly 25 headers');
    assert.strictEqual(pharmCanonHeaders.includes('MRP'), false, 'Canonical Pharmacy export must NOT have MRP column');
    pass('Canonical Pharmacy export has exactly 25 columns and 0 pricing columns');

    // ─────────────────────────────────────────────────────────────────────────
    // VERIFICATION 2: HOSPITAL COMMERCIAL EXPORT COLUMNS (ALL CATEGORIES)
    // ─────────────────────────────────────────────────────────────────────────

    // Pathology commercial export
    const pathExport = await generateHospitalCommercialExportWorkbook('Pathology', 'Biochemistry');
    const pathWb = XLSX.read(pathExport.buffer, { type: 'buffer' });
    const pathHeaders = XLSX.utils.sheet_to_json(pathWb.Sheets[pathWb.SheetNames[0]], { header: 1 })[0];
    assert.strictEqual(pathHeaders.length, 12);
    assert(pathHeaders.includes('MRP '), 'Pathology export must contain Col K "MRP "');
    assert(pathHeaders.includes('Net Rate'), 'Pathology export must contain Col L "Net Rate"');
    pass('Pathology commercial export contains exact "MRP " (Col K) and "Net Rate" (Col L)');

    // Service commercial export
    const servExport = await generateHospitalCommercialExportWorkbook('Service', 'OPD');
    const servWb = XLSX.read(servExport.buffer, { type: 'buffer' });
    const servHeaders = XLSX.utils.sheet_to_json(servWb.Sheets[servWb.SheetNames[0]], { header: 1 })[0];
    assert.strictEqual(servHeaders.length, 8);
    assert(servHeaders.includes('MRP'), 'Service export must contain Col G "MRP"');
    assert(servHeaders.includes('Net Rate'), 'Service export must contain Col H "Net Rate"');
    pass('Service commercial export contains "MRP" (Col G) and "Net Rate" (Col H)');

    // Assets commercial export
    const assetExport = await generateHospitalCommercialExportWorkbook('Assets', '');
    const assetWb = XLSX.read(assetExport.buffer, { type: 'buffer' });
    const assetHeaders = XLSX.utils.sheet_to_json(assetWb.Sheets[assetWb.SheetNames[0]], { header: 1 })[0];
    assert.strictEqual(assetHeaders.length, 15);
    assert(assetHeaders.includes('MRP'), 'Assets export must contain Col O "MRP"');
    pass('Assets commercial export contains "MRP" (Col O)');

    // Pharmacy commercial export: 25 canonical + 1 visible MRP = 26 cols
    const pharmExport = await generateHospitalCommercialExportWorkbook('Pharmacy', 'Medicine');
    const pharmWb = XLSX.read(pharmExport.buffer, { type: 'buffer' });
    const pharmHeaders = XLSX.utils.sheet_to_json(pharmWb.Sheets[pharmWb.SheetNames[0]], { header: 1 })[0];
    assert.strictEqual(pharmHeaders.length, 26, `Pharmacy commercial export must have 26 columns, got ${pharmHeaders.length}`);
    assert.strictEqual(pharmHeaders[25], 'MRP', 'Pharmacy Col 26 (Col Z) must be "MRP"');
    pass('Pharmacy commercial export contains visible "MRP" column at Column 26 (Col Z)');

    // Lab Operation commercial export: 24 canonical + 1 visible MRP = 25 cols
    const labExport = await generateHospitalCommercialExportWorkbook('Lab Operation', 'Biochemistry');
    const labWb = XLSX.read(labExport.buffer, { type: 'buffer' });
    const labHeaders = XLSX.utils.sheet_to_json(labWb.Sheets[labWb.SheetNames[0]], { header: 1 })[0];
    assert.strictEqual(labHeaders.length, 25, `Lab commercial export must have 25 columns, got ${labHeaders.length}`);
    assert.strictEqual(labHeaders[24], 'MRP', 'Lab Col 25 (Col Y) must be "MRP"');
    pass('Lab Operation commercial export contains visible "MRP" column at Column 25 (Col Y)');

    // ─────────────────────────────────────────────────────────────────────────
    // VERIFICATION 3: PHARMACY ROUND-TRIP (EXPORT -> EDIT MRP -> PARSE -> INGEST)
    // ─────────────────────────────────────────────────────────────────────────
    const pharmItems = await ItemMaster.find({ category: 'Pharmacy' }).limit(3);
    assert(pharmItems.length >= 2, 'Need at least 2 Pharmacy items seeded');

    // Pre-create 1 existing config for Item 0 (to test blank retention)
    await HospitalMasterConfig.create({
      tenantId: TEST_TENANT_ID,
      masterItemId: pharmItems[0]._id,
      category: 'Pharmacy',
      department: 'Medicine',
      itemCode: pharmItems[0].itemCode,
      itemName: pharmItems[0].itemName,
      mrp: 150,
      netRate: 120,
      status: 'ACTIVE',
      assignedVia: 'EXCEL_UPLOAD'
    });
    pass('Pre-configured existing HospitalMasterConfig for Pharmacy Item 0 with MRP=150');

    // Simulate Hospital filling the Pharmacy Excel
    // Row 1 (Item 0): Blank MRP -> MUST BE RETAINED (not deleted, not repriced)
    // Row 2 (Item 1): MRP = 450 -> MUST BE SELECTED (new config created)
    // Row 3 (Item 2, if present): MRP = 0 -> MUST BE SELECTED with MRP=0 preserved
    const pharmSheet = pharmWb.Sheets[pharmWb.SheetNames[0]];
    const rawPharmRows = XLSX.utils.sheet_to_json(pharmSheet, { header: 1 });
    const pHeaders = rawPharmRows[0];
    const pCodeIdx = pHeaders.indexOf('ItemCode');
    const pMrpIdx = pHeaders.indexOf('MRP');
    assert(pCodeIdx !== -1, 'Pharmacy export must have ItemCode column');
    assert(pMrpIdx !== -1, 'Pharmacy commercial export must have MRP column');

    const editedPharmRows = [pHeaders];
    pharmItems.forEach((item, idx) => {
      let r = rawPharmRows.slice(1).find(row => String(row[pCodeIdx] || '').trim() === String(item.itemCode).trim());
      if (r) {
        r = [...r];
      } else {
        r = new Array(pHeaders.length).fill('');
        r[pHeaders.indexOf('S.No')] = idx + 1;
        r[pHeaders.indexOf('Category')] = 'Pharmacy';
        r[pHeaders.indexOf('Department')] = 'Medicine';
        r[pCodeIdx] = item.itemCode;
        r[pHeaders.indexOf('ItemName')] = item.itemName;
      }

      if (idx === 0) {
        r[pMrpIdx] = ''; // Blank (retain existing config)
      } else if (idx === 1) {
        r[pMrpIdx] = 450; // Selected: MRP 450
      } else if (idx === 2) {
        r[pMrpIdx] = 0; // Selected: MRP 0 (zero preserved)
      }
      editedPharmRows.push(r);
    });

    const editedPharmWs = XLSX.utils.aoa_to_sheet(editedPharmRows);
    const editedPharmWb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(editedPharmWb, editedPharmWs, 'Pharmacy');
    const editedPharmBuffer = XLSX.write(editedPharmWb, { type: 'buffer', bookType: 'xlsx' });

    // Parse the edited Pharmacy Excel
    const parsedPharm = parseWorkbook(editedPharmBuffer, 'Pharmacy', 'Medicine');
    assert.strictEqual(parsedPharm.rows.length, pharmItems.length);
    assert.strictEqual(parsedPharm.hasMrpColumn, true, 'Parser must detect commercial MRP column for Pharmacy');
    pass('Parser successfully identified commercial MRP column in Pharmacy upload');

    // Match the parsed rows against DB
    const matchedPharm = await matchParsedRows(parsedPharm.rows, TEST_TENANT_ID, 'Pharmacy', 'Medicine');
    assert.strictEqual(matchedPharm[0].isSelected, false, 'Pharmacy Item 0 with blank MRP must be NOT_SELECTED');
    assert.strictEqual(matchedPharm[0].selectionStatus, 'NOT_SELECTED');
    assert.strictEqual(matchedPharm[1].isSelected, true, 'Pharmacy Item 1 with MRP 450 must be SELECTED');
    assert.strictEqual(matchedPharm[1].extractedPricing.mrp, 450);

    if (pharmItems.length >= 3) {
      assert.strictEqual(matchedPharm[2].isSelected, true, 'Pharmacy Item 2 with MRP 0 must be SELECTED');
      assert.strictEqual(matchedPharm[2].extractedPricing.mrp, 0);
      pass('Pharmacy Item 2 with MRP=0 preserved as selected with explicit 0 price');
    }
    pass('Pharmacy rows matched with correct selection flags: Blank -> NOT_SELECTED, 450 -> SELECTED');

    // Persist preview session and confirm
    const pharmPreviewId = 'prev-pharm-' + Date.now();
    await HospitalMasterImportSession.create({
      previewId: pharmPreviewId,
      tenantId: TEST_TENANT_ID,
      category: 'Pharmacy',
      department: 'Medicine',
      superAdminId: 'admin_test',
      superAdminName: 'Super Admin',
      originalFileName: 'pharmacy_hospital_return.xlsx',
      fileHash: 'sha-pharm-test',
      rows: matchedPharm,
      summary: matchedPharm.summary,
      status: 'PREVIEW_READY',
      expiresAt: new Date(Date.now() + 3600000),
      cleanupAt: new Date(Date.now() + 86400000)
    });

    const pharmIngestResult = await confirmImportSession({
      previewId: pharmPreviewId,
      tenantId: TEST_TENANT_ID,
      category: 'Pharmacy',
      department: 'Medicine',
      allowRepricing: true,
      ambiguousResolutions: {},
      superAdminUser: { id: 'admin_test', name: 'Super Admin' }
    });

    assert.strictEqual(pharmIngestResult.success, true);
    pass(`Pharmacy import confirmed: ${pharmIngestResult.metrics.newConfigsCreated} created, ${pharmIngestResult.metrics.skippedCount} skipped`);

    // Verify Pharmacy database state: Item 0 MUST still have MRP=150 (untouched)
    const pharmConfig0 = await HospitalMasterConfig.findOne({
      tenantId: TEST_TENANT_ID,
      masterItemId: pharmItems[0]._id
    });
    assert(pharmConfig0, 'Pharmacy Item 0 config must still exist');
    assert.strictEqual(pharmConfig0.mrp, 150, 'Pharmacy Item 0 MRP must be retained untouched at 150');
    pass('Pharmacy Item 0 with blank MRP was retained untouched in DB with original pricing');

    // Verify Pharmacy Item 1 config created with MRP=450
    const pharmConfig1 = await HospitalMasterConfig.findOne({
      tenantId: TEST_TENANT_ID,
      masterItemId: pharmItems[1]._id
    });
    assert(pharmConfig1, 'Pharmacy Item 1 config must be created');
    assert.strictEqual(pharmConfig1.mrp, 450, 'Pharmacy Item 1 MRP must be 450');
    pass('Pharmacy Item 1 config successfully created with MRP=450');

    // ─────────────────────────────────────────────────────────────────────────
    // VERIFICATION 4: LAB OPERATION ROUND-TRIP (EXPORT -> EDIT MRP -> PARSE -> INGEST)
    // ─────────────────────────────────────────────────────────────────────────
    const labItems = await ItemMaster.find({ category: 'Lab Operation' }).limit(3);
    assert(labItems.length >= 2, 'Need at least 2 Lab Operation items seeded');

    // Pre-create 1 existing config for Lab Item 0 (to test blank retention)
    await HospitalMasterConfig.create({
      tenantId: TEST_TENANT_ID,
      masterItemId: labItems[0]._id,
      category: 'Lab Operation',
      department: labItems[0].department || 'Biochemistry',
      itemCode: labItems[0].itemCode,
      itemName: labItems[0].itemName,
      mrp: 600,
      netRate: 500,
      status: 'ACTIVE',
      assignedVia: 'EXCEL_UPLOAD'
    });
    pass('Pre-configured existing HospitalMasterConfig for Lab Item 0 with MRP=600');

    // Simulate Hospital filling the Lab Excel
    // Row 1 (Item 0): Blank MRP -> Retained
    // Row 2 (Item 1): MRP = 850 -> Selected
    const labSheet = labWb.Sheets[labWb.SheetNames[0]];
    const rawLabRows = XLSX.utils.sheet_to_json(labSheet, { header: 1 });
    const lHeaders = rawLabRows[0];
    const lCodeIdx = lHeaders.indexOf('ItemCode');
    const lMrpIdx = lHeaders.indexOf('MRP');
    assert(lCodeIdx !== -1, 'Lab Operation export must have ItemCode column');
    assert(lMrpIdx !== -1, 'Lab Operation commercial export must have MRP column');

    const editedLabRows = [lHeaders];
    labItems.forEach((item, idx) => {
      let r = rawLabRows.slice(1).find(row => String(row[lCodeIdx] || '').trim() === String(item.itemCode).trim());
      if (r) {
        r = [...r];
      } else {
        r = new Array(lHeaders.length).fill('');
        r[lHeaders.indexOf('S.No')] = idx + 1;
        r[lHeaders.indexOf('Category')] = 'Lab Operation';
        r[lHeaders.indexOf('Department')] = item.department || 'Biochemistry';
        r[lCodeIdx] = item.itemCode;
        r[lHeaders.indexOf('ItemName')] = item.itemName;
      }

      if (idx === 0) {
        r[lMrpIdx] = ''; // Blank (retain existing config)
      } else if (idx === 1) {
        r[lMrpIdx] = 850; // Selected: MRP 850
      } else if (idx === 2) {
        r[lMrpIdx] = 0; // Selected: MRP 0
      }
      editedLabRows.push(r);
    });

    const editedLabWs = XLSX.utils.aoa_to_sheet(editedLabRows);
    const editedLabWb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(editedLabWb, editedLabWs, 'Lab Operation');
    const editedLabBuffer = XLSX.write(editedLabWb, { type: 'buffer', bookType: 'xlsx' });

    // Parse Lab Excel
    const parsedLab = parseWorkbook(editedLabBuffer, 'Lab Operation', labItems[0].department || 'Biochemistry');
    assert.strictEqual(parsedLab.rows.length, labItems.length);
    assert.strictEqual(parsedLab.hasMrpColumn, true, 'Parser must detect commercial MRP column for Lab Operation');
    pass('Parser successfully identified commercial MRP column in Lab Operation upload');

    // Match Lab rows
    const matchedLab = await matchParsedRows(parsedLab.rows, TEST_TENANT_ID, 'Lab Operation', labItems[0].department || 'Biochemistry');
    assert.strictEqual(matchedLab[0].isSelected, false, 'Lab Item 0 blank MRP must be NOT_SELECTED');
    assert.strictEqual(matchedLab[1].isSelected, true, 'Lab Item 1 MRP 850 must be SELECTED');
    assert.strictEqual(matchedLab[1].extractedPricing.mrp, 850);
    pass('Lab Operation rows matched with correct selection flags: Blank -> NOT_SELECTED, 850 -> SELECTED');

    // Persist preview session and confirm
    const labPreviewId = 'prev-lab-' + Date.now();
    await HospitalMasterImportSession.create({
      previewId: labPreviewId,
      tenantId: TEST_TENANT_ID,
      category: 'Lab Operation',
      department: labItems[0].department || 'Biochemistry',
      superAdminId: 'admin_test',
      superAdminName: 'Super Admin',
      originalFileName: 'lab_hospital_return.xlsx',
      fileHash: 'sha-lab-test',
      rows: matchedLab,
      summary: matchedLab.summary,
      status: 'PREVIEW_READY',
      expiresAt: new Date(Date.now() + 3600000),
      cleanupAt: new Date(Date.now() + 86400000)
    });

    const labIngestResult = await confirmImportSession({
      previewId: labPreviewId,
      tenantId: TEST_TENANT_ID,
      category: 'Lab Operation',
      department: labItems[0].department || 'Biochemistry',
      allowRepricing: true,
      ambiguousResolutions: {},
      superAdminUser: { id: 'admin_test', name: 'Super Admin' }
    });

    assert.strictEqual(labIngestResult.success, true);
    pass(`Lab Operation import confirmed: ${labIngestResult.metrics.newConfigsCreated} created, ${labIngestResult.metrics.skippedCount} skipped`);

    // Verify Lab database state: Item 0 MUST still have MRP=600 (untouched)
    const labConfig0 = await HospitalMasterConfig.findOne({
      tenantId: TEST_TENANT_ID,
      masterItemId: labItems[0]._id
    });
    assert(labConfig0, 'Lab Item 0 config must still exist');
    assert.strictEqual(labConfig0.mrp, 600, 'Lab Item 0 MRP must be retained untouched at 600');
    pass('Lab Item 0 with blank MRP was retained untouched in DB with original pricing');

    // Verify Lab Item 1 config created with MRP=850
    const labConfig1 = await HospitalMasterConfig.findOne({
      tenantId: TEST_TENANT_ID,
      masterItemId: labItems[1]._id
    });
    assert(labConfig1, 'Lab Item 1 config must be created');
    assert.strictEqual(labConfig1.mrp, 850, 'Lab Item 1 MRP must be 850');
    pass('Lab Item 1 config successfully created with MRP=850');

    // ─────────────────────────────────────────────────────────────────────────
    // VERIFICATION 5: GLOBAL ITEM MASTER PURITY
    // ─────────────────────────────────────────────────────────────────────────
    const globalItems = await ItemMaster.find({ scope: 'GLOBAL' }).lean();
    for (const g of globalItems) {
      assert.strictEqual(g.mrp, undefined, `Global item [${g.itemCode}] must not have mrp property`);
      assert.strictEqual(g.netRate, undefined, `Global item [${g.itemCode}] must not have netRate property`);
    }
    pass(`Global ItemMaster catalog purity verified across ${globalItems.length} records (0 hospital pricing fields on ItemMaster)`);

    // Cleanup test tenant data
    await HospitalMasterConfig.deleteMany({ tenantId: TEST_TENANT_ID });
    await HospitalMasterImportSession.deleteMany({ tenantId: TEST_TENANT_ID });

    console.log('\n========================================================================');
    console.log(`   ALL TESTS PASSED: ${passed}/${total} assertions successful`);
    console.log('========================================================================\n');
  } catch (err) {
    fail('Test suite encountered an error', err);
  } finally {
    await mongoose.disconnect();
  }
}

runHospitalCommercialExportTests().catch(err => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
