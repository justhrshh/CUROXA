const mongoose = require('mongoose');

/**
 * HospitalMasterConfig — Multi-tenant junction configuration associating
 * a hospital tenant with a subset of the global canonical Master catalog.
 *
 * Guarantees:
 * 1. Global Master Purity: Hospital-specific prices (mrp, netRate) and local statuses
 *    are stored exclusively here and NEVER overwrite the canonical ItemMaster document.
 * 2. Tenant Isolation: Each hospital only queries records matching its own tenantId.
 * 3. Compound Uniqueness: A single hospital can have a specific master item assigned at most once.
 */
const hospitalMasterConfigSchema = new mongoose.Schema({
  tenantId: {
    type: String,
    required: true,
    index: true,
    trim: true,
    lowercase: true
  },
  masterItemId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ItemMaster',
    required: true,
    index: true
  },
  category: {
    type: String,
    required: true,
    trim: true,
    index: true
  },
  department: {
    type: String,
    default: '',
    trim: true,
    index: true
  },

  // Hospital-Specific Pricing Layer (Decoupled from Global Master)
  mrp: {
    type: Number,
    default: 0,
    min: 0
  },
  netRate: {
    type: Number,
    default: 0,
    min: 0
  },
  hospitalCost: {
    type: Number,
    default: 0,
    min: 0
  },

  // Local Operational Status within this Hospital
  status: {
    type: String,
    default: 'Active',
    trim: true,
    index: true
  },
  approvalStatus: {
    type: String,
    enum: ['Approved', 'Pending', 'Rejected'],
    default: 'Approved',
    index: true
  },

  // Assignment Provenance & Audit Metadata
  assignedVia: {
    type: String,
    enum: ['DIRECT_ADMIN', 'EXCEL_UPLOAD', 'REQUEST_APPROVAL'],
    default: 'DIRECT_ADMIN'
  },
  assignedBy: {
    type: String,
    default: ''
  },
  lastUpdatedBy: {
    type: String,
    default: ''
  }
}, {
  timestamps: true
});

// Compound Unique Index: Prevents duplicate assignment of the same global master item to the same hospital
hospitalMasterConfigSchema.index({ tenantId: 1, masterItemId: 1 }, { unique: true });

// Performance lookup indexes for hospital catalog browsing and procurement filtering
hospitalMasterConfigSchema.index({ tenantId: 1, category: 1, department: 1, status: 1 });
hospitalMasterConfigSchema.index({ tenantId: 1, status: 1 });
hospitalMasterConfigSchema.index({ masterItemId: 1 });

module.exports = mongoose.model('HospitalMasterConfig', hospitalMasterConfigSchema);
