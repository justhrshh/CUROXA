import * as XLSX from 'xlsx';
import * as jsPDFModule from 'jspdf';
const jsPDF = jsPDFModule.jsPDF || jsPDFModule.default || jsPDFModule;
import autoTable from 'jspdf-autotable';
import api from './api.js';
import { convertPdfToImage } from './pdfHelper.js';

/**
 * Letterhead cache to eliminate duplicate network overhead during multi-export sessions.
 */
let cachedLetterheadConfig = null;
let lastLetterheadFetchTime = 0;

/**
 * Authoritative letterhead loader. Fetches active clinic letterhead image and standard template margins.
 * Multi-tenant safe: uses caller's authenticated session / tenant token.
 */
export async function fetchLetterheadConfig(forceRefresh = false) {
  const now = Date.now();
  if (!forceRefresh && cachedLetterheadConfig && (now - lastLetterheadFetchTime < 60000)) {
    return cachedLetterheadConfig;
  }

  try {
    const res = await api.get('/admin/letterhead');
    const letterheadUrl = res.data?.letterheadUrl || '';
    const templates = res.data?.prescriptionTemplates || [];
    const activeTemplate = templates.find(t => t.isStandard) || templates[0] || null;

    let letterheadImg = null;
    if (letterheadUrl) {
      if (typeof window !== 'undefined' && typeof window.document !== 'undefined') {
        letterheadImg = await convertPdfToImage(letterheadUrl);
      } else {
        letterheadImg = letterheadUrl;
      }
    }

    const config = {
      hasLetterhead: !!letterheadImg,
      letterheadImg,
      activeTemplate,
      activeTemplateName: activeTemplate?.name || (letterheadImg ? 'Standard Letterhead' : null),
      margins: {
        left: Number(activeTemplate?.xLeft) || (letterheadImg ? 15 : 14),
        right: Number(activeTemplate?.xRight) || (letterheadImg ? 15 : 14),
        top: Number(activeTemplate?.yTop) || (letterheadImg ? 38 : 14),
        bottom: Number(activeTemplate?.yBottom) || (letterheadImg ? 28 : 16)
      }
    };

    cachedLetterheadConfig = config;
    lastLetterheadFetchTime = now;
    return config;
  } catch (err) {
    console.warn('[EXPORT ENGINE] Letterhead config fetch fallback:', err.message);
    const fallback = {
      hasLetterhead: false,
      letterheadImg: null,
      activeTemplate: null,
      activeTemplateName: null,
      margins: { left: 14, right: 14, top: 14, bottom: 16 }
    };
    cachedLetterheadConfig = fallback;
    lastLetterheadFetchTime = now;
    return fallback;
  }
}

/**
 * Resolves a date range into start and end Date objects.
 * Supported range types: 'Today', 'This Week', 'This Month', 'Custom Range'.
 * Default: 'Today'.
 */
export function resolveDateBounds(dateRange = {}) {
  const now = new Date();
  const rangeType = dateRange.type || 'Today';

  let startDate = null;
  let endDate = null;

  if (rangeType === 'Today') {
    startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
    endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
  } else if (rangeType === 'This Week') {
    // Current calendar week (Monday to Sunday)
    const day = now.getDay();
    const diffToMonday = (day === 0 ? -6 : 1) - day;
    startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() + diffToMonday, 0, 0, 0, 0);
    endDate = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate() + 6, 23, 59, 59, 999);
  } else if (rangeType === 'This Month') {
    startDate = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
    endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
  } else if (rangeType === 'All Time') {
    startDate = new Date(0);
    endDate = new Date(now.getFullYear() + 20, 11, 31, 23, 59, 59, 999);
  } else if (rangeType === 'Custom Range') {
    if (!dateRange.startDate || !dateRange.endDate) {
      throw new Error('Please specify both Start Date and End Date for Custom Range.');
    }
    startDate = new Date(dateRange.startDate);
    startDate.setHours(0, 0, 0, 0);

    endDate = new Date(dateRange.endDate);
    endDate.setHours(23, 59, 59, 999);

    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      throw new Error('Invalid custom date range provided.');
    }
    if (startDate > endDate) {
      throw new Error('Start Date cannot be after End Date.');
    }
  } else {
    // Default fallback to Today
    startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
    endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
  }

  return { startDate, endDate, rangeType };
}

/**
 * Extracts a Date object from a record using the specified date field(s).
 * Handles Date objects, ISO strings, timestamps, and multi-field fallbacks (e.g. ['receivedDate', 'grnDate', 'createdAt']).
 */
export function extractRecordDate(record, dateField) {
  if (!record || !dateField) return null;

  let rawVal = null;
  if (Array.isArray(dateField)) {
    for (const field of dateField) {
      if (record[field] !== undefined && record[field] !== null && record[field] !== '') {
        rawVal = record[field];
        break;
      }
    }
  } else if (typeof dateField === 'function') {
    rawVal = dateField(record);
  } else if (typeof dateField === 'string') {
    // Check nested keys e.g. "meta.date"
    if (dateField.includes('.')) {
      rawVal = dateField.split('.').reduce((acc, part) => (acc ? acc[part] : null), record);
    } else {
      rawVal = record[dateField];
    }
  }

  if (!rawVal) return null;
  if (rawVal instanceof Date) return isNaN(rawVal.getTime()) ? null : rawVal;

  const parsed = new Date(rawVal);
  return isNaN(parsed.getTime()) ? null : parsed;
}

/**
 * Filters a dataset by date bounds using the authoritative date field.
 */
export function filterDataByDate(data = [], dateField, dateRange = {}) {
  if (!Array.isArray(data)) return [];
  if (!dateField || dateField === 'none' || dateRange?.type === 'Current Snapshot' || dateRange?.type === 'All Time') {
    return data;
  }
  const { startDate, endDate } = resolveDateBounds(dateRange);

  return data.filter(record => {
    const recordDate = extractRecordDate(record, dateField);
    if (!recordDate) {
      // If no valid date exists on the record, omit from date-filtered export
      return false;
    }
    return recordDate >= startDate && recordDate <= endDate;
  });
}

/**
 * Resolves a nested value from an object using a dot-delimited key path.
 */
function getNestedValue(obj, key) {
  if (!obj || !key) return '';
  if (!key.includes('.')) return obj[key];
  return key.split('.').reduce((acc, part) => (acc && acc[part] !== undefined ? acc[part] : ''), obj);
}

/**
 * Extracts only the explicitly declared columns from records.
 * STRICT SAFEGUARD: Never leaks unlisted sensitive fields (Aadhaar, PAN, Bank Details, etc.).
 */
export function normalizeExportRows(data = [], columns = []) {
  if (!Array.isArray(data) || !Array.isArray(columns)) return [];

  return data.map(record => {
    const rowObj = {};
    columns.forEach(col => {
      let val;
      if (typeof col.extractor === 'function') {
        val = col.extractor(record);
      } else {
        val = getNestedValue(record, col.key);
      }

      if (typeof col.formatter === 'function') {
        val = col.formatter(val, record);
      }

      if (val === null || val === undefined) {
        val = '';
      }

      // Convert Date objects to clean readable string
      if (val instanceof Date) {
        val = val.toLocaleDateString('en-IN', {
          day: '2-digit',
          month: 'short',
          year: 'numeric'
        });
      }

      rowObj[col.header || col.key] = val;
    });
    return rowObj;
  });
}

/**
 * Generates a genuine .xlsx workbook and triggers download.
 */
