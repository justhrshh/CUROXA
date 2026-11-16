/**
 * QUROXA Phase 1.2: Remaining Backend Security Fixes Verification Suite
 * 
 * Verifies:
 * - Hospital operational routes protection against patient tokens (pharmacy sales, medicines, expenses, indents, GRN, returns, tickets, expiry)
 * - Administrative routes protection (broadcasts, notifications, letterhead)
 * - Tenant registration fallback closure (send-otp, verify-otp, self-registration tenant enforcement)
 * - Prevention of incomplete patient auto-provisioning (GET /api/patients/:id and EMR visits with orphan user)
 * - Staff workflow preservation across admin, doctor, pharmacist, inventory, receptionist
 */

const express = require('express');
const http = require('http');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const axios = require('axios');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const { getJwtSecret } = require('../config/env');
const User = require('../models/User');
const Patient = require('../models/Patient');
const SuperAdminHospital = require('../models/SuperAdminHospital');

const TEST_PORT = 5901;
const BASE_URL = `http://127.0.0.1:${TEST_PORT}`;

let server;
const results = [];

function recordResult(scenarioNum, name, passed, details) {
  results.push({ scenarioNum, name, passed, details });
  const statusStr = passed ? '✅ PASS' : '❌ FAIL';
  console.log(`[${statusStr}] Scenario ${scenarioNum}: ${name}`);
  if (details) console.log(`       Details: ${details}`);
}

async function setupTestApp() {
  const app = express();
  app.use(express.json());

  // Mount routes under test
  app.use('/api/auth', require('../routes/authRoutes'));
  app.use('/api/patients', require('../routes/patientRoutes'));
  app.use('/api/emr', require('../routes/emrRoutes'));
  app.use('/api/pharmacy-sales', require('../routes/pharmacySaleRoutes'));
  app.use('/api/medicines', require('../routes/medicineRoutes'));
  app.use('/api/expenses', require('../routes/expenseRoutes'));
  app.use('/api/indents', require('../routes/indentRoutes'));
  app.use('/api/goods-receipts', require('../routes/goodsReceiptRoutes'));
  app.use('/api/returns', require('../routes/returnRoutes'));
  app.use('/api/pharmacy-tickets', require('../routes/pharmacyTicketRoutes'));
  app.use('/api/inventory-expiry', require('../routes/inventoryExpiryRoutes'));
  app.use('/api/admin', require('../routes/adminRoutes'));

  return new Promise((resolve) => {
    server = app.listen(TEST_PORT, () => {
      console.log(`Phase 1.2 Test Server listening on ${BASE_URL}`);
      resolve();
    });
  });
}

