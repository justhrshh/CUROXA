const mongoose = require('mongoose');

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
    trim: true
  },
  vendorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Vendor',
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
    trim: true
  },
  itemMasterId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ItemMaster',
    required: true,
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
  ratePerPurchasedUnit: {
    type: Number,
    required: true,
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
  gstPercent: {
    type: Number,
    default: 0,
    min: 0,
    max: 100
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
  termsAndConditions: {
    type: String,
    default: ''
  },
  createdBy: {
    type: String,
    default: ''
  }
}, {
  timestamps: true
});

// Compound unique index per tenant on quotation number
vendorQuotationSchema.index({ tenantId: 1, quotationNo: 1 }, { unique: true });

// Performance index for lookups during PO item selection
vendorQuotationSchema.index({ tenantId: 1, itemMasterId: 1, status: 1 });
vendorQuotationSchema.index({ tenantId: 1, vendorId: 1, status: 1 });
vendorQuotationSchema.index({ tenantId: 1, status: 1 });

module.exports = mongoose.model('VendorQuotation', vendorQuotationSchema);
