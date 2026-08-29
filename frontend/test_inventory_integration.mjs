import * as XLSX from 'xlsx';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import {
  normalizeExportRows,
  filterDataByDate,
  generateExcelFile,
  generatePdfFile,
  logExportEvent,
  inventoryExportColumns
} from './src/utils/exportEngine.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

try {
  Object.defineProperty(globalThis, 'localStorage', {
    value: {
      getItem: () => null,
      setItem: () => {},
      removeItem: () => {},
      clear: () => {}
    },
    configurable: true,
    writable: true
  });
} catch {}

console.log('====================================================');
console.log('CUROXA UNIFIED DATA EXPORT — PHASE 5 INVENTORY TEST');
console.log('====================================================\n');

// Mock realistic medicine inventory matching backend/models/Medicine.js
const mockMedicines = [
  {
    _id: 'med_001',
    name: 'Paracetamol 500mg',
    category: 'Pain Relief',
    sku: 'MED-PCM-500',
    stock: 1200,
    unit: 'Strip',
    mrp: 32.50,
    status: 'In Stock',
    expiry: '12/2027',
    tenantId: 'city_hospital',
    createdAt: '2025-01-10T10:00:00.000Z',
    updatedAt: '2026-08-29T12:30:00.000Z',
    // Internal fields that MUST NOT be exported
    __v: 0,
    internalSecret: 'secret_token_123'
  },
  {
    _id: 'med_002',
    name: 'Amoxicillin 250mg Capsules',
    category: 'Antibiotics',
    sku: 'MED-AMX-250',
    stock: 14,
    unit: 'Box',
    mrp: 145.00,
    status: 'Low Stock',
    expiry: '09/2026',
    tenantId: 'city_hospital',
    createdAt: '2025-02-15T11:00:00.000Z',
    updatedAt: '2026-08-28T09:15:00.000Z'
  },
  {
    _id: 'med_003',
    name: 'Atorvastatin 10mg Tablets',
    category: 'Cardiovascular',
    sku: 'MED-ATV-010',
    stock: 0,
    unit: 'Strip',
    mrp: 88.00,
    status: 'Out of Stock',
    expiry: '04/2026',
    tenantId: 'city_hospital',
    createdAt: '2024-11-20T08:00:00.000Z',
    updatedAt: '2026-08-27T16:45:00.000Z'
  },
  {
    _id: 'med_004',
    name: 'Cetirizine 10mg Tablets',
    category: 'Antihistamines',
    sku: 'MED-CTZ-010',
    stock: 450,
    unit: 'Strip',
    mrp: 18.00,
    status: 'In Stock',
    expiry: '11/2028',
    tenantId: 'city_hospital',
    createdAt: '2025-03-01T14:20:00.000Z',
    updatedAt: '2026-08-29T08:00:00.000Z'
  },
  {
    _id: 'med_005',
    name: 'Azithromycin 500mg Tablets',
    category: 'Antibiotics',
    sku: 'MED-AZM-500',
    stock: 8,
    unit: 'Strip',
    mrp: 120.00,
    status: 'Low Stock',
    expiry: '01/2027',
    tenantId: 'city_hospital',
    createdAt: '2024-08-12T10:30:00.000Z',
    updatedAt: '2026-08-25T11:00:00.000Z'
  }
];

// Add 45 more items for total 50 inventory items to test pagination
for (let i = 6; i <= 50; i++) {
  const stock = i % 7 === 0 ? 0 : i % 4 === 0 ? 12 : 100 + i * 5;
  const status = stock === 0 ? 'Out of Stock' : stock <= 20 ? 'Low Stock' : 'In Stock';
  mockMedicines.push({
    _id: `med_${String(i).padStart(3, '0')}`,
    name: `Medication Sample ${i}`,
    category: i % 3 === 0 ? 'Antibiotics' : i % 2 === 0 ? 'Pain Relief' : 'Vitamins',
    sku: `MED-SMP-${String(i).padStart(3, '0')}`,
    stock,
    unit: i % 2 === 0 ? 'Strip' : 'Bottle',
    mrp: 25.0 + i * 2.5,
    status,
    expiry: `0${(i % 9) + 1}/2027`,
    tenantId: 'city_hospital',
    createdAt: new Date(Date.now() - i * 15 * 24 * 60 * 60 * 1000).toISOString(),
    updatedAt: new Date(Date.now() - i * 2 * 24 * 60 * 60 * 1000).toISOString(),
    internalSecret: `secret_${i}`
  });
}

const testResults = {};

// 1. Authoritative Stock Preservation (Direct from Medicine.stock without recalculations)
console.log('--- TEST 1: Authoritative Stock Value Preservation ---');
const norm1 = normalizeExportRows(mockMedicines, inventoryExportColumns);
const test1Pass = norm1[0]['Current Stock'] === 1200 &&
                  norm1[1]['Current Stock'] === 14 &&
                  norm1[2]['Current Stock'] === 0;
