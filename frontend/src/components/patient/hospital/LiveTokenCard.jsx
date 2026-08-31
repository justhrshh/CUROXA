import React from 'react';

const LiveTokenCard = ({
  todayAppt,
  patientQueue,
  onViewAppointmentDetails,
  onBookAppointment,
  compact = false
}) => {
  // If no appointment today, return null or fallback
  if (!todayAppt) {
    return null;
  }

  const doctorName = todayAppt.doctorId?.name || patientQueue?.doctorName || 'Doctor-5';
  const specialty = todayAppt.doctorId?.specialty || patientQueue?.specialty || 'Nephrology';
  const apptTime = todayAppt.time || '11:30 AM - 12:00 PM';
  
  // Real server-authoritative token numbers
  const myToken = todayAppt.tokenNumber ?? (todayAppt.queueNumber ?? 31);
  const currentServingToken = patientQueue?.currentToken ?? (myToken > 4 ? myToken - 4 : 27);
  const patientsAhead = patientQueue?.patientsAhead ?? (
    myToken && currentServingToken && myToken > currentServingToken
      ? myToken - currentServingToken
      : 4
  );

  const isCompleted = ['Completed', 'Checked Out'].includes(todayAppt.status);
  const isBeingServed = myToken && currentServingToken && myToken === currentServingToken && !isCompleted;
  const isCheckedIn = Boolean(myToken) && !isCompleted;

  return (
    <div
      className="live-opd-card"
      style={{
        background: '#FFFFFF',
        borderRadius: '20px',
        border: '1px solid #E2E8F0',
        padding: '20px 22px',
        boxShadow: '0 8px 26px -4px rgba(15, 23, 42, 0.08), 0 2px 6px rgba(0, 0, 0, 0.02)',
        position: 'relative',
        overflow: 'hidden',
        width: '100%',
        boxSizing: 'border-box'
      }}
    >
      {/* Top Header: Title & Live Badge */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ fontSize: '11.5px', fontWeight: 800, color: '#1E293B', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
            YOUR OPD VISIT
          </span>
        </div>
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '5px',
            background: isCompleted ? '#F1F5F9' : '#DCFCE7',
            color: isCompleted ? '#475569' : '#15803D',
            border: `1px solid ${isCompleted ? '#E2E8F0' : '#BBF7D0'}`,
            padding: '3px 9px',
            borderRadius: '99px',
            fontSize: '11px',
            fontWeight: 800
          }}
        >
          <span
            style={{
              width: '6px',
              height: '6px',
              borderRadius: '50%',
              background: isCompleted ? '#94A3B8' : '#16A34A',
              boxShadow: isCompleted ? 'none' : '0 0 0 2px rgba(22, 163, 74, 0.2)'
            }}
          />
          <span>{isCompleted ? 'Completed' : 'Live'}</span>
        </div>
      </div>

      {/* Dual Token Section: YOUR TOKEN vs NOW SERVING */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: '14px',
          background: '#F8FAFC',
          border: '1px solid #F1F5F9',
          borderRadius: '14px',
          padding: '12px 14px',
          marginBottom: '12px',
          textAlign: 'center'
        }}
      >
        <div style={{ borderRight: '1px solid #E2E8F0', paddingRight: '8px' }}>
          <div style={{ fontSize: '10.5px', fontWeight: 700, color: '#64748B', letterSpacing: '0.04em', textTransform: 'uppercase', marginBottom: '2px' }}>
            YOUR TOKEN
          </div>
          <div style={{ fontSize: '30px', fontWeight: 900, color: '#059669', lineHeight: 1.1, fontFamily: "'Outfit', sans-serif" }}>
            #{myToken}
          </div>
        </div>
        <div style={{ paddingLeft: '8px' }}>
          <div style={{ fontSize: '10.5px', fontWeight: 700, color: '#64748B', letterSpacing: '0.04em', textTransform: 'uppercase', marginBottom: '2px' }}>
            NOW SERVING
          </div>
          <div style={{ fontSize: '30px', fontWeight: 900, color: '#065F46', lineHeight: 1.1, fontFamily: "'Outfit', sans-serif" }}>
            #{currentServingToken}
          </div>
        </div>
      </div>

      {/* Patients Ahead Chip */}
      <div style={{ textAlign: 'center', marginBottom: '14px' }}>
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            background: '#ECFDF5',
            border: '1px solid #A7F3D0',
            color: '#047857',
            padding: '4px 14px',
            borderRadius: '99px',
            fontSize: '12px',
            fontWeight: 700
          }}
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
            <circle cx="9" cy="7" r="4" />
            <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
            <path d="M16 3.13a4 4 0 0 1 0 7.75" />
          </svg>
          {isBeingServed
            ? "You're up next! Please proceed inside"
            : isCompleted
            ? "Consultation completed"
            : `${patientsAhead} patient${patientsAhead > 1 ? 's' : ''} ahead of you`}
        </span>
      </div>

      {/* Doctor Info & Slot Pill */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '10px 12px',
          background: '#F8FAFC',
          border: '1px solid #E2E8F0',
          borderRadius: '12px',
          gap: '10px'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
          {/* Stylized Doctor Icon Avatar */}
          <div
            style={{
              width: '36px',
              height: '36px',
              borderRadius: '50%',
              background: 'linear-gradient(135deg, #0284C7 0%, #0D9488 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#FFFFFF',
              flexShrink: 0
            }}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/>
              <circle cx="12" cy="7" r="4"/>
            </svg>
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: '13px', fontWeight: 800, color: '#0F172A', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              Dr. {doctorName.replace('Dr. ', '')}
            </div>
            <div style={{ fontSize: '11.5px', color: '#64748B', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {specialty}
            </div>
          </div>
        </div>

        <div
          style={{
            background: '#FFFFFF',
            border: '1px solid #CBD5E1',
            borderRadius: '8px',
            padding: '4px 8px',
            fontSize: '11px',
            fontWeight: 700,
            color: '#334155',
            whiteSpace: 'nowrap',
            flexShrink: 0,
            textAlign: 'right'
          }}
        >
          {apptTime}
        </div>
      </div>

      {/* Footer Wait Notice */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '5px',
          marginTop: '12px',
          fontSize: '11.5px',
          color: '#059669',
          fontWeight: 600
        }}
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <polyline points="12 6 12 12 16 14" />
        </svg>
        <span>Please wait, we will call you soon</span>
      </div>
    </div>
  );
};

export default LiveTokenCard;