export async function generateExcelFile({ dataset, rows, columns, dateRangeText, fileName }) {
  const headers = columns.map(c => c.header || c.key);
  const dataAoa = [
    headers,
    ...rows.map(row => headers.map(h => row[h] !== undefined ? row[h] : ''))
  ];

  const worksheet = XLSX.utils.aoa_to_sheet(dataAoa);

  // Auto-fit column widths based on maximum string length
  const colWidths = headers.map((header) => {
    let maxLen = header.length;
    rows.forEach(r => {
      const cellVal = String(r[header] || '');
      if (cellVal.length > maxLen) {
        maxLen = cellVal.length;
      }
    });
    return { wch: Math.min(Math.max(maxLen + 4, 12), 45) };
  });
  worksheet['!cols'] = colWidths;

  const workbook = XLSX.utils.book_new();
  const safeSheetName = (dataset || 'Export').substring(0, 31).replace(/[\\/?*[\]]/g, '');
  XLSX.utils.book_append_sheet(workbook, worksheet, safeSheetName);

  if (typeof window !== 'undefined' && typeof window.document !== 'undefined') {
    // Browser environment: trigger standard blob download
    const wbout = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
    const blob = new Blob([wbout], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } else {
    // Node / test environment fallback
    try {
      const wbout = XLSX.write(workbook, { bookType: 'xlsx', type: 'buffer' });
      const fsMod = 'node:fs';
      const fs = await import(/* @vite-ignore */ fsMod);
      fs.writeFileSync(fileName, wbout);
    } catch (err) {
      console.warn('[EXPORT ENGINE] Node file write fallback warning:', err.message);
    }
  }
}

/**
 * Generates a clean, UTF-8 encoded comma-separated CSV file and triggers download.
 * Properly quotes and escapes fields containing commas, double quotes, and line breaks.
 */
export async function generateCsvFile({ dataset, rows, columns, fileName }) {
  const headers = columns.map(c => c.header || c.key);
  const escapeCsv = (val) => {
    if (val === null || val === undefined) return '';
    const str = String(val);
    if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const csvRows = [
    headers.map(escapeCsv).join(','),
    ...rows.map(row => headers.map(h => escapeCsv(row[h] !== undefined ? row[h] : '')).join(','))
  ];
  const csvContent = csvRows.join('\r\n');

  if (typeof window !== 'undefined' && typeof window.document !== 'undefined') {
    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } else {
    try {
      const fsMod = 'node:fs';
      const fs = await import(/* @vite-ignore */ fsMod);
      fs.writeFileSync(fileName, '\uFEFF' + csvContent, 'utf-8');
    } catch (err) {
      console.warn('[EXPORT ENGINE] Node CSV write fallback warning:', err.message);
    }
  }
}

/**
 * Renders a structured, multi-section hospital Goods Receipt Note (GRN) report.
 * Solves the wide-table horizontal overflow problem by generating structured cards
 * and dedicated, highly legible tables per GRN.
 * Letterhead-aware: renders letterhead background & respects custom safe margins.
 */
function renderGrnStructuredPdf(doc, rows, dateRangeText, clinicName, letterheadConfig) {
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  const hasLetterhead = letterheadConfig && letterheadConfig.hasLetterhead && !!letterheadConfig.letterheadImg;
  const margins = letterheadConfig?.margins || { left: 14, right: 14, top: 14, bottom: 16 };
  const safeLeft = margins.left;
  const safeRight = margins.right;
  const safeTop = margins.top;
  const safeBottom = margins.bottom;
  const safeWidth = pageWidth - safeLeft - safeRight;

  const drawLetterheadBg = () => {
    if (hasLetterhead && letterheadConfig.letterheadImg) {
      try {
        doc.addImage(letterheadConfig.letterheadImg, 'JPEG', 0, 0, pageWidth, pageHeight);
      } catch {
        try {
          doc.addImage(letterheadConfig.letterheadImg, 'PNG', 0, 0, pageWidth, pageHeight);
        } catch (imgErr) {
          console.warn('[EXPORT ENGINE] Failed to stamp GRN letterhead background:', imgErr.message);
        }
      }
    }
  };

  // Group items by unique GRN ID
  const grnGroups = {};
  const grnOrder = [];

  rows.forEach(r => {
    const grnId = r['GRN ID'] || r.grnId || 'GRN-UNKNOWN';
    if (!grnGroups[grnId]) {
      grnGroups[grnId] = [];
      grnOrder.push(grnId);
    }
    grnGroups[grnId].push(r);
  });

  grnOrder.forEach((grnId, grnIdx) => {
    if (grnIdx > 0) {
      doc.addPage();
    }

    if (hasLetterhead) {
      drawLetterheadBg();
    }

    const items = grnGroups[grnId];
    const first = items[0] || {};

    let currentY = safeTop;

    if (hasLetterhead) {
      // Clean header within safe area
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(12);
      doc.setTextColor(15, 23, 42); // Slate 900
      doc.text(`GOODS RECEIPT NOTE (GRN) — ${grnId}`, safeLeft, currentY + 4);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(71, 85, 105);
      doc.text(`Stock Intake Report  |  Date Range: ${dateRangeText}`, safeLeft, currentY + 9);
      doc.text(`Clinic: ${clinicName || 'CUROXA HEALTHCARE'}`, pageWidth - safeRight, currentY + 9, { align: 'right' });

      currentY += 13;
    } else {
      // Fallback Hospital Header Banner
      doc.setFillColor(37, 99, 235); // Royal Blue
      doc.rect(0, 0, pageWidth, 20, 'F');

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(13);
      doc.setTextColor(255, 255, 255);
      doc.text(clinicName || 'CUROXA HEALTHCARE', 14, 9);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      doc.setTextColor(219, 234, 254);
      doc.text('Goods Receipt Note (GRN) — Verified Stock Intake Report', 14, 15);

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.setTextColor(255, 255, 255);
      doc.text(`GRN Number: ${grnId}`, pageWidth - 14, 12, { align: 'right' });

      currentY = 23;
    }

    // Structured Metadata Card (GRN, PO, Supplier, Invoice)
    doc.setFillColor(248, 250, 252); // #F8FAFC
    doc.setDrawColor(226, 232, 240); // #E2E8F0
    doc.roundedRect(safeLeft, currentY, safeWidth, 24, 2, 2, 'FD');

    // Section 1: GRN & PO (Left Column)
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(30, 41, 59);
    doc.text('GRN & PO INFORMATION', safeLeft + 4, currentY + 5.5);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(71, 85, 105);
    doc.text(`GRN Date: ${first['GRN Date'] || '--'}`, safeLeft + 4, currentY + 10.5);
    doc.text(`Location: ${first['GRN Location'] || 'Main Pharmacy Store'}`, safeLeft + 4, currentY + 15);
    doc.text(`Status: ${first['Status'] || 'Verified/Completed'}`, safeLeft + 4, currentY + 19.5);

    const col2X = safeLeft + (safeWidth * 0.28);
    doc.text(`PO Number: ${first['PO Number'] || 'Direct Purchase'}`, col2X, currentY + 10.5);
    doc.text(`PO Date: ${first['PO Date'] || '--'}`, col2X, currentY + 15);
    doc.text(`Received By: ${first['Received By'] || 'Store In-Charge'}`, col2X, currentY + 19.5);

    // Vertical Divider
    const dividerX = safeLeft + (safeWidth * 0.52);
    doc.setDrawColor(203, 213, 225);
    doc.line(dividerX, currentY + 2, dividerX, currentY + 22);

    // Section 2: Supplier & Invoice (Right Column)
    const col3X = dividerX + 5;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(30, 41, 59);
    doc.text('SUPPLIER & INVOICE DETAILS', col3X, currentY + 5.5);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(71, 85, 105);
    doc.text(`Vendor: ${first['Vendor'] || '--'}`, col3X, currentY + 10.5);
    doc.text(`Vendor Code: ${first['Vendor Code'] || '--'}`, col3X, currentY + 15);

    const col4X = safeLeft + (safeWidth * 0.76);
    doc.text(`Invoice No: ${first['Invoice Number'] || '--'}`, col4X, currentY + 10.5);
    doc.text(`Invoice Date: ${first['Invoice Date'] || '--'}`, col4X, currentY + 15);
    const invoiceAmtStr = first['Invoice Amount'] !== undefined && first['Invoice Amount'] !== '' ? Number(first['Invoice Amount'] || 0).toFixed(2) : '0.00';
    doc.text(`Invoice Amount: Rs. ${invoiceAmtStr}`, col4X, currentY + 19.5);

    currentY += 28;

    const printSectionHeading = (title, countText) => {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(30, 41, 59);
      doc.text(title, safeLeft, currentY + 3);
      if (countText) {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7);
        doc.setTextColor(100, 116, 139);
        doc.text(countText, pageWidth - safeRight, currentY + 3, { align: 'right' });
      }
      currentY += 5;
    };

    // 3. TABLE 1: ITEM & BATCH DETAILS
    printSectionHeading('1. RECEIVING & BATCH DETAILS', `${items.length} item(s)`);
    const batchBody = items.map((it, idx) => [
      idx + 1,
      it['Item Name'] || '--',
      it['Item SKU / Code'] || '--',
      it['Purchased Unit'] || 'Strip',
      it['Barcode'] || '--',
      it['Batch Number'] || '--',
      it['Mfg Date'] || '--',
      it['Expiry Date'] || '--'
    ]);

    autoTable(doc, {
      startY: currentY,
      head: [['#', 'Item Name', 'Item SKU / Code', 'Unit', 'Barcode', 'Batch No.', 'Mfg Date', 'Expiry Date']],
      body: batchBody,
      theme: 'grid',
      headStyles: {
        fillColor: [30, 41, 59], // Slate 800
        textColor: [255, 255, 255],
        fontSize: 7.5,
        fontStyle: 'bold',
        cellPadding: 1.8
      },
      bodyStyles: { fontSize: 7, textColor: [30, 41, 59], cellPadding: 1.8 },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      margin: { left: safeLeft, right: safeRight, top: safeTop, bottom: safeBottom },
      willDrawPage: (data) => {
        if (hasLetterhead && data.pageNumber > 1) {
          drawLetterheadBg();
        }
      }
    });

    currentY = doc.lastAutoTable.finalY + 4;

    // Check if new page is needed for Table 2
    if (currentY + 28 > pageHeight - safeBottom) {
      doc.addPage();
      if (hasLetterhead) drawLetterheadBg();
      currentY = safeTop + 2;
    }

    // 4. TABLE 2: QUANTITY RECONCILIATION
    printSectionHeading('2. QUANTITY RECONCILIATION');
    const qtyBody = items.map((it, idx) => [
      idx + 1,
      it['Item Name'] || '--',
      it['PO Quantity'] || '--',
      it['Previously Received'] || 0,
      it['Remaining Quantity'] || '--',
      it['Received Quantity'] || 0,
      it['Rejected Quantity'] || 0,
      it['Rejection Reason'] || '--'
    ]);

    autoTable(doc, {
      startY: currentY,
      head: [['#', 'Item Name', 'PO Qty', 'Prev Received', 'Remaining Qty', 'Received Qty', 'Rejected Qty', 'Rejection Reason']],
      body: qtyBody,
      theme: 'grid',
      headStyles: {
        fillColor: [51, 65, 85], // Slate 700
        textColor: [255, 255, 255],
        fontSize: 7.5,
        fontStyle: 'bold',
        cellPadding: 1.8
      },
      bodyStyles: { fontSize: 7, textColor: [30, 41, 59], cellPadding: 1.8 },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      margin: { left: safeLeft, right: safeRight, top: safeTop, bottom: safeBottom },
      willDrawPage: (data) => {
        if (hasLetterhead && data.pageNumber > 1) {
          drawLetterheadBg();
        }
      }
    });

    currentY = doc.lastAutoTable.finalY + 4;

    // Check if new page is needed for Table 3
    if (currentY + 28 > pageHeight - safeBottom) {
      doc.addPage();
      if (hasLetterhead) drawLetterheadBg();
      currentY = safeTop + 2;
    }

    // 5. TABLE 3: FINANCIAL DETAILS
    printSectionHeading('3. FINANCIAL DETAILS');
    const finBody = items.map((it, idx) => [
      idx + 1,
      it['Item Name'] || '--',
      it['Purchase Rate'] || '0.00',
      it['Discount %'] ? `${it['Discount %']}%` : '0%',
      it['Discount Amount'] || '0.00',
      it['GST %'] ? `${it['GST %']}%` : '0%',
      it['GST Amount'] || '0.00',
      it['Buy Price'] || '0.00',
      it['Net Amount'] || '0.00'
    ]);

    autoTable(doc, {
      startY: currentY,
      head: [['#', 'Item Name', 'Rate (Rs)', 'Disc %', 'Disc Amt (Rs)', 'GST %', 'GST Amt (Rs)', 'Buy Price (Rs)', 'Net Amt (Rs)']],
      body: finBody,
      theme: 'grid',
      headStyles: {
        fillColor: [15, 23, 42], // Slate 900
        textColor: [255, 255, 255],
        fontSize: 7.5,
        fontStyle: 'bold',
        cellPadding: 1.8
      },
      bodyStyles: { fontSize: 7, textColor: [30, 41, 59], cellPadding: 1.8 },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      margin: { left: safeLeft, right: safeRight, top: safeTop, bottom: safeBottom },
      willDrawPage: (data) => {
        if (hasLetterhead && data.pageNumber > 1) {
          drawLetterheadBg();
        }
      }
    });

    currentY = doc.lastAutoTable.finalY + 4;

    // Check if summary box fits
    if (currentY + 16 > pageHeight - safeBottom) {
      doc.addPage();
      if (hasLetterhead) drawLetterheadBg();
      currentY = safeTop + 2;
    }

    // 6. TOTALS & INVOICE RECONCILIATION SUMMARY BOX
    doc.setFillColor(241, 245, 249); // #F1F5F9 Slate 100
    doc.setDrawColor(203, 213, 225); // #CBD5E1 Slate 300
    doc.roundedRect(safeLeft, currentY, safeWidth, 13, 2, 2, 'FD');

    const totalDiscStr = first['Total Discount'] !== undefined && first['Total Discount'] !== '' ? Number(first['Total Discount'] || 0).toFixed(2) : '0.00';
    const totalGstStr = first['Total GST'] !== undefined && first['Total GST'] !== '' ? Number(first['Total GST'] || 0).toFixed(2) : '0.00';
    const grandTotalStr = first['Grand Total'] !== undefined && first['Grand Total'] !== '' ? Number(first['Grand Total'] || 0).toFixed(2) : '0.00';

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(71, 85, 105);
    doc.text(`Total Discount: Rs. ${totalDiscStr}`, safeLeft + 4, currentY + 5);
    doc.text(`Total GST: Rs. ${totalGstStr}`, safeLeft + (safeWidth * 0.32), currentY + 5);
    doc.text(`Invoice Ref: ${first['Invoice Number'] || '--'} (Rs. ${invoiceAmtStr})`, safeLeft + (safeWidth * 0.58), currentY + 5);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(30, 64, 175); // Dark Blue
    doc.text(`GRN Grand Total: Rs. ${grandTotalStr}`, pageWidth - safeRight - 4, currentY + 9, { align: 'right' });
  });

  // 7. Stamp Page Footers on all pages
  const totalPages = doc.internal.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(148, 163, 184); // #94A3B8
    const footerY = pageHeight - Math.max(safeBottom - 8, 5);
    doc.text(`Page ${i} of ${totalPages}`, pageWidth / 2, footerY, { align: 'center' });
    doc.text('CUROXA HEALTHCARE — Confidential Authorized Hospital Document', safeLeft, footerY);
    doc.text(`Date Range: ${dateRangeText}`, pageWidth - safeRight, footerY, { align: 'right' });
  }
}

