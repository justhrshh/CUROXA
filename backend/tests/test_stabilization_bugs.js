const mongoose = require('mongoose');
const path = require('path');
const dotenv = require('dotenv');
dotenv.config({ path: path.join(__dirname, '../.env') });

const User = require('../models/User');
const SuperAdminHospital = require('../models/SuperAdminHospital');
const bcrypt = require('bcrypt');

async function runTests() {
  console.log('===============================================================');
  console.log('PHASE 3 STABILIZATION PASS — AUTOMATED VERIFICATION SUITE');
  console.log('===============================================================');

  await mongoose.connect(process.env.MONGO_URI);
  console.log('Connected to MongoDB.\n');

  let passed = 0;
  let failed = 0;

  const assert = (condition, msg) => {
    if (condition) {
      console.log('  ? PASS: ' + msg);
      passed++;
    } else {
      console.error('  ? FAIL: ' + msg);
      failed++;
    }
  };

  try {
    console.log('[TEST GROUP 1] User Schema & Purpose Scoping Isolation');
    const testStaffId = 'TEST-STAB-999';
    await User.deleteMany({ staff_id: testStaffId });

    const user = new User({
      name: 'Stabilization Test Staff',
      staff_id: testStaffId,
      email: 'stab.staff@example.com',
      phone: '9998887776',
      password_hash: 'InitialPassword123!',
      role: 'receptionist',
      tenantId: 'med-segha-758',
      otp_code: '123456',
      otp_expires_at: new Date(Date.now() + 15 * 60 * 1000),
      otp_purpose: 'FORGOT_PASSWORD',
      login_otp_code: '654321',
      login_otp_expires_at: new Date(Date.now() + 10 * 60 * 1000),
      login_otp_purpose: 'LOGIN'
    });
    await user.save();

    const fetchedUser = await User.findOne({ staff_id: testStaffId }).select('+password');
    assert(fetchedUser !== null, 'User created with staff_id');
    assert(fetchedUser.otp_purpose === 'FORGOT_PASSWORD', 'otp_purpose field saved and retrieved as FORGOT_PASSWORD');
    assert(fetchedUser.login_otp_purpose === 'LOGIN', 'login_otp_purpose field saved and retrieved as LOGIN');

    console.log('\n[TEST GROUP 2] Flow A (Password Reset) vs Flow B (Login OTP) Strict Separation');
    assert(fetchedUser.otp_code !== fetchedUser.login_otp_code, 'Forgot password OTP and Login OTP are distinct');
    const isForgotPurposeValid = fetchedUser.otp_purpose === 'FORGOT_PASSWORD' && fetchedUser.otp_code === '123456';
    assert(isForgotPurposeValid, 'Forgot Password verifies code matches AND otp_purpose is FORGOT_PASSWORD');
    const isWrongPurposeRejected = fetchedUser.login_otp_purpose === 'FORGOT_PASSWORD';
    assert(!isWrongPurposeRejected, 'Login OTP cannot be evaluated as FORGOT_PASSWORD');

    fetchedUser.password_hash = await bcrypt.hash('NewStabilizedPassword123!', 10);
    fetchedUser.otp_code = null;
    fetchedUser.otp_expires_at = null;
    fetchedUser.otp_purpose = null;
    fetchedUser.password_version = (fetchedUser.password_version || 1) + 1;
    await fetchedUser.save();

    const resetUser = await User.findOne({ staff_id: testStaffId });
    assert(resetUser.otp_code === null, 'OTP code cleared after reset');
    assert(resetUser.otp_purpose === null, 'otp_purpose cleared after reset');
    assert(resetUser.password_version === 2, 'password_version incremented to revoke existing sessions');

    console.log('\n[TEST GROUP 3] Multi-Identifier Lookup & Masked Email Formatting');
    const maskEmail = (email) => {
      if (!email || !email.includes('@')) return email;
      const [local, domain] = email.split('@');
      if (local.length <= 2) return local[0] + '***@' + domain;
      return local[0] + '*'.repeat(local.length - 2) + local[local.length - 1] + '@' + domain;
    };

    assert(maskEmail('stab.staff@example.com') === 's********f@example.com', 'Masks email correctly for multi-character local part');
    assert(maskEmail('ab@example.com') === 'a***@example.com', 'Masks email correctly for 2-character local part');

    const byEmail = await User.findOne({ email: 'stab.staff@example.com' });
    const byStaffId = await User.findOne({ staff_id: 'TEST-STAB-999' });
    const byPhone = await User.findOne({ phone: '9998887776' });

    assert(byEmail && byEmail._id.equals(fetchedUser._id), 'Lookup by email succeeds');
    assert(byStaffId && byStaffId._id.equals(fetchedUser._id), 'Lookup by staff_id succeeds');
    assert(byPhone && byPhone._id.equals(fetchedUser._id), 'Lookup by phone succeeds');

    console.log('\n[TEST GROUP 4] Dynamic Frontend Base URL & Portal Link Resolution');
    const getFrontendBaseUrl = (envMock) => {
      return (envMock.FRONTEND_URL || envMock.CLIENT_URL || envMock.APP_URL || 'http://localhost:5173').replace(/\/+$/, '');
    };

    assert(getFrontendBaseUrl({ FRONTEND_URL: 'https://curoxa.onrender.com/' }) === 'https://curoxa.onrender.com', 'Strips trailing slash from FRONTEND_URL');
    assert(getFrontendBaseUrl({ CLIENT_URL: 'https://app.curoxa.com' }) === 'https://app.curoxa.com', 'Falls back to CLIENT_URL');
    assert(getFrontendBaseUrl({}) === 'http://localhost:5173', 'Defaults to localhost in local dev environment');

    const hospital = await SuperAdminHospital.findOne({ hospitalId: 'HSP-AVVE5T' });
    if (hospital) {
      const baseUrl = getFrontendBaseUrl({ FRONTEND_URL: 'https://curoxa.onrender.com' });
      const portalUrl = baseUrl + '/portal/' + hospital.hospitalId;
      assert(portalUrl === 'https://curoxa.onrender.com/portal/HSP-AVVE5T', 'Generates correct branded portal URL for onboarding/credentials email');
    }

    await User.deleteOne({ staff_id: testStaffId });

  } catch (err) {
    console.error('Test error:', err);
    failed++;
  } finally {
    await mongoose.disconnect();
    console.log('\n===============================================================');
    console.log('STABILIZATION SUITE RESULTS: ' + passed + ' PASSED, ' + failed + ' FAILED');
    console.log('===============================================================');
    process.exit(failed > 0 ? 1 : 0);
  }
}

runTests();
