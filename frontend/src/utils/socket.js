import { io } from 'socket.io-client';

const apiUrl = import.meta.env.VITE_API_URL || 'https://curoxa.onrender.com/api';
// Strip '/api' from the end of the VITE_API_URL to get the root host URL
const socketUrl = apiUrl.replace(/\/api$/, '') || 'https://curoxa.onrender.com';

console.log('[SOCKET] Initializing socket connection to url:', socketUrl);

export const socket = io(socketUrl, {
  autoConnect: false,
  transports: ['polling', 'websocket']
});

export const joinTenantRoom = (tenantId) => {
  if (tenantId) {
    if (socket.connected) {
      socket.emit('join_tenant', tenantId);
      console.log(`[SOCKET] Emitted join_tenant for: ${tenantId}`);
    } else {
      // If not connected yet, listen for the connect event once to emit it
      socket.once('connect', () => {
        socket.emit('join_tenant', tenantId);
        console.log(`[SOCKET] Emitted join_tenant on connect for: ${tenantId}`);
      });
    }
  }
};
