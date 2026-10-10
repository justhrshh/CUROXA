/**
 * Standard Half-A4 Receipt Printing Utility for CUROXA.
 * Formatted strictly for Half of A4 size sheet (210mm x 148.5mm / A5 Landscape).
 * Matches exact clinical diagnostic / hospital invoice cum receipt layout.
 * Dynamic Hospital Name, Logo, Address, Contact, and Parent Society resolved dynamically.
 */

import { resolveDynamicHospital } from './printDocHelper';
import { getActivePortalBranding } from '../context/PortalBrandingContext';

/**
 * Generates dynamic SVG barcode stripes with label underneath
 */
export function generateBarcodeSvg(code = '199338', width = 130, height = 28) {
  const clean = String(code || '199338').replace(/[^a-zA-Z0-9]/g, '') || '199338';
  let barPattern = [2, 1, 3, 1, 1, 2, 4, 1, 2, 2, 1, 3, 1, 2, 3, 1, 1, 4, 2, 1, 2, 3, 1, 1, 3, 2, 1, 4];
  
  // Seed pseudorandom variation from string chars
  let seed = 0;
  for (let i = 0; i < clean.length; i++) {
    seed = (seed * 31 + clean.charCodeAt(i)) % 9973;
  }
  
  const rects = [];
  let currentX = 2;
  const barHeight = height - 4;
  
  for (let i = 0; i < 34; i++) {
    const bit = (seed + i * 17) % 7;
    const barWidth = (bit % 3 === 0 ? 3 : (bit % 2 === 0 ? 2 : 1));
    const spaceWidth = ((bit + 1) % 3 === 0 ? 3 : ((bit + 1) % 2 === 0 ? 2 : 1));
    
    if (currentX + barWidth > width - 2) break;
    rects.push(`<rect x="${currentX}" y="1" width="${barWidth}" height="${barHeight}" fill="#000000" />`);
    currentX += barWidth + spaceWidth;
  }

  return `
    <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg" style="display: block;">
      ${rects.join('\n')}
    </svg>
  `;
}

/**
 * Format date to standard receipt format: DD-MMM-YYYY HH:mm:ss
 */
export function formatReceiptDateTime(dateVal) {
  const d = dateVal ? new Date(dateVal) : new Date();
  if (isNaN(d.getTime())) return new Date().toLocaleDateString('en-GB') + ' ' + new Date().toLocaleTimeString();
  
  const day = String(d.getDate()).padStart(2, '0');
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const month = monthNames[d.getMonth()] || 'Jan';
  const year = d.getFullYear();
  
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  const seconds = String(d.getSeconds()).padStart(2, '0');
  
  return `${day}-${month}-${year} ${hours}:${minutes}:${seconds}`;
}

export function formatReceiptDateOnly(dateVal) {
  const d = dateVal ? new Date(dateVal) : new Date();
  if (isNaN(d.getTime())) return new Date().toLocaleDateString('en-GB');
  
  const day = String(d.getDate()).padStart(2, '0');
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const month = monthNames[d.getMonth()] || 'Jan';
  const year = d.getFullYear();
  return `${day}-${month}-${year}`;
}

/**
 * Generates the complete Half-A4 Receipt HTML string
 */
