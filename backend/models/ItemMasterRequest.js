const mongoose = require('mongoose');

/**
 * ItemMasterRequest — Hospital-submitted requests to add items to the Global Catalog.
 *
 * Lifecycle:
 *   DRAFT → SUBMITTED → UNDER_REVIEW → APPROVED | REJECTED
 *
 * On approval:
 *   - A new global ItemMaster record is created (or an existing one is linked)
 *   - approvedItemMasterId is populated
 *   - status is set to APPROVED
 */
const itemMasterRequestSchema = new mongoose.Schema({
  // Unique request number: IMR-YYYY-XXXX
  requestNo: {
    type: String,
    required: true,
    trim: true,
    uppercase: true
  },

  // Requesting hospital
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

  // Request classification: New Global Item vs Assign Existing Global Item
  requestType: {
    type: String,
    enum: ['NEW_GLOBAL_ITEM', 'ASSIGN_EXISTING_GLOBAL_ITEM'],
    default: 'NEW_GLOBAL_ITEM',
    index: true
  },
  // If requesting assignment of an existing global item
  masterItemId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ItemMaster',
    default: null,
    index: true
  },

  // Category and Department for request hierarchy
  category: {
    type: String,
    trim: true,
    index: true,
    default: ''
  },
  department: {
    type: String,
    trim: true,
    index: true,
    default: ''
  },

  // Hospital-specific requested pricing (immutable post-submission)
  requestedMrp: {
    type: Number,
    default: 0,
    min: 0
  },
  requestedNetRate: {
    type: Number,
    default: 0,
    min: 0
  },
  requestedHospitalCost: {
    type: Number,
    default: 0,
    min: 0
  },

  // Approved pricing set by SuperAdmin (null until reviewed)
  approvedMrp: {
    type: Number,
    default: null
  },
  approvedNetRate: {
    type: Number,
    default: null
  },
  approvedHospitalCost: {
    type: Number,
    default: null
  },

  // Category-specific attributes per Master Schema Registry
  categoryData: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },

  // Requester details
  requestedBy: {
    type: String,
    required: true,
    trim: true
  },
  requestedByName: {
    type: String,
    default: '',
    trim: true
  },
  requestedByRole: {
    type: String,
    default: ''
  },

  // Flag if converted from NEW_GLOBAL_ITEM to ASSIGN_EXISTING_GLOBAL_ITEM
  wasConvertedFromNewItem: {
    type: Boolean,
    default: false
  },

  // ==============================
  // Proposed Item Details (Dynamic across all categories)
  // ==============================
  proposedItem: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },

  // Reason / justification for the request
  reason: {
    type: String,
    default: ''
  },

  // Workflow status
  status: {
    type: String,
    enum: ['DRAFT', 'SUBMITTED', 'PENDING', 'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'CANCELLED'],
    default: 'PENDING',
    index: true
  },

  // Super Admin review
  reviewedBy: {
    type: String,
    default: ''
  },
  reviewedByName: {
    type: String,
    default: ''
  },
  reviewedAt: {
    type: Date,
    default: null
  },
  reviewNotes: {
    type: String,
    default: ''
  },
  rejectionReason: {
    type: String,
    default: ''
  },

  // On approval: link to the created (or matched) global ItemMaster record
  approvedItemMasterId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ItemMaster',
    default: null
  },
  approvedItemCode: {
    type: String,
    default: ''
  },

  // If a matching global item was found instead of creating a new one
  linkedToExistingItem: {
    type: Boolean,
    default: false
  },

  // Full review history for audit
  history: [{
    action: { type: String },
    actor: { type: String },
    actorName: { type: String, default: '' },
    actorRole: { type: String, default: '' },
    note: { type: String, default: '' },
    timestamp: { type: Date, default: Date.now }
  }]
}, { timestamps: true });

// Compound unique index: requestNo must be unique
itemMasterRequestSchema.index({ requestNo: 1 }, { unique: true });
itemMasterRequestSchema.index({ tenantId: 1, status: 1, createdAt: -1 });
itemMasterRequestSchema.index({ status: 1, createdAt: -1 }); // Super Admin list view

// Partial unique index: at most ONE active Path-A request per tenant + masterItemId
itemMasterRequestSchema.index(
  { tenantId: 1, masterItemId: 1 },
  {
    unique: true,
    partialFilterExpression: {
      requestType: 'ASSIGN_EXISTING_GLOBAL_ITEM',
      status: { $in: ['PENDING', 'UNDER_REVIEW', 'SUBMITTED'] }
    },
    name: 'unique_active_path_a_request_per_tenant_item'
  }
);

module.exports = mongoose.model('ItemMasterRequest', itemMasterRequestSchema);
