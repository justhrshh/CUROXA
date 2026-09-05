import React, { useState, useEffect } from 'react';
import api from '../../../utils/api';

const DpoWithdrawConsentModal = ({ isOpen, onClose, selectedHospital, onRequestCreated }) => {
  const [step, setStep] = useState(1);
  const [chosenHospital, setChosenHospital] = useState(null);
  const [categories, setCategories] = useState({
    personal: true,
    clinical: true,
    payment: false
  });
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  useEffect(() => {
    if (selectedHospital) {
      setChosenHospital(selectedHospital);
    } else {
      setChosenHospital(null);
    }
    // Reset state on open
    if (isOpen) {
      setStep(1);
      setTermsAccepted(false);
      setError('');
      setSuccessMsg('');
    }
  }, [isOpen, selectedHospital]);

  // If modal is closed or no hospital is active, do not render
  if (!isOpen || !selectedHospital) return null;

  const hasSelectedCategory = categories.personal || categories.clinical || categories.payment;
  const hospitalName = selectedHospital?.name || chosenHospital?.name || 'Selected Hospital';
  const hospitalCode = selectedHospital?.code || selectedHospital?.hospitalId || chosenHospital?.code || 'HOSPITAL';

  const handleCategoryToggle = (key) => {
    setCategories(prev => ({ ...prev, [key]: !prev[key] }));
    setError('');
  };

  const handleNextStep = () => {
    if (!hasSelectedCategory) {
      setError('Please select at least one record category to proceed.');
      return;
    }
    setError('');
    setStep(2);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!termsAccepted) {
      setError('You must acknowledge and accept the terms and conditions to proceed.');
      return;
    }

    setSubmitting(true);
    setError('');

    try {
      const code = chosenHospital?.code || chosenHospital?.hospitalId || chosenHospital?.tenantId || hospitalCode;
      const response = await api.post('/dpo/requests', {
        hospitalId: code,
        categories,
        termsAcknowledged: true
      });

      setSuccessMsg(response.data.message || 'Withdrawal request created with 72-hour cancellation window.');
      if (onRequestCreated) {
        onRequestCreated(response.data.request);
      }

      setTimeout(() => {
        onClose();
      }, 1600);
    } catch (err) {
      console.error('Failed to submit DPO withdrawal request:', err);
      setError(err.response?.data?.error || 'Failed to submit consent withdrawal request. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 10002,
        background: 'rgba(15, 23, 42, 0.65)',
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
          maxWidth: '580px',
          width: '100%',
          maxHeight: 'min(92vh, 670px)',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 25px 60px -15px rgba(15, 23, 42, 0.35), 0 0 0 1px rgba(226, 232, 240, 0.8)',
          border: '1px solid #E2E8F0',
          animation: 'fadeInScale 0.22s ease-out',
          overflow: 'hidden'
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* ============================================================ */}
        {/* PINNED HEADER */}
        {/* ============================================================ */}
        <div style={{ padding: '22px 24px 14px', flexShrink: 0, borderBottom: '1px solid #F1F5F9' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div
                style={{
                  width: '42px',
                  height: '42px',
                  borderRadius: '12px',
                  background: 'linear-gradient(135deg, #FEF2F2 0%, #FEE2E2 100%)',
                  border: '1.5px solid #FECACA',
                  color: '#DC2626',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  boxShadow: '0 4px 10px rgba(220, 38, 38, 0.12)'
                }}
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                  <path d="m14.5 9-5 5" />
                  <path d="m9.5 9 5 5" />
                </svg>
              </div>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ fontSize: '11px', fontWeight: 800, color: '#2563EB', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    DPDP PRIVACY RIGHTS
                  </span>
                  <span style={{ fontSize: '10px', fontWeight: 700, background: '#EFF6FF', color: '#1D4ED8', padding: '1px 6px', borderRadius: '4px', border: '1px solid #DBEAFE' }}>
                    Sec 6(4)
                  </span>
                </div>
                <h3 style={{ fontSize: '18px', fontWeight: 900, color: '#0F172A', margin: '2px 0 0', fontFamily: "'Outfit', sans-serif" }}>
                  Withdraw Consent
                </h3>
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              aria-label="Close modal"
              style={{
                background: '#F8FAFC',
                border: '1px solid #E2E8F0',
                borderRadius: '10px',
                width: '32px',
                height: '32px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#64748B',
                transition: 'all 0.15s ease'
              }}
              onMouseEnter={e => { e.currentTarget.style.background = '#F1F5F9'; e.currentTarget.style.color = '#0F172A'; }}
              onMouseLeave={e => { e.currentTarget.style.background = '#F8FAFC'; e.currentTarget.style.color = '#64748B'; }}
            >
              ✕
            </button>
          </div>

          {/* Stepper Header Indicators */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div
              style={{
                flex: 1,
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '6px 10px',
                borderRadius: '8px',
                background: step === 1 ? '#EFF6FF' : '#F8FAFC',
                border: `1px solid ${step === 1 ? '#BFDBFE' : '#E2E8F0'}`
              }}
            >
              <div
                style={{
                  width: '18px',
                  height: '18px',
                  borderRadius: '50%',
                  background: step >= 1 ? '#2563EB' : '#CBD5E1',
                  color: '#FFFFFF',
                  fontSize: '11px',
                  fontWeight: 800,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
              >
                1
              </div>
              <span style={{ fontSize: '12px', fontWeight: 700, color: step === 1 ? '#1E40AF' : '#64748B' }}>
                Select Scope
              </span>
            </div>

            <div style={{ color: '#CBD5E1', fontSize: '14px', fontWeight: 800 }}>→</div>

            <div
              style={{
                flex: 1,
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '6px 10px',
                borderRadius: '8px',
                background: step === 2 ? '#EFF6FF' : '#F8FAFC',
                border: `1px solid ${step === 2 ? '#BFDBFE' : '#E2E8F0'}`
              }}
            >
              <div
                style={{
                  width: '18px',
                  height: '18px',
                  borderRadius: '50%',
                  background: step === 2 ? '#2563EB' : '#CBD5E1',
                  color: '#FFFFFF',
                  fontSize: '11px',
                  fontWeight: 800,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
              >
                2
              </div>
              <span style={{ fontSize: '12px', fontWeight: 700, color: step === 2 ? '#1E40AF' : '#64748B' }}>
                Review & Confirm
              </span>
            </div>
          </div>
        </div>

        {/* ============================================================ */}
        {/* SCROLLABLE BODY */}
        {/* ============================================================ */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 24px' }}>
          {/* Success Notification */}
          {successMsg && (
            <div style={{ background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: '12px', padding: '12px 14px', marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ fontSize: '18px' }}>✅</span>
              <span style={{ fontSize: '12.5px', fontWeight: 700, color: '#16A34A' }}>{successMsg}</span>
            </div>
          )}

          {/* Error Notification */}
          {error && (
            <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: '12px', padding: '12px 14px', marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ fontSize: '16px' }}>⚠️</span>
              <span style={{ fontSize: '12.5px', fontWeight: 700, color: '#DC2626' }}>{error}</span>
            </div>
          )}

          {/* ------------------------------------------------------------ */}
          {/* STEP 1: Select Scope */}
          {/* ------------------------------------------------------------ */}
          {step === 1 && (
            <div>
              {/* Target Hospital Provider Card */}
              <div
                style={{
                  background: 'linear-gradient(135deg, #F8FAFC 0%, #EFF6FF 100%)',
                  border: '1px solid #DBEAFE',
                  borderRadius: '14px',
                  padding: '12px 16px',
                  marginBottom: '16px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '12px'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
                  <div
                    style={{
                      width: '34px',
                      height: '34px',
                      borderRadius: '10px',
                      background: '#FFFFFF',
                      border: '1px solid #BFDBFE',
                      color: '#2563EB',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0
                    }}
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M3 21h18M5 21V7l8-4v18M13 21V3l6 3v15M9 9v.01M9 12v.01M9 15v.01M9 18v.01M17 9v.01M17 12v.01M17 15v.01M17 18v.01" />
                    </svg>
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: '10.5px', fontWeight: 800, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                      Target Hospital Provider
                    </div>
                    <div style={{ fontSize: '14.5px', fontWeight: 800, color: '#0F172A', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {hospitalName}
                    </div>
                  </div>
                </div>

                <div style={{ flexShrink: 0 }}>
                  <span style={{ fontSize: '11px', fontWeight: 800, background: '#FFFFFF', color: '#1D4ED8', border: '1px solid #BFDBFE', padding: '4px 10px', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
                    {hospitalCode}
                  </span>
                </div>
              </div>

              <p style={{ fontSize: '12.5px', color: '#475569', lineHeight: 1.45, margin: '0 0 14px', fontWeight: 500 }}>
                Under India's <strong>Digital Personal Data Protection Act 2023</strong>, select the categories of records you want to withdraw from this hospital:
              </p>

              {/* Category Checkboxes */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '16px' }}>
                {/* 1. Personal Records */}
                <div
                  onClick={() => handleCategoryToggle('personal')}
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '12px',
                    padding: '12px 14px',
                    borderRadius: '14px',
                    border: `1.5px solid ${categories.personal ? '#2563EB' : '#E2E8F0'}`,
                    background: categories.personal ? '#F0F7FF' : '#FFFFFF',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                    boxShadow: categories.personal ? '0 2px 8px rgba(37, 99, 235, 0.08)' : 'none'
                  }}
                >
                  <div
                    style={{
                      width: '20px',
                      height: '20px',
                      borderRadius: '6px',
                      background: categories.personal ? '#2563EB' : '#FFFFFF',
                      border: `1.5px solid ${categories.personal ? '#2563EB' : '#CBD5E1'}`,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      marginTop: '2px',
                      flexShrink: 0,
                      transition: 'all 0.15s ease'
                    }}
                  >
                    {categories.personal && (
                      <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    )}
                  </div>

                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontSize: '13.5px', fontWeight: 800, color: '#0F172A' }}>
                        1. Personal Records
                      </span>
                      <span style={{ fontSize: '10px', fontWeight: 700, background: '#EFF6FF', color: '#1D4ED8', padding: '1px 6px', borderRadius: '4px' }}>
                        Demographic
                      </span>
                    </div>
                    <div style={{ fontSize: '12px', color: '#64748B', marginTop: '3px', lineHeight: 1.4 }}>
                      Anonymizes full name, mobile number, email, and address. Preserves opaque UH-ID relational links.
                    </div>
                  </div>
                </div>

                {/* 2. Clinical Records */}
                <div
                  onClick={() => handleCategoryToggle('clinical')}
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '12px',
                    padding: '12px 14px',
                    borderRadius: '14px',
                    border: `1.5px solid ${categories.clinical ? '#2563EB' : '#E2E8F0'}`,
                    background: categories.clinical ? '#F0F7FF' : '#FFFFFF',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                    boxShadow: categories.clinical ? '0 2px 8px rgba(37, 99, 235, 0.08)' : 'none'
                  }}
                >
                  <div
                    style={{
                      width: '20px',
                      height: '20px',
                      borderRadius: '6px',
                      background: categories.clinical ? '#2563EB' : '#FFFFFF',
                      border: `1.5px solid ${categories.clinical ? '#2563EB' : '#CBD5E1'}`,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      marginTop: '2px',
                      flexShrink: 0,
                      transition: 'all 0.15s ease'
                    }}
                  >
                    {categories.clinical && (
                      <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    )}
                  </div>

                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontSize: '13.5px', fontWeight: 800, color: '#0F172A' }}>
                        2. Clinical Records
                      </span>
                      <span style={{ fontSize: '10px', fontWeight: 700, background: '#F0FDF4', color: '#15803D', padding: '1px 6px', borderRadius: '4px' }}>
                        Diagnostic & Rx
                      </span>
                    </div>
                    <div style={{ fontSize: '12px', color: '#64748B', marginTop: '3px', lineHeight: 1.4 }}>
                      Redacts clinical notes, remarks, and doctor instructions. Encounter Visit IDs are kept intact for medical continuity.
                    </div>
                  </div>
                </div>

                {/* 3. Payment Details */}
                <div
                  onClick={() => handleCategoryToggle('payment')}
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '12px',
                    padding: '12px 14px',
                    borderRadius: '14px',
                    border: `1.5px solid ${categories.payment ? '#2563EB' : '#E2E8F0'}`,
                    background: categories.payment ? '#F0F7FF' : '#FFFFFF',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                    boxShadow: categories.payment ? '0 2px 8px rgba(37, 99, 235, 0.08)' : 'none'
                  }}
                >
                  <div
                    style={{
                      width: '20px',
                      height: '20px',
                      borderRadius: '6px',
                      background: categories.payment ? '#2563EB' : '#FFFFFF',
                      border: `1.5px solid ${categories.payment ? '#2563EB' : '#CBD5E1'}`,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      marginTop: '2px',
                      flexShrink: 0,
                      transition: 'all 0.15s ease'
                    }}
                  >
                    {categories.payment && (
                      <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    )}
                  </div>

                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontSize: '13.5px', fontWeight: 800, color: '#0F172A' }}>
                        3. Payment Details
                      </span>
                      <span style={{ fontSize: '10px', fontWeight: 700, background: '#FEF3C7', color: '#B45309', padding: '1px 6px', borderRadius: '4px' }}>
                        Audit Preserved
                      </span>
                    </div>
                    <div style={{ fontSize: '12px', color: '#64748B', marginTop: '3px', lineHeight: 1.4 }}>
                      Recorded as an official withdrawal mandate. Financial & tax ledgers remain safely archived per hospital accounting rules.
                    </div>
                  </div>
                </div>
              </div>

              {/* 72-Hour Waiting Window Notice */}
              <div
                style={{
                  background: '#FFFBEB',
                  border: '1px solid #FDE68A',
                  borderRadius: '12px',
                  padding: '11px 13px',
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '10px'
                }}
              >
                <div style={{ width: '22px', height: '22px', borderRadius: '6px', background: '#FDE68A', color: '#B45309', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: '1px' }}>
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10" />
                    <polyline points="12 6 12 12 16 14" />
                  </svg>
                </div>
                <div style={{ fontSize: '11.8px', color: '#92400E', lineHeight: 1.45 }}>
                  <strong>72-Hour Statutory Cooling-Off:</strong> Initiates a 72-hour review window. You or the hospital DPO may cancel anytime within 72 hours before processing occurs.
                </div>
              </div>
            </div>
          )}

          {/* ------------------------------------------------------------ */}
          {/* STEP 2: Review & Confirm */}
          {/* ------------------------------------------------------------ */}
          {step === 2 && (
            <div>
              {/* Target Summary Card */}
              <div
                style={{
                  background: '#EFF6FF',
                  border: '1px solid #BFDBFE',
                  borderRadius: '14px',
                  padding: '14px 16px',
                  marginBottom: '14px'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <span style={{ fontSize: '11px', fontWeight: 800, color: '#1E40AF', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    Withdrawal Target & Scope
                  </span>
                  <span style={{ fontSize: '11px', fontWeight: 800, color: '#1D4ED8', background: '#DBEAFE', padding: '2px 8px', borderRadius: '6px' }}>
                    {hospitalCode}
                  </span>
                </div>

                <div style={{ fontSize: '15px', fontWeight: 800, color: '#0F172A', marginBottom: '8px' }}>
                  {hospitalName}
                </div>

                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                  {categories.personal && (
                    <span style={{ fontSize: '11.5px', fontWeight: 700, background: '#FFFFFF', color: '#1D4ED8', padding: '3px 9px', borderRadius: '6px', border: '1px solid #BFDBFE' }}>
                      ✓ Personal Records
                    </span>
                  )}
                  {categories.clinical && (
                    <span style={{ fontSize: '11.5px', fontWeight: 700, background: '#FFFFFF', color: '#1D4ED8', padding: '3px 9px', borderRadius: '6px', border: '1px solid #BFDBFE' }}>
                      ✓ Clinical Records
                    </span>
                  )}
                  {categories.payment && (
                    <span style={{ fontSize: '11.5px', fontWeight: 700, background: '#FFFFFF', color: '#1D4ED8', padding: '3px 9px', borderRadius: '6px', border: '1px solid #BFDBFE' }}>
                      ✓ Payment Details
                    </span>
                  )}
                </div>
              </div>

              {/* Clean Terms & Conditions Card */}
              <div
                style={{
                  background: '#F8FAFC',
                  border: '1px solid #E2E8F0',
                  borderRadius: '14px',
                  padding: '14px 16px',
                  marginBottom: '16px'
                }}
              >
                <div style={{ fontSize: '12px', fontWeight: 800, color: '#0F172A', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#2563EB" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                  </svg>
                  Statutory Consent Terms & Protocols:
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '12px', color: '#475569', lineHeight: 1.45 }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '6px' }}>
                    <span style={{ color: '#2563EB', fontWeight: 800 }}>•</span>
                    <div>
                      <strong>Hospital Tenant Isolation:</strong> This request applies strictly to <em>{hospitalName}</em>. Other hospitals in Curoxa remain unaffected.
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '6px' }}>
                    <span style={{ color: '#2563EB', fontWeight: 800 }}>•</span>
                    <div>
                      <strong>72-Hour Cancel Window:</strong> Server locks execution for 72 hours. You can cancel from your dashboard at any time.
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '6px' }}>
                    <span style={{ color: '#2563EB', fontWeight: 800 }}>•</span>
                    <div>
                      <strong>Identity Dissociation:</strong> Upon DPO review and execution, personal details are anonymized while preserving clinical encounter integrity.
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '6px' }}>
                    <span style={{ color: '#2563EB', fontWeight: 800 }}>•</span>
                    <div>
                      <strong>Fresh Re-Registration:</strong> If you re-register at this hospital later, you will receive a brand-new patient ID and UH-ID.
                    </div>
                  </div>
                </div>
              </div>

              {/* Mandatory Checkbox Card */}
              <div
                onClick={() => setTermsAccepted(!termsAccepted)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  padding: '12px 14px',
                  borderRadius: '12px',
                  border: `1.5px solid ${termsAccepted ? '#2563EB' : '#CBD5E1'}`,
                  background: termsAccepted ? '#EFF6FF' : '#FFFFFF',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease'
                }}
              >
                <div
                  style={{
                    width: '20px',
                    height: '20px',
                    borderRadius: '6px',
                    background: termsAccepted ? '#2563EB' : '#FFFFFF',
                    border: `1.5px solid ${termsAccepted ? '#2563EB' : '#94A3B8'}`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                    transition: 'all 0.15s ease'
                  }}
                >
                  {termsAccepted && (
                    <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  )}
                </div>

                <span style={{ fontSize: '12.5px', fontWeight: 700, color: '#0F172A', lineHeight: 1.4 }}>
                  I have read and understood the terms and confirm my consent withdrawal request for {hospitalName}.
                </span>
              </div>
            </div>
          )}
        </div>

        {/* ============================================================ */}
        {/* PINNED FOOTER (ALWAYS VISIBLE - NEVER CUT OFF) */}
        {/* ============================================================ */}
        <div
          style={{
            padding: '14px 24px 18px',
            borderTop: '1px solid #F1F5F9',
            background: '#FFFFFF',
            flexShrink: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px'
          }}
        >
          {step === 1 ? (
            <>
              <button
                type="button"
                onClick={onClose}
                style={{
                  padding: '10px 18px',
                  borderRadius: '10px',
                  background: '#F8FAFC',
                  color: '#64748B',
                  border: '1px solid #E2E8F0',
                  fontSize: '13px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  transition: 'all 0.15s ease'
                }}
                onMouseEnter={e => { e.currentTarget.style.background = '#F1F5F9'; e.currentTarget.style.color = '#0F172A'; }}
                onMouseLeave={e => { e.currentTarget.style.background = '#F8FAFC'; e.currentTarget.style.color = '#64748B'; }}
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={handleNextStep}
                disabled={!hasSelectedCategory}
                style={{
                  padding: '10px 22px',
                  borderRadius: '10px',
                  background: hasSelectedCategory ? '#2563EB' : '#CBD5E1',
                  color: '#FFFFFF',
                  border: 'none',
                  fontSize: '13.5px',
                  fontWeight: 800,
                  cursor: hasSelectedCategory ? 'pointer' : 'not-allowed',
                  boxShadow: hasSelectedCategory ? '0 4px 12px rgba(37, 99, 235, 0.25)' : 'none',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  transition: 'all 0.15s ease'
                }}
                onMouseEnter={e => { if (hasSelectedCategory) e.currentTarget.style.background = '#1D4ED8'; }}
                onMouseLeave={e => { if (hasSelectedCategory) e.currentTarget.style.background = '#2563EB'; }}
              >
                Continue to Review
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => setStep(1)}
                disabled={submitting}
                style={{
                  padding: '10px 18px',
                  borderRadius: '10px',
                  background: '#F8FAFC',
                  color: '#475569',
                  border: '1px solid #E2E8F0',
                  fontSize: '13px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  transition: 'all 0.15s ease'
                }}
                onMouseEnter={e => { e.currentTarget.style.background = '#F1F5F9'; e.currentTarget.style.color = '#0F172A'; }}
                onMouseLeave={e => { e.currentTarget.style.background = '#F8FAFC'; e.currentTarget.style.color = '#475569'; }}
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="15 18 9 12 15 6" />
                </svg>
                Back
              </button>

              <button
                type="button"
                onClick={handleSubmit}
                disabled={!termsAccepted || submitting}
                style={{
                  padding: '10px 22px',
                  borderRadius: '10px',
                  background: (termsAccepted && !submitting) ? 'linear-gradient(135deg, #DC2626 0%, #B91C1C 100%)' : '#CBD5E1',
                  color: '#FFFFFF',
                  border: 'none',
                  fontSize: '13.5px',
                  fontWeight: 800,
                  cursor: (termsAccepted && !submitting) ? 'pointer' : 'not-allowed',
                  boxShadow: (termsAccepted && !submitting) ? '0 4px 14px rgba(220, 38, 38, 0.32)' : 'none',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  transition: 'all 0.15s ease'
                }}
                onMouseEnter={e => { if (termsAccepted && !submitting) e.currentTarget.style.background = 'linear-gradient(135deg, #B91C1C 0%, #991B1B 100%)'; }}
                onMouseLeave={e => { if (termsAccepted && !submitting) e.currentTarget.style.background = 'linear-gradient(135deg, #DC2626 0%, #B91C1C 100%)'; }}
              >
                {submitting ? (
                  <>
                    <span className="spinner-border spinner-border-sm" role="status" aria-hidden="true" style={{ width: '14px', height: '14px' }}></span>
                    Submitting Request...
                  </>
                ) : (
                  <>
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                      <line x1="12" y1="8" x2="12" y2="12" />
                      <line x1="12" y1="16" x2="12.01" y2="16" />
                    </svg>
                    Confirm & Withdraw Consent
                  </>
                )}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default DpoWithdrawConsentModal;

