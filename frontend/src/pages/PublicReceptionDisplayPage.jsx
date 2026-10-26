import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { io } from 'socket.io-client';
import api, { getSocketUrl } from '../utils/api';
import {
  Users, Maximize2, Minimize2, Radio, AlertCircle,
  Building2, Clock, CheckCircle2, AlertTriangle, ArrowRight, RefreshCw
} from 'lucide-react';
import curoxaLogo from '../assets/quroxa_new_logo.png';

const PublicReceptionDisplayPage = () => {
  const { clinicCode } = useParams();

  // Screen state: 'loading' | 'active' | 'unavailable' | 'error'
  const [screenState, setScreenState] = useState('loading');
  const [displayData, setDisplayData] = useState({
    clinic: { name: 'Clinic Reception', code: clinicCode || '', logo: '' },
    queueDate: '',
    currentTicketNumber: null,
    currentTicketDisplay: null,
    isServing: false,
    waitingCount: 0,
    totalIssuedToday: 0,
    isModuleEnabled: true,
    isDrainingMode: false,
    displayState: 'idle',
    lastUpdated: null
  });

  const [errorMessage, setErrorMessage] = useState('');
  const [socketConnected, setSocketConnected] = useState(false);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [isFullscreen, setIsFullscreen] = useState(false);

  const socketRef = useRef(null);
  const pollTimerRef = useRef(null);

  // 1. Live Clock Timer (updates every second)
  useEffect(() => {
    const clockTimer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(clockTimer);
  }, []);

  // 1b. Zoom Normalization Hook (overrides global 0.9 zoom so full 100% width is used without side gaps)
  useEffect(() => {
    const origHtmlZoom = document.documentElement.style.zoom;
    const origBodyZoom = document.body.style.zoom;
    document.documentElement.style.zoom = '1';
    document.body.style.zoom = '1';
    return () => {
      document.documentElement.style.zoom = origHtmlZoom;
      document.body.style.zoom = origBodyZoom;
    };
  }, []);

  // 2. Fetch Authoritative Display Data
  const fetchDisplayData = useCallback(async (isSilent = false) => {
    if (!clinicCode) return;
    if (!isSilent) setScreenState('loading');
    setErrorMessage('');

    try {
      const res = await api.get(`/reception-queue/display/${encodeURIComponent(clinicCode.trim().toLowerCase())}`);
      const data = res.data;

      setDisplayData(data);
      if (data.displayState === 'unavailable') {
        setScreenState('unavailable');
      } else {
        setScreenState('active');
      }
    } catch (err) {
      console.warn('[RECEPTION DISPLAY FETCH ERROR]:', err.message);
      if (err.response?.status === 404 || err.response?.status === 403) {
        setErrorMessage(err.response?.data?.error || 'Clinic not found or inactive.');
        setScreenState('error');
      } else {
        // Network or transient server error
        if (!isSilent) {
          setErrorMessage('Unable to connect to the clinic reception system. Retrying...');
          setScreenState('error');
        }
      }
    }
  }, [clinicCode]);

  // 3. Socket.IO Real-Time Sync & Background Polling
  useEffect(() => {
    if (!clinicCode) return;

    fetchDisplayData();

    // Socket.IO Setup
    let socket;
    try {
      const socketUrl = getSocketUrl();
      socket = io(socketUrl, {
        transports: ['websocket', 'polling'],
        auth: { receptionClinicCode: clinicCode.trim().toLowerCase() },
        reconnection: true,
        reconnectionAttempts: Infinity,
        reconnectionDelay: 2500
      });

      socket.on('connect', () => {
        setSocketConnected(true);
      });

      socket.on('disconnect', () => {
        setSocketConnected(false);
      });

      socket.on('reconnect', () => {
        setSocketConnected(true);
        fetchDisplayData(true);
      });

      socket.on('reception_queue_updated', (payload) => {
        if (payload?.clinicCode?.toLowerCase() === clinicCode.toLowerCase()) {
          setDisplayData(prev => ({
            ...prev,
            currentTicketNumber: payload.currentTicketNumber,
            currentTicketDisplay: payload.currentTicketDisplay,
            isServing: Boolean(payload.currentTicketNumber),
            waitingCount: typeof payload.waitingCount === 'number' ? payload.waitingCount : prev.waitingCount,
            lastUpdated: payload.lastUpdated || new Date().toISOString()
          }));
        }
      });

      socketRef.current = socket;
    } catch (sErr) {
      console.warn('[RECEPTION DISPLAY SOCKET INIT]:', sErr.message);
    }

    // 12-second polling fallback (guarantees freshness if websocket drops)
    pollTimerRef.current = setInterval(() => {
      fetchDisplayData(true);
    }, 12000);

    // Re-fetch when browser tab or TV display wakes up
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        fetchDisplayData(true);
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      if (socket) socket.disconnect();
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [clinicCode, fetchDisplayData]);

  // 4. Fullscreen Toggle Handler
  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().then(() => setIsFullscreen(true)).catch(() => {});
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen().then(() => setIsFullscreen(false)).catch(() => {});
      }
    }
  };

  useEffect(() => {
    const handleFsChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener('fullscreenchange', handleFsChange);
    return () => document.removeEventListener('fullscreenchange', handleFsChange);
  }, []);

  const formattedTime = currentTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const formattedDate = currentTime.toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' });

  // ── RENDER 1: LOADING STATE ──
  if (screenState === 'loading') {
    return (
      <div style={{
        minHeight: '100vh',
        width: '100%',
        background: '#F8FAFC',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#0F172A',
        fontFamily: 'Inter, system-ui, -apple-system, sans-serif'
      }}>
        <div style={{
          width: '56px',
          height: '56px',
          border: '4px solid #E2E8F0',
          borderTopColor: '#0D9488',
          borderRadius: '50%',
          animation: 'spin 1s linear infinite'
        }} />
        <h2 style={{ marginTop: '24px', fontSize: '18px', fontWeight: 700, color: '#475569', letterSpacing: '0.05em' }}>
          CONNECTING TO RECEPTION DISPLAY...
        </h2>
        <style>{`@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  // ── RENDER 2: ERROR STATE (Invalid clinic code / inactive) ──
  if (screenState === 'error') {
    return (
      <div style={{
        minHeight: '100vh',
        width: '100%',
        background: '#F8FAFC',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
        color: '#0F172A',
        fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
        textAlign: 'center'
      }}>
        <div style={{
          background: '#FFFFFF',
          border: '1px solid #FECACA',
          borderRadius: '24px',
          padding: '40px 32px',
          maxWidth: '480px',
          width: '100%',
          boxShadow: '0 10px 25px rgba(239, 68, 68, 0.08)'
        }}>
          <AlertCircle size={48} color="#EF4444" style={{ margin: '0 auto 16px auto' }} />
          <h2 style={{ fontSize: '22px', fontWeight: 800, color: '#DC2626', marginBottom: '8px' }}>
            Display Unavailable
          </h2>
          <p style={{ fontSize: '14px', color: '#64748B', lineHeight: '1.6', marginBottom: '24px' }}>
            {errorMessage || 'Unable to load reception display for the specified clinic identifier.'}
          </p>
          <button
            type="button"
            onClick={() => fetchDisplayData(false)}
            style={{
              padding: '12px 24px',
              borderRadius: '10px',
              border: 'none',
              background: '#0D9488',
              color: '#FFFFFF',
              fontSize: '14px',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              boxShadow: '0 4px 12px rgba(13, 148, 136, 0.25)'
            }}
          >
            <RefreshCw size={16} /> Retry Connection
          </button>
        </div>
      </div>
    );
  }

  // ── RENDER 3: UNAVAILABLE STATE (Module disabled & queue drained) ──
  if (screenState === 'unavailable') {
    return (
      <div style={{
        minHeight: '100vh',
        width: '100%',
        background: '#F8FAFC',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
        color: '#0F172A',
        fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
        textAlign: 'center'
      }}>
        <div style={{
          background: '#FFFFFF',
          border: '1px solid #E2E8F0',
          borderRadius: '24px',
          padding: '48px 36px',
          maxWidth: '520px',
          width: '100%',
          boxShadow: '0 10px 30px rgba(0, 0, 0, 0.04)'
        }}>
          <Building2 size={44} color="#64748B" style={{ margin: '0 auto 16px auto' }} />
          <h2 style={{ fontSize: '24px', fontWeight: 800, color: '#0F172A', marginBottom: '8px' }}>
            {displayData.clinic?.name || 'Clinic Reception'}
          </h2>
          <div style={{
            display: 'inline-block',
            padding: '4px 14px',
            borderRadius: '20px',
            background: '#F1F5F9',
            color: '#64748B',
            fontSize: '12px',
            fontWeight: 700,
            letterSpacing: '0.05em',
            marginBottom: '20px'
          }}>
            RECEPTION QUEUE OFFLINE
          </div>
          <p style={{ fontSize: '15px', color: '#64748B', lineHeight: '1.6' }}>
            The digital reception queue is currently inactive for this clinic. Please consult the physical reception desk upon arrival.
          </p>
        </div>
      </div>
    );
  }

  // ── RENDER 4: ACTIVE WAITING-ROOM DISPLAY (Serving or Idle) ──
  const isServing = Boolean(displayData.isServing && displayData.currentTicketDisplay);

  return (
    <div style={{
      minHeight: '100vh',
      width: '100%',
      background: 'linear-gradient(180deg, #F0FDFA 0%, #F8FAFC 100%)',
      color: '#0F172A',
      fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'space-between',
      boxSizing: 'border-box',
      overflowX: 'hidden'
    }}>
      {/* ── TOP HEADER BAR ── */}
      <header style={{
        padding: 'clamp(14px, 2.5vw, 24px) clamp(16px, 4vw, 48px)',
        display: 'flex',
        flexWrap: 'wrap',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: '14px',
        borderBottom: '1px solid #E2E8F0',
        background: '#FFFFFF',
        boxShadow: '0 1px 4px rgba(0, 0, 0, 0.04)',
        width: '100%',
        boxSizing: 'border-box'
      }}>
        {/* Clinic Branding */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          {displayData.clinic?.logo ? (
            <img
              src={displayData.clinic.logo}
              alt="Clinic Logo"
              style={{
                height: 'clamp(38px, 5vw, 54px)',
                width: 'auto',
                borderRadius: '8px',
                objectFit: 'contain'
              }}
            />
          ) : (
            <div style={{
              width: 'clamp(40px, 5vw, 52px)',
              height: 'clamp(40px, 5vw, 52px)',
              borderRadius: '12px',
              background: 'linear-gradient(135deg, #0D9488 0%, #14B8A6 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 4px 14px rgba(13, 148, 136, 0.2)'
            }}>
              <Building2 size={26} color="#FFFFFF" />
            </div>
          )}

          <div>
            <h1 style={{
              fontSize: 'clamp(18px, 2.5vw, 26px)',
              fontWeight: 800,
              color: '#0F172A',
              letterSpacing: '-0.02em',
              margin: 0
            }}>
              {displayData.clinic?.name || 'Clinic Reception'}
            </h1>
            <div style={{
              fontSize: 'clamp(11px, 1.4vw, 13.5px)',
              color: '#64748B',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              marginTop: '2px',
              fontWeight: 500
            }}>
              <span>Arrival & Reception Desk</span>
              <span>•</span>
              <span style={{ fontFamily: 'monospace', color: '#0F172A', fontWeight: 700 }}>{clinicCode?.toUpperCase()}</span>
            </div>
          </div>
        </div>

        {/* Live Clock & Connection Pill */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
          {/* Live Sync Badge */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '6px 14px',
            borderRadius: '20px',
            background: socketConnected ? '#DCFCE7' : '#FEF3C7',
            border: socketConnected ? '1px solid #86EFAC' : '1px solid #FDE68A'
          }}>
            <span style={{
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              background: socketConnected ? '#16A34A' : '#D97706',
              boxShadow: socketConnected ? '0 0 10px #16A34A' : '0 0 10px #D97706',
              display: 'inline-block'
            }} />
            <span style={{
              fontSize: '12px',
              fontWeight: 700,
              color: socketConnected ? '#15803D' : '#B45309',
              letterSpacing: '0.04em'
            }}>
              {socketConnected ? 'LIVE SYNC' : 'REFRESHING'}
            </span>
          </div>

          {/* Time & Date */}
          <div style={{ textAlign: 'right' }}>
            <div style={{
              fontSize: 'clamp(18px, 2.4vw, 24px)',
              fontWeight: 800,
              color: '#0F172A',
              fontVariantNumeric: 'tabular-nums',
              letterSpacing: '-0.02em',
              lineHeight: 1
            }}>
              {formattedTime}
            </div>
            <div style={{
              fontSize: 'clamp(11px, 1.3vw, 13px)',
              color: '#64748B',
              fontWeight: 600,
              marginTop: '4px'
            }}>
              {formattedDate}
            </div>
          </div>

          {/* Fullscreen Button */}
          <button
            type="button"
            onClick={toggleFullscreen}
            style={{
              padding: '10px',
              borderRadius: '10px',
              background: '#F1F5F9',
              border: '1px solid #E2E8F0',
              color: '#334155',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'all 0.2s'
            }}
            title={isFullscreen ? 'Exit Fullscreen' : 'Enter Fullscreen TV Mode'}
          >
            {isFullscreen ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
          </button>
        </div>
      </header>

      {/* ── QUEUE DRAINING BANNER (If module is disabled while tickets remain) ── */}
      {displayData.isDrainingMode && (
        <div style={{
          background: '#FEF3C7',
          borderBottom: '1px solid #FDE68A',
          padding: '10px 24px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '10px',
          color: '#92400E',
          fontSize: 'clamp(12px, 1.4vw, 14px)',
          fontWeight: 600,
          textAlign: 'center'
        }}>
          <AlertTriangle size={16} color="#D97706" />
          <span>Queue Draining Mode Active: Reception desk is currently serving remaining in-flight tickets.</span>
        </div>
      )}

      {/* ── MAIN CONTENT AREA (HERO NOW SERVING OR IDLE) ── */}
      <main style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 'clamp(20px, 4vw, 48px) clamp(16px, 3vw, 32px)',
        textAlign: 'center'
      }}>
        {isServing ? (
          // ── STATE A: ACTIVELY SERVING A TICKET ──
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            maxWidth: '1200px',
            width: '100%'
          }}>
            {/* NOW SERVING PILL */}
            <div style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '10px',
              padding: 'clamp(8px, 1.5vw, 14px) clamp(24px, 3vw, 38px)',
              borderRadius: '999px',
              background: '#F0FDFA',
              border: '2px solid #5EEAD4',
              boxShadow: '0 4px 20px rgba(13, 148, 136, 0.12)',
              marginBottom: 'clamp(16px, 3vw, 32px)'
            }}>
              <span style={{
                width: '12px',
                height: '12px',
                borderRadius: '50%',
                background: '#0D9488',
                boxShadow: '0 0 10px #0D9488',
                display: 'inline-block'
              }} />
              <span style={{
                fontSize: 'clamp(14px, 2.2vw, 22px)',
                fontWeight: 900,
                color: '#0F766E',
                letterSpacing: '0.14em',
                textTransform: 'uppercase'
              }}>
                NOW SERVING AT RECEPTION
              </span>
            </div>

            {/* MASSIVE TICKET NUMBER DISPLAY */}
            <div style={{
              color: '#0F172A',
              fontSize: 'clamp(4rem, 16vw, 15rem)',
              fontWeight: 950,
              letterSpacing: '-0.04em',
              lineHeight: 0.95,
              textShadow: '0 4px 24px rgba(15, 23, 42, 0.08)',
              margin: 'clamp(8px, 2vw, 20px) 0',
              fontFamily: 'system-ui, -apple-system, sans-serif',
              maxWidth: '100%',
              wordBreak: 'break-word',
              overflowWrap: 'break-word'
            }}>
              {displayData.currentTicketDisplay}
            </div>

            {/* CALL TO ACTION DIRECTION */}
            <div style={{
              marginTop: 'clamp(16px, 2.5vw, 28px)',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '12px',
              padding: 'clamp(12px, 2vw, 18px) clamp(24px, 4vw, 42px)',
              borderRadius: '16px',
              background: '#FFFFFF',
              border: '2px solid #0D9488',
              boxShadow: '0 8px 24px rgba(13, 148, 136, 0.12)'
            }}>
              <span style={{
                fontSize: 'clamp(15px, 2.5vw, 24px)',
                fontWeight: 800,
                color: '#0F766E',
                letterSpacing: '-0.01em'
              }}>
                Please Proceed to the Reception Counter
              </span>
              <ArrowRight size={24} color="#0D9488" />
            </div>
          </div>
        ) : (
          // ── STATE B: IDLE / NO ACTIVE TICKET ──
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            maxWidth: '720px',
            width: '100%',
            padding: 'clamp(28px, 5vw, 56px) clamp(20px, 4vw, 40px)',
            background: '#FFFFFF',
            border: '1px solid #E2E8F0',
            borderRadius: '28px',
            boxShadow: '0 10px 30px rgba(0, 0, 0, 0.04)'
          }}>
            <div style={{
              width: 'clamp(64px, 9vw, 92px)',
              height: 'clamp(64px, 9vw, 92px)',
              borderRadius: '50%',
              background: '#F0FDFA',
              border: '1px solid #CCFBF1',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: '20px'
            }}>
              <Clock size={40} color="#0D9488" />
            </div>

            <h2 style={{
              fontSize: 'clamp(22px, 3.8vw, 36px)',
              fontWeight: 800,
              color: '#0F172A',
              letterSpacing: '-0.02em',
              marginBottom: '10px'
            }}>
              No Patients Currently Being Served
            </h2>

            <p style={{
              fontSize: 'clamp(14px, 2vw, 18px)',
              color: '#64748B',
              lineHeight: '1.6',
              maxWidth: '520px',
              margin: '0 auto',
              fontWeight: 500
            }}>
              The front desk is ready. The next arriving patient will be called shortly.
            </p>
          </div>
        )}
      </main>

      {/* ── BOTTOM METRICS & STATUS DOCK ── */}
      <footer style={{
        padding: 'clamp(14px, 2.5vw, 24px) clamp(16px, 4vw, 48px)',
        borderTop: '1px solid #E2E8F0',
        background: '#FFFFFF',
        boxShadow: '0 -1px 4px rgba(0, 0, 0, 0.03)',
        display: 'flex',
        flexWrap: 'wrap',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: '16px',
        width: '100%',
        boxSizing: 'border-box'
      }}>
        {/* Waiting Count Card */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '14px',
          background: '#F0FDFA',
          border: '1px solid #CCFBF1',
          padding: 'clamp(10px, 1.8vw, 16px) clamp(14px, 2.5vw, 24px)',
          borderRadius: '16px',
          maxWidth: '100%',
          boxSizing: 'border-box'
        }}>
          <div style={{
            width: 'clamp(38px, 4vw, 48px)',
            height: 'clamp(38px, 4vw, 48px)',
            borderRadius: '12px',
            background: '#CCFBF1',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            <Users size={22} color="#0D9488" />
          </div>

          <div>
            <div style={{
              fontSize: 'clamp(11px, 1.3vw, 13px)',
              fontWeight: 700,
              color: '#0F766E',
              letterSpacing: '0.05em',
              textTransform: 'uppercase'
            }}>
              Patients Waiting in Queue
            </div>
            <div style={{
              fontSize: 'clamp(20px, 3vw, 30px)',
              fontWeight: 900,
              color: '#0F172A',
              lineHeight: 1,
              marginTop: '4px'
            }}>
              {displayData.waitingCount || 0}
            </div>
          </div>
        </div>

        {/* Informational Guidance Notice */}
        <div style={{
          maxWidth: '460px',
          textAlign: 'right',
          fontSize: 'clamp(11px, 1.3vw, 13px)',
          color: '#64748B',
          lineHeight: '1.5'
        }}>
          <div>Please have your registered ticket or mobile phone ready when your ticket is summoned.</div>
          <div style={{ marginTop: '2px', color: '#94A3B8' }}>
            Doctor consultation tokens are allocated independently upon receptionist desk intake.
          </div>
        </div>
      </footer>
    </div>
  );
};

export default PublicReceptionDisplayPage;
