const assert = require('assert');
const mongoose = require('mongoose');

// Models
const ItemMaster = require('../models/ItemMaster');
const HospitalMasterConfig = require('../models/HospitalMasterConfig');
const ItemMasterRequest = require('../models/ItemMasterRequest');
const VendorQuotation = require('../models/VendorQuotation');
const PurchaseOrder = require('../models/PurchaseOrder');
const GoodsReceipt = require('../models/GoodsReceipt');
const MedicineBatch = require('../models/MedicineBatch');

// Configuration & Utils
const {
  MASTER_SCHEMA_REGISTRY,
  getCategoryConfig,
  getDepartmentFields,
  getAllCategories,
  isColumnValidForCategory
} = require('../config/masterSchemaRegistry');
const { CATEGORY_CODE_RULES } = require('../utils/masterItemCodeGenerator');

async function runPhase1MasterFoundationTests() {
  console.log('\n===============================================================');
  console.log('  QUROXA PHASE 1 — MASTER FOUNDATION & REGISTRY TEST SUITE');
  console.log('===============================================================\n');

  let passed = 0;
  let failed = 0;

  function test(name, fn) {
    try {
      fn();
      console.log(`  [PASS] ${name}`);
      passed++;
    } catch (err) {
      console.error(`  [FAIL] ${name}:`, err.message);
      failed++;
    }
  }

  // ───────────────────────────────────────────────────────────────────────────
  // TEST GROUP 1: MASTER SCHEMA REGISTRY VERIFICATION
  // ───────────────────────────────────────────────────────────────────────────
  console.log('--- 1. MASTER SCHEMA REGISTRY VERIFICATION ---');

  test('Registry contains all 6 top-level categories', () => {
    const categories = Object.keys(MASTER_SCHEMA_REGISTRY);
    assert.deepStrictEqual(categories, [
      'Lab Operation',
      'Pharmacy',
      'Pathology',
      'Service',
      'Assets',
      'Radiology'
    ]);
  });

  test('Radiology is marked SOURCE-CONFIRMATION-REQUIRED with 0 departments & 0 fields', () => {
    const rad = MASTER_SCHEMA_REGISTRY['Radiology'];
    assert.strictEqual(rad.status, 'SOURCE-CONFIRMATION-REQUIRED');
    assert.strictEqual(rad.excelSheet, null);
    assert.strictEqual(rad.sharedFields.length, 0);
    assert.deepStrictEqual(rad.departments, {});
  });

  test('Assets has hasDepartment = false, 0 departments, and exactly 15 sequential fields (A-O)', () => {
    const assets = MASTER_SCHEMA_REGISTRY['Assets'];
    assert.strictEqual(assets.hasDepartment, false);
    assert.strictEqual(assets.sharedFields.length, 15);
    assert.deepStrictEqual(assets.departments, {});

    // Verify sequential columns A to O
    const cols = assets.sharedFields.map(f => f.excelColumn);
    assert.deepStrictEqual(cols, ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O']);
    
    // Verify Col G is HSNCode and Col H is Expirable
    assert.strictEqual(assets.sharedFields[6].excelColumn, 'G');
    assert.strictEqual(assets.sharedFields[6].clientHeader, 'HSNCode');
    assert.strictEqual(assets.sharedFields[7].excelColumn, 'H');
    assert.strictEqual(assets.sharedFields[7].clientHeader, 'Expirable');
  });

  test('Lab Operation has 13 verified departments and 24 shared fields', () => {
    const lab = MASTER_SCHEMA_REGISTRY['Lab Operation'];
    assert.strictEqual(lab.hasDepartment, true);
    assert.strictEqual(lab.sharedFields.length, 24);
    assert.strictEqual(Object.keys(lab.departments).length, 13);
    assert.ok(lab.departments['Biochemistry']);
    assert.ok(lab.departments['Hematology']);
    assert.ok(lab.departments['Serology']);
  });

  test('Pharmacy has 1 department (Medicine) and 25 shared fields', () => {
    const ph = MASTER_SCHEMA_REGISTRY['Pharmacy'];
    assert.strictEqual(ph.hasDepartment, true);
    assert.strictEqual(ph.sharedFields.length, 25);
    assert.deepStrictEqual(Object.keys(ph.departments), ['Medicine']);
  });

  test('Pathology has 16 verified departments and 12 shared fields', () => {
    const path = MASTER_SCHEMA_REGISTRY['Pathology'];
    assert.strictEqual(path.hasDepartment, true);
    assert.strictEqual(path.sharedFields.length, 12);
    assert.strictEqual(Object.keys(path.departments).length, 16);
    assert.ok(path.departments['Biochemistry']);
    assert.ok(path.departments['Xray']);
    assert.ok(path.departments['Ultrasonography']);
  });

  test('Service has 1 department (OPD) and preserves Doctors Name and Doctor ID headers', () => {
    const srv = MASTER_SCHEMA_REGISTRY['Service'];
    assert.strictEqual(srv.hasDepartment, true);
    assert.strictEqual(srv.sharedFields.length, 8);
    assert.deepStrictEqual(Object.keys(srv.departments), ['OPD']);

    const docNameField = srv.sharedFields.find(f => f.fieldKey === 'doctorsName');
    const docIdField = srv.sharedFields.find(f => f.fieldKey === 'doctorId');

    assert.ok(docNameField);
    assert.strictEqual(docNameField.clientHeader, 'Doctors Name');
    assert.strictEqual(docNameField.clientRequired, 'UNCONFIRMED');
    assert.strictEqual(docNameField.systemRequired, false);

    assert.ok(docIdField);
    assert.strictEqual(docIdField.clientHeader, 'Doctor ID');
    assert.strictEqual(docIdField.clientRequired, 'UNCONFIRMED');
    assert.strictEqual(docIdField.systemRequired, false);
  });

  test('Pricing fields (MRP, Net Rate) are explicitly flagged with pricingScope = HOSPITAL_SPECIFIC', () => {
    const srv = MASTER_SCHEMA_REGISTRY['Service'];
    const srvMrp = srv.sharedFields.find(f => f.fieldKey === 'mrp');
    const srvNet = srv.sharedFields.find(f => f.fieldKey === 'netRate');
    assert.strictEqual(srvMrp.pricingScope, 'HOSPITAL_SPECIFIC');
    assert.strictEqual(srvNet.pricingScope, 'HOSPITAL_SPECIFIC');

    const path = MASTER_SCHEMA_REGISTRY['Pathology'];
    const pathMrp = path.sharedFields.find(f => f.fieldKey === 'mrp');
    const pathNet = path.sharedFields.find(f => f.fieldKey === 'netRate');
    assert.strictEqual(pathMrp.pricingScope, 'HOSPITAL_SPECIFIC');
    assert.strictEqual(pathNet.pricingScope, 'HOSPITAL_SPECIFIC');

    const asset = MASTER_SCHEMA_REGISTRY['Assets'];
    const assetMrp = asset.sharedFields.find(f => f.fieldKey === 'mrp');
    assert.strictEqual(assetMrp.pricingScope, 'HOSPITAL_SPECIFIC');
  });

  test('Registry helper functions operate correctly', () => {
    const labFields = getDepartmentFields('Lab Operation', 'Biochemistry');
    assert.strictEqual(labFields.length, 24);

    const assetFields = getDepartmentFields('Assets');
    assert.strictEqual(assetFields.length, 15);

    const radFields = getDepartmentFields('Radiology');
    assert.strictEqual(radFields.length, 0);

    const allCats = getAllCategories();
    assert.strictEqual(allCats.length, 6);

    assert.strictEqual(isColumnValidForCategory('Pharmacy', 'Medicine', 'Dosage Form'), true);
    assert.strictEqual(isColumnValidForCategory('Pharmacy', 'Medicine', 'genericName'), true);
    assert.strictEqual(isColumnValidForCategory('Pharmacy', 'Medicine', 'NonExistentColumn'), false);
  });

  // ───────────────────────────────────────────────────────────────────────────
  // TEST GROUP 2: ITEM CODE GENERATION RULES & PREFIXES
  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n--- 2. ITEM CODE GENERATION RULES & PREFIXES ---');

  test('ItemCode rules match client Excel prefix & total digit length', () => {
    assert.deepStrictEqual(CATEGORY_CODE_RULES['Lab Operation'], { prefix: '99', totalDigits: 9 });
    assert.deepStrictEqual(CATEGORY_CODE_RULES['Pharmacy'], { prefix: '98', totalDigits: 9 });
    assert.deepStrictEqual(CATEGORY_CODE_RULES['Pathology'], { prefix: '95', totalDigits: 8 });
    assert.deepStrictEqual(CATEGORY_CODE_RULES['Service'], { prefix: '94', totalDigits: 9 });
    assert.deepStrictEqual(CATEGORY_CODE_RULES['Assets'], { prefix: '73', totalDigits: 10 });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // TEST GROUP 3: ITEMMASTER MODEL NON-DESTRUCTIVE EXTENSION
  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n--- 3. ITEMMASTER SCHEMA COMPATIBILITY & VALIDATION ---');

  test('ItemMaster validates new category-driven records (Lab Operation)', () => {
    const labItem = new ItemMaster({
      scope: 'GLOBAL',
      tenantId: '__global__',
      itemCode: '990000001',
      category: 'Lab Operation',
      department: 'Biochemistry',
      itemName: '25OH VIT D CAL 1 PACK VITROS',
      categoryData: {
        itemTypeName: 'Calibrator',
        expirable: 'Yes',
        gstnTax: 5,
        manufactureName: 'ORTHO',
        machineName: 'C6000'
      }
    });

    const err = labItem.validateSync();
    assert.ifError(err);
    // Verify pre-validate synchronization
    assert.strictEqual(labItem.genericName, '25OH VIT D CAL 1 PACK VITROS');
    assert.strictEqual(labItem.brandName, '25OH VIT D CAL 1 PACK VITROS');
    assert.strictEqual(labItem.categoryType, 'Lab Operation');
    assert.strictEqual(labItem.departmentType, 'Biochemistry');
    assert.strictEqual(labItem.purchasedUnit, 'Box');
    assert.strictEqual(labItem.consumptionUnit, 'Tablet');
    assert.strictEqual(labItem.converterFactor, 100);
  });

  test('ItemMaster validates Assets without requiring department', () => {
    const assetItem = new ItemMaster({
      scope: 'GLOBAL',
      tenantId: '__global__',
      itemCode: '7300000001',
      category: 'Assets',
      itemName: 'ROCHE Cobas E411 Analyzer',
      categoryData: {
        itemTypeName: 'Non Movable',
        expirable: 'Yes',
        manufactureName: 'ROCHE'
      }
    });

    const err = assetItem.validateSync();
    assert.ifError(err);
    assert.strictEqual(assetItem.categoryType, 'Assets');
    assert.strictEqual(assetItem.departmentType, 'General');
  });

  test('ItemMaster validates Service procedure records', () => {
    const srvItem = new ItemMaster({
      scope: 'GLOBAL',
      tenantId: '__global__',
      itemCode: '940000001',
      category: 'Service',
      department: 'OPD',
      itemName: 'Dressing',
      doctorsName: '940000001',
      doctorId: 'Dressing',
      categoryData: {
        itemTypeName: 'General Physician',
        doctorsName: '940000001',
        doctorId: 'Dressing'
      }
    });

    const err = srvItem.validateSync();
    assert.ifError(err);
    assert.strictEqual(srvItem.categoryType, 'Service');
    assert.strictEqual(srvItem.departmentType, 'OPD');
  });

  test('ItemMaster preserves 100% backward compatibility with legacy Pharmacy creation', () => {
    const legacyItem = new ItemMaster({
      tenantId: 'city_hospital',
      itemCode: 'ITM-2026-9999',
      genericName: 'Paracetamol 500mg',
      brandName: 'Dolo 500',
      categoryType: 'Drugs',
      departmentType: 'Pharmacy',
      purchasedUnit: 'Box',
      converterFactor: 100,
      packSizeDescription: '10x10 Tablets',
      consumptionUnit: 'Tablet'
    });

    const err = legacyItem.validateSync();
    assert.ifError(err);
    assert.strictEqual(legacyItem.category, 'Drugs');
    assert.strictEqual(legacyItem.department, 'Pharmacy');
    assert.strictEqual(legacyItem.itemName, 'Paracetamol 500mg');
  });

  // ───────────────────────────────────────────────────────────────────────────
  // TEST GROUP 4: HOSPITAL MASTER CONFIG JUNCTION MODEL
  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n--- 4. HOSPITAL MASTER CONFIG & PRICE ISOLATION ---');

  const dummyMasterId = new mongoose.Types.ObjectId();

  test('HospitalMasterConfig validates assignment with hospital-specific prices', () => {
    const config = new HospitalMasterConfig({
      tenantId: 'city_hospital',
      masterItemId: dummyMasterId,
      category: 'Pharmacy',
      department: 'Medicine',
      mrp: 35.50,
      netRate: 28.00,
      hospitalCost: 24.50,
      status: 'Active',
      approvalStatus: 'Approved',
      assignedVia: 'DIRECT_ADMIN'
    });

    const err = config.validateSync();
    assert.ifError(err);
    assert.strictEqual(config.tenantId, 'city_hospital');
    assert.strictEqual(config.mrp, 35.50);
    assert.strictEqual(config.netRate, 28.00);
  });

  test('HospitalMasterConfig rejects missing tenantId or masterItemId', () => {
    const invalidConfig = new HospitalMasterConfig({
      category: 'Pharmacy'
    });
    const err = invalidConfig.validateSync();
    assert.ok(err);
    assert.ok(err.errors['tenantId']);
    assert.ok(err.errors['masterItemId']);
  });

  test('HospitalMasterConfig schema indexes enforce compound uniqueness on (tenantId + masterItemId)', () => {
    const indexes = HospitalMasterConfig.schema.indexes();
    const compoundUniqueIndex = indexes.find(idx => {
      const fields = idx[0];
      const opts = idx[1];
      return fields.tenantId === 1 && fields.masterItemId === 1 && opts && opts.unique === true;
    });
    assert.ok(compoundUniqueIndex, 'Expected unique index on { tenantId: 1, masterItemId: 1 }');
  });

  // ───────────────────────────────────────────────────────────────────────────
  // TEST GROUP 5: ITEM MASTER REQUEST EXTENSION
  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n--- 5. ITEM MASTER REQUEST EXTENSION ---');

  test('ItemMasterRequest validates NEW_GLOBAL_ITEM proposal with requested pricing', () => {
    const req = new ItemMasterRequest({
      requestNo: 'IMR-2026-0001',
      tenantId: 'city_hospital',
      requestedBy: 'pharma_user_1',
      requestType: 'NEW_GLOBAL_ITEM',
      category: 'Pharmacy',
      department: 'Medicine',
      requestedMrp: 50.00,
      requestedNetRate: 42.00,
      proposedItem: {
        genericName: 'Amoxicillin 250mg',
        manufacturer: 'Cipla',
        categoryType: 'Pharmacy'
      }
    });

    const err = req.validateSync();
    assert.ifError(err);
    assert.strictEqual(req.requestType, 'NEW_GLOBAL_ITEM');
    assert.strictEqual(req.requestedMrp, 50.00);
    assert.strictEqual(req.requestedNetRate, 42.00);
  });

  test('ItemMasterRequest validates ASSIGN_EXISTING_GLOBAL_ITEM with masterItemId link', () => {
    const req = new ItemMasterRequest({
      requestNo: 'IMR-2026-0002',
      tenantId: 'city_hospital',
      requestedBy: 'pharma_user_1',
      requestType: 'ASSIGN_EXISTING_GLOBAL_ITEM',
      masterItemId: dummyMasterId,
      category: 'Lab Operation',
      department: 'Biochemistry',
      requestedMrp: 1200.00,
      requestedNetRate: 950.00,
      proposedItem: {
        genericName: '25OH VIT D CAL',
        manufacturer: 'ORTHO',
        categoryType: 'Lab Operation'
      }
    });

    const err = req.validateSync();
    assert.ifError(err);
    assert.strictEqual(req.requestType, 'ASSIGN_EXISTING_GLOBAL_ITEM');
    assert.strictEqual(req.masterItemId.toString(), dummyMasterId.toString());
  });

  // ───────────────────────────────────────────────────────────────────────────
  // TEST GROUP 6: PROCUREMENT INTEGRATION REGRESSION VERIFICATION
  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n--- 6. PROCUREMENT COMPATIBILITY VERIFICATION ---');

  const canonicalItem = new ItemMaster({
    scope: 'GLOBAL',
    tenantId: '__global__',
    itemCode: '980000001',
    category: 'Pharmacy',
    department: 'Medicine',
    itemName: 'Paracetamol 500mg Strip',
    genericName: 'Paracetamol 500mg',
    brandName: 'Dolo 500',
    purchasedUnit: 'Box',
    converterFactor: 100,
    consumptionUnit: 'Tablet',
    packSizeDescription: '10x10'
  });

  test('VendorQuotation seamlessly references ItemMaster record', () => {
    const quotation = new VendorQuotation({
      tenantId: 'city_hospital',
      quotationNo: 'VQ-2026-8888',
      vendorId: new mongoose.Types.ObjectId(),
      vendorName: 'Global Supplier Ltd',
      itemMasterId: canonicalItem._id,
      itemCode: canonicalItem.itemCode,
      genericName: canonicalItem.genericName,
      brandName: canonicalItem.brandName,
      purchasedUnit: canonicalItem.purchasedUnit,
      consumptionUnit: canonicalItem.consumptionUnit,
      converterFactor: canonicalItem.converterFactor,
      ratePerPurchasedUnit: 200,
      ratePerConsumptionUnit: 2.0,
      netEffectiveRate: 2.24,
      validTill: new Date('2027-12-31')
    });

    const err = quotation.validateSync();
    assert.ifError(err);
    assert.strictEqual(quotation.itemMasterId.toString(), canonicalItem._id.toString());
  });

  test('PurchaseOrder items array seamlessly references ItemMaster record', () => {
    const po = new PurchaseOrder({
      tenantId: 'city_hospital',
      poId: 'PO-2026-8888',
      requestedBy: 'Procurement Manager',
      totalAmount: 2000,
      items: [{
        itemMasterId: canonicalItem._id,
        itemCode: canonicalItem.itemCode,
        name: canonicalItem.genericName,
        sku: canonicalItem.itemCode,
        brandName: canonicalItem.brandName,
        purchasedUnit: canonicalItem.purchasedUnit,
        consumptionUnit: canonicalItem.consumptionUnit,
        converterFactor: canonicalItem.converterFactor,
        requiredQty: 10,
        price: 200,
        total: 2000
      }]
    });

    const err = po.validateSync();
    assert.ifError(err);
    assert.strictEqual(po.items[0].itemMasterId.toString(), canonicalItem._id.toString());
  });

  test('GoodsReceipt items seamlessly reference ItemMaster record', () => {
    const grn = new GoodsReceipt({
      tenantId: 'city_hospital',
      grnId: 'GRN-2026-8888',
      vendorId: new mongoose.Types.ObjectId(),
      vendorName: 'Global Supplier Ltd',
      items: [{
        itemMasterId: canonicalItem._id,
        itemCode: canonicalItem.itemCode,
        sku: canonicalItem.itemCode,
        name: canonicalItem.genericName,
        purchasedUnit: canonicalItem.purchasedUnit,
        consumptionUnit: canonicalItem.consumptionUnit,
        converterFactor: canonicalItem.converterFactor,
        qtyReceived: 10,
        price: 200
      }]
    });

    const err = grn.validateSync();
    assert.ifError(err);
    assert.strictEqual(grn.items[0].itemMasterId.toString(), canonicalItem._id.toString());
  });

  test('MedicineBatch inventory records seamlessly reference ItemMaster record', () => {
    const batch = new MedicineBatch({
      tenantId: 'city_hospital',
      itemMasterId: canonicalItem._id,
      sku: canonicalItem.itemCode,
      name: canonicalItem.genericName,
      batchNumber: 'BATCH-2026-A1',
      receivedQuantity: 1000,
      availableQuantity: 1000,
      purchaseRate: 2.0,
      mrp: 3.5
    });

    const err = batch.validateSync();
    assert.ifError(err);
    assert.strictEqual(batch.itemMasterId.toString(), canonicalItem._id.toString());
  });

  console.log('\n===============================================================');
  console.log(`  TOTAL TESTS: ${passed + failed} | PASSED: ${passed} | FAILED: ${failed}`);
  console.log('===============================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runPhase1MasterFoundationTests().catch(err => {
  console.error('Test Suite Fatal Error:', err);
  process.exit(1);
});
