import React from 'react';
import { 
  FileSpreadsheet, 
  CheckCircle2, 
  HelpCircle, 
  AlertTriangle, 
  XCircle, 
  TrendingUp,
  CheckCheck,
  MinusCircle
} from 'lucide-react';

export default function MatchSummaryCards({ summary, activeFilter, onSelectFilter }) {
  if (!summary) return null;

  const cards = [
    {
      id: 'ALL',
      title: 'Total Rows',
      count: summary.totalRows || 0,
      icon: FileSpreadsheet,
      color: 'blue',
      borderClass: activeFilter === 'ALL' ? 'border-blue-500 ring-2 ring-blue-200' : 'border-slate-200 hover:border-blue-300',
      bgClass: 'bg-white',
      badgeClass: 'bg-blue-50 text-blue-700',
      description: 'Total rows in file'
    },
    {
      id: 'SELECTED',
      title: 'Selected (Import)',
      count: summary.selected || 0,
      icon: CheckCheck,
      color: 'emerald',
      borderClass: activeFilter === 'SELECTED' ? 'border-emerald-500 ring-2 ring-emerald-200' : 'border-slate-200 hover:border-emerald-300',
      bgClass: 'bg-white',
      badgeClass: 'bg-emerald-50 text-emerald-700',
      description: 'Price provided (MRP)'
    },
    {
      id: 'NOT_SELECTED',
      title: 'Not Selected',
      count: summary.notSelected || 0,
      icon: MinusCircle,
      color: 'slate',
      borderClass: activeFilter === 'NOT_SELECTED' ? 'border-slate-500 ring-2 ring-slate-200' : 'border-slate-200 hover:border-slate-400',
      bgClass: 'bg-white',
      badgeClass: 'bg-slate-100 text-slate-600',
      description: 'Blank MRP (Skipped)'
    },
    {
      id: 'EXACT_MATCH',
      title: 'Exact Matches',
      count: summary.exactMatch || 0,
      icon: CheckCircle2,
      color: 'teal',
      borderClass: activeFilter === 'EXACT_MATCH' ? 'border-teal-500 ring-2 ring-teal-200' : 'border-slate-200 hover:border-teal-300',
      bgClass: 'bg-white',
      badgeClass: 'bg-teal-50 text-teal-700',
      description: 'By Item Code'
    },
    {
      id: 'SAFE_MATCH',
      title: 'Safe Matches',
      count: summary.safeMatch || 0,
      icon: HelpCircle,
      color: 'indigo',
      borderClass: activeFilter === 'SAFE_MATCH' ? 'border-indigo-500 ring-2 ring-indigo-200' : 'border-slate-200 hover:border-indigo-300',
      bgClass: 'bg-white',
      badgeClass: 'bg-indigo-50 text-indigo-700',
      description: 'By unique name'
    },
    {
      id: 'AMBIGUOUS',
      title: 'Ambiguous',
      count: summary.ambiguous || 0,
      icon: AlertTriangle,
      color: 'amber',
      borderClass: activeFilter === 'AMBIGUOUS' ? 'border-amber-500 ring-2 ring-amber-200' : 'border-slate-200 hover:border-amber-300',
      bgClass: 'bg-white',
      badgeClass: 'bg-amber-50 text-amber-700',
      description: 'Multiple candidates'
    },
    {
      id: 'REPRICING_DIFF',
      title: 'Repricing Diffs',
      count: summary.repricingDiffs || 0,
      icon: TrendingUp,
      color: 'purple',
      borderClass: activeFilter === 'REPRICING_DIFF' ? 'border-purple-500 ring-2 ring-purple-200' : 'border-slate-200 hover:border-purple-300',
      bgClass: 'bg-white',
      badgeClass: 'bg-purple-50 text-purple-700',
      description: 'Price rate change'
    },
    {
      id: 'NO_MATCH',
      title: 'Unmatched',
      count: summary.unmatched || 0,
      icon: XCircle,
      color: 'rose',
      borderClass: activeFilter === 'NO_MATCH' ? 'border-rose-500 ring-2 ring-rose-200' : 'border-slate-200 hover:border-rose-300',
      bgClass: 'bg-white',
      badgeClass: 'bg-rose-50 text-rose-700',
      description: 'No global master'
    }
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2">
      {cards.map((card) => {
        const Icon = card.icon;
        return (
          <button
            key={card.id}
            type="button"
            onClick={() => onSelectFilter && onSelectFilter(card.id)}
            className={`p-2.5 rounded-lg border text-left transition-all ${card.borderClass} ${card.bgClass} shadow-xs focus:outline-none`}
          >
            <div className="flex items-center justify-between mb-1">
              <span className="text-[11px] font-semibold text-slate-600 truncate">{card.title}</span>
              <div className={`p-1 rounded ${card.badgeClass}`}>
                <Icon className="w-3 h-3" />
              </div>
            </div>
            <div className="text-xl font-bold text-slate-800 tracking-tight">
              {card.count}
            </div>
            <p className="text-[9.5px] text-slate-500 mt-0.5 line-clamp-1 leading-snug">
              {card.description}
            </p>
          </button>
        );
      })}
    </div>
  );
}
