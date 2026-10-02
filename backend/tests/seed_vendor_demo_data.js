const mongoose = require('mongoose');
require('dotenv').config();

const GlobalVendor = require('../models/GlobalVendor');
const HospitalVendorAssociation = require('../models/HospitalVendorAssociation');
const VendorRequest = require('../models/VendorRequest');
const SuperAdminHospital = require('../models/SuperAdminHospital');

const DEMO_VENDORS = [
  {
    supplierId: '101',
    supplierName: 'Genequest Diagnostics Pvt Ltd',
    supplierCode: 'VND-2026-0001',
    supplierType: 'Capex',
    supplierCategory: 'Authorised Dealer',
    organizationType: 'Private Ltd',
    houseNo: 'Plot No. 42',
    street: 'Okhla Industrial Area Phase-III',
    stateCode: 'Delhi',
    pinCode: '110020',
    landline: '011-45678901',
    emailId: 'info@genequest.in',
    website: 'www.genequest.in',
    primaryContactPerson: 'Rajesh Sharma',
    primaryContactPersonDesignation: 'Regional Sales Director',
    primaryContactPersonMobileNo: '9811234567',
    primaryContactPersonEmailId: 'rajesh.s@genequest.in',
    cinNo: 'U74999DL2015PTC288123',
    panCardNo: 'AAACG1234F',
    nameOnPanCard: 'GENEQUEST DIAGNOSTICS PRIVATE LIMITED',
    activeStatus: 'Yes',
    bank: 'HDFC Bank',
    bankBranch: 'Okhla Phase 3',
    bankAccountsNo: '50200012345678',
    bankIfscCode: 'HDFC0000123',
    bank1City: 'New Delhi',
    bankState: 'Delhi',
    paymentTerms: '30 Days Net',
    deliveryTerms: 'Door Delivery',
    gstNo: '07AAACG1234F1Z5',
    isMsmeRegistration: 'Yes',
    msmeRegistrationNo: 'UDYAM-DL-08-0012345'
  },
  {
    supplierId: '102',
    supplierName: 'Agappe Diagnostics Switzerland Ltd',
    supplierCode: 'VND-2026-0002',
    supplierType: 'Opex',
    supplierCategory: 'Manufacture',
    organizationType: 'Ltd',
    houseNo: 'Building B-4',
    street: 'MIDC Industrial Area, Andheri East',
    stateCode: 'Maharashtra',
    pinCode: '400093',
    landline: '022-67890123',
    emailId: 'orders@agappe.com',
    website: 'www.agappe.com',
    primaryContactPerson: 'Dr. Anita Nair',
    primaryContactPersonDesignation: 'Head of Reagents Supply',
    primaryContactPersonMobileNo: '9820123456',
    primaryContactPersonEmailId: 'anita.nair@agappe.com',
    cinNo: 'U24239MH2002PLC137890',
    panCardNo: 'AABCA5678G',
    nameOnPanCard: 'AGAPPE DIAGNOSTICS LIMITED',
    activeStatus: 'Yes',
    bank: 'State Bank of India',
    bankBranch: 'MIDC Andheri',
    bankAccountsNo: '30123456789',
    bankIfscCode: 'SBIN0001234',
    bank1City: 'Mumbai',
    bankState: 'Maharashtra',
    paymentTerms: '45 Days Net',
    deliveryTerms: 'Cold Chain Delivery',
    gstNo: '27AABCA5678G1Z2',
    isMsmeRegistration: 'No'
  },
  {
    supplierId: '103',
    supplierName: 'Roche Diagnostics India Pvt Ltd',
    supplierCode: 'VND-2026-0003',
    supplierType: 'Capex',
    supplierCategory: 'Authorised Dealer',
    organizationType: 'Private Ltd',
    houseNo: 'Tower 3, 5th Floor',
    street: 'Cyber City, DLF Phase 2',
    stateCode: 'Haryana',
    pinCode: '122002',
    landline: '0124-4561234',
    emailId: 'india.diagnostics@roche.com',
    website: 'www.roche.com',
    primaryContactPerson: 'Vikram Mehta',
    primaryContactPersonDesignation: 'Key Account Manager',
    primaryContactPersonMobileNo: '9899123456',
    primaryContactPersonEmailId: 'vikram.m@roche.com',
    cinNo: 'U33112HR1998PTC034567',
    panCardNo: 'AAACR9012H',
    nameOnPanCard: 'ROCHE DIAGNOSTICS INDIA PRIVATE LIMITED',
    activeStatus: 'Yes',
    bank: 'Citibank N.A.',
    bankBranch: 'Gurugram',
    bankAccountsNo: '0012345678',
    bankIfscCode: 'CITI0000002',
    bank1City: 'Gurugram',
    bankState: 'Haryana',
    paymentTerms: 'Immediate upon delivery',
    deliveryTerms: 'Direct Hospital Dispatch',
    gstNo: '06AAACR9012H1ZQ',
    isMsmeRegistration: 'No'
  },
  {
    supplierId: '104',
    supplierName: 'MedLife Healthcare Supplies',
    supplierCode: 'VND-2026-0004',
    supplierType: 'Opex',
    supplierCategory: 'Trader',
    organizationType: 'Proprietorship',
    houseNo: 'Shop 12-14',
    street: 'Medicine Market, Bhagirath Palace',
    stateCode: 'Delhi',
    pinCode: '110006',
    landline: '011-23861234',
    emailId: 'medlife.supplies@gmail.com',
    website: '',
    primaryContactPerson: 'Suresh Singhal',
    primaryContactPersonDesignation: 'Managing Partner',
    primaryContactPersonMobileNo: '9810987654',
    primaryContactPersonEmailId: 'suresh@medlifesupplies.com',
    panCardNo: 'APGPS1234K',
    nameOnPanCard: 'SURESH SINGHAL',
    activeStatus: 'Yes',
    bank: 'Punjab National Bank',
    bankBranch: 'Chandni Chowk',
    bankAccountsNo: '0123002100054321',
    bankIfscCode: 'PUNB0012300',
    bank1City: 'Delhi',
    bankState: 'Delhi',
    paymentTerms: '15 Days',
    deliveryTerms: 'Same-day Courier',
    gstNo: '07APGPS1234K1ZR',
    isMsmeRegistration: 'Yes',
    msmeRegistrationNo: 'UDYAM-DL-01-0098765'
  },
  {
    supplierId: '105',
    supplierName: 'Biomerieux India Pvt Ltd',
    supplierCode: 'VND-2026-0005',
    supplierType: 'Service',
    supplierCategory: 'Manufacture',
    organizationType: 'Private Ltd',
    houseNo: 'A-32',
    street: 'Mohan Cooperative Industrial Estate',
    stateCode: 'Delhi',
    pinCode: '110044',
    landline: '011-42098800',
    emailId: 'contact@biomerieux.com',
    website: 'www.biomerieux.com',
    primaryContactPerson: 'Kavita Chawla',
    primaryContactPersonDesignation: 'Service Contracts Head',
    primaryContactPersonMobileNo: '9818765432',
    primaryContactPersonEmailId: 'kavita.c@biomerieux.com',
    cinNo: 'U74899DL1999PTC098765',
    panCardNo: 'AAACB3456L',
    nameOnPanCard: 'BIOMERIEUX INDIA PRIVATE LIMITED',
    activeStatus: 'Yes',
    bank: 'Standard Chartered Bank',
    bankBranch: 'Barakhamba Road',
    bankAccountsNo: '52205012345',
    bankIfscCode: 'SCBL0036001',
    bank1City: 'New Delhi',
    bankState: 'Delhi',
    paymentTerms: 'Annual Maintenance Contract',
    deliveryTerms: 'Service Engineer Visit',
    gstNo: '07AAACB3456L1ZM',
    isMsmeRegistration: 'No'
  }
];

