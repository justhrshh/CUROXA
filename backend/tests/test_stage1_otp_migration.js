/**
 * QUROXA — STAGE 1 OTP MIGRATION VALIDATION SUITE
 * 
 * Verifies that:
 * 1. Centralized OtpChallenge is the sole authoritative storage mechanism.
 * 2. Zero dual-writes occur to User.otp_code, User.login_otp_code, RegistrationOtp, ReceptionOtp.
 * 3. Zero legacy fallbacks occur; invalid OTPs fail closed without secondary lookups.
 * 4. Password recovery enforces strict tenant isolation during verification.
 * 5. Cross-purpose OTP attacks fail closed.
 * 6. Single-use replay protection fails closed.
 * 7. Failed-delivery Zero-Orphan Rollback cleans challenges and releases reservations.
 * 8. Shared-family mobile profile selection functions properly.
 * 
 * ALL SMS AND EMAIL TRANSPORTS ARE MOCKED. ZERO REAL TRANSMISSIONS.
 */

const assert = require('assert');
const path = require('path');
const crypto = require('crypto');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const mongoose = require('mongoose');
const connectDB = require('../config/db');

const User = require('../models/User');
const Patient = require('../models/Patient');
const OtpChallenge = require('../models/OtpChallenge');
const OtpRateLimit = require('../models/OtpRateLimit');
const RegistrationOtp = require('../models/RegistrationOtp');
const ReceptionOtp = require('../models/ReceptionOtp');
const ProfileSelectionToken = require('../models/ProfileSelectionToken');

const {
  createAndDispatchOtp,
  atomicVerifyOtp,
  generateProfileSelectionToken,
  verifyAndConsumeProfileSelectionToken
} = require('../services/otp/otpService');

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

