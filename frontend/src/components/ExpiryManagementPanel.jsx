import React, { useState, useEffect, useMemo } from 'react';
import api from '../utils/api';
import { socket } from '../utils/socket';

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

    const handleDataChanged = (payload) => {
      if (!payload || ['inventory_expiry', 'medicines', 'goods_receipts'].includes(payload.type)) {
        fetchData();
      }
    };

    socket.on('data_changed', handleDataChanged);
    return () => {
      socket.off('data_changed', handleDataChanged);
    };
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
      <div style={{ marginBottom: '22px' }}>
        <h2 style={{ fontSize: '24px', fontWeight: 900, color: '#0F172A', margin: 0 }}>Expiry Management</h2>
        <p style={{ color: '#64748B', fontSize: '13px', margin: '4px 0 0 0', fontWeight: 500 }}>
          Monitor medicine batches approaching expiry, expired inventory and write-offs.
        </p>
      </div>

      {/* 5 KPI Financial & Risk Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px', marginBottom: '22px' }}>
        
        {/* Card 1: Expired Stock (Rose / Red Theme) */}
        <div 
          onClick={() => { setRiskFilter('EXPIRED'); setPage(1); }}
          style={{ 
            padding: '18px 20px', 
            borderRadius: '16px', 
            border: riskFilter === 'EXPIRED' ? '2px solid #EF4444' : '1px solid rgba(254, 205, 211, 0.9)', 
            boxShadow: riskFilter === 'EXPIRED' ? '0 16px 36px rgba(244, 63, 94, 0.18)' : '0 12px 28px rgba(244, 63, 94, 0.08)',
            background: 'radial-gradient(circle at 100% 100%, rgba(244, 63, 94, 0.25) 0%, transparent 65%), linear-gradient(135deg, #FFFFFF 0%, #FFF1F2 50%, #FFE4E6 100%)',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            position: 'relative',
            overflow: 'hidden',
            transition: 'all 0.2s ease',
            cursor: 'pointer'
          }}
          onMouseEnter={e => {
            e.currentTarget.style.transform = 'translateY(-2px)';
            e.currentTarget.style.boxShadow = '0 16px 36px rgba(244, 63, 94, 0.18)';
          }}
          onMouseLeave={e => {
            e.currentTarget.style.transform = 'none';
            e.currentTarget.style.boxShadow = riskFilter === 'EXPIRED' ? '0 16px 36px rgba(244, 63, 94, 0.18)' : '0 12px 28px rgba(244, 63, 94, 0.08)';
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{
              width: '32px',
              height: '32px',
              borderRadius: '10px',
              background: 'linear-gradient(135deg, #E11D48 0%, #F43F5E 100%)',
              color: '#FFFFFF',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              boxShadow: '0 4px 10px rgba(244, 63, 94, 0.25)'
            }}>
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" x2="9" y1="9" y2="15"/><line x1="9" x2="15" y1="9" y2="15"/></svg>
            </div>
            <span style={{ fontSize: '10.5px', fontWeight: 800, color: '#9F1239', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              EXPIRED STOCK
            </span>
          </div>

          <div style={{ marginTop: '14px', display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontSize: '30px', fontWeight: 900, color: '#DC2626', fontFamily: "'Outfit', sans-serif", letterSpacing: '-0.02em', lineHeight: 1 }}>
                {summary.expiredUnits || 0} <span style={{ fontSize: '13px', fontWeight: 700, color: '#94A3B8' }}>units</span>
              </div>
              <div style={{ fontSize: '12px', color: '#DC2626', fontWeight: 700, marginTop: '6px', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: '5px' }}>
                <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#EF4444', display: 'inline-block' }}></span> Blocked from sale / dispensing
              </div>
            </div>

            {/* Rose Mini Sparkline */}
            <div style={{ width: '64px', height: '32px', position: 'relative', flexShrink: 0 }}>
              <svg style={{ width: '100%', height: '100%', overflow: 'visible' }} viewBox="0 0 64 32">
                <defs>
                  <linearGradient id="expKpiRed" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#F43F5E" stopOpacity="0.45"/>
                    <stop offset="100%" stopColor="#F43F5E" stopOpacity="0.05"/>
                  </linearGradient>
                </defs>
                <path d="M 0 28 Q 16 28, 26 22 T 42 24 T 54 12 T 64 18 L 64 32 L 0 32 Z" fill="url(#expKpiRed)" />
                <path d="M 0 28 Q 16 28, 26 22 T 42 24 T 54 12 T 64 18" fill="none" stroke="#F43F5E" strokeWidth="2.4" strokeLinecap="round" />
              </svg>
            </div>
          </div>

          <div style={{
            position: 'absolute',
            bottom: 0,
            right: 0,
            height: '4px',
            width: '60%',
            borderBottomRightRadius: '16px',
            background: 'linear-gradient(90deg, transparent 0%, #F43F5E 100%)',
            pointerEvents: 'none'
          }} />
        </div>

        {/* Card 2: Critical (Orange / Amber Theme) */}
        <div 
          onClick={() => { setRiskFilter('CRITICAL'); setPage(1); }}
          style={{ 
            padding: '18px 20px', 
            borderRadius: '16px', 
            border: riskFilter === 'CRITICAL' ? '2px solid #EA580C' : '1px solid rgba(254, 215, 170, 0.9)', 
            boxShadow: riskFilter === 'CRITICAL' ? '0 16px 36px rgba(234, 88, 12, 0.18)' : '0 12px 28px rgba(234, 88, 12, 0.08)',
            background: 'radial-gradient(circle at 0% 100%, rgba(249, 115, 22, 0.25) 0%, transparent 65%), linear-gradient(135deg, #FFFFFF 0%, #FFF7ED 50%, #FFEDD5 100%)',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            position: 'relative',
            overflow: 'hidden',
            transition: 'all 0.2s ease',
            cursor: 'pointer'
          }}
          onMouseEnter={e => {
            e.currentTarget.style.transform = 'translateY(-2px)';
            e.currentTarget.style.boxShadow = '0 16px 36px rgba(234, 88, 12, 0.18)';
          }}
          onMouseLeave={e => {
            e.currentTarget.style.transform = 'none';
            e.currentTarget.style.boxShadow = riskFilter === 'CRITICAL' ? '0 16px 36px rgba(234, 88, 12, 0.18)' : '0 12px 28px rgba(234, 88, 12, 0.08)';
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{
              width: '32px',
              height: '32px',
              borderRadius: '10px',
              background: 'linear-gradient(135deg, #C2410C 0%, #EA580C 100%)',
              color: '#FFFFFF',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              boxShadow: '0 4px 10px rgba(234, 88, 12, 0.25)'
            }}>
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
            </div>
            <span style={{ fontSize: '10.5px', fontWeight: 800, color: '#9A3412', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              CRITICAL — ≤30 DAYS
            </span>
          </div>

          <div style={{ marginTop: '14px', display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontSize: '30px', fontWeight: 900, color: '#C2410C', fontFamily: "'Outfit', sans-serif", letterSpacing: '-0.02em', lineHeight: 1 }}>
                {summary.criticalUnits || 0} <span style={{ fontSize: '13px', fontWeight: 700, color: '#94A3B8' }}>units</span>
              </div>
              <div style={{ fontSize: '12px', color: '#EA580C', fontWeight: 700, marginTop: '6px', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: '5px' }}>
                <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#F97316', display: 'inline-block' }}></span> Immediate FEFO dispatch needed
              </div>
            </div>

            {/* Orange Mini Sparkline */}
            <div style={{ width: '64px', height: '32px', position: 'relative', flexShrink: 0 }}>
              <svg style={{ width: '100%', height: '100%', overflow: 'visible' }} viewBox="0 0 64 32">
                <defs>
                  <linearGradient id="expKpiOrange" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#EA580C" stopOpacity="0.45"/>
                    <stop offset="100%" stopColor="#EA580C" stopOpacity="0.05"/>
                  </linearGradient>
                </defs>
                <path d="M 0 26 Q 16 26, 26 24 T 42 16 T 54 8 T 64 12 L 64 32 L 0 32 Z" fill="url(#expKpiOrange)" />
                <path d="M 0 26 Q 16 26, 26 24 T 42 16 T 54 8 T 64 12" fill="none" stroke="#EA580C" strokeWidth="2.4" strokeLinecap="round" />
              </svg>
            </div>
          </div>

          <div style={{
            position: 'absolute',
            bottom: 0,
            right: 0,
            height: '4px',
            width: '60%',
            borderBottomRightRadius: '16px',
            background: 'linear-gradient(90deg, transparent 0%, #EA580C 100%)',
            pointerEvents: 'none'
          }} />
        </div>

        {/* Card 3: Warning (Warm Amber / Gold Theme) */}
        <div 
          onClick={() => { setRiskFilter('WARNING'); setPage(1); }}
          style={{ 
            padding: '18px 20px', 
            borderRadius: '16px', 
            border: riskFilter === 'WARNING' ? '2px solid #F59E0B' : '1px solid rgba(254, 215, 170, 0.9)', 
            boxShadow: riskFilter === 'WARNING' ? '0 16px 36px rgba(245, 158, 11, 0.18)' : '0 12px 28px rgba(245, 158, 11, 0.08)',
            background: 'radial-gradient(circle at 100% 0%, rgba(245, 158, 11, 0.25) 0%, transparent 65%), linear-gradient(135deg, #FFFFFF 0%, #FFFBEB 50%, #FEF3C7 100%)',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            position: 'relative',
            overflow: 'hidden',
            transition: 'all 0.2s ease',
            cursor: 'pointer'
          }}
          onMouseEnter={e => {
            e.currentTarget.style.transform = 'translateY(-2px)';
            e.currentTarget.style.boxShadow = '0 16px 36px rgba(245, 158, 11, 0.18)';
          }}
          onMouseLeave={e => {
            e.currentTarget.style.transform = 'none';
            e.currentTarget.style.boxShadow = riskFilter === 'WARNING' ? '0 16px 36px rgba(245, 158, 11, 0.18)' : '0 12px 28px rgba(245, 158, 11, 0.08)';
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{
              width: '32px',
              height: '32px',
              borderRadius: '10px',
              background: 'linear-gradient(135deg, #D97706 0%, #F59E0B 100%)',
              color: '#FFFFFF',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              boxShadow: '0 4px 10px rgba(245, 158, 11, 0.25)'
            }}>
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M5 22h14"/><path d="M5 2h14"/><path d="M17 22v-4.172a2 2 0 0 0-.586-1.414L12 12l-4.414 4.414A2 2 0 0 0 7 17.828V22"/><path d="M7 2v4.172a2 2 0 0 0 .586 1.414L12 12l4.414-4.414A2 2 0 0 0 17 6.172V2"/></svg>
            </div>
            <span style={{ fontSize: '10.5px', fontWeight: 800, color: '#92400E', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              WARNING — 31-90 DAYS
            </span>
          </div>

          <div style={{ marginTop: '14px', display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontSize: '30px', fontWeight: 900, color: '#D97706', fontFamily: "'Outfit', sans-serif", letterSpacing: '-0.02em', lineHeight: 1 }}>
                {summary.warningUnits || 0} <span style={{ fontSize: '13px', fontWeight: 700, color: '#94A3B8' }}>units</span>
              </div>
              <div style={{ fontSize: '12px', color: '#D97706', fontWeight: 700, marginTop: '6px', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: '5px' }}>
                <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#F59E0B', display: 'inline-block' }}></span> Monitor dispensing rate
              </div>
            </div>

            {/* Amber Mini Sparkline */}
            <div style={{ width: '64px', height: '32px', position: 'relative', flexShrink: 0 }}>
              <svg style={{ width: '100%', height: '100%', overflow: 'visible' }} viewBox="0 0 64 32">
                <defs>
                  <linearGradient id="expKpiAmber" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#F59E0B" stopOpacity="0.45"/>
                    <stop offset="100%" stopColor="#F59E0B" stopOpacity="0.05"/>
                  </linearGradient>
                </defs>
                <path d="M 0 28 Q 12 28, 20 26 T 38 18 T 50 14 T 64 22 L 64 32 L 0 32 Z" fill="url(#expKpiAmber)" />
                <path d="M 0 28 Q 12 28, 20 26 T 38 18 T 50 14 T 64 22" fill="none" stroke="#F59E0B" strokeWidth="2.4" strokeLinecap="round" />
              </svg>
            </div>
          </div>

          <div style={{
            position: 'absolute',
            bottom: 0,
            right: 0,
            height: '4px',
            width: '60%',
            borderBottomRightRadius: '16px',
            background: 'linear-gradient(90deg, transparent 0%, #F59E0B 100%)',
            pointerEvents: 'none'
          }} />
        </div>

        {/* Card 4: At-Risk Value (Electric Blue Theme) */}
        <div 
          style={{ 
            padding: '18px 20px', 
            borderRadius: '16px', 
            border: '1px solid rgba(191, 219, 254, 0.9)', 
            boxShadow: '0 12px 28px rgba(37, 99, 235, 0.08)',
            background: 'radial-gradient(circle at 100% 100%, rgba(59, 130, 246, 0.25) 0%, transparent 65%), linear-gradient(135deg, #FFFFFF 0%, #EFF6FF 50%, #DBEAFE 100%)',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            position: 'relative',
            overflow: 'hidden',
            transition: 'all 0.2s ease'
          }}
          onMouseEnter={e => {
            e.currentTarget.style.transform = 'translateY(-2px)';
            e.currentTarget.style.boxShadow = '0 16px 36px rgba(37, 99, 235, 0.16)';
          }}
          onMouseLeave={e => {
            e.currentTarget.style.transform = 'none';
            e.currentTarget.style.boxShadow = '0 12px 28px rgba(37, 99, 235, 0.08)';
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{
              width: '32px',
              height: '32px',
              borderRadius: '10px',
              background: 'linear-gradient(135deg, #1D4ED8 0%, #3B82F6 100%)',
              color: '#FFFFFF',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              boxShadow: '0 4px 10px rgba(37, 99, 235, 0.25)'
            }}>
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
            </div>
            <span style={{ fontSize: '10.5px', fontWeight: 800, color: '#1E3A8A', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              AT-RISK VALUE (COST)
            </span>
          </div>

          <div style={{ marginTop: '14px', display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontSize: '30px', fontWeight: 900, color: '#0F172A', fontFamily: "'Outfit', sans-serif", letterSpacing: '-0.02em', lineHeight: 1 }}>
                ₹{(summary.atRiskValue || 0).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
              </div>
              <div style={{ fontSize: '12px', color: '#2563EB', fontWeight: 700, marginTop: '6px', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: '5px' }}>
                <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#2563EB', display: 'inline-block' }}></span> Based on purchase rate, not MRP
              </div>
            </div>

            {/* Blue Mini Sparkline */}
            <div style={{ width: '64px', height: '32px', position: 'relative', flexShrink: 0 }}>
              <svg style={{ width: '100%', height: '100%', overflow: 'visible' }} viewBox="0 0 64 32">
                <defs>
                  <linearGradient id="expKpiBlue" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#2563EB" stopOpacity="0.45"/>
                    <stop offset="100%" stopColor="#2563EB" stopOpacity="0.05"/>
                  </linearGradient>
                </defs>
                <path d="M 0 24 Q 16 26, 24 16 T 40 18 T 52 8 T 64 12 L 64 32 L 0 32 Z" fill="url(#expKpiBlue)" />
                <path d="M 0 24 Q 16 26, 24 16 T 40 18 T 52 8 T 64 12" fill="none" stroke="#2563EB" strokeWidth="2.4" strokeLinecap="round" />
              </svg>
            </div>
          </div>

          <div style={{
            position: 'absolute',
            bottom: 0,
            right: 0,
            height: '4px',
            width: '60%',
            borderBottomRightRadius: '16px',
            background: 'linear-gradient(90deg, transparent 0%, #2563EB 100%)',
            pointerEvents: 'none'
          }} />
        </div>

        {/* Card 5: Affected Batches (Purple / Violet Theme) */}
        <div 
          onClick={() => { setRiskFilter('ALL_RISKS'); setPage(1); }}
          style={{ 
            padding: '18px 20px', 
            borderRadius: '16px', 
            border: riskFilter === 'ALL_RISKS' ? '2px solid #8B5CF6' : '1px solid rgba(221, 214, 254, 0.9)', 
            boxShadow: riskFilter === 'ALL_RISKS' ? '0 16px 36px rgba(139, 92, 246, 0.18)' : '0 12px 28px rgba(139, 92, 246, 0.08)',
            background: 'radial-gradient(circle at 0% 0%, rgba(139, 92, 246, 0.25) 0%, transparent 65%), linear-gradient(135deg, #FFFFFF 0%, #F5F3FF 50%, #EDE9FE 100%)',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            position: 'relative',
            overflow: 'hidden',
            transition: 'all 0.2s ease',
            cursor: 'pointer'
          }}
          onMouseEnter={e => {
            e.currentTarget.style.transform = 'translateY(-2px)';
            e.currentTarget.style.boxShadow = '0 16px 36px rgba(139, 92, 246, 0.18)';
          }}
          onMouseLeave={e => {
            e.currentTarget.style.transform = 'none';
            e.currentTarget.style.boxShadow = riskFilter === 'ALL_RISKS' ? '0 16px 36px rgba(139, 92, 246, 0.18)' : '0 12px 28px rgba(139, 92, 246, 0.08)';
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{
              width: '32px',
              height: '32px',
              borderRadius: '10px',
              background: 'linear-gradient(135deg, #6D28D9 0%, #8B5CF6 100%)',
              color: '#FFFFFF',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              boxShadow: '0 4px 10px rgba(139, 92, 246, 0.25)'
            }}>
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="m7.5 4.27 9 5.15"/><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/></svg>
            </div>
            <span style={{ fontSize: '10.5px', fontWeight: 800, color: '#4C1D95', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              AFFECTED BATCHES
            </span>
          </div>

          <div style={{ marginTop: '14px', display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontSize: '30px', fontWeight: 900, color: '#4C1D95', fontFamily: "'Outfit', sans-serif", letterSpacing: '-0.02em', lineHeight: 1 }}>
                {summary.affectedBatchesCount || 0} <span style={{ fontSize: '13px', fontWeight: 700, color: '#94A3B8' }}>batches</span>
              </div>
              <div style={{ fontSize: '12px', color: '#7C3AED', fontWeight: 700, marginTop: '6px', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: '5px' }}>
                <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#7C3AED', display: 'inline-block' }}></span> Non-depleted at-risk records
              </div>
            </div>

            {/* Purple Mini Sparkline */}
            <div style={{ width: '64px', height: '32px', position: 'relative', flexShrink: 0 }}>
              <svg style={{ width: '100%', height: '100%', overflow: 'visible' }} viewBox="0 0 64 32">
                <defs>
                  <linearGradient id="expKpiPurple" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#8B5CF6" stopOpacity="0.45"/>
                    <stop offset="100%" stopColor="#8B5CF6" stopOpacity="0.05"/>
                  </linearGradient>
                </defs>
                <path d="M 0 26 Q 16 26, 26 24 T 42 16 T 54 8 T 64 12 L 64 32 L 0 32 Z" fill="url(#expKpiPurple)" />
                <path d="M 0 26 Q 16 26, 26 24 T 42 16 T 54 8 T 64 12" fill="none" stroke="#8B5CF6" strokeWidth="2.4" strokeLinecap="round" />
              </svg>
            </div>
          </div>

          <div style={{
            position: 'absolute',
            bottom: 0,
            right: 0,
            height: '4px',
            width: '60%',
            borderBottomRightRadius: '16px',
            background: 'linear-gradient(90deg, transparent 0%, #8B5CF6 100%)',
            pointerEvents: 'none'
          }} />
        </div>

      </div>

      {/* Filter Toolbar */}
      <div className="glass-card" style={{ padding: '16px 20px', borderRadius: '16px', marginBottom: '20px', border: '1px solid #E2E8F0', background: 'white' }}>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
          
          {/* Search */}
          <div style={{ position: 'relative', flex: '1 1 260px', minWidth: '220px' }}>
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#64748B" strokeWidth="2.5" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }}><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
            <input
              type="text"
              placeholder="Search Medicine, SKU, Batch Number..."
              value={searchQuery}
              onChange={(e) => { setSearchQuery(e.target.value); setPage(1); }}
              style={{ width: '100%', padding: '8px 14px 8px 36px', borderRadius: '10px', border: '1px solid #E2E8F0', fontSize: '13px', fontWeight: 600, color: '#1E293B', outline: 'none' }}
            />
            {searchQuery && (
              <button onClick={() => { setSearchQuery(''); setPage(1); }} style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#94A3B8', fontSize: '13px', fontWeight: 'bold' }}>✕</button>
            )}
          </div>

          {/* Risk Filter */}
          <div style={{ width: '200px' }}>
            <select
              value={riskFilter}
              onChange={(e) => { setRiskFilter(e.target.value); setPage(1); }}
              style={{ width: '100%', padding: '8px 14px', fontSize: '13px', borderRadius: '10px', border: '1px solid #E2E8F0', background: '#FFFFFF', color: '#334155', fontWeight: 600, outline: 'none', cursor: 'pointer' }}
            >
              <option value="ALL_RISKS">All At-Risk (🔴 🟠 🟡)</option>
              <option value="EXPIRED">🔴 Expired</option>
              <option value="CRITICAL">🟠 Critical (≤30 days)</option>
              <option value="WARNING">🟡 Warning (31-90 days)</option>
              <option value="SAFE">🟢 Safe (&gt;90 days)</option>
              <option value="ALL">All Batches</option>
            </select>
          </div>

          {/* Category Filter */}
          <div style={{ width: '180px' }}>
            <select
              value={categoryFilter}
              onChange={(e) => { setCategoryFilter(e.target.value); setPage(1); }}
              style={{ width: '100%', padding: '8px 14px', fontSize: '13px', borderRadius: '10px', border: '1px solid #E2E8F0', background: '#FFFFFF', color: '#334155', fontWeight: 600, outline: 'none', cursor: 'pointer' }}
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
            style={{ padding: '8px 16px', fontSize: '12.5px', borderRadius: '10px', background: '#FFFFFF', border: '1px solid #BFDBFE', color: '#2563EB', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', marginLeft: 'auto' }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/></svg>
            REFRESH
          </button>
        </div>
      </div>

      {/* Expiry Risk Table */}
      <div className="glass-card" style={{ borderRadius: '16px', overflow: 'hidden', border: '1px solid #E2E8F0', background: 'white' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead>
              <tr style={{ background: '#F8FAFC', borderBottom: '1px solid #E2E8F0' }}>
                <th style={{ padding: '14px 18px', fontSize: '11px', fontWeight: 800, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.05em' }}>MEDICINE</th>
                <th style={{ padding: '14px 18px', fontSize: '11px', fontWeight: 800, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.05em' }}>SKU</th>
                <th style={{ padding: '14px 18px', fontSize: '11px', fontWeight: 800, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.05em' }}>BATCH</th>
                <th style={{ padding: '14px 18px', fontSize: '11px', fontWeight: 800, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.05em' }}>EXPIRY DATE</th>
                <th style={{ padding: '14px 18px', fontSize: '11px', fontWeight: 800, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.05em' }}>DAYS REMAINING</th>
                <th style={{ padding: '14px 18px', fontSize: '11px', fontWeight: 800, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'center' }}>AVAIL QTY</th>
                <th style={{ padding: '14px 18px', fontSize: '11px', fontWeight: 800, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.05em' }}>UNIT</th>
                <th style={{ padding: '14px 18px', fontSize: '11px', fontWeight: 800, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'right' }}>PURCHASE RATE</th>
                <th style={{ padding: '14px 18px', fontSize: '11px', fontWeight: 800, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'right' }}>STOCK VALUE</th>
                <th style={{ padding: '14px 18px', fontSize: '11px', fontWeight: 800, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'center' }}>RISK</th>
                <th style={{ padding: '14px 18px', fontSize: '11px', fontWeight: 800, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'center' }}>ACTION</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan="11" style={{ textAlign: 'center', padding: '48px 20px', color: '#64748B' }}>
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontSize: '14px', fontWeight: 600 }}>Loading expiry batches...</span>
                    </div>
                  </td>
                </tr>
              ) : pagedBatches.length === 0 ? (
                <tr>
                  <td colSpan="11" style={{ textAlign: 'center', padding: '48px 20px', color: '#64748B' }}>
                    <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontSize: '32px' }}>✅</span>
                      <span style={{ fontWeight: 800, fontSize: '15px', color: '#0F172A' }}>No batches matching the current filters.</span>
                      <span style={{ fontSize: '12.5px', color: '#64748B' }}>All inventory is safe or try adjusting your search filters.</span>
                    </div>
                  </td>
                </tr>
              ) : (
                pagedBatches.map(b => {
                  const dateStr = b.expiryDate ? new Date(b.expiryDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : 'N/A';

                  let badgeBg = '#ECFDF5';
                  let badgeColor = '#047857';
                  let badgeBorder = '#A7F3D0';
                  let badgeLabel = 'SAFE';
                  let rowBg = 'transparent';
                  let borderLeftAccent = '4px solid transparent';

                  if (b.risk === 'EXPIRED') {
                    badgeBg = '#FEF2F2';
                    badgeColor = '#DC2626';
                    badgeBorder = '#FECACA';
                    badgeLabel = 'EXPIRED';
                    rowBg = 'linear-gradient(90deg, rgba(254, 226, 226, 0.48) 0%, rgba(255, 241, 242, 0.3) 55%, rgba(255, 255, 255, 0) 100%)';
                    borderLeftAccent = '4px solid #DC2626';
                  } else if (b.risk === 'CRITICAL') {
                    badgeBg = '#FFF7ED';
                    badgeColor = '#C2410C';
                    badgeBorder = '#FFEDD5';
                    badgeLabel = 'CRITICAL';
                    rowBg = 'linear-gradient(90deg, rgba(255, 237, 213, 0.48) 0%, rgba(255, 247, 237, 0.3) 55%, rgba(255, 255, 255, 0) 100%)';
                    borderLeftAccent = '4px solid #EA580C';
                  } else if (b.risk === 'WARNING') {
                    badgeBg = '#FEF9C3';
                    badgeColor = '#854D0E';
                    badgeBorder = '#FEF08A';
                    badgeLabel = 'WARNING';
                    rowBg = 'linear-gradient(90deg, rgba(254, 249, 195, 0.48) 0%, rgba(254, 252, 232, 0.3) 55%, rgba(255, 255, 255, 0) 100%)';
                    borderLeftAccent = '4px solid #EAB308';
                  } else if (b.risk === 'DEPLETED') {
                    badgeBg = '#F1F5F9';
                    badgeColor = '#64748B';
                    badgeBorder = '#E2E8F0';
                    badgeLabel = 'DEPLETED';
                  }

                  const hoverBg = b.risk === 'EXPIRED'
                    ? 'linear-gradient(90deg, rgba(254, 226, 226, 0.65) 0%, rgba(255, 241, 242, 0.5) 55%, rgba(255, 255, 255, 0.3) 100%)'
                    : b.risk === 'CRITICAL'
                      ? 'linear-gradient(90deg, rgba(255, 237, 213, 0.65) 0%, rgba(255, 247, 237, 0.5) 55%, rgba(255, 255, 255, 0.3) 100%)'
                      : b.risk === 'WARNING'
                        ? 'linear-gradient(90deg, rgba(254, 249, 195, 0.65) 0%, rgba(254, 252, 232, 0.5) 55%, rgba(255, 255, 255, 0.3) 100%)'
                        : '#F8FAFC';

                  return (
                    <tr 
                      key={b._id} 
                      style={{ 
                        background: rowBg, 
                        borderLeft: borderLeftAccent,
                        borderBottom: '1px solid #F1F5F9',
                        transition: 'background 0.15s ease'
                      }}
                      onMouseEnter={e => e.currentTarget.style.background = hoverBg}
                      onMouseLeave={e => e.currentTarget.style.background = rowBg}
                    >
                      {/* Medicine */}
                      <td style={{ padding: '14px 18px', fontWeight: 800, color: '#0F172A', fontSize: '13.5px' }}>
                        {b.name}
                      </td>

                      {/* SKU */}
                      <td style={{ padding: '14px 18px' }}>
                        <span style={{
                          display: 'inline-block',
                          padding: '3px 8px',
                          borderRadius: '6px',
                          fontSize: '12px',
                          fontWeight: 700,
                          fontFamily: 'monospace',
                          background: '#EFF6FF',
                          color: '#2563EB',
                          border: '1px solid #DBEAFE'
                        }}>
                          {b.sku}
                        </span>
                      </td>

                      {/* Batch */}
                      <td style={{ padding: '14px 18px' }}>
                        <span style={{
                          display: 'inline-block',
                          padding: '3px 8px',
                          borderRadius: '6px',
                          fontSize: '12px',
                          fontWeight: 700,
                          fontFamily: 'monospace',
                          background: '#F1F5F9',
                          color: '#475569',
                          border: '1px solid #E2E8F0'
                        }}>
                          {b.batchNumber}
                        </span>
                      </td>

                      {/* Expiry Date */}
                      <td style={{ padding: '14px 18px', fontWeight: 600, color: '#334155', fontSize: '13px' }}>
                        {dateStr}
                      </td>

                      {/* Days Remaining */}
                      <td style={{ padding: '14px 18px' }}>
                        <span style={{
                          fontSize: '12.5px',
                          fontWeight: 750,
                          color: b.risk === 'EXPIRED' ? '#DC2626' : b.risk === 'CRITICAL' ? '#C2410C' : b.risk === 'WARNING' ? '#B45309' : '#059669'
                        }}>
                          {b.risk === 'EXPIRED' ? 'EXPIRED' : b.daysRemaining === null ? '-' : `${b.daysRemaining} days`}
                        </span>
                      </td>

                      {/* Avail Qty */}
                      <td style={{ padding: '14px 18px', textAlign: 'center' }}>
                        <span style={{ fontSize: '15px', fontWeight: 900, fontFamily: "'Outfit', sans-serif", color: b.availableQuantity > 0 ? '#0F172A' : '#94A3B8' }}>
                          {b.availableQuantity}
                        </span>
                      </td>

                      {/* Unit */}
                      <td style={{ padding: '14px 18px', fontWeight: 600, color: '#64748B', fontSize: '13px' }}>
                        {b.unit || 'Strip'}
                      </td>

                      {/* Purchase Rate */}
                      <td style={{ padding: '14px 18px', textAlign: 'right', fontWeight: 700, color: '#475569', fontSize: '13px' }}>
                        ₹{(b.purchaseRate || 0).toFixed(2)}
                      </td>

                      {/* Stock Value */}
                      <td style={{ padding: '14px 18px', textAlign: 'right', fontWeight: 850, color: '#0F172A', fontSize: '13.5px' }}>
                        ₹{(b.stockValue || 0).toFixed(2)}
                      </td>

                      {/* Risk Badge */}
                      <td style={{ padding: '14px 18px', textAlign: 'center' }}>
                        <span style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '5px',
                          padding: '4px 10px',
                          borderRadius: '6px',
                          fontSize: '11px',
                          fontWeight: 800,
                          textTransform: 'uppercase',
                          letterSpacing: '0.4px',
                          background: badgeBg,
                          color: badgeColor,
                          border: `1px solid ${badgeBorder}`
                        }}>
                          <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'currentColor' }} />
                          {badgeLabel}
                        </span>
                      </td>

                      {/* Action */}
                      <td style={{ padding: '14px 18px', textAlign: 'center' }}>
                        <button
                          onClick={() => handleOpenReview(b)}
                          style={{
                            padding: '5px 12px',
                            fontSize: '12px',
                            borderRadius: '6px',
                            border: b.risk === 'EXPIRED' ? '1px solid #FEE2E2' : '1px solid #DBEAFE',
                            background: b.risk === 'EXPIRED' ? '#FEF2F2' : '#EFF6FF',
                            color: b.risk === 'EXPIRED' ? '#DC2626' : '#2563EB',
                            fontWeight: 750,
                            cursor: 'pointer',
                            transition: 'all 0.15s ease'
                          }}
                          onMouseEnter={e => {
                            e.currentTarget.style.background = b.risk === 'EXPIRED' ? '#DC2626' : '#2563EB';
                            e.currentTarget.style.color = '#FFFFFF';
                          }}
                          onMouseLeave={e => {
                            e.currentTarget.style.background = b.risk === 'EXPIRED' ? '#FEF2F2' : '#EFF6FF';
                            e.currentTarget.style.color = b.risk === 'EXPIRED' ? '#DC2626' : '#2563EB';
                          }}
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
      </div>

      {/* Pagination Footer Matching Sales and Inventory */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '16px', padding: '0 4px', flexWrap: 'wrap', gap: '10px' }}>
        <div style={{ fontSize: '13px', color: '#64748B', fontWeight: 600 }}>
          Showing <span style={{ color: '#0F172A', fontWeight: 800 }}>{filteredBatches.length === 0 ? 0 : (page - 1) * pageSize + 1}</span> to <span style={{ color: '#0F172A', fontWeight: 800 }}>{Math.min(page * pageSize, filteredBatches.length)}</span> of <span style={{ color: '#0F172A', fontWeight: 800 }}>{filteredBatches.length}</span> batches
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => setPage(p => Math.max(1, p - 1))}
            style={{
              padding: '6px 14px',
              borderRadius: '8px',
              border: '1px solid #E2E8F0',
              background: page <= 1 ? '#F8FAFC' : 'white',
              color: page <= 1 ? '#94A3B8' : '#334155',
              fontSize: '12.5px',
              fontWeight: 700,
              cursor: page <= 1 ? 'not-allowed' : 'pointer',
              transition: 'all 0.15s'
            }}
          >
            Previous
          </button>
          <span style={{ fontSize: '13px', fontWeight: 700, color: '#334155', padding: '6px 12px', background: 'white', borderRadius: '8px', border: '1px solid #E2E8F0' }}>
            Page {page} of {totalPages}
          </span>
          <button
            type="button"
            disabled={page >= totalPages}
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            style={{
              padding: '6px 14px',
              borderRadius: '8px',
              border: '1px solid #E2E8F0',
              background: page >= totalPages ? '#F8FAFC' : 'white',
              color: page >= totalPages ? '#94A3B8' : '#334155',
              fontSize: '12.5px',
              fontWeight: 700,
              cursor: page >= totalPages ? 'not-allowed' : 'pointer',
              transition: 'all 0.15s'
            }}
          >
            Next
          </button>
        </div>
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
