import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import api from './api';

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
 * Generates a genuine tabular .pdf document and triggers download.
 */
/**
 * Renders a structured, multi-section hospital Goods Receipt Note (GRN) report.
 * Solves the wide-table horizontal overflow problem by generating structured cards
 * and dedicated, highly legible tables per GRN.
 */
function renderGrnStructuredPdf(doc, rows, dateRangeText, clinicName) {
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

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

    const items = grnGroups[grnId];
    const first = items[0] || {};

    // 1. Hospital Header Banner
    doc.setFillColor(37, 99, 235); // #2563EB Royal Blue
    doc.rect(0, 0, pageWidth, 20, 'F');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.setTextColor(255, 255, 255);
    doc.text(clinicName || 'CUROXA HEALTHCARE', 14, 9);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(219, 234, 254); // #DBEAFE
    doc.text('Goods Receipt Note (GRN) — Verified Stock Intake Report', 14, 15);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(255, 255, 255);
    doc.text(`GRN Number: ${grnId}`, pageWidth - 14, 12, { align: 'right' });

    // 2. Structured Metadata Card (GRN, PO, Supplier, Invoice)
    doc.setFillColor(248, 250, 252); // #F8FAFC
    doc.setDrawColor(226, 232, 240); // #E2E8F0
    doc.roundedRect(14, 23, pageWidth - 28, 26, 2, 2, 'FD');

    // Section 1: GRN & PO (Left Column)
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(30, 41, 59);
    doc.text('GRN & PO INFORMATION', 18, 29);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(71, 85, 105);
    doc.text(`GRN Date: ${first['GRN Date'] || '--'}`, 18, 35);
    doc.text(`Location: ${first['GRN Location'] || 'Main Pharmacy Store'}`, 18, 40);
    doc.text(`Status: ${first['Status'] || 'Verified/Completed'}`, 18, 45);

    doc.text(`PO Number: ${first['PO Number'] || 'Direct Purchase'}`, 78, 35);
    doc.text(`PO Date: ${first['PO Date'] || '--'}`, 78, 40);
    doc.text(`Received By: ${first['Received By'] || 'Store In-Charge'}`, 78, 45);

    // Vertical Divider
    doc.setDrawColor(203, 213, 225);
    doc.line(138, 25, 138, 47);

    // Section 2: Supplier & Invoice (Right Column)
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(30, 41, 59);
    doc.text('SUPPLIER & INVOICE DETAILS', 144, 29);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(71, 85, 105);
    doc.text(`Vendor: ${first['Vendor'] || '--'}`, 144, 35);
    doc.text(`Vendor Code: ${first['Vendor Code'] || '--'}`, 144, 40);

    doc.text(`Invoice No: ${first['Invoice Number'] || '--'}`, 210, 35);
    doc.text(`Invoice Date: ${first['Invoice Date'] || '--'}`, 210, 40);
    const invoiceAmtStr = first['Invoice Amount'] !== undefined && first['Invoice Amount'] !== '' ? Number(first['Invoice Amount'] || 0).toFixed(2) : '0.00';
    doc.text(`Invoice Amount: Rs. ${invoiceAmtStr}`, 210, 45);

    let currentY = 52;

    const printSectionHeading = (title, countText) => {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.5);
      doc.setTextColor(30, 41, 59);
      doc.text(title, 14, currentY + 3);
      if (countText) {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7.5);
        doc.setTextColor(100, 116, 139);
        doc.text(countText, pageWidth - 14, currentY + 3, { align: 'right' });
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
      margin: { left: 14, right: 14 }
    });

    currentY = doc.lastAutoTable.finalY + 4;

    // Check if new page is needed for Table 2
    if (currentY + 28 > pageHeight - 15) {
      doc.addPage();
      currentY = 16;
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
      margin: { left: 14, right: 14 }
    });

    currentY = doc.lastAutoTable.finalY + 4;

    // Check if new page is needed for Table 3
    if (currentY + 28 > pageHeight - 15) {
      doc.addPage();
      currentY = 16;
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
      margin: { left: 14, right: 14 }
    });

    currentY = doc.lastAutoTable.finalY + 4;

    // Check if summary box fits
    if (currentY + 18 > pageHeight - 15) {
      doc.addPage();
      currentY = 16;
    }

    // 6. TOTALS & INVOICE RECONCILIATION SUMMARY BOX
    doc.setFillColor(241, 245, 249); // #F1F5F9 Slate 100
    doc.setDrawColor(203, 213, 225); // #CBD5E1 Slate 300
    doc.roundedRect(14, currentY, pageWidth - 28, 14, 2, 2, 'FD');

    const totalDiscStr = first['Total Discount'] !== undefined && first['Total Discount'] !== '' ? Number(first['Total Discount'] || 0).toFixed(2) : '0.00';
    const totalGstStr = first['Total GST'] !== undefined && first['Total GST'] !== '' ? Number(first['Total GST'] || 0).toFixed(2) : '0.00';
    const grandTotalStr = first['Grand Total'] !== undefined && first['Grand Total'] !== '' ? Number(first['Grand Total'] || 0).toFixed(2) : '0.00';

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(71, 85, 105);
    doc.text(`Total Discount: Rs. ${totalDiscStr}`, 20, currentY + 5.5);
    doc.text(`Total GST: Rs. ${totalGstStr}`, 75, currentY + 5.5);
    doc.text(`Invoice Ref: ${first['Invoice Number'] || '--'} (Rs. ${invoiceAmtStr})`, 130, currentY + 5.5);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(30, 64, 175); // Dark Blue
    doc.text(`GRN Grand Total: Rs. ${grandTotalStr}`, pageWidth - 22, currentY + 9, { align: 'right' });
  });

  // 7. Stamp Page Footers on all pages
  const totalPages = doc.internal.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(148, 163, 184); // #94A3B8
    doc.text(`Page ${i} of ${totalPages}`, pageWidth / 2, pageHeight - 6, { align: 'center' });
    doc.text('CUROXA HEALTHCARE — Confidential Authorized Hospital Document', 14, pageHeight - 6);
    doc.text(`Date Range: ${dateRangeText}`, pageWidth - 14, pageHeight - 6, { align: 'right' });
  }
}

