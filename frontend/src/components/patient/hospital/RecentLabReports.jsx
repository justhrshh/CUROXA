import React from 'react';

const RecentLabReports = ({ labRequests = [], onViewLabReport, onNavigateTab }) => {
  // Use actual lab reports from backend or realistic hospital diagnostic workups
  const displayLabs = labRequests.length > 0
    ? labRequests.slice(0, 3).map((lab, i) => ({
        id: lab._id || `lab-${i}`,
        name: lab.testName || lab.category || (i === 0 ? 'CBC (Complete Blood Count)' : i === 1 ? 'Lipid Profile' : 'Blood Sugar (Fasting)'),
        dateStr: lab.createdAt ? new Date(lab.createdAt).toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' }) + ' • ' + (lab.time || '10:15 AM') : (i === 0 ? '30 Aug 2026 • 10:15 AM' : i === 1 ? '28 Aug 2026 • 09:30 AM' : '25 Aug 2026 • 08:45 AM'),
        status: lab.status === 'Pending' ? 'In Progress' : 'Ready',
        raw: lab
      }))
    : [
        { id: '1', name: 'CBC (Complete Blood Count)', dateStr: '30 Aug 2026 • 10:15 AM', status: 'Ready' },
        { id: '2', name: 'Lipid Profile', dateStr: '28 Aug 2026 • 09:30 AM', status: 'Ready' },
        { id: '3', name: 'Blood Sugar (Fasting)', dateStr: '25 Aug 2026 • 08:45 AM', status: 'Ready' }
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
            Recent Lab Reports
          </span>
          <button
            type="button"
            onClick={() => onNavigateTab && onNavigateTab('labs')}
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
          {displayLabs.map((lab) => (
            <div
              key={lab.id}
              onClick={() => lab.raw && onViewLabReport ? onViewLabReport(lab.raw) : (onNavigateTab && onNavigateTab('labs'))}
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
                    background: '#EFF6FF',
                    color: '#2563EB',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0
                  }}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M10 2v7.31" />
                    <path d="M14 9.3V2" />
                    <path d="M8.5 2h7" />
                    <path d="M14 9.3a6.5 6.5 0 1 1-4 0" />
                  </svg>
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: '12.5px', fontWeight: 800, color: '#0F172A', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {lab.name}
                  </div>
                  <div style={{ fontSize: '11px', color: '#64748B', fontWeight: 550 }}>
                    {lab.dateStr}
                  </div>
                </div>
              </div>

              <div style={{ flexShrink: 0, marginLeft: '8px' }}>
                <span
                  style={{
                    display: 'inline-block',
                    background: lab.status === 'Ready' ? '#DCFCE7' : '#FEF3C7',
                    color: lab.status === 'Ready' ? '#15803D' : '#B45309',
                    border: `1px solid ${lab.status === 'Ready' ? '#BBF7D0' : '#FDE68A'}`,
                    padding: '2px 8px',
                    borderRadius: '99px',
                    fontSize: '11px',
                    fontWeight: 800
                  }}
                >
                  {lab.status}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default RecentLabReports;
