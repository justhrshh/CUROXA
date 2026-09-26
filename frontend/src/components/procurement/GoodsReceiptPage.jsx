import React, { useState, useEffect, useMemo } from 'react';
import api from '../../utils/api';

export default function GoodsReceiptPage({
  flowType = 'po',
  initialSelectedPOId = '',
  editingGrn = null,
  purchaseOrders = [],
  vendors = [],
  itemMasters = [],
  onCancel,
  onSuccess,
  showToast
}) {
  const [grnFlowType, setGrnFlowType] = useState(flowType);
  const [grnSelectedPOId, setGrnSelectedPOId] = useState(initialSelectedPOId);
  const [grnDirectVendorId, setGrnDirectVendorId] = useState('');
  const [grnLocation, setGrnLocation] = useState('Main Pharmacy Store');
  const [grnInvoiceNumber, setGrnInvoiceNumber] = useState('');
  const [grnInvoiceDate, setGrnInvoiceDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [grnInvoiceAmount, setGrnInvoiceAmount] = useState('');
  const [grnInvoiceFile, setGrnInvoiceFile] = useState(null);
  const [grnInvoiceFileName, setGrnInvoiceFileName] = useState('');
  const [grnNotes, setGrnNotes] = useState('');
  const [grnIsUploading, setGrnIsUploading] = useState(false);
  const [grnUploadProgress, setGrnUploadProgress] = useState(0);
  const [grnItems, setGrnItems] = useState([]);
  const [submitting, setSubmitting] = useState(false);

  // Active POs eligible for delivery (Approved, Sent, Confirmed, Partially Delivered)
  const eligiblePOs = useMemo(() => {
    return (purchaseOrders || []).filter(p => 
      !p.isParent && 
      p.vendorName !== 'Consolidated Multiple Suppliers' && 
      !(p.vendorOrders && p.vendorOrders.length > 0) &&
      ['Approved', 'Sent', 'Confirmed', 'Partially Delivered'].includes(p.status)
    );
  }, [purchaseOrders]);

  const activeVendors = useMemo(() => {
    return (vendors || []).filter(v => v.status === 'Active' || !v.status);
  }, [vendors]);

  // Pre-fill or sync when editing an existing GRN or PO selection
  useEffect(() => {
    if (editingGrn) {
      setGrnFlowType(editingGrn.poId ? 'po' : 'direct');
      setGrnSelectedPOId(editingGrn.poId || '');
      setGrnDirectVendorId(editingGrn.vendorId || '');
      setGrnLocation(editingGrn.grnLocation || 'Main Pharmacy Store');
      setGrnInvoiceNumber(editingGrn.invoiceNumber || '');
      setGrnInvoiceDate(editingGrn.invoiceDate ? new Date(editingGrn.invoiceDate).toISOString().split('T')[0] : '');
      setGrnInvoiceAmount(editingGrn.invoiceAmount !== undefined ? String(editingGrn.invoiceAmount) : '');
      setGrnInvoiceFileName(editingGrn.invoiceUrl || '');
      setGrnNotes(editingGrn.notes || '');

      const mappedItems = (editingGrn.items || []).map(it => ({
        ...it,
        qtyOrdered: it.qtyOrdered || it.orderedQty || 0,
        qtyReceived: it.qtyReceived !== undefined ? it.qtyReceived : 0,
        rejectedQty: it.rejectedQty !== undefined ? it.rejectedQty : 0,
        batchNumber: it.batchNumber || '',
        mfgDate: it.mfgDate ? new Date(it.mfgDate).toISOString().split('T')[0] : '',
        expiryDate: it.expiryDate ? new Date(it.expiryDate).toISOString().split('T')[0] : '',
        price: it.price !== undefined ? it.price : (it.purchaseRate || 0),
        discountPercent: it.discountPercent || 0,
        gst: it.gst !== undefined ? it.gst : 12,
        converterFactor: it.converterFactor || 1
      }));
      setGrnItems(mappedItems);
    } else if (initialSelectedPOId) {
      handleSelectPO(initialSelectedPOId);
    } else if (grnFlowType === 'direct') {
      if (activeVendors.length > 0 && !grnDirectVendorId) {
        setGrnDirectVendorId(activeVendors[0]._id);
      }
      if (grnItems.length === 0) {
        setGrnItems([{
          name: '',
          sku: '',
          itemMasterId: '',
          itemType: 'Medicine',
          purchasedUnit: 'Box',
          packSize: '',
          converterFactor: 1,
          consumptionUnit: 'Unit',
          barcode: '',
          batchNumber: '',
          mfgDate: '',
          expiryDate: '',
          qtyOrdered: 0,
          previouslyReceivedQty: 0,
          remainingQty: 0,
          qtyReceived: 10,
          rejectedQty: 0,
          rejectionReason: '',
          price: 100,
          discountPercent: 0,
          gst: 12
        }]);
      }
    }
  }, [editingGrn, initialSelectedPOId]);

  const handleSelectPO = (poId) => {
    setGrnSelectedPOId(poId);
    const po = (purchaseOrders || []).find(p => p._id === poId || p.poId === poId);
    if (!po) return;

    const mappedItems = (po.items || []).map(item => {
      const alreadyRcvd = Number(item.receivedQty || 0);
      const totalOrdered = Number(item.qty || item.quantity || 0);
      const remaining = Math.max(0, totalOrdered - alreadyRcvd);

      return {
        itemMasterId: item.itemMasterId || null,
        itemCode: item.itemCode || item.sku || '',
        sku: item.sku || item.itemCode || `SKU-${Math.random().toString(36).substring(2, 7)}`,
        name: item.name || item.medicineName || 'Medicine',
        brandName: item.brandName || '',
        manufacturer: item.manufacturer || '',
        purchasedUnit: item.purchasedUnit || 'Box',
        packSize: item.packSize || '',
        converterFactor: item.converterFactor || 1,
        consumptionUnit: item.consumptionUnit || 'Unit',
        barcode: item.barcode || '',
        batchNumber: '',
        mfgDate: '',
        expiryDate: '',
        qtyOrdered: totalOrdered,
        orderedQty: totalOrdered,
        previouslyReceivedQty: alreadyRcvd,
        remainingQty: remaining,
        qtyReceived: remaining > 0 ? remaining : totalOrdered,
        rejectedQty: 0,
        rejectionReason: '',
        price: item.price || item.purchaseRate || 0,
        purchaseRate: item.price || item.purchaseRate || 0,
        discountPercent: item.discount || item.discountPercent || 0,
        gst: item.tax !== undefined ? item.tax : (item.gst !== undefined ? item.gst : 12),
        mrp: item.mrp || 0
      };
    });

    setGrnItems(mappedItems);
  };

  const handleAddDirectItem = () => {
    setGrnItems(prev => [
      ...prev,
      {
        name: '',
        sku: '',
        itemMasterId: '',
        itemType: 'Medicine',
        purchasedUnit: 'Box',
        packSize: '',
        converterFactor: 1,
        consumptionUnit: 'Unit',
        barcode: '',
        batchNumber: '',
        mfgDate: '',
        expiryDate: '',
        qtyOrdered: 0,
        previouslyReceivedQty: 0,
        remainingQty: 0,
        qtyReceived: 10,
        rejectedQty: 0,
        rejectionReason: '',
        price: 100,
        discountPercent: 0,
        gst: 12
      }
    ]);
  };

  const handleItemMasterSelect = (index, itemMasterId) => {
    const selectedItem = (itemMasters || []).find(im => im._id === itemMasterId);
    if (!selectedItem) return;

    setGrnItems(prev => {
      const next = [...prev];
      next[index] = {
        ...next[index],
        itemMasterId: selectedItem._id,
        itemCode: selectedItem.itemCode,
        sku: selectedItem.itemCode,
        name: selectedItem.genericName,
        brandName: selectedItem.brandName || '',
        manufacturer: selectedItem.manufacturer || '',
        purchasedUnit: selectedItem.purchasedUnit || 'Box',
        packSize: selectedItem.packSizeDescription || '',
        converterFactor: selectedItem.converterFactor || 1,
        consumptionUnit: selectedItem.consumptionUnit || 'Unit',
        gst: selectedItem.defaultGst !== undefined ? selectedItem.defaultGst : 12
      };
      return next;
    });
  };

  const handleRemoveItem = (index) => {
    if (grnItems.length <= 1) {
      if (showToast) showToast('At least one item is required in the intake ledger', 'error');
      return;
    }
    setGrnItems(prev => prev.filter((_, idx) => idx !== index));
  };

  // Financial computations across all items
  const liveTotals = useMemo(() => {
    return grnItems.reduce((acc, item) => {
      const qty = Math.max(0, Number(item.qtyReceived) || 0);
      const rate = Math.max(0, Number(item.price || item.purchaseRate) || 0);
      const discPct = Math.max(0, Math.min(100, Number(item.discountPercent) || 0));
      const gstRate = Math.max(0, Number(item.gst !== undefined ? item.gst : 12));

      const gross = qty * rate;
      const discAmt = Math.round((gross * (discPct / 100)) * 100) / 100;
      const taxable = Math.max(0, Math.round((gross - discAmt) * 100) / 100);
      const gstAmt = Math.round((taxable * (gstRate / 100)) * 100) / 100;
      const net = Math.round((taxable + gstAmt) * 100) / 100;

      return {
        subtotal: acc.subtotal + gross,
        totalDiscount: acc.totalDiscount + discAmt,
        taxableBase: acc.taxableBase + taxable,
        totalGst: acc.totalGst + gstAmt,
        grandTotal: acc.grandTotal + net
      };
    }, { subtotal: 0, totalDiscount: 0, taxableBase: 0, totalGst: 0, grandTotal: 0 });
  }, [grnItems]);

  const invoicedVal = Number(grnInvoiceAmount) || 0;
  const varianceVal = invoicedVal > 0 ? Math.round((liveTotals.grandTotal - invoicedVal) * 100) / 100 : 0;

  const selectedPoObj = useMemo(() => {
    if (grnFlowType !== 'po' || !grnSelectedPOId) return null;
    return (purchaseOrders || []).find(p => p._id === grnSelectedPOId || p.poId === grnSelectedPOId);
  }, [grnFlowType, grnSelectedPOId, purchaseOrders]);

  const handleSubmit = async (e, statusParam = 'Verified/Completed') => {
    if (e) e.preventDefault();

    if (grnFlowType === 'po' && !grnSelectedPOId) {
      if (showToast) showToast('Please select an approved Purchase Order!', 'error');
      return;
    }
    if (grnFlowType === 'direct' && !grnDirectVendorId) {
      if (showToast) showToast('Please select a supplier / vendor!', 'error');
      return;
    }
    if (grnItems.length === 0) {
      if (showToast) showToast('Please add at least one item to receive!', 'error');
      return;
    }

    // Validation: Check batch and expiry dates for all items
    for (let i = 0; i < grnItems.length; i++) {
      const it = grnItems[i];
      if (!it.name || !it.name.trim()) {
        if (showToast) showToast(`Item #${i + 1}: Name is required`, 'error');
        return;
      }
      if (statusParam === 'Verified/Completed') {
        if (!it.batchNumber || !it.batchNumber.trim()) {
          if (showToast) showToast(`Item #${i + 1} (${it.name}): Batch number is required for inventory intake`, 'error');
          return;
        }
        if (!it.expiryDate) {
          if (showToast) showToast(`Item #${i + 1} (${it.name}): Expiry date is required`, 'error');
          return;
        }
        const expDate = new Date(it.expiryDate);
        if (expDate <= new Date()) {
          if (showToast) showToast(`Item #${i + 1} (${it.name}): Expiry date must be in the future!`, 'error');
          return;
        }
      }
    }

    setSubmitting(true);
    try {
      let poId = null;
      let poNumber = 'Direct Purchase';
      let poDate = null;
      let vendorId = '';
      let vendorName = '';

      if (grnFlowType === 'po') {
        const po = selectedPoObj;
        poId = po._id;
        poNumber = po.poId;
        poDate = po.createdAt;
        vendorId = po.vendorId || (activeVendors[0] ? activeVendors[0]._id : '');
        vendorName = po.vendorName;
      } else {
        const v = activeVendors.find(x => x._id === grnDirectVendorId);
        vendorId = v?._id || '';
        vendorName = v?.name || '';
      }

      const generatedGrnId = editingGrn?.grnId || `GRN-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;

      const payload = {
        grnId: generatedGrnId,
        grnLocation: grnLocation || 'Main Pharmacy Store',
        poId,
        poNumber,
        poDate,
        vendorId,
        vendorName,
        status: statusParam,
        invoiceNumber: grnInvoiceNumber || '',
        invoiceDate: grnInvoiceDate || null,
        invoiceAmount: Number(grnInvoiceAmount) || 0,
        invoiceUrl: grnInvoiceFileName || '',
        notes: grnNotes || '',
        items: grnItems.map(it => ({
          itemType: it.itemType || 'Medicine',
          itemMasterId: it.itemMasterId || null,
          itemCode: it.itemCode || it.sku || '',
          sku: it.sku || it.itemCode || 'SKU',
          name: it.name,
          brandName: it.brandName || '',
          unit: it.purchasedUnit || it.unit || 'Box',
          purchasedUnit: it.purchasedUnit || it.unit || 'Box',
          packSize: it.packSize || '',
          converterFactor: Number(it.converterFactor) > 0 ? Number(it.converterFactor) : 1,
          consumptionUnit: it.consumptionUnit || 'Unit',
          barcode: it.barcode || '',
          batchNumber: it.batchNumber || '',
          mfgDate: it.mfgDate || null,
          expiryDate: it.expiryDate || null,
          qtyOrdered: Number(it.qtyOrdered || it.orderedQty || 0),
          orderedQty: Number(it.orderedQty || it.qtyOrdered || 0),
          previouslyReceivedQty: Number(it.previouslyReceivedQty || 0),
          remainingQty: Number(it.remainingQty || 0),
          qtyReceived: Number(it.qtyReceived) || 0,
          rejectedQty: Number(it.rejectedQty) || 0,
          rejectionReason: it.rejectionReason || '',
          price: Number(it.price || it.purchaseRate) || 0,
          purchaseRate: Number(it.purchaseRate || it.price) || 0,
          discountPercent: Number(it.discountPercent) || 0,
          gst: it.gst !== undefined ? Number(it.gst) : 12,
          mrp: Number(it.mrp) || 0
        }))
      };

      if (editingGrn) {
        await api.put(`/goods-receipts/${editingGrn._id}`, payload);
      } else {
        await api.post('/goods-receipts', payload);
      }

      if (showToast) {
        showToast(
          statusParam === 'Draft' 
            ? 'GRN saved as Draft successfully!' 
            : (editingGrn ? 'GRN updated successfully!' : 'GRN generated & inventory stock updated successfully!'), 
          'success'
        );
      }
      if (onSuccess) onSuccess();
    } catch (err) {
      console.error('GRN submit error:', err);
      const msg = err.response?.data?.error || err.response?.data?.message || 'Failed to save Goods Receipt Note';
      if (showToast) showToast(msg, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{ animation: 'fadeIn 0.25s ease', display: 'flex', flexDirection: 'column', gap: '22px' }}>
      
      {/* 1. TOP BREADCRUMB & PAGE HEADER */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '16px',
        background: 'linear-gradient(135deg, #FFFFFF 0%, #F8FAFC 100%)',
        padding: '20px 24px',
        borderRadius: '18px',
        border: '1.5px solid #E2E8F0',
        boxShadow: '0 4px 16px -2px rgba(15, 23, 42, 0.03)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{
            width: '46px',
            height: '46px',
            borderRadius: '14px',
            background: 'linear-gradient(135deg, #059669 0%, #10B981 100%)',
            color: '#FFFFFF',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 6px 18px rgba(16, 185, 129, 0.35)',
            flexShrink: 0
          }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/>
              <path d="m3.3 7 8.7 5 8.7-5"/>
              <path d="M12 22V12"/>
            </svg>
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <h1 style={{ fontSize: '22px', fontWeight: 900, color: '#0F172A', margin: 0, letterSpacing: '-0.02em', fontFamily: "'Outfit', 'Plus Jakarta Sans', sans-serif" }}>
                {editingGrn ? `Edit Goods Receipt Note: ${editingGrn.grnId}` : 'Goods Receipt Note (GRN) Verification'}
              </h1>
              <span style={{
                fontSize: '10.5px',
                fontWeight: 800,
                background: '#ECFDF5',
                color: '#047857',
                border: '1px solid #A7F3D0',
                padding: '2px 8px',
                borderRadius: '12px',
                letterSpacing: '0.04em'
              }}>
                INTAKE LEDGER
              </span>
            </div>
            <p style={{ fontSize: '13px', color: '#64748B', margin: '4px 0 0 0', fontWeight: 600 }}>
              Inspect physical consignments, record batch & expiry details, compute taxes, and reconcile with supplier invoice.
            </p>
          </div>
        </div>

        <button
          type="button"
          className="proc-btn proc-btn-secondary"
          onClick={onCancel}
          style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '10px 18px', borderRadius: '12px', fontWeight: 750 }}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="19" y1="12" x2="5" y2="12"/>
            <polyline points="12 19 5 12 12 5"/>
          </svg>
          <span>Back to Goods Receipts</span>
        </button>
      </div>

      {/* 2. WORKFLOW MODE & RECEIVING DESTINATION */}
      <div style={{
        background: '#FFFFFF',
        border: '1.5px solid #E2E8F0',
        borderRadius: '18px',
        padding: '20px 24px',
        boxShadow: '0 2px 8px rgba(15, 23, 42, 0.04)'
      }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '20px' }}>
          
          {/* Workflow Mode Switch */}
          <div>
            <label className="proc-form-label" style={{ marginBottom: '8px', fontSize: '11px', textTransform: 'uppercase', color: '#475569', fontWeight: 800 }}>
              Intake Workflow Mode
            </label>
            <div style={{ display: 'flex', gap: '12px', marginTop: '6px' }}>
              <button
                type="button"
                onClick={() => {
                  setGrnFlowType('po');
                  if (eligiblePOs.length > 0 && !grnSelectedPOId) {
                    handleSelectPO(eligiblePOs[0]._id);
                  }
                }}
                style={{
                  flex: 1,
                  padding: '12px 16px',
                  borderRadius: '12px',
                  border: grnFlowType === 'po' ? '2px solid #2563EB' : '1.5px solid #E2E8F0',
                  background: grnFlowType === 'po' ? '#EFF6FF' : '#F8FAFC',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  transition: 'all 0.15s ease'
                }}
              >
                <div style={{
                  width: '18px',
                  height: '18px',
                  borderRadius: '50%',
                  border: grnFlowType === 'po' ? '5px solid #2563EB' : '2px solid #94A3B8',
                  background: '#FFFFFF'
                }} />
                <div style={{ textAlign: 'left' }}>
                  <div style={{ fontSize: '13px', fontWeight: 800, color: grnFlowType === 'po' ? '#1E40AF' : '#1E293B' }}>
                    Against Approved PO
                  </div>
                  <div style={{ fontSize: '11px', color: '#64748B' }}>Match against purchase order</div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => {
                  setGrnFlowType('direct');
                  setGrnSelectedPOId('');
                  if (activeVendors.length > 0 && !grnDirectVendorId) {
                    setGrnDirectVendorId(activeVendors[0]._id);
                  }
                  if (grnItems.length === 0) {
                    handleAddDirectItem();
                  }
                }}
                style={{
                  flex: 1,
                  padding: '12px 16px',
                  borderRadius: '12px',
                  border: grnFlowType === 'direct' ? '2px solid #059669' : '1.5px solid #E2E8F0',
                  background: grnFlowType === 'direct' ? '#ECFDF5' : '#F8FAFC',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  transition: 'all 0.15s ease'
                }}
              >
                <div style={{
                  width: '18px',
                  height: '18px',
                  borderRadius: '50%',
                  border: grnFlowType === 'direct' ? '5px solid #059669' : '2px solid #94A3B8',
                  background: '#FFFFFF'
                }} />
                <div style={{ textAlign: 'left' }}>
                  <div style={{ fontSize: '13px', fontWeight: 800, color: grnFlowType === 'direct' ? '#065F46' : '#1E293B' }}>
                    Direct Purchase (No PO)
                  </div>
                  <div style={{ fontSize: '11px', color: '#64748B' }}>Urgent spot buy or cash delivery</div>
                </div>
              </button>
            </div>
          </div>

          {/* Receiving Destination Store */}
          <div>
            <label className="proc-form-label" style={{ marginBottom: '8px', fontSize: '11px', textTransform: 'uppercase', color: '#475569', fontWeight: 800 }}>
              Receiving Destination Store <span style={{ color: '#EF4444' }}>*</span>
            </label>
            <select
              className="proc-select"
              value={grnLocation}
              onChange={(e) => setGrnLocation(e.target.value)}
              style={{ width: '100%', height: '48px', fontSize: '13.5px', marginTop: '6px' }}
            >
              <option value="Main Pharmacy Store">🏥 Main Pharmacy Store (Central Dispensary)</option>
              <option value="Emergency Care Unit">🚨 Emergency Care Unit (Sub-Store)</option>
              <option value="OT Surgical Store">🩺 OT Surgical Store (Sterile Intake)</option>
              <option value="ICU Sub-Store">🏥 ICU Sub-Store</option>
              <option value="General Hospital Store">🏢 General Hospital Store (Consumables)</option>
            </select>
          </div>
        </div>

        {/* PO or Vendor Selection Row */}
        <div style={{ marginTop: '18px', paddingTop: '18px', borderTop: '1px solid #F1F5F9' }}>
          {grnFlowType === 'po' ? (
            <div>
              <label className="proc-form-label" style={{ marginBottom: '8px', fontSize: '11px', textTransform: 'uppercase', color: '#475569', fontWeight: 800 }}>
                Select Approved Purchase Order <span style={{ color: '#EF4444' }}>*</span>
              </label>
              <select
                className="proc-select"
                value={grnSelectedPOId}
                onChange={(e) => handleSelectPO(e.target.value)}
                style={{ width: '100%', height: '48px', fontSize: '13.5px', fontWeight: 700 }}
              >
                <option value="">-- Choose Purchase Order Awaiting Intake --</option>
                {eligiblePOs.map(po => (
                  <option key={po._id} value={po._id}>
                    {po.poId} • {po.vendorName} • {po.items?.length || 0} items • ₹{Number(po.totalAmount || 0).toLocaleString('en-IN')} ({po.status})
                  </option>
                ))}
              </select>

              {selectedPoObj && (
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                  gap: '12px',
                  marginTop: '12px',
                  padding: '14px 18px',
                  background: '#F0FDF4',
                  borderRadius: '12px',
                  border: '1px solid #BBF7D0'
                }}>
                  <div>
                    <span style={{ fontSize: '10.5px', color: '#166534', fontWeight: 700, textTransform: 'uppercase' }}>Supplier</span>
                    <div style={{ fontSize: '13.5px', fontWeight: 800, color: '#0F172A' }}>{selectedPoObj.vendorName}</div>
                  </div>
                  <div>
                    <span style={{ fontSize: '10.5px', color: '#166534', fontWeight: 700, textTransform: 'uppercase' }}>PO Amount</span>
                    <div style={{ fontSize: '13.5px', fontWeight: 900, color: '#15803D' }}>₹{Number(selectedPoObj.totalAmount || 0).toLocaleString('en-IN')}</div>
                  </div>
                  <div>
                    <span style={{ fontSize: '10.5px', color: '#166534', fontWeight: 700, textTransform: 'uppercase' }}>PO Status</span>
                    <div style={{ fontSize: '12.5px', fontWeight: 800, color: '#2563EB' }}>{selectedPoObj.status}</div>
                  </div>
                  <div>
                    <span style={{ fontSize: '10.5px', color: '#166534', fontWeight: 700, textTransform: 'uppercase' }}>Expected Delivery</span>
                    <div style={{ fontSize: '12.5px', fontWeight: 600 }}>{selectedPoObj.expectedDelivery ? new Date(selectedPoObj.expectedDelivery).toLocaleDateString('en-IN') : 'Standard'}</div>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div>
              <label className="proc-form-label" style={{ marginBottom: '8px', fontSize: '11px', textTransform: 'uppercase', color: '#475569', fontWeight: 800 }}>
                Supplier / Vendor <span style={{ color: '#EF4444' }}>*</span>
              </label>
              <select
                className="proc-select"
                value={grnDirectVendorId}
                onChange={(e) => setGrnDirectVendorId(e.target.value)}
                style={{ width: '100%', height: '48px', fontSize: '13.5px', fontWeight: 700 }}
              >
                <option value="">-- Choose Supplier --</option>
                {activeVendors.map(v => (
                  <option key={v._id} value={v._id}>
                    {v.name} ({v.code}) • {v.type || 'Supplier'}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      </div>

      {/* 3. PHYSICAL RECEIVING & QUALITY INSPECTION LEDGER */}
      <div style={{
        background: '#FFFFFF',
        border: '1.5px solid #E2E8F0',
        borderRadius: '18px',
        overflow: 'hidden',
        boxShadow: '0 2px 8px rgba(15, 23, 42, 0.04)'
      }}>
        <div style={{
          padding: '18px 24px',
          borderBottom: '1.5px solid #F1F5F9',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '12px',
          background: 'linear-gradient(to right, #F8FAFC, #FFFFFF)'
        }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 800, color: '#0F172A' }}>
                Physical Receiving & Quality Inspection Ledger
              </h3>
              <span style={{ fontSize: '11px', fontWeight: 800, background: '#E0F2FE', color: '#0369A1', padding: '2px 8px', borderRadius: '12px' }}>
                {grnItems.length} {grnItems.length === 1 ? 'Line Item' : 'Line Items'}
              </span>
            </div>
            <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: '#64748B' }}>
              Enter batch numbers, manufacturing/expiry dates, verify physical carton counts, and record any damaged/rejected quantities.
            </p>
          </div>

          {grnFlowType === 'direct' && (
            <button
              type="button"
              onClick={handleAddDirectItem}
              className="proc-btn proc-btn-primary"
              style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12.5px', padding: '8px 14px' }}
            >
              <span>+</span> Add Item Line
            </button>
          )}
        </div>

        {/* ITEMS TABLE */}
        <div style={{ overflowX: 'auto' }}>
          <table className="proc-table" style={{ width: '100%', fontSize: '12.5px', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#F8FAFC', borderBottom: '1.5px solid #E2E8F0' }}>
                <th style={{ padding: '12px 14px', textAlign: 'left', minWidth: '220px' }}>Item Details</th>
                <th style={{ padding: '12px 14px', textAlign: 'left', minWidth: '130px' }}>Batch No. *</th>
                <th style={{ padding: '12px 14px', textAlign: 'left', minWidth: '130px' }}>Mfg Date</th>
                <th style={{ padding: '12px 14px', textAlign: 'left', minWidth: '140px', background: '#FEF3C7', color: '#92400E' }}>Expiry Date *</th>
                {grnFlowType === 'po' && (
                  <th style={{ padding: '12px 14px', textAlign: 'center', minWidth: '90px' }}>PO Qty</th>
                )}
                <th style={{ padding: '12px 14px', textAlign: 'center', minWidth: '100px', background: '#DCFCE7', color: '#166534' }}>Recv Qty *</th>
                <th style={{ padding: '12px 14px', textAlign: 'center', minWidth: '90px', color: '#991B1B' }}>Rejected</th>
                <th style={{ padding: '12px 14px', textAlign: 'right', minWidth: '100px' }}>Rate (₹)</th>
                <th style={{ padding: '12px 14px', textAlign: 'right', minWidth: '80px' }}>Disc %</th>
                <th style={{ padding: '12px 14px', textAlign: 'right', minWidth: '80px' }}>GST %</th>
                <th style={{ padding: '12px 14px', textAlign: 'right', minWidth: '110px', background: '#F0FDF4', color: '#15803D' }}>Net Total</th>
                <th style={{ padding: '12px 14px', textAlign: 'center', width: '48px' }}></th>
              </tr>
            </thead>
            <tbody>
              {grnItems.map((item, idx) => {
                const qtyRecv = Number(item.qtyReceived) || 0;
                const rejQty = Number(item.rejectedQty) || 0;
                const acceptedQty = Math.max(0, qtyRecv - rejQty);
                const rate = Number(item.price || item.purchaseRate) || 0;
                const discPct = Number(item.discountPercent) || 0;
                const gstPct = Number(item.gst !== undefined ? item.gst : 12);

                const gross = qtyRecv * rate;
                const discAmt = gross * (discPct / 100);
                const taxable = gross - discAmt;
                const gstAmt = taxable * (gstPct / 100);
                const lineNet = Math.round((taxable + gstAmt) * 100) / 100;

                return (
                  <tr key={idx} style={{ borderBottom: '1px solid #F1F5F9' }}>
                    
                    {/* Item Details */}
                    <td style={{ padding: '12px 14px', verticalAlign: 'top' }}>
                      {grnFlowType === 'direct' ? (
                        <div>
                          <select
                            className="proc-select"
                            value={item.itemMasterId || ''}
                            onChange={(e) => handleItemMasterSelect(idx, e.target.value)}
                            style={{ width: '100%', fontSize: '12px', marginBottom: '4px' }}
                          >
                            <option value="">-- Link Item Master (Optional) --</option>
                            {itemMasters.map(im => (
                              <option key={im._id} value={im._id}>{im.itemCode} • {im.genericName}</option>
                            ))}
                          </select>
                          <input
                            type="text"
                            className="proc-input"
                            placeholder="Medicine / Item Name *"
                            value={item.name}
                            onChange={(e) => {
                              const val = e.target.value;
                              setGrnItems(prev => {
                                const next = [...prev];
                                next[idx] = { ...next[idx], name: val };
                                return next;
                              });
                            }}
                            style={{ width: '100%', fontSize: '12px' }}
                          />
                        </div>
                      ) : (
                        <div>
                          <div style={{ fontWeight: 700, color: '#0F172A', fontSize: '13px' }}>{item.name}</div>
                          <div style={{ fontSize: '11px', color: '#2563EB', fontFamily: 'monospace', fontWeight: 600 }}>
                            {item.itemCode || item.sku}
                          </div>
                          {item.brandName && (
                            <div style={{ fontSize: '11px', color: '#64748B' }}>Brand: {item.brandName}</div>
                          )}
                          <div style={{ fontSize: '10.5px', color: '#059669', fontWeight: 700, marginTop: '2px' }}>
                            1 {item.purchasedUnit || 'Box'} = {item.converterFactor || 1} {item.consumptionUnit || 'Unit'}
                          </div>
                        </div>
                      )}
                    </td>

                    {/* Batch Number */}
                    <td style={{ padding: '12px 14px', verticalAlign: 'top' }}>
                      <input
                        type="text"
                        className="proc-input"
                        placeholder="e.g. BTH-8902"
                        value={item.batchNumber}
                        onChange={(e) => {
                          const val = e.target.value.toUpperCase();
                          setGrnItems(prev => {
                            const next = [...prev];
                            next[idx] = { ...next[idx], batchNumber: val };
                            return next;
                          });
                        }}
                        style={{ width: '100%', fontSize: '12px', fontWeight: 700, fontFamily: 'monospace' }}
                      />
                    </td>

                    {/* Mfg Date */}
                    <td style={{ padding: '12px 14px', verticalAlign: 'top' }}>
                      <input
                        type="date"
                        className="proc-input"
                        value={item.mfgDate || ''}
                        onChange={(e) => {
                          const val = e.target.value;
                          setGrnItems(prev => {
                            const next = [...prev];
                            next[idx] = { ...next[idx], mfgDate: val };
                            return next;
                          });
                        }}
                        style={{ width: '100%', fontSize: '11.5px' }}
                      />
                    </td>

                    {/* Expiry Date */}
                    <td style={{ padding: '12px 14px', verticalAlign: 'top', background: '#FFFBEB' }}>
                      <input
                        type="date"
                        className="proc-input"
                        value={item.expiryDate || ''}
                        onChange={(e) => {
                          const val = e.target.value;
                          setGrnItems(prev => {
                            const next = [...prev];
                            next[idx] = { ...next[idx], expiryDate: val };
                            return next;
                          });
                        }}
                        style={{ width: '100%', fontSize: '11.5px', fontWeight: 700, borderColor: '#FCD34D' }}
                      />
                      {item.expiryDate && (() => {
                        const daysLeft = Math.ceil((new Date(item.expiryDate) - new Date()) / (1000 * 60 * 60 * 24));
                        if (daysLeft <= 0) {
                          return <div style={{ fontSize: '10px', color: '#DC2626', fontWeight: 800, marginTop: '2px' }}>⚠️ EXPIRED</div>;
                        }
                        if (daysLeft < 90) {
                          return <div style={{ fontSize: '10px', color: '#D97706', fontWeight: 700, marginTop: '2px' }}>⚠️ {daysLeft}d shelf-life</div>;
                        }
                        return <div style={{ fontSize: '10px', color: '#166534', fontWeight: 600, marginTop: '2px' }}>✓ {daysLeft}d valid</div>;
                      })()}
                    </td>

                    {/* PO Qty (PO Mode) */}
                    {grnFlowType === 'po' && (
                      <td style={{ padding: '12px 14px', verticalAlign: 'top', textAlign: 'center' }}>
                        <div style={{ fontWeight: 700, color: '#334155' }}>{item.qtyOrdered}</div>
                        {item.previouslyReceivedQty > 0 && (
                          <div style={{ fontSize: '10.5px', color: '#2563EB' }}>
                            ({item.previouslyReceivedQty} recv)
                          </div>
                        )}
                      </td>
                    )}

                    {/* Received Qty */}
                    <td style={{ padding: '12px 14px', verticalAlign: 'top', textAlign: 'center', background: '#F0FDF4' }}>
                      <input
                        type="number"
                        min="0"
                        className="proc-input"
                        value={item.qtyReceived}
                        onChange={(e) => {
                          const val = Math.max(0, Number(e.target.value) || 0);
                          setGrnItems(prev => {
                            const next = [...prev];
                            next[idx] = { ...next[idx], qtyReceived: val };
                            return next;
                          });
                        }}
                        style={{ width: '80px', textAlign: 'center', fontWeight: 800, fontSize: '13px', color: '#15803D' }}
                      />
                      <div style={{ fontSize: '10.5px', color: '#166534', fontWeight: 700, marginTop: '3px' }}>
                        Accept: {acceptedQty}
                      </div>
                    </td>

                    {/* Rejected Qty */}
                    <td style={{ padding: '12px 14px', verticalAlign: 'top', textAlign: 'center' }}>
                      <input
                        type="number"
                        min="0"
                        max={item.qtyReceived}
                        className="proc-input"
                        value={item.rejectedQty || 0}
                        onChange={(e) => {
                          const val = Math.max(0, Number(e.target.value) || 0);
                          setGrnItems(prev => {
                            const next = [...prev];
                            next[idx] = { ...next[idx], rejectedQty: val };
                            return next;
                          });
                        }}
                        style={{ width: '70px', textAlign: 'center', color: '#DC2626', fontWeight: 700, fontSize: '12px' }}
                      />
                    </td>

                    {/* Rate */}
                    <td style={{ padding: '12px 14px', verticalAlign: 'top', textAlign: 'right' }}>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        className="proc-input"
                        value={item.price}
                        onChange={(e) => {
                          const val = Math.max(0, Number(e.target.value) || 0);
                          setGrnItems(prev => {
                            const next = [...prev];
                            next[idx] = { ...next[idx], price: val };
                            return next;
                          });
                        }}
                        style={{ width: '90px', textAlign: 'right', fontWeight: 700, fontSize: '12px' }}
                      />
                    </td>

                    {/* Discount % */}
                    <td style={{ padding: '12px 14px', verticalAlign: 'top', textAlign: 'right' }}>
                      <input
                        type="number"
                        min="0"
                        max="100"
                        className="proc-input"
                        value={item.discountPercent || 0}
                        onChange={(e) => {
                          const val = Math.max(0, Math.min(100, Number(e.target.value) || 0));
                          setGrnItems(prev => {
                            const next = [...prev];
                            next[idx] = { ...next[idx], discountPercent: val };
                            return next;
                          });
                        }}
                        style={{ width: '60px', textAlign: 'right', fontSize: '12px' }}
                      />
                    </td>

                    {/* GST % */}
                    <td style={{ padding: '12px 14px', verticalAlign: 'top', textAlign: 'right' }}>
                      <select
                        className="proc-select"
                        value={item.gst !== undefined ? item.gst : 12}
                        onChange={(e) => {
                          const val = Number(e.target.value);
                          setGrnItems(prev => {
                            const next = [...prev];
                            next[idx] = { ...next[idx], gst: val };
                            return next;
                          });
                        }}
                        style={{ width: '70px', fontSize: '12px' }}
                      >
                        <option value="0">0%</option>
                        <option value="5">5%</option>
                        <option value="12">12%</option>
                        <option value="18">18%</option>
                        <option value="28">28%</option>
                      </select>
                    </td>

                    {/* Net Total */}
                    <td style={{ padding: '12px 14px', verticalAlign: 'top', textAlign: 'right', background: '#F0FDF4' }}>
                      <div style={{ fontWeight: 800, color: '#15803D', fontSize: '13px' }}>
                        ₹{lineNet.toFixed(2)}
                      </div>
                    </td>

                    {/* Action */}
                    <td style={{ padding: '12px 14px', verticalAlign: 'top', textAlign: 'center' }}>
                      <button
                        type="button"
                        onClick={() => handleRemoveItem(idx)}
                        style={{ background: 'transparent', border: 'none', color: '#EF4444', cursor: 'pointer', fontSize: '16px', fontWeight: 800 }}
                        title="Remove Line"
                      >
                        ✕
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* 4. FINANCIAL SUMMARY CARDS */}
        <div style={{
          background: 'linear-gradient(135deg, #F8FAFC 0%, #F1F5F9 100%)',
          padding: '20px 24px',
          borderTop: '1.5px solid #E2E8F0',
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
          gap: '16px'
        }}>
          <div style={{ background: '#FFFFFF', padding: '14px 18px', borderRadius: '12px', border: '1px solid #E2E8F0' }}>
            <span style={{ fontSize: '11px', color: '#64748B', fontWeight: 700, textTransform: 'uppercase' }}>Subtotal (Gross)</span>
            <div style={{ fontSize: '18px', fontWeight: 900, color: '#0F172A', marginTop: '2px' }}>₹{liveTotals.subtotal.toFixed(2)}</div>
          </div>
          <div style={{ background: '#FFFFFF', padding: '14px 18px', borderRadius: '12px', border: '1px solid #E2E8F0' }}>
            <span style={{ fontSize: '11px', color: '#EA580C', fontWeight: 700, textTransform: 'uppercase' }}>Total Discount</span>
            <div style={{ fontSize: '18px', fontWeight: 900, color: '#EA580C', marginTop: '2px' }}>-₹{liveTotals.totalDiscount.toFixed(2)}</div>
          </div>
          <div style={{ background: '#FFFFFF', padding: '14px 18px', borderRadius: '12px', border: '1px solid #E2E8F0' }}>
            <span style={{ fontSize: '11px', color: '#475569', fontWeight: 700, textTransform: 'uppercase' }}>Taxable Base</span>
            <div style={{ fontSize: '18px', fontWeight: 900, color: '#1E293B', marginTop: '2px' }}>₹{liveTotals.taxableBase.toFixed(2)}</div>
          </div>
          <div style={{ background: '#FFFFFF', padding: '14px 18px', borderRadius: '12px', border: '1px solid #E2E8F0' }}>
            <span style={{ fontSize: '11px', color: '#2563EB', fontWeight: 700, textTransform: 'uppercase' }}>Total GST</span>
            <div style={{ fontSize: '18px', fontWeight: 900, color: '#2563EB', marginTop: '2px' }}>+₹{liveTotals.totalGst.toFixed(2)}</div>
          </div>
          <div style={{ background: 'linear-gradient(135deg, #059669 0%, #10B981 100%)', padding: '14px 18px', borderRadius: '12px', color: '#FFFFFF', boxShadow: '0 4px 12px rgba(16,185,129,0.25)' }}>
            <span style={{ fontSize: '11px', color: '#ECFDF5', fontWeight: 800, textTransform: 'uppercase' }}>Grand Total (Physical)</span>
            <div style={{ fontSize: '20px', fontWeight: 900, marginTop: '2px' }}>₹{liveTotals.grandTotal.toFixed(2)}</div>
          </div>
        </div>
      </div>

      {/* 5. SUPPLIER INVOICE & DOCUMENTATION */}
      <div style={{
        background: '#FFFFFF',
        border: '1.5px solid #E2E8F0',
        borderRadius: '18px',
        padding: '24px',
        boxShadow: '0 2px 8px rgba(15, 23, 42, 0.04)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px', borderBottom: '1px solid #F1F5F9', paddingBottom: '10px' }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#2563EB" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
            <polyline points="14 2 14 8 20 8"/>
            <line x1="16" y1="13" x2="8" y2="13"/>
            <line x1="16" y1="17" x2="8" y2="17"/>
            <polyline points="10 9 9 9 8 9"/>
          </svg>
          <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 800, color: '#0F172A' }}>
            Supplier Invoice & Reconciliation Documents
          </h3>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px' }}>
          <div>
            <label className="proc-form-label" style={{ marginBottom: '6px', fontSize: '11px', textTransform: 'uppercase', color: '#475569', fontWeight: 800 }}>
              Invoice / Bill Number <span style={{ color: '#EF4444' }}>*</span>
            </label>
            <input
              type="text"
              required
              className="proc-input"
              placeholder="e.g. INV-2026-9021"
              value={grnInvoiceNumber}
              onChange={(e) => setGrnInvoiceNumber(e.target.value)}
              style={{ width: '100%', fontWeight: 700 }}
            />
          </div>

          <div>
            <label className="proc-form-label" style={{ marginBottom: '6px', fontSize: '11px', textTransform: 'uppercase', color: '#475569', fontWeight: 800 }}>
              Invoice Date <span style={{ color: '#EF4444' }}>*</span>
            </label>
            <input
              type="date"
              required
              className="proc-input"
              value={grnInvoiceDate}
              onChange={(e) => setGrnInvoiceDate(e.target.value)}
              style={{ width: '100%' }}
            />
          </div>

          <div>
            <label className="proc-form-label" style={{ marginBottom: '6px', fontSize: '11px', textTransform: 'uppercase', color: '#475569', fontWeight: 800 }}>
              Invoiced Total Amount (₹) <span style={{ color: '#EF4444' }}>*</span>
            </label>
            <input
              type="number"
              min="0"
              step="0.01"
              required
              className="proc-input"
              placeholder="Total on physical bill"
              value={grnInvoiceAmount}
              onChange={(e) => setGrnInvoiceAmount(e.target.value)}
              style={{ width: '100%', fontWeight: 800, fontSize: '13.5px' }}
            />
          </div>

          {/* Variance Check */}
          <div>
            <label className="proc-form-label" style={{ marginBottom: '6px', fontSize: '11px', textTransform: 'uppercase', color: '#475569', fontWeight: 800 }}>
              Reconciliation Variance
            </label>
            <div style={{
              height: '42px',
              borderRadius: '8px',
              display: 'flex',
              alignItems: 'center',
              padding: '0 12px',
              fontWeight: 800,
              fontSize: '13px',
              background: invoicedVal > 0 
                ? (Math.abs(varianceVal) < 0.05 ? '#DCFCE7' : '#FEF2F2')
                : '#F1F5F9',
              color: invoicedVal > 0 
                ? (Math.abs(varianceVal) < 0.05 ? '#166534' : '#991B1B')
                : '#64748B',
              border: `1px solid ${invoicedVal > 0 ? (Math.abs(varianceVal) < 0.05 ? '#86EFAC' : '#FECACA') : '#CBD5E1'}`
            }}>
              {invoicedVal > 0 ? (
                Math.abs(varianceVal) < 0.05 ? (
                  '✓ Exact Match (₹0.00)'
                ) : (
                  `⚠️ Discrepancy: ${varianceVal > 0 ? '+' : ''}₹${varianceVal.toFixed(2)}`
                )
              ) : (
                'Enter bill amount'
              )}
            </div>
          </div>
        </div>

        {/* Invoice File Upload */}
        <div style={{ marginTop: '18px' }}>
          <label className="proc-form-label" style={{ marginBottom: '6px', fontSize: '11px', textTransform: 'uppercase', color: '#475569', fontWeight: 800 }}>
            Upload Signed Invoice / Challan Attachment
          </label>
          <div style={{
            border: '2px dashed #CBD5E1',
            borderRadius: '12px',
            padding: '20px',
            textAlign: 'center',
            background: '#F8FAFC',
            position: 'relative'
          }}>
            <input
              type="file"
              accept="image/*,application/pdf"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) {
                  setGrnIsUploading(true);
                  setGrnUploadProgress(0);
                  let p = 0;
                  const timer = setInterval(() => {
                    p += 25;
                    setGrnUploadProgress(p);
                    if (p >= 100) {
                      clearInterval(timer);
                      setGrnIsUploading(false);
                      const reader = new FileReader();
                      reader.onload = (event) => {
                        setGrnInvoiceFile(file);
                        setGrnInvoiceFileName(event.target.result || file.name);
                      };
                      reader.readAsDataURL(file);
                    }
                  }, 60);
                }
              }}
              style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer', zIndex: 10 }}
            />
            {grnIsUploading ? (
              <div>
                <div style={{ fontSize: '12.5px', fontWeight: 700, color: '#2563EB', marginBottom: '8px' }}>Uploading bill scan... {grnUploadProgress}%</div>
                <div style={{ width: '200px', height: '6px', background: '#E2E8F0', borderRadius: '10px', margin: '0 auto', overflow: 'hidden' }}>
                  <div style={{ width: `${grnUploadProgress}%`, height: '100%', background: '#2563EB', transition: 'width 0.1s' }} />
                </div>
              </div>
            ) : grnInvoiceFileName ? (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px' }}>
                <span style={{ fontSize: '20px' }}>📄</span>
                <span style={{ fontSize: '13px', fontWeight: 700, color: '#0F172A' }}>{grnInvoiceFile?.name || 'Attached Invoice Document'}</span>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setGrnInvoiceFile(null);
                    setGrnInvoiceFileName('');
                  }}
                  style={{ background: '#FEE2E2', border: '1px solid #FECACA', color: '#DC2626', borderRadius: '6px', padding: '3px 8px', fontSize: '11px', fontWeight: 800, cursor: 'pointer', zIndex: 20 }}
                >
                  Remove
                </button>
              </div>
            ) : (
              <div>
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#94A3B8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ margin: '0 auto 6px auto', display: 'block' }}>
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                  <polyline points="17 8 12 3 7 8"/>
                  <line x1="12" y1="3" x2="12" y2="15"/>
                </svg>
                <div style={{ fontSize: '13px', fontWeight: 700, color: '#1E293B' }}>Click or drop supplier invoice PDF / image here</div>
                <div style={{ fontSize: '11px', color: '#64748B' }}>Supports PDF, JPG, PNG up to 10MB</div>
              </div>
            )}
          </div>
        </div>

        {/* Remarks */}
        <div style={{ marginTop: '18px' }}>
          <label className="proc-form-label" style={{ marginBottom: '6px', fontSize: '11px', textTransform: 'uppercase', color: '#475569', fontWeight: 800 }}>
            Receiving & Physical Condition Remarks (Optional)
          </label>
          <textarea
            className="proc-input"
            rows="2"
            placeholder="Carton seals verified, cold-chain temperature logged, no dampness or transport damages..."
            value={grnNotes}
            onChange={(e) => setGrnNotes(e.target.value)}
            style={{ width: '100%', resize: 'vertical' }}
          />
        </div>
      </div>

      {/* 6. BOTTOM STICKY ACTION BAR */}
      <div style={{
        position: 'sticky',
        bottom: '16px',
        background: 'rgba(255, 255, 255, 0.95)',
        backdropFilter: 'blur(10px)',
        border: '1.5px solid #E2E8F0',
        borderRadius: '16px',
        padding: '16px 24px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        boxShadow: '0 8px 30px rgba(15, 23, 42, 0.12)',
        zIndex: 100
      }}>
        <button
          type="button"
          onClick={onCancel}
          className="proc-btn proc-btn-secondary"
          style={{ padding: '10px 20px', fontSize: '13px' }}
        >
          Cancel
        </button>

        <div style={{ display: 'flex', gap: '12px' }}>
          <button
            type="button"
            disabled={submitting}
            onClick={(e) => handleSubmit(e, 'Draft')}
            className="proc-btn proc-btn-secondary"
            style={{ padding: '10px 20px', fontSize: '13px', fontWeight: 700 }}
          >
            Save as Draft
          </button>

          <button
            type="button"
            disabled={submitting}
            onClick={(e) => handleSubmit(e, 'Verified/Completed')}
            className="proc-btn"
            style={{
              padding: '10px 24px',
              fontSize: '13.5px',
              fontWeight: 800,
              background: 'linear-gradient(135deg, #059669 0%, #10B981 100%)',
              color: '#FFFFFF',
              boxShadow: '0 4px 14px rgba(16, 185, 129, 0.35)',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer'
            }}
          >
            {submitting ? 'Updating Inventory...' : 'Generate GRN & Update Inventory →'}
          </button>
        </div>
      </div>
    </div>
  );
}
