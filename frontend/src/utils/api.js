import axios from 'axios';
import {
  getAccessToken,
  setAccessToken,
  clearAccessToken,
  broadcastAuthEvent,
  subscribeAuthChannel,
  executeWithRefreshLock,
  getTabId
} from './authTokenStore';
import { updateSocketAuth, disconnectSocket } from './socket';

// Re-export in-memory token helpers for application-wide convenience
export {
  getAccessToken,
  setAccessToken,
  clearAccessToken,
  broadcastAuthEvent,
  subscribeAuthChannel,
  executeWithRefreshLock,
  getTabId
};

const api = axios.create({
  baseURL: (typeof import.meta !== 'undefined' && import.meta.env ? import.meta.env.VITE_API_URL : null) || 'https://curoxa.onrender.com/api',
  withCredentials: true
});
axios.defaults.withCredentials = true;

if (typeof window !== 'undefined') {
  window.__quroxa_api = api;
  window.__quroxa_getAccessToken = getAccessToken;
  window.__quroxa_setAccessToken = setAccessToken;
}

export const getApiBaseUrl = () => {
  return (typeof import.meta !== 'undefined' && import.meta.env ? import.meta.env.VITE_API_URL : null) || 'https://curoxa.onrender.com/api';
};

export const getApiUrl = (endpoint = '') => {
  const base = getApiBaseUrl();
  if (!endpoint) return base;
  if (typeof endpoint !== 'string') return endpoint;
  if (endpoint.startsWith('http://') || endpoint.startsWith('https://') || endpoint.startsWith('data:')) return endpoint;
  const cleanEndpoint = endpoint.startsWith('/api') ? endpoint.slice(4) : endpoint;
  const baseClean = base.endsWith('/') ? base.slice(0, -1) : base;
  const pathClean = cleanEndpoint.startsWith('/') ? cleanEndpoint : `/${cleanEndpoint}`;
  return `${baseClean}${pathClean}`;
};

// ═══════════════════════════════════════════════════════════════════
// BREAK-GLASS EMERGENCY BYPASS (DPDP Act 2023 Compliant)
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

/**
 * Proactive refresh threshold in seconds.
 * Fast path: if token has > 60s remaining lifetime, executes immediately with zero network overhead.
 * Exception path: if token is within 60s of expiring or expired, single-flight refresh is invoked.
 */
export const PROACTIVE_REFRESH_THRESHOLD_SEC = 60;

/**
 * Decodes the exp claim from a JWT payload locally in memory without any network call.
 * Purely a local optimization hint; server verification remains authoritative.
 *
 * @param {string} token - JWT token string
 * @returns {number|null} Expiration Unix timestamp in seconds, or null
 */
export const parseJwtExp = (token) => {
  if (!token || typeof token !== 'string') return null;
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const jsonStr = typeof atob === 'function'
      ? atob(base64)
      : (typeof Buffer !== 'undefined' ? Buffer.from(base64, 'base64').toString('utf8') : null);
    if (!jsonStr) return null;
    const payload = JSON.parse(jsonStr);
    return typeof payload.exp === 'number' ? payload.exp : null;
  } catch (e) {
    return null;
  }
};

