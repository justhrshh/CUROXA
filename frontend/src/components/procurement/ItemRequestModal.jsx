import React, { useState, useEffect } from 'react';
import api from '../../utils/api';

const ITEM_TYPES = ['Medicine', 'Consumable', 'Reagent', 'Asset', 'Non-Consumable'];
const DOSAGE_FORMS = ['Tablet', 'Capsule', 'Syrup', 'Suspension', 'Injection', 'Cream', 'Ointment', 'Drops', 'Inhaler', 'Patch', 'Gel', 'Powder', 'Lotion', 'Solution'];
const ROUTES = ['Oral', 'IV', 'IM', 'SC', 'Topical', 'Inhalation', 'Sublingual', 'Rectal', 'Nasal', 'Ophthalmic'];
const SCHEDULES = ['', 'Schedule H', 'Schedule H1', 'Schedule X', 'Schedule G', 'OTC', 'Schedule C', 'Schedule C1'];
const CATEGORIES = ['Drugs', 'Surgical', 'Consumable', 'General Store', 'Equipment', 'Laboratory', 'Diagnostics', 'Other'];
const DEPARTMENTS = ['Pharmacy', 'OT', 'General', 'ICU', 'Laboratory', 'Emergency', 'Central Store'];
const STRENGTH_UNITS = ['mg', 'g', 'mcg', 'mL', 'IU', 'mg/mL', '%', 'units'];
const STERILITY_OPTIONS = ['', 'Sterile', 'Non-Sterile'];
const DISPOSAL_OPTIONS = ['', 'Disposable (Single Use)', 'Reusable'];
const MAINTENANCE_CYCLES = ['', 'Quarterly', 'Semi-Annual', 'Annual', 'Bi-Annual', 'As Needed'];
const TEMPERATURE_OPTIONS = ['Room Temperature', '2-8°C (Cold Chain)', 'Deep Freeze (< -20°C)', 'Cool (< 25°C)'];

// Contextual packaging units based on item type
const PACKAGING_OPTIONS = {
  Medicine: {
    purchase: ['Box', 'Strip', 'Bottle', 'Vial', 'Ampoule', 'Tube', 'Sachet', 'Pack'],
    consumption: ['Tablet', 'Capsule', 'Bottle', 'Vial', 'Ampoule', 'Tube', 'Sachet', 'Dose', 'Unit']
  },
  Consumable: {
    purchase: ['Box', 'Pack', 'Carton', 'Case', 'Roll', 'Bag', 'Piece'],
    consumption: ['Mask', 'Bandage', 'Syringe', 'Piece', 'Pair', 'Roll', 'Unit']
  },
  Reagent: {
    purchase: ['Kit', 'Bottle', 'Pack', 'Vial', 'Carton'],
    consumption: ['Test', 'Reaction', 'Vial', 'Bottle', 'Unit']
  },
  Asset: {
    purchase: ['Piece', 'Unit', 'Set'],
    consumption: ['Piece', 'Unit', 'Set']
  },
  'Non-Consumable': {
    purchase: ['Piece', 'Unit', 'Set', 'Box'],
    consumption: ['Piece', 'Unit', 'Set']
  }
};

