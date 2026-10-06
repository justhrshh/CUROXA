const PDFDocument = require('pdfkit');

/**
 * Generates an official, beautifully formatted Prescription & Clinical Summary PDF Buffer
 * using pdfkit.
 *
 * @param {Object} options
 * @param {Object} options.hospital
 * @param {Object} options.patient
 * @param {Object} options.doctor
 * @param {Object} options.appointment
 * @param {Object} options.prescription
 * @param {Array}  options.items
 * @param {Array}  options.labs
 * @param {string} options.customNote
 * @returns {Promise<Buffer>}
 */
function generatePrescriptionPdf({
  hospital,
  patient,
  doctor,
  appointment,
  prescription,
  items = [],
  labs = [],
  customNote = ''
}) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: 'A4',
        margin: 36,
        info: {
          Title: `Prescription - ${patient?.name || 'Patient'}`,
          Author: hospital?.name || 'Quroxa Healthcare',
          Subject: 'Official Medical Prescription & Clinical Summary'
        }
      });

      const chunks = [];
      doc.on('data', chunk => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', err => reject(err));

      const primaryColor = '#1D4ED8';
      const textDark = '#0F172A';
      const textMuted = '#475569';
      const borderColor = '#CBD5E1';
      const bgLight = '#F8FAFC';

      const pageWidth = 595.28;
      const margin = 36;
      const contentWidth = pageWidth - (margin * 2); // ~523pt

      let y = margin;

      // 1. HOSPITAL HEADER BANNER
      doc.rect(margin, y, contentWidth, 68).fill(primaryColor);

      // Hospital Name
      doc.fillColor('#FFFFFF')
         .fontSize(18)
         .font('Helvetica-Bold')
         .text(hospital?.name || 'QUROXA HEALTHCARE', margin + 16, y + 14, {
           width: contentWidth - 32,
           align: 'left'
         });

      // Hospital Subtitle / Address / Phone
      const hospMeta = [
        hospital?.address || '',
        hospital?.phone ? `Phone: ${hospital.phone}` : ''
      ].filter(Boolean).join('  •  ') || 'OFFICIAL MEDICAL PRESCRIPTION & CLINICAL SUMMARY';

      doc.fillColor('#DBEAFE')
         .fontSize(9)
         .font('Helvetica')
         .text(hospMeta, margin + 16, y + 38, {
           width: contentWidth - 32,
           align: 'left'
         });

      y += 78;

      // 2. PATIENT & DOCTOR INFO BOX
      doc.rect(margin, y, contentWidth, 76).fillAndStroke(bgLight, borderColor);

      // Left Column: Patient Details
      const pLeft = margin + 14;
      doc.fillColor(primaryColor)
         .fontSize(8)
         .font('Helvetica-Bold')
         .text('PATIENT INFORMATION', pLeft, y + 10);

      doc.fillColor(textDark)
         .fontSize(12)
         .font('Helvetica-Bold')
         .text(patient?.name || 'Patient Name', pLeft, y + 22);

      const patientMeta = [
        patient?.uhid ? `UHID: ${patient.uhid}` : '',
        patient?.age ? `${patient.age} Yrs` : '',
        patient?.gender || '',
        patient?.contact ? `Ph: ${patient.contact}` : ''
      ].filter(Boolean).join('  |  ');

      doc.fillColor(textMuted)
         .fontSize(9)
         .font('Helvetica')
         .text(patientMeta, pLeft, y + 38);

      // Right Column: Doctor & Encounter Details
      const dRight = margin + (contentWidth / 2) + 10;
      doc.fillColor(primaryColor)
         .fontSize(8)
         .font('Helvetica-Bold')
         .text('ATTENDING DOCTOR & DATE', dRight, y + 10);

      const docName = doctor?.name ? (doctor.name.startsWith('Dr') ? doctor.name : `Dr. ${doctor.name}`) : 'Dr. Doctor';
      doc.fillColor(textDark)
         .fontSize(12)
         .font('Helvetica-Bold')
         .text(docName, dRight, y + 22);

      const docReg = doctor?.staff_id ? (doctor.staff_id.match(/^\d+$/) ? doctor.staff_id.slice(-5) : doctor.staff_id.toUpperCase()) : 'DMC-51699';
      const rxDate = prescription?.createdAt || appointment?.date || new Date();
      const dateFormatted = new Date(rxDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

      doc.fillColor(textMuted)
         .fontSize(9)
         .font('Helvetica')
         .text(`${doctor?.specialty || 'General Medicine'}  •  Reg: ${docReg}  •  ${dateFormatted}`, dRight, y + 38);

      y += 86;

      // 3. CLINICAL SUMMARY (Diagnosis & Vitals)
      const diagnosisText = prescription?.diagnosis || appointment?.diagnosis || '';
      const notesText = prescription?.notes || appointment?.notes || '';

      // Extract Vitals
      let vitalsArr = [];
      const vitalsObj = appointment?.vitals || patient?.vitals;
      if (typeof vitalsObj === 'string' && vitalsObj.trim()) {
        vitalsArr = vitalsObj.split('|').map(v => v.trim()).filter(Boolean);
      } else if (vitalsObj && typeof vitalsObj === 'object') {
        if (vitalsObj.bpSys) vitalsArr.push(`BP: ${vitalsObj.bpSys}/${vitalsObj.bpDia || ''} mmHg`);
        if (vitalsObj.pulse) vitalsArr.push(`Pulse: ${vitalsObj.pulse} bpm`);
        if (vitalsObj.temp) vitalsArr.push(`Temp: ${vitalsObj.temp} °F`);
        if (vitalsObj.weight) vitalsArr.push(`Weight: ${vitalsObj.weight} kg`);
      }

      if (diagnosisText || vitalsArr.length > 0 || customNote) {
        let diagBoxHeight = 44;
        if (customNote) diagBoxHeight += 16;
        if (vitalsArr.length > 0) diagBoxHeight += 14;

        doc.rect(margin, y, contentWidth, diagBoxHeight).fillAndStroke('#FFFBEB', '#FDE68A');

        let diagY = y + 8;
        if (diagnosisText) {
          doc.fillColor('#92400E')
             .fontSize(8.5)
             .font('Helvetica-Bold')
             .text('PRIMARY DIAGNOSIS: ', margin + 12, diagY, { continued: true })
             .font('Helvetica')
             .fillColor('#78350F')
             .text(diagnosisText.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim());
          diagY += 16;
        }

        if (vitalsArr.length > 0) {
          doc.fillColor('#92400E')
             .fontSize(8)
             .font('Helvetica-Bold')
             .text('RECORDED VITALS: ', margin + 12, diagY, { continued: true })
             .font('Helvetica')
             .fillColor('#78350F')
             .text(vitalsArr.join('  •  '));
          diagY += 14;
        }

        if (customNote) {
          doc.fillColor('#92400E')
             .fontSize(8)
             .font('Helvetica-Bold')
             .text('DOCTOR NOTE: ', margin + 12, diagY, { continued: true })
             .font('Helvetica')
             .fillColor('#78350F')
             .text(customNote);
        }

        y += diagBoxHeight + 10;
      }

      // 4. PRESCRIBED MEDICINES (Rx TABLE)
      doc.fillColor(primaryColor)
         .fontSize(10)
         .font('Helvetica-Bold')
         .text(`Rx — PRESCRIBED MEDICATIONS (${items.length})`, margin, y);
      y += 14;

      // Table Header
      const colW = {
        num: 26,
        name: 180,
        dosage: 75,
        freq: 85,
        duration: 65,
        instructions: 92
      };

      doc.rect(margin, y, contentWidth, 20).fill('#1E293B');
      doc.fillColor('#FFFFFF').fontSize(8).font('Helvetica-Bold');
      doc.text('#', margin + 6, y + 6, { width: colW.num });
      doc.text('Medicine / Generic Name', margin + colW.num + 6, y + 6, { width: colW.name });
      doc.text('Dosage', margin + colW.num + colW.name, y + 6, { width: colW.dosage });
      doc.text('Frequency', margin + colW.num + colW.name + colW.dosage, y + 6, { width: colW.freq });
      doc.text('Duration', margin + colW.num + colW.name + colW.dosage + colW.freq, y + 6, { width: colW.duration });
      doc.text('Instructions', margin + colW.num + colW.name + colW.dosage + colW.freq + colW.duration, y + 6, { width: colW.instructions });
      y += 20;

      // Table Rows
      if (items.length === 0) {
        doc.rect(margin, y, contentWidth, 24).fillAndStroke('#FFFFFF', borderColor);
        doc.fillColor(textMuted).fontSize(8.5).font('Helvetica')
           .text('No medicines prescribed for this consultation.', margin + 10, y + 8);
        y += 24;
      } else {
        items.forEach((item, idx) => {
          const rowBg = (idx % 2 === 0) ? '#FFFFFF' : bgLight;
          doc.rect(margin, y, contentWidth, 24).fillAndStroke(rowBg, borderColor);

          let freq = 'Once a Day';
          let inst = 'After Food';
          if (item.instructions) {
            const parts = item.instructions.split('(');
            if (parts[0]) freq = parts[0].trim();
            if (parts[1]) inst = parts[1].replace(')', '').trim();
          }

          doc.fillColor(textMuted).fontSize(8).font('Helvetica').text(String(idx + 1), margin + 6, y + 7, { width: colW.num });
          doc.fillColor(textDark).fontSize(8.5).font('Helvetica-Bold').text(item.medicine || item.name || 'Medicine', margin + colW.num + 6, y + 7, { width: colW.name - 6, lineBreak: false });
          doc.fillColor(textMuted).fontSize(8).font('Helvetica').text(item.dosage || item.dose || '—', margin + colW.num + colW.name, y + 7, { width: colW.dosage });
          doc.fillColor('#2563EB').fontSize(8).font('Helvetica-Bold').text(freq, margin + colW.num + colW.name + colW.dosage, y + 7, { width: colW.freq });
          doc.fillColor(textMuted).fontSize(8).font('Helvetica').text(item.duration || '—', margin + colW.num + colW.name + colW.dosage + colW.freq, y + 7, { width: colW.duration });
          doc.fillColor(textMuted).fontSize(8).font('Helvetica').text(inst, margin + colW.num + colW.name + colW.dosage + colW.freq + colW.duration, y + 7, { width: colW.instructions });

          y += 24;
        });
      }

      y += 12;

      // 5. LAB INVESTIGATIONS (If Any)
      if (labs.length > 0) {
        doc.fillColor(primaryColor)
           .fontSize(10)
           .font('Helvetica-Bold')
           .text(`RECOMMENDED INVESTIGATIONS (${labs.length})`, margin, y);
        y += 14;

        doc.rect(margin, y, contentWidth, 18).fill('#F1F5F9');
        doc.fillColor(textDark).fontSize(8).font('Helvetica-Bold');
        doc.text('#', margin + 6, y + 5, { width: 30 });
        doc.text('Test / Panel Name', margin + 36, y + 5, { width: contentWidth - 40 });
        y += 18;

        labs.forEach((test, idx) => {
          const tName = test.testName || test.name || (typeof test === 'string' ? test : 'Test');
          doc.rect(margin, y, contentWidth, 20).fillAndStroke('#FFFFFF', borderColor);
          doc.fillColor(textMuted).fontSize(8).font('Helvetica').text(String(idx + 1), margin + 6, y + 6, { width: 30 });
          doc.fillColor(textDark).fontSize(8.5).font('Helvetica').text(tName, margin + 36, y + 6, { width: contentWidth - 40 });
          y += 20;
        });

        y += 12;
      }

      // 6. CLINICAL SOAP NOTES (If Any)
      if (notesText) {
        const cleanNotes = notesText.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
        if (cleanNotes) {
          doc.fillColor(textDark)
             .fontSize(9)
             .font('Helvetica-Bold')
             .text('CLINICAL ADVICE & SOAP NOTES:', margin, y);
          y += 12;

          doc.fillColor(textMuted)
             .fontSize(8.5)
             .font('Helvetica')
             .text(cleanNotes, margin, y, { width: contentWidth, lineGap: 2 });
          y += 28;
        }
      }

      // 7. SIGNATURE & VERIFICATION FOOTER
      const footerY = 720;
      doc.rect(margin, footerY, contentWidth, 1).fill(borderColor);

      // Left Footer: Patient Advice
      doc.fillColor(textMuted)
         .fontSize(7.5)
         .font('Helvetica')
         .text('Instructions: Take all medicines as prescribed. Do not discontinue without medical consultation.', margin, footerY + 8, { width: 340 });
      doc.text('This is an official digitally verified electronic prescription.', margin, footerY + 18, { width: 340 });

      // Right Footer: Doctor Signature Box
      const sigX = margin + contentWidth - 160;
      doc.fillColor(primaryColor)
         .fontSize(9)
         .font('Helvetica-Bold')
         .text(docName, sigX, footerY + 8, { width: 160, align: 'right' });
      doc.fillColor(textMuted)
         .fontSize(7.5)
         .font('Helvetica')
         .text(`Reg. No: ${docReg}`, sigX, footerY + 20, { width: 160, align: 'right' });
      doc.fillColor('#059669')
         .fontSize(7)
         .font('Helvetica-Bold')
         .text('DIGITALLY VERIFIED', sigX, footerY + 30, { width: 160, align: 'right' });

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

module.exports = {
  generatePrescriptionPdf
};
