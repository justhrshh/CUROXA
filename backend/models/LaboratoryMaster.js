const mongoose = require('mongoose');

/**
 * ============================================================================
 * QUROXA — LABORATORY MASTER MODEL
 * ============================================================================
 * Canonical laboratory entity master representing external & internal diagnostic
 * laboratories, pathology centres, and imaging reference facilities.
 * Reusable globally or scoped across hospitals for affiliate selection.
 */
const laboratoryMasterSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
    index: true
  },
  code: {
    type: String,
    required: true,
    trim: true,
    uppercase: true,
    unique: true,
    index: true
  },
  email: {
    type: String,
    trim: true,
    lowercase: true,
    default: ''
  },
  contact: {
    type: String,
    trim: true,
    default: ''
  },
  address: {
    type: String,
    trim: true,
    default: ''
  },
  city: {
    type: String,
    trim: true,
    default: ''
  },
  state: {
    type: String,
    trim: true,
    default: ''
  },
  accreditation: {
    type: String,
    trim: true,
    default: 'NABL / CAP'
  },
  isActive: {
    type: Boolean,
    default: true,
    index: true
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('LaboratoryMaster', laboratoryMasterSchema);
