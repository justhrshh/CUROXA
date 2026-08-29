import * as XLSX from 'xlsx';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import {
  normalizeExportRows,
  generateExcelFile,
  generatePdfFile,
  grnExportColumns,
  flattenGrnForExport
} from './src/utils/exportEngine.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('====================================================');
console.log('CUROXA — GRN STRUCTURED PDF & EXCEL VERIFICATION');
console.log('====================================================\n');

// Mock multiple GRNs with multi-item data
const testGrns = [
  {
    _id: 'grn_001_id',
    grnId: 'GRN-001',
    poNumber: 'PO-2026-001',
    poDate: '2026-08-15',
    receivedDate: '2026-08-20T10:00:00.000Z',
    grnLocation: 'Main Pharmacy Store',
    vendorName: 'Cipla Healthcare Ltd',
    vendorCode: 'VND-CIPLA',
    status: 'Verified/Completed',
    receivedBy: 'Dr. Ramesh Nair (Chief Pharmacist)',
    invoiceNumber: 'INV-CIPLA-8821',
    invoiceDate: '2026-08-18',
    invoiceAmount: 18500,
    invoiceUrl: 'https://curoxa.storage/invoices/inv-8821.pdf',
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
        mfgDate: '2026-01-10',
        expiryDate: '2028-01-10',
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
        mfgDate: '2026-02-15',
        expiryDate: '2028-02-15',
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
    poDate: '2026-08-16',
    receivedDate: '2026-08-22T11:30:00.000Z',
    grnLocation: 'Emergency Pharmacy Sub-Store',
    vendorName: 'Sun Pharma Distributors',
    vendorCode: 'VND-SUN',
    status: 'Verified/Completed',
    receivedBy: 'Priya Sharma (Store Pharmacist)',
    invoiceNumber: 'INV-SUN-1002',
    invoiceDate: '2026-08-21',
    invoiceAmount: 9400,
    invoiceUrl: 'https://curoxa.storage/invoices/inv-1002.pdf',
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
        mfgDate: '2026-03-01',
        expiryDate: '2028-03-01',
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
        mfgDate: '2026-03-05',
        expiryDate: '2028-03-05',
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
        mfgDate: '2026-01-20',
        expiryDate: '2029-01-20',
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
  },
  {
    _id: 'grn_003_id',
    grnId: 'GRN-003',
    poNumber: 'Direct Purchase',
    poDate: null,
    receivedDate: '2026-08-25T14:00:00.000Z',
    grnLocation: 'Main Pharmacy Store',
    vendorName: 'Local Medical Surgical',
    vendorCode: 'VND-LOCAL',
    status: 'Verified/Completed',
    receivedBy: 'Store In-Charge',
    invoiceNumber: 'INV-DIR-505',
    invoiceDate: '2026-08-25',
    invoiceAmount: 3500,
    invoiceUrl: '',
    totalDiscount: 100,
    totalGst: 420,
    grandTotal: 3500,
    items: [
      {
        itemType: 'Consumable',
        sku: 'CON-COTTON-500G',
        itemCode: 'COTTON-500G',
        name: 'Absorbent Cotton Roll 500g',
        unit: 'Roll',
        barcode: '8901234567895',
        batchNumber: 'B-COT-881',
        mfgDate: '2026-02-01',
        expiryDate: '2030-02-01',
        qtyOrdered: 20,
        previouslyReceivedQty: 0,
        remainingQty: 0,
        qtyReceived: 20,
        rejectedQty: 0,
        rejectionReason: '',
        purchaseRate: 175,
        discountPercent: 0,
        discountAmount: 0,
        gst: 12,
        gstAmount: 420,
        buyPrice: 175,
        netAmount: 3500
      }
    ]
  }
];

// 1. Flatten GRN data
console.log('--- TEST 1: FLATTENING & LINE ITEM PRESERVATION ---');
const flatRows = flattenGrnForExport(testGrns);
const normalizedRows = normalizeExportRows(flatRows, grnExportColumns);
console.log(`Total flattened line items: ${normalizedRows.length} (Expected: 6 = 2 + 3 + 1)`);

const grn1Rows = normalizedRows.filter(r => r['GRN ID'] === 'GRN-001');
const grn2Rows = normalizedRows.filter(r => r['GRN ID'] === 'GRN-002');
const grn3Rows = normalizedRows.filter(r => r['GRN ID'] === 'GRN-003');

console.log(`GRN-001 rows: ${grn1Rows.length} (Expected: 2)`);
console.log(`GRN-002 rows: ${grn2Rows.length} (Expected: 3)`);
console.log(`GRN-003 rows: ${grn3Rows.length} (Expected: 1)`);

const test1Pass = normalizedRows.length === 6 && grn1Rows.length === 2 && grn2Rows.length === 3 && grn3Rows.length === 1;
console.log(`✓ Line item preservation: ${test1Pass ? 'PASS' : 'FAIL'}`);

