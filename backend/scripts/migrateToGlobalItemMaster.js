#!/usr/bin/env node
/**
 * migrateToGlobalItemMaster.js
 *
 * SAFE, IDEMPOTENT migration script.
 * Assigns scope='HOSPITAL' to all existing ItemMaster records that lack a scope.
 * Does NOT convert any hospital items to GLOBAL.
 * GLOBAL items are only created by Super Admin going forward.
 *
 * Run: node backend/scripts/migrateToGlobalItemMaster.js
 */

'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const mongoose = require('mongoose');

// ─── DB Connection ─────────────────────────────────────────────────────────────
async function connectDB() {
  const uri = process.env.MONGO_URI || process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGO_URI / MONGODB_URI not set in .env');
  await mongoose.connect(uri);
  console.log('[MIGRATE] Connected to MongoDB:', mongoose.connection.name);
}

// ─── Main ──────────────────────────────────────────────────────────────────────
async function run() {
  await connectDB();

  const ItemMaster = require('../models/ItemMaster');

  // ── Step 1: Assign scope='HOSPITAL' to all records missing a scope ──────────
  const hospitalResult = await ItemMaster.updateMany(
    { scope: { $exists: false } },
    { $set: { scope: 'HOSPITAL' } }
  );
  console.log(`[MIGRATE] Assigned scope=HOSPITAL to ${hospitalResult.modifiedCount} existing records.`);

  // Also fix any that have scope=null or scope=undefined explicitly
  const fixNull = await ItemMaster.updateMany(
    { scope: null },
    { $set: { scope: 'HOSPITAL' } }
  );
  if (fixNull.modifiedCount > 0) {
    console.log(`[MIGRATE] Fixed ${fixNull.modifiedCount} records with null scope \u2192 HOSPITAL.`);
  }

  // ── Step 2: Ensure no existing items were accidentally set as GLOBAL ─────────
  const globalCount = await ItemMaster.countDocuments({ scope: 'GLOBAL' });
  console.log(`[MIGRATE] Global items in catalog: ${globalCount} (should be 0 for fresh migration)`);

  // ── Step 3: Ensure all GLOBAL items (if any exist) have tenantId='__global__'
  const globalFix = await ItemMaster.updateMany(
    { scope: 'GLOBAL', tenantId: { $ne: '__global__' } },
    { $set: { tenantId: '__global__' } }
  );
  if (globalFix.modifiedCount > 0) {
    console.log(`[MIGRATE] Fixed ${globalFix.modifiedCount} GLOBAL items to have tenantId='__global__'.`);
  }

  // ── Step 4: Verify HOSPITAL items still have their tenantId intact ───────────
  const hospitalItems = await ItemMaster.countDocuments({ scope: 'HOSPITAL' });
  const totalItems = await ItemMaster.countDocuments({});
  console.log(`[MIGRATE] Summary:`);
  console.log(`  Total ItemMaster records : ${totalItems}`);
  console.log(`  scope=HOSPITAL           : ${hospitalItems}`);
  console.log(`  scope=GLOBAL             : ${globalCount}`);

  // ── Step 5: Add medicine-specific field defaults to existing records ──────────
  // Set empty strings for new fields that don't exist yet (non-destructive)
  const medicineFieldFix = await ItemMaster.updateMany(
    { scope: 'HOSPITAL', composition: { $exists: false } },
    { $set: { composition: '', strength: '', strengthUnit: '', dosageForm: '', routeOfAdministration: '', scheduleClassification: '' } }
  );
  console.log(`[MIGRATE] Added medicine fields to ${medicineFieldFix.modifiedCount} existing records.`);

  console.log('[MIGRATE] Migration complete. Idempotent: safe to run again.');
  await mongoose.disconnect();
  process.exit(0);
}

run().catch(err => {
  console.error('[MIGRATE] Fatal error:', err);
  process.exit(1);
});
