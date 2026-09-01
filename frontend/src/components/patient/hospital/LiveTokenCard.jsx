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
  
  const isCancelled = todayAppt.status === 'Cancelled';
  const isCompleted = ['Completed', 'Checked Out'].includes(todayAppt.status);
  const isRxPending = todayAppt.status === 'Prescription Pending';
  const isPostConsultation = isRxPending || isCompleted;

  // Real server-authoritative token numbers:
  // Live token is ONLY visible while appointment is actively participating in the OPD queue.
  // Once consultation finishes (Prescription Pending, Completed, Cancelled), the live token is hidden.
  const isLiveTokenVisible = Boolean(todayAppt.tokenNumber) && !isPostConsultation && !isCancelled;
  const myToken = isLiveTokenVisible ? todayAppt.tokenNumber : null;
  const currentServingToken = patientQueue?.currentToken ?? null;
  const patientsAhead = patientQueue?.patientsAhead ?? null;

  const isBeingServed = Boolean(myToken && currentServingToken && myToken === currentServingToken && !isPostConsultation && !isCancelled);
  const isCheckedIn = Boolean(myToken) && !isPostConsultation && !isCancelled;
  const hasToken = Boolean(myToken);

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
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: isPostConsultation ? '16px' : '14px' }}>
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
            background: isCompleted ? '#F1F5F9' : isRxPending ? '#FEF3C7' : isBeingServed ? '#ECFDF5' : isCheckedIn ? '#DCFCE7' : '#F1F5F9',
            color: isCompleted ? '#475569' : isRxPending ? '#B45309' : isBeingServed ? '#047857' : isCheckedIn ? '#15803D' : '#64748B',
            border: `1px solid ${isCompleted ? '#E2E8F0' : isRxPending ? '#FDE68A' : isBeingServed ? '#A7F3D0' : isCheckedIn ? '#BBF7D0' : '#E2E8F0'}`,
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
              background: isCompleted ? '#94A3B8' : isRxPending ? '#F59E0B' : isBeingServed ? '#10B981' : isCheckedIn ? '#16A34A' : '#94A3B8',
              boxShadow: (isCheckedIn || isBeingServed) ? '0 0 0 2px rgba(22, 163, 74, 0.2)' : 'none'
            }}
          />
          <span>
            {isCancelled ? 'Cancelled' : isCompleted ? 'Completed' : isRxPending ? 'Prescription Pending' : isBeingServed ? 'In Consultation' : isCheckedIn ? 'Live' : 'Scheduled'}
          </span>
        </div>
      </div>

      {/* Dual Token Section: YOUR TOKEN vs NOW SERVING (Only displayed while active in queue or scheduled) */}
      {!isPostConsultation && !isCancelled && (
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
            <div style={{ fontSize: myToken ? '30px' : '22px', fontWeight: 900, color: myToken ? '#059669' : '#94A3B8', lineHeight: 1.1, fontFamily: "'Outfit', sans-serif" }}>
              {myToken ? `#${myToken}` : '—'}
            </div>
          </div>
          <div style={{ paddingLeft: '8px' }}>
            <div style={{ fontSize: '10.5px', fontWeight: 700, color: '#64748B', letterSpacing: '0.04em', textTransform: 'uppercase', marginBottom: '2px' }}>
              NOW SERVING
            </div>
            <div style={{ fontSize: currentServingToken ? '30px' : '22px', fontWeight: 900, color: currentServingToken ? '#065F46' : '#94A3B8', lineHeight: 1.1, fontFamily: "'Outfit', sans-serif" }}>
              {currentServingToken ? `#${currentServingToken}` : '—'}
            </div>
          </div>
        </div>
      )}

      {/* Patients Ahead / Status Chip */}
      <div style={{ textAlign: 'center', marginBottom: (isPostConsultation || isCancelled) ? '18px' : '14px' }}>
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            background: isRxPending ? '#FEF3C7' : (isCheckedIn || isBeingServed) ? '#ECFDF5' : '#F8FAFC',
            border: `1px solid ${isRxPending ? '#FDE68A' : (isCheckedIn || isBeingServed) ? '#A7F3D0' : '#E2E8F0'}`,
            color: isRxPending ? '#92400E' : (isCheckedIn || isBeingServed) ? '#047857' : '#64748B',
            padding: '4px 14px',
            borderRadius: '99px',
            fontSize: '12px',
            fontWeight: 700
          }}
        >
          {isRxPending ? (
            <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="16" y1="13" x2="8" y2="13" />
              <line x1="16" y1="17" x2="8" y2="17" />
              <polyline points="10 9 9 9 8 9" />
            </svg>
          ) : (
            <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
              <path d="M16 3.13a4 4 0 0 1 0 7.75" />
            </svg>
          )}
          {isCancelled
            ? "Appointment cancelled"
            : isCompleted
            ? "Consultation completed"
            : isRxPending
            ? "Consultation completed • Prescription pending"
            : isBeingServed
            ? "You're up next! Please proceed inside"
            : !hasToken
            ? "Please check in at reception upon arrival"
            : patientsAhead !== null
            ? `${patientsAhead} patient${patientsAhead === 1 ? '' : 's'} ahead of you`
            : "In waiting queue"}
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

      {/* Footer Notice */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '5px',
          marginTop: '12px',
          fontSize: '11.5px',
          color: isRxPending ? '#D97706' : (isCheckedIn || isBeingServed) ? '#059669' : '#64748B',
          fontWeight: 600
        }}
      >
        {isRxPending ? (
          <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
        ) : (
          <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <polyline points="12 6 12 12 16 14" />
          </svg>
        )}
        <span>
          {isCancelled
            ? "This visit was cancelled"
            : isCompleted
            ? "Your visit is complete"
            : isRxPending
            ? "Consultation finished. Awaiting doctor's prescription"
            : isBeingServed
            ? "Doctor is ready to see you now"
            : isCheckedIn
            ? "Please wait, we will call you soon"
            : "Token will be assigned at reception upon arrival"}
        </span>
      </div>
    </div>
  );
};

export default LiveTokenCard;
