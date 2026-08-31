import React from 'react';

const HospitalLoadingTransition = ({ hospital, visible }) => {
  if (!visible || !hospital) return null;

  const hospitalInitials = hospital.name
    ? hospital.name.split(' ').map(w => w[0]).join('').substring(0, 2).toUpperCase()
    : 'HP';

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        background: 'linear-gradient(135deg, rgba(240, 249, 255, 0.98) 0%, rgba(255, 255, 255, 0.99) 50%, rgba(240, 253, 250, 0.98) 100%)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
        animation: 'fadeIn 0.25s ease-out'
      }}
    >
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          textAlign: 'center',
          maxWidth: '380px',
          animation: 'slideUp 0.35s ease-out'
        }}
      >
        {/* Animated Hospital Monogram / Logo Container */}
        <div style={{ position: 'relative', marginBottom: '22px' }}>
          <div
            style={{
              position: 'absolute',
              inset: '-10px',
              borderRadius: '32px',
              background: 'radial-gradient(circle, rgba(37, 99, 235, 0.2) 0%, rgba(6, 182, 212, 0.05) 70%, transparent 100%)',
              filter: 'blur(8px)',
              animation: 'pulse 1.5s infinite ease-in-out'
            }}
          />

          {hospital.logo || hospital.letterheadUrl ? (
            <img
              src={hospital.logo || hospital.letterheadUrl}
              alt={hospital.name}
              style={{
                width: '76px',
                height: '76px',
                borderRadius: '24px',
                objectFit: 'cover',
                background: '#FFFFFF',
                boxShadow: '0 12px 28px -4px rgba(37, 99, 235, 0.25)',
                border: '2px solid rgba(255, 255, 255, 0.9)',
                position: 'relative',
                zIndex: 2
              }}
            />
          ) : (
            <div
              style={{
                width: '76px',
                height: '76px',
                borderRadius: '24px',
                background: 'linear-gradient(135deg, #1E3A8A 0%, #2563EB 50%, #06B6D4 100%)',
                color: '#FFFFFF',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 900,
                fontSize: '26px',
                letterSpacing: '0.04em',
                boxShadow: '0 14px 30px -4px rgba(37, 99, 235, 0.35)',
                border: '2px solid rgba(255, 255, 255, 0.8)',
                position: 'relative',
                zIndex: 2
              }}
            >
              {hospitalInitials}
            </div>
          )}

          {/* Orbiting Spinner Ring */}
          <div
            style={{
              position: 'absolute',
              inset: '-6px',
              borderRadius: '30px',
              border: '2.5px solid transparent',
              borderTopColor: '#2563EB',
              borderRightColor: '#06B6D4',
              animation: 'spin 1s linear infinite',
              zIndex: 3
            }}
          />
        </div>

        {/* Micro-Copy */}
        <span
          style={{
            fontSize: '11px',
            fontWeight: 800,
            textTransform: 'uppercase',
            letterSpacing: '0.12em',
            color: '#2563EB',
            marginBottom: '6px'
          }}
        >
          Connecting to
        </span>

        <h2
          style={{
            fontSize: '22px',
            fontWeight: 900,
            color: '#0F172A',
            margin: '0 0 6px 0',
            letterSpacing: '-0.02em',
            fontFamily: "'Outfit', sans-serif"
          }}
        >
          {hospital.name || 'Hospital Space'}
        </h2>

        {hospital.address && (
          <p
            style={{
              fontSize: '12px',
              color: '#64748B',
              margin: '0 0 16px 0',
              fontWeight: 550,
              maxWidth: '280px',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis'
            }}
          >
            {hospital.address}
          </p>
        )}

        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            background: 'rgba(255, 255, 255, 0.9)',
            padding: '6px 14px',
            borderRadius: '99px',
            border: '1px solid #E2E8F0',
            boxShadow: '0 2px 8px rgba(15, 23, 42, 0.04)'
          }}
        >
          <span
            style={{
              width: '6px',
              height: '6px',
              borderRadius: '50%',
              background: '#0D9488',
              boxShadow: '0 0 8px #0D9488',
              animation: 'pulse 1.2s infinite'
            }}
          />
          <span style={{ fontSize: '12px', fontWeight: 700, color: '#334155' }}>
            Loading your healthcare space...
          </span>
        </div>
      </div>
    </div>
  );
};

export default HospitalLoadingTransition;
