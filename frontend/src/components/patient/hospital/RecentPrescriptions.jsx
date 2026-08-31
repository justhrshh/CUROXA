import React from 'react';

const RecentPrescriptions = ({ prescriptions = [], onViewPrescription, onNavigateTab }) => {
  const colors = [
    { bg: '#FAF5FF', color: '#7C3AED' },
    { bg: '#F0FDF4', color: '#16A34A' },
    { bg: '#FFF7ED', color: '#EA580C' }
  ];

  const displayRx = prescriptions.length > 0
    ? prescriptions.slice(0, 3).map((rx, i) => {
        const medCount = Array.isArray(rx.medicines) ? rx.medicines.length : (i === 0 ? 3 : i === 1 ? 2 : 1);
        const docName = rx.doctorId?.name || rx.doctorName || (i === 0 ? 'Dr. Doctor-5' : i === 1 ? 'Dr. Doctor-2' : 'Dr. Doctor-3');
        const dateStr = rx.date ? new Date(rx.date).toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' }) : (i === 0 ? '30 Aug 2026' : i === 1 ? '18 Aug 2026' : '05 Aug 2026');
        return {
          id: rx._id || `rx-${i}`,
          doctorName: docName.startsWith('Dr. ') ? docName : `Dr. ${docName}`,
          dateStr,
          medCount: `${medCount} medicine${medCount > 1 ? 's' : ''}`,
          color: colors[i % colors.length],
          raw: rx
        };
      })
    : [
        { id: '1', doctorName: 'Dr. Doctor-5', dateStr: '30 Aug 2026', medCount: '3 medicines', color: colors[0] },
        { id: '2', doctorName: 'Dr. Doctor-2', dateStr: '18 Aug 2026', medCount: '2 medicines', color: colors[1] },
        { id: '3', doctorName: 'Dr. Doctor-3', dateStr: '05 Aug 2026', medCount: '1 medicine', color: colors[2] }
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
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <span style={{ fontSize: '14px', fontWeight: 800, color: '#0F172A' }}>
            Prescriptions
          </span>
          <button
            type="button"
            onClick={() => onNavigateTab && onNavigateTab('prescriptions')}
            style={{
              background: 'none',
              border: 'none',
              color: '#2563EB',
              fontSize: '12px',
              fontWeight: 800,
              cursor: 'pointer'
            }}
          >
            View All
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {displayRx.map((item) => (
            <div
              key={item.id}
              onClick={() => item.raw && onViewPrescription ? onViewPrescription(item.raw) : (onNavigateTab && onNavigateTab('prescriptions'))}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '8px 6px',
                borderRadius: '12px',
                cursor: 'pointer',
                transition: 'all 0.15s ease'
              }}
              onMouseEnter={e => e.currentTarget.style.background = '#F8FAFC'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
                <div
                  style={{
                    width: '36px',
                    height: '36px',
                    borderRadius: '50%',
                    background: item.color.bg,
                    color: item.color.color,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0
                  }}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
                    <circle cx="12" cy="7" r="4" />
                  </svg>
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: '12.5px', fontWeight: 800, color: '#0F172A', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {item.doctorName}
                  </div>
                  <div style={{ fontSize: '11px', color: '#64748B', fontWeight: 550 }}>
                    {item.dateStr} • {item.medCount}
                  </div>
                </div>
              </div>

              {/* Action Button: Document / Download Icon */}
              <div style={{ flexShrink: 0, marginLeft: '8px' }}>
                <button
                  type="button"
                  style={{
                    width: '32px',
                    height: '32px',
                    borderRadius: '8px',
                    background: '#EFF6FF',
                    border: '1px solid #BFDBFE',
                    color: '#2563EB',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer'
                  }}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                    <line x1="16" y1="13" x2="8" y2="13" />
                    <line x1="16" y1="17" x2="8" y2="17" />
                  </svg>
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default RecentPrescriptions;
