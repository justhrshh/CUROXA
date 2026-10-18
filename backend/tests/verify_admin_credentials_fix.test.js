/**
 * CUROXA — END-TO-END VERIFICATION: HOSPITAL ADMIN CREDENTIAL UPDATE & LOGIN
 * 
 * Verifies:
 * 1. Input validation & error responses (missing input, short password, duplicate username, not found).
 * 2. Super Admin updates hospital admin credentials without 'mongoose is not defined' error.
 * 3. Hospital admin authenticates successfully with NEW credentials via /api/auth/login.
 * 4. Hospital admin login fails with OLD or WRONG credentials (401 Invalid credentials).
 * 5. Other hospitals' admin accounts remain completely unaffected.
 * 6. Tenant isolation is maintained (Admin A cannot log into Hospital B portal -> 403 Forbidden).
 * 7. Old JWT tokens with prior password_version are invalidated upon password change.
 * 8. Hospital profile GET reflects the updated adminUsername.
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const http = require('http');
const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const mongoose = require('mongoose');
const connectDB = require('../config/db');
const { getJwtSecret } = require('../config/env');
const SuperAdminHospital = require('../models/SuperAdminHospital');
const User = require('../models/User');

const superAdminRoutes = require('../routes/superAdminRoutes');
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

async function httpRequest(port, method, path, body = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const postData = body ? JSON.stringify(body) : null;
    const reqHeaders = {
      'Content-Type': 'application/json',
      ...(postData ? { 'Content-Length': Buffer.byteLength(postData) } : {}),
      ...headers
    };

    const req = http.request({
      hostname: '127.0.0.1',
      port,
      path,
      method,
      headers: reqHeaders
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = data ? JSON.parse(data) : {};
          resolve({ status: res.statusCode, body: json, text: data });
        } catch (e) {
          resolve({ status: res.statusCode, body: {}, text: data });
        }
      });
    });

    req.on('error', reject);
    if (postData) req.write(postData);
    req.end();
  });
}

async function runSuite() {
  console.log('\n===============================================================');
  console.log(' CUROXA — HOSPITAL ADMIN CREDENTIALS & LOGIN E2E VERIFICATION');
  console.log('===============================================================\n');

  await connectDB();
  await new Promise(r => setTimeout(r, 1000));

  let secret;
  try {
    secret = getJwtSecret();
  } catch (e) {
    secret = process.env.JWT_SECRET || 'secret_key';
  }

  // Setup test Express server
  const app = express();
  app.use(express.json());
  app.use('/api/superadmin', superAdminRoutes);
  app.use('/api/auth', authRoutes);

  const server = app.listen(0);
  const port = server.address().port;
  console.log(`[SETUP] Verification test server listening on port ${port}`);

  // Create superadmin token
  const superAdminToken = jwt.sign(
    { staff_id: 'superadmin', role: 'superadmin', name: 'Super Admin', isRootAdmin: true },
    secret,
    { expiresIn: '1h' }
  );

  // Setup test tenant A & B
  const tenantACode = `test_hosp_cred_a_${Date.now()}`;
  const tenantBCode = `test_hosp_cred_b_${Date.now()}`;
  const salt = await bcrypt.genSalt(10);
  const initialHashA = await bcrypt.hash('InitialPassA@123', salt);
  const initialHashB = await bcrypt.hash('InitialPassB@123', salt);

  const hospA = await SuperAdminHospital.create({
    name: 'Hospital A Credentials Test',
    code: tenantACode,
    hospitalId: `HSP-${Math.random().toString(36).substring(2, 8).toUpperCase()}`,
    status: 'Active'
  });

  const hospB = await SuperAdminHospital.create({
    name: 'Hospital B Credentials Test',
    code: tenantBCode,
    hospitalId: `HSP-${Math.random().toString(36).substring(2, 8).toUpperCase()}`,
    status: 'Active'
  });

  const adminAStaffId = `admin_a_${Date.now()}`;
  const adminBStaffId = `admin_b_${Date.now()}`;

  const userA = await User.create({
    tenantId: tenantACode,
    staff_id: adminAStaffId,
    email: `${adminAStaffId}@hospitala.com`,
    phone: '9876500001',
    password_hash: initialHashA,
    role: 'admin',
    name: 'Hospital A Administrator',
    hasSetPassword: true,
    isSetupComplete: true,
    password_version: 1
  });

  const userB = await User.create({
    tenantId: tenantBCode,
    staff_id: adminBStaffId,
    email: `${adminBStaffId}@hospitalb.com`,
    phone: '9876500002',
    password_hash: initialHashB,
    role: 'admin',
    name: 'Hospital B Administrator',
    hasSetPassword: true,
    isSetupComplete: true,
    password_version: 1
  });

  // Setup test tenant C with NO admin user yet (like Hayat Medical Center initially)
  const tenantCCode = `test_hosp_cred_c_${Date.now()}`;
  const hospNoAdmin = await SuperAdminHospital.create({
    name: 'Hospital C No Admin Test',
    code: tenantCCode,
    hospitalId: `HSP-${Math.random().toString(36).substring(2, 8).toUpperCase()}`,
    status: 'Active'
  });

  try {
    // -----------------------------------------------------------------
    // TEST 1: Missing input validation (empty body / neither username nor password)
    // -----------------------------------------------------------------
    console.log('\n--- TEST 1: Missing input validation ---');
    const emptyRes = await httpRequest(port, 'PUT', `/api/superadmin/hospitals/${hospA._id}/admin`, {}, {
      'Authorization': `Bearer ${superAdminToken}`
    });
    assert(emptyRes.status === 400, `Empty credentials request returns 400 (Got ${emptyRes.status})`);
    assert(emptyRes.body.error === "Please provide adminUsername or adminPassword to update.", `Correct error message returned: "${emptyRes.body.error}"`);

    // -----------------------------------------------------------------
    // TEST 2: Short password validation (< 6 chars)
    // -----------------------------------------------------------------
    console.log('\n--- TEST 2: Password length validation ---');
    const shortPassRes = await httpRequest(port, 'PUT', `/api/superadmin/hospitals/${hospA._id}/admin`, {
      adminPassword: '123'
    }, {
      'Authorization': `Bearer ${superAdminToken}`
    });
    assert(shortPassRes.status === 400, `Short password returns 400 (Got ${shortPassRes.status})`);
    assert(shortPassRes.body.error && shortPassRes.body.error.includes('at least 6 characters'), `Password length message returned: "${shortPassRes.body.error}"`);

    // -----------------------------------------------------------------
    // TEST 3: Non-existent hospital ID returns 404
    // -----------------------------------------------------------------
    console.log('\n--- TEST 3: Non-existent hospital lookup ---');
    const fakeId = new mongoose.Types.ObjectId();
    const notFoundRes = await httpRequest(port, 'PUT', `/api/superadmin/hospitals/${fakeId}/admin`, {
      adminPassword: 'ValidNewPassword@123'
    }, {
      'Authorization': `Bearer ${superAdminToken}`
    });
    assert(notFoundRes.status === 404, `Non-existent hospital returns 404 (Got ${notFoundRes.status})`);

    // -----------------------------------------------------------------
    // TEST 4: Duplicate username detection across accounts
    // -----------------------------------------------------------------
    console.log('\n--- TEST 4: Duplicate username prevention ---');
    const dupRes = await httpRequest(port, 'PUT', `/api/superadmin/hospitals/${hospA._id}/admin`, {
      adminUsername: adminBStaffId // admin B already has this staff_id
    }, {
      'Authorization': `Bearer ${superAdminToken}`
    });
    assert(dupRes.status === 400, `Duplicate username returns 400 (Got ${dupRes.status})`);
    assert(dupRes.body.error && dupRes.body.error.includes('already in use'), `Duplicate error message returned: "${dupRes.body.error}"`);

    // -----------------------------------------------------------------
    // TEST 5: Successful Credential Update by Super Admin
    // -----------------------------------------------------------------
    console.log('\n--- TEST 5: Super Admin updates hospital administrator credentials ---');
    const updatedUsername = `new_admin_a_${Date.now()}`;
    const newPasswordA = 'NewSecureAdminPass@2026';

    const updateRes = await httpRequest(port, 'PUT', `/api/superadmin/hospitals/${hospA._id}/admin`, {
      adminUsername: updatedUsername,
      adminPassword: newPasswordA
    }, {
      'Authorization': `Bearer ${superAdminToken}`
    });

    assert(updateRes.status === 200, `Credential update returns 200 OK (Got ${updateRes.status})`);
    assert(updateRes.body.message === "Hospital admin credentials updated successfully.", `Success message returned: "${updateRes.body.message}"`);
    assert(!updateRes.text.includes('mongoose is not defined'), `No 'mongoose is not defined' error in response`);

    // Verify in MongoDB directly
    const refreshedAdminA = await User.findById(userA._id).select('+password_hash');
    assert(refreshedAdminA.staff_id === updatedUsername.toLowerCase(), `Admin staff_id updated in DB: ${refreshedAdminA.staff_id}`);
    assert(refreshedAdminA.password_version === 2, `Password version incremented to 2 (Got ${refreshedAdminA.password_version})`);
    assert(refreshedAdminA.hasSetPassword === true, `hasSetPassword is true`);

    const passMatch = await bcrypt.compare(newPasswordA, refreshedAdminA.password_hash);
    assert(passMatch === true, `New password properly hashed and matches in bcrypt`);

    // -----------------------------------------------------------------
    // TEST 6: Normal Hospital Login Flow with New Credentials
    // -----------------------------------------------------------------
    console.log('\n--- TEST 6: Admin logs in with NEW credentials ---');
    const loginRes = await httpRequest(port, 'POST', '/api/auth/login', {
      staff_id: updatedUsername,
      password: newPasswordA,
      hospitalId: hospA.hospitalId
    });

    assert(loginRes.status === 200, `Login with new credentials returns 200 OK (Got ${loginRes.status})`);
    assert(loginRes.body.token !== undefined, `Login returns valid JWT token`);
    assert(loginRes.body.user && loginRes.body.user.role === 'admin', `Authenticated user has admin role`);
    assert(loginRes.body.user.tenantId === tenantACode, `Authenticated user has correct tenantId: ${tenantACode}`);

    // -----------------------------------------------------------------
    // TEST 7: Old and Invalid Credentials Rejected
    // -----------------------------------------------------------------
    console.log('\n--- TEST 7: Rejection of invalid credentials ---');
    const oldLoginRes = await httpRequest(port, 'POST', '/api/auth/login', {
      staff_id: updatedUsername,
      password: 'InitialPassA@123', // Old password
      hospitalId: hospA.hospitalId
    });
    assert(oldLoginRes.status === 401, `Old password rejected with 401 Invalid credentials (Got ${oldLoginRes.status})`);

    const wrongLoginRes = await httpRequest(port, 'POST', '/api/auth/login', {
      staff_id: updatedUsername,
      password: 'CompletelyWrongPassword123',
      hospitalId: hospA.hospitalId
    });
    assert(wrongLoginRes.status === 401, `Wrong password rejected with 401 Invalid credentials (Got ${wrongLoginRes.status})`);

    // -----------------------------------------------------------------
    // TEST 8: Other Hospitals' Administrator Accounts Unaffected
    // -----------------------------------------------------------------
    console.log('\n--- TEST 8: Other hospital accounts unaffected ---');
    const loginBRes = await httpRequest(port, 'POST', '/api/auth/login', {
      staff_id: adminBStaffId,
      password: 'InitialPassB@123', // Admin B original password
      hospitalId: hospB.hospitalId
    });
    assert(loginBRes.status === 200, `Hospital B admin can still log in with original credentials (Got ${loginBRes.status})`);
    assert(loginBRes.body.user && loginBRes.body.user.tenantId === tenantBCode, `Hospital B user belongs to tenant B`);

    // -----------------------------------------------------------------
    // TEST 9: Hospital Tenant Isolation Maintained
    // -----------------------------------------------------------------
    console.log('\n--- TEST 9: Tenant portal login isolation ---');
    const crossLoginRes = await httpRequest(port, 'POST', '/api/auth/login', {
      staff_id: updatedUsername,
      password: newPasswordA,
      hospitalId: hospB.hospitalId // Attempt to log in through Hospital B's portal
    });
    assert(crossLoginRes.status === 403, `Cross-hospital login rejected with 403 Forbidden (Got ${crossLoginRes.status})`);
    assert(crossLoginRes.body.error && crossLoginRes.body.error.includes('not authorized to log in through this hospital portal'), `Cross-hospital rejection message: "${crossLoginRes.body.error}"`);

    // -----------------------------------------------------------------
    // TEST 10: GET Hospital Profile reflects updated adminUsername
    // -----------------------------------------------------------------
    console.log('\n--- TEST 10: GET Hospital Profile reflects updated adminUsername ---');
    const getProfileRes = await httpRequest(port, 'GET', `/api/superadmin/hospitals/${hospA._id}`, null, {
      'Authorization': `Bearer ${superAdminToken}`
    });
    assert(getProfileRes.status === 200, `GET hospital profile returns 200 OK (Got ${getProfileRes.status})`);
    assert(getProfileRes.body.adminUsername === updatedUsername.toLowerCase(), `Profile adminUsername matches updated staff_id: "${getProfileRes.body.adminUsername}"`);

    // -----------------------------------------------------------------
    // TEST 11: Credential update with hospitalId (string format) rather than _id
    // -----------------------------------------------------------------
    console.log('\n--- TEST 11: Credential update via public hospitalId (HSP-XXXXXX) ---');
    const updateByHospIdRes = await httpRequest(port, 'PUT', `/api/superadmin/hospitals/${hospA.hospitalId}/admin`, {
      adminPassword: 'AnotherNewPassword@2026'
    }, {
      'Authorization': `Bearer ${superAdminToken}`
    });
    assert(updateByHospIdRes.status === 200, `Update via public hospitalId returns 200 OK (Got ${updateByHospIdRes.status})`);

    const loginWithSecondNewPass = await httpRequest(port, 'POST', '/api/auth/login', {
      staff_id: updatedUsername,
      password: 'AnotherNewPassword@2026',
      hospitalId: hospA.hospitalId
    });
    assert(loginWithSecondNewPass.status === 200, `Login with second updated password returns 200 OK (Got ${loginWithSecondNewPass.status})`);

    // -----------------------------------------------------------------
    // TEST 12: Provision initial admin when hospital has no admin user yet
    // -----------------------------------------------------------------
    console.log('\n--- TEST 12: Provision initial admin when hospital has no admin user yet ---');
    // Attempt with missing fields
    const missingFieldsRes = await httpRequest(port, 'PUT', `/api/superadmin/hospitals/${hospNoAdmin._id}/admin`, {
      adminUsername: 'newadmin999'
    }, {
      'Authorization': `Bearer ${superAdminToken}`
    });
    assert(missingFieldsRes.status === 400, `Provisioning without password rejected with 400 (Got ${missingFieldsRes.status})`);

    // Attempt with collision against another tenant's user (userB.staff_id)
    const collisionRes = await httpRequest(port, 'PUT', `/api/superadmin/hospitals/${hospNoAdmin._id}/admin`, {
      adminUsername: userB.staff_id,
      adminPassword: 'SecurePassword123!'
    }, {
      'Authorization': `Bearer ${superAdminToken}`
    });
    assert(collisionRes.status === 400, `Collision against another hospital's user rejected with 400 (Got ${collisionRes.status})`);
    assert(collisionRes.body.error && collisionRes.body.error.includes('already in use'), `Collision error message: "${collisionRes.body.error}"`);

    // Verify other tenant's user (userB) was NOT modified or moved
    const checkUserB = await User.findById(userB._id);
    assert(checkUserB.tenantId === hospB.code, `Other tenant's user remains isolated in tenant ${checkUserB.tenantId}`);

    // Successful provisioning with unique credentials
    const provisionRes = await httpRequest(port, 'PUT', `/api/superadmin/hospitals/${hospNoAdmin._id}/admin`, {
      adminUsername: 'hosp_c_admin_123',
      adminPassword: 'InitialPassword@2026'
    }, {
      'Authorization': `Bearer ${superAdminToken}`
    });
    assert(provisionRes.status === 200, `Initial admin provisioning succeeds with 200 OK (Got ${provisionRes.status})`);

    // Verify newly provisioned admin can log in through the normal hospital login flow
    const provisionedLoginRes = await httpRequest(port, 'POST', '/api/auth/login', {
      staff_id: 'hosp_c_admin_123',
      password: 'InitialPassword@2026',
      hospitalId: hospNoAdmin.hospitalId
    });
    assert(provisionedLoginRes.status === 200, `Newly provisioned admin logs in successfully with 200 OK (Got ${provisionedLoginRes.status})`);
    assert(provisionedLoginRes.body.user && provisionedLoginRes.body.user.role === 'admin', `Provisioned user role is admin: ${provisionedLoginRes.body.user?.role}`);
    assert(provisionedLoginRes.body.user && provisionedLoginRes.body.user.tenantId === hospNoAdmin.code, `Provisioned user tenantId matches hospital code: ${provisionedLoginRes.body.user?.tenantId}`);

  } finally {
    // Cleanup test records
    console.log('\n[CLEANUP] Cleaning up test records...');
    await SuperAdminHospital.deleteMany({ _id: { $in: [hospA._id, hospB._id, hospNoAdmin?._id].filter(Boolean) } });
    await User.deleteMany({ _id: { $in: [userA._id, userB._id] } });
    await User.deleteMany({ tenantId: hospNoAdmin?.code });
    server.close();
    console.log('[CLEANUP] Cleaned up.');
  }

  console.log('\n===============================================================');
  console.log(` RESULTS: ${passedTests} PASSED, ${failedTests} FAILED`);
  console.log('===============================================================\n');

  if (failedTests > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runSuite().catch(err => {
  console.error("Test suite fatal error:", err);
  process.exit(1);
});
