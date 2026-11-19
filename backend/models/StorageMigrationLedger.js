const mongoose = require('mongoose');

const storageMigrationLedgerSchema = new mongoose.Schema({
  collectionName: { type: String, required: true, index: true },
  documentId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
  fieldPath: { type: String, required: true },
  tenantId: { type: String, default: 'default', index: true },
  category: { type: String, required: true },
  originalValue: { type: String }, // Stored for rollback capability
  r2Key: { type: String },
  r2Bucket: { type: String },
  checksum: { type: String },
  fileSize: { type: Number },
  mimetype: { type: String },
  status: {
    type: String,
    enum: ['MIGRATED', 'SKIPPED', 'FAILED', 'ROLLED_BACK'],
    default: 'MIGRATED',
    index: true
  },
  error: { type: String },
  migratedAt: { type: Date, default: Date.now }
}, { timestamps: true });

// Compound unique index ensures idempotency: one migration entry per doc + field
storageMigrationLedgerSchema.index(
  { collectionName: 1, documentId: 1, fieldPath: 1 },
  { unique: true }
);

module.exports = mongoose.model('StorageMigrationLedger', storageMigrationLedgerSchema);
