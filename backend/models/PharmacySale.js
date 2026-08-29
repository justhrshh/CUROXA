const mongoose = require('mongoose');

const pharmacySaleItemSchema = new mongoose.Schema({
  medicineId: { type: mongoose.Schema.Types.ObjectId, ref: 'Medicine', default: null },
  medicineName: { type: String, required: true, trim: true },
  sku: { type: String, default: '', trim: true },
  batchNumber: { type: String, default: '', trim: true },
  expiryDate: { type: String, default: '', trim: true },
  quantity: { type: Number, required: true, min: 1 },
  unit: { type: String, default: 'Strip', trim: true },
  mrp: { type: Number, required: true, min: 0 },
  discountPercent: { type: Number, default: 0, min: 0, max: 100 },
  discountAmount: { type: Number, default: 0, min: 0 },
  gstPercent: { type: Number, default: 0, min: 0, max: 100 },
  gstAmount: { type: Number, default: 0, min: 0 },
  netAmount: { type: Number, required: true, min: 0 },
  stockImpact: { type: String, enum: ['DEDUCTED', 'PRE_DEDUCTED'], default: 'DEDUCTED' }
}, { _id: false });

const pharmacySaleSchema = new mongoose.Schema({
  tenantId: { type: String, required: true, default: 'city_hospital', index: true },
  saleId: { type: String, required: true, trim: true },
  saleDate: { type: Date, default: Date.now, index: true },
  saleTime: { type: String, default: '' },
  saleType: { type: String, enum: ['PRESCRIPTION', 'DIRECT'], required: true, index: true },
  prescriptionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Prescription', default: null, index: true },
  prescriptionCode: { type: String, default: null },
  patientId: { type: mongoose.Schema.Types.ObjectId, ref: 'Patient', default: null, index: true },
  patientIdentifier: { type: String, default: null },
  customerName: { type: String, required: true, trim: true },
  customerMobile: { type: String, default: '', trim: true },
  doctorName: { type: String, default: 'Self / No Doctor', trim: true },
  pharmacistName: { type: String, default: 'Pharmacist', trim: true },
  pharmacistId: { type: String, default: '', trim: true },
  pharmacyLocation: { type: String, default: 'Main Pharmacy', trim: true },
  status: { 
    type: String, 
    enum: ['COMPLETED', 'CANCELLED', 'REFUNDED', 'PARTIALLY_REFUNDED'], 
    default: 'COMPLETED',
    index: true 
  },
  items: { type: [pharmacySaleItemSchema], required: true },
  subtotal: { type: Number, required: true, min: 0 },
  totalDiscount: { type: Number, default: 0, min: 0 },
  totalGst: { type: Number, default: 0, min: 0 },
  grandTotal: { type: Number, required: true, min: 0 },
  paymentMethod: { type: String, enum: ['Cash', 'UPI', 'Card'], default: 'Cash' },
  paymentStatus: { type: String, enum: ['PAID', 'PENDING', 'REFUNDED'], default: 'PAID' },
  amountReceived: { type: Number, default: 0, min: 0 },
  changeReturned: { type: Number, default: 0, min: 0 },
  transactionRef: { type: String, default: '', trim: true },
  notes: { type: String, default: '', trim: true }
}, { timestamps: true });

// Compound multi-tenant indexes
pharmacySaleSchema.index({ tenantId: 1, saleId: 1 }, { unique: true });
pharmacySaleSchema.index({ tenantId: 1, createdAt: -1 });
pharmacySaleSchema.index({ tenantId: 1, saleType: 1, createdAt: -1 });
pharmacySaleSchema.index({ tenantId: 1, status: 1 });
pharmacySaleSchema.index({ tenantId: 1, customerMobile: 1 });

// Counter Schema for atomic, collision-safe Sale ID generation per tenant and year
const pharmacySaleCounterSchema = new mongoose.Schema({
  tenantId: { type: String, required: true },
  year: { type: Number, required: true },
  seq: { type: Number, default: 0 }
});
pharmacySaleCounterSchema.index({ tenantId: 1, year: 1 }, { unique: true });

const PharmacySaleCounter = mongoose.model('PharmacySaleCounter', pharmacySaleCounterSchema);
const PharmacySale = mongoose.model('PharmacySale', pharmacySaleSchema);

module.exports = {
  PharmacySale,
  PharmacySaleCounter
};
