import React, { useMemo } from 'react';
import { resolveDynamicHospital } from '../../utils/printDocHelper';
import { getActivePortalBranding } from '../../context/PortalBrandingContext';
import { formatReceiptDateTime, formatReceiptDateOnly, generateBarcodeSvg, printReceipt } from '../../utils/receiptPrinter';

export default function StandardReceiptModal({
  isOpen = false,
  onClose,
  receiptData = null,
  clinicName = null
}) {
  if (!isOpen || !receiptData) return null;

  let currentUser = {};
  try {
    currentUser = JSON.parse(localStorage.getItem('user') || '{}');
  } catch (e) {}

  const activeBranding = getActivePortalBranding() || {};

  // 1. Resolve Dynamic Hospital Info
  const hospital = resolveDynamicHospital(clinicName, {
    hospitalName: receiptData.hospitalName,
    hospitalLogo: receiptData.hospitalLogo,
    hospitalAddress: receiptData.hospitalAddress,
    hospitalPhone: receiptData.hospitalPhone,
  });

  const displayName = receiptData.hospitalName || hospital.name || 'CHARAK MEDICAL CENTRE';
  const runByEntity = receiptData.runBy || activeBranding.runBy || activeBranding.societyName || currentUser.societyName || `${displayName.toUpperCase()} HEALTHCARE SOCIETY (REGD)`;
  const displayAddress = receiptData.hospitalAddress || hospital.address || 'Main Road, Medical Complex';
  const displayPhone = receiptData.hospitalPhone || hospital.phone || '011-41421738';
  const displayEmail = receiptData.hospitalEmail || currentUser.email || 'care@curoxa.com';

  // 2. Patient Details
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

  // 3. Receipt & Billing Meta
  const receiptNo = receiptData.receiptNo || receiptData.invoiceNo || receiptData.billNo || receiptData.saleId || `REC-${Date.now().toString().slice(-6)}`;
  const barcodeNo = receiptData.barcodeNo || receiptData.barcode || regNo || '10441854';
  const deliveryMode = receiptData.deliveryMode || receiptData.paymentMethod || 'Self';
  const regDateStr = formatReceiptDateTime(receiptData.date || receiptData.createdAt || Date.now());
  const partyName = receiptData.partyName || 'Standard';
  const patientAddress = receiptData.address || receiptData.city || 'Delhi';

  const documentTitle = receiptData.documentTitle || receiptData.receiptType || 'INVOICE CUM RECEIPT';

  // 4. Items Table
  const items = Array.isArray(receiptData.items) && receiptData.items.length > 0 
    ? receiptData.items 
    : [{
        description: receiptData.testName || receiptData.description || 'Clinical Consultation',
        sampleType: receiptData.sampleType || receiptData.category || 'Clinical',
        deliveryDate: formatReceiptDateOnly(Date.now()),
        amount: Number(receiptData.totalAmount || receiptData.amount || 0)
      }];

  // Computations
  const originalAmount = Number(receiptData.originalAmount ?? receiptData.subtotal ?? receiptData.totalAmount ?? 0);
  const discountAmount = Number(receiptData.discountAmount ?? receiptData.totalDiscount ?? 0);
  const totalAmount = Number(receiptData.totalAmount ?? receiptData.grandTotal ?? originalAmount - discountAmount);
  const amountPaid = Number(receiptData.amountPaid ?? receiptData.amountReceived ?? totalAmount);
  const balanceDue = Math.max(0, totalAmount - amountPaid);

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

  const createdBy = (receiptData.createdBy || receiptData.pharmacistName || currentUser.name || 'RECEPTIONIST').toUpperCase();
  const printDateTime = new Date().toLocaleDateString('en-US') + '   ' + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

  const portalUrl = receiptData.portalUrl || activeBranding.portalUrl || 'www.curoxa.com';

  const barcodeSvgHtml = useMemo(() => generateBarcodeSvg(barcodeNo, 130, 24), [barcodeNo]);

  const handlePrint = () => {
    printReceipt(receiptData, clinicName);
  };

  return (
    <div 
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(15, 23, 42, 0.75)',
        backdropFilter: 'blur(4px)',
        zIndex: 99999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
        overflowY: 'auto'
      }}
      onClick={(e) => { if (e.target === e.currentTarget && onClose) onClose(); }}
    >
      <style>{`
        @media print {
          @page {
            size: A4 portrait;
            margin: 4mm 6mm;
          }
          html, body {
            width: 210mm !important;
            margin: 0 !important;
            padding: 0 !important;
            background: #FFFFFF !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          body * {
            visibility: hidden !important;
          }
          #curoxa-standard-receipt-half-a4, #curoxa-standard-receipt-half-a4 * {
            visibility: visible !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          #curoxa-standard-receipt-half-a4 {
            position: absolute !important;
            left: 0 !important;
            right: 0 !important;
            top: 0 !important;
            width: 198mm !important;
            max-width: 198mm !important;
            max-height: 140mm !important;
            margin: 0 auto !important;
            padding: 2.5mm 3.5mm !important;
            border: 1.5px solid #000000 !important;
            box-shadow: none !important;
            page-break-after: avoid !important;
            overflow: hidden !important;
          }
          .no-print {
            display: none !important;
          }
        }
      `}</style>

      {/* SOLID MODAL CARD (NO FLOATING BUTTONS) */}
      <div 
        style={{ 
          maxWidth: '840px', 
          width: '100%', 
          background: '#FFFFFF', 
          borderRadius: '12px',
          boxShadow: '0 25px 60px rgba(0,0,0,0.35)',
          border: '1px solid #CBD5E1',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column'
        }}
        onClick={e => e.stopPropagation()}
      >
        
        {/* INTEGRATED MODAL TOOLBAR (DOCKED AT TOP) */}
        <div 
          className="no-print" 
          style={{ 
            display: 'flex', 
            justifyContent: 'space-between', 
            alignItems: 'center', 
            padding: '12px 20px', 
            background: '#F8FAFC', 
            borderBottom: '1px solid #E2E8F0' 
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '14px', fontWeight: 800, color: '#0F172A' }}>
              Receipt Preview
            </span>
            <span style={{ fontSize: '12px', color: '#64748B', fontWeight: 600 }}>
              #{receiptNo}
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              type="button"
              onClick={handlePrint}
              style={{
                padding: '8px 16px',
                background: '#059669',
                color: '#FFF',
                border: 'none',
                borderRadius: '8px',
                fontWeight: 800,
                fontSize: '12.5px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                boxShadow: '0 2px 6px rgba(5,150,105,0.25)',
                transition: 'all 0.15s ease'
              }}
              onMouseEnter={e => e.currentTarget.style.background = '#047857'}
              onMouseLeave={e => e.currentTarget.style.background = '#059669'}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="6 9 6 2 18 2 18 9"/>
                <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/>
                <rect x="6" y="14" width="12" height="8"/>
              </svg>
              Print Receipt
            </button>

            {mobileNo && mobileNo !== '—' && (
              <button
                type="button"
                onClick={() => {
                  const rawNumber = mobileNo || receiptData.contact || '';
                  const cleanNumber = String(rawNumber).replace(/\D/g, '');
                  const phoneWithCountry = cleanNumber.length === 10 ? `91${cleanNumber}` : cleanNumber;
                  const message = `Hello, here is your official receipt from ${displayName}.\n\nReceipt No: ${receiptNo}\nPatient: ${formattedPatientName}\nTotal Amount: ₹${totalAmount}\nUHID: ${regNo}\n\nThank you!`;
                  const url = `https://wa.me/${phoneWithCountry}?text=${encodeURIComponent(message)}`;
                  window.open(url, '_blank');
                }}
                style={{
                  padding: '8px 14px',
                  background: '#2563EB',
                  color: '#FFF',
                  border: 'none',
                  borderRadius: '8px',
                  fontWeight: 800,
                  fontSize: '12.5px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  boxShadow: '0 2px 6px rgba(37,99,235,0.25)',
                  transition: 'all 0.15s ease'
                }}
                onMouseEnter={e => e.currentTarget.style.background = '#1D4ED8'}
                onMouseLeave={e => e.currentTarget.style.background = '#2563EB'}
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
                  <polyline points="16 6 12 2 8 6" />
                  <line x1="12" y1="2" x2="12" y2="15" />
                </svg>
                WhatsApp
              </button>
            )}

            {onClose && (
              <button
                type="button"
                onClick={onClose}
                style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: '8px',
                  background: '#F1F5F9',
                  border: '1px solid #CBD5E1',
                  color: '#475569',
                  fontSize: '16px',
                  fontWeight: 800,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'all 0.15s'
                }}
                onMouseEnter={e => { e.currentTarget.style.background = '#E2E8F0'; e.currentTarget.style.color = '#0F172A'; }}
                onMouseLeave={e => { e.currentTarget.style.background = '#F1F5F9'; e.currentTarget.style.color = '#475569'; }}
                title="Close"
              >
                ✕
              </button>
            )}
          </div>
        </div>

        {/* MODAL BODY WITH BOUNDED RECEIPT PAPER */}
        <div style={{ padding: '16px 20px', background: '#F1F5F9', overflowY: 'auto', display: 'flex', justifyContent: 'center' }}>
          <div 
            id="curoxa-standard-receipt-half-a4"
            style={{
              background: '#FFFFFF',
              border: '1.5px solid #000000',
              padding: '12px 14px',
              boxShadow: '0 4px 12px rgba(0,0,0,0.06)',
              color: '#000000',
              fontFamily: 'Arial, Helvetica, sans-serif',
              fontSize: '11px',
              lineHeight: 1.25,
              width: '100%',
              boxSizing: 'border-box'
            }}
          >
          
          {/* 1. TOP HEADER */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '2px' }}>
            
            {/* Left: Logo Box & Clinic Name */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div style={{ width: '58px', height: '42px', border: '1.5px solid #000', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2px', flexShrink: 0, background: '#FFF' }}>
                {hospital.logoImageSrc ? (
                  <img src={hospital.logoImageSrc} alt="Logo" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
                ) : (
                  <div style={{ textAlign: 'center' }}>
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#000" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="12" y1="5" x2="12" y2="19"></line>
                      <line x1="5" y1="12" x2="19" y2="12"></line>
                    </svg>
                    <div style={{ fontSize: '7px', fontWeight: 900, letterSpacing: '0.5px' }}>CARE</div>
                  </div>
                )}
              </div>
              <div>
                <div style={{ fontFamily: 'Arial, sans-serif', fontSize: '19px', fontWeight: 900, lineHeight: 1.05, letterSpacing: '-0.3px', textTransform: 'uppercase', color: '#000' }}>
                  {displayName}
                </div>
              </div>
            </div>

            {/* Right: Run By & Address Details */}
            <div style={{ textAlign: 'right', maxWidth: '58%' }}>
              <div style={{ fontSize: '10px', fontWeight: 'bold', color: '#000', textTransform: 'uppercase' }}>RUN BY:</div>
              <div style={{ fontSize: '11.5px', fontWeight: 900, color: '#000', textTransform: 'uppercase', lineHeight: 1.2 }}>
                {runByEntity}
              </div>
              <div style={{ fontSize: '9.5px', color: '#000', marginTop: '1px', lineHeight: 1.2 }}>
                {displayAddress}
              </div>
              <div style={{ fontSize: '9.5px', color: '#000', lineHeight: 1.2 }}>
                Ph: {displayPhone} &nbsp; Email: {displayEmail}
              </div>
            </div>

          </div>

          {/* 2. BARCODE & DOCUMENT TITLE */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: '2px', marginBottom: '4px' }}>
            <div style={{ width: '130px' }} dangerouslySetInnerHTML={{ __html: barcodeSvgHtml }} />
            <div style={{ flex: 1, textAlign: 'center', fontSize: '12.5px', fontWeight: 900, textDecoration: 'underline', letterSpacing: '0.5px', textTransform: 'uppercase' }}>
              {documentTitle}
            </div>
            <div style={{ width: '130px', textAlign: 'right' }}>
              {/* Spacer for symmetry */}
            </div>
          </div>

          {/* 3. PATIENT & REGISTRATION METADATA GRID */}
          <div style={{ display: 'grid', gridTemplateColumns: '52% 48%', gap: '6px', fontSize: '10.5px', lineHeight: 1.35, marginBottom: '4px' }}>
            
            {/* Left Column */}
            <div>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <tbody>
                  <tr>
                    <td style={{ width: '95px', fontWeight: 600, color: '#000', padding: '1px 0' }}>Name :</td>
                    <td style={{ fontWeight: 900, color: '#000', padding: '1px 0' }}>{formattedPatientName}</td>
                  </tr>
                  <tr>
                    <td style={{ fontWeight: 600, color: '#000', padding: '1px 0' }}>Age/Gender :</td>
                    <td style={{ color: '#000', padding: '1px 0' }}>{ageGenderStr}</td>
                  </tr>
                  <tr>
                    <td style={{ fontWeight: 600, color: '#000', padding: '1px 0' }}>Mobile No. :</td>
                    <td style={{ color: '#000', padding: '1px 0' }}>{mobileNo}</td>
                  </tr>
                  <tr>
                    <td style={{ fontWeight: 600, color: '#000', padding: '1px 0' }}>Reg No. :</td>
                    <td style={{ fontWeight: 700, color: '#000', padding: '1px 0' }}>{regNo}</td>
                  </tr>
                  <tr>
                    <td style={{ fontWeight: 600, color: '#000', padding: '1px 0' }}>Refered By :</td>
                    <td style={{ color: '#000', padding: '1px 0' }}>{referredBy}</td>
                  </tr>
                  <tr>
                    <td style={{ fontWeight: 600, color: '#000', padding: '1px 0' }}>Proposal No/ID No. :</td>
                    <td style={{ color: '#000', padding: '1px 0' }}>{proposalNo}</td>
                  </tr>
                  <tr>
                    <td style={{ fontWeight: 600, color: '#000', padding: '1px 0' }}>Clinical History :</td>
                    <td style={{ color: '#000', padding: '1px 0' }}>{clinicalHistory}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Right Column */}
            <div>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <tbody>
                  <tr>
                    <td style={{ width: '95px', fontWeight: 600, color: '#000', padding: '1px 0' }}>Lab No. / Inv No. :</td>
                    <td style={{ fontWeight: 700, color: '#000', padding: '1px 0' }}>{receiptNo}</td>
                  </tr>
                  <tr>
                    <td style={{ fontWeight: 600, color: '#000', padding: '1px 0' }}>Barcode No. :</td>
                    <td style={{ color: '#000', padding: '1px 0' }}>{barcodeNo}</td>
                  </tr>
                  <tr>
                    <td style={{ fontWeight: 600, color: '#000', padding: '1px 0' }}>Delivery Mode :</td>
                    <td style={{ color: '#000', padding: '1px 0' }}>{deliveryMode}</td>
                  </tr>
                  <tr>
                    <td style={{ fontWeight: 600, color: '#000', padding: '1px 0' }}>Reg. Date :</td>
                    <td style={{ color: '#000', padding: '1px 0' }}>{regDateStr}</td>
                  </tr>
                  <tr>
                    <td style={{ fontWeight: 600, color: '#000', padding: '1px 0' }}>Party Name :</td>
                    <td style={{ color: '#000', padding: '1px 0' }}>{partyName}</td>
                  </tr>
                  <tr>
                    <td style={{ fontWeight: 600, color: '#000', padding: '1px 0' }}>Address :</td>
                    <td style={{ color: '#000', padding: '1px 0' }}>{patientAddress}</td>
                  </tr>
                </tbody>
              </table>
            </div>

          </div>

          {/* 4. ITEMS TABLE */}
          <div style={{ marginTop: '4px', marginBottom: '2px' }}>
            <table style={{ width: '100%', borderTop: '1.5px solid #000', borderBottom: '1.5px solid #000', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #000' }}>
                  <th style={{ padding: '3px 6px', textAlign: 'left', fontSize: '10.5px', fontWeight: 900, color: '#000', width: '6%' }}>Sr.No</th>
                  <th style={{ padding: '3px 6px', textAlign: 'left', fontSize: '10.5px', fontWeight: 900, color: '#000', width: '44%' }}>Particulars</th>
                  <th style={{ padding: '3px 6px', textAlign: 'left', fontSize: '10.5px', fontWeight: 900, color: '#000', width: '22%' }}>Sample Type</th>
                  <th style={{ padding: '3px 6px', textAlign: 'left', fontSize: '10.5px', fontWeight: 900, color: '#000', width: '14%' }}>DeliveryDate</th>
                  <th style={{ padding: '3px 6px', textAlign: 'right', fontSize: '10.5px', fontWeight: 900, color: '#000', width: '14%' }}>Amt ( Rs. )</th>
                </tr>
              </thead>
              <tbody>
                {items.map((it, idx) => {
                  const desc = it.description || it.name || it.medicineName || it.testName || it.particulars || 'Service';
                  const sampleType = it.sampleType || it.specimen || it.unit || (it.quantity ? `${it.quantity} Qty` : '—');
                  const deliveryDate = it.deliveryDate ? formatReceiptDateOnly(it.deliveryDate) : formatReceiptDateOnly(Date.now());
                  const amt = Number(it.amount ?? it.netAmount ?? it.price ?? 0);

                  return (
                    <tr key={idx} style={{ lineHeight: 1.25 }}>
                      <td style={{ padding: '3px 6px', textAlign: 'left', fontSize: '11px', color: '#000', verticalAlign: 'top' }}>{idx + 1}</td>
                      <td style={{ padding: '3px 6px', textAlign: 'left', fontSize: '11px', fontWeight: 700, color: '#000', verticalAlign: 'top' }}>
                        {String(desc).toUpperCase()}
                        {it.labName && (
                          <div style={{ fontSize: '9.5px', fontWeight: 700, color: '#1D4ED8', marginTop: '1px' }}>
                            LABORATORY: {it.labName.toUpperCase()}
                          </div>
                        )}
                        {it.sku && <div style={{ fontSize: '9.5px', fontWeight: 'normal', color: '#444' }}>SKU: {it.sku}</div>}
                      </td>
                      <td style={{ padding: '3px 6px', textAlign: 'left', fontSize: '11px', color: '#000', verticalAlign: 'top' }}>{sampleType}</td>
                      <td style={{ padding: '3px 6px', textAlign: 'left', fontSize: '11px', color: '#000', verticalAlign: 'top' }}>{deliveryDate}</td>
                      <td style={{ padding: '3px 6px', textAlign: 'right', fontSize: '11px', fontWeight: 700, color: '#000', verticalAlign: 'top' }}>{amt.toFixed(2)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* 5. TOTALS & SETTLEMENT SUMMARY */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginTop: '4px', fontSize: '10.5px' }}>
            
            {/* Left: Settlement History */}
            <div style={{ maxWidth: '65%' }}>
              {settlementLines.map((line, idx) => (
                <div key={idx} style={{ color: '#000', fontSize: '10px', lineHeight: 1.3 }}>{line}</div>
              ))}
              {discountAmount > 0 && (
                <div style={{ color: '#000', fontSize: '10px', lineHeight: 1.3 }}>Discount Applied : -₹{discountAmount.toFixed(2)}</div>
              )}
            </div>

            {/* Right: Subtotal & Amount Paid */}
            <div style={{ width: '190px', textAlign: 'right' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '1px 0', fontSize: '11px' }}>
                <span style={{ fontWeight: 600 }}>Total :</span>
                <span style={{ fontWeight: 900 }}>{totalAmount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
              </div>
              <div style={{ borderBottom: '1px solid #000', margin: '2px 0' }} />
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '1px 0', fontSize: '11px' }}>
                <span style={{ fontWeight: 700 }}>Amount Paid :</span>
                <span style={{ fontWeight: 900 }}>{amountPaid.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
              </div>
              {balanceDue > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '1px 0', fontSize: '11px', color: '#B91C1C' }}>
                  <span style={{ fontWeight: 700 }}>Balance Due :</span>
                  <span style={{ fontWeight: 900 }}>{balanceDue.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                </div>
              )}
            </div>

          </div>

          {/* 7. DIVIDER & DISCLAIMER */}
          <div style={{ marginTop: '4px', borderBottom: '1px dashed #000', position: 'relative' }}>
            <span style={{ position: 'absolute', right: 0, bottom: '-6px', background: '#FFF', paddingLeft: '6px', fontSize: '9.5px', fontWeight: 700 }}>E. & O.E.</span>
          </div>

          <div style={{ marginTop: '6px', fontSize: '9.5px', color: '#000', lineHeight: 1.25 }}>
            <div>{displayName} is not responsible for loss of any items in the premises</div>
            <div>Reports Timing at 4:30pm To 5:30pm</div>
          </div>

          {/* 8. FOOTER METADATA */}
          <div style={{ marginTop: '6px', borderTop: '1px solid #000', paddingTop: '3px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '10px' }}>
            <div>
              Created By : &nbsp;&nbsp;<strong>{createdBy}</strong>
            </div>
            <div>
              Print DateTime : &nbsp;&nbsp;{printDateTime}
            </div>
            <div>
              Page 1 of 1
            </div>
          </div>

        </div>

      </div>
    </div>
  </div>
  );
}
