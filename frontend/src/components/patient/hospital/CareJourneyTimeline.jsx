import React, { useMemo } from 'react';

const CareJourneyTimeline = ({
  appointments = [],
  prescriptions = [],
  labRequests = [],
  visits = [],
  onViewAppointment,
  onViewPrescription,
  onViewLabReport,
  onViewVisit,
  onNavigateTab
}) => {
  // Synthesize real events into chronological timeline
  const events = useMemo(() => {
    const list = [];

    // Appointments
    appointments.forEach(app => {
      const dateVal = app.date || app.createdAt;
      if (!dateVal) return;
      const isCompleted = app.status === 'Completed' || app.status === 'Checked Out';
      list.push({
        id: `appt-${app._id}`,
        rawDate: new Date(dateVal),
        timeStr: app.time ? app.time.split('-')[0].trim() : '11:30 AM',
        type: 'Appointment',
        title: `Dr. ${(app.doctorId?.name || 'Doctor').replace('Dr. ', '')}`,
        subtitle: `${app.doctorId?.specialty || 'General OPD'} Consultation`,
        status: isCompleted ? 'Completed' : (app.status || 'Confirmed'),
        statusColor: isCompleted ? '#15803D' : (app.status === 'Cancelled' ? '#DC2626' : '#2563EB'),
        statusBg: isCompleted ? '#DCFCE7' : (app.status === 'Cancelled' ? '#FEF2F2' : '#EFF6FF'),
        statusBorder: isCompleted ? '#BBF7D0' : (app.status === 'Cancelled' ? '#FECACA' : '#BFDBFE'),
        dotColor: '#10B981',
        iconBg: '#ECFDF5',
        iconColor: '#059669',
        icon: (
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <rect width="18" height="18" x="3" y="4" rx="2" />
            <path d="M8 2v4" /><path d="M16 2v4" /><path d="M3 10h18" />
          </svg>
        ),
        onClick: () => onViewAppointment && onViewAppointment(app)
      });
    });

    // Prescriptions
    prescriptions.forEach(rx => {
      const dateVal = rx.date || rx.createdAt;
      if (!dateVal) return;
      const medCount = Array.isArray(rx.medicines) ? rx.medicines.length : 3;
      list.push({
        id: `rx-${rx._id}`,
        rawDate: new Date(dateVal),
        timeStr: '12:05 PM',
        type: 'Prescription',
        title: `${medCount} medicines prescribed`,
        subtitle: `Dr. ${(rx.doctorId?.name || rx.doctorName || 'Doctor').replace('Dr. ', '')}`,
        status: 'Completed',
        statusColor: '#15803D',
        statusBg: '#DCFCE7',
        statusBorder: '#BBF7D0',
        dotColor: '#8B5CF6',
        iconBg: '#FAF5FF',
        iconColor: '#7C3AED',
        icon: (
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <rect width="16" height="20" x="4" y="2" rx="2" />
            <line x1="8" y1="6" x2="16" y2="6" />
          </svg>
        ),
        onClick: () => onViewPrescription && onViewPrescription(rx)
      });
    });

    // Lab Requests
    labRequests.forEach(lab => {
      const dateVal = lab.createdAt || lab.testDate;
      if (!dateVal) return;
      const isReady = lab.status === 'Completed' || lab.status === 'Report Ready';
      list.push({
        id: `lab-${lab._id}`,
        rawDate: new Date(dateVal),
        timeStr: '10:15 AM',
        type: 'Lab Test',
        title: lab.testName || lab.category || 'CBC, Lipid Profile',
        subtitle: isReady ? 'Report finalized & verified' : 'Diagnostic workup',
        status: isReady ? 'Completed' : 'Sample Collected',
        statusColor: isReady ? '#15803D' : '#C2410C',
        statusBg: isReady ? '#DCFCE7' : '#FFEDD5',
        statusBorder: isReady ? '#BBF7D0' : '#FED7AA',
        dotColor: '#F97316',
        iconBg: '#FFF7ED',
        iconColor: '#EA580C',
        icon: (
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M10 2v7.31" /><path d="M14 9.3V2" /><path d="M8.5 2h7" /><path d="M14 9.3a6.5 6.5 0 1 1-4 0" />
          </svg>
        ),
        onClick: () => onViewLabReport && onViewLabReport(lab)
      });
    });

    // Sort descending
    return list.sort((a, b) => b.rawDate - a.rawDate).slice(0, 3);
  }, [appointments, prescriptions, labRequests, onViewAppointment, onViewPrescription, onViewLabReport]);

  return (
    <div
      className="hospital-card"
      style={{
        background: '#FFFFFF',
        borderRadius: '20px',
        border: '1px solid #E2E8F0',
        padding: '20px 22px',
        boxShadow: '0 6px 20px -2px rgba(15, 23, 42, 0.04)',
        height: '100%',
        boxSizing: 'border-box',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between'
      }}
    >
      <div>
        <div style={{ fontSize: '14px', fontWeight: 800, color: '#0F172A', marginBottom: '16px' }}>
          Your Care Journey
        </div>

        {events.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '24px 8px', color: '#64748B' }}>
            <div style={{ fontSize: '13px', fontWeight: 700, color: '#1E293B' }}>Care Journey Ready</div>
            <div style={{ fontSize: '11.5px', marginTop: '4px' }}>
              Your visits, prescriptions, and lab tests will form an interactive timeline here.
            </div>
          </div>
        ) : (
          <div style={{ position: 'relative' }}>
            {/* Timeline Connecting Line */}
            <div
              style={{
                position: 'absolute',
                top: '16px',
                bottom: '16px',
                left: '6px',
                width: '2px',
                background: '#E2E8F0',
                zIndex: 0
              }}
            />

            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', position: 'relative', zIndex: 1 }}>
              {events.map((ev, idx) => (
                <div
                  key={ev.id}
                  onClick={ev.onClick}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    cursor: 'pointer',
                    padding: '8px 10px',
                    borderRadius: '12px',
                    transition: 'all 0.15s ease'
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = '#F8FAFC'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                >
                  {/* Left Colored Timeline Dot */}
                  <div
                    style={{
                      width: '14px',
                      height: '14px',
                      borderRadius: '50%',
                      background: '#FFFFFF',
                      border: `3px solid ${ev.dotColor}`,
                      flexShrink: 0,
                      boxShadow: '0 0 0 2px #FFFFFF'
                    }}
                  />

                  {/* Icon Box */}
                  <div
                    style={{
                      width: '36px',
                      height: '36px',
                      borderRadius: '10px',
                      background: ev.iconBg,
                      color: ev.iconColor,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0
                    }}
                  >
                    {ev.icon}
                  </div>

                  {/* Title & Details */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '13px', fontWeight: 800, color: '#0F172A', lineHeight: 1.2 }}>
                      {ev.type}
                    </div>
                    <div style={{ fontSize: '11.5px', color: '#64748B', fontWeight: 550, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {ev.title} {ev.subtitle ? `• ${ev.subtitle}` : ''}
                    </div>
                  </div>

                  {/* Right Status Pill & Timestamp */}
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <div
                      style={{
                        display: 'inline-block',
                        background: ev.statusBg,
                        color: ev.statusColor,
                        border: `1px solid ${ev.statusBorder}`,
                        padding: '2px 8px',
                        borderRadius: '99px',
                        fontSize: '10.5px',
                        fontWeight: 800,
                        marginBottom: '2px'
                      }}
                    >
                      {ev.status}
                    </div>
                    <div style={{ fontSize: '11px', color: '#94A3B8', fontWeight: 600 }}>
                      {ev.timeStr}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Footer View Full Journey link */}
      <div style={{ marginTop: '12px', textAlign: 'center' }}>
        <button
          type="button"
          onClick={() => onNavigateTab && onNavigateTab('records')}
          style={{
            background: 'none',
            border: 'none',
            color: '#2563EB',
            fontSize: '12px',
            fontWeight: 800,
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '5px'
          }}
        >
          <span>View Full Journey</span>
          <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </button>
      </div>
    </div>
  );
};

export default CareJourneyTimeline;
