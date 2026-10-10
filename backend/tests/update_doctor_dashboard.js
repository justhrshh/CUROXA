const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../../frontend/src/pages/DoctorDashboard.jsx');
let content = fs.readFileSync(filePath, 'utf8');

// 1. handleLoadPrescriptionForEdit: preserve itemCode, masterItemId, genericName and set soap.plan: resolvedNotes
const target1 = `        return {
          id: Date.now() + idx + 1,
          name: item.medicine || item.name || '',
          dose: item.dosage || item.dose || '500 mg',
          freq: freq,
          duration: item.duration || '5 Days',
          timing: timing,
          notes: item.notes || ''
        };
      });
      setMedicines(loadedMeds);
    } else {
      setMedicines([]);
    }

    // Map labs from argument or rx.labs
    const sourceLabs = relatedLabs || rx.labs || [];
    if (sourceLabs && sourceLabs.length > 0) {
      setLabs(sourceLabs.map(l => (typeof l === 'string' ? l : (l.testName || l.name || ''))).filter(Boolean));
    } else {
      setLabs([]);
    }

    // Resolve appointment clinical notes & diagnosis
    const relatedApp = appIdStr ? (appointments || []).find(a => String(a._id) === appIdStr) : null;
    const resolvedDiagnosis = rx.diagnosis || relatedApp?.diagnosis || '';
    const resolvedNotes = rx.notes || relatedApp?.notes || '';

    setDiagnosisText(resolvedDiagnosis);
    setSoap({
      subjective: '',
      objective: '',
      assessment: resolvedNotes,
      plan: ''
    });`;

const replace1 = `        return {
          id: Date.now() + idx + 1,
          name: item.medicine || item.name || '',
          dose: item.dosage || item.dose || '500 mg',
          freq: freq,
          duration: item.duration || '5 Days',
          timing: timing,
          notes: item.notes || '',
          itemCode: item.itemCode || '',
          masterItemId: item.masterItemId || null,
          genericName: item.genericName || ''
        };
      });
      setMedicines(loadedMeds);
    } else {
      setMedicines([]);
    }

    // Map labs from rx.tests or argument or rx.labs
    const sourceLabs = (rx.tests && rx.tests.length > 0) ? rx.tests : (relatedLabs || rx.labs || []);
    if (sourceLabs && sourceLabs.length > 0) {
      setLabs(sourceLabs.map(l => (typeof l === 'string' ? l : (l.testName || l.name || ''))).filter(Boolean));
    } else {
      setLabs([]);
    }

    // Resolve appointment clinical notes & diagnosis
    const relatedApp = appIdStr ? (appointments || []).find(a => String(a._id) === appIdStr) : null;
    const resolvedDiagnosis = rx.diagnosis || relatedApp?.diagnosis || '';
    const resolvedNotes = rx.notes || relatedApp?.notes || '';

    setDiagnosisText(resolvedDiagnosis);
    setSoap({
      subjective: '',
      objective: '',
      assessment: resolvedNotes,
      plan: resolvedNotes
    });`;

// Normalize line endings for target search
const norm = str => str.replace(/\r\n/g, '\n');
const denorm = (str, isCRLF) => isCRLF ? str.replace(/\n/g, '\r\n') : str;

const isCRLF = content.includes('\r\n');
let normContent = norm(content);

if (!normContent.includes(norm(target1))) {
  console.error("Target 1 not found!");
  process.exit(1);
}
normContent = normContent.replace(norm(target1), norm(replace1));
console.log("Applied change 1 (handleLoadPrescriptionForEdit)");

// 2. validMedicines in executeSaveAndLockPrescription
const target2 = `        return {
          medicine: m.name.trim(),
          dosage: m.dose && m.dose.trim() !== '' ? m.dose.trim() : '500 mg',
          duration: m.duration && m.duration.trim() !== '' ? m.duration.trim() : '5 Days',
          instructions: \`\${m.freq || 'Once a day'} (\${m.timing || 'After Food'})\`,
          quantity: qty
        };`;

