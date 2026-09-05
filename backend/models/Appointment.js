const mongoose = require('mongoose');

const appointmentSchema = new mongoose.Schema({
  tenantId: { type: String, required: true, default: 'city_hospital', index: true },
  patientId: { type: mongoose.Schema.Types.ObjectId, ref: 'Patient', required: true },
  doctorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  date: { type: Date, required: true },
  time: { type: String, required: true },
  status: { 
    type: String, 
    enum: ['Pending', 'Pending Approval', 'Approved', 'Waiting', 'In Progress', 'Prescription Pending', 'Completed', 'Cancelled', 'Paid', 'Confirmed', 'No-Show', 'Skipped'], 
    default: 'Pending' 
  },

  paymentStatus: {
    type: String,
    enum: ['Pending', 'Paid', 'Refunded'],
    default: 'Pending'
  },
  source: {
    type: String,
    enum: ['Walk-In', 'Online'],
    default: 'Walk-In'
  },
  reason: { type: String, required: true },
  notes: { type: String },
  diagnosis: { type: String },
  regNo: { type: String },
  // Phase 1 Queue & Token Foundation
  tokenNumber: { type: Number, default: null },
  tokenDisplay: { type: String, default: null },
  tokenDate: { type: String, default: null }, // YYYY-MM-DD calendar date string
  tokenDoctorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  tokenSlotId: { type: String, default: null },
  tokenAssignedAt: { type: Date, default: null },
  queueStatus: {
    type: String,
    enum: ['Waiting', 'Serving', 'In Consultation', 'Completed', 'Skipped', 'No-Show', 'Cancelled', null],
    default: null
  },
  noPrescriptionProvided: { type: Boolean, default: false },

  // Visit Encounter Architecture
  visitId: { type: String, default: null },
  visitRef: { type: mongoose.Schema.Types.ObjectId, ref: 'Visit', default: null },
  visitEpisodeId: { type: String, default: null },
  parentAppointmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Appointment', default: null },

  createdAt: { type: Date, default: Date.now },
}, { timestamps: true });

// Compound indexes for fast per-tenant date/status lookups (real-time polling)
appointmentSchema.index({ tenantId: 1, date: 1 });
appointmentSchema.index({ tenantId: 1, status: 1 });
appointmentSchema.index({ tenantId: 1, doctorId: 1, date: 1 });
// Token uniqueness per tenant + doctor + calendar date (applied only when a token is actually allocated)
appointmentSchema.index(
  { tenantId: 1, doctorId: 1, tokenDate: 1, tokenNumber: 1 },
  { unique: true, partialFilterExpression: { tokenNumber: { $type: 'number' } } }
);
appointmentSchema.index({ tenantId: 1, visitId: 1 });
appointmentSchema.index({ tenantId: 1, visitEpisodeId: 1 });

module.exports = mongoose.model('Appointment', appointmentSchema);

