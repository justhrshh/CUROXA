const mongoose = require('mongoose');

/**
 * HospitalMasterImportSession
 * 
 * Server-authoritative preview session separating:
 * 1. IMMUTABLE SOURCE SNAPSHOT:
 *    - original parsed row data
 *    - sourceRowHash
 *    - server-resolved candidateMasterItemIds
 *    - server-extracted pricing per registry
 *    - fileHash, tenantId, category, department
 * 2. CONTROLLED RESOLUTION STATE:
 *    - ambiguous row selections validated against candidateMasterItemIds
 *    - status: PREVIEW_READY -> EXPIRED / COMMITTED / DISCARDED
 * 
 * Expiration:
 * - expiresAt: createdAt + 1 hour (confirmation rejected when now >= expiresAt)
 * - cleanupAt: createdAt + 24 hours (MongoDB TTL physical removal)
 */
const hospitalMasterImportSessionSchema = new mongoose.Schema({
  previewId: {
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
  superAdminId: {
    type: String,
    required: true,
    trim: true
  },
  superAdminName: {
    type: String,
    default: '',
    trim: true
  },
  originalFileName: {
    type: String,
    required: true,
    trim: true
  },
  fileHash: {
    type: String,
    required: true,
    trim: true
  },
  fileSizeBytes: {
    type: Number,
    default: 0
  },
  parserVersion: {
    type: String,
    default: '1.0.0'
  },
  registryVersion: {
    type: String,
    default: 'Phase-1-Verified-84-Fields'
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  expiresAt: {
    type: Date,
    default: () => new Date(Date.now() + 60 * 60 * 1000) // 1 Hour
  },
  cleanupAt: {
    type: Date,
    default: () => new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 Hours Retention TTL
  },
  status: {
    type: String,
    enum: ['PREVIEW_READY', 'COMMITTED', 'EXPIRED', 'DISCARDED'],
    default: 'PREVIEW_READY',
    index: true
  },
  summary: {
    totalRows: { type: Number, default: 0 },
    matchedCount: { type: Number, default: 0 },
    safeMatchCount: { type: Number, default: 0 },
    ambiguousCount: { type: Number, default: 0 },
    unmatchedCount: { type: Number, default: 0 },
    repricingCount: { type: Number, default: 0 },
    errorCount: { type: Number, default: 0 }
  },
  rows: [{
    rowNumber: { type: Number, required: true },
    sourceRowHash: { type: String, required: true },
    rawRowData: { type: mongoose.Schema.Types.Mixed, default: {} },
    matchType: {
      type: String,
      enum: ['EXACT_MATCH', 'SAFE_DETERMINISTIC_MATCH', 'AMBIGUOUS_MATCH', 'NO_MATCH'],
      required: true
    },
    masterItemId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ItemMaster',
      default: null
    },
    canonicalItemCode: { type: String, default: '' },
    canonicalItemName: { type: String, default: '' },
    candidateMasterItemIds: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ItemMaster'
    }],
    importedPricing: {
      mrp: { type: Number, default: null },
      netRate: { type: Number, default: null }
    },
    existingPricing: {
      mrp: { type: Number, default: null },
      netRate: { type: Number, default: null },
      hospitalCost: { type: Number, default: null }
    },
    isRepricing: { type: Boolean, default: false },
    validationErrors: [{ type: String }]
  }]
}, { timestamps: true });

// TTL index cleans up session 24 hours after creation
hospitalMasterImportSessionSchema.index({ cleanupAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('HospitalMasterImportSession', hospitalMasterImportSessionSchema);
