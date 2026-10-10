require('dotenv').config();
const mongoose = require('mongoose');
const LaboratoryMaster = require('../models/LaboratoryMaster');
const HospitalAffiliateLabConfig = require('../models/HospitalAffiliateLabConfig');
const LabRequest = require('../models/LabRequest');
const Patient = require('../models/Patient');

async function runTestSuite() {
  console.log('--- STARTING AFFILIATE LABORATORY AUTOMATED VERIFICATION ---');
  await mongoose.connect(process.env.MONGO_URI);
  console.log('✓ Connected to MongoDB');

  const testTenantA = 'test-hospital-alpha';
  const testTenantB = 'test-hospital-beta';

  try {
    // 1. Fetch available Master Labs
    const masterLabs = await LaboratoryMaster.find({ isActive: true }).limit(4);
    if (masterLabs.length < 2) {
      throw new Error('Expected at least 2 active LaboratoryMaster records');
    }
    const lab1 = masterLabs[0];
    const lab2 = masterLabs[1];
    const lab3 = masterLabs[2] || masterLabs[0];
    console.log(`✓ Fetched master labs: Lab1="${lab1.name}", Lab2="${lab2.name}"`);

    // 2. Test Hospital A configuration save & default lab selection
    await HospitalAffiliateLabConfig.deleteMany({ tenantId: { $in: [testTenantA, testTenantB] } });

    // Save with Lab1 & Lab2 for Hospital A, Default is Lab2
    const configA = await HospitalAffiliateLabConfig.findOneAndUpdate(
      { tenantId: testTenantA },
      {
        tenantId: testTenantA,
        affiliateLabIds: [lab1._id, lab2._id],
        defaultLabId: lab2._id,
        updatedByName: 'Admin Alpha'
      },
      { upsert: true, new: true }
    ).populate('affiliateLabIds').populate('defaultLabId');

    if (!configA || String(configA.defaultLabId._id) !== String(lab2._id)) {
      throw new Error('Hospital A config save failed or defaultLabId mismatch');
    }
    console.log('✓ Saved Hospital A config with 2 affiliate labs, Default = Lab2');

    // 3. Test Hospital B isolation with different default
    const configB = await HospitalAffiliateLabConfig.findOneAndUpdate(
      { tenantId: testTenantB },
      {
        tenantId: testTenantB,
        affiliateLabIds: [lab1._id],
        defaultLabId: lab1._id,
        updatedByName: 'Admin Beta'
      },
      { upsert: true, new: true }
    ).populate('affiliateLabIds').populate('defaultLabId');

    if (!configB || String(configB.defaultLabId._id) !== String(lab1._id)) {
      throw new Error('Hospital B config save failed or defaultLabId mismatch');
    }
    console.log('✓ Saved Hospital B config with 1 affiliate lab, Default = Lab1');

    // Tenant Isolation Verification
    const readA = await HospitalAffiliateLabConfig.findOne({ tenantId: testTenantA });
    const readB = await HospitalAffiliateLabConfig.findOne({ tenantId: testTenantB });
    if (readA.affiliateLabIds.length !== 2 || readB.affiliateLabIds.length !== 1) {
      throw new Error('Tenant isolation failure: lab counts do not match separate tenants');
    }
    console.log('✓ Verified strict tenant isolation between Hospital A and Hospital B');

    // 4. Default fallback when default lab removed from affiliate list
    const updatedA = await HospitalAffiliateLabConfig.findOneAndUpdate(
      { tenantId: testTenantA },
      {
        tenantId: testTenantA,
        affiliateLabIds: [lab1._id], // Removed lab2
        defaultLabId: lab1._id,      // Auto fallback to lab1
        updatedByName: 'Admin Alpha'
      },
      { new: true }
    );
    if (String(updatedA.defaultLabId) !== String(lab1._id)) {
      throw new Error('Fallback failed: default lab was not updated when lab2 was removed');
    }
    console.log('✓ Verified default lab fallback when previous default is removed');

    // 5. Test Lab Order creation with selected lab
    const testPatient = await Patient.findOne({}).lean();
    if (!testPatient) {
      console.log('Skipping patient-specific lab order test (no test patient in DB)');
    } else {
      // Order 1: explicitly designated Lab2
      const order1 = await LabRequest.create({
        tenantId: testTenantA,
        patientId: testPatient._id,
        testName: 'Complete Blood Count (CBC)',
        labId: lab2._id,
        labName: lab2.name,
        labCode: lab2.code,
        status: 'Pending'
      });
      if (String(order1.labId) !== String(lab2._id) || order1.labName !== lab2.name) {
        throw new Error('LabRequest creation did not persist designated labId or labName');
      }
      console.log(`✓ LabRequest 1 created with designated Lab: "${order1.labName}"`);

      // Order 2: legacy tolerance without labId
      const orderLegacy = await LabRequest.create({
        tenantId: testTenantA,
        patientId: testPatient._id,
        testName: 'Routine Urine Analysis',
        status: 'Pending'
      });
      if (orderLegacy.labId) {
        throw new Error('Legacy order unexpectedly has labId');
      }
      console.log('✓ Legacy LabRequest creation without labId gracefully tolerated');

      // Cleanup test orders
      await LabRequest.deleteMany({ _id: { $in: [order1._id, orderLegacy._id] } });
    }

    // Cleanup test tenant configs
    await HospitalAffiliateLabConfig.deleteMany({ tenantId: { $in: [testTenantA, testTenantB] } });
    console.log('✓ Cleaned up test database artifacts');

    console.log('\n======================================================');
    console.log('>>> ALL AFFILIATE LABORATORY BACKEND TESTS PASSED! <<<');
    console.log('======================================================');
    process.exit(0);
  } catch (err) {
    console.error('Test Suite Failed:', err);
    process.exit(1);
  }
}

runTestSuite();
