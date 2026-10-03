import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import api from '../../utils/api';

const STATUS_COLORS = {
  DRAFT: { bg: '#F1F5F9', color: '#64748B' },
  PENDING: { bg: '#EFF6FF', color: '#1D4ED8' },
  SUBMITTED: { bg: '#DBEAFE', color: '#1D4ED8' },
  UNDER_REVIEW: { bg: '#FEF3C7', color: '#92400E' },
  APPROVED: { bg: '#DCFCE7', color: '#166534' },
  REJECTED: { bg: '#FEE2E2', color: '#991B1B' },
  CANCELLED: { bg: '#F1F5F9', color: '#94A3B8' }
};

export default function ItemRequestsPanel({ showToast, onSwitchTab }) {
  // Master Type subtab: 'ALL' | 'ITEM' | 'VENDOR'
  const [masterTab, setMasterTab] = useState('ALL');

  const [itemRequests, setItemRequests] = useState([]);
  const [vendorRequests, setVendorRequests] = useState([]);
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('all');
  const [expanded, setExpanded] = useState(null);

  const showToastRef = useRef(showToast);
  useEffect(() => { showToastRef.current = showToast; }, [showToast]);

  const fetchRequests = useCallback(async (isInitial = false) => {
    try {
      if (isInitial) setInitialLoading(true);
      setLoading(true);

      const [itemRes, vendorRes] = await Promise.allSettled([
        api.get('/item-requests', { params: { limit: 100 } }),
        api.get('/hospital-vendors/my-requests')
      ]);

      if (itemRes.status === 'fulfilled' && itemRes.value.data?.success) {
        setItemRequests((itemRes.value.data.data || []).map(r => ({ ...r, masterType: 'ITEM' })));
      } else {
        setItemRequests([]);
      }

      if (vendorRes.status === 'fulfilled' && vendorRes.value.data?.success) {
        setVendorRequests((vendorRes.value.data.data || []).map(r => ({ ...r, masterType: 'VENDOR' })));
      } else {
        setVendorRequests([]);
      }
    } catch (err) {
      if (showToastRef.current) showToastRef.current('Failed to load master requests', 'error');
    } finally {
      setLoading(false);
      setInitialLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRequests(true);
  }, [fetchRequests]);

  const handleCancelItem = async (req) => {
    if (!window.confirm(`Cancel item request ${req.requestNo}?`)) return;
    try {
      await api.put(`/item-requests/${req._id}/cancel`);
      if (showToastRef.current) showToastRef.current('Item request cancelled', 'success');
      fetchRequests(false);
    } catch (err) {
      if (showToastRef.current) showToastRef.current(err.response?.data?.error || 'Failed to cancel', 'error');
    }
  };

  // Filter combined requests by tab and status
  const displayedRequests = useMemo(() => {
    let list = [];
    if (masterTab === 'ALL') {
      list = [...itemRequests, ...vendorRequests];
    } else if (masterTab === 'ITEM') {
      list = [...itemRequests];
    } else if (masterTab === 'VENDOR') {
      list = [...vendorRequests];
    }

    if (statusFilter !== 'all') {
      list = list.filter(r => (r.status || '').toUpperCase() === statusFilter.toUpperCase());
    }

    list.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
    return list;
  }, [masterTab, statusFilter, itemRequests, vendorRequests]);

  const counts = useMemo(() => ({
    all: itemRequests.length + vendorRequests.length,
    item: itemRequests.length,
    vendor: vendorRequests.length,
    pending: [...itemRequests, ...vendorRequests].filter(r => ['PENDING', 'SUBMITTED', 'UNDER_REVIEW'].includes(r.status)).length
  }), [itemRequests, vendorRequests]);

  const fmt = (d) => d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', width: '100%', minWidth: 0, paddingBottom: '40px' }}>
      {/* Top Header Card */}
      <div style={{
        background: '#FFFFFF',
        borderRadius: '8px',
        padding: '12px 18px',
        border: '1px solid #E2E8F0',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '12px',
        boxShadow: '0 1px 2px rgba(0,0,0,0.02)'
      }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 800, color: '#0F172A' }}>Master Requests</h2>
            <span style={{ fontSize: '11px', fontWeight: 750, color: '#2563EB', background: '#EFF6FF', padding: '2px 8px', borderRadius: '4px' }}>
              Hospital Portal
            </span>
          </div>
          <p style={{ margin: '3px 0 0', fontSize: '12px', color: '#64748B' }}>
            Track and manage your requests submitted to SuperAdmin across Item Master and Vendor Master
          </p>
        </div>

        {/* Action Buttons */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={() => onSwitchTab && onSwitchTab('item-master')}
            style={{
              padding: '6px 14px',
              borderRadius: '6px',
              border: '1px solid #CBD5E1',
              background: '#FFFFFF',
              color: '#1E293B',
              fontSize: '12px',
              fontWeight: 700,
              cursor: 'pointer'
            }}
          >
            + Request Item (via Item Master)
          </button>
          <button
            type="button"
            onClick={() => onSwitchTab && onSwitchTab('vendors')}
            style={{
              padding: '6px 14px',
              borderRadius: '6px',
              border: 'none',
              background: '#2563EB',
              color: '#FFFFFF',
              fontSize: '12px',
              fontWeight: 700,
              cursor: 'pointer'
            }}
          >
            + Request New Vendor
          </button>
        </div>
      </div>

      {/* Master Type Sub-Tabs */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        background: '#FFFFFF',
        padding: '6px 10px',
        borderRadius: '8px',
        border: '1px solid #E2E8F0',
        overflowX: 'auto'
      }}>
        <button
          type="button"
          onClick={() => setMasterTab('ALL')}
          style={{
            padding: '6px 14px',
            borderRadius: '6px',
            border: masterTab === 'ALL' ? '1px solid #2563EB' : '1px solid transparent',
            background: masterTab === 'ALL' ? '#EFF6FF' : 'transparent',
            color: masterTab === 'ALL' ? '#1D4ED8' : '#475569',
            fontSize: '12px',
            fontWeight: masterTab === 'ALL' ? 800 : 650,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '6px'
          }}
        >
          <span>All Master Requests</span>
          <span style={{ fontSize: '10.5px', padding: '1px 6px', borderRadius: '10px', background: masterTab === 'ALL' ? '#DBEAFE' : '#F1F5F9', color: masterTab === 'ALL' ? '#1E40AF' : '#64748B' }}>
            {counts.all}
          </span>
          {counts.pending > 0 && (
            <span style={{ fontSize: '10px', fontWeight: 800, background: '#DC2626', color: '#FFF', padding: '1px 5px', borderRadius: '10px' }}>
              {counts.pending} pending
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => setMasterTab('ITEM')}
          style={{
            padding: '6px 14px',
            borderRadius: '6px',
            border: masterTab === 'ITEM' ? '1px solid #2563EB' : '1px solid transparent',
            background: masterTab === 'ITEM' ? '#EFF6FF' : 'transparent',
            color: masterTab === 'ITEM' ? '#1D4ED8' : '#475569',
            fontSize: '12px',
            fontWeight: masterTab === 'ITEM' ? 800 : 650,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '6px'
          }}
        >
          <span>Item Master Requests</span>
          <span style={{ fontSize: '10.5px', padding: '1px 6px', borderRadius: '10px', background: masterTab === 'ITEM' ? '#DBEAFE' : '#F1F5F9', color: masterTab === 'ITEM' ? '#1E40AF' : '#64748B' }}>
            {counts.item}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setMasterTab('VENDOR')}
          style={{
            padding: '6px 14px',
            borderRadius: '6px',
            border: masterTab === 'VENDOR' ? '1px solid #7C3AED' : '1px solid transparent',
            background: masterTab === 'VENDOR' ? '#F5F3FF' : 'transparent',
            color: masterTab === 'VENDOR' ? '#6D28D9' : '#475569',
            fontSize: '12px',
            fontWeight: masterTab === 'VENDOR' ? 800 : 650,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '6px'
          }}
        >
          <span>Vendor Master Requests</span>
          <span style={{ fontSize: '10.5px', padding: '1px 6px', borderRadius: '10px', background: masterTab === 'VENDOR' ? '#EDE9FE' : '#F1F5F9', color: masterTab === 'VENDOR' ? '#5B21B6' : '#64748B' }}>
            {counts.vendor}
          </span>
        </button>
      </div>

      {/* Status Filter Buttons */}
      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
        {['all', 'PENDING', 'UNDER_REVIEW', 'APPROVED', 'REJECTED'].map(s => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            style={{
              padding: '5px 12px',
              borderRadius: '20px',
              fontSize: '11.5px',
              fontWeight: 700,
              cursor: 'pointer',
              background: statusFilter === s ? '#0F172A' : '#FFFFFF',
              color: statusFilter === s ? '#FFFFFF' : '#475569',
              boxShadow: statusFilter === s ? 'none' : '0 1px 2px rgba(0,0,0,0.02)',
              border: statusFilter === s ? 'none' : '1px solid #E2E8F0'
            }}
          >
            {s === 'all' ? 'All Statuses' : s.replace('_', ' ')}
          </button>
        ))}
      </div>

      {/* Main Table Card */}
      <div style={{ background: '#FFFFFF', borderRadius: '8px', border: '1px solid #E2E8F0', overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12.5px', textAlign: 'left' }}>
            <thead>
              <tr style={{ background: '#F8FAFC', borderBottom: '1px solid #E2E8F0', color: '#475569', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                <th style={{ padding: '10px 14px', fontWeight: 750 }}>Request No</th>
                <th style={{ padding: '10px 14px', fontWeight: 750 }}>Master</th>
                <th style={{ padding: '10px 14px', fontWeight: 750 }}>Requested Item / Supplier</th>
                <th style={{ padding: '10px 14px', fontWeight: 750 }}>Category / Org</th>
                <th style={{ padding: '10px 14px', fontWeight: 750 }}>Status</th>
                <th style={{ padding: '10px 14px', fontWeight: 750 }}>Submitted</th>
                <th style={{ padding: '10px 14px', fontWeight: 750 }}>Admin Feedback / Code</th>
                <th style={{ padding: '10px 14px', fontWeight: 750, textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody style={{ opacity: loading && !initialLoading ? 0.6 : 1 }}>
              {initialLoading ? (
                <tr>
                  <td colSpan="8" style={{ textAlign: 'center', padding: '40px', color: '#64748B' }}>
                    Loading master requests...
                  </td>
                </tr>
              ) : displayedRequests.length === 0 ? (
                <tr>
                  <td colSpan="8" style={{ textAlign: 'center', padding: '48px', color: '#64748B' }}>
                    <div style={{ fontSize: '32px', marginBottom: '8px' }}>📋</div>
                    <div style={{ fontWeight: 750, fontSize: '14px', color: '#1E293B', marginBottom: '4px' }}>
                      No master requests found
                    </div>
                    <div style={{ fontSize: '12px' }}>
                      Submit your first request from the Item Master or Vendor Master tabs.
                    </div>
                  </td>
                </tr>
              ) : displayedRequests.map(req => {
                const isItem = req.masterType === 'ITEM';
                const isVendor = req.masterType === 'VENDOR';
                const scolor = STATUS_COLORS[req.status] || STATUS_COLORS.DRAFT;
                const isExpanded = expanded === req._id;

                // Item info
                const itemName = isItem
                  ? (req.masterItemId?.itemName || req.proposedItem?.genericName || req.proposedItem?.itemName || req.categoryData?.itemName || 'Item')
                  : '';
                const category = isItem ? (req.category || 'Pharmacy') : (req.vendorData?.supplierType || 'Capex');

                // Vendor info
                const supplierName = isVendor ? (req.vendorData?.supplierName || 'Unnamed Vendor') : '';
                const orgType = isVendor ? (req.vendorData?.organizationType || req.vendorData?.supplierCategory || '—') : '';

                return (
                  <React.Fragment key={req._id}>
                    <tr
                      style={{ borderBottom: '1px solid #F1F5F9', cursor: 'pointer' }}
                      onClick={() => setExpanded(isExpanded ? null : req._id)}
                    >
                      {/* 1. Request No */}
                      <td style={{ padding: '12px 14px' }}>
                        <span style={{ fontFamily: 'monospace', fontWeight: 700, color: isItem ? '#2563EB' : '#7C3AED', background: isItem ? '#EFF6FF' : '#F5F3FF', padding: '3px 8px', borderRadius: '5px', fontSize: '11.5px' }}>
                          {req.requestNo}
                        </span>
                      </td>

                      {/* 2. Master Type */}
                      <td style={{ padding: '12px 14px' }}>
                        {isItem ? (
                          <span style={{ fontSize: '11px', fontWeight: 750, color: '#1E40AF', background: '#DBEAFE', padding: '2px 7px', borderRadius: '4px' }}>
                            Item Master
                          </span>
                        ) : (
                          <span style={{ fontSize: '11px', fontWeight: 750, color: '#6D28D9', background: '#EDE9FE', padding: '2px 7px', borderRadius: '4px' }}>
                            Vendor Master
                          </span>
                        )}
                      </td>

                      {/* 3. Requested Item / Supplier */}
                      <td style={{ padding: '12px 14px' }}>
                        <div style={{ fontWeight: 700, color: '#0F172A' }}>
                          {isItem ? itemName : supplierName}
                        </div>
                        {isItem && req.proposedItem?.manufacturer && (
                          <div style={{ fontSize: '11px', color: '#64748B' }}>Mfg: {req.proposedItem.manufacturer}</div>
                        )}
                        {isVendor && req.vendorData?.primaryContactPerson && (
                          <div style={{ fontSize: '11px', color: '#64748B' }}>Contact: {req.vendorData.primaryContactPerson}</div>
                        )}
                      </td>

                      {/* 4. Category / Org */}
                      <td style={{ padding: '12px 14px', color: '#475569' }}>
                        <div>{isItem ? category : `${category} • ${orgType}`}</div>
                        {isItem && req.department && (
                          <div style={{ fontSize: '10.5px', color: '#94A3B8' }}>{req.department}</div>
                        )}
                      </td>

                      {/* 5. Status */}
                      <td style={{ padding: '12px 14px' }}>
                        <span style={{ background: scolor.bg, color: scolor.color, padding: '3px 9px', borderRadius: '12px', fontSize: '11px', fontWeight: 750 }}>
                          {req.status?.replace('_', ' ')}
                        </span>
                        {req.status === 'REJECTED' && req.rejectionReason && (
                          <div style={{ fontSize: '10.5px', color: '#DC2626', marginTop: '2px', maxWidth: '160px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={req.rejectionReason}>
                            {req.rejectionReason}
                          </div>
                        )}
                      </td>

                      {/* 6. Submitted Date */}
                      <td style={{ padding: '12px 14px', fontSize: '11.5px', color: '#64748B' }}>
                        {fmt(req.createdAt)}
                      </td>

                      {/* 7. Admin Feedback / Code */}
                      <td style={{ padding: '12px 14px' }}>
                        {isItem && req.status === 'APPROVED' && req.approvedItemCode && (
                          <span style={{ fontFamily: 'monospace', fontWeight: 700, color: '#166534', background: '#DCFCE7', padding: '2px 7px', borderRadius: '4px', fontSize: '11.5px' }}>
                            ✓ {req.approvedItemCode}
                          </span>
                        )}
                        {isVendor && req.status === 'APPROVED' && (
                          <span style={{ fontWeight: 700, color: '#166534', background: '#DCFCE7', padding: '2px 7px', borderRadius: '4px', fontSize: '11px' }}>
                            ✓ Associated with Hospital
                          </span>
                        )}
                        {req.status === 'PENDING' && (
                          <span style={{ fontSize: '11px', color: '#64748B' }}>Awaiting SuperAdmin review</span>
                        )}
                        {req.status === 'UNDER_REVIEW' && (
                          <span style={{ fontSize: '11px', color: '#B45309' }}>Under evaluation by SuperAdmin</span>
                        )}
                        {req.status === 'REJECTED' && (
                          <span style={{ fontSize: '11px', color: '#DC2626' }}>Proposal Rejected</span>
                        )}
                      </td>

                      {/* 8. Actions */}
                      <td style={{ padding: '12px 14px', textAlign: 'right' }}>
                        <div style={{ display: 'inline-flex', gap: '6px' }}>
                          <button
                            type="button"
                            onClick={e => { e.stopPropagation(); setExpanded(isExpanded ? null : req._id); }}
                            style={{ background: '#F8FAFC', border: '1px solid #CBD5E1', padding: '4px 9px', fontSize: '11.5px', borderRadius: '5px', cursor: 'pointer', fontWeight: 650, color: '#334155' }}
                          >
                            {isExpanded ? 'Collapse' : 'Details'}
                          </button>
                          {isItem && ['DRAFT', 'SUBMITTED', 'PENDING'].includes(req.status) && (
                            <button
                              type="button"
                              onClick={e => { e.stopPropagation(); handleCancelItem(req); }}
                              style={{ background: '#FEF2F2', border: '1px solid #FECACA', color: '#991B1B', padding: '4px 9px', fontSize: '11.5px', borderRadius: '5px', cursor: 'pointer', fontWeight: 650 }}
                            >
                              Cancel
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>

                    {/* Accordion Expansion */}
                    {isExpanded && (
                      <tr style={{ background: '#F8FAFC' }}>
                        <td colSpan="8" style={{ padding: '16px 20px', borderBottom: '1px solid #E2E8F0' }}>
                          {isItem ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                              <div style={{ fontSize: '12px', fontWeight: 750, color: '#1E293B' }}>
                                Item Master Request Specifications
                              </div>
                              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '10px' }}>
                                {Object.entries({
                                  'Category': req.proposedItem?.categoryType || req.category,
                                  'Composition': req.proposedItem?.composition,
                                  'Strength': req.proposedItem?.strength ? `${req.proposedItem.strength} ${req.proposedItem.strengthUnit || ''}` : undefined,
                                  'Dosage Form': req.proposedItem?.dosageForm,
                                  'Route': req.proposedItem?.routeOfAdministration,
                                  'Packaging': req.proposedItem?.packSizeDescription,
                                  'Requested MRP': req.requestedMrp ? `₹${req.requestedMrp}` : undefined,
                                  'Requested Net Rate': req.requestedNetRate ? `₹${req.requestedNetRate}` : undefined,
                                  'Review Notes': req.reviewNotes
                                }).filter(([, v]) => v).map(([k, v]) => (
                                  <div key={k} style={{ background: '#FFFFFF', padding: '8px 10px', borderRadius: '6px', border: '1px solid #E2E8F0' }}>
                                    <div style={{ fontSize: '10px', fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>{k}</div>
                                    <div style={{ fontSize: '12px', color: '#0F172A', fontWeight: 600 }}>{v}</div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                              <div style={{ fontSize: '12px', fontWeight: 750, color: '#1E293B' }}>
                                Vendor Master Proposal Details
                              </div>
                              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '10px' }}>
                                {Object.entries({
                                  'Supplier Name': req.vendorData?.supplierName,
                                  'Supplier Code': req.vendorData?.supplierCode || 'Auto',
                                  'Type': req.vendorData?.supplierType,
                                  'Category': req.vendorData?.supplierCategory,
                                  'Organization': req.vendorData?.organizationType,
                                  'GST No': req.vendorData?.gstNo,
                                  'PAN No': req.vendorData?.panCardNo,
                                  'Primary Contact': req.vendorData?.primaryContactPerson,
                                  'Mobile': req.vendorData?.primaryContactPersonMobileNo,
                                  'Email': req.vendorData?.emailId || req.vendorData?.primaryContactPersonEmailId,
                                  'City / State': `${req.vendorData?.bank1City || ''} ${req.vendorData?.stateCode || ''}`.trim() || undefined,
                                  'Rejection Reason': req.rejectionReason
                                }).filter(([, v]) => v).map(([k, v]) => (
                                  <div key={k} style={{ background: '#FFFFFF', padding: '8px 10px', borderRadius: '6px', border: '1px solid #E2E8F0' }}>
                                    <div style={{ fontSize: '10px', fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>{k}</div>
                                    <div style={{ fontSize: '12px', color: k === 'Rejection Reason' ? '#DC2626' : '#0F172A', fontWeight: 600 }}>{v}</div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
