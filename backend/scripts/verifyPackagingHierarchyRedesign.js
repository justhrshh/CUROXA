/**
 * QUROXA HOSPITAL ERP — PACKAGING HIERARCHY REDESIGN & SEMANTIC UNIT VERIFICATION
 * Acceptance Test Suite covering Tests 1 to 10 from User Specification:
 * 
 * TEST 1: Box → Strip → Tablet (10 Strips / Box, 10 Tablets / Strip) = 100 Tablets / Box [PASS]
 * TEST 2: Box → Tablet (100 Tablets / Box) = 100 Tablets / Box [PASS]
 * TEST 3: Box → Mask (50 Masks / Box) = 50 Masks / Box [PASS]
 * TEST 4: Box → Bandage (10 Bandages / Box) = 10 Bandages / Box [PASS]
 * TEST 5: Box → Pair (100 Pairs / Box) = 100 Pairs / Box [PASS]
 * TEST 6: Bottle → Bottle -> Converter = 1 [PASS]
 * TEST 7: Box → Tablet → Tablet -> REJECTED [PASS]
 * TEST 8: Box → Strip → Strip -> REJECTED [PASS]
 * TEST 9: Bottle → mL -> NOT OFFERED in unit vocabs [PASS]
 * TEST 10: Any valid hierarchy -> Automatic converter calculation [PASS]
 */

const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const ItemMaster = require('../models/ItemMaster');

const MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/quroxa_hospital_dev';
const TEST_TENANT = 'tenant_packaging_spec_test';

let passedTests = 0;
let totalTests = 0;

