import axios from 'axios';

const api = axios.create({
  baseURL: (typeof import.meta !== 'undefined' && import.meta.env ? import.meta.env.VITE_API_URL : null) || '/api' // Uses Vercel environment variable or defaults to local proxy
});

// ═══════════════════════════════════════════════════════════════════
// BREAK-GLASS EMERGENCY BYPASS (DPDP Act 2023 Compliant)
// ═══════════════════════════════════════════════════════════════════
// When activated by an authorized doctor, this flag injects the
// `x-bypass-consent-emergency` header into ALL outbound API requests.
// The backend complianceMiddleware will allow access even if patient
// consent is withdrawn, while simultaneously logging a high-priority
// EMERGENCY_BYPASS audit entry for DPO review.
// ═══════════════════════════════════════════════════════════════════
let _emergencyBypassActive = false;

export const setEmergencyBypass = (active) => {
  _emergencyBypassActive = !!active;
  if (active) {
    console.warn('[BREAK-GLASS] Emergency consent bypass ACTIVATED — all EMR requests will bypass patient consent checks. This action is logged.');
  } else {
    console.info('[BREAK-GLASS] Emergency consent bypass DEACTIVATED — normal consent checks restored.');
  }
};

export const isEmergencyBypassActive = () => _emergencyBypassActive;

// Request interceptor to add the token to headers
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers['Authorization'] = `Bearer ${token}`;
    }
    
    const tenantId = localStorage.getItem('tenantId');
    if (tenantId) {
      config.headers['x-tenant-id'] = tenantId;
    }

    // Inject emergency bypass header when Break-Glass mode is active
    if (_emergencyBypassActive) {
      config.headers['x-bypass-consent-emergency'] = 'true';
    }

    if (config.method === 'get') {
      config.headers['Cache-Control'] = 'no-cache';
    }

    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

export const handleAutoLogout = (reason = 'session_expired') => {
  if (window.location.pathname === '/login') return;
  console.warn('[AUTH] Disconnected from backend or session invalid. Automatically logging out...');
  localStorage.setItem('logout_reason', reason);
  localStorage.removeItem('token');
  localStorage.removeItem('user');
  localStorage.removeItem('tenantId');
  localStorage.removeItem('tenantModules');
  localStorage.removeItem('plan');
  localStorage.removeItem('curoxa_superadmin_session');
  window.dispatchEvent(new CustomEvent('curoxa_logout'));
  window.location.href = '/login';
};

// Response interceptor to handle token expiration/unauthorized errors (401 / 403) and backend disconnection
api.interceptors.response.use(
  (response) => {
    return response;
  },
  (error) => {
    const hasToken = !!localStorage.getItem('token');
    const isAuthRequest = error.config && error.config.url && (
      error.config.url.includes('/login') ||
      error.config.url.includes('/register') ||
      error.config.url.includes('/google-login') ||
      error.config.url.includes('/verify-otp') ||
      error.config.url.includes('/forgot-password')
    );

    if (error.response && error.response.status === 401) {
      const isSubscriptionError = error.response.data && 
        (typeof error.response.data.error === 'string') && 
        (error.response.data.error.toLowerCase().includes('limit') || 
         error.response.data.error.toLowerCase().includes('upgrade') ||
         error.response.data.error.toLowerCase().includes('subscription'));

      const isPatientAuthRoute = window.location.pathname.startsWith('/patient-register') || 
                                 window.location.pathname.startsWith('/patient/login') ||
                                 window.location.pathname === '/login';

      // Only force redirect and logout if not on auth request/login page and not a subscription limit error
      if (!isAuthRequest && !isPatientAuthRoute && !isSubscriptionError) {
        const reason = (error.response.data && error.response.data.error === 'Password changed') 
          ? 'password_changed' 
          : 'session_expired';
        handleAutoLogout(reason);
      }
    }
    return Promise.reject(error);
  }
);

export default api;