/**
 * Renders structured Prescription Multi-Page Report.
 * Groups prescribed medicines under their respective prescription header blocks.
 */
export function renderPrescriptionStructuredPdf(doc, rows = [], dateRangeText, clinicName) {
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

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

  let currentY = 14;

  const drawPageHeader = (isFirstPage = false) => {
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
  };

  drawPageHeader(true);

  rxList.forEach((rx, index) => {
    // Check if new page is needed before starting a prescription block
    if (currentY + 45 > pageHeight - 15) {
      doc.addPage();
      drawPageHeader(false);
    }

    // Prescription Header Banner Card
    doc.setFillColor(241, 245, 249); // #F1F5F9 Slate 100
    doc.setDrawColor(203, 213, 225); // #CBD5E1 Slate 300
    doc.roundedRect(14, currentY, pageWidth - 28, 16, 2, 2, 'FD');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(15, 23, 42); // Slate 900
    doc.text(`Prescription: ${rx.prescriptionId}`, 18, currentY + 6);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(71, 85, 105);
    doc.text(`Date: ${rx.date}`, 80, currentY + 6);
    doc.text(`Status: ${rx.status}`, pageWidth - 18, currentY + 6, { align: 'right' });

    doc.setFont('helvetica', 'bold');
    doc.setTextColor(30, 41, 59);
    doc.text(`Patient: ${rx.patientName} (${rx.patientId})`, 18, currentY + 12);
    doc.text(`Doctor: ${rx.doctorName} [${rx.department}]`, 120, currentY + 12);

    currentY += 18;

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
        fontSize: 8,
        fontStyle: 'bold',
        cellPadding: 2
      },
      bodyStyles: {
        fontSize: 7.5,
        textColor: [30, 41, 59],
        cellPadding: 1.8
      },
      alternateRowStyles: {
        fillColor: [248, 250, 252]
      },
      columnStyles: {
        0: { cellWidth: 10, halign: 'center' },
        1: { cellWidth: 65 },
        2: { cellWidth: 32 },
        3: { cellWidth: 28 },
        4: { cellWidth: 15, halign: 'center' },
        5: { cellWidth: 'auto' }
      },
      margin: { left: 14, right: 14 }
    });

    currentY = doc.lastAutoTable.finalY + 8;
  });

  // Footer page numbering on all pages
  const totalPages = doc.internal.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(148, 163, 184);
    doc.text(`Page ${i} of ${totalPages}`, pageWidth / 2, pageHeight - 8, { align: 'center' });
    doc.text('Confidential — Authorized Hospital Records', 14, pageHeight - 8);
  }
}

/**
 * Generates a polished PDF file using jsPDF and jspdf-autotable.
 * Supports structured reports for complex multi-section records (e.g. GRNs)
 * and generic tabular layouts for other datasets.
 */
