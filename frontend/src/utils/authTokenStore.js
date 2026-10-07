/**
 * QUROXA — FRONTEND IN-MEMORY ACCESS TOKEN STORE & CROSS-TAB COORDINATION
 *
 * Provides in-memory access-token lifecycle management for staff/admin sessions.
 * Security boundaries and guarantees:
 * - Access token is not persisted in browser storage (localStorage, sessionStorage, IndexedDB).
 * - Access token exists only in runtime JavaScript memory.
 * - Access token is lost on full page reload; a valid HttpOnly refresh cookie restores the session.
 * - Access tokens and credentials are NEVER transmitted over BroadcastChannel, window messaging,
 *   localStorage, URLs, query parameters, or any cross-tab storage/communication mechanism.
 * - Note: In-memory JavaScript tokens are not immune to arbitrary XSS; runtime memory protection
 *   mitigates persistent storage exfiltration while maintaining defense-in-depth.
 */

let _accessToken = null;
let _lastRefreshCompletedTime = 0;
let _lastRefreshFailedTime = 0;

/**
 * Returns a unique, stable non-secret tab identifier for cross-tab coordination.
 * @returns {string}
 */
export const getTabId = () => {
  if (typeof window !== 'undefined') {
    if (!window.__quroxaTabId) {
      window.__quroxaTabId = `tab_${Math.random().toString(36).substring(2, 9)}_${Date.now()}`;
    }
    return window.__quroxaTabId;
  }
  return 'tab_default';
};

/**
 * Retrieves the current in-memory access token.
 * @returns {string|null}
 */
export const getAccessToken = () => {
  return _accessToken;
};

/**
 * Stores a new access token in module memory.
 * @param {string|null} token
 */
export const setAccessToken = (token) => {
  _accessToken = typeof token === 'string' && token.trim() ? token.trim() : null;
};

/**
 * Clears the in-memory access token.
 */
export const clearAccessToken = () => {
  _accessToken = null;
};

export const getLastRefreshTime = () => {
  if (typeof localStorage !== 'undefined') {
    try {
      const stored = localStorage.getItem('quroxa_last_refresh_time');
      if (stored) {
        const parsed = parseInt(stored, 10);
        if (!isNaN(parsed)) return Math.max(_lastRefreshCompletedTime, parsed);
      }
    } catch (e) {}
  }
  return _lastRefreshCompletedTime;
};

export const setLastRefreshTime = (ts) => {
  _lastRefreshCompletedTime = ts;
  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.setItem('quroxa_last_refresh_time', String(ts));
    } catch (e) {}
  }
};

export const getLastRefreshFailTime = () => {
  if (typeof localStorage !== 'undefined') {
    try {
      const stored = localStorage.getItem('quroxa_last_refresh_fail_time');
      if (stored) {
        const parsed = parseInt(stored, 10);
        if (!isNaN(parsed)) return Math.max(_lastRefreshFailedTime, parsed);
      }
    } catch (e) {}
  }
  return _lastRefreshFailedTime;
};

export const setLastRefreshFailTime = (ts) => {
  _lastRefreshFailedTime = ts;
  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.setItem('quroxa_last_refresh_fail_time', String(ts));
    } catch (e) {}
  }
};

// ═══════════════════════════════════════════════════════════════════
// CROSS-TAB BROADCASTCHANNEL & PAYLOAD SANITIZATION
// ═══════════════════════════════════════════════════════════════════

let _authChannel = null;
try {
  if (typeof window !== 'undefined' && typeof window.BroadcastChannel !== 'undefined') {
    _authChannel = new window.BroadcastChannel('quroxa-auth');
  }
} catch (e) {
  _authChannel = null;
}

const FORBIDDEN_PAYLOAD_KEYS = new Set([
  'token',
  'accesstoken',
  'refreshtoken',
  'jwt',
  'authorization',
  'bearer',
  'password',
  'secret',
  'credential',
  'user'
]);