// 2. Field Coverage Verification
console.log('\n--- TEST 2: ALL REQUIRED GRN FIELDS VERIFICATION ---');
const sampleRow = grn1Rows[0];
const requiredFields = [
  'GRN ID', 'GRN Date', 'GRN Location', 'Status', 'Received By',
  'PO Number', 'PO Date', 'Vendor', 'Vendor Code',
  'Item Type', 'Item SKU / Code', 'Item Name', 'Purchased Unit', 'Barcode', 'Batch Number', 'Mfg Date', 'Expiry Date',
  'PO Quantity', 'Previously Received', 'Remaining Quantity', 'Received Quantity', 'Rejected Quantity', 'Rejection Reason',
  'Purchase Rate', 'Discount %', 'Discount Amount', 'GST %', 'GST Amount', 'Buy Price', 'Net Amount',
  'Invoice Number', 'Invoice Date', 'Invoice Amount', 'Invoice Attachment Ref',
  'Total Discount', 'Total GST', 'Grand Total'
];

const missingFields = requiredFields.filter(f => !(f in sampleRow));
console.log(`Verified total fields in row: ${Object.keys(sampleRow).length}`);
if (missingFields.length > 0) {
  console.error('Missing fields:', missingFields);
} else {
  console.log('✓ All 37 required GRN fields are present in exported row!');
}
const test2Pass = missingFields.length === 0;

// 3. Structured Multi-Page PDF Generation Test
console.log('\n--- TEST 3: STRUCTURED MULTI-PAGE PDF GENERATION ---');
const pdfOutPath = path.join(__dirname, 'test_output_grn_structured.pdf');
await generatePdfFile({
  dataset: 'GRNs',
  rows: normalizedRows,
  columns: grnExportColumns,
  dateRangeText: 'August 2026',
  clinicName: 'CUROXA CENTRAL WAREHOUSE',
  fileName: pdfOutPath
});

const pdfBuffer = fs.readFileSync(pdfOutPath);
const isValidPdf = pdfBuffer.toString('utf-8', 0, 5) === '%PDF-';
console.log(`Generated PDF size: ${pdfBuffer.length} bytes, ValidMagicBytes: ${isValidPdf}`);
fs.unlinkSync(pdfOutPath);

const test3Pass = isValidPdf && pdfBuffer.length > 30000;
console.log(`✓ Structured Multi-Page PDF Generation: ${test3Pass ? 'PASS' : 'FAIL'}`);

// 4. Excel Generation Test (Wide Tabular Format Retained)
console.log('\n--- TEST 4: EXCEL WIDE TABULAR EXPORT ---');
const xlsxOutPath = path.join(__dirname, 'test_output_grn_full.xlsx');
await generateExcelFile({
  dataset: 'GRNs',
  rows: normalizedRows,
  columns: grnExportColumns,
  dateRangeText: 'August 2026',
  fileName: xlsxOutPath
});

const wb = XLSX.read(fs.readFileSync(xlsxOutPath), { type: 'buffer' });
const sheetName = wb.SheetNames[0];
const xlsxRows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName]);
console.log(`Generated Excel sheet "${sheetName}" with ${xlsxRows.length} rows and ${Object.keys(xlsxRows[0]).length} columns`);
fs.unlinkSync(xlsxOutPath);

const test4Pass = xlsxRows.length === 6 && Object.keys(xlsxRows[0]).length >= 35;
console.log(`✓ Excel Wide Tabular Format: ${test4Pass ? 'PASS' : 'FAIL'}`);

// 5. Metadata Count Calculation Test
console.log('\n--- TEST 5: METADATA COUNT ACCURACY (MODAL LOGIC) ---');
const uniqueGrns = new Set();
let lineItemsCount = 0;
normalizedRows.forEach(r => {
  if (r['GRN ID']) uniqueGrns.add(r['GRN ID']);
  if (r['Item Name'] || r['Item SKU / Code']) lineItemsCount++;
});

console.log(`Calculated unique GRNs: ${uniqueGrns.size} (Expected: 3)`);
console.log(`Calculated total line items: ${lineItemsCount} (Expected: 6)`);
const test5Pass = uniqueGrns.size === 3 && lineItemsCount === 6;
console.log(`✓ Metadata Count Calculation: ${test5Pass ? 'PASS' : 'FAIL'}`);

console.log('\n====================================================');
console.log('SUMMARY OF GRN PDF & EXCEL TEST RESULTS:');
console.log(JSON.stringify({
  lineItemPreservation: test1Pass,
  allFieldsPresent: test2Pass,
  structuredPdfGeneration: test3Pass,
  excelWideTabular: test4Pass,
  metadataCountAccuracy: test5Pass
}, null, 2));
console.log('====================================================');
