/**
 * QUROXA — End-to-End Test Suite:
 * Global Lab Test Master Integration & Hospital-Specific Availability
 */

const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const ItemMaster = require('../models/ItemMaster');
const HospitalMasterConfig = require('../models/HospitalMasterConfig');
const ItemMasterRequest = require('../models/ItemMasterRequest');
const LabRequest = require('../models/LabRequest');
const LaboratoryMaster = require('../models/LaboratoryMaster');
const HospitalAffiliateLabConfig = require('../models/HospitalAffiliateLabConfig');

const { generateHospitalCommercialExportWorkbook } = require('../services/masterExportService');
const { parseWorkbook } = require('../services/masterWorkbookParser');
const { matchParsedRows } = require('../services/masterMatchingEngine');

async function runTests() {
  const uri = process.env.MONGO_URI || 'mongodb://localhost:27017/clinical_management';
  console.log('Connecting to database:', uri);
  await mongoose.connect(uri);

  let passed = 0;
  let failed = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`  ✓ PASS: ${message}`);
      passed++;
    } else {
      console.error(`  ✕ FAIL: ${message}`);
      failed++;
    }
  }

  console.log('\n======================================================');
  console.log('TEST SUITE: GLOBAL LAB TEST MASTER & HOSPITAL INTEGRATION');
  console.log('======================================================');

  const TEST_TENANT_A = 'test-hosp-alpha-99';
  const TEST_TENANT_B = 'test-hosp-beta-88';

  try {
    // Clean up test tenants if existing
    await HospitalMasterConfig.deleteMany({ tenantId: { $in: [TEST_TENANT_A, TEST_TENANT_B] } });
    await LabRequest.deleteMany({ tenantId: { $in: [TEST_TENANT_A, TEST_TENANT_B] } });
    await ItemMasterRequest.deleteMany({ tenantId: { $in: [TEST_TENANT_A, TEST_TENANT_B] } });

    // ─────────────────────────────────────────────────────────────────────────
    // TEST 1: Global Item Master Canonical Lab Tests
    // ─────────────────────────────────────────────────────────────────────────
    console.log('\n[1] GLOBAL ITEM MASTER CANONICAL TEST DEFINITIONS');
    const globalLabItemsCount = await ItemMaster.countDocuments({
      scope: 'GLOBAL',
      $or: [{ category: 'Lab Operation' }, { categoryType: 'Lab Operation' }]
    });
    assert(globalLabItemsCount > 1000, `Global Item Master has ${globalLabItemsCount} canonical Lab Operation items (> 1000 required).`);

    const cbcItem = await ItemMaster.findOne({
      scope: 'GLOBAL',
      category: 'Lab Operation',
      $or: [{ itemCode: 'RHM10007' }, { itemName: /Complete Blood Count|CBC/i }]
    }).lean();
    assert(Boolean(cbcItem), 'CBC / Complete Blood Count exists in Global Item Master.');
    assert(cbcItem?.scope === 'GLOBAL', 'CBC item has scope GLOBAL.');
    assert(cbcItem?.department === 'Hematology' || cbcItem?.departmentType === 'Hematology', `CBC is assigned to Hematology department (found: ${cbcItem?.department}).`);

    // ─────────────────────────────────────────────────────────────────────────
    // TEST 2: Hospital-Specific Test Selection & Pricing Isolation
    // ─────────────────────────────────────────────────────────────────────────
    console.log('\n[2] HOSPITAL-SPECIFIC SELECTION & PRICING ISOLATION');
    // Hospital A activates CBC at ₹350
    const configA = await HospitalMasterConfig.create({
      tenantId: TEST_TENANT_A,
      masterItemId: cbcItem._id,
      category: 'Lab Operation',
      department: cbcItem.department || 'Hematology',
      mrp: 350,
      netRate: 350,
      hospitalCost: 300,
      status: 'Active',
      approvalStatus: 'Approved',
      assignedVia: 'DIRECT_ADMIN'
    });
    assert(Boolean(configA), `Created HospitalMasterConfig for Tenant A (${TEST_TENANT_A}) at ₹350.`);

    // Hospital B activates CBC at ₹450
    const configB = await HospitalMasterConfig.create({
      tenantId: TEST_TENANT_B,
      masterItemId: cbcItem._id,
      category: 'Lab Operation',
      department: cbcItem.department || 'Hematology',
      mrp: 450,
      netRate: 450,
      hospitalCost: 380,
      status: 'Active',
      approvalStatus: 'Approved',
      assignedVia: 'DIRECT_ADMIN'
    });
    assert(Boolean(configB), `Created HospitalMasterConfig for Tenant B (${TEST_TENANT_B}) at ₹450.`);

    // Check Multi-Tenant Pricing Isolation
    const fetchedA = await HospitalMasterConfig.findOne({ tenantId: TEST_TENANT_A, masterItemId: cbcItem._id });
    const fetchedB = await HospitalMasterConfig.findOne({ tenantId: TEST_TENANT_B, masterItemId: cbcItem._id });
    assert(fetchedA.mrp === 350, `Hospital A price is ₹${fetchedA.mrp} (expected 350).`);
    assert(fetchedB.mrp === 450, `Hospital B price is ₹${fetchedB.mrp} (expected 450).`);

    // Verify Global Item Purity
    const globalItemAfter = await ItemMaster.findById(cbcItem._id).lean();
    assert(globalItemAfter.scope === 'GLOBAL', 'Global item scope remains unchanged as GLOBAL.');
    assert(globalItemAfter.tenantId === '__global__', 'Global item tenantId remains __global__.');

    // Test Compound Uniqueness: Hospital A cannot activate the same item twice
    let duplicatePrevented = false;
    try {
      await HospitalMasterConfig.create({
        tenantId: TEST_TENANT_A,
        masterItemId: cbcItem._id,
        category: 'Lab Operation',
        mrp: 999
      });
    } catch (err) {
      duplicatePrevented = true;
    }
    assert(duplicatePrevented, 'Compound unique index prevented duplicate assignment of CBC to Hospital A.');

    // ─────────────────────────────────────────────────────────────────────────
    // TEST 3: Common Workbook Export & Ingestion for Lab Operation
    // ─────────────────────────────────────────────────────────────────────────
    console.log('\n[3] COMMON COMMERCIAL EXPORT & INGESTION CONTRACT');
    // Generate commercial export workbook for Lab Operation
    const exportResult = await generateHospitalCommercialExportWorkbook('Lab Operation', 'Hematology', null, { tenantId: TEST_TENANT_A });
    assert(Boolean(exportResult.buffer), 'Generated commercial export workbook buffer.');
    assert(exportResult.filename.includes('Lab_Operation'), `Filename contains Lab_Operation (${exportResult.filename}).`);

    // Parse the generated workbook back
    const parsed = parseWorkbook(exportResult.buffer, 'Lab Operation', 'Hematology');
    assert(parsed.success === true, 'Parsed exported workbook successfully against MASTER_SCHEMA_REGISTRY.');
    assert(parsed.hasCommercialColumns === true, 'Detected commercial columns (MRP / Net Rate).');
    assert(parsed.rows.length > 0, `Parsed ${parsed.rows.length} rows.`);

    // Match parsed rows against Global ItemMaster
    const matched = await matchParsedRows(parsed.rows, TEST_TENANT_A, 'Lab Operation', 'Hematology');
    assert(matched.length === parsed.rows.length, 'Every row was evaluated by matchParsedRows.');
    const matchedExact = matched.filter(r => r.matchType === 'EXACT_MATCH' || r.matchType === 'SAFE_DETERMINISTIC_MATCH');
    assert(matchedExact.length > 0, `Found ${matchedExact.length} exact/safe matches against Global Item Master.`);

    // Verify row selection convention: row with populated price is isSelected = true
    const selectedRows = matched.filter(r => r.isSelected);
    assert(selectedRows.length > 0, `Hospital A previously priced item correctly marked as isSelected: true (found ${selectedRows.length}).`);

    // ─────────────────────────────────────────────────────────────────────────
    // TEST 4: Clinic / Receptionist Visibility & Backend Enforcement
    // ─────────────────────────────────────────────────────────────────────────
    console.log('\n[4] CLINIC/RECEPTIONIST VISIBILITY & BACKEND ENFORCEMENT');
    // Hospital A has ONLY 1 test configured (CBC). Let's pick a test that Hospital A does NOT have:
    const lipidTest = await ItemMaster.findOne({
      scope: 'GLOBAL',
      $or: [{ category: 'Lab Operation' }, { categoryType: 'Lab Operation' }],
      itemName: /Lipid/i
    }).lean();

    // Query active tests for Hospital A
    const activeConfigsA = await HospitalMasterConfig.find({
      tenantId: TEST_TENANT_A,
      category: 'Lab Operation',
      status: 'Active',
      approvalStatus: 'Approved'
    }).populate('masterItemId').lean();

    assert(activeConfigsA.length === 1, `Hospital A has exactly 1 active test configured (found: ${activeConfigsA.length}).`);
    assert(activeConfigsA[0].masterItemId.itemCode === cbcItem.itemCode, `Hospital A configured test is CBC [${cbcItem.itemCode}].`);

    // Check that unconfigured test (Lipid) is NOT in Hospital A's active catalog
    const hasLipid = activeConfigsA.some(c => c.masterItemId._id.toString() === lipidTest._id.toString());
    assert(!hasLipid, 'Unconfigured global test (Lipid Profile) is NOT visible to Hospital A.');

    // ─────────────────────────────────────────────────────────────────────────
    // TEST 5: Item Requests Workflow for New Diagnostic Test
    // ─────────────────────────────────────────────────────────────────────────
    console.log('\n[5] ITEM REQUESTS WORKFLOW (REQUEST NEW LAB TEST)');
    const reqNo = `IMR-${new Date().getFullYear()}-TEST`;
    const newTestRequest = await ItemMasterRequest.create({
      requestNo: reqNo,
      tenantId: TEST_TENANT_A,
      hospitalName: 'Alpha General Hospital',
      requestedBy: 'Dr. Test Admin',
      requestedByRole: 'admin',
      requestType: 'NEW_GLOBAL_ITEM',
      category: 'Lab Operation',
      department: 'Biochemistry',
      proposedItem: {
        itemName: 'Novel Cardiac Troponin-I High Sensitivity',
        genericName: 'Novel Cardiac Troponin-I High Sensitivity',
        department: 'Biochemistry',
        sampleType: 'Serum',
        description: 'Ultra sensitive cardiac biomarker'
      },
      categoryData: {
        sampleType: 'Serum',
        normalRange: '< 0.04 ng/mL',
        unit: 'ng/mL',
        turnaroundTime: '2 Hours'
      },
      requestedMrp: 850,
      requestedNetRate: 850,
      requestedHospitalCost: 850,
      status: 'PENDING'
    });
    assert(Boolean(newTestRequest), `Created new ItemMasterRequest ${reqNo} for Novel Cardiac Troponin-I.`);
    assert(newTestRequest.status === 'PENDING', 'Request is initially Pending (not yet active in Global Item Master).');

    // Ensure it does not exist in HospitalMasterConfig until approved & activated
    const prematureConfig = await HospitalMasterConfig.findOne({
      tenantId: TEST_TENANT_A,
      category: 'Lab Operation',
      'masterItemId.itemName': /Troponin/i
    });
    assert(!prematureConfig, 'Pending requested test is NOT bookable or configured in HospitalMasterConfig.');

    // ─────────────────────────────────────────────────────────────────────────
    // TEST 6: Affiliate Laboratory Integration
    // ─────────────────────────────────────────────────────────────────────────
    console.log('\n[6] AFFILIATE LABORATORY INTEGRATION');
    // Ensure test booking can associate with affiliated laboratory
    const testLab = await LaboratoryMaster.create({
      code: `LAB-TEST-${Date.now().toString().slice(-4)}`,
      name: 'Alpha Reference Laboratory Ltd.',
      tenantId: TEST_TENANT_A,
      isActive: true
    });

    const labBooking = await LabRequest.create({
      tenantId: TEST_TENANT_A,
      patientId: new mongoose.Types.ObjectId(),
      doctorId: new mongoose.Types.ObjectId(),
      testName: 'Complete Blood Count',
      labId: testLab._id,
      labName: testLab.name,
      labCode: testLab.code,
      status: 'Pending'
    });
    assert(Boolean(labBooking), 'Created lab test booking with affiliated laboratory.');
    assert(String(labBooking.labId) === String(testLab._id), 'Booking retains laboratory reference.');
    assert(labBooking.labName === testLab.name, 'Booking retains laboratory name.');

    // Clean up created laboratory
    await LaboratoryMaster.findByIdAndDelete(testLab._id);
    await LabRequest.findByIdAndDelete(labBooking._id);
    await ItemMasterRequest.findByIdAndDelete(newTestRequest._id);

  } catch (err) {
    console.error('Test execution error:', err);
    failed++;
  } finally {
    // Clean up test tenants
    await HospitalMasterConfig.deleteMany({ tenantId: { $in: [TEST_TENANT_A, TEST_TENANT_B] } });
    await mongoose.disconnect();
  }

  console.log('\n======================================================');
  console.log(`TEST RUN FINISHED: ${passed} PASSED, ${failed} FAILED`);
  console.log('======================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests();
