/**
 * CENTRALIZED OTP CHALLENGE & VERIFICATION SERVICE (HARDENED)
 * 
 * Provides:
 * - Cryptographically secure PRNG OTP generation [100000, 999999]
 * - Server-secret HMAC-SHA256 hashing bound to identity and hospital tenant
 * - Single-use atomic consumption guaranteeing concurrency safety
 * - Pre-dispatch atomic reservation rate-limiting (TOCTOU race free)
 * - Atomic failed-attempt tracking with guaranteed 5-attempt brute force lockout
 * - Zero-Orphan Rollback on failed email/SMS delivery
 * - Tenant isolation (no silent default fallbacks)
 * - Persistent single-use profile selection tokens with database jti tracking
 */

const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const OtpChallenge = require('../../models/OtpChallenge');
const OtpRateLimit = require('../../models/OtpRateLimit');
const ProfileSelectionToken = require('../../models/ProfileSelectionToken');
const { sendOtpNotification } = require('../notificationService');
const { getJwtSecret } = require('../../config/env');

const COOLDOWN_SECONDS = 30;
const MAX_REQUESTS_PER_WINDOW = 5;
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000; // 10 minutes
const MAX_VERIFY_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 minutes
const RESERVATION_EXPIRY_MS = 45 * 1000; // 45 seconds to cover notification dispatch

/**
 * Returns HMAC secret key bound to environment JWT secret.
 */
function getOtpHmacSecret() {
  try {
    return getJwtSecret();
  } catch (_) {
    return process.env.JWT_SECRET || 'quroxa_super_secure_secret_key_2026';
  }
}

/**
 * Generates a cryptographically strong 6-digit numeric OTP.
 * Range: [100000, 999999] strictly.
 */
function generateOtp() {
  return crypto.randomInt(100000, 1000000).toString();
}

/**
 * Computes HMAC-SHA256 hash of an OTP bound to identity, purpose, and hospital tenant.
 */
function hashOtp(code, targetIdentifier, tenantId, purpose) {
  const secret = getOtpHmacSecret();
  const cleanCode = String(code || '').trim();
  const cleanId = String(targetIdentifier || '').toLowerCase().trim();
  const cleanTenant = String(tenantId || '').toLowerCase().trim();
  const cleanPurpose = String(purpose || '').trim();

  return crypto.createHmac('sha256', secret)
    .update(`${cleanCode}:${cleanId}:${cleanTenant}:${cleanPurpose}`)
    .digest('hex');
}

/**
 * Atomically reserves a rate limit slot prior to notification dispatch.
 * Concurrency-safe against TOCTOU parallel dispatch bypasses and eliminates
 * MongoDB conflicting update operator errors.
 */
