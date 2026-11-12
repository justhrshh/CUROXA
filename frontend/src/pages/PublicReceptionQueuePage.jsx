import React, { useState, useEffect, useRef } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { io } from 'socket.io-client';
import api, { getSocketUrl } from '../utils/api';
import { 
  CheckCircle, AlertCircle, Clock, Users, ArrowRight, RefreshCw, 
  ChevronRight, Calendar, User, Phone, Shield, Building2, MapPin, 
  HelpCircle, AlertTriangle, ArrowLeft, HeartPulse, Check, Sparkles,
  Droplet, Mail, Plus, Minus, ChevronDown, Stethoscope
} from 'lucide-react';
import curoxaLogo from '../assets/quroxa_new_logo.png';

const PublicReceptionQueuePage = () => {
  const { clinicCode } = useParams();
  const [searchParams] = useSearchParams();

  // App step states: 
  // 'loading' | 'clinic_unavailable' | 'module_disabled' | 'doctor_date_selection' |
  // 'email_entry' | 'otp_entry' | 'ambiguous_match' | 'existing_patient_appointment' | 
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

  // Doctor & Date selection states
  const [doctorsList, setDoctorsList] = useState([]);
  const [selectedDoctorId, setSelectedDoctorId] = useState('');
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [doctorAvailability, setDoctorAvailability] = useState(null);
  const [loadingDoctors, setLoadingDoctors] = useState(false);
  const [loadingAvailability, setLoadingAvailability] = useState(false);

  // User input states
  const [contact, setContact] = useState('');
  const [maskedTarget, setMaskedTarget] = useState('');
  const [verifiedContact, setVerifiedContact] = useState('');
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

        setStep('doctor_date_selection');
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
        } else if (step === 'mobile_entry' || step === 'email_entry' || step === 'otp_entry') {
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

  // 2b. Fetch eligible doctors when clinicCode or selectedDate changes
  const fetchDoctorsForDate = async (targetDate) => {
    if (!clinicCode) return;
    setLoadingDoctors(true);
    try {
      const dateStr = targetDate || selectedDate;
      const res = await api.get(`/reception-queue/clinic/${encodeURIComponent(clinicCode)}/doctors?date=${dateStr}`);
      const docs = res.data?.doctors || [];
      setDoctorsList(docs);

      // Dynamic Doctor Selection Rule:
      // Exactly 1 doctor: automatically select, do not display dropdown
      // Multiple doctors: display dropdown
      if (docs.length === 1) {
        setSelectedDoctorId(docs[0]._id);
      } else if (docs.length > 1) {
        setSelectedDoctorId((prev) => {
          if (prev && docs.some(d => d._id === prev)) return prev;
          return docs[0]._id;
        });
      } else {
        setSelectedDoctorId('');
        setDoctorAvailability(null);
      }
    } catch (err) {
      console.error('Failed to load eligible doctors:', err);
      setDoctorsList([]);
      setSelectedDoctorId('');
      setDoctorAvailability(null);
    } finally {
      setLoadingDoctors(false);
    }
  };

  useEffect(() => {
    if (clinicCode && (step === 'doctor_date_selection' || step === 'loading')) {
      fetchDoctorsForDate(selectedDate);
    }
  }, [clinicCode, selectedDate, step]);

  // 2c. Fetch doctor availability whenever doctor or date changes
  const fetchDoctorAvailability = async (docId, dateStr) => {
    if (!clinicCode || !docId || !dateStr) {
      setDoctorAvailability(null);
      return;
    }
    setLoadingAvailability(true);
    try {
      const res = await api.get(
        `/reception-queue/clinic/${encodeURIComponent(clinicCode)}/doctor-availability?doctorId=${encodeURIComponent(docId)}&date=${encodeURIComponent(dateStr)}`
      );
      if (res.data?.success) {
        setDoctorAvailability(res.data);
      } else {
        setDoctorAvailability(null);
      }
    } catch (err) {
      console.error('Failed to load doctor availability:', err);
      setDoctorAvailability(null);
    } finally {
      setLoadingAvailability(false);
    }
  };

  useEffect(() => {
    if (selectedDoctorId && selectedDate && (step === 'doctor_date_selection' || step === 'mobile_entry' || step === 'email_entry' || step === 'otp_entry')) {
      fetchDoctorAvailability(selectedDoctorId, selectedDate);
    }
  }, [selectedDoctorId, selectedDate, step]);

  // 3. Resend OTP countdown timer
  useEffect(() => {
    let timer;
    if (resendCooldown > 0) {
      timer = setTimeout(() => setResendCooldown(resendCooldown - 1), 1000);
    }
    return () => clearTimeout(timer);
  }, [resendCooldown]);

  // Handler: Dispatch Mobile OTP
  const handleSendOtp = async (e) => {
    if (e) e.preventDefault();
    setErrorMessage('');
    setSuccessNotice('');

    const cleanMobile = contact.replace(/\D/g, '');
    if (!/^[6-9]\d{9}$/.test(cleanMobile)) {
      setErrorMessage('Please enter a valid 10-digit Indian mobile number (e.g. 9876543210).');
      return;
    }

    setActionLoading(true);
    try {
      const res = await api.post('/reception-queue/send-otp', {
        clinicCode,
        contact: cleanMobile
      });

      const masked = res.data.maskedTarget || `+91 ******${cleanMobile.slice(-4)}`;
      setMaskedTarget(masked);
      setSuccessNotice(res.data.message || `A 6-digit verification code has been dispatched via SMS to ${masked}.`);
      setStep('otp_entry');
      setResendCooldown(30);
    } catch (err) {
      setErrorMessage(err.response?.data?.error || 'Failed to dispatch verification code. Please try again.');
    } finally {
      setActionLoading(false);
    }
  };

  // Handler: Verify Mobile OTP
  const handleVerifyOtp = async (e) => {
    if (e) e.preventDefault();
    setErrorMessage('');
    setSuccessNotice('');

    if (!otp || otp.trim().length !== 6) {
      setErrorMessage('Please enter the 6-digit code sent to your mobile.');
      return;
    }

    const cleanMobile = contact.replace(/\D/g, '');

    setActionLoading(true);
    try {
      const res = await api.post('/reception-queue/verify-otp', {
        clinicCode,
        contact: cleanMobile,
        otp: otp.trim(),
        doctorId: selectedDoctorId || undefined,
        targetAppointmentDate: selectedDate || undefined
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
        const verified = data.verifiedContact || cleanMobile;
        setVerifiedContact(verified);
        setFormData(prev => ({ ...prev, contact: verified }));
        setStep('new_patient_form');
      } else {
        setErrorMessage('Unexpected server response. Please try again.');
      }
    } catch (err) {
      if (err.response?.status === 409) {
        setErrorMessage(err.response?.data?.error || 'This doctor has reached the maximum booking capacity for the selected date. Please select another doctor or date.');
      } else {
        setErrorMessage(err.response?.data?.error || 'Invalid or expired verification code.');
      }
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

    const verifiedPhone = verifiedContact || contact.replace(/\D/g, '');
    if (!verifiedPhone || verifiedPhone.length < 10) {
      setErrorMessage('Verified mobile number is missing. Please restart check-in.');
      return;
    }

    // Optional email validation
    if (formData.email && formData.email.trim()) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(formData.email.trim())) {
        setErrorMessage('Please provide a valid email address or leave it empty.');
        return;
      }
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
        contact: verifiedPhone,
        gender: formData.gender,
        age: formData.age ? parseInt(formData.age, 10) : undefined,
        dob: formData.dob || undefined,
        email: formData.email?.trim() || undefined,
        bloodGroup: formData.bloodGroup || undefined,
        address: formData.address?.trim() || undefined,
        allergies: formData.allergies?.trim() || undefined,
        doctorId: selectedDoctorId || undefined,
        targetAppointmentDate: selectedDate || undefined,
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
      if (err.response?.status === 409) {
        setErrorMessage(err.response?.data?.error || 'This doctor has reached the maximum booking capacity for the selected date. Please select another doctor or date.');
      } else {
        setErrorMessage(err.response?.data?.error || 'Failed to submit registration. Please try again.');
      }
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
    setContact('');
    setOtp('');
    setMaskedTarget('');
    setVerifiedContact('');
    setErrorMessage('');
    setSuccessNotice('');
    setFormData({
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
    setShowMoreOptions(false);
    // Return to mobile number verification, preserving clinic and doctor/date context
    setStep(selectedDoctorId ? 'mobile_entry' : 'doctor_date_selection');
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
            flexDirection: 'column',
            gap: '8px',
            fontSize: '13px',
            color: '#991B1B',
            lineHeight: 1.4
          }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
              <AlertCircle size={17} color="#DC2626" style={{ flexShrink: 0, marginTop: '2px' }} />
              <div style={{ flex: 1 }}>{errorMessage}</div>
            </div>
            {errorMessage.includes('capacity') && (
              <button
                type="button"
                onClick={() => {
                  setErrorMessage('');
                  setStep('doctor_date_selection');
                }}
                style={{
                  alignSelf: 'flex-start',
                  padding: '5px 12px',
                  borderRadius: '6px',
                  background: '#DC2626',
                  color: '#FFFFFF',
                  fontSize: '12px',
                  fontWeight: 700,
                  border: 'none',
                  cursor: 'pointer'
                }}
              >
                Change Doctor or Date
              </button>
            )}
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

        {/* ── STATE 3b: DOCTOR & DATE SELECTION (STEP 1) ── */}
        {step === 'doctor_date_selection' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div>
              <h2 style={{ fontSize: '20px', fontWeight: 800, color: '#0F172A', margin: '0 0 6px 0' }}>
                Select Doctor & Date
              </h2>
              <p style={{ margin: 0, fontSize: '13px', color: '#64748B', lineHeight: 1.4 }}>
                Choose your preferred consulting doctor and date to check slot availability.
              </p>
            </div>

            {/* Date Selection */}
            <div>
              <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                Consultation Date
              </label>
              <input
                type="date"
                value={selectedDate}
                min={new Date().toISOString().split('T')[0]}
                onChange={(e) => setSelectedDate(e.target.value)}
                style={{
                  width: '100%',
                  padding: '11px 14px',
                  borderRadius: '8px',
                  border: '1.5px solid #CBD5E1',
                  fontSize: '14px',
                  color: '#0F172A',
                  boxSizing: 'border-box',
                  outline: 'none',
                  background: '#FFFFFF'
                }}
              />
            </div>

            {/* Doctor Selection */}
            <div>
              <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                Consulting Doctor
              </label>

              {loadingDoctors ? (
                <div style={{
                  padding: '16px',
                  borderRadius: '8px',
                  background: '#F8FAFC',
                  border: '1px solid #E2E8F0',
                  textAlign: 'center',
                  fontSize: '13px',
                  color: '#64748B',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px'
                }}>
                  <RefreshCw size={15} className="animate-spin" color="#2563EB" />
                  Loading available doctors...
                </div>
              ) : doctorsList.length === 0 ? (
                <div style={{
                  padding: '14px',
                  borderRadius: '8px',
                  background: '#FEF2F2',
                  border: '1px solid #FECACA',
                  fontSize: '13px',
                  color: '#B91C1C',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}>
                  <AlertCircle size={16} color="#DC2626" style={{ flexShrink: 0 }} />
                  <span>No doctors available for appointments on this date. Please select another date.</span>
                </div>
              ) : doctorsList.length === 1 ? (
                /* Single Doctor: Automatically selected, NO dropdown */
                <div style={{
                  padding: '14px',
                  borderRadius: '10px',
                  background: '#F0FDF4',
                  border: '1.5px solid #86EFAC',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px'
                }}>
                  <div style={{
                    width: 36,
                    height: 36,
                    borderRadius: '50%',
                    background: '#DCFCE7',
                    color: '#15803D',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 800,
                    fontSize: '14px'
                  }}>
                    {doctorsList[0].name ? doctorsList[0].name.charAt(0).toUpperCase() : 'D'}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '14px', fontWeight: 800, color: '#0F172A' }}>
                      {doctorsList[0].name}
                    </div>
                    <div style={{ fontSize: '12px', color: '#166534', fontWeight: 600 }}>
                      {doctorsList[0].specialty || doctorsList[0].department || 'Consultant'}
                    </div>
                  </div>
                  <span style={{
                    fontSize: '10.5px',
                    fontWeight: 700,
                    background: '#DCFCE7',
                    color: '#15803D',
                    padding: '3px 8px',
                    borderRadius: '12px',
                    border: '1px solid #86EFAC'
                  }}>
                    Primary Doctor
                  </span>
                </div>
              ) : (
                /* Multiple Doctors: Display dropdown selector */
                <select
                  value={selectedDoctorId}
                  onChange={(e) => setSelectedDoctorId(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '12px 14px',
                    borderRadius: '8px',
                    border: '1.5px solid #CBD5E1',
                    fontSize: '14px',
                    color: '#0F172A',
                    boxSizing: 'border-box',
                    outline: 'none',
                    background: '#FFFFFF'
                  }}
                >
                  {doctorsList.map((doc) => (
                    <option key={doc._id} value={doc._id}>
                      {doc.name} — {doc.specialty || doc.department || 'General'}
                    </option>
                  ))}
                </select>
              )}
            </div>

            {/* Availability Box */}
            {selectedDoctorId && (
              <div>
                <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                  Slot Availability
                </label>

                {loadingAvailability ? (
                  <div style={{
                    padding: '16px',
                    borderRadius: '8px',
                    background: '#F8FAFC',
                    border: '1px solid #E2E8F0',
                    textAlign: 'center',
                    fontSize: '12.5px',
                    color: '#64748B'
                  }}>
                    Checking real-time capacity...
                  </div>
                ) : doctorAvailability ? (
                  <div style={{
                    background: '#F8FAFC',
                    border: '1.5px solid #E2E8F0',
                    borderRadius: '10px',
                    padding: '14px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '12px'
                  }}>
                    <div style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(3, 1fr)',
                      gap: '8px',
                      textAlign: 'center'
                    }}>
                      <div style={{ background: '#FFFFFF', padding: '8px', borderRadius: '6px', border: '1px solid #E2E8F0' }}>
                        <div style={{ fontSize: '10.5px', color: '#64748B', fontWeight: 600 }}>Daily Capacity</div>
                        <div style={{ fontSize: '16px', fontWeight: 800, color: '#0F172A', marginTop: '2px' }}>
                          {doctorAvailability.dailyCapacity}
                        </div>
                      </div>
                      <div style={{ background: '#FFFFFF', padding: '8px', borderRadius: '6px', border: '1px solid #E2E8F0' }}>
                        <div style={{ fontSize: '10.5px', color: '#64748B', fontWeight: 600 }}>Already Booked</div>
                        <div style={{ fontSize: '16px', fontWeight: 800, color: '#334155', marginTop: '2px' }}>
                          {doctorAvailability.bookedCount}
                        </div>
                      </div>
                      <div style={{ background: '#FFFFFF', padding: '8px', borderRadius: '6px', border: '1px solid #E2E8F0' }}>
                        <div style={{ fontSize: '10.5px', color: '#64748B', fontWeight: 600 }}>Remaining Slots</div>
                        <div style={{
                          fontSize: '16px',
                          fontWeight: 800,
                          color: doctorAvailability.remainingSlots > 0 ? '#0D9488' : '#DC2626',
                          marginTop: '2px'
                        }}>
                          {doctorAvailability.remainingSlots}
                        </div>
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: '1px solid #E2E8F0', paddingTop: '10px' }}>
                      <span style={{ fontSize: '12px', fontWeight: 600, color: '#475569' }}>Booking Status:</span>
                      <span style={{
                        fontSize: '11px',
                        fontWeight: 700,
                        padding: '3px 10px',
                        borderRadius: '12px',
                        background: doctorAvailability.isAvailable && doctorAvailability.remainingSlots > 0 ? '#DCFCE7' : '#FEE2E2',
                        color: doctorAvailability.isAvailable && doctorAvailability.remainingSlots > 0 ? '#15803D' : '#B91C1C',
                        border: doctorAvailability.isAvailable && doctorAvailability.remainingSlots > 0 ? '1px solid #86EFAC' : '1px solid #FECACA'
                      }}>
                        {doctorAvailability.isAvailable && doctorAvailability.remainingSlots > 0 ? '● Available' : '● Full'}
                      </span>
                    </div>

                    {(!doctorAvailability.isAvailable || doctorAvailability.remainingSlots <= 0) && (
                      <div style={{
                        padding: '10px 12px',
                        borderRadius: '6px',
                        background: '#FEF2F2',
                        border: '1px solid #FECACA',
                        fontSize: '12px',
                        color: '#991B1B',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px'
                      }}>
                        <AlertCircle size={14} color="#DC2626" style={{ flexShrink: 0 }} />
                        <span>This doctor has reached the maximum booking capacity for the selected date. Please choose another doctor or date.</span>
                      </div>
                    )}
                  </div>
                ) : null}
              </div>
            )}

            {/* Continue Button */}
            <button
              type="button"
              disabled={
                loadingDoctors ||
                loadingAvailability ||
                !selectedDoctorId ||
                !doctorAvailability ||
                !doctorAvailability.isAvailable ||
                doctorAvailability.remainingSlots <= 0
              }
              onClick={() => {
                setErrorMessage('');
                setStep('mobile_entry');
              }}
              style={{
                width: '100%',
                padding: '13px',
                borderRadius: '8px',
                background: (
                  loadingDoctors ||
                  loadingAvailability ||
                  !selectedDoctorId ||
                  !doctorAvailability ||
                  !doctorAvailability.isAvailable ||
                  doctorAvailability.remainingSlots <= 0
                ) ? '#94A3B8' : '#2563EB',
                color: '#FFFFFF',
                fontSize: '14.5px',
                fontWeight: 700,
                border: 'none',
                cursor: (
                  loadingDoctors ||
                  loadingAvailability ||
                  !selectedDoctorId ||
                  !doctorAvailability ||
                  !doctorAvailability.isAvailable ||
                  doctorAvailability.remainingSlots <= 0
                ) ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                marginTop: '8px',
                boxShadow: (
                  loadingDoctors ||
                  loadingAvailability ||
                  !selectedDoctorId ||
                  !doctorAvailability ||
                  !doctorAvailability.isAvailable ||
                  doctorAvailability.remainingSlots <= 0
                ) ? 'none' : '0 2px 6px rgba(37, 99, 235, 0.25)',
                transition: 'all 0.15s ease'
              }}
            >
              <span>Continue to Check-In</span>
              <ArrowRight size={16} />
            </button>
          </div>
        )}

        {/* ── STATE 4: MOBILE ENTRY (STEP 2 OF VERIFICATION) ── */}
        {(step === 'mobile_entry' || step === 'email_entry') && (
          <div>
            <div style={{ marginBottom: '18px' }}>
              <h2 style={{ fontSize: '20px', fontWeight: 800, color: '#0F172A', margin: '0 0 6px 0' }}>
                Welcome to Reception
              </h2>
              <p style={{ margin: 0, fontSize: '13px', color: '#64748B', lineHeight: 1.4 }}>
                Enter your mobile number to verify your identity and enter the front-desk queue.
              </p>
            </div>

            {/* Selected Doctor & Date Pill */}
            {selectedDoctorId && (
              <div style={{
                background: '#F0FDF4',
                border: '1px solid #BBF7D0',
                borderRadius: '8px',
                padding: '8px 12px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: '14px',
                fontSize: '12px'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Stethoscope size={14} color="#15803D" />
                  <span style={{ fontWeight: 700, color: '#15803D' }}>
                    {doctorsList.find(d => d._id === selectedDoctorId)?.name || 'Doctor'}
                  </span>
                  <span style={{ color: '#64748B' }}>•</span>
                  <span style={{ color: '#475569' }}>{selectedDate}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setStep('doctor_date_selection')}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#2563EB',
                    fontWeight: 700,
                    cursor: 'pointer',
                    fontSize: '11.5px',
                    padding: 0
                  }}
                >
                  Change
                </button>
              </div>
            )}

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
                  Mobile Number *
                </label>
                <div style={{ position: 'relative' }}>
                  <span style={{
                    position: 'absolute',
                    left: '12px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    fontSize: '14px',
                    fontWeight: 700,
                    color: '#475569'
                  }}>
                    +91
                  </span>
                  <input
                    type="tel"
                    inputMode="numeric"
                    maxLength={10}
                    value={contact}
                    onChange={(e) => setContact(e.target.value.replace(/\D/g, ''))}
                    placeholder="9876543210"
                    required
                    autoFocus
                    style={{
                      width: '100%',
                      padding: '12px 14px 12px 48px',
                      borderRadius: '8px',
                      border: '1.5px solid #CBD5E1',
                      fontSize: '15px',
                      letterSpacing: '0.5px',
                      fontWeight: 600,
                      color: '#0F172A',
                      boxSizing: 'border-box',
                      outline: 'none',
                      transition: 'border-color 0.15s ease'
                    }}
                    onFocus={(e) => e.target.style.borderColor = '#2563EB'}
                    onBlur={(e) => e.target.style.borderColor = '#CBD5E1'}
                  />
                </div>
                <div style={{ marginTop: '6px', fontSize: '11.5px', color: '#64748B' }}>
                  We'll send a 6-digit verification code via SMS to your mobile number.
                </div>
              </div>

              <button
                type="submit"
                disabled={actionLoading || contact.replace(/\D/g, '').length !== 10}
                style={{
                  width: '100%',
                  padding: '13px',
                  borderRadius: '8px',
                  background: actionLoading || contact.replace(/\D/g, '').length !== 10 ? '#94A3B8' : '#2563EB',
                  color: '#FFFFFF',
                  fontSize: '14.5px',
                  fontWeight: 700,
                  border: 'none',
                  cursor: actionLoading || contact.replace(/\D/g, '').length !== 10 ? 'not-allowed' : 'pointer',
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
              <span>SMS Gateway • PING4SMS Route 2 • Zero Spam</span>
            </div>
          </div>
        )}

        {/* ── STATE 5: OTP ENTRY ── */}
        {step === 'otp_entry' && (
          <div>
            <button
              type="button"
              onClick={() => { setStep('mobile_entry'); setErrorMessage(''); }}
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
              <ArrowLeft size={14} /> Back to mobile number
            </button>

            <h2 style={{ fontSize: '20px', fontWeight: 800, color: '#0F172A', margin: '0 0 6px 0' }}>
              Verify Your Mobile
            </h2>
            <p style={{ margin: '0 0 16px 0', fontSize: '13px', color: '#64748B', lineHeight: 1.4 }}>
              Enter the 6-digit code sent via SMS to <strong style={{ color: '#0F172A' }}>{maskedTarget || `+91 ******${contact.slice(-4)}`}</strong>.
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
              2. Inform the front desk staff of your name and mobile number.<br />
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
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                  <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 700, color: '#334155' }}>
                    Mobile Number (Verified) *
                  </label>
                  <span style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                    fontSize: '11px',
                    fontWeight: 700,
                    color: '#16A34A',
                    background: '#DCFCE7',
                    padding: '2px 8px',
                    borderRadius: '12px',
                    border: '1px solid #86EFAC'
                  }}>
                    <CheckCircle size={12} color="#16A34A" /> Verified
                  </span>
                </div>
                <div style={{ position: 'relative' }}>
                  <span style={{
                    position: 'absolute',
                    left: '12px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    fontSize: '13.5px',
                    fontWeight: 700,
                    color: '#64748B'
                  }}>
                    +91
                  </span>
                  <input
                    type="tel"
                    readOnly
                    value={formData.contact}
                    style={{
                      width: '100%',
                      padding: '11px 40px 11px 44px',
                      borderRadius: '10px',
                      border: '1.5px solid #CBD5E1',
                      fontSize: '14px',
                      fontWeight: 700,
                      background: '#F1F5F9',
                      color: '#334155',
                      boxSizing: 'border-box',
                      outline: 'none',
                      cursor: 'not-allowed'
                    }}
                  />
                  <Shield size={16} color="#16A34A" style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)' }} />
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

              {/* Verified Arrival Mobile Badge */}
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
                <span>Verified Mobile: <strong style={{ color: '#0F172A' }}>+91 {verifiedContact || contact}</strong></span>
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
              Check in with another mobile number
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
