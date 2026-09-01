import React from 'react';

const UpcomingAppointmentCard = ({
  upcomingAppt,
  hospital,
  onViewDetails
}) => {
  // If no appointment exists, render calm empty state with ZERO booking buttons
  if (!upcomingAppt) {
    return (
      <div
        style={{
          background: '#FFFFFF',
          borderRadius: '20px',
          border: '1px solid #E2E8F0',
          padding: '24px 20px',
          boxShadow: '0 4px 20px -2px rgba(15, 23, 42, 0.04)',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
          height: '100%',
          minHeight: '180px',
          boxSizing: 'border-box',
          textAlign: 'center'
        }}
      >
        <div
          style={{
            width: '44px',
            height: '44px',
            borderRadius: '14px',
            background: '#F0F9FF',
            color: '#0284C7',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: '10px'
          }}
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect width="18" height="18" x="3" y="4" rx="2" />
            <path d="M8 2v4" />
            <path d="M16 2v4" />
            <path d="M3 10h18" />
          </svg>
        </div>
        <div style={{ fontSize: '14px', fontWeight: 800, color: '#1E293B', marginBottom: '4px' }}>
          No upcoming appointments
        </div>
        <div style={{ fontSize: '12px', color: '#64748B', fontWeight: 550, maxWidth: '240px' }}>
          Your next consultation will appear here.
        </div>
      </div>
    );
  }

  const doctorName = upcomingAppt.doctorId?.name || 'Doctor-5';
  const specialty = upcomingAppt.doctorId?.specialty || 'Nephrology';
  const apptHospital = upcomingAppt.hospitalName || hospital?.name || 'clinic-2';
  const apptTime = upcomingAppt.time || '11:30 AM';
  const apptDateStr = upcomingAppt.date
    ? new Date(upcomingAppt.date).toDateString() === new Date().toDateString()
      ? 'Today'
      : new Date(upcomingAppt.date).toLocaleDateString([], { month: 'short', day: 'numeric' })
    : 'Today';
  const tokenNum = upcomingAppt.tokenNumber || null;

  return (
    <div
      className="hospital-card"
      onClick={() => onViewDetails && onViewDetails(upcomingAppt)}
      style={{
        background: '#FFFFFF',
        borderRadius: '20px',
        border: '1px solid #E2E8F0',
        padding: '20px 22px',
        boxShadow: '0 6px 20px -2px rgba(15, 23, 42, 0.04)',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        height: '100%',
        boxSizing: 'border-box',
        cursor: 'pointer',
        transition: 'all 0.2s ease'
      }}
      onMouseEnter={e => {
        e.currentTarget.style.borderColor = '#CBD5E1';
        e.currentTarget.style.boxShadow = '0 10px 24px -2px rgba(15, 23, 42, 0.08)';
      }}
      onMouseLeave={e => {
        e.currentTarget.style.borderColor = '#E2E8F0';
        e.currentTarget.style.boxShadow = '0 6px 20px -2px rgba(15, 23, 42, 0.04)';
      }}
    >
      <div>
        {/* Card Header: Upcoming Appointment */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#2563EB" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round">
              <rect width="18" height="18" x="3" y="4" rx="2" />
              <path d="M8 2v4" />
              <path d="M16 2v4" />
              <path d="M3 10h18" />
            </svg>
            <span style={{ fontSize: '13.5px', fontWeight: 800, color: '#0F172A' }}>
              Upcoming Appointment
            </span>
          </div>

          <span style={{ fontSize: '11px', color: '#64748B', fontWeight: 600 }}>
            {apptHospital}
          </span>
        </div>

        {/* Info + 3D Calendar illustration */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', marginBottom: '16px' }}>
          <div>
            <div style={{ fontSize: '12.5px', fontWeight: 800, color: '#0284C7', marginBottom: '3px' }}>
              {apptDateStr} • {apptTime.split('-')[0].trim()}
            </div>
            <div style={{ fontSize: '17px', fontWeight: 900, color: '#0F172A', fontFamily: "'Outfit', sans-serif", lineHeight: 1.2 }}>
              Dr. {doctorName.replace('Dr. ', '')}
            </div>
            <div style={{ fontSize: '12.5px', color: '#64748B', fontWeight: 600, marginTop: '2px', marginBottom: '8px' }}>
              {specialty}
            </div>
            <div>
              {tokenNum ? (
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                  <span
                    style={{
                      display: 'inline-block',
                      background: '#DCFCE7',
                      color: '#15803D',
                      border: '1px solid #BBF7D0',
                      padding: '2px 10px',
                      borderRadius: '99px',
                      fontSize: '11px',
                      fontWeight: 800
                    }}
                  >
                    Token #{tokenNum}
                  </span>
                  {upcomingAppt.status === 'Prescription Pending' && (
                    <span
                      style={{
                        display: 'inline-block',
                        background: '#FEF3C7',
                        color: '#B45309',
                        border: '1px solid #FDE68A',
                        padding: '2px 8px',
                        borderRadius: '99px',
                        fontSize: '10.5px',
                        fontWeight: 800
                      }}
                    >
                      Rx Pending
                    </span>
                  )}
                </div>
              ) : (
                <span
                  style={{
                    display: 'inline-block',
                    background: '#F1F5F9',
                    color: '#64748B',
                    border: '1px solid #E2E8F0',
                    padding: '2px 10px',
                    borderRadius: '99px',
                    fontSize: '11px',
                    fontWeight: 700
                  }}
                >
                  Not Checked In
                </span>
              )}
            </div>
          </div>

          {/* 3D-styled Calendar & Clock Illustration */}
          <div style={{ flexShrink: 0, width: '80px', height: '80px' }}>
            <svg viewBox="0 0 90 90" width="80" height="80" fill="none" xmlns="http://www.w3.org/2000/svg">
              <defs>
                <linearGradient id="calBody" x1="15" y1="20" x2="70" y2="75" gradientUnits="userSpaceOnUse">
                  <stop stopColor="#60A5FA" />
                  <stop offset="1" stopColor="#3B82F6" />
                </linearGradient>
                <linearGradient id="calSheet" x1="20" y1="25" x2="65" y2="70" gradientUnits="userSpaceOnUse">
                  <stop stopColor="#FFFFFF" />
                  <stop offset="1" stopColor="#EFF6FF" />
                </linearGradient>
                <linearGradient id="clockGrad" x1="45" y1="45" x2="80" y2="80" gradientUnits="userSpaceOnUse">
                  <stop stopColor="#38BDF8" />
                  <stop offset="1" stopColor="#0284C7" />
                </linearGradient>
                <filter id="calShadow" x="10" y="15" width="70" height="65" filterUnits="userSpaceOnUse">
                  <feDropShadow dx="2" dy="4" stdDeviation="4" floodColor="#1E3A8A" floodOpacity="0.18" />
                </filter>
              </defs>

              {/* Calendar Base */}
              <rect x="14" y="20" width="56" height="50" rx="10" fill="url(#calBody)" filter="url(#calShadow)" />
              {/* Top Ring Binders */}
              <rect x="25" y="15" width="5" height="10" rx="2.5" fill="#93C5FD" />
              <rect x="54" y="15" width="5" height="10" rx="2.5" fill="#93C5FD" />
              {/* Calendar Page */}
              <rect x="18" y="30" width="48" height="36" rx="6" fill="url(#calSheet)" />
              {/* Grid dots */}
              <circle cx="27" cy="40" r="2" fill="#93C5FD" />
              <circle cx="36" cy="40" r="2" fill="#93C5FD" />
              <circle cx="45" cy="40" r="2" fill="#93C5FD" />
              <circle cx="54" cy="40" r="2" fill="#93C5FD" />
              <circle cx="27" cy="49" r="2" fill="#93C5FD" />
              <circle cx="36" cy="49" r="2" fill="#2563EB" />
              <circle cx="45" cy="49" r="2" fill="#93C5FD" />
              <circle cx="54" cy="49" r="2" fill="#93C5FD" />

              {/* Floating Clock Badge (Bottom Right) */}
              <g filter="url(#calShadow)">
                <circle cx="62" cy="62" r="16" fill="url(#clockGrad)" stroke="#FFFFFF" strokeWidth="2.5" />
                <polyline points="62,54 62,62 67,65" stroke="#FFFFFF" strokeWidth="2" strokeLinecap="round" />
              </g>
            </svg>
          </div>
        </div>
      </div>

      {/* Bottom Action Link */}
      <div
        style={{
          width: '100%',
          background: '#F0F7FF',
          border: '1px solid #DBEAFE',
          borderRadius: '10px',
          padding: '8px 14px',
          color: '#2563EB',
          fontSize: '12.5px',
          fontWeight: 750,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '6px'
        }}
      >
        <span>View Details</span>
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="9 18 15 12 9 6" />
        </svg>
      </div>
    </div>
  );
};

export default UpcomingAppointmentCard;
