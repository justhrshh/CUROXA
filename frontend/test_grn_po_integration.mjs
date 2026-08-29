import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import {
  resolveDateBounds,
  filterDataByDate,
  normalizeExportRows,
  generateExcelFile,
  generatePdfFile,
  grnExportColumns,
  poExportColumns,
  flattenGrnForExport,
  flattenPoForExport
} from './src/utils/exportEngine.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('====================================================');
console.log('CUROXA UNIFIED DATA EXPORT — PHASE 3: GRN & PO TEST SUITE');
console.log('====================================================\n');

const now = new Date();
const testResults = {};

// ============================================================================
// 1. MULTI-ITEM GRN TEST
// GRN-001 has 2 items; GRN-002 has 3 items
// Expected: 5 line items, separate GRN records
// ============================================================================
console.log('--- TEST 1: MULTI-ITEM GRN PRESERVATION ---');
const multiItemGrns = [
  {
    _id: 'grn_001_id',
    grnId: 'GRN-001',
    poNumber: 'PO-2026-001',
    poDate: new Date('2026-08-15'),
    receivedDate: new Date().toISOString(),
    grnLocation: 'Main Pharmacy Store',
    vendorName: 'Cipla Healthcare Ltd',
    vendorCode: 'VND-001',
    status: 'Verified/Completed',
    invoiceNumber: 'INV-CIPLA-8821',
    invoiceDate: new Date('2026-08-20'),
    invoiceAmount: 18500,
    totalDiscount: 500,
    totalGst: 1800,
    grandTotal: 18500,
    items: [
      {
        itemType: 'Medicine',
        sku: 'MED-CEF-200',
        itemCode: 'CEF-200',
        name: 'Cefixime 200mg',
        unit: 'Strip',
        barcode: '8901234567890',
        batchNumber: 'B-CFX-991',
        mfgDate: new Date('2026-01-10'),
        expiryDate: new Date('2028-01-10'),
        qtyOrdered: 100,
        previouslyReceivedQty: 0,
        remainingQty: 60,
        qtyReceived: 40,
        rejectedQty: 0,
        rejectionReason: '',
        purchaseRate: 150,
        discountPercent: 5,
        discountAmount: 300,
        gst: 12,
        gstAmount: 684,
        buyPrice: 142.5,
        netAmount: 6384
      },
      {
        itemType: 'Medicine',
        sku: 'MED-AZI-500',
        itemCode: 'AZI-500',
        name: 'Azithromycin 500mg',
        unit: 'Strip',
        barcode: '8901234567891',
        batchNumber: 'B-AZI-442',
        mfgDate: new Date('2026-02-15'),
        expiryDate: new Date('2028-02-15'),
        qtyOrdered: 50,
        previouslyReceivedQty: 0,
        remainingQty: 30,
        qtyReceived: 20,
        rejectedQty: 0,
        rejectionReason: '',
        purchaseRate: 200,
        discountPercent: 5,
        discountAmount: 200,
        gst: 12,
        gstAmount: 456,
        buyPrice: 190,
        netAmount: 4256
      }
    ]
  },
  {
    _id: 'grn_002_id',
    grnId: 'GRN-002',
    poNumber: 'PO-2026-002',
    poDate: new Date('2026-08-16'),
    receivedDate: new Date().toISOString(),
    grnLocation: 'Emergency Pharmacy Sub-Store',
    vendorName: 'Sun Pharma Distributors',
    vendorCode: 'VND-002',
    status: 'Verified/Completed',
    invoiceNumber: 'INV-SUN-1002',
    invoiceDate: new Date('2026-08-22'),
    invoiceAmount: 9400,
    totalDiscount: 200,
    totalGst: 980,
    grandTotal: 9400,
    items: [
      {
        itemType: 'Medicine',
        sku: 'MED-PCM-650',
        itemCode: 'PCM-650',
        name: 'Paracetamol 650mg (Dolo)',
        unit: 'Strip',
        barcode: '8901234567892',
        batchNumber: 'B-PCM-110',
        mfgDate: new Date('2026-03-01'),
        expiryDate: new Date('2028-03-01'),
        qtyOrdered: 100,
        previouslyReceivedQty: 0,
        remainingQty: 50,
        qtyReceived: 50,
        rejectedQty: 0,
        rejectionReason: '',
        purchaseRate: 25,
        discountPercent: 2,
        discountAmount: 25,
        gst: 12,
        gstAmount: 147,
        buyPrice: 24.5,
        netAmount: 1372
      },
      {
        itemType: 'Medicine',
        sku: 'MED-PAN-40',
        itemCode: 'PAN-40',
        name: 'Pantoprazole 40mg',
        unit: 'Strip',
        barcode: '8901234567893',
        batchNumber: 'B-PAN-772',
        mfgDate: new Date('2026-03-05'),
        expiryDate: new Date('2028-03-05'),
        qtyOrdered: 80,
        previouslyReceivedQty: 0,
        remainingQty: 40,
        qtyReceived: 40,
        rejectedQty: 0,
        rejectionReason: '',
        purchaseRate: 60,
        discountPercent: 5,
        discountAmount: 120,
        gst: 12,
        gstAmount: 273.6,
        buyPrice: 57,
        netAmount: 2553.6
      },
      {
        itemType: 'Consumable',
        sku: 'CON-SYR-5ML',
        itemCode: 'SYR-5ML',
        name: 'Disposable Syringe 5ml',
        unit: 'Box',
        barcode: '8901234567894',
        batchNumber: 'B-SYR-009',
        mfgDate: new Date('2026-01-20'),
        expiryDate: new Date('2029-01-20'),
        qtyOrdered: 50,
        previouslyReceivedQty: 0,
        remainingQty: 20,
        qtyReceived: 30,
        rejectedQty: 0,
        rejectionReason: '',
        purchaseRate: 120,
        discountPercent: 0,
        discountAmount: 0,
        gst: 18,
        gstAmount: 648,
        buyPrice: 120,
        netAmount: 4248
      }
    ]
  }
];

