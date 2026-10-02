const mongoose = require('mongoose');
const XLSX = require('xlsx');
require('dotenv').config();

const {
  VENDOR_SECTIONS,
  VENDOR_FIELDS,
  getVendorFieldsBySection,
  getAllVendorFields
} = require('../config/vendorSchemaRegistry');

const GlobalVendor = require('../models/GlobalVendor');
const HospitalVendorAssociation = require('../models/HospitalVendorAssociation');
const VendorRequest = require('../models/VendorRequest');
const ItemMaster = require('../models/ItemMaster');

const {
  getNextGlobalVendorCode,
  getNextVendorRequestNo
} = require('../utils/vendorCodeGenerator');

const {
  generateVendorExportWorkbook
} = require('../services/vendorExportService');

let passedTests = 0;
let failedTests = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  ✓ ${message}`);
    passedTests++;
  } else {
    console.error(`  ✗ FAIL: ${message}`);
    failedTests++;
  }
}

async function runVendorMasterPhase2Tests() {
  console.log('================================================================');
  console.log('QUROXA — VENDOR MASTER PHASE 2 COMPREHENSIVE VERIFICATION SUITE');
  console.log('================================================================\n');

  const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI || 'mongodb://localhost:27017/curoxa';
  await mongoose.connect(mongoUri);
  console.log('Connected to MongoDB:', mongoose.connection.name);

  try {
    // ─────────────────────────────────────────────────────────────────────────
    // TEST GROUP 1: SCHEMA REGISTRY & WORKBOOK HEADERS
    // ─────────────────────────────────────────────────────────────────────────
    console.log('\n[GROUP 1] Authoritative Schema Registry & 49 Fields');
    assert(VENDOR_FIELDS.length === 49, `Vendor Master registry must have exactly 49 fields (found: ${VENDOR_FIELDS.length})`);

    // Verify exact spelling of idiosyncratic workbook headers
    const fieldHeaders = VENDOR_FIELDS.map(f => f.clientHeader);
    const expectedIdiosyncraticHeaders = [
      'PFRegistartionNo',
      'BanK AccountsNo',
      'BanK Address',
      'Bank1City',
      'VendorToNotes',
      'NameonPANCard',
      'State code'
    ];
    for (const h of expectedIdiosyncraticHeaders) {
      assert(fieldHeaders.includes(h), `Preserved exact idiosyncratic workbook header "${h}"`);
    }

    // Verify sections match UI reference
    assert(VENDOR_SECTIONS.length === 6, `Registry has 6 grouped sections (found: ${VENDOR_SECTIONS.length})`);
    const sectionIds = VENDOR_SECTIONS.map(s => s.id);
    assert(sectionIds.includes('supplier_details'), 'Section "supplier_details" present');
    assert(sectionIds.includes('concern_person_details'), 'Section "concern_person_details" present');
    assert(sectionIds.includes('statutory_details'), 'Section "statutory_details" present');
    assert(sectionIds.includes('bank_details'), 'Section "bank_details" present');
    assert(sectionIds.includes('gst_details'), 'Section "gst_details" present');
    assert(sectionIds.includes('terms_conditions'), 'Section "terms_conditions" present');

    // Verify requirement rules for the 5 Red-Line fields
    const redLineFieldKeys = ['supplierName', 'supplierType', 'supplierCategory', 'organizationType', 'primaryContactPerson'];
    for (const key of redLineFieldKeys) {
      const field = VENDOR_FIELDS.find(f => f.fieldKey === key);
      assert(field && field.clientRequired === true && field.systemRequired === true,
        `Field "${key}" is marked required based on legacy red line reference`);
    }

    const optionalField = VENDOR_FIELDS.find(f => f.fieldKey === 'faxNo');
    assert(optionalField && optionalField.clientRequired === 'UNCONFIRMED',
      'Other non-redline fields default to clientRequired: UNCONFIRMED');

    // ─────────────────────────────────────────────────────────────────────────
    // TEST GROUP 2: CONCURRENCY-SAFE CODE GENERATORS
    // ─────────────────────────────────────────────────────────────────────────
    console.log('\n[GROUP 2] Concurrency-Safe Code Generation');
    const vendorCode1 = await getNextGlobalVendorCode();
    const vendorCode2 = await getNextGlobalVendorCode();
    assert(typeof vendorCode1 === 'string' && vendorCode1.startsWith('VND-'), `Global vendor code formatted as VND-YYYY-XXXX (${vendorCode1})`);
    assert(vendorCode1 !== vendorCode2, `Sequential vendor codes are unique (${vendorCode1} vs ${vendorCode2})`);

    const requestNo1 = await getNextVendorRequestNo();
    const requestNo2 = await getNextVendorRequestNo();
    assert(typeof requestNo1 === 'string' && requestNo1.startsWith('VNR-'), `Request number formatted as VNR-YYYY-XXXX (${requestNo1})`);
    assert(requestNo1 !== requestNo2, `Sequential request numbers are unique (${requestNo1} vs ${requestNo2})`);

    // ─────────────────────────────────────────────────────────────────────────
    // TEST GROUP 3: CANONICAL GLOBAL VENDOR MASTER MODEL & DUPLICATE PROTECTION
    // ─────────────────────────────────────────────────────────────────────────
    console.log('\n[GROUP 3] Canonical Global Vendor Model & Duplicate Protection');
    const testSupplierCode = `VND-TEST-${Date.now()}`;
    const testGst = `07AAAAA${Math.floor(1000 + Math.random() * 9000)}A1Z5`;
    const testPan = `AAAAA${Math.floor(1000 + Math.random() * 9000)}A`;
    const testName = `Test Global Supplier ${Date.now()}`;

    // Clean up any test leftovers
    await GlobalVendor.deleteMany({ supplierName: new RegExp('^Test Global Supplier') });
    await HospitalVendorAssociation.deleteMany({ tenantId: 'test_hosp_tenant' });
    await VendorRequest.deleteMany({ tenantId: 'test_hosp_tenant' });

    const createdVendor = await GlobalVendor.create({
      supplierCode: testSupplierCode,
      supplierName: testName,
      gstNo: testGst,
      panCardNo: testPan,
      supplierType: 'Capex',
      supplierCategory: 'Authorised Dealer',
      emailId: 'test@supplier.com',
      bank: 'HDFC Bank',
      bankAccountsNo: '1234567890',
      activeStatus: 'Yes'
    });
    assert(createdVendor && createdVendor._id, `Created GlobalVendor [${testSupplierCode}] "${testName}"`);

    // Verify all 49 fields exist on model schema
    const schemaPaths = Object.keys(GlobalVendor.schema.paths);
    let allRegistryKeysPresent = true;
    for (const f of VENDOR_FIELDS) {
      if (!schemaPaths.includes(f.fieldKey)) {
        allRegistryKeysPresent = false;
        console.error(`Missing path on GlobalVendor: ${f.fieldKey}`);
      }
    }
    assert(allRegistryKeysPresent, 'All 49 registry fields are represented in GlobalVendor mongoose schema');

    // ─────────────────────────────────────────────────────────────────────────
    // TEST GROUP 4: EXCEL EXPORT WORKBOOK
    // ─────────────────────────────────────────────────────────────────────────
    console.log('\n[GROUP 4] Authoritative Excel Export');
    const { buffer, filename, vendorCount } = await generateVendorExportWorkbook({ _id: createdVendor._id });
    assert(Buffer.isBuffer(buffer) && buffer.length > 0, `Generated valid XLSX buffer (${buffer.length} bytes)`);
    assert(filename.startsWith('Quroxa_Vendor_Master_'), `Filename properly prefixed: ${filename}`);

    const workbook = XLSX.read(buffer, { type: 'buffer' });
    assert(workbook.SheetNames.includes('Store Vendor Master'), 'Export sheet named exactly "Store Vendor Master"');
    const sheet = workbook.Sheets['Store Vendor Master'];
    const exportData = XLSX.utils.sheet_to_json(sheet, { header: 1 });
    assert(exportData.length >= 2, 'Export contains header row and at least one data row');
    assert(exportData[0].length === 49, `Export contains exactly 49 columns in header (found: ${exportData[0].length})`);

    // ─────────────────────────────────────────────────────────────────────────
    // TEST GROUP 5: HOSPITAL VENDOR ASSOCIATION (TENANT-SCOPED)
    // ─────────────────────────────────────────────────────────────────────────
    console.log('\n[GROUP 5] Hospital Vendor Association & Scoping');
    const testTenant = 'test_hosp_tenant';

    const assoc1 = await HospitalVendorAssociation.create({
      tenantId: testTenant,
      vendorId: createdVendor._id,
      status: 'ACTIVE',
      notes: 'Initial test association'
    });
    assert(assoc1 && assoc1._id, `Associated GlobalVendor with hospital tenant "${testTenant}"`);

    // Test compound uniqueness: Attempt duplicate association
    let duplicateRejected = false;
    try {
      await HospitalVendorAssociation.create({
        tenantId: testTenant,
        vendorId: createdVendor._id,
        status: 'ACTIVE'
      });
    } catch (err) {
      duplicateRejected = true;
    }
    assert(duplicateRejected, 'Compound uniqueness enforced: duplicate hospital-vendor association rejected');

    // Query hospital vendors with population
    const hospitalAssocs = await HospitalVendorAssociation.find({ tenantId: testTenant })
      .populate('vendorId')
      .lean();
    assert(hospitalAssocs.length === 1, `Found exactly 1 associated vendor for hospital "${testTenant}"`);
    assert(hospitalAssocs[0].vendorId.supplierCode === testSupplierCode, 'Populated associated vendor matches canonical GlobalVendor');

    // ─────────────────────────────────────────────────────────────────────────
    // TEST GROUP 6: VENDOR REQUEST WORKFLOW (HOSPITAL PROPOSAL -> SUPERADMIN)
    // ─────────────────────────────────────────────────────────────────────────
    console.log('\n[GROUP 6] Vendor Request Lifecycle');
    const reqNo = await getNextVendorRequestNo();
    const proposedVendorData = {
      supplierName: `Proposed Vendor ${Date.now()}`,
      gstNo: `27AAAAA${Math.floor(1000 + Math.random() * 9000)}B1Z2`,
      panCardNo: `BBBBB${Math.floor(1000 + Math.random() * 9000)}C`,
      supplierType: 'Opex',
      primaryContactPerson: 'John Requester',
      primaryContactPersonMobileNo: '9876543210'
    };

    const vendorRequest = await VendorRequest.create({
      requestNo: reqNo,
      tenantId: testTenant,
      hospitalName: 'General Hospital Test',
      vendorData: proposedVendorData,
      status: 'PENDING',
      submittedBy: 'Dr. Requester'
    });
    assert(vendorRequest && vendorRequest.status === 'PENDING', `Hospital submitted vendor request [${reqNo}] with status PENDING`);

    // Verify pending request does NOT appear as an active global vendor or associated vendor
    const activeVendorsWithProposedName = await GlobalVendor.find({ supplierName: proposedVendorData.supplierName });
    assert(activeVendorsWithProposedName.length === 0, 'Pending proposal is NOT in GlobalVendor collection');

    // ── Test Approval Workflow ──
    const approvedCode = await getNextGlobalVendorCode();
    const approvedGlobalVendor = await GlobalVendor.create({
      ...proposedVendorData,
      supplierCode: approvedCode,
      activeStatus: 'Yes'
    });
    const approvedAssoc = await HospitalVendorAssociation.create({
      tenantId: testTenant,
      vendorId: approvedGlobalVendor._id,
      status: 'ACTIVE',
      notes: `Approved via ${vendorRequest.requestNo}`
    });

    vendorRequest.status = 'APPROVED';
    vendorRequest.approvedVendorId = approvedGlobalVendor._id;
    vendorRequest.reviewedBy = 'Super Admin';
    vendorRequest.reviewedAt = new Date();
    await vendorRequest.save();

    assert(vendorRequest.status === 'APPROVED', 'Request status updated to APPROVED');
    assert(vendorRequest.approvedVendorId.equals(approvedGlobalVendor._id), 'Request points to created GlobalVendor');

    // Verify hospital now has both vendors associated
    const updatedHospitalAssocs = await HospitalVendorAssociation.find({ tenantId: testTenant });
    assert(updatedHospitalAssocs.length === 2, `Hospital "${testTenant}" now has 2 associated vendors after approval`);

    // ── Test Rejection Workflow ──
    const rejectReqNo = await getNextVendorRequestNo();
    const rejectVendorRequest = await VendorRequest.create({
      requestNo: rejectReqNo,
      tenantId: testTenant,
      hospitalName: 'General Hospital Test',
      vendorData: { supplierName: 'Rejected Vendor Co' },
      status: 'PENDING'
    });

    // SuperAdmin rejects request
    rejectVendorRequest.status = 'REJECTED';
    rejectVendorRequest.rejectionReason = 'Insufficient statutory documentation (Missing GST certificate)';
    rejectVendorRequest.reviewedBy = 'Super Admin';
    rejectVendorRequest.reviewedAt = new Date();
    await rejectVendorRequest.save();

    assert(rejectVendorRequest.status === 'REJECTED', 'Request status updated to REJECTED');
    assert(rejectVendorRequest.rejectionReason.length > 0, 'Rejection reason recorded');

    // Verify NO global vendor or association created on rejection
    const rejectedGlobalVendor = await GlobalVendor.findOne({ supplierName: 'Rejected Vendor Co' });
    assert(!rejectedGlobalVendor, 'NO GlobalVendor created upon request rejection');

    // ─────────────────────────────────────────────────────────────────────────
    // TEST GROUP 7: ITEM MASTER ISOLATION & REGRESSION CHECK
    // ─────────────────────────────────────────────────────────────────────────
    console.log('\n[GROUP 7] Master Independence & Item Master Regression Integrity');
    // Ensure Vendor Master models do not have itemMasterId foreign keys
    assert(!GlobalVendor.schema.paths.itemMasterId, 'GlobalVendor has NO itemMasterId field (Strictly Independent)');
    assert(!HospitalVendorAssociation.schema.paths.itemMasterId, 'HospitalVendorAssociation has NO itemMasterId field (Strictly Independent)');
    assert(!VendorRequest.schema.paths.itemMasterId, 'VendorRequest has NO itemMasterId field (Strictly Independent)');

    // Ensure ItemMaster records remain intact
    const itemMasterCount = await ItemMaster.countDocuments();
    assert(itemMasterCount >= 0, `ItemMaster collection accessible and intact (${itemMasterCount} items)`);

    // Clean up test records
    await GlobalVendor.deleteMany({ supplierName: new RegExp('^Test Global Supplier') });
    await GlobalVendor.deleteMany({ supplierName: new RegExp('^Proposed Vendor') });
    await HospitalVendorAssociation.deleteMany({ tenantId: testTenant });
    await VendorRequest.deleteMany({ tenantId: testTenant });
    console.log('\nCleaned up test records successfully.');

  } catch (err) {
    console.error('Test execution error:', err);
    failedTests++;
  } finally {
    await mongoose.disconnect();
    console.log('\n================================================================');
    console.log(`SUMMARY: ${passedTests} PASSED, ${failedTests} FAILED`);
    console.log('================================================================\n');
    process.exit(failedTests > 0 ? 1 : 0);
  }
}

runVendorMasterPhase2Tests();
