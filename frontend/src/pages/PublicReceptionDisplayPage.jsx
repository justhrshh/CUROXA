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
        width: '100vw',
        background: '#0B132B',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#FFFFFF',
        fontFamily: 'Inter, system-ui, -apple-system, sans-serif'
      }}>
        <div style={{
          width: '56px',
          height: '56px',
          border: '4px solid #1E293B',
          borderTopColor: '#0D9488',
          borderRadius: '50%',
          animation: 'spin 1s linear infinite'
        }} />
        <h2 style={{ marginTop: '24px', fontSize: '18px', fontWeight: 600, color: '#94A3B8', letterSpacing: '0.05em' }}>
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
        width: '100vw',
        background: '#0B132B',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
        color: '#FFFFFF',
        fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
        textAlign: 'center'
      }}>
        <div style={{
          background: 'rgba(239, 68, 68, 0.1)',
          border: '1px solid rgba(239, 68, 68, 0.3)',
          borderRadius: '24px',
          padding: '40px 32px',
          maxWidth: '480px',
          width: '100%'
        }}>
          <AlertCircle size={48} color="#EF4444" style={{ margin: '0 auto 16px auto' }} />
          <h2 style={{ fontSize: '22px', fontWeight: 800, color: '#F87171', marginBottom: '8px' }}>
            Display Unavailable
          </h2>
          <p style={{ fontSize: '14px', color: '#CBD5E1', lineHeight: '1.6', marginBottom: '24px' }}>
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
              gap: '8px'
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
        width: '100vw',
        background: '#0B132B',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
        color: '#FFFFFF',
        fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
        textAlign: 'center'
      }}>
        <div style={{
          background: 'rgba(30, 41, 59, 0.6)',
          border: '1px solid rgba(148, 163, 184, 0.2)',
          borderRadius: '24px',
          padding: '48px 36px',
          maxWidth: '520px',
          width: '100%'
        }}>
          <Building2 size={44} color="#94A3B8" style={{ margin: '0 auto 16px auto' }} />
          <h2 style={{ fontSize: '24px', fontWeight: 800, color: '#F1F5F9', marginBottom: '8px' }}>
            {displayData.clinic?.name || 'Clinic Reception'}
          </h2>
          <div style={{
            display: 'inline-block',
            padding: '4px 12px',
            borderRadius: '20px',
            background: 'rgba(148, 163, 184, 0.15)',
            color: '#94A3B8',
            fontSize: '12px',
            fontWeight: 700,
            letterSpacing: '0.05em',
            marginBottom: '20px'
          }}>
            RECEPTION QUEUE OFFLINE
          </div>
          <p style={{ fontSize: '15px', color: '#94A3B8', lineHeight: '1.6' }}>
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
      width: '100vw',
      background: 'radial-gradient(ellipse at top, #111E38 0%, #060B18 100%)',
      color: '#FFFFFF',
      fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'space-between',
      boxSizing: 'border-box',
      overflowX: 'hidden'
    }}>
      {/* ── TOP HEADER BAR ── */}
      <header style={{
        padding: 'clamp(12px, 2.5vw, 28px) clamp(14px, 4vw, 56px)',
        display: 'flex',
        flexWrap: 'wrap',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: '14px',
        borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
        background: 'rgba(6, 11, 24, 0.4)',
        backdropFilter: 'blur(10px)',
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
                height: 'clamp(36px, 5vw, 52px)',
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
              boxShadow: '0 4px 14px rgba(13, 148, 136, 0.3)'
            }}>
              <Building2 size={26} color="#FFFFFF" />
            </div>
          )}

          <div>
            <h1 style={{
              fontSize: 'clamp(18px, 2.5vw, 26px)',
              fontWeight: 800,
              color: '#F8FAFC',
              letterSpacing: '-0.02em',
              margin: 0
            }}>
              {displayData.clinic?.name || 'Clinic Reception'}
            </h1>
            <div style={{
              fontSize: 'clamp(11px, 1.4vw, 13.5px)',
              color: '#94A3B8',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              marginTop: '2px'
            }}>
              <span>Arrival & Reception Desk</span>
              <span>•</span>
              <span style={{ fontFamily: 'monospace', color: '#CBD5E1' }}>{clinicCode?.toUpperCase()}</span>
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
            background: socketConnected ? 'rgba(16, 185, 129, 0.12)' : 'rgba(245, 158, 11, 0.12)',
            border: socketConnected ? '1px solid rgba(16, 185, 129, 0.3)' : '1px solid rgba(245, 158, 11, 0.3)'
          }}>
            <span style={{
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              background: socketConnected ? '#10B981' : '#F59E0B',
              boxShadow: socketConnected ? '0 0 10px #10B981' : '0 0 10px #F59E0B',
              display: 'inline-block'
            }} />
            <span style={{
              fontSize: '12px',
              fontWeight: 700,
              color: socketConnected ? '#34D399' : '#FBBF24',
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
              color: '#F8FAFC',
              fontVariantNumeric: 'tabular-nums',
              letterSpacing: '-0.02em',
              lineHeight: 1
            }}>
              {formattedTime}
            </div>
            <div style={{
              fontSize: 'clamp(11px, 1.3vw, 13px)',
              color: '#64748B',
              fontWeight: 500,
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
              background: 'rgba(255, 255, 255, 0.06)',
              border: '1px solid rgba(255, 255, 255, 0.12)',
              color: '#CBD5E1',
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
          background: 'rgba(217, 119, 6, 0.15)',
          borderBottom: '1px solid rgba(217, 119, 6, 0.4)',
          padding: '10px 24px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '10px',
          color: '#FDE68A',
          fontSize: 'clamp(12px, 1.4vw, 14px)',
          fontWeight: 600,
          textAlign: 'center'
        }}>
          <AlertTriangle size={16} color="#F59E0B" />
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
              background: 'linear-gradient(135deg, rgba(13, 148, 136, 0.25) 0%, rgba(20, 184, 166, 0.15) 100%)',
              border: '1.5px solid rgba(45, 212, 191, 0.4)',
              boxShadow: '0 0 30px rgba(13, 148, 136, 0.25)',
              marginBottom: 'clamp(16px, 3vw, 32px)'
            }}>
              <span style={{
                width: '12px',
                height: '12px',
                borderRadius: '50%',
                background: '#2DD4BF',
                boxShadow: '0 0 12px #2DD4BF',
                display: 'inline-block'
              }} />
              <span style={{
                fontSize: 'clamp(14px, 2.2vw, 22px)',
                fontWeight: 900,
                color: '#2DD4BF',
                letterSpacing: '0.14em',
                textTransform: 'uppercase'
              }}>
                NOW SERVING AT RECEPTION
              </span>
            </div>

            {/* MASSIVE TICKET NUMBER DISPLAY */}
            <div style={{
              background: 'linear-gradient(180deg, #FFFFFF 0%, #E2E8F0 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              fontSize: 'clamp(3.5rem, 14vw, 14rem)',
              fontWeight: 950,
              letterSpacing: '-0.04em',
              lineHeight: 0.95,
              textShadow: '0 10px 40px rgba(0, 0, 0, 0.6)',
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
              background: 'rgba(255, 255, 255, 0.06)',
              border: '1px solid rgba(255, 255, 255, 0.14)',
              backdropFilter: 'blur(12px)'
            }}>
              <span style={{
                fontSize: 'clamp(15px, 2.5vw, 24px)',
                fontWeight: 700,
                color: '#F1F5F9',
                letterSpacing: '-0.01em'
              }}>
                Please Proceed to the Reception Desk
              </span>
              <ArrowRight size={22} color="#2DD4BF" />
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
            padding: 'clamp(24px, 4vw, 48px) clamp(16px, 3vw, 32px)',
            background: 'rgba(15, 23, 42, 0.5)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: '28px',
            backdropFilter: 'blur(12px)'
          }}>
            <div style={{
              width: 'clamp(64px, 9vw, 92px)',
              height: 'clamp(64px, 9vw, 92px)',
              borderRadius: '50%',
              background: 'rgba(148, 163, 184, 0.1)',
              border: '1px solid rgba(148, 163, 184, 0.2)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: '20px'
            }}>
              <Clock size={40} color="#94A3B8" />
            </div>

            <h2 style={{
              fontSize: 'clamp(22px, 3.8vw, 36px)',
              fontWeight: 800,
              color: '#F8FAFC',
              letterSpacing: '-0.02em',
              marginBottom: '10px'
            }}>
              No Patients Currently Being Served
            </h2>

            <p style={{
              fontSize: 'clamp(14px, 2vw, 18px)',
              color: '#94A3B8',
              lineHeight: '1.6',
              maxWidth: '520px',
              margin: '0 auto'
            }}>
              The front desk is ready. The next arriving patient will be called shortly.
            </p>
          </div>
        )}
      </main>

      {/* ── BOTTOM METRICS & STATUS DOCK ── */}
      <footer style={{
        padding: 'clamp(14px, 2.5vw, 28px) clamp(14px, 4vw, 56px)',
        borderTop: '1px solid rgba(255, 255, 255, 0.08)',
        background: 'rgba(6, 11, 24, 0.6)',
        backdropFilter: 'blur(10px)',
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
          background: 'rgba(255, 255, 255, 0.05)',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          padding: 'clamp(10px, 1.8vw, 16px) clamp(14px, 2.5vw, 24px)',
          borderRadius: '16px',
          maxWidth: '100%',
          boxSizing: 'border-box'
        }}>
          <div style={{
            width: 'clamp(38px, 4vw, 48px)',
            height: 'clamp(38px, 4vw, 48px)',
            borderRadius: '12px',
            background: 'rgba(13, 148, 136, 0.2)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            <Users size={22} color="#2DD4BF" />
          </div>

          <div>
            <div style={{
              fontSize: 'clamp(11px, 1.3vw, 13px)',
              fontWeight: 700,
              color: '#94A3B8',
              letterSpacing: '0.05em',
              textTransform: 'uppercase'
            }}>
              Patients Waiting in Queue
            </div>
            <div style={{
              fontSize: 'clamp(20px, 3vw, 30px)',
              fontWeight: 900,
              color: '#F8FAFC',
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
          <div style={{ marginTop: '2px', color: '#475569' }}>
            Doctor consultation tokens are allocated independently upon receptionist desk intake.
          </div>
        </div>
      </footer>
    </div>
  );
};

export default PublicReceptionDisplayPage;
