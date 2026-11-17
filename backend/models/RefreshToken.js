const mongoose = require('mongoose');
const crypto = require('crypto');

const refreshTokenSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  tenantId: {
    type: String,
    required: true,
    lowercase: true,
    trim: true,
    index: true
  },
  tokenHash: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  familyId: {
    type: String,
    required: true,
    index: true
  },
  isRevoked: {
    type: Boolean,
    default: false,
    index: true
  },
  replacedByTokenHash: {
    type: String,
    default: null
  },
  userAgent: {
    type: String,
    default: ''
  },
  ipAddress: {
    type: String,
    default: ''
  },
  password_version: {
    type: Number,
    default: 0
  },
  sessionScope: {
    type: String,
    enum: ['staff', 'global_patient', 'hospital_patient'],
    default: 'staff',
    index: true
  },
  patientId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Patient',
    default: null,
    index: true
  },
  absoluteExpiresAt: {
    type: Date,
    default: null
  },
  expiresAt: {
    type: Date,
    required: true,
    index: { expires: 0 } // MongoDB TTL index for automatic expiration cleanup
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  revokedAt: {
    type: Date,
    default: null
  }
});

/**
 * Creates a new refresh token and stores its secure SHA-256 hash in MongoDB.
 * Never stores plaintext refresh tokens in the database.
 *
 * @param {Object} options
 * @param {ObjectId} options.userId - Mongoose User ID or Patient ID
 * @param {string} options.tenantId - Hospital Tenant Code or 'global'
 * @param {string} [options.familyId] - Existing familyId for rotation, or generates new UUID
 * @param {string} [options.userAgent] - Client User-Agent
 * @param {string} [options.ipAddress] - Client IP Address
 * @param {number} [options.password_version] - User's current password version
 * @param {string} [options.sessionScope] - 'staff' | 'global_patient' | 'hospital_patient'
 * @param {ObjectId} [options.patientId] - Associated Patient Document ID
 * @param {Date} [options.absoluteExpiresAt] - Absolute lifetime limit (max 30 days)
 * @returns {Promise<{ rawToken: string, session: Document }>}
 */
refreshTokenSchema.statics.createSession = async function({
  userId,
  tenantId,
  familyId = null,
  userAgent = '',
  ipAddress = '',
  password_version = 0,
  sessionScope = 'staff',
  patientId = null,
  absoluteExpiresAt = null
}) {
  const rawToken = crypto.randomBytes(40).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
  const resolvedFamilyId = familyId || (crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(16).toString('hex'));

  // Idle validity: default 7 days
  const refreshDays = parseInt(process.env.AUTH_REFRESH_TOKEN_DAYS || '7', 10);
  const expiresAt = new Date(Date.now() + refreshDays * 24 * 60 * 60 * 1000);

  // Absolute validity: default 30 days maximum session lifetime
  const absoluteDays = parseInt(process.env.AUTH_SESSION_ABSOLUTE_DAYS || '30', 10);
  const resolvedAbsoluteExpiry = absoluteExpiresAt || new Date(Date.now() + absoluteDays * 24 * 60 * 60 * 1000);

  const session = await this.create({
    userId,
    tenantId: String(tenantId).trim().toLowerCase(),
    tokenHash,
    familyId: resolvedFamilyId,
    userAgent: String(userAgent || '').substring(0, 500),
    ipAddress: String(ipAddress || '').substring(0, 100),
    password_version: Number(password_version) || 0,
    sessionScope,
    patientId: patientId || null,
    expiresAt,
    absoluteExpiresAt: resolvedAbsoluteExpiry,
    isRevoked: false
  });

  return { rawToken, session };
};

const RefreshToken = mongoose.model('RefreshToken', refreshTokenSchema);

module.exports = RefreshToken;
