const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  tenantId: {
    type: String,
    required: true,
    default: 'city_hospital',
    index: true,
    lowercase: true,
    trim: true
  },
  staff_id: {
    type: String,
    required: true,
    lowercase: true,
    trim: true
  },
  password_hash: {
    type: String,
    required: true,
    select: false
  },
  password_version: {
    type: Number,
    default: 0
  },
  otp_code: {
    type: String,
    default: null
  },
  otp_expires_at: {
    type: Date,
    default: null
  },
  otp_purpose: {
    type: String,
    default: null
  },
  login_otp_code: {
    type: String,
    default: null
  },
  login_otp_expires_at: {
    type: Date,
    default: null
  },
  login_otp_purpose: {
    type: String,
    default: null
  },
  role: {
    type: String,
    required: true,
  },
  name: {
    type: String,
    required: true,
  },
  email: {
    type: String,
    default: '',
    trim: true,
    lowercase: true
  },
  hasSetPassword: {
    type: Boolean,
    default: true
  },
  specialty: {
    type: String,
    default: ''
  },
  isSetupComplete: {
    type: Boolean,
    default: false
  },
  max_slots: {
    type: Number,
    default: 10
  },
  consultationFee: {
    type: Number,
    default: 500
  },
  lastLogin: {
    type: Date
  },
  avatar: {
    type: String,
    default: ''
  },
  phone: {
    type: String,
    default: ''
  },
  gender: {
    type: String,
    default: ''
  },
  dob: {
    type: String,
    default: ''
  },
  bloodGroup: {
    type: String,
    default: ''
  },
  address: {
    type: String,
    default: ''
  },
  emergencyContact: {
    name: { type: String, default: '' },
    relation: { type: String, default: '' },
    phone: { type: String, default: '' }
  },
  aadhaar: {
    type: String,
    default: ''
  },
  pan: {
    type: String,
    default: ''
  },
  department: {
    type: String,
    default: ''
  },
  designation: {
    type: String,
    default: ''
  },
  employmentType: {
    type: String,
    default: ''
  },
  joiningDate: {
    type: String,
    default: ''
  },
  reportingManagerId: {
    type: String,
    default: ''
  },
  reportingManagerName: {
    type: String,
    default: ''
  },
  workLocation: {
    type: String,
    default: ''
  },
  shiftName: {
    type: String,
    default: ''
  },
  grade: {
    type: String,
    default: ''
  },
  noticePeriodDays: {
    type: Number,
    default: 30
  },
  experienceYears: {
    type: Number,
    default: 0
  },
  bankDetails: {
    accountHolder: { type: String, default: '' },
    accountNumber: { type: String, default: '' },
    bankName: { type: String, default: '' },
    ifsc: { type: String, default: '' }
  },
  ctcAnnual: {
    type: Number,
    default: 0
  },
  pfEnrolled: {
    type: Boolean,
    default: true
  },
  esiEnrolled: {
    type: Boolean,
    default: false
  },
  taxBracket: {
    type: String,
    default: ''
  },
  leaveBalance: {
    sick: { type: Number, default: 12 },
    casual: { type: Number, default: 10 },
    annual: { type: Number, default: 15 },
    maternity: { type: Number, default: 90 },
    paternity: { type: Number, default: 14 },
    compOff: { type: Number, default: 5 },
    lwp: { type: Number, default: 0 }
  },
  carriedForwardLeaves: {
    type: Number,
    default: 0
  },
  monthlyLeaveAllocation: {
    sick: { type: Number, default: 1 },
    casual: { type: Number, default: 1 },
    annual: { type: Number, default: 1.25 }
  },
  doctorSlots: {
    type: [String],
    default: []
  },
  weeklyOff: {
    type: mongoose.Schema.Types.Mixed,
    default: 'Sunday'
  },
  documents: [{
    category: { type: String, required: true },
    title: { type: String, required: true },
    fileName: { type: String, required: true },
    fileData: { type: String, required: true },
    fileType: { type: String, required: true },
    uploadedAt: { type: Date, default: Date.now },
    uploadedBy: { type: String, required: true }
  }]
}, { timestamps: true });

// Unique index for uniqueness per tenant
userSchema.index({ tenantId: 1, staff_id: 1 }, { unique: true });

module.exports = mongoose.model('User', userSchema);
