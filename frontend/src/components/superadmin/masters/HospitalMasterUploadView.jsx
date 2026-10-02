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
  ChevronRight
} from 'lucide-react';
import UploadContextSelector from './UploadContextSelector';
import ExcelDropzone from './ExcelDropzone';
import ImportPreviewModal from './ImportPreviewModal';
import ImportResultSummary from './ImportResultSummary';
import { getApiUrl } from '../../../utils/api';

export default function HospitalMasterUploadView({ onSwitchTab }) {
  const [hospitals, setHospitals] = useState([]);
  const [loadingHospitals, setLoadingHospitals] = useState(false);

  // Upload Context
  const [selectedHospital, setSelectedHospital] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [selectedDepartment, setSelectedDepartment] = useState('');

  // Dropzone and Parsing
  const [selectedFile, setSelectedFile] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const [downloadingTemplate, setDownloadingTemplate] = useState(false);
  const [error, setError] = useState('');

  // Preview Modal
  const [previewData, setPreviewData] = useState(null);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [isImporting, setIsImporting] = useState(false);

  // Final Ingestion Result
  const [importResult, setImportResult] = useState(null);

  // Audit History
  const [history, setHistory] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  // Fetch Hospitals
  useEffect(() => {
    let isMounted = true;
    const fetchHospitals = async () => {
      try {
        setLoadingHospitals(true);
        const token = localStorage.getItem('token');
        const res = await fetch(getApiUrl('/superadmin/masters/hospitals-list'), {
          headers: token ? { Authorization: `Bearer ${token}` } : {}
        });
        const contentType = res.headers.get('content-type') || '';
        if (!contentType.includes('application/json')) {
          throw new Error(`Non-JSON response (Status ${res.status})`);
        }
        const data = await res.json();
        if (isMounted && data.success && Array.isArray(data.data)) {
          setHospitals(data.data);
        }
      } catch (err) {
        console.error('[UPLOAD VIEW] Load hospitals error:', err);
      } finally {
        if (isMounted) setLoadingHospitals(false);
      }
    };
    fetchHospitals();
    return () => { isMounted = false; };
  }, []);

  // Selection Dependency Handlers (Hospital -> Category -> Department)
  const handleHospitalChange = (hospCode) => {
    setSelectedHospital(hospCode);
    setSelectedCategory('');
    setSelectedDepartment('');
    setSelectedFile(null);
    setPreviewData(null);
    setIsPreviewOpen(false);
    setError('');
  };

  const handleCategoryChange = (catName) => {
    setSelectedCategory(catName);
    setSelectedDepartment('');
    setSelectedFile(null);
    setPreviewData(null);
    setIsPreviewOpen(false);
    setError('');
  };

  const handleDepartmentChange = (deptName) => {
    setSelectedDepartment(deptName);
    setSelectedFile(null);
    setPreviewData(null);
    setIsPreviewOpen(false);
    setError('');
  };

  // Fetch Audit History
  const fetchHistory = useCallback(async () => {
    try {
      setLoadingHistory(true);
      const token = localStorage.getItem('token');
      const url = selectedHospital 
        ? `/superadmin/masters/upload/history?tenantId=${encodeURIComponent(selectedHospital)}&limit=10`
        : '/superadmin/masters/upload/history?limit=10';
      const res = await fetch(getApiUrl(url), {
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      });
      const contentType = res.headers.get('content-type') || '';
      if (!contentType.includes('application/json')) {
        throw new Error(`Non-JSON response (Status ${res.status})`);
      }
      const data = await res.json();
      if (data.success && Array.isArray(data.data)) {
        setHistory(data.data);
      }
    } catch (err) {
      console.error('[UPLOAD VIEW] Load audit history error:', err);
    } finally {
      setLoadingHistory(false);
    }
  }, [selectedHospital]);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  // Handle Download Template with JWT Bearer Token
  const handleDownloadTemplate = async () => {
    if (!selectedHospital) {
      setError('Please select a target hospital first.');
      return;
    }
    if (!selectedCategory) {
      setError('Please select a category to download its exact template.');
      return;
    }
    if (selectedCategory === 'Radiology') {
      setError('Radiology template unavailable: Category remains SOURCE-CONFIRMATION-REQUIRED.');
      return;
    }

    try {
      setDownloadingTemplate(true);
      setError('');
      const token = localStorage.getItem('token');
      let url = `/superadmin/masters/upload/template?category=${encodeURIComponent(selectedCategory)}`;
      if (selectedDepartment) {
        url += `&department=${encodeURIComponent(selectedDepartment)}`;
      }

      const res = await fetch(getApiUrl(url), {
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || `Download failed (${res.status})`);
      }

      const blob = await res.blob();
      const safeFilename = `${selectedCategory.replace(/\s+/g, '_')}_Master_Template.xlsx`;
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = safeFilename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(link.href);
    } catch (err) {
      setError(err.message || 'Error downloading Excel template');
    } finally {
      setDownloadingTemplate(false);
    }
  };

  // Handle File Selection and Parsing
  const handleParsePreview = async (fileToUpload) => {
    const file = fileToUpload || selectedFile;
    if (!file) {
      setError('Please select an Excel workbook (.xlsx or .xls) to upload.');
      return;
    }
    if (!selectedHospital) {
      setError('Please select a target hospital.');
      return;
    }
    if (!selectedCategory) {
      setError('Please select a master category.');
      return;
    }
    if (selectedCategory === 'Radiology') {
      setError('Radiology uploads are blocked: Category remains SOURCE-CONFIRMATION-REQUIRED.');
      return;
    }

    try {
      setError('');
      setIsUploading(true);

      const formData = new FormData();
      formData.append('file', file);
      formData.append('tenantId', selectedHospital);
      formData.append('category', selectedCategory);
      if (selectedDepartment) {
        formData.append('department', selectedDepartment);
      }

      const token = localStorage.getItem('token');
      const res = await fetch(getApiUrl('/superadmin/masters/upload/parse-preview'), {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData
      });
      const contentType = res.headers.get('content-type') || '';
      if (!contentType.includes('application/json')) {
        throw new Error(`Non-JSON response (Status ${res.status})`);
      }
      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || data.message || 'Failed to parse workbook for preview');
      }

      setPreviewData(data.data || data);
      setIsPreviewOpen(true);
    } catch (err) {
      console.error('[UPLOAD VIEW] Parse preview error:', err);
      setError(err.message || 'Error processing Excel file');
    } finally {
      setIsUploading(false);
    }
  };

  // Handle Ingestion Confirmation
  const handleConfirmImport = async ({ sessionId, allowRepricing, ambiguousResolutions }) => {
    try {
      setIsImporting(true);
      setError('');

      const token = localStorage.getItem('token');
      const res = await fetch(getApiUrl('/superadmin/masters/upload/confirm-import'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify({
          sessionId: sessionId || previewData?.previewId,
          previewId: sessionId || previewData?.previewId,
          tenantId: selectedHospital,
          category: selectedCategory,
          department: selectedDepartment,
          allowRepricing,
          ambiguousResolutions
        })
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || data.message || 'Catalog ingestion failed');
      }

      // Close modal and display result
      setIsPreviewOpen(false);
      setPreviewData(null);
      setSelectedFile(null);
      setImportResult(data.data || data);

      // Refresh recent audit history
      fetchHistory();
    } catch (err) {
      console.error('[UPLOAD VIEW] Confirm import error:', err);
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
      {/* Compact Top Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '10px 16px',
        background: '#FFFFFF',
        borderRadius: '10px',
        border: '1px solid #E2E8F0',
        boxShadow: '0 1px 2px rgba(0,0,0,0.02)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{
            width: '32px',
            height: '32px',
            borderRadius: '8px',
            background: 'linear-gradient(135deg, #0F766E 0%, #0D9488 100%)',
            color: '#FFFFFF',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 1px 3px rgba(13,148,136,0.2)'
          }}>
            <Upload size={16} />
          </div>
          <div>
            <h2 style={{ fontSize: '13.5px', fontWeight: 800, color: '#0F172A', margin: 0 }}>
              Hospital Master Uploads & Catalog Import
            </h2>
            <p style={{ fontSize: '11px', color: '#64748B', margin: 0 }}>
              Select target hospital, category, and department, download the exact template, and upload the completed Excel workbook.
            </p>
          </div>
        </div>
      </div>

      {/* Error Alert */}
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

      {/* Upload & Configuration Section (or Result Summary if complete) */}
      {importResult ? (
        <ImportResultSummary
          result={importResult}
          onReset={handleReset}
          onViewCatalog={onSwitchTab ? () => onSwitchTab('hospital-pricing') : null}
        />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {/* Step 1-3: Context Selection (Hospital -> Category -> Department) */}
          <UploadContextSelector
            hospitals={hospitals}
            selectedHospital={selectedHospital}
            onChangeHospital={handleHospitalChange}
            selectedCategory={selectedCategory}
            onChangeCategory={handleCategoryChange}
            selectedDepartment={selectedDepartment}
            onChangeDepartment={handleDepartmentChange}
            onDownloadTemplate={handleDownloadTemplate}
            downloadingTemplate={downloadingTemplate}
          />

          {/* Step 4: Excel Dropzone */}
          <div style={{
            background: '#FFFFFF',
            border: '1px solid #E2E8F0',
            borderRadius: '12px',
            padding: '16px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.02)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px', flexWrap: 'wrap', gap: '8px' }}>
              <div>
                <h3 style={{ fontSize: '13px', fontWeight: 800, color: '#0F172A', margin: 0 }}>
                  Step 4: Upload Completed Hospital Workbook (.xlsx / .xls)
                </h3>
                <p style={{ fontSize: '11px', color: '#64748B', margin: 0 }}>
                  Headers must strictly match the verified client schema for {selectedCategory || 'the selected category'}.
                </p>
              </div>
              {selectedFile && (
                <button
                  type="button"
                  onClick={() => handleParsePreview(selectedFile)}
                  disabled={isUploading || !selectedHospital || !selectedCategory}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '6px 14px',
                    fontSize: '12px',
                    fontWeight: 700,
                    color: '#FFFFFF',
                    background: '#2563EB',
                    borderRadius: '6px',
                    border: 'none',
                    cursor: (isUploading || !selectedHospital || !selectedCategory) ? 'not-allowed' : 'pointer',
                    boxShadow: '0 1px 2px rgba(37,99,235,0.2)',
                    opacity: (isUploading || !selectedHospital || !selectedCategory) ? 0.6 : 1
                  }}
                >
                  {isUploading ? (
                    <>
                      <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      <span>Parsing & Matching...</span>
                    </>
                  ) : (
                    <>
                      <span>Inspect & Preview Match</span>
                      <ArrowRight size={13} />
                    </>
                  )}
                </button>
              )}
            </div>

            <ExcelDropzone
              onFileSelect={(file) => {
                setSelectedFile(file);
                if (selectedHospital && selectedCategory) {
                  handleParsePreview(file);
                }
              }}
              isUploading={isUploading}
              selectedFile={selectedFile}
              onClearFile={() => setSelectedFile(null)}
            />
          </div>
        </div>
      )}

      {/* Step 3: Server-Authoritative Preview Modal */}
      <ImportPreviewModal
        isOpen={isPreviewOpen}
        onClose={() => setIsPreviewOpen(false)}
        previewData={previewData}
        onConfirmImport={handleConfirmImport}
        isImporting={isImporting}
      />

      {/* Recent Upload Audit History */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
        <div className="flex items-center justify-between mb-4 border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2">
            <History className="w-4 h-4 text-slate-500" />
            <h3 className="text-sm font-bold text-slate-800">
              Recent Hospital Catalog Ingestion History
            </h3>
          </div>
          <button
            type="button"
            onClick={fetchHistory}
            disabled={loadingHistory}
            className="flex items-center gap-1.5 text-xs text-slate-600 hover:text-slate-900 font-medium px-2.5 py-1 rounded-lg border border-slate-200 hover:bg-slate-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loadingHistory ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>

        {history.length === 0 ? (
          <div className="text-center py-8 text-slate-400 text-xs italic">
            No hospital upload history found for this view.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-200">
                <tr>
                  <th className="py-2.5 px-3">Batch ID / Timestamp</th>
                  <th className="py-2.5 px-3">Hospital</th>
                  <th className="py-2.5 px-3">Category & Scope</th>
                  <th className="py-2.5 px-3">Original File</th>
                  <th className="py-2.5 px-3 text-center">Assigned / Repriced</th>
                  <th className="py-2.5 px-3 text-center">Retained / Skipped</th>
                  <th className="py-2.5 px-3 text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-normal text-slate-700">
                {history.map((item) => (
                  <tr key={item._id || item.batchId} className="hover:bg-slate-50/70">
                    <td className="py-2.5 px-3">
                      <div className="font-mono text-[11px] font-bold text-slate-800">
                        {item.batchId?.substring(0, 10)}...
                      </div>
                      <div className="text-[10px] text-slate-400 flex items-center gap-1 mt-0.5">
                        <Calendar className="w-3 h-3" />
                        {item.createdAt ? new Date(item.createdAt).toLocaleString() : '—'}
                      </div>
                    </td>
                    <td className="py-2.5 px-3 font-medium text-slate-900">
                      {item.hospitalName || item.tenantId}
                    </td>
                    <td className="py-2.5 px-3">
                      <span className="font-semibold text-slate-800">{item.category}</span>
                      {item.department && (
                        <span className="text-slate-500 block text-[11px]">
                          Dept: {item.department}
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 px-3 font-mono text-[11px] text-slate-600 truncate max-w-[160px]">
                      {item.sourceFilename}
                    </td>
                    <td className="py-2.5 px-3 text-center font-mono">
                      <span className="text-emerald-700 font-bold">{item.createdCount || 0}</span>
                      {' / '}
                      <span className="text-purple-700 font-bold">{item.repricedCount || 0}</span>
                    </td>
                    <td className="py-2.5 px-3 text-center font-mono">
                      <span className="text-slate-600">{item.retainedCount || 0}</span>
                      {' / '}
                      <span className="text-rose-600 font-bold">{item.skippedCount || 0}</span>
                    </td>
                    <td className="py-2.5 px-3 text-right">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        item.status === 'SUCCESS' 
                          ? 'bg-emerald-100 text-emerald-800' 
                          : item.status === 'PARTIAL'
                          ? 'bg-amber-100 text-amber-800'
                          : 'bg-rose-100 text-rose-800'
                      }`}>
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