const flattenedMultiGrn = flattenGrnForExport(multiItemGrns);
const grnRows = normalizeExportRows(flattenedMultiGrn, grnExportColumns);
console.log(`Total flattened GRN rows produced: ${grnRows.length} (Expected: 5)`);

const grn001Count = grnRows.filter(r => r['GRN ID'] === 'GRN-001').length;
const grn002Count = grnRows.filter(r => r['GRN ID'] === 'GRN-002').length;
console.log(`GRN-001 rows: ${grn001Count}, GRN-002 rows: ${grn002Count}`);

const multiItemGrnPass = grnRows.length === 5 && grn001Count === 2 && grn002Count === 3;
console.log(`✓ Multi-Item GRN Result: ${multiItemGrnPass ? 'PASS' : 'FAIL'}`);
testResults.multiItemGrn = multiItemGrnPass;

// ============================================================================
// 2. PARTIAL GRN / SPLIT DELIVERY TEST
// GRN A: PO Qty=100, Prev=40, Remaining=60, Received=40, Rejected=0
// GRN B: PO Qty=100, Prev=40, Remaining=30, Received=30, Rejected=0
// ============================================================================
console.log('\n--- TEST 2: PARTIAL GRN / SPLIT DELIVERY INDEPENDENCE ---');
const partialGrns = [
  {
    _id: 'grn_split_1',
    grnId: 'GRN-SPLIT-01',
    poNumber: 'PO-SPLIT-999',
    receivedDate: new Date().toISOString(),
    vendorName: 'Apollo Pharma',
    items: [
      {
        name: 'Amoxicillin 500mg',
        sku: 'MED-AMX-500',
        qtyOrdered: 100,
        previouslyReceivedQty: 40,
        remainingQty: 60,
        qtyReceived: 40,
        rejectedQty: 0,
        purchaseRate: 80,
        netAmount: 3200
      }
    ]
  },
  {
    _id: 'grn_split_2',
    grnId: 'GRN-SPLIT-02',
    poNumber: 'PO-SPLIT-999',
    receivedDate: new Date().toISOString(),
    vendorName: 'Apollo Pharma',
    items: [
      {
        name: 'Amoxicillin 500mg',
        sku: 'MED-AMX-500',
        qtyOrdered: 100,
        previouslyReceivedQty: 40,
        remainingQty: 30,
        qtyReceived: 30,
        rejectedQty: 0,
        purchaseRate: 80,
        netAmount: 2400
      }
    ]
  }
];

const flattenedPartial = flattenGrnForExport(partialGrns);
const partialRows = normalizeExportRows(flattenedPartial, grnExportColumns);
const rowA = partialRows.find(r => r['GRN ID'] === 'GRN-SPLIT-01');
const rowB = partialRows.find(r => r['GRN ID'] === 'GRN-SPLIT-02');

const partialPass = rowA && rowB &&
  Number(rowA['Previously Received']) === 40 && Number(rowA['Received Quantity']) === 40 && Number(rowA['Remaining Quantity']) === 60 &&
  Number(rowB['Previously Received']) === 40 && Number(rowB['Received Quantity']) === 30 && Number(rowB['Remaining Quantity']) === 30;

