import React, { useRef, useState } from 'react';
import * as Icons from 'lucide-react';

const LucideIcon = ({ name, ...props }) => {
  if (!name) return <Icons.HelpCircle {...props} />;
  const camelName = name
    .split('-')
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join('');
  const IconComponent = Icons[camelName] || Icons.HelpCircle;
  return <IconComponent {...props} />;
};

export default function ExcelDropzone({
  file,
  onFileSelect,
  onClearFile,
  onUploadAndValidate,
  uploading,
  disabled
}) {
  const fileInputRef = useRef(null);
  const [isDragOver, setIsDragOver] = useState(false);

  const handleDragOver = (e) => {
    e.preventDefault();
    if (!disabled) setIsDragOver(true);
  };

  const handleDragLeave = () => {
    setIsDragOver(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragOver(false);
    if (disabled) return;

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const droppedFile = e.dataTransfer.files[0];
      validateAndSetFile(droppedFile);
    }
  };

  const handleFileInputChange = (e) => {
    if (e.target.files && e.target.files.length > 0) {
      const selectedFile = e.target.files[0];
      validateAndSetFile(selectedFile);
    }
  };

  const validateAndSetFile = (f) => {
    const validExtensions = ['.xlsx', '.xls'];
    const fileName = f.name.toLowerCase();
    const isValid = validExtensions.some(ext => fileName.endsWith(ext));

    if (!isValid) {
      alert('Invalid file format. Please upload an Excel workbook (.xlsx or .xls).');
      return;
    }
    onFileSelect(f);
  };

  return (
    <div style={{
      background: '#FFFFFF',
      borderRadius: '16px',
      border: '1px solid #E2E8F0',
      padding: '24px',
      boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
      display: 'flex',
      flexDirection: 'column',
      gap: '16px'
    }}>
      <div style={{
        fontSize: '13px',
        fontWeight: 800,
        color: '#1E293B',
        textTransform: 'uppercase',
        display: 'flex',
        alignItems: 'center',
        gap: '6px'
      }}>
        <LucideIcon name="upload-cloud" size={16} />
        Master Excel Workbook Upload
      </div>

      {/* Dropzone Container */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => {
          if (!file && !disabled && fileInputRef.current) {
            fileInputRef.current.click();
          }
        }}
        style={{
          border: isDragOver ? '2px dashed #2563EB' : '2px dashed #CBD5E1',
          background: isDragOver ? '#EFF6FF' : '#F8FAFC',
          borderRadius: '12px',
          padding: '36px 20px',
          textAlign: 'center',
          cursor: disabled ? 'not-allowed' : (file ? 'default' : 'pointer'),
          transition: 'all 0.15s ease'
        }}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".xlsx, .xls"
          onChange={handleFileInputChange}
          style={{ display: 'none' }}
          disabled={disabled}
        />

        {!file ? (
          <div>
            <div style={{
              width: '52px',
              height: '52px',
              borderRadius: '50%',
              background: '#E2E8F0',
              color: '#64748B',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: '12px'
            }}>
              <LucideIcon name="file-spreadsheet" size={26} />
            </div>
            <div style={{ fontSize: '14px', fontWeight: 700, color: '#1E293B' }}>
              Drag & Drop your Clinic Master Excel workbook here
            </div>
            <div style={{ fontSize: '12px', color: '#64748B', marginTop: '4px' }}>
              or click to browse from your computer (.xlsx or .xls, max 25MB)
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '16px' }}>
            <div style={{
              width: '44px',
              height: '44px',
              borderRadius: '10px',
              background: '#DCFCE7',
              color: '#166534',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <LucideIcon name="file-check" size={24} />
            </div>
            <div style={{ textAlign: 'left' }}>
              <div style={{ fontSize: '14px', fontWeight: 800, color: '#0F172A' }}>
                {file.name}
              </div>
              <div style={{ fontSize: '12px', color: '#64748B' }}>
                {(file.size / 1024).toFixed(1)} KB · Ready for registry validation
              </div>
            </div>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onClearFile();
              }}
              style={{
                marginLeft: '12px',
                padding: '6px 12px',
                borderRadius: '6px',
                border: '1px solid #CBD5E1',
                background: '#FFFFFF',
                color: '#EF4444',
                fontSize: '12px',
                fontWeight: 700,
                cursor: 'pointer'
              }}
            >
              Remove File
            </button>
          </div>
        )}
      </div>

      {/* Validation Action */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '12px' }}>
        <button
          type="button"
          onClick={onUploadAndValidate}
          disabled={!file || uploading || disabled}
          style={{
            padding: '10px 22px',
            borderRadius: '8px',
            border: 'none',
            background: (!file || uploading || disabled) ? '#94A3B8' : '#2563EB',
            color: '#FFFFFF',
            fontWeight: 700,
            fontSize: '13px',
            cursor: (!file || uploading || disabled) ? 'not-allowed' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            boxShadow: (!file || uploading || disabled) ? 'none' : '0 2px 4px rgba(37,99,235,0.2)'
          }}
        >
          {uploading ? (
            <>
              <LucideIcon name="loader-2" size={16} className="animate-spin" />
              Validating against Registry...
            </>
          ) : (
            <>
              <LucideIcon name="scan-search" size={16} />
              Upload & Run Pre-Validation
            </>
          )}
        </button>
      </div>
    </div>
  );
}
