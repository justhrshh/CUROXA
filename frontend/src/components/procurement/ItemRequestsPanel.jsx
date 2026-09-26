import React, { useState, useEffect, useCallback, useRef } from 'react';
import api from '../../utils/api';

const STATUS_COLORS = {
  DRAFT: { bg: '#F1F5F9', color: '#64748B' },
  SUBMITTED: { bg: '#DBEAFE', color: '#1D4ED8' },
  UNDER_REVIEW: { bg: '#FEF3C7', color: '#92400E' },
  APPROVED: { bg: '#DCFCE7', color: '#166534' },
  REJECTED: { bg: '#FEE2E2', color: '#991B1B' },
  CANCELLED: { bg: '#F1F5F9', color: '#94A3B8' }
};

export default function ItemRequestsPanel({ showToast }) {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ total: 0, pages: 1 });
  const [expanded, setExpanded] = useState(null);

  const showToastRef = useRef(showToast);
  useEffect(() => { showToastRef.current = showToast; }, [showToast]);

  const fetchRequests = useCallback(async (isInitial = false) => {
    try {
      if (isInitial) setInitialLoading(true);
      setLoading(true);
      const params = { page, limit: 25, status: statusFilter !== 'all' ? statusFilter : undefined };
      const res = await api.get('/item-requests', { params });
      if (res.data && res.data.success) {
        setRequests(res.data.data || []);
        setPagination(res.data.pagination || { total: 0, pages: 1 });
      }
    } catch (err) {
      if (showToastRef.current) showToastRef.current('Failed to load item requests', 'error');
    } finally {
      setLoading(false);
      setInitialLoading(false);
    }
  }, [page, statusFilter]);

  useEffect(() => { fetchRequests(requests.length === 0); }, [fetchRequests]);

  const handleCancel = async (req) => {
    if (!window.confirm(`Cancel request ${req.requestNo}?`)) return;
    try {
      await api.put(`/item-requests/${req._id}/cancel`);
      if (showToastRef.current) showToastRef.current('Request cancelled', 'success');
      fetchRequests(false);
    } catch (err) {
      if (showToastRef.current) showToastRef.current(err.response?.data?.error || 'Failed to cancel', 'error');
    }
  };

  const fmt = (d) => d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 800, color: '#0F172A' }}>My Item Requests</h2>
          <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#64748B' }}>Track your requests to add items to the Global Catalog</p>
        </div>
        <span style={{ background: '#E2E8F0', color: '#334155', padding: '3px 12px', borderRadius: '20px', fontSize: '12px', fontWeight: 700 }}>{pagination.total} Requests</span>
      </div>

      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
        {['all', 'SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'CANCELLED'].map(s => (
          <button key={s} onClick={() => { setStatusFilter(s); setPage(1); }}
            style={{ padding: '6px 14px', borderRadius: '20px', fontSize: '12px', fontWeight: 700, cursor: 'pointer', border: 'none', background: statusFilter === s ? '#0F172A' : '#F1F5F9', color: statusFilter === s ? '#fff' : '#334155' }}>
            {s === 'all' ? 'All' : s.replace('_', ' ')}
          </button>
        ))}
      </div>

      <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid #E2E8F0', overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead>
              <tr style={{ background: '#F8FAFC', borderBottom: '1px solid #E2E8F0' }}>
                <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 700, color: '#475569' }}>Request No</th>
                <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 700, color: '#475569' }}>Item Name</th>
                <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 700, color: '#475569' }}>Type</th>
                <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 700, color: '#475569' }}>Status</th>
                <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 700, color: '#475569' }}>Submitted</th>
                <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 700, color: '#475569' }}>Approved Item</th>
                <th style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 700, color: '#475569' }}>Actions</th>
              </tr>
            </thead>
            <tbody style={{ opacity: loading && !initialLoading ? 0.6 : 1 }}>
              {initialLoading ? (
                <tr><td colSpan="7" style={{ textAlign: 'center', padding: '40px', color: '#64748B' }}>Loading...</td></tr>
              ) : requests.length === 0 ? (
                <tr>
                  <td colSpan="7" style={{ textAlign: 'center', padding: '48px', color: '#64748B' }}>
                    <div style={{ fontSize: '32px', marginBottom: '10px' }}>📋</div>
                    <div style={{ fontWeight: 700, marginBottom: '6px' }}>No item requests yet</div>
                    <div style={{ fontSize: '12px' }}>Go to Item Master Catalog and click "Request New Item" to submit your first request.</div>
                  </td>
                </tr>
              ) : requests.map(req => {
                const scolor = STATUS_COLORS[req.status] || STATUS_COLORS.DRAFT;
                const isExpanded = expanded === req._id;
                return (
                  <React.Fragment key={req._id}>
                    <tr style={{ borderBottom: '1px solid #F1F5F9', cursor: 'pointer' }} onClick={() => setExpanded(isExpanded ? null : req._id)}>
                      <td style={{ padding: '14px 16px' }}>
                        <span style={{ fontFamily: 'monospace', fontWeight: 700, color: '#2563EB', background: '#EFF6FF', padding: '3px 8px', borderRadius: '6px', fontSize: '12px' }}>{req.requestNo}</span>
                      </td>
                      <td style={{ padding: '14px 16px' }}>
                        <div style={{ fontWeight: 700, color: '#0F172A' }}>{req.proposedItem?.genericName || '—'}</div>
                        {req.proposedItem?.manufacturer && <div style={{ fontSize: '11px', color: '#64748B' }}>Mfg: {req.proposedItem.manufacturer}</div>}
                      </td>
                      <td style={{ padding: '14px 16px' }}>
                        <span style={{ background: '#EDE9FE', color: '#5B21B6', padding: '2px 8px', borderRadius: '10px', fontSize: '11px', fontWeight: 700 }}>{req.proposedItem?.itemType || 'Medicine'}</span>
                      </td>
                      <td style={{ padding: '14px 16px' }}>
                        <span style={{ background: scolor.bg, color: scolor.color, padding: '3px 10px', borderRadius: '12px', fontSize: '11.5px', fontWeight: 700 }}>{req.status?.replace('_', ' ')}</span>
                        {req.status === 'REJECTED' && req.rejectionReason && (
                          <div style={{ fontSize: '11px', color: '#DC2626', marginTop: '3px', maxWidth: '160px' }}>{req.rejectionReason.substring(0, 45)}{req.rejectionReason.length > 45 ? '...' : ''}</div>
                        )}
                      </td>
                      <td style={{ padding: '14px 16px', fontSize: '12px', color: '#64748B' }}>{fmt(req.createdAt)}</td>
                      <td style={{ padding: '14px 16px' }}>
                        {req.status === 'APPROVED' && req.approvedItemCode ? (
                          <span style={{ fontFamily: 'monospace', fontWeight: 700, color: '#166534', background: '#DCFCE7', padding: '3px 8px', borderRadius: '6px', fontSize: '12px' }}>✓ {req.approvedItemCode}</span>
                        ) : '—'}
                      </td>
                      <td style={{ padding: '14px 16px', textAlign: 'right' }}>
                        <div style={{ display: 'inline-flex', gap: '6px' }}>
                          <button onClick={e => { e.stopPropagation(); setExpanded(isExpanded ? null : req._id); }}
                            style={{ background: '#F8FAFC', border: '1px solid #CBD5E1', padding: '5px 10px', fontSize: '12px', borderRadius: '6px', cursor: 'pointer' }}>
                            {isExpanded ? 'Collapse' : 'Details'}
                          </button>
                          {['DRAFT', 'SUBMITTED'].includes(req.status) && (
                            <button onClick={e => { e.stopPropagation(); handleCancel(req); }}
                              style={{ background: '#FEF2F2', border: '1px solid #FECACA', color: '#991B1B', padding: '5px 10px', fontSize: '12px', borderRadius: '6px', cursor: 'pointer' }}>
                              Cancel
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr style={{ background: '#F8FAFC' }}>
                        <td colSpan="7" style={{ padding: '16px 20px' }}>
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '12px' }}>
                            {Object.entries({
                              'Category': req.proposedItem?.categoryType,
                              'Composition': req.proposedItem?.composition,
                              'Strength': req.proposedItem?.strength ? `${req.proposedItem.strength} ${req.proposedItem.strengthUnit || ''}` : undefined,
                              'Dosage Form': req.proposedItem?.dosageForm,
                              'Route': req.proposedItem?.routeOfAdministration,
                              'Packaging': req.proposedItem?.packSizeDescription,
                              'Reason': req.reason,
                              'Review Notes': req.reviewNotes
                            }).filter(([, v]) => v).map(([k, v]) => (
                              <div key={k}>
                                <div style={{ fontSize: '11px', fontWeight: 700, color: '#475569', marginBottom: '2px' }}>{k}</div>
                                <div style={{ fontSize: '12px', color: '#0F172A' }}>{v}</div>
                              </div>
                            ))}
                          </div>
                          {req.history && req.history.length > 0 && (
                            <div style={{ marginTop: '12px', borderTop: '1px solid #E2E8F0', paddingTop: '10px' }}>
                              <div style={{ fontSize: '11px', fontWeight: 700, color: '#475569', marginBottom: '6px' }}>History</div>
                              {req.history.map((h, i) => (
                                <div key={i} style={{ fontSize: '11px', color: '#64748B', marginBottom: '3px' }}>
                                  <strong style={{ color: '#0F172A' }}>{h.action}</strong> by {h.actorName || h.actor} · {fmt(h.timestamp)}{h.note ? ` — ${h.note}` : ''}
                                </div>
                              ))}
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
        {pagination.pages > 1 && (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 20px', borderTop: '1px solid #E2E8F0', background: '#F8FAFC' }}>
            <span style={{ fontSize: '12.5px', color: '#64748B' }}>Page {page} of {pagination.pages}</span>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button disabled={page <= 1} onClick={() => setPage(p => p - 1)} style={{ padding: '6px 12px', fontSize: '12px', background: '#fff', border: '1px solid #CBD5E1', borderRadius: '6px', cursor: 'pointer' }}>Previous</button>
              <button disabled={page >= pagination.pages} onClick={() => setPage(p => p + 1)} style={{ padding: '6px 12px', fontSize: '12px', background: '#fff', border: '1px solid #CBD5E1', borderRadius: '6px', cursor: 'pointer' }}>Next</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
