/**
 * QUROXA Phase 1: Backend Patient Security Hardening Regression Test Suite
 * 
 * Verifies all 18 required scenarios from Phase 1 specification:
 * - Patient directory isolation (BOLA/IDOR prevention)
 * - Patient record ownership enforcement
 * - Staff access preservation
 * - Prescription scoping and mutation blocking
 * - Lab request scoping and mutation blocking
 * - Billing scoping, financial summary protection, discount policy protection
 * - EMR visits isolation across all endpoints
 * - Appointment doctor query scoping (no leakage via doctorId)
 * - Staff route protection (HR leaves, Purchase orders, appointment approvals, check-ins)
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
const Prescription = require('../models/Prescription');
const LabRequest = require('../models/LabRequest');
const Billing = require('../models/Billing');
const Appointment = require('../models/Appointment');
const Visit = require('../models/Visit');
const Consent = require('../models/Consent');

const TEST_PORT = 5899;
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

  // Mount modified routes
  app.use('/api/patients', require('../routes/patientRoutes'));
  app.use('/api/prescriptions', require('../routes/prescriptionRoutes'));
  app.use('/api/labs', require('../routes/labRoutes'));
  app.use('/api/billing', require('../routes/billingRoutes'));
  app.use('/api/emr', require('../routes/emrRoutes'));
  app.use('/api/appointments', require('../routes/appointmentRoutes'));
  app.use('/api/hr', require('../routes/hrRoutes'));
  app.use('/api/purchase-orders', require('../routes/purchaseOrderRoutes'));

  server = http.createServer(app);
  await new Promise(resolve => server.listen(TEST_PORT, '127.0.0.1', resolve));
  console.log(`Test Express server listening on ${BASE_URL}`);
}

async function runRegressionSuite() {
  console.log('======================================================================');
  console.log('  QUROXA PHASE 1: BACKEND PATIENT SECURITY HARDENING VERIFICATION     ');
  console.log('======================================================================\n');

  // 1. Connect DB
  console.log('[Setup] Connecting to MongoDB...');
  await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 10000 });
  console.log('[Setup] MongoDB Connected successfully.');

  // 2. Start Test Express server
  await setupTestApp();

  const secret = getJwtSecret();
  const TENANT = 'city_hospital';

  // 3. Provision Test Entities
  console.log('[Setup] Provisioning test records...');

  // Admin User
  const adminUser = await User.findOneAndUpdate(
    { staff_id: 'admin_test_sec', tenantId: TENANT },
    {
      staff_id: 'admin_test_sec',
      name: 'Security Test Admin',
      role: 'admin',
      tenantId: TENANT,
      password_hash: 'dummyhash'
    },
    { upsert: true, returnDocument: 'after' }
  );

  // Doctor User
  const docUser = await User.findOneAndUpdate(
    { staff_id: 'doc_test_sec', tenantId: TENANT },
    {
      staff_id: 'doc_test_sec',
      name: 'Dr. Security Examiner',
      role: 'doctor',
      tenantId: TENANT,
      password_hash: 'dummyhash',
      doctorSlots: ['10:00 AM - 10:30 AM (Limit: 5)']
    },
    { upsert: true, returnDocument: 'after' }
  );

  // Patient A
  const patientA = await Patient.findOneAndUpdate(
    { contact: '9900000001', tenantId: TENANT },
    {
      name: 'Alice Security A',
      contact: '9900000001',
      gender: 'Female',
      age: 28,
      tenantId: TENANT,
      uhId: 'UHID-SEC-A-001',
      patientId: 'HOSP-SEC-A-001'
    },
    { upsert: true, returnDocument: 'after' }
  );

  // Patient B
  const patientB = await Patient.findOneAndUpdate(
    { contact: '9900000002', tenantId: TENANT },
    {
      name: 'Bob Security B',
      contact: '9900000002',
      gender: 'Male',
      age: 35,
      tenantId: TENANT,
      uhId: 'UHID-SEC-B-002',
      patientId: 'HOSP-SEC-B-002'
    },
    { upsert: true, returnDocument: 'after' }
  );

  // Ensure Consents for EMR
  await Consent.findOneAndUpdate(
    { patientId: patientA._id, tenantId: TENANT },
    {
      patientId: patientA._id,
      tenantId: TENANT,
      status: 'Active',
      purposes: { treatment: true, insurance: true, research: false }
    },
    { upsert: true }
  );
  await Consent.findOneAndUpdate(
    { patientId: patientB._id, tenantId: TENANT },
    {
      patientId: patientB._id,
      tenantId: TENANT,
      status: 'Active',
      purposes: { treatment: true, insurance: true, research: false }
    },
    { upsert: true }
  );

  // Prescription A & B
  const rxA = await Prescription.create({
    tenantId: TENANT,
    patientId: patientA._id,
    doctorId: docUser._id,
    medications: [{ name: 'Amoxicillin', dosage: '500mg', frequency: 'TDS', duration: '5 days' }]
  });
  const rxB = await Prescription.create({
    tenantId: TENANT,
    patientId: patientB._id,
    doctorId: docUser._id,
    medications: [{ name: 'Paracetamol', dosage: '650mg', frequency: 'SOS', duration: '3 days' }]
  });

  // Lab A & B
  const labA = await LabRequest.create({
    tenantId: TENANT,
    patientId: patientA._id,
    doctorId: docUser._id,
    testName: 'Complete Blood Count (CBC)'
  });
  const labB = await LabRequest.create({
    tenantId: TENANT,
    patientId: patientB._id,
    doctorId: docUser._id,
    testName: 'Lipid Profile'
  });

  // Bill A & B
  const billA = await Billing.create({
    tenantId: TENANT,
    patientId: patientA._id,
    totalAmount: 500,
    amountPaid: 0,
    balanceDue: 500,
    status: 'Unpaid',
    items: [{ description: 'OPD Consultation', amount: 500 }]
  });
  const billB = await Billing.create({
    tenantId: TENANT,
    patientId: patientB._id,
    totalAmount: 1200,
    amountPaid: 1200,
    balanceDue: 0,
    status: 'Paid',
    items: [{ description: 'Specialist Consultation', amount: 1200 }]
  });

  // Visit A & B
  const visitA = await Visit.create({
    tenantId: TENANT,
    patientId: patientA._id,
    doctorId: docUser._id,
    visitId: `VIS-${Date.now()}-A`,
    status: 'Checked-in'
  });
  const visitB = await Visit.create({
    tenantId: TENANT,
    patientId: patientB._id,
    doctorId: docUser._id,
    visitId: `VIS-${Date.now()}-B`,
    status: 'Checked-in'
  });

  // Appointments for Doctor with Patient A and Patient B
  const apptA = await Appointment.create({
    tenantId: TENANT,
    patientId: patientA._id,
    doctorId: docUser._id,
    date: new Date(),
    time: '10:00 AM - 10:30 AM',
    status: 'Pending Approval',
    reason: 'Follow-up consultation'
  });
  const apptB = await Appointment.create({
    tenantId: TENANT,
    patientId: patientB._id,
    doctorId: docUser._id,
    date: new Date(),
    time: '10:30 AM - 11:00 AM',
    status: 'Pending Approval',
    reason: 'General checkup'
  });

  // 4. Generate JWT Tokens
  const tokenPatientA = jwt.sign(
    {
      id: patientA._id.toString(),
      staff_id: patientA.contact,
      phone: patientA.contact,
      name: patientA.name,
      role: 'patient',
      actualStaffRole: 'patient',
      tenantId: TENANT
    },
    secret,
    { expiresIn: '1h' }
  );

  const tokenPatientB = jwt.sign(
    {
      id: patientB._id.toString(),
      staff_id: patientB.contact,
      phone: patientB.contact,
      name: patientB.name,
      role: 'patient',
      actualStaffRole: 'patient',
      tenantId: TENANT
    },
    secret,
    { expiresIn: '1h' }
  );

  const tokenAdmin = jwt.sign(
    {
      id: adminUser._id.toString(),
      userId: adminUser._id.toString(),
      staff_id: adminUser.staff_id,
      name: adminUser.name,
      role: 'admin',
      actualStaffRole: 'admin',
      tenantId: TENANT
    },
    secret,
    { expiresIn: '1h' }
  );

  const tokenDoctor = jwt.sign(
    {
      id: docUser._id.toString(),
      userId: docUser._id.toString(),
      staff_id: docUser.staff_id,
      name: docUser.name,
      role: 'doctor',
      actualStaffRole: 'doctor',
      tenantId: TENANT
    },
    secret,
    { expiresIn: '1h' }
  );

  const headersPatientA = { Authorization: `Bearer ${tokenPatientA}`, 'x-tenant-id': TENANT };
  const headersPatientB = { Authorization: `Bearer ${tokenPatientB}`, 'x-tenant-id': TENANT };
  const headersAdmin = { Authorization: `Bearer ${tokenAdmin}`, 'x-tenant-id': TENANT };
  const headersDoctor = { Authorization: `Bearer ${tokenDoctor}`, 'x-tenant-id': TENANT };

  console.log('\n======================================================================');
  console.log('  EXECUTING 18 SCENARIOS                                             ');
  console.log('======================================================================\n');

  // Scenario 1: Patient token calls GET /api/patients -> 403 Forbidden
  try {
    const res = await axios.get(`${BASE_URL}/api/patients`, { headers: headersPatientA });
    recordResult(1, 'Patient token calls GET /api/patients', false, `Expected 403 but received ${res.status}`);
  } catch (err) {
    const status = err.response ? err.response.status : null;
    recordResult(1, 'Patient token calls GET /api/patients', status === 403, `HTTP Status: ${status} (${err.response?.data?.error || ''})`);
  }

  // Scenario 2: Patient A token calls GET /api/patients/:patientB_id -> 403 Forbidden
  try {
    const res = await axios.get(`${BASE_URL}/api/patients/${patientB._id}`, { headers: headersPatientA });
    recordResult(2, 'Patient A calls GET /api/patients/:patientB_id (IDOR attempt)', false, `Expected 403 but received ${res.status}`);
  } catch (err) {
    const status = err.response ? err.response.status : null;
    recordResult(2, 'Patient A calls GET /api/patients/:patientB_id (IDOR attempt)', status === 403, `HTTP Status: ${status} (${err.response?.data?.error || ''})`);
  }

  // Scenario 3: Patient A token calls GET /api/patients/:patientA_id -> 200 OK
  try {
    const res = await axios.get(`${BASE_URL}/api/patients/${patientA._id}`, { headers: headersPatientA });
    const isOwn = String(res.data?._id) === String(patientA._id);
    recordResult(3, 'Patient A calls GET /api/patients/:patientA_id (Own profile)', res.status === 200 && isOwn, `HTTP Status: ${res.status}, Name: ${res.data?.name}`);
  } catch (err) {
    recordResult(3, 'Patient A calls GET /api/patients/:patientA_id (Own profile)', false, `Error: ${err.message}`);
  }

  // Scenario 4: Staff (Admin/Doctor) token calls GET /api/patients -> 200 OK
  try {
    const res = await axios.get(`${BASE_URL}/api/patients`, { headers: headersAdmin });
    recordResult(4, 'Staff (Admin) calls GET /api/patients (Directory)', res.status === 200 && Array.isArray(res.data), `HTTP Status: ${res.status}, Patients Count: ${res.data?.length}`);
  } catch (err) {
    recordResult(4, 'Staff (Admin) calls GET /api/patients (Directory)', false, `Error: ${err.message}`);
  }

  // Scenario 5: Staff token calls GET /api/patients/:patientA_id -> 200 OK
  try {
    const res = await axios.get(`${BASE_URL}/api/patients/${patientA._id}`, { headers: headersDoctor });
    recordResult(5, 'Staff (Doctor) calls GET /api/patients/:patientA_id', res.status === 200 && String(res.data?._id) === String(patientA._id), `HTTP Status: ${res.status}, Patient: ${res.data?.name}`);
  } catch (err) {
    recordResult(5, 'Staff (Doctor) calls GET /api/patients/:patientA_id', false, `Error: ${err.message}`);
  }

  // Scenario 6: Patient A token calls GET /api/prescriptions -> returns only Patient A's prescriptions
  try {
    const res = await axios.get(`${BASE_URL}/api/prescriptions`, { headers: headersPatientA });
    const allA = Array.isArray(res.data) && res.data.length > 0 && res.data.every(rx => String(rx.patientId?._id || rx.patientId) === String(patientA._id));
    recordResult(6, "Patient A calls GET /api/prescriptions (Scoping to own)", res.status === 200 && allA, `HTTP Status: ${res.status}, Count: ${res.data?.length}, All Match Patient A: ${allA}`);
  } catch (err) {
    recordResult(6, "Patient A calls GET /api/prescriptions (Scoping to own)", false, `Error: ${err.message}`);
  }

  // Scenario 7: Patient A token calls GET /api/prescriptions/:prescriptionB_id -> 403 Forbidden
  try {
    const res = await axios.get(`${BASE_URL}/api/prescriptions/${rxB._id}`, { headers: headersPatientA });
    recordResult(7, 'Patient A calls GET /api/prescriptions/:rxB_id (IDOR attempt)', false, `Expected 403 but received ${res.status}`);
  } catch (err) {
    const status = err.response ? err.response.status : null;
    recordResult(7, 'Patient A calls GET /api/prescriptions/:rxB_id (IDOR attempt)', status === 403, `HTTP Status: ${status} (${err.response?.data?.error || ''})`);
  }

  // Scenario 8: Patient token calls POST /api/prescriptions -> 403 Forbidden
  try {
    const res = await axios.post(`${BASE_URL}/api/prescriptions`, { patientId: patientA._id, medications: [] }, { headers: headersPatientA });
    recordResult(8, 'Patient calls POST /api/prescriptions (Creation attempt)', false, `Expected 403 but received ${res.status}`);
  } catch (err) {
    const status = err.response ? err.response.status : null;
    recordResult(8, 'Patient calls POST /api/prescriptions (Creation attempt)', status === 403, `HTTP Status: ${status} (${err.response?.data?.error || ''})`);
  }

  // Scenario 9: Patient A token calls GET /api/labs -> returns only Patient A's lab requests
  try {
    const res = await axios.get(`${BASE_URL}/api/labs`, { headers: headersPatientA });
    const allA = Array.isArray(res.data) && res.data.length > 0 && res.data.every(l => String(l.patientId?._id || l.patientId) === String(patientA._id));
    recordResult(9, 'Patient A calls GET /api/labs (Scoping to own)', res.status === 200 && allA, `HTTP Status: ${res.status}, Count: ${res.data?.length}, All Match Patient A: ${allA}`);
  } catch (err) {
    recordResult(9, 'Patient A calls GET /api/labs (Scoping to own)', false, `Error: ${err.message}`);
  }

  // Scenario 10: Patient token calls POST /api/labs -> 403 Forbidden
  try {
    const res = await axios.post(`${BASE_URL}/api/labs`, { patientId: patientA._id, testName: 'Malicious Lab' }, { headers: headersPatientA });
    recordResult(10, 'Patient calls POST /api/labs (Creation attempt)', false, `Expected 403 but received ${res.status}`);
  } catch (err) {
    const status = err.response ? err.response.status : null;
    recordResult(10, 'Patient calls POST /api/labs (Creation attempt)', status === 403, `HTTP Status: ${status} (${err.response?.data?.error || ''})`);
  }

  // Scenario 11: Patient A token calls GET /api/billing -> returns only Patient A's bills
  try {
    const res = await axios.get(`${BASE_URL}/api/billing`, { headers: headersPatientA });
    const allA = Array.isArray(res.data) && res.data.length > 0 && res.data.every(b => String(b.patientId?._id || b.patientId) === String(patientA._id));
    recordResult(11, 'Patient A calls GET /api/billing (Scoping to own)', res.status === 200 && allA, `HTTP Status: ${res.status}, Count: ${res.data?.length}, All Match Patient A: ${allA}`);
  } catch (err) {
    recordResult(11, 'Patient A calls GET /api/billing (Scoping to own)', false, `Error: ${err.message}`);
  }

  // Scenario 12: Patient token calls GET /api/billing/pending-payments-summary -> 403 Forbidden
  try {
    const res = await axios.get(`${BASE_URL}/api/billing/pending-payments-summary`, { headers: headersPatientA });
    recordResult(12, 'Patient calls GET /api/billing/pending-payments-summary (Financial Leak)', false, `Expected 403 but received ${res.status}`);
  } catch (err) {
    const status = err.response ? err.response.status : null;
    recordResult(12, 'Patient calls GET /api/billing/pending-payments-summary (Financial Leak)', status === 403, `HTTP Status: ${status} (${err.response?.data?.error || ''})`);
  }

  // Scenario 13: Patient token calls GET /api/billing/discount-setting -> 403 Forbidden
  try {
    const res = await axios.get(`${BASE_URL}/api/billing/discount-setting`, { headers: headersPatientA });
    recordResult(13, 'Patient calls GET /api/billing/discount-setting (Policy Leak)', false, `Expected 403 but received ${res.status}`);
  } catch (err) {
    const status = err.response ? err.response.status : null;
    recordResult(13, 'Patient calls GET /api/billing/discount-setting (Policy Leak)', status === 403, `HTTP Status: ${status} (${err.response?.data?.error || ''})`);
  }

  // Scenario 14: Patient token calls POST /api/billing/:id/collect-payment -> 403 Forbidden
  try {
    const res = await axios.post(`${BASE_URL}/api/billing/${billA._id}/collect-payment`, { payments: [{ amount: 500, method: 'Cash' }] }, { headers: headersPatientA });
    recordResult(14, 'Patient calls POST /api/billing/:id/collect-payment (Cash collection)', false, `Expected 403 but received ${res.status}`);
  } catch (err) {
    const status = err.response ? err.response.status : null;
    recordResult(14, 'Patient calls POST /api/billing/:id/collect-payment (Cash collection)', status === 403, `HTTP Status: ${status} (${err.response?.data?.error || ''})`);
  }

  // Scenario 15: Patient A token calls GET /api/emr/visits/patient/:patientB_id -> 403 Forbidden
  try {
    const res = await axios.get(`${BASE_URL}/api/emr/visits/patient/${patientB._id}`, { headers: headersPatientA });
    recordResult(15, 'Patient A calls GET /api/emr/visits/patient/:patientB_id (EMR IDOR)', false, `Expected 403 but received ${res.status}`);
  } catch (err) {
    const status = err.response ? err.response.status : null;
    recordResult(15, 'Patient A calls GET /api/emr/visits/patient/:patientB_id (EMR IDOR)', status === 403, `HTTP Status: ${status} (${err.response?.data?.error || ''})`);
  }

  // Scenario 16: Patient A token calls GET /api/emr/visits/patient/:patientA_id -> 200 OK
  try {
    const res = await axios.get(`${BASE_URL}/api/emr/visits/patient/${patientA._id}`, { headers: headersPatientA });
    recordResult(16, 'Patient A calls GET /api/emr/visits/patient/:patientA_id (Own EMR Visits)', res.status === 200 && Array.isArray(res.data), `HTTP Status: ${res.status}, Visits Count: ${res.data?.length}`);
  } catch (err) {
    recordResult(16, 'Patient A calls GET /api/emr/visits/patient/:patientA_id (Own EMR Visits)', false, `Error: ${err.message}`);
  }

  // Scenario 17: Patient A token calls GET /api/appointments?doctorId=... -> returns only Patient A's appointments with that doctor
  try {
    const res = await axios.get(`${BASE_URL}/api/appointments?doctorId=${docUser._id}`, { headers: headersPatientA });
    const allA = Array.isArray(res.data) && res.data.every(app => String(app.patientId?._id || app.patientId) === String(patientA._id));
    const containsB = Array.isArray(res.data) && res.data.some(app => String(app.patientId?._id || app.patientId) === String(patientB._id));
    const passed = res.status === 200 && allA && !containsB;
    recordResult(17, 'Patient A calls GET /api/appointments?doctorId=... (No leakage of other patients)', passed, `HTTP Status: ${res.status}, Returned Count: ${res.data?.length}, Contains Patient B: ${containsB}`);
  } catch (err) {
    recordResult(17, 'Patient A calls GET /api/appointments?doctorId=... (No leakage of other patients)', false, `Error: ${err.message}`);
  }

  // Scenario 18: Patient token calls POST /api/purchase-orders -> 403 Forbidden
  try {
    const res = await axios.post(`${BASE_URL}/api/purchase-orders`, { poId: 'PO-TEST' }, { headers: headersPatientA });
    recordResult(18, 'Patient calls POST /api/purchase-orders (Staff procurement)', false, `Expected 403 but received ${res.status}`);
  } catch (err) {
    const status = err.response ? err.response.status : null;
    recordResult(18, 'Patient calls POST /api/purchase-orders (Staff procurement)', status === 403, `HTTP Status: ${status} (${err.response?.data?.error || ''})`);
  }

  // Scenario 19: Patient A token calls GET /api/hr/leaves -> 403 Forbidden
  try {
    const res = await axios.get(`${BASE_URL}/api/hr/leaves`, { headers: headersPatientA });
    recordResult(19, 'Patient calls GET /api/hr/leaves (Staff HR leaves)', false, `Expected 403 but received ${res.status}`);
  } catch (err) {
    const status = err.response ? err.response.status : null;
    recordResult(19, 'Patient calls GET /api/hr/leaves (Staff HR leaves)', status === 403, `HTTP Status: ${status} (${err.response?.data?.error || ''})`);
  }

  // Scenario 20: Patient A token calls GET /api/hr/doctor-availability/:doctorId -> 200 OK
  try {
    const res = await axios.get(`${BASE_URL}/api/hr/doctor-availability/${docUser._id}`, { headers: headersPatientA });
    recordResult(20, 'Patient calls GET /api/hr/doctor-availability/:doctorId (Allowed scheduling)', res.status === 200 && Array.isArray(res.data?.slots), `HTTP Status: ${res.status}, Slots: ${res.data?.slots?.length}`);
  } catch (err) {
    recordResult(20, 'Patient calls GET /api/hr/doctor-availability/:doctorId (Allowed scheduling)', false, `Error: ${err.message}`);
  }

  // Scenario 21: Patient token calls PUT /api/appointments/:id/approve -> 403 Forbidden
  try {
    const res = await axios.put(`${BASE_URL}/api/appointments/${apptA._id}/approve`, {}, { headers: headersPatientA });
    recordResult(21, 'Patient calls PUT /api/appointments/:id/approve (Staff workflow)', false, `Expected 403 but received ${res.status}`);
  } catch (err) {
    const status = err.response ? err.response.status : null;
    recordResult(21, 'Patient calls PUT /api/appointments/:id/approve (Staff workflow)', status === 403, `HTTP Status: ${status} (${err.response?.data?.error || ''})`);
  }

  // Scenario 22: Patient token calls POST /api/appointments/:id/check-in -> 403 Forbidden
  try {
    const res = await axios.post(`${BASE_URL}/api/appointments/${apptA._id}/check-in`, {}, { headers: headersPatientA });
    recordResult(22, 'Patient calls POST /api/appointments/:id/check-in (Reception workflow)', false, `Expected 403 but received ${res.status}`);
  } catch (err) {
    const status = err.response ? err.response.status : null;
    recordResult(22, 'Patient calls POST /api/appointments/:id/check-in (Reception workflow)', status === 403, `HTTP Status: ${status} (${err.response?.data?.error || ''})`);
  }

  // Scenario 23: Patient A calls POST /api/appointments/:apptB_id/pay -> 403 Forbidden
  try {
    const res = await axios.post(`${BASE_URL}/api/appointments/${apptB._id}/pay`, { paymentMethod: 'UPI' }, { headers: headersPatientA });
    recordResult(23, "Patient A calls POST /api/appointments/:apptB_id/pay (Other patient's appointment)", false, `Expected 403 but received ${res.status}`);
  } catch (err) {
    const status = err.response ? err.response.status : null;
    recordResult(23, "Patient A calls POST /api/appointments/:apptB_id/pay (Other patient's appointment)", status === 403, `HTTP Status: ${status} (${err.response?.data?.error || ''})`);
  }

  // Scenario 24: Unauthenticated request -> 401 Unauthorized
  try {
    const res = await axios.get(`${BASE_URL}/api/patients`);
    recordResult(24, 'Unauthenticated request to /api/patients', false, `Expected 401 but received ${res.status}`);
  } catch (err) {
    const status = err.response ? err.response.status : null;
    recordResult(24, 'Unauthenticated request to /api/patients', status === 401, `HTTP Status: ${status} (${err.response?.data?.error || ''})`);
  }

  console.log('\n======================================================================');
  console.log('  TEST SUMMARY                                                       ');
  console.log('======================================================================');
  const passCount = results.filter(r => r.passed).length;
  const failCount = results.filter(r => !r.passed).length;
  console.log(`Total Scenarios Tested: ${results.length}`);
  console.log(`Passed: ${passCount}`);
  console.log(`Failed: ${failCount}`);

  // Cleanup test records
  console.log('\n[Cleanup] Cleaning up created test entities...');
  await Prescription.deleteMany({ _id: { $in: [rxA._id, rxB._id] } });
  await LabRequest.deleteMany({ _id: { $in: [labA._id, labB._id] } });
  await Billing.deleteMany({ _id: { $in: [billA._id, billB._id] } });
  await Visit.deleteMany({ _id: { $in: [visitA._id, visitB._id] } });
  await Appointment.deleteMany({ _id: { $in: [apptA._id, apptB._id] } });
  await Patient.deleteMany({ _id: { $in: [patientA._id, patientB._id] } });
  await User.deleteMany({ _id: { $in: [adminUser._id, docUser._id] } });

  server.close();
  await mongoose.disconnect();
  console.log('[Cleanup] Completed. Server closed and DB disconnected.\n');

  if (failCount > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runRegressionSuite().catch(err => {
  console.error('Test Suite Fatal Error:', err);
  if (server) server.close();
  mongoose.disconnect();
  process.exit(1);
});
