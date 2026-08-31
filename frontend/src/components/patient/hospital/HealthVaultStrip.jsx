import React from 'react';

const HealthVaultStrip = ({ currentUser, patientProfile }) => {
  const abhaId = patientProfile?.abhaId || currentUser?.abhaId || 'ABHA-1234-5678-9012';
  const uhid = patientProfile?.uhid || currentUser?.uhid || 'CUROXA-456B50';
  const bloodGroup = patientProfile?.bloodGroup || currentUser?.bloodGroup || 'B+';
  const allergies = patientProfile?.allergies || (Array.isArray(currentUser?.allergies) ? currentUser.allergies.join(', ') : currentUser?.allergies) || 'No known allergies';

  const items = [
    {
      id: 'abha',
      label: 'ABHA ID',
      value: abhaId,
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
          <path d="m9 12 2 2 4-4" />
        </svg>
      ),
      iconBg: '#ECFDF5'
    },
    {
      id: 'uhid',
      label: 'UHID',
      value: uhid,
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#2563EB" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
          <circle cx="12" cy="7" r="4" />
        </svg>
      ),
      iconBg: '#EFF6FF'
    },
    {
      id: 'blood',
      label: 'Blood Group',
      value: bloodGroup,
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#DC2626" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5s-3.5-4-4-6.5c-.5 2.5-2 4.9-4 6.5C6 11.1 5 13 5 15a7 7 0 0 0 7 7z" />
        </svg>
      ),
      iconBg: '#FEF2F2'
    },
    {
      id: 'allergies',
      label: 'Allergy',
      value: allergies,
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#EA580C" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z" />
        </svg>
      ),
      iconBg: '#FFF7ED'
    }
  ];

  return (
    <div
      className="hospital-card"
      style={{
        background: 'linear-gradient(135deg, #F0F9FF 0%, #FFFFFF 50%, #F0FDF4 100%)',
        borderRadius: '20px',
        border: '1px solid #E2E8F0',
        padding: '16px 24px',
        boxShadow: '0 4px 16px -2px rgba(15, 23, 42, 0.03)',
        marginTop: '20px',
        boxSizing: 'border-box'
      }}
    >
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: '16px',
          alignItems: 'center'
        }}
      >
        {items.map((item) => (
          <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div
              style={{
                width: '40px',
                height: '40px',
                borderRadius: '50%',
                background: item.iconBg,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0
              }}
            >
              {item.icon}
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: '11px', fontWeight: 800, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                {item.label}
              </div>
              <div style={{ fontSize: '13px', fontWeight: 800, color: '#0F172A', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {item.value}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default HealthVaultStrip;
