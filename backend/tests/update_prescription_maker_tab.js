const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../../frontend/src/pages/PrescriptionMakerTab.jsx');
let content = fs.readFileSync(filePath, 'utf8');

const isCRLF = content.includes('\r\n');
const norm = str => str.replace(/\r\n/g, '\n');
const denorm = (str, isCRLF) => isCRLF ? str.replace(/\n/g, '\r\n') : str;

let normContent = norm(content);

// ---- CHANGE 1: Replace the test suggestions overlay with hospital catalog ----
// Lines 2071-2104: showSuggestions && searchQuery.trim() → hospital catalogTests
const target1 = `                  {/* Test Suggestions Overlay */}
                  {showSuggestions && searchQuery.trim() && (
                    <div 
                      data-lenis-prevent
                      style={{
                        position: 'absolute',
                        top: '100%',
                        left: 0,
                        right: 0,
                        background: 'white',
                        border: '1px solid #E2E8F0',
                        borderRadius: '12px',
                        boxShadow: '0 8px 24px rgba(0,0,0,0.08)',
                        zIndex: 10,
                        marginTop: '6px',
                        maxHeight: '200px',
                        overflowY: 'auto',
                        padding: '6px'
                      }}
                    >
                      {availableTests
                        .filter(t => t.toLowerCase().includes(searchQuery.toLowerCase()))
                        .map(t => (
                          <div 
                            key={t}
                            onClick={() => handleAddLab(t)}
                            style={{ padding: '10px 14px', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: 650, color: '#334155', transition: '0.2s' }}
                            onMouseEnter={e => e.currentTarget.style.background = '#F1F5F9'}
                            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                          >
                            {t}
                          </div>
                        ))}
                    </div>
                  )}`;

const replace1 = `                  {/* Test Suggestions Overlay — Hospital Catalog */}
                  {showSuggestions && (
                    <div 
                      data-lenis-prevent
                      style={{
                        position: 'absolute',
                        top: '100%',
                        left: 0,
                        right: 0,
                        background: 'white',
                        border: '1px solid #E2E8F0',
                        borderRadius: '12px',
                        boxShadow: '0 8px 24px rgba(0,0,0,0.08)',
                        zIndex: 10,
                        marginTop: '6px',
                        maxHeight: '220px',
                        overflowY: 'auto',
                        padding: '6px'
                      }}
                    >
                      {isLoadingCatalogTests ? (
                        <div style={{ padding: '14px', textAlign: 'center', fontSize: '12px', color: '#64748B' }}>
                          Loading hospital catalog...
                        </div>
                      ) : catalogTests.length > 0 ? (
                        catalogTests.map(t => (
                          <div 
                            key={t._id || t.itemCode || (t.itemName || t.name)}
                            onClick={() => handleAddLab(t.itemName || t.name)}
                            style={{ padding: '10px 14px', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: 650, color: '#334155', transition: '0.2s', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                            onMouseEnter={e => e.currentTarget.style.background = '#F1F5F9'}
                            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                          >
                            <div>
                              <span style={{ fontWeight: 700, color: '#1E293B' }}>{t.itemName || t.name}</span>
                              {t.department && (
                                <span style={{ marginLeft: '8px', fontSize: '10.5px', color: '#64748B', background: '#F1F5F9', padding: '2px 6px', borderRadius: '4px' }}>
                                  {t.department}
                                </span>
                              )}
                            </div>
                            {t.itemCode && (
                              <span style={{ fontSize: '10px', color: '#94A3B8', fontFamily: 'monospace' }}>
                                {t.itemCode}
                              </span>
                            )}
                          </div>
                        ))
                      ) : (
                        <div style={{ padding: '14px', textAlign: 'center', background: '#FFFBEB', borderRadius: '8px', border: '1px solid #FDE68A' }}>
                          <p style={{ margin: 0, fontSize: '12px', fontWeight: 700, color: '#92400E' }}>
                            No matching test in this hospital's catalog.
                          </p>
                          <p style={{ margin: '4px 0 0', fontSize: '11px', color: '#B45309' }}>
                            You can recommend unlisted tests in <strong>Prescription Notes</strong> below.
                          </p>
                        </div>
                      )}
                    </div>
                  )}`;

if (!normContent.includes(norm(target1))) {
  console.error("Target 1 (test suggestions) not found!");
  // Dump context for debugging
  const idx = normContent.indexOf('Test Suggestions Overlay');
  if (idx >= 0) {
    console.log("Found 'Test Suggestions Overlay' at index:", idx);
    console.log("Context:", normContent.slice(idx, idx + 500));
  } else {
    console.log("Did not find 'Test Suggestions Overlay' in file");
  }
  process.exit(1);
}
normContent = normContent.replace(norm(target1), norm(replace1));
console.log("Applied change 1 (Test drawer hospital catalog suggestions)");

