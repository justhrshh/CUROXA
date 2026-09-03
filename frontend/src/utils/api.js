import axios from 'axios';

const api = axios.create({
  baseURL: (typeof import.meta !== 'undefined' && import.meta.env ? import.meta.env.VITE_API_URL : null) || 'https://curoxa.onrender.com/api'
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

/**
 * Clears authentication state on logout.
 * If preservePortal is true (when returning to /portal/:hospitalId), retains the active portal ID
 * and does not overwrite dynamic document title/favicon with generic defaults.
 * If preservePortal is false (default/generic logout), removes active portal pointer and resets title/favicon.
 */
export const clearPortalAuthContext = ({ preservePortal = false } = {}) => {
  localStorage.removeItem('token');
  localStorage.removeItem('user');
  localStorage.removeItem('tenantId');
  localStorage.removeItem('tenantModules');
  localStorage.removeItem('plan');
  localStorage.removeItem('doctorClinicalMode');
  localStorage.removeItem('curoxa_superadmin_session');
  try {
    sessionStorage.removeItem('curoxa_return_portal');
  } catch (e) {}

  if (!preservePortal) {
    localStorage.removeItem('curoxa_active_portal_id');
    // Restore document title and favicon to standard Curoxa platform defaults
    try {
      document.title = 'Curoxa - Healthcare Dashboard';
      const faviconEl = document.getElementById('curoxa-dynamic-favicon') || document.querySelector("link[rel*='icon']");
      if (faviconEl) {
        faviconEl.setAttribute('href', '/curoxa_icon_logo.png');
      }
    } catch (e) {}
  }
};

/**
 * Centralized portal-aware logout workflow:
 * 1. Captures active portal ID before clearing auth state.
 * 2. Clears all authenticated credentials and session data.
 * 3. If active portal ID exists, returns to `/portal/${portalId}` (retaining hospital branding & login context).
 * 4. Otherwise returns to generic `/login` (with global Curoxa branding).
 */
export const performLogout = (navigate) => {
  const portalId = localStorage.getItem('curoxa_active_portal_id');
  if (portalId) {
    clearPortalAuthContext({ preservePortal: true });
    window.dispatchEvent(new CustomEvent('curoxa_logout'));
    if (typeof navigate === 'function') {
      navigate(`/portal/${portalId}`);
    } else {
      window.location.href = `/portal/${portalId}`;
    }
  } else {
    clearPortalAuthContext({ preservePortal: false });
    window.dispatchEvent(new CustomEvent('curoxa_logout'));
    if (typeof navigate === 'function') {
      navigate('/login');
    } else {
      window.location.href = '/login';
    }
  }
};

export const handleAutoLogout = (reason = 'session_expired') => {
  if (window.location.pathname === '/login') return;
  console.warn('[AUTH] Disconnected from backend or session invalid. Automatically logging out...');
  localStorage.setItem('logout_reason', reason);
  performLogout();
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
                                 window.location.pathname === '/login' ||
                                 window.location.pathname.startsWith('/portal/');

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