/**
 * Recursively sanitizes broadcast payloads to guarantee NO credentials or tokens
 * can EVER be transmitted across tabs.
 *
 * @param {Object} payload
 * @returns {Object} Cleaned, credential-free payload
 */
export const sanitizeBroadcastPayload = (payload) => {
  if (!payload || typeof payload !== 'object') return {};
  const cleaned = {};

  for (const [key, value] of Object.entries(payload)) {
    const normalizedKey = key.toLowerCase().replace(/[-_]/g, '');
    if (FORBIDDEN_PAYLOAD_KEYS.has(normalizedKey)) {
      console.warn(`[AUTH_SECURITY_ALERT] Prohibited credential key "${key}" detected in broadcast attempt. Stripped.`);
      continue;
    }

    if (typeof value === 'string') {
      const trimmed = value.trim();
      // Block Bearer prefixes or strings matching standard 3-part JWT regex
      if (
        trimmed.startsWith('Bearer ') ||
        /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(trimmed)
      ) {
        console.warn(`[AUTH_SECURITY_ALERT] Credential value pattern detected under key "${key}". Stripped.`);
        continue;
      }
      cleaned[key] = value;
    } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      cleaned[key] = sanitizeBroadcastPayload(value);
    } else if (Array.isArray(value)) {
      cleaned[key] = value.filter(item => {
        if (typeof item === 'string') {
          return !item.startsWith('Bearer ') && !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(item.trim());
        }
        return true;
      });
    } else {
      cleaned[key] = value;
    }
  }

  return cleaned;
};

/**
 * Dispatches a non-sensitive authentication lifecycle event to sibling browser tabs.
 * Never broadcasts sensitive credentials or tokens.
 *
 * @param {string} type - Event identifier (e.g., 'SESSION_UPDATED', 'LOGOUT', 'SESSION_EXPIRED')
 * @param {Object} [payload={}] - Non-sensitive state metadata
 */
export const broadcastAuthEvent = (type, payload = {}) => {
  if (_authChannel) {
    try {
      const sanitizedPayload = sanitizeBroadcastPayload(payload);
      _authChannel.postMessage({
        type,
        timestamp: Date.now(),
        originTabId: getTabId(),
        ...sanitizedPayload
      });
    } catch (e) {
      console.warn('[AUTH_SYNC] BroadcastChannel message dispatch warning:', e);
    }
  }
};

/**
 * Subscribes a listener to cross-tab auth events.
 * Automatically filters out events dispatched by this own tab instance.
 *
 * @param {Function} handler - Receives { type, timestamp, originTabId, ... }
 * @returns {Function} Unsubscribe cleanup function
 */
export const subscribeAuthChannel = (handler) => {
  if (!_authChannel || typeof handler !== 'function') {
    return () => {};
  }

  const messageListener = (event) => {
    try {
      const data = event.data;
      if (data && data.type) {
        const myTabId = getTabId();
        // Do not process messages dispatched by this own tab instance
        if (data.originTabId && data.originTabId === myTabId) {
          return;
        }
        handler(data);
      }
    } catch (e) {
      console.error('[AUTH_SYNC] Error in channel message listener:', e);
    }
  };

  _authChannel.addEventListener('message', messageListener);
  return () => {
    try {
      _authChannel.removeEventListener('message', messageListener);
    } catch (e) {}
  };
};

// ═══════════════════════════════════════════════════════════════════
// CROSS-TAB REFRESH COORDINATION (WEB LOCKS + SAFE FALLBACK)
// ═══════════════════════════════════════════════════════════════════

const FALLBACK_LOCK_KEY = 'quroxa_auth_refresh_lock';

/**
 * Fallback lock acquisition using non-secret coordination marker in localStorage
 * with stale-lock recovery (TTL expiration) for environments lacking Web Locks API.
 */
