import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import * as Icons from 'lucide-react';
import { socket } from '../utils/socket';
import { handleAutoLogout, clearPortalAuthContext, performLogout } from '../utils/api';
import curoxaSidebarLogo from '../assets/curoxa_sidebar_logo.png';
import { exportHospitalValidationReportPdf } from '../utils/exportEngine';

const originalFetch = window.fetch;
const fetch = async (url, options = {}) => {
  const baseUrl = import.meta.env.VITE_API_URL || '/api';
  let targetUrl = url;
  if (url && typeof url === 'string' && url.startsWith('/api')) {
    if (baseUrl.startsWith('http')) {
      targetUrl = url.replace('/api', baseUrl);
    }
  }
  return originalFetch(targetUrl, options);
};

const LucideIcon = ({ name, ...props }) => {

  if (!name) return <Icons.HelpCircle {...props} />;
  const camelName = name
    .split('-')
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join('');
  const IconComponent = Icons[camelName] || Icons.HelpCircle;
  return <IconComponent {...props} />;
};

const validatePANFormat = (pan) => {
  const panRegex = /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/;
  return panRegex.test(pan?.trim().toUpperCase());
};

const validateGSTINFormat = (gstin) => {
  const gstinRegex = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;
  return gstinRegex.test(gstin?.trim().toUpperCase());
};

const validateCINFormat = (cin) => {
  const cinRegex = /^[LU][0-9]{5}[A-Z]{2}[0-9]{4}[A-Z]{3}[0-9]{6}$/i;
  return cinRegex.test(cin?.trim());
};

const validateDrugLicenseFormat = (license) => {
  const licenseRegex = /^[A-Z0-9][A-Z0-9\-\/\s]{3,28}[A-Z0-9]$/i;
  return licenseRegex.test(license?.trim());
};

const validateCertificateFormat = (cert) => {
  if (!cert) return true;
  const certRegex = /^[A-Z0-9][A-Z0-9\-\/\s]{3,28}[A-Z0-9]$/i;
  return certRegex.test(cert.trim());
};

const validateEmailFormat = (email) => {
  if (!email || typeof email !== 'string') return false;
  const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  return emailRegex.test(email.trim());
};

const ToggleSwitch = ({ checked, onChange, disabled }) => {
  return (
    <label style={{ ...styles.switchContainer, opacity: disabled ? 0.6 : 1, pointerEvents: disabled ? 'none' : 'auto' }}>
      <input 
        type="checkbox" 
        checked={checked} 
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)} 
        style={styles.switchInput} 
      />
      <span style={{
        ...styles.switchSlider,
        backgroundColor: checked ? '#2563EB' : '#CBD5E1'
      }}>
        <span style={{
          ...styles.switchKnob,
          transform: checked ? 'translateX(18px)' : 'translateX(0px)'
        }} />
      </span>
    </label>
  );
};

const CustomSlider = ({ label, value, min, max, unit = '', onChange }) => {
  const [localVal, setLocalVal] = useState(value);

  useEffect(() => {
    setLocalVal(value);
  }, [value]);

  const handleSliderChange = (e) => {
    setLocalVal(Number(e.target.value));
  };

  const handleSliderRelease = () => {
    if (localVal !== value) {
      onChange(localVal);
    }
  };

  const getStep = () => {
    return 1;
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', margin: '8px 0' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: '11px', fontWeight: 800, color: '#64748B', textTransform: 'uppercase' }}>{label}</span>
        <span style={{ fontSize: '12px', fontWeight: 800, color: '#2563EB', background: '#EFF6FF', padding: '2px 8px', borderRadius: '6px' }}>{localVal}{unit}</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <button 
          type="button" 
          onClick={() => {
            const nextVal = Math.max(min, localVal - getStep());
            setLocalVal(nextVal);
            onChange(nextVal);
          }}
          style={styles.sliderBtn}
        >
          -
        </button>
        <div style={{ flex: 1, position: 'relative', display: 'flex', alignItems: 'center', height: '24px' }}>
          <input 
            type="range"
            min={min}
            max={max}
            step={getStep()}
            value={localVal}
            onChange={handleSliderChange}
            onMouseUp={handleSliderRelease}
            onTouchEnd={handleSliderRelease}
            onBlur={handleSliderRelease}
            className="custom-slider-input"
            style={{ width: '100%', margin: 0 }}
          />
        </div>
        <button 
          type="button" 
          onClick={() => {
            const nextVal = Math.min(max, localVal + getStep());
            setLocalVal(nextVal);
            onChange(nextVal);
          }}
          style={styles.sliderBtn}
        >
          +
        </button>
      </div>
      {/* Presets */}
      <div style={{ display: 'flex', gap: '6px', marginTop: '2px' }}>
        {label.includes('Staff') ? [5, 10, 25, 50].map(val => (
          <button
            key={val}
            type="button"
            onClick={() => {
              setLocalVal(val);
              onChange(val);
            }}
            style={{
              ...styles.presetBtn,
              background: localVal === val ? '#2563EB' : '#F1F5F9',
              color: localVal === val ? '#FFFFFF' : '#475569'
            }}
          >
            {val}
          </button>
        )) : label.includes('Doctor') ? [10, 25, 50, 100].map(val => (
          <button
            key={val}
            type="button"
            onClick={() => {
              setLocalVal(val);
              onChange(val);
            }}
            style={{
              ...styles.presetBtn,
              background: localVal === val ? '#2563EB' : '#F1F5F9',
              color: localVal === val ? '#FFFFFF' : '#475569'
            }}
          >
            {val}
          </button>
        )) : [50, 100, 250, 500].map(val => (
          <button
            key={val}
            type="button"
            onClick={() => {
              setLocalVal(val);
              onChange(val);
            }}
            style={{
              ...styles.presetBtn,
              background: localVal === val ? '#2563EB' : '#F1F5F9',
              color: localVal === val ? '#FFFFFF' : '#475569'
            }}
          >
            {val} GB
          </button>
        ))}
      </div>
    </div>
  );
};

const FloatingInput = ({
  label,
  value,
  onChange,
  type = 'text',
  required = false,
  optional = false,
  disabled = false,
  error = false,
  isValid = false,
  style = {},
  inputStyle = {},
  rightElement,
  onFocus,
  onBlur,
  maxLength,
  multiline = false,
  rows = 2,
  ...props
}) => {
  const [isFocused, setIsFocused] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const hasValue = value !== undefined && value !== null && String(value).trim().length > 0;
  const isFloating = isFocused || hasValue;

  return (
    <div
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{
        position: 'relative',
        width: '100%',
        minHeight: multiline ? '74px' : '52px',
        background: disabled 
          ? '#F8FAFC' 
          : isFocused 
            ? '#FFFFFF' 
            : error 
              ? 'linear-gradient(180deg, #FFFFFF 0%, #FEF2F2 100%)'
              : isValid && hasValue
                ? 'linear-gradient(180deg, #FFFFFF 0%, #F0FDF4 100%)'
                : isHovered
                  ? '#FFFFFF'
                  : 'linear-gradient(180deg, #FFFFFF 0%, #F8FAFC 100%)',
        border: `1.5px solid ${
          error 
            ? '#EF4444' 
            : isFocused 
              ? '#2563EB' 
              : isValid && hasValue 
                ? '#10B981' 
                : isHovered 
                  ? '#93C5FD' 
                  : hasValue 
                    ? '#CBD5E1' 
                    : '#E2E8F0'
        }`,
        borderRadius: '12px',
        boxShadow: isFocused 
          ? '0 6px 20px -2px rgba(37, 99, 235, 0.15), 0 0 0 3.5px rgba(37, 99, 235, 0.12)' 
          : isHovered 
            ? '0 3px 10px rgba(15, 23, 42, 0.04)' 
            : '0 1px 2px rgba(0,0,0,0.02)',
        transition: 'all 0.18s cubic-bezier(0.4, 0, 0.2, 1)',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        boxSizing: 'border-box',
        cursor: disabled ? 'not-allowed' : 'text',
        ...style
      }}
      onClick={(e) => {
        if (!disabled) {
          const el = e.currentTarget.querySelector('input, textarea');
          if (el) el.focus();
        }
      }}
    >
      {/* Floating Instagram-style Label */}
      <label
        style={{
          position: 'absolute',
          left: '16px',
          top: isFloating ? (multiline ? '8px' : '7px') : '50%',
          transform: isFloating ? 'none' : 'translateY(-50%)',
          fontSize: isFloating ? '10.5px' : '13.5px',
          fontWeight: isFloating ? 700 : 450,
          color: error 
            ? '#EF4444' 
            : isFocused 
              ? '#2563EB' 
              : isFloating 
                ? '#475569' 
                : '#64748B',
          pointerEvents: 'none',
          transition: 'all 0.15s cubic-bezier(0.4, 0, 0.2, 1)',
          lineHeight: 1,
          letterSpacing: isFloating ? '0.4px' : 'normal',
          textTransform: isFloating ? 'uppercase' : 'none',
          userSelect: 'none',
          zIndex: 2,
          display: 'flex',
          alignItems: 'center',
          gap: '5px'
        }}
      >
        <span>{label}</span>
        {required && <span style={{ color: '#EF4444', fontWeight: 800, fontSize: isFloating ? '12px' : '14px' }}>*</span>}
        {optional && !isFloating && <span style={{ color: '#94A3B8', fontSize: '12px', fontWeight: 400 }}>(Optional)</span>}
      </label>

      {/* Input or Textarea */}
      {multiline ? (
        <textarea
          value={value ?? ''}
          onChange={onChange}
          disabled={disabled}
          maxLength={maxLength}
          rows={rows}
          onFocus={(e) => {
            setIsFocused(true);
            if (onFocus) onFocus(e);
          }}
          onBlur={(e) => {
            setIsFocused(false);
            if (onBlur) onBlur(e);
          }}
          style={{
            width: '100%',
            border: 'none',
            outline: 'none',
            background: 'transparent',
            padding: isFloating ? '22px 16px 6px 16px' : '14px 16px',
            fontSize: '14px',
            fontWeight: 500,
            color: '#0F172A',
            boxSizing: 'border-box',
            fontFamily: 'inherit',
            resize: 'none',
            ...inputStyle
          }}
          {...props}
        />
      ) : (
        <input
          type={type}
          value={value ?? ''}
          onChange={onChange}
          disabled={disabled}
          maxLength={maxLength}
          onFocus={(e) => {
            setIsFocused(true);
            if (onFocus) onFocus(e);
          }}
          onBlur={(e) => {
            setIsFocused(false);
            if (onBlur) onBlur(e);
          }}
          style={{
            width: '100%',
            height: '100%',
            border: 'none',
            outline: 'none',
            background: 'transparent',
            padding: isFloating ? '20px 16px 4px 16px' : '0 16px',
            paddingRight: rightElement ? '42px' : '16px',
            fontSize: '14px',
            fontWeight: 500,
            color: '#0F172A',
            boxSizing: 'border-box',
            fontFamily: 'inherit',
            ...inputStyle
          }}
          {...props}
        />
      )}

      {/* Right Element */}
      {rightElement && (
        <div style={{ position: 'absolute', right: '14px', display: 'flex', alignItems: 'center', zIndex: 3 }}>
          {rightElement}
        </div>
      )}
    </div>
  );
};

const FloatingSelect = ({
  label,
  value,
  onChange,
  options = [],
  required = false,
  optional = false,
  disabled = false,
  error = false,
  style = {},
  children,
  ...props
}) => {
  const [isFocused, setIsFocused] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const hasValue = value !== undefined && value !== null && String(value).trim().length > 0;
  const isFloating = isFocused || hasValue;

  return (
    <div
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{
        position: 'relative',
        width: '100%',
        height: '52px',
        background: disabled 
          ? '#F8FAFC' 
          : isFocused 
            ? '#FFFFFF' 
            : isHovered 
              ? '#FFFFFF' 
              : 'linear-gradient(180deg, #FFFFFF 0%, #F8FAFC 100%)',
        border: `1.5px solid ${
          error 
            ? '#EF4444' 
            : isFocused 
              ? '#2563EB' 
              : isHovered 
                ? '#93C5FD' 
                : hasValue 
                  ? '#CBD5E1' 
                  : '#E2E8F0'
        }`,
        borderRadius: '12px',
        boxShadow: isFocused 
          ? '0 6px 20px -2px rgba(37, 99, 235, 0.15), 0 0 0 3.5px rgba(37, 99, 235, 0.12)' 
          : isHovered 
            ? '0 3px 10px rgba(15, 23, 42, 0.04)' 
            : '0 1px 2px rgba(0,0,0,0.02)',
        transition: 'all 0.18s cubic-bezier(0.4, 0, 0.2, 1)',
        display: 'flex',
        alignItems: 'center',
        boxSizing: 'border-box',
        cursor: disabled ? 'not-allowed' : 'pointer',
        ...style
      }}
    >
      <label
        style={{
          position: 'absolute',
          left: '16px',
          top: isFloating ? '7px' : '50%',
          transform: isFloating ? 'none' : 'translateY(-50%)',
          fontSize: isFloating ? '10.5px' : '13.5px',
          fontWeight: isFloating ? 700 : 450,
          color: error 
            ? '#EF4444' 
            : isFocused 
              ? '#2563EB' 
              : isFloating 
                ? '#475569' 
                : '#64748B',
          pointerEvents: 'none',
          transition: 'all 0.15s cubic-bezier(0.4, 0, 0.2, 1)',
          lineHeight: 1,
          letterSpacing: isFloating ? '0.4px' : 'normal',
          textTransform: isFloating ? 'uppercase' : 'none',
          userSelect: 'none',
          zIndex: 2,
          display: 'flex',
          alignItems: 'center',
          gap: '5px'
        }}
      >
        <span>{label}</span>
        {required && <span style={{ color: '#EF4444', fontWeight: 800, fontSize: isFloating ? '12px' : '14px' }}>*</span>}
        {optional && !isFloating && <span style={{ color: '#94A3B8', fontSize: '12px', fontWeight: 400 }}>(Optional)</span>}
      </label>

      <select
        value={value ?? ''}
        onChange={onChange}
        disabled={disabled}
        onFocus={() => setIsFocused(true)}
        onBlur={() => setIsFocused(false)}
        style={{
          width: '100%',
          height: '100%',
          border: 'none',
          outline: 'none',
          background: 'transparent',
          padding: isFloating ? '20px 36px 4px 16px' : '0 36px 0 16px',
          fontSize: '14px',
          fontWeight: 500,
          color: hasValue ? '#0F172A' : 'transparent',
          boxSizing: 'border-box',
          fontFamily: 'inherit',
          cursor: 'pointer',
          appearance: 'none',
          WebkitAppearance: 'none'
        }}
        {...props}
      >
        {children || options.map(opt => {
          const val = typeof opt === 'object' ? opt.value : opt;
          const lbl = typeof opt === 'object' ? opt.label : opt;
          return <option key={val} value={val} style={{ color: '#0F172A', fontSize: '13.5px' }}>{lbl}</option>;
        })}
      </select>

      <LucideIcon
        name="chevron-down"
        style={{
          position: 'absolute',
          right: '14px',
          width: '16px',
          height: '16px',
          color: '#64748B',
          pointerEvents: 'none'
        }}
      />
    </div>
  );
};

// ─── Hospital Identity & Branding Step ──────────────────────────────────────
const HospitalIdentityStep = ({ wizardHospital, updateWizardField }) => {
  const logoInputRef = React.useRef(null);
  const [editingHospName, setEditingHospName] = React.useState(false);
  const [hospNameDraft, setHospNameDraft] = React.useState(wizardHospital?.name || '');
  const [logoDragOver, setLogoDragOver] = React.useState(false);
  const [logoError, setLogoError] = React.useState('');

  React.useEffect(() => {
    if (!editingHospName) setHospNameDraft(wizardHospital?.name || '');
  }, [wizardHospital?.name, editingHospName]);

  const handleLogoFile = (file) => {
    setLogoError('');
    if (!file) return;
    if (!['image/png', 'image/jpeg', 'image/jpg', 'image/svg+xml'].includes(file.type)) {
      setLogoError('Only PNG, JPG, or SVG files are allowed.');
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setLogoError('Logo must be under 2 MB.');
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => updateWizardField('logo', e.target.result);
    reader.readAsDataURL(file);
  };

  const commitHospName = () => {
    const trimmed = hospNameDraft.trim();
    if (trimmed) updateWizardField('name', trimmed);
    setEditingHospName(false);
  };

  const cardStyle = {
    background: 'linear-gradient(135deg, #EFF6FF 0%, #F0FDF4 100%)',
    border: '1.5px solid #BFDBFE',
    borderRadius: '16px',
    padding: '22px 24px',
    display: 'flex',
    flexDirection: 'column',
    gap: '18px',
    marginBottom: '4px',
  };

  const dropzoneStyle = {
    width: '96px',
    height: '96px',
    borderRadius: '14px',
    border: logoDragOver ? '2.5px dashed #2563EB' : '2px dashed #93C5FD',
    background: logoDragOver ? '#EFF6FF' : '#F8FAFC',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    overflow: 'hidden',
    flexShrink: 0,
    transition: 'border-color 0.2s, background 0.2s',
  };

  return (
    <div style={cardStyle}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <LucideIcon name="image" size={18} color="#2563EB" />
        <span style={{ fontSize: '15px', fontWeight: 800, color: '#0F172A' }}>Hospital Identity &amp; Branding</span>
        <span style={{
          marginLeft: 'auto',
          fontSize: '10px',
          fontWeight: 700,
          color: '#2563EB',
          background: '#DBEAFE',
          borderRadius: '999px',
          padding: '2px 10px',
          letterSpacing: '0.4px',
          textTransform: 'uppercase',
        }}>Used in Portal</span>
      </div>

      {/* Logo + Name Row */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '20px' }}>
        {/* Logo Dropzone */}
        <div>
          <div
            style={dropzoneStyle}
            onClick={() => logoInputRef.current && logoInputRef.current.click()}
            onDragOver={(e) => { e.preventDefault(); setLogoDragOver(true); }}
            onDragLeave={() => setLogoDragOver(false)}
            onDrop={(e) => { e.preventDefault(); setLogoDragOver(false); const f = e.dataTransfer.files[0]; if (f) handleLogoFile(f); }}
            title="Click or drag to upload logo"
          >
            {wizardHospital && wizardHospital.logo ? (
              <img
                src={wizardHospital.logo}
                alt="Hospital Logo"
                style={{ width: '100%', height: '100%', objectFit: 'contain', padding: '6px' }}
              />
            ) : (
              <React.Fragment>
                <LucideIcon name="upload-cloud" size={24} color="#93C5FD" />
                <span style={{ fontSize: '10px', color: '#94A3B8', marginTop: '4px', textAlign: 'center', lineHeight: 1.3 }}>Upload<br/>Logo</span>
              </React.Fragment>
            )}
          </div>
          <input
            ref={logoInputRef}
            type="file"
            accept="image/png,image/jpeg,image/jpg,image/svg+xml"
            style={{ display: 'none' }}
            onChange={(e) => handleLogoFile(e.target.files[0])}
          />
          {/* Logo action buttons */}
          <div style={{ display: 'flex', gap: '6px', marginTop: '8px', justifyContent: 'center' }}>
            <button
              type="button"
              onClick={() => logoInputRef.current && logoInputRef.current.click()}
              style={{
                fontSize: '10px', fontWeight: 700, color: '#2563EB',
                background: '#EFF6FF', border: '1px solid #BFDBFE',
                borderRadius: '6px', padding: '3px 9px', cursor: 'pointer',
              }}
            >
              {wizardHospital && wizardHospital.logo ? 'Change' : 'Upload'}
            </button>
            {wizardHospital && wizardHospital.logo && (
              <button
                type="button"
                onClick={() => { updateWizardField('logo', ''); setLogoError(''); }}
                style={{
                  fontSize: '10px', fontWeight: 700, color: '#DC2626',
                  background: '#FEF2F2', border: '1px solid #FECACA',
                  borderRadius: '6px', padding: '3px 9px', cursor: 'pointer',
                }}
              >
                Remove
              </button>
            )}
          </div>
          {logoError && (
            <p style={{ margin: '4px 0 0 0', fontSize: '10px', color: '#DC2626' }}>{logoError}</p>
          )}
          <p style={{ margin: '4px 0 0 0', fontSize: '9px', color: '#94A3B8', textAlign: 'center' }}>PNG / JPG / SVG · max 2 MB</p>
        </div>

        {/* Hospital Name Edit */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '8px', paddingTop: '8px' }}>
          <span style={{ fontSize: '11px', fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Hospital Name</span>
          {editingHospName ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <input
                autoFocus
                value={hospNameDraft}
                onChange={(e) => setHospNameDraft(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') commitHospName(); if (e.key === 'Escape') setEditingHospName(false); }}
                style={{
                  width: '100%', padding: '9px 12px',
                  fontSize: '14px', fontWeight: 600, color: '#0F172A',
                  border: '1.5px solid #2563EB', borderRadius: '8px',
                  outline: 'none', background: '#FFFFFF',
                  boxSizing: 'border-box',
                }}
                placeholder="Enter hospital name"
              />
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  type="button"
                  onClick={commitHospName}
                  style={{
                    fontSize: '12px', fontWeight: 700, color: '#FFFFFF',
                    background: '#2563EB', border: 'none',
                    borderRadius: '7px', padding: '6px 16px', cursor: 'pointer',
                  }}
                >Save</button>
                <button
                  type="button"
                  onClick={() => { setEditingHospName(false); setHospNameDraft(wizardHospital?.name || ''); }}
                  style={{
                    fontSize: '12px', fontWeight: 700, color: '#64748B',
                    background: '#F1F5F9', border: 'none',
                    borderRadius: '7px', padding: '6px 16px', cursor: 'pointer',
                  }}
                >Cancel</button>
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{
                fontSize: '15px', fontWeight: 700,
                color: wizardHospital && wizardHospital.name ? '#0F172A' : '#94A3B8',
              }}>
                {wizardHospital && wizardHospital.name ? wizardHospital.name : 'Not set'}
              </span>
              <button
                type="button"
                onClick={() => { setHospNameDraft(wizardHospital?.name || ''); setEditingHospName(true); }}
                title="Edit hospital name"
                style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', padding: '3px',
                  borderRadius: '6px', color: '#2563EB',
                }}
              >
                <LucideIcon name="pencil" size={14} color="#2563EB" />
              </button>
            </div>
          )}
          <p style={{ margin: 0, fontSize: '11px', color: '#64748B', lineHeight: 1.5 }}>
            The name set in Step 1. Use the pencil icon to update it here.
          </p>
        </div>
      </div>

      {/* Info pill */}
      <div style={{
        background: '#EFF6FF', border: '1px solid #BFDBFE',
        borderRadius: '8px', padding: '9px 13px',
        display: 'flex', alignItems: 'flex-start', gap: '8px',
      }}>
        <LucideIcon name="info" size={14} color="#2563EB" />
        <span style={{ fontSize: '11px', color: '#1D4ED8', lineHeight: 1.55 }}>
          This logo and name will appear on the hospital&apos;s staff login portal, email notifications, and patient-facing screens.
        </span>
      </div>
    </div>
  );
};
// ────────────────────────────────────────────────────────────────────────────

const SuperAdminDashboard = ({ initialTab }) => {
  const navigate = useNavigate();
  const superAdminChatEndRef = useRef(null);
  const moduleUpdateTimeouts = useRef({});
  const latestModulesRef = useRef({});
  const rollbackModulesRef = useRef({});

  // Current user details
  const [currentUser, setCurrentUser] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('user')) || { name: 'Super Admin', email: 'super.admin@curoxa.com', role: 'superadmin' };
    } catch (_) {
      return { name: 'Super Admin', email: 'super.admin@curoxa.com', role: 'superadmin' };
    }
  });

  // Resolve platform role: only root master superadmin is 'Super Admin', internal team members have 1 of 3 operational roles
  const resolvePlatformRole = (user) => {
    if (!user) return 'Onboarding Manager';
    const staffId = (user.staff_id || '').toLowerCase().trim();
    const email = (user.email || '').toLowerCase().trim();
    if (staffId === 'superadmin' || email === 'super.admin@curoxa.com' || user.isRootAdmin) {
      return 'Super Admin';
    }
    let role = user.platformRole || user.specialty || '';
    if (role === 'Request Handler' || role === 'Technical Support') {
      return 'Ticket Manager';
    }
    if (role === 'Onboarding Manager' || role === 'Ticket Manager' || role === 'Finance Manager') {
      return role;
    }
    if (role === 'Super Admin' || role === 'Platform Admin') {
      return 'Super Admin';
    }
    return 'Onboarding Manager';
  };

  const currentUserPlatformRole = resolvePlatformRole(currentUser);
  const isSuperAdmin = currentUserPlatformRole === 'Super Admin';

  // RBAC Configuration: exactly 3 internal manager roles + root master Super Admin
  const ROLE_ACCESS_MAP = {
    'Super Admin': ['dashboard', 'hospital-onboarding', 'hospitals', 'subscription-mgmt', 'customer-support', 'broadcast-center', 'finance', 'employees', 'reports', 'settings'],
    'Onboarding Manager': ['hospital-onboarding', 'hospitals'],
    'Ticket Manager': ['customer-support', 'broadcast-center'],
    'Finance Manager': ['subscription-mgmt', 'finance', 'reports']
  };

  const DEFAULT_TAB_MAP = {
    'Super Admin': 'dashboard',
    'Onboarding Manager': 'hospital-onboarding',
    'Ticket Manager': 'customer-support',
    'Finance Manager': 'subscription-mgmt'
  };

  const allowedTabs = isSuperAdmin
    ? ROLE_ACCESS_MAP['Super Admin']
    : (ROLE_ACCESS_MAP[currentUserPlatformRole] || ROLE_ACCESS_MAP['Onboarding Manager']);

  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isRightSidebarCollapsed, setIsRightSidebarCollapsed] = useState(true);
  const [activeTab, setActiveTab] = useState(() => {
    return initialTab || DEFAULT_TAB_MAP[currentUserPlatformRole] || 'dashboard';
  });

  useEffect(() => {
    if (initialTab) {
      setActiveTab(initialTab);
    }
  }, [initialTab]);

  const filteredMenuGroups = menuGroups.map(group => ({
    ...group,
    items: isSuperAdmin ? group.items : group.items.filter(item => allowedTabs.includes(item.id))
  })).filter(group => group.items.length > 0);
  
  // Resolve activeTab to base menu id
  const getBaseTabId = (tab) => {
    if (tab === 'support-success' || tab === 'tickets' || tab === 'customer-support') return 'customer-support';
    if (tab === 'finance-mgmt' || tab === 'finance-revenue' || tab === 'finance-renewals' || tab === 'invoices' || tab === 'finance') return 'finance';
    if (tab === 'hr-mgmt' || tab === 'departments' || tab === 'task-assignments' || tab === 'platform-roles' || tab === 'platform-audits' || tab === 'employees') return 'employees';
    if (tab === 'bi-reports' || tab === 'reports') return 'reports';
    if (tab === 'platform-control' || tab === 'settings' || tab === 'backups') return 'settings';
    if (tab === 'onboarding') return 'hospital-onboarding';
    return tab;
  };
  
  // Super Admin is never restricted across any module
  const isTabAllowed = isSuperAdmin ? true : allowedTabs.includes(getBaseTabId(activeTab));

  // Automatically normalize any legacy or search tab aliases
  useEffect(() => {
    if (activeTab === 'onboarding') setActiveTab('hospital-onboarding');
    else if (activeTab === 'tickets' || activeTab === 'customer-support') setActiveTab('support-success');
    else if (activeTab === 'invoices' || activeTab === 'finance') setActiveTab('finance-mgmt');
    else if (activeTab === 'employees') setActiveTab('hr-mgmt');
    else if (activeTab === 'settings' || activeTab === 'backups') setActiveTab('platform-control');
    else if (activeTab === 'reports') setActiveTab('bi-reports');
  }, [activeTab]);

  // Ensure Super Admin application shell takes full 100% viewport width without 0.9 zoom shrinkage
  useEffect(() => {
    const originalHtmlZoom = document.documentElement.style.zoom;
    const originalBodyZoom = document.body.style.zoom;
    document.documentElement.style.zoom = '1';
    document.body.style.zoom = '1';
    return () => {
      document.documentElement.style.zoom = originalHtmlZoom;
      document.body.style.zoom = originalBodyZoom;
    };
  }, []);
  
  // Custom Confirmation Modal State (replaces native window.confirm)
  const [confirmModalConfig, setConfirmModalConfig] = useState(null);

  // Toast notifications state
  const [toast, setToast] = useState(null);
  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => {
      setToast(null);
    }, 3500);
  };

  // Real-time notifications and meetings state
  const [notifications, setNotifications] = useState([]);
  const [meetings, setMeetings] = useState([]);
  const [newMeetingTitle, setNewMeetingTitle] = useState('');
  const [newMeetingTime, setNewMeetingTime] = useState('10:00 AM');
  const [newMeetingDate, setNewMeetingDate] = useState(new Date().toISOString().split('T')[0]);

  const refreshNotifications = async () => {
    try {
      const token = localStorage.getItem('token');
      const headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      };
      const notificationsRes = await fetch('/api/superadmin/notifications', { headers });
      if (notificationsRes.ok) {
        const data = await notificationsRes.json();
        if (data) setNotifications(data);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const markAsRead = async (id) => {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`/api/superadmin/notifications/${id}/read`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      });
      if (res.ok) {
        const updated = await res.json();
        setNotifications(prev => prev.map(n => n._id === id ? updated : n));
      }
    } catch (err) {
      console.error(err);
    }
  };

  const markAllAsRead = async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch('/api/superadmin/notifications/mark-all-read', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      });
      if (res.ok) {
        setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
        showToast('All notifications marked as read', 'success');
      }
    } catch (err) {
      console.error(err);
    }
  };

  const clearAllNotifications = async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch('/api/superadmin/notifications/clear', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      });
      if (res.ok) {
        setNotifications([]);
        showToast('All notifications cleared', 'success');
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleAddMeeting = async (e) => {
    if (e) e.preventDefault();
    if (!newMeetingTitle.trim()) {
      showToast('Please enter a meeting title', 'error');
      return;
    }
    try {
      const token = localStorage.getItem('token');
      const res = await fetch('/api/superadmin/meetings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          title: newMeetingTitle,
          time: newMeetingTime,
          date: newMeetingDate
        })
      });
      if (res.ok) {
        const added = await res.json();
        setMeetings(prev => [...prev, added].sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time)));
        setNewMeetingTitle('');
        showToast('Meeting scheduled successfully', 'success');
      }
    } catch (err) {
      console.error(err);
      showToast('Failed to schedule meeting', 'error');
    }
  };

  const handleDeleteMeeting = async (id) => {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`/api/superadmin/meetings/${id}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      });
      if (res.ok) {
        setMeetings(prev => prev.filter(m => m._id !== id));
        showToast('Meeting cancelled/removed', 'success');
      }
    } catch (err) {
      console.error(err);
      showToast('Failed to cancel meeting', 'error');
    }
  };
  
  // Onboarding action simulation states
  const [provisioningId, setProvisioningId] = useState(null);
  const [provisionedId, setProvisionedId] = useState(null);
  const [previewDoc, setPreviewDoc] = useState(null);

  const [showPasswords, setShowPasswords] = useState({});

  const togglePasswordVisibility = (key) => {
    setShowPasswords(prev => ({
      ...prev,
      [key]: !prev[key]
    }));
  };

  const handleProvisionAdmin = async (id) => {
    setProvisioningId(id);
    try {
      await new Promise(resolve => setTimeout(resolve, 1800));
      setProvisionedId(id);
      showToast('Admin SMTP invitation credentials sent successfully!', 'success');
    } catch (err) {
      console.error(err);
      showToast('Failed to dispatch provisioning SMTP invite.', 'error');
    } finally {
      setProvisioningId(null);
    }
  };


  // Onboarding sub-view state
  const [onboardingSubTab, setOnboardingSubTab] = useState('onboarding-pipeline'); 
  const [selectedOnboardingId, setSelectedOnboardingId] = useState(null);
  const [hospitalTypeSearchOpen, setHospitalTypeSearchOpen] = useState(false);

  // Hospital Management sub-view state
  const [hospitalSubTab, setHospitalSubTab] = useState('list'); 
  const [selectedHospitalId, setSelectedHospitalId] = useState(null);
  const [selectedPlanForUpgrade, setSelectedPlanForUpgrade] = useState('');
  const [profileActiveTab, setProfileActiveTab] = useState('Overview'); 

  // Subscription & Feature Builder sub-view state
  const [subscriptionSubTab, setSubscriptionSubTab] = useState('billing-overview');
  
  // HR & Employee Management sub-view state (Step 6)
  const [hrSubTab, setHrSubTab] = useState('hr-dashboard'); 
  const [selectedEmployeeId, setSelectedEmployeeId] = useState(1);
  const [employeeProfileTab, setEmployeeProfileTab] = useState('Overview');
  const [empWizardStep, setEmpWizardStep] = useState(1);

  // Support & Customer Success sub-view state (Step 7)
  const [supportSubTab, setSupportSubTab] = useState('support-dashboard'); 
  const [selectedTicketId, setSelectedTicketId] = useState('TCK-2903');
  const [ticketActiveTab, setTicketActiveTab] = useState('Conversation');
  const [chatMessageText, setChatMessageText] = useState('');

  // Finance & Billing sub-view state (Step 8)
  const [finSubTab, setFinSubTab] = useState('finance-dashboard'); 
  const [selectedInvoiceId, setSelectedInvoiceId] = useState('INV-2026-001');

  // Business Intelligence & Reports sub-view state (Step 9)
  const [biSubTab, setBiSubTab] = useState('bi-dashboard'); 
  const [drillDownPath, setDrillDownPath] = useState(['Revenue']);
  const [customReportForm, setCustomReportForm] = useState({ source: 'Invoices', groupField: 'Hospital', aggType: 'Sum', calcField: 'Amount', reportName: 'New Hospital Ingress Report' });
  const [scheduleReportForm, setScheduleReportForm] = useState({ reportType: 'Weekly Revenue Summary', frequency: 'Weekly', format: 'PDF', recipientEmail: 'ceo@curoxa.com' });

  // Platform Control & Administration sub-view state (Step 10)
  const [ctrlSubTab, setCtrlSubTab] = useState('platform-dashboard'); // platform-dashboard, roles-engine, task-engine, approval-engine, notification-engine, api-integration, white-labeling, feature-flags, storage-mgmt, audit-logs, activity-logs, security-center, background-jobs, backup-restore, system-health, global-settings, developer-center
  const [selectedHospitalForFlag, setSelectedHospitalForFlag] = useState('City Dental Group');
  const [flagSettings, setFlagSettings] = useState({
    telemedicine: true,
    abha: true,
    aiAssistant: false,
    payroll: true,
    patientApp: true
  });

  // Dynamic Telemetry Infrastructure States
  const [telemetryCpu, setTelemetryCpu] = useState(14);
  const [telemetryMem, setTelemetryMem] = useState(42);
  const [telemetryDbStatus, setTelemetryDbStatus] = useState('Healthy');

  useEffect(() => {
    const cpuInterval = setInterval(() => {
      setTelemetryCpu(Math.floor(10 + Math.random() * 16));
    }, 3000);

    const memInterval = setInterval(() => {
      setTelemetryMem(Math.floor(40 + Math.random() * 6));
    }, 5000);

    const checkDbStatus = async () => {
      try {
        const res = await fetch('/api/auth/ping');
        if (res.ok) {
          setTelemetryDbStatus('Healthy');
        } else {
          setTelemetryDbStatus('Offline');
        }
      } catch (err) {
        setTelemetryDbStatus('Offline');
      }
    };
    checkDbStatus();
    const dbInterval = setInterval(checkDbStatus, 10000);

    return () => {
      clearInterval(cpuInterval);
      clearInterval(memInterval);
      clearInterval(dbInterval);
    };
  }, []);

  const [brandSettings, setBrandSettings] = useState({
    themeColor: '#2563EB',
    fontFamily: 'Outfit',
    customDomain: 'admin.curoxa.com',
    companyName: 'Curoxa SaaS'
  });

  const [backups, setBackups] = useState([]);

  const [auditLogs, setAuditLogs] = useState([]);

  // Form states for assignments (HR)
  const [tempRoleForm, setTempRoleForm] = useState({ employeeId: 1, roleName: '', validFrom: '', validTill: '', reason: '', approver: '' });
  const [taskAssignForm, setTaskAssignForm] = useState({ taskTitle: '', priority: 'High', deadline: '', assignedTo: '', deptName: '', status: 'Pending' });
  const [empWizardData, setEmpWizardData] = useState({ name: '', email: '', mobile: '', dob: '', address: '', emergencyContact: '', designation: '', department: '', reportingManager: '', salaryGrade: '', location: '', shift: '', empType: '' });

  // Support creator form state
  const [newTicketForm, setNewTicketForm] = useState({ hospitalName: '', contactPerson: '', department: 'Pharmacy', priority: 'High', category: 'Technical Issue', assignedExecutive: 'Platform Admin', description: '' });
  const [broadcastForm, setBroadcastForm] = useState({ audience: 'All Hospital Administrators', subject: '', message: '' });

  // Global overlay drawers / search / action states
  const [isNotificationOpen, setIsNotificationOpen] = useState(false);
  const [isSearchModalOpen, setIsSearchModalOpen] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isConfigDrawerOpen, setIsConfigDrawerOpen] = useState(false);
  const [hoveredSlice, setHoveredSlice] = useState(null);
  const [showPendingDocsModal, setShowPendingDocsModal] = useState(false);

  const getPendingDocumentsList = () => {
    const list = [];
    hospitals.forEach(h => {
      if (!h.isGstVerified && h.gst) {
        list.push({ hospital: h.name, docType: 'GSTIN', value: h.gst, status: 'Unverified (Active Hospital)', id: h._id, type: 'hospital' });
      }
      if (!h.isLicenseVerified && h.license) {
        list.push({ hospital: h.name, docType: 'CDSCO Drug License', value: h.license, status: 'Unverified (Active Hospital)', id: h._id, type: 'hospital' });
      }
    });
    onboardingHospitals.forEach(o => {
      if (o.panGstStatus === 'Pending' || (o.panNumber && o.panGstStatus !== 'Approved')) {
        list.push({ hospital: o.name || 'Unnamed Onboarding', docType: 'PAN / GSTIN Documents', value: `${o.panNumber || ''} / ${o.gstin || ''}`, status: 'Pending Review (Onboarding)', id: o._id, type: 'onboarding' });
      }
      if (o.sandboxStatus === 'Pending' || (o.corpId && o.sandboxStatus !== 'Approved')) {
        list.push({ hospital: o.name || 'Unnamed Onboarding', docType: 'Corporate Credentials / Sandbox checks', value: o.corpId || '', status: 'Pending Review (Onboarding)', id: o._id, type: 'onboarding' });
      }
      if (o.entityStatus === 'Pending') {
        list.push({ hospital: o.name || 'Unnamed Onboarding', docType: 'Entity Registration documents', value: '', status: 'Pending Review (Onboarding)', id: o._id, type: 'onboarding' });
      }
      if (o.adminStatus === 'Pending') {
        list.push({ hospital: o.name || 'Unnamed Onboarding', docType: 'Admin approval documents', value: '', status: 'Pending Review (Onboarding)', id: o._id, type: 'onboarding' });
      }
    });
    return list;
  };

  const [hoveredPoint, setHoveredPoint] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [hospFilterTab, setHospFilterTab] = useState('All');
  const [hospCurrentPage, setHospCurrentPage] = useState(1);
  const [subCurrentPage, setSubCurrentPage] = useState(1);
  const [subSearch, setSubSearch] = useState('');
  const [subPlanFilter, setSubPlanFilter] = useState('All');
  const [subStatusFilter, setSubStatusFilter] = useState('All');

  const getFormattedPlanString = (subPlan, cycle) => {
    const plan = subPlan || 'professional';
    const isAnnual = cycle === 'annual';
    
    const p = plans.find(p => p.matchKey === plan);
    if (p) {
      return isAnnual 
        ? `${p.tier} Annual (₹${p.annualPrice.toLocaleString()}/mo)` 
        : `${p.tier} (₹${p.monthlyPrice.toLocaleString()}/mo)`;
    }

    if (plan === 'basic') {
      return isAnnual ? 'Basic Annual (₹4,000/mo)' : 'Basic (₹5,000/mo)';
    } else if (plan === 'enterprise') {
      return isAnnual ? 'Enterprise Elite Annual (₹40,000/mo)' : 'Enterprise Elite (₹50,000/mo)';
    } else if (plan === 'custom') {
      return 'Trial Plan';
    } else {
      return isAnnual ? 'Professional Annual (₹19,200/mo)' : 'Professional (₹24,000/mo)';
    }
  };

  const [isActivateModalOpen, setIsActivateModalOpen] = useState(false);
  const [selectedOnboardingHospital, setSelectedOnboardingHospital] = useState(null);
  const [activateForm, setActivateForm] = useState({ 
    code: '', 
    plan: '', 
    csm: '', 
    gst: '', 
    isGstVerified: false,
    gstVerificationDetails: null,
    license: '', 
    isLicenseVerified: false,
    licenseVerificationDetails: null,
    address: '', 
    adminName: '', 
    adminEmail: '', 
    adminPhone: '', 
    adminPassword: '' 
  });
  const [plans, setPlans] = useState([]);
  const [isOnboardingWizardOpen, setIsOnboardingWizardOpen] = useState(false);
  const [portalSuccessModal, setPortalSuccessModal] = useState(null);
  const [isActivating, setIsActivating] = useState(false);
  const [isExitingWizard, setIsExitingWizard] = useState(false);
  const [wizardHospital, setWizardHospital] = useState(null);
  const [wizardStep, setWizardStep] = useState(1);
  const [isDraftSaved, setIsDraftSaved] = useState(false);
  const [isEditingPlanModalOpen, setIsEditingPlanModalOpen] = useState(false);
  const [editingPlan, setEditingPlan] = useState(null);
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [impersonatingHospital, setImpersonatingHospital] = useState(null);
  const [isAddUserDrawerOpen, setIsAddUserDrawerOpen] = useState(false);
  const [isLogoEditModalOpen, setIsLogoEditModalOpen] = useState(false);
  const [logoEditHosp, setLogoEditHosp] = useState(null);
  const [logoEditDraft, setLogoEditDraft] = useState('');
  const [logoEditNameDraft, setLogoEditNameDraft] = useState('');
  const [logoEditError, setLogoEditError] = useState('');
  const [logoEditSaving, setLogoEditSaving] = useState(false);
  const [logoEditDragOver, setLogoEditDragOver] = useState(false);
  const logoEditInputRef = useRef(null);
  const drawerAvatarInputRef = useRef(null);
  const [drawerForm, setDrawerForm] = useState({
    firstName: '',
    lastName: '',
    email: '',
    password: '',
    phone: '',
    secPhone: '',
    branch: '',
    department: '',
    manager: '',
    shift: '',
    role: '',
    avatar: '',
    ehrAccess: false,
    prescriptions: false,
    userMgmt: false,
    systemSettings: false
  });
  const [impersonatedStaff, setImpersonatedStaff] = useState([]);
  const [selectedStaffToEdit, setSelectedStaffToEdit] = useState(null);
  const [isAddStaffModalOpen, setIsAddStaffModalOpen] = useState(false);
  const [impersonatedTab, setImpersonatedTab] = useState('overview');
  const [expandedSteps, setExpandedSteps] = useState([1]);

  const [impersonatedStats, setImpersonatedStats] = useState(null);
  const [impersonatedPatients, setImpersonatedPatients] = useState([]);
  const [impersonatedDoctors, setImpersonatedDoctors] = useState([]);
  const [showImpersonatedPatientModal, setShowImpersonatedPatientModal] = useState(false);
  const [showImpersonatedApptModal, setShowImpersonatedApptModal] = useState(false);
  const [showImpersonatedInvoiceModal, setShowImpersonatedInvoiceModal] = useState(false);
  const [showImpersonatedLabModal, setShowImpersonatedLabModal] = useState(false);

  const handleLogoEditFile = (file) => {
    setLogoEditError('');
    if (!file) return;
    if (!['image/png', 'image/jpeg', 'image/jpg', 'image/svg+xml'].includes(file.type)) {
      setLogoEditError('Only PNG, JPG, or SVG allowed.');
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setLogoEditError('Logo must be under 2 MB.');
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => setLogoEditDraft(e.target.result);
    reader.readAsDataURL(file);
  };

  const handleLogoEditSave = async () => {
    if (!logoEditHosp) return;
    setLogoEditSaving(true);
    setLogoEditError('');
    try {
      const token = localStorage.getItem('token') || localStorage.getItem('superadminToken');
      const body = { logo: logoEditDraft };
      if (logoEditNameDraft.trim()) {
        body.name = logoEditNameDraft.trim();
      }
      const res = await fetch(`/api/superadmin/hospitals/${logoEditHosp._id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(body)
      });
      if (res.ok) {
        const updated = await res.json();
        setHospitals(prev => prev.map(h => h._id === logoEditHosp._id ? { ...h, ...updated } : h));
        if (logoEditHosp.hospitalId) {
          const hospIdUpper = logoEditHosp.hospitalId.toUpperCase();
          try {
            sessionStorage.setItem(`curoxa_portal_${hospIdUpper}`, JSON.stringify({
              hospitalId: hospIdUpper,
              name: updated.name || logoEditNameDraft.trim() || logoEditHosp.name,
              logo: updated.logo || logoEditDraft,
              status: updated.status || logoEditHosp.status || 'Active'
            }));
          } catch (storageErr) {}
          try {
            window.dispatchEvent(new CustomEvent('curoxa_portal_branding_updated', {
              detail: { hospitalId: hospIdUpper }
            }));
          } catch (eventErr) {}
        }
        setIsLogoEditModalOpen(false);
        showToast('Hospital branding updated successfully!', 'success');
      } else {
        const err = await res.json();
        setLogoEditError(err.error || 'Failed to save hospital branding.');
      }
    } catch (e) {
      setLogoEditError('Network error. Please try again.');
    } finally {
      setLogoEditSaving(false);
    }
  };

  const fetchImpersonatedStats = async (hospCode) => {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`/api/superadmin/hospitals/${hospCode}/dashboard-stats`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setImpersonatedStats(data);
      }
    } catch (err) {
      console.error('Error fetching dashboard stats:', err);
    }
  };

  const fetchImpersonatedPatients = async (hospCode) => {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`/api/superadmin/hospitals/${hospCode}/patients`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setImpersonatedPatients(data);
      }
    } catch (err) {
      console.error('Error fetching patients:', err);
    }
  };

  const fetchImpersonatedDoctors = async (hospCode) => {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`/api/superadmin/hospitals/${hospCode}/doctors`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setImpersonatedDoctors(data);
      }
    } catch (err) {
      console.error('Error fetching doctors:', err);
    }
  };

  const handleAddImpersonatedPatient = async (patientData) => {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`/api/superadmin/hospitals/${impersonatingHospital.code}/patients`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(patientData)
      });
      if (res.ok) {
        showToast('Patient registered successfully.', 'success');
        setShowImpersonatedPatientModal(false);
        fetchImpersonatedPatients(impersonatingHospital.code);
        fetchImpersonatedStats(impersonatingHospital.code);
      } else {
        const data = await res.json();
        showToast(data.error || 'Failed to add patient.', 'error');
      }
    } catch (err) {
      console.error(err);
      showToast('Error adding patient.', 'error');
    }
  };

  const handleAddImpersonatedAppointment = async (apptData) => {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`/api/superadmin/hospitals/${impersonatingHospital.code}/appointments`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(apptData)
      });
      if (res.ok) {
        showToast('Appointment scheduled successfully.', 'success');
        setShowImpersonatedApptModal(false);
        fetchImpersonatedStats(impersonatingHospital.code);
      } else {
        const data = await res.json();
        showToast(data.error || 'Failed to schedule appointment.', 'error');
      }
    } catch (err) {
      console.error(err);
      showToast('Error scheduling appointment.', 'error');
    }
  };

  const handleAddImpersonatedInvoice = async (invoiceData) => {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`/api/superadmin/hospitals/${impersonatingHospital.code}/billing`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(invoiceData)
      });
      if (res.ok) {
        showToast('Invoice created successfully.', 'success');
        setShowImpersonatedInvoiceModal(false);
        fetchImpersonatedStats(impersonatingHospital.code);
      } else {
        const data = await res.json();
        showToast(data.error || 'Failed to create invoice.', 'error');
      }
    } catch (err) {
      console.error(err);
      showToast('Error creating invoice.', 'error');
    }
  };

  const handleAddImpersonatedLab = async (labData) => {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`/api/superadmin/hospitals/${impersonatingHospital.code}/labs`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(labData)
      });
      if (res.ok) {
        showToast('Lab request ordered successfully.', 'success');
        setShowImpersonatedLabModal(false);
        fetchImpersonatedStats(impersonatingHospital.code);
      } else {
        const data = await res.json();
        showToast(data.error || 'Failed to order lab request.', 'error');
      }
    } catch (err) {
      console.error(err);
      showToast('Error ordering lab request.', 'error');
    }
  };

  const handleImpersonateLogin = async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`/api/superadmin/hospitals/${impersonatingHospital.code}/impersonate-login`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      if (res.ok) {
        const data = await res.json();
        const currentSession = {
          token: localStorage.getItem('token'),
          user: localStorage.getItem('user'),
          tenantModules: localStorage.getItem('tenantModules')
        };
        localStorage.setItem('curoxa_superadmin_session', JSON.stringify(currentSession));
        
        localStorage.setItem('token', data.token);
        localStorage.setItem('user', JSON.stringify(data.user));
        localStorage.setItem('tenantModules', JSON.stringify(data.tenantModules));
        
        showToast(`Impersonating as Administrator of ${impersonatingHospital.name}. Redirecting...`, 'success');
        setTimeout(() => {
          window.location.href = '/dashboard';
        }, 1500);
      } else {
        const errData = await res.json();
        showToast(errData.error || 'Impersonation login failed.', 'error');
      }
    } catch (err) {
      console.error(err);
      showToast('Error switching to tenant workspace.', 'error');
    }
  };

  const fetchImpersonatedStaff = async (hospCode) => {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`/api/superadmin/hospitals/${hospCode}/staff`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setImpersonatedStaff(data);
      }
    } catch (err) {
      console.error('Error fetching staff:', err);
    }
  };

  useEffect(() => {
    if (impersonatingHospital) {
      fetchImpersonatedStaff(impersonatingHospital.code);
      fetchImpersonatedStats(impersonatingHospital.code);
      fetchImpersonatedPatients(impersonatingHospital.code);
      fetchImpersonatedDoctors(impersonatingHospital.code);
    }
  }, [impersonatingHospital]);

  const emptyEmployeeForm = {
    name: '',
    email: '',
    mobile: '',
    joiningDate: '',
    password: '',
    department: '',
    designation: '',
    platformRole: 'Onboarding Manager',
    status: 'Active'
  };
  const [employeeForm, setEmployeeForm] = useState(emptyEmployeeForm);

  const [uploadingDoc, setUploadingDoc] = useState(false);
  const [docUploadError, setDocUploadError] = useState('');

  // Verification states
  const [isVerifyingLicense, setIsVerifyingLicense] = useState(false);
  const [verificationError, setVerificationError] = useState('');
  const [isVerifyingGstin, setIsVerifyingGstin] = useState(false);
  const [gstinVerificationError, setGstinVerificationError] = useState('');

  const handleVerifyStep = async (hospital, stepName, newStatus) => {
    const token = localStorage.getItem('token');
    let updateData = {};
    if (stepName === 'panGst') {
      updateData.panGstStatus = newStatus;
    } else if (stepName === 'entity') {
      updateData.entityStatus = newStatus;
    } else if (stepName === 'sandbox') {
      updateData.sandboxStatus = newStatus;
    } else if (stepName === 'admin') {
      updateData.adminStatus = newStatus;
    }

    const panGst = stepName === 'panGst' ? newStatus : (hospital.panGstStatus || 'Pending');
    const entity = stepName === 'entity' ? newStatus : (hospital.entityStatus || 'Pending');
    const admin = stepName === 'admin' ? newStatus : (hospital.adminStatus || 'Pending');

    let approvedCount = 0;
    if (panGst === 'Approved') approvedCount++;
    if (entity === 'Approved') approvedCount++;
    if (admin === 'Approved') approvedCount++;

    updateData.progress = Math.round(approvedCount * (100 / 3));
    
    if (updateData.progress <= 33) {
      updateData.stage = 'Verification';
    } else if (updateData.progress <= 67) {
      updateData.stage = 'Configuration';
    } else if (updateData.progress >= 99) {
      updateData.stage = 'Go Live';
    }

    try {
      const res = await fetch(`/api/superadmin/onboarding/${hospital._id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify(updateData)
      });
      if (res.ok) {
        const updated = await res.json();
        setOnboardingHospitals(prev => prev.map(o => o._id === hospital._id ? updated : o));
        setSelectedOnboardingHospital(updated);
        showToast(`Verification step updated successfully!`);
        refreshNotifications();
      } else {
        showToast(`Failed to update verification status.`, 'error');
      }
    } catch (err) {
      console.error(err);
      showToast(`Error updating verification.`, 'error');
    }
  };

  const handleAutoCreateOnboarding = async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch('/api/superadmin/onboarding', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          name: '',
          exec: currentUser?.name || 'Platform Admin',
          progress: 0,
          daysLeft: 10,
          priority: 'Medium',
          stage: 'Verification',
          panNumber: '',
          gstin: '',
          corpId: '',
          signatoryName: '',
          sandboxDbUrl: '',
          adminName: '',
          adminEmail: '',
          adminPhone: '',
          adminPassword: ''
        })
      });

      if (res.ok) {
        const newOnb = await res.json();
        setOnboardingHospitals(prev => [newOnb, ...prev]);
        setWizardHospital(newOnb);
        setWizardStep(1);
        setIsOnboardingWizardOpen(true);
        showToast('Hospital onboarding started. Fill in details below!', 'success');
        refreshNotifications();
      } else {
        const errData = await res.json();
        showToast(errData.error || 'Failed to initiate onboarding.', 'error');
      }
    } catch (err) {
      console.error(err);
      showToast('Error creating onboarding record.', 'error');
    }
  };

  const executeHospitalActivation = async (hospitalToActivate, formOverrides = {}) => {
    const token = localStorage.getItem('token');
    
    const hospitalName = (formOverrides.name || hospitalToActivate?.name || '').trim();
    const adminName = (formOverrides.adminName || hospitalToActivate?.adminName || '').trim();
    const adminEmail = (formOverrides.adminEmail || hospitalToActivate?.adminEmail || '').trim();
    const adminPhone = (formOverrides.adminPhone || hospitalToActivate?.adminPhone || '').trim();
    const adminPassword = (formOverrides.adminPassword || hospitalToActivate?.adminPassword || '').trim();
    const confirmAdminPassword = formOverrides.confirmAdminPassword !== undefined ? formOverrides.confirmAdminPassword : hospitalToActivate?.confirmAdminPassword;

    if (!hospitalName) {
      showToast('Hospital name is required to go live.', 'error');
      return false;
    }
    if (!adminName || !adminEmail || !adminPhone || !adminPassword) {
      showToast('All administrator credentials (name, email, telephone, and password) are required.', 'error');
      return false;
    }
    if (confirmAdminPassword !== undefined && adminPassword !== confirmAdminPassword) {
      showToast('Admin passwords do not match.', 'error');
      return false;
    }

    setIsActivating(true);
    try {
      const activePlan = plans.find(p => p.matchKey === (hospitalToActivate.subscriptionPlan || 'professional')) || plans.find(p => p.matchKey === 'professional') || plans[0];
      
      let docLimit = activePlan?.docs || (activePlan?.tier?.includes('Enterprise') ? 200 : activePlan?.tier?.includes('Basic') ? 10 : 50);
      let staffLimit = activePlan?.staff || (activePlan?.tier?.includes('Enterprise') ? 500 : activePlan?.tier?.includes('Basic') ? 20 : 100);
      let storageLimit = parseInt(activePlan?.storage) || 200;
      let amount = hospitalToActivate.billingCycle === 'annual' ? (activePlan?.annualPrice ?? 240000) : (activePlan?.monthlyPrice ?? 24000);

      // Resolve module configuration from dossier
      const checkKey = (moduleKey) => {
        if (hospitalToActivate?.configuredModules && typeof hospitalToActivate.configuredModules[moduleKey] === 'boolean') {
          return hospitalToActivate.configuredModules[moduleKey];
        }
        if (hospitalToActivate?.configuredModules && hospitalToActivate.configuredModules[moduleKey]?.enabled !== undefined) {
          return Boolean(hospitalToActivate.configuredModules[moduleKey].enabled);
        }
        if (Array.isArray(hospitalToActivate?.modules)) {
          return hospitalToActivate.modules.includes(moduleKey);
        }
        if (hospitalToActivate?.modules && typeof hospitalToActivate.modules === 'object' && hospitalToActivate.modules[moduleKey]) {
          return Boolean(hospitalToActivate.modules[moduleKey].enabled !== false);
        }
        if (activePlan?.modules) {
          return activePlan.modules.includes(moduleKey);
        }
        return true;
      };

      const modulesObj = {
        reception: { enabled: checkKey('reception'), lastMod: new Date().toLocaleDateString() },
        doctor: { enabled: checkKey('doctor'), lastMod: new Date().toLocaleDateString() },
        dpdp: { enabled: true, lastMod: new Date().toLocaleDateString() },
        pharmacy: { enabled: checkKey('pharmacy'), lastMod: new Date().toLocaleDateString() },
        laboratory: { enabled: checkKey('laboratory'), lastMod: new Date().toLocaleDateString() },
        inventory: { enabled: checkKey('inventory'), lastMod: new Date().toLocaleDateString() }
      };

      const selectedDoctorMode = (hospitalToActivate.doctorClinicalMode === 'OFFLINE') ? 'OFFLINE' : 'ONLINE';
      const hospitalCode = formOverrides.code || `MED-${hospitalName.replace(/\s+/g, '-').toUpperCase().slice(0, 5)}-${Math.floor(100 + Math.random() * 900)}`;

      // 1. Create Hospital Record
      const hospRes = await fetch('/api/superadmin/hospitals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({
          name: hospitalName,
          code: hospitalCode,
          logo: hospitalName.slice(0, 2).toUpperCase(),
          plan: formOverrides.plan || getFormattedPlanString(hospitalToActivate.subscriptionPlan, hospitalToActivate.billingCycle),
          status: 'Active',
          csm: formOverrides.csm || 'Platform Admin',
          onboardingLead: hospitalToActivate.exec || 'Platform Admin',
          goLiveDate: new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }),
          gst: hospitalToActivate.gstin || formOverrides.gst || '',
          isGstVerified: hospitalToActivate.panGstStatus === 'Approved' || formOverrides.isGstVerified || false,
          gstVerificationDetails: formOverrides.gstVerificationDetails || {
            verifiedAt: new Date().toLocaleDateString(),
            tradeName: hospitalName,
            address: hospitalToActivate.address || ''
          },
          license: hospitalToActivate.drugLicense || formOverrides.license || '',
          isLicenseVerified: true,
          licenseVerificationDetails: formOverrides.licenseVerificationDetails || {
            verifiedAt: new Date().toLocaleDateString(),
            licenseeName: hospitalName,
            validUntil: 'December 31, 2031'
          },
          address: hospitalToActivate.address || formOverrides.address || '',
          panNumber: hospitalToActivate.panNumber || '',
          corpId: hospitalToActivate.corpId || '',
          signatoryName: hospitalToActivate.signatoryName || '',
          fireSafetyCertificate: hospitalToActivate.fireSafetyCertificate || '',
          pollutionCertificate: hospitalToActivate.pollutionCertificate || '',
          revenue: `₹${amount.toLocaleString()}/mo`,
          healthScore: 100,
          limits: {
            doctorsUsed: 0,
            doctorsLimit: docLimit,
            staffUsed: 0,
            staffLimit: staffLimit,
            storageUsed: 0,
            storageLimit: storageLimit,
            patients: 0
          },
          modules: modulesObj,
          doctorClinicalMode: selectedDoctorMode,
          onboardingId: hospitalToActivate?._id || undefined,
          adminName,
          adminEmail,
          adminPhone,
          adminPassword
        })
      });

      if (!hospRes.ok) {
        const errorData = await hospRes.json();
        throw new Error(errorData.error || 'Failed to create hospital record.');
      }
      const newHospital = await hospRes.json();

      // 2. Generate Initial Invoice
      const invoiceNum = `INV-2026-${Math.floor(100 + Math.random() * 900)}`;
      const invRes = await fetch('/api/superadmin/invoices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({
          invoiceNum,
          hospital: hospitalName,
          subscription: activePlan?.tier || 'Professional Plan',
          invoiceDate: new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }),
          dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }),
          amount,
          gst: Math.round(amount * 0.18),
          status: amount === 0 ? 'Paid' : 'Pending',
          billingCycle: hospitalToActivate.billingCycle === 'annual' ? 'Annual' : 'Monthly',
          billingPeriod: 'Current Month Cycle',
          address: hospitalToActivate.address || 'Hospital Address',
          gstin: hospitalToActivate.gstin || '27AAAAA1111A1Z1',
          notes: 'Initial activation subscription invoice generated upon Go Live.'
        })
      });

      if (invRes.ok) {
        const newInvoice = await invRes.json();
        setInvoices(prev => [newInvoice, ...prev]);
      }

      // 3. Auto-Delete Onboarding Draft from DB (if an onboarding record existed)
      if (hospitalToActivate?._id) {
        try {
          await fetch(`/api/superadmin/onboarding/${hospitalToActivate._id}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
          });
        } catch (delErr) {
          console.warn('Could not delete onboarding draft:', delErr);
        }
      }

      // 4. Update UI state
      setHospitals(prev => [newHospital, ...prev]);
      setOnboardingHospitals(prev => prev.filter(o => o._id !== hospitalToActivate?._id));
      setSelectedOnboardingHospital(null);
      setIsOnboardingWizardOpen(false);
      setIsActivateModalOpen(false);
      setPortalSuccessModal(newHospital);
      showToast('Hospital subscription activated and Go-Live initialized successfully!', 'success');
      refreshNotifications();
      setActiveTab('hospitals');
      return true;
    } catch (err) {
      console.error(err);
      showToast(err.message || 'Error activating subscription.', 'error');
      return false;
    } finally {
      setIsActivating(false);
    }
  };

  const handleAddImpersonatedStaff = async (staffData) => {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`/api/superadmin/hospitals/${impersonatingHospital.code}/staff`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify(staffData)
      });
      if (res.ok) {
        showToast('Staff created successfully.', 'success');
        fetchImpersonatedStaff(impersonatingHospital.code);
        setIsAddStaffModalOpen(false);
      } else {
        const err = await res.json();
        showToast(err.error || 'Failed to add staff.', 'error');
      }
    } catch (err) {
      console.error(err);
      showToast('Error adding staff.', 'error');
    }
  };

  const handleUpdateImpersonatedStaff = async (staffId, staffData) => {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`/api/superadmin/hospitals/${impersonatingHospital.code}/staff/${staffId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify(staffData)
      });
      if (res.ok) {
        showToast('Staff updated successfully.', 'success');
        fetchImpersonatedStaff(impersonatingHospital.code);
        setIsAddStaffModalOpen(false);
        setSelectedStaffToEdit(null);
      } else {
        const err = await res.json();
        showToast(err.error || 'Failed to update staff.', 'error');
      }
    } catch (err) {
      console.error(err);
      showToast('Error updating staff.', 'error');
    }
  };

  const handleDeleteImpersonatedStaff = async (staffId) => {
    setConfirmModalConfig({
      title: 'Delete Staff Member',
      message: 'Are you sure you want to delete this staff member? Their access credentials will be revoked.',
      confirmText: 'Yes, Delete Staff',
      cancelText: 'Cancel',
      danger: true,
      onConfirm: async () => {
        setConfirmModalConfig(prev => ({ ...prev, isLoading: true, confirmText: 'Deleting Staff...' }));
        try {
          const token = localStorage.getItem('token');
          const res = await fetch(`/api/superadmin/hospitals/${impersonatingHospital.code}/staff/${staffId}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
          });
          if (res.ok) {
            showToast('Staff deleted successfully.', 'success');
            fetchImpersonatedStaff(impersonatingHospital.code);
          } else {
            showToast('Failed to delete staff.', 'error');
          }
        } catch (err) {
          console.error(err);
          showToast('Error deleting staff.', 'error');
        } finally {
          setConfirmModalConfig(null);
        }
      }
    });
  };

  const renderImpersonationPortal = () => {
    const hosp = impersonatingHospital;
    if (!hosp) return null;

    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', width: '100%', maxWidth: '100%', background: '#F8FAFC', overflow: 'hidden', fontFamily: "'Outfit', 'Inter', sans-serif" }}>
        
        {/* Top Impersonation Banner / Header */}
        <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: '60px', background: '#0F172A', padding: '0 24px', flexShrink: 0, color: '#FFFFFF', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: '#EF4444', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <LucideIcon name="shield-alert" style={{ width: '18px', height: '18px', color: '#FFFFFF' }} />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '14.5px', fontWeight: 800, color: '#FFFFFF', letterSpacing: '0.3px' }}>Curoxa Hospital Admin Portal</span>
                <span style={{ fontSize: '9px', background: '#EF4444', color: '#FFFFFF', padding: '2px 6px', borderRadius: '4px', fontWeight: 900, letterSpacing: '0.5px' }}>IMPERSONATING ACTIVE SESSION</span>
              </div>
              <span style={{ fontSize: '11px', color: '#94A3B8' }}>Connected Tenant: <strong>{hosp.name}</strong> (Code: {hosp.code})</span>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <div style={{ display: 'flex', background: '#1E293B', padding: '4px', borderRadius: '8px', border: '1px solid #334155' }}>
              <button 
                onClick={() => setImpersonatedTab('overview')}
                style={{
                  border: 'none', background: impersonatedTab === 'overview' ? '#2563EB' : 'transparent',
                  color: '#FFFFFF', padding: '6px 14px', borderRadius: '6px', fontSize: '12px', fontWeight: 700, cursor: 'pointer', transition: 'all 0.15s'
                }}
              >
                Overview
              </button>
              <button 
                onClick={() => setImpersonatedTab('staff')}
                style={{
                  border: 'none', background: impersonatedTab === 'staff' ? '#2563EB' : 'transparent',
                  color: '#FFFFFF', padding: '6px 14px', borderRadius: '6px', fontSize: '12px', fontWeight: 700, cursor: 'pointer', transition: 'all 0.15s'
                }}
              >
                Staff & Functioning Portal
              </button>
            </div>

            <button
              onClick={() => {
                showToast('Simulated Emergency alert dispatched to all ward endpoints.', 'error');
              }}
              style={{
                border: 'none', background: '#EF4444', color: '#FFFFFF', padding: '8px 16px', borderRadius: '6px', fontSize: '12px', fontWeight: 800, cursor: 'pointer',
                boxShadow: '0 0 12px rgba(239, 68, 68, 0.4)', display: 'flex', alignItems: 'center', gap: '6px'
              }}
            >
              <LucideIcon name="bell" style={{ width: '14px', height: '14px' }} />
              Emergency Response Alert
            </button>

            <button 
              onClick={() => setImpersonatingHospital(null)}
              style={{
                border: '1px solid #F59E0B', background: '#F59E0B15', color: '#F59E0B',
                padding: '8px 16px', borderRadius: '6px', fontSize: '12px', fontWeight: 800, cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: '6px', transition: 'all 0.15s'
              }}
            >
              <LucideIcon name="log-out" style={{ width: '14px', height: '14px' }} />
              Exit Impersonation Portal
            </button>
          </div>
        </header>

        <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
          {/* Left Sidebar Menu */}
          <aside style={{ width: '240px', background: '#FFFFFF', borderRight: '1px solid #E2E8F0', padding: '24px 16px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', flexShrink: 0 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <div style={{ fontSize: '10px', fontWeight: 800, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.7px', paddingLeft: '12px', marginBottom: '8px' }}>Hospital Console</div>
              {[
                { label: 'Dashboard', icon: 'layout-dashboard', active: impersonatedTab === 'overview', onClick: () => setImpersonatedTab('overview') },
                { label: 'Patients Directory', icon: 'users', active: false, onClick: () => {} },
                { label: 'Appointments Book', icon: 'calendar', active: false, onClick: () => {} },
                { label: 'Doctors & Staff', icon: 'activity', active: impersonatedTab === 'staff', onClick: () => setImpersonatedTab('staff') },
                { label: 'Nursing Wards', icon: 'clipboard-list', active: false, onClick: () => {} },
                { label: 'Pharmacy Inventory', icon: 'package', active: false, onClick: () => {} },
                { label: 'Billing & Claims', icon: 'credit-card', active: false, onClick: () => {} },
                { label: 'System Settings', icon: 'settings', active: false, onClick: () => {} }
              ].map(item => (
                <button
                  key={item.label}
                  onClick={item.onClick}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '10px', width: '100%', padding: '10px 12px', border: 'none',
                    background: item.active ? '#EFF6FF' : 'transparent', color: item.active ? '#2563EB' : '#475569',
                    borderRadius: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: item.active ? 750 : 500, textAlign: 'left',
                    transition: 'all 0.1s'
                  }}
                >
                  <LucideIcon name={item.icon} style={{ width: '16px', height: '16px', color: item.active ? '#2563EB' : '#64748B' }} />
                  {item.label}
                </button>
              ))}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <button
                onClick={handleImpersonateLogin}
                style={{
                  width: '100%',
                  background: 'linear-gradient(135deg, #2563EB 0%, #1D4ED8 100%)',
                  color: '#FFFFFF',
                  border: 'none',
                  borderRadius: '8px',
                  padding: '10px',
                  fontSize: '12.5px',
                  fontWeight: 800,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  boxShadow: '0 4px 12px rgba(37, 99, 235, 0.25)',
                  transition: 'transform 0.2s'
                }}
              >
                <LucideIcon name="external-link" style={{ width: '14px', height: '14px' }} />
                Enter Workspace
              </button>

              <div style={{ background: '#FAF9F6', border: '1px solid #E2E8F0', borderRadius: '10px', padding: '12px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: '#E2E8F0', color: '#475569', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: '12px' }}>
                  {impersonatedStats?.adminInitials || 'AD'}
                </div>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: '12px', fontWeight: 800, color: '#1E293B', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>{impersonatedStats?.adminName || 'Administrator'}</div>
                  <div style={{ fontSize: '10px', color: '#64748B' }}>Senior Administrator</div>
                </div>
              </div>
            </div>
          </aside>

          {/* Main Content Area */}
          <main style={{ flex: 1, padding: '24px', overflowY: 'auto', background: '#F8FAFC', display: 'flex', flexDirection: 'column', gap: '20px' }}>
            
            {impersonatedTab === 'overview' ? (
              <>
                {/* Status banner */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '12px', padding: '20px' }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '9px', fontWeight: 850, color: '#10B981', letterSpacing: '0.5px', textTransform: 'uppercase' }}>
                      <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#10B981', display: 'inline-block', boxShadow: '0 0 8px #10B981' }}></span>
                      Live System Status
                    </div>
                    <h2 style={{ margin: '8px 0 2px 0', fontSize: '18px', fontWeight: 850, color: '#0F172A' }}>Good Morning, {impersonatedStats?.adminName || 'Administrator'}.</h2>
                    <p style={{ margin: 0, fontSize: '12.5px', color: '#64748B' }}>{hosp.name} is now running in Production. Today is {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}.</p>
                  </div>
                </div>

                {/* Alerts Banner */}
                {impersonatedStats?.alerts && impersonatedStats.alerts.length > 0 ? (
                  <div style={{ background: '#FEF2F2', border: '1px solid #FCA5A5', borderRadius: '10px', padding: '12px 16px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <LucideIcon name="alert-triangle" style={{ width: '18px', height: '18px', color: '#EF4444', flexShrink: 0 }} />
                    <span style={{ fontSize: '12px', color: '#991B1B', fontWeight: 600 }}>
                      <strong>Critical Tenant Alerts:</strong> {impersonatedStats.alerts.join(' | ')}
                    </span>
                  </div>
                ) : (
                  <div style={{ background: '#ECFDF5', border: '1px solid #A7F3D0', borderRadius: '10px', padding: '12px 16px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <LucideIcon name="check-circle" style={{ width: '18px', height: '18px', color: '#10B981', flexShrink: 0 }} />
                    <span style={{ fontSize: '12px', color: '#065F46', fontWeight: 600 }}>
                      All systems running optimally. No critical tenant alerts detected.
                    </span>
                  </div>
                )}

                {/* Ribbon Metrics */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px' }}>
                  {[
                    { label: "TODAY'S PATIENTS", val: impersonatedStats?.todayPatients ?? 0, sub: `Total: ${impersonatedStats?.totalPatients ?? 0}`, color: "#2563EB", icon: "users" },
                    { label: "APPOINTMENTS", val: impersonatedStats?.todayAppointments ?? 0, sub: `${impersonatedStats?.pendingAppointments ?? 0} pending confirmation`, color: "#10B981", icon: "calendar" },
                    { label: "ACTIVE LAB ORDERS", val: impersonatedStats?.activeLabRequests ?? 0, sub: "Pending/in-progress laboratory requests", color: "#F59E0B", icon: "activity" },
                    { label: "REVENUE TODAY", val: `₹${(impersonatedStats?.revenueToday ?? 0).toLocaleString()}`, sub: "Settled invoices", color: "#8B5CF6", icon: "credit-card" }
                  ].map((card, idx) => (
                    <div key={idx} style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '12px', padding: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <span style={{ fontSize: '9px', fontWeight: 800, color: '#64748B', letterSpacing: '0.5px' }}>{card.label}</span>
                        <div style={{ fontSize: '24px', fontWeight: 850, color: '#0F172A', margin: '6px 0 2px 0' }}>{card.val}</div>
                        <span style={{ fontSize: '10px', color: '#64748B' }}>{card.sub}</span>
                      </div>
                      <LucideIcon name={card.icon} style={{ width: '22px', height: '22px', color: card.color }} />
                    </div>
                  ))}
                </div>

                {/* Dashboard Grid split */}
                <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr', gap: '20px' }}>
                  
                  {/* Left Column Area */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                    {/* Patient Flow */}
                    <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '12px', padding: '20px' }}>
                      <h3 style={{ margin: '0 0 14px 0', fontSize: '14px', fontWeight: 800, color: '#0F172A' }}>Patient Flow Visualizer</h3>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px' }}>
                        {[
                          { state: 'Consultation', count: impersonatedStats?.flow?.consultation ?? 0, color: '#3B82F6', icon: 'user-check' },
                          { state: 'Laboratory', count: impersonatedStats?.flow?.laboratory ?? 0, color: '#10B981', icon: 'flask-conical' },
                          { state: 'Pharmacy Sync', count: impersonatedStats?.flow?.pharmacy ?? 0, color: '#F59E0B', icon: 'package' },
                          { state: 'Discharge Desk', count: impersonatedStats?.flow?.discharge ?? 0, color: '#8B5CF6', icon: 'log-out' }
                        ].map((fl, idx) => (
                          <div key={idx} style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '8px', padding: '12px', textAlign: 'center' }}>
                            <LucideIcon name={fl.icon} style={{ width: '18px', height: '18px', color: fl.color, margin: '0 auto 8px auto' }} />
                            <div style={{ fontSize: '11px', fontWeight: 700, color: '#475569' }}>{fl.state}</div>
                            <div style={{ fontSize: '20px', fontWeight: 800, color: '#0F172A', marginTop: '4px' }}>{fl.count}</div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Bed occupancy */}
                    <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '12px', padding: '20px' }}>
                      <h3 style={{ margin: '0 0 14px 0', fontSize: '14px', fontWeight: 800, color: '#0F172A' }}>ICU Availability & Bed Occupancy</h3>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                        <div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: '6px' }}>
                            <span style={{ fontWeight: 700, color: '#334155' }}>General Ward Bed Occupancy</span>
                            <span style={{ fontWeight: 800, color: '#2563EB' }}>{Math.min(100, Math.round(((impersonatedStats?.totalPatients || 0) / 100) * 100)) || 12}% ({impersonatedStats?.totalPatients || 0}/100 Beds)</span>
                          </div>
                          <div style={{ height: '8px', background: '#E2E8F0', borderRadius: '4px', overflow: 'hidden' }}>
                            <div style={{ width: `${Math.min(100, Math.round(((impersonatedStats?.totalPatients || 0) / 100) * 100)) || 12}%`, height: '100%', background: '#2563EB', borderRadius: '4px' }}></div>
                          </div>
                        </div>
                        <div>
                          <div style={{ display: 'flex', justify: 'space-between', fontSize: '12px', marginBottom: '6px' }}>
                            <span style={{ fontWeight: 700, color: '#334155' }}>ICU Beds Availability</span>
                            <span style={{ fontWeight: 800, color: '#10B981' }}>{Math.max(0, 20 - (impersonatedStats?.flow?.consultation || 0))}/20 Beds Free</span>
                          </div>
                          <div style={{ height: '8px', background: '#E2E8F0', borderRadius: '4px', overflow: 'hidden' }}>
                            <div style={{ width: `${((Math.max(0, 20 - (impersonatedStats?.flow?.consultation || 0))) / 20) * 100}%`, height: '100%', background: '#10B981', borderRadius: '4px' }}></div>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Recent Hospital Activity */}
                    <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '12px', overflow: 'hidden' }}>
                      <div style={{ padding: '16px 20px', borderBottom: '1px solid #E2E8F0' }}>
                        <h3 style={{ margin: 0, fontSize: '14px', fontWeight: 800, color: '#0F172A' }}>Recent Hospital Activity</h3>
                      </div>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', textAlign: 'left' }}>
                        <thead>
                          <tr style={{ background: '#FAF9F6', borderBottom: '1px solid #E2E8F0' }}>
                            <th style={{ padding: '10px 16px', color: '#64748B', fontWeight: 800 }}>EVENT TYPE</th>
                            <th style={{ padding: '10px 16px', color: '#64748B', fontWeight: 800 }}>PATIENT / ENTITY</th>
                            <th style={{ padding: '10px 16px', color: '#64748B', fontWeight: 800 }}>DEPARTMENT</th>
                            <th style={{ padding: '10px 16px', color: '#64748B', fontWeight: 800 }}>TIMESTAMP</th>
                            <th style={{ padding: '10px 16px', color: '#64748B', fontWeight: 800 }}>STATUS</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(!impersonatedStats?.recentActivities || impersonatedStats.recentActivities.length === 0) ? (
                            <tr>
                              <td colSpan="5" style={{ padding: '20px', textAlign: 'center', color: '#64748B' }}>
                                No recent activity found for this tenant.
                              </td>
                            </tr>
                          ) : (
                            impersonatedStats.recentActivities.map((act, i) => (
                              <tr key={i} style={{ borderBottom: '1px solid #F1F5F9' }}>
                                <td style={{ padding: '12px 16px', fontWeight: 800 }}>{act.event}</td>
                                <td style={{ padding: '12px 16px', color: '#1E293B' }}>{act.entity}</td>
                                <td style={{ padding: '12px 16px', color: '#475569' }}>{act.dept}</td>
                                <td style={{ padding: '12px 16px', color: '#64748B' }}>{act.time}</td>
                                <td style={{ padding: '12px 16px' }}>
                                  <span style={{ padding: '2px 6px', borderRadius: '4px', fontSize: '10px', background: act.color + '15', color: act.color, fontWeight: 700 }}>
                                    {act.status}
                                  </span>
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Right Column Area */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                    
                    {/* Quick actions console */}
                    <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '12px', padding: '20px' }}>
                      <h3 style={{ margin: '0 0 14px 0', fontSize: '14px', fontWeight: 800, color: '#0F172A' }}>Quick Actions Console</h3>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                        {[
                          { label: 'Add Patient', icon: 'user-plus', action: () => setShowImpersonatedPatientModal(true) },
                          { label: 'New Appt.', icon: 'calendar-plus', action: () => setShowImpersonatedApptModal(true) },
                          { label: 'Create Invoice', icon: 'file-text', action: () => setShowImpersonatedInvoiceModal(true) },
                          { label: 'Order Lab', icon: 'flask-conical', action: () => setShowImpersonatedLabModal(true) }
                        ].map(act => (
                          <button
                            key={act.label}
                            onClick={act.action}
                            style={{
                              border: '1px solid #E2E8F0', background: '#F8FAFC', borderRadius: '8px', padding: '12px 8px',
                              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px', cursor: 'pointer'
                            }}
                          >
                            <LucideIcon name={act.icon} style={{ width: '16px', height: '16px', color: '#2563EB' }} />
                            <span style={{ fontSize: '11.5px', fontWeight: 700, color: '#334155' }}>{act.label}</span>
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Today's Schedule */}
                    <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '12px', padding: '20px' }}>
                      <h3 style={{ margin: '0 0 14px 0', fontSize: '14px', fontWeight: 800, color: '#0F172A' }}>Today's Admin Schedule</h3>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        {[
                          { time: '11:30 AM', task: 'Clinical Team Briefing', sub: 'ICU Wing A briefing round' },
                          { time: '02:00 PM', task: 'Audit Committee Review', sub: 'Monthly regulatory status check' },
                          { time: '04:30 PM', task: 'Outpatient Intake Round', sub: 'Daily shift handover details' }
                        ].map((t, idx) => (
                          <div key={idx} style={{ display: 'flex', gap: '10px' }}>
                            <div style={{ fontSize: '11px', fontWeight: 800, color: '#2563EB', width: '56px', flexShrink: 0 }}>{t.time}</div>
                            <div>
                              <div style={{ fontSize: '12px', fontWeight: 800, color: '#1E293B' }}>{t.task}</div>
                              <div style={{ fontSize: '10px', color: '#64748B', marginTop: '2px' }}>{t.sub}</div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* System Gate health stats */}
                    <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '12px', padding: '20px' }}>
                      <h3 style={{ margin: '0 0 14px 0', fontSize: '14px', fontWeight: 800, color: '#0F172A' }}>Gateway System Health</h3>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        {[
                          { name: 'Core Server Status', label: 'ONLINE', color: '#10B981' },
                          { name: 'Main Database Connection', label: 'ONLINE', color: '#10B981' },
                          { name: 'SaaS Storage Sync', label: '100% SYNCED', color: '#10B981' }
                        ].map((sys, idx) => (
                          <div key={idx} style={{ display: 'flex', justify: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontSize: '11.5px', color: '#475569' }}>{sys.name}</span>
                            <span style={{ fontSize: '10px', fontWeight: 800, color: sys.color }}>{sys.label}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                  </div>
                </div>
              </>
            ) : (
              /* Staff & Functioning Portal View */
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div style={{ display: 'flex', justify: 'space-between', alignItems: 'center' }}>
                  <div>
                    <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 850, color: '#0F172A' }}>Active Staff & Operations</h2>
                    <p style={{ margin: '4px 0 0 0', fontSize: '12.5px', color: '#64748B' }}>Add, edit, or delete hospital staff accounts. Use diagnostics to solve routing issues.</p>
                  </div>
                  
                  <div style={{ display: 'flex', gap: '10px' }}>
                    <button
                      onClick={async () => {
                        showToast('Running system diagnostics on gateway keys...', 'info');
                        await new Promise(r => setTimeout(r, 1200));
                        showToast('Syncing role permissions for users...', 'info');
                        await new Promise(r => setTimeout(r, 1000));
                        showToast('Success! Re-authorized staff sync. All gateway gates repaired.', 'success');
                      }}
                      style={{
                        border: 'none', background: '#F59E0B', color: '#FFFFFF', padding: '10px 16px', borderRadius: '6px',
                        fontSize: '12px', fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px'
                      }}
                    >
                      <LucideIcon name="wrench" style={{ width: '14px', height: '14px' }} />
                      Fix System Errors
                    </button>

                    <button
                      onClick={() => {
                        setSelectedStaffToEdit(null);
                        setIsAddStaffModalOpen(true);
                      }}
                      style={{
                        border: 'none', background: '#2563EB', color: '#FFFFFF', padding: '10px 16px', borderRadius: '6px',
                        fontSize: '12px', fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px'
                      }}
                    >
                      <LucideIcon name="plus" style={{ width: '14px', height: '14px' }} />
                      Add Staff User
                    </button>
                  </div>
                </div>

                {/* Staff List Table */}
                <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '12px', overflow: 'hidden' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12.5px', textAlign: 'left' }}>
                    <thead>
                      <tr style={{ background: '#FAF9F6', borderBottom: '1px solid #E2E8F0' }}>
                        <th style={{ padding: '12px 16px', color: '#64748B', fontWeight: 800 }}>STAFF ID</th>
                        <th style={{ padding: '12px 16px', color: '#64748B', fontWeight: 800 }}>NAME</th>
                        <th style={{ padding: '12px 16px', color: '#64748B', fontWeight: 800 }}>ROLE</th>
                        <th style={{ padding: '12px 16px', color: '#64748B', fontWeight: 800 }}>DEPARTMENT</th>
                        <th style={{ padding: '12px 16px', color: '#64748B', fontWeight: 800 }}>EMAIL</th>
                        <th style={{ padding: '12px 16px', color: '#64748B', fontWeight: 800 }}>STATUS</th>
                        <th style={{ padding: '12px 16px', color: '#64748B', fontWeight: 800, textAlign: 'right' }}>ACTIONS</th>
                      </tr>
                    </thead>
                    <tbody>
                      {impersonatedStaff.length === 0 ? (
                        <tr>
                          <td colSpan="7" style={{ textAlign: 'center', padding: '40px', color: '#64748B' }}>
                            No staff users registered under this tenant.
                          </td>
                        </tr>
                      ) : (
                        impersonatedStaff.map(staff => (
                          <tr key={staff._id} style={{ borderBottom: '1px solid #F1F5F9' }}>
                            <td style={{ padding: '12px 16px', fontWeight: 800, color: '#2563EB' }}>{staff.staff_id}</td>
                            <td style={{ padding: '12px 16px', color: '#0F172A', fontWeight: 700 }}>{staff.name}</td>
                            <td style={{ padding: '12px 16px', textTransform: 'capitalize', color: '#475569' }}>{staff.role}</td>
                            <td style={{ padding: '12px 16px', color: '#475569' }}>{staff.department || 'General'}</td>
                            <td style={{ padding: '12px 16px', color: '#64748B' }}>{staff.email}</td>
                            <td style={{ padding: '12px 16px' }}>
                              <span style={{ padding: '2px 6px', borderRadius: '4px', fontSize: '10px', background: '#D1FAE5', color: '#065F46', fontWeight: 700 }}>
                                Active
                              </span>
                            </td>
                            <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                              <div style={{ display: 'flex', justify: 'flex-end', gap: '8px' }}>
                                <button
                                  onClick={() => {
                                    setSelectedStaffToEdit(staff);
                                    setIsAddStaffModalOpen(true);
                                  }}
                                  style={{ border: '1px solid #CBD5E1', background: '#FFFFFF', padding: '4px 8px', borderRadius: '4px', fontSize: '11px', cursor: 'pointer' }}
                                >
                                  Edit
                                </button>
                                <button
                                  onClick={() => handleDeleteImpersonatedStaff(staff._id)}
                                  style={{ border: '1px solid #FCA5A5', background: '#FFF5F5', color: '#EF4444', padding: '4px 8px', borderRadius: '4px', fontSize: '11px', cursor: 'pointer' }}
                                >
                                  Delete
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </main>
        </div>

        {/* Add/Edit Staff Modal */}
        {isAddStaffModalOpen && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.3)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 99999 }}>
            <div style={{ width: '440px', background: '#FFFFFF', borderRadius: '12px', padding: '24px', boxShadow: '0 10px 25px rgba(0,0,0,0.1)' }}>
              <h3 style={{ margin: '0 0 16px 0', fontSize: '15px', fontWeight: 800, color: '#0F172A' }}>
                {selectedStaffToEdit ? 'Edit Staff Credentials' : 'Register New Staff Member'}
              </h3>
              
              <form onSubmit={async (e) => {
                e.preventDefault();
                const fd = new FormData(e.target);
                const staffData = {
                  staff_id: fd.get('staff_id'),
                  name: fd.get('name'),
                  email: fd.get('email'),
                  role: fd.get('role'),
                  department: fd.get('department'),
                  designation: fd.get('designation'),
                  password: fd.get('password') || undefined
                };

                if (selectedStaffToEdit) {
                  await handleUpdateImpersonatedStaff(selectedStaffToEdit._id, staffData);
                } else {
                  await handleAddImpersonatedStaff(staffData);
                }
              }} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                
                <div style={styles.formCol}>
                  <label style={styles.formLabel}>STAFF USERNAME / ID</label>
                  <input type="text" name="staff_id" required defaultValue={selectedStaffToEdit?.staff_id || ''} disabled={!!selectedStaffToEdit} style={styles.formInput} placeholder="e.g. drchen or staff1" />
                </div>

                <div style={styles.formCol}>
                  <label style={styles.formLabel}>FULL NAME</label>
                  <input type="text" name="name" required defaultValue={selectedStaffToEdit?.name || ''} style={styles.formInput} placeholder="e.g. Dr. Sarah Chen" />
                </div>

                <div style={styles.formCol}>
                  <label style={styles.formLabel}>WORK EMAIL</label>
                  <input type="email" name="email" defaultValue={selectedStaffToEdit?.email || ''} style={styles.formInput} placeholder="e.g. s.chen@mercy.com" />
                </div>

                <div style={styles.formCol}>
                  <label style={styles.formLabel}>SYSTEM ROLE</label>
                  <select name="role" defaultValue={selectedStaffToEdit?.role || 'staff'} style={styles.filterSelect}>
                    <option value="admin">Administrator</option>
                    <option value="doctor">Doctor</option>
                    <option value="receptionist">Receptionist</option>
                    <option value="nurse">Nurse</option>
                    <option value="pharmacist">Pharmacist</option>
                    <option value="staff">Associate Staff</option>
                  </select>
                </div>

                <div style={styles.formCol}>
                  <label style={styles.formLabel}>DEPARTMENT</label>
                  <input type="text" name="department" defaultValue={selectedStaffToEdit?.department || 'General'} style={styles.formInput} placeholder="e.g. Outpatient Desk" />
                </div>

                <div style={styles.formCol}>
                  <label style={styles.formLabel}>DESIGNATION</label>
                  <input type="text" name="designation" defaultValue={selectedStaffToEdit?.designation || 'Associate'} style={styles.formInput} placeholder="e.g. Senior Registrar" />
                </div>

                <div style={styles.formCol}>
                  <label style={styles.formLabel}>{selectedStaffToEdit ? 'NEW PASSWORD (OPTIONAL)' : 'SECURITY PASSWORD'}</label>
                  <div style={{ position: 'relative', display: 'flex', alignItems: 'center', width: '100%' }}>
                    <input 
                      type={showPasswords['staffModal'] ? 'text' : 'password'} 
                      name="password" 
                      required={!selectedStaffToEdit} 
                      style={{ ...styles.formInput, paddingRight: '40px', width: '100%' }} 
                      placeholder={selectedStaffToEdit ? 'Leave blank to keep current' : 'Enter password'} 
                    />
                    <button
                      type="button"
                      onClick={() => togglePasswordVisibility('staffModal')}
                      style={{
                        position: 'absolute',
                        right: '10px',
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        padding: '4px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: '#64748B'
                      }}
                    >
                      <LucideIcon name={showPasswords['staffModal'] ? 'eye-off' : 'eye'} style={{ width: '15px', height: '15px' }} />
                    </button>
                  </div>
                </div>

                <div style={{ display: 'flex', justify: 'flex-end', gap: '8px', marginTop: '10px' }}>
                  <button type="button" onClick={() => setIsAddStaffModalOpen(false)} style={{ ...styles.btnSecondary, padding: '8px 16px' }}>Cancel</button>
                  <button type="submit" style={{ ...styles.btnPrimary, padding: '8px 16px' }}>Save User</button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Add Patient Modal */}
        {showImpersonatedPatientModal && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.3)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 99999 }}>
            <div style={{ width: '400px', background: '#FFFFFF', borderRadius: '12px', padding: '24px', boxShadow: '0 10px 25px rgba(0,0,0,0.1)' }}>
              <h3 style={{ margin: '0 0 16px 0', fontSize: '15px', fontWeight: 800, color: '#0F172A' }}>Register New Patient</h3>
              <form onSubmit={async (e) => {
                e.preventDefault();
                const fd = new FormData(e.target);
                await handleAddImpersonatedPatient({
                  name: fd.get('name'),
                  age: Number(fd.get('age')),
                  gender: fd.get('gender'),
                  contact: fd.get('contact')
                });
              }} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div style={styles.formCol}>
                  <label style={styles.formLabel}>PATIENT FULL NAME</label>
                  <input type="text" name="name" required style={styles.formInput} placeholder="e.g. Robert Downey" />
                </div>
                <div style={styles.formCol}>
                  <label style={styles.formLabel}>AGE</label>
                  <input type="number" name="age" required style={styles.formInput} placeholder="e.g. 45" min="0" max="150" />
                </div>
                <div style={styles.formCol}>
                  <label style={styles.formLabel}>GENDER</label>
                  <select name="gender" required style={styles.filterSelect}>
                    <option value="Male">Male</option>
                    <option value="Female">Female</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
                <div style={styles.formCol}>
                  <label style={styles.formLabel}>CONTACT NUMBER</label>
                  <input type="text" name="contact" required style={styles.formInput} placeholder="e.g. +91 9876543210" />
                </div>
                <div style={{ display: 'flex', justify: 'flex-end', gap: '8px', marginTop: '10px' }}>
                  <button type="button" onClick={() => setShowImpersonatedPatientModal(false)} style={{ ...styles.btnSecondary, padding: '8px 16px' }}>Cancel</button>
                  <button type="submit" style={{ ...styles.btnPrimary, padding: '8px 16px' }}>Add Patient</button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Schedule Appointment Modal */}
        {showImpersonatedApptModal && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.3)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 99999 }}>
            <div style={{ width: '400px', background: '#FFFFFF', borderRadius: '12px', padding: '24px', boxShadow: '0 10px 25px rgba(0,0,0,0.1)' }}>
              <h3 style={{ margin: '0 0 16px 0', fontSize: '15px', fontWeight: 800, color: '#0F172A' }}>Schedule New Appointment</h3>
              {impersonatedPatients.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '16px 0' }}>
                  <p style={{ fontSize: '13px', color: '#64748B', margin: '0 0 12px 0' }}>No patients are registered yet.</p>
                  <button type="button" onClick={() => { setShowImpersonatedApptModal(false); setShowImpersonatedPatientModal(true); }} style={styles.btnPrimary}>Register Patient First</button>
                </div>
              ) : impersonatedDoctors.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '16px 0' }}>
                  <p style={{ fontSize: '13px', color: '#64748B', margin: '0 0 12px 0' }}>No doctors are registered yet.</p>
                  <button type="button" onClick={() => { setShowImpersonatedApptModal(false); setImpersonatedTab('staff'); }} style={styles.btnPrimary}>Register Doctor First</button>
                </div>
              ) : (
                <form onSubmit={async (e) => {
                  e.preventDefault();
                  const fd = new FormData(e.target);
                  await handleAddImpersonatedAppointment({
                    patientId: fd.get('patientId'),
                    doctorId: fd.get('doctorId'),
                    date: fd.get('date'),
                    time: fd.get('time'),
                    reason: fd.get('reason')
                  });
                }} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div style={styles.formCol}>
                    <label style={styles.formLabel}>SELECT PATIENT</label>
                    <select name="patientId" required style={styles.filterSelect}>
                      {impersonatedPatients.map(p => (
                        <option key={p._id} value={p._id}>{p.name} (Age: {p.age})</option>
                      ))}
                    </select>
                  </div>
                  <div style={styles.formCol}>
                    <label style={styles.formLabel}>SELECT DOCTOR</label>
                    <select name="doctorId" required style={styles.filterSelect}>
                      {impersonatedDoctors.map(d => (
                        <option key={d._id} value={d._id}>{d.name} ({d.department})</option>
                      ))}
                    </select>
                  </div>
                  <div style={styles.formCol}>
                    <label style={styles.formLabel}>DATE</label>
                    <input type="date" name="date" required style={styles.formInput} />
                  </div>
                  <div style={styles.formCol}>
                    <label style={styles.formLabel}>TIME SLOT</label>
                    <input type="text" name="time" required style={styles.formInput} placeholder="e.g. 10:30 AM" />
                  </div>
                  <div style={styles.formCol}>
                    <label style={styles.formLabel}>REASON FOR VISIT</label>
                    <input type="text" name="reason" required style={styles.formInput} placeholder="e.g. Regular health checkup" />
                  </div>
                  <div style={{ display: 'flex', justify: 'flex-end', gap: '8px', marginTop: '10px' }}>
                    <button type="button" onClick={() => setShowImpersonatedApptModal(false)} style={{ ...styles.btnSecondary, padding: '8px 16px' }}>Cancel</button>
                    <button type="submit" style={{ ...styles.btnPrimary, padding: '8px 16px' }}>Schedule</button>
                  </div>
                </form>
              )}
            </div>
          </div>
        )}

        {/* Create Invoice Modal */}
        {showImpersonatedInvoiceModal && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.3)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 99999 }}>
            <div style={{ width: '400px', background: '#FFFFFF', borderRadius: '12px', padding: '24px', boxShadow: '0 10px 25px rgba(0,0,0,0.1)' }}>
              <h3 style={{ margin: '0 0 16px 0', fontSize: '15px', fontWeight: 800, color: '#0F172A' }}>Generate Billing Invoice</h3>
              {impersonatedPatients.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '16px 0' }}>
                  <p style={{ fontSize: '13px', color: '#64748B', margin: '0 0 12px 0' }}>No patients are registered yet.</p>
                  <button type="button" onClick={() => { setShowImpersonatedInvoiceModal(false); setShowImpersonatedPatientModal(true); }} style={styles.btnPrimary}>Register Patient First</button>
                </div>
              ) : (
                <form onSubmit={async (e) => {
                  e.preventDefault();
                  const fd = new FormData(e.target);
                  await handleAddImpersonatedInvoice({
                    patientId: fd.get('patientId'),
                    description: fd.get('description'),
                    amount: Number(fd.get('amount')),
                    status: fd.get('status')
                  });
                }} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div style={styles.formCol}>
                    <label style={styles.formLabel}>SELECT PATIENT</label>
                    <select name="patientId" required style={styles.filterSelect}>
                      {impersonatedPatients.map(p => (
                        <option key={p._id} value={p._id}>{p.name} (Contact: {p.contact})</option>
                      ))}
                    </select>
                  </div>
                  <div style={styles.formCol}>
                    <label style={styles.formLabel}>DESCRIPTION</label>
                    <input type="text" name="description" required style={styles.formInput} placeholder="e.g. Blood Test & Consultation Fee" />
                  </div>
                  <div style={styles.formCol}>
                    <label style={styles.formLabel}>TOTAL AMOUNT (₹)</label>
                    <input type="number" name="amount" required style={styles.formInput} placeholder="e.g. 1500" min="0" />
                  </div>
                  <div style={styles.formCol}>
                    <label style={styles.formLabel}>BILLING STATUS</label>
                    <select name="status" required style={styles.filterSelect}>
                      <option value="Unpaid">Unpaid</option>
                      <option value="Paid">Paid</option>
                    </select>
                  </div>
                  <div style={{ display: 'flex', justify: 'flex-end', gap: '8px', marginTop: '10px' }}>
                    <button type="button" onClick={() => setShowImpersonatedInvoiceModal(false)} style={{ ...styles.btnSecondary, padding: '8px 16px' }}>Cancel</button>
                    <button type="submit" style={{ ...styles.btnPrimary, padding: '8px 16px' }}>Generate</button>
                  </div>
                </form>
              )}
            </div>
          </div>
        )}

        {/* Order Lab Modal */}
        {showImpersonatedLabModal && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.3)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 99999 }}>
            <div style={{ width: '400px', background: '#FFFFFF', borderRadius: '12px', padding: '24px', boxShadow: '0 10px 25px rgba(0,0,0,0.1)' }}>
              <h3 style={{ margin: '0 0 16px 0', fontSize: '15px', fontWeight: 800, color: '#0F172A' }}>Request Laboratory Test</h3>
              {impersonatedPatients.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '16px 0' }}>
                  <p style={{ fontSize: '13px', color: '#64748B', margin: '0 0 12px 0' }}>No patients are registered yet.</p>
                  <button type="button" onClick={() => { setShowImpersonatedLabModal(false); setShowImpersonatedPatientModal(true); }} style={styles.btnPrimary}>Register Patient First</button>
                </div>
              ) : impersonatedDoctors.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '16px 0' }}>
                  <p style={{ fontSize: '13px', color: '#64748B', margin: '0 0 12px 0' }}>No doctors are registered yet.</p>
                  <button type="button" onClick={() => { setShowImpersonatedLabModal(false); setImpersonatedTab('staff'); }} style={styles.btnPrimary}>Register Doctor First</button>
                </div>
              ) : (
                <form onSubmit={async (e) => {
                  e.preventDefault();
                  const fd = new FormData(e.target);
                  await handleAddImpersonatedLab({
                    patientId: fd.get('patientId'),
                    doctorId: fd.get('doctorId'),
                    testName: fd.get('testName')
                  });
                }} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div style={styles.formCol}>
                    <label style={styles.formLabel}>SELECT PATIENT</label>
                    <select name="patientId" required style={styles.filterSelect}>
                      {impersonatedPatients.map(p => (
                        <option key={p._id} value={p._id}>{p.name}</option>
                      ))}
                    </select>
                  </div>
                  <div style={styles.formCol}>
                    <label style={styles.formLabel}>REQUESTING DOCTOR</label>
                    <select name="doctorId" required style={styles.filterSelect}>
                      {impersonatedDoctors.map(d => (
                        <option key={d._id} value={d._id}>{d.name} ({d.department})</option>
                      ))}
                    </select>
                  </div>
                  <div style={styles.formCol}>
                    <label style={styles.formLabel}>LAB TEST NAME</label>
                    <input type="text" name="testName" required style={styles.formInput} placeholder="e.g. Lipid Profile or Chest X-Ray" />
                  </div>
                  <div style={{ display: 'flex', justify: 'flex-end', gap: '8px', marginTop: '10px' }}>
                    <button type="button" onClick={() => setShowImpersonatedLabModal(false)} style={{ ...styles.btnSecondary, padding: '8px 16px' }}>Cancel</button>
                    <button type="submit" style={{ ...styles.btnPrimary, padding: '8px 16px' }}>Order Test</button>
                  </div>
                </form>
              )}
            </div>
          </div>
        )}

      </div>
    );
  };

  // Search input filters
  const [searchQuery, setSearchQuery] = useState('');
  const [hospitalSearch, setHospitalSearch] = useState('');
  const [filteredResults, setFilteredResults] = useState([]);

  // Active Onboarding accounts
  const [onboardingHospitals, setOnboardingHospitals] = useState([]);

  // Active Hospitals Database (Step 4 Core)
  const [hospitals, setHospitals] = useState([]);
  const [isTogglingMap, setIsTogglingMap] = useState({});
  const [billingCycle, setBillingCycle] = useState('monthly');
  const [tempPasswords, setTempPasswords] = useState({});
  const [credentialsMsg, setCredentialsMsg] = useState({ text: '', type: '' });

  // SaaS Invoices Database (Step 8 Core)
  const [invoices, setInvoices] = useState([]);

  // Support Tickets Database (Step 7 Core)
  const [tickets, setTickets] = useState([]);

  // Custom Reports State
  const [customReports, setCustomReports] = useState([]);

  // Scheduled Reports State
  const [scheduledReports, setScheduledReports] = useState([]);

  // System Broadcasts State
  const [pastBroadcasts, setPastBroadcasts] = useState([]);

  // Company Employees Database — loaded from backend
  const [employees, setEmployees] = useState([]);
  const [isAddEmployeeOpen, setIsAddEmployeeOpen] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState(null);
  // SuperAdmin Profile & Password Update Modal
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [profileForm, setProfileForm] = useState({
    name: currentUser.name || 'Platform Admin',
    email: currentUser.email || 'super.admin@curoxa.com',
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  });
  const [profileError, setProfileError] = useState('');
  const [isUpdatingProfile, setIsUpdatingProfile] = useState(false);
  const [showProfilePasswords, setShowProfilePasswords] = useState({ current: false, new: false, confirm: false });



  // Load all Super Admin collections from the backend on mount
  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) {
      navigate('/login');
      return;
    }

    const initData = async () => {
      try {
        const headers = {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        };

        const fetchAndSet = async (url, setter) => {
          try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 25000);
            const res = await fetch(url, { headers, signal: controller.signal });
            clearTimeout(timeoutId);

            // 401 means unauthenticated / expired JWT token -> auto logout
            if (res.status === 401) {
              console.warn(`[AUTH] Response 401 Unauthorized for ${url}. Logging out...`);
              handleAutoLogout('session_expired');
              return false;
            }

            // 403 means Forbidden by RBAC for this role -> normal access control, DO NOT log out
            if (res.status === 403) {
              console.warn(`[AUTH] Response 403 Forbidden for ${url} (Role: ${currentUserPlatformRole}). Skipping module.`);
              return false;
            }

            if (res.ok) {
              const data = await res.json();
              if (data) setter(data);
              return true;
            }
            return false;
          } catch(err) {
            if (err.name !== 'AbortError') {
              console.warn(`Fetch error for ${url}:`, err);
            }
            return false;
          }
        };

        // Role-aware dataset fetching: only fetch collections authorized for currentUserPlatformRole
        const fetchPromises = [
          fetchAndSet('/api/superadmin/notifications', setNotifications),
          fetchAndSet('/api/superadmin/meetings', setMeetings)
        ];

        if (isSuperAdmin) {
          fetchPromises.push(
            fetchAndSet('/api/superadmin/hospitals', setHospitals),
            fetchAndSet('/api/superadmin/plans', setPlans),
            fetchAndSet('/api/superadmin/onboarding', setOnboardingHospitals),
            fetchAndSet('/api/superadmin/invoices', setInvoices),
            fetchAndSet('/api/superadmin/tickets', setTickets),
            fetchAndSet('/api/superadmin/backups', setBackups),
            fetchAndSet('/api/superadmin/audits', setAuditLogs),
            fetchAndSet('/api/superadmin/reports', setCustomReports),
            fetchAndSet('/api/superadmin/schedules', setScheduledReports),
            fetchAndSet('/api/superadmin/broadcasts', setPastBroadcasts),
            fetchAndSet('/api/superadmin/employees', setEmployees)
          );
        } else if (currentUserPlatformRole === 'Onboarding Manager') {
          fetchPromises.push(
            fetchAndSet('/api/superadmin/hospitals', setHospitals),
            fetchAndSet('/api/superadmin/onboarding', setOnboardingHospitals)
          );
        } else if (currentUserPlatformRole === 'Ticket Manager') {
          fetchPromises.push(
            fetchAndSet('/api/superadmin/tickets', setTickets),
            fetchAndSet('/api/superadmin/broadcasts', setPastBroadcasts)
          );
        } else if (currentUserPlatformRole === 'Finance Manager') {
          fetchPromises.push(
            fetchAndSet('/api/superadmin/plans', setPlans),
            fetchAndSet('/api/superadmin/invoices', setInvoices),
            fetchAndSet('/api/superadmin/reports', setCustomReports)
          );
        }

        const allResults = await Promise.allSettled(fetchPromises);

        // Check if all essential fetches failed or backend is completely disconnected
        const succeededCount = allResults.filter(r => r.status === 'fulfilled' && r.value === true).length;
        if (succeededCount === 0 && token) {
          try {
            // Check universal endpoint accessible to all internal superadmin roles
            const checkRes = await fetch('/api/superadmin/notifications', { headers });
            if (checkRes.status === 401) {
              handleAutoLogout('session_expired');
            } else if (!checkRes.ok && checkRes.status !== 403) {
              handleAutoLogout('backend_disconnected');
            }
          } catch (e) {
            handleAutoLogout('backend_disconnected');
          }
        }

      } catch (err) {
        console.error('Error loading Super Admin data:', err);
      } finally {
        setIsInitialLoading(false);
      }
    };

    initData();
  }, [navigate]);

  useEffect(() => {
    if (!socket.connected) {
      socket.connect();
    }

    const handleTicketMessage = (data) => {
      console.log('[SOCKET] SuperAdmin received ticket_message:', data);
      setTickets((prevTickets) => {
        return prevTickets.map((t) => {
          if (t._id === data.ticketId || t.id === data.ticketId) {
            const msgExists = t.messages.some(
              (m) => m.timestamp === data.message.timestamp && m.text === data.message.text
            );
            if (msgExists) return t;
            return {
              ...t,
              messages: [...t.messages, data.message]
            };
          }
          return t;
        });
      });
    };

    const handleTicketStatus = (data) => {
      console.log('[SOCKET] SuperAdmin received ticket_status_changed:', data);
      setTickets((prevTickets) => {
        return prevTickets.map((t) => {
          if (t._id === data.ticketId || t.id === data.ticketId) {
            return {
              ...t,
              status: data.status
            };
          }
          return t;
        });
      });
    };

    const handleTicketCreated = (newTicket) => {
      console.log('[SOCKET] SuperAdmin received ticket_created:', newTicket);
      setTickets((prev) => {
        if (prev.some((t) => t._id === newTicket._id)) return prev;
        return [newTicket, ...prev];
      });
    };

    socket.on('ticket_message', handleTicketMessage);
    socket.on('ticket_status_changed', handleTicketStatus);
    socket.on('ticket_created', handleTicketCreated);

    return () => {
      socket.off('ticket_message', handleTicketMessage);
      socket.off('ticket_status_changed', handleTicketStatus);
      socket.off('ticket_created', handleTicketCreated);
    };
  }, []);

  // Real-time subscription sync: when Hospital Admin renews, update Super Admin hospitals state immediately
  useEffect(() => {
    const handleHospitalSubUpdated = (data) => {
      console.log('[SOCKET] SuperAdmin received hospital_subscription_updated:', data);
      if (!data || !data.hospitalCode) return;
      setHospitals((prev) =>
        prev.map((h) => {
          if ((h.code || '').toLowerCase() === data.hospitalCode.toLowerCase()) {
            return {
              ...h,
              plan: data.plan ?? h.plan,
              status: data.status ?? h.status,
              subscriptionStatus: data.subscriptionStatus ?? h.subscriptionStatus,
              subscriptionExpiryDate: data.subscriptionExpiryDate ?? h.subscriptionExpiryDate,
              revenue: data.revenue ?? h.revenue,
              trialUsed: data.trialUsed ?? h.trialUsed,
              modules: data.modules ?? h.modules
            };
          }
          return h;

        })
      );
    };

    socket.on('hospital_subscription_updated', handleHospitalSubUpdated);
    return () => {
      socket.off('hospital_subscription_updated', handleHospitalSubUpdated);
    };
  }, []);

  useEffect(() => {
    if (superAdminChatEndRef.current) {
      superAdminChatEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [selectedTicketId, tickets.find(t => t._id === selectedTicketId)?.messages?.length]);

  useEffect(() => {
    if (isOnboardingWizardOpen && wizardHospital && !wizardHospital.contractStartDate) {
      const todayStr = new Date().toLocaleDateString('sv-SE');
      setWizardHospital(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          contractStartDate: todayStr
        };
      });
    }
  }, [isOnboardingWizardOpen, wizardHospital?.contractStartDate]);

  useEffect(() => {
    if (employees && employees.length > 0 && !taskAssignForm.assignedTo) {
      setTaskAssignForm(prev => ({
        ...prev,
        assignedTo: employees[0]._id,
        deptName: employees[0].department
      }));
    }
  }, [employees]);

  useEffect(() => {
    if (activeTab === 'platform-audits') {
      const token = localStorage.getItem('token');
      if (!token) return;
      fetch('/api/superadmin/audits', {
        headers: { 'Authorization': `Bearer ${token}` }
      })
        .then(res => res.ok ? res.json() : [])
        .then(data => { if (Array.isArray(data)) setAuditLogs(data); })
        .catch(err => console.error('Failed to fetch audit logs:', err));
    }
  }, [activeTab]);

  const fetchBroadcasts = async () => {
    try {
      const token = localStorage.getItem('token');
      if (!token) return;
      const res = await fetch('/api/superadmin/broadcasts', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      if (res.ok) {
        const data = await res.json();
        setPastBroadcasts(data);
      }
    } catch (err) {
      console.error('Error fetching broadcasts:', err);
    }
  };

  // Trigger manual backup via backend API
  const handleTriggerBackup = async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch('/api/superadmin/backups/trigger', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      });
      if (res.ok) {
        const newBkp = await res.json();
        setBackups(prev => [newBkp, ...prev]);

        const auditsRes = await fetch('/api/superadmin/audits', {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (auditsRes.ok) setAuditLogs(await auditsRes.json());

        showToast('Database snapshot completed successfully.', 'success');
        refreshNotifications();
      } else {
        showToast('Failed to trigger database snapshot.', 'error');
      }
    } catch (err) {
      console.error(err);
      showToast('Error triggering database snapshot.', 'error');
    }
  };

  const handleVerifyLicenseInActivationModal = async () => {
    if (!activateForm.license) {
      setVerificationError('Please enter a drug license number.');
      return;
    }
    setIsVerifyingLicense(true);
    setVerificationError('');
    try {
      const token = localStorage.getItem('token');
      const res = await fetch('/api/superadmin/verify-license', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          licenseNumber: activateForm.license,
          hospitalName: selectedOnboardingHospital?.name || 'New Hospital'
        })
      });
      const data = await res.json();
      if (res.ok) {
        setActivateForm(prev => ({
          ...prev,
          isLicenseVerified: true,
          licenseVerificationDetails: data
        }));
      } else {
        setVerificationError(data.error || 'Verification failed.');
      }
    } catch (err) {
      console.error(err);
      setVerificationError('Error connecting to verification server.');
    } finally {
      setIsVerifyingLicense(false);
    }
  };

  const handleVerifyLicenseForExistingHospital = async (hosp) => {
    if (!hosp.license) {
      showToast('Please enter a license number first.', 'error');
      return;
    }
    setIsVerifyingLicense(true);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch('/api/superadmin/verify-license', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          licenseNumber: hosp.license,
          hospitalName: hosp.name
        })
      });
      const data = await res.json();
      if (res.ok) {
        const updateRes = await fetch(`/api/superadmin/hospitals/${hosp._id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify({
            isLicenseVerified: true,
            licenseVerificationDetails: data
          })
        });
        if (updateRes.ok) {
          const updated = await updateRes.json();
          setHospitals(prev => prev.map(h => h._id === hosp._id ? updated : h));
          showToast('License verified successfully!', 'success');
        }
      } else {
        showToast(data.error || 'Verification failed.', 'error');
      }
    } catch (err) {
      console.error(err);
      showToast('Verification request failed.', 'error');
    } finally {
      setIsVerifyingLicense(false);
    }
  };

  const handleVerifyGstinInActivationModal = async () => {
    if (!activateForm.gst) {
      setGstinVerificationError('Please enter a GSTIN.');
      return;
    }
    setIsVerifyingGstin(true);
    setGstinVerificationError('');
    try {
      const token = localStorage.getItem('token');
      const res = await fetch('/api/superadmin/verify-gstin', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          gstin: activateForm.gst,
          hospitalName: selectedOnboardingHospital?.name || 'New Hospital'
        })
      });
      const data = await res.json();
      if (res.ok) {
        setActivateForm(prev => ({
          ...prev,
          isGstVerified: true,
          gstVerificationDetails: data
        }));
      } else {
        setGstinVerificationError(data.error || 'GSTIN verification failed.');
      }
    } catch (err) {
      console.error(err);
      setGstinVerificationError('Error connecting to verification server.');
    } finally {
      setIsVerifyingGstin(false);
    }
  };

  const handleVerifyGstinForExistingHospital = async (hosp) => {
    if (!hosp.gst) {
      showToast('Please enter a GSTIN first.', 'error');
      return;
    }
    setIsVerifyingGstin(true);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch('/api/superadmin/verify-gstin', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          gstin: hosp.gst,
          hospitalName: hosp.name
        })
      });
      const data = await res.json();
      if (res.ok) {
        const updateRes = await fetch(`/api/superadmin/hospitals/${hosp._id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify({
            isGstVerified: true,
            gstVerificationDetails: data
          })
        });
        if (updateRes.ok) {
          const updated = await updateRes.json();
          setHospitals(prev => prev.map(h => h._id === hosp._id ? updated : h));
          showToast('GSTIN verified successfully!', 'success');
        }
      } else {
        showToast(data.error || 'Verification failed.', 'error');
      }
    } catch (err) {
      console.error(err);
      showToast('GSTIN Verification request failed.', 'error');
    } finally {
      setIsVerifyingGstin(false);
    }
  };

  const renderOnboardingWizard = () => {
    const steps = [
      { id: 1, label: 'Basic Information', sub: 'Hospital identity & location', icon: 'building-2' },
      { id: 2, label: 'Organisation Setup', sub: 'Infrastructure & branches', icon: 'network' },
      { id: 3, label: 'Legal & Compliance', sub: 'GST, CIN & CDSCO License', icon: 'file-check-2' },
      { id: 4, label: 'Subscription & Licensing', sub: 'Plan selection & quotas', icon: 'credit-card' },
      { id: 5, label: 'User & Role Provisioning', sub: 'Admin master credentials', icon: 'shield-check' },
      { id: 6, label: 'Review & Validation', sub: 'Dossier pre-checks', icon: 'clipboard-check' },
      { id: 7, label: 'Go Live Activation', sub: 'Final launch & provisioning', icon: 'rocket' }
    ];

    const totalSteps = steps.length;
    const progressPercent = Math.round((wizardStep / totalSteps) * 100);

    const activePlan = plans.find(p => p.matchKey === (wizardHospital.subscriptionPlan || 'professional')) || plans.find(p => p.matchKey === 'professional') || plans[0];

    const keyFields = [
      wizardHospital.name,
      wizardHospital.contactEmail,
      wizardHospital.city,
      wizardHospital.country,
      wizardHospital.address,
      wizardHospital.timezone,
      wizardHospital.currency,
      wizardHospital.language,
      wizardHospital.dateFormat,
      wizardHospital.panNumber,
      wizardHospital.gstin,
      wizardHospital.corpId,
      wizardHospital.signatoryName,
      wizardHospital.drugLicense,
      wizardHospital.subscriptionPlan,
      wizardHospital.adminName,
      wizardHospital.adminEmail
    ];
    const filledFields = keyFields.filter(f => f !== undefined && f !== null && f !== '').length;
    const readinessPercent = Math.min(100, Math.max(10, Math.round((filledFields / keyFields.length) * 100)));

    const adminApproved = !!wizardHospital.adminName;
    const compliancePassed = !!(wizardHospital.panNumber && wizardHospital.gstin && wizardHospital.corpId && wizardHospital.signatoryName && wizardHospital.drugLicense);

    const goLiveDate = wizardHospital.contractStartDate ? new Date(wizardHospital.contractStartDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Upon Activation';

    const missingFieldsCount = keyFields.length - filledFields;

    const handleCancelWizard = () => {
      if (wizardHospital?._id) {
        saveWizardDraft(false).catch(() => {});
      }
      setIsOnboardingWizardOpen(false);
      setWizardHospital(null);
      setIsExitingWizard(false);
    };

    const saveWizardDraft = async (exitAfterSaving = false, customStep = null) => {
      const token = localStorage.getItem('token');
      const stepToUse = customStep !== null ? customStep : wizardStep;
      
      if (exitAfterSaving) {
        setIsExitingWizard(true);
      }

      if (!wizardHospital?._id) {
        if (exitAfterSaving) {
          setIsOnboardingWizardOpen(false);
          setWizardHospital(null);
          setIsExitingWizard(false);
        }
        return true;
      }

      const panGstVal = (wizardHospital.panNumber?.trim() && wizardHospital.gstin?.trim()) ? 'Approved' : 'Pending';
      const entityVal = (wizardHospital.corpId?.trim() && wizardHospital.signatoryName?.trim()) ? 'Approved' : 'Pending';
      const sandboxVal = (wizardHospital.sandboxDbUrl?.trim() && wizardHospital.sandboxDbUrl !== 'Pending Provisioning...') ? 'Approved' : 'Pending';
      const adminVal = (wizardHospital.adminName?.trim() && wizardHospital.adminEmail?.trim() && wizardHospital.adminPhone?.trim()) ? 'Approved' : 'Pending';

      let approvedCount = 0;
      if (panGstVal === 'Approved') approvedCount++;
      if (entityVal === 'Approved') approvedCount++;
      if (sandboxVal === 'Approved') approvedCount++;
      if (adminVal === 'Approved') approvedCount++;

      const computedProgress = Math.min(100, Math.max(
        Math.round(((stepToUse - 1) / totalSteps) * 100),
        approvedCount * 25
      ));

      let computedStage = 'Verification';
      if (computedProgress >= 100) {
        computedStage = 'Go Live';
      } else if (computedProgress >= 75) {
        computedStage = 'Configuration';
      }

      try {
        const updateData = {
          ...wizardHospital,
          currentStep: stepToUse,
          panGstStatus: panGstVal,
          entityStatus: entityVal,
          sandboxStatus: sandboxVal,
          adminStatus: adminVal,
          progress: computedProgress,
          stage: computedStage
        };
        delete updateData._id;
        delete updateData.__v;
        const res = await fetch(`/api/superadmin/onboarding/${wizardHospital._id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify(updateData)
        });
        if (res.ok) {
          const updated = await res.json();
          setOnboardingHospitals(prev => prev.map(o => o._id === updated._id ? updated : o));
          setSelectedOnboardingHospital(updated);
          setWizardHospital(prev => ({
            ...updated,
            confirmAdminPassword: prev ? prev.confirmAdminPassword : ''
          }));
          setIsDraftSaved(true);
          setTimeout(() => setIsDraftSaved(false), 2000);
          if (exitAfterSaving) {
            setIsOnboardingWizardOpen(false);
          }
          return true;
        } else {
          const errData = await res.json().catch(() => ({}));
          showToast(errData.error || 'Failed to save onboarding draft.', 'error');
          return false;
        }
      } catch (err) {
        console.error(err);
        showToast('Error saving onboarding draft.', 'error');
        return false;
      } finally {
        if (exitAfterSaving) {
          setIsExitingWizard(false);
          setIsOnboardingWizardOpen(false);
          setWizardHospital(null);
        }
      }
    };

    const finalizeOnboarding = async (finalStatus) => {
      const token = localStorage.getItem('token');
      try {
        const updateData = {
          ...wizardHospital,
          status: finalStatus,
          panGstStatus: 'Approved',
          entityStatus: 'Approved',
          sandboxStatus: 'Approved',
          adminStatus: 'Approved',
          stage: 'Go Live',
          progress: 100,
          currentStep: 7
        };
        delete updateData._id;
        delete updateData.__v;
        const res = await fetch(`/api/superadmin/onboarding/${wizardHospital._id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify(updateData)
        });
        if (res.ok) {
          const updated = await res.json();
          setOnboardingHospitals(prev => prev.map(o => o._id === updated._id ? updated : o));
          setIsOnboardingWizardOpen(false);
          
          if (finalStatus === 'Live') {
            showToast(`Hospital deployed successfully and is now Live.`, 'success');
          } else {
            showToast(`Client approval request dispatched.`, 'success');
          }
        } else {
          showToast(`Failed to finalize onboarding.`, 'error');
        }
      } catch (err) {
        console.error(err);
        showToast('Error finalizing onboarding.', 'error');
      }
    };

    const handleCreateOnboardingUser = async () => {
      if (!drawerForm.firstName || !drawerForm.email || !drawerForm.role) {
        showToast('Please fill out required fields (First Name, Email, Role).', 'error');
        return;
      }
      
      const newStaff = {
        firstName: drawerForm.firstName,
        lastName: drawerForm.lastName,
        email: drawerForm.email,
        phone: drawerForm.phone,
        secPhone: drawerForm.secPhone,
        branch: drawerForm.branch,
        department: drawerForm.department,
        manager: drawerForm.manager,
        shift: drawerForm.shift,
        role: drawerForm.role,
        avatar: drawerForm.avatar || '',
        password: drawerForm.password || 'Staff@123',
        status: 'Pending Invite'
      };

      const updatedUsers = [...(wizardHospital.provisionedUsers || []), newStaff];
      
      try {
        const updateData = {
          ...wizardHospital,
          provisionedUsers: updatedUsers,
          currentStep: wizardStep
        };
        delete updateData._id;
        delete updateData.__v;
        const res = await fetch(`/api/superadmin/onboarding/${wizardHospital._id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('token')}` },
          body: JSON.stringify(updateData)
        });
        if (res.ok) {
          const updated = await res.json();
          setOnboardingHospitals(prev => prev.map(o => o._id === updated._id ? updated : o));
          setWizardHospital(prev => ({
            ...updated,
            confirmAdminPassword: prev ? prev.confirmAdminPassword : ''
          }));
          setIsAddUserDrawerOpen(false);
          setDrawerForm({
            firstName: '', lastName: '', email: '', phone: '', secPhone: '',
            branch: '', department: '', manager: '', shift: '', role: '', password: '', avatar: ''
          });
          showToast('Onboarding staff user created successfully!', 'success');
        } else {
          showToast('Failed to save staff user.', 'error');
        }
      } catch (err) {
        console.error(err);
        showToast('Error saving staff user.', 'error');
      }
    };

    const getStepValidation = (step) => {
      const missing = [];
      if (step === 1) {
        if (!wizardHospital.name?.trim()) missing.push('Hospital Name');
        if (!wizardHospital.contactName?.trim()) missing.push('Primary Contact Person');
        if (!wizardHospital.contactEmail?.trim()) {
          missing.push('Contact Email');
        } else if (!validateEmailFormat(wizardHospital.contactEmail)) {
          missing.push('Contact Email in valid format (e.g. name@hospital.com)');
        }
        if (!wizardHospital.city?.trim()) missing.push('City');
        if (!wizardHospital.address?.trim()) missing.push('Street Address');
      } else if (step === 2) {
        // Step 2 fields all have sensible defaults (timezone, currency, dateFormat, language) via selects
        // No mandatory text inputs — always valid
      } else if (step === 3) {
        if (!wizardHospital.panNumber?.trim()) {
          missing.push('PAN Number');
        } else if (!validatePANFormat(wizardHospital.panNumber)) {
          missing.push('PAN Number in correct format (e.g. ABCDE1234F)');
        }

        if (!wizardHospital.gstin?.trim()) {
          missing.push('GSTIN Number');
        } else if (!validateGSTINFormat(wizardHospital.gstin)) {
          missing.push('GSTIN Number in correct format (e.g. 07METRO8827P1ZX)');
        }

        if (!wizardHospital.corpId?.trim()) {
          missing.push('CIN (Corporate ID)');
        } else if (!validateCINFormat(wizardHospital.corpId)) {
          missing.push('CIN in correct format (e.g. U85110DL2025PTC384920)');
        }

        if (!wizardHospital.signatoryName?.trim()) missing.push('Authorized Signatory Name');
        if (!wizardHospital.drugLicense?.trim()) {
          missing.push('Drug License Number');
        } else if (!validateDrugLicenseFormat(wizardHospital.drugLicense)) {
          missing.push('Drug License in correct format (e.g. DL-293849/2026)');
        }

        if (wizardHospital.fireSafetyCertificate && !validateCertificateFormat(wizardHospital.fireSafetyCertificate)) {
          missing.push('Fire Safety Certificate in correct format (e.g. FSC-990-2026)');
        }
        if (wizardHospital.pollutionCertificate && !validateCertificateFormat(wizardHospital.pollutionCertificate)) {
          missing.push('Pollution Control Board Register Number in correct format (e.g. PCB-MED-7491)');
        }
      } else if (step === 4) {
        if (!wizardHospital.subscriptionPlan) missing.push('Subscription Plan');
      } else if (step === 5) {
        if (!wizardHospital.adminName?.trim()) missing.push('Admin Full Name');
        if (!wizardHospital.adminEmail?.trim()) {
          missing.push('Admin Work Email');
        } else if (!validateEmailFormat(wizardHospital.adminEmail)) {
          missing.push('Admin Work Email in valid format (e.g. admin@hospital.com)');
        }
        if (!wizardHospital.adminPhone?.trim() || wizardHospital.adminPhone.length !== 10) missing.push('Admin Telephone (10 digits)');
        if (!wizardHospital.adminPassword?.trim()) missing.push('Security Password');
      }
      // Steps 6 and 7 are review/activation — no gating needed
      return missing;
    };

    const isCurrentStepValid = getStepValidation(wizardStep).length === 0;

    const handleNextStep = async () => {
      if (wizardStep < totalSteps) {
        const missing = getStepValidation(wizardStep);
        if (missing.length > 0) {
          showToast(`Please fill required fields: ${missing.join(', ')}`, 'error');
          return;
        }
        const nextStep = wizardStep + 1;
        const saved = await saveWizardDraft(false, nextStep);
        if (saved) {
          setWizardStep(nextStep);
        }
      }
    };

    const handlePrevStep = async () => {
      if (wizardStep > 1) {
        const prevStep = wizardStep - 1;
        saveWizardDraft(false, prevStep);
        setWizardStep(prevStep);
      }
    };

    const updateWizardField = (field, value) => {
      setWizardHospital(prev => {
        const updated = {
          ...prev,
          [field]: value
        };
        if (field === 'panNumber') {
          const pan = (value || '').trim();
          if (pan.length >= 4) {
            const last4 = pan.slice(-4);
            updated.adminPassword = `${last4}@123`;
            updated.confirmAdminPassword = `${last4}@123`;
          }
        }
        return updated;
      });
    };



    const isModuleEnabled = (moduleKey) => {
      if (wizardHospital?.configuredModules && typeof wizardHospital.configuredModules[moduleKey] === 'boolean') {
        return wizardHospital.configuredModules[moduleKey];
      }
      if (wizardHospital?.configuredModules && wizardHospital.configuredModules[moduleKey]?.enabled !== undefined) {
        return Boolean(wizardHospital.configuredModules[moduleKey].enabled);
      }
      if (Array.isArray(wizardHospital?.modules)) {
        return wizardHospital.modules.includes(moduleKey);
      }
      if (wizardHospital?.modules && typeof wizardHospital.modules === 'object' && wizardHospital.modules[moduleKey]) {
        return Boolean(wizardHospital.modules[moduleKey].enabled !== false);
      }
      if (activePlan?.modules) {
        return activePlan.modules.includes(moduleKey);
      }
      return true;
    };

    const toggleWizardModule = (moduleKey, nextVal) => {
      setWizardHospital(prev => {
        const currentConfigured = prev?.configuredModules || {};
        const newConfigured = { ...currentConfigured, [moduleKey]: nextVal };
        const currentList = Array.isArray(prev?.modules)
          ? [...prev.modules]
          : ['reception', 'doctor', 'pharmacy', 'laboratory', 'inventory'];
        const newList = nextVal
          ? (currentList.includes(moduleKey) ? currentList : [...currentList, moduleKey])
          : currentList.filter(m => m !== moduleKey);
        return {
          ...prev,
          configuredModules: newConfigured,
          modules: newList
        };
      });
    };

    const toggleCustomModule = (moduleKey) => {
      if (wizardHospital.subscriptionPlan !== 'custom') return;
      const currentModules = wizardHospital.modules || [];
      const newModules = currentModules.includes(moduleKey)
        ? currentModules.filter(m => m !== moduleKey)
        : [...currentModules, moduleKey];
      updateWizardField('modules', newModules);
    };

    const handleGoLive = async () => {
      await executeHospitalActivation(wizardHospital);
    };

    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', width: '100%', maxWidth: '100%', background: 'radial-gradient(ellipse at top left, #EEF2FF 0%, #F8FAFC 45%, #F1F5F9 100%)', overflow: 'hidden' }}>
        {/* Top Header */}
        <header style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: 'linear-gradient(180deg, #FFFFFF 0%, #F8FAFC 100%)',
          borderBottom: '1px solid #E2E8F0',
          padding: '14px 28px',
          flexShrink: 0,
          boxShadow: '0 2px 10px rgba(15, 23, 42, 0.02)'
        }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
            {/* Breadcrumb Back Link */}
            <div 
              onClick={handleCancelWizard}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                fontSize: '12px',
                fontWeight: 700,
                color: '#2563EB',
                cursor: 'pointer',
                width: 'fit-content'
              }}
            >
              <LucideIcon name="arrow-left" style={{ width: '13px', height: '13px' }} />
              <span>Back to Hospitals</span>
            </div>

            {/* Title Row */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <h1 style={{ margin: 0, fontSize: '19px', fontWeight: 850, color: '#0F172A', letterSpacing: '-0.3px' }}>
                Add New Hospital
              </h1>
              <span style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '20px',
                height: '20px',
                borderRadius: '50%',
                background: 'linear-gradient(135deg, #EFF6FF 0%, #DBEAFE 100%)',
                color: '#2563EB',
                boxShadow: '0 2px 6px rgba(37, 99, 235, 0.15)'
              }}>
                <LucideIcon name="check-circle-2" style={{ width: '16px', height: '16px', color: '#2563EB' }} />
              </span>
              <span style={{
                background: 'linear-gradient(135deg, #FEF3C7 0%, #FDE68A 100%)',
                color: '#92400E',
                border: '1px solid #FCD34D',
                borderRadius: '12px',
                padding: '2px 9px',
                fontSize: '11px',
                fontWeight: 750,
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                boxShadow: '0 2px 6px rgba(217, 119, 6, 0.15)'
              }}>
                <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: '#D97706' }}></span>
                Draft
              </span>
            </div>
            <p style={{ margin: 0, fontSize: '12px', color: '#64748B' }}>
              Register a corporate hospital and configure their enterprise license, facilities, compliance, and administrator credentials.
            </p>
          </div>

          {/* Top Right Action Buttons */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <button
              type="button"
              onClick={handleCancelWizard}
              style={{
                background: '#FFFFFF',
                border: '1px solid #CBD5E1',
                borderRadius: '8px',
                padding: '8px 16px',
                fontSize: '12.5px',
                fontWeight: 700,
                color: '#475569',
                cursor: 'pointer',
                transition: 'all 0.15s ease'
              }}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => saveWizardDraft(false)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                background: '#FFFFFF',
                border: '1px solid #CBD5E1',
                borderRadius: '8px',
                padding: '8px 16px',
                fontSize: '12.5px',
                fontWeight: 700,
                color: '#1E293B',
                cursor: 'pointer',
                transition: 'all 0.15s ease'
              }}
            >
              <LucideIcon name={isDraftSaved ? "check" : "bookmark"} style={{ width: '14px', height: '14px', color: isDraftSaved ? '#10B981' : '#64748B' }} />
              {isDraftSaved ? 'Saved' : 'Save as Draft'}
            </button>
            <button
              type="button"
              onClick={() => {
                if (wizardStep === totalSteps) {
                  handleGoLive();
                } else {
                  handleNextStep();
                }
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                background: 'linear-gradient(135deg, #2563EB 0%, #1D4ED8 50%, #4F46E5 100%)',
                color: '#FFFFFF',
                border: 'none',
                borderRadius: '8px',
                padding: '8px 20px',
                fontSize: '12.5px',
                fontWeight: 750,
                cursor: 'pointer',
                boxShadow: '0 4px 14px rgba(37, 99, 235, 0.35)',
                transition: 'all 0.15s ease'
              }}
            >
              <span>{wizardStep === totalSteps ? 'Register Hospital' : 'Save & Next'}</span>
              <LucideIcon name="arrow-right" style={{ width: '14px', height: '14px' }} />
            </button>
          </div>
        </header>

        {/* Main Scrollable Body */}
        <div style={{ flex: 1, padding: '22px 28px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          
          {/* Horizontal Multi-Step Stepper Ribbon */}
          <div style={{
            background: 'linear-gradient(135deg, #FFFFFF 0%, #F8FAFC 100%)',
            border: '1px solid #DBEAFE',
            borderRadius: '16px',
            padding: '16px 20px',
            boxShadow: '0 6px 20px -4px rgba(37, 99, 235, 0.06), 0 1px 3px rgba(0,0,0,0.02)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            position: 'relative'
          }}>
            {steps.map((step, idx) => {
              const isActive = wizardStep === step.id;
              const isCompleted = wizardStep > step.id;
              const isLast = idx === steps.length - 1;

              return (
                <React.Fragment key={step.id}>
                  <div
                    onClick={async () => {
                      if (step.id < wizardStep) {
                        saveWizardDraft(false, step.id);
                        setWizardStep(step.id);
                      } else if (step.id > wizardStep) {
                        const missing = getStepValidation(wizardStep);
                        if (missing.length > 0) {
                          showToast(`Please fill required fields: ${missing.join(', ')}`, 'error');
                          return;
                        }
                        for (let s = wizardStep; s < step.id; s++) {
                          const sMissing = getStepValidation(s);
                          if (sMissing.length > 0) {
                            showToast(`Please complete Step ${s}: ${sMissing.join(', ')}`, 'error');
                            return;
                          }
                        }
                        const saved = await saveWizardDraft(false, step.id);
                        if (saved) {
                          setWizardStep(step.id);
                        }
                      }
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '10px',
                      cursor: 'pointer',
                      zIndex: 2,
                      flexShrink: 0
                    }}
                  >
                    <div style={{
                      width: '32px',
                      height: '32px',
                      borderRadius: '50%',
                      background: isCompleted 
                        ? 'linear-gradient(135deg, #10B981 0%, #059669 100%)' 
                        : isActive 
                          ? 'linear-gradient(135deg, #2563EB 0%, #4F46E5 100%)' 
                          : '#F1F5F9',
                      color: (isCompleted || isActive) ? '#FFFFFF' : '#64748B',
                      border: isActive ? '2px solid #BFDBFE' : '1px solid transparent',
                      boxShadow: isActive ? '0 4px 14px rgba(37, 99, 235, 0.4)' : isCompleted ? '0 2px 8px rgba(16, 185, 129, 0.3)' : 'none',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontWeight: 800,
                      fontSize: '12px',
                      transition: 'all 0.2s ease'
                    }}>
                      {isCompleted ? <LucideIcon name="check" style={{ width: '14px', height: '14px' }} /> : step.id}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                      <span style={{
                        fontSize: '12px',
                        fontWeight: isActive ? 800 : 650,
                        color: isActive ? '#2563EB' : isCompleted ? '#0F172A' : '#64748B',
                        lineHeight: '1.2'
                      }}>
                        {step.label}
                      </span>
                      <span style={{
                        fontSize: '10px',
                        color: isActive ? '#3B82F6' : '#94A3B8',
                        marginTop: '2px',
                        lineHeight: '1.2'
                      }}>
                        {step.sub}
                      </span>
                    </div>
                  </div>

                  {!isLast && (
                    <div style={{
                      flex: 1,
                      height: '2px',
                      background: isCompleted ? 'linear-gradient(90deg, #10B981, #059669)' : '#E2E8F0',
                      margin: '0 8px',
                      minWidth: '15px'
                    }} />
                  )}
                </React.Fragment>
              );
            })}
          </div>

          {/* Legend & Instructions Ribbon */}
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '2px 4px',
            fontSize: '11px',
            color: '#64748B'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: '#EF4444', boxShadow: '0 0 6px rgba(239, 68, 68, 0.4)' }}></span>
                <strong style={{ color: '#334155' }}>Required</strong>
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: '#3B82F6', boxShadow: '0 0 6px rgba(59, 130, 246, 0.4)' }}></span>
                <strong style={{ color: '#334155' }}>Optional</strong>
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: '#10B981', boxShadow: '0 0 6px rgba(16, 185, 129, 0.4)' }}></span>
                <strong style={{ color: '#334155' }}>Auto-generated</strong>
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                <LucideIcon name="check" style={{ width: '12px', height: '12px', color: '#10B981' }} />
                <strong style={{ color: '#334155' }}>Verified</strong>
              </span>
            </div>

            <div>
              Step {wizardStep} of {totalSteps} — Fields marked <span style={{ color: '#EF4444', fontWeight: 800 }}>*</span> are mandatory before activation.
            </div>
          </div>

          {/* 2-Column Split: Main Form & Preview */}
          <div style={{ display: 'flex', gap: '24px', alignItems: 'flex-start' }}>
            {/* Form Main Area (Left) */}
            <div 
              onKeyDown={(e) => {
                if (e.key === 'Enter' && e.target.tagName === 'INPUT') {
                  e.preventDefault();
                  if (wizardStep === totalSteps) {
                    handleGoLive();
                  } else {
                    handleNextStep();
                  }
                }
              }}
              style={{
                flex: 1,
                minWidth: 0,
                background: 'linear-gradient(180deg, #FFFFFF 0%, #FAFCFF 100%)',
                borderRadius: '20px',
                border: '1px solid #DBEAFE',
                boxShadow: '0 20px 45px -10px rgba(37, 99, 235, 0.08), 0 1px 3px rgba(0,0,0,0.02)',
                padding: '28px 32px',
                display: 'flex',
                flexDirection: 'column',
                gap: '24px'
              }}
            >
              {/* Form Card Header Banner */}
              <div style={{ 
                display: 'flex', 
                justifyContent: 'space-between', 
                alignItems: 'flex-start', 
                borderBottom: '1px solid #EFF6FF', 
                paddingBottom: '16px' 
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                  <div style={{
                    width: '44px',
                    height: '44px',
                    borderRadius: '12px',
                    background: 'linear-gradient(135deg, #2563EB 0%, #4F46E5 100%)',
                    color: '#FFFFFF',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                    boxShadow: '0 4px 14px rgba(37, 99, 235, 0.35)'
                  }}>
                    <LucideIcon name={steps[wizardStep - 1]?.icon || "file-text"} style={{ width: '22px', height: '22px' }} />
                  </div>
                  <div>
                    <h3 style={{ margin: 0, fontSize: '17px', fontWeight: 850, color: '#0F172A', letterSpacing: '-0.2px' }}>
                      {steps[wizardStep - 1]?.label}
                    </h3>
                    <p style={{ margin: '3px 0 0 0', fontSize: '12.5px', color: '#64748B' }}>
                      {steps[wizardStep - 1]?.sub}
                    </p>
                  </div>
                </div>

                <span style={{
                  background: 'linear-gradient(135deg, #EFF6FF 0%, #EEF2FF 100%)',
                  color: '#2563EB',
                  padding: '5px 14px',
                  borderRadius: '20px',
                  fontSize: '11px',
                  fontWeight: 800,
                  border: '1px solid #BFDBFE',
                  boxShadow: '0 2px 8px rgba(37, 99, 235, 0.1)'
                }}>
                  Step {wizardStep} of {totalSteps}
                </span>
              </div>

              {wizardStep === 1 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>

                  {/* Section 1: Hospital Core Info */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                    <div style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '8px',
                      padding: '6px 12px',
                      background: 'linear-gradient(135deg, #EFF6FF 0%, #DBEAFE 100%)',
                      border: '1px solid #BFDBFE',
                      borderRadius: '8px',
                      width: 'fit-content'
                    }}>
                      <LucideIcon name="building-2" style={{ width: '14px', height: '14px', color: '#2563EB' }} />
                      <span style={{ fontSize: '11px', fontWeight: 750, color: '#1E40AF', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                        1. Hospital Core Information
                      </span>
                    </div>

                    <div style={styles.formRow}>
                      <div style={styles.formCol}>
                        <FloatingInput
                          label="Hospital Name"
                          required
                          value={wizardHospital.name || ''}
                          onChange={e => updateWizardField('name', e.target.value)}
                          isValid={!!wizardHospital.name?.trim()}
                        />
                      </div>
                      <div style={styles.formCol}>
                        <div style={{ position: 'relative', width: '100%' }}>
                          <FloatingInput
                            label="Hospital Type"
                            optional
                            value={wizardHospital.hospitalType || ''}
                            onFocus={() => setHospitalTypeSearchOpen(true)}
                            onChange={e => {
                              updateWizardField('hospitalType', e.target.value);
                              setHospitalTypeSearchOpen(true);
                            }}
                            rightElement={
                              <LucideIcon 
                                name="chevron-down" 
                                style={{ width: '15px', height: '15px', color: '#64748B', pointerEvents: 'none' }} 
                              />
                            }
                          />

                          {hospitalTypeSearchOpen && (
                            <>
                              <div 
                                style={{ position: 'fixed', inset: 0, zIndex: 99 }} 
                                onClick={() => setHospitalTypeSearchOpen(false)} 
                              />
                              <div style={{
                                position: 'absolute',
                                top: '100%',
                                left: 0,
                                right: 0,
                                marginTop: '4px',
                                background: '#FFFFFF',
                                border: '1px solid #CBD5E1',
                                borderRadius: '8px',
                                boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1)',
                                maxHeight: '220px',
                                overflowY: 'auto',
                                zIndex: 100,
                                padding: '4px'
                              }}>
                                {(() => {
                                  const allTypes = [
                                    'General Clinics',
                                    'Child & Women Care',
                                    'Medicine Specialties',
                                    'Surgical Specialties',
                                    'Cancer & Chronic Care',
                                    'Mental Health',
                                    'Skin & Cosmetic',
                                    'Dental',
                                    'Rehabilitation',
                                    'Diagnostics',
                                    'Eye & Hearing',
                                    'Lifestyle & Wellness',
                                    'AYUSH (India)',
                                    'Specialized Clinics',
                                    'Digital Healthcare'
                                  ];

                                  const query = (wizardHospital.hospitalType || '').toLowerCase().trim();
                                  const matches = allTypes.filter(t => t.toLowerCase().includes(query));
                                  
                                  return (
                                    <>
                                      {matches.map(type => (
                                        <div 
                                          key={type}
                                          onClick={() => {
                                            updateWizardField('hospitalType', type);
                                            setHospitalTypeSearchOpen(false);
                                          }}
                                          style={{
                                            padding: '8px 12px',
                                            fontSize: '12px',
                                            fontWeight: 600,
                                            color: wizardHospital.hospitalType === type ? '#2563EB' : '#334155',
                                            background: wizardHospital.hospitalType === type ? '#EFF6FF' : 'transparent',
                                            borderRadius: '6px',
                                            cursor: 'pointer',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'space-between',
                                            transition: 'background 0.1s'
                                          }}
                                          onMouseEnter={e => e.currentTarget.style.background = '#F1F5F9'}
                                          onMouseLeave={e => e.currentTarget.style.background = wizardHospital.hospitalType === type ? '#EFF6FF' : 'transparent'}
                                        >
                                          <span>{type}</span>
                                          {wizardHospital.hospitalType === type && (
                                            <LucideIcon name="check" style={{ width: '14px', height: '14px', color: '#2563EB' }} />
                                          )}
                                        </div>
                                      ))}
                                      {query && !allTypes.some(t => t.toLowerCase() === query) && (
                                        <div 
                                          onClick={() => {
                                            setHospitalTypeSearchOpen(false);
                                          }}
                                          style={{
                                            padding: '8px 12px',
                                            fontSize: '12px',
                                            fontWeight: 700,
                                            color: '#059669',
                                            background: '#ECFDF5',
                                            borderRadius: '6px',
                                            cursor: 'pointer',
                                            marginTop: '4px',
                                            border: '1px solid #A7F3D0'
                                          }}
                                        >
                                          ✨ Use Custom Type: "{wizardHospital.hospitalType}"
                                        </div>
                                      )}
                                    </>
                                  );
                                })()}
                              </div>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div style={{ height: '1px', background: 'linear-gradient(90deg, transparent, #E2E8F0, transparent)' }} />

                  {/* Section 2: Primary Contact */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                    <div style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '8px',
                      padding: '6px 12px',
                      background: 'linear-gradient(135deg, #ECFDF5 0%, #D1FAE5 100%)',
                      border: '1px solid #A7F3D0',
                      borderRadius: '8px',
                      width: 'fit-content'
                    }}>
                      <LucideIcon name="user-check" style={{ width: '14px', height: '14px', color: '#059669' }} />
                      <span style={{ fontSize: '11px', fontWeight: 750, color: '#065F46', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                        2. Primary Contact Details
                      </span>
                    </div>

                    <div style={styles.formRow}>
                      <div style={styles.formCol}>
                        <FloatingInput
                          label="Primary Contact Person"
                          required
                          value={wizardHospital.contactName || ''}
                          onChange={e => updateWizardField('contactName', e.target.value)}
                          isValid={!!wizardHospital.contactName?.trim()}
                        />
                      </div>
                      <div style={styles.formCol}>
                        <FloatingInput
                          label="Designation"
                          optional
                          value={wizardHospital.contactDesignation || ''}
                          onChange={e => updateWizardField('contactDesignation', e.target.value)}
                        />
                      </div>
                    </div>
                    <div style={styles.formRow}>
                      <div style={styles.formCol}>
                        <FloatingInput
                          label="Contact Email"
                          required
                          type="email"
                          value={wizardHospital.contactEmail || ''}
                          onChange={e => updateWizardField('contactEmail', e.target.value)}
                          error={wizardHospital.contactEmail && !validateEmailFormat(wizardHospital.contactEmail)}
                          isValid={wizardHospital.contactEmail && validateEmailFormat(wizardHospital.contactEmail)}
                        />
                        {wizardHospital.contactEmail && !validateEmailFormat(wizardHospital.contactEmail) && (
                          <span style={{ fontSize: '10.5px', color: '#EF4444', marginTop: '4px', fontWeight: 600 }}>⚠️ Please enter a valid email address (e.g. contact@hospital.com).</span>
                        )}
                      </div>
                      <div style={styles.formCol}>
                        <FloatingInput
                          label="Mobile Number (10 Digits)"
                          optional
                          maxLength={10}
                          value={wizardHospital.contactMobile || ''}
                          onChange={e => updateWizardField('contactMobile', e.target.value.replace(/[^0-9]/g, ''))}
                        />
                      </div>
                    </div>
                  </div>

                  <div style={{ height: '1px', background: 'linear-gradient(90deg, transparent, #E2E8F0, transparent)' }} />

                  {/* Section 3: Facility Location */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                    <div style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '8px',
                      padding: '6px 12px',
                      background: 'linear-gradient(135deg, #FAF5FF 0%, #EDE9FE 100%)',
                      border: '1px solid #DDD6FE',
                      borderRadius: '8px',
                      width: 'fit-content'
                    }}>
                      <LucideIcon name="map-pin" style={{ width: '14px', height: '14px', color: '#7C3AED' }} />
                      <span style={{ fontSize: '11px', fontWeight: 750, color: '#5B21B6', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                        3. Facility Location & Address
                      </span>
                    </div>

                    <div style={styles.formRow}>
                      <div style={styles.formCol}>
                        <FloatingInput
                          label="City"
                          required
                          value={wizardHospital.city || ''}
                          onChange={e => updateWizardField('city', e.target.value)}
                          isValid={!!wizardHospital.city?.trim()}
                        />
                      </div>
                      <div style={styles.formCol}>
                        <FloatingInput
                          label="Country"
                          optional
                          value={wizardHospital.country || ''}
                          onChange={e => updateWizardField('country', e.target.value)}
                        />
                      </div>
                    </div>
                    <div style={styles.formCol}>
                      <FloatingInput
                        label="Street Address"
                        required
                        multiline
                        rows={2}
                        value={wizardHospital.address || ''}
                        onChange={e => updateWizardField('address', e.target.value)}
                        isValid={!!wizardHospital.address?.trim()}
                      />
                    </div>
                    <div style={styles.formCol}>
                      <FloatingInput
                        label="Google Maps Embed or Location URL"
                        optional
                        value={wizardHospital.googleMapUrl || ''}
                        onChange={e => updateWizardField('googleMapUrl', e.target.value)}
                      />
                    </div>
                  </div>
                </div>
              )}

              {wizardStep === 2 && (
                <HospitalIdentityStep
                  wizardHospital={wizardHospital}
                  updateWizardField={updateWizardField}
                />
              )}
              {wizardStep === 2 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', marginTop: '-4px' }}>
                  <div>
                    <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 800, color: '#0F172A' }}>Regional & Localization Configurations</h3>
                    <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: '#64748B' }}>Set default times, currencies, languages, and view enabled software modules.</p>
                  </div>
                  <div style={styles.formRow}>
                    <div style={styles.formCol}>
                      <FloatingSelect 
                        label="Timezone"
                        required
                        value={wizardHospital.timezone || ''} 
                        onChange={e => updateWizardField('timezone', e.target.value)}
                        options={[
                          { value: '', label: 'Select Timezone' },
                          { value: 'Asia/Kolkata', label: 'Asia/Kolkata (IST)' },
                          { value: 'UTC', label: 'UTC (Greenwich Mean Time)' },
                          { value: 'America/New_York', label: 'America/New_York (EST)' },
                          { value: 'Europe/London', label: 'Europe/London (GMT/BST)' }
                        ]}
                      />
                    </div>
                    <div style={styles.formCol}>
                      <FloatingSelect 
                        label="Currency"
                        required
                        value={wizardHospital.currency || ''} 
                        onChange={e => updateWizardField('currency', e.target.value)}
                        options={[
                          { value: '', label: 'Select Currency' },
                          { value: 'INR', label: 'INR (₹)' },
                          { value: 'USD', label: 'USD ($)' },
                          { value: 'EUR', label: 'EUR (€)' },
                          { value: 'GBP', label: 'GBP (£)' }
                        ]}
                      />
                    </div>
                  </div>
                  <div style={styles.formRow}>
                    <div style={styles.formCol}>
                      <FloatingSelect 
                        label="Date Format"
                        required
                        value={wizardHospital.dateFormat || ''} 
                        onChange={e => updateWizardField('dateFormat', e.target.value)}
                        options={[
                          { value: '', label: 'Select Format' },
                          { value: 'DD/MM/YYYY', label: 'DD/MM/YYYY' },
                          { value: 'MM/DD/YYYY', label: 'MM/DD/YYYY' },
                          { value: 'YYYY-MM-DD', label: 'YYYY-MM-DD' }
                        ]}
                      />
                    </div>
                    <div style={styles.formCol}>
                      <FloatingSelect 
                        label="Time Format"
                        required
                        value={wizardHospital.timeFormat || ''} 
                        onChange={e => updateWizardField('timeFormat', e.target.value)}
                        options={[
                          { value: '', label: 'Select Format' },
                          { value: '12-hour', label: '12-hour' },
                          { value: '24-hour', label: '24-hour' }
                        ]}
                      />
                    </div>
                  </div>
                  <div style={styles.formCol}>
                    <FloatingSelect 
                      label="Primary Language"
                      required
                      value={wizardHospital.primaryLanguage || ''} 
                      onChange={e => updateWizardField('primaryLanguage', e.target.value)}
                      options={[
                        { value: '', label: 'Select Language' },
                        { value: 'English', label: 'English' },
                        { value: 'Hindi', label: 'Hindi' },
                        { value: 'Spanish', label: 'Spanish' },
                        { value: 'Arabic', label: 'Arabic' }
                      ]}
                    />
                  </div>
                </div>
              )}

              {wizardStep === 3 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                  <div>
                    <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 800, color: '#0F172A' }}>Legal Registration & Compliance Credentials</h3>
                    <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: '#64748B' }}>Insert tax registration certificates, CIN, drug license and status audits.</p>
                  </div>
                  <div style={styles.formRow}>
                    <div style={styles.formCol}>
                      <FloatingInput
                        label="PAN Number (10 Alphanumeric)"
                        required
                        error={wizardHospital.panNumber && !validatePANFormat(wizardHospital.panNumber)}
                        isValid={wizardHospital.panNumber && validatePANFormat(wizardHospital.panNumber)}
                        value={wizardHospital.panNumber || ''} 
                        onChange={e => updateWizardField('panNumber', e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10))} 
                      />
                      {wizardHospital.panNumber && !validatePANFormat(wizardHospital.panNumber) && (
                        <span style={{ fontSize: '10.5px', color: '#EF4444', marginTop: '4px', fontWeight: 600 }}>⚠️ PAN must be structured as: 5 letters, 4 digits, 1 letter.</span>
                      )}
                    </div>
                    <div style={styles.formCol}>
                      <FloatingInput
                        label="GSTIN Number (15 Characters)"
                        required
                        error={wizardHospital.gstin && !validateGSTINFormat(wizardHospital.gstin)}
                        isValid={wizardHospital.gstin && validateGSTINFormat(wizardHospital.gstin)}
                        value={wizardHospital.gstin || ''} 
                        onChange={e => updateWizardField('gstin', e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 15))} 
                      />
                      {wizardHospital.gstin && !validateGSTINFormat(wizardHospital.gstin) && (
                        <span style={{ fontSize: '10.5px', color: '#EF4444', marginTop: '4px', fontWeight: 600 }}>⚠️ GSTIN must be structured as: 15-character official format (e.g. 07METRO8827P1ZX).</span>
                      )}
                    </div>
                  </div>
                  <div style={styles.formRow}>
                    <div style={styles.formCol}>
                      <FloatingInput
                        label="CIN (Corporate ID - 21 Chars)"
                        required
                        error={wizardHospital.corpId && !validateCINFormat(wizardHospital.corpId)}
                        isValid={wizardHospital.corpId && validateCINFormat(wizardHospital.corpId)}
                        value={wizardHospital.corpId || ''} 
                        onChange={e => updateWizardField('corpId', e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 21))} 
                      />
                      {wizardHospital.corpId && !validateCINFormat(wizardHospital.corpId) && (
                        <span style={{ fontSize: '10.5px', color: '#EF4444', marginTop: '4px', fontWeight: 600 }}>⚠️ CIN must be structured as: 21-character corporate listing format.</span>
                      )}
                    </div>
                    <div style={styles.formCol}>
                      <FloatingInput
                        label="Authorized Signatory Name"
                        required
                        isValid={!!wizardHospital.signatoryName?.trim()}
                        value={wizardHospital.signatoryName || ''} 
                        onChange={e => updateWizardField('signatoryName', e.target.value)} 
                      />
                    </div>
                  </div>
                  <div style={{ height: '1px', background: '#F1F5F9', margin: '6px 0' }} />
                  <div style={styles.formRow}>
                    <div style={styles.formCol}>
                      <FloatingInput
                        label="Drug License Number"
                        required
                        error={wizardHospital.drugLicense && !validateDrugLicenseFormat(wizardHospital.drugLicense)}
                        isValid={wizardHospital.drugLicense && validateDrugLicenseFormat(wizardHospital.drugLicense)}
                        value={wizardHospital.drugLicense || ''} 
                        onChange={e => updateWizardField('drugLicense', e.target.value.replace(/[^a-zA-Z0-9\-\/\s]/g, '').slice(0, 30))} 
                      />
                      {wizardHospital.drugLicense && !validateDrugLicenseFormat(wizardHospital.drugLicense) && (
                        <span style={{ fontSize: '10.5px', color: '#EF4444', marginTop: '4px', fontWeight: 600 }}>⚠️ Drug license must be 5 to 30 characters using only alphanumeric, hyphens, slashes, or spaces.</span>
                      )}
                    </div>
                    <div style={styles.formCol}>
                      <FloatingInput
                        label="Fire Safety Certificate"
                        optional
                        error={wizardHospital.fireSafetyCertificate && !validateCertificateFormat(wizardHospital.fireSafetyCertificate)}
                        isValid={wizardHospital.fireSafetyCertificate && validateCertificateFormat(wizardHospital.fireSafetyCertificate)}
                        value={wizardHospital.fireSafetyCertificate || ''} 
                        onChange={e => updateWizardField('fireSafetyCertificate', e.target.value.replace(/[^a-zA-Z0-9\-\/\s]/g, '').slice(0, 30))} 
                      />
                      {wizardHospital.fireSafetyCertificate && !validateCertificateFormat(wizardHospital.fireSafetyCertificate) && (
                        <span style={{ fontSize: '10.5px', color: '#EF4444', marginTop: '4px', fontWeight: 600 }}>⚠️ Fire Certificate must be 5 to 30 characters using only alphanumeric, hyphens, slashes, or spaces.</span>
                      )}
                    </div>
                  </div>
                  <div style={styles.formCol}>
                    <FloatingInput
                      label="Pollution Control Board Register Number"
                      optional
                      error={wizardHospital.pollutionCertificate && !validateCertificateFormat(wizardHospital.pollutionCertificate)}
                      isValid={wizardHospital.pollutionCertificate && validateCertificateFormat(wizardHospital.pollutionCertificate)}
                      value={wizardHospital.pollutionCertificate || ''} 
                      onChange={e => updateWizardField('pollutionCertificate', e.target.value.replace(/[^a-zA-Z0-9\-\/\s]/g, '').slice(0, 30))} 
                    />
                    {wizardHospital.pollutionCertificate && !validateCertificateFormat(wizardHospital.pollutionCertificate) && (
                      <span style={{ fontSize: '10.5px', color: '#EF4444', marginTop: '4px', fontWeight: 600 }}>⚠️ Pollution Certificate must be 5 to 30 characters using only alphanumeric, hyphens, slashes, or spaces.</span>
                    )}
                  </div>
                  
                  <div style={styles.formCol}>
                    <label style={styles.formLabel}>
                      COMPLIANCE DOCUMENTS (PDF, XML, DOCX, IMAGES) <span style={{ fontSize: '10px', color: '#94A3B8', fontWeight: 600, textTransform: 'none' }}>(Optional)</span>
                    </label>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      <input 
                        type="file"
                        accept=".pdf,.xml,.docx,image/*"
                        onChange={async (e) => {
                          const file = e.target.files[0];
                          if (!file) return;
                          
                          // Front-end file size guard (10MB limit)
                          if (file.size > 10 * 1024 * 1024) {
                            setDocUploadError('⚠️ Maximum file size limit exceeded (10MB maximum).');
                            showToast('File size exceeds the 10MB limit.', 'error');
                            e.target.value = '';
                            return;
                          }
                          
                          setDocUploadError('');
                          setUploadingDoc(true);
                          const formData = new FormData();
                          formData.append('document', file);
                          
                          try {
                            const token = localStorage.getItem('token');
                            const res = await fetch('/api/superadmin/upload-compliance', {
                              method: 'POST',
                              headers: { 'Authorization': `Bearer ${token}` },
                              body: formData
                            });
                            
                            if (res.ok) {
                              const data = await res.json();
                              const currentDocs = wizardHospital.complianceDocuments || [];
                              updateWizardField('complianceDocuments', [...currentDocs, { url: data.url, filename: data.filename, uploadedAt: new Date() }]);
                              showToast(`Uploaded ${data.filename} successfully`);
                            } else {
                              const errData = await res.json().catch(() => ({}));
                              setDocUploadError(errData.error || 'File upload failed');
                              showToast(errData.error || 'File upload failed', 'error');
                            }
                          } catch (err) {
                            console.error('Upload error:', err);
                            setDocUploadError('Error uploading document. Check server connectivity.');
                            showToast('Error uploading document', 'error');
                          } finally {
                            setUploadingDoc(false);
                          }
                          e.target.value = ''; // Reset input
                        }}
                        style={{ padding: '8px', border: '1px dashed #CBD5E1', borderRadius: '6px', background: '#F8FAFC', cursor: 'pointer', fontSize: '11px', color: '#64748B' }}
                      />
                      {uploadingDoc && (
                        <span style={{ fontSize: '11px', color: '#2563EB', fontWeight: 600 }}>⏳ Uploading document, please wait...</span>
                      )}
                      {docUploadError && (
                        <span style={{ fontSize: '11px', color: '#EF4444', fontWeight: 600 }}>{docUploadError}</span>
                      )}
                      {wizardHospital.complianceDocuments && wizardHospital.complianceDocuments.length > 0 && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '4px' }}>
                          {wizardHospital.complianceDocuments.map((doc, idx) => (
                            <div key={idx} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#F1F5F9', padding: '6px 10px', borderRadius: '4px' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <LucideIcon name="file-text" style={{ width: '12px', height: '12px', color: '#3B82F6' }} />
                                <span style={{ fontSize: '11px', fontWeight: 600, color: '#334155' }}>{doc.filename}</span>
                              </div>
                              <button 
                                type="button"
                                onClick={() => {
                                  const updated = wizardHospital.complianceDocuments.filter((_, i) => i !== idx);
                                  updateWizardField('complianceDocuments', updated);
                                }}
                                style={{ background: 'none', border: 'none', color: '#EF4444', cursor: 'pointer', display: 'flex' }}
                              >
                                <LucideIcon name="trash-2" style={{ width: '12px', height: '12px' }} />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {wizardStep === 4 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                  <div>
                    <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 800, color: '#0F172A' }}>Subscription Plans & Gating Options</h3>
                    <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: '#64748B' }}>Choose licensing tiers. Doctors/staff limits and module configurations adapt automatically.</p>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                    {plans.map(p => {
                      const isSelected = wizardHospital.subscriptionPlan === p.matchKey;
                      return (
                        <div 
                          key={p._id}
                          onClick={() => {
                            updateWizardField('subscriptionPlan', p.matchKey);
                            if (p.matchKey !== 'custom') {
                              updateWizardField('modules', p.modules);
                            }
                          }}
                          style={{
                            border: isSelected ? '2.5px solid #2563EB' : '1px solid #E2E8F0',
                            background: isSelected ? '#F0F6FF' : '#FFFFFF',
                            borderRadius: '10px',
                            padding: '16px',
                            cursor: 'pointer',
                            transition: 'all 0.15s'
                          }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                            <strong style={{ fontSize: '14px', color: '#1E293B' }}>{p.tier}</strong>
                            {isSelected && <LucideIcon name="check-circle" style={{ width: '16px', height: '16px', color: '#2563EB' }} />}
                          </div>
                          <div style={{ fontSize: '18px', fontWeight: 850, color: '#2563EB', margin: '4px 0' }}>
                            ₹{wizardHospital.billingCycle === 'annual' ? p.annualPrice.toLocaleString() : p.monthlyPrice.toLocaleString()}
                            <span style={{ fontSize: '11px', color: '#64748B', fontWeight: 500 }}>
                              /{wizardHospital.billingCycle === 'annual' ? 'yr' : 'mo'}
                            </span>
                          </div>
                          <div style={{ fontSize: '11px', color: '#64748B', display: 'flex', flexDirection: 'column', gap: '5px', marginTop: '10px' }}>
                            <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <LucideIcon name="users" style={{ width: '12px', height: '12px', color: '#64748B' }} />
                              Staff: <strong>{p.staff} seats</strong>
                            </span>
                            <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <LucideIcon name="stethoscope" style={{ width: '12px', height: '12px', color: '#64748B' }} />
                              Doctors: <strong>{p.docs} seats</strong>
                            </span>
                            <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <LucideIcon name="database" style={{ width: '12px', height: '12px', color: '#64748B' }} />
                              Vault: <strong>{p.storage}</strong>
                            </span>
                            {p.matchKey === 'custom' && (
                              <span style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#EF4444', fontWeight: 800, marginTop: '8px' }}>
                                <LucideIcon name="alert-circle" style={{ width: '12px', height: '12px', color: '#EF4444' }} />
                                Expiry: Automatically closes after 1 week
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <div style={{ height: '1px', background: '#E2E8F0', margin: '8px 0' }} />

                  <div style={styles.formRow}>
                    <div style={styles.formCol}>
                      <FloatingSelect 
                        label="Billing Cycle"
                        required
                        value={wizardHospital.billingCycle || ''} 
                        onChange={e => updateWizardField('billingCycle', e.target.value)}
                        options={[
                          { value: '', label: 'Select Cycle' },
                          { value: 'monthly', label: 'Monthly Cycle' },
                          { value: 'annual', label: 'Annual Term' }
                        ]}
                      />
                    </div>
                    <div style={styles.formCol}>
                      <FloatingInput 
                        label="Contract Start Date"
                        optional
                        type="date"
                        value={wizardHospital.contractStartDate ? wizardHospital.contractStartDate.slice(0,10) : ''} 
                        onChange={e => updateWizardField('contractStartDate', e.target.value)} 
                      />
                    </div>
                  </div>

                  <div style={styles.formCol}>
                    <FloatingSelect 
                      label="Contract Validity Period (Years)"
                      required
                      value={wizardHospital.contractDurationYears || ''} 
                      onChange={e => updateWizardField('contractDurationYears', parseInt(e.target.value) || 1)}
                      options={[
                        { value: '', label: 'Select Duration' },
                        { value: 1, label: '1 Year' },
                        { value: 2, label: '2 Years' },
                        { value: 3, label: '3 Years' },
                        { value: 5, label: '5 Years' }
                      ]}
                    />
                  </div>

                  <div style={{ height: '1px', background: '#E2E8F0', margin: '8px 0' }} />

                  {/* CLINICAL OPERATIONS & DOCTOR MODE CONFIGURATION */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    <div>
                      <h4 style={{ margin: 0, fontSize: '13.5px', fontWeight: 800, color: '#0F172A', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                        CLINICAL OPERATIONS <span style={{ color: '#EF4444', fontWeight: 800 }}>*</span>
                      </h4>
                      <p style={{ margin: '3px 0 0', fontSize: '11.5px', color: '#64748B' }}>
                        Configure the clinical operating mode and active functional modules for this hospital node.
                      </p>
                    </div>

                    {/* Doctor Clinical Mode Selector */}
                    <div style={{ background: '#F8FAFC', padding: '16px', borderRadius: '12px', border: '1px solid #E2E8F0', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <label style={{ fontSize: '11px', fontWeight: 800, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                          DOCTOR CLINICAL MODE <span style={{ color: '#EF4444', fontWeight: 800 }}>*</span>
                        </label>
                        <span style={{
                          fontSize: '11px',
                          fontWeight: 800,
                          padding: '2px 8px',
                          borderRadius: '6px',
                          background: (wizardHospital.doctorClinicalMode || 'ONLINE') === 'ONLINE' ? '#EFF6FF' : '#FFF7ED',
                          color: (wizardHospital.doctorClinicalMode || 'ONLINE') === 'ONLINE' ? '#2563EB' : '#EA580C',
                          border: `1px solid ${(wizardHospital.doctorClinicalMode || 'ONLINE') === 'ONLINE' ? '#BFDBFE' : '#FED7AA'}`
                        }}>
                          ● Active Mode: {wizardHospital.doctorClinicalMode || 'ONLINE'}
                        </span>
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                        {/* ONLINE Option */}
                        <div
                          onClick={() => updateWizardField('doctorClinicalMode', 'ONLINE')}
                          style={{
                            border: (wizardHospital.doctorClinicalMode || 'ONLINE') === 'ONLINE' ? '2px solid #2563EB' : '1px solid #CBD5E1',
                            background: (wizardHospital.doctorClinicalMode || 'ONLINE') === 'ONLINE' ? '#EFF6FF' : '#FFFFFF',
                            borderRadius: '10px',
                            padding: '14px',
                            cursor: 'pointer',
                            transition: 'all 0.15s ease'
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                            <input
                              type="radio"
                              name="onboardingDoctorClinicalMode"
                              checked={(wizardHospital.doctorClinicalMode || 'ONLINE') === 'ONLINE'}
                              onChange={() => updateWizardField('doctorClinicalMode', 'ONLINE')}
                              style={{ accentColor: '#2563EB', cursor: 'pointer' }}
                            />
                            <strong style={{ fontSize: '13px', color: (wizardHospital.doctorClinicalMode || 'ONLINE') === 'ONLINE' ? '#1E40AF' : '#1E293B' }}>
                              ONLINE
                            </strong>
                          </div>
                          <p style={{ margin: 0, fontSize: '11px', color: '#64748B', lineHeight: 1.45, paddingLeft: '22px' }}>
                            Doctors use Curoxa for digital clinical consultations, prescriptions and clinical workflows.
                          </p>
                        </div>

                        {/* OFFLINE Option */}
                        <div
                          onClick={() => updateWizardField('doctorClinicalMode', 'OFFLINE')}
                          style={{
                            border: (wizardHospital.doctorClinicalMode || 'ONLINE') === 'OFFLINE' ? '2px solid #EA580C' : '1px solid #CBD5E1',
                            background: (wizardHospital.doctorClinicalMode || 'ONLINE') === 'OFFLINE' ? '#FFF7ED' : '#FFFFFF',
                            borderRadius: '10px',
                            padding: '14px',
                            cursor: 'pointer',
                            transition: 'all 0.15s ease'
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                            <input
                              type="radio"
                              name="onboardingDoctorClinicalMode"
                              checked={(wizardHospital.doctorClinicalMode || 'ONLINE') === 'OFFLINE'}
                              onChange={() => updateWizardField('doctorClinicalMode', 'OFFLINE')}
                              style={{ accentColor: '#EA580C', cursor: 'pointer' }}
                            />
                            <strong style={{ fontSize: '13px', color: (wizardHospital.doctorClinicalMode || 'ONLINE') === 'OFFLINE' ? '#C2410C' : '#1E293B' }}>
                              OFFLINE
                            </strong>
                          </div>
                          <p style={{ margin: 0, fontSize: '11px', color: '#64748B', lineHeight: 1.45, paddingLeft: '22px' }}>
                            Doctors use Curoxa for HR/self-service only. Clinical consultation and handwritten prescriptions are handled through the hospital's offline workflow.
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Hospital Services & Module Configuration */}
                    <div style={{ background: '#F8FAFC', padding: '16px', borderRadius: '12px', border: '1px solid #E2E8F0', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                      <div>
                        <label style={{ fontSize: '11px', fontWeight: 800, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginBottom: '2px' }}>
                          HOSPITAL SERVICES & MODULE CONFIGURATION
                        </label>
                        <p style={{ margin: 0, fontSize: '11px', color: '#64748B' }}>
                          Enable or disable specific modules based on hospital facilities.
                        </p>
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                        {[
                          { key: 'reception', label: 'Reception Module', desc: 'Front desk, check-in, appointments & token queue' },
                          { key: 'doctor', label: 'Doctor Module', desc: 'Physician portal (clinical or HR according to mode)' },
                          { key: 'pharmacy', label: 'Pharmacy Module', desc: 'Prescription dispensation and medication inventory' },
                          { key: 'laboratory', label: 'Laboratory Module', desc: 'Diagnostic test requests, sample tracking & reports' }
                        ].map(mod => {
                          const isEnabled = isModuleEnabled(mod.key);
                          return (
                            <div
                              key={mod.key}
                              style={{
                                background: '#FFFFFF',
                                border: '1px solid #E2E8F0',
                                borderRadius: '10px',
                                padding: '12px 14px',
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                gap: '10px'
                              }}
                            >
                              <div style={{ minWidth: 0 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                  <strong style={{ fontSize: '12.5px', color: '#1E293B' }}>{mod.label}</strong>
                                  <span style={{
                                    fontSize: '9.5px',
                                    fontWeight: 800,
                                    padding: '1px 6px',
                                    borderRadius: '8px',
                                    background: isEnabled ? '#DCFCE7' : '#F1F5F9',
                                    color: isEnabled ? '#15803D' : '#64748B'
                                  }}>
                                    {isEnabled ? 'ON' : 'OFF'}
                                  </span>
                                </div>
                                <p style={{ margin: '2px 0 0', fontSize: '10.5px', color: '#64748B', lineHeight: 1.3 }}>
                                  {mod.desc}
                                </p>
                              </div>
                              <ToggleSwitch
                                checked={isEnabled}
                                onChange={(nextVal) => toggleWizardModule(mod.key, nextVal)}
                              />
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {wizardStep === 5 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                  <div>
                    <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 800, color: '#0F172A' }}>User & Role Provisioning Console</h3>
                    <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: '#64748B' }}>Provision administrative personnel, configure access matrices, and verify technical database routing parameters.</p>
                  </div>

                  {/* Horizontal Metric Counters */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px' }}>
                    {(() => {
                      const usersCount = wizardHospital.provisionedUsers?.length || 0;
                      const activeUsers = wizardHospital.provisionedUsers?.filter(u => u.status === 'Active').length || 0;
                      const pendingInvites = wizardHospital.provisionedUsers?.filter(u => u.status === 'Pending' || u.status === 'Pending Invite').length || 0;
                      const rolesAssigned = new Set(wizardHospital.provisionedUsers?.map(u => u.role)).size || 0;
                      const limit = activePlan?.staff || 50;

                      return [
                        { label: 'USERS CONFIGURED', val: `${usersCount} / ${limit} seats`, icon: 'users', color: '#2563EB', bg: '#EFF6FF' },
                        { label: 'ACTIVE USERS', val: `${activeUsers} staff`, icon: 'user-check', color: '#10B981', bg: '#ECFDF5' },
                        { label: 'PENDING INVITES', val: `${pendingInvites} user${pendingInvites === 1 ? '' : 's'}`, icon: 'mail', color: '#F59E0B', bg: '#FFFBEB' },
                        { label: 'ROLES ASSIGNED', val: `${rolesAssigned} role${rolesAssigned === 1 ? '' : 's'}`, icon: 'shield', color: '#8B5CF6', bg: '#F5F3FF' }
                      ];
                    })().map((m, idx) => (
                      <div key={idx} style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '10px', padding: '12px 14px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div style={{ width: '36px', height: '36px', borderRadius: '8px', background: m.bg, color: m.color, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <LucideIcon name={m.icon} style={{ width: '18px', height: '18px' }} />
                        </div>
                        <div>
                          <span style={{ fontSize: '9px', fontWeight: 800, color: '#64748B', letterSpacing: '0.3px', display: 'block' }}>{m.label}</span>
                          <span style={{ fontSize: '14.5px', fontWeight: 850, color: '#0F172A' }}>{m.val}</span>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Provisioned Onboarding Staff */}
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                      <h4 style={{ margin: 0, fontSize: '13px', fontWeight: 800, color: '#1E293B' }}>Provisioned Staff Registry <span style={{ fontSize: '10px', color: '#94A3B8', fontWeight: 600, textTransform: 'none' }}>(Optional)</span></h4>
                      <button 
                        type="button" 
                        style={{ ...styles.btnPrimary, height: '30px', padding: '0 10px', fontSize: '11px' }}
                        onClick={() => setIsAddUserDrawerOpen(true)}
                      >
                        <LucideIcon name="plus" style={{ width: '12px', height: '12px', marginRight: '4px' }} />
                        Add Onboarding User
                      </button>
                    </div>
                    
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
                      {(!wizardHospital.provisionedUsers || wizardHospital.provisionedUsers.length === 0) ? (
                        <div style={{ gridColumn: '1 / -1', padding: '20px', textAlign: 'center', background: '#F8FAFC', border: '1px dashed #CBD5E1', borderRadius: '10px' }}>
                          <span style={{ fontSize: '12.5px', color: '#64748B', fontWeight: 600 }}>No staff members provisioned yet.</span>
                        </div>
                      ) : (
                        wizardHospital.provisionedUsers.map((u, i) => (
                          <div key={i} style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '10px', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                              <div>
                                <div style={{ fontSize: '12.5px', fontWeight: 800, color: '#0F172A' }}>{u.firstName} {u.lastName}</div>
                                <div style={{ fontSize: '10.5px', color: '#64748B', fontWeight: 650 }}>{u.role}</div>
                              </div>
                              <span style={{ fontSize: '9px', padding: '2px 6px', borderRadius: '4px', background: u.status === 'Active' ? '#ECFDF5' : '#FFFBEB', color: u.status === 'Active' ? '#10B981' : '#F59E0B', fontWeight: 700 }}>
                                {u.status || 'Pending'}
                              </span>
                            </div>
                            <div style={{ fontSize: '10.5px', color: '#64748B', display: 'flex', alignItems: 'center', gap: '4px' }}>
                              <LucideIcon name="mail" style={{ width: '12px', height: '12px' }} />
                              {u.email}
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                  {/* Role Assignment Matrix Table */}
                  <div>
                    <h4 style={{ margin: '0 0 10px 0', fontSize: '13px', fontWeight: 800, color: '#1E293B' }}>Role Access Control Matrix</h4>
                    <div style={{ overflowX: 'auto', border: '1px solid #E2E8F0', borderRadius: '10px', background: '#FFFFFF' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11.5px', textAlign: 'left' }}>
                        <thead>
                          <tr style={{ background: '#F8FAFC', borderBottom: '1px solid #E2E8F0' }}>
                            <th style={{ padding: '8px 12px', color: '#64748B', fontWeight: 800 }}>ROLE TYPE</th>
                            <th style={{ padding: '8px 12px', color: '#64748B', fontWeight: 800 }}>PATIENTS ACCESS</th>
                            <th style={{ padding: '8px 12px', color: '#64748B', fontWeight: 800 }}>CLINICAL RECORDS</th>
                            <th style={{ padding: '8px 12px', color: '#64748B', fontWeight: 800 }}>BILLING & FINANCIALS</th>
                            <th style={{ padding: '8px 12px', color: '#64748B', fontWeight: 800 }}>INVENTORY / PHARMACY</th>
                            <th style={{ padding: '8px 12px', color: '#64748B', fontWeight: 800 }}>SYSTEM SETTINGS</th>
                          </tr>
                        </thead>
                        <tbody>
                          {[
                            { role: 'Administrator', p: 'Read/Write', c: 'Read/Write', b: 'Read/Write', i: 'Read/Write', s: 'Full Root' },
                            { role: 'Doctor / Clinical Staff', p: 'Read/Write', c: 'Read/Write', b: 'No Access', i: 'Read Only', s: 'No Access' },
                            { role: 'Pharmacy Executive', p: 'Read Only', c: 'No Access', b: 'Read/Write', i: 'Read/Write', s: 'No Access' },
                            { role: 'Receptionist / Front Desk', p: 'Read/Write', c: 'No Access', b: 'Read Only', i: 'No Access', s: 'No Access' }
                          ].map((row, idx) => (
                            <tr key={idx} style={{ borderBottom: idx < 3 ? '1px solid #F1F5F9' : 'none' }}>
                              <td style={{ padding: '10px 12px', fontWeight: 800, color: '#1E293B' }}>{row.role}</td>
                              <td style={{ padding: '10px 12px', color: '#475569' }}>{row.p}</td>
                              <td style={{ padding: '10px 12px', color: '#475569' }}>{row.c}</td>
                              <td style={{ padding: '10px 12px', color: '#475569' }}>{row.b}</td>
                              <td style={{ padding: '10px 12px', color: '#475569' }}>{row.i}</td>
                              <td style={{ padding: '10px 12px', fontWeight: row.s.includes('Full') ? 700 : 400, color: row.s.includes('Full') ? '#2563EB' : '#475569' }}>{row.s}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Access Control Policies & Governance Toggles */}
                  <div>
                    <h4 style={{ margin: '0 0 10px 0', fontSize: '13px', fontWeight: 800, color: '#1E293B' }}>Global Governance Policies</h4>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px' }}>
                      {[
                        { title: 'Auto-Deactivate Inactive Users', desc: 'Deactivates accounts after 90 days of absolute inactivity.' },
                        { title: 'Periodic Password Rotation', desc: 'Requires all administrative roles to rotate credentials every 180 days.' }
                      ].map((p, i) => (
                        <div key={i} style={{ padding: '12px', background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '10px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <span style={{ fontSize: '11px', fontWeight: 800, color: '#334155' }}>{p.title}</span>
                            <input type="checkbox" defaultChecked={true} style={{ width: '14px', height: '14px', cursor: 'pointer' }} />
                          </div>
                          <span style={{ fontSize: '10px', color: '#64748B', lineHeight: '1.3' }}>{p.desc}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Admin SMTP invite triggers */}
                  <div style={{ padding: '16px', background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '12px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    <div>
                      <h4 style={{ margin: '0 0 10px 0', fontSize: '13px', fontWeight: 800, color: '#1E293B' }}>Administrator Credentials & SMTP Dispatcher</h4>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
                        <div style={styles.formCol}>
                          <FloatingInput
                            label="Admin Full Name"
                            required
                            isValid={!!wizardHospital.adminName?.trim()}
                            value={wizardHospital.adminName || ''} 
                            onChange={e => updateWizardField('adminName', e.target.value)} 
                          />
                        </div>
                        <div style={styles.formCol}>
                          <FloatingInput
                            label="Admin Work Email"
                            required
                            type="email"
                            error={wizardHospital.adminEmail && !validateEmailFormat(wizardHospital.adminEmail)}
                            isValid={wizardHospital.adminEmail && validateEmailFormat(wizardHospital.adminEmail)}
                            value={wizardHospital.adminEmail || ''} 
                            onChange={e => updateWizardField('adminEmail', e.target.value)} 
                          />
                          {wizardHospital.adminEmail && !validateEmailFormat(wizardHospital.adminEmail) && (
                            <span style={{ fontSize: '10.5px', color: '#EF4444', marginTop: '4px', fontWeight: 600 }}>⚠️ Please enter a valid email address (e.g. admin@hospital.com).</span>
                          )}
                        </div>
                        <div style={styles.formCol}>
                          <FloatingInput
                            label="Admin Telephone (Login ID)"
                            required
                            maxLength={10}
                            isValid={wizardHospital.adminPhone?.length === 10}
                            value={wizardHospital.adminPhone || ''} 
                            onChange={e => updateWizardField('adminPhone', e.target.value.replace(/[^0-9]/g, ''))} 
                          />
                        </div>
                        <div style={styles.formCol}>
                          <FloatingInput
                            label="Security Password"
                            required
                            type={showPasswords['wizardAdmin'] ? 'text' : 'password'} 
                            value={wizardHospital.adminPassword || ''} 
                            onChange={e => updateWizardField('adminPassword', e.target.value)}
                            rightElement={
                              <button
                                type="button"
                                onClick={() => togglePasswordVisibility('wizardAdmin')}
                                style={{
                                  background: 'none',
                                  border: 'none',
                                  cursor: 'pointer',
                                  padding: '4px',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  color: '#64748B'
                                }}
                              >
                                <LucideIcon name={showPasswords['wizardAdmin'] ? 'eye-off' : 'eye'} style={{ width: '15px', height: '15px' }} />
                              </button>
                            }
                          />
                        </div>
                        <div style={styles.formCol}>
                          <FloatingInput
                            label="Confirm Password"
                            required
                            error={wizardHospital.confirmAdminPassword && wizardHospital.adminPassword !== wizardHospital.confirmAdminPassword}
                            isValid={wizardHospital.confirmAdminPassword && wizardHospital.adminPassword === wizardHospital.confirmAdminPassword}
                            type={showPasswords['wizardAdmin'] ? 'text' : 'password'} 
                            value={wizardHospital.confirmAdminPassword || ''} 
                            onChange={e => updateWizardField('confirmAdminPassword', e.target.value)} 
                          />
                          {wizardHospital.confirmAdminPassword && wizardHospital.adminPassword !== wizardHospital.confirmAdminPassword && (
                            <p style={{ margin: '4px 0 0', fontSize: '11px', color: '#EF4444', fontWeight: 600 }}>Passwords do not match</p>
                          )}
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginTop: '12px' }}>
                        <button 
                          type="button"
                          style={styles.btnActionSmall}
                          onClick={() => handleProvisionAdmin(wizardHospital._id)}
                        >
                          {provisioningId === wizardHospital._id ? 'Sending Invite...' : 'Dispatch SMTP Provisioning Invite'}
                        </button>
                        {(provisionedId === wizardHospital._id || wizardHospital.adminStatus === 'Approved') && (
                          <span style={{ fontSize: '11.5px', fontWeight: 750, color: '#059669', display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <LucideIcon name="check-circle" style={{ width: '14px', height: '14px', color: '#059669' }} /> Invitation credentials dispatched!
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {wizardStep === 6 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', width: '100%' }}>
                  
                  {/* Step Header */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 800, color: '#0F172A' }}>Step 6: Review & Validation</h2>
                      <p style={{ margin: '4px 0 0 0', fontSize: '12.5px', color: '#64748B' }}>Review all completed configurations before activating the hospital.</p>
                    </div>
                    <div style={{ display: 'flex', gap: '10px' }}>
                      <button 
                        type="button"
                        onClick={() => {
                          try {
                            const savedFilename = exportHospitalValidationReportPdf({
                              hospital: wizardHospital || {},
                              readinessPercent,
                              compliancePassed,
                              adminApproved,
                              goLiveDate,
                              missingFieldsCount,
                              isModuleEnabled
                            });
                            showToast(`Validation report downloaded (${savedFilename}).`, 'success');
                          } catch (err) {
                            console.error('Validation report export error:', err);
                            showToast('Failed to export report: ' + err.message, 'error');
                          }
                        }}
                        style={{ display: 'flex', alignItems: 'center', gap: '6px', background: '#FFFFFF', border: '1.5px solid #CBD5E1', color: '#334155', borderRadius: '8px', padding: '8px 16px', fontSize: '12.5px', fontWeight: 700, cursor: 'pointer', transition: 'all 0.15s' }}
                      >
                        <LucideIcon name="file-text" style={{ width: '14px', height: '14px', color: '#2563EB' }} />
                        Export Validation Report
                      </button>
                      <button 
                        onClick={() => finalizeOnboarding('Live')}
                        style={{ display: 'flex', alignItems: 'center', gap: '6px', background: '#2563EB', border: 'none', color: '#FFFFFF', borderRadius: '8px', padding: '8px 16px', fontSize: '12.5px', fontWeight: 700, cursor: 'pointer', boxShadow: '0 2px 4px rgba(37, 99, 235, 0.1)' }}
                      >
                        <LucideIcon name="play" style={{ width: '14px', height: '14px' }} />
                        Run Final Validation
                      </button>
                    </div>
                  </div>

                  {/* Metrics Cards Row */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px' }}>
                    
                    {/* Card 1: Readiness Score */}
                    <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '12px', padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '10.5px', fontWeight: 800, color: '#64748B', letterSpacing: '0.05em' }}>READINESS SCORE</span>
                        <LucideIcon name="bar-chart-2" style={{ width: '16px', height: '16px', color: '#2563EB' }} />
                      </div>
                      <span style={{ fontSize: '24px', fontWeight: 800, color: '#0F172A' }}>{readinessPercent}%</span>
                      <div style={{ height: '6px', width: '100%', background: '#F1F5F9', borderRadius: '3px', overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${readinessPercent}%`, background: '#2563EB', borderRadius: '3px' }} />
                      </div>
                    </div>

                    {/* Card 2: Compliance Status */}
                    <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '12px', padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '10.5px', fontWeight: 800, color: '#64748B', letterSpacing: '0.05em' }}>COMPLIANCE STATUS</span>
                        <LucideIcon name="check-circle" style={{ width: '16px', height: '16px', color: compliancePassed ? '#10B981' : '#F59E0B' }} />
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{ fontSize: '22px', fontWeight: 800, color: compliancePassed ? '#10B981' : '#F59E0B' }}>{compliancePassed ? 'Verified' : 'Pending'}</span>
                      </div>
                      <span style={{ fontSize: '11.5px', color: compliancePassed ? '#10B981' : '#D97706', fontWeight: 600 }}>{compliancePassed ? 'All protocols met' : 'Pending documentation'}</span>
                    </div>

                    {/* Card 3: Critical Issues */}
                    <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '12px', padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '10.5px', fontWeight: 800, color: '#64748B', letterSpacing: '0.05em' }}>CRITICAL ISSUES</span>
                        <LucideIcon name="alert-triangle" style={{ width: '16px', height: '16px', color: '#F59E0B' }} />
                      </div>
                      <span style={{ fontSize: '24px', fontWeight: 800, color: '#0F172A' }}>0</span>
                      <span style={{ fontSize: '11.5px', color: missingFieldsCount > 0 ? '#D97706' : '#10B981', fontWeight: 600 }}>
                        {missingFieldsCount > 0 ? `${missingFieldsCount} setup warnings` : '0 warnings'}
                      </span>
                    </div>

                    {/* Card 4: Estimated Go Live */}
                    <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '12px', padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '10.5px', fontWeight: 800, color: '#64748B', letterSpacing: '0.05em' }}>ESTIMATED GO LIVE</span>
                        <LucideIcon name="calendar" style={{ width: '16px', height: '16px', color: '#6366F1' }} />
                      </div>
                      <span style={{ fontSize: '20px', fontWeight: 800, color: '#0F172A' }}>{goLiveDate}</span>
                      <span style={{ fontSize: '11.5px', color: '#6366F1', fontWeight: 600 }}>
                        {wizardHospital.contractStartDate ? 'Scheduled launch' : 'Immediate deployment'}
                      </span>
                    </div>

                  </div>

                  {/* Implementation Summary Accordions */}
                  <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '12px', padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px', boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <strong style={{ fontSize: '14px', color: '#0F172A', fontWeight: 805 }}>Implementation Summary</strong>
                      <button 
                        onClick={() => {
                          if (expandedSteps.length === 5) {
                            setExpandedSteps([]);
                          } else {
                            setExpandedSteps([1, 2, 3, 4, 5]);
                          }
                        }}
                        style={{ background: 'none', border: 'none', color: '#2563EB', fontSize: '12.5px', fontWeight: 700, cursor: 'pointer' }}
                      >
                        {expandedSteps.length === 5 ? 'Collapse All' : 'Expand All'}
                      </button>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      {[
                        { id: 1, title: 'Step 1: Basic Info', desc: 'Hospital identity and branding assets verified.', details: `Hospital Name: ${wizardHospital.name || 'Not Provided'}\nContact Email: ${wizardHospital.contactEmail || 'Not Provided'}` },
                        { id: 2, title: 'Step 2: Org Setup', desc: 'Department hierarchy and facility mapping complete.', details: `Timezone: ${wizardHospital.timezone || 'Not Provided'}\nCurrency: ${wizardHospital.currency || 'Not Provided'}\nDate Format: ${wizardHospital.dateFormat || 'Not Provided'}\nDefault Language: ${wizardHospital.language || 'Not Provided'}` },
                        { id: 3, title: 'Step 3: Legal & Compliance', desc: 'Regulatory documents and HIPAA protocols signed.', details: `PAN Number: ${wizardHospital.panNumber || 'Not Provided'}\nGSTIN: ${wizardHospital.gstin || 'Not Provided'}\nCorporate ID (CIN): ${wizardHospital.corpId || 'Not Provided'}\nAuthorized Signatory: ${wizardHospital.signatoryName || 'Not Provided'}\nDrug License: ${wizardHospital.drugLicense || 'Not Provided'}` },
                        { id: 4, title: 'Step 4: Subscription & Licensing', desc: 'Entitlements, clinical operating mode & active modules.', details: `Subscription Tier: ${(wizardHospital.subscriptionPlan || 'Not Provided').toUpperCase()}\nBilling Cycle: ${(wizardHospital.billingCycle || 'Not Provided').toUpperCase()}\nContract Duration: ${wizardHospital.contractDurationYears || 0} Year(s)\nDoctor Clinical Mode: ${wizardHospital.doctorClinicalMode || 'ONLINE'}\nModules: Reception (${isModuleEnabled('reception') ? 'ON' : 'OFF'}), Doctor (${isModuleEnabled('doctor') ? 'ON' : 'OFF'}), Pharmacy (${isModuleEnabled('pharmacy') ? 'ON' : 'OFF'}), Laboratory (${isModuleEnabled('laboratory') ? 'ON' : 'OFF'})` },
                        { id: 5, title: 'Step 5: User & Role Provisioning', desc: 'RBAC matrices applied to 120 staff members.', details: `Sandbox Database Link: ${wizardHospital.sandboxDbUrl || 'Pending'}\nAdmin Username: ${wizardHospital.adminEmail || 'Not Provided'}\nProvisioned Users: Configured` }
                      ].map(step => {
                        const isOpen = expandedSteps.includes(step.id);
                        return (
                          <div key={step.id} style={{ border: '1px solid #E2E8F0', borderRadius: '8px', overflow: 'hidden' }}>
                            <div 
                              onClick={() => {
                                if (isOpen) {
                                  setExpandedSteps(prev => prev.filter(x => x !== step.id));
                                } else {
                                  setExpandedSteps(prev => [...prev, step.id]);
                                }
                              }}
                              style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', background: '#F8FAFC', cursor: 'pointer' }}
                            >
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <LucideIcon name="check-circle" style={{ width: '16px', height: '16px', color: '#10B981' }} />
                                <strong style={{ fontSize: '13px', color: '#1E293B', fontWeight: 700 }}>{step.title}</strong>
                                <span style={{ fontSize: '12px', color: '#64748B', marginLeft: '8px' }}>{step.desc}</span>
                              </div>
                              <LucideIcon name={isOpen ? "chevron-up" : "chevron-down"} style={{ width: '16px', height: '16px', color: '#64748B' }} />
                            </div>
                            {isOpen && (
                              <div style={{ padding: '16px', fontSize: '12px', color: '#475569', background: '#FFFFFF', borderTop: '1px solid #E2E8F0', whiteSpace: 'pre-line', lineHeight: '1.6', fontFamily: 'monospace' }}>
                                {step.details}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>

                  </div>

                  {/* Validation Results */}
                  <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '12px', padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px', boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }}>
                    <strong style={{ fontSize: '14px', color: '#0F172A', fontWeight: 805 }}>Validation Results</strong>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px' }}>
                      {[
                        { title: 'Security', score: '100%', time: 'JUST NOW', passed: 42, failed: 0, color: '#10B981', bg: '#F0FDF4' },
                        { title: 'Compliance', score: compliancePassed ? '100%' : '60%', time: '5M AGO', passed: compliancePassed ? 5 : 3, failed: compliancePassed ? 0 : 2, color: compliancePassed ? '#10B981' : '#F59E0B', bg: compliancePassed ? '#F0FDF4' : '#FFFBEB' },
                        { title: 'Provisioning', score: adminApproved ? '100%' : '50%', time: 'JUST NOW', passed: adminApproved ? 4 : 2, failed: adminApproved ? 0 : 2, color: adminApproved ? '#10B981' : '#F59E0B', bg: adminApproved ? '#F0FDF4' : '#FFFBEB' },
                        { title: 'Licensing', score: wizardHospital.subscriptionPlan ? '100%' : '0%', time: '10M AGO', passed: wizardHospital.subscriptionPlan ? 3 : 0, failed: wizardHospital.subscriptionPlan ? 0 : 3, color: wizardHospital.subscriptionPlan ? '#10B981' : '#EF4444', bg: wizardHospital.subscriptionPlan ? '#F0FDF4' : '#FEF2F2' }
                      ].map(res => (
                        <div key={res.title} style={{ border: `1px solid #E2E8F0`, borderRadius: '10px', padding: '12px', background: '#FFFFFF', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontSize: '12px', fontWeight: 800, color: '#1E293B' }}>{res.title}</span>
                            <span style={{ fontSize: '11px', fontWeight: 800, color: res.color, background: res.bg, padding: '2px 6px', borderRadius: '4px' }}>{res.score}</span>
                          </div>
                          <span style={{ fontSize: '9px', fontWeight: 700, color: '#94A3B8' }}>LAST VALIDATED: {res.time}</span>
                          <span style={{ fontSize: '11px', fontWeight: 600, color: '#475569', marginTop: '4px' }}>Passed: {res.passed} | Failed: {res.failed}</span>
                          <a href="#" onClick={e => { e.preventDefault(); showToast(`Showing details for ${res.title}...`, 'info'); }} style={{ fontSize: '11px', fontWeight: 700, color: '#2563EB', textDecoration: 'none', marginTop: '6px', display: 'inline-block' }}>View Details</a>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Outstanding Issues */}
                  <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '12px', padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px', boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <strong style={{ fontSize: '14px', color: '#0F172A', fontWeight: 805 }}>Outstanding Issues</strong>
                      {(() => {
                        const issues = [];
                        if (!wizardHospital.name) issues.push({ severity: 'HIGH', label: 'Hospital Name Missing', module: 'Identity', desc: 'Specify name in Step 1', owner: wizardHospital.exec || 'Alex Rivera', eta: 'Immediate', step: 1 });
                        if (!wizardHospital.contactEmail) issues.push({ severity: 'MEDIUM', label: 'Contact Email Missing', module: 'Identity', desc: 'Provide contact details in Step 1', owner: wizardHospital.exec || 'Alex Rivera', eta: 'Today', step: 1 });
                        if (!wizardHospital.panNumber) issues.push({ severity: 'HIGH', label: 'PAN Document Missing', module: 'Compliance', desc: 'Upload PAN in Step 3', owner: wizardHospital.signatoryName || 'Client Lead', eta: '1 Day', step: 3 });
                        if (!wizardHospital.gstin) issues.push({ severity: 'HIGH', label: 'GSTIN Registration Missing', module: 'Compliance', desc: 'Provide GSTIN in Step 3', owner: wizardHospital.signatoryName || 'Client Lead', eta: '1 Day', step: 3 });
                        if (!wizardHospital.drugLicense) issues.push({ severity: 'HIGH', label: 'Drug License Number Missing', module: 'Compliance', desc: 'Insert drug license in Step 3', owner: wizardHospital.signatoryName || 'Client Lead', eta: '2 Days', step: 3 });
                        if (!wizardHospital.adminName || !wizardHospital.adminEmail) issues.push({ severity: 'HIGH', label: 'Administrator Account Unprovisioned', module: 'Users', desc: 'Create admin user in Step 5', owner: wizardHospital.exec || 'Alex Rivera', eta: 'Immediate', step: 5 });

                        if (issues.length === 0) {
                          return (
                            <span style={{ fontSize: '11px', fontWeight: 700, color: '#10B981', background: '#ECFDF5', border: '1px solid #A7F3D0', padding: '2px 8px', borderRadius: '12px' }}>
                              All Checks Passed! Zero Issues Detected
                            </span>
                          );
                        }
                        return (
                          <span style={{ fontSize: '11px', fontWeight: 700, color: '#D97706', background: '#FFFBEB', border: '1px solid #FCD34D', padding: '2px 8px', borderRadius: '12px' }}>
                            {issues.length} Setup {issues.length === 1 ? 'Issue' : 'Issues'} Detected
                          </span>
                        );
                      })()}
                    </div>

                    {(() => {
                      const issues = [];
                      if (!wizardHospital.name) issues.push({ severity: 'HIGH', label: 'Hospital Name Missing', module: 'Identity', desc: 'Specify name in Step 1', owner: wizardHospital.exec || 'Alex Rivera', eta: 'Immediate', step: 1 });
                      if (!wizardHospital.contactEmail) issues.push({ severity: 'MEDIUM', label: 'Contact Email Missing', module: 'Identity', desc: 'Provide contact details in Step 1', owner: wizardHospital.exec || 'Alex Rivera', eta: 'Today', step: 1 });
                      if (!wizardHospital.panNumber) issues.push({ severity: 'HIGH', label: 'PAN Document Missing', module: 'Compliance', desc: 'Upload PAN in Step 3', owner: wizardHospital.signatoryName || 'Client Lead', eta: '1 Day', step: 3 });
                      if (!wizardHospital.gstin) issues.push({ severity: 'HIGH', label: 'GSTIN Registration Missing', module: 'Compliance', desc: 'Provide GSTIN in Step 3', owner: wizardHospital.signatoryName || 'Client Lead', eta: '1 Day', step: 3 });
                      if (!wizardHospital.drugLicense) issues.push({ severity: 'HIGH', label: 'Drug License Number Missing', module: 'Compliance', desc: 'Insert drug license in Step 3', owner: wizardHospital.signatoryName || 'Client Lead', eta: '2 Days', step: 3 });
                      if (!wizardHospital.adminName || !wizardHospital.adminEmail) issues.push({ severity: 'HIGH', label: 'Administrator Account Unprovisioned', module: 'Users', desc: 'Create admin user in Step 5', owner: wizardHospital.exec || 'Alex Rivera', eta: 'Immediate', step: 5 });

                      if (issues.length === 0) {
                        return (
                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '24px', textAlign: 'center', background: '#F8FAFC', borderRadius: '8px', border: '1px dashed #E2E8F0' }}>
                            <LucideIcon name="check-circle" style={{ width: '28px', height: '28px', color: '#10B981', marginBottom: '8px' }} />
                            <span style={{ fontSize: '13px', fontWeight: 700, color: '#334155' }}>Ready for Deployment</span>
                            <span style={{ fontSize: '11px', color: '#64748B', marginTop: '2px' }}>All checklist items and compliance parameters are fully satisfied.</span>
                          </div>
                        );
                      }

                      return (
                        <div style={{ overflowX: 'auto', width: '100%' }}>
                          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '12.5px', minWidth: '800px' }}>
                            <thead>
                              <tr style={{ borderBottom: '1px solid #E2E8F0', color: '#64748B', fontWeight: 600 }}>
                                <th style={{ padding: '8px 12px 12px 12px' }}>SEVERITY</th>
                                <th style={{ padding: '8px 12px 12px 12px' }}>ISSUE</th>
                                <th style={{ padding: '8px 12px 12px 12px' }}>MODULE</th>
                                <th style={{ padding: '8px 12px 12px 12px' }}>SUGGESTED RESOLUTION</th>
                                <th style={{ padding: '8px 12px 12px 12px' }}>ASSIGNED TO</th>
                                <th style={{ padding: '8px 12px 12px 12px' }}>ETA</th>
                                <th style={{ padding: '8px 12px 12px 12px', textAlign: 'right' }}>ACTION</th>
                              </tr>
                            </thead>
                            <tbody>
                              {issues.map((iss, index) => (
                                <tr key={index} style={{ borderBottom: index === issues.length - 1 ? 'none' : '1px solid #F1F5F9', color: '#334155' }}>
                                  <td style={{ padding: '12px' }}>
                                    <span style={{ 
                                      fontSize: '9px', 
                                      fontWeight: 800, 
                                      background: iss.severity === 'HIGH' ? '#FEF2F2' : '#FFFBEB', 
                                      color: iss.severity === 'HIGH' ? '#EF4444' : '#D97706', 
                                      border: `1px solid ${iss.severity === 'HIGH' ? '#FCA5A5' : '#FCD34D'}`, 
                                      padding: '2px 6px', 
                                      borderRadius: '4px' 
                                    }}>{iss.severity}</span>
                                  </td>
                                  <td style={{ padding: '12px', fontWeight: 700 }}>{iss.label}</td>
                                  <td style={{ padding: '12px', color: '#64748B' }}>{iss.module}</td>
                                  <td style={{ padding: '12px', color: '#64748B' }}>{iss.desc}</td>
                                  <td style={{ padding: '12px' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                      <div style={{ width: '20px', height: '20px', borderRadius: '50%', background: '#EFF6FF', color: '#2563EB', fontSize: '9px', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                        {iss.owner.split(' ').map(n => n[0]).join('').toUpperCase()}
                                      </div>
                                      <span>{iss.owner}</span>
                                    </div>
                                  </td>
                                  <td style={{ padding: '12px', color: '#64748B', fontWeight: 500 }}>{iss.eta}</td>
                                  <td style={{ padding: '12px', textAlign: 'right' }}>
                                    <a 
                                      href="#" 
                                      onClick={e => { 
                                        e.preventDefault(); 
                                        if (iss.step) {
                                          setWizardStep(iss.step);
                                          saveWizardDraft(false, iss.step);
                                          showToast(`Navigated to Step ${iss.step} to resolve: ${iss.label}`, 'info');
                                        } else {
                                          showToast('Redirecting to fix issue...', 'info'); 
                                        }
                                      }} 
                                      style={{ color: '#2563EB', fontWeight: 700, textDecoration: 'none' }}
                                    >
                                      Resolve
                                    </a>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      );
                    })()}
                  </div>

                  {/* Formal Approvals */}
                  <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '12px', padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px', boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <strong style={{ fontSize: '14px', color: '#0F172A', fontWeight: 805 }}>Formal Approvals</strong>
                      <span style={{ fontSize: '11px', fontWeight: 805, color: '#059669', background: '#D1FAE5', padding: '2px 8px', borderRadius: '12px' }}>GO-LIVE STATUS: PENDING FINAL SIGN-OFF</span>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px' }}>
                      {[
                        { title: 'IMPLEMENTATION MANAGER', name: wizardHospital.exec || 'Pending Designation', date: wizardHospital.exec ? new Date().toLocaleDateString() : '', status: wizardHospital.exec ? 'APPROVED' : 'PENDING', statusBg: wizardHospital.exec ? '#D1FAE5' : '#F1F5F9', statusColor: wizardHospital.exec ? '#059669' : '#64748B' },
                        { title: 'HOSPITAL ADMINISTRATOR', name: wizardHospital.adminName || 'Pending Designation', date: wizardHospital.adminName ? new Date().toLocaleDateString() : '', status: wizardHospital.adminName ? 'APPROVED' : 'PENDING', statusBg: wizardHospital.adminName ? '#D1FAE5' : '#F1F5F9', statusColor: wizardHospital.adminName ? '#059669' : '#64748B' },
                        { title: 'AUTHORIZED SIGNATORY', name: wizardHospital.signatoryName || 'Pending Designation', date: wizardHospital.signatoryName ? new Date().toLocaleDateString() : '', status: wizardHospital.signatoryName ? 'APPROVED' : 'PENDING', statusBg: wizardHospital.signatoryName ? '#D1FAE5' : '#F1F5F9', statusColor: wizardHospital.signatoryName ? '#059669' : '#64748B' }
                      ].map((app, index) => (
                        <div key={index} style={{ border: '1px solid #E2E8F0', borderRadius: '10px', padding: '16px', background: '#F8FAFC', display: 'flex', flexDirection: 'column', gap: '8px', minWidth: '220px' }}>
                          <span style={{ fontSize: '9px', fontWeight: 800, color: '#94A3B8', letterSpacing: '0.05em' }}>{app.title}</span>
                          <span style={{ fontSize: '13px', fontWeight: 700, color: app.date ? '#334155' : '#94A3B8', fontStyle: app.date ? 'normal' : 'italic' }}>{app.name}</span>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 'auto', paddingTop: '8px' }}>
                            <span style={{ fontSize: '10px', color: '#64748B', fontWeight: 500 }}>{app.date || '--'}</span>
                            <span style={{ fontSize: '10px', fontWeight: 800, background: app.statusBg, color: app.statusColor, padding: '2px 6px', borderRadius: '4px' }}>{app.status}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                </div>
              )}

              {wizardStep === 7 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', textAlign: 'center', padding: '20px 0' }}>
                  <div style={{ margin: '0 auto', width: '64px', height: '64px', borderRadius: '50%', background: '#ECFDF5', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <LucideIcon name="rocket" style={{ width: '32px', height: '32px', color: '#10B981' }} />
                  </div>
                  <div>
                    <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 800, color: '#0F172A' }}>Ready for Launch!</h3>
                    <p style={{ fontSize: '12.5px', color: '#64748B', maxWidth: '460px', margin: '6px auto' }}>
                      All data validation completed. Clicking below will provision the production database instance, generate the activation invoice, and email login keys.
                    </p>
                  </div>

                  <div style={{ margin: '10px 0' }}>
                    {/* The action button was moved to the fixed footer for consistency */}
                  </div>
                </div>
              )}

            </div>

            {/* Right Side: Deployment Readiness (Step 6) OR Live Tenant Mockup Preview */}
            {wizardStep === 6 ? (
              <aside style={{ width: '320px', background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '18px', padding: '20px', display: 'flex', flexDirection: 'column', gap: '20px', flexShrink: 0, boxShadow: '0 4px 15px rgba(15, 23, 42, 0.02)' }}>
                
                {/* Circular gauge */}
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: '8px', position: 'relative' }}>
                  <span style={{ fontSize: '10px', fontWeight: 800, color: '#94A3B8', letterSpacing: '0.05em' }}>DEPLOYMENT READINESS</span>
                  
                  {/* SVG circular progress */}
                  <div style={{ position: 'relative', width: '120px', height: '120px', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '10px 0' }}>
                    <svg width="120" height="120" viewBox="0 0 120 120" style={{ transform: 'rotate(-90deg)' }}>
                      <circle cx="60" cy="60" r="50" fill="transparent" stroke="#F1F5F9" strokeWidth="10" />
                      <circle cx="60" cy="60" r="50" fill="transparent" stroke="#2563EB" strokeWidth="10" strokeDasharray="314" strokeDashoffset={314 - (314 * (readinessPercent / 100))} strokeLinecap="round" />
                    </svg>
                    <div style={{ position: 'absolute', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                      <span style={{ fontSize: '24px', fontWeight: 800, color: '#0F172A' }}>{readinessPercent}%</span>
                      <span style={{ fontSize: '9px', fontWeight: 700, color: '#64748B' }}>Overall</span>
                    </div>
                  </div>
                </div>

                {/* Deployment Details */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', background: '#F8FAFC', borderRadius: '12px', padding: '12px', fontSize: '11.5px', border: '1px solid #E2E8F0' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#64748B', fontWeight: 600 }}>DEPLOYMENT OWNER</span>
                    <strong style={{ color: '#334155' }}>{wizardHospital.exec || 'Alex Rivera'}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#64748B', fontWeight: 600 }}>CLINICAL LEAD</span>
                    <strong style={{ color: '#334155' }}>{wizardHospital.signatoryName || 'Elena Vance'}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#64748B', fontWeight: 600 }}>GO-LIVE DATE</span>
                    <strong style={{ color: '#334155' }}>{goLiveDate}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#64748B', fontWeight: 600 }}>LAST SYNC</span>
                    <strong style={{ color: '#334155' }}>Just now</strong>
                  </div>
                </div>

                {/* Progress meters */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {[
                    { name: 'Infrastructure', val: '100%' },
                    { name: 'Security', val: '100%' },
                    { name: 'Migration', val: '100%' },
                    { name: 'Compliance', val: compliancePassed ? '100%' : '60%' },
                    { name: 'Provisioning', val: adminApproved ? '100%' : '50%' }
                  ].map(item => (
                    <div key={item.name} style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', fontWeight: 700, color: '#475569' }}>
                        <span>{item.name}</span>
                        <span>{item.val}</span>
                      </div>
                      <div style={{ height: '5px', width: '100%', background: '#F1F5F9', borderRadius: '3px', overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: item.val, background: '#2563EB', borderRadius: '3px' }} />
                      </div>
                    </div>
                  ))}
                </div>

                <div style={{ height: '1px', background: '#E2E8F0' }} />

                {/* Go Live Checklist */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <span style={{ fontSize: '10px', fontWeight: 800, color: '#94A3B8', letterSpacing: '0.05em' }}>GO LIVE CHECKLIST</span>
                  {[
                    { label: 'Enterprise Licenses Validated', checked: true },
                    { label: 'Database Health Check Cleared', checked: true },
                    { label: 'Data Encryption At Rest Enabled', checked: true },
                    { label: 'Client Administrative Approval', checked: adminApproved },
                    { label: 'Final Penetration Test Scan', checked: compliancePassed }
                  ].map((item, idx) => (
                    <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '11.5px', color: '#334155', fontWeight: 500 }}>
                      <LucideIcon 
                        name={item.checked ? "check-circle" : "circle"} 
                        style={{ width: '15px', height: '15px', color: item.checked ? '#10B981' : '#94A3B8' }} 
                      />
                      <span>{item.label}</span>
                    </div>
                  ))}
                </div>

                <div style={{ height: '1px', background: '#E2E8F0', marginTop: 'auto' }} />

                {/* Next Action */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <span style={{ fontSize: '10px', fontWeight: 800, color: '#94A3B8' }}>NEXT ACTION</span>
                  <a href="#" onClick={e => { e.preventDefault(); finalizeOnboarding('Live'); }} style={{ fontSize: '12.5px', fontWeight: 700, color: '#2563EB', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    Initiate Go Live Protocol
                    <LucideIcon name="arrow-right" style={{ width: '13px', height: '13px' }} />
                  </a>
                </div>

              </aside>
            ) : (
              <aside style={{ 
                width: '320px', 
                background: 'linear-gradient(180deg, #FFFFFF 0%, #F8FAFC 100%)', 
                border: '1px solid #DBEAFE', 
                borderRadius: '20px', 
                padding: '20px', 
                display: 'flex', 
                flexDirection: 'column', 
                gap: '16px', 
                flexShrink: 0, 
                boxShadow: '0 20px 45px -10px rgba(37, 99, 235, 0.08), 0 1px 3px rgba(0,0,0,0.02)' 
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#2563EB', boxShadow: '0 0 8px rgba(37, 99, 235, 0.5)' }}></div>
                  <div style={{ fontSize: '11px', fontWeight: 800, color: '#1E40AF', textTransform: 'uppercase', letterSpacing: '0.7px' }}>
                    Live Tenant Mockup Preview
                  </div>
                </div>

                {/* Tenant Card */}
                <div style={{ 
                  background: 'linear-gradient(135deg, #FFFFFF 0%, #EFF6FF 100%)', 
                  border: '1.5px solid #BFDBFE', 
                  borderRadius: '16px', 
                  padding: '18px', 
                  display: 'flex', 
                  flexDirection: 'column', 
                  gap: '14px',
                  boxShadow: '0 4px 15px rgba(37, 99, 235, 0.06)'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div style={{ 
                      width: '44px', 
                      height: '44px', 
                      borderRadius: '12px', 
                      background: wizardHospital.logo ? '#FFFFFF' : 'linear-gradient(135deg, #2563EB 0%, #4F46E5 100%)', 
                      color: '#FFFFFF', 
                      display: 'flex', 
                      alignItems: 'center', 
                      justifyContent: 'center', 
                      fontWeight: 900, 
                      fontSize: '15px', 
                      boxShadow: '0 4px 14px rgba(37, 99, 235, 0.4)',
                      overflow: 'hidden',
                      border: wizardHospital.logo ? '1.5px solid #BFDBFE' : 'none',
                    }}>
                      {wizardHospital.logo ? (
                        <img src={wizardHospital.logo} alt="Logo" style={{ width: '100%', height: '100%', objectFit: 'contain', padding: '4px' }} />
                      ) : (
                        wizardHospital.name ? wizardHospital.name.slice(0, 2).toUpperCase() : 'NT'
                      )}
                    </div>
                    <div>
                      <div style={{ fontSize: '14px', fontWeight: 850, color: wizardHospital.name ? '#0F172A' : '#64748B' }}>
                        {wizardHospital.name || 'Hospital Name Unspecified'}
                      </div>
                      <div style={{ 
                        fontSize: '10px', 
                        fontWeight: 800, 
                        color: wizardHospital.subscriptionPlan ? '#2563EB' : '#94A3B8', 
                        textTransform: 'uppercase', 
                        letterSpacing: '0.5px',
                        marginTop: '2px'
                      }}>
                        {wizardHospital.subscriptionPlan ? `✨ ${wizardHospital.subscriptionPlan} Plan` : 'Plan Not Selected'}
                      </div>
                    </div>
                  </div>

                  <div style={{ height: '1px', background: 'linear-gradient(90deg, transparent, #BFDBFE, transparent)' }} />

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '9px', fontSize: '12px' }}>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ color: '#475569', display: 'flex', alignItems: 'center', gap: '7px', fontWeight: 600 }}>
                        <div style={{ width: '22px', height: '22px', borderRadius: '6px', background: '#EFF6FF', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <LucideIcon name="stethoscope" style={{ width: '13px', height: '13px', color: '#2563EB' }} />
                        </div>
                        Doctors Limit
                      </span>
                      <span style={{ fontWeight: 750, color: wizardHospital.doctorsCount || activePlan?.docs ? '#0F172A' : '#94A3B8' }}>
                        {wizardHospital.doctorsCount ? `${wizardHospital.doctorsCount} seats` : activePlan?.docs ? `${activePlan.docs} seats` : 'Not Specified'}
                      </span>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ color: '#475569', display: 'flex', alignItems: 'center', gap: '7px', fontWeight: 600 }}>
                        <div style={{ width: '22px', height: '22px', borderRadius: '6px', background: '#F5F3FF', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <LucideIcon name="users" style={{ width: '13px', height: '13px', color: '#7C3AED' }} />
                        </div>
                        Staff Limit
                      </span>
                      <span style={{ fontWeight: 750, color: activePlan?.staff ? '#0F172A' : '#94A3B8' }}>
                        {activePlan?.staff ? `${activePlan.staff} seats` : 'Not Specified'}
                      </span>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ color: '#475569', display: 'flex', alignItems: 'center', gap: '7px', fontWeight: 600 }}>
                        <div style={{ width: '22px', height: '22px', borderRadius: '6px', background: '#ECFDF5', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <LucideIcon name="database" style={{ width: '13px', height: '13px', color: '#059669' }} />
                        </div>
                        Storage Limit
                      </span>
                      <span style={{ fontWeight: 750, color: activePlan?.storage ? '#0F172A' : '#94A3B8' }}>
                        {activePlan?.storage ? `${activePlan.storage}` : 'Not Specified'}
                      </span>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ color: '#475569', display: 'flex', alignItems: 'center', gap: '7px', fontWeight: 600 }}>
                        <div style={{ width: '22px', height: '22px', borderRadius: '6px', background: '#FEF3C7', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <LucideIcon name="map-pin" style={{ width: '13px', height: '13px', color: '#D97706' }} />
                        </div>
                        Region
                      </span>
                      <span style={{ fontWeight: 750, color: (wizardHospital.city || wizardHospital.country) ? '#0F172A' : '#94A3B8' }}>
                        {(wizardHospital.city || wizardHospital.country) ? `${wizardHospital.city || ''}${wizardHospital.city && wizardHospital.country ? ', ' : ''}${wizardHospital.country || ''}` : 'Not Specified'}
                      </span>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ color: '#475569', display: 'flex', alignItems: 'center', gap: '7px', fontWeight: 600 }}>
                        <div style={{ width: '22px', height: '22px', borderRadius: '6px', background: '#EFF6FF', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <LucideIcon name="clock" style={{ width: '13px', height: '13px', color: '#2563EB' }} />
                        </div>
                        Currency/Time
                      </span>
                      <span style={{ fontWeight: 750, color: (wizardHospital.currency || wizardHospital.timezone) ? '#0F172A' : '#94A3B8' }}>
                        {(wizardHospital.currency || wizardHospital.timezone) ? `${wizardHospital.currency || ''} (${wizardHospital.timezone || ''})` : 'Not Specified'}
                      </span>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ color: '#475569', display: 'flex', alignItems: 'center', gap: '7px', fontWeight: 600 }}>
                        <div style={{ width: '22px', height: '22px', borderRadius: '6px', background: '#FFF7ED', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <LucideIcon name="activity" style={{ width: '13px', height: '13px', color: '#EA580C' }} />
                        </div>
                        Doctor Mode
                      </span>
                      <span style={{
                        fontWeight: 800,
                        fontSize: '10.5px',
                        padding: '2px 8px',
                        borderRadius: '6px',
                        background: (wizardHospital.doctorClinicalMode || 'ONLINE') === 'ONLINE' ? 'linear-gradient(135deg, #EFF6FF 0%, #DBEAFE 100%)' : 'linear-gradient(135deg, #FFF7ED 0%, #FED7AA 100%)',
                        color: (wizardHospital.doctorClinicalMode || 'ONLINE') === 'ONLINE' ? '#1E40AF' : '#C2410C',
                        border: `1px solid ${(wizardHospital.doctorClinicalMode || 'ONLINE') === 'ONLINE' ? '#BFDBFE' : '#FDBA74'}`,
                        boxShadow: '0 2px 6px rgba(0,0,0,0.03)'
                      }}>
                        ● {wizardHospital.doctorClinicalMode || 'ONLINE'}
                      </span>
                    </div>
                  </div>

                  <div style={{ height: '1px', background: 'linear-gradient(90deg, transparent, #BFDBFE, transparent)' }} />

                  <div>
                    <span style={{ fontSize: '10px', fontWeight: 800, color: '#1E40AF', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginBottom: '8px' }}>
                      PROVISIONED ERP GATES
                    </span>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px' }}>
                      {['reception', 'doctor', 'pharmacy', 'laboratory', 'emergency', 'billing', 'accounts', 'payroll'].map(mod => {
                        const enabled = isModuleEnabled(mod);
                        return (
                          <span 
                            key={mod} 
                            style={{
                              fontSize: '10px',
                              fontWeight: 750,
                              padding: '3px 8px',
                              borderRadius: '6px',
                              background: enabled 
                                ? 'linear-gradient(135deg, #ECFDF5 0%, #D1FAE5 100%)' 
                                : '#FFFFFF',
                              color: enabled ? '#065F46' : '#94A3B8',
                              border: `1px solid ${enabled ? '#A7F3D0' : '#E2E8F0'}`,
                              textTransform: 'capitalize',
                              boxShadow: enabled ? '0 1px 4px rgba(16, 185, 129, 0.15)' : 'none'
                            }}
                          >
                            {enabled ? '✓ ' : ''}{mod}
                          </span>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </aside>
            )}
          </div>
        </div>

        {/* Sticky Bottom Action Bar */}
        <footer style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          height: '60px',
          background: '#FFFFFF',
          borderTop: '1px solid #E2E8F0',
          padding: '0 28px',
          flexShrink: 0
        }}>
          {/* Draft Autosave Indicator on left */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: '#64748B', fontWeight: 600 }}>
            <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: '#10B981', boxShadow: '0 0 6px rgba(16, 185, 129, 0.4)' }} />
            <span>Draft saved automatically</span>
          </div>

          {/* Navigation buttons on right */}
          <div style={{ display: 'flex', gap: '10px' }}>
            <button 
              type="button"
              onClick={handleCancelWizard}
              style={{ 
                background: '#FFFFFF', 
                border: '1px solid #E2E8F0', 
                color: '#475569', 
                borderRadius: '8px', 
                padding: '8px 16px', 
                fontSize: '12.5px', 
                fontWeight: 700, 
                cursor: 'pointer'
              }}
            >
              Cancel
            </button>
            <button 
              type="button"
              onClick={() => saveWizardDraft(false)}
              style={{ 
                background: '#FFFFFF', 
                border: '1px solid #CBD5E1', 
                color: '#1E293B', 
                borderRadius: '8px', 
                padding: '8px 16px', 
                fontSize: '12.5px', 
                fontWeight: 700, 
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              <LucideIcon name="bookmark" style={{ width: '13px', height: '13px', color: '#64748B' }} />
              Save as Draft
            </button>
            {wizardStep > 1 && (
              <button 
                type="button"
                onClick={handlePrevStep}
                style={{ 
                  background: '#FFFFFF', 
                  border: '1px solid #CBD5E1', 
                  color: '#334155', 
                  borderRadius: '8px', 
                  padding: '8px 16px', 
                  fontSize: '12.5px', 
                  fontWeight: 700, 
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                <LucideIcon name="arrow-left" style={{ width: '13px', height: '13px' }} />
                Previous
              </button>
            )}
            {wizardStep < totalSteps ? (
              <button 
                type="button"
                onClick={handleNextStep}
                style={{ 
                  background: isCurrentStepValid ? 'linear-gradient(135deg, #2563EB 0%, #1D4ED8 100%)' : '#94A3B8', 
                  border: 'none', 
                  color: '#FFFFFF', 
                  borderRadius: '8px', 
                  padding: '8px 20px', 
                  fontSize: '12.5px', 
                  fontWeight: 750, 
                  cursor: isCurrentStepValid ? 'pointer' : 'not-allowed',
                  opacity: isCurrentStepValid ? 1 : 0.7,
                  boxShadow: isCurrentStepValid ? '0 4px 12px rgba(37, 99, 235, 0.25)' : 'none',
                  transition: 'all 0.2s',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                <span>{wizardStep === 6 ? 'Continue to Go Live' : `Next: ${steps[wizardStep]?.label || 'Next Step'}`}</span>
                <LucideIcon name="arrow-right" style={{ width: '14px', height: '14px' }} />
              </button>
            ) : (
              <button 
                type="button"
                onClick={handleGoLive}
                disabled={isActivating}
                style={{ 
                  background: isActivating ? '#94A3B8' : 'linear-gradient(135deg, #10B981 0%, #059669 100%)', 
                  border: 'none', 
                  color: '#FFFFFF', 
                  borderRadius: '8px', 
                  padding: '8px 24px', 
                  fontSize: '13px', 
                  fontWeight: 800, 
                  cursor: isActivating ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  boxShadow: isActivating ? 'none' : '0 4px 12px rgba(16, 185, 129, 0.3)',
                  opacity: isActivating ? 0.7 : 1,
                  transition: 'all 0.2s'
                }}
              >
                {isActivating ? 'Onboarding Hospital...' : 'Complete Onboarding & Go Live'}
                {!isActivating && <LucideIcon name="rocket" style={{ width: '15px', height: '15px' }} />}
              </button>
            )}
          </div>
        </footer>

        <div style={{ ...styles.drawerOverlay, background: isAddUserDrawerOpen ? 'rgba(15, 23, 42, 0.3)' : 'rgba(15, 23, 42, 0)', backdropFilter: isAddUserDrawerOpen ? 'blur(4px)' : 'blur(0)', pointerEvents: isAddUserDrawerOpen ? 'auto' : 'none', transition: 'background 0.3s ease, backdrop-filter 0.3s ease' }} onClick={() => setIsAddUserDrawerOpen(false)}>
          <div style={{ ...styles.drawerContainer, width: '980px', maxWidth: '95vw', display: 'flex', flexDirection: 'column', height: '100%', background: '#FFFFFF', borderRadius: '0', boxShadow: '-10px 0 30px rgba(0,0,0,0.05)', transform: isAddUserDrawerOpen ? 'translateX(0)' : 'translateX(100%)', transition: 'transform 0.3s cubic-bezier(0.16, 1, 0.3, 1)' }} onClick={e => e.stopPropagation()}>
              
              {/* Drawer Header */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 24px', borderBottom: '1px solid #E2E8F0', flexShrink: 0 }}>
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <h3 style={{ fontSize: '16px', fontWeight: 800, color: '#0F172A', margin: 0 }}>Add New User</h3>
                  <p style={{ fontSize: '11.5px', color: '#64748B', margin: '2px 0 0 0', fontWeight: 500 }}>Create new user account and assign active permissions</p>
                </div>
                <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748B', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '4px', borderRadius: '4px' }} onClick={() => setIsAddUserDrawerOpen(false)}>
                  <LucideIcon name="x" style={{ width: '20px', height: '20px' }} />
                </button>
              </div>

              {/* Main Body Columns */}
              <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
                
                {/* Left Panel: Form Content */}
                <div style={{ flex: 1, overflowY: 'auto', padding: '24px', display: 'flex', flexDirection: 'column', gap: '28px', background: '#FFFFFF' }}>
                  
                  {/* Basic Information */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', borderBottom: '1px solid #F1F5F9', paddingBottom: '8px' }}>
                      <LucideIcon name="user" style={{ width: '16px', height: '16px', color: '#2563EB' }} />
                      <span style={{ fontSize: '11px', fontWeight: 800, color: '#1E293B', letterSpacing: '0.05em' }}>BASIC INFORMATION</span>
                    </div>

                    {/* Avatar Upload */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                      <input 
                        type="file" 
                        ref={drawerAvatarInputRef} 
                        accept="image/*" 
                        style={{ display: 'none' }} 
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) {
                            if (file.size > 5 * 1024 * 1024) {
                              showToast('Image file size must be less than 5MB.', 'error');
                              return;
                            }
                            const reader = new FileReader();
                            reader.onloadend = () => {
                              setDrawerForm(prev => ({ ...prev, avatar: reader.result }));
                              showToast('Avatar image loaded successfully!', 'success');
                            };
                            reader.readAsDataURL(file);
                          }
                        }}
                      />
                      <div style={{ width: '52px', height: '52px', borderRadius: '50%', background: '#EFF6FF', border: '2px solid #BFDBFE', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#2563EB', fontSize: '15px', fontWeight: 700, overflow: 'hidden', flexShrink: 0 }}>
                        {drawerForm.avatar ? (
                          <img src={drawerForm.avatar} alt="Avatar Preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        ) : drawerForm.firstName || drawerForm.lastName ? (
                          `${drawerForm.firstName ? drawerForm.firstName.charAt(0).toUpperCase() : ''}${drawerForm.lastName ? drawerForm.lastName.charAt(0).toUpperCase() : ''}`
                        ) : (
                          <LucideIcon name="user" style={{ width: '22px', height: '22px', color: '#3B82F6' }} />
                        )}
                      </div>
                      <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                        <button 
                          type="button" 
                          onClick={() => drawerAvatarInputRef.current?.click()}
                          style={{ background: 'none', border: 'none', color: '#2563EB', fontSize: '12.5px', fontWeight: 700, cursor: 'pointer', padding: 0 }}
                        >
                          {drawerForm.avatar ? 'Change Image' : 'Upload Image'}
                        </button>
                        {drawerForm.avatar && (
                          <>
                            <span style={{ color: '#E2E8F0' }}>|</span>
                            <button 
                              type="button" 
                              onClick={() => {
                                setDrawerForm(prev => ({ ...prev, avatar: '' }));
                                if (drawerAvatarInputRef.current) drawerAvatarInputRef.current.value = '';
                              }}
                              style={{ background: 'none', border: 'none', color: '#EF4444', fontSize: '12.5px', fontWeight: 600, cursor: 'pointer', padding: 0 }}
                            >
                              Remove
                            </button>
                          </>
                        )}
                      </div>
                    </div>

                    {/* Name Inputs */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        <label style={{ fontSize: '11px', fontWeight: 700, color: '#475569' }}>FIRST NAME</label>
                        <div style={{ position: 'relative' }}>
                          <LucideIcon name="user" style={{ position: 'absolute', left: '12px', top: '13px', width: '14px', height: '14px', color: '#94A3B8' }} />
                          <input 
                            type="text" 
                            style={{ width: '100%', height: '40px', border: '1px solid #E2E8F0', borderRadius: '8px', padding: '0 12px 0 34px', fontSize: '13px', fontWeight: 600, color: '#1E293B', outline: 'none' }}
                            placeholder="e.g. John"
                            value={drawerForm.firstName}
                            onChange={e => setDrawerForm(prev => ({ ...prev, firstName: e.target.value }))}
                          />
                        </div>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        <label style={{ fontSize: '11px', fontWeight: 700, color: '#475569' }}>LAST NAME</label>
                        <input 
                          type="text" 
                          style={{ width: '100%', height: '40px', border: '1px solid #E2E8F0', borderRadius: '8px', padding: '0 12px', fontSize: '13px', fontWeight: 600, color: '#1E293B', outline: 'none' }}
                          placeholder="e.g. Doe"
                          value={drawerForm.lastName}
                          onChange={e => setDrawerForm(prev => ({ ...prev, lastName: e.target.value }))}
                        />
                      </div>
                    </div>

                    {/* Email and Password Inputs */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        <label style={{ fontSize: '11px', fontWeight: 700, color: '#475569' }}>EMAIL ADDRESS</label>
                        <div style={{ position: 'relative' }}>
                          <LucideIcon name="mail" style={{ position: 'absolute', left: '12px', top: '13px', width: '14px', height: '14px', color: '#94A3B8' }} />
                          <input 
                            type="email" 
                            style={{ width: '100%', height: '40px', border: '1px solid #E2E8F0', borderRadius: '8px', padding: '0 12px 0 34px', fontSize: '13px', fontWeight: 600, color: '#1E293B', outline: 'none' }}
                            placeholder="e.g. john.doe@clinic.com"
                            value={drawerForm.email}
                            onChange={e => setDrawerForm(prev => ({ ...prev, email: e.target.value }))}
                          />
                        </div>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        <label style={{ fontSize: '11px', fontWeight: 700, color: '#475569' }}>PASSWORD</label>
                        <div style={{ position: 'relative' }}>
                          <LucideIcon name="lock" style={{ position: 'absolute', left: '12px', top: '13px', width: '14px', height: '14px', color: '#94A3B8' }} />
                          <input 
                            type={showPasswords['addUserDrawer'] ? 'text' : 'password'} 
                            style={{ width: '100%', height: '40px', border: '1px solid #E2E8F0', borderRadius: '8px', padding: '0 40px 0 34px', fontSize: '13px', fontWeight: 600, color: '#1E293B', outline: 'none' }}
                            placeholder="Set temporary password"
                            value={drawerForm.password}
                            onChange={e => setDrawerForm(prev => ({ ...prev, password: e.target.value }))}
                          />
                          <button
                            type="button"
                            onClick={() => togglePasswordVisibility('addUserDrawer')}
                            style={{
                              position: 'absolute',
                              right: '10px',
                              top: '12px',
                              background: 'none',
                              border: 'none',
                              cursor: 'pointer',
                              padding: '4px',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              color: '#64748B'
                            }}
                          >
                            <LucideIcon name={showPasswords['addUserDrawer'] ? 'eye-off' : 'eye'} style={{ width: '15px', height: '15px' }} />
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Phone Inputs */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        <label style={{ fontSize: '11px', fontWeight: 700, color: '#475569' }}>PHONE NUMBER</label>
                        <div style={{ position: 'relative' }}>
                          <LucideIcon name="phone" style={{ position: 'absolute', left: '12px', top: '13px', width: '14px', height: '14px', color: '#94A3B8' }} />
                          <input 
                            type="text" 
                            style={{ width: '100%', height: '40px', border: '1px solid #E2E8F0', borderRadius: '8px', padding: '0 12px 0 34px', fontSize: '13px', fontWeight: 600, color: '#1E293B', outline: 'none' }}
                            placeholder="e.g. +1 (555) 000-0000"
                            value={drawerForm.phone}
                            onChange={e => setDrawerForm(prev => ({ ...prev, phone: e.target.value }))}
                          />
                        </div>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        <label style={{ fontSize: '11px', fontWeight: 700, color: '#475569' }}>SECONDARY PHONE</label>
                        <div style={{ position: 'relative' }}>
                          <LucideIcon name="phone" style={{ position: 'absolute', left: '12px', top: '13px', width: '14px', height: '14px', color: '#94A3B8' }} />
                          <input 
                            type="text" 
                            style={{ width: '100%', height: '40px', border: '1px solid #E2E8F0', borderRadius: '8px', padding: '0 12px 0 34px', fontSize: '13px', fontWeight: 600, color: '#1E293B', outline: 'none' }}
                            placeholder="e.g. +1 (555)"
                            value={drawerForm.secPhone}
                            onChange={e => setDrawerForm(prev => ({ ...prev, secPhone: e.target.value }))}
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Role Assignment */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', borderBottom: '1px solid #F1F5F9', paddingBottom: '8px' }}>
                      <LucideIcon name="key" style={{ width: '16px', height: '16px', color: '#2563EB' }} />
                      <span style={{ fontSize: '11px', fontWeight: 800, color: '#1E293B', letterSpacing: '0.05em' }}>ROLE ASSIGNMENT</span>
                    </div>

                    {/* Roles Grid */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
                      {[
                        { id: 'Administrator', icon: 'shield', desc: 'Full access & administrative controls' },
                        { id: 'Doctor', icon: 'stethoscope', desc: 'Clinical documentation & workflows' },
                        { id: 'Receptionist', icon: 'phone', desc: 'Front-desk booking & appointments' },
                        { id: 'Pharmacist', icon: 'pill', desc: 'Inventory control & dispensing' },
                        { id: 'Laboratory', icon: 'beaker', desc: 'Diagnostic testing & reporting' }
                      ].map(role => {
                        const isSelected = drawerForm.role === role.id;
                        return (
                          <div 
                            key={role.id}
                            onClick={() => setDrawerForm(prev => ({ ...prev, role: role.id }))}
                            style={{ 
                              border: isSelected ? '1px solid #2563EB' : '1px solid #E2E8F0', 
                              borderRadius: '10px', 
                              padding: '14px', 
                              cursor: 'pointer', 
                              position: 'relative', 
                              background: '#FFFFFF',
                              boxShadow: isSelected ? '0 0 0 3px rgba(37, 99, 235, 0.1)' : 'none',
                              transition: 'all 0.2s ease-in-out'
                            }}
                          >
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                              <div style={{ width: '28px', height: '28px', borderRadius: '6px', background: isSelected ? '#EFF6FF' : '#F8FAFC', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <LucideIcon name={role.icon} style={{ width: '14px', height: '14px', color: isSelected ? '#2563EB' : '#64748B' }} />
                              </div>
                              <div style={{ 
                                width: '12px', 
                                height: '12px', 
                                borderRadius: '50%', 
                                border: isSelected ? '3px solid #2563EB' : '1.5px solid #CBD5E1', 
                                background: '#FFFFFF' 
                              }} />
                            </div>
                            <span style={{ fontSize: '12.5px', fontWeight: 800, color: '#1E293B', display: 'block' }}>{role.id}</span>
                            <span style={{ fontSize: '10px', fontWeight: 500, color: '#64748B', marginTop: '2px', display: 'block', lineHeight: '1.2' }}>{role.desc}</span>
                          </div>
                        );
                      })}
                      
                      {/* More Roles Button */}
                      <div style={{ border: '1px dashed #CBD5E1', borderRadius: '10px', padding: '14px', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '4px', background: '#F8FAFC' }}>
                        <LucideIcon name="plus" style={{ width: '14px', height: '14px', color: '#64748B' }} />
                        <span style={{ fontSize: '11px', fontWeight: 700, color: '#64748B' }}>+ More Roles</span>
                      </div>
                    </div>

                    {/* Restricted Departments */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      <select style={{ width: '100%', height: '40px', border: '1px solid #E2E8F0', borderRadius: '8px', padding: '0 12px', fontSize: '13px', fontWeight: 600, color: '#1E293B', outline: 'none', background: '#FFFFFF' }}>
                        <option>Select restricted departments...</option>
                        <option>Pediatrics</option>
                        <option>Cardiology</option>
                      </select>
                    </div>
                  </div>

                  {/* Recommended Module Permissions */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', borderBottom: '1px solid #F1F5F9', paddingBottom: '8px' }}>
                      <LucideIcon name="shield-check" style={{ width: '16px', height: '16px', color: '#2563EB' }} />
                      <span style={{ fontSize: '11px', fontWeight: 800, color: '#1E293B', letterSpacing: '0.05em' }}>RECOMMENDED MODULE PERMISSIONS</span>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
                      {/* Clinical Columns */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                        <span style={{ fontSize: '11px', fontWeight: 800, color: '#94A3B8', letterSpacing: '0.05em' }}>-- CLINICAL</span>
                        
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <div style={{ display: 'flex', flexDirection: 'column' }}>
                            <span style={{ fontSize: '12px', fontWeight: 700, color: '#334155' }}>EHR Access</span>
                            <span style={{ fontSize: '9.5px', color: '#94A3B8', fontWeight: 500 }}>Read & write patient logs</span>
                          </div>
                          <ToggleSwitch checked={drawerForm.ehrAccess} onChange={val => setDrawerForm(prev => ({ ...prev, ehrAccess: val }))} />
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <div style={{ display: 'flex', flexDirection: 'column' }}>
                            <span style={{ fontSize: '12px', fontWeight: 700, color: '#334155' }}>Prescriptions</span>
                            <span style={{ fontSize: '9.5px', color: '#94A3B8', fontWeight: 500 }}>Issue medicine & pharmacy orders</span>
                          </div>
                          <ToggleSwitch checked={drawerForm.prescriptions} onChange={val => setDrawerForm(prev => ({ ...prev, prescriptions: val }))} />
                        </div>
                      </div>

                      {/* Admin Columns */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                        <span style={{ fontSize: '11px', fontWeight: 800, color: '#94A3B8', letterSpacing: '0.05em' }}>-- ADMINISTRATION</span>
                        
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <div style={{ display: 'flex', flexDirection: 'column' }}>
                            <span style={{ fontSize: '12px', fontWeight: 700, color: '#334155' }}>User Management</span>
                            <span style={{ fontSize: '9.5px', color: '#94A3B8', fontWeight: 500 }}>Manage staff accounts</span>
                          </div>
                          <ToggleSwitch checked={drawerForm.userMgmt} onChange={val => setDrawerForm(prev => ({ ...prev, userMgmt: val }))} />
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <div style={{ display: 'flex', flexDirection: 'column' }}>
                            <span style={{ fontSize: '12px', fontWeight: 700, color: '#334155' }}>System Settings</span>
                            <span style={{ fontSize: '9.5px', color: '#94A3B8', fontWeight: 500 }}>Access system configuration panel</span>
                          </div>
                          <ToggleSwitch checked={drawerForm.systemSettings} onChange={val => setDrawerForm(prev => ({ ...prev, systemSettings: val }))} />
                        </div>
                      </div>
                    </div>
                  </div>

                </div>

                {/* Right Panel: Live User Summary */}
                <div style={{ width: '320px', background: '#F8FAFC', borderLeft: '1px solid #E2E8F0', padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px', flexShrink: 0, overflowY: 'auto' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', borderBottom: '1px solid #E2E8F0', paddingBottom: '8px' }}>
                    <LucideIcon name="eye" style={{ width: '14px', height: '14px', color: '#64748B' }} />
                    <span style={{ fontSize: '11px', fontWeight: 800, color: '#64748B', letterSpacing: '0.05em' }}>LIVE USER SUMMARY</span>
                  </div>

                  <div>
                    <h4 style={{ fontSize: '16px', fontWeight: 800, color: '#0F172A', margin: 0 }}>
                      {drawerForm.firstName || ''} {drawerForm.lastName || ''}
                    </h4>
                    <span style={{ fontSize: '11px', color: '#64748B', fontWeight: 600, display: 'block', marginTop: '2px' }}>
                      EMPLOYEE ID: <span style={{ fontFamily: 'monospace', fontWeight: 700 }}>EMP-2026-003</span>
                    </span>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '12px', padding: '16px' }}>
                    <div>
                      <span style={{ fontSize: '10px', fontWeight: 700, color: '#94A3B8', display: 'block', textTransform: 'uppercase' }}>ROLE</span>
                      <span style={{ fontSize: '12px', fontWeight: 800, color: '#2563EB', background: '#EFF6FF', padding: '2px 8px', borderRadius: '4px', display: 'inline-block', marginTop: '4px' }}>
                        {drawerForm.role}
                      </span>
                    </div>

                    <div>
                      <span style={{ fontSize: '10px', fontWeight: 700, color: '#94A3B8', display: 'block', textTransform: 'uppercase' }}>DEPARTMENT</span>
                      <span style={{ fontSize: '12.5px', fontWeight: 700, color: '#334155', display: 'block', marginTop: '2px' }}>
                        {drawerForm.department}
                      </span>
                    </div>

                    <div>
                      <span style={{ fontSize: '10px', fontWeight: 700, color: '#94A3B8', display: 'block', textTransform: 'uppercase' }}>ACCOUNT STATUS</span>
                      <span style={{ fontSize: '12.5px', fontWeight: 800, color: '#10B981', display: 'flex', alignItems: 'center', gap: '4px', marginTop: '2px' }}>
                        <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#10B981', display: 'inline-block' }} />
                        ACTIVE
                      </span>
                    </div>

                    <div>
                      <span style={{ fontSize: '10px', fontWeight: 700, color: '#94A3B8', display: 'block', textTransform: 'uppercase' }}>ACCESS PRIVILEGES</span>
                      <span style={{ fontSize: '12.5px', fontWeight: 700, color: '#334155', display: 'block', marginTop: '2px' }}>
                        {(() => {
                          const activePerms = [drawerForm.ehrAccess, drawerForm.prescriptions, drawerForm.userMgmt, drawerForm.systemSettings].filter(Boolean).length;
                          return `${activePerms * 3} Modules`;
                        })()}
                      </span>
                    </div>

                    <div>
                      <span style={{ fontSize: '10px', fontWeight: 700, color: '#94A3B8', display: 'block', textTransform: 'uppercase' }}>LICENSING ALLOCATION</span>
                      <span style={{ fontSize: '12.5px', fontWeight: 700, color: '#334155', display: 'block', marginTop: '2px' }}>
                        12 / {(wizardHospital && wizardHospital.staffLimit) || 100} Seats
                      </span>
                    </div>

                    <div>
                      <span style={{ fontSize: '10px', fontWeight: 700, color: '#94A3B8', display: 'block', textTransform: 'uppercase' }}>SECURITY LEVEL</span>
                      <span style={{ fontSize: '12.5px', fontWeight: 700, color: '#334155', display: 'block', marginTop: '2px' }}>
                        {(() => {
                          if (drawerForm.role === 'Administrator') return 'LEVEL 01';
                          if (drawerForm.role === 'Doctor') return 'LEVEL 02';
                          if (drawerForm.role === 'Pharmacist') return 'LEVEL 03';
                          return 'LEVEL 04';
                        })()}
                      </span>
                    </div>
                  </div>

                  {/* Profile Completeness progress bar */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: 'auto' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', fontWeight: 700, color: '#475569' }}>
                      <span>Profile Completeness</span>
                      <span>
                        {(() => {
                          let comp = 0;
                          if (drawerForm.firstName) comp += 15;
                          if (drawerForm.lastName) comp += 15;
                          if (drawerForm.email) comp += 20;
                          if (drawerForm.phone) comp += 20;
                          if (drawerForm.secPhone) comp += 10;
                          if (drawerForm.department) comp += 10;
                          if (drawerForm.role) comp += 10;
                          return `${comp}%`;
                        })()}
                      </span>
                    </div>
                    <div style={{ height: '6px', width: '100%', background: '#E2E8F0', borderRadius: '3px', overflow: 'hidden' }}>
                      <div style={{ 
                        height: '100%', 
                        width: (() => {
                          let comp = 0;
                          if (drawerForm.firstName) comp += 15;
                          if (drawerForm.lastName) comp += 15;
                          if (drawerForm.email) comp += 20;
                          if (drawerForm.phone) comp += 20;
                          if (drawerForm.secPhone && drawerForm.secPhone !== '+1 (555)') comp += 10;
                          if (drawerForm.department) comp += 10;
                          if (drawerForm.role) comp += 10;
                          return `${comp}%`;
                        })(), 
                        background: '#10B981', 
                        borderRadius: '3px',
                        transition: 'width 0.3s ease'
                      }} />
                    </div>
                  </div>
                </div>

              </div>

              {/* Drawer Footer */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 24px', borderTop: '1px solid #E2E8F0', background: '#FFFFFF', flexShrink: 0 }}>
                <div style={{ display: 'flex', gap: '16px' }}>
                  <button type="button" onClick={() => setIsAddUserDrawerOpen(false)} style={{ background: 'none', border: 'none', color: '#64748B', fontSize: '13px', fontWeight: 700, cursor: 'pointer' }}>Cancel</button>
                  <button type="button" onClick={() => { showToast('Draft saved successfully.', 'success'); setIsAddUserDrawerOpen(false); }} style={{ background: 'none', border: 'none', color: '#64748B', fontSize: '13px', fontWeight: 700, cursor: 'pointer' }}>Save Draft</button>
                </div>
                <div style={{ display: 'flex', gap: '12px' }}>
                  <button 
                    type="button" 
                    onClick={handleCreateOnboardingUser}
                    style={{ background: '#FFFFFF', border: '1.5px solid #2563EB', color: '#2563EB', borderRadius: '8px', padding: '8px 16px', fontSize: '13px', fontWeight: 700, cursor: 'pointer' }}
                  >
                    Create & Invite
                  </button>
                  <button 
                    type="button" 
                    onClick={handleCreateOnboardingUser}
                    style={{ background: '#2563EB', border: 'none', color: '#FFFFFF', borderRadius: '8px', padding: '8px 20px', fontSize: '13px', fontWeight: 700, cursor: 'pointer' }}
                  >
                    Create User
                  </button>
                </div>
              </div>

            </div>
          </div>
      {toast && (
        <div style={{
          position: 'fixed',
          bottom: '24px',
          right: '24px',
          background: toast.type === 'error' ? '#FEF2F2' : '#EFF6FF',
          border: toast.type === 'error' ? '1px solid #FCA5A5' : '1px solid #BFDBFE',
          borderRadius: '8px',
          padding: '12px 18px',
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
          zIndex: 99999,
          animation: 'toastSlideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1)'
        }}>
          <div style={{
            width: '8px',
            height: '8px',
            borderRadius: '50%',
            background: toast.type === 'error' ? '#EF4444' : '#3B82F6'
          }} />
          <span style={{ fontSize: '13.5px', fontWeight: 700, color: toast.type === 'error' ? '#991B1B' : '#1E3A8A' }}>
            {toast.message}
          </span>
        </div>
      )}
      </div>
    );
  };

  if (impersonatingHospital) {
    return renderImpersonationPortal();
  }

  if (isOnboardingWizardOpen && wizardHospital) {
    return renderOnboardingWizard();
  }

  if (isInitialLoading) {
    return (
      <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 9999, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#F8FAFC' }}>
        <style>{`
          @keyframes initSpin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
        `}</style>
        <div style={{ width: '48px', height: '48px', border: '4px solid #E2E8F0', borderTopColor: '#2563EB', borderRadius: '50%', animation: 'initSpin 1s linear infinite', marginBottom: '16px' }}></div>
        <h2 style={{ fontSize: '20px', fontWeight: 800, color: '#1E293B', margin: '0 0 8px 0' }}>Loading Workspace...</h2>
        <p style={{ fontSize: '14px', color: '#64748B', margin: 0 }}>Initializing your dashboard</p>
      </div>
    );
  }

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'row',
      height: '100vh',
      width: '100%',
      minWidth: 0,
      maxWidth: '100%',
      overflow: 'hidden',
      background: '#F8FAFC'
    }}>
      {/* GLOBAL VIEW RESET */}
      <style>{`
        html {
          zoom: 1 !important;
          margin: 0 !important;
          padding: 0 !important;
          overflow: hidden !important;
          height: 100% !important;
          width: 100% !important;
          min-width: 100% !important;
          max-width: 100% !important;
          background: #F8FAFC !important;
          font-family: 'Outfit', 'Inter', sans-serif;
        }
        body {
          zoom: 1 !important;
          margin: 0 !important;
          padding: 0 !important;
          overflow: hidden !important;
          height: 100% !important;
          width: 100% !important;
          min-width: 100% !important;
          max-width: 100% !important;
          background: #F8FAFC !important;
          font-family: 'Outfit', 'Inter', sans-serif;
        }
        #root {
          margin: 0 !important;
          padding: 0 !important;
          overflow: hidden !important;
          height: 100% !important;
          width: 100% !important;
          min-width: 100% !important;
          max-width: 100% !important;
        }
        * { box-sizing: border-box; }
        @keyframes toastSlideUp {
          from { transform: translateY(24px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
        
        /* Premium custom range inputs */
        .custom-slider-input {
          -webkit-appearance: none;
          width: 100%;
          height: 6px;
          border-radius: 3px;
          background: #E2E8F0;
          outline: none;
          margin: 0;
          transition: background 0.15s ease-in-out;
        }
        .custom-slider-input::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          width: 16px;
          height: 16px;
          border-radius: 50%;
          background: #2563EB;
          cursor: pointer;
          border: 2px solid #FFFFFF;
          box-shadow: 0 2px 4px rgba(37, 99, 235, 0.3);
          transition: transform 0.1s ease-in-out, background-color 0.1s;
        }
        .custom-slider-input::-webkit-slider-thumb:hover {
          transform: scale(1.2);
          background-color: #1D4ED8;
        }
        .custom-slider-input::-moz-range-thumb {
          width: 16px;
          height: 16px;
          border-radius: 50%;
          background: #2563EB;
          cursor: pointer;
          border: 2px solid #FFFFFF;
          box-shadow: 0 2px 4px rgba(37, 99, 235, 0.3);
          transition: transform 0.1s ease-in-out, background-color 0.1s;
        }
        .custom-slider-input::-moz-range-thumb:hover {
          transform: scale(1.2);
          background-color: #1D4ED8;
        }
        .search-result-item:hover {
          background-color: #F1F5F9;
        }
        .kpi-card-interactive {
          transition: transform 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275), box-shadow 0.4s, border-color 0.4s !important;
        }
        .kpi-card-interactive:hover {
          transform: translateY(-5px) scale(1.02);
          box-shadow: 0 12px 20px -5px rgba(15, 23, 42, 0.08) !important;
          border-color: #BFDBFE !important;
        }
        .glass-card-interactive {
          transition: transform 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275), box-shadow 0.4s, border-color 0.4s !important;
        }
        .glass-card-interactive:hover {
          transform: translateY(-4px) scale(1.005);
          box-shadow: 0 15px 30px -10px rgba(15, 23, 42, 0.06) !important;
          border-color: #BFDBFE !important;
        }
      `}</style>

      {/* 1. LEFT FULL-HEIGHT SIDEBAR NAVIGATION */}
      <aside style={{
        ...styles.sidebar,
        width: '260px',
        minWidth: '260px',
        maxWidth: '260px',
        height: '100vh',
        background: '#FFFFFF',
        borderRight: '1px solid #E2E8F0',
        display: 'flex',
        flexDirection: 'column',
        flexShrink: 0,
        zIndex: 90
      }}>
        {/* Logo Group */}
        <div style={{ padding: '16px 20px 14px', display: 'flex', alignItems: 'center', gap: '12px', borderBottom: '1px solid #F1F5F9' }}>
          <img 
            src={curoxaSidebarLogo} 
            alt="CUROXA" 
            style={{
              width: '42px',
              height: '42px',
              objectFit: 'contain',
              flexShrink: 0,
              filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.08))'
            }}
          />
          <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
            <span style={{ fontFamily: "'Plus Jakarta Sans', 'Outfit', sans-serif", fontWeight: 900, fontSize: '17px', color: '#0F172A', letterSpacing: '0.03em', lineHeight: 1.1 }}>
              CUROXA
            </span>
            <span style={{ fontSize: '10px', fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.6px', marginTop: '3px', lineHeight: 1 }}>
              Enterprise Admin
            </span>
          </div>
        </div>

        {/* Workspace Production status card */}
        <div style={{
          margin: '12px 14px 16px',
          padding: '12px 14px',
          background: 'linear-gradient(135deg, #F8FAFC 0%, #F1F5F9 100%)',
          border: '1px solid #E2E8F0',
          borderRadius: '12px',
          boxShadow: '0 1px 3px rgba(15,23,42,0.03)'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '5px' }}>
            <span style={{ fontSize: '9.5px', fontWeight: 800, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.6px' }}>Workspace</span>
            <span style={{
              fontSize: '9px',
              fontWeight: 850,
              background: '#D1FAE5',
              color: '#065F46',
              border: '1px solid #A7F3D0',
              padding: '1px 6px',
              borderRadius: '6px',
              textTransform: 'uppercase',
              letterSpacing: '0.4px',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '3px'
            }}>
              <span style={{ width: '4px', height: '4px', borderRadius: '50%', background: '#059669' }} />
              Production
            </span>
          </div>
          <div style={{ fontSize: '12.5px', fontWeight: 800, color: '#0F172A', letterSpacing: '-0.2px' }}>Curoxa Global</div>
          <div style={{ fontSize: '10px', color: '#64748B', fontWeight: 600, marginTop: '2px' }}>Enterprise Master License</div>
        </div>

        {/* Scroll Area of menu items */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '0 10px 20px' }}>
          {filteredMenuGroups.map((group, groupIdx) => (
            <div key={group.group || groupIdx} style={{ marginBottom: '14px' }}>
              {group.group && (
                <div style={{
                  fontSize: '9.5px',
                  fontWeight: 800,
                  color: '#94A3B8',
                  textTransform: 'uppercase',
                  padding: '6px 12px 4px',
                  letterSpacing: '0.6px'
                }}>
                  {group.group}
                </div>
              )}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                {group.items.map(item => {
                  const isActive = activeTab === item.id || 
                    (item.id === 'customer-support' && activeTab === 'support-success') ||
                    (item.id === 'finance' && activeTab === 'finance-mgmt') ||
                    (item.id === 'employees' && activeTab === 'hr-mgmt') ||
                    (item.id === 'reports' && activeTab === 'bi-reports') ||
                    (item.id === 'settings' && activeTab === 'platform-control');
                  
                  return (
                    <button
                      key={item.id}
                      onClick={() => { 
                        if (item.id === 'customer-support') {
                          setActiveTab('support-success');
                          setSupportSubTab('support-dashboard');
                        } else if (item.id === 'finance') {
                          setActiveTab('finance-mgmt');
                          setFinSubTab('finance-dashboard');
                        } else if (item.id === 'employees') {
                          setActiveTab('hr-mgmt');
                          setHrSubTab('employees-list');
                        } else if (item.id === 'reports') {
                          setActiveTab('bi-reports');
                          setBiSubTab('bi-dashboard');
                        } else if (item.id === 'settings') {
                          setActiveTab('platform-control');
                          setCtrlSubTab('platform-dashboard');
                        } else {
                          setActiveTab(item.id); 
                        }
                      }}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        width: '100%',
                        height: '36px',
                        border: 'none',
                        background: isActive ? 'linear-gradient(135deg, #2563EB 0%, #6366F1 100%)' : 'transparent',
                        borderRadius: '9px',
                        cursor: 'pointer',
                        padding: '0 12px',
                        gap: '10px',
                        color: isActive ? '#FFFFFF' : '#475569',
                        fontWeight: isActive ? 750 : 550,
                        fontSize: '12px',
                        textAlign: 'left',
                        boxShadow: isActive ? '0 4px 12px rgba(37, 99, 235, 0.28)' : 'none',
                        transition: 'all 0.15s ease'
                      }}
                      onMouseEnter={e => { if(!isActive) e.currentTarget.style.backgroundColor = '#F1F5F9'; }}
                      onMouseLeave={e => { if(!isActive) e.currentTarget.style.backgroundColor = 'transparent'; }}
                    >
                      <LucideIcon name={item.icon} style={{ width: '15px', height: '15px', color: isActive ? '#FFFFFF' : '#64748B' }} />
                      <span>{item.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {/* Logout Button */}
        <div style={{ padding: '12px', borderTop: '1px solid #F1F5F9' }}>
          <button
            onClick={() => {
              performLogout(navigate);
            }}
            style={{
              display: 'flex', alignItems: 'center', width: '100%', height: '36px',
              border: 'none', background: 'none', borderRadius: '8px', cursor: 'pointer',
              color: '#EF4444', fontWeight: 700, padding: '0 12px', gap: '10px',
              fontSize: '12px', textAlign: 'left'
            }}
            onMouseEnter={e => { e.currentTarget.style.backgroundColor = '#FEF2F2'; }}
            onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'transparent'; }}
          >
            <LucideIcon name="log-out" style={{ width: '15px', height: '15px', color: '#EF4444' }} />
            <span>Logout</span>
          </button>
        </div>
      </aside>

      {/* 2. RIGHT MAIN VIEWPORT (TOPBAR + CONTENT) */}
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        flex: 1,
        width: 'calc(100% - 260px)',
        minWidth: 0,
        height: '100vh',
        overflow: 'hidden'
      }}>
        {/* TOPBAR */}
        <header style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          height: '60px',
          width: '100%',
          minWidth: 0,
          boxSizing: 'border-box',
          background: '#FFFFFF',
          borderBottom: '1px solid #E2E8F0',
          padding: '0 24px',
          flexShrink: 0,
          zIndex: 80
        }}>
          {/* Left: Platform Headline & System Status */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0 }}>
            <div style={{
              background: 'linear-gradient(135deg, #4F46E5 0%, #7C3AED 100%)',
              color: '#FFFFFF',
              width: '34px',
              height: '34px',
              borderRadius: '9px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              boxShadow: '0 2px 8px rgba(79,70,229,0.25)'
            }}>
              <LucideIcon name="shield-check" style={{ width: '18px', height: '18px', color: '#FFFFFF' }} />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
              <h1 style={{ fontSize: '15px', fontWeight: 850, color: '#0F172A', margin: 0, letterSpacing: '-0.3px', whiteSpace: 'nowrap' }}>
                Curoxa Global Platform Command Center
              </h1>
              <span style={{
                fontSize: '9px',
                fontWeight: 800,
                color: '#059669',
                background: '#D1FAE5',
                border: '1px solid #A7F3D0',
                padding: '2px 8px',
                borderRadius: '12px',
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                whiteSpace: 'nowrap'
              }}>
                <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: '#059669', display: 'inline-block' }} />
                System Active
              </span>
            </div>
          </div>

          {/* Right Controls */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <button style={{ ...styles.iconButtonBadge, position: 'relative' }} onClick={() => setIsNotificationOpen(true)}>
              <LucideIcon name="bell" style={{ width: '18px', height: '18px', color: '#64748B' }} />
              {notifications.filter(n => !n.isRead).length > 0 && (
                <span style={{
                  position: 'absolute', top: '-2px', right: '-2px',
                  background: '#EF4444', color: '#FFFFFF', fontSize: '9px', fontWeight: 800,
                  borderRadius: '50%', width: '15px', height: '15px', display: 'flex',
                  alignItems: 'center', justifyContent: 'center', border: '2px solid #FFFFFF'
                }}>{notifications.filter(n => !n.isRead).length}</span>
              )}
            </button>
            
            <button style={styles.iconButtonBadge} onClick={() => setActiveTab('support-success')}>
              <LucideIcon name="help-circle" style={{ width: '18px', height: '18px', color: '#64748B' }} />
            </button>

            {isSuperAdmin && (
              <button style={styles.iconButtonBadge} onClick={() => { setActiveTab('platform-control'); setCtrlSubTab('platform-dashboard'); }}>
                <LucideIcon name="layout-grid" style={{ width: '18px', height: '18px', color: '#64748B' }} />
              </button>
            )}

            <div style={{ position: 'relative' }}>
              <button style={{ ...styles.profileTrigger, border: 'none', background: 'none', padding: 0, cursor: 'pointer' }} onClick={() => setIsProfileOpen(!isProfileOpen)}>
                <div style={{
                  width: '32px', height: '32px', borderRadius: '50%',
                  background: '#2563EB', color: '#FFFFFF', display: 'flex',
                  alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: 800
                }}>
                  {currentUser.name ? currentUser.name.slice(0, 2).toUpperCase() : 'SU'}
                </div>
              </button>

              {/* Profile Dropdown */}
              {isProfileOpen && (
                <>
                  {/* Full-screen backdrop to close dropdown when clicking anywhere */}
                  <div
                    style={{
                      position: 'fixed',
                      top: 0,
                      left: 0,
                      right: 0,
                      bottom: 0,
                      zIndex: 299,
                      background: 'transparent',
                      cursor: 'default'
                    }}
                    onClick={() => setIsProfileOpen(false)}
                  />
                  <div style={{
                    position: 'absolute', top: '100%', right: 0, marginTop: '8px',
                    width: '220px', background: '#FFFFFF', borderRadius: '10px',
                    border: '1px solid #E2E8F0', boxShadow: '0 10px 25px -5px rgba(0,0,0,0.1)',
                    zIndex: 300, overflow: 'hidden'
                  }}>
                    <div style={{ padding: '14px 16px', borderBottom: '1px solid #F1F5F9' }}>
                      <div style={{ fontSize: '13px', fontWeight: 800, color: '#0F172A' }}>{currentUser.name}</div>
                      <div style={{ fontSize: '10px', color: '#64748B', marginTop: '2px' }}>{currentUser.email || 'super.admin@curoxa.com'}</div>
                      <div style={{ fontSize: '9px', fontWeight: 700, color: '#2563EB', marginTop: '4px', textTransform: 'uppercase' }}>{currentUserPlatformRole}</div>
                    </div>
                    <div style={{ padding: '6px' }}>
                      <button
                        onClick={() => {
                          setProfileForm({
                            name: currentUser.name || 'Super Admin',
                            email: currentUser.email || 'super.admin@curoxa.com',
                            currentPassword: '',
                            newPassword: '',
                            confirmPassword: ''
                          });
                          setProfileError('');
                          setIsProfileModalOpen(true);
                          setIsProfileOpen(false);
                        }}
                        style={{
                          display: 'flex', alignItems: 'center', gap: '10px', width: '100%',
                          padding: '9px 12px', border: 'none', background: 'none', borderRadius: '6px',
                          fontSize: '12px', color: '#2563EB', fontWeight: 700, cursor: 'pointer', textAlign: 'left'
                        }}
                        onMouseEnter={e => { e.currentTarget.style.backgroundColor = '#EFF6FF'; }}
                        onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'transparent'; }}
                      >
                        <LucideIcon name="user-cog" style={{ width: '15px', height: '15px', color: '#2563EB' }} />
                        Profile & Password Settings
                      </button>
                      {isSuperAdmin && (
                        <button
                          onClick={() => { setActiveTab('platform-control'); setCtrlSubTab('platform-dashboard'); setIsProfileOpen(false); }}
                          style={{
                            display: 'flex', alignItems: 'center', gap: '10px', width: '100%',
                            padding: '9px 12px', border: 'none', background: 'none', borderRadius: '6px',
                            fontSize: '12px', color: '#475569', cursor: 'pointer', textAlign: 'left'
                          }}
                          onMouseEnter={e => { e.currentTarget.style.backgroundColor = '#F1F5F9'; }}
                          onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'transparent'; }}
                        >
                          <LucideIcon name="settings" style={{ width: '15px', height: '15px', color: '#64748B' }} />
                          Platform Settings
                        </button>
                      )}
                      <button
                        onClick={() => {
                          performLogout(navigate);
                        }}
                        style={{
                          display: 'flex', alignItems: 'center', gap: '10px', width: '100%',
                          padding: '9px 12px', border: 'none', background: 'none', borderRadius: '6px',
                          fontSize: '12px', color: '#EF4444', fontWeight: 600, cursor: 'pointer', textAlign: 'left'
                        }}
                        onMouseEnter={e => { e.currentTarget.style.backgroundColor = '#FEF2F2'; }}
                        onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'transparent'; }}
                      >
                        <LucideIcon name="log-out" style={{ width: '15px', height: '15px', color: '#EF4444' }} />
                        Sign Out
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </header>

        {/* WORKSPACE CENTRAL CANVAS & RIGHT SIDEBAR PANEL */}
        <div style={{ display: 'flex', flex: 1, width: '100%', minWidth: 0, overflow: 'hidden' }}>
          {/* CENTRAL APP PORT */}
          <main style={styles.mainCanvas}>

            {/* Restricted Access Fallback */}
            {!isTabAllowed && (
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '16px', background: '#FFFFFF', borderRadius: '12px', border: '1px solid #E2E8F0', padding: '40px', margin: '24px' }}>
                <div style={{ width: '64px', height: '64px', borderRadius: '16px', background: '#FEF2F2', color: '#EF4444', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <LucideIcon name="shield-alert" style={{ width: '32px', height: '32px' }} />
                </div>
                <div style={{ textAlign: 'center' }}>
                  <h2 style={{ margin: '0 0 8px 0', fontSize: '20px', fontWeight: 800, color: '#0F172A' }}>Access Restricted</h2>
                  <p style={{ margin: 0, fontSize: '14px', color: '#64748B' }}>Your current role <strong style={{ color: '#0F172A' }}>({currentUserPlatformRole})</strong> does not have permission to view this module.</p>
                </div>
                <button
                  onClick={() => {
                    const homeTab = DEFAULT_TAB_MAP[currentUserPlatformRole] || 'hospital-onboarding';
                    setActiveTab(homeTab);
                  }}
                  style={{ marginTop: '16px', background: '#2563EB', color: '#FFFFFF', border: 'none', padding: '10px 24px', borderRadius: '8px', fontWeight: 700, cursor: 'pointer', transition: 'background 0.2s' }}
                  onMouseEnter={e => e.currentTarget.style.background = '#1D4ED8'}
                  onMouseLeave={e => e.currentTarget.style.background = '#2563EB'}
                >
                  Return to Authorized Panel
                </button>
              </div>
            )}
            
            {/* STEP 10: PLATFORM CONTROL CENTER */}
            {isTabAllowed && activeTab === 'platform-control' && (
              <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
                {/* SUB NAV BAR FOR CONTROL */}
                <div style={{ ...styles.subNavbar, flexWrap: 'wrap' }}>
                  <button style={ctrlSubTab === 'platform-dashboard' ? styles.subNavbarBtnActive : styles.subNavbarBtn} onClick={() => setCtrlSubTab('platform-dashboard')}>Admin Dashboard</button>
                  <button style={ctrlSubTab === 'developer-center' ? styles.subNavbarBtnActive : styles.subNavbarBtn} onClick={() => setCtrlSubTab('developer-center')}>Dev Center Sandbox</button>
                </div>

                <div style={styles.pageBodyScroll}>
                  
                  {/* VIEW 1: PLATFORM TELEMETRY DASHBOARD */}
                  {ctrlSubTab === 'platform-dashboard' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                      <div style={styles.kpiGrid}>
                        {[
                          { label: 'SERVER TELEMETRY STATUS', val: '99.98% Up', change: 'CPU load: 12% average', color: '#10B981' },
                          { label: 'ACTIVE QUEUES', val: '0 Pending', change: 'Background jobs running: 4', color: '#2563EB' },
                          { label: 'DATABASE HEALTH', val: 'Optimal', change: 'Redis Cache hit: 98.4%', color: '#10B981' },
                          { label: 'CONNECTED HOSPITALS', val: hospitals.length.toString(), change: `Active Webhook triggers: ${hospitals.length}`, color: '#2563EB' }
                        ].map(c => (
                          <div key={c.label} style={styles.kpiCard} className="kpi-card-interactive">
                            <span style={styles.kpiLabel}>{c.label}</span>
                            <div style={{ ...styles.kpiVal, color: c.color, margin: '6px 0' }}>{c.val}</div>
                            <span style={styles.kpiSubText}>{c.change}</span>
                          </div>
                        ))}
                      </div>

                      <div style={styles.twoColumnGrid}>
                        <div style={styles.glassCard} className="glass-card-interactive">
                          <h3 style={styles.cardHeaderTitle}>API Ingress Workload</h3>
                          <div style={styles.chartWrapper}>
                            <svg viewBox="0 0 600 120" style={{ width: '100%', height: '120px' }}>
                              <path d="M10,80 L100,75 L200,65 L300,72 L400,32 L500,22 L600,10" fill="none" stroke="#2563EB" strokeWidth="2.5" />
                            </svg>
                          </div>
                        </div>

                        <div style={styles.glassCard} className="glass-card-interactive">
                          <h3 style={styles.cardHeaderTitle}>Storage Allocation Capacity</h3>
                            {(() => {
                              const totalAllocated = hospitals.reduce((sum, h) => sum + (parseInt(h.limits?.storageLimit) || 50), 0) || 500;
                              const totalUsed = parseFloat(hospitals.reduce((sum, h) => sum + (parseFloat(h.limits?.storageUsed) || 0), 0).toFixed(1)) || 0;
                              const percent = Math.min(100, Math.max(0, (totalUsed / totalAllocated) * 100));
                              const strokeFilled = Math.round((percent / 100) * 251);
                              const strokeEmpty = 251 - strokeFilled;
                              return (
                                <div style={{ display: 'flex', gap: '20px', alignItems: 'center', marginTop: '16px' }}>
                                  <svg viewBox="0 0 100 100" style={{ width: '100px', height: '100px' }}>
                                    <circle cx="50" cy="50" r="40" fill="none" stroke="#E2E8F0" strokeWidth="15" />
                                    <circle cx="50" cy="50" r="40" fill="none" stroke="#2563EB" strokeWidth="15" strokeDasharray={`${strokeFilled} ${strokeEmpty}`} transform="rotate(-90 50 50)" />
                                  </svg>
                                  <div>
                                    <strong>{totalUsed} GB / {totalAllocated} GB</strong>
                                    <p style={styles.cardHeaderSub}>Global Document attachments index.</p>
                                  </div>
                                </div>
                              );
                            })()}
                        </div>
                      </div>
                    </div>
                  )}

                  {ctrlSubTab === 'developer-center' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                      <div style={styles.glassCard}>
                        <h3 style={styles.cardHeaderTitle}>Third-Party Integrations Settings</h3>
                        <p style={styles.cardHeaderSub}>Secrets and connection tokens.</p>
                        
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginTop: '20px' }}>
                          {['Stripe gateway integration', 'Cloudinary Image Vault', 'Google Calendar Oauth'].map(api => (
                            <div key={api} style={styles.crmFollowupRow}>
                              <div>
                                <strong>{api}</strong>
                                <div style={{ fontSize: '11px', color: '#10B981' }}>Status: Connected (OK)</div>
                              </div>
                              <button style={styles.btnActionSmall} onClick={() => showToast('Connection check succeeded.', 'success')}>Test Ping</button>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div style={styles.glassCard}>
                        <h3 style={styles.cardHeaderTitle}>Developer Webhook Sandbox Simulator</h3>
                        <p style={styles.cardHeaderSub}>Test system webhook triggers by simulating incoming API endpoints payloads.</p>
                        
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginTop: '20px' }}>
                          <div style={styles.formCol}>
                            <label style={styles.formLabel}>SIMULATE WEBHOOK TRIGGER</label>
                            <select style={styles.formInput}>
                              <option>invoice.payment_succeeded</option>
                              <option>ticket.created_alert</option>
                              <option>hospital.activated</option>
                            </select>
                          </div>
                          <button style={{ ...styles.btnPrimary, alignSelf: 'flex-start' }} onClick={() => showToast('Webhook request payload triggered successfully.', 'success')}>Test Webhook Payload</button>
                        </div>
                      </div>

                      <div style={{ ...styles.glassCard, borderLeft: '5px solid #EF4444' }}>
                        <h3 style={styles.cardHeaderTitle}>Database Operations & Purge Control</h3>
                        <p style={styles.cardHeaderSub}>Perform a complete wipe of the system. This deletes all hospital accounts, clinical records, invoices, support tickets, and scheduling logs while preserving your Super Admin login credentials.</p>
                        
                        <div style={{ marginTop: '20px' }}>
                          <button 
                            style={{ ...styles.btnPrimary, background: '#EF4444', border: 'none', color: '#FFF', padding: '10px 16px', borderRadius: '6px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }} 
                            onClick={() => {
                              setConfirmModalConfig({
                                title: 'Purge Operational & Hospital Data',
                                message: 'WARNING: This will permanently delete all hospital entries, doctor accounts, patients, invoices, and clinical data from the database. Only your Super Admin login will remain active. Are you sure you want to proceed?',
                                confirmText: 'Yes, Purge Database',
                                cancelText: 'Cancel',
                                danger: true,
                                onConfirm: async () => {
                                  setConfirmModalConfig(prev => ({ ...prev, isLoading: true, confirmText: 'Purging Database...' }));
                                  try {
                                    const token = localStorage.getItem('token');
                                    const res = await fetch('/api/superadmin/purge', {
                                      method: 'POST',
                                      headers: { 'Authorization': `Bearer ${token}` }
                                    });
                                    if (res.ok) {
                                      showToast('Database operational collections purged successfully! Re-initializing dashboard.', 'success');
                                      setTimeout(() => window.location.reload(), 1500);
                                    } else {
                                      showToast('Failed to purge database.', 'error');
                                    }
                                  } catch (err) {
                                    console.error(err);
                                    showToast('Error executing purge request.', 'error');
                                  } finally {
                                    setConfirmModalConfig(null);
                                  }
                                }
                              });
                            }}
                          >
                            Purge All Operational & Hospital Data
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                </div>
              </div>
            )}

            {/* SCREEN LAYOUT CONSISTENCY: MAIN SAAS OVERVIEW (STEP 2) */}
            {isTabAllowed && activeTab === 'dashboard' && (
              <div style={{ ...styles.pageBodyScroll, gap: '22px', position: 'relative', paddingBottom: '90px' }}>
                {/* Ambient background atmosphere glows */}
                <div style={{
                  position: 'absolute',
                  top: '-20px',
                  left: '10%',
                  width: '600px',
                  height: '300px',
                  background: 'radial-gradient(ellipse at center, rgba(99, 102, 241, 0.035) 0%, transparent 70%)',
                  pointerEvents: 'none',
                  zIndex: 0
                }} />
                <div style={{
                  position: 'absolute',
                  top: '-20px',
                  right: '10%',
                  width: '500px',
                  height: '260px',
                  background: 'radial-gradient(ellipse at center, rgba(13, 148, 136, 0.025) 0%, transparent 70%)',
                  pointerEvents: 'none',
                  zIndex: 0
                }} />

                {/* 1. HERO / PLATFORM COMMAND SEARCH & ACTIONS BAR */}
                <div style={{
                  background: 'linear-gradient(135deg, #EEF2FF 0%, #F8FAFC 50%, #FAF5FF 100%)',
                  borderRadius: '18px',
                  padding: '18px 24px',
                  minHeight: '84px',
                  flexShrink: 0,
                  boxSizing: 'border-box',
                  border: '1px solid #C7D2FE',
                  boxShadow: '0 2px 8px rgba(79,70,229,0.05)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  gap: '16px',
                  position: 'relative',
                  overflow: 'hidden',
                  zIndex: 1
                }}>
                  {/* Subtle telemetry circle accents */}
                  <div style={{ position: 'absolute', top: '-40px', right: '320px', width: '160px', height: '160px', borderRadius: '50%', background: 'radial-gradient(circle, rgba(99,102,241,0.07) 0%, transparent 70%)', pointerEvents: 'none' }} />
                  <div style={{ position: 'absolute', bottom: '-30px', right: '120px', width: '120px', height: '120px', borderRadius: '50%', background: 'radial-gradient(circle, rgba(124,58,237,0.05) 0%, transparent 70%)', pointerEvents: 'none' }} />

                  {/* Left: Prominent Global Search Bar */}
                  <div style={{ display: 'flex', alignItems: 'center', flex: 1, minWidth: '280px', maxWidth: '520px', position: 'relative' }}>
                    <LucideIcon name="search" style={{ position: 'absolute', left: '14px', width: '17px', height: '17px', color: '#6366F1', zIndex: 1 }} />
                    <input
                      type="text"
                      placeholder="Search hospitals, tickets, telemetry, logs, reports..."
                      style={{
                        height: '42px',
                        width: '100%',
                        padding: '0 46px 0 42px',
                        border: '1px solid #C7D2FE',
                        borderRadius: '12px',
                        fontSize: '13px',
                        background: '#FFFFFF',
                        outline: 'none',
                        fontWeight: 500,
                        color: '#1E293B',
                        boxShadow: '0 1px 3px rgba(79,70,229,0.06)',
                        transition: 'all 0.2s ease'
                      }}
                      onFocus={e => { e.currentTarget.style.borderColor = '#4F46E5'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(79,70,229,0.12)'; }}
                      onBlur={e => { e.currentTarget.style.borderColor = '#C7D2FE'; e.currentTarget.style.boxShadow = '0 1px 3px rgba(79,70,229,0.06)'; }}
                      onClick={() => setIsSearchModalOpen(true)}
                    />
                    <div style={{
                      position: 'absolute',
                      right: '10px',
                      padding: '2px 7px',
                      background: '#F1F5F9',
                      border: '1px solid #E2E8F0',
                      borderRadius: '6px',
                      fontSize: '10.5px',
                      fontWeight: 700,
                      color: '#64748B',
                      pointerEvents: 'none'
                    }}>
                      ⌘K
                    </div>
                  </div>

                  {/* Right: Action Buttons Grouped Together */}
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap', flexShrink: 0 }}>
                    <button
                      onClick={() => { setActiveTab('platform-control'); setCtrlSubTab('platform-dashboard'); }}
                      style={{
                        background: '#FFFFFF',
                        border: '1px solid #C7D2FE',
                        color: '#4338CA',
                        padding: '8px 14px',
                        height: '38px',
                        borderRadius: '10px',
                        fontSize: '12px',
                        fontWeight: 700,
                        cursor: 'pointer',
                        transition: 'all 0.15s',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                        boxShadow: '0 1px 3px rgba(79,70,229,0.04)'
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = '#F8FAFC';
                        e.currentTarget.style.borderColor = '#818CF8';
                        e.currentTarget.style.boxShadow = '0 4px 10px rgba(79,70,229,0.1)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = '#FFFFFF';
                        e.currentTarget.style.borderColor = '#C7D2FE';
                        e.currentTarget.style.boxShadow = '0 1px 3px rgba(79,70,229,0.04)';
                      }}
                    >
                      <LucideIcon name="activity" style={{ width: '14px', height: '14px', color: '#4F46E5' }} />
                      Network Status
                    </button>

                    <button
                      onClick={() => setActiveTab('platform-audits')}
                      style={{
                        background: '#FFFFFF',
                        border: '1px solid #C7D2FE',
                        color: '#4338CA',
                        padding: '8px 14px',
                        height: '38px',
                        borderRadius: '10px',
                        fontSize: '12px',
                        fontWeight: 700,
                        cursor: 'pointer',
                        transition: 'all 0.15s',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                        boxShadow: '0 1px 3px rgba(79,70,229,0.04)'
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = '#F8FAFC';
                        e.currentTarget.style.borderColor = '#818CF8';
                        e.currentTarget.style.boxShadow = '0 4px 10px rgba(79,70,229,0.1)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = '#FFFFFF';
                        e.currentTarget.style.borderColor = '#C7D2FE';
                        e.currentTarget.style.boxShadow = '0 1px 3px rgba(79,70,229,0.04)';
                      }}
                    >
                      <LucideIcon name="file-text" style={{ width: '14px', height: '14px', color: '#4F46E5' }} />
                      Logs
                    </button>

                    <button
                      onClick={handleTriggerBackup}
                      style={{
                        background: '#FFFFFF',
                        border: '1px solid #C7D2FE',
                        color: '#4338CA',
                        padding: '8px 14px',
                        height: '38px',
                        borderRadius: '10px',
                        fontSize: '12px',
                        fontWeight: 700,
                        cursor: 'pointer',
                        transition: 'all 0.15s',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                        boxShadow: '0 1px 3px rgba(79,70,229,0.04)'
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = '#F8FAFC';
                        e.currentTarget.style.borderColor = '#818CF8';
                        e.currentTarget.style.boxShadow = '0 4px 10px rgba(79,70,229,0.1)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = '#FFFFFF';
                        e.currentTarget.style.borderColor = '#C7D2FE';
                        e.currentTarget.style.boxShadow = '0 1px 3px rgba(79,70,229,0.04)';
                      }}
                    >
                      <LucideIcon name="database" style={{ width: '14px', height: '14px', color: '#4F46E5' }} />
                      Backup Database
                    </button>

                    <button
                      onClick={() => {
                        setActiveTab('bi-reports');
                        setBiSubTab('bi-dashboard');
                      }}
                      style={{
                        background: 'linear-gradient(135deg, #4F46E5 0%, #7C3AED 100%)',
                        border: 'none',
                        color: '#FFFFFF',
                        padding: '8px 16px',
                        height: '38px',
                        borderRadius: '10px',
                        fontSize: '12px',
                        fontWeight: 750,
                        cursor: 'pointer',
                        transition: 'all 0.15s',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                        boxShadow: '0 4px 12px rgba(79,70,229,0.25)'
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.opacity = '0.92'; e.currentTarget.style.transform = 'translateY(-1px)'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.transform = 'none'; }}
                    >
                      <LucideIcon name="bar-chart-2" style={{ width: '14px', height: '14px' }} />
                      Analytics Desk
                    </button>
                  </div>
                </div>

                {/* 2. TOP 4 KPI CARDS (Matching Admin Dashboard Gradient & Sparkline Language) */}
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
                  gap: '16px',
                  width: '100%',
                  position: 'relative',
                  zIndex: 1
                }}>
                  {/* Card 1: TOTAL HOSPITALS (Electric Blue Gradient with Radial Glow) */}
                  <div 
                    onClick={() => setActiveTab('hospitals')}
                    style={{
                      padding: '20px',
                      borderRadius: '18px',
                      border: '1px solid rgba(191, 219, 254, 0.95)',
                      boxShadow: '0 12px 28px rgba(37, 99, 235, 0.08)',
                      background: 'radial-gradient(circle at 100% 100%, rgba(59, 130, 246, 0.25) 0%, transparent 65%), linear-gradient(135deg, #FFFFFF 0%, #EFF6FF 50%, #DBEAFE 100%)',
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'space-between',
                      position: 'relative',
                      overflow: 'hidden',
                      cursor: 'pointer',
                      transition: 'all 0.2s ease-in-out'
                    }}
                    onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 16px 36px rgba(37, 99, 235, 0.16)'; }}
                    onMouseLeave={e => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = '0 12px 28px rgba(37, 99, 235, 0.08)'; }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <div style={{
                        width: '32px',
                        height: '32px',
                        borderRadius: '10px',
                        background: 'linear-gradient(135deg, #1D4ED8 0%, #3B82F6 100%)',
                        color: '#FFFFFF',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                        boxShadow: '0 4px 10px rgba(37, 99, 235, 0.3)'
                      }}>
                        <LucideIcon name="building-2" style={{ width: '17px', height: '17px' }} />
                      </div>
                      <span style={{ fontSize: '10.5px', fontWeight: 800, color: '#1E3A8A', textTransform: 'uppercase', letterSpacing: '0.6px' }}>
                        TOTAL HOSPITALS
                      </span>
                    </div>

                    <div style={{ marginTop: '16px', display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
                      <div>
                        <div style={{ fontSize: '30px', fontWeight: 900, color: '#0F172A', letterSpacing: '-1px', lineHeight: 1 }}>
                          {hospitals.length}
                        </div>
                        <div style={{ fontSize: '11.5px', color: '#1D4ED8', fontWeight: 750, marginTop: '8px', whiteSpace: 'nowrap' }}>
                          +{hospitals.length} provisioned in registry
                        </div>
                      </div>

                      {/* Blue Mini Sparkline */}
                      <div style={{ width: '64px', height: '32px', flexShrink: 0, position: 'relative' }}>
                        <svg style={{ width: '100%', height: '100%', overflow: 'visible' }} viewBox="0 0 64 32">
                          <defs>
                            <linearGradient id="kpiBlueGradSuperAdmin" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor="#2563EB" stopOpacity="0.45"/>
                              <stop offset="100%" stopColor="#2563EB" stopOpacity="0.05"/>
                            </linearGradient>
                          </defs>
                          <path d="M 0 24 Q 16 26, 24 16 T 40 18 T 52 8 T 64 12 L 64 32 L 0 32 Z" fill="url(#kpiBlueGradSuperAdmin)" />
                          <path d="M 0 24 Q 16 26, 24 16 T 40 18 T 52 8 T 64 12" fill="none" stroke="#2563EB" strokeWidth="2.4" strokeLinecap="round" />
                        </svg>
                      </div>
                    </div>

                    {/* Bottom Accent Line */}
                    <div style={{
                      height: '4px',
                      borderBottomRightRadius: '18px',
                      position: 'absolute',
                      bottom: 0,
                      right: 0,
                      width: '60%',
                      pointerEvents: 'none',
                      background: 'linear-gradient(90deg, transparent 0%, #2563EB 100%)'
                    }} />
                  </div>

                  {/* Card 2: ACTIVE HOSPITALS (Teal / Emerald Gradient with Radial Glow) */}
                  <div 
                    onClick={() => setActiveTab('hospitals')}
                    style={{
                      padding: '20px',
                      borderRadius: '18px',
                      border: '1px solid rgba(153, 246, 228, 0.95)',
                      boxShadow: '0 12px 28px rgba(13, 148, 136, 0.08)',
                      background: 'radial-gradient(circle at 0% 0%, rgba(13, 148, 136, 0.25) 0%, transparent 65%), linear-gradient(135deg, #FFFFFF 0%, #F0FDFA 50%, #CCFBF1 100%)',
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'space-between',
                      position: 'relative',
                      overflow: 'hidden',
                      cursor: 'pointer',
                      transition: 'all 0.2s ease-in-out'
                    }}
                    onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 16px 36px rgba(13, 148, 136, 0.16)'; }}
                    onMouseLeave={e => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = '0 12px 28px rgba(13, 148, 136, 0.08)'; }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <div style={{
                        width: '32px',
                        height: '32px',
                        borderRadius: '10px',
                        background: 'linear-gradient(135deg, #0F766E 0%, #14B8A6 100%)',
                        color: '#FFFFFF',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                        boxShadow: '0 4px 10px rgba(13, 148, 136, 0.3)'
                      }}>
                        <LucideIcon name="activity" style={{ width: '17px', height: '17px' }} />
                      </div>
                      <span style={{ fontSize: '10.5px', fontWeight: 800, color: '#115E59', textTransform: 'uppercase', letterSpacing: '0.6px' }}>
                        ACTIVE HOSPITALS
                      </span>
                    </div>

                    <div style={{ marginTop: '16px', display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
                      <div>
                        <div style={{ fontSize: '30px', fontWeight: 900, color: '#0F172A', letterSpacing: '-1px', lineHeight: 1 }}>
                          {hospitals.filter(h => h.status === 'Active').length} <span style={{ fontSize: '17px', fontWeight: 700, color: '#64748B' }}>/ {hospitals.length}</span>
                        </div>
                        <div style={{ fontSize: '11.5px', color: '#0F766E', fontWeight: 750, marginTop: '8px', whiteSpace: 'nowrap' }}>
                          {hospitals.length > 0 ? `${Math.round((hospitals.filter(h => h.status === 'Active').length / hospitals.length) * 100)}% operational rate` : '100% operational'}
                        </div>
                      </div>

                      {/* Teal Mini Sparkline */}
                      <div style={{ width: '64px', height: '32px', flexShrink: 0, position: 'relative' }}>
                        <svg style={{ width: '100%', height: '100%', overflow: 'visible' }} viewBox="0 0 64 32">
                          <defs>
                            <linearGradient id="kpiTealGradSuperAdmin" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor="#0D9488" stopOpacity="0.45"/>
                              <stop offset="100%" stopColor="#0D9488" stopOpacity="0.05"/>
                            </linearGradient>
                          </defs>
                          <path d="M 0 26 Q 16 26, 26 24 T 42 16 T 54 8 T 64 12 L 64 32 L 0 32 Z" fill="url(#kpiTealGradSuperAdmin)" />
                          <path d="M 0 26 Q 16 26, 26 24 T 42 16 T 54 8 T 64 12" fill="none" stroke="#0D9488" strokeWidth="2.4" strokeLinecap="round" />
                        </svg>
                      </div>
                    </div>

                    {/* Bottom Accent Line */}
                    <div style={{
                      height: '4px',
                      borderBottomRightRadius: '18px',
                      position: 'absolute',
                      bottom: 0,
                      right: 0,
                      width: '60%',
                      pointerEvents: 'none',
                      background: 'linear-gradient(90deg, transparent 0%, #0D9488 100%)'
                    }} />
                  </div>

                  {/* Card 3: OPEN TICKETS (Rose / Red Gradient with Radial Glow) */}
                  <div 
                    onClick={() => { setActiveTab('support-success'); setSupportSubTab('support-dashboard'); }}
                    style={{
                      padding: '20px',
                      borderRadius: '18px',
                      border: '1px solid rgba(254, 205, 211, 0.95)',
                      boxShadow: '0 12px 28px rgba(225, 29, 72, 0.08)',
                      background: 'radial-gradient(circle at 100% 0%, rgba(225, 29, 72, 0.20) 0%, transparent 65%), linear-gradient(135deg, #FFFFFF 0%, #FFF1F2 50%, #FFE4E6 100%)',
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'space-between',
                      position: 'relative',
                      overflow: 'hidden',
                      cursor: 'pointer',
                      transition: 'all 0.2s ease-in-out'
                    }}
                    onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 16px 36px rgba(225, 29, 72, 0.16)'; }}
                    onMouseLeave={e => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = '0 12px 28px rgba(225, 29, 72, 0.08)'; }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <div style={{
                        width: '32px',
                        height: '32px',
                        borderRadius: '10px',
                        background: 'linear-gradient(135deg, #BE123C 0%, #F43F5E 100%)',
                        color: '#FFFFFF',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                        boxShadow: '0 4px 10px rgba(225, 29, 72, 0.3)'
                      }}>
                        <LucideIcon name="ticket" style={{ width: '17px', height: '17px' }} />
                      </div>
                      <span style={{ fontSize: '10.5px', fontWeight: 800, color: '#881337', textTransform: 'uppercase', letterSpacing: '0.6px' }}>
                        OPEN TICKETS
                      </span>
                    </div>

                    <div style={{ marginTop: '16px', display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
                      <div>
                        <div style={{ fontSize: '30px', fontWeight: 900, color: '#0F172A', letterSpacing: '-1px', lineHeight: 1 }}>
                          {tickets.filter(t => t.status === 'Open').length}
                        </div>
                        <div style={{ fontSize: '11.5px', color: '#BE123C', fontWeight: 750, marginTop: '8px', whiteSpace: 'nowrap' }}>
                          {tickets.filter(t => t.status === 'Open').length === 0 ? '0 pending · SLA 100%' : `${tickets.filter(t => t.status === 'Open').length} active requests`}
                        </div>
                      </div>

                      {/* Rose Mini Sparkline */}
                      <div style={{ width: '64px', height: '32px', flexShrink: 0, position: 'relative' }}>
                        <svg style={{ width: '100%', height: '100%', overflow: 'visible' }} viewBox="0 0 64 32">
                          <defs>
                            <linearGradient id="kpiRoseGradSuperAdmin" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor="#E11D48" stopOpacity="0.45"/>
                              <stop offset="100%" stopColor="#E11D48" stopOpacity="0.05"/>
                            </linearGradient>
                          </defs>
                          <path d="M 0 24 Q 14 26, 26 22 T 40 14 T 52 18 T 64 8 L 64 32 L 0 32 Z" fill="url(#kpiRoseGradSuperAdmin)" />
                          <path d="M 0 24 Q 14 26, 26 22 T 40 14 T 52 18 T 64 8" fill="none" stroke="#E11D48" strokeWidth="2.4" strokeLinecap="round" />
                        </svg>
                      </div>
                    </div>

                    {/* Bottom Accent Line */}
                    <div style={{
                      height: '4px',
                      borderBottomRightRadius: '18px',
                      position: 'absolute',
                      bottom: 0,
                      right: 0,
                      width: '60%',
                      pointerEvents: 'none',
                      background: 'linear-gradient(90deg, transparent 0%, #E11D48 100%)'
                    }} />
                  </div>

                  {/* Card 4: MONTHLY RECURRING REVENUE (Purple / Violet Gradient with Radial Glow) */}
                  {(() => {
                    const mrrTotal = invoices.reduce((acc, inv) => acc + (inv.status === 'Paid' ? inv.amount : 0), 0);
                    return (
                      <div 
                        onClick={() => { setActiveTab('finance-mgmt'); setFinSubTab('finance-dashboard'); }}
                        style={{
                          padding: '20px',
                          borderRadius: '18px',
                          border: '1px solid rgba(221, 214, 254, 0.95)',
                          boxShadow: '0 12px 28px rgba(124, 58, 237, 0.08)',
                          background: 'radial-gradient(circle at 0% 100%, rgba(124, 58, 237, 0.25) 0%, transparent 65%), linear-gradient(135deg, #FFFFFF 0%, #F5F3FF 50%, #EDE9FE 100%)',
                          display: 'flex',
                          flexDirection: 'column',
                          justifyContent: 'space-between',
                          position: 'relative',
                          overflow: 'hidden',
                          cursor: 'pointer',
                          transition: 'all 0.2s ease-in-out'
                        }}
                        onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 16px 36px rgba(124, 58, 237, 0.16)'; }}
                        onMouseLeave={e => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = '0 12px 28px rgba(124, 58, 237, 0.08)'; }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <div style={{
                            width: '32px',
                            height: '32px',
                            borderRadius: '10px',
                            background: 'linear-gradient(135deg, #6D28D9 0%, #8B5CF6 100%)',
                            color: '#FFFFFF',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            flexShrink: 0,
                            boxShadow: '0 4px 10px rgba(124, 58, 237, 0.3)'
                          }}>
                            <span style={{ fontSize: '16px', fontWeight: 900, fontFamily: 'sans-serif', lineHeight: 1 }}>₹</span>
                          </div>
                          <span style={{ fontSize: '10.5px', fontWeight: 800, color: '#4C1D95', textTransform: 'uppercase', letterSpacing: '0.6px' }}>
                            MONTHLY RECURRING REVENUE
                          </span>
                        </div>

                        <div style={{ marginTop: '16px', display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
                          <div>
                            <div style={{ fontSize: '30px', fontWeight: 900, color: '#0F172A', letterSpacing: '-1px', lineHeight: 1 }}>
                              ₹{mrrTotal >= 1000 ? (mrrTotal / 1000).toFixed(1) + 'K' : mrrTotal.toLocaleString('en-IN')}
                            </div>
                            <div style={{ fontSize: '11.5px', color: '#6D28D9', fontWeight: 750, marginTop: '8px', whiteSpace: 'nowrap' }}>
                              +12.4% vs last billing cycle
                            </div>
                          </div>

                          {/* Purple Mini Sparkline */}
                          <div style={{ width: '64px', height: '32px', flexShrink: 0, position: 'relative' }}>
                            <svg style={{ width: '100%', height: '100%', overflow: 'visible' }} viewBox="0 0 64 32">
                              <defs>
                                <linearGradient id="kpiPurpleGradSuperAdmin" x1="0" y1="0" x2="0" y2="1">
                                  <stop offset="0%" stopColor="#8B5CF6" stopOpacity="0.45"/>
                                  <stop offset="100%" stopColor="#8B5CF6" stopOpacity="0.05"/>
                                </linearGradient>
                              </defs>
                              <path d="M 0 26 Q 14 24, 22 22 T 36 10 T 48 18 T 58 6 T 64 10 L 64 32 L 0 32 Z" fill="url(#kpiPurpleGradSuperAdmin)" />
                              <path d="M 0 26 Q 14 24, 22 22 T 36 10 T 48 18 T 58 6 T 64 10" fill="none" stroke="#8B5CF6" strokeWidth="2.4" strokeLinecap="round" />
                            </svg>
                          </div>
                        </div>

                        {/* Bottom Accent Line */}
                        <div style={{
                          height: '4px',
                          borderBottomRightRadius: '18px',
                          position: 'absolute',
                          bottom: 0,
                          right: 0,
                          width: '60%',
                          pointerEvents: 'none',
                          background: 'linear-gradient(90deg, transparent 0%, #7C3AED 100%)'
                        }} />
                      </div>
                    );
                  })()}
                </div>


                {/* 3. MAIN CONTENT ASYMMETRIC GRID (LEFT ~66% / RIGHT ~34%) */}
                <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.85fr) minmax(0, 1fr)', gap: '22px', alignItems: 'start', position: 'relative', zIndex: 1 }}>
                  {/* LEFT COLUMN: RECENT SYSTEM EVENTS & TELEMETRY TIMELINE */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                    <div style={{
                      background: 'radial-gradient(circle at 0% 0%, rgba(59, 130, 246, 0.04) 0%, transparent 60%), linear-gradient(135deg, #FFFFFF 0%, #F8FAFC 100%)',
                      border: '1px solid #E2E8F0',
                      borderRadius: '20px',
                      padding: '24px 26px',
                      boxShadow: '0 10px 25px -4px rgba(15, 23, 42, 0.04), 0 1px 3px rgba(0,0,0,0.02)'
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{ width: '9px', height: '9px', borderRadius: '50%', background: '#2563EB', display: 'inline-block', boxShadow: '0 0 0 3px rgba(37,99,235,0.2)' }} />
                            <h3 style={{ fontSize: '15.5px', fontWeight: 800, color: '#0F172A', margin: 0 }}>Recent System Events &amp; Logs</h3>
                          </div>
                          <span style={{ fontSize: '11.5px', color: '#64748B', marginTop: '3px', display: 'block' }}>Audit log stream — platform administrator operations</span>
                        </div>
                        <button
                          onClick={() => setActiveTab('platform-audits')}
                          style={{
                            background: '#EEF2FF',
                            border: '1px solid #C7D2FE',
                            color: '#4F46E5',
                            fontSize: '11.5px',
                            fontWeight: 750,
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '5px',
                            padding: '7px 14px',
                            borderRadius: '10px',
                            transition: 'all 0.15s',
                            whiteSpace: 'nowrap'
                          }}
                          onMouseEnter={e => { e.currentTarget.style.background = '#E0E7FF'; e.currentTarget.style.borderColor = '#818CF8'; }}
                          onMouseLeave={e => { e.currentTarget.style.background = '#EEF2FF'; e.currentTarget.style.borderColor = '#C7D2FE'; }}
                        >
                          View Full Log <LucideIcon name="arrow-right" style={{ width: '13px', height: '13px' }} />
                        </button>
                      </div>

                      <div style={{ position: 'relative', paddingLeft: '22px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
                        {/* Vertical Timeline Guide Line */}
                        <div style={{
                          position: 'absolute',
                          left: '8px',
                          top: '12px',
                          bottom: '12px',
                          width: '2px',
                          background: 'linear-gradient(180deg, #6366F1 0%, #CBD5E1 100%)'
                        }} />

                        {auditLogs.length === 0 ? (
                          <div style={{ textAlign: 'center', padding: '36px 10px', color: '#64748B', fontSize: '12.5px' }}>
                            <LucideIcon name="activity" style={{ width: '28px', height: '28px', color: '#CBD5E1', margin: '0 auto 8px auto' }} />
                            No recent operational events detected.
                          </div>
                        ) : (
                          auditLogs.slice(0, 4).map((log, index) => {
                            // Semantic color mapping
                            let markerColor = '#64748B';
                            let badgeBg = '#F1F5F9';
                            let badgeColor = '#475569';
                            let badgeBorder = '#E2E8F0';
                            let eventLabel = log.action;

                            const act = (log.action || '').toLowerCase();
                            if (act.includes('invoice') || act.includes('payment') || act.includes('billing')) {
                              markerColor = '#10B981';
                              badgeBg = '#D1FAE5';
                              badgeColor = '#065F46';
                              badgeBorder = '#A7F3D0';
                              eventLabel = 'CREATE_INVOICE';
                            } else if (act.includes('hospital') || act.includes('create') || act.includes('onboard')) {
                              markerColor = '#2563EB';
                              badgeBg = '#DBEAFE';
                              badgeColor = '#1E40AF';
                              badgeBorder = '#BFDBFE';
                              eventLabel = 'UPDATE_HOSPITAL';
                            } else if (act.includes('system') || act.includes('database') || act.includes('backup') || act.includes('purge')) {
                              markerColor = '#7C3AED';
                              badgeBg = '#EDE9FE';
                              badgeColor = '#5B21B6';
                              badgeBorder = '#DDD6FE';
                              eventLabel = 'SYSTEM';
                            } else if (act.includes('ticket') || act.includes('support')) {
                              markerColor = '#F59E0B';
                              badgeBg = '#FEF3C7';
                              badgeColor = '#78350F';
                              badgeBorder = '#FDE68A';
                              eventLabel = 'WARNING';
                            } else if (act.includes('delete') || act.includes('error')) {
                              markerColor = '#EF4444';
                              badgeBg = '#FEE2E2';
                              badgeColor = '#991B1B';
                              badgeBorder = '#FECACA';
                              eventLabel = 'ERROR';
                            }

                            return (
                              <div key={log._id || log.id || index} style={{ display: 'flex', gap: '12px', position: 'relative' }}>
                                {/* Timeline Connected Node */}
                                <div style={{
                                  position: 'absolute',
                                  left: '-22px',
                                  top: '12px',
                                  width: '12px',
                                  height: '12px',
                                  borderRadius: '50%',
                                  background: markerColor,
                                  border: '2px solid #FFFFFF',
                                  boxShadow: `0 0 0 2px ${markerColor}35`,
                                  flexShrink: 0
                                }} />

                                <div style={{
                                  background: index === 0 ? '#F8FAFC' : '#FAFBFD',
                                  borderRadius: '14px',
                                  padding: '13px 18px',
                                  flex: 1,
                                  display: 'flex',
                                  justifyContent: 'space-between',
                                  alignItems: 'flex-start',
                                  border: index === 0 ? '1px solid #E2E8F0' : '1px solid #F1F5F9',
                                  borderLeft: index === 0 ? `3px solid ${markerColor}` : '1px solid #F1F5F9',
                                  transition: 'all 0.15s ease-in-out',
                                  gap: '12px'
                                }}
                                onMouseEnter={(e) => {
                                  e.currentTarget.style.background = '#FFFFFF';
                                  e.currentTarget.style.boxShadow = '0 3px 10px rgba(15,23,42,0.06)';
                                  e.currentTarget.style.borderColor = markerColor + '60';
                                }}
                                onMouseLeave={(e) => {
                                  e.currentTarget.style.background = index === 0 ? '#F8FAFC' : '#FAFBFD';
                                  e.currentTarget.style.boxShadow = 'none';
                                  e.currentTarget.style.borderColor = index === 0 ? '#E2E8F0' : '#F1F5F9';
                                }}
                                >
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', minWidth: 0 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                      <span style={{
                                        fontSize: '9.5px',
                                        fontWeight: 800,
                                        padding: '2px 8px',
                                        borderRadius: '6px',
                                        background: badgeBg,
                                        color: badgeColor,
                                        border: `1px solid ${badgeBorder}`,
                                        textTransform: 'uppercase',
                                        letterSpacing: '0.5px',
                                        whiteSpace: 'nowrap'
                                      }}>
                                        {eventLabel}
                                      </span>
                                      <span style={{ fontSize: '11px', fontWeight: 700, color: '#64748B' }}>
                                        {log.user || 'superadmin'}
                                      </span>
                                    </div>
                                    <span style={{ fontSize: '12.5px', color: '#1E293B', fontWeight: 550, lineHeight: '1.4' }}>
                                      {log.details}
                                    </span>
                                  </div>
                                  <span style={{ fontSize: '11px', color: '#64748B', fontWeight: 650, whiteSpace: 'nowrap', flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>
                                    {log.time || new Date(log.createdAt).toLocaleTimeString()}
                                  </span>
                                </div>
                              </div>
                            );
                          })
                        )}
                      </div>
                    </div>
                  </div>{/* END LEFT COLUMN */}


                  {/* RIGHT COLUMN: PLATFORM HEALTH & STORAGE ALLOCATION */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                    {/* Platform Health Infrastructure Monitor */}
                    <div style={{
                      background: 'radial-gradient(circle at 100% 0%, rgba(13, 148, 136, 0.06) 0%, transparent 60%), linear-gradient(135deg, #FFFFFF 0%, #F8FAFC 100%)',
                      border: '1px solid #E2E8F0',
                      borderRadius: '20px',
                      padding: '24px 26px',
                      boxShadow: '0 10px 25px -4px rgba(15, 23, 42, 0.04), 0 1px 3px rgba(0,0,0,0.02)'
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '2px' }}>
                        <span style={{ width: '9px', height: '9px', borderRadius: '50%', background: '#0D9488', display: 'inline-block', boxShadow: '0 0 0 3px rgba(13,148,136,0.2)' }} />
                        <h3 style={{ fontSize: '15.5px', fontWeight: 800, color: '#0F172A', margin: 0 }}>Platform Health</h3>
                      </div>
                      <span style={{ fontSize: '11.5px', color: '#64748B', display: 'block', marginBottom: '20px' }}>Real-time infrastructure telemetry &amp; resource checks</span>
                      
                      {/* Telemetry Gauge Rings */}
                      <div style={{ display: 'flex', justifyContent: 'space-around', alignItems: 'center', marginBottom: '22px' }}>
                        {/* CPU Load Gauge */}
                        <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                          <div style={{ position: 'relative', width: '82px', height: '82px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <svg width="82" height="82" viewBox="0 0 36 36">
                              <path
                                d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                                fill="none"
                                stroke="#F1F5F9"
                                strokeWidth="3.2"
                              />
                              <path
                                d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                                fill="none"
                                stroke="url(#cpuGrad)"
                                strokeDasharray={`${telemetryCpu}, 100`}
                                strokeWidth="3.2"
                                strokeLinecap="round"
                              />
                              <defs>
                                <linearGradient id="cpuGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                                  <stop offset="0%" stopColor="#4F46E5" />
                                  <stop offset="100%" stopColor="#7C3AED" />
                                </linearGradient>
                              </defs>
                            </svg>
                            <div style={{ position: 'absolute', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                              <span style={{ fontSize: '15px', fontWeight: 900, color: '#0F172A', letterSpacing: '-0.5px' }}>{telemetryCpu}%</span>
                            </div>
                          </div>
                          <span style={{ fontSize: '10.5px', fontWeight: 800, color: '#64748B', marginTop: '6px', textTransform: 'uppercase', letterSpacing: '0.4px' }}>CPU Load</span>
                        </div>

                        {/* Memory Gauge */}
                        <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                          <div style={{ position: 'relative', width: '82px', height: '82px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <svg width="82" height="82" viewBox="0 0 36 36">
                              <path
                                d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                                fill="none"
                                stroke="#F1F5F9"
                                strokeWidth="3.2"
                              />
                              <path
                                d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                                fill="none"
                                stroke="url(#memGrad)"
                                strokeDasharray={`${telemetryMem}, 100`}
                                strokeWidth="3.2"
                                strokeLinecap="round"
                              />
                              <defs>
                                <linearGradient id="memGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                                  <stop offset="0%" stopColor="#06B6D4" />
                                  <stop offset="100%" stopColor="#0D9488" />
                                </linearGradient>
                              </defs>
                            </svg>
                            <div style={{ position: 'absolute', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                              <span style={{ fontSize: '15px', fontWeight: 900, color: '#0F172A', letterSpacing: '-0.5px' }}>{telemetryMem}%</span>
                            </div>
                          </div>
                          <span style={{ fontSize: '10.5px', fontWeight: 800, color: '#64748B', marginTop: '6px', textTransform: 'uppercase', letterSpacing: '0.4px' }}>Memory</span>
                        </div>

                        {/* SLA Rate Gauge */}
                        {(() => {
                          const totalTickets = tickets.length;
                          const breachedTickets = tickets.filter(t => t.slaStatus === 'Breached').length;
                          const slaRate = totalTickets > 0 ? Math.round(((totalTickets - breachedTickets) / totalTickets) * 100) : 100;
                          
                          return (
                            <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                              <div style={{ position: 'relative', width: '82px', height: '82px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <svg width="82" height="82" viewBox="0 0 36 36">
                                  <path
                                    d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                                    fill="none"
                                    stroke="#F1F5F9"
                                    strokeWidth="3.2"
                                  />
                                  <path
                                    d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                                    fill="none"
                                    stroke="url(#slaGrad)"
                                    strokeDasharray={`${slaRate}, 100`}
                                    strokeWidth="3.2"
                                    strokeLinecap="round"
                                  />
                                  <defs>
                                    <linearGradient id="slaGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                                      <stop offset="0%" stopColor="#10B981" />
                                      <stop offset="100%" stopColor="#059669" />
                                    </linearGradient>
                                  </defs>
                                </svg>
                                <div style={{ position: 'absolute', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                                  <span style={{ fontSize: '15px', fontWeight: 900, color: '#0F172A', letterSpacing: '-0.5px' }}>{slaRate}%</span>
                                </div>
                              </div>
                              <span style={{ fontSize: '10.5px', fontWeight: 800, color: '#64748B', marginTop: '6px', textTransform: 'uppercase', letterSpacing: '0.4px' }}>SLA Rate</span>
                            </div>
                          );
                        })()}
                      </div>

                      {/* Database Connection telemetry pill */}
                      <div style={{
                        background: '#F8FAFC',
                        borderRadius: '14px',
                        padding: '13px 18px',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        border: '1px solid #E2E8F0'
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <span style={{
                            position: 'relative',
                            display: 'inline-flex',
                            height: '9px',
                            width: '9px',
                            borderRadius: '50%',
                            background: telemetryDbStatus === 'Healthy' ? '#10B981' : '#EF4444'
                          }}>
                            <span style={{
                              position: 'absolute',
                              display: 'inline-flex',
                              height: '100%',
                              width: '100%',
                              borderRadius: '50%',
                              background: telemetryDbStatus === 'Healthy' ? '#10B981' : '#EF4444',
                              opacity: 0.75,
                              animation: 'ping 1.5s cubic-bezier(0, 0, 0.2, 1) infinite'
                            }} />
                          </span>
                          <span style={{ fontSize: '12.5px', fontWeight: 750, color: '#334155' }}>Database Connection</span>
                        </div>
                        <span style={{
                          fontSize: '10.5px',
                          fontWeight: 800,
                          color: telemetryDbStatus === 'Healthy' ? '#065F46' : '#991B1B',
                          background: telemetryDbStatus === 'Healthy' ? '#D1FAE5' : '#FEE2E2',
                          border: `1px solid ${telemetryDbStatus === 'Healthy' ? '#A7F3D0' : '#FECACA'}`,
                          padding: '3px 10px',
                          borderRadius: '20px',
                          letterSpacing: '0.4px',
                          textTransform: 'uppercase'
                        }}>
                          {telemetryDbStatus}
                        </span>
                      </div>
                    </div>

                    {/* Storage Allocation Subordinate Panel */}
                    {(() => {
                      const totalStorageLimit = hospitals.reduce((sum, h) => sum + (h.limits?.storageLimit || 50), 0);
                      const totalStorageUsed = hospitals.reduce((sum, h) => sum + (h.limits?.storageUsed || 0), 0);
                      const storagePercent = totalStorageLimit > 0 ? (totalStorageUsed / totalStorageLimit) * 100 : 0;
                      
                      return (
                        <div style={{
                          background: 'radial-gradient(circle at 100% 100%, rgba(79, 70, 229, 0.05) 0%, transparent 60%), linear-gradient(135deg, #FFFFFF 0%, #F8FAFC 100%)',
                          border: '1px solid #E2E8F0',
                          borderRadius: '20px',
                          padding: '22px 26px',
                          boxShadow: '0 10px 25px -4px rgba(15, 23, 42, 0.04), 0 1px 3px rgba(0,0,0,0.02)'
                        }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '3px' }}>
                            <h3 style={{ fontSize: '15px', fontWeight: 800, color: '#0F172A', margin: 0 }}>Storage Allocation</h3>
                            <span style={{
                              fontSize: '11px',
                              fontWeight: 800,
                              color: storagePercent > 85 ? '#DC2626' : '#4F46E5',
                              background: storagePercent > 85 ? '#FEF2F2' : '#EEF2FF',
                              border: `1px solid ${storagePercent > 85 ? '#FECACA' : '#C7D2FE'}`,
                              padding: '3px 9px',
                              borderRadius: '20px'
                            }}>
                              {storagePercent.toFixed(1)}% Capacity
                            </span>
                          </div>
                          <span style={{ fontSize: '11px', color: '#64748B', display: 'block', marginBottom: '14px' }}>
                            Cumulative tenant storage usage across active nodes
                          </span>

                          <div style={{ height: '9px', background: '#F1F5F9', borderRadius: '10px', overflow: 'hidden', marginBottom: '10px' }}>
                            <div style={{
                              width: `${Math.min(100, Math.max(5, storagePercent))}%`,
                              height: '100%',
                              background: storagePercent > 85 
                                ? 'linear-gradient(90deg, #F59E0B 0%, #EF4444 100%)'
                                : 'linear-gradient(90deg, #4F46E5 0%, #06B6D4 100%)',
                              borderRadius: '10px',
                              transition: 'width 0.4s ease'
                            }} />
                          </div>

                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11.5px', fontWeight: 700, color: '#64748B' }}>
                            <span><strong>{totalStorageUsed.toFixed(1)} GB</strong> Used</span>
                            <span>of <strong>{totalStorageLimit} GB</strong> Limit</span>
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                </div>

                {/* 4. FLOATING PLATFORM OPERATIONS COMMAND DOCK */}
                <div style={{
                  position: 'fixed',
                  bottom: '22px',
                  left: 'calc(260px + (100vw - 260px) / 2)',
                  transform: 'translateX(-50%)',
                  zIndex: 150,
                  background: 'rgba(255, 255, 255, 0.92)',
                  backdropFilter: 'blur(20px)',
                  WebkitBackdropFilter: 'blur(20px)',
                  border: '1px solid rgba(203, 213, 225, 0.85)',
                  borderRadius: '24px',
                  padding: '6px 12px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  boxShadow: '0 12px 32px -4px rgba(15, 23, 42, 0.12), 0 4px 12px rgba(15, 23, 42, 0.04)'
                }}>
                  {[
                    { title: 'Onboard Hospital', desc: 'Register tenant', icon: 'hospital', action: () => setActiveTab('hospital-onboarding'), color: '#2563EB', bg: '#EFF6FF' },
                    { title: 'Pricing Settings', desc: 'Subscriptions', icon: 'layers', action: () => setActiveTab('subscription-mgmt'), color: '#7C3AED', bg: '#F5F3FF' },
                    { title: 'Broadcast Alerts', desc: 'Notify tenants', icon: 'megaphone', action: () => setActiveTab('broadcast-center'), color: '#D97706', bg: '#FEF3C7' },
                    { title: 'Customer Support', desc: 'SLA tickets', icon: 'headset', action: () => { setActiveTab('support-success'); setSupportSubTab('support-dashboard'); }, color: '#DB2777', bg: '#FDF2F8' },
                    { title: 'Finance & Billing', desc: 'Invoices', icon: 'wallet', action: () => { setActiveTab('finance-mgmt'); setFinSubTab('finance-dashboard'); }, color: '#059669', bg: '#F0FDF4' },
                    { title: 'Employees & HR', desc: 'Staff directory', icon: 'users-2', action: () => { setActiveTab('hr-mgmt'); setHrSubTab('employees-list'); }, color: '#0D9488', bg: '#F0FDFA' },
                    { title: 'Analytics Reports', desc: 'BI telemetry', icon: 'bar-chart-3', action: () => { setActiveTab('bi-reports'); setBiSubTab('bi-dashboard'); }, color: '#4F46E5', bg: '#EEF2FF' }
                  ].map(item => (
                    <button
                      key={item.title}
                      onClick={item.action}
                      title={`${item.title} — ${item.desc}`}
                      style={{
                        width: '38px',
                        height: '38px',
                        borderRadius: '12px',
                        border: '1px solid transparent',
                        background: 'transparent',
                        color: item.color,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        cursor: 'pointer',
                        transition: 'all 0.18s ease-in-out',
                        position: 'relative'
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = item.bg;
                        e.currentTarget.style.borderColor = item.color + '40';
                        e.currentTarget.style.transform = 'translateY(-2px) scale(1.06)';
                        e.currentTarget.style.boxShadow = `0 4px 10px ${item.color}25`;
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = 'transparent';
                        e.currentTarget.style.borderColor = 'transparent';
                        e.currentTarget.style.transform = 'none';
                        e.currentTarget.style.boxShadow = 'none';
                      }}
                    >
                      <LucideIcon name={item.icon} style={{ width: '17px', height: '17px' }} />
                    </button>
                  ))}

                  {/* Dock Divider */}
                  <div style={{ width: '1px', height: '22px', background: '#E2E8F0', margin: '0 4px' }} />

                  {/* Platform Settings Button in Dock */}
                  <button
                    onClick={() => { setActiveTab('platform-control'); setCtrlSubTab('platform-dashboard'); }}
                    title="Platform Control — System telemetry & configuration"
                    style={{
                      width: '38px',
                      height: '38px',
                      borderRadius: '12px',
                      border: '1px solid transparent',
                      background: 'transparent',
                      color: '#475569',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer',
                      transition: 'all 0.18s ease-in-out'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = '#F1F5F9';
                      e.currentTarget.style.borderColor = '#CBD5E1';
                      e.currentTarget.style.transform = 'translateY(-2px) scale(1.06)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = 'transparent';
                      e.currentTarget.style.borderColor = 'transparent';
                      e.currentTarget.style.transform = 'none';
                    }}
                  >
                    <LucideIcon name="settings-2" style={{ width: '17px', height: '17px' }} />
                  </button>
                </div>
              </div>
            )}



            {/* HOSPITAL ONBOARDING TAB */}
            {isTabAllowed && activeTab === 'hospital-onboarding' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', height: 'calc(100vh - 104px)', padding: '24px', overflow: 'hidden' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px' }}>
                  <div>
                    <h2 style={{ ...styles.cardHeaderTitle, margin: 0 }}>Hospital Onboarding Engine</h2>
                    <p style={{ ...styles.cardHeaderSub, margin: '2px 0 0 0' }}>Manage verification checklists, document validation, and administrator provisioning.</p>
                  </div>
                  <button 
                    style={{ ...styles.btnPrimary, padding: '10px 16px', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '8px' }} 
                    onClick={handleAutoCreateOnboarding}
                  >
                    <LucideIcon name="plus" style={{ width: '16px', height: '16px' }} />
                    Add Hospital for Onboarding
                  </button>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '360px 1fr', gap: '20px', flex: 1, overflow: 'hidden', minHeight: 0 }}>
                  {/* LEFT COLUMN: ONBOARDING PIPELINE LIST */}
                  <div style={{ display: 'flex', flexDirection: 'column', background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '12px', overflow: 'hidden' }}>
                    <div style={{ padding: '14px 16px', borderBottom: '1px solid #F1F5F9', background: '#FAF9F6' }}>
                      {(() => {
                        const activeOnboardings = onboardingHospitals.filter(h => h.isActivated !== true && h.status !== 'Completed' && h.status !== 'Live');
                        return (
                          <span style={{ fontSize: '11px', fontWeight: 800, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Active Onboarding Pipeline ({activeOnboardings.length})</span>
                        );
                      })()}
                    </div>
                    <div style={{ flex: 1, overflowY: 'auto', padding: '14px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      {(() => {
                        const activeOnboardings = onboardingHospitals.filter(h => h.isActivated !== true && h.status !== 'Completed' && h.status !== 'Live');
                        return activeOnboardings.length === 0 ? (
                          <div style={{ textAlign: 'center', padding: '40px 20px', color: '#64748B', fontSize: '12.5px' }}>
                            <LucideIcon name="info" style={{ width: '32px', height: '32px', color: '#CBD5E1', margin: '0 auto 10px auto' }} />
                            No hospitals in onboarding pipeline.
                          </div>
                        ) : (
                          activeOnboardings.map(h => {
                            const isSelected = selectedOnboardingHospital && selectedOnboardingHospital._id === h._id;
                            return (
                              <div 
                                key={h._id} 
                                onClick={() => setSelectedOnboardingHospital(h)}
                                style={{
                                  border: isSelected ? '2px solid #2563EB' : '1px solid #E2E8F0',
                                  background: isSelected ? '#F0F6FF' : '#FFFFFF',
                                  borderRadius: '10px',
                                  padding: '14px',
                                  cursor: 'pointer',
                                  transition: 'all 0.15s ease-in-out',
                                  boxShadow: isSelected ? '0 4px 6px -1px rgba(37, 99, 235, 0.1)' : 'none'
                                }}
                              >
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                                  <h4 style={{ margin: 0, fontSize: '14px', fontWeight: 800, color: '#1E293B' }}>{h.name}</h4>
                                  <span style={{ 
                                    padding: '2px 8px', 
                                    fontSize: '10px', 
                                    fontWeight: 800, 
                                    borderRadius: '12px',
                                    background: h.stage === 'Go Live' ? '#D1FAE5' : h.stage === 'Configuration' ? '#FEF3C7' : '#EFF6FF',
                                    color: h.stage === 'Go Live' ? '#065F46' : h.stage === 'Configuration' ? '#92400E' : '#1E40AF'
                                  }}>
                                    {h.stage}
                                  </span>
                                </div>
                                
                                <p style={{ fontSize: '11px', color: '#64748B', margin: '4px 0' }}>Lead Exec: <strong>{h.exec}</strong></p>
                                
                                <div style={{ marginTop: '10px' }}>
                                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10.5px', color: '#475569', marginBottom: '4px' }}>
                                    <span>Milestones Verified</span>
                                    <strong>{h.progress}%</strong>
                                  </div>
                                  <div style={{ height: '6px', background: isSelected ? '#DBEAFE' : '#E2E8F0', borderRadius: '3px', overflow: 'hidden' }}>
                                    <div style={{ width: `${h.progress}%`, height: '100%', background: '#2563EB', transition: 'width 0.3s ease' }}></div>
                                  </div>
                                </div>
                              </div>
                            );
                          })
                        );
                      })()}
                    </div>
                  </div>

                  {/* RIGHT COLUMN: DETAILED VERIFICATION PANEL */}
                  <div style={{ display: 'flex', flexDirection: 'column', background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '12px', overflow: 'hidden' }}>
                    {!selectedOnboardingHospital ? (
                      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px', color: '#64748B', textAlign: 'center' }}>
                        <div style={{ padding: '20px', borderRadius: '50%', background: '#F8FAFC', marginBottom: '16px' }}>
                          <LucideIcon name="file-text" style={{ width: '48px', height: '48px', color: '#94A3B8' }} />
                        </div>
                        <h3 style={{ fontSize: '16px', fontWeight: 800, color: '#1E293B', margin: '0 0 8px 0' }}>Review Verification Dossier</h3>
                        <p style={{ fontSize: '13px', color: '#64748B', maxWidth: '380px', margin: 0 }}>
                          Select a hospital from the onboarding pipeline list on the left to verify credentials and provision admin access.
                        </p>
                      </div>
                    ) : (
                      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
                        {/* Dossier Header */}
                        <div style={{ padding: '16px 24px', borderBottom: '1px solid #F1F5F9', background: '#FAF9F6', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <div>
                            <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 800, color: '#1E293B' }}>
                              {(() => {
                                const rawName = selectedOnboardingHospital.name?.trim() || 'New Hospital Setup';
                                return rawName.toLowerCase().endsWith('onboarding') ? `${rawName} Details` : `${rawName} Onboarding Details`;
                              })()}
                            </h3>
                            <div style={{ display: 'flex', gap: '12px', marginTop: '4px', fontSize: '11.5px', color: '#64748B' }}>
                              <span>Priority: <strong style={{ color: selectedOnboardingHospital.priority === 'High' ? '#EF4444' : '#64748B' }}>{selectedOnboardingHospital.priority}</strong></span>
                              <span>•</span>
                              <span>Days Left: <strong>{(() => {
                                const cDate = selectedOnboardingHospital.createdAt ? new Date(selectedOnboardingHospital.createdAt) : new Date();
                                const elapsed = Math.floor((Date.now() - cDate.getTime()) / (1000 * 60 * 60 * 24));
                                return Math.max(0, 14 - elapsed);
                              })()} days</strong></span>
                            </div>
                          </div>
                          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                            <button 
                              style={{ border: 'none', background: '#2563EB', color: '#FFF', padding: '6px 12px', borderRadius: '6px', fontSize: '11px', fontWeight: 700, cursor: 'pointer' }}
                              onClick={() => {
                                setWizardHospital(selectedOnboardingHospital);
                                setWizardStep(selectedOnboardingHospital.currentStep || 1);
                                setIsOnboardingWizardOpen(true);
                              }}
                            >
                              Launch Onboarding Wizard
                            </button>
                            <button 
                              style={{ border: '1px solid #EF4444', background: '#FFF', color: '#EF4444', padding: '6px 12px', borderRadius: '6px', fontSize: '11px', fontWeight: 700, cursor: 'pointer', opacity: isDeleting ? 0.6 : 1, pointerEvents: isDeleting ? 'none' : 'auto' }}
                              disabled={isDeleting}
                              onClick={() => {
                                setIsDeleteModalOpen(true);
                              }}
                            >
                              {isDeleting ? (
                                <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                  <LucideIcon name="loader-2" className="animate-spin" style={{ width: '12px', height: '12px' }} />
                                  Deleting...
                                </span>
                              ) : 'Delete Dossier'}
                            </button>
                          </div>
                        </div>

                        {/* Dossier Steps List */}
                        <div style={{ flex: 1, overflowY: 'auto', padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
                          {/* Progress Header */}
                          <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '10px', padding: '16px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                              <span style={{ fontSize: '12px', fontWeight: 800, color: '#334155' }}>Verification Milestones Met</span>
                              <span style={{ fontSize: '14px', fontWeight: 900, color: '#2563EB' }}>{selectedOnboardingHospital.progress}% Completed</span>
                            </div>
                            <div style={{ height: '8px', background: '#E2E8F0', borderRadius: '4px', overflow: 'hidden' }}>
                              <div style={{ width: `${selectedOnboardingHospital.progress}%`, height: '100%', background: '#2563EB', transition: 'width 0.4s ease' }}></div>
                            </div>
                          </div>

                          {/* Step 1: PAN & GST */}
                          <div style={{ border: '1px solid #E2E8F0', borderRadius: '10px', padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <div style={{ 
                                  width: '24px', 
                                  height: '24px', 
                                  borderRadius: '50%', 
                                  background: selectedOnboardingHospital.panGstStatus === 'Approved' ? '#D1FAE5' : '#FEF3C7',
                                  display: 'flex', 
                                  alignItems: 'center', 
                                  justifyContent: 'center' 
                                }}>
                                  <LucideIcon 
                                    name={selectedOnboardingHospital.panGstStatus === 'Approved' ? 'check' : 'file-text'} 
                                    style={{ width: '13px', height: '13px', color: selectedOnboardingHospital.panGstStatus === 'Approved' ? '#059669' : '#D97706' }} 
                                  />
                                </div>
                                <span style={{ fontSize: '13.5px', fontWeight: 800, color: '#1E293B' }}>1. Tax Credentials & Document Collection</span>
                              </div>
                              <span style={{ 
                                fontSize: '10.5px', 
                                fontWeight: 800, 
                                padding: '2px 8px', 
                                borderRadius: '12px',
                                background: selectedOnboardingHospital.panGstStatus === 'Approved' ? '#E1F5FE' : selectedOnboardingHospital.panGstStatus === 'Rejected' ? '#FEE2E2' : '#F5F5F5',
                                color: selectedOnboardingHospital.panGstStatus === 'Approved' ? '#0288D1' : selectedOnboardingHospital.panGstStatus === 'Rejected' ? '#EF4444' : '#616161'
                              }}>
                                {selectedOnboardingHospital.panGstStatus || 'Pending'}
                              </span>
                            </div>

                            <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '8px', padding: '12px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                                <div>
                                  <span style={{ fontSize: '9.5px', color: '#94A3B8', fontWeight: 700 }}>PAN NUMBER</span>
                                  <div style={{ fontSize: '12.5px', fontWeight: 750, color: '#334155' }}>{selectedOnboardingHospital.panNumber || 'Not Provided'}</div>
                                </div>
                                <div>
                                  <span style={{ fontSize: '9.5px', color: '#94A3B8', fontWeight: 700 }}>GSTIN</span>
                                  <div style={{ fontSize: '12.5px', fontWeight: 750, color: '#334155' }}>{selectedOnboardingHospital.gstin || 'Not Provided'}</div>
                                </div>
                              </div>

                              <div style={{ borderTop: '1px solid #E2E8F0', paddingTop: '10px', marginTop: '4px' }}>
                                <span style={{ fontSize: '9.5px', color: '#94A3B8', fontWeight: 700, display: 'block', marginBottom: '6px' }}>SUBMITTED FILE ATTACHMENTS</span>
                                <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                                  {selectedOnboardingHospital.complianceDocuments && selectedOnboardingHospital.complianceDocuments.length > 0 ? (
                                    selectedOnboardingHospital.complianceDocuments.map((doc, idx) => (
                                      <a 
                                        key={idx}
                                        href={doc.url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        style={{ textDecoration: 'none', border: '1px solid #E2E8F0', background: '#FFF', borderRadius: '6px', padding: '8px 10px', display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}
                                      >
                                        <LucideIcon name="file" style={{ width: '16px', height: '16px', color: '#3B82F6' }} />
                                        <span style={{ fontSize: '11px', fontWeight: 700, color: '#475569' }}>{doc.filename}</span>
                                      </a>
                                    ))
                                  ) : (
                                    <span style={{ fontSize: '11px', color: '#94A3B8', fontStyle: 'italic' }}>No documents uploaded.</span>
                                  )}
                                </div>
                              </div>
                            </div>


                          </div>

                          {/* Step 2: Corporate Entity Check */}
                          <div style={{ border: '1px solid #E2E8F0', borderRadius: '10px', padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <div style={{ 
                                  width: '24px', 
                                  height: '24px', 
                                  borderRadius: '50%', 
                                  background: selectedOnboardingHospital.entityStatus === 'Approved' ? '#D1FAE5' : '#FEF3C7',
                                  display: 'flex', 
                                  alignItems: 'center', 
                                  justifyContent: 'center' 
                                }}>
                                  <LucideIcon 
                                    name={selectedOnboardingHospital.entityStatus === 'Approved' ? 'check' : 'shield'} 
                                    style={{ width: '13px', height: '13px', color: selectedOnboardingHospital.entityStatus === 'Approved' ? '#059669' : '#D97706' }} 
                                  />
                                </div>
                                <span style={{ fontSize: '13.5px', fontWeight: 800, color: '#1E293B' }}>2. Corporate Entity Check & Registry Audit</span>
                              </div>
                              <span style={{ 
                                fontSize: '10.5px', 
                                fontWeight: 800, 
                                padding: '2px 8px', 
                                borderRadius: '12px',
                                background: selectedOnboardingHospital.entityStatus === 'Approved' ? '#E1F5FE' : selectedOnboardingHospital.entityStatus === 'Rejected' ? '#FEE2E2' : '#F5F5F5',
                                color: selectedOnboardingHospital.entityStatus === 'Approved' ? '#0288D1' : selectedOnboardingHospital.entityStatus === 'Rejected' ? '#EF4444' : '#616161'
                              }}>
                                {selectedOnboardingHospital.entityStatus || 'Pending'}
                              </span>
                            </div>

                            <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '8px', padding: '12px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                                <div>
                                  <span style={{ fontSize: '9.5px', color: '#94A3B8', fontWeight: 700 }}>CIN (CORPORATE ID)</span>
                                  <div style={{ fontSize: '12.5px', fontWeight: 750, color: '#334155' }}>{selectedOnboardingHospital.corpId || 'Not Provided'}</div>
                                </div>
                                <div>
                                  <span style={{ fontSize: '9.5px', color: '#94A3B8', fontWeight: 700 }}>AUTHORIZED SIGNATORY</span>
                                  <div style={{ fontSize: '12.5px', fontWeight: 750, color: '#334155' }}>{selectedOnboardingHospital.signatoryName || 'Not Provided'}</div>
                                </div>
                              </div>

                              <div style={{ borderTop: '1px solid #E2E8F0', paddingTop: '10px', marginTop: '4px' }}>
                                <span style={{ fontSize: '9.5px', color: '#94A3B8', fontWeight: 700, display: 'block', marginBottom: '6px' }}>SUBMITTED FILE ATTACHMENTS</span>
                                <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                                  {selectedOnboardingHospital.complianceDocuments && selectedOnboardingHospital.complianceDocuments.length > 0 ? (
                                    selectedOnboardingHospital.complianceDocuments.map((doc, idx) => (
                                      <a 
                                        key={idx}
                                        href={doc.url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        style={{ textDecoration: 'none', border: '1px solid #E2E8F0', background: '#FFF', borderRadius: '6px', padding: '8px 10px', display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}
                                      >
                                        <LucideIcon name="file" style={{ width: '16px', height: '16px', color: '#7C3AED' }} />
                                        <span style={{ fontSize: '11px', fontWeight: 700, color: '#475569' }}>{doc.filename}</span>
                                      </a>
                                    ))
                                  ) : (
                                    <span style={{ fontSize: '11px', color: '#94A3B8', fontStyle: 'italic' }}>No documents uploaded.</span>
                                  )}
                                </div>
                              </div>
                            </div>


                          </div>

                          {/* Step 3: Admin Accounts Provisioned */}
                          <div style={{ border: '1px solid #E2E8F0', borderRadius: '10px', padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <div style={{ 
                                  width: '24px', 
                                  height: '24px', 
                                  borderRadius: '50%', 
                                  background: selectedOnboardingHospital.adminStatus === 'Approved' ? '#D1FAE5' : '#FEF3C7',
                                  display: 'flex', 
                                  alignItems: 'center', 
                                  justifyContent: 'center' 
                                }}>
                                  <LucideIcon 
                                    name={selectedOnboardingHospital.adminStatus === 'Approved' ? 'check' : 'user'} 
                                    style={{ width: '13px', height: '13px', color: selectedOnboardingHospital.adminStatus === 'Approved' ? '#059669' : '#D97706' }} 
                                  />
                                </div>
                                <span style={{ fontSize: '13.5px', fontWeight: 800, color: '#1E293B' }}>3. Administrator Credentials Provisioned</span>
                              </div>
                              <span style={{ 
                                fontSize: '10.5px', 
                                fontWeight: 800, 
                                padding: '2px 8px', 
                                borderRadius: '12px',
                                background: selectedOnboardingHospital.adminStatus === 'Approved' ? '#E1F5FE' : '#F5F5F5',
                                color: selectedOnboardingHospital.adminStatus === 'Approved' ? '#0288D1' : '#616161'
                              }}>
                                {selectedOnboardingHospital.adminStatus || 'Pending'}
                              </span>
                            </div>

                            <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '8px', padding: '12px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                                <div>
                                  <span style={{ fontSize: '9.5px', color: '#94A3B8', fontWeight: 700 }}>ADMINISTRATOR NAME</span>
                                  <div style={{ fontSize: '12.5px', fontWeight: 750, color: '#334155' }}>{selectedOnboardingHospital.adminName || 'Not Provided'}</div>
                                </div>
                                <div>
                                  <span style={{ fontSize: '9.5px', color: '#94A3B8', fontWeight: 700 }}>ADMINISTRATOR EMAIL</span>
                                  <div style={{ fontSize: '12.5px', fontWeight: 750, color: '#334155' }}>{selectedOnboardingHospital.adminEmail || 'Not Provided'}</div>
                                </div>
                              </div>

                              <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginTop: '4px' }}>
                                <button 
                                  type="button" 
                                  style={{
                                    border: '1px solid #CBD5E1',
                                    background: '#FFF',
                                    borderRadius: '6px',
                                    padding: '6px 12px',
                                    fontSize: '11px',
                                    fontWeight: 700,
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '6px'
                                  }}
                                  onClick={() => handleProvisionAdmin(selectedOnboardingHospital._id)}
                                >
                                  {provisioningId === selectedOnboardingHospital._id ? (
                                    <span className="spinner" style={{ display: 'inline-block', width: '10px', height: '10px', border: '2px solid #64748B', borderTopColor: 'transparent', borderRadius: '50%' }}></span>
                                  ) : (
                                    <LucideIcon name="mail" style={{ width: '12px', height: '12px' }} />
                                  )}
                                  Dispatch SMTP Invite
                                </button>
                                {(provisionedId === selectedOnboardingHospital._id || selectedOnboardingHospital.adminStatus === 'Approved') && (
                                  <span style={{ fontSize: '11.5px', fontWeight: 750, color: '#059669' }}>
                                    ✓ Invites Sent
                                  </span>
                                )}
                              </div>
                            </div>


                          </div>
                        </div>

                        {/* Dossier Footer / Activation Trigger */}
                        {selectedOnboardingHospital.progress >= 100 && (
                          <div style={{ padding: '20px 24px', borderTop: '1px solid #E2E8F0', background: '#ECFDF5', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                              <LucideIcon name="award" style={{ width: '22px', height: '22px', color: '#10B981' }} />
                              <span style={{ fontSize: '13px', fontWeight: 800, color: '#065F46' }}>Ready for activation and subscription provisioning!</span>
                            </div>
                            <button 
                              style={{ ...styles.btnPrimary, background: '#10B981', padding: '10px 18px', fontSize: '12.5px', fontWeight: 800 }} 
                              onClick={() => {
                                setActivateForm({
                                  code: `MED-${selectedOnboardingHospital.name.replace(/\s+/g, '-').toUpperCase().slice(0, 5)}-${Math.floor(100 + Math.random() * 900)}`,
                                  plan: getFormattedPlanString(selectedOnboardingHospital.subscriptionPlan, selectedOnboardingHospital.billingCycle),
                                  csm: 'Platform Admin',
                                  gst: selectedOnboardingHospital.gstin || '27AAAAA1111A1Z1',
                                  isGstVerified: true,
                                  gstVerificationDetails: {
                                    verifiedAt: 'Current Verification Check',
                                    tradeName: selectedOnboardingHospital.name,
                                    address: 'Hospital Registration Address'
                                  },
                                  license: 'DL-293849/2026',
                                  isLicenseVerified: true,
                                  licenseVerificationDetails: {
                                    verifiedAt: 'Current Verification Check',
                                    licenseeName: selectedOnboardingHospital.name,
                                    validUntil: 'December 31, 2031'
                                  },
                                  address: 'Hospital Registration Address',
                                  adminName: selectedOnboardingHospital.adminName || `Admin ${selectedOnboardingHospital.name}`,
                                  adminEmail: selectedOnboardingHospital.adminEmail || 'admin@hospital.com',
                                  adminPhone: selectedOnboardingHospital.adminPhone || '9988776655',
                                  adminPassword: selectedOnboardingHospital.adminPassword || ''
                                });
                                setIsActivateModalOpen(true);
                              }}
                            >
                              Activate Subscription & Go Live
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* HOSPITALS TAB */}
            {isTabAllowed && activeTab === 'hospitals' && (() => {
              const filteredHospitals = hospitals.filter(hosp => {
                const term = hospitalSearch.toLowerCase().trim();
                const matchesSearch = !term || (
                  hosp.name.toLowerCase().includes(term) ||
                  hosp.code.toLowerCase().includes(term) ||
                  (hosp.csm && hosp.csm.toLowerCase().includes(term)) ||
                  (hosp.hospitalId && hosp.hospitalId.toLowerCase().includes(term))
                );

                if (!matchesSearch) return false;

                if (hospFilterTab === 'Active') return hosp.status === 'Active';
                if (hospFilterTab === 'Suspended') return hosp.status === 'Suspended';
                if (hospFilterTab === 'High Health') return hosp.healthScore >= 90;
                if (hospFilterTab === 'Needs Attention') return hosp.healthScore < 90;
                return true;
              });

              const itemsPerPage = 10;
              const totalHospPages = Math.ceil(filteredHospitals.length / itemsPerPage) || 1;
              const currentPage = Math.min(hospCurrentPage, totalHospPages);
              const startIndex = (currentPage - 1) * itemsPerPage;
              const endIndex = startIndex + itemsPerPage;
              const paginatedHospitals = filteredHospitals.slice(startIndex, endIndex);

              return (
                <div style={{ ...styles.pageBodyScroll, minHeight: 0, gap: '20px', paddingBottom: '60px' }}>
                  {/* Top Header */}
                  <div>
                    <h2 style={styles.cardHeaderTitle}>Connected Corporate Hospitals Index</h2>
                    <p style={styles.cardHeaderSub}>Review tenant health scores, configure software module gates, manage user limits, or apply suspensions.</p>
                  </div>

                  {/* KPI Metrics Ribbon (FULL WIDTH 100%) */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '16px' }}>
                      {/* Card 1: TOTAL HOSPITALS (Blue Gradient) */}
                      <div
                        style={{
                          padding: '16px 18px',
                          borderRadius: '18px',
                          border: '1px solid rgba(191, 219, 254, 0.95)',
                          boxShadow: '0 10px 25px rgba(37, 99, 235, 0.08)',
                          background: 'radial-gradient(circle at 100% 100%, rgba(59, 130, 246, 0.22) 0%, transparent 65%), linear-gradient(135deg, #FFFFFF 0%, #EFF6FF 50%, #DBEAFE 100%)',
                          display: 'flex',
                          flexDirection: 'column',
                          justifyContent: 'space-between',
                          position: 'relative',
                          overflow: 'hidden',
                          transition: 'all 0.2s ease-in-out'
                        }}
                        onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 14px 30px rgba(37, 99, 235, 0.15)'; }}
                        onMouseLeave={e => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = '0 10px 25px rgba(37, 99, 235, 0.08)'; }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <div style={{
                              width: '28px',
                              height: '28px',
                              borderRadius: '8px',
                              background: 'linear-gradient(135deg, #1D4ED8 0%, #3B82F6 100%)',
                              color: '#FFFFFF',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              flexShrink: 0,
                              boxShadow: '0 3px 8px rgba(37, 99, 235, 0.3)'
                            }}>
                              <LucideIcon name="building-2" style={{ width: '15px', height: '15px' }} />
                            </div>
                            <span style={{ fontSize: '9.5px', fontWeight: 800, color: '#1E3A8A', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                              TOTAL HOSPITALS
                            </span>
                          </div>
                          <span style={{ fontSize: '9.5px', fontWeight: 800, color: '#1D4ED8', background: 'rgba(219, 234, 254, 0.8)', border: '1px solid #BFDBFE', padding: '2px 7px', borderRadius: '12px' }}>
                            +{hospitals.length}
                          </span>
                        </div>

                        <div style={{ marginTop: '12px', display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
                          <div>
                            <div style={{ fontSize: '26px', fontWeight: 900, color: '#0F172A', letterSpacing: '-0.8px', lineHeight: 1 }}>
                              {hospitals.length}
                            </div>
                            <div style={{ fontSize: '10.5px', color: '#1D4ED8', fontWeight: 700, marginTop: '5px', whiteSpace: 'nowrap' }}>
                              All provisioned tenants
                            </div>
                          </div>

                          <div style={{ width: '48px', height: '26px', flexShrink: 0 }}>
                            <svg style={{ width: '100%', height: '100%', overflow: 'visible' }} viewBox="0 0 48 26">
                              <defs>
                                <linearGradient id="kpiHospBlue" x1="0" y1="0" x2="0" y2="1">
                                  <stop offset="0%" stopColor="#2563EB" stopOpacity="0.4"/>
                                  <stop offset="100%" stopColor="#2563EB" stopOpacity="0.05"/>
                                </linearGradient>
                              </defs>
                              <path d="M 0 20 Q 12 22, 18 12 T 30 14 T 40 6 T 48 10 L 48 26 L 0 26 Z" fill="url(#kpiHospBlue)" />
                              <path d="M 0 20 Q 12 22, 18 12 T 30 14 T 40 6 T 48 10" fill="none" stroke="#2563EB" strokeWidth="2.2" strokeLinecap="round" />
                            </svg>
                          </div>
                        </div>

                        <div style={{ height: '3px', position: 'absolute', bottom: 0, right: 0, width: '60%', background: 'linear-gradient(90deg, transparent 0%, #2563EB 100%)' }} />
                      </div>

                      {/* Card 2: ACTIVE TENANTS (Emerald / Teal Gradient) */}
                      <div
                        style={{
                          padding: '16px 18px',
                          borderRadius: '18px',
                          border: '1px solid rgba(153, 246, 228, 0.95)',
                          boxShadow: '0 10px 25px rgba(13, 148, 136, 0.08)',
                          background: 'radial-gradient(circle at 0% 0%, rgba(13, 148, 136, 0.22) 0%, transparent 65%), linear-gradient(135deg, #FFFFFF 0%, #F0FDFA 50%, #CCFBF1 100%)',
                          display: 'flex',
                          flexDirection: 'column',
                          justifyContent: 'space-between',
                          position: 'relative',
                          overflow: 'hidden',
                          transition: 'all 0.2s ease-in-out'
                        }}
                        onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 14px 30px rgba(13, 148, 136, 0.15)'; }}
                        onMouseLeave={e => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = '0 10px 25px rgba(13, 148, 136, 0.08)'; }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <div style={{
                              width: '28px',
                              height: '28px',
                              borderRadius: '8px',
                              background: 'linear-gradient(135deg, #0F766E 0%, #0D9488 100%)',
                              color: '#FFFFFF',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              flexShrink: 0,
                              boxShadow: '0 3px 8px rgba(13, 148, 136, 0.3)'
                            }}>
                              <LucideIcon name="activity" style={{ width: '15px', height: '15px' }} />
                            </div>
                            <span style={{ fontSize: '9.5px', fontWeight: 800, color: '#115E59', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                              ACTIVE TENANTS
                            </span>
                          </div>
                          <span style={{ fontSize: '9.5px', fontWeight: 800, color: '#0F766E', background: 'rgba(204, 251, 241, 0.8)', border: '1px solid #99F6E4', padding: '2px 7px', borderRadius: '12px' }}>
                            Live
                          </span>
                        </div>

                        <div style={{ marginTop: '12px', display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
                          <div>
                            <div style={{ fontSize: '26px', fontWeight: 900, color: '#0F172A', letterSpacing: '-0.8px', lineHeight: 1 }}>
                              {hospitals.filter(h => h.status === 'Active').length}
                            </div>
                            <div style={{ fontSize: '10.5px', color: '#0F766E', fontWeight: 700, marginTop: '5px', whiteSpace: 'nowrap' }}>
                              Responding normally
                            </div>
                          </div>

                          <div style={{ width: '48px', height: '26px', flexShrink: 0 }}>
                            <svg style={{ width: '100%', height: '100%', overflow: 'visible' }} viewBox="0 0 48 26">
                              <defs>
                                <linearGradient id="kpiHospTeal" x1="0" y1="0" x2="0" y2="1">
                                  <stop offset="0%" stopColor="#0D9488" stopOpacity="0.4"/>
                                  <stop offset="100%" stopColor="#0D9488" stopOpacity="0.05"/>
                                </linearGradient>
                              </defs>
                              <path d="M 0 16 Q 10 6, 20 18 T 34 8 T 48 4 L 48 26 L 0 26 Z" fill="url(#kpiHospTeal)" />
                              <path d="M 0 16 Q 10 6, 20 18 T 34 8 T 48 4" fill="none" stroke="#0D9488" strokeWidth="2.2" strokeLinecap="round" />
                            </svg>
                          </div>
                        </div>

                        <div style={{ height: '3px', position: 'absolute', bottom: 0, right: 0, width: '60%', background: 'linear-gradient(90deg, transparent 0%, #0D9488 100%)' }} />
                      </div>

                      {/* Card 3: STANDARD PREMIUM (Purple / Violet Gradient) */}
                      <div
                        style={{
                          padding: '16px 18px',
                          borderRadius: '18px',
                          border: '1px solid rgba(221, 214, 254, 0.95)',
                          boxShadow: '0 10px 25px rgba(124, 58, 237, 0.08)',
                          background: 'radial-gradient(circle at 0% 100%, rgba(124, 58, 237, 0.22) 0%, transparent 65%), linear-gradient(135deg, #FFFFFF 0%, #F5F3FF 50%, #EDE9FE 100%)',
                          display: 'flex',
                          flexDirection: 'column',
                          justifyContent: 'space-between',
                          position: 'relative',
                          overflow: 'hidden',
                          transition: 'all 0.2s ease-in-out'
                        }}
                        onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 14px 30px rgba(124, 58, 237, 0.15)'; }}
                        onMouseLeave={e => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = '0 10px 25px rgba(124, 58, 237, 0.08)'; }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <div style={{
                              width: '28px',
                              height: '28px',
                              borderRadius: '8px',
                              background: 'linear-gradient(135deg, #6D28D9 0%, #8B5CF6 100%)',
                              color: '#FFFFFF',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              flexShrink: 0,
                              boxShadow: '0 3px 8px rgba(124, 58, 237, 0.3)'
                            }}>
                              <LucideIcon name="credit-card" style={{ width: '15px', height: '15px' }} />
                            </div>
                            <span style={{ fontSize: '9.5px', fontWeight: 800, color: '#5B21B6', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                              STANDARD PREMIUM
                            </span>
                          </div>
                          <span style={{ fontSize: '9.5px', fontWeight: 800, color: '#6D28D9', background: 'rgba(237, 233, 254, 0.8)', border: '1px solid #DDD6FE', padding: '2px 7px', borderRadius: '12px' }}>
                            Paid
                          </span>
                        </div>

                        <div style={{ marginTop: '12px', display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
                          <div>
                            <div style={{ fontSize: '26px', fontWeight: 900, color: '#0F172A', letterSpacing: '-0.8px', lineHeight: 1 }}>
                              {hospitals.filter(h => !h.plan?.toLowerCase().includes('enterprise') && !h.plan?.toLowerCase().includes('custom')).length}
                            </div>
                            <div style={{ fontSize: '10.5px', color: '#6D28D9', fontWeight: 700, marginTop: '5px', whiteSpace: 'nowrap' }}>
                              Active standard subscriptions
                            </div>
                          </div>

                          <div style={{ width: '48px', height: '26px', flexShrink: 0 }}>
                            <svg style={{ width: '100%', height: '100%', overflow: 'visible' }} viewBox="0 0 48 26">
                              <defs>
                                <linearGradient id="kpiHospPurple" x1="0" y1="0" x2="0" y2="1">
                                  <stop offset="0%" stopColor="#7C3AED" stopOpacity="0.4"/>
                                  <stop offset="100%" stopColor="#7C3AED" stopOpacity="0.05"/>
                                </linearGradient>
                              </defs>
                              <path d="M 0 20 Q 14 24, 22 14 T 34 16 T 48 6 L 48 26 L 0 26 Z" fill="url(#kpiHospPurple)" />
                              <path d="M 0 20 Q 14 24, 22 14 T 34 16 T 48 6" fill="none" stroke="#7C3AED" strokeWidth="2.2" strokeLinecap="round" />
                            </svg>
                          </div>
                        </div>

                        <div style={{ height: '3px', position: 'absolute', bottom: 0, right: 0, width: '60%', background: 'linear-gradient(90deg, transparent 0%, #7C3AED 100%)' }} />
                      </div>

                      {/* Card 4: ENTERPRISE ELITE (Amber / Orange Gradient) */}
                      <div
                        style={{
                          padding: '16px 18px',
                          borderRadius: '18px',
                          border: '1px solid rgba(254, 215, 170, 0.95)',
                          boxShadow: '0 10px 25px rgba(217, 119, 6, 0.08)',
                          background: 'radial-gradient(circle at 100% 0%, rgba(245, 158, 11, 0.22) 0%, transparent 65%), linear-gradient(135deg, #FFFFFF 0%, #FFFBEB 50%, #FEF3C7 100%)',
                          display: 'flex',
                          flexDirection: 'column',
                          justifyContent: 'space-between',
                          position: 'relative',
                          overflow: 'hidden',
                          transition: 'all 0.2s ease-in-out'
                        }}
                        onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 14px 30px rgba(217, 119, 6, 0.15)'; }}
                        onMouseLeave={e => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = '0 10px 25px rgba(217, 119, 6, 0.08)'; }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <div style={{
                              width: '28px',
                              height: '28px',
                              borderRadius: '8px',
                              background: 'linear-gradient(135deg, #B45309 0%, #F59E0B 100%)',
                              color: '#FFFFFF',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              flexShrink: 0,
                              boxShadow: '0 3px 8px rgba(217, 119, 6, 0.3)'
                            }}>
                              <LucideIcon name="shield-check" style={{ width: '15px', height: '15px' }} />
                            </div>
                            <span style={{ fontSize: '9.5px', fontWeight: 800, color: '#92400E', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                              ENTERPRISE ELITE
                            </span>
                          </div>
                          <span style={{ fontSize: '9.5px', fontWeight: 800, color: '#B45309', background: 'rgba(254, 243, 199, 0.8)', border: '1px solid #FDE68A', padding: '2px 7px', borderRadius: '12px' }}>
                            SLA
                          </span>
                        </div>

                        <div style={{ marginTop: '12px', display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
                          <div>
                            <div style={{ fontSize: '26px', fontWeight: 900, color: '#0F172A', letterSpacing: '-0.8px', lineHeight: 1 }}>
                              {hospitals.filter(h => h.plan?.toLowerCase().includes('enterprise') || h.plan?.toLowerCase().includes('custom')).length}
                            </div>
                            <div style={{ fontSize: '10.5px', color: '#B45309', fontWeight: 700, marginTop: '5px', whiteSpace: 'nowrap' }}>
                              Enterprise tier tenants
                            </div>
                          </div>

                          <div style={{ width: '48px', height: '26px', flexShrink: 0 }}>
                            <svg style={{ width: '100%', height: '100%', overflow: 'visible' }} viewBox="0 0 48 26">
                              <defs>
                                <linearGradient id="kpiHospAmber" x1="0" y1="0" x2="0" y2="1">
                                  <stop offset="0%" stopColor="#F59E0B" stopOpacity="0.4"/>
                                  <stop offset="100%" stopColor="#F59E0B" stopOpacity="0.05"/>
                                </linearGradient>
                              </defs>
                              <path d="M 0 18 Q 12 10, 24 16 T 38 6 T 48 8 L 48 26 L 0 26 Z" fill="url(#kpiHospAmber)" />
                              <path d="M 0 18 Q 12 10, 24 16 T 38 6 T 48 8" fill="none" stroke="#F59E0B" strokeWidth="2.2" strokeLinecap="round" />
                            </svg>
                          </div>
                        </div>

                        <div style={{ height: '3px', position: 'absolute', bottom: 0, right: 0, width: '60%', background: 'linear-gradient(90deg, transparent 0%, #F59E0B 100%)' }} />
                      </div>

                      {/* Card 5: AVG HEALTH SCORE (Cyan / Ocean Gradient) */}
                      <div
                        style={{
                          padding: '16px 18px',
                          borderRadius: '18px',
                          border: '1px solid rgba(165, 243, 252, 0.95)',
                          boxShadow: '0 10px 25px rgba(6, 182, 212, 0.08)',
                          background: 'radial-gradient(circle at 100% 100%, rgba(6, 182, 212, 0.22) 0%, transparent 65%), linear-gradient(135deg, #FFFFFF 0%, #ECFEFF 50%, #CFFAFE 100%)',
                          display: 'flex',
                          flexDirection: 'column',
                          justifyContent: 'space-between',
                          position: 'relative',
                          overflow: 'hidden',
                          transition: 'all 0.2s ease-in-out'
                        }}
                        onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 14px 30px rgba(6, 182, 212, 0.15)'; }}
                        onMouseLeave={e => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = '0 10px 25px rgba(6, 182, 212, 0.08)'; }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <div style={{
                              width: '28px',
                              height: '28px',
                              borderRadius: '8px',
                              background: 'linear-gradient(135deg, #0E7490 0%, #06B6D4 100%)',
                              color: '#FFFFFF',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              flexShrink: 0,
                              boxShadow: '0 3px 8px rgba(6, 182, 212, 0.3)'
                            }}>
                              <LucideIcon name="heart-pulse" style={{ width: '15px', height: '15px' }} />
                            </div>
                            <span style={{ fontSize: '9.5px', fontWeight: 800, color: '#155E75', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                              AVG HEALTH SCORE
                            </span>
                          </div>
                          <span style={{ fontSize: '9.5px', fontWeight: 800, color: '#0E7490', background: 'rgba(207, 250, 254, 0.8)', border: '1px solid #A5F3FC', padding: '2px 7px', borderRadius: '12px' }}>
                            Optimal
                          </span>
                        </div>

                        <div style={{ marginTop: '12px', display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
                          <div>
                            <div style={{ fontSize: '26px', fontWeight: 900, color: '#0F172A', letterSpacing: '-0.8px', lineHeight: 1 }}>
                              {Math.round(hospitals.reduce((acc, h) => acc + (h.healthScore || 0), 0) / (hospitals.length || 1))}%
                            </div>
                            <div style={{ fontSize: '10.5px', color: '#0E7490', fontWeight: 700, marginTop: '5px', whiteSpace: 'nowrap' }}>
                              Platform compliance metric
                            </div>
                          </div>

                          <div style={{ width: '48px', height: '26px', flexShrink: 0 }}>
                            <svg style={{ width: '100%', height: '100%', overflow: 'visible' }} viewBox="0 0 48 26">
                              <defs>
                                <linearGradient id="kpiHospCyan" x1="0" y1="0" x2="0" y2="1">
                                  <stop offset="0%" stopColor="#06B6D4" stopOpacity="0.4"/>
                                  <stop offset="100%" stopColor="#06B6D4" stopOpacity="0.05"/>
                                </linearGradient>
                              </defs>
                              <path d="M 0 14 Q 10 20, 20 8 T 34 10 T 48 2 L 48 26 L 0 26 Z" fill="url(#kpiHospCyan)" />
                              <path d="M 0 14 Q 10 20, 20 8 T 34 10 T 48 2" fill="none" stroke="#06B6D4" strokeWidth="2.2" strokeLinecap="round" />
                            </svg>
                          </div>
                        </div>

                        <div style={{ height: '3px', position: 'absolute', bottom: 0, right: 0, width: '60%', background: 'linear-gradient(90deg, transparent 0%, #06B6D4 100%)' }} />
                      </div>
                    </div>

                    {/* Lower Area: 2-Column Split Layout */}
                    <div style={{ display: 'flex', gap: '24px', width: '100%', alignItems: 'flex-start' }}>
                      {/* Left Column (Main Area) */}
                      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '18px' }}>
                        {/* Search and Filters Bar */}
                    <div style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      background: 'linear-gradient(135deg, #FFFFFF 0%, #F8FAFC 100%)',
                      padding: '12px 18px',
                      borderRadius: '16px',
                      border: '1px solid #E2E8F0',
                      boxShadow: '0 4px 15px rgba(15, 23, 42, 0.03)'
                    }}>
                      {/* Search bar */}
                      <div style={{ position: 'relative', display: 'flex', alignItems: 'center', width: '340px' }}>
                        <LucideIcon name="search" style={{ position: 'absolute', left: '12px', width: '15px', height: '15px', color: '#64748B' }} />
                        <input 
                          type="text" 
                          placeholder="Search hospitals by name, code or CSM..." 
                          value={hospitalSearch}
                          onChange={e => {
                            setHospitalSearch(e.target.value);
                            setHospCurrentPage(1);
                          }}
                          style={{
                            width: '100%',
                            height: '36px',
                            padding: '0 12px 0 36px',
                            fontSize: '12px',
                            border: '1px solid #E2E8F0',
                            borderRadius: '8px',
                            outline: 'none',
                            background: '#FFFFFF',
                            color: '#1E293B',
                            boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.02)'
                          }}
                        />
                        {hospitalSearch && (
                          <button 
                            onClick={() => {
                              setHospitalSearch('');
                              setHospCurrentPage(1);
                            }}
                            style={{ position: 'absolute', right: '10px', background: 'transparent', border: 'none', cursor: 'pointer', color: '#64748B', display: 'flex', alignItems: 'center' }}
                          >
                            <LucideIcon name="x" style={{ width: '14px', height: '14px' }} />
                          </button>
                        )}
                      </div>

                      {/* Filter Pills */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                        {['All', 'Active', 'Suspended', 'High Health', 'Needs Attention'].map(tab => {
                          const isActive = hospFilterTab === tab;
                          return (
                            <button
                              key={tab}
                              onClick={() => {
                                setHospFilterTab(tab);
                                setHospCurrentPage(1);
                              }}
                              style={{
                                padding: '6px 12px',
                                borderRadius: '20px',
                                border: isActive ? '1px solid #2563EB' : '1px solid #E2E8F0',
                                background: isActive ? 'linear-gradient(135deg, #2563EB 0%, #1D4ED8 100%)' : '#FFFFFF',
                                color: isActive ? '#FFFFFF' : '#475569',
                                boxShadow: isActive ? '0 3px 10px rgba(37, 99, 235, 0.2)' : 'none',
                                fontSize: '11.5px',
                                fontWeight: 550,
                                cursor: 'pointer',
                                transition: 'all 0.15s ease'
                              }}
                            >
                              {tab}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Hospitals Grid / Table */}
                    <div style={{
                      background: '#FFFFFF',
                      borderRadius: '18px',
                      border: '1px solid #E2E8F0',
                      overflow: 'hidden',
                      boxShadow: '0 10px 25px -4px rgba(15, 23, 42, 0.04), 0 1px 3px rgba(0,0,0,0.02)'
                    }}>
                      <table style={styles.dataTable}>
                        <thead>
                          <tr style={{ background: '#F8FAFC', borderBottom: '1px solid #E2E8F0' }}>
                            <th style={{ ...styles.tableTh, padding: '12px 18px', fontSize: '11px', fontWeight: 600, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.5px' }}>HOSPITAL DETAILS</th>
                            <th style={{ ...styles.tableTh, padding: '12px 18px', fontSize: '11px', fontWeight: 600, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.5px' }}>HOSPITAL ID</th>
                            <th style={{ ...styles.tableTh, padding: '12px 18px', fontSize: '11px', fontWeight: 600, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.5px' }}>PORTAL</th>
                            <th style={{ ...styles.tableTh, padding: '12px 18px', fontSize: '11px', fontWeight: 600, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.5px' }}>CS OWNER</th>
                            <th style={{ ...styles.tableTh, padding: '12px 18px', fontSize: '11px', fontWeight: 600, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.5px' }}>LIFECYCLE</th>
                            <th style={{ ...styles.tableTh, padding: '12px 18px', fontSize: '11px', fontWeight: 600, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.5px' }}>HEALTH</th>
                          </tr>
                        </thead>
                        <tbody>
                          {paginatedHospitals.map(hosp => {
                            const initials = hosp.name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
                            const healthColor = hosp.healthScore >= 90 ? '#10B981' : hosp.healthScore >= 80 ? '#F59E0B' : '#EF4444';
                            
                            return (
                              <tr 
                                key={hosp._id || hosp.id} 
                                style={{
                                  ...styles.tableRow,
                                  cursor: 'pointer',
                                  background: selectedHospitalId === hosp._id ? '#EFF6FF' : 'transparent',
                                  transition: 'all 0.15s ease'
                                }}
                                onClick={() => {
                                  setSelectedHospitalId(hosp._id);
                                  setSelectedPlanForUpgrade('');
                                  setCredentialsMsg({ text: '', type: '' });
                                  setIsConfigDrawerOpen(true);
                                }}
                              >
                                <td style={{ ...styles.tableTd, padding: '12px 18px', verticalAlign: 'middle' }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                    <div style={{
                                      width: '32px',
                                      height: '32px',
                                      borderRadius: '8px',
                                      background: '#EFF6FF',
                                      color: '#2563EB',
                                      border: '1px solid #DBEAFE',
                                      display: 'flex',
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                      fontWeight: 600,
                                      fontSize: '12px',
                                      flexShrink: 0,
                                      overflow: 'hidden'
                                    }}>
                                      {hosp.logo && hosp.logo !== 'H' && (hosp.logo.startsWith('data:') || hosp.logo.startsWith('http://') || hosp.logo.startsWith('https://') || hosp.logo.startsWith('/uploads/')) ? (
                                        <img src={hosp.logo} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} onError={(e) => { e.currentTarget.style.display = 'none'; }} />
                                      ) : (
                                        initials
                                      )}
                                    </div>
                                    <div>
                                      <div style={{ fontSize: '13px', fontWeight: 600, color: '#1E293B', lineHeight: '1.3' }}>{hosp.name}</div>
                                      <div style={{ fontSize: '11px', color: '#94A3B8', marginTop: '2px', lineHeight: '1.3' }}>ID: {hosp.code} • {hosp.limits?.storageUsed || 0} GB used</div>
                                    </div>
                                  </div>
                                </td>
                                <td style={{ ...styles.tableTd, padding: '12px 18px', verticalAlign: 'middle' }}>
                                  {hosp.hospitalId ? (
                                    <span style={{
                                      fontFamily: 'monospace',
                                      fontWeight: 700,
                                      fontSize: '11.5px',
                                      background: '#F1F5F9',
                                      color: '#0F172A',
                                      padding: '3px 8px',
                                      borderRadius: '6px',
                                      border: '1px solid #CBD5E1',
                                      letterSpacing: '0.5px',
                                      display: 'inline-block'
                                    }}>
                                      {hosp.hospitalId}
                                    </span>
                                  ) : (
                                    <span style={{ fontSize: '11.5px', color: '#94A3B8', fontStyle: 'italic' }}>Unavailable</span>
                                  )}
                                </td>
                                <td style={{ ...styles.tableTd, padding: '12px 18px', verticalAlign: 'middle' }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <a
                                      href={hosp.hospitalId ? `${window.location.origin}/portal/${hosp.hospitalId}` : '#'}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        if (!hosp.hospitalId) e.preventDefault();
                                      }}
                                      style={{
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '4px',
                                        padding: '4px 9px',
                                        borderRadius: '6px',
                                        fontSize: '11px',
                                        fontWeight: 650,
                                        textDecoration: 'none',
                                        background: hosp.hospitalId ? '#EFF6FF' : '#F8FAFC',
                                        color: hosp.hospitalId ? '#2563EB' : '#94A3B8',
                                        border: `1px solid ${hosp.hospitalId ? '#BFDBFE' : '#E2E8F0'}`,
                                        cursor: hosp.hospitalId ? 'pointer' : 'not-allowed',
                                        transition: 'all 0.15s ease'
                                      }}
                                      title={hosp.hospitalId ? `Open ${window.location.origin}/portal/${hosp.hospitalId}` : 'Portal Unavailable'}
                                    >
                                      <LucideIcon name="external-link" style={{ width: '12px', height: '12px' }} />
                                      <span>Open</span>
                                    </a>
                                    <button
                                      type="button"
                                      disabled={!hosp.hospitalId}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        if (!hosp.hospitalId) return;
                                        const portalUrl = `${window.location.origin}/portal/${hosp.hospitalId}`;
                                        navigator.clipboard.writeText(portalUrl).then(() => {
                                          showToast(`Copied portal URL: ${portalUrl}`, 'success');
                                        }).catch(() => {
                                          showToast('Failed to copy to clipboard', 'error');
                                        });
                                      }}
                                      style={{
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '4px',
                                        padding: '4px 9px',
                                        borderRadius: '6px',
                                        fontSize: '11px',
                                        fontWeight: 650,
                                        background: '#FFFFFF',
                                        color: hosp.hospitalId ? '#334155' : '#94A3B8',
                                        border: `1px solid ${hosp.hospitalId ? '#CBD5E1' : '#E2E8F0'}`,
                                        cursor: hosp.hospitalId ? 'pointer' : 'not-allowed',
                                        transition: 'all 0.15s ease'
                                      }}
                                      title={hosp.hospitalId ? `Copy ${window.location.origin}/portal/${hosp.hospitalId}` : 'Portal Unavailable'}
                                    >
                                      <LucideIcon name="copy" style={{ width: '12px', height: '12px' }} />
                                      <span>Copy</span>
                                    </button>
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setLogoEditHosp(hosp);
                                        setLogoEditDraft(hosp.logo && hosp.logo !== 'H' ? hosp.logo : '');
                                        setLogoEditNameDraft(hosp.name || '');
                                        setLogoEditError('');
                                        setIsLogoEditModalOpen(true);
                                      }}
                                      style={{
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '4px',
                                        padding: '4px 9px',
                                        borderRadius: '6px',
                                        fontSize: '11px',
                                        fontWeight: 650,
                                        background: '#F0FDF4',
                                        color: '#16A34A',
                                        border: '1px solid #BBF7D0',
                                        cursor: 'pointer',
                                        transition: 'all 0.15s ease'
                                      }}
                                      title="Edit hospital logo & name"
                                    >
                                      <LucideIcon name="pencil" style={{ width: '12px', height: '12px' }} />
                                      <span>Edit</span>
                                    </button>
                                  </div>
                                </td>
                                <td style={{ ...styles.tableTd, padding: '12px 18px', verticalAlign: 'middle' }}>
                                  <div style={{ fontWeight: 550, fontSize: '12px', color: '#334155', lineHeight: '1.3' }}>{hosp.csm || 'Unassigned'}</div>
                                  <div style={{ fontSize: '11px', color: '#94A3B8', marginTop: '2px', lineHeight: '1.3' }}>Customer Success</div>
                                </td>
                                <td style={{ ...styles.tableTd, padding: '12px 18px', verticalAlign: 'middle' }}>
                                  <div style={{ fontWeight: 500, fontSize: '12px', color: '#334155', lineHeight: '1.3' }}>
                                    {hosp.plan 
                                      ? (() => {
                                          const pStr = hosp.plan.toLowerCase();
                                          const matchedPlan = plans.find(p => pStr.includes(p.tier.toLowerCase()) || pStr.includes(p.matchKey.toLowerCase()));
                                          if (matchedPlan) {
                                            const cycle = pStr.includes('annual') ? 'annual' : 'monthly';
                                            return getFormattedPlanString(matchedPlan.matchKey, cycle);
                                          }
                                          return hosp.plan.replace('$', '₹');
                                        })()
                                      : 'No Plan'
                                    }
                                  </div>
                                  <div style={{ fontSize: '11px', color: '#94A3B8', marginTop: '2px', lineHeight: '1.3' }}>Status: {hosp.status}</div>
                                </td>
                                <td style={{ ...styles.tableTd, padding: '12px 18px', verticalAlign: 'middle' }}>
                                  <span style={{ 
                                    display: 'inline-flex', alignItems: 'center', gap: '5px',
                                    padding: '3px 8px', borderRadius: '12px', fontSize: '11px', fontWeight: 500,
                                    background: healthColor + '15', color: healthColor, border: `1px solid ${healthColor}35`
                                  }}>
                                    <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: healthColor }}></span>
                                    {hosp.healthScore}%
                                  </span>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>

                    {/* Pagination Footer */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '12px', padding: '0 4px', flexWrap: 'wrap', gap: '10px' }}>
                      <span style={{ fontSize: '12px', color: '#64748B', fontWeight: 400 }}>
                        {filteredHospitals.length > 0 
                          ? `Showing ${startIndex + 1} to ${Math.min(endIndex, filteredHospitals.length)} of ${filteredHospitals.length} hospitals (10 per page)` 
                          : 'Showing 0 of 0 hospitals'
                        }
                      </span>
                      <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                        <button 
                          disabled={currentPage === 1}
                          onClick={() => setHospCurrentPage(currentPage - 1)}
                          style={{ 
                            height: '28px', 
                            padding: '0 10px', 
                            borderRadius: '6px', 
                            border: '1px solid #E2E8F0', 
                            background: '#FFFFFF', 
                            fontSize: '11.5px', 
                            fontWeight: 500,
                            color: currentPage === 1 ? '#CBD5E1' : '#475569',
                            cursor: currentPage === 1 ? 'not-allowed' : 'pointer',
                            transition: 'all 0.15s ease'
                          }}
                        >
                          Previous
                        </button>
                        {(() => {
                          const getPaginationList = (cur, total) => {
                            if (total <= 7) {
                              return Array.from({ length: total }, (_, i) => i + 1);
                            }
                            if (cur <= 3) {
                              return [1, 2, 3, 4, '...', total];
                            }
                            if (cur >= total - 2) {
                              return [1, '...', total - 3, total - 2, total - 1, total];
                            }
                            return [1, '...', cur - 1, cur, cur + 1, '...', total];
                          };

                          return getPaginationList(currentPage, totalHospPages).map((item, idx) => {
                            if (item === '...') {
                              return (
                                <span 
                                  key={`ellipsis-${idx}`} 
                                  style={{ 
                                    padding: '0 4px', 
                                    color: '#94A3B8', 
                                    fontSize: '12px',
                                    userSelect: 'none'
                                  }}
                                >
                                  ...
                                </span>
                              );
                            }
                            const pageNum = item;
                            const isPageActive = currentPage === pageNum;
                            return (
                              <button 
                                key={pageNum}
                                onClick={() => setHospCurrentPage(pageNum)}
                                style={{ 
                                  height: '28px', 
                                  minWidth: '28px', 
                                  padding: '0 6px', 
                                  borderRadius: '6px', 
                                  border: isPageActive ? 'none' : '1px solid #E2E8F0', 
                                  background: isPageActive ? 'linear-gradient(135deg, #2563EB 0%, #1D4ED8 100%)' : '#FFFFFF', 
                                  color: isPageActive ? '#FFFFFF' : '#475569', 
                                  fontSize: '11.5px', 
                                  fontWeight: isPageActive ? 600 : 450, 
                                  cursor: 'pointer',
                                  boxShadow: isPageActive ? '0 2px 6px rgba(37, 99, 235, 0.25)' : 'none',
                                  transition: 'all 0.15s ease'
                                }}
                              >
                                {pageNum}
                              </button>
                            );
                          });
                        })()}
                        <button 
                          disabled={currentPage === totalHospPages}
                          onClick={() => setHospCurrentPage(currentPage + 1)}
                          style={{ 
                            height: '28px', 
                            padding: '0 10px', 
                            borderRadius: '6px', 
                            border: '1px solid #E2E8F0', 
                            background: '#FFFFFF', 
                            fontSize: '11.5px', 
                            fontWeight: 500,
                            color: currentPage === totalHospPages ? '#CBD5E1' : '#475569',
                            cursor: currentPage === totalHospPages ? 'not-allowed' : 'pointer',
                            transition: 'all 0.15s ease'
                          }}
                        >
                          Next
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Right Column (Insights Panel) */}
                  <div style={{ width: '300px', flexShrink: 0, display: 'flex', flexDirection: 'column', gap: '20px' }}>
                    {/* Needs Attention */}
                    <div style={{
                      background: 'radial-gradient(circle at 100% 0%, rgba(239, 68, 68, 0.05) 0%, transparent 60%), linear-gradient(135deg, #FFFFFF 0%, #F8FAFC 100%)',
                      border: '1px solid #E2E8F0',
                      borderRadius: '18px',
                      padding: '18px',
                      boxShadow: '0 10px 25px -4px rgba(15, 23, 42, 0.04)'
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                        <span style={{ fontSize: '11px', fontWeight: 800, color: '#0F172A', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Needs Attention</span>
                        <span style={{ background: hospitals.filter(h => (h.healthScore || 100) < 90 || h.status === 'Suspended').length > 0 ? '#FEE2E2' : '#D1FAE5', color: hospitals.filter(h => (h.healthScore || 100) < 90 || h.status === 'Suspended').length > 0 ? '#EF4444' : '#065F46', fontSize: '10px', fontWeight: 800, padding: '2px 8px', borderRadius: '12px', border: `1px solid ${hospitals.filter(h => (h.healthScore || 100) < 90 || h.status === 'Suspended').length > 0 ? '#FECACA' : '#A7F3D0'}` }}>
                          {hospitals.filter(h => (h.healthScore || 100) < 90 || h.status === 'Suspended').length}
                        </span>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        {hospitals.filter(h => (h.healthScore || 100) < 90 || h.status === 'Suspended').map((h, idx) => (
                          <div key={idx} style={{ display: 'flex', gap: '10px', alignItems: 'flex-start', padding: '10px 12px', background: '#FEF2F2', borderRadius: '10px', border: '1px solid #FCA5A5' }}>
                            <LucideIcon name="alert-triangle" style={{ width: '16px', height: '16px', color: '#EF4444', marginTop: '2px', flexShrink: 0 }} />
                            <div>
                              <div style={{ fontSize: '11.5px', fontWeight: 800, color: '#991B1B' }}>{h.name}</div>
                              <div style={{ fontSize: '10px', color: '#B91C1C', marginTop: '2px' }}>
                                {h.status === 'Suspended' ? 'Tenant account suspended.' : `Health Score: ${h.healthScore}%. Action recommended.`}
                              </div>
                            </div>
                          </div>
                        ))}
                        {hospitals.filter(h => (h.healthScore || 100) < 90 || h.status === 'Suspended').length === 0 && (
                          <div style={{ fontSize: '11px', color: '#64748B', textAlign: 'center', padding: '10px 0' }}>
                            ✓ All connected hospital systems operating smoothly.
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Renewals This Week */}
                    <div style={{
                      background: 'radial-gradient(circle at 100% 0%, rgba(37, 99, 235, 0.05) 0%, transparent 60%), linear-gradient(135deg, #FFFFFF 0%, #F8FAFC 100%)',
                      border: '1px solid #E2E8F0',
                      borderRadius: '18px',
                      padding: '18px',
                      boxShadow: '0 10px 25px -4px rgba(15, 23, 42, 0.04)'
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                        <span style={{ fontSize: '11px', fontWeight: 800, color: '#0F172A', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Renewals This Week</span>
                        <span style={{ background: '#EFF6FF', color: '#2563EB', fontSize: '10px', fontWeight: 800, padding: '2px 8px', borderRadius: '12px', border: '1px solid #BFDBFE' }}>
                          {hospitals.filter(h => h.status === 'Active').length}
                        </span>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        {(() => {
                          const activeHospitals = hospitals.filter(h => h.status === 'Active');
                          if (activeHospitals.length === 0) {
                            return (
                              <div style={{ fontSize: '11px', color: '#64748B', textAlign: 'center', padding: '10px 0' }}>
                                No upcoming renewals scheduled.
                              </div>
                            );
                          }
                          return activeHospitals.slice(0, 3).map((hosp, idx) => {
                            const planStr = hosp.plan || '';
                            const planLower = planStr.toLowerCase();
                            const isTrial = planLower.includes('trial') || planLower.includes('custom');
                            const isAnnual = planLower.includes('annual');
                            const planLabel = planStr ? planStr.replace('Annual', '').trim() : 'Standard';
                            
                            // Use actual subscriptionExpiryDate from DB (canonical). Only fall back to
                            // createdAt+duration if subscriptionExpiryDate is missing (legacy records).
                            let expiryDate;
                            if (hosp.subscriptionExpiryDate) {
                              expiryDate = new Date(hosp.subscriptionExpiryDate);
                            } else {
                              const createdDate = hosp.createdAt ? new Date(hosp.createdAt) : new Date();
                              const durationDays = isTrial ? 7 : (isAnnual ? 365 : 30);
                              expiryDate = new Date(createdDate.getTime() + durationDays * 24 * 60 * 60 * 1000);
                            }
                            const diffMs = expiryDate.getTime() - Date.now();
                            const daysDue = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

                            let daysText = '';
                            let badgeColor = '#2563EB';

                            if (daysDue < 0) {
                              const daysAgo = Math.abs(daysDue);
                              daysText = isTrial ? (daysAgo === 1 ? 'Trial Expired (1d ago)' : `Trial Expired (${daysAgo}d ago)`) : `Expired (${daysAgo}d ago)`;
                              badgeColor = '#EF4444';
                            } else if (daysDue === 0) {
                              daysText = isTrial ? 'Trial Ends Today' : 'Today';
                              badgeColor = '#F59E0B';
                            } else if (daysDue === 1) {
                              daysText = isTrial ? 'Trial Ends Tomorrow' : 'In 1 day';
                              badgeColor = '#F59E0B';
                            } else {
                              daysText = isTrial ? `${daysDue} days left` : `In ${daysDue} days`;
                              badgeColor = '#2563EB';
                            }
                             
                            return (
                              <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '9px 12px', background: '#FFFFFF', borderRadius: '10px', border: '1px solid #E2E8F0', boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }}>
                                <div>
                                  <div style={{ fontSize: '11.5px', fontWeight: 800, color: '#1E293B' }}>{hosp.name}</div>
                                  <div style={{ fontSize: '10px', color: '#64748B', marginTop: '1px' }}>{planLabel} License</div>
                                </div>
                                <span style={{ fontSize: '10.5px', fontWeight: 800, color: badgeColor }}>{daysText}</span>
                              </div>
                            );
                          });
                        })()}
                      </div>
                    </div>

                    {/* Onboarding Delays */}
                    <div style={{
                      background: 'radial-gradient(circle at 100% 0%, rgba(245, 158, 11, 0.05) 0%, transparent 60%), linear-gradient(135deg, #FFFFFF 0%, #F8FAFC 100%)',
                      border: '1px solid #E2E8F0',
                      borderRadius: '18px',
                      padding: '18px',
                      boxShadow: '0 10px 25px -4px rgba(15, 23, 42, 0.04)'
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                        <span style={{ fontSize: '11px', fontWeight: 800, color: '#0F172A', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Onboarding Delays</span>
                        <span style={{ background: onboardingHospitals.filter(h => h.progress < 100).length > 0 ? '#FEF3C7' : '#D1FAE5', color: onboardingHospitals.filter(h => h.progress < 100).length > 0 ? '#D97706' : '#065F46', fontSize: '10px', fontWeight: 800, padding: '2px 8px', borderRadius: '12px', border: `1px solid ${onboardingHospitals.filter(h => h.progress < 100).length > 0 ? '#FDE68A' : '#A7F3D0'}` }}>
                          {onboardingHospitals.filter(h => h.progress < 100).length}
                        </span>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        {(() => {
                          const pendingOnboarding = onboardingHospitals.filter(h => h.progress < 100);
                          if (pendingOnboarding.length === 0) {
                            return (
                              <div style={{ fontSize: '11px', color: '#64748B', textAlign: 'center', padding: '10px 0' }}>
                                ✓ All onboarding pipelines are up to date.
                              </div>
                            );
                          }
                          return pendingOnboarding.map((onb, idx) => {
                            const createdDate = onb.createdAt ? new Date(onb.createdAt) : new Date();
                            const elapsedDays = Math.floor((Date.now() - createdDate.getTime()) / (1000 * 60 * 60 * 24));
                            const currentDay = Math.max(1, elapsedDays + 1);
                            const isOverdue = currentDay > 14;

                            return (
                              <div key={onb._id || idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '9px 12px', background: isOverdue ? '#FEF2F2' : '#FFFBEB', borderRadius: '10px', border: `1px solid ${isOverdue ? '#FECACA' : '#FDE68A'}` }}>
                                <div>
                                  <div style={{ fontSize: '11.5px', fontWeight: 800, color: isOverdue ? '#991B1B' : '#92400E' }}>{onb.name}</div>
                                  <div style={{ fontSize: '10px', color: isOverdue ? '#B91C1C' : '#B45309', marginTop: '1px' }}>Stalled on: {onb.stage || 'Verification'} ({onb.progress}%)</div>
                                </div>
                                <span style={{ fontSize: '10.5px', fontWeight: 800, color: isOverdue ? '#DC2626' : '#D97706' }}>Day {currentDay}</span>
                              </div>
                            );
                          });
                        })()}
                      </div>
                    </div>

                    {/* Operational Insights */}
                    <div style={{
                      background: 'radial-gradient(circle at 100% 0%, rgba(99, 102, 241, 0.05) 0%, transparent 60%), linear-gradient(135deg, #FFFFFF 0%, #F8FAFC 100%)',
                      border: '1px solid #E2E8F0',
                      borderRadius: '18px',
                      padding: '18px',
                      boxShadow: '0 10px 25px -4px rgba(15, 23, 42, 0.04)'
                    }}>
                      <div style={{ fontSize: '11px', fontWeight: 800, color: '#0F172A', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '12px' }}>Operational Insights</div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        {(() => {
                          const pendingDocsList = getPendingDocumentsList();
                          const pendingDocs = pendingDocsList.length;

                          const verifReqs = onboardingHospitals.filter(h => h.isActivated !== true && h.status !== 'Completed' && h.status !== 'Live').length;
                          const sysTickets = tickets.filter(t => t.status !== 'Resolved' && t.status !== 'Closed').length;
                          const auditWarns = hospitals.filter(h => (h.healthScore || 100) < 90 || h.status === 'Suspended').length;

                          return [
                            { 
                              label: 'Pending Documents', 
                              val: pendingDocs, 
                              action: () => setShowPendingDocsModal(true),
                              badgeColor: '#2563EB',
                              badgeBg: '#EFF6FF'
                            },
                            { 
                              label: 'Verification Requests', 
                              val: verifReqs, 
                              action: () => setActiveTab('hospital-onboarding'),
                              badgeColor: '#D97706',
                              badgeBg: '#FEF3C7'
                            },
                            { 
                              label: 'System Tickets', 
                              val: sysTickets, 
                              action: () => { 
                                setActiveTab('support-success'); 
                                if (typeof setSupportSubTab === 'function') setSupportSubTab('support-dashboard'); 
                              },
                              badgeColor: '#7C3AED',
                              badgeBg: '#F5F3FF'
                            },
                            { 
                              label: 'Audit Warnings', 
                              val: auditWarns, 
                              action: () => { 
                                setActiveTab('hospitals'); 
                                setHospFilterTab('Needs Attention'); 
                              },
                              badgeColor: '#EF4444',
                              badgeBg: '#FEF2F2'
                            }
                          ].map((ins, idx) => (
                            <div
                              key={idx}
                              onClick={ins.action}
                              style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                padding: '8px 10px',
                                margin: '0 -4px',
                                borderRadius: '8px',
                                borderBottom: idx === 3 ? 'none' : '1px solid #F1F5F9',
                                cursor: 'pointer',
                                transition: 'all 0.15s ease'
                              }}
                              onMouseEnter={(e) => {
                                e.currentTarget.style.backgroundColor = '#F8FAFC';
                                e.currentTarget.style.transform = 'translateX(2px)';
                              }}
                              onMouseLeave={(e) => {
                                e.currentTarget.style.backgroundColor = 'transparent';
                                e.currentTarget.style.transform = 'none';
                              }}
                            >
                              <span style={{ 
                                fontSize: '12px', 
                                color: '#1E293B', 
                                fontWeight: 600,
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px'
                              }}>
                                {ins.label}
                                <LucideIcon name="chevron-right" style={{ width: '12px', height: '12px', color: '#94A3B8' }} />
                              </span>
                              <strong style={{ 
                                fontSize: '11px', 
                                color: ins.badgeColor, 
                                background: ins.badgeBg, 
                                padding: '2px 8px', 
                                borderRadius: '10px',
                                fontWeight: 800 
                              }}>{ins.val}</strong>
                            </div>
                          ));
                        })()}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              );
            })()}

            {/* DEPARTMENTS VIEW */}
            {isTabAllowed && activeTab === 'departments' && (
              <div style={{ flex: 1, padding: '24px', overflowY: 'auto' }}>
                <div style={{ display: 'flex', gap: '8px', borderBottom: '1px solid #E2E8F0', paddingBottom: '8px', marginBottom: '14px', flexWrap: 'wrap' }}>
                  <button style={activeTab === 'hr-mgmt' ? styles.subNavbarBtnActive : styles.subNavbarBtn} onClick={() => setActiveTab('hr-mgmt')}>Team Directory</button>
                  <button style={activeTab === 'departments' ? styles.subNavbarBtnActive : styles.subNavbarBtn} onClick={() => setActiveTab('departments')}>Departments</button>
                  <button style={activeTab === 'platform-roles' ? styles.subNavbarBtnActive : styles.subNavbarBtn} onClick={() => setActiveTab('platform-roles')}>Security Roles</button>
                  <button style={activeTab === 'platform-audits' ? styles.subNavbarBtnActive : styles.subNavbarBtn} onClick={() => setActiveTab('platform-audits')}>Audit Logs</button>
                </div>
                <div>
                  <h2 style={styles.cardHeaderTitle}>Company Departments</h2>
                  <p style={styles.cardHeaderSub}>Monitor SaaS department breakdown, employee workloads, and resource allocation.</p>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '20px', marginTop: '16px' }}>
                  {(() => {
                    const defaultDepts = ['Hospital Onboarding', 'Customer Success', 'Finance & Billing', 'System Administration'];
                    const databaseDepts = Array.from(new Set(employees.map(e => e.department))).filter(Boolean);
                    const allDepts = Array.from(new Set([...defaultDepts, ...databaseDepts]));

                    return allDepts.map((deptName, index) => {
                      const deptEmps = employees.filter(e => e.department === deptName || (deptName === 'Finance & Billing' && e.department === 'Finance'));
                      const count = deptEmps.length;
                      
                      let lead = 'Not Assigned';
                      if (count > 0) {
                        const leadKeywords = ['head', 'manager', 'lead', 'director', 'admin', 'chief', 'president'];
                        const foundLead = deptEmps.find(e => 
                          leadKeywords.some(keyword => e.designation?.toLowerCase().includes(keyword)) ||
                          leadKeywords.some(keyword => e.platformRole?.toLowerCase().includes(keyword))
                        );
                        lead = foundLead ? foundLead.name : deptEmps[0].name;
                      }

                      const status = count > 0 ? 'Active' : 'Inactive';
                      
                      return (
                        <div key={index} style={{ ...styles.glassCard, padding: '20px', border: '1px solid #E2E8F0', borderRadius: '12px', background: '#FFFFFF' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontSize: '10px', fontWeight: 800, background: '#EFF6FF', color: '#2563EB', padding: '2px 8px', borderRadius: '4px', textTransform: 'uppercase' }}>Dept</span>
                            <span style={{ fontSize: '10px', fontWeight: 800, color: count > 0 ? '#10B981' : '#64748B' }}>{status}</span>
                          </div>
                          <h3 style={{ fontSize: '16px', fontWeight: 800, color: '#0F172A', margin: '12px 0 4px' }}>{deptName}</h3>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '12px', color: '#64748B', marginTop: '10px' }}>
                            <div><strong>Head:</strong> {lead}</div>
                            <div><strong>Headcount:</strong> {count} Members</div>
                          </div>
                        </div>
                      );
                    });
                  })()}
                </div>
              </div>
            )}


            {/* REVENUE VIEW */}
            {isTabAllowed && activeTab === 'finance-revenue' && (
              <div style={{ flex: 1, padding: '24px', overflowY: 'auto' }}>
                <div>
                  <h2 style={styles.cardHeaderTitle}>SaaS Revenue & Analytics</h2>
                  <p style={styles.cardHeaderSub}>Monitor Monthly Recurring Revenue (MRR), total transaction volume, and subscriptions health.</p>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '20px', marginTop: '16px' }}>
                  <div style={{ ...styles.glassCard, padding: '20px', background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '12px' }}>
                    <span style={{ fontSize: '10px', fontWeight: 800, color: '#64748B' }}>TOTAL PAID REVENUE</span>
                    <div style={{ fontSize: '28px', fontWeight: 800, color: '#0F172A', margin: '8px 0 4px' }}>
                      ₹{invoices.filter(i => i.status === 'Paid').reduce((acc, curr) => acc + curr.amount, 0).toLocaleString()}
                    </div>
                    <span style={{ fontSize: '11px', color: '#10B981', fontWeight: 700 }}>+15.2% vs last month</span>
                  </div>
                  <div style={{ ...styles.glassCard, padding: '20px', background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '12px' }}>
                    <span style={{ fontSize: '10px', fontWeight: 800, color: '#64748B' }}>MONTHLY RECURRING REVENUE (MRR)</span>
                    <div style={{ fontSize: '28px', fontWeight: 800, color: '#0F172A', margin: '8px 0 4px' }}>
                      ₹{hospitals.filter(h => h.status === 'Active').reduce((acc, curr) => {
                        const price = parseInt(curr.revenue?.replace(/[^0-9]/g, '') || '0');
                        return acc + price;
                      }, 0).toLocaleString()}/mo
                    </div>
                    <span style={{ fontSize: '11px', color: '#2563EB', fontWeight: 700 }}>From {hospitals.filter(h => h.status === 'Active').length} Active Tenants</span>
                  </div>
                  <div style={{ ...styles.glassCard, padding: '20px', background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '12px' }}>
                    <span style={{ fontSize: '10px', fontWeight: 800, color: '#64748B' }}>OUTSTANDING INVOICES</span>
                    <div style={{ fontSize: '28px', fontWeight: 800, color: '#0F172A', margin: '8px 0 4px' }}>
                      ₹{invoices.filter(i => i.status === 'Pending').reduce((acc, curr) => acc + curr.amount, 0).toLocaleString()}
                    </div>
                    <span style={{ fontSize: '11px', color: '#EF4444', fontWeight: 700 }}>{invoices.filter(i => i.status === 'Pending').length} Invoices Overdue</span>
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: '20px', marginTop: '20px' }}>
                  <div style={{ background: '#FFFFFF', padding: '20px', border: '1px solid #E2E8F0', borderRadius: '12px' }}>
                    <h3 style={{ fontSize: '14px', fontWeight: 800, marginBottom: '14px' }}>Monthly Transaction Flow</h3>
                    <div style={{ height: '180px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#F8FAFC', borderRadius: '8px', border: '1px solid #E2E8F0' }}>
                      <svg width="100%" height="100%" viewBox="0 0 400 120" style={{ overflow: 'visible' }}>
                        <path d="M10,90 Q80,40 150,60 T290,20 T400,10" fill="none" stroke="#2563EB" strokeWidth="3" />
                        <circle cx="150" cy="60" r="4" fill="#2563EB" />
                        <circle cx="290" cy="20" r="4" fill="#2563EB" />
                      </svg>
                    </div>
                  </div>
                  <div style={{ background: '#FFFFFF', padding: '20px', border: '1px solid #E2E8F0', borderRadius: '12px' }}>
                    <h3 style={{ fontSize: '14px', fontWeight: 800, marginBottom: '14px' }}>Revenue Distribution</h3>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      {['Enterprise Elite Pro', 'Standard Premium', 'Starter Basic'].map((plan, i) => {
                        const count = hospitals.filter(h => h.plan?.includes(plan)).length;
                        return (
                          <div key={i}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: '4px' }}>
                              <strong>{plan}</strong>
                              <span>{count} Subscriptions</span>
                            </div>
                            <div style={{ height: '8px', background: '#F1F5F9', borderRadius: '4px', overflow: 'hidden' }}>
                              <div style={{ height: '100%', background: '#2563EB', width: `${(count / (hospitals.length || 1)) * 100}%` }}></div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* RENEWALS VIEW */}
            {isTabAllowed && activeTab === 'finance-renewals' && (
              <div style={{ flex: 1, padding: '24px', overflowY: 'auto' }}>
                <div>
                  <h2 style={styles.cardHeaderTitle}>Upcoming Billing Renewals</h2>
                  <p style={styles.cardHeaderSub}>Review upcoming subscriber collections, renew schedules, or toggle automated invoicing triggers.</p>
                </div>
                <div style={{ background: '#FFFFFF', borderRadius: '12px', border: '1px solid #E2E8F0', padding: '20px', marginTop: '16px' }}>
                  <table style={styles.dataTable}>
                    <thead>
                      <tr>
                        <th style={styles.tableTh}>Hospital Customer</th>
                        <th style={styles.tableTh}>Subscription Plan</th>
                        <th style={styles.tableTh}>Outstanding Amount</th>
                        <th style={styles.tableTh}>Renewal Date / Due Date</th>
                        <th style={styles.tableTh}>Lifecycle Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {invoices.map((inv, idx) => (
                        <tr key={idx} style={styles.tableRow}>
                          <td style={styles.tableTd}><strong>{inv.hospital}</strong></td>
                          <td style={styles.tableTd}>
                            {inv.subscription}
                          </td>
                          <td style={styles.tableTd}>₹{inv.amount.toLocaleString()}</td>
                          <td style={styles.tableTd}>{inv.dueDate}</td>
                          <td style={styles.tableTd}>
                            <span style={{
                              ...styles.statusBadge,
                              background: inv.status === 'Paid' ? '#D1FAE5' : '#FEE2E2',
                              color: inv.status === 'Paid' ? '#065F46' : '#991B1B'
                            }}>{inv.status === 'Paid' ? 'Renewed / Paid' : 'Renewal Pending'}</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* PLATFORM ROLES VIEW */}
            {isTabAllowed && activeTab === 'platform-roles' && (
              <div style={{ flex: 1, padding: '24px', overflowY: 'auto' }}>
                <div style={{ display: 'flex', gap: '8px', borderBottom: '1px solid #E2E8F0', paddingBottom: '8px', marginBottom: '14px', flexWrap: 'wrap' }}>
                  <button style={activeTab === 'hr-mgmt' ? styles.subNavbarBtnActive : styles.subNavbarBtn} onClick={() => setActiveTab('hr-mgmt')}>Team Directory</button>
                  <button style={activeTab === 'departments' ? styles.subNavbarBtnActive : styles.subNavbarBtn} onClick={() => setActiveTab('departments')}>Departments</button>
                  <button style={activeTab === 'platform-roles' ? styles.subNavbarBtnActive : styles.subNavbarBtn} onClick={() => setActiveTab('platform-roles')}>Security Roles</button>
                  <button style={activeTab === 'platform-audits' ? styles.subNavbarBtnActive : styles.subNavbarBtn} onClick={() => setActiveTab('platform-audits')}>Audit Logs</button>
                </div>
                <div>
                  <h2 style={styles.cardHeaderTitle}>Roles & Security Permissions</h2>
                  <p style={styles.cardHeaderSub}>Define global system access levels, check RBAC compliance, and provision tenant staff role coverage schemas.</p>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginTop: '16px' }}>
                  <div style={{ background: '#FFFFFF', borderRadius: '12px', border: '1px solid #E2E8F0', padding: '20px' }}>
                    <h3 style={{ fontSize: '14px', fontWeight: 800, marginBottom: '14px' }}>RBAC Role Registry</h3>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {[
                        { role: 'Super Admin', desc: 'Full root access to global SaaS settings, logs, backup, and billing actions.' },
                        { role: 'Hospital Admin', desc: 'Access to tenant-specific configurations, employee management, and billing details.' },
                        { role: 'Doctor', desc: 'Access to Clinical Notes, Patient Prescriptions, EMR, and consultation schedules.' },
                        { role: 'Receptionist', desc: 'Access to Patient Registrations, OPD queues, Appointments, and token generations.' },
                        { role: 'Pharmacist', desc: 'Access to Pharmacy procurement, GRN inventory, and medicine dispensations.' },
                        { role: 'Lab Technician', desc: 'Access to Laboratory Requests, test report entries, and inventory requisitions.' }
                      ].map((r, i) => (
                        <div key={i} style={{ padding: '12px', border: '1px solid #F1F5F9', borderRadius: '8px', background: '#F8FAFC' }}>
                          <strong>{r.role}</strong>
                          <p style={{ fontSize: '11px', color: '#64748B', margin: '4px 0 0' }}>{r.desc}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div style={{ background: '#FFFFFF', borderRadius: '12px', border: '1px solid #E2E8F0', padding: '20px' }}>
                    <h3 style={{ fontSize: '14px', fontWeight: 800, marginBottom: '14px' }}>Tenant Role Security Audit</h3>
                    <div style={{ padding: '14px', background: '#EFF6FF', borderRadius: '10px', border: '1px solid #BFDBFE', color: '#1E40AF', fontSize: '12px' }}>
                      <strong>SaaS Shield Compliance Engine Active</strong>
                      <p style={{ margin: '6px 0 0' }}>All {hospitals.length} corporate tenants conform to localized clinical staff role separation guidelines (DPDP-compliant rules enforced).</p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* AUDIT LOGS VIEW */}
            {isTabAllowed && activeTab === 'platform-audits' && (
              <div style={{ flex: 1, padding: '24px', overflowY: 'auto' }}>
                <div style={{ display: 'flex', gap: '8px', borderBottom: '1px solid #E2E8F0', paddingBottom: '8px', marginBottom: '14px', flexWrap: 'wrap' }}>
                  <button style={activeTab === 'hr-mgmt' ? styles.subNavbarBtnActive : styles.subNavbarBtn} onClick={() => setActiveTab('hr-mgmt')}>Team Directory</button>
                  <button style={activeTab === 'departments' ? styles.subNavbarBtnActive : styles.subNavbarBtn} onClick={() => setActiveTab('departments')}>Departments</button>
                  <button style={activeTab === 'platform-roles' ? styles.subNavbarBtnActive : styles.subNavbarBtn} onClick={() => setActiveTab('platform-roles')}>Security Roles</button>
                  <button style={activeTab === 'platform-audits' ? styles.subNavbarBtnActive : styles.subNavbarBtn} onClick={() => setActiveTab('platform-audits')}>Audit Logs</button>
                </div>
                <div>
                  <h2 style={styles.cardHeaderTitle}>Platform System Audit Logs</h2>
                  <p style={styles.cardHeaderSub}>Review immutable platform operational logs, security authorization snapshots, and data mutations records.</p>
                </div>
                <div style={{ background: '#FFFFFF', borderRadius: '12px', border: '1px solid #E2E8F0', padding: '20px', marginTop: '16px' }}>
                  <table style={styles.dataTable}>
                    <thead>
                      <tr>
                        <th style={styles.tableTh}>Timestamp</th>
                        <th style={styles.tableTh}>SaaS Staff Executor</th>
                        <th style={styles.tableTh}>Action Trigger</th>
                        <th style={styles.tableTh}>Log Details Summary</th>
                      </tr>
                    </thead>
                    <tbody>
                      {auditLogs.length === 0 ? (
                        <tr>
                          <td colSpan={4} style={{ padding: '30px', textAlign: 'center', color: '#64748B', fontSize: '13px' }}>
                            No audit log records found.
                          </td>
                        </tr>
                      ) : (
                        auditLogs.map((log, idx) => (
                          <tr key={idx} style={styles.tableRow}>
                            <td style={styles.tableTd}><code>{new Date(log.createdAt).toLocaleString()}</code></td>
                            <td style={styles.tableTd}><strong>{log.user}</strong></td>
                            <td style={styles.tableTd}><span style={{ ...styles.statusBadge, background: '#EFF6FF', color: '#2563EB' }}>{log.action}</span></td>
                            <td style={styles.tableTd}>{log.details}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* CONFIGURATION SIDEBAR DRAWER OVERLAY */}
            {selectedHospitalId && (() => {
              const hosp = hospitals.find(h => h._id === selectedHospitalId);
              if (!hosp) return null;
              return (
                <div 
                  style={{
                    position: 'fixed', inset: 0, 
                    background: isConfigDrawerOpen ? 'rgba(15, 23, 42, 0.3)' : 'rgba(15, 23, 42, 0)',
                    backdropFilter: isConfigDrawerOpen ? 'blur(4px)' : 'blur(0px)', 
                    display: 'flex', justifyContent: 'flex-end',
                    zIndex: 9999,
                    pointerEvents: isConfigDrawerOpen ? 'auto' : 'none',
                    transition: 'background 0.3s ease, backdrop-filter 0.3s ease',
                  }}
                  onClick={() => setIsConfigDrawerOpen(false)}
                >
                  <div 
                    style={{
                      width: '460px', height: '100vh', background: '#FFFFFF',
                      boxShadow: '-10px 0 30px rgba(0, 0, 0, 0.1)', display: 'flex',
                      flexDirection: 'column',
                      transform: isConfigDrawerOpen ? 'translateX(0)' : 'translateX(100%)',
                      transition: 'transform 0.3s cubic-bezier(0.16, 1, 0.3, 1)'
                    }}
                    onClick={e => e.stopPropagation()}
                  >
                    {/* Header */}
                    <div style={{ padding: '20px 24px', borderBottom: '1px solid #E2E8F0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 800, color: '#0F172A' }}>Configure Tenant</h3>
                        <p style={{ margin: '4px 0 0', fontSize: '11px', color: '#64748B' }}>{hosp.name}</p>
                      </div>
                      <button 
                        style={{ border: 'none', background: '#F1F5F9', borderRadius: '50%', width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
                        onClick={() => setIsConfigDrawerOpen(false)}
                      >
                        <LucideIcon name="x" style={{ width: '16px', height: '16px', color: '#64748B' }} />
                      </button>
                    </div>

                    {/* Body */}
                    <div style={{ flex: 1, overflowY: 'auto', padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
                      {/* Hospital Portal Identity & Access */}
                      <div style={{ background: '#F8FAFC', padding: '16px', borderRadius: '12px', border: '1px solid #E2E8F0', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <strong style={{ fontSize: '10px', color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.5px' }}>HOSPITAL PORTAL ACCESS</strong>
                          {hosp.hospitalId ? (
                            <span style={{ fontFamily: 'monospace', fontWeight: 750, fontSize: '11px', background: '#DBEAFE', color: '#1E40AF', padding: '2px 8px', borderRadius: '4px', border: '1px solid #BFDBFE' }}>
                              {hosp.hospitalId}
                            </span>
                          ) : (
                            <span style={{ fontSize: '11px', color: '#94A3B8', fontStyle: 'italic' }}>Unavailable</span>
                          )}
                        </div>
                        <div style={{ fontSize: '11.5px', color: '#334155', fontFamily: 'monospace', background: '#FFFFFF', padding: '8px 12px', borderRadius: '6px', border: '1px solid #CBD5E1', wordBreak: 'break-all' }}>
                          {hosp.hospitalId ? `${window.location.origin}/portal/${hosp.hospitalId}` : 'Portal URL Unavailable'}
                        </div>
                        <div style={{ display: 'flex', gap: '8px' }}>
                          <a
                            href={hosp.hospitalId ? `${window.location.origin}/portal/${hosp.hospitalId}` : '#'}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => { if (!hosp.hospitalId) e.preventDefault(); }}
                            style={{
                              flex: 1,
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              gap: '6px',
                              padding: '7px 12px',
                              borderRadius: '6px',
                              fontSize: '11.5px',
                              fontWeight: 650,
                              textDecoration: 'none',
                              background: hosp.hospitalId ? '#2563EB' : '#94A3B8',
                              color: '#FFFFFF',
                              cursor: hosp.hospitalId ? 'pointer' : 'not-allowed',
                              boxShadow: hosp.hospitalId ? '0 2px 6px rgba(37, 99, 235, 0.2)' : 'none'
                            }}
                          >
                            <LucideIcon name="external-link" style={{ width: '13px', height: '13px' }} />
                            <span>Open Portal</span>
                          </a>
                          <button
                            type="button"
                            disabled={!hosp.hospitalId}
                            onClick={() => {
                              if (!hosp.hospitalId) return;
                              const portalUrl = `${window.location.origin}/portal/${hosp.hospitalId}`;
                              navigator.clipboard.writeText(portalUrl).then(() => {
                                showToast(`Copied portal URL: ${portalUrl}`, 'success');
                              }).catch(() => {
                                showToast('Failed to copy portal URL', 'error');
                              });
                            }}
                            style={{
                              flex: 1,
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              gap: '6px',
                              padding: '7px 12px',
                              borderRadius: '6px',
                              fontSize: '11.5px',
                              fontWeight: 650,
                              background: '#FFFFFF',
                              color: hosp.hospitalId ? '#334155' : '#94A3B8',
                              border: '1px solid #CBD5E1',
                              cursor: hosp.hospitalId ? 'pointer' : 'not-allowed'
                            }}
                          >
                            <LucideIcon name="copy" style={{ width: '13px', height: '13px' }} />
                            <span>Copy Link</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setLogoEditHosp(hosp);
                              setLogoEditDraft(hosp.logo && hosp.logo !== 'H' ? hosp.logo : '');
                              setLogoEditNameDraft(hosp.name || '');
                              setLogoEditError('');
                              setIsLogoEditModalOpen(true);
                            }}
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              gap: '6px',
                              padding: '7px 14px',
                              borderRadius: '6px',
                              fontSize: '11.5px',
                              fontWeight: 650,
                              background: '#F0FDF4',
                              color: '#16A34A',
                              border: '1px solid #BBF7D0',
                              cursor: 'pointer'
                            }}
                            title="Edit hospital branding & logo"
                          >
                            <LucideIcon name="pencil" style={{ width: '13px', height: '13px' }} />
                            <span>Edit Branding</span>
                          </button>
                        </div>
                      </div>

                      {/* Module access flags */}
                      <div>
                        <strong style={{ fontSize: '10px', color: '#64748B', display: 'block', marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>SOFTWARE MODULE ACCESS FLAGS</strong>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', background: '#F8FAFC', padding: '14px', borderRadius: '10px', border: '1px solid #E2E8F0' }}>
                          {['reception', 'doctor', 'pharmacy', 'laboratory'].map(mod => (
                            <div key={mod} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '12px', color: '#475569' }}>
                              <span style={{ textTransform: 'capitalize', fontWeight: 600 }}>{mod} Module</span>
                              <ToggleSwitch 
                                checked={hosp.modules?.[mod]?.enabled !== false} 
                                onChange={async (nextEnabled) => {
                                  // Keep track of the original state for rollback on error
                                  if (!rollbackModulesRef.current[hosp._id]) {
                                    rollbackModulesRef.current[hosp._id] = hosp.modules || {};
                                  }

                                  const currentModules = latestModulesRef.current[hosp._id] || hosp.modules || {};
                                  const updatedModules = { ...currentModules, [mod]: { enabled: nextEnabled, lastMod: new Date().toLocaleDateString() } };
                                  latestModulesRef.current[hosp._id] = updatedModules;

                                  // Optimistically update frontend state immediately
                                  setHospitals(prev => prev.map(h => h._id === hosp._id ? { ...h, modules: updatedModules } : h));

                                  // Clear previous timeout
                                  if (moduleUpdateTimeouts.current[hosp._id]) {
                                    clearTimeout(moduleUpdateTimeouts.current[hosp._id]);
                                  }

                                  // Set a new debounced timeout (750ms after the last toggle action)
                                  const thisTimeoutId = setTimeout(async () => {
                                    const token = localStorage.getItem('token');
                                    try {
                                      const res = await fetch(`/api/superadmin/hospitals/${hosp._id}`, {
                                        method: 'PUT',
                                        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                                        body: JSON.stringify({ modules: updatedModules })
                                      });
                                      if (res.ok) {
                                        const updated = await res.json();
                                        // Only sync from server if this is still the latest scheduled timeout
                                        if (moduleUpdateTimeouts.current[hosp._id] === thisTimeoutId) {
                                          setHospitals(prev => prev.map(h => h._id === hosp._id ? updated : h));
                                          delete latestModulesRef.current[hosp._id];
                                          delete rollbackModulesRef.current[hosp._id];
                                        }
                                      } else {
                                        // Rollback on failure
                                        if (moduleUpdateTimeouts.current[hosp._id] === thisTimeoutId) {
                                          setHospitals(prev => prev.map(h => h._id === hosp._id ? { ...h, modules: rollbackModulesRef.current[hosp._id] } : h));
                                          delete latestModulesRef.current[hosp._id];
                                          delete rollbackModulesRef.current[hosp._id];
                                        }
                                      }
                                    } catch (err) {
                                      console.error(err);
                                      // Rollback on failure
                                      if (moduleUpdateTimeouts.current[hosp._id] === thisTimeoutId) {
                                        setHospitals(prev => prev.map(h => h._id === hosp._id ? { ...h, modules: rollbackModulesRef.current[hosp._id] } : h));
                                        delete latestModulesRef.current[hosp._id];
                                        delete rollbackModulesRef.current[hosp._id];
                                      }
                                    }
                                  }, 750);

                                  moduleUpdateTimeouts.current[hosp._id] = thisTimeoutId;
                                }}
                              />
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Doctor Clinical Mode Section */}
                      <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                          <strong style={{ fontSize: '10px', color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.5px' }}>DOCTOR CLINICAL MODE</strong>
                          <span style={{ 
                            fontSize: '10px', 
                            fontWeight: 800, 
                            padding: '2px 8px', 
                            borderRadius: '12px',
                            background: (hosp.doctorClinicalMode || 'ONLINE') === 'ONLINE' ? '#EFF6FF' : '#FFF7ED',
                            color: (hosp.doctorClinicalMode || 'ONLINE') === 'ONLINE' ? '#2563EB' : '#EA580C',
                            border: `1px solid ${(hosp.doctorClinicalMode || 'ONLINE') === 'ONLINE' ? '#BFDBFE' : '#FED7AA'}`
                          }}>
                            ● {(hosp.doctorClinicalMode || 'ONLINE')}
                          </span>
                        </div>

                        <div style={{ background: '#F8FAFC', padding: '14px', borderRadius: '10px', border: '1px solid #E2E8F0', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                          <div style={{ display: 'flex', gap: '6px', background: '#E2E8F0', padding: '3px', borderRadius: '8px' }}>
                            <button
                              type="button"
                              onClick={async () => {
                                const newMode = 'ONLINE';
                                if ((hosp.doctorClinicalMode || 'ONLINE') === newMode) return;
                                const originalMode = hosp.doctorClinicalMode || 'ONLINE';
                                setHospitals(prev => prev.map(h => h._id === hosp._id ? { ...h, doctorClinicalMode: newMode } : h));
                                const token = localStorage.getItem('token');
                                try {
                                  const res = await fetch(`/api/superadmin/hospitals/${hosp._id}`, {
                                    method: 'PUT',
                                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                                    body: JSON.stringify({ doctorClinicalMode: newMode })
                                  });
                                  if (!res.ok) {
                                    setHospitals(prev => prev.map(h => h._id === hosp._id ? { ...h, doctorClinicalMode: originalMode } : h));
                                    showToast('Failed to update Doctor Clinical Mode', 'error');
                                  } else {
                                    const updated = await res.json();
                                    setHospitals(prev => prev.map(h => h._id === hosp._id ? { ...h, doctorClinicalMode: updated.doctorClinicalMode || newMode } : h));
                                    showToast('Doctor Clinical Mode set to ONLINE', 'success');
                                  }
                                } catch (err) {
                                  console.error(err);
                                  setHospitals(prev => prev.map(h => h._id === hosp._id ? { ...h, doctorClinicalMode: originalMode } : h));
                                  showToast('Network error updating Doctor Clinical Mode', 'error');
                                }
                              }}
                              style={{
                                flex: 1,
                                padding: '8px 12px',
                                border: 'none',
                                borderRadius: '6px',
                                fontSize: '11px',
                                fontWeight: 800,
                                cursor: 'pointer',
                                transition: 'all 0.2s ease',
                                background: (hosp.doctorClinicalMode || 'ONLINE') === 'ONLINE' ? '#2563EB' : 'transparent',
                                color: (hosp.doctorClinicalMode || 'ONLINE') === 'ONLINE' ? '#FFFFFF' : '#64748B',
                                boxShadow: (hosp.doctorClinicalMode || 'ONLINE') === 'ONLINE' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none'
                              }}
                            >
                              ONLINE
                            </button>

                            <button
                              type="button"
                              onClick={async () => {
                                const newMode = 'OFFLINE';
                                if ((hosp.doctorClinicalMode || 'ONLINE') === newMode) return;
                                const originalMode = hosp.doctorClinicalMode || 'ONLINE';
                                setHospitals(prev => prev.map(h => h._id === hosp._id ? { ...h, doctorClinicalMode: newMode } : h));
                                const token = localStorage.getItem('token');
                                try {
                                  const res = await fetch(`/api/superadmin/hospitals/${hosp._id}`, {
                                    method: 'PUT',
                                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                                    body: JSON.stringify({ doctorClinicalMode: newMode })
                                  });
                                  if (!res.ok) {
                                    setHospitals(prev => prev.map(h => h._id === hosp._id ? { ...h, doctorClinicalMode: originalMode } : h));
                                    showToast('Failed to update Doctor Clinical Mode', 'error');
                                  } else {
                                    const updated = await res.json();
                                    setHospitals(prev => prev.map(h => h._id === hosp._id ? { ...h, doctorClinicalMode: updated.doctorClinicalMode || newMode } : h));
                                    showToast('Doctor Clinical Mode set to OFFLINE', 'success');
                                  }
                                } catch (err) {
                                  console.error(err);
                                  setHospitals(prev => prev.map(h => h._id === hosp._id ? { ...h, doctorClinicalMode: originalMode } : h));
                                  showToast('Network error updating Doctor Clinical Mode', 'error');
                                }
                              }}
                              style={{
                                flex: 1,
                                padding: '8px 12px',
                                border: 'none',
                                borderRadius: '6px',
                                fontSize: '11px',
                                fontWeight: 800,
                                cursor: 'pointer',
                                transition: 'all 0.2s ease',
                                background: (hosp.doctorClinicalMode || 'ONLINE') === 'OFFLINE' ? '#EA580C' : 'transparent',
                                color: (hosp.doctorClinicalMode || 'ONLINE') === 'OFFLINE' ? '#FFFFFF' : '#64748B',
                                boxShadow: (hosp.doctorClinicalMode || 'ONLINE') === 'OFFLINE' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none'
                              }}
                            >
                              OFFLINE
                            </button>
                          </div>

                          <div style={{ fontSize: '11px', lineHeight: 1.4, color: '#64748B' }}>
                            {(hosp.doctorClinicalMode || 'ONLINE') === 'ONLINE' ? (
                              <div>
                                <strong style={{ color: '#1E293B' }}>ONLINE Mode:</strong> Doctors use Curoxa's digital clinical consultation and prescription workflow.
                              </div>
                            ) : (
                              <div>
                                <strong style={{ color: '#1E293B' }}>OFFLINE Mode:</strong> Doctors use Curoxa for HR/self-service only. Prescriptions are written physically and uploaded by Reception.
                              </div>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Limits Sliders */}
                      <div>
                        <strong style={{ fontSize: '10px', color: '#64748B', display: 'block', marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>PROVISIONED SYSTEM LIMITS</strong>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', background: '#F8FAFC', padding: '14px', borderRadius: '10px', border: '1px solid #E2E8F0' }}>
                          <CustomSlider
                            label={`Staff Accounts (${hosp.limits?.staffUsed || 0} used)`}
                            min={1}
                            max={100}
                            value={hosp.limits?.staffLimit || 20}
                            onChange={async (val) => {
                              const token = localStorage.getItem('token');
                              const updatedLimits = { ...hosp.limits, staffLimit: val };
                              // Optimistically update frontend state
                              setHospitals(prev => prev.map(h => h._id === hosp._id ? { ...h, limits: updatedLimits } : h));
                              try {
                                const res = await fetch(`/api/superadmin/hospitals/${hosp._id}`, {
                                  method: 'PUT',
                                  headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                                  body: JSON.stringify({ limits: updatedLimits })
                                });
                                if (res.ok) {
                                  const updated = await res.json();
                                  setHospitals(prev => prev.map(h => h._id === hosp._id ? updated : h));
                                } else {
                                  // Rollback on failure
                                  setHospitals(prev => prev.map(h => h._id === hosp._id ? hosp : h));
                                }
                              } catch (err) { 
                                console.error(err); 
                                // Rollback on failure
                                setHospitals(prev => prev.map(h => h._id === hosp._id ? hosp : h));
                              }
                            }}
                          />

                          <CustomSlider
                            label={`Storage Quota (${hosp.limits?.storageUsed || 0} GB used)`}
                            min={1}
                            max={500}
                            value={hosp.limits?.storageLimit || 50}
                            onChange={async (val) => {
                              const token = localStorage.getItem('token');
                              const updatedLimits = { ...hosp.limits, storageLimit: val };
                              // Optimistically update frontend state
                              setHospitals(prev => prev.map(h => h._id === hosp._id ? { ...h, limits: updatedLimits } : h));
                              try {
                                const res = await fetch(`/api/superadmin/hospitals/${hosp._id}`, {
                                  method: 'PUT',
                                  headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                                  body: JSON.stringify({ limits: updatedLimits })
                                });
                                if (res.ok) {
                                  const updated = await res.json();
                                  setHospitals(prev => prev.map(h => h._id === hosp._id ? updated : h));
                                } else {
                                  // Rollback on failure
                                  setHospitals(prev => prev.map(h => h._id === hosp._id ? hosp : h));
                                }
                              } catch (err) { 
                                console.error(err); 
                                // Rollback on failure
                                setHospitals(prev => prev.map(h => h._id === hosp._id ? hosp : h));
                              }
                            }}
                          />
                        </div>
                      </div>

                      {/* Meta Details */}
                      <div>
                        <strong style={{ fontSize: '10px', color: '#64748B', display: 'block', marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>EDIT SUBSCRIPTION & META DETAILS</strong>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', background: '#F8FAFC', padding: '14px', borderRadius: '10px', border: '1px solid #E2E8F0' }}>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                            <span style={{ fontSize: '9px', fontWeight: 800, color: '#64748B' }}>SUBSCRIPTION PLAN</span>
                            <select
                              style={{ ...styles.filterSelect, height: '36px', width: '100%' }}
                              value={
                                selectedPlanForUpgrade || 
                                (() => {
                                  if (!hosp.plan) return '';
                                  const pStr = hosp.plan.toLowerCase();
                                  const matchedPlan = plans.find(p => pStr.includes(p.tier.toLowerCase()) || pStr.includes(p.matchKey.toLowerCase()));
                                  if (matchedPlan) {
                                    return getFormattedPlanString(matchedPlan.matchKey, 'monthly');
                                  }
                                  return 'Custom Plan';
                                })()
                              }
                              onChange={(e) => {
                                setSelectedPlanForUpgrade(e.target.value);
                              }}
                            >
                              {plans.map(p => {
                                const valStr = getFormattedPlanString(p.matchKey, 'monthly');
                                return <option key={p._id} value={valStr}>{valStr}</option>;
                              })}
                              <option value="Custom Plan">Custom Plan</option>
                            </select>
                            <button
                              type="button"
                              onClick={async () => {
                                const val = selectedPlanForUpgrade || (() => {
                                  if (!hosp.plan) return '';
                                  const pStr = hosp.plan.toLowerCase();
                                  const matchedPlan = plans.find(p => pStr.includes(p.tier.toLowerCase()) || pStr.includes(p.matchKey.toLowerCase()));
                                  if (matchedPlan) {
                                    return getFormattedPlanString(matchedPlan.matchKey, 'monthly');
                                  }
                                  return 'Custom Plan';
                                })();

                                const planObj = plans.find(p => getFormattedPlanString(p.matchKey, 'monthly') === val || getFormattedPlanString(p.matchKey, 'annual') === val);
                                
                                let docLimit = 50;
                                let staffLimit = 100;
                                let storageLimit = 200;
                                let revenue = val;
                                let modules = {
                                  reception: { enabled: true },
                                  doctor: { enabled: true },
                                  dpdp: { enabled: true },
                                  pharmacy: { enabled: true },
                                  laboratory: { enabled: true },
                                  inventory: { enabled: false }
                                };

                                if (planObj) {
                                  docLimit = planObj.docs;
                                  staffLimit = planObj.staff;
                                  storageLimit = parseInt(planObj.storage) || 200;
                                  revenue = `₹${planObj.monthlyPrice.toLocaleString()}/mo`;
                                  const modKeys = planObj.modules || [];
                                  modules = {
                                    reception: { enabled: modKeys.includes('reception') },
                                    doctor: { enabled: modKeys.includes('doctor') },
                                    dpdp: { enabled: modKeys.includes('dpdp') },
                                    pharmacy: { enabled: modKeys.includes('pharmacy') },
                                    laboratory: { enabled: modKeys.includes('laboratory') },
                                    inventory: { enabled: modKeys.includes('inventory') }
                                  };
                                }

                                const updatedLimits = {
                                  ...hosp.limits,
                                  doctorsLimit: docLimit,
                                  staffLimit: staffLimit,
                                  storageLimit: storageLimit
                                };

                                const token = localStorage.getItem('token');
                                try {
                                  const res = await fetch(`/api/superadmin/hospitals/${hosp._id}`, {
                                    method: 'PUT',
                                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                                    body: JSON.stringify({
                                      plan: val,
                                      limits: updatedLimits,
                                      modules,
                                      revenue
                                    })
                                  });
                                  if (res.ok) {
                                    const updated = await res.json();
                                    setHospitals(prev => prev.map(h => h._id === hosp._id ? updated : h));
                                    setSelectedPlanForUpgrade('');

                                    // Compute amount for the new plan
                                    let upgradeAmount = 0;
                                    let billingCycle = 'monthly';
                                    if (val.toLowerCase().includes('annual')) {
                                      billingCycle = 'annual';
                                    }
                                    if (planObj) {
                                      upgradeAmount = billingCycle === 'annual' ? planObj.annualPrice : planObj.monthlyPrice;
                                    } else {
                                      // Fallbacks for plans
                                      if (val.toLowerCase().includes('basic')) {
                                        upgradeAmount = billingCycle === 'annual' ? 48000 : 5000;
                                      } else if (val.toLowerCase().includes('enterprise')) {
                                        upgradeAmount = billingCycle === 'annual' ? 480000 : 40000;
                                      } else if (val.toLowerCase().includes('professional')) {
                                        upgradeAmount = billingCycle === 'annual' ? 230400 : 24000;
                                      }
                                    }

                                    // Generate upgrade invoice
                                    const invoiceNum = `INV-2026-${Math.floor(100 + Math.random() * 900)}`;
                                    const invRes = await fetch('/api/superadmin/invoices', {
                                      method: 'POST',
                                      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                                      body: JSON.stringify({
                                        invoiceNum,
                                        hospital: hosp.name,
                                        subscription: val,
                                        invoiceDate: new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }),
                                        dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }),
                                        amount: upgradeAmount,
                                        gst: Math.round(upgradeAmount * 0.18),
                                        status: upgradeAmount === 0 ? 'Paid' : 'Pending',
                                        billingCycle: billingCycle === 'annual' ? 'Annual' : 'Monthly',
                                        billingPeriod: 'Subscription Upgrade Cycle',
                                        address: hosp.address || 'Hospital Address',
                                        gstin: hosp.gstin || '27AAAAA1111A1Z1',
                                        notes: `Subscription plan upgraded to ${val}.`
                                      })
                                    });

                                    if (invRes.ok) {
                                      const newInv = await invRes.json();
                                      setInvoices(prev => [newInv, ...prev]);
                                    }

                                    showToast('Subscription plan updated and upgrade invoice generated successfully!', 'success');
                                  } else {
                                    showToast('Failed to update subscription plan.', 'error');
                                  }
                                } catch (err) {
                                  console.error(err);
                                  showToast('Error updating subscription plan.', 'error');
                                }
                              }}
                              style={{
                                width: '100%',
                                height: '36px',
                                background: '#2563EB',
                                color: '#FFFFFF',
                                border: 'none',
                                borderRadius: '6px',
                                fontSize: '12px',
                                fontWeight: 700,
                                cursor: 'pointer',
                                marginTop: '4px',
                                transition: 'all 0.15s',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '6px'
                              }}
                              onMouseOver={e => e.currentTarget.style.background = '#1D4ED8'}
                              onMouseOut={e => e.currentTarget.style.background = '#2563EB'}
                            >
                              Save Subscription Changes
                            </button>
                          </div>

                          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                            <span style={{ fontSize: '9px', fontWeight: 800, color: '#64748B' }}>CSM MANAGER</span>
                            <input
                              type="text"
                              style={styles.formInput}
                              value={hosp.csm || ''}
                              onChange={async (e) => {
                                const val = e.target.value;
                                const token = localStorage.getItem('token');
                                try {
                                  await fetch(`/api/superadmin/hospitals/${hosp._id}`, {
                                    method: 'PUT',
                                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                                    body: JSON.stringify({ csm: val })
                                  });
                                  setHospitals(prev => prev.map(h => h._id === hosp._id ? { ...h, csm: val } : h));
                                } catch (err) { console.error(err); }
                              }}
                            />
                          </div>

                          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                            <span style={{ fontSize: '9px', fontWeight: 800, color: '#64748B' }}>GSTIN</span>
                            <div style={{ display: 'flex', gap: '6px' }}>
                              <input
                                type="text"
                                style={{ ...styles.formInput, flex: 1 }}
                                value={hosp.gst || ''}
                                onChange={async (e) => {
                                  const val = e.target.value;
                                  const token = localStorage.getItem('token');
                                  try {
                                    await fetch(`/api/superadmin/hospitals/${hosp._id}`, {
                                      method: 'PUT',
                                      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                                      body: JSON.stringify({ 
                                        gst: val,
                                        isGstVerified: false,
                                        gstVerificationDetails: null
                                      })
                                    });
                                    setHospitals(prev => prev.map(h => h._id === hosp._id ? { ...h, gst: val, isGstVerified: false, gstVerificationDetails: null } : h));
                                  } catch (err) { console.error(err); }
                                }}
                              />
                              <button
                                type="button"
                                disabled={isVerifyingGstin}
                                onClick={() => handleVerifyGstinForExistingHospital(hosp)}
                                style={{ ...styles.btnSecondary, height: '34px', padding: '0 12px', fontSize: '11px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                              >
                                {isVerifyingGstin ? '...' : hosp.isGstVerified ? '✓' : 'Verify'}
                              </button>
                            </div>
                            {hosp.isGstVerified && hosp.gstVerificationDetails && (
                              <div style={{
                                marginTop: '4px',
                                padding: '6px 8px',
                                background: '#F0FDF4',
                                border: '1px solid #BBF7D0',
                                borderRadius: '6px',
                                fontSize: '10px',
                                color: '#166534',
                                lineHeight: '1.3'
                              }}>
                                <div style={{ fontWeight: 800 }}>Verified GSTIN Details</div>
                                <div>Legal Name: {hosp.gstVerificationDetails.legalName || hosp.gstVerificationDetails.tradeName}</div>
                                <div>State: {hosp.gstVerificationDetails.state || 'Registered'}</div>
                                <div>PAN: {hosp.gstVerificationDetails.pan || 'N/A'}</div>
                              </div>
                            )}
                          </div>

                          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                            <span style={{ fontSize: '9px', fontWeight: 800, color: '#64748B' }}>DRUG LICENSE NUMBER</span>
                            <div style={{ display: 'flex', gap: '6px' }}>
                              <input
                                type="text"
                                style={{ ...styles.formInput, flex: 1 }}
                                value={hosp.license || ''}
                                onChange={async (e) => {
                                  const val = e.target.value;
                                  const token = localStorage.getItem('token');
                                  try {
                                    await fetch(`/api/superadmin/hospitals/${hosp._id}`, {
                                      method: 'PUT',
                                      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                                      body: JSON.stringify({ 
                                        license: val,
                                        isLicenseVerified: false,
                                        isLicenseVerifiedDetails: null
                                      })
                                    });
                                    setHospitals(prev => prev.map(h => h._id === hosp._id ? { ...h, license: val, isLicenseVerified: false, licenseVerificationDetails: null } : h));
                                  } catch (err) { console.error(err); }
                                }}
                              />
                              <button
                                type="button"
                                disabled={isVerifyingLicense}
                                onClick={() => handleVerifyLicenseForExistingHospital(hosp)}
                                style={{ ...styles.btnSecondary, height: '34px', padding: '0 12px', fontSize: '11px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                              >
                                {isVerifyingLicense ? '...' : hosp.isLicenseVerified ? '✓' : 'Verify'}
                              </button>
                            </div>
                            {hosp.isLicenseVerified && hosp.licenseVerificationDetails && (
                              <div style={{
                                marginTop: '4px',
                                padding: '6px 8px',
                                background: '#F0FDF4',
                                border: '1px solid #BBF7D0',
                                borderRadius: '6px',
                                fontSize: '10px',
                                color: '#166534',
                                lineHeight: '1.3'
                              }}>
                                <div style={{ fontWeight: 800 }}>Verified License Details</div>
                                <div>Issuer: {hosp.licenseVerificationDetails.issuer || 'CDSCO'}</div>
                                <div>Valid Until: {hosp.licenseVerificationDetails.validUntil}</div>
                              </div>
                            )}
                          </div>

                          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                            <span style={{ fontSize: '9px', fontWeight: 800, color: '#64748B' }}>PHYSICAL ADDRESS</span>
                            <input
                              type="text"
                              style={styles.formInput}
                              value={hosp.address || ''}
                              onChange={async (e) => {
                                const val = e.target.value;
                                const token = localStorage.getItem('token');
                                try {
                                  await fetch(`/api/superadmin/hospitals/${hosp._id}`, {
                                    method: 'PUT',
                                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                                    body: JSON.stringify({ address: val })
                                  });
                                  setHospitals(prev => prev.map(h => h._id === hosp._id ? { ...h, address: val } : h));
                                } catch (err) { console.error(err); }
                              }}
                            />
                          </div>
                        </div>
                      </div>

                      {/* Legal & Compliance Section */}
                      <div>
                        <strong style={{ fontSize: '10px', color: '#64748B', display: 'block', marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>LEGAL & COMPLIANCE DETAILS</strong>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', background: '#F8FAFC', padding: '14px', borderRadius: '10px', border: '1px solid #E2E8F0' }}>
                          
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                            <span style={{ fontSize: '9px', fontWeight: 800, color: '#64748B' }}>PAN NUMBER</span>
                            <input
                              type="text"
                              style={styles.formInput}
                              value={hosp.panNumber || ''}
                              placeholder="e.g. ABCDE1234F"
                              onChange={async (e) => {
                                const val = e.target.value.toUpperCase();
                                setHospitals(prev => prev.map(h => h._id === hosp._id ? { ...h, panNumber: val } : h));
                                const token = localStorage.getItem('token');
                                try {
                                  await fetch(`/api/superadmin/hospitals/${hosp._id}`, {
                                    method: 'PUT',
                                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                                    body: JSON.stringify({ panNumber: val })
                                  });
                                } catch (err) { console.error(err); }
                              }}
                            />
                          </div>

                          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                            <span style={{ fontSize: '9px', fontWeight: 800, color: '#64748B' }}>CIN / CORP ID</span>
                            <input
                              type="text"
                              style={styles.formInput}
                              value={hosp.corpId || ''}
                              placeholder="e.g. U85110DL2025PTC384920"
                              onChange={async (e) => {
                                const val = e.target.value.toUpperCase();
                                setHospitals(prev => prev.map(h => h._id === hosp._id ? { ...h, corpId: val } : h));
                                const token = localStorage.getItem('token');
                                try {
                                  await fetch(`/api/superadmin/hospitals/${hosp._id}`, {
                                    method: 'PUT',
                                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                                    body: JSON.stringify({ corpId: val })
                                  });
                                } catch (err) { console.error(err); }
                              }}
                            />
                          </div>

                          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                            <span style={{ fontSize: '9px', fontWeight: 800, color: '#64748B' }}>SIGNATORY NAME</span>
                            <input
                              type="text"
                              style={styles.formInput}
                              value={hosp.signatoryName || ''}
                              placeholder="Authorized Signatory Name"
                              onChange={async (e) => {
                                const val = e.target.value;
                                setHospitals(prev => prev.map(h => h._id === hosp._id ? { ...h, signatoryName: val } : h));
                                const token = localStorage.getItem('token');
                                try {
                                  await fetch(`/api/superadmin/hospitals/${hosp._id}`, {
                                    method: 'PUT',
                                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                                    body: JSON.stringify({ signatoryName: val })
                                  });
                                } catch (err) { console.error(err); }
                              }}
                            />
                          </div>

                          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                            <span style={{ fontSize: '9px', fontWeight: 800, color: '#64748B' }}>FIRE SAFETY CERTIFICATE</span>
                            <input
                              type="text"
                              style={styles.formInput}
                              value={hosp.fireSafetyCertificate || ''}
                              placeholder="Certificate registration number"
                              onChange={async (e) => {
                                const val = e.target.value;
                                setHospitals(prev => prev.map(h => h._id === hosp._id ? { ...h, fireSafetyCertificate: val } : h));
                                const token = localStorage.getItem('token');
                                try {
                                  await fetch(`/api/superadmin/hospitals/${hosp._id}`, {
                                    method: 'PUT',
                                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                                    body: JSON.stringify({ fireSafetyCertificate: val })
                                  });
                                } catch (err) { console.error(err); }
                              }}
                            />
                          </div>

                          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                            <span style={{ fontSize: '9px', fontWeight: 800, color: '#64748B' }}>POLLUTION CONTROL CERTIFICATE</span>
                            <input
                              type="text"
                              style={styles.formInput}
                              value={hosp.pollutionCertificate || ''}
                              placeholder="Certificate registration number"
                              onChange={async (e) => {
                                const val = e.target.value;
                                setHospitals(prev => prev.map(h => h._id === hosp._id ? { ...h, pollutionCertificate: val } : h));
                                const token = localStorage.getItem('token');
                                try {
                                  await fetch(`/api/superadmin/hospitals/${hosp._id}`, {
                                    method: 'PUT',
                                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                                    body: JSON.stringify({ pollutionCertificate: val })
                                  });
                                } catch (err) { console.error(err); }
                              }}
                            />
                          </div>

                        </div>
                      </div>

                      {/* Admin Credentials */}
                      <div>
                        <strong style={{ fontSize: '10px', color: '#64748B', display: 'block', marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>HOSPITAL ADMIN CREDENTIALS</strong>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', background: '#F8FAFC', padding: '14px', borderRadius: '10px', border: '1px solid #E2E8F0' }}>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                            <span style={{ fontSize: '9px', fontWeight: 800, color: '#64748B' }}>ADMIN USERNAME (STAFF ID / PHONE)</span>
                            <input
                              type="text"
                              style={styles.formInput}
                              value={hosp.adminUsername || ''}
                              placeholder="Admin Username"
                              onChange={(e) => {
                                const val = e.target.value;
                                setHospitals(prev => prev.map(h => h._id === hosp._id ? { ...h, adminUsername: val } : h));
                              }}
                            />
                          </div>

                          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                            <span style={{ fontSize: '9px', fontWeight: 800, color: '#64748B' }}>NEW PASSWORD</span>
                            <div style={{ position: 'relative', display: 'flex', alignItems: 'center', width: '100%' }}>
                              <input
                                type={showPasswords[hosp._id] ? 'text' : 'password'}
                                style={{ ...styles.formInput, paddingRight: '40px', width: '100%' }}
                                placeholder="Enter new password"
                                value={tempPasswords[hosp._id] || ''}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  setTempPasswords(prev => ({ ...prev, [hosp._id]: val }));
                                }}
                              />
                              <button
                                type="button"
                                onClick={() => togglePasswordVisibility(hosp._id)}
                                style={{
                                  position: 'absolute',
                                  right: '10px',
                                  background: 'none',
                                  border: 'none',
                                  cursor: 'pointer',
                                  padding: '4px',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  color: '#64748B'
                                }}
                              >
                                <LucideIcon name={showPasswords[hosp._id] ? 'eye-off' : 'eye'} style={{ width: '15px', height: '15px' }} />
                              </button>
                            </div>
                          </div>

                          <button 
                            type="button"
                            style={{ ...styles.btnPrimary, background: '#2563EB', width: '100%', padding: '10px', fontSize: '12px', marginTop: '4px' }}
                            onClick={async () => {
                              const token = localStorage.getItem('token');
                              const newPassword = tempPasswords[hosp._id];
                              if (!hosp.adminUsername && !newPassword) {
                                setCredentialsMsg({ text: "Please fill in the admin username or a new password.", type: "error" });
                                return;
                              }
                              setCredentialsMsg({ text: "Updating credentials...", type: "info" });
                              try {
                                const res = await fetch(`/api/superadmin/hospitals/${hosp._id}/admin`, {
                                  method: 'PUT',
                                  headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                                  body: JSON.stringify({
                                    adminUsername: hosp.adminUsername,
                                    adminPassword: newPassword
                                  })
                                });
                                const data = await res.json();
                                if (res.ok) {
                                  setCredentialsMsg({ text: data.message || "Admin credentials updated successfully.", type: "success" });
                                  setTempPasswords(prev => ({ ...prev, [hosp._id]: '' }));
                                } else {
                                  setCredentialsMsg({ text: data.error || "Failed to update admin credentials.", type: "error" });
                                }
                              } catch (err) {
                                console.error(err);
                                setCredentialsMsg({ text: "An error occurred while updating credentials.", type: "error" });
                              }
                            }}
                          >
                            Update Credentials
                          </button>

                          {credentialsMsg.text && (
                            <div style={{
                              padding: '10px', borderRadius: '6px', fontSize: '11px',
                              background: credentialsMsg.type === 'success' ? '#D1FAE5' : credentialsMsg.type === 'error' ? '#FEE2E2' : '#EFF6FF',
                              color: credentialsMsg.type === 'success' ? '#065F46' : credentialsMsg.type === 'error' ? '#991B1B' : '#1E40AF',
                              border: `1px solid ${credentialsMsg.type === 'success' ? '#A7F3D0' : credentialsMsg.type === 'error' ? '#FCA5A5' : '#BFDBFE'}`
                            }}>
                              {credentialsMsg.text}
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Impersonation Portal Access */}
                      <div>
                        <strong style={{ fontSize: '10px', color: '#64748B', display: 'block', marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>ADMINISTRATIVE TROUBLESHOOTING</strong>
                        <button
                          type="button"
                          style={{
                            border: 'none',
                            background: '#2563EB',
                            color: '#FFF',
                            width: '100%',
                            padding: '10px',
                            borderRadius: '6px',
                            fontSize: '12.5px',
                            fontWeight: 850,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '8px',
                            marginBottom: '16px',
                            boxShadow: '0 4px 12px rgba(37, 99, 235, 0.2)'
                          }}
                          onClick={() => {
                            setImpersonatingHospital(hosp);
                            setIsConfigDrawerOpen(false);
                            showToast(`Connected to impersonation session for ${hosp.name}`, 'success');
                          }}
                        >
                          <LucideIcon name="shield" style={{ width: '14px', height: '14px' }} />
                          Impersonate Tenant Portal
                        </button>
                      </div>

                      {/* Suspension and Deletion */}
                      <div>
                        <strong style={{ fontSize: '10px', color: '#64748B', display: 'block', marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>SUSPENSION OPERATIONS</strong>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                          <button 
                            style={{ ...styles.btnPrimary, background: hosp.status === 'Active' ? '#EF4444' : '#10B981', width: '100%', padding: '10px' }}
                            onClick={async () => {
                              const nextStatus = hosp.status === 'Active' ? 'Suspended' : 'Active';
                              const token = localStorage.getItem('token');
                              const targetId = hosp._id || hosp.code || hosp.id;
                              try {
                                const res = await fetch(`/api/superadmin/hospitals/${targetId}`, {
                                  method: 'PUT',
                                  headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                                  body: JSON.stringify({ status: nextStatus })
                                });
                                if (res.ok) {
                                  const updated = await res.json();
                                  setHospitals(prev => prev.map(h => (h._id && updated._id ? h._id === updated._id : h.code === hosp.code) ? { ...h, ...updated, status: nextStatus } : h));
                                  showToast(`Hospital "${hosp.name}" ${nextStatus === 'Suspended' ? 'suspended' : 'reactivated'} successfully!`, nextStatus === 'Suspended' ? 'warning' : 'success');
                                  // Refresh full list from backend
                                  try {
                                    const refreshRes = await fetch('/api/superadmin/hospitals', { headers: { 'Authorization': `Bearer ${token}` } });
                                    if (refreshRes.ok) {
                                      setHospitals(await refreshRes.json());
                                    }
                                  } catch (_) {}
                                } else {
                                  const errData = await res.json().catch(() => ({}));
                                  showToast(errData.error || 'Failed to update hospital status.', 'error');
                                }
                              } catch (err) {
                                console.error(err);
                                showToast('Error updating hospital status.', 'error');
                              }
                            }}
                          >
                            {hosp.status === 'Active' ? 'Suspend Account' : 'Reactivate Account'}
                          </button>

                          <button 
                            style={{ border: '1px solid #EF4444', background: '#FFF', color: '#EF4444', width: '100%', padding: '10px', borderRadius: '6px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}
                            onClick={() => {
                              setConfirmModalConfig({
                                title: 'Delete Hospital Account',
                                message: `Are you sure you want to permanently delete the hospital "${hosp.name}"? This action cannot be undone. All staff user accounts, patients, and clinical records will be permanently purged.`,
                                confirmText: 'Yes, Delete Hospital',
                                cancelText: 'Cancel',
                                danger: true,
                                onConfirm: async () => {
                                  setConfirmModalConfig(prev => ({ ...prev, isLoading: true, confirmText: 'Deleting Hospital...' }));
                                  const token = localStorage.getItem('token');
                                  const deleteTargetId = hosp._id || hosp.code || hosp.id;
                                  try {
                                    const res = await fetch(`/api/superadmin/hospitals/${deleteTargetId}`, {
                                      method: 'DELETE',
                                      headers: { 'Authorization': `Bearer ${token}` }
                                    });
                                    if (res.ok) {
                                      setHospitals(prev => prev.filter(h => (h._id ? h._id !== hosp._id : h.code !== hosp.code)));
                                      setSelectedHospitalId(null);
                                      setIsConfigDrawerOpen(false);
                                      showToast(`Hospital "${hosp.name}" and all associated data deleted successfully!`, 'success');
                                      try {
                                        const refreshRes = await fetch('/api/superadmin/hospitals', { headers: { 'Authorization': `Bearer ${token}` } });
                                        if (refreshRes.ok) {
                                          setHospitals(await refreshRes.json());
                                        }
                                      } catch (_) {}
                                    } else {
                                      const errData = await res.json().catch(() => ({}));
                                      showToast(errData.error || 'Failed to delete hospital.', 'error');
                                    }
                                  } catch (err) {
                                    console.error(err);
                                    showToast('Error deleting hospital.', 'error');
                                  } finally {
                                    setConfirmModalConfig(null);
                                  }
                                }
                              });
                            }}
                          >
                            Delete Hospital Account
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* SUBSCRIPTION MANAGEMENT TAB */}
            {isTabAllowed && activeTab === 'subscription-mgmt' && (() => {
              const subItemsPerPage = 10;
              const filteredSubHospitals = hospitals.filter(h => {
                const q = subSearch.trim().toLowerCase();
                const matchesSearch = !q || 
                  (h.name && h.name.toLowerCase().includes(q)) ||
                  (h.plan && h.plan.toLowerCase().includes(q)) ||
                  (h.status && h.status.toLowerCase().includes(q)) ||
                  (h.code && h.code.toLowerCase().includes(q));
                
                const matchesPlan = subPlanFilter === 'All' || 
                  (h.plan && h.plan.toLowerCase().includes(subPlanFilter.toLowerCase()));
                const matchesStatus = subStatusFilter === 'All' || h.status === subStatusFilter;
                
                return matchesSearch && matchesPlan && matchesStatus;
              });

              const totalSubPages = Math.max(1, Math.ceil(filteredSubHospitals.length / subItemsPerPage));
              const safeCurrentPage = Math.min(subCurrentPage, totalSubPages);
              const paginatedSubHospitals = filteredSubHospitals.slice((safeCurrentPage - 1) * subItemsPerPage, safeCurrentPage * subItemsPerPage);

              return (
                <div style={styles.pageBodyScroll}>
                  {/* Top Header */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                      <div style={{
                        width: '44px',
                        height: '44px',
                        borderRadius: '12px',
                        background: 'linear-gradient(135deg, #EFF6FF 0%, #DBEAFE 100%)',
                        color: '#2563EB',
                        border: '1px solid #BFDBFE',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        boxShadow: '0 2px 8px rgba(37, 99, 235, 0.12)'
                      }}>
                        <LucideIcon name="credit-card" style={{ width: '22px', height: '22px' }} />
                      </div>
                      <div>
                        <h2 style={{ ...styles.cardHeaderTitle, margin: 0, fontSize: '20px', letterSpacing: '-0.3px' }}>
                          SaaS Pricing Plans & Limits
                        </h2>
                        <p style={{ ...styles.cardHeaderSub, margin: '3px 0 0 0', fontSize: '12.5px' }}>
                          Configure subscription tiers, price metrics, and resource allocation templates. Active subscriber counts are live from the hospitals database.
                        </p>
                      </div>
                    </div>
                  </div>

                  <style>{`
                    .subscription-plans-section {
                      margin-top: 14px;
                    }
                    .plan-toggle-container {
                      display: flex;
                      justify-content: center;
                      align-items: center;
                      gap: 16px;
                      margin: 20px 0 24px 0;
                    }
                    .toggle-switch-pill {
                      display: flex;
                      background: #E2E8F0;
                      border-radius: 99px;
                      padding: 4px;
                      position: relative;
                      cursor: pointer;
                      width: 220px;
                      user-select: none;
                      box-shadow: inset 0 2px 4px rgba(0,0,0,0.05);
                    }
                    .toggle-switch-bg {
                      position: absolute;
                      top: 4px;
                      bottom: 4px;
                      width: 106px;
                      background: #FFFFFF;
                      border-radius: 99px;
                      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.12);
                      transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
                    }
                    .toggle-switch-pill.annual .toggle-switch-bg {
                      transform: translateX(106px);
                    }
                    .toggle-option {
                      flex: 1;
                      text-align: center;
                      padding: 8px 0;
                      font-size: 13px;
                      font-weight: 800;
                      color: #64748B;
                      z-index: 2;
                      transition: color 0.3s;
                    }
                    .toggle-option.active {
                      color: #2563EB;
                    }
                    .plans-grid {
                      display: grid;
                      grid-template-columns: repeat(auto-fit, minmax(310px, 1fr));
                      gap: 24px;
                    }
                    .flip-card {
                      perspective: 1000px;
                      height: 550px;
                    }
                    .flip-card-inner {
                      position: relative;
                      width: 100%;
                      height: 100%;
                      transition: transform 0.8s cubic-bezier(0.175, 0.885, 0.32, 1.275);
                      transform-style: preserve-3d;
                    }
                    .flip-card.flipped .flip-card-inner {
                      transform: rotateY(180deg);
                    }
                    .flip-card-front, .flip-card-back {
                      position: absolute;
                      width: 100%;
                      height: 100%;
                      -webkit-backface-visibility: hidden;
                      backface-visibility: hidden;
                      border-radius: 20px;
                      border: 1px solid #E2E8F0;
                      background: #FFFFFF;
                      box-shadow: 0 8px 24px rgba(15, 23, 42, 0.04);
                      padding: 24px;
                      box-sizing: border-box;
                      display: flex;
                      flex-direction: column;
                      transition: box-shadow 0.2s ease, transform 0.2s ease;
                    }
                    .flip-card-front:hover, .flip-card-back:hover {
                      box-shadow: 0 14px 32px rgba(15, 23, 42, 0.08);
                    }
                    .flip-card-back {
                      transform: rotateY(180deg);
                      background: linear-gradient(135deg, #FFFFFF 0%, #F0FDF4 100%);
                      border-color: #10B981;
                    }
                    .plan-title {
                      font-size: 20px;
                      font-weight: 900;
                      color: #0F172A;
                      margin: 0;
                    }
                    .plan-price-val {
                      font-size: 32px;
                      font-weight: 900;
                      color: #2563EB;
                      font-family: 'Outfit', sans-serif;
                      margin-bottom: 12px;
                    }
                  `}</style>

                  {/* Toggle Switch */}
                  <div className="plan-toggle-container">
                    <span style={{ fontSize: '13px', fontWeight: 800, color: billingCycle === 'monthly' ? '#2563EB' : '#64748B' }}>Monthly Pricing</span>
                    <div 
                      className={`toggle-switch-pill ${billingCycle === 'annual' ? 'annual' : ''}`}
                      onClick={() => setBillingCycle(prev => prev === 'monthly' ? 'annual' : 'monthly')}
                    >
                      <div className="toggle-switch-bg" />
                      <span className={`toggle-option ${billingCycle === 'monthly' ? 'active' : ''}`}>Monthly</span>
                      <span className={`toggle-option ${billingCycle === 'annual' ? 'active' : ''}`}>Annual</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontSize: '13px', fontWeight: 800, color: billingCycle === 'annual' ? '#10B981' : '#64748B' }}>Annual Pricing</span>
                      <span style={{
                        background: '#D1FAE5',
                        color: '#065F46',
                        fontSize: '11px',
                        fontWeight: 900,
                        padding: '3px 8px',
                        borderRadius: '12px',
                        textTransform: 'uppercase',
                        border: '1px solid #A7F3D0'
                      }}>
                        Save 20%
                      </span>
                    </div>
                  </div>

                  {/* Pricing Cards Grid */}
                  <div className="plans-grid" style={{ marginBottom: '28px' }}>
                    {plans.map(plan => {
                      const activeCount = hospitals.filter(h => {
                        if (h.status !== 'Active') return false;
                        if (!h.plan) return false;
                        const pLower = h.plan.toLowerCase();
                        let planCategory = 'basic';
                        
                        if (pLower.includes('enterprise') || pLower.includes('elite')) {
                          planCategory = 'enterprise';
                        } else if (pLower.includes('pro') || pLower.includes('professional') || pLower.includes('premium')) {
                          planCategory = 'professional';
                        } else if (pLower.includes('custom')) {
                          planCategory = 'custom';
                        } else if (pLower.includes('basic') || pLower.includes('standard') || pLower.includes('starter')) {
                          planCategory = 'basic';
                        }
                        
                        return planCategory === plan.matchKey.toLowerCase();
                      }).length;

                      const priceVal = billingCycle === 'annual' ? plan.annualPrice : plan.monthlyPrice;
                      const totalRevenue = activeCount * priceVal;
                      const planColor = plan.matchKey === 'basic' ? '#2563EB' : plan.matchKey === 'professional' ? '#10B981' : plan.matchKey === 'enterprise' ? '#8B5CF6' : '#64748B';

                      return (
                        <div key={plan._id || plan.matchKey} className={`flip-card ${billingCycle === 'annual' ? 'flipped' : ''}`}>
                          <div className="flip-card-inner">
                            
                            {/* FRONT - MONTHLY */}
                            <div className="flip-card-front" style={{ borderTop: `4px solid ${planColor}` }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                                <h4 className="plan-title">{plan.tier}</h4>
                                <button 
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setEditingPlan(JSON.parse(JSON.stringify(plan)));
                                    setIsEditingPlanModalOpen(true);
                                  }}
                                  style={{ background: '#F1F5F9', border: '1px solid #E2E8F0', borderRadius: '8px', padding: '5px 10px', fontSize: '11px', fontWeight: 700, color: '#475569', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px', transition: 'all 0.2s' }}
                                >
                                  <LucideIcon name="settings" style={{ width: '12px', height: '12px' }} />
                                  Edit
                                </button>
                              </div>
                              <div className="plan-price-val" style={{ color: planColor }}>
                                ₹{plan.monthlyPrice.toLocaleString()}
                                <span style={{ fontSize: '13px', color: '#64748B', fontWeight: 600 }}>/ month</span>
                              </div>

                              <div style={{ display: 'flex', justifyContent: 'center', gap: '20px', marginBottom: '14px', background: '#F8FAFC', padding: '10px', borderRadius: '10px', border: '1px solid #F1F5F9' }}>
                                <div style={{ textAlign: 'center' }}>
                                  <div style={{ fontSize: '17px', fontWeight: 900, color: planColor }}>{activeCount}</div>
                                  <div style={{ fontSize: '8.5px', color: '#64748B', fontWeight: 750, letterSpacing: '0.3px' }}>ACTIVE HOSPITALS</div>
                                </div>
                                <div style={{ width: '1px', background: '#E2E8F0' }} />
                                <div style={{ textAlign: 'center' }}>
                                  <div style={{ fontSize: '17px', fontWeight: 900, color: '#10B981' }}>₹{totalRevenue.toLocaleString()}</div>
                                  <div style={{ fontSize: '8.5px', color: '#64748B', fontWeight: 750, letterSpacing: '0.3px' }}>MONTHLY MRR</div>
                                </div>
                              </div>

                              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '11.5px', color: '#475569', margin: '8px 0', textAlign: 'left', borderTop: '1px solid #F1F5F9', paddingTop: '10px' }}>
                                <div style={{ marginBottom: '2px', fontSize: '10px', fontWeight: 800, color: '#94A3B8', letterSpacing: '0.5px' }}>RESOURCE LIMITS</div>
                                <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: '#64748B' }}>Max Doctor Slots:</span><strong style={{ color: '#0F172A' }}>{plan.docs}</strong></div>
                                <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: '#64748B' }}>Max Staff Seats:</span><strong style={{ color: '#0F172A' }}>{plan.staff}</strong></div>
                                <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: '#64748B' }}>Storage Vault:</span><strong style={{ color: '#0F172A' }}>{plan.storage}</strong></div>
                              </div>

                              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '11px', color: '#475569', margin: '8px 0', textAlign: 'left', borderTop: '1px solid #F1F5F9', paddingTop: '10px', overflowY: 'auto', flex: 1 }}>
                                <div style={{ marginBottom: '4px', fontSize: '10px', fontWeight: 800, color: '#94A3B8', letterSpacing: '0.5px' }}>INCLUDED MODULES</div>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                                  {plan.modules?.map(m => (
                                    <span key={m} style={{ fontSize: '9.5px', background: '#F1F5F9', color: '#334155', padding: '3px 7px', borderRadius: '6px', textTransform: 'capitalize', fontWeight: 650, border: '1px solid #E2E8F0' }}>{m}</span>
                                  ))}
                                </div>
                              </div>
                            </div>

                            {/* BACK - ANNUAL */}
                            <div className="flip-card-back" style={{ borderTop: `4px solid ${planColor}` }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                                <h4 className="plan-title">{plan.tier} (Annual)</h4>
                                <button 
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setEditingPlan(JSON.parse(JSON.stringify(plan)));
                                    setIsEditingPlanModalOpen(true);
                                  }}
                                  style={{ background: '#FFFFFF', border: '1px solid #A7F3D0', borderRadius: '8px', padding: '5px 10px', fontSize: '11px', fontWeight: 700, color: '#047857', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px' }}
                                >
                                  <LucideIcon name="settings" style={{ width: '12px', height: '12px' }} />
                                  Edit
                                </button>
                              </div>
                              <div className="plan-price-val" style={{ color: '#10B981' }}>
                                ₹{plan.annualPrice.toLocaleString()}
                                <span style={{ fontSize: '13px', color: '#64748B', fontWeight: 600 }}>/ month</span>
                              </div>
                              <div style={{ fontSize: '11px', fontWeight: 800, color: '#047857', marginTop: '-8px', marginBottom: '8px', textAlign: 'center' }}>
                                ₹{(plan.annualPrice * 12).toLocaleString()} billed annually
                              </div>

                              <div style={{ display: 'flex', justifyContent: 'center', gap: '20px', marginBottom: '14px', background: '#F0FDF4', padding: '10px', borderRadius: '10px', border: '1px solid #DCFCE7' }}>
                                <div style={{ textAlign: 'center' }}>
                                  <div style={{ fontSize: '17px', fontWeight: 900, color: '#10B981' }}>{activeCount}</div>
                                  <div style={{ fontSize: '8.5px', color: '#047857', fontWeight: 750, letterSpacing: '0.3px' }}>ACTIVE HOSPITALS</div>
                                </div>
                                <div style={{ width: '1px', background: '#BBF7D0' }} />
                                <div style={{ textAlign: 'center' }}>
                                  <div style={{ fontSize: '17px', fontWeight: 900, color: '#10B981' }}>₹{(totalRevenue * 12).toLocaleString()}</div>
                                  <div style={{ fontSize: '8.5px', color: '#047857', fontWeight: 750, letterSpacing: '0.3px' }}>ANNUAL REVENUE</div>
                                </div>
                              </div>

                              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '11.5px', color: '#475569', margin: '8px 0', textAlign: 'left', borderTop: '1px solid #E2E8F0', paddingTop: '10px' }}>
                                <div style={{ marginBottom: '2px', fontSize: '10px', fontWeight: 800, color: '#94A3B8', letterSpacing: '0.5px' }}>RESOURCE LIMITS</div>
                                <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: '#64748B' }}>Max Doctor Slots:</span><strong style={{ color: '#0F172A' }}>{plan.docs}</strong></div>
                                <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: '#64748B' }}>Max Staff Seats:</span><strong style={{ color: '#0F172A' }}>{plan.staff}</strong></div>
                                <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: '#64748B' }}>Storage Vault:</span><strong style={{ color: '#0F172A' }}>{plan.storage}</strong></div>
                              </div>

                              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '11px', color: '#475569', margin: '8px 0', textAlign: 'left', borderTop: '1px solid #E2E8F0', paddingTop: '10px', overflowY: 'auto', flex: 1 }}>
                                <div style={{ marginBottom: '4px', fontSize: '10px', fontWeight: 800, color: '#94A3B8', letterSpacing: '0.5px' }}>INCLUDED MODULES</div>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                                  {plan.modules?.map(m => (
                                    <span key={m} style={{ fontSize: '9.5px', background: '#F1F5F9', color: '#334155', padding: '3px 7px', borderRadius: '6px', textTransform: 'capitalize', fontWeight: 650, border: '1px solid #E2E8F0' }}>{m}</span>
                                  ))}
                                </div>
                              </div>
                            </div>

                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Active Subscribers Table Card with Filter & Pagination */}
                  <div style={{
                    background: '#FFFFFF',
                    borderRadius: '18px',
                    border: '1px solid #E2E8F0',
                    padding: '24px',
                    boxShadow: '0 10px 30px rgba(15, 23, 42, 0.03)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '16px'
                  }}>
                    {/* Header Controls Bar */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '14px' }}>
                      <div>
                        <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 650, color: '#0F172A', display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span>Active Subscriber Breakdown</span>
                          <span style={{
                            fontSize: '11px',
                            fontWeight: 550,
                            background: '#EFF6FF',
                            color: '#2563EB',
                            padding: '2px 8px',
                            borderRadius: '12px',
                            border: '1px solid #DBEAFE'
                          }}>
                            {filteredSubHospitals.length} Hospitals
                          </span>
                        </h3>
                        <p style={{ margin: '3px 0 0 0', fontSize: '12px', color: '#64748B', fontWeight: 400 }}>
                          Review tenant subscription plans, monthly revenue contributions, and live operational status.
                        </p>
                      </div>

                      {/* Search & Filter Controls */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                        {/* Search Input */}
                        <div style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                          background: '#F8FAFC',
                          border: '1px solid #E2E8F0',
                          borderRadius: '8px',
                          padding: '6px 12px',
                          width: '230px'
                        }}>
                          <LucideIcon name="search" style={{ width: '14px', height: '14px', color: '#94A3B8' }} />
                          <input
                            type="text"
                            value={subSearch}
                            onChange={(e) => {
                              setSubSearch(e.target.value);
                              setSubCurrentPage(1);
                            }}
                            placeholder="Search subscribers..."
                            style={{
                              border: 'none',
                              outline: 'none',
                              background: 'transparent',
                              fontSize: '12px',
                              color: '#334155',
                              width: '100%',
                              fontWeight: 400
                            }}
                          />
                          {subSearch && (
                            <button
                              onClick={() => {
                                setSubSearch('');
                                setSubCurrentPage(1);
                              }}
                              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: '#94A3B8', display: 'flex' }}
                            >
                              <LucideIcon name="x" style={{ width: '12px', height: '12px' }} />
                            </button>
                          )}
                        </div>

                        {/* Plan Filter */}
                        <select
                          value={subPlanFilter}
                          onChange={(e) => {
                            setSubPlanFilter(e.target.value);
                            setSubCurrentPage(1);
                          }}
                          style={{
                            background: '#F8FAFC',
                            border: '1px solid #E2E8F0',
                            borderRadius: '8px',
                            padding: '6px 10px',
                            fontSize: '12px',
                            fontWeight: 500,
                            color: '#475569',
                            cursor: 'pointer',
                            outline: 'none'
                          }}
                        >
                          <option value="All">All Plans</option>
                          <option value="Basic">Basic Plan</option>
                          <option value="Enterprise">Enterprise Elite</option>
                          <option value="Trial">Trial Plan</option>
                        </select>

                        {/* Status Filter */}
                        <select
                          value={subStatusFilter}
                          onChange={(e) => {
                            setSubStatusFilter(e.target.value);
                            setSubCurrentPage(1);
                          }}
                          style={{
                            background: '#F8FAFC',
                            border: '1px solid #E2E8F0',
                            borderRadius: '8px',
                            padding: '6px 10px',
                            fontSize: '12px',
                            fontWeight: 500,
                            color: '#475569',
                            cursor: 'pointer',
                            outline: 'none'
                          }}
                        >
                          <option value="All">All Statuses</option>
                          <option value="Active">Active</option>
                          <option value="Suspended">Suspended</option>
                          <option value="Pending">Pending</option>
                        </select>
                      </div>
                    </div>

                    {/* Table Container */}
                    <div style={{ overflowX: 'auto', border: '1px solid #E2E8F0', borderRadius: '12px' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                        <thead>
                          <tr style={{ background: '#F8FAFC', borderBottom: '1px solid #E2E8F0' }}>
                            <th style={{ padding: '11px 16px', fontSize: '11px', fontWeight: 600, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                              Hospital Name
                            </th>
                            <th style={{ padding: '11px 16px', fontSize: '11px', fontWeight: 600, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                              Active Plan
                            </th>
                            <th style={{ padding: '11px 16px', fontSize: '11px', fontWeight: 600, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                              Status
                            </th>
                            <th style={{ padding: '11px 16px', fontSize: '11px', fontWeight: 600, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                              Monthly Revenue
                            </th>
                            <th style={{ padding: '11px 16px', fontSize: '11px', fontWeight: 600, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                              Go-Live Date
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {paginatedSubHospitals.length > 0 ? (
                            paginatedSubHospitals.map((h, idx) => {
                              const planStr = h.plan ? h.plan.replace('$', '₹') : 'Unassigned';
                              const pLower = planStr.toLowerCase();
                              let badgeBg = '#F8FAFC';
                              let badgeColor = '#475569';
                              let badgeBorder = '#E2E8F0';

                              if (pLower.includes('enterprise') || pLower.includes('elite')) {
                                badgeBg = '#FBF8FF';
                                badgeColor = '#6B21A8';
                                badgeBorder = '#E9D5FF';
                              } else if (pLower.includes('pro') || pLower.includes('professional')) {
                                badgeBg = '#F0FDF4';
                                badgeColor = '#166534';
                                badgeBorder = '#BBF7D0';
                              } else if (pLower.includes('basic') || pLower.includes('standard')) {
                                badgeBg = '#EFF6FF';
                                badgeColor = '#1D4ED8';
                                badgeBorder = '#BFDBFE';
                              } else if (pLower.includes('trial') || pLower.includes('custom') || pLower.includes('₹0')) {
                                badgeBg = '#FFFBEB';
                                badgeColor = '#B45309';
                                badgeBorder = '#FDE68A';
                              }

                              return (
                                <tr
                                  key={h._id || h.code || idx}
                                  style={{
                                    borderBottom: idx === paginatedSubHospitals.length - 1 ? 'none' : '1px solid #F1F5F9',
                                    transition: 'background 0.15s ease',
                                    background: '#FFFFFF'
                                  }}
                                  onMouseEnter={(e) => e.currentTarget.style.background = '#F8FAFC'}
                                  onMouseLeave={(e) => e.currentTarget.style.background = '#FFFFFF'}
                                >
                                  {/* Hospital Name */}
                                  <td style={{ padding: '12px 16px', fontSize: '13px' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                      <div style={{
                                        width: '28px',
                                        height: '28px',
                                        borderRadius: '7px',
                                        background: '#EFF6FF',
                                        color: '#2563EB',
                                        border: '1px solid #DBEAFE',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        fontSize: '11px',
                                        fontWeight: 600,
                                        flexShrink: 0
                                      }}>
                                        {h.name ? h.name.slice(0, 2).toUpperCase() : 'HP'}
                                      </div>
                                      <div style={{ display: 'flex', flexDirection: 'column' }}>
                                        <span style={{ color: '#1E293B', fontWeight: 600, fontSize: '13px' }}>{h.name}</span>
                                        <span style={{ fontSize: '11px', color: '#94A3B8', fontWeight: 400 }}>{h.code || h._id ? `ID: ${(h.code || h._id).slice(-8)}` : ''}</span>
                                      </div>
                                    </div>
                                  </td>

                                  {/* Active Plan */}
                                  <td style={{ padding: '12px 16px', fontSize: '12px' }}>
                                    <span style={{
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      padding: '2px 8px',
                                      borderRadius: '6px',
                                      fontSize: '11px',
                                      fontWeight: 500,
                                      background: badgeBg,
                                      color: badgeColor,
                                      border: `1px solid ${badgeBorder}`
                                    }}>
                                      {planStr}
                                    </span>
                                  </td>

                                  {/* Status */}
                                  <td style={{ padding: '12px 16px', fontSize: '12px' }}>
                                    <span style={{
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      gap: '5px',
                                      padding: '2px 8px',
                                      borderRadius: '12px',
                                      fontSize: '11px',
                                      fontWeight: 500,
                                      background: h.status === 'Active' ? '#F0FDF4' : '#FEF2F2',
                                      color: h.status === 'Active' ? '#166534' : '#991B1B',
                                      border: `1px solid ${h.status === 'Active' ? '#DCFCE7' : '#FEE2E2'}`
                                    }}>
                                      <span style={{
                                        width: '5px',
                                        height: '5px',
                                        borderRadius: '50%',
                                        background: h.status === 'Active' ? '#22C55E' : '#EF4444'
                                      }}></span>
                                      {h.status}
                                    </span>
                                  </td>

                                  {/* Monthly Revenue */}
                                  <td style={{ padding: '12px 16px', fontSize: '12.5px', color: '#334155', fontWeight: 500 }}>
                                    {h.revenue ? h.revenue.replace('$', '₹') : '₹0/mo'}
                                  </td>

                                  {/* Go-Live Date */}
                                  <td style={{ padding: '12px 16px', fontSize: '12px', color: '#64748B', fontWeight: 400 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                      <LucideIcon name="calendar" style={{ width: '13px', height: '13px', color: '#94A3B8' }} />
                                      <span>{h.goLiveDate || 'N/A'}</span>
                                    </div>
                                  </td>
                                </tr>
                              );
                            })
                          ) : (
                            <tr>
                              <td colSpan="5" style={{ padding: '36px 16px', textAlign: 'center', color: '#94A3B8', fontSize: '12.5px', fontWeight: 400 }}>
                                <LucideIcon name="search-x" style={{ width: '24px', height: '24px', margin: '0 auto 6px auto', display: 'block', opacity: 0.5 }} />
                                No hospitals found matching "{subSearch}".
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>

                    {/* Pagination Footer */}
                    {filteredSubHospitals.length > 0 && (
                      <div style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        flexWrap: 'wrap',
                        gap: '12px',
                        paddingTop: '6px'
                      }}>
                        {/* Info */}
                        <div style={{ fontSize: '12px', color: '#64748B', fontWeight: 400 }}>
                          Showing <span style={{ color: '#1E293B', fontWeight: 550 }}>{(safeCurrentPage - 1) * subItemsPerPage + 1}</span> to <span style={{ color: '#1E293B', fontWeight: 550 }}>{Math.min(safeCurrentPage * subItemsPerPage, filteredSubHospitals.length)}</span> of <span style={{ color: '#1E293B', fontWeight: 550 }}>{filteredSubHospitals.length}</span> hospitals
                        </div>

                        {/* Page Buttons */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <button
                            type="button"
                            disabled={safeCurrentPage === 1}
                            onClick={() => setSubCurrentPage(prev => Math.max(1, prev - 1))}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '4px',
                              padding: '5px 10px',
                              borderRadius: '6px',
                              border: '1px solid #E2E8F0',
                              background: '#FFFFFF',
                              color: safeCurrentPage === 1 ? '#CBD5E1' : '#475569',
                              fontSize: '11.5px',
                              fontWeight: 500,
                              cursor: safeCurrentPage === 1 ? 'not-allowed' : 'pointer'
                            }}
                          >
                            <LucideIcon name="chevron-left" style={{ width: '13px', height: '13px' }} />
                            <span>Previous</span>
                          </button>

                          {/* Smart Truncated Pagination */}
                          {(() => {
                            const pages = [];
                            if (totalSubPages <= 7) {
                              for (let i = 1; i <= totalSubPages; i++) pages.push(i);
                            } else {
                              if (safeCurrentPage <= 4) {
                                pages.push(1, 2, 3, 4, 5, '...', totalSubPages);
                              } else if (safeCurrentPage >= totalSubPages - 3) {
                                pages.push(1, '...', totalSubPages - 4, totalSubPages - 3, totalSubPages - 2, totalSubPages - 1, totalSubPages);
                              } else {
                                pages.push(1, '...', safeCurrentPage - 1, safeCurrentPage, safeCurrentPage + 1, '...', totalSubPages);
                              }
                            }

                            return pages.map((page, idx) => {
                              if (page === '...') {
                                return (
                                  <span key={`dots-${idx}`} style={{ padding: '0 4px', color: '#94A3B8', fontSize: '12px' }}>
                                    ...
                                  </span>
                                );
                              }
                              const isCur = safeCurrentPage === page;
                              return (
                                <button
                                  key={page}
                                  type="button"
                                  onClick={() => setSubCurrentPage(page)}
                                  style={{
                                    width: '28px',
                                    height: '28px',
                                    borderRadius: '6px',
                                    border: isCur ? 'none' : '1px solid #E2E8F0',
                                    background: isCur ? 'linear-gradient(135deg, #2563EB 0%, #1D4ED8 100%)' : '#FFFFFF',
                                    color: isCur ? '#FFFFFF' : '#475569',
                                    fontSize: '11.5px',
                                    fontWeight: isCur ? 600 : 450,
                                    cursor: 'pointer',
                                    boxShadow: isCur ? '0 2px 6px rgba(37, 99, 235, 0.25)' : 'none',
                                    transition: 'all 0.15s ease'
                                  }}
                                >
                                  {page}
                                </button>
                              );
                            });
                          })()}

                          <button
                            type="button"
                            disabled={safeCurrentPage === totalSubPages}
                            onClick={() => setSubCurrentPage(prev => Math.min(totalSubPages, prev + 1))}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '4px',
                              padding: '5px 10px',
                              borderRadius: '6px',
                              border: '1px solid #E2E8F0',
                              background: '#FFFFFF',
                              color: safeCurrentPage === totalSubPages ? '#CBD5E1' : '#475569',
                              fontSize: '11.5px',
                              fontWeight: 500,
                              cursor: safeCurrentPage === totalSubPages ? 'not-allowed' : 'pointer'
                            }}
                          >
                            <span>Next</span>
                            <LucideIcon name="chevron-right" style={{ width: '13px', height: '13px' }} />
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })()}

            {/* CUSTOMER SUPPORT & TICKETS TAB */}
            {isTabAllowed && activeTab === 'support-success' && (
              <div style={styles.pageBodyScroll}>
                <div>
                  <h2 style={styles.cardHeaderTitle}>Customer Support & SLA Desk</h2>
                  <p style={styles.cardHeaderSub}>Monitor active tickets, reply to customer queries, and document internal diagnostic progress.</p>
                </div>

                <div style={{ display: 'flex', gap: '20px', marginTop: '14px' }}>
                  <div style={{ flex: 1.5, background: '#FFFFFF', borderRadius: '12px', border: '1px solid #E2E8F0', padding: '16px' }}>
                    <table style={styles.dataTable}>
                      <thead>
                        <tr>
                          <th style={styles.tableTh}>Ticket ID</th>
                          <th style={styles.tableTh}>Hospital</th>
                          <th style={styles.tableTh}>Category</th>
                          <th style={styles.tableTh}>Priority</th>
                          <th style={styles.tableTh}>Status</th>
                          <th style={styles.tableTh}>SLA status</th>
                          <th style={styles.tableTh}>Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {tickets.map(t => {
                          const isUpgradeReq = t.category === 'Subscription Upgrade';
                          return (
                          <tr 
                            key={t._id || t.id} 
                            style={{ 
                              ...styles.tableRow, 
                              cursor: 'pointer', 
                              background: selectedTicketId === t._id ? (isUpgradeReq ? '#FEF3C7' : '#F1F5F9') : (isUpgradeReq ? '#FFFBEB' : 'transparent'),
                              borderLeft: isUpgradeReq ? '4px solid #F59E0B' : '4px solid transparent'
                            }}
                            onClick={() => setSelectedTicketId(t._id)}
                          >
                            <td style={styles.tableTd}><code>{t.id}</code></td>
                            <td style={styles.tableTd}><strong>{t.hospital}</strong></td>
                            <td style={styles.tableTd}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                {t.category}
                                {isUpgradeReq && <span style={{ fontSize: '9px', background: '#F59E0B', color: 'white', padding: '3px 6px', borderRadius: '4px', fontWeight: 800, letterSpacing: '0.5px' }}>ACTION REQUIRED</span>}
                              </div>
                            </td>
                            <td style={styles.tableTd}>
                              <span style={{ 
                                ...styles.statusBadge, 
                                background: t.priority === 'Critical' ? '#FEE2E2' : t.priority === 'High' ? '#FEF9C3' : '#EFF6FF', 
                                color: t.priority === 'Critical' ? '#EF4444' : t.priority === 'High' ? '#A16207' : '#2563EB' 
                              }}>
                                {t.priority}
                              </span>
                            </td>
                            <td style={styles.tableTd}><strong>{t.status}</strong></td>
                            <td style={styles.tableTd}>
                              <span style={{ color: t.slaStatus === 'Breached' ? '#EF4444' : '#10B981', fontWeight: 800 }}>{t.slaStatus}</span>
                            </td>
                            <td style={styles.tableTd}>
                              {t.status !== 'Resolved' && t.status !== 'Closed' ? (
                                <button
                                  onClick={async (e) => {
                                    e.stopPropagation();
                                    const token = localStorage.getItem('token');
                                    try {
                                      const res = await fetch(`/api/superadmin/tickets/${t._id}`, {
                                        method: 'PUT',
                                        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                                        body: JSON.stringify({ status: 'Resolved' })
                                      });
                                      if (res.ok) {
                                        const updated = await res.json();
                                        setTickets(prev => prev.map(item => item._id === t._id ? updated : item));
                                      }
                                    } catch (err) { console.error(err); }
                                  }}
                                  style={{
                                    background: '#10B981',
                                    color: 'white',
                                    border: 'none',
                                    borderRadius: '6px',
                                    padding: '5px 10px',
                                    fontSize: '10.5px',
                                    fontWeight: 700,
                                    cursor: 'pointer',
                                    transition: 'background 0.15s ease'
                                  }}
                                  onMouseEnter={e => e.currentTarget.style.background = '#059669'}
                                  onMouseLeave={e => e.currentTarget.style.background = '#10B981'}
                                >
                                  Resolve
                                </button>
                              ) : (
                                <span style={{ fontSize: '11px', color: '#10B981', fontWeight: 700 }}>Resolved</span>
                              )}
                            </td>
                          </tr>
                        )})}
                      </tbody>
                    </table>
                  </div>

                  {/* Conversation Panel */}
                  {tickets.find(t => t._id === selectedTicketId) && (() => {
                    const ticket = tickets.find(t => t._id === selectedTicketId);
                    return (
                      <div style={{ flex: 1, background: '#FFFFFF', borderRadius: '12px', border: '1px solid #E2E8F0', padding: '20px', display: 'flex', flexDirection: 'column', height: '450px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                          <div>
                            <h4 style={{ margin: '0 0 2px 0', fontSize: '14px', fontWeight: 800 }}>Incident #{ticket.id}</h4>
                            <p style={{ fontSize: '11px', color: '#64748B', margin: 0 }}>Category: {ticket.category} | Priority: {ticket.priority}</p>
                          </div>
                          
                          {/* Ticket Status Action Buttons */}
                          <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                            {ticket.status !== 'Resolved' && (
                              <button
                                onClick={async () => {
                                  const token = localStorage.getItem('token');
                                  try {
                                    const res = await fetch(`/api/superadmin/tickets/${ticket._id}`, {
                                      method: 'PUT',
                                      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                                      body: JSON.stringify({ status: 'Resolved' })
                                    });
                                    if (res.ok) {
                                      const updated = await res.json();
                                      setTickets(prev => prev.map(t => t._id === ticket._id ? updated : t));
                                    }
                                  } catch (err) { console.error(err); }
                                }}
                                style={{ background: '#10B981', color: 'white', border: 'none', borderRadius: '6px', padding: '4px 10px', fontSize: '11px', fontWeight: 700, cursor: 'pointer', transition: 'background 0.15s ease' }}
                                onMouseEnter={e => e.currentTarget.style.background = '#059669'}
                                onMouseLeave={e => e.currentTarget.style.background = '#10B981'}
                              >
                                Resolve
                              </button>
                            )}
                            <button
                              onClick={() => setSelectedTicketId(null)}
                              style={{
                                background: '#F1F5F9',
                                color: '#475569',
                                border: '1px solid #CBD5E1',
                                borderRadius: '6px',
                                padding: '4px 10px',
                                fontSize: '11px',
                                fontWeight: 700,
                                cursor: 'pointer',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px',
                                transition: 'all 0.15s ease'
                              }}
                              onMouseEnter={e => { e.currentTarget.style.background = '#E2E8F0'; e.currentTarget.style.color = '#1E293B'; }}
                              onMouseLeave={e => { e.currentTarget.style.background = '#F1F5F9'; e.currentTarget.style.color = '#475569'; }}
                              title="Close Side Panel"
                            >
                              <LucideIcon name="x" style={{ width: '12px', height: '12px' }} />
                              Close
                            </button>
                          </div>
                        </div>
                        
                        <div style={{ flex: 1, overflowY: 'auto', background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '8px', padding: '12px', margin: '12px 0', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                          <div style={{ fontSize: '11.5px', color: '#475569', paddingBottom: '8px', borderBottom: '1px solid #E2E8F0' }}>
                            <strong>Description:</strong> {ticket.description}
                          </div>
                          {ticket.messages?.map((msg, idx) => {
                            const isSupport = msg.sender === 'Platform Support' || msg.sender === 'Platform Admin' || msg.sender === 'superadmin';
                            return (
                              <div
                                key={idx}
                                style={{
                                  alignSelf: msg.isNote ? 'center' : (isSupport ? 'flex-end' : 'flex-start'),
                                  background: msg.isNote ? '#FEF3C7' : (isSupport ? '#EFF6FF' : '#F1F5F9'),
                                  color: msg.isNote ? '#B45309' : (isSupport ? '#1E40AF' : '#1E293B'),
                                  padding: '8px 12px',
                                  borderRadius: '8px',
                                  maxWidth: '85%',
                                  border: msg.isNote ? '1px solid #FCD34D' : 'none'
                                }}
                              >
                                <p style={{ margin: 0, fontSize: '11.5px', lineHeight: 1.4 }}>{msg.text}</p>
                                <span style={{ fontSize: '9px', color: '#64748B', display: 'block', textAlign: isSupport ? 'right' : 'left', marginTop: '2px', fontWeight: 600 }}>
                                  {msg.sender}
                                </span>
                              </div>
                            );
                          })}
                          <div ref={superAdminChatEndRef} />
                        </div>

                        <div style={{ display: 'flex', gap: '6px' }}>
                          <input 
                            type="text" 
                            placeholder="Type a reply..." 
                            value={chatMessageText} 
                            onChange={e => setChatMessageText(e.target.value)} 
                            style={{ ...styles.formInput, flex: 1 }}
                            onKeyDown={async (e) => {
                              if (e.key === 'Enter') {
                                if (!chatMessageText.trim()) return;
                                const token = localStorage.getItem('token');
                                try {
                                  const res = await fetch(`/api/superadmin/tickets/${ticket._id}/message`, {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                                    body: JSON.stringify({ sender: 'Platform Support', text: chatMessageText, isNote: false, timestamp: new Date().toLocaleTimeString() })
                                  });
                                  if (res.ok) {
                                    const updated = await res.json();
                                    setTickets(prev => prev.map(t => t._id === ticket._id ? updated : t));
                                    setChatMessageText('');
                                  }
                                } catch (err) { console.error(err); }
                              }
                            }}
                          />
                          <button 
                            style={styles.btnPrimary}
                            onClick={async () => {
                              if (!chatMessageText.trim()) return;
                              const token = localStorage.getItem('token');
                              try {
                                const res = await fetch(`/api/superadmin/tickets/${ticket._id}/message`, {
                                  method: 'POST',
                                  headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                                  body: JSON.stringify({ sender: 'Platform Support', text: chatMessageText, isNote: false, timestamp: new Date().toLocaleTimeString() })
                                });
                                if (res.ok) {
                                  const updated = await res.json();
                                  setTickets(prev => prev.map(t => t._id === ticket._id ? updated : t));
                                  setChatMessageText('');
                                }
                              } catch (err) { console.error(err); }
                            }}
                          >Send</button>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              </div>
            )}

            {/* BROADCAST CENTER TAB */}
            {isTabAllowed && activeTab === 'broadcast-center' && (
              <div style={styles.pageBodyScroll}>
                <div>
                  <h2 style={styles.cardHeaderTitle}>SaaS System Broadcast Panel</h2>
                  <p style={styles.cardHeaderSub}>Publish service announcements, maintenance alerts, or platform notice board updates instantly.</p>
                </div>

                <div style={{ display: 'flex', gap: '20px', alignItems: 'flex-start', flexWrap: 'wrap', marginTop: '14px', width: '100%' }}>
                  
                  {/* LEFT PANE: Broadcasting Form */}
                  <div style={{ ...styles.glassCard, flex: '1.2', minWidth: '350px', padding: '20px', boxSizing: 'border-box' }}>
                    <h3 style={{ fontSize: '15px', fontWeight: 800, color: '#1E293B', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ background: '#EFF6FF', color: '#2563EB', padding: '6px', borderRadius: '6px', display: 'inline-flex' }}>
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m3 11 18-5v12L3 13v-2Z"/><path d="M11.6 16.8a3 3 0 1 1-5.8-1.6"/></svg>
                      </span>
                      Compose System Announcement
                    </h3>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                      <div style={styles.formCol}>
                        <label style={styles.formLabel}>TARGET AUDIENCE</label>
                        <select 
                          style={{ ...styles.formInput, width: '100%', boxSizing: 'border-box' }}
                          value={broadcastForm.audience || 'All Hospital Administrators'}
                          onChange={(e) => setBroadcastForm({ ...broadcastForm, audience: e.target.value })}
                        >
                          <option>All Hospital Administrators</option>
                          <option>Only Active Tiers</option>
                          <option>Only Under-maintenance Tiers</option>
                        </select>
                      </div>

                      <div style={styles.formCol}>
                        <label style={styles.formLabel}>BROADCAST SUBJECT</label>
                        <input 
                          type="text" 
                          placeholder="e.g. Scheduled System Upgrades: July 18" 
                          style={{ ...styles.formInput, width: '100%', boxSizing: 'border-box' }}
                          value={broadcastForm.subject || ''}
                          onChange={(e) => setBroadcastForm({ ...broadcastForm, subject: e.target.value })}
                        />
                      </div>

                      <div style={styles.formCol}>
                        <label style={styles.formLabel}>ALERT MESSAGE BODY</label>
                        <textarea 
                          placeholder="Write key details, maintenance window times, and instructions here..." 
                          style={{ ...styles.formInput, width: '100%', height: '110px', padding: '10px', boxSizing: 'border-box', fontFamily: 'inherit', resize: 'vertical' }}
                          value={broadcastForm.message || ''}
                          onChange={(e) => setBroadcastForm({ ...broadcastForm, message: e.target.value })}
                        ></textarea>
                      </div>

                      <button 
                        style={{ ...styles.btnPrimary, padding: '10px 16px', fontSize: '13px', width: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '6px', cursor: 'pointer' }} 
                        onClick={async () => {
                          if (!broadcastForm.subject || !broadcastForm.message) {
                            showToast('Please enter both subject and message body', 'error');
                            return;
                          }
                          try {
                            const token = localStorage.getItem('token');
                            const res = await fetch('/api/superadmin/broadcast', {
                              method: 'POST',
                              headers: {
                                'Content-Type': 'application/json',
                                'Authorization': `Bearer ${token}`
                              },
                              body: JSON.stringify({
                                subject: broadcastForm.subject,
                                message: broadcastForm.message,
                                audience: broadcastForm.audience || 'All Hospital Administrators'
                              })
                            });

                            if (res.ok) {
                              showToast('Broadcast dispatch sent immediately!', 'success');
                              setBroadcastForm({
                                audience: 'All Hospital Administrators',
                                subject: '',
                                message: ''
                              });
                              if (typeof refreshNotifications === 'function') {
                                refreshNotifications();
                              }
                              await fetchBroadcasts();
                            } else {
                              const errData = await res.json();
                              showToast(errData.error || 'Failed to dispatch broadcast', 'error');
                            }
                          } catch (err) {
                            console.error('Broadcast dispatch error:', err);
                            showToast('Network error dispatching broadcast', 'error');
                          }
                        }}
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="22" x2="11" y1="2" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
                        Dispatch Live Announcement
                      </button>
                    </div>
                  </div>

                  {/* RIGHT PANE: Live Preview & Delivery History */}
                  <div style={{ flex: '1', minWidth: '320px', display: 'flex', flexDirection: 'column', gap: '16px', boxSizing: 'border-box' }}>
                    
                    {/* Live Preview Panel */}
                    <div style={{ ...styles.glassCard, padding: '18px', borderColor: '#F59E0B' }}>
                      <h4 style={{ fontSize: '12px', fontWeight: 800, color: '#D97706', margin: '0 0 12px 0', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{ width: '8px', height: '8px', background: '#F59E0B', borderRadius: '50%', display: 'inline-block' }}></span>
                        Receiver Screen Preview
                      </h4>
                      <p style={{ fontSize: '11px', color: '#64748B', marginTop: '-6px', marginBottom: '14px', lineHeight: 1.4 }}>
                        This is how the urgent broadcast alert modal appears on target hospital administrators' active screens:
                      </p>

                      <div style={{
                        background: 'white',
                        borderRadius: '12px',
                        border: '1.5px solid #E2E8F0',
                        boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.08)',
                        padding: '16px',
                        textAlign: 'left'
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
                          <div style={{
                            background: '#FEF3C7',
                            color: '#D97706',
                            borderRadius: '50%',
                            width: '32px',
                            height: '32px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center'
                          }}>
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m3 11 18-5v12L3 13v-2Z"/><path d="M11.6 16.8a3 3 0 1 1-5.8-1.6"/></svg>
                          </div>
                          <div>
                            <h4 style={{ fontSize: '14px', fontWeight: 800, color: '#0F172A', margin: 0 }}>System Broadcast Notice</h4>
                            <span style={{ fontSize: '9px', color: '#94A3B8', fontWeight: 600 }}>Just Now · {broadcastForm.audience || 'All'}</span>
                          </div>
                        </div>

                        <div style={{ borderBottom: '1px solid #F1F5F9', paddingBottom: '10px', marginBottom: '10px' }}>
                          <h5 style={{ fontSize: '12.5px', fontWeight: 700, color: '#1E293B', margin: '0 0 4px 0' }}>
                            {broadcastForm.subject || 'Scheduled Maintenance System Notice'}
                          </h5>
                          <p style={{ fontSize: '11.5px', color: '#475569', lineHeight: 1.4, margin: 0, whiteSpace: 'pre-wrap', fontWeight: 500 }}>
                            {broadcastForm.message || 'We will be conducting updates to key database instances. Users might experience minor dashboard loading delays.'}
                          </p>
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                          <span style={{
                            background: '#2563EB',
                            color: 'white',
                            borderRadius: '6px',
                            padding: '5px 12px',
                            fontSize: '11px',
                            fontWeight: 700,
                            boxShadow: '0 2px 4px rgba(37, 99, 235, 0.15)'
                          }}>
                            Acknowledge
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Sent Broadcasts History Logs */}
                    <div style={{ ...styles.glassCard, padding: '18px', flex: 1 }}>
                      <h4 style={{ fontSize: '13px', fontWeight: 800, color: '#1E293B', margin: '0 0 12px 0', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                        Broadcast History Logs
                      </h4>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '200px', overflowY: 'auto' }}>
                        {pastBroadcasts.length === 0 ? (
                          <div style={{ padding: '20px', fontSize: '12px', color: '#94A3B8', textAlign: 'center', background: '#F8FAFC', borderRadius: '8px', border: '1px dashed #E2E8F0' }}>
                            No broadcasts dispatched yet.
                          </div>
                        ) : (
                          pastBroadcasts.map((b) => (
                            <div key={b._id || b.id} style={{ padding: '10px', background: '#F8FAFC', borderRadius: '8px', border: '1px solid #E2E8F0' }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '4px' }}>
                                <span style={{ fontWeight: 700, fontSize: '12px', color: '#1E293B' }}>{b.subject}</span>
                                <span style={{ fontSize: '9px', color: '#94A3B8', fontWeight: 600 }}>{new Date(b.createdAt).toLocaleDateString()}</span>
                              </div>
                              <p style={{ fontSize: '11px', color: '#64748B', margin: '0 0 6px 0', lineHeight: 1.3 }}>{b.message}</p>
                              <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                                <span style={{ fontSize: '9px', fontWeight: 700, color: '#2563EB', background: '#EFF6FF', padding: '2px 6px', borderRadius: '4px' }}>
                                  {b.audience}
                                </span>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </div>

                  </div>
                </div>
              </div>
            )}

            {/* FINANCE & BILLING TAB */}
            {isTabAllowed && activeTab === 'finance-mgmt' && (
              <div style={styles.pageBodyScroll}>
                <div>
                  <h2 style={styles.cardHeaderTitle}>SaaS Billings & Subscription Collections</h2>
                  <p style={styles.cardHeaderSub}>Monitor MRR/ARR conversion pipelines, review client invoices history, and verify tax compliance records.</p>
                </div>

                <div style={{ display: 'flex', gap: '20px', marginTop: '14px' }}>
                  <div style={{ flex: 2, background: '#FFFFFF', borderRadius: '12px', border: '1px solid #E2E8F0', padding: '16px' }}>
                    <table style={styles.dataTable}>
                      <thead>
                        <tr>
                          <th style={styles.tableTh}>Invoice #</th>
                          <th style={styles.tableTh}>Hospital Account</th>
                          <th style={styles.tableTh}>Plan Tier</th>
                          <th style={styles.tableTh}>Billing Date</th>
                          <th style={styles.tableTh}>Net Amount</th>
                          <th style={styles.tableTh}>GST (18%)</th>
                          <th style={styles.tableTh}>Status</th>
                          <th style={styles.tableTh}>Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {invoices.map(inv => (
                          <tr 
                            key={inv._id || inv.invoiceNum} 
                            style={{ ...styles.tableRow, cursor: 'pointer', background: selectedInvoiceId === inv._id ? '#F1F5F9' : 'transparent' }}
                            onClick={() => setSelectedInvoiceId(inv._id)}
                          >
                            <td style={styles.tableTd}><code>{inv.invoiceNum}</code></td>
                            <td style={styles.tableTd}><strong>{inv.hospital}</strong></td>
                            <td style={styles.tableTd}>
                              {inv.subscription}
                            </td>
                            <td style={styles.tableTd}>{inv.invoiceDate}</td>
                            <td style={styles.tableTd}><strong>₹{inv.amount}</strong></td>
                            <td style={styles.tableTd}>₹{inv.gst}</td>
                            <td style={styles.tableTd}>
                              <span style={{ ...styles.statusBadge, background: inv.status === 'Paid' ? '#D1FAE5' : '#FEE2E2', color: inv.status === 'Paid' ? '#10B981' : '#EF4444' }}>
                                {inv.status}
                              </span>
                            </td>
                            <td style={styles.tableTd}>
                              {inv.status !== 'Paid' ? (
                                <button 
                                  style={styles.btnActionSmall}
                                  onClick={async (e) => {
                                    e.stopPropagation();
                                    const token = localStorage.getItem('token');
                                    try {
                                      const res = await fetch(`/api/superadmin/invoices/${inv._id}`, {
                                        method: 'PUT',
                                        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                                        body: JSON.stringify({ status: 'Paid' })
                                      });
                                      if (res.ok) {
                                        const updated = await res.json();
                                        setInvoices(prev => prev.map(i => i._id === inv._id ? updated : i));
                                        showToast('Invoice marked as Paid!', 'success');
                                      }
                                    } catch (err) { console.error(err); }
                                  }}
                                >
                                  Mark Paid
                                </button>
                              ) : 'N/A'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Invoice details card */}
                  {invoices.find(i => i._id === selectedInvoiceId) && (() => {
                    const inv = invoices.find(i => i._id === selectedInvoiceId);
                    return (
                      <div style={{ flex: 1, background: '#FFFFFF', borderRadius: '12px', border: '1px solid #E2E8F0', padding: '20px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
                        <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 800 }}>Invoice Details</h3>
                        <div style={{ fontSize: '12px', display: 'flex', flexDirection: 'column', gap: '8px', color: '#475569' }}>
                          <div>Invoice Number: <strong>{inv.invoiceNum}</strong></div>
                          <div>Client Hospital: <strong>{inv.hospital}</strong></div>
                          <div>Billing Period: <strong>{inv.billingPeriod}</strong></div>
                          <div>Address: {inv.address}</div>
                          <div>GSTIN: <code>{inv.gstin}</code></div>
                          <div style={{ height: '1px', background: '#E2E8F0', margin: '8px 0' }}></div>
                          <div style={{ display: 'flex', justifyWindow: 'space-between', justifyContent: 'space-between', fontSize: '13px' }}>
                            <span>Subscription Amount:</span>
                            <strong>₹{inv.amount}</strong>
                          </div>
                          <div style={{ display: 'flex', justifyWindow: 'space-between', justifyContent: 'space-between', fontSize: '13px' }}>
                            <span>Integrated GST (18%):</span>
                            <strong>₹{inv.gst}</strong>
                          </div>
                          <div style={{ display: 'flex', justifyWindow: 'space-between', justifyContent: 'space-between', fontSize: '14px', color: '#2563EB', fontWeight: 800 }}>
                            <span>Grand Total (INR):</span>
                            <strong>₹{inv.amount + inv.gst}</strong>
                          </div>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              </div>
            )}

            {/* EMPLOYEES & WORKLOAD TAB */}
            {isTabAllowed && activeTab === 'hr-mgmt' && (() => {
              const platformRoles = [
                { key: 'Onboarding Manager', icon: 'user-plus', color: '#2563EB', bg: '#EFF6FF', desc: 'Handles hospital onboarding and hospital management' },
                { key: 'Ticket Manager', icon: 'headset', color: '#8B5CF6', bg: '#F5F3FF', desc: 'Manages customer support tickets and platform announcements' },
                { key: 'Finance Manager', icon: 'wallet', color: '#10B981', bg: '#ECFDF5', desc: 'Manages subscriptions, finance, and platform financial reports' }
              ];

              const getRoleBadge = (role) => {
                const r = platformRoles.find(p => p.key === role) || platformRoles[0];
                return { color: r.color, bg: r.bg };
              };

              const getStatusBadge = (status) => {
                if (status === 'Active') return { bg: '#D1FAE5', color: '#059669' };
                if (status === 'On Leave') return { bg: '#FEF3C7', color: '#D97706' };
                return { bg: '#FEE2E2', color: '#DC2626' };
              };

              const handleSaveEmployee = async () => {
                if (!employeeForm.name?.trim() || !employeeForm.email?.trim()) {
                  showToast('Name and Email are required.', 'error');
                  return;
                }
                const token = localStorage.getItem('token');
                const headers = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` };
                try {
                  if (editingEmployee) {
                    const res = await fetch(`/api/superadmin/employees/${editingEmployee._id}`, { method: 'PUT', headers, body: JSON.stringify(employeeForm) });
                    if (res.ok) {
                      const updated = await res.json();
                      setEmployees(prev => prev.map(e => e._id === updated._id ? updated : e));
                      showToast(`${updated.name} updated successfully.`, 'success');
                    } else {
                      const err = await res.json();
                      showToast(err.error || 'Update failed.', 'error');
                    }
                  } else {
                    const res = await fetch('/api/superadmin/employees', { method: 'POST', headers, body: JSON.stringify(employeeForm) });
                    if (res.ok) {
                      const created = await res.json();
                      setEmployees(prev => [created, ...prev]);
                      showToast(`${created.name} added to team.`, 'success');
                    } else {
                      const err = await res.json();
                      showToast(err.error || 'Creation failed.', 'error');
                    }
                  }
                  setIsAddEmployeeOpen(false);
                  setEditingEmployee(null);
                  setEmployeeForm({ ...emptyEmployeeForm });
                } catch (err) {
                  showToast('Network error.', 'error');
                }
              };

              const handleDeleteEmployee = async (emp) => {
                setConfirmModalConfig({
                  title: 'Remove Team Member',
                  message: `Are you sure you want to remove ${emp.name} from the SaaS team?`,
                  confirmText: 'Yes, Remove Employee',
                  cancelText: 'Cancel',
                  danger: true,
                  onConfirm: async () => {
                    setConfirmModalConfig(prev => ({ ...prev, isLoading: true, confirmText: 'Removing...' }));
                    const token = localStorage.getItem('token');
                    try {
                      const res = await fetch(`/api/superadmin/employees/${emp._id}`, { method: 'DELETE', headers: { 'Authorization': `Bearer ${token}` } });
                      if (res.ok) {
                        setEmployees(prev => prev.filter(e => e._id !== emp._id));
                        showToast(`${emp.name} removed.`, 'success');
                      } else {
                        showToast('Delete failed.', 'error');
                      }
                    } catch (err) {
                      showToast('Delete failed.', 'error');
                    } finally {
                      setConfirmModalConfig(null);
                    }
                  }
                });
              };

              const openEditEmployee = (emp) => {
                setEditingEmployee(emp);
                setEmployeeForm({
                  name: emp.name || '',
                  email: emp.email || '',
                  mobile: emp.mobile || '',
                  department: emp.department || 'General',
                  designation: emp.designation || '',
                  platformRole: emp.platformRole || 'Onboarding Manager',
                  status: emp.status || 'Active',
                  joiningDate: emp.joiningDate || ''
                });
                setIsAddEmployeeOpen(true);
              };

              return (
              <div style={styles.pageBodyScroll}>
                <div style={{ display: 'flex', gap: '8px', borderBottom: '1px solid #E2E8F0', paddingBottom: '8px', marginBottom: '14px', flexWrap: 'wrap' }}>
                  <button style={activeTab === 'hr-mgmt' ? styles.subNavbarBtnActive : styles.subNavbarBtn} onClick={() => setActiveTab('hr-mgmt')}>Team Directory</button>
                  <button style={activeTab === 'departments' ? styles.subNavbarBtnActive : styles.subNavbarBtn} onClick={() => setActiveTab('departments')}>Departments</button>
                  <button style={activeTab === 'platform-roles' ? styles.subNavbarBtnActive : styles.subNavbarBtn} onClick={() => setActiveTab('platform-roles')}>Security Roles</button>
                  <button style={activeTab === 'platform-audits' ? styles.subNavbarBtnActive : styles.subNavbarBtn} onClick={() => setActiveTab('platform-audits')}>Audit Logs</button>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <h2 style={styles.cardHeaderTitle}>Curoxa SaaS Team Directory</h2>
                    <p style={styles.cardHeaderSub}>Manage team members, assign platform roles, and track workforce distribution across departments.</p>
                  </div>
                  <button
                    onClick={() => { setEditingEmployee(null); setEmployeeForm({ ...emptyEmployeeForm }); setIsAddEmployeeOpen(true); }}
                    style={{ ...styles.btnPrimary, display: 'flex', alignItems: 'center', gap: '6px', height: '38px', padding: '0 16px', fontSize: '12.5px', flexShrink: 0 }}
                  >
                    <LucideIcon name="plus" style={{ width: '14px', height: '14px' }} />
                    Add Team Member
                  </button>
                </div>

                {/* Stats Row */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '14px', marginTop: '16px' }}>
                  {platformRoles.map(role => {
                    const count = employees.filter(e => e.platformRole === role.key).length;
                    return (
                      <div key={role.key} style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '12px', padding: '14px 16px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: role.bg, color: role.color, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          <LucideIcon name={role.icon} style={{ width: '18px', height: '18px' }} />
                        </div>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontSize: '9px', fontWeight: 800, color: '#94A3B8', letterSpacing: '0.3px', textTransform: 'uppercase', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{role.key}</div>
                          <div style={{ fontSize: '20px', fontWeight: 850, color: '#0F172A', lineHeight: '1.2' }}>{count}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Employee Table */}
                <div style={{ overflowX: 'auto', background: '#FFFFFF', borderRadius: '12px', border: '1px solid #E2E8F0', marginTop: '16px' }}>
                  <table style={{ ...styles.dataTable, width: '100%' }}>
                    <thead>
                      <tr>
                        <th style={styles.tableTh}>Team Member</th>
                        <th style={styles.tableTh}>Employee ID</th>
                        <th style={styles.tableTh}>Department</th>
                        <th style={styles.tableTh}>Designation</th>
                        <th style={styles.tableTh}>Platform Role</th>
                        <th style={styles.tableTh}>Status</th>
                        <th style={{ ...styles.tableTh, textAlign: 'right' }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {employees.length === 0 ? (
                        <tr>
                          <td colSpan="7" style={{ ...styles.tableTd, textAlign: 'center', padding: '40px 16px', color: '#94A3B8', fontSize: '13px' }}>
                            No team members yet. Click "Add Team Member" to get started.
                          </td>
                        </tr>
                      ) : employees.map(emp => {
                        const roleBadge = getRoleBadge(emp.platformRole);
                        const statusBadge = getStatusBadge(emp.status);
                        return (
                          <tr key={emp._id} style={styles.tableRow}>
                            <td style={styles.tableTd}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: roleBadge.bg, color: roleBadge.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 800, flexShrink: 0 }}>
                                  {emp.avatar || emp.name?.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()}
                                </div>
                                <div>
                                  <div style={{ fontSize: '12.5px', fontWeight: 750, color: '#0F172A' }}>{emp.name}</div>
                                  <div style={{ fontSize: '10.5px', color: '#64748B' }}>{emp.email}</div>
                                </div>
                              </div>
                            </td>
                            <td style={styles.tableTd}><code style={{ fontSize: '11px', background: '#F1F5F9', padding: '2px 6px', borderRadius: '4px', color: '#475569', fontWeight: 700 }}>{emp.empId}</code></td>
                            <td style={styles.tableTd}><span style={{ fontSize: '12px', fontWeight: 600, color: '#334155' }}>{emp.department}</span></td>
                            <td style={styles.tableTd}><span style={{ fontSize: '12px', color: '#475569' }}>{emp.designation}</span></td>
                            <td style={styles.tableTd}>
                              <span style={{ fontSize: '10px', fontWeight: 800, background: roleBadge.bg, color: roleBadge.color, padding: '3px 8px', borderRadius: '6px', whiteSpace: 'nowrap' }}>
                                {emp.platformRole}
                              </span>
                            </td>
                            <td style={styles.tableTd}>
                              <span style={{ fontSize: '10px', fontWeight: 800, background: statusBadge.bg, color: statusBadge.color, padding: '3px 8px', borderRadius: '6px' }}>
                                {emp.status}
                              </span>
                            </td>
                            <td style={{ ...styles.tableTd, textAlign: 'right' }}>
                              <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                                <button
                                  onClick={() => openEditEmployee(emp)}
                                  style={{ background: '#F1F5F9', border: '1px solid #E2E8F0', borderRadius: '6px', padding: '5px 8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', fontWeight: 700, color: '#475569' }}
                                >
                                  <LucideIcon name="pencil" style={{ width: '12px', height: '12px' }} />
                                  Edit
                                </button>
                                <button
                                  onClick={() => handleDeleteEmployee(emp)}
                                  style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: '6px', padding: '5px 8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', fontWeight: 700, color: '#DC2626' }}
                                >
                                  <LucideIcon name="trash-2" style={{ width: '12px', height: '12px' }} />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Role Assignment Overview */}
                <div style={{ marginTop: '20px' }}>
                  <h3 style={{ fontSize: '14px', fontWeight: 800, color: '#0F172A', margin: '0 0 12px 0' }}>Role Assignment Overview</h3>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '14px' }}>
                    {platformRoles.map(role => {
                      const assigned = employees.filter(e => e.platformRole === role.key);
                      return (
                        <div key={role.key} style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '12px', padding: '16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: role.bg, color: role.color, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                              <LucideIcon name={role.icon} style={{ width: '16px', height: '16px' }} />
                            </div>
                            <div>
                              <div style={{ fontSize: '12px', fontWeight: 800, color: '#1E293B' }}>{role.key}</div>
                              <div style={{ fontSize: '10px', color: '#64748B' }}>{role.desc}</div>
                            </div>
                          </div>
                          <div style={{ borderTop: '1px solid #F1F5F9', paddingTop: '8px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                            {assigned.length === 0 ? (
                              <span style={{ fontSize: '11px', color: '#94A3B8', fontStyle: 'italic' }}>No one assigned</span>
                            ) : assigned.map(a => (
                              <div key={a._id} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <div style={{ width: '22px', height: '22px', borderRadius: '50%', background: role.bg, color: role.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '8px', fontWeight: 800 }}>
                                  {a.avatar || a.name?.slice(0, 2).toUpperCase()}
                                </div>
                                <span style={{ fontSize: '11.5px', fontWeight: 650, color: '#334155' }}>{a.name}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Add/Edit Employee Drawer */}
                {isAddEmployeeOpen && (
                  <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(15, 23, 42, 0.4)', zIndex: 9999, display: 'flex', justifyContent: 'flex-end' }} onClick={() => { setIsAddEmployeeOpen(false); setEditingEmployee(null); }}>
                    <div style={{ width: '480px', height: '100%', background: '#FFFFFF', boxShadow: '-8px 0 30px rgba(0,0,0,0.08)', display: 'flex', flexDirection: 'column', animation: 'slideInRight 0.25s ease' }} onClick={e => e.stopPropagation()}>
                      
                      {/* Drawer Header */}
                      <div style={{ padding: '20px 24px', borderBottom: '1px solid #E2E8F0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                          <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 800, color: '#0F172A' }}>{editingEmployee ? 'Edit Team Member' : 'Add Team Member'}</h3>
                          <p style={{ margin: '2px 0 0 0', fontSize: '11.5px', color: '#64748B' }}>{editingEmployee ? 'Update employee details and role assignment.' : 'Add a new member to the Curoxa operations team.'}</p>
                        </div>
                        <button onClick={() => { setIsAddEmployeeOpen(false); setEditingEmployee(null); }} style={{ background: '#F1F5F9', border: 'none', borderRadius: '8px', width: '32px', height: '32px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <LucideIcon name="x" style={{ width: '16px', height: '16px', color: '#64748B' }} />
                        </button>
                      </div>

                      {/* Drawer Body */}
                      <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                            <label style={{ fontSize: '10px', fontWeight: 800, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.3px' }}>FULL NAME *</label>
                            <input type="text" value={employeeForm.name} onChange={e => setEmployeeForm(p => ({ ...p, name: e.target.value }))} style={styles.formInput} placeholder="e.g. John Doe" />
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                            <label style={{ fontSize: '10px', fontWeight: 800, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.3px' }}>WORK EMAIL *</label>
                            <input type="email" value={employeeForm.email} onChange={e => setEmployeeForm(p => ({ ...p, email: e.target.value }))} style={styles.formInput} placeholder="e.g. john@curoxa.com" />
                          </div>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                            <label style={{ fontSize: '10px', fontWeight: 800, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.3px' }}>MOBILE NUMBER</label>
                            <input type="text" value={employeeForm.mobile} onChange={e => setEmployeeForm(p => ({ ...p, mobile: e.target.value }))} style={styles.formInput} placeholder="+91 98765 43210" />
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                            <label style={{ fontSize: '10px', fontWeight: 800, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.3px' }}>JOINING DATE</label>
                            <input type="text" value={employeeForm.joiningDate} onChange={e => setEmployeeForm(p => ({ ...p, joiningDate: e.target.value }))} style={styles.formInput} placeholder="e.g. January 15, 2025" />
                          </div>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', gridColumn: '1 / -1' }}>
                            <label style={{ fontSize: '10px', fontWeight: 800, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.3px' }}>ACCOUNT PASSWORD (LEAVE BLANK FOR DEFAULT: Curoxa@2026)</label>
                            <div style={{ position: 'relative', display: 'flex', alignItems: 'center', width: '100%' }}>
                              <input 
                                type={showPasswords['employeeForm'] ? 'text' : 'password'} 
                                value={employeeForm.password || ''} 
                                onChange={e => setEmployeeForm(p => ({ ...p, password: e.target.value }))} 
                                style={{ ...styles.formInput, paddingRight: '40px', width: '100%' }} 
                                placeholder="Enter a secure password..." 
                              />
                              <button
                                type="button"
                                onClick={() => togglePasswordVisibility('employeeForm')}
                                style={{
                                  position: 'absolute',
                                  right: '10px',
                                  background: 'none',
                                  border: 'none',
                                  cursor: 'pointer',
                                  padding: '4px',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  color: '#64748B'
                                }}
                              >
                                <LucideIcon name={showPasswords['employeeForm'] ? 'eye-off' : 'eye'} style={{ width: '15px', height: '15px' }} />
                              </button>
                            </div>
                          </div>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                            <label style={{ fontSize: '10px', fontWeight: 800, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.3px' }}>DEPARTMENT</label>
                            <select value={employeeForm.department} onChange={e => setEmployeeForm(p => ({ ...p, department: e.target.value }))} style={styles.filterSelect}>
                              <option value="" disabled>Select Department</option>
                              <option>General</option>
                              <option>Hospital Onboarding</option>
                              <option>Customer Success</option>
                              <option>Engineering</option>
                              <option>Finance</option>
                              <option>System Administration</option>
                              <option>Sales</option>
                            </select>
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                            <label style={{ fontSize: '10px', fontWeight: 800, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.3px' }}>DESIGNATION</label>
                            <input type="text" value={employeeForm.designation} onChange={e => setEmployeeForm(p => ({ ...p, designation: e.target.value }))} style={styles.formInput} placeholder="e.g. Senior Lead" />
                          </div>
                        </div>

                        <div style={{ height: '1px', background: '#E2E8F0' }} />

                        {/* Platform Role Selection */}
                        <div>
                          <label style={{ fontSize: '10px', fontWeight: 800, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.3px', display: 'block', marginBottom: '8px' }}>PLATFORM ROLE ASSIGNMENT</label>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            {platformRoles.map(role => (
                              <label
                                key={role.key}
                                style={{
                                  display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 14px',
                                  background: employeeForm.platformRole === role.key ? role.bg : '#F8FAFC',
                                  border: employeeForm.platformRole === role.key ? `2px solid ${role.color}` : '1px solid #E2E8F0',
                                  borderRadius: '10px', cursor: 'pointer', transition: 'all 0.15s'
                                }}
                              >
                                <input
                                  type="radio"
                                  name="platformRole"
                                  checked={employeeForm.platformRole === role.key}
                                  onChange={() => setEmployeeForm(p => ({ ...p, platformRole: role.key }))}
                                  style={{ width: '16px', height: '16px', accentColor: role.color }}
                                />
                                <div style={{ width: '30px', height: '30px', borderRadius: '8px', background: role.bg, color: role.color, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                  <LucideIcon name={role.icon} style={{ width: '15px', height: '15px' }} />
                                </div>
                                <div>
                                  <div style={{ fontSize: '12px', fontWeight: 750, color: '#1E293B' }}>{role.key}</div>
                                  <div style={{ fontSize: '10px', color: '#64748B' }}>{role.desc}</div>
                                </div>
                              </label>
                            ))}
                          </div>
                        </div>

                        <div style={{ height: '1px', background: '#E2E8F0' }} />

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                          <label style={{ fontSize: '10px', fontWeight: 800, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.3px' }}>STATUS</label>
                          <select value={employeeForm.status} onChange={e => setEmployeeForm(p => ({ ...p, status: e.target.value }))} style={styles.filterSelect}>
                            <option>Active</option>
                            <option>On Leave</option>
                            <option>Inactive</option>
                          </select>
                        </div>
                      </div>

                      {/* Drawer Footer */}
                      <div style={{ padding: '16px 24px', borderTop: '1px solid #E2E8F0', display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                        <button onClick={() => { setIsAddEmployeeOpen(false); setEditingEmployee(null); }} style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '8px', padding: '10px 20px', fontSize: '12.5px', fontWeight: 700, color: '#475569', cursor: 'pointer' }}>
                          Cancel
                        </button>
                        <button onClick={handleSaveEmployee} style={{ background: '#2563EB', border: 'none', borderRadius: '8px', padding: '10px 20px', fontSize: '12.5px', fontWeight: 700, color: '#FFFFFF', cursor: 'pointer' }}>
                          {editingEmployee ? 'Save Changes' : 'Add to Team'}
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {showPendingDocsModal && (
                  <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(15, 23, 42, 0.4)', zIndex: 9999, display: 'flex', justifyContent: 'center', alignItems: 'center' }} onClick={() => setShowPendingDocsModal(false)}>
                    <div style={{ width: '560px', maxHeight: '80vh', background: '#FFFFFF', borderRadius: '16px', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)', display: 'flex', flexDirection: 'column', animation: 'scaleUp 0.2s ease', overflow: 'hidden' }} onClick={e => e.stopPropagation()}>
                      <div style={{ padding: '20px 24px', borderBottom: '1px solid #E2E8F0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                          <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 800, color: '#0F172A' }}>Pending Compliance Documents</h3>
                          <p style={{ margin: '2px 0 0 0', fontSize: '11.5px', color: '#64748B' }}>Actionable documents requiring verification or review.</p>
                        </div>
                        <button onClick={() => setShowPendingDocsModal(false)} style={{ background: '#F1F5F9', border: 'none', borderRadius: '8px', width: '32px', height: '32px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <LucideIcon name="x" style={{ width: '16px', height: '16px', color: '#64748B' }} />
                        </button>
                      </div>
                      <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        {getPendingDocumentsList().map((item, index) => (
                          <div key={index} style={{ padding: '14px', background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div>
                              <strong style={{ fontSize: '12.5px', color: '#1E293B', display: 'block' }}>{item.hospital}</strong>
                              <span style={{ fontSize: '11.5px', color: '#4F46E5', fontWeight: 700, display: 'block', marginTop: '2px' }}>{item.docType}</span>
                              {item.value && <span style={{ fontSize: '11px', color: '#64748B', display: 'block', marginTop: '1px' }}>Value: {item.value}</span>}
                            </div>
                            <span style={{ fontSize: '11px', fontWeight: 800, padding: '4px 8px', borderRadius: '12px', background: item.type === 'hospital' ? '#FEE2E2' : '#FEF3C7', color: item.type === 'hospital' ? '#991B1B' : '#D97706' }}>
                              {item.status}
                            </span>
                          </div>
                        ))}
                      </div>
                      <div style={{ padding: '16px 24px', borderTop: '1px solid #E2E8F0', display: 'flex', justifyContent: 'flex-end' }}>
                        <button onClick={() => setShowPendingDocsModal(false)} style={{ background: '#2563EB', border: 'none', borderRadius: '8px', padding: '10px 20px', fontSize: '12.5px', fontWeight: 700, color: '#FFFFFF', cursor: 'pointer' }}>
                          Dismiss
                        </button>
                      </div>
                    </div>
                  </div>
                )}

              </div>
              );
            })()}

            {/* BI REPORTS & ANALYTICS TAB */}
            {isTabAllowed && activeTab === 'bi-reports' && (() => {
              // Helper to parse dates
              const parseInvoiceMonth = (dateStr) => {
                if (!dateStr) return 'Unknown';
                const parts = dateStr.split(' ');
                if (parts.length >= 3) {
                  return `${parts[0]} ${parts[2]}`; // e.g. "July 2026"
                }
                const dateObj = new Date(dateStr);
                if (!isNaN(dateObj.getTime())) {
                  return dateObj.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
                }
                return dateStr;
              };

              // Calculations for Overview Tab
              const totalRevenue = invoices
                .filter(inv => inv.status && inv.status.toLowerCase() === 'paid')
                .reduce((sum, inv) => sum + (inv.amount || 0), 0);

              const activeSubsCount = hospitals.filter(h => h.status === 'Active').length;

              const getPlanPrice = (planName) => {
                if (!planName) return 5000;
                const nameLower = planName.toLowerCase();
                if (nameLower.includes('enterprise')) return 50000;
                if (nameLower.includes('professional')) return 24000;
                if (nameLower.includes('basic') || nameLower.includes('standard')) return 5000;
                return 5000;
              };

              const activeHospitalsList = hospitals.filter(h => h.status === 'Active');
              const totalMonthlyContracts = activeHospitalsList.reduce((sum, h) => sum + getPlanPrice(h.plan), 0);
              const acv = activeHospitalsList.length > 0 ? (totalMonthlyContracts / activeHospitalsList.length) : 0;

              const pendingRevenue = invoices
                .filter(inv => inv.status && (inv.status.toLowerCase() === 'unpaid' || inv.status.toLowerCase() === 'overdue'))
                .reduce((sum, inv) => sum + (inv.amount || 0), 0);

              // Plan counts
              const planDistribution = { Basic: 0, Professional: 0, Enterprise: 0 };
              hospitals.forEach(h => {
                const plan = h.plan || '';
                if (plan.toLowerCase().includes('enterprise')) planDistribution.Enterprise++;
                else if (plan.toLowerCase().includes('professional')) planDistribution.Professional++;
                else planDistribution.Basic++;
              });
              const totalPlanHospitals = planDistribution.Basic + planDistribution.Professional + planDistribution.Enterprise;

              // Donut calculations
              const enterPct = totalPlanHospitals > 0 ? (planDistribution.Enterprise / totalPlanHospitals) : 0;
              const profPct = totalPlanHospitals > 0 ? (planDistribution.Professional / totalPlanHospitals) : 0;
              const basicPct = totalPlanHospitals > 0 ? (planDistribution.Basic / totalPlanHospitals) : 0;

              const enterLen = enterPct * 251.327;
              const profLen = profPct * 251.327;
              const basicLen = basicPct * 251.327;

              const enterOffset = 0;
              const profOffset = -enterLen;
              const basicOffset = -(enterLen + profLen);

              // MRR Trend data parsing
              const baselineMonths = ['Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul'];
              const baselineValues = [180000, 220000, 210000, 260000, 290000, 320000];

              const rawData = baselineMonths.map((m) => {
                const dbPaid = invoices
                  .filter(inv => {
                    if (!inv.status || inv.status.toLowerCase() !== 'paid') return false;
                    const invMonth = parseInvoiceMonth(inv.invoiceDate);
                    return invMonth.toLowerCase().includes(m.toLowerCase());
                  })
                  .reduce((sum, inv) => sum + (inv.amount || 0), 0);
                return { month: m, value: dbPaid };
              });

              const latestPaidVal = rawData.reduce((max, d) => Math.max(max, d.value), 0);

              const chartData = rawData.map((d, idx) => {
                if (latestPaidVal > 0) {
                  return d;
                }
                return {
                  month: d.month,
                  value: baselineValues[idx]
                };
              });

              const maxVal = Math.max(...chartData.map(d => d.value), 5000);
              const padding = { left: 55, right: 15, top: 15, bottom: 25 };
              const chartW = 460 - padding.left - padding.right;
              const chartH = 180 - padding.top - padding.bottom;

              const points = chartData.map((d, i) => {
                const x = padding.left + (i * (chartW / (chartData.length - 1)));
                const y = padding.top + chartH - (d.value / maxVal) * chartH;
                return { x, y, month: d.month, value: d.value };
              });

              let linePath = '';
              let areaPath = '';
              if (points.length > 0) {
                linePath = `M ${points[0].x} ${points[0].y} ` + points.slice(1).map(p => `L ${p.x} ${p.y}`).join(' ');
                areaPath = `${linePath} L ${points[points.length - 1].x} ${padding.top + chartH} L ${points[0].x} ${padding.top + chartH} Z`;
              }

              // Report submit handler
              const handleCreateReport = async (e) => {
                e.preventDefault();
                if (!customReportForm.reportName || !customReportForm.reportName.trim()) {
                  showToast('Please enter a report template name', 'error');
                  return;
                }
                try {
                  const token = localStorage.getItem('token');
                  const res = await fetch('/api/superadmin/reports', {
                    method: 'POST',
                    headers: {
                      'Content-Type': 'application/json',
                      'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify({
                      name: customReportForm.reportName,
                      source: customReportForm.source,
                      field: `${customReportForm.groupField} (${customReportForm.aggType} of ${customReportForm.calcField})`,
                      date: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                    })
                  });
                  if (res.ok) {
                    const newRep = await res.json();
                    setCustomReports(prev => [newRep, ...prev]);
                    setCustomReportForm({ source: 'Invoices', groupField: 'Hospital', aggType: 'Sum', calcField: 'Amount', reportName: '' });
                    showToast('Report template created successfully!', 'success');
                  } else {
                    showToast('Failed to create report template', 'error');
                  }
                } catch (err) {
                  console.error(err);
                  showToast('Error creating report template', 'error');
                }
              };

              // Report delete handler
              const handleDeleteReport = async (id) => {
                setConfirmModalConfig({
                  title: 'Delete Custom Report',
                  message: 'Are you sure you want to delete this custom report template?',
                  confirmText: 'Yes, Delete Report',
                  cancelText: 'Cancel',
                  danger: true,
                  onConfirm: async () => {
                    setConfirmModalConfig(prev => ({ ...prev, isLoading: true, confirmText: 'Deleting...' }));
                    try {
                      const token = localStorage.getItem('token');
                      const res = await fetch(`/api/superadmin/reports/${id}`, {
                        method: 'DELETE',
                        headers: { 'Authorization': `Bearer ${token}` }
                      });
                      if (res.ok) {
                        setCustomReports(prev => prev.filter(r => r._id !== id));
                        showToast('Report template deleted successfully!', 'success');
                      } else {
                        showToast('Failed to delete report template', 'error');
                      }
                    } catch (err) {
                      console.error(err);
                      showToast('Error deleting report template', 'error');
                    } finally {
                      setConfirmModalConfig(null);
                    }
                  }
                });
              };

              // Schedule delete handler
              const handleDeleteSchedule = async (id) => {
                setConfirmModalConfig({
                  title: 'Delete Scheduled Report',
                  message: 'Are you sure you want to delete this scheduled automated report?',
                  confirmText: 'Yes, Delete Schedule',
                  cancelText: 'Cancel',
                  danger: true,
                  onConfirm: async () => {
                    setConfirmModalConfig(prev => ({ ...prev, isLoading: true, confirmText: 'Deleting...' }));
                    try {
                      const token = localStorage.getItem('token');
                      const res = await fetch(`/api/superadmin/schedules/${id}`, {
                        method: 'DELETE',
                        headers: { 'Authorization': `Bearer ${token}` }
                      });
                      if (res.ok) {
                        setScheduledReports(prev => prev.filter(s => s._id !== id));
                        showToast('Scheduled report deleted successfully!', 'success');
                      } else {
                        showToast('Failed to delete scheduled report', 'error');
                      }
                    } catch (err) {
                      console.error(err);
                      showToast('Error deleting scheduled report', 'error');
                    } finally {
                      setConfirmModalConfig(null);
                    }
                  }
                });
              };

              // Schedule submit handler
              const handleCreateSchedule = async (e) => {
                e.preventDefault();
                if (!scheduleReportForm.recipientEmail || !scheduleReportForm.recipientEmail.trim()) {
                  showToast('Please enter a recipient email address', 'error');
                  return;
                }
                try {
                  const token = localStorage.getItem('token');
                  const res = await fetch('/api/superadmin/schedules', {
                    method: 'POST',
                    headers: {
                      'Content-Type': 'application/json',
                      'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify({
                      name: scheduleReportForm.reportType,
                      frequency: scheduleReportForm.frequency,
                      format: scheduleReportForm.format,
                      recipients: scheduleReportForm.recipientEmail,
                      status: 'Active'
                    })
                  });
                  if (res.ok) {
                    const newSch = await res.json();
                    setScheduledReports(prev => [newSch, ...prev]);
                    setScheduleReportForm({ reportType: 'Weekly Revenue Summary', frequency: 'Weekly', format: 'PDF', recipientEmail: '' });
                    showToast('Automated schedule created successfully!', 'success');
                  } else {
                    showToast('Failed to schedule report', 'error');
                  }
                } catch (err) {
                  console.error(err);
                  showToast('Error scheduling report', 'error');
                }
              };



              const getInvoiceStatusStyle = (status) => {
                const stat = (status || 'unpaid').toLowerCase();
                if (stat === 'paid') return { bg: '#DEF7EC', color: '#03543F' };
                if (stat === 'unpaid') return { bg: '#FEF3C7', color: '#92400E' };
                return { bg: '#FDE8E8', color: '#9B1C1C' }; // overdue
              };

              return (
                <div style={styles.pageBodyScroll}>
                  {/* Page Title Header */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                    <div>
                      <h2 style={styles.cardHeaderTitle}>SaaS Analytics & BI Platform</h2>
                      <p style={styles.cardHeaderSub}>Review Monthly Recurring Revenue (MRR), ARR conversion charts, and plan upgrades.</p>
                    </div>
                  </div>

                  {/* BI OVERVIEW DASHBOARD */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                      {/* KPI Metrics Row */}
                      <div style={styles.kpiGrid}>
                        <div style={styles.kpiCard}>
                          <div style={styles.kpiLabel}>TOTAL SAAS REVENUE</div>
                          <div style={{ ...styles.kpiVal, color: '#10B981' }}>₹{totalRevenue.toLocaleString('en-IN')}</div>
                          <div style={styles.kpiSubText}>Gross Paid Invoices</div>
                        </div>
                        <div style={styles.kpiCard}>
                          <div style={styles.kpiLabel}>ACTIVE SUBSCRIPTIONS</div>
                          <div style={{ ...styles.kpiVal, color: '#3B82F6' }}>{activeSubsCount}</div>
                          <div style={styles.kpiSubText}>Live Client Tenants</div>
                        </div>
                        <div style={styles.kpiCard}>
                          <div style={styles.kpiLabel}>AVERAGE CONTRACT VALUE (ACV)</div>
                          <div style={{ ...styles.kpiVal, color: '#6366F1' }}>₹{Math.round(acv).toLocaleString('en-IN')}<span style={{ fontSize: '11px', color: '#64748B', fontWeight: 600 }}>/mo</span></div>
                          <div style={styles.kpiSubText}>Avg Active Monthly Rate</div>
                        </div>
                        <div style={styles.kpiCard}>
                          <div style={styles.kpiLabel}>PENDING BILLINGS</div>
                          <div style={{ ...styles.kpiVal, color: '#F59E0B' }}>₹{pendingRevenue.toLocaleString('en-IN')}</div>
                          <div style={styles.kpiSubText}>Unpaid & Overdue Invoices</div>
                        </div>
                      </div>

                      {/* Charts Grid */}
                      <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.8fr', gap: '20px' }}>
                        {/* MRR Trend Area Chart */}
                        <div style={styles.glassCard}>
                          <h3 style={styles.cardHeaderTitle}>Monthly Recurring Revenue (MRR) Trend</h3>
                          <span style={styles.cardHeaderSub}>Past 6 months growth tracking and projection</span>
                          <div style={{ ...styles.chartWrapper, height: '200px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <svg width="460" height="180" style={{ overflow: 'visible' }}>
                              <defs>
                                <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
                                  <stop offset="0%" stopColor="#2563EB" stopOpacity="0.25" />
                                  <stop offset="100%" stopColor="#2563EB" stopOpacity="0.00" />
                                </linearGradient>
                              </defs>

                              {/* Y-Axis Grid Lines & Labels */}
                              {[0, 0.25, 0.5, 0.75, 1].map((r, idx) => {
                                const yVal = padding.top + chartH - r * chartH;
                                const labelVal = Math.round((r * maxVal) / 1000) + 'k';
                                return (
                                  <g key={idx}>
                                    <line
                                      x1={padding.left}
                                      y1={yVal}
                                      x2={padding.left + chartW}
                                      y2={yVal}
                                      stroke="#E2E8F0"
                                      strokeWidth="1"
                                      strokeDasharray="4 4"
                                    />
                                    <text
                                      x={padding.left - 10}
                                      y={yVal + 4}
                                      textAnchor="end"
                                      style={{ fontSize: '10px', fill: '#64748B', fontWeight: 600 }}
                                    >
                                      ₹{labelVal}
                                    </text>
                                  </g>
                                );
                              })}

                              {/* Area under the line */}
                              {areaPath && <path d={areaPath} fill="url(#areaGrad)" />}

                              {/* Line Chart */}
                              {linePath && <path d={linePath} fill="none" stroke="#2563EB" strokeWidth="2.5" />}

                              {/* Interactive Crosshair & Point Highlights */}
                              {hoveredPoint !== null && (
                                <line
                                  x1={points[hoveredPoint].x}
                                  y1={padding.top}
                                  x2={points[hoveredPoint].x}
                                  y2={padding.top + chartH}
                                  stroke="#3B82F6"
                                  strokeWidth="1"
                                  strokeDasharray="2 2"
                                />
                              )}

                              {points.map((p, i) => (
                                <circle
                                  key={i}
                                  cx={p.x}
                                  cy={p.y}
                                  r={hoveredPoint === i ? '6' : '4'}
                                  fill="#FFFFFF"
                                  stroke="#2563EB"
                                  strokeWidth={hoveredPoint === i ? '3.5' : '2'}
                                  style={{ cursor: 'pointer', transition: 'all 0.15s' }}
                                  onMouseEnter={() => setHoveredPoint(i)}
                                  onMouseLeave={() => setHoveredPoint(null)}
                                />
                              ))}

                              {/* X-Axis Month Labels */}
                              {points.map((p, i) => (
                                <text
                                  key={i}
                                  x={p.x}
                                  y={padding.top + chartH + 16}
                                  textAnchor="middle"
                                  style={{ fontSize: '10.5px', fill: '#64748B', fontWeight: 700 }}
                                >
                                  {p.month}
                                </text>
                              ))}
                            </svg>

                            {/* Floating Tooltip Card */}
                            {hoveredPoint !== null && (
                              <div style={{
                                position: 'absolute',
                                left: `${points[hoveredPoint].x + 35}px`,
                                top: `${points[hoveredPoint].y - 15}px`,
                                background: '#0F172A',
                                color: '#FFFFFF',
                                padding: '8px 12px',
                                borderRadius: '8px',
                                fontSize: '11px',
                                boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.3)',
                                pointerEvents: 'none',
                                zIndex: 10,
                                transform: 'translateX(-50%)',
                                border: '1px solid #1E293B'
                              }}>
                                <div style={{ color: '#94A3B8', fontWeight: 800, fontSize: '9px', textTransform: 'uppercase', marginBottom: '2px' }}>{points[hoveredPoint].month} 2026 Revenue</div>
                                <div style={{ fontSize: '13px', fontWeight: 900, color: '#38BDF8' }}>₹{points[hoveredPoint].value.toLocaleString('en-IN')}</div>
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Interactive Plan Distribution Metrics */}
                        <div style={styles.glassCard}>
                          <h3 style={styles.cardHeaderTitle}>Plan Distribution Metrics</h3>
                          <span style={styles.cardHeaderSub}>Subscription shares of active hospital clients</span>
                          
                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginTop: '12px' }}>
                            <div style={{ position: 'relative', width: '150px', height: '150px' }}>
                              <svg width="150" height="150" viewBox="0 0 120 120" style={{ transform: 'rotate(-90deg)' }}>
                                <circle cx="60" cy="60" r="40" fill="transparent" stroke="#F1F5F9" strokeWidth="12" />
                                
                                {enterLen > 0 && (
                                  <circle
                                    cx="60"
                                    cy="60"
                                    r="40"
                                    fill="transparent"
                                    stroke="#6366F1"
                                    strokeWidth={hoveredSlice === 'enterprise' ? '14' : '12'}
                                    strokeDasharray={`${enterLen} 251.327`}
                                    strokeDashoffset={enterOffset}
                                    strokeLinecap="round"
                                    style={{ cursor: 'pointer', transition: 'all 0.2s' }}
                                    onMouseEnter={() => setHoveredSlice('enterprise')}
                                    onMouseLeave={() => setHoveredSlice(null)}
                                  />
                                )}
                                
                                {profLen > 0 && (
                                  <circle
                                    cx="60"
                                    cy="60"
                                    r="40"
                                    fill="transparent"
                                    stroke="#06B6D4"
                                    strokeWidth={hoveredSlice === 'professional' ? '14' : '12'}
                                    strokeDasharray={`${profLen} 251.327`}
                                    strokeDashoffset={profOffset}
                                    strokeLinecap="round"
                                    style={{ cursor: 'pointer', transition: 'all 0.2s' }}
                                    onMouseEnter={() => setHoveredSlice('professional')}
                                    onMouseLeave={() => setHoveredSlice(null)}
                                  />
                                )}
                                
                                {basicLen > 0 && (
                                  <circle
                                    cx="60"
                                    cy="60"
                                    r="40"
                                    fill="transparent"
                                    stroke="#F59E0B"
                                    strokeWidth={hoveredSlice === 'basic' ? '14' : '12'}
                                    strokeDasharray={`${basicLen} 251.327`}
                                    strokeDashoffset={basicOffset}
                                    strokeLinecap="round"
                                    style={{ cursor: 'pointer', transition: 'all 0.2s' }}
                                    onMouseEnter={() => setHoveredSlice('basic')}
                                    onMouseLeave={() => setHoveredSlice(null)}
                                  />
                                )}
                              </svg>

                              {/* Donut Center Label Overlay */}
                              <div style={{
                                position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
                                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                                textAlign: 'center', pointerEvents: 'none'
                              }}>
                                {hoveredSlice === 'enterprise' ? (
                                  <>
                                    <span style={{ fontSize: '9px', fontWeight: 800, color: '#64748B', textTransform: 'uppercase' }}>Enterprise</span>
                                    <span style={{ fontSize: '16px', fontWeight: 850, color: '#6366F1' }}>{planDistribution.Enterprise}</span>
                                    <span style={{ fontSize: '9px', color: '#64748B', fontWeight: 600 }}>({Math.round(enterPct*100)}%)</span>
                                  </>
                                ) : hoveredSlice === 'professional' ? (
                                  <>
                                    <span style={{ fontSize: '9px', fontWeight: 800, color: '#64748B', textTransform: 'uppercase' }}>Professional</span>
                                    <span style={{ fontSize: '16px', fontWeight: 850, color: '#06B6D4' }}>{planDistribution.Professional}</span>
                                    <span style={{ fontSize: '9px', color: '#64748B', fontWeight: 600 }}>({Math.round(profPct*100)}%)</span>
                                  </>
                                ) : hoveredSlice === 'basic' ? (
                                  <>
                                    <span style={{ fontSize: '9px', fontWeight: 800, color: '#64748B', textTransform: 'uppercase' }}>Basic/Std</span>
                                    <span style={{ fontSize: '16px', fontWeight: 850, color: '#F59E0B' }}>{planDistribution.Basic}</span>
                                    <span style={{ fontSize: '9px', color: '#64748B', fontWeight: 600 }}>({Math.round(basicPct*100)}%)</span>
                                  </>
                                ) : (
                                  <>
                                    <span style={{ fontSize: '8px', fontWeight: 800, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.3px' }}>TOTAL HOSPS</span>
                                    <span style={{ fontSize: '20px', fontWeight: 900, color: '#0F172A' }}>{totalPlanHospitals}</span>
                                    <span style={{ fontSize: '8px', color: '#94A3B8', fontWeight: 600 }}>Tenants</span>
                                  </>
                                )}
                              </div>
                            </div>

                            {/* Legend */}
                            <div style={{ display: 'flex', gap: '14px', marginTop: '10px', justifyContent: 'center' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                                <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#6366F1' }} />
                                <span style={{ fontSize: '11px', fontWeight: 700, color: '#475569' }}>Enterprise ({planDistribution.Enterprise})</span>
                              </div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                                <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#06B6D4' }} />
                                <span style={{ fontSize: '11px', fontWeight: 700, color: '#475569' }}>Professional ({planDistribution.Professional})</span>
                              </div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                                <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#F59E0B' }} />
                                <span style={{ fontSize: '11px', fontWeight: 700, color: '#475569' }}>Basic ({planDistribution.Basic})</span>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Recent Invoices Table */}
                      <div style={styles.glassCard}>
                        <h3 style={styles.cardHeaderTitle}>Recent Billing Ingress</h3>
                        <span style={styles.cardHeaderSub}>Tracking the latest invoicing cycles across the tenant portfolio</span>
                        
                        <div style={{ marginTop: '12px', overflowX: 'auto' }}>
                          <table style={styles.dataTable}>
                            <thead>
                              <tr>
                                <th style={styles.tableTh}>Invoice #</th>
                                <th style={styles.tableTh}>Hospital</th>
                                <th style={styles.tableTh}>Subscription</th>
                                <th style={styles.tableTh}>Invoice Date</th>
                                <th style={styles.tableTh}>Amount</th>
                                <th style={styles.tableTh}>Status</th>
                              </tr>
                            </thead>
                            <tbody>
                              {invoices.length === 0 ? (
                                <tr>
                                  <td colSpan="6" style={{ textAlign: 'center', padding: '20px', color: '#64748B', fontSize: '12px' }}>No billing records found</td>
                                </tr>
                              ) : (
                                invoices.slice(0, 5).map((inv) => {
                                  const statusStyle = getInvoiceStatusStyle(inv.status);
                                  return (
                                    <tr key={inv._id || inv.invoiceNum} style={styles.tableRow}>
                                      <td style={{ ...styles.tableTd, fontWeight: 750, color: '#2563EB' }}>{inv.invoiceNum}</td>
                                      <td style={{ ...styles.tableTd, fontWeight: 700 }}>{inv.hospital}</td>
                                      <td style={styles.tableTd}>
                                        {(() => {
                                          const hospObj = hospitals.find(h => h.name.toLowerCase() === inv.hospital.toLowerCase());
                                          return hospObj ? hospObj.plan : (inv.subscription || 'Standard Basic');
                                        })()}
                                      </td>
                                      <td style={styles.tableTd}>{inv.invoiceDate || 'N/A'}</td>
                                      <td style={{ ...styles.tableTd, fontWeight: 750 }}>₹{(inv.amount || 0).toLocaleString('en-IN')}</td>
                                      <td style={styles.tableTd}>
                                        <span style={{
                                          padding: '3px 8px', borderRadius: '12px', fontSize: '10px', fontWeight: 800,
                                          background: statusStyle.bg, color: statusStyle.color, textTransform: 'uppercase'
                                        }}>
                                          {inv.status}
                                        </span>
                                      </td>
                                    </tr>
                                  );
                                })
                              )}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </div>
                </div>
              );
            })()}

          </main>

          {/* COLLAPSIBLE RIGHT PRODUCTIVITY SIDEBAR */}
          <aside style={{ 
            ...styles.rightSidebar, 
            width: isRightSidebarCollapsed ? '0' : '300px', 
            minWidth: isRightSidebarCollapsed ? '0' : '300px',
            flexShrink: 0,
            borderLeftWidth: isRightSidebarCollapsed ? '0' : '1px', 
            opacity: isRightSidebarCollapsed ? 0 : 1 
          }}>
            <div style={styles.rightSidebarContent}>
              <div style={styles.rightSidebarHeader}>
                <h3 style={styles.rightSidebarTitle}>SaaS Productivity</h3>
                <button style={styles.collapseRightBtn} onClick={() => setIsRightSidebarCollapsed(true)}>
                  <LucideIcon name="x" style={{ width: '16px', height: '16px', color: '#64748B' }} />
                </button>
              </div>

              <div style={styles.sidebarSection}>
                <div style={styles.sidebarSectionTitle}>TODAY'S MEETINGS</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {meetings.length === 0 ? (
                    <div style={{ padding: '12px', fontSize: '12px', color: '#64748B', background: '#F8FAFC', borderRadius: '8px', border: '1px solid #E2E8F0', textAlign: 'center' }}>
                      No meetings scheduled for today
                    </div>
                  ) : (
                    meetings.map((m) => (
                      <div key={m._id} style={{ ...styles.meetingCard, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                          <div style={styles.meetingTime}>{m.time} {m.date && m.date !== new Date().toISOString().split('T')[0] && `(${m.date})`}</div>
                          <div style={styles.meetingTitle}>{m.title}</div>
                        </div>
                        <button 
                          onClick={() => handleDeleteMeeting(m._id)}
                          style={{
                            background: 'transparent',
                            border: 'none',
                            cursor: 'pointer',
                            color: '#94A3B8',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            padding: '4px',
                            borderRadius: '4px',
                            transition: 'color 0.2s'
                          }}
                          onMouseEnter={e => e.currentTarget.style.color = '#EF4444'}
                          onMouseLeave={e => e.currentTarget.style.color = '#94A3B8'}
                        >
                          <LucideIcon name="trash" style={{ width: '13px', height: '13px' }} />
                        </button>
                      </div>
                    ))
                  )}
                </div>

                {/* Add Meeting Form */}
                <form onSubmit={handleAddMeeting} style={{ marginTop: '16px', display: 'flex', flexDirection: 'column', gap: '10px', padding: '14px', border: '1px solid #E2E8F0', borderRadius: '10px', background: '#FFFFFF', boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.05)' }}>
                  <div style={{ fontSize: '11px', fontWeight: 800, color: '#475569', textTransform: 'uppercase', marginBottom: '2px', letterSpacing: '0.5px' }}>Schedule Meeting</div>
                  <input
                    type="text"
                    placeholder="Meeting Title"
                    required
                    style={{ ...styles.formInput, padding: '8px 12px', fontSize: '12px', height: 'auto', background: '#F8FAFC', width: '100%', boxSizing: 'border-box' }}
                    value={newMeetingTitle}
                    onChange={e => setNewMeetingTitle(e.target.value)}
                  />
                  <input
                    type="text"
                    placeholder="Time (e.g. 10:00 AM)"
                    required
                    style={{ ...styles.formInput, padding: '8px 12px', fontSize: '12px', height: 'auto', background: '#F8FAFC', width: '100%', boxSizing: 'border-box' }}
                    value={newMeetingTime}
                    onChange={e => setNewMeetingTime(e.target.value)}
                  />
                  <input
                    type="date"
                    required
                    style={{ ...styles.formInput, padding: '8px 12px', fontSize: '12px', height: 'auto', background: '#F8FAFC', width: '100%', boxSizing: 'border-box' }}
                    value={newMeetingDate}
                    onChange={e => setNewMeetingDate(e.target.value)}
                  />
                  <button type="submit" style={{ ...styles.btnPrimary, padding: '8px 14px', fontSize: '11px', alignSelf: 'stretch', marginTop: '4px', textAlign: 'center', justifyContent: 'center' }}>
                    Add Meeting
                  </button>
                </form>
              </div>
            </div>
          </aside>
        </div>
      </div>

      {/* NOTIFICATIONS DRAWER */}
      <div style={{ ...styles.drawerOverlay, background: isNotificationOpen ? 'rgba(15, 23, 42, 0.3)' : 'rgba(15, 23, 42, 0)', backdropFilter: isNotificationOpen ? 'blur(4px)' : 'blur(0)', pointerEvents: isNotificationOpen ? 'auto' : 'none', transition: 'background 0.3s ease, backdrop-filter 0.3s ease' }} onClick={() => setIsNotificationOpen(false)}>
        <div style={{ ...styles.drawerContainer, display: 'flex', flexDirection: 'column', transform: isNotificationOpen ? 'translateX(0)' : 'translateX(100%)', transition: 'transform 0.3s cubic-bezier(0.16, 1, 0.3, 1)' }} onClick={e => e.stopPropagation()}>
            <div style={styles.drawerHeader}>
              <h3 style={styles.drawerTitle}>Notification Center</h3>
              <button style={styles.drawerCloseBtn} onClick={() => setIsNotificationOpen(false)}>
                <LucideIcon name="x" style={{ width: '18px', height: '18px' }} />
              </button>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 20px', borderBottom: '1px solid #E2E8F0', background: '#F8FAFC', alignItems: 'center' }}>
              <span style={{ fontSize: '12px', fontWeight: 600, color: '#475569' }}>
                {notifications.filter(n => !n.isRead).length} unread
              </span>
              <div style={{ display: 'flex', gap: '12px' }}>
                {notifications.filter(n => !n.isRead).length > 0 && (
                  <button onClick={markAllAsRead} style={{ background: 'none', border: 'none', color: '#2563EB', fontSize: '12px', fontWeight: 600, cursor: 'pointer', padding: 0 }}>
                    Mark all read
                  </button>
                )}
                {notifications.length > 0 && (
                  <button onClick={clearAllNotifications} style={{ background: 'none', border: 'none', color: '#EF4444', fontSize: '12px', fontWeight: 600, cursor: 'pointer', padding: 0 }}>
                    Clear all
                  </button>
                )}
              </div>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '16px' }}>
              {notifications.length === 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '200px', color: '#94A3B8' }}>
                  <LucideIcon name="bell-off" style={{ width: '40px', height: '40px', marginBottom: '12px' }} />
                  <span style={{ fontSize: '13.5px', fontWeight: 500 }}>No notifications found</span>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {notifications.map(n => {
                    let iconName = 'bell';
                    let iconColor = '#64748B';
                    let bgColor = '#F1F5F9';
                    if (n.category === 'onboarding') {
                      iconName = 'user-plus';
                      iconColor = '#3B82F6';
                      bgColor = '#EFF6FF';
                    } else if (n.category === 'support') {
                      iconName = 'help-circle';
                      iconColor = '#EF4444';
                      bgColor = '#FEF2F2';
                    } else if (n.category === 'billing') {
                      iconName = 'credit-card';
                      iconColor = '#10B981';
                      bgColor = '#ECFDF5';
                    } else if (n.category === 'system') {
                      iconName = 'database';
                      iconColor = '#F59E0B';
                      bgColor = '#FFFBEB';
                    } else if (n.category === 'lead') {
                      iconName = 'briefcase';
                      iconColor = '#8B5CF6';
                      bgColor = '#F5F3FF';
                    }

                    return (
                      <div key={n._id} style={{
                        display: 'flex',
                        gap: '12px',
                        padding: '12px',
                        borderRadius: '8px',
                        background: '#FFFFFF',
                        border: '1px solid #E2E8F0',
                        position: 'relative',
                        boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
                        opacity: n.isRead ? 0.75 : 1
                      }}>
                        <div style={{
                          width: '36px',
                          height: '36px',
                          borderRadius: '50%',
                          background: bgColor,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexShrink: 0
                        }}>
                          <LucideIcon name={iconName} style={{ width: '18px', height: '18px', color: iconColor }} />
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                            <h4 style={{ fontSize: '13px', fontWeight: 600, color: '#1E293B', margin: 0 }}>
                              {n.title}
                            </h4>
                            <span style={{ fontSize: '10px', color: '#94A3B8' }}>
                              {new Date(n.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          </div>
                          <p style={{ fontSize: '12px', color: '#475569', margin: '4px 0 0 0', lineHeight: 1.4 }}>
                            {n.message}
                          </p>
                          {!n.isRead && (
                            <button
                              onClick={() => markAsRead(n._id)}
                              style={{
                                background: 'transparent',
                                border: 'none',
                                color: '#3B82F6',
                                fontSize: '11px',
                                fontWeight: 600,
                                cursor: 'pointer',
                                padding: '4px 0 0 0',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '4px'
                              }}
                            >
                              <LucideIcon name="check" style={{ width: '12px', height: '12px' }} />
                              Mark as read
                            </button>
                          )}
                        </div>
                        {!n.isRead && (
                          <div style={{
                            position: 'absolute',
                            top: '12px',
                            right: '12px',
                            width: '6px',
                            height: '6px',
                            borderRadius: '50%',
                            background: '#3B82F6'
                          }} />
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>

      {/* SEARCH MODAL */}
      {isSearchModalOpen && (
        <div style={styles.modalOverlay} onClick={() => setIsSearchModalOpen(false)}>
          <div style={styles.searchModalContainer} onClick={e => e.stopPropagation()}>
            <div style={styles.searchModalHeader}>
              <LucideIcon name="search" style={{ width: '20px', height: '20px', color: '#64748B' }} />
              <input 
                type="text" 
                placeholder="Search tabs, hospitals, onboarding, tickets..." 
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                style={styles.searchModalInput}
                autoFocus
              />
              {searchQuery && (
                <button 
                  onClick={() => setSearchQuery('')}
                  style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#64748B', display: 'flex', alignItems: 'center' }}
                >
                  <LucideIcon name="x" style={{ width: '16px', height: '16px' }} />
                </button>
              )}
            </div>

            {searchQuery.trim() && (() => {
              const query = searchQuery.toLowerCase().trim();
              const matchedHospitals = hospitals.filter(h => h.name.toLowerCase().includes(query) || h.code.toLowerCase().includes(query));
              const matchedOnboarding = onboardingHospitals.filter(h => h.name.toLowerCase().includes(query) || (h.exec && h.exec.toLowerCase().includes(query)));
              const matchedTickets = tickets.filter(t => t.id?.toLowerCase().includes(query) || t.subject?.toLowerCase().includes(query) || t.hospital?.toLowerCase().includes(query) || t.category?.toLowerCase().includes(query));
              
              const matchedTabs = [
                { id: 'dashboard', name: 'Overview / Analytics Dashboard' },
                { id: 'hospital-onboarding', name: 'Hospital Onboarding & Pipeline' },
                { id: 'hospitals', name: 'Connected Corporate Hospitals' },
                { id: 'subscription-mgmt', name: 'Subscription Management & Pricing' },
                { id: 'support-success', name: 'Client Support Tickets & SLA Desk' },
                { id: 'broadcast-center', name: 'Platform Broadcast Center' },
                { id: 'finance-mgmt', name: 'Subscription Invoicing & Finance' },
                { id: 'hr-mgmt', name: 'Employees & Team Directory' },
                { id: 'bi-reports', name: 'Platform Reports & SaaS Analytics' },
                { id: 'platform-control', name: 'Platform Settings & Control Center' }
              ].filter(tab => tab.name.toLowerCase().includes(query) || tab.id.toLowerCase().includes(query));

              const totalResults = matchedHospitals.length + matchedOnboarding.length + matchedTickets.length + matchedTabs.length;

              return (
                <div style={{ maxHeight: '350px', overflowY: 'auto', borderTop: '1px solid #E2E8F0' }}>
                  {totalResults === 0 ? (
                    <div style={{ padding: '20px', textAlign: 'center', color: '#64748B', fontSize: '12.5px' }}>
                      No matches found for "{searchQuery}"
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                      {/* Tabs */}
                      {matchedTabs.length > 0 && (
                        <div>
                          <div style={{ padding: '8px 16px', background: '#F8FAFC', fontSize: '10px', fontWeight: 800, color: '#64748B', borderBottom: '1px solid #F1F5F9' }}>NAVIGATION TABS</div>
                          {matchedTabs.map(tab => (
                            <div 
                              key={tab.id} 
                              style={{ padding: '10px 16px', fontSize: '12.5px', color: '#1E293B', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}
                              onClick={() => {
                                setActiveTab(tab.id);
                                setIsSearchModalOpen(false);
                                setSearchQuery('');
                              }}
                              className="search-result-item"
                            >
                              <LucideIcon name="layout-dashboard" style={{ width: '14px', height: '14px', color: '#2563EB' }} />
                              <span>{tab.name}</span>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Connected Hospitals */}
                      {matchedHospitals.length > 0 && (
                        <div>
                          <div style={{ padding: '8px 16px', background: '#F8FAFC', fontSize: '10px', fontWeight: 800, color: '#64748B', borderBottom: '1px solid #F1F5F9' }}>CONNECTED HOSPITALS</div>
                          {matchedHospitals.map(h => (
                            <div 
                              key={h._id} 
                              style={{ padding: '10px 16px', fontSize: '12.5px', color: '#1E293B', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}
                              onClick={() => {
                                setActiveTab('hospitals');
                                setSelectedHospitalId(h._id);
                                setIsSearchModalOpen(false);
                                setSearchQuery('');
                              }}
                              className="search-result-item"
                            >
                              <LucideIcon name="building" style={{ width: '14px', height: '14px', color: '#10B981' }} />
                              <span>{h.name} ({h.code})</span>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Onboarding Pipeline */}
                      {matchedOnboarding.length > 0 && (
                        <div>
                          <div style={{ padding: '8px 16px', background: '#F8FAFC', fontSize: '10px', fontWeight: 800, color: '#64748B', borderBottom: '1px solid #F1F5F9' }}>ONBOARDING PIPELINE</div>
                          {matchedOnboarding.map(h => (
                            <div 
                              key={h._id} 
                              style={{ padding: '10px 16px', fontSize: '12.5px', color: '#1E293B', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}
                              onClick={() => {
                                setActiveTab('hospital-onboarding');
                                setSelectedOnboardingHospital(h);
                                setIsSearchModalOpen(false);
                                setSearchQuery('');
                              }}
                              className="search-result-item"
                            >
                              <LucideIcon name="activity" style={{ width: '14px', height: '14px', color: '#F59E0B' }} />
                              <span>{h.name} - Stage: {h.stage}</span>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Tickets */}
                      {matchedTickets.length > 0 && (
                        <div>
                          <div style={{ padding: '8px 16px', background: '#F8FAFC', fontSize: '10px', fontWeight: 800, color: '#64748B', borderBottom: '1px solid #F1F5F9' }}>SUPPORT TICKETS</div>
                          {matchedTickets.map(t => (
                            <div 
                              key={t._id || t.id} 
                              style={{ padding: '10px 16px', fontSize: '12.5px', color: '#1E293B', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}
                              onClick={() => {
                                setActiveTab('support-success');
                                setSelectedTicketId(t._id);
                                setIsSearchModalOpen(false);
                                setSearchQuery('');
                              }}
                              className="search-result-item"
                            >
                              <LucideIcon name="help-circle" style={{ width: '14px', height: '14px', color: '#EF4444' }} />
                              <span>{t.id}: {t.subject} ({t.hospital})</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
        </div>
      )}



      {/* NEW ONBOARDING MODAL */}
      {isDeleteModalOpen && selectedOnboardingHospital && (
        <div style={styles.modalOverlay} onClick={() => !isDeleting && setIsDeleteModalOpen(false)}>
          <div style={{ ...styles.searchModalContainer, width: '400px', display: 'flex', flexDirection: 'column', textAlign: 'center', padding: '32px 24px' }} onClick={e => e.stopPropagation()}>
            <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: '#FEF2F2', color: '#EF4444', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px auto' }}>
              <LucideIcon name="alert-triangle" style={{ width: '24px', height: '24px' }} />
            </div>
            <h3 style={{ margin: '0 0 8px 0', fontSize: '18px', fontWeight: 800, color: '#1E293B' }}>Delete Onboarding Dossier</h3>
            <p style={{ margin: '0 0 24px 0', fontSize: '14px', color: '#64748B' }}>
              Are you sure you want to delete the onboarding setup for <strong style={{ color: '#1E293B' }}>"{selectedOnboardingHospital.name}"</strong>? This action cannot be undone.
            </p>
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
              <button 
                style={{ ...styles.btnSecondary, flex: 1, padding: '10px 16px', borderRadius: '8px', fontSize: '13px', fontWeight: 700 }} 
                onClick={() => setIsDeleteModalOpen(false)}
                disabled={isDeleting}
              >
                Cancel
              </button>
              <button 
                style={{ ...styles.btnPrimary, background: '#EF4444', border: 'none', color: '#FFF', flex: 1, padding: '10px 16px', borderRadius: '8px', fontSize: '13px', fontWeight: 700, opacity: isDeleting ? 0.7 : 1, cursor: isDeleting ? 'not-allowed' : 'pointer' }} 
                disabled={isDeleting}
                onClick={async () => {
                  setIsDeleting(true);
                  const token = localStorage.getItem('token');
                  try {
                    const res = await fetch(`/api/superadmin/onboarding/${selectedOnboardingHospital._id}`, {
                      method: 'DELETE',
                      headers: { 'Authorization': `Bearer ${token}` }
                    });
                    if (res.ok) {
                      setOnboardingHospitals(prev => prev.filter(o => o._id !== selectedOnboardingHospital._id));
                      setSelectedOnboardingHospital(null);
                      showToast('Onboarding record deleted.');
                      setIsDeleteModalOpen(false);
                    } else {
                      showToast('Failed to delete onboarding record.', 'error');
                    }
                  } catch (err) { 
                    console.error(err);
                    showToast('Failed to delete onboarding record.', 'error');
                  } finally {
                    setIsDeleting(false);
                  }
                }}
              >
                {isDeleting ? 'Deleting...' : 'Yes, Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* EDIT HOSPITAL BRANDING & LOGO MODAL */}
      {isLogoEditModalOpen && logoEditHosp && (
        <div 
          style={{ 
            position: 'fixed', 
            inset: 0, 
            background: 'rgba(15,23,42,0.6)', 
            backdropFilter: 'blur(4px)',
            zIndex: 99999, 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center',
            padding: '20px'
          }}
          onClick={() => !logoEditSaving && setIsLogoEditModalOpen(false)}
        >
          <div 
            style={{ 
              background: '#FFFFFF', 
              borderRadius: '20px', 
              padding: '28px', 
              width: '460px', 
              maxWidth: '100%', 
              boxShadow: '0 25px 60px -15px rgba(0,0,0,0.3)',
              border: '1px solid #E2E8F0',
              position: 'relative'
            }}
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '18px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{ width: '38px', height: '38px', borderRadius: '10px', background: '#EFF6FF', color: '#2563EB', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <LucideIcon name="image" style={{ width: '20px', height: '20px' }} />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 800, color: '#0F172A' }}>Edit Hospital Branding</h3>
                  <div style={{ fontSize: '12px', color: '#64748B', marginTop: '2px' }}>
                    {logoEditHosp.hospitalId ? `Portal ID: ${logoEditHosp.hospitalId}` : `Code: ${logoEditHosp.code}`}
                  </div>
                </div>
              </div>
              <button 
                type="button" 
                onClick={() => !logoEditSaving && setIsLogoEditModalOpen(false)} 
                style={{ background: '#F1F5F9', border: 'none', borderRadius: '50%', width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
              >
                <LucideIcon name="x" style={{ width: '16px', height: '16px', color: '#64748B' }} />
              </button>
            </div>

            {/* Hospital Name field */}
            <div style={{ marginBottom: '18px' }}>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                Hospital Name
              </label>
              <input
                type="text"
                value={logoEditNameDraft}
                onChange={e => setLogoEditNameDraft(e.target.value)}
                placeholder="Enter hospital name"
                style={{
                  width: '100%',
                  padding: '10px 14px',
                  borderRadius: '8px',
                  border: '1.5px solid #CBD5E1',
                  fontSize: '13px',
                  color: '#0F172A',
                  outline: 'none',
                  boxSizing: 'border-box'
                }}
              />
            </div>

            {/* Logo Dropzone & Controls */}
            <div style={{ marginBottom: '18px' }}>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                Hospital Logo
              </label>
              
              <div
                style={{
                  width: '100%',
                  height: '140px',
                  borderRadius: '12px',
                  border: logoEditDragOver ? '2px dashed #2563EB' : '2px dashed #CBD5E1',
                  background: logoEditDragOver ? '#EFF6FF' : '#F8FAFC',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  overflow: 'hidden',
                  transition: 'all 0.15s ease',
                  position: 'relative'
                }}
                onClick={() => logoEditInputRef.current && logoEditInputRef.current.click()}
                onDragOver={e => { e.preventDefault(); setLogoEditDragOver(true); }}
                onDragLeave={() => setLogoEditDragOver(false)}
                onDrop={e => {
                  e.preventDefault();
                  setLogoEditDragOver(false);
                  const f = e.dataTransfer.files?.[0];
                  if (f) handleLogoEditFile(f);
                }}
              >
                {logoEditDraft && logoEditDraft !== 'H' ? (
                  <div style={{ position: 'relative', width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '12px' }}>
                    <img 
                      src={logoEditDraft} 
                      alt="Logo Preview" 
                      style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} 
                    />
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px', color: '#64748B' }}>
                    <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: '#EFF6FF', color: '#2563EB', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <LucideIcon name="upload-cloud" style={{ width: '20px', height: '20px' }} />
                    </div>
                    <span style={{ fontSize: '12px', fontWeight: 600, color: '#1E293B' }}>Click or drag & drop logo here</span>
                    <span style={{ fontSize: '11px', color: '#94A3B8' }}>PNG, JPG, or SVG (max 2 MB)</span>
                  </div>
                )}
              </div>

              <input
                ref={logoEditInputRef}
                type="file"
                accept="image/png,image/jpeg,image/jpg,image/svg+xml"
                style={{ display: 'none' }}
                onChange={e => {
                  if (e.target.files?.[0]) handleLogoEditFile(e.target.files[0]);
                }}
              />

              <div style={{ display: 'flex', gap: '8px', marginTop: '10px', alignItems: 'center' }}>
                <button
                  type="button"
                  onClick={() => logoEditInputRef.current && logoEditInputRef.current.click()}
                  style={{
                    fontSize: '11px',
                    fontWeight: 700,
                    color: '#2563EB',
                    background: '#EFF6FF',
                    border: '1px solid #BFDBFE',
                    borderRadius: '6px',
                    padding: '5px 12px',
                    cursor: 'pointer'
                  }}
                >
                  {logoEditDraft && logoEditDraft !== 'H' ? 'Change Image' : 'Upload Image'}
                </button>
                {logoEditDraft && logoEditDraft !== 'H' && (
                  <button
                    type="button"
                    onClick={() => setLogoEditDraft('')}
                    style={{
                      fontSize: '11px',
                      fontWeight: 700,
                      color: '#DC2626',
                      background: '#FEF2F2',
                      border: '1px solid #FECACA',
                      borderRadius: '6px',
                      padding: '5px 12px',
                      cursor: 'pointer'
                    }}
                  >
                    Remove Logo
                  </button>
                )}
                <span style={{ marginLeft: 'auto', fontSize: '11px', color: '#94A3B8' }}>Max 2MB</span>
              </div>
            </div>

            {logoEditError && (
              <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', color: '#DC2626', borderRadius: '8px', padding: '8px 12px', fontSize: '12px', marginBottom: '16px' }}>
                {logoEditError}
              </div>
            )}

            <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
              <button
                type="button"
                disabled={logoEditSaving}
                onClick={() => setIsLogoEditModalOpen(false)}
                style={{
                  flex: 1,
                  padding: '10px 16px',
                  borderRadius: '10px',
                  border: '1px solid #CBD5E1',
                  background: '#FFFFFF',
                  color: '#475569',
                  fontSize: '13px',
                  fontWeight: 700,
                  cursor: logoEditSaving ? 'not-allowed' : 'pointer'
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={logoEditSaving}
                onClick={handleLogoEditSave}
                style={{
                  flex: 1,
                  padding: '10px 16px',
                  borderRadius: '10px',
                  border: 'none',
                  background: logoEditSaving ? '#93C5FD' : '#2563EB',
                  color: '#FFFFFF',
                  fontSize: '13px',
                  fontWeight: 700,
                  cursor: logoEditSaving ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px'
                }}
              >
                {logoEditSaving ? 'Saving…' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* EDIT SUBSCRIPTION PLAN MODAL */}
      {isEditingPlanModalOpen && editingPlan && (
        <div style={styles.modalOverlay} onClick={() => setIsEditingPlanModalOpen(false)}>
          <div style={{ ...styles.searchModalContainer, width: '560px', maxHeight: '90vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
            <div style={styles.drawerHeader}>
              <h3 style={styles.drawerTitle}>Edit Subscription Plan: {editingPlan.tier}</h3>
              <button style={styles.drawerCloseBtn} onClick={() => setIsEditingPlanModalOpen(false)}>
                <LucideIcon name="x" style={{ width: '18px', height: '18px' }} />
              </button>
            </div>
            <form onSubmit={async (e) => {
              e.preventDefault();
              const token = localStorage.getItem('token');
              try {
                const res = await fetch(`/api/superadmin/plans/${editingPlan._id}`, {
                  method: 'PUT',
                  headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                  body: JSON.stringify(editingPlan)
                });
                if (res.ok) {
                  showToast('Subscription plan updated successfully.', 'success');
                  setPlans(prev => prev.map(p => p._id === editingPlan._id ? editingPlan : p));
                  setIsEditingPlanModalOpen(false);
                } else {
                  const errData = await res.json();
                  showToast(errData.error || 'Failed to update plan.', 'error');
                }
              } catch (err) {
                console.error(err);
                showToast('Error updating plan.', 'error');
              }
            }} style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={styles.formRow}>
                <div style={styles.formCol}>
                  <label style={styles.formLabel}>MONTHLY PRICE (₹)</label>
                  <input
                    type="number"
                    required
                    style={styles.formInput}
                    value={editingPlan.monthlyPrice || 0}
                    onChange={e => setEditingPlan({ ...editingPlan, monthlyPrice: parseInt(e.target.value) || 0 })}
                  />
                </div>
                <div style={styles.formCol}>
                  <label style={styles.formLabel}>ANNUAL PRICE (₹/mo)</label>
                  <input
                    type="number"
                    required
                    style={styles.formInput}
                    value={editingPlan.annualPrice || 0}
                    onChange={e => setEditingPlan({ ...editingPlan, annualPrice: parseInt(e.target.value) || 0 })}
                  />
                </div>
              </div>

              <div style={styles.formRow}>
                <div style={styles.formCol}>
                  <label style={styles.formLabel}>DOCTOR LIMIT</label>
                  <input
                    type="number"
                    required
                    style={styles.formInput}
                    value={editingPlan.docs || 0}
                    onChange={e => setEditingPlan({ ...editingPlan, docs: parseInt(e.target.value) || 0 })}
                  />
                </div>
                <div style={styles.formCol}>
                  <label style={styles.formLabel}>STAFF LIMIT</label>
                  <input
                    type="number"
                    required
                    style={styles.formInput}
                    value={editingPlan.staff || 0}
                    onChange={e => setEditingPlan({ ...editingPlan, staff: parseInt(e.target.value) || 0 })}
                  />
                </div>
              </div>

              <div style={styles.formCol}>
                <label style={styles.formLabel}>STORAGE VAULT LIMIT</label>
                <input
                  type="text"
                  required
                  style={styles.formInput}
                  value={editingPlan.storage || ''}
                  onChange={e => setEditingPlan({ ...editingPlan, storage: e.target.value })}
                />
              </div>

              <div style={{ height: '1px', background: '#E2E8F0', margin: '4px 0' }} />

              <div>
                <span style={{ ...styles.formLabel, display: 'block', marginBottom: '8px' }}>INCLUDED ERP MODULES</span>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' }}>
                  {['reception', 'doctor', 'pharmacy', 'laboratory', 'emergency', 'billing', 'accounts', 'hr', 'payroll'].map(mod => {
                    const isChecked = editingPlan.modules?.includes(mod);
                    return (
                      <label key={mod} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', fontWeight: 600, color: '#334155', cursor: 'pointer' }}>
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={e => {
                            const current = editingPlan.modules || [];
                            const updated = e.target.checked 
                              ? [...current, mod] 
                              : current.filter(m => m !== mod);
                            setEditingPlan({ ...editingPlan, modules: updated });
                          }}
                          style={{ width: '14px', height: '14px' }}
                        />
                        <span style={{ textTransform: 'capitalize' }}>{mod}</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '8px' }}>
                <button type="button" style={styles.btnSecondary} onClick={() => setIsEditingPlanModalOpen(false)}>Cancel</button>
                {(() => {
                  const originalPlan = plans.find(p => p._id === editingPlan._id);
                  const hasChanges = originalPlan && (
                    originalPlan.monthlyPrice !== editingPlan.monthlyPrice ||
                    originalPlan.annualPrice !== editingPlan.annualPrice ||
                    originalPlan.docs !== editingPlan.docs ||
                    originalPlan.staff !== editingPlan.staff ||
                    originalPlan.storage !== editingPlan.storage ||
                    JSON.stringify([...(originalPlan.modules || [])].sort()) !== JSON.stringify([...(editingPlan.modules || [])].sort())
                  );
                  return (
                    <button 
                      type="submit" 
                      style={{
                        ...styles.btnPrimary, 
                        background: hasChanges ? '#2563EB' : '#94A3B8',
                        cursor: hasChanges ? 'pointer' : 'not-allowed',
                        opacity: hasChanges ? 1 : 0.8
                      }}
                      disabled={!hasChanges}
                    >
                      Save Changes
                    </button>
                  );
                })()}
              </div>
            </form>
          </div>
        </div>
      )}



      {/* ACTIVATE SUBSCRIPTION MODAL */}
      {isActivateModalOpen && selectedOnboardingHospital && (
        <div style={styles.modalOverlay} onClick={() => setIsActivateModalOpen(false)}>
          <div style={{ ...styles.searchModalContainer, width: '500px' }} onClick={e => e.stopPropagation()}>
            <div style={styles.drawerHeader}>
              <h3 style={styles.drawerTitle}>Activate Subscription for {selectedOnboardingHospital.name}</h3>
              <button style={styles.drawerCloseBtn} onClick={() => setIsActivateModalOpen(false)}>
                <LucideIcon name="x" style={{ width: '18px', height: '18px' }} />
              </button>
            </div>
            <form onSubmit={async (e) => {
              e.preventDefault();
              await executeHospitalActivation(selectedOnboardingHospital, activateForm);
            }} style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={styles.formRow}>
                <div style={styles.formCol}>
                  <label style={styles.formLabel}>HOSPITAL CODE</label>
                  <input
                    type="text"
                    required
                    style={styles.formInput}
                    placeholder="e.g. HOSP-101"
                    value={activateForm.code}
                    onChange={e => setActivateForm({ ...activateForm, code: e.target.value })}
                  />
                </div>
                <div style={styles.formCol}>
                  <label style={styles.formLabel}>CSM MANAGER</label>
                  <input
                    type="text"
                    required
                    style={styles.formInput}
                    placeholder="e.g. Platform Admin"
                    value={activateForm.csm}
                    onChange={e => setActivateForm({ ...activateForm, csm: e.target.value })}
                  />
                </div>
              </div>

              <div style={styles.formCol}>
                <label style={styles.formLabel}>CHOOSE SUBSCRIPTION PLAN</label>
                <select
                  style={styles.filterSelect}
                  value={activateForm.plan}
                  onChange={e => setActivateForm({ ...activateForm, plan: e.target.value })}
                >
                  <option value="Basic (₹5,000/mo)">Basic (₹5,000/mo)</option>
                  <option value="Basic Annual (₹4,000/mo)">Basic Annual (₹4,000/mo)</option>
                  <option value="Professional (₹24,000/mo)">Professional (₹24,000/mo)</option>
                  <option value="Professional Annual (₹19,200/mo)">Professional Annual (₹19,200/mo)</option>
                  <option value="Enterprise Elite (₹50,000/mo)">Enterprise Elite (₹50,000/mo)</option>
                  <option value="Enterprise Elite Annual (₹40,000/mo)">Enterprise Elite Annual (₹40,000/mo)</option>
                  <option value="Custom Plan">Custom Plan</option>
                </select>
              </div>

              <div style={styles.formRow}>
                <div style={styles.formCol}>
                  <label style={styles.formLabel}>ADMIN FULL NAME</label>
                  <input
                    type="text"
                    required
                    style={styles.formInput}
                    placeholder="e.g. Dr. Allison House"
                    value={activateForm.adminName}
                    onChange={e => setActivateForm({ ...activateForm, adminName: e.target.value })}
                  />
                </div>
                <div style={styles.formCol}>
                  <label style={styles.formLabel}>ADMIN EMAIL</label>
                  <input
                    type="email"
                    required
                    style={styles.formInput}
                    placeholder="e.g. admin@hospital.com"
                    value={activateForm.adminEmail}
                    onChange={e => setActivateForm({ ...activateForm, adminEmail: e.target.value })}
                  />
                </div>
              </div>

              <div style={styles.formRow}>
                <div style={styles.formCol}>
                  <label style={styles.formLabel}>ADMIN PHONE (MOBILE)</label>
                  <input
                    type="text"
                    required
                    style={styles.formInput}
                    placeholder="e.g. +91 9876543210"
                    value={activateForm.adminPhone}
                    onChange={e => setActivateForm({ ...activateForm, adminPhone: e.target.value })}
                  />
                </div>
                <div style={styles.formCol}>
                  <label style={styles.formLabel}>ADMIN PASSWORD</label>
                  <div style={{ position: 'relative', display: 'flex', alignItems: 'center', width: '100%' }}>
                    <input
                      type={showPasswords['activateModal'] ? 'text' : 'password'}
                      required
                      style={{ ...styles.formInput, paddingRight: '40px', width: '100%' }}
                      placeholder="Enter admin password"
                      value={activateForm.adminPassword}
                      onChange={e => setActivateForm({ ...activateForm, adminPassword: e.target.value })}
                    />
                    <button
                      type="button"
                      onClick={() => togglePasswordVisibility('activateModal')}
                      style={{
                        position: 'absolute',
                        right: '10px',
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        padding: '4px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: '#64748B'
                      }}
                    >
                      <LucideIcon name={showPasswords['activateModal'] ? 'eye-off' : 'eye'} style={{ width: '15px', height: '15px' }} />
                    </button>
                  </div>
                </div>
              </div>

              <div style={styles.formRow}>
                <div style={styles.formCol}>
                  <label style={styles.formLabel}>GSTIN REGISTRATION</label>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <input
                      type="text"
                      required
                      style={{ ...styles.formInput, flex: 1 }}
                      placeholder="e.g. 27AAAAA1111A1Z1"
                      value={activateForm.gst}
                      onChange={e => {
                        setActivateForm({ 
                          ...activateForm, 
                          gst: e.target.value, 
                          isGstVerified: false, 
                          gstVerificationDetails: null 
                        });
                        setGstinVerificationError('');
                      }}
                    />
                    <button
                      type="button"
                      disabled={isVerifyingGstin}
                      onClick={handleVerifyGstinInActivationModal}
                      style={{
                        ...styles.btnSecondary,
                        height: '36px',
                        borderColor: activateForm.isGstVerified ? '#10B981' : '#E2E8F0',
                        color: activateForm.isGstVerified ? '#10B981' : '#475569',
                        background: activateForm.isGstVerified ? '#EFF6FF' : '#FFFFFF',
                        minWidth: '85px'
                      }}
                    >
                      {isVerifyingGstin ? 'Verifying...' : activateForm.isGstVerified ? '✓ Verified' : 'Verify'}
                    </button>
                  </div>
                  {gstinVerificationError && (
                    <span style={{ fontSize: '10px', color: '#EF4444', marginTop: '2px', fontWeight: 600 }}>{gstinVerificationError}</span>
                  )}
                  {activateForm.isGstVerified && activateForm.gstVerificationDetails && (
                    <div style={{
                      marginTop: '6px',
                      padding: '8px 10px',
                      background: '#F0FDF4',
                      border: '1px solid #BBF7D0',
                      borderRadius: '6px',
                      fontSize: '11px',
                      color: '#166534',
                      lineHeight: '1.4'
                    }}>
                      <div style={{ fontWeight: 800 }}>GSTIN Verified</div>
                      <div>Legal Name: {activateForm.gstVerificationDetails.legalName}</div>
                      <div>State: {activateForm.gstVerificationDetails.state}</div>
                      <div>PAN: {activateForm.gstVerificationDetails.pan}</div>
                    </div>
                  )}
                </div>
                <div style={styles.formCol}>
                  <label style={styles.formLabel}>DRUG LICENSE NO.</label>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <input
                      type="text"
                      required
                      style={{ ...styles.formInput, flex: 1 }}
                      placeholder="e.g. DL-293849/2026"
                      value={activateForm.license}
                      onChange={e => {
                        setActivateForm({ 
                          ...activateForm, 
                          license: e.target.value, 
                          isLicenseVerified: false, 
                          licenseVerificationDetails: null 
                        });
                        setVerificationError('');
                      }}
                    />
                    <button
                      type="button"
                      disabled={isVerifyingLicense}
                      onClick={handleVerifyLicenseInActivationModal}
                      style={{
                        ...styles.btnSecondary,
                        height: '36px',
                        borderColor: activateForm.isLicenseVerified ? '#10B981' : '#E2E8F0',
                        color: activateForm.isLicenseVerified ? '#10B981' : '#475569',
                        background: activateForm.isLicenseVerified ? '#EFF6FF' : '#FFFFFF',
                        minWidth: '85px'
                      }}
                    >
                      {isVerifyingLicense ? 'Verifying...' : activateForm.isLicenseVerified ? '✓ Verified' : 'Verify'}
                    </button>
                  </div>
                  {verificationError && (
                    <span style={{ fontSize: '10px', color: '#EF4444', marginTop: '2px', fontWeight: 600 }}>{verificationError}</span>
                  )}
                  {activateForm.isLicenseVerified && activateForm.licenseVerificationDetails && (
                    <div style={{
                      marginTop: '6px',
                      padding: '8px 10px',
                      background: '#F0FDF4',
                      border: '1px solid #BBF7D0',
                      borderRadius: '6px',
                      fontSize: '11px',
                      color: '#166534',
                      lineHeight: '1.4'
                    }}>
                      <div style={{ fontWeight: 800 }}>CDSCO Drug License Verified</div>
                      <div>Issuer: {activateForm.licenseVerificationDetails.issuer}</div>
                      <div>Categories: {activateForm.licenseVerificationDetails.categories?.join(', ')}</div>
                      <div>Validity: {activateForm.licenseVerificationDetails.validUntil}</div>
                    </div>
                  )}
                </div>
              </div>

              <div style={styles.formCol}>
                <label style={styles.formLabel}>BILLING ADDRESS</label>
                <input
                  type="text"
                  required
                  style={styles.formInput}
                  placeholder="e.g. 42 Main St, Miami, FL 33101"
                  value={activateForm.address}
                  onChange={e => setActivateForm({ ...activateForm, address: e.target.value })}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
                <button type="button" style={styles.btnSecondary} onClick={() => setIsActivateModalOpen(false)}>Cancel</button>
                <button type="submit" style={{ ...styles.btnPrimary, background: '#10B981' }}>Activate Plan & Provision Account</button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* HOSPITAL CREATED PORTAL SUCCESS MODAL */}
      {portalSuccessModal && (
        <div style={styles.modalOverlay} onClick={() => setPortalSuccessModal(null)}>
          <div style={{ ...styles.searchModalContainer, width: '520px', padding: '0', overflow: 'hidden', borderRadius: '16px' }} onClick={e => e.stopPropagation()}>
            <div style={{ background: 'linear-gradient(135deg, #1E40AF 0%, #2563EB 100%)', padding: '24px', color: '#FFFFFF', position: 'relative' }}>
              <button 
                style={{ position: 'absolute', top: '16px', right: '16px', background: 'rgba(255,255,255,0.2)', border: 'none', borderRadius: '50%', width: '28px', height: '28px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#FFFFFF', cursor: 'pointer' }}
                onClick={() => setPortalSuccessModal(null)}
              >
                <LucideIcon name="x" style={{ width: '16px', height: '16px' }} />
              </button>
              <div style={{ display: 'inline-flex', padding: '8px', background: 'rgba(255,255,255,0.15)', borderRadius: '12px', marginBottom: '12px' }}>
                <LucideIcon name="check-circle" style={{ width: '28px', height: '28px', color: '#6EE7B7' }} />
              </div>
              <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 800 }}>Hospital Created Successfully!</h3>
              <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#DBEAFE' }}>
                {portalSuccessModal.name} has been activated and is ready for live access.
              </p>
            </div>

            <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px', background: '#FFFFFF' }}>
              <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '12px', padding: '16px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '12px', fontWeight: 600, color: '#64748B' }}>Public Hospital ID</span>
                  <span style={{ fontFamily: 'monospace', fontWeight: 800, fontSize: '14px', background: '#EFF6FF', color: '#1E40AF', padding: '4px 10px', borderRadius: '6px', border: '1px solid #BFDBFE', letterSpacing: '0.5px' }}>
                    {portalSuccessModal.hospitalId || 'Unavailable'}
                  </span>
                </div>

                <div>
                  <label style={{ fontSize: '11px', fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginBottom: '6px' }}>
                    Hospital Portal URL
                  </label>
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    background: '#FFFFFF',
                    border: '1px solid #CBD5E1',
                    borderRadius: '8px',
                    padding: '8px 12px',
                    fontSize: '12.5px',
                    fontFamily: 'monospace',
                    color: '#0F172A',
                    wordBreak: 'break-all'
                  }}>
                    {portalSuccessModal.hospitalId ? `${window.location.origin}/portal/${portalSuccessModal.hospitalId}` : 'Unavailable'}
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '12px' }}>
                <button
                  type="button"
                  disabled={!portalSuccessModal.hospitalId}
                  onClick={() => {
                    if (!portalSuccessModal.hospitalId) return;
                    const url = `${window.location.origin}/portal/${portalSuccessModal.hospitalId}`;
                    navigator.clipboard.writeText(url).then(() => {
                      showToast(`Copied portal URL: ${url}`, 'success');
                    }).catch(() => {
                      showToast('Failed to copy portal URL', 'error');
                    });
                  }}
                  style={{
                    flex: 1,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                    padding: '10px 16px',
                    borderRadius: '8px',
                    border: '1px solid #CBD5E1',
                    background: '#FFFFFF',
                    color: '#1E293B',
                    fontWeight: 700,
                    fontSize: '13px',
                    cursor: portalSuccessModal.hospitalId ? 'pointer' : 'not-allowed',
                    boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
                  }}
                >
                  <LucideIcon name="copy" style={{ width: '15px', height: '15px' }} />
                  <span>Copy Link</span>
                </button>

                <a
                  href={portalSuccessModal.hospitalId ? `${window.location.origin}/portal/${portalSuccessModal.hospitalId}` : '#'}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => {
                    if (!portalSuccessModal.hospitalId) e.preventDefault();
                  }}
                  style={{
                    flex: 1,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                    padding: '10px 16px',
                    borderRadius: '8px',
                    border: 'none',
                    background: portalSuccessModal.hospitalId ? 'linear-gradient(135deg, #2563EB 0%, #1D4ED8 100%)' : '#94A3B8',
                    color: '#FFFFFF',
                    fontWeight: 700,
                    fontSize: '13px',
                    textDecoration: 'none',
                    cursor: portalSuccessModal.hospitalId ? 'pointer' : 'not-allowed',
                    boxShadow: portalSuccessModal.hospitalId ? '0 4px 12px rgba(37, 99, 235, 0.25)' : 'none'
                  }}
                >
                  <LucideIcon name="external-link" style={{ width: '15px', height: '15px' }} />
                  <span>Open Portal</span>
                </a>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', borderTop: '1px solid #F1F5F9', paddingTop: '16px' }}>
                <button
                  type="button"
                  onClick={() => setPortalSuccessModal(null)}
                  style={{
                    padding: '8px 18px',
                    borderRadius: '8px',
                    border: '1px solid #E2E8F0',
                    background: '#F8FAFC',
                    color: '#475569',
                    fontSize: '12.5px',
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                >
                  Go to Hospitals
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {toast && (
        <div style={{
          position: 'fixed',
          bottom: '24px',
          right: '24px',
          background: toast.type === 'error' ? '#FEF2F2' : '#EFF6FF',
          border: toast.type === 'error' ? '1px solid #FCA5A5' : '1px solid #BFDBFE',
          borderRadius: '8px',
          padding: '12px 18px',
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
          zIndex: 9999,
          animation: 'toastSlideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1)'
        }}>
          <div style={{
            width: '8px',
            height: '8px',
            borderRadius: '50%',
            background: toast.type === 'error' ? '#EF4444' : '#2563EB'
          }}></div>
          <span style={{
            fontSize: '12.5px',
            fontWeight: 700,
            color: toast.type === 'error' ? '#991B1B' : '#1E40AF'
          }}>
            {toast.message}
          </span>
        </div>
      )}

      {previewDoc && (
        <div style={styles.modalOverlay} onClick={() => setPreviewDoc(null)}>
          <div style={{ ...styles.searchModalContainer, width: '600px', borderRadius: '12px' }} onClick={e => e.stopPropagation()}>
            <div style={{ ...styles.drawerHeader, background: '#1E293B', color: '#FFF' }}>
              <h3 style={{ ...styles.drawerTitle, color: '#FFF', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <LucideIcon name="file-text" style={{ width: '18px', height: '18px', color: '#38BDF8' }} />
                Document Preview: {previewDoc.title}
              </h3>
              <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94A3B8' }} onClick={() => setPreviewDoc(null)}>
                <LucideIcon name="x" style={{ width: '18px', height: '18px' }} />
              </button>
            </div>
            
            <div style={{ padding: '24px', background: '#F8FAFC', display: 'flex', justifyContent: 'center' }}>
              <div style={{
                width: '100%',
                background: '#FFFFFF',
                border: '1px solid #E2E8F0',
                borderRadius: '8px',
                boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)',
                padding: '32px',
                fontFamily: 'Outfit, sans-serif',
                position: 'relative'
              }}>
                {previewDoc.type === 'pan' && (
                  <div>
                    <div style={{ textAlign: 'center', borderBottom: '2px solid #059669', paddingBottom: '12px', marginBottom: '20px' }}>
                      <h4 style={{ margin: 0, color: '#059669', fontSize: '16px', fontWeight: 800 }}>INCOME TAX DEPARTMENT</h4>
                      <span style={{ fontSize: '11px', color: '#64748B', fontWeight: 700 }}>GOVERNMENT OF INDIA</span>
                    </div>
                    <div style={{ display: 'flex', gap: '20px' }}>
                      <div style={{ width: '100px', height: '120px', background: '#F1F5F9', border: '1px solid #CBD5E1', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <LucideIcon name="building" style={{ width: '40px', height: '40px', color: '#94A3B8' }} />
                      </div>
                      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        <div>
                          <span style={{ fontSize: '10px', color: '#94A3B8', fontWeight: 700 }}>CARDHOLDER NAME</span>
                          <div style={{ fontSize: '14px', fontWeight: 750, color: '#1E293B' }}>{previewDoc.hospitalName}</div>
                        </div>
                        <div>
                          <span style={{ fontSize: '10px', color: '#94A3B8', fontWeight: 700 }}>PERMANENT ACCOUNT NUMBER</span>
                          <div style={{ fontSize: '15px', fontWeight: 800, color: '#059669', letterSpacing: '1px' }}>{previewDoc.panNumber}</div>
                        </div>
                        <div>
                          <span style={{ fontSize: '10px', color: '#94A3B8', fontWeight: 700 }}>DATE OF INCORPORATION</span>
                          <div style={{ fontSize: '13px', fontWeight: 700, color: '#1E293B' }}>08/07/2026</div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
                
                {previewDoc.type === 'gst' && (
                  <div>
                    <div style={{ textAlign: 'center', borderBottom: '2px solid #2563EB', paddingBottom: '12px', marginBottom: '20px' }}>
                      <h4 style={{ margin: 0, color: '#2563EB', fontSize: '16px', fontWeight: 800 }}>GOODS AND SERVICES TAX REGISTRATION</h4>
                      <span style={{ fontSize: '11px', color: '#64748B', fontWeight: 700 }}>GOVERNMENT OF INDIA</span>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                        <div>
                          <span style={{ fontSize: '10px', color: '#94A3B8', fontWeight: 700 }}>REGISTRATION NUMBER (GSTIN)</span>
                          <div style={{ fontSize: '13.5px', fontWeight: 800, color: '#2563EB' }}>{previewDoc.gstin}</div>
                        </div>
                        <div>
                          <span style={{ fontSize: '10px', color: '#94A3B8', fontWeight: 700 }}>LEGAL NAME</span>
                          <div style={{ fontSize: '13px', fontWeight: 750, color: '#1E293B' }}>{previewDoc.hospitalName}</div>
                        </div>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                        <div>
                          <span style={{ fontSize: '10px', color: '#94A3B8', fontWeight: 700 }}>CONSTITUTION OF BUSINESS</span>
                          <div style={{ fontSize: '13px', fontWeight: 700, color: '#1E293B' }}>Private Limited Company</div>
                        </div>
                        <div>
                          <span style={{ fontSize: '10px', color: '#94A3B8', fontWeight: 700 }}>DATE OF LIABILITY</span>
                          <div style={{ fontSize: '13px', fontWeight: 700, color: '#1E293B' }}>08/07/2026</div>
                        </div>
                      </div>
                      <div style={{ borderTop: '1px dashed #E2E8F0', paddingTop: '10px', marginTop: '10px', fontSize: '11px', color: '#64748B', fontStyle: 'italic', textAlign: 'center' }}>
                        This is a system-generated document verified via the Curoxa Tax Registry API connector.
                      </div>
                    </div>
                  </div>
                )}
                
                {previewDoc.type === 'corp' && (
                  <div>
                    <div style={{ textAlign: 'center', borderBottom: '2px solid #7C3AED', paddingBottom: '12px', marginBottom: '20px' }}>
                      <h4 style={{ margin: 0, color: '#7C3AED', fontSize: '16px', fontWeight: 800 }}>MINISTRY OF CORPORATE AFFAIRS</h4>
                      <span style={{ fontSize: '11px', color: '#64748B', fontWeight: 700 }}>GOVERNMENT OF INDIA</span>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                      <div style={{ textAlign: 'center', margin: '10px 0' }}>
                        <span style={{ fontSize: '12px', fontWeight: 800, color: '#1E293B' }}>CERTIFICATE OF INCORPORATION</span>
                        <p style={{ fontSize: '11.5px', color: '#475569', lineHeight: '1.6', margin: '8px 0' }}>
                          I hereby certify that <strong>{previewDoc.hospitalName}</strong> is this day incorporated under the Companies Act, 2013 and that the company is limited by shares.
                        </p>
                      </div>
                      <div style={{ background: '#F8FAFC', padding: '12px', borderRadius: '6px', border: '1px solid #E2E8F0', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                        <div>
                          <span style={{ fontSize: '9px', color: '#94A3B8', fontWeight: 700 }}>CORPORATE IDENTIFICATION NUMBER</span>
                          <div style={{ fontSize: '12px', fontWeight: 750, color: '#7C3AED' }}>{previewDoc.corpId}</div>
                        </div>
                        <div>
                          <span style={{ fontSize: '9px', color: '#94A3B8', fontWeight: 700 }}>AUTHORIZED SIGNATORY</span>
                          <div style={{ fontSize: '12px', fontWeight: 750, color: '#1E293B' }}>{previewDoc.signatoryName}</div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
            
            <div style={{ padding: '14px 20px', borderTop: '1px solid #E2E8F0', display: 'flex', justifyContent: 'flex-end', background: '#F1F5F9' }}>
              <button style={styles.btnSecondary} onClick={() => setPreviewDoc(null)}>Close Preview</button>
            </div>
          </div>
        </div>
      )}
      {/* Custom Confirmation Modal Overlay (Replaces native browser window.confirm) */}
      {confirmModalConfig && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(15, 23, 42, 0.65)',
          backdropFilter: 'blur(6px)',
          zIndex: 99999,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '20px',
          animation: 'fadeIn 0.2s ease-out'
        }} onClick={() => !confirmModalConfig.isLoading && setConfirmModalConfig(null)}>
          <div style={{
            background: '#FFFFFF',
            borderRadius: '18px',
            maxWidth: '460px',
            width: '100%',
            padding: '28px',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
            border: '1px solid #E2E8F0',
            animation: 'slideUp 0.25s cubic-bezier(0.16, 1, 0.3, 1)'
          }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '16px', marginBottom: '20px' }}>
              <div style={{
                width: '48px',
                height: '48px',
                borderRadius: '12px',
                background: confirmModalConfig.danger ? '#FEF2F2' : '#EFF6FF',
                color: confirmModalConfig.danger ? '#EF4444' : '#2563EB',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0
              }}>
                {confirmModalConfig.danger ? (
                  <LucideIcon name="trash-2" style={{ width: '24px', height: '24px', color: '#EF4444' }} />
                ) : (
                  <LucideIcon name="alert-circle" style={{ width: '24px', height: '24px', color: '#2563EB' }} />
                )}
              </div>

              <div>
                <h3 style={{ fontSize: '18px', fontWeight: 800, color: '#0F172A', margin: '0 0 6px 0', fontFamily: "'Outfit', sans-serif" }}>
                  {confirmModalConfig.title || 'Confirm Action'}
                </h3>
                <p style={{ fontSize: '13.5px', color: '#475569', margin: 0, lineHeight: 1.5, fontWeight: 500 }}>
                  {confirmModalConfig.message}
                </p>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '24px', paddingTop: '16px', borderTop: '1px solid #F1F5F9' }}>
              <button
                type="button"
                disabled={confirmModalConfig.isLoading}
                onClick={() => setConfirmModalConfig(null)}
                style={{
                  padding: '10px 18px',
                  borderRadius: '10px',
                  border: '1px solid #E2E8F0',
                  background: '#F8FAFC',
                  color: '#475569',
                  fontWeight: 700,
                  fontSize: '13px',
                  cursor: confirmModalConfig.isLoading ? 'not-allowed' : 'pointer',
                  opacity: confirmModalConfig.isLoading ? 0.5 : 1
                }}
              >
                {confirmModalConfig.cancelText || 'Cancel'}
              </button>

              <button
                type="button"
                disabled={confirmModalConfig.isLoading}
                onClick={() => confirmModalConfig.onConfirm && confirmModalConfig.onConfirm()}
                style={{
                  padding: '10px 20px',
                  borderRadius: '10px',
                  border: 'none',
                  background: confirmModalConfig.danger ? 'linear-gradient(135deg, #EF4444 0%, #DC2626 100%)' : 'linear-gradient(135deg, #2563EB 0%, #1D4ED8 100%)',
                  color: 'white',
                  fontWeight: 800,
                  fontSize: '13px',
                  cursor: confirmModalConfig.isLoading ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  boxShadow: confirmModalConfig.danger ? '0 4px 12px rgba(239, 68, 68, 0.25)' : '0 4px 12px rgba(37, 99, 235, 0.25)'
                }}
              >
                {confirmModalConfig.isLoading && (
                  <span style={{
                    width: '14px',
                    height: '14px',
                    border: '2px solid rgba(255,255,255,0.4)',
                    borderTopColor: 'white',
                    borderRadius: '50%',
                    display: 'inline-block',
                    animation: 'spin 0.8s linear infinite'
                  }} />
                )}
                <span>{confirmModalConfig.confirmText || 'Confirm'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* SUPERADMIN PROFILE & PASSWORD SETTINGS MODAL */}
      {isProfileModalOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.4)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 99999 }}>
          <div style={{ width: '460px', background: '#FFFFFF', borderRadius: '16px', padding: '28px', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)', border: '1px solid #E2E8F0' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: '#EFF6FF', color: '#2563EB', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <LucideIcon name="user-cog" style={{ width: '20px', height: '20px' }} />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 800, color: '#0F172A' }}>SuperAdmin Profile & Password</h3>
                  <span style={{ fontSize: '11px', color: '#64748B' }}>Update platform admin details and credentials</span>
                </div>
              </div>
              <button 
                onClick={() => setIsProfileModalOpen(false)}
                style={{ background: 'none', border: 'none', color: '#94A3B8', cursor: 'pointer', padding: '4px' }}
              >
                <LucideIcon name="x" style={{ width: '18px', height: '18px' }} />
              </button>
            </div>

            {profileError && (
              <div style={{ padding: '10px 14px', borderRadius: '8px', background: '#FEE2E2', border: '1px solid #FCA5A5', color: '#991B1B', fontSize: '12px', fontWeight: 600, marginBottom: '16px' }}>
                {profileError}
              </div>
            )}

            <form onSubmit={async (e) => {
              e.preventDefault();
              setProfileError('');
              if (profileForm.newPassword && profileForm.newPassword !== profileForm.confirmPassword) {
                setProfileError('New passwords do not match.');
                return;
              }
              if (!profileForm.newPassword || profileForm.newPassword.length < 6) {
                setProfileError('Please enter a new password (min 6 characters).');
                return;
              }

              setIsUpdatingProfile(true);
              try {
                const token = localStorage.getItem('token');
                const res = await fetch('/api/superadmin/change-password', {
                  method: 'PUT',
                  headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                  body: JSON.stringify({
                    name: profileForm.name,
                    email: profileForm.email,
                    currentPassword: profileForm.currentPassword,
                    newPassword: profileForm.newPassword
                  })
                });
                const data = await res.json();
                if (res.ok) {
                  showToast('SuperAdmin profile & password updated successfully!', 'success');
                  if (data.token) {
                    localStorage.setItem('token', data.token);
                  }
                  if (data.user) {
                    const updatedUser = { ...currentUser, ...data.user };
                    setCurrentUser(updatedUser);
                    localStorage.setItem('user', JSON.stringify(updatedUser));
                  }
                  setIsProfileModalOpen(false);
                } else {
                  setProfileError(data.error || 'Failed to update profile.');
                }
              } catch (err) {
                console.error(err);
                setProfileError('Network error while updating password.');
              } finally {
                setIsUpdatingProfile(false);
              }
            }} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div style={styles.formCol}>
                <label style={styles.formLabel}>ADMIN FULL NAME</label>
                <input 
                  type="text" 
                  value={profileForm.name} 
                  onChange={e => setProfileForm({ ...profileForm, name: e.target.value })} 
                  style={styles.formInput} 
                  required 
                />
              </div>

              <div style={styles.formCol}>
                <label style={styles.formLabel}>WORK EMAIL ADDRESS</label>
                <input 
                  type="email" 
                  value={profileForm.email} 
                  onChange={e => setProfileForm({ ...profileForm, email: e.target.value })} 
                  style={styles.formInput} 
                  required 
                />
              </div>

              <div style={{ borderTop: '1px dashed #E2E8F0', margin: '4px 0' }} />

              <div style={styles.formCol}>
                <label style={styles.formLabel}>CURRENT PASSWORD (OPTIONAL VERIFICATION)</label>
                <div style={{ position: 'relative', display: 'flex', alignItems: 'center', width: '100%' }}>
                  <input 
                    type={showProfilePasswords.current ? 'text' : 'password'} 
                    value={profileForm.currentPassword} 
                    onChange={e => setProfileForm({ ...profileForm, currentPassword: e.target.value })} 
                    placeholder="Enter current password if set" 
                    style={{ ...styles.formInput, paddingRight: '40px', width: '100%' }} 
                  />
                  <button
                    type="button"
                    onClick={() => setShowProfilePasswords(prev => ({ ...prev, current: !prev.current }))}
                    style={{
                      position: 'absolute', right: '10px', background: 'none', border: 'none',
                      cursor: 'pointer', padding: '4px', display: 'flex', alignItems: 'center',
                      justifyContent: 'center', color: '#64748B'
                    }}
                  >
                    <LucideIcon name={showProfilePasswords.current ? 'eye-off' : 'eye'} style={{ width: '16px', height: '16px' }} />
                  </button>
                </div>
              </div>

              <div style={styles.formCol}>
                <label style={styles.formLabel}>NEW PASSWORD</label>
                <div style={{ position: 'relative', display: 'flex', alignItems: 'center', width: '100%' }}>
                  <input 
                    type={showProfilePasswords.new ? 'text' : 'password'} 
                    value={profileForm.newPassword} 
                    onChange={e => setProfileForm({ ...profileForm, newPassword: e.target.value })} 
                    placeholder="Enter new password (min 6 characters)" 
                    style={{ ...styles.formInput, paddingRight: '40px', width: '100%' }} 
                    required 
                  />
                  <button
                    type="button"
                    onClick={() => setShowProfilePasswords(prev => ({ ...prev, new: !prev.new }))}
                    style={{
                      position: 'absolute', right: '10px', background: 'none', border: 'none',
                      cursor: 'pointer', padding: '4px', display: 'flex', alignItems: 'center',
                      justifyContent: 'center', color: '#64748B'
                    }}
                  >
                    <LucideIcon name={showProfilePasswords.new ? 'eye-off' : 'eye'} style={{ width: '16px', height: '16px' }} />
                  </button>
                </div>
              </div>

              <div style={styles.formCol}>
                <label style={styles.formLabel}>CONFIRM NEW PASSWORD</label>
                <div style={{ position: 'relative', display: 'flex', alignItems: 'center', width: '100%' }}>
                  <input 
                    type={showProfilePasswords.confirm ? 'text' : 'password'} 
                    value={profileForm.confirmPassword} 
                    onChange={e => setProfileForm({ ...profileForm, confirmPassword: e.target.value })} 
                    placeholder="Re-enter new password" 
                    style={{ ...styles.formInput, paddingRight: '40px', width: '100%' }} 
                    required 
                  />
                  <button
                    type="button"
                    onClick={() => setShowProfilePasswords(prev => ({ ...prev, confirm: !prev.confirm }))}
                    style={{
                      position: 'absolute', right: '10px', background: 'none', border: 'none',
                      cursor: 'pointer', padding: '4px', display: 'flex', alignItems: 'center',
                      justifyContent: 'center', color: '#64748B'
                    }}
                  >
                    <LucideIcon name={showProfilePasswords.confirm ? 'eye-off' : 'eye'} style={{ width: '16px', height: '16px' }} />
                  </button>
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
                <button 
                  type="button" 
                  onClick={() => setIsProfileModalOpen(false)} 
                  style={{ ...styles.btnSecondary, padding: '10px 18px', fontSize: '13px' }}
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  disabled={isUpdatingProfile} 
                  style={{ ...styles.btnPrimary, padding: '10px 20px', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '8px' }}
                >
                  {isUpdatingProfile ? 'Updating Password...' : 'Save & Update Password'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

// LEFT MENU CONFIGURATION
const menuGroups = [
  {
    group: 'Dashboard',
    items: [
      { id: 'dashboard', label: 'Platform Overview', icon: 'layout-dashboard' }
    ]
  },
  {
    group: 'Business',
    items: [
      { id: 'hospital-onboarding', label: 'Hospital Onboarding', icon: 'user-plus' },
      { id: 'hospitals', label: 'Hospitals', icon: 'building-2' },
      { id: 'subscription-mgmt', label: 'Subscription Management', icon: 'credit-card' }
    ]
  },
  {
    group: 'Operations',
    items: [
      { id: 'customer-support', label: 'Customer Support', icon: 'headset' },
      { id: 'broadcast-center', label: 'Broadcast Center', icon: 'megaphone' },
      { id: 'finance', label: 'Finance', icon: 'wallet' }
    ]
  },
  {
    group: 'Company',
    items: [
      { id: 'employees', label: 'Employees', icon: 'user-cog' }
    ]
  },
  {
    group: 'Analytics',
    items: [
      { id: 'reports', label: 'Platform Reports', icon: 'bar-chart-3' }
    ]
  },
  {
    group: 'System',
    items: [
      { id: 'settings', label: 'Platform Control', icon: 'settings' }
    ]
  }
];

// INTERFACE STYLING
const styles = {
  container: { display: 'flex', flexDirection: 'row', height: '100vh', width: '100vw', minWidth: 0, maxWidth: '100vw', overflow: 'hidden', background: '#F8FAFC' },
  topNav: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: '60px', width: '100%', minWidth: 0, boxSizing: 'border-box', background: '#FFFFFF', borderBottom: '1px solid #E2E8F0', padding: '0 24px', flexShrink: 0, zIndex: 80 },
  topNavLeft: { display: 'flex', alignItems: 'center', gap: '16px' },
  logoContainer: { display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' },
  logoIcon: { width: '30px', height: '30px', borderRadius: '8px', background: '#2563EB', color: '#FFFFFF', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800 },
  logoTextGroup: { display: 'flex', flexDirection: 'column' },
  logoTitle: { fontSize: '14px', fontWeight: 800, color: '#0F172A', letterSpacing: '-0.3px', lineHeight: '1.2' },
  logoSubtitle: { fontSize: '10px', fontWeight: 600, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.5px' },
  collapseBtn: { background: 'none', border: 'none', cursor: 'pointer', padding: '6px', borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'background 0.2s' },
  searchBarWrapper: { display: 'flex', alignItems: 'center', width: '420px', height: '36px', background: '#F1F5F9', border: '1px solid #E2E8F0', borderRadius: '8px', padding: '0 12px', cursor: 'pointer' },
  searchBarIcon: { width: '16px', height: '16px', color: '#64748B', marginRight: '8px' },
  searchPlaceholder: { fontSize: '11px', color: '#64748B', fontWeight: 500, flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  searchHotkey: { fontSize: '10.5px', fontWeight: 700, background: '#FFFFFF', border: '1px solid #CBD5E1', borderRadius: '4px', color: '#64748B', padding: '1px 5px', marginLeft: '8px' },
  topNavRight: { display: 'flex', alignItems: 'center', gap: '12px' },
  approvalBadgeBtn: { display: 'flex', alignItems: 'center', gap: '8px', height: '36px', padding: '0 12px', background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: '8px', color: '#2563EB', fontWeight: 700, fontSize: '12px', cursor: 'pointer' },
  approvalBadgePulse: { width: '8px', height: '8px', borderRadius: '50%', background: '#2563EB', animation: 'pulse 1.5s infinite' },
  approvalBadgeLabel: { fontWeight: 750 },
  iconButtonBadge: { position: 'relative', background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '8px', width: '36px', height: '36px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' },
  navBadge: { position: 'absolute', top: '-4px', right: '-4px', background: '#EF4444', color: '#FFFFFF', fontSize: '9px', fontWeight: 850, borderRadius: '10px', padding: '1px 5px', lineHeight: '1' },
  profileTrigger: { display: 'flex', alignItems: 'center', gap: '10px', background: 'none', border: 'none', cursor: 'pointer', padding: '2px' },
  profileAvatar: { width: '32px', height: '32px', borderRadius: '50%', background: '#2563EB', color: '#FFFFFF', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: 800 },
  profileMeta: { display: 'flex', flexDirection: 'column', alignItems: 'flex-start' },
  profileName: { fontSize: '12px', fontWeight: 700, color: '#0F172A', lineHeight: '1.2' },
  profileRole: { fontSize: '9.5px', color: '#64748B', fontWeight: 500 },
  workspace: { display: 'flex', flex: 1, width: '100%', minWidth: 0, height: '100vh', overflow: 'hidden' },
  sidebar: { width: '260px', minWidth: '260px', maxWidth: '260px', height: '100vh', background: '#FFFFFF', borderRight: '1px solid #E2E8F0', display: 'flex', flexDirection: 'column', flexShrink: 0, zIndex: 90 },
  sidebarScrollArea: { flex: 1, overflowY: 'auto', padding: '16px 12px', display: 'flex', flexDirection: 'column', gap: '16px' },
  menuGroupContainer: { display: 'flex', flexDirection: 'column', gap: '4px' },
  menuGroupTitle: { fontSize: '10px', fontWeight: 800, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.7px', paddingLeft: '16px', marginBottom: '4px' },
  menuItemBtn: { display: 'flex', alignItems: 'center', height: '38px', border: 'none', borderRadius: '6px', cursor: 'pointer', transition: 'all 0.15s' },
  menuItemLabel: { fontSize: '12.5px', fontWeight: 700 },
  menuDivider: { height: '1px', background: '#F1F5F9', margin: '8px 0' },
  mainCanvas: { flex: 1, width: '100%', minWidth: 0, height: '100%', overflow: 'hidden', display: 'flex', flexDirection: 'column', padding: '24px', boxSizing: 'border-box' },
  pageBodyScroll: { flex: 1, width: '100%', minWidth: 0, overflowY: 'auto', paddingRight: '4px', display: 'flex', flexDirection: 'column', gap: '24px', boxSizing: 'border-box' },
  subNavbar: { display: 'flex', gap: '8px', borderBottom: '1px solid #E2E8F0', paddingBottom: '8px', marginBottom: '14px', flexShrink: 0 },
  subNavbarBtn: { border: 'none', background: 'none', fontSize: '12.5px', fontWeight: 650, color: '#64748B', padding: '6px 12px', borderRadius: '6px', cursor: 'pointer' },
  subNavbarBtnActive: { border: 'none', background: '#EFF6FF', fontSize: '12.5px', fontWeight: 800, color: '#2563EB', padding: '6px 12px', borderRadius: '6px', cursor: 'default' },
  kpiGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '14px' },
  kpiCard: { background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '12px', padding: '16px', boxShadow: '0 2px 4px 0 rgba(15, 23, 42, 0.01)' },
  kpiLabel: { fontSize: '9.5px', fontWeight: 800, color: '#64748B', letterSpacing: '0.3px' },
  kpiVal: { fontSize: '20px', fontWeight: 850, letterSpacing: '-0.5px' },
  kpiSubText: { fontSize: '10.5px', color: '#64748B', fontWeight: 600 },
  twoColumnGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '20px' },
  glassCard: { background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '12px', padding: '20px', boxShadow: '0 2px 6px 0 rgba(15, 23, 42, 0.015)' },
  cardHeaderTitle: { fontSize: '14px', fontWeight: 800, color: '#0F172A', margin: '0 0 2px 0' },
  cardHeaderSub: { fontSize: '11.5px', color: '#64748B', fontWeight: 500, margin: 0 },
  sourceLegend: { display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', fontWeight: 650, color: '#334155' },
  legendDot: { width: '8px', height: '8px', borderRadius: '50%', flexShrink: 0 },
  crmFollowupRow: { display: 'flex', alignItems: 'center', justifyWindow: 'space-between', justifyContent: 'space-between', padding: '10px', background: '#F8FAFC', borderRadius: '8px', border: '1px solid #F1F5F9' },
  dataTable: { width: '100%', borderCollapse: 'collapse', textAlign: 'left' },
  tableTh: { fontSize: '10.5px', fontWeight: 850, color: '#64748B', padding: '10px 14px', background: '#F8FAFC', borderBottom: '1px solid #E2E8F0', textTransform: 'uppercase' },
  tableRow: { borderBottom: '1px solid #F1F5F9', transition: 'background 0.15s' },
  tableTd: { fontSize: '12px', padding: '12px 14px', color: '#334155' },
  btnActionSmall: { padding: '5px 10px', fontSize: '10.5px', fontWeight: 750, color: '#2563EB', background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: '4px', cursor: 'pointer' },
  btnPrimary: {
    background: '#2563EB',
    color: '#FFFFFF',
    border: 'none',
    borderRadius: '8px',
    padding: '8px 16px',
    fontWeight: 700,
    fontSize: '12.5px',
    cursor: 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '6px',
    transition: 'all 0.15s'
  },
  btnSecondary: {
    background: '#FFFFFF',
    color: '#475569',
    border: '1px solid #E2E8F0',
    borderRadius: '8px',
    padding: '8px 16px',
    fontWeight: 700,
    fontSize: '12.5px',
    cursor: 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '6px',
    transition: 'all 0.15s'
  },
  formRow: { display: 'flex', gap: '14px' },
  formCol: { flex: 1, display: 'flex', flexDirection: 'column', gap: '4px' },
  formLabel: { fontSize: '9.5px', fontWeight: 850, color: '#64748B' },
  formInput: { height: '36px', padding: '0 10px', border: '1px solid #CBD5E1', borderRadius: '6px', fontSize: '12px', outline: 'none' },
  rightSidebar: { background: '#FFFFFF', borderLeft: '1px solid #E2E8F0', height: '100%', transition: 'all 0.2s', display: 'flex', flexDirection: 'column', overflow: 'hidden' },
  rightSidebarContent: { width: '300px', padding: '20px', display: 'flex', flexDirection: 'column', gap: '20px', height: '100%', overflowY: 'auto' },
  rightSidebarHeader: { display: 'flex', alignItems: 'center', justifyWindow: 'space-between', justifyContent: 'space-between', borderBottom: '1px solid #F1F5F9', paddingBottom: '10px' },
  rightSidebarTitle: { fontSize: '13px', fontWeight: 800, color: '#0F172A', margin: 0 },
  meetingCard: { background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '8px', padding: '10px 12px' },
  meetingTime: { fontSize: '9.5px', fontWeight: 800, color: '#2563EB' },
  meetingTitle: { fontSize: '11.5px', fontWeight: 750, color: '#334155' },
  drawerOverlay: { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(15, 23, 42, 0.3)', backdropFilter: 'blur(4px)', zIndex: 200, display: 'flex', justifyWindow: 'flex-end', justifyContent: 'flex-end' },
  drawerContainer: { width: '400px', height: '100%', background: '#FFFFFF', display: 'flex', flexDirection: 'column' },
  drawerHeader: { display: 'flex', alignItems: 'center', justifyWindow: 'space-between', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid #E2E8F0' },
  drawerTitle: { fontSize: '15px', fontWeight: 800, color: '#0F172A', margin: 0 },
  drawerCloseBtn: { background: 'none', border: 'none', cursor: 'pointer', color: '#64748B' },
  modalOverlay: { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(15, 23, 42, 0.3)', backdropFilter: 'blur(4px)', zIndex: 200, display: 'flex', alignItems: 'center', justifyWindow: 'center', justifyContent: 'center' },
  searchModalContainer: { width: '600px', background: '#FFFFFF', borderRadius: '12px', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)', overflow: 'hidden', display: 'flex', flexDirection: 'column' },
  searchModalHeader: { display: 'flex', alignItems: 'center', height: '52px', borderBottom: '1px solid #E2E8F0', padding: '0 16px', gap: '12px' },
  searchModalInput: { flex: 1, height: '100%', border: 'none', fontSize: '13px', outline: 'none' },
  chartWrapper: { position: 'relative', marginTop: '10px' },
  filterSelect: { height: '32px', padding: '0 10px', border: '1px solid #CBD5E1', borderRadius: '6px', fontSize: '11.5px', background: '#FFFFFF' },
  statusBadge: { padding: '2px 8px', fontSize: '10.5px', fontWeight: 800, borderRadius: '12px' },
  switchContainer: { position: 'relative', display: 'inline-block', width: '38px', height: '20px', cursor: 'pointer' },
  switchInput: { position: 'absolute', opacity: 0, width: '100%', height: '100%', top: 0, left: 0, cursor: 'pointer', zIndex: 2, margin: 0 },
  switchSlider: { position: 'absolute', cursor: 'pointer', top: 0, left: 0, right: 0, bottom: 0, borderRadius: '20px', transition: 'background-color 0.2s', display: 'flex', alignItems: 'center', padding: '2px' },
  switchKnob: { width: '16px', height: '16px', borderRadius: '50%', background: '#FFFFFF', transition: 'transform 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.15)' },
  sliderBtn: { width: '28px', height: '28px', borderRadius: '6px', border: '1px solid #E2E8F0', background: '#FFFFFF', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, color: '#475569', transition: 'all 0.1s' },
  presetBtn: { flex: 1, height: '24px', border: 'none', borderRadius: '4px', fontSize: '10.5px', fontWeight: 700, cursor: 'pointer', transition: 'all 0.1s' }
};

export default SuperAdminDashboard;
