import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import api, { performLogout } from '../utils/api';
import { socket, joinTenantRoom } from '../utils/socket';
import { HospitalBrandLogo, getActivePortalBranding } from '../context/PortalBrandingContext';

const DpoDashboard = () => {
  const navigate = useNavigate();
  const [currentUser, setCurrentUser] = useState(null);
  const [hospital, setHospital] = useState(null);
  const [requests, setRequests] = useState([]);
  const [stats, setStats] = useState({
    total: 0,
    pendingWindow: 0,
    readyForReview: 0,
    completed: 0,
    cancelled: 0,
    rejected: 0
  });
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedRequest, setSelectedRequest] = useState(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState('');
  const [actionSuccess, setActionSuccess] = useState('');

  // Cancel reason dialog state
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [cancelReason, setCancelReason] = useState('');

  // Reject reason dialog state
  const [showRejectDialog, setShowRejectDialog] = useState(false);
  const [rejectReason, setRejectReason] = useState('');

  // Load user and hospital tenant info
  useEffect(() => {
    try {
      const stored = localStorage.getItem('user');
      if (stored) {
        const u = JSON.parse(stored);
        setCurrentUser(u);
        const tId = u.tenantId || localStorage.getItem('tenantId');
        if (tId) {
          joinTenantRoom(tId);
        }
      }
      const branding = getActivePortalBranding();
      if (branding && branding.hospital) {
        setHospital(branding.hospital);
      }
    } catch (e) {
      console.error(e);
    }
  }, []);

  // Fetch DPO stats and requests
  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const [statsRes, reqRes] = await Promise.allSettled([
        api.get('/dpo/stats'),
        api.get('/dpo/requests')
      ]);

      if (statsRes.status === 'fulfilled') {
        setStats(statsRes.value.data);
      }
      if (reqRes.status === 'fulfilled') {
        setRequests(reqRes.value.data || []);
      }
    } catch (err) {
      console.error('Failed to load DPO data:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 10000); // 10s auto-refresh for live countdowns

    const handleSync = (e) => {
      const detail = e.detail;
      const type = typeof detail === 'string' ? detail : detail?.type;
      if (type === 'dpdp-requests' || type === 'dpdp' || type === 'dpo' || type === 'consent' || !type) {
        fetchData();
      }
    };
    window.addEventListener('curoxa_sync', handleSync);

    const onDirectSocketData = (event) => {
      if (event && (event.type === 'dpdp-requests' || event.type === 'dpdp' || event.type === 'dpo' || event.type === 'consent')) {
        fetchData();
      }
    };
    socket.on('data_changed', onDirectSocketData);

    const onFocus = () => {
      fetchData();
    };
    window.addEventListener('focus', onFocus);

    return () => {
      clearInterval(interval);
      window.removeEventListener('curoxa_sync', handleSync);
      socket.off('data_changed', onDirectSocketData);
      window.removeEventListener('focus', onFocus);
    };
  }, [fetchData]);

  // Live countdown timer calculation helper
  const getWindowTimeRemaining = (windowEndsAt) => {
    if (!windowEndsAt) return 'N/A';
    const diff = new Date(windowEndsAt) - new Date();
    if (diff <= 0) return 'Window Completed (Ready for Review)';
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const mins = Math.floor((diff / (1000 * 60)) % 60);
    const secs = Math.floor((diff / 1000) % 60);
    return `${hours}h ${mins}m ${secs}s remaining`;
  };

  const isWindowActive = (windowEndsAt) => {
    if (!windowEndsAt) return false;
    return new Date(windowEndsAt) > new Date();
  };

  // Filter requests
  const filteredRequests = requests.filter(r => {
    const matchesStatus = statusFilter === 'ALL' ||
      (statusFilter === 'PENDING' && r.status === 'PENDING') ||
      (statusFilter === 'READY_FOR_REVIEW' && r.status === 'READY_FOR_REVIEW') ||
      (statusFilter === 'COMPLETED' && (r.status === 'COMPLETED' || r.status === 'APPROVED')) ||
      (statusFilter === 'CANCELLED' && (r.status === 'CANCELLED_BY_PATIENT' || r.status === 'CANCELLED_BY_DPO')) ||
      (statusFilter === 'REJECTED' && r.status === 'REJECTED');

    if (!matchesStatus) return false;

    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      (r.requestId && r.requestId.toLowerCase().includes(q)) ||
      (r.uhId && r.uhId.toLowerCase().includes(q)) ||
      (r.hospitalPatientId && r.hospitalPatientId.toLowerCase().includes(q)) ||
      (r.patientName && r.patientName.toLowerCase().includes(q))
    );
  });

  // Action: Approve
  const handleApprove = async () => {
    if (!selectedRequest) return;
    setActionLoading(true);
    setActionError('');
    setActionSuccess('');

    try {
      const res = await api.post(`/dpo/requests/${selectedRequest._id}/approve`);
      setActionSuccess(res.data.message || 'Consent withdrawal approved and processed successfully.');
      setSelectedRequest(res.data.request);
      fetchData();
    } catch (err) {
      setActionError(err.response?.data?.error || 'Failed to approve request. Please verify 72-hour window status.');
    } finally {
      setActionLoading(false);
    }
  };

  // Action: Cancel (by DPO)
  const handleCancelByDpo = async (e) => {
    e.preventDefault();
    if (!selectedRequest || !cancelReason.trim()) return;
    setActionLoading(true);
    setActionError('');
    setActionSuccess('');

    try {
      const res = await api.post(`/dpo/requests/${selectedRequest._id}/cancel-by-dpo`, {
        reason: cancelReason.trim()
      });
      setActionSuccess(res.data.message || 'Request cancelled by DPO Manager.');
      setSelectedRequest(res.data.request);
      setShowCancelDialog(false);
      setCancelReason('');
      fetchData();
    } catch (err) {
      setActionError(err.response?.data?.error || 'Failed to cancel request.');
    } finally {
      setActionLoading(false);
    }
  };

  // Action: Reject
  const handleReject = async (e) => {
    e.preventDefault();
    if (!selectedRequest || !rejectReason.trim()) return;
    setActionLoading(true);
    setActionError('');
    setActionSuccess('');

    try {
      const res = await api.post(`/dpo/requests/${selectedRequest._id}/reject`, {
        reason: rejectReason.trim()
      });
      setActionSuccess(res.data.message || 'Request rejected.');
      setSelectedRequest(res.data.request);
      setShowRejectDialog(false);
      setRejectReason('');
      fetchData();
    } catch (err) {
      setActionError(err.response?.data?.error || 'Failed to reject request.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleLogout = () => {
    performLogout();
    navigate('/login');
  };

  return (
    <div style={{ minHeight: '100vh', background: '#F8FAFC', color: '#0F172A', fontFamily: "'Outfit', sans-serif" }}>
      {/* Top Header */}
      <header
        style={{
          background: '#FFFFFF',
          borderBottom: '1px solid #E2E8F0',
          padding: '16px 32px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          position: 'sticky',
          top: 0,
          zIndex: 40,
          boxShadow: '0 1px 3px rgba(0,0,0,0.04)'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          {hospital ? (
            <HospitalBrandLogo hospital={hospital} size={42} borderRadius={12} fontSize={16} />
          ) : (
            <div
              style={{
                width: '42px',
                height: '42px',
                borderRadius: '12px',
                background: '#2563EB',
                color: '#FFFFFF',
                fontWeight: 900,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '18px'
              }}
            >
              DPO
            </div>
          )}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <h1 style={{ fontSize: '18px', fontWeight: 900, margin: 0, color: '#0F172A' }}>
                Data Protection & Consent Office
              </h1>
              <span style={{ fontSize: '11px', fontWeight: 800, background: '#EFF6FF', color: '#2563EB', padding: '2px 8px', borderRadius: '6px' }}>
                Hospital DPO Portal
              </span>
            </div>
            <div style={{ fontSize: '12px', color: '#64748B', marginTop: '2px' }}>
              {hospital?.name || currentUser?.tenantId || 'Hospital Tenant'} • Tenant ID: <strong style={{ color: '#0F172A' }}>{currentUser?.tenantId}</strong>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '13px', fontWeight: 800, color: '#0F172A' }}>
              {currentUser?.name || 'DPO Manager'}
            </div>
            <div style={{ fontSize: '11px', color: '#64748B' }}>
              Hospital Data Protection Officer
            </div>
          </div>
          <button
            onClick={handleLogout}
            style={{
              padding: '8px 16px',
              borderRadius: '10px',
              background: '#F1F5F9',
              border: '1px solid #E2E8F0',
              fontSize: '12.5px',
              fontWeight: 800,
              color: '#475569',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            <span>Log out</span>
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main style={{ maxWidth: '1400px', margin: '0 auto', padding: '28px 24px' }}>
        {/* KPI Stat Cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '28px' }}>
          <div style={{ background: '#FFFFFF', padding: '20px', borderRadius: '16px', border: '1px solid #E2E8F0', boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }}>
            <div style={{ fontSize: '12px', fontWeight: 800, color: '#64748B', textTransform: 'uppercase' }}>Total Requests</div>
            <div style={{ fontSize: '28px', fontWeight: 900, color: '#0F172A', marginTop: '6px' }}>{stats.total}</div>
            <div style={{ fontSize: '11.5px', color: '#94A3B8', marginTop: '4px' }}>Hospital-scoped registry</div>
          </div>

          <div style={{ background: '#FFFFFF', padding: '20px', borderRadius: '16px', border: '1.5px solid #FCD34D', boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }}>
            <div style={{ fontSize: '12px', fontWeight: 800, color: '#D97706', textTransform: 'uppercase' }}>72-hr Waiting Window</div>
            <div style={{ fontSize: '28px', fontWeight: 900, color: '#D97706', marginTop: '6px' }}>{stats.pendingWindow}</div>
            <div style={{ fontSize: '11.5px', color: '#B45309', marginTop: '4px' }}>Cooling-off / non-actionable</div>
          </div>

          <div style={{ background: '#FFFFFF', padding: '20px', borderRadius: '16px', border: '1.5px solid #93C5FD', boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }}>
            <div style={{ fontSize: '12px', fontWeight: 800, color: '#2563EB', textTransform: 'uppercase' }}>Ready for Review</div>
            <div style={{ fontSize: '28px', fontWeight: 900, color: '#2563EB', marginTop: '6px' }}>{stats.readyForReview}</div>
            <div style={{ fontSize: '11.5px', color: '#1D4ED8', marginTop: '4px' }}>72h elapsed • Actionable</div>
          </div>

          <div style={{ background: '#FFFFFF', padding: '20px', borderRadius: '16px', border: '1.5px solid #86EFAC', boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }}>
            <div style={{ fontSize: '12px', fontWeight: 800, color: '#16A34A', textTransform: 'uppercase' }}>Completed / Processed</div>
            <div style={{ fontSize: '28px', fontWeight: 900, color: '#16A34A', marginTop: '6px' }}>{stats.completed}</div>
            <div style={{ fontSize: '11.5px', color: '#15803D', marginTop: '4px' }}>Anonymized & preserved</div>
          </div>

          <div style={{ background: '#FFFFFF', padding: '20px', borderRadius: '16px', border: '1px solid #E2E8F0', boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }}>
            <div style={{ fontSize: '12px', fontWeight: 800, color: '#64748B', textTransform: 'uppercase' }}>Cancelled / Rejected</div>
            <div style={{ fontSize: '28px', fontWeight: 900, color: '#64748B', marginTop: '6px' }}>{stats.cancelled + stats.rejected}</div>
            <div style={{ fontSize: '11.5px', color: '#94A3B8', marginTop: '4px' }}>No records modified</div>
          </div>
        </div>

        {/* Requests Management Container */}
        <div style={{ background: '#FFFFFF', borderRadius: '20px', border: '1px solid #E2E8F0', boxShadow: '0 1px 4px rgba(0,0,0,0.03)', overflow: 'hidden' }}>
          {/* Filter Bar */}
          <div style={{ padding: '20px 24px', borderBottom: '1px solid #F1F5F9', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '14px' }}>
            {/* Status Pills */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              {[
                { id: 'ALL', label: 'All Requests' },
                { id: 'PENDING', label: '72h Window' },
                { id: 'READY_FOR_REVIEW', label: 'Ready for Review' },
                { id: 'COMPLETED', label: 'Completed' },
                { id: 'CANCELLED', label: 'Cancelled' },
                { id: 'REJECTED', label: 'Rejected' }
              ].map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setStatusFilter(tab.id)}
                  style={{
                    padding: '7px 14px',
                    borderRadius: '10px',
                    border: 'none',
                    fontSize: '12.5px',
                    fontWeight: 800,
                    cursor: 'pointer',
                    background: statusFilter === tab.id ? '#2563EB' : '#F1F5F9',
                    color: statusFilter === tab.id ? '#FFFFFF' : '#475569',
                    transition: 'all 0.15s'
                  }}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Search Input */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <input
                type="text"
                placeholder="Search Request ID, UH-ID, Patient ID..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                style={{
                  padding: '8px 14px',
                  borderRadius: '10px',
                  border: '1.5px solid #CBD5E1',
                  fontSize: '12.5px',
                  fontWeight: 600,
                  width: '280px',
                  color: '#0F172A',
                  outline: 'none'
                }}
              />
              <button
                onClick={fetchData}
                style={{
                  padding: '8px 12px',
                  borderRadius: '10px',
                  background: '#F8FAFC',
                  border: '1px solid #E2E8F0',
                  color: '#2563EB',
                  fontSize: '12.5px',
                  fontWeight: 800,
                  cursor: 'pointer'
                }}
              >
                ↻ Refresh
              </button>
            </div>
          </div>

          {/* Table */}
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
              <thead>
                <tr style={{ background: '#F8FAFC', borderBottom: '1px solid #E2E8F0', color: '#475569', fontWeight: 800, fontSize: '11.5px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  <th style={{ padding: '14px 20px' }}>Request ID</th>
                  <th style={{ padding: '14px 20px' }}>Patient Identity</th>
                  <th style={{ padding: '14px 20px' }}>Requested Categories</th>
                  <th style={{ padding: '14px 20px' }}>Submission Date</th>
                  <th style={{ padding: '14px 20px' }}>72-hr Window Status</th>
                  <th style={{ padding: '14px 20px' }}>Current State</th>
                  <th style={{ padding: '14px 20px', textAlign: 'right' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan="7" style={{ padding: '40px', textAlign: 'center', color: '#64748B', fontWeight: 600 }}>
                      Loading consent withdrawal registry...
                    </td>
                  </tr>
                ) : filteredRequests.length === 0 ? (
                  <tr>
                    <td colSpan="7" style={{ padding: '40px', textAlign: 'center', color: '#94A3B8', fontWeight: 600 }}>
                      No consent withdrawal requests found matching your filter.
                    </td>
                  </tr>
                ) : (
                  filteredRequests.map(req => {
                    const windowActive = isWindowActive(req.withdrawalWindowEndsAt);
                    return (
                      <tr
                        key={req._id}
                        style={{ borderBottom: '1px solid #F1F5F9', transition: 'background 0.15s' }}
                        onMouseEnter={e => e.currentTarget.style.background = '#F8FAFC'}
                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                      >
                        <td style={{ padding: '16px 20px', fontWeight: 800, color: '#0F172A', fontFamily: 'monospace', fontSize: '12.5px' }}>
                          {req.requestId}
                        </td>
                        <td style={{ padding: '16px 20px' }}>
                          <div style={{ fontWeight: 800, color: '#0F172A' }}>{req.patientName || 'Patient'}</div>
                          <div style={{ fontSize: '11.5px', color: '#64748B', fontFamily: 'monospace' }}>
                            UH-ID: {req.uhId} • ID: {req.hospitalPatientId}
                          </div>
                        </td>
                        <td style={{ padding: '16px 20px' }}>
                          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                            {req.categories?.personal && (
                              <span style={{ fontSize: '10.5px', fontWeight: 800, background: '#EFF6FF', color: '#1D4ED8', padding: '2px 7px', borderRadius: '5px' }}>
                                Personal
                              </span>
                            )}
                            {req.categories?.clinical && (
                              <span style={{ fontSize: '10.5px', fontWeight: 800, background: '#F0FDF4', color: '#15803D', padding: '2px 7px', borderRadius: '5px' }}>
                                Clinical
                              </span>
                            )}
                            {req.categories?.payment && (
                              <span style={{ fontSize: '10.5px', fontWeight: 800, background: '#FEF3C7', color: '#B45309', padding: '2px 7px', borderRadius: '5px' }}>
                                Payment
                              </span>
                            )}
                          </div>
                        </td>
                        <td style={{ padding: '16px 20px', color: '#64748B', fontSize: '12px' }}>
                          {new Date(req.createdAt).toLocaleDateString()} {new Date(req.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </td>
                        <td style={{ padding: '16px 20px' }}>
                          {req.status === 'PENDING' ? (
                            <span style={{ fontSize: '11.5px', fontWeight: 800, color: windowActive ? '#D97706' : '#2563EB' }}>
                              ⏱ {getWindowTimeRemaining(req.withdrawalWindowEndsAt)}
                            </span>
                          ) : (
                            <span style={{ fontSize: '11.5px', color: '#64748B' }}>
                              Window Ended
                            </span>
                          )}
                        </td>
                        <td style={{ padding: '16px 20px' }}>
                          <span
                            style={{
                              fontSize: '11.5px',
                              fontWeight: 800,
                              padding: '4px 10px',
                              borderRadius: '8px',
                              display: 'inline-block',
                              background:
                                req.status === 'COMPLETED' || req.status === 'APPROVED' ? '#DCFCE7' :
                                req.status === 'READY_FOR_REVIEW' ? '#DBEAFE' :
                                req.status === 'PENDING' ? '#FEF3C7' :
                                req.status === 'REJECTED' ? '#FEE2E2' : '#F1F5F9',
                              color:
                                req.status === 'COMPLETED' || req.status === 'APPROVED' ? '#15803D' :
                                req.status === 'READY_FOR_REVIEW' ? '#1E40AF' :
                                req.status === 'PENDING' ? '#B45309' :
                                req.status === 'REJECTED' ? '#B91C1C' : '#475569'
                            }}
                          >
                            {req.status === 'PENDING' ? '72h Window Active' :
                             req.status === 'READY_FOR_REVIEW' ? 'Ready for Review' :
                             req.status === 'COMPLETED' ? 'Completed & Anonymized' :
                             req.status === 'APPROVED' ? 'Approved' :
                             req.status === 'CANCELLED_BY_PATIENT' ? 'Cancelled by Patient' :
                             req.status === 'CANCELLED_BY_DPO' ? 'Cancelled by DPO' : req.status}
                          </span>
                        </td>
                        <td style={{ padding: '16px 20px', textAlign: 'right' }}>
                          <button
                            onClick={() => {
                              setSelectedRequest(req);
                              setActionError('');
                              setActionSuccess('');
                            }}
                            style={{
                              padding: '6px 14px',
                              borderRadius: '8px',
                              background: '#2563EB',
                              color: '#FFFFFF',
                              border: 'none',
                              fontSize: '12px',
                              fontWeight: 800,
                              cursor: 'pointer'
                            }}
                          >
                            View Details →
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>

      {/* DETAIL MODAL / DRAWER */}
      {selectedRequest && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 10001,
            background: 'rgba(15, 23, 42, 0.65)',
            backdropFilter: 'blur(8px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px'
          }}
          onClick={() => setSelectedRequest(null)}
        >
          <div
            style={{
              background: '#FFFFFF',
              borderRadius: '24px',
              maxWidth: '680px',
              width: '100%',
              padding: '28px',
              boxShadow: '0 25px 50px -12px rgba(15, 23, 42, 0.3)',
              border: '1px solid #E2E8F0',
              maxHeight: '90vh',
              overflowY: 'auto'
            }}
            onClick={e => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
              <div>
                <span style={{ fontSize: '11px', fontWeight: 800, color: '#2563EB', textTransform: 'uppercase' }}>
                  DPO Request Assessment
                </span>
                <h3 style={{ fontSize: '20px', fontWeight: 900, color: '#0F172A', margin: '2px 0 0 0' }}>
                  {selectedRequest.requestId}
                </h3>
              </div>
              <button
                onClick={() => setSelectedRequest(null)}
                style={{
                  background: '#F1F5F9',
                  border: 'none',
                  borderRadius: '10px',
                  width: '32px',
                  height: '32px',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: 800,
                  color: '#64748B'
                }}
              >
                ✕
              </button>
            </div>

            {/* Action Feedback Alerts */}
            {actionSuccess && (
              <div style={{ background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: '12px', padding: '12px 14px', marginBottom: '16px', color: '#16A34A', fontSize: '12.5px', fontWeight: 700 }}>
                ✅ {actionSuccess}
              </div>
            )}
            {actionError && (
              <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: '12px', padding: '12px 14px', marginBottom: '16px', color: '#DC2626', fontSize: '12.5px', fontWeight: 700 }}>
                ⚠️ {actionError}
              </div>
            )}

            {/* Patient & Hospital Info Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '20px' }}>
              <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '14px', padding: '14px' }}>
                <div style={{ fontSize: '11px', fontWeight: 800, color: '#64748B', textTransform: 'uppercase' }}>Data Principal Identity</div>
                <div style={{ fontSize: '15px', fontWeight: 900, color: '#0F172A', marginTop: '4px' }}>{selectedRequest.patientName}</div>
                <div style={{ fontSize: '12px', color: '#475569', marginTop: '2px' }}>
                  UH-ID: <strong style={{ fontFamily: 'monospace' }}>{selectedRequest.uhId}</strong>
                </div>
                <div style={{ fontSize: '12px', color: '#475569' }}>
                  Hospital Patient ID: <strong style={{ fontFamily: 'monospace' }}>{selectedRequest.hospitalPatientId}</strong>
                </div>
              </div>

              <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '14px', padding: '14px' }}>
                <div style={{ fontSize: '11px', fontWeight: 800, color: '#64748B', textTransform: 'uppercase' }}>72-Hour Statutory Window</div>
                <div style={{ fontSize: '13.5px', fontWeight: 800, color: isWindowActive(selectedRequest.withdrawalWindowEndsAt) ? '#D97706' : '#15803D', marginTop: '4px' }}>
                  {getWindowTimeRemaining(selectedRequest.withdrawalWindowEndsAt)}
                </div>
                <div style={{ fontSize: '11.5px', color: '#64748B', marginTop: '4px' }}>
                  Deadline: {new Date(selectedRequest.withdrawalWindowEndsAt).toLocaleString()}
                </div>
              </div>
            </div>

            {/* Requested Categories */}
            <div style={{ marginBottom: '20px' }}>
              <div style={{ fontSize: '12px', fontWeight: 800, color: '#0F172A', marginBottom: '8px' }}>
                Requested Record Categories:
              </div>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <div style={{ padding: '8px 14px', borderRadius: '10px', background: selectedRequest.categories?.personal ? '#EFF6FF' : '#F1F5F9', border: `1px solid ${selectedRequest.categories?.personal ? '#BFDBFE' : '#E2E8F0'}`, color: selectedRequest.categories?.personal ? '#1E40AF' : '#94A3B8', fontSize: '12.5px', fontWeight: 800 }}>
                  {selectedRequest.categories?.personal ? '☑ Personal Records (Demographics)' : '☐ Personal Records'}
                </div>
                <div style={{ padding: '8px 14px', borderRadius: '10px', background: selectedRequest.categories?.clinical ? '#F0FDF4' : '#F1F5F9', border: `1px solid ${selectedRequest.categories?.clinical ? '#BBF7D0' : '#E2E8F0'}`, color: selectedRequest.categories?.clinical ? '#166534' : '#94A3B8', fontSize: '12.5px', fontWeight: 800 }}>
                  {selectedRequest.categories?.clinical ? '☑ Clinical Records (Rx / Labs)' : '☐ Clinical Records'}
                </div>
                <div style={{ padding: '8px 14px', borderRadius: '10px', background: selectedRequest.categories?.payment ? '#FEF3C7' : '#F1F5F9', border: `1px solid ${selectedRequest.categories?.payment ? '#FCD34D' : '#E2E8F0'}`, color: selectedRequest.categories?.payment ? '#92400E' : '#94A3B8', fontSize: '12.5px', fontWeight: 800 }}>
                  {selectedRequest.categories?.payment ? '☑ Payment Details (Recorded Only)' : '☐ Payment Details'}
                </div>
              </div>
            </div>

            {/* Processing Logs (if completed) */}
            {selectedRequest.processingLog && selectedRequest.processingLog.length > 0 && (
              <div style={{ marginBottom: '20px', background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '14px', padding: '14px' }}>
                <div style={{ fontSize: '12px', fontWeight: 800, color: '#0F172A', marginBottom: '8px' }}>
                  Processing Results:
                </div>
                {selectedRequest.processingLog.map((log, idx) => (
                  <div key={idx} style={{ fontSize: '12px', color: '#334155', marginBottom: '4px' }}>
                    • <strong>{log.category.toUpperCase()}:</strong> {log.details}
                  </div>
                ))}
              </div>
            )}

            {/* Audit Trail Timeline */}
            <div style={{ marginBottom: '24px' }}>
              <div style={{ fontSize: '12px', fontWeight: 800, color: '#0F172A', marginBottom: '8px' }}>
                Audit Trail Timeline:
              </div>
              <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '12px', padding: '12px', maxHeight: '140px', overflowY: 'auto' }}>
                {selectedRequest.auditTrail?.map((trail, i) => (
                  <div key={i} style={{ fontSize: '11.5px', color: '#475569', marginBottom: '6px', borderBottom: '1px dashed #E2E8F0', paddingBottom: '4px' }}>
                    <span style={{ fontWeight: 800, color: '#0F172A' }}>{trail.action}</span> by {trail.actorName} ({trail.actorRole}) • {new Date(trail.timestamp).toLocaleString()}
                    {trail.notes && <div style={{ color: '#64748B', fontStyle: 'italic', marginTop: '2px' }}>"{trail.notes}"</div>}
                  </div>
                ))}
              </div>
            </div>

            {/* DPO Workflow Actions */}
            <div style={{ borderTop: '1px solid #F1F5F9', paddingTop: '18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
              {/* If window is active: DPO can cancel request */}
              {selectedRequest.status === 'PENDING' && isWindowActive(selectedRequest.withdrawalWindowEndsAt) ? (
                <>
                  <button
                    type="button"
                    onClick={() => setShowCancelDialog(true)}
                    style={{
                      padding: '10px 18px',
                      borderRadius: '10px',
                      background: '#FEF2F2',
                      border: '1.5px solid #FECACA',
                      color: '#DC2626',
                      fontSize: '13px',
                      fontWeight: 800,
                      cursor: 'pointer'
                    }}
                  >
                    Cancel Request (DPO Reason)
                  </button>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '11.5px', color: '#94A3B8', fontWeight: 600 }}>
                      Approve unlocks after 72h window
                    </span>
                    <button
                      type="button"
                      disabled
                      title="Approval is locked by backend until the 72-hour window finishes."
                      style={{
                        padding: '10px 20px',
                        borderRadius: '10px',
                        background: '#CBD5E1',
                        color: '#FFFFFF',
                        border: 'none',
                        fontSize: '13px',
                        fontWeight: 800,
                        cursor: 'not-allowed'
                      }}
                    >
                      🔒 Approve (Locked)
                    </button>
                  </div>
                </>
              ) : selectedRequest.status === 'READY_FOR_REVIEW' || (!isWindowActive(selectedRequest.withdrawalWindowEndsAt) && selectedRequest.status === 'PENDING') ? (
                /* If window elapsed: DPO can approve or reject */
                <>
                  <button
                    type="button"
                    onClick={() => setShowRejectDialog(true)}
                    disabled={actionLoading}
                    style={{
                      padding: '10px 18px',
                      borderRadius: '10px',
                      background: '#FEF2F2',
                      border: '1px solid #FECACA',
                      color: '#DC2626',
                      fontSize: '13px',
                      fontWeight: 800,
                      cursor: 'pointer'
                    }}
                  >
                    Reject Withdrawal
                  </button>

                  <button
                    type="button"
                    onClick={handleApprove}
                    disabled={actionLoading}
                    style={{
                      padding: '10px 24px',
                      borderRadius: '10px',
                      background: '#16A34A',
                      color: '#FFFFFF',
                      border: 'none',
                      fontSize: '13.5px',
                      fontWeight: 800,
                      cursor: 'pointer',
                      boxShadow: '0 4px 12px rgba(22, 163, 74, 0.28)'
                    }}
                  >
                    {actionLoading ? 'Processing Anonymization...' : '✓ Approve & Execute Withdrawal'}
                  </button>
                </>
              ) : (
                <div style={{ fontSize: '12.5px', color: '#64748B', fontWeight: 700 }}>
                  This request has reached its terminal state: <strong>{selectedRequest.status}</strong>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* DPO Cancel Dialog */}
      {showCancelDialog && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 10005,
            background: 'rgba(15, 23, 42, 0.6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px'
          }}
        >
          <div style={{ background: '#FFFFFF', borderRadius: '20px', maxWidth: '440px', width: '100%', padding: '24px' }}>
            <h4 style={{ fontSize: '17px', fontWeight: 900, color: '#0F172A', margin: '0 0 8px 0' }}>
              Cancel Consent Withdrawal
            </h4>
            <p style={{ fontSize: '12.5px', color: '#64748B', lineHeight: 1.5, margin: '0 0 16px 0' }}>
              Provide a clear administrative justification for cancelling this request during the 72-hour window.
            </p>
            <textarea
              rows="3"
              placeholder="e.g. Consulted with patient; identity verified and withdrawal cancelled by mutual consent."
              value={cancelReason}
              onChange={e => setCancelReason(e.target.value)}
              style={{
                width: '100%',
                padding: '10px',
                borderRadius: '10px',
                border: '1.5px solid #CBD5E1',
                fontSize: '12.5px',
                outline: 'none',
                marginBottom: '18px'
              }}
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button
                type="button"
                onClick={() => setShowCancelDialog(false)}
                style={{ padding: '8px 16px', borderRadius: '8px', background: '#F1F5F9', border: 'none', fontWeight: 700 }}
              >
                Back
              </button>
              <button
                type="button"
                onClick={handleCancelByDpo}
                disabled={!cancelReason.trim() || actionLoading}
                style={{
                  padding: '8px 18px',
                  borderRadius: '8px',
                  background: '#DC2626',
                  color: '#FFFFFF',
                  border: 'none',
                  fontWeight: 800,
                  cursor: cancelReason.trim() ? 'pointer' : 'not-allowed'
                }}
              >
                Confirm Cancellation
              </button>
            </div>
          </div>
        </div>
      )}

      {/* DPO Reject Dialog */}
      {showRejectDialog && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 10005,
            background: 'rgba(15, 23, 42, 0.6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px'
          }}
        >
          <div style={{ background: '#FFFFFF', borderRadius: '20px', maxWidth: '440px', width: '100%', padding: '24px' }}>
            <h4 style={{ fontSize: '17px', fontWeight: 900, color: '#0F172A', margin: '0 0 8px 0' }}>
              Reject Consent Withdrawal
            </h4>
            <p style={{ fontSize: '12.5px', color: '#64748B', lineHeight: 1.5, margin: '0 0 16px 0' }}>
              Please specify the statutory grounds for rejection (e.g. mandatory ongoing clinical dispute, legal hold).
            </p>
            <textarea
              rows="3"
              placeholder="e.g. Legal hold active or statutory court inquiry requires retention."
              value={rejectReason}
              onChange={e => setRejectReason(e.target.value)}
              style={{
                width: '100%',
                padding: '10px',
                borderRadius: '10px',
                border: '1.5px solid #CBD5E1',
                fontSize: '12.5px',
                outline: 'none',
                marginBottom: '18px'
              }}
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button
                type="button"
                onClick={() => setShowRejectDialog(false)}
                style={{ padding: '8px 16px', borderRadius: '8px', background: '#F1F5F9', border: 'none', fontWeight: 700 }}
              >
                Back
              </button>
              <button
                type="button"
                onClick={handleReject}
                disabled={!rejectReason.trim() || actionLoading}
                style={{
                  padding: '8px 18px',
                  borderRadius: '8px',
                  background: '#DC2626',
                  color: '#FFFFFF',
                  border: 'none',
                  fontWeight: 800,
                  cursor: rejectReason.trim() ? 'pointer' : 'not-allowed'
                }}
              >
                Confirm Rejection
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DpoDashboard;