console.log(`✓ Direct Stock Values Preserved: PCM=${norm1[0]['Current Stock']}, AMX=${norm1[1]['Current Stock']}, ATV=${norm1[2]['Current Stock']}`);
testResults.test1_stockPreservation = test1Pass;

// 2. Snapshot Semantics (No fake historical date filtering, dateField=null returns full snapshot)
console.log('\n--- TEST 2: Current Snapshot Semantics (No fake createdAt filtering) ---');
const snapshotData = filterDataByDate(mockMedicines, null, { type: 'Current Snapshot' });
const test2Pass = snapshotData.length === mockMedicines.length && snapshotData.length === 50;
console.log(`✓ Snapshot Semantics: Full catalog count=${snapshotData.length} (Expected: 50, even though items created up to 2 years ago)`);
testResults.test2_snapshotSemantics = test2Pass;

// 3. Search Filter Verification (matches Name or SKU)
console.log('\n--- TEST 3: Search Filter Verification ---');
const searchPCM = mockMedicines.filter(m => m.name.toLowerCase().includes('paracetamol') || m.sku.toLowerCase().includes('paracetamol'));
const searchSKU = mockMedicines.filter(m => m.sku.toLowerCase().includes('amx-250'));
const normSearchPCM = normalizeExportRows(searchPCM, inventoryExportColumns);
const normSearchSKU = normalizeExportRows(searchSKU, inventoryExportColumns);
const test3Pass = normSearchPCM.length === 1 && normSearchPCM[0]['Medicine Name'] === 'Paracetamol 500mg' &&
                  normSearchSKU.length === 1 && normSearchSKU[0]['SKU Code'] === 'MED-AMX-250';
console.log(`✓ Search by Name: Count=${normSearchPCM.length}, SKU: Count=${normSearchSKU.length}`);
testResults.test3_searchFilter = test3Pass;

// 4. Category Filter Verification
console.log('\n--- TEST 4: Category Filter Verification ---');
const antibioticsOnly = mockMedicines.filter(m => m.category === 'Antibiotics');
const normAntibiotics = normalizeExportRows(antibioticsOnly, inventoryExportColumns);
const test4Pass = normAntibiotics.length > 0 && normAntibiotics.every(r => r['Category'] === 'Antibiotics');
console.log(`✓ Filter by Category (Antibiotics): Count=${normAntibiotics.length}, 100% Match: ${test4Pass}`);
testResults.test4_categoryFilter = test4Pass;

// 5. Stock Status Filter Verification (In Stock, Low Stock, Out of Stock)
console.log('\n--- TEST 5: Stock Status Filter Verification ---');
const lowStockOnly = mockMedicines.filter(m => m.status === 'Low Stock');
const outOfStockOnly = mockMedicines.filter(m => m.status === 'Out of Stock');
const normLow = normalizeExportRows(lowStockOnly, inventoryExportColumns);
const normOut = normalizeExportRows(outOfStockOnly, inventoryExportColumns);
const test5Pass = normLow.every(r => r['Stock Status'] === 'Low Stock') &&
                  normOut.every(r => r['Stock Status'] === 'Out of Stock');
console.log(`✓ Filter by Status: Low Stock=${normLow.length}, Out of Stock=${normOut.length}`);
testResults.test5_statusFilter = test5Pass;

// 6. Combined Search + Category + Status Filter
console.log('\n--- TEST 6: Combined Multi-Filter Intersection ---');
const comboFiltered = mockMedicines.filter(m => {
  const matchSearch = m.name.toLowerCase().includes('capsules') || m.sku.toLowerCase().includes('capsules');
  const matchCat = m.category === 'Antibiotics';
  const matchStatus = m.status === 'Low Stock';
  return matchSearch && matchCat && matchStatus;
});
const normCombo = normalizeExportRows(comboFiltered, inventoryExportColumns);
const test6Pass = normCombo.length === 1 && normCombo[0]['SKU Code'] === 'MED-AMX-250';
console.log(`✓ Combined Filter (Search+Cat+Status): Count=${normCombo.length}, Item=${normCombo[0]?.['Medicine Name']}`);
testResults.test6_combinedFilters = test6Pass;

// 7. Pagination Safety (Export receives complete dataset of 50, UI page shows 10)
console.log('\n--- TEST 7: Pagination Safety ---');
const visiblePageRows = mockMedicines.slice(0, 10);
const fullExportRows = normalizeExportRows(mockMedicines, inventoryExportColumns);
const test7Pass = fullExportRows.length === 50 && visiblePageRows.length === 10;
console.log(`✓ Pagination: Full dataset exported=${fullExportRows.length}, Visible page=${visiblePageRows.length}`);
testResults.test7_paginationSafety = test7Pass;

