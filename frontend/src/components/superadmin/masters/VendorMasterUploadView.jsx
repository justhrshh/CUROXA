import { getAccessToken } from '../../../utils/authTokenStore';
import React, { useState, useEffect, useCallback } from 'react';
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
  Truck,
  Download,
  Info,
  ShieldCheck,
  Check,
  X
} from 'lucide-react';
import ExcelDropzone from './ExcelDropzone';
import { getApiUrl } from '../../../utils/api';

export default function VendorMasterUploadView({ onSwitchTab }) {
  const [hospitals, setHospitals] = useState([]);
  const [loadingHospitals, setLoadingHospitals] = useState(false);

  // Download context
  const [downloadHospital, setDownloadHospital] = useState('');
  const [downloadingVendor, setDownloadingVendor] = useState(false);

  // Upload context
  const [selectedHospital, setSelectedHospital] = useState('');
  const [selectedFile, setSelectedFile] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState('');

  // Preview & Confirmation
  const [previewData, setPreviewData] = useState(null);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [importResult, setImportResult] = useState(null);

  // Fetch hospitals
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
        console.error('Failed to load hospitals for vendor upload:', err);
      } finally {
        if (isMounted) setLoadingHospitals(false);
      }
    };
    fetchHospitals();
    return () => { isMounted = false; };
  }, []);

  // Download vendor excel
  const handleDownload = async () => {
    try {
      setDownloadingVendor(true);
      setError('');
      const token = (getAccessToken() || localStorage.getItem('token'));
      const url = downloadHospital
        ? `/superadmin/masters/upload/vendor/download?tenantId=${encodeURIComponent(downloadHospital)}`
        : '/superadmin/masters/upload/vendor/download';

      const res = await fetch(getApiUrl(url), {
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || 'Failed to download Vendor Master workbook');
      }

      const blob = await res.blob();
      const filename = downloadHospital
        ? `Hospital_${downloadHospital}_Vendor_Master.xlsx`
        : `Quroxa_Vendor_Master_${new Date().toISOString().split('T')[0]}.xlsx`;

      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(link.href);
    } catch (err) {
      setError(err.message || 'Error downloading Vendor Master');
    } finally {
      setDownloadingVendor(false);
    }
  };

  // Upload and parse preview
  const handleParsePreview = async (fileToUpload) => {
    const file = fileToUpload || selectedFile;
    if (!file) {
      setError('Please select an Excel workbook (.xlsx or .xls) to upload.');
      return;
    }
    if (!selectedHospital) {
      setError('Please select a target hospital for vendor association.');
      return;
    }

    try {
      setError('');
      setIsUploading(true);

      const formData = new FormData();
      formData.append('file', file);
      formData.append('tenantId', selectedHospital);

      const token = (getAccessToken() || localStorage.getItem('token'));
      const res = await fetch(getApiUrl('/superadmin/masters/upload/vendor/parse-preview'), {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to parse vendor workbook');
      }

      setPreviewData(data);
      setIsPreviewOpen(true);
    } catch (err) {
      setError(err.message || 'Error processing Vendor Master Excel file');
    } finally {
      setIsUploading(false);
    }
  };

  // Confirm vendor import
  const handleConfirmImport = async () => {
    if (!previewData || !previewData.rows) return;

    try {
      setIsImporting(true);
      setError('');
      const token = (getAccessToken() || localStorage.getItem('token'));
      const res = await fetch(getApiUrl('/superadmin/masters/upload/vendor/confirm'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify({
          tenantId: selectedHospital,
          rows: previewData.rows
        })
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to commit vendor import');
      }

      setImportResult(data);
      setIsPreviewOpen(false);
      setPreviewData(null);
      setSelectedFile(null);
    } catch (err) {
      setError(err.message || 'Error confirming vendor import');
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

      {/* Ingestion Result Summary */}
      {importResult && (
        <div style={{
          background: '#FFFFFF',
          borderRadius: '12px',
          border: '1.5px solid #10B981',
          padding: '20px',
          boxShadow: '0 2px 6px rgba(16,185,129,0.08)',
          display: 'flex',
          flexDirection: 'column',
          gap: '14px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: '#D1FAE5', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#059669' }}>
              <CheckCircle2 size={20} />
            </div>
            <div>
              <h3 style={{ fontSize: '15px', fontWeight: 800, color: '#065F46', margin: 0 }}>
                Vendor Master Ingestion Completed Successfully
              </h3>
              <p style={{ fontSize: '12px', color: '#047857', margin: 0 }}>
                Target Hospital: <strong>{importResult.hospitalName || importResult.tenantId}</strong>
              </p>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
            <div style={{ background: '#ECFDF5', padding: '12px', borderRadius: '8px', border: '1px solid #A7F3D0' }}>
              <span style={{ fontSize: '11px', color: '#065F46', fontWeight: 700, textTransform: 'uppercase' }}>Associated with Hospital</span>
              <div style={{ fontSize: '20px', fontWeight: 800, color: '#047857' }}>{importResult.associatedCount} vendors</div>
              <span style={{ fontSize: '10.5px', color: '#059669' }}>Added / verified in hospital catalog</span>
            </div>
            <div style={{ background: '#FEF3C7', padding: '12px', borderRadius: '8px', border: '1px solid #FDE68A' }}>
              <span style={{ fontSize: '11px', color: '#92400E', fontWeight: 700, textTransform: 'uppercase' }}>Routed to SuperAdmin</span>
              <div style={{ fontSize: '20px', fontWeight: 800, color: '#B45309' }}>{importResult.requestsCreatedCount} new requests</div>
              <span style={{ fontSize: '10.5px', color: '#92400E' }}>Pending approval in Vendor Requests</span>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '6px' }}>
            <button
              type="button"
              onClick={handleReset}
              style={{
                padding: '6px 14px',
                borderRadius: '6px',
                border: '1px solid #CBD5E1',
                background: '#FFFFFF',
                fontSize: '12px',
                fontWeight: 700,
                color: '#334155',
                cursor: 'pointer'
              }}
            >
              Upload Another Workbook
            </button>
          </div>
        </div>
      )}

      {/* Main Two-Section Workflow: Download Master vs Upload Master */}
      {!importResult && !isPreviewOpen && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: 'clamp(14px, 2vh, 24px)' }}>
          
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
                    Verified 49-column Store Vendor Master format
                  </span>
                </div>
              </div>
              <span style={{ fontSize: '10px', fontWeight: 800, color: '#2563EB', background: '#DBEAFE', padding: '2px 8px', borderRadius: '4px' }}>
                49 Columns
              </span>
            </div>

            {/* Target Hospital Selector for Download */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
              <label style={{ fontSize: '11px', fontWeight: 800, color: '#475569', textTransform: 'uppercase' }}>
                Source Scope / Target Hospital:
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
                <option value="">Global Master (All Canonical Vendors / Reference)</option>
                {hospitals.map(h => (
                  <option key={h.code || h.hospitalId} value={h.code || h.hospitalId}>
                    {h.name} ({h.code || h.hospitalId}) — Hospital Associated Vendors
                  </option>
                ))}
              </select>
            </div>

            {/* Information Callout */}
            <div style={{
              background: '#F8FAFC',
              borderRadius: '8px',
              padding: '12px',
              border: '1px solid #E2E8F0',
              display: 'flex',
              flexDirection: 'column',
              gap: '6px',
              fontSize: '11.5px',
              color: '#475569',
              lineHeight: 1.4
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 800, color: '#1E293B' }}>
                <Info size={14} color="#2563EB" />
                Workbook Specifications
              </div>
              <div>• Sheet Name: <strong>Store Vendor Master</strong></div>
              <div>• 49 client-verified columns from Vendor Master registry</div>
              <div>• {downloadHospital ? `Exports only vendors associated with hospital (${downloadHospital})` : 'Exports the full global vendor catalog for reference / onboarding'}</div>
            </div>

            {/* Download Action Button */}
            <div style={{ marginTop: 'auto', paddingTop: '8px' }}>
              <button
                type="button"
                onClick={handleDownload}
                disabled={downloadingVendor}
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
                  cursor: downloadingVendor ? 'not-allowed' : 'pointer',
                  boxShadow: '0 1px 3px rgba(37,99,235,0.2)'
                }}
              >
                {downloadingVendor ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>Preparing Vendor Workbook...</span>
                  </>
                ) : (
                  <>
                    <Download size={15} />
                    <span>Download Vendor Master Excel</span>
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
                    Additive hospital association & vendor onboarding
                  </span>
                </div>
              </div>
              <span style={{ fontSize: '10px', fontWeight: 800, color: '#059669', background: '#D1FAE5', padding: '2px 8px', borderRadius: '4px' }}>
                Non-Destructive
              </span>
            </div>

            {/* Target Hospital Selector for Upload (Required) */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
              <label style={{ fontSize: '11px', fontWeight: 800, color: '#475569', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <span style={{ color: '#DC2626' }}>*</span> Target Hospital:
              </label>
              <select
                value={selectedHospital}
                onChange={(e) => setSelectedHospital(e.target.value)}
                style={{
                  width: '100%',
                  height: '36px',
                  borderRadius: '7px',
                  border: selectedHospital ? '1.5px solid #059669' : '1px solid #CBD5E1',
                  padding: '0 10px',
                  fontSize: '12.5px',
                  fontWeight: 700,
                  color: selectedHospital ? '#0F172A' : '#64748B',
                  background: '#FFFFFF',
                  outline: 'none',
                  cursor: 'pointer'
                }}
              >
                <option value="">-- Select Target Hospital (Required) --</option>
                {hospitals.map(h => (
                  <option key={h.code || h.hospitalId} value={h.code || h.hospitalId}>
                    {h.name} ({h.code || h.hospitalId})
                  </option>
                ))}
              </select>
            </div>

            {/* Architecture Guidelines Badge */}
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
                Ingestion Safeguards
              </div>
              <div>• <strong>Additive Ingestion:</strong> Existing hospital vendors will NOT be deleted.</div>
              <div>• <strong>Unmatched Vendors:</strong> Safely routed to SuperAdmin Approval queue.</div>
            </div>

            {/* Excel Dropzone */}
            <ExcelDropzone
              onFileSelect={(file) => {
                setSelectedFile(file);
                if (selectedHospital) {
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
                disabled={isUploading || !selectedHospital || !selectedFile}
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
                  cursor: (isUploading || !selectedHospital || !selectedFile) ? 'not-allowed' : 'pointer',
                  opacity: (isUploading || !selectedHospital || !selectedFile) ? 0.6 : 1,
                  boxShadow: '0 1px 3px rgba(5,150,105,0.2)'
                }}
              >
                {isUploading ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>Parsing & Matching Vendors...</span>
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

      {/* ══════════════════════════════════════════════════════════════════════════ */}
      {/* VENDOR PREVIEW & CONFIRMATION INLINE VIEW                                  */}
      {/* ══════════════════════════════════════════════════════════════════════════ */}
      {isPreviewOpen && previewData && (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
          width: '100%'
        }}>
          <div style={{
            background: '#FFFFFF',
            borderRadius: '12px',
            border: '1px solid #E2E8F0',
            width: '100%',
            display: 'flex',
            flexDirection: 'column',
            boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
            overflow: 'hidden'
          }}>
            {/* Header */}
            <div style={{
              padding: '16px 20px',
              borderBottom: '1px solid #E2E8F0',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              background: '#F8FAFC'
            }}>
              <div>
                <h3 style={{ fontSize: '15px', fontWeight: 800, color: '#0F172A', margin: 0 }}>
                  Vendor Master Ingestion Preview
                </h3>
                <p style={{ fontSize: '11.5px', color: '#64748B', margin: 0 }}>
                  Target Hospital: <strong>{hospitals.find(h => (h.code || h.hospitalId) === selectedHospital)?.name || selectedHospital}</strong>
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsPreviewOpen(false)}
                style={{ background: 'none', border: 'none', color: '#64748B', cursor: 'pointer', padding: '4px' }}
              >
                <X size={18} />
              </button>
            </div>

            {/* Metrics Ribbon */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(4, 1fr)',
              gap: '8px',
              padding: '12px 20px',
              background: '#F1F5F9',
              borderBottom: '1px solid #E2E8F0'
            }}>
              <div style={{ background: '#FFFFFF', padding: '8px 12px', borderRadius: '6px', border: '1px solid #CBD5E1' }}>
                <span style={{ fontSize: '10px', color: '#64748B', fontWeight: 700, textTransform: 'uppercase' }}>Total Rows</span>
                <div style={{ fontSize: '16px', fontWeight: 800, color: '#0F172A' }}>{previewData.summary?.totalRows || 0}</div>
              </div>
              <div style={{ background: '#FFFFFF', padding: '8px 12px', borderRadius: '6px', border: '1px solid #A7F3D0' }}>
                <span style={{ fontSize: '10px', color: '#059669', fontWeight: 700, textTransform: 'uppercase' }}>Matched Global</span>
                <div style={{ fontSize: '16px', fontWeight: 800, color: '#047857' }}>{previewData.summary?.matchedCount || 0}</div>
              </div>
              <div style={{ background: '#FFFFFF', padding: '8px 12px', borderRadius: '6px', border: '1px solid #DBEAFE' }}>
                <span style={{ fontSize: '10px', color: '#2563EB', fontWeight: 700, textTransform: 'uppercase' }}>Already Associated</span>
                <div style={{ fontSize: '16px', fontWeight: 800, color: '#1D4ED8' }}>{previewData.summary?.alreadyAssociatedCount || 0}</div>
              </div>
              <div style={{ background: '#FFFFFF', padding: '8px 12px', borderRadius: '6px', border: '1px solid #FDE68A' }}>
                <span style={{ fontSize: '10px', color: '#D97706', fontWeight: 700, textTransform: 'uppercase' }}>New Requests (Approval)</span>
                <div style={{ fontSize: '16px', fontWeight: 800, color: '#B45309' }}>{previewData.summary?.unmatchedCount || 0}</div>
              </div>
            </div>

            {/* Rows Table Preview */}
            <div style={{ padding: '16px 20px', overflowY: 'auto', flex: 1 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11.5px' }}>
                <thead>
                  <tr style={{ background: '#F8FAFC', borderBottom: '1px solid #E2E8F0', textAlign: 'left', color: '#475569', fontWeight: 750 }}>
                    <th style={{ padding: '8px' }}>#</th>
                    <th style={{ padding: '8px' }}>Vendor / Supplier Name</th>
                    <th style={{ padding: '8px' }}>GST / Tax ID</th>
                    <th style={{ padding: '8px' }}>Match Status</th>
                    <th style={{ padding: '8px' }}>Target Action</th>
                  </tr>
                </thead>
                <tbody>
                  {(previewData.rows || []).slice(0, 50).map((r, idx) => (
                    <tr key={idx} style={{ borderBottom: '1px solid #F1F5F9' }}>
                      <td style={{ padding: '8px', color: '#64748B' }}>{r.rowNumber}</td>
                      <td style={{ padding: '8px', fontWeight: 700, color: '#0F172A' }}>{r.supplierName}</td>
                      <td style={{ padding: '8px', color: '#475569', fontFamily: 'monospace' }}>{r.vendorData?.gstNo || '—'}</td>
                      <td style={{ padding: '8px' }}>
                        {r.matchType === 'MATCHED_GLOBAL' ? (
                          <span style={{ background: '#D1FAE5', color: '#065F46', padding: '2px 6px', borderRadius: '4px', fontWeight: 700, fontSize: '10px' }}>
                            Matched [{r.matchedSupplierCode}]
                          </span>
                        ) : (
                          <span style={{ background: '#FEF3C7', color: '#92400E', padding: '2px 6px', borderRadius: '4px', fontWeight: 700, fontSize: '10px' }}>
                            Unmatched (New)
                          </span>
                        )}
                      </td>
                      <td style={{ padding: '8px' }}>
                        {r.matchType === 'MATCHED_GLOBAL' ? (
                          r.isAlreadyAssociated ? (
                            <span style={{ color: '#64748B', fontSize: '11px' }}>Already Associated (Retained)</span>
                          ) : (
                            <span style={{ color: '#059669', fontWeight: 700, fontSize: '11px' }}>+ Add to Hospital</span>
                          )
                        ) : (
                          <span style={{ color: '#D97706', fontWeight: 700, fontSize: '11px' }}>&rsaquo; Route to Approval</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {(previewData.rows || []).length > 50 && (
                <div style={{ textAlign: 'center', padding: '10px', color: '#64748B', fontSize: '11px' }}>
                  Showing first 50 rows of {previewData.rows.length} total rows.
                </div>
              )}
            </div>

            {/* Modal Actions */}
            <div style={{
              padding: '14px 20px',
              borderTop: '1px solid #E2E8F0',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              background: '#F8FAFC'
            }}>
              <span style={{ fontSize: '11.5px', color: '#64748B' }}>
                Ingestion is non-destructive. Hospital associations are additive.
              </span>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  type="button"
                  onClick={() => setIsPreviewOpen(false)}
                  disabled={isImporting}
                  style={{
                    padding: '7px 14px',
                    borderRadius: '6px',
                    border: '1px solid #CBD5E1',
                    background: '#FFFFFF',
                    fontSize: '12px',
                    fontWeight: 700,
                    color: '#475569',
                    cursor: 'pointer'
                  }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleConfirmImport}
                  disabled={isImporting}
                  style={{
                    padding: '7px 18px',
                    borderRadius: '6px',
                    border: 'none',
                    background: '#059669',
                    fontSize: '12px',
                    fontWeight: 750,
                    color: '#FFFFFF',
                    cursor: isImporting ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    boxShadow: '0 1px 3px rgba(5,150,105,0.2)'
                  }}
                >
                  {isImporting ? (
                    <>
                      <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      <span>Ingesting Vendors...</span>
                    </>
                  ) : (
                    <>
                      <Check size={14} />
                      <span>Confirm & Ingest Vendors</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
