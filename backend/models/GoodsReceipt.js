const mongoose = require('mongoose');

const goodsReceiptItemSchema = new mongoose.Schema({
  itemType: { type: String, default: 'Medicine' },
  itemCode: { type: String, default: '' },
  sku: { type: String, required: true },
  name: { type: String, required: true },
  unit: { type: String, default: 'Strip' },
  barcode: { type: String, default: '' },
  
  batchNumber: { type: String, default: '' },
  mfgDate: { type: Date, default: null },
  expiryDate: { type: Date, default: null },
  
  qtyOrdered: { type: Number, default: 0 },
  orderedQty: { type: Number, default: 0 },
  previouslyReceivedQty: { type: Number, default: 0 },
  remainingQty: { type: Number, default: 0 },
  
  qtyReceived: { type: Number, required: true, default: 0 },
  rejectedQty: { type: Number, default: 0 },
  rejectionReason: { type: String, default: '' },
  
  price: { type: Number, required: true, default: 0 },
  purchaseRate: { type: Number, default: 0 },
  
  discountPercent: { type: Number, default: 0 },
  discountAmount: { type: Number, default: 0 },
  
  gst: { type: Number, default: 12 },
  gstAmount: { type: Number, default: 0 },
  
  buyPrice: { type: Number, default: 0 },
  netAmount: { type: Number, default: 0 }
}, { _id: false });

const goodsReceiptSchema = new mongoose.Schema({
  tenantId: { type: String, required: true, default: 'city_hospital', index: true },
  grnId: { type: String, required: true },
  receivedDate: { type: Date, default: Date.now },
  grnDate: { type: Date, default: Date.now },
  grnLocation: { type: String, default: 'Main Pharmacy Store' },
  
  poId: { type: mongoose.Schema.Types.ObjectId, ref: 'PurchaseOrder', default: null },
  poNumber: { type: String, default: '' },
  poDate: { type: Date, default: null },
  
  vendorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Vendor', required: true },
  vendorName: { type: String, required: true },
  
  status: { type: String, enum: ['Draft', 'Submitted', 'Verified/Completed'], default: 'Draft' },
  
  // Supplier Invoice Metadata
  invoiceNumber: { type: String, default: '' },
  invoiceDate: { type: Date, default: null },
  invoiceAmount: { type: Number, default: 0 },
  invoiceUrl: { type: String, default: '' },
  
  // Calculated Aggregated Totals
  totalDiscount: { type: Number, default: 0 },
  totalGst: { type: Number, default: 0 },
  grandTotal: { type: Number, default: 0 },
  
  items: [goodsReceiptItemSchema],
  
  notes: { type: String, default: '' },
  receivedBy: { type: String, default: '' }
}, { timestamps: true });

// Compound unique index for local uniqueness within each tenant
goodsReceiptSchema.index({ tenantId: 1, grnId: 1 }, { unique: true });
goodsReceiptSchema.index({ tenantId: 1, poId: 1 });

module.exports = mongoose.model('GoodsReceipt', goodsReceiptSchema);

