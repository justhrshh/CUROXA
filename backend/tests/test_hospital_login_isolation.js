/**
 * CUROXA — HOSPITAL-WISE LOGIN ISOLATION VERIFICATION SUITE
 * 
 * Verifies:
 * 1. Staff A -> Hospital A login portal -> Login succeeds (200 OK)
 * 2. Staff A -> Hospital B login portal -> Login rejected (403 Forbidden with exact message)
 * 3. Staff B -> Hospital B login portal -> Login succeeds (200 OK)
 * 4. Staff B -> Hospital A login portal -> Login rejected (403 Forbidden with exact message)
 * 5. Staff A -> Non-existent Hospital C portal -> Login rejected (403 Forbidden)
 * 6. Same staff_id across two hospitals (e.g. nurse):
 *    - Hospital A portal authenticates Staff A
 *    - Hospital B portal authenticates Staff B
 * 7. Wrong password on wrong portal -> Returns 401 Invalid credentials (does not leak hospital membership)
 * 8. Super Admin login remains unaffected on Hospital A portal, Hospital B portal, and generic platform login
 * 9. Generic login flow (/login with no hospitalId) remains unchanged
 * 10. OTP login isolation:
 *     - send-login-otp for Staff A via Hospital B portal -> 403 Forbidden
 *     - send-login-otp for Staff A via Hospital A portal -> 200 OK
 *     - login-with-otp for Staff A via Hospital B portal -> 403 Forbidden
 *     - login-with-otp for Staff A via Hospital A portal -> 200 OK
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const mongoose = require('mongoose');
const http = require('http');
const express = require('express');
const bcrypt = require('bcrypt');
const connectDB = require('../config/db');
const SuperAdminHospital = require('../models/SuperAdminHospital');
const User = require('../models/User');
const authRoutes = require('../routes/authRoutes');

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
  console.log(' CUROXA — HOSPITAL-WISE LOGIN ISOLATION TEST SUITE');
  console.log('===============================================================\n');

  await connectDB();

  // Create isolated express app for testing
  const app = express();
  app.use(express.json());
  app.use('/api/auth', authRoutes);

  const server = http.createServer(app);
  await new Promise(resolve => server.listen(0, resolve));
  const port = server.address().port;
  const serverUrl = `http://127.0.0.1:${port}`;

  const timestamp = Date.now();
  const codeA = `test-hosp-a-${timestamp}`;
  const codeB = `test-hosp-b-${timestamp}`;
  const hospitalIdA = `HSP-A${String(timestamp).slice(-5)}`;
  const hospitalIdB = `HSP-B${String(timestamp).slice(-5)}`;

  try {
    // 1. Provision Hospital A and Hospital B
    console.log('[SETUP] Provisioning test hospitals and users...');
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash('StaffPassword@123', salt);

    const hospA = await SuperAdminHospital.create({
      name: `City Hospital Alpha ${timestamp}`,
      code: codeA,
      hospitalId: hospitalIdA,
      status: 'Active'
    });

    const hospB = await SuperAdminHospital.create({
      name: `Metro Hospital Beta ${timestamp}`,
      code: codeB,
      hospitalId: hospitalIdB,
      status: 'Active'
    });

    // 2. Provision Staff A (Hospital A) and Staff B (Hospital B)
    const staffAId = `doc_a_${timestamp}`;
    const staffBId = `doc_b_${timestamp}`;
    const sharedStaffId = `nurse_${timestamp}`; // Identical staff_id in both hospitals

    const userA = await User.create({
      tenantId: codeA,
      staff_id: staffAId,
      email: `${staffAId}@alpha.com`,
      phone: `911${String(timestamp).slice(-7)}`,
      password_hash: passwordHash,
      role: 'doctor',
      name: 'Dr. Alpha Staff',
      hasSetPassword: true,
      isSetupComplete: true
    });

    const userB = await User.create({
      tenantId: codeB,
      staff_id: staffBId,
      email: `${staffBId}@beta.com`,
      phone: `922${String(timestamp).slice(-7)}`,
      password_hash: passwordHash,
      role: 'doctor',
      name: 'Dr. Beta Staff',
      hasSetPassword: true,
      isSetupComplete: true
    });

    // Shared staff_id in both hospitals
    const sharedUserA = await User.create({
      tenantId: codeA,
      staff_id: sharedStaffId,
      email: `alpha_${sharedStaffId}@hosp.com`,
      password_hash: passwordHash,
      role: 'nurse',
      name: 'Nurse Alpha',
      hasSetPassword: true,
      isSetupComplete: true
    });

    const sharedUserB = await User.create({
      tenantId: codeB,
      staff_id: sharedStaffId,
      email: `beta_${sharedStaffId}@hosp.com`,
      password_hash: passwordHash,
      role: 'nurse',
      name: 'Nurse Beta',
      hasSetPassword: true,
      isSetupComplete: true
    });

    // Ensure superadmin account exists
    let superAdmin = await User.findOne({ role: 'superadmin' });
    if (!superAdmin) {
      superAdmin = await User.create({
        tenantId: 'curoxa',
        staff_id: `superadmin_${timestamp}`,
        email: `superadmin_${timestamp}@curoxa.com`,
        password_hash: await bcrypt.hash('Superadmin@123', salt),
        role: 'superadmin',
        name: 'Platform Superadmin',
        hasSetPassword: true,
        isSetupComplete: true
      });
    }

    console.log('[TEST GROUP 1] Staff Hospital Isolation (Password Login)');

    // 1. Staff A -> Hospital A portal -> Succeeded
    const resAtoA = await request(serverUrl, '/api/auth/login', {
      method: 'POST',
      body: {
        staff_id: staffAId,
        password: 'StaffPassword@123',
        hospitalId: hospitalIdA
      }
    });
    assert(resAtoA.status === 200 && resAtoA.body.token, 'Staff A login to Hospital A portal succeeds (200 OK)');
    assert(resAtoA.body.user && resAtoA.body.user.tenantId === codeA, 'Staff A session belongs to Hospital A tenantId');

    // 2. Staff A -> Hospital B portal -> Rejected with exact message
    const resAtoB = await request(serverUrl, '/api/auth/login', {
      method: 'POST',
      body: {
        staff_id: staffAId,
        password: 'StaffPassword@123',
        hospitalId: hospitalIdB
      }
    });
    assert(resAtoB.status === 403, 'Staff A login to Hospital B portal returns HTTP 403 Forbidden');
    assert(resAtoB.body.error === 'You are not authorized to log in through this hospital portal.',
      'Staff A login to Hospital B portal returns exact error message: "You are not authorized to log in through this hospital portal."');

    // 3. Staff B -> Hospital B portal -> Succeeded
    const resBtoB = await request(serverUrl, '/api/auth/login', {
      method: 'POST',
      body: {
        staff_id: staffBId,
        password: 'StaffPassword@123',
        hospitalId: hospitalIdB
      }
    });
    assert(resBtoB.status === 200 && resBtoB.body.token, 'Staff B login to Hospital B portal succeeds (200 OK)');
    assert(resBtoB.body.user && resBtoB.body.user.tenantId === codeB, 'Staff B session belongs to Hospital B tenantId');

    // 4. Staff B -> Hospital A portal -> Rejected with exact message
    const resBtoA = await request(serverUrl, '/api/auth/login', {
      method: 'POST',
      body: {
        staff_id: staffBId,
        password: 'StaffPassword@123',
        hospitalId: hospitalIdA
      }
    });
    assert(resBtoA.status === 403, 'Staff B login to Hospital A portal returns HTTP 403 Forbidden');
    assert(resBtoA.body.error === 'You are not authorized to log in through this hospital portal.',
      'Staff B login to Hospital A portal returns exact error message: "You are not authorized to log in through this hospital portal."');

    // 5. Staff A -> Non-existent hospital portal (HSP-FAKE99) -> Rejected
    const resAtoFake = await request(serverUrl, '/api/auth/login', {
      method: 'POST',
      body: {
        staff_id: staffAId,
        password: 'StaffPassword@123',
        hospitalId: 'HSP-FAKE99'
      }
    });
    assert(resAtoFake.status === 403, 'Staff A login to non-existent portal returns HTTP 403 Forbidden');
    assert(resAtoFake.body.error === 'You are not authorized to log in through this hospital portal.',
      'Non-existent portal rejection returns standard unauthorized message');

    console.log('\n[TEST GROUP 2] Ambiguous staff_id Multi-Tenant Resolution');

    // 6. Shared staff_id ("nurse_timestamp") on Hospital A portal -> Resolves to Nurse Alpha
    const resNurseA = await request(serverUrl, '/api/auth/login', {
      method: 'POST',
      body: {
        staff_id: sharedStaffId,
        password: 'StaffPassword@123',
        hospitalId: hospitalIdA
      }
    });
    assert(resNurseA.status === 200, 'Shared staff_id on Hospital A portal succeeds');
    assert(resNurseA.body.user && resNurseA.body.user.tenantId === codeA && resNurseA.body.user.name === 'Nurse Alpha',
      'Shared staff_id on Hospital A portal correctly resolves to Nurse Alpha in Hospital A');

    // 7. Shared staff_id ("nurse_timestamp") on Hospital B portal -> Resolves to Nurse Beta
    const resNurseB = await request(serverUrl, '/api/auth/login', {
      method: 'POST',
      body: {
        staff_id: sharedStaffId,
        password: 'StaffPassword@123',
        hospitalId: hospitalIdB
      }
    });
    assert(resNurseB.status === 200, 'Shared staff_id on Hospital B portal succeeds');
    assert(resNurseB.body.user && resNurseB.body.user.tenantId === codeB && resNurseB.body.user.name === 'Nurse Beta',
      'Shared staff_id on Hospital B portal correctly resolves to Nurse Beta in Hospital B');

    console.log('\n[TEST GROUP 3] Super Admin Access & Generic Login Preservation');

    // 8. Super Admin -> Hospital A portal -> Login succeeds
    const resSuperA = await request(serverUrl, '/api/auth/login', {
      method: 'POST',
      body: {
        staff_id: superAdmin.staff_id,
        password: 'Superadmin@123',
        hospitalId: hospitalIdA
      }
    });
    assert(resSuperA.status === 200 && resSuperA.body.token, 'Super Admin login on Hospital A portal succeeds');

    // 9. Super Admin -> Hospital B portal -> Login succeeds
    const resSuperB = await request(serverUrl, '/api/auth/login', {
      method: 'POST',
      body: {
        staff_id: superAdmin.staff_id,
        password: 'Superadmin@123',
        hospitalId: hospitalIdB
      }
    });
    assert(resSuperB.status === 200 && resSuperB.body.token, 'Super Admin login on Hospital B portal succeeds');

    // 10. Generic login (/login without hospitalId) -> Staff A succeeds
    const resGeneric = await request(serverUrl, '/api/auth/login', {
      method: 'POST',
      body: {
        staff_id: staffAId,
        password: 'StaffPassword@123'
      }
    });
    assert(resGeneric.status === 200 && resGeneric.body.token, 'Generic login without hospitalId preserves normal login flow');

    // 11. Wrong password on wrong portal -> Returns 401 (not 403, preventing enumeration)
    const resWrongPass = await request(serverUrl, '/api/auth/login', {
      method: 'POST',
      body: {
        staff_id: staffAId,
        password: 'WrongPassword!',
        hospitalId: hospitalIdB
      }
    });
    assert(resWrongPass.status === 401 && resWrongPass.body.error === 'Invalid credentials',
      'Wrong password on wrong portal returns 401 Invalid credentials (does not leak account existence)');

    console.log('\n[TEST GROUP 4] OTP Flow Hospital Isolation');

    // 12. Send login OTP for Staff A via Hospital B portal -> 403 Forbidden
    const resSendOtpWrong = await request(serverUrl, '/api/auth/send-login-otp', {
      method: 'POST',
      body: {
        emailOrPhone: userA.email,
        hospitalId: hospitalIdB
      }
    });
    assert(resSendOtpWrong.status === 403 && resSendOtpWrong.body.error === 'You are not authorized to log in through this hospital portal.',
      'send-login-otp for Staff A on Hospital B portal is rejected (403)');

    // 13. Send login OTP for Staff A via Hospital A portal -> 200 OK
    const resSendOtpRight = await request(serverUrl, '/api/auth/send-login-otp', {
      method: 'POST',
      body: {
        emailOrPhone: userA.email,
        hospitalId: hospitalIdA
      }
    });
    assert(resSendOtpRight.status === 200, 'send-login-otp for Staff A on Hospital A portal succeeds (200 OK)');

    // Fetch generated OTP
    const refreshedUserA = await User.findById(userA._id);
    const validOtp = refreshedUserA.login_otp_code;
    assert(Boolean(validOtp), 'OTP code was generated and stored on User A');

    // 14. Verify OTP for Staff A via Hospital B portal -> 403 Forbidden
    const resVerifyOtpWrong = await request(serverUrl, '/api/auth/login-with-otp', {
      method: 'POST',
      body: {
        emailOrPhone: userA.email,
        otp: validOtp,
        hospitalId: hospitalIdB
      }
    });
    assert(resVerifyOtpWrong.status === 403 && resVerifyOtpWrong.body.error === 'You are not authorized to log in through this hospital portal.',
      'login-with-otp for Staff A on Hospital B portal is rejected (403)');

    // 15. Verify OTP for Staff A via Hospital A portal -> 200 OK
    const resVerifyOtpRight = await request(serverUrl, '/api/auth/login-with-otp', {
      method: 'POST',
      body: {
        emailOrPhone: userA.email,
        otp: validOtp,
        hospitalId: hospitalIdA
      }
    });
    assert(resVerifyOtpRight.status === 200 && resVerifyOtpRight.body.token,
      'login-with-otp for Staff A on Hospital A portal succeeds (200 OK)');

    // Cleanup test records
    await SuperAdminHospital.deleteMany({ _id: { $in: [hospA._id, hospB._id] } });
    await User.deleteMany({ _id: { $in: [userA._id, userB._id, sharedUserA._id, sharedUserB._id] } });

  } catch (err) {
    console.error('Test execution failed with error:', err);
    failedTests++;
  } finally {
    server.close();
    await mongoose.connection.close();
  }

  console.log('\n===============================================================');
  console.log(` RESULT: ${passedTests}/${passedTests + failedTests} TESTS PASSED`);
  if (failedTests === 0) {
    console.log(' ALL HOSPITAL LOGIN ISOLATION VERIFICATIONS PASSED (100%)');
  } else {
    console.log(` ${failedTests} TEST(S) FAILED`);
  }
  console.log('===============================================================\n');

  process.exit(failedTests === 0 ? 0 : 1);
}

run();
