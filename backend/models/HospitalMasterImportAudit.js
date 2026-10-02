const mongoose = require('mongoose');

/**
 * HospitalMasterImportAudit
 * 
 * Historical audit log of every confirmed hospital catalog import.
 * Preserves batch metrics, provenance (parser & registry version, fileHash),
 * and row-level snapshots including sourceRowHash and multi-dimensional pricing diffs.
 */
const hospitalMasterImportAuditSchema = new mongoose.Schema({
  importBatchId: {
    type: String,
    required: true,
    unique: true,
    index: true,
    trim: true
  },
  previewSessionId: {
    type: String,
    required: true,
    index: true,
    trim: true
  },
  tenantId: {
    type: String,
    required: true,
    index: true,
    trim: true
  },
  hospitalName: {
    type: String,
    default: '',
    trim: true
  },
  category: {
    type: String,
    required: true,
    index: true,
    trim: true
  },
  department: {
    type: String,
    default: '',
    trim: true
  },
  parserVersion: {
    type: String,
    default: '1.0.0'
  },
  registryVersion: {
    type: String,
    default: 'Phase-1-Verified-84-Fields'
  },
  originalFileName: {
    type: String,
    required: true
  },
  fileSizeBytes: {
    type: Number,
    default: 0
  },
  fileHash: {
    type: String,
    required: true
  },
  uploadedBy: {
    type: String,
    required: true
  },
  uploadedByName: {
    type: String,
    default: ''
  },
  uploadedAt: {
    type: Date,
    default: Date.now
  },
  metrics: {
    totalRows: { type: Number, default: 0 },
    matchedCount: { type: Number, default: 0 },
    newConfigsCreated: { type: Number, default: 0 },
    existingConfigsRepriced: { type: Number, default: 0 },
    skippedCount: { type: Number, default: 0 },
    unmatchedCount: { type: Number, default: 0 }
  },
  rowAuditTrail: [{
    rowNumber: { type: Number, required: true },
    sourceRowHash: { type: String, required: true },
    masterItemId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ItemMaster',
      default: null
    },
    canonicalItemCode: { type: String, default: '' },
    action: {
      type: String,
      enum: ['CREATED', 'REPRICED', 'SKIPPED', 'UNMATCHED'],
      required: true
    },
    pricingSnapshot: {
      oldPricing: {
        mrp: { type: Number, default: null },
        netRate: { type: Number, default: null },
        hospitalCost: { type: Number, default: null }
      },
      newPricing: {
        mrp: { type: Number, default: null },
        netRate: { type: Number, default: null },
        hospitalCost: { type: Number, default: null }
      }
    },
    notes: { type: String, default: '' }
  }]
}, { timestamps: true });

hospitalMasterImportAuditSchema.index({ tenantId: 1, createdAt: -1 });

module.exports = mongoose.model('HospitalMasterImportAudit', hospitalMasterImportAuditSchema);
