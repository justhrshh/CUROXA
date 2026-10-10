const mongoose = require('mongoose');

/**
 * ============================================================================
 * QUROXA — HOSPITAL AFFILIATE LAB CONFIGURATION MODEL
 * ============================================================================
 * Maintains one effective affiliate laboratory configuration per hospital tenant.
 * Guarantees strict multi-tenant isolation, references to active LaboratoryMaster records,
 * and authoritative default lab designation.
 */
const hospitalAffiliateLabConfigSchema = new mongoose.Schema({
  tenantId: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    index: true
  },
  affiliateLabIds: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'LaboratoryMaster',
    required: true
  }],
  defaultLabId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'LaboratoryMaster',
    default: null
  },
  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  updatedByName: {
    type: String,
    trim: true,
    default: ''
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('HospitalAffiliateLabConfig', hospitalAffiliateLabConfigSchema);
