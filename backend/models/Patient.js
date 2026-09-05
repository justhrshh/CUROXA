const mongoose = require('mongoose');

const patientSchema = new mongoose.Schema({
  tenantId: { type: String, required: true, default: 'city_hospital', index: true },
  uhId: { type: String },
  patientId: { type: String },
  name: { type: String, required: true },
  age: { type: Number, default: 0 },
  ageMonths: { type: Number, default: 0 },
  ageDays: { type: Number, default: 0 },
  gender: { type: String, enum: ['Male', 'Female', 'Other'], required: true },
  contact: { type: String, required: true },
  email: { type: String, default: 'N/A' },
  address: { type: String },
  referredBy: { type: String, default: '' },
  bloodGroup: { type: String },
  allergies: { type: String, default: 'None' },
  currentMedications: { type: String, default: '' },
  medicalHistory: [{ type: String }],
  avatar: { type: String, default: '' },
  
  // ABHA / ABDM details
  abhaId: { type: String, default: '' },
  abhaAddress: { type: String, default: '' },
  aadhaarVerified: { type: Boolean, default: false },

  // Insurance details
  insuranceDetails: {
    provider: { type: String, default: '' },
    policyNumber: { type: String, default: '' },
    coverageLimit: { type: Number, default: 0 },
    expiryDate: { type: Date }
  },

  // DPDP retention & legal hold
  legalHold: { type: Boolean, default: false },
  retentionExpiry: { type: Date }
}, { timestamps: true });

// Compound index to speed up patient lookup on login by contact and tenantId
patientSchema.index({ tenantId: 1, contact: 1 });
patientSchema.index({ tenantId: 1, patientId: 1 }, { unique: true, sparse: true });
patientSchema.index({ tenantId: 1, uhId: 1 }, { unique: true, sparse: true });
patientSchema.index({ uhId: 1 });

module.exports = mongoose.model('Patient', patientSchema);
