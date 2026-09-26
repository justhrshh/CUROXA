import React, { useState, useEffect, useRef } from 'react';
import api from '../../utils/api';

export default function VendorQuotationModal({ isOpen, onClose, onSaveSuccess, editingQuotation = null, vendors = [], showToast }) {
  // Global item search state
  const [itemSearch, setItemSearch] = useState('');
  const [itemResults, setItemResults] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [selectedItem, setSelectedItem] = useState(null);
  const [showResults, setShowResults] = useState(false);
  const searchTimer = useRef(null);

  const [formData, setFormData] = useState({
    vendorId: '', itemMasterId: '', itemCode: '', genericName: '', brandName: '', manufacturer: '',
    purchasedUnit: 'Box', packSize: '', converterFactor: 1, consumptionUnit: 'Unit',
    ratePerPurchasedUnit: '', discountPercent: 0, gstPercent: 12,
    leadTimeDays: 3, minimumOrderQty: 1, validTill: '',
    termsAndConditions: '', supersedePrevious: true
  });

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Debounced global item search
  useEffect(() => {
    if (!isOpen || !itemSearch.trim() || itemSearch.length < 2) {
      setItemResults([]);
      setShowResults(false);
      return;
    }
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(async () => {
      setSearchLoading(true);
      try {
        const res = await api.get('/item-master/global/search', { params: { q: itemSearch.trim() } });
        if (res.data && res.data.success) {
          setItemResults(res.data.data || []);
          setShowResults(true);
        }
      } catch (err) {
        console.warn('Global item search error:', err.message);
      } finally {
        setSearchLoading(false);
      }
    }, 300);
    return () => clearTimeout(searchTimer.current);
  }, [itemSearch, isOpen]);

  const handleItemSelect = (item) => {
    setSelectedItem(item);
    setItemSearch(`${item.itemCode} — ${item.genericName}`);
    setShowResults(false);
    setFormData(prev => ({
      ...prev,
      itemMasterId: item._id,
      itemCode: item.itemCode,
      genericName: item.genericName,
      brandName: item.brandName || prev.brandName,
      manufacturer: item.manufacturer || '',
      purchasedUnit: item.purchasedUnit || prev.purchasedUnit,
      packSize: item.packSizeDescription || prev.packSize,
      converterFactor: item.converterFactor || 1,
      consumptionUnit: item.consumptionUnit || 'Unit',
      gstPercent: item.defaultGst !== undefined ? item.defaultGst : prev.gstPercent
    }));
  };



  useEffect(() => {
    if (editingQuotation) {
      setFormData({
        vendorId: editingQuotation.vendorId?._id || editingQuotation.vendorId || '',
        itemMasterId: editingQuotation.itemMasterId?._id || editingQuotation.itemMasterId || '',
        brandName: editingQuotation.brandName || '',
        purchasedUnit: editingQuotation.purchasedUnit || 'Box',
        packSize: editingQuotation.packSize || '',
        converterFactor: editingQuotation.converterFactor || 1,
        consumptionUnit: editingQuotation.consumptionUnit || 'Unit',
        ratePerPurchasedUnit: editingQuotation.ratePerPurchasedUnit || '',
        discountPercent: editingQuotation.discountPercent || 0,
        gstPercent: editingQuotation.gstPercent !== undefined ? editingQuotation.gstPercent : 12,
        leadTimeDays: editingQuotation.leadTimeDays || 3,
        minimumOrderQty: editingQuotation.minimumOrderQty || 1,
        validTill: editingQuotation.validTill ? new Date(editingQuotation.validTill).toISOString().split('T')[0] : '',
        termsAndConditions: editingQuotation.termsAndConditions || '',
        supersedePrevious: false
      });
    } else {
      // Default validity: 1 year from now
      const oneYear = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      setFormData({
        vendorId: vendors[0]?._id || '',
        itemMasterId: '',
        brandName: '',
        purchasedUnit: 'Box',
        packSize: '',
        converterFactor: 1,
        consumptionUnit: 'Unit',
        ratePerPurchasedUnit: '',
        discountPercent: 0,
        gstPercent: 12,
        leadTimeDays: 3,
        minimumOrderQty: 1,
        validTill: oneYear,
        termsAndConditions: '',
        supersedePrevious: true
      });
    }
    setError('');
  }, [editingQuotation, isOpen, vendors]);

  if (!isOpen) return null;



  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
  };

  // Live computations
  const pRate = Number(formData.ratePerPurchasedUnit) || 0;
  const factor = Number(formData.converterFactor) > 0 ? Number(formData.converterFactor) : 1;
  const disc = Math.max(0, Math.min(100, Number(formData.discountPercent) || 0));
  const gst = Math.max(0, Math.min(100, Number(formData.gstPercent) || 0));

  const netRatePurchased = pRate * (1 - disc / 100) * (1 + gst / 100);
  const ratePerConsumption = pRate / factor;
  const netEffectiveRate = netRatePurchased / factor;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.vendorId) {
      setError('Please select a vendor.');
      return;
    }
    if (!formData.itemMasterId) {
      setError('Please select an item from Item Master.');
      return;
    }
    if (!formData.ratePerPurchasedUnit || Number(formData.ratePerPurchasedUnit) <= 0) {
      setError('Rate per purchased unit must be greater than zero.');
      return;
    }
    if (!formData.validTill) {
      setError('Validity end date is required.');
      return;
    }

    try {
      setSaving(true);
      setError('');

      const payload = {
        ...formData,
        ratePerPurchasedUnit: Number(formData.ratePerPurchasedUnit),
        converterFactor: Number(formData.converterFactor) || 1,
        discountPercent: Number(formData.discountPercent) || 0,
        gstPercent: Number(formData.gstPercent) || 0,
        leadTimeDays: Number(formData.leadTimeDays) || 3,
        minimumOrderQty: Number(formData.minimumOrderQty) || 1
      };

      if (editingQuotation && editingQuotation._id) {
        await api.put(`/vendor-quotations/${editingQuotation._id}`, payload);
        if (showToast) showToast('Vendor quotation updated successfully', 'success');
      } else {
        await api.post('/vendor-quotations', payload);
        if (showToast) showToast('Vendor quotation created successfully', 'success');
      }

      if (onSaveSuccess) onSaveSuccess();
      onClose();
    } catch (err) {
      console.error('Save Quotation error:', err);
      const msg = err.response?.data?.message || err.response?.data?.error || err.message || 'Failed to save quotation.';
      setError(msg);
      if (showToast) showToast(msg, 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="proc-modal-overlay" style={{ backdropFilter: 'blur(8px)', background: 'rgba(15, 23, 42, 0.65)', zIndex: 9999 }}>
      <form
        className="proc-modal"
        onSubmit={handleSubmit}
        style={{
          maxWidth: '880px',
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
              {editingQuotation ? 'Edit Vendor Quotation' : 'New Vendor Quotation'}
            </h3>
            <p style={{ margin: '4px 0 0', fontSize: '12px', color: '#64748B' }}>
              Link vendor pricing with Global Item Master · automated unit conversion & net price computation
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
        <div className="proc-modal-body" style={{ padding: '24px 28px', display: 'flex', flexDirection: 'column', gap: '22px' }}>
          {error && (
            <div style={{ padding: '12px 16px', background: '#FEF2F2', border: '1px solid #F87171', borderRadius: '10px', color: '#991B1B', fontSize: '13px', fontWeight: 600 }}>
              ⚠️ {error}
            </div>
          )}

          {/* VENDOR & ITEM SELECTION */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '16px' }}>
            <div>
              <label className="proc-form-label">Vendor / Supplier *</label>
              <select
                name="vendorId"
                value={formData.vendorId}
                onChange={handleChange}
                className="proc-select"
                required
                disabled={!!editingQuotation}
              >
                <option value="">-- Select Active Vendor --</option>
                {vendors.filter(v => v.status === 'Active').map(v => (
                  <option key={v._id} value={v._id}>{v.name} ({v.code || 'No Code'})</option>
                ))}
              </select>
            </div>

            <div style={{ position: 'relative' }}>
              <label className="proc-form-label">Item (Global Catalog) *</label>
              <input
                type="text"
                className="proc-input"
                placeholder="Search by name, code, brand, manufacturer..."
                value={itemSearch}
                onChange={e => { setItemSearch(e.target.value); if (!e.target.value) { setSelectedItem(null); setFormData(prev => ({ ...prev, itemMasterId: '' })); } }}
                disabled={!!editingQuotation}
                autoComplete="off"
                style={{ paddingRight: searchLoading ? '36px' : '12px' }}
              />
              {searchLoading && (
                <span style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', color: '#64748B', fontSize: '13px' }}>⏳</span>
              )}
              {showResults && itemResults.length > 0 && (
                <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 100, background: '#fff', border: '1px solid #CBD5E1', borderRadius: '10px', boxShadow: '0 8px 24px rgba(0,0,0,0.12)', maxHeight: '260px', overflowY: 'auto', marginTop: '4px' }}>
                  {itemResults.map(item => (
                    <button key={item._id} type="button" onClick={() => handleItemSelect(item)}
                      style={{ display: 'block', width: '100%', textAlign: 'left', padding: '10px 14px', border: 'none', background: 'transparent', cursor: 'pointer', borderBottom: '1px solid #F1F5F9' }}
                      onMouseEnter={e => e.currentTarget.style.background = '#F8FAFC'}
                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontFamily: 'monospace', fontWeight: 700, color: '#2563EB', background: '#EFF6FF', padding: '2px 6px', borderRadius: '4px', fontSize: '11px' }}>{item.itemCode}</span>
                        <span style={{ background: '#DCFCE7', color: '#166534', fontSize: '10px', fontWeight: 700, padding: '1px 6px', borderRadius: '8px' }}>🌐 Global</span>
                      </div>
                      <div style={{ fontWeight: 700, color: '#0F172A', fontSize: '13px', marginTop: '4px' }}>{item.genericName}</div>
                      <div style={{ fontSize: '11px', color: '#64748B' }}>
                        {item.brandName && <span>{item.brandName} · </span>}
                        {item.manufacturer && <span>Mfg: {item.manufacturer} · </span>}
                        <span>1 {item.purchasedUnit || 'Box'} = {item.converterFactor || 1} {item.consumptionUnit || 'Unit'}s</span>
                      </div>
                    </button>
                  ))}
                </div>
              )}
              {showResults && itemResults.length === 0 && !searchLoading && itemSearch.length >= 2 && (
                <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 100, background: '#fff', border: '1px solid #CBD5E1', borderRadius: '10px', padding: '14px', fontSize: '13px', color: '#64748B', marginTop: '4px' }}>
                  No global items found for "{itemSearch}". Ask Super Admin to add it.
                </div>
              )}
              {selectedItem && (
                <div style={{ marginTop: '8px', background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: '8px', padding: '10px 12px' }}>
                  <div style={{ fontSize: '11px', fontWeight: 700, color: '#166534', marginBottom: '4px' }}>✓ Sourced from Global Catalog · Canonical fields auto-filled (read-only)</div>
                  <div style={{ fontSize: '12px', color: '#334155' }}>
                    <strong>{selectedItem.packSizeDescription || `1 ${selectedItem.purchasedUnit} = ${selectedItem.converterFactor} ${selectedItem.consumptionUnit}s`}</strong>
                    {selectedItem.manufacturer && <span> · Mfg: {selectedItem.manufacturer}</span>}
                    · GST: {selectedItem.defaultGst || 12}%
                  </div>
                </div>
              )}
            </div>
          </div>


          {/* COMMERCIAL RATES & TAXES */}
          <div>
            <h4 style={{ margin: '0 0 12px', fontSize: '14px', fontWeight: 800, color: '#1E293B', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Commercial Terms & Rates
            </h4>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '16px' }}>
              <div>
                <label className="proc-form-label">Rate / {formData.purchasedUnit || 'Purchased Unit'} (₹) *</label>
                <input
                  type="number"
                  name="ratePerPurchasedUnit"
                  step="any"
                  min="0.01"
                  required
                  placeholder="e.g. 450.00"
                  value={formData.ratePerPurchasedUnit}
                  onChange={handleChange}
                  className="proc-input"
                  style={{ fontWeight: 700 }}
                />
              </div>

              <div>
                <label className="proc-form-label">Discount (%)</label>
                <input
                  type="number"
                  name="discountPercent"
                  min="0"
                  max="100"
                  step="any"
                  value={formData.discountPercent}
                  onChange={handleChange}
                  className="proc-input"
                />
              </div>

              <div>
                <label className="proc-form-label">GST Rate (%)</label>
                <select name="gstPercent" value={formData.gstPercent} onChange={handleChange} className="proc-select">
                  <option value={0}>0% (Exempt)</option>
                  <option value={5}>5%</option>
                  <option value={12}>12%</option>
                  <option value={18}>18%</option>
                  <option value={28}>28%</option>
                </select>
              </div>

              <div>
                <label className="proc-form-label">Lead Time (Days)</label>
                <input
                  type="number"
                  name="leadTimeDays"
                  min="0"
                  value={formData.leadTimeDays}
                  onChange={handleChange}
                  className="proc-input"
                />
              </div>

              <div>
                <label className="proc-form-label">Valid Till *</label>
                <input
                  type="date"
                  name="validTill"
                  required
                  value={formData.validTill}
                  onChange={handleChange}
                  className="proc-input"
                />
              </div>
            </div>
          </div>

          {/* REAL-TIME EFFECTIVE RATE SUMMARY CARD */}
          <div style={{ background: '#F8FAFC', border: '1.5px solid #E2E8F0', borderRadius: '14px', padding: '16px 20px' }}>
            <div style={{ fontSize: '13px', fontWeight: 800, color: '#334155', textTransform: 'uppercase', marginBottom: '10px' }}>
              💡 Real-Time Financial Analysis
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '14px' }}>
              <div>
                <span style={{ fontSize: '11px', color: '#64748B', fontWeight: 600 }}>Net Rate / {formData.purchasedUnit || 'Box'}:</span>
                <div style={{ fontSize: '16px', fontWeight: 800, color: '#0F172A' }}>₹{netRatePurchased.toFixed(2)}</div>
                <span style={{ fontSize: '10px', color: '#94A3B8' }}>(Incl. {disc}% disc & {gst}% GST)</span>
              </div>

              <div>
                <span style={{ fontSize: '11px', color: '#64748B', fontWeight: 600 }}>Raw Rate / {formData.consumptionUnit || 'Unit'}:</span>
                <div style={{ fontSize: '16px', fontWeight: 800, color: '#475569' }}>₹{ratePerConsumption.toFixed(4)}</div>
                <span style={{ fontSize: '10px', color: '#94A3B8' }}>(Base price / factor {factor})</span>
              </div>

              <div>
                <span style={{ fontSize: '11px', color: '#166534', fontWeight: 700 }}>Effective Net Cost / {formData.consumptionUnit || 'Unit'}:</span>
                <div style={{ fontSize: '18px', fontWeight: 900, color: '#15803D' }}>₹{netEffectiveRate.toFixed(4)}</div>
                <span style={{ fontSize: '10px', color: '#166534' }}>Authoritative unit cost for dispensing</span>
              </div>
            </div>
          </div>

          {!editingQuotation && (
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: '#334155', cursor: 'pointer' }}>
              <input
                type="checkbox"
                name="supersedePrevious"
                checked={formData.supersedePrevious}
                onChange={handleChange}
              />
              <span>Automatically mark any previous active quotation for this Vendor + Item as <strong>Superseded</strong></span>
            </label>
          )}
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
            {saving ? 'Saving...' : (editingQuotation ? 'Save Changes' : 'Create Quotation')}
          </button>
        </div>
      </form>
    </div>
  );
}
