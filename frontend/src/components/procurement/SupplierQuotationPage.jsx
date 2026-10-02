import React, { useState, useEffect, useRef } from 'react';
import api from '../../utils/api';

/**
 * ============================================================================
 * QUROXA — SUPPLIER QUOTATION IN-PAGE COMPONENT
 * ============================================================================
 * Authoritative, in-page full screen enterprise quotation form.
 * Faithfully mirrors the Reference "Supplier Quotation" UI layout:
 * 1. Title: "Supplier Quotation"
 * 2. Section: "Supplier And Location Detail"
 * 3. Section: "Item Detail" (Search options: By First Name, In Between, Item Code)
 * 4. Section: "Added Item" (Dense grid with live Rate, Disc, IGST/CGST/SGST, Tax Amount, Net Rate)
 * 5. Section: "Terms & Conditions" (Multi-term line builder)
 * 6. Section: "Add Document" (Document attachment)
 * 7. Action Buttons: [ Save ] [ Reset ]
 */
export default function SupplierQuotationPage({
  editingQuotation = null,
  onBackToList = () => {},
  onSaveSuccess = () => {},
  showToast = () => {}
}) {
  // ── Eligible Vendors & Items ──
  const [vendors, setVendors] = useState([]);
  const [loadingVendors, setLoadingVendors] = useState(false);

  // Section 1: Supplier And Location Detail
  const [supplierDetails, setSupplierDetails] = useState({
    vendorId: '',
    supplierName: '',
    supplierState: '',
    gstNo: '',
    supplierAddress: '',
    supplierType: '',
    deliveryState: 'Haryana',
    centreType: 'B2B, Collection Centre, HLM, NRL, PUP, RRL, STAT',
    centre: 'All selected',
    deliveryLocation: 'GURUGRAM MAIN STORE',
    fromDate: new Date().toISOString().split('T')[0],
    toDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    refNo: '',
    quotationNo: ''
  });

  // Section 2: Item Detail & Search
  const [machineFilter, setMachineFilter] = useState('');
  const [searchOption, setSearchOption] = useState('inBetween'); // 'firstName' | 'inBetween' | 'itemCode'
  const [itemSearchText, setItemSearchText] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const searchTimer = useRef(null);

  // Currently selected item staged to be added
  const [stagedItem, setStagedItem] = useState(null);
  const [stagedInputs, setStagedInputs] = useState({
    manufacturer: '',
    machine: 'Manual',
    packSize: '',
    catalogNo: ''
  });

  // Section 3: Added Items Table
  const [addedItems, setAddedItems] = useState([]);

  // Section 4: Terms & Conditions
  const [termInput, setTermInput] = useState('');
  const [termsList, setTermsList] = useState([]);

  // Section 5: Documents
  const [documents, setDocuments] = useState([]);
  const fileInputRef = useRef(null);

  // General States
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // ── 1. Load Eligible Vendors ──
  useEffect(() => {
    let isMounted = true;
    async function loadVendors() {
      setLoadingVendors(true);
      try {
        const res = await api.get('/vendor-quotations/eligible-vendors');
        if (res.data && res.data.success && isMounted) {
          const list = res.data.data || [];
          setVendors(list);
          if (!editingQuotation && list.length > 0 && !supplierDetails.vendorId) {
            handleVendorChange(list[0]._id, list);
          }
        }
      } catch (err) {
        console.warn('Failed to load eligible vendors:', err.message);
      } finally {
        if (isMounted) setLoadingVendors(false);
      }
    }
    loadVendors();
    return () => { isMounted = false; };
  }, [editingQuotation]);

  // Handle vendor dropdown selection
  const handleVendorChange = (vendorId, vendorList = vendors) => {
    const v = vendorList.find(x => x._id === vendorId);
    if (v) {
      setSupplierDetails(prev => ({
        ...prev,
        vendorId: v._id,
        supplierName: v.name,
        supplierState: v.state || v.city || 'Haryana',
        gstNo: v.gstNo || '',
        supplierAddress: v.address || '',
        supplierType: v.type || v.category || 'Manufacturer'
      }));
    } else {
      setSupplierDetails(prev => ({
        ...prev,
        vendorId: '',
        supplierName: '',
        supplierState: '',
        gstNo: '',
        supplierAddress: '',
        supplierType: ''
      }));
    }
  };

  // ── 2. Populate for Edit Mode ──
  useEffect(() => {
    if (!editingQuotation) return;

    const vId = editingQuotation.vendorId?._id || editingQuotation.vendorId || '';
    setSupplierDetails({
      vendorId: vId,
      supplierName: editingQuotation.vendorName || '',
      supplierState: editingQuotation.supplierState || '',
      gstNo: editingQuotation.gstNo || '',
      supplierAddress: editingQuotation.supplierAddress || '',
      supplierType: editingQuotation.supplierType || 'Manufacturer',
      deliveryState: editingQuotation.deliveryState || 'Haryana',
      centreType: editingQuotation.centreType || 'B2B, Collection Centre, HLM, NRL, PUP, RRL, STAT',
      centre: editingQuotation.centre || 'All selected',
      deliveryLocation: editingQuotation.deliveryLocation || 'GURUGRAM MAIN STORE',
      fromDate: editingQuotation.effectiveFrom ? new Date(editingQuotation.effectiveFrom).toISOString().split('T')[0] : '',
      toDate: editingQuotation.validTill ? new Date(editingQuotation.validTill).toISOString().split('T')[0] : '',
      refNo: editingQuotation.referenceNo || '',
      quotationNo: editingQuotation.quotationNo || ''
    });

    const pRate = Number(editingQuotation.ratePerPurchasedUnit) || 0;
    const disc = Number(editingQuotation.discountPercent) || 0;
    const discAmt = pRate * (disc / 100);
    const taxable = pRate - discAmt;
    const gstTotal = Number(editingQuotation.gstPercent) || 0;
    const cgst = editingQuotation.cgstPercent !== undefined ? Number(editingQuotation.cgstPercent) : gstTotal / 2;
    const sgst = editingQuotation.sgstPercent !== undefined ? Number(editingQuotation.sgstPercent) : gstTotal / 2;
    const igst = Number(editingQuotation.igstPercent || 0);
    const gstAmt = taxable * (gstTotal / 100);
    const factor = Number(editingQuotation.converterFactor) || 1;
    const netPurchased = taxable + gstAmt;
    const netEff = netPurchased / factor;

    setAddedItems([{
      _id: editingQuotation._id,
      itemMasterId: editingQuotation.itemMasterId?._id || editingQuotation.itemMasterId,
      hospitalMasterConfigId: editingQuotation.hospitalMasterConfigId,
      itemCategory: editingQuotation.category || 'General',
      itemCode: editingQuotation.itemCode,
      itemName: `${editingQuotation.genericName} ${editingQuotation.brandName ? `(${editingQuotation.brandName})` : ''}`,
      genericName: editingQuotation.genericName,
      brandName: editingQuotation.brandName || '',
      hsnCode: editingQuotation.hsnCode || '',
      manufacturer: editingQuotation.manufacturer || '',
      catalogNo: editingQuotation.catalogNo || '',
      machine: editingQuotation.machine || 'Manual',
      purchasedUnit: editingQuotation.purchasedUnit || 'Box',
      packSize: editingQuotation.packSize || `1 Box = ${factor} Units`,
      converterFactor: factor,
      consumptionUnit: editingQuotation.consumptionUnit || 'Unit',
      rate: pRate,
      discountPercent: disc,
      discountAmount: Math.round(discAmt * 100) / 100,
      igstPercent: igst,
      cgstPercent: cgst,
      sgstPercent: sgst,
      totalGstPercent: gstTotal,
      totalGstAmount: Math.round(gstAmt * 100) / 100,
      netEffectiveRate: Math.round(netEff * 10000) / 10000
    }]);

    if (Array.isArray(editingQuotation.termsList) && editingQuotation.termsList.length > 0) {
      setTermsList(editingQuotation.termsList);
    } else if (editingQuotation.termsAndConditions) {
      setTermsList([editingQuotation.termsAndConditions]);
    }

    if (Array.isArray(editingQuotation.documents)) {
      setDocuments(editingQuotation.documents);
    }
  }, [editingQuotation]);

  // ── 3. Debounced Search in Hospital Catalogue (HospitalMasterConfig) ──
  useEffect(() => {
    if (!itemSearchText.trim() || itemSearchText.length < 2) {
      setSearchResults([]);
      setShowDropdown(false);
      return;
    }

    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(async () => {
      setSearchLoading(true);
      try {
        const res = await api.get('/vendor-quotations/eligible-items', {
          params: { search: itemSearchText.trim(), limit: 40 }
        });
        if (res.data && res.data.success) {
          let list = res.data.data || [];

          // Apply radio search filter semantics
          const term = itemSearchText.trim().toLowerCase();
          if (searchOption === 'firstName') {
            list = list.filter(it => (it.itemName || it.genericName || '').toLowerCase().startsWith(term));
          } else if (searchOption === 'itemCode') {
            list = list.filter(it => (it.itemCode || '').toLowerCase().includes(term));
          } else {
            // In Between: default substring match
            list = list.filter(it =>
              (it.itemName || it.genericName || '').toLowerCase().includes(term) ||
              (it.itemCode || '').toLowerCase().includes(term)
            );
          }

          setSearchResults(list);
          setShowDropdown(true);
        }
      } catch (err) {
        console.warn('Eligible items search error:', err.message);
      } finally {
        setSearchLoading(false);
      }
    }, 250);

    return () => clearTimeout(searchTimer.current);
  }, [itemSearchText, searchOption]);

  const handleSelectItem = (item) => {
    // Check if already in addedItems
    const exists = addedItems.some(x => String(x.itemMasterId) === String(item.itemMasterId));
    if (exists) {
      setError(`Item '${item.genericName}' (${item.itemCode}) is already in the Added Item list.`);
      return;
    }

    setStagedItem(item);
    setItemSearchText(`${item.itemCode} — ${item.itemName || item.genericName}`);
    setShowDropdown(false);
    setError('');

    setStagedInputs({
      manufacturer: item.manufacturer || '',
      machine: 'Manual',
      packSize: item.packSize || `1 ${item.purchasedUnit} = ${item.converterFactor} ${item.consumptionUnit}`,
      catalogNo: ''
    });
  };

  // ── 4. Add Staged Item to Added Item Table ──
  const handleAddItemToGrid = () => {
    if (!stagedItem) {
      setError('Please search and select an item from the hospital catalogue first.');
      return;
    }

    const exists = addedItems.some(x => String(x.itemMasterId) === String(stagedItem.itemMasterId));
    if (exists) {
      setError(`Item '${stagedItem.genericName}' (${stagedItem.itemCode}) is already in the Added Item list.`);
      return;
    }

    const defaultRate = Number(stagedItem.hospitalCost) || 100;
    const defaultGst = Number(stagedItem.defaultGst) || 12;
    const cgst = defaultGst / 2;
    const sgst = defaultGst / 2;
    const discAmt = 0;
    const gstAmt = defaultRate * (defaultGst / 100);
    const factor = Number(stagedItem.converterFactor) || 1;
    const netPurchased = defaultRate + gstAmt;
    const netEff = netPurchased / factor;

    const newItem = {
      itemMasterId: stagedItem.itemMasterId,
      hospitalMasterConfigId: stagedItem.hospitalMasterConfigId,
      itemCategory: stagedItem.category || 'General',
      itemCode: stagedItem.itemCode,
      itemName: `${stagedItem.itemName || stagedItem.genericName} ${stagedItem.brandName ? `(${stagedItem.brandName})` : ''}`,
      genericName: stagedItem.genericName,
      brandName: stagedItem.brandName || '',
      hsnCode: stagedItem.hsnCode || '',
      manufacturer: stagedInputs.manufacturer || stagedItem.manufacturer || '',
      catalogNo: stagedInputs.catalogNo || '',
      machine: stagedInputs.machine || 'Manual',
      purchasedUnit: stagedItem.purchasedUnit || 'Box',
      packSize: stagedInputs.packSize || stagedItem.packSize || `1`,
      converterFactor: factor,
      consumptionUnit: stagedItem.consumptionUnit || 'Unit',
      rate: defaultRate,
      discountPercent: 0,
      discountAmount: 0,
      igstPercent: 0,
      cgstPercent: cgst,
      sgstPercent: sgst,
      totalGstPercent: defaultGst,
      totalGstAmount: Math.round(gstAmt * 100) / 100,
      netEffectiveRate: Math.round(netEff * 10000) / 10000
    };

    setAddedItems(prev => [...prev, newItem]);
    setStagedItem(null);
    setItemSearchText('');
    setStagedInputs({ manufacturer: '', machine: 'Manual', packSize: '', catalogNo: '' });
    setError('');
  };

  // ── 5. Real-Time In-Grid Calculation Handler ──
  const handleGridCellChange = (index, field, value) => {
    setAddedItems(prev => {
      const copy = [...prev];
      const row = { ...copy[index] };

      if (field === 'rate') {
        row.rate = Math.max(0, Number(value) || 0);
      } else if (field === 'discountPercent') {
        row.discountPercent = Math.max(0, Math.min(100, Number(value) || 0));
      } else if (field === 'cgstPercent') {
        row.cgstPercent = Math.max(0, Math.min(100, Number(value) || 0));
        row.sgstPercent = row.cgstPercent; // Keep SGST synced
        row.igstPercent = 0;
        row.totalGstPercent = row.cgstPercent + row.sgstPercent;
      } else if (field === 'sgstPercent') {
        row.sgstPercent = Math.max(0, Math.min(100, Number(value) || 0));
        row.cgstPercent = row.sgstPercent;
        row.igstPercent = 0;
        row.totalGstPercent = row.cgstPercent + row.sgstPercent;
      } else if (field === 'igstPercent') {
        row.igstPercent = Math.max(0, Math.min(100, Number(value) || 0));
        row.cgstPercent = 0;
        row.sgstPercent = 0;
        row.totalGstPercent = row.igstPercent;
      } else {
        row[field] = value;
      }

      // Recompute Row Totals
      const rate = Number(row.rate) || 0;
      const discPct = Number(row.discountPercent) || 0;
      const discAmt = rate * (discPct / 100);
      const taxable = rate - discAmt;
      const gstPct = Number(row.totalGstPercent) || 0;
      const gstAmt = taxable * (gstPct / 100);
      const factor = Number(row.converterFactor) || 1;
      const netPurchased = taxable + gstAmt;
      const netEff = netPurchased / factor;

      row.discountAmount = Math.round(discAmt * 100) / 100;
      row.totalGstAmount = Math.round(gstAmt * 100) / 100;
      row.netEffectiveRate = Math.round(netEff * 10000) / 10000;

      copy[index] = row;
      return copy;
    });
  };

  const handleToggleTaxType = (index) => {
    setAddedItems(prev => {
      const copy = [...prev];
      const row = { ...copy[index] };
      if (row.igstPercent > 0) {
        // Switch to CGST + SGST
        const half = row.igstPercent / 2;
        row.cgstPercent = half;
        row.sgstPercent = half;
        row.igstPercent = 0;
      } else {
        // Switch to IGST
        row.igstPercent = (row.cgstPercent || 0) + (row.sgstPercent || 0);
        row.cgstPercent = 0;
        row.sgstPercent = 0;
      }
      copy[index] = row;
      return copy;
    });
  };

  const handleRemoveAddedItem = (index) => {
    setAddedItems(prev => prev.filter((_, idx) => idx !== index));
  };

  // ── 6. Terms & Conditions Handler ──
  const handleAddTerm = () => {
    if (!termInput.trim()) return;
    setTermsList(prev => [...prev, termInput.trim()]);
    setTermInput('');
  };

  const handleRemoveTerm = (index) => {
    setTermsList(prev => prev.filter((_, idx) => idx !== index));
  };

  // ── 7. Document Attachment Handler ──
  const handleFileUpload = (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    const newDocs = files.map(f => ({
      name: f.name,
      size: `${(f.size / 1024).toFixed(1)} KB`,
      uploadedAt: new Date().toISOString()
    }));
    setDocuments(prev => [...prev, ...newDocs]);
  };

  const handleRemoveDocument = (index) => {
    setDocuments(prev => prev.filter((_, idx) => idx !== index));
  };

  // ── 8. Reset Handler ──
  const handleReset = () => {
    if (window.confirm('Are you sure you want to reset all quotation fields?')) {
      setAddedItems([]);
      setTermsList([]);
      setDocuments([]);
      setStagedItem(null);
      setItemSearchText('');
      setError('');
    }
  };

  // ── 9. Submit / Save Quotation ──
  const handleSave = async () => {
    if (!supplierDetails.vendorId) {
      setError('Please select a Supplier Name from associated vendors.');
      return;
    }
    if (!supplierDetails.toDate) {
      setError('To Date (Validity Expiry) is required.');
      return;
    }
    if (addedItems.length === 0) {
      setError('Please add at least one item to the Added Item list.');
      return;
    }

    try {
      setSaving(true);
      setError('');

      if (editingQuotation && editingQuotation._id) {
        // Edit Single Item Mode
        const itemLine = addedItems[0];
        const payload = {
          vendorId: supplierDetails.vendorId,
          referenceNo: supplierDetails.refNo,
          validFrom: supplierDetails.fromDate,
          validTill: supplierDetails.toDate,
          supplierState: supplierDetails.supplierState,
          supplierAddress: supplierDetails.supplierAddress,
          supplierType: supplierDetails.supplierType,
          deliveryState: supplierDetails.deliveryState,
          centreType: supplierDetails.centreType,
          centre: supplierDetails.centre,
          deliveryLocation: supplierDetails.deliveryLocation,
          catalogNo: itemLine.catalogNo,
          machine: itemLine.machine,
          ratePerPurchasedUnit: Number(itemLine.rate),
          discountPercent: Number(itemLine.discountPercent) || 0,
          discountAmount: Number(itemLine.discountAmount) || 0,
          igstPercent: Number(itemLine.igstPercent) || 0,
          cgstPercent: Number(itemLine.cgstPercent) || 0,
          sgstPercent: Number(itemLine.sgstPercent) || 0,
          gstPercent: Number(itemLine.totalGstPercent) || 0,
          gstAmount: Number(itemLine.totalGstAmount) || 0,
          termsAndConditions: termsList.join('; '),
          termsList,
          documents
        };

        await api.put(`/vendor-quotations/${editingQuotation._id}`, payload);
        if (showToast) showToast('Supplier Quotation updated successfully', 'success');
      } else {
        // Batch Multi-Item Creation Mode
        const itemsPayload = addedItems.map(it => ({
          hospitalMasterConfigId: it.hospitalMasterConfigId,
          itemMasterId: it.itemMasterId,
          itemCode: it.itemCode,
          catalogNo: it.catalogNo,
          machine: it.machine,
          ratePerPurchasedUnit: Number(it.rate),
          discountPercent: Number(it.discountPercent) || 0,
          discountAmount: Number(it.discountAmount) || 0,
          igstPercent: Number(it.igstPercent) || 0,
          cgstPercent: Number(it.cgstPercent) || 0,
          sgstPercent: Number(it.sgstPercent) || 0,
          gstPercent: Number(it.totalGstPercent) || 0,
          gstAmount: Number(it.totalGstAmount) || 0
        }));

        const payload = {
          vendorId: supplierDetails.vendorId,
          quotationNo: supplierDetails.quotationNo ? supplierDetails.quotationNo.trim() : undefined,
          referenceNo: supplierDetails.refNo ? supplierDetails.refNo.trim() : undefined,
          validFrom: supplierDetails.fromDate,
          validTill: supplierDetails.toDate,
          supplierState: supplierDetails.supplierState,
          supplierAddress: supplierDetails.supplierAddress,
          supplierType: supplierDetails.supplierType,
          gstNo: supplierDetails.gstNo,
          deliveryState: supplierDetails.deliveryState,
          centreType: supplierDetails.centreType,
          centre: supplierDetails.centre,
          deliveryLocation: supplierDetails.deliveryLocation,
          machine: machineFilter,
          termsAndConditions: termsList.join('; '),
          termsList,
          documents,
          items: itemsPayload
        };

        const res = await api.post('/vendor-quotations', payload);
        const count = res.data?.count || addedItems.length;
        if (showToast) {
          showToast(`Supplier Quotation saved successfully (${count} line items)`, 'success');
        }
      }

      onSaveSuccess();
      onBackToList();
    } catch (err) {
      console.error('Save Supplier Quotation error:', err);
      const msg = err.response?.data?.error || err.response?.data?.message || err.message || 'Failed to save supplier quotation.';
      setError(msg);
      if (showToast) showToast(msg, 'error');
    } finally {
      setSaving(false);
    }
  };

  // ── 10. Compute Summary Totals ──
  const totalItemsCount = addedItems.length;
  const totalGrossRate = addedItems.reduce((acc, it) => acc + (Number(it.rate) || 0), 0);
  const totalDiscountAmt = addedItems.reduce((acc, it) => acc + (Number(it.discountAmount) || 0), 0);
  const totalGstAmt = addedItems.reduce((acc, it) => acc + (Number(it.totalGstAmount) || 0), 0);
  const grandNetEffective = addedItems.reduce((acc, it) => acc + (Number(it.netEffectiveRate) || 0), 0);

  return (
    <div style={{ backgroundColor: '#F8FAFC', minHeight: '100vh', padding: '16px 24px', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      
      {/* ── TOP BREADCRUMB & BACK ACTION ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <button
          type="button"
          onClick={onBackToList}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            background: '#FFFFFF',
            border: '1px solid #CBD5E1',
            borderRadius: '8px',
            padding: '7px 16px',
            fontSize: '13px',
            fontWeight: 600,
            color: '#334155',
            cursor: 'pointer',
            boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
            transition: 'all 0.15s ease'
          }}
          onMouseEnter={e => { e.currentTarget.style.backgroundColor = '#F1F5F9'; e.currentTarget.style.borderColor = '#94A3B8'; }}
          onMouseLeave={e => { e.currentTarget.style.backgroundColor = '#FFFFFF'; e.currentTarget.style.borderColor = '#CBD5E1'; }}
        >
          <span>←</span> Back to Quotation List
        </button>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12.5px', color: '#64748B' }}>
          <span>Procurement</span>
          <span>/</span>
          <span>Commercial Masters</span>
          <span>/</span>
          <span style={{ fontWeight: 600, color: '#0F172A' }}>Supplier Quotation</span>
        </div>
      </div>

      {error && (
        <div style={{ padding: '12px 16px', background: '#FEF2F2', border: '1px solid #FCA5A5', borderRadius: '8px', color: '#991B1B', fontSize: '13px', fontWeight: 600, marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span>⚠️</span>
          <span>{error}</span>
        </div>
      )}

      {/* ── MAIN CARD CONTAINER (MODERN CLEAN CUROXA STYLING) ── */}
      <div style={{ backgroundColor: '#FFFFFF', borderRadius: '12px', border: '1px solid #E2E8F0', boxShadow: '0 4px 20px -2px rgba(0, 0, 0, 0.05)', overflow: 'hidden' }}>
        
        {/* ── TOP TITLE HEADER: "Supplier Quotation" ── */}
        <div
          style={{
            background: '#FFFFFF',
            borderBottom: '1px solid #E2E8F0',
            padding: '14px 20px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: '#EFF6FF', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#2563EB', fontWeight: 800, fontSize: '16px' }}>
              📋
            </div>
            <div>
              <div style={{ fontWeight: 800, fontSize: '16px', color: '#0F172A', letterSpacing: '-0.01em' }}>
                Supplier Quotation
              </div>
              <div style={{ fontSize: '12px', color: '#64748B', marginTop: '1px' }}>
                Hospital-specific vendor commercial pricing & validity agreement
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '11.5px', fontWeight: 600, color: '#059669', background: '#ECFDF5', padding: '3px 10px', borderRadius: '12px', border: '1px solid #A7F3D0' }}>
              ● In-Page Commercial Mode
            </span>
          </div>
        </div>

        {/* ══════════════════════════════════════════════════════════════════════
            SECTION 1: SUPPLIER AND LOCATION DETAIL
           ══════════════════════════════════════════════════════════════════════ */}
        <div>
          <div
            style={{
              background: '#F8FAFC',
              borderBottom: '1px solid #E2E8F0',
              color: '#1E293B',
              fontWeight: 700,
              fontSize: '13px',
              padding: '9px 18px',
              borderLeft: '4px solid #3B82F6',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            <span>Supplier And Location Detail</span>
          </div>

          <div style={{ padding: '16px 20px', backgroundColor: '#FFFFFF', borderBottom: '1px solid #E2E8F0' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(12, 1fr)', gap: '10px 14px', alignItems: 'center', fontSize: '12px' }}>
              
              {/* Row 1: Supplier Name (col 5) | Supplier State (col 3) | GSTN No. (col 4) */}
              <div style={{ gridColumn: 'span 2', fontWeight: 600, color: '#475569' }}>
                Supplier Name <span style={{ color: '#EF4444' }}>*</span> :
              </div>
              <div style={{ gridColumn: 'span 3' }}>
                <select
                  value={supplierDetails.vendorId}
                  onChange={(e) => handleVendorChange(e.target.value)}
                  disabled={loadingVendors || !!editingQuotation}
                  style={{ width: '100%', padding: '6px 10px', fontSize: '12px', border: '1px solid #CBD5E1', borderRadius: '6px', fontWeight: 600, color: '#0F172A', outline: 'none', background: '#FFFFFF' }}
                >
                  <option value="">-- Select Supplier --</option>
                  {vendors.map(v => (
                    <option key={v._id} value={v._id}>
                      {v.name} {v.code ? `(${v.code})` : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div style={{ gridColumn: 'span 2', fontWeight: 600, color: '#475569', textAlign: 'right' }}>
                Supplier State :
              </div>
              <div style={{ gridColumn: 'span 2' }}>
                <input
                  type="text"
                  value={supplierDetails.supplierState}
                  onChange={(e) => setSupplierDetails(prev => ({ ...prev, supplierState: e.target.value }))}
                  style={{ width: '100%', padding: '6px 10px', fontSize: '12px', border: '1px solid #CBD5E1', borderRadius: '6px', background: '#F8FAFC', color: '#334155' }}
                />
              </div>

              <div style={{ gridColumn: 'span 1', fontWeight: 600, color: '#475569', textAlign: 'right' }}>
                GSTN No. :
              </div>
              <div style={{ gridColumn: 'span 2' }}>
                <input
                  type="text"
                  value={supplierDetails.gstNo}
                  onChange={(e) => setSupplierDetails(prev => ({ ...prev, gstNo: e.target.value }))}
                  style={{ width: '100%', padding: '6px 10px', fontSize: '12px', border: '1px solid #CBD5E1', borderRadius: '6px', fontFamily: 'monospace', color: '#0F172A' }}
                />
              </div>

              {/* Row 2: Address (col 5) | Supplier Type (col 7) */}
              <div style={{ gridColumn: 'span 2', fontWeight: 600, color: '#475569' }}>
                Address :
              </div>
              <div style={{ gridColumn: 'span 5' }}>
                <input
                  type="text"
                  value={supplierDetails.supplierAddress}
                  onChange={(e) => setSupplierDetails(prev => ({ ...prev, supplierAddress: e.target.value }))}
                  style={{ width: '100%', padding: '6px 10px', fontSize: '12px', border: '1px solid #CBD5E1', borderRadius: '6px', color: '#0F172A' }}
                />
              </div>

              <div style={{ gridColumn: 'span 2', fontWeight: 600, color: '#475569', textAlign: 'right' }}>
                Supplier Type :
              </div>
              <div style={{ gridColumn: 'span 3' }}>
                <select
                  value={supplierDetails.supplierType}
                  onChange={(e) => setSupplierDetails(prev => ({ ...prev, supplierType: e.target.value }))}
                  style={{ width: '100%', padding: '6px 10px', fontSize: '12px', border: '1px solid #CBD5E1', borderRadius: '6px', color: '#0F172A', background: '#FFFFFF' }}
                >
                  <option value="Manufacturer">Manufacturer</option>
                  <option value="Distributor">Distributor</option>
                  <option value="Trader">Trader</option>
                  <option value="Dealer">Dealer</option>
                  <option value="Service Provider">Service Provider</option>
                </select>
              </div>

              {/* Row 3: Delivery State | Centre Type | Centre */}
              <div style={{ gridColumn: 'span 2', fontWeight: 600, color: '#475569' }}>
                Delivery State :
              </div>
              <div style={{ gridColumn: 'span 3' }}>
                <select
                  value={supplierDetails.deliveryState}
                  onChange={(e) => setSupplierDetails(prev => ({ ...prev, deliveryState: e.target.value }))}
                  style={{ width: '100%', padding: '6px 10px', fontSize: '12px', border: '1px solid #CBD5E1', borderRadius: '6px', color: '#0F172A', background: '#FFFFFF' }}
                >
                  <option value="Haryana">Haryana</option>
                  <option value="Delhi">Delhi</option>
                  <option value="Maharashtra">Maharashtra</option>
                  <option value="Karnataka">Karnataka</option>
                  <option value="Uttar Pradesh">Uttar Pradesh</option>
                </select>
              </div>

              <div style={{ gridColumn: 'span 2', fontWeight: 600, color: '#475569', textAlign: 'right' }}>
                Centre Type :
              </div>
              <div style={{ gridColumn: 'span 2' }}>
                <select
                  value={supplierDetails.centreType}
                  onChange={(e) => setSupplierDetails(prev => ({ ...prev, centreType: e.target.value }))}
                  style={{ width: '100%', padding: '6px 10px', fontSize: '11px', border: '1px solid #CBD5E1', borderRadius: '6px', color: '#0F172A', background: '#FFFFFF' }}
                >
                  <option value="B2B, Collection Centre, HLM, NRL, PUP, RRL, STAT">B2B, Collection Centre, HLM, NRL, PUP, RRL, STAT</option>
                  <option value="Main Hospital Centre">Main Hospital Centre</option>
                  <option value="Central Warehouse">Central Warehouse</option>
                </select>
              </div>

              <div style={{ gridColumn: 'span 1', fontWeight: 600, color: '#475569', textAlign: 'right' }}>
                Centre :
              </div>
              <div style={{ gridColumn: 'span 2' }}>
                <select
                  value={supplierDetails.centre}
                  onChange={(e) => setSupplierDetails(prev => ({ ...prev, centre: e.target.value }))}
                  style={{ width: '100%', padding: '6px 10px', fontSize: '12px', border: '1px solid #CBD5E1', borderRadius: '6px', color: '#0F172A', background: '#FFFFFF' }}
                >
                  <option value="All selected">All selected</option>
                  <option value="Central Pharmacy">Central Pharmacy</option>
                  <option value="Main Store">Main Store</option>
                </select>
              </div>

              {/* Row 4: Delivery Location | From Date | To Date | Ref No. */}
              <div style={{ gridColumn: 'span 2', fontWeight: 600, color: '#475569' }}>
                Delivery Location :
              </div>
              <div style={{ gridColumn: 'span 3' }}>
                <select
                  value={supplierDetails.deliveryLocation}
                  onChange={(e) => setSupplierDetails(prev => ({ ...prev, deliveryLocation: e.target.value }))}
                  style={{ width: '100%', padding: '6px 10px', fontSize: '12px', border: '1px solid #CBD5E1', borderRadius: '6px', color: '#0F172A', background: '#FFFFFF' }}
                >
                  <option value="GURUGRAM MAIN STORE">GURUGRAM MAIN STORE</option>
                  <option value="CENTRAL HOSPITAL STORE">CENTRAL HOSPITAL STORE</option>
                  <option value="PHARMACY WARD STORE">PHARMACY WARD STORE</option>
                </select>
              </div>

              <div style={{ gridColumn: 'span 1', fontWeight: 600, color: '#475569', textAlign: 'right' }}>
                From Date :
              </div>
              <div style={{ gridColumn: 'span 2' }}>
                <input
                  type="date"
                  value={supplierDetails.fromDate}
                  onChange={(e) => setSupplierDetails(prev => ({ ...prev, fromDate: e.target.value }))}
                  style={{ width: '100%', padding: '5px 8px', fontSize: '12px', border: '1px solid #CBD5E1', borderRadius: '6px', color: '#0F172A' }}
                />
              </div>

              <div style={{ gridColumn: 'span 1', fontWeight: 600, color: '#475569', textAlign: 'right' }}>
                To Date <span style={{ color: '#EF4444' }}>*</span> :
              </div>
              <div style={{ gridColumn: 'span 1' }}>
                <input
                  type="date"
                  value={supplierDetails.toDate}
                  onChange={(e) => setSupplierDetails(prev => ({ ...prev, toDate: e.target.value }))}
                  style={{ width: '100%', padding: '5px 8px', fontSize: '12px', border: '1.5px solid #F87171', borderRadius: '6px', fontWeight: 600, color: '#0F172A', background: '#FEF2F2' }}
                />
              </div>

              <div style={{ gridColumn: 'span 1', fontWeight: 600, color: '#475569', textAlign: 'right' }}>
                Ref No. :
              </div>
              <div style={{ gridColumn: 'span 1' }}>
                <input
                  type="text"
                  placeholder="Ref No."
                  value={supplierDetails.refNo}
                  onChange={(e) => setSupplierDetails(prev => ({ ...prev, refNo: e.target.value }))}
                  style={{ width: '100%', padding: '5px 8px', fontSize: '12px', border: '1px solid #CBD5E1', borderRadius: '6px', color: '#0F172A' }}
                />
              </div>

            </div>
          </div>
        </div>

        {/* ══════════════════════════════════════════════════════════════════════
            SECTION 2: ITEM DETAIL (SEARCH & STAGE ITEMS)
           ══════════════════════════════════════════════════════════════════════ */}
        <div>
          <div
            style={{
              background: '#F8FAFC',
              borderBottom: '1px solid #E2E8F0',
              color: '#1E293B',
              fontWeight: 700,
              fontSize: '13px',
              padding: '9px 18px',
              borderLeft: '4px solid #3B82F6',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}
          >
            <span>Item Detail</span>
            <span style={{ fontSize: '11px', color: '#64748B', fontWeight: 600, background: '#F1F5F9', padding: '2px 8px', borderRadius: '4px' }}>
              Hospital Master Configured Catalog Only
            </span>
          </div>

          <div style={{ padding: '16px 20px', backgroundColor: '#FFFFFF', borderBottom: '1px solid #E2E8F0' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(12, 1fr)', gap: '10px 14px', alignItems: 'center', fontSize: '12px' }}>
              
              {/* Row 1: Machine & Add All Item */}
              <div style={{ gridColumn: 'span 2', fontWeight: 600, color: '#475569' }}>
                Machine :
              </div>
              <div style={{ gridColumn: 'span 3', display: 'flex', gap: '8px' }}>
                <select
                  value={machineFilter}
                  onChange={(e) => setMachineFilter(e.target.value)}
                  style={{ flex: 1, padding: '6px 10px', fontSize: '12px', border: '1px solid #CBD5E1', borderRadius: '6px', color: '#0F172A', background: '#FFFFFF' }}
                >
                  <option value="">Select Machine</option>
                  <option value="Manual">Manual</option>
                  <option value="Automated Analyzer">Automated Analyzer</option>
                  <option value="Semi-Automated">Semi-Automated</option>
                </select>
                <button
                  type="button"
                  style={{
                    background: '#F1F5F9',
                    color: '#334155',
                    border: '1px solid #CBD5E1',
                    borderRadius: '6px',
                    padding: '5px 12px',
                    fontSize: '12px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    whiteSpace: 'nowrap'
                  }}
                  onClick={() => showToast('Filtered catalog by machine', 'info')}
                >
                  Add All Item
                </button>
              </div>
              <div style={{ gridColumn: 'span 7' }}></div>

              {/* Row 2: Search Option Radios */}
              <div style={{ gridColumn: 'span 2', fontWeight: 600, color: '#475569' }}>
                Search Option :
              </div>
              <div style={{ gridColumn: 'span 10', display: 'flex', gap: '24px', alignItems: 'center' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontWeight: searchOption === 'firstName' ? 700 : 500, color: searchOption === 'firstName' ? '#2563EB' : '#475569' }}>
                  <input
                    type="radio"
                    name="searchOption"
                    checked={searchOption === 'firstName'}
                    onChange={() => setSearchOption('firstName')}
                  />
                  By First Name
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontWeight: searchOption === 'inBetween' ? 700 : 500, color: searchOption === 'inBetween' ? '#2563EB' : '#475569' }}>
                  <input
                    type="radio"
                    name="searchOption"
                    checked={searchOption === 'inBetween'}
                    onChange={() => setSearchOption('inBetween')}
                  />
                  In Between
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontWeight: searchOption === 'itemCode' ? 700 : 500, color: searchOption === 'itemCode' ? '#2563EB' : '#475569' }}>
                  <input
                    type="radio"
                    name="searchOption"
                    checked={searchOption === 'itemCode'}
                    onChange={() => setSearchOption('itemCode')}
                  />
                  Item Code
                </label>
              </div>

              {/* Row 3: Item Search Input & Item Details */}
              <div style={{ gridColumn: 'span 2', fontWeight: 600, color: '#475569' }}>
                Item <span style={{ color: '#EF4444' }}>*</span> :
              </div>
              <div style={{ gridColumn: 'span 4', position: 'relative' }}>
                <input
                  type="text"
                  placeholder="Type to search hospital item..."
                  value={itemSearchText}
                  onChange={(e) => {
                    setItemSearchText(e.target.value);
                    if (!e.target.value) setStagedItem(null);
                  }}
                  autoComplete="off"
                  style={{ width: '100%', padding: '6px 10px', fontSize: '12px', border: '1.5px solid #3B82F6', borderRadius: '6px', background: '#FFFFFF', color: '#0F172A', outline: 'none' }}
                />

                {/* Dropdown list */}
                {showDropdown && searchResults.length > 0 && (
                  <div
                    style={{
                      position: 'absolute',
                      top: '100%',
                      left: 0,
                      right: 0,
                      zIndex: 1000,
                      backgroundColor: '#FFFFFF',
                      border: '1px solid #CBD5E1',
                      borderRadius: '8px',
                      boxShadow: '0 10px 25px -5px rgba(0,0,0,0.1), 0 8px 10px -6px rgba(0,0,0,0.1)',
                      maxHeight: '220px',
                      overflowY: 'auto',
                      marginTop: '4px'
                    }}
                  >
                    {searchResults.map(it => (
                      <div
                        key={it.itemMasterId}
                        onClick={() => handleSelectItem(it)}
                        style={{ padding: '8px 12px', borderBottom: '1px solid #F1F5F9', cursor: 'pointer', fontSize: '12px' }}
                        onMouseEnter={e => e.currentTarget.style.backgroundColor = '#F8FAFC'}
                        onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontWeight: 700, color: '#2563EB', fontFamily: 'monospace' }}>{it.itemCode}</span>
                          <span style={{ fontSize: '10.5px', color: '#166534', background: '#DCFCE7', padding: '1px 6px', borderRadius: '4px', fontWeight: 600 }}>
                            ✓ In Config
                          </span>
                        </div>
                        <div style={{ fontWeight: 700, color: '#0F172A', marginTop: '2px' }}>{it.itemName || it.genericName}</div>
                        <div style={{ fontSize: '11px', color: '#64748B', marginTop: '1px' }}>
                          {it.category && <span>{it.category} · </span>}
                          <span>1 {it.purchasedUnit} = {it.converterFactor} {it.consumptionUnit}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div style={{ gridColumn: 'span 2', fontWeight: 600, color: '#475569', textAlign: 'right' }}>
                Item Category :
              </div>
              <div style={{ gridColumn: 'span 4' }}>
                <input
                  type="text"
                  readOnly
                  value={stagedItem ? (stagedItem.category || 'General') : ''}
                  placeholder="Item Category (auto-filled)"
                  style={{ width: '100%', padding: '6px 10px', fontSize: '12px', border: '1px solid #E2E8F0', borderRadius: '6px', background: '#F8FAFC', color: '#64748B' }}
                />
              </div>

              {/* Row 4: Manufacturer | Machine | Pack Size | [ Add ] Button */}
              <div style={{ gridColumn: 'span 2', fontWeight: 600, color: '#475569' }}>
                Manufacturer :
              </div>
              <div style={{ gridColumn: 'span 2' }}>
                <input
                  type="text"
                  value={stagedInputs.manufacturer}
                  onChange={(e) => setStagedInputs(prev => ({ ...prev, manufacturer: e.target.value }))}
                  placeholder="Manufacturer"
                  style={{ width: '100%', padding: '6px 10px', fontSize: '12px', border: '1px solid #CBD5E1', borderRadius: '6px', color: '#0F172A' }}
                />
              </div>

              <div style={{ gridColumn: 'span 1', fontWeight: 600, color: '#475569', textAlign: 'right' }}>
                Machine :
              </div>
              <div style={{ gridColumn: 'span 2' }}>
                <select
                  value={stagedInputs.machine}
                  onChange={(e) => setStagedInputs(prev => ({ ...prev, machine: e.target.value }))}
                  style={{ width: '100%', padding: '6px 10px', fontSize: '12px', border: '1px solid #CBD5E1', borderRadius: '6px', color: '#0F172A', background: '#FFFFFF' }}
                >
                  <option value="Manual">Manual</option>
                  <option value="Automated">Automated</option>
                </select>
              </div>

              <div style={{ gridColumn: 'span 1', fontWeight: 600, color: '#475569', textAlign: 'right' }}>
                Pack Size :
              </div>
              <div style={{ gridColumn: 'span 2' }}>
                <input
                  type="text"
                  value={stagedInputs.packSize}
                  onChange={(e) => setStagedInputs(prev => ({ ...prev, packSize: e.target.value }))}
                  placeholder="Pack Size"
                  style={{ width: '100%', padding: '6px 10px', fontSize: '12px', border: '1px solid #CBD5E1', borderRadius: '6px', color: '#0F172A' }}
                />
              </div>

              <div style={{ gridColumn: 'span 2', textAlign: 'right' }}>
                <button
                  type="button"
                  onClick={handleAddItemToGrid}
                  style={{
                    background: '#2563EB',
                    color: '#FFFFFF',
                    border: 'none',
                    borderRadius: '6px',
                    padding: '7px 24px',
                    fontSize: '12.5px',
                    fontWeight: 700,
                    cursor: 'pointer',
                    boxShadow: '0 1px 2px rgba(37,99,235,0.2)',
                    transition: 'all 0.15s ease'
                  }}
                  onMouseEnter={e => e.currentTarget.style.backgroundColor = '#1D4ED8'}
                  onMouseLeave={e => e.currentTarget.style.backgroundColor = '#2563EB'}
                >
                  Add
                </button>
              </div>

            </div>
          </div>
        </div>

        {/* ══════════════════════════════════════════════════════════════════════
            SECTION 3: ADDED ITEM (DENSE GRID / TABLE)
           ══════════════════════════════════════════════════════════════════════ */}
        <div>
          <div
            style={{
              background: '#F8FAFC',
              borderBottom: '1px solid #E2E8F0',
              color: '#1E293B',
              fontWeight: 700,
              fontSize: '13px',
              padding: '9px 18px',
              borderLeft: '4px solid #3B82F6',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}
          >
            <span>Added Item</span>
            <span style={{ fontSize: '11.5px', color: '#2563EB', fontWeight: 700, background: '#EFF6FF', padding: '2px 8px', borderRadius: '12px', border: '1px solid #DBEAFE' }}>
              Lines: {addedItems.length}
            </span>
          </div>

          <div style={{ overflowX: 'auto', backgroundColor: '#FFFFFF' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
              <thead>
                <tr style={{ background: '#F8FAFC', color: '#475569', borderBottom: '2px solid #E2E8F0', textAlign: 'left', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                  <th style={{ padding: '9px 8px', borderRight: '1px solid #F1F5F9' }}>S.No.</th>
                  <th style={{ padding: '9px 8px', borderRight: '1px solid #F1F5F9' }}>Item Category</th>
                  <th style={{ padding: '9px 8px', borderRight: '1px solid #F1F5F9' }}>ItemCode</th>
                  <th style={{ padding: '9px 8px', borderRight: '1px solid #F1F5F9' }}>Item Name</th>
                  <th style={{ padding: '9px 8px', borderRight: '1px solid #F1F5F9' }}>Hsn Code</th>
                  <th style={{ padding: '9px 8px', borderRight: '1px solid #F1F5F9' }}>Manufacturer</th>
                  <th style={{ padding: '9px 8px', borderRight: '1px solid #F1F5F9' }}>Catalog No</th>
                  <th style={{ padding: '9px 8px', borderRight: '1px solid #F1F5F9' }}>Machine</th>
                  <th style={{ padding: '9px 8px', borderRight: '1px solid #F1F5F9' }}>Purchased Unit</th>
                  <th style={{ padding: '9px 8px', borderRight: '1px solid #F1F5F9' }}>Pack Size</th>
                  <th style={{ padding: '9px 8px', borderRight: '1px solid #F1F5F9' }}>Consumption Unit</th>
                  <th style={{ padding: '9px 8px', borderRight: '1px solid #F1F5F9', background: '#FEFCE8', color: '#854D0E', fontWeight: 700 }}>Rate (₹)</th>
                  <th style={{ padding: '9px 8px', borderRight: '1px solid #F1F5F9' }}>Discount %</th>
                  <th style={{ padding: '9px 8px', borderRight: '1px solid #F1F5F9' }}>IGST %</th>
                  <th style={{ padding: '9px 8px', borderRight: '1px solid #F1F5F9' }}>CGST %</th>
                  <th style={{ padding: '9px 8px', borderRight: '1px solid #F1F5F9' }}>SGST %</th>
                  <th style={{ padding: '9px 8px', borderRight: '1px solid #F1F5F9' }}>Total GST %</th>
                  <th style={{ padding: '9px 8px', borderRight: '1px solid #F1F5F9', textAlign: 'center' }}>Change Tax</th>
                  <th style={{ padding: '9px 8px', borderRight: '1px solid #F1F5F9', textAlign: 'right' }}>Disc. Amt</th>
                  <th style={{ padding: '9px 8px', borderRight: '1px solid #F1F5F9', textAlign: 'right' }}>Total GST Amt</th>
                  <th style={{ padding: '9px 8px', textAlign: 'center' }}>#</th>
                </tr>
              </thead>
              <tbody>
                {addedItems.length === 0 ? (
                  <tr>
                    <td colSpan="21" style={{ textAlign: 'center', padding: '32px', color: '#64748B', backgroundColor: '#FFFFFF' }}>
                      No items added yet. Search an item in "Item Detail" section above and click "Add".
                    </td>
                  </tr>
                ) : (
                  addedItems.map((row, idx) => (
                    <tr
                      key={row.itemMasterId}
                      style={{
                        backgroundColor: idx % 2 === 0 ? '#FFFFFF' : '#F8FAFC',
                        borderBottom: '1px solid #F1F5F9',
                        transition: 'background 0.15s ease'
                      }}
                      onMouseEnter={e => e.currentTarget.style.backgroundColor = '#F1F5F9'}
                      onMouseLeave={e => e.currentTarget.style.backgroundColor = idx % 2 === 0 ? '#FFFFFF' : '#F8FAFC'}
                    >
                      <td style={{ padding: '6px 8px', borderRight: '1px solid #F1F5F9', whiteSpace: 'nowrap', color: '#64748B', fontWeight: 600 }}>
                        <span>{idx + 1}</span>
                      </td>
                      <td style={{ padding: '6px 8px', borderRight: '1px solid #F1F5F9', whiteSpace: 'nowrap', color: '#334155' }}>{row.itemCategory}</td>
                      <td style={{ padding: '6px 8px', borderRight: '1px solid #F1F5F9', fontFamily: 'monospace', fontWeight: 700, color: '#2563EB' }}>{row.itemCode}</td>
                      <td style={{ padding: '6px 8px', borderRight: '1px solid #F1F5F9', fontWeight: 600, minWidth: '160px', color: '#0F172A' }}>{row.itemName}</td>
                      <td style={{ padding: '6px 8px', borderRight: '1px solid #F1F5F9', color: '#64748B' }}>{row.hsnCode}</td>
                      <td style={{ padding: '6px 8px', borderRight: '1px solid #F1F5F9', color: '#334155' }}>{row.manufacturer}</td>
                      <td style={{ padding: '6px 8px', borderRight: '1px solid #F1F5F9', color: '#64748B' }}>{row.catalogNo}</td>
                      <td style={{ padding: '6px 8px', borderRight: '1px solid #F1F5F9', color: '#334155' }}>{row.machine}</td>
                      <td style={{ padding: '6px 8px', borderRight: '1px solid #F1F5F9', color: '#334155' }}>{row.purchasedUnit}</td>
                      <td style={{ padding: '6px 8px', borderRight: '1px solid #F1F5F9', color: '#475569' }}>{row.packSize}</td>
                      <td style={{ padding: '6px 8px', borderRight: '1px solid #F1F5F9', color: '#334155' }}>{row.consumptionUnit}</td>
                      
                      {/* Rate Input */}
                      <td style={{ padding: '4px', borderRight: '1px solid #F1F5F9', background: '#FEFCE8' }}>
                        <input
                          type="number"
                          step="any"
                          min="0.01"
                          value={row.rate}
                          onChange={(e) => handleGridCellChange(idx, 'rate', e.target.value)}
                          style={{ width: '74px', padding: '4px 6px', fontSize: '12px', border: '1px solid #FDE047', borderRadius: '4px', background: '#FEFCE8', fontWeight: 700, textAlign: 'right', color: '#854D0E', outline: 'none' }}
                        />
                      </td>

                      {/* Discount % Input */}
                      <td style={{ padding: '4px', borderRight: '1px solid #F1F5F9' }}>
                        <input
                          type="number"
                          step="any"
                          min="0"
                          max="100"
                          value={row.discountPercent}
                          onChange={(e) => handleGridCellChange(idx, 'discountPercent', e.target.value)}
                          style={{ width: '45px', padding: '4px 5px', fontSize: '12px', border: '1px solid #CBD5E1', borderRadius: '4px', textAlign: 'right', color: '#0F172A', outline: 'none' }}
                        />
                      </td>

                      {/* IGST % */}
                      <td style={{ padding: '4px', borderRight: '1px solid #F1F5F9' }}>
                        <input
                          type="number"
                          step="any"
                          min="0"
                          max="100"
                          value={row.igstPercent}
                          onChange={(e) => handleGridCellChange(idx, 'igstPercent', e.target.value)}
                          disabled={row.cgstPercent > 0 || row.sgstPercent > 0}
                          style={{ width: '40px', padding: '4px 4px', fontSize: '11.5px', border: '1px solid #CBD5E1', borderRadius: '4px', textAlign: 'right', color: '#0F172A', outline: 'none', background: row.cgstPercent > 0 ? '#F8FAFC' : '#FFFFFF' }}
                        />
                      </td>

                      {/* CGST % */}
                      <td style={{ padding: '4px', borderRight: '1px solid #F1F5F9' }}>
                        <input
                          type="number"
                          step="any"
                          min="0"
                          max="100"
                          value={row.cgstPercent}
                          onChange={(e) => handleGridCellChange(idx, 'cgstPercent', e.target.value)}
                          disabled={row.igstPercent > 0}
                          style={{ width: '40px', padding: '4px 4px', fontSize: '11.5px', border: '1px solid #CBD5E1', borderRadius: '4px', textAlign: 'right', color: '#0F172A', outline: 'none', background: row.igstPercent > 0 ? '#F8FAFC' : '#FFFFFF' }}
                        />
                      </td>

                      {/* SGST % */}
                      <td style={{ padding: '4px', borderRight: '1px solid #F1F5F9' }}>
                        <input
                          type="number"
                          step="any"
                          min="0"
                          max="100"
                          value={row.sgstPercent}
                          onChange={(e) => handleGridCellChange(idx, 'sgstPercent', e.target.value)}
                          disabled={row.igstPercent > 0}
                          style={{ width: '40px', padding: '4px 4px', fontSize: '11.5px', border: '1px solid #CBD5E1', borderRadius: '4px', textAlign: 'right', color: '#0F172A', outline: 'none', background: row.igstPercent > 0 ? '#F8FAFC' : '#FFFFFF' }}
                        />
                      </td>

                      {/* Total GST % */}
                      <td style={{ padding: '6px 8px', borderRight: '1px solid #F1F5F9', fontWeight: 700, textAlign: 'center', color: '#334155' }}>
                        {row.totalGstPercent}%
                      </td>

                      {/* Change Tax Action Button */}
                      <td style={{ padding: '6px 8px', borderRight: '1px solid #F1F5F9', textAlign: 'center' }}>
                        <button
                          type="button"
                          onClick={() => handleToggleTaxType(idx)}
                          style={{ background: '#F1F5F9', color: '#475569', border: '1px solid #CBD5E1', borderRadius: '4px', padding: '3px 8px', fontSize: '10.5px', fontWeight: 700, cursor: 'pointer' }}
                          title="Toggle between IGST and CGST+SGST"
                        >
                          Tax
                        </button>
                      </td>

                      {/* Discount Amount */}
                      <td style={{ padding: '6px 8px', borderRight: '1px solid #F1F5F9', textAlign: 'right', fontWeight: 600, color: '#334155' }}>
                        {row.discountAmount.toFixed(2)}
                      </td>

                      {/* Total GST Amount */}
                      <td style={{ padding: '6px 8px', borderRight: '1px solid #F1F5F9', textAlign: 'right', fontWeight: 700, color: '#166534' }}>
                        {row.totalGstAmount.toFixed(2)}
                      </td>

                      {/* Delete Action Button */}
                      <td style={{ padding: '6px 8px', textAlign: 'center' }}>
                        <button
                          type="button"
                          onClick={() => handleRemoveAddedItem(idx)}
                          style={{ background: '#FEE2E2', color: '#DC2626', border: '1px solid #FECACA', borderRadius: '4px', padding: '2px 6px', fontSize: '12px', fontWeight: 800, cursor: 'pointer' }}
                          title="Delete line"
                        >
                          ✕
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
              {addedItems.length > 0 && (
                <tfoot>
                  <tr style={{ background: '#F8FAFC', borderTop: '2px solid #E2E8F0', fontWeight: 700, fontSize: '12px', color: '#0F172A' }}>
                    <td colSpan="11" style={{ padding: '8px 10px', textAlign: 'right', color: '#475569' }}>Total:</td>
                    <td style={{ padding: '8px 8px', textAlign: 'right', color: '#854D0E', background: '#FEFCE8' }}>₹{totalGrossRate.toFixed(2)}</td>
                    <td colSpan="6"></td>
                    <td style={{ padding: '8px 8px', textAlign: 'right', color: '#475569' }}>₹{totalDiscountAmt.toFixed(2)}</td>
                    <td style={{ padding: '8px 8px', textAlign: 'right', color: '#166534' }}>₹{totalGstAmt.toFixed(2)}</td>
                    <td></td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>

        {/* ══════════════════════════════════════════════════════════════════════
            SECTION 4: TERMS & CONDITIONS
           ══════════════════════════════════════════════════════════════════════ */}
        <div>
          <div
            style={{
              background: '#F8FAFC',
              borderBottom: '1px solid #E2E8F0',
              color: '#1E293B',
              fontWeight: 700,
              fontSize: '13px',
              padding: '9px 18px',
              borderLeft: '4px solid #3B82F6'
            }}
          >
            Terms & Conditions
          </div>

          <div style={{ padding: '16px 20px', backgroundColor: '#FFFFFF', borderBottom: '1px solid #E2E8F0' }}>
            <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginBottom: '12px' }}>
              <span style={{ fontSize: '12px', fontWeight: 600, color: '#475569' }}>Terms :</span>
              <input
                type="text"
                placeholder="Enter term, e.g. Free delivery on orders over ₹10,000. Payment within 30 days."
                value={termInput}
                onChange={(e) => setTermInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddTerm(); } }}
                style={{ flex: 1, padding: '6px 10px', fontSize: '12px', border: '1px solid #CBD5E1', borderRadius: '6px', color: '#0F172A', outline: 'none' }}
              />
              <button
                type="button"
                onClick={handleAddTerm}
                style={{ background: '#2563EB', color: '#FFFFFF', border: 'none', borderRadius: '6px', padding: '6px 16px', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}
              >
                Add
              </button>
            </div>

            {termsList.length > 0 && (
              <div style={{ border: '1px solid #E2E8F0', borderRadius: '6px', overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                  <thead>
                    <tr style={{ background: '#F8FAFC', color: '#475569', borderBottom: '1px solid #E2E8F0' }}>
                      <th style={{ padding: '6px 10px', width: '60px', textAlign: 'left', fontWeight: 600 }}>S.No.</th>
                      <th style={{ padding: '6px 10px', textAlign: 'left', fontWeight: 600 }}>Terms</th>
                      <th style={{ padding: '6px 10px', width: '40px', textAlign: 'center', fontWeight: 600 }}>#</th>
                    </tr>
                  </thead>
                  <tbody>
                    {termsList.map((t, idx) => (
                      <tr key={idx} style={{ borderBottom: '1px solid #F1F5F9', backgroundColor: '#FFFFFF' }}>
                        <td style={{ padding: '6px 10px', color: '#64748B' }}>{idx + 1}</td>
                        <td style={{ padding: '6px 10px', color: '#1E293B' }}>{t}</td>
                        <td style={{ padding: '6px 10px', textAlign: 'center' }}>
                          <button
                            type="button"
                            onClick={() => handleRemoveTerm(idx)}
                            style={{ background: 'transparent', color: '#DC2626', border: 'none', cursor: 'pointer', fontWeight: 700 }}
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

        {/* ══════════════════════════════════════════════════════════════════════
            SECTION 5: ADD DOCUMENT
           ══════════════════════════════════════════════════════════════════════ */}
        <div>
          <div
            style={{
              background: '#F8FAFC',
              borderBottom: '1px solid #E2E8F0',
              color: '#1E293B',
              fontWeight: 700,
              fontSize: '13px',
              padding: '9px 18px',
              borderLeft: '4px solid #3B82F6'
            }}
          >
            Add Document
          </div>

          <div style={{ padding: '16px 20px', backgroundColor: '#FFFFFF', textAlign: 'center', borderBottom: '1px solid #E2E8F0' }}>
            <input
              type="file"
              multiple
              ref={fileInputRef}
              onChange={handleFileUpload}
              style={{ display: 'none' }}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current && fileInputRef.current.click()}
              style={{
                background: '#FFFFFF',
                color: '#2563EB',
                border: '1.5px dashed #93C5FD',
                borderRadius: '8px',
                padding: '8px 22px',
                fontSize: '12.5px',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px'
              }}
              onMouseEnter={e => e.currentTarget.style.backgroundColor = '#EFF6FF'}
              onMouseLeave={e => e.currentTarget.style.backgroundColor = '#FFFFFF'}
            >
              <span>📎</span>
              <span>Upload Supporting Document</span>
            </button>

            {documents.length > 0 && (
              <div style={{ marginTop: '12px', display: 'flex', flexWrap: 'wrap', gap: '8px', justifyContent: 'center' }}>
                {documents.map((doc, idx) => (
                  <div
                    key={idx}
                    style={{
                      background: '#F8FAFC',
                      border: '1px solid #CBD5E1',
                      borderRadius: '6px',
                      padding: '5px 12px',
                      fontSize: '12px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      color: '#334155'
                    }}
                  >
                    <span>📄 {doc.name}</span>
                    <button
                      type="button"
                      onClick={() => handleRemoveDocument(idx)}
                      style={{ background: 'transparent', color: '#DC2626', border: 'none', cursor: 'pointer', fontWeight: 700 }}
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ══════════════════════════════════════════════════════════════════════
            SECTION 6: BOTTOM ACTION BUTTONS
           ══════════════════════════════════════════════════════════════════════ */}
        <div style={{ padding: '16px 20px', backgroundColor: '#F8FAFC', display: 'flex', justifyContent: 'center', gap: '16px' }}>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            style={{
              background: saving ? '#94A3B8' : '#2563EB',
              color: '#FFFFFF',
              border: 'none',
              borderRadius: '8px',
              padding: '9px 32px',
              fontSize: '13px',
              fontWeight: 700,
              cursor: saving ? 'not-allowed' : 'pointer',
              boxShadow: '0 1px 3px rgba(37,99,235,0.3)',
              transition: 'background 0.15s ease'
            }}
            onMouseEnter={e => { if (!saving) e.currentTarget.style.backgroundColor = '#1D4ED8'; }}
            onMouseLeave={e => { if (!saving) e.currentTarget.style.backgroundColor = '#2563EB'; }}
          >
            {saving ? 'Saving...' : 'Save'}
          </button>

          <button
            type="button"
            onClick={handleReset}
            disabled={saving}
            style={{
              background: '#FFFFFF',
              color: '#475569',
              border: '1px solid #CBD5E1',
              borderRadius: '8px',
              padding: '9px 24px',
              fontSize: '13px',
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'background 0.15s ease'
            }}
            onMouseEnter={e => e.currentTarget.style.backgroundColor = '#F1F5F9'}
            onMouseLeave={e => e.currentTarget.style.backgroundColor = '#FFFFFF'}
          >
            Reset
          </button>
        </div>

      </div>
    </div>
  );
}
