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
    trim: true,
    default: function() { return this.itemName || this.brandName || ''; },
    required: function() { return !this.itemName && !this.brandName; }
  },
  brandName: {
    type: String,
    trim: true,
    default: function() { return this.itemName || this.genericName || ''; },
    required: function() { return !this.itemName && !this.genericName; }
  },
  itemDescription: {
    type: String,
    default: ''
  },
  // Unified category and department (mirrored with legacy categoryType / departmentType)
  category: {
    type: String,
    trim: true,
    default: function() { return this.categoryType || ''; },
    index: true
  },
  department: {
    type: String,
    trim: true,
    default: function() { return this.departmentType || ''; },
    index: true
  },
  itemName: {
    type: String,
    trim: true,
    default: function() { return this.genericName || this.brandName || ''; }
  },
  categoryType: {
    type: String,
    trim: true,
    default: function() { return this.category || 'General'; },
    required: function() { return !this.category; }
  },
  departmentType: {
    type: String,
    trim: true,
    default: function() { return this.department || (this.category === 'Assets' ? 'General' : ''); },
    required: function() { return !this.department && this.category !== 'Assets'; }
  },
  itemType: {
    type: String,
    enum: ['Medicine', 'Consumable', 'Reagent', 'Asset', 'Non-Consumable'],
    default: 'Medicine'
  },
  // Category-specific dynamic data bucket adhering to Master Schema Registry
  categoryData: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  // Direct client fields for fast indexing and query capability
  sNo: { type: Number },
  sampleType: { type: String, trim: true, default: '' },
  gender: { type: String, trim: true, default: '' },
  sampleOption: { type: String, trim: true, default: '' },
  doctorsName: { type: String, trim: true, default: '' },
  doctorId: { type: String, trim: true, default: '' },
  machineId: { type: String, trim: true, default: '' },
  machineName: { type: String, trim: true, default: '' },
  manufactureId: { type: String, trim: true, default: '' },
  manufactureName: { type: String, trim: true, default: '' },
  requiredPrescription: { type: String, trim: true, default: '' },
  rackLocation: { type: String, trim: true, default: '' },
  imageUrl: { type: String, trim: true, default: '' },
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
    default: 'Active',
    trim: true,
    index: true
  }
}, { timestamps: true });

// Pre-validation hook: Guarantee backward and forward compatibility between legacy
// schema fields (categoryType, departmentType, genericName, brandName) and Master Schema Registry
itemMasterSchema.pre('validate', function() {
  if (this.category && !this.categoryType) this.categoryType = this.category;
  if (this.categoryType && !this.category) this.category = this.categoryType;
  if (this.department && !this.departmentType) this.departmentType = this.department;
  if (this.departmentType && !this.department) this.department = this.departmentType;

  // Categories without department (e.g. Assets)
  if (this.category === 'Assets' && !this.departmentType) {
    this.departmentType = 'General';
    this.department = '';
  }
  if (!this.categoryType) this.categoryType = 'General';
  if (!this.departmentType) this.departmentType = 'General';

  if (this.itemName) {
    if (!this.genericName) this.genericName = this.itemName;
    if (!this.brandName) this.brandName = this.itemName;
  } else if (this.genericName && !this.itemName) {
    this.itemName = this.genericName;
  }
  if (!this.genericName && this.brandName) this.genericName = this.brandName;
  if (!this.brandName && this.genericName) this.brandName = this.genericName;

  if (!this.purchasedUnit) this.purchasedUnit = 'Unit';
  if (!this.consumptionUnit) this.consumptionUnit = this.purchasedUnit || 'Unit';
  if (!this.converterFactor) this.converterFactor = 1;
});

// =====================================================================
// INDEXES
// =====================================================================
// Primary compound: tenantId + itemCode must be unique within scope
itemMasterSchema.index({ tenantId: 1, itemCode: 1 }, { unique: true });
itemMasterSchema.index({ scope: 1, status: 1 });
itemMasterSchema.index({ scope: 1, category: 1, department: 1, status: 1 });
itemMasterSchema.index({ scope: 1, genericName: 1, brandName: 1, manufacturer: 1 });
itemMasterSchema.index({ tenantId: 1, genericName: 1, brandName: 1, manufacturer: 1 });
itemMasterSchema.index({ tenantId: 1, status: 1 });
itemMasterSchema.index({ tenantId: 1, categoryType: 1, departmentType: 1 });
// Text search index for global catalog lookup
itemMasterSchema.index({
  itemName: 'text',
  genericName: 'text',
  brandName: 'text',
  manufacturer: 'text',
  itemCode: 'text',
  composition: 'text',
  doctorsName: 'text',
  doctorId: 'text'
});

module.exports = mongoose.model('ItemMaster', itemMasterSchema);

