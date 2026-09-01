const mongoose = require('mongoose');

const prescriptionSchema = new mongoose.Schema({
  tenantId: { type: String, required: true, default: 'city_hospital', index: true },
  appointmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Appointment' },
  patientId: { type: mongoose.Schema.Types.ObjectId, ref: 'Patient', required: true },
  doctorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  items: [{
    medicine: { type: String, required: true },
    dosage: { type: String, required: true },
    duration: { type: String, required: true },
    instructions: { type: String },
    quantity: { type: Number, default: 1 }
  }],
  status: { type: String, enum: ['Pending', 'Pending Pharmacy Dispatch', 'Direct Patient', 'In Progress', 'Dispensed', 'Dispensed by Pharmacy'], default: 'Pending' },
  prescriptionType: {
    type: String,
    enum: ['digital', 'offline_handwritten'],
    default: 'digital'
  },
  images: [{
    pageNumber: { type: Number },
    url: { type: String },
    originalName: { type: String },
    uploadedAt: { type: Date, default: Date.now }
  }],
  offlineMetadata: {
    uploadedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    uploadedByRole: { type: String },
    notes: { type: String }
  },
  editableUntil: { type: Date },
  isLocked: { type: Boolean, default: false },
  correctionHistory: [{
    action: { type: String, enum: ['PAGE_ADDED', 'PAGE_REMOVED', 'PAGE_REPLACED', 'PAGES_REORDERED', 'PRESCRIPTION_CREATED'] },
    actorId: { type: String },
    actorRole: { type: String },
    actorName: { type: String },
    timestamp: { type: Date, default: Date.now },
    affectedPage: { type: Number },
    previousState: { type: mongoose.Schema.Types.Mixed },
    resultingState: { type: mongoose.Schema.Types.Mixed },
    notes: { type: String }
  }]
}, { timestamps: true });

// Compound indexes for fast per-tenant queue lookups (real-time pharmacy polling)
prescriptionSchema.index({ tenantId: 1, status: 1 });
prescriptionSchema.index({ tenantId: 1, patientId: 1, createdAt: -1 });

module.exports = mongoose.model('Prescription', prescriptionSchema);
