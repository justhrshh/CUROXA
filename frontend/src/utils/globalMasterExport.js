import { getAccessToken } from './authTokenStore';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

/**
 * globalMasterExport.js
 * 
 * QUROXA DEDICATED GLOBAL MASTER EXPORT UTILITY
 * 
 * NOTE: This is COMPLETELY SEPARATE from the existing hospital-letterhead
 * export engine (exportEngine.js). It does NOT use hospital letterhead,
 * hospital logos, or tenant-specific templates.
 * 
 * Exports are strictly scoped to the active Category + Department context.
 */

/**
 * Download Hospital Commercial Excel workbook (.xlsx)
 * Includes visible MRP column for hospital selection.
 */
export async function downloadHospitalExcel(category, department) {
  return downloadMasterExcel(category, department, 'HOSPITAL_COMMERCIAL');
}

/**
 * Download Canonical Global Master Excel workbook (.xlsx)
 * Pure client registry structure.
 */
export async function downloadCanonicalExcel(category, department) {
  return downloadMasterExcel(category, department, 'GLOBAL_CANONICAL');
}

/**
 * Download department-wise Master Excel workbook (.xlsx)
 * Round-trip compatible with Hospital Master Upload parser.
 * Defaults to 'HOSPITAL_COMMERCIAL' for the hospital selection workflow.
 */
export async function downloadMasterExcel(category, department, exportType = 'HOSPITAL_COMMERCIAL') {
  if (!category) {
    throw new Error('Please select a category first to export.');
  }

  const token = getAccessToken() || localStorage.getItem('token');
  let url = `/api/superadmin/masters/export/excel?category=${encodeURIComponent(category)}&exportType=${encodeURIComponent(exportType)}`;
  const isSpecificDept = department && department !== 'all' && department.trim() !== '';
  if (isSpecificDept) {
    url += `&department=${encodeURIComponent(department.trim())}`;
  }

  const res = await fetch(url, {
    headers: token ? { Authorization: `Bearer ${token}` } : {}
  });

  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.error || `Failed to export Master Excel (${res.status})`);
  }

  const blob = await res.blob();
  const disposition = res.headers.get('content-disposition');
  let filename = `Quroxa_Master_${category.replace(/\s+/g, '_')}${isSpecificDept ? '_' + department.trim().replace(/\s+/g, '_') : ''}.xlsx`;
  if (disposition && disposition.includes('filename=')) {
    const match = disposition.match(/filename="?([^";]+)"?/);
    if (match && match[1]) filename = match[1];
  }

  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(link.href);
}

/**
 * Download department-wise clean Global Master PDF
 * Uses jspdf and jspdf-autotable without any hospital branding.
 */
export async function downloadMasterPdf(category, department) {
  if (!category) {
    throw new Error('Please select a category first to export.');
  }

  const token = getAccessToken() || localStorage.getItem('token');
  let url = `/api/superadmin/masters/export/data?category=${encodeURIComponent(category)}`;
  const isSpecificDept = department && department !== 'all' && department.trim() !== '';
  if (isSpecificDept) {
    url += `&department=${encodeURIComponent(department.trim())}`;
  }

  const res = await fetch(url, {
    headers: token ? { Authorization: `Bearer ${token}` } : {}
  });

  const json = await res.json();
  if (!json.success || !Array.isArray(json.data)) {
    throw new Error(json.error || 'Failed to load master records for PDF export');
  }

  const items = json.data;

  // Initialize jsPDF (Landscape for enterprise readability)
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });

  // 1. Header Section
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.setTextColor(15, 23, 42); // slate-900
  doc.text('QUROXA GLOBAL MASTER CATALOG', 14, 15);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(71, 85, 105); // slate-600
  const deptStr = isSpecificDept ? ` | Department: ${department.trim()}` : ' | Department: All Departments';
  doc.text(`Category: ${category}${deptStr} | Total Records: ${items.length}`, 14, 21);

  doc.setFontSize(8.5);
  doc.setTextColor(148, 163, 184); // slate-400
  doc.text(`Generated: ${new Date().toLocaleString()} | Strict Canonical Specification`, 14, 26);

  // 2. Table Data Generation
  const head = [['S.No', 'Item Code', 'Item Name', 'Specification / Details', 'Manufacturer / Catalog', 'Status']];
  
  const body = items.map((it, idx) => {
    const code = it.itemCode || '-';
    const name = it.itemName || it.genericName || '-';
    const spec = it.itemDescription || it.specification || (it.categoryData && it.categoryData.specification) || '-';
    const mfg = [it.manufacturer || (it.categoryData && it.categoryData.manufactureName), it.catalogNo || (it.categoryData && it.categoryData.catalogNo)]
      .filter(Boolean)
      .join(' | ') || '-';
    const status = it.status || 'Active';

    return [idx + 1, code, name, spec, mfg, status];
  });

  autoTable(doc, {
    startY: 30,
    head: head,
    body: body.length > 0 ? body : [['-', '-', 'No master items registered in this department yet.', '-', '-', '-']],
    theme: 'grid',
    styles: {
      fontSize: 8,
      cellPadding: 2.5,
      textColor: [30, 41, 59],
      overflow: 'linebreak',
      lineColor: [226, 232, 240],
      lineWidth: 0.2
    },
    headStyles: {
      fillColor: [37, 99, 235], // primary blue
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 8.5
    },
    alternateRowStyles: {
      fillColor: [248, 250, 252]
    },
    columnStyles: {
      0: { cellWidth: 14, halign: 'center' },
      1: { cellWidth: 26, fontStyle: 'bold' },
      2: { cellWidth: 65 },
      3: { cellWidth: 80 },
      4: { cellWidth: 55 },
      5: { cellWidth: 22, halign: 'center' }
    },
    didDrawPage: (data) => {
      // Footer page numbering
      const pageCount = doc.internal.getNumberOfPages();
      doc.setFontSize(8);
      doc.setTextColor(148, 163, 184);
      doc.text(
        `Page ${doc.internal.getCurrentPageInfo().pageNumber} of ${pageCount} — Quroxa Enterprise Master Data`,
        data.settings.margin.left,
        doc.internal.pageSize.height - 8
      );
    }
  });

  const safeCat = category.replace(/\s+/g, '_');
  const safeDept = isSpecificDept ? `_${department.trim().replace(/\s+/g, '_')}` : '';
  const pdfFilename = `Quroxa_Master_${safeCat}${safeDept}.pdf`;

  doc.save(pdfFilename);
}
