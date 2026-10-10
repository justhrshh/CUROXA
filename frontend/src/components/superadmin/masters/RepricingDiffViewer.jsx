import React from 'react';
import { ArrowRight, TrendingUp, TrendingDown, Minus, AlertCircle } from 'lucide-react';

export default function RepricingDiffViewer({ rowPricingDiff, category }) {
  if (!rowPricingDiff || !rowPricingDiff.hasDiff) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-slate-400">
        <Minus className="w-3 h-3" /> No price changes
      </span>
    );
  }

  const { diffs = {} } = rowPricingDiff;
  const fields = [
    { key: 'mrp', label: 'MRP' },
    { key: 'netRate', label: 'Net Rate' },
    { key: 'hospitalCost', label: 'Clinic Cost' }
  ];

  const activeDiffs = fields.filter(f => diffs[f.key] && diffs[f.key].changed);

  if (activeDiffs.length === 0) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-slate-400">
        <Minus className="w-3 h-3" /> Identical
      </span>
    );
  }

  return (
    <div className="space-y-1.5 min-w-[200px]">
      {activeDiffs.map(field => {
        const item = diffs[field.key];
        const oldVal = item.current !== null && item.current !== undefined ? `₹${item.current}` : 'None';
        const newVal = item.imported !== null && item.imported !== undefined ? `₹${item.imported}` : 'None';
        const numOld = typeof item.current === 'number' ? item.current : null;
        const numNew = typeof item.imported === 'number' ? item.imported : null;
        
        let direction = null;
        if (numOld !== null && numNew !== null) {
          if (numNew > numOld) direction = 'up';
          else if (numNew < numOld) direction = 'down';
        }

        return (
          <div 
            key={field.key} 
            className="flex items-center justify-between text-xs bg-amber-50/70 border border-amber-200/70 rounded-md px-2 py-1"
          >
            <span className="font-semibold text-amber-900 w-16 truncate">{field.label}:</span>
            <div className="flex items-center gap-1.5 font-mono text-[11px]">
              <span className="text-slate-500 line-through">{oldVal}</span>
              <ArrowRight className="w-3 h-3 text-amber-600 flex-shrink-0" />
              <span className="font-bold text-amber-800">{newVal}</span>
              {direction === 'up' && <TrendingUp className="w-3 h-3 text-rose-500" title="Price Increased" />}
              {direction === 'down' && <TrendingDown className="w-3 h-3 text-emerald-600" title="Price Decreased" />}
            </div>
          </div>
        );
      })}
    </div>
  );
}
