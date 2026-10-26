const mongoose = require('mongoose');

const superAdminHospitalSchema = new mongoose.Schema({
  name: { type: String, required: true },
  code: { type: String, required: true, unique: true, lowercase: true, trim: true },
  hospitalId: {
    type: String,
    unique: true,
    sparse: true,
    uppercase: true,
    trim: true,
    match: [/^HSP-[A-Z0-9]{6}$/, 'hospitalId must match format HSP-XXXXXX with 6 uppercase alphanumeric characters']
  },
  logo: { type: String, default: 'H' },
  letterheadUrl: { type: String, default: '' },
  customDomain: { type: String, default: '' },
  plan: { type: String, default: 'Standard Basic' },
  subscriptionPlan: { type: String, default: '' },
  subscriptionStatus: {
    type: String,
    enum: ['ACTIVE', 'EXPIRING', 'EXPIRED', 'SUSPENDED'],
    default: 'ACTIVE'
  },
  subscriptionStartDate: { type: Date },
  subscriptionExpiryDate: { type: Date },
  trialDays: { type: Number, default: 7 },
  trialUsed: { type: Boolean, default: false },
  contractDurationYears: { type: Number, default: 1 },
  status: { type: String, default: 'Active' },
  csm: { type: String, default: '' },
  onboardingLead: { type: String, default: '' },
  goLiveDate: { type: String, default: '' },
  gst: { type: String, default: '' },
  isGstVerified: { type: Boolean, default: false },
  gstVerificationDetails: {
    verifiedAt: { type: String, default: '' },
    legalName: { type: String, default: '' },
    state: { type: String, default: '' },
    pan: { type: String, default: '' },
    taxpayerType: { type: String, default: '' },
    status: { type: String, default: '' },
    verificationHash: { type: String, default: '' }
  },
  license: { type: String, default: '' },
  isLicenseVerified: { type: Boolean, default: false },
  licenseVerificationDetails: {
    verifiedAt: { type: String, default: '' },
    licenseeName: { type: String, default: '' },
    validUntil: { type: String, default: '' },
    issuingAuthority: { type: String, default: '' },
    regNo: { type: String, default: '' },
    drugCategories: { type: String, default: '' },
    verificationHash: { type: String, default: '' }
  },
  address: { type: String, default: '' },
  panNumber: { type: String, default: '' },
  corpId: { type: String, default: '' },
  signatoryName: { type: String, default: '' },
  fireSafetyCertificate: { type: String, default: '' },
  pollutionCertificate: { type: String, default: '' },
  revenue: { type: String, default: '' },
  healthScore: { type: Number, default: 100 },
  suspensionHistory: [{
    action: { type: String },
    date: { type: String },
    reason: { type: String },
    actor: { type: String }
  }],
  modules: {
    reception: { enabled: { type: Boolean, default: true }, lastMod: { type: String } },
    doctor: { enabled: { type: Boolean, default: true }, lastMod: { type: String } },
    pharmacy: { enabled: { type: Boolean, default: true }, lastMod: { type: String } },
    laboratory: { enabled: { type: Boolean, default: true }, lastMod: { type: String } },
    inventory: { enabled: { type: Boolean, default: true }, lastMod: { type: String } },
    dpdp: { enabled: { type: Boolean, default: true }, lastMod: { type: String } },
    receptionQueue: { enabled: { type: Boolean, default: false }, lastMod: { type: String } }
  },
  doctorClinicalMode: {
    type: String,
    enum: ['ONLINE', 'OFFLINE'],
    default: 'ONLINE'
  },
  limits: {
    doctorsUsed: { type: Number, default: 0 },
    doctorsLimit: { type: Number, default: 10 },
    staffUsed: { type: Number, default: 0 },
    staffLimit: { type: Number, default: 20 },
    storageUsed: { type: Number, default: 0 },
    storageLimit: { type: Number, default: 50 },
    patients: { type: Number, default: 0 }
  },
  prescriptionTemplates: [{
    name: { type: String, required: true },
    xLeft: { type: Number, default: 15 },
    xRight: { type: Number, default: 15 },
    yTop: { type: Number, default: 38 },
    yBottom: { type: Number, default: 28 },
    isStandard: { type: Boolean, default: false }
  }]
}, { timestamps: true });

superAdminHospitalSchema.pre('validate', async function() {
  if (!this.hospitalId) {
    const { generateUniqueHospitalId } = require('../utils/generateHospitalId');
    this.hospitalId = await generateUniqueHospitalId(this.constructor);
  }

  // Reception Queue module default-off enforcement:
  // Must default to disabled ({ enabled: false }) unless explicitly set to true.
  // Explicitly enabled clinics (true) are strictly preserved.
  if (!this.modules) {
    this.modules = {};
  }
  if (!this.modules.receptionQueue || typeof this.modules.receptionQueue !== 'object') {
    this.modules.receptionQueue = { enabled: false };
  } else {
    const rawVal = this.modules.receptionQueue.enabled;
    const isExplicitlyTrue = rawVal === true || String(rawVal).trim().toLowerCase() === 'true';
    this.modules.receptionQueue.enabled = isExplicitlyTrue;
  }
});

superAdminHospitalSchema.pre('findOneAndUpdate', function() {
  const update = this.getUpdate();
  if (!update) return;

  if (update.modules && typeof update.modules === 'object') {
    if (update.modules.receptionQueue && typeof update.modules.receptionQueue === 'object' && update.modules.receptionQueue.enabled !== undefined) {
      const rawVal = update.modules.receptionQueue.enabled;
      update.modules.receptionQueue.enabled = (rawVal === true || String(rawVal).trim().toLowerCase() === 'true');
    }
  }

  if (update.$set) {
    if (update.$set.modules && typeof update.$set.modules === 'object') {
      if (update.$set.modules.receptionQueue && typeof update.$set.modules.receptionQueue === 'object' && update.$set.modules.receptionQueue.enabled !== undefined) {
        const rawVal = update.$set.modules.receptionQueue.enabled;
        update.$set.modules.receptionQueue.enabled = (rawVal === true || String(rawVal).trim().toLowerCase() === 'true');
      }
    }
    if (update.$set['modules.receptionQueue'] && typeof update.$set['modules.receptionQueue'] === 'object' && update.$set['modules.receptionQueue'].enabled !== undefined) {
      const rawVal = update.$set['modules.receptionQueue'].enabled;
      update.$set['modules.receptionQueue'].enabled = (rawVal === true || String(rawVal).trim().toLowerCase() === 'true');
    }
    if (update.$set['modules.receptionQueue.enabled'] !== undefined) {
      const rawVal = update.$set['modules.receptionQueue.enabled'];
      update.$set['modules.receptionQueue.enabled'] = (rawVal === true || String(rawVal).trim().toLowerCase() === 'true');
    }
  }
});

module.exports = mongoose.model('SuperAdminHospital', superAdminHospitalSchema);
