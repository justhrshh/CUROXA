/**
 * ============================================================================
 * QUROXA — VENDOR MASTER SCHEMA REGISTRY (AUTHORITATIVE SOURCE OF TRUTH)
 * ============================================================================
 * Source File: Vendor Master.xlsx
 * Sheet: Store Vendor Master
 * Column Count: Exactly 49 Columns
 * 
 * Rules:
 * 1. Workbook headers are preserved EXACTLY as written (including idiosyncratic
 *    casing/spelling: "PFRegistartionNo", "BanK AccountsNo", "BanK Address",
 *    "Bank1City", "VendorToNotes", "NameonPANCard", "State code", etc.).
 * 2. clientRequired: true ONLY where explicitly established by source;
 *    otherwise clientRequired: 'UNCONFIRMED'.
 * 3. systemRequired: true ONLY where essential for data integrity (e.g. supplierName).
 * 4. Section groupings strictly match the STORE VENDOR MASTER reference UX.
 */

const VENDOR_SECTIONS = [
  { id: 'supplier_details', title: 'SUPPLIER DETAILS', icon: 'building-2' },
  { id: 'concern_person_details', title: 'CONCERN PERSON DETAILS', icon: 'users' },
  { id: 'statutory_details', title: 'STATUTORY / MSME / PAN REGISTRATION', icon: 'file-check-2' },
  { id: 'bank_details', title: 'BANK DETAILS', icon: 'landmark' },
  { id: 'gst_details', title: 'GST DETAILS', icon: 'receipt' },
  { id: 'terms_conditions', title: 'TERMS & CONDITIONS', icon: 'scroll-text' }
];

