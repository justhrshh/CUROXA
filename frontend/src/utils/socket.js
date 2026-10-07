import { io } from 'socket.io-client';
import { getAccessToken } from './authTokenStore';

const apiUrl = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_URL) || 'https://curoxa.onrender.com/api';
// Strip '/api' from the end of the VITE_API_URL to get the root host URL
const socketUrl = apiUrl.replace(/\/api$/, '') || 'https://curoxa.onrender.com';

console.log('[SOCKET] Initializing socket connection to url:', socketUrl);

/**
 * Resolves the active socket authentication token.
 * Staff/admin tokens are strictly in-memory (zero localStorage fallback).
 * Only patient or superadmin impersonation sessions may check localStorage.
 */
export const getActiveSocketToken = () => {
  const staffToken = getAccessToken();
  if (staffToken) return staffToken;
  if (typeof localStorage !== 'undefined') {
    try {
      const u = localStorage.getItem('user');
      const isPatient = u ? JSON.parse(u)?.role === 'patient' : false;
      const isImpersonating = !!localStorage.getItem('curoxa_superadmin_session');
      if (isPatient || isImpersonating) {
        return localStorage.getItem('patient_token') || localStorage.getItem('token');
      }
    } catch (e) {}
  }
  return null;
};

/**
 * Socket.IO client instance configured with dynamic token resolution.
 * Token is retrieved strictly from in-memory token store (zero localStorage persistence for staff).
 */
export const socket = io(socketUrl, {
  autoConnect: false,
  transports: ['polling', 'websocket'],
  auth: (cb) => {
    const token = getActiveSocketToken();
    cb({ token });
  }
});

// Diagnostic listeners without credential logging
socket.on('connect_error', (err) => {
  console.warn('[SOCKET] Connection warning:', err.message);
});

socket.on('session_expired', (data) => {
  console.warn('[SOCKET] Session expired notification received from server:', data?.reason);
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('curoxa_socket_session_expired', { detail: data }));
  }
});

/**
 * Connects the socket with the active verified in-memory access token.
 * Prevents connecting with undefined, missing, or empty token during bootstrap.
 *
 * @param {string} [tenantId] - Hospital tenant code
 */
export const connectSocket = (tenantId) => {
  const token = getActiveSocketToken();
  if (!token) {
    console.warn('[SOCKET] connectSocket aborted: No active in-memory access token');
    return;
  }

  socket.auth = { token };

  if (!socket.connected) {
    socket.connect();
  }

  if (tenantId) {
    joinTenantRoom(tenantId);
  }
};

/**
 * Updates the Socket.IO client credential upon token rotation and reconnects cleanly.
 *
 * @param {string} newToken - Rotated access token
 */
export const updateSocketAuth = (newToken) => {
  if (!newToken) return;
  socket.auth = { token: newToken };
  if (socket.connected) {
    console.log('[SOCKET] Reconnecting socket with refreshed access token...');
    socket.disconnect().connect();
  }
};

/**
 * Disconnects the socket cleanly upon logout.
 */
export const disconnectSocket = () => {
  if (socket.connected) {
    socket.disconnect();
  }
};

/**
 * Emits join_tenant event with the client's tenant identifier.
 * The server strictly validates this against the socket's verified JWT identity.
 *
 * @param {string} tenantId - Tenant code
 */
export const joinTenantRoom = (tenantId) => {
  if (!tenantId) return;

  const emitJoin = () => {
    socket.emit('join_tenant', tenantId);
    console.log(`[SOCKET] Emitted join_tenant for: ${tenantId}`);
  };

  if (!socket.connected) {
    const token = getActiveSocketToken();
    if (token) {
      socket.auth = { token };
      socket.connect();
      socket.once('connect', emitJoin);
    }
  } else {
    emitJoin();
  }
};

