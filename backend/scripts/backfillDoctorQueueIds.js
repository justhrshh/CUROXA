const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const connectDB = require('../config/db');
const User = require('../models/User');
const crypto = require('crypto');

async function seed() {
  await connectDB();
  const doctors = await User.find({ role: 'doctor' });
  console.log(`Found ${doctors.length} doctors`);
  for (const doc of doctors) {
    if (!doc.publicQueueId) {
      doc.publicQueueId = 'q_' + crypto.randomBytes(10).toString('hex');
      await doc.save();
      console.log(`Assigned publicQueueId to ${doc.name}: ${doc.publicQueueId}`);
    } else {
      console.log(`Doctor ${doc.name} already has ${doc.publicQueueId}`);
    }
  }
  process.exit(0);
}

seed().catch(err => {
  console.error(err);
  process.exit(1);
});
