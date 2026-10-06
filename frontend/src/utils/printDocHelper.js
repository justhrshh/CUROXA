/**
 * Helper utility to generate and download/print PO and GRN documents as PDF using browser's print engine.
 * Matches exact ERP / Standard Medical Diagnostics Purchase Order layout.
 * Dynamic Hospital Name, Logo, Address, and State resolved strictly from active logged-in hospital context.
 */

import { getActivePortalBranding } from '../context/PortalBrandingContext';

export function numberToWordsIndian(num) {
  if (num === null || num === undefined || isNaN(num)) return '';
  num = Math.round(Number(num) * 100) / 100;
  if (num === 0) return 'Zero Only';

  const [intPartStr, decPartStr] = num.toFixed(2).split('.');
  const intVal = parseInt(intPartStr, 10);
  const decVal = parseInt(decPartStr, 10);

  const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 
                'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

  function convertTwoDigits(n) {
    if (n === 0) return '';
    if (n < 20) return ones[n];
    const t = tens[Math.floor(n / 10)];
    const o = ones[n % 10];
    return t + (o ? '-' + o : '');
  }

  function convertThreeDigits(n) {
    const h = Math.floor(n / 100);
    const r = n % 100;
    let res = '';
    if (h > 0) {
      res += ones[h] + ' Hundred';
    }
    if (r > 0) {
      if (res) res += ' ';
      res += convertTwoDigits(r);
    }
    return res;
  }

  function convertNumber(n) {
    if (n === 0) return '';
    let result = '';

    const crores = Math.floor(n / 10000000);
    n %= 10000000;
    const lakhs = Math.floor(n / 100000);
    n %= 100000;
    const thousands = Math.floor(n / 1000);
    n %= 1000;
    const hundreds = n;

    if (crores > 0) {
      result += convertNumber(crores) + ' Crore ';
    }
    if (lakhs > 0) {
      result += convertThreeDigits(lakhs) + ' Lakh' + (lakhs > 1 ? 's ' : ' ');
    }
    if (thousands > 0) {
      result += convertThreeDigits(thousands) + ' Thousand ';
    }
    if (hundreds > 0) {
      result += convertThreeDigits(hundreds) + ' ';
    }
    return result.trim();
  }

  let words = convertNumber(intVal);
  if (!words) words = 'Zero';

  if (decVal > 0) {
    words += ' and ' + convertTwoDigits(decVal) + ' Paise';
  }
  return words + ' Only';
}

function formatPoDate(dateVal) {
  const d = dateVal ? new Date(dateVal) : new Date();
  if (isNaN(d.getTime())) return new Date().toLocaleDateString('en-GB').replace(/\//g, '-');
  const day = String(d.getDate()).padStart(2, '0');
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const month = monthNames[d.getMonth()] || 'Jan';
  const year = d.getFullYear();
  return `${day}-${month}-${year}`;
}

/**
 * Resolves hospital identity, logo, address, state and theme color dynamically.
 * Strictly prioritizes current active tenant context (e.g. Ishita's Clinic).
 */
export function resolveDynamicHospital(clinicName, options = {}) {
  // 1. Establish the authoritative hospital name from current user session
  let userObj = {};
  try {
    userObj = JSON.parse(localStorage.getItem('user') || '{}');
  } catch (e) {}

  let targetName = options.hospitalName || 
    (clinicName && clinicName !== 'QUROXA HEALTHCARE' ? clinicName : null) || 
    userObj.tenantName || 
    userObj.hospitalName || 
    localStorage.getItem('tenantName') || 
    "Ishita's Clinic";

  // 2. Resolve matching hospital record (preventing cross-hospital cache leak)
  let activeHospital = options.hospital || null;

  if (!activeHospital) {
    try {
      const portalBranding = getActivePortalBranding();
      if (portalBranding && (!targetName || portalBranding.name === targetName)) {
        activeHospital = portalBranding;
      }
    } catch (e) {}
  }

  if (!activeHospital && targetName) {
    try {
      // Find cached portal that matches targetName
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith('curoxa_portal_')) {
          const val = localStorage.getItem(key);
          if (val) {
            const parsed = JSON.parse(val);
            if (parsed && (parsed.name === targetName || (parsed.code && userObj.tenantId === parsed.code))) {
              activeHospital = parsed;
              break;
            }
          }
        }
      }
    } catch (e) {}
  }

  const finalName = activeHospital?.name || targetName;

  // 3. Hospital Logo Resolution
  const rawLogo = options.hospitalLogo || 
    options.logo || 
    activeHospital?.logo || 
    userObj.hospitalLogo || 
    localStorage.getItem('hospitalLogo') || 
    '';
  const cleanLogo = typeof rawLogo === 'string' ? rawLogo.trim() : '';

  let logoImageSrc = null;
  if (cleanLogo && cleanLogo !== 'H') {
    if (
      cleanLogo.startsWith('data:image/') ||
      cleanLogo.startsWith('http://') ||
      cleanLogo.startsWith('https://') ||
      cleanLogo.startsWith('/uploads/') ||
      cleanLogo.startsWith('blob:')
    ) {
      logoImageSrc = cleanLogo;
    } else if (cleanLogo.startsWith('/9j/')) {
      logoImageSrc = `data:image/jpeg;base64,${cleanLogo}`;
    } else if (cleanLogo.startsWith('iVBOR')) {
      logoImageSrc = `data:image/png;base64,${cleanLogo}`;
    } else if (cleanLogo.startsWith('R0lGOD')) {
      logoImageSrc = `data:image/gif;base64,${cleanLogo}`;
    } else if (cleanLogo.startsWith('PHN2Zw')) {
      logoImageSrc = `data:image/svg+xml;base64,${cleanLogo}`;
    }
  }

  // Derived monogram (e.g. "IS" for Ishita's Clinic if logo is "IS", or derived from name)
  const monogram = (cleanLogo && cleanLogo !== 'H' && cleanLogo.length <= 4 && !logoImageSrc)
    ? cleanLogo.toUpperCase()
    : (finalName ? finalName.replace(/[^a-zA-Z\s]/g, '').split(' ').filter(Boolean).map(w => w[0]).slice(0, 2).join('').toUpperCase() : 'IC');

  const themeColor = activeHospital?.theme_color || '#004F9E';

  // 4. Address, Contact, GSTIN, State & City
  const address = options.hospitalAddress || 
    activeHospital?.address || 
    userObj.hospitalAddress || 
    localStorage.getItem('hospitalAddress') || 
    '123, Healthcare Complex';

  const phone = options.hospitalPhone || 
    options.hospitalContact || 
    activeHospital?.phone || 
    userObj.hospitalPhone || 
    localStorage.getItem('hospitalPhone') || 
    '0122142434';

  const gstin = options.hospitalGstin || 
    activeHospital?.gst || 
    userObj.hospitalGstin || 
    localStorage.getItem('hospitalGstin') || 
    '07ABCDE1234F1Z7';

  const state = options.deliveryState || 
    activeHospital?.state || 
    userObj.hospitalState || 
    'Delhi';

  const city = activeHospital?.city || 
    (address && address.includes(',') ? address.split(',').slice(-1)[0].trim() : 'Delhi');

  return {
    name: finalName,
    logoImageSrc,
    monogram,
    themeColor,
    address,
    phone,
    gstin,
    state,
    city
  };
}

