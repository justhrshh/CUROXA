import React, { useEffect, useState } from 'react';

/**
 * WakeUpOverlay — full-screen splash shown while the Render backend is
 * waking from a cold start. Includes an animated ECG line and progress bar.
 *
 * Props:
 *   visible:    boolean          — show / hide the overlay
 *   message:    string           — primary message (default: 'Waking up server…')
 *   onTimeout:  function         — called if server doesn't respond within 60s
 */
const WakeUpOverlay = ({ visible, message = 'Waking up server…', onTimeout }) => {
  const [dots, setDots] = useState(0);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    if (!visible) return undefined;
    const dotId = setInterval(() => setDots(d => (d + 1) % 4), 400);
    const progId = setInterval(() => setProgress(p => (p >= 95 ? 95 : p + 3)), 200);
    const timeoutId = setTimeout(() => {
      if (onTimeout) onTimeout();
    }, 60000);
    return () => {
      clearInterval(dotId);
      clearInterval(progId);
      clearTimeout(timeoutId);
    };
  }, [visible, onTimeout]);

  if (!visible) return null;

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      background: 'linear-gradient(135deg, #0F172A 0%, #1E293B 100%)',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      color: '#F8FAFC', fontFamily: 'system-ui, -apple-system, sans-serif'
    }}>
      {/* Quroxa logo */}
      <div style={{
        width: 88, height: 88, borderRadius: 22,
        background: '#2563EB',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: '#FFFFFF',
        fontWeight: 900,
        fontSize: '44px',
        boxShadow: '0 12px 40px rgba(59, 113, 254, 0.35)',
        marginBottom: 24,
        fontFamily: "'Outfit', 'Urbanist', sans-serif"
      }}>
        Q
      </div>

      <h1 style={{
        fontSize: 28, fontWeight: 900, margin: 0, letterSpacing: '-0.02em'
      }}>Quroxa</h1>
      <p style={{
        fontSize: 14, fontWeight: 600, color: '#94A3B8',
        marginTop: 8, marginBottom: 32
      }}>
        {message}{'.'.repeat(dots)}
      </p>

      {/* ECG line animation */}
      <div style={{
        width: 240, height: 56, position: 'relative', overflow: 'hidden',
        background: 'rgba(255,255,255,0.04)', borderRadius: 12,
        border: '1px solid rgba(255,255,255,0.06)'
      }}>
        <svg width="240" height="56" viewBox="0 0 240 56" style={{ position: 'absolute', inset: 0 }}>
          <polyline
            fill="none" stroke="#38BDF8" strokeWidth="2.5"
            strokeLinecap="round" strokeLinejoin="round"
            points="0,28 30,28 40,28 50,12 60,44 70,28 100,28 130,28 140,28 150,12 160,44 170,28 200,28 240,28"
            style={{
              strokeDasharray: 400,
              strokeDashoffset: 0,
              animation: 'curoxa-ecg 2s linear infinite'
            }}
          />
        </svg>
      </div>

      {/* Progress bar */}
      <div style={{
        width: 240, height: 4, marginTop: 24,
        background: 'rgba(255,255,255,0.08)', borderRadius: 2, overflow: 'hidden'
      }}>
        <div style={{
          width: `${progress}%`, height: '100%',
          background: 'linear-gradient(90deg, #38BDF8, #0EA5E9)',
          transition: 'width 200ms ease-out'
        }} />
      </div>

      <p style={{
        fontSize: 11, fontWeight: 600, color: '#64748B',
        marginTop: 16, letterSpacing: '0.08em', textTransform: 'uppercase'
      }}>
        Healthcare Management System
      </p>

      <style>{`
        @keyframes curoxa-ecg {
          0%   { stroke-dashoffset: 400; }
          100% { stroke-dashoffset: 0;   }
        }
      `}</style>
    </div>
  );
};

export default WakeUpOverlay;
