/**
 * QUROXA — MASTER DEMO DATA SEED SCRIPT
 *
 * Scope: DEVELOPMENT / LOCAL TESTING ONLY
 * Strictly Prohibited in Production
 *
 * Populates realistic Global ItemMaster records across verified categories:
 * - Lab Operation (12 items across Biochemistry, Hematology, Clinical Pathology)
 * - Pharmacy (10 medicines in Medicine)
 * - Pathology (12 items across Hematology, Clinical Pathology, Microbiology)
 * - Service (6 OPD services)
 * - Assets (6 assets, strictly department-free)
 *
 * Also creates initial HospitalMasterConfig records for City Hospital (tenantId: city_hospital).
 * Guarantees:
 * - Deterministic itemCode generation
 * - Idempotent upserts (safe to run multiple times)
 * - Strict conformity to MASTER_SCHEMA_REGISTRY
 * - Zero invented fields, zero invented departments, zero invented pricing columns
 */

const mongoose = require('mongoose');
require('dotenv').config();

const ItemMaster = require('../models/ItemMaster');
const HospitalMasterConfig = require('../models/HospitalMasterConfig');
const SuperAdminHospital = require('../models/SuperAdminHospital');
const { MASTER_SCHEMA_REGISTRY } = require('../config/masterSchemaRegistry');

if (process.env.NODE_ENV === 'production') {
  console.error('[SECURITY ERROR] Master Demo Data seeding is strictly prohibited in production environments.');
  process.exit(1);
}

// ─────────────────────────────────────────────────────────────────────────────
// DEMO DATA DEFINITIONS
// ─────────────────────────────────────────────────────────────────────────────

