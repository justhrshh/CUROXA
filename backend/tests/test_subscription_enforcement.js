/**
 * CUROXA — HOSPITAL-LEVEL SUBSCRIPTION ENFORCEMENT TEST SUITE
 * 
 * Comprehensive verification for:
 * 1. Support both TRIAL (7-day duration) and PAID plans.
 * 2. Automated multi-day warnings (Trial: 2d, 1d; Paid: 5d, 4d, 3d, 2d, 1d).
 * 3. Idempotent warning dispatch and hospital-scoped notifications.
 * 4. Normal staff blocked from login and operational APIs on plan expiry (403 exact message).
 * 5. Hospital admin restricted subscription-only mode on plan expiry (login allowed, billing allowed, operational APIs blocked).
 * 6. Tenant isolation guarantee (Hospital A expired has zero impact on Hospital B active).
 * 7. Platform Super Admin global immunity across all endpoints.
 * 8. Seamless self-service renewal/upgrade restoring ACTIVE status and full staff access.
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const mongoose = require('mongoose');
const http = require('http');
const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const connectDB = require('../config/db');
const SuperAdminHospital = require('../models/SuperAdminHospital');
const SuperAdminNotification = require('../models/SuperAdminNotification');
const User = require('../models/User');
const Patient = require('../models/Patient');
const { getJwtSecret } = require('../config/env');
const authRoutes = require('../routes/authRoutes');
const adminRoutes = require('../routes/adminRoutes');
const patientRoutes = require('../routes/patientRoutes');
const tenantMiddleware = require('../middleware/tenantMiddleware');
const { checkModule } = require('../middleware/subscriptionMiddleware');
const {
  isTrialPlan,
  hasHospitalUsedTrial,
  getHospitalSubscriptionDates,
  getHospitalSubscriptionStatus,
  checkAndDispatchExpiryNotifications
} = require('../utils/subscriptionHelper');

let passedTests = 0;
let failedTests = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  ✅ PASS: ${message}`);
    passedTests++;
  } else {
    console.error(`  ❌ FAIL: ${message}`);
    failedTests++;
  }
}

async function request(serverUrl, path, options = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, serverUrl);
    const body = options.body ? JSON.stringify(options.body) : null;
    const headers = {
      'Content-Type': 'application/json',
      ...(body ? { 'Content-Length': Buffer.byteLength(body) } : {}),
      ...(options.headers || {})
    };

    const req = http.request(url, {
      method: options.method || 'GET',
      headers
    }, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          const parsed = data ? JSON.parse(data) : {};
          resolve({ status: res.statusCode, headers: res.headers, body: parsed, text: data });
        } catch (e) {
          resolve({ status: res.statusCode, headers: res.headers, body: {}, text: data });
        }
      });
    });

    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

async function run() {
  console.log('\n===============================================================');
  console.log(' CUROXA — SUBSCRIPTION ENFORCEMENT & ISOLATION TEST SUITE');
  console.log('===============================================================\n');

  await connectDB();

  // Create isolated express app for testing
  const app = express();
  app.use(express.json());
  app.use('/api/auth', authRoutes);
  app.use('/api/admin', tenantMiddleware, adminRoutes);
  app.use('/api/patients', tenantMiddleware, checkModule('reception'), patientRoutes);

  const server = http.createServer(app);
  await new Promise(resolve => server.listen(0, resolve));
  const port = server.address().port;
  const serverUrl = `http://127.0.0.1:${port}`;

  const timestamp = Date.now();
  const codeA = `sub-test-hosp-a-${timestamp}`;
  const codeB = `sub-test-hosp-b-${timestamp}`;
  const password = 'Password@123';
  const salt = await bcrypt.genSalt(10);
  const passwordHash = await bcrypt.hash(password, salt);

  try {
    // -----------------------------------------------------------------
    // SECTION 1: UNIT TESTS FOR DATE CALCULATIONS & PLAN IDENTIFICATION
    // -----------------------------------------------------------------
    console.log('--- SECTION 1: Plan Classification & Date Calculations ---');

    assert(isTrialPlan({ plan: 'Trial Plan (₹0/mo)' }), "Identifies 'Trial Plan (₹0/mo)' as TRIAL");
    assert(isTrialPlan({ plan: 'Trial Plan' }), "Identifies 'Trial Plan' as TRIAL");
    assert(isTrialPlan({ subscriptionPlan: 'trial' }), "Identifies subscriptionPlan: 'trial' as TRIAL");
    assert(isTrialPlan({ subscriptionPlan: 'custom' }), "Identifies subscriptionPlan: 'custom' as TRIAL");
    assert(!isTrialPlan({ plan: 'Professional Plan', subscriptionPlan: 'paid' }), "Identifies 'Professional Plan' as PAID");
    assert(!isTrialPlan({ plan: 'Enterprise Elite' }), "Identifies 'Enterprise Elite' as PAID");

    // 7-day trial policy
    const startTrial = new Date('2026-09-01T00:00:00.000Z');
    const trialDates = getHospitalSubscriptionDates({
      plan: 'Trial Plan',
      subscriptionStartDate: startTrial
    });
    const expectedTrialExpiry = new Date(startTrial.getTime() + 7 * 24 * 60 * 60 * 1000);
    assert(trialDates.isTrial === true, 'Trial dates flag isTrial = true');
    assert(trialDates.expiryDate.toISOString() === expectedTrialExpiry.toISOString(), 'Trial defaults to 7 days duration');

    // 1-year paid plan policy
    const paidDates = getHospitalSubscriptionDates({
      plan: 'Professional Plan',
      subscriptionStartDate: startTrial
    });
    assert(paidDates.isTrial === false, 'Paid plan flag isTrial = false');
    assert(paidDates.expiryDate.getFullYear() === startTrial.getFullYear() + 1, 'Paid plan defaults to 1 year duration');

    // One-Time Trial Rule Helpers
    assert(hasHospitalUsedTrial({ trialUsed: true }) === true, 'Recognizes trialUsed: true');
    assert(hasHospitalUsedTrial({ plan: 'Trial Plan' }) === true, 'Recognizes active/expired Trial Plan as trial used');
    assert(hasHospitalUsedTrial({ subscriptionPlan: 'trial' }) === true, 'Recognizes subscriptionPlan: trial as trial used');
    assert(hasHospitalUsedTrial({ plan: 'Standard Basic', trialUsed: false }) === false, 'Fresh hospital without trial returns trialUsed = false');

    // -----------------------------------------------------------------
    // SECTION 2: AUTOMATED MULTI-DAY WARNINGS & IDEMPOTENCY
    // -----------------------------------------------------------------
    console.log('\n--- SECTION 2: Automated Multi-day Warnings & Idempotency ---');

    const warningHospCode = `hosp-warning-${timestamp}`;
    const warningHospital = await SuperAdminHospital.create({
      name: 'Warning General Hospital',
      code: warningHospCode,
      hospitalId: `HSP-W${String(timestamp).slice(-5)}`,
      plan: 'Trial Plan',
      subscriptionPlan: 'trial',
      status: 'Active',
      // Set expiry to 2 days from now
      subscriptionExpiryDate: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000 - 1000)
    });

    const dispatch1 = await checkAndDispatchExpiryNotifications(warningHospital);
    assert(dispatch1.created === true, 'Dispatches 2-day trial expiry warning notification');

    const notif = await SuperAdminNotification.findOne({ 'metadata.tenantId': warningHospCode });
    assert(notif !== null, 'Notification saved with metadata.tenantId');
    assert(notif?.title === 'Trial Plan Expiring in 2 Days', "Notification title is 'Trial Plan Expiring in 2 Days'");
    assert(notif?.metadata?.daysRemaining === 2, 'Metadata records 2 days remaining');

    // Idempotency: call again
    const dispatch2 = await checkAndDispatchExpiryNotifications(warningHospital);
    assert(dispatch2.created === false, 'Idempotent: does NOT create duplicate notification on same day');
    const notifCount = await SuperAdminNotification.countDocuments({ 'metadata.tenantId': warningHospCode });
    assert(notifCount === 1, 'Exactly 1 warning notification exists in DB for this hospital');

    // Paid plan 5-day warning
    const paidWarningCode = `hosp-paid-warn-${timestamp}`;
    const paidWarningHospital = await SuperAdminHospital.create({
      name: 'Paid Warning Hospital',
      code: paidWarningCode,
      hospitalId: `HSP-P${String(timestamp).slice(-5)}`,
      plan: 'Professional Plan',
      subscriptionPlan: 'paid',
      status: 'Active',
      // 4 days from now
      subscriptionExpiryDate: new Date(Date.now() + 4 * 24 * 60 * 60 * 1000 - 1000)
    });
    const dispatchPaid = await checkAndDispatchExpiryNotifications(paidWarningHospital);
    assert(dispatchPaid.created === true, 'Dispatches 4-day paid warning notification');
    const paidNotif = await SuperAdminNotification.findOne({ 'metadata.tenantId': paidWarningCode });
    assert(paidNotif?.title === 'Subscription Expiring in 4 Days', "Paid notification title is 'Subscription Expiring in 4 Days'");

    // -----------------------------------------------------------------
    // SECTION 3: STRICT EXPIRY ENFORCEMENT & RESTRICTED MODE
    // -----------------------------------------------------------------
    console.log('\n--- SECTION 3: Strict Expiry Enforcement (Staff Block vs Admin Restricted) ---');

    // Hospital A: EXPIRED TRIAL
    const expiredDate = new Date(Date.now() - 24 * 60 * 60 * 1000); // 1 day ago
    const hospitalA = await SuperAdminHospital.create({
      name: 'Apex City Hospital (Expired)',
      code: codeA,
      hospitalId: `HSP-A${String(timestamp).slice(-5)}`,
      plan: 'Trial Plan',
      subscriptionPlan: 'trial',
      status: 'Active', // status might still be Active while expiryDate is passed
      subscriptionStartDate: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000),
      subscriptionExpiryDate: expiredDate,
      modules: { reception: { enabled: true }, doctor: { enabled: true }, pharmacy: { enabled: true }, laboratory: { enabled: true } }
    });

    // Hospital B: ACTIVE PAID (Control for Tenant Isolation)
    const futureDate = new Date(Date.now() + 180 * 24 * 60 * 60 * 1000);
    const hospitalB = await SuperAdminHospital.create({
      name: 'Metro Care Clinic (Active)',
      code: codeB,
      hospitalId: `HSP-B${String(timestamp).slice(-5)}`,
      plan: 'Professional Plan',
      subscriptionPlan: 'paid',
      status: 'Active',
      subscriptionStartDate: new Date(),
      subscriptionExpiryDate: futureDate,
      modules: { reception: { enabled: true }, doctor: { enabled: true }, pharmacy: { enabled: true }, laboratory: { enabled: true } }
    });

    // Seed Staff & Admin for Hospital A
    const doctorA = await User.create({
      tenantId: codeA,
      staff_id: `dr-a-${timestamp}`,
      password_hash: passwordHash,
      role: 'doctor',
      name: 'Dr. Alice Apex',
      email: `dr.alice.${timestamp}@apex.com`
    });

    const adminA = await User.create({
      tenantId: codeA,
      staff_id: `admin-a-${timestamp}`,
      password_hash: passwordHash,
      role: 'admin',
      name: 'Admin Arthur Apex',
      email: `admin.${timestamp}@apex.com`
    });

    // Seed Staff for Hospital B
    const doctorB = await User.create({
      tenantId: codeB,
      staff_id: `dr-b-${timestamp}`,
      password_hash: passwordHash,
      role: 'doctor',
      name: 'Dr. Bob Metro',
      email: `dr.bob.${timestamp}@metro.com`
    });

    // 1. Doctor A login on Expired Hospital A -> 403 Forbidden with exact required message
    const loginDocA = await request(serverUrl, '/api/auth/login', {
      method: 'POST',
      body: { staff_id: doctorA.staff_id, password }
    });
    assert(loginDocA.status === 403, 'Normal staff (doctor) blocked from login when hospital plan expired (403)');
    assert(
      loginDocA.body.error === 'Your subscription has expired. Please contact your hospital administrator to renew your plan.',
      'Normal staff receives exact required 403 error message'
    );

    // 2. Doctor A send-login-otp on Expired Hospital A -> 403 Forbidden with exact message
    const otpDocA = await request(serverUrl, '/api/auth/send-login-otp', {
      method: 'POST',
      body: { emailOrPhone: doctorA.email }
    });
    assert(otpDocA.status === 403, 'Normal staff blocked from OTP login when subscription expired (403)');
    assert(
      otpDocA.body.error === 'Your subscription has expired. Please contact your hospital administrator to renew your plan.',
      'OTP request returns exact subscription expired message'
    );

    // 3. Admin A login on Expired Hospital A -> 200 OK in Restricted Mode!
    const loginAdminA = await request(serverUrl, '/api/auth/login', {
      method: 'POST',
      body: { staff_id: adminA.staff_id, password }
    });
    assert(loginAdminA.status === 200, 'Hospital admin CAN log in when subscription expired (200 OK)');
    assert(loginAdminA.body.subscriptionRestricted === true, 'Admin login response flags subscriptionRestricted = true');
    assert(loginAdminA.body.subscriptionStatus === 'EXPIRED', "Admin login response flags subscriptionStatus = 'EXPIRED'");

    const adminTokenA = loginAdminA.body.token;

    // 4. Admin A accesses /api/admin/subscription -> 200 OK
    const adminSubRes = await request(serverUrl, '/api/admin/subscription', {
      headers: { Authorization: `Bearer ${adminTokenA}`, 'x-tenant-id': codeA }
    });
    assert(adminSubRes.status === 200, 'Expired admin CAN access /api/admin/subscription (200 OK)');
    assert(adminSubRes.body.subscriptionRestricted === true, 'Subscription status reports subscriptionRestricted = true');
    assert(adminSubRes.body.isExpired === true, 'Subscription status reports isExpired = true');

    // 5. Admin A accesses /api/admin/plans -> 200 OK
    const adminPlansRes = await request(serverUrl, '/api/admin/plans', {
      headers: { Authorization: `Bearer ${adminTokenA}`, 'x-tenant-id': codeA }
    });
    assert(adminPlansRes.status === 200, 'Expired admin CAN view plans (/api/admin/plans)');

    // 6. Admin A accesses /api/admin/notifications -> 200 OK
    const adminNotifsRes = await request(serverUrl, '/api/admin/notifications', {
      headers: { Authorization: `Bearer ${adminTokenA}`, 'x-tenant-id': codeA }
    });
    assert(adminNotifsRes.status === 200, 'Expired admin CAN view notifications (/api/admin/notifications)');

    // 7. Admin A attempts operational action (e.g. creating staff) -> 403 Forbidden!
    const adminCreateStaff = await request(serverUrl, '/api/admin/users', {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminTokenA}`, 'x-tenant-id': codeA },
      body: {
        staff_id: `nurse-test-${timestamp}`,
        password: 'Password@123',
        role: 'nurse',
        name: 'Nurse Nancy'
      }
    });
    assert(adminCreateStaff.status === 403, 'Expired admin is BLOCKED from operational staff creation (403)');
    assert(
      adminCreateStaff.body.error === 'Your subscription has expired. Please contact your hospital administrator to renew your plan.',
      'Operational route returns exact subscription expiry error'
    );

    // 8. Normal staff attempting to call operational module (/api/patients) with valid token -> 403 Forbidden!
    const syntheticDocTokenA = jwt.sign(
      { id: doctorA._id, staff_id: doctorA.staff_id, role: doctorA.role, tenantId: codeA },
      getJwtSecret(),
      { expiresIn: '1h' }
    );
    const docCallPatients = await request(serverUrl, '/api/patients', {
      headers: { Authorization: `Bearer ${syntheticDocTokenA}`, 'x-tenant-id': codeA }
    });
    assert(docCallPatients.status === 403, 'Normal staff calling operational API (/api/patients) is blocked (403)');
    assert(
      docCallPatients.body.error === 'Your subscription has expired. Please contact your hospital administrator to renew your plan.',
      'API call returns exact required 403 message'
    );

    // -----------------------------------------------------------------
    // SECTION 4: TENANT ISOLATION GUARANTEE
    // -----------------------------------------------------------------
    console.log('\n--- SECTION 4: Tenant Isolation Guarantee ---');

    // Doctor B belongs to Hospital B (Active)
    const loginDocB = await request(serverUrl, '/api/auth/login', {
      method: 'POST',
      body: { staff_id: doctorB.staff_id, password }
    });
    assert(loginDocB.status === 200, 'Hospital B staff login succeeds unaffected by Hospital A expiry (200 OK)');
    assert(loginDocB.body.subscriptionRestricted === false, 'Hospital B reports subscriptionRestricted = false');
    assert(loginDocB.body.subscriptionStatus === 'ACTIVE', "Hospital B reports subscriptionStatus = 'ACTIVE'");

    const docTokenB = loginDocB.body.token;
    const docBCallPatients = await request(serverUrl, '/api/patients', {
      headers: { Authorization: `Bearer ${docTokenB}`, 'x-tenant-id': codeB }
    });
    assert(docBCallPatients.status === 200, 'Hospital B staff can query patients API without any block (200 OK)');

    // -----------------------------------------------------------------
    // SECTION 5: PLATFORM SUPER ADMIN UNRESTRICTED ACCESS
    // -----------------------------------------------------------------
    console.log('\n--- SECTION 5: Super Admin Global Immunity ---');

    const superAdminUser = await User.create({
      tenantId: 'platform',
      staff_id: `superadmin-${timestamp}`,
      password_hash: passwordHash,
      role: 'superadmin',
      name: 'Platform Super Admin',
      email: `superadmin.${timestamp}@curoxa.com`
    });

    const superAdminLogin = await request(serverUrl, '/api/auth/login', {
      method: 'POST',
      body: { staff_id: superAdminUser.staff_id, password }
    });
    assert(superAdminLogin.status === 200, 'Super Admin login succeeds (200 OK)');
    const superAdminToken = superAdminLogin.body.token;

    // Call patients API under expired Hospital A tenant context
    const saCallPatients = await request(serverUrl, '/api/patients', {
      headers: { Authorization: `Bearer ${superAdminToken}`, 'x-tenant-id': codeA }
    });
    assert(saCallPatients.status === 200, 'Super Admin retains unrestricted global access even on expired tenant (200 OK)');

    // -----------------------------------------------------------------
    // SECTION 6: SEAMLESS SELF-SERVICE RENEWAL & ACCESS RESTORATION
    // -----------------------------------------------------------------
    console.log('\n--- SECTION 6: Self-Service Renewal & Seamless Access Restoration ---');

    // 1. Attempt renewal without planTier while on Trial -> MUST FAIL (400)
    const rejectNoPlanTrialRenew = await request(serverUrl, '/api/admin/renew-subscription', {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminTokenA}`, 'x-tenant-id': codeA },
      body: {}
    });
    assert(rejectNoPlanTrialRenew.status === 400, 'Renewal without selecting paid plan on expired trial is rejected (400)');
    assert(rejectNoPlanTrialRenew.body.error?.includes('select a paid plan'), 'Error directs admin to select paid plan');

    // 2. Attempt renewal explicitly requesting another Trial Plan -> MUST FAIL (400)
    const rejectTrialPlanRenew = await request(serverUrl, '/api/admin/renew-subscription', {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminTokenA}`, 'x-tenant-id': codeA },
      body: {
        planTier: 'Trial Plan',
        billingCycle: 'monthly'
      }
    });
    assert(rejectTrialPlanRenew.status === 400, 'Attempting to renew into Trial Plan is rejected (400)');
    assert(rejectTrialPlanRenew.body.error?.includes('Trial plan is one-time only'), 'Error explains trial is one-time only');

    // 3. Hospital A Admin selects Professional Plan (Annual) -> MUST SUCCEED (200)
    const renewRes = await request(serverUrl, '/api/admin/renew-subscription', {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminTokenA}`, 'x-tenant-id': codeA },
      body: {
        planTier: 'Professional Plan',
        billingCycle: 'annual'
      }
    });

    assert(renewRes.status === 200, 'Admin can renew subscription successfully (200 OK)');
    assert(renewRes.body.subscription?.status === 'ACTIVE', "Subscription status returns 'ACTIVE'");
    assert(renewRes.body.subscription?.isExpired === false, 'isExpired is false after renewal');
    assert(renewRes.body.subscription?.subscriptionRestricted === false, 'subscriptionRestricted is false after renewal');
    assert(renewRes.body.subscription?.daysRemaining > 300, 'Subscription extended for full annual cycle (~365 days)');
    assert(renewRes.body.subscription?.trialUsed === true, 'trialUsed is permanently true');
    assert(renewRes.body.subscription?.canUseTrial === false, 'canUseTrial is false');

    // 4. Now that hospital is on a Paid Plan, attempt switching back to Trial Plan -> MUST BE REJECTED (400)
    const rejectSwitchBackToTrial = await request(serverUrl, '/api/admin/renew-subscription', {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminTokenA}`, 'x-tenant-id': codeA },
      body: {
        planTier: 'Trial Plan'
      }
    });
    assert(rejectSwitchBackToTrial.status === 400, 'Paid hospital attempting to switch back to Trial is rejected (400)');

    // Now Doctor A attempts login again -> Must SUCCEED!
    const postRenewalDocLogin = await request(serverUrl, '/api/auth/login', {
      method: 'POST',
      body: { staff_id: doctorA.staff_id, password }
    });
    assert(postRenewalDocLogin.status === 200, 'Doctor A can immediately log in after renewal (200 OK)');
    assert(postRenewalDocLogin.body.subscriptionRestricted === false, 'Restricted mode is fully lifted');

    // Doctor A calls operational API -> Must SUCCEED!
    const postRenewalDocPatients = await request(serverUrl, '/api/patients', {
      headers: { Authorization: `Bearer ${postRenewalDocLogin.body.token}`, 'x-tenant-id': codeA }
    });
    assert(postRenewalDocPatients.status === 200, 'Doctor A can immediately access operational APIs after renewal (200 OK)');

    // Admin A can now perform operational staff management again!
    const adminCreateStaffPostRenewal = await request(serverUrl, '/api/admin/users', {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminTokenA}`, 'x-tenant-id': codeA },
      body: {
        staff_id: `nurse-post-${timestamp}`,
        password: 'Password@123',
        role: 'nurse',
        name: 'Nurse Nina'
      }
    });
    assert(adminCreateStaffPostRenewal.status === 201, 'Admin can create staff again after renewal (201 Created)');

  } catch (err) {
    console.error('Test execution error:', err);
    failedTests++;
  } finally {
    // Cleanup test records
    console.log('\nCleaning up test artifacts...');
    await SuperAdminHospital.deleteMany({ code: { $regex: new RegExp(timestamp) } }).catch(() => {});
    await User.deleteMany({ staff_id: { $regex: new RegExp(timestamp) } }).catch(() => {});
    await SuperAdminNotification.deleteMany({ 'metadata.tenantId': { $regex: new RegExp(timestamp) } }).catch(() => {});

    server.close();
    await mongoose.disconnect();

    console.log('\n===============================================================');
    console.log(` RESULTS: ${passedTests} passed, ${failedTests} failed`);
    console.log('===============================================================\n');

    process.exit(failedTests > 0 ? 1 : 0);
  }
}

run();