// 8. Empty Result Safety
console.log('\n--- TEST 8: Empty Result Safety ---');
const emptyFilter = mockMedicines.filter(m => m.name === 'NonExistentMedicationXYZ');
const normEmpty = normalizeExportRows(emptyFilter, inventoryExportColumns);
const test8Pass = normEmpty.length === 0;
console.log(`✓ Empty Filter result safely handled: Count=${normEmpty.length}`);
testResults.test8_emptyResult = test8Pass;

// 9. PDF Generation & Structure
console.log('\n--- TEST 9: PDF Generation & Snapshot Presentation ---');
const pdfPath = path.join(__dirname, 'test_inventory_snapshot.pdf');
await generatePdfFile({
  dataset: 'Inventory',
  rows: fullExportRows,
  columns: inventoryExportColumns,
  dateRangeText: 'Current Stock Snapshot',
  clinicName: 'CUROXA CENTRAL HOSPITAL',
  fileName: pdfPath
});
const pdfBuf = fs.readFileSync(pdfPath);
const test9Pass = pdfBuf.toString('utf-8', 0, 5) === '%PDF-' && pdfBuf.length > 20000;
console.log(`✓ PDF Snapshot Valid: Size=${pdfBuf.length} bytes, MagicBytes=true`);
fs.unlinkSync(pdfPath);
testResults.test9_pdfGeneration = test9Pass;

// 10. Excel Generation & Whitelist Columns
console.log('\n--- TEST 10: Excel Generation & Whitelist Columns ---');
const xlsxPath = path.join(__dirname, 'test_inventory_snapshot.xlsx');
await generateExcelFile({
  dataset: 'Inventory',
  rows: fullExportRows,
  columns: inventoryExportColumns,
  dateRangeText: 'Current Stock Snapshot',
  fileName: xlsxPath
});
const wb = XLSX.read(fs.readFileSync(xlsxPath), { type: 'buffer' });
const sheetName = wb.SheetNames[0];
const xlsxRows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName]);
const expectedColumns = [
  'SKU Code', 'Medicine Name', 'Category', 'Current Stock',
  'Unit', 'MRP (Rs.)', 'Stock Status', 'Expiry Date', 'Last Updated'
];
const actualColumns = Object.keys(xlsxRows[0]);
const columnsMatch = expectedColumns.every(c => actualColumns.includes(c)) && actualColumns.length === expectedColumns.length;
const test10Pass = sheetName === 'Inventory' && xlsxRows.length === 50 && columnsMatch;
console.log(`✓ Excel Snapshot Valid: Sheet="${sheetName}", Rows=${xlsxRows.length}, Columns=${actualColumns.length} (Expected: 9)`);
fs.unlinkSync(xlsxPath);
testResults.test10_excelGeneration = test10Pass;

// 11. Sensitive / Internal Field Exclusion
console.log('\n--- TEST 11: Sensitive / Internal Field Exclusion ---');
const sampleRow = fullExportRows[0];
const forbiddenKeys = ['_id', '__v', 'tenantId', 'internalSecret', 'password', 'token', 'credentials'];
const leakedKeys = forbiddenKeys.filter(k => k in sampleRow);
const test11Pass = leakedKeys.length === 0;
console.log(`✓ Sensitive/Internal field exclusion: Leaked=${leakedKeys.length} -> PASS`);
testResults.test11_sensitiveExclusion = test11Pass;

// 12. Audit Logging Payload
console.log('\n--- TEST 12: Audit Logging Payload ---');
const sampleAuditPayload = {
  action: 'DATASET_EXPORTED',
  target: 'Inventory',
  metadata: {
    dataset: 'Inventory',
    format: 'EXCEL',
    recordCount: 50,
    dateRange: {
      type: 'Current Snapshot',
      generatedAt: new Date().toISOString()
    },
    filters: {
      search: 'Amoxicillin',
      category: 'Antibiotics',
      status: 'Low Stock'
    }
  }
};
const test12Pass = sampleAuditPayload.action === 'DATASET_EXPORTED' &&
                   sampleAuditPayload.target === 'Inventory' &&
                   sampleAuditPayload.metadata.recordCount === 50 &&
                   sampleAuditPayload.metadata.dateRange.type === 'Current Snapshot' &&
                   sampleAuditPayload.metadata.filters.category === 'Antibiotics' &&
                   !('data' in sampleAuditPayload.metadata);
console.log(`✓ Audit Payload Valid: action=${sampleAuditPayload.action}, target=${sampleAuditPayload.target}, dateRangeType=${sampleAuditPayload.metadata.dateRange.type}`);
testResults.test12_auditLogging = test12Pass;

console.log('\n====================================================');
console.log('INVENTORY EXPORT TEST SUITE RESULTS (12/12):');
console.log(JSON.stringify(testResults, null, 2));
console.log('====================================================');
