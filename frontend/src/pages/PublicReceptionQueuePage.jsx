import React, { useState, useEffect, useRef } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { io } from 'socket.io-client';
import api, { getSocketUrl } from '../utils/api';
import { 
  CheckCircle, AlertCircle, Clock, Users, ArrowRight, RefreshCw, 
  ChevronRight, Calendar, User, Phone, Shield, Building2, MapPin, 
  HelpCircle, AlertTriangle, ArrowLeft, HeartPulse, Check, Sparkles,
  Droplet, Mail, Plus, Minus, ChevronDown
} from 'lucide-react';
import curoxaLogo from '../assets/quroxa_new_logo.png';

const PublicReceptionQueuePage = () => {
  const { clinicCode } = useParams();
  const [searchParams] = useSearchParams();

  // App step states: 
  // 'loading' | 'clinic_unavailable' | 'module_disabled' | 'email_entry' | 
  // 'otp_entry' | 'ambiguous_match' | 'existing_patient_appointment' | 
  // 'new_patient_form' | 'ticket_active' | 'session_expired'
  const [step, setStep] = useState('loading');
  
  // Clinic & branding metadata
  const [clinic, setClinic] = useState(null);
  const [queueMetrics, setQueueMetrics] = useState({
    currentTicketNumber: null,
    currentTicketDisplay: null,
    waitingCount: 0,
    isServing: false
  });

  // User input states
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [resendCooldown, setResendCooldown] = useState(0);

  // New patient registration form states
  const [formData, setFormData] = useState({
    title: 'Mr.',
    name: '',
    contact: '',
    gender: 'Male',
    age: '',
    dob: '',
    email: '',
    bloodGroup: '',
    address: '',
    allergies: ''
  });
  const [showMoreOptions, setShowMoreOptions] = useState(false);

  // Flow context states
  const [sessionToken, setSessionToken] = useState(null);
  const [activeTicket, setActiveTicket] = useState(null);
  const [patientPosition, setPatientPosition] = useState(null);
  const [existingPatientData, setExistingPatientData] = useState(null);
  const [ambiguousMessage, setAmbiguousMessage] = useState('');

  // UI status feedback
  const [actionLoading, setActionLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successNotice, setSuccessNotice] = useState('');

  const socketRef = useRef(null);

  // 1. Initial Load: Fetch clinic info & verify module
  useEffect(() => {
    let isMounted = true;

    const fetchClinicInfo = async () => {
      setErrorMessage('');
      try {
        const res = await api.get(`/reception-queue/clinic/${encodeURIComponent(clinicCode || '')}`);
        if (!isMounted) return;

        if (res.data.moduleEnabled === false) {
          setClinic(res.data.hospital || { name: 'Clinic' });
          setStep('module_disabled');
          return;
        }

        setClinic(res.data.hospital);
        if (res.data.queue) {
          setQueueMetrics({
            currentTicketNumber: res.data.queue.currentTicketNumber,
            currentTicketDisplay: res.data.queue.currentTicketDisplay,
            waitingCount: res.data.queue.waitingCount || 0,
            isServing: res.data.queue.isServing || false
          });
        }

        // Check if user already has an active ticket stored in this session
        const storedToken = sessionStorage.getItem(`reception_ticket_${clinicCode}`);
        if (storedToken) {
          try {
            const ticketRes = await api.get(`/reception-queue/ticket/${encodeURIComponent(storedToken)}`);
            if (ticketRes.data?.ticket) {
              setActiveTicket(ticketRes.data.ticket);
              setPatientPosition(ticketRes.data.position);
              setSessionToken(storedToken);
              setStep('ticket_active');
              return;
            }
          } catch (tErr) {
            sessionStorage.removeItem(`reception_ticket_${clinicCode}`);
          }
        }

        setStep('email_entry');
      } catch (err) {
        if (!isMounted) return;
        setStep('clinic_unavailable');
      }
    };

    fetchClinicInfo();

    return () => {
      isMounted = false;
    };
  }, [clinicCode]);

  // 1b. Disable Lenis Smooth Scroll on intake page so native mobile/desktop scrolling works effortlessly
  useEffect(() => {
    if (window.lenis) {
      try {
        window.lenis.destroy();
        window.lenis = null;
      } catch (err) {
        console.warn('Error destroying Lenis on intake page:', err);
      }
    }
    document.documentElement.classList.remove('lenis', 'lenis-smooth');
  }, []);

  // 2. Real-Time Socket Connection & Periodic Polling
  useEffect(() => {
    if (!clinicCode) return;

    let socket;
    try {
      const socketUrl = getSocketUrl();
      socket = io(socketUrl, {
        transports: ['websocket', 'polling'],
        auth: { receptionClinicCode: clinicCode.toLowerCase() },
        reconnection: true,
        reconnectionAttempts: 5,
        reconnectionDelay: 2000
      });

      socket.on('reception_queue_updated', (data) => {
        if (data.clinicCode?.toLowerCase() === clinicCode.toLowerCase()) {
          setQueueMetrics({
            currentTicketNumber: data.currentTicketNumber,
            currentTicketDisplay: data.currentTicketDisplay,
            waitingCount: data.waitingCount || 0,
            isServing: Boolean(data.currentTicketNumber)
          });

          // Instantly sync patient's personal position & ticket status
          const activeSession = sessionToken || sessionStorage.getItem(`reception_token_${clinicCode.toLowerCase()}`);
          if (activeSession) {
            api.get(`/reception-queue/ticket/${encodeURIComponent(activeSession)}`)
              .then(res => {
                if (res.data?.ticket) {
                  setActiveTicket(res.data.ticket);
                  setPatientPosition(res.data.position);
                }
              })
              .catch(err => {
                console.warn('[RECEPTION REFRESH ERROR]:', err.message);
              });
          }
        }
      });

      socketRef.current = socket;
    } catch (e) {
      console.warn('[RECEPTION SOCKET] Init warning:', e.message);
    }

    // Secondary Polling Fallback (every 12 seconds)
    const pollInterval = setInterval(async () => {
      try {
        if (sessionToken && step === 'ticket_active') {
          const res = await api.get(`/reception-queue/ticket/${encodeURIComponent(sessionToken)}`);
          if (res.data?.ticket) {
            setActiveTicket(res.data.ticket);
            setPatientPosition(res.data.position);
          }
        } else if (step === 'email_entry' || step === 'otp_entry') {
          const res = await api.get(`/reception-queue/clinic/${encodeURIComponent(clinicCode)}`);
          if (res.data?.queue) {
            setQueueMetrics({
              currentTicketNumber: res.data.queue.currentTicketNumber,
              currentTicketDisplay: res.data.queue.currentTicketDisplay,
              waitingCount: res.data.queue.waitingCount || 0,
              isServing: res.data.queue.isServing || false
            });
          }
        }
      } catch (err) {
        // Silent failure for background poll
      }
    }, 12000);

    return () => {
      if (socket) socket.disconnect();
      clearInterval(pollInterval);
    };
  }, [clinicCode, sessionToken, step]);

  // 3. Resend OTP countdown timer
  useEffect(() => {
    let timer;
    if (resendCooldown > 0) {
      timer = setTimeout(() => setResendCooldown(resendCooldown - 1), 1000);
    }
    return () => clearTimeout(timer);
  }, [resendCooldown]);

  // Handler: Dispatch OTP
  const handleSendOtp = async (e) => {
    if (e) e.preventDefault();
    setErrorMessage('');
    setSuccessNotice('');

    if (!email || !email.includes('@') || !email.includes('.')) {
      setErrorMessage('Please enter a valid email address.');
      return;
    }

    setActionLoading(true);
    try {
      const res = await api.post('/reception-queue/send-otp', {
        clinicCode,
        email: email.trim().toLowerCase()
      });

      setSuccessNotice('A 6-digit verification code has been sent to your email.');
      setStep('otp_entry');
      setResendCooldown(30);
    } catch (err) {
      setErrorMessage(err.response?.data?.error || 'Failed to dispatch verification code. Please try again.');
    } finally {
      setActionLoading(false);
    }
  };

  // Handler: Verify OTP
  const handleVerifyOtp = async (e) => {
    if (e) e.preventDefault();
    setErrorMessage('');
    setSuccessNotice('');

    if (!otp || otp.trim().length !== 6) {
      setErrorMessage('Please enter the 6-digit code sent to your email.');
      return;
    }

    setActionLoading(true);
    try {
      const res = await api.post('/reception-queue/verify-otp', {
        clinicCode,
        email: email.trim().toLowerCase(),
        otp: otp.trim()
      });

      const data = res.data;

      // Handle outcomes
      if (data.status === 'ambiguous_match') {
        setAmbiguousMessage(data.message);
        setStep('ambiguous_match');
      } else if (data.status === 'existing_patient_with_appointment') {
        setExistingPatientData({
          patient: data.patient,
          appointments: data.appointments || []
        });
        setStep('existing_patient_appointment');
      } else if (data.status === 'existing_patient_ticket_issued') {
        setActiveTicket(data.ticket);
        setPatientPosition(data.position);
        setSessionToken(data.sessionToken);
        sessionStorage.setItem(`reception_ticket_${clinicCode}`, data.sessionToken);
        setStep('ticket_active');
      } else if (data.status === 'new_patient_details_required') {
        setSessionToken(data.sessionToken);
        setStep('new_patient_form');
      } else {
        setErrorMessage('Unexpected server response. Please try again.');
      }
    } catch (err) {
      setErrorMessage(err.response?.data?.error || 'Invalid or expired verification code.');
    } finally {
      setActionLoading(false);
    }
  };

  // Handler: Submit New Patient Details
  const handleRegisterNewPatient = async (e) => {
    if (e) e.preventDefault();
    setErrorMessage('');

    if (!formData.name.trim()) {
      setErrorMessage('Please enter your full name.');
      return;
    }

    const cleanPhone = formData.contact.replace(/\D/g, '');
    if (cleanPhone.length < 10) {
      setErrorMessage('Please enter a valid 10-digit mobile number.');
      return;
    }

    setActionLoading(true);
    try {
      // Create idempotency key to prevent double submits
      const idempotencyKey = `new_reg_${sessionToken}_${Date.now()}`;

      const res = await api.post('/reception-queue/register-new', {
        sessionToken,
        clinicCode,
        title: formData.title,
        name: formData.name.trim(),
        contact: cleanPhone,
        gender: formData.gender,
        age: formData.age ? parseInt(formData.age, 10) : undefined,
        dob: formData.dob || undefined,
        email: formData.email?.trim() || undefined,
        bloodGroup: formData.bloodGroup || undefined,
        address: formData.address?.trim() || undefined,
        allergies: formData.allergies?.trim() || undefined,
        idempotencyKey
      });

      if (res.data?.status === 'new_patient_ticket_issued') {
        setActiveTicket(res.data.ticket);
        setPatientPosition(res.data.position);
        sessionStorage.setItem(`reception_ticket_${clinicCode}`, res.data.sessionToken);
        setStep('ticket_active');
      } else {
        setErrorMessage('Failed to join reception queue. Please try again.');
      }
    } catch (err) {
      setErrorMessage(err.response?.data?.error || 'Failed to submit registration. Please try again.');
    } finally {
      setActionLoading(false);
    }
  };

  // Safe reset for new session
  const handleStartOver = () => {
    sessionStorage.removeItem(`reception_ticket_${clinicCode}`);
    setSessionToken(null);
    setActiveTicket(null);
    setPatientPosition(null);
    setExistingPatientData(null);
    setEmail('');
    setOtp('');
    setErrorMessage('');
    setSuccessNotice('');
    setStep('email_entry');
  };

  return (
    <div 
      data-lenis-prevent="true"
      style={{
        minHeight: '100vh',
        height: 'auto',
        background: '#F8FAFC',
        color: '#0F172A',
        fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'flex-start',
        padding: '16px 16px 80px 16px',
        boxSizing: 'border-box',
        overflowY: 'auto',
        overflowX: 'hidden',
        WebkitOverflowScrolling: 'touch',
        width: '100%',
        maxWidth: '100%'
      }}
    >
      <style>{`
        html, body {
          overflow-y: auto !important;
          -webkit-overflow-scrolling: touch !important;
          height: auto !important;
          min-height: 100% !important;
        }
        #root {
          min-height: 100% !important;
          height: auto !important;
          overflow-y: visible !important;
        }
      `}</style>
      {/* ── TOP HEADER / BRAND BAR ── */}
      <header style={{
        width: '100%',
        maxWidth: '460px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '12px 0 20px 0',
        boxSizing: 'border-box'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <img 
            src={clinic?.logo || curoxaLogo} 
            alt={clinic?.name || 'QUROXA'} 
            style={{ height: '32px', maxWidth: '140px', objectFit: 'contain' }}
            onError={(e) => { e.target.onerror = null; e.target.src = curoxaLogo; }}
          />
          <div>
            <div style={{ fontSize: '13.5px', fontWeight: 800, color: '#0F172A', lineHeight: 1.2 }}>
              {clinic?.name || 'Clinic Arrival'}
            </div>
            <div style={{ fontSize: '11px', color: '#64748B', fontWeight: 600 }}>
              Front Desk Reception Queue
            </div>
          </div>
        </div>

        <div style={{
          padding: '4px 10px',
          borderRadius: '20px',
          background: '#EFF6FF',
          border: '1px solid #DBEAFE',
          fontSize: '11px',
          fontWeight: 700,
          color: '#1D4ED8',
          display: 'flex',
          alignItems: 'center',
          gap: '5px'
        }}>
          <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#2563EB', display: 'inline-block' }} />
          Live Desk
        </div>
      </header>

      {/* ── MAIN CONTENT CONTAINER (320px - 460px mobile card) ── */}
      <main style={{
        width: '100%',
        maxWidth: '460px',
        background: '#FFFFFF',
        borderRadius: '16px',
        border: '1px solid #E2E8F0',
        boxShadow: '0 4px 16px -2px rgba(15, 23, 42, 0.05)',
        padding: '24px',
        boxSizing: 'border-box',
        display: 'flex',
        flexDirection: 'column',
        gap: '20px'
      }}>

        {/* ── ERROR ALERT BANNER ── */}
        {errorMessage && (
          <div style={{
            background: '#FEF2F2',
            border: '1px solid #FCA5A5',
            borderRadius: '10px',
            padding: '12px 14px',
            display: 'flex',
            alignItems: 'flex-start',
            gap: '10px',
            fontSize: '13px',
            color: '#991B1B',
            lineHeight: 1.4
          }}>
            <AlertCircle size={17} color="#DC2626" style={{ flexShrink: 0, marginTop: '2px' }} />
            <div>{errorMessage}</div>
          </div>
        )}

        {/* ── SUCCESS NOTICE BANNER ── */}
        {successNotice && (
          <div style={{
            background: '#F0FDF4',
            border: '1px solid #86EFAC',
            borderRadius: '10px',
            padding: '12px 14px',
            display: 'flex',
            alignItems: 'flex-start',
            gap: '10px',
            fontSize: '13px',
            color: '#166534',
            lineHeight: 1.4
          }}>
            <CheckCircle size={17} color="#16A34A" style={{ flexShrink: 0, marginTop: '2px' }} />
            <div>{successNotice}</div>
          </div>
        )}

        {/* ── STATE 1: LOADING ── */}
        {step === 'loading' && (
          <div style={{ textAlign: 'center', padding: '40px 0' }}>
            <RefreshCw size={28} className="animate-spin" color="#2563EB" style={{ margin: '0 auto 16px auto', display: 'block' }} />
            <div style={{ fontSize: '15px', fontWeight: 700, color: '#0F172A' }}>Connecting to Reception Desk...</div>
            <div style={{ fontSize: '12.5px', color: '#64748B', marginTop: '6px' }}>Verifying clinic check-in service</div>
          </div>
        )}

        {/* ── STATE 2: CLINIC UNAVAILABLE / 404 ── */}
        {step === 'clinic_unavailable' && (
          <div style={{ textAlign: 'center', padding: '30px 10px' }}>
            <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: '#FEE2E2', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px auto' }}>
              <Building2 size={24} color="#DC2626" />
            </div>
            <h2 style={{ fontSize: '18px', fontWeight: 800, color: '#0F172A', margin: '0 0 8px 0' }}>Clinic Not Found</h2>
            <p style={{ fontSize: '13.5px', color: '#64748B', lineHeight: 1.5, margin: '0 0 20px 0' }}>
              We could not locate this clinic check-in station. Please ensure you scanned the official QR code at the reception counter.
            </p>
            <div style={{ fontSize: '12px', color: '#94A3B8' }}>Identifier: {clinicCode}</div>
          </div>
        )}

        {/* ── STATE 3: MODULE DISABLED ── */}
        {step === 'module_disabled' && (
          <div style={{ textAlign: 'center', padding: '30px 10px' }}>
            <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: '#FEF3C7', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px auto' }}>
              <Clock size={24} color="#D97706" />
            </div>
            <h2 style={{ fontSize: '18px', fontWeight: 800, color: '#0F172A', margin: '0 0 8px 0' }}>Desk Check-In Unavailable</h2>
            <p style={{ fontSize: '13.5px', color: '#64748B', lineHeight: 1.5, margin: '0 0 20px 0' }}>
              Digital self-service registration is currently offline at <strong>{clinic?.name || 'this clinic'}</strong>. Please proceed directly to the physical reception desk for assistance.
            </p>
            {clinic?.phone && (
              <div style={{ fontSize: '12.5px', color: '#475569', background: '#F8FAFC', padding: '10px', borderRadius: '8px', border: '1px solid #E2E8F0' }}>
                Reception Contact: <strong>{clinic.phone}</strong>
              </div>
            )}
          </div>
        )}

        {/* ── STATE 4: EMAIL ENTRY (STEP 1 OF VERIFICATION) ── */}
        {step === 'email_entry' && (
          <div>
            <div style={{ marginBottom: '18px' }}>
              <h2 style={{ fontSize: '20px', fontWeight: 800, color: '#0F172A', margin: '0 0 6px 0' }}>
                Welcome to Reception
              </h2>
              <p style={{ margin: 0, fontSize: '13px', color: '#64748B', lineHeight: 1.4 }}>
                Enter your email to verify your identity and enter the front-desk queue.
              </p>
            </div>

            {/* Live Queue Overview Badge */}
            <div style={{
              background: '#F8FAFC',
              border: '1px solid #E2E8F0',
              borderRadius: '12px',
              padding: '14px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '20px'
            }}>
              <div>
                <div style={{ fontSize: '11px', color: '#64748B', fontWeight: 700, textTransform: 'uppercase' }}>Current Serving</div>
                <div style={{ fontSize: '18px', fontWeight: 900, color: '#0F172A' }}>
                  {queueMetrics.currentTicketDisplay || 'Desk Free'}
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: '11px', color: '#64748B', fontWeight: 700, textTransform: 'uppercase' }}>Waiting Ahead</div>
                <div style={{ fontSize: '18px', fontWeight: 900, color: '#2563EB' }}>
                  {queueMetrics.waitingCount} {queueMetrics.waitingCount === 1 ? 'person' : 'people'}
                </div>
              </div>
            </div>

            <form onSubmit={handleSendOtp} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                  Your Email Address
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@example.com"
                  required
                  autoFocus
                  style={{
                    width: '100%',
                    padding: '12px 14px',
                    borderRadius: '8px',
                    border: '1.5px solid #CBD5E1',
                    fontSize: '14px',
                    color: '#0F172A',
                    boxSizing: 'border-box',
                    outline: 'none',
                    transition: 'border-color 0.15s ease'
                  }}
                  onFocus={(e) => e.target.style.borderColor = '#2563EB'}
                  onBlur={(e) => e.target.style.borderColor = '#CBD5E1'}
                />
              </div>

              <button
                type="submit"
                disabled={actionLoading || !email.trim()}
                style={{
                  width: '100%',
                  padding: '13px',
                  borderRadius: '8px',
                  background: actionLoading || !email.trim() ? '#94A3B8' : '#2563EB',
                  color: '#FFFFFF',
                  fontSize: '14.5px',
                  fontWeight: 700,
                  border: 'none',
                  cursor: actionLoading || !email.trim() ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  transition: 'background 0.15s ease'
                }}
              >
                {actionLoading ? (
                  <>
                    <RefreshCw size={16} className="animate-spin" />
                    Sending Code...
                  </>
                ) : (
                  <>
                    Send Verification Code
                    <ArrowRight size={16} />
                  </>
                )}
              </button>
            </form>

            <div style={{ marginTop: '16px', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '11.5px', color: '#64748B' }}>
              <Shield size={14} color="#94A3B8" />
              <span>We protect your health data. Zero spam.</span>
            </div>
          </div>
        )}

        {/* ── STATE 5: OTP ENTRY ── */}
        {step === 'otp_entry' && (
          <div>
            <button
              type="button"
              onClick={() => { setStep('email_entry'); setErrorMessage(''); }}
              style={{
                background: 'none',
                border: 'none',
                padding: 0,
                fontSize: '12.5px',
                color: '#2563EB',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                marginBottom: '14px'
              }}
            >
              <ArrowLeft size={14} /> Back to email
            </button>

            <h2 style={{ fontSize: '20px', fontWeight: 800, color: '#0F172A', margin: '0 0 6px 0' }}>
              Verify Your Code
            </h2>
            <p style={{ margin: '0 0 16px 0', fontSize: '13px', color: '#64748B', lineHeight: 1.4 }}>
              Enter the 6-digit code sent to <strong style={{ color: '#0F172A' }}>{email}</strong>.
            </p>

            <form onSubmit={handleVerifyOtp} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <input
                  type="text"
                  maxLength={6}
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                  placeholder="000000"
                  required
                  autoFocus
                  style={{
                    width: '100%',
                    padding: '12px 14px',
                    borderRadius: '8px',
                    border: '1.5px solid #2563EB',
                    fontSize: '24px',
                    fontWeight: 800,
                    letterSpacing: '8px',
                    textAlign: 'center',
                    color: '#0F172A',
                    boxSizing: 'border-box',
                    outline: 'none'
                  }}
                />
              </div>

              <button
                type="submit"
                disabled={actionLoading || otp.length !== 6}
                style={{
                  width: '100%',
                  padding: '13px',
                  borderRadius: '8px',
                  background: actionLoading || otp.length !== 6 ? '#94A3B8' : '#2563EB',
                  color: '#FFFFFF',
                  fontSize: '14.5px',
                  fontWeight: 700,
                  border: 'none',
                  cursor: actionLoading || otp.length !== 6 ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px'
                }}
              >
                {actionLoading ? (
                  <>
                    <RefreshCw size={16} className="animate-spin" />
                    Verifying...
                  </>
                ) : (
                  <>
                    Verify & Continue
                    <ArrowRight size={16} />
                  </>
                )}
              </button>
            </form>

            <div style={{ marginTop: '16px', textAlign: 'center', fontSize: '12.5px', color: '#64748B' }}>
              Didn't receive the code?{' '}
              {resendCooldown > 0 ? (
                <span style={{ color: '#94A3B8' }}>Resend in {resendCooldown}s</span>
              ) : (
                <button
                  type="button"
                  onClick={handleSendOtp}
                  disabled={actionLoading}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#2563EB',
                    fontWeight: 700,
                    cursor: 'pointer',
                    padding: 0
                  }}
                >
                  Resend Code
                </button>
              )}
            </div>
          </div>
        )}

        {/* ── STATE 6: AMBIGUOUS IDENTITY MATCH ── */}
        {step === 'ambiguous_match' && (
          <div style={{ textAlign: 'center', padding: '10px 0' }}>
            <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: '#FEF3C7', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px auto' }}>
              <AlertTriangle size={24} color="#D97706" />
            </div>
            <h2 style={{ fontSize: '18px', fontWeight: 800, color: '#0F172A', margin: '0 0 8px 0' }}>
              Assistance Required
            </h2>
            <p style={{ fontSize: '13.5px', color: '#475569', lineHeight: 1.5, margin: '0 0 20px 0' }}>
              {ambiguousMessage}
            </p>
            <div style={{
              background: '#F8FAFC',
              border: '1px solid #E2E8F0',
              borderRadius: '10px',
              padding: '14px',
              fontSize: '12.5px',
              color: '#334155',
              textAlign: 'left',
              marginBottom: '20px'
            }}>
              <strong style={{ display: 'block', marginBottom: '4px', color: '#0F172A' }}>Next Steps:</strong>
              1. Step up to the reception counter.<br />
              2. Inform the front desk staff of your name and email.<br />
              3. The receptionist will safely select your profile.
            </div>
            <button
              type="button"
              onClick={handleStartOver}
              style={{
                padding: '10px 18px',
                borderRadius: '8px',
                border: '1px solid #CBD5E1',
                background: '#FFFFFF',
                fontSize: '13px',
                fontWeight: 700,
                color: '#334155',
                cursor: 'pointer'
              }}
            >
              Start Over
            </button>
          </div>
        )}

        {/* ── STATE 7: EXISTING PATIENT WITH RELEVANT APPOINTMENT ── */}
        {step === 'existing_patient_appointment' && existingPatientData && (
          <div>
            <div style={{
              width: '44px',
              height: '44px',
              borderRadius: '50%',
              background: '#DCFCE7',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: '14px'
            }}>
              <CheckCircle size={24} color="#16A34A" />
            </div>

            <h2 style={{ fontSize: '20px', fontWeight: 800, color: '#0F172A', margin: '0 0 4px 0' }}>
              Welcome Back, {existingPatientData.patient.name}
            </h2>
            <p style={{ fontSize: '13px', color: '#64748B', margin: '0 0 18px 0', lineHeight: 1.4 }}>
              You have an active appointment scheduled today. Please report directly to reception for check-in.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '20px' }}>
              {existingPatientData.appointments.map((appt, idx) => (
                <div
                  key={appt.id || idx}
                  style={{
                    background: '#F8FAFC',
                    border: '1px solid #E2E8F0',
                    borderRadius: '10px',
                    padding: '14px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '6px'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '14px', fontWeight: 800, color: '#0F172A' }}>
                      {appt.doctorName}
                    </span>
                    <span style={{
                      fontSize: '11px',
                      fontWeight: 700,
                      padding: '2px 8px',
                      borderRadius: '12px',
                      background: '#DBEAFE',
                      color: '#1D4ED8'
                    }}>
                      {appt.status}
                    </span>
                  </div>
                  <div style={{ fontSize: '12px', color: '#64748B' }}>
                    {appt.specialty}
                  </div>
                  <div style={{ fontSize: '12.5px', fontWeight: 600, color: '#334155', display: 'flex', alignItems: 'center', gap: '6px', marginTop: '4px' }}>
                    <Calendar size={14} color="#2563EB" />
                    <span>{new Date(appt.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} at {appt.time}</span>
                  </div>
                </div>
              ))}
            </div>

            <div style={{
              background: '#EFF6FF',
              border: '1px solid #BFDBFE',
              borderRadius: '8px',
              padding: '12px',
              fontSize: '12.5px',
              color: '#1E40AF',
              lineHeight: 1.4,
              marginBottom: '16px'
            }}>
              <strong>Front Desk Note:</strong> No queue ticket is needed. Please inform the receptionist of your arrival to be placed in the consultation queue.
            </div>

            <button
              type="button"
              onClick={handleStartOver}
              style={{
                width: '100%',
                padding: '11px',
                borderRadius: '8px',
                border: '1px solid #CBD5E1',
                background: '#FFFFFF',
                color: '#334155',
                fontSize: '13.5px',
                fontWeight: 700,
                cursor: 'pointer'
              }}
            >
              Done / Start Over
            </button>
          </div>
        )}

        {/* ── STATE 8: NEW PATIENT BASIC DETAILS FORM ── */}
        {step === 'new_patient_form' && (
          <div>
            <div style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '4px 12px',
              borderRadius: '999px',
              background: 'linear-gradient(135deg, rgba(37,99,235,0.08) 0%, rgba(79,70,229,0.12) 100%)',
              border: '1px solid rgba(37,99,235,0.15)',
              color: '#2563EB',
              fontSize: '11px',
              fontWeight: 800,
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              marginBottom: '8px'
            }}>
              <Sparkles size={12} color="#2563EB" /> Fast Reception Intake
            </div>

            <h2 style={{ fontSize: '22px', fontWeight: 900, color: '#0F172A', margin: '0 0 4px 0', letterSpacing: '-0.02em' }}>
              Patient Information
            </h2>
            <p style={{ margin: '0 0 20px 0', fontSize: '13px', color: '#64748B', lineHeight: 1.45 }}>
              Enter your details to receive your digital reception queue ticket.
            </p>

            <form onSubmit={handleRegisterNewPatient} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                  Full Name *
                </label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <select
                    value={formData.title}
                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                    style={{
                      width: '90px',
                      padding: '11px 10px',
                      borderRadius: '10px',
                      border: '1.5px solid #CBD5E1',
                      fontSize: '13.5px',
                      fontWeight: 700,
                      background: '#F8FAFC',
                      color: '#1E293B',
                      boxSizing: 'border-box',
                      outline: 'none',
                      cursor: 'pointer'
                    }}
                  >
                    <option value="Mr.">Mr.</option>
                    <option value="Mrs.">Mrs.</option>
                    <option value="Ms.">Ms.</option>
                    <option value="Master">Master</option>
                    <option value="Dr.">Dr.</option>
                    <option value="Prof.">Prof.</option>
                  </select>
                  <div style={{ position: 'relative', flex: 1 }}>
                    <input
                      type="text"
                      required
                      placeholder="e.g. John Doe"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      style={{
                        width: '100%',
                        padding: '11px 13px 11px 36px',
                        borderRadius: '10px',
                        border: '1.5px solid #CBD5E1',
                        fontSize: '14px',
                        background: '#FFFFFF',
                        boxSizing: 'border-box',
                        outline: 'none'
                      }}
                    />
                    <User size={16} color="#94A3B8" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
                  </div>
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                  Mobile Number *
                </label>
                <div style={{ position: 'relative' }}>
                  <input
                    type="tel"
                    required
                    maxLength={10}
                    placeholder="10-digit phone number"
                    value={formData.contact}
                    onChange={(e) => setFormData({ ...formData, contact: e.target.value.replace(/\D/g, '') })}
                    style={{
                      width: '100%',
                      padding: '11px 13px 11px 36px',
                      borderRadius: '10px',
                      border: '1.5px solid #CBD5E1',
                      fontSize: '14px',
                      background: '#FFFFFF',
                      boxSizing: 'border-box',
                      outline: 'none'
                    }}
                  />
                  <Phone size={16} color="#94A3B8" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                    Gender *
                  </label>
                  <select
                    value={formData.gender}
                    onChange={(e) => setFormData({ ...formData, gender: e.target.value })}
                    style={{
                      width: '100%',
                      padding: '11px 13px',
                      borderRadius: '10px',
                      border: '1.5px solid #CBD5E1',
                      fontSize: '14px',
                      background: '#FFFFFF',
                      color: '#1E293B',
                      boxSizing: 'border-box',
                      outline: 'none',
                      cursor: 'pointer'
                    }}
                  >
                    <option value="Male">Male</option>
                    <option value="Female">Female</option>
                    <option value="Other">Other</option>
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                    Age (Years)
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="130"
                    placeholder="e.g. 32"
                    value={formData.age}
                    onChange={(e) => setFormData({ ...formData, age: e.target.value })}
                    style={{
                      width: '100%',
                      padding: '11px 13px',
                      borderRadius: '10px',
                      border: '1.5px solid #CBD5E1',
                      fontSize: '14px',
                      background: '#FFFFFF',
                      boxSizing: 'border-box',
                      outline: 'none'
                    }}
                  />
                </div>
              </div>

              {/* Optional Details Expandable Toggle Button */}
              <button
                type="button"
                onClick={() => setShowMoreOptions(!showMoreOptions)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  width: '100%',
                  padding: '11px 14px',
                  borderRadius: '10px',
                  background: showMoreOptions
                    ? 'linear-gradient(135deg, #EFF6FF 0%, #EEF2FF 100%)'
                    : 'linear-gradient(135deg, #F8FAFC 0%, #F1F5F9 100%)',
                  border: showMoreOptions ? '1.5px solid #BFDBFE' : '1.5px dashed #CBD5E1',
                  color: showMoreOptions ? '#1D4ED8' : '#475569',
                  fontSize: '13px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                  marginTop: '2px'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <div style={{
                    width: '22px',
                    height: '22px',
                    borderRadius: '6px',
                    background: showMoreOptions
                      ? 'linear-gradient(135deg, #2563EB 0%, #4F46E5 100%)'
                      : 'linear-gradient(135deg, #64748B 0%, #475569 100%)',
                    color: '#FFFFFF',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '14px',
                    fontWeight: 800,
                    lineHeight: 1
                  }}>
                    {showMoreOptions ? '−' : '+'}
                  </div>
                  <span>{showMoreOptions ? 'Hide Optional Details' : 'Add Optional Details'}</span>
                </div>
                <span style={{ fontSize: '11px', color: showMoreOptions ? '#2563EB' : '#94A3B8', fontWeight: 600 }}>
                  {showMoreOptions ? 'Collapse' : 'Blood Group, Address...'}
                </span>
              </button>

              {/* Expanded Optional Fields Container */}
              {showMoreOptions && (
                <div style={{
                  background: 'linear-gradient(180deg, #F8FAFC 0%, #F1F5F9 100%)',
                  border: '1.5px solid #E2E8F0',
                  borderRadius: '12px',
                  padding: '16px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '12px'
                }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                    <div>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '12px', fontWeight: 700, color: '#334155', marginBottom: '5px' }}>
                        <Droplet size={13} color="#EF4444" /> Blood Group
                      </label>
                      <select
                        value={formData.bloodGroup}
                        onChange={(e) => setFormData({ ...formData, bloodGroup: e.target.value })}
                        style={{
                          width: '100%',
                          padding: '10px 12px',
                          borderRadius: '8px',
                          border: '1.5px solid #CBD5E1',
                          fontSize: '13.5px',
                          background: '#FFFFFF',
                          color: '#1E293B',
                          boxSizing: 'border-box',
                          outline: 'none',
                          cursor: 'pointer'
                        }}
                      >
                        <option value="">Select</option>
                        <option value="A+">A+</option>
                        <option value="A-">A-</option>
                        <option value="B+">B+</option>
                        <option value="B-">B-</option>
                        <option value="AB+">AB+</option>
                        <option value="AB-">AB-</option>
                        <option value="O+">O+</option>
                        <option value="O-">O-</option>
                      </select>
                    </div>

                    <div>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '12px', fontWeight: 700, color: '#334155', marginBottom: '5px' }}>
                        <Calendar size={13} color="#2563EB" /> Date of Birth
                      </label>
                      <input
                        type="date"
                        value={formData.dob}
                        onChange={(e) => {
                          const val = e.target.value;
                          let computedAge = formData.age;
                          if (val) {
                            const birthYear = new Date(val).getFullYear();
                            const nowYear = new Date().getFullYear();
                            if (birthYear > 1900 && birthYear <= nowYear) {
                              computedAge = String(nowYear - birthYear);
                            }
                          }
                          setFormData({ ...formData, dob: val, age: computedAge });
                        }}
                        style={{
                          width: '100%',
                          padding: '9px 12px',
                          borderRadius: '8px',
                          border: '1.5px solid #CBD5E1',
                          fontSize: '13.5px',
                          background: '#FFFFFF',
                          boxSizing: 'border-box',
                          outline: 'none'
                        }}
                      />
                    </div>
                  </div>

                  <div>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '12px', fontWeight: 700, color: '#334155', marginBottom: '5px' }}>
                      <Mail size={13} color="#2563EB" /> Contact Email (Optional)
                    </label>
                    <input
                      type="email"
                      placeholder="patient@example.com (for receipts & reports)"
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      style={{
                        width: '100%',
                        padding: '10px 12px',
                        borderRadius: '8px',
                        border: '1.5px solid #CBD5E1',
                        fontSize: '13.5px',
                        background: '#FFFFFF',
                        boxSizing: 'border-box',
                        outline: 'none'
                      }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '12px', fontWeight: 700, color: '#334155', marginBottom: '5px' }}>
                      <MapPin size={13} color="#0D9488" /> Address / Locality
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Flat 302, Green Park, City"
                      value={formData.address}
                      onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                      style={{
                        width: '100%',
                        padding: '10px 12px',
                        borderRadius: '8px',
                        border: '1.5px solid #CBD5E1',
                        fontSize: '13.5px',
                        background: '#FFFFFF',
                        boxSizing: 'border-box',
                        outline: 'none'
                      }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '12px', fontWeight: 700, color: '#334155', marginBottom: '5px' }}>
                      <HeartPulse size={13} color="#DC2626" /> Known Allergies / Medical Notes
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Penicillin, Pollen or None"
                      value={formData.allergies}
                      onChange={(e) => setFormData({ ...formData, allergies: e.target.value })}
                      style={{
                        width: '100%',
                        padding: '10px 12px',
                        borderRadius: '8px',
                        border: '1.5px solid #CBD5E1',
                        fontSize: '13.5px',
                        background: '#FFFFFF',
                        boxSizing: 'border-box',
                        outline: 'none'
                      }}
                    />
                  </div>
                </div>
              )}

              {/* Verified Arrival Email Badge */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '10px 14px',
                background: '#F0FDF4',
                border: '1px solid #BBF7D0',
                borderRadius: '10px',
                fontSize: '12px',
                color: '#166534'
              }}>
                <CheckCircle size={15} color="#16A34A" style={{ flexShrink: 0 }} />
                <span>Verified Arrival Email: <strong style={{ color: '#0F172A' }}>{email}</strong></span>
              </div>

              <button
                type="submit"
                disabled={actionLoading}
                style={{
                  width: '100%',
                  marginTop: '4px',
                  padding: '13px 18px',
                  borderRadius: '10px',
                  background: actionLoading 
                    ? '#94A3B8' 
                    : 'linear-gradient(135deg, #2563EB 0%, #4F46E5 100%)',
                  color: '#FFFFFF',
                  fontSize: '14.5px',
                  fontWeight: 800,
                  border: 'none',
                  cursor: actionLoading ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  boxShadow: actionLoading ? 'none' : '0 4px 14px rgba(37, 99, 235, 0.35)',
                  transition: 'all 0.2s ease'
                }}
              >
                {actionLoading ? (
                  <>
                    <RefreshCw size={16} className="animate-spin" />
                    Allocating Ticket...
                  </>
                ) : (
                  <>
                    Join Reception Queue
                    <ArrowRight size={16} />
                  </>
                )}
              </button>
            </form>
          </div>
        )}

        {/* ── STATE 9: TICKET ACTIVE & LIVE POSITION MONITOR ── */}
        {step === 'ticket_active' && activeTicket && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: '16px' }}>
            <div style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '4px 12px',
              borderRadius: '20px',
              background: '#DCFCE7',
              border: '1px solid #86EFAC',
              fontSize: '11.5px',
              fontWeight: 700,
              color: '#166534'
            }}>
              <Check size={13} strokeWidth={3} />
              You are in Queue
            </div>

            {/* Ticket Card */}
            <div style={{
              width: '100%',
              background: 'linear-gradient(135deg, #1E293B 0%, #0F172A 100%)',
              borderRadius: '16px',
              padding: '24px 16px',
              color: '#FFFFFF',
              boxSizing: 'border-box',
              boxShadow: '0 10px 25px -5px rgba(15, 23, 42, 0.25)',
              position: 'relative',
              overflow: 'hidden'
            }}>
              <div style={{ fontSize: '12px', letterSpacing: '0.05em', color: '#94A3B8', textTransform: 'uppercase', fontWeight: 700, marginBottom: '4px' }}>
                Reception Ticket Number
              </div>

              {/* Large, responsive ticket display */}
              <div style={{
                fontSize: 'clamp(2.6rem, 10vw, 4rem)',
                fontWeight: 900,
                lineHeight: 1.1,
                letterSpacing: '-0.02em',
                color: '#60A5FA',
                margin: '8px 0'
              }}>
                {activeTicket.ticketDisplay}
              </div>

              <div style={{ fontSize: '13.5px', color: '#E2E8F0', fontWeight: 600 }}>
                {activeTicket.patientName}
              </div>

              <div style={{ marginTop: '14px', paddingTop: '12px', borderTop: '1px solid rgba(255,255,255,0.1)', display: 'flex', justifyContent: 'space-around', fontSize: '11px', color: '#94A3B8' }}>
                <span>Date: <strong style={{ color: '#F1F5F9' }}>{activeTicket.queueDate}</strong></span>
                <span>Type: <strong style={{ color: '#F1F5F9' }}>{activeTicket.patientType}</strong></span>
              </div>
            </div>

            {/* Queue Metrics Display */}
            <div style={{
              width: '100%',
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '12px',
              boxSizing: 'border-box'
            }}>
              <div style={{
                background: '#F8FAFC',
                border: '1px solid #E2E8F0',
                borderRadius: '12px',
                padding: '14px',
                textAlign: 'center'
              }}>
                <div style={{ fontSize: '11px', fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>
                  Currently Serving
                </div>
                <div style={{ fontSize: '20px', fontWeight: 900, color: '#0F172A', marginTop: '4px' }}>
                  {queueMetrics.currentTicketDisplay || patientPosition?.currentServingDisplay || 'Desk Free'}
                </div>
              </div>

              <div style={{
                background: '#F8FAFC',
                border: '1px solid #E2E8F0',
                borderRadius: '12px',
                padding: '14px',
                textAlign: 'center'
              }}>
                <div style={{ fontSize: '11px', fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>
                  Ahead of You
                </div>
                <div style={{ fontSize: '20px', fontWeight: 900, color: '#2563EB', marginTop: '4px' }}>
                  {patientPosition?.peopleAhead !== undefined ? patientPosition.peopleAhead : '—'}
                </div>
              </div>
            </div>

            {/* Instructions box */}
            <div style={{
              width: '100%',
              background: '#F0FDF4',
              border: '1px solid #BBF7D0',
              borderRadius: '10px',
              padding: '12px',
              fontSize: '12.5px',
              color: '#166534',
              lineHeight: 1.4,
              textAlign: 'left'
            }}>
              <strong>Please relax in the waiting area.</strong> Keep this screen open; your number will be called by reception staff shortly.
            </div>

            <button
              type="button"
              onClick={handleStartOver}
              style={{
                background: 'none',
                border: 'none',
                color: '#64748B',
                fontSize: '12px',
                textDecoration: 'underline',
                cursor: 'pointer',
                marginTop: '4px'
              }}
            >
              Check-in with another email
            </button>
          </div>
        )}

      </main>

      {/* ── FOOTER ── */}
      <footer style={{
        marginTop: '24px',
        textAlign: 'center',
        fontSize: '11.5px',
        color: '#94A3B8'
      }}>
        Powered by QUROXA Healthcare &bull; Digital Reception Queue
      </footer>
    </div>
  );
};

export default PublicReceptionQueuePage;
