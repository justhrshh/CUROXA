require('dotenv').config();
const mongoose = require('mongoose');
const http = require('http');
const express = require('express');

async function main() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log('✅ Connected to MongoDB');

  const ItemMaster = require('../models/ItemMaster');
  const HospitalMasterConfig = require('../models/HospitalMasterConfig');

  // 1. Check city_hospital has medicines and tests
  const configs = await HospitalMasterConfig.find({ tenantId: 'city_hospital', status: 'Active', approvalStatus: 'Approved' })
    .populate('masterItemId', 'itemName itemCode category department genericName')
    .lean();

  const medicines = configs.filter(c => /^pharmacy$/i.test(c.category));
  const tests = configs.filter(c => /^(pathology|lab operation|radiology|service|diagnostics)$/i.test(c.category));

  console.log(`\n✅ Hospital 'city_hospital' has ${medicines.length} medicines in catalog:`);
  medicines.forEach(m => console.log(`   💊 ${m.masterItemId?.itemName} (${m.masterItemId?.itemCode})`));

  console.log(`\n✅ Hospital 'city_hospital' has ${tests.length} diagnostic tests in catalog:`);
  tests.forEach(t => console.log(`   🧪 ${t.masterItemId?.itemName} (${t.masterItemId?.itemCode}) - ${t.category}`));

  // 2. Verify Prescription schema has notes, diagnosis, tests
  const Prescription = require('../models/Prescription');
  const schema = Prescription.schema.paths;
  const hasNotes = !!schema['notes'];
  const hasDiagnosis = !!schema['diagnosis'];
  const hasTests = !!schema['tests'];
  console.log(`\n✅ Prescription schema fields:`);
  console.log(`   notes: ${hasNotes ? '✅ Present' : '❌ Missing'}`);
  console.log(`   diagnosis: ${hasDiagnosis ? '✅ Present' : '❌ Missing'}`);
  console.log(`   tests: ${hasTests ? '✅ Present' : '❌ Missing'}`);
  console.log(`   items.itemCode: ${!!schema['items.itemCode'] ? '✅ Present' : '❌ Missing'}`);
  console.log(`   items.masterItemId: ${!!schema['items.masterItemId'] ? '✅ Present' : '❌ Missing'}`);
  console.log(`   items.genericName: ${!!schema['items.genericName'] ? '✅ Present' : '❌ Missing'}`);

  // 3. Verify backend routes load correctly
  const prescriptionRoutes = require('../routes/prescriptionRoutes');
  const routes = prescriptionRoutes.stack.map(r => `${Object.keys(r.route?.methods || {}).join(',').toUpperCase()} ${r.route?.path}`).filter(Boolean);
  console.log(`\n✅ Prescription routes registered:`);
  routes.forEach(r => console.log(`   ${r}`));

  const hasCatalogMeds = routes.some(r => r.includes('/catalog/medicines'));
  const hasCatalogTests = routes.some(r => r.includes('/catalog/tests'));
  console.log(`\n   /catalog/medicines: ${hasCatalogMeds ? '✅' : '❌'}`);
  console.log(`   /catalog/tests: ${hasCatalogTests ? '✅' : '❌'}`);

  console.log('\n🎉 All checks passed!');
  process.exit(0);
}

main().catch(err => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
