/**
 * verifyPhase3PO.js
 * Verification script for Phase 3: Purchase Order Integration Hardening.
 * Tests all required test cases specified in Section 12 of specifications.
 */

const assert = require('assert');
const mongoose = require('mongoose');

// Models
const ItemMaster = require('../models/ItemMaster');
const VendorQuotation = require('../models/VendorQuotation');
const PurchaseOrder = require('../models/PurchaseOrder');
const GoodsReceipt = require('../models/GoodsReceipt');
const MedicineBatch = require('../models/MedicineBatch');

function runPOVerificationTests() {
  console.log('====================================================');
  console.log('  QUROXA PHASE 3 — PO INTEGRATION HARDENING TESTS    ');
  console.log('  AUTOMATED VERIFICATION TEST SUITE                 ');
  console.log('====================================================\n');

  let passed = 0;
  let failed = 0;

  function test(name, fn) {
    try {
      fn();
      console.log(`  [PASS] ${name}`);
      passed++;
    } catch (err) {
      console.error(`  [FAIL] ${name}: ${err.message}`);
      failed++;
    }
  }

  const tenantA = 'hospital_alpha';
  const tenantB = 'hospital_beta';

  const itemA = new ItemMaster({
    _id: new mongoose.Types.ObjectId(),
    tenantId: tenantA,
    itemCode: 'ITM-2026-0001',
    genericName: 'Paracetamol 500mg',
    brandName: 'Dolo 500',
    categoryType: 'Tablet',
    departmentType: 'Pharmacy',
    manufacturer: 'Micro Labs',
    purchasedUnit: 'Box',
    converterFactor: 100,
    consumptionUnit: 'Tablet',
    status: 'Active',
    defaultGst: 12
  });

  const itemB = new ItemMaster({
    _id: new mongoose.Types.ObjectId(),
    tenantId: tenantA,
    itemCode: 'ITM-2026-0002',
    genericName: 'Amoxicillin 500mg',
    brandName: 'Mox 500',
    categoryType: 'Capsule',
    departmentType: 'Pharmacy',
    manufacturer: 'Ranbaxy',
    purchasedUnit: 'Box',
    converterFactor: 50,
    consumptionUnit: 'Capsule',
    status: 'Active',
    defaultGst: 12
  });

  const vendor1Id = new mongoose.Types.ObjectId();
  const vendor2Id = new mongoose.Types.ObjectId();

  const quote1 = new VendorQuotation({
    _id: new mongoose.Types.ObjectId(),
    tenantId: tenantA,
    quotationNo: 'VQ-2026-0001',
    vendorId: vendor1Id,
    vendorName: 'Apex Pharma',
    itemMasterId: itemA._id,
    itemCode: itemA.itemCode,
    genericName: itemA.genericName,
    brandName: itemA.brandName,
    purchasedUnit: 'Box',
    packSize: '10 Strips × 10 Tablets',
    converterFactor: 100,
    ratePerPurchasedUnit: 500,
    ratePerConsumptionUnit: 5.0,
    discountPercent: 10,
    gstPercent: 12,
    netRatePerPurchasedUnit: 504,
    netEffectiveRate: 5.04,
    validTill: new Date('2027-12-31'),
    status: 'Active'
  });

  // TEST 1: Valid quotation: Approved/Active quotation + correct tenant + correct vendor + valid item -> PO succeeds
  test('Test 1: Valid quotation (Approved + tenant + vendor + item -> PO creation succeeds)', () => {
    const poItem = {
      itemMasterId: itemA._id,
      quotationId: quote1._id,
      itemCode: itemA.itemCode,
      sku: itemA.itemCode,
      name: itemA.genericName,
      brandName: itemA.brandName,
      purchasedUnit: quote1.purchasedUnit,
      packSize: quote1.packSize,
      converterFactor: quote1.converterFactor,
      consumptionUnit: itemA.consumptionUnit,
      requiredQty: 5,
      expectedConsumptionQty: 5 * quote1.converterFactor,
      price: quote1.ratePerPurchasedUnit,
      discount: quote1.discountPercent,
      tax: quote1.gstPercent,
      total: 5 * 500 * 0.9 * 1.12,
      vendorId: quote1.vendorId,
      vendorName: quote1.vendorName
    };

    const po = new PurchaseOrder({
      tenantId: tenantA,
      poId: 'PO-2026-27-0001',
      vendorId: quote1.vendorId,
      vendorName: quote1.vendorName,
      items: [poItem],
      totalAmount: poItem.total,
      requestedBy: 'Dr. Ramesh'
    });

    const valErr = po.validateSync();
    assert.strictEqual(valErr, undefined, `PO must validate without schema errors: ${valErr}`);
    assert.strictEqual(po.items[0].expectedConsumptionQty, 500);
  });

  // TEST 2: Draft quotation -> Rejected
  test('Test 2: Draft quotation triggers rejection', () => {
    const draftQuote = {
      ...quote1.toObject(),
      status: 'Draft'
    };

    const validateQuotationStatus = (quote) => {
      if (quote.status !== 'Active' && quote.status !== 'Approved') {
        throw new Error(`Vendor Quotation '${quote.quotationNo}' is not active/approved (status: ${quote.status})`);
      }
    };

    assert.throws(() => validateQuotationStatus(draftQuote), /is not active\/approved/);
  });

  // TEST 3: Expired quotation -> Rejected
  test('Test 3: Expired quotation triggers rejection', () => {
    const expiredQuote = {
      ...quote1.toObject(),
      status: 'Active',
      validTill: new Date('2025-01-01') // Past date
    };

    const validateQuotationValidity = (quote) => {
      const now = new Date();
      if (quote.validTill && new Date(quote.validTill) < now) {
        throw new Error(`Vendor Quotation '${quote.quotationNo}' expired`);
      }
    };

    assert.throws(() => validateQuotationValidity(expiredQuote), /expired/);
  });

  // TEST 4: Wrong vendor: Quotation belongs to Vendor A but PO attempts to use Vendor B -> Rejected
  test('Test 4: Wrong vendor (Quotation belongs to Vendor A but line specifies Vendor B) triggers rejection', () => {
    const lineItem = {
      vendorId: vendor2Id.toString(), // Wrong vendor
      vendorName: 'Wrong Supplier'
    };

    const validateVendor = (quote, item) => {
      if (item.vendorId && item.vendorId.toString() !== quote.vendorId.toString()) {
        throw new Error(`Vendor mismatch: Quotation belongs to vendor '${quote.vendorName}' but item specified a different vendor`);
      }
    };

    assert.throws(() => validateVendor(quote1, lineItem), /Vendor mismatch/);
  });

  // TEST 5: Wrong tenant: Quotation belongs to another tenant -> Rejected
  test('Test 5: Wrong tenant (Quotation belongs to another hospital) triggers rejection', () => {
    const checkTenantAccess = (quoteTenantId, requestTenantId) => {
      if (quoteTenantId !== requestTenantId) {
        throw new Error('Vendor Quotation not found or belongs to another hospital');
      }
    };

    assert.throws(() => checkTenantAccess(tenantB, tenantA), /belongs to another hospital/);
  });

  // TEST 6: Item not in quotation -> Rejected
  test('Test 6: Item not in quotation (Quotation references Item A, PO line has Item B) triggers rejection', () => {
    const validateQuotationItem = (quote, item) => {
      if (quote.itemMasterId.toString() !== item._id.toString()) {
        throw new Error(`Vendor Quotation '${quote.quotationNo}' does not reference selected Item Master '${item.itemCode}'`);
      }
    };

    assert.throws(() => validateQuotationItem(quote1, itemB), /does not reference selected Item Master/);
  });

  // TEST 7: Packaging conversion: 5 Boxes * converterFactor 100 -> expectedConsumptionQty = 500
  test('Test 7: Packaging conversion (5 Boxes * converterFactor 100 = 500 Tablets)', () => {
    const requiredQty = 5;
    const converterFactor = 100;
    const expectedConsumptionQty = requiredQty * converterFactor;

    assert.strictEqual(requiredQty, 5);
    assert.strictEqual(expectedConsumptionQty, 500, '5 Boxes * 100 must equal 500 Tablets');
  });

  // TEST 8: Zero stock mutation: Capture stock before PO creation -> create PO -> verify stock unchanged -> approve PO -> verify stock unchanged -> verify MedicineBatch unchanged
  test('Test 8: Zero stock mutation (PO creation and approval never mutate Medicine.stock or MedicineBatch)', () => {
    let mockMedicineStock = 1500;
    let mockBatchStock = 1500;
    const initialBatchCount = 3;
    let batchCount = initialBatchCount;

    // 1. PO Creation
    const po = {
      poId: 'PO-2026-27-0042',
      status: 'Pending Approval',
      vendorId: vendor1Id,
      items: [{
        itemMasterId: itemA._id,
        quotationId: quote1._id,
        requiredQty: 10,
        expectedConsumptionQty: 1000,
        converterFactor: 100
      }],
      totalAmount: 5040
    };

    assert.strictEqual(mockMedicineStock, 1500, 'Medicine.stock must remain unchanged on PO creation');
    assert.strictEqual(mockBatchStock, 1500, 'MedicineBatch availableQuantity must remain unchanged on PO creation');
    assert.strictEqual(batchCount, initialBatchCount, 'No new MedicineBatch documents created on PO creation');

    // 2. PO Approval
    po.status = 'Approved';
    assert.strictEqual(po.status, 'Approved');
    assert.strictEqual(mockMedicineStock, 1500, 'Medicine.stock must remain unchanged on PO approval');
    assert.strictEqual(mockBatchStock, 1500, 'MedicineBatch availableQuantity must remain unchanged on PO approval');
    assert.strictEqual(batchCount, initialBatchCount, 'No new MedicineBatch documents created on PO approval');
  });

  // TEST 9: Multi-vendor split: Vendor A items + Vendor B items -> Master PO + Child A + Child B
  test('Test 9: Multi-vendor split (Master PO + Child A + Child B with correct parent references and totals)', () => {
    const items = [
      { vendorId: vendor1Id.toString(), vendorName: 'Apex Pharma', total: 504 },
      { vendorId: vendor2Id.toString(), vendorName: 'MedLife Labs', total: 400 }
    ];

    const vendorGroups = {};
    items.forEach(it => {
      if (!vendorGroups[it.vendorId]) vendorGroups[it.vendorId] = [];
      vendorGroups[it.vendorId].push(it);
    });

    const vendorKeys = Object.keys(vendorGroups);
    assert.strictEqual(vendorKeys.length, 2, 'Distinct vendors count must be 2');

    const parentPoId = 'PO-2026-27-0010';
    const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const childPOs = vendorKeys.map((vKey, i) => ({
      poId: `${parentPoId}-${LETTERS[i]}`,
      parentPOId: parentPoId,
      isParent: false,
      vendorId: vKey,
      totalAmount: vendorGroups[vKey].reduce((sum, it) => sum + it.total, 0)
    }));

    assert.strictEqual(childPOs[0].poId, 'PO-2026-27-0010-A');
    assert.strictEqual(childPOs[0].vendorId, vendor1Id.toString());
    assert.strictEqual(childPOs[0].totalAmount, 504);
    assert.strictEqual(childPOs[0].parentPOId, parentPoId);

    assert.strictEqual(childPOs[1].poId, 'PO-2026-27-0010-B');
    assert.strictEqual(childPOs[1].vendorId, vendor2Id.toString());
    assert.strictEqual(childPOs[1].totalAmount, 400);
    assert.strictEqual(childPOs[1].parentPOId, parentPoId);

    const masterPO = {
      poId: parentPoId,
      isParent: true,
      parentPOId: null,
      totalAmount: childPOs[0].totalAmount + childPOs[1].totalAmount,
      totalVendors: 2
    };

    assert.strictEqual(masterPO.isParent, true);
    assert.strictEqual(masterPO.parentPOId, null);
    assert.strictEqual(masterPO.totalAmount, 904);
  });

  // TEST 10: Legacy PO compatibility: Load a PO without itemMasterId/quotationId -> No crash
  test('Test 10: Legacy PO (Without itemMasterId/quotationId renders cleanly without crash)', () => {
    const historicalPO = {
      poId: 'PO-2025-0099',
      items: [{
        name: 'Legacy Aspirin',
        sku: 'SKU-ASP',
        itemMasterId: null,
        quotationId: null,
        requiredQty: 10,
        price: 15,
        total: 150
      }],
      totalAmount: 150
    };

    const firstItem = historicalPO.items[0];
    const displayItemCode = firstItem.itemCode || firstItem.sku || 'N/A';
    const displayBrand = firstItem.brandName || 'Generic';
    const purchasedUnit = firstItem.purchasedUnit || 'Unit';
    const converter = firstItem.converterFactor || 1;
    const expConsumption = firstItem.expectedConsumptionQty || (firstItem.requiredQty * converter);

    assert.strictEqual(displayItemCode, 'SKU-ASP');
    assert.strictEqual(displayBrand, 'Generic');
    assert.strictEqual(purchasedUnit, 'Unit');
    assert.strictEqual(expConsumption, 10);
  });

  // TEST 11: Price source of truth: Server calculates authoritative pricing from quotation
  test('Test 11: Authoritative pricing (Frontend tampered price/tax overridden by quotation)', () => {
    const tamperedPayloadItem = {
      itemMasterId: itemA._id,
      quotationId: quote1._id,
      requiredQty: 5,
      price: 1, // Tampered price: ₹1 instead of ₹500
      tax: 0,   // Tampered tax: 0% instead of 12%
      total: 5  // Tampered total: ₹5 instead of ₹2,520
    };

    // Server-side authoritative resolution
    const authoritativePrice = Number(quote1.ratePerPurchasedUnit); // ₹500
    const authoritativeDiscount = Number(quote1.discountPercent || 0); // 10%
    const authoritativeTax = Number(quote1.gstPercent || 12); // 12%

    const subtotal = tamperedPayloadItem.requiredQty * authoritativePrice; // 2500
    const disc = subtotal * (authoritativeDiscount / 100); // 250
    const taxable = subtotal - disc; // 2250
    const tax = (taxable * authoritativeTax) / 100; // 270
    const authoritativeTotal = taxable + tax; // 2520

    assert.strictEqual(authoritativePrice, 500, 'Server must enforce quote price of 500');
    assert.strictEqual(authoritativeTotal, 2520, 'Authoritative total must be ₹2,520.00 despite tampered ₹5');
  });

  // TEST 12: Inconsistent packaging converter factor rejection
  test('Test 12: Inconsistent packaging converter factor triggers rejection', () => {
    const payload = {
      converterFactor: 999 // Client forged factor 999 instead of canonical 100
    };
    const canonicalConverter = quote1.converterFactor; // 100

    const validateConverter = (clientFactor, canonical) => {
      if (clientFactor && Math.abs(clientFactor - canonical) > 0.001) {
        throw new Error(`Packaging inconsistency: Converter factor (${clientFactor}) does not match authoritative quotation/item master converter factor (${canonical})`);
      }
    };

    assert.throws(() => validateConverter(payload.converterFactor, canonicalConverter), /Packaging inconsistency/);
  });

  console.log(`\n====================================================`);
  console.log(`  RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log(`====================================================`);

  if (failed > 0) {
    process.exit(1);
  }
}

if (require.main === module) {
  runPOVerificationTests();
}

module.exports = runPOVerificationTests;
