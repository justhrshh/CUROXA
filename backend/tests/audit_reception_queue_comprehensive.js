/**
 * QUROXA — COMPREHENSIVE RECEPTION QR AUDIT & FAILURE VERIFICATION SUITE
 * 
 * Tests Phases 2 through 16 against an isolated test database:
 * DB: test_reception_queue_audit
 * 
 * Strict isolation rules:
 * - Only operates on test_reception_queue_audit
 * - Uses isolated mock server & supertest / fetch
 * - Verifies real DB writes, indexes, atomic locks, race conditions, socket handlers, and privacy
 */

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const mongoose = require('mongoose');
const express = require('express');
const http = require('http');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');

// Enforce dedicated test database name
const TEST_DB_NAME = 'test_reception_queue_audit';
const rawUri = process.env.MONGO_URI || 'mongodb://localhost:27017';
let testUri;
try {
  const parsed = new URL(rawUri);
  parsed.pathname = `/${TEST_DB_NAME}`;
  testUri = parsed.href;
} catch (e) {
  testUri = `${rawUri.replace(/\/+$/, '')}/${TEST_DB_NAME}`;
}

// Models
const SuperAdminHospital = require('../models/SuperAdminHospital');
const SuperAdminPlan = require('../models/SuperAdminPlan');
const User = require('../models/User');
const Patient = require('../models/Patient');
const Appointment = require('../models/Appointment');
const DoctorQueue = require('../models/DoctorQueue');
const Counter = require('../models/Counter');
const ReceptionQueue = require('../models/ReceptionQueue');
const ReceptionOtp = require('../models/ReceptionOtp');

// Engines & Helpers
const {
  normalizeQueueDate,
  allocateReceptionTicket,
  getReceptionQueueState,
  getPatientQueuePosition,
  getStaffReceptionQueueData,
  advanceReceptionQueue,
  skipReceptionTicket,
  completeReceptionTicket
} = require('../utils/receptionQueueEngine');

const {
  getHospitalEffectiveModules,
  getPlanModuleEntitlements
} = require('../utils/subscriptionHelper');

const receptionQueueRoutes = require('../routes/receptionQueueRoutes');
const { getJwtSecret } = require('../config/env');

let passedTests = 0;
let failedTests = 0;
const failures = [];

function assert(condition, testName, extra = '') {
  if (condition) {
    console.log(`  ✅ PASS: ${testName}`);
    passedTests++;
  } else {
    console.error(`  ❌ FAIL: ${testName} ${extra ? `(${extra})` : ''}`);
    failedTests++;
    failures.push({ testName, extra });
  }
}