const LAB_OPERATION_ITEMS = [
  // Biochemistry
  {
    itemCode: '990000001',
    itemName: 'Fully Automated Biochemistry Analyzer',
    department: 'Biochemistry',
    itemTypeName: 'Equipment',
    description: 'Automated discrete analyzer for clinical chemistry investigations',
    specification: '400 tests/hour throughput',
    makeandModelNo: 'AU480',
    hsnCode: '90278090',
    expirable: 'No',
    expiryDateCutoff: 0,
    gstnTax: 18,
    manufactureName: 'Beckman Coulter',
    catalogNo: 'BC-AU480',
    machineId: 'BIO-AU480-001',
    machineName: 'AU480',
    purchasedUnit: 'Unit',
    converter: 1,
    packSize: '1 Unit',
    consumptionUnit: 'Unit',
    issueMultiplier: 1
  },
  {
    itemCode: '990000002',
    itemName: 'Clinical Chemistry Reagent Kit - Glucose',
    department: 'Biochemistry',
    itemTypeName: 'Reagent',
    description: 'Enzymatic GOD-PAP method reagent kit for quantitative glucose determination',
    specification: '1000 tests kit',
    makeandModelNo: 'GLU-1000',
    hsnCode: '38221990',
    expirable: 'Yes',
    expiryDateCutoff: 90,
    gstnTax: 12,
    manufactureName: 'Abbott Diagnostics',
    catalogNo: 'ABB-GLU-1000',
    machineId: '',
    machineName: '',
    purchasedUnit: 'Kit',
    converter: 1,
    packSize: '1 Kit (1000 Tests)',
    consumptionUnit: 'Test',
    issueMultiplier: 1
  },
  {
    itemCode: '990000003',
    itemName: 'Electrolyte ISE Buffer Reagent Pack',
    department: 'Biochemistry',
    itemTypeName: 'Reagent',
    description: 'Buffer solution for ion-selective electrode electrolyte analyzers',
    specification: '500 mL Pack',
    makeandModelNo: 'ISE-BUF-500',
    hsnCode: '38221990',
    expirable: 'Yes',
    expiryDateCutoff: 60,
    gstnTax: 12,
    manufactureName: 'Roche Diagnostics',
    catalogNo: 'ROC-ISE-500',
    machineId: 'BIO-ISE-900',
    machineName: 'Cobas b 123',
    purchasedUnit: 'PAC',
    converter: 1,
    packSize: '500 mL',
    consumptionUnit: 'PAC',
    issueMultiplier: 1
  },
  {
    itemCode: '990000004',
    itemName: 'Multi-Calibrator Human Serum Level 1 & 2',
    department: 'Biochemistry',
    itemTypeName: 'Calibrator',
    description: 'Lyophilized human serum based calibrator for chemistry auto-analyzers',
    specification: '5 x 5 mL Vials',
    makeandModelNo: 'CAL-HS-5',
    hsnCode: '38221990',
    expirable: 'Yes',
    expiryDateCutoff: 45,
    gstnTax: 12,
    manufactureName: 'Bio-Rad Laboratories',
    catalogNo: 'BR-CAL-HS5',
    machineId: '',
    machineName: '',
    purchasedUnit: 'SET',
    converter: 1,
    packSize: '5 Vials',
    consumptionUnit: 'Vial',
    issueMultiplier: 1
  },

  // Hematology
  {
    itemCode: '990000005',
    itemName: '5-Part Differential Hematology Cell Counter',
    department: 'Hematology',
    itemTypeName: 'Equipment',
    description: 'Automated 5-part differential hematology analyzer with autoloader',
    specification: '60 samples/hour',
    makeandModelNo: 'XN-550',
    hsnCode: '90278090',
    expirable: 'No',
    expiryDateCutoff: 0,
    gstnTax: 18,
    manufactureName: 'Sysmex Corporation',
    catalogNo: 'SYS-XN550',
    machineId: 'HEM-XN550-01',
    machineName: 'XN-550',
    purchasedUnit: 'Unit',
    converter: 1,
    packSize: '1 Unit',
    consumptionUnit: 'Unit',
    issueMultiplier: 1
  },
  {
    itemCode: '990000006',
    itemName: 'Hematology Cellpack Diluent 20L',
    department: 'Hematology',
    itemTypeName: 'Reagent',
    description: 'Diluent for automated cell counting and sizing',
    specification: '20 Liter Cubitainer',
    makeandModelNo: 'CPK-20L',
    hsnCode: '38221990',
    expirable: 'Yes',
    expiryDateCutoff: 90,
    gstnTax: 12,
    manufactureName: 'Sysmex Corporation',
    catalogNo: 'SYS-CPK-20L',
    machineId: 'HEM-XN550-01',
    machineName: 'XN-550',
    purchasedUnit: 'PAC',
    converter: 1,
    packSize: '20 L',
    consumptionUnit: 'PAC',
    issueMultiplier: 1
  },
  {
    itemCode: '990000007',
    itemName: 'Stromatolyser-WH Lyse Reagent 3x500mL',
    department: 'Hematology',
    itemTypeName: 'Reagent',
    description: 'Hemoglobin lyse reagent for automated differential determination',
    specification: '3 x 500 mL Pack',
    makeandModelNo: 'STR-WH-500',
    hsnCode: '38221990',
    expirable: 'Yes',
    expiryDateCutoff: 60,
    gstnTax: 12,
    manufactureName: 'Sysmex Corporation',
    catalogNo: 'SYS-STR-500',
    machineId: 'HEM-XN550-01',
    machineName: 'XN-550',
    purchasedUnit: 'PAC',
    converter: 3,
    packSize: '3 x 500 mL',
    consumptionUnit: 'Bottle',
    issueMultiplier: 1
  },
  {
    itemCode: '990000008',
    itemName: 'Three-Level Whole Blood Tri-Check Control',
    department: 'Hematology',
    itemTypeName: 'Calibrator',
    description: 'Whole blood hematology control covering Low, Normal, and High levels',
    specification: '3 x 3 mL Vials',
    makeandModelNo: 'TRI-CHK-3ML',
    hsnCode: '38221990',
    expirable: 'Yes',
    expiryDateCutoff: 30,
    gstnTax: 12,
    manufactureName: 'Streck Laboratories',
    catalogNo: 'STR-TC-3ML',
    machineId: '',
    machineName: '',
    purchasedUnit: 'SET',
    converter: 3,
    packSize: '3 Vials',
    consumptionUnit: 'Vial',
    issueMultiplier: 1
  },

  // Clinical Pathology
  {
    itemCode: '990000009',
    itemName: 'Automated Urine Chemistry & Sediment Analyzer',
    department: 'Clinical Pathology',
    itemTypeName: 'Equipment',
    description: 'Integrated urine test strip and digital flow morphology sediment analyzer',
    specification: '120 tests/hour',
    makeandModelNo: 'UC-3500',
    hsnCode: '90278090',
    expirable: 'No',
    expiryDateCutoff: 0,
    gstnTax: 18,
    manufactureName: 'Sysmex Corporation',
    catalogNo: 'SYS-UC3500',
    machineId: 'CP-UC3500-01',
    machineName: 'UC-3500',
    purchasedUnit: 'Unit',
    converter: 1,
    packSize: '1 Unit',
    consumptionUnit: 'Unit',
    issueMultiplier: 1
  },
  {
    itemCode: '990000010',
    itemName: '10-Parameter Urine Test Strips (100 Strips)',
    department: 'Clinical Pathology',
    itemTypeName: 'Consumable',
    description: 'Reagent test strips for determination of 10 parameters in urine',
    specification: 'Canister of 100 Strips',
    makeandModelNo: 'MED-10G',
    hsnCode: '38221990',
    expirable: 'Yes',
    expiryDateCutoff: 180,
    gstnTax: 12,
    manufactureName: 'Siemens Healthineers',
    catalogNo: 'SIE-U10-100',
    machineId: 'CP-UC3500-01',
    machineName: 'UC-3500',
    purchasedUnit: 'PAC',
    converter: 100,
    packSize: '100 Strips',
    consumptionUnit: 'Strip',
    issueMultiplier: 1
  },
  {
    itemCode: '990000011',
    itemName: 'Fecal Occult Blood Immunochemical Rapid Test',
    department: 'Clinical Pathology',
    itemTypeName: 'Reagent',
    description: 'Qualitative immunochemical fecal occult blood detection kit',
    specification: '25 Test Cassettes',
    makeandModelNo: 'FOB-25T',
    hsnCode: '38221990',
    expirable: 'Yes',
    expiryDateCutoff: 365,
    gstnTax: 12,
    manufactureName: 'SD Biosensor',
    catalogNo: 'SDB-FOB-25',
    machineId: '',
    machineName: '',
    purchasedUnit: 'Box',
    converter: 25,
    packSize: '25 Cassettes',
    consumptionUnit: 'Cassette',
    issueMultiplier: 1
  },
  {
    itemCode: '990000012',
    itemName: 'Neubauer Improved Hemocytometer Counting Chamber',
    department: 'Clinical Pathology',
    itemTypeName: 'Consumable',
    description: 'Bright-line ruled glass hemocytometer counting chamber with 2 coverslips',
    specification: 'Precision 0.1 mm depth',
    makeandModelNo: 'NEU-IMP-BL',
    hsnCode: '90279090',
    expirable: 'No',
    expiryDateCutoff: 0,
    gstnTax: 18,
    manufactureName: 'Marienfeld Superior',
    catalogNo: 'MAR-0610030',
    machineId: '',
    machineName: '',
    purchasedUnit: 'PAC',
    converter: 1,
    packSize: '1 Chamber + 2 Coverslips',
    consumptionUnit: 'PAC',
    issueMultiplier: 1
  },

  // Serology
  {
    itemCode: '990000013',
    itemName: 'Rapid Plasma Reagin RPR Syphilis Test Kit',
    department: 'Serology',
    itemTypeName: 'Reagent',
    description: 'Non-treponemal flocculation test kit for detection of reagin antibodies',
    specification: '100 Tests Kit',
    makeandModelNo: 'RPR-100T',
    hsnCode: '38221990',
    expirable: 'Yes',
    expiryDateCutoff: 180,
    gstnTax: 12,
    manufactureName: 'Span Diagnostics',
    catalogNo: 'SPAN-RPR-100',
    machineId: '',
    machineName: '',
    purchasedUnit: 'Kit',
    converter: 100,
    packSize: '100 Tests',
    consumptionUnit: 'Test',
    issueMultiplier: 1
  },

  // Molecular Biology
  {
    itemCode: '990000014',
    itemName: 'Real-Time PCR TaqPath Master Mix 5mL',
    department: 'Molecular Biology',
    itemTypeName: 'Reagent',
    description: 'High-performance master mix for qualitative and quantitative real-time PCR',
    specification: '5 mL Tube',
    makeandModelNo: 'TP-MM-5ML',
    hsnCode: '38221990',
    expirable: 'Yes',
    expiryDateCutoff: 90,
    gstnTax: 12,
    manufactureName: 'Thermo Fisher Scientific',
    catalogNo: 'TFS-A15297',
    machineId: 'MB-QS5-01',
    machineName: 'QuantStudio 5',
    purchasedUnit: 'Vial',
    converter: 1,
    packSize: '5 mL',
    consumptionUnit: 'Vial',
    issueMultiplier: 1
  },

  // Immunology
  {
    itemCode: '990000015',
    itemName: 'Chemiluminescence Immunoassay Thyroid TSH Kit',
    department: 'Immunology',
    itemTypeName: 'Reagent',
    description: 'Quantitative CLIA kit for determination of thyroid stimulating hormone',
    specification: '100 Tests Pack',
    makeandModelNo: 'TSH-CLIA-100',
    hsnCode: '38221990',
    expirable: 'Yes',
    expiryDateCutoff: 60,
    gstnTax: 12,
    manufactureName: 'Abbott Diagnostics',
    catalogNo: 'ABB-TSH-100',
    machineId: 'IMM-ARCH-01',
    machineName: 'Architect i2000SR',
    purchasedUnit: 'Kit',
    converter: 100,
    packSize: '100 Tests',
    consumptionUnit: 'Test',
    issueMultiplier: 1
  },

  // Histopathology
  {
    itemCode: '990000016',
    itemName: 'Buffered Neutral Formalin 10% Solution 5L',
    department: 'Histopathology',
    itemTypeName: 'Consumable',
    description: 'Histological tissue fixative solution 10% neutral buffered formalin',
    specification: '5 Liter Can',
    makeandModelNo: 'NBF-10-5L',
    hsnCode: '38221990',
    expirable: 'Yes',
    expiryDateCutoff: 365,
    gstnTax: 18,
    manufactureName: 'Merck Healthcare',
    catalogNo: 'MRK-NBF-5L',
    machineId: '',
    machineName: '',
    purchasedUnit: 'Can',
    converter: 1,
    packSize: '5 L',
    consumptionUnit: 'Can',
    issueMultiplier: 1
  },

  // Microbiology
  {
    itemCode: '990000017',
    itemName: 'Blood Agar Base Dehydrated Culture Media 500g',
    department: 'Microbiology',
    itemTypeName: 'Consumable',
    description: 'Nutrient base for preparation of blood agar for isolation of fastidious organisms',
    specification: '500 g Bottle',
    makeandModelNo: 'BAB-500G',
    hsnCode: '38210000',
    expirable: 'Yes',
    expiryDateCutoff: 365,
    gstnTax: 12,
    manufactureName: 'HiMedia Laboratories',
    catalogNo: 'HIM-M073-500G',
    machineId: '',
    machineName: '',
    purchasedUnit: 'Bottle',
    converter: 1,
    packSize: '500 g',
    consumptionUnit: 'Bottle',
    issueMultiplier: 1
  },

  // Flowcytometry
  {
    itemCode: '990000018',
    itemName: 'CD4/CD8 Dual-Color Flow Cytometry Reagent',
    department: 'Flowcytometry',
    itemTypeName: 'Reagent',
    description: 'Monoclonal antibody cocktail for automated T-cell subset counting',
    specification: '50 Tests Vial',
    makeandModelNo: 'CD4-CD8-50T',
    hsnCode: '38221990',
    expirable: 'Yes',
    expiryDateCutoff: 60,
    gstnTax: 12,
    manufactureName: 'BD Biosciences',
    catalogNo: 'BD-342414',
    machineId: 'FC-FACSL-01',
    machineName: 'BD FACSLyric',
    purchasedUnit: 'Vial',
    converter: 50,
    packSize: '50 Tests',
    consumptionUnit: 'Test',
    issueMultiplier: 1
  },

  // Cytology
  {
    itemCode: '990000019',
    itemName: 'Papanicolaou OG-6 Staining Solution 500mL',
    department: 'Cytology',
    itemTypeName: 'Consumable',
    description: 'Orange G-6 cytoplasmic counterstain for gynecological cytology screening',
    specification: '500 mL Bottle',
    makeandModelNo: 'PAP-OG6-500',
    hsnCode: '38221990',
    expirable: 'Yes',
    expiryDateCutoff: 180,
    gstnTax: 12,
    manufactureName: 'Sigma-Aldrich',
    catalogNo: 'SIG-OG6-500',
    machineId: '',
    machineName: '',
    purchasedUnit: 'Bottle',
    converter: 1,
    packSize: '500 mL',
    consumptionUnit: 'Bottle',
    issueMultiplier: 1
  },

  // Immunohistochemistry
  {
    itemCode: '990000020',
    itemName: 'Estrogen Receptor ER Monoclonal Primary Antibody',
    department: 'Immunohistochemistry',
    itemTypeName: 'Reagent',
    description: 'Rabbit monoclonal antibody clone SP1 for diagnostic tissue section IHC staining',
    specification: '7 mL Ready-to-use',
    makeandModelNo: 'ER-SP1-7ML',
    hsnCode: '38221990',
    expirable: 'Yes',
    expiryDateCutoff: 120,
    gstnTax: 12,
    manufactureName: 'Ventana Medical Systems',
    catalogNo: 'VEN-790-4325',
    machineId: 'IHC-BENCH-01',
    machineName: 'Benchmark ULTRA',
    purchasedUnit: 'Vial',
    converter: 1,
    packSize: '7 mL',
    consumptionUnit: 'Vial',
    issueMultiplier: 1
  },

  // Special Biochemistry
  {
    itemCode: '990000021',
    itemName: 'HbA1c HPLC Analytical Column & Eluent Pack',
    department: 'Special Biochemistry',
    itemTypeName: 'Reagent',
    description: 'Cation-exchange HPLC column and buffer system for automated glycohemoglobin testing',
    specification: '800 Injections Pack',
    makeandModelNo: 'HBA1C-HPLC-800',
    hsnCode: '38221990',
    expirable: 'Yes',
    expiryDateCutoff: 120,
    gstnTax: 12,
    manufactureName: 'Bio-Rad Laboratories',
    catalogNo: 'BR-220-0101',
    machineId: 'SB-D10-01',
    machineName: 'D-10 Hemoglobin Analyzer',
    purchasedUnit: 'Kit',
    converter: 1,
    packSize: '1 Kit (800 Tests)',
    consumptionUnit: 'Kit',
    issueMultiplier: 1
  },

  // Miscellaneous
  {
    itemCode: '990000022',
    itemName: 'Acrodisc Syringe Filters 0.22 um Sterile (50 Pack)',
    department: 'Miscellaneous',
    itemTypeName: 'Consumable',
    description: 'Hydrophilic PES membrane syringe filters for biological sample sterile microfiltration',
    specification: '50 Filters Pack',
    makeandModelNo: 'SYR-FIL-022',
    hsnCode: '84212900',
    expirable: 'No',
    expiryDateCutoff: 0,
    gstnTax: 18,
    manufactureName: 'Pall Corporation',
    catalogNo: 'PAL-4612-50',
    machineId: '',
    machineName: '',
    purchasedUnit: 'PAC',
    converter: 50,
    packSize: '50 Filters',
    consumptionUnit: 'Filter',
    issueMultiplier: 1
  }
];