export default function ItemRequestModal({ isOpen, onClose, onSuccess, showToast }) {
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState({});

  const [formData, setFormData] = useState({
    itemType: 'Medicine',
    genericName: '',
    brandName: '',
    manufacturer: '',
    categoryType: 'Drugs',
    departmentType: 'Pharmacy',
    hsnCode: '',
    itemDescription: '',
    // Medicine-specific
    composition: '',
    strength: '',
    strengthUnit: 'mg',
    dosageForm: 'Tablet',
    routeOfAdministration: 'Oral',
    scheduleClassification: '',
    // Consumable-specific
    material: '',
    sizeDimensions: '',
    sterility: '',
    disposalType: '',
    // Reagent-specific
    machineCompatibility: '',
    catalogNo: '',
    testPackVolume: '',
    // Asset-specific
    makeModelNo: '',
    itemSpecification: '',
    warrantyMonths: 0,
    maintenanceCycle: '',
    // Packaging
    purchasedUnit: 'Box',
    consumptionUnit: 'Tablet',
    converterFactor: 100,
    packSizeDescription: '10 Strips × 10 Tablets (100 Tablets / Box)',
    // Misc
    defaultGst: 12,
    storageTemperature: 'Room Temperature',
    isExpirable: true,
    reason: ''
  });

  // Switch default units when itemType changes
  const handleItemTypeChange = (newType) => {
    const units = PACKAGING_OPTIONS[newType] || PACKAGING_OPTIONS.Medicine;
    const defaultP = units.purchase[0] || 'Box';
    const defaultC = units.consumption[0] || 'Unit';
    const isSingleUnit = newType === 'Asset' || newType === 'Non-Consumable';
    const factor = isSingleUnit ? 1 : (newType === 'Medicine' ? 100 : 50);

    setFormData(prev => ({
      ...prev,
      itemType: newType,
      categoryType: newType === 'Medicine' ? 'Drugs' : newType === 'Consumable' ? 'Consumable' : newType === 'Reagent' ? 'Laboratory' : 'Equipment',
      departmentType: newType === 'Medicine' ? 'Pharmacy' : newType === 'Reagent' ? 'Laboratory' : 'General',
      purchasedUnit: defaultP,
      consumptionUnit: defaultC,
      converterFactor: factor,
      packSizeDescription: factor > 1 ? `1 ${defaultP} = ${factor} ${defaultC}s` : `${defaultP} — sold as individual unit`,
      isExpirable: newType !== 'Asset' && newType !== 'Non-Consumable'
    }));
  };

  // Auto-handle Bottle unit rule (Bottles are dispensed as whole units)
  useEffect(() => {
    if (formData.purchasedUnit === 'Bottle') {
      setFormData(prev => ({
        ...prev,
        consumptionUnit: 'Bottle',
        converterFactor: 1,
        packSizeDescription: '1 Bottle — sold as individual unit'
      }));
    }
  }, [formData.purchasedUnit]);

  if (!isOpen) return null;

  const handleChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    if (errors[field]) setErrors(prev => { const e = { ...prev }; delete e[field]; return e; });
  };

  const validate = () => {
    const e = {};
    if (!formData.genericName.trim()) e.genericName = 'Generic Name is required';
    if (!formData.manufacturer.trim()) e.manufacturer = 'Manufacturer is required';
    if (!formData.categoryType) e.categoryType = 'Category is required';
    if (!formData.reason.trim()) e.reason = 'Please provide a clinical or inventory justification';

    const pUnit = (formData.purchasedUnit || '').trim().toLowerCase();
    const cUnit = (formData.consumptionUnit || '').trim().toLowerCase();
    const factor = Number(formData.converterFactor) || 1;

    if (factor > 1 && pUnit === cUnit) {
      e.converterFactor = 'Purchased unit and consumption unit cannot be identical when factor is greater than 1.';
    }
    return e;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length > 0) { setErrors(errs); return; }

    setSaving(true);
    try {
      const proposedItem = {
        genericName: formData.genericName.trim(),
        brandName: formData.brandName.trim(),
        manufacturer: formData.manufacturer.trim(),
        itemType: formData.itemType,
        categoryType: formData.categoryType,
        departmentType: formData.departmentType,
        hsnCode: formData.hsnCode,
        itemDescription: formData.itemDescription,
        purchasedUnit: formData.purchasedUnit,
        consumptionUnit: formData.consumptionUnit,
        converterFactor: Number(formData.converterFactor) || 1,
        packSizeDescription: formData.packSizeDescription,
        defaultGst: Number(formData.defaultGst) || 12,
        storageTemperature: formData.storageTemperature,
        isExpirable: formData.isExpirable,
        // Category-specific payloads
        ...(formData.itemType === 'Medicine' && {
          composition: formData.composition,
          strength: formData.strength,
          strengthUnit: formData.strengthUnit,
          dosageForm: formData.dosageForm,
          routeOfAdministration: formData.routeOfAdministration,
          scheduleClassification: formData.scheduleClassification
        }),
        ...(formData.itemType === 'Consumable' && {
          material: formData.material,
          sizeDimensions: formData.sizeDimensions,
          sterility: formData.sterility,
          disposalType: formData.disposalType
        }),
        ...(formData.itemType === 'Reagent' && {
          machineCompatibility: formData.machineCompatibility,
          catalogNo: formData.catalogNo,
          testPackVolume: formData.testPackVolume
        }),
        ...(formData.itemType === 'Asset' && {
          makeModelNo: formData.makeModelNo,
          itemSpecification: formData.itemSpecification,
          warrantyMonths: Number(formData.warrantyMonths) || 0,
          maintenanceCycle: formData.maintenanceCycle
        }),
        ...(formData.itemType === 'Non-Consumable' && {
          material: formData.material,
          sizeDimensions: formData.sizeDimensions,
          itemSpecification: formData.itemSpecification
        })
      };

      await api.post('/item-requests', { proposedItem, reason: formData.reason.trim() });
      if (onSuccess) onSuccess();
    } catch (err) {
      const msg = err.response?.data?.error || 'Failed to submit request';
      if (showToast) showToast(msg, 'error');
    } finally {
      setSaving(false);
    }
  };

  const activeUnits = PACKAGING_OPTIONS[formData.itemType] || PACKAGING_OPTIONS.Medicine;

  const fieldStyle = { width: '100%', padding: '8px 12px', border: '1px solid #CBD5E1', borderRadius: '8px', fontSize: '13px', color: '#0F172A', outline: 'none', boxSizing: 'border-box' };
  const errorStyle = { fontSize: '11px', color: '#DC2626', marginTop: '3px' };
  const labelStyle = { display: 'block', fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '5px' };
  const rowStyle = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' };
  const sectionStyle = { borderTop: '1px solid #E2E8F0', paddingTop: '16px', marginTop: '4px' };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.65)', backdropFilter: 'blur(6px)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
      <div style={{ background: '#FFFFFF', borderRadius: '16px', width: '100%', maxWidth: '720px', maxHeight: '92vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
        
        {/* HEADER */}
        <div style={{ padding: '20px 24px 16px', borderBottom: '1.5px solid #F1F5F9', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 800, color: '#0F172A' }}>📋 Request New Item</h2>
            <p style={{ margin: '4px 0 0', fontSize: '12.5px', color: '#64748B' }}>
              Submit proposal to <strong>Global Item Master</strong> · Centrally reviewed by Super Admin
            </p>
          </div>
          <button onClick={onClose} style={{ background: '#F1F5F9', border: 'none', borderRadius: '50%', width: '32px', height: '32px', fontSize: '16px', cursor: 'pointer', color: '#64748B' }}>✕</button>
        </div>

        {/* FORM */}
        <form onSubmit={handleSubmit} style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: '18px' }}>
          
          {/* ITEM TYPE SELECTOR */}
          <div>
            <label style={labelStyle}>Item Category / Type *</label>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {ITEM_TYPES.map(t => (
                <button
                  key={t}
                  type="button"
                  onClick={() => handleItemTypeChange(t)}
                  style={{
                    padding: '7px 16px',
                    borderRadius: '20px',
                    fontSize: '12.5px',
                    fontWeight: 700,
                    cursor: 'pointer',
                    background: formData.itemType === t ? '#2563EB' : '#F1F5F9',
                    color: formData.itemType === t ? '#fff' : '#334155',
                    border: formData.itemType === t ? '2px solid #2563EB' : '2px solid #E2E8F0',
                    transition: 'all 0.15s ease'
                  }}
                >
                  {t === 'Medicine' && '💊 '}
                  {t === 'Consumable' && '🧤 '}
                  {t === 'Reagent' && '🧪 '}
                  {t === 'Asset' && '🏥 '}
                  {t === 'Non-Consumable' && '📦 '}
                  {t}
                </button>
              ))}
            </div>
          </div>

          {/* PRIMARY IDENTIFIERS */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div style={rowStyle}>
              <div>
                <label style={labelStyle}>Generic / Official Name *</label>
                <input
                  style={{ ...fieldStyle, borderColor: errors.genericName ? '#DC2626' : '#CBD5E1' }}
                  value={formData.genericName}
                  onChange={e => handleChange('genericName', e.target.value)}
                  placeholder={formData.itemType === 'Medicine' ? 'e.g. Paracetamol' : formData.itemType === 'Consumable' ? 'e.g. Surgical Examination Gloves' : 'e.g. Hematology Cell Pack Diluent'}
                />
                {errors.genericName && <div style={errorStyle}>{errors.genericName}</div>}
              </div>
              <div>
                <label style={labelStyle}>Brand / Trade Name</label>
                <input
                  style={fieldStyle}
                  value={formData.brandName}
                  onChange={e => handleChange('brandName', e.target.value)}
                  placeholder={formData.itemType === 'Medicine' ? 'e.g. Dolo 650' : 'e.g. Kimberly-Clark Purple Nitrile'}
                />
              </div>
            </div>

            <div style={rowStyle}>
              <div>
                <label style={labelStyle}>Manufacturer *</label>
                <input
                  style={{ ...fieldStyle, borderColor: errors.manufacturer ? '#DC2626' : '#CBD5E1' }}
                  value={formData.manufacturer}
                  onChange={e => handleChange('manufacturer', e.target.value)}
                  placeholder="e.g. GSK, Micro Labs, Abbott, BD"
                />
                {errors.manufacturer && <div style={errorStyle}>{errors.manufacturer}</div>}
              </div>
              <div>
                <label style={labelStyle}>HSN Code</label>
                <input
                  style={fieldStyle}
                  value={formData.hsnCode}
                  onChange={e => handleChange('hsnCode', e.target.value)}
                  placeholder="e.g. 3004 / 9018"
                />
              </div>
            </div>

            <div style={rowStyle}>
              <div>
                <label style={labelStyle}>Category *</label>
                <select
                  style={{ ...fieldStyle, borderColor: errors.categoryType ? '#DC2626' : '#CBD5E1' }}
                  value={formData.categoryType}
                  onChange={e => handleChange('categoryType', e.target.value)}
                >
                  {CATEGORIES.map(c => <option key={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label style={labelStyle}>Department</label>
                <select
                  style={fieldStyle}
                  value={formData.departmentType}
                  onChange={e => handleChange('departmentType', e.target.value)}
                >
                  {DEPARTMENTS.map(d => <option key={d}>{d}</option>)}
                </select>
              </div>
            </div>
          </div>

          {/* DYNAMIC CATEGORY-SPECIFIC SECTIONS */}
          
          {/* 1. MEDICINE SPECIFIC */}
          {formData.itemType === 'Medicine' && (
            <div style={{ ...sectionStyle, display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div style={{ fontSize: '12.5px', fontWeight: 800, color: '#5B21B6' }}>💊 Clinical Medicine Parameters</div>
              <div>
                <label style={labelStyle}>Active Composition / Formulation</label>
                <input
                  style={fieldStyle}
                  value={formData.composition}
                  onChange={e => handleChange('composition', e.target.value)}
                  placeholder="e.g. Paracetamol IP 650mg + Caffeine 50mg"
                />
              </div>
              <div style={rowStyle}>
                <div>
                  <label style={labelStyle}>Strength & Unit</label>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <input
                      style={{ ...fieldStyle, flex: 1 }}
                      value={formData.strength}
                      onChange={e => handleChange('strength', e.target.value)}
                      placeholder="650"
                    />
                    <select
                      style={{ ...fieldStyle, width: '90px' }}
                      value={formData.strengthUnit}
                      onChange={e => handleChange('strengthUnit', e.target.value)}
                    >
                      {STRENGTH_UNITS.map(u => <option key={u}>{u}</option>)}
                    </select>
                  </div>
                </div>
                <div>
                  <label style={labelStyle}>Dosage Form</label>
                  <select
                    style={fieldStyle}
                    value={formData.dosageForm}
                    onChange={e => handleChange('dosageForm', e.target.value)}
                  >
                    {DOSAGE_FORMS.map(f => <option key={f}>{f}</option>)}
                  </select>
                </div>
              </div>
              <div style={rowStyle}>
                <div>
                  <label style={labelStyle}>Route of Administration</label>
                  <select
                    style={fieldStyle}
                    value={formData.routeOfAdministration}
                    onChange={e => handleChange('routeOfAdministration', e.target.value)}
                  >
                    {ROUTES.map(r => <option key={r}>{r}</option>)}
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>Schedule Classification</label>
                  <select
                    style={fieldStyle}
                    value={formData.scheduleClassification}
                    onChange={e => handleChange('scheduleClassification', e.target.value)}
                  >
                    {SCHEDULES.map(s => <option key={s} value={s}>{s || '— None (OTC) —'}</option>)}
                  </select>
                </div>
              </div>
            </div>
          )}

          {/* 2. CONSUMABLE SPECIFIC */}
          {formData.itemType === 'Consumable' && (
            <div style={{ ...sectionStyle, display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div style={{ fontSize: '12.5px', fontWeight: 800, color: '#B45309' }}>🧤 Consumable Specifications</div>
              <div style={rowStyle}>
                <div>
                  <label style={labelStyle}>Material / Construction</label>
                  <input
                    style={fieldStyle}
                    value={formData.material}
                    onChange={e => handleChange('material', e.target.value)}
                    placeholder="e.g. Powder-free Nitrile, Cotton Gauze, PVC"
                  />
                </div>
                <div>
                  <label style={labelStyle}>Size / Dimensions / Gauge</label>
                  <input
                    style={fieldStyle}
                    value={formData.sizeDimensions}
                    onChange={e => handleChange('sizeDimensions', e.target.value)}
                    placeholder="e.g. Medium (7.5), 10cm × 10cm, 22G × 1.25 inch"
                  />
                </div>
              </div>
              <div style={rowStyle}>
                <div>
                  <label style={labelStyle}>Sterility Requirement</label>
                  <select
                    style={fieldStyle}
                    value={formData.sterility}
                    onChange={e => handleChange('sterility', e.target.value)}
                  >
                    {STERILITY_OPTIONS.map(s => <option key={s} value={s}>{s || '— Not Specified —'}</option>)}
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>Disposal Classification</label>
                  <select
                    style={fieldStyle}
                    value={formData.disposalType}
                    onChange={e => handleChange('disposalType', e.target.value)}
                  >
                    {DISPOSAL_OPTIONS.map(d => <option key={d} value={d}>{d || '— Not Specified —'}</option>)}
                  </select>
                </div>
              </div>
            </div>
          )}

          {/* 3. REAGENT SPECIFIC */}
          {formData.itemType === 'Reagent' && (
            <div style={{ ...sectionStyle, display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div style={{ fontSize: '12.5px', fontWeight: 800, color: '#0369A1' }}>🧪 Diagnostic & Laboratory Reagent Parameters</div>
              <div style={rowStyle}>
                <div>
                  <label style={labelStyle}>Compatible Analyzer / Machine</label>
                  <input
                    style={fieldStyle}
                    value={formData.machineCompatibility}
                    onChange={e => handleChange('machineCompatibility', e.target.value)}
                    placeholder="e.g. Roche Cobas c311, Sysmex XN-550"
                  />
                </div>
                <div>
                  <label style={labelStyle}>Catalog / Assay Number</label>
                  <input
                    style={fieldStyle}
                    value={formData.catalogNo}
                    onChange={e => handleChange('catalogNo', e.target.value)}
                    placeholder="e.g. 04404483190"
                  />
                </div>
              </div>
              <div style={rowStyle}>
                <div>
                  <label style={labelStyle}>Test Pack Volume / Reactions Count</label>
                  <input
                    style={fieldStyle}
                    value={formData.testPackVolume}
                    onChange={e => handleChange('testPackVolume', e.target.value)}
                    placeholder="e.g. 200 Tests / Kit, 500 mL"
                  />
                </div>
                <div>
                  <label style={labelStyle}>Storage Temperature</label>
                  <select
                    style={fieldStyle}
                    value={formData.storageTemperature}
                    onChange={e => handleChange('storageTemperature', e.target.value)}
                  >
                    {TEMPERATURE_OPTIONS.map(t => <option key={t}>{t}</option>)}
                  </select>
                </div>
              </div>
            </div>
          )}

          {/* 4. ASSET SPECIFIC */}
          {formData.itemType === 'Asset' && (
            <div style={{ ...sectionStyle, display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div style={{ fontSize: '12.5px', fontWeight: 800, color: '#475569' }}>🏥 Hospital Equipment / Asset Specifications</div>
              <div style={rowStyle}>
                <div>
                  <label style={labelStyle}>Make & Model No</label>
                  <input
                    style={fieldStyle}
                    value={formData.makeModelNo}
                    onChange={e => handleChange('makeModelNo', e.target.value)}
                    placeholder="e.g. Mindray uMEC10 / Philips IntelliVue"
                  />
                </div>
                <div>
                  <label style={labelStyle}>Technical Specification</label>
                  <input
                    style={fieldStyle}
                    value={formData.itemSpecification}
                    onChange={e => handleChange('itemSpecification', e.target.value)}
                    placeholder="e.g. 5-lead ECG, SpO2, NIBP, 10.4 inch TFT"
                  />
                </div>
              </div>
              <div style={rowStyle}>
                <div>
                  <label style={labelStyle}>Warranty Period (Months)</label>
                  <input
                    type="number"
                    min="0"
                    style={fieldStyle}
                    value={formData.warrantyMonths}
                    onChange={e => handleChange('warrantyMonths', e.target.value)}
                    placeholder="24"
                  />
                </div>
                <div>
                  <label style={labelStyle}>Maintenance / Calibration Cycle</label>
                  <select
                    style={fieldStyle}
                    value={formData.maintenanceCycle}
                    onChange={e => handleChange('maintenanceCycle', e.target.value)}
                  >
                    {MAINTENANCE_CYCLES.map(m => <option key={m} value={m}>{m || '— None / As Needed —'}</option>)}
                  </select>
                </div>
              </div>
            </div>
          )}

          {/* 5. NON-CONSUMABLE SPECIFIC */}
          {formData.itemType === 'Non-Consumable' && (
            <div style={{ ...sectionStyle, display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div style={{ fontSize: '12.5px', fontWeight: 800, color: '#334155' }}>📦 Non-Consumable Specifications</div>
              <div style={rowStyle}>
                <div>
                  <label style={labelStyle}>Material / Grade</label>
                  <input
                    style={fieldStyle}
                    value={formData.material}
                    onChange={e => handleChange('material', e.target.value)}
                    placeholder="e.g. Medical Grade Stainless Steel 316L"
                  />
                </div>
                <div>
                  <label style={labelStyle}>Specification / Dimensions</label>
                  <input
                    style={fieldStyle}
                    value={formData.itemSpecification}
                    onChange={e => handleChange('itemSpecification', e.target.value)}
                    placeholder="e.g. Kidney Dish 10 inch, Autoclavable"
                  />
                </div>
              </div>
            </div>
          )}

          {/* STANDARDIZED PACKAGING */}
          <div style={{ ...sectionStyle, display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div style={{ fontSize: '12.5px', fontWeight: 800, color: '#166534' }}>📦 Proposed Standard Packaging</div>
            
            {formData.purchasedUnit === 'Bottle' && (
              <div style={{ background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: '8px', padding: '8px 12px', fontSize: '12px', color: '#1E40AF' }}>
                ℹ️ <strong>Bottle Standard:</strong> Bottles are stored, dispensed, and counted as whole bottles. Converter factor is 1 (no liquid mL breakdown).
              </div>
            )}

            <div style={rowStyle}>
              <div>
                <label style={labelStyle}>Purchased Unit *</label>
                <select
                  style={fieldStyle}
                  value={formData.purchasedUnit}
                  onChange={e => handleChange('purchasedUnit', e.target.value)}
                >
                  {activeUnits.purchase.map(u => <option key={u}>{u}</option>)}
                </select>
              </div>
              <div>
                <label style={labelStyle}>Consumption / Dispensing Unit *</label>
                <select
                  style={fieldStyle}
                  value={formData.consumptionUnit}
                  onChange={e => handleChange('consumptionUnit', e.target.value)}
                  disabled={formData.purchasedUnit === 'Bottle'}
                >
                  {activeUnits.consumption.map(u => <option key={u}>{u}</option>)}
                </select>
              </div>
            </div>

            <div style={rowStyle}>
              <div>
                <label style={labelStyle}>Converter Factor (1 {formData.purchasedUnit} = ? {formData.consumptionUnit}s)</label>
                <input
                  type="number"
                  min="1"
                  style={{ ...fieldStyle, borderColor: errors.converterFactor ? '#DC2626' : '#CBD5E1' }}
                  value={formData.converterFactor}
                  onChange={e => {
                    const f = Number(e.target.value) || 1;
                    handleChange('converterFactor', f);
                    if (f > 1 && formData.purchasedUnit !== formData.consumptionUnit) {
                      handleChange('packSizeDescription', `1 ${formData.purchasedUnit} = ${f} ${formData.consumptionUnit}s`);
                    }
                  }}
                  disabled={formData.purchasedUnit === 'Bottle'}
                />
                {errors.converterFactor && <div style={errorStyle}>{errors.converterFactor}</div>}
              </div>
              <div>
                <label style={labelStyle}>Pack Size Description</label>
                <input
                  style={fieldStyle}
                  value={formData.packSizeDescription}
                  onChange={e => handleChange('packSizeDescription', e.target.value)}
                  placeholder={`e.g. 10 Strips × 10 Tablets`}
                />
              </div>
            </div>
          </div>

          {/* CLINICAL JUSTIFICATION */}
          <div style={sectionStyle}>
            <label style={{ ...labelStyle, color: '#C2410C' }}>Clinical / Departmental Justification *</label>
            <textarea
              style={{ ...fieldStyle, height: '80px', resize: 'vertical', borderColor: errors.reason ? '#DC2626' : '#CBD5E1' }}
              value={formData.reason}
              onChange={e => handleChange('reason', e.target.value)}
              placeholder="Why does your hospital require this item in the Global Catalog? Include clinical indications, patient demand, or doctor request details..."
            />
            {errors.reason && <div style={errorStyle}>{errors.reason}</div>}
          </div>

          {/* ACTIONS */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', paddingTop: '6px' }}>
            <button
              type="button"
              onClick={onClose}
              style={{ padding: '9px 20px', background: '#F1F5F9', border: '1px solid #CBD5E1', borderRadius: '8px', fontWeight: 700, fontSize: '13px', cursor: 'pointer', color: '#334155' }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              style={{
                padding: '9px 24px',
                background: saving ? '#93C5FD' : '#2563EB',
                color: '#fff',
                border: 'none',
                borderRadius: '8px',
                fontWeight: 700,
                fontSize: '13px',
                cursor: saving ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}
            >
              {saving ? 'Submitting Request...' : '📋 Submit to Global Catalog'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
