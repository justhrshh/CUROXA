/**
 * QUROXA — DYNAMIC PACKAGING HIERARCHY & 8 REAL-WORLD CASES VERIFICATION
 */

const mongoose = require('mongoose');
const ItemMaster = require('../models/ItemMaster');
const MedicineBatch = require('../models/MedicineBatch');
const Counter = require('../models/Counter');

const TEST_TENANT_ID = 'test_pkg_hosp_' + Date.now();
const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/quroxa_test_pkg_cases';

let passed = 0;
let failed = 0;

function assert(condition, testName) {
  if (condition) {
    console.log(`  [PASS] ${testName}`);
    passed++;
  } else {
    console.error(`  [FAIL] ${testName}`);
    failed++;
  }
}

async function runCases() {
  console.log('====================================================');
  console.log('  QUROXA — 8 REAL-WORLD PACKAGING CASES VERIFICATION ');
  console.log('====================================================\n');

  try {
    await mongoose.connect(MONGO_URI);

    await ItemMaster.deleteMany({ tenantId: TEST_TENANT_ID });
    await MedicineBatch.deleteMany({ tenantId: TEST_TENANT_ID });
    await Counter.deleteMany({ key: new RegExp(TEST_TENANT_ID) });

    // CASE 1 — Tablets: Box -> 10 Strips -> 10 Tablets (Converter = 100)
    const case1 = await ItemMaster.create({
      tenantId: TEST_TENANT_ID,
      itemCode: 'ITM-2026-CASE1',
      genericName: 'Paracetamol 500mg',
      brandName: 'Dolo 500',
      categoryType: 'Drugs',
      departmentType: 'Pharmacy',
      itemType: 'Medicine',
      hsnCode: '30049099',
      manufacturer: 'Micro Labs',
      purchasedUnit: 'Box',
      converterFactor: 100,
      consumptionUnit: 'Tablet',
      packSizeDescription: '10 Strips × 10 Tablets (100 Tablets / Box)',
      packagingHierarchy: {
        isBrokenDown: true,
        levels: [
          { levelIndex: 0, parentUnit: 'Box', quantity: 10, childUnit: 'Strip' },
          { levelIndex: 1, parentUnit: 'Strip', quantity: 10, childUnit: 'Tablet' }
        ]
      }
    });

    assert(
      case1.purchasedUnit === 'Box' &&
      case1.consumptionUnit === 'Tablet' &&
      case1.converterFactor === 100 &&
      case1.packagingHierarchy.levels.length === 2,
      'Case 1: Tablets — 1 Box (10 Strips × 10 Tablets) = 100 Tablets, Converter = 100'
    );

    // CASE 2 — Syrup: Bottle -> As-is (Converter = 1, NOT converted to mL)
    const case2 = await ItemMaster.create({
      tenantId: TEST_TENANT_ID,
      itemCode: 'ITM-2026-CASE2',
      genericName: 'Cough Syrup 100ml',
      brandName: 'Ascoril D',
      categoryType: 'Drugs',
      departmentType: 'Pharmacy',
      itemType: 'Medicine',
      hsnCode: '30049099',
      manufacturer: 'Glenmark',
      purchasedUnit: 'Bottle',
      converterFactor: 1,
      consumptionUnit: 'Bottle',
      packSizeDescription: 'Bottle (Complete Unit)',
      packagingHierarchy: {
        isBrokenDown: false,
        levels: []
      }
    });

    assert(
      case2.purchasedUnit === 'Bottle' &&
      case2.consumptionUnit === 'Bottle' &&
      case2.converterFactor === 1 &&
      case2.consumptionUnit !== 'ml',
      'Case 2: Syrup — 1 Bottle -> As-is = 1 Bottle, Converter = 1 (NOT converted to mL)'
    );

    // CASE 3 — Injection: Vial -> As-is (Converter = 1)
    const case3 = await ItemMaster.create({
      tenantId: TEST_TENANT_ID,
      itemCode: 'ITM-2026-CASE3',
      genericName: 'Ceftriaxone 1g',
      brandName: 'Monocef 1g',
      categoryType: 'Drugs',
      departmentType: 'Pharmacy',
      itemType: 'Medicine',
      hsnCode: '30049099',
      manufacturer: 'Aristo Pharma',
      purchasedUnit: 'Vial',
      converterFactor: 1,
      consumptionUnit: 'Vial',
      packSizeDescription: 'Vial (Complete Unit)',
      packagingHierarchy: {
        isBrokenDown: false,
        levels: []
      }
    });

    assert(
      case3.purchasedUnit === 'Vial' &&
      case3.consumptionUnit === 'Vial' &&
      case3.converterFactor === 1,
      'Case 3: Injection — 1 Vial -> As-is = 1 Vial, Converter = 1'
    );

    // CASE 4 — Masks: Box -> 50 Masks (Converter = 50)
    const case4 = await ItemMaster.create({
      tenantId: TEST_TENANT_ID,
      itemCode: 'ITM-2026-CASE4',
      genericName: 'N95 Surgical Mask',
      brandName: '3M Aura',
      categoryType: 'Consumable',
      departmentType: 'General',
      itemType: 'Consumable',
      hsnCode: '63079090',
      manufacturer: '3M Healthcare',
      purchasedUnit: 'Box',
      converterFactor: 50,
      consumptionUnit: 'Mask',
      packSizeDescription: '50 Masks / Box',
      packagingHierarchy: {
        isBrokenDown: true,
        levels: [
          { levelIndex: 0, parentUnit: 'Box', quantity: 50, childUnit: 'Mask' }
        ]
      }
    });

    assert(
      case4.purchasedUnit === 'Box' &&
      case4.consumptionUnit === 'Mask' &&
      case4.converterFactor === 50,
      'Case 4: Masks — 1 Box -> 50 Masks = 50 Masks, Converter = 50'
    );

    // CASE 5 — Bandages: Box -> 100 Pieces (Converter = 100)
    const case5 = await ItemMaster.create({
      tenantId: TEST_TENANT_ID,
      itemCode: 'ITM-2026-CASE5',
      genericName: 'Adhesive Bandages',
      brandName: 'Band-Aid Tough',
      categoryType: 'Consumable',
      departmentType: 'General Store',
      itemType: 'Consumable',
      hsnCode: '30051090',
      manufacturer: 'Johnson & Johnson',
      purchasedUnit: 'Box',
      converterFactor: 100,
      consumptionUnit: 'Piece',
      packSizeDescription: '100 Pieces / Box',
      packagingHierarchy: {
        isBrokenDown: true,
        levels: [
          { levelIndex: 0, parentUnit: 'Box', quantity: 100, childUnit: 'Piece' }
        ]
      }
    });

    assert(
      case5.purchasedUnit === 'Box' &&
      case5.consumptionUnit === 'Piece' &&
      case5.converterFactor === 100,
      'Case 5: Bandages — 1 Box -> 100 Pieces = 100 Pieces, Converter = 100'
    );

    // CASE 6 — Gloves: Box -> 50 Pairs (Converter = 50)
    const case6 = await ItemMaster.create({
      tenantId: TEST_TENANT_ID,
      itemCode: 'ITM-2026-CASE6',
      genericName: 'Latex Examination Gloves 7.5',
      brandName: 'Romsons SafeGrip',
      categoryType: 'Consumable',
      departmentType: 'OT',
      itemType: 'Consumable',
      hsnCode: '40151100',
      manufacturer: 'Romsons',
      purchasedUnit: 'Box',
      converterFactor: 50,
      consumptionUnit: 'Pair',
      packSizeDescription: '50 Pairs / Box',
      packagingHierarchy: {
        isBrokenDown: true,
        levels: [
          { levelIndex: 0, parentUnit: 'Box', quantity: 50, childUnit: 'Pair' }
        ]
      }
    });

    assert(
      case6.purchasedUnit === 'Box' &&
      case6.consumptionUnit === 'Pair' &&
      case6.converterFactor === 50,
      'Case 6: Gloves — 1 Box -> 50 Pairs = 50 Pairs, Converter = 50'
    );

    // CASE 7 — Multi-level packaging: Carton -> 10 Boxes -> 10 Strips -> 10 Tablets (Converter = 1,000)
    const case7 = await ItemMaster.create({
      tenantId: TEST_TENANT_ID,
      itemCode: 'ITM-2026-CASE7',
      genericName: 'Amoxicillin 500mg',
      brandName: 'Mox 500',
      categoryType: 'Drugs',
      departmentType: 'Pharmacy',
      itemType: 'Medicine',
      hsnCode: '30041010',
      manufacturer: 'Ranbaxy / Sun',
      purchasedUnit: 'Carton',
      converterFactor: 1000,
      consumptionUnit: 'Tablet',
      packSizeDescription: '10 Boxes × 10 Strips × 10 Tablets (1,000 Tablets / Carton)',
      packagingHierarchy: {
        isBrokenDown: true,
        levels: [
          { levelIndex: 0, parentUnit: 'Carton', quantity: 10, childUnit: 'Box' },
          { levelIndex: 1, parentUnit: 'Box', quantity: 10, childUnit: 'Strip' },
          { levelIndex: 2, parentUnit: 'Strip', quantity: 10, childUnit: 'Tablet' }
        ]
      }
    });

    const calculatedCase7Factor = case7.packagingHierarchy.levels.reduce((acc, l) => acc * l.quantity, 1);
    assert(
      case7.purchasedUnit === 'Carton' &&
      case7.consumptionUnit === 'Tablet' &&
      case7.converterFactor === 1000 &&
      calculatedCase7Factor === 1000,
      'Case 7: Multi-level — 1 Carton -> 10 Boxes -> 10 Strips -> 10 Tablets = 1,000 Tablets, Converter = 1,000'
    );

    // CASE 8 — Single unit: Piece -> As-is (Converter = 1)
    const case8 = await ItemMaster.create({
      tenantId: TEST_TENANT_ID,
      itemCode: 'ITM-2026-CASE8',
      genericName: 'Digital Thermometer',
      brandName: 'Omron Eco',
      categoryType: 'Equipment',
      departmentType: 'General Store',
      itemType: 'Asset',
      hsnCode: '90251920',
      manufacturer: 'Omron',
      purchasedUnit: 'Piece',
      converterFactor: 1,
      consumptionUnit: 'Piece',
      packSizeDescription: 'Piece (Complete Unit)',
      packagingHierarchy: {
        isBrokenDown: false,
        levels: []
      }
    });

    assert(
      case8.purchasedUnit === 'Piece' &&
      case8.consumptionUnit === 'Piece' &&
      case8.converterFactor === 1,
      'Case 8: Single unit — 1 Piece -> As-is = 1 Piece, Converter = 1'
    );

    // Case 9: Downstream GRN and Dispensing math consistency across all cases
    const grnInwardingTablets = 5 * case1.converterFactor; // 5 Boxes * 100 = 500 Tablets
    const grnInwardingSyrup = 20 * case2.converterFactor;  // 20 Bottles * 1 = 20 Bottles
    const grnInwardingCarton = 2 * case7.converterFactor;  // 2 Cartons * 1000 = 2,000 Tablets
    assert(
      grnInwardingTablets === 500 && grnInwardingSyrup === 20 && grnInwardingCarton === 2000,
      'Downstream GRN Boundary Invariant: purchasedQty * converterFactor matches exact consumption units'
    );

    // Clean up
    await ItemMaster.deleteMany({ tenantId: TEST_TENANT_ID });
    await MedicineBatch.deleteMany({ tenantId: TEST_TENANT_ID });
    await Counter.deleteMany({ key: new RegExp(TEST_TENANT_ID) });

  } catch (err) {
    console.error('Case execution error:', err);
    failed++;
  } finally {
    await mongoose.disconnect();
  }

  console.log('\n====================================================');
  console.log(`  PACKAGING CASES RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('====================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runCases();