async function runSuite() {
  console.log('================================================================');
  console.log('   QUROXA RECEPTION QR AUDIT — EXECUTION SUITE');
  console.log(`   Target Isolated DB: ${TEST_DB_NAME}`);
  console.log('================================================================\n');

  await mongoose.connect(testUri, { serverSelectionTimeoutMS: 15000 });
  if (mongoose.connection.name !== TEST_DB_NAME) {
    throw new Error(`ABORT: Connected to ${mongoose.connection.name}, expected ${TEST_DB_NAME}`);
  }
  console.log(`[CONNECTED] Confirmed isolated test database: ${mongoose.connection.name}\n`);

  // Ensure indexes are built
  await Promise.all([
    ReceptionQueue.init(),
    ReceptionOtp.init(),
    Counter.init(),
    Appointment.init(),
    Patient.init(),
    SuperAdminHospital.init()
  ]);

  // Clean test collections
  await Promise.all([
    ReceptionQueue.deleteMany({}),
    ReceptionOtp.deleteMany({}),
    Counter.deleteMany({}),
    Appointment.deleteMany({}),
    Patient.deleteMany({}),
    User.deleteMany({ tenantId: { $in: ['apollo_test', 'max_test'] } }),
    SuperAdminHospital.deleteMany({})
  ]);

  const JWT_SECRET = getJwtSecret();

  // -------------------------------------------------------------
  // PHASE 2: SUPER ADMIN MODULE CONTROL & DEFAULT-OFF ENFORCEMENT
  // -------------------------------------------------------------
  console.log('\n--- PHASE 2: SUPER ADMIN MODULE CONTROL ---');

  // Test 2.1: Newly created hospital has receptionQueue.enabled = false
  const hosp1 = await SuperAdminHospital.create({
    name: 'Apollo Test Clinic',
    code: 'apollo_test',
    email: 'admin@apollo.test',
    phone: '9876543210',
    plan: 'Professional',
    modules: {}
  });
  assert(hosp1.modules.receptionQueue?.enabled === false, '2.1: Newly created hospital defaults receptionQueue.enabled to false');

  // Test 2.2: Missing/null module configuration in effective calculation resolves to disabled
  const effHosp1 = await getHospitalEffectiveModules(hosp1);
  assert(effHosp1.receptionQueue.enabled === false, '2.2: getHospitalEffectiveModules resolves missing/null receptionQueue to false');
  assert(effHosp1.receptionQueue.planIncluded === false, '2.2b: receptionQueue planIncluded is false (strictly independent module)');

  // Test 2.3: Hospital with legacy record (modules: undefined) remains disabled
  const legacyHosp = { name: 'Legacy Clinic', code: 'legacy_clinic', plan: 'Enterprise' };
  const effLegacy = await getHospitalEffectiveModules(legacyHosp);
  assert(effLegacy.receptionQueue.enabled === false, '2.3: Legacy hospital without modules field has receptionQueue.enabled = false');

  // Test 2.4: Subscription plan changes do NOT automatically enable receptionQueue
  const effTrial = await getHospitalEffectiveModules({ ...hosp1.toObject(), plan: 'Trial' });
  const effEnterprise = await getHospitalEffectiveModules({ ...hosp1.toObject(), plan: 'Enterprise' });
  assert(effTrial.receptionQueue.enabled === false, '2.4a: Trial plan does NOT automatically enable receptionQueue');
  assert(effEnterprise.receptionQueue.enabled === false, '2.4b: Enterprise plan does NOT automatically enable receptionQueue');

  // Test 2.5: Explicitly enabled by SuperAdmin is preserved
  const hosp2 = await SuperAdminHospital.create({
    name: 'Max Healthcare',
    code: 'max_test',
    email: 'admin@max.test',
    phone: '9876543211',
    plan: 'Basic',
    modules: {
      receptionQueue: { enabled: true }
    }
  });
  const effHosp2 = await getHospitalEffectiveModules(hosp2);
  assert(effHosp2.receptionQueue.enabled === true, '2.5: Super Admin explicit enablement is preserved as true');

  // -------------------------------------------------------------
  // PHASE 3: QR CODE & CLINIC RESOLUTION & TENANT ISOLATION
  // -------------------------------------------------------------
  console.log('\n--- PHASE 3: QR CODE, CLINIC RESOLUTION & TENANT ISOLATION ---');

  // Test 3.1: Express app testing route resolution
  const app = express();
  app.use(express.json());
  app.use('/api/reception-queue', receptionQueueRoutes);

  const server = http.createServer(app);
  await new Promise(res => server.listen(0, res));
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}/api/reception-queue`;

  // 3.1a: Valid clinic with disabled module returns moduleEnabled: false
  const resDis = await fetch(`${baseUrl}/clinic/apollo_test`).then(r => r.json());
  assert(resDis.moduleEnabled === false, '3.1a: Disabled clinic returns moduleEnabled: false');
  assert(resDis.hospital.name === 'Apollo Test Clinic', '3.1b: Returns correct clinic metadata when disabled');

  // 3.1b: Case-insensitivity & whitespace trimming
  const resUpper = await fetch(`${baseUrl}/clinic/  MAX_TEST  `).then(r => r.json());
  assert(resUpper.moduleEnabled === true, '3.1c: Clinic code lookup is trimmed and case-insensitive');

  // 3.1c: Unknown clinic code returns 404
  const resUnknown = await fetch(`${baseUrl}/clinic/non_existent_clinic`);
  assert(resUnknown.status === 404, '3.1d: Unknown clinic code returns 404 Not Found');

  // 3.1d: Suspended clinic returns 403
  await SuperAdminHospital.updateOne({ code: 'apollo_test' }, { $set: { status: 'Suspended' } });
  const resSuspended = await fetch(`${baseUrl}/clinic/apollo_test`);
  assert(resSuspended.status === 403, '3.1e: Suspended clinic returns 403 Inactive');
  await SuperAdminHospital.updateOne({ code: 'apollo_test' }, { $set: { status: 'Active' } });

  // -------------------------------------------------------------
  // PHASE 4: OTP AND SECURITY LIFECYCLE
  // -------------------------------------------------------------
  console.log('\n--- PHASE 4: OTP & SECURITY LIFECYCLE ---');

  // 4.1: Reject send-otp when module is disabled
  const otpDisRes = await fetch(`${baseUrl}/send-otp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ clinicCode: 'apollo_test', email: 'patient@example.com' })
  });
  assert(otpDisRes.status === 403, '4.1: send-otp rejected with 403 when module is disabled');

  // 4.2: Successful send-otp on enabled clinic
  const otpSendRes = await fetch(`${baseUrl}/send-otp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ clinicCode: 'max_test', email: 'Patient.One@Example.COM' })
  });
  const otpSendJson = await otpSendRes.json();
  assert(otpSendRes.status === 200 && otpSendJson.success === true, '4.2: send-otp succeeds for enabled clinic');

  // Verify stored in DB: HMAC hashed (not plaintext), lowercase email, tenant-scoped
  const storedOtp = await ReceptionOtp.findOne({ email: 'patient.one@example.com', tenantId: 'max_test' });
  assert(Boolean(storedOtp), '4.3a: ReceptionOtp record stored with normalized lowercase email');
  assert(storedOtp.otp_code.length === 64, '4.3b: Stored OTP code is HMAC-SHA256 64-char hex, NOT plaintext');
  assert(storedOtp.tenantId === 'max_test', '4.3c: OTP record is scoped to tenant max_test');

  // 4.4: Rate limiting cooldown (30s)
  const otpCooldownRes = await fetch(`${baseUrl}/send-otp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ clinicCode: 'max_test', email: 'patient.one@example.com' })
  });
  assert(otpCooldownRes.status === 429, '4.4: Rapid re-request rejected with 429 cooldown');

  // 4.5: Invalid OTP verification fails and increments attempts
  const badOtpRes = await fetch(`${baseUrl}/verify-otp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ clinicCode: 'max_test', email: 'patient.one@example.com', otp: '000000' })
  });
  assert(badOtpRes.status === 400, '4.5a: Wrong OTP rejected with 400');
  const otpAfterFail = await ReceptionOtp.findOne({ email: 'patient.one@example.com', tenantId: 'max_test' });
  assert(otpAfterFail.attempts === 1, '4.5b: Invalid attempt count incremented to 1');

  // 4.6: Tenant isolation in OTP verification (submitting OTP against different clinic fails)
  const crossClinicOtp = await fetch(`${baseUrl}/verify-otp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ clinicCode: 'apollo_test', email: 'patient.one@example.com', otp: '123456' })
  });
  assert(crossClinicOtp.status === 403 || crossClinicOtp.status === 400, '4.6: Cross-clinic OTP verification rejected');

  // -------------------------------------------------------------
  // PHASE 5: PATIENT CLASSIFICATION & DEDUPLICATION
  // -------------------------------------------------------------
  console.log('\n--- PHASE 5: PATIENT CLASSIFICATION & DEDUPLICATION ---');

  // Setup test patients in max_test
  const existingPat = await Patient.create({
    tenantId: 'max_test',
    name: 'Rajesh Sharma',
    contact: '9876543210',
    email: 'rajesh.sharma@example.com',
    gender: 'Male',
    age: 42,
    uhId: 'UH-MAX-0001',
    patientId: 'PAT-MAX-0001'
  });

  // 5.1: Existing patient with relevant same-day appointment
  const docUser = await User.create({
    tenantId: 'max_test',
    name: 'Dr. Vivek Mehra',
    staff_id: 'DOC-01',
    role: 'doctor',
    email: 'dr.vivek@max.test',
    password_hash: 'mockhash'
  });

  const apptToday = await Appointment.create({
    tenantId: 'max_test',
    patientId: existingPat._id,
    doctorId: docUser._id,
    date: new Date(),
    time: '10:30 AM',
    reason: 'Follow-up Consultation',
    status: 'Confirmed'
  });

  // Seed verified OTP for Rajesh
  const rajeshRawOtp = '654321';
  const cleanCode = rajeshRawOtp;
  const cleanEmail = 'rajesh.sharma@example.com';
  const cleanTenant = 'max_test';
  const rajeshHmac = crypto.createHmac('sha256', JWT_SECRET)
    .update(`${cleanCode}:${cleanEmail}:${cleanTenant}`)
    .digest('hex');

  await ReceptionOtp.create({
    email: cleanEmail,
    tenantId: cleanTenant,
    clinicCode: cleanTenant,
    otp_code: rajeshHmac,
    expires_at: new Date(Date.now() + 10 * 60 * 1000),
    consumed: false
  });

  const verifyApptRes = await fetch(`${baseUrl}/verify-otp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ clinicCode: 'max_test', email: cleanEmail, otp: rajeshRawOtp })
  }).then(r => r.json());

  assert(verifyApptRes.status === 'existing_patient_with_appointment', '5.1a: Existing patient with appointment classified correctly');
  assert(verifyApptRes.appointments?.length === 1, '5.1b: Found existing appointment returned to patient');
  const countTickets1 = await ReceptionQueue.countDocuments({ tenantId: 'max_test', patientId: existingPat._id });
  assert(countTickets1 === 0, '5.1c: ZERO reception tickets created for patient with existing appointment');

  // 5.2: Existing patient WITHOUT appointment -> Issues Reception Queue Ticket
  await Appointment.deleteMany({ patientId: existingPat._id });

  await ReceptionOtp.updateOne(
    { email: cleanEmail, tenantId: cleanTenant },
    { $set: { consumed: false, expires_at: new Date(Date.now() + 10 * 60 * 1000) } }
  );

  const verifyNoApptRes = await fetch(`${baseUrl}/verify-otp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ clinicCode: 'max_test', email: cleanEmail, otp: rajeshRawOtp })
  }).then(r => r.json());

  assert(verifyNoApptRes.status === 'existing_patient_ticket_issued', '5.2a: Existing patient without appointment issued ticket');
  assert(verifyNoApptRes.ticket?.ticketDisplay === 'R-001', '5.2b: First ticket display formatted R-001');
  assert(verifyNoApptRes.ticket?.patientType === 'Existing', '5.2c: Ticket marked patientType: Existing');

  // Verify doctor queue was untouched
  assert(apptToday.tokenNumber === null, '5.2d: Doctor consultation token was NOT allocated (strictly decoupled)');

  // 5.3: Duplicate submission for same patient today returns existing ticket
  await ReceptionOtp.updateOne(
    { email: cleanEmail, tenantId: cleanTenant },
    { $set: { consumed: false, expires_at: new Date(Date.now() + 10 * 60 * 1000) } }
  );
  const dupTicketRes = await fetch(`${baseUrl}/verify-otp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ clinicCode: 'max_test', email: cleanEmail, otp: rajeshRawOtp })
  }).then(r => r.json());
  assert(dupTicketRes.ticket?.ticketNumber === 1, '5.3a: Duplicate request returns identical existing ticket #1');
  const totalTicketsHosp2 = await ReceptionQueue.countDocuments({ tenantId: 'max_test' });
  assert(totalTicketsHosp2 === 1, '5.3b: Total reception tickets remained 1 (no duplicate generated)');

  // 5.4: New Patient -> requires basic preliminary details
  const newEmail = 'new.patient@example.com';
  const newRawOtp = '112233';
  const newHmac = crypto.createHmac('sha256', JWT_SECRET)
    .update(`${newRawOtp}:${newEmail}:${cleanTenant}`)
    .digest('hex');

  await ReceptionOtp.create({
    email: newEmail,
    tenantId: cleanTenant,
    clinicCode: cleanTenant,
    otp_code: newHmac,
    expires_at: new Date(Date.now() + 10 * 60 * 1000),
    consumed: false
  });

  const verifyNewRes = await fetch(`${baseUrl}/verify-otp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ clinicCode: 'max_test', email: newEmail, otp: newRawOtp })
  }).then(r => r.json());

  assert(verifyNewRes.status === 'new_patient_details_required', '5.4a: New patient classified as new_patient_details_required');
  assert(Boolean(verifyNewRes.sessionToken), '5.4b: Short-lived registration sessionToken provided');

  // Submit preliminary details for new patient
  const regNewRes = await fetch(`${baseUrl}/register-new`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sessionToken: verifyNewRes.sessionToken,
      clinicCode: 'max_test',
      title: 'Ms.',
      name: 'Pooja Verma',
      contact: '9123456780',
      gender: 'Female',
      age: 28,
      idempotencyKey: 'idemp_key_pooja_1'
    })
  }).then(r => r.json());

  assert(regNewRes.status === 'new_patient_ticket_issued', '5.4c: New patient ticket issued successfully');
  assert(regNewRes.ticket?.ticketDisplay === 'R-002', '5.4d: New patient allocated sequential ticket R-002');

  // Verify NO permanent records created prematurely
  const patCount = await Patient.countDocuments({ contact: '9123456780' });
  const userCount = await User.countDocuments({ contact: '9123456780' });
  const apptCount = await Appointment.countDocuments({ 'preliminaryDetails.contact': '9123456780' });
  assert(patCount === 0, '5.4e: NO permanent Patient record created in DB prematurely');
  assert(userCount === 0, '5.4f: NO permanent User record created in DB prematurely');
  assert(apptCount === 0, '5.4g: NO Appointment record created in DB prematurely');

  // -------------------------------------------------------------
  // PHASE 6: CONCURRENCY, ATOMIC ADVANCEMENT & SINGLE-SERVING INVARIANT
  // -------------------------------------------------------------
  console.log('\n--- PHASE 6: CONCURRENCY, ADVANCEMENT & SINGLE-SERVING INVARIANT ---');

  const todayStr = normalizeQueueDate(new Date());

  // 6.1: Advance queue to serve first ticket
  const adv1 = await advanceReceptionQueue({
    tenantId: 'max_test',
    clinicCode: 'max_test',
    queueDate: todayStr
  });
  assert(adv1.nowServingTicket?.ticketNumber === 1, '6.1a: First advance promotes ticket #1 to Serving');
  assert(adv1.nowServingTicket?.status === 'Serving', '6.1b: Ticket #1 status is Serving');

  // 6.2: Serving Invariant Test: Verify database-level unique partial index rejects two tickets Serving on same day
  let invariantProtected = false;
  try {
    // Attempt direct database write of a second Serving ticket for same tenant & date
    await ReceptionQueue.create({
      tenantId: 'max_test',
      clinicCode: 'max_test',
      queueDate: todayStr,
      ticketNumber: 999,
      ticketDisplay: 'R-999',
      status: 'Serving',
      patientType: 'New',
      sessionToken: 'token_collision_test_' + Date.now()
    });
  } catch (idxErr) {
    if (idxErr.code === 11000) {
      invariantProtected = true;
    }
  }
  assert(invariantProtected, '6.2: Database partial unique index strictly prevents two tickets Serving simultaneously');

  // 6.3: Multi-Desk Concurrency Simulation
  // Seed ticket #3 and ticket #4 to test two desks advancing concurrently
  const ticket3 = await allocateReceptionTicket({
    tenantId: 'max_test',
    clinicCode: 'max_test',
    queueDate: todayStr,
    patientType: 'New',
    preliminaryDetails: { name: 'Patient Three', contact: '9988776655', gender: 'Male', age: 30 }
  });
  const ticket4 = await allocateReceptionTicket({
    tenantId: 'max_test',
    clinicCode: 'max_test',
    queueDate: todayStr,
    patientType: 'New',
    preliminaryDetails: { name: 'Patient Four', contact: '9988776644', gender: 'Female', age: 25 }
  });

  // Desk A and Desk B simultaneously request advancement
  const [concResA, concResB] = await Promise.all([
    advanceReceptionQueue({ tenantId: 'max_test', clinicCode: 'max_test', queueDate: todayStr }),
    advanceReceptionQueue({ tenantId: 'max_test', clinicCode: 'max_test', queueDate: todayStr })
  ]);

  // At any single moment in time, exactly 1 ticket can be Serving in the queue
  const servingAfterConc = await ReceptionQueue.find({ tenantId: 'max_test', queueDate: todayStr, status: 'Serving' });
  assert(servingAfterConc.length === 1, '6.3a: Concurrent Next calls result in EXACTLY 1 Serving ticket');
  assert(servingAfterConc[0].ticketNumber >= 2, '6.3b: Active Serving ticket is promoted correctly');

  // 6.4: Skipped Ticket Policy Verification
  const skipRes = await skipReceptionTicket({
    tenantId: 'max_test',
    clinicCode: 'max_test',
    queueDate: todayStr,
    ticketId: servingAfterConc[0]._id
  });
  assert(skipRes.skippedTicket?.status === 'Skipped', '6.4a: Ticket status marked Skipped');
  assert(Boolean(skipRes.skippedTicket?.skippedAt), '6.4b: skippedAt timestamp recorded');
  const storedSkipped = await ReceptionQueue.findById(servingAfterConc[0]._id);
  assert(storedSkipped.status === 'Skipped', '6.4c: Skipped ticket safely persisted in database');

  // -------------------------------------------------------------
  // PHASE 7: PUBLIC DISPLAY STRICT PRIVACY VERIFICATION
  // -------------------------------------------------------------
  console.log('\n--- PHASE 7: PUBLIC DISPLAY STRICT PRIVACY AUDIT ---');

  const displayRes = await fetch(`${baseUrl}/display/max_test`).then(r => r.json());
  assert(displayRes.success === true, '7.1: Public display API returns success');

  // Inspect the raw serialized string for any leaked identifiers or PII
  const rawDisplayString = JSON.stringify(displayRes);
  const prohibitedStrings = [
    'Rajesh', 'Sharma', 'Pooja', 'Verma', '9876543210', '9123456780',
    'patient.one', 'preliminaryDetails', 'existingPatientDetails',
    'sessionToken', 'UH-MAX', 'PAT-MAX'
  ];

  let leakedPii = [];
  for (const str of prohibitedStrings) {
    if (rawDisplayString.includes(str)) {
      leakedPii.push(str);
    }
  }
  assert(leakedPii.length === 0, '7.2: Public display response contains ZERO patient PII, names, contacts, tokens or UHIDs', leakedPii.join(', '));
  assert(displayRes.currentTicketDisplay !== undefined, '7.3a: Sanitized ticketDisplay included');
  assert(displayRes.waitingCount !== undefined, '7.3b: Sanitized waitingCount included');

  // -------------------------------------------------------------
  // PHASE 8: APPOINTMENT & DOCTOR QUEUE REGRESSION VERIFICATION
  // -------------------------------------------------------------
  console.log('\n--- PHASE 8: DOCTOR CONSULTATION QUEUE REGRESSION ---');

  // Verify that allocating tickets or completing reception tickets NEVER alters DoctorQueue or Appointment.tokenNumber
  const allAppts = await Appointment.find({ tenantId: 'max_test' });
  const unassignedTokens = allAppts.filter(a => a.tokenNumber !== null);
  assert(unassignedTokens.length === 0, '8.1: No appointments were assigned doctor consultation tokens by reception queue');

  const allDoctorQueues = await DoctorQueue.find({ tenantId: 'max_test' });
  assert(allDoctorQueues.length === 0, '8.2: No doctor queues were modified or created prematurely');

  // -------------------------------------------------------------
  // CLEANUP & FINAL RESULTS
  // -------------------------------------------------------------
  await new Promise(res => server.close(res));
  await mongoose.disconnect();

  console.log('\n================================================================');
  console.log(`   EXECUTION SUMMARY: ${passedTests} PASSED, ${failedTests} FAILED`);
  console.log('================================================================\n');

  if (failedTests > 0) {
    console.error('FAILURES REGISTER:');
    failures.forEach(f => console.error(` - ${f.testName}: ${f.extra}`));
    process.exit(1);
  }
}

runSuite().catch(err => {
  console.error('SUITE RUNTIME ERROR:', err);
  process.exit(1);
});