export function generatePdfFile({ dataset, rows, columns, dateRangeText, clinicName, fileName }) {
  const isLandscape = columns.length > 5;
  const doc = new jsPDF({
    orientation: isLandscape ? 'landscape' : 'portrait',
    unit: 'mm',
    format: 'a4'
  });

  if (dataset === 'GRNs') {
    renderGrnStructuredPdf(doc, rows, dateRangeText, clinicName);
    doc.save(fileName);
    return;
  }
  if (dataset === 'Prescriptions') {
    renderPrescriptionStructuredPdf(doc, rows, dateRangeText, clinicName);
    doc.save(fileName);
    return;
  }

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  // Header Banner styling
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

  // Metadata block
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

  const headers = columns.map(c => c.header || c.key);
  const tableData = rows.map(r => headers.map(h => String(r[h] !== undefined ? r[h] : '')));

  // Tabular Body via jspdf-autotable
  autoTable(doc, {
    startY: 41,
    head: [headers],
    body: tableData,
    theme: 'grid',
    headStyles: {
      fillColor: [30, 41, 59], // #1E293B Slate 800
      textColor: [255, 255, 255],
      fontSize: 8.5,
      fontStyle: 'bold',
      halign: 'left',
      cellPadding: 2.5
    },
    bodyStyles: {
      fontSize: 8,
      textColor: [30, 41, 59],
      cellPadding: 2.2
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
    margin: { left: 14, right: 14, top: 41, bottom: 16 },
    didDrawPage: (data) => {
      // Footer page numbering
      const str = `Page ${doc.internal.getNumberOfPages()}`;
      doc.setFontSize(8);
      doc.setTextColor(148, 163, 184); // #94A3B8
      doc.text(str, pageWidth / 2, pageHeight - 8, { align: 'center' });
      doc.text('Confidential — Authorized Hospital Records', 14, pageHeight - 8);
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
    : (rangeType === 'Custom Range'
        ? `${formatDateStr(startDate)} - ${formatDateStr(endDate)}`
        : `${rangeType} (${formatDateStr(startDate)} - ${formatDateStr(endDate)})`);

  // 4. Construct safe, clean file name
  const cleanDatasetName = dataset.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  const timestampStr = new Date().toISOString().slice(0, 10);
  const ext = format === 'pdf' ? 'pdf' : 'xlsx';
  const fileName = `${cleanDatasetName}_export_${timestampStr}.${ext}`;

  // 5. Generate and download file
  if (format === 'pdf') {
    await generatePdfFile({
      dataset,
      rows,
      columns,
      dateRangeText,
      clinicName,
      fileName
    });
  } else if (format === 'excel') {
    await generateExcelFile({
      dataset,
      rows,
      columns,
      dateRangeText,
      fileName
    });
  } else {
    throw new Error(`Unsupported export format: "${format}". Supported formats are "excel" and "pdf".`);
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
 * Explicit Inventory Export Column Definitions
 * Strictly excludes internal MongoDB identifiers, tenant secrets, and credentials.
 */
export const inventoryExportColumns = [
  { key: 'sku', header: 'SKU Code', extractor: r => r.sku || '--' },
  { key: 'name', header: 'Medicine Name', extractor: r => r.name || '--' },
  { key: 'category', header: 'Category', extractor: r => r.category || '--' },
  { key: 'stock', header: 'Current Stock', extractor: r => Number(r.stock) || 0 },
  { key: 'unit', header: 'Unit', extractor: r => r.unit || '--' },
  { key: 'mrp', header: 'MRP (Rs.)', extractor: r => r.mrp ? Number(r.mrp).toFixed(2) : '0.00' },
  { key: 'status', header: 'Stock Status', extractor: r => r.status || (Number(r.stock) > 20 ? 'In Stock' : Number(r.stock) > 0 ? 'Low Stock' : 'Out of Stock') },
  { key: 'expiry', header: 'Expiry Date', extractor: r => r.expiry || '--' },
  { key: 'updatedAt', header: 'Last Updated', extractor: r => r.updatedAt ? new Date(r.updatedAt).toLocaleDateString('en-IN') : (r.createdAt ? new Date(r.createdAt).toLocaleDateString('en-IN') : '--') }
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
        }
      });
    });
  });

  return flatRows;
}

/**
 * Explicit Prescription Export Column Definitions (12 Whitelist Columns)
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
  }
];



