/**
 * migrateMedicineToItemMaster.js
 * Idempotent migration script to populate ItemMaster from existing legacy Medicine collection.
 * 
 * Safety:
 * - Does not delete or mutate existing Medicine records.
 * - Checks for existing ItemMaster by tenantId + itemCode (or genericName).
 * - Sets default packaging converterFactor: 1 (1 purchasedUnit = 1 consumptionUnit).
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const mongoose = require('mongoose');
const connectDB = require('../config/db');
const Medicine = require('../models/Medicine');
const ItemMaster = require('../models/ItemMaster');
const Counter = require('../models/Counter');

async function migrate() {
  console.log('[MIGRATION] Starting Medicine -> ItemMaster migration...');
  await connectDB();

  const medicines = await Medicine.find({}).lean();
  console.log(`[MIGRATION] Found ${medicines.length} medicine records to evaluate.`);

  let createdCount = 0;
  let skippedCount = 0;

  for (const med of medicines) {
    const tenantId = (med.tenantId || 'city_hospital').trim().toLowerCase();
    const sku = (med.sku || '').trim();
    const name = (med.name || '').trim();

    if (!name) {
      console.warn(`[MIGRATION] Skipping invalid record without name (ID: ${med._id})`);
      continue;
    }

    // Check if ItemMaster already exists for this tenant & sku or name
    const existing = await ItemMaster.findOne({
      tenantId,
      $or: [
        { itemCode: sku },
        { genericName: { $regex: new RegExp(`^${name}$`, 'i') } }
      ]
    });

    if (existing) {
      skippedCount++;
      continue;
    }

    // Determine item code: use sku if valid, else generate sequence
    let itemCode = sku;
    if (!itemCode) {
      const year = new Date().getFullYear();
      const counterKey = `item_master_${tenantId}_${year}`;
      const counterDoc = await Counter.findOneAndUpdate(
        { key: counterKey },
        { $inc: { seq: 1 } },
        { new: true, upsert: true }
      );
      itemCode = `ITM-${year}-${String(counterDoc.seq).padStart(4, '0')}`;
    }

    const unit = med.unit || 'Strip';

    const newItem = new ItemMaster({
      tenantId,
      itemCode,
      genericName: name,
      brandName: '',
      categoryType: 'Drugs',
      departmentType: 'Pharmacy',
      itemType: 'Consumable',
      hsnCode: '',
      defaultGst: 12,
      storageTemperature: 'Normal',
      itemSpecification: `Migrated from legacy catalog: ${name}`,
      barcodeOption: false,
      isExpirable: true,
      expiryCutoffDays: 60,
      inventoryRule: 'FIFO',
      manufacturer: '',
      purchasedUnit: unit,
      converterFactor: 1,
      packSizeDescription: `1 ${unit}`,
      consumptionUnit: unit,
      issueMultiplier: 1,
      status: 'Active'
    });

    await newItem.save();
    createdCount++;
  }

  console.log(`[MIGRATION] Completed successfully:`);
  console.log(`  - Total evaluated: ${medicines.length}`);
  console.log(`  - Newly created ItemMaster records: ${createdCount}`);
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
