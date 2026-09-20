import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import api from '../utils/api';
import { 
  Eye, EyeOff, AlertCircle, CheckCircle, User, Lock, ArrowRight, 
  Calendar, FlaskConical, BarChart3, Pill, ShieldCheck, Mail, KeyRound, Heart
} from 'lucide-react';
import { OTPField, OTPFieldInput } from '../components/ui/otp-field';
import quroxaRefBg from '../assets/quroxa_reference_bg.jpg';
import curoxaLogo from '../assets/quroxa_new_logo.png';
import { usePortalBranding, HospitalBrandLogo } from '../context/PortalBrandingContext';

const OTP_LENGTH = 6;
const OTP_SLOT_KEYS = Array.from({ length: OTP_LENGTH }, (_, i) => `otp-slot-${i}`);

const Login = () => {
  const portalBranding = usePortalBranding();
  const hospital = portalBranding?.hospital;
  const portalHospitalId = hospital?.hospitalId || portalBranding?.hospitalId || null;

  const isSignUp = false;

  // Sign In states
  const [staffId, setStaffId] = useState('');
  const [password, setPassword] = useState('');
  
  // OTP Login states
  const [loginMethod, setLoginMethod] = useState('password'); // 'password' or 'otp'
  const [emailOrPhone, setEmailOrPhone] = useState('');
  const [loginOtp, setLoginOtp] = useState('');
  const [otpSent, setOtpSent] = useState(false);

  const [tenantId, setTenantId] = useState('city_hospital');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // Google Sign-In state & config
  const [showGoogleModal, setShowGoogleModal] = useState(false);
  const [googleModalTab, setGoogleModalTab] = useState('instructions');

  const rawGoogleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
  const googleClientId = rawGoogleClientId ? rawGoogleClientId.trim() : '';
  const isGoogleConfigured = googleClientId && googleClientId !== 'YOUR_GOOGLE_CLIENT_ID' && !googleClientId.startsWith('YOUR_');

  // Feedback states
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const [showServerSplash, setShowServerSplash] = useState(false);
  const [showPasswordChangedModal, setShowPasswordChangedModal] = useState(false);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const portalQuery = searchParams.get('portal');
  useEffect(() => {
    if (portalQuery && /^HSP-[A-Z0-9]{6}$/i.test(portalQuery.trim())) {
      navigate(`/portal/${portalQuery.trim().toUpperCase()}`, { replace: true });
    }
  }, [portalQuery, navigate]);

  const handlePatientPortalNavigation = () => {
    const activeHospitalId = hospital?.hospitalId;
    if (activeHospitalId && /^HSP-[A-Z0-9]{6}$/i.test(activeHospitalId)) {
      sessionStorage.setItem('curoxa_return_portal', activeHospitalId.toUpperCase());
      navigate(`/patient/login?portal=${encodeURIComponent(activeHospitalId.toUpperCase())}`);
    } else {
      sessionStorage.removeItem('curoxa_return_portal');
      navigate('/patient/login');
    }
  };

  useEffect(() => {
    localStorage.removeItem('curoxa_superadmin_session');
    if (!hospital) {
      localStorage.removeItem('curoxa_active_portal_id');
      try {
        sessionStorage.removeItem('curoxa_return_portal');
      } catch (e) {}
      document.title = 'Quroxa - Healthcare Dashboard';
      const faviconEl = document.getElementById('curoxa-dynamic-favicon') || document.querySelector("link[rel*='icon']");
      if (faviconEl) {
        faviconEl.setAttribute('href', '/curoxa_icon_logo.png');
      }
    }
    const reason = localStorage.getItem('logout_reason');
    if (reason === 'password_changed') {
      setShowPasswordChangedModal(true);
      localStorage.removeItem('logout_reason');
    } else if (reason === 'session_expired' || reason === 'backend_disconnected') {
      localStorage.removeItem('logout_reason');
    }
  }, [hospital]);

  // Forgot Password modal states
  const [showForgotModal, setShowForgotModal] = useState(false);
  const [forgotStep, setForgotStep] = useState(1);
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotOtp, setForgotOtp] = useState('');
  const [forgotNewPassword, setForgotNewPassword] = useState('');
  const [forgotConfirmPassword, setForgotConfirmPassword] = useState('');
  const [forgotError, setForgotError] = useState('');
  const [forgotSuccess, setForgotSuccess] = useState('');

  // Check if user is already logged in
  useEffect(() => {
    const token = localStorage.getItem('token');
    let user = {};
    try {
      const storedUser = localStorage.getItem('user');
      user = (storedUser && storedUser !== 'undefined') ? JSON.parse(storedUser) : {};
    } catch (e) {
      console.error('Failed to parse user from localStorage:', e);
    }
    
    if (token && user && user.role) {
      switch (user.role) {
        case 'admin': navigate('/admin'); break;
        case 'superadmin':
        case 'super_admin': navigate('/super-admin'); break;
        case 'doctor': navigate('/doctor'); break;
        case 'receptionist': navigate('/receptionist'); break;
        case 'patient': navigate('/patient'); break;
        case 'lab': navigate('/lab'); break;
        case 'pharmacy': navigate('/pharmacy'); break;
        case 'hr': navigate('/hr'); break;
        case 'dpo': navigate('/dpo'); break;
        default: break;
      }
    }
  }, [navigate]);

  useEffect(() => {
    if (window.location.pathname.startsWith('/portal/')) return;
    const prewarm = async () => {
      try {
        const [meds, docs] = await Promise.allSettled([
          api.get('/medicines'),
          api.get('/auth/doctors')
        ]);
        if (meds.status === 'fulfilled' && typeof sessionStorage !== 'undefined') {
          try { sessionStorage.setItem('meds:cache', JSON.stringify(meds.value.data)); } catch (_) {}
        }
        if (docs.status === 'fulfilled' && typeof sessionStorage !== 'undefined') {
          try { sessionStorage.setItem('doctors:cache', JSON.stringify(docs.value.data)); } catch (_) {}
        }
      } catch (_) {}
    };
    prewarm();
  }, []);

  useEffect(() => {
    if (window.lucide) {
      window.lucide.createIcons();
    }
  }, [isSignUp, showPassword, showConfirmPassword, showGoogleModal, showForgotModal]);

  const handleGoogleCredentialResponse = async (response) => {
    setError('');
    setLoading(true);
    try {
      const res = await api.post('/auth/google-login', {
        credential: response.credential,
        ...(portalHospitalId ? { hospitalId: portalHospitalId } : {})
      });
      const { token, user, tenantModules, doctorClinicalMode, plan, subscriptionRestricted, subscriptionStatus, subscriptionDaysRemaining } = res.data;
      
      localStorage.setItem('token', token);
      localStorage.setItem('user', JSON.stringify(user));
      localStorage.setItem('tenantId', user.tenantId || 'city_hospital');
      localStorage.setItem('tenantModules', JSON.stringify(tenantModules || {}));
      localStorage.setItem('doctorClinicalMode', doctorClinicalMode || 'ONLINE');
      localStorage.setItem('plan', plan || '');
      localStorage.setItem('subscriptionRestricted', subscriptionRestricted ? 'true' : 'false');
      localStorage.setItem('subscriptionStatus', subscriptionStatus || 'ACTIVE');
      if (subscriptionDaysRemaining !== undefined && subscriptionDaysRemaining !== null) {
        localStorage.setItem('subscriptionDaysRemaining', String(subscriptionDaysRemaining));
      }

      window.dispatchEvent(new CustomEvent('curoxa_login_success'));
      setSuccess('Logged in via Google successfully!');
      setTimeout(() => {
        switch (user.role) {
          case 'admin': navigate('/admin'); break;
          case 'superadmin':
          case 'super_admin': navigate('/super-admin'); break;
          case 'doctor': navigate('/doctor'); break;
          case 'receptionist': navigate('/receptionist'); break;
          case 'patient': navigate('/patient'); break;
          case 'lab': navigate('/lab'); break;
          case 'pharmacy': navigate('/pharmacy'); break;
          case 'hr': navigate('/hr'); break;
          default: navigate('/'); break;
        }
      }, 1000);
    } catch (err) {
      setError(err.response?.data?.error || 'Google Authentication failed');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!isSignUp && isGoogleConfigured && typeof google !== 'undefined') {
      const timer = setTimeout(() => {
        const btnContainer = document.getElementById("googleSignInHidden");
        if (btnContainer) {
          try {
            google.accounts.id.initialize({
              client_id: googleClientId,
              callback: handleGoogleCredentialResponse,
              cancel_on_tap_outside: false
            });
            google.accounts.id.renderButton(
              btnContainer,
              { 
                theme: "outline", 
                size: "large", 
                width: 250, 
                text: "signin_with",
                shape: "rectangular"
              }
            );
          } catch (err) {
            console.error("Google login rendering error:", err);
          }
        }
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [isSignUp, isGoogleConfigured, loginMethod]);

  const handleGoogleBtnClick = () => {
    if (isGoogleConfigured && typeof google !== 'undefined') {
      try {
        google.accounts.id.prompt();
        return;
      } catch (e) {}
    }
    setShowGoogleModal(true);
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    setShowServerSplash(true);
    try {
      const response = await api.post('/auth/login', {
        staff_id: staffId,
        password: password,
        ...(portalHospitalId ? { hospitalId: portalHospitalId } : {})
      });
      const { token, user, tenantModules, doctorClinicalMode, plan, subscriptionRestricted, subscriptionStatus, subscriptionDaysRemaining } = response.data;
      
      localStorage.setItem('token', token);
      localStorage.setItem('user', JSON.stringify(user));
      localStorage.setItem('tenantId', user.tenantId || 'city_hospital');
      localStorage.setItem('tenantModules', JSON.stringify(tenantModules || {}));
      localStorage.setItem('doctorClinicalMode', doctorClinicalMode || 'ONLINE');
      localStorage.setItem('plan', plan || '');
      localStorage.setItem('subscriptionRestricted', subscriptionRestricted ? 'true' : 'false');
      localStorage.setItem('subscriptionStatus', subscriptionStatus || 'ACTIVE');
      if (subscriptionDaysRemaining !== undefined && subscriptionDaysRemaining !== null) {
        localStorage.setItem('subscriptionDaysRemaining', String(subscriptionDaysRemaining));
      }

      window.dispatchEvent(new CustomEvent('curoxa_login_success'));
      
      switch (user.role) {
        case 'admin': navigate('/admin'); break;
        case 'superadmin':
        case 'super_admin': navigate('/super-admin'); break;
        case 'doctor': navigate('/doctor'); break;
        case 'receptionist': navigate('/receptionist'); break;
        case 'patient': navigate('/patient'); break;
        case 'lab': navigate('/lab'); break;
        case 'pharmacy': navigate('/pharmacy'); break;
        case 'hr': navigate('/hr'); break;
        case 'dpo': navigate('/dpo'); break;
        default: navigate('/'); break;
      }
    } catch (err) {
      setError(err.response?.data?.error || 'An error occurred during login');
    } finally {
      setShowServerSplash(false);
      setLoading(false);
    }
  };

  const handleSendOtp = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);
    try {
      await api.post('/auth/send-login-otp', {
        emailOrPhone: emailOrPhone,
        ...(portalHospitalId ? { hospitalId: portalHospitalId } : {})
      });
      setSuccess('One-Time Password has been generated and sent.');
      setOtpSent(true);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to send OTP. Please verify your details.');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyLoginOtp = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);
    setShowServerSplash(true);
    try {
      const response = await api.post('/auth/login-with-otp', {
        emailOrPhone: emailOrPhone,
        otp: loginOtp,
        ...(portalHospitalId ? { hospitalId: portalHospitalId } : {})
      });
      const { token, user, tenantModules, doctorClinicalMode, plan, subscriptionRestricted, subscriptionStatus, subscriptionDaysRemaining } = response.data;
      
      localStorage.setItem('token', token);
      localStorage.setItem('user', JSON.stringify(user));
      localStorage.setItem('tenantId', user.tenantId || 'city_hospital');
      localStorage.setItem('tenantModules', JSON.stringify(tenantModules || {}));
      localStorage.setItem('doctorClinicalMode', doctorClinicalMode || 'ONLINE');
      localStorage.setItem('plan', plan || '');
      localStorage.setItem('subscriptionRestricted', subscriptionRestricted ? 'true' : 'false');
      localStorage.setItem('subscriptionStatus', subscriptionStatus || 'ACTIVE');
      if (subscriptionDaysRemaining !== undefined && subscriptionDaysRemaining !== null) {
        localStorage.setItem('subscriptionDaysRemaining', String(subscriptionDaysRemaining));
      }

      window.dispatchEvent(new CustomEvent('curoxa_login_success'));
      setSuccess('Verification successful!');
      setTimeout(() => {
        switch (user.role) {
          case 'admin': navigate('/admin'); break;
          case 'superadmin':
          case 'super_admin': navigate('/super-admin'); break;
          case 'doctor': navigate('/doctor'); break;
          case 'receptionist': navigate('/receptionist'); break;
          case 'patient': navigate('/patient'); break;
          case 'lab': navigate('/lab'); break;
          case 'pharmacy': navigate('/pharmacy'); break;
          case 'hr': navigate('/hr'); break;
          case 'dpo': navigate('/dpo'); break;
          default: navigate('/'); break;
        }
      }, 1000);
    } catch (err) {
      setError(err.response?.data?.error || 'Invalid or expired OTP');
    } finally {
      setShowServerSplash(false);
      setLoading(false);
    }
  };

  const handleRequestOtp = async (e) => {
    e.preventDefault();
    setForgotError('');
    setForgotSuccess('');
    setLoading(true);
    try {
      const response = await api.post('/auth/forgot-password', {
        email: forgotEmail,
        tenantId: hospital?.code || undefined
      });
      setForgotSuccess(response.data.message
        ? `${response.data.message} (Please check your Spam/Junk folder if not received.)`
        : 'OTP sent successfully! Please check your inbox.');
      setForgotStep(2);
    } catch (err) {
      setForgotError(err.response?.data?.error || 'Failed to request OTP. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtpAndReset = async (e) => {
    e.preventDefault();
    setForgotError('');
    setForgotSuccess('');
    if (forgotNewPassword !== forgotConfirmPassword) {
      setForgotError('Passwords do not match');
      return;
    }
    setLoading(true);
    try {
      const response = await api.post('/auth/verify-otp', {
        email: forgotEmail,
        otp: forgotOtp,
        newPassword: forgotNewPassword,
        tenantId: hospital?.code || undefined
      });
      setForgotSuccess(response.data.message || 'Password reset successfully!');
      setTimeout(() => {
        setShowForgotModal(false);
      }, 2000);
    } catch (err) {
      setForgotError(err.response?.data?.error || 'Failed to reset password. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full relative flex flex-col justify-between text-slate-900 font-sans overflow-x-hidden bg-[#f4f9fd] select-none selection:bg-blue-100">

      {/* ── 1. BACKGROUND HEALTHCARE PHOTOGRAPH WITH STETHOSCOPE ── */}
      <div 
        className="absolute inset-0 w-full h-full pointer-events-none bg-no-repeat bg-cover z-0"
        style={{
          backgroundImage: `url(${quroxaRefBg})`,
          backgroundPosition: 'center center',
          imageRendering: '-webkit-optimize-contrast'
        }}
      />

      {/* ── 3. MOBILE ADAPTIVE BACKDROP ── */}
      <div className="lg:hidden absolute inset-0 bg-[#f8fbfe]/88 backdrop-blur-[2px] pointer-events-none z-[1]" />

      {/* Hidden Container for Google OAuth */}
      <div id="googleSignInHidden" className="absolute -left-[9999px] -top-[9999px] opacity-0 pointer-events-none w-0 h-0 overflow-hidden" />

      {/* ── 6. HEADER (Item 2) ── */}
      <header className="lg:absolute top-0 left-0 right-0 z-20 w-full max-w-[1600px] mx-auto px-8 sm:px-12 lg:px-16 pt-7 sm:pt-9 flex items-center justify-between pointer-events-none">
        {/* Top-Left Logo */}
        <div className="pointer-events-auto">
          {hospital ? (
            <div className="flex items-center gap-3.5">
              <HospitalBrandLogo hospital={hospital} size={50} borderRadius={14} fontSize={19} />
              <div>
                <h2 className="text-xl font-black text-slate-900 tracking-tight leading-tight">
                  {hospital.name}
                </h2>
                <span className="text-[11px] font-bold text-blue-600 bg-blue-50 px-2.5 py-0.5 rounded-full border border-blue-100 uppercase tracking-wider">
                  Hospital Portal • {hospital.hospitalId}
                </span>
              </div>
            </div>
          ) : (
            <img 
              src={curoxaLogo} 
              alt="Quroxa Clinic Management System" 
              className="h-18 sm:h-22 lg:h-[94px] w-auto object-contain drop-shadow-sm" 
              onError={(e) => { e.target.src = '/curoxa_logo_transparent.png'; }} 
            />
          )}
        </div>
      </header>

      {/* ── 7. MAIN HERO & LOGIN SECTION (Item 1, 3, 4, 7, 9) ── */}
      <main className="relative z-10 w-full max-w-[1600px] mx-auto flex-1 min-h-screen flex flex-col lg:flex-row items-center justify-between px-8 sm:px-12 lg:px-16 py-6 lg:py-8 gap-8 lg:gap-12">

        {/* ── LEFT HERO SECTION (Item 3, 4, 7) ── */}
        <div className="w-full lg:w-[56%] flex flex-col justify-center pt-2 lg:pt-14 pb-4">
          
          {/* ── TEXT & 6 ICONS CONTAINER WITH LOCALIZED SOFT WHITE BLUR ── */}
          <div className="relative max-w-[580px] xl:max-w-[620px]">
            
            {/* White soft blur layer strictly behind this block with rich whiteness and seamless feathered edges on all sides */}
            <div 
              className="hidden lg:block absolute -left-[360px] -right-[360px] -top-64 -bottom-24 pointer-events-none -z-10"
              style={{
                background: 'radial-gradient(ellipse 48% 54% at 50% 56%, rgba(255, 255, 255, 0.98) 0%, rgba(255, 255, 255, 0.92) 36%, rgba(255, 255, 255, 0.62) 60%, rgba(255, 255, 255, 0.22) 80%, rgba(255, 255, 255, 0.04) 94%, transparent 100%)',
                backdropFilter: 'blur(16px)',
                WebkitBackdropFilter: 'blur(16px)',
                maskImage: 'radial-gradient(ellipse 48% 54% at 50% 56%, black 0%, black 36%, rgba(0, 0, 0, 0.82) 58%, rgba(0, 0, 0, 0.32) 78%, rgba(0, 0, 0, 0.06) 94%, transparent 100%)',
                WebkitMaskImage: 'radial-gradient(ellipse 48% 54% at 50% 56%, black 0%, black 36%, rgba(0, 0, 0, 0.82) 58%, rgba(0, 0, 0, 0.32) 78%, rgba(0, 0, 0, 0.06) 94%, transparent 100%)'
              }}
            />

            {/* Eyebrow & Headlines */}
            <div>
              <p className="text-[11px] font-bold tracking-[0.22em] uppercase text-[#0ea5e9] mb-3">
                WELCOME TO QUROXA
              </p>
              
              <h1 className="text-2xl sm:text-3xl lg:text-[34px] xl:text-[38px] 2xl:text-[42px] font-black text-[#0f1f3d] tracking-tight leading-[1.16] sm:whitespace-nowrap">
                {hospital ? 'Clinical Workspace.' : 'Simplify Clinic Operations.'}
              </h1>
              
              <h1 className="text-2xl sm:text-3xl lg:text-[34px] xl:text-[38px] 2xl:text-[42px] font-black text-[#0ea5e9] tracking-tight leading-[1.16] mt-0.5 sm:whitespace-nowrap">
                {hospital ? 'Connected Care.' : 'Focus on Better Care.'}
              </h1>

              <p className="mt-4 text-[14px] sm:text-[15px] text-slate-500 font-normal leading-relaxed max-w-[480px]">
                {hospital ? (
                  <>Sign in to access your authorized clinical workspace at <span className="font-semibold text-slate-800">{hospital.name}</span>. Powered by Quroxa EMR platform.</>
                ) : (
                  'All-in-one Clinic Management System for a smoother workflow, happier patients and healthier communities.'
                )}
              </p>
            </div>

            {/* ── 6 FEATURE ICONS (Item 4: Exact 3 columns × 2 rows) ── */}
            {!hospital && (
              <div className="mt-9 grid grid-cols-3 gap-x-6 sm:gap-x-8 gap-y-6 max-w-[430px]">
                
                {/* Row 1, Col 1: Patient Management */}
                <div className="flex flex-col items-center text-center gap-2">
                  <div className="w-12 h-12 rounded-2xl bg-[#e0f2fe] flex items-center justify-center shadow-sm text-[#0ea5e9]">
                    <User className="w-5 h-5" />
                  </div>
                  <span className="text-[12px] font-semibold text-slate-700 leading-tight">
                    Patient<br />Management
                  </span>
                </div>

                {/* Row 1, Col 2: Appointment Scheduling */}
                <div className="flex flex-col items-center text-center gap-2">
                  <div className="w-12 h-12 rounded-2xl bg-[#dcfce7] flex items-center justify-center shadow-sm text-[#16a34a]">
                    <Calendar className="w-5 h-5" />
                  </div>
                  <span className="text-[12px] font-semibold text-slate-700 leading-tight">
                    Appointment<br />Scheduling
                  </span>
                </div>

                {/* Row 1, Col 3: Lab & Diagnostics Integration */}
                <div className="flex flex-col items-center text-center gap-2">
                  <div className="w-12 h-12 rounded-2xl bg-[#f3e8ff] flex items-center justify-center shadow-sm text-[#9333ea]">
                    <FlaskConical className="w-5 h-5" />
                  </div>
                  <span className="text-[12px] font-semibold text-slate-700 leading-tight">
                    Lab &amp; Diagnostics<br />Integration
                  </span>
                </div>

                {/* Row 2, Col 1: Reports & Analytics */}
                <div className="flex flex-col items-center text-center gap-2">
                  <div className="w-12 h-12 rounded-2xl bg-[#ffedd5] flex items-center justify-center shadow-sm text-[#ea580c]">
                    <BarChart3 className="w-5 h-5" />
                  </div>
                  <span className="text-[12px] font-semibold text-slate-700 leading-tight">
                    Reports &amp;<br />Analytics
                  </span>
                </div>

                {/* Row 2, Col 2: Pharmacy Management */}
                <div className="flex flex-col items-center text-center gap-2">
                  <div className="w-12 h-12 rounded-2xl bg-[#ccfbf1] flex items-center justify-center shadow-sm text-[#0d9488]">
                    <Pill className="w-5 h-5" />
                  </div>
                  <span className="text-[12px] font-semibold text-slate-700 leading-tight">
                    Pharmacy<br />Management
                  </span>
                </div>

                {/* Row 2, Col 3: Secure & Reliable */}
                <div className="flex flex-col items-center text-center gap-2">
                  <div className="w-12 h-12 rounded-2xl bg-[#e0e7ff] flex items-center justify-center shadow-sm text-[#2563eb]">
                    <ShieldCheck className="w-5 h-5" />
                  </div>
                  <span className="text-[12px] font-semibold text-slate-700 leading-tight">
                    Secure &amp;<br />Reliable
                  </span>
                </div>

              </div>
            )}
          </div>

          {/* ── BOTTOM-LEFT TRUST ELEMENT (Item 7: Heart icon + 2 lines) ── */}
          <div className="mt-12 flex items-center gap-2.5 text-slate-600">
            <div className="w-8 h-8 rounded-full bg-white/90 shadow-sm border border-slate-100 flex items-center justify-center text-[#0ea5e9]">
              <Heart className="w-4 h-4" />
            </div>
            <div className="text-[12px] sm:text-[13px] font-semibold leading-tight text-slate-600">
              <span>Trusted by Clinics.</span><br />
              <span>Loved by Patients.</span>
            </div>
          </div>

        </div>

        {/* ── RIGHT LOGIN CARD (Item 9: ~520px wide white rounded card) ── */}
        <div className="w-full lg:w-[44%] xl:w-[42%] flex flex-col items-center lg:items-end my-auto">

          <div className="w-full max-w-[500px] xl:max-w-[515px] bg-white rounded-3xl shadow-[0_25px_70px_rgba(15,31,61,0.08)] border border-slate-100/90 p-7 sm:p-8 lg:p-9 relative z-10">
            
            {/* Centered Quroxa Logo */}
            <div className="flex flex-col items-center mb-5">
              {hospital ? (
                <>
                  <HospitalBrandLogo hospital={hospital} size={56} borderRadius={16} fontSize={22} className="mb-2 shadow-sm" />
                  <h2 className="text-xl font-black text-slate-900 tracking-tight text-center">
                    {hospital.name}
                  </h2>
                  <div className="flex items-center gap-1.5 mt-1">
                    <span className="inline-block w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                    <span className="text-[11px] font-bold text-slate-500 font-mono uppercase tracking-wider">
                      {hospital.hospitalId}
                    </span>
                  </div>
                </>
              ) : (
                <img 
                  src={curoxaLogo} 
                  alt="Quroxa" 
                  className="h-14 sm:h-16 lg:h-[66px] w-auto object-contain mx-auto" 
                  onError={(e) => { e.target.src = '/curoxa_logo_transparent.png'; }} 
                />
              )}
            </div>

            {/* Left-Aligned "Sign In" and Subtitle (Exact hierarchy from reference) */}
            <div className="text-left mb-5">
              <h2 className="text-[22px] font-bold text-[#0f1f3d] tracking-tight">
                {hospital ? 'Staff & Clinical Sign In' : 'Sign In'}
              </h2>
              <p className="text-[14px] sm:text-[15px] text-slate-500 font-normal mt-1.5">
                {hospital
                  ? 'Enter your credentials to access this hospital portal'
                  : 'Enter your credentials to access your account'}
              </p>
            </div>

            {/* Error / Success Feedback */}
            {error && (
              <div className="mb-4 p-3.5 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm font-medium flex items-start gap-2.5">
                <AlertCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
                <span className="flex-1 leading-snug">{error}</span>
              </div>
            )}
            {success && (
              <div className="mb-4 p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm font-medium flex items-start gap-2.5">
                <CheckCircle className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                <span className="flex-1 leading-snug">{success}</span>
              </div>
            )}

            {/* ── PASSWORD LOGIN FORM ── */}
            {loginMethod === 'password' ? (
              <form onSubmit={handleLogin} className="space-y-4">
                
                {/* Outlined Input: Username or Email */}
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                    <User className="w-5 h-5" />
                  </div>
                  <input 
                    type="text" 
                    required 
                    value={staffId} 
                    onChange={(e) => setStaffId(e.target.value.toLowerCase())} 
                    placeholder="Username or Email" 
                    className="w-full h-12 pl-11 pr-4 bg-white rounded-xl border border-slate-200 text-[15px] sm:text-base text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition" 
                  />
                </div>

                {/* Outlined Input: Password */}
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                    <Lock className="w-5 h-5" />
                  </div>
                  <input 
                    type={showPassword ? 'text' : 'password'} 
                    required 
                    value={password} 
                    onChange={(e) => setPassword(e.target.value)} 
                    placeholder="Password" 
                    className="w-full h-12 pl-11 pr-11 bg-white rounded-xl border border-slate-200 text-[15px] sm:text-base text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition" 
                  />
                  <div className="absolute inset-y-0 right-0 pr-3 flex items-center">
                    <button 
                      type="button" 
                      onClick={() => setShowPassword(!showPassword)} 
                      className="password-eye-btn w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-100/80 focus:outline-none transition"
                      style={{ transform: 'none', filter: 'none', boxShadow: 'none' }}
                      title={showPassword ? 'Hide password' : 'Show password'}
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                    >
                      {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                    </button>
                  </div>
                </div>

                {/* Row: Remember me + Forgot Password? */}
                <div className="flex items-center justify-between pt-0.5">
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input 
                      type="checkbox" 
                      className="w-4 h-4 rounded border-slate-300 accent-blue-600 cursor-pointer" 
                    />
                    <span className="text-[13px] text-slate-500">Remember me</span>
                  </label>
                  <button 
                    type="button" 
                    onClick={() => { 
                      setShowForgotModal(true); 
                      setForgotEmail(''); 
                      setForgotOtp(''); 
                      setForgotNewPassword(''); 
                      setForgotConfirmPassword(''); 
                      setForgotStep(1); 
                      setForgotError(''); 
                      setForgotSuccess(''); 
                    }} 
                    className="text-[13px] font-semibold text-blue-600 hover:text-blue-700 transition"
                  >
                    Forgot Password?
                  </button>
                </div>

                {/* Large Blue Login Button: Login → */}
                <button 
                  type="submit" 
                  disabled={loading} 
                  className="w-full h-12 mt-2 rounded-xl bg-gradient-to-r from-[#1a73e8] to-[#0ea5e9] hover:from-[#1558b0] hover:to-[#0284c7] text-white font-bold text-base shadow-md shadow-blue-500/20 active:scale-[0.99] transition duration-150 flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {loading ? (
                    <>
                      <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      <span>Logging in...</span>
                    </>
                  ) : (
                    <>
                      <span>Login</span>
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>

                {/* "Or continue with" Divider */}
                <div className="flex items-center my-4 gap-3 px-1">
                  <div className="flex-1 h-[1px] bg-slate-200" />
                  <span className="text-[12px] text-slate-400 font-normal shrink-0">
                    Or continue with
                  </span>
                  <div className="flex-1 h-[1px] bg-slate-200" />
                </div>

                {/* 3 Social / SSO Buttons: Google | Microsoft | SSO */}
                <div className="grid grid-cols-3 gap-3">
                  
                  {/* Google */}
                  <button 
                    type="button" 
                    onClick={handleGoogleBtnClick}
                    className="h-11 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 flex items-center justify-center gap-2 text-[13px] font-semibold text-slate-700 shadow-sm transition active:scale-[0.98]"
                  >
                    <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
                      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" />
                      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                    </svg>
                    <span>Google</span>
                  </button>

                  {/* Microsoft */}
                  <button 
                    type="button" 
                    onClick={() => {
                      setError('');
                      setSuccess('Microsoft Azure SSO is supported. Contact your administrator to connect your directory.');
                    }}
                    className="h-11 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 flex items-center justify-center gap-2 text-[13px] font-semibold text-slate-700 shadow-sm transition active:scale-[0.98]"
                  >
                    <svg className="w-4 h-4 shrink-0" viewBox="0 0 21 21">
                      <rect x="1" y="1" width="9" height="9" fill="#F25022" />
                      <rect x="11" y="1" width="9" height="9" fill="#7FBA00" />
                      <rect x="1" y="11" width="9" height="9" fill="#00A4EF" />
                      <rect x="11" y="11" width="9" height="9" fill="#FFB900" />
                    </svg>
                    <span>Microsoft</span>
                  </button>

                  {/* SSO */}
                  <button 
                    type="button" 
                    onClick={() => {
                      setLoginMethod('otp');
                      setError('');
                      setSuccess('');
                    }} 
                    className="h-11 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 flex items-center justify-center gap-2 text-[13px] font-semibold text-slate-700 shadow-sm transition active:scale-[0.98]"
                  >
                    <Lock className="w-4 h-4 text-slate-800 fill-slate-800 shrink-0" />
                    <span>SSO</span>
                  </button>
                </div>

                {/* ── Patient Portal Button ── */}
                <button 
                  type="button" 
                  onClick={handlePatientPortalNavigation} 
                  className="w-full h-11 mt-3 rounded-xl bg-emerald-50/80 hover:bg-emerald-100/90 border border-emerald-200/90 text-emerald-800 font-semibold text-[13px] flex items-center justify-center gap-2 transition active:scale-[0.98] shadow-sm"
                >
                  <User className="w-4 h-4 text-emerald-600" />
                  <span>{hospital ? `${hospital.name} Patient Portal` : 'Patient Portal Login'}</span>
                </button>

                {/* ── CARD FOOTER: Copyright & Legal links inside panel as shown in reference ── */}
                <div className="pt-5 mt-5 text-center">
                  <p className="text-[12px] sm:text-[13px] text-slate-400 font-normal">
                    © 2025 Quroxa. All rights reserved.
                  </p>
                  <div className="flex items-center justify-center gap-2 sm:gap-2.5 mt-1.5 text-[12px] sm:text-[13px] text-blue-600/90 font-medium">
                    <button type="button" className="hover:text-blue-700 hover:underline transition">Privacy Policy</button>
                    <span className="text-slate-300 font-light">|</span>
                    <button type="button" className="hover:text-blue-700 hover:underline transition">Terms of Service</button>
                    <span className="text-slate-300 font-light">|</span>
                    <button type="button" className="hover:text-blue-700 hover:underline transition">Support</button>
                  </div>
                </div>

              </form>
            ) : (
              /* ── OTP LOGIN FORM ── */
              <form onSubmit={!otpSent ? handleSendOtp : handleVerifyLoginOtp} className="space-y-4">
                {!otpSent ? (
                  <>
                    <div>
                      <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                        Email or Mobile Number
                      </label>
                      <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                          <Mail className="w-5 h-5" />
                        </div>
                        <input 
                          type="text" 
                          required 
                          value={emailOrPhone} 
                          onChange={(e) => setEmailOrPhone(e.target.value.toLowerCase())} 
                          placeholder="Enter registered email or phone" 
                          className="w-full h-12 pl-11 pr-4 bg-white rounded-xl border border-slate-200 text-[15px] sm:text-base text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 transition" 
                        />
                      </div>
                    </div>
                    <button 
                      type="submit" 
                      disabled={loading} 
                      className="w-full h-12 rounded-xl bg-gradient-to-r from-[#1a73e8] to-[#0ea5e9] hover:from-[#1558b0] hover:to-[#0284c7] text-white font-bold text-sm shadow-md active:scale-[0.99] transition flex items-center justify-center gap-2 disabled:opacity-60"
                    >
                      {loading ? (
                        <>
                          <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                          <span>Sending OTP...</span>
                        </>
                      ) : (
                        <span>Send OTP</span>
                      )}
                    </button>
                  </>
                ) : (
                  <>
                    <div>
                      <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                        Contact Information
                      </label>
                      <input 
                        type="text" 
                        disabled 
                        value={emailOrPhone} 
                        className="w-full h-12 px-4 bg-slate-100 rounded-xl border border-slate-200 text-sm text-slate-600 font-medium" 
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-slate-700 mb-2">
                        One-Time Password (OTP)
                      </label>
                      <OTPField 
                        aria-label="One-time password" 
                        length={OTP_LENGTH} 
                        value={loginOtp} 
                        onChange={setLoginOtp} 
                        className="w-full justify-between"
                      >
                        {OTP_SLOT_KEYS.map((slotKey, index) => (
                          <OTPFieldInput key={slotKey} aria-label={index === 0 ? undefined : `Character ${index + 1} of ${OTP_LENGTH}`} />
                        ))}
                      </OTPField>
                    </div>
                    <button 
                      type="submit" 
                      disabled={loading || loginOtp.length < 6} 
                      className="w-full h-12 mt-1 rounded-xl bg-gradient-to-r from-[#1a73e8] to-[#0ea5e9] hover:from-[#1558b0] hover:to-[#0284c7] text-white font-bold text-sm shadow-md active:scale-[0.99] transition flex items-center justify-center gap-2 disabled:opacity-60"
                    >
                      {loading ? (
                        <>
                          <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                          <span>Verifying...</span>
                        </>
                      ) : (
                        <span>Verify &amp; Log In</span>
                      )}
                    </button>
                    <div className="flex items-center justify-between text-sm">
                      <button 
                        type="button" 
                        onClick={() => setOtpSent(false)} 
                        className="text-slate-500 hover:text-slate-700 font-medium hover:underline"
                      >
                        Change contact info
                      </button>
                      <button 
                        type="button" 
                        onClick={handleSendOtp} 
                        disabled={loading} 
                        className="text-blue-600 hover:text-blue-700 font-semibold hover:underline"
                      >
                        Resend OTP
                      </button>
                    </div>
                  </>
                )}

                {/* ── Patient Portal Button ── */}
                <button 
                  type="button" 
                  onClick={handlePatientPortalNavigation} 
                  className="w-full h-11 mt-3 rounded-xl bg-emerald-50/80 hover:bg-emerald-100/90 border border-emerald-200/90 text-emerald-800 font-semibold text-[13px] flex items-center justify-center gap-2 transition active:scale-[0.98] shadow-sm"
                >
                  <User className="w-4 h-4 text-emerald-600" />
                  <span>{hospital ? `${hospital.name} Patient Portal` : 'Patient Portal Login'}</span>
                </button>

                <div className="text-center pt-2">
                  <button 
                    type="button" 
                    onClick={() => { setLoginMethod('password'); setError(''); setSuccess(''); }} 
                    className="text-[13px] text-blue-600 font-semibold hover:underline"
                  >
                    ← Back to Password Login
                  </button>
                </div>

                {/* ── CARD FOOTER: Copyright & Legal links inside panel ── */}
                <div className="pt-5 mt-5 text-center">
                  <p className="text-[12px] sm:text-[13px] text-slate-400 font-normal">
                    © 2025 Quroxa. All rights reserved.
                  </p>
                  <div className="flex items-center justify-center gap-2 sm:gap-2.5 mt-1.5 text-[12px] sm:text-[13px] text-blue-600/90 font-medium">
                    <button type="button" className="hover:text-blue-700 hover:underline transition">Privacy Policy</button>
                    <span className="text-slate-300 font-light">|</span>
                    <button type="button" className="hover:text-blue-700 hover:underline transition">Terms of Service</button>
                    <span className="text-slate-300 font-light">|</span>
                    <button type="button" className="hover:text-blue-700 hover:underline transition">Support</button>
                  </div>
                </div>
              </form>
            )}

          </div>

        </div>

      </main>

      {/* ── MODALS: PRESERVED FULLY ── */}
      
      {/* Server Wake-Up Splash Overlay */}
      {showServerSplash && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-8 max-w-sm w-full text-center shadow-2xl border border-slate-100 flex flex-col items-center">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-blue-600 to-cyan-500 text-white flex items-center justify-center text-2xl font-black shadow-lg shadow-blue-500/30 mb-4">
              Q
            </div>
            <h3 className="text-lg font-bold text-slate-900 mb-1">Logging in...</h3>
            <p className="text-xs text-slate-500 leading-relaxed mb-5">
              Authenticating your credentials and securing your clinical session...
            </p>
            <div className="w-8 h-8 border-3 border-slate-200 border-t-blue-600 rounded-full animate-spin" />
          </div>
        </div>
      )}

      {/* Password Changed Notice Modal */}
      {showPasswordChangedModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-8 max-w-md w-full text-center shadow-2xl border border-slate-100 flex flex-col items-center">
            <div className="w-14 h-14 rounded-2xl bg-red-50 text-red-600 flex items-center justify-center mb-4">
              <Lock className="w-7 h-7" />
            </div>
            <h3 className="text-lg font-bold text-slate-900 mb-2">Password Changed</h3>
            <p className="text-xs text-slate-600 leading-relaxed mb-6">
              Your account password has been updated. You have been logged out for security. Please log in again using your new password.
            </p>
            <button
              onClick={() => setShowPasswordChangedModal(false)}
              className="w-full h-11 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs shadow-md shadow-blue-500/15 transition"
            >
              Understand &amp; Sign In
            </button>
          </div>
        </div>
      )}

      {/* Forgot Password Modal */}
      {showForgotModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-7 sm:p-8 max-w-md w-full shadow-2xl border border-slate-100">
            <div className="text-center mb-6">
              <div className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center mx-auto mb-3">
                <KeyRound className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-bold text-slate-900">Reset Password</h3>
              <p className="text-xs text-slate-500 mt-1">
                {forgotStep === 1 ? 'Enter your email to receive an OTP' : 'Enter the OTP and your new password'}
              </p>
            </div>

            {forgotError && (
              <div className="mb-4 p-3 rounded-xl bg-red-50 text-red-700 text-xs font-medium flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
                <span>{forgotError}</span>
              </div>
            )}
            {forgotSuccess && (
              <div className="mb-4 p-3 rounded-xl bg-emerald-50 text-emerald-700 text-xs font-medium flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>{forgotSuccess}</span>
              </div>
            )}

            {forgotStep === 1 ? (
              <form onSubmit={handleRequestOtp} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">Email Address or Staff ID</label>
                  <input
                    type="text"
                    required
                    value={forgotEmail}
                    onChange={(e) => setForgotEmail(e.target.value)}
                    placeholder="name@example.com or staff ID"
                    className="w-full h-11 px-3.5 bg-white rounded-xl border border-slate-200 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 transition"
                  />
                </div>
                <div className="flex gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowForgotModal(false)}
                    className="flex-1 h-11 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs transition"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={loading}
                    className="flex-[1.5] h-11 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs shadow-md shadow-blue-500/20 transition disabled:opacity-60"
                  >
                    {loading ? 'Sending OTP...' : 'Send OTP'}
                  </button>
                </div>
              </form>
            ) : (
              <form onSubmit={handleVerifyOtpAndReset} className="space-y-3.5">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">One-Time Password (OTP)</label>
                  <input
                    type="text"
                    required
                    maxLength={6}
                    value={forgotOtp}
                    onChange={(e) => setForgotOtp(e.target.value)}
                    placeholder="6-digit OTP code"
                    className="w-full h-10 px-3.5 bg-white rounded-xl border border-slate-200 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 transition"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">New Password</label>
                  <input
                    type="password"
                    required
                    value={forgotNewPassword}
                    onChange={(e) => setForgotNewPassword(e.target.value)}
                    placeholder="Enter new password"
                    className="w-full h-10 px-3.5 bg-white rounded-xl border border-slate-200 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 transition"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Confirm New Password</label>
                  <input
                    type="password"
                    required
                    value={forgotConfirmPassword}
                    onChange={(e) => setForgotConfirmPassword(e.target.value)}
                    placeholder="Confirm new password"
                    className="w-full h-10 px-3.5 bg-white rounded-xl border border-slate-200 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 transition"
                  />
                </div>
                <div className="flex gap-3 pt-3">
                  <button
                    type="button"
                    onClick={() => setForgotStep(1)}
                    className="flex-1 h-11 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs transition"
                  >
                    Back
                  </button>
                  <button
                    type="submit"
                    disabled={loading}
                    className="flex-[1.5] h-11 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs shadow-md shadow-blue-500/20 transition disabled:opacity-60"
                  >
                    {loading ? 'Resetting...' : 'Reset Password'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* Google Sign-In Fallback & Simulator Modal */}
      {showGoogleModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-7 max-w-md w-full shadow-2xl border border-slate-100">
            <div className="text-center mb-5">
              <h3 className="text-base font-bold text-slate-900">Google Sign-In Options</h3>
              <p className="text-xs text-slate-500 mt-1">
                Configure real login or use developer simulation
              </p>
            </div>

            <div className="flex border-b border-slate-200 mb-4">
              <button
                type="button"
                onClick={() => setGoogleModalTab('instructions')}
                className={`flex-1 py-2 text-xs font-semibold border-b-2 transition ${googleModalTab === 'instructions' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500'}`}
              >
                Setup Instructions
              </button>
              <button
                type="button"
                onClick={() => setGoogleModalTab('simulator')}
                className={`flex-1 py-2 text-xs font-semibold border-b-2 transition ${googleModalTab === 'simulator' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500'}`}
              >
                Local Simulator
              </button>
            </div>

            <div className="max-h-64 overflow-y-auto pr-1 mb-5 text-xs text-slate-600">
              {googleModalTab === 'instructions' ? (
                <div className="space-y-3">
                  <div className="p-3 bg-blue-50 text-blue-800 rounded-xl border border-blue-100 font-medium">
                    Set the Google Client ID in your .env files to enable real user authentication.
                  </div>
                  <div>
                    <strong className="text-slate-900 block">Step 1: Google Cloud Console</strong>
                    <span>Create a project in Google Cloud Console.</span>
                  </div>
                  <div>
                    <strong className="text-slate-900 block">Step 2: Create OAuth Client ID</strong>
                    <span>Select Web Application with your origin URL.</span>
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  {[
                    { name: 'Super Admin', email: 'super.admin@curoxa.com', avatar: 'SU' },
                    { name: 'Hospital Admin', email: 'admin', avatar: 'HA' },
                    { name: 'Dr. Sarah Jenkins', email: 'sarah.jenkins@gmail.com', avatar: 'SJ' },
                    { name: 'Receptionist Rita', email: 'rita.receptionist@gmail.com', avatar: 'RR' }
                  ].map(account => (
                    <div
                      key={account.email}
                      onClick={async () => {
                        setShowGoogleModal(false);
                        setLoading(true);
                        try {
                          const res = await api.post('/auth/google-login', {
                            credential: `simulated_token_${account.email}`
                          });
                          const { token, user, tenantModules, doctorClinicalMode, plan, subscriptionRestricted, subscriptionStatus, subscriptionDaysRemaining } = res.data;
                          localStorage.setItem('token', token);
                          localStorage.setItem('user', JSON.stringify(user));
                          localStorage.setItem('tenantId', user.tenantId || 'city_hospital');
                          localStorage.setItem('tenantModules', JSON.stringify(tenantModules || {}));
                          localStorage.setItem('doctorClinicalMode', doctorClinicalMode || 'ONLINE');
                          localStorage.setItem('plan', plan || '');
                          localStorage.setItem('subscriptionRestricted', subscriptionRestricted ? 'true' : 'false');
                          localStorage.setItem('subscriptionStatus', subscriptionStatus || 'ACTIVE');
                          if (subscriptionDaysRemaining !== undefined && subscriptionDaysRemaining !== null) {
                            localStorage.setItem('subscriptionDaysRemaining', String(subscriptionDaysRemaining));
                          }
                          window.dispatchEvent(new CustomEvent('curoxa_login_success'));
                          setSuccess('Logged in via simulated Google Sign-In!');
                          setTimeout(() => {
                            switch (user.role) {
                              case 'admin': navigate('/admin'); break;
                              case 'superadmin':
                              case 'super_admin': navigate('/super-admin'); break;
                              case 'doctor': navigate('/doctor'); break;
                              case 'receptionist': navigate('/receptionist'); break;
                              case 'patient': navigate('/patient'); break;
                              case 'lab': navigate('/lab'); break;
                              case 'pharmacy': navigate('/pharmacy'); break;
                              default: navigate('/'); break;
                            }
                          }, 1000);
                        } catch (gErr) {
                          setError(gErr.response?.data?.error || 'Simulated Google Authentication failed');
                        } finally {
                          setLoading(false);
                        }
                      }}
                      className="flex items-center gap-3 p-2.5 rounded-xl border border-slate-200 hover:border-blue-500 hover:bg-blue-50/50 cursor-pointer transition"
                    >
                      <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-bold text-xs">
                        {account.avatar}
                      </div>
                      <div>
                        <div className="font-semibold text-slate-800">{account.name}</div>
                        <div className="text-[11px] text-slate-500">{account.email}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <button
              onClick={() => setShowGoogleModal(false)}
              className="w-full h-10 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs transition"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

    </div>
  );
};

export default Login;
