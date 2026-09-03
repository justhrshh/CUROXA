const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const http = require('http');
const express = require('express');
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });

const { verifyToken, isSuperAdmin } = require('../middleware/authMiddleware');
const tenantMiddleware = require('../middleware/tenantMiddleware');

// Models
const Hospital = require('../models/SuperAdminHospital');
const User = require('../models/User');
const Patient = require('../models/Patient');
const Medicine = require('../models/Medicine');
const Appointment = require('../models/Appointment');
const PurchaseOrder = require('../models/PurchaseOrder');

// Routes
const authRoutes = require('../routes/authRoutes');
const portalRoutes = require('../routes/portalRoutes');
const patientRoutes = require('../routes/patientRoutes');
const medicineRoutes = require('../routes/medicineRoutes');
const appointmentRoutes = require('../routes/appointmentRoutes');
const superAdminRoutes = require('../routes/superAdminRoutes');

async function main() {
  console.log('====================================================');
  console.log('PHASE 2: TENANT-SCOPED AUTHENTICATION & DATA ISOLATION VERIFICATION');
  console.log('====================================================\n');

  const mongoUri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/curoxa';
  await mongoose.connect(mongoUri);
  console.log('Connected to MongoDB at', mongoUri);

  // Set up Express Test App exactly mirroring server.js
  const app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  app.use(tenantMiddleware);

  // Mount routes
  app.use('/api/auth', authRoutes);
  app.use('/api/public/portal', portalRoutes);
  app.use('/api/patients', patientRoutes);
  app.use('/api/medicines', medicineRoutes);
  app.use('/api/appointments', appointmentRoutes);
  app.use('/api/superadmin', superAdminRoutes);

  // Start test server on dynamic port
  const server = http.createServer(app);
  await new Promise(resolve => server.listen(0, resolve));
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;
  console.log(`Test API Server running on ${baseUrl}\n`);

  // Helper request function
  async function apiRequest(method, path, body = null, headers = {}) {
    const url = `${baseUrl}${path}`;
    const opts = {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...headers
      }
    };
    if (body) opts.body = JSON.stringify(body);
    const res = await fetch(url, opts);
    let data;
    const text = await res.text();
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
    return { status: res.status, headers: res.headers, data };
  }

  // Ensure test tenants, users, and data exist
  const TENANT_A = 'test_hosp_a';
  const TENANT_B = 'test_hosp_b';
  const CODE_A = 'HSP-TESTA1';
  const CODE_B = 'HSP-TESTB2';

  // Upsert Hospitals
  await Hospital.findOneAndUpdate(
    { code: TENANT_A },
    {
      code: TENANT_A,
      hospitalId: CODE_A,
      name: 'Alpha General Hospital',
      status: 'active',
      theme: { primaryColor: '#2563eb' }
    },
    { upsert: true, new: true }
  );

  await Hospital.findOneAndUpdate(
    { code: TENANT_B },
    {
      code: TENANT_B,
      hospitalId: CODE_B,
      name: 'Beta Specialty Clinic',
      status: 'active',
      theme: { primaryColor: '#10b981' }
    },
    { upsert: true, new: true }
  );

  // Hash password
  const hashedPassword = await bcrypt.hash('TestPass123!', 10);

  // Upsert Users
  await User.findOneAndUpdate(
    { email: 'doctor.alpha@curoxa.test' },
    {
      name: 'Dr. Alpha',
      email: 'doctor.alpha@curoxa.test',
      password_hash: hashedPassword,
      role: 'doctor',
      tenantId: TENANT_A,
      staff_id: 'STAFF-A1',
      password_version: 1
    },
    { upsert: true, returnDocument: 'after' }
  );

  await User.findOneAndUpdate(
    { email: 'doctor.beta@curoxa.test' },
    {
      name: 'Dr. Beta',
      email: 'doctor.beta@curoxa.test',
      password_hash: hashedPassword,
      role: 'doctor',
      tenantId: TENANT_B,
      staff_id: 'STAFF-B1',
      password_version: 1
    },
    { upsert: true, returnDocument: 'after' }
  );

  await User.findOneAndUpdate(
    { email: 'superadmin@curoxa.test' },
    {
      name: 'Super Admin',
      email: 'superadmin@curoxa.test',
      password_hash: hashedPassword,
      role: 'superadmin',
      tenantId: 'platform',
      staff_id: 'STAFF-SA1',
      password_version: 1
    },
    { upsert: true, returnDocument: 'after' }
  );

  // Seed sample data for Hospital A & B
  await Patient.deleteMany({ tenantId: { $in: [TENANT_A, TENANT_B] } });
  await Medicine.deleteMany({ tenantId: { $in: [TENANT_A, TENANT_B] } });

  const patientA = await Patient.create({
    name: 'Alice Alpha',
    patientId: 'pat-01',
    age: 30,
    gender: 'Female',
    contact: '555-0101',
    tenantId: TENANT_A
  });

  const patientB = await Patient.create({
    name: 'Bob Beta',
    patientId: 'pat-02',
    age: 45,
    gender: 'Male',
    contact: '555-0202',
    tenantId: TENANT_B
  });

  const medicineA = await Medicine.create({
    name: 'Amoxicillin 500mg',
    category: 'Antibiotics',
    sku: 'MED-A101',
    unit: 'Tablets',
    stock: 100,
    mrp: 15.5,
    tenantId: TENANT_A
  });

  const medicineB = await Medicine.create({
    name: 'Benadryl 25mg',
    category: 'Antihistamine',
    sku: 'MED-B202',
    unit: 'Tablets',
    stock: 50,
    mrp: 8.0,
    tenantId: TENANT_B
  });

  console.log('Seeded Isolation Test Fixtures:');
  console.log(`- Hospital A: ${TENANT_A} (${CODE_A}), Patient: ${patientA.name} (${patientA._id}), Medicine: ${medicineA.name}`);
  console.log(`- Hospital B: ${TENANT_B} (${CODE_B}), Patient: ${patientB.name} (${patientB._id}), Medicine: ${medicineB.name}\n`);

  let testsPassed = 0;
  let totalTests = 0;

  function assertTest(desc, passed, detail) {
    totalTests++;
    if (passed) {
      testsPassed++;
      console.log(`[PASS] ${desc}`);
      if (detail) console.log(`       -> ${detail}`);
    } else {
      console.error(`[FAIL] ${desc}`);
      if (detail) console.error(`       -> ${detail}`);
    }
  }

  // ----------------------------------------------------
  // TEST A: Correct Hospital Login & Data Access
  // ----------------------------------------------------
  console.log('\n--- TEST A: Correct Hospital Login & Scoped Access ---');
  const loginResA = await apiRequest('POST', '/api/auth/login', {
    staff_id: 'STAFF-A1',
    password: 'TestPass123!'
  });
  assertTest('Login as Doctor Alpha returns 200 and token', loginResA.status === 200 && !!loginResA.data?.token, `Token received: ${!!loginResA.data?.token}`);
  const tokenA = loginResA.data?.token;

  const authHeaderA = { 'Authorization': `Bearer ${tokenA}` };

  const getPatientsA = await apiRequest('GET', '/api/patients', null, authHeaderA);
  const patListA = Array.isArray(getPatientsA.data) ? getPatientsA.data : (getPatientsA.data?.patients || []);
  const seesOnlyA = patListA.length === 1 && patListA[0].patientId === 'pat-01';
  assertTest('Doctor Alpha sees only Hospital A patients', seesOnlyA, `Found ${patListA.length} patients: ${patListA.map(p => p.name).join(', ')}`);

  const getMedicinesA = await apiRequest('GET', '/api/medicines', null, authHeaderA);
  const medListA = Array.isArray(getMedicinesA.data) ? getMedicinesA.data : (getMedicinesA.data?.medicines || []);
  const seesOnlyMedA = medListA.length === 1 && medListA[0].name === 'Amoxicillin 500mg';
  assertTest('Doctor Alpha sees only Hospital A medicines', seesOnlyMedA, `Found ${medListA.length} medicines: ${medListA.map(m => m.name).join(', ')}`);

  // ----------------------------------------------------
  // TEST B: URL Tampering (Switching portal route does not grant data access)
  // ----------------------------------------------------
  console.log('\n--- TEST B: URL Tampering & Public Branding Isolation ---');
  const portalResB = await apiRequest('GET', `/api/public/portal/${CODE_B}`);
  assertTest('Public portal endpoint returns branding for Hospital B', portalResB.status === 200 && portalResB.data.hospitalId === CODE_B, `Branding returned: ${portalResB.data.name}`);

  // But Doctor Alpha holding Token A visiting Hospital B's portal route still only gets Hospital A data on protected endpoints
  const protectedWithTokenA = await apiRequest('GET', '/api/patients', null, authHeaderA);
  const protectedPatients = Array.isArray(protectedWithTokenA.data) ? protectedWithTokenA.data : (protectedWithTokenA.data?.patients || []);
  assertTest('Token A on Hospital B portal context still returns only Hospital A data', protectedPatients.length === 1 && protectedPatients[0].tenantId === TENANT_A, `TenantId in returned record: ${protectedPatients[0]?.tenantId}`);

  // ----------------------------------------------------
  // TEST C: Header Tampering (x-tenant-id injection)
  // ----------------------------------------------------
  console.log('\n--- TEST C: Header Tampering (x-tenant-id Header Override) ---');
  const headerTamperRes = await apiRequest('GET', '/api/patients', null, {
    ...authHeaderA,
    'x-tenant-id': TENANT_B
  });
  const headerTamperList = Array.isArray(headerTamperRes.data) ? headerTamperRes.data : (headerTamperRes.data?.patients || []);
  const headerTamperBlocked = headerTamperList.length === 1 && headerTamperList[0].tenantId === TENANT_A;
  assertTest('Injected x-tenant-id header is ignored in favor of JWT identity', headerTamperBlocked, `Received ${headerTamperList.length} records belonging to ${headerTamperList[0]?.tenantId}`);

  // ----------------------------------------------------
  // TEST D: Query / Body Parameter Tampering
  // ----------------------------------------------------
  console.log('\n--- TEST D: Query & Body Parameter Tampering ---');
  const queryTamperRes = await apiRequest('GET', `/api/patients?tenantId=${TENANT_B}`, null, authHeaderA);
  const queryTamperList = Array.isArray(queryTamperRes.data) ? queryTamperRes.data : (queryTamperRes.data?.patients || []);
  const queryTamperBlocked = queryTamperList.length === 1 && queryTamperList[0].tenantId === TENANT_A;
  assertTest('Query param ?tenantId=... is overridden by JWT tenantId', queryTamperBlocked, `Result patient: ${queryTamperList[0]?.name}`);

  // ----------------------------------------------------
  // TEST E: Direct ID Access / Resource ID Manipulation
  // ----------------------------------------------------
  console.log('\n--- TEST E: Direct Resource ID Access to Other Tenant Records ---');
  // Attempt to fetch Hospital B's patient directly by ID using Doctor Alpha's token
  const directPatientGet = await apiRequest('GET', `/api/patients/${patientB._id}`, null, authHeaderA);
  assertTest('Doctor Alpha cannot fetch Hospital B patient by ID (Returns 404/Empty)', directPatientGet.status === 404 || !directPatientGet.data || directPatientGet.data.tenantId === TENANT_A || directPatientGet.data?.error, `Status: ${directPatientGet.status}`);

  // Attempt to update Hospital B's medicine using Doctor Alpha's token
  const directMedUpdate = await apiRequest('PUT', `/api/medicines/${medicineB._id}`, {
    stock: 9999,
    mrp: 0.01
  }, authHeaderA);
  assertTest('Doctor Alpha cannot modify Hospital B medicine by ID (Returns 404/Error)', directMedUpdate.status === 404 || directMedUpdate.status === 403 || directMedUpdate.data?.error, `Status: ${directMedUpdate.status}`);

  // Attempt to delete Hospital B's patient using Doctor Alpha's token
  const directPatientDelete = await apiRequest('DELETE', `/api/patients/${patientB._id}`, null, authHeaderA);
  assertTest('Doctor Alpha cannot delete Hospital B patient by ID (Returns 404/Error)', directPatientDelete.status === 404 || directPatientDelete.status === 403 || directPatientDelete.data?.error, `Status: ${directPatientDelete.status}`);

  // ----------------------------------------------------
  // TEST F: Database State Integrity Check
  // ----------------------------------------------------
  console.log('\n--- TEST F: Database State Integrity Verification ---');
  const freshMedB = await Medicine.findById(medicineB._id);
  assertTest('Hospital B Medicine stock was NOT modified in DB', freshMedB.stock === 50 && freshMedB.mrp === 8.0, `Stock: ${freshMedB.stock}, MRP: ${freshMedB.mrp}`);

  const freshPatB = await Patient.findById(patientB._id);
  assertTest('Hospital B Patient was NOT deleted or corrupted in DB', freshPatB !== null && freshPatB.name === 'Bob Beta', `Patient found: ${freshPatB?.name}`);

  // ----------------------------------------------------
  // TEST G: Logout & Session Transition
  // ----------------------------------------------------
  console.log('\n--- TEST G: Logout & Session Transition ---');
  // Clear token (logout) and request protected endpoint
  const unauthRes = await apiRequest('GET', '/api/patients', null, {});
  assertTest('Unauthenticated request to protected endpoint is rejected (401)', unauthRes.status === 401, `Status: ${unauthRes.status}`);

  // Log in as Hospital B user
  const loginResB = await apiRequest('POST', '/api/auth/login', {
    staff_id: 'STAFF-B1',
    password: 'TestPass123!'
  });
  const tokenB = loginResB.data?.token;
  const authHeaderB = { 'Authorization': `Bearer ${tokenB}` };

  const getPatientsB = await apiRequest('GET', '/api/patients', null, authHeaderB);
  const patListB = Array.isArray(getPatientsB.data) ? getPatientsB.data : (getPatientsB.data?.patients || []);
  assertTest('Doctor Beta sees only Hospital B patients', patListB.length === 1 && patListB[0].patientId === 'pat-02', `Found: ${patListB.map(p => p.name).join(', ')}`);

  // ----------------------------------------------------
  // TEST H: Super Admin Boundaries & Impersonation
  // ----------------------------------------------------
  console.log('\n--- TEST H: Super Admin Boundaries & Tenant Impersonation ---');
  const loginResSA = await apiRequest('POST', '/api/auth/login', {
    staff_id: 'STAFF-SA1',
    password: 'TestPass123!'
  });
  const tokenSA = loginResSA.data?.token;
  const authHeaderSA = { 'Authorization': `Bearer ${tokenSA}` };

  // Super admin can access superadmin routes
  const saHospitals = await apiRequest('GET', '/api/superadmin/hospitals', null, authHeaderSA);
  assertTest('Super Admin can access Super Admin endpoints', saHospitals.status === 200, `Status: ${saHospitals.status}`);

  // Non-superadmin cannot access superadmin routes
  const doctorOnSA = await apiRequest('GET', '/api/superadmin/hospitals', null, authHeaderA);
  assertTest('Doctor Alpha is forbidden from Super Admin endpoints (403)', doctorOnSA.status === 403, `Status: ${doctorOnSA.status}`);

  // Super Admin impersonation login generates valid tenant-scoped session
  const impRes = await apiRequest('POST', `/api/superadmin/hospitals/${TENANT_A}/impersonate-login`, {}, authHeaderSA);
  assertTest('Super Admin impersonation generates tenant token for Hospital A', impRes.status === 200 && impRes.data.user?.tenantId === TENANT_A, `Impersonated tenant: ${impRes.data.user?.tenantId}`);

  // ----------------------------------------------------
  // Clean up
  // ----------------------------------------------------
  await Patient.deleteMany({ tenantId: { $in: [TENANT_A, TENANT_B] } });
  await Medicine.deleteMany({ tenantId: { $in: [TENANT_A, TENANT_B] } });
  await User.deleteMany({ email: { $in: ['doctor.alpha@curoxa.test', 'doctor.beta@curoxa.test', 'superadmin@curoxa.test'] } });
  await Hospital.deleteMany({ code: { $in: [TENANT_A, TENANT_B] } });

  server.close();
  await mongoose.disconnect();

  console.log('\n====================================================');
  console.log(`TEST SUMMARY: ${testsPassed} / ${totalTests} TESTS PASSED (${((testsPassed / totalTests) * 100).toFixed(0)}%)`);
  console.log('====================================================');

  if (testsPassed === totalTests) {
    process.exit(0);
  } else {
    process.exit(1);
  }
}

main().catch(err => {
  console.error('Fatal Test Execution Error:', err);
  process.exit(1);
});
