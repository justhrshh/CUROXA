import React from 'react';

const HospitalBottomNav = ({ activeTab, onSelectTab, onOpenBooking }) => {
  return (
    <nav
      className="hospital-bottom-dock"
      style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        width: '100%',
        height: '64px',
        background: 'rgba(255, 255, 255, 0.98)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        borderTop: '1px solid #E2E8F0',
        borderLeft: 'none',
        borderRight: 'none',
        borderBottom: 'none',
        borderTopLeftRadius: '20px',
        borderTopRightRadius: '20px',
        boxShadow: '0 -4px 20px rgba(15, 23, 42, 0.08)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-around',
        padding: '0 8px',
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
        zIndex: 1050
      }}
    >
      {/* 1. HOME */}
      <button
        type="button"
        onClick={() => onSelectTab('summary')}
        style={{
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '3px',
          color: activeTab === 'summary' ? '#2563EB' : '#94A3B8',
          fontSize: '11px',
          fontWeight: activeTab === 'summary' ? 800 : 600,
          padding: '6px 12px',
          transition: 'color 0.18s ease'
        }}
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="21" height="21" viewBox="0 0 24 24" fill={activeTab === 'summary' ? 'rgba(37, 99, 235, 0.12)' : 'none'} stroke="currentColor" strokeWidth={activeTab === 'summary' ? 2.5 : 2} strokeLinecap="round" strokeLinejoin="round">
          <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
          <polyline points="9 22 9 12 15 12 15 22" />
        </svg>
        <span>Home</span>
      </button>

      {/* 2. VISITS */}
      <button
        type="button"
        onClick={() => onSelectTab('history')}
        style={{
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '3px',
          color: activeTab === 'history' ? '#2563EB' : '#94A3B8',
          fontSize: '11px',
          fontWeight: activeTab === 'history' ? 800 : 600,
          padding: '6px 12px',
          transition: 'color 0.18s ease'
        }}
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={activeTab === 'history' ? 2.5 : 2} strokeLinecap="round" strokeLinejoin="round">
          <path d="M8 2v4" />
          <path d="M16 2v4" />
          <rect width="18" height="18" x="3" y="4" rx="2" />
          <path d="M3 10h18" />
        </svg>
        <span>Visits</span>
      </button>

      {/* 3. CENTER DOMINANT ELEVATED + BOOK BUTTON */}
      <div style={{ position: 'relative', width: '56px', height: '56px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <button
          type="button"
          onClick={onOpenBooking}
          style={{
            position: 'absolute',
            top: '-20px',
            width: '54px',
            height: '54px',
            borderRadius: '50%',
            background: 'linear-gradient(135deg, #2563EB 0%, #1D4ED8 50%, #06B6D4 100%)',
            color: '#FFFFFF',
            border: '3.5px solid #FFFFFF',
            boxShadow: '0 10px 24px -2px rgba(37, 99, 235, 0.45), 0 4px 10px rgba(0, 0, 0, 0.08)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            transition: 'transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1), box-shadow 0.2s ease',
            zIndex: 10
          }}
          onMouseEnter={e => {
            e.currentTarget.style.transform = 'scale(1.08) translateY(-2px)';
            e.currentTarget.style.boxShadow = '0 14px 28px -2px rgba(37, 99, 235, 0.55)';
          }}
          onMouseLeave={e => {
            e.currentTarget.style.transform = 'none';
            e.currentTarget.style.boxShadow = '0 10px 24px -2px rgba(37, 99, 235, 0.45), 0 4px 10px rgba(0, 0, 0, 0.08)';
          }}
          title="Book Appointment"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          <span style={{ fontSize: '8.5px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.04em', marginTop: '-2px' }}>
            Book
          </span>
        </button>
      </div>

      {/* 4. RECORDS / VAULT */}
      <button
        type="button"
        onClick={() => onSelectTab('records')}
        style={{
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '3px',
          color: activeTab === 'records' || activeTab === 'documents' || activeTab === 'prescriptions' ? '#2563EB' : '#94A3B8',
          fontSize: '11px',
          fontWeight: activeTab === 'records' || activeTab === 'documents' || activeTab === 'prescriptions' ? 800 : 600,
          padding: '6px 12px',
          transition: 'color 0.18s ease'
        }}
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={activeTab === 'records' ? 2.5 : 2} strokeLinecap="round" strokeLinejoin="round">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
          <line x1="16" y1="13" x2="8" y2="13" />
          <line x1="16" y1="17" x2="8" y2="17" />
          <polyline points="10 9 9 9 8 9" />
        </svg>
        <span>Records</span>
      </button>

      {/* 5. PROFILE */}
      <button
        type="button"
        onClick={() => onSelectTab('profile')}
        style={{
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '3px',
          color: activeTab === 'profile' || activeTab === 'privacy' ? '#2563EB' : '#94A3B8',
          fontSize: '11px',
          fontWeight: activeTab === 'profile' || activeTab === 'privacy' ? 800 : 600,
          padding: '6px 12px',
          transition: 'color 0.18s ease'
        }}
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={activeTab === 'profile' ? 2.5 : 2} strokeLinecap="round" strokeLinejoin="round">
          <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
          <circle cx="12" cy="7" r="4" />
        </svg>
        <span>Profile</span>
      </button>
    </nav>
  );
};

export default HospitalBottomNav;
