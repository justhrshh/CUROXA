const mongoose = require('mongoose');

const superAdminOnboardingSchema = new mongoose.Schema({
  name: { type: String, default: '' },
  exec: { type: String, default: '' },
  progress: { type: Number, default: 0 },
  daysLeft: { type: Number, default: 14 },
  priority: { type: String, default: 'Medium' }, // Low, Medium, High
  stage: { type: String, default: 'Verification' }, // Verification, Configuration, Training, Go Live

  // Wizard Navigation
  currentStep: { type: Number, default: 1 },

  // Step 1: Basic Information
  hospitalType: { type: String, default: '' },
  regNumber: { type: String, default: '' },
  bedsCount: { type: Number, default: 0 },
  beds: { type: Number, default: 0 },
  operationalDoctors: { type: Number, default: 0 },
  branchesCount: { type: Number, default: 1 },
  contactName: { type: String, default: '' },
  contactDesignation: { type: String, default: '' },
  contactEmail: { type: String, default: '' },
  contactMobile: { type: String, default: '' },
  country: { type: String, default: 'India' },
  city: { type: String, default: '' },
  addressLine1: { type: String, default: '' },
  address: { type: String, default: '' },
  googleMapUrl: { type: String, default: '' },
  latitude: { type: String, default: '' },
  longitude: { type: String, default: '' },

  // Step 2: Organization Setup / Localization
  timezone: { type: String, default: 'Asia/Kolkata' },
  currency: { type: String, default: 'INR' },
  dateFormat: { type: String, default: 'DD/MM/YYYY' },
  timeFormat: { type: String, default: '12-hour' },
  language: { type: String, default: 'English' },

  // Step 3: Legal & Compliance
  panNumber: { type: String, default: '' },
  gstin: { type: String, default: '' },
  panGstStatus: { type: String, default: 'Pending' }, // Pending, Approved, Rejected
  corpId: { type: String, default: '' },
  signatoryName: { type: String, default: '' },
  entityStatus: { type: String, default: 'Pending' }, // Pending, Approved, Rejected
  drugLicense: { type: String, default: '' },
  fireSafetyCertificate: { type: String, default: '' },
  pollutionCertificate: { type: String, default: '' },
  complianceDocuments: [{
    url: String,
    filename: String,
    uploadedAt: { type: Date, default: Date.now }
  }],


  // Step 4: Subscription & Licensing
  subscriptionPlan: { type: String, default: 'professional' }, // basic, professional, enterprise, custom
  billingCycle: { type: String, default: 'monthly' }, // monthly, annual
  contractStartDate: { type: String, default: '' },
  contractDurationYears: { type: Number, default: 1 },
  modules: [{ type: String }], // Active modules e.g. ['reception', 'doctor']
  doctorClinicalMode: { type: String, enum: ['ONLINE', 'OFFLINE'], default: 'ONLINE' },
  configuredModules: { type: mongoose.Schema.Types.Mixed, default: {} },

  // Step 5: User & Role Provisioning / Sandbox
  provisionedUsers: [{
    firstName: String,
    lastName: String,
    email: String,
    phone: String,
    secPhone: String,
    branch: String,
    department: String,
    manager: String,
    shift: String,
    role: String,
    password: { type: String, default: 'Staff@123' },
    status: { type: String, default: 'Pending Invite' }
  }],
  sandboxDbUrl: { type: String, default: '' },
  sandboxStatus: { type: String, default: 'Pending' }, // Pending, Approved, Rejected
  adminName: { type: String, default: '' },
  adminEmail: { type: String, default: '' },
  adminPhone: { type: String, default: '' },
  adminPassword: { type: String, default: '' },
  adminStatus: { type: String, default: 'Pending' }, // Pending, Approved, Rejected

  // Step 6: ERP Configuration
  erpCustomDomain: { type: String, default: '' },
  securityTwoFactor: { type: Boolean, default: false },
  patientAutoIdPattern: { type: String, default: 'MED-{{yyyy}}-{{num}}' },

  // Step 7: Data Migration
  migrationSourceType: { type: String, default: 'None' }, // None, Excel/CSV, Legacy SQL
  migrationRecordsCount: { type: Number, default: 0 },

  // Step 8: Review & Validation
  validationStatus: { type: String, default: 'Pending' }, // Pending, Passed, Failed

  // Step 9: Go Live
  isActivated: { type: Boolean, default: false }
}, { timestamps: true });

module.exports = mongoose.model('SuperAdminOnboarding', superAdminOnboardingSchema);