const replace2 = `        return {
          medicine: m.name.trim(),
          dosage: m.dose && m.dose.trim() !== '' ? m.dose.trim() : '500 mg',
          duration: m.duration && m.duration.trim() !== '' ? m.duration.trim() : '5 Days',
          instructions: \`\${m.freq || 'Once a day'} (\${m.timing || 'After Food'})\`,
          quantity: qty,
          itemCode: m.itemCode || undefined,
          masterItemId: m.masterItemId || undefined,
          genericName: m.genericName || undefined
        };`;

if (!normContent.includes(norm(target2))) {
  console.error("Target 2 not found!");
  process.exit(1);
}
normContent = normContent.replace(norm(target2), norm(replace2));
console.log("Applied change 2 (validMedicines mapping)");

// 3. POST /prescriptions in executeSaveAndLockPrescription
const target3 = `        const rxRes = await api.post('/prescriptions', {
          appointmentId: resolvedAppId,
          patientId: patientId,
          doctorId: user.id,
          status: rxStatus,
          items: validMedicines
        });`;

const replace3 = `        const rxRes = await api.post('/prescriptions', {
          appointmentId: resolvedAppId,
          patientId: patientId,
          doctorId: user.id,
          status: rxStatus,
          items: validMedicines,
          notes: soap.plan || soap.assessment || '',
          diagnosis: cleanDiagnosisText,
          tests: validLabs
        });`;

if (!normContent.includes(norm(target3))) {
  console.error("Target 3 not found!");
  process.exit(1);
}
normContent = normContent.replace(norm(target3), norm(replace3));
console.log("Applied change 3 (POST /prescriptions notes/tests persistence)");

// 4. PUT /prescriptions in executeSaveAndLockPrescription
const target4 = `        const rxRes = await api.put(\`/prescriptions/\${editingPrescriptionId}\`, {
          appointmentId: resolvedAppId,
          patientId: patientId,
          doctorId: user.id,
          status: rxStatus,
          items: validMedicines,
          labs: validLabs,
          diagnosis: cleanDiagnosisText,
          notes: soap.plan || soap.assessment || ''
        });`;

const replace4 = `        const rxRes = await api.put(\`/prescriptions/\${editingPrescriptionId}\`, {
          appointmentId: resolvedAppId,
          patientId: patientId,
          doctorId: user.id,
          status: rxStatus,
          items: validMedicines,
          labs: validLabs,
          tests: validLabs,
          diagnosis: cleanDiagnosisText,
          notes: soap.plan || soap.assessment || ''
        });`;

if (!normContent.includes(norm(target4))) {
  console.error("Target 4 not found!");
  process.exit(1);
}
normContent = normContent.replace(norm(target4), norm(replace4));
console.log("Applied change 4 (PUT /prescriptions tests parameter)");

// 5. Timeline modal notes display
const target5 = `                            {/* Vitals Log */}
                            <div style={{ background: '#F8FAFC', border: '1px dashed #CBD5E1', padding: '10px 14px', borderRadius: '10px', fontSize: '11px', color: '#475569', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: '#EF4444' }}><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>
                              <span><b>Recorded Vitals:</b> {item.vitals}</span>
                            </div>`;

const replace5 = `                            {/* Vitals Log */}
                            <div style={{ background: '#F8FAFC', border: '1px dashed #CBD5E1', padding: '10px 14px', borderRadius: '10px', fontSize: '11px', color: '#475569', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: '#EF4444' }}><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>
                              <span><b>Recorded Vitals:</b> {item.vitals}</span>
                            </div>

                            {/* Prescription Notes */}
                            {item.notes && (
                              <div style={{ background: '#F8FAFC', border: '1px dashed #CBD5E1', padding: '10px 14px', borderRadius: '10px', fontSize: '11px', color: '#475569', marginBottom: '16px' }}>
                                <span style={{ fontWeight: 800, color: '#1E293B', display: 'block', marginBottom: '2px' }}>Prescription Notes / Patient Advice:</span>
                                <span style={{ whiteSpace: 'pre-wrap' }}>{item.notes.replace(/<[^>]*>?/gm, '')}</span>
                              </div>
                            )}`;

if (!normContent.includes(norm(target5))) {
  console.error("Target 5 not found!");
  process.exit(1);
}
normContent = normContent.replace(norm(target5), norm(replace5));
console.log("Applied change 5 (timeline notes card display)");

fs.writeFileSync(filePath, denorm(normContent, isCRLF), 'utf8');
console.log("DoctorDashboard.jsx updated successfully!");
