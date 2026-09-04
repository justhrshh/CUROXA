import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { performLogout } from '../utils/api';
import curoxaSidebarLogo from '../assets/curoxa_sidebar_logo.png';
import { 
  Stethoscope, 
  Pill, 
  FlaskConical, 
  CalendarCheck, 
  Lock, 
  ShieldAlert, 
  ArrowLeft, 
  LogOut, 
  RefreshCw, 
  HelpCircle,
  Building2,
  CheckCircle2
} from 'lucide-react';

const MODULE_CONFIG = {
  reception: {
    name: 'Reception',
    color: '#2563EB',
    bg: '#EFF6FF',
    border: '#BFDBFE',
    badgeBg: '#DBEAFE',
    badgeColor: '#1E40AF',
    icon: CalendarCheck,
    description: 'Front-desk patient queue, OPD registration, appointments, and billing.'
  },
  receptionist: {
    name: 'Reception',
    color: '#2563EB',
    bg: '#EFF6FF',
    border: '#BFDBFE',
    badgeBg: '#DBEAFE',
    badgeColor: '#1E40AF',
    icon: CalendarCheck,
    description: 'Front-desk patient queue, OPD registration, appointments, and billing.'
  },
  doctor: {
    name: 'Doctor',
    color: '#4F46E5',
    bg: '#EEF2FF',
    border: '#C7D2FE',
    badgeBg: '#E0E7FF',
    badgeColor: '#3730A3',
    icon: Stethoscope,
    description: 'Clinical consultation, digital prescriptions, EMR, and patient diagnosis.'
  },
  pharmacy: {
    name: 'Pharmacy',
    color: '#0D9488',
    bg: '#F0FDFA',
    border: '#99F6E4',
    badgeBg: '#CCFBF1',
    badgeColor: '#115E59',
    icon: Pill,
    description: 'Medicine dispensation, inventory stock control, sales, and batch records.'
  },
  laboratory: {
    name: 'Laboratory',
    color: '#D97706',
    bg: '#FFFBEB',
    border: '#FDE68A',
    badgeBg: '#FEF3C7',
    badgeColor: '#92400E',
    icon: FlaskConical,
    description: 'Diagnostic test orders, sample accessioning, test results, and lab reports.'
  },
  lab: {
    name: 'Laboratory',
    color: '#D97706',
    bg: '#FFFBEB',
    border: '#FDE68A',
    badgeBg: '#FEF3C7',
    badgeColor: '#92400E',
    icon: FlaskConical,
    description: 'Diagnostic test orders, sample accessioning, test results, and lab reports.'
  }
};

