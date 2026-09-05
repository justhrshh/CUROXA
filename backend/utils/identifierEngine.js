const crypto = require('crypto');
const PatientIdentity = require('../models/PatientIdentity');
const Counter = require('../models/Counter');
const Patient = require('../models/Patient');
const Visit = require('../models/Visit');
const SuperAdminHospital = require('../models/SuperAdminHospital');

const CHARSET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const UHID_LENGTH = 8;
const UHID_REGEX = /^UH-[A-Z0-9]{8}$/;

/**
 * Normalizes contact string to consistent alphanumeric format (e.g. 10 digit Indian mobile)
 */
function normalizeContact(contact) {
  if (!contact) return '';
  const digitsOnly = String(contact).replace(/\D/g, '');
  if (digitsOnly.length >= 10) {
    return digitsOnly.slice(-10);
  }
  return String(contact).trim().toLowerCase();
}

/**
 * Formats a date into YYYYMMDD string format.
 */
function formatDateYYYYMMDD(dateInput) {
  const d = dateInput ? new Date(dateInput) : new Date();
  if (isNaN(d.getTime())) {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${y}${m}${day}`;
  }
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}${month}${day}`;
}

/**
 * Generates a random candidate UH-ID string e.g. "UH-8F42K7D1".
 */
function generateUhidCandidate() {
  const bytes = crypto.randomBytes(UHID_LENGTH);
  let code = '';
  for (let i = 0; i < UHID_LENGTH; i++) {
    code += CHARSET[bytes[i] % CHARSET.length];
  }
  return `UH-${code}`;
}

/**
 * Resolves an existing UH-ID by patient contact or atomically creates a new platform-unique UH-ID.
 * Guarantees that the same patient keeps the same UH-ID across multiple hospitals.
 *
 * @param {Object} params
 * @param {string} params.contact - Mandatory phone/contact
 * @param {string} params.name - Patient full name
 * @param {string} [params.email] - Optional email
 * @param {string} [params.abhaId] - Optional ABHA ID
 * @returns {Promise<string>} Globally unique UH-ID (e.g. "UH-8F42K7D1")
 */
async function resolveOrCreateUhid({ contact, name, email = '', abhaId = '' }) {
  const cleanContact = normalizeContact(contact);
  if (!cleanContact) {
    throw new Error('Contact / phone number is required to resolve or generate a UH-ID.');
  }

  // 1. Check if patient identity already exists globally by contact
  const existingByContact = await PatientIdentity.findOne({ contact: cleanContact });
  if (existingByContact) {
    return existingByContact.uhId;
  }

  // 2. Fallback check: if email is present and not N/A, check if an existing identity has no contact yet
  const cleanEmail = (email && email.trim().toLowerCase() !== 'n/a') ? email.trim().toLowerCase() : '';
  if (cleanEmail) {
    const existingByEmail = await PatientIdentity.findOne({ email: cleanEmail });
    if (existingByEmail && (!existingByEmail.contact || existingByEmail.contact === cleanContact)) {
      if (!existingByEmail.contact) {
        existingByEmail.contact = cleanContact;
        await existingByEmail.save().catch(() => {});
      }
      return existingByEmail.uhId;
    }
  }

  // 3. Fallback check: if patient already exists in Patient collection with a uhId
  const existingPatientDoc = await Patient.findOne({
    contact: cleanContact,
    uhId: { $exists: true, $ne: null, $nin: ['', 'N/A'] }
  });
  if (existingPatientDoc && existingPatientDoc.uhId) {
    try {
      await PatientIdentity.create({
        uhId: existingPatientDoc.uhId,
        contact: cleanContact,
        name: existingPatientDoc.name || name || 'Patient',
        email: cleanEmail,
        abhaId: existingPatientDoc.abhaId || abhaId || ''
      });
    } catch (e) {
      // Ignore if already registered concurrently
    }
    return existingPatientDoc.uhId;
  }

  // 4. Generate a collision-checked, unique UH-ID and register it
  const maxRetries = 15;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const candidate = generateUhidCandidate();
    try {
      const created = await PatientIdentity.create({
        uhId: candidate,
        contact: cleanContact,
        name: name || 'Patient',
        email: cleanEmail,
        abhaId: abhaId || ''
      });
      return created.uhId;
    } catch (insertErr) {
      // If collision on uhId, retry next candidate
      if (insertErr.code === 11000 && insertErr.message?.includes('uhId')) {
        continue;
      }
      // If collision on contact (concurrent registration), fetch existing and return
      if (insertErr.code === 11000 && insertErr.message?.includes('contact')) {
        const found = await PatientIdentity.findOne({ contact: cleanContact });
        if (found) return found.uhId;
      }
      throw insertErr;
    }
  }

  throw new Error(`Failed to generate a unique UH-ID after ${maxRetries} attempts.`);
}

/**
 * Derives a human-readable hospital prefix tag for a given tenant.
 * e.g. "HSP-L11PI7" -> "L11PI7", "city_hospital" -> "CITY", etc.
 */
