const mongoose = require('mongoose');

const purchaseOrderSchema = new mongoose.Schema({
  tenantId: { type: String, required: true, default: 'city_hospital', index: true },
  poId: { type: String, required: true },
  parentPOId: { type: String, default: null, index: true },
  isParent: { type: Boolean, default: false, index: true },
  vendorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Vendor', required: false, default: null },
  vendorName: { type: String, required: false, default: 'Multiple Suppliers' },
  items: [{
    itemId: { type: String },
    itemMasterId: { type: mongoose.Schema.Types.ObjectId, ref: 'ItemMaster' },
    quotationId: { type: mongoose.Schema.Types.ObjectId, ref: 'VendorQuotation' },
    itemCode: { type: String, default: '' },
    name: { type: String, required: true },
    genericName: { type: String, default: '' },
    sku: { type: String, required: true },
    brandName: { type: String, default: '' },
    manufacturer: { type: String, default: '' },
    purchasedUnit: { type: String, default: 'Unit' },
    packSize: { type: String, default: '' },
    converterFactor: { type: Number, default: 1 },
    consumptionUnit: { type: String, default: 'Unit' },
    requiredQty: { type: Number, required: true, default: 1 },
    expectedConsumptionQty: { type: Number, default: 1 },
    price: { type: Number, required: true },
    discount: { type: Number, default: 0 },
    tax: { type: Number, default: 12 },
    total: { type: Number, required: true },
    vendorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Vendor' },
    vendorName: { type: String }
  }],
  subtotal: { type: Number, default: 0 },
  taxAmount: { type: Number, default: 0 },
  totalAmount: { type: Number, required: true },
  totalItems: { type: Number, default: 0 },
  totalVendors: { type: Number, default: 1 },
  vendorOrders: [{
    poId: { type: String },
    vendorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Vendor' },
    vendorName: { type: String },
    totalAmount: { type: Number },
    status: { type: String, default: 'Pending Approval' }
  }],
  paidAmount: { type: Number, default: 0 },
  status: { type: String, default: 'Pending Approval', index: true },
  expectedDelivery: { type: Date },
  requestedBy: { type: String, required: true },
  notes: { type: String }
}, { timestamps: true });

// Compound unique index for local uniqueness within each tenant
purchaseOrderSchema.index({ tenantId: 1, poId: 1 }, { unique: true });

module.exports = mongoose.model('PurchaseOrder', purchaseOrderSchema);