async function reserveRateLimitSlot({ targetIdentifier, purpose, tenantId }) {
  const cleanId = String(targetIdentifier).toLowerCase().trim();
  const cleanTenant = String(tenantId).toLowerCase().trim();
  const now = Date.now();
  const nowDate = new Date(now);
  const reservationId = crypto.randomUUID();
  const reservationExpiry = new Date(now + RESERVATION_EXPIRY_MS);
  const newReset = new Date(now + RATE_LIMIT_WINDOW_MS);
  const cooldownThreshold = new Date(now - COOLDOWN_SECONDS * 1000);

  // 1. Ensure document exists and window is maintained
  let rateRecord = await OtpRateLimit.findOne({
    targetIdentifier: cleanId,
    purpose,
    tenantId: cleanTenant
  });

  if (!rateRecord) {
    try {
      rateRecord = await OtpRateLimit.findOneAndUpdate(
        { targetIdentifier: cleanId, purpose, tenantId: cleanTenant },
        {
          $setOnInsert: {
            targetIdentifier: cleanId,
            purpose,
            tenantId: cleanTenant,
            requestCount: 0,
            activeReservations: [],
            windowResetAt: newReset,
            lastSentAt: null,
            failedAttempts: 0,
            lockUntil: null
          }
        },
        { upsert: true, returnDocument: 'after' }
      );
    } catch (_) {
      rateRecord = await OtpRateLimit.findOne({ targetIdentifier: cleanId, purpose, tenantId: cleanTenant });
    }
  } else if (rateRecord.windowResetAt <= nowDate) {
    // Atomically reset window ONLY if windowResetAt is still <= nowDate.
    // If a concurrent request already reset it, this update will not match and will not overwrite.
    const resetResult = await OtpRateLimit.findOneAndUpdate(
      {
        targetIdentifier: cleanId,
        purpose,
        tenantId: cleanTenant,
        windowResetAt: { $lte: nowDate }
      },
      {
        $set: {
          requestCount: 0,
          activeReservations: [],
          windowResetAt: newReset
        }
      },
      { returnDocument: 'after' }
    );
    if (resetResult) {
      rateRecord = resetResult;
    } else {
      rateRecord = await OtpRateLimit.findOne({ targetIdentifier: cleanId, purpose, tenantId: cleanTenant });
    }
  } else {
    // Purge expired reservations atomically (only purges items with expiresAt <= nowDate)
    await OtpRateLimit.updateOne(
      { targetIdentifier: cleanId, purpose, tenantId: cleanTenant },
      { $pull: { activeReservations: { expiresAt: { $lte: nowDate } } } }
    ).catch(() => {});
  }

  // 2. Pre-check lockout for instant rejection
  if (rateRecord && rateRecord.lockUntil && new Date(rateRecord.lockUntil).getTime() > now) {
    const waitMin = Math.ceil((new Date(rateRecord.lockUntil).getTime() - now) / 60000);
    return {
      allowed: false,
      error: `Too many invalid attempts. Please try again in ${waitMin} minutes.`,
      status: 429
    };
  }

  // 3. Pre-check lastSentAt cooldown for instant rejection
  if (rateRecord && rateRecord.lastSentAt) {
    const timeSinceLast = now - new Date(rateRecord.lastSentAt).getTime();
    if (timeSinceLast < COOLDOWN_SECONDS * 1000) {
      const waitSec = Math.ceil((COOLDOWN_SECONDS * 1000 - timeSinceLast) / 1000);
      return {
        allowed: false,
        error: `Please wait ${waitSec} seconds before requesting a new code.`,
        status: 429
      };
    }
  }

  // 4. Pre-check in-flight reservation cooldown
  const validReservations = (rateRecord?.activeReservations || []).filter(r => new Date(r.expiresAt).getTime() > now);
  if (validReservations.length > 0) {
    const latestReservation = validReservations[validReservations.length - 1];
    const timeSinceRes = now - new Date(latestReservation.reservedAt).getTime();
    if (timeSinceRes < COOLDOWN_SECONDS * 1000) {
      const waitSec = Math.ceil((COOLDOWN_SECONDS * 1000 - timeSinceRes) / 1000);
      return {
        allowed: false,
        error: `A verification code request is currently in progress. Please wait ${waitSec} seconds.`,
        status: 429
      };
    }
  }

  // 5. Pre-check capacity limit
  const totalReserved = (rateRecord?.requestCount || 0) + validReservations.length;
  if (totalReserved >= MAX_REQUESTS_PER_WINDOW) {
    return {
      allowed: false,
      error: 'Too many verification code requests. Please try again in 10 minutes.',
      status: 429
    };
  }

  // 6. ATOMIC RESERVATION ACQUISITION
  // Atomically validates non-lockout, cooldown, and total capacity before pushing reservation
  const updatedDoc = await OtpRateLimit.findOneAndUpdate(
    {
      targetIdentifier: cleanId,
      purpose,
      tenantId: cleanTenant,
      $or: [
        { lockUntil: null },
        { lockUntil: { $lte: nowDate } }
      ],
      $and: [
        {
          $or: [
            { lastSentAt: null },
            { lastSentAt: { $lte: cooldownThreshold } }
          ]
        },
        {
          'activeReservations.reservedAt': { $not: { $gt: cooldownThreshold } }
        }
      ],
      $expr: {
        $lt: [
          { $add: ['$requestCount', { $size: '$activeReservations' }] },
          MAX_REQUESTS_PER_WINDOW
        ]
      }
    },
    {
      $push: {
        activeReservations: {
          reservationId,
          reservedAt: nowDate,
          expiresAt: reservationExpiry
        }
      }
    },
    { returnDocument: 'after' }
  );

  if (updatedDoc) {
    return { allowed: true, reservationId };
  }

  // 7. Diagnostic classification on atomic rejection (concurrent collision)
  const current = await OtpRateLimit.findOne({
    targetIdentifier: cleanId,
    purpose,
    tenantId: cleanTenant
  });

  if (current && current.lockUntil && new Date(current.lockUntil).getTime() > now) {
    const waitMin = Math.ceil((new Date(current.lockUntil).getTime() - now) / 60000);
    return {
      allowed: false,
      error: `Too many invalid attempts. Please try again in ${waitMin} minutes.`,
      status: 429
    };
  }

  if (current && current.lastSentAt) {
    const timeSinceLast = now - new Date(current.lastSentAt).getTime();
    if (timeSinceLast < COOLDOWN_SECONDS * 1000) {
      const waitSec = Math.ceil((COOLDOWN_SECONDS * 1000 - timeSinceLast) / 1000);
      return {
        allowed: false,
        error: `Please wait ${waitSec} seconds before requesting a new code.`,
        status: 429
      };
    }
  }

  const activeRes = (current?.activeReservations || []).filter(r => new Date(r.expiresAt).getTime() > now);
  if (activeRes.length > 0) {
    const latestRes = activeRes[activeRes.length - 1];
    const timeSinceRes = now - new Date(latestRes.reservedAt).getTime();
    if (timeSinceRes < COOLDOWN_SECONDS * 1000) {
      const waitSec = Math.ceil((COOLDOWN_SECONDS * 1000 - timeSinceRes) / 1000);
      return {
        allowed: false,
        error: `A verification code request is currently in progress. Please wait ${waitSec} seconds.`,
        status: 429
      };
    }
  }

  return {
    allowed: false,
    error: 'Too many verification code requests. Please try again in 10 minutes.',
    status: 429
  };
}

