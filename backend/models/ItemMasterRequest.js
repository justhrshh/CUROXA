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

  // ==============================
  // Proposed Item Details
  // ==============================
  proposedItem: {
    // Identification
    genericName: { type: String, required: true, trim: true },
    brandName: { type: String, default: '', trim: true },
    manufacturer: { type: String, default: '', trim: true },
    itemType: {
      type: String,
      enum: ['Medicine', 'Consumable', 'Reagent', 'Asset', 'Non-Consumable'],
      default: 'Medicine'
    },
    categoryType: { type: String, default: '', trim: true },
    departmentType: { type: String, default: '', trim: true },
    hsnCode: { type: String, default: '', trim: true },
    itemDescription: { type: String, default: '' },

    // Medicine-specific (only used when itemType === 'Medicine')
    composition: { type: String, default: '' },
    strength: { type: String, default: '' },
    strengthUnit: { type: String, default: '' },
    dosageForm: { type: String, default: '' },
    routeOfAdministration: { type: String, default: '' },
    scheduleClassification: { type: String, default: '' },

    // Consumable & Material specific
    material: { type: String, default: '' },
    sizeDimensions: { type: String, default: '' },
    sterility: { type: String, default: '' },
    disposalType: { type: String, default: '' },

    // Reagent specific
    machineCompatibility: { type: String, default: '' },
    catalogNo: { type: String, default: '' },
    testPackVolume: { type: String, default: '' },

    // Asset specific
    makeModelNo: { type: String, default: '' },
    itemSpecification: { type: String, default: '' },
    warrantyMonths: { type: Number, default: 0 },
    maintenanceCycle: { type: String, default: '' },

    // Packaging proposal
    purchasedUnit: { type: String, default: 'Box' },
    consumptionUnit: { type: String, default: 'Unit' },
    converterFactor: { type: Number, default: 1 },
    packSizeDescription: { type: String, default: '' },
    packagingHierarchy: { type: mongoose.Schema.Types.Mixed, default: null },

    // Storage
    storageTemperature: { type: String, default: 'Room Temperature' },
    isExpirable: { type: Boolean, default: true },
    defaultGst: { type: Number, default: 12 }
  },

  // Reason / justification for the request
  reason: {
    type: String,
    default: ''
  },

  // Workflow status
  status: {
    type: String,
    enum: ['DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'CANCELLED'],
    default: 'DRAFT',
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

module.exports = mongoose.model('ItemMasterRequest', itemMasterRequestSchema);
