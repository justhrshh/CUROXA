import React, { createContext, useContext, useState, useEffect } from 'react';
import {
  getAccessToken,
  refreshAccessToken,
  clearPortalAuthContext,
  subscribeAuthChannel
} from '../utils/api';

const AuthContext = createContext({
  authInitializing: false
});

export const AuthProvider = ({ children }) => {
  const [authInitializing, setAuthInitializing] = useState(() => {
    if (typeof window !== 'undefined') {
      const path = window.location.pathname;
      if (
        path === '/login' ||
        path.startsWith('/portal/') ||
        path.startsWith('/patient') ||
        path.startsWith('/doctor/queue/')
      ) {
        return false;
      }
      const storedUser = localStorage.getItem('user');
      if (!storedUser || storedUser === 'undefined') {
        return false;
      }
    }
    return true;
  });

  useEffect(() => {
    // 1. Safely remove legacy staff tokens from localStorage if present
    try {
      const storedUser = localStorage.getItem('user');
      const u = (storedUser && storedUser !== 'undefined') ? JSON.parse(storedUser) : null;
      if (u && u.role !== 'patient' && !localStorage.getItem('curoxa_superadmin_session')) {
        localStorage.removeItem('token');
      }
    } catch (e) {}

    // 2. Subscribe to cross-tab auth events (LOGOUT, SESSION_EXPIRED)
    const unsubscribeChannel = subscribeAuthChannel((data) => {
      if (data.type === 'LOGOUT' || data.type === 'SESSION_EXPIRED') {
        clearPortalAuthContext();
        window.dispatchEvent(new CustomEvent('curoxa_logout'));
      }
    });

    // 3. Attempt session restoration via /api/auth/refresh for staff sessions
    const restoreSession = async () => {
      const path = typeof window !== 'undefined' ? window.location.pathname : '';
      const isPublic =
        path === '/login' ||
        path.startsWith('/portal/') ||
        path.startsWith('/patient') ||
        path.startsWith('/doctor/queue/');
      const storedUser = typeof localStorage !== 'undefined' ? localStorage.getItem('user') : null;

      if (!isPublic && storedUser && !getAccessToken() && !localStorage.getItem('curoxa_superadmin_session')) {
        try {
          await refreshAccessToken();
        } catch (err) {
          console.warn('[AUTH_BOOTSTRAP] Session restoration failed:', err.message);
          clearPortalAuthContext();
        }
      }
      setAuthInitializing(false);
    };

    restoreSession();

    return () => {
      unsubscribeChannel();
    };
  }, []);

  return (
    <AuthContext.Provider value={{ authInitializing }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
