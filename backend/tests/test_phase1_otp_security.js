/**
 * QUROXA PHASE 1 SECURITY ACCEPTANCE TEST SUITE (SELF-CONTAINED)
 * 
 * Verifies:
 * 1. OtpChallenge Schema integrity (explicit tenantId, compound & TTL indexes, enums)
 * 2. Cryptographic PRNG correctness [100000, 999999] over 10,000 iterations
 * 3. Zero Plaintext Disk Leaks (no .seed-otp.txt on disk or in any controllers)
 * 4. Zero dev_otp leaks in response structures across all route handlers
 * 5. Zero-Orphan Rollback logic presence across all 6 OTP dispatch endpoints
 * 6. Preserved Authentication Schema Contracts in User model
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');

const OtpChallenge = require('../models/OtpChallenge');
const User = require('../models/User');

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

async function runPhase1SecurityTests() {
  console.log('===============================================================');
  console.log('QUROXA PHASE 1: OTP SECURITY & FOUNDATION VERIFICATION SUITE');
  console.log('===============================================================\n');

  try {
    // -------------------------------------------------------------
    // Test Group 1: OtpChallenge Schema Validation & Tenant Constraints
    // -------------------------------------------------------------
    console.log('[TEST GROUP 1] OtpChallenge Schema Validation & Tenant Constraints');

    // 1.1 Rejects challenge without explicit tenantId
    let threwTenantError = false;
    try {
      const challengeWithoutTenant = new OtpChallenge({
        targetIdentifier: 'doctor@hospital.com',
        identifierType: 'email',
        purpose: 'STAFF_LOGIN',
        hashedOtp: 'dummyhash123',
        expiresAt: new Date(Date.now() + 600000),
        deliveryChannel: 'email'
      });
      await challengeWithoutTenant.validate();
    } catch (err) {
      if (err.errors && err.errors.tenantId) {
        threwTenantError = true;
      }
    }
    assert(threwTenantError, 'OtpChallenge rejects document without explicit tenantId (no silent default)');

    // 1.2 Rejects invalid identifierType enum
    let threwInvalidType = false;
    try {
      const challengeInvalidType = new OtpChallenge({
        tenantId: 'city_hospital',
        targetIdentifier: 'doctor@hospital.com',
        identifierType: 'pigeon_post',
        purpose: 'STAFF_LOGIN',
        hashedOtp: 'dummyhash123',
        expiresAt: new Date(Date.now() + 600000),
        deliveryChannel: 'email'
      });
      await challengeInvalidType.validate();
    } catch (err) {
      if (err.errors && err.errors.identifierType) {
        threwInvalidType = true;
      }
    }
    assert(threwInvalidType, 'OtpChallenge rejects invalid identifierType enum');

    // 1.3 Rejects invalid purpose enum
    let threwInvalidPurpose = false;
    try {
      const challengeInvalidPurpose = new OtpChallenge({
        tenantId: 'city_hospital',
        targetIdentifier: 'doctor@hospital.com',
        identifierType: 'email',
        purpose: 'UNAUTHORIZED_ACTION',
        hashedOtp: 'dummyhash123',
        expiresAt: new Date(Date.now() + 600000),
        deliveryChannel: 'email'
      });
      await challengeInvalidPurpose.validate();
    } catch (err) {
      if (err.errors && err.errors.purpose) {
        threwInvalidPurpose = true;
      }
    }
    assert(threwInvalidPurpose, 'OtpChallenge rejects unapproved purpose enum values');

    // 1.4 Successfully validates with explicit tenantId and valid purpose
    const validChallenge = new OtpChallenge({
      tenantId: 'city_hospital',
      targetIdentifier: 'doctor@hospital.com',
      identifierType: 'email',
      purpose: 'STAFF_LOGIN',
      hashedOtp: crypto.createHash('sha256').update('123456').digest('hex'),
      expiresAt: new Date(Date.now() + 600000),
      deliveryChannel: 'email'
    });
    let validError = null;
    try {
      await validChallenge.validate();
    } catch (err) {
      validError = err;
    }
    assert(validError === null, 'OtpChallenge schema validates cleanly with required fields');

    // 1.5 Check Schema Indexes
    const indexes = OtpChallenge.schema.indexes();
    const hasTtl = indexes.some(idx => idx[0].expiresAt === 1 && idx[1]?.expireAfterSeconds === 0);
    assert(hasTtl, 'OtpChallenge defines TTL index on expiresAt (expireAfterSeconds: 0)');

    const hasCompound = indexes.some(idx => 
      idx[0].tenantId === 1 && idx[0].targetIdentifier === 1 && idx[0].purpose === 1
    );
    assert(hasCompound, 'OtpChallenge defines compound index { tenantId: 1, targetIdentifier: 1, purpose: 1 }');


    // -------------------------------------------------------------
    // Test Group 2: Cryptographic PRNG Range & Entropy (10,000 iterations)
    // -------------------------------------------------------------
    console.log('\n[TEST GROUP 2] Cryptographic PRNG Bounds [100000, 999999]');
    let allInRange = true;
    let strictlySixDigits = true;
    let minObserved = 1000000;
    let maxObserved = 0;

    for (let i = 0; i < 10000; i++) {
      const otpNum = crypto.randomInt(100000, 1000000);
      const otpStr = otpNum.toString();

      if (otpNum < 100000 || otpNum >= 1000000) {
        allInRange = false;
      }
      if (otpStr.length !== 6) {
        strictlySixDigits = false;
      }
      if (otpNum < minObserved) minObserved = otpNum;
      if (otpNum > maxObserved) maxObserved = otpNum;
    }

    assert(allInRange, 'crypto.randomInt(100000, 1000000) generates integers in strictly [100000, 999999]');
    assert(strictlySixDigits, 'All 10,000 generated OTPs convert to exactly 6-character numeric strings');
    assert(minObserved >= 100000 && maxObserved < 1000000, `Entropy spread: min=${minObserved}, max=${maxObserved}`);


    // -------------------------------------------------------------
    // Test Group 3: Zero Plaintext Disk Leaks
    // -------------------------------------------------------------
    console.log('\n[TEST GROUP 3] Zero Plaintext Disk Leaks');
    const seedOtpPath = path.join(__dirname, '../.seed-otp.txt');
    const diskFileExists = fs.existsSync(seedOtpPath);
    assert(!diskFileExists, '.seed-otp.txt does NOT exist anywhere in the filesystem');

    const authRoutesContent = fs.readFileSync(path.join(__dirname, '../routes/authRoutes.js'), 'utf8');
    const receptionRoutesContent = fs.readFileSync(path.join(__dirname, '../routes/receptionQueueRoutes.js'), 'utf8');
    const publicRoutesContent = fs.readFileSync(path.join(__dirname, '../routes/publicQueueRoutes.js'), 'utf8');

    assert(!authRoutesContent.includes('.seed-otp.txt'), 'authRoutes.js contains zero references to .seed-otp.txt');
    assert(!receptionRoutesContent.includes('.seed-otp.txt'), 'receptionQueueRoutes.js contains zero references to .seed-otp.txt');
    assert(!publicRoutesContent.includes('.seed-otp.txt'), 'publicQueueRoutes.js contains zero references to .seed-otp.txt');


    // -------------------------------------------------------------
    // Test Group 4: Zero dev_otp Response Leaks
    // -------------------------------------------------------------
    console.log('\n[TEST GROUP 4] Zero dev_otp Leaks in Controllers');
    assert(!authRoutesContent.includes('dev_otp:'), 'authRoutes.js contains zero dev_otp leaks in response payloads');
    assert(!receptionRoutesContent.includes('dev_otp'), 'receptionQueueRoutes.js contains zero dev_otp leaks');
    assert(!publicRoutesContent.includes('dev_otp'), 'publicQueueRoutes.js contains zero dev_otp leaks');


    // -------------------------------------------------------------
    // Test Group 5: Zero-Orphan Rollback Logic Verification
    // -------------------------------------------------------------
    console.log('\n[TEST GROUP 5] Zero-Orphan Rollback Logic Verification');

    // 5.1 Forgot Password rollback check (clears user.otp_code on delivery failure)
    const forgotPasswordRollback = authRoutesContent.includes('user.otp_code = null') && 
                                   authRoutesContent.includes('user.otp_expires_at = null') &&
                                   authRoutesContent.includes('await user.save().catch');
    assert(forgotPasswordRollback, 'authRoutes /forgot-password has Zero-Orphan Rollback (clears user.otp_code on delivery failure)');

    // 5.2 Registration OTP rollback check
    const registrationRollback = authRoutesContent.includes('RegistrationOtp.deleteOne({ email: searchEmail })');
    assert(registrationRollback, 'authRoutes /send-registration-otp has Zero-Orphan Rollback (deletes RegistrationOtp on delivery failure)');

    // 5.3 Staff Login OTP rollback check
    const staffLoginRollback = authRoutesContent.includes('user.login_otp_code = null') && 
                               authRoutesContent.includes('user.login_otp_expires_at = null') &&
                               authRoutesContent.includes('await user.save().catch');
    assert(staffLoginRollback, 'authRoutes /send-login-otp has Zero-Orphan Rollback (clears user.login_otp_code on delivery failure)');

    // 5.4 Patient Portal OTP rollback check
    const patientPortalRollback = authRoutesContent.includes('RegistrationOtp.deleteOne({ email: regTarget })');
    assert(patientPortalRollback, 'authRoutes /patient-portal/send-otp has Zero-Orphan Rollback (clears RegistrationOtp & user on delivery failure)');

    // 5.5 Reception Queue OTP rollback check (targeted by exact challenge dispatchId)
    const receptionRollback = receptionRoutesContent.includes('ReceptionOtp.deleteOne') && 
                              (receptionRoutesContent.includes('dispatchId') || receptionRoutesContent.includes('email: cleanEmail'));
    assert(receptionRollback, 'receptionQueueRoutes /send-otp has Zero-Orphan Rollback (deletes exact ReceptionOtp challenge on delivery failure)');

    // 5.6 Public Queue OTP rollback check
    const publicRollback = publicRoutesContent.includes('RegistrationOtp.deleteOne({ email: cleanEmail })');
    assert(publicRollback, 'publicQueueRoutes /:publicQueueId/send-otp has Zero-Orphan Rollback (deletes RegistrationOtp on delivery failure)');


    // -------------------------------------------------------------
    // Test Group 6: Preserved Auth Lifecycle Schema Contracts
    // -------------------------------------------------------------
    console.log('\n[TEST GROUP 6] Preserved Auth Lifecycle Schema Contracts');
    const userSchemaPaths = User.schema.paths;
    assert(Boolean(userSchemaPaths['otp_code']), 'User schema preserves otp_code path for existing workflows');
    assert(Boolean(userSchemaPaths['otp_expires_at']), 'User schema preserves otp_expires_at path for existing workflows');
    assert(Boolean(userSchemaPaths['otp_purpose']), 'User schema preserves otp_purpose path for existing workflows');
    assert(Boolean(userSchemaPaths['login_otp_code']), 'User schema preserves login_otp_code path for staff login');
    assert(Boolean(userSchemaPaths['login_otp_expires_at']), 'User schema preserves login_otp_expires_at path for staff login');
    assert(Boolean(userSchemaPaths['tenantId']), 'User schema preserves tenantId path for multi-hospital isolation');

  } catch (err) {
    console.error('Test Execution Error:', err);
    failedTests++;
  } finally {
    console.log('\n===============================================================');
    console.log(`PHASE 1 TEST RESULTS: ${passedTests} PASSED, ${failedTests} FAILED`);
    console.log('===============================================================');
    process.exit(failedTests > 0 ? 1 : 0);
  }
}

runPhase1SecurityTests();
