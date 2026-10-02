import React, { useState } from 'react';
import { 
  X, 
  Upload, 
  Clock, 
  AlertTriangle, 
  CheckCircle, 
  ShieldCheck, 
  Layers, 
  Building2,
  FileCheck2
} from 'lucide-react';
import MatchSummaryCards from './MatchSummaryCards';
import PreviewDataTable from './PreviewDataTable';

export default function ImportPreviewModal({
  isOpen,
  onClose,
  previewData,
  onConfirmImport,
  isImporting
}) {
  const [activeFilter, setActiveFilter] = useState('ALL');
  const [allowRepricing, setAllowRepricing] = useState(false);
  const [ambiguousResolutions, setAmbiguousResolutions] = useState({});

  if (!isOpen || !previewData) return null;

  const {
    sessionId,
    filename,
    tenant,
    category,
    department,
    summary,
    previewRows = [],
    expiresAt
  } = previewData;

  const handleResolveAmbiguous = (rowNumber, masterItemId) => {
    setAmbiguousResolutions(prev => ({
      ...prev,
      [rowNumber]: masterItemId
    }));
  };

  const ambiguousCount = summary?.ambiguous || 0;
  const resolvedCount = Object.keys(ambiguousResolutions).filter(k => !!ambiguousResolutions[k]).length;
  const unresolvedAmbiguous = Math.max(0, ambiguousCount - resolvedCount);

  const handleConfirm = () => {
    // Format ambiguousResolutions array for API
    const formattedResolutions = Object.entries(ambiguousResolutions)
      .filter(([_, id]) => !!id)
      .map(([rowNum, id]) => ({
        rowNumber: parseInt(rowNum, 10),
        selectedMasterItemId: id
      }));

    onConfirmImport({
      sessionId,
      allowRepricing,
      ambiguousResolutions: formattedResolutions
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-6xl max-h-[92vh] flex flex-col overflow-hidden border border-slate-200">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between flex-shrink-0">
          <div>
            <div className="flex items-center gap-2">
              <span className="p-1.5 bg-primary-100 text-primary-700 rounded-lg">
                <FileCheck2 className="w-5 h-5" />
              </span>
              <h2 className="text-lg font-bold text-slate-800">
                Hospital Catalog Import Preview
              </h2>
              <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300">
                Server-Authoritative Session
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500 mt-1 font-medium">
              <span className="flex items-center gap-1">
                <Building2 className="w-3.5 h-3.5 text-slate-400" />
                Hospital: <strong className="text-slate-700">{tenant?.name || tenant?.id}</strong> ({tenant?.code || '—'})
              </span>
              <span>•</span>
              <span className="flex items-center gap-1">
                <Layers className="w-3.5 h-3.5 text-slate-400" />
                Category: <strong className="text-slate-700">{category}</strong>
              </span>
              {department && (
                <>
                  <span>•</span>
                  <span>Dept: <strong className="text-slate-700">{department}</strong></span>
                </>
              )}
              <span>•</span>
              <span className="text-slate-400">File: {filename}</span>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isImporting}
            className="p-2 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-200/60 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto space-y-5 flex-1">
          {/* Expiration and Session Notice */}
          <div className="flex items-center justify-between text-xs bg-blue-50 border border-blue-200 rounded-xl px-4 py-2.5 text-blue-800">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-blue-600 flex-shrink-0" />
              <span>
                Session is locked for validation. Expires at{' '}
                <strong>{expiresAt ? new Date(expiresAt).toLocaleTimeString() : 'in 1 hour'}</strong>.
              </span>
            </div>
            <span className="text-slate-500 font-mono text-[11px]">
              ID: {sessionId?.substring(0, 12)}...
            </span>
          </div>

          {/* Metric Summary Cards */}
          <MatchSummaryCards
            summary={summary}
            activeFilter={activeFilter}
            onSelectFilter={setActiveFilter}
          />

          {/* Repricing Policy Control & Ambiguous Notice */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Repricing Policy Box */}
            <div className={`p-4 rounded-xl border transition-colors ${
              allowRepricing 
                ? 'bg-purple-50/50 border-purple-200 ring-1 ring-purple-300' 
                : 'bg-slate-50 border-slate-200'
            }`}>
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={allowRepricing}
                  onChange={(e) => setAllowRepricing(e.target.checked)}
                  className="mt-0.5 h-4 w-4 text-purple-600 focus:ring-purple-500 border-slate-300 rounded cursor-pointer"
                />
                <div>
                  <span className="text-xs font-bold text-slate-800 block">
                    Allow Repricing of Existing Hospital Catalog Items
                  </span>
                  <p className="text-[11px] text-slate-500 mt-0.5 leading-snug">
                    {allowRepricing ? (
                      <span className="text-purple-700 font-semibold">
                        Enabled: Imported prices will overwrite existing hospital catalog prices for matching items ({summary?.repricingDiffs || 0} items affected).
                      </span>
                    ) : (
                      <span>
                        Disabled: Existing hospital catalog prices remain strictly frozen and untouched.
                      </span>
                    )}
                  </p>
                </div>
              </label>
            </div>

            {/* Ambiguous Resolution Notice */}
            <div className="p-4 rounded-xl border border-amber-200 bg-amber-50/50 flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
              <div className="text-xs">
                <span className="font-bold text-amber-900 block">
                  Ambiguous Matches: {ambiguousCount} Row(s)
                </span>
                <p className="text-[11px] text-amber-800 mt-0.5 leading-snug">
                  {unresolvedAmbiguous > 0 ? (
                    <>
                      <strong className="text-amber-900">{unresolvedAmbiguous}</strong> row(s) still require selection. Unresolved ambiguous rows will be automatically skipped during import.
                    </>
                  ) : ambiguousCount > 0 ? (
                    <span className="text-emerald-700 font-semibold">
                      ✓ All ambiguous rows have candidate mappings selected.
                    </span>
                  ) : (
                    <span>No ambiguous rows detected in this workbook.</span>
                  )}
                </p>
              </div>
            </div>
          </div>

          {/* Interactive Data Table */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-600">
                Item Preview & Resolution Table
              </h3>
              {activeFilter !== 'ALL' && (
                <button
                  type="button"
                  onClick={() => setActiveFilter('ALL')}
                  className="text-xs text-primary-600 hover:underline font-semibold"
                >
                  Clear filter (Showing {activeFilter})
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
        </div>

        {/* Footer Actions */}
        <div className="px-6 py-4 border-t border-slate-200 bg-slate-50 flex items-center justify-between flex-shrink-0">
          <button
            type="button"
            onClick={onClose}
            disabled={isImporting}
            className="px-4 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-xl hover:bg-slate-100 transition-colors disabled:opacity-50"
          >
            Discard & Cancel
          </button>
          <div className="flex items-center gap-3">
            <span className="text-xs text-slate-500 font-medium">
              Ready to import <strong className="text-slate-800 font-bold">
                {(summary?.exactMatch || 0) + (summary?.safeMatch || 0) + resolvedCount}
              </strong> items
            </span>
            <button
              type="button"
              onClick={handleConfirm}
              disabled={isImporting || ((summary?.exactMatch || 0) + (summary?.safeMatch || 0) + resolvedCount === 0)}
              className="flex items-center gap-2 px-5 py-2 text-xs font-bold text-white bg-primary-600 hover:bg-primary-700 rounded-xl shadow-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isImporting ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>Importing Catalog...</span>
                </>
              ) : (
                <>
                  <ShieldCheck className="w-4 h-4" />
                  <span>Confirm & Import Hospital Catalog</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