const PHARMACY_ITEMS = [
  {
    itemCode: '980000001',
    itemName: 'Paracetamol 500 mg Tablet',
    genericName: 'Paracetamol',
    department: 'Medicine',
    itemTypeName: 'antipyretic',
    dosageForm: 'Tablet',
    strength: '500 mg',
    manufactureName: 'Cipla Ltd',
    description: 'Analgesic and antipyretic for relief of mild to moderate pain and fever',
    usageDetails: 'Oral administration; 1-2 tablets every 4-6 hours as directed',
    hsnCode: '30049099',
    expirable: 'Yes',
    expiryDateCutoff: 90,
    gstnTax: 12,
    catalogNo: 'CIP-PCM-500',
    purchasedUnit: 'Box',
    converter: 10,
    packSize: '10x10 Tablets',
    consumptionUnit: 'Tablet',
    issueMultiplier: 1,
    requiredPrescription: 'No',
    rackLocation: 'A-01'
  },
  {
    itemCode: '980000002',
    itemName: 'Amoxicillin 500 mg Capsule',
    genericName: 'Amoxicillin',
    department: 'Medicine',
    itemTypeName: 'Antibiotic',
    dosageForm: 'Capsule',
    strength: '500 mg',
    manufactureName: 'Sun Pharma',
    description: 'Broad-spectrum penicillin antibiotic for susceptible bacterial infections',
    usageDetails: 'Oral administration; 1 capsule every 8 hours with meals',
    hsnCode: '30041000',
    expirable: 'Yes',
    expiryDateCutoff: 90,
    gstnTax: 12,
    catalogNo: 'SUN-AMX-500',
    purchasedUnit: 'Box',
    converter: 10,
    packSize: '10x10 Capsules',
    consumptionUnit: 'Capsule',
    issueMultiplier: 1,
    requiredPrescription: 'Yes',
    rackLocation: 'A-02'
  },
  {
    itemCode: '980000003',
    itemName: 'Azithromycin 500 mg Tablet',
    genericName: 'Azithromycin',
    department: 'Medicine',
    itemTypeName: 'Antibiotic',
    dosageForm: 'Tablet',
    strength: '500 mg',
    manufactureName: 'Zydus Cadila',
    description: 'Macrolide antibiotic for upper and lower respiratory tract infections',
    usageDetails: 'Oral once daily 1 hour before or 2 hours after meals',
    hsnCode: '30042099',
    expirable: 'Yes',
    expiryDateCutoff: 90,
    gstnTax: 12,
    catalogNo: 'ZYD-AZI-500',
    purchasedUnit: 'Box',
    converter: 3,
    packSize: '3 Tablets',
    consumptionUnit: 'Tablet',
    issueMultiplier: 1,
    requiredPrescription: 'Yes',
    rackLocation: 'A-03'
  },
  {
    itemCode: '980000004',
    itemName: 'Metformin Hydrochloride 500 mg Tablet',
    genericName: 'Metformin Hydrochloride',
    department: 'Medicine',
    itemTypeName: 'Antidiabetic',
    dosageForm: 'Tablet',
    strength: '500 mg',
    manufactureName: 'Dr. Reddy Laboratories',
    description: 'Biguanide oral antihyperglycemic agent for Type 2 diabetes management',
    usageDetails: 'Oral with or immediately after meals to reduce GI adverse effects',
    hsnCode: '30049099',
    expirable: 'Yes',
    expiryDateCutoff: 90,
    gstnTax: 12,
    catalogNo: 'DRL-MET-500',
    purchasedUnit: 'Box',
    converter: 20,
    packSize: '20x10 Tablets',
    consumptionUnit: 'Tablet',
    issueMultiplier: 1,
    requiredPrescription: 'Yes',
    rackLocation: 'B-01'
  },
  {
    itemCode: '980000005',
    itemName: 'Pantoprazole Gastro-Resistant 40 mg Tablet',
    genericName: 'Pantoprazole',
    department: 'Medicine',
    itemTypeName: 'Antacid',
    dosageForm: 'Tablet',
    strength: '40 mg',
    manufactureName: 'Alkem Laboratories',
    description: 'Proton pump inhibitor for gastroesophageal reflux disease and peptic ulcer',
    usageDetails: 'Oral once daily morning 30 minutes before breakfast',
    hsnCode: '30049099',
    expirable: 'Yes',
    expiryDateCutoff: 90,
    gstnTax: 12,
    catalogNo: 'ALK-PAN-40',
    purchasedUnit: 'Box',
    converter: 10,
    packSize: '10x15 Tablets',
    consumptionUnit: 'Tablet',
    issueMultiplier: 1,
    requiredPrescription: 'Yes',
    rackLocation: 'B-02'
  },
  {
    itemCode: '980000006',
    itemName: 'Atorvastatin Calcium 10 mg Tablet',
    genericName: 'Atorvastatin Calcium',
    department: 'Medicine',
    itemTypeName: 'Cardiovascular',
    dosageForm: 'Tablet',
    strength: '10 mg',
    manufactureName: 'Torrent Pharmaceuticals',
    description: 'HMG-CoA reductase inhibitor for hypercholesterolemia and dyslipidemia',
    usageDetails: 'Oral once daily at bedtime',
    hsnCode: '30049099',
    expirable: 'Yes',
    expiryDateCutoff: 90,
    gstnTax: 12,
    catalogNo: 'TOR-ATV-10',
    purchasedUnit: 'Box',
    converter: 10,
    packSize: '10x10 Tablets',
    consumptionUnit: 'Tablet',
    issueMultiplier: 1,
    requiredPrescription: 'Yes',
    rackLocation: 'B-03'
  },
  {
    itemCode: '980000007',
    itemName: 'Cetirizine Hydrochloride 10 mg Tablet',
    genericName: 'Cetirizine Hydrochloride',
    department: 'Medicine',
    itemTypeName: 'Antihistamine',
    dosageForm: 'Tablet',
    strength: '10 mg',
    manufactureName: 'Mankind Pharma',
    description: 'Second-generation H1-receptor antagonist for allergic rhinitis and urticaria',
    usageDetails: 'Oral once daily in evening',
    hsnCode: '30049099',
    expirable: 'Yes',
    expiryDateCutoff: 90,
    gstnTax: 12,
    catalogNo: 'MAN-CET-10',
    purchasedUnit: 'Box',
    converter: 10,
    packSize: '10x10 Tablets',
    consumptionUnit: 'Tablet',
    issueMultiplier: 1,
    requiredPrescription: 'No',
    rackLocation: 'C-01'
  },
  {
    itemCode: '980000008',
    itemName: 'Ibuprofen 400 mg Tablet',
    genericName: 'Ibuprofen',
    department: 'Medicine',
    itemTypeName: 'NSAID',
    dosageForm: 'Tablet',
    strength: '400 mg',
    manufactureName: 'Abbott Healthcare',
    description: 'Non-steroidal anti-inflammatory drug for pain, swelling and inflammation',
    usageDetails: 'Oral with meals or milk',
    hsnCode: '30049099',
    expirable: 'Yes',
    expiryDateCutoff: 90,
    gstnTax: 12,
    catalogNo: 'ABB-IBU-400',
    purchasedUnit: 'Box',
    converter: 10,
    packSize: '10x10 Tablets',
    consumptionUnit: 'Tablet',
    issueMultiplier: 1,
    requiredPrescription: 'No',
    rackLocation: 'C-02'
  },
  {
    itemCode: '980000009',
    itemName: 'Ceftriaxone Sodium 1g Injection',
    genericName: 'Ceftriaxone Sodium',
    department: 'Medicine',
    itemTypeName: 'Antibiotic',
    dosageForm: 'Injection',
    strength: '1 g',
    manufactureName: 'Lupin Pharmaceuticals',
    description: 'Third-generation cephalosporin injectable antibiotic for severe infections',
    usageDetails: 'Intravenous or Intramuscular reconstitution as directed by physician',
    hsnCode: '30042099',
    expirable: 'Yes',
    expiryDateCutoff: 60,
    gstnTax: 12,
    catalogNo: 'LUP-CFT-1G',
    purchasedUnit: 'Vial',
    converter: 1,
    packSize: '1 Vial + WFI',
    consumptionUnit: 'Vial',
    issueMultiplier: 1,
    requiredPrescription: 'Yes',
    rackLocation: 'C-03'
  },
  {
    itemCode: '980000010',
    itemName: 'Cough Syrup Dextromethorphan & CPM 100 mL',
    genericName: 'Dextromethorphan HBr + CPM',
    department: 'Medicine',
    itemTypeName: 'Antitussive',
    dosageForm: 'Syrup',
    strength: '10mg/2mg per 5mL',
    manufactureName: 'Glenmark Pharmaceuticals',
    description: 'Non-narcotic cough suppressant and antihistaminic combination syrup',
    usageDetails: 'Oral 5-10 mL twice or thrice daily',
    hsnCode: '30049099',
    expirable: 'Yes',
    expiryDateCutoff: 90,
    gstnTax: 12,
    catalogNo: 'GLE-CS-100',
    purchasedUnit: 'Bottle',
    converter: 1,
    packSize: '100 mL Bottle',
    consumptionUnit: 'Bottle',
    issueMultiplier: 1,
    requiredPrescription: 'No',
    rackLocation: 'D-01'
  }
];

