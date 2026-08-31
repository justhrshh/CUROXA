import React from 'react';

const HospitalQuickActions = ({ onNavigate }) => {
  const actions = [
    {
      id: 'history',
      title: 'Previous Visits',
      desc: 'Past consultations',
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#2563EB" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" />
        </svg>
      ),
      iconBg: '#EFF6FF',
      iconBorder: '#BFDBFE'
    },
    {
      id: 'find',
      title: 'Explore Doctors',
      desc: 'Hospital specialists',
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#0D9488" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <line x1="19" y1="8" x2="19" y2="14" />
          <line x1="22" y1="11" x2="16" y2="11" />
        </svg>
      ),
      iconBg: '#F0FDFA',
      iconBorder: '#99F6E4'
    },
    {
      id: 'prescriptions',
      title: 'Prescriptions',
      desc: 'Rx & medications',
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#7C3AED" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <rect width="16" height="20" x="4" y="2" rx="2" />
          <line x1="8" y1="6" x2="16" y2="6" />
          <path d="M16 14h-4v4" />
        </svg>
      ),
      iconBg: '#FAF5FF',
      iconBorder: '#E9D5FF'
    },
    {
      id: 'labs',
      title: 'Lab Reports',
      desc: 'Diagnostic tests',
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#EA580C" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M10 2v7.31" />
          <path d="M14 9.3V2" />
          <path d="M8.5 2h7" />
          <path d="M14 9.3a6.5 6.5 0 1 1-4 0" />
          <path d="M5.52 16h12.96" />
        </svg>
      ),
      iconBg: '#FFF7ED',
      iconBorder: '#FED7AA'
    },
    {
      id: 'records',
      title: 'Medical Records',
      desc: 'EMR & notes',
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#2563EB" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
          <line x1="16" y1="13" x2="8" y2="13" />
          <line x1="16" y1="17" x2="8" y2="17" />
        </svg>
      ),
      iconBg: '#EFF6FF',
      iconBorder: '#BFDBFE'
    },
    {
      id: 'documents',
      title: 'Documents',
      desc: 'Files & uploads',
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#D97706" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z" />
        </svg>
      ),
      iconBg: '#FEF3C7',
      iconBorder: '#FDE68A'
    }
  ];

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
      <div style={{ fontSize: '13.5px', fontWeight: 800, color: '#0F172A', marginBottom: '14px' }}>
        Quick Healthcare Actions
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))',
          gap: '10px'
        }}
      >
        {actions.map((act) => (
          <button
            key={act.id}
            type="button"
            onClick={() => onNavigate && onNavigate(act.id)}
            style={{
              background: '#FFFFFF',
              border: '1px solid #F1F5F9',
              borderRadius: '16px',
              padding: '14px 10px',
              textAlign: 'center',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              cursor: 'pointer',
              transition: 'all 0.18s ease',
              boxShadow: '0 2px 6px rgba(15, 23, 42, 0.02)'
            }}
            onMouseEnter={e => {
              e.currentTarget.style.transform = 'translateY(-2px)';
              e.currentTarget.style.borderColor = '#CBD5E1';
              e.currentTarget.style.boxShadow = '0 6px 16px -2px rgba(15, 23, 42, 0.08)';
            }}
            onMouseLeave={e => {
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.borderColor = '#F1F5F9';
              e.currentTarget.style.boxShadow = '0 2px 6px rgba(15, 23, 42, 0.02)';
            }}
          >
            <div
              style={{
                width: '42px',
                height: '42px',
                borderRadius: '12px',
                background: act.iconBg,
                border: `1px solid ${act.iconBorder}`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: '8px'
              }}
            >
              {act.icon}
            </div>
            <div style={{ fontSize: '12px', fontWeight: 800, color: '#0F172A', marginBottom: '2px', lineHeight: 1.2 }}>
              {act.title}
            </div>
            <div style={{ fontSize: '10px', color: '#64748B', fontWeight: 550, lineHeight: 1.15 }}>
              {act.desc}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
};

export default HospitalQuickActions;
