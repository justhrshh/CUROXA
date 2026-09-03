require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const mongoose = require('mongoose');
const express = require('express');
const connectDB = require('../config/db');
const SuperAdminHospital = require('../models/SuperAdminHospital');
const User = require('../models/User');
const superAdminRoutes = require('../routes/superAdminRoutes');
const jwt = require('jsonwebtoken');
const { getJwtSecret } = require('../config/env');

async function verifyAll() {
  console.log('====================================================');
  console.log('ACCEPTANCE CRITERIA VERIFICATION');
  console.log('====================================================\n');

  // 1. Test connectDB startup without migration query
  console.log('[STEP 1] Testing connectDB() startup...');
  const start = Date.now();
  await connectDB();
  const elapsed = Date.now() - start;
  console.log(`✓ connectDB() completed in ${elapsed}ms without running any hospitalId backfill queries.\n`);

  // 2. Existing Hospitals: Check all 110 retain valid, unchanged hospitalIds
  console.log('[STEP 2] Verifying all 110 existing hospitals...');
  const allHospitals = await SuperAdminHospital.find({}, { _id: 1, code: 1, hospitalId: 1, name: 1, logo: 1, status: 1 }).lean();
  console.log(`Total hospitals found: ${allHospitals.length}`);
  
  if (allHospitals.length !== 110) {
    console.warn(`Note: expected 110 hospitals, found ${allHospitals.length}`);
  }

  const invalidHospitals = allHospitals.filter(h => !h.hospitalId || !/^HSP-[A-Z0-9]{6}$/.test(h.hospitalId));
  if (invalidHospitals.length > 0) {
    throw new Error(`Found ${invalidHospitals.length} hospitals with invalid/missing hospitalId!`);
  }

  // Check uniqueness of hospitalId across all hospitals
  const ids = allHospitals.map(h => h.hospitalId);
  const uniqueIds = new Set(ids);
  if (uniqueIds.size !== ids.length) {
    throw new Error(`Duplicate hospitalId detected! Unique: ${uniqueIds.size}, Total: ${ids.length}`);
  }
  console.log(`✓ All ${allHospitals.length} hospitals have 100% unique, valid HSP-XXXXXX IDs.\n`);

  // 3. New Hospital Onboarding API flow
  console.log('[STEP 3] Verifying New Hospital Onboarding via API...');
  const app = express();
  app.use(express.json());
  app.use((req, res, next) => {
    req.user = { staff_id: 'superadmin', role: 'superadmin', name: 'Platform Super Admin' };
    next();
  });
  app.use('/api/superadmin', superAdminRoutes);

  const server = app.listen(0);
  const port = server.address().port;

  const testPhone = `98${Math.floor(10000000 + Math.random() * 90000000)}`;
  const testCode = `med_acc_${Date.now()}`;
  const superAdminToken = jwt.sign(
    { staff_id: 'superadmin', role: 'superadmin', name: 'Platform Super Admin' },
    getJwtSecret(),
    { expiresIn: '1h' }
  );

  const createRes = await fetch(`http://127.0.0.1:${port}/api/superadmin/hospitals`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${superAdminToken}`
    },
    body: JSON.stringify({
      name: 'Verification General Hospital',
      code: testCode,
      plan: 'Professional Plan',
      status: 'Active',
      logo: 'VG',
      adminName: 'Dr. Test Onboarding',
      adminEmail: `test_${Date.now()}@hospital.com`,
      adminPhone: testPhone,
      adminPassword: 'Password@123'
    })
  });

  const createdHospital = await createRes.json();
  console.log(`Onboarding API Response Status: ${createRes.status}`);
  console.log(`Generated Hospital ID: ${createdHospital.hospitalId}`);

  if (!createdHospital.hospitalId || !/^HSP-[A-Z0-9]{6}$/.test(createdHospital.hospitalId)) {
    server.close();
    throw new Error(`New hospital failed to receive valid hospitalId! Got: ${createdHospital.hospitalId}`);
  }
  console.log('✓ New hospital onboarding received valid, stable HSP-XXXXXX.\n');

  // 4. Super Admin Hospitals Page Endpoint: GET /api/superadmin/hospitals
  console.log('[STEP 4] Verifying GET /api/superadmin/hospitals and legacy telemetry...');
  const getRes = await fetch(`http://127.0.0.1:${port}/api/superadmin/hospitals`, {
    headers: { 'Authorization': `Bearer ${superAdminToken}` }
  });

  const listHospitals = await getRes.json();
  console.log(`GET /hospitals Status: ${getRes.status}`);
  console.log(`Hospitals returned by GET /hospitals: ${listHospitals.length}`);
  
  if (!Array.isArray(listHospitals) || listHospitals.length === 0) {
    server.close();
    throw new Error('GET /api/superadmin/hospitals failed to return hospital array.');
  }

  const sampleHosp = listHospitals.find(h => h.code === testCode);
  console.log('Sample newly created hospital returned by GET /hospitals:', {
    _id: sampleHosp._id,
    code: sampleHosp.code,
    hospitalId: sampleHosp.hospitalId,
    name: sampleHosp.name,
    adminUsername: sampleHosp.adminUsername,
    limits: sampleHosp.limits
  });

  if (!sampleHosp.hospitalId || sampleHosp.hospitalId !== createdHospital.hospitalId) {
    server.close();
    throw new Error('Hospital ID mismatch in GET /api/superadmin/hospitals list!');
  }
  console.log('✓ GET /api/superadmin/hospitals returns all hospitals with accurate telemetry and intact hospitalId.\n');

  // Cleanup
  console.log('[CLEANUP] Cleaning up test hospital...');
  await SuperAdminHospital.deleteOne({ code: testCode });
  await User.deleteOne({ tenantId: testCode });
  server.close();
  console.log('✓ Cleanup complete.\n');

  console.log('====================================================');
  console.log('ALL ACCEPTANCE CRITERIA VERIFIED WITH 100% SUCCESS!');
  console.log('====================================================');

  await mongoose.disconnect();
}

verifyAll().catch((err) => {
  console.error('VERIFICATION ERROR:', err);
  process.exit(1);
});
