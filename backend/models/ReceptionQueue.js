const mongoose = require('mongoose');

/**
 * ReceptionQueue Schema
 * 
 * Independent Queue for walk-in patient arrival and preliminary registration at clinic reception.
 * Strictly decoupled from doctor consultation tokens (Appointment.tokenNumber) and DoctorQueue.
 */
const receptionQueueSchema = new mongoose.Schema({
  tenantId: {
    type: String,
    required: true,
    index: true
  },
  clinicCode: {
    type: String,
    required: true,
    lowercase: true,
    trim: true,
    index: true
  },
  queueDate: {
    type: String, // YYYY-MM-DD
    required: true,
    index: true
  },
  ticketNumber: {
    type: Number,
    required: true
  },
  ticketDisplay: {
    type: String,
    required: true
  },
  status: {
    type: String,
    enum: ['Waiting', 'Called', 'Serving', 'Completed', 'Skipped', 'Cancelled'],
    default: 'Waiting',
    index: true
  },
  patientType: {
    type: String,
    enum: ['Existing', 'New'],
    required: true
  },
  // Populated ONLY if safely matched to an existing patient in this clinic
  patientId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Patient',
    default: null
  },
  existingPatientDetails: {
    name: { type: String },
    uhId: { type: String },
    patientId: { type: String }
  },
  // Preliminary staging details for New patients (does NOT create permanent Patient records in Phase 3)
  preliminaryDetails: {
    title: { type: String, default: '' },
    name: { type: String },
    contact: { type: String },
    gender: { type: String, enum: ['Male', 'Female', 'Other'] },
    age: { type: Number },
    dob: { type: String },
    email: { type: String },
    bloodGroup: { type: String, default: '' },
    address: { type: String, default: '' },
    allergies: { type: String, default: '' }
  },
  source: {
    type: String,
    default: 'QR'
  },
  // Opaque random token for patient to securely view their ticket status without exposing patient IDs
  sessionToken: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  // Idempotency key to prevent double submissions from network retries or double clicks
  idempotencyKey: {
    type: String,
    default: undefined
  },
  calledAt: { type: Date, default: null },
  servedAt: { type: Date, default: null },
  completedAt: { type: Date, default: null },
  skippedAt: { type: Date, default: null },
  cancelledAt: { type: Date, default: null }
}, { timestamps: true });

// Strict compound uniqueness: One ticket number per clinic per queue date
receptionQueueSchema.index({ tenantId: 1, queueDate: 1, ticketNumber: 1 }, { unique: true });

// Database-level distributed invariant: At most one ticket can be 'Serving' per clinic per queue date across any number of Node.js instances
receptionQueueSchema.index(
  { tenantId: 1, queueDate: 1 },
  { unique: true, partialFilterExpression: { status: 'Serving' } }
);

// Compound uniqueness for idempotencyKey only when it is present as a string
receptionQueueSchema.index(
  { tenantId: 1, idempotencyKey: 1 },
  { unique: true, partialFilterExpression: { idempotencyKey: { $type: 'string' } } }
);

// Efficient lookups for active queue status and count calculations
receptionQueueSchema.index({ tenantId: 1, queueDate: 1, status: 1 });
receptionQueueSchema.index({ tenantId: 1, patientId: 1, queueDate: 1 });

module.exports = mongoose.model('ReceptionQueue', receptionQueueSchema);