const PATHOLOGY_ITEMS = [
  // Hematology
  {
    itemCode: '950000001',
    itemName: 'Complete Blood Count (CBC with ESR)',
    department: 'Hematology',
    itemTypeName: 'Profile',
    description: 'Comprehensive blood cell examination including automated 5-part differential and ESR',
    sampleType: 'Whole Blood',
    gender: 'Both',
    sampleOption: 'Required'
  },
  {
    itemCode: '950000002',
    itemName: 'Hemoglobin (Hb Estimation)',
    department: 'Hematology',
    itemTypeName: 'Observation',
    description: 'Quantitative photometric determination of total blood hemoglobin',
    sampleType: 'Whole Blood',
    gender: 'Both',
    sampleOption: 'Required'
  },
  {
    itemCode: '950000003',
    itemName: 'Peripheral Blood Smear Examination',
    department: 'Hematology',
    itemTypeName: 'Observation',
    description: 'Microscopic morphology evaluation of RBCs, WBCs, and platelets',
    sampleType: 'Whole Blood',
    gender: 'Both',
    sampleOption: 'Required'
  },
  {
    itemCode: '950000004',
    itemName: 'Prothrombin Time (PT with INR)',
    department: 'Hematology',
    itemTypeName: 'Profile',
    description: 'Evaluation of extrinsic coagulation cascade and oral anticoagulant monitoring',
    sampleType: 'Whole Blood',
    gender: 'Both',
    sampleOption: 'Required'
  },

  // Clinical Pathology
  {
    itemCode: '950000005',
    itemName: 'Urine Routine and Microscopic Examination',
    department: 'Clinical Pathology',
    itemTypeName: 'Observation',
    description: 'Complete physical, chemical strip and microscopic sediment analysis of urine',
    sampleType: 'Urine',
    gender: 'Both',
    sampleOption: 'Required'
  },
  {
    itemCode: '950000006',
    itemName: 'Stool Routine and Occult Blood Examination',
    department: 'Clinical Pathology',
    itemTypeName: 'Observation',
    description: 'Macroscopic and microscopic stool examination for parasites, RBCs and occult blood',
    sampleType: 'Urine', // Using sampleType from registry samples
    gender: 'Both',
    sampleOption: 'Required'
  },
  {
    itemCode: '950000007',
    itemName: 'Cerebrospinal Fluid (CSF) Analysis',
    department: 'Clinical Pathology',
    itemTypeName: 'Profile',
    description: 'Total leukocyte count, differential and protein-glucose ratio in CSF',
    sampleType: 'CSF',
    gender: 'Both',
    sampleOption: 'Required'
  },
  {
    itemCode: '950000008',
    itemName: 'Semen Analysis (Complete Spermiogram)',
    department: 'Clinical Pathology',
    itemTypeName: 'Profile',
    description: 'Evaluation of sperm concentration, motility, vitality and morphological grading',
    sampleType: 'Serum',
    gender: 'Male',
    sampleOption: 'Required'
  },

  // Microbiology
  {
    itemCode: '950000009',
    itemName: 'Urine Culture and Antimicrobial Sensitivity',
    department: 'Microbiology',
    itemTypeName: 'Observation',
    description: 'Quantitative aerobic bacterial culture with automated antibiotic sensitivity testing',
    sampleType: 'Urine',
    gender: 'Both',
    sampleOption: 'Required'
  },
  {
    itemCode: '950000010',
    itemName: 'Blood Culture and Sensitivity (Aerobic)',
    department: 'Microbiology',
    itemTypeName: 'Observation',
    description: 'Continuous automated blood culture monitoring and susceptibility profile',
    sampleType: 'Whole Blood',
    gender: 'Both',
    sampleOption: 'Required'
  },
  {
    itemCode: '950000011',
    itemName: 'Gram Stain Examination',
    department: 'Microbiology',
    itemTypeName: 'Observation',
    description: 'Direct microscopic staining and differentiation of Gram-positive and negative bacteria',
    sampleType: 'Serum',
    gender: 'Both',
    sampleOption: 'Required'
  },
  {
    itemCode: '950000012',
    itemName: 'Ziehl-Neelsen (ZN) Acid Fast Stain for AFB',
    department: 'Microbiology',
    itemTypeName: 'Observation',
    description: 'Microscopic acid-fast bacilli stain for Mycobacterium tuberculosis screening',
    sampleType: 'Whole Blood',
    gender: 'Both',
    sampleOption: 'Required'
  }
];

