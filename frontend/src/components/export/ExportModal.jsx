import React, { useState, useEffect, useMemo } from 'react';
import { FileSpreadsheet, FileText, Calendar, Download, X, AlertCircle, CheckCircle2, Loader2, Check } from 'lucide-react';
import { executeExport, filterDataByDate, fetchLetterheadConfig } from '../../utils/exportEngine';

/**
 * Reusable Unified Export Modal.
 *
 * @param {Object} props
 * @param {string} props.dataset - Automatic dataset name (e.g. 'Patients', 'Purchase Orders')
 * @param {Array} props.data - Full, UNPAGINATED dataset
 * @param {Array} props.columns - Column configuration [{ key, header, formatter }]
 * @param {string|Array|Function} props.dateField - Authoritative date field
 * @param {Object} [props.currentFilters] - Caller's active filter state
 * @param {Function} props.onClose - Dismiss callback
 * @param {string} [props.clinicName] - Clinic / tenant display name
 * @param {Function} [props.onSuccess] - Optional success callback
 */
export default function ExportModal({
  dataset = 'Data',
  data = [],
  columns = [],
  dateField = 'createdAt',
  currentFilters = {},
  onClose,
  clinicName,
  onSuccess,
  modes,
  initialMode,
  initialRangeType
}) {
  const [selectedModeId, setSelectedModeId] = useState(initialMode || (modes?.[0]?.id));
  const currentMode = useMemo(() => modes?.find(m => m.id === selectedModeId), [modes, selectedModeId]);

  const effectiveData = currentMode ? currentMode.data : data;
  const effectiveColumns = currentMode ? currentMode.columns : columns;
  const currentDatasetName = currentMode ? (currentMode.dataset || dataset) : dataset;
  const effectiveDateField = currentMode ? (currentMode.dateField !== undefined ? currentMode.dateField : dateField) : dateField;

  // Active clinic letterhead configuration
  const [letterheadConfig, setLetterheadConfig] = useState(null);

  useEffect(() => {
    let isMounted = true;
    fetchLetterheadConfig().then(cfg => {
      if (isMounted) setLetterheadConfig(cfg);
    });
    return () => { isMounted = false; };
  }, []);

  // Agreed Date Range options: [ All Time ] [ Today ] [ This Week ] [ This Month ] [ Custom Range ]
  const [rangeType, setRangeType] = useState(() => {
    if (initialRangeType) return initialRangeType;
    if (['Pharmacy Sales', 'Vendors'].includes(dataset)) return 'All Time';
    return 'Today';
  });
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    return d.toISOString().split('T')[0];
  });
  const [endDate, setEndDate] = useState(() => {
    const d = new Date();
    return d.toISOString().split('T')[0];
  });

  // Format: 'excel', 'csv', or 'pdf' (Default: 'excel')
  const [format, setFormat] = useState('excel');
  const [isExporting, setIsExporting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const isSnapshotDataset = ['Inventory', 'Batch Inventory'].includes(currentDatasetName) || !effectiveDateField;

  // Active Date Range specification
  const activeDateRange = useMemo(() => ({
    type: isSnapshotDataset ? 'Current Snapshot' : rangeType,
    startDate: (!isSnapshotDataset && rangeType === 'Custom Range') ? startDate : undefined,
    endDate: (!isSnapshotDataset && rangeType === 'Custom Range') ? endDate : undefined,
    generatedAt: isSnapshotDataset ? new Date().toISOString() : undefined
  }), [isSnapshotDataset, rangeType, startDate, endDate]);

  // Reactive Record Preview based on date bounds
  const matchingRecords = useMemo(() => {
    try {
      return filterDataByDate(effectiveData, isSnapshotDataset ? null : effectiveDateField, activeDateRange);
    } catch {
      return [];
    }
  }, [effectiveData, isSnapshotDataset, effectiveDateField, activeDateRange]);

  const recordCount = matchingRecords.length;

  // Detailed stock breakdown when dataset is Inventory
  const inventoryStockCounts = useMemo(() => {
    if (currentDatasetName !== 'Inventory') return null;
    let inStock = 0;
    let lowStock = 0;
    let outOfStock = 0;

    matchingRecords.forEach(r => {
      const stock = Number(r.sellableStock !== undefined ? r.sellableStock : r.stock) || 0;
      const status = r.status || (stock > 20 ? 'In Stock' : stock > 0 ? 'Low Stock' : 'Out of Stock');
      if (status === 'Out of Stock' || stock === 0) {
        outOfStock++;
      } else if (status === 'Low Stock' || stock <= 20) {
        lowStock++;
      } else {
        inStock++;
      }
    });

    return { total: matchingRecords.length, inStock, lowStock, outOfStock };
  }, [currentDatasetName, matchingRecords]);

  // Detailed breakdown when dataset is Batch Inventory
  const batchInventoryCounts = useMemo(() => {
    if (currentDatasetName !== 'Batch Inventory') return null;
    let totalQty = 0;
    let criticalBatches = 0;
    let safeBatches = 0;

    matchingRecords.forEach(b => {
      totalQty += Number(b.availableQuantity ?? b.stock ?? 0);
      if (['CRITICAL', 'EXPIRED'].includes(b.risk)) {
        criticalBatches++;
      } else {
        safeBatches++;
      }
    });

    return { totalBatches: matchingRecords.length, totalQty, criticalBatches, safeBatches };
  }, [currentDatasetName, matchingRecords]);

  // Detailed breakdown when dataset is Expiry Management
  const expiryCounts = useMemo(() => {
    if (currentDatasetName !== 'Expiry Management') return null;
    let expired = 0;
    let critical = 0;
    let warning = 0;
    let safe = 0;
    let atRiskValue = 0;

    matchingRecords.forEach(b => {
      const risk = b.risk || (b.isExpired ? 'EXPIRED' : 'SAFE');
      const qty = Number(b.availableQuantity || 0);
      const rate = Number(b.purchaseRate || 0);
      if (risk === 'EXPIRED') expired++;
      else if (risk === 'CRITICAL') critical++;
      else if (risk === 'WARNING') warning++;
      else safe++;

      if (['EXPIRED', 'CRITICAL', 'WARNING'].includes(risk)) {
        atRiskValue += (qty * rate);
      }
    });

    return { totalBatches: matchingRecords.length, expired, critical, warning, safe, atRiskValue };
  }, [currentDatasetName, matchingRecords]);

  // Detailed breakdown when dataset is Pharmacy Sales or Sales Ledger
  const salesCounts = useMemo(() => {
    if (!['Pharmacy Sales', 'Sales Ledger'].includes(currentDatasetName)) return null;
    let directSales = 0;
    let rxSales = 0;
    let totalRevenue = 0;

    matchingRecords.forEach(s => {
      if (s.saleType === 'PRESCRIPTION') rxSales++;
      else directSales++;
      totalRevenue += Number(s.grandTotal || 0);
    });

    return { totalSales: matchingRecords.length, directSales, rxSales, totalRevenue };
  }, [currentDatasetName, matchingRecords]);

  // Detailed breakdown when dataset is Write-Offs
  const writeOffCounts = useMemo(() => {
    if (currentDatasetName !== 'Write-Offs') return null;
    let totalQty = 0;
    let totalLoss = 0;

    matchingRecords.forEach(w => {
      totalQty += Number(w.quantity || 0);
      totalLoss += Number(w.totalValue || (w.quantity * w.unitCost) || 0);
    });

    return { totalRecords: matchingRecords.length, totalQty, totalLoss };
  }, [currentDatasetName, matchingRecords]);

  // Detailed hierarchical breakdown when dataset is Purchase Orders
  const poHierarchyCounts = useMemo(() => {
    if (dataset !== 'Purchase Orders') return null;
    const masters = new Set();
    const subPos = new Set();
    const standalones = new Set();
    let lineItems = 0;

    matchingRecords.forEach(r => {
      if (r.poType === 'MASTER') {
        masters.add(r.poId);
      } else if (r.poType === 'SUB-PO') {
        subPos.add(r.poId);
        if (r.item && (r.item.name || r.item.sku)) lineItems++;
      } else if (r.poType === 'STANDALONE') {
        standalones.add(r.poId);
        if (r.item && (r.item.name || r.item.sku)) lineItems++;
      } else {
        lineItems++;
      }
    });

    return {
      masters: masters.size,
      subPos: subPos.size,
      standalones: standalones.size,
      lineItems
    };
  }, [dataset, matchingRecords]);

  // Detailed metadata breakdown when dataset is GRNs
  const grnCounts = useMemo(() => {
    if (dataset !== 'GRNs') return null;
    const uniqueGrns = new Set();
    let lineItems = 0;

    matchingRecords.forEach(r => {
      const gId = r.grnId || r['GRN ID'];
      if (gId) uniqueGrns.add(gId);
      if (r.item && (r.item.name || r.item.sku)) {
        lineItems++;
      } else if (r['Item Name'] || r['Item SKU / Code']) {
        lineItems++;
      } else {
        lineItems++;
      }
    });

    return {
      grns: uniqueGrns.size,
      lineItems
    };
  }, [dataset, matchingRecords]);

  // Detailed metadata breakdown when dataset is Prescriptions
  const prescriptionCounts = useMemo(() => {
    if (dataset !== 'Prescriptions') return null;
    let totalMeds = 0;
    matchingRecords.forEach(p => {
      const itCount = Array.isArray(p.items) && p.items.length > 0 ? p.items.length : 1;
      totalMeds += itCount;
    });
    return {
      prescriptions: matchingRecords.length,
      medicineLines: totalMeds
    };
  }, [dataset, matchingRecords]);

  const handleRunExport = async () => {
    setErrorMsg('');
    setSuccessMsg('');

    if (!isSnapshotDataset && rangeType === 'Custom Range') {
      if (!startDate || !endDate) {
        setErrorMsg('Please select both Start Date and End Date.');
        return;
      }
      if (new Date(startDate) > new Date(endDate)) {
        setErrorMsg('Start Date cannot be after End Date.');
        return;
      }
    }

    if (recordCount === 0) {
      setErrorMsg(`No records found for ${currentDatasetName} in the selected export parameters.`);
      return;
    }

    setIsExporting(true);
    try {
      const result = await executeExport({
        dataset: currentDatasetName,
        data: effectiveData,
        columns: effectiveColumns,
        dateField: isSnapshotDataset ? null : effectiveDateField,
        currentFilters,
        dateRange: activeDateRange,
        format,
        clinicName,
        letterheadConfig
      });

      setSuccessMsg(`Successfully exported ${result.recordCount} records as ${format.toUpperCase()}!`);
      if (onSuccess) onSuccess(result);

      // Auto close after brief confirmation
      setTimeout(() => {
        if (onClose) onClose();
      }, 1400);
    } catch (err) {
      console.error('[EXPORT MODAL ERROR]', err);
      setErrorMsg(err.message || 'Export failed. Please try again.');
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(15, 23, 42, 0.65)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
        animation: 'fadeIn 0.2s cubic-bezier(0.16, 1, 0.3, 1)'
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && !isExporting && onClose) onClose();
      }}
    >
      <div
        style={{
          backgroundColor: '#FFFFFF',
          borderRadius: '20px',
          boxShadow: '0 25px 50px -12px rgba(15, 23, 42, 0.25), 0 0 0 1px rgba(226, 232, 240, 0.9)',
          width: '100%',
          maxWidth: '520px',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          animation: 'modalSlideUp 0.25s cubic-bezier(0.16, 1, 0.3, 1)'
        }}
      >
        {/* Modal Header */}
        <div
          style={{
            padding: '22px 26px 18px 26px',
            borderBottom: '1px solid #F1F5F9',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'linear-gradient(180deg, #FAFAFC 0%, #FFFFFF 100%)'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div
              style={{
                width: '42px',
                height: '42px',
                borderRadius: '12px',
                background: 'linear-gradient(135deg, #EFF6FF 0%, #DBEAFE 100%)',
                border: '1px solid #BFDBFE',
                color: '#2563EB',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 2px 6px rgba(37, 99, 235, 0.12)',
                flexShrink: 0
              }}
            >
              <Download size={20} />
            </div>
            <div>
              <h3
                style={{
                  margin: 0,
                  fontSize: '18px',
                  fontWeight: 800,
                  color: '#0F172A',
                  fontFamily: "'Outfit', sans-serif",
                  letterSpacing: '-0.02em'
                }}
              >
                Export {currentDatasetName}
              </h3>
              <p
                style={{
                  margin: '2px 0 0 0',
                  fontSize: '12.5px',
                  color: '#64748B',
                  fontWeight: 500
                }}
              >
                Choose date range and export format
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isExporting}
            style={{
              background: '#F8FAFC',
              border: '1px solid #E2E8F0',
              color: '#64748B',
              cursor: isExporting ? 'not-allowed' : 'pointer',
              width: '32px',
              height: '32px',
              borderRadius: '10px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'all 0.15s'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = '#F1F5F9';
              e.currentTarget.style.color = '#0F172A';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = '#F8FAFC';
              e.currentTarget.style.color = '#64748B';
            }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Modal Body */}
        <div style={{ padding: '22px 26px', display: 'flex', flexDirection: 'column', gap: '18px' }}>
          {/* Error Banner */}
          {errorMsg && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                padding: '10px 14px',
                background: '#FEF2F2',
                border: '1px solid #FCA5A5',
                borderRadius: '10px',
                color: '#991B1B',
                fontSize: '12.5px',
                fontWeight: 600
              }}
            >
              <AlertCircle size={16} style={{ flexShrink: 0 }} />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Success Banner */}
          {successMsg && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                padding: '10px 14px',
                background: '#F0FDF4',
                border: '1px solid #86EFAC',
                borderRadius: '10px',
                color: '#166534',
                fontSize: '12.5px',
                fontWeight: 600
              }}
            >
              <CheckCircle2 size={16} style={{ flexShrink: 0 }} />
              <span>{successMsg}</span>
            </div>
          )}

          {/* 0. Mode / View Selection (e.g. Batch vs Summary) */}
          {modes && modes.length > 1 && (
            <div>
              <label
                style={{
                  display: 'block',
                  fontSize: '11px',
                  fontWeight: 800,
                  color: '#475569',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  marginBottom: '8px'
                }}
              >
                Export Structure / View
              </label>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: `repeat(${modes.length}, 1fr)`,
                  gap: '6px',
                  background: '#F1F5F9',
                  padding: '4px',
                  borderRadius: '12px'
                }}
              >
                {modes.map(m => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setSelectedModeId(m.id)}
                    style={{
                      padding: '8px 12px',
                      borderRadius: '9px',
                      fontSize: '12px',
                      fontWeight: selectedModeId === m.id ? 800 : 600,
                      border: 'none',
                      background: selectedModeId === m.id ? '#FFFFFF' : 'transparent',
                      color: selectedModeId === m.id ? '#2563EB' : '#64748B',
                      boxShadow: selectedModeId === m.id ? '0 2px 6px rgba(15, 23, 42, 0.08)' : 'none',
                      cursor: 'pointer',
                      transition: 'all 0.15s'
                    }}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* 1. Date Range or Snapshot Selection */}
          {isSnapshotDataset ? (
            <div
              style={{
                background: '#F8FAFC',
                border: '1px solid #E2E8F0',
                borderRadius: '14px',
                padding: '14px 16px'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                <span style={{ fontSize: '11px', fontWeight: 800, color: '#0D9488', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  CURRENT STOCK SNAPSHOT
                </span>
                <span style={{ fontSize: '11px', fontWeight: 600, color: '#64748B' }}>
                  Generated: {new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                </span>
              </div>
              <p style={{ margin: 0, fontSize: '12px', color: '#334155', fontWeight: 500, lineHeight: 1.4 }}>
                Real-time stock position across pharmacy inventory. Operates on full filtered catalog.
              </p>

              {inventoryStockCounts && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', marginTop: '12px' }}>
                  <div style={{ background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: '10px', padding: '8px 10px', textAlign: 'center' }}>
                    <div style={{ fontSize: '16px', fontWeight: 900, color: '#166534', fontFamily: "'Outfit', sans-serif" }}>{inventoryStockCounts.inStock}</div>
                    <div style={{ fontSize: '10px', fontWeight: 800, color: '#15803D', textTransform: 'uppercase' }}>In Stock</div>
                  </div>
                  <div style={{ background: '#FEFCE8', border: '1px solid #FEF08A', borderRadius: '10px', padding: '8px 10px', textAlign: 'center' }}>
                    <div style={{ fontSize: '16px', fontWeight: 900, color: '#854D0E', fontFamily: "'Outfit', sans-serif" }}>{inventoryStockCounts.lowStock}</div>
                    <div style={{ fontSize: '10px', fontWeight: 800, color: '#A16207', textTransform: 'uppercase' }}>Low Stock</div>
                  </div>
                  <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: '10px', padding: '8px 10px', textAlign: 'center' }}>
                    <div style={{ fontSize: '16px', fontWeight: 900, color: '#991B1B', fontFamily: "'Outfit', sans-serif" }}>{inventoryStockCounts.outOfStock}</div>
                    <div style={{ fontSize: '10px', fontWeight: 800, color: '#B91C1C', textTransform: 'uppercase' }}>Out of Stock</div>
                  </div>
                </div>
              )}

              {batchInventoryCounts && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', marginTop: '12px' }}>
                  <div style={{ background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: '10px', padding: '8px 10px', textAlign: 'center' }}>
                    <div style={{ fontSize: '16px', fontWeight: 900, color: '#1E40AF', fontFamily: "'Outfit', sans-serif" }}>{batchInventoryCounts.totalBatches}</div>
                    <div style={{ fontSize: '10px', fontWeight: 800, color: '#2563EB', textTransform: 'uppercase' }}>Total Batches</div>
                  </div>
                  <div style={{ background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: '10px', padding: '8px 10px', textAlign: 'center' }}>
                    <div style={{ fontSize: '16px', fontWeight: 900, color: '#166534', fontFamily: "'Outfit', sans-serif" }}>{batchInventoryCounts.totalQty}</div>
                    <div style={{ fontSize: '10px', fontWeight: 800, color: '#15803D', textTransform: 'uppercase' }}>Available Units</div>
                  </div>
                  <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: '10px', padding: '8px 10px', textAlign: 'center' }}>
                    <div style={{ fontSize: '16px', fontWeight: 900, color: '#991B1B', fontFamily: "'Outfit', sans-serif" }}>{batchInventoryCounts.criticalBatches}</div>
                    <div style={{ fontSize: '10px', fontWeight: 800, color: '#B91C1C', textTransform: 'uppercase' }}>Critical/Exp</div>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div>
              <label
                style={{
                  display: 'block',
                  fontSize: '11px',
                  fontWeight: 800,
                  color: '#475569',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  marginBottom: '8px'
                }}
              >
                Date Range
              </label>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(5, 1fr)',
                  gap: '4px',
                  background: '#F1F5F9',
                  padding: '4px',
                  borderRadius: '12px',
                  marginBottom: '10px'
                }}
              >
                {['All Time', 'Today', 'This Week', 'This Month', 'Custom Range'].map(t => {
                  const isActive = rangeType === t;
                  return (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setRangeType(t)}
                      style={{
                        padding: '8px 4px',
                        borderRadius: '9px',
                        fontSize: '11.5px',
                        fontWeight: isActive ? 800 : 600,
                        border: 'none',
                        background: isActive ? '#FFFFFF' : 'transparent',
                        color: isActive ? '#0F172A' : '#64748B',
                        boxShadow: isActive ? '0 2px 6px rgba(15, 23, 42, 0.08)' : 'none',
                        cursor: 'pointer',
                        transition: 'all 0.15s',
                        whiteSpace: 'nowrap'
                      }}
                    >
                      {t}
                    </button>
                  );
                })}
              </div>

              {rangeType === 'Custom Range' && (
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    gap: '12px',
                    padding: '12px 14px',
                    background: '#F8FAFC',
                    border: '1px solid #E2E8F0',
                    borderRadius: '12px'
                  }}
                >
                  <div>
                    <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: '#475569', marginBottom: '4px' }}>
                      Start Date
                    </label>
                    <input
                      type="date"
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '8px 10px',
                        fontSize: '12.5px',
                        borderRadius: '8px',
                        border: '1px solid #CBD5E1',
                        background: '#FFFFFF',
                        color: '#0F172A',
                        outline: 'none',
                        boxSizing: 'border-box',
                        fontWeight: 600
                      }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: '#475569', marginBottom: '4px' }}>
                      End Date
                    </label>
                    <input
                      type="date"
                      value={endDate}
                      onChange={(e) => setEndDate(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '8px 10px',
                        fontSize: '12.5px',
                        borderRadius: '8px',
                        border: '1px solid #CBD5E1',
                        background: '#FFFFFF',
                        color: '#0F172A',
                        outline: 'none',
                        boxSizing: 'border-box',
                        fontWeight: 600
                      }}
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* 2. Format Selection Cards */}
          <div>
            <label
              style={{
                display: 'block',
                fontSize: '11px',
                fontWeight: 800,
                color: '#475569',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                marginBottom: '8px'
              }}
            >
              Export Format
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' }}>
              {/* Excel Option */}
              <div
                onClick={() => setFormat('excel')}
                style={{
                  padding: '12px 14px',
                  borderRadius: '14px',
                  border: format === 'excel' ? '2px solid #10B981' : '1px solid #E2E8F0',
                  background: format === 'excel' ? 'linear-gradient(180deg, #F0FDF4 0%, #FFFFFF 100%)' : '#FFFFFF',
                  boxShadow: format === 'excel' ? '0 4px 12px rgba(16, 185, 129, 0.15)' : '0 1px 3px rgba(0,0,0,0.02)',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  transition: 'all 0.18s ease',
                  position: 'relative'
                }}
              >
                <div
                  style={{
                    width: '36px',
                    height: '36px',
                    borderRadius: '10px',
                    background: format === 'excel' ? '#10B981' : '#ECFDF5',
                    color: format === 'excel' ? '#FFFFFF' : '#059669',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0
                  }}
                >
                  <FileSpreadsheet size={18} />
                </div>
                <div>
                  <div style={{ fontSize: '13px', fontWeight: 800, color: format === 'excel' ? '#065F46' : '#0F172A' }}>
                    Excel
                  </div>
                  <div style={{ fontSize: '10.5px', color: '#64748B', fontWeight: 600 }}>.xlsx sheet</div>
                </div>
                {format === 'excel' && (
                  <div style={{ position: 'absolute', top: '8px', right: '8px', width: '16px', height: '16px', borderRadius: '50%', background: '#10B981', color: '#FFFFFF', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '9px' }}>
                    ✓
                  </div>
                )}
              </div>

              {/* CSV Option */}
              <div
                onClick={() => setFormat('csv')}
                style={{
                  padding: '12px 14px',
                  borderRadius: '14px',
                  border: format === 'csv' ? '2px solid #2563EB' : '1px solid #E2E8F0',
                  background: format === 'csv' ? 'linear-gradient(180deg, #EFF6FF 0%, #FFFFFF 100%)' : '#FFFFFF',
                  boxShadow: format === 'csv' ? '0 4px 12px rgba(37, 99, 235, 0.15)' : '0 1px 3px rgba(0,0,0,0.02)',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  transition: 'all 0.18s ease',
                  position: 'relative'
                }}
              >
                <div
                  style={{
                    width: '36px',
                    height: '36px',
                    borderRadius: '10px',
                    background: format === 'csv' ? '#2563EB' : '#EFF6FF',
                    color: format === 'csv' ? '#FFFFFF' : '#2563EB',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0
                  }}
                >
                  <FileText size={18} />
                </div>
                <div>
                  <div style={{ fontSize: '13px', fontWeight: 800, color: format === 'csv' ? '#1E40AF' : '#0F172A' }}>
                    CSV
                  </div>
                  <div style={{ fontSize: '10.5px', color: '#64748B', fontWeight: 600 }}>.csv table</div>
                </div>
                {format === 'csv' && (
                  <div style={{ position: 'absolute', top: '8px', right: '8px', width: '16px', height: '16px', borderRadius: '50%', background: '#2563EB', color: '#FFFFFF', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '9px' }}>
                    ✓
                  </div>
                )}
              </div>

              {/* PDF Option */}
              <div
                onClick={() => setFormat('pdf')}
                style={{
                  padding: '12px 14px',
                  borderRadius: '14px',
                  border: format === 'pdf' ? '2px solid #E11D48' : '1px solid #E2E8F0',
                  background: format === 'pdf' ? 'linear-gradient(180deg, #FFF1F2 0%, #FFFFFF 100%)' : '#FFFFFF',
                  boxShadow: format === 'pdf' ? '0 4px 12px rgba(225, 29, 72, 0.15)' : '0 1px 3px rgba(0,0,0,0.02)',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  transition: 'all 0.18s ease',
                  position: 'relative'
                }}
              >
                <div
                  style={{
                    width: '36px',
                    height: '36px',
                    borderRadius: '10px',
                    background: format === 'pdf' ? '#E11D48' : '#FFF1F2',
                    color: format === 'pdf' ? '#FFFFFF' : '#E11D48',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0
                  }}
                >
                  <FileText size={18} />
                </div>
                <div>
                  <div style={{ fontSize: '13px', fontWeight: 800, color: format === 'pdf' ? '#9F1239' : '#0F172A' }}>
                    PDF
                  </div>
                  <div style={{ fontSize: '10.5px', color: '#64748B', fontWeight: 600 }}>A4 Document</div>
                </div>
                {format === 'pdf' && (
                  <div style={{ position: 'absolute', top: '8px', right: '8px', width: '16px', height: '16px', borderRadius: '50%', background: '#E11D48', color: '#FFFFFF', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '9px' }}>
                    ✓
                  </div>
                )}
              </div>
            </div>

            {/* Contextual Letterhead Indicator when PDF is selected */}
            {format === 'pdf' && (
              <div
                style={{
                  marginTop: '12px',
                  padding: '10px 14px',
                  borderRadius: '12px',
                  background: letterheadConfig?.hasLetterhead ? '#F0FDF4' : '#F8FAFC',
                  border: letterheadConfig?.hasLetterhead ? '1px solid #BBF7D0' : '1px solid #E2E8F0',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '10px'
                }}
              >
                {letterheadConfig?.hasLetterhead ? (
                  <>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        width: '20px',
                        height: '20px',
                        borderRadius: '50%',
                        background: '#DCFCE7',
                        color: '#15803D',
                        fontSize: '11px',
                        fontWeight: 900
                      }}>
                        ✓
                      </span>
                      <span style={{ color: '#166534', fontSize: '12px', fontWeight: 700 }}>
                        Clinic Letterhead: Active <span style={{ fontWeight: 500, color: '#15803D' }}>({letterheadConfig.activeTemplateName || 'Standard'})</span>
                      </span>
                    </div>
                    <span style={{ fontSize: '11px', color: '#15803D', fontWeight: 700, background: '#DCFCE7', padding: '2px 8px', borderRadius: '6px' }}>
                      A4 Safe Area: L:{letterheadConfig.margins.left} R:{letterheadConfig.margins.right} T:{letterheadConfig.margins.top} B:{letterheadConfig.margins.bottom} mm
                    </span>
                  </>
                ) : (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#94A3B8' }} />
                    <span style={{ color: '#64748B', fontSize: '12px', fontWeight: 500 }}>
                      Letterhead: <strong style={{ fontWeight: 700, color: '#475569' }}>Standard Fallback Header</strong>
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* 3. Live Matching Data Summary Banner */}
          <div
            style={{
              padding: '12px 16px',
              background: recordCount > 0 ? '#F8FAFC' : '#FEF2F2',
              borderRadius: '12px',
              border: recordCount > 0 ? '1px solid #E2E8F0' : '1px solid #FECACA',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '10px'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div
                style={{
                  width: '30px',
                  height: '30px',
                  borderRadius: '8px',
                  background: recordCount > 0 ? '#EFF6FF' : '#FEE2E2',
                  color: recordCount > 0 ? '#2563EB' : '#DC2626',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0
                }}
              >
                <Calendar size={16} />
              </div>
              <div>
                {poHierarchyCounts ? (
                  <div style={{ fontSize: '12.5px', fontWeight: 800, color: recordCount > 0 ? '#0F172A' : '#991B1B' }}>
                    {poHierarchyCounts.masters > 0 ? `Master POs: ${poHierarchyCounts.masters} • ` : ''}
                    {poHierarchyCounts.subPos > 0 ? `Sub-POs: ${poHierarchyCounts.subPos} • ` : ''}
                    {poHierarchyCounts.standalones > 0 ? `Standalone: ${poHierarchyCounts.standalones} • ` : ''}
                    Line Items: {poHierarchyCounts.lineItems}
                  </div>
                ) : grnCounts ? (
                  <div style={{ fontSize: '12.5px', fontWeight: 800, color: recordCount > 0 ? '#0F172A' : '#991B1B' }}>
                    GRNs: {grnCounts.grns} • Line Items: {grnCounts.lineItems}
                  </div>
                ) : prescriptionCounts ? (
                  <div style={{ fontSize: '12.5px', fontWeight: 800, color: recordCount > 0 ? '#0F172A' : '#991B1B' }}>
                    Prescriptions: {prescriptionCounts.prescriptions} • Medicine Lines: {prescriptionCounts.medicineLines}
                  </div>
                ) : (
                  <div style={{ fontSize: '13px', fontWeight: 800, color: recordCount > 0 ? '#0F172A' : '#991B1B' }}>
                    {recordCount} {recordCount === 1 ? 'record' : 'records'} ready for export
                  </div>
                )}
                <div style={{ fontSize: '11px', color: '#64748B', fontWeight: 500 }}>
                  {poHierarchyCounts || grnCounts || prescriptionCounts ? `(${recordCount} total matching records in selection)` : `Total in current dataset: ${effectiveData?.length || 0}`}
                </div>
              </div>
            </div>
            <span
              style={{
                fontSize: '11px',
                fontWeight: 800,
                padding: '3px 8px',
                borderRadius: '6px',
                background: recordCount > 0 ? '#DCFCE7' : '#FEE2E2',
                color: recordCount > 0 ? '#15803D' : '#DC2626'
              }}
            >
              {recordCount > 0 ? 'READY' : 'EMPTY'}
            </span>
          </div>
        </div>

        {/* Modal Footer */}
        <div
          style={{
            padding: '16px 26px',
            borderTop: '1px solid #F1F5F9',
            background: '#F8FAFC',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
            gap: '12px'
          }}
        >
          <button
            type="button"
            onClick={onClose}
            disabled={isExporting}
            style={{
              padding: '10px 18px',
              fontSize: '13px',
              fontWeight: 700,
              color: '#475569',
              background: '#FFFFFF',
              border: '1px solid #CBD5E1',
              borderRadius: '10px',
              cursor: isExporting ? 'not-allowed' : 'pointer',
              transition: 'all 0.15s'
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = '#F1F5F9')}
            onMouseLeave={(e) => (e.currentTarget.style.background = '#FFFFFF')}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleRunExport}
            disabled={isExporting || recordCount === 0}
            style={{
              padding: '10px 22px',
              fontSize: '13.5px',
              fontWeight: 800,
              color: '#FFFFFF',
              background: recordCount === 0 
                ? '#94A3B8' 
                : format === 'excel' 
                  ? 'linear-gradient(135deg, #059669 0%, #10B981 100%)' 
                  : format === 'csv' 
                    ? 'linear-gradient(135deg, #1D4ED8 0%, #2563EB 100%)' 
                    : 'linear-gradient(135deg, #BE123C 0%, #E11D48 100%)',
              border: 'none',
              borderRadius: '10px',
              cursor: isExporting || recordCount === 0 ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              boxShadow: recordCount > 0 
                ? (format === 'excel' 
                    ? '0 4px 14px rgba(16, 185, 129, 0.35)' 
                    : format === 'csv' 
                      ? '0 4px 14px rgba(37, 99, 235, 0.35)' 
                      : '0 4px 14px rgba(225, 29, 72, 0.35)') 
                : 'none',
              transition: 'all 0.18s ease'
            }}
          >
            {isExporting ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                <span>Exporting...</span>
              </>
            ) : (
              <>
                <Download size={16} />
                <span>Download {format === 'excel' ? 'Excel (.xlsx)' : format === 'csv' ? 'CSV (.csv)' : 'Official PDF'}</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
