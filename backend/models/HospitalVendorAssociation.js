const mongoose = require('mongoose');

/**
 * ============================================================================
 * QUROXA — HOSPITAL VENDOR ASSOCIATION MODEL
 * ============================================================================
 * Associates an independent Global Vendor with a specific hospital tenant.
 * Does not duplicate vendor data.
 * Compound index on { tenantId: 1, vendorId: 1 } prevents duplicate associations.
 */
const hospitalVendorAssociationSchema = new mongoose.Schema({
  tenantId: {
    type: String,
    required: true,
    index: true,
    trim: true
  },
  vendorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'GlobalVendor',
    required: true,
    index: true
  },
  status: {
    type: String,
    enum: ['ACTIVE', 'INACTIVE'],
    default: 'ACTIVE',
    index: true
  },
  associatedAt: {
    type: Date,
    default: Date.now
  },
  associatedBy: {
    type: String,
    default: 'System'
  },
  notes: {
    type: String,
    default: ''
  }
}, {
  timestamps: true
});

// Enforce unique vendor association per hospital
hospitalVendorAssociationSchema.index({ tenantId: 1, vendorId: 1 }, { unique: true });

module.exports = mongoose.model('HospitalVendorAssociation', hospitalVendorAssociationSchema);
