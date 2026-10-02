const mongoose = require('mongoose');

/**
 * ============================================================================
 * QUROXA — VENDOR QUOTATION MODEL (Hospital-Specific)
 * ============================================================================
 * Represents a commercial quotation provided by an approved/associated vendor
 * to a specific hospital for an item selected from the hospital's catalog
 * (HospitalMasterConfig -> ItemMaster).
 *
 * Guarantees:
 * 1. Vendor Independence: Vendors are GLOBAL; quotations are HOSPITAL-SPECIFIC.
 * 2. Item Master Validation: Quotations must resolve through HospitalMasterConfig.
 * 3. Multiple Vendors: Multiple vendors can quote on the same item at different rates.
 * 4. Authoritative PO Source: PO vendor recommendation queries lowest valid netEffectiveRate.
 * 5. Line Duplication Prevention: A vendor cannot quote the same item twice in the same quotation.
 */
const vendorQuotationSchema = new mongoose.Schema({
  tenantId: {
    type: String,
    required: true,
    index: true,
    trim: true,
    lowercase: true
  },
  quotationNo: {
    type: String,
    required: true,
    trim: true,
    index: true
  },
  referenceNo: {
    type: String,
    default: '',
    trim: true
  },
  vendorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'GlobalVendor', // Supports GlobalVendor or legacy Vendor
    required: true,
    index: true
  },
  vendorName: {
    type: String,
    required: true,
    trim: true
  },
  vendorCode: {
    type: String,
    default: '',
    trim: true
  },
  itemMasterId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ItemMaster',
    required: true,
    index: true
  },
  hospitalMasterConfigId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'HospitalMasterConfig',
    index: true
  },
  itemCode: {
    type: String,
    required: true,
    trim: true
  },
  genericName: {
    type: String,
    required: true,
    trim: true
  },
  brandName: {
    type: String,
    trim: true,
    default: ''
  },
  category: {
    type: String,
    default: '',
    trim: true
  },
  department: {
    type: String,
    default: '',
    trim: true
  },
  manufacturer: {
    type: String,
    default: '',
    trim: true
  },
  hsnCode: {
    type: String,
    default: '',
    trim: true
  },
  purchasedUnit: {
    type: String,
    required: true,
    trim: true
  },
  packSize: {
    type: String,
    trim: true,
    default: ''
  },
  consumptionUnit: {
    type: String,
    default: 'Unit',
    trim: true
  },
  converterFactor: {
    type: Number,
    required: true,
    default: 1,
    min: 0.0001
  },
  supplierState: { type: String, default: '', trim: true },
  supplierAddress: { type: String, default: '', trim: true },
  supplierType: { type: String, default: '', trim: true },
  gstNo: { type: String, default: '', trim: true },
  deliveryState: { type: String, default: '', trim: true },
  centreType: { type: String, default: '', trim: true },
  centre: { type: String, default: '', trim: true },
  deliveryLocation: { type: String, default: '', trim: true },
  catalogNo: { type: String, default: '', trim: true },
  machine: { type: String, default: '', trim: true },
  ratePerPurchasedUnit: {
    type: Number,
    required: true,
    min: 0
  },
  mrp: {
    type: Number,
    default: 0,
    min: 0
  },
  ratePerConsumptionUnit: {
    type: Number,
    required: true,
    min: 0
  },
  discountPercent: {
    type: Number,
    default: 0,
    min: 0,
    max: 100
  },
  discountAmount: {
    type: Number,
    default: 0,
    min: 0
  },
  igstPercent: {
    type: Number,
    default: 0,
    min: 0,
    max: 100
  },
  cgstPercent: {
    type: Number,
    default: 0,
    min: 0,
    max: 100
  },
  sgstPercent: {
    type: Number,
    default: 0,
    min: 0,
    max: 100
  },
  gstPercent: {
    type: Number,
    default: 0,
    min: 0,
    max: 100
  },
  gstAmount: {
    type: Number,
    default: 0,
    min: 0
  },
  netRatePerPurchasedUnit: {
    type: Number,
    default: 0,
    min: 0
  },
  netEffectiveRate: {
    type: Number,
    required: true,
    min: 0
  },
  leadTimeDays: {
    type: Number,
    default: 3,
    min: 0
  },
  minimumOrderQty: {
    type: Number,
    default: 1,
    min: 1
  },
  effectiveFrom: {
    type: Date,
    default: Date.now
  },
  validTill: {
    type: Date,
    required: true
  },
  status: {
    type: String,
    enum: ['Active', 'Approved', 'Pending_Approval', 'Draft', 'Rejected', 'Expired', 'Superseded'],
    default: 'Active',
    index: true
  },
  quotationDocUrl: {
    type: String,
    default: ''
  },
  documents: [{
    name: { type: String, default: '' },
    url: { type: String, default: '' },
    uploadedAt: { type: Date, default: Date.now }
  }],
  termsAndConditions: {
    type: String,
    default: ''
  },
  termsList: [{
    type: String,
    trim: true
  }],
  createdBy: {
    type: String,
    default: ''
  },
  createdByRole: {
    type: String,
    default: ''
  }
}, {
  timestamps: true
});

// Compound unique index: prevents duplicate items within the same quotation document
vendorQuotationSchema.index({ tenantId: 1, quotationNo: 1, itemMasterId: 1 }, { unique: true });

// Performance index for lookups during PO item selection & vendor ranking
vendorQuotationSchema.index({ tenantId: 1, itemMasterId: 1, status: 1, validTill: 1 });
vendorQuotationSchema.index({ tenantId: 1, hospitalMasterConfigId: 1, status: 1 });
vendorQuotationSchema.index({ tenantId: 1, vendorId: 1, status: 1 });
vendorQuotationSchema.index({ tenantId: 1, status: 1 });

module.exports = mongoose.model('VendorQuotation', vendorQuotationSchema);
