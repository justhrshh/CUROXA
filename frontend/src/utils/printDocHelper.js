/**
 * Helper utility to generate and download/print PO and GRN documents as PDF using browser's print engine.
 */

export const printPO = (po, clinicName = 'CUROXA HEALTHCARE') => {
  const iframe = document.createElement('iframe');
  iframe.style.position = 'fixed';
  iframe.style.left = '-9999px';
  iframe.style.top = '-9999px';
  iframe.style.border = '0';
  document.body.appendChild(iframe);

  const printWindow = iframe.contentWindow;

  // Extract unique vendors for multi-supplier/consolidated orders
  const vendorList = (() => {
    const set = new Set();
    if (po.vendorOrders && Array.isArray(po.vendorOrders)) {
      po.vendorOrders.forEach(vo => { if (vo.vendorName) set.add(vo.vendorName); });
    }
    if (po.items && Array.isArray(po.items)) {
      po.items.forEach(it => { if (it.vendorName) set.add(it.vendorName); });
    }
    if (set.size === 0 && po.vendorName && po.vendorName !== 'Consolidated Multiple Suppliers') {
      set.add(po.vendorName);
    }
    return Array.from(set);
  })();

  const isMasterPO = Boolean(po.isParent || po.vendorName === 'Consolidated Multiple Suppliers' || vendorList.length > 1);
  
  const itemsHTML = (po.items || []).map((item, idx) => {
    const qty = item.requiredQty || item.qty || 0;
    const price = item.price || 0;
    const tax = item.tax !== undefined ? item.tax : 12;
    const subtotal = qty * price;
    const total = item.total || (subtotal + (subtotal * tax) / 100);
    return `
      <tr>
        <td style="padding: 10px; border-bottom: 1px solid #E2E8F0;">${idx + 1}</td>
        <td style="padding: 10px; border-bottom: 1px solid #E2E8F0; font-weight: 600;">
          ${item.name}
          ${(isMasterPO && item.vendorName) ? `<div style="font-size: 11px; color: #2563EB; font-weight: 700; margin-top: 2px;">🏢 Supplier: ${item.vendorName}</div>` : ''}
        </td>
        <td style="padding: 10px; border-bottom: 1px solid #E2E8F0; font-family: monospace;">${item.sku || '—'}</td>
        <td style="padding: 10px; border-bottom: 1px solid #E2E8F0; text-align: center;">${qty}</td>
        <td style="padding: 10px; border-bottom: 1px solid #E2E8F0; text-align: right;">₹${price.toFixed(2)}</td>
        <td style="padding: 10px; border-bottom: 1px solid #E2E8F0; text-align: center; color: #64748B;">${tax}%</td>
        <td style="padding: 10px; border-bottom: 1px solid #E2E8F0; text-align: right; font-weight: 600;">₹${total.toFixed(2)}</td>
      </tr>
    `;
  }).join('');

  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Purchase Order - ${po.poId}</title>
      <style>
        @page { size: A4; margin: 15mm; }
        body { font-family: 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1E293B; margin: 0; padding: 0; font-size: 13px; line-height: 1.5; }
        .header { display: flex; justify-content: space-between; border-bottom: 2px solid #2563EB; padding-bottom: 15px; margin-bottom: 25px; }
        .title { font-size: 24px; font-weight: 800; color: #2563EB; margin: 0; text-transform: uppercase; letter-spacing: 0.5px; }
        .clinic-name { font-size: 16px; font-weight: 700; color: #0F172A; margin: 5px 0 0 0; }
        .meta-table { width: 100%; border-collapse: collapse; margin-bottom: 25px; }
        .meta-table td { padding: 6px 0; vertical-align: top; }
        .meta-label { font-size: 11px; color: #64748B; font-weight: 700; text-transform: uppercase; display: block; margin-bottom: 2px; }
        .meta-val { font-size: 13px; font-weight: 700; color: #1E293B; }
        .items-table { width: 100%; border-collapse: collapse; margin-bottom: 25px; }
        .items-table th { background: #F8FAFC; padding: 10px; text-align: left; font-weight: 800; color: #475569; border-bottom: 2px solid #E2E8F0; font-size: 11px; text-transform: uppercase; }
        .summary-box { background: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 8px; padding: 15px; width: 270px; margin-left: auto; }
        .summary-row { display: flex; justify-content: space-between; margin-bottom: 6px; }
        .footer { margin-top: 50px; text-align: center; border-top: 1px solid #E2E8F0; padding-top: 15px; font-size: 11px; color: #94A3B8; }
      </style>
    </head>
    <body>
      <div class="header">
        <div>
          <div class="title">${isMasterPO ? 'Master Purchase Order' : 'Purchase Order'}</div>
          <div class="clinic-name">${clinicName}</div>
        </div>
        <div style="text-align: right;">
          <div style="font-size: 16px; font-weight: 800; color: #0F172A; font-family: monospace;">${po.poId}</div>
          ${po.parentPOId ? `<div style="font-size: 11px; color: #2563EB; font-weight: 700; margin-top: 2px;">Master PO: ${po.parentPOId}</div>` : ''}
          ${isMasterPO 
            ? `<div style="color: #4F46E5; font-size: 12px; margin-top: 4px; font-weight: 700;">Status: <strong>Consolidated Split (${vendorList.length || po.totalVendors || 2} POs)</strong></div>` 
            : `<div style="color: #64748B; font-size: 12px; margin-top: 4px;">Status: <strong>${po.status}</strong></div>`}
        </div>
      </div>

      <table class="meta-table">
        <tr>
          <td style="width: 55%;">
            <span class="meta-label">${isMasterPO ? 'Procurement Type & Assigned Suppliers' : 'Supplier / Vendor'}</span>
            <span class="meta-val" style="font-size: 14.5px; color: #2563EB;">
              ${isMasterPO 
                ? `Consolidated (${vendorList.length || po.totalVendors || 2} Vendors)` 
                : (po.vendorName || 'N/A')}
            </span>
            ${isMasterPO && vendorList.length > 0 ? `
              <div style="margin-top: 6px; display: flex; flex-wrap: wrap; gap: 6px;">
                ${vendorList.map(v => `<span style="background: #EFF6FF; border: 1px solid #BFDBFE; color: #1E40AF; padding: 3px 8px; border-radius: 4px; font-size: 11.5px; font-weight: 700;">🏢 ${v}</span>`).join('')}
              </div>
            ` : ''}
          </td>
          <td style="width: 45%; text-align: right;">
            <span class="meta-label">Date Raised</span>
            <span class="meta-val">${new Date(po.createdAt || Date.now()).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
          </td>
        </tr>
        <tr>
          <td>
            <span class="meta-label">Raised By</span>
            <span class="meta-val">${po.requestedBy || 'Pharmacy Procurement Department'}</span>
          </td>
          <td style="text-align: right;">
            <span class="meta-label">Billing Currency</span>
            <span class="meta-val">INR (₹)</span>
          </td>
        </tr>
      </table>

      <h3 style="font-size: 13px; font-weight: 800; color: #0F172A; text-transform: uppercase; margin-bottom: 10px;">Prescribed Procurement Items</h3>
      <table class="items-table">
        <thead>
          <tr>
            <th style="width: 45px;">S.No</th>
            <th>Item Name</th>
            <th>SKU / Code</th>
            <th style="width: 70px; text-align: center;">Qty</th>
            <th style="width: 90px; text-align: right;">Unit Price</th>
            <th style="width: 60px; text-align: center;">GST</th>
            <th style="width: 100px; text-align: right;">Line Total</th>
          </tr>
        </thead>
        <tbody>
          ${itemsHTML}
        </tbody>
      </table>

      <div class="summary-box">
        ${po.subtotal ? `
          <div class="summary-row" style="color: #64748B;">
            <span>Subtotal</span>
            <span>₹${Number(po.subtotal).toFixed(2)}</span>
          </div>
        ` : ''}
        ${po.taxAmount ? `
          <div class="summary-row" style="color: #64748B;">
            <span>Estimated GST</span>
            <span>₹${Number(po.taxAmount).toFixed(2)}</span>
          </div>
        ` : ''}
        <div class="summary-row" style="font-size: 14px; font-weight: 800; color: #0F172A; border-top: 1px dashed #CBD5E1; padding-top: 6px; margin-top: 4px;">
          <span>Grand Total</span>
          <span>₹${(po.totalAmount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
        </div>
      </div>

      <div style="margin-top: 60px; display: flex; justify-content: space-between;">
        <div style="text-align: center; width: 200px; border-top: 1px dashed #94A3B8; padding-top: 8px; font-size: 11px; color: #64748B;">
          Prepared / Requested By
        </div>
        <div style="text-align: center; width: 200px; border-top: 1px dashed #94A3B8; padding-top: 8px; font-size: 11px; color: #64748B;">
          Authorized Signature
        </div>
      </div>

      <div class="footer">
        This is a computer-generated Purchase Order and does not require a physical signature.
      </div>

      <script>
        window.onload = function() {
          window.print();
          setTimeout(function() { window.parent.postMessage('close-print-po-iframe', '*'); }, 1000);
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

export const printGRN = (grn, clinicName = 'CUROXA HEALTHCARE') => {
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