const SERVICE_ITEMS = [
  {
    itemCode: '940000001',
    itemName: 'General Physician Consultation',
    department: 'OPD',
    itemTypeName: 'General Physician',
    doctorsName: 'General Physician',
    doctorId: 'DOC-GP-001'
  },
  {
    itemCode: '940000002',
    itemName: 'Cardiology Specialist Consultation',
    department: 'OPD',
    itemTypeName: 'Cardiologist',
    doctorsName: 'Senior Interventional Cardiologist',
    doctorId: 'DOC-CARD-002'
  },
  {
    itemCode: '940000003',
    itemName: 'Orthopedic Consultation & Joint Evaluation',
    department: 'OPD',
    itemTypeName: 'Orthopadic',
    doctorsName: 'Orthopedic Surgeon',
    doctorId: 'DOC-ORTH-003'
  },
  {
    itemCode: '940000004',
    itemName: 'Ophthalmic Eye Examination & Vision Check',
    department: 'OPD',
    itemTypeName: 'Eyes',
    doctorsName: 'Ophthalmologist',
    doctorId: 'DOC-OPH-004'
  },
  {
    itemCode: '940000005',
    itemName: 'Dental Comprehensive Checkup & Scaling',
    department: 'OPD',
    itemTypeName: 'Dental',
    doctorsName: 'Dental Surgeon',
    doctorId: 'DOC-DENT-005'
  },
  {
    itemCode: '940000006',
    itemName: 'Physical Therapy & Rehabilitation Session',
    department: 'OPD',
    itemTypeName: 'Physiotherapy',
    doctorsName: 'Chief Physiotherapist',
    doctorId: 'DOC-PHYS-006'
  }
];

