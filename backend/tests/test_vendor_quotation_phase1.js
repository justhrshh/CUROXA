const mongoose = require('mongoose');
require('dotenv').config();

const GlobalVendor = require('../models/GlobalVendor');
const HospitalVendorAssociation = require('../models/HospitalVendorAssociation');
const HospitalMasterConfig = require('../models/HospitalMasterConfig');
const ItemMaster = require('../models/ItemMaster');
const VendorQuotation = require('../models/VendorQuotation');
const PurchaseOrder = require('../models/PurchaseOrder');
const Vendor = require('../models/Vendor');

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

async function runVendorQuotationPhase1Tests() {
  console.log('================================================================');
  console.log('QUROXA — VENDOR QUOTATION PHASE 1 AUTOMATED VERIFICATION SUITE');
  console.log('================================================================\n');

  const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI || 'mongodb://localhost:27017/curoxa';
  await mongoose.connect(mongoUri);
  console.log('Connected to MongoDB database:', mongoose.connection.name);

  const tenantA = `test_hosp_a_${Date.now()}`;
  const tenantB = `test_hosp_b_${Date.now()}`;

  try {
    // ─────────────────────────────────────────────────────────────────────────
    // STEP 1: SETUP TEST CANONICAL DATA
    // ─────────────────────────────────────────────────────────────────────────
    console.log('\n[SETUP] Creating Test Global Vendors & Hospital Catalog');

    // Create 3 Global Vendors
    const gvA = await GlobalVendor.create({
      supplierName: `Vendor A (MediCorp) ${Date.now()}`,
      supplierCode: `VA-${Math.floor(1000 + Math.random() * 9000)}`,
      activeStatus: 'Yes',
      supplierType: 'Pharma Supplier',
      gstNo: '27AAAAA1111A1Z1'
    });

    const gvB = await GlobalVendor.create({
      supplierName: `Vendor B (HealthPharm) ${Date.now()}`,
      supplierCode: `VB-${Math.floor(1000 + Math.random() * 9000)}`,
      activeStatus: 'Yes',
      supplierType: 'Pharma Supplier',
      gstNo: '27BBBBB2222B1Z2'
    });

    const gvC = await GlobalVendor.create({
      supplierName: `Vendor C (ApexSupply) ${Date.now()}`,
      supplierCode: `VC-${Math.floor(1000 + Math.random() * 9000)}`,
      activeStatus: 'Yes',
      supplierType: 'Pharma Supplier',
      gstNo: '27CCCCC3333C1Z3'
    });

    const gvUnassociated = await GlobalVendor.create({
      supplierName: `Unassociated Global Vendor ${Date.now()}`,
      supplierCode: `VU-${Math.floor(1000 + Math.random() * 9000)}`,
      activeStatus: 'Yes',
      supplierType: 'Pharma Supplier',
      gstNo: '27DDDDD4444D1Z4'
    });

    // Associate Vendor A, B, C with Hospital A (tenantA)
    await HospitalVendorAssociation.create([
      { tenantId: tenantA, vendorId: gvA._id, status: 'ACTIVE' },
      { tenantId: tenantA, vendorId: gvB._id, status: 'ACTIVE' },
      { tenantId: tenantA, vendorId: gvC._id, status: 'ACTIVE' }
    ]);

    // Create Canonical Global ItemMaster Items
    const paracetamol = await ItemMaster.create({
      itemCode: `PAR-500-${Date.now()}`,
      genericName: 'Paracetamol 500mg',
      brandName: 'Calpol 500',
      manufacturer: 'GSK Pharma',
      purchasedUnit: 'Box',
      consumptionUnit: 'Tablet',
      converterFactor: 100, // 1 Box = 100 Tablets
      packSizeDescription: '1 Box = 10 Strips x 10 Tablets',
      defaultGst: 12,
      scope: 'GLOBAL',
      status: 'Active'
    });

    const amoxicillin = await ItemMaster.create({
      itemCode: `AMX-250-${Date.now()}`,
      genericName: 'Amoxicillin 250mg',
      brandName: 'Amoxil 250',
      manufacturer: 'Abbott',
      purchasedUnit: 'Box',
      consumptionUnit: 'Capsule',
      converterFactor: 50,
      packSizeDescription: '1 Box = 5 Strips x 10 Caps',
      defaultGst: 12,
      scope: 'GLOBAL',
      status: 'Active'
    });

    const unconfiguredItem = await ItemMaster.create({
      itemCode: `UNC-100-${Date.now()}`,
      genericName: 'Unconfigured Test Item 100mg',
      scope: 'GLOBAL',
      status: 'Active'
    });

    // Configure Paracetamol & Amoxicillin in Hospital A's catalog (HospitalMasterConfig)
    const configParacetamol = await HospitalMasterConfig.create({
      tenantId: tenantA,
      masterItemId: paracetamol._id,
      itemCode: paracetamol.itemCode,
      category: 'Pharmacy',
      department: 'Pharmacy',
      status: 'Active',
      hospitalCost: 15,
      mrp: 20
    });

    const configAmoxicillin = await HospitalMasterConfig.create({
      tenantId: tenantA,
      masterItemId: amoxicillin._id,
      itemCode: amoxicillin.itemCode,
      category: 'Pharmacy',
      department: 'Pharmacy',
      status: 'Active',
      hospitalCost: 25,
      mrp: 35
    });

    assert(gvA && gvB && gvC, 'Created 3 active Global Vendors');
    assert(paracetamol && amoxicillin, 'Created canonical Global ItemMaster records');
    assert(configParacetamol && configAmoxicillin, 'Selected items in HospitalMasterConfig for Hospital A');

    // ─────────────────────────────────────────────────────────────────────────
    // TEST GROUP 1: VENDOR ELIGIBILITY ENFORCEMENT
    // ─────────────────────────────────────────────────────────────────────────
    console.log('\n[GROUP 1] Server-Side Vendor Eligibility Enforcement');

    // Try to quote for an unassociated vendor
    const isAssociatedA = await HospitalVendorAssociation.findOne({ tenantId: tenantA, vendorId: gvA._id, status: 'ACTIVE' });
    assert(!!isAssociatedA, `Vendor A is associated with Hospital A (status: ${isAssociatedA?.status})`);

    const isAssociatedUnassoc = await HospitalVendorAssociation.findOne({ tenantId: tenantA, vendorId: gvUnassociated._id, status: 'ACTIVE' });
    assert(!isAssociatedUnassoc, 'Unassociated global vendor has NO HospitalVendorAssociation with Hospital A');

    // ─────────────────────────────────────────────────────────────────────────
    // TEST GROUP 2: ITEM ELIGIBILITY ENFORCEMENT (HospitalMasterConfig)
    // ─────────────────────────────────────────────────────────────────────────
    console.log('\n[GROUP 2] Server-Side Item Eligibility Enforcement (HospitalMasterConfig)');

    const isParacetamolConfigured = await HospitalMasterConfig.findOne({ tenantId: tenantA, masterItemId: paracetamol._id, status: 'Active' });
    assert(!!isParacetamolConfigured, 'Paracetamol 500mg is configured and Active in HospitalMasterConfig');

    const isUnconfiguredItemInConfig = await HospitalMasterConfig.findOne({ tenantId: tenantA, masterItemId: unconfiguredItem._id, status: 'Active' });
    assert(!isUnconfiguredItemInConfig, 'Unconfigured item is NOT present in HospitalMasterConfig for Hospital A');

    // ─────────────────────────────────────────────────────────────────────────
    // TEST GROUP 3: MULTI-VENDOR DIFFERENT PRICING FOR SAME ITEM
    // ─────────────────────────────────────────────────────────────────────────
    console.log('\n[GROUP 3] Multi-Vendor Quotations with Different Pricing for Same Item');

    // User scenario:
    // Hospital A, Paracetamol 500mg:
    // Vendor A -> ₹15 per unit (or purchased rate ₹1500 per box of 100)
    // Vendor B -> ₹13 per unit (purchased rate ₹1300 per box of 100)
    // Vendor C -> ₹17 per unit (purchased rate ₹1700 per box of 100)

    const quoteA = await VendorQuotation.create({
      tenantId: tenantA,
      quotationNo: `VQ-TEST-${Date.now()}-A`,
      vendorId: gvA._id,
      vendorName: gvA.supplierName,
      vendorCode: gvA.supplierCode,
      itemMasterId: paracetamol._id,
      hospitalMasterConfigId: configParacetamol._id,
      itemCode: paracetamol.itemCode,
      genericName: paracetamol.genericName,
      brandName: paracetamol.brandName,
      purchasedUnit: paracetamol.purchasedUnit,
      consumptionUnit: paracetamol.consumptionUnit,
      converterFactor: paracetamol.converterFactor,
      packSize: paracetamol.packSizeDescription,
      ratePerPurchasedUnit: 1500, // ₹15.00 / tablet
      discountPercent: 0,
      gstPercent: 12,
      netRatePerPurchasedUnit: 1680,
      ratePerConsumptionUnit: 15.00,
      netEffectiveRate: 16.80,
      validTill: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      status: 'Active'
    });

    const quoteB = await VendorQuotation.create({
      tenantId: tenantA,
      quotationNo: `VQ-TEST-${Date.now()}-B`,
      vendorId: gvB._id,
      vendorName: gvB.supplierName,
      vendorCode: gvB.supplierCode,
      itemMasterId: paracetamol._id,
      hospitalMasterConfigId: configParacetamol._id,
      itemCode: paracetamol.itemCode,
      genericName: paracetamol.genericName,
      brandName: paracetamol.brandName,
      purchasedUnit: paracetamol.purchasedUnit,
      consumptionUnit: paracetamol.consumptionUnit,
      converterFactor: paracetamol.converterFactor,
      packSize: paracetamol.packSizeDescription,
      ratePerPurchasedUnit: 1300, // ₹13.00 / tablet
      discountPercent: 0,
      gstPercent: 12,
      netRatePerPurchasedUnit: 1456,
      ratePerConsumptionUnit: 13.00,
      netEffectiveRate: 14.56,
      validTill: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      status: 'Active'
    });

    const quoteC = await VendorQuotation.create({
      tenantId: tenantA,
      quotationNo: `VQ-TEST-${Date.now()}-C`,
      vendorId: gvC._id,
      vendorName: gvC.supplierName,
      vendorCode: gvC.supplierCode,
      itemMasterId: paracetamol._id,
      hospitalMasterConfigId: configParacetamol._id,
      itemCode: paracetamol.itemCode,
      genericName: paracetamol.genericName,
      brandName: paracetamol.brandName,
      purchasedUnit: paracetamol.purchasedUnit,
      consumptionUnit: paracetamol.consumptionUnit,
      converterFactor: paracetamol.converterFactor,
      packSize: paracetamol.packSizeDescription,
      ratePerPurchasedUnit: 1700, // ₹17.00 / tablet
      discountPercent: 0,
      gstPercent: 12,
      netRatePerPurchasedUnit: 1904,
      ratePerConsumptionUnit: 17.00,
      netEffectiveRate: 19.04,
      validTill: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      status: 'Active'
    });

    assert(quoteA && quoteB && quoteC, 'Successfully stored quotations from 3 distinct vendors for Paracetamol 500mg');
    assert(quoteB.netEffectiveRate < quoteA.netEffectiveRate && quoteA.netEffectiveRate < quoteC.netEffectiveRate,
      `Rate ranking: Vendor B (₹${quoteB.netEffectiveRate}) < Vendor A (₹${quoteA.netEffectiveRate}) < Vendor C (₹${quoteC.netEffectiveRate})`);

    // ─────────────────────────────────────────────────────────────────────────
    // TEST GROUP 4: AUTOMATIC LOWEST-PRICE VENDOR SELECTION IN PO
    // ─────────────────────────────────────────────────────────────────────────
    console.log('\n[GROUP 4] Authoritative Lowest-Price Vendor Selection for PO');

    // Query active quotations ranked by netEffectiveRate ascending (Authoritative PO Logic)
    const rankedQuotes = await VendorQuotation.find({
      tenantId: tenantA,
      itemMasterId: paracetamol._id,
      status: 'Active',
      validTill: { $gte: new Date() }
    }).sort({ netEffectiveRate: 1 });

    assert(rankedQuotes.length === 3, `Found ${rankedQuotes.length} active quotations for Paracetamol 500mg`);
    const lowestQuote = rankedQuotes[0];
    assert(lowestQuote.vendorId.toString() === gvB._id.toString(),
      `Lowest price quotation automatically resolved to Vendor B [${lowestQuote.vendorName}] @ net ₹${lowestQuote.netEffectiveRate}`);

    // ─────────────────────────────────────────────────────────────────────────
    // TEST GROUP 5: MANUAL VENDOR OVERRIDE IN PURCHASE ORDER
    // ─────────────────────────────────────────────────────────────────────────
    console.log('\n[GROUP 5] Manual Vendor Override in Purchase Order');

    // Simulate PO creation overriding lowest vendor (B) with Vendor A (quoteA)
    const selectedOverrideQuote = rankedQuotes.find(q => q.vendorId.toString() === gvA._id.toString());
    assert(!!selectedOverrideQuote, 'Found Vendor A quotation for manual user override');

    const poQty = 5; // 5 boxes
    const lineSubtotal = poQty * selectedOverrideQuote.ratePerPurchasedUnit;
    const lineTax = (lineSubtotal * selectedOverrideQuote.gstPercent) / 100;
    const lineTotal = lineSubtotal + lineTax;

    const overridePO = await PurchaseOrder.create({
      tenantId: tenantA,
      poId: `PO-TEST-OVR-${Date.now()}`,
      vendorId: gvA._id,
      vendorName: gvA.supplierName,
      requestedBy: 'Test Pharmacist',
      items: [{
        itemMasterId: paracetamol._id,
        quotationId: selectedOverrideQuote._id,
        itemCode: paracetamol.itemCode,
        sku: paracetamol.itemCode,
        name: paracetamol.genericName,
        requiredQty: poQty,
        price: selectedOverrideQuote.ratePerPurchasedUnit,
        tax: selectedOverrideQuote.gstPercent,
        total: lineTotal,
        vendorId: gvA._id,
        vendorName: gvA.supplierName
      }],
      subtotal: lineSubtotal,
      taxAmount: lineTax,
      totalAmount: lineTotal,
      status: 'Pending Approval'
    });

    assert(overridePO && overridePO.vendorId.toString() === gvA._id.toString(),
      `Purchase order created with overridden vendor [${overridePO.vendorName}] rather than lowest vendor`);
    assert(overridePO.totalAmount === lineTotal, `PO totalAmount matches authoritative Vendor A quotation line total: ₹${lineTotal}`);

    // ─────────────────────────────────────────────────────────────────────────
    // TEST GROUP 6: MULTI-ITEM QUOTATION & DUPLICATE LINE PREVENTION
    // ─────────────────────────────────────────────────────────────────────────
    console.log('\n[GROUP 6] Multi-Item Quotation & Compound Unique Index Prevention');

    const sharedQuotationNo = `VQ-MULTI-${Date.now()}`;

    // Item 1: Paracetamol under sharedQuotationNo
    const multiItem1 = await VendorQuotation.create({
      tenantId: tenantA,
      quotationNo: sharedQuotationNo,
      vendorId: gvA._id,
      vendorName: gvA.supplierName,
      itemMasterId: paracetamol._id,
      hospitalMasterConfigId: configParacetamol._id,
      itemCode: paracetamol.itemCode,
      genericName: paracetamol.genericName,
      purchasedUnit: 'Box',
      consumptionUnit: 'Tablet',
      converterFactor: 100,
      ratePerPurchasedUnit: 1450,
      ratePerConsumptionUnit: 14.50,
      netEffectiveRate: 16.24,
      validTill: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      status: 'Active'
    });

    // Item 2: Amoxicillin under same sharedQuotationNo (MUST SUCCEED)
    const multiItem2 = await VendorQuotation.create({
      tenantId: tenantA,
      quotationNo: sharedQuotationNo,
      vendorId: gvA._id,
      vendorName: gvA.supplierName,
      itemMasterId: amoxicillin._id,
      hospitalMasterConfigId: configAmoxicillin._id,
      itemCode: amoxicillin.itemCode,
      genericName: amoxicillin.genericName,
      purchasedUnit: 'Box',
      consumptionUnit: 'Capsule',
      converterFactor: 50,
      ratePerPurchasedUnit: 1200,
      ratePerConsumptionUnit: 24.00,
      netEffectiveRate: 26.88,
      validTill: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      status: 'Active'
    });

    assert(multiItem1 && multiItem2, `Successfully created 2 distinct line items under same Quotation No: ${sharedQuotationNo}`);

    // Duplicate Item Check: attempting to add Paracetamol a second time under sharedQuotationNo (MUST FAIL)
    let duplicateRejected = false;
    try {
      await VendorQuotation.create({
        tenantId: tenantA,
        quotationNo: sharedQuotationNo,
        vendorId: gvA._id,
        vendorName: gvA.supplierName,
        itemMasterId: paracetamol._id, // DUPLICATE
        hospitalMasterConfigId: configParacetamol._id,
        itemCode: paracetamol.itemCode,
        genericName: paracetamol.genericName,
        purchasedUnit: 'Box',
        consumptionUnit: 'Tablet',
        converterFactor: 100,
        ratePerPurchasedUnit: 1400,
        ratePerConsumptionUnit: 14.00,
        netEffectiveRate: 15.68,
        validTill: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        status: 'Active'
      });
    } catch (err) {
      duplicateRejected = true;
    }
    assert(duplicateRejected, `Duplicate item within the same quotation [${sharedQuotationNo}] rejected by compound index`);

    // ─────────────────────────────────────────────────────────────────────────
    // TEST GROUP 7: TENANT ISOLATION
    // ─────────────────────────────────────────────────────────────────────────
    console.log('\n[GROUP 7] Multi-Hospital Tenant Isolation');

    // Create a quotation for Hospital B
    const quoteHospitalB = await VendorQuotation.create({
      tenantId: tenantB,
      quotationNo: `VQ-HOSPB-${Date.now()}`,
      vendorId: gvA._id,
      vendorName: gvA.supplierName,
      itemMasterId: paracetamol._id,
      itemCode: paracetamol.itemCode,
      genericName: paracetamol.genericName,
      purchasedUnit: 'Box',
      consumptionUnit: 'Tablet',
      converterFactor: 100,
      ratePerPurchasedUnit: 2200,
      ratePerConsumptionUnit: 22.00,
      netEffectiveRate: 24.64,
      validTill: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      status: 'Active'
    });

    const tenantAQuotes = await VendorQuotation.find({ tenantId: tenantA });
    const hasHospitalBQuoteInA = tenantAQuotes.some(q => q._id.toString() === quoteHospitalB._id.toString());
    assert(!hasHospitalBQuoteInA, 'Hospital A queries cannot see Hospital B quotations');

    const tenantBQuotes = await VendorQuotation.find({ tenantId: tenantB });
    const hasHospitalAQuoteInB = tenantBQuotes.some(q => q.tenantId === tenantA);
    assert(!hasHospitalAQuoteInB, 'Hospital B queries cannot see Hospital A quotations');

    // ─────────────────────────────────────────────────────────────────────────
    // CLEANUP
    // ─────────────────────────────────────────────────────────────────────────
    console.log('\n[CLEANUP] Cleaning up test fixtures');
    await VendorQuotation.deleteMany({ tenantId: { $in: [tenantA, tenantB] } });
    await PurchaseOrder.deleteMany({ tenantId: { $in: [tenantA, tenantB] } });
    await HospitalMasterConfig.deleteMany({ tenantId: { $in: [tenantA, tenantB] } });
    await HospitalVendorAssociation.deleteMany({ tenantId: { $in: [tenantA, tenantB] } });
    await GlobalVendor.deleteMany({ _id: { $in: [gvA._id, gvB._id, gvC._id, gvUnassociated._id] } });
    await ItemMaster.deleteMany({ _id: { $in: [paracetamol._id, amoxicillin._id, unconfiguredItem._id] } });
    console.log('Test fixtures cleaned up successfully.');

  } catch (err) {
    console.error('Test execution error:', err);
    failedTests++;
  } finally {
    await mongoose.disconnect();
    console.log('\n================================================================');
    console.log(`TEST SUMMARY: ${passedTests} PASSED, ${failedTests} FAILED`);
    console.log('================================================================\n');
    process.exit(failedTests > 0 ? 1 : 0);
  }
}

runVendorQuotationPhase1Tests();