// ---- CHANGE 2: Replace medication drawer suggestions with hospital catalogMedicines ----
const target2Old = `                  {/* Suggestions List */}
                  {showMedSuggestions && medSearchQuery.trim() && (
                    <div 
                      data-lenis-prevent
                      style={{
                        position: 'absolute',
                        top: '100%',
                        left: 0,
                        right: 0,
                        background: 'white',
                        border: '1px solid #E2E8F0',
                        borderRadius: '10px',
                        boxShadow: '0 6px 20px rgba(0,0,0,0.06)',
                        zIndex: 10,
                        marginTop: '4px',
                        maxHeight: '180px',
                        overflowY: 'auto',
                        padding: '4px'
                      }}
                    >
                      {(() => {
                        const dbList = (pharmacyInventoryDb && pharmacyInventoryDb.length > 0 ? pharmacyInventoryDb : dbMedicines) || [];
                        const defaultKeys = Object.keys(medicineDefaults || {}).map(k => ({
                          name: k.charAt(0).toUpperCase() + k.slice(1),
                          qty: 100,
                          isDefault: true
                        }));
                        const merged = [...dbList];
                        defaultKeys.forEach(dk => {
                          if (!merged.some(m => m.name && m.name.toLowerCase() === dk.name.toLowerCase())) {
                            merged.push(dk);
                          }
                        });
                        return merged.filter(m => m.name && m.name.toLowerCase().includes(medSearchQuery.toLowerCase()));
                      })().map(m => (
                        <div 
                          key={m._id || m.id || m.name}
                          onClick={() => {
                            const nameLower = m.name.toLowerCase().trim();
                            const preset = medicineDefaults[nameLower] || {};
                            const newItem = {
                              id: Date.now() + Math.random(),
                              medicine: m.name,
                              dosage: preset.dose || '1 Tab',
                              frequency: preset.freq || 'Once a Day',
                              duration: preset.duration || '5 Days',
                              timing: preset.timing || 'After Food'
                            };
                            setLocalMedicines([...localMedicines, newItem]);
                            setMedSearchQuery('');
                            setShowMedSuggestions(false);
                          }}
                          style={{ padding: '8px 12px', borderRadius: '6px', cursor: 'pointer', fontSize: '13px', fontWeight: 650, color: '#334155', transition: '0.15s' }}
                          onMouseEnter={e => e.currentTarget.style.background = '#F1F5F9'}
                          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                        >
                          💊 {m.name} {m.isDefault ? (
                            <span style={{ color: '#2563EB', fontSize: '10px' }}>(Preset)</span>
                          ) : m.qty <= 0 ? (
                            <span style={{ color: '#EF4444', fontSize: '10px' }}>(Out of Stock)</span>
                          ) : (
                            <span style={{ color: '#16A34A', fontSize: '10px' }}>({m.qty} In Stock)</span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}`;

const replace2 = `                  {/* Suggestions List — Hospital Medicine Catalog */}
                  {showMedSuggestions && (
                    <div 
                      data-lenis-prevent
                      style={{
                        position: 'absolute',
                        top: '100%',
                        left: 0,
                        right: 0,
                        background: 'white',
                        border: '1px solid #E2E8F0',
                        borderRadius: '10px',
                        boxShadow: '0 6px 20px rgba(0,0,0,0.06)',
                        zIndex: 10,
                        marginTop: '4px',
                        maxHeight: '240px',
                        overflowY: 'auto',
                        padding: '6px'
                      }}
                    >
                      {isLoadingCatalogMeds ? (
                        <div style={{ padding: '14px', textAlign: 'center', fontSize: '12px', color: '#64748B' }}>
                          Loading hospital formulary...
                        </div>
                      ) : catalogMedicines.length > 0 ? (
                        catalogMedicines.map(m => (
                          <div 
                            key={m._id || m.itemCode || (m.itemName || m.name)}
                            onClick={() => {
                              const nameLower = (m.itemName || m.name || '').toLowerCase().trim();
                              const preset = medicineDefaults[nameLower] || {};
                              const newItem = {
                                id: Date.now() + Math.random(),
                                medicine: m.itemName || m.name,
                                dosage: m.dosage || preset.dose || '500 mg',
                                frequency: preset.freq || 'Once a Day',
                                duration: preset.duration || '5 Days',
                                timing: preset.timing || 'After Food',
                                itemCode: m.itemCode || '',
                                masterItemId: m._id || null,
                                genericName: m.genericName || ''
                              };
                              setLocalMedicines([...localMedicines, newItem]);
                              setMedSearchQuery('');
                              setShowMedSuggestions(false);
                            }}
                            style={{ padding: '8px 12px', borderRadius: '6px', cursor: 'pointer', fontSize: '13px', color: '#334155', transition: '0.15s', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                            onMouseEnter={e => e.currentTarget.style.background = '#F1F5F9'}
                            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                          >
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <span>💊</span>
                                <span style={{ fontWeight: 700, color: '#0F172A' }}>{m.itemName || m.name}</span>
                                {m.genericName && m.genericName !== (m.itemName || m.name) && (
                                  <span style={{ fontSize: '11px', color: '#64748B', fontWeight: 500 }}>({m.genericName})</span>
                                )}
                              </div>
                              <div style={{ fontSize: '10px', color: '#94A3B8', paddingLeft: '20px' }}>
                                {m.itemCode && <span>Code: {m.itemCode}</span>}
                                {m.dosage && <span> · {m.dosage}</span>}
                              </div>
                            </div>
                            <span style={{ fontSize: '10px', fontWeight: 800, color: '#2563EB', background: '#EFF6FF', padding: '2px 6px', borderRadius: '4px', border: '1px solid #BFDBFE', flexShrink: 0 }}>
                              Formulary
                            </span>
                          </div>
                        ))
                      ) : (
                        <div style={{ padding: '14px', textAlign: 'center', background: '#FFFBEB', borderRadius: '8px', border: '1px solid #FDE68A' }}>
                          <p style={{ margin: 0, fontSize: '12.5px', fontWeight: 700, color: '#92400E' }}>
                            No matching medicine in this hospital's catalog.
                          </p>
                          <p style={{ margin: '4px 0 0', fontSize: '11px', color: '#B45309', lineHeight: '1.4' }}>
                            Prescribe unlisted medications in <strong>Prescription Notes</strong> below.
                          </p>
                        </div>
                      )}
                    </div>
                  )}`;