/**
 * Renders structured Prescription Multi-Page Report.
 * Groups prescribed medicines under their respective prescription header blocks.
 * Letterhead-aware: renders letterhead background & respects custom safe margins.
 */
export function renderPrescriptionStructuredPdf(doc, rows = [], dateRangeText, clinicName, letterheadConfig) {
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  const hasLetterhead = letterheadConfig && letterheadConfig.hasLetterhead && !!letterheadConfig.letterheadImg;
  const margins = letterheadConfig?.margins || { left: 14, right: 14, top: 14, bottom: 16 };
  const safeLeft = margins.left;
  const safeRight = margins.right;
  const safeTop = margins.top;
  const safeBottom = margins.bottom;
  const safeWidth = pageWidth - safeLeft - safeRight;

  const drawLetterheadBg = () => {
    if (hasLetterhead && letterheadConfig.letterheadImg) {
      try {
        doc.addImage(letterheadConfig.letterheadImg, 'JPEG', 0, 0, pageWidth, pageHeight);
      } catch {
        try {
          doc.addImage(letterheadConfig.letterheadImg, 'PNG', 0, 0, pageWidth, pageHeight);
        } catch (imgErr) {
          console.warn('[EXPORT ENGINE] Failed to stamp Prescription letterhead background:', imgErr.message);
        }
      }
    }
  };

  // Group flattened rows by Prescription ID
  const rxGroups = {};
  rows.forEach(r => {
    const rxId = r['Prescription ID'] || r.prescriptionId || 'UNKNOWN';
    if (!rxGroups[rxId]) {
      rxGroups[rxId] = {
        prescriptionId: rxId,
        date: r['Prescription Date'] || (r.createdAt ? new Date(r.createdAt).toLocaleDateString('en-IN') : '--'),
        status: r['Status'] || r.status || 'Pending',
        patientId: r['Patient ID'] || r.patientId || '--',
        patientName: r['Patient Name'] || r.patientName || '--',
        doctorName: r['Doctor Name'] || r.doctorName || '--',
        department: r['Department / Specialty'] || r.department || 'General',
        items: []
      };
    }
    rxGroups[rxId].items.push({
      medicine: r['Medicine Name'] || r.item?.medicine || '--',
      dosage: r['Dosage'] || r.item?.dosage || '--',
      duration: r['Duration'] || r.item?.duration || '--',
      quantity: r['Quantity'] ?? r.item?.quantity ?? 1,
      instructions: r['Instructions'] || r.item?.instructions || '--'
    });
  });

  const rxList = Object.values(rxGroups);
  const totalMedicines = rows.length;

  let currentY = safeTop;

  const drawPageHeader = (isFirstPage = false) => {
    if (hasLetterhead) {
      drawLetterheadBg();
      if (isFirstPage) {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(12);
        doc.setTextColor(15, 23, 42);
        doc.text('OFFICIAL DATA EXPORT — PRESCRIPTIONS', safeLeft, safeTop + 4);

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7.5);
        doc.setTextColor(71, 85, 105);
        const generatedOn = `Generated: ${new Date().toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}`;
        doc.text(`${generatedOn}  |  Date Range: ${dateRangeText}`, safeLeft, safeTop + 9);
        doc.text(`Prescriptions: ${rxList.length}  |  Medicine Lines: ${totalMedicines}`, pageWidth - safeRight, safeTop + 9, { align: 'right' });

        doc.setDrawColor(226, 232, 240);
        doc.setLineWidth(0.3);
        doc.line(safeLeft, safeTop + 12, pageWidth - safeRight, safeTop + 12);
        currentY = safeTop + 16;
      } else {
        currentY = safeTop + 2;
      }
    } else {
      doc.setFillColor(37, 99, 235); // #2563EB Royal Blue
      doc.rect(0, 0, pageWidth, 24, 'F');

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(13);
      doc.setTextColor(255, 255, 255);
      doc.text(clinicName || 'CUROXA HEALTHCARE', 14, 10);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      doc.setTextColor(219, 234, 254);
      doc.text('OFFICIAL DATA EXPORT — PRESCRIPTIONS', 14, 17);

      if (isFirstPage) {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        doc.setTextColor(71, 85, 105);
        const generatedOn = `Generated: ${new Date().toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}`;
        doc.text(generatedOn, 14, 30);
        doc.text(`Selected Date Range: ${dateRangeText}`, 14, 35);
        doc.text(`Prescriptions: ${rxList.length}  |  Medicine Lines: ${totalMedicines}`, pageWidth - 14, 30, { align: 'right' });
        currentY = 40;
      } else {
        currentY = 28;
      }
    }
  };

  drawPageHeader(true);

  rxList.forEach((rx, index) => {
    // Check if new page is needed before starting a prescription block
    if (currentY + 45 > pageHeight - safeBottom) {
      doc.addPage();
      drawPageHeader(false);
    }

    // Prescription Header Banner Card
    doc.setFillColor(241, 245, 249); // #F1F5F9 Slate 100
    doc.setDrawColor(203, 213, 225); // #CBD5E1 Slate 300
    doc.roundedRect(safeLeft, currentY, safeWidth, 15, 2, 2, 'FD');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(15, 23, 42); // Slate 900
    doc.text(`Prescription: ${rx.prescriptionId}`, safeLeft + 4, currentY + 5.5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(71, 85, 105);
    doc.text(`Date: ${rx.date}`, safeLeft + (safeWidth * 0.45), currentY + 5.5);
    doc.text(`Status: ${rx.status}`, pageWidth - safeRight - 4, currentY + 5.5, { align: 'right' });

    doc.setFont('helvetica', 'bold');
    doc.setTextColor(30, 41, 59);
    doc.text(`Patient: ${rx.patientName} (${rx.patientId})`, safeLeft + 4, currentY + 11);
    doc.text(`Doctor: ${rx.doctorName} [${rx.department}]`, safeLeft + (safeWidth * 0.55), currentY + 11);

    currentY += 17;

    // Prescribed Medicines Table
    const tableBody = rx.items.map((it, i) => [
      i + 1,
      it.medicine,
      it.dosage,
      it.duration,
      it.quantity,
      it.instructions
    ]);

    autoTable(doc, {
      startY: currentY,
      head: [['#', 'Medicine Name', 'Dosage', 'Duration', 'Qty', 'Instructions']],
      body: tableBody,
      theme: 'grid',
      headStyles: {
        fillColor: [30, 41, 59], // Slate 800
        textColor: [255, 255, 255],
        fontSize: 7.5,
        fontStyle: 'bold',
        cellPadding: 2
      },
      bodyStyles: {
        fontSize: 7,
        textColor: [30, 41, 59],
        cellPadding: 1.8
      },
      alternateRowStyles: {
        fillColor: [248, 250, 252]
      },
      columnStyles: {
        0: { cellWidth: 10, halign: 'center' },
        1: { cellWidth: safeWidth * 0.35 },
        2: { cellWidth: safeWidth * 0.18 },
        3: { cellWidth: safeWidth * 0.15 },
        4: { cellWidth: 14, halign: 'center' },
        5: { cellWidth: 'auto' }
      },
      margin: { left: safeLeft, right: safeRight, top: safeTop, bottom: safeBottom },
      willDrawPage: (data) => {
        if (hasLetterhead && data.pageNumber > 1) {
          drawLetterheadBg();
        }
      }
    });

    currentY = doc.lastAutoTable.finalY + 6;
  });

  // Footer page numbering on all pages
  const totalPages = doc.internal.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFontSize(7.5);
    doc.setTextColor(148, 163, 184);
    const footerY = pageHeight - Math.max(safeBottom - 8, 6);
    doc.text(`Page ${i} of ${totalPages}`, pageWidth / 2, footerY, { align: 'center' });
    doc.text('Confidential — Authorized Hospital Records', safeLeft, footerY);
  }
}

/**
 * Generates a polished PDF file using jsPDF and jspdf-autotable.
 * Supports structured reports for complex multi-section records (e.g. GRNs)
 * and generic tabular layouts for other datasets.
 * Automatically integrates active clinic letterhead and custom safe margins.
 */
