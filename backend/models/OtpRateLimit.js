/**
 * OtpRateLimit Schema
 * 
 * Stores distributed rate-limiting, reservation tracking, and lockout state
 * independently of OtpChallenge.
 * 
 * Closes the TOCTOU concurrency race by supporting atomic pre-dispatch reservations.
 */

const mongoose = require('mongoose');

const reservationSubSchema = new mongoose.Schema({
  reservationId: {
    type: String,
    required: true
  },
  reservedAt: {
    type: Date,
    default: Date.now
  },
  expiresAt: {
    type: Date,
    required: true
  }
}, { _id: false });

const otpRateLimitSchema = new mongoose.Schema({
  targetIdentifier: {
    type: String,
    required: true,
    lowercase: true,
    trim: true,
    index: true
  },
  purpose: {
    type: String,
    required: true,
    index: true
  },
  tenantId: {
    type: String,
    required: true,
    lowercase: true,
    trim: true,
    index: true
  },
  requestCount: {
    type: Number,
    default: 0
  },
  windowResetAt: {
    type: Date,
    required: true
  },
  lastSentAt: {
    type: Date,
    default: null
  },
  activeReservations: [reservationSubSchema],
  failedAttempts: {
    type: Number,
    default: 0
  },
  lockUntil: {
    type: Date,
    default: null
  }
}, { timestamps: true });

// Compound unique index ensuring atomic isolated rate-limiting per identity, purpose, and hospital
otpRateLimitSchema.index(
  { targetIdentifier: 1, purpose: 1, tenantId: 1 },
  { unique: true }
);

// TTL index to automatically prune expired rate limit records after 2 hours
otpRateLimitSchema.index({ windowResetAt: 1 }, { expireAfterSeconds: 7200 });

module.exports = mongoose.model('OtpRateLimit', otpRateLimitSchema);
