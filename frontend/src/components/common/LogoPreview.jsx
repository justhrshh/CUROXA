import React from 'react';
import { CheckCircle2, AlertCircle, Loader2, Sparkles, X, RefreshCw } from 'lucide-react';

/**
 * Checkerboard Transparency Preview for Clinic Logos.
 * Displays logos in their unconstrained natural aspect ratio with transparency indicator.
 */
export const LogoPreview = ({
  logoUrl,
  originalLogoUrl,
  processing = false,
  status = 'none', // 'none' | 'processed' | 'transparent_original' | 'fallback'
  fallbackReason = '',
  dimensions,
  onChange,
  onRemove,
  showOriginalToggle = true
}) => {
  const [viewOriginal, setViewOriginal] = React.useState(false);

  const activeUrl = (viewOriginal && originalLogoUrl) ? originalLogoUrl : (logoUrl || originalLogoUrl);

  const checkerboardStyle = {
    backgroundImage: `
      linear-gradient(45deg, #E2E8F0 25%, transparent 25%),
      linear-gradient(-45deg, #E2E8F0 25%, transparent 25%),
      linear-gradient(45deg, transparent 75%, #E2E8F0 75%),
      linear-gradient(-45deg, transparent 75%, #E2E8F0 75%)
    `,
    backgroundSize: '16px 16px',
    backgroundPosition: '0 0, 0 8px, 8px -8px, -8px 0px',
    backgroundColor: '#F8FAFC'
  };

  return (
    <div className="w-full flex flex-col gap-3">
      {/* Transparency Checkerboard Box */}
      <div 
        className="w-full relative rounded-xl border border-slate-200 overflow-hidden shadow-inner flex items-center justify-center p-4 min-h-[140px] max-h-[180px] transition-all"
        style={checkerboardStyle}
      >
        {processing ? (
          <div className="flex flex-col items-center gap-2 py-6 px-4 bg-white/90 backdrop-blur-sm rounded-xl border border-blue-100 shadow-sm">
            <Loader2 className="w-6 h-6 text-blue-600 animate-spin" />
            <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800">
              <Sparkles className="w-3.5 h-3.5 text-blue-600 animate-pulse" />
              <span>Removing background &amp; generating transparent PNG...</span>
            </div>
            <span className="text-[11px] text-slate-500">Preserving original artwork &amp; colors</span>
          </div>
        ) : activeUrl ? (
          <div className="relative max-w-full max-h-full flex items-center justify-center">
            <img
              src={activeUrl}
              alt="Logo Preview"
              className="max-h-[130px] max-w-full object-contain filter drop-shadow-sm select-none"
              style={{ width: 'auto', height: 'auto', background: 'transparent' }}
            />
          </div>
        ) : (
          <div className="text-xs text-slate-400 font-medium">No logo loaded</div>
        )}

        {/* Status Badge in Top-Right */}
        {!processing && activeUrl && (
          <div className="absolute top-2.5 right-2.5 flex items-center gap-1.5">
            {status === 'processed' && (
              <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200/80 rounded-full px-2 py-0.5 shadow-sm">
                <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                Transparent PNG
              </span>
            )}
            {status === 'transparent_original' && (
              <span className="inline-flex items-center gap-1 text-[10px] font-bold text-blue-700 bg-blue-50 border border-blue-200/80 rounded-full px-2 py-0.5 shadow-sm">
                <CheckCircle2 className="w-3 h-3 text-blue-600" />
                Transparent Original
              </span>
            )}
            {status === 'fallback' && (
              <span 
                className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-200/80 rounded-full px-2 py-0.5 shadow-sm"
                title={fallbackReason || 'Background removal fell back to original'}
              >
                <AlertCircle className="w-3 h-3 text-amber-600" />
                Original Preserved
              </span>
            )}
          </div>
        )}
      </div>

      {/* Dimensions & Controls Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
        <div className="flex items-center gap-2 text-[11px] text-slate-500 font-medium">
          {dimensions?.width && dimensions?.height && (
            <span>
              {dimensions.width} &times; {dimensions.height} px
              {dimensions.aspectRatio ? ` (Aspect ${dimensions.aspectRatio}:1)` : ''}
            </span>
          )}
          {originalLogoUrl && logoUrl && originalLogoUrl !== logoUrl && showOriginalToggle && (
            <button
              type="button"
              onClick={() => setViewOriginal(!viewOriginal)}
              className="text-blue-600 hover:text-blue-700 underline font-semibold ml-1 cursor-pointer"
            >
              {viewOriginal ? 'Show Processed PNG' : 'Compare Original'}
            </button>
          )}
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-1.5 ml-auto">
          {onChange && (
            <button
              type="button"
              disabled={processing}
              onClick={onChange}
              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-blue-600 bg-blue-50 hover:bg-blue-100/80 border border-blue-200 rounded-lg transition-colors cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className="w-3 h-3" />
              Change
            </button>
          )}
          {onRemove && (
            <button
              type="button"
              disabled={processing}
              onClick={onRemove}
              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-rose-600 bg-rose-50 hover:bg-rose-100/80 border border-rose-200 rounded-lg transition-colors cursor-pointer disabled:opacity-50"
            >
              <X className="w-3 h-3" />
              Remove
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default LogoPreview;