async function runPhase12Suite() {
  console.log('======================================================================');
  console.log('  QUROXA PHASE 1.2: REMAINING BACKEND SECURITY FIXES VERIFICATION     ');
  console.log('======================================================================\n');

  console.log('[Setup] Connecting to MongoDB...');
  await mongoose.connect(process.env.MONGO_URI);
  console.log('[Setup] MongoDB Connected successfully.');

  await setupTestApp();

  let secretKey;
  try {
    secretKey = getJwtSecret();
  } catch (e) {
    secretKey = process.env.JWT_SECRET || 'secret_key';
  }

  const TENANT_A = 'sec12_hospital_a';
  const TENANT_B = 'sec12_hospital_b';

  console.log('[Setup] Seeding test hospitals and users...');

  // 1. Seed SuperAdminHospital records for valid tenant context
  await SuperAdminHospital.deleteMany({ code: { $in: [TENANT_A, TENANT_B] } });
  const hospitalA = await SuperAdminHospital.create({
    name: 'Sec12 Test Hospital Alpha',
    code: TENANT_A,
    hospitalId: 'HSP-SEC12A',
    status: 'Active'
  });
  const hospitalB = await SuperAdminHospital.create({
    name: 'Sec12 Test Hospital Beta',
    code: TENANT_B,
    hospitalId: 'HSP-SEC12B',
    status: 'Active'
  });

  // 2. Staff Users
  const adminUser = await User.create({
    name: 'Admin Staff',
    email: 'admin.sec12@curoxa.test',
    staff_id: 'STAFF_ADMIN_SEC12',
    role: 'admin',
    tenantId: TENANT_A,
    password_hash: 'HASH_SEC12'
  });

  const pharmacistUser = await User.create({
    name: 'Pharma Staff',
    email: 'pharma.sec12@curoxa.test',
    staff_id: 'STAFF_PHARMA_SEC12',
    role: 'pharmacist',
    tenantId: TENANT_A,
    password_hash: 'HASH_SEC12'
  });

  const doctorUser = await User.create({
    name: 'Doctor Staff',
    email: 'doctor.sec12@curoxa.test',
    staff_id: 'STAFF_DOC_SEC12',
    role: 'doctor',
    tenantId: TENANT_A,
    password_hash: 'HASH_SEC12'
  });

  const inventoryUser = await User.create({
    name: 'Inventory Staff',
    email: 'inventory.sec12@curoxa.test',
    staff_id: 'STAFF_INV_SEC12',
    role: 'inventory_manager',
    tenantId: TENANT_A,
    password_hash: 'HASH_SEC12'
  });

  const receptionistUser = await User.create({
    name: 'Reception Staff',
    email: 'reception.sec12@curoxa.test',
    staff_id: 'STAFF_REC_SEC12',
    role: 'receptionist',
    tenantId: TENANT_A,
    password_hash: 'HASH_SEC12'
  });

  // 3. Clinical Patient + User
  const patientA = await Patient.create({
    name: 'Bob Patient Sec12',
    contact: '9999888801',
    email: 'bob.sec12@curoxa.test',
    gender: 'Male',
    age: 35,
    bloodGroup: 'O+',
    tenantId: TENANT_A,
    uhId: 'UHID-SEC12-001'
  });

  const patientUserA = await User.create({
    name: 'Bob Patient Sec12',
    email: 'bob.sec12@curoxa.test',
    phone: '9999888801',
    staff_id: '9999888801',
    role: 'patient',
    tenantId: TENANT_A,
    password_hash: 'PATIENT_OTP_AUTH'
  });

  // 4. Orphan Patient User (User exists, but NO Patient document)
  const orphanUser = await User.create({
    name: 'Orphan User Sec12',
    email: 'orphan.sec12@curoxa.test',
    phone: '9999888899',
    staff_id: '9999888899',
    role: 'patient',
    tenantId: TENANT_A,
    password_hash: 'PATIENT_OTP_AUTH'
  });

  // Generate Tokens
  const adminToken = jwt.sign({ id: adminUser._id, role: 'admin', tenantId: TENANT_A }, secretKey);
  const pharmaToken = jwt.sign({ id: pharmacistUser._id, role: 'pharmacist', tenantId: TENANT_A }, secretKey);
  const docToken = jwt.sign({ id: doctorUser._id, role: 'doctor', tenantId: TENANT_A }, secretKey);
  const invToken = jwt.sign({ id: inventoryUser._id, role: 'inventory_manager', tenantId: TENANT_A }, secretKey);
  const recToken = jwt.sign({ id: receptionistUser._id, role: 'receptionist', tenantId: TENANT_A }, secretKey);

  const patientTokenA = jwt.sign({
    id: patientA._id,
    userId: patientUserA._id,
    role: 'patient',
    tenantId: TENANT_A
  }, secretKey);

  const orphanToken = jwt.sign({
    id: orphanUser._id,
    userId: orphanUser._id,
    role: 'patient',
    tenantId: TENANT_A
  }, secretKey);

  console.log('[Setup] Seed complete. Beginning scenario execution...\n');

  // ====================================================================
  // GROUP 1: HOSPITAL OPERATIONAL ROUTES (TASK 1)
  // ====================================================================
  console.log('--- GROUP 1: Hospital Operational Routes Protection (Task 1) ---');

  // Scenario 1: Patient calls /api/pharmacy-sales
  try {
    await axios.get(`${BASE_URL}/api/pharmacy-sales`, {
      headers: { Authorization: `Bearer ${patientTokenA}` }
    });
    recordResult(1, 'Patient token calls GET /api/pharmacy-sales', false, 'Expected 403 Forbidden but received 200');
  } catch (err) {
    const passed = err.response && err.response.status === 403;
    recordResult(1, 'Patient token calls GET /api/pharmacy-sales', passed, `HTTP Status: ${err.response?.status} (${err.response?.data?.error})`);
  }

  // Scenario 2: Pharmacist calls /api/pharmacy-sales
  try {
    const res = await axios.get(`${BASE_URL}/api/pharmacy-sales`, {
      headers: { Authorization: `Bearer ${pharmaToken}` }
    });
    recordResult(2, 'Pharmacist calls GET /api/pharmacy-sales', res.status === 200, `HTTP Status: ${res.status}`);
  } catch (err) {
    recordResult(2, 'Pharmacist calls GET /api/pharmacy-sales', false, `Failed: ${err.message}`);
  }

  // Scenario 3: Unauthenticated calls /api/pharmacy-sales
  try {
    await axios.get(`${BASE_URL}/api/pharmacy-sales`);
    recordResult(3, 'Unauthenticated calls GET /api/pharmacy-sales', false, 'Expected 401 Unauthorized');
  } catch (err) {
    const passed = err.response && err.response.status === 401;
    recordResult(3, 'Unauthenticated calls GET /api/pharmacy-sales', passed, `HTTP Status: ${err.response?.status}`);
  }

  // Scenario 4: Patient calls /api/medicines
  try {
    await axios.get(`${BASE_URL}/api/medicines`, {
      headers: { Authorization: `Bearer ${patientTokenA}` }
    });
    recordResult(4, 'Patient token calls GET /api/medicines', false, 'Expected 403 Forbidden');
  } catch (err) {
    const passed = err.response && err.response.status === 403;
    recordResult(4, 'Patient token calls GET /api/medicines', passed, `HTTP Status: ${err.response?.status} (${err.response?.data?.error})`);
  }

  // Scenario 5: Pharmacist calls /api/medicines
  try {
    const res = await axios.get(`${BASE_URL}/api/medicines`, {
      headers: { Authorization: `Bearer ${pharmaToken}` }
    });
    recordResult(5, 'Pharmacist calls GET /api/medicines', res.status === 200, `HTTP Status: ${res.status}`);
  } catch (err) {
    recordResult(5, 'Pharmacist calls GET /api/medicines', false, `Failed: ${err.message}`);
  }

  // Scenario 6: Patient calls /api/expenses
  try {
    await axios.get(`${BASE_URL}/api/expenses`, {
      headers: { Authorization: `Bearer ${patientTokenA}` }
    });
    recordResult(6, 'Patient token calls GET /api/expenses', false, 'Expected 403 Forbidden');
  } catch (err) {
    const passed = err.response && err.response.status === 403;
    recordResult(6, 'Patient token calls GET /api/expenses', passed, `HTTP Status: ${err.response?.status} (${err.response?.data?.error})`);
  }

  // Scenario 7: Admin calls /api/expenses
  try {
    const res = await axios.get(`${BASE_URL}/api/expenses`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    recordResult(7, 'Admin calls GET /api/expenses', res.status === 200, `HTTP Status: ${res.status}`);
  } catch (err) {
    recordResult(7, 'Admin calls GET /api/expenses', false, `Failed: ${err.message}`);
  }

  // Scenario 8: Patient calls /api/indents
  try {
    await axios.get(`${BASE_URL}/api/indents`, {
      headers: { Authorization: `Bearer ${patientTokenA}` }
    });
    recordResult(8, 'Patient token calls GET /api/indents', false, 'Expected 403 Forbidden');
  } catch (err) {
    const passed = err.response && err.response.status === 403;
    recordResult(8, 'Patient token calls GET /api/indents', passed, `HTTP Status: ${err.response?.status} (${err.response?.data?.error})`);
  }

  // Scenario 9: Inventory Manager calls /api/indents
  try {
    const res = await axios.get(`${BASE_URL}/api/indents`, {
      headers: { Authorization: `Bearer ${invToken}` }
    });
    recordResult(9, 'Inventory Manager calls GET /api/indents', res.status === 200, `HTTP Status: ${res.status}`);
  } catch (err) {
    recordResult(9, 'Inventory Manager calls GET /api/indents', false, `Failed: ${err.message}`);
  }

  // Scenario 10: Patient calls /api/goods-receipts
  try {
    await axios.get(`${BASE_URL}/api/goods-receipts`, {
      headers: { Authorization: `Bearer ${patientTokenA}` }
    });
    recordResult(10, 'Patient token calls GET /api/goods-receipts', false, 'Expected 403 Forbidden');
  } catch (err) {
    const passed = err.response && err.response.status === 403;
    recordResult(10, 'Patient token calls GET /api/goods-receipts', passed, `HTTP Status: ${err.response?.status} (${err.response?.data?.error})`);
  }

  // Scenario 11: Inventory Manager calls /api/goods-receipts
  try {
    const res = await axios.get(`${BASE_URL}/api/goods-receipts`, {
      headers: { Authorization: `Bearer ${invToken}` }
    });
    recordResult(11, 'Inventory Manager calls GET /api/goods-receipts', res.status === 200, `HTTP Status: ${res.status}`);
  } catch (err) {
    recordResult(11, 'Inventory Manager calls GET /api/goods-receipts', false, `Failed: ${err.message}`);
  }

  // Scenario 12: Patient calls /api/returns
  try {
    await axios.get(`${BASE_URL}/api/returns`, {
      headers: { Authorization: `Bearer ${patientTokenA}` }
    });
    recordResult(12, 'Patient token calls GET /api/returns', false, 'Expected 403 Forbidden');
  } catch (err) {
    const passed = err.response && err.response.status === 403;
    recordResult(12, 'Patient token calls GET /api/returns', passed, `HTTP Status: ${err.response?.status} (${err.response?.data?.error})`);
  }

  // Scenario 13: Inventory Manager calls /api/returns
  try {
    const res = await axios.get(`${BASE_URL}/api/returns`, {
      headers: { Authorization: `Bearer ${invToken}` }
    });
    recordResult(13, 'Inventory Manager calls GET /api/returns', res.status === 200, `HTTP Status: ${res.status}`);
  } catch (err) {
    recordResult(13, 'Inventory Manager calls GET /api/returns', false, `Failed: ${err.message}`);
  }

  // Scenario 14: Patient calls /api/pharmacy-tickets
  try {
    await axios.get(`${BASE_URL}/api/pharmacy-tickets`, {
      headers: { Authorization: `Bearer ${patientTokenA}` }
    });
    recordResult(14, 'Patient token calls GET /api/pharmacy-tickets', false, 'Expected 403 Forbidden');
  } catch (err) {
    const passed = err.response && err.response.status === 403;
    recordResult(14, 'Patient token calls GET /api/pharmacy-tickets', passed, `HTTP Status: ${err.response?.status} (${err.response?.data?.error})`);
  }

  // Scenario 15: Staff calls /api/pharmacy-tickets
  try {
    const res = await axios.get(`${BASE_URL}/api/pharmacy-tickets`, {
      headers: { Authorization: `Bearer ${pharmaToken}` }
    });
    recordResult(15, 'Staff calls GET /api/pharmacy-tickets', res.status === 200, `HTTP Status: ${res.status}`);
  } catch (err) {
    recordResult(15, 'Staff calls GET /api/pharmacy-tickets', false, `Failed: ${err.message}`);
  }

  // Scenario 16: Patient calls /api/inventory-expiry
  try {
    await axios.get(`${BASE_URL}/api/inventory-expiry`, {
      headers: { Authorization: `Bearer ${patientTokenA}` }
    });
    recordResult(16, 'Patient token calls GET /api/inventory-expiry', false, 'Expected 403 Forbidden');
  } catch (err) {
    const passed = err.response && err.response.status === 403;
    recordResult(16, 'Patient token calls GET /api/inventory-expiry', passed, `HTTP Status: ${err.response?.status} (${err.response?.data?.error})`);
  }

  // Scenario 17: Staff calls /api/inventory-expiry
  try {
    const res = await axios.get(`${BASE_URL}/api/inventory-expiry`, {
      headers: { Authorization: `Bearer ${invToken}` }
    });
    recordResult(17, 'Staff calls GET /api/inventory-expiry', res.status === 200, `HTTP Status: ${res.status}`);
  } catch (err) {
    recordResult(17, 'Staff calls GET /api/inventory-expiry', false, `Failed: ${err.message}`);
  }

  // ====================================================================
  // GROUP 2: ADMIN BROADCASTS, NOTIFICATIONS & LETTERHEAD (TASK 2)
  // ====================================================================
  console.log('\n--- GROUP 2: Admin Broadcasts, Notifications & Letterhead (Task 2) ---');

  // Scenario 18: Patient calls /api/admin/broadcasts
  try {
    await axios.get(`${BASE_URL}/api/admin/broadcasts`, {
      headers: { Authorization: `Bearer ${patientTokenA}` }
    });
    recordResult(18, 'Patient token calls GET /api/admin/broadcasts', false, 'Expected 403 Forbidden');
  } catch (err) {
    const passed = err.response && err.response.status === 403;
    recordResult(18, 'Patient token calls GET /api/admin/broadcasts', passed, `HTTP Status: ${err.response?.status} (${err.response?.data?.error})`);
  }

  // Scenario 19: Admin calls /api/admin/broadcasts
  try {
    const res = await axios.get(`${BASE_URL}/api/admin/broadcasts`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    recordResult(19, 'Admin calls GET /api/admin/broadcasts', res.status === 200, `HTTP Status: ${res.status}`);
  } catch (err) {
    recordResult(19, 'Admin calls GET /api/admin/broadcasts', false, `Failed: ${err.message}`);
  }

  // Scenario 20: Patient calls /api/admin/notifications
  try {
    await axios.get(`${BASE_URL}/api/admin/notifications`, {
      headers: { Authorization: `Bearer ${patientTokenA}` }
    });
    recordResult(20, 'Patient token calls GET /api/admin/notifications', false, 'Expected 403 Forbidden');
  } catch (err) {
    const passed = err.response && err.response.status === 403;
    recordResult(20, 'Patient token calls GET /api/admin/notifications', passed, `HTTP Status: ${err.response?.status} (${err.response?.data?.error})`);
  }

  // Scenario 21: Admin calls /api/admin/notifications
  try {
    const res = await axios.get(`${BASE_URL}/api/admin/notifications`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    recordResult(21, 'Admin calls GET /api/admin/notifications', res.status === 200, `HTTP Status: ${res.status}`);
  } catch (err) {
    recordResult(21, 'Admin calls GET /api/admin/notifications', false, `Failed: ${err.message}`);
  }

  // Scenario 22: Patient calls /api/admin/letterhead
  try {
    await axios.get(`${BASE_URL}/api/admin/letterhead`, {
      headers: { Authorization: `Bearer ${patientTokenA}` }
    });
    recordResult(22, 'Patient token calls GET /api/admin/letterhead', false, 'Expected 403 Forbidden');
  } catch (err) {
    const passed = err.response && err.response.status === 403;
    recordResult(22, 'Patient token calls GET /api/admin/letterhead', passed, `HTTP Status: ${err.response?.status} (${err.response?.data?.error})`);
  }

  // Scenario 23: Admin calls /api/admin/letterhead
  try {
    const res = await axios.get(`${BASE_URL}/api/admin/letterhead`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    recordResult(23, 'Admin calls GET /api/admin/letterhead', res.status === 200, `HTTP Status: ${res.status}`);
  } catch (err) {
    recordResult(23, 'Admin calls GET /api/admin/letterhead', false, `Failed: ${err.message}`);
  }

  // ====================================================================
  // GROUP 3: TENANT REGISTRATION FALLBACK CLOSURE (TASK 3)
  // ====================================================================
  console.log('\n--- GROUP 3: Tenant Registration Fallback Closure (Task 3) ---');

  // Scenario 24: send-otp without hospital context -> 400 Bad Request
  try {
    await axios.post(`${BASE_URL}/api/auth/patient-portal/send-otp`, {
      mobile: '9999888801'
    });
    recordResult(24, 'send-otp without hospital context returns 400', false, 'Expected 400 MISSING_HOSPITAL_CONTEXT');
  } catch (err) {
    const passed = err.response && err.response.status === 400 && err.response.data?.code === 'MISSING_HOSPITAL_CONTEXT';
    recordResult(24, 'send-otp without hospital context returns 400', passed, `HTTP Status: ${err.response?.status}, Code: ${err.response?.data?.code}`);
  }

  // Scenario 25: send-otp with non-existent hospital slug -> 404 Not Found
  try {
    await axios.post(`${BASE_URL}/api/auth/patient-portal/send-otp`, {
      mobile: '9999888801',
      tenantId: 'non_existent_hospital_xyz'
    });
    recordResult(25, 'send-otp with invalid hospital slug returns 404', false, 'Expected 404 INVALID_HOSPITAL_CONTEXT / HOSPITAL_NOT_FOUND');
  } catch (err) {
    const passed = err.response && err.response.status === 404 && (err.response.data?.code === 'HOSPITAL_NOT_FOUND' || err.response.data?.code === 'INVALID_HOSPITAL_CONTEXT');
    recordResult(25, 'send-otp with invalid hospital slug returns 404', passed, `HTTP Status: ${err.response?.status}, Code: ${err.response?.data?.code}`);
  }

  // Scenario 26: send-otp with valid hospital slug -> 200 OK
  const testKnownOtp = '654321';
  try {
    const res = await axios.post(`${BASE_URL}/api/auth/patient-portal/send-otp`, {
      mobile: '9999888801',
      tenantId: TENANT_A
    });

    // In non-dev/mock environment, set challenge with known test OTP
    const OtpChallenge = require('../models/OtpChallenge');
    const { hashOtp } = require('../services/otp/otpService');
    const hashedOtp = hashOtp(testKnownOtp, '9999888801', TENANT_A, 'PATIENT_PORTAL_AUTH');
    await OtpChallenge.findOneAndUpdate(
      { targetIdentifier: '9999888801', tenantId: TENANT_A, purpose: 'PATIENT_PORTAL_AUTH' },
      { $set: { hashedOtp, attempts: 0, expiresAt: new Date(Date.now() + 15 * 60 * 1000) } }
    );

    recordResult(26, 'send-otp with valid hospital slug returns 200', res.status === 200, `HTTP Status: ${res.status}`);
  } catch (err) {
    recordResult(26, 'send-otp with valid hospital slug returns 200', false, `Failed: ${err.message}`);
  }

  // Scenario 27: verify-otp without hospital context -> 400 Bad Request
  try {
    await axios.post(`${BASE_URL}/api/auth/patient-portal/verify-otp`, {
      mobile: '9999888801',
      otp: testKnownOtp
    });
    recordResult(27, 'verify-otp without hospital context returns 400', false, 'Expected 400 MISSING_HOSPITAL_CONTEXT');
  } catch (err) {
    const passed = err.response && err.response.status === 400 && err.response.data?.code === 'MISSING_HOSPITAL_CONTEXT';
    recordResult(27, 'verify-otp without hospital context returns 400', passed, `HTTP Status: ${err.response?.status}, Code: ${err.response?.data?.code}`);
  }

  // Scenario 28: verify-otp with valid hospital context -> tempToken has bound tenantId
  let tempToken = null;
  try {
    const res = await axios.post(`${BASE_URL}/api/auth/patient-portal/verify-otp`, {
      mobile: '9999888801',
      otp: testKnownOtp,
      tenantId: TENANT_A
    });
    tempToken = res.data?.tempToken || res.data?.token;
    const decoded = jwt.decode(tempToken);
    const passed = res.status === 200 && decoded && decoded.tenantId === TENANT_A;
    recordResult(28, 'verify-otp generates token strictly bound to tenant', passed, `HTTP Status: ${res.status}, Token TenantId: ${decoded?.tenantId}`);
  } catch (err) {
    recordResult(28, 'verify-otp generates token strictly bound to tenant', false, `Failed: ${err.message}`);
  }

  // Scenario 29: POST /api/patients (Self-Registration) tenant binding enforcement
  // Token is bound to TENANT_A. Client tries to tamper with header x-tenant-id: TENANT_B and body tenantId: TENANT_B
  const selfRegContact = '9999888802';
  try {
    const regTempToken = jwt.sign({
      phone: selfRegContact,
      role: 'patient',
      tenantId: TENANT_A,
      isNewPatient: true
    }, secretKey);

    const regRes = await axios.post(`${BASE_URL}/api/patients`, {
      name: 'Tamper Resistant Patient',
      contact: selfRegContact,
      email: 'tamper@sec12.test',
      gender: 'Female',
      age: 28,
      tenantId: TENANT_B // Client attempts to force Tenant B
    }, {
      headers: {
        Authorization: `Bearer ${regTempToken}`,
        'x-tenant-id': TENANT_B // Client attempts to force Tenant B via header
      }
    });

    // Check created patient document in MongoDB
    const createdPatient = await Patient.findOne({ contact: selfRegContact });
    const passed = createdPatient && createdPatient.tenantId === TENANT_A;
    recordResult(29, 'Patient self-registration enforces cryptographic token tenantId', passed, `Assigned Tenant: ${createdPatient?.tenantId} (Tamper target ${TENANT_B} ignored)`);

    // Clean up
    if (createdPatient) await Patient.deleteOne({ _id: createdPatient._id });
  } catch (err) {
    recordResult(29, 'Patient self-registration enforces cryptographic token tenantId', false, `Failed: ${err.message}`);
  }

  // ====================================================================
  // GROUP 4: PREVENT INCOMPLETE PATIENT AUTO-PROVISIONING (TASK 4)
  // ====================================================================
  console.log('\n--- GROUP 4: Prevent Incomplete Patient Auto-Provisioning (Task 4) ---');

  // Scenario 30: GET /api/patients/:userId with orphan User token -> 404 Not Found
  try {
    await axios.get(`${BASE_URL}/api/patients/${orphanUser._id}`, {
      headers: { Authorization: `Bearer ${orphanToken}` }
    });
    recordResult(30, 'GET /api/patients/:id with orphan user returns 404 (does NOT auto-create)', false, 'Expected 404 Not Found but received 200');
  } catch (err) {
    const passed = err.response && err.response.status === 404 && err.response.data?.code === 'PATIENT_NOT_FOUND';
    recordResult(30, 'GET /api/patients/:id with orphan user returns 404 (does NOT auto-create)', passed, `HTTP Status: ${err.response?.status}, Code: ${err.response?.data?.code}`);
  }

  // Scenario 31: Verify MongoDB has NOT auto-created a dummy Patient record
  const checkDummyPatient = await Patient.findOne({
    $or: [
      { _id: orphanUser._id },
      { contact: orphanUser.staff_id },
      { email: orphanUser.email }
    ]
  });
  const passedDummyCheck = checkDummyPatient === null;
  recordResult(31, 'Verify MongoDB contains NO auto-created dummy Patient record', passedDummyCheck, `Found Dummy Record: ${Boolean(checkDummyPatient)}`);

  // Scenario 32: GET /api/emr/visits/patient/:userId with orphan User token -> 404 Not Found
  try {
    await axios.get(`${BASE_URL}/api/emr/visits/patient/${orphanUser._id}`, {
      headers: { Authorization: `Bearer ${orphanToken}` }
    });
    recordResult(32, 'GET /api/emr/visits/patient/:id with orphan user returns 404', false, 'Expected 404 Not Found');
  } catch (err) {
    const passed = err.response && (err.response.status === 404 || err.response.status === 403);
    recordResult(32, 'GET /api/emr/visits/patient/:id with orphan user returns 404', passed, `HTTP Status: ${err.response?.status} (${err.response?.data?.error})`);
  }

  // ====================================================================
  // GROUP 5: STAFF WORKFLOW PRESERVATION (TASK 5)
  // ====================================================================
  console.log('\n--- GROUP 5: Staff Workflow Preservation (Task 5) ---');

  // Scenario 33: Doctor calls GET /api/patients/:patientA_id -> 200 OK
  try {
    const res = await axios.get(`${BASE_URL}/api/patients/${patientA._id}`, {
      headers: { Authorization: `Bearer ${docToken}` }
    });
    recordResult(33, 'Doctor can view patient profile', res.status === 200 && res.data?.name === patientA.name, `HTTP Status: ${res.status}, Name: ${res.data?.name}`);
  } catch (err) {
    recordResult(33, 'Doctor can view patient profile', false, `Failed: ${err.message}`);
  }

  // Scenario 34: Receptionist registers a new patient via staff POST /api/patients -> 201 Created
  const staffRegContact = '9999888803';
  try {
    const res = await axios.post(`${BASE_URL}/api/patients`, {
      name: 'Reception Reg Patient',
      contact: staffRegContact,
      email: 'rec.reg@sec12.test',
      gender: 'Male',
      age: 40,
      bloodGroup: 'B+'
    }, {
      headers: {
        Authorization: `Bearer ${recToken}`
      }
    });

    const staffCreatedPatient = await Patient.findOne({ contact: staffRegContact });
    const passed = res.status === 201 && staffCreatedPatient && staffCreatedPatient.tenantId === TENANT_A;
    recordResult(34, 'Receptionist can register patients via staff POST /api/patients', passed, `HTTP Status: ${res.status}, TenantId: ${staffCreatedPatient?.tenantId}`);

    // Clean up
    if (staffCreatedPatient) await Patient.deleteOne({ _id: staffCreatedPatient._id });
  } catch (err) {
    recordResult(34, 'Receptionist can register patients via staff POST /api/patients', false, `Failed: ${err.message}`);
  }

  // ====================================================================
  // SUMMARY AND CLEANUP
  // ====================================================================
  console.log('\n======================================================================');
  console.log('  TEST SUMMARY                                                       ');
  console.log('======================================================================');
  const passCount = results.filter(r => r.passed).length;
  const failCount = results.filter(r => !r.passed).length;
  console.log(`Total Scenarios Tested: ${results.length}`);
  console.log(`Passed: ${passCount}`);
  console.log(`Failed: ${failCount}`);

  console.log('\n[Cleanup] Cleaning up created test entities...');
  const OtpChallenge = require('../models/OtpChallenge');
  await OtpChallenge.deleteMany({ tenantId: { $in: [TENANT_A, TENANT_B] } });
  await SuperAdminHospital.deleteMany({ code: { $in: [TENANT_A, TENANT_B] } });
  await User.deleteMany({ _id: { $in: [adminUser._id, pharmacistUser._id, doctorUser._id, inventoryUser._id, receptionistUser._id, patientUserA._id, orphanUser._id] } });
  await Patient.deleteMany({ _id: patientA._id });

  server.close();
  await mongoose.disconnect();
  console.log('[Cleanup] Completed. Server closed and DB disconnected.\n');

  if (failCount > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runPhase12Suite().catch(err => {
  console.error('Phase 1.2 Test Suite Fatal Error:', err);
  if (server) server.close();
  mongoose.disconnect();
  process.exit(1);
});
