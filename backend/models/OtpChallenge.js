const mongoose = require('mongoose');

/**
 * OtpChallenge Schema
 * 
 * Centralized, tenant-scoped, HMAC-hashed OTP challenge storage.
 * Enforces single-use consumption, durable attempt tracking, brute-force lockouts,
 * and automatic TTL document expiration.
 */
const otpChallengeSchema = new mongoose.Schema({
  targetIdentifier: {
    type: String,
    required: true,
    lowercase: true,
    trim: true,
    index: true // Email or Normalized 10-digit Indian Mobile
  },
  identifierType: {
    type: String,
    enum: ['email', 'phone'],
    required: true
  },
  tenantId: {
    type: String,
    required: [true, 'tenantId must be explicitly resolved for security challenges'],
    lowercase: true,
    trim: true,
    index: true
    // Explicit tenant resolution: no default fallback to prevent cross-tenant collision
  },
  purpose: {
    type: String,
    enum: [
      'STAFF_LOGIN',
      'PATIENT_PORTAL_AUTH',
      'GLOBAL_PATIENT_AUTH',
      'FORGOT_PASSWORD',
      'RECEPTION_QUEUE',
      'PUBLIC_DOCTOR_QUEUE',
      'STAFF_REGISTRATION'
    ],
    required: true,
    index: true
  },
  hashedOtp: {
    type: String,
    required: true // HMAC-SHA256 hex string
  },
  attempts: {
    type: Number,
    default: 0
  },
  lockUntil: {
    type: Date,
    default: null
  },
  expiresAt: {
    type: Date,
    required: true
  },
  consumedAt: {
    type: Date,
    default: null
  },
  deliveryChannel: {
    type: String,
    enum: ['email', 'sms'],
    required: true
  },
  deliveryStatus: {
    type: String,
    enum: ['sent', 'delivered', 'failed'],
    default: 'sent'
  },
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  }
}, { timestamps: true });

// Auto-expire documents after expiresAt timestamp
otpChallengeSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// Scoped compound index for atomic challenge lookup
otpChallengeSchema.index({ tenantId: 1, targetIdentifier: 1, purpose: 1 });

module.exports = mongoose.model('OtpChallenge', otpChallengeSchema);
