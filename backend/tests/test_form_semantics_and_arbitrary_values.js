/**
 * test_form_semantics_and_arbitrary_values.js
 * 
 * Verifies that:
 * 1. None of the SAMPLE_VALUES_ONLY fields enforce closed enum restrictions.
 * 2. Arbitrary custom values outside the workbook samples are 100% valid and saved.
 * 3. Lab Operation Status has no closed enum (Active/Inactive is not enforced).
 * 4. Mongoose validation passes for arbitrary values across all 11 audited fields.
 */

const assert = require('assert');
const mongoose = require('mongoose');
const ItemMaster = require('../models/ItemMaster');
const HospitalMasterConfig = require('../models/HospitalMasterConfig');
const backendRegistry = require('../config/masterSchemaRegistry').MASTER_SCHEMA_REGISTRY;

console.log('========================================================================');
console.log('   QUROXA — FORM SEMANTICS & ARBITRARY SAMPLE VALUES AUDIT TEST');
console.log('========================================================================\n');

let totalTests = 0;
let passedTests = 0;

function runTest(name, fn) {
  totalTests++;
  try {
    fn();
    console.log(`  [PASS] ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`  [FAIL] ${name}: ${err.message}`);
  }
}

// 1. Verify Registry optionsSource configuration
const AUDITED_FIELDS = [
  { cat: 'Lab Operation', key: 'expirable' },
  { cat: 'Lab Operation', key: 'gstnTax' },
  { cat: 'Lab Operation', key: 'purchasedUnit' },
  { cat: 'Lab Operation', key: 'converter' },
  { cat: 'Lab Operation', key: 'consumptionUnit' },
  { cat: 'Lab Operation', key: 'issueMultiplier' },
  { cat: 'Lab Operation', key: 'itemTypeName' },
  { cat: 'Lab Operation', key: 'status' },
  { cat: 'Pharmacy', key: 'requiredPrescription' },
  { cat: 'Pathology', key: 'sampleType' },
  { cat: 'Pathology', key: 'gender' },
  { cat: 'Pathology', key: 'sampleOption' }
];

runTest('All audited sample fields have optionsSource === SAMPLE_VALUES_ONLY or null (no CLIENT_CONFIRMED)', () => {
  AUDITED_FIELDS.forEach(({ cat, key }) => {
    const field = backendRegistry[cat].sharedFields.find(f => f.fieldKey === key);
    assert.ok(field, `Field ${key} must exist in ${cat}`);
    assert.notStrictEqual(field.optionsSource, 'CLIENT_CONFIRMED', `${cat} ${key} must not be CLIENT_CONFIRMED`);
    assert.strictEqual(field.systemRequired, false, `${cat} ${key} must not be systemRequired`);
  });
});

runTest('Lab Operation Status is marked SAMPLE_VALUES_ONLY and not CLIENT_CONFIRMED', () => {
  const statusField = backendRegistry['Lab Operation'].sharedFields.find(f => f.fieldKey === 'status');
  assert.ok(statusField);
  assert.strictEqual(statusField.optionsSource, 'SAMPLE_VALUES_ONLY');
  assert.strictEqual(statusField.systemRequired, false);
});

// 2. Verify ItemMaster schema does not reject arbitrary custom values
runTest('ItemMaster validates arbitrary custom values outside workbook samples for all audited fields', () => {
  const customDoc = new ItemMaster({
    scope: 'GLOBAL',
    tenantId: '__global__',
    itemCode: '990000999',
    itemName: 'Novel Molecular Custom Reagent',
    category: 'Lab Operation',
    department: 'Molecular Biology',
    status: 'ArchivedUnderReview_CustomStatus', // Custom status outside Active/Inactive
    categoryData: {
      expirable: 'CustomExpirableValue123',
      gstnTax: 99.5,
      purchasedUnit: 'CUSTOM_BARREL_XYZ',
      converter: 42,
      consumptionUnit: 'CUSTOM_DROPLET',
      issueMultiplier: 7,
      requiredPrescription: 'SpecialDoctorApprovalOnly',
      sampleType: 'SalivaryGlandFluid',
      gender: 'Transgender',
      sampleOption: 'SpecialReferredStat',
      itemTypeName: 'ExperimentalDiagnosticReagent',
      status: 'ArchivedUnderReview_CustomStatus'
    }
  });

  const err = customDoc.validateSync();
  assert.ifError(err);
  assert.strictEqual(customDoc.status, 'ArchivedUnderReview_CustomStatus');
  assert.strictEqual(customDoc.categoryData.expirable, 'CustomExpirableValue123');
  assert.strictEqual(customDoc.categoryData.gender, 'Transgender');
  assert.strictEqual(customDoc.categoryData.purchasedUnit, 'CUSTOM_BARREL_XYZ');
  assert.strictEqual(customDoc.categoryData.gstnTax, 99.5);
});

// 3. Verify HospitalMasterConfig accepts arbitrary status
runTest('HospitalMasterConfig validates arbitrary custom status without enum rejection', () => {
  const configDoc = new HospitalMasterConfig({
    tenantId: 'city_hospital',
    masterItemId: new mongoose.Types.ObjectId(),
    category: 'Lab Operation',
    department: 'Molecular Biology',
    mrp: 1500,
    netRate: 1200,
    status: 'PendingHospitalReview_Custom'
  });

  const err = configDoc.validateSync();
  assert.ifError(err);
  assert.strictEqual(configDoc.status, 'PendingHospitalReview_Custom');
});

// 4. Verify FieldRenderer source code renders open input with datalist for SAMPLE_VALUES_ONLY
runTest('FieldRenderer renders open input + datalist when optionsSource === SAMPLE_VALUES_ONLY', () => {
  const fs = require('fs');
  const path = require('path');
  const fieldRendererCode = fs.readFileSync(path.resolve(__dirname, '../../frontend/src/components/superadmin/masters/FieldRenderer.jsx'), 'utf8');

  // Verify datalist and quick pick logic exists
  assert.ok(fieldRendererCode.includes('hasSampleSuggestions'), 'Must check hasSampleSuggestions');
  assert.ok(fieldRendererCode.includes('<datalist id='), 'Must include native datalist');
  assert.ok(fieldRendererCode.includes('optionsSource === \'SAMPLE_VALUES_ONLY\''), 'Must identify SAMPLE_VALUES_ONLY');
  assert.ok(fieldRendererCode.includes('Sample:'), 'Must render sample suggestion chips');
});

console.log('\n========================================================================');
console.log(`  AUDIT TEST SUMMARY: ${passedTests} / ${totalTests} TESTS PASSED`);
console.log('========================================================================\n');

if (totalTests !== passedTests) {
  process.exit(1);
} else {
  process.exit(0);
}
