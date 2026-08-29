import React, { useState, useMemo } from 'react';
import { FileSpreadsheet, FileText, Calendar, Download, X, AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';
import { executeExport, filterDataByDate } from '../../utils/exportEngine';

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
  onSuccess
}) {
  // Agreed Date Range options: [ Today ] [ This Week ] [ This Month ] [ Custom Range ]
  const [rangeType, setRangeType] = useState('Today');
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    return d.toISOString().split('T')[0];
  });
  const [endDate, setEndDate] = useState(() => {
    const d = new Date();
    return d.toISOString().split('T')[0];
  });

  // Format: 'excel' or 'pdf' (Default: 'excel')
  const [format, setFormat] = useState('excel');
  const [isExporting, setIsExporting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const isSnapshotDataset = dataset === 'Inventory' || !dateField;

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
      return filterDataByDate(data, isSnapshotDataset ? null : dateField, activeDateRange);
    } catch {
      return [];
    }
  }, [data, isSnapshotDataset, dateField, activeDateRange]);

  const recordCount = matchingRecords.length;

  // Detailed stock breakdown when dataset is Inventory
  const inventoryStockCounts = useMemo(() => {
    if (!isSnapshotDataset) return null;
    let inStock = 0;
    let lowStock = 0;
    let outOfStock = 0;

    matchingRecords.forEach(r => {
      const stock = Number(r.stock) || 0;
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
  }, [isSnapshotDataset, matchingRecords]);

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
      setErrorMsg(`No records found for ${dataset} in the selected export parameters.`);
      return;
    }

    setIsExporting(true);
    try {
      const result = await executeExport({
        dataset,
        data,
        columns,
        dateField: isSnapshotDataset ? null : dateField,
        currentFilters,
        dateRange: activeDateRange,
        format,
        clinicName
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
        backdropFilter: 'blur(4px)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
        animation: 'fadeIn 0.2s ease-out'
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && !isExporting && onClose) onClose();
      }}
    >
      <div
        style={{
          backgroundColor: '#FFFFFF',
          borderRadius: '16px',
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
          width: '100%',
          maxWidth: '480px',
          overflow: 'hidden',
          border: '1px solid #E2E8F0',
          display: 'flex',
          flexDirection: 'column'
        }}
      >
        {/* Modal Header — Displays dataset name automatically */}
        <div
          style={{
            padding: '20px 24px',
            borderBottom: '1px solid #F1F5F9',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'linear-gradient(180deg, #F8FAFC 0%, #FFFFFF 100%)'
          }}
        >
          <div>
            <h3
              style={{
                margin: 0,
                fontSize: '17px',
                fontWeight: 800,
                color: '#0F172A',
                letterSpacing: '-0.01em'
              }}
            >
              Export {dataset}
            </h3>
            <p
              style={{
                margin: '3px 0 0 0',
                fontSize: '12.5px',
                color: '#64748B',
                fontWeight: 500
              }}
            >
              Choose date range and export format
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isExporting}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#94A3B8',
              cursor: isExporting ? 'not-allowed' : 'pointer',
              padding: '6px',
              borderRadius: '8px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'background 0.15s'
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = '#F1F5F9')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
          >
            <X size={18} />
          </button>
        </div>

        {/* Modal Body */}
        <div style={{ padding: '22px 24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
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

          {/* 1. Date Range or Snapshot Selection */}
          {isSnapshotDataset ? (
            <div
              style={{
                background: '#F8FAFC',
                border: '1px solid #E2E8F0',
                borderRadius: '12px',
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
                  <div style={{ background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: '8px', padding: '8px 10px', textAlign: 'center' }}>
                    <div style={{ fontSize: '15px', fontWeight: 900, color: '#166534' }}>{inventoryStockCounts.inStock}</div>
                    <div style={{ fontSize: '10px', fontWeight: 700, color: '#15803D', textTransform: 'uppercase' }}>In Stock</div>
                  </div>
                  <div style={{ background: '#FEFCE8', border: '1px solid #FEF08A', borderRadius: '8px', padding: '8px 10px', textAlign: 'center' }}>
                    <div style={{ fontSize: '15px', fontWeight: 900, color: '#854D0E' }}>{inventoryStockCounts.lowStock}</div>
                    <div style={{ fontSize: '10px', fontWeight: 700, color: '#A16207', textTransform: 'uppercase' }}>Low Stock</div>
                  </div>
                  <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: '8px', padding: '8px 10px', textAlign: 'center' }}>
                    <div style={{ fontSize: '15px', fontWeight: 900, color: '#991B1B' }}>{inventoryStockCounts.outOfStock}</div>
                    <div style={{ fontSize: '10px', fontWeight: 700, color: '#B91C1C', textTransform: 'uppercase' }}>Out of Stock</div>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div>
              <label
                style={{
                  display: 'block',
                  fontSize: '11.5px',
                  fontWeight: 700,
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
                  gridTemplateColumns: 'repeat(4, 1fr)',
                  gap: '6px'
                }}
              >
                {['Today', 'This Week', 'This Month', 'Custom Range'].map((opt) => {
                  const isActive = rangeType === opt;
                  return (
                    <button
                      key={opt}
                      type="button"
                      onClick={() => {
                        setRangeType(opt);
                        setErrorMsg('');
                      }}
                      style={{
                        padding: '8px 4px',
                        fontSize: '12px',
                        fontWeight: isActive ? 700 : 500,
                        color: isActive ? '#2563EB' : '#475569',
                        background: isActive ? '#EFF6FF' : '#F8FAFC',
                        border: isActive ? '1.5px solid #3B82F6' : '1px solid #E2E8F0',
                        borderRadius: '8px',
                        cursor: 'pointer',
                        transition: 'all 0.15s',
                        textAlign: 'center',
                        whiteSpace: 'nowrap'
                      }}
                    >
                      {opt}
                    </button>
                  );
                })}
              </div>

              {/* Custom Range Picker */}
              {rangeType === 'Custom Range' && (
                <div
                  style={{
                    marginTop: '12px',
                    padding: '12px',
                    background: '#F8FAFC',
                    borderRadius: '10px',
                    border: '1px solid #E2E8F0',
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    gap: '10px'
                  }}
                >
                  <div>
                    <label
                      style={{
                        display: 'block',
                        fontSize: '10.5px',
                        fontWeight: 700,
                        color: '#64748B',
                        marginBottom: '4px'
                      }}
                    >
                      START DATE
                    </label>
                    <input
                      type="date"
                      value={startDate}
                      onChange={(e) => {
                        setStartDate(e.target.value);
                        setErrorMsg('');
                      }}
                      style={{
                        width: '100%',
                        padding: '7px 10px',
                        fontSize: '12px',
                        borderRadius: '6px',
                        border: '1px solid #CBD5E1',
                        background: '#FFFFFF',
                        color: '#0F172A',
                        outline: 'none',
                        boxSizing: 'border-box'
                      }}
                    />
                  </div>
                  <div>
                    <label
                      style={{
                        display: 'block',
                        fontSize: '10.5px',
                        fontWeight: 700,
                        color: '#64748B',
                        marginBottom: '4px'
                      }}
                    >
                      END DATE
                    </label>
                    <input
                      type="date"
                      value={endDate}
                      onChange={(e) => {
                        setEndDate(e.target.value);
                        setErrorMsg('');
                      }}
                      style={{
                        width: '100%',
                        padding: '7px 10px',
                        fontSize: '12px',
                        borderRadius: '6px',
                        border: '1px solid #CBD5E1',
                        background: '#FFFFFF',
                        color: '#0F172A',
                        outline: 'none',
                        boxSizing: 'border-box'
                      }}
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* 2. Format Selection (PDF or Excel) */}
          <div>
            <label
              style={{
                display: 'block',
                fontSize: '11.5px',
                fontWeight: 700,
                color: '#475569',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                marginBottom: '8px'
              }}
            >
              Export Format
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              {/* Excel Option */}
              <div
                onClick={() => setFormat('excel')}
                style={{
                  padding: '12px 14px',
                  borderRadius: '10px',
                  border: format === 'excel' ? '2px solid #10B981' : '1px solid #E2E8F0',
                  background: format === 'excel' ? '#F0FDF4' : '#FFFFFF',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  transition: 'all 0.15s'
                }}
              >
                <div
                  style={{
                    width: '36px',
                    height: '36px',
                    borderRadius: '8px',
                    background: format === 'excel' ? '#10B981' : '#F1F5F9',
                    color: format === 'excel' ? '#FFFFFF' : '#10B981',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}
                >
                  <FileSpreadsheet size={20} />
                </div>
                <div>
                  <div
                    style={{
                      fontSize: '13px',
                      fontWeight: 700,
                      color: format === 'excel' ? '#065F46' : '#1E293B'
                    }}
                  >
                    Excel (.xlsx)
                  </div>
                  <div style={{ fontSize: '11px', color: '#64748B' }}>Spreadsheet workbook</div>
                </div>
              </div>

              {/* PDF Option */}
              <div
                onClick={() => setFormat('pdf')}
                style={{
                  padding: '12px 14px',
                  borderRadius: '10px',
                  border: format === 'pdf' ? '2px solid #EF4444' : '1px solid #E2E8F0',
                  background: format === 'pdf' ? '#FEF2F2' : '#FFFFFF',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  transition: 'all 0.15s'
                }}
              >
                <div
                  style={{
                    width: '36px',
                    height: '36px',
                    borderRadius: '8px',
                    background: format === 'pdf' ? '#EF4444' : '#F1F5F9',
                    color: format === 'pdf' ? '#FFFFFF' : '#EF4444',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}
                >
                  <FileText size={20} />
                </div>
                <div>
                  <div
                    style={{
                      fontSize: '13px',
                      fontWeight: 700,
                      color: format === 'pdf' ? '#991B1B' : '#1E293B'
                    }}
                  >
                    PDF (.pdf)
                  </div>
                  <div style={{ fontSize: '11px', color: '#64748B' }}>Formatted document</div>
                </div>
              </div>
            </div>
          </div>

          {/* 3. Record Count Preview (Full unpaginated dataset) */}
          <div
            style={{
              padding: '12px 16px',
              background: recordCount > 0 ? '#EFF6FF' : '#FEF2F2',
              borderRadius: '10px',
              border: recordCount > 0 ? '1px solid #BFDBFE' : '1px solid #FECACA',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '10px'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <Calendar size={16} color={recordCount > 0 ? '#2563EB' : '#DC2626'} />
              {poHierarchyCounts ? (
                <span
                  style={{
                    fontSize: '12px',
                    fontWeight: 700,
                    color: recordCount > 0 ? '#1E40AF' : '#991B1B'
                  }}
                >
                  {poHierarchyCounts.masters > 0 ? `Master POs: ${poHierarchyCounts.masters} • ` : ''}
                  {poHierarchyCounts.subPos > 0 ? `Sub-POs: ${poHierarchyCounts.subPos} • ` : ''}
                  {poHierarchyCounts.standalones > 0 ? `Standalone: ${poHierarchyCounts.standalones} • ` : ''}
                  Line Items: {poHierarchyCounts.lineItems}
                </span>
              ) : grnCounts ? (
                <span
                  style={{
                    fontSize: '12px',
                    fontWeight: 700,
                    color: recordCount > 0 ? '#1E40AF' : '#991B1B'
                  }}
                >
                  GRNs: {grnCounts.grns} • Line Items: {grnCounts.lineItems}
                </span>
              ) : prescriptionCounts ? (
                <span
                  style={{
                    fontSize: '12px',
                    fontWeight: 700,
                    color: recordCount > 0 ? '#1E40AF' : '#991B1B'
                  }}
                >
                  Prescriptions: {prescriptionCounts.prescriptions} • Medicine Lines: {prescriptionCounts.medicineLines}
                </span>
              ) : (
                <span
                  style={{
                    fontSize: '12.5px',
                    fontWeight: 700,
                    color: recordCount > 0 ? '#1E40AF' : '#991B1B'
                  }}
                >
                  {recordCount} records available
                </span>
              )}
            </div>
            <span style={{ fontSize: '11.5px', color: '#64748B', fontWeight: 600, whiteSpace: 'nowrap' }}>
              {poHierarchyCounts || grnCounts || prescriptionCounts ? `(${recordCount} matching)` : `(Total in dataset: ${data.length})`}
            </span>
          </div>
        </div>

        {/* Modal Footer */}
        <div
          style={{
            padding: '16px 24px',
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
              padding: '9px 18px',
              fontSize: '13px',
              fontWeight: 600,
              color: '#475569',
              background: '#FFFFFF',
              border: '1px solid #CBD5E1',
              borderRadius: '8px',
              cursor: isExporting ? 'not-allowed' : 'pointer'
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleRunExport}
            disabled={isExporting || recordCount === 0}
            style={{
              padding: '9px 20px',
              fontSize: '13px',
              fontWeight: 700,
              color: '#FFFFFF',
              background: recordCount === 0 ? '#94A3B8' : '#2563EB',
              border: 'none',
              borderRadius: '8px',
              cursor: isExporting || recordCount === 0 ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              boxShadow: recordCount > 0 ? '0 2px 4px rgba(37, 99, 235, 0.2)' : 'none',
              transition: 'background 0.15s'
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
                <span>Export {format.toUpperCase()}</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