const ModuleUnavailableView = ({ moduleName, moduleKey }) => {
  const navigate = useNavigate();
  const [checking, setChecking] = useState(false);
  const [feedback, setFeedback] = useState(null);

  const rawKey = (moduleKey || moduleName || 'reception').toLowerCase();
  const normalizedKey = rawKey === 'receptionist' ? 'reception' : (rawKey === 'lab' ? 'laboratory' : rawKey);
  const config = MODULE_CONFIG[rawKey] || MODULE_CONFIG[normalizedKey] || MODULE_CONFIG.reception;
  const IconComponent = config.icon || Stethoscope;

  let user = {};
  try {
    const stored = localStorage.getItem('user');
    if (stored) user = JSON.parse(stored);
  } catch (e) {}

  const tenantName = user.tenantName || 'Hospital Node';
  const tenantId = user.tenantId || localStorage.getItem('tenantId') || 'Current Tenant';

  const handleReturn = () => {
    if (user.role === 'admin') {
      navigate('/admin');
    } else if (user.role === 'doctor') {
      navigate('/doctor');
    } else if (user.role === 'receptionist') {
      navigate('/receptionist');
    } else if (user.role === 'lab') {
      navigate('/lab');
    } else if (user.role === 'pharmacy') {
      navigate('/pharmacy');
    } else if (user.role === 'hr') {
      navigate('/hr');
    } else {
      navigate('/login');
    }
  };

  const handleRecheck = async () => {
    setChecking(true);
    setFeedback(null);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch('/api/auth/tenant-mode', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      if (res.ok) {
        const data = await res.json();
        if (data && data.modules) {
          localStorage.setItem('tenantModules', JSON.stringify(data.modules));
          const effective = data.modules[normalizedKey];
          if (effective && effective.enabled !== false) {
            setFeedback({ type: 'success', text: `${config.name} module is now enabled! Loading...` });
            setTimeout(() => {
              window.location.reload();
            }, 800);
            return;
          }
        }
      }
      setFeedback({ type: 'info', text: 'Module is still disabled by the hospital administrator.' });
    } catch (e) {
      setFeedback({ type: 'error', text: 'Could not connect to server. Please try again.' });
    } finally {
      setChecking(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: '#F8FAFC',
      backgroundImage: `
        radial-gradient(at 0% 0%, rgba(99, 102, 241, 0.08) 0px, transparent 50%),
        radial-gradient(at 100% 100%, rgba(59, 130, 246, 0.06) 0px, transparent 50%),
        radial-gradient(at 50% 50%, rgba(241, 245, 249, 0.5) 0px, transparent 100%)
      `,
      display: 'flex',
      flexDirection: 'column',
      fontFamily: 'Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
    }}>
      {/* Top Navbar */}
      <header style={{
        height: '64px',
        padding: '0 32px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        borderBottom: '1px solid rgba(226, 232, 240, 0.8)',
        backgroundColor: 'rgba(255, 255, 255, 0.85)',
        backdropFilter: 'blur(10px)',
        position: 'sticky',
        top: 0,
        zIndex: 20
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <img 
            src={curoxaSidebarLogo} 
            alt="Curoxa" 
            style={{ height: '28px', objectFit: 'contain' }} 
          />
          <div style={{
            height: '18px',
            width: '1px',
            backgroundColor: '#E2E8F0'
          }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Building2 size={16} color="#64748B" />
            <span style={{ fontSize: '13.5px', fontWeight: 600, color: '#334155' }}>
              {tenantName}
            </span>
            <span style={{
              fontSize: '11px',
              fontFamily: 'monospace',
              padding: '2px 7px',
              borderRadius: '6px',
              backgroundColor: '#F1F5F9',
              color: '#64748B',
              border: '1px solid #E2E8F0'
            }}>
              {tenantId}
            </span>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {user.name && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              padding: '6px 14px',
              borderRadius: '24px',
              backgroundColor: '#FFFFFF',
              border: '1px solid #E2E8F0',
              boxShadow: '0 1px 3px rgba(0,0,0,0.03)'
            }}>
              <div style={{
                width: '26px',
                height: '26px',
                borderRadius: '50%',
                backgroundColor: config.badgeBg,
                color: config.badgeColor,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '12px',
                fontWeight: 700
              }}>
                {(user.name || 'U').charAt(0).toUpperCase()}
              </div>
              <div style={{ lineHeight: 1.2 }}>
                <div style={{ fontSize: '13px', fontWeight: 600, color: '#0F172A' }}>{user.name}</div>
                <div style={{ fontSize: '11px', color: '#64748B', textTransform: 'capitalize' }}>{user.role || 'Staff'}</div>
              </div>
            </div>
          )}

          <button
            onClick={() => performLogout()}
            title="Sign out of Curoxa"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '8px 14px',
              borderRadius: '8px',
              border: '1px solid #E2E8F0',
              backgroundColor: '#FFFFFF',
              color: '#475569',
              fontSize: '13px',
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'all 0.15s ease'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = '#FEF2F2';
              e.currentTarget.style.color = '#DC2626';
              e.currentTarget.style.borderColor = '#FCA5A5';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = '#FFFFFF';
              e.currentTarget.style.color = '#475569';
              e.currentTarget.style.borderColor = '#E2E8F0';
            }}
          >
            <LogOut size={15} />
            <span>Sign Out</span>
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <main style={{
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '40px 24px'
      }}>
        <div style={{
          maxWidth: '540px',
          width: '100%',
          backgroundColor: '#FFFFFF',
          borderRadius: '24px',
          boxShadow: '0 25px 50px -12px rgba(15, 23, 42, 0.08), 0 0 0 1px rgba(15, 23, 42, 0.04)',
          border: '1px solid #E2E8F0',
          overflow: 'hidden',
          animation: 'fadeIn 0.25s ease-out'
        }}>
          {/* Subtle Top Accent Bar */}
          <div style={{
            height: '5px',
            backgroundColor: config.color,
            width: '100%'
          }} />

          <div style={{ padding: '36px 36px 28px 36px', textAlign: 'center' }}>
            {/* Glowing Icon Container */}
            <div style={{ position: 'relative', width: '84px', height: '84px', margin: '0 auto 22px auto' }}>
              <div style={{
                position: 'absolute',
                inset: '-6px',
                borderRadius: '50%',
                backgroundColor: config.bg,
                opacity: 0.8,
                filter: 'blur(8px)'
              }} />
              <div style={{
                position: 'relative',
                width: '84px',
                height: '84px',
                borderRadius: '50%',
                backgroundColor: config.bg,
                border: `2px solid ${config.border}`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: `0 8px 20px -6px ${config.color}33`
              }}>
                <IconComponent size={40} color={config.color} strokeWidth={2.2} />
                <div style={{
                  position: 'absolute',
                  bottom: '-2px',
                  right: '-2px',
                  width: '26px',
                  height: '26px',
                  borderRadius: '50%',
                  backgroundColor: '#D97706',
                  border: '2.5px solid #FFFFFF',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  boxShadow: '0 2px 6px rgba(0,0,0,0.15)'
                }}>
                  <Lock size={13} color="#FFFFFF" strokeWidth={3} />
                </div>
              </div>
            </div>

            {/* Pill Tag */}
            <div style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '5px 14px',
              borderRadius: '9999px',
              fontSize: '11.5px',
              fontWeight: 700,
              letterSpacing: '0.4px',
              textTransform: 'uppercase',
              backgroundColor: '#FEF3C7',
              color: '#92400E',
              border: '1px solid #FDE68A',
              marginBottom: '14px'
            }}>
              <ShieldAlert size={13} color="#B45309" strokeWidth={2.5} />
              <span>Module Restricted</span>
            </div>

            {/* Primary Heading */}
            <h1 style={{
              margin: '0 0 12px 0',
              fontSize: '24px',
              fontWeight: 800,
              color: '#0F172A',
              letterSpacing: '-0.025em'
            }}>
              Module Unavailable
            </h1>

            {/* Authoritative Message */}
            <p style={{
              margin: '0 0 24px 0',
              fontSize: '15px',
              lineHeight: '1.65',
              color: '#475569',
              fontWeight: 400
            }}>
              The <strong style={{ color: config.color, fontWeight: 700 }}>{config.name}</strong> module has been disabled for your hospital by the application administrator. Please contact your hospital administrator for assistance.
            </p>

            {/* Context Explanation Card */}
            <div style={{
              backgroundColor: '#F8FAFC',
              borderRadius: '14px',
              border: '1px solid #E2E8F0',
              padding: '16px',
              textAlign: 'left',
              marginBottom: '26px'
            }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                <HelpCircle size={16} color="#64748B" style={{ flexShrink: 0, marginTop: '2px' }} />
                <div style={{ fontSize: '13px', color: '#475569', lineHeight: '1.5' }}>
                  <span style={{ fontWeight: 600, color: '#1E293B', display: 'block', marginBottom: '3px' }}>
                    Why is this module restricted?
                  </span>
                  Module access is governed by your hospital's active subscription tier and hospital administrator toggles. If your plan was recently renewed or updated, your administrator can enable this module from the Hospital Management console.
                </div>
              </div>
            </div>

            {/* Dynamic Feedback Message */}
            {feedback && (
              <div style={{
                padding: '10px 14px',
                borderRadius: '8px',
                marginBottom: '20px',
                fontSize: '13px',
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                backgroundColor: feedback.type === 'success' ? '#ECFDF5' : (feedback.type === 'error' ? '#FEF2F2' : '#F1F5F9'),
                color: feedback.type === 'success' ? '#065F46' : (feedback.type === 'error' ? '#991B1B' : '#475569'),
                border: `1px solid ${feedback.type === 'success' ? '#A7F3D0' : (feedback.type === 'error' ? '#FECACA' : '#E2E8F0')}`
              }}>
                {feedback.type === 'success' && <CheckCircle2 size={16} color="#059669" />}
                <span>{feedback.text}</span>
              </div>
            )}

            {/* Action Buttons */}
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '10px'
            }}>
              <div style={{
                display: 'flex',
                gap: '10px',
                justifyContent: 'center'
              }}>
                <button
                  onClick={handleRecheck}
                  disabled={checking}
                  style={{
                    flex: 1,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                    padding: '12px 18px',
                    borderRadius: '10px',
                    border: 'none',
                    backgroundColor: config.color,
                    color: '#FFFFFF',
                    fontSize: '13.5px',
                    fontWeight: 600,
                    cursor: checking ? 'not-allowed' : 'pointer',
                    boxShadow: `0 4px 12px ${config.color}33`,
                    opacity: checking ? 0.7 : 1,
                    transition: 'all 0.15s ease'
                  }}
                  onMouseEnter={(e) => { if (!checking) e.currentTarget.style.opacity = '0.9'; }}
                  onMouseLeave={(e) => { if (!checking) e.currentTarget.style.opacity = '1'; }}
                >
                  <RefreshCw size={15} className={checking ? 'animate-spin' : ''} />
                  <span>{checking ? 'Checking Status...' : 'Check Access Again'}</span>
                </button>

                {user.role && user.role !== rawKey && user.role !== normalizedKey && (
                  <button
                    onClick={handleReturn}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      padding: '12px 18px',
                      borderRadius: '10px',
                      border: '1px solid #CBD5E1',
                      backgroundColor: '#FFFFFF',
                      color: '#334155',
                      fontSize: '13.5px',
                      fontWeight: 600,
                      cursor: 'pointer',
                      transition: 'all 0.15s ease'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = '#F8FAFC';
                      e.currentTarget.style.borderColor = '#94A3B8';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = '#FFFFFF';
                      e.currentTarget.style.borderColor = '#CBD5E1';
                    }}
                  >
                    <ArrowLeft size={15} />
                    <span>Return</span>
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Card Footer Details */}
          <div style={{
            backgroundColor: '#F8FAFC',
            borderTop: '1px solid #E2E8F0',
            padding: '14px 36px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontSize: '12px',
            color: '#64748B'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{
                display: 'inline-block',
                width: '7px',
                height: '7px',
                borderRadius: '50%',
                backgroundColor: '#10B981'
              }} />
              <span>Curoxa Cloud Shield Active</span>
            </div>
            <div style={{ fontFamily: 'monospace', fontSize: '11.5px', color: '#94A3B8' }}>
              tenant: {tenantId}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default ModuleUnavailableView;
