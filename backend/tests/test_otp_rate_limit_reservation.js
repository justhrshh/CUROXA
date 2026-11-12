/**
 * QUROXA - OTP RATE-LIMIT RESERVATION REGRESSION & CONCURRENCY TEST SUITE
 * 
 * Verifies the fix for MongoServerError Code 40 (ConflictingUpdateOperators)
 * and rigorously tests all 11 required safety invariants (A through K):
 * 
 * A. Previous conflicting update scenario proof (proves old code failed with Code 40)
 * B. Successful reservation creation
 * C. Expired reservation cleanup
 * D. Maximum request limit enforcement (5 requests per 10-minute window)
 * E. Concurrent reservation attempts where only the permitted number succeed
 * F. Cooldown enforcement (lastSentAt and in-flight reservation cooldowns)
 * G. Failed SMS dispatch releasing only its own reservation (Zero-Orphan Rollback)
 * H. Failed dispatch preserving historical requestCount and failedAttempts
 * I. Duplicate commit and release idempotency
 * J. Interrupted dispatch and reservation expiry recovery
 * K. Cross-tenant reservation isolation
 * 
 * ZERO real SMS are sent by this test suite.
 */

const mongoose = require('mongoose');
const path = require('path');
const assert = require('assert');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const connectDB = require('../config/db');

const OtpRateLimit = require('../models/OtpRateLimit');
const OtpChallenge = require('../models/OtpChallenge');
const {
  reserveRateLimitSlot,
  commitRateLimitReservation,
  releaseRateLimitReservation,
  createAndDispatchOtp,
  COOLDOWN_SECONDS,
  MAX_REQUESTS_PER_WINDOW
} = require('../services/otp/otpService');

let passedTests = 0;
let totalTests = 0;

function reportTest(name, passed, detail) {
  totalTests++;
  if (passed) {
    passedTests++;
    console.log(`  [PASS] ${name}${detail ? ` (${detail})` : ''}`);
  } else {
    console.error(`  [FAIL] ${name}${detail ? ` (${detail})` : ''}`);
  }
}