const acquireFallbackLock = async (lockTtlMs = 6000, maxWaitMs = 12000) => {
  const startWait = Date.now();
  const myTabId = getTabId();

  while (Date.now() - startWait < maxWaitMs) {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(FALLBACK_LOCK_KEY) : null;
    let lockData = null;
    if (raw) {
      try {
        lockData = JSON.parse(raw);
      } catch (e) {}
    }

    const now = Date.now();
    // If no active lock, or existing lock has expired (stale lock recovery)
    if (!lockData || now > (lockData.expiresAt || 0)) {
      const newLock = {
        owner: myTabId,
        timestamp: now,
        expiresAt: now + lockTtlMs
      };

      try {
        localStorage.setItem(FALLBACK_LOCK_KEY, JSON.stringify(newLock));
        // Verify acquisition
        const verification = JSON.parse(localStorage.getItem(FALLBACK_LOCK_KEY) || '{}');
        if (verification.owner === myTabId) {
          return () => {
            try {
              const current = JSON.parse(localStorage.getItem(FALLBACK_LOCK_KEY) || '{}');
              if (current.owner === myTabId) {
                localStorage.removeItem(FALLBACK_LOCK_KEY);
              }
            } catch (e) {}
          };
        }
      } catch (e) {}
    }

    // Wait 50ms before re-checking
    await new Promise(resolve => setTimeout(resolve, 50));
  }

  // Force break stale lock if timed out
  return () => {
    try {
      localStorage.removeItem(FALLBACK_LOCK_KEY);
    } catch (e) {}
  };
};

/**
 * Executes a token refresh action within an exclusive cross-tab lock.
 * Ensures that across multiple browser tabs:
 * 1. Only ONE tab performs the network refresh rotation at a time.
 * 2. Waiting tabs detect that another tab already refreshed the session and
 *    do not issue redundant backend refresh requests.
 * 3. Token reuse detection conflicts on rotated cookies are completely eliminated.
 *
 * @param {Function} refreshAction - Async function that performs the network POST /api/auth/refresh
 * @returns {Promise<{ alreadyRefreshed: boolean, token: string|null }>}
 */
export const executeWithRefreshLock = async (refreshAction) => {
  const requestStartTime = Date.now();
  const hasWebLocks = typeof navigator !== 'undefined' &&
    navigator.locks &&
    typeof navigator.locks.request === 'function';

  const runWithLockInternal = async () => {
    // 1. Check if another tab completed a refresh while this tab was queued
    // (Only skip refresh if current tab already possesses an active in-memory token)
    const lastCompleted = getLastRefreshTime();
    if (getAccessToken() && lastCompleted && lastCompleted >= requestStartTime) {
      return {
        alreadyRefreshed: true,
        token: getAccessToken()
      };
    }

    // 2. Check if another tab definitively failed refresh while this tab was queued
    const lastFailed = getLastRefreshFailTime();
    if (lastFailed && lastFailed > requestStartTime) {
      throw new Error('Refresh session invalid or expired');
    }

    // 3. This tab is the leader: perform refresh rotation
    broadcastAuthEvent('REFRESH_STARTED');
    try {
      const newToken = await refreshAction();
      setAccessToken(newToken);
      const completionTime = Date.now();
      setLastRefreshTime(completionTime);
      broadcastAuthEvent('REFRESH_COMPLETED');
      broadcastAuthEvent('SESSION_UPDATED');
      return {
        alreadyRefreshed: false,
        token: newToken
      };
    } catch (err) {
      clearAccessToken();
      const failureTime = Date.now();
      setLastRefreshFailTime(failureTime);
      broadcastAuthEvent('REFRESH_FAILED');
      broadcastAuthEvent('SESSION_EXPIRED');
      throw err;
    }
  };

  if (hasWebLocks) {
    return navigator.locks.request('quroxa-auth-refresh', async () => {
      return runWithLockInternal();
    });
  } else {
    const releaseFallbackLock = await acquireFallbackLock();
    try {
      return await runWithLockInternal();
    } finally {
      releaseFallbackLock();
    }
  }
};