export async function generatePdfFile({ dataset, rows, columns, dateRangeText, clinicName, fileName, letterheadConfig: passedConfig }) {
  const letterheadConfig = passedConfig || await fetchLetterheadConfig();
  const hasLetterhead = letterheadConfig && letterheadConfig.hasLetterhead && !!letterheadConfig.letterheadImg;
  const margins = letterheadConfig?.margins || { left: 14, right: 14, top: 14, bottom: 16 };

  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4'
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  const safeLeft = margins.left;
  const safeRight = margins.right;
  const safeTop = margins.top;
  const safeBottom = margins.bottom;

  const drawLetterheadBg = () => {
    if (hasLetterhead && letterheadConfig.letterheadImg) {
      try {
        doc.addImage(letterheadConfig.letterheadImg, 'JPEG', 0, 0, pageWidth, pageHeight);
      } catch {
        try {
          doc.addImage(letterheadConfig.letterheadImg, 'PNG', 0, 0, pageWidth, pageHeight);
        } catch (imgErr) {
          console.warn('[EXPORT ENGINE] Failed to render letterhead background on page:', imgErr.message);
        }
      }
    }
  };

  if (dataset === 'GRNs') {
    renderGrnStructuredPdf(doc, rows, dateRangeText, clinicName, letterheadConfig);
    doc.save(fileName);
    return;
  }
  if (dataset === 'Prescriptions') {
    renderPrescriptionStructuredPdf(doc, rows, dateRangeText, clinicName, letterheadConfig);
    doc.save(fileName);
    return;
  }

  // Draw Page 1 background
  if (hasLetterhead) {
    drawLetterheadBg();
  } else {
    // Fallback: Blue header banner
    doc.setFillColor(37, 99, 235); // #2563EB Curoxa Royal Blue
    doc.rect(0, 0, pageWidth, 24, 'F');

    // Clinic Brand
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.setTextColor(255, 255, 255);
    doc.text(clinicName || 'CUROXA HEALTHCARE', 14, 11);

    // Subtitle: Dataset Report
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(219, 234, 254); // #DBEAFE
    if (dataset === 'Inventory') {
      doc.text('Official Data Export — Inventory (Current Stock Snapshot)', 14, 18);
    } else {
      doc.text(`Official Data Export — ${dataset}`, 14, 18);
    }
  }

  let currentY = hasLetterhead ? (safeTop + 2) : 31;

  // Metadata & Title inside Safe Area
  if (hasLetterhead) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(15, 23, 42); // Slate 900
    const reportTitleText = dataset === 'Inventory' 
      ? 'OFFICIAL INVENTORY REPORT (CURRENT STOCK SNAPSHOT)' 
      : `OFFICIAL DATA EXPORT — ${dataset.toUpperCase()}`;
    doc.text(reportTitleText, safeLeft, currentY);

    currentY += 4.5;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(71, 85, 105); // Slate 600
    const generatedOnText = `Generated: ${new Date().toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}`;
    
    if (dataset === 'Inventory') {
      const inStock = rows.filter(r => r['Stock Status'] === 'In Stock').length;
      const lowStock = rows.filter(r => r['Stock Status'] === 'Low Stock').length;
      const outOfStock = rows.filter(r => r['Stock Status'] === 'Out of Stock').length;
      doc.text(`${generatedOnText}  |  Date Range: ${dateRangeText}`, safeLeft, currentY);
      doc.text(`Total Items: ${rows.length}  (In Stock: ${inStock}, Low: ${lowStock}, Out: ${outOfStock})`, pageWidth - safeRight, currentY, { align: 'right' });
    } else {
      doc.text(`${generatedOnText}  |  Date Range: ${dateRangeText}`, safeLeft, currentY);
      doc.text(`Total Records: ${rows.length}`, pageWidth - safeRight, currentY, { align: 'right' });
    }

    currentY += 2.5;
    doc.setDrawColor(226, 232, 240); // Slate 200
    doc.setLineWidth(0.3);
    doc.line(safeLeft, currentY, pageWidth - safeRight, currentY);

    currentY += 3;
  } else {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(71, 85, 105); // #475569
    const generatedOnText = `Generated: ${new Date().toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}`;
    
    if (dataset === 'Inventory') {
      const inStock = rows.filter(r => r['Stock Status'] === 'In Stock').length;
      const lowStock = rows.filter(r => r['Stock Status'] === 'Low Stock').length;
      const outOfStock = rows.filter(r => r['Stock Status'] === 'Out of Stock').length;
      doc.text(generatedOnText, 14, 31);
      doc.text(`Status Breakdown: In Stock (${inStock})  |  Low Stock (${lowStock})  |  Out of Stock (${outOfStock})`, 14, 36);
      doc.text(`Total Items: ${rows.length}`, pageWidth - 14, 31, { align: 'right' });
    } else {
      doc.text(generatedOnText, 14, 31);
      doc.text(`Date Range: ${dateRangeText}`, 14, 36);
      doc.text(`Total Records: ${rows.length}`, pageWidth - 14, 31, { align: 'right' });
    }
    currentY = 41;
  }

  const headers = columns.map(c => c.header || c.key);
  const tableData = rows.map(r => headers.map(h => String(r[h] !== undefined ? r[h] : '')));

  const colCount = columns.length;
  const tableFontSize = colCount > 9 ? 6.5 : colCount > 7 ? 7 : 7.5;
  const tableCellPadding = colCount > 9 ? 1.4 : colCount > 7 ? 1.8 : 2;

  // Tabular Body via jspdf-autotable
  autoTable(doc, {
    startY: currentY,
    head: [headers],
    body: tableData,
    theme: 'grid',
    styles: {
      overflow: 'linebreak',
      fontSize: tableFontSize,
      cellPadding: tableCellPadding
    },
    headStyles: {
      fillColor: [30, 41, 59], // #1E293B Slate 800
      textColor: [255, 255, 255],
      fontSize: tableFontSize + 0.5,
      fontStyle: 'bold',
      halign: 'left',
      cellPadding: tableCellPadding + 0.2
    },
    bodyStyles: {
      fontSize: tableFontSize,
      textColor: [30, 41, 59],
      cellPadding: tableCellPadding
    },
    alternateRowStyles: {
      fillColor: [248, 250, 252] // #F8FAFC
    },
    didParseCell: (hookData) => {
      if (hookData.section === 'body') {
        const rawRow = rows[hookData.row.index];
        if (rawRow && rawRow['PO Type'] === 'MASTER') {
          hookData.cell.styles.fillColor = [239, 246, 255];
          hookData.cell.styles.fontStyle = 'bold';
          hookData.cell.styles.textColor = [30, 64, 175];
        }
      }
    },
    margin: {
      left: safeLeft,
      right: safeRight,
      top: safeTop,
      bottom: safeBottom
    },
    willDrawPage: (data) => {
      // Repeat letterhead background on every subsequent page
      if (hasLetterhead && data.pageNumber > 1) {
        drawLetterheadBg();
      }
    },
    didDrawPage: (data) => {
      // Footer page numbering inside safe bottom margin
      const str = `Page ${doc.internal.getNumberOfPages()}`;
      doc.setFontSize(7.5);
      doc.setTextColor(148, 163, 184); // #94A3B8
      const footerY = pageHeight - Math.max(safeBottom - 8, 6);
      doc.text(str, pageWidth / 2, footerY, { align: 'center' });
      doc.text('Confidential — Authorized Hospital Records', safeLeft, footerY);
      if (letterheadConfig?.activeTemplateName) {
        doc.text(`Template: ${letterheadConfig.activeTemplateName}`, pageWidth - safeRight, footerY, { align: 'right' });
      }
    }
  });

  doc.save(fileName);
}

/**
 * Sends a structured audit log event to the backend upon successful export.
 * Follows the existing Curoxa audit log architecture without storing raw patient data.
 */
export async function logExportEvent({ dataset, format, recordCount, dateRange = {}, filters }) {
  try {
    const isSnapshot = dataset === 'Inventory' || dateRange.type === 'Current Snapshot';
    const payload = {
      action: 'DATASET_EXPORTED',
      target: dataset,
      metadata: {
        dataset,
        format: format.toUpperCase(),
        recordCount,
        dateRange: isSnapshot ? {
          type: 'Current Snapshot',
          generatedAt: dateRange.generatedAt || new Date().toISOString()
        } : {
          type: dateRange.type || 'Today',
          startDate: dateRange.startDate || null,
          endDate: dateRange.endDate || null
        },
        filters: filters || {}
      }
    };
    await api.post('/audit-logs', payload);
  } catch (err) {
    // Non-blocking warning: export succeeded even if audit logging fails
    console.warn('[EXPORT AUDIT ERROR] Failed to record export audit log:', err.message);
  }
}

/**
 * Unified Export Engine Entrypoint.
 *
 * @param {Object} context
 * @param {string} context.dataset - Name of dataset e.g. "Patients", "Purchase Orders"
 * @param {Array} context.data - Full, UNPAGINATED dataset from caller
 * @param {Array} context.columns - Strict column definitions [{ key, header, extractor?, formatter? }]
 * @param {string|Array|Function} context.dateField - Authoritative date field(s)
 * @param {Object} [context.currentFilters] - Caller's active filters for metadata
 * @param {Object} context.dateRange - { type: 'Today'|'This Week'|'This Month'|'Custom Range', startDate?, endDate? }
 * @param {string} context.format - 'excel' | 'pdf'
 * @param {string} [context.clinicName] - Hospital / tenant clinic name
 * @returns {Promise<{ success: boolean, recordCount: number, fileName: string }>}
 */
export async function executeExport(context) {
  const {
    dataset,
    data,
    columns,
    dateField,
    currentFilters = {},
    dateRange = { type: 'Today' },
    format = 'excel',
    clinicName
  } = context || {};

  if (!dataset) {
    throw new Error('Export failed: Dataset name is required.');
  }
  if (!Array.isArray(columns) || columns.length === 0) {
    throw new Error('Export failed: Column definitions are required.');
  }
  if (!Array.isArray(data)) {
    throw new Error('Export failed: Invalid dataset array provided.');
  }

  // 1. Resolve date bounds & filter unpaginated dataset
  const filteredData = filterDataByDate(data, dateField, dateRange);

  if (filteredData.length === 0) {
    throw new Error(`No ${dataset} records found matching the selected export parameters.`);
  }

  // 2. Normalize and extract ONLY declared columns (Sensitive field safeguard)
  const dataToNormalize = dataset === 'Prescriptions'
    ? flattenPrescriptionsForExport(filteredData)
    : filteredData;
  const rows = normalizeExportRows(dataToNormalize, columns);

  // 3. Prepare readable date range description
  const isSnapshot = dataset === 'Inventory' || !dateField || dateRange?.type === 'Current Snapshot';
  const { startDate, endDate, rangeType } = resolveDateBounds(dateRange);
  const formatDateStr = (d) => d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  const dateRangeText = isSnapshot
    ? 'Current Stock Snapshot'
    : (rangeType === 'All Time'
        ? 'All Time Records'
        : (rangeType === 'Custom Range'
            ? `${formatDateStr(startDate)} - ${formatDateStr(endDate)}`
            : `${rangeType} (${formatDateStr(startDate)} - ${formatDateStr(endDate)})`));

  // 4. Construct safe, clean file name
  const cleanDatasetName = dataset.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  const timestampStr = new Date().toISOString().slice(0, 10);
  const ext = format === 'pdf' ? 'pdf' : (format === 'csv' ? 'csv' : 'xlsx');
  const fileName = `${cleanDatasetName}_export_${timestampStr}.${ext}`;

  // 5. Generate and download file
  if (format === 'pdf') {
    await generatePdfFile({
      dataset,
      rows,
      columns,
      dateRangeText,
      clinicName,
      fileName,
      letterheadConfig: context?.letterheadConfig
    });
  } else if (format === 'csv') {
    await generateCsvFile({
      dataset,
      rows,
      columns,
      fileName
    });
  } else if (format === 'excel' || format === 'xlsx') {
    await generateExcelFile({
      dataset,
      rows,
      columns,
      dateRangeText,
      fileName
    });
  } else {
    throw new Error(`Unsupported export format: "${format}". Supported formats are "excel", "csv", and "pdf".`);
  }

  // 6. Record event in Audit Log (without raw patient data)
  await logExportEvent({
    dataset,
    format,
    recordCount: filteredData.length,
    ...(dataset === 'Prescriptions' ? { medicineLineCount: dataToNormalize.length } : {}),
    dateRange,
    filters: currentFilters
  });

  return {
    success: true,
    recordCount: filteredData.length,
    fileName
  };
}

