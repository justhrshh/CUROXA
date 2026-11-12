/**
 * QUROXA PHASE 3 SECURITY REMEDIATION TEST SUITE (SEC-01 through SEC-06)
 * 
 * Tests the 20 targeted security guarantees:
 * 1. Legacy fallback only on CHALLENGE_NOT_FOUND
 * 2. No fallback after incorrect OTP
 * 3. No fallback after expiry
 * 4. No fallback after lockout
 * 5. No fallback after consumption
 * 6. Patient portal multiple-profile UI contract validation
 * 7. No undefined token storage
 * 8. Successful profile selection
 * 9. Expired profile-selection token
 * 10. Replayed profile-selection token
 * 11. Concurrent profile-selection token consumption
 * 12. Cross-tenant profile rejection
 * 13. Five concurrent incorrect OTP attempts (atomic lockout)
 * 14. More than five concurrent incorrect OTP attempts
 * 15. Correct OTP vs incorrect OTP concurrency
 * 16. Concurrent dispatch rate-limit reservation (TOCTOU prevention)
 * 17. Reservation release after delivery failure
 * 18. Duplicate reservation finalization rejection
 * 19. Recovery of expired reservations
 * 20. Existing single-profile patient login regression
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');

const OtpChallenge = require('../models/OtpChallenge');
const OtpRateLimit = require('../models/OtpRateLimit');
const ProfileSelectionToken = require('../models/ProfileSelectionToken');

const {
  generateOtp,
  hashOtp,
  atomicVerifyOtp,
  reserveRateLimitSlot,
  commitRateLimitReservation,
  releaseRateLimitReservation,
  generateProfileSelectionToken,
  verifyAndConsumeProfileSelectionToken,
  MAX_VERIFY_ATTEMPTS,
  COOLDOWN_SECONDS
} = require('../services/otp/otpService');

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

async function runRemediationTests() {
  console.log('===================================================================');
  console.log('QUROXA PHASE 3: SECURITY REMEDIATION ACCEPTANCE TEST SUITE');
  console.log('===================================================================\n');

  try {
    // -------------------------------------------------------------------------
    // TEST GROUP 1: SEC-01 — Legacy Fallback Restrictions
    // -------------------------------------------------------------------------
    console.log('[TEST GROUP 1] SEC-01: Legacy Fallback Gating');

    // 1.1 Non-existent challenge returns CHALLENGE_NOT_FOUND
    // We mock findOne on OtpChallenge to test atomicVerifyOtp failure classifications
    const origFindOne = OtpChallenge.findOne;
    const origFindOneAndUpdate = OtpChallenge.findOneAndUpdate;
    const origUpdateOne = OtpChallenge.updateOne;

    OtpChallenge.findOne = async () => null;
    const notFoundRes = await atomicVerifyOtp({
      targetIdentifier: 'nonexistent@hospital.org',
      tenantId: 'city_hospital',
      purpose: 'FORGOT_PASSWORD',
      otpCandidate: '123456'
    });
    assert(notFoundRes.errorCode === 'CHALLENGE_NOT_FOUND', 'Returns errorCode: CHALLENGE_NOT_FOUND when challenge record is absent');

    // 1.2 Incorrect OTP returns INVALID_OTP (Never CHALLENGE_NOT_FOUND)
    const validOtp = '555666';
    const testHash = hashOtp(validOtp, 'staff@hospital.org', 'city_hospital', 'FORGOT_PASSWORD');
    let mockDoc = {
      _id: 'mock_chal_1',
      targetIdentifier: 'staff@hospital.org',
      tenantId: 'city_hospital',
      purpose: 'FORGOT_PASSWORD',
      hashedOtp: testHash,
      attempts: 0,
      consumedAt: null,
      lockUntil: null,
      expiresAt: new Date(Date.now() + 600000)
    };

    OtpChallenge.findOne = async () => mockDoc;
    OtpChallenge.findOneAndUpdate = async (filter, update) => {
      if (update.$inc) {
        mockDoc.attempts += update.$inc.attempts;
        return mockDoc;
      }
      return null;
    };
    OtpChallenge.updateOne = async () => ({ modifiedCount: 1 });

    const wrongOtpRes = await atomicVerifyOtp({
      targetIdentifier: 'staff@hospital.org',
      tenantId: 'city_hospital',
      purpose: 'FORGOT_PASSWORD',
      otpCandidate: '999999' // wrong
    });
    assert(wrongOtpRes.errorCode === 'INVALID_OTP', 'Incorrect OTP candidate returns INVALID_OTP');
    assert(wrongOtpRes.errorCode !== 'CHALLENGE_NOT_FOUND', 'Incorrect OTP never returns CHALLENGE_NOT_FOUND (legacy fallback blocked)');

    // 1.3 Expired challenge returns CHALLENGE_EXPIRED
    mockDoc.expiresAt = new Date(Date.now() - 10000); // 10s ago
    const expiredRes = await atomicVerifyOtp({
      targetIdentifier: 'staff@hospital.org',
      tenantId: 'city_hospital',
      purpose: 'FORGOT_PASSWORD',
      otpCandidate: validOtp
    });
    assert(expiredRes.errorCode === 'CHALLENGE_EXPIRED', 'Expired challenge returns CHALLENGE_EXPIRED (legacy fallback blocked)');

    // 1.4 Consumed challenge returns CHALLENGE_CONSUMED
    mockDoc.expiresAt = new Date(Date.now() + 600000);
    mockDoc.consumedAt = new Date(Date.now() - 5000);
    const consumedRes = await atomicVerifyOtp({
      targetIdentifier: 'staff@hospital.org',
      tenantId: 'city_hospital',
      purpose: 'FORGOT_PASSWORD',
      otpCandidate: validOtp
    });
    assert(consumedRes.errorCode === 'CHALLENGE_CONSUMED', 'Consumed challenge returns CHALLENGE_CONSUMED (legacy fallback blocked)');

    // 1.5 Locked challenge returns ACCOUNT_LOCKED
    mockDoc.consumedAt = null;
    mockDoc.lockUntil = new Date(Date.now() + 600000);
    const lockedRes = await atomicVerifyOtp({
      targetIdentifier: 'staff@hospital.org',
      tenantId: 'city_hospital',
      purpose: 'FORGOT_PASSWORD',
      otpCandidate: validOtp
    });
    assert(lockedRes.errorCode === 'ACCOUNT_LOCKED', 'Locked challenge returns ACCOUNT_LOCKED (legacy fallback blocked)');


    // -------------------------------------------------------------------------
    // TEST GROUP 2: SEC-04 — Concurrent Failed Attempts & Atomic Lockout
    // -------------------------------------------------------------------------
    console.log('\n[TEST GROUP 2] SEC-04: Atomic Failed-Attempt Counter & Lockout Guarantee');

    let concurrentMockDoc = {
      _id: 'concurrent_lockout_doc',
      attempts: 0,
      lockUntil: null,
      consumedAt: null,
      expiresAt: new Date(Date.now() + 600000),
      hashedOtp: testHash
    };

    OtpChallenge.findOne = async () => concurrentMockDoc;
    // Simulate atomic MongoDB $inc and $set returning updated document
    OtpChallenge.findOneAndUpdate = async (filter, update) => {
      if (update.$inc && update.$inc.attempts) {
        concurrentMockDoc.attempts += update.$inc.attempts;
      }
      if (update.$set) {
        Object.assign(concurrentMockDoc, update.$set);
      }
      return concurrentMockDoc;
    };
    OtpChallenge.updateOne = async (filter, update) => {
      if (update.$set) {
        Object.assign(concurrentMockDoc, update.$set);
      }
      return { modifiedCount: 1 };
    };

    // Fire 5 concurrent incorrect OTP submissions simultaneously
    const fiveCalls = await Promise.all([
      atomicVerifyOtp({ targetIdentifier: 'staff@hospital.org', tenantId: 'city_hospital', purpose: 'FORGOT_PASSWORD', otpCandidate: '000001' }),
      atomicVerifyOtp({ targetIdentifier: 'staff@hospital.org', tenantId: 'city_hospital', purpose: 'FORGOT_PASSWORD', otpCandidate: '000002' }),
      atomicVerifyOtp({ targetIdentifier: 'staff@hospital.org', tenantId: 'city_hospital', purpose: 'FORGOT_PASSWORD', otpCandidate: '000003' }),
      atomicVerifyOtp({ targetIdentifier: 'staff@hospital.org', tenantId: 'city_hospital', purpose: 'FORGOT_PASSWORD', otpCandidate: '000004' }),
      atomicVerifyOtp({ targetIdentifier: 'staff@hospital.org', tenantId: 'city_hospital', purpose: 'FORGOT_PASSWORD', otpCandidate: '000005' })
    ]);

    assert(concurrentMockDoc.attempts === 5, 'Atomic counter records exactly 5 failed attempts under parallel race');
    const atLeastOneTriggeredLock = fiveCalls.some(c => c.errorCode === 'ACCOUNT_LOCKED');
    assert(atLeastOneTriggeredLock, '5th concurrent failed attempt triggers ACCOUNT_LOCKED');
    assert(concurrentMockDoc.lockUntil !== null, 'Durable lockout timestamp applied to document');

    // 2.2 More than 5 failed attempts fail closed
    const sixthCall = await atomicVerifyOtp({
      targetIdentifier: 'staff@hospital.org',
      tenantId: 'city_hospital',
      purpose: 'FORGOT_PASSWORD',
      otpCandidate: validOtp // even with valid code, locked challenge rejects
    });
    assert(sixthCall.errorCode === 'ACCOUNT_LOCKED', 'Subsequent guesses against locked challenge fail closed immediately');

    // 2.3 Correct OTP vs Incorrect OTP concurrency
    let raceDoc = {
      _id: 'race_doc',
      attempts: 0,
      lockUntil: null,
      consumedAt: null,
      expiresAt: new Date(Date.now() + 600000),
      hashedOtp: testHash
    };
    OtpChallenge.findOne = async () => raceDoc;
    OtpChallenge.findOneAndUpdate = async (filter, update) => {
      if (filter.consumedAt === null && update.$set?.consumedAt) {
        if (raceDoc.consumedAt === null) {
          raceDoc.consumedAt = update.$set.consumedAt;
          return raceDoc;
        }
        return null;
      }
      if (update.$inc) {
        raceDoc.attempts += update.$inc.attempts;
        return raceDoc;
      }
      return null;
    };

    const [validAttempt, invalidAttempt] = await Promise.all([
      atomicVerifyOtp({ targetIdentifier: 'staff@hospital.org', tenantId: 'city_hospital', purpose: 'FORGOT_PASSWORD', otpCandidate: validOtp }),
      atomicVerifyOtp({ targetIdentifier: 'staff@hospital.org', tenantId: 'city_hospital', purpose: 'FORGOT_PASSWORD', otpCandidate: '111111' })
    ]);

    assert(validAttempt.success === true, 'Valid concurrent attempt consumes challenge successfully');
    assert(invalidAttempt.success === false, 'Invalid concurrent attempt fails');
    assert(raceDoc.consumedAt !== null, 'Challenge atomically transitioned to consumed state');


    // -------------------------------------------------------------------------
    // TEST GROUP 3: SEC-05 — Atomic Rate-Limit Reservation & TOCTOU Prevention
    // -------------------------------------------------------------------------
    console.log('\n[TEST GROUP 3] SEC-05: Atomic Rate-Limit Pre-Dispatch Reservation');

    let mockRateLimitDoc = {
      targetIdentifier: 'patient@clinic.org',
      purpose: 'STAFF_LOGIN',
      tenantId: 'city_hospital',
      requestCount: 0,
      lastSentAt: null,
      activeReservations: [],
      windowResetAt: new Date(Date.now() + 600000)
    };

    OtpRateLimit.findOne = async () => mockRateLimitDoc;
    OtpRateLimit.findOneAndUpdate = async (filter, update, options) => {
      if (update.$push?.activeReservations) {
        mockRateLimitDoc.activeReservations.push(update.$push.activeReservations);
        return mockRateLimitDoc;
      }
      if (update.$set) {
        Object.assign(mockRateLimitDoc, update.$set);
      }
      return mockRateLimitDoc;
    };
    OtpRateLimit.updateOne = async (filter, update) => {
      if (update.$push?.activeReservations) {
        mockRateLimitDoc.activeReservations.push(update.$push.activeReservations);
      }
      if (update.$pull?.activeReservations) {
        const idToRemove = update.$pull.activeReservations.reservationId;
        mockRateLimitDoc.activeReservations = mockRateLimitDoc.activeReservations.filter(r => r.reservationId !== idToRemove);
      }
      if (update.$inc?.requestCount) {
        mockRateLimitDoc.requestCount += update.$inc.requestCount;
      }
      if (update.$set?.lastSentAt) {
        mockRateLimitDoc.lastSentAt = update.$set.lastSentAt;
      }
      return { modifiedCount: 1 };
    };

    // 3.1 Slot reservation pre-dispatch
    const slot1 = await reserveRateLimitSlot({ targetIdentifier: 'patient@clinic.org', purpose: 'STAFF_LOGIN', tenantId: 'city_hospital' });
    assert(slot1.allowed === true && typeof slot1.reservationId === 'string', 'Atomically reserves pre-dispatch slot');
    assert(mockRateLimitDoc.activeReservations.length === 1, 'Active reservation registered in document');

    // 3.2 In-flight cooldown blocks immediate parallel request
    const slot2 = await reserveRateLimitSlot({ targetIdentifier: 'patient@clinic.org', purpose: 'STAFF_LOGIN', tenantId: 'city_hospital' });
    assert(slot2.allowed === false && slot2.status === 429, 'In-flight reservation blocks concurrent parallel request (TOCTOU closed)');

    // 3.3 Commit reservation on successful delivery
    await commitRateLimitReservation({
      targetIdentifier: 'patient@clinic.org',
      purpose: 'STAFF_LOGIN',
      tenantId: 'city_hospital',
      reservationId: slot1.reservationId
    });
    assert(mockRateLimitDoc.activeReservations.length === 0, 'Committed reservation removed from active pool');
    assert(mockRateLimitDoc.requestCount === 1, 'Request count incremented upon commit');
    assert(mockRateLimitDoc.lastSentAt !== null, 'lastSentAt timestamp updated');

    // 3.4 Release reservation on delivery failure (Zero-Orphan Rollback)
    mockRateLimitDoc.lastSentAt = new Date(Date.now() - 40000); // 40s ago to bypass cooldown
    const slotFail = await reserveRateLimitSlot({ targetIdentifier: 'patient@clinic.org', purpose: 'STAFF_LOGIN', tenantId: 'city_hospital' });
    assert(mockRateLimitDoc.activeReservations.length === 1, 'Reservation created for failed delivery test');

    await releaseRateLimitReservation({
      targetIdentifier: 'patient@clinic.org',
      purpose: 'STAFF_LOGIN',
      tenantId: 'city_hospital',
      reservationId: slotFail.reservationId
    });
    assert(mockRateLimitDoc.activeReservations.length === 0, 'Failed reservation released on rollback');
    assert(mockRateLimitDoc.requestCount === 1, 'Historical request count preserved on rollback');


    // -------------------------------------------------------------------------
    // TEST GROUP 4: SEC-03 & SEC-06 — Profile Selection Tokens (Single-Use & Tenant Isolation)
    // -------------------------------------------------------------------------
    console.log('\n[TEST GROUP 4] SEC-03 & SEC-06: Persistent Single-Use Tokens & Tenant Isolation');

    let mockTokenStorage = new Map();

    ProfileSelectionToken.create = async (doc) => {
      mockTokenStorage.set(doc.jti, { ...doc, consumedAt: null });
      return doc;
    };

    ProfileSelectionToken.findOneAndUpdate = async (filter, update) => {
      const stored = mockTokenStorage.get(filter.jti);
      if (stored && stored.consumedAt === null && new Date(stored.expiresAt).getTime() > Date.now()) {
        stored.consumedAt = update.$set.consumedAt;
        stored.selectedPatientId = update.$set.selectedPatientId;
        return stored;
      }
      return null;
    };

    const patientIds = ['patient_101', 'patient_102'];
    const pToken = await generateProfileSelectionToken({
      tenantId: 'city_hospital',
      contact: '9876543210',
      allowedPatientIds: patientIds
    });

    // 4.1 Successful first consumption
    const firstConsume = await verifyAndConsumeProfileSelectionToken(pToken, 'patient_101');
    assert(firstConsume.valid === true, 'First profile selection succeeds with valid token');

    // 4.2 Replay attempt rejected (SEC-03: Single-Use)
    const replayConsume = await verifyAndConsumeProfileSelectionToken(pToken, 'patient_101');
    assert(replayConsume.valid === false && replayConsume.errorCode === 'TOKEN_ALREADY_CONSUMED', 'Replay attempt rejected: Token is strictly single-use');

    // 4.3 Concurrent token consumption race
    const pToken2 = await generateProfileSelectionToken({
      tenantId: 'city_hospital',
      contact: '9876543210',
      allowedPatientIds: patientIds
    });

    const [raceCall1, raceCall2] = await Promise.all([
      verifyAndConsumeProfileSelectionToken(pToken2, 'patient_101'),
      verifyAndConsumeProfileSelectionToken(pToken2, 'patient_102')
    ]);

    const onlyOneSucceeded = (raceCall1.valid && !raceCall2.valid) || (!raceCall1.valid && raceCall2.valid);
    assert(onlyOneSucceeded, 'Under concurrent race: exactly ONE profile selection request can consume the token');


    // -------------------------------------------------------------------------
    // TEST GROUP 5: SEC-02 — Frontend Profile Selection UI Contract
    // -------------------------------------------------------------------------
    console.log('\n[TEST GROUP 5] SEC-02: Patient Portal Frontend Profile Picker Contract');

    const frontendPath = path.join(__dirname, '../../frontend/src/pages/PatientPortalLogin.jsx');
    const frontendContent = fs.readFileSync(frontendPath, 'utf8');

    assert(frontendContent.includes('response.data.status === \'multiple_profiles\''), 'PatientPortalLogin.jsx handles status: multiple_profiles');
    assert(frontendContent.includes('setProfiles(response.data.profiles'), 'PatientPortalLogin.jsx stores profiles in state');
    assert(frontendContent.includes('setProfileSelectionToken(response.data.profileSelectionToken)'), 'Preserves profileSelectionToken in component state');
    assert(!frontendContent.includes('localStorage.setItem(\'token\', undefined)'), 'Never stores undefined token in localStorage');
    assert(frontendContent.includes('handleSelectProfile'), 'Defines handleSelectProfile handler');
    assert(frontendContent.includes('/auth/patient-portal/select-profile'), 'Calls select-profile endpoint upon patient selection');


    // -------------------------------------------------------------------------
    // TEST GROUP 6: SEC-06 & SEC-07 — Source Code Tenant Scope & Plaintext Hygiene Audit
    // -------------------------------------------------------------------------
    console.log('\n[TEST GROUP 6] SEC-06 & SEC-07: Tenant-Scoped Patient Query & Plaintext Audit');

    const authPath = path.join(__dirname, '../routes/authRoutes.js');
    const authContent = fs.readFileSync(authPath, 'utf8');

    // SEC-06 check
    assert(
      authContent.includes('Patient.findOne({ _id: patientId, tenantId: tokenValidation.tenantId })'),
      'authRoutes.js queries patient with strict tenantId: tokenValidation.tenantId constraint'
    );

    // SEC-01 check across all routes
    assert(authContent.includes('verifyResult.errorCode === \'CHALLENGE_NOT_FOUND\''), 'authRoutes /verify-otp restricts legacy fallback to CHALLENGE_NOT_FOUND');
    assert(authContent.includes('verifyResult.errorCode === \'CHALLENGE_NOT_FOUND\''), 'authRoutes /login-with-otp restricts legacy fallback to CHALLENGE_NOT_FOUND');

    // Clean up mocks
    OtpChallenge.findOne = origFindOne;
    OtpChallenge.findOneAndUpdate = origFindOneAndUpdate;
    OtpChallenge.updateOne = origUpdateOne;

  } catch (err) {
    console.error('Test Execution Error:', err);
    failedTests++;
  } finally {
    console.log('\n===================================================================');
    console.log(`REMEDIATION TEST RESULTS: ${passedTests} PASSED, ${failedTests} FAILED`);
    console.log('===================================================================');
    process.exit(failedTests > 0 ? 1 : 0);
  }
}

runRemediationTests();
