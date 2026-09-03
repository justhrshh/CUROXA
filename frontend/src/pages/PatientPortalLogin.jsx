import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams, useLocation } from 'react-router-dom';
import api from '../utils/api';
import { ArrowRight, UserPlus, FileText, User, Lock, Mail, KeyRound, AlertCircle, CheckCircle, Shield, ChevronRight } from 'lucide-react';
import { OTPField, OTPFieldInput } from '../components/ui/otp-field';
import loginBg from '../assets/curoxa_bg_enhanced.png';
import curoxaLogo from '../assets/curoxa_logo_transparent.png';

const OTP_LENGTH = 6;
const OTP_SLOT_KEYS = Array.from({ length: OTP_LENGTH }, (_, i) => `otp-slot-${i}`);

const PatientPortalLogin = () => {
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
    <div 
      className="min-h-screen w-full flex flex-col bg-[#F4F8FC] text-slate-900 font-sans selection:bg-blue-100 selection:text-blue-900 overflow-x-hidden relative bg-no-repeat bg-cover bg-right min-[501px]:bg-[position:center_84%]"
      style={{ 
        backgroundImage: `url(${loginBg})`,
        imageRendering: '-webkit-optimize-contrast'
      }}
    >
      {/* TOP NAVIGATION BAR */}
      <header className="w-full px-6 sm:px-10 lg:px-14 xl:px-16 py-3.5 sm:py-5 flex items-center justify-between z-20 bg-white/40 lg:bg-transparent backdrop-blur-md lg:backdrop-blur-none border-b border-slate-200/50 lg:border-none">
        <div className="flex items-center gap-2.5 sm:gap-3.5 cursor-pointer" onClick={() => navigate('/')}>
          <img 
            src={curoxaLogo} 
            alt="Curoxa" 
            className="h-12 sm:h-16 lg:h-20 w-auto object-contain drop-shadow-sm" 
            onError={(e) => {
              e.target.src = '/curoxa_logo_transparent.png';
            }}
          />
          <span className="text-base sm:text-2xl font-bold tracking-tight text-blue-600 inline-block">
            Patient Portal
          </span>
        </div>

        <button 
          type="button"
          onClick={handleStaffLoginNavigation} 
          className="inline-flex items-center gap-2 px-3.5 sm:px-4 py-2 rounded-xl bg-white/90 hover:bg-white border border-slate-200 text-slate-700 hover:text-blue-600 font-semibold text-xs sm:text-sm shadow-sm hover:shadow transition active:scale-[0.98]"
        >
          <User className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-slate-500" />
          <span>Staff Login</span>
        </button>
      </header>

      {/* MAIN VIEWPORT WRAPPER */}
      <main className="flex-1 w-full flex flex-col lg:flex-row items-center justify-center lg:justify-between px-6 sm:px-10 lg:px-12 xl:px-16 py-6 sm:py-8 lg:py-6 z-10 max-w-7xl 2xl:max-w-[1400px] mx-auto my-auto relative">
        
        {/* LEFT SIDE: Promotional Branding Hero (Shifted slightly inward towards center) */}
        <div className="hidden lg:flex relative w-full lg:w-[48%] xl:w-[48%] flex-col justify-start self-start pt-0 lg:pt-1 xl:pt-2 pb-4 pr-4 lg:pl-4 xl:pl-8 2xl:pl-10">
          <div className="space-y-0.5 max-w-lg">
            <h1 className="text-3xl lg:text-[42px] xl:text-[46px] font-black tracking-tight text-slate-900 leading-[1.12]">
              Your Health.
            </h1>
            <h1 className="text-3xl lg:text-[42px] xl:text-[46px] font-black tracking-tight bg-gradient-to-r from-blue-600 via-blue-500 to-cyan-500 bg-clip-text text-transparent leading-[1.12]">
              Our Priority.
            </h1>
          </div>

          <p className="mt-2 sm:mt-2.5 text-xs sm:text-sm lg:text-[15px] text-slate-600 font-normal leading-relaxed max-w-md">
            Access your medical records, prescriptions, and appointments — all in one secure place.
          </p>
        </div>

        {/* RIGHT SIDE: Floating Authentication Card Area (Shifted slightly to the right) */}
        <div className="w-full lg:w-[52%] xl:w-[50%] flex flex-col justify-center items-center lg:items-end my-auto py-2 lg:py-0 px-2 sm:px-0 lg:pr-0 xl:pr-2 2xl:pr-4 lg:translate-x-2 xl:translate-x-4">
          
          <div className="w-full max-w-[420px] sm:max-w-[490px] lg:max-w-[500px] xl:max-w-[530px] bg-white rounded-2xl sm:rounded-3xl border border-slate-200/80 shadow-[0_16px_48px_rgba(15,23,42,0.07)] p-6 sm:p-9 transition-all relative z-10 mx-auto lg:mx-0">
            
            {/* Card Top Branding & Heading */}
            <div className="text-center mb-5 sm:mb-6">
              <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
                Welcome back
              </h2>
              <p className="text-xs sm:text-sm text-slate-500 font-normal mt-1.5 leading-relaxed max-w-xs mx-auto">
                Enter your mobile number or email to access your medical records, prescriptions, and appointments.
              </p>
            </div>

            {/* Feedback Alerts */}
            {error && (
              <div className="mb-4 p-3.5 rounded-xl bg-red-50/90 border border-red-200 text-red-700 text-sm font-medium flex items-start gap-2.5 animate-fadeIn">
                <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                <span className="flex-1 leading-snug">{error}</span>
              </div>
            )}

            {success && (
              <div className="mb-4 p-3.5 rounded-xl bg-emerald-50/90 border border-emerald-200 text-emerald-700 text-sm font-medium flex items-start gap-2.5 animate-fadeIn">
                <CheckCircle className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" />
                <span className="flex-1 leading-snug">{success}</span>
              </div>
            )}

            {/* Step 1: Request OTP Form */}
            {!otpSent ? (
              <form onSubmit={handleSendOtp} className="space-y-4">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                    Mobile Number or Email
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                      <User className="w-5 h-5" />
                    </div>
                    <input
                      type="text"
                      required
                      value={emailOrPhone}
                      onChange={(e) => setEmailOrPhone(e.target.value)}
                      placeholder="e.g. +44 20 7946 0192 or john@example.com"
                      className="w-full h-12 pl-11 pr-4 bg-white rounded-xl border border-slate-200 text-sm sm:text-base text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 transition"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full h-12 rounded-xl bg-gradient-to-r from-blue-600 via-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white font-bold text-sm sm:text-base shadow-md shadow-blue-500/15 hover:shadow-blue-500/25 active:scale-[0.99] transition duration-150 flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
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
                  className="w-full h-12 mt-2 rounded-xl bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-700 hover:to-emerald-800 text-white font-bold text-sm sm:text-base shadow-md shadow-emerald-500/15 active:scale-[0.99] transition duration-150 flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
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
                    className="text-sm font-medium text-slate-500 hover:text-blue-600 hover:underline transition"
                  >
                    Use a different number / email
                  </button>
                </div>
              </form>
            )}

            {/* Divider OR */}
            <div className="relative my-5 text-center">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-slate-200/80" />
              </div>
              <span className="relative bg-white px-3 text-xs font-bold text-slate-400 tracking-wider">
                OR
              </span>
            </div>

            {/* Interactive Feature Cards (Matching Mockup with Chevrons) */}
            <div className="space-y-3">
              <div className="p-3 sm:p-3.5 bg-slate-50/70 hover:bg-blue-50/50 rounded-2xl border border-slate-100 flex items-center justify-between transition cursor-pointer group">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-blue-100/80 text-blue-600 flex items-center justify-center flex-shrink-0">
                    <UserPlus className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="text-xs sm:text-sm font-bold text-slate-800 leading-tight">New Patient?</h4>
                    <p className="text-[11px] sm:text-xs text-slate-500 font-normal mt-0.5 leading-snug">Just enter your details above to register automatically.</p>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-blue-600 group-hover:translate-x-0.5 transition flex-shrink-0 ml-2" />
              </div>

              <div className="p-3 sm:p-3.5 bg-slate-50/70 hover:bg-emerald-50/50 rounded-2xl border border-slate-100 flex items-center justify-between transition cursor-pointer group">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-emerald-100/80 text-emerald-600 flex items-center justify-center flex-shrink-0">
                    <FileText className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="text-xs sm:text-sm font-bold text-slate-800 leading-tight">Access Records</h4>
                    <p className="text-[11px] sm:text-xs text-slate-500 font-normal mt-0.5 leading-snug">View your lab reports and prescriptions securely.</p>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-emerald-600 group-hover:translate-x-0.5 transition flex-shrink-0 ml-2" />
              </div>
            </div>

            {/* Legal / Policy Note */}
            <p className="text-[11px] text-slate-400 text-center mt-5 leading-relaxed">
              By continuing, you agree to our <span className="font-semibold text-blue-600 hover:underline cursor-pointer">Terms of Service</span> and <span className="font-semibold text-blue-600 hover:underline cursor-pointer">Privacy Policy</span>.
            </p>

          </div>

        </div>

      </main>

      {/* BOTTOM TRUST BADGE */}
      <footer className="w-full py-3 text-center z-10">
        <div className="inline-flex items-center justify-center gap-2 text-xs text-slate-500 font-medium px-4">
          <Lock className="w-3.5 h-3.5 text-slate-400" />
          <span>Your data is encrypted and secure with Curoxa</span>
        </div>
      </footer>
    </div>
  );
};

export default PatientPortalLogin;

