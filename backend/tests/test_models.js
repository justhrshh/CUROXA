const mongoose = require('mongoose');
const ItemMaster = require('../models/ItemMaster');
const VendorQuotation = require('../models/VendorQuotation');
const PurchaseOrder = require('../models/PurchaseOrder');
const GoodsReceipt = require('../models/GoodsReceipt');
const MedicineBatch = require('../models/MedicineBatch');

async function testMongooseValidation() {
  console.log('Testing Mongoose schemas in-memory validation...');

  // 1. ItemMaster instance validation
  const item = new ItemMaster({
    tenantId: 'tenant_test',
    itemCode: 'ITM-2026-0001',
    genericName: 'Paracetamol 500mg',
    brandName: 'Dolo 500',
    categoryType: 'Drugs',
    departmentType: 'Pharmacy',
    purchasedUnit: 'Box',
    converterFactor: 100,
    packSizeDescription: '10x10 Tablets',
    consumptionUnit: 'Tablet'
  });
  const itemErr = item.validateSync();
  if (itemErr) throw itemErr;
  console.log('✔ ItemMaster schema valid');

  // 2. VendorQuotation instance validation
  const vq = new VendorQuotation({
    tenantId: 'tenant_test',
    quotationNo: 'VQ-2026-0001',
    vendorId: new mongoose.Types.ObjectId(),
    vendorName: 'Apex Pharma',
    itemMasterId: item._id,
    itemCode: item.itemCode,
    genericName: item.genericName,
    purchasedUnit: 'Box',
    converterFactor: 100,
    ratePerPurchasedUnit: 450,
    ratePerConsumptionUnit: 4.5,
    netEffectiveRate: 5.04,
    validTill: new Date('2027-01-01')
  });
  const vqErr = vq.validateSync();
  if (vqErr) throw vqErr;
  console.log('✔ VendorQuotation schema valid');

  // 3. PurchaseOrder with itemMasterId & packaging fields
  const po = new PurchaseOrder({
    tenantId: 'tenant_test',
    poId: 'PO-2026-0001',
    requestedBy: 'Dr. Test',
    totalAmount: 450,
    items: [{
      itemMasterId: item._id,
      name: item.genericName,
      sku: item.itemCode,
      brandName: item.brandName,
      purchasedUnit: 'Box',
      converterFactor: 100,
      consumptionUnit: 'Tablet',
      requiredQty: 2,
      expectedConsumptionQty: 200,
      price: 450,
      total: 900
    }]
  });
  const poErr = po.validateSync();
  if (poErr) throw poErr;
  console.log('✔ PurchaseOrder schema valid');

  // 4. GoodsReceipt with packaging conversion
  const grn = new GoodsReceipt({
    tenantId: 'tenant_test',
    grnId: 'GRN-2026-0001',
    vendorId: new mongoose.Types.ObjectId(),
    vendorName: 'Apex Pharma',
    items: [{
      itemMasterId: item._id,
      sku: item.itemCode,
      name: item.genericName,
      purchasedUnit: 'Box',
      converterFactor: 100,
      consumptionUnit: 'Tablet',
      convertedReceivedQty: 200,
      qtyReceived: 2,
      price: 450
    }]
  });
  const grnErr = grn.validateSync();
  if (grnErr) throw grnErr;
  console.log('✔ GoodsReceipt schema valid');

  // 5. MedicineBatch with itemMasterId
  const batch = new MedicineBatch({
    tenantId: 'tenant_test',
    itemMasterId: item._id,
    sku: item.itemCode,
    name: item.genericName,
    brandName: 'Dolo 500',
    batchNumber: 'B-991',
    consumptionUnit: 'Tablet',
    receivedQuantity: 200,
    availableQuantity: 200,
    purchaseRate: 4.5,
    mrp: 6
  });
  const batchErr = batch.validateSync();
  if (batchErr) throw batchErr;
  console.log('✔ MedicineBatch schema valid');

  console.log('\nALL 5 MONGOOSE SCHEMAS PASSED STRICT VALIDATION SYNC!');
}

testMongooseValidation().catch(e => {
  console.error('Schema validation failed:', e);
  process.exit(1);
});
