require('dotenv').config();
const mongoose = require('mongoose');

async function main() {
  await mongoose.connect(process.env.MONGO_URI);
  const ItemMaster = require('../models/ItemMaster');
  const HMC = require('../models/HospitalMasterConfig');

  const ph = await HMC.find({ tenantId: 'city_hospital' })
    .populate('masterItemId', 'itemName itemCode category department genericName')
    .lean();
  console.log('City Hospital all assigned items:', ph.map(p => ({
    category: p.category,
    name: p.masterItemId?.itemName,
    code: p.masterItemId?.itemCode,
    generic: p.masterItemId?.genericName
  })));

  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
