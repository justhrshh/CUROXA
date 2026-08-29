const mongoose = require('mongoose');

const inventoryWriteOffSchema = new mongoose.Schema({
  tenantId: { type: String, required: true, default: 'city_hospital', index: true },
  writeOffId: { type: String, required: true, trim: true },
  medicineId: { type: mongoose.Schema.Types.ObjectId, ref: 'Medicine', required: true },
  sku: { type: String, required: true, uppercase: true, trim: true },
  medicineName: { type: String, required: true, trim: true },
  batchId: { type: mongoose.Schema.Types.ObjectId, ref: 'MedicineBatch', required: true },
  batchNumber: { type: String, required: true, uppercase: true, trim: true },
  expiryDate: { type: Date, default: null },
  quantity: { type: Number, required: true, min: 1 },
  unitCost: { type: Number, required: true, min: 0 },
  totalValue: { type: Number, required: true, min: 0 },
  reason: { type: String, default: 'Expired Inventory Write-Off', trim: true },
  status: {
    type: String,
    enum: ['Pending Write-Off', 'Written Off'],
    default: 'Written Off'
  },
  grnId: { type: String, default: '', trim: true },
  vendorName: { type: String, default: '', trim: true },
  detectedAt: { type: Date, default: Date.now },
  detectedBy: { type: String, default: 'Pharmacist', trim: true },
  approvedAt: { type: Date, default: Date.now },
  approvedBy: { type: String, default: 'Pharmacist', trim: true }
}, { timestamps: true });

inventoryWriteOffSchema.index({ tenantId: 1, writeOffId: 1 }, { unique: true });
inventoryWriteOffSchema.index({ tenantId: 1, sku: 1, batchNumber: 1 });
inventoryWriteOffSchema.index({ tenantId: 1, createdAt: -1 });

module.exports = mongoose.model('InventoryWriteOff', inventoryWriteOffSchema);
