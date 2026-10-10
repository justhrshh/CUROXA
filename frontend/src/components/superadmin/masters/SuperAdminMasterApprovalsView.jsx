import { getAccessToken } from '../../../utils/authTokenStore';
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import * as Icons from 'lucide-react';
import axios from 'axios';
import { getApiUrl } from '../../../utils/api';
import {
  MASTER_SCHEMA_REGISTRY,
  getAllCategories,
  getCategoryConfig
} from '../../../config/masterSchemaRegistry';

const LucideIcon = ({ name, ...props }) => {
  if (!name) return <Icons.HelpCircle {...props} />;
  const camelName = name
    .split('-')
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join('');
  const IconComponent = Icons[camelName] || Icons.HelpCircle;
  return <IconComponent {...props} />;
};

export default function SuperAdminMasterApprovalsView() {
  // Master Type selection: 'ALL' | 'ITEM' | 'VENDOR'
  const [masterTab, setMasterTab] = useState('ALL');

  // Unified Request Lists
  const [itemRequests, setItemRequests] = useState([]);
  const [vendorRequests, setVendorRequests] = useState([]);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [toastMsg, setToastMsg] = useState(null);
  const [hospitals, setHospitals] = useState([]);

  // Filters
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [tenantFilter, setTenantFilter] = useState('ALL');
  const [typeFilter, setTypeFilter] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize] = useState(25);

  // Item Review Modal state
  const [activeItemRequest, setActiveItemRequest] = useState(null);
  const [isItemReviewOpen, setIsItemReviewOpen] = useState(false);
  const [approvedPrice, setApprovedPrice] = useState({ mrp: '', netRate: '', hospitalCost: '' });
  const [reviewNote, setReviewNote] = useState('');
  const [reviewSubmitting, setReviewSubmitting] = useState(false);

  // Item Rejection Modal state
  const [isItemRejectOpen, setIsItemRejectOpen] = useState(false);
  const [itemRejectionReason, setItemRejectionReason] = useState('');
  const [itemRejecting, setItemRejecting] = useState(false);

  // Conversion state (Convert Path B -> Path A)
  const [isConvertOpen, setIsConvertOpen] = useState(false);
  const [convertSearch, setConvertSearch] = useState('');
  const [candidateGlobalItems, setCandidateGlobalItems] = useState([]);
  const [loadingCandidates, setLoadingCandidates] = useState(false);
  const [selectedCanonicalItem, setSelectedCanonicalItem] = useState(null);
  const [converting, setConverting] = useState(false);

  // Vendor Review Modal state
  const [activeVendorRequest, setActiveVendorRequest] = useState(null);
  const [isVendorReviewOpen, setIsVendorReviewOpen] = useState(false);
  const [vendorReviewMode, setVendorReviewMode] = useState('view'); // 'view' | 'approve' | 'reject'
  const [vendorRejectionReason, setVendorRejectionReason] = useState('');
  const [vendorActionLoading, setVendorActionLoading] = useState(false);

  const showToast = (message, type = 'success') => {
    setToastMsg({ message, type });
    setTimeout(() => setToastMsg(null), 4000);
  };

  // Fetch hospital tenant list
  useEffect(() => {
    const fetchHospitals = async () => {
      try {
        const token = (getAccessToken() || localStorage.getItem('token'));
        const res = await axios.get(getApiUrl('/superadmin/masters/hospitals-list'), {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (res.data.success) {
          setHospitals(res.data.data || []);
        }
      } catch (err) {
        console.error('Error fetching hospitals list:', err);
      }
    };
    fetchHospitals();
  }, []);

  // Fetch Requests (Both Item and Vendor)
  const fetchRequests = useCallback(async () => {
    setLoading(true);
    setErrorMsg('');
    try {
      const token = (getAccessToken() || localStorage.getItem('token'));
      const headers = { Authorization: `Bearer ${token}` };

      // 1. Fetch Item Requests
      const itemParams = {
        page: 1,
        limit: 100,
        status: statusFilter !== 'ALL' ? statusFilter : undefined,
        tenantId: tenantFilter !== 'ALL' ? tenantFilter : undefined,
        requestType: typeFilter !== 'ALL' ? typeFilter : undefined,
        search: searchQuery || undefined
      };

      // 2. Fetch Vendor Requests
      const vendorParams = {
        page: 1,
        limit: 100,
        status: statusFilter !== 'ALL' ? statusFilter : undefined,
        tenantId: tenantFilter !== 'ALL' ? tenantFilter : undefined
      };

      const [itemRes, vendorRes] = await Promise.allSettled([
        axios.get(getApiUrl('/item-requests/admin/all'), { headers, params: itemParams }),
        axios.get(getApiUrl('/superadmin/vendor-requests'), { headers, params: vendorParams })
      ]);

      if (itemRes.status === 'fulfilled' && itemRes.value.data?.success) {
        const items = (itemRes.value.data.data || []).map(r => ({
          ...r,
          masterType: 'ITEM'
        }));
        setItemRequests(items);
      } else {
        setItemRequests([]);
      }

      if (vendorRes.status === 'fulfilled' && vendorRes.value.data?.success) {
        let vendors = (vendorRes.value.data.data || []).map(r => ({
          ...r,
          masterType: 'VENDOR'
        }));
        // Apply client search on vendors if search query exists
        if (searchQuery && searchQuery.trim()) {
          const q = searchQuery.toLowerCase().trim();
          vendors = vendors.filter(v => {
            const vData = v.vendorData || {};
            return (
              (v.requestNo || '').toLowerCase().includes(q) ||
              (v.hospitalName || '').toLowerCase().includes(q) ||
              (v.tenantId || '').toLowerCase().includes(q) ||
              (vData.supplierName || '').toLowerCase().includes(q) ||
              (vData.supplierCode || '').toLowerCase().includes(q) ||
              (vData.gstNo || '').toLowerCase().includes(q) ||
              (vData.panCardNo || '').toLowerCase().includes(q) ||
              (vData.primaryContactPerson || '').toLowerCase().includes(q)
            );
          });
        }
        setVendorRequests(vendors);
      } else {
        setVendorRequests([]);
      }
    } catch (err) {
      setErrorMsg(err.response?.data?.error || err.message || 'Failed to load requests');
    } finally {
      setLoading(false);
    }
  }, [statusFilter, tenantFilter, typeFilter, searchQuery]);

  useEffect(() => {
    fetchRequests();
  }, [fetchRequests]);

  // Combined & Filtered Requests based on active masterTab
  const combinedRequests = useMemo(() => {
    let list = [];
    if (masterTab === 'ALL') {
      list = [...itemRequests, ...vendorRequests];
    } else if (masterTab === 'ITEM') {
      list = [...itemRequests];
    } else if (masterTab === 'VENDOR') {
      list = [...vendorRequests];
    }

    // Sort newest first
    list.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
    return list;
  }, [masterTab, itemRequests, vendorRequests]);

  // Pagination calculation
  const totalItems = combinedRequests.length;
  const totalPages = Math.ceil(totalItems / pageSize) || 1;
  const paginatedRequests = useMemo(() => {
    const start = (page - 1) * pageSize;
    return combinedRequests.slice(start, start + pageSize);
  }, [combinedRequests, page, pageSize]);

  // Counts
  const counts = useMemo(() => {
    const pendingItems = itemRequests.filter(r => ['PENDING', 'SUBMITTED', 'UNDER_REVIEW'].includes(r.status)).length;
    const pendingVendors = vendorRequests.filter(r => ['PENDING', 'UNDER_REVIEW'].includes(r.status)).length;
    return {
      all: itemRequests.length + vendorRequests.length,
      item: itemRequests.length,
      vendor: vendorRequests.length,
      pendingTotal: pendingItems + pendingVendors,
      pendingItems,
      pendingVendors
    };
  }, [itemRequests, vendorRequests]);

  // ─────────────────────────────────────────────────────────────────────────────
  // ITEM REQUEST REVIEW HANDLERS
  // ─────────────────────────────────────────────────────────────────────────────
  const handleOpenItemReview = async (req) => {
    setActiveItemRequest(req);
    setApprovedPrice({
      mrp: req.approvedMrp !== null && req.approvedMrp !== undefined ? req.approvedMrp : (req.requestedMrp ?? ''),
      netRate: req.approvedNetRate !== null && req.approvedNetRate !== undefined ? req.approvedNetRate : (req.requestedNetRate ?? ''),
      hospitalCost: req.approvedHospitalCost !== null && req.approvedHospitalCost !== undefined ? req.approvedHospitalCost : (req.requestedHospitalCost ?? '')
    });
    setReviewNote(req.reviewNotes || '');
    setIsItemReviewOpen(true);

    if (['SUBMITTED', 'PENDING'].includes(req.status)) {
      try {
        const token = (getAccessToken() || localStorage.getItem('token'));
        await axios.put(getApiUrl(`/item-requests/admin/${req._id}/review`), { note: 'Review opened by Super Admin' }, {
          headers: { Authorization: `Bearer ${token}` }
        });
        setActiveItemRequest(prev => ({ ...prev, status: 'UNDER_REVIEW' }));
      } catch (_) {}
    }
  };

  const handleApproveItem = async () => {
    if (!activeItemRequest) return;
    setReviewSubmitting(true);
    setErrorMsg('');
    try {
      const token = (getAccessToken() || localStorage.getItem('token'));
      const payload = {
        approvedMrp: approvedPrice.mrp !== '' ? Number(approvedPrice.mrp) : null,
        approvedNetRate: approvedPrice.netRate !== '' ? Number(approvedPrice.netRate) : null,
        approvedHospitalCost: approvedPrice.hospitalCost !== '' ? Number(approvedPrice.hospitalCost) : null,
        note: reviewNote
      };

      const res = await axios.put(getApiUrl(`/item-requests/admin/${activeItemRequest._id}/approve`), payload, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (res.data.success) {
        setIsItemReviewOpen(false);
        setActiveItemRequest(null);
        showToast('Item request approved successfully');
        fetchRequests();
      }
    } catch (err) {
      setErrorMsg(err.response?.data?.error || err.message || 'Approval failed');
    } finally {
      setReviewSubmitting(false);
    }
  };

  const handleOpenItemReject = () => {
    setItemRejectionReason('');
    setIsItemRejectOpen(true);
  };

  const handleConfirmItemReject = async () => {
    if (!itemRejectionReason.trim()) {
      alert('Rejection reason is required.');
      return;
    }
    setItemRejecting(true);
    try {
      const token = (getAccessToken() || localStorage.getItem('token'));
      const res = await axios.put(getApiUrl(`/item-requests/admin/${activeItemRequest._id}/reject`), {
        rejectionReason: itemRejectionReason.trim(),
        note: reviewNote
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (res.data.success) {
        setIsItemRejectOpen(false);
        setIsItemReviewOpen(false);
        setActiveItemRequest(null);
        showToast('Item request rejected', 'info');
        fetchRequests();
      }
    } catch (err) {
      alert(err.response?.data?.error || err.message || 'Rejection failed');
    } finally {
      setItemRejecting(false);
    }
  };

  // Search candidate global items for conversion
  useEffect(() => {
    if (!isConvertOpen || !activeItemRequest) return;
    let isMounted = true;
    const fetchCandidates = async () => {
      setLoadingCandidates(true);
      try {
        const token = (getAccessToken() || localStorage.getItem('token'));
        const res = await axios.get(getApiUrl('/superadmin/masters/unassigned-global-items'), {
          headers: { Authorization: `Bearer ${token}` },
          params: {
            tenantId: activeItemRequest.tenantId,
            category: activeItemRequest.category,
            search: convertSearch || undefined
          }
        });
        if (isMounted && res.data.success) {
          setCandidateGlobalItems(res.data.data || []);
        }
      } catch (err) {
        console.error('Error fetching conversion candidates:', err);
      } finally {
        if (isMounted) setLoadingCandidates(false);
      }
    };
    fetchCandidates();
    return () => { isMounted = false; };
  }, [isConvertOpen, activeItemRequest, convertSearch]);

  const handleConfirmConvert = async () => {
    if (!selectedCanonicalItem) {
      alert('Please select a canonical global item to link.');
      return;
    }
    setConverting(true);
    try {
      const token = (getAccessToken() || localStorage.getItem('token'));
      const res = await axios.put(getApiUrl(`/item-requests/admin/${activeItemRequest._id}/convert-to-assign`), {
        canonicalMasterItemId: selectedCanonicalItem._id,
        note: `Matched proposal with canonical item ${selectedCanonicalItem.itemCode} (${selectedCanonicalItem.itemName || selectedCanonicalItem.genericName})`
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (res.data.success) {
        setIsConvertOpen(false);
        setActiveItemRequest(res.data.data);
        showToast('Proposal converted to Path A assignment');
        fetchRequests();
      }
    } catch (err) {
      alert(err.response?.data?.error || err.message || 'Conversion failed');
    } finally {
      setConverting(false);
    }
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // VENDOR REQUEST REVIEW HANDLERS
  // ─────────────────────────────────────────────────────────────────────────────
  const handleOpenVendorReview = (req, mode = 'view') => {
    setActiveVendorRequest(req);
    setVendorReviewMode(mode);
    setVendorRejectionReason('');
    setIsVendorReviewOpen(true);
  };

  const handleApproveVendor = async () => {
    if (!activeVendorRequest) return;
    try {
      setVendorActionLoading(true);
      const token = (getAccessToken() || localStorage.getItem('token'));
      const res = await axios.post(getApiUrl(`/superadmin/vendor-requests/${activeVendorRequest._id}/approve`), {}, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (res.data.success) {
        showToast(`Vendor request ${activeVendorRequest.requestNo} approved and vendor associated successfully!`);
        setIsVendorReviewOpen(false);
        setActiveVendorRequest(null);
        fetchRequests();
      } else {
        alert(res.data.error || 'Failed to approve vendor request');
      }
    } catch (err) {
      alert(err.response?.data?.error || err.message || 'Error executing vendor approval');
    } finally {
      setVendorActionLoading(false);
    }
  };

  const handleRejectVendor = async () => {
    if (!activeVendorRequest) return;
    if (!vendorRejectionReason.trim()) {
      alert('Please provide a reason for rejection');
      return;
    }

    try {
      setVendorActionLoading(true);
      const token = (getAccessToken() || localStorage.getItem('token'));
      const res = await axios.post(getApiUrl(`/superadmin/vendor-requests/${activeVendorRequest._id}/reject`), {
        rejectionReason: vendorRejectionReason.trim()
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (res.data.success) {
        showToast(`Vendor request ${activeVendorRequest.requestNo} rejected`, 'info');
        setIsVendorReviewOpen(false);
        setActiveVendorRequest(null);
        fetchRequests();
      } else {
        alert(res.data.error || 'Failed to reject vendor request');
      }
    } catch (err) {
      alert(err.response?.data?.error || err.message || 'Error rejecting vendor request');
    } finally {
      setVendorActionLoading(false);
    }
  };

  // Badge renderer
  const renderStatusBadge = (status) => {
    switch (status) {
      case 'APPROVED':
        return (
          <span style={{ fontSize: '11px', fontWeight: 800, padding: '3px 8px', borderRadius: '6px', background: '#DCFCE7', color: '#166534', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
            <LucideIcon name="check-circle" size={12} /> Approved
          </span>
        );
      case 'REJECTED':
        return (
          <span style={{ fontSize: '11px', fontWeight: 800, padding: '3px 8px', borderRadius: '6px', background: '#FEE2E2', color: '#991B1B', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
            <LucideIcon name="x-circle" size={12} /> Rejected
          </span>
        );
      case 'UNDER_REVIEW':
        return (
          <span style={{ fontSize: '11px', fontWeight: 800, padding: '3px 8px', borderRadius: '6px', background: '#FEF3C7', color: '#92400E', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
            <LucideIcon name="eye" size={12} /> Under Review
          </span>
        );
      case 'CANCELLED':
        return (
          <span style={{ fontSize: '11px', fontWeight: 800, padding: '3px 8px', borderRadius: '6px', background: '#F1F5F9', color: '#64748B' }}>
            Cancelled
          </span>
        );
      default:
        return (
          <span style={{ fontSize: '11px', fontWeight: 800, padding: '3px 8px', borderRadius: '6px', background: '#EFF6FF', color: '#1D4ED8', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
            <LucideIcon name="clock" size={12} /> Pending
          </span>
        );
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', width: '100%', minWidth: 0, paddingBottom: '40px' }}>
      {/* Toast Notification */}
      {toastMsg && (
        <div style={{
          position: 'fixed',
          top: '20px',
          right: '20px',
          zIndex: 100000,
          padding: '10px 18px',
          borderRadius: '6px',
          background: toastMsg.type === 'error' ? '#EF4444' : (toastMsg.type === 'info' ? '#3B82F6' : '#10B981'),
          color: '#FFFFFF',
          fontWeight: 650,
          fontSize: '13px',
          boxShadow: '0 8px 20px rgba(0,0,0,0.18)',
          display: 'flex',
          alignItems: 'center',
          gap: '8px'
        }}>
          <LucideIcon name={toastMsg.type === 'error' ? 'alert-triangle' : 'check-circle-2'} size={16} color="#FFFFFF" />
          {toastMsg.message}
        </div>
      )}

      {/* TOP HEADER: MASTER REQUESTS & APPROVALS WORKFLOW */}
      <div style={{
        background: '#FFFFFF',
        borderRadius: '8px',
        padding: '10px 16px',
        border: '1px solid #E2E8F0',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '12px',
        boxShadow: '0 1px 2px rgba(0,0,0,0.02)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{
            width: '32px',
            height: '32px',
            borderRadius: '7px',
            background: 'linear-gradient(135deg, #1E40AF 0%, #2563EB 100%)',
            color: '#FFFFFF',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 2px 4px rgba(37,99,235,0.2)'
          }}>
            <LucideIcon name="clipboard-check" size={17} color="#FFFFFF" />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <h2 style={{ fontSize: '15px', fontWeight: 800, color: '#0F172A', margin: 0 }}>
                Master Requests
              </h2>
              <span style={{ fontSize: '10.5px', fontWeight: 750, color: '#2563EB', background: '#EFF6FF', padding: '2px 7px', borderRadius: '4px' }}>
                Central Approvals Queue
              </span>
            </div>
            <p style={{ fontSize: '11.5px', color: '#64748B', margin: 0, marginTop: '1px' }}>
              Review, verify, and approve clinic requests across Item Master & Vendor Master
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={fetchRequests}
          disabled={loading}
          style={{
            padding: '6px 12px',
            borderRadius: '6px',
            border: '1px solid #CBD5E1',
            background: '#FFFFFF',
            color: '#334155',
            fontWeight: 700,
            fontSize: '12px',
            cursor: loading ? 'not-allowed' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '6px'
          }}
        >
          <LucideIcon name="rotate-cw" size={13} className={loading ? 'animate-spin' : ''} />
          {loading ? 'Refreshing...' : 'Refresh Queue'}
        </button>
      </div>

      {/* MASTER TYPE NAVIGATION TABS (ALL / ITEM / VENDOR) */}
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
          onClick={() => { setMasterTab('ALL'); setPage(1); }}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '7px 14px',
            borderRadius: '6px',
            border: masterTab === 'ALL' ? '1px solid #2563EB' : '1px solid transparent',
            background: masterTab === 'ALL' ? '#EFF6FF' : 'transparent',
            color: masterTab === 'ALL' ? '#1D4ED8' : '#475569',
            fontSize: '12.5px',
            fontWeight: masterTab === 'ALL' ? 800 : 650,
            cursor: 'pointer'
          }}
        >
          <LucideIcon name="layers" size={14} color={masterTab === 'ALL' ? '#2563EB' : '#64748B'} />
          <span>All Masters</span>
          <span style={{
            fontSize: '10.5px',
            fontWeight: 750,
            padding: '1px 6px',
            borderRadius: '10px',
            background: masterTab === 'ALL' ? '#DBEAFE' : '#F1F5F9',
            color: masterTab === 'ALL' ? '#1E40AF' : '#64748B'
          }}>
            {counts.all}
          </span>
          {counts.pendingTotal > 0 && (
            <span style={{ fontSize: '10px', fontWeight: 800, background: '#DC2626', color: '#FFF', padding: '1px 5px', borderRadius: '10px' }}>
              {counts.pendingTotal} pending
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => { setMasterTab('ITEM'); setPage(1); }}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '7px 14px',
            borderRadius: '6px',
            border: masterTab === 'ITEM' ? '1px solid #2563EB' : '1px solid transparent',
            background: masterTab === 'ITEM' ? '#EFF6FF' : 'transparent',
            color: masterTab === 'ITEM' ? '#1D4ED8' : '#475569',
            fontSize: '12.5px',
            fontWeight: masterTab === 'ITEM' ? 800 : 650,
            cursor: 'pointer'
          }}
        >
          <LucideIcon name="package" size={14} color={masterTab === 'ITEM' ? '#2563EB' : '#64748B'} />
          <span>Item Master</span>
          <span style={{
            fontSize: '10.5px',
            fontWeight: 750,
            padding: '1px 6px',
            borderRadius: '10px',
            background: masterTab === 'ITEM' ? '#DBEAFE' : '#F1F5F9',
            color: masterTab === 'ITEM' ? '#1E40AF' : '#64748B'
          }}>
            {counts.item}
          </span>
          {counts.pendingItems > 0 && (
            <span style={{ fontSize: '10px', fontWeight: 800, background: '#DC2626', color: '#FFF', padding: '1px 5px', borderRadius: '10px' }}>
              {counts.pendingItems}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => { setMasterTab('VENDOR'); setPage(1); }}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '7px 14px',
            borderRadius: '6px',
            border: masterTab === 'VENDOR' ? '1px solid #7C3AED' : '1px solid transparent',
            background: masterTab === 'VENDOR' ? '#F5F3FF' : 'transparent',
            color: masterTab === 'VENDOR' ? '#6D28D9' : '#475569',
            fontSize: '12.5px',
            fontWeight: masterTab === 'VENDOR' ? 800 : 650,
            cursor: 'pointer'
          }}
        >
          <LucideIcon name="building-2" size={14} color={masterTab === 'VENDOR' ? '#7C3AED' : '#64748B'} />
          <span>Vendor Master</span>
          <span style={{
            fontSize: '10.5px',
            fontWeight: 750,
            padding: '1px 6px',
            borderRadius: '10px',
            background: masterTab === 'VENDOR' ? '#EDE9FE' : '#F1F5F9',
            color: masterTab === 'VENDOR' ? '#5B21B6' : '#64748B'
          }}>
            {counts.vendor}
          </span>
          {counts.pendingVendors > 0 && (
            <span style={{ fontSize: '10px', fontWeight: 800, background: '#DC2626', color: '#FFF', padding: '1px 5px', borderRadius: '10px' }}>
              {counts.pendingVendors}
            </span>
          )}
        </button>
      </div>

      {/* FILTER CONTROLS BAR */}
      <div style={{
        background: '#FFFFFF',
        borderRadius: '8px',
        padding: '12px 16px',
        border: '1px solid #E2E8F0',
        display: 'flex',
        flexWrap: 'wrap',
        gap: '10px',
        alignItems: 'center',
        boxShadow: '0 1px 2px rgba(0,0,0,0.02)'
      }}>
        {/* Search */}
        <div style={{ flex: '1 1 240px', minWidth: '220px', position: 'relative' }}>
          <input
            type="text"
            placeholder="Search by Request No, Item/Vendor Name, Clinic..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              width: '100%',
              padding: '7px 12px 7px 32px',
              borderRadius: '6px',
              border: '1px solid #CBD5E1',
              fontSize: '12.5px',
              outline: 'none',
              boxSizing: 'border-box'
            }}
          />
          <div style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#94A3B8' }}>
            <LucideIcon name="search" size={14} />
          </div>
        </div>

        {/* Status Filter */}
        <div>
          <select
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
            style={{
              padding: '7px 12px',
              borderRadius: '6px',
              border: '1px solid #CBD5E1',
              fontSize: '12.5px',
              background: '#FFFFFF',
              fontWeight: 650,
              color: '#334155'
            }}
          >
            <option value="ALL">All Statuses</option>
            <option value="PENDING">Pending</option>
            <option value="UNDER_REVIEW">Under Review</option>
            <option value="APPROVED">Approved</option>
            <option value="REJECTED">Rejected</option>
          </select>
        </div>

        {/* Request Type Filter (Applicable for Item Master) */}
        {masterTab !== 'VENDOR' && (
          <div>
            <select
              value={typeFilter}
              onChange={(e) => { setTypeFilter(e.target.value); setPage(1); }}
              style={{
                padding: '7px 12px',
                borderRadius: '6px',
                border: '1px solid #CBD5E1',
                fontSize: '12.5px',
                background: '#FFFFFF',
                fontWeight: 650,
                color: '#334155'
              }}
            >
              <option value="ALL">All Request Types</option>
              <option value="ASSIGN_EXISTING_GLOBAL_ITEM">Path A: Assign Existing</option>
              <option value="NEW_GLOBAL_ITEM">Path B: Propose New Item</option>
            </select>
          </div>
        )}

        {/* Clinic Filter */}
        <div>
          <select
            value={tenantFilter}
            onChange={(e) => { setTenantFilter(e.target.value); setPage(1); }}
            style={{
              padding: '7px 12px',
              borderRadius: '6px',
              border: '1px solid #CBD5E1',
              fontSize: '12.5px',
              background: '#FFFFFF',
              fontWeight: 650,
              color: '#334155'
            }}
          >
            <option value="ALL">All Clinics</option>
            {hospitals.map(h => (
              <option key={h.code || h.name} value={h.code || h.name}>
                {h.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* REQUESTS TABLE */}
      <div style={{
        background: '#FFFFFF',
        borderRadius: '10px',
        border: '1px solid #E2E8F0',
        overflow: 'hidden',
        boxShadow: '0 1px 3px rgba(0,0,0,0.03)'
      }}>
        {loading ? (
          <div style={{ padding: '48px', textAlign: 'center', color: '#64748B' }}>
            <LucideIcon name="loader-2" size={26} className="animate-spin" style={{ margin: '0 auto 10px auto' }} />
            <div style={{ fontWeight: 650, fontSize: '13px' }}>Loading master requests queue...</div>
          </div>
        ) : paginatedRequests.length === 0 ? (
          <div style={{ padding: '48px', textAlign: 'center', color: '#94A3B8' }}>
            <LucideIcon name="inbox" size={32} style={{ margin: '0 auto 10px auto', color: '#CBD5E1' }} />
            <h4 style={{ margin: '0 0 4px 0', color: '#475569', fontSize: '14.5px', fontWeight: 700 }}>
              No Master Requests Found
            </h4>
            <p style={{ margin: 0, fontSize: '12px' }}>
              Requests submitted by clinics for Item Master and Vendor Master will appear here for SuperAdmin review.
            </p>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '12.5px' }}>
              <thead>
                <tr style={{ background: '#F8FAFC', borderBottom: '1px solid #E2E8F0', color: '#475569', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  <th style={{ padding: '10px 14px', fontWeight: 800 }}>Request No</th>
                  <th style={{ padding: '10px 14px', fontWeight: 800 }}>Master Type</th>
                  <th style={{ padding: '10px 14px', fontWeight: 800 }}>Clinic Tenant</th>
                  <th style={{ padding: '10px 14px', fontWeight: 800 }}>Requested Entity</th>
                  <th style={{ padding: '10px 14px', fontWeight: 800 }}>Details / Commercials</th>
                  <th style={{ padding: '10px 14px', fontWeight: 800 }}>Submitted</th>
                  <th style={{ padding: '10px 14px', fontWeight: 800 }}>Status</th>
                  <th style={{ padding: '10px 14px', fontWeight: 800, textAlign: 'right' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {paginatedRequests.map(req => {
                  const isItem = req.masterType === 'ITEM';
                  const isVendor = req.masterType === 'VENDOR';

                  // Item details
                  const isPathA = isItem && req.requestType === 'ASSIGN_EXISTING_GLOBAL_ITEM';
                  const itemName = isItem
                    ? (isPathA
                        ? (req.masterItemId?.itemName || req.masterItemId?.genericName || 'Canonical Item')
                        : (req.proposedItem?.itemName || req.categoryData?.itemName || req.proposedItem?.genericName || 'Proposed Item'))
                    : '';
                  const itemCode = isItem ? (isPathA ? req.masterItemId?.itemCode : (req.approvedItemCode || '—')) : '';

                  // Vendor details
                  const vData = isVendor ? (req.vendorData || {}) : {};
                  const vendorName = isVendor ? (vData.supplierName || 'Unnamed Vendor') : '';
                  const vendorCode = isVendor ? (vData.supplierCode || 'Auto-code') : '';

                  const formattedDate = req.createdAt
                    ? new Date(req.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
                    : '—';

                  return (
                    <tr key={req._id} style={{ borderBottom: '1px solid #F1F5F9' }}>
                      {/* 1. Request No */}
                      <td style={{ padding: '12px 14px', fontFamily: 'monospace', fontWeight: 700, color: '#1E293B' }}>
                        <div>{req.requestNo}</div>
                        {req.wasConvertedFromNewItem && (
                          <span style={{ display: 'inline-block', fontSize: '9.5px', color: '#D97706', fontWeight: 750, background: '#FEF3C7', padding: '1px 5px', borderRadius: '3px', marginTop: '2px' }}>
                            Converted Path A
                          </span>
                        )}
                      </td>

                      {/* 2. Master Type Badge */}
                      <td style={{ padding: '12px 14px' }}>
                        {isItem ? (
                          <div>
                            <span style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                              fontSize: '11px',
                              fontWeight: 750,
                              padding: '2px 7px',
                              borderRadius: '4px',
                              background: '#DBEAFE',
                              color: '#1E40AF'
                            }}>
                              <LucideIcon name="package" size={11} /> Item Master
                            </span>
                            <div style={{ fontSize: '10px', color: '#64748B', marginTop: '2px', fontWeight: 600 }}>
                              {isPathA ? 'Path A (Assign)' : 'Path B (Proposal)'}
                            </div>
                          </div>
                        ) : (
                          <div>
                            <span style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                              fontSize: '11px',
                              fontWeight: 750,
                              padding: '2px 7px',
                              borderRadius: '4px',
                              background: '#EDE9FE',
                              color: '#6D28D9'
                            }}>
                              <LucideIcon name="building-2" size={11} /> Vendor Master
                            </span>
                            <div style={{ fontSize: '10px', color: '#64748B', marginTop: '2px', fontWeight: 600 }}>
                              New Supplier Request
                            </div>
                          </div>
                        )}
                      </td>

                      {/* 3. Clinic Tenant */}
                      <td style={{ padding: '12px 14px' }}>
                        <div style={{ fontWeight: 700, color: '#0F172A' }}>{req.hospitalName || req.tenantId}</div>
                        <div style={{ fontSize: '11px', color: '#64748B' }}>{req.tenantId}</div>
                      </td>

                      {/* 4. Requested Entity (Item / Vendor) */}
                      <td style={{ padding: '12px 14px' }}>
                        {isItem ? (
                          <div>
                            <div style={{ fontWeight: 700, color: '#0F172A' }}>{itemName}</div>
                            {itemCode && itemCode !== '—' && (
                              <div style={{ fontSize: '11px', fontFamily: 'monospace', color: '#2563EB' }}>
                                Code: {itemCode}
                              </div>
                            )}
                          </div>
                        ) : (
                          <div>
                            <div style={{ fontWeight: 700, color: '#0F172A' }}>{vendorName}</div>
                            <div style={{ fontSize: '11px', color: '#64748B' }}>
                              {vData.supplierType || 'Capex'} {vData.organizationType ? `• ${vData.organizationType}` : ''}
                            </div>
                          </div>
                        )}
                      </td>

                      {/* 5. Details / Commercials */}
                      <td style={{ padding: '12px 14px' }}>
                        {isItem ? (
                          <div>
                            <div style={{ color: '#334155', fontSize: '11.5px' }}>
                              {req.category} {req.department ? `· ${req.department}` : ''}
                            </div>
                            <div style={{ fontSize: '11px', fontWeight: 700, color: '#0F172A', marginTop: '2px' }}>
                              Req MRP: ₹{Number(req.requestedMrp || 0).toFixed(2)}
                            </div>
                          </div>
                        ) : (
                          <div>
                            <div style={{ fontSize: '11.5px', color: '#334155' }}>
                              Contact: <strong>{vData.primaryContactPerson || '—'}</strong>
                            </div>
                            <div style={{ fontSize: '10.5px', color: '#64748B', marginTop: '1px' }}>
                              {vData.primaryContactPersonMobileNo || vData.emailId || vData.gstNo || '—'}
                            </div>
                          </div>
                        )}
                      </td>

                      {/* 6. Submitted Date */}
                      <td style={{ padding: '12px 14px', fontSize: '11.5px', color: '#64748B' }}>
                        {formattedDate}
                      </td>

                      {/* 7. Status */}
                      <td style={{ padding: '12px 14px' }}>
                        {renderStatusBadge(req.status)}
                      </td>

                      {/* 8. Action */}
                      <td style={{ padding: '12px 14px', textAlign: 'right' }}>
                        <button
                          type="button"
                          onClick={() => {
                            if (isItem) {
                              handleOpenItemReview(req);
                            } else {
                              handleOpenVendorReview(req, 'view');
                            }
                          }}
                          style={{
                            padding: '5px 12px',
                            borderRadius: '5px',
                            border: '1px solid #CBD5E1',
                            background: '#FFFFFF',
                            color: '#1E293B',
                            fontWeight: 700,
                            fontSize: '11.5px',
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px'
                          }}
                        >
                          <LucideIcon name="eye" size={13} /> Review
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* PAGINATION */}
        {totalPages > 1 && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '10px 16px',
            borderTop: '1px solid #E2E8F0',
            background: '#F8FAFC',
            fontSize: '12px',
            color: '#64748B'
          }}>
            <div>
              Showing {paginatedRequests.length} of {totalItems} requests (Page {page} of {totalPages})
            </div>
            <div style={{ display: 'flex', gap: '6px' }}>
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage(p => Math.max(1, p - 1))}
                style={{
                  padding: '4px 10px',
                  borderRadius: '5px',
                  border: '1px solid #CBD5E1',
                  background: '#FFFFFF',
                  fontSize: '12px',
                  cursor: page <= 1 ? 'not-allowed' : 'pointer'
                }}
              >
                Previous
              </button>
              <button
                type="button"
                disabled={page >= totalPages}
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                style={{
                  padding: '4px 10px',
                  borderRadius: '5px',
                  border: '1px solid #CBD5E1',
                  background: '#FFFFFF',
                  fontSize: '12px',
                  cursor: page >= totalPages ? 'not-allowed' : 'pointer'
                }}
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ────────────────── ITEM REQUEST REVIEW & APPROVAL MODAL ────────────────── */}
      {isItemReviewOpen && activeItemRequest && (
        <div style={{
          position: 'fixed',
          inset: 0,
          zIndex: 9999,
          background: 'rgba(15, 23, 42, 0.65)',
          backdropFilter: 'blur(4px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '20px'
        }}>
          <div style={{
            background: '#FFFFFF',
            borderRadius: '14px',
            width: '100%',
            maxWidth: '850px',
            maxHeight: '90vh',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)'
          }}>
            {/* Modal Header */}
            <div style={{
              padding: '16px 22px',
              borderBottom: '1px solid #E2E8F0',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              background: '#F8FAFC'
            }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <h3 style={{ fontSize: '16px', fontWeight: 800, color: '#0F172A', margin: 0 }}>
                    Review Item Master Request: {activeItemRequest.requestNo}
                  </h3>
                  {renderStatusBadge(activeItemRequest.status)}
                </div>
                <div style={{ fontSize: '12px', color: '#64748B', marginTop: '3px' }}>
                  Requested by: <strong>{activeItemRequest.hospitalName || activeItemRequest.tenantId}</strong> ({activeItemRequest.tenantId})
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsItemReviewOpen(false)}
                style={{ background: 'transparent', border: 'none', color: '#94A3B8', cursor: 'pointer' }}
              >
                <LucideIcon name="x" size={20} />
              </button>
            </div>

            {/* Modal Body */}
            <div style={{ padding: '20px 22px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {/* Classification Info Banner */}
              <div style={{
                background: activeItemRequest.requestType === 'ASSIGN_EXISTING_GLOBAL_ITEM' ? '#EFF6FF' : '#F0FDF4',
                border: activeItemRequest.requestType === 'ASSIGN_EXISTING_GLOBAL_ITEM' ? '1px solid #BFDBFE' : '1px solid #BBF7D0',
                borderRadius: '8px',
                padding: '12px 16px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
              }}>
                <div>
                  <div style={{ fontSize: '13px', fontWeight: 800, color: activeItemRequest.requestType === 'ASSIGN_EXISTING_GLOBAL_ITEM' ? '#1E40AF' : '#166534' }}>
                    {activeItemRequest.requestType === 'ASSIGN_EXISTING_GLOBAL_ITEM'
                      ? 'Path A: Assign Existing Global Item to Clinic'
                      : 'Path B: Proposal for Brand-New Global Master Item'}
                  </div>
                  <div style={{ fontSize: '11px', color: '#475569', marginTop: '2px' }}>
                    Category: <strong>{activeItemRequest.category}</strong> {activeItemRequest.department ? `· Department: ${activeItemRequest.department}` : ''}
                  </div>
                </div>

                {/* Option to Convert Path B -> Path A */}
                {activeItemRequest.requestType === 'NEW_GLOBAL_ITEM' && ['PENDING', 'UNDER_REVIEW', 'SUBMITTED'].includes(activeItemRequest.status) && (
                  <button
                    type="button"
                    onClick={() => setIsConvertOpen(true)}
                    style={{
                      padding: '6px 12px',
                      borderRadius: '6px',
                      border: '1px solid #D97706',
                      background: '#FEF3C7',
                      color: '#92400E',
                      fontWeight: 700,
                      fontSize: '11px',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px'
                    }}
                  >
                    <LucideIcon name="link-2" size={14} /> Match With Existing Global Master
                  </button>
                )}
              </div>

              {/* Item Details */}
              {activeItemRequest.requestType === 'ASSIGN_EXISTING_GLOBAL_ITEM' ? (
                <div style={{ background: '#F8FAFC', padding: '14px', borderRadius: '8px', border: '1px solid #E2E8F0' }}>
                  <div style={{ fontSize: '11px', fontWeight: 800, color: '#475569', textTransform: 'uppercase', marginBottom: '6px' }}>
                    Target Canonical Global Item (Read-Only)
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '12px', fontSize: '12.5px' }}>
                    <div>
                      <span style={{ color: '#64748B' }}>Item Code:</span>{' '}
                      <strong style={{ fontFamily: 'monospace', color: '#2563EB' }}>
                        {activeItemRequest.masterItemId?.itemCode || activeItemRequest.approvedItemCode}
                      </strong>
                    </div>
                    <div>
                      <span style={{ color: '#64748B' }}>Item Name:</span>{' '}
                      <strong>{activeItemRequest.masterItemId?.itemName || activeItemRequest.masterItemId?.genericName}</strong>
                    </div>
                  </div>
                </div>
              ) : (
                <div style={{ background: '#F8FAFC', padding: '14px', borderRadius: '8px', border: '1px solid #E2E8F0' }}>
                  <div style={{ fontSize: '11px', fontWeight: 800, color: '#475569', textTransform: 'uppercase', marginBottom: '6px' }}>
                    Proposed Specifications (Client Excel Structure)
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '8px', fontSize: '12px' }}>
                    {Object.entries(activeItemRequest.categoryData || activeItemRequest.proposedItem || {}).map(([k, v]) => {
                      if (typeof v === 'object' || v === '' || v === null || v === undefined) return null;
                      return (
                        <div key={k} style={{ background: '#FFFFFF', padding: '6px 10px', borderRadius: '5px', border: '1px solid #E2E8F0' }}>
                          <span style={{ color: '#64748B', display: 'block', fontSize: '10px', textTransform: 'capitalize' }}>{k}</span>
                          <strong style={{ color: '#0F172A' }}>{String(v)}</strong>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Pricing Comparison: Requested vs Approved */}
              <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '8px', padding: '14px' }}>
                <div style={{ fontSize: '12.5px', fontWeight: 800, color: '#0F172A', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <LucideIcon name="indian-rupee" size={15} /> Commercial Pricing Determination (₹)
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '14px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '11px', color: '#64748B', marginBottom: '3px' }}>
                      Clinic MRP (₹)
                    </label>
                    <div style={{ fontSize: '11px', color: '#475569', marginBottom: '3px' }}>
                      Requested: <strong>₹{Number(activeItemRequest.requestedMrp || 0).toFixed(2)}</strong>
                    </div>
                    {['APPROVED', 'REJECTED'].includes(activeItemRequest.status) ? (
                      <div style={{ padding: '6px 10px', background: '#F1F5F9', borderRadius: '5px', fontWeight: 700, fontSize: '12.5px' }}>
                        ₹{Number(activeItemRequest.approvedMrp ?? activeItemRequest.requestedMrp ?? 0).toFixed(2)}
                      </div>
                    ) : (
                      <input
                        type="number"
                        step="0.01"
                        value={approvedPrice.mrp}
                        onChange={(e) => setApprovedPrice({ ...approvedPrice, mrp: e.target.value })}
                        style={{ width: '100%', padding: '6px 8px', borderRadius: '5px', border: '1px solid #CBD5E1', fontSize: '12.5px' }}
                      />
                    )}
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '11px', color: '#64748B', marginBottom: '3px' }}>
                      Clinic Net Rate (₹)
                    </label>
                    <div style={{ fontSize: '11px', color: '#475569', marginBottom: '3px' }}>
                      Requested: <strong>₹{Number(activeItemRequest.requestedNetRate || 0).toFixed(2)}</strong>
                    </div>
                    {['APPROVED', 'REJECTED'].includes(activeItemRequest.status) ? (
                      <div style={{ padding: '6px 10px', background: '#F1F5F9', borderRadius: '5px', fontWeight: 700, fontSize: '12.5px' }}>
                        ₹{Number(activeItemRequest.approvedNetRate ?? activeItemRequest.requestedNetRate ?? 0).toFixed(2)}
                      </div>
                    ) : (
                      <input
                        type="number"
                        step="0.01"
                        value={approvedPrice.netRate}
                        onChange={(e) => setApprovedPrice({ ...approvedPrice, netRate: e.target.value })}
                        style={{ width: '100%', padding: '6px 8px', borderRadius: '5px', border: '1px solid #CBD5E1', fontSize: '12.5px' }}
                      />
                    )}
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '11px', color: '#64748B', marginBottom: '3px' }}>
                      Clinic Cost (₹)
                    </label>
                    <div style={{ fontSize: '11px', color: '#475569', marginBottom: '3px' }}>
                      Requested: <strong>₹{Number(activeItemRequest.requestedHospitalCost || 0).toFixed(2)}</strong>
                    </div>
                    {['APPROVED', 'REJECTED'].includes(activeItemRequest.status) ? (
                      <div style={{ padding: '6px 10px', background: '#F1F5F9', borderRadius: '5px', fontWeight: 700, fontSize: '12.5px' }}>
                        ₹{Number(activeItemRequest.approvedHospitalCost ?? activeItemRequest.requestedHospitalCost ?? 0).toFixed(2)}
                      </div>
                    ) : (
                      <input
                        type="number"
                        step="0.01"
                        value={approvedPrice.hospitalCost}
                        onChange={(e) => setApprovedPrice({ ...approvedPrice, hospitalCost: e.target.value })}
                        style={{ width: '100%', padding: '6px 8px', borderRadius: '5px', border: '1px solid #CBD5E1', fontSize: '12.5px' }}
                      />
                    )}
                  </div>
                </div>
              </div>

              {/* Review Note */}
              <div>
                <label style={{ display: 'block', fontSize: '11.5px', fontWeight: 700, color: '#475569', marginBottom: '3px' }}>
                  Review Notes
                </label>
                <textarea
                  rows={2}
                  value={reviewNote}
                  onChange={(e) => setReviewNote(e.target.value)}
                  placeholder="Audit notes regarding pricing negotiation or approval decision..."
                  disabled={['APPROVED', 'REJECTED'].includes(activeItemRequest.status)}
                  style={{ width: '100%', padding: '7px 10px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '12px' }}
                />
              </div>

              {/* Rejection Reason if rejected */}
              {activeItemRequest.status === 'REJECTED' && (
                <div style={{ background: '#FEE2E2', padding: '10px 14px', borderRadius: '6px', color: '#991B1B', fontSize: '12px' }}>
                  <strong>Rejection Reason:</strong> {activeItemRequest.rejectionReason}
                </div>
              )}
            </div>

            {/* Modal Actions */}
            <div style={{
              padding: '14px 22px',
              borderTop: '1px solid #E2E8F0',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              background: '#F8FAFC'
            }}>
              <button
                type="button"
                onClick={() => setIsItemReviewOpen(false)}
                style={{ padding: '7px 16px', borderRadius: '6px', border: '1px solid #CBD5E1', background: '#FFFFFF', color: '#475569', fontWeight: 700, fontSize: '12.5px', cursor: 'pointer' }}
              >
                Close
              </button>

              {['PENDING', 'UNDER_REVIEW', 'SUBMITTED'].includes(activeItemRequest.status) && (
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    type="button"
                    onClick={handleOpenItemReject}
                    style={{ padding: '7px 16px', borderRadius: '6px', border: '1px solid #FCA5A5', background: '#FEE2E2', color: '#991B1B', fontWeight: 700, fontSize: '12.5px', cursor: 'pointer' }}
                  >
                    Reject Request
                  </button>

                  <button
                    type="button"
                    onClick={handleApproveItem}
                    disabled={reviewSubmitting}
                    style={{
                      padding: '7px 20px',
                      borderRadius: '6px',
                      border: 'none',
                      background: reviewSubmitting ? '#94A3B8' : '#2563EB',
                      color: '#FFFFFF',
                      fontWeight: 700,
                      fontSize: '12.5px',
                      cursor: reviewSubmitting ? 'not-allowed' : 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px'
                    }}
                  >
                    {reviewSubmitting && <LucideIcon name="loader-2" size={14} className="animate-spin" />}
                    {activeItemRequest.requestType === 'ASSIGN_EXISTING_GLOBAL_ITEM'
                      ? 'Approve Assignment (Path A)'
                      : 'Approve & Create Global Master (Path B)'}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ────────────────── ITEM REJECTION DIALOG ────────────────── */}
      {isItemRejectOpen && (
        <div style={{
          position: 'fixed',
          inset: 0,
          zIndex: 10000,
          background: 'rgba(15, 23, 42, 0.7)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '20px'
        }}>
          <div style={{
            background: '#FFFFFF',
            borderRadius: '12px',
            width: '100%',
            maxWidth: '480px',
            padding: '20px',
            boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)'
          }}>
            <h4 style={{ fontSize: '15px', fontWeight: 800, color: '#991B1B', margin: '0 0 8px 0' }}>
              Confirm Request Rejection
            </h4>
            <p style={{ fontSize: '12px', color: '#64748B', margin: '0 0 14px 0' }}>
              Please provide a clear reason why request <strong>{activeItemRequest?.requestNo}</strong> cannot be approved. The clinic will be notified.
            </p>

            <textarea
              rows={3}
              placeholder="e.g., Requested item specifications are ambiguous, price violates platform ceiling..."
              value={itemRejectionReason}
              onChange={(e) => setItemRejectionReason(e.target.value)}
              style={{ width: '100%', padding: '8px 10px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '12px', marginBottom: '14px' }}
            />

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <button
                type="button"
                onClick={() => setIsItemRejectOpen(false)}
                style={{ padding: '6px 14px', borderRadius: '6px', border: '1px solid #CBD5E1', background: '#FFFFFF', fontWeight: 700, fontSize: '12px' }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmItemReject}
                disabled={itemRejecting || !itemRejectionReason.trim()}
                style={{
                  padding: '6px 16px',
                  borderRadius: '6px',
                  border: 'none',
                  background: (itemRejecting || !itemRejectionReason.trim()) ? '#94A3B8' : '#DC2626',
                  color: '#FFFFFF',
                  fontWeight: 700,
                  fontSize: '12px',
                  cursor: (itemRejecting || !itemRejectionReason.trim()) ? 'not-allowed' : 'pointer'
                }}
              >
                {itemRejecting ? 'Rejecting...' : 'Confirm Rejection'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ────────────────── CONVERSION DIALOG (Path B -> Path A) ────────────────── */}
      {isConvertOpen && (
        <div style={{
          position: 'fixed',
          inset: 0,
          zIndex: 10000,
          background: 'rgba(15, 23, 42, 0.7)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '20px'
        }}>
          <div style={{
            background: '#FFFFFF',
            borderRadius: '12px',
            width: '100%',
            maxWidth: '560px',
            padding: '20px',
            boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)',
            maxHeight: '85vh',
            display: 'flex',
            flexDirection: 'column'
          }}>
            <h4 style={{ fontSize: '15px', fontWeight: 800, color: '#1E293B', margin: '0 0 6px 0' }}>
              Match With Existing Canonical Global Master
            </h4>
            <p style={{ fontSize: '11.5px', color: '#64748B', margin: '0 0 12px 0' }}>
              Convert this <strong>NEW_GLOBAL_ITEM</strong> proposal into a <strong>Path A assignment request</strong>. This links the clinic request to an existing canonical master item, preventing duplicate ItemMaster creation.
            </p>

            <input
              type="text"
              placeholder="Search canonical item by Code, Name, or Generic..."
              value={convertSearch}
              onChange={(e) => setConvertSearch(e.target.value)}
              style={{ width: '100%', padding: '7px 10px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '12px', marginBottom: '10px' }}
            />

            <div style={{ flex: 1, overflowY: 'auto', border: '1px solid #E2E8F0', borderRadius: '6px', maxHeight: '200px', marginBottom: '14px' }}>
              {loadingCandidates ? (
                <div style={{ padding: '14px', textAlign: 'center', fontSize: '12px', color: '#64748B' }}>
                  Loading candidates...
                </div>
              ) : candidateGlobalItems.length === 0 ? (
                <div style={{ padding: '14px', textAlign: 'center', fontSize: '12px', color: '#94A3B8' }}>
                  No matching global items found.
                </div>
              ) : (
                candidateGlobalItems.map(item => {
                  const isSelected = selectedCanonicalItem?._id === item._id;
                  return (
                    <div
                      key={item._id}
                      onClick={() => setSelectedCanonicalItem(item)}
                      style={{
                        padding: '8px 12px',
                        borderBottom: '1px solid #F1F5F9',
                        cursor: 'pointer',
                        background: isSelected ? '#EFF6FF' : '#FFFFFF',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center'
                      }}
                    >
                      <div>
                        <div style={{ fontSize: '12px', fontWeight: 700, color: isSelected ? '#1E40AF' : '#1E293B' }}>
                          [{item.itemCode}] {item.itemName || item.genericName}
                        </div>
                        <div style={{ fontSize: '10.5px', color: '#64748B' }}>
                          {item.category} {item.department ? `· ${item.department}` : ''}
                        </div>
                      </div>
                      {isSelected && (
                        <span style={{ fontSize: '10.5px', fontWeight: 800, color: '#2563EB', background: '#DBEAFE', padding: '2px 6px', borderRadius: '4px' }}>
                          Selected
                        </span>
                      )}
                    </div>
                  );
                })
              )}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <button
                type="button"
                onClick={() => setIsConvertOpen(false)}
                style={{ padding: '6px 14px', borderRadius: '6px', border: '1px solid #CBD5E1', background: '#FFFFFF', fontWeight: 700, fontSize: '12px' }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmConvert}
                disabled={converting || !selectedCanonicalItem}
                style={{
                  padding: '6px 16px',
                  borderRadius: '6px',
                  border: 'none',
                  background: (converting || !selectedCanonicalItem) ? '#94A3B8' : '#2563EB',
                  color: '#FFFFFF',
                  fontWeight: 700,
                  fontSize: '12px',
                  cursor: (converting || !selectedCanonicalItem) ? 'not-allowed' : 'pointer'
                }}
              >
                {converting ? 'Converting...' : 'Convert to Path A'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ────────────────── VENDOR REQUEST REVIEW MODAL ────────────────── */}
      {isVendorReviewOpen && activeVendorRequest && (
        <div style={{
          position: 'fixed',
          inset: 0,
          zIndex: 9999,
          background: 'rgba(15, 23, 42, 0.65)',
          backdropFilter: 'blur(4px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '20px'
        }}>
          <div style={{
            background: '#FFFFFF',
            borderRadius: '14px',
            width: '100%',
            maxWidth: '880px',
            maxHeight: '92vh',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)'
          }}>
            {/* Header */}
            <div style={{
              padding: '16px 22px',
              borderBottom: '1px solid #E2E8F0',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              background: '#F8FAFC'
            }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <h3 style={{ fontSize: '16px', fontWeight: 800, color: '#0F172A', margin: 0 }}>
                    Review Vendor Master Request: {activeVendorRequest.requestNo}
                  </h3>
                  {renderStatusBadge(activeVendorRequest.status)}
                </div>
                <div style={{ fontSize: '12px', color: '#64748B', marginTop: '3px' }}>
                  Submitted by: <strong>{activeVendorRequest.hospitalName || activeVendorRequest.tenantId}</strong> ({activeVendorRequest.tenantId})
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsVendorReviewOpen(false)}
                style={{ background: 'transparent', border: 'none', color: '#94A3B8', cursor: 'pointer' }}
              >
                <LucideIcon name="x" size={20} />
              </button>
            </div>

            {/* Body */}
            <div style={{ padding: '20px 22px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {/* Approval Info Banner */}
              {['PENDING', 'UNDER_REVIEW'].includes(activeVendorRequest.status) && (
                <div style={{
                  background: '#EFF6FF',
                  border: '1px solid #BFDBFE',
                  borderRadius: '8px',
                  padding: '12px 16px',
                  fontSize: '12px',
                  color: '#1E40AF',
                  display: 'flex',
                  gap: '10px',
                  alignItems: 'center'
                }}>
                  <LucideIcon name="info" size={18} color="#2563EB" style={{ flexShrink: 0 }} />
                  <div>
                    <strong>SuperAdmin Action:</strong> Approving this request will verify and create this vendor in the Global Master (or reuse existing vendor if GST/PAN matches) and immediately link it to <strong>{activeVendorRequest.hospitalName || activeVendorRequest.tenantId}</strong>.
                  </div>
                </div>
              )}

              {/* Already Approved Banner */}
              {activeVendorRequest.status === 'APPROVED' && (
                <div style={{ background: '#DCFCE7', border: '1px solid #BBF7D0', borderRadius: '8px', padding: '12px 16px', color: '#166534', fontSize: '12.5px' }}>
                  <strong>✓ Approved & Associated:</strong> This vendor was approved on {activeVendorRequest.reviewedAt ? new Date(activeVendorRequest.reviewedAt).toLocaleDateString() : '—'} by {activeVendorRequest.reviewedBy || 'Super Admin'}.
                  {activeVendorRequest.approvedVendorId && (
                    <div style={{ marginTop: '4px', fontSize: '11.5px' }}>
                      Associated Global Vendor ID: <code>{typeof activeVendorRequest.approvedVendorId === 'object' ? activeVendorRequest.approvedVendorId._id : activeVendorRequest.approvedVendorId}</code>
                    </div>
                  )}
                </div>
              )}

              {/* Already Rejected Banner */}
              {activeVendorRequest.status === 'REJECTED' && (
                <div style={{ background: '#FEE2E2', border: '1px solid #FECACA', borderRadius: '8px', padding: '12px 16px', color: '#991B1B', fontSize: '12.5px' }}>
                  <strong>✕ Request Rejected:</strong> {activeVendorRequest.rejectionReason || 'No reason specified'}
                </div>
              )}

              {/* Proposed Vendor Details */}
              {(() => {
                const v = activeVendorRequest.vendorData || {};
                return (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                    {/* Card 1: Supplier Identity */}
                    <div style={{ background: '#FFFFFF', border: '1px solid #CBD5E1', borderRadius: '7px', overflow: 'hidden' }}>
                      <div style={{ background: 'linear-gradient(90deg, #1E40AF, #2563EB)', color: '#FFFFFF', padding: '6px 12px', fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                        1. Supplier Identity & Classification
                      </div>
                      <div style={{ padding: '12px', display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '12px', fontSize: '12px' }}>
                        <div><span style={{ color: '#64748B', display: 'block', fontSize: '10.5px' }}>Supplier Name</span> <strong>{v.supplierName || '—'}</strong></div>
                        <div><span style={{ color: '#64748B', display: 'block', fontSize: '10.5px' }}>Supplier Code</span> <strong>{v.supplierCode || 'Auto-generated'}</strong></div>
                        <div><span style={{ color: '#64748B', display: 'block', fontSize: '10.5px' }}>Supplier Type</span> <strong>{v.supplierType || '—'}</strong></div>
                        <div><span style={{ color: '#64748B', display: 'block', fontSize: '10.5px' }}>Supplier Category</span> <strong>{v.supplierCategory || '—'}</strong></div>
                        <div><span style={{ color: '#64748B', display: 'block', fontSize: '10.5px' }}>Organization Type</span> <strong>{v.organizationType || '—'}</strong></div>
                        <div><span style={{ color: '#64748B', display: 'block', fontSize: '10.5px' }}>Active Status</span> <strong>{v.activeStatus || 'Yes'}</strong></div>
                      </div>
                    </div>

                    {/* Card 2: Contact Persons */}
                    <div style={{ background: '#FFFFFF', border: '1px solid #CBD5E1', borderRadius: '7px', overflow: 'hidden' }}>
                      <div style={{ background: 'linear-gradient(90deg, #1E40AF, #2563EB)', color: '#FFFFFF', padding: '6px 12px', fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                        2. Contact Persons Details
                      </div>
                      <div style={{ padding: '12px', display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: '12px', fontSize: '12px' }}>
                        <div><span style={{ color: '#64748B', display: 'block', fontSize: '10.5px' }}>Primary Contact</span> <strong>{v.primaryContactPerson || '—'}</strong></div>
                        <div><span style={{ color: '#64748B', display: 'block', fontSize: '10.5px' }}>Designation</span> <strong>{v.primaryContactPersonDesignation || '—'}</strong></div>
                        <div><span style={{ color: '#64748B', display: 'block', fontSize: '10.5px' }}>Mobile No</span> <strong>{v.primaryContactPersonMobileNo || '—'}</strong></div>
                        <div><span style={{ color: '#64748B', display: 'block', fontSize: '10.5px' }}>Email ID</span> <strong>{v.primaryContactPersonEmailId || '—'}</strong></div>
                        {v.secondaryContactPerson && (
                          <>
                            <div><span style={{ color: '#64748B', display: 'block', fontSize: '10.5px' }}>Secondary Contact</span> <strong>{v.secondaryContactPerson}</strong></div>
                            <div><span style={{ color: '#64748B', display: 'block', fontSize: '10.5px' }}>Secondary Mobile</span> <strong>{v.secondaryContactPersonMobileNo || '—'}</strong></div>
                            <div><span style={{ color: '#64748B', display: 'block', fontSize: '10.5px' }}>Secondary Email</span> <strong>{v.secondaryContactPersonEmailId || '—'}</strong></div>
                          </>
                        )}
                      </div>
                    </div>

                    {/* Card 3: Address & Statutory */}
                    <div style={{ background: '#FFFFFF', border: '1px solid #CBD5E1', borderRadius: '7px', overflow: 'hidden' }}>
                      <div style={{ background: 'linear-gradient(90deg, #1E40AF, #2563EB)', color: '#FFFFFF', padding: '6px 12px', fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                        3. Address, Tax & Statutory Details
                      </div>
                      <div style={{ padding: '12px', display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '12px', fontSize: '12px' }}>
                        <div><span style={{ color: '#64748B', display: 'block', fontSize: '10.5px' }}>GST No</span> <strong>{v.gstNo || '—'}</strong></div>
                        <div><span style={{ color: '#64748B', display: 'block', fontSize: '10.5px' }}>PAN Card No</span> <strong>{v.panCardNo || '—'}</strong></div>
                        <div><span style={{ color: '#64748B', display: 'block', fontSize: '10.5px' }}>Name on PAN</span> <strong>{v.nameonPanCard || '—'}</strong></div>
                        <div><span style={{ color: '#64748B', display: 'block', fontSize: '10.5px' }}>State / City</span> <strong>{v.stateCode || v.bank1City || '—'}</strong></div>
                        <div><span style={{ color: '#64748B', display: 'block', fontSize: '10.5px' }}>Pin Code</span> <strong>{v.pinCode || '—'}</strong></div>
                        <div><span style={{ color: '#64748B', display: 'block', fontSize: '10.5px' }}>MSME Registration</span> <strong>{v.isMsmeRegistration || v.msmeRegistrationNo || '—'}</strong></div>
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* Rejection input box if rejecting */}
              {vendorReviewMode === 'reject' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', background: '#FEF2F2', padding: '14px', borderRadius: '8px', border: '1px solid #FECACA' }}>
                  <label style={{ fontSize: '12px', fontWeight: 800, color: '#991B1B' }}>
                    Rejection Reason <span style={{ color: '#DC2626' }}>*</span>
                  </label>
                  <textarea
                    rows={3}
                    placeholder="Specify the reason why this vendor proposal is being rejected..."
                    value={vendorRejectionReason}
                    onChange={e => setVendorRejectionReason(e.target.value)}
                    style={{
                      padding: '8px 10px',
                      borderRadius: '5px',
                      border: '1px solid #CBD5E1',
                      fontSize: '12px',
                      outline: 'none',
                      background: '#FFFFFF'
                    }}
                  />
                </div>
              )}
            </div>

            {/* Footer Actions */}
            <div style={{
              padding: '14px 22px',
              borderTop: '1px solid #E2E8F0',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              background: '#F8FAFC'
            }}>
              <button
                type="button"
                onClick={() => setIsVendorReviewOpen(false)}
                style={{ padding: '7px 16px', borderRadius: '6px', border: '1px solid #CBD5E1', background: '#FFFFFF', color: '#475569', fontWeight: 700, fontSize: '12.5px', cursor: 'pointer' }}
              >
                Close
              </button>

              {['PENDING', 'UNDER_REVIEW'].includes(activeVendorRequest.status) && (
                <div style={{ display: 'flex', gap: '8px' }}>
                  {vendorReviewMode !== 'reject' ? (
                    <>
                      <button
                        type="button"
                        onClick={() => setVendorReviewMode('reject')}
                        style={{ padding: '7px 16px', borderRadius: '6px', border: '1px solid #FCA5A5', background: '#FEE2E2', color: '#991B1B', fontWeight: 700, fontSize: '12.5px', cursor: 'pointer' }}
                      >
                        Reject Vendor
                      </button>

                      <button
                        type="button"
                        onClick={handleApproveVendor}
                        disabled={vendorActionLoading}
                        style={{
                          padding: '7px 20px',
                          borderRadius: '6px',
                          border: 'none',
                          background: vendorActionLoading ? '#94A3B8' : '#16A34A',
                          color: '#FFFFFF',
                          fontWeight: 700,
                          fontSize: '12.5px',
                          cursor: vendorActionLoading ? 'not-allowed' : 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px'
                        }}
                      >
                        {vendorActionLoading && <LucideIcon name="loader-2" size={14} className="animate-spin" />}
                        Approve & Create Global Vendor
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() => setVendorReviewMode('view')}
                        style={{ padding: '7px 16px', borderRadius: '6px', border: '1px solid #CBD5E1', background: '#FFFFFF', color: '#475569', fontWeight: 700, fontSize: '12.5px', cursor: 'pointer' }}
                      >
                        Back
                      </button>

                      <button
                        type="button"
                        onClick={handleRejectVendor}
                        disabled={vendorActionLoading || !vendorRejectionReason.trim()}
                        style={{
                          padding: '7px 20px',
                          borderRadius: '6px',
                          border: 'none',
                          background: (vendorActionLoading || !vendorRejectionReason.trim()) ? '#94A3B8' : '#DC2626',
                          color: '#FFFFFF',
                          fontWeight: 700,
                          fontSize: '12.5px',
                          cursor: (vendorActionLoading || !vendorRejectionReason.trim()) ? 'not-allowed' : 'pointer'
                        }}
                      >
                        {vendorActionLoading ? 'Rejecting...' : 'Confirm Rejection'}
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
