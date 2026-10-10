import { getAccessToken } from '../../../utils/authTokenStore';
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { 
  Upload, 
  FileSpreadsheet, 
  History, 
  AlertCircle, 
  CheckCircle2, 
  ArrowRight,
  RefreshCw,
  Building2,
  Calendar,
  Layers,
  ChevronRight,
  Download,
  Info,
  ShieldCheck,
  Check,
  Package,
  X,
  Clock,
  AlertTriangle,
  CheckCircle,
  FileCheck2
} from 'lucide-react';
import ExcelDropzone from './ExcelDropzone';
import MatchSummaryCards from './MatchSummaryCards';
import PreviewDataTable from './PreviewDataTable';
import ImportResultSummary from './ImportResultSummary';
import { getAllCategories, getCategoryConfig } from '../../../config/masterSchemaRegistry';
import { getApiUrl } from '../../../utils/api';

// ─────────────────────────────────────────────────────────────────────────────
// InlineImportPreview — Renders the import preview inline in the page
// (replaces the modal overlay approach)
// ─────────────────────────────────────────────────────────────────────────────
function InlineImportPreview({ previewData, onClose, onConfirmImport, isImporting }) {
  const [activeFilter, setActiveFilter] = useState('ALL');
  const [allowRepricing, setAllowRepricing] = useState(false);
  const [ambiguousResolutions, setAmbiguousResolutions] = useState({});

  const {
    sessionId,
    previewId,
    filename,
    tenant,
    category,
    department,
    summary = {},
    previewRows = [],
    expiresAt
  } = previewData;

  const effectiveSessionId = sessionId || previewId;

  const handleResolveAmbiguous = (rowNumber, masterItemId) => {
    setAmbiguousResolutions(prev => ({ ...prev, [rowNumber]: masterItemId }));
  };

  const ambiguousCount = summary?.ambiguous || 0;
  const resolvedCount = Object.keys(ambiguousResolutions).filter(k => !!ambiguousResolutions[k]).length;
  const unresolvedAmbiguous = Math.max(0, ambiguousCount - resolvedCount);

  const handleConfirm = () => {
    const formattedResolutions = Object.entries(ambiguousResolutions)
      .filter(([_, id]) => !!id)
      .map(([rowNum, id]) => ({ rowNumber: parseInt(rowNum, 10), selectedMasterItemId: id }));
    onConfirmImport({ sessionId: effectiveSessionId, allowRepricing, ambiguousResolutions: formattedResolutions });
  };

  const readyToImport = (summary?.exactMatch || 0) + (summary?.safeMatch || 0) + resolvedCount;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Preview Header */}
      <div style={{
        background: '#FFFFFF',
        borderRadius: '12px',
        border: '1px solid #E2E8F0',
        padding: '16px 20px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.04)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ width: '36px', height: '36px', borderRadius: '9px', background: '#EFF6FF', color: '#2563EB', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <FileCheck2 size={18} />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <h3 style={{ fontSize: '15px', fontWeight: 800, color: '#0F172A', margin: 0 }}>
                  Catalog Import Preview
                </h3>
                <span style={{ fontSize: '11px', fontWeight: 700, color: '#059669', background: '#D1FAE5', padding: '2px 8px', borderRadius: '5px', border: '1px solid #A7F3D0' }}>
                  Server-Authoritative Session
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap', marginTop: '4px', fontSize: '11.5px', color: '#64748B' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <Building2 size={13} />
                  Clinic: <strong style={{ color: '#0F172A' }}>{tenant?.name || tenant?.id || '—'}</strong>
                  {tenant?.code && tenant.code !== tenant.name && ` (${tenant.code})`}
                </span>
                <span>·</span>
                <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <Layers size={13} />
                  Category: <strong style={{ color: '#0F172A' }}>{category}</strong>
                  {department && <> · Dept: <strong style={{ color: '#0F172A' }}>{department}</strong></>}
                </span>
                <span>·</span>
                <span style={{ color: '#94A3B8', fontFamily: 'monospace', fontSize: '11px' }}>
                  {filename}
                </span>
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isImporting}
            style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', fontWeight: 600, color: '#64748B', background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '8px', padding: '7px 12px', cursor: 'pointer' }}
          >
            <X size={14} />
            Cancel & Go Back
          </button>
        </div>

        {/* Session expiry notice */}
        {expiresAt && (
          <div style={{ marginTop: '12px', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '11px', background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: '7px', padding: '7px 12px', color: '#1D4ED8' }}>
            <Clock size={13} />
            <span>
              Session locked for validation. Expires at <strong>{new Date(expiresAt).toLocaleTimeString()}</strong>
            </span>
            <span style={{ marginLeft: 'auto', fontFamily: 'monospace', color: '#94A3B8', fontSize: '10px' }}>
              ID: {effectiveSessionId?.substring(0, 16)}...
            </span>
          </div>
        )}
      </div>

      {/* Metric Cards */}
      <div style={{ background: '#FFFFFF', borderRadius: '12px', border: '1px solid #E2E8F0', padding: '16px 20px' }}>
        <div style={{ fontSize: '11px', fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '12px' }}>
          Import Summary — Click a card to filter rows
        </div>
        <MatchSummaryCards summary={summary} activeFilter={activeFilter} onSelectFilter={setActiveFilter} />
      </div>

      {/* Policy Controls */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '12px' }}>
        {/* Repricing policy */}
        <div style={{
          background: allowRepricing ? '#FAF5FF' : '#F8FAFC',
          border: allowRepricing ? '1.5px solid #C4B5FD' : '1px solid #E2E8F0',
          borderRadius: '10px',
          padding: '14px 16px'
        }}>
          <label style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={allowRepricing}
              onChange={(e) => setAllowRepricing(e.target.checked)}
              style={{ marginTop: '2px', width: '14px', height: '14px', cursor: 'pointer', accentColor: '#7C3AED' }}
            />
            <div>
              <span style={{ fontSize: '12px', fontWeight: 700, color: '#0F172A', display: 'block' }}>
                Allow Repricing of Existing Clinic Catalog Items
              </span>
              <p style={{ fontSize: '11px', color: allowRepricing ? '#6D28D9' : '#64748B', margin: '3px 0 0 0', lineHeight: 1.4 }}>
                {allowRepricing
                  ? `Enabled: Imported prices will overwrite existing clinic catalog prices for matching items (${summary?.repricingDiffs || 0} items affected).`
                  : 'Disabled: Existing clinic catalog prices remain strictly frozen and untouched.'}
              </p>
            </div>
          </label>
        </div>

        {/* Ambiguous notice */}
        <div style={{ background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: '10px', padding: '14px 16px', display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
          <AlertTriangle size={16} color="#D97706" style={{ flexShrink: 0, marginTop: '1px' }} />
          <div>
            <span style={{ fontSize: '12px', fontWeight: 700, color: '#92400E', display: 'block' }}>
              Ambiguous Matches: {ambiguousCount} Row(s)
            </span>
            <p style={{ fontSize: '11px', color: '#B45309', margin: '3px 0 0 0', lineHeight: 1.4 }}>
              {unresolvedAmbiguous > 0
                ? <><strong>{unresolvedAmbiguous}</strong> row(s) still need selection. Unresolved rows will be skipped.</>
                : ambiguousCount > 0
                  ? <span style={{ color: '#059669', fontWeight: 600 }}>✓ All ambiguous rows resolved.</span>
                  : 'No ambiguous rows detected in this workbook.'
              }
            </p>
          </div>
        </div>
      </div>

      {/* Preview Data Table */}
      <div style={{ background: '#FFFFFF', borderRadius: '12px', border: '1px solid #E2E8F0', padding: '16px 20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
          <h3 style={{ fontSize: '12px', fontWeight: 800, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.04em', margin: 0 }}>
            Item Preview &amp; Resolution Table
          </h3>
          {activeFilter !== 'ALL' && (
            <button
              type="button"
              onClick={() => setActiveFilter('ALL')}
              style={{ fontSize: '11.5px', color: '#2563EB', fontWeight: 600, background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}
            >
              Clear filter (showing {activeFilter})
            </button>
          )}
        </div>
        <PreviewDataTable
          rows={previewRows}
          ambiguousResolutions={ambiguousResolutions}
          onResolveAmbiguous={handleResolveAmbiguous}
          category={category}
          activeFilter={activeFilter}
        />
      </div>

      {/* Footer Actions */}
      <div style={{
        background: '#FFFFFF',
        borderRadius: '12px',
        border: '1px solid #E2E8F0',
        padding: '14px 20px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '12px',
        flexWrap: 'wrap'
      }}>
        <button
          type="button"
          onClick={onClose}
          disabled={isImporting}
          style={{ padding: '8px 16px', fontSize: '12px', fontWeight: 600, color: '#475569', background: '#F8FAFC', border: '1px solid #CBD5E1', borderRadius: '8px', cursor: 'pointer' }}
        >
          Discard &amp; Cancel
        </button>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span style={{ fontSize: '12px', color: '#64748B', fontWeight: 500 }}>
            Ready to import <strong style={{ color: '#0F172A', fontWeight: 800 }}>{readyToImport}</strong> items
          </span>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={isImporting || readyToImport === 0}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '9px 20px',
              fontSize: '12.5px',
              fontWeight: 750,
              color: '#FFFFFF',
              background: isImporting || readyToImport === 0 ? '#94A3B8' : '#2563EB',
              border: 'none',
              borderRadius: '9px',
              cursor: isImporting || readyToImport === 0 ? 'not-allowed' : 'pointer',
              boxShadow: '0 1px 4px rgba(37,99,235,0.25)'
            }}
          >
            {isImporting ? (
              <>
                <div style={{ width: '14px', height: '14px', border: '2px solid rgba(255,255,255,0.4)', borderTopColor: '#FFFFFF', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
                Importing Catalog...
              </>
            ) : (
              <>
                <ShieldCheck size={15} />
                Confirm &amp; Import Clinic Catalog
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}


export default function HospitalMasterUploadView({ onSwitchTab }) {
  const [hospitals, setHospitals] = useState([]);
  const [loadingHospitals, setLoadingHospitals] = useState(false);

  // SECTION A: Download State
  const [downloadHospital, setDownloadHospital] = useState('');
  const [downloadCategory, setDownloadCategory] = useState('');
  const [downloadDepartment, setDownloadDepartment] = useState('');
  const [downloadingMaster, setDownloadingMaster] = useState(false);

  // SECTION B: Upload State
  const [uploadHospital, setUploadHospital] = useState('');
  const [uploadCategory, setUploadCategory] = useState('');
  const [uploadDepartment, setUploadDepartment] = useState('');
  const [selectedFile, setSelectedFile] = useState(null);
  const [isUploading, setIsUploading] = useState(false);

  // Feedback & Preview
  const [error, setError] = useState('');
  const [previewData, setPreviewData] = useState(null);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [importResult, setImportResult] = useState(null);

  // Audit History
  const [history, setHistory] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  const categories = useMemo(() => getAllCategories(), []);

  const downloadCatConfig = useMemo(() => {
    return downloadCategory ? getCategoryConfig(downloadCategory) : null;
  }, [downloadCategory]);

  const downloadDepartments = useMemo(() => {
    if (!downloadCatConfig || !downloadCatConfig.hasDepartment) return [];
    return Object.keys(downloadCatConfig.departments || {});
  }, [downloadCatConfig]);

  const uploadCatConfig = useMemo(() => {
    return uploadCategory ? getCategoryConfig(uploadCategory) : null;
  }, [uploadCategory]);

  const uploadDepartments = useMemo(() => {
    if (!uploadCatConfig || !uploadCatConfig.hasDepartment) return [];
    return Object.keys(uploadCatConfig.departments || {});
  }, [uploadCatConfig]);

  // Fetch Hospitals
  useEffect(() => {
    let isMounted = true;
    const fetchHospitals = async () => {
      try {
        setLoadingHospitals(true);
        const token = (getAccessToken() || localStorage.getItem('token'));
        const res = await fetch(getApiUrl('/superadmin/masters/hospitals-list'), {
          headers: token ? { Authorization: `Bearer ${token}` } : {}
        });
        const data = await res.json();
        if (isMounted && data.success && Array.isArray(data.data)) {
          setHospitals(data.data);
        }
      } catch (err) {
        console.error('[ITEM MASTER UPLOAD] Load hospitals error:', err);
      } finally {
        if (isMounted) setLoadingHospitals(false);
      }
    };
    fetchHospitals();
    return () => { isMounted = false; };
  }, []);

  // Fetch History
  const fetchHistory = useCallback(async () => {
    try {
      setLoadingHistory(true);
      const token = (getAccessToken() || localStorage.getItem('token'));
      const url = uploadHospital 
        ? `/superadmin/masters/upload/history?tenantId=${encodeURIComponent(uploadHospital)}&limit=10`
        : '/superadmin/masters/upload/history?limit=10';
      const res = await fetch(getApiUrl(url), {
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      });
      const data = await res.json();
      if (data.success && Array.isArray(data.data)) {
        setHistory(data.data);
      }
    } catch (err) {
      console.error('[ITEM MASTER UPLOAD] Load history error:', err);
    } finally {
      setLoadingHistory(false);
    }
  }, [uploadHospital]);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  // ─────────────────────────────────────────────────────────────────────────────
  // DOWNLOAD ACTION
  // ─────────────────────────────────────────────────────────────────────────────
  const handleDownloadMaster = async () => {
    if (!downloadCategory) {
      setError('Please select a category to download.');
      return;
    }
    if (downloadCategory === 'Radiology') {
      setError('Radiology download is unavailable: Category remains SOURCE-CONFIRMATION-REQUIRED.');
      return;
    }

    try {
      setDownloadingMaster(true);
      setError('');
      const token = (getAccessToken() || localStorage.getItem('token'));
      let url = `/superadmin/masters/upload/download?category=${encodeURIComponent(downloadCategory)}`;
      if (downloadHospital) {
        url += `&tenantId=${encodeURIComponent(downloadHospital)}`;
      }
      if (downloadDepartment && downloadDepartment !== 'all') {
        url += `&department=${encodeURIComponent(downloadDepartment)}`;
      } else {
        url += `&department=all`;
      }

      const res = await fetch(getApiUrl(url), {
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || `Download failed (${res.status})`);
      }

      const blob = await res.blob();
      const safeCat = downloadCategory.replace(/\s+/g, '_');
      const deptSuffix = downloadDepartment && downloadDepartment !== 'all' ? `_${downloadDepartment.replace(/\s+/g, '_')}` : '_All_Departments';
      const hospPrefix = downloadHospital ? `Clinic_${downloadHospital}_` : 'Quroxa_';
      const safeFilename = `${hospPrefix}${safeCat}${deptSuffix}.xlsx`;

      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = safeFilename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(link.href);
    } catch (err) {
      setError(err.message || 'Error downloading Item Master Excel workbook');
    } finally {
      setDownloadingMaster(false);
    }
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // UPLOAD & PREVIEW ACTION
  // ─────────────────────────────────────────────────────────────────────────────
  const handleParsePreview = async (fileToUpload) => {
    const file = fileToUpload || selectedFile;
    if (!file) {
      setError('Please select an Excel workbook (.xlsx or .xls) to upload.');
      return;
    }
    if (!uploadHospital) {
      setError('Target Clinic is mandatory for upload. Please select a clinic.');
      return;
    }
    if (!uploadCategory) {
      setError('Category is required for upload. Please select a category.');
      return;
    }
    if (uploadCategory === 'Radiology') {
      setError('Radiology uploads are blocked: Category remains SOURCE-CONFIRMATION-REQUIRED.');
      return;
    }

    try {
      setError('');
      setIsUploading(true);

      const formData = new FormData();
      formData.append('file', file);
      formData.append('tenantId', uploadHospital);
      formData.append('category', uploadCategory);
      if (uploadDepartment && uploadDepartment !== 'all') {
        formData.append('department', uploadDepartment);
      } else {
        formData.append('department', '');
      }

      const token = (getAccessToken() || localStorage.getItem('token'));
      const res = await fetch(getApiUrl('/superadmin/masters/upload/parse-preview'), {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to parse workbook for preview');
      }

      setPreviewData(data.data || data);
      setIsPreviewOpen(true);
    } catch (err) {
      setError(err.message || 'Error processing Excel file');
    } finally {
      setIsUploading(false);
    }
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // CONFIRM IMPORT ACTION
  // ─────────────────────────────────────────────────────────────────────────────
  const handleConfirmImport = async ({ sessionId, allowRepricing, ambiguousResolutions }) => {
    try {
      setIsImporting(true);
      setError('');

      const token = (getAccessToken() || localStorage.getItem('token'));
      const res = await fetch(getApiUrl('/superadmin/masters/upload/confirm-import'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify({
          sessionId: sessionId || previewData?.previewId,
          previewId: sessionId || previewData?.previewId,
          tenantId: uploadHospital,
          category: uploadCategory,
          department: uploadDepartment && uploadDepartment !== 'all' ? uploadDepartment : '',
          allowRepricing,
          ambiguousResolutions
        })
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Catalog ingestion failed');
      }

      setIsPreviewOpen(false);
      setPreviewData(null);
      setSelectedFile(null);
      setImportResult(data.data || data);
      fetchHistory();
    } catch (err) {
      setError(err.message || 'Error executing import');
    } finally {
      setIsImporting(false);
    }
  };

  const handleReset = () => {
    setSelectedFile(null);
    setImportResult(null);
    setPreviewData(null);
    setError('');
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'clamp(14px, 2vh, 24px)', paddingBottom: 'clamp(20px, 3vh, 40px)' }}>
      {/* Error alert */}
      {error && (
        <div style={{
          padding: '10px 14px',
          borderRadius: '8px',
          background: '#FEF2F2',
          border: '1px solid #FCA5A5',
          color: '#991B1B',
          fontSize: '12px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <AlertCircle size={15} color="#DC2626" />
            <span style={{ fontWeight: 650 }}>{error}</span>
          </div>
          <button 
            type="button" 
            onClick={() => setError('')} 
            style={{ background: 'none', border: 'none', color: '#DC2626', fontWeight: 800, cursor: 'pointer', fontSize: '13px' }}
          >
            ✕
          </button>
        </div>
      )}

      {/* Import Result Summary */}
      {importResult && (
        <ImportResultSummary
          result={importResult}
          onReset={handleReset}
          onViewCatalog={onSwitchTab ? () => onSwitchTab('hospital-pricing') : null}
        />
      )}

      {/* Main Two-Section Workflow: SECTION A (Download) vs SECTION B (Upload) */}
      {!importResult && !isPreviewOpen && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))', gap: 'clamp(14px, 2vh, 24px)' }}>
          
          {/* ══════════════════════════════════════════════════════════════════════════ */}
          {/* SECTION A — DOWNLOAD MASTER                                               */}
          {/* ══════════════════════════════════════════════════════════════════════════ */}
          <div style={{
            background: '#FFFFFF',
            borderRadius: '12px',
            border: '1.5px solid #E2E8F0',
            padding: 'clamp(16px, 2.2vh, 26px)',
            display: 'flex',
            flexDirection: 'column',
            gap: 'clamp(12px, 1.8vh, 18px)',
            minHeight: 'clamp(440px, 58vh, 580px)',
            boxShadow: '0 1px 3px rgba(0,0,0,0.02)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #F1F5F9', pb: '10px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div style={{ width: '30px', height: '30px', borderRadius: '7px', background: '#EFF6FF', color: '#2563EB', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Download size={16} />
                </div>
                <div>
                  <h3 style={{ fontSize: '13.5px', fontWeight: 800, color: '#0F172A', margin: 0 }}>
                    SECTION A — DOWNLOAD MASTER
                  </h3>
                  <span style={{ fontSize: '11px', color: '#64748B' }}>
                    Category-wise master catalog with commercial columns
                  </span>
                </div>
              </div>
              <span style={{ fontSize: '10px', fontWeight: 800, color: '#2563EB', background: '#DBEAFE', padding: '2px 8px', borderRadius: '4px' }}>
                MRP + Net Rate
              </span>
            </div>

            {/* Target Clinic Selector (Optional for download) */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={{ fontSize: '11px', fontWeight: 800, color: '#475569', textTransform: 'uppercase' }}>
                Target Clinic (Optional — Pre-populates Existing Pricing):
              </label>
              <select
                value={downloadHospital}
                onChange={(e) => setDownloadHospital(e.target.value)}
                style={{
                  width: '100%',
                  height: '36px',
                  borderRadius: '7px',
                  border: '1px solid #CBD5E1',
                  padding: '0 10px',
                  fontSize: '12.5px',
                  fontWeight: 650,
                  color: '#0F172A',
                  background: '#FFFFFF',
                  outline: 'none',
                  cursor: 'pointer'
                }}
              >
                <option value="">Blank Commercial Template (Initial Pricing Entry)</option>
                {hospitals.map(h => (
                  <option key={h.code || h.hospitalId} value={h.code || h.hospitalId}>
                    {h.name} ({h.code || h.hospitalId}) — Pre-populate Configured Rates
                  </option>
                ))}
              </select>
            </div>

            {/* Category Selector (Required) */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={{ fontSize: '11px', fontWeight: 800, color: '#475569', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <span style={{ color: '#DC2626' }}>*</span> Category:
              </label>
              <select
                value={downloadCategory}
                onChange={(e) => {
                  setDownloadCategory(e.target.value);
                  setDownloadDepartment('');
                }}
                style={{
                  width: '100%',
                  height: '36px',
                  borderRadius: '7px',
                  border: downloadCategory ? '1.5px solid #2563EB' : '1px solid #CBD5E1',
                  padding: '0 10px',
                  fontSize: '12.5px',
                  fontWeight: 700,
                  color: downloadCategory ? '#0F172A' : '#64748B',
                  background: '#FFFFFF',
                  outline: 'none',
                  cursor: 'pointer'
                }}
              >
                <option value="">-- Select Category (Required) --</option>
                {categories.map(cat => {
                  const isBlocked = cat.name === 'Radiology' || cat.status === 'SOURCE-CONFIRMATION-REQUIRED';
                  return (
                    <option key={cat.name} value={cat.name} disabled={isBlocked}>
                      {cat.name} {isBlocked ? '(Pending Confirmation)' : `(${cat.fieldCount} fields)`}
                    </option>
                  );
                })}
              </select>
            </div>

            {/* Department Selector (Optional) */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={{ fontSize: '11px', fontWeight: 800, color: '#475569', textTransform: 'uppercase' }}>
                Department (Optional):
              </label>
              <select
                value={downloadDepartment}
                disabled={!downloadCategory || !downloadCatConfig?.hasDepartment}
                onChange={(e) => setDownloadDepartment(e.target.value)}
                style={{
                  width: '100%',
                  height: '36px',
                  borderRadius: '7px',
                  border: '1px solid #CBD5E1',
                  padding: '0 10px',
                  fontSize: '12.5px',
                  fontWeight: 650,
                  color: (!downloadCategory || !downloadCatConfig?.hasDepartment) ? '#94A3B8' : '#0F172A',
                  background: (!downloadCategory || !downloadCatConfig?.hasDepartment) ? '#F1F5F9' : '#FFFFFF',
                  outline: 'none',
                  cursor: (!downloadCategory || !downloadCatConfig?.hasDepartment) ? 'not-allowed' : 'pointer'
                }}
              >
                {downloadCategory === 'Assets' ? (
                  <option value="">No Department (15 Standard Columns)</option>
                ) : !downloadCategory ? (
                  <option value="">-- Select Category First --</option>
                ) : (
                  <>
                    <option value="">All Departments (All {downloadDepartments.length} depts in ONE workbook)</option>
                    {downloadDepartments.map(dept => (
                      <option key={dept} value={dept}>{dept}</option>
                    ))}
                  </>
                )}
              </select>
            </div>

            {/* Specifications Card */}
            <div style={{
              background: '#F8FAFC',
              borderRadius: '8px',
              padding: '12px',
              border: '1px solid #E2E8F0',
              fontSize: '11.5px',
              color: '#475569',
              display: 'flex',
              flexDirection: 'column',
              gap: '6px',
              lineHeight: 1.4
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 800, color: '#1E293B' }}>
                <Info size={14} color="#2563EB" />
                Export Workbook Characteristics
              </div>
              <div>• <strong>Scope:</strong> {(!downloadDepartment || downloadDepartment === 'all') && downloadCatConfig?.hasDepartment ? `Exports ALL ${downloadDepartments.length} departments into ONE workbook; preserves Department in each row.` : downloadDepartment ? `Exports only ${downloadDepartment} department.` : 'Standard category catalogue.'}</div>
              <div>• <strong>Commercial Columns:</strong> Always includes <strong>MRP</strong> and <strong>Net Rate</strong>.</div>
              <div>• <strong>Pricing State:</strong> {downloadHospital ? `Populates configured prices for ${downloadHospital}.` : 'Blank commercial columns ready for clinic price entry.'}</div>
            </div>

            {/* Action Button */}
            <div style={{ marginTop: 'auto', paddingTop: '8px' }}>
              <button
                type="button"
                onClick={handleDownloadMaster}
                disabled={downloadingMaster || !downloadCategory}
                style={{
                  width: '100%',
                  height: '38px',
                  borderRadius: '7px',
                  border: 'none',
                  background: '#2563EB',
                  color: '#FFFFFF',
                  fontSize: '12.5px',
                  fontWeight: 750,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  cursor: (downloadingMaster || !downloadCategory) ? 'not-allowed' : 'pointer',
                  opacity: (!downloadCategory) ? 0.6 : 1,
                  boxShadow: '0 1px 3px rgba(37,99,235,0.2)'
                }}
              >
                {downloadingMaster ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>Generating Category Workbook...</span>
                  </>
                ) : (
                  <>
                    <Download size={15} />
                    <span>Download Master Excel</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* ══════════════════════════════════════════════════════════════════════════ */}
          {/* SECTION B — UPLOAD MASTER                                                 */}
          {/* ══════════════════════════════════════════════════════════════════════════ */}
          <div style={{
            background: '#FFFFFF',
            borderRadius: '12px',
            border: '1.5px solid #E2E8F0',
            padding: 'clamp(16px, 2.2vh, 26px)',
            display: 'flex',
            flexDirection: 'column',
            gap: 'clamp(12px, 1.8vh, 18px)',
            minHeight: 'clamp(440px, 58vh, 580px)',
            boxShadow: '0 1px 3px rgba(0,0,0,0.02)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #F1F5F9', pb: '10px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div style={{ width: '30px', height: '30px', borderRadius: '7px', background: '#ECFDF5', color: '#059669', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Upload size={16} />
                </div>
                <div>
                  <h3 style={{ fontSize: '13.5px', fontWeight: 800, color: '#0F172A', margin: 0 }}>
                    SECTION B — UPLOAD MASTER
                  </h3>
                  <span style={{ fontSize: '11px', color: '#64748B' }}>
                    Clinic commercial selection & repricing ingestion
                  </span>
                </div>
              </div>
              <span style={{ fontSize: '10px', fontWeight: 800, color: '#059669', background: '#D1FAE5', padding: '2px 8px', borderRadius: '4px' }}>
                Registry Matched
              </span>
            </div>

            {/* Target Clinic (Required) */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={{ fontSize: '11px', fontWeight: 800, color: '#475569', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <span style={{ color: '#DC2626' }}>*</span> Target Clinic:
              </label>
              <select
                value={uploadHospital}
                onChange={(e) => setUploadHospital(e.target.value)}
                style={{
                  width: '100%',
                  height: '36px',
                  borderRadius: '7px',
                  border: uploadHospital ? '1.5px solid #059669' : '1px solid #CBD5E1',
                  padding: '0 10px',
                  fontSize: '12.5px',
                  fontWeight: 700,
                  color: uploadHospital ? '#0F172A' : '#64748B',
                  background: '#FFFFFF',
                  outline: 'none',
                  cursor: 'pointer'
                }}
              >
                <option value="">-- Select Target Clinic (Required) --</option>
                {hospitals.map(h => (
                  <option key={h.code || h.hospitalId} value={h.code || h.hospitalId}>
                    {h.name} ({h.code || h.hospitalId})
                  </option>
                ))}
              </select>
            </div>

            {/* Category (Required) */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={{ fontSize: '11px', fontWeight: 800, color: '#475569', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <span style={{ color: '#DC2626' }}>*</span> Category:
              </label>
              <select
                value={uploadCategory}
                onChange={(e) => {
                  setUploadCategory(e.target.value);
                  setUploadDepartment('');
                }}
                style={{
                  width: '100%',
                  height: '36px',
                  borderRadius: '7px',
                  border: uploadCategory ? '1.5px solid #059669' : '1px solid #CBD5E1',
                  padding: '0 10px',
                  fontSize: '12.5px',
                  fontWeight: 700,
                  color: uploadCategory ? '#0F172A' : '#64748B',
                  background: '#FFFFFF',
                  outline: 'none',
                  cursor: 'pointer'
                }}
              >
                <option value="">-- Select Category (Required) --</option>
                {categories.map(cat => {
                  const isBlocked = cat.name === 'Radiology' || cat.status === 'SOURCE-CONFIRMATION-REQUIRED';
                  return (
                    <option key={cat.name} value={cat.name} disabled={isBlocked}>
                      {cat.name} {isBlocked ? '(Pending Confirmation)' : `(${cat.fieldCount} fields)`}
                    </option>
                  );
                })}
              </select>
            </div>

            {/* Department (Optional) */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={{ fontSize: '11px', fontWeight: 800, color: '#475569', textTransform: 'uppercase' }}>
                Department (Optional — All Departments if not specified):
              </label>
              <select
                value={uploadDepartment}
                disabled={!uploadCategory || !uploadCatConfig?.hasDepartment}
                onChange={(e) => setUploadDepartment(e.target.value)}
                style={{
                  width: '100%',
                  height: '36px',
                  borderRadius: '7px',
                  border: '1px solid #CBD5E1',
                  padding: '0 10px',
                  fontSize: '12.5px',
                  fontWeight: 650,
                  color: (!uploadCategory || !uploadCatConfig?.hasDepartment) ? '#94A3B8' : '#0F172A',
                  background: (!uploadCategory || !uploadCatConfig?.hasDepartment) ? '#F1F5F9' : '#FFFFFF',
                  outline: 'none',
                  cursor: (!uploadCategory || !uploadCatConfig?.hasDepartment) ? 'not-allowed' : 'pointer'
                }}
              >
                {uploadCategory === 'Assets' ? (
                  <option value="">No Department (15 Standard Columns)</option>
                ) : !uploadCategory ? (
                  <option value="">-- Select Category First --</option>
                ) : (
                  <>
                    <option value="">All Departments (Category-wide Upload)</option>
                    {uploadDepartments.map(dept => (
                      <option key={dept} value={dept}>{dept}</option>
                    ))}
                  </>
                )}
              </select>
            </div>

            {/* Commercial Semantics Callout */}
            <div style={{
              background: '#F0FDF4',
              borderRadius: '8px',
              padding: '10px 12px',
              border: '1px solid #BBF7D0',
              fontSize: '11px',
              color: '#166534',
              display: 'flex',
              flexDirection: 'column',
              gap: '4px'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontWeight: 800 }}>
                <ShieldCheck size={14} color="#16a34a" />
                Commercial Selection Rules
              </div>
              <div>• <strong>Selection Rule:</strong> MRP entered (including 0) selects item. Blank MRP = unselected.</div>
              <div>• <strong>Validation:</strong> Net Rate cannot exceed MRP. Negative pricing is forbidden.</div>
              <div>• <strong>Non-Destructive:</strong> Existing pricing retained untouched if row has blank prices.</div>
            </div>

            {/* Excel Dropzone */}
            <ExcelDropzone
              onFileSelect={(file) => {
                setSelectedFile(file);
                if (uploadHospital && uploadCategory) {
                  handleParsePreview(file);
                }
              }}
              isUploading={isUploading}
              selectedFile={selectedFile}
              onClearFile={() => setSelectedFile(null)}
            />

            {/* Action Button */}
            <div style={{ marginTop: 'auto', paddingTop: '4px' }}>
              <button
                type="button"
                onClick={() => handleParsePreview(selectedFile)}
                disabled={isUploading || !uploadHospital || !uploadCategory || !selectedFile}
                style={{
                  width: '100%',
                  height: '38px',
                  borderRadius: '7px',
                  border: 'none',
                  background: '#059669',
                  color: '#FFFFFF',
                  fontSize: '12.5px',
                  fontWeight: 750,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  cursor: (isUploading || !uploadHospital || !uploadCategory || !selectedFile) ? 'not-allowed' : 'pointer',
                  opacity: (!uploadHospital || !uploadCategory || !selectedFile) ? 0.6 : 1,
                  boxShadow: '0 1px 3px rgba(5,150,105,0.2)'
                }}
              >
                {isUploading ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>Parsing & Inspecting Commercials...</span>
                  </>
                ) : (
                  <>
                    <span>Upload & Preview</span>
                    <ArrowRight size={14} />
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Preview (Inline — not a modal) */}
      {isPreviewOpen && previewData && (
        <InlineImportPreview
          previewData={previewData}
          onClose={() => { setIsPreviewOpen(false); setPreviewData(null); }}
          onConfirmImport={handleConfirmImport}
          isImporting={isImporting}
        />
      )}

      {/* ══════════════════════════════════════════════════════════════════════════ */}
      {/* SECTION C — RECENT CATALOG INGESTION HISTORY                               */}
      {/* ══════════════════════════════════════════════════════════════════════════ */}
      <div style={{
        background: '#FFFFFF',
        border: '1px solid #E2E8F0',
        borderRadius: '12px',
        padding: '18px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.02)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px', borderBottom: '1px solid #F1F5F9', paddingBottom: '10px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <History size={16} color="#64748B" />
            <h3 style={{ fontSize: '13.5px', fontWeight: 800, color: '#0F172A', margin: 0 }}>
              Recent Clinic Catalog Ingestion History
            </h3>
          </div>
          <button
            type="button"
            onClick={fetchHistory}
            disabled={loadingHistory}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '11.5px',
              color: '#475569',
              fontWeight: 650,
              padding: '4px 10px',
              borderRadius: '6px',
              border: '1px solid #CBD5E1',
              background: '#FFFFFF',
              cursor: 'pointer'
            }}
          >
            <RefreshCw size={12} className={loadingHistory ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>

        {history.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '24px', color: '#94A3B8', fontSize: '12px', fontStyle: 'italic' }}>
            No recent clinic catalog ingestion batches found.
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11.5px', textAlign: 'left' }}>
              <thead>
                <tr style={{ background: '#F8FAFC', borderBottom: '1px solid #E2E8F0', color: '#64748B', fontWeight: 700 }}>
                  <th style={{ padding: '8px 10px' }}>Batch ID & Date</th>
                  <th style={{ padding: '8px 10px' }}>Target Clinic</th>
                  <th style={{ padding: '8px 10px' }}>Category & Scope</th>
                  <th style={{ padding: '8px 10px' }}>Original File</th>
                  <th style={{ padding: '8px 10px', textAlign: 'center' }}>New / Repriced</th>
                  <th style={{ padding: '8px 10px', textAlign: 'center' }}>Retained / Skipped</th>
                  <th style={{ padding: '8px 10px', textAlign: 'right' }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {history.map((item) => (
                  <tr key={item._id || item.importBatchId} style={{ borderBottom: '1px solid #F1F5F9' }}>
                    <td style={{ padding: '8px 10px' }}>
                      <div style={{ fontFamily: 'monospace', fontWeight: 750, color: '#0F172A' }}>
                        {item.importBatchId || item.batchId}
                      </div>
                      <div style={{ fontSize: '10px', color: '#94A3B8', display: 'flex', alignItems: 'center', gap: '4px', marginTop: '2px' }}>
                        <Calendar size={10} />
                        {item.createdAt ? new Date(item.createdAt).toLocaleString() : '—'}
                      </div>
                    </td>
                    <td style={{ padding: '8px 10px', fontWeight: 650, color: '#0F172A' }}>
                      {item.hospitalName || item.tenantId}
                    </td>
                    <td style={{ padding: '8px 10px' }}>
                      <span style={{ fontWeight: 700, color: '#0F172A' }}>{item.category}</span>
                      {item.department && (
                        <span style={{ color: '#64748B', display: 'block', fontSize: '10.5px' }}>
                          Dept: {item.department}
                        </span>
                      )}
                    </td>
                    <td style={{ padding: '8px 10px', fontFamily: 'monospace', color: '#475569', maxWidth: '160px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {item.sourceFilename || item.originalFileName || '—'}
                    </td>
                    <td style={{ padding: '8px 10px', textAlign: 'center', fontFamily: 'monospace' }}>
                      <span style={{ color: '#059669', fontWeight: 800 }}>{item.createdCount || item.newConfigsCount || 0}</span>
                      {' / '}
                      <span style={{ color: '#7C3AED', fontWeight: 800 }}>{item.repricedCount || 0}</span>
                    </td>
                    <td style={{ padding: '8px 10px', textAlign: 'center', fontFamily: 'monospace' }}>
                      <span style={{ color: '#475569' }}>{item.retainedCount || 0}</span>
                      {' / '}
                      <span style={{ color: '#DC2626', fontWeight: 800 }}>{item.skippedCount || 0}</span>
                    </td>
                    <td style={{ padding: '8px 10px', textAlign: 'right' }}>
                      <span style={{
                        display: 'inline-flex',
                        padding: '2px 7px',
                        borderRadius: '4px',
                        fontSize: '10px',
                        fontWeight: 800,
                        background: item.status === 'SUCCESS' ? '#D1FAE5' : '#FEF3C7',
                        color: item.status === 'SUCCESS' ? '#065F46' : '#92400E'
                      }}>
                        {item.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