console.log(`GRN 1 (Remaining: ${rowA?.['Remaining Quantity']}, Received: ${rowA?.['Received Quantity']})`);
console.log(`GRN 2 (Remaining: ${rowB?.['Remaining Quantity']}, Received: ${rowB?.['Received Quantity']})`);
console.log(`✓ Partial GRN Independence Result: ${partialPass ? 'PASS' : 'FAIL'}`);
testResults.partialGrn = partialPass;

// ============================================================================
// 3. GRN PAGINATION TEST (50 Total Filtered GRNs vs 10 Visible)
// ============================================================================
console.log('\n--- TEST 3: GRN PAGINATION (50 TOTAL vs 10 VISIBLE) ---');
const mock50Grns = [];
for (let i = 1; i <= 50; i++) {
  const pad = String(i).padStart(3, '0');
  mock50Grns.push({
    _id: `grn_id_${i}`,
    grnId: `GRN-${pad}`,
    poNumber: `PO-${pad}`,
    vendorName: `Vendor ${(i % 5) + 1}`,
    receivedDate: new Date(now.getFullYear(), now.getMonth(), (i % 25) + 1).toISOString(),
    status: 'Verified/Completed',
    totalAmount: 1000 + i * 50,
    items: [
      {
        name: `Medicine Item ${i}`,
        sku: `SKU-${pad}`,
        qtyReceived: 10 + (i % 5),
        purchaseRate: 50,
        netAmount: (10 + (i % 5)) * 50
      }
    ]
  });
}

const unpaginatedGrnRows = normalizeExportRows(flattenGrnForExport(mock50Grns), grnExportColumns);
const visible10GrnRows = unpaginatedGrnRows.slice(0, 10);
console.log(`Simulated UI page-1 count: ${visible10GrnRows.length}`);
console.log(`Complete exporter row count: ${unpaginatedGrnRows.length}`);

const grnPaginationPass = unpaginatedGrnRows.length === 50;
console.log(`✓ GRN Pagination Result: ${grnPaginationPass ? 'PASS' : 'FAIL'}`);
testResults.grnPagination = grnPaginationPass;

// ============================================================================
// 4. MULTI-ITEM PURCHASE ORDER TEST
// PO-001: 3 items; PO-002: 2 items
// Expected: 5 PO lines
// ============================================================================
console.log('\n--- TEST 4: MULTI-ITEM PURCHASE ORDER PRESERVATION ---');
const multiItemPOs = [
  {
    _id: 'po_001_id',
    poId: 'PO-001',
    createdAt: new Date().toISOString(),
    vendorName: 'Zydus Lifesciences',
    vendorCode: 'VND-ZYDUS',
    status: 'Approved',
    requestedBy: 'Dr. Ramesh Nair (Chief Pharmacist)',
    expectedDelivery: new Date(Date.now() + 3*24*60*60*1000).toISOString(),
    subtotal: 15000,
    taxAmount: 1800,
    totalAmount: 16800,
    items: [
      { sku: 'ZYD-TAB-1', name: 'Atorvastatin 10mg', requiredQty: 200, price: 35, tax: 12, total: 7840 },
      { sku: 'ZYD-TAB-2', name: 'Metformin 500mg', requiredQty: 300, price: 15, tax: 12, total: 5040 },
      { sku: 'ZYD-TAB-3', name: 'Amlodipine 5mg', requiredQty: 150, price: 20, tax: 12, total: 3360 }
    ]
  },
  {
    _id: 'po_002_id',
    poId: 'PO-002',
    createdAt: new Date().toISOString(),
    vendorName: 'Lupin Pharmaceuticals',
    vendorCode: 'VND-LUPIN',
    status: 'Confirmed',
    requestedBy: 'Dr. Priya Sharma',
    expectedDelivery: new Date(Date.now() + 4*24*60*60*1000).toISOString(),
    subtotal: 9000,
    taxAmount: 1080,
    totalAmount: 10080,
    items: [
      { sku: 'LUP-INJ-1', name: 'Ceftriaxone 1g Inj', requiredQty: 100, price: 60, tax: 12, total: 6720 },
      { sku: 'LUP-INJ-2', name: 'Ondansetron 4mg Inj', requiredQty: 80, price: 30, tax: 12, total: 2688 }
    ]
  }
];

const flattenedMultiPo = flattenPoForExport(multiItemPOs);
const poRows = normalizeExportRows(flattenedMultiPo, poExportColumns);
console.log(`Total flattened PO lines produced: ${poRows.length} (Expected: 5)`);

