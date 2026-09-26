import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams, useLocation } from 'react-router-dom';
import api from '../utils/api';
import { 
  ArrowRight, ArrowLeft, UserPlus, FileText, User, Mail, AlertCircle, CheckCircle, 
  ShieldCheck, ChevronRight, Calendar, FlaskConical, Pill, Heart 
} from 'lucide-react';
import { OTPField, OTPFieldInput } from '../components/ui/otp-field';
import quroxaRefBg from '../assets/quroxa_reference_bg.jpg';
import curoxaLogo from '../assets/quroxa_new_logo.png';
import { usePortalBranding, HospitalBrandLogo } from '../context/PortalBrandingContext';

const OTP_LENGTH = 6;
const OTP_SLOT_KEYS = Array.from({ length: OTP_LENGTH }, (_, i) => `otp-slot-${i}`);

const PatientPortalLogin = () => {
  const portalBranding = usePortalBranding();
  const hospital = portalBranding?.hospital;
  const [emailOrPhone, setEmailOrPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const location = useLocation();

  useEffect(() => {
    const portalId = searchParams.get('portal');
    if (portalId && /^HSP-[A-Z0-9]{6}$/i.test(portalId.trim())) {
      sessionStorage.setItem('curoxa_return_portal', portalId.trim().toUpperCase());
    }
  }, [searchParams]);

  const handleStaffLoginNavigation = () => {
    const portalId = searchParams.get('portal') || 
                     location.state?.fromPortal || 
                     sessionStorage.getItem('curoxa_return_portal');
    
    if (portalId && /^HSP-[A-Z0-9]{6}$/i.test(portalId.trim())) {
      navigate(`/portal/${portalId.trim().toUpperCase()}`);
    } else {
      navigate('/login');
    }
  };

  const handleSendOtp = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    if (!emailOrPhone) {
      setError('Please enter your email or phone number');
      return;
    }
    
    setLoading(true);
    try {
      const response = await api.post('/auth/patient-portal/send-otp', {
        emailOrPhone
      });
      setSuccess('OTP sent successfully! Please check your messages/inbox.');
      setOtpSent(true);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to send OTP. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (e) => {
    e.preventDefault();
    setError('');
    
    if (!otp) {
      setError('Please enter the OTP');
      return;
    }

    setLoading(true);
    try {
      const response = await api.post('/auth/patient-portal/verify-otp', {
        emailOrPhone,
        otp
      });
      
      if (response.data.isNewUser) {
        // Store temp token so all API calls on /patient-register (doctors, slots, availability) are authorized
        localStorage.setItem('token', response.data.tempToken);
        localStorage.setItem('user', JSON.stringify({ role: 'patient', isNewPatient: true, emailOrPhone: response.data.emailOrPhone }));
        localStorage.setItem('tenantId', 'city_hospital');
        navigate('/patient-register', { 
          state: { 
            tempToken: response.data.tempToken, 
            emailOrPhone: response.data.emailOrPhone 
          } 
        });
      } else {
        // Existing user, log them in
        const loggedUser = response.data.user || {};
        localStorage.setItem('token', response.data.token);
        localStorage.setItem('user', JSON.stringify(loggedUser));
        localStorage.setItem('tenantId', loggedUser.tenantId || 'city_hospital');
        window.dispatchEvent(new CustomEvent('curoxa_login_success'));
        navigate('/patient');
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Invalid OTP. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full relative flex flex-col justify-between overflow-x-hidden font-['Inter',sans-serif] select-none bg-slate-50">

      {/* ── 1. BACKGROUND HEALTHCARE PHOTOGRAPH ── */}
      <div 
        className="absolute inset-0 w-full h-full pointer-events-none bg-no-repeat bg-cover z-0"
        style={{
          backgroundImage: `url(${quroxaRefBg})`,
          backgroundPosition: 'center center',
          imageRendering: '-webkit-optimize-contrast'
        }}
      />

      {/* ── 2. MOBILE ADAPTIVE BACKDROP ── */}
      <div className="lg:hidden absolute inset-0 bg-[#f8fbfe]/88 backdrop-blur-[2px] pointer-events-none z-[1]" />

      {/* ── 3. HEADER ── */}
      <header className="lg:absolute top-0 left-0 right-0 z-20 w-full max-w-[1600px] mx-auto px-8 sm:px-12 lg:px-16 pt-7 sm:pt-9 flex items-center justify-between pointer-events-none">
        {/* Top-Left Logo */}
        <div className="pointer-events-auto flex items-center gap-3.5 cursor-pointer" onClick={() => navigate('/')}>
          {hospital ? (
            <div className="flex items-center gap-3.5">
              <HospitalBrandLogo hospital={hospital} size={50} borderRadius={14} fontSize={19} />
              <div>
                <h2 className="text-xl font-black text-slate-900 tracking-tight leading-tight">
                  {hospital.name}
                </h2>
                <span className="text-[11px] font-bold text-blue-600 bg-blue-50 px-2.5 py-0.5 rounded-full border border-blue-100 uppercase tracking-wider">
                  Patient Portal • {hospital.hospitalId}
                </span>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <img 
                src={curoxaLogo} 
                alt="Quroxa Patient Portal" 
                className="h-18 sm:h-22 lg:h-[94px] w-auto object-contain drop-shadow-sm" 
                onError={(e) => { e.target.src = '/quroxa_new_logo.png'; }} 
              />
              <span className="hidden sm:inline-block text-xs font-bold uppercase tracking-widest text-[#0ea5e9] bg-sky-50 px-2.5 py-1 rounded-full border border-sky-100">
                Patient Portal
              </span>
            </div>
          )}
        </div>
      </header>

      {/* ── 4. MAIN HERO & LOGIN SECTION ── */}
      <main className="relative z-10 w-full max-w-[1600px] mx-auto flex-1 min-h-screen flex flex-col lg:flex-row items-center justify-between px-8 sm:px-12 lg:px-16 py-6 lg:py-8 gap-8 lg:gap-12">

        {/* ── LEFT HERO SECTION ── */}
        <div className="w-full lg:w-[56%] flex flex-col justify-center pt-2 lg:pt-14 pb-4">
          
          {/* ── TEXT & 6 ICONS CONTAINER WITH LOCALIZED SOFT WHITE BLUR ── */}
          <div className="relative max-w-[580px] xl:max-w-[620px]">
            
            {/* White soft blur layer strictly behind this block with seamless feathered edges */}
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
                WELCOME TO QUROXA PATIENT PORTAL
              </p>
              
              <h1 className="text-2xl sm:text-3xl lg:text-[34px] xl:text-[38px] 2xl:text-[42px] font-black text-[#0f1f3d] tracking-tight leading-[1.16] sm:whitespace-nowrap">
                {hospital ? `${hospital.name} Patient Portal.` : 'Your Health.'}
              </h1>
              
              <h1 className="text-2xl sm:text-3xl lg:text-[34px] xl:text-[38px] 2xl:text-[42px] font-black text-[#0ea5e9] tracking-tight leading-[1.16] mt-0.5 sm:whitespace-nowrap">
                {hospital ? 'Personal Health Record.' : 'Our Priority.'}
              </h1>

              <p className="mt-4 text-[14px] sm:text-[15px] text-slate-500 font-normal leading-relaxed max-w-[480px]">
                Access your medical records, prescriptions, and appointments — all in one secure place.
              </p>
            </div>

            {/* ── 6 FEATURE ICONS (Exact 3 columns × 2 rows matching Login.jsx) ── */}
            <div className="mt-9 grid grid-cols-3 gap-x-6 sm:gap-x-8 gap-y-6 max-w-[430px]">
              
              {/* 1. Medical Records */}
              <div className="flex flex-col items-center text-center gap-2">
                <div className="w-12 h-12 rounded-2xl bg-[#e0f2fe] flex items-center justify-center shadow-sm text-[#0ea5e9]">
                  <FileText className="w-5 h-5" />
                </div>
                <span className="text-[12px] sm:text-[13px] font-semibold text-slate-700 leading-tight">
                  Medical<br />Records
                </span>
              </div>

              {/* 2. Appointments */}
              <div className="flex flex-col items-center text-center gap-2">
                <div className="w-12 h-12 rounded-2xl bg-[#dcfce7] flex items-center justify-center shadow-sm text-[#16a34a]">
                  <Calendar className="w-5 h-5" />
                </div>
                <span className="text-[12px] sm:text-[13px] font-semibold text-slate-700 leading-tight">
                  Appointment<br />Booking
                </span>
              </div>

              {/* 3. Lab Reports */}
              <div className="flex flex-col items-center text-center gap-2">
                <div className="w-12 h-12 rounded-2xl bg-[#f3e8ff] flex items-center justify-center shadow-sm text-[#9333ea]">
                  <FlaskConical className="w-5 h-5" />
                </div>
                <span className="text-[12px] sm:text-[13px] font-semibold text-slate-700 leading-tight">
                  Lab &amp;<br />Diagnostics
                </span>
              </div>

              {/* 4. Prescriptions */}
              <div className="flex flex-col items-center text-center gap-2">
                <div className="w-12 h-12 rounded-2xl bg-[#ffedd5] flex items-center justify-center shadow-sm text-[#ea580c]">
                  <Pill className="w-5 h-5" />
                </div>
                <span className="text-[12px] sm:text-[13px] font-semibold text-slate-700 leading-tight">
                  Pharmacy &amp;<br />Prescriptions
                </span>
              </div>

              {/* 5. Doctor Consultations */}
              <div className="flex flex-col items-center text-center gap-2">
                <div className="w-12 h-12 rounded-2xl bg-[#ccfbf1] flex items-center justify-center shadow-sm text-[#0d9488]">
                  <User className="w-5 h-5" />
                </div>
                <span className="text-[12px] sm:text-[13px] font-semibold text-slate-700 leading-tight">
                  Doctor<br />Consultations
                </span>
              </div>

              {/* 6. Secure & Private */}
              <div className="flex flex-col items-center text-center gap-2">
                <div className="w-12 h-12 rounded-2xl bg-[#ede9fe] flex items-center justify-center shadow-sm text-[#7c3aed]">
                  <ShieldCheck className="w-5 h-5" />
                </div>
                <span className="text-[12px] sm:text-[13px] font-semibold text-slate-700 leading-tight">
                  100% Secure<br />&amp; Private
                </span>
              </div>

            </div>
          </div>

          {/* ── TRUST BADGE: Bottom Left pill ── */}
          <div className="mt-8 flex items-center gap-3">
            <div className="w-6 h-6 rounded-full bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-500">
              <Heart className="w-3.5 h-3.5 fill-blue-500/20" />
            </div>
            <div className="text-[12px] sm:text-[13px] font-semibold leading-tight text-slate-600">
              <span>Trusted by Clinics.</span><br />
              <span>Loved by Patients.</span>
            </div>
          </div>

        </div>

        {/* ── RIGHT LOGIN CARD ── */}
        <div className="w-full lg:w-[44%] xl:w-[42%] flex flex-col items-center lg:items-end my-auto">

          <div className="w-full max-w-[500px] xl:max-w-[515px] bg-white rounded-3xl shadow-[0_25px_70px_rgba(15,31,61,0.08)] border border-slate-100/90 p-7 sm:p-8 lg:p-9 relative z-10">
            
            {/* Top Bar: Back to Staff Login Navigation */}
            <div className="flex items-center justify-between mb-4 -mt-1">
              <button 
                type="button"
                onClick={handleStaffLoginNavigation}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-blue-600 transition group"
                title="Back to Staff Login"
              >
                <ArrowLeft className="w-3.5 h-3.5 text-slate-400 group-hover:text-blue-600 group-hover:-translate-x-0.5 transition duration-150" />
                <span>Back to Staff Login</span>
              </button>
              <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Patient Portal</span>
            </div>

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
                      Patient Portal • {hospital.hospitalId}
                    </span>
                  </div>
                </>
              ) : (
                <img 
                  src={curoxaLogo} 
                  alt="Quroxa" 
                  className="h-14 sm:h-16 lg:h-[66px] w-auto object-contain mx-auto" 
                  onError={(e) => { e.target.src = '/quroxa_new_logo.png'; }} 
                />
              )}
            </div>

            {/* Left-Aligned Heading & Subtitle */}
            <div className="text-left mb-5">
              <h2 className="text-[22px] font-bold text-[#0f1f3d] tracking-tight">
                Welcome back
              </h2>
              <p className="text-[14px] sm:text-[15px] text-slate-500 font-normal mt-1.5 leading-relaxed">
                Enter your mobile number or email to access your medical records, prescriptions, and appointments.
              </p>
            </div>

            {/* Feedback Alerts */}
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

            {/* Step 1: Send OTP Form */}
            {!otpSent ? (
              <form onSubmit={handleSendOtp} className="space-y-4">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                    Mobile Number or Email
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                      <Mail className="w-5 h-5" />
                    </div>
                    <input
                      type="text"
                      required
                      value={emailOrPhone}
                      onChange={(e) => setEmailOrPhone(e.target.value)}
                      placeholder="e.g. +44 20 7946 0192 or john@example.com"
                      className="w-full h-12 pl-11 pr-4 bg-white rounded-xl border border-slate-200 text-[15px] sm:text-base text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full h-12 mt-2 rounded-xl bg-gradient-to-r from-[#1a73e8] to-[#0ea5e9] hover:from-[#1558b0] hover:to-[#0284c7] text-white font-bold text-base shadow-md shadow-blue-500/20 active:scale-[0.99] transition duration-150 flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {loading ? (
                    <span className="flex items-center gap-2">
                      <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Sending OTP...
                    </span>
                  ) : (
                    <>
                      <span>Send OTP</span>
                      <ArrowRight className="w-5 h-5" />
                    </>
                  )}
                </button>
              </form>
            ) : (
              /* Step 2: Verify OTP Form */
              <form onSubmit={handleVerifyOtp} className="space-y-4">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">
                    Enter 6-digit OTP
                  </label>
                  
                  <OTPField 
                    aria-label="One-time password" 
                    length={OTP_LENGTH}
                    value={otp}
                    onChange={setOtp}
                    className="w-full justify-between"
                  >
                    {OTP_SLOT_KEYS.map((slotKey, index) => (
                      <OTPFieldInput
                        key={slotKey}
                        aria-label={index === 0 ? undefined : `Character ${index + 1} of ${OTP_LENGTH}`}
                      />
                    ))}
                  </OTPField>
                </div>

                <button
                  type="submit"
                  disabled={loading || otp.length < 6}
                  className="w-full h-12 mt-2 rounded-xl bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-700 hover:to-emerald-800 text-white font-bold text-base shadow-md shadow-emerald-500/20 active:scale-[0.99] transition duration-150 flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {loading ? (
                    <span className="flex items-center gap-2">
                      <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Verifying...
                    </span>
                  ) : (
                    'Verify & Login'
                  )}
                </button>

                <div className="text-center pt-1">
                  <button 
                    type="button" 
                    onClick={() => { setOtpSent(false); setOtp(''); setError(''); }} 
                    className="text-sm font-semibold text-blue-600 hover:underline transition"
                  >
                    ← Use a different number / email
                  </button>
                </div>
              </form>
            )}

            {/* Seamless OR Divider */}
            <div className="flex items-center my-4 gap-3 px-1">
              <div className="flex-1 h-[1px] bg-slate-200" />
              <span className="text-[12px] text-slate-400 font-normal shrink-0 uppercase tracking-wider">
                OR
              </span>
              <div className="flex-1 h-[1px] bg-slate-200" />
            </div>

            {/* Interactive Feature Cards */}
            <div className="space-y-2.5">
              <div className="p-3 bg-slate-50/80 hover:bg-blue-50/60 rounded-2xl border border-slate-100 flex items-center justify-between transition cursor-pointer group">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-blue-100/80 text-blue-600 flex items-center justify-center shrink-0">
                    <UserPlus className="w-4 h-4" />
                  </div>
                  <div className="text-left">
                    <h4 className="text-xs sm:text-sm font-bold text-slate-800 leading-tight">New Patient?</h4>
                    <p className="text-[11px] sm:text-xs text-slate-500 font-normal mt-0.5 leading-snug">Just enter your details above to register automatically.</p>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-blue-600 group-hover:translate-x-0.5 transition shrink-0 ml-2" />
              </div>

              <div className="p-3 bg-slate-50/80 hover:bg-emerald-50/60 rounded-2xl border border-slate-100 flex items-center justify-between transition cursor-pointer group">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-emerald-100/80 text-emerald-600 flex items-center justify-center shrink-0">
                    <FileText className="w-4 h-4" />
                  </div>
                  <div className="text-left">
                    <h4 className="text-xs sm:text-sm font-bold text-slate-800 leading-tight">Access Records</h4>
                    <p className="text-[11px] sm:text-xs text-slate-500 font-normal mt-0.5 leading-snug">View your lab reports and prescriptions securely.</p>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-emerald-600 group-hover:translate-x-0.5 transition shrink-0 ml-2" />
              </div>
            </div>

            {/* Staff Navigation Link */}
            <div className="mt-4 pt-3.5 border-t border-slate-100 text-center">
              <p className="text-[12px] text-slate-500 font-normal">
                Clinic staff or healthcare provider?{' '}
                <button 
                  type="button" 
                  onClick={handleStaffLoginNavigation} 
                  className="font-semibold text-blue-600 hover:text-blue-700 hover:underline transition"
                >
                  Staff Login →
                </button>
              </p>
            </div>

            {/* ── CARD FOOTER: Copyright & Legal links inside panel matching Login.jsx ── */}
            <div className="pt-4 text-center">
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

          </div>

        </div>

      </main>

    </div>
  );
};

export default PatientPortalLogin;