const VENDOR_FIELDS = [
  // ── 1. SUPPLIER DETAILS ──
  {
    excelColumn: 'A',
    clientHeader: 'S.No',
    fieldKey: 'sNo',
    section: 'supplier_details',
    inputType: 'text',
    clientRequired: 'UNCONFIRMED',
    systemRequired: false,
    readOnly: false,
    placeholder: 'e.g. 1'
  },
  {
    excelColumn: 'B',
    clientHeader: 'SupplierID',
    fieldKey: 'supplierId',
    section: 'supplier_details',
    inputType: 'text',
    clientRequired: 'UNCONFIRMED',
    systemRequired: false,
    readOnly: false,
    placeholder: 'e.g. 327'
  },
  {
    excelColumn: 'C',
    clientHeader: 'SupplierName',
    fieldKey: 'supplierName',
    section: 'supplier_details',
    inputType: 'text',
    clientRequired: true,
    systemRequired: true,
    readOnly: false,
    placeholder: 'e.g. Genequest Diagnostics Pvt Ltd'
  },
  {
    excelColumn: 'D',
    clientHeader: 'SupplierCode',
    fieldKey: 'supplierCode',
    section: 'supplier_details',
    inputType: 'text',
    clientRequired: 'UNCONFIRMED',
    systemRequired: false,
    readOnly: false,
    placeholder: 'Auto-generated or custom code'
  },
  {
    excelColumn: 'E',
    clientHeader: 'SupplierType',
    fieldKey: 'supplierType',
    section: 'supplier_details',
    inputType: 'select',
    clientRequired: true,
    systemRequired: true,
    optionsSource: 'workbook_sample',
    allowedValues: ['Capex', 'Opex', 'Service', 'ALL'],
    placeholder: 'Select Supplier Type'
  },
  {
    excelColumn: 'F',
    clientHeader: 'SupplierCategory',
    fieldKey: 'supplierCategory',
    section: 'supplier_details',
    inputType: 'select',
    clientRequired: true,
    systemRequired: true,
    optionsSource: 'workbook_sample',
    allowedValues: ['Authorised Dealer', 'Manufacture', 'Trader'],
    placeholder: 'Select Supplier Category'
  },
  {
    excelColumn: 'G',
    clientHeader: 'OrganizationType',
    fieldKey: 'organizationType',
    section: 'supplier_details',
    inputType: 'select',
    clientRequired: true,
    systemRequired: true,
    optionsSource: 'workbook_sample',
    allowedValues: ['Private Ltd', 'Properigtership', 'Partnership', 'Public Ltd', 'LLP'],
    placeholder: 'Select Organization Type'
  },
  {
    excelColumn: 'H',
    clientHeader: 'HouseNo',
    fieldKey: 'houseNo',
    section: 'supplier_details',
    inputType: 'text',
    clientRequired: 'UNCONFIRMED',
    systemRequired: false,
    placeholder: 'Plot No / House No / Office No'
  },
  {
    excelColumn: 'I',
    clientHeader: 'Street',
    fieldKey: 'street',
    section: 'supplier_details',
    inputType: 'text',
    clientRequired: 'UNCONFIRMED',
    systemRequired: false,
    placeholder: 'Street / Building / Locality'
  },
  {
    excelColumn: 'J',
    clientHeader: 'State code',
    fieldKey: 'stateCode',
    section: 'supplier_details',
    inputType: 'text',
    clientRequired: 'UNCONFIRMED',
    systemRequired: false,
    placeholder: 'e.g. 7 (Delhi)'
  },
  {
    excelColumn: 'K',
    clientHeader: 'PinCode',
    fieldKey: 'pinCode',
    section: 'supplier_details',
    inputType: 'text',
    clientRequired: 'UNCONFIRMED',
    systemRequired: false,
    placeholder: 'e.g. 110059'
  },
  {
    excelColumn: 'L',
    clientHeader: 'Landline',
    fieldKey: 'landline',
    section: 'supplier_details',
    inputType: 'text',
    clientRequired: 'UNCONFIRMED',
    systemRequired: false,
    placeholder: 'Phone / Landline'
  },
  {
    excelColumn: 'M',
    clientHeader: 'FaxNo',
    fieldKey: 'faxNo',
    section: 'supplier_details',
    inputType: 'text',
    clientRequired: 'UNCONFIRMED',
    systemRequired: false,
    placeholder: 'Fax Number'
  },
  {
    excelColumn: 'N',
    clientHeader: 'EmailId',
    fieldKey: 'emailId',
    section: 'supplier_details',
    inputType: 'email',
    clientRequired: 'UNCONFIRMED',
    systemRequired: false,
    placeholder: 'vendor@domain.com'
  },
  {
    excelColumn: 'O',
    clientHeader: 'Website',
    fieldKey: 'website',
    section: 'supplier_details',
    inputType: 'text',
    clientRequired: 'UNCONFIRMED',
    systemRequired: false,
    placeholder: 'https://...'
  },
  {
    excelColumn: 'AB',
    clientHeader: 'ActiveStatus',
    fieldKey: 'activeStatus',
    section: 'supplier_details',
    inputType: 'select',
    clientRequired: 'UNCONFIRMED',
    systemRequired: false,
    optionsSource: 'workbook_sample',
    allowedValues: ['Yes', 'No'],
    defaultValue: 'Yes',
    placeholder: 'Active Status'
  },

  // ── 2. CONCERN PERSON DETAILS ──
  {
    excelColumn: 'P',
    clientHeader: 'PrimaryContactPerson',
    fieldKey: 'primaryContactPerson',
    section: 'concern_person_details',
    inputType: 'text',
    clientRequired: true,
    systemRequired: true,
    placeholder: 'Primary contact name'
  },
  {
    excelColumn: 'Q',
    clientHeader: 'PrimaryContactPersonDesignation',
    fieldKey: 'primaryContactPersonDesignation',
    section: 'concern_person_details',
    inputType: 'text',
    clientRequired: 'UNCONFIRMED',
    systemRequired: false,
    placeholder: 'Designation'
  },
  {
    excelColumn: 'R',
    clientHeader: 'PrimaryContactPersonMobileNo',
    fieldKey: 'primaryContactPersonMobileNo',
    section: 'concern_person_details',
    inputType: 'text',
    clientRequired: 'UNCONFIRMED',
    systemRequired: false,
    placeholder: '10-digit Mobile No'
  },
  {
    excelColumn: 'S',
    clientHeader: 'PrimaryContactPersonEmailId',
    fieldKey: 'primaryContactPersonEmailId',
    section: 'concern_person_details',
    inputType: 'email',
    clientRequired: 'UNCONFIRMED',
    systemRequired: false,
    placeholder: 'primary.contact@domain.com'
  },
  {
    excelColumn: 'T',
    clientHeader: 'SecondaryContactPerson',
    fieldKey: 'secondaryContactPerson',
    section: 'concern_person_details',
    inputType: 'text',
    clientRequired: 'UNCONFIRMED',
    systemRequired: false,
    placeholder: 'Secondary contact name'
  },
  {
    excelColumn: 'U',
    clientHeader: 'SecondaryContactPersonDesignation',
    fieldKey: 'secondaryContactPersonDesignation',
    section: 'concern_person_details',
    inputType: 'text',
    clientRequired: 'UNCONFIRMED',
    systemRequired: false,
    placeholder: 'Secondary designation'
  },
  {
    excelColumn: 'V',
    clientHeader: 'SecondaryContactPersonMobileNo',
    fieldKey: 'secondaryContactPersonMobileNo',
    section: 'concern_person_details',
    inputType: 'text',
    clientRequired: 'UNCONFIRMED',
    systemRequired: false,
    placeholder: 'Secondary Mobile No'
  },
  {
    excelColumn: 'W',
    clientHeader: 'SecondaryContactPersonEmailId',
    fieldKey: 'secondaryContactPersonEmailId',
    section: 'concern_person_details',
    inputType: 'email',
    clientRequired: 'UNCONFIRMED',
    systemRequired: false,
    placeholder: 'secondary.contact@domain.com'
  },

  // ── 3. STATUTORY / MSME / PAN REGISTRATION ──
  {
    excelColumn: 'X',
    clientHeader: 'CINNo',
    fieldKey: 'cinNo',
    section: 'statutory_details',
    inputType: 'text',
    clientRequired: 'UNCONFIRMED',
    systemRequired: false,
    placeholder: 'Corporate Identification No'
  },
  {
    excelColumn: 'Y',
    clientHeader: 'PFRegistartionNo',
    fieldKey: 'pfRegistartionNo',
    section: 'statutory_details',
    inputType: 'text',
    clientRequired: 'UNCONFIRMED',
    systemRequired: false,
    placeholder: 'PF Registration No'
  },
  {
    excelColumn: 'Z',
    clientHeader: 'NameonPANCard',
    fieldKey: 'nameOnPanCard',
    section: 'statutory_details',
    inputType: 'text',
    clientRequired: 'UNCONFIRMED',
    systemRequired: false,
    placeholder: 'Name printed on PAN'
  },
  {
    excelColumn: 'AA',
    clientHeader: 'PANCardNo',
    fieldKey: 'panCardNo',
    section: 'statutory_details',
    inputType: 'text',
    clientRequired: 'UNCONFIRMED',
    systemRequired: false,
    placeholder: 'e.g. AAJCG9206E'
  },
  {
    excelColumn: 'AC',
    clientHeader: 'ROCNo',
    fieldKey: 'rocNo',
    section: 'statutory_details',
    inputType: 'text',
    clientRequired: 'UNCONFIRMED',
    systemRequired: false,
    placeholder: 'ROC Registration No'
  },
  {
    excelColumn: 'AD',
    clientHeader: 'ESIRegistrationNo',
    fieldKey: 'esiRegistrationNo',
    section: 'statutory_details',
    inputType: 'text',
    clientRequired: 'UNCONFIRMED',
    systemRequired: false,
    placeholder: 'ESI Registration No'
  },
  {
    excelColumn: 'AE',
    clientHeader: 'ISOCertificationNo',
    fieldKey: 'isoCertificationNo',
    section: 'statutory_details',
    inputType: 'text',
    clientRequired: 'UNCONFIRMED',
    systemRequired: false,
    placeholder: 'ISO Certification No'
  },
  {
    excelColumn: 'AF',
    clientHeader: 'ISOValidUpto',
    fieldKey: 'isoValidUpto',
    section: 'statutory_details',
    inputType: 'text',
    clientRequired: 'UNCONFIRMED',
    systemRequired: false,
    placeholder: 'DD.MM.YYYY'
  },
  {
    excelColumn: 'AG',
    clientHeader: 'PollutioncontrolBoardCertificationNo',
    fieldKey: 'pollutioncontrolBoardCertificationNo',
    section: 'statutory_details',
    inputType: 'text',
    clientRequired: 'UNCONFIRMED',
    systemRequired: false,
    placeholder: 'Pollution Board Cert No'
  },
  {
    excelColumn: 'AH',
    clientHeader: 'PollutionValidUpto',
    fieldKey: 'pollutionValidUpto',
    section: 'statutory_details',
    inputType: 'text',
    clientRequired: 'UNCONFIRMED',
    systemRequired: false,
    placeholder: 'DD.MM.YYYY'
  },
  {
    excelColumn: 'AU',
    clientHeader: 'IsMSMERegistration',
    fieldKey: 'isMsmeRegistration',
    section: 'statutory_details',
    inputType: 'select',
    clientRequired: 'UNCONFIRMED',
    systemRequired: false,
    optionsSource: 'workbook_sample',
    allowedValues: ['Yes', 'No'],
    defaultValue: 'No',
    placeholder: 'Is MSME Registered'
  },
  {
    excelColumn: 'AV',
    clientHeader: 'MSMERegistrationNo',
    fieldKey: 'msmeRegistrationNo',
    section: 'statutory_details',
    inputType: 'text',
    clientRequired: 'UNCONFIRMED',
    systemRequired: false,
    placeholder: 'e.g. UDYAM-UK-05-0015861'
  },
  {
    excelColumn: 'AW',
    clientHeader: 'MSMERegistrationValidDate',
    fieldKey: 'msmeRegistrationValidDate',
    section: 'statutory_details',
    inputType: 'text',
    clientRequired: 'UNCONFIRMED',
    systemRequired: false,
    placeholder: 'DD.MM.YYYY'
  },

  // ── 4. BANK DETAILS ──
  {
    excelColumn: 'AI',
    clientHeader: 'Bank',
    fieldKey: 'bank',
    section: 'bank_details',
    inputType: 'text',
    clientRequired: 'UNCONFIRMED',
    systemRequired: false,
    placeholder: 'e.g. HDFC Bank, ICICI Bank'
  },
  {
    excelColumn: 'AJ',
    clientHeader: 'Bank Branch',
    fieldKey: 'bankBranch',
    section: 'bank_details',
    inputType: 'text',
    clientRequired: 'UNCONFIRMED',
    systemRequired: false,
    placeholder: 'Branch Name'
  },
  {
    excelColumn: 'AK',
    clientHeader: 'BanK AccountsNo',
    fieldKey: 'bankAccountsNo',
    section: 'bank_details',
    inputType: 'text',
    clientRequired: 'UNCONFIRMED',
    systemRequired: false,
    placeholder: 'Account Number'
  },
  {
    excelColumn: 'AL',
    clientHeader: 'Bank IFSCCode',
    fieldKey: 'bankIfscCode',
    section: 'bank_details',
    inputType: 'text',
    clientRequired: 'UNCONFIRMED',
    systemRequired: false,
    placeholder: 'e.g. HDFC0000129'
  },
  {
    excelColumn: 'AM',
    clientHeader: 'BanK Address',
    fieldKey: 'bankAddress',
    section: 'bank_details',
    inputType: 'text',
    clientRequired: 'UNCONFIRMED',
    systemRequired: false,
    placeholder: 'Bank Address 1'
  },
  {
    excelColumn: 'AN',
    clientHeader: 'Bank Address2',
    fieldKey: 'bankAddress2',
    section: 'bank_details',
    inputType: 'text',
    clientRequired: 'UNCONFIRMED',
    systemRequired: false,
    placeholder: 'Bank Address 2'
  },
  {
    excelColumn: 'AO',
    clientHeader: 'Bank1City',
    fieldKey: 'bank1City',
    section: 'bank_details',
    inputType: 'text',
    clientRequired: 'UNCONFIRMED',
    systemRequired: false,
    placeholder: 'Bank City'
  },
  {
    excelColumn: 'AP',
    clientHeader: 'Bank State',
    fieldKey: 'bankState',
    section: 'bank_details',
    inputType: 'text',
    clientRequired: 'UNCONFIRMED',
    systemRequired: false,
    placeholder: 'Bank State'
  },

  // ── 5. GST DETAILS ──
  {
    excelColumn: 'AT',
    clientHeader: 'GSTNo',
    fieldKey: 'gstNo',
    section: 'gst_details',
    inputType: 'text',
    clientRequired: 'UNCONFIRMED',
    systemRequired: false,
    placeholder: 'e.g. 07AAJCG9206E1ZN'
  },

  // ── 6. TERMS & CONDITIONS ──
  {
    excelColumn: 'AQ',
    clientHeader: 'PaymentTerms',
    fieldKey: 'paymentTerms',
    section: 'terms_conditions',
    inputType: 'text',
    clientRequired: 'UNCONFIRMED',
    systemRequired: false,
    placeholder: 'e.g. 30 Days'
  },
  {
    excelColumn: 'AR',
    clientHeader: 'DeliveryTerms',
    fieldKey: 'deliveryTerms',
    section: 'terms_conditions',
    inputType: 'text',
    clientRequired: 'UNCONFIRMED',
    systemRequired: false,
    placeholder: 'e.g. Door Delivery'
  },
  {
    excelColumn: 'AS',
    clientHeader: 'VendorToNotes',
    fieldKey: 'vendorToNotes',
    section: 'terms_conditions',
    inputType: 'text',
    clientRequired: 'UNCONFIRMED',
    systemRequired: false,
    placeholder: 'Notes / Remarks'
  }
];

