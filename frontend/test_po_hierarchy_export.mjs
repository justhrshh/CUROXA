import * as XLSX from 'xlsx';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import {
  normalizeExportRows,
  generateExcelFile,
  generatePdfFile,
  poExportColumns,
  flattenPoForExport
} from './src/utils/exportEngine.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('====================================================');
console.log('CUROXA — HIERARCHY-AWARE PURCHASE ORDER TEST SUITE');
console.log('====================================================\n');

// 1. Setup exact live dataset from user prompt
const liveMasterPO = {
  _id: 'mongo_master_0018',
  poId: 'PO-2026-27-0018',
  isParent: true,
  parentPOId: null,
  vendorName: 'Consolidated Multiple Suppliers',
  vendorOrders: [
    { poId: 'PO-2026-27-0018-A', vendorName: 'kartik medicose', totalAmount: 26544.00 },
    { poId: 'PO-2026-27-0018-B', vendorName: 'satyam-1', totalAmount: 11183.20 }
  ],
  subtotal: 33685.00,
  taxAmount: 4042.20,
  totalAmount: 37727.20,
  totalItems: 300,
  totalVendors: 2,
  status: 'Approved',
  requestedBy: 'Senior Pharmacist',
  createdAt: '2026-08-25T10:00:00.000Z',
  expectedDelivery: '2026-08-30T10:00:00.000Z',
  // Master items in DB (copies of child items)
  items: [
    { sku: 'MED-KM-01', name: 'Paracetamol 650mg', requiredQty: 200, price: 118.50, tax: 12, total: 26544.00 },
    { sku: 'MED-SAT-01', name: 'Amoxicillin 500mg', requiredQty: 100, price: 99.85, tax: 12, total: 11183.20 }
  ]
};

const liveChildA = {
  _id: 'mongo_child_0018_A',
  poId: 'PO-2026-27-0018-A',
  isParent: false,
  parentPOId: 'PO-2026-27-0018',
  vendorName: 'kartik medicose',
  vendorCode: 'VND-KM',
  subtotal: 23700.00,
  taxAmount: 2844.00,
  totalAmount: 26544.00,
  status: 'Approved',
  requestedBy: 'Senior Pharmacist',
  createdAt: '2026-08-25T10:05:00.000Z',
  expectedDelivery: '2026-08-30T10:00:00.000Z',
  items: [
    { sku: 'MED-KM-01', name: 'Paracetamol 650mg', requiredQty: 200, price: 118.50, tax: 12, total: 26544.00 }
  ]
};

const liveChildB = {
  _id: 'mongo_child_0018_B',
  poId: 'PO-2026-27-0018-B',
  isParent: false,
  parentPOId: 'PO-2026-27-0018',
  vendorName: 'satyam-1',
  vendorCode: 'VND-SAT',
  subtotal: 9985.00,
  taxAmount: 1198.20,
  totalAmount: 11183.20,
  status: 'Approved',
  requestedBy: 'Senior Pharmacist',
  createdAt: '2026-08-25T10:05:00.000Z',
  expectedDelivery: '2026-08-30T10:00:00.000Z',
  items: [
    { sku: 'MED-SAT-01', name: 'Amoxicillin 500mg', requiredQty: 100, price: 99.85, tax: 12, total: 11183.20 }
  ]
};

const liveStandalonePO = {
  _id: 'mongo_standalone_0019',
  poId: 'PO-2026-27-0019',
  isParent: false,
  parentPOId: null,
  vendorName: 'Apollo Med Supplies',
  vendorCode: 'VND-APOLLO',
  subtotal: 4464.29,
  taxAmount: 535.71,
  totalAmount: 5000.00,
  status: 'Completed',
  requestedBy: 'Pharmacy Store Head',
  createdAt: '2026-08-26T12:00:00.000Z',
  expectedDelivery: '2026-08-31T12:00:00.000Z',
  items: [
    { sku: 'MED-APO-50', name: 'Vitamin C Chewable', requiredQty: 50, price: 89.29, tax: 12, total: 5000.00 }
  ]
};

const liveDataset = [liveMasterPO, liveChildA, liveChildB, liveStandalonePO];

// 2. Run Hierarchy Flattening
console.log('--- TEST 1: HIERARCHY PRESERVATION & FLATTENING ---');
const flatRows = flattenPoForExport(liveDataset);
const normalizedRows = normalizeExportRows(flatRows, poExportColumns);

console.log(`Total flattened export rows: ${normalizedRows.length}`);
const masterRows = normalizedRows.filter(r => r['PO Type'] === 'MASTER');
const subPoRows = normalizedRows.filter(r => r['PO Type'] === 'SUB-PO');
const standaloneRows = normalizedRows.filter(r => r['PO Type'] === 'STANDALONE');

console.log(`Master Rows: ${masterRows.length} (Expected: 1)`);
console.log(`Sub-PO Rows: ${subPoRows.length} (Expected: 2)`);
console.log(`Standalone Rows: ${standaloneRows.length} (Expected: 1)`);

const test1Pass = masterRows.length === 1 && subPoRows.length === 2 && standaloneRows.length === 1;
console.log(`✓ Classification Pass: ${test1Pass ? 'PASS' : 'FAIL'}`);

// 3. Parent Relationship & Line Items
console.log('\n--- TEST 2: PARENT RELATIONSHIP & DEDUPLICATION ---');
const masterRow = masterRows[0];
const childARow = subPoRows.find(r => r['PO Number'] === 'PO-2026-27-0018-A');
const childBRow = subPoRows.find(r => r['PO Number'] === 'PO-2026-27-0018-B');