export function generateReceiptHtml(receiptData = {}, clinicName = null, options = {}) {
  // 1. Resolve Dynamic Hospital Info
  const hospital = resolveDynamicHospital(clinicName, {
    ...options,
    hospitalName: receiptData.hospitalName || options.hospitalName,
    hospitalLogo: receiptData.hospitalLogo || options.hospitalLogo,
    hospitalAddress: receiptData.hospitalAddress || options.hospitalAddress,
    hospitalPhone: receiptData.hospitalPhone || options.hospitalPhone,
  });

  let currentUser = {};
  try {
    currentUser = JSON.parse(localStorage.getItem('user') || '{}');
  } catch (e) {}

  const activeBranding = getActivePortalBranding() || {};

  // Hospital Name & Parent Entity
  const displayName = receiptData.hospitalName || hospital.name || 'CHARAK MEDICAL CENTRE';
  const runByEntity = receiptData.runBy || activeBranding.runBy || activeBranding.societyName || currentUser.societyName || `${displayName.toUpperCase()} HEALTHCARE SOCIETY (REGD)`;
  const displayAddress = receiptData.hospitalAddress || hospital.address || 'Main Road, Medical Complex';
  const displayPhone = receiptData.hospitalPhone || hospital.phone || '011-41421738';
  const displayEmail = receiptData.hospitalEmail || currentUser.email || 'care@curoxa.com';

  // Patient Info
  const patientName = receiptData.patientName || receiptData.name || receiptData.customerName || 'Patient';
  const titlePrefix = receiptData.title ? `${receiptData.title} ` : (patientName.match(/^(Mr|Mrs|Ms|Dr|Master|Baby)\.?\s/i) ? '' : '');
  const formattedPatientName = `${titlePrefix}${patientName}`.toUpperCase();

  const age = receiptData.age !== undefined && receiptData.age !== '' ? receiptData.age : '—';
  const gender = receiptData.gender || '—';
  const ageGenderStr = `${age} YRS / ${gender}`;

  const mobileNo = receiptData.contact || receiptData.mobile || receiptData.phone || receiptData.customerMobile || '—';
  const regNo = receiptData.regNo || receiptData.patientId || receiptData.uhid || '199338';
  const referredBy = receiptData.referredBy || receiptData.doctorName || receiptData.refBy || 'Self / Direct';
  const proposalNo = receiptData.proposalNo || receiptData.proposalId || receiptData.tokenNumber || receiptData.token || '—';
  const clinicalHistory = receiptData.clinicalHistory || receiptData.history || receiptData.diagnosis || '—';

  // Receipt & Billing Meta
  const receiptNo = receiptData.receiptNo || receiptData.invoiceNo || receiptData.billNo || receiptData.saleId || `REC-${Date.now().toString().slice(-6)}`;
  const barcodeNo = receiptData.barcodeNo || receiptData.barcode || regNo || '10441854';
  const deliveryMode = receiptData.deliveryMode || receiptData.paymentMethod || 'Self';
  const regDateStr = formatReceiptDateTime(receiptData.date || receiptData.createdAt || Date.now());
  const partyName = receiptData.partyName || 'Standard';
  const patientAddress = receiptData.address || receiptData.city || 'Delhi';

  // Document Title
  const documentTitle = receiptData.documentTitle || receiptData.receiptType || 'INVOICE CUM RECEIPT';

  // Table Items
  const items = Array.isArray(receiptData.items) && receiptData.items.length > 0 
    ? receiptData.items 
    : [{
        description: receiptData.testName || receiptData.description || 'Clinical Consultation',
        sampleType: receiptData.sampleType || receiptData.category || 'Clinical',
        deliveryDate: formatReceiptDateOnly(Date.now()),
        amount: Number(receiptData.totalAmount || receiptData.amount || 0)
      }];

  const itemsHtml = items.map((it, idx) => {
    const desc = it.description || it.name || it.medicineName || it.testName || it.particulars || 'Service';
    const sampleType = it.sampleType || it.specimen || it.unit || (it.quantity ? `${it.quantity} Qty` : '—');
    const deliveryDate = it.deliveryDate ? formatReceiptDateOnly(it.deliveryDate) : formatReceiptDateOnly(Date.now());
    const amt = Number(it.amount ?? it.netAmount ?? it.price ?? 0);

    return `
      <tr style="line-height: 1.25;">
        <td style="padding: 3px 6px; text-align: left; font-size: 11px; color: #000; vertical-align: top;">${idx + 1}</td>
        <td style="padding: 3px 6px; text-align: left; font-size: 11px; font-weight: 700; color: #000; vertical-align: top;">
          ${desc.toUpperCase()}
          ${it.labName ? `<div style="font-size: 9.5px; font-weight: 700; color: #1D4ED8; margin-top: 1px;">LABORATORY: ${it.labName.toUpperCase()}</div>` : ''}
          ${it.sku ? `<div style="font-size: 9.5px; font-weight: normal; color: #444;">SKU: ${it.sku}</div>` : ''}
        </td>
        <td style="padding: 3px 6px; text-align: left; font-size: 11px; color: #000; vertical-align: top;">${sampleType}</td>
        <td style="padding: 3px 6px; text-align: left; font-size: 11px; color: #000; vertical-align: top;">${deliveryDate}</td>
        <td style="padding: 3px 6px; text-align: right; font-size: 11px; font-weight: 700; color: #000; vertical-align: top;">${amt.toFixed(2)}</td>
      </tr>
    `;
  }).join('');

  // Computations
  const originalAmount = Number(receiptData.originalAmount ?? receiptData.subtotal ?? receiptData.totalAmount ?? 0);
  const discountAmount = Number(receiptData.discountAmount ?? receiptData.totalDiscount ?? 0);
  const totalAmount = Number(receiptData.totalAmount ?? receiptData.grandTotal ?? originalAmount - discountAmount);
  const amountPaid = Number(receiptData.amountPaid ?? receiptData.amountReceived ?? totalAmount);
  const balanceDue = Math.max(0, totalAmount - amountPaid);

  // Settlement Log lines
  const paymentMethod = receiptData.paymentMethod || receiptData.paymentMode || 'Cash';
  const rawSettlements = receiptData.settlements || receiptData.payments || [];
  const settlementLines = Array.isArray(rawSettlements) && rawSettlements.length > 0
    ? rawSettlements.map(item => {
        if (typeof item === 'string') return item;
        const method = item.method || 'Payment';
        const amt = Number(item.amount || 0).toFixed(2);
        const refStr = item.transactionRef ? ` [Ref: ${item.transactionRef}]` : '';
        const dateStr = item.date ? formatReceiptDateOnly(item.date) : formatReceiptDateOnly(Date.now());
        return `${method}::(₹${amt}) Settlement on ${dateStr}${refStr}`;
      })
    : [
        `${paymentMethod}::(${amountPaid.toFixed(2)}) Settlement on ${formatReceiptDateOnly(Date.now())} ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} ${amountPaid.toFixed(2)}`
      ];

  // Operator / Cashier
  const createdBy = (receiptData.createdBy || receiptData.pharmacistName || currentUser.name || 'RECEPTIONIST').toUpperCase();
  const printDateTime = new Date().toLocaleDateString('en-US') + '   ' + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

  // Online portal url
  const portalUrl = receiptData.portalUrl || activeBranding.portalUrl || 'www.curoxa.com';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${documentTitle} - ${receiptNo}</title>
  <style>
    @page {
      size: 210mm 148.5mm;
      margin: 3.5mm 5mm;
    }
    *, *::before, *::after {
      box-sizing: border-box;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    html, body {
      margin: 0;
      padding: 0;
      background: #FFFFFF;
      color: #000000;
      font-family: Arial, Helvetica, sans-serif;
      font-size: 11px;
      line-height: 1.25;
      width: 210mm;
      height: 148.5mm;
    }
    .receipt-container {
      width: 100%;
      max-width: 200mm;
      min-height: 139mm;
      height: 139mm;
      margin: 0 auto;
      padding: 3.5mm 5mm;
      box-sizing: border-box;
      overflow: hidden;
      page-break-after: avoid;
      border: 1.5px solid #000000;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
    }
    table {
      width: 100%;
      border-collapse: collapse;
    }
    .bold {
      font-weight: bold;
    }
    .bolder {
      font-weight: 900;
    }
    .nowrap {
      white-space: nowrap;
    }
    @media print {
      html, body {
        width: 210mm !important;
        height: 148.5mm !important;
        margin: 0 !important;
        padding: 0 !important;
      }
      .receipt-container {
        width: 200mm !important;
        max-width: 200mm !important;
        height: 139mm !important;
        max-height: 139mm !important;
        margin: 0 auto !important;
        padding: 3.5mm 5mm !important;
        border: 1.5px solid #000000 !important;
        box-sizing: border-box !important;
        page-break-after: avoid !important;
      }
      .no-print {
        display: none !important;
      }
    }
  </style>
</head>
<body>
  <div class="receipt-container">
    
    <!-- 1. TOP HEADER -->
    <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 2px;">
      
      <!-- Left: Logo & Hospital/Clinic Name -->
      <div style="display: flex; align-items: center; gap: 8px;">
        <div style="width: 58px; height: 42px; border: 1.5px solid #000; display: flex; align-items: center; justify-content: center; padding: 2px; flex-shrink: 0; background: #FFF;">
          ${hospital.logoImageSrc ? `
            <img src="${hospital.logoImageSrc}" alt="Logo" style="max-width: 100%; max-height: 100%; object-fit: contain;" />
          ` : `
            <div style="text-align: center;">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#000" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <line x1="12" y1="5" x2="12" y2="19"></line>
                <line x1="5" y1="12" x2="19" y2="12"></line>
              </svg>
              <div style="font-size: 7px; font-weight: 900; letter-spacing: 0.5px;">CARE</div>
            </div>
          `}
        </div>
        <div>
          <div style="font-family: Arial, sans-serif; font-size: 19px; font-weight: 900; line-height: 1.05; letter-spacing: -0.3px; text-transform: uppercase; color: #000;">
            ${displayName}
          </div>
        </div>
      </div>

      <!-- Right: Run By & Address Details -->
      <div style="text-align: right; max-width: 58%;">
        <div style="font-size: 10px; font-weight: bold; color: #000; text-transform: uppercase;">RUN BY:</div>
        <div style="font-size: 11.5px; font-weight: 900; color: #000; text-transform: uppercase; line-height: 1.2;">
          ${runByEntity}
        </div>
        <div style="font-size: 9.5px; color: #000; margin-top: 1px; line-height: 1.2;">
          ${displayAddress}
        </div>
        <div style="font-size: 9.5px; color: #000; line-height: 1.2;">
          Ph: ${displayPhone} &nbsp; Email: ${displayEmail}
        </div>
      </div>

    </div>

    <!-- 2. BARCODE & DOCUMENT TITLE -->
    <div style="display: flex; justify-content: space-between; align-items: flex-end; margin-top: 2px; margin-bottom: 4px;">
      <div style="width: 130px;">
        ${generateBarcodeSvg(barcodeNo, 130, 24)}
      </div>
      <div style="flex: 1; text-align: center; font-size: 12.5px; font-weight: 900; text-decoration: underline; letter-spacing: 0.5px; text-transform: uppercase;">
        ${documentTitle}
      </div>
      <div style="width: 130px; text-align: right;">
        <!-- Right alignment balance -->
      </div>
    </div>

    <!-- 3. PATIENT & REGISTRATION METADATA GRID (TWO COLUMNS) -->
    <div style="display: grid; grid-template-columns: 52% 48%; gap: 6px; font-size: 10.5px; line-height: 1.35; margin-bottom: 4px;">
      
      <!-- Left Column -->
      <div>
        <table style="width: 100%;">
          <tr>
            <td style="width: 95px; font-weight: 600; color: #000;">Name :</td>
            <td style="font-weight: 900; color: #000;">${formattedPatientName}</td>
          </tr>
          <tr>
            <td style="font-weight: 600; color: #000;">Age/Gender :</td>
            <td style="color: #000;">${ageGenderStr}</td>
          </tr>
          <tr>
            <td style="font-weight: 600; color: #000;">Mobile No. :</td>
            <td style="color: #000;">${mobileNo}</td>
          </tr>
          <tr>
            <td style="font-weight: 600; color: #000;">Reg No. :</td>
            <td style="font-weight: 700; color: #000;">${regNo}</td>
          </tr>
          <tr>
            <td style="font-weight: 600; color: #000;">Refered By :</td>
            <td style="color: #000;">${referredBy}</td>
          </tr>
          <tr>
            <td style="font-weight: 600; color: #000;">Proposal No/ID No. :</td>
            <td style="color: #000;">${proposalNo}</td>
          </tr>
          <tr>
            <td style="font-weight: 600; color: #000;">Clinical History :</td>
            <td style="color: #000;">${clinicalHistory}</td>
          </tr>
        </table>
      </div>

      <!-- Right Column -->
      <div>
        <table style="width: 100%;">
          <tr>
            <td style="width: 95px; font-weight: 600; color: #000;">Lab No. / Inv No. :</td>
            <td style="font-weight: 700; color: #000;">${receiptNo}</td>
          </tr>
          <tr>
            <td style="font-weight: 600; color: #000;">Barcode No. :</td>
            <td style="color: #000;">${barcodeNo}</td>
          </tr>
          <tr>
            <td style="font-weight: 600; color: #000;">Delivery Mode :</td>
            <td style="color: #000;">${deliveryMode}</td>
          </tr>
          <tr>
            <td style="font-weight: 600; color: #000;">Reg. Date :</td>
            <td style="color: #000;">${regDateStr}</td>
          </tr>
          <tr>
            <td style="font-weight: 600; color: #000;">Party Name :</td>
            <td style="color: #000;">${partyName}</td>
          </tr>
          <tr>
            <td style="font-weight: 600; color: #000;">Address :</td>
            <td style="color: #000;">${patientAddress}</td>
          </tr>
        </table>
      </div>

    </div>

    <!-- 4. ITEMS TABLE -->
    <div style="margin-top: 4px; margin-bottom: 2px;">
      <table style="width: 100%; border-top: 1.5px solid #000; border-bottom: 1.5px solid #000;">
        <thead>
          <tr style="border-bottom: 1px solid #000;">
            <th style="padding: 3px 6px; text-align: left; font-size: 10.5px; font-weight: 900; color: #000; width: 6%;">Sr.No</th>
            <th style="padding: 3px 6px; text-align: left; font-size: 10.5px; font-weight: 900; color: #000; width: 44%;">Particulars</th>
            <th style="padding: 3px 6px; text-align: left; font-size: 10.5px; font-weight: 900; color: #000; width: 22%;">Sample Type</th>
            <th style="padding: 3px 6px; text-align: left; font-size: 10.5px; font-weight: 900; color: #000; width: 14%;">DeliveryDate</th>
            <th style="padding: 3px 6px; text-align: right; font-size: 10.5px; font-weight: 900; color: #000; width: 14%;">Amt ( Rs. )</th>
          </tr>
        </thead>
        <tbody>
          ${itemsHtml}
        </tbody>
      </table>
    </div>

    <!-- 5. TOTALS & SETTLEMENT SUMMARY -->
    <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-top: 4px; font-size: 10.5px;">
      
      <!-- Left: Settlement History -->
      <div style="max-width: 65%;">
        ${settlementLines.map(line => `<div style="color: #000; font-size: 10px; line-height: 1.3;">${line}</div>`).join('')}
        ${discountAmount > 0 ? `<div style="color: #000; font-size: 10px; line-height: 1.3;">Discount Applied : -₹${discountAmount.toFixed(2)}</div>` : ''}
      </div>

      <!-- Right: Subtotal & Amount Paid -->
      <div style="width: 190px; text-align: right;">
        <div style="display: flex; justify-content: space-between; padding: 1px 0; font-size: 11px;">
          <span style="font-weight: 600;">Total :</span>
          <span style="font-weight: 900;">${totalAmount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
        </div>
        <div style="border-bottom: 1px solid #000; margin: 2px 0;"></div>
        <div style="display: flex; justify-content: space-between; padding: 1px 0; font-size: 11px;">
          <span style="font-weight: 700;">Amount Paid :</span>
          <span style="font-weight: 900;">${amountPaid.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
        </div>
        ${balanceDue > 0 ? `
          <div style="display: flex; justify-content: space-between; padding: 1px 0; font-size: 11px; color: #B91C1C;">
            <span style="font-weight: 700;">Balance Due :</span>
            <span style="font-weight: 900;">${balanceDue.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
          </div>
        ` : ''}
      </div>

    </div>

    <!-- 7. DIVIDER & DISCLAIMER -->
    <div style="margin-top: 4px; border-bottom: 1px dashed #000; position: relative;">
      <span style="position: absolute; right: 0; bottom: -6px; background: #FFF; padding-left: 6px; font-size: 9.5px; font-weight: 700;">E. & O.E.</span>
    </div>

    <div style="margin-top: 6px; font-size: 9.5px; color: #000; line-height: 1.25;">
      <div>${displayName} is not responsible for loss of any items in the premises</div>
      <div>Reports Timing at 4:30pm To 5:30pm</div>
    </div>

    <!-- 8. FOOTER METADATA -->
    <div style="margin-top: 6px; border-top: 1px solid #000; padding-top: 3px; display: flex; justify-content: space-between; align-items: center; font-size: 10px;">
      <div>
        Created By : &nbsp;&nbsp;<strong>${createdBy}</strong>
      </div>
      <div>
        Print DateTime : &nbsp;&nbsp;${printDateTime}
      </div>
      <div>
        Page 1 of 1
      </div>
    </div>

  </div>
</body>
</html>`;
}

/**
 * Universal printReceipt trigger: Uses a hidden iframe to print cleanly on Half A4.
 */
export const printReceipt = (receiptData = {}, clinicName = null, options = {}) => {
  return new Promise((resolve) => {
    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.left = '-9999px';
    iframe.style.top = '-9999px';
    iframe.style.width = '210mm';
    iframe.style.height = '148.5mm';
    iframe.style.border = '0';
    document.body.appendChild(iframe);

    const doc = iframe.contentWindow.document;
    const html = generateReceiptHtml(receiptData, clinicName, options);

    doc.open();
    doc.write(html);
    doc.close();

    const trigger = () => {
      setTimeout(() => {
        try {
          iframe.contentWindow.focus();
          iframe.contentWindow.print();
        } catch (e) {
          console.error("Print trigger failed:", e);
        }
        setTimeout(() => {
          if (iframe.parentNode) {
            iframe.parentNode.removeChild(iframe);
          }
          resolve(true);
        }, 1000);
      }, 400);
    };

    if (iframe.contentWindow.document.readyState === 'complete') {
      trigger();
    } else {
      iframe.contentWindow.onload = trigger;
    }
  });
};
