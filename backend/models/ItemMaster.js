const mongoose = require('mongoose');

const itemMasterSchema = new mongoose.Schema({
  // =====================================================================
  // SCOPE — determines ownership. 'GLOBAL' items are managed by Super Admin
  // and are readable by all hospitals. 'HOSPITAL' items are legacy/local.
  // =====================================================================
  scope: {
    type: String,
    enum: ['GLOBAL', 'HOSPITAL'],
    default: 'HOSPITAL',
    index: true
  },

  // tenantId is kept for backward-compatibility with existing hospital-scoped
  // records. For GLOBAL items, tenantId is set to '__global__'.
  tenantId: {
    type: String,
    required: true,
    default: 'city_hospital',
    index: true
  },

  itemCode: {
    type: String,
    required: true,
    uppercase: true,
    trim: true
  },
  genericName: {
    type: String,
    required: true,
    trim: true
  },
  brandName: {
    type: String,
    required: true,
    trim: true
  },
  itemDescription: {
    type: String,
    default: ''
  },
  categoryType: {
    type: String,
    required: true,
    trim: true
  },
  departmentType: {
    type: String,
    required: true,
    trim: true
  },
  itemType: {
    type: String,
    enum: ['Medicine', 'Consumable', 'Reagent', 'Asset', 'Non-Consumable'],
    default: 'Medicine'
  },
  hsnCode: {
    type: String,
    default: '',
    trim: true
  },
  defaultGst: {
    type: Number,
    default: 12
  },
  storageTemperature: {
    type: String,
    enum: [
      'Room Temperature',
      '2-8°C (Cold Chain)',
      'Deep Freeze (< -20°C)',
      'Cool (< 25°C)'
    ],
    default: 'Room Temperature'
  },
  itemSpecification: {
    type: String,
    default: ''
  },
  makeModelNo: {
    type: String,
    default: ''
  },
  barcodeOption: {
    type: String,
    enum: ['System Generated', 'Batch Wise', 'Item Wise', 'Manufacturer Scanned'],
    default: 'System Generated'
  },
  barcodeFormat: {
    type: String,
    default: 'Code128'
  },
  isExpirable: {
    type: Boolean,
    default: true
  },
  expiryCutoffDays: {
    type: Number,
    default: 90
  },
  inventoryRule: {
    type: String,
    enum: ['FEFO', 'FIFO'],
    default: 'FEFO'
  },
  manufacturer: {
    type: String,
    default: '',
    trim: true
  },
  catalogNo: {
    type: String,
    default: ''
  },
  machineCompatibility: {
    type: String,
    default: ''
  },
  manufacturers: [{
    manufacturer: { type: String, trim: true, default: '' },
    catalogNo: { type: String, trim: true, default: '' },
    machineCompatibility: { type: String, trim: true, default: '' },
    purchasedUnit: { type: String, trim: true, default: 'Box' },
    converterFactor: { type: Number, default: 100 },
    packSizeDescription: { type: String, default: '' },
    consumptionUnit: { type: String, trim: true, default: 'Tablet' },
    issueMultiplier: { type: Number, default: 1 },
    isActive: { type: Boolean, default: true }
  }],

  // Packaging Hierarchy & Unit Conversion
  purchasedUnit: {
    type: String,
    required: true,
    default: 'Box',
    trim: true
  },
  converterFactor: {
    type: Number,
    required: true,
    min: 1,
    default: 100
  },
  packSizeDescription: {
    type: String,
    default: ''
  },
  consumptionUnit: {
    type: String,
    required: true,
    default: 'Tablet',
    trim: true
  },
  issueMultiplier: {
    type: Number,
    default: 1
  },
  packagingHierarchy: {
    isBrokenDown: {
      type: Boolean,
      default: false
    },
    levels: [{
      levelIndex: { type: Number },
      parentUnit: { type: String, trim: true },
      quantity: { type: Number, min: 1, default: 1 },
      childUnit: { type: String, trim: true }
    }]
  },

  // =====================================================================
  // MEDICINE-SPECIFIC FIELDS (only populated when itemType === 'Medicine')
  // =====================================================================
  composition: {
    type: String,
    default: '',
    trim: true
  },
  strength: {
    type: String,
    default: '',
    trim: true
  },
  strengthUnit: {
    type: String,
    default: '',
    trim: true
  },
  dosageForm: {
    type: String,
    default: '',
    trim: true
  },
  routeOfAdministration: {
    type: String,
    default: '',
    trim: true
  },
  scheduleClassification: {
    type: String,
    enum: ['', 'Schedule H', 'Schedule H1', 'Schedule X', 'Schedule G', 'OTC', 'Schedule C', 'Schedule C1'],
    default: ''
  },

  // =====================================================================
  // CONSUMABLE & MATERIAL SPECIFIC FIELDS
  // =====================================================================
  material: {
    type: String,
    default: '',
    trim: true
  },
  sizeDimensions: {
    type: String,
    default: '',
    trim: true
  },
  sterility: {
    type: String,
    enum: ['', 'Sterile', 'Non-Sterile'],
    default: ''
  },
  disposalType: {
    type: String,
    enum: ['', 'Disposable', 'Reusable'],
    default: ''
  },

  // =====================================================================
  // REAGENT SPECIFIC FIELDS
  // =====================================================================
  testPackVolume: {
    type: String,
    default: '',
    trim: true
  },

  // =====================================================================
  // ASSET & EQUIPMENT SPECIFIC FIELDS
  // =====================================================================
  maintenanceCycle: {
    type: String,
    default: '',
    trim: true
  },
  warrantyMonths: {
    type: Number,
    default: 0
  },

  // =====================================================================
  // GLOBAL ITEM MASTER metadata
  // =====================================================================
  // If this global item was created from an approved item request, link it
  approvedFromRequestId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ItemMasterRequest',
    default: null
  },
  // Track which Super Admin created/last-modified the global item
  createdByAdmin: {
    type: String,
    default: ''
  },
  lastModifiedByAdmin: {
    type: String,
    default: ''
  },

  status: {
    type: String,
    enum: ['Active', 'Inactive'],
    default: 'Active',
    index: true
  }
}, { timestamps: true });

// =====================================================================
// INDEXES
// =====================================================================
// Primary compound: tenantId + itemCode must be unique within scope
itemMasterSchema.index({ tenantId: 1, itemCode: 1 }, { unique: true });
itemMasterSchema.index({ scope: 1, status: 1 });
itemMasterSchema.index({ scope: 1, genericName: 1, brandName: 1, manufacturer: 1 });
itemMasterSchema.index({ tenantId: 1, genericName: 1, brandName: 1, manufacturer: 1 });
itemMasterSchema.index({ tenantId: 1, status: 1 });
itemMasterSchema.index({ tenantId: 1, categoryType: 1, departmentType: 1 });
// Text search index for global catalog lookup
itemMasterSchema.index({
  genericName: 'text',
  brandName: 'text',
  manufacturer: 'text',
  itemCode: 'text',
  composition: 'text'
});

module.exports = mongoose.model('ItemMaster', itemMasterSchema);
