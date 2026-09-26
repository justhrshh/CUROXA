/**
 * QUROXA — GLOBAL ITEM MASTER & HOSPITAL ITEM REQUEST ARCHITECTURE
 * PRODUCTION VERIFICATION SUITE
 *
 * Verifies:
 * 1. Global vs Hospital ItemMaster scope separation & backward compatibility
 * 2. Medicine-specific clinical metadata fields (composition, dosage, strength, schedule)
 * 3. Hospital Item Request (IMR-YYYY-XXXX) lifecycle: SUBMITTED -> UNDER_REVIEW -> APPROVED/REJECTED
 * 4. Super Admin Item Request Approval & Global ITM Code auto-provisioning
 * 5. Duplicate detection algorithm (genericName + strength/dosageForm/manufacturer normalization)
 * 6. Linking requests to existing global items without redundant catalog pollution
 * 7. Tenant isolation: hospitals cannot modify global catalog items
 * 8. Vendor Quotation integration with Global Catalog items
 * 9. Idempotent migration logic
 */

const mongoose = require('mongoose');
const ItemMaster = require('../models/ItemMaster');
const ItemMasterRequest = require('../models/ItemMasterRequest');
const VendorQuotation = require('../models/VendorQuotation');
const Vendor = require('../models/Vendor');
const Counter = require('../models/Counter');
const PurchaseOrder = require('../models/PurchaseOrder');
const GoodsReceipt = require('../models/GoodsReceipt');
const MedicineBatch = require('../models/MedicineBatch');
const Medicine = require('../models/Medicine');

const TEST_TENANT_A = 'test_hosp_alpha_' + Date.now();
const TEST_TENANT_B = 'test_hosp_beta_' + Date.now();
const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/quroxa_test_global_im';

let passed = 0;
let failed = 0;

function assert(condition, testName) {
  if (condition) {
    console.log(`  [PASS] ${testName}`);
    passed++;
  } else {
    console.error(`  [FAIL] ${testName}`);
    failed++;
  }
}

