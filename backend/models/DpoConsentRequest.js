const mongoose = require('mongoose');

const dpoConsentRequestSchema = new mongoose.Schema({
  requestId: {
    type: String,
    required: true,
    unique: true,
    index: true,
    trim: true
  },
  tenantId: {
    type: String,
    required: true,
    index: true,
    lowercase: true,
    trim: true
  },
  patientId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Patient',
    required: true,
    index: true
  },
  uhId: {
    type: String,
    required: true,
    index: true,
    trim: true
  },
  hospitalPatientId: {
    type: String,
    required: true,
    trim: true
  },
  patientName: {
    type: String,
    default: 'Patient'
  },
  patientContact: {
    type: String,
    default: ''
  },
  categories: {
    personal: { type: Boolean, default: false },
    clinical: { type: Boolean, default: false },
    payment: { type: Boolean, default: false }
  },
  status: {
    type: String,
    enum: [
      'PENDING',
      'READY_FOR_REVIEW',
      'APPROVED',
      'REJECTED',
      'CANCELLED_BY_PATIENT',
      'CANCELLED_BY_DPO',
      'COMPLETED'
    ],
    default: 'PENDING',
    index: true
  },
  termsAcknowledged: {
    type: Boolean,
    default: true,
    required: true
  },
  termsAcknowledgedAt: {
    type: Date,
    default: Date.now
  },
  withdrawalWindowEndsAt: {
    type: Date,
    required: true,
    index: true
  },
  cancelledAt: {
    type: Date,
    default: null
  },
  cancelledBy: {
    id: { type: String, default: null },
    role: { type: String, default: null },
    name: { type: String, default: null }
  },
  cancelReason: {
    type: String,
    default: ''
  },
  reviewedBy: {
    id: { type: String, default: null },
    role: { type: String, default: null },
    name: { type: String, default: null }
  },
  reviewedAt: {
    type: Date,
    default: null
  },
  rejectionReason: {
    type: String,
    default: ''
  },
  processedAt: {
    type: Date,
    default: null
  },
  processingLog: [
    {
      category: { type: String, required: true },
      status: { type: String, required: true },
      details: { type: String, default: '' },
      timestamp: { type: Date, default: Date.now }
    }
  ],
  auditTrail: [
    {
      action: { type: String, required: true },
      actor: { type: String, default: 'system' },
      actorRole: { type: String, default: '' },
      actorName: { type: String, default: '' },
      timestamp: { type: Date, default: Date.now },
      notes: { type: String, default: '' }
    }
  ]
}, { timestamps: true });

// Compound indexes for high-performance hospital queries
dpoConsentRequestSchema.index({ tenantId: 1, createdAt: -1 });
dpoConsentRequestSchema.index({ tenantId: 1, status: 1 });
dpoConsentRequestSchema.index({ uhId: 1, tenantId: 1 });

module.exports = mongoose.model('DpoConsentRequest', dpoConsentRequestSchema);