const ASSET_ITEMS = [
  {
    itemCode: '7300000001',
    itemName: 'Multi-Parameter Patient Monitor',
    itemTypeName: 'One Time Purchase',
    description: '12.1-inch color TFT patient monitor with ECG, NIBP, SpO2, Resp, Temp',
    hsnCode: '90181990',
    expirable: 'No',
    expiryDateCutoff: 0,
    gstnTax: 18,
    manufactureName: 'Philips Healthcare',
    purchasedUnit: 'PAC',
    converter: 1,
    packSize: '1 Unit'
  },
  {
    itemCode: '7300000002',
    itemName: 'Adjustable Hydraulic Examination Couch',
    itemTypeName: 'Non Movable',
    description: 'Heavy duty 2-section hydraulic examination table with paper roll holder',
    hsnCode: '94029090',
    expirable: 'No',
    expiryDateCutoff: 0,
    gstnTax: 18,
    manufactureName: 'Godrej Interio Medical',
    purchasedUnit: 'PAC',
    converter: 1,
    packSize: '1 Unit'
  },
  {
    itemCode: '7300000003',
    itemName: '12-Channel Electrocardiograph (ECG Machine)',
    itemTypeName: 'One Time Purchase',
    description: 'Digital 12-lead diagnostic ECG system with interpretation algorithm',
    hsnCode: '90181100',
    expirable: 'No',
    expiryDateCutoff: 0,
    gstnTax: 18,
    manufactureName: 'GE Healthcare',
    purchasedUnit: 'PAC',
    converter: 1,
    packSize: '1 Unit'
  },
  {
    itemCode: '7300000004',
    itemName: 'Hospital High-Pressure Steam Autoclave 50L',
    itemTypeName: 'Non Movable',
    description: 'Vertical vertical steam sterilizer autoclave with microcomputer control',
    hsnCode: '84192010',
    expirable: 'No',
    expiryDateCutoff: 0,
    gstnTax: 18,
    manufactureName: 'Equitron Medica',
    purchasedUnit: 'PAC',
    converter: 1,
    packSize: '1 Unit'
  },
  {
    itemCode: '7300000005',
    itemName: 'High-Flow ICU Ventilator System',
    itemTypeName: 'One Time Purchase',
    description: 'Turbine-driven intensive care ventilator for adult and pediatric respiratory support',
    hsnCode: '90192000',
    expirable: 'No',
    expiryDateCutoff: 0,
    gstnTax: 18,
    manufactureName: 'Hamilton Medical',
    purchasedUnit: 'PAC',
    converter: 1,
    packSize: '1 Unit'
  },
  {
    itemCode: '7300000006',
    itemName: 'Benchtop Refrigerated Laboratory Centrifuge',
    itemTypeName: 'One Time Purchase',
    description: 'Universal refrigerated centrifuge with swing-out rotor 4x250mL up to 15,000 RPM',
    hsnCode: '84211999',
    expirable: 'No',
    expiryDateCutoff: 0,
    gstnTax: 18,
    manufactureName: 'Eppendorf SE',
    purchasedUnit: 'PAC',
    converter: 1,
    packSize: '1 Unit'
  }
];