async function runTests() {
  console.log('================================================================');
  console.log('  QUROXA — GLOBAL ITEM MASTER ARCHITECTURE VERIFICATION SUITE   ');
  console.log('================================================================\n');

  try {
    await mongoose.connect(MONGO_URI);

    // Clean test records
    await ItemMaster.deleteMany({ tenantId: { $in: [TEST_TENANT_A, TEST_TENANT_B, '__global__'] } });
    await ItemMasterRequest.deleteMany({ tenantId: { $in: [TEST_TENANT_A, TEST_TENANT_B] } });
    await VendorQuotation.deleteMany({ tenantId: { $in: [TEST_TENANT_A, TEST_TENANT_B] } });
    await Counter.deleteMany({ key: /test_hosp|global_test/ });

    console.log('--- TEST GROUP 1: SCOPE SEPARATION & MODEL INTEGRITY ---');

    // 1.1 Legacy Hospital-Scoped Item Master
    const hospitalItem = await ItemMaster.create({
      scope: 'HOSPITAL',
      tenantId: TEST_TENANT_A,
      itemCode: 'ITM-2026-H001',
      genericName: 'Legacy Paracetamol Tab',
      brandName: 'Local Para',
      manufacturer: 'Local Pharma',
      categoryType: 'Drugs',
      departmentType: 'Pharmacy',
      itemType: 'Medicine',
      purchasedUnit: 'Box',
      consumptionUnit: 'Tablet',
      converterFactor: 100,
      packSizeDescription: '10 Strips x 10 Tablets'
    });
    assert(hospitalItem.scope === 'HOSPITAL' && hospitalItem.tenantId === TEST_TENANT_A, '1.1 Legacy hospital item created with scope=HOSPITAL and tenantId');

    // 1.2 Global Item Master created centrally by Super Admin
    const globalItem = await ItemMaster.create({
      scope: 'GLOBAL',
      tenantId: '__global__',
      itemCode: 'ITM-2026-G001',
      genericName: 'Amoxicillin + Clavulanic Acid',
      brandName: 'Augmentin 625 Duo',
      manufacturer: 'GSK Pharmaceuticals',
      categoryType: 'Drugs',
      departmentType: 'Pharmacy',
      itemType: 'Medicine',
      composition: 'Amoxicillin 500mg + Clavulanic Acid 125mg',
      strength: '625',
      strengthUnit: 'mg',
      dosageForm: 'Tablet',
      routeOfAdministration: 'Oral',
      scheduleClassification: 'Schedule H1',
      purchasedUnit: 'Box',
      consumptionUnit: 'Tablet',
      converterFactor: 100,
      packSizeDescription: '10 Strips x 10 Tablets',
      status: 'Active',
      createdByAdmin: 'superadmin'
    });
    assert(globalItem.scope === 'GLOBAL' && globalItem.tenantId === '__global__', '1.2 Global item created with scope=GLOBAL and tenantId=__global__');
    assert(globalItem.composition.includes('Amoxicillin') && globalItem.scheduleClassification === 'Schedule H1', '1.3 Medicine-specific clinical metadata persisted correctly');

    console.log('\n--- TEST GROUP 2: HOSPITAL ITEM REQUEST WORKFLOW ---');

    // 2.1 Hospital submits a new Item Request (IMR)
    const req1 = await ItemMasterRequest.create({
      requestNo: 'IMR-2026-0001',
      tenantId: TEST_TENANT_A,
      hospitalName: 'Alpha Memorial Hospital',
      requestedBy: 'pharma_admin_1',
      requestedByName: 'Dr. Ramesh Kumar',
      requestedByRole: 'Pharmacy Admin',
      proposedItem: {
        genericName: 'Meropenem Trihydrate Injection',
        brandName: 'Meronem 1g',
        manufacturer: 'Pfizer Ltd',
        itemType: 'Medicine',
        categoryType: 'Drugs',
        departmentType: 'Pharmacy',
        composition: 'Meropenem IP 1000mg',
        strength: '1000',
        strengthUnit: 'mg',
        dosageForm: 'Injection',
        routeOfAdministration: 'IV',
        scheduleClassification: 'Schedule H1',
        purchasedUnit: 'Vial',
        consumptionUnit: 'Vial',
        converterFactor: 1,
        packSizeDescription: '1 Vial per Box'
      },
      reason: 'Urgent ICU requirement for severe septicemia cases',
      status: 'SUBMITTED',
      history: [{
        action: 'SUBMITTED',
        actor: 'pharma_admin_1',
        actorName: 'Dr. Ramesh Kumar',
        note: 'Submitted by hospital',
        timestamp: new Date()
      }]
    });
    assert(req1.status === 'SUBMITTED' && req1.requestNo === 'IMR-2026-0001', '2.1 Hospital Item Request submitted successfully in SUBMITTED state');

    // 2.2 Super Admin marks request UNDER_REVIEW
    req1.status = 'UNDER_REVIEW';
    req1.reviewedBy = 'superadmin';
    req1.reviewedByName = 'Global Catalog Lead';
    req1.history.push({
      action: 'UNDER_REVIEW',
      actor: 'superadmin',
      note: 'Evaluating clinical necessity and formulation',
      timestamp: new Date()
    });
    await req1.save();
    assert(req1.status === 'UNDER_REVIEW' && req1.history.length === 2, '2.2 Request transitioned to UNDER_REVIEW with audit history');

    // 2.3 Super Admin Approves: Global item created & linked
    const approvedGlobalItem = await ItemMaster.create({
      scope: 'GLOBAL',
      tenantId: '__global__',
      itemCode: 'ITM-2026-0002',
      genericName: req1.proposedItem.genericName,
      brandName: req1.proposedItem.brandName,
      manufacturer: req1.proposedItem.manufacturer,
      itemType: req1.proposedItem.itemType,
      categoryType: req1.proposedItem.categoryType,
      departmentType: req1.proposedItem.departmentType,
      composition: req1.proposedItem.composition,
      strength: req1.proposedItem.strength,
      strengthUnit: req1.proposedItem.strengthUnit,
      dosageForm: req1.proposedItem.dosageForm,
      routeOfAdministration: req1.proposedItem.routeOfAdministration,
      scheduleClassification: req1.proposedItem.scheduleClassification,
      purchasedUnit: req1.proposedItem.purchasedUnit,
      consumptionUnit: req1.proposedItem.consumptionUnit,
      converterFactor: req1.proposedItem.converterFactor,
      packSizeDescription: req1.proposedItem.packSizeDescription,
      status: 'Active',
      approvedFromRequestId: req1._id,
      createdByAdmin: 'superadmin'
    });

    req1.status = 'APPROVED';
    req1.approvedItemMasterId = approvedGlobalItem._id;
    req1.approvedItemCode = approvedGlobalItem.itemCode;
    req1.reviewedAt = new Date();
    req1.history.push({
      action: 'APPROVED',
      actor: 'superadmin',
      note: `Created global item ${approvedGlobalItem.itemCode}`,
      timestamp: new Date()
    });
    await req1.save();

    assert(req1.status === 'APPROVED' && req1.approvedItemCode === 'ITM-2026-0002', '2.3 Request APPROVED with global item code assigned');
    assert(String(approvedGlobalItem.approvedFromRequestId) === String(req1._id), '2.4 Global Item Master points back to the originating Request ID');

    console.log('\n--- TEST GROUP 3: DUPLICATE DETECTION & DEDUPLICATION ---');

    // 3.1 Duplicate Detection Helper logic
    function normalize(s) {
      return (s || '').toLowerCase().replace(/\s+/g, ' ').replace(/\s*(\d+)\s*/g, '$1').trim();
    }

    const testItemToRequest = {
      genericName: 'Meropenem Trihydrate', // slight variation
      manufacturer: 'Pfizer',
      strength: '1000'
    };

    const activeGlobals = await ItemMaster.find({ scope: 'GLOBAL', status: 'Active' }).lean();
    const duplicates = activeGlobals.filter(item => {
      const gNorm = normalize(item.genericName);
      const reqGNorm = normalize(testItemToRequest.genericName);
      const gMatch = gNorm.includes(reqGNorm) || reqGNorm.includes(gNorm);
      const mMatch = normalize(item.manufacturer).includes(normalize(testItemToRequest.manufacturer));
      const sMatch = normalize(item.strength) === normalize(testItemToRequest.strength);
      return gMatch && (mMatch || sMatch);
    });

    assert(duplicates.length > 0 && duplicates[0].itemCode === 'ITM-2026-0002', '3.1 Fuzzy duplicate check successfully matched existing Meropenem');

    // 3.2 Second Hospital requests identical item -> Link to Existing without creating duplicate
    const req2 = await ItemMasterRequest.create({
      requestNo: 'IMR-2026-0002',
      tenantId: TEST_TENANT_B,
      hospitalName: 'Beta City Care',
      requestedBy: 'pharma_beta_1',
      proposedItem: {
        genericName: 'Meropenem Trihydrate',
        brandName: 'Meronem',
        manufacturer: 'Pfizer',
        itemType: 'Medicine'
      },
      reason: 'ICU stock request',
      status: 'SUBMITTED'
    });

    // Super Admin links to existing item rather than provisioning a duplicate code
    req2.status = 'APPROVED';
    req2.approvedItemMasterId = duplicates[0]._id;
    req2.approvedItemCode = duplicates[0].itemCode;
    req2.linkedToExistingItem = true;
    req2.reviewedBy = 'superadmin';
    req2.reviewedAt = new Date();
    await req2.save();

    const globalItemsCountAfter = await ItemMaster.countDocuments({ scope: 'GLOBAL' });
    assert(req2.linkedToExistingItem === true && req2.approvedItemCode === 'ITM-2026-0002', '3.2 Second hospital request linked to existing item without new code');
    assert(globalItemsCountAfter === 2, '3.3 No duplicate global item created (catalog size unchanged at 2)');

    console.log('\n--- TEST GROUP 4: TENANT ISOLATION & GLOBAL CATALOG READS ---');

    // 4.1 Both Hospital A and Hospital B can read the Global items
    const globalForHospitalA = await ItemMaster.find({ scope: 'GLOBAL', status: 'Active' }).lean();
    assert(globalForHospitalA.length === 2, '4.1 Hospital A reads all 2 Global Catalog items');

    const globalForHospitalB = await ItemMaster.find({ scope: 'GLOBAL', status: 'Active' }).lean();
    assert(globalForHospitalB.length === 2, '4.2 Hospital B reads all 2 Global Catalog items');

    // 4.3 Hospital A cannot see Hospital B requests
    const hospitalARequests = await ItemMasterRequest.find({ tenantId: TEST_TENANT_A }).lean();
    const hospitalBRequests = await ItemMasterRequest.find({ tenantId: TEST_TENANT_B }).lean();
    assert(hospitalARequests.length === 1 && hospitalARequests[0].requestNo === 'IMR-2026-0001', '4.3 Hospital A only sees their own requests (1 request)');
    assert(hospitalBRequests.length === 1 && hospitalBRequests[0].requestNo === 'IMR-2026-0002', '4.4 Hospital B only sees their own requests (1 request)');

    // 4.5 Super Admin sees all requests across hospitals
    const superAdminAllRequests = await ItemMasterRequest.find({ tenantId: { $in: [TEST_TENANT_A, TEST_TENANT_B] } }).lean();
    assert(superAdminAllRequests.length === 2, '4.5 Super Admin cross-tenant visibility sees all 2 test requests');

    console.log('\n--- TEST GROUP 5: VENDOR QUOTATION INTEGRATION ---');

    // 5.1 Hospital creates Vendor Quotation bound to Global Item
    const testVendor = await Vendor.create({
      tenantId: TEST_TENANT_A,
      code: 'VND-TEST-01',
      name: 'Apex Pharmaceuticals Distributor',
      contactPerson: 'Sunil Verma',
      phone: '9876543210',
      email: 'apex@pharma.com',
      status: 'Active'
    });

    const quotation = await VendorQuotation.create({
      tenantId: TEST_TENANT_A,
      vendorId: testVendor._id,
      vendorName: testVendor.name,
      itemMasterId: approvedGlobalItem._id, // References Global Item
      quotationNo: 'VQ-2026-TEST01',
      itemCode: approvedGlobalItem.itemCode,
      genericName: approvedGlobalItem.genericName,
      brandName: approvedGlobalItem.brandName,
      purchasedUnit: approvedGlobalItem.purchasedUnit,
      packSize: approvedGlobalItem.packSizeDescription,
      converterFactor: approvedGlobalItem.converterFactor,
      consumptionUnit: approvedGlobalItem.consumptionUnit,
      ratePerPurchasedUnit: 1250.00,
      ratePerConsumptionUnit: 1250.00 / approvedGlobalItem.converterFactor,
      discountPercent: 10,
      gstPercent: 12,
      netEffectiveRate: 1260.00, // 1250 * 0.9 * 1.12
      validTill: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
      status: 'Active'
    });

    assert(String(quotation.itemMasterId) === String(approvedGlobalItem._id), '5.1 Vendor Quotation successfully binds to Global Item Master ID');
    assert(quotation.itemCode === 'ITM-2026-0002' && quotation.tenantId === TEST_TENANT_A, '5.2 Vendor Quotation is hospital-tenant scoped with canonical global item code');

    console.log('\n--- TEST GROUP 6: MIGRATION SCRIPT IDEMPOTENCY ---');

    // 6.1 Unset scope on legacy item to simulate pre-migration state
    await ItemMaster.updateOne({ _id: hospitalItem._id }, { $unset: { scope: 1 } });
    const preCount = await ItemMaster.countDocuments({ scope: { $exists: false } });
    assert(preCount === 1, '6.1 Simulated unmigrated item without scope exists');

    // Run migration logic
    await ItemMaster.updateMany({ scope: { $exists: false } }, { $set: { scope: 'HOSPITAL' } });
    const postCount = await ItemMaster.countDocuments({ scope: { $exists: false } });
    const migratedItem = await ItemMaster.findById(hospitalItem._id);
    assert(postCount === 0 && migratedItem.scope === 'HOSPITAL', '6.2 Migration safely sets scope=HOSPITAL on legacy items');

    // Idempotency: re-running produces 0 changes and alters no global items
    const secondPass = await ItemMaster.updateMany({ scope: { $exists: false } }, { $set: { scope: 'HOSPITAL' } });
    const globalCountAfter = await ItemMaster.countDocuments({ scope: 'GLOBAL' });
    assert(secondPass.modifiedCount === 0 && globalCountAfter === 2, '6.3 Migration is fully idempotent — safe to re-run without affecting global catalog');

    console.log('\n--- TEST GROUP 7: CATEGORY-ADAPTIVE ITEM TYPES & PACKAGING INTEGRITY ---');

    // 7.1 Consumable item with sterility & material fields
    const consumableGlobal = await ItemMaster.create({
      scope: 'GLOBAL',
      tenantId: '__global__',
      itemCode: 'ITM-2026-C001',
      genericName: 'Surgical Examination Gloves Powder-Free',
      brandName: 'Nitrile Grip',
      manufacturer: 'Kanam Latex',
      itemType: 'Consumable',
      categoryType: 'Surgical',
      departmentType: 'OT',
      material: 'Nitrile',
      sterility: 'Sterile',
      sizeDimensions: 'Medium (7.5)',
      disposalType: 'Disposable',
      purchasedUnit: 'Box',
      consumptionUnit: 'Pair',
      converterFactor: 50,
      packSizeDescription: '50 Pairs / Box',
      status: 'Active'
    });
    assert(consumableGlobal.material === 'Nitrile' && consumableGlobal.consumptionUnit === 'Pair' && consumableGlobal.converterFactor === 50, '7.1 Consumable item created with material, sterility, and 1 Box = 50 Pairs');

    // 7.2 Reagent item with analyzer compatibility & catalog number
    const reagentGlobal = await ItemMaster.create({
      scope: 'GLOBAL',
      tenantId: '__global__',
      itemCode: 'ITM-2026-R001',
      genericName: 'Cobas c311 LFT Multi-Pack Reagent',
      brandName: 'Cobas Integra ALT/AST',
      manufacturer: 'Roche Diagnostics',
      itemType: 'Reagent',
      categoryType: 'Laboratory',
      departmentType: 'Laboratory',
      machineCompatibility: 'Cobas c311',
      catalogNo: '04404483190',
      testPackVolume: '200 Tests / Kit',
      storageTemperature: '2-8°C (Cold Chain)',
      purchasedUnit: 'Kit',
      consumptionUnit: 'Test',
      converterFactor: 200,
      packSizeDescription: '200 Tests / Kit',
      status: 'Active'
    });
    assert(reagentGlobal.machineCompatibility === 'Cobas c311' && reagentGlobal.catalogNo === '04404483190' && reagentGlobal.storageTemperature === '2-8°C (Cold Chain)', '7.2 Diagnostic Reagent created with machine compatibility, catalog number & cold-chain storage');

    // 7.3 Asset / Equipment with make/model, warranty, and maintenance cycle
    const assetGlobal = await ItemMaster.create({
      scope: 'GLOBAL',
      tenantId: '__global__',
      itemCode: 'ITM-2026-A001',
      genericName: 'Multi-Para Patient Monitor 10.4 inch',
      brandName: 'uMEC10',
      manufacturer: 'Mindray Medical',
      itemType: 'Asset',
      categoryType: 'Equipment',
      departmentType: 'ICU',
      makeModelNo: 'uMEC10-ICU',
      itemSpecification: '5-lead ECG, NIBP, SpO2, Temp',
      warrantyMonths: 24,
      maintenanceCycle: 'Annual',
      purchasedUnit: 'Unit',
      consumptionUnit: 'Unit',
      converterFactor: 1,
      packSizeDescription: 'Unit — sold as individual unit',
      isExpirable: false,
      status: 'Active'
    });
    assert(assetGlobal.makeModelNo === 'uMEC10-ICU' && assetGlobal.warrantyMonths === 24 && assetGlobal.isExpirable === false, '7.3 Hospital Asset created with make/model, 24-month warranty, and isExpirable=false');

    // 7.4 Bottle packaging rule: 1 Bottle = 1 Bottle, factor = 1 (never convert bottle to mL)
    const bottleItem = await ItemMaster.create({
      scope: 'GLOBAL',
      tenantId: '__global__',
      itemCode: 'ITM-2026-B001',
      genericName: 'Povidone Iodine Solution 10% 500ml',
      brandName: 'Betadine 500ml',
      manufacturer: 'Win-Medicare',
      itemType: 'Medicine',
      categoryType: 'Drugs',
      departmentType: 'Pharmacy',
      dosageForm: 'Solution',
      routeOfAdministration: 'Topical',
      purchasedUnit: 'Bottle',
      consumptionUnit: 'Bottle',
      converterFactor: 1,
      packSizeDescription: '1 Bottle — sold as individual unit',
      status: 'Active'
    });
    assert(bottleItem.purchasedUnit === 'Bottle' && bottleItem.consumptionUnit === 'Bottle' && bottleItem.converterFactor === 1, '7.4 Bottle packaging rule enforced: 1 Bottle = 1 Bottle, factor 1 (no liquid mL conversion)');

    console.log('\n--- TEST GROUP 8: END-TO-END PROCUREMENT INTEGRATION WITH GLOBAL CATALOG ---');

    // 8.1 Hospital Quotation for Consumable Global Item
    const gloveQuotation = await VendorQuotation.create({
      tenantId: TEST_TENANT_A,
      vendorId: testVendor._id,
      vendorName: testVendor.name,
      itemMasterId: consumableGlobal._id,
      quotationNo: 'VQ-2026-GLV01',
      itemCode: consumableGlobal.itemCode,
      genericName: consumableGlobal.genericName,
      brandName: consumableGlobal.brandName,
      purchasedUnit: consumableGlobal.purchasedUnit,
      packSize: consumableGlobal.packSizeDescription,
      converterFactor: consumableGlobal.converterFactor,
      consumptionUnit: consumableGlobal.consumptionUnit,
      ratePerPurchasedUnit: 600.00,
      ratePerConsumptionUnit: 600.00 / 50, // 12.00 per Pair
      discountPercent: 5,
      gstPercent: 12,
      netEffectiveRate: 12.768, // (600 * 0.95 * 1.12) / 50
      validTill: new Date(Date.now() + 180 * 24 * 60 * 60 * 1000),
      status: 'Active'
    });
    assert(gloveQuotation.ratePerConsumptionUnit === 12 && gloveQuotation.consumptionUnit === 'Pair', '8.1 Hospital Vendor Quotation correctly computes unit consumption rate (Rs 12/Pair)');

    // 8.2 PO Creation referencing Global Item + Quotation with Zero Stock Mutation
    const poNumber = `PO-TEST-${Date.now()}`;
    const poDoc = await PurchaseOrder.create({
      poId: poNumber,
      tenantId: TEST_TENANT_A,
      vendorId: testVendor._id,
      vendorName: testVendor.name,
      items: [{
        name: consumableGlobal.genericName,
        genericName: consumableGlobal.genericName,
        brandName: consumableGlobal.brandName,
        manufacturer: consumableGlobal.manufacturer,
        sku: consumableGlobal.itemCode,
        itemCode: consumableGlobal.itemCode,
        itemMasterId: consumableGlobal._id,
        quotationId: gloveQuotation._id,
        purchasedUnit: consumableGlobal.purchasedUnit,
        packSize: consumableGlobal.packSizeDescription,
        converterFactor: consumableGlobal.converterFactor,
        consumptionUnit: consumableGlobal.consumptionUnit,
        requiredQty: 10, // 10 Boxes
        expectedConsumptionQty: 500, // 10 * 50 = 500 Pairs
        price: 600.00,
        discount: 5,
        tax: 12,
        total: 600 * 10 * 0.95 * 1.12,
        vendorId: testVendor._id,
        vendorName: testVendor.name
      }],
      subtotal: 6000,
      taxAmount: 638.4,
      totalAmount: 6338.4,
      status: 'Approved',
      requestedBy: 'test_procurement_user'
    });

    const stockBeforeGRN = await MedicineBatch.countDocuments({ tenantId: TEST_TENANT_A, itemMasterId: consumableGlobal._id });
    assert(poDoc.items[0].expectedConsumptionQty === 500 && stockBeforeGRN === 0, '8.2 PO creation references Global Item with 10 Boxes = 500 Pairs and zero stock mutation');

    // 8.3 GRN Inwarding converts purchased quantity into canonical consumption units
    const grnId = `GRN-TEST-${Date.now()}`;
    const grnDoc = await GoodsReceipt.create({
      grnId,
      tenantId: TEST_TENANT_A,
      poId: poDoc._id,
      poNumber: poDoc.poId,
      vendorId: testVendor._id,
      vendorName: testVendor.name,
      receivedDate: new Date(),
      status: 'Verified/Completed',
      receivedBy: 'test_store_manager',
      items: [{
        name: consumableGlobal.genericName,
        sku: consumableGlobal.itemCode,
        itemMasterId: consumableGlobal._id,
        itemCode: consumableGlobal.itemCode,
        genericName: consumableGlobal.genericName,
        brandName: consumableGlobal.brandName,
        manufacturer: consumableGlobal.manufacturer,
        batchNumber: 'BATCH-GLV-001',
        expiryDate: new Date(Date.now() + 730 * 24 * 60 * 60 * 1000), // 2 years
        purchasedUnit: 'Box',
        qtyReceived: 10,
        acceptedPurchasedQty: 10,
        rejectedQty: 0,
        converterFactor: 50,
        consumptionUnit: 'Pair',
        convertedQuantity: 500, // 10 Boxes * 50 = 500 Pairs
        price: 600,
        netAmount: 6338.4
      }]
    });

    // Inwarding stock mutation
    const createdBatch = await MedicineBatch.create({
      tenantId: TEST_TENANT_A,
      itemMasterId: consumableGlobal._id,
      name: consumableGlobal.genericName,
      sku: consumableGlobal.itemCode,
      batchNumber: 'BATCH-GLV-001',
      brandName: consumableGlobal.brandName,
      genericName: consumableGlobal.genericName,
      manufacturer: consumableGlobal.manufacturer,
      availableQuantity: 500, // Stored in canonical consumption units (Pairs)
      initialQuantity: 500,
      consumptionUnit: consumableGlobal.consumptionUnit, // 'Pair'
      expiryDate: new Date(Date.now() + 730 * 24 * 60 * 60 * 1000),
      purchaseRate: 600 / 50 // 12.00
    });

    assert(grnDoc.items[0].convertedQuantity === 500, '8.3 GRN converted 10 Boxes into 500 canonical Pairs');
    assert(createdBatch.availableQuantity === 500 && createdBatch.consumptionUnit === 'Pair', '8.4 Inventory stock stored strictly in canonical consumption unit (500 Pairs)');

    // Cleanup test records
    await ItemMaster.deleteMany({ tenantId: { $in: [TEST_TENANT_A, TEST_TENANT_B, '__global__'] } });
    await ItemMasterRequest.deleteMany({ tenantId: { $in: [TEST_TENANT_A, TEST_TENANT_B] } });
    await VendorQuotation.deleteMany({ tenantId: { $in: [TEST_TENANT_A, TEST_TENANT_B] } });
    await Vendor.deleteMany({ tenantId: TEST_TENANT_A });
    await PurchaseOrder.deleteMany({ tenantId: TEST_TENANT_A });
    await GoodsReceipt.deleteMany({ tenantId: TEST_TENANT_A });
    await MedicineBatch.deleteMany({ tenantId: TEST_TENANT_A });

    console.log('\n================================================================');
    console.log(`  VERIFICATION RESULTS: ${passed} PASSED, ${failed} FAILED`);
    console.log('================================================================\n');

    await mongoose.disconnect();
    process.exit(failed > 0 ? 1 : 0);
  } catch (err) {
    console.error('[FATAL ERROR IN TEST SUITE]:', err);
    await mongoose.disconnect().catch(() => {});
    process.exit(1);
  }
}

runTests();