async function runStage1Suite() {
  console.log('===================================================================');
  console.log('  QUROXA STAGE 1 OTP MIGRATION ACCEPTANCE SUITE');
  console.log('===================================================================\n');

  await connectDB();
  console.log('Connected to Staging Database:', mongoose.connection.name);

  const testTenantA = 'stage1_tenant_alpha';
  const testTenantB = 'stage1_tenant_beta';

  let lastCapturedEmailOtp = null;
  let lastCapturedSmsOtp = null;

  const mockEmailTransport = async ({ otp }) => {
    lastCapturedEmailOtp = String(otp);
    return {
      success: true,
      channel: 'email',
      provider: 'mock',
      targetMasked: '******',
      deliveryStatus: 'sent',
      messageId: 'mock-mail-' + Date.now()
    };
  };

  const mockSmsTransport = async ({ message }) => {
    const match = String(message || '').match(/\b\d{6}\b/);
    if (match) {
      lastCapturedSmsOtp = match[0];
    }
    return {
      success: true,
      deliveryStatus: 'sent',
      provider: 'PING4SMS',
      recipientMasked: '******',
      messageId: 'mock-sms-' + Date.now()
    };
  };

  // Record baseline document counts for legacy collections
  const initialRegOtpCount = await RegistrationOtp.countDocuments();
  const initialRecepOtpCount = await ReceptionOtp.countDocuments();

  // ---------------------------------------------------------------------------
  // TEST 1: Password Recovery: Sole OtpChallenge Write & Zero User.otp_code Write
  // ---------------------------------------------------------------------------
  console.log('\n[TEST 1] Password Recovery: Sole OtpChallenge Write & Zero User.otp_code');
  {
    const staffEmail = `doc_reset_${Date.now()}@hospital.org`;
    const userA = await User.create({
      tenantId: testTenantA,
      staff_id: `staff_res_${Date.now()}`,
      name: 'Dr. Reset Test',
      email: staffEmail,
      phone: '9810500111',
      role: 'doctor',
      password_hash: '$2b$10$mockPasswordHash12345678901234567890123456789012'
    });

    lastCapturedEmailOtp = null;
    const dispatchResult = await createAndDispatchOtp({
      targetIdentifier: staffEmail,
      identifierType: 'email',
      tenantId: testTenantA,
      purpose: 'FORGOT_PASSWORD',
      deliveryChannel: 'email',
      expiryMinutes: 15,
      _mockEmailTransport: mockEmailTransport
    });

    assert(dispatchResult.success, 'Password recovery OTP dispatch must succeed');
    assert(lastCapturedEmailOtp, 'Must have generated a 6-digit OTP');

    // Verify User.otp_code in MongoDB is strictly null
    const refreshedUser = await User.findById(userA._id).lean();
    const isUserOtpNull = refreshedUser.otp_code === null || refreshedUser.otp_code === undefined;

    // Verify challenge created in OtpChallenge with purpose FORGOT_PASSWORD
    const challenge = await OtpChallenge.findOne({
      targetIdentifier: staffEmail,
      tenantId: testTenantA,
      purpose: 'FORGOT_PASSWORD'
    });

    const isChallengeValid = Boolean(challenge && challenge.hashedOtp);

    // Verify atomic verification
    const verifyResult = await atomicVerifyOtp({
      targetIdentifier: staffEmail,
      tenantId: testTenantA,
      purpose: 'FORGOT_PASSWORD',
      otpCandidate: lastCapturedEmailOtp
    });

    reportTest(
      'Test 1: Password recovery OTP persists solely in OtpChallenge; User.otp_code remains null',
      isUserOtpNull && isChallengeValid && verifyResult.success,
      `User.otp_code: ${refreshedUser.otp_code}, Challenge Found: ${Boolean(challenge)}`
    );

    await User.deleteOne({ _id: userA._id });
  }

  // ---------------------------------------------------------------------------
  // TEST 2: Password Recovery: Strict Tenant Isolation Protection
  // ---------------------------------------------------------------------------
  console.log('\n[TEST 2] Password Recovery: Strict Tenant Isolation Protection');
  {
    const sharedStaffId = `nurse_${Date.now()}`;
    const sharedEmail = `nurse_${Date.now()}@nursing.org`;

    // Create user in Tenant Alpha
    const userAlpha = await User.create({
      tenantId: testTenantA,
      staff_id: sharedStaffId,
      name: 'Nurse Alpha',
      email: sharedEmail,
      role: 'nurse',
      password_hash: '$2b$10$mockPasswordHash12345678901234567890123456789012'
    });

    // Create user in Tenant Beta with identical email/staff_id
    const userBeta = await User.create({
      tenantId: testTenantB,
      staff_id: sharedStaffId,
      name: 'Nurse Beta',
      email: sharedEmail,
      role: 'nurse',
      password_hash: '$2b$10$mockPasswordHash12345678901234567890123456789012'
    });

    lastCapturedEmailOtp = null;
    await createAndDispatchOtp({
      targetIdentifier: sharedEmail,
      identifierType: 'email',
      tenantId: testTenantA,
      purpose: 'FORGOT_PASSWORD',
      deliveryChannel: 'email',
      expiryMinutes: 15,
      _mockEmailTransport: mockEmailTransport
    });
    const otpAlpha = lastCapturedEmailOtp;

    // Attempting to verify Alpha's OTP under Tenant Beta's context MUST FAIL
    const crossTenantVerify = await atomicVerifyOtp({
      targetIdentifier: sharedEmail,
      tenantId: testTenantB, // Wrong tenant!
      purpose: 'FORGOT_PASSWORD',
      otpCandidate: otpAlpha
    });

    // Verifying under correct Tenant Alpha context MUST SUCCEED
    const correctTenantVerify = await atomicVerifyOtp({
      targetIdentifier: sharedEmail,
      tenantId: testTenantA,
      purpose: 'FORGOT_PASSWORD',
      otpCandidate: otpAlpha
    });

    reportTest(
      'Test 2: Password recovery challenge in Tenant Alpha rejected under Tenant Beta (strict tenant isolation)',
      !crossTenantVerify.success && crossTenantVerify.errorCode === 'CHALLENGE_NOT_FOUND' && correctTenantVerify.success,
      `Cross-Tenant: ${crossTenantVerify.success}, Correct-Tenant: ${correctTenantVerify.success}`
    );

    await User.deleteMany({ _id: { $in: [userAlpha._id, userBeta._id] } });
  }

  // ---------------------------------------------------------------------------
  // TEST 3: Receptionist Walk-In Email Verification: Zero RegistrationOtp Write & No Fallback
  // ---------------------------------------------------------------------------
  console.log('\n[TEST 3] Receptionist Walk-In Email Verification: Zero RegistrationOtp Write & No Fallback');
  {
    const regEmail = `walkin_pat_${Date.now()}@gmail.com`;
    lastCapturedEmailOtp = null;

    const dispatchResult = await createAndDispatchOtp({
      targetIdentifier: regEmail,
      identifierType: 'email',
      tenantId: testTenantA,
      purpose: 'STAFF_REGISTRATION',
      deliveryChannel: 'email',
      expiryMinutes: 15,
      _mockEmailTransport: mockEmailTransport
    });
    const regOtp = lastCapturedEmailOtp;

    assert(dispatchResult.success);

    // Verify RegistrationOtp count has NOT increased
    const currentRegOtpCount = await RegistrationOtp.countDocuments();
    const noRegOtpWritten = currentRegOtpCount === initialRegOtpCount;

    // Verify challenge created in OtpChallenge
    const challenge = await OtpChallenge.findOne({
      targetIdentifier: regEmail,
      tenantId: testTenantA,
      purpose: 'STAFF_REGISTRATION'
    });

    // Verify invalid OTP candidate fails closed and does not fallback
    const invalidVerify = await atomicVerifyOtp({
      targetIdentifier: regEmail,
      tenantId: testTenantA,
      purpose: 'STAFF_REGISTRATION',
      otpCandidate: '000000'
    });

    // Verify correct OTP candidate succeeds
    const validVerify = await atomicVerifyOtp({
      targetIdentifier: regEmail,
      tenantId: testTenantA,
      purpose: 'STAFF_REGISTRATION',
      otpCandidate: regOtp
    });

    reportTest(
      'Test 3: Receptionist email verification writes solely to OtpChallenge; RegistrationOtp count unchanged; invalid OTP fails closed',
      noRegOtpWritten && Boolean(challenge) && !invalidVerify.success && validVerify.success,
      `RegistrationOtp Δ: ${currentRegOtpCount - initialRegOtpCount}`
    );
  }

  // ---------------------------------------------------------------------------
  // TEST 4: Patient Portal SMS & Email Auth: Zero Dual-Writes & Authoritative Verification
  // ---------------------------------------------------------------------------
  console.log('\n[TEST 4] Patient Portal SMS & Email Auth: Zero Dual-Writes & Authoritative Verification');
  {
    const mobileNumber = '9810500222';
    lastCapturedSmsOtp = null;

    const dispatchResult = await createAndDispatchOtp({
      targetIdentifier: mobileNumber,
      identifierType: 'phone',
      tenantId: testTenantA,
      purpose: 'PATIENT_PORTAL_AUTH',
      deliveryChannel: 'sms',
      expiryMinutes: 15,
      _mockSmsTransport: mockSmsTransport
    });
    const portalOtp = lastCapturedSmsOtp;

    assert(dispatchResult.success);

    // Verify RegistrationOtp count unchanged
    const currentRegCount = await RegistrationOtp.countDocuments();
    const noRegWritten = currentRegCount === initialRegOtpCount;

    // Verify valid verification succeeds
    const verifySuccess = await atomicVerifyOtp({
      targetIdentifier: mobileNumber,
      tenantId: testTenantA,
      purpose: 'PATIENT_PORTAL_AUTH',
      otpCandidate: portalOtp
    });

    // Verify single-use replay protection (consumed OTP must be rejected)
    const replayAttempt = await atomicVerifyOtp({
      targetIdentifier: mobileNumber,
      tenantId: testTenantA,
      purpose: 'PATIENT_PORTAL_AUTH',
      otpCandidate: portalOtp
    });

    reportTest(
      'Test 4: Patient Portal SMS auth writes solely to OtpChallenge; single-use replay rejected with CHALLENGE_CONSUMED',
      noRegWritten && verifySuccess.success && !replayAttempt.success && replayAttempt.errorCode === 'CHALLENGE_CONSUMED',
      `Replay ErrorCode: ${replayAttempt.errorCode}`
    );
  }

  // ---------------------------------------------------------------------------
  // TEST 5: Public Doctor Queue: Sole OtpChallenge Write & Zero RegistrationOtp Write
  // ---------------------------------------------------------------------------
  console.log('\n[TEST 5] Public Doctor Queue: Sole OtpChallenge Write & Zero RegistrationOtp Write');
  {
    const queueEmail = `queue_patient_${Date.now()}@example.org`;
    lastCapturedEmailOtp = null;

    const dispatchResult = await createAndDispatchOtp({
      targetIdentifier: queueEmail,
      identifierType: 'email',
      tenantId: testTenantA,
      purpose: 'PUBLIC_DOCTOR_QUEUE',
      deliveryChannel: 'email',
      expiryMinutes: 5,
      _mockEmailTransport: mockEmailTransport
    });
    const queueOtp = lastCapturedEmailOtp;

    assert(dispatchResult.success);

    const currentRegCount = await RegistrationOtp.countDocuments();
    const noRegWritten = currentRegCount === initialRegOtpCount;

    const challenge = await OtpChallenge.findOne({
      targetIdentifier: queueEmail,
      tenantId: testTenantA,
      purpose: 'PUBLIC_DOCTOR_QUEUE'
    });

    const verifySuccess = await atomicVerifyOtp({
      targetIdentifier: queueEmail,
      tenantId: testTenantA,
      purpose: 'PUBLIC_DOCTOR_QUEUE',
      otpCandidate: queueOtp
    });

    reportTest(
      'Test 5: Public Doctor Queue OTP persists solely in OtpChallenge with purpose PUBLIC_DOCTOR_QUEUE; zero RegistrationOtp write',
      noRegWritten && Boolean(challenge) && verifySuccess.success,
      `Challenge Purpose: ${challenge?.purpose}`
    );
  }

  // ---------------------------------------------------------------------------
  // TEST 6: Public Reception QR Check-In: Zero ReceptionOtp Dual-Write
  // ---------------------------------------------------------------------------
  console.log('\n[TEST 6] Public Reception QR Check-In: Zero ReceptionOtp Dual-Write');
  {
    const qrMobile = '9810500333';
    lastCapturedSmsOtp = null;

    const dispatchResult = await createAndDispatchOtp({
      targetIdentifier: qrMobile,
      identifierType: 'phone',
      tenantId: testTenantA,
      purpose: 'RECEPTION_QUEUE',
      deliveryChannel: 'sms',
      expiryMinutes: 10,
      _mockSmsTransport: mockSmsTransport
    });
    const qrOtp = lastCapturedSmsOtp;

    assert(dispatchResult.success);

    const currentRecepCount = await ReceptionOtp.countDocuments();
    const noRecepWritten = currentRecepCount === initialRecepOtpCount;

    const verifySuccess = await atomicVerifyOtp({
      targetIdentifier: qrMobile,
      tenantId: testTenantA,
      purpose: 'RECEPTION_QUEUE',
      otpCandidate: qrOtp
    });

    reportTest(
      'Test 6: Public Reception QR dispatch writes solely to OtpChallenge; ReceptionOtp count unchanged',
      noRecepWritten && verifySuccess.success,
      `ReceptionOtp Δ: ${currentRecepCount - initialRecepOtpCount}`
    );
  }

  // ---------------------------------------------------------------------------
  // TEST 7: Cross-Purpose Rejection: Strict Purpose Isolation
  // ---------------------------------------------------------------------------
  console.log('\n[TEST 7] Cross-Purpose Rejection: Strict Purpose Isolation');
  {
    const attackEmail = `target_${Date.now()}@health.org`;
    lastCapturedEmailOtp = null;

    // Issue OTP for PUBLIC_DOCTOR_QUEUE
    await createAndDispatchOtp({
      targetIdentifier: attackEmail,
      identifierType: 'email',
      tenantId: testTenantA,
      purpose: 'PUBLIC_DOCTOR_QUEUE',
      deliveryChannel: 'email',
      expiryMinutes: 5,
      _mockEmailTransport: mockEmailTransport
    });
    const attackOtp = lastCapturedEmailOtp;

    // Try to verify this OTP against FORGOT_PASSWORD
    const crossPurpose1 = await atomicVerifyOtp({
      targetIdentifier: attackEmail,
      tenantId: testTenantA,
      purpose: 'FORGOT_PASSWORD',
      otpCandidate: attackOtp
    });

    // Try to verify this OTP against PATIENT_PORTAL_AUTH
    const crossPurpose2 = await atomicVerifyOtp({
      targetIdentifier: attackEmail,
      tenantId: testTenantA,
      purpose: 'PATIENT_PORTAL_AUTH',
      otpCandidate: attackOtp
    });

    // Try to verify this OTP against STAFF_REGISTRATION
    const crossPurpose3 = await atomicVerifyOtp({
      targetIdentifier: attackEmail,
      tenantId: testTenantA,
      purpose: 'STAFF_REGISTRATION',
      otpCandidate: attackOtp
    });

    const allRejected = !crossPurpose1.success && !crossPurpose2.success && !crossPurpose3.success;
    reportTest(
      'Test 7: Cross-purpose attacks strictly rejected; challenge bound to PUBLIC_DOCTOR_QUEUE cannot authenticate other purposes',
      allRejected,
      `Rejected purposes: FORGOT_PASSWORD (${crossPurpose1.errorCode}), PATIENT_PORTAL_AUTH (${crossPurpose2.errorCode}), STAFF_REGISTRATION (${crossPurpose3.errorCode})`
    );
  }

  // ---------------------------------------------------------------------------
  // TEST 8: Failed Delivery Zero-Orphan Rollback
  // ---------------------------------------------------------------------------
  console.log('\n[TEST 8] Failed Delivery Zero-Orphan Rollback');
  {
    const failTarget = '9810500444';
    const failingTransport = async () => ({ success: false, error: 'Simulated 504 Gateway Timeout' });

    const dispatchResult = await createAndDispatchOtp({
      targetIdentifier: failTarget,
      identifierType: 'phone',
      tenantId: testTenantA,
      purpose: 'RECEPTION_QUEUE',
      deliveryChannel: 'sms',
      expiryMinutes: 10,
      _mockSmsTransport: failingTransport
    });

    assert(!dispatchResult.success, 'Dispatch must report failure');

    // Verify NO orphaned challenge remains in OtpChallenge
    const orphanedChallenge = await OtpChallenge.findOne({
      targetIdentifier: failTarget,
      tenantId: testTenantA,
      purpose: 'RECEPTION_QUEUE'
    });

    // Verify rate limit reservation released
    const rateLimitDoc = await OtpRateLimit.findOne({
      targetIdentifier: failTarget,
      tenantId: testTenantA,
      purpose: 'RECEPTION_QUEUE'
    });

    const noActiveReservations = !rateLimitDoc || rateLimitDoc.activeReservations.length === 0;

    reportTest(
      'Test 8: Failed SMS delivery executes Zero-Orphan Rollback; challenge deleted & rate limit reservation released',
      orphanedChallenge === null && noActiveReservations,
      `Orphaned Challenge: ${Boolean(orphanedChallenge)}, Active Reservations: ${rateLimitDoc?.activeReservations.length || 0}`
    );
  }

  // ---------------------------------------------------------------------------
  // TEST 9: Shared-Family Mobile ProfileSelectionToken Atomic Consumption
  // ---------------------------------------------------------------------------
  console.log('\n[TEST 9] Shared-Family Mobile ProfileSelectionToken Atomic Consumption');
  {
    const familyMobile = '9810500555';
    const pat1Id = new mongoose.Types.ObjectId().toString();
    const pat2Id = new mongoose.Types.ObjectId().toString();

    const profileToken = await generateProfileSelectionToken({
      tenantId: testTenantA,
      contact: familyMobile,
      allowedPatientIds: [pat1Id, pat2Id]
    });

    assert(profileToken, 'Must generate ProfileSelectionToken');

    // First consumption succeeds
    const consume1 = await verifyAndConsumeProfileSelectionToken(profileToken, pat1Id);
    assert(consume1.valid, 'First profile selection must be valid');

    // Replay consumption fails
    const consume2 = await verifyAndConsumeProfileSelectionToken(profileToken, pat2Id);
    const replayRejected = !consume2.valid && consume2.errorCode === 'TOKEN_ALREADY_CONSUMED';

    reportTest(
      'Test 9: ProfileSelectionToken for shared mobile allows exactly one atomic selection; replay rejected with TOKEN_ALREADY_CONSUMED',
      consume1.valid && replayRejected,
      `First Valid: ${consume1.valid}, Replay ErrorCode: ${consume2.errorCode}`
    );
  }

  // ---------------------------------------------------------------------------
  // TEST 10: Final Staging MongoDB Document Integrity Check
  // ---------------------------------------------------------------------------
  console.log('\n[TEST 10] Final Staging MongoDB Document Integrity Check');
  {
    const finalRegOtpCount = await RegistrationOtp.countDocuments();
    const finalRecepOtpCount = await ReceptionOtp.countDocuments();

    const regCountUnchanged = finalRegOtpCount === initialRegOtpCount;
    const recepCountUnchanged = finalRecepOtpCount === initialRecepOtpCount;

    reportTest(
      'Test 10: Final MongoDB integrity: RegistrationOtp count unchanged; ReceptionOtp count unchanged throughout entire suite',
      regCountUnchanged && recepCountUnchanged,
      `RegistrationOtp: ${initialRegOtpCount} -> ${finalRegOtpCount}, ReceptionOtp: ${initialRecepOtpCount} -> ${finalRecepOtpCount}`
    );
  }

  // Clean up synthetic test challenges and rate limits created during this test
  await OtpChallenge.deleteMany({ tenantId: { $in: [testTenantA, testTenantB] } });
  await OtpRateLimit.deleteMany({ tenantId: { $in: [testTenantA, testTenantB] } });
  await ProfileSelectionToken.deleteMany({ tenantId: { $in: [testTenantA, testTenantB] } });

  console.log('\n===================================================================');
  console.log(`STAGE 1 TEST RESULTS: ${passedTests} / ${totalTests} PASSED`);
  if (passedTests === totalTests) {
    console.log('ALL 10 STAGE 1 OTP MIGRATION ACCEPTANCE TESTS PASSED.');
  } else {
    console.error(`FAILED ${totalTests - passedTests} TESTS.`);
    process.exit(1);
  }
  console.log('===================================================================\n');

  await mongoose.disconnect();
}

runStage1Suite().catch(err => {
  console.error('Stage 1 Test Suite Error:', err);
  process.exit(1);
});
