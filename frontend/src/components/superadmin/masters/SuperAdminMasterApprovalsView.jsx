import React, { useState, useEffect, useMemo } from 'react';
import * as Icons from 'lucide-react';
import axios from 'axios';
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
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [hospitals, setHospitals] = useState([]);

  // Filters
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [tenantFilter, setTenantFilter] = useState('ALL');
  const [typeFilter, setTypeFilter] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  // Review Modal state
  const [activeRequest, setActiveRequest] = useState(null);
  const [isReviewOpen, setIsReviewOpen] = useState(false);
  const [approvedPrice, setApprovedPrice] = useState({ mrp: '', netRate: '', hospitalCost: '' });
  const [reviewNote, setReviewNote] = useState('');
  const [reviewSubmitting, setReviewSubmitting] = useState(false);

  // Rejection Modal state
  const [isRejectOpen, setIsRejectOpen] = useState(false);
  const [rejectionReason, setRejectionReason] = useState('');
  const [rejecting, setRejecting] = useState(false);

  // Conversion state (Convert Path B -> Path A)
  const [isConvertOpen, setIsConvertOpen] = useState(false);
  const [convertSearch, setConvertSearch] = useState('');
  const [candidateGlobalItems, setCandidateGlobalItems] = useState([]);
  const [loadingCandidates, setLoadingCandidates] = useState(false);
  const [selectedCanonicalItem, setSelectedCanonicalItem] = useState(null);
  const [converting, setConverting] = useState(false);

  // Fetch hospital tenant list
  useEffect(() => {
    const fetchHospitals = async () => {
      try {
        const token = localStorage.getItem('token');
        const res = await axios.get('/api/superadmin/masters/hospitals-list', {
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

  // Fetch Requests
  const fetchRequests = async () => {
    setLoading(true);
    setErrorMsg('');
    try {
      const token = localStorage.getItem('token');
      const params = {
        page,
        limit: 25,
        status: statusFilter !== 'ALL' ? statusFilter : undefined,
        tenantId: tenantFilter !== 'ALL' ? tenantFilter : undefined,
        requestType: typeFilter !== 'ALL' ? typeFilter : undefined,
        search: searchQuery || undefined
      };
      const res = await axios.get('/api/item-requests/admin/all', {
        headers: { Authorization: `Bearer ${token}` },
        params
      });
      if (res.data.success) {
        setRequests(res.data.data || []);
        setTotalPages(res.data.pagination?.pages || 1);
      }
    } catch (err) {
      setErrorMsg(err.response?.data?.error || err.message || 'Failed to load requests');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRequests();
  }, [statusFilter, tenantFilter, typeFilter, searchQuery, page]);

  // Open Review Modal
  const handleOpenReview = async (req) => {
    setActiveRequest(req);
    // Initialize approved pricing with existing approved values, or requested values as defaults
    setApprovedPrice({
      mrp: req.approvedMrp !== null && req.approvedMrp !== undefined ? req.approvedMrp : (req.requestedMrp ?? ''),
      netRate: req.approvedNetRate !== null && req.approvedNetRate !== undefined ? req.approvedNetRate : (req.requestedNetRate ?? ''),
      hospitalCost: req.approvedHospitalCost !== null && req.approvedHospitalCost !== undefined ? req.approvedHospitalCost : (req.requestedHospitalCost ?? '')
    });
    setReviewNote(req.reviewNotes || '');
    setIsReviewOpen(true);

    // If request is SUBMITTED or PENDING, automatically transition to UNDER_REVIEW
    if (['SUBMITTED', 'PENDING'].includes(req.status)) {
      try {
        const token = localStorage.getItem('token');
        await axios.put(`/api/item-requests/admin/${req._id}/review`, { note: 'Review opened by Super Admin' }, {
          headers: { Authorization: `Bearer ${token}` }
        });
        setActiveRequest(prev => ({ ...prev, status: 'UNDER_REVIEW' }));
      } catch (_) {}
    }
  };

  // Execute Approval (Path A or Path B)
  const handleApprove = async () => {
    if (!activeRequest) return;
    setReviewSubmitting(true);
    setErrorMsg('');
    try {
      const token = localStorage.getItem('token');
      const payload = {
        approvedMrp: approvedPrice.mrp !== '' ? Number(approvedPrice.mrp) : null,
        approvedNetRate: approvedPrice.netRate !== '' ? Number(approvedPrice.netRate) : null,
        approvedHospitalCost: approvedPrice.hospitalCost !== '' ? Number(approvedPrice.hospitalCost) : null,
        note: reviewNote
      };

      const res = await axios.put(`/api/item-requests/admin/${activeRequest._id}/approve`, payload, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (res.data.success) {
        setIsReviewOpen(false);
        setActiveRequest(null);
        fetchRequests();
      }
    } catch (err) {
      setErrorMsg(err.response?.data?.error || err.message || 'Approval failed');
    } finally {
      setReviewSubmitting(false);
    }
  };

  // Open Rejection Dialog
  const handleOpenReject = () => {
    setRejectionReason('');
    setIsRejectOpen(true);
  };

  // Execute Rejection
  const handleConfirmReject = async () => {
    if (!rejectionReason.trim()) {
      alert('Rejection reason is required.');
      return;
    }
    setRejecting(true);
    try {
      const token = localStorage.getItem('token');
      const res = await axios.put(`/api/item-requests/admin/${activeRequest._id}/reject`, {
        rejectionReason: rejectionReason.trim(),
        note: reviewNote
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (res.data.success) {
        setIsRejectOpen(false);
        setIsReviewOpen(false);
        setActiveRequest(null);
        fetchRequests();
      }
    } catch (err) {
      alert(err.response?.data?.error || err.message || 'Rejection failed');
    } finally {
      setRejecting(false);
    }
  };

  // Search candidate global items for conversion
  useEffect(() => {
    if (!isConvertOpen || !activeRequest) return;
    let isMounted = true;
    const fetchCandidates = async () => {
      setLoadingCandidates(true);
      try {
        const token = localStorage.getItem('token');
        const res = await axios.get('/api/superadmin/masters/unassigned-global-items', {
          headers: { Authorization: `Bearer ${token}` },
          params: {
            tenantId: activeRequest.tenantId,
            category: activeRequest.category,
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
  }, [isConvertOpen, activeRequest, convertSearch]);

  // Execute Conversion: NEW_GLOBAL_ITEM -> ASSIGN_EXISTING_GLOBAL_ITEM
  const handleConfirmConvert = async () => {
    if (!selectedCanonicalItem) {
      alert('Please select a canonical global item to link.');
      return;
    }
    setConverting(true);
    try {
      const token = localStorage.getItem('token');
      const res = await axios.put(`/api/item-requests/admin/${activeRequest._id}/convert-to-assign`, {
        canonicalMasterItemId: selectedCanonicalItem._id,
        note: `Matched proposal with canonical item ${selectedCanonicalItem.itemCode} (${selectedCanonicalItem.itemName || selectedCanonicalItem.genericName})`
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (res.data.success) {
        setIsConvertOpen(false);
        setActiveRequest(res.data.data);
        fetchRequests();
      }
    } catch (err) {
      alert(err.response?.data?.error || err.message || 'Conversion failed');
    } finally {
      setConverting(false);
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
      {/* Header & Sub-Bar */}
      <div style={{
        background: '#FFFFFF',
        borderRadius: '8px',
        padding: '8px 14px',
        border: '1px solid #E2E8F0',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '8px',
        boxShadow: '0 1px 2px rgba(0,0,0,0.02)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{
            width: '28px',
            height: '28px',
            borderRadius: '6px',
            background: '#FEF3C7',
            color: '#B45309',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            <LucideIcon name="clipboard-check" size={16} />
          </div>
          <div>
            <h2 style={{ fontSize: '13.5px', fontWeight: 800, color: '#0F172A', margin: 0, lineHeight: 1.2 }}>
              Master Approvals & Request Workflow
            </h2>
            <p style={{ fontSize: '11px', color: '#64748B', margin: 0, lineHeight: 1.2 }}>
              Review and approve hospital requests for assignments (Path A) or proposals (Path B)
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={fetchRequests}
          style={{
            padding: '4px 10px',
            borderRadius: '6px',
            border: '1px solid #CBD5E1',
            background: '#FFFFFF',
            color: '#334155',
            fontWeight: 700,
            fontSize: '12px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '5px'
          }}
        >
          <LucideIcon name="rotate-cw" size={13} /> Refresh
        </button>
      </div>

      {/* Filter Controls */}
      <div style={{
        background: '#FFFFFF',
        borderRadius: '12px',
        padding: '16px 20px',
        border: '1px solid #E2E8F0',
        display: 'flex',
        flexWrap: 'wrap',
        gap: '12px',
        alignItems: 'center'
      }}>
        {/* Search */}
        <div style={{ flex: '1 1 240px', minWidth: '220px' }}>
          <input
            type="text"
            placeholder="Search by Request No, Item, Hospital..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              width: '100%',
              padding: '8px 12px',
              borderRadius: '8px',
              border: '1px solid #CBD5E1',
              fontSize: '13px'
            }}
          />
        </div>

        {/* Status Filter */}
        <div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            style={{
              padding: '8px 12px',
              borderRadius: '8px',
              border: '1px solid #CBD5E1',
              fontSize: '13px',
              background: '#FFFFFF',
              fontWeight: 600
            }}
          >
            <option value="ALL">All Statuses</option>
            <option value="PENDING">Pending</option>
            <option value="UNDER_REVIEW">Under Review</option>
            <option value="APPROVED">Approved</option>
            <option value="REJECTED">Rejected</option>
          </select>
        </div>

        {/* Request Type Filter */}
        <div>
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            style={{
              padding: '8px 12px',
              borderRadius: '8px',
              border: '1px solid #CBD5E1',
              fontSize: '13px',
              background: '#FFFFFF',
              fontWeight: 600
            }}
          >
            <option value="ALL">All Request Types</option>
            <option value="ASSIGN_EXISTING_GLOBAL_ITEM">Path A: Assign Existing</option>
            <option value="NEW_GLOBAL_ITEM">Path B: Propose New Item</option>
          </select>
        </div>

        {/* Hospital Filter */}
        <div>
          <select
            value={tenantFilter}
            onChange={(e) => setTenantFilter(e.target.value)}
            style={{
              padding: '8px 12px',
              borderRadius: '8px',
              border: '1px solid #CBD5E1',
              fontSize: '13px',
              background: '#FFFFFF',
              fontWeight: 600
            }}
          >
            <option value="ALL">All Hospitals</option>
            {hospitals.map(h => (
              <option key={h.code || h.name} value={h.code || h.name}>
                {h.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Requests Table */}
      <div style={{
        background: '#FFFFFF',
        borderRadius: '16px',
        border: '1px solid #E2E8F0',
        overflow: 'hidden',
        boxShadow: '0 1px 3px rgba(0,0,0,0.03)'
      }}>
        {loading ? (
          <div style={{ padding: '48px', textAlign: 'center', color: '#64748B' }}>
            <LucideIcon name="loader-2" size={28} className="animate-spin" style={{ margin: '0 auto 12px auto' }} />
            Loading master requests queue...
          </div>
        ) : requests.length === 0 ? (
          <div style={{ padding: '48px', textAlign: 'center', color: '#94A3B8' }}>
            <LucideIcon name="inbox" size={32} style={{ margin: '0 auto 12px auto', color: '#CBD5E1' }} />
            <h4 style={{ margin: '0 0 4px 0', color: '#475569', fontSize: '15px' }}>No Master Requests Found</h4>
            <p style={{ margin: 0, fontSize: '12px' }}>Requests submitted by hospitals will appear here for SuperAdmin review.</p>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
              <thead>
                <tr style={{ background: '#F8FAFC', borderBottom: '1px solid #E2E8F0', color: '#475569', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  <th style={{ padding: '12px 16px', fontWeight: 800 }}>Request No</th>
                  <th style={{ padding: '12px 16px', fontWeight: 800 }}>Hospital Tenant</th>
                  <th style={{ padding: '12px 16px', fontWeight: 800 }}>Type</th>
                  <th style={{ padding: '12px 16px', fontWeight: 800 }}>Category / Dept</th>
                  <th style={{ padding: '12px 16px', fontWeight: 800 }}>Item Name / Code</th>
                  <th style={{ padding: '12px 16px', fontWeight: 800 }}>Requested MRP</th>
                  <th style={{ padding: '12px 16px', fontWeight: 800 }}>Status</th>
                  <th style={{ padding: '12px 16px', fontWeight: 800, textAlign: 'right' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {requests.map(req => {
                  const isPathA = req.requestType === 'ASSIGN_EXISTING_GLOBAL_ITEM';
                  const itemName = isPathA
                    ? (req.masterItemId?.itemName || req.masterItemId?.genericName || 'Canonical Item')
                    : (req.proposedItem?.itemName || req.categoryData?.itemName || req.proposedItem?.genericName || 'Proposed Item');
                  const itemCode = isPathA ? req.masterItemId?.itemCode : (req.approvedItemCode || '—');

                  return (
                    <tr key={req._id} style={{ borderBottom: '1px solid #F1F5F9' }}>
                      <td style={{ padding: '14px 16px', fontFamily: 'monospace', fontWeight: 700, color: '#1E293B' }}>
                        {req.requestNo}
                        {req.wasConvertedFromNewItem && (
                          <span style={{ display: 'block', fontSize: '10px', color: '#D97706', fontWeight: 700 }}>
                            [Converted Path A]
                          </span>
                        )}
                      </td>
                      <td style={{ padding: '14px 16px' }}>
                        <div style={{ fontWeight: 700, color: '#0F172A' }}>{req.hospitalName || req.tenantId}</div>
                        <div style={{ fontSize: '11px', color: '#64748B' }}>{req.tenantId}</div>
                      </td>
                      <td style={{ padding: '14px 16px' }}>
                        {isPathA ? (
                          <span style={{ fontSize: '11px', fontWeight: 700, padding: '2px 8px', borderRadius: '4px', background: '#DBEAFE', color: '#1E40AF' }}>
                            Path A (Assign)
                          </span>
                        ) : (
                          <span style={{ fontSize: '11px', fontWeight: 700, padding: '2px 8px', borderRadius: '4px', background: '#DCFCE7', color: '#166534' }}>
                            Path B (New)
                          </span>
                        )}
                      </td>
                      <td style={{ padding: '14px 16px', color: '#334155' }}>
                        {req.category} {req.department ? `· ${req.department}` : ''}
                      </td>
                      <td style={{ padding: '14px 16px' }}>
                        <div style={{ fontWeight: 700, color: '#0F172A' }}>{itemName}</div>
                        {itemCode !== '—' && (
                          <div style={{ fontSize: '11px', fontFamily: 'monospace', color: '#2563EB' }}>
                            Code: {itemCode}
                          </div>
                        )}
                      </td>
                      <td style={{ padding: '14px 16px', fontWeight: 700, color: '#0F172A' }}>
                        ₹{Number(req.requestedMrp || 0).toFixed(2)}
                      </td>
                      <td style={{ padding: '14px 16px' }}>
                        {renderStatusBadge(req.status)}
                      </td>
                      <td style={{ padding: '14px 16px', textAlign: 'right' }}>
                        <button
                          type="button"
                          onClick={() => handleOpenReview(req)}
                          style={{
                            padding: '6px 12px',
                            borderRadius: '6px',
                            border: '1px solid #CBD5E1',
                            background: '#FFFFFF',
                            color: '#1E293B',
                            fontWeight: 700,
                            fontSize: '12px',
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px'
                          }}
                        >
                          <LucideIcon name="eye" size={14} /> Review
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ────────────────── REVIEW & APPROVAL MODAL ────────────────── */}
      {isReviewOpen && activeRequest && (
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
            borderRadius: '16px',
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
              padding: '18px 24px',
              borderBottom: '1px solid #E2E8F0',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              background: '#F8FAFC'
            }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <h3 style={{ fontSize: '17px', fontWeight: 800, color: '#0F172A', margin: 0 }}>
                    Review Master Request: {activeRequest.requestNo}
                  </h3>
                  {renderStatusBadge(activeRequest.status)}
                </div>
                <div style={{ fontSize: '12px', color: '#64748B', marginTop: '4px' }}>
                  Requested by: <strong>{activeRequest.hospitalName || activeRequest.tenantId}</strong> ({activeRequest.tenantId})
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsReviewOpen(false)}
                style={{ background: 'transparent', border: 'none', color: '#94A3B8', cursor: 'pointer' }}
              >
                <LucideIcon name="x" size={20} />
              </button>
            </div>

            {/* Modal Body */}
            <div style={{ padding: '24px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '20px' }}>
              {/* Classification Info Banner */}
              <div style={{
                background: activeRequest.requestType === 'ASSIGN_EXISTING_GLOBAL_ITEM' ? '#EFF6FF' : '#F0FDF4',
                border: activeRequest.requestType === 'ASSIGN_EXISTING_GLOBAL_ITEM' ? '1px solid #BFDBFE' : '1px solid #BBF7D0',
                borderRadius: '8px',
                padding: '12px 16px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
              }}>
                <div>
                  <div style={{ fontSize: '13px', fontWeight: 800, color: activeRequest.requestType === 'ASSIGN_EXISTING_GLOBAL_ITEM' ? '#1E40AF' : '#166534' }}>
                    {activeRequest.requestType === 'ASSIGN_EXISTING_GLOBAL_ITEM'
                      ? 'Path A: Assign Existing Global Item to Hospital'
                      : 'Path B: Proposal for Brand-New Global Master Item'}
                  </div>
                  <div style={{ fontSize: '11px', color: '#475569', marginTop: '2px' }}>
                    Category: <strong>{activeRequest.category}</strong> {activeRequest.department ? `· Department: ${activeRequest.department}` : ''}
                  </div>
                </div>

                {/* Option to Convert Path B -> Path A */}
                {activeRequest.requestType === 'NEW_GLOBAL_ITEM' && ['PENDING', 'UNDER_REVIEW', 'SUBMITTED'].includes(activeRequest.status) && (
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
              {activeRequest.requestType === 'ASSIGN_EXISTING_GLOBAL_ITEM' ? (
                <div style={{ background: '#F8FAFC', padding: '16px', borderRadius: '10px', border: '1px solid #E2E8F0' }}>
                  <div style={{ fontSize: '12px', fontWeight: 800, color: '#475569', textTransform: 'uppercase', marginBottom: '8px' }}>
                    Target Canonical Global Item (Read-Only)
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '12px', fontSize: '13px' }}>
                    <div>
                      <span style={{ color: '#64748B' }}>Item Code:</span>{' '}
                      <strong style={{ fontFamily: 'monospace', color: '#2563EB' }}>
                        {activeRequest.masterItemId?.itemCode || activeRequest.approvedItemCode}
                      </strong>
                    </div>
                    <div>
                      <span style={{ color: '#64748B' }}>Item Name:</span>{' '}
                      <strong>{activeRequest.masterItemId?.itemName || activeRequest.masterItemId?.genericName}</strong>
                    </div>
                  </div>
                </div>
              ) : (
                <div style={{ background: '#F8FAFC', padding: '16px', borderRadius: '10px', border: '1px solid #E2E8F0' }}>
                  <div style={{ fontSize: '12px', fontWeight: 800, color: '#475569', textTransform: 'uppercase', marginBottom: '8px' }}>
                    Proposed Specifications (Client Excel Structure)
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '10px', fontSize: '12px' }}>
                    {Object.entries(activeRequest.categoryData || activeRequest.proposedItem || {}).map(([k, v]) => {
                      if (typeof v === 'object' || v === '' || v === null || v === undefined) return null;
                      return (
                        <div key={k} style={{ background: '#FFFFFF', padding: '8px 10px', borderRadius: '6px', border: '1px solid #E2E8F0' }}>
                          <span style={{ color: '#64748B', display: 'block', fontSize: '10px', textTransform: 'capitalize' }}>{k}</span>
                          <strong style={{ color: '#0F172A' }}>{String(v)}</strong>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Pricing Comparison: Requested vs Approved */}
              <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '10px', padding: '16px' }}>
                <div style={{ fontSize: '13px', fontWeight: 800, color: '#0F172A', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <LucideIcon name="indian-rupee" size={16} /> Commercial Pricing Determination (₹)
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px' }}>
                  {/* MRP */}
                  <div>
                    <label style={{ display: 'block', fontSize: '11px', color: '#64748B', marginBottom: '4px' }}>
                      Hospital MRP (₹)
                    </label>
                    <div style={{ fontSize: '11px', color: '#475569', marginBottom: '4px' }}>
                      Requested: <strong>₹{Number(activeRequest.requestedMrp || 0).toFixed(2)}</strong>
                    </div>
                    {['APPROVED', 'REJECTED'].includes(activeRequest.status) ? (
                      <div style={{ padding: '8px 12px', background: '#F1F5F9', borderRadius: '6px', fontWeight: 700, fontSize: '13px' }}>
                        ₹{Number(activeRequest.approvedMrp ?? activeRequest.requestedMrp ?? 0).toFixed(2)}
                      </div>
                    ) : (
                      <input
                        type="number"
                        step="0.01"
                        value={approvedPrice.mrp}
                        onChange={(e) => setApprovedPrice({ ...approvedPrice, mrp: e.target.value })}
                        style={{ width: '100%', padding: '8px 10px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '13px' }}
                      />
                    )}
                  </div>

                  {/* Net Rate */}
                  <div>
                    <label style={{ display: 'block', fontSize: '11px', color: '#64748B', marginBottom: '4px' }}>
                      Hospital Net Rate (₹)
                    </label>
                    <div style={{ fontSize: '11px', color: '#475569', marginBottom: '4px' }}>
                      Requested: <strong>₹{Number(activeRequest.requestedNetRate || 0).toFixed(2)}</strong>
                    </div>
                    {['APPROVED', 'REJECTED'].includes(activeRequest.status) ? (
                      <div style={{ padding: '8px 12px', background: '#F1F5F9', borderRadius: '6px', fontWeight: 700, fontSize: '13px' }}>
                        ₹{Number(activeRequest.approvedNetRate ?? activeRequest.requestedNetRate ?? 0).toFixed(2)}
                      </div>
                    ) : (
                      <input
                        type="number"
                        step="0.01"
                        value={approvedPrice.netRate}
                        onChange={(e) => setApprovedPrice({ ...approvedPrice, netRate: e.target.value })}
                        style={{ width: '100%', padding: '8px 10px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '13px' }}
                      />
                    )}
                  </div>

                  {/* Hospital Cost */}
                  <div>
                    <label style={{ display: 'block', fontSize: '11px', color: '#64748B', marginBottom: '4px' }}>
                      Hospital Cost (₹)
                    </label>
                    <div style={{ fontSize: '11px', color: '#475569', marginBottom: '4px' }}>
                      Requested: <strong>₹{Number(activeRequest.requestedHospitalCost || 0).toFixed(2)}</strong>
                    </div>
                    {['APPROVED', 'REJECTED'].includes(activeRequest.status) ? (
                      <div style={{ padding: '8px 12px', background: '#F1F5F9', borderRadius: '6px', fontWeight: 700, fontSize: '13px' }}>
                        ₹{Number(activeRequest.approvedHospitalCost ?? activeRequest.requestedHospitalCost ?? 0).toFixed(2)}
                      </div>
                    ) : (
                      <input
                        type="number"
                        step="0.01"
                        value={approvedPrice.hospitalCost}
                        onChange={(e) => setApprovedPrice({ ...approvedPrice, hospitalCost: e.target.value })}
                        style={{ width: '100%', padding: '8px 10px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '13px' }}
                      />
                    )}
                  </div>
                </div>
              </div>

              {/* Review Note */}
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '4px' }}>
                  Review Notes
                </label>
                <textarea
                  rows={2}
                  value={reviewNote}
                  onChange={(e) => setReviewNote(e.target.value)}
                  placeholder="Audit notes regarding pricing negotiation or approval decision..."
                  disabled={['APPROVED', 'REJECTED'].includes(activeRequest.status)}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '12px' }}
                />
              </div>

              {/* Rejection Reason if rejected */}
              {activeRequest.status === 'REJECTED' && (
                <div style={{ background: '#FEE2E2', padding: '12px 16px', borderRadius: '8px', color: '#991B1B', fontSize: '13px' }}>
                  <strong>Rejection Reason:</strong> {activeRequest.rejectionReason}
                </div>
              )}
            </div>

            {/* Modal Actions */}
            <div style={{
              padding: '16px 24px',
              borderTop: '1px solid #E2E8F0',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              background: '#F8FAFC'
            }}>
              <button
                type="button"
                onClick={() => setIsReviewOpen(false)}
                style={{ padding: '8px 18px', borderRadius: '8px', border: '1px solid #CBD5E1', background: '#FFFFFF', color: '#475569', fontWeight: 700, fontSize: '13px', cursor: 'pointer' }}
              >
                Close
              </button>

              {['PENDING', 'UNDER_REVIEW', 'SUBMITTED'].includes(activeRequest.status) && (
                <div style={{ display: 'flex', gap: '10px' }}>
                  <button
                    type="button"
                    onClick={handleOpenReject}
                    style={{ padding: '8px 18px', borderRadius: '8px', border: '1px solid #FCA5A5', background: '#FEE2E2', color: '#991B1B', fontWeight: 700, fontSize: '13px', cursor: 'pointer' }}
                  >
                    Reject Request
                  </button>

                  <button
                    type="button"
                    onClick={handleApprove}
                    disabled={reviewSubmitting}
                    style={{
                      padding: '8px 24px',
                      borderRadius: '8px',
                      border: 'none',
                      background: reviewSubmitting ? '#94A3B8' : '#2563EB',
                      color: '#FFFFFF',
                      fontWeight: 700,
                      fontSize: '13px',
                      cursor: reviewSubmitting ? 'not-allowed' : 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px'
                    }}
                  >
                    {reviewSubmitting && <LucideIcon name="loader-2" size={16} className="animate-spin" />}
                    {activeRequest.requestType === 'ASSIGN_EXISTING_GLOBAL_ITEM'
                      ? 'Approve Assignment (Path A)'
                      : 'Approve & Create Global Master (Path B)'}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ────────────────── REJECTION DIALOG ────────────────── */}
      {isRejectOpen && (
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
            borderRadius: '14px',
            width: '100%',
            maxWidth: '480px',
            padding: '24px',
            boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)'
          }}>
            <h4 style={{ fontSize: '16px', fontWeight: 800, color: '#991B1B', margin: '0 0 12px 0' }}>
              Confirm Request Rejection
            </h4>
            <p style={{ fontSize: '13px', color: '#64748B', margin: '0 0 16px 0', lineHeight: '1.5' }}>
              Please provide a clear reason for rejecting request <strong>{activeRequest?.requestNo}</strong>. This reason will be recorded permanently in the audit history.
            </p>
            <textarea
              rows={3}
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
              placeholder="e.g. Duplicate proposal, non-standard specifications, pricing outside hospital tariff ceiling..."
              style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '13px', marginBottom: '16px' }}
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button
                type="button"
                onClick={() => setIsRejectOpen(false)}
                style={{ padding: '8px 16px', borderRadius: '8px', border: '1px solid #CBD5E1', background: '#FFFFFF', fontWeight: 700, fontSize: '13px' }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmReject}
                disabled={rejecting || !rejectionReason.trim()}
                style={{
                  padding: '8px 18px',
                  borderRadius: '8px',
                  border: 'none',
                  background: (rejecting || !rejectionReason.trim()) ? '#94A3B8' : '#DC2626',
                  color: '#FFFFFF',
                  fontWeight: 700,
                  fontSize: '13px',
                  cursor: (rejecting || !rejectionReason.trim()) ? 'not-allowed' : 'pointer'
                }}
              >
                {rejecting ? 'Rejecting...' : 'Confirm Rejection'}
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
            borderRadius: '14px',
            width: '100%',
            maxWidth: '560px',
            padding: '24px',
            boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)',
            maxHeight: '85vh',
            display: 'flex',
            flexDirection: 'column'
          }}>
            <h4 style={{ fontSize: '16px', fontWeight: 800, color: '#1E293B', margin: '0 0 8px 0' }}>
              Match With Existing Canonical Global Master
            </h4>
            <p style={{ fontSize: '12px', color: '#64748B', margin: '0 0 16px 0' }}>
              Convert this <strong>NEW_GLOBAL_ITEM</strong> proposal into a <strong>Path A assignment request</strong>. This links the hospital request to an existing canonical master item, preventing duplicate ItemMaster creation.
            </p>

            <input
              type="text"
              placeholder="Search canonical item by Code, Name, or Generic..."
              value={convertSearch}
              onChange={(e) => setConvertSearch(e.target.value)}
              style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '13px', marginBottom: '12px' }}
            />

            <div style={{ flex: 1, overflowY: 'auto', border: '1px solid #E2E8F0', borderRadius: '8px', maxHeight: '200px', marginBottom: '16px' }}>
              {loadingCandidates ? (
                <div style={{ padding: '16px', textAlign: 'center', fontSize: '12px', color: '#64748B' }}>
                  Loading candidates...
                </div>
              ) : candidateGlobalItems.length === 0 ? (
                <div style={{ padding: '16px', textAlign: 'center', fontSize: '12px', color: '#94A3B8' }}>
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
                        padding: '10px 14px',
                        borderBottom: '1px solid #F1F5F9',
                        cursor: 'pointer',
                        background: isSelected ? '#EFF6FF' : '#FFFFFF',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center'
                      }}
                    >
                      <div>
                        <div style={{ fontSize: '13px', fontWeight: 700, color: isSelected ? '#1E40AF' : '#1E293B' }}>
                          [{item.itemCode}] {item.itemName || item.genericName}
                        </div>
                        <div style={{ fontSize: '11px', color: '#64748B' }}>
                          {item.category} {item.department ? `· ${item.department}` : ''}
                        </div>
                      </div>
                      {isSelected && (
                        <span style={{ fontSize: '11px', fontWeight: 800, color: '#2563EB', background: '#DBEAFE', padding: '2px 8px', borderRadius: '4px' }}>
                          Selected
                        </span>
                      )}
                    </div>
                  );
                })
              )}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button
                type="button"
                onClick={() => setIsConvertOpen(false)}
                style={{ padding: '8px 16px', borderRadius: '8px', border: '1px solid #CBD5E1', background: '#FFFFFF', fontWeight: 700, fontSize: '13px' }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmConvert}
                disabled={converting || !selectedCanonicalItem}
                style={{
                  padding: '8px 18px',
                  borderRadius: '8px',
                  border: 'none',
                  background: (converting || !selectedCanonicalItem) ? '#94A3B8' : '#2563EB',
                  color: '#FFFFFF',
                  fontWeight: 700,
                  fontSize: '13px',
                  cursor: (converting || !selectedCanonicalItem) ? 'not-allowed' : 'pointer'
                }}
              >
                {converting ? 'Converting...' : 'Convert to Path A'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