console.log(`Master PO Number: ${masterRow['PO Number']}, Parent PO: ${masterRow['Parent PO Number']}`);
console.log(`Child A PO Number: ${childARow['PO Number']}, Parent PO: ${childARow['Parent PO Number']}, Vendor: ${childARow['Vendor']}`);
console.log(`Child B PO Number: ${childBRow['PO Number']}, Parent PO: ${childBRow['Parent PO Number']}, Vendor: ${childBRow['Vendor']}`);

const parentRelationshipPass = masterRow['Parent PO Number'] === '--' &&
                               childARow['Parent PO Number'] === 'PO-2026-27-0018' &&
                               childBRow['Parent PO Number'] === 'PO-2026-27-0018';

console.log(`✓ Parent Relationship Pass: ${parentRelationshipPass ? 'PASS' : 'FAIL'}`);

// 4. Financial Reconciliation & Zero Double-Counting
console.log('\n--- TEST 3: FINANCIAL RECONCILIATION & NO DOUBLE-COUNTING ---');
const masterConsolidatedAmount = parseFloat(masterRow['Consolidated Master Total'] || 0);
const masterSupplierAmount = masterRow['Supplier Order Amount'];

const childASupplierAmount = parseFloat(childARow['Supplier Order Amount'] || 0);
const childAConsolidatedAmount = childARow['Consolidated Master Total'];

const childBSupplierAmount = parseFloat(childBRow['Supplier Order Amount'] || 0);
const childBConsolidatedAmount = childBRow['Consolidated Master Total'];

console.log(`Master Row: Consolidated Total = ₹${masterConsolidatedAmount.toFixed(2)}, Supplier Order Amount = ${masterSupplierAmount}`);
console.log(`Child A Row: Supplier Order Amount = ₹${childASupplierAmount.toFixed(2)}, Consolidated Total = ${childAConsolidatedAmount}`);
console.log(`Child B Row: Supplier Order Amount = ₹${childBSupplierAmount.toFixed(2)}, Consolidated Total = ${childBConsolidatedAmount}`);

const childrenSum = childASupplierAmount + childBSupplierAmount;
const childrenReconciled = Math.abs(childrenSum - masterConsolidatedAmount) < 0.01;
console.log(`Children Sum: ₹${childrenSum.toFixed(2)} vs Master Total: ₹${masterConsolidatedAmount.toFixed(2)} -> Reconciled: ${childrenReconciled}`);

// Summing the Supplier Order Amount column across all rows
let totalSupplierPurchases = 0;
normalizedRows.forEach(r => {
  if (r['Supplier Order Amount'] && r['Supplier Order Amount'] !== '--') {
    totalSupplierPurchases += parseFloat(r['Supplier Order Amount']);
  }
});

console.log(`Sum of all 'Supplier Order Amount' column values: ₹${totalSupplierPurchases.toFixed(2)}`);
console.log(`Expected: ₹37,727.20 (Master) + ₹5,000.00 (Standalone) = ₹42,727.20`);
const noDoubleCounting = Math.abs(totalSupplierPurchases - 42727.20) < 0.01;
console.log(`✓ No Double Counting Pass: ${noDoubleCounting ? 'PASS' : 'FAIL'} (Master total was not added to child totals)`);

// 5. Excel Generation Test
console.log('\n--- TEST 4: EXCEL TABULAR HIERARCHY TEST ---');
const excelTestPath = path.join(__dirname, 'test_output_po_hierarchy.xlsx');
await generateExcelFile({
  dataset: 'Purchase Orders',
  rows: normalizedRows,
  columns: poExportColumns,
  dateRangeText: 'August 2026',
  fileName: excelTestPath
});

const readWb = XLSX.read(fs.readFileSync(excelTestPath), { type: 'buffer' });
const sheet = readWb.Sheets[readWb.SheetNames[0]];
const excelRows = XLSX.utils.sheet_to_json(sheet);
console.log(`Generated Excel sheet "${readWb.SheetNames[0]}" with ${excelRows.length} rows`);
console.log('Sample Excel row headers:', Object.keys(excelRows[0]));
fs.unlinkSync(excelTestPath);

const excelPass = excelRows.length === 4 &&
                  excelRows[0]['PO Type'] === 'MASTER' &&
                  excelRows[1]['PO Type'] === 'SUB-PO' &&
                  excelRows[2]['PO Type'] === 'SUB-PO' &&
                  excelRows[3]['PO Type'] === 'STANDALONE';
console.log(`✓ Excel Tabular Hierarchy Pass: ${excelPass ? 'PASS' : 'FAIL'}`);

// 6. PDF Generation Test
console.log('\n--- TEST 5: PDF HIERARCHY FORMATTING TEST ---');
const pdfTestPath = path.join(__dirname, 'test_output_po_hierarchy.pdf');
await generatePdfFile({
  dataset: 'Purchase Orders',
  rows: normalizedRows,
  columns: poExportColumns,
  dateRangeText: 'August 2026',
  clinicName: 'CUROXA CENTRAL PROCUREMENT',
  fileName: pdfTestPath
});

const pdfBuffer = fs.readFileSync(pdfTestPath);
const isValidPdf = pdfBuffer.toString('utf-8', 0, 5) === '%PDF-';
console.log(`Generated PDF size: ${pdfBuffer.length} bytes, MagicBytes: ${isValidPdf}`);
fs.unlinkSync(pdfTestPath);

const pdfPass = isValidPdf && pdfBuffer.length > 20000;
console.log(`✓ PDF Formatting Pass: ${pdfPass ? 'PASS' : 'FAIL'}`);

console.log('\n====================================================');
console.log('TEST SUMMARY:');
console.log(JSON.stringify({
  classificationPass: test1Pass,
  parentRelationshipPass,
  reconciliationPass: childrenReconciled,
  noDoubleCountingPass: noDoubleCounting,
  excelPass,
  pdfPass
}, null, 2));
console.log('====================================================');
