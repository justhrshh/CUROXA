import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { 
  Users, Stethoscope, Clock, ShieldCheck, Mail, ArrowRight, 
  CheckCircle2, RefreshCw, AlertCircle, ChevronRight, UserCheck, 
  Sparkles, Lock, ArrowLeft, LogOut
} from 'lucide-react';
import api, { getApiBaseUrl } from '../utils/api';
import { socket } from '../utils/socket';
import curoxaLogo from '../assets/quroxa_new_logo.png';

const API_BASE = getApiBaseUrl();

const DoctorQueuePage = () => {
  const { publicQueueId } = useParams();
  const navigate = useNavigate();

  // Screen states: 'public' | 'auth' | 'live'
  const [screenMode, setScreenMode] = useState('public');

  // Doctor & Queue Data
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [queueInfo, setQueueInfo] = useState(null);

  // Authenticated Patient Live Queue Data
  const [patientLiveInfo, setPatientLiveInfo] = useState(null);

  // OTP Auth Form States
  const [emailInput, setEmailInput] = useState('');
  const [otpInput, setOtpInput] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState('');
  const [authSuccess, setAuthSuccess] = useState('');
  const [resendCooldown, setResendCooldown] = useState(0);

  // Timer reference for resend cooldown
  const timerRef = useRef(null);

  // Start Resend Cooldown
  const startCooldown = (seconds = 30) => {
    setResendCooldown(seconds);
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setResendCooldown((prev) => {
        if (prev <= 1) {
          clearInterval(timerRef.current);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  // 1. Fetch Public Doctor & Queue Info
  const fetchPublicQueue = useCallback(async (isSilent = false) => {
    if (!isSilent) setLoading(true);
    else setRefreshing(true);
    setError('');

    try {
      const res = await axios.get(`${API_BASE}/public-queue/${publicQueueId}`);
      setQueueInfo(res.data);
    } catch (err) {
      console.error('Error fetching public queue:', err);
      setError(err.response?.data?.error || 'Unable to load doctor queue. Please verify the QR code.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [publicQueueId]);

  // 2. Fetch Patient-Specific Live Queue (requires patient token)
  const fetchPatientLiveQueue = useCallback(async (isSilent = false) => {
    const token = localStorage.getItem('token');
    if (!token) return;

    if (!isSilent) setLoading(true);
    else setRefreshing(true);

    try {
      const res = await axios.get(`${API_BASE}/public-queue/${publicQueueId}/patient-view`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setPatientLiveInfo(res.data);
      setScreenMode('live');
    } catch (err) {
      console.error('Patient view fetch error:', err);
      // If token expired or unauthorized, drop back to public/auth mode
      if (err.response?.status === 401 || err.response?.status === 403) {
        localStorage.removeItem('token');
        setScreenMode('public');
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [publicQueueId]);

  // Initialize: Check if patient already has active session
  useEffect(() => {
    fetchPublicQueue();

    const token = localStorage.getItem('token');
    const userStr = localStorage.getItem('user');
    let hasPatientRole = false;
    try {
      if (userStr) {
        const u = JSON.parse(userStr);
        if (u.role === 'patient') hasPatientRole = true;
      }
    } catch (e) {}

    if (token && hasPatientRole) {
      // Direct pass-through if patient is already authenticated
      fetchPatientLiveQueue();
    }
  }, [fetchPublicQueue, fetchPatientLiveQueue]);

  // Live Realtime Synchronization via Socket.IO
  useEffect(() => {
    const handleDataChanged = (payload) => {
      if (!payload || payload.type === 'appointments' || payload.type === 'queue') {
        if (screenMode === 'live') {
          fetchPatientLiveQueue(true);
        } else {
          fetchPublicQueue(true);
        }
      }
    };

    if (socket) {
      if (!socket.connected) {
        const token = localStorage.getItem('token');
        if (token) {
          socket.auth = { token };
        } else if (publicQueueId) {
          socket.auth = { publicQueueId };
        }
        socket.connect();
      }
      socket.on('data_changed', handleDataChanged);
    }

    // Secondary automatic polling fallback every 15 seconds
    const pollInterval = setInterval(() => {
      if (screenMode === 'live') {
        fetchPatientLiveQueue(true);
      } else {
        fetchPublicQueue(true);
      }
    }, 15000);

    return () => {
      if (socket) {
        socket.off('data_changed', handleDataChanged);
      }
      clearInterval(pollInterval);
    };
  }, [screenMode, fetchPatientLiveQueue, fetchPublicQueue]);

  // Handle "Continue" Button Click from Public Landing
  const handleContinueClick = () => {
    const token = localStorage.getItem('token');
    if (token && patientLiveInfo) {
      setScreenMode('live');
      return;
    }
    setScreenMode('auth');
    setAuthError('');
    setAuthSuccess('');
  };

  // Handle Send OTP
  const handleSendOtp = async (e) => {
    if (e) e.preventDefault();
    if (!emailInput || !emailInput.includes('@')) {
      setAuthError('Please enter a valid email address.');
      return;
    }

    setAuthLoading(true);
    setAuthError('');
    setAuthSuccess('');

    try {
      const res = await axios.post(`${API_BASE}/public-queue/${publicQueueId}/send-otp`, {
        email: emailInput.trim()
      });
      setAuthSuccess(res.data.message || 'Verification code sent to your email.');
      setOtpSent(true);
      startCooldown(30);
    } catch (err) {
      setAuthError(err.response?.data?.error || 'Failed to send verification code. Please try again.');
    } finally {
      setAuthLoading(false);
    }
  };

  // Handle Verify OTP
  const handleVerifyOtp = async (e) => {
    if (e) e.preventDefault();
    if (!otpInput || otpInput.trim().length < 6) {
      setAuthError('Please enter the 6-digit verification code.');
      return;
    }

    setAuthLoading(true);
    setAuthError('');

    try {
      const res = await axios.post(`${API_BASE}/public-queue/${publicQueueId}/verify-otp`, {
        email: emailInput.trim(),
        otp: otpInput.trim()
      });

      if (res.data.isExisting) {
        // Existing Patient: Authenticate session and load live queue
        localStorage.setItem('token', res.data.token);
        localStorage.setItem('user', JSON.stringify({
          role: 'patient',
          name: res.data.patient.name,
          email: res.data.patient.email,
          uhId: res.data.patient.uhId,
          patientId: res.data.patient.patientId
        }));
        setAuthSuccess('Verification successful! Loading live queue...');
        setTimeout(() => {
          fetchPatientLiveQueue();
        }, 300);
      } else {
        // New Patient: Redirect to existing patient registration flow
        localStorage.setItem('token', res.data.tempToken);
        localStorage.setItem('user', JSON.stringify({
          role: 'patient',
          isNewPatient: true,
          emailOrPhone: res.data.email
        }));
        navigate('/patient-register', {
          state: {
            tempToken: res.data.tempToken,
            emailOrPhone: res.data.email,
            returnToQueue: `/doctor/queue/${publicQueueId}`
          }
        });
      }
    } catch (err) {
      setAuthError(err.response?.data?.error || 'Invalid or expired verification code.');
    } finally {
      setAuthLoading(false);
    }
  };

  // Mask Email for display: e.g. "p****@gmail.com"
  const maskEmail = (email) => {
    if (!email) return '';
    const parts = email.split('@');
    if (parts.length !== 2) return email;
    const name = parts[0];
    const maskedName = name.length > 2 
      ? name[0] + '*'.repeat(Math.min(name.length - 2, 4)) + name[name.length - 1]
      : name[0] + '***';
    return `${maskedName}@${parts[1]}`;
  };

  // Loading Screen
  if (loading && !queueInfo) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4 font-sans select-none">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-slate-600 font-semibold text-sm">Connecting to Live Queue...</p>
        </div>
      </div>
    );
  }

  // Error Screen
  if (error && !queueInfo) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4 font-sans select-none">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8 text-center border border-slate-100">
          <div className="w-14 h-14 bg-red-50 text-red-600 rounded-full flex items-center justify-center mx-auto mb-4">
            <AlertCircle size={28} />
          </div>
          <h2 className="text-xl font-bold text-slate-800 mb-2">QR Code Not Found</h2>
          <p className="text-slate-500 text-sm mb-6">{error}</p>
          <button
            onClick={() => fetchPublicQueue()}
            className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl transition shadow-md shadow-blue-500/20"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  const doctor = patientLiveInfo?.doctor || queueInfo?.doctor;
  const hospital = patientLiveInfo?.hospital || queueInfo?.hospital;
  const queue = patientLiveInfo?.queue || queueInfo?.queue;
  const currentToken = queue?.currentToken;

  return (
    <div className="min-h-screen bg-[#F8FAFC] flex flex-col font-sans select-none">
      {/* ── TOP HEADER ── */}
      <header className="bg-white border-b border-slate-200/80 sticky top-0 z-30 shadow-xs">
        <div className="max-w-md mx-auto px-4 py-3.5 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center text-blue-600 font-black text-sm">
              Q
            </div>
            <div>
              <div className="text-xs font-black tracking-wider text-slate-900 uppercase">QUROXA</div>
              <div className="text-[10px] text-slate-400 font-medium leading-none">Live Queue Portal</div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                if (screenMode === 'live') fetchPatientLiveQueue(true);
                else fetchPublicQueue(true);
              }}
              title="Refresh Queue"
              className="p-2 text-slate-500 hover:text-blue-600 hover:bg-slate-100 rounded-lg transition"
            >
              <RefreshCw size={16} className={refreshing ? 'animate-spin text-blue-600' : ''} />
            </button>
            {screenMode === 'live' && (
              <button
                onClick={() => {
                  localStorage.removeItem('token');
                  setPatientLiveInfo(null);
                  setScreenMode('public');
                }}
                title="Sign out"
                className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition"
              >
                <LogOut size={16} />
              </button>
            )}
          </div>
        </div>
      </header>

      {/* ── MAIN CONTENT CONTAINER (MOBILE-FIRST) ── */}
      <main className="flex-1 w-full max-w-md mx-auto p-4 flex flex-col gap-4">

        {/* ── DOCTOR PROFILE BANNER CARD ── */}
        <div className="bg-white rounded-2xl border border-slate-200/70 p-5 shadow-xs">
          <div className="flex items-start gap-4">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-600 text-white flex items-center justify-center font-bold text-xl shadow-md shadow-blue-500/20 shrink-0 overflow-hidden">
              {doctor?.avatar ? (
                <img src={doctor.avatar} alt={doctor.name} className="w-full h-full object-cover" />
              ) : (
                <Stethoscope size={26} />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 text-[10px] font-bold uppercase tracking-wide mb-1">
                <span>{hospital?.name || 'Healthcare Clinic'}</span>
              </div>
              <h1 className="text-lg font-black text-slate-900 truncate">
                {doctor?.name?.startsWith('Dr') ? doctor.name : `Dr. ${doctor?.name || 'Doctor'}`}
              </h1>
              <p className="text-xs font-semibold text-slate-500 mt-0.5">
                {doctor?.specialty || doctor?.department || 'General Medicine'}
              </p>
            </div>
          </div>
        </div>

        {/* ══════════════════════════════════════════════════
            MODE 1: PUBLIC LANDING VIEW
            ══════════════════════════════════════════════════ */}
        {screenMode === 'public' && (
          <>
            {/* Live Current Token Highlight Box */}
            <div className="bg-gradient-to-br from-slate-900 to-slate-800 rounded-3xl p-6 text-white text-center shadow-lg relative overflow-hidden">
              <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/10 rounded-full blur-2xl -mr-10 -mt-10" />
              <div className="absolute bottom-0 left-0 w-32 h-32 bg-indigo-500/10 rounded-full blur-2xl -ml-10 -mb-10" />

              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-400 text-xs font-bold uppercase tracking-wider mb-3 border border-emerald-500/30">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                Live Queue Active
              </div>

              <div className="text-xs uppercase tracking-widest text-slate-400 font-semibold mb-1">
                Current Token
              </div>
              <div className="text-6xl font-black tracking-tight text-white my-1">
                {currentToken !== null && currentToken !== undefined ? currentToken : '—'}
              </div>

              <div className="mt-4 pt-4 border-t border-slate-700/60 flex items-center justify-around text-xs">
                <div>
                  <div className="text-slate-400 text-[11px]">Doctor Status</div>
                  <div className="font-semibold text-slate-200 mt-0.5">
                    {currentToken ? 'Currently seeing patients' : 'Available'}
                  </div>
                </div>
                <div className="w-px h-6 bg-slate-700" />
                <div>
                  <div className="text-slate-400 text-[11px]">Waiting in Line</div>
                  <div className="font-semibold text-slate-200 mt-0.5">
                    {queue?.waitingCount || 0} Patients
                  </div>
                </div>
              </div>
            </div>

            {/* Privacy Guarantee & Action Notice */}
            <div className="bg-white rounded-2xl border border-slate-200/70 p-5 shadow-xs flex flex-col gap-4 text-center">
              <div className="w-10 h-10 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center mx-auto">
                <ShieldCheck size={20} />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-800 mb-1">Patient Identification Required</h3>
                <p className="text-xs text-slate-500 leading-relaxed max-w-xs mx-auto">
                  To protect patient privacy, your patient identity must be verified to view your token number and queue position.
                </p>
              </div>

              <button
                onClick={handleContinueClick}
                className="w-full py-3.5 bg-blue-600 hover:bg-blue-700 active:scale-[0.99] text-white font-bold text-sm rounded-xl transition shadow-md shadow-blue-500/20 flex items-center justify-center gap-2"
              >
                <span>Continue to Your Queue</span>
                <ArrowRight size={16} />
              </button>
            </div>
          </>
        )}

        {/* ══════════════════════════════════════════════════
            MODE 2: EMAIL OTP AUTHENTICATION
            ══════════════════════════════════════════════════ */}
        {screenMode === 'auth' && (
          <div className="bg-white rounded-2xl border border-slate-200/70 p-6 shadow-xs flex flex-col gap-5">
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  setScreenMode('public');
                  setOtpSent(false);
                  setAuthError('');
                  setAuthSuccess('');
                }}
                className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition"
              >
                <ArrowLeft size={18} />
              </button>
              <div>
                <h2 className="text-base font-bold text-slate-900">Patient Verification</h2>
                <p className="text-xs text-slate-500">Fast and secure Email OTP access</p>
              </div>
            </div>

            {authError && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-xl flex items-start gap-2.5 text-red-700 text-xs">
                <AlertCircle size={16} className="shrink-0 mt-0.5" />
                <div>{authError}</div>
              </div>
            )}

            {authSuccess && (
              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl flex items-start gap-2.5 text-emerald-700 text-xs">
                <CheckCircle2 size={16} className="shrink-0 mt-0.5" />
                <div>{authSuccess}</div>
              </div>
            )}

            {!otpSent ? (
              // Step 1: Request Email
              <form onSubmit={handleSendOtp} className="flex flex-col gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wide mb-1.5">
                    Email Address
                  </label>
                  <div className="relative">
                    <Mail size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                    <input
                      type="email"
                      value={emailInput}
                      onChange={(e) => setEmailInput(e.target.value)}
                      placeholder="patient@example.com"
                      required
                      autoFocus
                      className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition"
                    />
                  </div>
                  <p className="text-[11px] text-slate-400 mt-1.5">
                    We'll send a 6-digit one-time code to authenticate your portal session.
                  </p>
                </div>

                <button
                  type="submit"
                  disabled={authLoading}
                  className="w-full py-3.5 bg-blue-600 hover:bg-blue-700 active:scale-[0.99] disabled:opacity-50 text-white font-bold text-sm rounded-xl transition shadow-md shadow-blue-500/20 flex items-center justify-center gap-2"
                >
                  {authLoading ? (
                    <RefreshCw size={16} className="animate-spin" />
                  ) : (
                    <>
                      <span>Send Verification Code</span>
                      <ArrowRight size={16} />
                    </>
                  )}
                </button>
              </form>
            ) : (
              // Step 2: Enter OTP
              <form onSubmit={handleVerifyOtp} className="flex flex-col gap-4">
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs font-bold text-slate-700 uppercase tracking-wide">
                      6-Digit Code
                    </label>
                    <span className="text-[11px] text-slate-400 font-medium">
                      Sent to {maskEmail(emailInput)}
                    </span>
                  </div>
                  <input
                    type="text"
                    maxLength={6}
                    value={otpInput}
                    onChange={(e) => setOtpInput(e.target.value.replace(/\D/g, ''))}
                    placeholder="______"
                    required
                    autoFocus
                    className="w-full py-3 text-center tracking-[0.5em] text-2xl font-black bg-slate-50 border border-slate-200 rounded-xl text-slate-800 placeholder-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition"
                  />
                  <div className="flex items-center justify-between mt-2 text-xs">
                    <span className="text-slate-400 text-[11px]">Valid for 5 minutes</span>
                    <button
                      type="button"
                      disabled={resendCooldown > 0 || authLoading}
                      onClick={handleSendOtp}
                      className="text-blue-600 hover:underline font-semibold text-xs disabled:opacity-50 disabled:no-underline"
                    >
                      {resendCooldown > 0 ? `Resend code in ${resendCooldown}s` : 'Resend code'}
                    </button>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={authLoading || otpInput.length < 6}
                  className="w-full py-3.5 bg-emerald-600 hover:bg-emerald-700 active:scale-[0.99] disabled:opacity-50 text-white font-bold text-sm rounded-xl transition shadow-md shadow-emerald-500/20 flex items-center justify-center gap-2"
                >
                  {authLoading ? (
                    <RefreshCw size={16} className="animate-spin" />
                  ) : (
                    <>
                      <span>Verify & View Queue</span>
                      <CheckCircle2 size={16} />
                    </>
                  )}
                </button>
              </form>
            )}
          </div>
        )}

        {/* ══════════════════════════════════════════════════
            MODE 3: AUTHENTICATED PATIENT LIVE QUEUE
            ══════════════════════════════════════════════════ */}
        {screenMode === 'live' && patientLiveInfo && (
          <div className="flex flex-col gap-4">

            {/* Patient Header Card */}
            <div className="bg-white rounded-2xl border border-slate-200/70 p-4 shadow-xs flex items-center justify-between">
              <div>
                <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wide">
                  Signed in as
                </div>
                <div className="text-sm font-bold text-slate-800">
                  {patientLiveInfo.patient?.name || 'Verified Patient'}
                </div>
              </div>
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 text-xs font-bold border border-emerald-200/50">
                <UserCheck size={14} />
                <span>Verified</span>
              </div>
            </div>

            {/* KPI Cards: Current Token vs Your Token vs Patients Ahead */}
            <div className="grid grid-cols-3 gap-2.5">
              {/* Card 1: Current Token */}
              <div className="bg-white rounded-2xl border border-slate-200/70 p-3.5 text-center shadow-xs">
                <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                  Current
                </div>
                <div className="text-3xl font-black text-slate-900">
                  {currentToken !== null && currentToken !== undefined ? currentToken : '—'}
                </div>
                <div className="text-[10px] text-emerald-600 font-bold mt-1">In Cabin</div>
              </div>

              {/* Card 2: Your Token */}
              <div className="bg-blue-600 rounded-2xl p-3.5 text-center text-white shadow-md shadow-blue-500/20">
                <div className="text-[10px] font-bold text-blue-200 uppercase tracking-wider mb-1">
                  Your Token
                </div>
                <div className="text-3xl font-black text-white">
                  {patientLiveInfo.patient?.yourToken || '—'}
                </div>
                <div className="text-[10px] text-blue-100 font-bold mt-1">
                  {patientLiveInfo.patient?.yourStatus || 'Not Checked In'}
                </div>
              </div>

              {/* Card 3: Patients Ahead */}
              <div className="bg-white rounded-2xl border border-slate-200/70 p-3.5 text-center shadow-xs">
                <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                  Ahead of You
                </div>
                <div className="text-3xl font-black text-slate-800">
                  {patientLiveInfo.patient?.patientsAhead !== null && patientLiveInfo.patient?.patientsAhead !== undefined
                    ? patientLiveInfo.patient.patientsAhead
                    : '—'}
                </div>
                <div className="text-[10px] text-slate-500 font-bold mt-1">Patients</div>
              </div>
            </div>

            {/* Status Alert if it's the patient's turn NOW */}
            {patientLiveInfo.patient?.yourStatus === 'NOW' && (
              <div className="bg-emerald-500 text-white rounded-2xl p-4 text-center font-bold shadow-lg shadow-emerald-500/30 animate-pulse">
                <div className="text-sm uppercase tracking-wide">It is your turn!</div>
                <div className="text-xs font-normal text-emerald-100 mt-0.5">
                  Please proceed into the doctor's consultation room now.
                </div>
              </div>
            )}

            {/* Anonymized Queue Order Table */}
            <div className="bg-white rounded-2xl border border-slate-200/70 p-4 shadow-xs">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-xs font-black text-slate-800 uppercase tracking-wider">
                  Live Queue Sequence
                </h3>
                <span className="text-[11px] text-slate-400">Tokens only · Anonymized</span>
              </div>

              {patientLiveInfo.queue?.tokens && patientLiveInfo.queue.tokens.length > 0 ? (
                <div className="divide-y divide-slate-100 flex flex-col">
                  {patientLiveInfo.queue.tokens.map((item) => {
                    const isYou = item.isYou;
                    const isNow = item.status === 'NOW';
                    const isDone = item.status === 'Completed';

                    return (
                      <div
                        key={item.tokenNumber}
                        className={`py-2.5 px-3 rounded-xl flex items-center justify-between transition ${
                          isYou 
                            ? 'bg-blue-50 border border-blue-200/80 my-0.5' 
                            : isNow 
                            ? 'bg-emerald-50/60 my-0.5' 
                            : 'hover:bg-slate-50'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-black text-sm ${
                            isYou 
                              ? 'bg-blue-600 text-white shadow-xs' 
                              : isNow 
                              ? 'bg-emerald-600 text-white shadow-xs' 
                              : isDone 
                              ? 'bg-slate-100 text-slate-400' 
                              : 'bg-slate-100 text-slate-700'
                          }`}>
                            {item.tokenDisplay}
                          </div>
                          <div className="text-xs font-bold text-slate-700">
                            Token #{item.tokenDisplay}
                            {isYou && (
                              <span className="ml-2 px-1.5 py-0.5 bg-blue-600 text-white text-[9px] font-black rounded uppercase">
                                YOU
                              </span>
                            )}
                          </div>
                        </div>

                        <div>
                          {isNow ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-extrabold uppercase tracking-wide">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 animate-ping" />
                              NOW
                            </span>
                          ) : isDone ? (
                            <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 text-[10px] font-semibold">
                              Completed
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200/60 text-[10px] font-semibold">
                              Waiting
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="py-8 text-center text-slate-400 text-xs">
                  No active tokens in queue at this moment.
                </div>
              )}
            </div>

            {/* Patient Portal Quick Navigation */}
            <div className="text-center pt-2">
              <button
                onClick={() => navigate('/patient')}
                className="text-xs font-semibold text-blue-600 hover:text-blue-700 hover:underline inline-flex items-center gap-1"
              >
                <span>Go to full Patient Portal Dashboard</span>
                <ChevronRight size={14} />
              </button>
            </div>
          </div>
        )}

      </main>

      {/* ── FOOTER ── */}
      <footer className="w-full max-w-md mx-auto p-4 text-center text-[11px] text-slate-400 border-t border-slate-200/60 mt-auto">
        <div>Powered by <strong>QUROXA</strong> Intelligent Healthcare Engine</div>
        <div className="text-[10px] text-slate-400/80 mt-0.5">Strict privacy mode enabled. All queue data is server-authoritative.</div>
      </footer>
    </div>
  );
};

export default DoctorQueuePage;