async function runRegressionTestSuite() {
  console.log('===============================================================');
  console.log('  QUROXA OTP RATE-LIMIT RESERVATION VERIFICATION SUITE');
  console.log('===============================================================\n');

  await connectDB();
  console.log('Connected to Database:', mongoose.connection.name);

  const suitePrefix = 'test_reg_' + Date.now();
  const testTenant = 'quroxa_test_clinic';
  const testPurpose = 'PATIENT_PORTAL_AUTH';

  try {
    // -------------------------------------------------------------------------
    // TEST A: Previous Conflicting Update Scenario Proof
    // -------------------------------------------------------------------------
    console.log('\n--- Scenario A: Previous Conflicting Update Scenario Proof ---');
    const targetA = `${suitePrefix}_a`;
    let code40Caught = false;
    try {
      // Intentionally replicate the previous buggy update combining $set and $push on activeReservations
      await OtpRateLimit.updateOne(
        { targetIdentifier: targetA, purpose: testPurpose, tenantId: testTenant },
        {
          $set: { activeReservations: [] },
          $push: {
            activeReservations: {
              reservationId: 'dummy-id',
              reservedAt: new Date(),
              expiresAt: new Date(Date.now() + 45000)
            }
          }
        },
        { upsert: true }
      );
    } catch (err) {
      if (err.code === 40 || (err.errmsg && err.errmsg.includes('activeReservations'))) {
        code40Caught = true;
      }
    }
    reportTest(
      'A. Old conflicting update fails with MongoServerError Code 40',
      code40Caught,
      'Confirmed Code 40 ConflictingUpdateOperators'
    );

    // Now test that the corrected reserveRateLimitSlot succeeds without Code 40
    const resA = await reserveRateLimitSlot({
      targetIdentifier: targetA,
      purpose: testPurpose,
      tenantId: testTenant
    });
    reportTest(
      'A. Corrected reserveRateLimitSlot succeeds without Code 40',
      resA.allowed === true && typeof resA.reservationId === 'string',
      `Reservation ID: ${resA.reservationId}`
    );

    // -------------------------------------------------------------------------
    // TEST B: Successful Reservation Creation
    // -------------------------------------------------------------------------
    console.log('\n--- Scenario B: Successful Reservation Creation ---');
    const targetB = `${suitePrefix}_b`;
    const resB = await reserveRateLimitSlot({
      targetIdentifier: targetB,
      purpose: testPurpose,
      tenantId: testTenant
    });
    const docB = await OtpRateLimit.findOne({ targetIdentifier: targetB, purpose: testPurpose, tenantId: testTenant });
    const bValid = resB.allowed === true &&
      docB &&
      docB.activeReservations.length === 1 &&
      docB.activeReservations[0].reservationId === resB.reservationId &&
      docB.requestCount === 0;
    reportTest('B. Reservation created with correct initial document state', bValid);

    // -------------------------------------------------------------------------
    // TEST C: Expired Reservation Cleanup
    // -------------------------------------------------------------------------
    console.log('\n--- Scenario C: Expired Reservation Cleanup ---');
    const targetC = `${suitePrefix}_c`;
    // Create document with 1 expired reservation and requestCount: 4
    await OtpRateLimit.create({
      targetIdentifier: targetC,
      purpose: testPurpose,
      tenantId: testTenant,
      requestCount: 4,
      windowResetAt: new Date(Date.now() + 600000),
      lastSentAt: new Date(Date.now() - 40000),
      activeReservations: [
        {
          reservationId: 'expired-c-1',
          reservedAt: new Date(Date.now() - 50000),
          expiresAt: new Date(Date.now() - 5000) // 5 seconds in the past
        }
      ]
    });

    const resC = await reserveRateLimitSlot({
      targetIdentifier: targetC,
      purpose: testPurpose,
      tenantId: testTenant
    });
    const docC = await OtpRateLimit.findOne({ targetIdentifier: targetC, purpose: testPurpose, tenantId: testTenant });
    const cValid = resC.allowed === true &&
      docC.activeReservations.length === 1 &&
      docC.activeReservations[0].reservationId === resC.reservationId &&
      docC.activeReservations.every(r => r.reservationId !== 'expired-c-1');
    reportTest('C. Expired reservation pruned and new reservation granted', cValid);

    // -------------------------------------------------------------------------
    // TEST D: Maximum Request Limit Enforcement
    // -------------------------------------------------------------------------
    console.log('\n--- Scenario D: Maximum Request Limit Enforcement ---');
    const targetD = `${suitePrefix}_d`;
    await OtpRateLimit.create({
      targetIdentifier: targetD,
      purpose: testPurpose,
      tenantId: testTenant,
      requestCount: MAX_REQUESTS_PER_WINDOW, // 5
      windowResetAt: new Date(Date.now() + 600000),
      lastSentAt: new Date(Date.now() - 40000),
      activeReservations: []
    });

    const resD = await reserveRateLimitSlot({
      targetIdentifier: targetD,
      purpose: testPurpose,
      tenantId: testTenant
    });
    const dValid = resD.allowed === false &&
      resD.status === 429 &&
      resD.error === 'Too many verification code requests. Please try again in 10 minutes.';
    reportTest('D. Exceeding MAX_REQUESTS_PER_WINDOW returns 429 rate limit error', dValid);

    // -------------------------------------------------------------------------
    // TEST E: Concurrent Reservation Attempts
    // -------------------------------------------------------------------------
    console.log('\n--- Scenario E: Concurrent Reservation Protection ---');
    const targetE = `${suitePrefix}_e`;
    // Set up document with requestCount: 4, cooled down. Exactly 1 slot remaining!
    await OtpRateLimit.create({
      targetIdentifier: targetE,
      purpose: testPurpose,
      tenantId: testTenant,
      requestCount: 4,
      windowResetAt: new Date(Date.now() + 600000),
      lastSentAt: new Date(Date.now() - 40000),
      activeReservations: []
    });

    // Fire 8 parallel reservation requests at the exact same time
    const concurrentResults = await Promise.all(
      Array.from({ length: 8 }).map(() =>
        reserveRateLimitSlot({
          targetIdentifier: targetE,
          purpose: testPurpose,
          tenantId: testTenant
        })
      )
    );

    const allowedE = concurrentResults.filter(r => r.allowed);
    const rejectedE = concurrentResults.filter(r => !r.allowed);
    const docE = await OtpRateLimit.findOne({ targetIdentifier: targetE, purpose: testPurpose, tenantId: testTenant });

    const eValid = allowedE.length === 1 &&
      rejectedE.length === 7 &&
      docE.activeReservations.length === 1 &&
      (docE.requestCount + docE.activeReservations.length) <= MAX_REQUESTS_PER_WINDOW;
    reportTest(
      'E. Concurrent requests race-free: exactly 1 allowed out of 8',
      eValid,
      `${allowedE.length} allowed, ${rejectedE.length} rejected`
    );

    // -------------------------------------------------------------------------
    // TEST F: Cooldown Enforcement (lastSentAt & in-flight reservation)
    // -------------------------------------------------------------------------
    console.log('\n--- Scenario F: Cooldown Enforcement ---');
    const targetF1 = `${suitePrefix}_f1`;
    // F1: Cooldown on lastSentAt (sent 10 seconds ago)
    await OtpRateLimit.create({
      targetIdentifier: targetF1,
      purpose: testPurpose,
      tenantId: testTenant,
      requestCount: 1,
      windowResetAt: new Date(Date.now() + 600000),
      lastSentAt: new Date(Date.now() - 10000),
      activeReservations: []
    });

    const resF1 = await reserveRateLimitSlot({
      targetIdentifier: targetF1,
      purpose: testPurpose,
      tenantId: testTenant
    });
    const f1Valid = resF1.allowed === false &&
      resF1.status === 429 &&
      resF1.error.includes('Please wait') &&
      resF1.error.includes('seconds before requesting a new code');
    reportTest('F1. lastSentAt cooldown (< 30s) correctly blocks reservation', f1Valid, resF1.error);

    // F2: Cooldown on in-flight reservation (reserved 5 seconds ago)
    const targetF2 = `${suitePrefix}_f2`;
    await OtpRateLimit.create({
      targetIdentifier: targetF2,
      purpose: testPurpose,
      tenantId: testTenant,
      requestCount: 1,
      windowResetAt: new Date(Date.now() + 600000),
      lastSentAt: new Date(Date.now() - 40000),
      activeReservations: [
        {
          reservationId: 'inflight-f2',
          reservedAt: new Date(Date.now() - 5000),
          expiresAt: new Date(Date.now() + 40000)
        }
      ]
    });

    const resF2 = await reserveRateLimitSlot({
      targetIdentifier: targetF2,
      purpose: testPurpose,
      tenantId: testTenant
    });
    const f2Valid = resF2.allowed === false &&
      resF2.status === 429 &&
      resF2.error.includes('A verification code request is currently in progress');
    reportTest('F2. In-flight reservation cooldown (< 30s) correctly blocks reservation', f2Valid, resF2.error);

    // -------------------------------------------------------------------------
    // TEST G: Failed SMS Dispatch Releasing Only Its Own Reservation
    // -------------------------------------------------------------------------
    console.log('\n--- Scenario G: Failed SMS Dispatch Zero-Orphan Rollback ---');
    const targetG = '9810502340';
    let rollbackExecuted = false;

    // Dispatch OTP using mock transport that simulates SMS provider rejection
    const dispatchG = await createAndDispatchOtp({
      targetIdentifier: targetG,
      identifierType: 'phone',
      tenantId: testTenant,
      purpose: 'PATIENT_PORTAL_AUTH',
      deliveryChannel: 'sms',
      onRollback: async () => {
        rollbackExecuted = true;
      },
      _mockSmsTransport: async () => {
        // Return simulated provider network failure
        return {
          success: false,
          deliveryStatus: 'failed',
          provider: 'PING4SMS',
          error: 'Simulated gateway timeout'
        };
      }
    });

    const docG = await OtpRateLimit.findOne({ targetIdentifier: targetG, purpose: 'PATIENT_PORTAL_AUTH', tenantId: testTenant });
    const challengesG = await OtpChallenge.find({ targetIdentifier: targetG, purpose: 'PATIENT_PORTAL_AUTH', tenantId: testTenant });

    const gValid = dispatchG.success === false &&
      rollbackExecuted === true &&
      docG &&
      docG.activeReservations.length === 0 &&
      challengesG.length === 0;
    reportTest('G. Failed SMS dispatch triggers Zero-Orphan Rollback and releases reservation', gValid);

    // -------------------------------------------------------------------------
    // TEST H: Failed Dispatch Preserving Historical requestCount & failedAttempts
    // -------------------------------------------------------------------------
    console.log('\n--- Scenario H: Historical Abuse Counters Preserved on Rollback ---');
    const targetH = `${suitePrefix}_h`;
    await OtpRateLimit.create({
      targetIdentifier: targetH,
      purpose: testPurpose,
      tenantId: testTenant,
      requestCount: 2,
      failedAttempts: 3,
      windowResetAt: new Date(Date.now() + 600000),
      lastSentAt: new Date(Date.now() - 40000),
      activeReservations: []
    });

    // Run failed dispatch
    await createAndDispatchOtp({
      targetIdentifier: targetH,
      identifierType: 'phone',
      tenantId: testTenant,
      purpose: testPurpose,
      deliveryChannel: 'sms',
      _mockSmsTransport: async () => ({ success: false, deliveryStatus: 'failed', error: 'Network failure' })
    });

    const docH = await OtpRateLimit.findOne({ targetIdentifier: targetH, purpose: testPurpose, tenantId: testTenant });
    const hValid = docH &&
      docH.requestCount === 2 &&
      docH.failedAttempts === 3 &&
      docH.activeReservations.length === 0;
    reportTest('H. Failed dispatch preserves requestCount=2 and failedAttempts=3 without reset', hValid);

    // -------------------------------------------------------------------------
    // TEST I: Duplicate Commit and Release Idempotency
    // -------------------------------------------------------------------------
    console.log('\n--- Scenario I: Idempotent Commit & Release ---');
    const targetI = `${suitePrefix}_i`;
    const resI = await reserveRateLimitSlot({ targetIdentifier: targetI, purpose: testPurpose, tenantId: testTenant });
    
    // First commit
    const commit1 = await commitRateLimitReservation({
      targetIdentifier: targetI,
      purpose: testPurpose,
      tenantId: testTenant,
      reservationId: resI.reservationId
    });
    // Duplicate commit
    const commit2 = await commitRateLimitReservation({
      targetIdentifier: targetI,
      purpose: testPurpose,
      tenantId: testTenant,
      reservationId: resI.reservationId
    });

    const docI = await OtpRateLimit.findOne({ targetIdentifier: targetI, purpose: testPurpose, tenantId: testTenant });
    const iCommitValid = commit1.modifiedCount === 1 &&
      commit2.modifiedCount === 0 &&
      docI.requestCount === 1 &&
      docI.activeReservations.length === 0;
    reportTest('I1. Duplicate commitRateLimitReservation is idempotent (increments only once)', iCommitValid);

    // Test duplicate release
    // Bypass cooldown to acquire second slot
    await OtpRateLimit.updateOne(
      { targetIdentifier: targetI, purpose: testPurpose, tenantId: testTenant },
      { $set: { lastSentAt: new Date(Date.now() - 40000) } }
    );
    const resI2 = await reserveRateLimitSlot({ targetIdentifier: targetI, purpose: testPurpose, tenantId: testTenant });
    assert(resI2.allowed === true, 'resI2 should be allowed');

    const rel1 = await releaseRateLimitReservation({
      targetIdentifier: targetI,
      purpose: testPurpose,
      tenantId: testTenant,
      reservationId: resI2.reservationId
    });
    const rel2 = await releaseRateLimitReservation({
      targetIdentifier: targetI,
      purpose: testPurpose,
      tenantId: testTenant,
      reservationId: resI2.reservationId
    });

    const docI2 = await OtpRateLimit.findOne({ targetIdentifier: targetI, purpose: testPurpose, tenantId: testTenant });
    const iReleaseValid = rel1.acknowledged !== false &&
      rel2.acknowledged !== false &&
      docI2.requestCount === 1 &&
      docI2.activeReservations.length === 0;
    reportTest('I2. Duplicate releaseRateLimitReservation is idempotent without error', iReleaseValid);

    // -------------------------------------------------------------------------
    // TEST J: Interrupted Dispatch & Reservation Expiry Recovery
    // -------------------------------------------------------------------------
    console.log('\n--- Scenario J: Interrupted Dispatch Recovery ---');
    const targetJ = `${suitePrefix}_j`;
    // Create an abandoned reservation (simulating server crash during dispatch)
    await OtpRateLimit.create({
      targetIdentifier: targetJ,
      purpose: testPurpose,
      tenantId: testTenant,
      requestCount: 4,
      windowResetAt: new Date(Date.now() + 600000),
      lastSentAt: new Date(Date.now() - 40000),
      activeReservations: [
        {
          reservationId: 'abandoned-crash-res',
          reservedAt: new Date(Date.now() - 50000),
          expiresAt: new Date(Date.now() - 5000) // 5 seconds expired
        }
      ]
    });

    // The user should not be permanently locked out; expired reservation must recover automatically
    const resJ = await reserveRateLimitSlot({ targetIdentifier: targetJ, purpose: testPurpose, tenantId: testTenant });
    const docJ = await OtpRateLimit.findOne({ targetIdentifier: targetJ, purpose: testPurpose, tenantId: testTenant });
    const jValid = resJ.allowed === true &&
      docJ.activeReservations.length === 1 &&
      docJ.activeReservations[0].reservationId === resJ.reservationId;
    reportTest('J. Abandoned/interrupted reservation automatically expires and recovers slot', jValid);

    // -------------------------------------------------------------------------
    // TEST K: Cross-Tenant Reservation Isolation
    // -------------------------------------------------------------------------
    console.log('\n--- Scenario K: Cross-Tenant Reservation Isolation ---');
    const sharedPhone = '9876543210';
    const tenantA = 'hospital_alpha';
    const tenantB = 'hospital_beta';

    // Tenant A exhausts its rate limit
    await OtpRateLimit.create({
      targetIdentifier: sharedPhone,
      purpose: testPurpose,
      tenantId: tenantA,
      requestCount: MAX_REQUESTS_PER_WINDOW,
      windowResetAt: new Date(Date.now() + 600000),
      lastSentAt: new Date(),
      activeReservations: []
    });

    // Tenant B attempts reservation for same phone number
    const resTenantB = await reserveRateLimitSlot({
      targetIdentifier: sharedPhone,
      purpose: testPurpose,
      tenantId: tenantB
    });

    const kValid = resTenantB.allowed === true && typeof resTenantB.reservationId === 'string';
    reportTest('K. Tenant A rate limit exhaustion does NOT affect Tenant B (strict isolation)', kValid);

    // Cleanup all test records
    await OtpRateLimit.deleteMany({ targetIdentifier: { $regex: suitePrefix } });
    await OtpRateLimit.deleteMany({ targetIdentifier: sharedPhone });
    await OtpRateLimit.deleteMany({ targetIdentifier: targetG });
    await OtpChallenge.deleteMany({ targetIdentifier: targetG });

  } catch (err) {
    console.error('\nUNEXPECTED SUITE ERROR:', err);
  } finally {
    console.log('\n===============================================================');
    console.log(`  TEST RESULTS: ${passedTests} / ${totalTests} PASSED`);
    console.log('===============================================================\n');
    await mongoose.connection.close();
    process.exit(passedTests === totalTests ? 0 : 1);
  }
}

runRegressionTestSuite().catch(err => {
  console.error('Fatal Test Runner Error:', err);
  process.exit(1);
});