/**
 * Explicit Vendor Export Column Definitions
 */
export const vendorExportColumns = [
  { key: 'code', header: 'Vendor Code', extractor: v => v.code || '--' },
  { key: 'name', header: 'Vendor Name', extractor: v => v.name || '--' },
  { key: 'type', header: 'Supplier Type', extractor: v => v.type || '--' },
  { key: 'category', header: 'Category', extractor: v => v.category || (Array.isArray(v.categories) ? v.categories.join(', ') : '--') },
  { key: 'contactPerson', header: 'Contact Person', extractor: v => v.contactPerson || '--' },
  { key: 'phone', header: 'Phone / Mobile', extractor: v => v.phone || v.mobile || '--' },
  { key: 'email', header: 'Email', extractor: v => v.email || '--' },
  { key: 'city', header: 'City', extractor: v => v.city || '--' },
  { key: 'state', header: 'State', extractor: v => v.state || '--' },
  { key: 'gstNumber', header: 'GST Number', extractor: v => v.gstNumber || '--' },
  { key: 'status', header: 'Status', extractor: v => v.status || 'Active' }
];

/**
 * Explicit GRN Export Column Definitions
 * Covers all verified GoodsReceipt and GoodsReceiptItem fields.
 */
export const grnExportColumns = [
  { key: 'grnId', header: 'GRN ID', extractor: r => r.grnId || '' },
  { key: 'receivedDate', header: 'GRN Date', extractor: r => r.receivedDate || r.grnDate || r.createdAt, formatter: v => v ? new Date(v).toLocaleDateString('en-IN') : '--' },
  { key: 'grnLocation', header: 'GRN Location', extractor: r => r.grnLocation || 'Main Pharmacy Store' },
  { key: 'poNumber', header: 'PO Number', extractor: r => r.poNumber || 'Direct Purchase' },
  { key: 'poDate', header: 'PO Date', extractor: r => r.poDate, formatter: v => v ? new Date(v).toLocaleDateString('en-IN') : '--' },
  { key: 'vendorName', header: 'Vendor', extractor: r => r.vendorName || '' },
  { key: 'vendorCode', header: 'Vendor Code', extractor: r => r.vendorCode || (r.vendorId && typeof r.vendorId === 'object' ? r.vendorId.code : '') || '--' },
  { key: 'itemType', header: 'Item Type', extractor: r => r.item?.itemType || 'Medicine' },
  { key: 'sku', header: 'Item SKU / Code', extractor: r => r.item?.sku || r.item?.itemCode || '--' },
  { key: 'itemName', header: 'Item Name', extractor: r => r.item?.name || '' },
  { key: 'unit', header: 'Purchased Unit', extractor: r => r.item?.unit || 'Strip' },
  { key: 'barcode', header: 'Barcode', extractor: r => r.item?.barcode || '--' },
  { key: 'batchNumber', header: 'Batch Number', extractor: r => r.item?.batchNumber || '--' },
  { key: 'mfgDate', header: 'Mfg Date', extractor: r => r.item?.mfgDate, formatter: v => v ? new Date(v).toLocaleDateString('en-IN') : '--' },
  { key: 'expiryDate', header: 'Expiry Date', extractor: r => r.item?.expiryDate, formatter: v => v ? new Date(v).toLocaleDateString('en-IN') : '--' },
  { key: 'qtyOrdered', header: 'PO Quantity', extractor: r => r.item?.qtyOrdered ?? r.item?.orderedQty ?? '--' },
  { key: 'previouslyReceivedQty', header: 'Previously Received', extractor: r => r.item?.previouslyReceivedQty ?? 0 },
  { key: 'remainingQty', header: 'Remaining Quantity', extractor: r => r.item?.remainingQty ?? '--' },
  { key: 'qtyReceived', header: 'Received Quantity', extractor: r => r.item?.qtyReceived ?? 0 },
  { key: 'rejectedQty', header: 'Rejected Quantity', extractor: r => r.item?.rejectedQty ?? 0 },
  { key: 'rejectionReason', header: 'Rejection Reason', extractor: r => r.item?.rejectionReason || '--' },
  { key: 'purchaseRate', header: 'Purchase Rate', extractor: r => r.item?.purchaseRate ?? r.item?.price ?? 0, formatter: v => Number(v || 0).toFixed(2) },
  { key: 'discountPercent', header: 'Discount %', extractor: r => r.item?.discountPercent ?? 0 },
  { key: 'discountAmount', header: 'Discount Amount', extractor: r => r.item?.discountAmount ?? 0, formatter: v => Number(v || 0).toFixed(2) },
  { key: 'gst', header: 'GST %', extractor: r => r.item?.gst ?? 0 },
  { key: 'gstAmount', header: 'GST Amount', extractor: r => r.item?.gstAmount ?? 0, formatter: v => Number(v || 0).toFixed(2) },
  { key: 'buyPrice', header: 'Buy Price', extractor: r => r.item?.buyPrice ?? 0, formatter: v => Number(v || 0).toFixed(2) },
  { key: 'netAmount', header: 'Net Amount', extractor: r => r.item?.netAmount ?? 0, formatter: v => Number(v || 0).toFixed(2) },
  { key: 'invoiceNumber', header: 'Invoice Number', extractor: r => r.invoiceNumber || '--' },
  { key: 'invoiceDate', header: 'Invoice Date', extractor: r => r.invoiceDate, formatter: v => v ? new Date(v).toLocaleDateString('en-IN') : '--' },
  { key: 'invoiceAmount', header: 'Invoice Amount', extractor: r => r.invoiceAmount ?? 0, formatter: v => Number(v || 0).toFixed(2) },
  { key: 'status', header: 'Status', extractor: r => r.status || 'Verified/Completed' },
  { key: 'receivedBy', header: 'Received By', extractor: r => r.receivedBy || r.createdBy || 'Store In-Charge' },
  { key: 'invoiceUrl', header: 'Invoice Attachment Ref', extractor: r => r.invoiceUrl || '--' },
  { key: 'totalDiscount', header: 'Total Discount', extractor: r => r.totalDiscount ?? 0, formatter: v => Number(v || 0).toFixed(2) },
  { key: 'totalGst', header: 'Total GST', extractor: r => r.totalGst ?? r.totalGST ?? 0, formatter: v => Number(v || 0).toFixed(2) },
  { key: 'grandTotal', header: 'Grand Total', extractor: r => r.grandTotal ?? r.totalAmount ?? 0, formatter: v => Number(v || 0).toFixed(2) }
];

/**
 * Flattens GRNs so each line item is an independent row while preserving GRN-level data.
 */
export function flattenGrnForExport(grnList) {
  if (!Array.isArray(grnList)) return [];
  const flatRows = [];
  grnList.forEach(grn => {
    const items = Array.isArray(grn.items) && grn.items.length > 0 ? grn.items : [null];
    items.forEach(item => {
      flatRows.push({
        ...grn,
        item,
        status: grn.status || 'Verified/Completed',
        receivedBy: grn.receivedBy || grn.createdBy || 'Store In-Charge',
        invoiceUrl: grn.invoiceUrl || '',
        receivedDate: grn.receivedDate || grn.grnDate || grn.createdAt
      });
    });
  });
  return flatRows;
}

/**
 * Explicit Purchase Order Export Column Definitions
 * Distinguishes MASTER from SUB-PO / STANDALONE to prevent financial double-counting.
 */
export const poExportColumns = [
  { key: 'poType', header: 'PO Type', extractor: r => r.poType || 'STANDALONE' },
  { key: 'parentPoId', header: 'Parent PO Number', extractor: r => r.parentPOId || '--' },
  { key: 'poId', header: 'PO Number', extractor: r => r.poId || '' },
  { key: 'orderDate', header: 'PO Date', extractor: r => r.createdAt, formatter: v => v ? new Date(v).toLocaleDateString('en-IN') : '--' },
  { key: 'vendorName', header: 'Vendor', extractor: r => r.vendorName || '' },
  { key: 'status', header: 'Status', extractor: r => r.status || '' },
  { key: 'requestedBy', header: 'Requested By', extractor: r => r.requestedBy || '--' },
  { key: 'expectedDelivery', header: 'Expected Delivery', extractor: r => r.expectedDelivery, formatter: v => v ? new Date(v).toLocaleDateString('en-IN') : '--' },
  { key: 'itemSku', header: 'Item SKU', extractor: r => r.item?.sku || '--' },
  { key: 'itemName', header: 'Item Name', extractor: r => r.item?.name || (r.poType === 'MASTER' ? '[Consolidated Multi-Supplier Order Summary]' : '') },
  { key: 'requiredQty', header: 'Order Quantity', extractor: r => r.item?.requiredQty ?? r.item?.qty ?? (r.poType === 'MASTER' ? (r.totalItems || '--') : 0) },
  { key: 'unitPrice', header: 'Unit Price', extractor: r => r.item?.price ?? 0, formatter: (v, r) => r.poType === 'MASTER' ? '--' : Number(v || 0).toFixed(2) },
  { key: 'itemTax', header: 'Item Tax', extractor: r => r.item?.tax ?? 0, formatter: (v, r) => r.poType === 'MASTER' ? '--' : (v !== undefined ? `${v}%` : '0%') },
  { key: 'itemTotal', header: 'Item Total', extractor: r => r.item?.total ?? 0, formatter: (v, r) => r.poType === 'MASTER' ? '--' : Number(v || 0).toFixed(2) },
  {
    key: 'supplierOrderAmount',
    header: 'Supplier Order Amount',
    extractor: r => (r.poType === 'SUB-PO' || r.poType === 'STANDALONE') ? (r.totalAmount ?? 0) : 0,
    formatter: (v, r) => (r.poType === 'MASTER' ? '--' : Number(v || 0).toFixed(2))
  },
  {
    key: 'consolidatedMasterTotal',
    header: 'Consolidated Master Total',
    extractor: r => (r.poType === 'MASTER') ? (r.totalAmount ?? 0) : 0,
    formatter: (v, r) => (r.poType === 'MASTER' ? Number(v || 0).toFixed(2) : '--')
  }
];

