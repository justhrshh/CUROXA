import React, { useState, useRef, useEffect } from 'react';

const HospitalTopNav = ({
  hospital,
  onChangeHospital,
  currentUser,
  patientUhid,
  unreadNotificationsCount,
  onOpenNotifications,
  onOpenProfile,
  onLogout
}) => {
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const profileRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (profileRef.current && !profileRef.current.contains(e.target)) {
        setShowProfileMenu(false);
      }
    };
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, []);

  if (!hospital) return null;

  const hospitalInitials = hospital.name
    ? hospital.name.split(' ').map(w => w[0]).join('').substring(0, 2).toUpperCase()
    : 'HP';

  const userInitials = currentUser?.name
    ? currentUser.name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase()
    : 'PT';

  return (
    <header
      className="hospital-top-nav"
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 1100,
        background: 'rgba(255, 255, 255, 0.94)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        borderBottom: '1px solid #E2E8F0',
        boxShadow: '0 4px 20px -2px rgba(15, 23, 42, 0.04)',
        padding: '10px 16px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '12px'
      }}
    >
      {/* LEFT: Hospital Monogram/Logo + Name + Switcher */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          minWidth: 0,
          flex: 1
        }}
      >
        {/* Hospital Monogram / Logo */}
        {hospital.logo || hospital.letterheadUrl ? (
          <img
            src={hospital.logo || hospital.letterheadUrl}
            alt={hospital.name}
            style={{
              width: '42px',
              height: '42px',
              borderRadius: '12px',
              objectFit: 'cover',
              border: '1.5px solid #BFDBFE',
              background: '#FFFFFF',
              boxShadow: '0 2px 8px rgba(37, 99, 235, 0.15)',
              flexShrink: 0
            }}
          />
        ) : (
          <div
            style={{
              width: '42px',
              height: '42px',
              borderRadius: '12px',
              background: 'linear-gradient(135deg, #1E3A8A 0%, #2563EB 60%, #06B6D4 100%)',
              color: '#FFFFFF',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 900,
              fontSize: '15px',
              letterSpacing: '0.04em',
              boxShadow: '0 2px 8px rgba(37, 99, 235, 0.25)',
              flexShrink: 0
            }}
          >
            {hospitalInitials}
          </div>
        )}

        {/* Hospital Identity & Switcher Button */}
        <div style={{ minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'nowrap' }}>
            <h1
              style={{
                fontSize: '15px',
                fontWeight: 800,
                color: '#0F172A',
                margin: 0,
                letterSpacing: '-0.01em',
                lineHeight: 1.2,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                maxWidth: '180px'
              }}
              title={hospital.name}
            >
              {hospital.name}
            </h1>
            <span
              style={{
                width: '6px',
                height: '6px',
                borderRadius: '50%',
                background: '#10B981',
                flexShrink: 0
              }}
              title="Active Care Context"
            />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '2px' }}>
            {hospital.address ? (
              <span
                style={{
                  fontSize: '11px',
                  color: '#64748B',
                  fontWeight: 500,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  maxWidth: '130px'
                }}
              >
                {hospital.address}
              </span>
            ) : (
              <span style={{ fontSize: '11px', color: '#64748B', fontWeight: 500 }}>
                Care Network
              </span>
            )}

            <button
              type="button"
              onClick={onChangeHospital}
              style={{
                background: '#EFF6FF',
                border: '1px solid #BFDBFE',
                borderRadius: '99px',
                padding: '2px 8px',
                fontSize: '10.5px',
                fontWeight: 700,
                color: '#2563EB',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '3px',
                whiteSpace: 'nowrap',
                transition: 'all 0.15s ease'
              }}
              onMouseEnter={e => {
                e.currentTarget.style.background = '#DBEAFE';
                e.currentTarget.style.borderColor = '#93C5FD';
              }}
              onMouseLeave={e => {
                e.currentTarget.style.background = '#EFF6FF';
                e.currentTarget.style.borderColor = '#BFDBFE';
              }}
              title="Switch to another hospital in Curoxa"
            >
              <span>Change</span>
              <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6"/></svg>
            </button>
          </div>
        </div>
      </div>

      {/* RIGHT: Notifications Bell + User Profile Pill */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0 }}>
        {/* Notification Bell */}
        <button
          type="button"
          onClick={onOpenNotifications}
          style={{
            position: 'relative',
            width: '38px',
            height: '38px',
            borderRadius: '10px',
            border: '1px solid #E2E8F0',
            background: '#FFFFFF',
            color: '#475569',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            boxShadow: '0 2px 6px rgba(15, 23, 42, 0.04)',
            transition: 'all 0.15s ease'
          }}
          title="Notifications"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
            <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
          </svg>
          {unreadNotificationsCount > 0 && (
            <span
              style={{
                position: 'absolute',
                top: '-3px',
                right: '-3px',
                background: '#EF4444',
                color: '#FFFFFF',
                borderRadius: '50%',
                width: '17px',
                height: '17px',
                fontSize: '10px',
                fontWeight: 900,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                border: '2px solid #FFFFFF'
              }}
            >
              {unreadNotificationsCount}
            </span>
          )}
        </button>

        {/* User Profile Pill & Dropdown */}
        <div ref={profileRef} style={{ position: 'relative' }}>
          <div
            onClick={(e) => {
              e.stopPropagation();
              setShowProfileMenu(!showProfileMenu);
            }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '3px 8px 3px 4px',
              borderRadius: '99px',
              border: '1px solid #E2E8F0',
              background: '#FFFFFF',
              cursor: 'pointer',
              boxShadow: '0 2px 6px rgba(15, 23, 42, 0.04)',
              transition: 'all 0.15s ease'
            }}
          >
            {currentUser?.avatar ? (
              <img
                src={currentUser.avatar}
                alt={currentUser.name}
                style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: '50%',
                  objectFit: 'cover',
                  border: '1.5px solid #BFDBFE'
                }}
              />
            ) : (
              <div
                style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: '50%',
                  background: 'linear-gradient(135deg, #2563EB 0%, #06B6D4 100%)',
                  color: '#FFFFFF',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 900,
                  fontSize: '12px'
                }}
              >
                {userInitials}
              </div>
            )}
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#64748B"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{
                transform: showProfileMenu ? 'rotate(180deg)' : 'none',
                transition: 'transform 0.2s ease'
              }}
            >
              <path d="m6 9 6 6 6-6" />
            </svg>
          </div>

          {/* Profile Dropdown Menu */}
          {showProfileMenu && (
            <div
              style={{
                position: 'absolute',
                top: '46px',
                right: '0px',
                width: '210px',
                background: '#FFFFFF',
                borderRadius: '14px',
                border: '1px solid #E2E8F0',
                boxShadow: '0 12px 32px rgba(15, 23, 42, 0.12)',
                padding: '8px',
                zIndex: 3000,
                animation: 'fadeInScale 0.18s ease-out'
              }}
              onClick={e => e.stopPropagation()}
            >
              <div style={{ padding: '8px 10px', borderBottom: '1px solid #F1F5F9', marginBottom: '6px' }}>
                <div style={{ fontWeight: 800, fontSize: '13px', color: '#0F172A' }}>
                  {currentUser?.name || 'Harsh Gupta'}
                </div>
                {patientUhid && (
                  <div style={{ fontSize: '11px', color: '#64748B', fontWeight: 600, marginTop: '2px' }}>
                    UHID: {patientUhid}
                  </div>
                )}
              </div>

              <div
                style={{
                  padding: '9px 10px',
                  borderRadius: '8px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '9px',
                  fontSize: '13px',
                  fontWeight: 700,
                  color: '#334155',
                  cursor: 'pointer',
                  transition: 'background 0.15s ease'
                }}
                onMouseEnter={e => e.currentTarget.style.background = '#F8FAFC'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                onClick={(e) => {
                  e.stopPropagation();
                  setShowProfileMenu(false);
                  onOpenProfile();
                }}
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                <span>My Profile</span>
              </div>

              <div
                style={{
                  padding: '9px 10px',
                  borderRadius: '8px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '9px',
                  fontSize: '13px',
                  fontWeight: 700,
                  color: '#2563EB',
                  cursor: 'pointer',
                  transition: 'background 0.15s ease'
                }}
                onMouseEnter={e => e.currentTarget.style.background = '#EFF6FF'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                onClick={(e) => {
                  e.stopPropagation();
                  setShowProfileMenu(false);
                  onChangeHospital();
                }}
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m16 16 4-4-4-4"/><path d="M20 12H8"/><path d="M4 20V4"/></svg>
                <span>Change Hospital</span>
              </div>

              <div
                style={{
                  padding: '9px 10px',
                  borderRadius: '8px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '9px',
                  fontSize: '13px',
                  fontWeight: 700,
                  color: '#DC2626',
                  cursor: 'pointer',
                  transition: 'background 0.15s ease',
                  marginTop: '4px'
                }}
                onMouseEnter={e => e.currentTarget.style.background = '#FEF2F2'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                onClick={(e) => {
                  e.stopPropagation();
                  setShowProfileMenu(false);
                  onLogout();
                }}
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" x2="9" y1="12" y2="12"/></svg>
                <span>Logout</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};

export default HospitalTopNav;
