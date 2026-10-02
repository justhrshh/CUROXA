import React, { useState, useEffect, useRef } from 'react';
import api from '../../utils/api';

/**
 * ============================================================================
 * QUROXA — VENDOR QUOTATION MODAL
 * ============================================================================
 * Dense enterprise modal for creating and editing hospital-specific vendor quotations.
 * Vendor-First Workflow:
 * 1. Select Vendor (restricted to hospital-associated vendors)
 * 2. Enter Quotation / Reference details and validity dates
 * 3. Add items strictly from hospital's selected catalog (HospitalMasterConfig)
 * 4. Multi-item batch quotation creation with live packaging & net effective cost calculation
 * 5. Duplicate line prevention within quotation
 */
export default function VendorQuotationModal({
  isOpen,
  onClose,
  onSaveSuccess,
  editingQuotation = null,
  vendors = [],
  showToast
}) {
  // ── Eligible Vendors & Items States ──
  const [eligibleVendors, setEligibleVendors] = useState([]);
  const [loadingVendors, setLoadingVendors] = useState(false);

  // Item Search (HospitalMasterConfig only)
  const [itemSearch, setItemSearch] = useState('');
  const [itemResults, setItemResults] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [selectedItem, setSelectedItem] = useState(null);
  const searchTimer = useRef(null);

  // Header form states
  const [headerData, setHeaderData] = useState({
    vendorId: '',
    quotationNo: '',
    referenceNo: '',
    validFrom: new Date().toISOString().split('T')[0],
    validTill: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    termsAndConditions: '',
    supersedePrevious: true
  });

  // Current item line input states
  const [lineInput, setLineInput] = useState({
    ratePerPurchasedUnit: '',
    discountPercent: 0,
    gstPercent: 12,
    mrp: '',
    minimumOrderQty: 1,
    leadTimeDays: 3
  });

  // Multi-item quotation list
  const [quotationItems, setQuotationItems] = useState([]);

  // Edit-only form state
  const [editFormData, setEditFormData] = useState(null);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // ── 1. Fetch eligible vendors when modal opens ──
  useEffect(() => {
    if (!isOpen) return;

    let isMounted = true;
    async function loadEligibleVendors() {
      setLoadingVendors(true);
      try {
        const res = await api.get('/vendor-quotations/eligible-vendors');
        if (res.data && res.data.success && isMounted) {
          setEligibleVendors(res.data.data || []);
        } else if (isMounted) {
          setEligibleVendors(vendors.filter(v => v.status === 'Active'));
        }
      } catch (err) {
        console.warn('Failed to fetch eligible vendors, falling back to props:', err.message);
        if (isMounted) {
          setEligibleVendors(vendors.filter(v => v.status === 'Active'));
        }
      } finally {
        if (isMounted) setLoadingVendors(false);
      }
    }
    loadEligibleVendors();

    return () => { isMounted = false; };
  }, [isOpen, vendors]);

  // ── 2. Initialize form when opening for Add or Edit ──
  useEffect(() => {
    if (!isOpen) return;

    if (editingQuotation) {
      // Single quotation edit mode
      const vId = editingQuotation.vendorId?._id || editingQuotation.vendorId || '';
      setHeaderData({
        vendorId: vId,
        quotationNo: editingQuotation.quotationNo || '',
        referenceNo: editingQuotation.referenceNo || '',
        validFrom: editingQuotation.effectiveFrom ? new Date(editingQuotation.effectiveFrom).toISOString().split('T')[0] : '',
        validTill: editingQuotation.validTill ? new Date(editingQuotation.validTill).toISOString().split('T')[0] : '',
        termsAndConditions: editingQuotation.termsAndConditions || '',
        supersedePrevious: false
      });
      setEditFormData({
        itemMasterId: editingQuotation.itemMasterId?._id || editingQuotation.itemMasterId || '',
        itemCode: editingQuotation.itemCode || '',
        genericName: editingQuotation.genericName || '',
        brandName: editingQuotation.brandName || '',
        manufacturer: editingQuotation.manufacturer || '',
        purchasedUnit: editingQuotation.purchasedUnit || 'Box',
        packSize: editingQuotation.packSize || '',
        converterFactor: editingQuotation.converterFactor || 1,
        consumptionUnit: editingQuotation.consumptionUnit || 'Unit',
        ratePerPurchasedUnit: editingQuotation.ratePerPurchasedUnit || '',
        discountPercent: editingQuotation.discountPercent || 0,
        gstPercent: editingQuotation.gstPercent !== undefined ? editingQuotation.gstPercent : 12,
        mrp: editingQuotation.mrp || '',
        leadTimeDays: editingQuotation.leadTimeDays || 3,
        minimumOrderQty: editingQuotation.minimumOrderQty || 1,
        status: editingQuotation.status || 'Active'
      });
      setQuotationItems([]);
    } else {
      // New quotation mode
      const oneYear = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      const today = new Date().toISOString().split('T')[0];
      setHeaderData({
        vendorId: eligibleVendors[0]?._id || '',
        quotationNo: '',
        referenceNo: '',
        validFrom: today,
        validTill: oneYear,
        termsAndConditions: '',
        supersedePrevious: true
      });
      setLineInput({
        ratePerPurchasedUnit: '',
        discountPercent: 0,
        gstPercent: 12,
        mrp: '',
        minimumOrderQty: 1,
        leadTimeDays: 3
      });
      setQuotationItems([]);
      setSelectedItem(null);
      setItemSearch('');
      setEditFormData(null);
    }
    setError('');
  }, [isOpen, editingQuotation, eligibleVendors]);

  // If vendor changes in new mode and no vendor was set initially
  useEffect(() => {
    if (!editingQuotation && !headerData.vendorId && eligibleVendors.length > 0) {
      setHeaderData(prev => ({ ...prev, vendorId: eligibleVendors[0]._id }));
    }
  }, [eligibleVendors, editingQuotation, headerData.vendorId]);

  // ── 3. Debounced Search in HospitalMasterConfig (Hospital Selected Catalog Only) ──
  useEffect(() => {
    if (!isOpen || editingQuotation || !itemSearch.trim() || itemSearch.length < 2) {
      setItemResults([]);
      setShowResults(false);
      return;
    }
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(async () => {
      setSearchLoading(true);
      try {
        const res = await api.get('/vendor-quotations/eligible-items', {
          params: { search: itemSearch.trim(), limit: 40 }
        });
        if (res.data && res.data.success) {
          setItemResults(res.data.data || []);
          setShowResults(true);
        }
      } catch (err) {
        console.warn('Eligible item search error:', err.message);
      } finally {
        setSearchLoading(false);
      }
    }, 280);
    return () => clearTimeout(searchTimer.current);
  }, [itemSearch, isOpen, editingQuotation]);

  const handleSelectItem = (item) => {
    // Check if item is already added to lines
    const alreadyAdded = quotationItems.some(
      it => String(it.itemMasterId) === String(item.itemMasterId)
    );
    if (alreadyAdded) {
      setError(`Item '${item.genericName}' (${item.itemCode}) is already in this quotation!`);
      return;
    }

    setSelectedItem(item);
    setItemSearch(`${item.itemCode} — ${item.itemName || item.genericName}`);
    setShowResults(false);
    setError('');

    // Pre-populate line inputs with item defaults
    setLineInput({
      ratePerPurchasedUnit: item.hospitalCost ? String(item.hospitalCost) : '',
      discountPercent: 0,
      gstPercent: item.defaultGst !== undefined ? item.defaultGst : 12,
      mrp: item.hospitalMrp ? String(item.hospitalMrp) : '',
      minimumOrderQty: 1,
      leadTimeDays: 3
    });
  };

  // ── 4. Live Calculation Helpers ──
  const calculateRates = (rate, disc, gst, cFactor) => {
    const pRate = Number(rate) || 0;
    const factor = Number(cFactor) > 0 ? Number(cFactor) : 1;
    const d = Math.max(0, Math.min(100, Number(disc) || 0));
    const g = Math.max(0, Math.min(100, Number(gst) || 0));

    const discounted = pRate * (1 - d / 100);
    const netPurchased = discounted * (1 + g / 100);
    const consumptionRate = pRate / factor;
    const netEffective = netPurchased / factor;

    return {
      netPurchased: Math.round(netPurchased * 100) / 100,
      consumptionRate: Math.round(consumptionRate * 10000) / 10000,
      netEffective: Math.round(netEffective * 10000) / 10000
    };
  };

  // Current line live values
  const currentFactor = selectedItem ? (selectedItem.converterFactor || 1) : 1;
  const currentCalcs = calculateRates(
    lineInput.ratePerPurchasedUnit,
    lineInput.discountPercent,
    lineInput.gstPercent,
    currentFactor
  );

  // Edit line live values
  const editCalcs = editFormData
    ? calculateRates(
        editFormData.ratePerPurchasedUnit,
        editFormData.discountPercent,
        editFormData.gstPercent,
        editFormData.converterFactor || 1
      )
    : null;

  // ── 5. Add Line Item to Quotation ──
  const handleAddLineItem = () => {
    if (!selectedItem) {
      setError('Please search and select a hospital catalog item first.');
      return;
    }
    const pRate = Number(lineInput.ratePerPurchasedUnit);
    if (!pRate || pRate <= 0) {
      setError('Please enter a valid rate per purchased unit (greater than ₹0).');
      return;
    }

    // Duplicate line prevention
    const alreadyAdded = quotationItems.some(
      it => String(it.itemMasterId) === String(selectedItem.itemMasterId)
    );
    if (alreadyAdded) {
      setError(`Item '${selectedItem.genericName}' (${selectedItem.itemCode}) is already added.`);
      return;
    }

    const rates = calculateRates(
      lineInput.ratePerPurchasedUnit,
      lineInput.discountPercent,
      lineInput.gstPercent,
      selectedItem.converterFactor || 1
    );

    const newLine = {
      hospitalMasterConfigId: selectedItem.hospitalMasterConfigId,
      itemMasterId: selectedItem.itemMasterId,
      itemCode: selectedItem.itemCode,
      itemName: selectedItem.itemName || selectedItem.genericName,
      genericName: selectedItem.genericName,
      brandName: selectedItem.brandName || '',
      manufacturer: selectedItem.manufacturer || '',
      category: selectedItem.category || '',
      purchasedUnit: selectedItem.purchasedUnit || 'Box',
      packSize: selectedItem.packSize || '',
      converterFactor: selectedItem.converterFactor || 1,
      consumptionUnit: selectedItem.consumptionUnit || 'Unit',
      ratePerPurchasedUnit: pRate,
      discountPercent: Number(lineInput.discountPercent) || 0,
      gstPercent: Number(lineInput.gstPercent) || 0,
      mrp: Number(lineInput.mrp) || 0,
      minimumOrderQty: Number(lineInput.minimumOrderQty) || 1,
      leadTimeDays: Number(lineInput.leadTimeDays) || 3,
      netRatePerPurchasedUnit: rates.netPurchased,
      ratePerConsumptionUnit: rates.consumptionRate,
      netEffectiveRate: rates.netEffective
    };

    setQuotationItems(prev => [...prev, newLine]);
    setSelectedItem(null);
    setItemSearch('');
    setLineInput({
      ratePerPurchasedUnit: '',
      discountPercent: 0,
      gstPercent: 12,
      mrp: '',
      minimumOrderQty: 1,
      leadTimeDays: 3
    });
    setError('');
  };

  const handleRemoveLineItem = (index) => {
    setQuotationItems(prev => prev.filter((_, idx) => idx !== index));
  };

  // ── 6. Submit Quotation (Create or Update) ──
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!headerData.vendorId) {
      setError('Please select an associated vendor.');
      return;
    }
    if (!headerData.validTill) {
      setError('Validity End Date is required.');
      return;
    }

    try {
      setSaving(true);
      setError('');

      if (editingQuotation && editingQuotation._id) {
        // UPDATE EXISTING QUOTATION
        if (!editFormData.ratePerPurchasedUnit || Number(editFormData.ratePerPurchasedUnit) <= 0) {
          setError('Rate per purchased unit must be greater than zero.');
          setSaving(false);
          return;
        }

        const payload = {
          vendorId: headerData.vendorId,
          referenceNo: headerData.referenceNo,
          validFrom: headerData.validFrom || undefined,
          validTill: headerData.validTill,
          termsAndConditions: headerData.termsAndConditions,
          ratePerPurchasedUnit: Number(editFormData.ratePerPurchasedUnit),
          discountPercent: Number(editFormData.discountPercent) || 0,
          gstPercent: Number(editFormData.gstPercent) || 0,
          mrp: Number(editFormData.mrp) || 0,
          minimumOrderQty: Number(editFormData.minimumOrderQty) || 1,
          leadTimeDays: Number(editFormData.leadTimeDays) || 3,
          status: editFormData.status || 'Active'
        };

        await api.put(`/vendor-quotations/${editingQuotation._id}`, payload);
        if (showToast) showToast('Vendor quotation updated successfully', 'success');
      } else {
        // CREATE NEW QUOTATION
        // If user filled in line inputs but didn't click "Add Item", automatically add it if selected
        let finalItems = [...quotationItems];
        if (selectedItem && lineInput.ratePerPurchasedUnit && Number(lineInput.ratePerPurchasedUnit) > 0) {
          const already = finalItems.some(it => String(it.itemMasterId) === String(selectedItem.itemMasterId));
          if (!already) {
            finalItems.push({
              hospitalMasterConfigId: selectedItem.hospitalMasterConfigId,
              itemMasterId: selectedItem.itemMasterId,
              itemCode: selectedItem.itemCode,
              ratePerPurchasedUnit: Number(lineInput.ratePerPurchasedUnit),
              discountPercent: Number(lineInput.discountPercent) || 0,
              gstPercent: Number(lineInput.gstPercent) || 0,
              mrp: Number(lineInput.mrp) || 0,
              minimumOrderQty: Number(lineInput.minimumOrderQty) || 1,
              leadTimeDays: Number(lineInput.leadTimeDays) || 3
            });
          }
        }

        if (finalItems.length === 0) {
          setError('At least one item must be added to the quotation.');
          setSaving(false);
          return;
        }

        const payload = {
          vendorId: headerData.vendorId,
          quotationNo: headerData.quotationNo ? headerData.quotationNo.trim() : undefined,
          referenceNo: headerData.referenceNo ? headerData.referenceNo.trim() : undefined,
          validFrom: headerData.validFrom || undefined,
          validTill: headerData.validTill,
          termsAndConditions: headerData.termsAndConditions,
          supersedePrevious: headerData.supersedePrevious,
          items: finalItems
        };

        const res = await api.post('/vendor-quotations', payload);
        const count = res.data?.count || finalItems.length;
        if (showToast) {
          showToast(`Vendor quotation created successfully (${count} line items)`, 'success');
        }
      }

      if (onSaveSuccess) onSaveSuccess();
      onClose();
    } catch (err) {
      console.error('Save Quotation error:', err);
      const msg = err.response?.data?.error || err.response?.data?.message || err.message || 'Failed to save quotation.';
      setError(msg);
      if (showToast) showToast(msg, 'error');
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="proc-modal-overlay"
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(15, 23, 42, 0.65)',
        backdropFilter: 'blur(6px)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px'
      }}
    >
      <form
        onSubmit={handleSubmit}
        style={{
          backgroundColor: '#FFFFFF',
          borderRadius: '16px',
          width: '100%',
          maxWidth: '1080px',
          maxHeight: '94vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 25px 60px -15px rgba(15, 23, 42, 0.35)',
          border: '1px solid #CBD5E1',
          overflow: 'hidden'
        }}
      >
        {/* ── MODAL HEADER ── */}
        <div
          style={{
            padding: '16px 24px',
            borderBottom: '1px solid #E2E8F0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'linear-gradient(to right, #F8FAFC, #FFFFFF)'
          }}
        >
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 800, color: '#0F172A' }}>
                {editingQuotation ? 'Edit Vendor Quotation Line' : 'Add Vendor Commercial Quotation'}
              </h3>
              <span
                style={{
                  background: '#EEF2FF',
                  color: '#4F46E5',
                  padding: '3px 9px',
                  borderRadius: '12px',
                  fontSize: '11px',
                  fontWeight: 700
                }}
              >
                Hospital Specific
              </span>
            </div>
            <p style={{ margin: '4px 0 0', fontSize: '12px', color: '#64748B' }}>
              Authoritative commercial pricing linked to hospital-associated vendors and selected catalog items.
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            style={{
              background: '#F1F5F9',
              border: 'none',
              borderRadius: '50%',
              width: '34px',
              height: '34px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '15px',
              color: '#64748B'
            }}
          >
            ✕
          </button>
        </div>

        {/* ── MODAL BODY ── */}
        <div
          style={{
            padding: '20px 24px',
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: '18px'
          }}
        >
          {error && (
            <div
              style={{
                padding: '12px 16px',
                background: '#FEF2F2',
                border: '1px solid #FCA5A5',
                borderRadius: '8px',
                color: '#991B1B',
                fontSize: '13px',
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}
            >
              <span>⚠️</span>
              <div style={{ flex: 1 }}>{error}</div>
            </div>
          )}

          {/* SECTION 1: VENDOR & QUOTATION HEADER DETAILS */}
          <div
            style={{
              background: '#F8FAFC',
              border: '1px solid #E2E8F0',
              borderRadius: '12px',
              padding: '16px'
            }}
          >
            <div
              style={{
                fontSize: '12px',
                fontWeight: 800,
                color: '#334155',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                marginBottom: '12px'
              }}
            >
              1. Vendor & Header Details
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                gap: '14px'
              }}
            >
              {/* Vendor Selector */}
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#334155', marginBottom: '5px' }}>
                  Associated Vendor *
                </label>
                <select
                  value={headerData.vendorId}
                  onChange={(e) => setHeaderData(prev => ({ ...prev, vendorId: e.target.value }))}
                  disabled={!!editingQuotation || loadingVendors}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: '8px',
                    border: '1px solid #CBD5E1',
                    fontSize: '13px',
                    backgroundColor: editingQuotation ? '#F1F5F9' : '#FFFFFF',
                    fontWeight: 600,
                    color: '#0F172A'
                  }}
                  required
                >
                  <option value="">-- Select Hospital Vendor --</option>
                  {eligibleVendors.map(v => (
                    <option key={v._id} value={v._id}>
                      {v.name} {v.code ? `(${v.code})` : ''} {v.category ? `• ${v.category}` : ''}
                    </option>
                  ))}
                </select>
                {eligibleVendors.length === 0 && !loadingVendors && (
                  <div style={{ fontSize: '11px', color: '#DC2626', marginTop: '4px' }}>
                    No active vendors associated with this hospital. Please associate vendors in Vendor Master first.
                  </div>
                )}
              </div>

              {/* Quotation No */}
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#334155', marginBottom: '5px' }}>
                  Quotation No {!editingQuotation && <span style={{ fontWeight: 400, color: '#64748B' }}>(Auto-generated if blank)</span>}
                </label>
                <input
                  type="text"
                  placeholder="e.g. VQ-2026-0001 or VEND-REF-09"
                  value={headerData.quotationNo}
                  onChange={(e) => setHeaderData(prev => ({ ...prev, quotationNo: e.target.value }))}
                  disabled={!!editingQuotation}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: '8px',
                    border: '1px solid #CBD5E1',
                    fontSize: '13px',
                    backgroundColor: editingQuotation ? '#F1F5F9' : '#FFFFFF',
                    fontFamily: 'monospace',
                    fontWeight: 600
                  }}
                />
              </div>

              {/* Tender / Vendor Ref No */}
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#334155', marginBottom: '5px' }}>
                  Tender / Vendor Ref No
                </label>
                <input
                  type="text"
                  placeholder="e.g. TND-2026-X4 / REF-889"
                  value={headerData.referenceNo}
                  onChange={(e) => setHeaderData(prev => ({ ...prev, referenceNo: e.target.value }))}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: '8px',
                    border: '1px solid #CBD5E1',
                    fontSize: '13px'
                  }}
                />
              </div>

              {/* Effective From */}
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#334155', marginBottom: '5px' }}>
                  Effective From
                </label>
                <input
                  type="date"
                  value={headerData.validFrom}
                  onChange={(e) => setHeaderData(prev => ({ ...prev, validFrom: e.target.value }))}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: '8px',
                    border: '1px solid #CBD5E1',
                    fontSize: '13px'
                  }}
                />
              </div>

              {/* Valid Till */}
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#DC2626', marginBottom: '5px' }}>
                  Valid Till (Expiry) *
                </label>
                <input
                  type="date"
                  required
                  value={headerData.validTill}
                  onChange={(e) => setHeaderData(prev => ({ ...prev, validTill: e.target.value }))}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: '8px',
                    border: '1px solid #CBD5E1',
                    fontSize: '13px',
                    fontWeight: 600
                  }}
                />
              </div>
            </div>
          </div>

          {/* SECTION 2: EDIT SINGLE ITEM MODE */}
          {editingQuotation && editFormData && (
            <div
              style={{
                background: '#FFFFFF',
                border: '1px solid #E2E8F0',
                borderRadius: '12px',
                padding: '16px'
              }}
            >
              <div
                style={{
                  fontSize: '12px',
                  fontWeight: 800,
                  color: '#334155',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  marginBottom: '12px'
                }}
              >
                2. Item Details & Commercial Pricing
              </div>

              {/* Read-Only Canonical Metadata */}
              <div
                style={{
                  background: '#F0FDF4',
                  border: '1px solid #BBF7D0',
                  borderRadius: '10px',
                  padding: '12px 16px',
                  marginBottom: '16px',
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: '16px',
                  alignItems: 'center'
                }}
              >
                <div>
                  <span
                    style={{
                      fontFamily: 'monospace',
                      fontWeight: 700,
                      color: '#166534',
                      background: '#DCFCE7',
                      padding: '2px 8px',
                      borderRadius: '4px',
                      fontSize: '12px'
                    }}
                  >
                    {editFormData.itemCode}
                  </span>
                  <div style={{ fontWeight: 800, color: '#0F172A', fontSize: '14px', marginTop: '4px' }}>
                    {editFormData.genericName}
                  </div>
                  {editFormData.brandName && (
                    <div style={{ fontSize: '12px', color: '#64748B' }}>Brand: {editFormData.brandName}</div>
                  )}
                </div>

                <div style={{ fontSize: '12px', color: '#334155', borderLeft: '1px solid #BBF7D0', paddingLeft: '16px' }}>
                  <div><strong>Packaging:</strong> 1 {editFormData.purchasedUnit} = {editFormData.converterFactor} {editFormData.consumptionUnit}s</div>
                  {editFormData.packSize && <div><strong>Pack Size:</strong> {editFormData.packSize}</div>}
                  {editFormData.manufacturer && <div><strong>Manufacturer:</strong> {editFormData.manufacturer}</div>}
                </div>
              </div>

              {/* Editable Commercial Inputs */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
                  gap: '14px'
                }}
              >
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#334155', marginBottom: '5px' }}>
                    Rate / {editFormData.purchasedUnit || 'Unit'} (₹) *
                  </label>
                  <input
                    type="number"
                    step="any"
                    min="0.01"
                    required
                    value={editFormData.ratePerPurchasedUnit}
                    onChange={(e) => setEditFormData(prev => ({ ...prev, ratePerPurchasedUnit: e.target.value }))}
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      borderRadius: '8px',
                      border: '1px solid #CBD5E1',
                      fontSize: '14px',
                      fontWeight: 800,
                      color: '#0F172A'
                    }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#334155', marginBottom: '5px' }}>
                    Discount %
                  </label>
                  <input
                    type="number"
                    step="any"
                    min="0"
                    max="100"
                    value={editFormData.discountPercent}
                    onChange={(e) => setEditFormData(prev => ({ ...prev, discountPercent: e.target.value }))}
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      borderRadius: '8px',
                      border: '1px solid #CBD5E1',
                      fontSize: '13px'
                    }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#334155', marginBottom: '5px' }}>
                    GST %
                  </label>
                  <input
                    type="number"
                    step="any"
                    min="0"
                    max="100"
                    value={editFormData.gstPercent}
                    onChange={(e) => setEditFormData(prev => ({ ...prev, gstPercent: e.target.value }))}
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      borderRadius: '8px',
                      border: '1px solid #CBD5E1',
                      fontSize: '13px'
                    }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#334155', marginBottom: '5px' }}>
                    MRP (₹)
                  </label>
                  <input
                    type="number"
                    step="any"
                    min="0"
                    value={editFormData.mrp}
                    onChange={(e) => setEditFormData(prev => ({ ...prev, mrp: e.target.value }))}
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      borderRadius: '8px',
                      border: '1px solid #CBD5E1',
                      fontSize: '13px'
                    }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#334155', marginBottom: '5px' }}>
                    Min Order Qty
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={editFormData.minimumOrderQty}
                    onChange={(e) => setEditFormData(prev => ({ ...prev, minimumOrderQty: e.target.value }))}
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      borderRadius: '8px',
                      border: '1px solid #CBD5E1',
                      fontSize: '13px'
                    }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#334155', marginBottom: '5px' }}>
                    Lead Time (Days)
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={editFormData.leadTimeDays}
                    onChange={(e) => setEditFormData(prev => ({ ...prev, leadTimeDays: e.target.value }))}
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      borderRadius: '8px',
                      border: '1px solid #CBD5E1',
                      fontSize: '13px'
                    }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#334155', marginBottom: '5px' }}>
                    Quotation Status
                  </label>
                  <select
                    value={editFormData.status}
                    onChange={(e) => setEditFormData(prev => ({ ...prev, status: e.target.value }))}
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      borderRadius: '8px',
                      border: '1px solid #CBD5E1',
                      fontSize: '13px',
                      fontWeight: 600
                    }}
                  >
                    <option value="Active">Active</option>
                    <option value="Superseded">Superseded</option>
                    <option value="Expired">Expired</option>
                    <option value="Rejected">Rejected</option>
                  </select>
                </div>
              </div>

              {/* Computed Live Summary */}
              {editCalcs && (
                <div
                  style={{
                    marginTop: '16px',
                    padding: '12px 16px',
                    borderRadius: '8px',
                    background: '#F0FDF4',
                    border: '1px solid #86EFAC',
                    display: 'flex',
                    flexWrap: 'wrap',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: '12px'
                  }}
                >
                  <div>
                    <span style={{ fontSize: '12px', color: '#166534' }}>Net Rate / {editFormData.purchasedUnit}: </span>
                    <strong style={{ fontSize: '14px', color: '#166534' }}>₹{editCalcs.netPurchased.toFixed(2)}</strong>
                  </div>
                  <div>
                    <span style={{ fontSize: '12px', color: '#166534' }}>Base Rate / {editFormData.consumptionUnit}: </span>
                    <strong style={{ fontSize: '14px', color: '#166534' }}>₹{editCalcs.consumptionRate.toFixed(4)}</strong>
                  </div>
                  <div style={{ background: '#DCFCE7', padding: '4px 12px', borderRadius: '6px' }}>
                    <span style={{ fontSize: '12px', fontWeight: 700, color: '#14532D' }}>Authoritative Net Cost / {editFormData.consumptionUnit}: </span>
                    <strong style={{ fontSize: '16px', fontWeight: 900, color: '#14532D' }}>₹{editCalcs.netEffective.toFixed(4)}</strong>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* SECTION 2 (NEW MODE): SEARCH & ADD MULTIPLE ITEMS */}
          {!editingQuotation && (
            <div
              style={{
                background: '#FFFFFF',
                border: '1px solid #CBD5E1',
                borderRadius: '12px',
                padding: '16px'
              }}
            >
              <div
                style={{
                  fontSize: '12px',
                  fontWeight: 800,
                  color: '#334155',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  marginBottom: '12px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center'
                }}
              >
                <span>2. Search Hospital Catalogue & Add Items</span>
                <span style={{ fontSize: '11px', color: '#2563EB', fontWeight: 600 }}>
                  Hospital Master Configured Items Only
                </span>
              </div>

              {/* Item Search Input */}
              <div style={{ position: 'relative', marginBottom: '14px' }}>
                <input
                  type="text"
                  placeholder="Search hospital selected item by code, generic name, brand, or manufacturer..."
                  value={itemSearch}
                  onChange={(e) => {
                    setItemSearch(e.target.value);
                    if (!e.target.value) setSelectedItem(null);
                  }}
                  autoComplete="off"
                  style={{
                    width: '100%',
                    padding: '10px 14px',
                    borderRadius: '8px',
                    border: '1px solid #94A3B8',
                    fontSize: '13px'
                  }}
                />
                {searchLoading && (
                  <span
                    style={{
                      position: 'absolute',
                      right: '12px',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      fontSize: '13px',
                      color: '#64748B'
                    }}
                  >
                    ⏳ Searching...
                  </span>
                )}

                {/* Dropdown Results */}
                {showResults && itemResults.length > 0 && (
                  <div
                    style={{
                      position: 'absolute',
                      top: '100%',
                      left: 0,
                      right: 0,
                      zIndex: 1000,
                      backgroundColor: '#FFFFFF',
                      border: '1px solid #CBD5E1',
                      borderRadius: '10px',
                      boxShadow: '0 10px 25px rgba(0,0,0,0.15)',
                      maxHeight: '260px',
                      overflowY: 'auto',
                      marginTop: '4px'
                    }}
                  >
                    {itemResults.map(item => (
                      <button
                        key={item.itemMasterId}
                        type="button"
                        onClick={() => handleSelectItem(item)}
                        style={{
                          display: 'block',
                          width: '100%',
                          textAlign: 'left',
                          padding: '10px 14px',
                          border: 'none',
                          background: 'transparent',
                          cursor: 'pointer',
                          borderBottom: '1px solid #F1F5F9'
                        }}
                        onMouseEnter={e => e.currentTarget.style.background = '#F8FAFC'}
                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span
                            style={{
                              fontFamily: 'monospace',
                              fontWeight: 700,
                              color: '#2563EB',
                              background: '#EFF6FF',
                              padding: '2px 6px',
                              borderRadius: '4px',
                              fontSize: '11px'
                            }}
                          >
                            {item.itemCode}
                          </span>
                          <span
                            style={{
                              background: '#DCFCE7',
                              color: '#166534',
                              fontSize: '10px',
                              fontWeight: 700,
                              padding: '1px 6px',
                              borderRadius: '8px'
                            }}
                          >
                            ✓ Hospital Selected
                          </span>
                          {item.category && (
                            <span style={{ fontSize: '11px', color: '#64748B' }}>{item.category}</span>
                          )}
                        </div>
                        <div style={{ fontWeight: 700, color: '#0F172A', fontSize: '13px', marginTop: '4px' }}>
                          {item.genericName} {item.brandName ? `(${item.brandName})` : ''}
                        </div>
                        <div style={{ fontSize: '11px', color: '#64748B' }}>
                          <span>1 {item.purchasedUnit} = {item.converterFactor} {item.consumptionUnit}s</span>
                          {item.packSize && <span> · {item.packSize}</span>}
                          {item.manufacturer && <span> · Mfg: {item.manufacturer}</span>}
                          <span> · Default GST: {item.defaultGst || 12}%</span>
                        </div>
                      </button>
                    ))}
                  </div>
                )}

                {showResults && itemResults.length === 0 && !searchLoading && itemSearch.length >= 2 && (
                  <div
                    style={{
                      position: 'absolute',
                      top: '100%',
                      left: 0,
                      right: 0,
                      zIndex: 1000,
                      backgroundColor: '#FFFFFF',
                      border: '1px solid #CBD5E1',
                      borderRadius: '10px',
                      padding: '14px',
                      fontSize: '13px',
                      color: '#64748B',
                      marginTop: '4px',
                      boxShadow: '0 8px 20px rgba(0,0,0,0.1)'
                    }}
                  >
                    No hospital-selected items found matching "{itemSearch}". Only items actively configured in your hospital catalogue can be quoted.
                  </div>
                )}
              </div>

              {/* Selected Item Read-Only Information & Line Inputs */}
              {selectedItem && (
                <div
                  style={{
                    background: '#F8FAFC',
                    border: '1px solid #E2E8F0',
                    borderRadius: '10px',
                    padding: '14px',
                    marginBottom: '14px'
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      flexWrap: 'wrap',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      gap: '10px',
                      marginBottom: '12px',
                      paddingBottom: '8px',
                      borderBottom: '1px solid #E2E8F0'
                    }}
                  >
                    <div>
                      <span
                        style={{
                          fontFamily: 'monospace',
                          fontWeight: 700,
                          color: '#2563EB',
                          background: '#EFF6FF',
                          padding: '2px 8px',
                          borderRadius: '4px',
                          fontSize: '12px'
                        }}
                      >
                        {selectedItem.itemCode}
                      </span>
                      <strong style={{ marginLeft: '10px', fontSize: '14px', color: '#0F172A' }}>
                        {selectedItem.genericName}
                      </strong>
                      {selectedItem.brandName && (
                        <span style={{ fontSize: '12px', color: '#64748B', marginLeft: '6px' }}>
                          ({selectedItem.brandName})
                        </span>
                      )}
                    </div>

                    <div style={{ fontSize: '12px', color: '#475569' }}>
                      Packaging: <strong>1 {selectedItem.purchasedUnit} = {selectedItem.converterFactor} {selectedItem.consumptionUnit}s</strong>
                      {selectedItem.manufacturer && <span> · Mfg: {selectedItem.manufacturer}</span>}
                    </div>
                  </div>

                  {/* Line Inputs */}
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
                      gap: '12px',
                      alignItems: 'flex-end'
                    }}
                  >
                    <div>
                      <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: '#334155', marginBottom: '4px' }}>
                        Rate / {selectedItem.purchasedUnit || 'Unit'} (₹) *
                      </label>
                      <input
                        type="number"
                        step="any"
                        min="0.01"
                        placeholder="e.g. 150.00"
                        value={lineInput.ratePerPurchasedUnit}
                        onChange={(e) => setLineInput(prev => ({ ...prev, ratePerPurchasedUnit: e.target.value }))}
                        style={{
                          width: '100%',
                          padding: '8px 10px',
                          borderRadius: '6px',
                          border: '1px solid #CBD5E1',
                          fontSize: '13px',
                          fontWeight: 700
                        }}
                      />
                    </div>

                    <div>
                      <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: '#334155', marginBottom: '4px' }}>
                        Disc %
                      </label>
                      <input
                        type="number"
                        step="any"
                        min="0"
                        max="100"
                        value={lineInput.discountPercent}
                        onChange={(e) => setLineInput(prev => ({ ...prev, discountPercent: e.target.value }))}
                        style={{
                          width: '100%',
                          padding: '8px 10px',
                          borderRadius: '6px',
                          border: '1px solid #CBD5E1',
                          fontSize: '13px'
                        }}
                      />
                    </div>

                    <div>
                      <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: '#334155', marginBottom: '4px' }}>
                        GST %
                      </label>
                      <input
                        type="number"
                        step="any"
                        min="0"
                        max="100"
                        value={lineInput.gstPercent}
                        onChange={(e) => setLineInput(prev => ({ ...prev, gstPercent: e.target.value }))}
                        style={{
                          width: '100%',
                          padding: '8px 10px',
                          borderRadius: '6px',
                          border: '1px solid #CBD5E1',
                          fontSize: '13px'
                        }}
                      />
                    </div>

                    <div>
                      <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: '#334155', marginBottom: '4px' }}>
                        MRP (₹)
                      </label>
                      <input
                        type="number"
                        step="any"
                        min="0"
                        placeholder="e.g. 200.00"
                        value={lineInput.mrp}
                        onChange={(e) => setLineInput(prev => ({ ...prev, mrp: e.target.value }))}
                        style={{
                          width: '100%',
                          padding: '8px 10px',
                          borderRadius: '6px',
                          border: '1px solid #CBD5E1',
                          fontSize: '13px'
                        }}
                      />
                    </div>

                    <div>
                      <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: '#334155', marginBottom: '4px' }}>
                        Min Qty
                      </label>
                      <input
                        type="number"
                        min="1"
                        value={lineInput.minimumOrderQty}
                        onChange={(e) => setLineInput(prev => ({ ...prev, minimumOrderQty: e.target.value }))}
                        style={{
                          width: '100%',
                          padding: '8px 10px',
                          borderRadius: '6px',
                          border: '1px solid #CBD5E1',
                          fontSize: '13px'
                        }}
                      />
                    </div>

                    <div>
                      <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: '#334155', marginBottom: '4px' }}>
                        Lead (Days)
                      </label>
                      <input
                        type="number"
                        min="1"
                        value={lineInput.leadTimeDays}
                        onChange={(e) => setLineInput(prev => ({ ...prev, leadTimeDays: e.target.value }))}
                        style={{
                          width: '100%',
                          padding: '8px 10px',
                          borderRadius: '6px',
                          border: '1px solid #CBD5E1',
                          fontSize: '13px'
                        }}
                      />
                    </div>

                    <div>
                      <button
                        type="button"
                        onClick={handleAddLineItem}
                        style={{
                          width: '100%',
                          padding: '8px 12px',
                          borderRadius: '6px',
                          border: 'none',
                          background: '#166534',
                          color: '#FFFFFF',
                          fontSize: '12px',
                          fontWeight: 700,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '6px'
                        }}
                      >
                        <span>+</span> Add Line
                      </button>
                    </div>
                  </div>

                  {/* Live calculations preview for line */}
                  <div
                    style={{
                      marginTop: '10px',
                      display: 'flex',
                      flexWrap: 'wrap',
                      gap: '14px',
                      fontSize: '11.5px',
                      color: '#166534'
                    }}
                  >
                    <span>Net Rate / {selectedItem.purchasedUnit}: <strong>₹{currentCalcs.netPurchased.toFixed(2)}</strong></span>
                    <span>•</span>
                    <span>Rate / {selectedItem.consumptionUnit}: <strong>₹{currentCalcs.consumptionRate.toFixed(4)}</strong></span>
                    <span>•</span>
                    <span>Net Effective Cost / {selectedItem.consumptionUnit}: <strong style={{ fontWeight: 800 }}>₹{currentCalcs.netEffective.toFixed(4)}</strong></span>
                  </div>
                </div>
              )}

              {/* Added Lines Table */}
              <div>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: '8px'
                  }}
                >
                  <span style={{ fontSize: '12px', fontWeight: 700, color: '#334155' }}>
                    Quotation Line Items ({quotationItems.length})
                  </span>
                  {quotationItems.length > 0 && (
                    <span style={{ fontSize: '11px', color: '#166534', fontWeight: 600 }}>
                      ✓ All lines will be saved under Quotation #{headerData.quotationNo || 'Auto'}
                    </span>
                  )}
                </div>

                {quotationItems.length === 0 ? (
                  <div
                    style={{
                      padding: '24px',
                      border: '1px dashed #CBD5E1',
                      borderRadius: '8px',
                      textAlign: 'center',
                      color: '#64748B',
                      fontSize: '12.5px'
                    }}
                  >
                    No items added yet. Search a hospital item above, set commercial rates, and click "Add Line".
                  </div>
                ) : (
                  <div style={{ border: '1px solid #E2E8F0', borderRadius: '8px', overflow: 'hidden' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                      <thead>
                        <tr style={{ background: '#F8FAFC', borderBottom: '1px solid #E2E8F0' }}>
                          <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 700, color: '#475569' }}>#</th>
                          <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 700, color: '#475569' }}>Item & Code</th>
                          <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 700, color: '#475569' }}>Packaging</th>
                          <th style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 700, color: '#475569' }}>Purchased Rate</th>
                          <th style={{ padding: '8px 12px', textAlign: 'center', fontWeight: 700, color: '#475569' }}>Disc / GST</th>
                          <th style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 700, color: '#166534', background: '#F0FDF4' }}>Net Effective / Unit</th>
                          <th style={{ padding: '8px 12px', textAlign: 'center', fontWeight: 700, color: '#475569' }}>Min / Lead</th>
                          <th style={{ padding: '8px 12px', textAlign: 'center', fontWeight: 700, color: '#DC2626' }}>Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {quotationItems.map((line, idx) => (
                          <tr key={line.itemMasterId} style={{ borderBottom: '1px solid #F1F5F9' }}>
                            <td style={{ padding: '8px 12px', color: '#64748B' }}>{idx + 1}</td>
                            <td style={{ padding: '8px 12px' }}>
                              <div style={{ fontWeight: 700, color: '#0F172A' }}>{line.genericName}</div>
                              <div style={{ fontFamily: 'monospace', fontSize: '11px', color: '#2563EB' }}>{line.itemCode}</div>
                            </td>
                            <td style={{ padding: '8px 12px', color: '#475569' }}>
                              1 {line.purchasedUnit} = {line.converterFactor} {line.consumptionUnit}
                            </td>
                            <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 700, color: '#0F172A' }}>
                              ₹{Number(line.ratePerPurchasedUnit).toFixed(2)}
                            </td>
                            <td style={{ padding: '8px 12px', textAlign: 'center', color: '#475569' }}>
                              {line.discountPercent}% / {line.gstPercent}%
                            </td>
                            <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 800, color: '#15803D', background: '#F0FDF4' }}>
                              ₹{Number(line.netEffectiveRate).toFixed(4)}
                            </td>
                            <td style={{ padding: '8px 12px', textAlign: 'center', color: '#64748B' }}>
                              {line.minimumOrderQty} / {line.leadTimeDays}d
                            </td>
                            <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                              <button
                                type="button"
                                onClick={() => handleRemoveLineItem(idx)}
                                style={{
                                  background: '#FEE2E2',
                                  color: '#DC2626',
                                  border: 'none',
                                  borderRadius: '4px',
                                  padding: '3px 8px',
                                  fontSize: '11px',
                                  fontWeight: 700,
                                  cursor: 'pointer'
                                }}
                                title="Remove line"
                              >
                                ✕
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* SECTION 3: COMMERCIAL TERMS & SUPERSEDING */}
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: '14px',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '12px 16px',
              background: '#F8FAFC',
              borderRadius: '10px',
              border: '1px solid #E2E8F0'
            }}
          >
            <div style={{ flex: '1 1 300px' }}>
              <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: '#475569', marginBottom: '4px' }}>
                Commercial Terms & Notes
              </label>
              <input
                type="text"
                placeholder="e.g. Free delivery on orders > ₹10,000. Payment within 30 days."
                value={headerData.termsAndConditions}
                onChange={(e) => setHeaderData(prev => ({ ...prev, termsAndConditions: e.target.value }))}
                style={{
                  width: '100%',
                  padding: '7px 10px',
                  borderRadius: '6px',
                  border: '1px solid #CBD5E1',
                  fontSize: '12px'
                }}
              />
            </div>

            {!editingQuotation && (
              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  fontSize: '12px',
                  fontWeight: 600,
                  color: '#334155',
                  cursor: 'pointer'
                }}
              >
                <input
                  type="checkbox"
                  checked={headerData.supersedePrevious}
                  onChange={(e) => setHeaderData(prev => ({ ...prev, supersedePrevious: e.target.checked }))}
                />
                <span>Automatically mark previous active quotes from this vendor for these items as Superseded</span>
              </label>
            )}
          </div>
        </div>

        {/* ── MODAL FOOTER ── */}
        <div
          style={{
            padding: '14px 24px',
            borderTop: '1px solid #E2E8F0',
            background: '#F8FAFC',
            display: 'flex',
            justifyContent: 'flex-end',
            alignItems: 'center',
            gap: '12px'
          }}
        >
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            style={{
              padding: '8px 16px',
              borderRadius: '8px',
              border: '1px solid #CBD5E1',
              background: '#FFFFFF',
              color: '#334155',
              fontSize: '13px',
              fontWeight: 600,
              cursor: 'pointer'
            }}
          >
            Cancel
          </button>

          <button
            type="submit"
            disabled={saving || (eligibleVendors.length === 0 && !editingQuotation)}
            style={{
              padding: '8px 20px',
              borderRadius: '8px',
              border: 'none',
              background: saving ? '#94A3B8' : '#2563EB',
              color: '#FFFFFF',
              fontSize: '13px',
              fontWeight: 700,
              cursor: saving ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            {saving ? (
              <span>Saving Quotation...</span>
            ) : editingQuotation ? (
              <span>Update Quotation</span>
            ) : (
              <span>Save Quotation ({quotationItems.length || (selectedItem ? 1 : 0)} items)</span>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