// ═══════════════════════════════════════════════════════════════════
// REQUEST INTERCEPTOR (IN-MEMORY ACCESS TOKEN ATTACHMENT & FAST-PATH EXPIRY)
// ═══════════════════════════════════════════════════════════════════
api.interceptors.request.use(
  async (config) => {
    // If request explicitly marked skipAuthRefresh, do not attach expired Authorization
    if (config._skipAuthRefresh) {
      return config;
    }

    // 1. Obtain access token strictly from in-memory token store
    let token = getAccessToken();

    // Proactive refresh optimization for staff in-memory access token:
    // FAST PATH: If token has > 60s remaining lifetime, proceed immediately without refresh.
    // EXCEPTION PATH: If token is within 60s threshold or expired, invoke single-flight refresh.
    if (token) {
      const exp = parseJwtExp(token);
      if (exp) {
        const remainingSec = exp - Math.floor(Date.now() / 1000);
        if (remainingSec <= PROACTIVE_REFRESH_THRESHOLD_SEC) {
          try {
            const newToken = await refreshAccessToken();
            if (newToken) {
              token = newToken;
            }
          } catch (refreshErr) {
            // Proactive refresh failed; proceed with existing token and let response interceptor handle 401
          }
        }
      }
    }

    // Fallback ONLY for patient portal or superadmin hospital impersonation
    if (!token && typeof localStorage !== 'undefined') {
      const storedUser = localStorage.getItem('user');
      const isImpersonating = !!localStorage.getItem('curoxa_superadmin_session');
      let isPatient = false;
      try {
        const u = storedUser ? JSON.parse(storedUser) : null;
        isPatient = u ? u.role === 'patient' : false;
      } catch (e) {}

      if (isImpersonating || isPatient) {
        token = localStorage.getItem('token');
      } else if (storedUser && !config._skipAuthRefresh) {
        // Staff session exists in localStorage but access token is missing from memory (page reload).
        // Await single-flight refresh to restore token before sending request.
        const url = config.url || '';
        const isExcluded =
          url.includes('/auth/refresh') ||
          url.includes('/auth/login') ||
          url.includes('/auth/login-with-otp') ||
          url.includes('/auth/google-login') ||
          url.includes('/auth/send-login-otp') ||
          url.includes('/auth/forgot-password') ||
          url.includes('/auth/verify-otp') ||
          url.includes('/auth/logout') ||
          url.includes('/auth/ping') ||
          url.includes('/public-queue/') ||
          url.includes('/public/portal/') ||
          url.includes('/public/patient/');

        if (!isExcluded) {
          try {
            const restoredToken = await refreshAccessToken();
            if (restoredToken) {
              token = restoredToken;
            }
          } catch (restoreErr) {
            // If restoration fails, request proceeds without token and 401 interceptor handles cleanup
          }
        }
      }
    }

    if (token && !config.headers['Authorization']) {
      config.headers['Authorization'] = `Bearer ${token}`;
    }

    const tenantId = typeof localStorage !== 'undefined' ? localStorage.getItem('tenantId') : null;
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

// ═══════════════════════════════════════════════════════════════════
// CONCURRENT 401 / REFRESH RACE CONTROL (SINGLE-FLIGHT REFRESH)
// ═══════════════════════════════════════════════════════════════════
let _refreshPromise = null;

/**
 * Executes a single-flight refresh request to POST /api/auth/refresh.
 * Relies exclusively on the HttpOnly refresh cookie (withCredentials: true).
 * NEVER sends refreshToken in JSON body.
 * Merges concurrent calls inside the same tab into _refreshPromise.
 * Coordinates across sibling tabs via executeWithRefreshLock (Web Locks API + fallback)
 * to prevent simultaneous refresh-token rotations and avoid token reuse conflicts.
 *
 * @returns {Promise<string>} The newly issued 24h access token
 */
export const refreshAccessToken = async () => {
  if (_refreshPromise) {
    return _refreshPromise;
  }

  _refreshPromise = (async () => {
    try {
      const result = await executeWithRefreshLock(async () => {
        const response = await axios.post(
          getApiUrl('/auth/refresh'),
          {}, // Empty body: refresh token is strictly in HttpOnly cookie
          {
            withCredentials: true,
            headers: {
              'Cache-Control': 'no-cache'
            },
            _skipAuthRefresh: true
          }
        );

        const newToken = response.data?.token;
        if (!newToken) {
          throw new Error('No access token returned from refresh endpoint');
        }
        return newToken;
      });

      const activeToken = result.token || getAccessToken();
      if (!activeToken) {
        throw new Error('No access token available after coordinated refresh');
      }

      // ── PHASE 2C: UPDATE ACTIVE SOCKET CLIENT AUTHENTICATION ──
      try {
        updateSocketAuth(activeToken);
      } catch (sockErr) {
        // Socket update notice
      }

      return activeToken;
    } catch (err) {
      clearAccessToken();
      throw err;
    } finally {
      _refreshPromise = null;
    }
  })();

  return _refreshPromise;
};

/**
 * Clears authentication state on logout.
 */
export const clearPortalAuthContext = ({ preservePortal = false } = {}) => {
  clearAccessToken();
  if (typeof localStorage !== 'undefined') {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    localStorage.removeItem('tenantId');
    localStorage.removeItem('tenantModules');
    localStorage.removeItem('plan');
    localStorage.removeItem('doctorClinicalMode');
    localStorage.removeItem('curoxa_superadmin_session');
    localStorage.removeItem('quroxa_last_refresh_time');
    localStorage.removeItem('quroxa_last_refresh_fail_time');
  }
  try {
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.removeItem('curoxa_return_portal');
    }
  } catch (e) {}

  if (!preservePortal && typeof localStorage !== 'undefined') {
    localStorage.removeItem('curoxa_active_portal_id');
    try {
      document.title = 'Quroxa - Healthcare Dashboard';
      const faviconEl = document.getElementById('curoxa-dynamic-favicon') || document.querySelector("link[rel*='icon']");
      if (faviconEl) {
        faviconEl.setAttribute('href', '/curoxa_icon_logo.png');
      }
    } catch (e) {}
  }
};

/**
 * Centralized portal-aware logout workflow:
 * 1. Calls POST /api/auth/logout with credentials enabled to revoke refresh session on server.
 * 2. Broadcasts LOGOUT event to other tabs.
 * 3. Clears in-memory access token and local auth state.
 * 4. Navigates to appropriate login route/portal.
 */
export const performLogout = async (navigate) => {
  // Fire server-side logout with HttpOnly cookie automatically sent via withCredentials: true.
  // Body is strictly empty {} — NEVER sends refreshToken in JSON.
  try {
    await axios.post(
      getApiUrl('/auth/logout'),
      {},
      {
        withCredentials: true,
        _skipAuthRefresh: true
      }
    );
  } catch (err) {
    console.warn('[AUTH] Server logout error (proceeding with local cleanup):', err.message);
  }

  broadcastAuthEvent('LOGOUT');
  clearAccessToken();
  disconnectSocket();

  const portalId = typeof localStorage !== 'undefined' ? localStorage.getItem('curoxa_active_portal_id') : null;
  if (portalId) {
    clearPortalAuthContext({ preservePortal: true });
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('curoxa_logout'));
    }
    if (typeof navigate === 'function') {
      navigate(`/portal/${portalId}`);
    } else if (typeof window !== 'undefined') {
      window.location.href = `/portal/${portalId}`;
    }
  } else {
    clearPortalAuthContext({ preservePortal: false });
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('curoxa_logout'));
    }
    if (typeof navigate === 'function') {
      navigate('/login');
    } else if (typeof window !== 'undefined') {
      window.location.href = '/login';
    }
  }
};