/**
 * Commits a successful OTP send by finalizing the reservation and updating lastSentAt.
 * Idempotently matches activeReservations.reservationId so duplicate invocations cannot
 * over-increment requestCount.
 */
async function commitRateLimitReservation({ targetIdentifier, purpose, tenantId, reservationId }) {
  const cleanId = String(targetIdentifier).toLowerCase().trim();
  const cleanTenant = String(tenantId).toLowerCase().trim();
  try {
    return await OtpRateLimit.updateOne(
      {
        targetIdentifier: cleanId,
        purpose,
        tenantId: cleanTenant,
        'activeReservations.reservationId': reservationId
      },
      {
        $pull: { activeReservations: { reservationId } },
        $inc: { requestCount: 1 },
        $set: { lastSentAt: new Date() }
      }
    );
  } catch (err) {
    return { acknowledged: false, error: err.message };
  }
}

/**
 * Releases a reserved slot on delivery failure without erasing historical counters.
 * Idempotent: pulling an absent or already-released reservationId is a safe no-op.
 */
async function releaseRateLimitReservation({ targetIdentifier, purpose, tenantId, reservationId }) {
  const cleanId = String(targetIdentifier).toLowerCase().trim();
  const cleanTenant = String(tenantId).toLowerCase().trim();
  try {
    return await OtpRateLimit.updateOne(
      {
        targetIdentifier: cleanId,
        purpose,
        tenantId: cleanTenant,
        'activeReservations.reservationId': reservationId
      },
      {
        $pull: { activeReservations: { reservationId } }
      }
    );
  } catch (err) {
    return { acknowledged: false, error: err.message };
  }
}

/**
 * Dispatches an OTP challenge with pre-reserved rate limiting and Zero-Orphan Rollback.
 */