// Sort fields in exact Excel workbook order (Column A to AW)
const EXCEL_COLUMN_ORDER = [
  'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J',
  'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R', 'S', 'T',
  'U', 'V', 'W', 'X', 'Y', 'Z', 'AA', 'AB', 'AC', 'AD',
  'AE', 'AF', 'AG', 'AH', 'AI', 'AJ', 'AK', 'AL', 'AM', 'AN',
  'AO', 'AP', 'AQ', 'AR', 'AS', 'AT', 'AU', 'AV', 'AW'
];

const VENDOR_FIELDS_EXCEL_ORDER = [...VENDOR_FIELDS].sort((a, b) => {
  return EXCEL_COLUMN_ORDER.indexOf(a.excelColumn) - EXCEL_COLUMN_ORDER.indexOf(b.excelColumn);
});

const getVendorField = (key) => VENDOR_FIELDS.find(f => f.fieldKey === key || f.clientHeader === key);
const getVendorFieldsBySection = (sectionId) => VENDOR_FIELDS.filter(f => f.section === sectionId);
const getAllVendorFields = () => VENDOR_FIELDS_EXCEL_ORDER;
const getAllVendorSections = () => VENDOR_SECTIONS;

module.exports = {
  VENDOR_SECTIONS,
  VENDOR_FIELDS,
  VENDOR_FIELDS_EXCEL_ORDER,
  EXCEL_COLUMN_ORDER,
  getVendorField,
  getVendorFieldsBySection,
  getAllVendorFields,
  getAllVendorSections
};
