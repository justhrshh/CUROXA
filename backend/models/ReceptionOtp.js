const mongoose = require('mongoose');

/**
 * ReceptionOtp Schema
 * 
 * Tenant-scoped OTP cache specifically for preliminary reception queue verification.
 * Isolated from general staff/patient auth to prevent token collisions and cross-clinic misuse.
 */
const receptionOtpSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    lowercase: true,
    trim: true,
    index: true
  },
  tenantId: {
    type: String,
    required: true,
    index: true
  },
  clinicCode: {
    type: String,
    required: true,
    lowercase: true,
    trim: true
  },
  otp_code: {
    type: String,
    required: true
  },
  attempts: {
    type: Number,
    default: 0
  },
  lockUntil: {
    type: Date,
    default: null
  },
  expires_at: {
    type: Date,
    required: true
  },
  consumed: {
    type: Boolean,
    default: false
  },
  // Short-lived session token granted upon successful OTP verification
  sessionToken: {
    type: String,
    sparse: true,
    index: true
  },
  verifiedAt: {
    type: Date,
    default: null
  }
}, { timestamps: true });

// Auto-expire documents after expiration
receptionOtpSchema.index({ expires_at: 1 }, { expireAfterSeconds: 0 });

// Scoped compound index for email + clinic lookups
receptionOtpSchema.index({ tenantId: 1, email: 1 });

module.exports = mongoose.model('ReceptionOtp', receptionOtpSchema);
