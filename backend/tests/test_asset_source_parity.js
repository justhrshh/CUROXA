/**
 * test_asset_source_parity.js
 * 
 * Verifies exact parity between the client-verified Asset worksheet and the
 * Master Schema Registry (both backend and frontend), ensuring:
 * 1. Exactly 15 columns (A through O)
 * 2. Exact client column headers preserved
 * 3. hasDepartment === false
 * 4. Zero invented/forbidden fields (Model No, Serial No, Asset Location, Warranty Period, Purchase Date, Purchase Cost, Depreciation Rate, Status)
 * 5. Sample values marked as SAMPLE_VALUES_ONLY and not mandatory validation rules.
 */

const assert = require('assert');
const path = require('path');
const fs = require('fs');

const backendRegistry = require('../config/masterSchemaRegistry');

console.log('===============================================================');
console.log('   QUROXA — ASSET WORKSHEET CLIENT SOURCE PARITY TEST');
console.log('===============================================================\n');

let passedTests = 0;
let totalTests = 0;

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

// Expected client columns (A through O)
const EXPECTED_ASSET_COLUMNS = [
  { col: 'A', header: 'S.No', key: 'sNo', type: 'number' },
  { col: 'B', header: 'Category', key: 'category', type: 'text' },
  { col: 'C', header: 'itemTypeName', key: 'itemTypeName', type: 'text' },
  { col: 'D', header: 'ItemCode', key: 'itemCode', type: 'text' },
  { col: 'E', header: 'ItemName', key: 'itemName', type: 'text' },
  { col: 'F', header: 'Description', key: 'description', type: 'textarea' },
  { col: 'G', header: 'HSNCode', key: 'hsnCode', type: 'text' },
  { col: 'H', header: 'Expirable', key: 'expirable', type: 'select' },
  { col: 'I', header: 'ExpiryDateCutoff', key: 'expiryDateCutoff', type: 'number' },
  { col: 'J', header: 'GSTNTax', key: 'gstnTax', type: 'number' },
  { col: 'K', header: 'ManufactureName', key: 'manufactureName', type: 'text' },
  { col: 'L', header: 'PurchasedUnit', key: 'purchasedUnit', type: 'text' },
  { col: 'M', header: 'Converter', key: 'converter', type: 'number' },
  { col: 'N', header: 'PackSize', key: 'packSize', type: 'text' },
  { col: 'O', header: 'MRP', key: 'mrp', type: 'number' }
];

const FORBIDDEN_FIELD_NAMES = [
  'modelno',
  'model no',
  'serialno',
  'serial no',
  'assetlocation',
  'asset location',
  'warrantyperiod',
  'warranty period',
  'purchasedate',
  'purchase date',
  'purchasecost',
  'purchase cost',
  'depreciationrate',
  'depreciation rate',
  'status'
];

const assetConfig = backendRegistry.getCategoryConfig('Assets');

runTest('Asset category exists and is CONFIRMED', () => {
  assert.ok(assetConfig, 'Assets category must exist');
  assert.strictEqual(assetConfig.status, 'CONFIRMED');
});

runTest('Asset has hasDepartment = false and 0 departments', () => {
  assert.strictEqual(assetConfig.hasDepartment, false);
  assert.strictEqual(Object.keys(assetConfig.departments || {}).length, 0);
});

runTest('Asset contains exactly 15 client columns (A through O)', () => {
  assert.strictEqual(assetConfig.sharedFields.length, 15);
});

runTest('Asset column sequence, headers, and keys match client source exactly', () => {
  assetConfig.sharedFields.forEach((field, idx) => {
    const expected = EXPECTED_ASSET_COLUMNS[idx];
    assert.strictEqual(field.excelColumn, expected.col, `Index ${idx} col must be ${expected.col}`);
    assert.strictEqual(field.clientHeader, expected.header, `Index ${idx} header must be ${expected.header}`);
    assert.strictEqual(field.fieldKey, expected.key, `Index ${idx} key must be ${expected.key}`);
    assert.strictEqual(field.inputType, expected.type, `Index ${idx} type must be ${expected.type}`);
  });
});

runTest('No forbidden fields exist in Asset registry', () => {
  assetConfig.sharedFields.forEach((field) => {
    const headerLower = field.clientHeader.toLowerCase().trim();
    const keyLower = field.fieldKey.toLowerCase().trim();
    FORBIDDEN_FIELD_NAMES.forEach((forbidden) => {
      assert.notStrictEqual(headerLower, forbidden, `Forbidden header found: ${field.clientHeader}`);
      assert.notStrictEqual(keyLower, forbidden, `Forbidden key found: ${field.fieldKey}`);
    });
  });
});

runTest('Observed values are marked SAMPLE_VALUES_ONLY and not mandatory rules', () => {
  const sampleFields = ['itemTypeName', 'purchasedUnit', 'converter', 'gstnTax', 'expirable'];
  sampleFields.forEach((key) => {
    const field = assetConfig.sharedFields.find((f) => f.fieldKey === key);
    assert.ok(field, `Field ${key} must exist`);
    assert.strictEqual(field.optionsSource, 'SAMPLE_VALUES_ONLY');
    assert.strictEqual(field.systemRequired, false, `${key} must not be systemRequired`);
  });
});

runTest('Frontend registry matches Backend registry for Assets', () => {
  const frontendRegistryPath = path.resolve(__dirname, '../../frontend/src/config/masterSchemaRegistry.js');
  const frontendCode = fs.readFileSync(frontendRegistryPath, 'utf8');
  assert.ok(frontendCode.includes('"Assets": {'), 'Frontend registry must have Assets config');
  assert.ok(frontendCode.includes('excelSheet: "Asset"'), 'Frontend registry must reference sheet "Asset"');
  
  // Verify each expected column header is present in frontend registry
  EXPECTED_ASSET_COLUMNS.forEach((col) => {
    assert.ok(
      frontendCode.includes(`clientHeader: "${col.header}"`),
      `Frontend registry must contain clientHeader "${col.header}"`
    );
  });
});

console.log('\n===============================================================');
console.log(`  TOTAL TESTS: ${totalTests} | PASSED: ${passedTests} | FAILED: ${totalTests - passedTests}`);
console.log('===============================================================\n');

if (totalTests !== passedTests) {
  process.exit(1);
} else {
  process.exit(0);
}
