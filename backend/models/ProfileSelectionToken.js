/**
 * ProfileSelectionToken Schema
 * 
 * Enforces atomic single-use consumption and persistent replay protection
 * for patient profile selection tokens issued when a single mobile number
 * maps to multiple family/dependent patient records.
 */

const mongoose = require('mongoose');

const profileSelectionTokenSchema = new mongoose.Schema({
  jti: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  tenantId: {
    type: String,
    required: true,
    lowercase: true,
    trim: true,
    index: true
  },
  contact: {
    type: String,
    required: true,
    index: true
  },
  allowedPatientIds: [{
    type: String,
    required: true
  }],
  consumedAt: {
    type: Date,
    default: null
  },
  selectedPatientId: {
    type: String,
    default: null
  },
  expiresAt: {
    type: Date,
    required: true
  }
}, { timestamps: true });

// TTL index to automatically purge expired token records
profileSelectionTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('ProfileSelectionToken', profileSelectionTokenSchema);