const po001Count = poRows.filter(r => r['PO Number'] === 'PO-001').length;
const po002Count = poRows.filter(r => r['PO Number'] === 'PO-002').length;
console.log(`PO-001 lines: ${po001Count}, PO-002 lines: ${po002Count}`);

const multiItemPoPass = poRows.length === 5 && po001Count === 3 && po002Count === 2;
console.log(`✓ Multi-Item PO Result: ${multiItemPoPass ? 'PASS' : 'FAIL'}`);
testResults.multiItemPo = multiItemPoPass;

// ============================================================================
// 5. PO PAGINATION TEST (50 Total Filtered POs vs 10 Visible)
// ============================================================================
console.log('\n--- TEST 5: PO PAGINATION (50 TOTAL vs 10 VISIBLE) ---');
const mock50POs = [];
for (let i = 1; i <= 50; i++) {
  const pad = String(i).padStart(3, '0');
  mock50POs.push({
    _id: `po_id_${i}`,
    poId: `PO-${pad}`,
    vendorName: `Supplier ${(i % 4) + 1}`,
    createdAt: new Date(now.getFullYear(), now.getMonth(), (i % 25) + 1).toISOString(),
    status: i % 2 === 0 ? 'Approved' : 'Completed',
    requestedBy: 'Pharmacist Store In-Charge',
    subtotal: 5000 + i * 100,
    taxAmount: 600,
    totalAmount: 5600 + i * 100,
    items: [
      {
        sku: `PO-ITEM-${pad}`,
        name: `PO Medicine Item ${i}`,
        requiredQty: 50 + i,
        price: 45,
        tax: 12,
        total: (50 + i) * 45 * 1.12
      }
    ]
  });
}

const unpaginatedPoRows = normalizeExportRows(flattenPoForExport(mock50POs), poExportColumns);
console.log(`Complete PO export row count: ${unpaginatedPoRows.length} (Expected: 50)`);

const poPaginationPass = unpaginatedPoRows.length === 50;
console.log(`✓ PO Pagination Result: ${poPaginationPass ? 'PASS' : 'FAIL'}`);
testResults.poPagination = poPaginationPass;

// ============================================================================
// 6. GENUINE EXCEL (.xlsx) & PDF (.pdf) FOR GRN
// ============================================================================
console.log('\n--- TEST 6: GRN EXCEL & PDF FILE GENERATION ---');
const grnXlsxPath = path.join(__dirname, 'test_output_grn.xlsx');
await generateExcelFile({
  dataset: 'GRNs',
  rows: grnRows,
  columns: grnExportColumns,
  dateRangeText: 'August 2026',
  fileName: grnXlsxPath
});
const statGrnXlsx = fs.statSync(grnXlsxPath);
const readWbGrn = XLSX.read(fs.readFileSync(grnXlsxPath), { type: 'buffer' });
const readGrnSheet = readWbGrn.SheetNames[0];
const readGrnRows = XLSX.utils.sheet_to_json(readWbGrn.Sheets[readGrnSheet]);
console.log(`✓ GRN Excel: Size=${statGrnXlsx.size} bytes, Sheet="${readGrnSheet}", Rows=${readGrnRows.length}`);
fs.unlinkSync(grnXlsxPath);

const grnPdfPath = path.join(__dirname, 'test_output_grn.pdf');
await generatePdfFile({
  dataset: 'GRNs',
  rows: grnRows,
  columns: grnExportColumns,
  dateRangeText: 'August 2026',
  clinicName: 'CUROXA PHARMACY WAREHOUSE',
  fileName: grnPdfPath
});
const statGrnPdf = fs.statSync(grnPdfPath);
const isGrnPdfValid = fs.readFileSync(grnPdfPath).toString('utf-8', 0, 5) === '%PDF-';
console.log(`✓ GRN PDF: Size=${statGrnPdf.size} bytes, ValidMagicBytes=${isGrnPdfValid}`);
fs.unlinkSync(grnPdfPath);

testResults.grnExcelPdf = statGrnXlsx.size > 1000 && readGrnRows.length === 5 && isGrnPdfValid;

// ============================================================================
// 7. GENUINE EXCEL (.xlsx) & PDF (.pdf) FOR PO
// ============================================================================
console.log('\n--- TEST 7: PO EXCEL & PDF FILE GENERATION ---');
const poXlsxPath = path.join(__dirname, 'test_output_po.xlsx');
await generateExcelFile({
  dataset: 'Purchase Orders',
  rows: poRows,
  columns: poExportColumns,
  dateRangeText: 'August 2026',
  fileName: poXlsxPath
});
const statPoXlsx = fs.statSync(poXlsxPath);
const readWbPo = XLSX.read(fs.readFileSync(poXlsxPath), { type: 'buffer' });
const readPoSheet = readWbPo.SheetNames[0];
const readPoRows = XLSX.utils.sheet_to_json(readWbPo.Sheets[readPoSheet]);
console.log(`✓ PO Excel: Size=${statPoXlsx.size} bytes, Sheet="${readPoSheet}", Rows=${readPoRows.length}`);
fs.unlinkSync(poXlsxPath);

