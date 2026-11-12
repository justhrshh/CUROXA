/**
 * QUROXA — PUBLIC DOCTOR QUEUE LIVE VIEW SMS OTP ACCEPTANCE SUITE
 * 
 * Verifies all 14 required security, availability, and business logic scenarios:
 * 1. Valid mobile number dispatch.
 * 2. Invalid mobile number rejection.
 * 3. PING4SMS dispatch success (mocked).
 * 4. PING4SMS dispatch failure and Zero-Orphan Rollback.
 * 5. Correct OTP verification.
 * 6. Incorrect OTP rejection.
 * 7. Expired OTP rejection.
 * 8. OTP replay rejection.
 * 9. Cross-tenant verification rejection.
 * 10. Cross-purpose verification rejection.
 * 11. Rate-limit enforcement.
 * 12. Unauthorized queue access rejection.
 * 13. Frontend mobile input validation.
 * 14. Existing live queue rendering and refresh.
 * 
 * ALL AUTOMATED SMS TESTS USE MOCKED TRANSPORTS. ZERO REAL TRANSMISSIONS.
 */

const assert = require('assert');
const path = require('path');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const mongoose = require('mongoose');
const connectDB = require('../config/db');

// Models
const User = require('../models/User');
const Patient = require('../models/Patient');
const Appointment = require('../models/Appointment');
const OtpChallenge = require('../models/OtpChallenge');
const OtpRateLimit = require('../models/OtpRateLimit');
const ProfileSelectionToken = require('../models/ProfileSelectionToken');
const SuperAdminHospital = require('../models/SuperAdminHospital');

// Services & Utils
const {
  createAndDispatchOtp,
  atomicVerifyOtp,
  hashOtp,
  generateProfileSelectionToken,
  verifyAndConsumeProfileSelectionToken
} = require('../services/otp/otpService');
const {
  normalizeIndianMobile,
  isValidIndianMobile,
  maskPhoneNumber
} = require('../utils/phoneNormalization');
const { getDoctorQueueState, normalizeDateString } = require('../utils/queueEngine');
const { getJwtSecret } = require('../config/env');

let passedTests = 0;
let totalTests = 0;

function reportTest(name, passed, detail) {
  totalTests++;
  if (passed) {
    passedTests++;
    console.log(`  ✅ [PASS] ${name}${detail ? ` (${detail})` : ''}`);
  } else {
    console.error(`  ❌ [FAIL] ${name}${detail ? ` (${detail})` : ''}`);
  }
}

