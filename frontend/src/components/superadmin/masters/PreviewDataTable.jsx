import React, { useState, useMemo } from 'react';
import { 
  Search, 
  Filter, 
  CheckCircle2, 
  AlertTriangle, 
  HelpCircle, 
  XCircle, 
  ChevronLeft, 
  ChevronRight,
  Sparkles,
  Info,
  CheckCheck,
  MinusCircle
} from 'lucide-react';
import RepricingDiffViewer from './RepricingDiffViewer';

export default function PreviewDataTable({
  rows = [],
  ambiguousResolutions = {},
  onResolveAmbiguous,
  category,
  activeFilter = 'ALL'
}) {
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 15;

  // Filter rows
  const filteredRows = useMemo(() => {
    return rows.filter((r) => {
      // Status filter
      if (activeFilter === 'SELECTED' && !r.isSelected) return false;
      if (activeFilter === 'NOT_SELECTED' && r.isSelected) return false;
      if (activeFilter === 'EXACT_MATCH' && r.matchStatus !== 'EXACT_MATCH') return false;
      if (activeFilter === 'SAFE_MATCH' && r.matchStatus !== 'SAFE_MATCH') return false;
      if (activeFilter === 'AMBIGUOUS' && r.matchStatus !== 'AMBIGUOUS') return false;
      if (activeFilter === 'NO_MATCH' && r.matchStatus !== 'NO_MATCH') return false;
      if (activeFilter === 'REPRICING_DIFF') {
        if (!r.pricingDiff || !r.pricingDiff.hasDiff) return false;
      }

      // Search term filter
      if (searchTerm.trim()) {
        const query = searchTerm.toLowerCase();
        const rowCode = (r.sourceData?.itemCode || '').toLowerCase();
        const rowName = (
          r.sourceData?.itemName || 
          r.sourceData?.item_name || 
          r.sourceData?.serviceName || 
          r.sourceData?.test_name || 
          r.sourceData?.assetName || 
          r.sourceData?.['Item Name'] ||
          r.sourceData?.['Test Name'] ||
          r.sourceData?.['Service Name'] ||
          r.sourceData?.['Asset Name'] ||
          ''
        ).toLowerCase();
        const canonCode = (r.matchedItem?.itemCode || '').toLowerCase();
        const canonName = (r.matchedItem?.itemName || '').toLowerCase();

        return (
          rowCode.includes(query) ||
          rowName.includes(query) ||
          canonCode.includes(query) ||
          canonName.includes(query)
        );
      }

      return true;
    });
  }, [rows, activeFilter, searchTerm]);

  const totalPages = Math.ceil(filteredRows.length / pageSize) || 1;
  const currentRows = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredRows.slice(start, start + pageSize);
  }, [filteredRows, currentPage, pageSize]);

  const renderStatusBadge = (status) => {
    switch (status) {
      case 'EXACT_MATCH':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-emerald-100 text-emerald-800 border border-emerald-300">
            <CheckCircle2 className="w-3 h-3 text-emerald-600" /> Exact Match
          </span>
        );
      case 'SAFE_MATCH':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-indigo-100 text-indigo-800 border border-indigo-300">
            <Sparkles className="w-3 h-3 text-indigo-600" /> Safe Match
          </span>
        );
      case 'AMBIGUOUS':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-amber-100 text-amber-800 border border-amber-300">
            <AlertTriangle className="w-3 h-3 text-amber-600" /> Ambiguous
          </span>
        );
      case 'NO_MATCH':
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-rose-100 text-rose-800 border border-rose-300">
            <XCircle className="w-3 h-3 text-rose-600" /> No Match
          </span>
        );
    }
  };

  const renderSelectionBadge = (row) => {
    if (row.matchStatus === 'NO_MATCH') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-rose-50 text-rose-700 border border-rose-200">
          <XCircle className="w-2.5 h-2.5 text-rose-500" /> Skipped (Unmatched)
        </span>
      );
    }
    if (row.isSelected) {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
          <CheckCheck className="w-2.5 h-2.5 text-emerald-600" /> Selected (Will Import)
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-100 text-slate-600 border border-slate-200">
        <MinusCircle className="w-2.5 h-2.5 text-slate-400" /> Not Selected (Blank MRP)
      </span>
    );
  };

  const getSourceDisplayName = (sourceData) => {
    if (!sourceData) return '—';
    return (
      sourceData.itemName ||
      sourceData.item_name ||
      sourceData.serviceName ||
      sourceData.test_name ||
      sourceData.assetName ||
      sourceData['Item Name'] ||
      sourceData['Test Name'] ||
      sourceData['Service Name'] ||
      sourceData['Asset Name'] ||
      sourceData['itemTypeName'] ||
      '—'
    );
  };

  return (
    <div className="flex flex-col bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
      {/* Table controls */}
      <div className="p-3 border-b border-slate-200 bg-slate-50/50 flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="relative w-full sm:w-72">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search by code or name..."
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              setCurrentPage(1);
            }}
            className="w-full pl-9 pr-3 py-1.5 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
        </div>
        <div className="text-xs text-slate-500 font-medium">
          Showing <span className="font-bold text-slate-800">{filteredRows.length}</span> rows
        </div>
      </div>

      {/* Rows Table */}
      <div className="overflow-x-auto max-h-[500px]">
        <table className="w-full text-left border-collapse text-xs">
          <thead className="bg-slate-100/80 text-slate-600 font-semibold sticky top-0 z-10 border-b border-slate-200">
            <tr>
              <th className="py-2.5 px-3 w-12 text-center">#</th>
              <th className="py-2.5 px-3">Excel Row Data</th>
              <th className="py-2.5 px-3 w-40">Match & Selection</th>
              <th className="py-2.5 px-3 min-w-[220px]">Canonical Master Mapping</th>
              <th className="py-2.5 px-3 min-w-[140px]">Imported Pricing</th>
              <th className="py-2.5 px-3 min-w-[200px]">Repricing Impact</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 font-normal text-slate-700">
            {currentRows.length === 0 ? (
              <tr>
                <td colSpan={6} className="text-center py-10 text-slate-400 italic">
                  No rows match the selected criteria
                </td>
              </tr>
            ) : (
              currentRows.map((row) => {
                const isAmbiguous = row.matchStatus === 'AMBIGUOUS';
                const selectedCandidateId = ambiguousResolutions[row.rowNumber] || row.matchedMasterItemId || '';
                const candidates = row.candidates || [];

                return (
                  <tr 
                    key={row.rowNumber} 
                    className={`hover:bg-slate-50/80 transition-colors ${
                      isAmbiguous && !ambiguousResolutions[row.rowNumber]
                        ? 'bg-amber-50/30'
                        : ''
                    }`}
                  >
                    {/* Row Number */}
                    <td className="py-2.5 px-3 text-center text-slate-400 font-mono text-[11px]">
                      {row.rowNumber}
                    </td>

                    {/* Source Data */}
                    <td className="py-2.5 px-3">
                      <div className="font-medium text-slate-900 line-clamp-1">
                        {getSourceDisplayName(row.sourceData)}
                      </div>
                      <div className="text-[11px] text-slate-500 font-mono flex items-center gap-2 mt-0.5">
                        {row.sourceData?.itemCode && (
                          <span className="bg-slate-100 px-1 rounded">Code: {row.sourceData.itemCode}</span>
                        )}
                        {row.sourceData?.department && (
                          <span className="text-slate-400">Dept: {row.sourceData.department}</span>
                        )}
                      </div>
                    </td>

                    {/* Match & Selection Status */}
                    <td className="py-2.5 px-3 whitespace-nowrap">
                      <div className="flex flex-col gap-1">
                        <div>{renderStatusBadge(row.matchStatus)}</div>
                        <div>{renderSelectionBadge(row)}</div>
                      </div>
                    </td>

                    {/* Canonical Master Mapping */}
                    <td className="py-2.5 px-3">
                      {row.matchStatus === 'NO_MATCH' ? (
                        <span className="text-slate-400 italic text-[11px]">
                          Will be skipped (No global master)
                        </span>
                      ) : isAmbiguous ? (
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-amber-900 block uppercase tracking-wider">
                            Select Candidate ({candidates.length} options):
                          </label>
                          <select
                            value={selectedCandidateId}
                            onChange={(e) => onResolveAmbiguous && onResolveAmbiguous(row.rowNumber, e.target.value)}
                            className="w-full text-xs py-1 px-2 bg-white border border-amber-300 rounded-md text-slate-800 font-medium focus:ring-2 focus:ring-amber-500 focus:outline-none"
                          >
                            <option value="">— Select Canonical Master —</option>
                            {candidates.map((cand) => (
                              <option key={cand.masterItemId} value={cand.masterItemId}>
                                [{cand.itemCode}] {cand.itemName}
                              </option>
                            ))}
                          </select>
                        </div>
                      ) : (
                        <div>
                          <div className="font-semibold text-slate-800 text-xs">
                            {row.matchedItem?.itemName || '—'}
                          </div>
                          <div className="text-[11px] font-mono text-slate-500">
                            Code: <span className="font-bold text-indigo-700">{row.matchedItem?.itemCode || '—'}</span>
                          </div>
                        </div>
                      )}
                    </td>

                    {/* Imported Pricing */}
                    <td className="py-2.5 px-3">
                      <div className="space-y-0.5 font-mono text-[11px]">
                        {row.extractedPricing?.mrp !== undefined && row.extractedPricing.mrp !== null ? (
                          <div>MRP: <span className="font-bold text-slate-800">₹{row.extractedPricing.mrp}</span></div>
                        ) : null}
                        {row.extractedPricing?.netRate !== undefined && row.extractedPricing.netRate !== null ? (
                          <div>Net Rate: <span className="font-bold text-slate-800">₹{row.extractedPricing.netRate}</span></div>
                        ) : null}
                        {row.extractedPricing?.hospitalCost !== undefined && row.extractedPricing.hospitalCost !== null ? (
                          <div>Cost: <span className="font-bold text-slate-800">₹{row.extractedPricing.hospitalCost}</span></div>
                        ) : null}
                        {row.extractedPricing?.mrp === undefined && 
                         row.extractedPricing?.netRate === undefined && 
                         row.extractedPricing?.hospitalCost === undefined && (
                          <span className="text-slate-400 italic">None (No price in spec)</span>
                        )}
                      </div>
                    </td>

                    {/* Repricing Impact */}
                    <td className="py-2.5 px-3">
                      <RepricingDiffViewer rowPricingDiff={row.pricingDiff} category={category} />
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination Controls */}
      <div className="p-3 border-t border-slate-200 bg-slate-50 flex items-center justify-between text-xs text-slate-600">
        <div>
          Page <span className="font-bold text-slate-800">{currentPage}</span> of <span className="font-bold text-slate-800">{totalPages}</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            disabled={currentPage <= 1}
            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
            className="p-1 rounded border border-slate-200 bg-white hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            type="button"
            disabled={currentPage >= totalPages}
            onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
            className="p-1 rounded border border-slate-200 bg-white hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