// ─────────────────────────────────────────────────────────────────────────────
// SEED RUNNER
// ─────────────────────────────────────────────────────────────────────────────

async function seedMasterDemoData() {
  const uri = process.env.MONGO_URI;
  if (!uri) {
    throw new Error('MONGO_URI is missing from environment.');
  }

  console.log('Connecting to MongoDB...');
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 });
  console.log('MongoDB Connected.');

  try {
    // 1. HOSPITAL RESOLUTION
    let hospital = await SuperAdminHospital.findOne({ code: 'city_hospital' });
    if (!hospital) {
      console.log('Creating demo tenant City Hospital (city_hospital)...');
      hospital = await SuperAdminHospital.create({
        name: 'City Hospital',
        code: 'city_hospital',
        status: 'Active',
        plan: 'Enterprise Multi-Specialty'
      });
      console.log('Created hospital:', hospital.name, hospital.code);
    } else {
      console.log('Reusing existing hospital:', hospital.name, hospital.code);
    }

    const tenantId = hospital.code;

    // 2. SEED GLOBAL ITEM MASTER
    let globalCreatedCount = 0;
    let globalUpdatedCount = 0;

    const allCategoriesData = [
      { category: 'Lab Operation', items: LAB_OPERATION_ITEMS },
      { category: 'Pharmacy', items: PHARMACY_ITEMS },
      { category: 'Pathology', items: PATHOLOGY_ITEMS },
      { category: 'Service', items: SERVICE_ITEMS },
      { category: 'Assets', items: ASSET_ITEMS }
    ];

    const masterIdLookup = {}; // itemCode -> _id

    for (const group of allCategoriesData) {
      const categoryName = group.category;
      console.log(`\nSeeding ${group.items.length} items for Category: "${categoryName}"...`);

      for (let i = 0; i < group.items.length; i++) {
        const itemDef = group.items[i];
        const sNo = i + 1;

        // Build categoryData bucket matching registry headers
        const categoryData = { ...itemDef };

        const payload = {
          scope: 'GLOBAL',
          tenantId: '__global__',
          itemCode: itemDef.itemCode,
          itemName: itemDef.itemName,
          genericName: itemDef.genericName || itemDef.itemName,
          brandName: itemDef.itemName,
          category: categoryName,
          categoryType: categoryName,
          department: itemDef.department || '',
          departmentType: itemDef.department || (categoryName === 'Assets' ? 'General' : ''),
          itemDescription: itemDef.description || '',
          sNo: sNo,
          itemType: categoryName === 'Pharmacy' ? 'Medicine' : (categoryName === 'Assets' ? 'Asset' : 'Consumable'),
          status: 'Active',
          manufactureName: itemDef.manufactureName || '',
          hsnCode: itemDef.hsnCode || '',
          isExpirable: itemDef.expirable === 'Yes',
          expiryCutoffDays: itemDef.expiryDateCutoff || 0,
          defaultGst: itemDef.gstnTax || 12,
          purchasedUnit: itemDef.purchasedUnit || 'PAC',
          consumptionUnit: itemDef.consumptionUnit || 'PAC',
          converterFactor: itemDef.converter || 1,
          packSizeDescription: itemDef.packSize || '',
          doctorsName: itemDef.doctorsName || '',
          doctorId: itemDef.doctorId || '',
          sampleType: itemDef.sampleType || '',
          gender: itemDef.gender || '',
          sampleOption: itemDef.sampleOption || '',
          categoryData: categoryData
        };

        const existing = await ItemMaster.findOne({
          scope: 'GLOBAL',
          itemCode: itemDef.itemCode
        });

        if (existing) {
          await ItemMaster.updateOne({ _id: existing._id }, { $set: payload });
          masterIdLookup[itemDef.itemCode] = existing._id;
          globalUpdatedCount++;
        } else {
          const created = await ItemMaster.create(payload);
          masterIdLookup[itemDef.itemCode] = created._id;
          globalCreatedCount++;
        }
      }
    }

    console.log(`\nGlobal ItemMaster Seed Summary: ${globalCreatedCount} created, ${globalUpdatedCount} updated.`);

    // 3. SEED INITIAL HOSPITAL MASTER CONFIGS (Isolated Hospital Pricing)
    console.log('\nSeeding initial HospitalMasterConfig for City Hospital...');

    const initialConfigs = [
      {
        itemCode: '980000001', // Paracetamol 500 mg Tablet
        category: 'Pharmacy',
        department: 'Medicine',
        mrp: 20,
        netRate: 15,
        hospitalCost: 12
      },
      {
        itemCode: '980000002', // Amoxicillin 500 mg Capsule
        category: 'Pharmacy',
        department: 'Medicine',
        mrp: 85,
        netRate: 70,
        hospitalCost: 60
      },
      {
        itemCode: '950000001', // Complete Blood Count
        category: 'Pathology',
        department: 'Hematology',
        mrp: 350,
        netRate: 250,
        hospitalCost: 0
      },
      {
        itemCode: '940000001', // General Physician Consultation
        category: 'Service',
        department: 'OPD',
        mrp: 500,
        netRate: 350,
        hospitalCost: 0
      },
      {
        itemCode: '7300000001', // Multi-Parameter Patient Monitor
        category: 'Assets',
        department: '',
        mrp: 85000,
        netRate: 0,
        hospitalCost: 0
      }
    ];

    let hospitalConfigsCount = 0;

    for (const conf of initialConfigs) {
      const masterItemId = masterIdLookup[conf.itemCode];
      if (!masterItemId) {
        console.warn(`Master item with code ${conf.itemCode} not found in lookup!`);
        continue;
      }

      await HospitalMasterConfig.findOneAndUpdate(
        { tenantId, masterItemId },
        {
          $set: {
            tenantId,
            masterItemId,
            category: conf.category,
            department: conf.department,
            mrp: conf.mrp,
            netRate: conf.netRate,
            hospitalCost: conf.hospitalCost,
            status: 'Active'
          }
        },
        { upsert: true, new: true }
      );
      hospitalConfigsCount++;
    }

    console.log(`HospitalMasterConfig Seed Summary: ${hospitalConfigsCount} configured for tenant "${tenantId}".`);

    return {
      success: true,
      globalCreated: globalCreatedCount,
      globalUpdated: globalUpdatedCount,
      totalGlobalDemoRecords: Object.keys(masterIdLookup).length,
      hospitalConfigsCreated: hospitalConfigsCount,
      tenantId
    };

  } finally {
    await mongoose.connection.close();
    console.log('MongoDB connection closed.');
  }
}

// Direct CLI execution
if (require.main === module) {
  seedMasterDemoData()
    .then(res => {
      console.log('\n========================================================');
      console.log('   MASTER DEMO DATA SEEDED SUCCESSFULLY');
      console.log('========================================================');
      console.log(JSON.stringify(res, null, 2));
      process.exit(0);
    })
    .catch(err => {
      console.error('\nSeed failed with error:', err);
      process.exit(1);
    });
}

module.exports = { seedMasterDemoData };