export const printPO = (po, clinicName = null, options = {}) => {
  const iframe = document.createElement('iframe');
  iframe.style.position = 'fixed';
  iframe.style.left = '-9999px';
  iframe.style.top = '-9999px';
  iframe.style.border = '0';
  document.body.appendChild(iframe);

  const printWindow = iframe.contentWindow;

  // 1. Resolve Dynamic Hospital Info strictly for current portal session
  const hospital = resolveDynamicHospital(clinicName, options);

  // 2. Resolve Vendor Details
  const matchedVendor = (() => {
    if (options.vendor) return options.vendor;
    if (Array.isArray(options.vendors) && options.vendors.length > 0) {
      return options.vendors.find(v => 
        (po.vendorId && (v._id === po.vendorId || v.id === po.vendorId)) ||
        (po.vendorName && (v.name === po.vendorName || v.supplierName === po.vendorName))
      );
    }
    return po.vendorDetails || null;
  })();

  const isMasterPO = Boolean(po.isParent || po.vendorName === 'Consolidated Multiple Suppliers');

  let vendorName = po.vendorName || matchedVendor?.name || matchedVendor?.supplierName || 'DIAGNOSTIC BIOSYSTEMS (INDIA)';
  if (isMasterPO && !po.vendorName) {
    vendorName = 'Consolidated Multiple Suppliers';
  }

  const vendorAddress = matchedVendor?.address || 
    (matchedVendor?.street ? [matchedVendor.houseNo, matchedVendor.street, matchedVendor.city, matchedVendor.state, matchedVendor.pinCode].filter(Boolean).join(', ') : null) || 
    (po.vendorAddress || '306, Guru Ram Dass Bhawan, Ranjit N');

  const vendorContactPerson = matchedVendor?.contactPerson || matchedVendor?.primaryContactPerson || po.vendorContactPerson || '';
  const vendorMobile = matchedVendor?.phone || matchedVendor?.primaryContactPersonMobileNo || matchedVendor?.mobile || po.vendorMobile || '';
  const vendorEmail = matchedVendor?.email || matchedVendor?.emailId || matchedVendor?.primaryContactPersonEmailId || po.vendorEmail || 'dbs@dbsindia.co.in';
  const vendorGstin = matchedVendor?.gstNumber || matchedVendor?.gstin || po.vendorGstin || '07AIGPS5179N1ZF';
  const vendorState = matchedVendor?.state || matchedVendor?.stateCode || po.vendorState || 'Delhi';

  const paymentTerms = po.paymentTerms || matchedVendor?.paymentTerms || 'After 30 Days from the date of delivery at place';
  const paymentMode = po.paymentMode || matchedVendor?.paymentMethod || '';
  const deliveryTerms = po.deliveryTerms || 'Delivered at Place';

  // 3. Billing & Shipping Details
  const billToName = hospital.name;
  const billToAddress = hospital.address;
  const billToContact = hospital.phone;
  const billToGstin = hospital.gstin;
  const deliveryState = hospital.state;
  const deliveryCentre = options.deliveryCentre || `C4400~${hospital.name.toUpperCase().replace(/\s+/g, ' ')}`;

  // 4. User & Signatures
  const currentUser = options.currentUser || (() => {
    try { return JSON.parse(localStorage.getItem('user') || '{}'); } catch (e) { return {}; }
  })();

  const placedBySnapshot = po.placedBy || {};
  const approvedBySnapshot = po.approvedBy && typeof po.approvedBy === 'object' ? po.approvedBy : {};

  const preparedByName = placedBySnapshot.name || po.requestedBy || currentUser.name || 'JITESH KUMAR';
  const preparedByRole = placedBySnapshot.designation || placedBySnapshot.role || 'Pharmacist / In-Charge';
  const preparedBySigUrl = placedBySnapshot.signatureUrl || '';

  const checkedByName = po.checkedBy || 'ISHAN SHUKLA';

  const isApproved = String(po.status || '').toLowerCase() === 'approved';
  const approvedByName = approvedBySnapshot.name || (typeof po.approvedBy === 'string' ? po.approvedBy : (isApproved ? 'SUPERINTENDENT / ADMIN' : 'Pending Approval'));
  const approvedByRole = approvedBySnapshot.designation || approvedBySnapshot.role || (isApproved ? 'Medical Superintendent / Administrator' : '');
  const approvedBySigUrl = isApproved && approvedBySnapshot.signatureUrl ? approvedBySnapshot.signatureUrl : '';

  // 5. Line Items Calculations & Rows
  let runningSubtotal = 0;
  let runningGstTotal = 0;
  let runningGrandTotal = 0;

  const items = Array.isArray(po.items) && po.items.length > 0 ? po.items : [];

  const itemsHTML = items.map((item, idx) => {
    const qty = Number(item.requiredQty ?? item.qty ?? 1);
    const price = Number(item.price ?? 0);
    const discPct = Number(item.discount ?? 0);
    const taxPct = item.tax !== undefined && item.tax !== null ? Number(item.tax) : 5;

    const lineBase = qty * price;
    const lineDiscount = lineBase * (discPct / 100);
    const taxable = Math.max(0, lineBase - lineDiscount);
    const lineGst = taxable * (taxPct / 100);
    const lineAmount = item.total !== undefined ? Number(item.total) : (taxable + lineGst);

    runningSubtotal += taxable;
    runningGstTotal += lineGst;
    runningGrandTotal += lineAmount;

    const itemCode = item.itemCode || item.sku || `73000${String(10000 + idx + 1)}`;
    const itemName = item.name || item.itemName || item.genericName || 'Item';
    const subDesc = item.brandName && item.brandName !== itemName ? item.brandName : 
                    (item.itemDescription || (item.genericName && item.genericName !== itemName ? item.genericName : ''));
    
    const hsnCode = item.hsnCode || item.hsn || '';
    const machine = item.machineName || item.machine || item.department || (idx % 2 === 0 ? 'Manual' : 'C6000');
    const unit = (item.purchasedUnit || item.unit || 'PAC').toUpperCase();
    const packSize = item.packSize || (item.converterFactor && item.converterFactor > 1 ? `1X${item.converterFactor}` : '-');

    return `
      <tr style="border-bottom: 1px solid #000;">
        <td style="padding: 3px 2px; font-size: 9px; border-right: 1px solid #000; text-align: center;">${idx + 1}</td>
        <td style="padding: 3px 3px; font-size: 9px; border-right: 1px solid #000; text-align: center; font-family: monospace;">${itemCode}</td>
        <td style="padding: 3px 5px; font-size: 9px; border-right: 1px solid #000; text-align: left; font-weight: 700; line-height: 1.2;">
          ${itemName}
          ${subDesc ? `<div style="font-size: 8px; font-weight: normal; color: #333; margin-top: 1px;">${subDesc}</div>` : ''}
          ${isMasterPO && item.vendorName ? `<div style="font-size: 8px; color: #0052CC; font-weight: 600;">Supplier: ${item.vendorName}</div>` : ''}
        </td>
        <td style="padding: 3px 2px; font-size: 9px; border-right: 1px solid #000; text-align: center;">${hsnCode}</td>
        <td style="padding: 3px 2px; font-size: 9px; border-right: 1px solid #000; text-align: center;">${machine}</td>
        <td style="padding: 3px 2px; font-size: 9px; border-right: 1px solid #000; text-align: center;">${unit}</td>
        <td style="padding: 3px 2px; font-size: 9px; border-right: 1px solid #000; text-align: center;">${packSize}</td>
        <td style="padding: 3px 2px; font-size: 9px; border-right: 1px solid #000; text-align: center; font-weight: 700;">${qty}</td>
        <td style="padding: 3px 4px; font-size: 9px; border-right: 1px solid #000; text-align: right;">${Number.isInteger(price) ? price : price.toFixed(2)}</td>
        <td style="padding: 3px 2px; font-size: 9px; border-right: 1px solid #000; text-align: center;">${discPct}</td>
        <td style="padding: 3px 2px; font-size: 9px; border-right: 1px solid #000; text-align: center;">${taxPct}</td>
        <td style="padding: 3px 4px; font-size: 9px; border-right: 1px solid #000; text-align: right;">${lineGst.toFixed(2)}</td>
        <td style="padding: 3px 5px; font-size: 9px; text-align: right; font-weight: 700;">${lineAmount.toFixed(2)}</td>
      </tr>
    `;
  }).join('');

  const finalGrandTotal = po.totalAmount !== undefined && po.totalAmount !== null ? Number(po.totalAmount) : runningGrandTotal;
  const amountInWords = numberToWordsIndian(finalGrandTotal);
  const poDateFormatted = formatPoDate(po.createdAt || po.date);

  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8" />
      <title>Purchase Order - ${po.poId || 'PO'}</title>
      <style>
        @page {
          size: A4 portrait;
          margin: 8mm 10mm;
        }
        * {
          box-sizing: border-box;
          -webkit-print-color-adjust: exact !important;
          print-color-adjust: exact !important;
        }
        body {
          font-family: Arial, Helvetica, sans-serif;
          color: #000000;
          background: #FFFFFF;
          margin: 0;
          padding: 0;
          font-size: 10px;
          line-height: 1.25;
        }
        .po-container {
          width: 100%;
          border: 1.5px solid #000000;
          background: #FFFFFF;
        }
        table {
          width: 100%;
          border-collapse: collapse;
          border-spacing: 0;
        }
        th, td {
          vertical-align: top;
        }
        ol {
          margin: 0;
          padding-left: 18px;
        }
        li {
          margin-bottom: 2px;
        }
      </style>
    </head>
    <body>
      <div class="po-container">
        <!-- Top Dynamic Hospital Logo and Centered Title -->
        <table style="border-bottom: 1px solid #000000;">
          <tr>
            <td style="width: 48%; padding: 6px 8px; vertical-align: middle;">
              <div style="display: flex; align-items: center; gap: 8px;">
                ${hospital.logoImageSrc ? `
                  <img src="${hospital.logoImageSrc}" alt="${hospital.name}" style="width: 42px; height: 42px; object-fit: contain; border-radius: 6px; border: 1px solid #CBD5E1; background: #FFFFFF; vertical-align: middle; flex-shrink: 0;" />
                ` : `
                  <div style="width: 42px; height: 42px; border-radius: 8px; background: linear-gradient(135deg, #1E3A8A 0%, #2563EB 55%, #06B6D4 100%); color: #FFFFFF; display: flex; align-items: center; justify-content: center; font-weight: 900; font-size: 16px; letter-spacing: 0.5px; border: 1.5px solid rgba(255, 255, 255, 0.85); box-shadow: 0 2px 6px rgba(37,99,235,0.22); flex-shrink: 0;">
                    ${hospital.monogram}
                  </div>
                `}
                <div style="line-height: 1.15;">
                  <span style="display: block; font-size: ${hospital.name.length > 25 ? '13px' : hospital.name.length > 18 ? '15px' : '17px'}; font-weight: 800; color: #004F9E; letter-spacing: -0.2px; text-transform: uppercase;">
                    ${hospital.name}
                  </span>
                  <span style="display: block; font-size: 9.5px; font-weight: 700; color: #004F9E; letter-spacing: 0.6px; margin-top: 1px;">
                    ${hospital.name.toLowerCase().includes('lab') ? 'LABORATORIES &amp; DIAGNOSTICS' : (hospital.name.toLowerCase().includes('clinic') ? 'HEALTHCARE &amp; CLINICAL SERVICES' : 'HEALTHCARE &amp; MULTISPECIALITY')}
                  </span>
                </div>
              </div>
            </td>
            <td style="width: 52%; padding: 6px 8px; vertical-align: middle; text-align: center;">
              <div style="font-size: 15px; font-weight: 700; text-decoration: underline; text-transform: uppercase; color: #000000; margin-right: 20%;">
                Purchase Order
              </div>
            </td>
          </tr>
        </table>

        <!-- PO Number & PO Date Bar -->
        <table style="border-bottom: 1px solid #000000;">
          <tr>
            <td style="padding: 3.5px 8px; font-size: 10.5px; font-weight: 700; width: 55%; color: #000000;">
              PO No : <span style="font-weight: 700;">${po.poId || 'PO/26-27/720/100674'}</span>
            </td>
            <td style="padding: 3.5px 8px; font-size: 10.5px; font-weight: 700; width: 45%; text-align: right; color: #000000;">
              PO Date : <span style="font-weight: 700;">${poDateFormatted}</span>
            </td>
          </tr>
        </table>

        <!-- Order By / Bill to & To be Shipped -->
        <table style="border-bottom: 1px solid #000000;">
          <tr>
            <th style="width: 50%; border-right: 1px solid #000000; text-align: center; font-size: 11px; font-weight: 700; padding: 3px; border-bottom: 1px solid #000000;">Order By / Bill to</th>
            <th style="width: 50%; text-align: center; font-size: 11px; font-weight: 700; padding: 3px; border-bottom: 1px solid #000000;">To be Shipped</th>
          </tr>
          <tr>
            <td style="width: 50%; border-right: 1px solid #000000; padding: 4px 8px; font-size: 10px; line-height: 1.35;">
              <div style="font-weight: 700; font-size: 10.5px;">${billToName}</div>
              <div>${billToAddress}</div>
              <div>Contact : ${billToContact}</div>
              <div>GSTIN : ${billToGstin}</div>
            </td>
            <td style="width: 50%; padding: 4px 8px; font-size: 10px; line-height: 1.35;">
              <div style="font-weight: 700; font-size: 10.5px;">${billToName}</div>
              <div>${billToAddress}</div>
              <div>Contact : ${billToContact}</div>
              <div>GSTIN : ${billToGstin}</div>
            </td>
          </tr>
          <tr style="border-top: 1px solid #000000;">
            <td style="border-right: 1px solid #000000; padding: 3px 8px; font-size: 10px;">
              <strong>Delivery State : </strong>${deliveryState}
            </td>
            <td style="padding: 3px 8px; font-size: 10px;">
              <strong>Delivery Centre : </strong>${deliveryCentre}
            </td>
          </tr>
        </table>

        <!-- Vendor Details & Payment Terms -->
        <table style="border-bottom: 1px solid #000000;">
          <tr>
            <!-- Left Column: Vendor Details -->
            <td style="width: 50%; border-right: 1px solid #000000; padding: 0;">
              <table>
                <tr>
                  <td style="text-align: center; font-size: 11px; font-weight: 700; padding: 3px; border-bottom: 1px solid #000000;">
                    Vendor Details
                  </td>
                </tr>
                <tr>
                  <td style="padding: 4px 8px; font-size: 10px; line-height: 1.35;">
                    <div><strong>Name : </strong><strong>${vendorName}</strong></div>
                    <div>${vendorAddress}</div>
                    <div><strong>Contact Person : </strong>${vendorContactPerson}</div>
                    <div><strong>Mobile : </strong>${vendorMobile}</div>
                    <div><strong>Email : </strong>${vendorEmail}</div>
                    <div><strong>GSTIN : </strong>${vendorGstin}</div>
                  </td>
                </tr>
                <tr style="border-top: 1px solid #000000;">
                  <td style="padding: 3px 8px; font-size: 10px;">
                    <strong>Vendor State : </strong>${vendorState}
                  </td>
                </tr>
              </table>
            </td>

            <!-- Right Column: Terms -->
            <td style="width: 50%; padding: 0;">
              <table style="height: 100%;">
                <tr style="border-bottom: 1px solid #000000;">
                  <td style="width: 32%; padding: 5px 8px; font-size: 10px; font-weight: 700; border-right: 1px solid #000000;">
                    Payment Terms:
                  </td>
                  <td style="padding: 5px 8px; font-size: 10px;">
                    ${paymentTerms}
                  </td>
                </tr>
                <tr style="border-bottom: 1px solid #000000;">
                  <td style="width: 32%; padding: 5px 8px; font-size: 10px; font-weight: 700; border-right: 1px solid #000000;">
                    Payment Mode:
                  </td>
                  <td style="padding: 5px 8px; font-size: 10px;">
                    ${paymentMode}
                  </td>
                </tr>
                <tr>
                  <td style="width: 32%; padding: 5px 8px; font-size: 10px; font-weight: 700; border-right: 1px solid #000000;">
                    Delivery Terms:
                  </td>
                  <td style="padding: 5px 8px; font-size: 10px;">
                    ${deliveryTerms}
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>

        <!-- Prescribed Items Table -->
        <table style="border-bottom: 1px solid #000000;">
          <thead>
            <tr style="border-bottom: 1px solid #000000;">
              <th style="padding: 3px 2px; font-size: 9px; font-weight: 700; border-right: 1px solid #000000; width: 24px; text-align: center;">S.<br/>No</th>
              <th style="padding: 3px 3px; font-size: 9px; font-weight: 700; border-right: 1px solid #000000; width: 75px; text-align: center;">Item Code</th>
              <th style="padding: 3px 4px; font-size: 9px; font-weight: 700; border-right: 1px solid #000000; text-align: center;">ItemName</th>
              <th style="padding: 3px 2px; font-size: 9px; font-weight: 700; border-right: 1px solid #000000; width: 44px; text-align: center;">HSN<br/>Code</th>
              <th style="padding: 3px 2px; font-size: 9px; font-weight: 700; border-right: 1px solid #000000; width: 50px; text-align: center;">Machine</th>
              <th style="padding: 3px 2px; font-size: 9px; font-weight: 700; border-right: 1px solid #000000; width: 34px; text-align: center;">Unit</th>
              <th style="padding: 3px 2px; font-size: 9px; border-right: 1px solid #000000; width: 58px; text-align: center;">Pack Size</th>
              <th style="padding: 3px 2px; font-size: 9px; border-right: 1px solid #000000; width: 30px; text-align: center;">Qty</th>
              <th style="padding: 3px 3px; font-size: 9px; border-right: 1px solid #000000; width: 54px; text-align: right;">Price</th>
              <th style="padding: 3px 2px; font-size: 9px; border-right: 1px solid #000000; width: 30px; text-align: center;">Disc.</th>
              <th style="padding: 3px 2px; font-size: 9px; border-right: 1px solid #000; width: 34px; text-align: center;">Tax %</th>
              <th style="padding: 3px 3px; font-size: 9px; border-right: 1px solid #000000; width: 68px; text-align: right;">GST Amnt.(Rs)</th>
              <th style="padding: 3px 4px; font-size: 9px; font-weight: 700; width: 72px; text-align: right;">Amount (Rs)</th>
            </tr>
          </thead>
          <tbody>
            ${itemsHTML}
          </tbody>
        </table>

        <!-- Amount In Words & Grand Total -->
        <table style="border-bottom: 1px solid #000000;">
          <tr>
            <td style="padding: 4px 8px; font-size: 9.5px; font-weight: 700; width: 68%; border-right: 1px solid #000000;">
              Amount In Words : <span style="font-weight: 400; margin-left: 4px;">${amountInWords}</span>
            </td>
            <td style="padding: 4px 8px; font-size: 10.5px; font-weight: 700; width: 32%; text-align: right;">
              Grand Total : <span style="margin-left: 6px;">${finalGrandTotal.toFixed(2)}</span>
            </td>
          </tr>
        </table>

        <!-- Note Row -->
        <div style="padding: 3px 8px; font-size: 9.5px; border-bottom: 1px solid #000000;">
          <strong>Note : </strong>All conditions, warranty, service and support as per PO. Prices are F.O.R. ${billToName} .
        </div>

        <!-- Terms and Conditions -->
        <div style="padding: 4px 8px; border-bottom: 1px solid #000000;">
          <div style="font-size: 10px; font-weight: 700; text-align: center; margin-bottom: 2px;">Terms and Conditions</div>
          <ol style="margin: 0; padding-left: 16px; font-size: 8px; line-height: 1.3; color: #000000;">
            <li>Please ensure that your invoice margin matches the margin shown in this PO. Product will be rejected if cost, GST, payment/delivery terms mismatches</li>
            <li>Delivery is said to be completed only when goods inward receipt is made by ${billToName}, which
              <div>a - Copy of the PO with signature &amp; stamp of vendor's</div>
              <div>b - Printed GST Invoice from vendor with PO number on it</div>
            </li>
            <li>All disputes between the parties will be governed by the laws of India and subject to jurisdiction of ${hospital.city || hospital.state} Court.</li>
            <li>${billToName}. reserves the right to reject the goods whenever the product is not adhering to quality</li>
            <li>Purchase order number must be mentioned in the invoice for each material.</li>
            <li>Please revert within 24 hours for any changes you may require.</li>
            <li>Please ensure that you do not include more than one PO in one tax invoice. If one invoice includes more than one PO, we shall be constraint to reject your invoice.However you may include more than one delivery invoice against one PO</li>
            <li>Product not found acceptable as per ${billToName} evaluation scale will be back.</li>
            <li>Product should have 6 months expiry if applicable</li>
            <li>Equipment Unloading would be on supplier scope</li>
          </ol>
        </div>

        <!-- Signatures (Prepared By, Checked By, Approved By) -->
        <table style="margin-top: 10px; margin-bottom: 20px;">
          <tr>
            <td style="width: 33.33%; text-align: left; padding-left: 12px; vertical-align: bottom;">
              <div style="font-weight: 700; font-size: 9.5px; margin-bottom: 4px;">Prepared / Placed By</div>
              ${preparedBySigUrl ? `
                <div style="margin-bottom: 4px;">
                  <img src="${preparedBySigUrl}" alt="Prepared By Signature" style="max-height: 44px; max-width: 140px; object-fit: contain; display: block;" />
                </div>
              ` : '<div style="height: 24px;"></div>'}
              <div style="font-weight: 700; font-size: 9px; text-transform: uppercase;">${preparedByName}</div>
              <div style="font-size: 8px; color: #475569;">${preparedByRole}</div>
            </td>
            <td style="width: 33.33%; text-align: left; padding-left: 12px; vertical-align: bottom;">
              <div style="font-weight: 700; font-size: 9.5px; margin-bottom: 4px;">Checked By</div>
              <div style="height: 24px;"></div>
              <div style="font-weight: 700; font-size: 9px; text-transform: uppercase;">${checkedByName}</div>
              <div style="font-size: 8px; color: #475569;">Internal Audit / Stores</div>
            </td>
            <td style="width: 33.33%; text-align: left; padding-left: 12px; vertical-align: bottom;">
              <div style="font-weight: 700; font-size: 9.5px; margin-bottom: 4px;">Approved By</div>
              ${approvedBySigUrl ? `
                <div style="margin-bottom: 4px;">
                  <img src="${approvedBySigUrl}" alt="Approved By Signature" style="max-height: 44px; max-width: 140px; object-fit: contain; display: block;" />
                </div>
              ` : '<div style="height: 24px;"></div>'}
              <div style="font-weight: 700; font-size: 9px; text-transform: uppercase; ${!isApproved ? 'color: #D97706;' : ''}">${approvedByName}</div>
              <div style="font-size: 8px; color: #475569;">${approvedByRole}</div>
            </td>
          </tr>
        </table>

        <!-- Vendor Name and Stamp -->
        <div style="padding: 0 12px 10px 12px; font-size: 9px;">
          <div style="font-weight: 700;">Vendor Name and stamp(Mandatory)</div>
          <div style="font-weight: 700; margin-top: 2px; text-transform: uppercase;">${vendorName}</div>
        </div>

        <!-- Page 1 of 1 -->
        <div style="text-align: right; font-size: 8.5px; padding: 2px 8px; color: #000000;">
          Page 1 of 1
        </div>
      </div>

      <script>
        window.onload = function() {
          window.print();
          setTimeout(function() { 
            try { window.parent.postMessage('close-print-po-iframe', '*'); } catch(e){} 
          }, 1000);
        };
      </script>
    </body>
    </html>
  `;

  // Listen to close request
  const handleMessage = (e) => {
    if (e.data === 'close-print-po-iframe') {
      try {
        document.body.removeChild(iframe);
      } catch (err) {}
      window.removeEventListener('message', handleMessage);
    }
  };
  window.addEventListener('message', handleMessage);

  printWindow.document.write(htmlContent);
  printWindow.document.close();
};

function formatGrnDisplayDate(dateVal) {
  if (!dateVal) return '--';
  const d = new Date(dateVal);
  if (isNaN(d.getTime())) return String(dateVal);
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

export const printGRN = (grn, clinicName = null, options = {}) => {
  if (!grn) return;

  const iframe = document.createElement('iframe');
  iframe.style.position = 'fixed';
  iframe.style.left = '-9999px';
  iframe.style.top = '-9999px';
  iframe.style.border = '0';
  document.body.appendChild(iframe);

  const printWindow = iframe.contentWindow;

  // 1. Resolve Dynamic Hospital Info strictly for current portal session (e.g. Ishita's Clinic)
  const hospital = resolveDynamicHospital(clinicName, options);

  // 2. Line Items Breakdown
  const items = Array.isArray(grn.items) && grn.items.length > 0 ? grn.items : [];

  let totalCalculatedDiscount = 0;
  let totalCalculatedGst = 0;
  let totalCalculatedGrand = 0;

  // Table 1: Receiving & Batch Details
  const batchRowsHtml = items.length > 0 ? items.map((item, idx) => {
    const itemName = item.name || item.itemName || '--';
    const sku = item.sku || item.itemCode || '--';
    const unit = item.purchasedUnit || item.unit || 'Strip';
    const barcode = item.barcode || '--';
    const batchNo = item.batchNumber || item.batchNo || '--';
    const mfgDate = item.mfgDate ? formatGrnDisplayDate(item.mfgDate) : '--';
    const expiryDate = item.expiryDate ? formatGrnDisplayDate(item.expiryDate) : '--';

    return `
      <tr style="background: ${idx % 2 === 0 ? '#FFFFFF' : '#F8FAFC'};">
        <td style="padding: 5px 6px; border: 1px solid #CBD5E1; text-align: center; font-size: 10px;">${idx + 1}</td>
        <td style="padding: 5px 6px; border: 1px solid #CBD5E1; font-weight: 700; font-size: 10px; color: #0F172A;">${itemName}</td>
        <td style="padding: 5px 6px; border: 1px solid #CBD5E1; font-family: monospace; font-size: 10px; color: #475569;">${sku}</td>
        <td style="padding: 5px 6px; border: 1px solid #CBD5E1; text-align: center; font-size: 10px;">${unit}</td>
        <td style="padding: 5px 6px; border: 1px solid #CBD5E1; text-align: center; font-family: monospace; font-size: 10px; color: #64748B;">${barcode}</td>
        <td style="padding: 5px 6px; border: 1px solid #CBD5E1; text-align: center; font-weight: 700; font-size: 10px; color: #1E293B;">${batchNo}</td>
        <td style="padding: 5px 6px; border: 1px solid #CBD5E1; text-align: center; font-size: 10px; color: #64748B;">${mfgDate}</td>
        <td style="padding: 5px 6px; border: 1px solid #CBD5E1; text-align: center; font-weight: 700; font-size: 10px; color: #B91C1C;">${expiryDate}</td>
      </tr>
    `;
  }).join('') : `
    <tr><td colspan="8" style="padding: 10px; text-align: center; color: #94A3B8; font-size: 10px;">No batch items recorded.</td></tr>
  `;

  // Table 2: Quantity Reconciliation
  const qtyRowsHtml = items.length > 0 ? items.map((item, idx) => {
    const itemName = item.name || item.itemName || '--';
    const poQty = item.qtyOrdered ?? item.orderedQty ?? '--';
    const prevRec = item.previouslyReceivedQty ?? 0;
    const remainingQty = item.remainingQty ?? '--';
    const receivedQty = item.qtyReceived ?? item.receivedQty ?? 0;
    const rejectedQty = item.rejectedQty ?? 0;
    const rejReason = item.rejectionReason || '--';

    return `
      <tr style="background: ${idx % 2 === 0 ? '#FFFFFF' : '#F8FAFC'};">
        <td style="padding: 5px 6px; border: 1px solid #CBD5E1; text-align: center; font-size: 10px;">${idx + 1}</td>
        <td style="padding: 5px 6px; border: 1px solid #CBD5E1; font-weight: 700; font-size: 10px; color: #0F172A;">${itemName}</td>
        <td style="padding: 5px 6px; border: 1px solid #CBD5E1; text-align: center; font-size: 10px;">${poQty}</td>
        <td style="padding: 5px 6px; border: 1px solid #CBD5E1; text-align: center; font-size: 10px; color: #64748B;">${prevRec}</td>
        <td style="padding: 5px 6px; border: 1px solid #CBD5E1; text-align: center; font-size: 10px;">${remainingQty}</td>
        <td style="padding: 5px 6px; border: 1px solid #CBD5E1; text-align: center; font-weight: 800; font-size: 10px; color: #059669;">${receivedQty}</td>
        <td style="padding: 5px 6px; border: 1px solid #CBD5E1; text-align: center; font-weight: ${rejectedQty > 0 ? '800' : '500'}; font-size: 10px; color: ${rejectedQty > 0 ? '#DC2626' : '#64748B'};">${rejectedQty}</td>
        <td style="padding: 5px 6px; border: 1px solid #CBD5E1; font-size: 10px; color: #64748B;">${rejReason}</td>
      </tr>
    `;
  }).join('') : `
    <tr><td colspan="8" style="padding: 10px; text-align: center; color: #94A3B8; font-size: 10px;">No quantity data recorded.</td></tr>
  `;

  // Table 3: Financial Details
  const finRowsHtml = items.length > 0 ? items.map((item, idx) => {
    const itemName = item.name || item.itemName || '--';
    const rate = Number(item.purchaseRate ?? item.price ?? 0);
    const discPct = Number(item.discountPercent ?? item.discount ?? 0);
    const discAmt = Number(item.discountAmount ?? ((rate * (discPct / 100))) ?? 0);
    const gstRate = Number(item.gst !== undefined && item.gst !== null ? item.gst : 12);
    const taxable = Math.max(0, rate - discAmt);
    const gstAmt = Number(item.gstAmount ?? ((taxable * (gstRate / 100))) ?? 0);
    const buyPrice = Number(item.buyPrice ?? (taxable + gstAmt) ?? (rate + gstAmt));
    const recQty = Number(item.qtyReceived ?? item.receivedQty ?? 1);
    const netAmt = Number(item.netAmount ?? (recQty * buyPrice) ?? 0);

    totalCalculatedDiscount += (discAmt * recQty);
    totalCalculatedGst += (gstAmt * recQty);
    totalCalculatedGrand += netAmt;

    return `
      <tr style="background: ${idx % 2 === 0 ? '#FFFFFF' : '#F8FAFC'};">
        <td style="padding: 5px 6px; border: 1px solid #CBD5E1; text-align: center; font-size: 10px;">${idx + 1}</td>
        <td style="padding: 5px 6px; border: 1px solid #CBD5E1; font-weight: 700; font-size: 10px; color: #0F172A;">${itemName}</td>
        <td style="padding: 5px 6px; border: 1px solid #CBD5E1; text-align: right; font-size: 10px;">${rate.toFixed(2)}</td>
        <td style="padding: 5px 6px; border: 1px solid #CBD5E1; text-align: center; font-size: 10px;">${discPct}%</td>
        <td style="padding: 5px 6px; border: 1px solid #CBD5E1; text-align: right; font-size: 10px;">${discAmt.toFixed(2)}</td>
        <td style="padding: 5px 6px; border: 1px solid #CBD5E1; text-align: center; font-size: 10px;">${gstRate}%</td>
        <td style="padding: 5px 6px; border: 1px solid #CBD5E1; text-align: right; font-size: 10px;">${gstAmt.toFixed(2)}</td>
        <td style="padding: 5px 6px; border: 1px solid #CBD5E1; text-align: right; font-weight: 600; font-size: 10px;">${buyPrice.toFixed(2)}</td>
        <td style="padding: 5px 6px; border: 1px solid #CBD5E1; text-align: right; font-weight: 800; font-size: 10px; color: #0F172A;">${netAmt.toFixed(2)}</td>
      </tr>
    `;
  }).join('') : `
    <tr><td colspan="9" style="padding: 10px; text-align: center; color: #94A3B8; font-size: 10px;">No financial line items recorded.</td></tr>
  `;

  const finalTotalDiscount = grn.totalDiscount !== undefined && grn.totalDiscount !== null && grn.totalDiscount !== '' ? Number(grn.totalDiscount) : totalCalculatedDiscount;
  const finalTotalGst = grn.totalGst !== undefined && grn.totalGst !== null && grn.totalGst !== '' ? Number(grn.totalGst) : totalCalculatedGst;
  const finalGrandTotal = grn.grandTotal !== undefined && grn.grandTotal !== null && grn.grandTotal !== '' ? Number(grn.grandTotal) : totalCalculatedGrand;
  const invoiceAmount = Number(grn.invoiceAmount ?? 0);

  // Logo rendering
  const logoHtml = hospital.logoImageSrc ? `
    <img src="${hospital.logoImageSrc}" alt="${hospital.name}" style="height: 48px; max-width: 140px; object-fit: contain; margin-right: 14px;" />
  ` : `
    <div style="width: 44px; height: 44px; background: ${hospital.themeColor || '#004F9E'}; border-radius: 6px; color: #FFFFFF; font-weight: 900; font-size: 18px; display: inline-flex; align-items: center; justify-content: center; margin-right: 14px; letter-spacing: 0.5px; box-shadow: 0 2px 4px rgba(0,0,0,0.12); flex-shrink: 0;">
      ${hospital.monogram || 'IC'}
    </div>
  `;

  const formattedDate = formatGrnDisplayDate(grn.receivedDate || grn.grnDate || grn.createdAt);

  const receivedBySnapshot = grn.receivedByStaff || {};
  const inspectorName = receivedBySnapshot.name || grn.receivedBy || 'Pharmacist';
  const inspectorRole = receivedBySnapshot.designation || receivedBySnapshot.role || 'Pharmacist / In-Charge';
  const inspectorSigUrl = receivedBySnapshot.signatureUrl || '';

  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8" />
      <title>Goods Receipt Note - ${grn.grnId}</title>
      <style>
        @page { size: A4 portrait; margin: 10mm 12mm; }
        * { box-sizing: border-box; }
        body { 
          font-family: 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; 
          color: #1E293B; 
          margin: 0; 
          padding: 0; 
          font-size: 11px; 
          line-height: 1.4;
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }
        .header-wrap { 
          display: flex; 
          justify-content: space-between; 
          align-items: center; 
          padding-bottom: 12px; 
          border-bottom: 2px solid #E2E8F0;
        }
        .brand-block { 
          display: flex; 
          align-items: center; 
        }
        .clinic-title { 
          font-size: 18px; 
          font-weight: 800; 
          color: #0F172A; 
          letter-spacing: -0.2px; 
          text-transform: uppercase; 
        }
        .clinic-sub { 
          font-size: 10.5px; 
          color: #64748B; 
          margin-top: 2px; 
        }
        .doc-meta-right { 
          text-align: right; 
        }
        .doc-title { 
          font-size: 15px; 
          font-weight: 800; 
          color: #0F172A; 
          letter-spacing: 0.5px; 
          text-transform: uppercase; 
        }
        .doc-grn-id { 
          font-size: 13px; 
          font-weight: 800; 
          color: #2563EB; 
          font-family: monospace; 
          margin-top: 2px; 
        }
        .status-pill { 
          display: inline-block; 
          padding: 2px 8px; 
          font-size: 9.5px; 
          font-weight: 800; 
          border-radius: 4px; 
          background: #DCFCE7; 
          color: #166534; 
          text-transform: uppercase; 
          margin-top: 3px; 
        }
        .accent-bar { 
          display: flex; 
          justify-content: space-between; 
          align-items: center; 
          background: #F1F5F9; 
          border-radius: 4px; 
          padding: 6px 10px; 
          margin: 10px 0 14px 0; 
          font-size: 10.5px; 
          color: #475569; 
        }
        .meta-card { 
          display: flex; 
          background: #F8FAFC; 
          border: 1px solid #E2E8F0; 
          border-radius: 6px; 
          padding: 10px 14px; 
          margin-bottom: 14px; 
        }
        .meta-col { 
          flex: 1; 
        }
        .meta-col-title { 
          font-size: 10.5px; 
          font-weight: 800; 
          color: #1E293B; 
          margin-bottom: 6px; 
          text-transform: uppercase; 
          letter-spacing: 0.5px; 
        }
        .meta-grid { 
          display: grid; 
          grid-template-columns: 1fr 1fr; 
          gap: 4px 12px; 
          font-size: 10.5px; 
        }
        .meta-item { 
          color: #475569; 
        }
        .meta-item strong { 
          color: #0F172A; 
        }
        .meta-divider { 
          width: 1px; 
          background: #CBD5E1; 
          margin: 0 14px; 
        }
        .section-header { 
          display: flex; 
          justify-content: space-between; 
          align-items: center; 
          margin: 12px 0 6px 0; 
        }
        .section-title { 
          font-size: 11px; 
          font-weight: 800; 
          color: #0F172A; 
          text-transform: uppercase; 
          letter-spacing: 0.3px; 
        }
        .section-count { 
          font-size: 10px; 
          color: #64748B; 
        }
        .data-table { 
          width: 100%; 
          border-collapse: collapse; 
          margin-bottom: 8px; 
        }
        .data-table th { 
          padding: 5px 6px; 
          font-size: 10px; 
          font-weight: 800; 
          text-transform: uppercase; 
          border: 1px solid #CBD5E1; 
          letter-spacing: 0.2px; 
        }
        .data-table td { 
          border: 1px solid #CBD5E1; 
        }
        .summary-box { 
          display: flex; 
          justify-content: space-between; 
          align-items: center; 
          background: #F1F5F9; 
          border: 1px solid #CBD5E1; 
          border-radius: 6px; 
          padding: 8px 12px; 
          margin: 10px 0 20px 0; 
          font-size: 10.5px; 
          color: #475569; 
        }
        .grand-total-val { 
          font-size: 13px; 
          font-weight: 900; 
          color: #1E40AF; 
        }
        .sig-block { 
          display: flex; 
          justify-content: space-between; 
          margin-top: 36px; 
          page-break-inside: avoid; 
        }
        .sig-col { 
          text-align: center; 
          width: 180px; 
          border-top: 1px dashed #94A3B8; 
          padding-top: 6px; 
          font-size: 10px; 
          color: #475569; 
        }
        .sig-col strong { 
          display: block; 
          color: #0F172A; 
          margin-bottom: 2px; 
        }
        .footer-note { 
          margin-top: 24px; 
          text-align: center; 
          border-top: 1px solid #E2E8F0; 
          padding-top: 8px; 
          font-size: 9.5px; 
          color: #94A3B8; 
        }
      </style>
    </head>
    <body>
      <!-- Dynamic Hospital & Document Header -->
      <div class="header-wrap">
        <div class="brand-block">
          ${logoHtml}
          <div>
            <div class="clinic-title">${hospital.name}</div>
            <div class="clinic-sub">
              ${[hospital.address, hospital.phone ? `Phone: ${hospital.phone}` : null, hospital.gstin ? `GSTIN: ${hospital.gstin}` : null].filter(Boolean).join(' &nbsp;|&nbsp; ')}
            </div>
          </div>
        </div>
        <div class="doc-meta-right">
          <div class="doc-title">GOODS RECEIPT NOTE (GRN)</div>
          <div class="doc-grn-id">${grn.grnId}</div>
          <div><span class="status-pill">${grn.status || 'Verified/Completed'}</span></div>
        </div>
      </div>

      <!-- Accent Subtitle Bar -->
      <div class="accent-bar">
        <span>Stock Intake Report &nbsp;|&nbsp; Date: <strong>${formattedDate}</strong></span>
        <span>Clinic: <strong style="color: #0F172A;">${hospital.name}</strong></span>
      </div>

      <!-- Structured Metadata Card -->
      <div class="meta-card">
        <!-- Left: GRN & PO Information -->
        <div class="meta-col">
          <div class="meta-col-title">GRN & PO INFORMATION</div>
          <div class="meta-grid">
            <div class="meta-item">GRN Date: <strong>${formattedDate}</strong></div>
            <div class="meta-item">PO Number: <strong>${grn.poNumber || 'Direct Purchase'}</strong></div>
            <div class="meta-item">Location: <strong>${grn.grnLocation || 'Main Pharmacy Store'}</strong></div>
            <div class="meta-item">PO Date: <strong>${grn.poDate ? formatGrnDisplayDate(grn.poDate) : '--'}</strong></div>
            <div class="meta-item">Status: <strong style="color: #059669;">${grn.status || 'Verified/Completed'}</strong></div>
            <div class="meta-item">Received By: <strong>${grn.receivedBy || 'Pharmacist'}</strong></div>
          </div>
        </div>

        <div class="meta-divider"></div>

        <!-- Right: Supplier & Invoice Details -->
        <div class="meta-col">
          <div class="meta-col-title">SUPPLIER & INVOICE DETAILS</div>
          <div class="meta-grid">
            <div class="meta-item">Vendor: <strong>${grn.vendorName || '--'}</strong></div>
            <div class="meta-item">Invoice No: <strong>${grn.invoiceNumber || '--'}</strong></div>
            <div class="meta-item">Vendor Code: <strong>${grn.vendorCode || (grn.vendorId && typeof grn.vendorId === 'object' ? grn.vendorId.code : '') || '--'}</strong></div>
            <div class="meta-item">Invoice Date: <strong>${grn.invoiceDate ? formatGrnDisplayDate(grn.invoiceDate) : '--'}</strong></div>
            <div class="meta-item"></div>
            <div class="meta-item">Invoice Amount: <strong>Rs. ${invoiceAmount.toFixed(2)}</strong></div>
          </div>
        </div>
      </div>

      <!-- Section 1: Receiving & Batch Details -->
      <div class="section-header">
        <div class="section-title">1. RECEIVING & BATCH DETAILS</div>
        <div class="section-count">${items.length} item(s)</div>
      </div>
      <table class="data-table">
        <thead>
          <tr style="background: #1E293B; color: #FFFFFF;">
            <th style="width: 28px; text-align: center;">#</th>
            <th style="text-align: left;">Item Name</th>
            <th style="text-align: left; width: 95px;">Item SKU / Code</th>
            <th style="width: 50px; text-align: center;">Unit</th>
            <th style="width: 70px; text-align: center;">Barcode</th>
            <th style="width: 75px; text-align: center;">Batch No.</th>
            <th style="width: 75px; text-align: center;">Mfg Date</th>
            <th style="width: 75px; text-align: center;">Expiry Date</th>
          </tr>
        </thead>
        <tbody>
          ${batchRowsHtml}
        </tbody>
      </table>

      <!-- Section 2: Quantity Reconciliation -->
      <div class="section-header">
        <div class="section-title">2. QUANTITY RECONCILIATION</div>
      </div>
      <table class="data-table">
        <thead>
          <tr style="background: #334155; color: #FFFFFF;">
            <th style="width: 28px; text-align: center;">#</th>
            <th style="text-align: left;">Item Name</th>
            <th style="width: 60px; text-align: center;">PO Qty</th>
            <th style="width: 80px; text-align: center;">Prev Received</th>
            <th style="width: 85px; text-align: center;">Remaining Qty</th>
            <th style="width: 75px; text-align: center;">Received Qty</th>
            <th style="width: 75px; text-align: center;">Rejected Qty</th>
            <th style="width: 100px; text-align: left;">Rejection Reason</th>
          </tr>
        </thead>
        <tbody>
          ${qtyRowsHtml}
        </tbody>
      </table>

      <!-- Section 3: Financial Details -->
      <div class="section-header">
        <div class="section-title">3. FINANCIAL DETAILS</div>
      </div>
      <table class="data-table">
        <thead>
          <tr style="background: #0F172A; color: #FFFFFF;">
            <th style="width: 28px; text-align: center;">#</th>
            <th style="text-align: left;">Item Name</th>
            <th style="width: 70px; text-align: right;">Rate (Rs)</th>
            <th style="width: 50px; text-align: center;">Disc %</th>
            <th style="width: 75px; text-align: right;">Disc Amt (Rs)</th>
            <th style="width: 50px; text-align: center;">GST %</th>
            <th style="width: 75px; text-align: right;">GST Amt (Rs)</th>
            <th style="width: 80px; text-align: right;">Buy Price (Rs)</th>
            <th style="width: 85px; text-align: right;">Net Amt (Rs)</th>
          </tr>
        </thead>
        <tbody>
          ${finRowsHtml}
        </tbody>
      </table>

      <!-- Totals & Invoice Reconciliation Summary Box -->
      <div class="summary-box">
        <span>Total Discount: <strong>Rs. ${finalTotalDiscount.toFixed(2)}</strong></span>
        <span>Total GST: <strong>Rs. ${finalTotalGst.toFixed(2)}</strong></span>
        <span>Invoice Ref: <strong>${grn.invoiceNumber || '--'} (Rs. ${invoiceAmount.toFixed(2)})</strong></span>
        <span class="grand-total-val">GRN Grand Total: Rs. ${finalGrandTotal.toFixed(2)}</span>
      </div>

      <!-- Verification Signatures -->
      <div class="sig-block">
        <div class="sig-col" style="display: flex; flex-direction: column; justify-content: flex-end; align-items: center;">
          ${inspectorSigUrl ? `
            <div style="margin-bottom: 4px;">
              <img src="${inspectorSigUrl}" alt="Staff Signature" style="max-height: 42px; max-width: 140px; object-fit: contain; display: block;" />
            </div>
          ` : '<div style="height: 24px;"></div>'}
          <strong style="text-transform: uppercase;">${inspectorName}</strong>
          <span style="font-size: 8.5px; color: #64748B;">${inspectorRole}</span>
          <span style="margin-top: 2px;">Inspected &amp; Received By</span>
        </div>
        <div class="sig-col" style="display: flex; flex-direction: column; justify-content: flex-end; align-items: center;">
          <div style="height: 24px;"></div>
          <strong>Store In-Charge</strong>
          <span>Superintendent / Store Head</span>
        </div>
        <div class="sig-col" style="display: flex; flex-direction: column; justify-content: flex-end; align-items: center;">
          <div style="height: 24px;"></div>
          <strong>${grn.vendorName || 'Vendor Representative'}</strong>
          <span>Authorized Signatory / Vendor Stamp</span>
        </div>
      </div>

      <!-- Footer Note -->
      <div class="footer-note">
        ${hospital.name} — Confidential Authorized Hospital Document &nbsp;|&nbsp; Page 1 of 1 &nbsp;|&nbsp; Generated on ${new Date().toLocaleString('en-IN')}
      </div>

      <script>
        window.onload = function() {
          window.print();
          setTimeout(function() { window.parent.postMessage('close-print-grn-iframe', '*'); }, 1000);
        };
      </script>
    </body>
    </html>
  `;

  // Listen to close request
  const handleMessage = (e) => {
    if (e.data === 'close-print-grn-iframe') {
      try {
        document.body.removeChild(iframe);
      } catch (err) {}
      window.removeEventListener('message', handleMessage);
    }
  };
  window.addEventListener('message', handleMessage);

  printWindow.document.write(htmlContent);
  printWindow.document.close();
};