/**
 * Flattens Purchase Orders with hierarchy preservation:
 * - Master POs emitted as consolidated summary rows
 * - Sub-POs emitted with their actual supplier line items
 * - Prevents duplicate line-item inflation and financial double counting
 */
export function flattenPoForExport(poList) {
  if (!Array.isArray(poList)) return [];

  const parentAndDirect = [];
  const childMap = {};

  poList.forEach(po => {
    if (po.parentPOId) {
      if (!childMap[po.parentPOId]) childMap[po.parentPOId] = [];
      childMap[po.parentPOId].push(po);
    } else {
      parentAndDirect.push(po);
    }
  });

  const flatRows = [];

  parentAndDirect.forEach(parent => {
    const isMaster = parent.isParent || parent.vendorName === 'Consolidated Multiple Suppliers' || (parent.vendorOrders && parent.vendorOrders.length > 0);
    const children = childMap[parent.poId] || [];

    if (isMaster) {
      // 1. Emit Master PO as a single Consolidated Summary Row (WITHOUT duplicating child items)
      flatRows.push({
        ...parent,
        poType: 'MASTER',
        parentPOId: null,
        item: null, // Header summary row
        createdAt: parent.createdAt
      });

      // 2. Emit each Child Sub-PO with its actual supplier line items
      children.sort((a, b) => (a.poId || '').localeCompare(b.poId || ''));
      children.forEach(child => {
        const childItems = Array.isArray(child.items) && child.items.length > 0 ? child.items : [null];
        childItems.forEach(item => {
          flatRows.push({
            ...child,
            poType: 'SUB-PO',
            parentPOId: parent.poId,
            item,
            createdAt: child.createdAt || parent.createdAt
          });
        });
      });
    } else {
      // Standalone PO
      const items = Array.isArray(parent.items) && parent.items.length > 0 ? parent.items : [null];
      items.forEach(item => {
        flatRows.push({
          ...parent,
          poType: 'STANDALONE',
          parentPOId: null,
          item,
          createdAt: parent.createdAt
        });
      });
    }
  });

  // Handle any orphaned children whose parent might not be in the current slice/filter
  Object.keys(childMap).forEach(pId => {
    if (!parentAndDirect.some(p => p.poId === pId)) {
      const orphans = childMap[pId];
      orphans.forEach(child => {
        const items = Array.isArray(child.items) && child.items.length > 0 ? child.items : [null];
        items.forEach(item => {
          flatRows.push({
            ...child,
            poType: 'SUB-PO',
            parentPOId: pId,
            item,
            createdAt: child.createdAt
          });
        });
      });
    }
  });

  return flatRows;
}

/**
 * Explicit Staff Export Column Definitions
 * Strictly excludes sensitive HR/payroll fields (Aadhaar, PAN, Bank Account, IFSC, CTC, Passwords).
 */
export const staffExportColumns = [
  { key: 'staff_id', header: 'Staff ID', extractor: r => r.staff_id || r.id || '--' },
  { key: 'name', header: 'Full Name', extractor: r => r.name || '--' },
  { key: 'role', header: 'Role', extractor: r => r.role ? r.role.charAt(0).toUpperCase() + r.role.slice(1) : '--' },
  { key: 'department', header: 'Department', extractor: r => r.dept || r.department || r.specialty || '--' },
  { key: 'designation', header: 'Designation', extractor: r => r.designation || (r.role ? r.role.charAt(0).toUpperCase() + r.role.slice(1) : '--') },
  { key: 'email', header: 'Email', extractor: r => r.email || '--' },
  { key: 'phone', header: 'Phone', extractor: r => r.phone || '--' },
  { key: 'gender', header: 'Gender', extractor: r => r.gender || '--' },
  { key: 'bloodGroup', header: 'Blood Group', extractor: r => r.bloodGroup || '--' },
  { key: 'employmentType', header: 'Employment Type', extractor: r => r.employmentType || 'Full-Time' },
  { key: 'workLocation', header: 'Work Location', extractor: r => r.workLocation || 'Main Wing' },
  { key: 'shiftName', header: 'Shift', extractor: r => r.shiftName || 'General Shift' },
  { key: 'weeklyOff', header: 'Weekly Off', extractor: r => typeof r.weeklyOff === 'string' ? r.weeklyOff : 'Sunday' },
  { key: 'status', header: 'Status', extractor: r => r.status || (r.active ? 'Active' : 'Inactive') },
  { key: 'joiningDate', header: 'Joining Date', extractor: r => r.joiningDate || r.createdAt, formatter: v => v ? new Date(v).toLocaleDateString('en-IN') : '--' }
];

/**
 * Explicit Inventory Summary Export Column Definitions
 * Strictly excludes internal MongoDB identifiers, tenant secrets, and credentials.
 */
export const inventoryExportColumns = [
  { key: 'sku', header: 'SKU Code', extractor: r => r.sku || '--' },
  { key: 'name', header: 'Medicine Name', extractor: r => r.name || '--' },
  { key: 'category', header: 'Category', extractor: r => r.category || '--' },
  { key: 'stock', header: 'Total Sellable Stock', extractor: r => Number(r.sellableStock !== undefined ? r.sellableStock : r.stock) || 0 },
  { key: 'unit', header: 'Unit', extractor: r => r.unit || '--' },
  { key: 'mrp', header: 'MRP (Rs.)', extractor: r => r.mrp ? Number(r.mrp).toFixed(2) : '0.00' },
  { key: 'status', header: 'Stock Status', extractor: r => r.status || (Number(r.sellableStock !== undefined ? r.sellableStock : r.stock) > 20 ? 'In Stock' : Number(r.sellableStock !== undefined ? r.sellableStock : r.stock) > 0 ? 'Low Stock' : 'Out of Stock') },
  { key: 'batchCount', header: 'Number of Batches', extractor: r => r.batchCount !== undefined ? r.batchCount : '--' },
  { key: 'nearestExpiry', header: 'Nearest Expiry', extractor: r => r.nearestExpiry || r.expiry || '--' },
  { key: 'nearestBatch', header: 'Nearest Batch', extractor: r => r.nearestBatch || '--' },
  { key: 'updatedAt', header: 'Last Updated', extractor: r => r.updatedAt ? new Date(r.updatedAt).toLocaleDateString('en-IN') : (r.createdAt ? new Date(r.createdAt).toLocaleDateString('en-IN') : '--') }
];

/**
 * Authoritative Batch-Aware Inventory Export Column Definitions
 * 1 row = 1 distinct batch. Never flattens or merges multiple batches into one.
 */
export const batchInventoryExportColumns = [
  { key: 'medicineName', header: 'Medicine Name', extractor: r => r.medicineName || r.name || '--' },
  { key: 'sku', header: 'SKU Code', extractor: r => r.sku || '--' },
  { key: 'category', header: 'Category', extractor: r => r.category || '--' },
  { key: 'batchNumber', header: 'Batch Number', extractor: r => r.batchNumber || '--' },
  { key: 'availableQuantity', header: 'Available Quantity', extractor: r => Number(r.availableQuantity ?? r.stock ?? 0) },
  { key: 'unit', header: 'Unit', extractor: r => r.unit || 'Strip' },
  { key: 'expiryDate', header: 'Expiry Date', extractor: r => r.expiryDate, formatter: v => v ? new Date(v).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : (r.expiry || '--') },
  { key: 'daysRemaining', header: 'Days Remaining', extractor: r => (r.daysRemaining !== undefined && r.daysRemaining !== null) ? (r.daysRemaining < 0 ? `${Math.abs(r.daysRemaining)}d ago (Expired)` : `${r.daysRemaining} days`) : '--' },
  { key: 'risk', header: 'Risk Status', extractor: r => r.risk || (Number(r.availableQuantity ?? r.stock ?? 0) > 0 ? 'SAFE' : 'DEPLETED') },
  { key: 'purchaseRate', header: 'Purchase Rate (Rs.)', extractor: r => r.purchaseRate ? Number(r.purchaseRate).toFixed(2) : '0.00' },
  { key: 'stockValue', header: 'Batch Stock Value (Rs.)', extractor: r => (Number(r.availableQuantity ?? r.stock ?? 0) * Number(r.purchaseRate || 0)).toFixed(2) },
  { key: 'mrp', header: 'MRP (Rs.)', extractor: r => r.mrp ? Number(r.mrp).toFixed(2) : '0.00' },
  { key: 'status', header: 'Status', extractor: r => r.status || (Number(r.availableQuantity ?? r.stock ?? 0) > 0 ? 'Active' : 'Depleted') }
];

/**
 * Flattens inventory medicines into granular batch records for batch-aware exports.
 * Preserves legacy stock fallback where no MedicineBatch records exist.
 */
export function flattenInventoryBatchesForExport(inventoryList = [], skuBatchesMap = {}) {
  if (!Array.isArray(inventoryList)) return [];
  const flatRows = [];
  const now = new Date();

  inventoryList.forEach(med => {
    const skuKey = String(med.sku || '').toUpperCase();
    const batches = (skuBatchesMap && skuBatchesMap[skuKey]) ? skuBatchesMap[skuKey] : [];

    if (batches.length > 0) {
      batches.forEach(b => {
        const avail = Number(b.availableQuantity) || 0;
        let daysLeft = null;
        if (b.expiryDate) {
          const exp = new Date(b.expiryDate);
          daysLeft = Math.ceil((exp - now) / (1000 * 60 * 60 * 24));
        }
        flatRows.push({
          medicineName: med.name,
          sku: med.sku,
          category: med.category,
          unit: med.unit || 'Strip',
          mrp: med.mrp,
          batchNumber: b.batchNumber,
          availableQuantity: avail,
          expiryDate: b.expiryDate,
          daysRemaining: b.daysRemaining !== undefined ? b.daysRemaining : daysLeft,
          risk: b.risk || (b.isExpired ? 'EXPIRED' : (daysLeft !== null && daysLeft <= 30 ? 'CRITICAL' : (daysLeft !== null && daysLeft <= 90 ? 'WARNING' : 'SAFE'))),
          purchaseRate: b.purchaseRate !== undefined ? b.purchaseRate : (med.purchaseRate || 0),
          status: b.status || (avail > 0 ? 'Active' : 'Depleted')
        });
      });
    } else {
      // Legacy unbatched inventory fallback
      const avail = Number(med.stock) || 0;
      flatRows.push({
        medicineName: med.name,
        sku: med.sku,
        category: med.category,
        unit: med.unit || 'Strip',
        mrp: med.mrp,
        batchNumber: 'Legacy / Untracked',
        availableQuantity: avail,
        expiryDate: med.expiry,
        daysRemaining: null,
        risk: avail > 0 ? 'SAFE' : 'DEPLETED',
        purchaseRate: med.purchaseRate || 0,
        status: med.status || (avail > 0 ? 'In Stock' : 'Out of Stock')
      });
    }
  });

  return flatRows;
}