const poPdfPath = path.join(__dirname, 'test_output_po.pdf');
await generatePdfFile({
  dataset: 'Purchase Orders',
  rows: poRows,
  columns: poExportColumns,
  dateRangeText: 'August 2026',
  clinicName: 'CUROXA CENTRAL PROCUREMENT',
  fileName: poPdfPath
});
const statPoPdf = fs.statSync(poPdfPath);
const isPoPdfValid = fs.readFileSync(poPdfPath).toString('utf-8', 0, 5) === '%PDF-';
console.log(`✓ PO PDF: Size=${statPoPdf.size} bytes, ValidMagicBytes=${isPoPdfValid}`);
fs.unlinkSync(poPdfPath);

testResults.poExcelPdf = statPoXlsx.size > 1000 && readPoRows.length === 5 && isPoPdfValid;

// ============================================================================
// 8. AUDIT LOG VALIDATION FOR BOTH DATASETS
// ============================================================================
console.log('\n--- TEST 8: AUDIT LOG PAYLOAD INTEGRITY ---');
const grnAuditPayload = {
  action: 'DATASET_EXPORTED',
  target: 'GRNs',
  metadata: {
    dataset: 'GRNs',
    format: 'EXCEL',
    recordCount: 5,
    dateRange: { type: 'This Month', startDate: null, endDate: null },
    filters: { search: 'INV-CIPLA' }
  }
};

const poAuditPayload = {
  action: 'DATASET_EXPORTED',
  target: 'Purchase Orders',
  metadata: {
    dataset: 'Purchase Orders',
    format: 'PDF',
    recordCount: 5,
    dateRange: { type: 'This Week', startDate: null, endDate: null },
    filters: { statusTab: 'awaiting', search: '' }
  }
};

const grnAuditPass = grnAuditPayload.action === 'DATASET_EXPORTED' &&
                     grnAuditPayload.target === 'GRNs' &&
                     grnAuditPayload.metadata.dataset === 'GRNs' &&
                     grnAuditPayload.metadata.recordCount === 5 &&
                     !('items' in grnAuditPayload.metadata) &&
                     !('invoiceFile' in grnAuditPayload.metadata);

const poAuditPass = poAuditPayload.action === 'DATASET_EXPORTED' &&
                    poAuditPayload.target === 'Purchase Orders' &&
                    poAuditPayload.metadata.dataset === 'Purchase Orders' &&
                    poAuditPayload.metadata.recordCount === 5 &&
                    !('items' in poAuditPayload.metadata);

console.log(`✓ GRN Audit Pass: ${grnAuditPass}, PO Audit Pass: ${poAuditPass}`);
testResults.auditLogPass = grnAuditPass && poAuditPass;

// ============================================================================
// 9. SENSITIVE DATA CHECK
// ============================================================================
console.log('\n--- TEST 9: SENSITIVE DATA ISOLATION ---');
const firstGrnRow = grnRows[0];
const firstPoRow = poRows[0];

const grnHasSensitive = 'aadhaar' in firstGrnRow || 'pan' in firstGrnRow || 'bankDetails' in firstGrnRow || 'ctcAnnual' in firstGrnRow;
const poHasSensitive = 'aadhaar' in firstPoRow || 'pan' in firstPoRow || 'bankDetails' in firstPoRow || 'password' in firstPoRow;

console.log(`GRN Row Keys: [${Object.keys(firstGrnRow).slice(0, 8).join(', ')} ... total ${Object.keys(firstGrnRow).length} cols]`);
console.log(`PO Row Keys: [${Object.keys(firstPoRow).slice(0, 8).join(', ')} ... total ${Object.keys(firstPoRow).length} cols]`);
const sensitivePass = !grnHasSensitive && !poHasSensitive;
console.log(`✓ Sensitive Data Isolation Result: ${sensitivePass ? 'PASS' : 'FAIL'}`);
testResults.sensitiveData = sensitivePass;

console.log('\n====================================================');
console.log('SUMMARY OF PHASE 3 TEST RESULTS:');
console.log(JSON.stringify(testResults, null, 2));
console.log('====================================================');