export const handleAutoLogout = (reason = 'session_expired') => {
  if (typeof window !== 'undefined' && window.location.pathname === '/login') return;
  console.warn('[AUTH] Session invalid or expired. Automatically logging out...');
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem('logout_reason', reason);
  }
  performLogout();
};

// ═══════════════════════════════════════════════════════════════════
// RESPONSE INTERCEPTOR (401 REFRESH AND RETRY)
// ═══════════════════════════════════════════════════════════════════
api.interceptors.response.use(
  (response) => {
    return response;
  },
  async (error) => {
    const originalRequest = error.config;

    // If no response or status is not 401, reject immediately
    if (!error.response || error.response.status !== 401) {
      return Promise.reject(error);
    }

    // Check if request is eligible for refresh
    if (!originalRequest || originalRequest._retry || originalRequest._skipAuthRefresh) {
      return Promise.reject(error);
    }

    const url = originalRequest.url || '';
    const isExcludedEndpoint =
      url.includes('/auth/refresh') ||
      url.includes('/auth/login') ||
      url.includes('/auth/login-with-otp') ||
      url.includes('/auth/google-login') ||
      url.includes('/auth/send-login-otp') ||
      url.includes('/auth/forgot-password') ||
      url.includes('/auth/verify-otp') ||
      url.includes('/auth/logout') ||
      url.includes('/public-queue/') ||
      url.includes('/public/portal/') ||
      url.includes('/public/patient/');

    const isPatientRoute = typeof window !== 'undefined' && (
      window.location.pathname.startsWith('/patient') ||
      window.location.pathname.startsWith('/portal/') ||
      window.location.pathname === '/login'
    );

    const isPatientUser = (() => {
      try {
        const u = typeof localStorage !== 'undefined' ? localStorage.getItem('user') : null;
        return u ? JSON.parse(u)?.role === 'patient' : false;
      } catch (e) {
        return false;
      }
    })();

    const isImpersonating = typeof localStorage !== 'undefined' && !!localStorage.getItem('curoxa_superadmin_session');

    // If excluded from staff refresh, reject normally without refresh
    if (isExcludedEndpoint || isPatientRoute || isPatientUser || isImpersonating) {
      return Promise.reject(error);
    }

    // Exclude subscription limit errors
    const isSubscriptionError = error.response.data &&
      typeof error.response.data.error === 'string' &&
      (error.response.data.error.toLowerCase().includes('limit') ||
       error.response.data.error.toLowerCase().includes('upgrade') ||
       error.response.data.error.toLowerCase().includes('subscription'));

    if (isSubscriptionError) {
      return Promise.reject(error);
    }

    // Mark request as retried to prevent infinite loops
    originalRequest._retry = true;

    try {
      // Execute single-flight refresh
      const newToken = await refreshAccessToken();

      // Retry original request ONCE with new access token
      originalRequest.headers = originalRequest.headers || {};
      originalRequest.headers['Authorization'] = `Bearer ${newToken}`;
      return api(originalRequest);
    } catch (refreshErr) {
      clearAccessToken();
      broadcastAuthEvent('SESSION_EXPIRED');
      const reason = (error.response.data && error.response.data.error === 'Password changed')
        ? 'password_changed'
        : 'session_expired';
      handleAutoLogout(reason);
      return Promise.reject(refreshErr);
    }
  }
);

export default api;
