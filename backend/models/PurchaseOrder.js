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
    name: { type: String, required: true },
    sku: { type: String, required: true },
    requiredQty: { type: Number, required: true, default: 1 },
    price: { type: Number, required: true },
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

