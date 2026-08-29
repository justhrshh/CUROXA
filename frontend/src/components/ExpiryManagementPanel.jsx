import React, { useState, useEffect, useMemo } from 'react';
import api from '../utils/api';

function ExpiryManagementPanel({ showToast, onStockUpdated }) {
  const [summary, setSummary] = useState({
    expiredUnits: 0,
    criticalUnits: 0,
    warningUnits: 0,
    atRiskValue: 0,
    affectedBatchesCount: 0
  });
  const [batches, setBatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [riskFilter, setRiskFilter] = useState('ALL_RISKS');
  const [categoryFilter, setCategoryFilter] = useState('All');
  const [page, setPage] = useState(1);

  const [selectedBatch, setSelectedBatch] = useState(null);
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [showWriteOffModal, setShowWriteOffModal] = useState(false);
  const [writeOffQty, setWriteOffQty] = useState('');
  const [writeOffReason, setWriteOffReason] = useState('Expired Inventory Write-Off');
  const [isSubmittingWriteOff, setIsSubmittingWriteOff] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [summaryRes, listRes] = await Promise.all([
        api.get('/inventory-expiry/summary'),
        api.get('/inventory-expiry?risk=ALL&limit=200')
      ]);
      setSummary(summaryRes.data || { expiredUnits: 0, criticalUnits: 0, warningUnits: 0, atRiskValue: 0, affectedBatchesCount: 0 });
      setBatches(listRes.data.batches || []);
    } catch (err) {
      console.error('Failed to fetch expiry data', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const uniqueCategories = useMemo(() => {
    const set = new Set();
    batches.forEach(b => { if (b.category) set.add(b.category); });
    return Array.from(set).sort();
  }, [batches]);

  const filteredBatches = useMemo(() => {
    return batches.filter(b => {
      if (riskFilter === 'EXPIRED' && b.risk !== 'EXPIRED') return false;
      if (riskFilter === 'CRITICAL' && b.risk !== 'CRITICAL') return false;
      if (riskFilter === 'WARNING' && b.risk !== 'WARNING') return false;
      if (riskFilter === 'SAFE' && b.risk !== 'SAFE') return false;
      if (riskFilter === 'ALL_RISKS' && !['EXPIRED', 'CRITICAL', 'WARNING'].includes(b.risk)) return false;

      if (categoryFilter !== 'All' && b.category !== categoryFilter) return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const nameMatch = b.name && b.name.toLowerCase().includes(q);
        const skuMatch = b.sku && b.sku.toLowerCase().includes(q);
        const batchMatch = b.batchNumber && b.batchNumber.toLowerCase().includes(q);
        if (!nameMatch && !skuMatch && !batchMatch) return false;
      }

      return true;
    });
  }, [batches, riskFilter, categoryFilter, searchQuery]);

  const pageSize = 15;
  const totalPages = Math.ceil(filteredBatches.length / pageSize) || 1;
  const pagedBatches = filteredBatches.slice((page - 1) * pageSize, page * pageSize);

  const handleOpenReview = (batch) => {
    setSelectedBatch(batch);
    setWriteOffQty(batch.availableQuantity || 1);
    setWriteOffReason('Expired Inventory Write-Off');
    setShowReviewModal(true);
  };

  const handleConfirmWriteOff = async (e) => {
    if (e) e.preventDefault();
    if (!selectedBatch) return;
    const qty = parseInt(writeOffQty, 10);
    if (isNaN(qty) || qty <= 0 || qty > (selectedBatch.availableQuantity || 0)) {
      if (showToast) showToast(`Please enter a valid write-off quantity (1 to ${selectedBatch.availableQuantity})`, 'error');
      return;
    }

    setIsSubmittingWriteOff(true);
    try {
      const res = await api.post(`/inventory-expiry/${selectedBatch._id}/write-off`, {
        quantity: qty,
        reason: writeOffReason.trim() || 'Expired Inventory Write-Off'
      });
      if (showToast) showToast(`Successfully wrote off ${qty} units of ${selectedBatch.name}!`, 'success');
      setShowWriteOffModal(false);
      setShowReviewModal(false);
      setSelectedBatch(null);
      await fetchData();
      if (onStockUpdated) onStockUpdated();
    } catch (err) {
      console.error('Write-off error:', err);
      if (showToast) showToast(err.response?.data?.error || 'Failed to write off inventory', 'error');
    } finally {
      setIsSubmittingWriteOff(false);
    }
  };

  return (
    <div style={{ animation: 'slideUp 0.3s ease-out' }}>
      {/* Header */}
      <div style={{ marginBottom: '24px' }}>
        <h2 style={{ fontSize: '24px', fontWeight: 900, color: '#0F172A', margin: 0 }}>Expiry Management</h2>
        <p style={{ color: '#64748B', fontSize: '14px', margin: '4px 0 0 0' }}>
          Monitor medicine batches approaching expiry, expired inventory and write-offs.
        </p>
      </div>

      {/* 5 KPI Financial & Risk Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: '16px', marginBottom: '24px' }}>
        {/* Card 1: Expired Stock */}
        <div className="glass-card" style={{ padding: '18px 20px', borderRadius: '16px', background: 'linear-gradient(135deg, #FFFFFF 0%, #FEF2F2 100%)', border: '1px solid #FEE2E2' }}>
          <div style={{ fontSize: '11.5px', fontWeight: 800, color: '#DC2626', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span>🔴</span> Expired Stock
          </div>
          <div style={{ fontSize: '26px', fontWeight: 900, color: '#B91C1C', marginTop: '6px' }}>
            {summary.expiredUnits || 0} <span style={{ fontSize: '14px', fontWeight: 700, color: '#64748B' }}>units</span>
          </div>
          <div style={{ fontSize: '11.5px', color: '#DC2626', fontWeight: 600, marginTop: '4px' }}>Blocked from sale / dispensing</div>
        </div>

        {/* Card 2: Critical */}
        <div className="glass-card" style={{ padding: '18px 20px', borderRadius: '16px', background: 'linear-gradient(135deg, #FFFFFF 0%, #FFF7ED 100%)', border: '1px solid #FFEDD5' }}>
          <div style={{ fontSize: '11.5px', fontWeight: 800, color: '#C2410C', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span>🟠</span> Critical — ≤30 Days
          </div>
          <div style={{ fontSize: '26px', fontWeight: 900, color: '#C2410C', marginTop: '6px' }}>
            {summary.criticalUnits || 0} <span style={{ fontSize: '14px', fontWeight: 700, color: '#64748B' }}>units</span>
          </div>
          <div style={{ fontSize: '11.5px', color: '#EA580C', fontWeight: 600, marginTop: '4px' }}>Immediate FEFO dispatch needed</div>
        </div>

        {/* Card 3: Warning */}
        <div className="glass-card" style={{ padding: '18px 20px', borderRadius: '16px', background: 'linear-gradient(135deg, #FFFFFF 0%, #FEF9C3 100%)', border: '1px solid #FEF08A' }}>
          <div style={{ fontSize: '11.5px', fontWeight: 800, color: '#854D0E', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span>🟡</span> Warning — 31-90 Days
          </div>
          <div style={{ fontSize: '26px', fontWeight: 900, color: '#854D0E', marginTop: '6px' }}>
            {summary.warningUnits || 0} <span style={{ fontSize: '14px', fontWeight: 700, color: '#64748B' }}>units</span>
          </div>
          <div style={{ fontSize: '11.5px', color: '#B45309', fontWeight: 600, marginTop: '4px' }}>Monitor dispensing rate</div>
        </div>

        {/* Card 4: At-Risk Value */}
        <div className="glass-card" style={{ padding: '18px 20px', borderRadius: '16px', background: 'linear-gradient(135deg, #FFFFFF 0%, #EFF6FF 100%)', border: '1px solid #DBEAFE' }}>
          <div style={{ fontSize: '11.5px', fontWeight: 800, color: '#1D4ED8', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span>💰</span> At-Risk Value (Cost)
          </div>
          <div style={{ fontSize: '26px', fontWeight: 900, color: '#1E3A8A', marginTop: '6px' }}>
            ₹{(summary.atRiskValue || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div style={{ fontSize: '11.5px', color: '#64748B', fontWeight: 600, marginTop: '4px' }}>Based on purchase rate, not MRP</div>
        </div>

        {/* Card 5: Affected Batches */}
        <div className="glass-card" style={{ padding: '18px 20px', borderRadius: '16px', background: 'linear-gradient(135deg, #FFFFFF 0%, #F5F3FF 100%)', border: '1px solid #EDE9FE' }}>
          <div style={{ fontSize: '11.5px', fontWeight: 800, color: '#6D28D9', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span>📦</span> Affected Batches
          </div>
          <div style={{ fontSize: '26px', fontWeight: 900, color: '#4C1D95', marginTop: '6px' }}>
            {summary.affectedBatchesCount || 0} <span style={{ fontSize: '14px', fontWeight: 700, color: '#64748B' }}>batches</span>
          </div>
          <div style={{ fontSize: '11.5px', color: '#6D28D9', fontWeight: 600, marginTop: '4px' }}>Non-depleted at-risk records</div>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="glass-card" style={{ padding: '16px 20px', borderRadius: '16px', marginBottom: '20px', border: '1px solid #E2E8F0', background: 'white' }}>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
          {/* Search */}
          <div style={{ position: 'relative', flex: '1 1 240px', minWidth: '200px' }}>
            <input
              type="text"
              placeholder="Search Medicine, SKU, Batch Number..."
              value={searchQuery}
              onChange={(e) => { setSearchQuery(e.target.value); setPage(1); }}
              style={{ width: '100%', padding: '8px 14px', borderRadius: '10px', border: '1px solid #E2E8F0', fontSize: '13px', fontWeight: 600, color: '#1E293B', outline: 'none' }}
            />
          </div>

          {/* Risk Filter */}
          <div style={{ width: '180px' }}>
            <select
              value={riskFilter}
              onChange={(e) => { setRiskFilter(e.target.value); setPage(1); }}
              style={{ width: '100%', padding: '8px 12px', fontSize: '12.5px', borderRadius: '10px', border: '1px solid #E2E8F0', background: '#FFFFFF', color: '#0F172A', fontWeight: 600, outline: 'none' }}
            >
              <option value="ALL_RISKS">All At-Risk (🔴🟠🟡)</option>
              <option value="EXPIRED">🔴 Expired</option>
              <option value="CRITICAL">🟠 Critical (≤30 days)</option>
              <option value="WARNING">🟡 Warning (31-90 days)</option>
              <option value="SAFE">🟢 Safe (&gt;90 days)</option>
              <option value="ALL">All Non-Depleted</option>
            </select>
          </div>

          {/* Category Filter */}
          <div style={{ width: '160px' }}>
            <select
              value={categoryFilter}
              onChange={(e) => { setCategoryFilter(e.target.value); setPage(1); }}
              style={{ width: '100%', padding: '8px 12px', fontSize: '12.5px', borderRadius: '10px', border: '1px solid #E2E8F0', background: '#FFFFFF', color: '#0F172A', fontWeight: 600, outline: 'none' }}
            >
              <option value="All">All Categories</option>
              {uniqueCategories.map(cat => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
          </div>

          <button
            className="btn btn-secondary"
            onClick={fetchData}
            style={{ padding: '8px 16px', fontSize: '12.5px', borderRadius: '10px', background: '#F8FAFC', border: '1px solid #CBD5E1', color: '#334155', fontWeight: 700, cursor: 'pointer' }}
          >
            REFRESH
          </button>
        </div>
      </div>

      {/* Expiry Risk Table */}
      <div className="glass-card" style={{ padding: 0, overflow: 'hidden', border: '1px solid #E2E8F0', borderRadius: '16px' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead>
              <tr style={{ background: '#F8FAFC', borderBottom: '1px solid #E2E8F0' }}>
                <th style={{ padding: '14px 16px', fontSize: '11.5px', fontWeight: 800, color: '#475569', textTransform: 'uppercase' }}>Medicine</th>
                <th style={{ padding: '14px 16px', fontSize: '11.5px', fontWeight: 800, color: '#475569', textTransform: 'uppercase' }}>SKU</th>
                <th style={{ padding: '14px 16px', fontSize: '11.5px', fontWeight: 800, color: '#475569', textTransform: 'uppercase' }}>Batch</th>
                <th style={{ padding: '14px 16px', fontSize: '11.5px', fontWeight: 800, color: '#475569', textTransform: 'uppercase' }}>Expiry Date</th>
                <th style={{ padding: '14px 16px', fontSize: '11.5px', fontWeight: 800, color: '#475569', textTransform: 'uppercase' }}>Days Remaining</th>
                <th style={{ padding: '14px 16px', fontSize: '11.5px', fontWeight: 800, color: '#475569', textTransform: 'uppercase', textAlign: 'center' }}>Avail Qty</th>
                <th style={{ padding: '14px 16px', fontSize: '11.5px', fontWeight: 800, color: '#475569', textTransform: 'uppercase' }}>Unit</th>
                <th style={{ padding: '14px 16px', fontSize: '11.5px', fontWeight: 800, color: '#475569', textTransform: 'uppercase', textAlign: 'right' }}>Purchase Rate</th>
                <th style={{ padding: '14px 16px', fontSize: '11.5px', fontWeight: 800, color: '#475569', textTransform: 'uppercase', textAlign: 'right' }}>Stock Value</th>
                <th style={{ padding: '14px 16px', fontSize: '11.5px', fontWeight: 800, color: '#475569', textTransform: 'uppercase', textAlign: 'center' }}>Risk</th>
                <th style={{ padding: '14px 16px', fontSize: '11.5px', fontWeight: 800, color: '#475569', textTransform: 'uppercase', textAlign: 'center' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan="11" style={{ textAlign: 'center', padding: '32px', color: '#64748B' }}>
                    Loading expiry batches...
                  </td>
                </tr>
              ) : pagedBatches.length === 0 ? (
                <tr>
                  <td colSpan="11" style={{ textAlign: 'center', padding: '32px', color: '#64748B' }}>
                    No batches matching the current filters.
                  </td>
                </tr>
              ) : (
                pagedBatches.map(b => {
                  const dateStr = b.expiryDate ? new Date(b.expiryDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : 'N/A';

                  let badgeBg = '#DCFCE7';
                  let badgeColor = '#166534';
                  let badgeLabel = 'SAFE';
                  let rowBg = '#FFFFFF';

                  if (b.risk === 'EXPIRED') {
                    badgeBg = '#FEE2E2';
                    badgeColor = '#DC2626';
                    badgeLabel = 'EXPIRED';
                    rowBg = 'linear-gradient(90deg, rgba(254, 242, 242, 0.6) 0%, #FFFFFF 100%)';
                  } else if (b.risk === 'CRITICAL') {
                    badgeBg = '#FFEDD5';
                    badgeColor = '#C2410C';
                    badgeLabel = 'CRITICAL';
                    rowBg = 'linear-gradient(90deg, rgba(255, 247, 237, 0.6) 0%, #FFFFFF 100%)';
                  } else if (b.risk === 'WARNING') {
                    badgeBg = '#FEF9C3';
                    badgeColor = '#854D0E';
                    badgeLabel = 'WARNING';
                    rowBg = 'linear-gradient(90deg, rgba(254, 252, 232, 0.6) 0%, #FFFFFF 100%)';
                  } else if (b.risk === 'DEPLETED') {
                    badgeBg = '#F1F5F9';
                    badgeColor = '#64748B';
                    badgeLabel = 'DEPLETED';
                  }

                  return (
                    <tr key={b._id} style={{ background: rowBg, borderBottom: '1px solid #E2E8F0' }}>
                      <td style={{ padding: '12px 16px', fontWeight: 800, color: '#0F172A' }}>
                        {b.name}
                      </td>
                      <td style={{ padding: '12px 16px', fontFamily: 'monospace', fontWeight: 700, color: '#475569' }}>
                        {b.sku}
                      </td>
                      <td style={{ padding: '12px 16px', fontFamily: 'monospace', fontWeight: 700, color: '#2563EB' }}>
                        {b.batchNumber}
                      </td>
                      <td style={{ padding: '12px 16px', fontWeight: 600, color: '#334155' }}>
                        {dateStr}
                      </td>
                      <td style={{ padding: '12px 16px', fontWeight: 700, color: b.risk === 'EXPIRED' ? '#DC2626' : '#475569' }}>
                        {b.risk === 'EXPIRED' ? 'EXPIRED' : b.daysRemaining === null ? '-' : `${b.daysRemaining} days`}
                      </td>
                      <td style={{ padding: '12px 16px', textAlign: 'center', fontWeight: 800, color: b.availableQuantity > 0 ? '#0F172A' : '#94A3B8' }}>
                        {b.availableQuantity}
                      </td>
                      <td style={{ padding: '12px 16px', fontWeight: 600, color: '#64748B' }}>
                        {b.unit || 'Strip'}
                      </td>
                      <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 700, color: '#475569' }}>
                        ₹{(b.purchaseRate || 0).toFixed(2)}
                      </td>
                      <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 800, color: '#0F172A' }}>
                        ₹{(b.stockValue || 0).toFixed(2)}
                      </td>
                      <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                        <span style={{ padding: '4px 10px', borderRadius: '6px', fontSize: '11px', fontWeight: 800, background: badgeBg, color: badgeColor }}>
                          {badgeLabel}
                        </span>
                      </td>
                      <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                        <button
                          className="btn btn-secondary"
                          onClick={() => handleOpenReview(b)}
                          style={{ padding: '5px 12px', fontSize: '11.5px', borderRadius: '6px', border: '1px solid #E2E8F0', background: 'white', color: '#2563EB', fontWeight: 800, cursor: 'pointer' }}
                        >
                          {b.risk === 'EXPIRED' ? 'Review' : 'View'}
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Footer */}
        {totalPages > 1 && (
          <div style={{ padding: '12px 16px', background: '#F8FAFC', borderTop: '1px solid #E2E8F0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '12px', color: '#64748B', fontWeight: 600 }}>
              Showing page <b>{page}</b> of <b>{totalPages}</b> ({filteredBatches.length} total batches)
            </span>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                disabled={page <= 1}
                onClick={() => setPage(p => Math.max(1, p - 1))}
                style={{ padding: '4px 10px', fontSize: '12px', borderRadius: '6px', border: '1px solid #E2E8F0', background: 'white', cursor: page <= 1 ? 'not-allowed' : 'pointer' }}
              >
                Prev
              </button>
              <button
                disabled={page >= totalPages}
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                style={{ padding: '4px 10px', fontSize: '12px', borderRadius: '6px', border: '1px solid #E2E8F0', background: 'white', cursor: page >= totalPages ? 'not-allowed' : 'pointer' }}
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Detail / Review Quarantine Modal */}
      {showReviewModal && selectedBatch && (
        <div className="modal-overlay" onClick={() => setShowReviewModal(false)}>
          <div
            className="glass-card"
            style={{ padding: '28px', borderRadius: '20px', width: '580px', maxWidth: '90%', background: 'white', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #F1F5F9', paddingBottom: '14px', marginBottom: '20px' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 800, color: '#0F172A' }}>Batch Detail & Risk Review</h3>
                <span style={{ fontSize: '12px', color: '#64748B' }}>Review expiry status and quarantine actions</span>
              </div>
              <button onClick={() => setShowReviewModal(false)} style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', color: '#94A3B8' }}>✕</button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '20px' }}>
              <div style={{ padding: '12px', background: '#F8FAFC', borderRadius: '10px' }}>
                <div style={{ fontSize: '11px', fontWeight: 700, color: '#64748B' }}>MEDICINE NAME</div>
                <div style={{ fontSize: '14px', fontWeight: 800, color: '#0F172A' }}>{selectedBatch.name}</div>
              </div>
              <div style={{ padding: '12px', background: '#F8FAFC', borderRadius: '10px' }}>
                <div style={{ fontSize: '11px', fontWeight: 700, color: '#64748B' }}>SKU CODE</div>
                <div style={{ fontSize: '14px', fontWeight: 800, color: '#475569', fontFamily: 'monospace' }}>{selectedBatch.sku}</div>
              </div>
              <div style={{ padding: '12px', background: '#F8FAFC', borderRadius: '10px' }}>
                <div style={{ fontSize: '11px', fontWeight: 700, color: '#64748B' }}>BATCH NUMBER</div>
                <div style={{ fontSize: '14px', fontWeight: 800, color: '#2563EB', fontFamily: 'monospace' }}>{selectedBatch.batchNumber}</div>
              </div>
              <div style={{ padding: '12px', background: '#F8FAFC', borderRadius: '10px' }}>
                <div style={{ fontSize: '11px', fontWeight: 700, color: '#64748B' }}>EXPIRY DATE</div>
                <div style={{ fontSize: '14px', fontWeight: 800, color: selectedBatch.risk === 'EXPIRED' ? '#DC2626' : '#0F172A' }}>
                  {selectedBatch.expiryDate ? new Date(selectedBatch.expiryDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : 'N/A'}
                </div>
              </div>
              <div style={{ padding: '12px', background: '#F8FAFC', borderRadius: '10px' }}>
                <div style={{ fontSize: '11px', fontWeight: 700, color: '#64748B' }}>AVAILABLE QUANTITY</div>
                <div style={{ fontSize: '14px', fontWeight: 800, color: '#0F172A' }}>{selectedBatch.availableQuantity} <span style={{ fontSize: '12px', color: '#64748B' }}>{selectedBatch.unit || 'Strip'}</span></div>
              </div>
              <div style={{ padding: '12px', background: '#F8FAFC', borderRadius: '10px' }}>
                <div style={{ fontSize: '11px', fontWeight: 700, color: '#64748B' }}>PURCHASE RATE</div>
                <div style={{ fontSize: '14px', fontWeight: 800, color: '#475569' }}>₹{(selectedBatch.purchaseRate || 0).toFixed(2)}</div>
              </div>
              <div style={{ padding: '12px', background: '#F8FAFC', borderRadius: '10px' }}>
                <div style={{ fontSize: '11px', fontWeight: 700, color: '#64748B' }}>TOTAL COST VALUE</div>
                <div style={{ fontSize: '14px', fontWeight: 800, color: '#0F172A' }}>₹{(selectedBatch.stockValue || 0).toFixed(2)}</div>
              </div>
              <div style={{ padding: '12px', background: '#F8FAFC', borderRadius: '10px' }}>
                <div style={{ fontSize: '11px', fontWeight: 700, color: '#64748B' }}>VENDOR / GRN</div>
                <div style={{ fontSize: '13px', fontWeight: 700, color: '#475569' }}>{selectedBatch.vendorName || 'N/A'} ({selectedBatch.grnId || 'Direct'})</div>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid #F1F5F9', paddingTop: '16px' }}>
              <button
                className="btn btn-secondary"
                onClick={() => setShowReviewModal(false)}
                style={{ padding: '8px 16px', borderRadius: '8px', border: '1px solid #CBD5E1', background: 'white', color: '#64748B', fontWeight: 700, cursor: 'pointer' }}
              >
                Close
              </button>

              {selectedBatch.availableQuantity > 0 && (
                <button
                  onClick={() => setShowWriteOffModal(true)}
                  style={{
                    padding: '8px 18px',
                    borderRadius: '8px',
                    background: '#DC2626',
                    color: 'white',
                    fontWeight: 800,
                    border: 'none',
                    cursor: 'pointer'
                  }}
                >
                  Mark for Write-Off
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Write-Off Confirmation Modal */}
      {showWriteOffModal && selectedBatch && (
        <div className="modal-overlay" onClick={() => setShowWriteOffModal(false)}>
          <div
            className="glass-card"
            style={{ padding: '28px', borderRadius: '20px', width: '500px', maxWidth: '90%', background: 'white', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 800, color: '#B91C1C' }}>Confirm Inventory Write-Off</h3>
            <p style={{ color: '#64748B', fontSize: '13px', margin: '6px 0 16px 0' }}>
              This will atomically deduct available batch quantity and update the aggregate medicine stock.
            </p>

            <form onSubmit={handleConfirmWriteOff}>
              <div style={{ marginBottom: '14px' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '6px' }}>
                  Write-Off Quantity (Max: {selectedBatch.availableQuantity})
                </label>
                <input
                  type="number"
                  min="1"
                  max={selectedBatch.availableQuantity}
                  value={writeOffQty}
                  onChange={(e) => setWriteOffQty(e.target.value)}
                  required
                  style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '13px', fontWeight: 700, color: '#0F172A', outline: 'none' }}
                />
              </div>

              <div style={{ marginBottom: '14px' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '6px' }}>
                  Reason / Notes
                </label>
                <input
                  type="text"
                  value={writeOffReason}
                  onChange={(e) => setWriteOffReason(e.target.value)}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '13px', fontWeight: 600, color: '#0F172A', outline: 'none' }}
                />
              </div>

              <div style={{ padding: '10px 12px', background: '#FEF2F2', borderRadius: '8px', marginBottom: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '12px', fontWeight: 700, color: '#B91C1C' }}>Extended Write-Off Value:</span>
                <span style={{ fontSize: '14px', fontWeight: 900, color: '#B91C1C' }}>
                  ₹{((parseInt(writeOffQty, 10) || 0) * (selectedBatch.purchaseRate || 0)).toFixed(2)}
                </span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setShowWriteOffModal(false)}
                  style={{ padding: '8px 16px', borderRadius: '8px', border: '1px solid #CBD5E1', background: 'white', color: '#64748B', fontWeight: 700, cursor: 'pointer' }}
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  disabled={isSubmittingWriteOff}
                  style={{
                    padding: '8px 20px',
                    borderRadius: '8px',
                    background: '#DC2626',
                    color: 'white',
                    fontWeight: 800,
                    border: 'none',
                    cursor: isSubmittingWriteOff ? 'not-allowed' : 'pointer'
                  }}
                >
                  {isSubmittingWriteOff ? 'Processing...' : 'Confirm Write-Off'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default ExpiryManagementPanel;