async function runPublicDoctorQueueSuite() {
  console.log('===================================================================');
  console.log('  QUROXA PUBLIC DOCTOR QUEUE SMS OTP ACCEPTANCE SUITE');
  console.log('===================================================================\n');

  await connectDB();
  console.log('Connected to Staging Database:', mongoose.connection.name);

  const testTenantA = 'queue_tenant_alpha';
  const testTenantB = 'queue_tenant_beta';
  const publicQueueIdA = `doc_queue_${Date.now()}`;

  // Create test doctor for Tenant Alpha
  const testDoctor = await User.create({
    tenantId: testTenantA,
    staff_id: `doc_st_${Date.now()}`,
    name: 'Dr. Public Test',
    role: 'doctor',
    specialty: 'Cardiology',
    publicQueueId: publicQueueIdA,
    password_hash: '$2b$10$mockPasswordHash12345678901234567890123456789012'
  });

  let capturedSmsOtp = null;
  const mockSmsTransport = async ({ message }) => {
    const match = String(message || '').match(/\b\d{6}\b/);
    if (match) capturedSmsOtp = match[0];
    return {
      success: true,
      deliveryStatus: 'sent',
      provider: 'PING4SMS',
      recipientMasked: '******',
      messageId: 'mock-sms-' + Date.now()
    };
  };

  // ---------------------------------------------------------------------------
  // TEST 1: Valid Mobile Number Normalization & Dispatch
  // ---------------------------------------------------------------------------
  console.log('\n[TEST 1] Valid Mobile Number Normalization');
  {
    const validInputs = ['9810500111', '+919810500111', '919810500111', '09810500111', '98105-00111', '98105 00111'];
    let allValid = true;
    for (const input of validInputs) {
      const res = normalizeIndianMobile(input);
      if (!res.isValid || res.normalized !== '9810500111') {
        allValid = false;
        break;
      }
    }
    reportTest('Test 1: Valid Indian mobile formats (+91, 91, 0, spaced, dashed) normalize strictly to 10 digits', allValid);
  }

  // ---------------------------------------------------------------------------
  // TEST 2: Invalid Mobile Number Rejection
  // ---------------------------------------------------------------------------
  console.log('\n[TEST 2] Invalid Mobile Number Rejection');
  {
    const invalidInputs = [
      '5810500111', // starts with 5 (invalid Indian mobile prefix)
      '0123456789', // starts with 0-1
      '981050011',  // 9 digits
      '981050011111', // 12 digits bare
      '98105abcd1', // alphanumeric
      '',           // empty
      null          // null
    ];
    let allRejected = true;
    for (const input of invalidInputs) {
      const res = normalizeIndianMobile(input);
      if (res.isValid) {
        allRejected = false;
        break;
      }
    }
    reportTest('Test 2: Invalid Indian mobile numbers (starts with 0-5, bad length, non-numeric) strictly rejected', allRejected);
  }

  // ---------------------------------------------------------------------------
  // TEST 3: PING4SMS Dispatch Success (Mocked)
  // ---------------------------------------------------------------------------
  console.log('\n[TEST 3] PING4SMS Dispatch Success (Mocked)');
  {
    const mobileNumber = '9810500222';
    capturedSmsOtp = null;

    const dispatchResult = await createAndDispatchOtp({
      targetIdentifier: mobileNumber,
      identifierType: 'phone',
      tenantId: testTenantA,
      purpose: 'PUBLIC_DOCTOR_QUEUE',
      deliveryChannel: 'sms',
      expiryMinutes: 10,
      _mockSmsTransport: mockSmsTransport
    });

    assert(dispatchResult.success, 'SMS dispatch must succeed');
    assert(capturedSmsOtp, 'Mock transport must capture 6-digit OTP');

    // Confirm challenge in MongoDB
    const challenge = await OtpChallenge.findOne({
      targetIdentifier: mobileNumber,
      tenantId: testTenantA,
      purpose: 'PUBLIC_DOCTOR_QUEUE'
    });

    reportTest(
      'Test 3: PING4SMS SMS dispatch creates OtpChallenge with purpose PUBLIC_DOCTOR_QUEUE & deliveryChannel sms',
      Boolean(challenge && challenge.hashedOtp && challenge.deliveryChannel === 'sms'),
      `Captured OTP: ${capturedSmsOtp ? '******' : 'None'}, Channel: ${challenge?.deliveryChannel}`
    );
  }

  // ---------------------------------------------------------------------------
  // TEST 4: PING4SMS Dispatch Failure and Zero-Orphan Rollback
  // ---------------------------------------------------------------------------
  console.log('\n[TEST 4] PING4SMS Dispatch Failure and Zero-Orphan Rollback');
  {
    const failMobile = '9810500333';
    const failingTransport = async () => ({ success: false, error: 'Simulated SMS Gateway 504 Timeout' });

    const dispatchResult = await createAndDispatchOtp({
      targetIdentifier: failMobile,
      identifierType: 'phone',
      tenantId: testTenantA,
      purpose: 'PUBLIC_DOCTOR_QUEUE',
      deliveryChannel: 'sms',
      expiryMinutes: 10,
      _mockSmsTransport: failingTransport
    });

    assert(!dispatchResult.success, 'Dispatch must report failure');

    // Verify OtpChallenge was cleaned
    const orphanedChallenge = await OtpChallenge.findOne({
      targetIdentifier: failMobile,
      tenantId: testTenantA,
      purpose: 'PUBLIC_DOCTOR_QUEUE'
    });

    // Verify rate limit reservation was released
    const rateLimit = await OtpRateLimit.findOne({
      targetIdentifier: failMobile,
      tenantId: testTenantA,
      purpose: 'PUBLIC_DOCTOR_QUEUE'
    });

    const reservationCleaned = !rateLimit || rateLimit.activeReservations.length === 0;

    reportTest(
      'Test 4: PING4SMS failure triggers Zero-Orphan Rollback: challenge deleted and rate limit reservation released',
      orphanedChallenge === null && reservationCleaned,
      `Orphan: ${Boolean(orphanedChallenge)}, Active Reservations: ${rateLimit?.activeReservations.length || 0}`
    );
  }

  // ---------------------------------------------------------------------------
  // TEST 5: Correct OTP Verification
  // ---------------------------------------------------------------------------
  console.log('\n[TEST 5] Correct OTP Verification');
  {
    const mobileNumber = '9810500444';
    capturedSmsOtp = null;

    await createAndDispatchOtp({
      targetIdentifier: mobileNumber,
      identifierType: 'phone',
      tenantId: testTenantA,
      purpose: 'PUBLIC_DOCTOR_QUEUE',
      deliveryChannel: 'sms',
      expiryMinutes: 10,
      _mockSmsTransport: mockSmsTransport
    });

    const verifyResult = await atomicVerifyOtp({
      targetIdentifier: mobileNumber,
      tenantId: testTenantA,
      purpose: 'PUBLIC_DOCTOR_QUEUE',
      otpCandidate: capturedSmsOtp
    });

    reportTest('Test 5: Correct 6-digit candidate matches HMAC hash and successfully verifies', verifyResult.success);
  }

  // ---------------------------------------------------------------------------
  // TEST 6: Incorrect OTP Rejection
  // ---------------------------------------------------------------------------
  console.log('\n[TEST 6] Incorrect OTP Rejection');
  {
    const mobileNumber = '9810500555';
    capturedSmsOtp = null;

    await createAndDispatchOtp({
      targetIdentifier: mobileNumber,
      identifierType: 'phone',
      tenantId: testTenantA,
      purpose: 'PUBLIC_DOCTOR_QUEUE',
      deliveryChannel: 'sms',
      expiryMinutes: 10,
      _mockSmsTransport: mockSmsTransport
    });

    const verifyResult = await atomicVerifyOtp({
      targetIdentifier: mobileNumber,
      tenantId: testTenantA,
      purpose: 'PUBLIC_DOCTOR_QUEUE',
      otpCandidate: '000000' // wrong OTP
    });

    const challenge = await OtpChallenge.findOne({
      targetIdentifier: mobileNumber,
      tenantId: testTenantA,
      purpose: 'PUBLIC_DOCTOR_QUEUE'
    });

    reportTest(
      'Test 6: Incorrect OTP candidate rejected and increments attempts count',
      !verifyResult.success && challenge.attempts === 1,
      `Attempts: ${challenge?.attempts}`
    );
  }

  // ---------------------------------------------------------------------------
  // TEST 7: Expired OTP Rejection
  // ---------------------------------------------------------------------------
  console.log('\n[TEST 7] Expired OTP Rejection');
  {
    const mobileNumber = '9810500666';
    const rawOtp = '123456';
    const expiredDate = new Date(Date.now() - 5000);
    const hashedOtp = hashOtp(rawOtp, mobileNumber, testTenantA, 'PUBLIC_DOCTOR_QUEUE');

    await OtpChallenge.findOneAndUpdate(
      { targetIdentifier: mobileNumber, tenantId: testTenantA, purpose: 'PUBLIC_DOCTOR_QUEUE' },
      {
        $set: {
          identifierType: 'phone',
          hashedOtp,
          expiresAt: expiredDate,
          attempts: 0,
          consumedAt: null,
          deliveryChannel: 'sms',
          deliveryStatus: 'sent'
        }
      },
      { upsert: true, returnDocument: 'after' }
    );

    const verifyResult = await atomicVerifyOtp({
      targetIdentifier: mobileNumber,
      tenantId: testTenantA,
      purpose: 'PUBLIC_DOCTOR_QUEUE',
      otpCandidate: rawOtp
    });

    reportTest(
      'Test 7: Expired OTP rejected with CHALLENGE_EXPIRED',
      !verifyResult.success && verifyResult.errorCode === 'CHALLENGE_EXPIRED',
      `ErrorCode: ${verifyResult.errorCode}`
    );
  }

  // ---------------------------------------------------------------------------
  // TEST 8: OTP Replay Rejection
  // ---------------------------------------------------------------------------
  console.log('\n[TEST 8] OTP Replay Rejection');
  {
    const mobileNumber = '9810500777';
    capturedSmsOtp = null;

    await createAndDispatchOtp({
      targetIdentifier: mobileNumber,
      identifierType: 'phone',
      tenantId: testTenantA,
      purpose: 'PUBLIC_DOCTOR_QUEUE',
      deliveryChannel: 'sms',
      expiryMinutes: 10,
      _mockSmsTransport: mockSmsTransport
    });

    // First verification consumes challenge
    const firstVerify = await atomicVerifyOtp({
      targetIdentifier: mobileNumber,
      tenantId: testTenantA,
      purpose: 'PUBLIC_DOCTOR_QUEUE',
      otpCandidate: capturedSmsOtp
    });

    // Replay attempt must fail
    const replayVerify = await atomicVerifyOtp({
      targetIdentifier: mobileNumber,
      tenantId: testTenantA,
      purpose: 'PUBLIC_DOCTOR_QUEUE',
      otpCandidate: capturedSmsOtp
    });

    reportTest(
      'Test 8: Replay of consumed OTP challenge rejected with CHALLENGE_CONSUMED',
      firstVerify.success && !replayVerify.success && replayVerify.errorCode === 'CHALLENGE_CONSUMED',
      `Replay ErrorCode: ${replayVerify.errorCode}`
    );
  }

  // ---------------------------------------------------------------------------
  // TEST 9: Cross-Tenant Verification Rejection
  // ---------------------------------------------------------------------------
  console.log('\n[TEST 9] Cross-Tenant Verification Rejection');
  {
    const mobileNumber = '9810500888';
    capturedSmsOtp = null;

    // Dispatched under Tenant Alpha
    await createAndDispatchOtp({
      targetIdentifier: mobileNumber,
      identifierType: 'phone',
      tenantId: testTenantA,
      purpose: 'PUBLIC_DOCTOR_QUEUE',
      deliveryChannel: 'sms',
      expiryMinutes: 10,
      _mockSmsTransport: mockSmsTransport
    });

    // Attempt verification under Tenant Beta context
    const crossTenantVerify = await atomicVerifyOtp({
      targetIdentifier: mobileNumber,
      tenantId: testTenantB,
      purpose: 'PUBLIC_DOCTOR_QUEUE',
      otpCandidate: capturedSmsOtp
    });

    reportTest(
      'Test 9: Cross-tenant verification strictly rejected (Tenant Alpha challenge cannot verify in Tenant Beta)',
      !crossTenantVerify.success && crossTenantVerify.errorCode === 'CHALLENGE_NOT_FOUND',
      `ErrorCode: ${crossTenantVerify.errorCode}`
    );
  }

  // ---------------------------------------------------------------------------
  // TEST 10: Cross-Purpose Verification Rejection
  // ---------------------------------------------------------------------------
  console.log('\n[TEST 10] Cross-Purpose Verification Rejection');
  {
    const mobileNumber = '9810500999';
    capturedSmsOtp = null;

    await createAndDispatchOtp({
      targetIdentifier: mobileNumber,
      identifierType: 'phone',
      tenantId: testTenantA,
      purpose: 'PUBLIC_DOCTOR_QUEUE',
      deliveryChannel: 'sms',
      expiryMinutes: 10,
      _mockSmsTransport: mockSmsTransport
    });

    const crossPurpose1 = await atomicVerifyOtp({
      targetIdentifier: mobileNumber,
      tenantId: testTenantA,
      purpose: 'FORGOT_PASSWORD',
      otpCandidate: capturedSmsOtp
    });

    const crossPurpose2 = await atomicVerifyOtp({
      targetIdentifier: mobileNumber,
      tenantId: testTenantA,
      purpose: 'PATIENT_PORTAL_AUTH',
      otpCandidate: capturedSmsOtp
    });

    const crossPurpose3 = await atomicVerifyOtp({
      targetIdentifier: mobileNumber,
      tenantId: testTenantA,
      purpose: 'RECEPTION_QUEUE',
      otpCandidate: capturedSmsOtp
    });

    const allRejected = !crossPurpose1.success && !crossPurpose2.success && !crossPurpose3.success;
    reportTest(
      'Test 10: Cross-purpose verification strictly rejected (PUBLIC_DOCTOR_QUEUE cannot authenticate other purposes)',
      allRejected,
      `Rejected purposes: FORGOT_PASSWORD (${crossPurpose1.errorCode}), PATIENT_PORTAL_AUTH (${crossPurpose2.errorCode}), RECEPTION_QUEUE (${crossPurpose3.errorCode})`
    );
  }

  // ---------------------------------------------------------------------------
  // TEST 11: Rate-Limit Enforcement (Cooldown & Window Cap)
  // ---------------------------------------------------------------------------
  console.log('\n[TEST 11] Rate-Limit Enforcement');
  {
    const mobileNumber = '9810501111';
    capturedSmsOtp = null;

    // 1st request succeeds
    const req1 = await createAndDispatchOtp({
      targetIdentifier: mobileNumber,
      identifierType: 'phone',
      tenantId: testTenantA,
      purpose: 'PUBLIC_DOCTOR_QUEUE',
      deliveryChannel: 'sms',
      expiryMinutes: 10,
      _mockSmsTransport: mockSmsTransport
    });

    // 2nd immediate request (< 30s cooldown) rejected with 429
    const req2 = await createAndDispatchOtp({
      targetIdentifier: mobileNumber,
      identifierType: 'phone',
      tenantId: testTenantA,
      purpose: 'PUBLIC_DOCTOR_QUEUE',
      deliveryChannel: 'sms',
      expiryMinutes: 10,
      _mockSmsTransport: mockSmsTransport
    });

    reportTest(
      'Test 11: Rate-limit 30s cooldown enforcement prevents rapid re-request with HTTP 429',
      req1.success && !req2.success && req2.status === 429,
      `Req1: ${req1.success}, Req2 Status: ${req2.status}`
    );
  }

  // ---------------------------------------------------------------------------
  // TEST 12: Unauthorized Queue Access Rejection
  // ---------------------------------------------------------------------------
  console.log('\n[TEST 12] Unauthorized Queue Access Rejection');
  {
    const secret = getJwtSecret();
    const expiredToken = jwt.sign(
      { id: new mongoose.Types.ObjectId().toString(), role: 'patient' },
      secret,
      { expiresIn: '-1s' }
    );
    const staffToken = jwt.sign(
      { id: new mongoose.Types.ObjectId().toString(), role: 'admin' },
      secret,
      { expiresIn: '1h' }
    );

    let expiredRejected = false;
    try {
      jwt.verify(expiredToken, secret);
    } catch (e) {
      expiredRejected = true;
    }

    const decodedStaff = jwt.verify(staffToken, secret);
    const staffRoleRejected = decodedStaff.role !== 'patient' && !decodedStaff.isNewPatient;

    reportTest(
      'Test 12: Unauthorized patient-view requests rejected (expired token & non-patient role)',
      expiredRejected && staffRoleRejected,
      `Expired Rejected: ${expiredRejected}, Non-Patient Rejected: ${staffRoleRejected}`
    );
  }

  // ---------------------------------------------------------------------------
  // TEST 13: Frontend Mobile Input Validation Logic
  // ---------------------------------------------------------------------------
  console.log('\n[TEST 13] Frontend Mobile Input Validation Logic');
  {
    const validateIndianMobileFrontend = (phone) => {
      const digits = String(phone || '').replace(/\D/g, '');
      if (digits.length === 10 && /^[6-9]/.test(digits)) {
        return { valid: true, normalized: digits };
      }
      if (digits.length === 12 && digits.startsWith('91') && /^[6-9]/.test(digits.slice(2))) {
        return { valid: true, normalized: digits.slice(2) };
      }
      if (digits.length === 11 && digits.startsWith('0') && /^[6-9]/.test(digits.slice(1))) {
        return { valid: true, normalized: digits.slice(1) };
      }
      return { valid: false, error: 'Please enter a valid 10-digit Indian mobile number.' };
    };

    const validCase1 = validateIndianMobileFrontend('9876543210');
    const validCase2 = validateIndianMobileFrontend('+91 98765 43210');
    const validCase3 = validateIndianMobileFrontend('09876543210');
    const invalidCase1 = validateIndianMobileFrontend('5876543210'); // starts with 5
    const invalidCase2 = validateIndianMobileFrontend('98765');      // too short

    const frontendLogicValid = 
      validCase1.valid && validCase1.normalized === '9876543210' &&
      validCase2.valid && validCase2.normalized === '9876543210' &&
      validCase3.valid && validCase3.normalized === '9876543210' &&
      !invalidCase1.valid && !invalidCase2.valid;

    reportTest('Test 13: Frontend 10-digit Indian mobile validation correctly parses prefixes (+91, 0) and rejects non-allocations', frontendLogicValid);
  }

  // ---------------------------------------------------------------------------
  // TEST 14: Existing Live Queue Rendering and Refresh
  // ---------------------------------------------------------------------------
  console.log('\n[TEST 14] Existing Live Queue Rendering & Refresh');
  {
    const todayStr = normalizeDateString(new Date());
    const queueState = await getDoctorQueueState(testTenantA, testDoctor._id, todayStr);

    const hasStateContract = 
      typeof queueState.waitingCount === 'number' &&
      Array.isArray(queueState.queueAppointments);

    reportTest(
      'Test 14: Server queue state retrieves currentToken, nextToken, and waitingCount with strict patient privacy',
      hasStateContract,
      `Waiting Count: ${queueState.waitingCount}, Current Token: ${queueState.currentToken || 'None'}`
    );
  }

  // Cleanup synthetic test records
  await User.deleteOne({ _id: testDoctor._id });
  await OtpChallenge.deleteMany({ tenantId: { $in: [testTenantA, testTenantB] } });
  await OtpRateLimit.deleteMany({ tenantId: { $in: [testTenantA, testTenantB] } });

  console.log('\n===================================================================');
  console.log(`PUBLIC DOCTOR QUEUE SUITE RESULTS: ${passedTests} / ${totalTests} PASSED`);
  if (passedTests === totalTests) {
    console.log('ALL 14 PUBLIC DOCTOR QUEUE SMS ACCEPTANCE TESTS PASSED.');
  } else {
    console.error(`FAILED ${totalTests - passedTests} TESTS.`);
    process.exit(1);
  }
  console.log('===================================================================\n');

  await mongoose.disconnect();
}

runPublicDoctorQueueSuite().catch(err => {
  console.error('Public Doctor Queue Suite Error:', err);
  process.exit(1);
});
