import React from 'react';
import { 
  CheckCircle2, 
  FileCheck, 
  PlusCircle, 
  RefreshCw, 
  ShieldCheck, 
  XCircle, 
  ArrowRight,
  RotateCcw
} from 'lucide-react';

export default function ImportResultSummary({
  result,
  onReset,
  onViewCatalog
}) {
  if (!result) return null;

  const {
    batchId,
    hospitalName,
    category,
    summary = {},
    status = 'SUCCESS'
  } = result;

  const {
    totalProcessed = 0,
    createdCount = 0,
    repricedCount = 0,
    retainedCount = 0,
    skippedCount = 0
  } = summary;

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-6 max-w-4xl mx-auto">
      {/* Status Header */}
      <div className="flex items-center gap-4 border-b border-slate-100 pb-5">
        <div className="p-3 bg-emerald-100 text-emerald-700 rounded-2xl">
          <CheckCircle2 className="w-8 h-8" />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold text-slate-800">
              Clinic Catalog Ingestion Complete
            </h2>
            <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300">
              Audit Batch: {batchId?.substring(0, 10)}...
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Successfully imported and configured catalog items for{' '}
            <strong className="text-slate-700">{hospitalName || 'the selected clinic'}</strong> under category{' '}
            <strong className="text-slate-700">{category}</strong>.
          </p>
        </div>
      </div>

      {/* Metrics Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200">
          <div className="flex items-center justify-between text-emerald-700 mb-1">
            <span className="text-xs font-bold">New Assigned</span>
            <PlusCircle className="w-4 h-4" />
          </div>
          <div className="text-2xl font-black text-emerald-900">{createdCount}</div>
          <p className="text-[11px] text-emerald-700 mt-1">Added to clinic catalog</p>
        </div>

        <div className="p-4 rounded-xl bg-purple-50 border border-purple-200">
          <div className="flex items-center justify-between text-purple-700 mb-1">
            <span className="text-xs font-bold">Repriced</span>
            <RefreshCw className="w-4 h-4" />
          </div>
          <div className="text-2xl font-black text-purple-900">{repricedCount}</div>
          <p className="text-[11px] text-purple-700 mt-1">Clinic prices updated</p>
        </div>

        <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
          <div className="flex items-center justify-between text-slate-600 mb-1">
            <span className="text-xs font-bold">Retained</span>
            <ShieldCheck className="w-4 h-4" />
          </div>
          <div className="text-2xl font-black text-slate-800">{retainedCount}</div>
          <p className="text-[11px] text-slate-500 mt-1">Prices preserved as-is</p>
        </div>

        <div className="p-4 rounded-xl bg-rose-50 border border-rose-200">
          <div className="flex items-center justify-between text-rose-700 mb-1">
            <span className="text-xs font-bold">Skipped</span>
            <XCircle className="w-4 h-4" />
          </div>
          <div className="text-2xl font-black text-rose-900">{skippedCount}</div>
          <p className="text-[11px] text-rose-700 mt-1">Unmatched / unresolved</p>
        </div>
      </div>

      {/* Audit Provenance Notice */}
      <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-600 flex items-start gap-3">
        <FileCheck className="w-5 h-5 text-slate-500 flex-shrink-0 mt-0.5" />
        <div>
          <span className="font-bold text-slate-700 block">
            Immutable Audit Trail Created
          </span>
          <p className="text-[11px] text-slate-500 mt-0.5">
            Full item-level changes, pricing diffs, and row hashes have been committed to the{' '}
            <code className="bg-slate-200/80 px-1 py-0.5 rounded text-[10px]">HospitalMasterImportAudit</code> record.
            Tenant catalog isolation and canonical global masters remain completely intact.
          </p>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex items-center justify-between pt-2">
        <button
          type="button"
          onClick={onReset}
          className="flex items-center gap-2 px-4 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-xl hover:bg-slate-100 transition-colors"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          Upload Another Workbook
        </button>

        {onViewCatalog && (
          <button
            type="button"
            onClick={onViewCatalog}
            className="flex items-center gap-2 px-5 py-2 text-xs font-bold text-white bg-primary-600 hover:bg-primary-700 rounded-xl shadow-sm transition-all"
          >
            <span>View Clinic Catalog</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
}
