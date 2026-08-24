import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../utils/api';
import { Eye, EyeOff, AlertCircle, CheckCircle, User, Lock, ArrowRight, ShieldCheck, Activity, Share2, Mail, KeyRound } from 'lucide-react';
import loginBg from '../assets/curoxa_bg_enhanced.png';
import curoxaLogo from '../assets/curoxa_logo_transparent.png';

const Login = () => {
  // Mode toggling (SignUp disabled)
  const isSignUp = false;

  // Sign In states
  const [staffId, setStaffId] = useState('');
  const [password, setPassword] = useState('');
  
  // OTP Login states
  const [loginMethod, setLoginMethod] = useState('password'); // 'password' or 'otp'
  const [emailOrPhone, setEmailOrPhone] = useState('');
  const [loginOtp, setLoginOtp] = useState('');
  const [otpSent, setOtpSent] = useState(false);

  // Multi-Tenant SaaS states
  const [tenantId, setTenantId] = useState('city_hospital');

  // Password visibility
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // Google Login modal simulation
  const [showGoogleModal, setShowGoogleModal] = useState(false);
  const [googleModalTab, setGoogleModalTab] = useState('instructions');

  // Google OAuth Config Check
  const rawGoogleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
  const googleClientId = rawGoogleClientId ? rawGoogleClientId.trim() : '';
  const isGoogleConfigured = googleClientId && googleClientId !== 'YOUR_GOOGLE_CLIENT_ID' && !googleClientId.startsWith('YOUR_');

  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const [showServerSplash, setShowServerSplash] = useState(false);
  const [showPasswordChangedModal, setShowPasswordChangedModal] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    localStorage.removeItem('curoxa_superadmin_session');
    const reason = localStorage.getItem('logout_reason');
    if (reason === 'password_changed') {
      setShowPasswordChangedModal(true);
      localStorage.removeItem('logout_reason');
    } else if (reason === 'session_expired' || reason === 'backend_disconnected') {
      localStorage.removeItem('logout_reason');
    }
  }, []);

  // Forgot Password states
  const [showForgotModal, setShowForgotModal] = useState(false);
  const [forgotStep, setForgotStep] = useState(1); // 1 = Request OTP, 2 = Verify & Reset
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotOtp, setForgotOtp] = useState('');
  const [forgotNewPassword, setForgotNewPassword] = useState('');
  const [forgotConfirmPassword, setForgotConfirmPassword] = useState('');
  const [forgotError, setForgotError] = useState('');
  const [forgotSuccess, setForgotSuccess] = useState('');

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
        default: break;
      }
    }
  }, [navigate]);

  // Pre-warm: fetch medicines + doctors in the background so the
  // first dashboard load (especially doctor's Rx) is instant.
  useEffect(() => {
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
      } catch (_) {
        // Pre-warm is best-effort
      }
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
        credential: response.credential
      });
      const { token, user, tenantModules, plan } = res.data;
      
      localStorage.setItem('token', token);
      localStorage.setItem('user', JSON.stringify(user));
      localStorage.setItem('tenantId', user.tenantId || 'city_hospital');
      localStorage.setItem('tenantModules', JSON.stringify(tenantModules || {}));
      localStorage.setItem('plan', plan || '');

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
        const btnContainer = document.getElementById("googleSignInButton");
        if (btnContainer) {
          try {
            google.accounts.id.initialize({
              client_id: googleClientId,
              callback: handleGoogleCredentialResponse,
              cancel_on_tap_outside: false
            });

            const containerWidth = btnContainer.offsetWidth || 320;
            const viewportLimit = window.innerWidth - 80;
            const clampedWidth = Math.max(200, Math.min(400, Math.min(containerWidth, viewportLimit)));

            google.accounts.id.renderButton(
              btnContainer,
              { 
                theme: "outline", 
                size: "large", 
                width: clampedWidth, 
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

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    setShowServerSplash(true);

    try {
      const response = await api.post('/auth/login', {
        staff_id: staffId,
        password: password
      });

      const { token, user, tenantModules, plan } = response.data;
      
      localStorage.setItem('token', token);
      localStorage.setItem('user', JSON.stringify(user));
      localStorage.setItem('tenantId', user.tenantId || 'city_hospital');
      localStorage.setItem('tenantModules', JSON.stringify(tenantModules || {}));
      localStorage.setItem('plan', plan || '');

      window.dispatchEvent(new CustomEvent('curoxa_login_success'));

      // Redirect based on role
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
      const response = await api.post('/auth/send-login-otp', {
        emailOrPhone: emailOrPhone
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
        otp: loginOtp
      });

      const { token, user, tenantModules, plan } = response.data;
      
      localStorage.setItem('token', token);
      localStorage.setItem('user', JSON.stringify(user));
      localStorage.setItem('tenantId', user.tenantId || 'city_hospital');
      localStorage.setItem('tenantModules', JSON.stringify(tenantModules || {}));
      localStorage.setItem('plan', plan || '');

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
        email: forgotEmail
      });
      setForgotSuccess(response.data.message ? `${response.data.message} (Please check your Spam/Junk folder if not received.)` : 'OTP sent successfully! Please check your inbox.');
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
        newPassword: forgotNewPassword
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
    <div 
      className="min-h-screen w-full flex flex-col lg:flex-row bg-[#F4F8FC] text-slate-900 font-sans selection:bg-blue-100 selection:text-blue-900 overflow-x-hidden relative bg-no-repeat"
      style={{ 
        backgroundImage: `url(${loginBg})`,
        backgroundSize: '100% auto',
        backgroundPosition: 'center -270px',
        imageRendering: '-webkit-optimize-contrast'
      }}
    >
      
      {/* LEFT SIDE: Brand & Promotional Area (Desktop ~55% / Transparent over full-viewport background) */}
      <div className="relative w-full lg:w-[55%] min-h-[440px] lg:min-h-screen flex flex-col justify-between p-6 sm:p-10 lg:p-14 xl:p-16 lg:pl-20 xl:pl-28 bg-transparent">
        
        {/* Top Header / Curoxa Logo */}
        <div className="relative z-10 lg:ml-4 xl:ml-6">
          <img 
            src={curoxaLogo} 
            alt="Curoxa Healthcare" 
            className="h-16 sm:h-20 lg:h-24 w-auto object-contain drop-shadow-sm" 
            onError={(e) => {
              e.target.src = '/curoxa_logo_transparent.png';
            }}
          />
        </div>

        {/* Main Promotional Copy positioned comfortably above the 3D dashboard illustration */}
        <div className="relative z-10 mt-2 lg:mt-3 mb-auto max-w-lg lg:ml-4 xl:ml-6">
          <div className="space-y-0.5">
            <h1 className="text-3xl sm:text-4xl lg:text-[44px] font-black tracking-tight text-slate-900 leading-[1.12]">
              Smarter Care.
            </h1>
            <h1 className="text-3xl sm:text-4xl lg:text-[44px] font-black tracking-tight bg-gradient-to-r from-blue-600 via-blue-500 to-cyan-500 bg-clip-text text-transparent leading-[1.12]">
              Better Outcomes.
            </h1>
          </div>

          <p className="mt-2 sm:mt-2.5 text-xs sm:text-sm lg:text-[15px] text-slate-600 font-normal leading-relaxed max-w-md">
            Track, manage, and optimize every clinical moment with <span className="font-semibold text-slate-800">Curoxa</span> — your complete hospital management solution.
          </p>
        </div>
      </div>

      {/* MIDDLE FLOATING PILLS & CONNECTION LINE: Exact Match to Reference Mockup */}
      <div className="hidden xl:block absolute left-[51%] top-[53%] -translate-x-1/2 -translate-y-1/2 w-[460px] h-[380px] pointer-events-none select-none z-10">
        {/* Continuous S-Curve Dashed Path matching reference */}
        <svg className="absolute inset-0 w-full h-full" viewBox="0 0 460 380" fill="none">
          {/* Main dashed connecting spline */}
          <path 
            d="M 10,75 C 65,60 120,48 185,55 C 245,62 295,40 335,48 C 365,55 375,105 325,145 C 285,175 235,172 225,205 C 215,240 175,265 205,290 C 235,315 305,305 355,270 C 375,255 395,245 425,250" 
            stroke="#93C5FD" 
            strokeWidth="1.5" 
            strokeDasharray="4 4" 
          />

          {/* Node 1: Left connector */}
          <circle cx="65" cy="62" r="5" fill="#93C5FD" fillOpacity="0.4" />
          <circle cx="65" cy="62" r="3" fill="#3B82F6" stroke="#FFFFFF" strokeWidth="1.5" />

          {/* Node 2: Top-right curve */}
          <circle cx="335" cy="48" r="5" fill="#93C5FD" fillOpacity="0.4" />
          <circle cx="335" cy="48" r="3" fill="#3B82F6" stroke="#FFFFFF" strokeWidth="1.5" />

          {/* Node 3: Center-left inflection */}
          <circle cx="195" cy="235" r="5" fill="#93C5FD" fillOpacity="0.4" />
          <circle cx="195" cy="235" r="3" fill="#3B82F6" stroke="#FFFFFF" strokeWidth="1.5" />

          {/* Node 4: Right exit towards Login Card */}
          <circle cx="355" cy="270" r="5" fill="#93C5FD" fillOpacity="0.4" />
          <circle cx="355" cy="270" r="3" fill="#3B82F6" stroke="#FFFFFF" strokeWidth="1.5" />
        </svg>

        {/* Badge 1: Secure */}
        <div className="absolute top-[55px] left-[185px] -translate-x-1/2 -translate-y-1/2 bg-white/95 backdrop-blur-md rounded-2xl shadow-[0_8px_30px_rgba(30,58,138,0.08)] border border-slate-100/90 px-4 py-2 flex items-center gap-2.5">
          <ShieldCheck className="w-4 h-4 text-blue-500 flex-shrink-0" />
          <span className="text-[13px] font-semibold text-slate-800 tracking-tight">Secure</span>
        </div>

        {/* Badge 2: Real-time */}
        <div className="absolute top-[165px] left-[285px] -translate-x-1/2 -translate-y-1/2 bg-white/95 backdrop-blur-md rounded-2xl shadow-[0_8px_30px_rgba(30,58,138,0.08)] border border-slate-100/90 px-4 py-2 flex items-center gap-2.5">
          <Activity className="w-4 h-4 text-blue-500 flex-shrink-0" />
          <span className="text-[13px] font-semibold text-slate-800 tracking-tight">Real-time</span>
        </div>

        {/* Badge 3: Connected */}
        <div className="absolute top-[290px] left-[215px] -translate-x-1/2 -translate-y-1/2 bg-white/95 backdrop-blur-md rounded-2xl shadow-[0_8px_30px_rgba(30,58,138,0.08)] border border-slate-100/90 px-4 py-2 flex items-center gap-2.5">
          <svg className="w-4 h-4 text-blue-500 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="5" r="2.5"/>
            <circle cx="6" cy="18" r="2.5"/>
            <circle cx="18" cy="18" r="2.5"/>
            <path d="m7.8 16 2.4-8.8"/>
            <path d="m16.2 16-2.4-8.8"/>
            <path d="M8.5 18h7"/>
          </svg>
          <span className="text-[13px] font-semibold text-slate-800 tracking-tight">Connected</span>
        </div>
      </div>

      {/* RIGHT SIDE: Floating Login Card Area (Desktop ~45% / Transparent over full-viewport background) */}
      <div className="w-full lg:w-[45%] flex flex-col justify-center items-center p-4 sm:p-8 lg:p-12 xl:p-16 bg-transparent">
        
        {/* Main Authentication Card */}
        <div className="w-full max-w-[440px] bg-white rounded-3xl border border-slate-200/80 shadow-[0_16px_48px_rgba(15,23,42,0.06)] p-6 sm:p-9 transition-all relative z-10">
          
          {/* Card Top Branding & Header */}
          <div className="text-center mb-6">
            <img 
              src={curoxaLogo} 
              alt="Curoxa" 
              className="h-14 sm:h-16 w-auto mx-auto object-contain mb-4 drop-shadow-sm" 
              onError={(e) => {
                e.target.src = '/curoxa_logo_transparent.png';
              }}
            />
            <h2 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
              Welcome back
            </h2>
            <p className="text-xs sm:text-sm text-slate-500 font-normal mt-1">
              Sign in to continue to Curoxa
            </p>
          </div>

          {/* Feedback Alerts */}
          {error && (
            <div className="mb-5 p-3 sm:p-3.5 rounded-xl bg-red-50/80 border border-red-200/80 text-red-700 text-xs font-medium flex items-start gap-2.5 animate-fadeIn">
              <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
              <span className="flex-1 leading-snug">{error}</span>
            </div>
          )}

          {success && (
            <div className="mb-5 p-3 sm:p-3.5 rounded-xl bg-emerald-50/80 border border-emerald-200/80 text-emerald-700 text-xs font-medium flex items-start gap-2.5 animate-fadeIn">
              <CheckCircle className="w-4 h-4 text-emerald-600 flex-shrink-0 mt-0.5" />
              <span className="flex-1 leading-snug">{success}</span>
            </div>
          )}

          {/* Form Switch: Password Mode vs OTP Mode */}
          {loginMethod === 'password' ? (
            /* PASSWORD LOGIN FORM */
            <form onSubmit={handleLogin} className="space-y-4">
              
              {/* Staff ID / Contact Input */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Staff ID / Contact Number
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                    <User className="w-4 h-4" />
                  </div>
                  <input
                    type="text"
                    required
                    value={staffId}
                    onChange={(e) => setStaffId(e.target.value.toLowerCase())}
                    placeholder="Enter your Staff ID or Contact Number"
                    className="w-full h-11 pl-10 pr-3.5 bg-white rounded-xl border border-slate-200 text-xs sm:text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 transition"
                  />
                </div>
              </div>

              {/* Password Input */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs font-semibold text-slate-700">
                    Password
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
                    className="text-xs font-medium text-blue-600 hover:text-blue-700 transition"
                  >
                    Forgot Password?
                  </button>
                </div>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                    <Lock className="w-4 h-4" />
                  </div>
                  <input
                    type={showPassword ? "text" : "password"}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter your password"
                    className="w-full h-11 pl-10 pr-10 bg-white rounded-xl border border-slate-200 text-xs sm:text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 transition"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400 hover:text-slate-600 transition"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Primary Log In Button */}
              <button
                type="submit"
                disabled={loading}
                className="w-full h-11 mt-2 rounded-xl bg-gradient-to-r from-blue-600 via-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white font-semibold text-sm shadow-md shadow-blue-500/15 hover:shadow-blue-500/25 active:scale-[0.99] transition duration-150 flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {loading ? (
                  <span className="flex items-center gap-2">
                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Logging in...
                  </span>
                ) : (
                  'Log In'
                )}
              </button>

              {/* Divider */}
              <div className="relative my-4 text-center">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-slate-200" />
                </div>
                <span className="relative bg-white px-3 text-xs font-semibold text-slate-400">
                  — OR —
                </span>
              </div>

              {/* Patient Portal Option (Subtle Green Tint) */}
              <button
                type="button"
                onClick={() => navigate('/patient/login')}
                className="w-full h-11 rounded-xl bg-emerald-50/70 hover:bg-emerald-100/70 border border-emerald-200 text-emerald-800 font-semibold text-xs sm:text-sm flex items-center justify-center gap-2 transition duration-150 shadow-sm"
              >
                <User className="w-4 h-4 text-emerald-600" />
                Patient Portal Login (with Email / OTP)
              </button>
            </form>
          ) : (
            /* OTP LOGIN FORM */
            <form onSubmit={!otpSent ? handleSendOtp : handleVerifyLoginOtp} className="space-y-4">
              {!otpSent ? (
                <>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                      Email or Mobile Number
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                        <Mail className="w-4 h-4" />
                      </div>
                      <input
                        type="text"
                        required
                        value={emailOrPhone}
                        onChange={(e) => setEmailOrPhone(e.target.value.toLowerCase())}
                        placeholder="Enter registered email or phone"
                        className="w-full h-11 pl-10 pr-3.5 bg-white rounded-xl border border-slate-200 text-xs sm:text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 transition"
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full h-11 rounded-xl bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white font-semibold text-sm shadow-md shadow-blue-500/15 active:scale-[0.99] transition duration-150 flex items-center justify-center gap-2 disabled:opacity-60"
                  >
                    {loading ? (
                      <span className="flex items-center gap-2">
                        <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        Sending OTP...
                      </span>
                    ) : (
                      'Send OTP'
                    )}
                  </button>
                </>
              ) : (
                <>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                      Contact Information
                    </label>
                    <input
                      type="text"
                      disabled
                      value={emailOrPhone}
                      className="w-full h-11 px-3.5 bg-slate-100 rounded-xl border border-slate-200 text-xs sm:text-sm text-slate-600 font-medium"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                      One-Time Password (OTP)
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                        <KeyRound className="w-4 h-4" />
                      </div>
                      <input
                        type="text"
                        required
                        maxLength={6}
                        value={loginOtp}
                        onChange={(e) => setLoginOtp(e.target.value)}
                        placeholder="Enter 6-digit OTP"
                        className="w-full h-11 pl-10 pr-3.5 bg-white rounded-xl border border-slate-200 text-xs sm:text-sm text-slate-900 tracking-widest placeholder:tracking-normal placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 transition"
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full h-11 rounded-xl bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white font-semibold text-sm shadow-md shadow-blue-500/15 active:scale-[0.99] transition duration-150 flex items-center justify-center gap-2 disabled:opacity-60"
                  >
                    {loading ? (
                      <span className="flex items-center gap-2">
                        <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        Verifying...
                      </span>
                    ) : (
                      'Verify & Log In'
                    )}
                  </button>

                  <div className="flex items-center justify-between text-xs pt-1">
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

              {/* Divider */}
              <div className="relative my-4 text-center">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-slate-200" />
                </div>
                <span className="relative bg-white px-3 text-xs font-semibold text-slate-400">
                  — OR —
                </span>
              </div>

              {/* Patient Portal Option */}
              <button
                type="button"
                onClick={() => navigate('/patient/login')}
                className="w-full h-11 rounded-xl bg-emerald-50/70 hover:bg-emerald-100/70 border border-emerald-200 text-emerald-800 font-semibold text-xs sm:text-sm flex items-center justify-center gap-2 transition duration-150 shadow-sm"
              >
                <User className="w-4 h-4 text-emerald-600" />
                Patient Portal Login (with Email / OTP)
              </button>
            </form>
          )}

          {/* OTP Mode Toggle Option (Matching Reference UI) */}
          <div className="mt-5 text-center pt-2">
            <span className="text-xs text-slate-600 font-normal">
              {loginMethod === 'password' ? (
                <>
                  Prefer login without password?{' '}
                  <button
                    type="button"
                    onClick={() => {
                      setLoginMethod('otp');
                      setError('');
                      setSuccess('');
                      setOtpSent(false);
                    }}
                    className="text-blue-600 font-bold hover:text-blue-700 hover:underline transition"
                  >
                    Use OTP Login
                  </button>
                </>
              ) : (
                <>
                  Know your password?{' '}
                  <button
                    type="button"
                    onClick={() => {
                      setLoginMethod('password');
                      setError('');
                      setSuccess('');
                    }}
                    className="text-blue-600 font-bold hover:text-blue-700 hover:underline transition"
                  >
                    Use Password Login
                  </button>
                </>
              )}
            </span>
          </div>

        </div>

        {/* Global Footer Copyright */}
        <div className="mt-8 text-center relative z-10">
          <p className="text-xs text-slate-400 font-medium">
            © 2026 Curoxa Healthcare Systems. All rights reserved.
          </p>
        </div>

      </div>

      {/* Server Wake-Up Splash Overlay */}
      {showServerSplash && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-8 max-w-sm w-full text-center shadow-2xl border border-slate-100 flex flex-col items-center">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-blue-600 to-cyan-500 text-white flex items-center justify-center text-2xl font-black shadow-lg shadow-blue-500/30 mb-4">
              C
            </div>
            <h3 className="text-lg font-bold text-slate-900 mb-1">Logging in…</h3>
            <p className="text-xs text-slate-500 leading-relaxed mb-5">
              Authenticating your credentials and securing your clinical session…
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
              Understand & Sign In
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
                <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
                <span>{forgotError}</span>
              </div>
            )}

            {forgotSuccess && (
              <div className="mb-4 p-3 rounded-xl bg-emerald-50 text-emerald-700 text-xs font-medium flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                <span>{forgotSuccess}</span>
              </div>
            )}

            {forgotStep === 1 ? (
              <form onSubmit={handleRequestOtp} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">Email Address</label>
                  <input
                    type="email"
                    required
                    value={forgotEmail}
                    onChange={(e) => setForgotEmail(e.target.value)}
                    placeholder="name@example.com"
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
                    className="flex-[1.5] h-11 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs shadow-md shadow-blue-500/15 transition disabled:opacity-60"
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
                    className="flex-[1.5] h-11 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs shadow-md shadow-blue-500/15 transition disabled:opacity-60"
                  >
                    {loading ? 'Resetting...' : 'Reset Password'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* Google OAuth Modal */}
      {showGoogleModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-7 max-w-md w-full shadow-2xl border border-slate-100">
            <div className="text-center mb-5">
              <h3 className="text-base font-bold text-slate-900">Google Sign-In Options</h3>
              <p className="text-xs text-slate-500 mt-1">Configure real login or use developer simulation</p>
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
                    💡 Set the Google Client ID in your .env files to enable real user authentication.
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
                          const { token, user, tenantModules, plan } = res.data;
                          localStorage.setItem('token', token);
                          localStorage.setItem('user', JSON.stringify(user));
                          localStorage.setItem('tenantId', user.tenantId || 'city_hospital');
                          localStorage.setItem('tenantModules', JSON.stringify(tenantModules || {}));
                          localStorage.setItem('plan', plan || '');
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