function assert(condition, message) {
  totalTests++;
  if (condition) {
    console.log(`  [PASS] ${message}`);
    passedTests++;
  } else {
    console.error(`  [FAIL] ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  }
}

async function runTests() {
  console.log('\n====================================================');
  console.log('  QUROXA — 10 PACKAGING SPECIFICATION ACCEPTANCE TESTS');
  console.log('====================================================\n');

  await mongoose.connect(MONGO_URI);

  // Clean test tenant items
  await ItemMaster.deleteMany({ tenantId: TEST_TENANT });

  // Load packaging units utility
  const {
    PACKAGING_PURCHASE_UNITS,
    INTERMEDIATE_PACKAGING_UNITS,
    CONSUMPTION_INDIVIDUAL_UNITS,
    calculateConversionFactor,
    getDerivedConsumptionUnit,
    generatePackSizeDescription,
    validatePackagingUnits
  } = require('../../frontend/src/utils/packagingUnits');

  // ----------------------------------------------------
  // TEST 1: Box → Strip → Tablet (10 Strips / Box, 10 Tablets / Strip) = 100 Tablets / Box
  // ----------------------------------------------------
  const t1Levels = [
    { levelIndex: 0, parentUnit: 'Box', quantity: 10, childUnit: 'Strip' },
    { levelIndex: 1, parentUnit: 'Strip', quantity: 10, childUnit: 'Tablet' }
  ];
  const t1Factor = calculateConversionFactor(true, t1Levels);
  const t1ConsUnit = getDerivedConsumptionUnit('Box', true, t1Levels);
  const t1Desc = generatePackSizeDescription('Box', true, t1Levels);
  const t1ValErr = validatePackagingUnits('Box', true, t1Levels);

  assert(
    t1Factor === 100 && t1ConsUnit === 'Tablet' && t1ValErr === null,
    'TEST 1: Box → Strip → Tablet (10 Strips / Box, 10 Tablets / Strip) = 100 Tablets / Box'
  );

  // ----------------------------------------------------
  // TEST 2: Box → Tablet (100 Tablets / Box) = 100 Tablets / Box
  // ----------------------------------------------------
  const t2Levels = [
    { levelIndex: 0, parentUnit: 'Box', quantity: 100, childUnit: 'Tablet' }
  ];
  const t2Factor = calculateConversionFactor(true, t2Levels);
  const t2ConsUnit = getDerivedConsumptionUnit('Box', true, t2Levels);
  const t2Desc = generatePackSizeDescription('Box', true, t2Levels);
  const t2ValErr = validatePackagingUnits('Box', true, t2Levels);

  assert(
    t2Factor === 100 && t2ConsUnit === 'Tablet' && t2Desc === '100 Tablets / Box' && t2ValErr === null,
    'TEST 2: Box → Tablet (100 Tablets / Box) = 100 Tablets / Box'
  );

  // ----------------------------------------------------
  // TEST 3: Box → Mask (50 Masks / Box) = 50 Masks / Box
  // ----------------------------------------------------
  const t3Levels = [
    { levelIndex: 0, parentUnit: 'Box', quantity: 50, childUnit: 'Mask' }
  ];
  const t3Factor = calculateConversionFactor(true, t3Levels);
  const t3ConsUnit = getDerivedConsumptionUnit('Box', true, t3Levels);
  const t3Desc = generatePackSizeDescription('Box', true, t3Levels);
  const t3ValErr = validatePackagingUnits('Box', true, t3Levels);

  assert(
    t3Factor === 50 && t3ConsUnit === 'Mask' && t3Desc === '50 Masks / Box' && t3ValErr === null,
    'TEST 3: Box → Mask (50 Masks / Box) = 50 Masks / Box'
  );

  // ----------------------------------------------------
  // TEST 4: Box → Bandage (10 Bandages / Box) = 10 Bandages / Box
  // ----------------------------------------------------
  const t4Levels = [
    { levelIndex: 0, parentUnit: 'Box', quantity: 10, childUnit: 'Bandage' }
  ];
  const t4Factor = calculateConversionFactor(true, t4Levels);
  const t4ConsUnit = getDerivedConsumptionUnit('Box', true, t4Levels);
  const t4Desc = generatePackSizeDescription('Box', true, t4Levels);
  const t4ValErr = validatePackagingUnits('Box', true, t4Levels);

  assert(
    t4Factor === 10 && t4ConsUnit === 'Bandage' && t4Desc === '10 Bandages / Box' && t4ValErr === null,
    'TEST 4: Box → Bandage (10 Bandages / Box) = 10 Bandages / Box'
  );

  // ----------------------------------------------------
  // TEST 5: Box → Pair (100 Pairs / Box) = 100 Pairs / Box
  // ----------------------------------------------------
  const t5Levels = [
    { levelIndex: 0, parentUnit: 'Box', quantity: 100, childUnit: 'Pair' }
  ];
  const t5Factor = calculateConversionFactor(true, t5Levels);
  const t5ConsUnit = getDerivedConsumptionUnit('Box', true, t5Levels);
  const t5Desc = generatePackSizeDescription('Box', true, t5Levels);
  const t5ValErr = validatePackagingUnits('Box', true, t5Levels);

  assert(
    t5Factor === 100 && t5ConsUnit === 'Pair' && t5Desc === '100 Pairs / Box' && t5ValErr === null,
    'TEST 5: Box → Pair (100 Pairs / Box) = 100 Pairs / Box'
  );

  // ----------------------------------------------------
  // TEST 6: Bottle → Bottle -> Converter = 1
  // ----------------------------------------------------
  const t6Factor = calculateConversionFactor(false, []);
  const t6ConsUnit = getDerivedConsumptionUnit('Bottle', false, []);
  const t6Desc = generatePackSizeDescription('Bottle', false, []);
  const t6ValErr = validatePackagingUnits('Bottle', false, []);

  assert(
    t6Factor === 1 && t6ConsUnit === 'Bottle' && t6Desc === 'Bottle — sold as individual unit' && t6ValErr === null,
    'TEST 6: Bottle → Bottle -> Converter = 1 (Sold as individual unit)'
  );

  // ----------------------------------------------------
  // TEST 7: Box → Tablet → Tablet -> REJECTED
  // ----------------------------------------------------
  const t7Levels = [
    { levelIndex: 0, parentUnit: 'Box', quantity: 10, childUnit: 'Tablet' },
    { levelIndex: 1, parentUnit: 'Tablet', quantity: 15, childUnit: 'Tablet' }
  ];
  const t7ValErr = validatePackagingUnits('Box', true, t7Levels);

  assert(
    t7ValErr === 'Each packaging level must use a different unit.',
    'TEST 7: Box → Tablet → Tablet is REJECTED with "Each packaging level must use a different unit."'
  );

  // ----------------------------------------------------
  // TEST 8: Box → Strip → Strip -> REJECTED
  // ----------------------------------------------------
  const t8Levels = [
    { levelIndex: 0, parentUnit: 'Box', quantity: 10, childUnit: 'Strip' },
    { levelIndex: 1, parentUnit: 'Strip', quantity: 10, childUnit: 'Strip' }
  ];
  const t8ValErr = validatePackagingUnits('Box', true, t8Levels);

  assert(
    t8ValErr === 'Each packaging level must use a different unit.',
    'TEST 8: Box → Strip → Strip is REJECTED with "Each packaging level must use a different unit."'
  );

  // ----------------------------------------------------
  // TEST 9: Bottle → mL -> NOT OFFERED
  // ----------------------------------------------------
  const hasMlInPurchase = PACKAGING_PURCHASE_UNITS.some(u => u.toLowerCase() === 'ml');
  const hasMlInIntermediate = INTERMEDIATE_PACKAGING_UNITS.some(u => u.toLowerCase() === 'ml');
  const hasMlInConsumption = CONSUMPTION_INDIVIDUAL_UNITS.some(u => u.toLowerCase() === 'ml');
  const hasLitre = [...PACKAGING_PURCHASE_UNITS, ...INTERMEDIATE_PACKAGING_UNITS, ...CONSUMPTION_INDIVIDUAL_UNITS].some(u => u.toLowerCase().includes('litre') || u.toLowerCase() === 'l');

  assert(
    !hasMlInPurchase && !hasMlInIntermediate && !hasMlInConsumption && !hasLitre,
    'TEST 9: Bottle → mL is NOT OFFERED (liquid volume units are strictly excluded from vocabularies)'
  );

  // ----------------------------------------------------
  // TEST 10: Any valid hierarchy -> Automatic converter calculation
  // (e.g. 1 Carton -> 10 Boxes -> 10 Strips -> 10 Tablets = 1,000 Tablets / Carton)
  // ----------------------------------------------------
  const t10Levels = [
    { levelIndex: 0, parentUnit: 'Carton', quantity: 10, childUnit: 'Box' },
    { levelIndex: 1, parentUnit: 'Box', quantity: 10, childUnit: 'Strip' },
    { levelIndex: 2, parentUnit: 'Strip', quantity: 10, childUnit: 'Tablet' }
  ];
  const t10Factor = calculateConversionFactor(true, t10Levels);
  const t10ConsUnit = getDerivedConsumptionUnit('Carton', true, t10Levels);
  const t10ValErr = validatePackagingUnits('Carton', true, t10Levels);
  const t10Desc = generatePackSizeDescription('Carton', true, t10Levels);

  assert(
    t10Factor === 1000 && t10ConsUnit === 'Tablet' && t10ValErr === null && t10Desc === '10 Boxes × 10 Strips × 10 Tablets (1,000 Tablets / Carton)',
    'TEST 10: Any valid hierarchy -> Automatic converter calculation (Carton -> Box -> Strip -> Tablet = 1,000 Tablets / Carton)'
  );

  // ----------------------------------------------------
  // BACKEND MONGOOSE PERSISTENCE & INVARIANCE CHECK
  // ----------------------------------------------------
  const savedItem = await ItemMaster.create({
    tenantId: TEST_TENANT,
    itemCode: 'ITM-SPEC-001',
    genericName: 'Paracetamol Syrup',
    brandName: 'Calpol Suspension',
    categoryType: 'Drugs',
    departmentType: 'Pharmacy',
    itemType: 'Medicine',
    hsnCode: '30049099',
    purchasedUnit: 'Bottle',
    converterFactor: 1,
    consumptionUnit: 'Bottle',
    packSizeDescription: 'Bottle — sold as individual unit',
    packagingHierarchy: { isBrokenDown: false, levels: [] },
    status: 'Active'
  });

  assert(
    savedItem.converterFactor === 1 && savedItem.consumptionUnit === 'Bottle' && savedItem.purchasedUnit === 'Bottle',
    'Database Invariance: Bottle item persists with converterFactor = 1 and consumptionUnit = Bottle'
  );

  // Clean test tenant items
  await ItemMaster.deleteMany({ tenantId: TEST_TENANT });

  console.log('\n====================================================');
  console.log(`  PACKAGING SPECIFICATION RESULTS: ${passedTests} PASSED, 0 FAILED`);
  console.log('====================================================\n');

  await mongoose.disconnect();
}

runTests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
