import React, { useEffect, useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import PatientPortalLogin from './pages/PatientPortalLogin';
import PatientRegistration from './pages/PatientRegistration';
import Login from './pages/Login';
import AdminDashboard from './pages/AdminDashboard';
import DoctorDashboard from './pages/DoctorDashboard';
import ReceptionistDashboard from './pages/ReceptionistDashboard';
import PatientDashboard from './pages/PatientDashboard';
import LabDashboard from './pages/LabDashboard';
import PharmacyDashboard from './pages/PharmacyDashboard';
import HRPayroll from './pages/HRPayroll';
import ProcurementDashboard from './pages/ProcurementDashboard';
import SuperAdminDashboard from './pages/SuperAdminDashboard';
import HospitalPortal from './pages/HospitalPortal';
import { PortalBrandingProvider } from './context/PortalBrandingContext';
import WakeUpOverlay from './components/WakeUpOverlay';
import GlobalSupportWidget from './components/GlobalSupportWidget';
import ModuleUnavailableView from './components/ModuleUnavailableView';
import api, { clearPortalAuthContext, performLogout } from './utils/api';


import { socket, joinTenantRoom } from './utils/socket';

// Proactively clean up any corrupted or "undefined" values in localStorage on boot to prevent JSON.parse crashes
for (const key of ['user', 'tenantModules', 'curoxa_pmState', 'read_notif_ids', 'curoxa_superadmin_session']) {
  try {
    const val = localStorage.getItem(key);
    if (val) {
      if (val === 'undefined' || val === 'null' || val === '[object Object]') {
        localStorage.removeItem(key);
      } else {
        JSON.parse(val);
      }
    }
  } catch (e) {
    localStorage.removeItem(key);
  }
}

const checkHasCoverage = (username, targetRole) => {
  try {
    const saved = localStorage.getItem('curoxa_pmState');
    if (!saved) return false;
    const pmState = JSON.parse(saved);
    const userCoverages = pmState[username] || {};
    
    if (targetRole === 'doctor') {
      return Object.keys(userCoverages).some(k => k.startsWith('dr-') && k !== 'dr-stockview' && userCoverages[k]?.on);
    }
    if (targetRole === 'receptionist') {
      return Object.keys(userCoverages).some(k => k.startsWith('rc-') && userCoverages[k]?.on);
    }
    if (targetRole === 'lab') {
      return Object.keys(userCoverages).some(k => k.startsWith('lt-') && userCoverages[k]?.on);
    }
    if (targetRole === 'pharmacy') {
      return Object.keys(userCoverages).some(k => (k.startsWith('ph-') || k === 'dr-stockview') && userCoverages[k]?.on);
    }
  } catch (e) {
    console.error(e);
  }
  return false;
};

// Protected Route Component
const ProtectedRoute = ({ children, targetRole }) => {
  const token = localStorage.getItem('token');
  let user = {};
  try {
    const storedUser = localStorage.getItem('user');
    user = (storedUser && storedUser !== 'undefined') ? JSON.parse(storedUser) : {};
  } catch (e) {
    console.error('Failed to parse user from localStorage:', e);
  }

  if (!token) {
    return <Navigate to="/login" replace />;
  }

  // Super Admin route can only be accessed by superadmin/super_admin role
  if (targetRole === 'superadmin') {
    if (user.role === 'superadmin' || user.role === 'super_admin') {
      return children;
    }
    return <Navigate to="/login" replace />;
  }

  // HR route can be accessed by any staff member (non-patient)
  if (targetRole === 'hr') {
    if (user.role && user.role !== 'patient') {
      return children;
    }
    return <Navigate to="/login" replace />;
  }

  // Patient route can be accessed by any user who logged in via Patient Portal, or admins/staff inspecting it
  if (targetRole === 'patient') {
    return children;
  }

  // Subscription feature gating:
  if (user.role && user.role !== 'superadmin' && user.role !== 'super_admin' && user.role !== 'patient') {
    try {
      const tenantModules = JSON.parse(localStorage.getItem('tenantModules') || '{}');
      const moduleMapping = {
        'receptionist': 'reception',
        'doctor': 'doctor',
        'lab': 'laboratory',
        'pharmacy': 'pharmacy',
        'inventory': 'inventory'
      };
      const moduleKey = moduleMapping[targetRole];
      if (moduleKey && moduleKey !== 'inventory' && tenantModules[moduleKey] && tenantModules[moduleKey].enabled === false) {
        console.warn(`[GATING] Module ${moduleKey} is disabled for this tenant. Access denied.`);
        return <ModuleUnavailableView moduleKey={moduleKey} />;
      }

    } catch (e) {
      console.error(e);
    }
  }

  // Allow direct role or admin OR active coverage for targetRole
  const hasDirectRole = targetRole === 'patient' || user.role === targetRole || user.role === 'admin' || (targetRole === 'inventory' && (user.role === 'pharmacy' || user.role === 'admin'));
  const hasCoverage = checkHasCoverage(user.name, targetRole === 'inventory' ? 'pharmacy' : targetRole);

  if (!hasDirectRole && !hasCoverage) {
    // Redirect to their respective dashboard if they try to access an unauthorized route
    switch (user.role) {
      case 'admin': return <Navigate to="/admin" replace />;
      case 'doctor': return <Navigate to="/doctor" replace />;
      case 'receptionist': return <Navigate to="/receptionist" replace />;
      case 'patient': return <Navigate to="/patient" replace />;
      case 'lab': return <Navigate to="/lab" replace />;
      case 'pharmacy': return <Navigate to="/pharmacy" replace />;
      case 'hr': return <Navigate to="/hr" replace />;
      default: return <Navigate to="/login" replace />;
    }
  }

  return children;
};

function App() {
  const [waking, setWaking] = useState(true);

  useEffect(() => {
    // Proactively ping the Render backend to wake it up from cold start.
    // The WakeUpOverlay stays visible until this resolves.
    const warmUpBackend = async () => {
      try {
        await api.get('/auth/ping');
      } catch (error) {
        // Even on failure, don't trap the user — let them try the login.
      } finally {
        setWaking(false);
      }
    };
    warmUpBackend();
  }, []);

  useEffect(() => {
    const token = localStorage.getItem('token');
    const tenantId = localStorage.getItem('tenantId');
    if (token && tenantId) {
      console.log('[SOCKET] Token & Tenant ID found in storage on mount, connecting socket...');
      if (!socket.connected) {
        socket.connect();
      }
      joinTenantRoom(tenantId);
    }

    const handleLoginSuccess = () => {
      const tId = localStorage.getItem('tenantId');
      console.log('[SOCKET] Login success event caught, connecting socket with tenant:', tId);
      if (tId) {
        if (!socket.connected) {
          socket.connect();
        }
        joinTenantRoom(tId);
      }
    };

    const handleLogoutEvent = () => {
      console.log('[SOCKET] Logout event caught, disconnecting socket...');
      socket.disconnect();
    };

    window.addEventListener('curoxa_login_success', handleLoginSuccess);
    window.addEventListener('curoxa_logout', handleLogoutEvent);

    const onDataChanged = (event) => {
      console.log('[SOCKET] Data changed event received:', event);
      if (event && event.type === 'subscription' && event.modules) {
        localStorage.setItem('tenantModules', JSON.stringify(event.modules));
        window.dispatchEvent(new CustomEvent('curoxa_modules_updated', { detail: event.modules }));
      }
      // Dispatch global window event
      window.dispatchEvent(new CustomEvent('curoxa_sync', { detail: event }));
    };

    const onHospitalSubUpdated = (data) => {
      try {
        const storedUser = localStorage.getItem('user');
        const currentUser = storedUser ? JSON.parse(storedUser) : null;
        const currentTenant = localStorage.getItem('tenantId') || currentUser?.tenantId;
        if (data && data.hospitalCode && currentTenant && String(data.hospitalCode).toLowerCase() === String(currentTenant).toLowerCase()) {
          if (data.modules) {
            console.log('[SOCKET] Updating tenantModules from hospital_subscription_updated event:', data.modules);
            localStorage.setItem('tenantModules', JSON.stringify(data.modules));
            window.dispatchEvent(new CustomEvent('curoxa_modules_updated', { detail: data.modules }));
          }
        }
      } catch (err) {
        console.error('Error handling hospital_subscription_updated in App:', err);
      }
    };

    const onSessionRevoked = (data) => {
      try {
        const storedUser = localStorage.getItem('user');
        const currentUser = storedUser ? JSON.parse(storedUser) : null;
        if (currentUser && data && (data.userId === currentUser.id || data.userId === currentUser._id || data.staffId === currentUser.staff_id)) {
          console.warn('[SOCKET] Current user session revoked (password changed). Logging out...');
          localStorage.setItem('logout_reason', 'password_changed');
          performLogout();
        }
      } catch (err) {
        console.error('Error handling session revocation socket event:', err);
      }
    };

    const applyGlobalTheme = (isColorful) => {
      if (isColorful) {
        document.documentElement.classList.add('theme-colorful-components');
        document.body.classList.add('theme-colorful-components');
      } else {
        document.documentElement.classList.remove('theme-colorful-components');
        document.body.classList.remove('theme-colorful-components');
      }
    };

    // Apply on initial mount
    const savedTheme = localStorage.getItem('curoxa_colorful_theme') === 'true';
    applyGlobalTheme(savedTheme);

    const handleThemeChangedEvent = (e) => {
      const enabled = e.detail?.enabled ?? (localStorage.getItem('curoxa_colorful_theme') === 'true');
      applyGlobalTheme(enabled);
    };

    const onGlobalThemeChangedSocket = (data) => {
      console.log('[SOCKET] Global theme changed socket event received:', data);
      const enabled = !!data?.enabled;
      localStorage.setItem('curoxa_colorful_theme', String(enabled));
      applyGlobalTheme(enabled);
    };

    window.addEventListener('curoxa_theme_changed', handleThemeChangedEvent);
    socket.on('global_theme_changed', onGlobalThemeChangedSocket);

    const onSystemBroadcast = (broadcast) => {
      console.log('[SOCKET] System broadcast received:', broadcast);
      window.dispatchEvent(new CustomEvent('curoxa_broadcast', { detail: broadcast }));
    };

    socket.on('data_changed', onDataChanged);
    socket.on('hospital_subscription_updated', onHospitalSubUpdated);
    socket.on('session_revoked', onSessionRevoked);
    socket.on('system_broadcast', onSystemBroadcast);

    return () => {
      window.removeEventListener('curoxa_login_success', handleLoginSuccess);
      window.removeEventListener('curoxa_logout', handleLogoutEvent);
      window.removeEventListener('curoxa_theme_changed', handleThemeChangedEvent);
      socket.off('global_theme_changed', onGlobalThemeChangedSocket);
      socket.off('data_changed', onDataChanged);
      socket.off('hospital_subscription_updated', onHospitalSubUpdated);
      socket.off('session_revoked', onSessionRevoked);
      socket.off('system_broadcast', onSystemBroadcast);
    };

  }, []);

  return (
    <Router>
      <WakeUpOverlay visible={waking} message="Waking up server" />
      <GlobalSupportWidget />
      <Routes>
        <Route path="/patient/login" element={<PatientPortalLogin />} />
        <Route path="/patient-register" element={<PatientRegistration />} />
        <Route path="/login" element={<Login />} />
        <Route path="/admin" element={
          <ProtectedRoute targetRole="admin">
            <AdminDashboard />
          </ProtectedRoute>
        } />
        
        <Route path="/doctor" element={
          <ProtectedRoute targetRole="doctor">
            <DoctorDashboard />
          </ProtectedRoute>
        } />

        <Route path="/receptionist" element={
          <ProtectedRoute targetRole="receptionist">
            <ReceptionistDashboard />
          </ProtectedRoute>
        } />

        <Route path="/receptionist/waiting-queue" element={
          <Navigate to="/receptionist" replace />
        } />


        <Route path="/patient" element={
          <ProtectedRoute targetRole="patient">
            <PatientDashboard />
          </ProtectedRoute>
        } />

        <Route path="/lab" element={
          <ProtectedRoute targetRole="lab">
            <LabDashboard />
          </ProtectedRoute>
        } />

        <Route path="/pharmacy" element={
          <ProtectedRoute targetRole="pharmacy">
            <PharmacyDashboard />
          </ProtectedRoute>
        } />

        <Route path="/procurement" element={
          <ProtectedRoute targetRole="inventory">
            <ProcurementDashboard />
          </ProtectedRoute>
        } />

        <Route path="/hr" element={
          <ProtectedRoute targetRole="hr">
            <HRPayroll />
          </ProtectedRoute>
        } />

        <Route path="/super-admin" element={
          <ProtectedRoute targetRole="superadmin">
            <SuperAdminDashboard />
          </ProtectedRoute>
        } />
        <Route path="/hospital-onboarding" element={
          <ProtectedRoute targetRole="superadmin">
            <SuperAdminDashboard initialTab="hospital-onboarding" />
          </ProtectedRoute>
        } />
        <Route path="/hospitals" element={
          <ProtectedRoute targetRole="superadmin">
            <SuperAdminDashboard initialTab="hospitals" />
          </ProtectedRoute>
        } />
        <Route path="/subscription-management" element={
          <ProtectedRoute targetRole="superadmin">
            <SuperAdminDashboard initialTab="subscription-mgmt" />
          </ProtectedRoute>
        } />
        <Route path="/customer-support" element={
          <ProtectedRoute targetRole="superadmin">
            <SuperAdminDashboard initialTab="customer-support" />
          </ProtectedRoute>
        } />
        <Route path="/broadcast-center" element={
          <ProtectedRoute targetRole="superadmin">
            <SuperAdminDashboard initialTab="broadcast-center" />
          </ProtectedRoute>
        } />
        <Route path="/finance" element={
          <ProtectedRoute targetRole="superadmin">
            <SuperAdminDashboard initialTab="finance" />
          </ProtectedRoute>
        } />
        <Route path="/employees" element={
          <ProtectedRoute targetRole="superadmin">
            <SuperAdminDashboard initialTab="employees" />
          </ProtectedRoute>
        } />
        <Route path="/platform-reports" element={
          <ProtectedRoute targetRole="superadmin">
            <SuperAdminDashboard initialTab="reports" />
          </ProtectedRoute>
        } />
        <Route path="/platform-control" element={
          <ProtectedRoute targetRole="superadmin">
            <SuperAdminDashboard initialTab="settings" />
          </ProtectedRoute>
        } />

        {/* Hospital Portal Branded Routes */}
        <Route path="/portal/:hospitalId" element={
          <PortalBrandingProvider>
            <HospitalPortal />
          </PortalBrandingProvider>
        } />
        <Route path="/portal/:hospitalId/*" element={
          <PortalBrandingProvider>
            <HospitalPortal />
          </PortalBrandingProvider>
        } />

        <Route path="/" element={<Navigate to="/login" replace />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </Router>
  );
}

export default App;