async function seedVendors() {
  const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI || 'mongodb://localhost:27017/curoxa';
  await mongoose.connect(mongoUri);
  console.log('Connected to MongoDB:', mongoose.connection.name);

  // Clean demo entries
  for (const v of DEMO_VENDORS) {
    await GlobalVendor.findOneAndDelete({ supplierCode: v.supplierCode });
  }

  const created = await GlobalVendor.insertMany(DEMO_VENDORS);
  console.log(`Successfully seeded ${created.length} Global Vendors`);

  // Find a hospital tenant or use default
  let hospital = await SuperAdminHospital.findOne({ status: 'Active' });
  const tenantId = hospital ? hospital.hospitalId : 'hosp-delhi-01';

  // Associate 2 vendors with this hospital
  await HospitalVendorAssociation.deleteMany({ tenantId });
  await HospitalVendorAssociation.create({
    tenantId,
    vendorId: created[0]._id,
    status: 'ACTIVE',
    notes: 'Primary Capex supplier'
  });
  await HospitalVendorAssociation.create({
    tenantId,
    vendorId: created[1]._id,
    status: 'ACTIVE',
    notes: 'Reagents & consumables supplier'
  });
  console.log(`Associated 2 vendors with hospital "${tenantId}"`);

  // Seed 1 pending vendor request from this hospital
  await VendorRequest.deleteMany({ tenantId });
  await VendorRequest.create({
    requestNo: 'VNR-2026-0001',
    tenantId,
    hospitalName: hospital ? hospital.name : 'Max Healthcare Saket',
    status: 'PENDING',
    submittedBy: 'Dr. Sameer Gupta',
    vendorData: {
      supplierName: 'Abbott Healthcare Solutions Pvt Ltd',
      supplierType: 'Capex',
      supplierCategory: 'Authorised Dealer',
      organizationType: 'Private Ltd',
      gstNo: '27AAACA1234M1Z8',
      panCardNo: 'AAACA1234M',
      primaryContactPerson: 'Manish Verma',
      primaryContactPersonMobileNo: '9920123456',
      emailId: 'manish.v@abbott.com',
      bank: 'HDFC Bank',
      bank1City: 'Mumbai',
      stateCode: 'Maharashtra'
    }
  });

  console.log(`Created 1 pending vendor request from "${tenantId}"`);
  await mongoose.disconnect();
}

seedVendors();
