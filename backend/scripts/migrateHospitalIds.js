require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const mongoose = require('mongoose');
const SuperAdminHospital = require('../models/SuperAdminHospital');
const { backfillHospitalIds } = require('../utils/generateHospitalId');

async function runMigration() {
  console.log('====================================================');
  console.log('HOSPITAL ID (HSP-XXXXXX) STANDALONE MIGRATION SCRIPT');
  console.log('====================================================\n');

  const uri = process.env.MONGO_URI;
  if (!uri) {
    console.error('ERROR: MONGO_URI not found in environment variables.');
    process.exit(1);
  }

  console.log('Connecting to MongoDB...');
  await mongoose.connect(uri, {
    serverSelectionTimeoutMS: 10000,
    socketTimeoutMS: 45000
  });
  console.log('Connected to MongoDB.\n');

  console.log('Scanning hospitals collection for missing or invalid hospitalId fields...');
  const result = await backfillHospitalIds(SuperAdminHospital);
  console.log('Migration completed successfully:');
  console.log(`- Total registered hospitals scanned: ${result.scanned}`);
  console.log(`- Hospitals migrated with new ID:     ${result.migrated}`);
  console.log(`- Hospitals skipped (already valid):   ${result.skipped}\n`);

  await mongoose.disconnect();
  console.log('MongoDB disconnected. Done.');
}

if (require.main === module) {
  runMigration().catch((err) => {
    console.error('Migration failed:', err);
    process.exit(1);
  });
}

module.exports = runMigration;
