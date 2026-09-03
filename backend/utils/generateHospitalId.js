const crypto = require('crypto');

const CHARSET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const ID_LENGTH = 6;
const HOSPITAL_ID_REGEX = /^HSP-[A-Z0-9]{6}$/;

/**
 * Generates a random public Hospital ID in the format HSP-XXXXXX.
 * Exactly 6 uppercase alphanumeric characters after HSP-.
 * Never uses hospital name, slug, or sequential numbering.
 *
 * @returns {string} e.g. "HSP-8F42K7"
 */
function generateHospitalId() {
  const bytes = crypto.randomBytes(ID_LENGTH);
  let code = '';
  for (let i = 0; i < ID_LENGTH; i++) {
    code += CHARSET[bytes[i] % CHARSET.length];
  }
  const fullId = `HSP-${code}`;
  if (!HOSPITAL_ID_REGEX.test(fullId)) {
    throw new Error(`Generated hospital ID '${fullId}' did not match required format /^HSP-[A-Z0-9]{6}$/`);
  }
  return fullId;
}

/**
 * Generates a collision-checked, unique Hospital ID against the database.
 * Retries up to maxRetries times in the rare case of a collision.
 *
 * @param {import('mongoose').Model} SuperAdminHospitalModel
 * @param {number} maxRetries
 * @returns {Promise<string>} Unique hospital ID
 */
async function generateUniqueHospitalId(SuperAdminHospitalModel, maxRetries = 10) {
  if (!SuperAdminHospitalModel) {
    throw new Error('SuperAdminHospital model is required for unique ID generation.');
  }

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const candidate = generateHospitalId();
    const existing = await SuperAdminHospitalModel.findOne({ hospitalId: candidate }, { _id: 1 }).lean();
    if (!existing) {
      return candidate;
    }
  }

  throw new Error(`Failed to generate a unique hospital ID after ${maxRetries} attempts.`);
}

/**
 * Idempotent, safe migration utility to backfill hospitalId for existing hospitals.
 * Only modifies hospitals lacking a hospitalId. Preserves all other fields (name, code, _id, logo, status).
 *
 * @param {import('mongoose').Model} SuperAdminHospitalModel
 * @returns {Promise<{ scanned: number, migrated: number, skipped: number }>}
 */
async function backfillHospitalIds(SuperAdminHospitalModel) {
  if (!SuperAdminHospitalModel) {
    throw new Error('SuperAdminHospital model is required for backfill.');
  }

  const hospitals = await SuperAdminHospitalModel.find({
    $or: [
      { hospitalId: { $exists: false } },
      { hospitalId: null },
      { hospitalId: '' }
    ]
  });

  let migrated = 0;
  for (const hosp of hospitals) {
    // Generate unique ID
    const uniqueId = await generateUniqueHospitalId(SuperAdminHospitalModel);
    
    // Atomic update to avoid race conditions
    const updated = await SuperAdminHospitalModel.findOneAndUpdate(
      {
        _id: hosp._id,
        $or: [
          { hospitalId: { $exists: false } },
          { hospitalId: null },
          { hospitalId: '' }
        ]
      },
      { $set: { hospitalId: uniqueId } },
      { returnDocument: 'after' }
    );

    if (updated) {
      migrated++;
    }
  }

  const total = await SuperAdminHospitalModel.countDocuments();
  return {
    scanned: total,
    migrated,
    skipped: total - migrated
  };
}

module.exports = {
  CHARSET,
  ID_LENGTH,
  HOSPITAL_ID_REGEX,
  generateHospitalId,
  generateUniqueHospitalId,
  backfillHospitalIds
};
