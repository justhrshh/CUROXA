import React from 'react';
import LiveTokenCard from './LiveTokenCard';
import UpcomingAppointmentCard from './UpcomingAppointmentCard';
import HospitalQuickActions from './HospitalQuickActions';
import CareJourneyTimeline from './CareJourneyTimeline';
import RecentLabReports from './RecentLabReports';
import RecentPrescriptions from './RecentPrescriptions';
import HealthVaultStrip from './HealthVaultStrip';

const PatientHospitalHome = ({
  hospital,
  currentUser,
  patientProfile,
  todayVisitAppt,
  nextUpcomingAppt,
  patientQueue,
  appointments = [],
  prescriptions = [],
  labRequests = [],
  visits = [],
  onNavigateTab,
  onViewAppointmentDetails,
  onOpenBooking,
  onPayAppointment,
  onViewPrescription,
  onViewLabReport,
  onViewVisit
}) => {
  const getTimeGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    return 'Good evening';
  };

  const patientFirstName = currentUser?.name
    ? currentUser.name.split(' ')[0]
    : patientProfile?.name
    ? patientProfile.name.split(' ')[0]
    : 'Harsh';

  const hospitalName = hospital?.name || 'clinic-2';

  // Approved appointments waiting for payment
  const unpaidApprovedAppts = appointments.filter(
    (a) => a.status === 'Approved' && a.billingStatus !== 'Paid'
  );

  return (
    <div
      className="patient-hospital-home"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '20px',
        animation: 'fadeIn 0.3s ease-out'
      }}
    >
      {/* 1. APPROVED APPOINTMENT PAYMENT CALLOUT (if any unpaid approved visits) */}
      {unpaidApprovedAppts.map((app) => (
        <div
          key={app._id}
          style={{
            background: 'linear-gradient(135deg, #EFF6FF 0%, #DBEAFE 100%)',
            border: '1.5px solid #3B82F6',
            borderRadius: '18px',
            padding: '16px 20px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '14px',
            boxShadow: '0 8px 20px -4px rgba(59, 130, 246, 0.15)',
            flexWrap: 'wrap'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <div
              style={{
                width: '42px',
                height: '42px',
                borderRadius: '12px',
                background: '#2563EB',
                color: '#FFFFFF',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0
              }}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                <polyline points="22 4 12 14.01 9 11.01" />
              </svg>
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '2px' }}>
                <span style={{ background: '#2563EB', color: '#FFFFFF', fontSize: '10px', fontWeight: 800, padding: '1px 6px', borderRadius: '4px', textTransform: 'uppercase' }}>
                  Approved
                </span>
                <span style={{ fontSize: '12px', fontWeight: 700, color: '#1E293B' }}>
                  {app.date ? new Date(app.date).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' }) : 'Scheduled'} at {app.time}
                </span>
              </div>
              <div style={{ fontSize: '14px', fontWeight: 800, color: '#0F172A' }}>
                Dr. {app.doctorId?.name || 'Doctor'}
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={() => onPayAppointment(app)}
            style={{
              background: 'linear-gradient(135deg, #2563EB 0%, #1D4ED8 100%)',
              color: '#FFFFFF',
              border: 'none',
              borderRadius: '10px',
              padding: '10px 18px',
              fontSize: '13px',
              fontWeight: 800,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              boxShadow: '0 4px 12px rgba(37, 99, 235, 0.3)'
            }}
          >
            <span>💳 Pay Now & Confirm</span>
          </button>
        </div>
      ))}

      {/* 2. HERO / CARE HEADER SECTION (With embedded OPD Visit Card on Desktop) */}
      <div
        className="hospital-hero-banner"
        style={{
          background: 'linear-gradient(135deg, #E0F2FE 0%, #EFF6FF 45%, #F0FDFA 100%)',
          borderRadius: '24px',
          border: '1px solid #BAE6FD',
          padding: '24px 28px',
          position: 'relative',
          overflow: 'hidden',
          boxShadow: '0 6px 24px -2px rgba(37, 99, 235, 0.06)'
        }}
      >
        {/* Stylized Healthcare Landscape Illustration Backdrop */}
        <div
          style={{
            position: 'absolute',
            right: todayVisitAppt ? '38%' : '20px',
            bottom: '0',
            width: '260px',
            height: '140px',
            opacity: 0.35,
            pointerEvents: 'none',
            zIndex: 1
          }}
        >
          <svg viewBox="0 0 260 140" width="100%" height="100%" fill="none" xmlns="http://www.w3.org/2000/svg">
            {/* Sun / Aura */}
            <circle cx="160" cy="40" r="32" fill="#FDE68A" opacity="0.6" />
            {/* Soft Hospital Buildings Silhouette */}
            <rect x="40" y="50" width="50" height="90" rx="6" fill="#93C5FD" opacity="0.5" />
            <rect x="75" y="30" width="60" height="110" rx="8" fill="#60A5FA" opacity="0.6" />
            <rect x="125" y="60" width="55" height="80" rx="6" fill="#38BDF8" opacity="0.5" />
            {/* Medical Cross on main building */}
            <rect x="100" y="45" width="10" height="22" rx="2" fill="#FFFFFF" opacity="0.8" />
            <rect x="94" y="51" width="22" height="10" rx="2" fill="#FFFFFF" opacity="0.8" />
            {/* Gentle Rolling Hills */}
            <path d="M0 120 C 60 100, 140 130, 260 110 L 260 140 L 0 140 Z" fill="#BAE6FD" opacity="0.7" />
            <path d="M0 130 C 80 115, 180 135, 260 125 L 260 140 L 0 140 Z" fill="#7DD3FC" opacity="0.8" />
          </svg>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: todayVisitAppt ? 'repeat(auto-fit, minmax(320px, 1fr))' : '1fr',
            gap: '24px',
            alignItems: 'center',
            position: 'relative',
            zIndex: 2
          }}
        >
          {/* Left Column: Greeting & Actions */}
          <div style={{ maxWidth: todayVisitAppt ? '480px' : '650px' }}>
            <h1
              style={{
                fontSize: 'clamp(22px, 3.2vw, 30px)',
                fontWeight: 900,
                color: '#0F172A',
                margin: '0 0 6px 0',
                letterSpacing: '-0.02em',
                fontFamily: "'Outfit', sans-serif"
              }}
            >
              {getTimeGreeting()}, <span style={{ color: '#0284C7' }}>{patientFirstName}</span> 👋
            </h1>

            <p
              style={{
                fontSize: '14px',
                color: '#475569',
                fontWeight: 600,
                margin: '0 0 20px 0'
              }}
            >
              Your care at{' '}
              <strong style={{ color: '#0284C7', fontWeight: 800 }}>{hospitalName}</strong>
            </p>

            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
              <button
                type="button"
                className="desktop-only-btn"
                onClick={onOpenBooking}
                style={{
                  background: 'linear-gradient(135deg, #2563EB 0%, #0284C7 100%)',
                  color: '#FFFFFF',
                  border: 'none',
                  borderRadius: '12px',
                  padding: '11px 20px',
                  fontSize: '13.5px',
                  fontWeight: 800,
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '8px',
                  boxShadow: '0 4px 14px rgba(37, 99, 235, 0.28)',
                  transition: 'all 0.15s ease'
                }}
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
                <span>Book Appointment</span>
              </button>

              <button
                type="button"
                onClick={() => onNavigateTab('find')}
                style={{
                  background: '#FFFFFF',
                  color: '#2563EB',
                  border: '1.5px solid #BFDBFE',
                  borderRadius: '12px',
                  padding: '11px 20px',
                  fontSize: '13.5px',
                  fontWeight: 800,
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '8px',
                  boxShadow: '0 2px 6px rgba(37, 99, 235, 0.06)',
                  transition: 'all 0.15s ease'
                }}
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="11" cy="11" r="8" />
                  <path d="m21 21-4.3-4.3" />
                </svg>
                <span>Explore Doctors</span>
              </button>
            </div>
          </div>

          {/* Right Column (Desktop Hero): Live OPD Token Card */}
          {todayVisitAppt && (
            <div style={{ maxWidth: '440px', width: '100%', justifySelf: 'end' }}>
              <LiveTokenCard
                todayAppt={todayVisitAppt}
                patientQueue={patientQueue}
                onViewAppointmentDetails={onViewAppointmentDetails}
                onBookAppointment={onOpenBooking}
              />
            </div>
          )}
        </div>
      </div>

      {/* 3. ROW 2: UPCOMING APPOINTMENT (Left) + QUICK ACTIONS (Right) */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(280px, 1.15fr) minmax(360px, 2fr)',
          gap: '20px',
          alignItems: 'stretch'
        }}
        className="hospital-row-2"
      >
        <UpcomingAppointmentCard
          upcomingAppt={nextUpcomingAppt}
          hospital={hospital}
          onViewDetails={onViewAppointmentDetails}
        />

        <HospitalQuickActions onNavigate={onNavigateTab} />
      </div>

      {/* 4. ROW 3 (3-COLUMN SECTION): CARE JOURNEY + RECENT LABS + PRESCRIPTIONS */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(280px, 1.35fr) minmax(260px, 1fr) minmax(260px, 1fr)',
          gap: '20px',
          alignItems: 'stretch'
        }}
        className="hospital-row-3"
      >
        <CareJourneyTimeline
          appointments={appointments}
          prescriptions={prescriptions}
          labRequests={labRequests}
          visits={visits}
          onViewAppointment={onViewAppointmentDetails}
          onViewPrescription={onViewPrescription}
          onViewLabReport={onViewLabReport}
          onViewVisit={onViewVisit}
          onNavigateTab={onNavigateTab}
        />

        <RecentLabReports
          labRequests={labRequests}
          onViewLabReport={onViewLabReport}
          onNavigateTab={onNavigateTab}
        />

        <RecentPrescriptions
          prescriptions={prescriptions}
          onViewPrescription={onViewPrescription}
          onNavigateTab={onNavigateTab}
        />
      </div>

      {/* 5. ROW 4: HEALTH VAULT IDENTIFIERS STRIP */}
      <HealthVaultStrip currentUser={currentUser} patientProfile={patientProfile} />

      {/* Clear space for attached bottom dock on mobile */}
      <div style={{ height: '84px', flexShrink: 0 }} className="mobile-only-block" aria-hidden="true" />
    </div>
  );
};

export default PatientHospitalHome;
