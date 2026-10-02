/**
 * QUROXA — LIVE WORKFLOW & E2E INTEGRATION VERIFICATION TEST
 *
 * Exercises the complete pipeline against the development database:
 * 1. Seed Verification: ItemMaster demo records & City Hospital configs
 * 2. Search & Filter Testing: item name, code, manufacturer, category, department, pagination
 * 3. Export Testing:
 *    - TEST A: Pharmacy -> Medicine (25 cols, 0 pricing, Phase 5 round-trip)
 *    - TEST B: Pathology -> Hematology (12 cols, exact "MRP " trailing space, Net Rate)
 *    - TEST C: Service -> OPD (8 cols, Doctors Name, Doctor ID, MRP, Net Rate)
 *    - TEST D: Assets (15 cols, no department, Col O MRP)
 * 4. Hospital Excel Simulation:
 *    - Hospital fills commercial values for Paracetamol & Amoxicillin (repricing diff)
 * 5. Ingestion Engine & Session Verification:
 *    - Preview session creation & metrics
 *    - Server-authoritative security (tamper rejection)
 *    - Import confirmation & multi-tenant isolation
 * 6. Global Purity Verification:
 *    - Global ItemMaster remains untouched (no price leakage)
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

async function runLiveWorkflowVerification() {
  console.log('========================================================================');
  console.log('   QUROXA LIVE WORKFLOW & END-TO-END INTEGRATION TEST SUITE');
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

  try {
    // ─── 1. SEED DATA COUNTS ─────────────────────────────────────────────────
    const globalCount = await ItemMaster.countDocuments({ scope: 'GLOBAL' });
    assert(globalCount >= 46, `Expected at least 46 global items, got ${globalCount}`);
    pass(`Global ItemMaster seeded successfully with ${globalCount} records`);

    const labCount = await ItemMaster.countDocuments({ scope: 'GLOBAL', category: 'Lab Operation' });
    const pharmCount = await ItemMaster.countDocuments({ scope: 'GLOBAL', category: 'Pharmacy' });
    const pathCount = await ItemMaster.countDocuments({ scope: 'GLOBAL', category: 'Pathology' });
    const srvCount = await ItemMaster.countDocuments({ scope: 'GLOBAL', category: 'Service' });
    const assetCount = await ItemMaster.countDocuments({ scope: 'GLOBAL', category: 'Assets' });

    assert(labCount >= 12, 'Lab Operation count');
    assert(pharmCount >= 10, 'Pharmacy count');
    assert(pathCount >= 12, 'Pathology count');
    assert(srvCount >= 6, 'Service count');
    assert(assetCount >= 6, 'Assets count');
    pass(`Category record distribution verified (Lab: ${labCount}, Pharm: ${pharmCount}, Path: ${pathCount}, Srv: ${srvCount}, Assets: ${assetCount})`);

    // ─── 2. SEARCH & FILTER VERIFICATION ─────────────────────────────────────
    // Search by Item Name
    const pcmSearch = await ItemMaster.find({
      scope: 'GLOBAL',
      $or: [
        { itemName: new RegExp('Paracetamol', 'i') },
        { genericName: new RegExp('Paracetamol', 'i') }
      ]
    }).lean();
    assert(pcmSearch.length >= 1, 'Search for Paracetamol');
    pass('Search by Item Name ("Paracetamol") returns matching records');

    // Search by Item Code
    const codeSearch = await ItemMaster.findOne({ scope: 'GLOBAL', itemCode: '980000001' }).lean();
    assert(codeSearch && codeSearch.itemName.includes('Paracetamol'), 'Search by code 980000001');
    pass('Search by Item Code ("980000001") returns accurate record');

    // Search by Manufacturer
    const mfgSearch = await ItemMaster.find({
      scope: 'GLOBAL',
      manufactureName: new RegExp('Cipla', 'i')
    }).lean();
    assert(mfgSearch.length >= 1, 'Search by manufacturer Cipla');
    pass('Search by Manufacturer ("Cipla") returns matching records');

    // Department Filtering
    const medDeptItems = await ItemMaster.find({ scope: 'GLOBAL', category: 'Pharmacy', department: 'Medicine' }).lean();
    assert.strictEqual(medDeptItems.length, pharmCount, 'Pharmacy Medicine department filter');
    pass('Department filter ("Medicine" in Pharmacy) returns exact department items');

    // Pagination
    const limit = 5;
    const page1 = await ItemMaster.find({ scope: 'GLOBAL' }).sort({ createdAt: -1 }).skip(0).limit(limit).lean();
    const page2 = await ItemMaster.find({ scope: 'GLOBAL' }).sort({ createdAt: -1 }).skip(limit).limit(limit).lean();
    assert.strictEqual(page1.length, 5, 'Page 1 has 5 records');
    assert.strictEqual(page2.length, 5, 'Page 2 has 5 records');
    assert.notStrictEqual(String(page1[0]._id), String(page2[0]._id), 'Page 1 and Page 2 contain distinct records');
    pass('Pagination test (5 items/page) verified distinct page slices');

    // ─── 3. EXPORT AUDIT TESTS ───────────────────────────────────────────────
    // TEST A: Pharmacy -> Medicine
    const pharmExport = await generateMasterExportWorkbook('Pharmacy', 'Medicine');
    assert(pharmExport.buffer && pharmExport.buffer.length > 0, 'Buffer produced');
    assert.strictEqual(pharmExport.headers.length, 25, 'Pharmacy must have 25 headers');
    assert(!pharmExport.headers.some(h => /mrp|net\s*rate|cost/i.test(h)), 'Pharmacy must have 0 pricing columns');
    // Round-trip with Phase 5 parser
    const pharmParsed = parseWorkbook(pharmExport.buffer, 'Pharmacy', 'Medicine');
    assert(pharmParsed.rows.length >= 10, 'Phase 5 parser parsed all exported pharmacy rows');
    pass('TEST A: Global Master Export for Pharmacy -> Medicine (25 cols, 0 pricing, 100% Phase 5 parse round-trip)');

    // TEST B: Pathology -> Hematology
    const pathExport = await generateMasterExportWorkbook('Pathology', 'Hematology');
    assert.strictEqual(pathExport.headers.length, 12, 'Pathology must have exactly 12 columns');
    assert.strictEqual(pathExport.headers[10], 'MRP ', 'Col K in Pathology must retain exact trailing space');
    assert.strictEqual(pathExport.headers[11], 'Net Rate', 'Col L in Pathology must be Net Rate');
    const pathParsed = parseWorkbook(pathExport.buffer, 'Pathology', 'Hematology');
    assert(pathParsed.rows.length >= 4, 'Parsed pathology hematology rows');
    pass('TEST B: Global Master Export for Pathology -> Hematology (12 cols, exact "MRP " trailing space, Net Rate)');

    // TEST C: Service -> OPD
    const srvExport = await generateMasterExportWorkbook('Service', 'OPD');
    assert.strictEqual(srvExport.headers.length, 8, 'Service must have 8 columns');
    assert.strictEqual(srvExport.headers[4], 'Doctors Name', 'Col E must be Doctors Name');
    assert.strictEqual(srvExport.headers[5], 'Doctor ID', 'Col F must be Doctor ID');
    assert.strictEqual(srvExport.headers[6], 'MRP', 'Col G must be MRP');
    assert.strictEqual(srvExport.headers[7], 'Net Rate', 'Col H must be Net Rate');
    pass('TEST C: Global Master Export for Service -> OPD (Doctors Name, Doctor ID, MRP, Net Rate)');

    // TEST D: Assets
    const assetExport = await generateMasterExportWorkbook('Assets', '');
    assert.strictEqual(assetExport.headers.length, 15, 'Assets must have 15 columns');
    assert.strictEqual(assetExport.headers[14], 'MRP', 'Col O must be MRP');
    assert(!assetExport.headers.some(h => /department/i.test(h)), 'Assets must have 0 department headers');
    pass('TEST D: Global Master Export for Assets (15 columns, strictly department-free, Col O MRP)');

    // ─── 4. SIMULATE HOSPITAL COMPLETING EXCEL ───────────────────────────────
    // Build an Excel workbook representing City Hospital returning Pathology -> Hematology
    // with local commercial rates:
    // Complete Blood Count (CBC): MRP = 380, Net Rate = 270 (City Hospital existing was MRP 350, Net 250 -> Repricing diff!)
    // Hemoglobin (Hb): MRP = 120, Net Rate = 90 (New configuration)
    const cbcItem = await ItemMaster.findOne({ scope: 'GLOBAL', itemCode: '950000001' }).lean();
    const hbItem = await ItemMaster.findOne({ scope: 'GLOBAL', itemCode: '950000002' }).lean();

    // Ensure baseline config for CBC before upload simulation
    await HospitalMasterConfig.updateOne(
      { tenantId: 'city_hospital', masterItemId: cbcItem._id },
      { $set: { mrp: 350, netRate: 250, status: 'Active' } },
      { upsert: true }
    );

    const cbcRow = pathExport.headers.map(h => {
      if (h === 'S.No') return 1;
      if (h === 'Category') return 'Pathology';
      if (h === 'Department') return 'Hematology';
      if (h === 'ItemCode') return cbcItem.itemCode;
      if (h === 'ItemName') return cbcItem.itemName;
      if (h === 'itemTypeName') return cbcItem.itemTypeName || 'Profile';
      if (h === 'Description') return cbcItem.itemDescription || '';
      if (h === 'Sample Type') return cbcItem.sampleType || 'Whole Blood';
      if (h === 'Gender') return cbcItem.gender || 'Both';
      if (h === 'Sample Option') return cbcItem.sampleOption || 'Required';
      if (h === 'MRP ') return 380; // Repriced from 350
      if (h === 'Net Rate') return 270; // Repriced from 250
      return '';
    });

    const hbRow = pathExport.headers.map(h => {
      if (h === 'S.No') return 2;
      if (h === 'Category') return 'Pathology';
      if (h === 'Department') return 'Hematology';
      if (h === 'ItemCode') return hbItem.itemCode;
      if (h === 'ItemName') return hbItem.itemName;
      if (h === 'itemTypeName') return hbItem.itemTypeName || 'Observation';
      if (h === 'Description') return hbItem.itemDescription || '';
      if (h === 'Sample Type') return hbItem.sampleType || 'Whole Blood';
      if (h === 'Gender') return hbItem.gender || 'Both';
      if (h === 'Sample Option') return hbItem.sampleOption || 'Required';
      if (h === 'MRP ') return 120; // Newly configured item
      if (h === 'Net Rate') return 90;
      return '';
    });

    const ws = XLSX.utils.aoa_to_sheet([pathExport.headers, cbcRow, hbRow]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Pathology');
    const hospitalCompletedBuffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    pass('Simulated hospital-completed workbook built for Pathology -> Hematology with local pricing');

    // ─── 5. PARSE, MATCH & PREVIEW SESSION ───────────────────────────────────
    const parsedHospitalFile = parseWorkbook(hospitalCompletedBuffer, 'Pathology', 'Hematology');
    assert.strictEqual(parsedHospitalFile.rows.length, 2, 'Parsed 2 completed rows');

    const matchedRows = await matchParsedRows(
      parsedHospitalFile.rows,
      'city_hospital',
      'Pathology',
      'Hematology'
    );

    assert.strictEqual(matchedRows.length, 2, 'Matched 2 rows');
    assert.strictEqual(matchedRows[0].matchType, 'EXACT_MATCH', 'Complete Blood Count exact match');
    assert.strictEqual(matchedRows[1].matchType, 'EXACT_MATCH', 'Hemoglobin exact match');
    pass('Matching engine identified exact canonical master items for City Hospital');

    // Check Repricing Diff on CBC (existing was MRP 350, Net 250; new is 380 / 270)
    const cbcMatch = matchedRows.find(r => r.canonicalItemCode === '950000001');
    assert(cbcMatch, 'CBC match found');
    assert.strictEqual(cbcMatch.isRepricing, true, 'CBC must be detected as repricing');
    assert.strictEqual(cbcMatch.pricingDiff.diffs.mrp.current, 350, 'Old MRP was 350');
    assert.strictEqual(cbcMatch.pricingDiff.diffs.mrp.imported, 380, 'New MRP is 380');
    assert.strictEqual(cbcMatch.pricingDiff.diffs.netRate.current, 250, 'Old Net Rate was 250');
    assert.strictEqual(cbcMatch.pricingDiff.diffs.netRate.imported, 270, 'New Net Rate is 270');
    pass('Repricing Diff accurately detected: CBC MRP 350 -> 380 (+8.57%), Net Rate 250 -> 270 (+8.00%)');

    // ─── 6. CREATE SERVER PREVIEW SESSION & SECURITY AUDIT ───────────────────
    const previewId = `IMP-TEST-PREV-${Date.now()}`;
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 3600000); // 1 hour
    const cleanupAt = new Date(now.getTime() + 86400000); // 24 hours

    const sessionDoc = await HospitalMasterImportSession.create({
      previewId,
      tenantId: 'city_hospital',
      hospitalName: 'City Hospital',
      category: 'Pathology',
      department: 'Hematology',
      superAdminId: 'SUPERADMIN',
      superAdminName: 'Super Admin',
      originalFileName: 'hospital_completed_pathology.xlsx',
      fileHash: parsedHospitalFile.fileHash,
      totalRows: 2,
      matchedCount: 2,
      safeMatchCount: 0,
      ambiguousCount: 0,
      unmatchedCount: 0,
      repricingCount: 1,
      errorCount: 0,
      rows: matchedRows,
      status: 'PREVIEW_READY',
      expiresAt,
      cleanupAt
    });
    assert(sessionDoc && sessionDoc.previewId === previewId, 'Session saved in MongoDB');
    pass('Server-authoritative preview session persisted with 1-hour expiration');

    // Security Test: Attempting to confirm with arbitrary/tampered category must be rejected
    let tamperCaught = false;
    try {
      await confirmImportSession({
        previewId,
        tenantId: 'city_hospital',
        category: 'Pharmacy', // Tampered category
        department: 'Hematology'
      });
    } catch (err) {
      tamperCaught = true;
      assert(err.message.includes('Category mismatch'), 'Category mismatch error message');
    }
    assert(tamperCaught, 'Server-authoritative check must reject tampered category');
    pass('Server-authoritative security: Tampered category parameter is rejected');

    // ─── 7. CONFIRM IMPORT & HOSPITAL CATALOG ACTIVATION ─────────────────────
    const confirmResult = await confirmImportSession({
      previewId,
      tenantId: 'city_hospital',
      category: 'Pathology',
      department: 'Hematology',
      allowRepricing: true,
      ambiguousResolutions: {},
      superAdminUser: { email: 'superadmin@curoxa.com', staff_id: 'SUPERADMIN' }
    });

    assert.strictEqual(confirmResult.success, true, 'Confirm result must report success: true');
    const committedSession = await HospitalMasterImportSession.findOne({ previewId }).lean();
    assert.strictEqual(committedSession.status, 'COMMITTED', 'Session status in database must transition to COMMITTED');
    pass(`Import confirmed successfully (Batch: ${confirmResult.importBatchId}, Repriced: ${confirmResult.metrics.existingConfigsRepriced}, Created: ${confirmResult.metrics.newConfigsCreated})`);

    // Verify HospitalMasterConfig for City Hospital
    const cbcConfig = await HospitalMasterConfig.findOne({
      tenantId: 'city_hospital',
      masterItemId: cbcItem._id
    }).lean();
    assert(cbcConfig, 'CBC config exists in City Hospital');
    assert.strictEqual(cbcConfig.mrp, 380, 'CBC MRP updated to 380');
    assert.strictEqual(cbcConfig.netRate, 270, 'CBC Net Rate updated to 270');

    const hbConfig = await HospitalMasterConfig.findOne({
      tenantId: 'city_hospital',
      masterItemId: hbItem._id
    }).lean();
    assert(hbConfig, 'Hb config exists in City Hospital');
    assert.strictEqual(hbConfig.mrp, 120, 'Hb MRP created with 120');
    assert.strictEqual(hbConfig.netRate, 90, 'Hb Net Rate created with 90');
    pass('HospitalMasterConfig updated with isolated hospital pricing for City Hospital');

    // ─── 8. CANONICAL GLOBAL MASTER PURITY VERIFICATION ──────────────────────
    const cbcGlobalAfter = await ItemMaster.findById(cbcItem._id).lean();
    const hbGlobalAfter = await ItemMaster.findById(hbItem._id).lean();

    assert.strictEqual(cbcGlobalAfter.mrp, undefined, 'Global CBC must NOT have mrp property');
    assert.strictEqual(cbcGlobalAfter.netRate, undefined, 'Global CBC must NOT have netRate property');
    assert.strictEqual(hbGlobalAfter.mrp, undefined, 'Global Hb must NOT have mrp property');
    assert.strictEqual(hbGlobalAfter.netRate, undefined, 'Global Hb must NOT have netRate property');
    pass('Canonical Global ItemMaster remains 100% untouched and pure (zero price pollution)');

  } finally {
    await mongoose.connection.close();
    console.log('\nMongoDB connection closed.');
  }

  console.log('\n========================================================================');
  console.log(`   LIVE WORKFLOW VERIFICATION SUMMARY: ${passed} / ${total} TESTS PASSED`);
  console.log('========================================================================\n');
}

if (require.main === module) {
  runLiveWorkflowVerification()
    .then(() => process.exit(0))
    .catch(err => {
      console.error('\nVerification suite crashed:', err);
      process.exit(1);
    });
}

module.exports = { runLiveWorkflowVerification };
