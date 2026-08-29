const mongoose = require('mongoose');

const medicineBatchSchema = new mongoose.Schema({
  tenantId: { type: String, required: true, default: 'city_hospital', index: true },
  medicineId: { type: mongoose.Schema.Types.ObjectId, ref: 'Medicine', required: true, index: true },
  sku: { type: String, required: true, uppercase: true, trim: true },
  name: { type: String, required: true, trim: true },
  batchNumber: { type: String, required: true, uppercase: true, trim: true },
  
  mfgDate: { type: Date, default: null },
  expiryDate: { type: Date, default: null, index: true },
  
  receivedQuantity: { type: Number, required: true, min: 0, default: 0 },
  availableQuantity: { type: Number, required: true, min: 0, default: 0 },
  
  purchaseRate: { type: Number, default: 0, min: 0 },
  mrp: { type: Number, default: 0, min: 0 },
  
  grnId: { type: String, default: '', trim: true },
  vendorName: { type: String, default: '', trim: true },
  
  status: {
    type: String, 
    enum: ['Active', 'Near Expiry', 'Expired', 'Depleted'], 
    default: 'Active',
    index: true 
  }
}, { timestamps: true });

// Compound Unique Index: Prevents duplicate batch documents for the same Tenant + SKU + BatchNumber
medicineBatchSchema.index({ tenantId: 1, sku: 1, batchNumber: 1 }, { unique: true });

// Query indexes for expiry tracking and FEFO operations
medicineBatchSchema.index({ tenantId: 1, sku: 1, status: 1, expiryDate: 1 });
medicineBatchSchema.index({ tenantId: 1, expiryDate: 1, availableQuantity: 1 });

module.exports = mongoose.model('MedicineBatch', medicineBatchSchema);