if (!normContent.includes(norm(target2Old))) {
  console.error("Target 2 (medication suggestions) not found!");
  const idx = normContent.indexOf('Suggestions List');
  if (idx >= 0) {
    console.log("Found 'Suggestions List' at index:", idx);
    console.log("Context:", normContent.slice(idx, idx + 800));
  } else {
    console.log("Did not find 'Suggestions List' in file");
  }
  process.exit(1);
}
normContent = normContent.replace(norm(target2Old), norm(replace2));
console.log("Applied change 2 (Medication drawer hospital catalog suggestions)");

// ---- CHANGE 3: Add canonical metadata when adding to prescription in drawer ----
const target3 = `                  localMedicines.forEach(med => {
                    addMedicineRow({
                      name: med.medicine,
                      dose: med.dosage,
                      freq: med.frequency,
                      duration: med.duration,
                      timing: med.timing
                    });
                  });`;

const replace3 = `                  localMedicines.forEach(med => {
                    addMedicineRow({
                      name: med.medicine,
                      dose: med.dosage,
                      freq: med.frequency,
                      duration: med.duration,
                      timing: med.timing,
                      itemCode: med.itemCode || '',
                      masterItemId: med.masterItemId || null,
                      genericName: med.genericName || ''
                    });
                  });`;

if (!normContent.includes(norm(target3))) {
  console.error("Target 3 (addMedicineRow call) not found!");
  process.exit(1);
}
normContent = normContent.replace(norm(target3), norm(replace3));
console.log("Applied change 3 (Add All to Prescription canonical metadata)");

// ---- CHANGE 4: Update Notes section subtitle and placeholder ----
const target4 = `            <span style={{ fontSize: '11.5px', fontWeight: 800, color: '#0F172A', letterSpacing: '0.05em' }}>NOTES & INSTRUCTIONS FOR PATIENT</span>
                <span style={{ fontSize: '10px', fontWeight: 700, color: '#64748B', background: '#F1F5F9', border: '1px solid #E2E8F0', padding: '2px 7px', borderRadius: '12px' }}>Optional</span>`;

const replace4 = `            <span style={{ fontSize: '11.5px', fontWeight: 800, color: '#0F172A', letterSpacing: '0.05em' }}>PRESCRIPTION NOTES & PATIENT ADVICE</span>
                <span style={{ fontSize: '10px', fontWeight: 700, color: '#2563EB', background: '#EFF6FF', border: '1px solid #BFDBFE', padding: '2px 7px', borderRadius: '12px' }}>Persistent Record</span>`;

if (!normContent.includes(norm(target4))) {
  console.error("Target 4 (notes header) not found!");
  process.exit(1);
}
normContent = normContent.replace(norm(target4), norm(replace4));
console.log("Applied change 4 (Notes section title and badge)");

// ---- CHANGE 5: Update Notes placeholder text ----
const target5 = `                  placeholder="Type patient instructions & advice here (use toolbar for bold, italic, highlight, and bullet points)..."`;

const replace5 = `                  placeholder="Type patient instructions, clinical advice, or prescribe/recommend medicines & tests NOT in hospital catalog (e.g. Tab. XYZ 500mg OD for 5 days)..."`;

if (!normContent.includes(norm(target5))) {
  console.error("Target 5 (notes placeholder) not found!");
  process.exit(1);
}
normContent = normContent.replace(norm(target5), norm(replace5));
console.log("Applied change 5 (Notes placeholder text)");

fs.writeFileSync(filePath, denorm(normContent, isCRLF), 'utf8');
console.log("PrescriptionMakerTab.jsx updated successfully!");
