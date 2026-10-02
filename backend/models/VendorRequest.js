const mongoose = require('mongoose');

/**
 * ============================================================================
 * QUROXA — VENDOR REQUEST MODEL
 * ============================================================================
 * Lifecycle: PENDING → APPROVED | REJECTED
 * 
 * Rules:
 * 1. VendorRequest IS NOT a Vendor.
 * 2. Pending request does NOT appear as an active global vendor.
 * 3. On SuperAdmin approval:
 *    - Creates Global Vendor
 *    - Automatically creates Hospital Vendor Association
 *    - Updates request status to APPROVED
 * 4. On rejection:
 *    - Updates request status to REJECTED with rejectionReason
 *    - Creates NO global vendor, creates NO association.
 */
const vendorRequestSchema = new mongoose.Schema({
  requestNo: {
    type: String,
    required: true,
    unique: true,
    uppercase: true,
    trim: true
  },
  tenantId: {
    type: String,
    required: true,
    index: true,
    trim: true
  },
  hospitalName: {
    type: String,
    default: '',
    trim: true
  },
  // All submitted vendor fields per Vendor Master Schema Registry
  vendorData: {
    type: mongoose.Schema.Types.Mixed,
    required: true
  },
  status: {
    type: String,
    enum: ['PENDING', 'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'CANCELLED'],
    default: 'PENDING',
    index: true
  },
  approvedVendorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'GlobalVendor',
    default: null
  },
  rejectionReason: {
    type: String,
    default: ''
  },
  submittedBy: {
    type: String,
    default: ''
  },
  submittedByStaffId: {
    type: String,
    default: ''
  },
  submittedAt: {
    type: Date,
    default: Date.now
  },
  reviewedBy: {
    type: String,
    default: ''
  },
  reviewedAt: {
    type: Date,
    default: null
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('VendorRequest', vendorRequestSchema);
