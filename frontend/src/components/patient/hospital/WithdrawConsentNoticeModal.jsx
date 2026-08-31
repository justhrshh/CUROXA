import React from 'react';

const WithdrawConsentNoticeModal = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 10002,
        background: 'rgba(15, 23, 42, 0.6)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px'
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: '#FFFFFF',
          borderRadius: '24px',
          maxWidth: '440px',
          width: '100%',
          padding: '28px 24px',
          boxShadow: '0 20px 40px -8px rgba(15, 23, 42, 0.25)',
          border: '1px solid #E2E8F0',
          textAlign: 'center',
          animation: 'fadeInScale 0.2s ease-out'
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Shield Icon Container */}
        <div
          style={{
            width: '56px',
            height: '56px',
            borderRadius: '18px',
            background: 'linear-gradient(135deg, #EFF6FF 0%, #DBEAFE 100%)',
            border: '1px solid #BFDBFE',
            color: '#2563EB',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 16px auto',
            boxShadow: '0 4px 12px rgba(37, 99, 235, 0.12)'
          }}
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10" />
            <path d="m9 12 2 2 4-4" />
          </svg>
        </div>

        <span
          style={{
            fontSize: '11px',
            fontWeight: 800,
            color: '#2563EB',
            textTransform: 'uppercase',
            letterSpacing: '0.08em'
          }}
        >
          Digital Personal Data Protection (DPDP)
        </span>

        <h3
          style={{
            fontSize: '19px',
            fontWeight: 900,
            color: '#0F172A',
            margin: '6px 0 10px 0',
            letterSpacing: '-0.02em',
            fontFamily: "'Outfit', sans-serif"
          }}
        >
          Consent Management
        </h3>

        <p
          style={{
            fontSize: '13.5px',
            color: '#475569',
            lineHeight: 1.55,
            fontWeight: 500,
            margin: '0 0 20px 0'
          }}
        >
          Consent withdrawal will be available here. This action is currently being prepared in alignment with statutory DPDP standards and healthcare continuity guidelines.
        </p>

        <div
          style={{
            background: '#F8FAFC',
            borderRadius: '14px',
            border: '1px solid #E2E8F0',
            padding: '12px 14px',
            fontSize: '12px',
            color: '#64748B',
            textAlign: 'left',
            marginBottom: '20px',
            display: 'flex',
            alignItems: 'flex-start',
            gap: '8px'
          }}
        >
          <span style={{ fontSize: '14px', flexShrink: 0 }}>ℹ️</span>
          <span>
            Your medical records and privacy settings remain strictly protected under your hospital tenant encryption boundary.
          </span>
        </div>

        <button
          type="button"
          onClick={onClose}
          style={{
            width: '100%',
            background: '#2563EB',
            color: '#FFFFFF',
            border: 'none',
            borderRadius: '12px',
            padding: '12px',
            fontSize: '14px',
            fontWeight: 800,
            cursor: 'pointer',
            boxShadow: '0 4px 12px rgba(37, 99, 235, 0.25)'
          }}
        >
          Got it
        </button>
      </div>
    </div>
  );
};

export default WithdrawConsentNoticeModal;