/**
 * Enriches medicine catalog with authoritative batch aggregation data for summary exports.
 * ONE ROW = ONE MEDICINE.
 */
export function buildMedicineSummaryExportData(inventoryList = [], skuBatchesMap = {}) {
  if (!Array.isArray(inventoryList)) return [];
  const now = new Date();

  return inventoryList.map(med => {
    const skuKey = String(med.sku || '').toUpperCase();
    const batches = (skuBatchesMap && skuBatchesMap[skuKey]) ? skuBatchesMap[skuKey] : [];

    // Sort batches by FEFO (earliest expiry first)
    const validBatches = [...batches].sort((a, b) => {
      if (!a.expiryDate) return 1;
      if (!b.expiryDate) return -1;
      return new Date(a.expiryDate).getTime() - new Date(b.expiryDate).getTime();
    });

    let nearestExp = null;
    let nearestBatch = null;
    let validSellable = 0;

    if (validBatches.length > 0) {
      // Find nearest active batch
      const firstActive = validBatches.find(b => {
        const qty = Number(b.availableQuantity) || 0;
        const isExp = b.isExpired || b.risk === 'EXPIRED' || (b.expiryDate && new Date(b.expiryDate) <= now);
        return qty > 0 && !isExp;
      }) || validBatches[0];

      if (firstActive.expiryDate) {
        const d = new Date(firstActive.expiryDate);
        nearestExp = isNaN(d.getTime()) ? String(firstActive.expiryDate) : d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
      }
      nearestBatch = firstActive.batchNumber || '--';

      validBatches.forEach(b => {
        const qty = Number(b.availableQuantity) || 0;
        const isExp = b.isExpired || b.risk === 'EXPIRED' || (b.expiryDate && new Date(b.expiryDate) <= now);
        if (!isExp) validSellable += qty;
      });
    }

    const totalStock = validBatches.length > 0 ? validSellable : (Number(med.stock) || 0);
    const stockStatus = totalStock > 20 ? 'In Stock' : totalStock > 0 ? 'Low Stock' : 'Out of Stock';

    return {
      ...med,
      sku: med.sku || '--',
      name: med.name || '--',
      category: med.category || '--',
      sellableStock: totalStock,
      unit: med.unit || 'Strip',
      mrp: med.mrp ? Number(med.mrp).toFixed(2) : '0.00',
      status: stockStatus,
      batchCount: validBatches.length > 0 ? validBatches.length : '--',
      nearestExpiry: nearestExp || (med.expiry ? String(med.expiry) : '--'),
      nearestBatch: nearestBatch || '--',
      updatedAt: med.updatedAt || med.createdAt
    };
  });
}

/**
 * Authoritative Expiry Management Export Column Definitions
 * Exact alignment with ExpiryManagementPanel.jsx
 */
export const expiryExportColumns = [
  { key: 'medicineName', header: 'Medicine Name', extractor: r => r.name || r.medicineName || '--' },
  { key: 'sku', header: 'SKU Code', extractor: r => r.sku || '--' },
  { key: 'batchNumber', header: 'Batch Number', extractor: r => r.batchNumber || '--' },
  { key: 'expiryDate', header: 'Expiry Date', extractor: r => r.expiryDate, formatter: v => v ? new Date(v).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '--' },
  { key: 'daysRemaining', header: 'Days Remaining', extractor: r => (r.daysRemaining !== undefined && r.daysRemaining !== null) ? (r.daysRemaining < 0 ? `${Math.abs(r.daysRemaining)}d ago (Expired)` : `${r.daysRemaining} days`) : '--' },
  { key: 'availableQuantity', header: 'Available Quantity', extractor: r => Number(r.availableQuantity || 0) },
  { key: 'unit', header: 'Unit', extractor: r => r.unit || 'Strip' },
  { key: 'purchaseRate', header: 'Purchase Rate (Rs.)', extractor: r => r.purchaseRate ? Number(r.purchaseRate).toFixed(2) : '0.00' },
  { key: 'stockValue', header: 'Stock Value (Rs.)', extractor: r => (Number(r.availableQuantity || 0) * Number(r.purchaseRate || 0)).toFixed(2) },
  { key: 'risk', header: 'Risk Level', extractor: r => r.risk || 'SAFE' },
  { key: 'status', header: 'Status', extractor: r => r.status || (Number(r.availableQuantity || 0) > 0 ? 'Active' : 'Depleted') },
  { key: 'grnId', header: 'Source / GRN', extractor: r => r.grnId || '--' }
];

/**
 * Authoritative Pharmacy Sales / Sales Ledger Summary Export Column Definitions
 */
export const pharmacySalesExportColumns = [
  { key: 'saleId', header: 'Sale ID', extractor: r => r.saleId || '--' },
  { key: 'date', header: 'Date', extractor: r => r.saleDate || r.createdAt, formatter: v => v ? new Date(v).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '--' },
  { key: 'saleType', header: 'Sale Type', extractor: r => r.saleType || 'DIRECT' },
  { key: 'customerName', header: 'Customer / Patient', extractor: r => r.customerName || (r.patientId?.name) || 'Walk-in' },
  { key: 'patientIdentifier', header: 'Patient ID / UHID', extractor: r => r.patientIdentifier || (r.patientId?.patientId) || '--' },
  { key: 'prescriptionCode', header: 'Prescription Code', extractor: r => r.prescriptionCode || '--' },
  { key: 'doctorName', header: 'Doctor', extractor: r => r.doctorName || '--' },
  { key: 'pharmacistName', header: 'Pharmacist', extractor: r => r.pharmacistName || '--' },
  { key: 'itemSummary', header: 'Items', extractor: r => Array.isArray(r.items) ? r.items.map(i => `${i.medicineName || i.sku} (${i.quantity})`).join('; ') : '--' },
  { key: 'subtotal', header: 'Subtotal (Rs.)', extractor: r => Number(r.subtotal || 0).toFixed(2) },
  { key: 'totalDiscount', header: 'Discount (Rs.)', extractor: r => Number(r.totalDiscount || 0).toFixed(2) },
  { key: 'totalGst', header: 'GST / Tax (Rs.)', extractor: r => Number(r.totalGst || 0).toFixed(2) },
  { key: 'grandTotal', header: 'Grand Total (Rs.)', extractor: r => Number(r.grandTotal || 0).toFixed(2) },
  { key: 'paymentMethod', header: 'Payment Method', extractor: r => r.paymentMethod || 'Cash' },
  { key: 'transactionRef', header: 'Payment Ref / Txn ID', extractor: r => r.transactionRef || '--' },
  { key: 'status', header: 'Status', extractor: r => r.status || 'COMPLETED' }
];

/**
 * Line-Item Detailed Pharmacy Sales Export Column Definitions
 */
export const pharmacySalesDetailExportColumns = [
  { key: 'saleId', header: 'Sale ID', extractor: r => r.saleId || '--' },
  { key: 'date', header: 'Date', extractor: r => r.saleDate || r.createdAt, formatter: v => v ? new Date(v).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '--' },
  { key: 'saleType', header: 'Sale Type', extractor: r => r.saleType || 'DIRECT' },
  { key: 'customerName', header: 'Customer / Patient', extractor: r => r.customerName || (r.patientId?.name) || 'Walk-in' },
  { key: 'medicineName', header: 'Medicine Name', extractor: r => r.item?.medicineName || '--' },
  { key: 'sku', header: 'SKU', extractor: r => r.item?.sku || '--' },
  { key: 'batchNumber', header: 'Batch Number', extractor: r => r.item?.batchNumber || '--' },
  { key: 'quantity', header: 'Quantity', extractor: r => Number(r.item?.quantity || 0) },
  { key: 'unit', header: 'Unit', extractor: r => r.item?.unit || 'Strip' },
  { key: 'mrp', header: 'MRP (Rs.)', extractor: r => Number(r.item?.mrp || 0).toFixed(2) },
  { key: 'discountPercent', header: 'Discount %', extractor: r => `${r.item?.discountPercent || 0}%` },
  { key: 'discountAmount', header: 'Discount (Rs.)', extractor: r => Number(r.item?.discountAmount || 0).toFixed(2) },
  { key: 'gstPercent', header: 'GST %', extractor: r => `${r.item?.gstPercent || 0}%` },
  { key: 'gstAmount', header: 'GST (Rs.)', extractor: r => Number(r.item?.gstAmount || 0).toFixed(2) },
  { key: 'netAmount', header: 'Net Amount (Rs.)', extractor: r => Number(r.item?.netAmount || 0).toFixed(2) },
  { key: 'paymentMethod', header: 'Payment Method', extractor: r => r.paymentMethod || 'Cash' },
  { key: 'status', header: 'Status', extractor: r => r.status || 'COMPLETED' }
];

/**
 * Flattens Pharmacy Sales into line-item rows for detailed sales export.
 */
export function flattenSalesForExport(salesList = []) {
  if (!Array.isArray(salesList)) return [];
  const flatRows = [];
  salesList.forEach(sale => {
    const items = Array.isArray(sale.items) && sale.items.length > 0 ? sale.items : [null];
    items.forEach(item => {
      flatRows.push({
        ...sale,
        item
      });
    });
  });
  return flatRows;
}

/**
 * Authoritative Write-Off Export Column Definitions
 */
export const writeOffExportColumns = [
  { key: 'writeOffId', header: 'Write-Off ID', extractor: r => r.writeOffId || '--' },
  { key: 'createdAt', header: 'Write-Off Date', extractor: r => r.createdAt, formatter: v => v ? new Date(v).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '--' },
  { key: 'medicineName', header: 'Medicine Name', extractor: r => r.medicineName || '--' },
  { key: 'sku', header: 'SKU Code', extractor: r => r.sku || '--' },
  { key: 'batchNumber', header: 'Batch Number', extractor: r => r.batchNumber || '--' },
  { key: 'expiryDate', header: 'Expiry Date', extractor: r => r.expiryDate, formatter: v => v ? new Date(v).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '--' },
  { key: 'quantity', header: 'Quantity Written Off', extractor: r => Number(r.quantity || 0) },
  { key: 'unitCost', header: 'Purchase Rate (Rs.)', extractor: r => Number(r.unitCost || 0).toFixed(2) },
  { key: 'totalValue', header: 'Write-Off Value (Rs.)', extractor: r => Number(r.totalValue || (r.quantity * r.unitCost) || 0).toFixed(2) },
  { key: 'reason', header: 'Reason', extractor: r => r.reason || 'Expired' },
  { key: 'detectedBy', header: 'Written Off By', extractor: r => r.approvedBy || r.detectedBy || 'Pharmacist' },
  { key: 'status', header: 'Status', extractor: r => r.status || 'Written Off' }
];

