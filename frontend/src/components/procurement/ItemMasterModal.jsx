import React, { useState, useEffect } from 'react';
import api from '../../utils/api';

const CATEGORIES = ['Drugs', 'Surgical', 'Consumable', 'General Store', 'Equipment'];
const DEPARTMENTS = ['Pharmacy', 'OT', 'General', 'ICU', 'Laboratory', 'Emergency'];
const ITEM_TYPES = ['Consumable', 'Non-Consumable', 'Fixed Asset'];
const TEMPERATURES = ['Normal (15°C - 25°C)', 'Cool (8°C - 15°C)', 'Cold / Refrigerated (2°C - 8°C)', 'Frozen (< -10°C)'];
const PURCHASE_UNITS = ['Box', 'Strip', 'Bottle', 'Carton', 'Vial', 'Ampoule', 'Kit', 'Pack', 'Tube'];
const CONSUMPTION_UNITS = ['Tablet', 'Capsule', 'Strip', 'Bottle', 'Vial', 'Ampoule', 'ml', 'Pcs', 'Unit'];

export default function ItemMasterModal({ isOpen, onClose, onSaveSuccess, editingItem = null, showToast }) {
  const [formData, setFormData] = useState({
    genericName: '',
    brandName: '',
    categoryType: 'Drugs',
    departmentType: 'Pharmacy',
    itemType: 'Consumable',
    hsnCode: '',
    defaultGst: 12,
    storageTemperature: 'Normal (15°C - 25°C)',
    itemSpecification: '',
    makeModelNo: '',
    barcodeOption: false,
    isExpirable: true,
    expiryCutoffDays: 60,
    inventoryRule: 'FEFO',
    manufacturer: '',
    purchasedUnit: 'Box',
    converterFactor: 100,
    packSizeDescription: '10x10 Tablets',
    consumptionUnit: 'Tablet',
    issueMultiplier: 1,
    status: 'Active'
  });

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (editingItem) {
      setFormData({
        genericName: editingItem.genericName || '',
        brandName: editingItem.brandName || '',
        categoryType: editingItem.categoryType || 'Drugs',
        departmentType: editingItem.departmentType || 'Pharmacy',
        itemType: editingItem.itemType || 'Consumable',
        hsnCode: editingItem.hsnCode || '',
        defaultGst: editingItem.defaultGst !== undefined ? editingItem.defaultGst : 12,
        storageTemperature: editingItem.storageTemperature || 'Normal (15°C - 25°C)',
        itemSpecification: editingItem.itemSpecification || '',
        makeModelNo: editingItem.makeModelNo || '',
        barcodeOption: !!editingItem.barcodeOption,
        isExpirable: editingItem.isExpirable !== undefined ? editingItem.isExpirable : true,
        expiryCutoffDays: editingItem.expiryCutoffDays || 60,
        inventoryRule: editingItem.inventoryRule || 'FEFO',
        manufacturer: editingItem.manufacturer || '',
        purchasedUnit: editingItem.purchasedUnit || 'Box',
        converterFactor: editingItem.converterFactor || 1,
        packSizeDescription: editingItem.packSizeDescription || '',
        consumptionUnit: editingItem.consumptionUnit || 'Unit',
        issueMultiplier: editingItem.issueMultiplier || 1,
        status: editingItem.status || 'Active'
      });
    } else {
      setFormData({
        genericName: '',
        brandName: '',
        categoryType: 'Drugs',
        departmentType: 'Pharmacy',
        itemType: 'Consumable',
        hsnCode: '',
        defaultGst: 12,
        storageTemperature: 'Normal (15°C - 25°C)',
        itemSpecification: '',
        makeModelNo: '',
        barcodeOption: false,
        isExpirable: true,
        expiryCutoffDays: 60,
        inventoryRule: 'FEFO',
        manufacturer: '',
        purchasedUnit: 'Box',
        converterFactor: 100,
        packSizeDescription: '10x10 Tablets',
        consumptionUnit: 'Tablet',
        issueMultiplier: 1,
        status: 'Active'
      });
    }
    setError('');
  }, [editingItem, isOpen]);

  if (!isOpen) return null;

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.genericName.trim()) {
      setError('Generic / Chemical name is required.');
      return;
    }
    if (Number(formData.converterFactor) <= 0) {
      setError('Conversion factor must be greater than zero.');
      return;
    }

    try {
      setSaving(true);
      setError('');

      const payload = {
        ...formData,
        converterFactor: Number(formData.converterFactor),
        defaultGst: Number(formData.defaultGst),
        expiryCutoffDays: Number(formData.expiryCutoffDays) || 0,
        issueMultiplier: Number(formData.issueMultiplier) || 1
      };

      if (editingItem && editingItem._id) {
        await api.put(`/item-master/${editingItem._id}`, payload);
        if (showToast) showToast('Item Master updated successfully', 'success');
      } else {
        await api.post('/item-master', payload);
        if (showToast) showToast('Item Master created successfully', 'success');
      }

      if (onSaveSuccess) onSaveSuccess();
      onClose();
    } catch (err) {
      console.error('Save Item Master error:', err);
      const msg = err.response?.data?.message || err.response?.data?.error || err.message || 'Failed to save item.';
      setError(msg);
      if (showToast) showToast(msg, 'error');
    } finally {
      setSaving(false);
    }
  };

  const factor = Number(formData.converterFactor) || 1;

  return (
    <div className="proc-modal-overlay" style={{ backdropFilter: 'blur(8px)', background: 'rgba(15, 23, 42, 0.65)', zIndex: 9999 }}>
      <form
        className="proc-modal"
        onSubmit={handleSubmit}
        style={{
          maxWidth: '920px',
          width: '95%',
          maxHeight: '92vh',
          overflowY: 'auto',
          borderRadius: '20px',
          border: '1px solid rgba(226, 232, 240, 0.9)',
          boxShadow: '0 25px 60px -15px rgba(15, 23, 42, 0.35)',
          background: '#FFFFFF'
        }}
      >
        {/* HEADER */}
        <div
          className="proc-modal-header"
          style={{
            position: 'sticky',
            top: 0,
            background: 'rgba(255, 255, 255, 0.98)',
            backdropFilter: 'blur(10px)',
            zIndex: 10,
            borderBottom: '1.5px solid #F1F5F9',
            padding: '20px 28px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between'
          }}
        >
          <div>
            <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 800, color: '#0F172A' }}>
              {editingItem ? 'Edit Item Master Record' : 'Create New Item Master'}
            </h3>
            <p style={{ margin: '4px 0 0', fontSize: '12px', color: '#64748B' }}>
              Canonical hospital catalog item with automated packaging unit conversion
            </p>
          </div>
          <button
            type="button"
            className="proc-close-btn"
            onClick={onClose}
            style={{
              background: '#F1F5F9',
              border: 'none',
              borderRadius: '50%',
              width: '36px',
              height: '36px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            ✕
          </button>
        </div>

        {/* BODY */}
        <div className="proc-modal-body" style={{ padding: '24px 28px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
          {error && (
            <div style={{ padding: '12px 16px', background: '#FEF2F2', border: '1px solid #F87171', borderRadius: '10px', color: '#991B1B', fontSize: '13px', fontWeight: 600 }}>
              ⚠️ {error}
            </div>
          )}

          {/* SECTION 1: PACKAGING CONVERSION CARD (FEATURED) */}
          <div style={{ background: 'linear-gradient(135deg, #F0FDF4 0%, #DCFCE7 100%)', border: '1.5px solid #86EFAC', borderRadius: '14px', padding: '18px 20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
              <span style={{ fontSize: '18px' }}>📦</span>
              <span style={{ fontSize: '14px', fontWeight: 800, color: '#166534', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Packaging & Consumption Unit Conversion
              </span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
              <div>
                <label className="proc-form-label" style={{ fontWeight: 700, color: '#14532D' }}>Purchased Unit *</label>
                <input
                  type="text"
                  list="purchased-units-list"
                  name="purchasedUnit"
                  value={formData.purchasedUnit}
                  onChange={handleChange}
                  placeholder="e.g. Box"
                  className="proc-input"
                  required
                  style={{ background: '#FFFFFF' }}
                />
                <datalist id="purchased-units-list">
                  {PURCHASE_UNITS.map(u => <option key={u} value={u} />)}
                </datalist>
                <span style={{ fontSize: '11px', color: '#166534' }}>Unit supplier bills in (POs & GRNs)</span>
              </div>

              <div>
                <label className="proc-form-label" style={{ fontWeight: 700, color: '#14532D' }}>Conversion Factor *</label>
                <input
                  type="number"
                  name="converterFactor"
                  min="0.001"
                  step="any"
                  value={formData.converterFactor}
                  onChange={handleChange}
                  className="proc-input"
                  required
                  style={{ background: '#FFFFFF', fontWeight: 700 }}
                />
                <span style={{ fontSize: '11px', color: '#166534' }}>Units per 1 {formData.purchasedUnit || 'Box'}</span>
              </div>

              <div>
                <label className="proc-form-label" style={{ fontWeight: 700, color: '#14532D' }}>Consumption Unit *</label>
                <input
                  type="text"
                  list="consumption-units-list"
                  name="consumptionUnit"
                  value={formData.consumptionUnit}
                  onChange={handleChange}
                  placeholder="e.g. Tablet"
                  className="proc-input"
                  required
                  style={{ background: '#FFFFFF' }}
                />
                <datalist id="consumption-units-list">
                  {CONSUMPTION_UNITS.map(u => <option key={u} value={u} />)}
                </datalist>
                <span style={{ fontSize: '11px', color: '#166534' }}>Prescription & dispensing unit</span>
              </div>

              <div>
                <label className="proc-form-label" style={{ fontWeight: 700, color: '#14532D' }}>Pack Size Description</label>
                <input
                  type="text"
                  name="packSizeDescription"
                  value={formData.packSizeDescription}
                  onChange={handleChange}
                  placeholder="e.g. 10x10 Tablets / 100ml"
                  className="proc-input"
                  style={{ background: '#FFFFFF' }}
                />
                <span style={{ fontSize: '11px', color: '#166534' }}>Commercial label description</span>
              </div>
            </div>

            {/* LIVE PREVIEW BADGE */}
            <div style={{ marginTop: '14px', padding: '10px 14px', background: '#FFFFFF', borderRadius: '10px', border: '1px solid #BBF7D0', display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ fontSize: '13px', fontWeight: 800, color: '#15803D' }}>⚖️ Live Equation:</span>
              <span style={{ fontSize: '14px', fontWeight: 700, color: '#0F172A' }}>
                1 {formData.purchasedUnit || 'Box'} = <span style={{ color: '#059669', fontSize: '15px' }}>{factor} {formData.consumptionUnit || 'Units'}</span>
              </span>
              <span style={{ fontSize: '11px', color: '#64748B', marginLeft: 'auto' }}>
                (1 {formData.purchasedUnit || 'Box'} received in GRN adds {factor} {formData.consumptionUnit || 'Units'} into stock)
              </span>
            </div>
          </div>

          {/* SECTION 2: BASIC DETAILS */}
          <div>
            <h4 style={{ margin: '0 0 12px', fontSize: '14px', fontWeight: 800, color: '#1E293B', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              1. Item Identity & Classification
            </h4>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px' }}>
              <div style={{ gridColumn: 'span 2' }}>
                <label className="proc-form-label">Generic / Chemical Name *</label>
                <input
                  type="text"
                  name="genericName"
                  value={formData.genericName}
                  onChange={handleChange}
                  placeholder="e.g. Paracetamol 500mg, Amoxicillin 250mg"
                  className="proc-input"
                  required
                />
              </div>

              <div>
                <label className="proc-form-label">Brand Name (Optional)</label>
                <input
                  type="text"
                  name="brandName"
                  value={formData.brandName}
                  onChange={handleChange}
                  placeholder="e.g. Dolo, Calpol, Augmentin"
                  className="proc-input"
                />
              </div>

              <div>
                <label className="proc-form-label">Category *</label>
                <select name="categoryType" value={formData.categoryType} onChange={handleChange} className="proc-select">
                  {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>

              <div>
                <label className="proc-form-label">Department *</label>
                <select name="departmentType" value={formData.departmentType} onChange={handleChange} className="proc-select">
                  {DEPARTMENTS.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>

              <div>
                <label className="proc-form-label">Item Type *</label>
                <select name="itemType" value={formData.itemType} onChange={handleChange} className="proc-select">
                  {ITEM_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
            </div>
          </div>

          {/* SECTION 3: CLINICAL & REGULATORY ATTRIBUTES */}
          <div>
            <h4 style={{ margin: '0 0 12px', fontSize: '14px', fontWeight: 800, color: '#1E293B', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              2. Regulatory, Storage & Expiry Controls
            </h4>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
              <div>
                <label className="proc-form-label">HSN Code</label>
                <input
                  type="text"
                  name="hsnCode"
                  value={formData.hsnCode}
                  onChange={handleChange}
                  placeholder="e.g. 3004"
                  className="proc-input"
                />
              </div>

              <div>
                <label className="proc-form-label">Default GST Rate (%)</label>
                <select name="defaultGst" value={formData.defaultGst} onChange={handleChange} className="proc-select">
                  <option value={0}>0% (Exempt)</option>
                  <option value={5}>5%</option>
                  <option value={12}>12% (Standard Pharma)</option>
                  <option value={18}>18%</option>
                  <option value={28}>28%</option>
                </select>
              </div>

              <div>
                <label className="proc-form-label">Storage Temperature</label>
                <select name="storageTemperature" value={formData.storageTemperature} onChange={handleChange} className="proc-select">
                  {TEMPERATURES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>

              <div>
                <label className="proc-form-label">Manufacturer</label>
                <input
                  type="text"
                  name="manufacturer"
                  value={formData.manufacturer}
                  onChange={handleChange}
                  placeholder="e.g. Cipla, Sun Pharma, Abbott"
                  className="proc-input"
                />
              </div>

              <div>
                <label className="proc-form-label">Min Shelf Life at GRN (Days)</label>
                <input
                  type="number"
                  name="expiryCutoffDays"
                  min="0"
                  value={formData.expiryCutoffDays}
                  onChange={handleChange}
                  className="proc-input"
                />
                <span style={{ fontSize: '11px', color: '#64748B' }}>Rejected at GRN if expiry closer than this</span>
              </div>

              <div>
                <label className="proc-form-label">Status</label>
                <select name="status" value={formData.status} onChange={handleChange} className="proc-select">
                  <option value="Active">Active</option>
                  <option value="Inactive">Inactive</option>
                </select>
              </div>
            </div>
          </div>
        </div>

        {/* FOOTER */}
        <div
          className="proc-modal-footer"
          style={{
            position: 'sticky',
            bottom: 0,
            background: 'rgba(255, 255, 255, 0.98)',
            borderTop: '1.5px solid #F1F5F9',
            padding: '16px 28px',
            display: 'flex',
            justifyContent: 'flex-end',
            gap: '12px'
          }}
        >
          <button type="button" className="proc-btn proc-btn-secondary" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button type="submit" className="proc-btn proc-btn-primary" disabled={saving}>
            {saving ? 'Saving...' : (editingItem ? 'Save Changes' : 'Create Item Master')}
          </button>
        </div>
      </form>
    </div>
  );
}
