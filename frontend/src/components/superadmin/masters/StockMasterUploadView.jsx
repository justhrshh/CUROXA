import { getAccessToken } from '../../../utils/authTokenStore';
import React, { useState, useEffect } from 'react';
import { 
  Boxes, 
  Download, 
  Upload, 
  AlertCircle, 
  Info, 
  ShieldCheck, 
  Layers, 
  CheckCircle2, 
  Building2,
  FileSpreadsheet,
  Check,
  X,
  AlertTriangle
} from 'lucide-react';
import ExcelDropzone from './ExcelDropzone';
import { getApiUrl } from '../../../utils/api';

export default function StockMasterUploadView({ onSwitchTab }) {
  const [hospitals, setHospitals] = useState([]);
  const [selectedHospital, setSelectedHospital] = useState('');
  const [selectedFile, setSelectedFile] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isDownloadingTemplate, setIsDownloadingTemplate] = useState(false);
  const [isExportingStock, setIsExportingStock] = useState(false);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  // Preview & Confirm State
  const [previewData, setPreviewData] = useState(null);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [importResult, setImportResult] = useState(null);

  // Fetch hospitals
  useEffect(() => {
    let isMounted = true;
    const fetchHospitals = async () => {
      try {
        const token = (getAccessToken() || localStorage.getItem('token'));
        const res = await fetch(getApiUrl('/superadmin/masters/hospitals-list'), {
          headers: token ? { Authorization: `Bearer ${token}` } : {}
        });
        const data = await res.json();
        if (isMounted && data.success && Array.isArray(data.data)) {
          setHospitals(data.data);
          if (data.data.length > 0 && !selectedHospital) {
            setSelectedHospital(data.data[0].code || data.data[0].hospitalId);
          }
        }
      } catch (err) {
        console.error('Failed to load hospitals for stock master:', err);
      }
    };
    fetchHospitals();
    return () => { isMounted = false; };
  }, []);

  // Download Empty Template
  const handleDownloadTemplate = async () => {
    if (!selectedHospital) {
      setError('Please select a target clinic first.');
      return;
    }
    try {
      setIsDownloadingTemplate(true);
      setError('');
      const token = (getAccessToken() || localStorage.getItem('token'));
      const res = await fetch(getApiUrl(`/superadmin/masters/upload/stock/template?tenantId=${encodeURIComponent(selectedHospital)}`), {
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || 'Failed to download Stock Master template.');
      }

      const blob = await res.blob();
      const filename = `Stock_Master_Template_${selectedHospital}.xlsx`;
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(link.href);
      setSuccessMessage('Empty Stock Master template downloaded successfully.');
      setTimeout(() => setSuccessMessage(''), 4000);
    } catch (err) {
      setError(err.message || 'Error downloading template.');
    } finally {
      setIsDownloadingTemplate(false);
    }
  };

  // Export Current Hospital Stock
  const handleExportStock = async () => {
    if (!selectedHospital) {
      setError('Please select a target clinic first.');
      return;
    }
    try {
      setIsExportingStock(true);
      setError('');
      const token = (getAccessToken() || localStorage.getItem('token'));
      const res = await fetch(getApiUrl(`/superadmin/masters/upload/stock/download?tenantId=${encodeURIComponent(selectedHospital)}`), {
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || 'Failed to export current stock.');
      }

      const blob = await res.blob();
      const filename = `Stock_Master_${selectedHospital}_${new Date().toISOString().split('T')[0]}.xlsx`;
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(link.href);
      setSuccessMessage('Current clinic stock exported successfully.');
      setTimeout(() => setSuccessMessage(''), 4000);
    } catch (err) {
      setError(err.message || 'Error exporting stock.');
    } finally {
      setIsExportingStock(false);
    }
  };

  // Upload & Validate Preview
  const handleUploadPreview = async (fileToUpload) => {
    const file = fileToUpload || selectedFile;
    if (!selectedHospital) {
      setError('Please select a target clinic first.');
      return;
    }
    if (!file) {
      setError('Please select a completed Stock Master Excel workbook to upload.');
      return;
    }

    try {
      setError('');
      setIsUploading(true);

      const formData = new FormData();
      formData.append('file', file);
      formData.append('tenantId', selectedHospital);

      const token = (getAccessToken() || localStorage.getItem('token'));
      const res = await fetch(getApiUrl('/superadmin/masters/upload/stock/parse-preview'), {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to parse and validate Stock Master workbook.');
      }

      setPreviewData(data);
      setIsPreviewOpen(true);
    } catch (err) {
      setError(err.message || 'Validation error.');
    } finally {
      setIsUploading(false);
    }
  };

  // Confirm Import
  const handleConfirmImport = async () => {
    if (!previewData || !previewData.rows) return;
    try {
      setIsImporting(true);
      setError('');
      const token = (getAccessToken() || localStorage.getItem('token'));
      const res = await fetch(getApiUrl('/superadmin/masters/upload/stock/confirm'), {
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
        throw new Error(data.error || 'Failed to commit stock import.');
      }

      setImportResult(data);
      setIsPreviewOpen(false);
      setSelectedFile(null);
      setSuccessMessage(data.message || 'Stock Master successfully imported!');
      setTimeout(() => setSuccessMessage(''), 6000);
    } catch (err) {
      setError(err.message || 'Import failed.');
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'clamp(14px, 2vh, 24px)', paddingBottom: 'clamp(20px, 3vh, 40px)' }}>
      {/* Messages */}
      {error && (
        <div style={{
          padding: '12px 16px',
          borderRadius: '8px',
          background: '#FEF2F2',
          border: '1px solid #FCA5A5',
          color: '#991B1B',
          fontSize: '12.5px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <AlertCircle size={16} color="#DC2626" />
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

      {successMessage && (
        <div style={{
          padding: '12px 16px',
          borderRadius: '8px',
          background: '#F0FDF4',
          border: '1px solid #86EFAC',
          color: '#166534',
          fontSize: '12.5px',
          display: 'flex',
          alignItems: 'center',
          gap: '8px'
        }}>
          <CheckCircle2 size={16} color="#16A34A" />
          <span style={{ fontWeight: 700 }}>{successMessage}</span>
        </div>
      )}

      {/* Target Clinic Selector Strip */}
      <div style={{
        background: '#FFFFFF',
        borderRadius: '10px',
        border: '1px solid #E2E8F0',
        padding: '12px 18px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '12px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: '#F0FDF4', color: '#16A34A', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Building2 size={16} />
          </div>
          <div>
            <h4 style={{ fontSize: '13px', fontWeight: 800, color: '#0F172A', margin: 0 }}>
              Clinic Inventory Scope
            </h4>
            <span style={{ fontSize: '11px', color: '#64748B' }}>
              Stock Master imports physical inventory into the selected clinic's ledger.
            </span>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: '280px' }}>
          <label style={{ fontSize: '11px', fontWeight: 800, color: '#475569', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>
            Target Clinic:
          </label>
          <select
            value={selectedHospital}
            onChange={(e) => {
              setSelectedHospital(e.target.value);
              setPreviewData(null);
            }}
            style={{
              flex: 1,
              height: '36px',
              borderRadius: '7px',
              border: selectedHospital ? '1.5px solid #16A34A' : '1px solid #CBD5E1',
              padding: '0 10px',
              fontSize: '12.5px',
              fontWeight: 700,
              color: selectedHospital ? '#0F172A' : '#64748B',
              background: '#FFFFFF',
              outline: 'none',
              cursor: 'pointer'
            }}
          >
            <option value="">-- Select Target Clinic --</option>
            {hospitals.map(h => (
              <option key={h.code || h.hospitalId} value={h.code || h.hospitalId}>
                {h.name} ({h.code || h.hospitalId})
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Main Two-Section Workflow: Download vs Upload */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: 'clamp(14px, 2vh, 24px)' }}>
        
        {/* SECTION A — DOWNLOAD TEMPLATE & EXPORT */}
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
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #F1F5F9', paddingBottom: '10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div style={{ width: '30px', height: '30px', borderRadius: '7px', background: '#F0FDF4', color: '#16A34A', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Download size={16} />
              </div>
              <div>
                <h3 style={{ fontSize: '13.5px', fontWeight: 800, color: '#0F172A', margin: 0 }}>
                  SECTION A — EMPTY TEMPLATE & EXPORT
                </h3>
                <span style={{ fontSize: '11px', color: '#64748B' }}>
                  Client stock intake format with approved headers
                </span>
              </div>
            </div>
            <span style={{ fontSize: '10px', fontWeight: 800, color: '#16A34A', background: '#DCFCE7', padding: '2px 8px', borderRadius: '4px' }}>
              No Demo Data
            </span>
          </div>

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
              <Info size={14} color="#16A34A" />
              Approved Stock Master Architecture
            </div>
            <div>• <strong>Empty Template:</strong> Contains only approved headers. No fake inventory rows or fabricated prices.</div>
            <div>• <strong>Canonical Reference:</strong> Item Code references Clinic Master Catalog. Unlisted items cannot be imported.</div>
            <div>• <strong>Pricing Rule:</strong> Captures Buying Price and MRP. Buying Price must be ≤ MRP.</div>
            <div>• <strong>Selling Price:</strong> Determined exclusively at Dispense (Selling Price = MRP - Discount).</div>
          </div>

          <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: '10px', paddingTop: '8px' }}>
            <button
              type="button"
              onClick={handleDownloadTemplate}
              disabled={!selectedHospital || isDownloadingTemplate}
              style={{
                width: '100%',
                height: '40px',
                borderRadius: '7px',
                border: 'none',
                background: '#16A34A',
                color: '#FFFFFF',
                fontSize: '12.5px',
                fontWeight: 750,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                cursor: !selectedHospital ? 'not-allowed' : 'pointer',
                opacity: (!selectedHospital || isDownloadingTemplate) ? 0.6 : 1,
                boxShadow: '0 1px 3px rgba(22,163,74,0.2)'
              }}
            >
              <Download size={15} />
              <span>{isDownloadingTemplate ? 'Generating Template...' : 'Download Empty Stock Master Template'}</span>
            </button>

            <button
              type="button"
              onClick={handleExportStock}
              disabled={!selectedHospital || isExportingStock}
              style={{
                width: '100%',
                height: '36px',
                borderRadius: '7px',
                border: '1px solid #CBD5E1',
                background: '#FFFFFF',
                color: '#334155',
                fontSize: '12px',
                fontWeight: 700,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                cursor: !selectedHospital ? 'not-allowed' : 'pointer',
                opacity: (!selectedHospital || isExportingStock) ? 0.6 : 1
              }}
            >
              <FileSpreadsheet size={14} />
              <span>{isExportingStock ? 'Exporting...' : 'Export Current Clinic Stock (.xlsx)'}</span>
            </button>
          </div>
        </div>

        {/* SECTION B — UPLOAD COMPLETED WORKBOOK */}
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
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #F1F5F9', paddingBottom: '10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div style={{ width: '30px', height: '30px', borderRadius: '7px', background: '#F0FDF4', color: '#16A34A', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Upload size={16} />
              </div>
              <div>
                <h3 style={{ fontSize: '13.5px', fontWeight: 800, color: '#0F172A', margin: 0 }}>
                  SECTION B — UPLOAD STOCK MASTER
                </h3>
                <span style={{ fontSize: '11px', color: '#64748B' }}>
                  Client filled inventory workbook ingestion
                </span>
              </div>
            </div>
            <span style={{ fontSize: '10px', fontWeight: 800, color: '#16A34A', background: '#DCFCE7', padding: '2px 8px', borderRadius: '4px' }}>
              Strict Validation
            </span>
          </div>

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
              <ShieldCheck size={14} color="#16A34A" />
              Pre-Commit Validation Checks
            </div>
            <div>• Validates Item Code exists in current clinic's approved catalog.</div>
            <div>• Rejects Buying Price &gt; MRP violations automatically.</div>
            <div>• Enforces expiry dates are in the future and batches are valid.</div>
          </div>

          {/* Excel Dropzone */}
          <ExcelDropzone
            onFileSelect={(file) => {
              setSelectedFile(file);
              handleUploadPreview(file);
            }}
            isUploading={isUploading}
            selectedFile={selectedFile}
            onClearFile={() => {
              setSelectedFile(null);
              setPreviewData(null);
            }}
          />

          <div style={{ marginTop: 'auto', paddingTop: '4px' }}>
            <button
              type="button"
              onClick={() => handleUploadPreview(selectedFile)}
              disabled={!selectedHospital || !selectedFile || isUploading}
              style={{
                width: '100%',
                height: '40px',
                borderRadius: '7px',
                border: 'none',
                background: '#16A34A',
                color: '#FFFFFF',
                fontSize: '12.5px',
                fontWeight: 750,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                cursor: (!selectedHospital || !selectedFile || isUploading) ? 'not-allowed' : 'pointer',
                opacity: (!selectedHospital || !selectedFile || isUploading) ? 0.6 : 1,
                boxShadow: '0 1px 3px rgba(22,163,74,0.2)'
              }}
            >
              <Upload size={14} />
              <span>{isUploading ? 'Validating Workbook...' : 'Upload & Validate Stock Master'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Validation & Preview Modal */}
      {isPreviewOpen && previewData && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(15, 23, 42, 0.65)',
          backdropFilter: 'blur(4px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          padding: '20px'
        }}>
          <div style={{
            background: '#FFFFFF',
            borderRadius: '16px',
            width: '95%',
            maxWidth: '1100px',
            maxHeight: '90vh',
            display: 'flex',
            flexDirection: 'column',
            boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)',
            border: '1px solid #E2E8F0',
            overflow: 'hidden'
          }}>
            {/* Modal Header */}
            <div style={{
              padding: '18px 24px',
              borderBottom: '1px solid #E2E8F0',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              background: '#F8FAFC'
            }}>
              <div>
                <h3 style={{ fontSize: '16px', fontWeight: 800, color: '#0F172A', margin: 0 }}>
                  Stock Master Ingestion Preview — {selectedHospital}
                </h3>
                <span style={{ fontSize: '12px', color: '#64748B' }}>
                  {previewData.fileName} • {previewData.summary?.totalRows || 0} rows evaluated
                </span>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{
                  padding: '4px 10px',
                  borderRadius: '6px',
                  fontSize: '12px',
                  fontWeight: 750,
                  background: previewData.summary?.isImportable ? '#DCFCE7' : '#FEE2E2',
                  color: previewData.summary?.isImportable ? '#15803D' : '#DC2626'
                }}>
                  {previewData.summary?.isImportable ? '✓ All Rows Valid' : `⚠ ${previewData.summary?.invalidRows} Invalid Row(s)`}
                </span>

                <button
                  type="button"
                  onClick={() => setIsPreviewOpen(false)}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#64748B',
                    fontSize: '18px',
                    fontWeight: 800,
                    cursor: 'pointer',
                    padding: '4px'
                  }}
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Modal Body / Table */}
            <div style={{ padding: '20px', overflowY: 'auto', flex: 1 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                <thead>
                  <tr style={{ background: '#F8FAFC', borderBottom: '1.5px solid #E2E8F0', textAlign: 'left' }}>
                    <th style={{ padding: '8px', color: '#475569', fontWeight: 800 }}>Row</th>
                    <th style={{ padding: '8px', color: '#475569', fontWeight: 800 }}>Item Code</th>
                    <th style={{ padding: '8px', color: '#475569', fontWeight: 800 }}>Item Name</th>
                    <th style={{ padding: '8px', color: '#475569', fontWeight: 800 }}>Batch</th>
                    <th style={{ padding: '8px', color: '#475569', fontWeight: 800 }}>Expiry</th>
                    <th style={{ padding: '8px', color: '#475569', fontWeight: 800, textAlign: 'right' }}>Qty</th>
                    <th style={{ padding: '8px', color: '#475569', fontWeight: 800, textAlign: 'right' }}>Buying Price</th>
                    <th style={{ padding: '8px', color: '#475569', fontWeight: 800, textAlign: 'right' }}>MRP</th>
                    <th style={{ padding: '8px', color: '#475569', fontWeight: 800 }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {(previewData.rows || []).map((row, idx) => (
                    <tr
                      key={idx}
                      style={{
                        borderBottom: '1px solid #F1F5F9',
                        background: !row.isValid ? '#FEF2F2' : 'white'
                      }}
                    >
                      <td style={{ padding: '8px', fontWeight: 700, color: '#64748B' }}>#{row.rowNumber}</td>
                      <td style={{ padding: '8px', fontFamily: 'monospace', fontWeight: 700, color: '#0F172A' }}>{row.itemCode}</td>
                      <td style={{ padding: '8px', fontWeight: 700, color: '#0F172A' }}>
                        <div>{row.itemName}</div>
                        {row.canonicalItemName && row.canonicalItemName !== row.itemName && (
                          <div style={{ fontSize: '10.5px', color: '#64748B' }}>Catalog: {row.canonicalItemName}</div>
                        )}
                      </td>
                      <td style={{ padding: '8px', fontWeight: 650, color: '#334155' }}>{row.batchNumber}</td>
                      <td style={{ padding: '8px', color: '#334155' }}>{row.expiryDate}</td>
                      <td style={{ padding: '8px', textAlign: 'right', fontWeight: 800, color: '#0F172A' }}>{row.quantity}</td>
                      <td style={{ padding: '8px', textAlign: 'right', fontWeight: 700, color: '#334155' }}>₹{row.buyingPrice.toFixed(2)}</td>
                      <td style={{ padding: '8px', textAlign: 'right', fontWeight: 800, color: '#16A34A' }}>₹{row.mrp.toFixed(2)}</td>
                      <td style={{ padding: '8px' }}>
                        {row.isValid ? (
                          <span style={{ color: '#16A34A', fontWeight: 750, display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                            <Check size={13} /> Valid
                          </span>
                        ) : (
                          <div>
                            <span style={{ color: '#DC2626', fontWeight: 750, display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                              <X size={13} /> Error
                            </span>
                            {(row.errors || []).map((err, eIdx) => (
                              <div key={eIdx} style={{ fontSize: '10.5px', color: '#B91C1C', marginTop: '2px', lineHeight: 1.3 }}>
                                • {err}
                              </div>
                            ))}
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Modal Footer */}
            <div style={{
              padding: '16px 24px',
              borderTop: '1px solid #E2E8F0',
              background: '#F8FAFC',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between'
            }}>
              <div style={{ fontSize: '12px', color: '#64748B' }}>
                {previewData.summary?.validRows} valid / {previewData.summary?.invalidRows} invalid. All invalid rows must be resolved before committing.
              </div>

              <div style={{ display: 'flex', gap: '10px' }}>
                <button
                  type="button"
                  onClick={() => setIsPreviewOpen(false)}
                  style={{
                    padding: '8px 16px',
                    borderRadius: '7px',
                    border: '1px solid #CBD5E1',
                    background: 'white',
                    color: '#64748B',
                    fontWeight: 700,
                    fontSize: '12.5px',
                    cursor: 'pointer'
                  }}
                >
                  Cancel
                </button>

                <button
                  type="button"
                  onClick={handleConfirmImport}
                  disabled={!previewData.summary?.isImportable || isImporting}
                  style={{
                    padding: '8px 20px',
                    borderRadius: '7px',
                    border: 'none',
                    background: '#16A34A',
                    color: '#FFFFFF',
                    fontWeight: 750,
                    fontSize: '12.5px',
                    cursor: !previewData.summary?.isImportable ? 'not-allowed' : 'pointer',
                    opacity: (!previewData.summary?.isImportable || isImporting) ? 0.5 : 1
                  }}
                >
                  {isImporting ? 'Importing Inventory...' : 'Confirm & Commit Stock Master'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