/**
 * Explicit Appointment Export Column Definitions
 * Strictly excludes sensitive medical history, Aadhaar/PAN, banking, and credentials.
 */
export const appointmentExportColumns = [
  { 
    key: 'appointmentId', 
    header: 'Appointment ID', 
    extractor: r => r.regNo || r.rawAppointment?.regNo || (r.id ? String(r.id).slice(-6).toUpperCase() : (r._id ? String(r._id).slice(-6).toUpperCase() : '--')) 
  },
  { 
    key: 'date', 
    header: 'Appointment Date', 
    extractor: r => r.date ? new Date(r.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '--' 
  },
  { 
    key: 'time', 
    header: 'Time Slot', 
    extractor: r => r.time || '--' 
  },
  { 
    key: 'patientId', 
    header: 'Patient ID', 
    extractor: r => r.patientId || (r.patientRaw?.patientId ? r.patientRaw.patientId : (r.patientRaw?.contact ? `#${r.patientRaw.contact.slice(-4)}` : '--')) 
  },
  { 
    key: 'patientName', 
    header: 'Patient Name', 
    extractor: r => r.patientName || r.patientRaw?.name || '--' 
  },
  { 
    key: 'doctor', 
    header: 'Doctor', 
    extractor: r => r.doctor || r.doctorId?.name || '--' 
  },
  { 
    key: 'department', 
    header: 'Department', 
    extractor: r => r.dept || r.doctorId?.specialty || r.department || 'General' 
  },
  { 
    key: 'source', 
    header: 'Type / Source', 
    extractor: r => r.source || r.rawAppointment?.source || 'Walk-In' 
  },
  { 
    key: 'status', 
    header: 'Status', 
    extractor: r => r.status ? (typeof r.status === 'string' ? r.status.charAt(0).toUpperCase() + r.status.slice(1).toLowerCase() : String(r.status)) : 'Scheduled' 
  },
  { 
    key: 'reason', 
    header: 'Reason for Visit', 
    extractor: r => r.reason || r.rawAppointment?.reason || '--' 
  }
];

/**
 * Flattens Prescriptions so each medicine item is an independent row with full prescription headers.
 * Safely handles prescriptions with 0, 1, or multiple medicine items.
 */
export function flattenPrescriptionsForExport(prescriptions = []) {
  if (!Array.isArray(prescriptions)) return [];
  const flatRows = [];

  prescriptions.forEach((p, pIdx) => {
    const pId = p.regNo || p.prescriptionId || (p._id ? `RX-${String(p._id).slice(-6).toUpperCase()}` : (p.id ? `RX-${String(p.id).slice(-6).toUpperCase()}` : `RX-${String(pIdx + 1).padStart(3, '0')}`));
    const pDate = p.createdAt || p.date || p.issuedAt;
    const pStatus = p.status ? (p.status === 'Pending Pharmacy Dispatch' ? 'Pending' : p.status) : 'Pending';

    const pPatient = p.patientId || p.patientRaw || {};
    const patientName = pPatient.name || p.name || p.patientName || 'Unknown Patient';
    const patientId = pPatient.patientId || p.patientIdCode || (pPatient.contact ? `MDC-${pPatient.contact.slice(-4)}` : (pPatient._id ? `MDC-${String(pPatient._id).slice(-4).toUpperCase()}` : '--'));

    const pDoctor = p.doctorId || {};
    const doctorName = pDoctor.name || p.docName || p.doctorName || 'Dr. Assigned';
    const doctorDept = pDoctor.specialty || pDoctor.department || p.specialty || p.dept || 'General';

    const items = Array.isArray(p.items) && p.items.length > 0 ? p.items : [{ medicine: '--', dosage: '--', duration: '--', quantity: 1, instructions: '--' }];

    items.forEach(item => {
      flatRows.push({
        rawPrescription: p,
        prescriptionId: pId,
        createdAt: pDate,
        status: pStatus,
        patientId,
        patientName,
        doctorName,
        department: doctorDept,
        item: {
          medicine: item?.medicine || '--',
          dosage: item?.dosage || '--',
          duration: item?.duration || '--',
          quantity: item?.quantity ?? 1,
          instructions: item?.instructions || '--'
        },
        linkedSaleId: p.saleId || p.pharmacySaleId || (p.sale?.saleId) || (p.dispensedSaleId) || '--',
        dispenseDate: p.dispensedAt || p.sale?.saleDate || p.dispensedDate || null,
        saleGrandTotal: p.saleGrandTotal ?? p.sale?.grandTotal ?? null
      });
    });
  });

  return flatRows;
}

/**
 * Explicit Prescription Export Column Definitions (with Linked Pharmacy Sale support)
 * Strictly excludes sensitive medical histories, Aadhaar/PAN, banking, and credentials.
 */
export const prescriptionExportColumns = [
  { 
    key: 'prescriptionId', 
    header: 'Prescription ID', 
    extractor: r => r.prescriptionId || (r._id ? `RX-${String(r._id).slice(-6).toUpperCase()}` : '--') 
  },
  { 
    key: 'createdAt', 
    header: 'Prescription Date', 
    extractor: r => r.createdAt, 
    formatter: v => v ? new Date(v).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '--' 
  },
  { 
    key: 'status', 
    header: 'Status', 
    extractor: r => r.status ? (r.status === 'Pending Pharmacy Dispatch' ? 'Pending' : r.status) : 'Pending' 
  },
  { 
    key: 'patientId', 
    header: 'Patient ID', 
    extractor: r => r.patientId || (r.patientId?.patientId ? r.patientId.patientId : (r.patientId?.contact ? `MDC-${r.patientId.contact.slice(-4)}` : '--')) 
  },
  { 
    key: 'patientName', 
    header: 'Patient Name', 
    extractor: r => r.patientName || r.patientId?.name || '--' 
  },
  { 
    key: 'doctorName', 
    header: 'Doctor Name', 
    extractor: r => r.doctorName || r.doctorId?.name || '--' 
  },
  { 
    key: 'department', 
    header: 'Department / Specialty', 
    extractor: r => r.department || r.doctorId?.specialty || r.doctorId?.department || 'General' 
  },
  { 
    key: 'medicineName', 
    header: 'Medicine Name', 
    extractor: r => r.item?.medicine || (Array.isArray(r.items) ? r.items.map(i => i.medicine).join('; ') : '--') 
  },
  { 
    key: 'dosage', 
    header: 'Dosage', 
    extractor: r => r.item?.dosage || (Array.isArray(r.items) ? r.items.map(i => i.dosage).join('; ') : '--') 
  },
  { 
    key: 'duration', 
    header: 'Duration', 
    extractor: r => r.item?.duration || (Array.isArray(r.items) ? r.items.map(i => i.duration).join('; ') : '--') 
  },
  { 
    key: 'quantity', 
    header: 'Quantity', 
    extractor: r => r.item?.quantity ?? (Array.isArray(r.items) ? r.items.reduce((s, i) => s + (Number(i.quantity) || 1), 0) : 1) 
  },
  { 
    key: 'instructions', 
    header: 'Instructions', 
    extractor: r => r.item?.instructions || (Array.isArray(r.items) ? r.items.map(i => i.instructions).filter(Boolean).join('; ') : '--') 
  },
  { 
    key: 'linkedSaleId', 
    header: 'Linked Sale ID', 
    extractor: r => r.linkedSaleId || r.saleId || r.pharmacySaleId || (r.rawPrescription?.saleId) || '--' 
  },
  { 
    key: 'dispenseDate', 
    header: 'Dispense Date', 
    extractor: r => r.dispenseDate || r.rawPrescription?.dispensedAt || r.rawPrescription?.sale?.saleDate, 
    formatter: v => v ? new Date(v).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '--' 
  },
  { 
    key: 'saleGrandTotal', 
    header: 'Sale Total (Rs.)', 
    extractor: r => r.saleGrandTotal ?? r.rawPrescription?.saleGrandTotal ?? r.rawPrescription?.sale?.grandTotal, 
    formatter: v => (v !== undefined && v !== null && v !== '--') ? Number(v || 0).toFixed(2) : '--' 
  }
];

/**
 * Authoritative Patient Records Export Column Definitions
 */
export const patientExportColumns = [
  { key: 'uhid', header: 'UHID / Patient ID', extractor: p => p.uhid || p.patientId || (p.id ? String(p.id) : (p._id ? String(p._id).slice(-6).toUpperCase() : '--')) },
  { key: 'name', header: 'Patient Name', extractor: p => p.name || '--' },
  { key: 'age', header: 'Age', extractor: p => p.age ?? '--' },
  { key: 'gender', header: 'Gender', extractor: p => p.gender ? p.gender.charAt(0).toUpperCase() + p.gender.slice(1) : '--' },
  { key: 'contact', header: 'Contact / Phone', extractor: p => p.contact || p.phone || p.mobile || '--' },
  { key: 'email', header: 'Email', extractor: p => p.email || '--' },
  { key: 'bloodGroup', header: 'Blood Group', extractor: p => p.bloodGroup || p.bloodType || '--' },
  { key: 'address', header: 'Address / City', extractor: p => p.address || p.city || '--' },
  { key: 'status', header: 'Status', extractor: p => p.status || 'Active' },
  { key: 'createdAt', header: 'Registration Date', extractor: p => p.createdAt || p.registeredAt, formatter: v => v ? new Date(v).toLocaleDateString('en-IN') : '--' }
];

/**
 * Authoritative Lab Reports Export Column Definitions
 */
export const labReportExportColumns = [
  { key: 'labId', header: 'Report ID', extractor: r => r.id || (r._id ? `#LAB-${String(r._id).slice(-6).toUpperCase()}` : '--') },
  { key: 'patientName', header: 'Patient Name', extractor: r => r.name || r.patientName || (r.patientId?.name) || '--' },
  { key: 'patientId', header: 'Patient ID', extractor: r => (r.patientId?.patientId) || (r.patientId?.uhid) || (r.patientIdStr) || '--' },
  { key: 'testName', header: 'Test Name', extractor: r => r.testName || '--' },
  { key: 'priority', header: 'Priority', extractor: r => r.priority || 'Routine' },
  { key: 'status', header: 'Status', extractor: r => r.status ? String(r.status).toUpperCase() : 'PENDING' },
  { key: 'date', header: 'Report Date', extractor: r => r.createdAt || r.date, formatter: v => v ? new Date(v).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '--' },
  { key: 'time', header: 'Time', extractor: r => r.time || (r.createdAt ? new Date(r.createdAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '--') },
  { key: 'notes', header: 'Clinical Notes / Instructions', extractor: r => r.notes || r.instructions || r.subtitle || '--' }
];



