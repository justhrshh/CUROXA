import React, { useState, useRef } from 'react';
import { UploadCloud, Image as ImageIcon, AlertCircle } from 'lucide-react';
import LogoPreview from './LogoPreview';

/**
 * Reusable Production Logo Uploader with Automatic Background Removal.
 * 
 * Interacts with backend logoProcessingService to:
 * - Accept PNG, JPG, JPEG, WebP, SVG
 * - Automatically remove background and generate transparent PNG
 * - Preserve original artwork and aspect ratio (never square-confined)
 * - Display checkerboard transparency preview
 *
 * @param {Object} props
 * @param {string} [props.hospitalId] - Optional hospital ID or MongoDB _id if editing existing clinic
 * @param {string} [props.hospitalCode] - Optional hospital code
 * @param {string} [props.initialLogo] - Existing logo URL
 * @param {string} [props.initialOriginalLogo] - Existing original logo URL
 * @param {string} [props.initialStatus] - Existing processing status
 * @param {Function} props.onLogoChange - Callback when logo is updated: ({ logoUrl, originalLogoUrl, processingStatus, dimensions }) => void
 * @param {Function} [props.onLogoRemove] - Callback when logo is cleared
 * @param {string} [props.authToken] - Super admin or admin auth token (will fallback to localStorage if omitted)
 */
export const LogoUploader = ({
  hospitalId,
  hospitalCode,
  initialLogo = '',
  initialOriginalLogo = '',
  initialStatus = 'none',
  onLogoChange,
  onLogoRemove,
  authToken
}) => {
  const [logoUrl, setLogoUrl] = useState(initialLogo);
  const [originalLogoUrl, setOriginalLogoUrl] = useState(initialOriginalLogo);
  const [status, setStatus] = useState(initialStatus);
  const [fallbackReason, setFallbackReason] = useState('');
  const [dimensions, setDimensions] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [isDragOver, setIsDragOver] = useState(false);

  const fileInputRef = useRef(null);

  // Sync with prop changes
  React.useEffect(() => {
    if (initialLogo !== undefined) setLogoUrl(initialLogo);
    if (initialOriginalLogo !== undefined) setOriginalLogoUrl(initialOriginalLogo);
    if (initialStatus !== undefined) setStatus(initialStatus);
  }, [initialLogo, initialOriginalLogo, initialStatus]);

  const handleFileSelect = async (file) => {
    setErrorMessage('');
    if (!file) return;

    // Client-side validations
    const allowedTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/svg+xml'];
    if (!allowedTypes.includes(file.type)) {
      setErrorMessage('Unsupported format. Please upload PNG, JPG, JPEG, WebP, or SVG.');
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      setErrorMessage('File size exceeds 10 MB limit.');
      return;
    }

    // Begin processing
    setIsProcessing(true);

    try {
      const token = authToken || 
                    localStorage.getItem('superadminToken') || 
                    localStorage.getItem('token') || 
                    sessionStorage.getItem('superadminToken');

      const formData = new FormData();
      formData.append('logo', file);
      if (hospitalCode) {
        formData.append('hospitalCode', hospitalCode);
      }

      // If we have an existing hospitalId, upload directly to the hospital's logo route
      // Otherwise, process through the standalone /process-logo endpoint
      const endpoint = hospitalId 
        ? `/api/superadmin/hospitals/${hospitalId}/logo`
        : `/api/superadmin/process-logo`;

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        },
        body: formData
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to process clinic logo.');
      }

      setLogoUrl(data.logoUrl);
      setOriginalLogoUrl(data.originalLogoUrl || data.logoUrl);
      setStatus(data.processingStatus || 'processed');
      setFallbackReason(data.fallbackReason || '');
      setDimensions(data.dimensions || null);

      if (onLogoChange) {
        onLogoChange({
          logoUrl: data.logoUrl,
          originalLogoUrl: data.originalLogoUrl || data.logoUrl,
          processingStatus: data.processingStatus || 'processed',
          dimensions: data.dimensions || null,
          hospital: data.hospital
        });
      }
    } catch (err) {
      console.error('[LOGO_UPLOAD_ERROR]', err);
      setErrorMessage(err.message || 'Error uploading or processing logo.');
    } finally {
      setIsProcessing(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleRemove = () => {
    setLogoUrl('');
    setOriginalLogoUrl('');
    setStatus('none');
    setDimensions(null);
    setErrorMessage('');
    if (onLogoRemove) {
      onLogoRemove();
    }
  };

  const hasLogo = Boolean(logoUrl && logoUrl !== 'H');

  return (
    <div className="w-full flex flex-col gap-2">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/png,image/jpeg,image/jpg,image/webp,image/svg+xml"
        className="hidden"
        onChange={(e) => {
          if (e.target.files?.[0]) handleFileSelect(e.target.files[0]);
        }}
      />

      {/* When logo is present or actively processing, show rich checkerboard preview */}
      {hasLogo || isProcessing ? (
        <LogoPreview
          logoUrl={logoUrl}
          originalLogoUrl={originalLogoUrl}
          processing={isProcessing}
          status={status}
          fallbackReason={fallbackReason}
          dimensions={dimensions}
          onChange={() => fileInputRef.current?.click()}
          onRemove={handleRemove}
        />
      ) : (
        /* Empty Dropzone State */
        <div
          onClick={() => fileInputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
          onDragLeave={() => setIsDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setIsDragOver(false);
            const file = e.dataTransfer.files?.[0];
            if (file) handleFileSelect(file);
          }}
          className={`w-full min-h-[140px] rounded-xl border-2 border-dashed p-6 flex flex-col items-center justify-center gap-2 cursor-pointer transition-all ${
            isDragOver 
              ? 'border-blue-500 bg-blue-50/70 scale-[0.99]' 
              : 'border-slate-300 hover:border-blue-400 bg-slate-50/50 hover:bg-blue-50/30'
          }`}
        >
          <div className="w-11 h-11 rounded-full bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600 shadow-sm">
            <UploadCloud className="w-5 h-5" />
          </div>
          <div className="text-center">
            <p className="text-xs font-bold text-slate-800">
              Click to upload or drag &amp; drop clinic logo
            </p>
            <p className="text-[11px] text-slate-500 mt-0.5">
              PNG, JPG, JPEG, WebP, or SVG (Max 10 MB)
            </p>
          </div>
          <div className="inline-flex items-center gap-1 mt-1 text-[10px] font-semibold text-blue-700 bg-blue-50/80 px-2.5 py-0.5 rounded-full border border-blue-200/60">
            <ImageIcon className="w-3 h-3 text-blue-600" />
            Automatic background removal enabled
          </div>
        </div>
      )}

      {/* Error notification */}
      {errorMessage && (
        <div className="flex items-center gap-2 p-2.5 bg-rose-50 border border-rose-200 rounded-lg text-rose-700 text-xs mt-1 animate-fadeIn">
          <AlertCircle className="w-4 h-4 flex-shrink-0 text-rose-600" />
          <span className="flex-1 font-medium">{errorMessage}</span>
          <button
            type="button"
            onClick={() => setErrorMessage('')}
            className="text-rose-500 hover:text-rose-700 font-bold ml-1 cursor-pointer"
          >
            &times;
          </button>
        </div>
      )}
    </div>
  );
};

export default LogoUploader;