async function createAndDispatchOtp({
  targetIdentifier,
  identifierType,
  tenantId,
  purpose,
  deliveryChannel,
  expiryMinutes = 10,
  metadata = {},
  subject,
  html,
  senderName,
  allowFallback = false,
  fallbackEmail,
  onRollback,
  _mockSmsTransport,
  _mockEmailTransport
}) {
  if (!tenantId || typeof tenantId !== 'string') {
    return { success: false, status: 400, error: 'tenantId is mandatory for OTP security challenge.' };
  }

  const cleanId = String(targetIdentifier).toLowerCase().trim();
  const cleanTenant = String(tenantId).toLowerCase().trim();

  // 1. Pre-reserve rate limit slot to close TOCTOU window
  const reservation = await reserveRateLimitSlot({ targetIdentifier: cleanId, purpose, tenantId: cleanTenant });
  if (!reservation.allowed) {
    return { success: false, status: reservation.status, error: reservation.error };
  }

  const reservationId = reservation.reservationId;

  // 2. Generate and hash OTP
  const rawOtp = generateOtp();
  const hashedOtp = hashOtp(rawOtp, cleanId, cleanTenant, purpose);
  const expiresAt = new Date(Date.now() + expiryMinutes * 60 * 1000);

  // 3. Upsert staged OtpChallenge record
  const challenge = await OtpChallenge.findOneAndUpdate(
    { targetIdentifier: cleanId, purpose, tenantId: cleanTenant },
    {
      $set: {
        identifierType,
        hashedOtp,
        expiresAt,
        attempts: 0,
        lockUntil: null,
        consumedAt: null,
        deliveryChannel,
        deliveryStatus: 'sent',
        metadata
      }
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  // 4. Dispatch notification via selected channel
  const dispatchResult = await sendOtpNotification({
    channel: deliveryChannel,
    target: targetIdentifier,
    otp: rawOtp,
    tenantId: cleanTenant,
    subject,
    html,
    senderName,
    allowFallback,
    fallbackEmail,
    _mockSmsTransport,
    _mockEmailTransport
  });

  // 5. Zero-Orphan Rollback on delivery failure
  if (!dispatchResult.success) {
    console.warn(`[OTP] Delivery failed for ${cleanId}. Executing Zero-Orphan Rollback.`);
    await OtpChallenge.deleteOne({ _id: challenge._id }).catch(() => {});
    await releaseRateLimitReservation({ targetIdentifier: cleanId, purpose, tenantId: cleanTenant, reservationId });

    if (onRollback && typeof onRollback === 'function') {
      try { await onRollback(); } catch (_) {}
    }
    return {
      success: false,
      status: 500,
      error: deliveryChannel === 'sms' 
        ? 'Failed to deliver SMS verification code. Please check the mobile number or try again later.'
        : 'Failed to deliver email verification code. Please check your email or mail server settings.',
      details: dispatchResult.error
    };
  }

  // 6. Delivery succeeded: Commit rate limit reservation
  await commitRateLimitReservation({ targetIdentifier: cleanId, purpose, tenantId: cleanTenant, reservationId });

  return {
    success: true,
    message: 'If the provided credentials are valid, a verification code has been dispatched.',
    channel: dispatchResult.channel,
    rawOtp: process.env.NODE_ENV === 'test' ? rawOtp : undefined
  };
}

/**
 * Atomically verifies an OTP challenge with exact-condition failure classification
 * and race-free failed attempt tracking.
 */
async function atomicVerifyOtp({ targetIdentifier, tenantId, purpose, otpCandidate, candidateOtp }) {
  const candidate = otpCandidate || candidateOtp;
  if (!targetIdentifier || !tenantId || !purpose || !candidate) {
    return {
      success: false,
      status: 400,
      error: 'Identifier, tenant, purpose, and verification code are required.',
      errorCode: 'MISSING_PARAMETERS'
    };
  }

  const cleanId = String(targetIdentifier).toLowerCase().trim();
  const cleanTenant = String(tenantId).toLowerCase().trim();
  const cleanCandidate = String(candidate).trim();
  const now = Date.now();

  // 1. Locate active challenge
  const challenge = await OtpChallenge.findOne({
    targetIdentifier: cleanId,
    purpose,
    tenantId: cleanTenant
  });

  // Strict classification of missing or non-usable states
  if (!challenge) {
    return {
      success: false,
      status: 404,
      error: 'No active verification challenge found. Please request a new code.',
      errorCode: 'CHALLENGE_NOT_FOUND'
    };
  }

  if (challenge.consumedAt !== null) {
    return {
      success: false,
      status: 400,
      error: 'Verification code has already been used. Please request a new code.',
      errorCode: 'CHALLENGE_CONSUMED'
    };
  }

  if (challenge.expiresAt < new Date()) {
    return {
      success: false,
      status: 400,
      error: 'Verification code has expired. Please request a new code.',
      errorCode: 'CHALLENGE_EXPIRED'
    };
  }

  // 2. Check active brute-force lockout
  if (challenge.lockUntil && new Date(challenge.lockUntil).getTime() > now) {
    const waitMin = Math.ceil((new Date(challenge.lockUntil).getTime() - now) / 60000);
    return {
      success: false,
      status: 429,
      error: `Too many invalid attempts. Account temporarily locked for ${waitMin} minutes.`,
      errorCode: 'ACCOUNT_LOCKED'
    };
  }

  // 3. Constant-time timing-safe hash comparison
  const candidateHash = hashOtp(cleanCandidate, cleanId, cleanTenant, purpose);
  let isMatch = false;
  try {
    const storedBuf = Buffer.from(challenge.hashedOtp, 'hex');
    const candBuf = Buffer.from(candidateHash, 'hex');
    if (storedBuf.length === candBuf.length && crypto.timingSafeEqual(storedBuf, candBuf)) {
      isMatch = true;
    }
  } catch (_) {
    isMatch = false;
  }

  if (!isMatch) {
    // Atomically increment attempts and check returned value (SEC-04: fixes stale read race)
    const updatedDoc = await OtpChallenge.findOneAndUpdate(
      { _id: challenge._id },
      { $inc: { attempts: 1 } },
      { new: true }
    );

    const currentAttempts = updatedDoc ? updatedDoc.attempts : ((challenge.attempts || 0) + 1);

    if (currentAttempts >= MAX_VERIFY_ATTEMPTS) {
      const lockDate = new Date(now + LOCKOUT_DURATION_MS);
      await OtpChallenge.findOneAndUpdate({ _id: challenge._id }, { $set: { lockUntil: lockDate } }, { new: true });
      await OtpRateLimit.updateOne(
        { targetIdentifier: cleanId, purpose, tenantId: cleanTenant },
        { $set: { lockUntil: lockDate } }
      ).catch(() => {});

      return {
        success: false,
        status: 429,
        error: 'Too many invalid attempts. Account temporarily locked for 15 minutes.',
        errorCode: 'ACCOUNT_LOCKED'
      };
    }

    return {
      success: false,
      status: 400,
      error: `Invalid verification code. ${MAX_VERIFY_ATTEMPTS - currentAttempts} attempts remaining.`,
      errorCode: 'INVALID_OTP'
    };
  }

  // 4. ATOMIC SINGLE-USE CONSUMPTION
  const consumedChallenge = await OtpChallenge.findOneAndUpdate(
    { _id: challenge._id, consumedAt: null },
    { $set: { consumedAt: new Date() } },
    { new: true }
  );

  if (!consumedChallenge) {
    return {
      success: false,
      status: 400,
      error: 'This verification code was already consumed by a concurrent request.',
      errorCode: 'CONCURRENT_CONSUMPTION'
    };
  }

  // Reset failed attempts in rate-limit record on successful verification
  await OtpRateLimit.updateOne(
    { targetIdentifier: cleanId, purpose, tenantId: cleanTenant },
    { $set: { failedAttempts: 0, lockUntil: null } }
  ).catch(() => {});

  return {
    success: true,
    status: 200,
    challenge: consumedChallenge
  };
}

/**
 * Generates a short-lived, single-use, tenant-scoped authorization token
 * backed by persistent database jti tracking (SEC-03).
 */
async function generateProfileSelectionToken({ tenantId, contact, allowedPatientIds }) {
  const secretKey = getOtpHmacSecret();
  const jti = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

  // Persist token in MongoDB for single-use verification
  try {
    if (ProfileSelectionToken && typeof ProfileSelectionToken.create === 'function') {
      await ProfileSelectionToken.create({
        jti,
        tenantId: String(tenantId).toLowerCase().trim(),
        contact: String(contact).trim(),
        allowedPatientIds: allowedPatientIds.map(String),
        expiresAt
      });
    }
  } catch (err) {
    // Graceful handling if running outside active DB connection
  }

  return jwt.sign(
    {
      jti,
      tenantId,
      contact,
      allowedPatientIds: allowedPatientIds.map(String),
      purpose: 'PROFILE_SELECTION'
    },
    secretKey,
    { expiresIn: '5m' }
  );
}

/**
 * Validates profile selection token claims and patient authorization without consuming.
 */
function verifyProfileSelectionToken(token, requestedPatientId) {
  const secretKey = getOtpHmacSecret();
  let decoded;
  try {
    decoded = jwt.verify(token, secretKey);
  } catch (err) {
    return { valid: false, error: 'Profile selection token has expired or is invalid. Please verify OTP again.', errorCode: 'INVALID_OR_EXPIRED_TOKEN' };
  }

  if (decoded.purpose !== 'PROFILE_SELECTION') {
    return { valid: false, error: 'Invalid token purpose.', errorCode: 'INVALID_TOKEN_PURPOSE' };
  }

  const targetStr = String(requestedPatientId);
  if (!decoded.allowedPatientIds || !decoded.allowedPatientIds.includes(targetStr)) {
    return { valid: false, error: 'Access denied. The requested patient profile is not authorized for this session.', errorCode: 'UNAUTHORIZED_PATIENT' };
  }

  return {
    valid: true,
    tenantId: decoded.tenantId,
    contact: decoded.contact,
    jti: decoded.jti
  };
}

/**
 * Atomically validates and consumes profile selection token (SEC-03).
 * Guarantees that token cannot be replayed or used across multiple patients.
 */
async function verifyAndConsumeProfileSelectionToken(token, requestedPatientId) {
  const tokenValidation = verifyProfileSelectionToken(token, requestedPatientId);
  if (!tokenValidation.valid) {
    return tokenValidation;
  }

  const targetStr = String(requestedPatientId);

  // Atomic consumption in MongoDB: findOneAndUpdate with consumedAt: null
  const consumedToken = await ProfileSelectionToken.findOneAndUpdate(
    {
      jti: tokenValidation.jti,
      consumedAt: null,
      expiresAt: { $gt: new Date() }
    },
    {
      $set: {
        consumedAt: new Date(),
        selectedPatientId: targetStr
      }
    },
    { new: true }
  );

  if (!consumedToken) {
    return {
      valid: false,
      error: 'Profile selection token has already been used or has expired. Please verify OTP again.',
      errorCode: 'TOKEN_ALREADY_CONSUMED'
    };
  }

  return {
    valid: true,
    tenantId: tokenValidation.tenantId,
    contact: tokenValidation.contact
  };
}

module.exports = {
  generateOtp,
  hashOtp,
  createAndDispatchOtp,
  atomicVerifyOtp,
  reserveRateLimitSlot,
  commitRateLimitReservation,
  releaseRateLimitReservation,
  generateProfileSelectionToken,
  verifyProfileSelectionToken,
  verifyAndConsumeProfileSelectionToken,
  MAX_VERIFY_ATTEMPTS,
  COOLDOWN_SECONDS,
  MAX_REQUESTS_PER_WINDOW
};
