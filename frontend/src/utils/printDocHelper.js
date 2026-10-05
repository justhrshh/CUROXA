/**
 * Helper utility to generate and download/print PO and GRN documents as PDF using browser's print engine.
 * Matches exact ERP / Standard Medical Diagnostics Purchase Order layout.
 */

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

export const printPO = (po, clinicName = 'Oncquest Gurugram', options = {}) => {
  const iframe = document.createElement('iframe');
  iframe.style.position = 'fixed';
  iframe.style.left = '-9999px';
  iframe.style.top = '-9999px';
  iframe.style.border = '0';
  document.body.appendChild(iframe);

  const printWindow = iframe.contentWindow;

  // 1. Resolve Vendor Details
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

  // 2. Resolve Clinic / Billing / Shipping Details
  const billToName = clinicName || 'Oncquest Gurugram';
  const billToAddress = options.hospitalAddress || localStorage.getItem('hospitalAddress') || 'A-17, 1, INFO TECHNOLOGY PARK, SECTOR 34, GURUGRAM';
  const billToContact = options.hospitalContact || localStorage.getItem('hospitalPhone') || '0122142434';
  const billToGstin = options.hospitalGstin || localStorage.getItem('hospitalGstin') || '';
  const deliveryState = options.deliveryState || 'Haryana';
  const deliveryCentre = options.deliveryCentre || `C4400~${billToName.toUpperCase().replace(/\s+/g, ' ')}`;

  // 3. User & Signatures
  const currentUser = options.currentUser || (() => {
    try { return JSON.parse(localStorage.getItem('user') || '{}'); } catch (e) { return {}; }
  })();
  const preparedBy = po.requestedBy || currentUser.name || 'JITESH KUMAR';
  const checkedBy = po.checkedBy || 'ISHAN SHUKLA';
  const approvedBy = po.approvedBy || 'ISHAN SHUKLA';

  // 4. Line Items Calculations & Rows
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

  // 5. Logo Branding
  const brandTitle = billToName.toLowerCase().includes('oncquest') ? 'oncquest' : billToName;
  const brandSub = billToName.toLowerCase().includes('oncquest') ? 'laboratories' : 'HEALTHCARE & DIAGNOSTICS';

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
        <!-- Top Logo and Centered Title -->
        <table style="border-bottom: 1px solid #000000;">
          <tr>
            <td style="width: 35%; padding: 6px 8px; vertical-align: middle;">
              <div style="display: flex; align-items: center; gap: 8px;">
                <svg width="34" height="34" viewBox="0 0 42 42" fill="none" style="vertical-align: middle; flex-shrink: 0;">
                  <rect width="42" height="42" rx="4" fill="#004F9E"/>
                  <circle cx="12" cy="12" r="3.5" fill="#FFC000"/>
                  <circle cx="30" cy="12" r="3.5" fill="#FFFFFF"/>
                  <circle cx="21" cy="21" r="4.5" fill="#FFFFFF"/>
                  <circle cx="12" cy="30" r="3.5" fill="#FFFFFF"/>
                  <circle cx="30" cy="30" r="3.5" fill="#FFC000"/>
                  <circle cx="21" cy="10" r="2.5" fill="#FFFFFF"/>
                  <circle cx="10" cy="21" r="2.5" fill="#FFC000"/>
                  <line x1="12" y1="12" x2="21" y2="21" stroke="#FFFFFF" stroke-width="2"/>
                  <line x1="30" y1="12" x2="21" y2="21" stroke="#FFFFFF" stroke-width="2"/>
                  <line x1="12" y1="30" x2="21" y2="21" stroke="#FFFFFF" stroke-width="2"/>
                  <line x1="30" y1="30" x2="21" y2="21" stroke="#FFFFFF" stroke-width="2"/>
                  <line x1="21" y1="10" x2="21" y2="21" stroke="#FFFFFF" stroke-width="1.5"/>
                  <line x1="10" y1="21" x2="21" y2="21" stroke="#FFFFFF" stroke-width="1.5"/>
                </svg>
                <div style="line-height: 1.15;">
                  <span style="display: block; font-size: ${brandTitle.length > 15 ? '14px' : '18px'}; font-weight: 800; color: #004F9E; letter-spacing: -0.3px;">${brandTitle}</span>
                  <span style="display: block; font-size: 10px; font-weight: 600; color: #004F9E; letter-spacing: 0.6px;">${brandSub}</span>
                </div>
              </div>
            </td>
            <td style="width: 65%; padding: 6px 8px; vertical-align: middle; text-align: center;">
              <div style="font-size: 15px; font-weight: 700; text-decoration: underline; text-transform: capitalize; color: #000000; margin-right: 35%;">
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
              <th style="padding: 3px 2px; font-size: 9px; font-weight: 700; border-right: 1px solid #000000; width: 58px; text-align: center;">Pack Size</th>
              <th style="padding: 3px 2px; font-size: 9px; font-weight: 700; border-right: 1px solid #000000; width: 30px; text-align: center;">Qty</th>
              <th style="padding: 3px 3px; font-size: 9px; font-weight: 700; border-right: 1px solid #000000; width: 54px; text-align: right;">Price</th>
              <th style="padding: 3px 2px; font-size: 9px; font-weight: 700; border-right: 1px solid #000000; width: 30px; text-align: center;">Disc.</th>
              <th style="padding: 3px 2px; font-size: 9px; font-weight: 700; border-right: 1px solid #000000; width: 34px; text-align: center;">Tax %</th>
              <th style="padding: 3px 3px; font-size: 9px; font-weight: 700; border-right: 1px solid #000000; width: 68px; text-align: right;">GST Amnt.(Rs)</th>
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
            <li>All disputes between the parties will be governed by the laws of India and subject to jurisdiction of Gurugram Court.</li>
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
            <td style="width: 33.33%; text-align: left; padding-left: 12px;">
              <div style="font-weight: 700; font-size: 9.5px;">Prepared By</div>
              <div style="font-weight: 700; font-size: 9px; margin-top: 24px; text-transform: uppercase;">${preparedBy}</div>
            </td>
            <td style="width: 33.33%; text-align: left; padding-left: 12px;">
              <div style="font-weight: 700; font-size: 9.5px;">Checked By</div>
              <div style="font-weight: 700; font-size: 9px; margin-top: 24px; text-transform: uppercase;">${checkedBy}</div>
            </td>
            <td style="width: 33.33%; text-align: left; padding-left: 12px;">
              <div style="font-weight: 700; font-size: 9.5px;">Approved By</div>
              <div style="font-weight: 700; font-size: 9px; margin-top: 24px; text-transform: uppercase;">${approvedBy}</div>
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

export const printGRN = (grn, clinicName = 'QUROXA HEALTHCARE') => {
  const iframe = document.createElement('iframe');
  iframe.style.position = 'fixed';
  iframe.style.left = '-9999px';
  iframe.style.top = '-9999px';
  iframe.style.border = '0';
  document.body.appendChild(iframe);

  const printWindow = iframe.contentWindow;

  let subtotalSum = 0;
  let gstSum = 0;

  const itemsHTML = (grn.items || []).map((item, idx) => {
    const qty = item.qtyReceived || 0;
    const price = item.price || 0;
    const gstRate = item.gst !== undefined ? item.gst : 12;
    const itemSub = qty * price;
    const gstAmt = itemSub * (gstRate / 100);
    const total = itemSub + gstAmt;

    subtotalSum += itemSub;
    gstSum += gstAmt;

    return `
      <tr>
        <td style="padding: 8px 10px; border-bottom: 1px solid #E2E8F0;">${idx + 1}</td>
        <td style="padding: 8px 10px; border-bottom: 1px solid #E2E8F0; font-weight: 600;">${item.name}</td>
        <td style="padding: 8px 10px; border-bottom: 1px solid #E2E8F0; font-family: monospace;">${item.sku || '—'}</td>
        <td style="padding: 8px 10px; border-bottom: 1px solid #E2E8F0; text-align: center;">${item.qtyOrdered || '—'}</td>
        <td style="padding: 8px 10px; border-bottom: 1px solid #E2E8F0; text-align: center; font-weight: 700; color: #059669;">${qty}</td>
        <td style="padding: 8px 10px; border-bottom: 1px solid #E2E8F0; text-align: right;">₹${price.toFixed(2)}</td>
        <td style="padding: 8px 10px; border-bottom: 1px solid #E2E8F0; text-align: right;">${gstRate}%</td>
        <td style="padding: 8px 10px; border-bottom: 1px solid #E2E8F0; text-align: right;">₹${gstAmt.toFixed(2)}</td>
        <td style="padding: 8px 10px; border-bottom: 1px solid #E2E8F0; text-align: right; font-weight: 700;">₹${total.toFixed(2)}</td>
      </tr>
    `;
  }).join('');

  const grandTotal = subtotalSum + gstSum;

  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Goods Receipt Note - ${grn.grnId}</title>
      <style>
        @page { size: A4; margin: 15mm; }
        body { font-family: 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1E293B; margin: 0; padding: 0; font-size: 12px; line-height: 1.5; }
        .header { display: flex; justify-content: space-between; border-bottom: 2px solid #059669; padding-bottom: 15px; margin-bottom: 25px; }
        .title { font-size: 24px; font-weight: 800; color: #059669; margin: 0; text-transform: uppercase; letter-spacing: 0.5px; }
        .clinic-name { font-size: 16px; font-weight: 700; color: #0F172A; margin: 5px 0 0 0; }
        .meta-table { width: 100%; border-collapse: collapse; margin-bottom: 25px; }
        .meta-table td { padding: 6px 0; vertical-align: top; }
        .meta-label { font-size: 11px; color: #64748B; font-weight: 700; text-transform: uppercase; display: block; margin-bottom: 2px; }
        .meta-val { font-size: 13px; font-weight: 700; color: #1E293B; }
        .items-table { width: 100%; border-collapse: collapse; margin-bottom: 25px; }
        .items-table th { background: #F8FAFC; padding: 10px; text-align: left; font-weight: 800; color: #475569; border-bottom: 2px solid #E2E8F0; font-size: 11px; text-transform: uppercase; }
        .summary-box { background: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 8px; padding: 15px; width: 280px; margin-left: auto; }
        .summary-row { display: flex; justify-content: space-between; margin-bottom: 6px; }
        .footer { margin-top: 50px; text-align: center; border-top: 1px solid #E2E8F0; padding-top: 15px; font-size: 11px; color: #94A3B8; }
      </style>
    </head>
    <body>
      <div class="header">
        <div>
          <div class="title">Goods Receipt Note (GRN)</div>
          <div class="clinic-name">${clinicName}</div>
        </div>
        <div style="text-align: right;">
          <div style="font-size: 16px; font-weight: 800; color: #059669; font-family: monospace;">${grn.grnId}</div>
          <div style="color: #64748B; font-size: 12px; margin-top: 4px;">Ref PO: <strong style="font-family: monospace;">${grn.poNumber || 'Direct Purchase'}</strong></div>
        </div>
      </div>

      <table class="meta-table">
        <tr>
          <td style="width: 50%;">
            <span class="meta-label">Supplier / Vendor</span>
            <span class="meta-val" style="font-size: 15px; color: #059669;">${grn.vendorName}</span>
          </td>
          <td style="width: 50%; text-align: right;">
            <span class="meta-label">Date Received</span>
            <span class="meta-val">${new Date(grn.receivedDate || grn.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
          </td>
        </tr>
        <tr>
          <td>
            <span class="meta-label">Received & Inspected By</span>
            <span class="meta-val">${grn.receivedBy || 'Pharmacy Staff'}</span>
          </td>
          <td style="text-align: right;">
            <span class="meta-label">Status</span>
            <span class="meta-val" style="color: #059669;">VERIFIED & COMPLETED</span>
          </td>
        </tr>
      </table>

      ${grn.notes ? `
        <div style="margin-bottom: 25px; padding: 12px; background: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 8px;">
          <span class="meta-label" style="margin-bottom: 4px;">Verification Notes</span>
          <div style="font-size: 12px; color: #334155;">${grn.notes}</div>
        </div>
      ` : ''}

      <h3 style="font-size: 13px; font-weight: 800; color: #0F172A; text-transform: uppercase; margin-bottom: 10px;">Received Inventory Breakdown</h3>
      <table class="items-table">
        <thead>
          <tr>
            <th style="width: 30px;">S.No</th>
            <th>Medication Details</th>
            <th>SKU</th>
            <th style="width: 60px; text-align: center;">Ord.Qty</th>
            <th style="width: 60px; text-align: center;">Rec.Qty</th>
            <th style="width: 80px; text-align: right;">Unit Price</th>
            <th style="width: 50px; text-align: right;">GST</th>
            <th style="width: 80px; text-align: right;">GST Amt</th>
            <th style="width: 100px; text-align: right;">Net Total</th>
          </tr>
        </thead>
        <tbody>
          ${itemsHTML}
        </tbody>
      </table>

      <div class="summary-box">
        <div class="summary-row" style="font-size: 12px; color: #475569; font-weight: 600;">
          <span>Subtotal (Excl. GST)</span>
          <span>₹${subtotalSum.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
        </div>
        <div class="summary-row" style="font-size: 12px; color: #EA580C; font-weight: 700;">
          <span>GST Tax Burden</span>
          <span>₹${gstSum.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
        </div>
        <div class="summary-row" style="font-size: 14px; font-weight: 800; color: #0F172A; border-top: 1px solid #E2E8F0; padding-top: 6px; margin-top: 6px;">
          <span>Grand Total (Incl. GST)</span>
          <span>₹${grandTotal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
        </div>
      </div>

      <div style="margin-top: 60px; display: flex; justify-content: space-between;">
        <div style="text-align: center; width: 200px; border-top: 1px dashed #94A3B8; padding-top: 8px; font-size: 11px; color: #64748B;">
          Inspected & Logged By
        </div>
        <div style="text-align: center; width: 200px; border-top: 1px dashed #94A3B8; padding-top: 8px; font-size: 11px; color: #64748B;">
          Superintendent / Store Head
        </div>
      </div>

      <div class="footer">
        This is a certified Goods Receipt Note detailing accepted stock delivery under active procurement.
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