async function getHospitalPrefix(tenantId) {
  if (!tenantId) return 'CUROXA';
  const normalizedTenant = String(tenantId).trim().toLowerCase();

  try {
    const hosp = await SuperAdminHospital.findOne({ code: normalizedTenant }).lean();
    if (hosp) {
      if (hosp.hospitalId) {
        // e.g. "HSP-L11PI7" -> "L11PI7"
        const stripped = hosp.hospitalId.replace(/^HSP-/i, '').trim().toUpperCase();
        if (stripped) return stripped;
      }
      if (hosp.code) {
        const cleaned = hosp.code.toUpperCase().replace(/[^A-Z0-9]/g, '');
        if (cleaned.length >= 3) {
          return cleaned.slice(0, 6);
        }
      }
    }
  } catch (err) {
    console.warn('[identifierEngine] getHospitalPrefix lookup warning:', err.message);
  }

  const fallback = normalizedTenant.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
  return fallback || 'HSP01';
}

/**
 * Atomically generates a hospital-scoped, sequential, human-readable Patient ID.
 * Format: PAT-<HOSP_PREFIX>-<6_DIGIT_SEQ> (e.g. PAT-L11PI7-000001).
 * Never exposes database _id. Safe against race conditions.
 *
 * @param {string} tenantId
 * @returns {Promise<string>} Hospital Patient ID
 */
async function generateHospitalPatientId(tenantId) {
  const normalizedTenant = String(tenantId || 'city_hospital').trim().toLowerCase();
  const hospPrefix = await getHospitalPrefix(normalizedTenant);
  const counterKey = `pat:${normalizedTenant}`;

  let nextSeq = 1;
  let candidate = '';
  let exists = true;
  let attempts = 0;

  while (exists && attempts < 20) {
    attempts++;
    const counterDoc = await Counter.findOneAndUpdate(
      { key: counterKey },
      { $inc: { seq: 1 } },
      { upsert: true, returnDocument: 'after' }
    );
    nextSeq = counterDoc.seq;
    candidate = `PAT-${hospPrefix}-${String(nextSeq).padStart(6, '0')}`;

    // Verify no existing patient has this ID within this hospital
    exists = await Patient.exists({ tenantId: normalizedTenant, patientId: candidate });
  }

  return candidate;
}

/**
 * Atomically generates a hospital-scoped, date-based, sequential Visit ID.
 * Format: VIS-<HOSP_PREFIX>-<YYYYMMDD>-<5_DIGIT_SEQ> (e.g. VIS-L11PI7-20260905-00001).
 * Safe against race conditions and concurrent requests.
 *
 * @param {string} tenantId
 * @param {Date|string} dateInput
 * @returns {Promise<string>} Hospital-scoped Visit ID
 */
async function generateVisitId(tenantId, dateInput) {
  const normalizedTenant = String(tenantId || 'city_hospital').trim().toLowerCase();
  const hospPrefix = await getHospitalPrefix(normalizedTenant);
  const dateStr = formatDateYYYYMMDD(dateInput);
  const counterKey = `vis:${normalizedTenant}:${dateStr}`;

  let nextSeq = 1;
  let candidate = '';
  let exists = true;
  let attempts = 0;

  while (exists && attempts < 20) {
    attempts++;
    const counterDoc = await Counter.findOneAndUpdate(
      { key: counterKey },
      { $inc: { seq: 1 } },
      { upsert: true, returnDocument: 'after' }
    );
    nextSeq = counterDoc.seq;
    candidate = `VIS-${hospPrefix}-${dateStr}-${String(nextSeq).padStart(5, '0')}`;

    // Verify uniqueness within tenant
    exists = await Visit.exists({ tenantId: normalizedTenant, visitId: candidate });
  }

  return candidate;
}

/**
 * Idempotent, non-destructive migration utility to backfill UH-ID and hospital Patient ID
 * for existing patients lacking them or having legacy ids.
 *
 * @returns {Promise<{ scanned: number, uhidUpdated: number, patientIdUpdated: number }>}
 */
async function backfillPatientIdentifiers() {
  const patients = await Patient.find({});
  let uhidUpdated = 0;
  let patientIdUpdated = 0;

  for (const pat of patients) {
    let changed = false;

    // 1. Backfill UH-ID if missing
    if (!pat.uhId) {
      try {
        pat.uhId = await resolveOrCreateUhid({
          contact: pat.contact,
          name: pat.name,
          email: pat.email,
          abhaId: pat.abhaId
        });
        changed = true;
        uhidUpdated++;
      } catch (err) {
        console.warn(`[backfill] Failed to resolve UH-ID for patient ${pat._id}:`, err.message);
      }
    }

    // 2. Backfill hospital Patient ID if missing or in legacy 'pat-XX' format
    if (!pat.patientId || /^pat-\d+$/i.test(pat.patientId)) {
      try {
        pat.patientId = await generateHospitalPatientId(pat.tenantId);
        changed = true;
        patientIdUpdated++;
      } catch (err) {
        console.warn(`[backfill] Failed to generate Patient ID for patient ${pat._id}:`, err.message);
      }
    }

    if (changed) {
      await pat.save();
    }
  }

  return {
    scanned: patients.length,
    uhidUpdated,
    patientIdUpdated
  };
}

module.exports = {
  CHARSET,
  UHID_LENGTH,
  UHID_REGEX,
  normalizeContact,
  formatDateYYYYMMDD,
  generateUhidCandidate,
  resolveOrCreateUhid,
  getHospitalPrefix,
  generateHospitalPatientId,
  generateVisitId,
  backfillPatientIdentifiers
};
