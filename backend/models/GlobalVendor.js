const mongoose = require('mongoose');

/**
 * ============================================================================
 * QUROXA — CANONICAL GLOBAL VENDOR MASTER MODEL
 * ============================================================================
 * Authoritative storage for global vendors.
 * Exactly preserves all 49 fields from the Store Vendor Master workbook.
 * Completely independent of Item Master.
 */
const globalVendorSchema = new mongoose.Schema({
  // ── 1. SUPPLIER DETAILS ──
  sNo: { type: String, trim: true },
  supplierId: { type: String, trim: true },
  supplierName: { type: String, required: true, trim: true, index: true },
  supplierCode: { type: String, trim: true, uppercase: true, index: true },
  supplierType: { type: String, trim: true, default: '' },
  supplierCategory: { type: String, trim: true, default: '' },
  organizationType: { type: String, trim: true, default: '' },
  houseNo: { type: String, trim: true, default: '' },
  street: { type: String, trim: true, default: '' },
  stateCode: { type: String, trim: true, default: '' },
  pinCode: { type: String, trim: true, default: '' },
  landline: { type: String, trim: true, default: '' },
  faxNo: { type: String, trim: true, default: '' },
  emailId: { type: String, trim: true, lowercase: true, default: '' },
  website: { type: String, trim: true, default: '' },
  activeStatus: { type: String, trim: true, default: 'Yes' },

  // ── 2. CONCERN PERSON DETAILS ──
  primaryContactPerson: { type: String, trim: true, default: '' },
  primaryContactPersonDesignation: { type: String, trim: true, default: '' },
  primaryContactPersonMobileNo: { type: String, trim: true, default: '' },
  primaryContactPersonEmailId: { type: String, trim: true, default: '' },
  secondaryContactPerson: { type: String, trim: true, default: '' },
  secondaryContactPersonDesignation: { type: String, trim: true, default: '' },
  secondaryContactPersonMobileNo: { type: String, trim: true, default: '' },
  secondaryContactPersonEmailId: { type: String, trim: true, default: '' },

  // ── 3. STATUTORY / MSME / PAN REGISTRATION ──
  cinNo: { type: String, trim: true, default: '' },
  pfRegistartionNo: { type: String, trim: true, default: '' },
  nameOnPanCard: { type: String, trim: true, default: '' },
  panCardNo: { type: String, trim: true, uppercase: true, default: '', index: true },
  rocNo: { type: String, trim: true, default: '' },
  esiRegistrationNo: { type: String, trim: true, default: '' },
  isoCertificationNo: { type: String, trim: true, default: '' },
  isoValidUpto: { type: String, trim: true, default: '' },
  pollutioncontrolBoardCertificationNo: { type: String, trim: true, default: '' },
  pollutionValidUpto: { type: String, trim: true, default: '' },
  isMsmeRegistration: { type: String, trim: true, default: 'No' },
  msmeRegistrationNo: { type: String, trim: true, default: '' },
  msmeRegistrationValidDate: { type: String, trim: true, default: '' },

  // ── 4. BANK DETAILS ──
  bank: { type: String, trim: true, default: '' },
  bankBranch: { type: String, trim: true, default: '' },
  bankAccountsNo: { type: String, trim: true, default: '' },
  bankIfscCode: { type: String, trim: true, uppercase: true, default: '' },
  bankAddress: { type: String, trim: true, default: '' },
  bankAddress2: { type: String, trim: true, default: '' },
  bank1City: { type: String, trim: true, default: '' },
  bankState: { type: String, trim: true, default: '' },

  // ── 5. GST DETAILS ──
  gstNo: { type: String, trim: true, uppercase: true, default: '', index: true },

  // ── 6. TERMS & CONDITIONS ──
  paymentTerms: { type: String, trim: true, default: '' },
  deliveryTerms: { type: String, trim: true, default: '' },
  vendorToNotes: { type: String, trim: true, default: '' },

  // ── 7. SYSTEM / CANONICAL METADATA ──
  scope: { type: String, default: 'GLOBAL', index: true },
  status: { type: String, enum: ['ACTIVE', 'INACTIVE'], default: 'ACTIVE', index: true },
  createdBy: { type: String, default: 'SuperAdmin' },
  createdByType: { type: String, enum: ['SUPERADMIN', 'REQUEST_APPROVAL', 'SYSTEM'], default: 'SUPERADMIN' },
  originRequestId: { type: mongoose.Schema.Types.ObjectId, ref: 'VendorRequest', default: null },
  originHospitalTenantId: { type: String, default: null },
  lastModifiedBy: { type: String, default: null }
}, {
  timestamps: true
});

module.exports = mongoose.model('GlobalVendor', globalVendorSchema);
