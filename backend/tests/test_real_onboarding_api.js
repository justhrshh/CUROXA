require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const mongoose = require('mongoose');
const express = require('express');
const superAdminRoutes = require('../routes/superAdminRoutes');
const SuperAdminHospital = require('../models/SuperAdminHospital');
const User = require('../models/User');
const jwt = require('jsonwebtoken');

// Create mock Express app with superAdminRoutes
const app = express();
app.use(express.json());

// Mock auth middleware for Super Admin test runner
app.use((req, res, next) => {
  req.user = { staff_id: 'superadmin', role: 'superadmin', name: 'Platform Super Admin' };
  next();
});
app.use('/api/superadmin', superAdminRoutes);

async function runE2EVerification() {
  console.log('====================================================');
  console.log('REAL FLOW VERIFICATION: SUPER ADMIN ONBOARDING API');
  console.log('====================================================\n');

  await mongoose.connect(process.env.MONGO_URI, {
    serverSelectionTimeoutMS: 10000,
    socketTimeoutMS: 45000
  });
  console.log('✓ Connected to MongoDB.\n');

  // 1. Verify an Existing Hospital Document
  console.log('[STEP 1] Fetching Existing Hospital Document from MongoDB...');
  const existingHosp = await SuperAdminHospital.findOne({ status: 'Active' }).lean();
  console.log('Existing Hospital Record from MongoDB:');
  console.log({
    _id: existingHosp._id,
    code: existingHosp.code,
    hospitalId: existingHosp.hospitalId,
    name: existingHosp.name,
    logo: existingHosp.logo,
    status: existingHosp.status
  });

  if (!existingHosp.hospitalId || !/^HSP-[A-Z0-9]{6}$/.test(existingHosp.hospitalId)) {
    throw new Error('Existing hospital does not have a valid HSP-XXXXXX hospitalId!');
  }
  console.log('✓ Existing hospital document verified.\n');

  // 2. Perform Real Onboarding Flow (Super Admin Onboarding -> API Request -> Backend -> Mongo)
  console.log('[STEP 2] Simulating Super Admin Onboarding API Request...');
  const testPhone = `98${Math.floor(10000000 + Math.random() * 90000000)}`;
  const testCode = `med_e2e_${Date.now()}`;
  const payload = {
    name: 'Apollo Lifeline Hospital',
    code: testCode,
    plan: 'Enterprise Elite (₹50,000/mo)',
    status: 'Active',
    logo: 'AL',
    adminName: 'Dr. Ramesh Sharma',
    adminEmail: `admin_${Date.now()}@apollo.com`,
    adminPhone: testPhone,
    adminPassword: 'Password@123'
  };

  const { getJwtSecret } = require('../config/env');
  const secret = getJwtSecret();
  const superAdminToken = jwt.sign(
    { staff_id: 'superadmin', role: 'superadmin', name: 'Platform Super Admin' },
    secret,
    { expiresIn: '1h' }
  );

  // Dispatch request to Express app
  const server = app.listen(0);
  const port = server.address().port;

  const response = await fetch(`http://127.0.0.1:${port}/api/superadmin/hospitals`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${superAdminToken}`
    },
    body: JSON.stringify(payload)
  });

  const responseData = await response.json();
  console.log(`API Response Status: ${response.status}`);
  console.log('API Response Body:');
  console.log(responseData);

  if (response.status !== 200 && response.status !== 201) {
    server.close();
    throw new Error(`API returned error status ${response.status}: ${JSON.stringify(responseData)}`);
  }

  // 3. Query MongoDB directly to verify persisted document
  console.log('\n[STEP 3] Querying MongoDB directly to verify persisted hospital document...');
  const createdDoc = await SuperAdminHospital.findOne({ code: testCode }).lean();
  console.log('Persisted MongoDB Document:');
  console.log({
    _id: createdDoc._id,
    code: createdDoc.code,
    hospitalId: createdDoc.hospitalId,
    name: createdDoc.name,
    logo: createdDoc.logo,
    status: createdDoc.status
  });

  // Strict Assertions
  if (!createdDoc) {
    throw new Error('Hospital document was not found in MongoDB!');
  }
  if (!createdDoc.hospitalId || !/^HSP-[A-Z0-9]{6}$/.test(createdDoc.hospitalId)) {
    throw new Error(`Created hospitalId '${createdDoc.hospitalId}' is invalid or missing!`);
  }
  if (createdDoc.name !== payload.name) {
    throw new Error(`Name mismatch: expected '${payload.name}', got '${createdDoc.name}'`);
  }
  if (createdDoc.code !== payload.code) {
    throw new Error(`Code mismatch: expected '${payload.code}', got '${createdDoc.code}'`);
  }
  if (createdDoc.logo !== payload.logo) {
    throw new Error(`Logo mismatch: expected '${payload.logo}', got '${createdDoc.logo}'`);
  }
  if (createdDoc.status !== payload.status) {
    throw new Error(`Status mismatch: expected '${payload.status}', got '${createdDoc.status}'`);
  }

  // 4. Verify Provisioned Admin User
  console.log('\n[STEP 4] Verifying Provisioned Admin User in MongoDB...');
  const adminUser = await User.findOne({ tenantId: testCode, role: 'admin' }).lean();
  console.log('Provisioned Admin User:', {
    _id: adminUser._id,
    staff_id: adminUser.staff_id,
    tenantId: adminUser.tenantId,
    role: adminUser.role,
    name: adminUser.name,
    email: adminUser.email
  });

  if (!adminUser || adminUser.tenantId !== testCode) {
    throw new Error('Admin user was not provisioned with correct tenantId!');
  }
  console.log('✓ Admin user verified.\n');

  // 5. Cleanup
  console.log('[CLEANUP] Cleaning up test hospital and admin user...');
  await SuperAdminHospital.deleteOne({ _id: createdDoc._id });
  await User.deleteOne({ _id: adminUser._id });
  server.close();
  console.log('✓ Cleanup complete.\n');

  console.log('====================================================');
  console.log('REAL ONBOARDING API FLOW FULLY VERIFIED!');
  console.log('====================================================');

  await mongoose.disconnect();
}

runE2EVerification().catch((err) => {
  console.error('E2E VERIFICATION FAILED:', err);
  process.exit(1);
});
