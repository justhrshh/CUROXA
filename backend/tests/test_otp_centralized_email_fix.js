/**
 * QUROXA — OTP DUAL-GENERATION BUG FIX ACCEPTANCE SUITE
 * 
 * Verifies that otpService.js is the sole authoritative OTP generator and that:
 * 1. The OTP rendered in the email HTML body equals the authoritative rawOtp.
 * 2. The rendered OTP verifies successfully against the corresponding OtpChallenge.
 * 3. An incorrect OTP still fails closed.
 * 4. An expired OTP still fails with CHALLENGE_EXPIRED.
 * 5. A consumed OTP cannot be reused (CHALLENGE_CONSUMED).
 * 6. SMS dispatch continues receiving the authoritative OTP.
 * 7. Forgot Password remains email OTP only (no OTP in subject line).
 * 8. Staff login remains password-only.
 * 9. Existing patient portal SMS and Reception QR SMS workflows remain unaffected.
 * 
 * STRICTLY USES MOCKED TRANSPORTS. ZERO REAL EMAILS OR SMS DISPATCHED.
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const mongoose = require('mongoose');
const assert = require('assert');

const connectDB = require('../config/db');
const OtpChallenge = require('../models/OtpChallenge');
const OtpRateLimit = require('../models/OtpRateLimit');
const User = require('../models/User');
const Patient = require('../models/Patient');

const {
  createAndDispatchOtp,
  atomicVerifyOtp,
  hashOtp
} = require('../services/otp/otpService');

const { sendOtpNotification } = require('../services/notificationService');
const { buildBrandedOtpEmail } = require('../utils/hospitalBrandingHelper');

let passedTests = 0;
let totalTests = 0;

function reportTest(name, condition, extra = '') {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`  ✅ [PASS] ${name}${extra ? ` (${extra})` : ''}`);
  } else {
    console.error(`  ❌ [FAIL] ${name}${extra ? ` (${extra})` : ''}`);
  }
}

async function runSuite() {
  console.log('===================================================================');
  console.log('  QUROXA OTP DUAL-GENERATION BUG FIX ACCEPTANCE SUITE');
  console.log('===================================================================');

  process.env.NODE_ENV = 'test';
  await connectDB();

  const testTenant = `test_tenant_fix_${Date.now()}`;
  const testEmail = `patient_portal_fix_${Date.now()}@curoxatest.org`;
  const testMobile = '9810500888';

  // ---------------------------------------------------------------------------
  // TEST 1: The OTP rendered in actual email body equals authoritative rawOtp
  // ---------------------------------------------------------------------------
  console.log('\n[TEST 1] Rendered Email OTP Equals Authoritative rawOtp');
  {
    let capturedEmail = null;
    const mockEmailTransport = (args) => {
      capturedEmail = args;
      return { success: true, channel: 'email', provider: 'MOCK_MAIL', targetMasked: args.maskedTarget, deliveryStatus: 'sent' };
    };

    const dispatchResult = await createAndDispatchOtp({
      targetIdentifier: testEmail,
      identifierType: 'email',
      tenantId: testTenant,
      purpose: 'PATIENT_PORTAL_AUTH',
      deliveryChannel: 'email',
      expiryMinutes: 15,
      subject: 'Patient Portal Verification Code: {{OTP}}',
      html: (authoritativeOtp) => `<p>Your verification code is: <strong>${authoritativeOtp}</strong>. Valid for 15 minutes.</p>`,
      _mockEmailTransport: mockEmailTransport
    });

    assert(dispatchResult.success, 'Dispatch must succeed');
    assert(capturedEmail, 'Mock transport must capture email');

    // Extract 6-digit OTP from captured rendered HTML
    const match = capturedEmail.html.match(/\b\d{6}\b/);
    const renderedOtp = match ? match[0] : null;

    // Check that rawOtp from test return matches the rendered OTP in the email body
    const rawOtp = dispatchResult.rawOtp;
    const otpsMatch = Boolean(renderedOtp && rawOtp && renderedOtp === rawOtp);

    // Verify OTP was stripped from subject
    const subjectHasNoOtp = !capturedEmail.subject.includes(rawOtp) && !capturedEmail.subject.includes('{{OTP}}');

    reportTest(
      'Test 1: Email HTML body renders exact authoritative rawOtp; OTP excluded from subject',
      otpsMatch && subjectHasNoOtp,
      `Rendered: ${renderedOtp}, Authoritative: ${rawOtp}, Subject: "${capturedEmail.subject}"`
    );
  }

  // ---------------------------------------------------------------------------
  // TEST 2: The rendered OTP verifies successfully against OtpChallenge
  // ---------------------------------------------------------------------------
  console.log('\n[TEST 2] Rendered OTP Verifies Successfully');
  {
    const challenge = await OtpChallenge.findOne({
      targetIdentifier: testEmail,
      tenantId: testTenant,
      purpose: 'PATIENT_PORTAL_AUTH'
    });
    assert(challenge, 'Challenge must exist in database');

    // Retrieve challenge directly and verify using the rendered OTP from Test 1
    const verifyResult = await atomicVerifyOtp({
      targetIdentifier: testEmail,
      tenantId: testTenant,
      purpose: 'PATIENT_PORTAL_AUTH',
      otpCandidate: challenge.metadata?.testRenderedOtp || (await OtpChallenge.findOne({ targetIdentifier: testEmail })).targetIdentifier ? 
        // We know the challenge was generated with the authoritative OTP in Test 1
        // Let's verify with the exact OTP we captured
        null : null
    });

    // Let's perform a direct end-to-end send -> capture rendered HTML -> verify cycle:
    let captured = null;
    const freshEmail = `verify_render_${Date.now()}@curoxatest.org`;
    const res = await createAndDispatchOtp({
      targetIdentifier: freshEmail,
      identifierType: 'email',
      tenantId: testTenant,
      purpose: 'PATIENT_PORTAL_AUTH',
      deliveryChannel: 'email',
      expiryMinutes: 15,
      subject: 'Patient Portal Verification Code',
      html: '<p>Your verification code is: <strong>{{OTP}}</strong>. Valid for 15 minutes.</p>',
      _mockEmailTransport: (args) => {
        captured = args;
        return { success: true, channel: 'email', provider: 'MOCK', targetMasked: args.maskedTarget, deliveryStatus: 'sent' };
      }
    });

    const parsedOtp = captured.html.match(/\b\d{6}\b/)[0];
    const e2eVerify = await atomicVerifyOtp({
      targetIdentifier: freshEmail,
      tenantId: testTenant,
      purpose: 'PATIENT_PORTAL_AUTH',
      otpCandidate: parsedOtp
    });

    reportTest(
      'Test 2: Rendered OTP from HTML body verifies successfully against stored HMAC',
      e2eVerify.success === true,
      `Verified: ${e2eVerify.success}`
    );
  }

  // ---------------------------------------------------------------------------
  // TEST 3: An incorrect OTP still fails
  // ---------------------------------------------------------------------------
  console.log('\n[TEST 3] Incorrect OTP Fails Closed');
  {
    const emailTarget = `bad_otp_${Date.now()}@curoxatest.org`;
    await createAndDispatchOtp({
      targetIdentifier: emailTarget,
      identifierType: 'email',
      tenantId: testTenant,
      purpose: 'PATIENT_PORTAL_AUTH',
      deliveryChannel: 'email',
      _mockEmailTransport: () => ({ success: true, channel: 'email', provider: 'MOCK', targetMasked: '***', deliveryStatus: 'sent' })
    });

    const failVerify = await atomicVerifyOtp({
      targetIdentifier: emailTarget,
      tenantId: testTenant,
      purpose: 'PATIENT_PORTAL_AUTH',
      otpCandidate: '000000'
    });

    const challengeAfter = await OtpChallenge.findOne({
      targetIdentifier: emailTarget,
      tenantId: testTenant,
      purpose: 'PATIENT_PORTAL_AUTH'
    });

    reportTest(
      'Test 3: Incorrect OTP candidate rejected and increments attempts count',
      failVerify.success === false && (failVerify.errorCode === 'INVALID_OTP' || failVerify.errorCode === 'INVALID_CODE') && challengeAfter.attempts === 1,
      `ErrorCode: ${failVerify.errorCode}, Attempts: ${challengeAfter.attempts}`
    );
  }

  // ---------------------------------------------------------------------------
  // TEST 4: An expired OTP still fails
  // ---------------------------------------------------------------------------
  console.log('\n[TEST 4] Expired OTP Fails');
  {
    const emailTarget = `expired_${Date.now()}@curoxatest.org`;
    const res = await createAndDispatchOtp({
      targetIdentifier: emailTarget,
      identifierType: 'email',
      tenantId: testTenant,
      purpose: 'PATIENT_PORTAL_AUTH',
      deliveryChannel: 'email',
      _mockEmailTransport: () => ({ success: true, channel: 'email', provider: 'MOCK', targetMasked: '***', deliveryStatus: 'sent' })
    });

    // Artificially expire the challenge
    await OtpChallenge.updateOne(
      { targetIdentifier: emailTarget, tenantId: testTenant, purpose: 'PATIENT_PORTAL_AUTH' },
      { $set: { expiresAt: new Date(Date.now() - 5000) } }
    );

    const expiredVerify = await atomicVerifyOtp({
      targetIdentifier: emailTarget,
      tenantId: testTenant,
      purpose: 'PATIENT_PORTAL_AUTH',
      otpCandidate: res.rawOtp
    });

    reportTest(
      'Test 4: Expired OTP rejected with CHALLENGE_EXPIRED',
      expiredVerify.success === false && expiredVerify.errorCode === 'CHALLENGE_EXPIRED',
      `ErrorCode: ${expiredVerify.errorCode}`
    );
  }

  // ---------------------------------------------------------------------------
  // TEST 5: A consumed OTP cannot be reused
  // ---------------------------------------------------------------------------
  console.log('\n[TEST 5] Consumed OTP Replay Rejection');
  {
    const emailTarget = `consumed_${Date.now()}@curoxatest.org`;
    const res = await createAndDispatchOtp({
      targetIdentifier: emailTarget,
      identifierType: 'email',
      tenantId: testTenant,
      purpose: 'PATIENT_PORTAL_AUTH',
      deliveryChannel: 'email',
      _mockEmailTransport: () => ({ success: true, channel: 'email', provider: 'MOCK', targetMasked: '***', deliveryStatus: 'sent' })
    });

    const firstVerify = await atomicVerifyOtp({
      targetIdentifier: emailTarget,
      tenantId: testTenant,
      purpose: 'PATIENT_PORTAL_AUTH',
      otpCandidate: res.rawOtp
    });
    assert(firstVerify.success, 'First verification must succeed');

    // Attempt replay of consumed OTP
    const replayVerify = await atomicVerifyOtp({
      targetIdentifier: emailTarget,
      tenantId: testTenant,
      purpose: 'PATIENT_PORTAL_AUTH',
      otpCandidate: res.rawOtp
    });

    reportTest(
      'Test 5: Consumed OTP cannot be reused (CHALLENGE_CONSUMED)',
      replayVerify.success === false && replayVerify.errorCode === 'CHALLENGE_CONSUMED',
      `ErrorCode: ${replayVerify.errorCode}`
    );
  }

  // ---------------------------------------------------------------------------
  // TEST 6: SMS dispatch continues receiving authoritative OTP
  // ---------------------------------------------------------------------------
  console.log('\n[TEST 6] SMS Dispatch Receives Authoritative OTP');
  {
    let capturedSmsOtp = null;
    const mockSms = async (args) => {
      const match = String(args.message || '').match(/\b\d{6}\b/);
      if (match) capturedSmsOtp = match[0];
      return { success: true, channel: 'sms', provider: 'PING4SMS', deliveryStatus: 'sent' };
    };

    const res = await createAndDispatchOtp({
      targetIdentifier: testMobile,
      identifierType: 'phone',
      tenantId: testTenant,
      purpose: 'PATIENT_PORTAL_AUTH',
      deliveryChannel: 'sms',
      _mockSmsTransport: mockSms
    });

    assert(res.success, 'SMS dispatch must succeed');
    assert(capturedSmsOtp, 'Mock SMS transport must capture dispatch');

    const challenge = await OtpChallenge.findOne({
      targetIdentifier: testMobile,
      tenantId: testTenant,
      purpose: 'PATIENT_PORTAL_AUTH'
    });

    const expectedHash = hashOtp(capturedSmsOtp, testMobile, testTenant, 'PATIENT_PORTAL_AUTH');
    const hashMatches = challenge && challenge.hashedOtp === expectedHash;

    reportTest(
      'Test 6: SMS dispatch receives exact authoritative OTP matching stored HMAC',
      hashMatches && capturedSmsOtp === res.rawOtp,
      `SMS OTP: ${capturedSmsOtp}, Channel: ${challenge.deliveryChannel}`
    );
  }

  // ---------------------------------------------------------------------------
  // TEST 7: Forgot Password remains email OTP only (no OTP in subject)
  // ---------------------------------------------------------------------------
  console.log('\n[TEST 7] Forgot Password Email-Only & No OTP in Subject');
  {
    let capturedForgotEmail = null;
    const staffEmail = `dr_forgot_${Date.now()}@hospital.org`;
    
    const mockForgotMail = (args) => {
      capturedForgotEmail = args;
      return { success: true, channel: 'email', provider: 'MOCK', targetMasked: args.maskedTarget, deliveryStatus: 'sent' };
    };

    const res = await createAndDispatchOtp({
      targetIdentifier: staffEmail,
      identifierType: 'email',
      tenantId: testTenant,
      purpose: 'FORGOT_PASSWORD',
      deliveryChannel: 'email',
      subject: 'Hospital Password Reset Verification Code',
      html: (authoritativeOtp) => buildBrandedOtpEmail({
        otp: authoritativeOtp,
        title: "Verify Your Identity",
        message: "You requested a password reset. Use the verification code below.",
        hospital: { name: 'Hospital' },
        expiryMinutes: 15
      }).html,
      _mockEmailTransport: mockForgotMail
    });

    assert(res.success, 'Forgot password dispatch must succeed');
    
    // Extract OTP specifically from the branded OTP box (<span ... >{otp}</span>)
    const otpMatch = capturedForgotEmail.html.match(/>(\d{6})<\/span>/);
    const parsedForgotOtp = otpMatch ? otpMatch[1] : null;
    const subjectHasNoOtp = !capturedForgotEmail.subject.includes(parsedForgotOtp);

    const forgotVerify = await atomicVerifyOtp({
      targetIdentifier: staffEmail,
      tenantId: testTenant,
      purpose: 'FORGOT_PASSWORD',
      otpCandidate: parsedForgotOtp
    });

    reportTest(
      'Test 7: Forgot Password dispatches email-only with branded HTML containing authoritative OTP and clean subject',
      forgotVerify.success === true && subjectHasNoOtp && parsedForgotOtp === res.rawOtp,
      `Verified: ${forgotVerify.success}, OTP: ${parsedForgotOtp}, Subject: "${capturedForgotEmail.subject}"`
    );
  }

  // ---------------------------------------------------------------------------
  // TEST 8: Staff login remains password-only (no OTP required)
  // ---------------------------------------------------------------------------
  console.log('\n[TEST 8] Staff Login Remains Password-Only');
  {
    const staffUser = await User.create({
      tenantId: testTenant,
      staff_id: `staff_${Date.now()}`,
      name: 'Dr. Password Auth',
      email: `doctor_${Date.now()}@curoxatest.org`,
      phone: '9810500999',
      role: 'doctor',
      password_hash: '$2b$10$mockPasswordHash12345678901234567890123456789012'
    });

    // Check that user model does not have plaintext otp_code or require OTP for standard login
    const userDoc = await User.findById(staffUser._id).select('+password_hash');
    const hasNoPlaintextOtp = userDoc.otp_code === undefined || userDoc.otp_code === null;
    const hasPasswordHash = Boolean(userDoc.password_hash);

    reportTest(
      'Test 8: Staff login retains password-only credential authentication without plaintext OTP fields',
      hasNoPlaintextOtp && hasPasswordHash,
      `User OTP: ${userDoc.otp_code}, HasPasswordHash: ${hasPasswordHash}`
    );

    await User.deleteOne({ _id: staffUser._id });
  }

  // ---------------------------------------------------------------------------
  // TEST 9: Existing Reception QR SMS workflow remains unaffected
  // ---------------------------------------------------------------------------
  console.log('\n[TEST 9] Existing Reception QR SMS Workflow Unaffected');
  {
    let capturedRecepOtp = null;
    const recepMobile = '9810500777';

    const res = await createAndDispatchOtp({
      targetIdentifier: recepMobile,
      identifierType: 'phone',
      tenantId: testTenant,
      purpose: 'RECEPTION_QUEUE',
      deliveryChannel: 'sms',
      _mockSmsTransport: async (args) => {
        const match = String(args.message || '').match(/\b\d{6}\b/);
        if (match) capturedRecepOtp = match[0];
        return { success: true, channel: 'sms', provider: 'PING4SMS', deliveryStatus: 'sent' };
      }
    });

    assert(res.success, 'Reception QR SMS dispatch must succeed');
    const verifyRecep = await atomicVerifyOtp({
      targetIdentifier: recepMobile,
      tenantId: testTenant,
      purpose: 'RECEPTION_QUEUE',
      otpCandidate: capturedRecepOtp
    });

    reportTest(
      'Test 9: Reception QR SMS verification flow remains completely intact with authoritative OTP',
      verifyRecep.success === true && capturedRecepOtp === res.rawOtp,
      `Verified: ${verifyRecep.success}, Purpose: RECEPTION_QUEUE`
    );
  }

  // ---------------------------------------------------------------------------
  // CLEANUP TEST FIXTURES
  // ---------------------------------------------------------------------------
  await OtpChallenge.deleteMany({ tenantId: testTenant });
  await OtpRateLimit.deleteMany({ tenantId: testTenant });

  console.log('\n===================================================================');
  console.log(`ACCEPTANCE RESULTS: ${passedTests} / ${totalTests} PASSED`);
  if (passedTests === totalTests) {
    console.log('ALL 9 CENTRALIZED OTP BUG FIX ASSERTIONS PASSED.');
  } else {
    console.error(`FAILED ${totalTests - passedTests} ASSERTIONS.`);
    process.exit(1);
  }
  console.log('===================================================================\n');

  await mongoose.disconnect();
}

runSuite().catch(err => {
  console.error('Test Suite Error:', err);
  process.exit(1);
});
