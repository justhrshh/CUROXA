import api from './api';
import { convertPdfToImage } from './pdfHelper';

/**
 * Universal prescription document printer supporting Hospital Letterhead,
 * Doctor Custom Letterhead, or Plain Paper (with safe letterhead margins).
 */
export const triggerPrintPrescriptionDocument = ({
  patient = {},
  doctor = {},
  appointment = {},
  prescription = {},
  labs = [],
  settings = {},
  clinicName = ''
}) => {
  try {
    const activeMode = settings.letterheadMode || 'hospital';
    let letterheadUrl = '';
    if (activeMode === 'hospital') {
      letterheadUrl = settings.hospitalLetterhead || '';
    } else if (activeMode === 'custom') {
      letterheadUrl = settings.doctorCustomLetterhead || doctor.customLetterhead || settings.hospitalLetterhead || '';
    } else {
      letterheadUrl = ''; // 'none': blank background for pre-printed letterhead paper
    }

    const topSpacer = settings.topSpacer || 38;
    const bottomSpacer = settings.bottomSpacer || 28;
    const xLeft = settings.xLeft || 15;
    const xRight = settings.xRight || 15;

    const cleanField = (val) => (val && String(val).trim() !== '') ? String(val).trim() : '—';
    const patientName = cleanField(patient.name);
    const patientUhid = cleanField(patient.uhid || patient.patientId);
    const patientAge = patient.age ? `${patient.age} Yrs` : '—';
    const patientGender = cleanField(patient.gender);
    const patientContact = cleanField(patient.contact || patient.phone);
    const patientAddress = cleanField(patient.address || patient.city);

    const docName = doctor.name ? (doctor.name.startsWith('Dr.') ? doctor.name : `Dr. ${doctor.name}`) : 'Dr. Assigned Physician';
    const docDesignation = cleanField(doctor.designation || 'MBBS, MD');
    const docReg = doctor.staff_id ? (doctor.staff_id.match(/^\d+$/) ? doctor.staff_id.slice(-5) : doctor.staff_id.toUpperCase()) : '44442';
    const docDept = cleanField(doctor.specialty || doctor.role || doctor.department || 'General Medicine');

    const rxDateObj = prescription.date || prescription.createdAt || appointment.date || new Date();
    const rxDate = new Date(rxDateObj).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

    // Process Vitals
    let vitalsString = '—';
    const rawVitals = appointment.vitals || patient.vitals;
    if (typeof rawVitals === 'string' && rawVitals.trim()) {
      vitalsString = rawVitals;
    } else if (rawVitals && typeof rawVitals === 'object') {
      const parts = [];
      if (rawVitals.bpSys) parts.push(`BP: ${rawVitals.bpSys}/${rawVitals.bpDia || ''} mmHg`);
      if (rawVitals.pulse) parts.push(`Pulse: ${rawVitals.pulse} bpm`);
      if (rawVitals.temp || rawVitals.temperature) parts.push(`Temp: ${rawVitals.temp || rawVitals.temperature} °F`);
      if (rawVitals.weight) parts.push(`Weight: ${rawVitals.weight} kg`);
      if (parts.length > 0) vitalsString = parts.join(' | ');
    }

    // Process Medicines
    const items = prescription.items || [];
    const medRows = items.length > 0 ? items.map((m, idx) => {
      let freq = 'Once a Day';
      let inst = 'After Food';
      if (m.instructions) {
        const parts = m.instructions.split('(');
        if (parts[0]) freq = parts[0].trim();
        if (parts[1]) inst = parts[1].replace(')', '').trim();
      }
      return `
        <tr style="border-bottom: 1px solid #E2E8F0; background: ${idx % 2 === 0 ? '#FFFFFF' : '#F8FAFC'};">
          <td style="padding: 9px 8px; text-align: center; color: #64748B; font-weight: 700; width: 36px;">${idx + 1}</td>
          <td style="padding: 9px 12px; font-weight: 800; color: #0F172A; font-size: 12.5px;">${m.medicine || m.name || '—'}</td>
          <td style="padding: 9px 10px; text-align: center; color: #1E293B; font-weight: 700;">${m.dosage || m.dose || '—'}</td>
          <td style="padding: 9px 10px; text-align: center; color: #1E293B; font-weight: 600;">${m.duration || '—'}</td>
          <td style="padding: 9px 10px; text-align: center; color: #2563EB; font-weight: 700;">${freq}</td>
          <td style="padding: 9px 12px; color: #475569; font-weight: 500;">${inst}</td>
        </tr>
      `;
    }).join('') : `
      <tr>
        <td colspan="6" style="padding: 20px; text-align: center; color: #94A3B8; font-weight: 600;">No medications prescribed for this visit.</td>
      </tr>
    `;

    // Process Labs
    const labRows = labs && labs.length > 0 ? labs.map((t, idx) => `
      <tr style="border-bottom: 1px solid #E2E8F0; background: ${idx % 2 === 0 ? '#FFFFFF' : '#F8FAFC'};">
        <td style="padding: 7px 10px; text-align: center; color: #64748B; font-weight: 700; width: 36px;">${idx + 1}</td>
        <td style="padding: 7px 12px; font-weight: 700; color: #0F172A; font-size: 12px;">${t.testName || t.name || t}</td>
      </tr>
    `).join('') : '';

    const cleanDiagnosis = (appointment.diagnosis || prescription.diagnosis) ? (
      (appointment.diagnosis || prescription.diagnosis).includes('<') 
        ? (appointment.diagnosis || prescription.diagnosis)
        : (appointment.diagnosis || prescription.diagnosis).split('\n').filter(Boolean).map(l => `<div>• ${l.trim()}</div>`).join('')
    ) : null;

    const notes = appointment.notes || prescription.notes || '';

    // Create hidden iframe for printing
    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.left = '-9999px';
    iframe.style.top = '-9999px';
    iframe.style.width = '1024px';
    iframe.style.height = '1448px';
    iframe.style.border = '0';
    iframe.style.zIndex = '-9999';
    document.body.appendChild(iframe);

    const isDigitalLetterhead = !!letterheadUrl;

    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Prescription - ${patientName}</title>
        <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=Outfit:wght@700;800;900&display=swap" rel="stylesheet">
        <style>
          @page {
            size: A4;
            margin: 0;
          }
          @media print {
            body {
              margin: 0;
              padding: 0;
              -webkit-print-color-adjust: exact;
              print-color-adjust: exact;
            }
            .page-container {
              box-shadow: none !important;
              page-break-after: always !important;
            }
          }
          * { box-sizing: border-box; }
          body {
            font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, sans-serif;
            color: #0F172A;
            margin: 0;
            padding: 0;
            background: #ffffff;
            font-size: 12px;
            line-height: 1.5;
          }
          .page-container {
            width: 210mm;
            min-height: 297mm;
            margin: 0 auto;
            background-color: #ffffff;
            ${isDigitalLetterhead ? `background-image: url("${letterheadUrl}"); background-size: 210mm 297mm; background-repeat: no-repeat;` : ''}
            padding-top: ${topSpacer}mm;
            padding-bottom: ${bottomSpacer}mm;
            padding-left: ${xLeft}mm;
            padding-right: ${xRight}mm;
            display: flex;
            flex-direction: column;
            justify-content: space-between;
          }
          .content-area {
            flex: 1;
          }
          .header-banner {
            display: flex;
            justify-content: space-between;
            align-items: center;
            border-bottom: 2px solid #0F172A;
            padding-bottom: 10px;
            margin-bottom: 14px;
          }
          .hosp-name { font-family: 'Outfit', sans-serif; font-size: 20px; font-weight: 900; color: #0F172A; text-transform: uppercase; margin: 0; }
          .hosp-sub { font-size: 9.5px; color: #64748B; font-weight: 700; text-transform: uppercase; margin: 2px 0 0 0; }
          .patient-card {
            background: #F8FAFC;
            border: 1.5px solid #CBD5E1;
            border-radius: 10px;
            padding: 10px 14px;
            margin-bottom: 14px;
          }
          .sec-header {
            font-family: 'Outfit', sans-serif;
            font-size: 11px;
            font-weight: 800;
            color: #0F172A;
            text-transform: uppercase;
            letter-spacing: 0.04em;
            margin: 14px 0 6px 0;
            display: flex;
            align-items: center;
            gap: 5px;
          }
          .rx-table {
            width: 100%;
            border-collapse: collapse;
            border: 1px solid #E2E8F0;
            border-radius: 8px;
            overflow: hidden;
            margin-bottom: 12px;
            font-size: 11.5px;
          }
          .rx-table th {
            background: #F1F5F9;
            padding: 8px 10px;
            font-weight: 800;
            color: #475569;
            text-transform: uppercase;
            font-size: 10px;
            border-bottom: 1.5px solid #CBD5E1;
          }
          .sig-container {
            display: flex;
            justify-content: space-between;
            align-items: flex-end;
            margin-top: 24px;
            padding-top: 14px;
            border-top: 1.5px solid #E2E8F0;
          }
          .sig-box { text-align: center; width: 210px; }
          .sig-script {
            font-family: 'Brush Script MT', 'Lucida Handwriting', cursive, sans-serif;
            font-size: 26px;
            color: #1E3A8A;
            height: 35px;
            line-height: 35px;
            margin-bottom: 4px;
          }
          .sig-name { font-size: 13px; font-weight: 800; color: #0F172A; }
          .sig-deg { font-size: 11px; color: #64748B; font-weight: 600; }
          .sig-seal { font-size: 10px; color: #059669; font-weight: 700; margin-top: 4px; background: #ECFDF5; border: 1px solid #A7F3D0; padding: 2px 6px; border-radius: 4px; display: inline-block; }
        </style>
      </head>
      <body>
        <div class="page-container">
          <div class="content-area">
            ${!isDigitalLetterhead && activeMode === 'hospital' && clinicName ? `
              <div class="header-banner">
                <div>
                  <h1 class="hosp-name">${clinicName}</h1>
                  <p class="hosp-sub">Official Clinical Prescription & Encounter Summary</p>
                </div>
                <div style="text-align: right; font-size: 11px; color: #64748B;">
                  <div>Date: <strong style="color: #0F172A;">${rxDate}</strong></div>
                  ${patientUhid !== '—' ? `<div>UHID: <strong style="color: #2563EB; font-family: monospace;">${patientUhid}</strong></div>` : ''}
                </div>
              </div>
            ` : ''}

            <div class="patient-card">
              <div style="display: flex; justify-content: space-between; align-items: baseline; border-bottom: 1px solid #E2E8F0; padding-bottom: 6px; margin-bottom: 8px;">
                <div style="display: flex; align-items: baseline; gap: 8px;">
                  <span style="font-size: 15px; font-weight: 900; color: #0F172A;">${patientName}</span>
                  ${patientUhid !== '—' ? `<span style="font-size: 10.5px; font-weight: 800; background: #EFF6FF; color: #1D4ED8; border: 1px solid #BFDBFE; padding: 1px 6px; border-radius: 4px; font-family: monospace;">UHID: ${patientUhid}</span>` : ''}
                  <span style="font-size: 11px; font-weight: 700; color: #475569;">${patientAge} • ${patientGender}</span>
                </div>
                <div style="font-size: 11px; color: #64748B;">
                  <span>Date: <strong style="color: #0F172A;">${rxDate}</strong></span>
                  <span style="margin: 0 6px;">•</span>
                  <span>Doctor: <strong style="color: #0F172A;">${docName}</strong> (${docDept})</span>
                </div>
              </div>
              <div style="display: flex; justify-content: space-between; align-items: center; font-size: 11px; color: #475569; flex-wrap: wrap; gap: 4px 12px;">
                <div><span style="color: #64748B; font-weight: 600;">Mobile: </span><strong style="color: #1E293B;">${patientContact}</strong></div>
                ${patientAddress !== '—' ? `<div><span style="color: #64748B; font-weight: 600;">Address: </span><strong style="color: #1E293B;">${patientAddress}</strong></div>` : ''}
                <div><span style="color: #64748B; font-weight: 600;">Reg. No: </span><strong style="color: #1E293B;">DMC-${docReg}</strong></div>
                ${vitalsString !== '—' ? `<div><span style="color: #0284C7; font-weight: 800; background: #F0F9FF; border: 1px solid #BAE6FD; padding: 1px 6px; border-radius: 4px; font-size: 9.5px; text-transform: uppercase;">Vitals</span> <strong style="color: #0F172A;">${vitalsString}</strong></div>` : ''}
              </div>
            </div>

            ${cleanDiagnosis ? `
              <div class="sec-header">Clinical Diagnosis & Observation</div>
              <div style="background: #FFFBEB; border: 1px solid #FDE68A; border-left: 3.5px solid #D97706; border-radius: 6px; padding: 9px 12px; font-size: 12px; color: #78350F; font-weight: 600; margin-bottom: 12px; line-height: 1.5;">
                ${cleanDiagnosis}
              </div>
            ` : ''}

            ${notes ? `
              <div class="sec-header">Clinical SOAP Notes & Advice</div>
              <div style="background: #F8FAFC; border: 1px solid #E2E8F0; border-left: 3.5px solid #2563EB; border-radius: 6px; padding: 9px 12px; font-size: 11.5px; color: #334155; margin-bottom: 12px; line-height: 1.5; white-space: pre-wrap;">
                ${notes}
              </div>
            ` : ''}

            <div class="sec-header">Prescribed Medications (${items.length} Items)</div>
            <table class="rx-table">
              <thead>
                <tr>
                  <th style="width: 36px; text-align: center;">#</th>
                  <th style="text-align: left;">Medicine Name</th>
                  <th style="width: 85px; text-align: center;">Dosage</th>
                  <th style="width: 85px; text-align: center;">Duration</th>
                  <th style="width: 110px; text-align: center;">Frequency</th>
                  <th style="text-align: left;">Instructions</th>
                </tr>
              </thead>
              <tbody>
                ${medRows}
              </tbody>
            </table>

            ${labRows ? `
              <div class="sec-header">Prescribed Lab Tests</div>
              <table class="rx-table" style="max-width: 70%;">
                <thead>
                  <tr>
                    <th style="width: 36px; text-align: center;">#</th>
                    <th style="text-align: left;">Test / Investigation</th>
                  </tr>
                </thead>
                <tbody>
                  ${labRows}
                </tbody>
              </table>
            ` : ''}
          </div>

          <div class="sig-container">
            <div style="max-width: 60%;">
              <div style="font-size: 10.5px; font-weight: 800; color: #0F172A; text-transform: uppercase; margin-bottom: 3px;">Patient Instructions:</div>
              <ul style="margin: 0; padding-left: 14px; font-size: 10.5px; color: #475569; line-height: 1.5;">
                <li>Take medicines strictly according to prescribed timing and dosage.</li>
                <li>Complete the full course of medication without interruption.</li>
                <li>Maintain adequate hydration, avoid cold drinks and rest well.</li>
              </ul>
            </div>
            <div class="sig-box">
              <div class="sig-script">${docName.replace(/^Dr\.?\s*/i, '')}</div>
              <div style="border-bottom: 1.5px solid #0F172A; margin-bottom: 4px;"></div>
              <div class="sig-name">${docName}</div>
              <div class="sig-deg">${docDesignation}</div>
              <div class="sig-deg">Reg. No. DMC - ${docReg}</div>
              <div class="sig-seal">✓ Digitally Signed Record</div>
            </div>
          </div>
        </div>
      </body>
      </html>
    `;

    iframe.contentDocument.open();
    iframe.contentDocument.write(htmlContent);
    iframe.contentDocument.close();

    setTimeout(() => {
      try {
        iframe.contentWindow.focus();
        iframe.contentWindow.print();
      } catch (err) {
        console.error('Print trigger error:', err);
      }
      setTimeout(() => {
        try {
          document.body.removeChild(iframe);
        } catch (e) {}
      }, 60000);
    }, 400);

  } catch (outerErr) {
    console.error('Failed to trigger prescription print:', outerErr);
  }
};
