/**
 * migrateVendorMedicinesToQuotations.js
 * Idempotent migration script to convert embedded Vendor.medicines items into canonical VendorQuotation records.
 * 
 * Safety:
 * - Does not delete vendor.medicines data (preserves legacy format).
 * - Links to ItemMaster (creates default ItemMaster record if missing).
 * - Avoids duplicate quotations for the same tenant + vendor + item.
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const mongoose = require('mongoose');
const connectDB = require('../config/db');
const Vendor = require('../models/Vendor');
const ItemMaster = require('../models/ItemMaster');
const VendorQuotation = require('../models/VendorQuotation');
const Counter = require('../models/Counter');

async function migrate() {
  console.log('[MIGRATION] Starting Vendor.medicines -> VendorQuotation migration...');
  await connectDB();

  const vendors = await Vendor.find({}).lean();
  console.log(`[MIGRATION] Found ${vendors.length} vendors to inspect.`);

  let createdCount = 0;
  let skippedCount = 0;
  const year = new Date().getFullYear();
  const oneYearFromNow = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);

  for (const vendor of vendors) {
    const tenantId = (vendor.tenantId || 'city_hospital').trim().toLowerCase();
    const medicines = vendor.medicines || [];

    for (const med of medicines) {
      const medName = (med.name || '').trim();
      const medSku = (med.sku || '').trim();

      if (!medName) continue;

      // Find or create ItemMaster
      let item = await ItemMaster.findOne({
        tenantId,
        $or: [
          ...(medSku ? [{ itemCode: medSku }] : []),
          { genericName: { $regex: new RegExp(`^${medName}$`, 'i') } }
        ]
      });

      if (!item) {
        const itemCounterKey = `item_master_${tenantId}_${year}`;
        const itemCounterDoc = await Counter.findOneAndUpdate(
          { key: itemCounterKey },
          { $inc: { seq: 1 } },
          { new: true, upsert: true }
        );
        const generatedCode = `ITM-${year}-${String(itemCounterDoc.seq).padStart(4, '0')}`;

        item = new ItemMaster({
          tenantId,
          itemCode: medSku || generatedCode,
          genericName: medName,
          categoryType: 'Drugs',
          departmentType: 'Pharmacy',
          itemType: 'Consumable',
          defaultGst: med.gst || 12,
          purchasedUnit: 'Strip',
          converterFactor: 1,
          packSizeDescription: '1 Strip',
          consumptionUnit: 'Strip',
          issueMultiplier: 1,
          status: 'Active'
        });
        await item.save();
      }

      // Check if quotation already exists
      const existingQuotation = await VendorQuotation.findOne({
        tenantId,
        vendorId: vendor._id,
        itemMasterId: item._id
      });

      if (existingQuotation) {
        skippedCount++;
        continue;
      }

      // Generate Quotation Number
      const vqCounterKey = `vendor_quotation_${tenantId}_${year}`;
      const vqCounterDoc = await Counter.findOneAndUpdate(
        { key: vqCounterKey },
        { $inc: { seq: 1 } },
        { new: true, upsert: true }
      );
      const quotationNo = `VQ-${year}-${String(vqCounterDoc.seq).padStart(4, '0')}`;

      const ratePerPurchasedUnit = Number(med.price) || 0;
      const converterFactor = item.converterFactor || 1;
      const gstPercent = Number(med.gst) || 12;
      const discountPercent = 0;
      const netRatePerPurchasedUnit = ratePerPurchasedUnit * (1 + gstPercent / 100);
      const ratePerConsumptionUnit = ratePerPurchasedUnit / converterFactor;
      const netEffectiveRate = netRatePerPurchasedUnit / converterFactor;

      const quotation = new VendorQuotation({
        tenantId,
        quotationNo,
        vendorId: vendor._id,
        vendorName: vendor.name,
        vendorCode: vendor.code || '',
        itemMasterId: item._id,
        itemCode: item.itemCode,
        genericName: item.genericName,
        brandName: item.brandName || '',
        purchasedUnit: item.purchasedUnit || 'Strip',
        packSize: item.packSizeDescription || '1 Strip',
        converterFactor,
        ratePerPurchasedUnit,
        ratePerConsumptionUnit: Number(ratePerConsumptionUnit.toFixed(4)),
        discountPercent,
        gstPercent,
        netRatePerPurchasedUnit: Number(netRatePerPurchasedUnit.toFixed(4)),
        netEffectiveRate: Number(netEffectiveRate.toFixed(4)),
        leadTimeDays: 3,
        minimumOrderQty: 1,
        validTill: oneYearFromNow,
        status: 'Active',
        termsAndConditions: 'Migrated from Vendor catalog rate',
        createdBy: 'Migration Script'
      });

      await quotation.save();
      createdCount++;
    }
  }

  console.log(`[MIGRATION] Completed successfully:`);
  console.log(`  - Newly created Vendor Quotations: ${createdCount}`);
  console.log(`  - Already existing / skipped: ${skippedCount}`);

  await mongoose.disconnect();
  console.log('[MIGRATION] Database disconnected.');
}

if (require.main === module) {
  migrate().catch((err) => {
    console.error('[MIGRATION ERROR]', err);
    process.exit(1);
  });
}

module.exports = migrate;
