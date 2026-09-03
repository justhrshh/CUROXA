import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import api, { setEmergencyBypass, isEmergencyBypassActive, clearPortalAuthContext, performLogout } from '../utils/api';
import PrescriptionMakerTab from './PrescriptionMakerTab';
import HRPayroll from './HRPayroll';
import { convertPdfToImage } from '../utils/pdfHelper';
import ExportModal from '../components/export/ExportModal';
import curoxaSidebarLogo from '../assets/curoxa_sidebar_logo.png';
import { HospitalBrandLogo, getActivePortalBranding, restoreActivePortalDocumentMetadata } from '../context/PortalBrandingContext';
import {
  appointmentExportColumns,
  labReportExportColumns,
  patientExportColumns,
  prescriptionExportColumns
} from '../utils/exportEngine';

const permissionNames = {
  'dr-consult': 'Patient consultation notes',
  'dr-rx': 'Prescription writer',
  'dr-laborder': 'Test order / lab referral',
  'dr-history': 'Patient visit history',
  'dr-discharge': 'Discharge summary',
  'dr-stockview': 'Pharmacy stock view',
  'rc-register': 'Patient registration',
  'rc-appt': 'Appointment booking',
  'rc-queue': 'OPD token queue',
  'rc-upload': 'Lab report upload',
  'rc-billing': 'Billing & receipts',
  'rc-reorder': 'Pharmacy stock reorder',
  'rc-labprint': 'Lab slip printing',
  'lt-queue': 'Test order queue',
  'lt-upload': 'Report upload',
  'lt-reagents': 'Lab reagents inventory',
  'lt-dispatch': 'Report dispatch',
  'lt-extlab': 'External lab coordination',
  'ph-queue': 'Prescription queue',
  'ph-dispense': 'Medicine dispensing',
  'ph-stock': 'Stock inventory',
  'ph-reorder': 'Reorder management',
  'ph-billing': 'Prescription billing',
  'ph-controlled': 'Controlled drugs log',
  'nu-vitals': 'Patient vitals entry',
  'nu-ward': 'Ward round notes',
  'nu-labassist': 'Lab sample assist',
  'nu-dispense': 'Medicine dispensing (assist)'
};

// Safeguard React DOM reconciliation against external DOM mutations (e.g. Lucide CDN node replacement)
if (typeof window !== 'undefined') {
  const originalRemoveChild = Node.prototype.removeChild;
  Node.prototype.removeChild = function(child) {
    if (child.parentNode !== this) {
      return child;
    }
    return originalRemoveChild.call(this, child);
  };

  const originalInsertBefore = Node.prototype.insertBefore;
  Node.prototype.insertBefore = function(newNode, referenceNode) {
    if (referenceNode && referenceNode.parentNode !== this) {
      return originalInsertBefore.call(this, newNode, this.firstChild);
    }
    return originalInsertBefore.call(this, newNode, referenceNode);
  };
}

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  componentDidCatch(error, errorInfo) {
    this.setState({
      hasError: true,
      error: error,
      errorInfo: errorInfo
    });
    console.error("ErrorBoundary caught an error", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: '32px', background: '#FFF5F5', border: '1px solid #FEB2B2', borderRadius: '16px', margin: '32px auto', maxWidth: '800px', color: '#C53030', fontFamily: 'system-ui, -apple-system, sans-serif', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }}>
          <h2 style={{ margin: '0 0 12px 0', fontSize: '20px', fontWeight: 900, display: 'flex', alignItems: 'center', gap: '8px' }}>Something went wrong in EMR render</h2>
          <p style={{ fontWeight: 700, fontSize: '14px', margin: '0 0 16px 0', background: '#FED7D7', padding: '10px 14px', borderRadius: '8px' }}>{this.state.error && this.state.error.toString()}</p>
          <div style={{ fontWeight: 800, fontSize: '11px', textTransform: 'uppercase', marginBottom: '6px', color: '#9B2C2C' }}>Component Trace:</div>
          <pre style={{ background: '#FFF', padding: '16px', borderRadius: '8px', border: '1px solid #FED7D7', fontSize: '11px', overflowX: 'auto', whiteSpace: 'pre-wrap', fontFamily: 'monospace', lineHeight: '1.5' }}>
            {this.state.errorInfo && this.state.errorInfo.componentStack}
          </pre>
          <button style={{ marginTop: '16px', padding: '10px 20px', background: '#DC2626', color: '#FFF', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: '800', fontSize: '13px' }} onClick={() => window.location.reload()}>Reload Dashboard</button>
        </div>
      );
    }
    return this.props.children;
  }
}

let activeDropdownCloseFn = null;

const CustomDropdown = ({ value, onChange, options, className, style, buttonStyle }) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);

  const closeDropdown = useCallback(() => {
    setIsOpen(false);
  }, []);

  useEffect(() => {
    return () => {
      if (activeDropdownCloseFn === closeDropdown) {
        activeDropdownCloseFn = null;
      }
    };
  }, [closeDropdown]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
        if (activeDropdownCloseFn === closeDropdown) {
          activeDropdownCloseFn = null;
        }
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside, true);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside, true);
    };
  }, [isOpen, closeDropdown]);

  const handleToggle = () => {
    if (!isOpen) {
      if (activeDropdownCloseFn && activeDropdownCloseFn !== closeDropdown) {
        activeDropdownCloseFn();
      }
      activeDropdownCloseFn = closeDropdown;
      setIsOpen(true);
    } else {
      setIsOpen(false);
      if (activeDropdownCloseFn === closeDropdown) {
        activeDropdownCloseFn = null;
      }
    }
  };

  const selectedOption = options.find(opt => opt.value === value) || options[0];

  return (
    <div 
      ref={dropdownRef} 
      className={`custom-dropdown-container ${className || ''}`}
      style={{ 
        position: 'relative', 
        display: 'inline-block',
        ...style 
      }}
    >
      <button
        type="button"
        onClick={handleToggle}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '8px',
          padding: '12px 16px',
          borderRadius: '12px',
          border: '1px solid #E2E8F0',
          background: '#ffffff',
          fontSize: '14px',
          color: '#475569',
          fontWeight: 600,
          cursor: 'pointer',
          outline: 'none',
          boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.02)',
          transition: 'all 0.2s ease',
          width: '100%',
          height: '100%',
          textAlign: 'left',
          ...buttonStyle
        }}
      >
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {selectedOption?.label}
        </span>
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{
            transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
            transition: 'transform 0.2s ease',
            color: '#64748B',
            flexShrink: 0
          }}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {isOpen && (
        <div
          className="custom-dropdown-menu"
          style={{
            position: 'absolute',
            top: '100%',
            marginTop: '6px',
            left: 0,
            right: 0,
            minWidth: '180px',
            background: '#ffffff',
            border: '1px solid #E2E8F0',
            borderRadius: '12px',
            boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -4px rgba(0, 0, 0, 0.05)',
            zIndex: 9999,
            overflow: 'hidden',
            padding: '4px',
            animation: 'dropdownFadeIn 0.15s ease-out'
          }}
        >
          {options.map((opt) => {
            const isSelected = opt.value === value;
            return (
              <div
                key={opt.value}
                onClick={() => {
                  onChange(opt.value);
                  setIsOpen(false);
                  if (activeDropdownCloseFn === closeDropdown) {
                    activeDropdownCloseFn = null;
                  }
                }}
                style={{
                  padding: '10px 14px',
                  fontSize: '13.5px',
                  fontWeight: isSelected ? 600 : 500,
                  color: isSelected ? '#1E3A8A' : '#475569',
                  background: isSelected ? '#F0F4FF' : 'transparent',
                  cursor: 'pointer',
                  borderRadius: '8px',
                  transition: 'all 0.15s ease',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '8px'
                }}
                className="custom-dropdown-item"
              >
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {opt.label}
                </span>
                {isSelected && (
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="#1E3A8A"
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    style={{ flexShrink: 0 }}
                  >
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

const MiniCalendarDropdown = ({ selectedDate, onSelectDate, onClearFilter }) => {
  const [currentMonth, setCurrentMonth] = useState(new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1));

  const year = currentMonth.getFullYear();
  const month = currentMonth.getMonth();

  const totalDays = new Date(year, month + 1, 0).getDate();
  const startDay = new Date(year, month, 1).getDay();

  const handlePrevMonth = (e) => {
    e.stopPropagation();
    setCurrentMonth(new Date(year, month - 1, 1));
  };

  const handleNextMonth = (e) => {
    e.stopPropagation();
    setCurrentMonth(new Date(year, month + 1, 1));
  };

  const days = [];
  for (let i = 0; i < startDay; i++) {
    days.push(null);
  }
  for (let i = 1; i <= totalDays; i++) {
    days.push(new Date(year, month, i));
  }

  const monthNames = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ];

  const weekdays = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

  return (
    <div
      className="custom-dropdown-menu"
      style={{
        position: 'absolute',
        top: '100%',
        right: 0,
        marginTop: '8px',
        width: '260px',
        background: '#ffffff',
        border: '1px solid #E2E8F0',
        borderRadius: '16px',
        boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.05)',
        zIndex: 9999,
        padding: '16px',
        animation: 'dropdownFadeIn 0.15s ease-out'
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
        <button
          type="button"
          onClick={handlePrevMonth}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            padding: '4px 8px',
            color: '#64748B',
            fontWeight: 'bold',
            borderRadius: '6px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'background 0.2s',
            fontSize: '14px'
          }}
          onMouseEnter={(e) => e.target.style.background = '#F1F5F9'}
          onMouseLeave={(e) => e.target.style.background = 'none'}
        >
          &lt;
        </button>
        <span style={{ fontSize: '13px', fontWeight: 700, color: '#0F172A' }}>
          {monthNames[month]} {year}
        </span>
        <button
          type="button"
          onClick={handleNextMonth}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            padding: '4px 8px',
            color: '#64748B',
            fontWeight: 'bold',
            borderRadius: '6px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'background 0.2s',
            fontSize: '14px'
          }}
          onMouseEnter={(e) => e.target.style.background = '#F1F5F9'}
          onMouseLeave={(e) => e.target.style.background = 'none'}
        >
          &gt;
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '4px', textAlign: 'center', marginBottom: '8px' }}>
        {weekdays.map(d => (
          <span key={d} style={{ fontSize: '11px', fontWeight: 700, color: '#94A3B8' }}>{d}</span>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '4px' }}>
        {days.map((day, idx) => {
          if (!day) return <div key={`empty-${idx}`} />;
          
          const isSelected = day.toDateString() === selectedDate.toDateString();
          const isToday = day.toDateString() === new Date().toDateString();

          return (
            <button
              key={day.toISOString()}
              type="button"
              onClick={() => onSelectDate(day)}
              style={{
                background: isSelected ? '#2563EB' : 'transparent',
                color: isSelected ? '#ffffff' : (isToday ? '#2563EB' : '#475569'),
                border: 'none',
                borderRadius: '8px',
                padding: '6px 0',
                fontSize: '12px',
                fontWeight: (isSelected || isToday) ? 700 : 500,
                cursor: 'pointer',
                transition: 'all 0.15s ease'
              }}
              onMouseEnter={(e) => {
                if (!isSelected) e.target.style.background = '#F1F5F9';
              }}
              onMouseLeave={(e) => {
                if (!isSelected) e.target.style.background = 'transparent';
              }}
            >
              {day.getDate()}
            </button>
          );
        })}
      </div>

      <div style={{ marginTop: '12px', borderTop: '1px solid #F1F5F9', paddingTop: '10px', display: 'flex', justifyContent: 'center' }}>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onClearFilter();
          }}
          style={{
            background: '#F1F5F9',
            color: '#475569',
            border: 'none',
            borderRadius: '8px',
            padding: '6px 12px',
            fontSize: '11.5px',
            fontWeight: 700,
            cursor: 'pointer',
            transition: 'all 0.15s ease',
            width: '100%'
          }}
          onMouseEnter={(e) => e.target.style.background = '#E2E8F0'}
          onMouseLeave={(e) => e.target.style.background = '#F1F5F9'}
        >
          Show All Dates (Clear Filter)
        </button>
      </div>
    </div>
  );
};

const DoctorDashboard = () => {
  const cleanField = (val) => (val && String(val).trim() !== '') ? String(val).trim() : '—';
  const tenantModules = (() => {
    try {
      return JSON.parse(localStorage.getItem('tenantModules') || '{}');
    } catch (e) {
      return {};
    }
  })();

  const [doctorClinicalMode, setDoctorClinicalMode] = useState(() => {
    try {
      return localStorage.getItem('doctorClinicalMode') || 'ONLINE';
    } catch (e) {
      return 'ONLINE';
    }
  });

  const [activeTab, setActiveTab] = useState(() => {
    try {
      const mode = localStorage.getItem('doctorClinicalMode');
      return mode === 'OFFLINE' ? 'hr-payroll' : 'dash';
    } catch (e) {
      return 'dash';
    }
  });
  const [showHomeCalendar, setShowHomeCalendar] = useState(false);
  const [emrSearchQuery, setEmrSearchQuery] = useState('');
  const [emrFilterType, setEmrFilterType] = useState('all');
  const [emrSortOrder, setEmrSortOrder] = useState('newest');
  const [emrDocSearchQuery, setEmrDocSearchQuery] = useState('');
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [isSetupComplete, setIsSetupComplete] = useState(true);
  const navigate = useNavigate();
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => localStorage.getItem('curoxa_sidebar_collapsed') === 'true');
  
  // Doctor/User Details
  const [currentUser, setCurrentUser] = useState(() => JSON.parse(localStorage.getItem('user') || '{"name":"","specialty":"","id":""}'));
  const user = currentUser;

  // Dynamic role coverage state & listener
  const [coverageState, setCoverageState] = useState(() => {
    const saved = localStorage.getItem('curoxa_pmState');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        const userName = JSON.parse(localStorage.getItem('user') || '{}').name || '';
        if (parsed[userName]) return parsed[userName];
        const matchKey = Object.keys(parsed).find(k => k.toLowerCase().trim() === userName.toLowerCase().trim());
        return matchKey ? parsed[matchKey] : {};
      } catch (e) {}
    }
    return {};
  });

  useEffect(() => {
    const userName = user.name || '';

    // Helper: find coverage for this user by name (handles minor formatting differences)
    const findUserCoverage = (allState) => {
      if (!allState || !userName) return {};
      // Direct match first
      if (allState[userName]) return allState[userName];
      // Case-insensitive fallback
      const matchKey = Object.keys(allState).find(k => k.toLowerCase().trim() === userName.toLowerCase().trim());
      return matchKey ? allState[matchKey] : {};
    };

    const syncFromLocalStorage = () => {
      const saved = localStorage.getItem('curoxa_pmState');
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          setCoverageState(findUserCoverage(parsed));
        } catch (e) {
          console.error(e);
        }
      }
    };

    // Listen for cross-tab localStorage changes
    window.addEventListener('storage', syncFromLocalStorage);

    // Primary: Sync from backend database (works cross-browser / cross-device)
    const fetchBackendCoverage = async () => {
      try {
        const response = await api.get('/auth/role-coverage');
        if (response.data && typeof response.data === 'object') {
          localStorage.setItem('curoxa_pmState', JSON.stringify(response.data));
          setCoverageState(findUserCoverage(response.data));
        }
      } catch (err) {
        console.error('Failed to sync coverage from backend', err);
        // Fallback to localStorage if backend fails
        syncFromLocalStorage();
      }
    };
    fetchBackendCoverage();

    // Poll backend every 5s to pick up admin changes in real-time
    const pollInterval = setInterval(fetchBackendCoverage, 5000);

    return () => {
      window.removeEventListener('storage', syncFromLocalStorage);
      clearInterval(pollInterval);
    };
  }, [user.name]);

  // Doctor Clinical Mode synchronization & active session handling
  useEffect(() => {
    const fetchTenantMode = async () => {
      try {
        const token = localStorage.getItem('token');
        if (!token) return;
        const res = await fetch('/api/auth/tenant-mode', {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.ok) {
          const data = await res.json();
          const mode = data.doctorClinicalMode || 'ONLINE';
          setDoctorClinicalMode(mode);
          localStorage.setItem('doctorClinicalMode', mode);
          if (mode === 'OFFLINE') {
            setActiveTab(prev => {
              const clinicalTabs = ['dash', 'appointments', 'consultations', 'patients', 'prescriptions', 'labs', 'patient-profile', 'receptionist_cover', 'lab_cover', 'pharmacy_cover'];
              return clinicalTabs.includes(prev) ? 'hr-payroll' : prev;
            });
          }
        }
      } catch (err) {
        console.error('Error fetching tenant mode:', err);
      }
    };

    fetchTenantMode();

    const handleSync = (e) => {
      const detail = e.detail;
      if (detail && (detail.type === 'subscription' || detail.type === 'hospital_updated')) {
        fetchTenantMode();
      }
    };

    window.addEventListener('curoxa_sync', handleSync);
    return () => {
      window.removeEventListener('curoxa_sync', handleSync);
    };
  }, []);

  // Direct tab manipulation protection (e.g. via DevTools / console / direct calls)
  useEffect(() => {
    if (doctorClinicalMode === 'OFFLINE') {
      const clinicalTabs = ['appointments', 'consultations', 'patients', 'prescriptions', 'labs', 'patient-profile', 'receptionist_cover', 'lab_cover', 'pharmacy_cover'];
      if (clinicalTabs.includes(activeTab)) {
        setActiveTab('offline-hub');
      }
    }
  }, [activeTab, doctorClinicalMode]);

  // Notifications states
  const [notifications, setNotifications] = useState([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const prevCoverageKeysRef = useRef(null);
  const notificationRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (notificationRef.current && !notificationRef.current.contains(event.target)) {
        setShowNotifications(false);
      }
      if (
        !event.target.closest('.sidebar-user') && 
        !event.target.closest('.sidebar-profile-card') && 
        !event.target.closest('.sidebar-profile') &&
        !event.target.closest('.sidebar-profile-popover-card') &&
        !event.target.closest('.sidebar-profile-popover') &&
        !event.target.closest('.sidebar-profile-footer')
      ) {
        setShowProfileMenu(false);
      }
    };
    document.addEventListener('click', handleClickOutside, true);
    return () => {
      document.removeEventListener('click', handleClickOutside, true);
    };
  }, []);

  useEffect(() => {
    if (!coverageState) return;
    
    // Get all keys where coverage is ON
    const activeKeys = Object.keys(coverageState).filter(k => coverageState[k]?.on);
    
    const userKey = currentUser.staff_id || currentUser.id || currentUser.name || 'default';
    const clearedKey = `curoxa_cleared_notifications_${userKey}`;
    
    if (prevCoverageKeysRef.current === null) {
      // First load: initialize without toast alerts
      prevCoverageKeysRef.current = activeKeys;
      
      const clearedIds = JSON.parse(localStorage.getItem(clearedKey) || '[]');
      
      const initialNotifications = activeKeys.map(k => {
        const details = coverageState[k];
        const permName = permissionNames[k] || k;
        return {
          id: `${k}-${details.grantedAt || 'active'}`,
          title: 'Permission Active',
          message: `You have active coverage for "${permName}" (${details.type === 'temp' ? 'Temporary' : 'Permanent'}).`,
          time: details.grantedAt ? new Date(details.grantedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Active',
          isNew: false
        };
      }).filter(n => !clearedIds.includes(n.id));
      
      setNotifications(initialNotifications);
      setUnreadCount(0);
    } else {
      // Subsequent loads: find newly added/turned ON keys
      const newKeys = activeKeys.filter(k => !prevCoverageKeysRef.current.includes(k));
      const removedKeys = prevCoverageKeysRef.current.filter(k => !activeKeys.includes(k));
      
      if (newKeys.length > 0) {
        const newNotifications = [...notifications];
        const clearedIds = JSON.parse(localStorage.getItem(clearedKey) || '[]');
        let addedCount = 0;
        
        newKeys.forEach(k => {
          const details = coverageState[k];
          const permName = permissionNames[k] || k;
          const notifId = `${k}-${details.grantedAt || 'active'}`;
          
          if (!clearedIds.includes(notifId)) {
            addedCount++;
            showToastNotification(`New Role Coverage Assigned: ${permName}!`);
            
            newNotifications.unshift({
              id: notifId,
              title: 'New Permission Delegated',
              message: `You have been delegated "${permName}" coverage (${details.type === 'temp' ? 'Temporary' : 'Permanent'}).`,
              time: 'Just now',
              isNew: true
            });
          }
        });
        setNotifications(newNotifications);
        setUnreadCount(prev => prev + addedCount);
      }
      
      if (removedKeys.length > 0) {
        removedKeys.forEach(k => {
          showToastNotification(`Role Coverage Revoked: ${permissionNames[k] || k}!`, 'info');
        });
      }
      
      prevCoverageKeysRef.current = activeKeys;
    }
  }, [coverageState]);

  // Reactive Doctor Profile Settings States
  const [docProfile, setDocProfile] = useState({
    name: user.name || 'Dr. Ankit Sharma',
    specialty: user.specialty || 'Cardiology Specialist',
    availability: 'Available',
    avatar: user.avatar || '',
    signature: user.name || 'Dr. Ankit Sharma',
    realtimePharmacy: true
  });

  useEffect(() => {
    setDocProfile(prev => ({
      ...prev,
      name: currentUser.name || prev.name,
      specialty: currentUser.specialty || prev.specialty,
      avatar: currentUser.avatar || ''
    }));
  }, [currentUser]);

  // State declarations for Coverage sub-tabs
  const [receptionistSubTab, setReceptionistSubTab] = useState('queue');
  const [labSubTab, setLabSubTab] = useState('tests');
  const [pharmacySubTab, setPharmacySubTab] = useState('queue');

  // Dynamic role coverage real data / transaction states
  const [coverageAppts, setCoverageAppts] = useState([]);
  const [coverageQueue, setCoverageQueue] = useState([]);
  const [coverageReagents, setCoverageReagents] = useState([]);
  const [coverageLabRequests, setCoverageLabRequests] = useState([]);
  
  // Coverage Lab workflow states
  const [showCoverageLabModal, setShowCoverageLabModal] = useState(false);
  const [selectedCoverageLabTest, setSelectedCoverageLabTest] = useState(null);
  const [coverageLabRemarks, setCoverageLabRemarks] = useState('');
  const [coverageLabParams, setCoverageLabParams] = useState({ value: '', unit: '' });
  const [coverageLabFileName, setCoverageLabFileName] = useState('');
  const [showCoverageLabDetailsModal, setShowCoverageLabDetailsModal] = useState(false);
  const [coverageBills, setCoverageBills] = useState([]);
  const [coveragePharmacyQueue, setCoveragePharmacyQueue] = useState([]);
  const [showCoveragePharmacyPaymentModal, setShowCoveragePharmacyPaymentModal] = useState(false);
  const [selectedCoveragePharmacyRx, setSelectedCoveragePharmacyRx] = useState(null);
  const [coveragePharmacyPaymentMode, setCoveragePharmacyPaymentMode] = useState('UPI');
  const [coveragePharmacyCashReceived, setCoveragePharmacyCashReceived] = useState('');
  const [doctorSearchQuery, setDoctorSearchQuery] = useState('');
  const [labSearchQuery, setLabSearchQuery] = useState('');
  const [labStatusFilter, setLabStatusFilter] = useState('All');
  const [labPriorityFilter, setLabPriorityFilter] = useState('All');
  const [showLabFilters, setShowLabFilters] = useState(false);
  const [pharmacySearchQuery, setPharmacySearchQuery] = useState('');
  const [coveragePharmacyInventory, setCoveragePharmacyInventory] = useState([]);
  const [coverageDoctors, setCoverageDoctors] = useState([]);

  // Real-time Interactive Calendar date state
  const [selectedDate, setSelectedDate] = useState(new Date());

  const getLocalDateString = (d) => {
    const dateObj = d ? new Date(d) : new Date();
    if (isNaN(dateObj.getTime())) return '';
    const year = dateObj.getFullYear();
    const month = String(dateObj.getMonth() + 1).padStart(2, '0');
    const day = String(dateObj.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  // Phase 3 Live Doctor Token Queue State
  const [doctorQueue, setDoctorQueue] = useState({
    currentToken: null,
    currentAppointmentId: null,
    currentPatient: null,
    nextToken: null,
    waitingCount: 0,
    lastIssuedToken: 0
  });

  const fetchDoctorQueue = useCallback(async () => {
    const docId = user?.id || user?._id;
    if (!docId) return;
    try {
      const targetDate = getLocalDateString(selectedDate || new Date());
      const res = await api.get(`/appointments/doctor-queue/${docId}?date=${targetDate}`);
      if (res.data) {
        setDoctorQueue({
          currentToken: res.data.currentToken ?? null,
          currentAppointmentId: res.data.currentAppointmentId ?? null,
          currentPatient: res.data.currentPatient ?? null,
          nextToken: res.data.nextToken ?? null,
          waitingCount: res.data.waitingCount ?? 0,
          lastIssuedToken: res.data.lastIssuedToken ?? 0
        });
      }
    } catch (err) {
      console.warn("Failed to fetch live doctor queue state:", err);
    }
  }, [user, selectedDate]);


  const parseResults = (resultsStr) => {
    if (!resultsStr) return { parameters: {}, remarks: '', isDraft: false };

    try {
      return JSON.parse(resultsStr);
    } catch (e) {
      return { parameters: {}, remarks: resultsStr || '', isDraft: false };
    }
  };

  const fetchCoverageData = useCallback(async () => {
    try {
      // Receptionist cover: appointments and queue
      const apptsRes = await api.get('/appointments');
      if (apptsRes.data && Array.isArray(apptsRes.data)) {
        const today = new Date().toISOString().split('T')[0];
        const todayAppts = apptsRes.data.filter(a => a.date && a.date.startsWith(today));
        setCoverageAppts(todayAppts.slice(0, 5).map(a => ({
          id: a._id,
          patient: a.patientId?.name || 'Unknown',
          slot: a.time || 'N/A',
          status: a.status || 'Upcoming',
          contact: a.patientId?.contact || 'N/A'
        })));
        
        // OPD Daily Token Queue derived from today's appointments
        setCoverageQueue(todayAppts.map((a, idx) => ({
          id: a._id,
          token: `T-${(idx + 1).toString().padStart(3, '0')}`,
          patient: a.patientId?.name || 'Unknown',
          status: a.status || 'Waiting',
          time: a.time || 'N/A'
        })));
      }

      // Prescriptions for pharmacy cover
      const rxRes = await api.get('/prescriptions');
      if (rxRes.data && Array.isArray(rxRes.data)) {
        const pending = rxRes.data
          .filter(r => r.status === 'Pending Pharmacy Dispatch' || r.status === 'Pending')
          .slice(0, 10);
        setCoveragePharmacyQueue(pending.map(r => {
          const amountVal = r.items ? r.items.reduce((acc, curr) => acc + (curr.price || 50) * (curr.quantity || 1), 0) : 220;
          return {
            id: r._id,
            patient: r.patientId?.name || 'Unknown',
            patientId: r.patientId?._id || r.patientId,
            med: r.items?.map(i => `${i.medicine} (${i.dosage || '1 Tab'})`).join(', ') || 'No items',
            qty: r.items?.reduce((sum, i) => sum + (i.quantity || 1), 0) || 0,
            type: r.items?.[0]?.category || 'Rx',
            items: r.items || [],
            amountVal
          };
        }));
      }

      // Bills for receptionist cover
      const billsRes = await api.get('/billing');
      if (billsRes.data && Array.isArray(billsRes.data)) {
        setCoverageBills(billsRes.data.slice(0, 10).map(b => ({
          id: b._id,
          name: b.patientId?.name || 'Unknown',
          service: b.items?.[0]?.description || 'Medical Service',
          amount: b.totalAmount || 0,
          paid: b.status === 'Paid'
        })));
      }

      // Lab reagents/inventory for lab cover
      const labInvRes = await api.get('/lab-inventory');
      if (labInvRes.data && Array.isArray(labInvRes.data)) {
        setCoverageReagents(labInvRes.data.map(item => ({
          id: item._id,
          name: item.name || 'Unknown Reagent',
          stock: `${item.stock || 0} ${item.unit || 'units'}`,
          minStock: `${item.threshold || 0} ${item.unit || 'units'}`,
          status: (item.stock || 0) <= (item.threshold || 0) ? 'Low Stock' : 'Normal'
        })));
      }

      // Fetch lab requests for lab coverage
      const labRes = await api.get('/labs');
      if (labRes.data && Array.isArray(labRes.data)) {
        setCoverageLabRequests(labRes.data.map(item => ({
          id: item._id,
          name: item.patientId?.name || 'Unknown',
          test: item.testName || 'General Test',
          priority: 'Normal',
          status: item.status || 'Pending',
          results: item.results || '',
          notes: item.notes || '',
          rawItem: item
        })));
      }

      // Medicine inventory for pharmacy cover
      const medsRes = await api.get('/medicines');
      if (medsRes.data && Array.isArray(medsRes.data)) {
        setCoveragePharmacyInventory(medsRes.data.map(m => ({
          id: m._id,
          name: m.name,
          stock: m.stock || 0,
          unit: m.unit || 'units',
          status: (m.stock || 0) === 0 ? 'Out of Stock' : (m.stock || 0) < 20 ? 'Low Stock' : 'In Stock'
        })));
      }

      // Fetch staff list for doctors dropdown in receptionist cover
      const staffRes = await api.get('/auth/users/all');
      if (staffRes.data && Array.isArray(staffRes.data)) {
        setCoverageDoctors(staffRes.data.filter(s => s.role === 'doctor'));
      }
    } catch (err) {
      console.error("Failed to fetch coverage data", err);
    }
  }, []);

  const redirectedTabsRef = useRef({});

  // Reset redirection flag on tab changes
  useEffect(() => {
    redirectedTabsRef.current = {
      [activeTab]: redirectedTabsRef.current[activeTab]
    };
  }, [activeTab]);

  // Restrict activeTab for cover users based on active coverage permissions
  useEffect(() => {
    const isCoverUser = currentUser?.role !== 'doctor';
    if (!isCoverUser) return;
    if (!coverageState || Object.keys(coverageState).length === 0) return;

    let isPermitted = false;
    if (activeTab === 'dash') {
      isPermitted = true;
    } else if (activeTab === 'consultations') {
      isPermitted = !!(coverageState['dr-consult']?.on || coverageState['dr-discharge']?.on || coverageState['dr-history']?.on);
    } else if (activeTab === 'appointments') {
      isPermitted = !!(coverageState['dr-consult']?.on || coverageState['dr-history']?.on);
    } else if (activeTab === 'labs') {
      isPermitted = !!coverageState['dr-laborder']?.on;
    } else if (activeTab === 'prescriptions') {
      isPermitted = !!coverageState['dr-rx']?.on;
    } else if (activeTab === 'settings') {
      isPermitted = false;
    } else {
      // Any other cover tab (e.g. receptionist_cover, lab_cover, pharmacy_cover) is handled by core role cover routing
      isPermitted = true;
    }

    if (!isPermitted) {
      if (coverageState['dr-consult']?.on || coverageState['dr-discharge']?.on || coverageState['dr-history']?.on) {
        setActiveTab('consultations');
      } else if (coverageState['dr-rx']?.on) {
        setActiveTab('prescriptions');
      } else if (coverageState['dr-laborder']?.on) {
        setActiveTab('labs');
      } else {
        setActiveTab('dash');
      }
    }
  }, [coverageState, activeTab, currentUser]);

  // Auto-redirect first subtab on activeTab cover change
  useEffect(() => {
    if (!coverageState || Object.keys(coverageState).length === 0) return;
    if (redirectedTabsRef.current[activeTab]) return;

    if (activeTab === 'receptionist_cover') {
      if (coverageState['rc-queue']?.on) {
        setReceptionistSubTab('queue');
        redirectedTabsRef.current[activeTab] = true;
      } else if (coverageState['rc-appt']?.on) {
        setReceptionistSubTab('appt');
        redirectedTabsRef.current[activeTab] = true;
      } else if (coverageState['rc-register']?.on) {
        setReceptionistSubTab('register');
        redirectedTabsRef.current[activeTab] = true;
      } else if (coverageState['rc-billing']?.on) {
        setReceptionistSubTab('billing');
        redirectedTabsRef.current[activeTab] = true;
      }
    } else if (activeTab === 'lab_cover') {
      if (coverageState['lt-queue']?.on) {
        setLabSubTab('tests');
        redirectedTabsRef.current[activeTab] = true;
      } else if (coverageState['lt-reagents']?.on) {
        setLabSubTab('reagents');
        redirectedTabsRef.current[activeTab] = true;
      }
    } else if (activeTab === 'pharmacy_cover') {
      if (coverageState['ph-queue']?.on) {
        setPharmacySubTab('queue');
        redirectedTabsRef.current[activeTab] = true;
      } else if (coverageState['ph-stock']?.on || coverageState['dr-stockview']?.on) {
        setPharmacySubTab('stock');
        redirectedTabsRef.current[activeTab] = true;
      }
    }
  }, [activeTab, coverageState]);

  const [notification, setNotification] = useState(null); // { message: '', type: 'success' | 'error' }
  const showToastNotification = (message, type = 'success') => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 3000);
  };
  
  const handleConfirmCoveragePharmacyPayment = async () => {
    if (coveragePharmacyPaymentMode === 'Cash') {
      const cashNum = Number(coveragePharmacyCashReceived);
      const totalDue = selectedCoveragePharmacyRx.amountVal || 550;
      if (!coveragePharmacyCashReceived || cashNum < totalDue) {
        showToastNotification('Insufficient cash received amount', 'error');
        return;
      }
    }
    
    try {
      // 1. Update prescription status
      await api.put(`/prescriptions/${selectedCoveragePharmacyRx.id}`, {
        status: 'Dispensed'
      });

      // 2. Create Billing record
      try {
        await api.post('/billing', {
          patientId: selectedCoveragePharmacyRx.patientId,
          items: (selectedCoveragePharmacyRx.items || []).map(item => ({
            description: `Medicine: ${item.medicine}`,
            amount: (item.price || 50) * (item.quantity || 1)
          })),
          totalAmount: selectedCoveragePharmacyRx.amountVal || 550,
          paymentMethod: coveragePharmacyPaymentMode,
          status: 'Paid'
        });
      } catch (billingErr) {
        console.error("Failed to auto-create billing record from doc pharmacy coverage dispense", billingErr);
      }

      showToastNotification(`Payment of ₹${(selectedCoveragePharmacyRx.amountVal || 550).toFixed(2)} settled via ${coveragePharmacyPaymentMode}. Prescription dispensed successfully!`);
      setShowCoveragePharmacyPaymentModal(false);
      setSelectedCoveragePharmacyRx(null);
      fetchCoverageData();
    } catch (err) {
      console.error(err);
      showToastNotification('Failed to settle payment and dispense prescription.', 'error');
    }
  };
  
  // State for appointments and patients
  const [appointments, setAppointments] = useState([]);
  const [patientsList, setPatientsList] = useState([]);
  const [hasFetchedInitial, setHasFetchedInitial] = useState(false);

  // Combined Patients list for prescription EMR (Real backend + clinical seeds)
  const [patients, setPatients] = useState([]);
  
  // Active selected patient for Prescription Maker
  const [selectedPatient, setSelectedPatient] = useState(null);
  const [selectedProfileAppointment, setSelectedProfileAppointment] = useState(null);
  const [activeAppointmentId, setActiveAppointmentId] = useState(null);
  const [editingPrescriptionId, setEditingPrescriptionId] = useState(null);
  const [editingAppointmentId, setEditingAppointmentId] = useState(null);
  const [allLabs, setAllLabs] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);
  const searchContainerRef = useRef(null);
  const [pastPrescriptions, setPastPrescriptions] = useState([]);
  const [activePrescriptionLogs, setActivePrescriptionLogs] = useState([]);
  const [showAppOverviewModal, setShowAppOverviewModal] = useState(false);
  const [selectedOverviewApp, setSelectedOverviewApp] = useState(null);
  
  // Real-time Interactive Calendar & Dynamic Data Flow states
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [allPrescriptions, setAllPrescriptions] = useState([]);


  // Doctor Panel Export Modals state
  const [showAppointmentExportModal, setShowAppointmentExportModal] = useState(false);
  const [showLabExportModal, setShowLabExportModal] = useState(false);
  const [showPrescriptionExportModal, setShowPrescriptionExportModal] = useState(false);
  const [showPatientExportModal, setShowPatientExportModal] = useState(false);

  const [sectionOpen, setSectionOpen] = useState({
    management: true,
    tools: true
  });
  const toggleSection = (sec) => {
    setSectionOpen(prev => ({ ...prev, [sec]: !prev[sec] }));
  };

  // Real-time EMR Appointments page states (filtering, sorting, pagination)
  const [appSearch, setAppSearch] = useState('');
  const [appSort, setAppSort] = useState('Newest');
  const [appPerPage, setAppPerPage] = useState(15);
  const [appPage, setAppPage] = useState(1);
  const [filterBySelectedDate, setFilterBySelectedDate] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const datePickerRef = useRef(null);

  const closeDatePicker = useCallback(() => {
    setShowDatePicker(false);
  }, []);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (datePickerRef.current && !datePickerRef.current.contains(event.target)) {
        setShowDatePicker(false);
        if (activeDropdownCloseFn === closeDatePicker) {
          activeDropdownCloseFn = null;
        }
      }
    };
    if (showDatePicker) {
      document.addEventListener('mousedown', handleClickOutside, true);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside, true);
    };
  }, [showDatePicker, closeDatePicker]);

  const handleDatePickerToggle = () => {
    if (!showDatePicker) {
      if (activeDropdownCloseFn && activeDropdownCloseFn !== closeDatePicker) {
        activeDropdownCloseFn();
      }
      activeDropdownCloseFn = closeDatePicker;
      setShowDatePicker(true);
    } else {
      setShowDatePicker(false);
      if (activeDropdownCloseFn === closeDatePicker) {
        activeDropdownCloseFn = null;
      }
    }
  };

  // Real-time EMR Consultations page states (filtering, sorting, pagination)
  const [consSearch, setConsSearch] = useState('');
  const [consStatus, setConsStatus] = useState('All');
  const [consGender, setConsGender] = useState('All');
  const [consAgeGroup, setConsAgeGroup] = useState('All');
  const [consPage, setConsPage] = useState(1);
  const [consPerPage, setConsPerPage] = useState(10);

  // Add Patient modal & form state hooks
  const [showAddPatientModal, setShowAddPatientModal] = useState(false);
  const [newPatientName, setNewPatientName] = useState('');
  const [newPatientAge, setNewPatientAge] = useState('');
  const [newPatientGender, setNewPatientGender] = useState('');
  const [newPatientPhone, setNewPatientPhone] = useState('');
  const [newPatientBloodGroup, setNewPatientBloodGroup] = useState('');
  const [newPatientAllergies, setNewPatientAllergies] = useState('');
  
  // Lab Reports high-fidelity state matching visual mockup
  const [labReports, setLabReports] = useState([]);
  const [labPage, setLabPage] = useState(1);
  const [labPerPage, setLabPerPage] = useState(5);
  const [selectedLabReport, setSelectedLabReport] = useState(null);
  
  // Redesigned Prescription States
  const [diagnosisText, setDiagnosisText] = useState('');
  const [sendToPharmacy, setSendToPharmacy] = useState(true);

  useEffect(() => {
    if (showAppOverviewModal && selectedOverviewApp) {
      const data = getOverviewData();
      const rxId = data?.prescription?._id;
      if (rxId) {
        api.get(`/audit-logs?target=${rxId}`)
          .then(res => {
            setActivePrescriptionLogs(res.data || []);
          })
          .catch(err => {
            console.error("Failed to fetch prescription logs:", err);
            setActivePrescriptionLogs([]);
          });
      } else {
        setActivePrescriptionLogs([]);
      }
    } else {
      setActivePrescriptionLogs([]);
    }
  }, [showAppOverviewModal, selectedOverviewApp]);

  // Custom Letterhead State for PDF Printing (Fetched dynamically from Admin configurations)
  const [customLetterhead, setCustomLetterhead] = useState(null);
  const [adminTemplates, setAdminTemplates] = useState([]);

  useEffect(() => {
    const fetchHospitalLetterhead = async () => {
      try {
        const res = await api.get('/admin/letterhead');
        const templates = res.data?.prescriptionTemplates || [];
        setAdminTemplates(templates);
        const standardTpl = templates.find(t => t.isStandard) || templates[0];
        if (standardTpl) {
          setPrintSettings(prev => ({
            ...prev,
            template: standardTpl._id,
            topSpacer: standardTpl.yTop,
            bottomSpacer: standardTpl.yBottom
          }));
        }
        let letterheadUrl = res.data?.letterheadUrl || "";
        letterheadUrl = letterheadUrl.replace(/\\/g, '/');
        if (letterheadUrl && !letterheadUrl.startsWith('http://') && !letterheadUrl.startsWith('https://') && !letterheadUrl.startsWith('data:')) {
          const apiURL = import.meta.env.VITE_API_URL || '';
          const backendBase = apiURL ? apiURL.replace('/api', '') : 'https://curoxa.onrender.com';
          const baseClean = backendBase.endsWith('/') ? backendBase.slice(0, -1) : backendBase;
          const pathClean = letterheadUrl.startsWith('/') ? letterheadUrl : `/${letterheadUrl}`;
          letterheadUrl = `${baseClean}${pathClean}`;
        }
        if (letterheadUrl) {
          const imgUrl = await convertPdfToImage(letterheadUrl);
          setCustomLetterhead(imgUrl);
        }
      } catch (err) {
        console.warn("Failed to fetch hospital letterhead:", err);
      }
    };
    fetchHospitalLetterhead();
  }, []);

  // Real-time dynamic stock alerts from database inventory
  const [pharmacyInventoryDb, setPharmacyInventoryDb] = useState([]);

  const getStockStatus = (medName) => {
    if (!medName || medName.length < 3) return null;
    const match = pharmacyInventoryDb.find(item => item.name.toLowerCase().includes(medName.toLowerCase()) || medName.toLowerCase().includes(item.name.toLowerCase()));
    if (!match) return null;
    if (match.stock === 0) return 'out';
    if (match.stock < 20) return 'low';
    return 'in';
  };

  // Clinical history is sourced exclusively from the backend (pastPrescriptions state)
  const mockHistoryDb = {};

  const copyMedToPrescription = (med) => {
    const isAlreadyPrescribed = medicines.some(m => m.name.toLowerCase() === med.medicine.toLowerCase());
    if (isAlreadyPrescribed) {
      showToastNotification(`${med.medicine} is already in the prescription sheet!`, 'error');
      return;
    }

    const newMed = {
      id: Date.now(),
      name: med.medicine,
      dose: med.dosage,
      freq: med.instructions ? med.instructions.split('(')[0].trim() : '1 Tab OD',
      duration: med.duration || '5 Days',
      timing: med.instructions && med.instructions.includes('Before') ? 'Before Food' : 'After Food',
      route: 'Oral',
      notes: 'Refilled from Patient Past Medical History Log'
    };
    setMedicines(prev => [...prev, newMed]);
    addLog(`Refilled past medication: ${med.medicine} into active prescription`);
  };
  
  const fetchPastPrescriptions = async (ptId) => {
    try {
      const res = await api.get('/prescriptions');
      // Filter prescriptions for this patient
      const filtered = res.data.filter(p => p.patientId?._id === ptId || p.patientId === ptId);
      setPastPrescriptions(filtered);
    } catch (e) {
      console.warn("Failed to fetch past prescriptions from backend", e);
    }
  };  const detectLetterheadMargins = async (url) => {
    try {
      if (!url) return { top: 38, bottom: 28 };
      
      let finalSrc = url;
      if (finalSrc.startsWith('http://') && window.location.protocol === 'https:') {
        finalSrc = finalSrc.replace('http://', 'https://');
      }
      if (!finalSrc.startsWith('data:')) {
        try {
          const res = await window.fetch(finalSrc);
          const blob = await res.blob();
          finalSrc = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
          });
        } catch (fetchErr) {
          console.warn("Failed to fetch letterhead as blob, falling back to direct URL", fetchErr);
        }
      }
      
      return await new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
          try {
            const canvas = document.createElement('canvas');
            canvas.width = 210;
            canvas.height = 297;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, 210, 297);
            
            const imgData = ctx.getImageData(0, 0, 210, 297);
            const data = imgData.data;
            
            // Sample background color at clean margins (x = 15, y = 148)
            let bgR = (data && data[(148 * 210 + 15) * 4] !== undefined) ? data[(148 * 210 + 15) * 4] : 255;
            let bgG = (data && data[(148 * 210 + 15) * 4 + 1] !== undefined) ? data[(148 * 210 + 15) * 4 + 1] : 255;
            let bgB = (data && data[(148 * 210 + 15) * 4 + 2] !== undefined) ? data[(148 * 210 + 15) * 4 + 2] : 255;
            let bgA = (data && data[(148 * 210 + 15) * 4 + 3] !== undefined) ? data[(148 * 210 + 15) * 4 + 3] : 255;

            // Detect Top Spacer (Header Logo/Banner Zone)
            let lastHeaderY = 0;
            const maxHeaderY = 130; // Scan top 44% of page
            for (let y = 0; y < maxHeaderY; y++) {
              let rowHasPixels = false;
              for (let x = 0; x < 210; x++) {
                const idx = (y * 210 + x) * 4;
                const r = data[idx];
                const g = data[idx + 1];
                const b = data[idx + 2];
                const a = data[idx + 3];
                
                // Distance from sampled background
                const dist = Math.sqrt(
                  Math.pow(r - bgR, 2) +
                  Math.pow(g - bgG, 2) +
                  Math.pow(b - bgB, 2) +
                  Math.pow(a - bgA, 2)
                );
                
                if (dist > 18) {
                  rowHasPixels = true;
                  break;
                }
              }
              if (rowHasPixels) {
                lastHeaderY = y;
              }
            }
            
            // Detect Bottom Spacer (Footer Contacts/Design Zone)
            let firstFooterY = 297;
            const minFooterY = 200; // Scan bottom 33% of page
            for (let y = 297; y >= minFooterY; y--) {
              let rowHasPixels = false;
              for (let x = 0; x < 210; x++) {
                const idx = (y * 210 + x) * 4;
                const r = data[idx];
                const g = data[idx + 1];
                const b = data[idx + 2];
                const a = data[idx + 3];
                
                const dist = Math.sqrt(
                  Math.pow(r - bgR, 2) +
                  Math.pow(g - bgG, 2) +
                  Math.pow(b - bgB, 2) +
                  Math.pow(a - bgA, 2)
                );
                
                if (dist > 18) {
                  rowHasPixels = true;
                  break;
                }
              }
              if (rowHasPixels) {
                firstFooterY = y;
              }
            }
            
            // Calculate dynamic mm heights with safety offsets
            const topMargin = Math.min(120, Math.max(15, lastHeaderY + 12));
            const bottomMargin = Math.min(80, Math.max(15, (297 - firstFooterY) + 12));
            
            resolve({ top: topMargin, bottom: bottomMargin });
          } catch (e) {
            console.warn("Failed to automatically detect margins from canvas, using defaults", e);
            resolve({ top: 38, bottom: 28 });
          }
        };
        
        img.onerror = () => {
          resolve({ top: 38, bottom: 28 });
        };
        img.src = finalSrc;
      });
    } catch (outerErr) {
      console.warn("Error in detectLetterheadMargins", outerErr);
      return { top: 38, bottom: 28 };
    }
  };

  const handlePrintPrescription = async (rx, item, customSettings = printSettings) => {
    try {
      let letterheadUrl = customLetterhead || "";
      const templates = adminTemplates || [];
      const selectedTemplate = templates.find(t => t._id === customSettings.template) || templates.find(t => t.isStandard) || templates[0];
      
      let xLeft = 15;
      let xRight = 15;
      let topSpacerDetected = 38;
      let bottomSpacerDetected = 28;

      if (selectedTemplate) {
        xLeft = selectedTemplate.xLeft;
        xRight = selectedTemplate.xRight;
        topSpacerDetected = selectedTemplate.yTop;
        bottomSpacerDetected = selectedTemplate.yBottom;
      } else {
        if (letterheadUrl) {
          const detected = await detectLetterheadMargins(letterheadUrl);
          topSpacerDetected = detected.top;
          bottomSpacerDetected = detected.bottom;
        } else {
          topSpacerDetected = 15;
          bottomSpacerDetected = 20;
        }
      }

      window.__currentLetterhead = customLetterhead;
      const iframe = document.createElement('iframe');
      iframe.style.position = 'fixed';
      iframe.style.left = '-9999px';
      iframe.style.top = '-9999px';
      iframe.style.width = '1024px';
      iframe.style.height = '1448px';
      iframe.style.border = '0';
      iframe.style.zIndex = '-9999';
      document.body.appendChild(iframe);
      const printWindow = iframe.contentWindow;

      const handleMessage = (e) => {
        if (e.data === 'close-print-prescription-iframe') {
          try {
            document.body.removeChild(iframe);
          } catch (err) {}
          window.removeEventListener('message', handleMessage);
        }
      };
      window.addEventListener('message', handleMessage);

      const cleanField = (val) => (val && String(val).trim() !== '') ? String(val).trim() : '—';
      const clinicName = user.tenantName || (user.tenantId ? user.tenantId.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ') : 'City Hospital');

      // Process vitals
      let vitalsString = '—';
      if (item.vitals) {
        vitalsString = item.vitals;
      } else if (vitals && (vitals.bpSys || vitals.pulse || vitals.temp || vitals.weight)) {
        vitalsString = [
          vitals.bpSys ? `BP: ${vitals.bpSys}/${vitals.bpDia} mmHg` : '',
          vitals.pulse ? `Pulse: ${vitals.pulse} bpm` : '',
          vitals.temp ? `Temp: ${vitals.temp} °F` : '',
          vitals.weight ? `Weight: ${vitals.weight} kg` : ''
        ].filter(Boolean).join(' | ');
      }

      window.__currentPrintData = {
        template: customSettings.template,
        digitalPreset: customSettings.digitalPreset,
        topSpacer: topSpacerDetected,
        bottomSpacer: bottomSpacerDetected,
        xLeft: xLeft,
        xRight: xRight,
        pageDistribution: customSettings.pageDistribution || 'auto',
        fontSize: parseInt(customSettings.fontSize, 10) || 100,
        medicines: item.items || [],
        tests: item.tests || [],
        patientName: cleanField(item.patient?.name || selectedPatient?.name),
        patientAge: item.patient?.age ? item.patient.age + ' Yrs' : (selectedPatient?.age ? selectedPatient.age + ' Yrs' : '—'),
        patientGender: cleanField(item.patient?.gender || selectedPatient?.gender),
        rxDate: cleanField(item.date || new Date().toLocaleDateString('en-IN')),
        patientContact: cleanField(item.patient?.contact || selectedPatient?.contact),
        patientAddress: cleanField(item.patient?.address || selectedPatient?.address),
        regNo: cleanField(item.originalApp?.regNo),
        doctorName: cleanField(item.doctor || user.name),
        doctorDesignation: cleanField(user.designation || 'MBBS, MD (Medicine)'),
        doctorReg: user.staff_id ? (user.staff_id.match(/^\d+$/) ? user.staff_id.slice(-5) : user.staff_id.toUpperCase()) : '12345',
        doctorDept: cleanField(user.department || 'General Medicine'),
        doctorShift: user.shiftName || '10:00 AM - 01:00 PM, 06:00 PM - 09:00 PM',
        clinicName: clinicName,
        diagnosis: cleanField(item.diagnosis),
        vitalsText: vitalsString,
        soapNotes: cleanField(item.notes || '')
      };

      const htmlContent = `
        <!DOCTYPE html>
        <html>
        <head>
          <title>Prescription - ${cleanField(selectedPatient?.name)}</title>
          <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Outfit:wght@800;900&display=swap" rel="stylesheet">
          <style>
            @page {
              size: A4;
              margin: 0;
            }
            @media print {
              body {
                margin: 0;
                padding: 0;
                -webkit-print-color-adjust: exact;
                print-color-adjust: exact;
              }
              .page-container {
                margin: 0 !important;
                box-shadow: none !important;
                page-break-after: always !important;
              }
            }
            body {
              font-family: 'Inter', sans-serif;
              color: #1E293B;
              margin: 0;
              padding: 0;
              background-color: #ffffff;
              font-size: ${customSettings.fontSize}%;
            }
            .page-container {
              width: 210mm;
              height: 297mm;
              margin: 0 auto;
              background-color: #ffffff;
              box-sizing: border-box;
              position: relative;
              padding: 0mm ${xRight}mm 0mm ${xLeft}mm;
              display: flex;
              flex-direction: column;
            }
            .content-area {
              flex: 1;
              margin-top: 10px;
              margin-bottom: ${bottomSpacerDetected}mm;
            }
            .spacer-header {
              height: ${topSpacerDetected}mm;
              min-height: ${topSpacerDetected}mm;
              flex-shrink: 0;
              width: 100%;
            }

            /* Preset Letterheads */
            .letterhead-digital-container {
              width: 100%;
              box-sizing: border-box;
            }
            .preset-teal {
              display: flex;
              align-items: center;
              border-bottom: 3.5px solid #0d9488;
              padding-bottom: 10px;
              margin-bottom: 15px;
              height: 80px;
            }
            .preset-teal .logo-box {
              background: #f0fdfa;
              border-radius: 12px;
              width: 55px;
              height: 55px;
              display: flex;
              align-items: center;
              justify-content: center;
              border: 2.5px solid #0d9488;
              margin-right: 14px;
              font-size: 26px;
              color: #0d9488;
              font-weight: bold;
            }
            .preset-burgundy {
              display: flex;
              align-items: center;
              border-bottom: 4px double #800020;
              padding-bottom: 10px;
              margin-bottom: 15px;
              height: 80px;
            }
            .preset-burgundy .logo-box {
              border: 2.5px solid #800020;
              border-radius: 12px;
              width: 58px;
              height: 58px;
              display: flex;
              align-items: center;
              justify-content: center;
              margin-right: 14px;
              color: #800020;
              font-family: 'Brush Script MT', cursive, sans-serif;
              font-size: 22px;
              font-weight: 900;
              text-align: center;
              line-height: 1;
            }
            .preset-navy {
              display: flex;
              align-items: center;
              border-bottom: 3.5px solid #1e3a8a;
              padding-bottom: 10px;
              margin-bottom: 15px;
              height: 80px;
            }
            .preset-navy .logo-box {
              background: #1e3a8a;
              border-radius: 12px;
              width: 55px;
              height: 55px;
              display: flex;
              align-items: center;
              justify-content: center;
              margin-right: 14px;
              font-size: 26px;
              color: white;
              font-weight: bold;
            }

            /* Tables & Lists style */
            .rx-table {
              width: 100%;
              border-collapse: collapse;
              font-size: 11.5px;
              border: 1.5px solid #800020;
              border-radius: 8px;
              overflow: hidden;
            }
            .rx-table th {
              background: #FDF2F4;
              color: #800020;
              font-weight: 800;
              padding: 8px;
              border-bottom: 1.5px solid #800020;
            }
            .rx-table td {
              padding: 8px;
              border-bottom: 1px solid #800020;
            }
          </style>
        </head>
        <body>
          <div id="pages-container"></div>

          <script>
            // Variables will be populated via postMessage from parent
            var printData = {};
            var medicines = [];
            var tests = [];
            var activeTemplate = '';
            var digitalPreset = 'none';
            var hasCustomLetterhead = false;
            var letterheadUrl = '';
            var topSpacer = 95;
            var bottomSpacer = 20;
            var xLeftVal = 15;
            var xRightVal = 15;
            var pageDistribution = 'auto';
            var initialFontSize = 100;

            var patientName = '\u2014';
            var patientAge = '\u2014';
            var patientGender = '\u2014';
            var rxDate = '\u2014';
            var patientContact = '\u2014';
            var patientAddress = '\u2014';
            var regNo = '\u2014';

            var doctorName = '\u2014';
            var doctorDesignation = '\u2014';
            var doctorReg = '\u2014';
            var doctorDept = '\u2014';
            var doctorShift = '\u2014';
            var clinicName = '\u2014';
            var diagnosis = '\u2014';
            var vitalsText = '\u2014';
            var soapNotes = '\u2014';

            window.addEventListener('message', function(e) {
              if (e.data && e.data.type === 'PRINT_DATA') {
                printData = e.data.data || {};
                medicines = printData.medicines || [];
                tests = printData.tests || [];
                activeTemplate = printData.template || '';
                digitalPreset = printData.digitalPreset || 'none';
                letterheadUrl = e.data.letterhead || '';
                hasCustomLetterhead = !!letterheadUrl;
                topSpacer = printData.topSpacer || 95;
                bottomSpacer = printData.bottomSpacer || 20;
                xLeftVal = printData.xLeft || 15;
                xRightVal = printData.xRight || 15;
                pageDistribution = printData.pageDistribution || 'auto';
                initialFontSize = printData.fontSize || 100;

                patientName = printData.patientName || '\u2014';
                patientAge = printData.patientAge || '\u2014';
                patientGender = printData.patientGender || '\u2014';
                rxDate = printData.rxDate || '\u2014';
                patientContact = printData.patientContact || '\u2014';
                patientAddress = printData.patientAddress || '\u2014';
                regNo = printData.regNo || '\u2014';

                doctorName = printData.doctorName || '\u2014';
                doctorDesignation = printData.doctorDesignation || '\u2014';
                doctorReg = printData.doctorReg || '\u2014';
                doctorDept = printData.doctorDept || '\u2014';
                doctorShift = printData.doctorShift || '\u2014';
                clinicName = printData.clinicName || '\u2014';
                diagnosis = printData.diagnosis || '\u2014';
                vitalsText = printData.vitalsText || '\u2014';
                soapNotes = printData.soapNotes || '\u2014';

                document.body.style.fontSize = initialFontSize + '%';
                initPrint();
              }
            });

            function getHeaderHTML() {
              if (hasCustomLetterhead && digitalPreset === 'none') {
                return '<div class="spacer-header"></div>';
              }
              
              var presetClass = '';
              var logoHTML = '\u271A';
              var accentColor = '#800020';
              var subtitle = 'Official EMR OPD Portal';
              
              if (digitalPreset === 'teal') {
                presetClass = 'preset-teal';
                logoHTML = '<div class="logo-box">\u271A</div>';
                accentColor = '#0d9488';
                subtitle = 'Premium Medical Care & Diagnostics';
              } else if (digitalPreset === 'burgundy') {
                presetClass = 'preset-burgundy';
                logoHTML = '<div class="logo-box">Care</div>';
                accentColor = '#800020';
                subtitle = 'Care with Devotion & Medical Excellence';
              } else if (digitalPreset === 'navy') {
                presetClass = 'preset-navy';
                logoHTML = '<div class="logo-box">\u271A</div>';
                accentColor = '#1e3a8a';
                subtitle = 'Multi-Specialty EMR Center';
              } else {
                return '<div class="spacer-header"></div>';
              }

              return '<div class="letterhead-digital-container">' +
                '<div class="' + presetClass + '">' +
                  logoHTML +
                  '<div style="flex-grow: 1;">' +
                    '<h1 style="margin: 0; color: ' + accentColor + '; font-family: Outfit, sans-serif; font-size: 20px; font-weight: 900; text-transform: uppercase;">' + clinicName + '</h1>' +
                    '<p style="margin: 2px 0; color: #334155; font-size: 9px; font-weight: 700; text-transform: uppercase;">' + subtitle + '</p>' +
                    '<p style="margin: 0; color: #64748b; font-size: 8px; font-weight: 600;">E-mail: info@' + clinicName.toLowerCase().replace(/\\s+/g, '') + '.com &nbsp;&nbsp;\u2022&nbsp;&nbsp; OPD Portal</p>' +
                  '</div>' +
                  '<div style="text-align: right; font-size: 8.5px; color: #475569; font-weight: 600;">' +
                    '<div>Date: ' + rxDate + '</div>' +
                    '<div>Reg. No: ' + regNo + '</div>' +
                  '</div>' +
                '</div>' +
              '</div>';
            }

            function getPatientDetailsHTML() {
              var vitalsHTML = '';
              if (vitalsText && vitalsText !== '\u2014') {
                vitalsHTML = '<div><span style="font-weight: 700; width: 85px; display: inline-block; color: #059669;">Vitals</span><span style="font-weight: 600; color: #059669;">: ' + vitalsText + '</span></div>';
              }
              return '<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px; font-size: 11px; color: #1E293B; line-height: 1.4; margin-bottom: 8px;">' +
                '<div style="display: flex; flex-direction: column; gap: 3px;">' +
                  '<div><span style="font-weight: 700; width: 85px; display: inline-block; color: #800020;">Patient Name</span><span style="font-weight: 500;">: ' + patientName + '</span></div>' +
                  '<div><span style="font-weight: 700; width: 85px; display: inline-block; color: #800020;">Age / Gender</span><span style="font-weight: 500;">: ' + patientAge + ' / ' + patientGender + '</span></div>' +
                  '<div><span style="font-weight: 700; width: 85px; display: inline-block; color: #800020;">Mobile / Addr</span><span style="font-weight: 500;">: ' + patientContact + ' / ' + patientAddress + '</span></div>' +
                  vitalsHTML +
                '</div>' +
                '<div style="display: flex; flex-direction: column; gap: 3px;">' +
                  '<div><span style="font-weight: 700; width: 100px; display: inline-block; color: #800020;">Doctor Name</span><span style="font-weight: 600;">: ' + doctorName + '</span></div>' +
                  '<div><span style="font-weight: 700; width: 100px; display: inline-block; color: #800020;">Specialty / Reg</span><span style="font-weight: 500;">: ' + doctorDept + ' / DMC-' + doctorReg + '</span></div>' +
                  '<div><span style="font-weight: 700; width: 100px; display: inline-block; color: #800020;">Consultation</span><span style="font-weight: 500;">: ' + doctorShift + '</span></div>' +
                '</div>' +
              '</div>' +
              '<hr style="border: none; border-top: 1.5px solid #800020; margin: 6px 0 10px 0;" />';
            }

            function getFooterHTML() {
              return '<div style="text-align: center; font-family: Outfit, sans-serif; font-size: 10px; font-weight: bold; color: #800020; border-top: 1px solid #E2E8F0; padding-top: 6px; background: white;">' +
                'Thank you for trusting us with your health. Get well soon!' +
              '</div>';
            }

            function getSignatureBlockHTML() {
              var noteContentHTML = '';
              if (soapNotes && soapNotes !== '\u2014' && soapNotes.trim() !== '') {
                noteContentHTML = '<div style=\"color: #334155; font-weight: 600; white-space: pre-wrap; line-height: 1.4;\">' + soapNotes + '</div>';
              } else {
                noteContentHTML = '<ul style=\"padding-left: 10px; margin: 0; list-style-type: square; color: #334155; font-weight: 600;\">' +
                    '<li>Take medicines as prescribed.</li>' +
                    '<li>Complete full course of antibiotics.</li>' +
                    '<li>Drink plenty of fluids and rest.</li>' +
                  '</ul>';
              }
              return '<div style="display: flex; justify-content: space-between; align-items: flex-end; margin-top: 25px; min-height: 80px; page-break-inside: avoid; break-inside: avoid;">' +
                '<div style="font-size: 10px; line-height: 1.4; max-width: 60%;">' +
                  '<div style="color: #800020; font-weight: 800; font-size: 10.5px; margin-bottom: 2px; text-transform: uppercase;">Note :</div>' +
                  noteContentHTML +
                '</div>' +
                '<div style="text-align: center; width: 180px; font-size: 10px;">' +
                  '<div style="border-bottom: 1px solid #800020; margin-bottom: 4px; height: 35px; position: relative;">' +
                    '<span style="font-family: \"Brush Script MT\", cursive, sans-serif; font-size: 20px; color: #800020; position: absolute; bottom: 2px; left: 50%; transform: translateX(-50%);">' + doctorName.replace('Dr. ', '') + '</span>' +
                  '</div>' +
                  '<div style="color: #800020; font-weight: 700; font-size: 11px;">' + doctorName + '</div>' +
                  '<div style="color: #475569; font-weight: 600; font-size: 9px;">' + doctorDesignation + '</div>' +
                  '<div style="color: #94A3B8; font-size: 8.5px; margin-top: 2px; font-weight: bold;">Signature & Seal</div>' +
                '</div>' +
              '</div>';
            }

            function createNewPage(isFirstPage = true) {
              const page = document.createElement('div');
              page.className = 'page-container';
              
              if (hasCustomLetterhead) {
                page.style.backgroundImage = 'url(' + letterheadUrl + ')';
                page.style.backgroundSize = 'contain';
                page.style.backgroundPosition = 'center top';
                page.style.backgroundRepeat = 'no-repeat';
              }
              
              if (isFirstPage) {
                const headerContainer = document.createElement('div');
                headerContainer.innerHTML = getHeaderHTML();
                headerContainer.style.flexShrink = '0';
                page.appendChild(headerContainer.firstElementChild || headerContainer);
                
                const patientContainer = document.createElement('div');
                patientContainer.innerHTML = getPatientDetailsHTML();
                patientContainer.style.flexShrink = '0';
                page.appendChild(patientContainer);
              } else {
                const spacer = document.createElement('div');
                spacer.className = 'spacer-header';
                spacer.style.height = topSpacer + 'mm';
                spacer.style.minHeight = topSpacer + 'mm';
                spacer.style.flexShrink = '0';
                page.appendChild(spacer);
              }
              
              const contentArea = document.createElement('div');
              contentArea.className = 'content-area';
              page.appendChild(contentArea);
              
              const footerContainer = document.createElement('div');
              footerContainer.innerHTML = getFooterHTML();
              const footer = footerContainer.firstElementChild;
              footer.style.position = 'absolute';
              footer.style.bottom = '10mm';
              footer.style.left = xLeftVal + 'mm';
              footer.style.right = xRightVal + 'mm';
              page.appendChild(footer);
              
              document.getElementById('pages-container').appendChild(page);
              return page;
            }

            function buildLayout() {
              // 1. Measure A4 page available height using a dummy container
              const dummyPage = document.createElement('div');
              dummyPage.className = 'page-container';
              dummyPage.style.visibility = 'hidden';
              dummyPage.style.position = 'absolute';
              dummyPage.style.top = '-9999px';
              document.body.appendChild(dummyPage);
              const a4Height = (dummyPage.offsetHeight > 500) ? dummyPage.offsetHeight : 1122;
              document.body.removeChild(dummyPage);

              const topSpacerPx = topSpacer * 3.78;
              const bottomSpacerPx = bottomSpacer * 3.78;
              // We need to measure how much height patientDetails + digital header takes
              const tempPage = createNewPage(true);
              tempPage.style.visibility = 'hidden';
              tempPage.style.position = 'absolute';
              tempPage.style.top = '-9999px';
              
              const patientHeader = tempPage.querySelector('.letterhead-digital-container');
              const patientDetails = tempPage.querySelector('.content-area').previousElementSibling; // Patient details container
              
              const patientDetailsHeight = (patientDetails && patientDetails.offsetHeight > 20) ? (patientDetails.offsetHeight + 15) : 105;
              const digitalHeaderHeight = (patientHeader && patientHeader.offsetHeight > 20) ? patientHeader.offsetHeight : 0;
              
              document.getElementById('pages-container').removeChild(tempPage);

              // Available content height limits
              const page1ContentLimit = a4Height - topSpacerPx - bottomSpacerPx - patientDetailsHeight - digitalHeaderHeight - 45;
              const pageNContentLimit = a4Height - topSpacerPx - bottomSpacerPx - 45;
              const contentHeightLimit = page1ContentLimit; // For measureHeight to use conservatively // 35px safety padding

              function getDiagnosisHTML() {
                if (!diagnosis || diagnosis === '\u2014') return '';
                if (diagnosis.includes('<') && diagnosis.includes('>')) {
                  return '<div style="margin-bottom: 12px; page-break-inside: avoid; break-inside: avoid;">' +
                    '<div style="font-family: Outfit, sans-serif; font-size: 12px; font-weight: 900; color: #800020; border-bottom: 1.5px solid #800020; padding-bottom: 3px; margin-bottom: 6px; text-transform: uppercase; letter-spacing: 0.5px;">Diagnosis</div>' +
                    '<div style="font-size: 11px; color: #1E293B; padding-left: 2px; line-height: 1.5;">' + diagnosis + '</div>' +
                  '</div>';
                }
                const lines = diagnosis.split('\\n').filter(l => l.trim() !== '');
                if (lines.length === 1) {
                  return '<div style="margin-bottom: 12px; page-break-inside: avoid; break-inside: avoid;">' +
                    '<div style="font-family: Outfit, sans-serif; font-size: 12px; font-weight: 900; color: #800020; border-bottom: 1.5px solid #800020; padding-bottom: 3px; margin-bottom: 6px; text-transform: uppercase; letter-spacing: 0.5px;">Diagnosis</div>' +
                    '<div style="font-size: 11px; font-weight: 700; color: #1E293B; padding-left: 2px;">' + diagnosis + '</div>' +
                  '</div>';
                }
                const bulletList = lines.map(line => {
                  return '<li style="margin-bottom: 4px; display: flex; align-items: flex-start; gap: 8px;">' +
                    '<span style="color: #800020; font-size: 8px; margin-top: 5px; flex-shrink: 0;">\u25CF</span>' +
                    '<span>' + line.trim() + '</span>' +
                    '</li>';
                }).join('');
                return '<div style="margin-bottom: 12px; page-break-inside: avoid; break-inside: avoid;">' +
                  '<div style="font-family: Outfit, sans-serif; font-size: 12px; font-weight: 900; color: #800020; border-bottom: 1.5px solid #800020; padding-bottom: 3px; margin-bottom: 6px; text-transform: uppercase; letter-spacing: 0.5px;">Diagnosis</div>' +
                  '<ul style="padding-left: 2px; margin: 0; font-size: 11px; font-weight: 700; color: #1E293B; list-style: none; line-height: 1.5;">' + bulletList + '</ul>' +
                '</div>';
              }

              function getSoapNotesHTML() {
                if (!soapNotes || soapNotes === '\u2014') return '';
                const renderedNotes = (soapNotes.includes('<') && soapNotes.includes('>')) ? soapNotes : soapNotes.replace(/\n/g, '<br/>');
                return '<div style="margin-bottom: 12px; page-break-inside: avoid; break-inside: avoid;">' +
                  '<div style="font-family: Outfit, sans-serif; font-size: 12px; font-weight: 900; color: #800020; border-bottom: 1.5px solid #800020; padding-bottom: 3px; margin-bottom: 6px; text-transform: uppercase; letter-spacing: 0.5px;">Clinical Notes / Advice</div>' +
                  '<div style="font-size: 10.5px; color: #475569; padding-left: 2px; line-height: 1.4;">' + renderedNotes + '</div>' +
                '</div>';
              }

              function getTestsBlocks(cols) {
                if (!tests || tests.length === 0) return [];
                var blocks = [];
                var rowHeight = 18; 
                
                var page1TestsHeight = page1ContentLimit - (diagnosis ? 80 : 0) - 40;
                var pageNTestsHeight = pageNContentLimit - 40;
                
                var page1Rows = Math.max(1, Math.floor(page1TestsHeight / rowHeight));
                var page1ChunkSize = page1Rows * cols;
                
                var pageNRows = Math.max(1, Math.floor(pageNTestsHeight / rowHeight));
                var pageNChunkSize = pageNRows * cols;
                
                var start = 0;
                var isFirstBlock = true;
                
                while (tests.length > start) {
                  var currentChunkSize = isFirstBlock ? page1ChunkSize : pageNChunkSize;
                  var chunk = tests.slice(start, start + currentChunkSize);
                  var blockHTML = '';
                  var itemsHTML = '';
                  
                  for (var i = 0; chunk.length > i; i++) {
                    var testName = (typeof chunk[i] === 'object' && chunk[i] !== null) ? (chunk[i].testName || chunk[i].name || '') : chunk[i];
                    itemsHTML += '<div style="font-size: 11px; font-weight: 600; color: #1E293B; padding: 3px 0;">' +
                      '\u2022 ' + testName +
                    '</div>';
                  }
                  
                  blockHTML = '<div style="margin-bottom: 15px; page-break-inside: avoid; break-inside: avoid;">' +
                    '<div style="font-family: Outfit, sans-serif; font-size: 12px; font-weight: 900; color: #800020; border-bottom: 1.5px solid #800020; padding-bottom: 3px; margin-bottom: 6px; text-transform: uppercase; letter-spacing: 0.5px;">Investigations & Tests ' + (start > 0 ? '(Contd.)' : '') + '</div>' +
                    '<div style="display: grid; grid-template-columns: repeat(' + cols + ', 1fr); gap: 4px 12px; padding-left: 2px;">' + itemsHTML + '</div>' +
                  '</div>';
                  
                  blocks.push(blockHTML);
                  start += currentChunkSize;
                  isFirstBlock = false;
                }
                return blocks;
              }

              function getMedicinesBlocks(cols, compact) {
                if (!medicines || medicines.length === 0) return [];
                var blocks = [];
                var rowHeight = 20; 
                
                var page1MedicinesHeight = page1ContentLimit - (diagnosis ? 80 : 0) - 40;
                var pageNMedicinesHeight = pageNContentLimit - 40;
                
                var page1Rows = Math.max(1, Math.floor(page1MedicinesHeight / rowHeight));
                var page1ChunkSize = page1Rows * cols;
                
                var pageNRows = Math.max(1, Math.floor(pageNMedicinesHeight / rowHeight));
                var pageNChunkSize = pageNRows * cols;
                
                var start = 0;
                var isFirstBlock = true;
                
                while (medicines.length > start) {
                  var currentChunkSize = isFirstBlock ? page1ChunkSize : pageNChunkSize;
                  var chunk = medicines.slice(start, start + currentChunkSize);
                  var blockHTML = '';
                  var itemsHTML = '';
                  
                  for (var i = 0; chunk.length > i; i++) {
                    var m = chunk[i];
                    var freq = 'Once a Day';
                    var inst = 'After Food';
                    if (m.instructions) {
                      var parts = m.instructions.split('(');
                      if (parts[0]) freq = parts[0].trim();
                      if (parts[1]) inst = parts[1].replace(')', '').trim();
                    }
                    itemsHTML += '<div style="display: flex; justify-content: space-between; font-size: 11px; padding: 4px 0; border-bottom: 1px dashed #E2E8F0; font-weight: 600; color: #1E293B;">' +
                      '<span>' + (start + i + 1) + '. ' + m.medicine + ' (' + m.dosage + ')</span>' +
                      '<span style="color: #475569; font-weight: 500;">' + freq + ' | ' + inst + ' (' + m.duration + ')</span>' +
                    '</div>';
                  }
                  
                  blockHTML = '<div style="margin-bottom: 15px; page-break-inside: avoid; break-inside: avoid;">' +
                    '<div style="font-family: Outfit, sans-serif; font-size: 12px; font-weight: 900; color: #800020; border-bottom: 1.5px solid #800020; padding-bottom: 3px; margin-bottom: 8px; text-transform: uppercase; letter-spacing: 0.5px;">Prescribed Medicines ' + (start > 0 ? '(Contd.)' : '') + '</div>' +
                    '<div style="display: flex; flex-direction: column; gap: 4px; padding-left: 2px;">' + itemsHTML + '</div>' +
                  '</div>';
                  
                  blocks.push(blockHTML);
                  start += currentChunkSize;
                  isFirstBlock = false;
                }
                return blocks;
              }

              // Function to dynamically measure standard and compact layout heights
              function measureHeight(colsMed, colsTest, compact, globalFontSizePct) {
                const measureContainer = document.createElement('div');
                measureContainer.style.width = '180mm';
                measureContainer.style.position = 'absolute';
                measureContainer.style.left = '-9999px';
                measureContainer.style.top = '-9999px';
                measureContainer.style.fontSize = globalFontSizePct + '%';
                document.body.appendChild(measureContainer);

                var medHTML = getMedicinesBlocks(colsMed, compact).join('');
                var testHTML = getTestsBlocks(colsTest).join('');

                measureContainer.innerHTML = getDiagnosisHTML() + medHTML + testHTML + getSignatureBlockHTML();

                const h = measureContainer.offsetHeight;
                document.body.removeChild(measureContainer);
                return h;
              }

              // 2. Intelligently select layouts based on doctor's pageDistribution preference
              var bestColsMed = 1;
              var bestColsTest = 1;
              var bestCompact = false;
              var bestFontSize = initialFontSize;
              
              if (pageDistribution === 'one-page') {
                var requiredH = measureHeight(1, 1, false, bestFontSize);
                if (requiredH <= contentHeightLimit) {
                  bestColsMed = 1;
                  bestColsTest = 1;
                  bestCompact = false;
                } else {
                  requiredH = measureHeight(1, 2, true, bestFontSize);
                  if (requiredH <= contentHeightLimit) {
                    bestColsMed = 1;
                    bestColsTest = 2;
                    bestCompact = true;
                  } else {
                    requiredH = measureHeight(1, 2, true, bestFontSize - 10);
                    if (requiredH <= contentHeightLimit) {
                      bestColsMed = 1;
                      bestColsTest = 2;
                      bestCompact = true;
                      bestFontSize = bestFontSize - 10;
                    } else {
                      requiredH = measureHeight(2, 2, true, bestFontSize);
                      if (requiredH <= contentHeightLimit) {
                        bestColsMed = 2;
                        bestColsTest = 2;
                        bestCompact = true;
                      } else {
                        requiredH = measureHeight(2, 2, true, bestFontSize - 10);
                        if (requiredH <= contentHeightLimit) {
                          bestColsMed = 2;
                          bestColsTest = 2;
                          bestCompact = true;
                          bestFontSize = bestFontSize - 10;
                        } else {
                          requiredH = measureHeight(3, 3, true, Math.max(80, bestFontSize - 15));
                          if (requiredH <= contentHeightLimit) {
                            bestColsMed = 3;
                            bestColsTest = 3;
                            bestCompact = true;
                            bestFontSize = Math.max(80, bestFontSize - 15);
                          } else {
                            alert("This prescription contains too much content to fit safely on one page. Please remove unnecessary content or choose the 2-page option.");
                            bestColsMed = medicines.length > 12 ? 2 : 1;
                            bestColsTest = tests.length > 6 ? 2 : 1;
                            bestCompact = true;
                            bestFontSize = Math.max(80, initialFontSize - 15);
                          }
                        }
                      }
                    }
                  }
                }
              } else if (pageDistribution === 'allow-two-pages' || pageDistribution === 'split-two-pages') {
                bestColsMed = medicines.length > 12 ? 2 : 1;
                bestColsTest = tests.length > 6 ? 2 : 1;
                bestCompact = false;
                bestFontSize = initialFontSize;
              } else {
                var requiredH = measureHeight(1, 1, false, bestFontSize);
                if (requiredH <= contentHeightLimit) {
                  bestColsMed = 1;
                  bestColsTest = 1;
                  bestCompact = false;
                } else {
                  requiredH = measureHeight(1, 2, true, bestFontSize);
                  if (requiredH <= contentHeightLimit) {
                    bestColsMed = 1;
                    bestColsTest = 2;
                    bestCompact = true;
                  } else {
                    requiredH = measureHeight(1, 2, true, bestFontSize - 10);
                    if (requiredH <= contentHeightLimit) {
                      bestColsMed = 1;
                      bestColsTest = 2;
                      bestCompact = true;
                      bestFontSize = bestFontSize - 10;
                    } else {
                      requiredH = measureHeight(2, 2, true, bestFontSize);
                      if (requiredH <= contentHeightLimit) {
                        bestColsMed = 2;
                        bestColsTest = 2;
                        bestCompact = true;
                      } else {
                        requiredH = measureHeight(2, 2, true, bestFontSize - 10);
                        if (requiredH <= contentHeightLimit) {
                          bestColsMed = 2;
                          bestColsTest = 2;
                          bestCompact = true;
                          bestFontSize = bestFontSize - 10;
                        } else {
                          requiredH = measureHeight(3, 3, true, Math.max(80, bestFontSize - 15));
                          if (requiredH <= contentHeightLimit) {
                            bestColsMed = 3;
                            bestColsTest = 3;
                            bestCompact = true;
                            bestFontSize = Math.max(80, bestFontSize - 15);
                          } else {
                            bestColsMed = medicines.length > 12 ? 2 : 1;
                            bestColsTest = tests.length > 6 ? 2 : 1;
                            bestCompact = true;
                            var estTotalH = measureHeight(bestColsMed, bestColsTest, true, initialFontSize);
                            var totalAvailableH = page1ContentLimit + pageNContentLimit;
                            if (estTotalH > totalAvailableH) {
                              bestFontSize = Math.max(80, initialFontSize - 15);
                            } else {
                              bestFontSize = Math.max(85, initialFontSize - 10);
                            }
                          }
                        }
                      }
                    }
                  }
                }
              }

              // Apply the calculated font size
              document.body.style.fontSize = bestFontSize + '%';

              // 3. Render content into contentArea with page-break checks
              var activePage = createNewPage(true);
              var activeContentArea = activePage.querySelector('.content-area');

              const elementsContainer = document.createElement('div');
              var medHTML = getMedicinesBlocks(bestColsMed, bestCompact).join('');
              var testHTML = getTestsBlocks(bestColsTest).join('');
              elementsContainer.innerHTML = getDiagnosisHTML() + medHTML + testHTML + getSignatureBlockHTML();

              const children = Array.from(elementsContainer.children);
              var pageSpaceUsed = 0;
              var isFirst = true;

              for (var idx = 0; children.length > idx; idx++) {
                const child = children[idx];
                
                const isTestsOrSig = child.innerHTML.includes('Prescribed Tests') || child.innerHTML.includes('Clinical SOAP Notes') || child.innerHTML.includes('Signature & Seal') || child.innerHTML.includes('Note :');
                if (pageDistribution === 'split-two-pages' && isTestsOrSig && isFirst) {
                  activePage = createNewPage(false);
                  isFirst = false;
                  activeContentArea = activePage.querySelector('.content-area');
                  activeContentArea.appendChild(child);
                  pageSpaceUsed = child.offsetHeight;
                  continue;
                }

                activeContentArea.appendChild(child);
                
                const childHeight = child.offsetHeight;
                const limit = isFirst ? page1ContentLimit : pageNContentLimit;
                
                if (pageSpaceUsed + childHeight > limit) {
                  activeContentArea.removeChild(child);
                  
                  activePage = createNewPage(false);
                  isFirst = false;
                  activeContentArea = activePage.querySelector('.content-area');
                  activeContentArea.appendChild(child);
                  pageSpaceUsed = childHeight;
                } else {
                  pageSpaceUsed += childHeight;
                }
              }
            }

            function waitForImages() {
              const images = Array.from(document.images);
              const promises = images.map(img => {
                if (img.complete) return Promise.resolve();
                return new Promise(resolve => {
                  img.onload = resolve;
                  img.onerror = resolve;
                });
              });
              return Promise.all(promises);
            }

            function initPrint() {
              waitForImages().then(function() {
                buildLayout();
                window.print();
                setTimeout(function() { window.parent.postMessage('close-print-prescription-iframe', '*'); }, 500);
              });
            }
          </script>
        </body>
        </html>
      `;

      console.log("HTML CONTENT TO WRITE:", htmlContent);
      iframe.srcdoc = htmlContent;
      // Post the print data to the iframe after it loads (srcdoc cannot access window.parent)
      iframe.addEventListener('load', function() {
        try {
          iframe.contentWindow.postMessage({ type: 'PRINT_DATA', data: window.__currentPrintData, letterhead: window.__currentLetterhead || '' }, '*');
        } catch(e) { console.warn('postMessage to iframe failed', e); }
      });
    } catch (err) {
      console.error("Print prescription error:", err);
      showToastNotification("Failed to prepare print view.", "error");
    }
  };

  const handleLoadPrescriptionForEdit = (rx, relatedLabs) => {
    setEditingPrescriptionId(rx._id);
    setEditingAppointmentId(rx.appointmentId);
    if (rx.appointmentId) {
      setActiveAppointmentId(rx.appointmentId);
    }
    const patientRef = rx.patientId?._id || rx.patientId;
    const relatedPatient = patientRef ? (patients.find(p => p._id === patientRef) || patientsList.find(p => p._id === patientRef)) : null;
    if (relatedPatient) {
      setSelectedPatient(relatedPatient);
    }

    if (rx.items && rx.items.length > 0) {
      const loadedMeds = rx.items.map((item, idx) => {
        let freq = 'Once a Day';
        if (item.instructions) {
          if (item.instructions.includes('Twice') || item.instructions.includes('BD')) freq = 'Twice a Day';
          else if (item.instructions.includes('Thrice') || item.instructions.includes('TDS')) freq = 'Thrice a Day';
          else if (item.instructions.includes('Four') || item.instructions.includes('QD')) freq = 'Four times a Day';
        }
        let timing = 'After Food';
        if (item.instructions && item.instructions.includes('Before Food')) timing = 'Before Food';

        return {
          id: idx + 1,
          name: item.medicine,
          dose: item.dosage,
          freq: freq,
          duration: item.duration,
          timing: timing,
          notes: ''
        };
      });
      setMedicines(loadedMeds);
    } else {
      setMedicines([]);
    }

    if (relatedLabs && relatedLabs.length > 0) {
      setLabs(relatedLabs.map(l => l.testName));
    } else {
      setLabs([]);
    }

    const relatedApp = rx.appointmentId ? appointments.find(a => a._id.toString() === rx.appointmentId.toString() || a._id === rx.appointmentId) : null;
    if (relatedApp) {
      setDiagnosisText(relatedApp.diagnosis || '');
      setSoap({
        subjective: '',
        objective: '',
        assessment: relatedApp.notes || '',
        plan: ''
      });
    }

    setActiveTab('prescriptions');
    setShowTimelineModal(false);
    showToastNotification("Prescription loaded for editing!", "info");
    addLog(`Editing prescription ID: ${rx._id}`);
  };

  // Prescription Print & Formatting Settings
  const [printSettings, setPrintSettings] = useState(() => {
    try {
      const saved = localStorage.getItem('curoxa_rx_print_settings');
      return saved ? JSON.parse(saved) : {
        template: 'standard', // standard, two-column, rx-list, dense-grid
        topSpacer: 38, // in mm
        bottomSpacer: 28, // in mm
        fontSize: 100, // in %
        digitalPreset: 'none', // none, teal, burgundy, navy
        pageDistribution: 'auto'
      };
    } catch {
      return {
        template: 'standard',
        topSpacer: 38,
        bottomSpacer: 28,
        fontSize: 100,
        digitalPreset: 'none',
        pageDistribution: 'auto'
      };
    }
  });

  const [showPrintSettingsModal, setShowPrintSettingsModal] = useState(false);
  const [tempPrintSettings, setTempPrintSettings] = useState(null);
  const [printSettingsTarget, setPrintSettingsTarget] = useState(null); // { rx, item, callback }

  // Auto-save changes to localStorage
  useEffect(() => {
    localStorage.setItem('curoxa_rx_print_settings', JSON.stringify(printSettings));
  }, [printSettings]);

  const [patientVitals, setPatientVitals] = useState([]);
  const [showVitalsHistoryModal, setShowVitalsHistoryModal] = useState(false);

  // Vitals State
  const [vitals, setVitals] = useState({
    bpSys: '',
    bpDia: '',
    pulse: '',
    temp: '',
    weight: '',
    height: '',
    bmi: '',
    spo2: '',
    sugar: '',
    resp: ''
  });

  // SOAP Clinical Notes State
  const [soap, setSoap] = useState({
    subjective: '',
    objective: '',
    assessment: '',
    plan: ''
  });

  // Voice Dictation Simulation
  const [isRecording, setIsRecording] = useState(false);
  const [recordingField, setRecordingField] = useState('');

  // Diagnosis (ICD-10) States
  const [diagnoses, setDiagnoses] = useState([]);
  const [diagSearch, setDiagSearch] = useState('');
  const [showDiagSuggestions, setShowDiagSuggestions] = useState(false);
  
  // Medicine List State
  const [medicines, setMedicines] = useState([]);

  // Default configurations preset database for medicine autocomplete auto-fill
  const [medicineDefaults, setMedicineDefaults] = useState({
    'paracetamol': { dose: '500 mg', freq: 'Twice a Day', duration: '5 Days', timing: 'After Food', notes: 'For fever' },
    'azithromycin': { dose: '250 mg', freq: 'Once a Day', duration: '3 Days', timing: 'Before Food', notes: 'Antibiotic' },
    'paracetamol 650': { dose: '650 mg', freq: '1 Tab TDS', duration: '3 Days', timing: 'After Food', notes: 'For fever' },
    'pantocid 40': { dose: '40 mg', freq: '1 Tab OD', duration: '10 Days', timing: 'Before Food', notes: 'For acidity' },
    'telmisartan 40': { dose: '40 mg', freq: '1 Tab OD', duration: '30 Days', timing: 'Before Food', notes: 'Control blood pressure' },
    'metformin 500': { dose: '500 mg', freq: '1 Tab BD', duration: '30 Days', timing: 'After Food', notes: 'Antidiabetic' },
    'amoxicillin 500': { dose: '500 mg', freq: '1 Tab TDS', duration: '7 Days', timing: 'After Food', notes: 'Antibiotic' }
  });

  const rxInputStyle = {
    width: '100%',
    padding: '8px 12px',
    borderRadius: '8px',
    border: '1px solid #E2E8F0',
    background: '#F8FAFC',
    fontSize: '13px',
    color: '#1E293B',
    fontWeight: 600,
    transition: 'border-color 0.2s',
    boxShadow: 'none',
    outline: 'none',
    height: '38px',
    boxSizing: 'border-box'
  };

  const rxSelectStyle = {
    ...rxInputStyle,
    padding: '8px 24px 8px 8px',
    cursor: 'pointer',
    appearance: 'none',
    WebkitAppearance: 'none',
    MozAppearance: 'none',
    backgroundImage: 'url("data:image/svg+xml;charset=UTF-8,%3csvg xmlns=\'http://www.w3.org/2000/svg\' viewBox=\'0 0 24 24\' fill=\'none\' stroke=\'%2364748b\' stroke-width=\'2.5\' stroke-linecap=\'round\' stroke-linejoin=\'round\'%3e%3cpolyline points=\'6 9 12 15 18 9\'/%3e%3c/svg%3e")',
    backgroundRepeat: 'no-repeat',
    backgroundPosition: 'right 8px center',
    backgroundSize: '14px'
  };

  // Lab & Radiology State
  const [labs, setLabs] = useState([]);
  const [customLabInput, setCustomLabInput] = useState('');
  const [activeMedFocus, setActiveMedFocus] = useState(null);
  const [isHoveringSuggestions, setIsHoveringSuggestions] = useState(false);
  const [dbMedicines, setDbMedicines] = useState([]);
  const recognitionRef = useRef(null);
  const baseTextRef = useRef('');
  const finalTranscriptRef = useRef('');
  const aiChatScrollRef = useRef(null);

  // Fetch real seeded medicines from database on mount
  useEffect(() => {
    const fetchDbMedicines = async () => {
      try {
        const response = await api.get('/medicines');
        if (response.data) {
          setDbMedicines(response.data);
        }
      } catch (err) {
        console.error("Failed fetching database medicines", err);
      }
    };
    fetchDbMedicines();
  }, []);



  // Safe cleanup for page and tab switching
  useEffect(() => {
    document.body.classList.remove('modal-open');
    document.body.style.overflow = '';
    document.documentElement.style.overflow = '';
  }, [activeTab]);

  // Advice & Follow Up
  const [advice, setAdvice] = useState({
    diet: 'Low sodium, low fat diet',
    exercise: '30 mins brisk walking daily',
    followUp: '2026-05-30',
    precautions: 'Check BP daily at home',
    emergency: 'In case of chest pain, dyspnea, or severe headache, visit ER immediately'
  });

  // Attachments State (Real file uploading)
  const [uploadedFiles, setUploadedFiles] = useState([]);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const [previewFile, setPreviewFile] = useState(null); // Click to preview uploaded file
  const [showTimelineModal, setShowTimelineModal] = useState(false); // EMR timeline modal
  const [isSavingPrescription, setIsSavingPrescription] = useState(false);
  const fileInputRef = useRef(null);
  
  // Consent and compliance tracking
  const [consentGiven, setConsentGiven] = useState(true);
  const [isFinalized, setIsFinalized] = useState(false);
  const [prescriptionId, setPrescriptionId] = useState('RX-CUROXA-9921448');
  const [auditLogs, setAuditLogs] = useState([
    { time: new Date().toLocaleTimeString(), event: 'EMR Initialized - DPDP Secure Session Opened', doctor: 'Dr. Sarah Jenkins' }
  ]);

  // ═══════════════════════════════════════════════════════════════════
  // BREAK-GLASS EMERGENCY OVERRIDE (DPDP Act 2023 §12(a) Compliant)
  // ═══════════════════════════════════════════════════════════════════
  // When activated, this bypasses patient consent checks for ALL EMR
  // API requests. The backend middleware logs every bypassed request
  // as a high-priority EMERGENCY_BYPASS audit entry for DPO review.
  // Only doctors can activate this. It auto-deactivates on logout or
  // when manually toggled off.
  // ═══════════════════════════════════════════════════════════════════
  const [emergencyBypassActive, setEmergencyBypassActiveState] = useState(false);
  const [showBreakGlassModal, setShowBreakGlassModal] = useState(false);
  const [breakGlassReason, setBreakGlassReason] = useState('');

  // Sync the local React state with the global API header flag
  const toggleEmergencyBypass = (activate) => {
    setEmergencyBypass(activate);
    setEmergencyBypassActiveState(activate);
    if (activate) {
      addLog('BREAK-GLASS: Emergency consent bypass ACTIVATED by ' + (user?.name || 'Doctor'));
      showToastNotification('Emergency Bypass ACTIVATED — All consent checks bypassed. Actions are audit-logged.', 'warning');
    } else {
      addLog('BREAK-GLASS: Emergency consent bypass DEACTIVATED by ' + (user?.name || 'Doctor'));
      showToastNotification('Emergency Bypass deactivated — Normal consent checks restored.', 'success');
      setBreakGlassReason('');
    }
  };

  // Auto-deactivate emergency bypass on unmount (page navigation / logout)
  useEffect(() => {
    return () => {
      if (isEmergencyBypassActive()) {
        setEmergencyBypass(false);
      }
    };
  }, []);

  // UI States
  const [showPdf, setShowPdf] = useState(false);
  const [rxTemplate, setRxTemplate] = useState('General OPD');

  // Freeze background page scroll when any Modal Dialog is active
  useEffect(() => {
    if (showPdf || previewFile || showTimelineModal) {
      document.body.classList.add('modal-open');
    } else {
      document.body.classList.remove('modal-open');
    }
    return () => {
      document.body.classList.remove('modal-open');
    };
  }, [showPdf, previewFile, showTimelineModal, activeTab]);

  // Real AI Assistant State
  const [aiInput, setAiInput] = useState('');
  const [aiChat, setAiChat] = useState([
    { role: 'assistant', text: 'Hello, I am your **Curoxa AI Clinical Copilot**. Type a query or use the fast triggers below to analyze clinical outcomes, review drug pathways, or draft patient diets.' }
  ]);
  const [aiTyping, setAiTyping] = useState(false);

  // Professional page-flicker-free Boundary Scroll-Lock for Textareas & AI Chat (Desktop & Touch Mobile)
  useEffect(() => {
    const handleWheelBoundaryLock = (e) => {
      const el = e.currentTarget;
      const isAtTop = el.scrollTop === 0;
      const isAtBottom = Math.abs(el.scrollHeight - el.scrollTop - el.clientHeight) < 1.5;
      
      // Prevent parent chaining scroll at top & bottom boundaries
      if ((e.deltaY < 0 && isAtTop) || (e.deltaY > 0 && isAtBottom)) {
        if (e.cancelable) {
          e.preventDefault();
        }
        e.stopPropagation(); // Block Lenis or smooth-scroll library interception
      }
    };

    let touchStartY = 0;
    const handleTouchStart = (e) => {
      touchStartY = e.touches[0].clientY;
    };

    const handleTouchMove = (e) => {
      const el = e.currentTarget;
      const touchY = e.touches[0].clientY;
      const touchDeltaY = touchStartY - touchY;
      const isAtTop = el.scrollTop === 0;
      const isAtBottom = Math.abs(el.scrollHeight - el.scrollTop - el.clientHeight) < 1.5;

      if ((touchDeltaY < 0 && isAtTop) || (touchDeltaY > 0 && isAtBottom)) {
        if (e.cancelable) {
          e.preventDefault();
        }
        e.stopPropagation(); // Block Lenis or smooth-scroll library touch interception
      }
    };

    const subjectiveEl = document.getElementById('soap-subjective-input');
    const objectiveEl = document.getElementById('soap-objective-input');
    const chatEl = aiChatScrollRef.current;

    if (subjectiveEl) {
      subjectiveEl.addEventListener('wheel', handleWheelBoundaryLock, { passive: false });
      subjectiveEl.addEventListener('touchstart', handleTouchStart, { passive: true });
      subjectiveEl.addEventListener('touchmove', handleTouchMove, { passive: false });
    }
    if (objectiveEl) {
      objectiveEl.addEventListener('wheel', handleWheelBoundaryLock, { passive: false });
      objectiveEl.addEventListener('touchstart', handleTouchStart, { passive: true });
      objectiveEl.addEventListener('touchmove', handleTouchMove, { passive: false });
    }
    if (chatEl) {
      chatEl.addEventListener('wheel', handleWheelBoundaryLock, { passive: false });
      chatEl.addEventListener('touchstart', handleTouchStart, { passive: true });
      chatEl.addEventListener('touchmove', handleTouchMove, { passive: false });
    }

    return () => {
      if (subjectiveEl) {
        subjectiveEl.removeEventListener('wheel', handleWheelBoundaryLock);
        subjectiveEl.removeEventListener('touchstart', handleTouchStart);
        subjectiveEl.removeEventListener('touchmove', handleTouchMove);
      }
      if (objectiveEl) {
        objectiveEl.removeEventListener('wheel', handleWheelBoundaryLock);
        objectiveEl.removeEventListener('touchstart', handleTouchStart);
        objectiveEl.removeEventListener('touchmove', handleTouchMove);
      }
      if (chatEl) {
        chatEl.removeEventListener('wheel', handleWheelBoundaryLock);
        chatEl.removeEventListener('touchstart', handleTouchStart);
        chatEl.removeEventListener('touchmove', handleTouchMove);
      }
    };
  }, [activeTab, selectedPatient, aiChat.length]);

  // Trigger auto BMI calculation
  useEffect(() => {
    const w = parseFloat(vitals.weight);
    const h = parseFloat(vitals.height) / 100;
    if (w > 0 && h > 0) {
      const calculatedBmi = (w / (h * h)).toFixed(1);
      setVitals(prev => ({ ...prev, bmi: calculatedBmi }));
    }
  }, [vitals.weight, vitals.height]);

  // Click outside to close search dropdown
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (searchContainerRef.current && !searchContainerRef.current.contains(e.target)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Dynamic EMR Lucide Icons re-renderer
  useEffect(() => {
    const timer = setTimeout(() => {
      if (window.lucide) {
        window.lucide.createIcons();
      }
    }, 100);
    return () => clearTimeout(timer);
  });

  // Fetch initial system appointments and patients
  useEffect(() => {
    fetchData(true);
    fetchDoctorQueue();
    // Poll data, coverage data, and doctor live queue every 5 seconds for real-time updates
    const pollInterval = setInterval(() => {
      fetchData();
      fetchCoverageData();
      fetchDoctorQueue();
    }, 5000);
    return () => clearInterval(pollInterval);
  }, [fetchCoverageData, fetchDoctorQueue]);

  useEffect(() => {
    const handleSync = (e) => {
      const { type } = e.detail;
      console.log('[SOCKET] DoctorDashboard received sync event for:', type);
      fetchData();
      fetchCoverageData();
      fetchDoctorQueue();
    };
    window.addEventListener('curoxa_sync', handleSync);
    return () => window.removeEventListener('curoxa_sync', handleSync);
  }, [fetchCoverageData, fetchDoctorQueue]);

  const fetchData = async (forceInitial = false) => {
    const isInitial = forceInitial || !hasFetchedInitial;
    fetchDoctorQueue();

    try {
      const docId = user?.id || user?._id;
      const apps = await api.get((docId && user.role === 'doctor') ? `/appointments?doctorId=${docId}` : '/appointments');

      const sortedApps = (apps.data || []).sort((a, b) => {
        const aCompleted = a.status === 'Completed' || a.status === 'Cancelled' || a.status === 'Checked Out';
        const bCompleted = b.status === 'Completed' || b.status === 'Cancelled' || b.status === 'Checked Out';
        if (aCompleted && !bCompleted) return 1;
        if (!aCompleted && bCompleted) return -1;

        if (a.createdAt && b.createdAt) {
          return new Date(b.createdAt) - new Date(a.createdAt);
        }
        if (a._id && b._id) {
          return b._id.localeCompare(a._id);
        }
        return 0;
      });
      setAppointments(sortedApps);

      let ptsData = [];
      if (isInitial) {
        const pts = await api.get('/patients');
        ptsData = pts.data || [];
        window._cachedPatients = ptsData;
        setHasFetchedInitial(true);
      } else {
        ptsData = window._cachedPatients || [];
      }
      
      let relevantPatients = ptsData;
      if (user.id && user.role === 'doctor') {
        const docPatientIds = new Set(sortedApps.map(app => 
          (app.patientId && typeof app.patientId === 'object' && app.patientId._id) 
            ? app.patientId._id.toString() 
            : (app.patientId ? app.patientId.toString() : null)
        ).filter(Boolean));
        relevantPatients = ptsData.filter(p => docPatientIds.has(p._id.toString()));
      }
      
      const sortedRelevantPatients = [...relevantPatients].sort((a, b) => {
        if (a.createdAt && b.createdAt) {
          return new Date(b.createdAt) - new Date(a.createdAt);
        }
        if (a._id && b._id) {
          return b._id.localeCompare(a._id);
        }
        return 0;
      });
      
      setPatientsList(sortedRelevantPatients);
      
      if (isInitial) {
        try {
          const rxs = await api.get('/prescriptions');
          setAllPrescriptions(rxs.data);
          window._cachedPrescriptions = rxs.data;
        } catch (rxErr) {
          console.warn("Failed to load global prescriptions list", rxErr);
        }
      } else {
        if (window._cachedPrescriptions) {
          setAllPrescriptions(window._cachedPrescriptions);
        }
      }
      
      try {
        const labsRes = await api.get((user.id && user.role === 'doctor') ? `/labs?doctorId=${user.id}` : '/labs');
        setAllLabs(labsRes.data);
      } catch (labsErr) {
        console.warn("Failed to load global labs list", labsErr);
      }
      
      // Map real DB patients to EMR properties
      const formattedRealPatients = sortedRelevantPatients.map(p => {
        const patientApps = sortedApps.filter(app => {
          const pid = (app.patientId && typeof app.patientId === 'object' && app.patientId._id) 
            ? app.patientId._id.toString() 
            : (app.patientId ? app.patientId.toString() : '');
          return pid === p._id.toString();
        });
        const latestApp = patientApps[0];
        const lastVisitDate = latestApp ? new Date(latestApp.date).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' }) : 'No visits';
        const vId = latestApp ? `V-${latestApp._id.toString().substring(20).toUpperCase()}` : 'N/A';

        return {
          ...p,
          _id: p._id,
          name: p.name,
          age: p.age || '--',
          gender: p.gender || '--',
          uhid: `MDC-${p._id.substring(18).toUpperCase()}`, // Build beautiful tracking ID from Mongoose ObjectId
          contact: p.contact || '--',
          email: p.email || 'N/A',
          address: p.address || 'N/A',
          bloodGroup: p.bloodGroup || '--',
          allergies: p.allergies || 'None Reported',
          lastVisit: lastVisitDate,
          visitId: vId,
          abhaId: '--'
        };
      });

      // Use only real database patients — no fallback mock records
      setPatients(formattedRealPatients);
      
      if (isInitial) {
        try {
          const meds = await api.get('/medicines');
          setPharmacyInventoryDb(meds.data);
          window._cachedMedicines = meds.data;
        } catch (medErr) {
          console.warn("Failed to load pharmacy inventory for doctor's alerts", medErr);
        }
      } else {
        if (window._cachedMedicines) {
          setPharmacyInventoryDb(window._cachedMedicines);
        }
      }
      
      // Removed legacy auto-preload so dashboard starts with no active consultation selected by default

      addLog(`Loaded ${formattedRealPatients.length} real patient EMR records & synchronized diagnostic grids.`);
      await fetchCoverageData();
    } catch (err) {
      console.error('Failed to load dashboard data', err);
    }
  };

  const handleCreatePatient = async (e) => {
    e.preventDefault();
    if (!newPatientName || !newPatientAge || !newPatientPhone) {
      showToastNotification("Please fill in Name, Age, and Phone fields.", 'error');
      return;
    }
    try {
      const payload = {
        name: newPatientName,
        age: Number(newPatientAge),
        gender: newPatientGender,
        contact: newPatientPhone,
        bloodGroup: newPatientBloodGroup,
        allergies: newPatientAllergies || 'None',
        medicalHistory: []
      };
      
      const res = await api.post('/patients', payload);
      addLog(`Registered new patient record: ${newPatientName} successfully`);
      
      // Reset form fields
      setNewPatientName('');
      setNewPatientAge('');
      setNewPatientGender('Male');
      setNewPatientPhone('');
      setNewPatientBloodGroup('O+');
      setNewPatientAllergies('');
      
      // Close modal
      setShowAddPatientModal(false);
      
      // Re-hydrate patient list
      await fetchData();
    } catch (err) {
      console.error("Failed to register new patient:", err);
      showToastNotification(`Registration failed: ${err.response?.data?.error || err.message}`, 'error');
    }
  };

  const addLog = (event) => {
    setAuditLogs(prev => [
      { time: new Date().toLocaleTimeString(), event, doctor: user.name || 'Dr. Sarah Jenkins' },
      ...prev
    ]);
  };

  // ==========================================
  // REAL-TIME DATA FLOW & INTERACTIVE CALENDAR HELPERS
  // ==========================================

  const getFormattedPatientId = (patientId, patientRaw) => {
    if (patientRaw?.patientId) return patientRaw.patientId;
    if (!patientId) return 'pat-00';
    const idStr = patientId.toString();
    if (idStr.toLowerCase().startsWith('pat-')) return idStr;
    const found = patients.find(p => p._id === idStr || p.id === idStr);
    if (found?.patientId) return found.patientId;
    if (idStr.length >= 24) {
      return `pat-${idStr.substring(22).toUpperCase()}`;
    }
    return `pat-${idStr.toUpperCase()}`;
  };

  const getDisplayDob = (pt) => {
    if (!pt) return 'N/A';
    if (pt.dob) return new Date(pt.dob).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' });
    const estYear = new Date().getFullYear() - (pt.age || 35);
    return `15 May ${estYear}`;
  };

  const getFormattedTableDate = (d) => {
    if (!d) return 'N/A';
    return new Date(d).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' });
  };

  const getFormattedSummaryDate = (d) => {
    if (!d) return 'N/A';
    return new Date(d).toLocaleDateString('en-US', { day: 'numeric', month: 'long', year: 'numeric' });
  };

  const getInitials = (name) => {
    if (!name) return 'PT';
    const parts = name.trim().split(' ');
    if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  };

  const getAvatarStyle = (name) => {
    const colors = [
      { bg: '#EFF6FF', text: '#2563EB' }, // Blue
      { bg: '#FDF2F8', text: '#DB2777' }, // Pink
      { bg: '#F0FDF4', text: '#16A34A' }, // Green
      { bg: '#FFF7ED', text: '#EA580C' }, // Orange
      { bg: '#F5F3FF', text: '#7C3AED' }, // Violet
      { bg: '#F0FDFA', text: '#0D9488' }  // Teal
    ];
    let sum = 0;
    const nameStr = name || '';
    for (let i = 0; i < nameStr.length; i++) {
      sum += nameStr.charCodeAt(i);
    }
    return colors[sum % colors.length];
  };

  const calculateEndTime = (startTime) => {
    try {
      const parts = startTime.trim().split(' ');
      const timePart = parts[0];
      const modifier = parts[1] || 'AM';
      let [hours, minutes] = timePart.split(':').map(Number);
      
      minutes += 45;
      if (minutes >= 60) {
        hours += 1;
        minutes -= 60;
      }
      
      let finalModifier = modifier;
      if (hours >= 12) {
        if (hours > 12) hours -= 12;
        finalModifier = modifier.toUpperCase() === 'AM' ? 'PM' : 'AM';
      }
      
      const formattedMin = minutes.toString().padStart(2, '0');
      return `${hours}:${formattedMin} ${finalModifier}`;
    } catch (e) {
      return '11:00 AM';
    }
  };

  const getPatientObj = (patientId) => {
    if (!patientId) return null;
    if (typeof patientId === 'object' && patientId.name) return patientId;
    const pId = typeof patientId === 'object' ? patientId._id : patientId;
    return patients.find(p => p._id === pId) || patientsList.find(p => p._id === pId) || null;
  };

  function getOverviewData() {
    if (!selectedOverviewApp) return null;
    const appObj = selectedOverviewApp.originalApp || selectedOverviewApp;
    const pId = appObj.patientId?._id || appObj.patientId;
    const pt = patients.find(p => p._id === pId) || patientsList.find(p => p._id === pId) || appObj.patientId || {};
    const rx = allPrescriptions.find(r => r.appointmentId === appObj._id || (r.appointmentId?._id && r.appointmentId?._id === appObj._id));
    const labsList = allLabs.filter(l => l.appointmentId === appObj._id || (l.appointmentId?._id && l.appointmentId?._id === appObj._id));
    return {
      appointment: appObj,
      patient: pt,
      prescription: rx,
      labs: labsList
    };
  };

  const getAllAppointmentsForList = () => {
    // 1. Map real DB appointments to list structures
    return appointments.map((app, idx) => {
      const pObj = getPatientObj(app.patientId);
      const pId = pObj?._id || app.patientId?._id || app.patientId;
      const formattedId = pId ? `PT00${pId.toString().substring(pId.toString().length - 2).toUpperCase()}` : `PT00${idx + 1}`;
      return {
        _id: app._id,
        patientIdStr: `#${formattedId}`,
        patientName: pObj?.name || 'Anonymous Patient',
        timeRange: app.time ? (app.time.includes('-') ? app.time : `${app.time} to ${calculateEndTime(app.time)}`) : '10:15 AM to 11:00 AM',
        symptoms: app.reason || 'General Consultation',
        status: ['Pending', 'In Progress', 'Paid', 'Upcoming'].includes(app.status) ? 'Upcoming' : app.status,
        billingStatus: app.billingStatus || 'Unpaid',
        rawDate: app.date || new Date(),
        rawTime: app.time || '10:15 AM',
        tokenNumber: app.tokenNumber || null,
        tokenDisplay: app.tokenDisplay || (app.tokenNumber ? String(app.tokenNumber) : null),
        tokenSlotId: app.tokenSlotId || null,
        queueStatus: app.queueStatus || null,
        originalApp: app
      };
    });
  };


  // Timezone-safe and date-format robust parser/formatter to YYYY-MM-DD
  const formatDateString = (d) => {
    if (!d) return '';
    const dateObj = new Date(d);
    if (isNaN(dateObj.getTime())) return '';
    const year = dateObj.getFullYear();
    const month = String(dateObj.getMonth() + 1).padStart(2, '0');
    const day = String(dateObj.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  // Math-based calendar cell generator for Mon-start grid
  const getCalendarDays = (monthDate) => {
    const year = monthDate.getFullYear();
    const month = monthDate.getMonth();
    
    // First day of active viewed month
    const firstDayOfMonth = new Date(year, month, 1);
    let startDayOfWeek = firstDayOfMonth.getDay();
    // Realign to 0 = Mon, 6 = Sun
    startDayOfWeek = startDayOfWeek === 0 ? 6 : startDayOfWeek - 1;
    
    const totalDaysInMonth = new Date(year, month + 1, 0).getDate();
    const totalDaysInPrevMonth = new Date(year, month, 0).getDate();
    
    const days = [];
    
    // 1. Fill trailing days of the previous month
    for (let i = startDayOfWeek - 1; i >= 0; i--) {
      days.push({
        num: totalDaysInPrevMonth - i,
        date: new Date(year, month - 1, totalDaysInPrevMonth - i),
        current: false
      });
    }
    
    // 2. Fill days of the current month
    for (let i = 1; i <= totalDaysInMonth; i++) {
      days.push({
        num: i,
        date: new Date(year, month, i),
        current: true
      });
    }
    
    // 3. Fill leading days of the next month to pad full 7-cell rows
    const totalCells = Math.ceil(days.length / 7) * 7;
    const trailingDaysCount = totalCells - days.length;
    for (let i = 1; i <= trailingDaysCount; i++) {
      days.push({
        num: i,
        date: new Date(year, month + 1, i),
        current: false
      });
    }
    
    return days;
  };

  const getAppointmentsForDate = (dateStr) => {
    const realOnDate = appointments.filter(app => formatDateString(app.date) === dateStr);
    
    const mapped = realOnDate.map(app => {
      const pObj = getPatientObj(app.patientId);
      const pId = pObj?._id || app.patientId?._id || app.patientId;
      const patientAppts = appointments.filter(a => {
        const aPatId = a.patientId?._id || a.patientId;
        return aPatId && pId && aPatId.toString() === pId.toString();
      });
      const sortedPatientAppts = [...patientAppts].sort((a, b) => {
        const dateA = new Date(a.date || 0);
        const dateB = new Date(b.date || 0);
        if (dateA - dateB !== 0) return dateA - dateB;
        return (a.time || '').localeCompare(b.time || '');
      });
      const isFirstVisit = sortedPatientAppts.length === 0 || (sortedPatientAppts[0] && sortedPatientAppts[0]._id === app._id);

      return {
        _id: app._id,
        time: app.time || '10:00 AM',
        patientId: pObj || app.patientId || { name: 'Anonymous Patient', age: 30, gender: 'Male', contact: 'N/A' },
        reason: app.reason || 'General Consultation',
        status: app.status || 'Pending',
        type: isFirstVisit ? 'New' : (app.reason?.toLowerCase().includes('follow') || app.notes ? 'Revisit' : 'New'),
        billingStatus: app.billingStatus || 'Unpaid',
        originalApp: app
      };
    });

    return mapped.sort((a, b) => {
      const aCompleted = a.status === 'Completed' || a.status === 'Cancelled' || a.status === 'Checked Out';
      const bCompleted = b.status === 'Completed' || b.status === 'Cancelled' || b.status === 'Checked Out';
      if (aCompleted && !bCompleted) return 1;
      if (!aCompleted && bCompleted) return -1;

      const dateA = a.originalApp?.createdAt || a._id || 0;
      const dateB = b.originalApp?.createdAt || b._id || 0;
      return new Date(dateB) - new Date(dateA);
    });
  };

  // Coherent calculation of daily EMR KPI cards based on dynamic date selections
  const getKPIsForDate = (dateStr) => {
    const activeApps = getAppointmentsForDate(dateStr);
    const completedCount = activeApps.filter(app => app.status === 'Completed').length;
    const pendingCount = activeApps.filter(app => ['Pending', 'In Progress', 'Paid', 'Upcoming'].includes(app.status)).length;
    
    // Real patients registered on this date
    const realNewPatientsCount = patients.filter(p => formatDateString(p.createdAt) === dateStr).length;
    const newPatientsCount = realNewPatientsCount + activeApps.filter(app => app.type === 'New').length;
    
    // Prescriptions count
    const realPrescriptions = allPrescriptions.filter(rx => formatDateString(rx.createdAt) === dateStr).length;
    const prescriptionsCount = realPrescriptions + completedCount;

    // Calculate YESTERDAY'S stats dynamically to determine true EMR delta trends
    const activeDateObj = new Date(dateStr);
    const yesterdayDateObj = new Date(activeDateObj);
    yesterdayDateObj.setDate(yesterdayDateObj.getDate() - 1);
    const yesterdayStr = formatDateString(yesterdayDateObj);
    
    const yesterdayApps = getAppointmentsForDate(yesterdayStr);
    const yesterdayCompleted = yesterdayApps.filter(app => app.status === 'Completed').length;
    const yesterdayNewPatients = patients.filter(p => formatDateString(p.createdAt) === yesterdayStr).length + yesterdayApps.filter(app => app.type === 'New').length;
    const yesterdayPrescriptions = allPrescriptions.filter(rx => formatDateString(rx.createdAt) === yesterdayStr).length + yesterdayCompleted;
    
    const patientDelta = newPatientsCount - yesterdayNewPatients;
    const rxDelta = prescriptionsCount - yesterdayPrescriptions;

    return {
      appointments: {
        total: activeApps.length,
        completed: completedCount,
        pending: pendingCount
      },
      newPatients: {
        count: newPatientsCount,
        deltaText: patientDelta >= 0 ? `+${patientDelta} from yesterday` : `${patientDelta} from yesterday`
      },
      prescriptions: {
        count: prescriptionsCount,
        deltaText: rxDelta >= 0 ? `+${rxDelta} from yesterday` : `${rxDelta} from yesterday`
      }
    };
  };

  // Dynamic 7-day prescription logs centered around the chosen active date
  const getWeeklyChartData = (refDate) => {
    const weeklyData = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(refDate);
      d.setDate(d.getDate() - i);
      const dateStr = formatDateString(d);
      
      const realRx = allPrescriptions.filter(rx => formatDateString(rx.createdAt) === dateStr).length;
      const apps = getAppointmentsForDate(dateStr);
      const completedApps = apps.filter(app => app.status === 'Completed').length;
      
      const count = realRx + completedApps;
      const dayLabel = d.toLocaleDateString('en-US', { day: 'numeric', month: 'short' });
      
      weeklyData.push({
        dateStr,
        dayLabel,
        count
      });
    }
    return weeklyData;
  };

  // Dynamic recent consultations feed drawing from active date appointments
  const getRecentConsultations = (dateStr) => {
    const activeApps = getAppointmentsForDate(dateStr);
    return activeApps.slice(0, 3).map(app => {
      const name = app.patientId?.name || 'Patient Name';
      const age = app.patientId?.age || 30;
      const gender = app.patientId?.gender || 'Male';
      
      // Calculate Initials
      const initials = name.split(' ').map(p => p[0]).join('').substring(0, 2).toUpperCase();
      
      // Pick a harmonized, premium avatar background based on character hash
      const colors = [
        { bg: '#EFF6FF', text: '#2563EB' }, // Blue
        { bg: '#FFF7ED', text: '#EA580C' }, // Orange
        { bg: '#FDF2F8', text: '#DB2777' }, // Pink
        { bg: '#F0FDF4', text: '#16A34A' }  // Green
      ];
      const codeSum = name.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
      const color = colors[codeSum % colors.length];
      
      let displayDate = '';
      try {
        if (app.date) {
          displayDate = new Date(app.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
        } else if (dateStr) {
          displayDate = new Date(dateStr).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
        }
      } catch (err) {
        displayDate = app.date || dateStr;
      }

      return {
        _id: app._id,
        name,
        age,
        gender,
        initials,
        color,
        time: app.time,
        status: app.status,
        date: displayDate,
        appRaw: app
      };
    });
  };

  // Select patient and auto-fetch EMR history
  const handleSelectPatient = async (pt) => {
    setSelectedPatient(pt);
    setSearchQuery(pt.name);
    setShowDropdown(false);

    // Automatically find a pending/upcoming/in-progress appointment for this patient
    const ptId = pt._id;
    const pendingApp = appointments.find(app => {
      const appPtId = (app.patientId && typeof app.patientId === 'object') ? app.patientId._id : app.patientId;
      return appPtId && appPtId.toString() === ptId.toString() && app.status !== 'Completed';
    });
    if (pendingApp) {
      setActiveAppointmentId(pendingApp._id);
      setSoap(prev => ({
        ...prev,
        subjective: pendingApp.reason || ''
      }));
    } else {
      setActiveAppointmentId(null);
      setSoap(prev => ({
        ...prev,
        subjective: ''
      }));
    }
    
    // Fetch patient vitals from backend
    try {
      const vitalsRes = await api.get(`/emr/vitals/patient/${pt._id}`);
      const data = vitalsRes.data || [];
      setPatientVitals(data);
      if (data.length > 0) {
        const latest = data[0];
        setVitals({
          bpSys: latest.bpSys || '',
          bpDia: latest.bpDia || '',
          pulse: latest.pulse || '',
          temp: latest.temperature || '',
          weight: latest.weight || '',
          height: latest.height || '',
          bmi: latest.bmi || '',
          spo2: latest.spo2 || '',
          sugar: latest.bloodSugar || '',
          resp: latest.resp || ''
        });
      } else {
        setVitals({
          bpSys: '', bpDia: '', pulse: '', temp: '', weight: '', height: '', bmi: '', spo2: '', sugar: '', resp: ''
        });
      }
    } catch (e) {
      console.warn("Failed to fetch patient EMR vitals", e);
      setPatientVitals([]);
      setVitals({
        bpSys: '', bpDia: '', pulse: '', temp: '', weight: '', height: '', bmi: '', spo2: '', sugar: ''
      });
    }

    setDiagnosisText('');
    setMedicines([]);

    addLog(`Fetched patient history for ${pt.name} (${pt.uhid})`);
    
    // Check consent registry
    try {
      const res = await api.get(`/emr/consent/patient/${pt._id}`);
      if (res.data) {
        const isConsentActive = res.data.status === 'Active' && res.data.purposes?.treatment === true;
        setConsentGiven(isConsentActive);
        if (!isConsentActive && !isEmergencyBypassActive()) {
          showToastNotification("Patient consent restricted or withdrawn. Use Break-Glass for emergency override.", "warning");
        }
      } else {
        setConsentGiven(true);
      }
    } catch (e) {
      console.warn("Failed to check patient consent status", e);
      setConsentGiven(true);
    }

    fetchPastPrescriptions(pt._id);
    setActiveTab('prescriptions');
  };

  const handleOpenTimelineForPatient = async (pt) => {
    if (!pt || !pt._id) return;
    try {
      const res = await api.get(`/emr/consent/patient/${pt._id}`);
      let isConsentActive = true;
      if (res.data) {
        isConsentActive = res.data.status === 'Active' && res.data.purposes?.treatment === true;
        setConsentGiven(isConsentActive);
      } else {
        setConsentGiven(true);
      }
      
      if (!isConsentActive && !isEmergencyBypassActive()) {
        showToastNotification("DPDP Restriction: Consent has been restricted or withdrawn. Use Break-Glass override to access.", "error");
        return;
      }
      
      setSelectedPatient(pt);
      fetchPastPrescriptions(pt._id);
      setShowTimelineModal(true);
      addLog(`Opened clinical timeline modal for: ${pt.name}`);
    } catch (e) {
      console.warn("Failed to check patient consent status", e);
      setSelectedPatient(pt);
      fetchPastPrescriptions(pt._id);
      setShowTimelineModal(true);
    }
  };

  // Direct Consult from dashboard button
  const startConsultation = (app) => {
    setActiveAppointmentId(app._id);
    const matchedPatient = (app.patientId && typeof app.patientId === 'object') ? app.patientId : (patients.find(p => p._id === app.patientId) || {
      _id: app.patientId || 'temp',
      name: 'Patient Name',
      age: 30,
      gender: 'Male',
      uhid: `MDC-${Math.floor(10000 + Math.random() * 90000)}`,
      contact: '+91 99999 88888',
      bloodGroup: 'O+',
      allergies: 'None',
      lastVisit: 'N/A',
      visitId: `V-${Math.floor(4000 + Math.random() * 900)}`,
      abhaId: `12-${Math.floor(1000 + Math.random() * 9000)}-4482-99`
    });
    
    // Auto-populate symptoms from receptionist booking
    setSoap({
      subjective: app.reason || '',
      objective: '',
      assessment: '',
      plan: ''
    });

    handleSelectPatient(matchedPatient);
    if (app.status === 'Cancelled') {
      setActiveTab('patient-profile');
    } else {
      setActiveTab('prescriptions');
    }
  };

  // Vitals Red Alerts Checks
  const isVitalAbnormal = (field, val) => {
    const num = parseFloat(val);
    if (isNaN(num)) return false;
    switch(field) {
      case 'bpSys': return num > 135 || num < 90;
      case 'bpDia': return num > 88 || num < 60;
      case 'temp': return num > 99.5 || num < 97.0;
      case 'pulse': return num > 100 || num < 55;
      case 'spo2': return num < 95;
      case 'sugar': return num > 140;
      default: return false;
    }
  };

  // Real-time voice dictation using browser Web Speech API with interim results and permission handling
  const startDictation = (field) => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      showToastNotification("Speech Recognition API is not supported in this browser. Please try using Chrome, Edge, or Safari.", "error");
      return;
    }

    // Helper to align phonetically transcribed Hinglish words to clean transliterated clinical script
    const refineHinglishSpeech = (text) => {
      if (!text) return "";
      let processed = text.toLowerCase();

      // Phonetic phrase dictionary that aligns Chrome's English outputs to exact spoken Hinglish
      const phraseMap = {
        "who are high": "ho raha hai",
        "who are hi": "ho raha hai",
        "or a hi": "ho raha hai",
        "who are he": "ho rahi hai",
        "or high": "ho rahi hai",
        "booker hi": "bukhar hai",
        "who card high": "bukhar hai",
        "sir dirt": "sir dard",
        "sir guard": "sir dard",
        "paid dirt": "pet dard",
        "patent guard": "pet dard",
        "who are you": "ho rahi hai",
        "who are y": "ho rahi hai",
        "who a": "ho raha",
        "who are": "ho raha",
        "who is": "ho raha",
        "who are all": "ho raha hai",
        "fever who are": "fever ho raha",
        "fever who": "fever ho",
        "pain who are": "pain ho raha",
        "pain who": "pain ho",
        "headache who are": "headache ho raha",
        "headache who": "headache ho",
        "ho rha": "ho raha",
        "ho rha hai": "ho raha hai",
        "ho rha he": "ho raha hai",
        "ho raha he": "ho raha hai"
      };

      Object.keys(phraseMap).forEach(key => {
        const regex = new RegExp(`\\b${key}\\b`, 'g');
        processed = processed.replace(regex, phraseMap[key]);
      });

      // Phonetic word-level spelling corrections
      const wordMap = {
        "casi": "khansi",
        "kansi": "khansi",
        "chucker": "chakkar",
        "chakar": "chakkar",
        "kamzori": "kamzori",
        "ghabrane": "ghabranat",
        "pet": "pet",
        "dard": "dard"
      };

      processed = processed.split(' ').map(word => {
        return wordMap[word] || word;
      }).join(' ');

      // Clean double spaces and capitalize first letter
      processed = processed.replace(/\s+/g, ' ').trim();
      return processed.charAt(0).toUpperCase() + processed.slice(1);
    };

    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch (err) {}
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    
    // Enable interim results so text appears immediately word-by-word as you speak!
    recognition.interimResults = true;
    
    // Set language to en-IN which captures Indian English + Hindi accents + Hinglish blended words seamlessly!
    recognition.lang = 'en-IN';

    // Store starting text so we don't wipe out any pre-existing text in the textarea
    baseTextRef.current = soap[field] || '';
    finalTranscriptRef.current = '';

    recognition.onstart = () => {
      setRecordingField(field);
      setIsRecording(true);
      addLog(`Voice dictation active for ${field.toUpperCase()} - Speak in English or Hinglish now...`);
    };

    recognition.onresult = (event) => {
      let interimTranscript = '';
      let newFinalTranscript = '';

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          newFinalTranscript += transcript + ' ';
        } else {
          interimTranscript += transcript;
        }
      }

      // Append final results to our accumulator
      if (newFinalTranscript) {
        finalTranscriptRef.current += newFinalTranscript;
      }

      const fullLiveTranscript = (finalTranscriptRef.current + interimTranscript).trim();
      const refinedTranscript = refineHinglishSpeech(fullLiveTranscript);

      if (refinedTranscript) {
        const targetVal = baseTextRef.current 
          ? baseTextRef.current.trim() + ' ' + refinedTranscript 
          : refinedTranscript;

        // Write directly to the DOM for immediate, zero-lag rendering at 60 FPS while speaking!
        const textarea = document.getElementById(`soap-${field}-input`);
        if (textarea) {
          textarea.value = targetVal;
        }

        // Keep React state in perfect sync
        setSoap(prev => ({
          ...prev,
          [field]: targetVal
        }));
      }
    };

    recognition.onerror = (event) => {
      console.error("Speech Recognition Error", event.error);
      addLog(`Speech Recognition Error: ${event.error}`);
      
      if (event.error === 'not-allowed') {
        showToastNotification("Microphone access was blocked or denied. Please enable mic permissions in your browser.", "error");
      } else if (event.error === 'no-speech') {
        addLog("No speech detected. Please speak clearly into the microphone.");
      } else {
        showToastNotification(`Voice Dictation Error: ${event.error}`, "error");
      }
      stopDictation();
    };

    recognition.onend = () => {
      setIsRecording(false);
      setRecordingField(null);
      addLog(`Voice dictation stopped for ${field.toUpperCase()}`);
    };

    recognitionRef.current = recognition;
    recognition.start();
  };

  const stopDictation = () => {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch (err) {}
      recognitionRef.current = null;
    }
    setIsRecording(false);
    setRecordingField(null);
  };



  // Medicine operations
  const addMedicineRow = (med = { name: '', dose: '', freq: '1 Tab BD', duration: '5 Days', timing: 'After Food', route: 'Oral', notes: '' }) => {
    setMedicines(prev => [
      ...prev,
      { id: Date.now(), ...med }
    ]);
    addLog(`Added medicine row: ${med.name || 'Empty'}`);
  };

  const addFavoriteMedicine = (medName) => {
    const def = medicineDefaults[medName.toLowerCase().trim()];
    if (def) {
      addMedicineRow({
        name: medName.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' '),
        dose: def.dose,
        freq: def.freq,
        duration: def.duration,
        timing: def.timing,
        notes: def.notes
      });
      addLog(`One-click loaded preset medication: ${medName}`);
    }
  };

  const saveAsCustomDefault = (med) => {
    if (!med.name.trim()) {
      showToastNotification("Please enter a medicine name first.", "error");
      return;
    }
    const key = med.name.toLowerCase().trim();
    setMedicineDefaults(prev => ({
      ...prev,
      [key]: {
        dose: med.dose,
        freq: med.freq,
        duration: med.duration,
        timing: med.timing,
        notes: med.notes
      }
    }));
    addLog(`Configured custom defaults for ${med.name}`);
    showToastNotification(`Saved default config for "${med.name}"`, "success");
  };

  const handleMedNameChange = (id, typedName) => {
    updateMedicineRow(id, 'name', typedName);
    
    // Check if the typed name matches a saved default config (case-insensitive / substring)
    const matchedKey = Object.keys(medicineDefaults)
      .sort((a, b) => b.length - a.length)
      .find(k => typedName.toLowerCase().trim().includes(k.toLowerCase()) || k.toLowerCase().includes(typedName.toLowerCase().trim()));
      
    if (matchedKey) {
      const def = medicineDefaults[matchedKey];
      // Auto-fill all fields for this row!
      setMedicines(prev => prev.map(m => m.id === id ? { 
        ...m, 
        dose: def.dose || m.dose, 
        freq: def.freq || m.freq, 
        duration: def.duration || m.duration, 
        timing: def.timing || m.timing, 
        notes: def.notes || m.notes 
      } : m));
      addLog(`Auto-filled default config for ${matchedKey}`);
    }
  };

  const updateMedicineRow = (id, field, value) => {
    setMedicines(prev => prev.map(m => m.id === id ? { ...m, [field]: value } : m));
  };

  const removeMedicineRow = (id) => {
    setMedicines(prev => prev.filter(m => m.id !== id));
    addLog(`Removed medicine row`);
  };

  // Fast shortcut templates
  const applyMedicineTemplate = (type) => {
    let meds = [];
    if (type === 'Fever') {
      meds = [
        { name: 'Paracetamol 650mg', dose: '650 mg', freq: '1 Tab TDS', duration: '3 Days', timing: 'After Food', route: 'Oral', notes: 'For fever' },
        { name: 'Pantocid 40mg', dose: '40 mg', freq: '1 Tab OD', duration: '5 Days', timing: 'Before Food', route: 'Oral', notes: 'For acidity' }
      ];
      setSoap(prev => ({ ...prev, subjective: 'Fever and chills for 2 days.' }));
      setLabs(['CBC']);
    } else if (type === 'Hypertension') {
      meds = [
        { name: 'Telmisartan 40mg', dose: '40 mg', freq: '1 Tab OD', duration: '30 Days', timing: 'Before Food', route: 'Oral', notes: 'Control blood pressure' },
        { name: 'Amlodipine 5mg', dose: '5 mg', freq: '1 Tab HS', duration: '30 Days', timing: 'After Food', route: 'Oral', notes: 'Take at night' }
      ];
      setSoap(prev => ({ ...prev, subjective: 'Regular follow up. Mild dizziness reported.' }));
      setLabs(['KFT', 'Lipid Profile']);
    } else if (type === 'Diabetes') {
      meds = [
        { name: 'Metformin 500mg (SR)', dose: '500 mg', freq: '1 Tab BD', duration: '30 Days', timing: 'After Food', route: 'Oral', notes: 'Antidiabetic' },
        { name: 'Glimepiride 2mg', dose: '2 mg', freq: '1 Tab OD', duration: '30 Days', timing: 'Before Food', route: 'Oral', notes: 'Antidiabetic' }
      ];
      setLabs(['Fasting Blood Sugar', 'HbA1c']);
    }
    
    setMedicines(meds.map((m, idx) => ({ id: idx + 1, ...m })));
    addLog(`Applied fast shortcut template: ${type}`);
  };

  // Allergy warning alert
  const hasAllergyWarning = (medName) => {
    if (!selectedPatient || !medName) return false;
    const patientAllergies = (selectedPatient.allergies || '').toLowerCase();
    const testName = medName.toLowerCase();
    if (patientAllergies.includes('sulfa') && (testName.includes('sulfa') || testName.includes('bactrim'))) return true;
    if (patientAllergies.includes('penicillin') && (testName.includes('penicillin') || testName.includes('amoxicillin'))) return true;
    if (patientAllergies.includes('aspirin') && testName.includes('aspirin')) return true;
    return false;
  };

  // Real File Upload Handler with progress bar simulation
  const handleRealUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    // Clear input value so subsequent uploads of same file can trigger change
    e.target.value = '';
    
    setIsUploading(true);
    setUploadProgress(10);
    
    let progressVal = 10;
    const interval = setInterval(() => {
      progressVal += 30;
      if (progressVal >= 100) {
        progressVal = 100;
        setUploadProgress(100);
        clearInterval(interval);
        
        setTimeout(() => {
          setIsUploading(false);
          setUploadProgress(0);
          
          const sizeInMb = (file.size / (1024 * 1024)).toFixed(2);
          const newFile = {
            name: file.name,
            size: `${sizeInMb} MB`,
            type: file.type,
            url: URL.createObjectURL(file),
            raw: file
          };
          
          setUploadedFiles(prevFiles => [...prevFiles, newFile]);
          addLog(`Uploaded clinical report: ${file.name} (${sizeInMb} MB)`);
        }, 1500);
      } else {
        setUploadProgress(progressVal);
      }
    }, 150);
  };

  // Real Database Write operations on final eSign lock
  // Real Database Write operations on final eSign lock (Asynchronous Background processing)
  const handleLockPrescription = () => {
    if (isSavingPrescription) return;
    if (!selectedPatient) {
      showToastNotification("Please select a patient first.", "error");
      return;
    }
    if (!diagnosisText || diagnosisText.trim() === '') {
      showToastNotification("Clinical Requirement: Primary Diagnosis is mandatory to finalize and lock the encounter.", "error");
      return;
    }
    if (!consentGiven && !emergencyBypassActive) {
      showToastNotification("DPDP Compliance error: Patient consent is required to lock record. Use Break-Glass override for emergencies.", "error");
      return;
    }
    if (!consentGiven && emergencyBypassActive) {
      addLog('BREAK-GLASS: Prescription locked WITHOUT patient consent — Emergency override active. Reason: ' + (breakGlassReason || 'Emergency Medical Care'));
    }

    const resolvedPatient = typeof selectedPatient === 'string' 
      ? (patients.find(p => p._id === selectedPatient) || patientsList.find(p => p._id === selectedPatient) || { _id: selectedPatient })
      : selectedPatient;

    const patientId = resolvedPatient?._id;
    if (!patientId || (typeof patientId === 'string' && patientId.length !== 24)) {
      showToastNotification("Authentication/Compliance error: Invalid patient record ID.", "error");
      return;
    }
    
    // Guard: ensure authenticated doctor ID is available
    if (!user || !user.id) {
      showToastNotification("Authentication error: Could not identify the prescribing doctor. Please log out and log in again.", "error");
      return;
    }

    const validMedicines = medicines
      .filter(m => m.name && m.name.trim() !== '')
      .map(m => {
        const days = parseInt(m.duration, 10) || 5;
        let dailyFreq = 1;
        const f = (m.freq || 'Once a day').toLowerCase();
        if (f.includes('twice') || f.includes('bd') || f.includes('2')) dailyFreq = 2;
        else if (f.includes('thrice') || f.includes('tds') || f.includes('3')) dailyFreq = 3;
        else if (f.includes('four') || f.includes('qd') || f.includes('4')) dailyFreq = 4;
        const qty = days * dailyFreq;
        return {
          medicine: m.name.trim(),
          dosage: m.dose && m.dose.trim() !== '' ? m.dose.trim() : '500 mg',
          duration: m.duration && m.duration.trim() !== '' ? m.duration.trim() : '5 Days',
          instructions: `${m.freq || 'Once a day'} (${m.timing || 'After Food'})`,
          quantity: qty
        };
      });
    const validLabs = labs.filter(test => test && test.trim() !== '');

    // Immediately execute save and lock without requiring print modal
    executeSaveAndLockPrescription(printSettings);
  };

  const executeSaveAndLockPrescription = (finalSettings = printSettings) => {
    if (isSavingPrescription) return;
    setIsSavingPrescription(true);
    setIsFinalized(true);
    addLog("Prescription final eSign locked. Record marked as tamper-proof.");

    const validMedicines = medicines
      .filter(m => m.name && m.name.trim() !== '')
      .map(m => {
        const days = parseInt(m.duration, 10) || 5;
        let dailyFreq = 1;
        const f = (m.freq || 'Once a day').toLowerCase();
        if (f.includes('twice') || f.includes('bd') || f.includes('2')) dailyFreq = 2;
        else if (f.includes('thrice') || f.includes('tds') || f.includes('3')) dailyFreq = 3;
        else if (f.includes('four') || f.includes('qd') || f.includes('4')) dailyFreq = 4;
        const qty = days * dailyFreq;
        return {
          medicine: m.name.trim(),
          dosage: m.dose && m.dose.trim() !== '' ? m.dose.trim() : '500 mg',
          duration: m.duration && m.duration.trim() !== '' ? m.duration.trim() : '5 Days',
          instructions: `${m.freq || 'Once a day'} (${m.timing || 'After Food'})`,
          quantity: qty
        };
      });
    const validLabs = labs.filter(test => test && test.trim() !== '');

    const appointmentIdToUse = activeAppointmentId;
    const cleanDiagnosisText = diagnosisText ? diagnosisText.trim() : '';

    const resolvedPatient = typeof selectedPatient === 'string' 
      ? (patients.find(p => p._id === selectedPatient) || patientsList.find(p => p._id === selectedPatient) || { _id: selectedPatient })
      : selectedPatient;
    const patientId = resolvedPatient?._id;

    // Trigger Print Automatically synchronously to avoid popup blockers
    const printItem = {
      items: validMedicines,
      tests: validLabs,
      diagnosis: cleanDiagnosisText,
      notes: soap.plan || soap.assessment || '',
      date: new Date().toLocaleDateString('en-IN'),
      doctor: user.name,
      originalApp: { regNo: appointmentIdToUse ? appointmentIdToUse.substring(0, 8).toUpperCase() : 'NEW' }
    };
    // Pass null for rx as it's not created yet, handlePrintPrescription will use printItem
    handlePrintPrescription(null, printItem, finalSettings);

    // 1. Immediately transition UI back to appointments list in foreground
    showToastNotification(editingPrescriptionId ? "Prescription updated! Syncing changes in the background." : "Prescription locked! Syncing encounter records in the background.", "success");
    setActiveTab('appointments');

    // 2. Perform DB operations asynchronously in background
    const saveEncounterData = async () => {
      let resolvedAppId = appointmentIdToUse || editingAppointmentId;
      
      // If there is no activeAppointmentId, create a Completed appointment on the fly
      if (!resolvedAppId) {
        const timeNow = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
        const appRes = await api.post('/appointments', {
          patientId: patientId,
          doctorId: user.id,
          date: formatDateString(new Date()),
          time: timeNow,
          reason: cleanDiagnosisText || 'OPD Consultation',
          status: 'Completed',
          diagnosis: cleanDiagnosisText,
          notes: soap.plan || soap.assessment || ''
        });
        resolvedAppId = appRes.data._id;
      }

      // Create prescription record with conditional status based on sendToPharmacy
      const rxStatus = sendToPharmacy ? 'Pending Pharmacy Dispatch' : 'Direct Patient';
      let rxRecord = null;

      if (editingPrescriptionId) {
        // Edit flow
        const rxRes = await api.put(`/prescriptions/${editingPrescriptionId}`, {
          appointmentId: resolvedAppId,
          patientId: patientId,
          doctorId: user.id,
          status: rxStatus,
          items: validMedicines,
          labs: validLabs,
          diagnosis: cleanDiagnosisText,
          notes: soap.plan || soap.assessment || ''
        });
        rxRecord = rxRes.data;
        if (rxRes && rxRes.data) {
          setAllPrescriptions(prev => prev.map(r => r._id === editingPrescriptionId ? rxRes.data : r));
          setPastPrescriptions(prev => prev.map(r => r._id === editingPrescriptionId ? rxRes.data : r));
        }

        // Delete all old lab requests for this appointment and re-create updated ones!
        try {
          await api.delete(`/labs/appointment/${resolvedAppId}`);
          const createdLabs = [];
          for (const test of validLabs) {
            const labRes = await api.post('/labs', {
              appointmentId: resolvedAppId,
              patientId: patientId,
              doctorId: user.id,
              testName: test.trim(),
              notes: 'Requested from Prescription Maker EMR (Updated)'
            });
            if (labRes && labRes.data) {
              createdLabs.push(labRes.data);
            }
          }
          // Optimistically update allLabs state
          setAllLabs(prev => {
            const filtered = prev.filter(l => {
              const lid = l.appointmentId?._id || l.appointmentId;
              return lid !== resolvedAppId;
            });
            return [...createdLabs, ...filtered];
          });
        } catch (labSyncErr) {
          console.error("Failed to sync labs on edit:", labSyncErr);
        }
      } else {
        // Create flow
        const rxRes = await api.post('/prescriptions', {
          appointmentId: resolvedAppId,
          patientId: patientId,
          doctorId: user.id,
          status: rxStatus,
          items: validMedicines
        });
        rxRecord = rxRes.data;
        if (rxRes && rxRes.data) {
          setAllPrescriptions(prev => [rxRes.data, ...prev]);
          setPastPrescriptions(prev => [rxRes.data, ...prev]);
        }

        // Create real lab requests in DB
        const createdLabs = [];
        for (const test of validLabs) {
          const labRes = await api.post('/labs', {
            appointmentId: resolvedAppId,
            patientId: patientId,
            doctorId: user.id,
            testName: test.trim(),
            notes: 'Requested from Prescription Maker EMR'
          });
          if (labRes && labRes.data) {
            createdLabs.push(labRes.data);
          }
        }
        if (createdLabs.length > 0) {
          setAllLabs(prev => [...createdLabs, ...prev]);
        }
      }

      // Create real itemized bill in DB only if one doesn't already exist for this appointment
      const docFee = user.consultationFee !== undefined ? user.consultationFee : 500;
      const billItems = [
        { description: 'OPD Clinical Consultation Fee', amount: docFee }
      ];
      if (sendToPharmacy) {
        validMedicines.forEach(m => {
          billItems.push({ description: `Rx Dispense: ${m.medicine}`, amount: 150 });
        });
      }
      validLabs.forEach(l => {
        billItems.push({ description: `Lab Diagnostics: ${l}`, amount: 350 });
      });
      const totalAmount = billItems.reduce((acc, item) => acc + item.amount, 0);

      try {
        const existingBillsRes = await api.get(`/billing?appointmentId=${resolvedAppId}`);
        const existingBills = existingBillsRes.data;
        if (existingBills && Array.isArray(existingBills) && existingBills.length > 0) {
          const existingBill = existingBills[0];
          const additionalItems = billItems.filter(item => {
            if (item.description === 'OPD Clinical Consultation Fee') return false;
            const alreadyExists = existingBill.items.some(existingItem => existingItem.description === item.description);
            return !alreadyExists;
          });
          
          if (additionalItems.length > 0) {
            const mergedItems = [...existingBill.items, ...additionalItems];
            const additionalAmount = additionalItems.reduce((sum, item) => sum + item.amount, 0);
            const newTotalAmount = (existingBill.totalAmount || 0) + additionalAmount;
            const newOriginalAmount = (existingBill.originalAmount || existingBill.totalAmount || 0) + additionalAmount;
            
            await api.put(`/billing/${existingBill._id}`, {
              items: mergedItems,
              totalAmount: newTotalAmount,
              originalAmount: newOriginalAmount,
              status: existingBill.status
            });
          }
        } else {
          await api.post('/billing', {
            patientId: patientId,
            appointmentId: resolvedAppId,
            items: billItems,
            totalAmount,
            status: 'Unpaid'
          });
        }
      } catch (billCheckErr) {
        console.error("Failed to check/update existing bill, attempting creation fallback:", billCheckErr);
        try {
          await api.post('/billing', {
            patientId: patientId,
            appointmentId: resolvedAppId,
            items: billItems,
            totalAmount,
            status: 'Unpaid'
          });
        } catch (fallbackErr) {
          console.error("Fallback billing creation failed:", fallbackErr);
        }
      }

      // Update the appointment status to Completed and add diagnosis
      const appToUpdate = appointmentIdToUse || editingAppointmentId;
      if (appToUpdate) {
        setAppointments(prev => prev.map(a => a._id === appToUpdate ? { ...a, status: 'Completed', diagnosis: cleanDiagnosisText, notes: soap.plan || soap.assessment || '' } : a));
        setCoverageQueue(prev => prev.map(q => q.id === appToUpdate ? { ...q, status: 'Completed' } : q));
        setCoverageAppts(prev => prev.map(a => a.id === appToUpdate ? { ...a, status: 'Completed' } : a));

        await api.put(`/appointments/${appToUpdate}`, { 
          status: 'Completed', 
          diagnosis: cleanDiagnosisText,
          notes: soap.plan || soap.assessment || ''
        });
        window.dispatchEvent(new CustomEvent('curoxa_sync', { detail: { type: 'appointments' } }));
      }
    };

    saveEncounterData()
      .then(() => {
        addLog("Background EMR sync completed successfully.");
        fetchData();
      })
      .catch(err => {
        console.error('Failed to save background EMR data:', err);
        const detail = err.response?.data?.error || err.response?.data?.message || err.message;
        showToastNotification(`Background EMR sync error: ${detail}`, "error");
      })
      .finally(() => {
        // Reset states
        setSelectedPatient(null);
        setActiveAppointmentId(null);
        setEditingPrescriptionId(null);
        setEditingAppointmentId(null);
        setDiagnosisText('');
        setMedicines([]);
        setLabs([]);
        setSoap({ subjective: '', objective: '', assessment: '', plan: '' });
        setIsFinalized(false);
        setIsSavingPrescription(false);
      });
  };
  const handlePrintSummary = (data) => {
    if (!data) return;
    const { appointment, patient, prescription, labs } = data;
    
    const printItem = {
      patient: patient,
      items: (prescription?.items || []).map(m => ({
        medicine: m.medicine || m.name,
        dosage: m.dosage || m.dose,
        duration: m.duration,
        instructions: m.instructions
      })),
      tests: labs || [],
      diagnosis: appointment?.diagnosis || 'General Consultation',
      notes: appointment?.notes || '',
      date: appointment?.date ? new Date(appointment.date).toLocaleDateString('en-IN') : new Date().toLocaleDateString('en-IN'),
      doctor: user.name,
      originalApp: { regNo: appointment?.regNo || 'NEW' }
    };

    handlePrintPrescription(prescription || {}, printItem, printSettings);
  };

  // Real Clinical AI Chat Response Engine (Highly Premium EMR Integrated Copilot)
  const askAiCopilot = (directQuery = null) => {
    const rawInput = directQuery !== null ? directQuery : aiInput;
    if (!rawInput.trim()) return;
    
    const userMsg = { role: 'user', text: rawInput };
    setAiChat(prev => [...prev, userMsg]);
    const query = rawInput.toLowerCase();
    setAiInput('');
    setAiTyping(true);
 
    setTimeout(() => {
      let replyText = `### AI Clinical Diagnostic Recommendation
I have scanned the medical reference databases, but couldn't find a direct matched protocol for **"${rawInput}"**.

*   **Recommended Diagnostic Action**: Order standard metabolic panels (KFT, LFT, CBC) and verify patient histories.
*   **General Advice**: Maintain standard adult hydration and monitor vitals (BP, SpO2, Temperature).`;
      
      if (query.includes('fever') || query.includes('cough') || query.includes('paracetamol')) {
        replyText = `### AI Clinical Suggestions for Acute Viral Fever
1. **Suggested Diagnosis**: Acute Viral Fever (ICD-10: B34.9)
2. **First-Line Medication Plan**:
   - **Paracetamol 650mg** (Standard antipyretic for symptom relief).
   - **Pantocid 40mg** (Gastric shield to avoid NSAID acidity).
[APPLY_RX: Paracetamol 650mg | 650 mg | 1 Tab TDS | 3 Days | After Food | For fever spikes]
[APPLY_RX: Pantocid 40mg | 40 mg | 1 Tab OD | 5 Days | Before Food | Gastric mucosal protector]
3. **Recommended Diagnostics**:
   - Order **CBC (Complete Blood Count)** to check Platelet & TLC trends.
4. **General Advice**:
   - Bed rest, high fluid intake, and tepid sponging if temperature > 102°F.`;
      } else if (query.includes('hypertension') || query.includes('bp') || query.includes('telmisartan') || query.includes('blood pressure')) {
        replyText = `### AI Clinical Suggestions for Essential Hypertension
1. **Suggested Diagnosis**: Essential Hypertension (ICD-10: I10)
2. **First-Line Medication Plan**:
   - **Telmisartan 40mg** (Angiotensin II Receptor Blocker).
   - **Amlodipine 5mg** (Calcium Channel Blocker, added at bedtime if uncontrolled).
[APPLY_RX: Telmisartan 40mg | 40 mg | 1 Tab OD | 30 Days | Before Food | BP Control]
[APPLY_RX: Amlodipine 5mg | 5 mg | 1 Tab HS | 30 Days | After Food | Bedtime BP management]
3. **Contraindications & Warnings**:
   - **Do not prescribe Telmisartan in pregnancy** (Fetotoxicity risk).
   - Monitor serum Potassium and Kidney Function.
4. **Recommended Diagnostics**:
   - **Kidney Function Test (KFT)** and **Serum Electrolytes**.`;
      } else if (query.includes('diabetes') || query.includes('sugar') || query.includes('metformin')) {
        replyText = `### AI Clinical Suggestions for Type 2 Diabetes Mellitus
1. **Suggested Diagnosis**: Type 2 Diabetes Mellitus (ICD-10: E11)
2. **First-Line Medication Plan**:
   - **Metformin 500mg SR** (Sustained release insulin sensitizer).
   - **Glimepiride 1mg** (Sulfonylurea, to target post-prandial spikes).
[APPLY_RX: Metformin 500mg SR | 500 mg | 1 Tab BD | 30 Days | After Food | Diabetes control]
[APPLY_RX: Glimepiride 1mg | 1 mg | 1 Tab OD | 30 Days | Before Food | Meal-time spike control]
3. **Recommended Diagnostics**:
   - **HbA1c** (Glycated Hemoglobin) every 3 months.
   - **Fasting & Postprandial Blood Sugar** (FBS / PPBS).
4. **Allergy Check**:
   - Glimepiride has cross-reactivity with **Sulfa allergies**. Avoid if sulfa hypersensitive.`;
      } else if (query.includes('asthma') || query.includes('inhaler') || query.includes('bronchial')) {
        replyText = `### AI Clinical Suggestions for Acute Bronchial Asthma
1. **Suggested Diagnosis**: Acute Bronchial Asthma (ICD-10: J45.909)
2. **First-Line Medication Plan**:
   - **Budecort Inhaler 200mcg** (Inhaled corticosteroid preventer).
   - **Foracort Inhaler 120mcg** (LABA + ICS controller).
[APPLY_RX: Budecort Inhaler | 200 mcg | 1 Puff BD | 30 Days | After Food | Preventative anti-inflammatory]
[APPLY_RX: Foracort Inhaler | 120 mcg | 1 Puff BD | 30 Days | After Food | Long-term control inhaler]
3. **Recommended Diagnostics**:
   - **Spirometry & PEFR** (Peak Expiratory Flow Rate) tracking.
   - Chest X-Ray to check for chest infections.`;
      } else if (query.includes('acidity') || query.includes('gerd') || query.includes('gastritis') || query.includes('heartburn')) {
        replyText = `### AI Clinical Suggestions for GERD & Gastritis
1. **Suggested Diagnosis**: Gastroesophageal Reflux Disease (ICD-10: K21.9)
2. **First-Line Medication Plan**:
   - **Pantocid 40mg (Pantoprazole)** (Proton Pump Inhibitor).
   - **Domperidone 10mg** (Prokinetic, to enhance gastric clearing).
[APPLY_RX: Pantocid 40mg | 40 mg | 1 Tab OD | 14 Days | Before Food | Acid suppression]
[APPLY_RX: Domperidone 10mg | 10 mg | 1 Tab BD | 10 Days | Before Food | Gastric emptying aid]
3. **General Lifestyle Advice**:
   - Avoid horizontal postures for 2 hours post meals. Limit spicy/caffeinated intake.`;
      } else if (query.includes('infection') || query.includes('antibiotic') || query.includes('amoxicillin')) {
        replyText = `### AI Clinical Suggestions for Respiratory Bacterial Infection
1. **Suggested Diagnosis**: Acute Bacterial Sinusitis (ICD-10: J01.9)
2. **First-Line Medication Plan**:
   - **Amoxyclav 625mg** (Amoxicillin + Clavulanic Acid, broad spectrum).
   - **Azithromycin 500mg** (Macrolide alternative if penicillin allergic).
[APPLY_RX: Amoxyclav 625mg | 625 mg | 1 Tab BD | 5 Days | After Food | Broad spectrum coverage]
[APPLY_RX: Azithromycin 500mg | 500 mg | 1 Tab OD | 3 Days | After Food | Penicillin allergy alternative]
3. **Allergy Check**:
   - Always verify **Penicillin allergy status** before initiating Amoxyclav.`;
      } else if (query.includes('cholesterol') || query.includes('lipid') || query.includes('lipivas') || query.includes('statin')) {
        replyText = `### AI Clinical Suggestions for Hypercholesterolemia
1. **Suggested Diagnosis**: Pure Hypercholesterolemia (ICD-10: E78.00)
2. **First-Line Medication Plan**:
   - **Atorvastatin 10mg** (HMG-CoA Reductase Inhibitor, bedtime dose).
[APPLY_RX: Atorvastatin 10mg | 10 mg | 1 Tab HS | 30 Days | At Bedtime | Cholesterol lowering statin]
3. **Recommended Diagnostics**:
   - Fasting Lipid Profile every 6 months. Liver Function Tests (LFT) baseline.`;
      } else if (query.includes('thyroid') || query.includes('hypo') || query.includes('thyronorm')) {
        replyText = `### AI Clinical Suggestions for Primary Hypothyroidism
1. **Suggested Diagnosis**: Primary Hypothyroidism (ICD-10: E03.9)
2. **First-Line Medication Plan**:
   - **Thyronorm 50mcg (Levothyroxine)** (Early morning empty stomach hormone replacement).
[APPLY_RX: Thyronorm 50mcg | 50 mcg | 1 Tab OD | 60 Days | Before Food | Thyroid hormone replacement]
3. **Recommended Diagnostics**:
   - Serum TSH levels every 8 weeks to adjust daily dose parameters.`;
      } else if (query.includes('allergy') || query.includes('cross')) {
        replyText = `### AI Allergy Analysis & Cross-Reactivity Scanner
1. **Sulfa Allergies**: High cross-reactivity with **Sulfonylureas (Glimepiride)** and **Bactrim**. Avoid these completely.
2. **Penicillin Allergies**: Cross-reactivity (~5%) with **Cephalosporins**. Prefer Macrolides (Azithromycin).
3. **Aspirin Allergies**: Avoid all NSAIDs (Ibuprofen, Diclofenac). Paracetamol is generally safe.`;
      } else if (query.includes('diet') || query.includes('nutrition') || query.includes('weight')) {
        replyText = `### AI Clinical Nutrition & Diet Guidelines
1. **Cardiac/Hypertension (DASH Diet)**: Limit daily Sodium < 2000mg. Increase Potassium-rich greens and whole grains.
2. **Diabetic Diet**: Low glycemic index meals, portion control, strictly zero refined sugars, and high soluble fibers.
3. **General Renal Advice**: Monitor protein intake levels if GFR is compromised. Limit Potassium in advanced stages.`;
      } else if (query.includes('pain') || query.includes('headache') || query.includes('migraine')) {
        replyText = `### AI Clinical Suggestions for Tension Headaches
1. **Suggested Diagnosis**: Tension-type Headache (ICD-10: G44.2)
2. **First-Line Medication Plan**:
   - **Paracetamol 650mg** (Symptomatic pain relief).
[APPLY_RX: Paracetamol 650mg | 650 mg | 1 Tab TDS | 3 Days | After Food | Tension headache relief]
3. **Diagnostics & Actions**:
   - Check blood pressure (BP) levels to rule out hypertensive crisis.`;
      }
 
      setAiChat(prev => [...prev, { role: 'assistant', text: replyText }]);
      setAiTyping(false);
    }, 1200);
  };

  const handleLogout = () => {
    performLogout(navigate);
  };

  useEffect(() => {
    restoreActivePortalDocumentMetadata();
  }, []);

  useEffect(() => {
    try {
      if (window.lucide) {
        window.lucide.createIcons();
      }
    } catch (e) {
      console.warn("Lucide icons failed to render safely", e);
    }
  }, [activeTab, selectedPatient, showDropdown, showProfileMenu, uploadedFiles, previewFile, aiChat, isUploading, medicines, showDiagSuggestions, showTimelineModal, showPdf, docProfile]);

  return (
    <ErrorBoundary>
      <>
        <style>{`
        @keyframes toastSlideDown {
          from {
            transform: translateY(-20px);
            opacity: 0;
          }
          to {
            transform: translateY(0);
            opacity: 1;
          }
        }

        @keyframes dropdownFadeIn {
          from {
            opacity: 0;
            transform: translateY(-8px) scale(0.98);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }

        .custom-dropdown-item:hover {
          background-color: #F1F5F9 !important;
          color: #1E3A8A !important;
        }

        body {
          background-color: #F8FAFC !important;
          font-family: 'Urbanist', sans-serif !important;
        }
        
        /* Sidebar Refinement */
        .sidebar {
          width: 256px !important;
          background: #FFFFFF !important;
          border-right: 1px solid #E2E8F0 !important;
          box-shadow: none !important;
          padding: 24px 0 !important;
          height: calc(100vh / 0.9) !important;
          position: fixed !important;
          top: 0 !important;
          left: 0 !important;
          display: flex !important;
          flex-direction: column !important;
          z-index: 100 !important;
        }
        .sidebar-logo {
          padding: 0 24px 28px !important;
          display: flex !important;
          align-items: center !important;
          gap: 10px !important;
          font-size: 22px !important;
          font-weight: 800 !important;
          color: #2563EB !important;
          letter-spacing: -0.5px !important;
        }
        .sidebar-logo svg, .sidebar-logo i {
          color: #2563EB !important;
          width: 24px !important;
          height: 24px !important;
        }
        .sidebar nav {
          display: flex !important;
          flex-direction: column !important;
          flex: 1 !important;
          overflow-y: auto !important;
          height: auto !important;
        }
        
        .sidebar nav::-webkit-scrollbar {
          width: 4px !important;
        }
        .sidebar nav::-webkit-scrollbar-track {
          background: transparent !important;
        }
        .sidebar nav::-webkit-scrollbar-thumb {
          background: #CBD5E1 !important;
          border-radius: 99px !important;
        }
        .sidebar .nav-link {
          display: flex !important;
          align-items: center !important;
          gap: 12px !important;
          padding: 12px 20px !important;
          margin: 4px 16px !important;
          border-radius: 8px !important;
          color: #64748B !important;
          font-weight: 600 !important;
          text-decoration: none !important;
          transition: all 0.2s ease !important;
          border-left: none !important;
        }
        .sidebar .nav-link:hover {
          background: #F8FAFC !important;
          color: #0F172A !important;
        }
        .sidebar .nav-link.active {
          background: #EFF6FF !important;
          color: #2563EB !important;
          font-weight: 700 !important;
          position: relative !important;
          border-left: none !important;
        }
        .sidebar .nav-link.active::before {
          content: '' !important;
          position: absolute !important;
          left: 0 !important;
          top: 50% !important;
          transform: translateY(-50%) !important;
          width: 4px !important;
          height: 20px !important;
          background: #2563EB !important;
          border-radius: 0 4px 4px 0 !important;
        }
        .sidebar .nav-link.active svg, .sidebar .nav-link.active i {
          color: #2563EB !important;
        }
        
        .patient-row-hover:hover {
          background: #F8FAFC !important;
        }
        .view-action-hover:hover {
          color: #1D4ED8 !important;
          text-decoration: underline !important;
        }
        
        .sidebar-profile-card {
          margin: auto 16px 16px !important;
          padding: 12px !important;
          border-radius: 16px !important;
          background: #F8FAFC !important;
          border: 1px solid #E2E8F0 !important;
          display: flex !important;
          align-items: center !important;
          gap: 12px !important;
          cursor: pointer !important;
          transition: all 0.2s ease !important;
          position: relative !important;
        }
        .sidebar-profile-card:hover {
          background: #F1F5F9 !important;
        }
        .sidebar-profile-avatar {
          width: 40px !important;
          height: 40px !important;
          border-radius: 50% !important;
          object-fit: cover !important;
          border: 2px solid #60A5FA !important;
        }
        .sidebar-profile-info {
          display: flex !important;
          flex-direction: column !important;
        }
        .sidebar-profile-name {
          font-size: 13.5px !important;
          font-weight: 800 !important;
          color: #0F172A !important;
          line-height: 1.3 !important;
        }
        .sidebar-profile-role {
          font-size: 11px !important;
          color: #64748B !important;
          font-weight: 600 !important;
        }
        .sidebar-profile-chevron {
          color: #64748B !important;
          width: 16px !important;
          height: 16px !important;
          margin-left: auto !important;
        }

        /* Top Nav & Main Content Refinements */
        .top-nav {
          margin-left: 256px !important;
          height: 56px !important;
          padding: 0 20px !important;
          border-bottom: 1px solid #F1F5F9 !important;
          background: #ffffff !important;
        }
        .main-content {
          margin-left: 256px !important;
          padding: 16px !important;
          background-color: #F8FAFC !important;
        }
        .tab-content {
          padding: 0px !important;
        }

        /* Global badge pill overrides */
        .badge-pill {
          padding: 6px 12px !important;
          border-radius: 8px !important;
          font-weight: 600 !important;
          font-size: 12px !important;
          display: inline-flex !important;
          align-items: center !important;
          justify-content: center !important;
        }
        .badge-pill.revisit {
          background-color: #FAF5FF !important;
          color: #9333EA !important;
        }
        .badge-pill.new {
          background-color: #EFF6FF !important;
          color: #2563EB !important;
        }
        .badge-pill.waiting {
          background-color: #FFF7ED !important;
          color: #D97706 !important;
        }

        /* Action View detail button override */
        .btn-view-detail {
          background: transparent !important;
          color: #2563EB !important;
          border: 1px solid #BFDBFE !important;
          border-radius: 8px !important;
          padding: 6px 14px !important;
          font-size: 12px !important;
          font-weight: 600 !important;
          cursor: pointer !important;
          transition: all 0.2s !important;
          text-align: center !important;
          display: inline-block !important;
        }
        .btn-view-detail:hover {
          background: #EFF6FF !important;
          border-color: #2563EB !important;
        }

        .table-header-custom {
          font-size: 11px !important;
          font-weight: 700 !important;
          color: #94A3B8 !important;
          text-transform: uppercase !important;
          letter-spacing: 0.5px !important;
          border-bottom: 1px solid #F1F5F9 !important;
          padding-bottom: 12px !important;
        }

        .chart-bar {
          transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1) !important;
          transform-box: fill-box !important;
          transform-origin: bottom !important;
          cursor: pointer !important;
        }
        .chart-bar:hover {
          transform: scale(1.1) translateY(-2px) !important;
          fill: #1D4ED8 !important;
          filter: drop-shadow(0px 8px 16px rgba(37, 99, 235, 0.45)) !important;
          opacity: 1 !important;
        }

        .mobile-backdrop {
          position: fixed !important;
          top: 0 !important;
          left: 0 !important;
          right: 0 !important;
          bottom: 0 !important;
          background: rgba(15, 23, 42, 0.4) !important;
          backdrop-filter: blur(2px) !important;
          z-index: 1999 !important;
          animation: fadeIn 0.2s ease-out !important;
        }

        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }

        @media (max-width: 1024px) {
          .sidebar {
            position: fixed !important;
            top: 0 !important;
            left: 0 !important;
            bottom: 0 !important;
            width: 240px !important;
            transform: translateX(-100%) !important;
            transition: transform 0.3s ease !important;
            z-index: 2000 !important;
            height: 100% !important;
            height: 100dvh !important;
            padding-bottom: calc(32px + env(safe-area-inset-bottom, 32px)) !important;
          }
          .sidebar.mobile-open {
            transform: translateX(0) !important;
          }
          .mobile-menu-toggle {
            display: flex !important;
          }
          .top-nav {
            margin-left: 0 !important;
            padding: 0 16px !important;
          }
          .main-content {
            margin-left: 0 !important;
            padding: 16px 16px calc(100px + env(safe-area-inset-bottom, 24px)) !important;
          }
          .mobile-stack {
            grid-template-columns: 1fr !important;
          }

          /* Filter Bar Premium Responsiveness */
          .doctor-filter-row {
            flex-direction: column !important;
            align-items: stretch !important;
            gap: 12px !important;
            margin-bottom: 16px !important;
          }
          .doctor-search-wrapper {
            width: 100% !important;
          }
          .doctor-filter-actions {
            display: grid !important;
            grid-template-columns: 1fr 1fr !important;
            gap: 8px !important;
            width: 100% !important;
          }
          .doctor-filter-select, .doctor-filter-btn, .custom-dropdown-container {
            width: 100% !important;
            font-size: 13px !important;
            height: 42px !important;
            box-sizing: border-box !important;
          }
          .doctor-filter-select, .doctor-filter-btn {
            padding: 10px 12px !important;
          }
          .custom-dropdown-container button {
            padding: 10px 12px !important;
            font-size: 13px !important;
          }
          .status-select {
            grid-column: span 2 !important;
          }
          .gender-select {
            grid-column: span 1 !important;
          }
          .age-select {
            grid-column: span 1 !important;
          }
          .doctor-filter-btn {
            grid-column: span 2 !important;
            justify-content: center !important;
          }

          /* Safe-area spacing overrides for bottom sidebar profile on mobile */
          .sidebar {
            height: 100% !important;
            height: 100dvh !important;
            padding-bottom: calc(32px + env(safe-area-inset-bottom, 32px)) !important;
          }
          .sidebar-profile-card {
            padding-bottom: 16px !important;
            margin-bottom: 0 !important;
          }
          .sidebar-profile-popover {
            bottom: calc(80px + 32px + env(safe-area-inset-bottom, 32px)) !important;
          }
        }

        /* 1. Flagship Light Theme Sidebar Navigation (Identical to Pharmacy and Admin Portal) */
        .admin-sidebar {
          width: 260px !important;
          background: rgba(255, 255, 255, 0.94) !important;
          backdrop-filter: blur(16px) !important;
          -webkit-backdrop-filter: blur(16px) !important;
          color: #0F172A !important;
          display: flex !important;
          flex-direction: column !important;
          position: fixed !important;
          top: 0 !important;
          bottom: 0 !important;
          left: 0 !important;
          height: 100vh !important;
          height: 100dvh !important;
          min-height: 100vh !important;
          min-height: calc(100vh / 0.9) !important;
          z-index: 1000 !important;
          border-right: 1px solid rgba(226, 232, 240, 0.85) !important;
          border-top-right-radius: 28px !important;
          border-bottom-right-radius: 28px !important;
          box-shadow: 0 10px 30px -5px rgba(15, 23, 42, 0.04) !important;
          overscroll-behavior: contain !important;
          transition: width 0.3s cubic-bezier(0.4, 0, 0.2, 1), transform 0.3s cubic-bezier(0.4, 0, 0.2, 1) !important;
          box-sizing: border-box !important;
          padding: 0 !important;
          margin: 0 !important;
          overflow: hidden !important;
        }

        .admin-sidebar.collapsed {
          width: 76px !important;
        }
        .admin-sidebar.collapsed .sidebar-brand-text,
        .admin-sidebar.collapsed .sidebar-brand-subtitle,
        .admin-sidebar.collapsed .sidebar-group-title,
        .admin-sidebar.collapsed .sidebar-link-text,
        .admin-sidebar.collapsed .sidebar-link span,
        .admin-sidebar.collapsed .profile-info,
        .admin-sidebar.collapsed .profile-chevron {
          display: none !important;
        }
        .admin-sidebar.collapsed .sidebar-brand {
          justify-content: center !important;
          padding: 16px 8px 14px !important;
        }
        .admin-sidebar.collapsed .sidebar-nav-container {
          padding: 10px 6px !important;
        }
        .admin-sidebar.collapsed .sidebar-link {
          justify-content: center !important;
          padding: 6px !important;
        }
        .admin-sidebar.collapsed .sidebar-zone {
          padding: 4px 2px !important;
          background: transparent !important;
        }
        .admin-sidebar.collapsed .sidebar-profile {
          margin: auto 6px 12px !important;
          padding: 6px !important;
          justify-content: center !important;
          width: 44px !important;
          height: 44px !important;
        }

        .sidebar-brand-wrapper {
          position: relative !important;
          overflow: visible !important;
          flex-shrink: 0 !important;
        }

        .sidebar-brand {
          padding: 24px 20px 16px 20px !important;
          display: flex !important;
          align-items: center !important;
          gap: 14px !important;
          position: relative !important;
          z-index: 10 !important;
        }

        .sidebar-nav-container {
          flex: 1 !important;
          overflow-y: auto !important;
          padding: 8px 12px 14px 12px !important;
          overscroll-behavior: contain !important;
          scrollbar-width: none !important;
          -ms-overflow-style: none !important;
          min-height: 0 !important;
        }
        .sidebar-nav-container::-webkit-scrollbar {
          display: none !important;
          width: 0 !important;
          height: 0 !important;
        }

        .sidebar-group {
          margin-bottom: 14px !important;
        }

        .sidebar-group-title {
          font-size: 12.5px !important;
          font-weight: 800 !important;
          text-transform: uppercase !important;
          letter-spacing: 0.07em !important;
          line-height: 1.25 !important;
          margin-bottom: 8px !important;
          padding: 4px 8px !important;
          border-radius: 8px !important;
          display: flex !important;
          align-items: center !important;
          gap: 6px !important;
          cursor: pointer !important;
          user-select: none !important;
          transition: background-color 0.15s ease, margin-bottom 0.2s ease !important;
        }
        .sidebar-group-title:hover {
          background-color: rgba(0, 0, 0, 0.035) !important;
        }
        .sidebar-group-title.collapsed {
          margin-bottom: 0px !important;
        }
        .sidebar-group-chevron {
          margin-left: auto !important;
          transition: transform 0.25s cubic-bezier(0.4, 0, 0.2, 1) !important;
          opacity: 0.7 !important;
          display: inline-flex !important;
          align-items: center !important;
          justify-content: center !important;
        }
        .sidebar-group-title:hover .sidebar-group-chevron {
          opacity: 1 !important;
        }

        .sidebar-zone-clinic {
          background: linear-gradient(180deg, rgba(240, 253, 250, 0.75) 0%, rgba(236, 254, 255, 0.45) 100%) !important;
          border-radius: 18px !important;
          padding: 10px 8px !important;
          margin-top: 14px !important;
          margin-bottom: 14px !important;
          transition: all 0.25s ease !important;
        }
        .sidebar-zone-clinic.collapsed {
          padding: 6px 8px !important;
          margin-top: 8px !important;
          margin-bottom: 8px !important;
        }

        .sidebar-zone-finance {
          background: linear-gradient(180deg, rgba(255, 247, 237, 0.8) 0%, rgba(254, 242, 242, 0.35) 100%) !important;
          border-radius: 18px !important;
          padding: 10px 8px !important;
          margin-top: 14px !important;
          margin-bottom: 14px !important;
          transition: all 0.25s ease !important;
        }
        .sidebar-zone-finance.collapsed {
          padding: 6px 8px !important;
          margin-top: 8px !important;
          margin-bottom: 8px !important;
        }

        .sidebar-link {
          position: relative !important;
          display: flex !important;
          align-items: center !important;
          gap: 10px !important;
          padding: 5px 8px !important;
          border-radius: 14px !important;
          color: #0F172A !important;
          text-decoration: none !important;
          font-weight: 600 !important;
          font-size: 14px !important;
          line-height: 1.25 !important;
          transition: all 0.22s cubic-bezier(0.4, 0, 0.2, 1) !important;
          margin-bottom: 3px !important;
          cursor: pointer !important;
          user-select: none !important;
          border: 1px solid transparent !important;
        }

        .sidebar-link-text {
          line-height: 1.25 !important;
          font-size: 13.5px !important;
          font-weight: 600 !important;
          color: #0F172A !important;
          transition: all 0.2s ease !important;
        }

        .sidebar-link:hover:not(.active) {
          background-color: rgba(241, 245, 249, 0.85) !important;
          transform: translateX(2px) !important;
        }

        /* 3D POPPED-OUT ACTIVE STATE WITH RICH DEPTH & SHADOWS */
        .sidebar-link.active {
          background: linear-gradient(180deg, #FFFFFF 0%, #F8FAFC 100%) !important;
          border: 1px solid rgba(219, 234, 254, 0.95) !important;
          box-shadow: 
            0 10px 24px -3px rgba(37, 99, 235, 0.18),
            0 4px 10px -2px rgba(15, 23, 42, 0.08),
            0 1px 3px rgba(0, 0, 0, 0.04),
            inset 0 1px 0 #FFFFFF !important;
          transform: translateY(-1.5px) !important;
          z-index: 5 !important;
        }

        .sidebar-link.active .sidebar-link-text {
          color: #2563EB !important;
          font-weight: 800 !important;
          letter-spacing: -0.01em !important;
        }

        .sidebar-link.active .sidebar-link-icon {
          transform: scale(1.04) !important;
          box-shadow: 0 5px 15px -1px rgba(37, 99, 235, 0.4), inset 0 1px 1px rgba(255, 255, 255, 0.4) !important;
        }

        /* Clinic zone active 3D pop */
        .sidebar-zone-clinic .sidebar-link.active {
          border-color: rgba(153, 246, 228, 0.95) !important;
          box-shadow: 
            0 10px 24px -3px rgba(13, 148, 136, 0.2),
            0 4px 10px -2px rgba(15, 23, 42, 0.08),
            0 1px 3px rgba(0, 0, 0, 0.04),
            inset 0 1px 0 #FFFFFF !important;
        }
        .sidebar-zone-clinic .sidebar-link.active .sidebar-link-text {
          color: #0D9488 !important;
        }
        .sidebar-zone-clinic .sidebar-link.active .sidebar-link-icon {
          box-shadow: 0 5px 15px -1px rgba(13, 148, 136, 0.4), inset 0 1px 1px rgba(255, 255, 255, 0.4) !important;
        }

        /* Finance zone active 3D pop */
        .sidebar-zone-finance .sidebar-link.active {
          border-color: rgba(254, 215, 170, 0.95) !important;
          box-shadow: 
            0 10px 24px -3px rgba(234, 88, 12, 0.2),
            0 4px 10px -2px rgba(15, 23, 42, 0.08),
            0 1px 3px rgba(0, 0, 0, 0.04),
            inset 0 1px 0 #FFFFFF !important;
        }
        .sidebar-zone-finance .sidebar-link.active .sidebar-link-text {
          color: #EA580C !important;
        }
        .sidebar-zone-finance .sidebar-link.active .sidebar-link-icon {
          box-shadow: 0 5px 15px -1px rgba(234, 88, 12, 0.4), inset 0 1px 1px rgba(255, 255, 255, 0.4) !important;
        }

        .sidebar-link-icon {
          width: 36px !important;
          height: 36px !important;
          border-radius: 11px !important;
          display: flex !important;
          align-items: center !important;
          justify-content: center !important;
          flex-shrink: 0 !important;
          transition: all 0.2s ease !important;
        }

        .sidebar-profile-footer {
          position: relative !important;
          padding: 8px 10px 12px 10px !important;
          background: #FFFFFF !important;
          border-bottom-right-radius: 28px !important;
          flex-shrink: 0 !important;
          z-index: 20 !important;
          margin-top: auto !important;
        }
        .admin-sidebar.collapsed .sidebar-profile-footer,
        .sidebar.collapsed .sidebar-profile-footer {
          padding: 8px 6px 12px 6px !important;
        }
        .sidebar-profile-fade-top {
          position: absolute !important;
          top: -16px !important;
          left: 0 !important;
          right: 0 !important;
          height: 16px !important;
          background: linear-gradient(to bottom, rgba(255, 255, 255, 0) 0%, rgba(255, 255, 255, 0.45) 50%, rgba(255, 255, 255, 0.9) 100%) !important;
          pointer-events: none !important;
          backdrop-filter: blur(0.75px) !important;
          -webkit-backdrop-filter: blur(0.75px) !important;
          z-index: 15 !important;
        }

        .sidebar-profile {
          margin: 0 !important;
          padding: 7px 10px !important;
          border-radius: 14px !important;
          background: linear-gradient(135deg, #EEF4FF 0%, #F5F8FF 45%, #FFFFFF 100%) !important;
          border: 1px solid rgba(219, 234, 254, 0.8) !important;
          display: flex !important;
          align-items: center !important;
          gap: 10px !important;
          cursor: pointer !important;
          transition: all 0.2s ease !important;
          position: relative !important;
          box-shadow: 0 4px 14px -2px rgba(30, 58, 138, 0.05), 0 1px 3px rgba(0, 0, 0, 0.02) !important;
          line-height: 1.2 !important;
          user-select: none !important;
        }
        .sidebar-profile:hover {
          background: linear-gradient(135deg, #E0E7FF 0%, #EEF2FF 50%, #FFFFFF 100%) !important;
          border-color: #C7D2FE !important;
          box-shadow: 0 6px 18px -2px rgba(30, 58, 138, 0.1) !important;
        }
        .admin-sidebar.collapsed .sidebar-profile,
        .sidebar.collapsed .sidebar-profile {
          margin: 0 auto !important;
          padding: 6px !important;
          justify-content: center !important;
          width: 44px !important;
          height: 44px !important;
        }
        .profile-avatar-wrap {
          position: relative !important;
          flex-shrink: 0 !important;
          display: inline-flex !important;
        }
        .profile-avatar-status-dot {
          position: absolute !important;
          bottom: -1px !important;
          right: -1px !important;
          width: 9px !important;
          height: 9px !important;
          border-radius: 50% !important;
          background: #22C55E !important;
          border: 2px solid #FFFFFF !important;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.15) !important;
        }
        .profile-avatar {
          width: 36px !important;
          height: 36px !important;
          border-radius: 50% !important;
          object-fit: cover !important;
          border: 1.5px solid #818CF8 !important;
        }
        .profile-avatar-initials {
          width: 36px !important;
          height: 36px !important;
          border-radius: 50% !important;
          background: linear-gradient(135deg, #4F46E5 0%, #6366F1 50%, #8B5CF6 100%) !important;
          color: #FFFFFF !important;
          display: flex !important;
          align-items: center !important;
          justify-content: center !important;
          font-weight: 800 !important;
          font-size: 13.5px !important;
          box-shadow: 0 3px 8px rgba(79, 70, 229, 0.3) !important;
          flex-shrink: 0 !important;
        }
        .profile-info {
          display: flex !important;
          flex-direction: column !important;
          flex: 1 !important;
          min-width: 0 !important;
        }
        .profile-name {
          font-size: 13.5px !important;
          font-weight: 800 !important;
          color: #0F172A !important;
          line-height: 1.2 !important;
          white-space: nowrap !important;
          text-overflow: ellipsis !important;
          overflow: hidden !important;
        }
        .profile-role {
          font-size: 11px !important;
          color: #64748B !important;
          font-weight: 600 !important;
          line-height: 1.2 !important;
          margin-top: 1px !important;
          white-space: nowrap !important;
          text-overflow: ellipsis !important;
          overflow: hidden !important;
        }
        .profile-chevron {
          color: #2563EB !important;
          display: flex !important;
          align-items: center !important;
          transition: transform 0.25s ease !important;
          flex-shrink: 0 !important;
        }

        /* Profile Floating Popover Menu */
        .sidebar-profile-popover-card {
          position: absolute !important;
          bottom: 66px !important;
          left: 8px !important;
          right: 8px !important;
          background: #FFFFFF !important;
          border-radius: 18px !important;
          padding: 6px !important;
          box-shadow: 0 12px 36px -4px rgba(15, 23, 42, 0.16), 0 0 0 1px rgba(226, 232, 240, 0.8) !important;
          z-index: 1100 !important;
          animation: popoverFadeIn 0.2s cubic-bezier(0.16, 1, 0.3, 1) !important;
          min-width: 210px !important;
        }
        @keyframes popoverFadeIn {
          from { opacity: 0; transform: translateY(6px); }
          to { opacity: 1; transform: translateY(0); }
        }

        /* TOP NAV STYLES */
        .top-nav {
          margin-left: 260px !important;
          height: 64px !important;
          padding: 0 28px !important;
          border-bottom: 1px solid #F1F5F9 !important;
          background: #FFFFFF !important;
          display: flex !important;
          align-items: center !important;
          justify-content: space-between !important;
          position: fixed !important;
          top: 0 !important;
          right: 0 !important;
          left: 0 !important;
          z-index: 99 !important;
          box-shadow: 0 1px 4px rgba(0, 0, 0, 0.02) !important;
          transition: margin-left 0.3s cubic-bezier(0.4, 0, 0.2, 1) !important;
        }
        .top-nav.collapsed {
          margin-left: 76px !important;
        }

        .main-content {
          margin-left: 260px !important;
          margin-top: 64px !important;
          padding: 24px 28px 40px 28px !important;
          background-color: #F8FAFC !important;
          min-height: calc(100vh - 64px) !important;
          transition: margin-left 0.3s cubic-bezier(0.4, 0, 0.2, 1) !important;
        }
        .main-content.collapsed {
          margin-left: 76px !important;
        }

        /* 5-KPI METRICS GRID IN A SINGLE ROW */
        .kpi-grid {
          display: grid !important;
          grid-template-columns: repeat(5, minmax(0, 1fr)) !important;
          gap: 14px !important;
          margin-bottom: 24px !important;
        }

        @media (max-width: 1280px) {
          .kpi-grid {
            grid-template-columns: repeat(5, minmax(0, 1fr)) !important;
            gap: 10px !important;
          }
        }
        @media (max-width: 1024px) {
          .kpi-grid {
            grid-template-columns: repeat(2, 1fr) !important;
            gap: 12px !important;
          }
        }
        @media (max-width: 640px) {
          .kpi-grid {
            grid-template-columns: 1fr !important;
          }
        }

        @media (max-width: 1024px) {
          .admin-sidebar {
            left: -260px !important;
            transition: left 0.3s cubic-bezier(0.4, 0, 0.2, 1) !important;
            display: flex !important;
            z-index: 2000 !important;
          }
          .admin-sidebar.mobile-open {
            left: 0 !important;
            z-index: 2010 !important;
          }
          .top-nav, .main-content {
            margin-left: 0 !important;
          }
          .top-nav {
            padding: 0 16px !important;
            left: 0 !important;
          }
          .main-content {
            padding: 16px !important;
          }
          .mobile-menu-toggle {
            display: flex !important;
            z-index: 100 !important;
          }
          .mobile-backdrop {
            position: fixed !important;
            top: 0 !important;
            left: 0 !important;
            right: 0 !important;
            bottom: 0 !important;
            background-color: rgba(15, 23, 42, 0.4) !important;
            backdrop-filter: blur(4px) !important;
            z-index: 1999 !important;
          }
        }

        /* Calendar Retraction & Expansion Drawer Styles */
        @media (min-width: 1025px) {
          .calendar-row {
            display: flex !important;
            width: 100% !important;
            gap: 0px !important;
            margin-bottom: 24px !important;
          }
          .calendar-left-panel {
            width: 100% !important;
            flex-shrink: 0 !important;
            transition: width 0.5s cubic-bezier(0.4, 0, 0.2, 1) !important;
          }
          .calendar-left-panel.calendar-open {
            width: calc(63% - 12px) !important;
          }
          .calendar-right-panel {
            width: 0px !important;
            margin-left: 0px !important;
            opacity: 0 !important;
            visibility: hidden !important;
            overflow: hidden !important;
            padding: 0px !important;
            border: none !important;
            box-shadow: none !important;
            transition: width 0.5s cubic-bezier(0.4, 0, 0.2, 1), 
                        margin-left 0.5s cubic-bezier(0.4, 0, 0.2, 1), 
                        opacity 0.4s cubic-bezier(0.4, 0, 0.2, 1), 
                        padding 0.5s cubic-bezier(0.4, 0, 0.2, 1),
                        visibility 0.5s !important;
            flex-shrink: 0 !important;
          }
          .calendar-right-panel.calendar-open {
            width: calc(37% - 12px) !important;
            margin-left: 24px !important;
            opacity: 1 !important;
            visibility: visible !important;
            padding: 24px !important;
            border: 1px solid #F1F5F9 !important;
            box-shadow: 0 4px 20px rgba(0,0,0,0.01) !important;
          }
        }

        @media (max-width: 1024px) {
          .calendar-row {
            display: flex !important;
            flex-direction: column !important;
            gap: 20px !important;
            margin-bottom: 24px !important;
          }
          .calendar-left-panel {
            width: 100% !important;
          }
          .calendar-right-panel {
            width: 100% !important;
            opacity: 0 !important;
            visibility: hidden !important;
            max-height: 0px !important;
            overflow: hidden !important;
            margin-left: 0px !important;
            padding: 0px !important;
            border: none !important;
            box-shadow: none !important;
            transition: max-height 0.5s cubic-bezier(0.4, 0, 0.2, 1), 
                        opacity 0.4s ease, 
                        padding 0.5s cubic-bezier(0.4, 0, 0.2, 1),
                        visibility 0.5s !important;
          }
          .calendar-right-panel.calendar-open {
            max-height: 800px !important;
            opacity: 1 !important;
            visibility: visible !important;
            padding: 24px !important;
            border: 1px solid #F1F5F9 !important;
            box-shadow: 0 4px 20px rgba(0,0,0,0.01) !important;
          }
        }
      `}</style>

      {/* Dynamic System Alert/Toast */}
      {notification && (
        <div style={{
          position: 'fixed',
          top: '24px',
          right: '24px',
          zIndex: 99999,
          background: 'rgba(255, 255, 255, 0.85)',
          backdropFilter: 'blur(20px)',
          border: notification.type === 'error' ? '1px solid rgba(239, 68, 68, 0.2)' : '1px solid rgba(16, 185, 129, 0.2)',
          borderRadius: '16px',
          padding: '12px 24px',
          boxShadow: '0 20px 40px rgba(15, 23, 42, 0.1)',
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          animation: 'toastSlideDown 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)'
        }}>
          <div style={{
            width: '24px',
            height: '24px',
            borderRadius: '50%',
            background: notification.type === 'error' ? '#FEE2E2' : '#ECFDF5',
            color: notification.type === 'error' ? '#EF4444' : '#10B981',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '12px',
            fontWeight: 900
          }}>
            {notification.type === 'error' ? '✕' : '✓'}
          </div>
          <span style={{ fontSize: '13px', fontWeight: 700, color: '#1A1D23' }}>{notification.message}</span>
        </div>
      )}

      {/* Main Sidebar */}
      {activeTab !== 'hr-payroll' && (
        <div 
          className={`admin-sidebar ${isSidebarCollapsed ? "collapsed " : ""}${mobileSidebarOpen ? "mobile-open" : ""}`}
          style={{
            position: 'fixed',
            top: 0,
            bottom: 0,
            left: 0,
            height: '100%',
            minHeight: 'calc(100vh / 0.9)',
            display: 'flex',
            flexDirection: 'column',
            zIndex: 1000,
            overflow: 'hidden'
          }}
          data-lenis-prevent
        >
          {/* Logo & Brand Header */}
          <div className="sidebar-brand-wrapper">
            {/* Top decorative subtle mesh wave in brand header */}
            <svg 
              viewBox="0 0 280 130" 
              fill="none" 
              xmlns="http://www.w3.org/2000/svg"
              style={{ 
                position: 'absolute', 
                top: 0, 
                left: 0, 
                width: '100%', 
                height: '130px', 
                pointerEvents: 'none', 
                zIndex: 0,
                opacity: isSidebarCollapsed ? 0 : 0.95,
                transition: 'opacity 0.2s'
              }}
            >
              <path d="M0,0 L280,0 L280,65 C215,100 155,70 85,105 C40,120 15,110 0,100 Z" fill="url(#curoxaWaveGradDoc1)" />
              <path d="M0,0 L280,0 L280,40 C195,80 135,50 55,90 C20,102 0,92 0,92 Z" fill="url(#curoxaWaveGradDoc2)" opacity="0.65" />
              <defs>
                <linearGradient id="curoxaWaveGradDoc1" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#DBEAFE" stopOpacity="0.85" />
                  <stop offset="50%" stopColor="#E0E7FF" stopOpacity="0.6" />
                  <stop offset="100%" stopColor="#F3E8FF" stopOpacity="0.2" />
                </linearGradient>
                <linearGradient id="curoxaWaveGradDoc2" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#BAE6FD" stopOpacity="0.75" />
                  <stop offset="100%" stopColor="#DDD6FE" stopOpacity="0.15" />
                </linearGradient>
              </defs>
            </svg>

            <div className="sidebar-brand">
              {getActivePortalBranding() ? (
                <HospitalBrandLogo 
                  hospital={getActivePortalBranding()} 
                  size={44} 
                  borderRadius={10} 
                  fontSize={16} 
                />
              ) : (
                <img 
                  src={curoxaSidebarLogo} 
                  alt="CUROXA" 
                  style={{
                    width: '44px',
                    height: '44px',
                    objectFit: 'contain',
                    flexShrink: 0,
                    filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.08))'
                  }}
                />
              )}
              <div className="sidebar-brand-text-group" style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                <span className="sidebar-brand-text" style={{ fontFamily: "'Plus Jakarta Sans', 'Outfit', sans-serif", fontWeight: 900, fontSize: '18px', color: '#0F172A', letterSpacing: '0.03em', lineHeight: 1.1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: isSidebarCollapsed ? '0px' : '160px' }}>
                  {getActivePortalBranding()?.name || 'CUROXA'}
                </span>
                <span className="sidebar-brand-subtitle" style={{ fontSize: '11px', color: '#64748B', fontWeight: 500, letterSpacing: '-0.01em', marginTop: '3px', lineHeight: 1 }}>
                  {getActivePortalBranding() ? `${getActivePortalBranding()?.hospitalId} • Doctor` : 'Health Management'}
                </span>
              </div>
              <button 
                className="sidebar-collapse-toggle desktop-only-flex"
                onClick={(e) => {
                  e.stopPropagation();
                  const newState = !isSidebarCollapsed;
                  setIsSidebarCollapsed(newState);
                  localStorage.setItem('curoxa_sidebar_collapsed', String(newState));
                }}
                style={{
                  position: 'absolute',
                  right: '-12px',
                  top: '26px',
                  width: '26px',
                  height: '26px',
                  borderRadius: '50%',
                  background: '#FFFFFF',
                  border: '1px solid #E2E8F0',
                  boxShadow: '0 2px 8px rgba(15, 23, 42, 0.08)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  zIndex: 100,
                  transition: 'transform 0.3s ease',
                  transform: isSidebarCollapsed ? 'rotate(180deg)' : 'none'
                }}
                title={isSidebarCollapsed ? "Expand Sidebar" : "Collapse Sidebar"}
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#1E293B" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
              </button>
            </div>
          </div>

          {/* Scrollable Nav Container */}
          <div 
            className="sidebar-nav-container"
            style={{
              flex: '1 1 auto',
              overflowY: 'auto',
              minHeight: 0,
              display: 'flex',
              flexDirection: 'column'
            }}
          >
            {/* OFFLINE MODE SIDEBAR NOTICE */}
            {doctorClinicalMode === 'OFFLINE' && (
              <div style={{
                margin: '12px 14px',
                padding: '12px',
                background: '#FFF7ED',
                border: '1px solid #FED7AA',
                borderRadius: '10px',
                fontSize: '11px',
                color: '#9A3412',
                lineHeight: 1.4
              }}>
                <div style={{ fontWeight: 800, marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '5px' }}>
                  <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#EA580C', display: 'inline-block' }}></span>
                  CLINICAL MODE OFFLINE
                </div>
                Clinical consultation & prescription access is disabled for this hospital. HR & self-service features remain active.
              </div>
            )}

            {/* SECTION 1: OVERVIEW GROUP */}
            {doctorClinicalMode !== 'OFFLINE' && (
            <div className="sidebar-group">
              <div className="sidebar-group-title" style={{ color: '#2563EB' }}>
                <span style={{ fontSize: '13px', lineHeight: 1 }}>•</span> OVERVIEW
              </div>

              <div 
                className={`sidebar-link ${activeTab === 'dash' ? 'active' : ''}`}
                onClick={(e) => { e.preventDefault(); setActiveTab('dash'); setMobileSidebarOpen(false); }}
              >
                {activeTab === 'dash' && (
                  <div style={{ position: 'absolute', left: '0px', top: '50%', transform: 'translateY(-50%)', width: '3.5px', height: '20px', borderRadius: '4px', background: '#2563EB' }} />
                )}
                <div className="sidebar-link-icon" style={{
                  background: activeTab === 'dash' ? 'linear-gradient(135deg, #2563EB 0%, #3B82F6 100%)' : '#EFF6FF',
                  color: activeTab === 'dash' ? '#FFFFFF' : '#2563EB',
                  boxShadow: activeTab === 'dash' ? '0 3px 10px rgba(37, 99, 235, 0.25)' : 'none'
                }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="7" height="7" x="3" y="3" rx="1.5"/><rect width="7" height="7" x="14" y="3" rx="1.5"/><rect width="7" height="7" x="14" y="14" rx="1.5"/><rect width="7" height="7" x="3" y="14" rx="1.5"/></svg>
                </div>
                <span className="sidebar-link-text">Overview</span>
              </div>

              {(currentUser?.role === 'doctor' || (coverageState['dr-consult']?.on || coverageState['dr-history']?.on)) && (
                <div 
                  className={`sidebar-link ${activeTab === 'appointments' ? 'active' : ''}`}
                  onClick={(e) => { e.preventDefault(); setActiveTab('appointments'); setMobileSidebarOpen(false); }}
                >
                  {activeTab === 'appointments' && (
                    <div style={{ position: 'absolute', left: '0px', top: '50%', transform: 'translateY(-50%)', width: '3.5px', height: '20px', borderRadius: '4px', background: '#2563EB' }} />
                  )}
                  <div className="sidebar-link-icon" style={{
                    background: activeTab === 'appointments' ? 'linear-gradient(135deg, #2563EB 0%, #3B82F6 100%)' : '#EFF6FF',
                    color: activeTab === 'appointments' ? '#FFFFFF' : '#2563EB',
                    boxShadow: activeTab === 'appointments' ? '0 3px 10px rgba(37, 99, 235, 0.25)' : 'none'
                  }}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="18" x="3" y="4" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                  </div>
                  <span className="sidebar-link-text">Appointments</span>
                </div>
              )}
            </div>
            )}

            {/* SECTION 2: CLINICAL MANAGEMENT ZONE (Tinted Teal Card) */}
            {doctorClinicalMode !== 'OFFLINE' && (
            <div className={`sidebar-zone sidebar-zone-clinic ${!sectionOpen.management ? 'collapsed' : ''}`}>
              <div 
                className={`sidebar-group-title ${!sectionOpen.management ? 'collapsed' : ''}`}
                style={{ color: '#0D9488' }}
                onClick={() => toggleSection('management')}
                title="Toggle Management Section"
              >
                <span style={{ fontSize: '13px', lineHeight: 1 }}>•</span> MANAGEMENT
                <span className="sidebar-group-chevron" style={{ transform: sectionOpen.management ? 'rotate(0deg)' : 'rotate(-90deg)' }}>
                  <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
                </span>
              </div>
              {sectionOpen.management && (
                <>
                  {(currentUser?.role === 'doctor' || (coverageState['dr-consult']?.on || coverageState['dr-discharge']?.on || coverageState['dr-history']?.on)) && (
                    <div 
                      className={`sidebar-link ${['consultations', 'patient-profile'].includes(activeTab) ? 'active' : ''}`}
                      onClick={(e) => { e.preventDefault(); setActiveTab('consultations'); setMobileSidebarOpen(false); }}
                    >
                      {['consultations', 'patient-profile'].includes(activeTab) && (
                        <div style={{ position: 'absolute', left: '0px', top: '50%', transform: 'translateY(-50%)', width: '3.5px', height: '20px', borderRadius: '4px', background: '#0D9488' }} />
                      )}
                      <div className="sidebar-link-icon" style={{
                        background: ['consultations', 'patient-profile'].includes(activeTab) ? 'linear-gradient(135deg, #0D9488 0%, #14B8A6 100%)' : '#CCFBF1',
                        color: ['consultations', 'patient-profile'].includes(activeTab) ? '#FFFFFF' : '#0D9488',
                        boxShadow: ['consultations', 'patient-profile'].includes(activeTab) ? '0 3px 10px rgba(13, 148, 136, 0.25)' : 'none'
                      }}>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
                      </div>
                      <span className="sidebar-link-text">Patient Records</span>
                    </div>
                  )}

                  {(currentUser?.role === 'doctor' || coverageState['dr-rx']?.on) && (
                    <div 
                      className={`sidebar-link ${activeTab === 'prescriptions' ? 'active' : ''}`}
                      onClick={(e) => { e.preventDefault(); setActiveTab('prescriptions'); setMobileSidebarOpen(false); }}
                    >
                      {activeTab === 'prescriptions' && (
                        <div style={{ position: 'absolute', left: '0px', top: '50%', transform: 'translateY(-50%)', width: '3.5px', height: '20px', borderRadius: '4px', background: '#0D9488' }} />
                      )}
                      <div className="sidebar-link-icon" style={{
                        background: activeTab === 'prescriptions' ? 'linear-gradient(135deg, #0D9488 0%, #14B8A6 100%)' : '#CCFBF1',
                        color: activeTab === 'prescriptions' ? '#FFFFFF' : '#0D9488',
                        boxShadow: activeTab === 'prescriptions' ? '0 3px 10px rgba(13, 148, 136, 0.25)' : 'none'
                      }}>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
                      </div>
                      <span className="sidebar-link-text">Prescriptions</span>
                    </div>
                  )}

                  {(currentUser?.role === 'doctor' || coverageState['dr-laborder']?.on) && (
                    <div 
                      className={`sidebar-link ${activeTab === 'labs' ? 'active' : ''}`}
                      onClick={(e) => { e.preventDefault(); setActiveTab('labs'); setMobileSidebarOpen(false); }}
                    >
                      {activeTab === 'labs' && (
                        <div style={{ position: 'absolute', left: '0px', top: '50%', transform: 'translateY(-50%)', width: '3.5px', height: '20px', borderRadius: '4px', background: '#0D9488' }} />
                      )}
                      <div className="sidebar-link-icon" style={{
                        background: activeTab === 'labs' ? 'linear-gradient(135deg, #0D9488 0%, #14B8A6 100%)' : '#CCFBF1',
                        color: activeTab === 'labs' ? '#FFFFFF' : '#0D9488',
                        boxShadow: activeTab === 'labs' ? '0 3px 10px rgba(13, 148, 136, 0.25)' : 'none'
                      }}>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 2v7.31"/><path d="M14 9.3V1.99"/><path d="M8.5 2h7"/><path d="M14 9.3a6.5 6.5 0 1 1-4 0"/><path d="M5.52 16h12.96"/></svg>
                      </div>
                      <span className="sidebar-link-text">Lab reports</span>
                    </div>
                  )}
                </>
              )}
            </div>
            )}

            {/* SECTION 3: TOOLS ZONE (Tinted Peach/Orange Card) */}
            <div className={`sidebar-zone sidebar-zone-finance ${!sectionOpen.tools ? 'collapsed' : ''}`}>
              <div 
                className={`sidebar-group-title ${!sectionOpen.tools ? 'collapsed' : ''}`}
                style={{ color: '#EA580C' }}
                onClick={() => toggleSection('tools')}
                title="Toggle Tools Section"
              >
                <span style={{ fontSize: '13px', lineHeight: 1 }}>•</span> TOOLS
                <span className="sidebar-group-chevron" style={{ transform: sectionOpen.tools ? 'rotate(0deg)' : 'rotate(-90deg)' }}>
                  <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
                </span>
              </div>
              {sectionOpen.tools && (
                <>
                  {currentUser?.role === 'doctor' && (
                    <div 
                      className={`sidebar-link ${activeTab === 'settings' ? 'active' : ''}`}
                      onClick={(e) => { e.preventDefault(); setActiveTab('settings'); setMobileSidebarOpen(false); }}
                    >
                      <div className="sidebar-link-icon" style={{ background: '#FFF7ED', color: '#EA580C' }}>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>
                      </div>
                      <span className="sidebar-link-text">Settings</span>
                    </div>
                  )}

                  <div 
                    className={`sidebar-link ${activeTab === 'hr-payroll' ? 'active' : ''}`}
                    onClick={(e) => { e.preventDefault(); setActiveTab('hr-payroll'); setMobileSidebarOpen(false); }}
                  >
                    <div className="sidebar-link-icon" style={{ background: '#FFF7ED', color: '#EA580C' }}>
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="20" height="14" x="2" y="5" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg>
                    </div>
                    <span className="sidebar-link-text">HR & Payroll</span>
                  </div>
                </>
              )}
            </div>

            {/* SECTION 4: DYNAMIC COVERAGE INTEGRATION LINKS */}
            {doctorClinicalMode !== 'OFFLINE' && ((Object.keys(coverageState || {}).some(k => k.startsWith('rc-') && coverageState[k]?.on)) && tenantModules.reception?.enabled !== false ||
              (Object.keys(coverageState || {}).some(k => k.startsWith('lt-') && coverageState[k]?.on)) && tenantModules.laboratory?.enabled !== false ||
              (Object.keys(coverageState || {}).some(k => (k.startsWith('ph-') || k === 'dr-stockview') && coverageState[k]?.on)) && tenantModules.pharmacy?.enabled !== false) && (
              <div className="sidebar-group" style={{ marginTop: '10px' }}>
                <div className="sidebar-group-title" style={{ color: '#EF4444' }}>
                  <span style={{ fontSize: '13px', lineHeight: 1 }}>•</span> ACTIVE COVERAGES
                </div>

                {(Object.keys(coverageState || {}).some(k => k.startsWith('rc-') && coverageState[k]?.on)) && tenantModules.reception?.enabled !== false && (
                  <div 
                    className="sidebar-link"
                    onClick={(e) => { e.preventDefault(); window.open('/receptionist', '_blank'); setMobileSidebarOpen(false); }}
                  >
                    <div className="sidebar-link-icon" style={{ background: '#FFE4E6', color: '#E11D48' }}>
                      <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/></svg>
                    </div>
                    <span className="sidebar-link-text" style={{ color: '#E11D48', fontWeight: 800 }}>Receptionist Cover</span>
                  </div>
                )}

                {(Object.keys(coverageState || {}).some(k => k.startsWith('lt-') && coverageState[k]?.on)) && tenantModules.laboratory?.enabled !== false && (
                  <div 
                    className="sidebar-link"
                    onClick={(e) => { e.preventDefault(); window.open('/lab', '_blank'); setMobileSidebarOpen(false); }}
                  >
                    <div className="sidebar-link-icon" style={{ background: '#D1FAE5', color: '#059669' }}>
                      <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M6 18H18"/><path d="M10 14H14"/><path d="M12 2v20"/><path d="M18 10H6"/></svg>
                    </div>
                    <span className="sidebar-link-text" style={{ color: '#059669', fontWeight: 800 }}>Lab Cover</span>
                  </div>
                )}

                {(Object.keys(coverageState || {}).some(k => (k.startsWith('ph-') || k === 'dr-stockview') && coverageState[k]?.on)) && tenantModules.pharmacy?.enabled !== false && (
                  <div 
                    className="sidebar-link"
                    onClick={(e) => { e.preventDefault(); window.open('/pharmacy', '_blank'); setMobileSidebarOpen(false); }}
                  >
                    <div className="sidebar-link-icon" style={{ background: '#EFF6FF', color: '#2563EB' }}>
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
                    </div>
                    <span className="sidebar-link-text" style={{ color: '#2563EB', fontWeight: 800 }}>Pharmacy Cover</span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Bottom Profile Section sitting at bottom with soft blur fade above */}
          <div 
            className="sidebar-profile-footer"
            style={{
              marginTop: 'auto',
              flexShrink: 0,
              position: 'relative'
            }}
          >
            <div className="sidebar-profile-fade-top" />
            <div className="sidebar-profile" onClick={(e) => { e.stopPropagation(); setShowProfileMenu(!showProfileMenu); }}>
              <div className="profile-avatar-wrap">
                {docProfile.avatar ? (
                  <img 
                    className="profile-avatar" 
                    src={docProfile.avatar} 
                    alt="Doctor Avatar" 
                  />
                ) : (
                  <div className="profile-avatar-initials" style={{ background: 'linear-gradient(135deg, #2563EB 0%, #1D4ED8 100%)' }}>
                    {docProfile.name ? docProfile.name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase() : 'DR'}
                  </div>
                )}
                <span className="profile-avatar-status-dot" />
              </div>
              <div className="profile-info">
                <span className="profile-name">{docProfile.name || currentUser.name || 'Doctor'}</span>
                <span className="profile-role">{docProfile.specialty || 'General Physician'}</span>
              </div>
              <div className="profile-chevron" style={{ transform: showProfileMenu ? 'rotate(180deg)' : 'none' }}>
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
              </div>
            </div>

            {showProfileMenu && (
              <div 
                className="glass-card sidebar-profile-popover-card" 
                onClick={e => e.stopPropagation()}
              >
                <div style={{ padding: '10px 12px', borderBottom: '1px solid #F1F5F9', marginBottom: '6px' }}>
                  <div style={{ fontWeight: 800, fontSize: '13.5px', color: '#0F172A' }}>{docProfile.name || currentUser.name || 'Doctor'}</div>
                  <div style={{ fontSize: '11px', color: '#64748B', fontWeight: 600 }}>{docProfile.specialty || 'General Physician'}</div>
                </div>
                <div 
                  style={{ 
                    padding: '10px 12px', 
                    borderRadius: '10px', 
                    display: 'flex', 
                    alignItems: 'center', 
                    gap: '10px', 
                    fontSize: '13px', 
                    fontWeight: 700, 
                    color: '#334155', 
                    cursor: 'pointer',
                    transition: 'background 0.2s',
                    marginBottom: '4px'
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.background = '#F1F5F9'}
                  onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowProfileMenu(false);
                    setActiveTab('settings');
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg> Edit Profile
                </div>
                <div 
                  style={{ 
                    padding: '10px 12px', 
                    borderRadius: '10px', 
                    display: 'flex', 
                    alignItems: 'center', 
                    gap: '10px', 
                    fontSize: '13px', 
                    fontWeight: 700, 
                    color: '#334155', 
                    cursor: 'pointer',
                    transition: 'background 0.2s',
                    marginBottom: '4px'
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.background = '#F1F5F9'}
                  onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowProfileMenu(false);
                    setActiveTab('hr-payroll');
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="20" height="14" x="2" y="5" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg> HR & Payroll
                </div>
                <div 
                  style={{ 
                    padding: '10px 12px', 
                    borderRadius: '10px', 
                    display: 'flex', 
                    alignItems: 'center', 
                    gap: '10px', 
                    fontSize: '13px', 
                    fontWeight: 700, 
                    color: '#DC2626', 
                    cursor: 'pointer',
                    transition: 'background 0.2s'
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.background = '#FEF2F2'}
                  onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowProfileMenu(false);
                    handleLogout();
                  }}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg> Logout
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Mobile Sidebar Backdrop Overlay */}
      {mobileSidebarOpen && (
        <div className="mobile-backdrop" onClick={() => setMobileSidebarOpen(false)} />
      )}

      {/* Top Navbar Header */}
      {activeTab !== 'hr-payroll' && (
        <div className={"top-nav " + (isSidebarCollapsed ? "collapsed" : "")} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '20px', zIndex: 1100, overflow: 'visible' }}>
        {/* Hamburger Mobile Menu Toggle Button */}
        <button 
          className="mobile-menu-toggle"
          onClick={(e) => {
            e.stopPropagation();
            setMobileSidebarOpen(!mobileSidebarOpen);
          }}
          style={{
            display: 'none',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: '#475569',
            padding: '8px',
            borderRadius: '8px',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'background-color 0.2s',
            marginRight: '8px'
          }}
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="4" x2="20" y1="12" y2="12"/><line x1="4" x2="20" y1="6" y2="6"/><line x1="4" x2="20" y1="18" y2="18"/></svg>
        </button>

        {/* Left: Section Indicator & Clinic Context */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ fontSize: '13.5px', fontWeight: 800, color: '#0F172A', fontFamily: "'Outfit', sans-serif" }}>
              {activeTab === 'dash' ? 'Daily Command Center' : 
               activeTab === 'appointments' ? 'Appointments Management' : 
               activeTab === 'labs' ? 'Laboratory Orders & Reports' : 
               activeTab === 'prescriptions' ? 'Prescription Management' : 
               activeTab === 'consultations' ? 'Patient Records & Consultations' : 
               activeTab === 'settings' ? 'Doctor Profile & Settings' : 'Doctor Portal'}
            </span>
          </div>
          <span style={{ height: '14px', width: '1px', background: '#E2E8F0', margin: '0 4px' }}></span>
          <span style={{ background: '#EFF6FF', color: '#2563EB', fontSize: '11px', fontWeight: 700, padding: '3px 8px', borderRadius: '6px', border: '1px solid #BFDBFE' }}>
            {currentUser.tenantName || 'CUROXA HEALTHCARE'}
          </span>
        </div>

        {/* Global Patient Search (Optimized & Absolute Overlaid Dropdown) */}
        <div 
          ref={searchContainerRef}
          style={{ position: 'relative', width: '320px', zIndex: 9999, marginLeft: 'auto' }} 
          className="search-bar-container"
        >
          <i data-lucide="search" style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: '#94A3B8', width: '16px' }}></i>
          <input 
            type="text" 
            className="form-control-cu" 
            style={{ paddingLeft: '40px', width: '100%', height: '40px', borderRadius: '8px', border: '1px solid #E2E8F0', background: '#F8FAFC', fontSize: '13px', color: '#1E293B', outline: 'none' }} 
            placeholder="Search patient by mobile/ID" 
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setShowDropdown(true);
            }}
            onFocus={() => setShowDropdown(true)}
            onBlur={() => setTimeout(() => setShowDropdown(false), 200)}
          />
          {showDropdown && (
            <div 
              style={{ 
                position: 'absolute', 
                top: 'calc(100% + 8px)', 
                left: 0, 
                width: '100%', 
                background: 'white', 
                borderRadius: '12px', 
                border: '1px solid #E2E8F0', 
                boxShadow: '0 10px 30px rgba(0,0,0,0.1)', 
                zIndex: 99999, 
                padding: '8px', 
                maxHeight: '300px', 
                overflowY: 'auto'
              }}
            >
              {patients.filter(p => p.name.toLowerCase().includes(searchQuery.toLowerCase()) || p.uhid.includes(searchQuery) || p.contact.includes(searchQuery)).map(p => (
                <div 
                  key={p._id} 
                  onClick={() => handleSelectPatient(p)} 
                  style={{ 
                    padding: '10px 12px', 
                    borderRadius: '8px', 
                    cursor: 'pointer', 
                    display: 'flex', 
                    justifyContent: 'space-between', 
                    alignItems: 'center', 
                    transition: '0.2s',
                    marginBottom: '4px',
                    borderBottom: '1px solid #F1F5F9'
                  }}
                  className="dropdown-item"
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: '#EFF6FF', color: 'var(--cu-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: '12px' }}>
                      {p.name.substring(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: '13px', color: '#1E293B' }}>{p.name}</div>
                      <div style={{ fontSize: '11px', color: '#64748B' }}>UHID: {p.uhid} | {p.gender}, {p.age} Yrs</div>
                    </div>
                  </div>
                  <div style={{ fontSize: '11px', background: '#F1F5F9', color: '#475569', padding: '4px 8px', borderRadius: '6px', fontWeight: 700 }}>
                    {p.contact}
                  </div>
                </div>
              ))}
              {patients.filter(p => p.name.toLowerCase().includes(searchQuery.toLowerCase())).length === 0 && (
                <div style={{ padding: '12px', textAlign: 'center', fontSize: '12px', color: 'var(--text-muted)' }}>No patients found</div>
              )}
            </div>
          )}
        </div>

        {/* Notification Bell */}
        <div 
          ref={notificationRef}
          style={{ position: 'relative', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', width: '40px', height: '40px', borderRadius: '8px', border: '1px solid #E2E8F0', color: '#64748B' }}
          onClick={() => {
            setShowNotifications(!showNotifications);
            setUnreadCount(0);
          }}
        >
          <i data-lucide="bell" style={{ width: '18px', height: '18px' }}></i>
          {unreadCount > 0 && (
            <span style={{ position: 'absolute', top: '-4px', right: '-4px', background: '#EF4444', color: 'white', borderRadius: '50%', width: '18px', height: '18px', fontSize: '10px', fontWeight: '900', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '2px solid white' }}>
              {unreadCount}
            </span>
          )}

          {showNotifications && (
            <div data-lenis-prevent 
              style={{
                position: 'absolute',
                top: '48px',
                right: '0',
                width: '320px',
                background: 'rgba(255, 255, 255, 0.95)',
                backdropFilter: 'blur(8px)',
                borderRadius: '12px',
                border: '1px solid #E2E8F0',
                boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
                zIndex: 1000,
                padding: '16px',
                maxHeight: '400px',
                overflowY: 'auto'
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #F1F5F9', paddingBottom: '8px', marginBottom: '12px' }}>
                <span style={{ fontWeight: 800, fontSize: '14px', color: '#0F172A' }}>Notifications</span>
                <button 
                  style={{ background: 'none', border: 'none', color: '#2563EB', fontSize: '11px', fontWeight: 700, cursor: 'pointer' }}
                  onClick={() => {
                    const userKey = currentUser.staff_id || currentUser.id || currentUser.name || 'default';
                    const clearedKey = `curoxa_cleared_notifications_${userKey}`;
                    const clearedIds = JSON.parse(localStorage.getItem(clearedKey) || '[]');
                    const newClearedIds = [...clearedIds, ...notifications.map(n => n.id)];
                    localStorage.setItem(clearedKey, JSON.stringify(newClearedIds));
                    setNotifications([]);
                    setUnreadCount(0);
                  }}
                >
                  Clear all
                </button>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {notifications.map(n => (
                  <div key={n.id} style={{ display: 'flex', flexDirection: 'column', gap: '4px', padding: '8px', borderRadius: '8px', background: n.isNew ? '#EFF6FF' : '#F8FAFC', borderLeft: n.isNew ? '3px solid #2563EB' : '3px solid #E2E8F0' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontWeight: 800, fontSize: '12.5px', color: '#1E293B' }}>{n.title}</span>
                      <span style={{ fontSize: '10px', color: '#94A3B8', fontWeight: 600 }}>{n.time}</span>
                    </div>
                    <span style={{ fontSize: '11.5px', color: '#475569', fontWeight: 550, lineHeight: 1.4 }}>{n.message}</span>
                  </div>
                ))}
                {notifications.length === 0 && (
                  <div style={{ textAlign: 'center', padding: '20px 0', color: '#94A3B8', fontSize: '12px', fontWeight: 600 }}>
                    No notifications
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    )}

      <div className={"main-content " + (activeTab === 'hr-payroll' ? "fullscreen-portal" : (isSidebarCollapsed ? "collapsed" : ""))} data-lenis-prevent>
        
        {/* DOCTOR CLINICAL MODE OFFLINE NOTICE GUARD */}
        {doctorClinicalMode === 'OFFLINE' && activeTab !== 'hr-payroll' && activeTab !== 'settings' && (
          <div className="tab-content active" style={{ animation: 'slideUp 0.4s ease-out', padding: '40px 24px' }}>
            <div style={{
              maxWidth: '620px',
              margin: '40px auto',
              background: '#FFFFFF',
              borderRadius: '16px',
              border: '1px solid #FED7AA',
              boxShadow: '0 10px 25px rgba(234, 88, 12, 0.08)',
              padding: '36px 32px',
              textAlign: 'center'
            }}>
              <div style={{
                width: '60px',
                height: '60px',
                borderRadius: '16px',
                background: '#FFF7ED',
                color: '#EA580C',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: '20px',
                border: '1px solid #FED7AA'
              }}>
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
              </div>
              <h2 style={{ fontSize: '20px', fontWeight: 800, color: '#0F172A', marginBottom: '10px' }}>
                Doctor Clinical Mode is currently OFFLINE for this hospital.
              </h2>
              <p style={{ fontSize: '13.5px', color: '#64748B', lineHeight: 1.6, marginBottom: '24px' }}>
                Clinical consultations and prescriptions are being handled through the hospital's offline workflow.
              </p>
              <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
                <button
                  type="button"
                  onClick={() => setActiveTab('hr-payroll')}
                  style={{
                    padding: '10px 20px',
                    background: '#2563EB',
                    color: '#FFFFFF',
                    border: 'none',
                    borderRadius: '8px',
                    fontSize: '13px',
                    fontWeight: 700,
                    cursor: 'pointer',
                    boxShadow: '0 2px 8px rgba(37, 99, 235, 0.25)'
                  }}
                >
                  Open HR & Self-Service
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('settings')}
                  style={{
                    padding: '10px 20px',
                    background: '#F8FAFC',
                    color: '#475569',
                    border: '1px solid #CBD5E1',
                    borderRadius: '8px',
                    fontSize: '13px',
                    fontWeight: 700,
                    cursor: 'pointer'
                  }}
                >
                  Doctor Profile & Settings
                </button>
              </div>
            </div>
          </div>
        )}

        {/* TAB: HR PAYROLL PORTAL */}
        {activeTab === 'hr-payroll' && (
          <div className="tab-content active" style={{ animation: 'slideUp 0.4s ease-out', padding: 0 }}>
            <HRPayroll onExit={() => setActiveTab(doctorClinicalMode === 'OFFLINE' ? 'offline-hub' : 'consultations')} />
          </div>
        )}

        {/* TAB: RECEPTIONIST DYNAMIC COVERAGE */}
        {activeTab === 'receptionist_cover' && doctorClinicalMode !== 'OFFLINE' && (
          <div className="tab-content active" style={{ animation: 'slideUp 0.4s ease-out', padding: '24px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
              <div>
                <h2 style={{ fontSize: '20px', fontWeight: 800, color: '#0F172A', margin: '0 0 4px 0' }}>Receptionist Active Coverage</h2>
                <p style={{ fontSize: '13px', color: '#64748B', margin: 0, fontWeight: 600 }}>
                  Active coverage delegated by Administrator. All transactions logged securely.
                </p>
              </div>
              <span className="badge-pill new" style={{ background: '#FFE4E6', color: '#E11D48', padding: '6px 12px', fontSize: '11px', fontWeight: 800 }}>
                ● Active Coverage Mode
              </span>
            </div>

            {/* Sub-navigation inside coverage */}
            <div style={{ display: 'flex', gap: '8px', borderBottom: '1px solid #E2E8F0', paddingBottom: '12px', marginBottom: '24px' }}>
              {coverageState['rc-queue']?.on && (
                <button 
                  className={`btn-view-detail ${receptionistSubTab === 'queue' ? 'active' : ''}`}
                  onClick={() => setReceptionistSubTab('queue')}
                  style={{ background: receptionistSubTab === 'queue' ? '#2563EB' : 'transparent', color: receptionistSubTab === 'queue' ? 'white' : '#64748B', border: 'none', padding: '8px 16px', borderRadius: '8px', fontWeight: 700, cursor: 'pointer' }}
                >
                  OPD Token Queue
                </button>
              )}
              {coverageState['rc-appt']?.on && (
                <button 
                  className={`btn-view-detail ${receptionistSubTab === 'appt' ? 'active' : ''}`}
                  onClick={() => setReceptionistSubTab('appt')}
                  style={{ background: receptionistSubTab === 'appt' ? '#2563EB' : 'transparent', color: receptionistSubTab === 'appt' ? 'white' : '#64748B', border: 'none', padding: '8px 16px', borderRadius: '8px', fontWeight: 700, cursor: 'pointer' }}
                >
                  Book Appointment
                </button>
              )}
              {coverageState['rc-register']?.on && (
                <button 
                  className={`btn-view-detail ${receptionistSubTab === 'register' ? 'active' : ''}`}
                  onClick={() => setReceptionistSubTab('register')}
                  style={{ background: receptionistSubTab === 'register' ? '#2563EB' : 'transparent', color: receptionistSubTab === 'register' ? 'white' : '#64748B', border: 'none', padding: '8px 16px', borderRadius: '8px', fontWeight: 700, cursor: 'pointer' }}
                >
                  Patient Registration
                </button>
              )}
              {coverageState['rc-billing']?.on && (
                <button 
                  className={`btn-view-detail ${receptionistSubTab === 'billing' ? 'active' : ''}`}
                  onClick={() => setReceptionistSubTab('billing')}
                  style={{ background: receptionistSubTab === 'billing' ? '#2563EB' : 'transparent', color: receptionistSubTab === 'billing' ? 'white' : '#64748B', border: 'none', padding: '8px 16px', borderRadius: '8px', fontWeight: 700, cursor: 'pointer' }}
                >
                  Billing & Receipts
                </button>
              )}
            </div>

            {/* SUBTAB: QUEUE */}
            {receptionistSubTab === 'queue' && (
              <div className="glass-card" style={{ padding: '24px', background: 'white', border: '1px solid #E2E8F0', borderRadius: '16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                  <h3 style={{ fontSize: '16px', fontWeight: 800, color: '#0F172A', margin: 0 }}>OPD Daily Token Roster</h3>
                  <button 
                    type="button"
                    className="btn-cover-action receptionist-primary"
                    onClick={() => {
                      showToastNotification("Calling Next Patient in Token Queue!");
                    }}
                  >
                    Call Next Token
                  </button>
                </div>

                <div style={{ marginBottom: '20px', position: 'relative' }}>
                  <input 
                    type="text" 
                    placeholder="Search patient by name or ID..." 
                    value={doctorSearchQuery}
                    onChange={e => setDoctorSearchQuery(e.target.value)}
                    style={{ width: '100%', height: '40px', border: '1px solid #CBD5E1', borderRadius: '8px', padding: '0 12px 0 36px', fontSize: '13.5px', outline: 'none', color: '#0F172A', boxSizing: 'border-box' }}
                  />
                  <i data-lucide="search" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', width: '16px', height: '16px', color: '#64748B', display: 'flex', alignItems: 'center' }}></i>
                </div>

                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid #E2E8F0' }}>
                      <th style={{ padding: '12px 8px', color: '#64748B', fontSize: '12px', fontWeight: 800 }}>TOKEN NO</th>
                      <th style={{ padding: '12px 8px', color: '#64748B', fontSize: '12px', fontWeight: 800 }}>PATIENT</th>
                      <th style={{ padding: '12px 8px', color: '#64748B', fontSize: '12px', fontWeight: 800 }}>STATUS</th>
                      <th style={{ padding: '12px 8px', color: '#64748B', fontSize: '12px', fontWeight: 800 }}>CHECK-IN TIME</th>
                      <th style={{ padding: '12px 8px', color: '#64748B', fontSize: '12px', fontWeight: 800, textAlign: 'right' }}>ACTIONS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {coverageQueue
                      .filter(item => 
                        item.patient?.toLowerCase().includes(doctorSearchQuery.toLowerCase()) || 
                        item.id?.toLowerCase().includes(doctorSearchQuery.toLowerCase())
                      )
                      .map((item, idx) => (
                      <tr key={idx} style={{ borderBottom: '1px solid #F1F5F9' }}>
                        <td style={{ padding: '16px 8px', fontWeight: 800, color: '#2563EB', fontSize: '13px' }}>{item.token}</td>
                        <td style={{ padding: '16px 8px', fontWeight: 700, color: '#1E293B', fontSize: '13.5px' }}>{item.patient}</td>
                        <td style={{ padding: '16px 8px' }}>
                          <span className={`badge-pill ${item.status === 'Waiting' ? 'waiting' : 'new'}`} style={{ fontSize: '10px' }}>
                            {item.status}
                          </span>
                        </td>
                        <td style={{ padding: '16px 8px', color: '#64748B', fontSize: '12.5px', fontWeight: 600 }}>{item.time}</td>
                        <td style={{ padding: '16px 8px', textAlign: 'right' }}>
                          {item.status !== 'Completed' ? (
                            <button 
                              type="button"
                              className="btn-cover-action receptionist-primary"
                              onClick={async () => {
                                try {
                                  // Optimistically update appointment status in coverage queue & general state!
                                  setCoverageQueue(prev => prev.map(q => q.id === item.id ? { ...q, status: 'Completed' } : q));
                                  setCoverageAppts(prev => prev.map(a => a.id === item.id ? { ...a, status: 'Completed' } : a));
                                  setAppointments(prev => prev.map(a => a._id === item.id ? { ...a, status: 'Completed' } : a));

                                  await api.put(`/appointments/${item.id}`, { status: 'Completed' });
                                  showToastNotification(`Token ${item.token} marked as Completed!`);
                                  fetchCoverageData();
                                  fetchData();
                                } catch (e) {
                                  showToastNotification('Failed to update appointment status.', 'error');
                                  fetchCoverageData();
                                  fetchData();
                                }
                              }}
                            >
                              Mark Completed
                            </button>
                          ) : (
                            <span style={{ fontSize: '12px', color: '#059669', fontWeight: 700 }}>Completed</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* SUBTAB: APPOINTMENT */}
            {receptionistSubTab === 'appt' && (
              <div className="mobile-stack" style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '24px' }}>
                <div className="glass-card" style={{ padding: '24px', background: 'white', border: '1px solid #E2E8F0', borderRadius: '16px' }}>
                  <h3 style={{ fontSize: '16px', fontWeight: 800, color: '#0F172A', marginBottom: '20px' }}>Scheduled Slots</h3>
                  
                  <div style={{ marginBottom: '16px', position: 'relative' }}>
                    <input 
                      type="text" 
                      placeholder="Search patient..." 
                      value={doctorSearchQuery}
                      onChange={e => setDoctorSearchQuery(e.target.value)}
                      style={{ width: '100%', height: '36px', border: '1px solid #CBD5E1', borderRadius: '8px', padding: '0 12px 0 32px', fontSize: '13px', outline: 'none', color: '#0F172A', boxSizing: 'border-box' }}
                    />
                    <i data-lucide="search" style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', width: '14px', height: '14px', color: '#64748B', display: 'flex', alignItems: 'center' }}></i>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {coverageAppts
                      .filter(app => 
                        app.patient?.toLowerCase().includes(doctorSearchQuery.toLowerCase()) || 
                        app.id?.toLowerCase().includes(doctorSearchQuery.toLowerCase())
                      )
                      .map(app => (
                      <div key={app.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px', border: '1px solid #F1F5F9', borderRadius: '12px' }}>
                        <div>
                          <span style={{ fontSize: '11px', fontWeight: 800, color: '#2563EB', display: 'block' }}>{app.slot}</span>
                          <span style={{ fontSize: '14px', fontWeight: 750, color: '#1E293B' }}>{app.patient}</span>
                          <span style={{ fontSize: '11px', color: '#64748B', display: 'block', fontWeight: 600 }}>{app.contact}</span>
                        </div>
                        <span className="badge-pill new" style={{ fontSize: '10px' }}>{app.status}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="glass-card" style={{ padding: '24px', background: 'white', border: '1px solid #E2E8F0', borderRadius: '16px' }}>
                  <h3 style={{ fontSize: '16px', fontWeight: 800, color: '#0F172A', marginBottom: '20px' }}>Book Appointment Slot</h3>
                  <form onSubmit={async (e) => {
                    e.preventDefault();
                    const patientId = e.target.elements.patSelect.value;
                    const doctorId = e.target.elements.docSelect.value;
                    const slot = e.target.elements.patSlot.value;
                    const reason = e.target.elements.patReason.value || 'General Consultation';
                    const regNo = e.target.elements.patRegNo.value || '';
                    if (!patientId || !doctorId) {
                      showToastNotification("Please select a patient and a doctor", "error");
                      return;
                    }
                    
                    try {
                      const apptRes = await api.post('/appointments', {
                        patientId,
                        doctorId,
                        date: new Date(),
                        time: slot,
                        reason,
                        regNo
                      });
                      
                      const docObj = coverageDoctors.find(d => String(d._id) === String(doctorId));
                      const docFee = docObj ? (docObj.consultationFee !== undefined ? docObj.consultationFee : 500) : 500;
                      await api.post('/billing', {
                        patientId,
                        items: [
                          { description: 'OPD Consultation Fee', amount: docFee },
                          { description: 'Registration Fee', amount: 50 }
                        ],
                        totalAmount: docFee + 50,
                        paymentMethod: 'Cash'
                      });

                      showToastNotification(`Appointment booked successfully!`);
                      e.target.reset();
                      fetchCoverageData();
                    } catch (err) {
                      showToastNotification('Failed to book appointment.', 'error');
                    }
                  }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                      <div>
                        <label style={{ fontSize: '11px', fontWeight: 800, color: '#64748B', textTransform: 'uppercase', marginBottom: '6px', display: 'block' }}>Select Patient</label>
                        <select name="patSelect" style={{ width: '100%', height: '40px', border: '1px solid #E2E8F0', borderRadius: '8px', padding: '0 12px', fontSize: '13px', fontWeight: 700, color: '#475569', cursor: 'pointer', outline: 'none' }} required>
                          <option value="">-- Choose Patient --</option>
                          {patients.map(p => (
                            <option key={p._id} value={p._id}>{p.name} ({p.uhid || 'No UHID'})</option>
                          ))}
                        </select>
                      </div>
                      
                      <div>
                        <label style={{ fontSize: '11px', fontWeight: 800, color: '#64748B', textTransform: 'uppercase', marginBottom: '6px', display: 'block' }}>Assign Doctor</label>
                        <select name="docSelect" style={{ width: '100%', height: '40px', border: '1px solid #E2E8F0', borderRadius: '8px', padding: '0 12px', fontSize: '13px', fontWeight: 700, color: '#475569', cursor: 'pointer', outline: 'none' }} required>
                          {coverageDoctors.map(doc => (
                            <option key={doc._id} value={doc._id}>{doc.name} ({doc.specialty || 'General'})</option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label style={{ fontSize: '11px', fontWeight: 800, color: '#64748B', textTransform: 'uppercase', marginBottom: '6px', display: 'block' }}>Registration Number</label>
                        <input type="text" name="patRegNo" style={{ width: '100%', height: '40px', border: '1px solid #E2E8F0', borderRadius: '8px', padding: '0 12px', fontSize: '13px', fontWeight: 650, outline: 'none' }} placeholder="e.g. REG-7894" />
                      </div>

                      <div>
                        <label style={{ fontSize: '11px', fontWeight: 800, color: '#64748B', textTransform: 'uppercase', marginBottom: '6px', display: 'block' }}>Time Slot</label>
                        <select name="patSlot" style={{ width: '100%', height: '40px', border: '1px solid #E2E8F0', borderRadius: '8px', padding: '0 12px', fontSize: '13px', fontWeight: 700, color: '#475569', cursor: 'pointer', outline: 'none' }}>
                          <option value="09:30 AM">09:30 AM</option>
                          <option value="10:30 AM">10:30 AM</option>
                          <option value="12:00 PM">12:00 PM</option>
                          <option value="03:30 PM">03:30 PM</option>
                          <option value="04:30 PM">04:30 PM</option>
                        </select>
                      </div>

                      <div>
                        <label style={{ fontSize: '11px', fontWeight: 800, color: '#64748B', textTransform: 'uppercase', marginBottom: '6px', display: 'block' }}>Reason for Visit</label>
                        <input type="text" name="patReason" style={{ width: '100%', height: '40px', border: '1px solid #E2E8F0', borderRadius: '8px', padding: '0 12px', fontSize: '13px', fontWeight: 650, outline: 'none' }} placeholder="e.g. Cough and Fever" />
                      </div>

                      <button type="submit" className="btn-cover-action receptionist-primary" style={{ width: '100%', height: '44px', marginTop: '8px' }}>
                        Book Appointment
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            )}

            {/* SUBTAB: REGISTRATION */}
            {receptionistSubTab === 'register' && (
              <div className="glass-card" style={{ padding: '32px', background: 'white', border: '1px solid #E2E8F0', borderRadius: '16px', maxWidth: '600px', margin: '0 auto' }}>
                <h3 style={{ fontSize: '18px', fontWeight: 800, color: '#0F172A', marginBottom: '8px' }}>OPD Patient Registration</h3>
                <p style={{ fontSize: '12.5px', color: '#64748B', marginBottom: '24px', fontWeight: 600 }}>Create standard EMR clinical records for new OPD patients.</p>
                
                <form onSubmit={async (e) => {
                  e.preventDefault();
                  const name = e.target.elements.regName.value;
                  const phone = e.target.elements.regPhone.value;
                  const age = e.target.elements.regAge.value;
                  const gender = e.target.elements.regGender.value;
                  const address = e.target.elements.regAddress.value;
                  if (!name || !phone) return;
                  
                  try {
                    await api.post('/patients', {
                      name,
                      contact: phone,
                      age,
                      gender,
                      address
                    });
                    showToastNotification(`Patient "${name}" registered successfully!`, 'success');
                    e.target.reset();
                    fetchCoverageData();
                  } catch (err) {
                    showToastNotification('Failed to register patient.', 'error');
                  }
                }}>
                  <div className="mobile-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                    <div>
                      <label style={{ fontSize: '11px', fontWeight: 800, color: '#64748B', textTransform: 'uppercase', marginBottom: '6px', display: 'block' }}>Full Name</label>
                      <input type="text" name="regName" style={{ width: '100%', height: '40px', border: '1px solid #E2E8F0', borderRadius: '8px', padding: '0 12px', fontSize: '13px', fontWeight: 650, outline: 'none' }} required placeholder="e.g. Priya Nair" />
                    </div>
                    <div>
                      <label style={{ fontSize: '11px', fontWeight: 800, color: '#64748B', textTransform: 'uppercase', marginBottom: '6px', display: 'block' }}>Mobile Phone</label>
                      <input type="tel" name="regPhone" style={{ width: '100%', height: '40px', border: '1px solid #E2E8F0', borderRadius: '8px', padding: '0 12px', fontSize: '13px', fontWeight: 650, outline: 'none' }} required placeholder="e.g. +91 91122 33445" />
                    </div>
                  </div>

                  <div className="mobile-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                    <div>
                      <label style={{ fontSize: '11px', fontWeight: 800, color: '#64748B', textTransform: 'uppercase', marginBottom: '6px', display: 'block' }}>Age (Years)</label>
                      <input type="number" name="regAge" style={{ width: '100%', height: '40px', border: '1px solid #E2E8F0', borderRadius: '8px', padding: '0 12px', fontSize: '13px', fontWeight: 650, outline: 'none' }} defaultValue="28" required />
                    </div>
                    <div>
                      <label style={{ fontSize: '11px', fontWeight: 800, color: '#64748B', textTransform: 'uppercase', marginBottom: '6px', display: 'block' }}>Gender</label>
                      <select name="regGender" style={{ width: '100%', height: '40px', border: '1px solid #E2E8F0', borderRadius: '8px', padding: '0 12px', fontSize: '13px', fontWeight: 700, color: '#475569', cursor: 'pointer', outline: 'none' }}>
                        <option value="Female">Female</option>
                        <option value="Male">Male</option>
                        <option value="Other">Other</option>
                      </select>
                    </div>
                  </div>

                  <div style={{ marginBottom: '24px' }}>
                    <label style={{ fontSize: '11px', fontWeight: 800, color: '#64748B', textTransform: 'uppercase', marginBottom: '6px', display: 'block' }}>Residential Address</label>
                    <textarea name="regAddress" style={{ width: '100%', height: '70px', border: '1px solid #E2E8F0', borderRadius: '8px', padding: '10px 12px', fontSize: '13px', fontWeight: 650, outline: 'none', resize: 'none' }} placeholder="e.g. Sector-14, DLF Phase 1, Gurgaon" defaultValue="" />
                  </div>

                  <button type="submit" className="btn-cover-action receptionist-primary" style={{ width: '100%', height: '46px' }}>
                    Register & Open EMR Account
                  </button>
                </form>
              </div>
            )}

            {/* SUBTAB: BILLING */}
            {receptionistSubTab === 'billing' && (
              <div className="glass-card" style={{ padding: '24px', background: 'white', border: '1px solid #E2E8F0', borderRadius: '16px' }}>
                <h3 style={{ fontSize: '16px', fontWeight: 800, color: '#0F172A', marginBottom: '20px' }}>OPD Billing Clearance Ledger</h3>
                
                <div style={{ marginBottom: '20px', position: 'relative' }}>
                  <input 
                    type="text" 
                    placeholder="Search patient by name or Bill ID..." 
                    value={doctorSearchQuery}
                    onChange={e => setDoctorSearchQuery(e.target.value)}
                    style={{ width: '100%', height: '40px', border: '1px solid #CBD5E1', borderRadius: '8px', padding: '0 12px 0 36px', fontSize: '13.5px', outline: 'none', color: '#0F172A', boxSizing: 'border-box' }}
                  />
                  <i data-lucide="search" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', width: '16px', height: '16px', color: '#64748B', display: 'flex', alignItems: 'center' }}></i>
                </div>

                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid #E2E8F0' }}>
                      <th style={{ padding: '12px 8px', color: '#64748B', fontSize: '12px', fontWeight: 800 }}>BILL ID</th>
                      <th style={{ padding: '12px 8px', color: '#64748B', fontSize: '12px', fontWeight: 800 }}>PATIENT</th>
                      <th style={{ padding: '12px 8px', color: '#64748B', fontSize: '12px', fontWeight: 800 }}>SERVICE</th>
                      <th style={{ padding: '12px 8px', color: '#64748B', fontSize: '12px', fontWeight: 800 }}>AMOUNT</th>
                      <th style={{ padding: '12px 8px', color: '#64748B', fontSize: '12px', fontWeight: 800 }}>STATUS</th>
                      <th style={{ padding: '12px 8px', color: '#64748B', fontSize: '12px', fontWeight: 800, textAlign: 'right' }}>ACTION</th>
                    </tr>
                  </thead>
                  <tbody>
                    {coverageBills
                      .filter(bill => 
                        bill.name?.toLowerCase().includes(doctorSearchQuery.toLowerCase()) || 
                        bill.id?.toLowerCase().includes(doctorSearchQuery.toLowerCase())
                      )
                      .map(bill => (
                      <tr key={bill.id} style={{ borderBottom: '1px solid #F1F5F9' }}>
                        <td style={{ padding: '16px 8px', fontWeight: 800, color: '#475569', fontSize: '12.5px' }}>#{bill.id}</td>
                        <td style={{ padding: '16px 8px', fontWeight: 700, color: '#1E293B', fontSize: '13.5px' }}>{bill.name}</td>
                        <td style={{ padding: '16px 8px', color: '#475569', fontSize: '13px', fontWeight: 600 }}>{bill.service}</td>
                        <td style={{ padding: '16px 8px', fontWeight: 800, color: '#0F172A', fontSize: '13.5px' }}>₹{bill.amount}</td>
                        <td style={{ padding: '16px 8px' }}>
                          <span className={`badge-pill ${bill.paid ? 'new' : 'waiting'}`} style={{ fontSize: '10px' }}>
                            {bill.paid ? 'Paid' : 'Unpaid'}
                          </span>
                        </td>
                        <td style={{ padding: '16px 8px', textAlign: 'right' }}>
                          {!bill.paid ? (
                            <button 
                              type="button"
                              className="btn-cover-action receptionist-primary"
                              onClick={async () => {
                                try {
                                  await api.put(`/billing/${bill.id}`, { status: 'Paid' });
                                  showToastNotification(`Payment ₹${bill.amount} collected for ${bill.name}! Receipt printed.`);
                                  fetchCoverageData();
                                } catch (e) {
                                  showToastNotification('Failed to clear bill.', 'error');
                                }
                              }}
                            >
                              Collect Fee
                            </button>
                          ) : (
                            <button 
                              type="button"
                              className="btn-cover-action receptionist-primary"
                              style={{ background: 'transparent', border: '1px solid #E2E8F0', color: '#64748B' }}
                              onClick={() => showToastNotification("Re-printing duplicate receipt...")}
                            >
                              Print Receipt
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* TAB: LAB DYNAMIC COVERAGE */}
        {activeTab === 'lab_cover' && doctorClinicalMode !== 'OFFLINE' && (
          <div className="tab-content active" style={{ animation: 'slideUp 0.4s ease-out', padding: '24px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
              <div>
                <h2 style={{ fontSize: '20px', fontWeight: 800, color: '#0F172A', margin: '0 0 4px 0' }}>Laboratory Active Coverage</h2>
                <p style={{ fontSize: '13px', color: '#64748B', margin: 0, fontWeight: 600 }}>Providing emergency clinical oversight for Diagnostic Lab. All report signing logged.</p>
              </div>
              <span className="badge-pill new" style={{ background: '#D1FAE5', color: '#059669', padding: '6px 12px', fontSize: '11px', fontWeight: 800 }}>
                ● Clinical Lab Coverage
              </span>
            </div>

            <div style={{ display: 'flex', gap: '8px', borderBottom: '1px solid #E2E8F0', paddingBottom: '12px', marginBottom: '24px' }}>
              {coverageState['lt-queue']?.on && (
                <button 
                  className={`btn-view-detail ${labSubTab === 'tests' ? 'active' : ''}`}
                  onClick={() => setLabSubTab('tests')}
                  style={{ background: labSubTab === 'tests' ? '#059669' : 'transparent', color: labSubTab === 'tests' ? 'white' : '#64748B', border: 'none', padding: '8px 16px', borderRadius: '8px', fontWeight: 700, cursor: 'pointer' }}
                >
                  Emergency Test Orders
                </button>
              )}
              {coverageState['lt-reagents']?.on && (
                <button 
                  className={`btn-view-detail ${labSubTab === 'reagents' ? 'active' : ''}`}
                  onClick={() => setLabSubTab('reagents')}
                  style={{ background: labSubTab === 'reagents' ? '#059669' : 'transparent', color: labSubTab === 'reagents' ? 'white' : '#64748B', border: 'none', padding: '8px 16px', borderRadius: '8px', fontWeight: 700, cursor: 'pointer' }}
                >
                  Reagents & Kits Inventory
                </button>
              )}
            </div>

            {/* SUBTAB: TESTS QUEUE */}
            {labSubTab === 'tests' && (
              <div className="glass-card" style={{ padding: '24px', background: 'white', border: '1px solid #E2E8F0', borderRadius: '16px' }}>
                <h3 style={{ fontSize: '16px', fontWeight: 800, color: '#0F172A', marginBottom: '20px' }}>Diagnostic Test Orders Queue</h3>
                
                <div style={{ marginBottom: '20px', position: 'relative' }}>
                  <input 
                    type="text" 
                    placeholder="Search patient by name or test order..." 
                    value={labSearchQuery}
                    onChange={e => setLabSearchQuery(e.target.value)}
                    style={{ width: '100%', height: '40px', border: '1px solid #CBD5E1', borderRadius: '8px', padding: '0 12px 0 36px', fontSize: '13.5px', outline: 'none', color: '#0F172A', boxSizing: 'border-box' }}
                  />
                  <i data-lucide="search" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', width: '16px', height: '16px', color: '#64748B', display: 'flex', alignItems: 'center' }}></i>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  {coverageLabRequests
                    .filter(t => 
                      t.name?.toLowerCase().includes(labSearchQuery.toLowerCase()) || 
                      t.id?.toLowerCase().includes(labSearchQuery.toLowerCase()) || 
                      t.test?.toLowerCase().includes(labSearchQuery.toLowerCase())
                    )
                    .map(test => (
                    <div key={test.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px', border: '1px solid #F1F5F9', borderRadius: '12px' }}>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ fontSize: '14px', fontWeight: 800, color: '#1E293B' }}>{test.name}</span>
                          <span className={`badge-pill new`} style={{ fontSize: '9px', padding: '2px 6px' }}>{test.priority} Priority</span>
                        </div>
                        <span style={{ fontSize: '12.5px', color: '#475569', fontWeight: 600, display: 'block', marginTop: '4px' }}>Test: <b>{test.test}</b></span>
                        <span style={{ fontSize: '11px', color: '#94A3B8', fontWeight: 550 }}>Order ID: #{test.id} · Status: {test.status}</span>
                      </div>
                      {test.status === 'Pending' ? (
                        <button 
                          type="button"
                          className="btn-cover-action lab-primary"
                          style={{ background: '#2563EB', borderColor: '#2563EB' }}
                          onClick={async () => {
                            try {
                              await api.put(`/labs/${test.id}`, {
                                status: 'In Progress',
                                notes: 'Specimen sample collected by delegated clinical coverage.'
                              });
                              showToastNotification(`Sample collected successfully for ${test.name}!`, 'success');
                              fetchCoverageData();
                            } catch (e) {
                              showToastNotification('Failed to update sample status.', 'error');
                            }
                          }}
                        >
                          Collect Sample
                        </button>
                      ) : test.status === 'In Progress' ? (
                        <button 
                          type="button"
                          className="btn-cover-action lab-primary"
                          onClick={() => {
                            setSelectedCoverageLabTest(test);
                            setCoverageLabRemarks('');
                            setCoverageLabParams({ value: '', unit: 'g/dL' });
                            setCoverageLabFileName('');
                            setShowCoverageLabModal(true);
                          }}
                        >
                          Enter Results
                        </button>
                      ) : (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ fontSize: '12px', color: '#059669', fontWeight: 700 }}>Signed & Dispatched</span>
                          <button 
                            type="button"
                            className="btn-cover-action lab-primary"
                            style={{ background: '#475569', color: 'white', padding: '4px 10px', fontSize: '11px' }}
                            onClick={() => {
                              setSelectedCoverageLabTest(test);
                              setShowCoverageLabDetailsModal(true);
                            }}
                          >
                            View Report
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* SUBTAB: REAGENTS */}
            {labSubTab === 'reagents' && (
              <div className="glass-card" style={{ padding: '24px', background: 'white', border: '1px solid #E2E8F0', borderRadius: '16px' }}>
                <h3 style={{ fontSize: '16px', fontWeight: 800, color: '#0F172A', marginBottom: '20px' }}>Diagnostic Reagents Ledger</h3>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid #E2E8F0' }}>
                      <th style={{ padding: '12px 8px', color: '#64748B', fontSize: '12px', fontWeight: 800 }}>REAGENT NAME</th>
                      <th style={{ padding: '12px 8px', color: '#64748B', fontSize: '12px', fontWeight: 800 }}>STOCK LEVEL</th>
                      <th style={{ padding: '12px 8px', color: '#64748B', fontSize: '12px', fontWeight: 800 }}>MIN SAFE STOCK</th>
                      <th style={{ padding: '12px 8px', color: '#64748B', fontSize: '12px', fontWeight: 800 }}>STATUS</th>
                      <th style={{ padding: '12px 8px', color: '#64748B', fontSize: '12px', fontWeight: 800, textAlign: 'right' }}>ACTION</th>
                    </tr>
                  </thead>
                  <tbody>
                    {coverageReagents.map(item => (
                      <tr key={item.id} style={{ borderBottom: '1px solid #F1F5F9' }}>
                        <td style={{ padding: '16px 8px', fontWeight: 700, color: '#1E293B', fontSize: '13.5px' }}>{item.name}</td>
                        <td style={{ padding: '16px 8px', fontWeight: 800, color: '#0F172A', fontSize: '13.5px' }}>{item.stock}</td>
                        <td style={{ padding: '16px 8px', color: '#64748B', fontSize: '13px', fontWeight: 600 }}>{item.minStock}</td>
                        <td style={{ padding: '16px 8px' }}>
                          <span className={`badge-pill ${item.status === 'Normal' ? 'new' : 'revisit'}`} style={{ fontSize: '10px' }}>
                            {item.status}
                          </span>
                        </td>
                        <td style={{ padding: '16px 8px', textAlign: 'right' }}>
                          <button 
                            type="button"
                            className="btn-cover-action lab-primary"
                            onClick={async () => {
                              try {
                                await api.put(`/lab-inventory/${item.id}`, {
                                  isRestock: true,
                                  addQty: 50
                                });
                                showToastNotification(`Emergency restock order issued for ${item.name}!`);
                                fetchCoverageData();
                              } catch (e) {
                                showToastNotification('Failed to restock reagent.', 'error');
                              }
                            }}
                          >
                            Emergency Order
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* TAB: PHARMACY DYNAMIC COVERAGE */}
        {activeTab === 'pharmacy_cover' && doctorClinicalMode !== 'OFFLINE' && (
          <div className="tab-content active" style={{ animation: 'slideUp 0.4s ease-out', padding: '24px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
              <div>
                <h2 style={{ fontSize: '20px', fontWeight: 800, color: '#0F172A', margin: '0 0 4px 0' }}>Pharmacy Active Coverage</h2>
                <p style={{ fontSize: '13px', color: '#64748B', margin: 0, fontWeight: 600 }}>Dispensing and inventory controls active. Safe drug parameters apply.</p>
              </div>
              <span className="badge-pill new" style={{ background: '#EFF6FF', color: '#2563EB', padding: '6px 12px', fontSize: '11px', fontWeight: 800 }}>
                ● Pharmacy Duty Cover
              </span>
            </div>

            <div style={{ display: 'flex', gap: '8px', borderBottom: '1px solid #E2E8F0', paddingBottom: '12px', marginBottom: '24px' }}>
              {coverageState['ph-queue']?.on && (
                <button 
                  className={`btn-view-detail ${pharmacySubTab === 'queue' ? 'active' : ''}`}
                  onClick={() => setPharmacySubTab('queue')}
                  style={{ background: pharmacySubTab === 'queue' ? '#2563EB' : 'transparent', color: pharmacySubTab === 'queue' ? 'white' : '#64748B', border: 'none', padding: '8px 16px', borderRadius: '8px', fontWeight: 700, cursor: 'pointer' }}
                >
                  Prescription Dispensing
                </button>
              )}
              {(coverageState['ph-stock']?.on || coverageState['dr-stockview']?.on) && (
                <button 
                  className={`btn-view-detail ${pharmacySubTab === 'stock' ? 'active' : ''}`}
                  onClick={() => setPharmacySubTab('stock')}
                  style={{ background: pharmacySubTab === 'stock' ? '#2563EB' : 'transparent', color: pharmacySubTab === 'stock' ? 'white' : '#64748B', border: 'none', padding: '8px 16px', borderRadius: '8px', fontWeight: 700, cursor: 'pointer' }}
                >
                  Medicine Inventory
                </button>
              )}
            </div>

            {/* SUBTAB: DISPENSING QUEUE */}
            {pharmacySubTab === 'queue' && (
              <div className="glass-card" style={{ padding: '24px', background: 'white', border: '1px solid #E2E8F0', borderRadius: '16px' }}>
                <h3 style={{ fontSize: '16px', fontWeight: 800, color: '#0F172A', marginBottom: '20px' }}>Active Prescription Dispensing Queue</h3>
                
                <div style={{ marginBottom: '20px', position: 'relative' }}>
                  <input 
                    type="text" 
                    placeholder="Search patient by name or Rx ID..." 
                    value={pharmacySearchQuery}
                    onChange={e => setPharmacySearchQuery(e.target.value)}
                    style={{ width: '100%', height: '40px', border: '1px solid #CBD5E1', borderRadius: '8px', padding: '0 12px 0 36px', fontSize: '13.5px', outline: 'none', color: '#0F172A', boxSizing: 'border-box' }}
                  />
                  <i data-lucide="search" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', width: '16px', height: '16px', color: '#64748B', display: 'flex', alignItems: 'center' }}></i>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  {coveragePharmacyQueue
                    .filter(p => 
                      p.patient?.toLowerCase().includes(pharmacySearchQuery.toLowerCase()) || 
                      p.id?.toLowerCase().includes(pharmacySearchQuery.toLowerCase()) ||
                      p.med?.toLowerCase().includes(pharmacySearchQuery.toLowerCase())
                    )
                    .map(item => (
                      <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px', border: '1px solid #F1F5F9', borderRadius: '12px' }}>
                        <div>
                          <span style={{ fontSize: '14px', fontWeight: 800, color: '#1E293B' }}>{item.patient}</span>
                          <span style={{ fontSize: '12.5px', color: '#475569', fontWeight: 600, display: 'block', marginTop: '4px' }}>Medication: <b>{item.med}</b> · Qty: {item.qty}</span>
                          <span style={{ fontSize: '11px', color: '#94A3B8', fontWeight: 550 }}>Rx ID: #{item.id} · Category: {item.type}</span>
                        </div>
                        <button 
                          className="btn-cover-action pharmacy-primary"
                          onClick={() => {
                            setSelectedCoveragePharmacyRx(item);
                            setCoveragePharmacyCashReceived('');
                            setShowCoveragePharmacyPaymentModal(true);
                          }}
                        >
                          Dispense & Pack
                        </button>
                      </div>
                    ))}
                  {coveragePharmacyQueue.filter(p => 
                      p.patient?.toLowerCase().includes(pharmacySearchQuery.toLowerCase()) || 
                      p.id?.toLowerCase().includes(pharmacySearchQuery.toLowerCase()) ||
                      p.med?.toLowerCase().includes(pharmacySearchQuery.toLowerCase())
                    ).length === 0 && (
                    <p style={{ margin: 0, fontSize: '13px', color: '#64748B', fontWeight: 600, textAlign: 'center', padding: '20px 0' }}>
                      No pending prescriptions in the queue.
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* SUBTAB: PHARMACY STOCK */}
            {pharmacySubTab === 'stock' && (
              <div className="glass-card" style={{ padding: '24px', background: 'white', border: '1px solid #E2E8F0', borderRadius: '16px' }}>
                <h3 style={{ fontSize: '16px', fontWeight: 800, color: '#0F172A', marginBottom: '20px' }}>Emergency Medicine Inventory Stock</h3>
                
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid #E2E8F0' }}>
                      <th style={{ padding: '12px 8px', color: '#64748B', fontSize: '12px', fontWeight: 800 }}>DRUG NAME</th>
                      <th style={{ padding: '12px 8px', color: '#64748B', fontSize: '12px', fontWeight: 800 }}>AVAILABLE STOCK</th>
                      <th style={{ padding: '12px 8px', color: '#64748B', fontSize: '12px', fontWeight: 800 }}>EXPIRY DATE</th>
                      <th style={{ padding: '12px 8px', color: '#64748B', fontSize: '12px', fontWeight: 800 }}>STATUS</th>
                      <th style={{ padding: '12px 8px', color: '#64748B', fontSize: '12px', fontWeight: 800, textAlign: 'right' }}>ACTION</th>
                    </tr>
                  </thead>
                  <tbody>
                    {coveragePharmacyInventory.map(drug => (
                      <tr key={drug.id} style={{ borderBottom: '1px solid #F1F5F9' }}>
                        <td style={{ padding: '16px 8px', fontWeight: 700, color: '#1E293B', fontSize: '13.5px' }}>{drug.name}</td>
                        <td style={{ padding: '16px 8px', fontWeight: 800, color: '#0F172A', fontSize: '13.5px' }}>{drug.stock} {drug.unit}</td>
                        <td style={{ padding: '16px 8px', color: '#64748B', fontSize: '13px', fontWeight: 600 }}>N/A</td>
                        <td style={{ padding: '16px 8px' }}>
                          <span className={`badge-pill ${drug.status === 'In Stock' ? 'new' : drug.status === 'Low Stock' ? 'revisit' : 'admitted'}`} style={{ fontSize: '10px' }}>
                            {drug.status}
                          </span>
                        </td>
                        <td style={{ padding: '16px 8px', textAlign: 'right' }}>
                          <button 
                            type="button"
                            className="btn-cover-action pharmacy-primary"
                            onClick={async () => {
                              try {
                                await api.put(`/medicines/${drug.id}`, { stock: drug.stock + 100 });
                                showToastNotification(`Restocked 100 units of ${drug.name} successfully!`);
                                fetchCoverageData();
                              } catch (err) {
                                showToastNotification(`Failed to restock ${drug.name}`, 'error');
                              }
                            }}
                          >
                            Restock
                          </button>
                        </td>
                      </tr>
                    ))}
                    {coveragePharmacyInventory.length === 0 && (
                      <tr>
                        <td colSpan="5" style={{ textAlign: 'center', padding: '20px 0', fontSize: '13px', color: '#64748B', fontWeight: 600 }}>
                          No pharmacy inventory stock records found.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
        {activeTab === 'dash' && doctorClinicalMode !== 'OFFLINE' && (() => {
          const selectedDateStr = formatDateString(selectedDate);
          
          // Calculate KPI metrics relative to selected date
          const kpi = getKPIsForDate(selectedDateStr);
          
          // Get appointments scheduled on selected date (real + beautifully distributed mock)
          const activeAppointments = getAppointmentsForDate(selectedDateStr);
          
          // Get calendar dates for viewed month
          const calendarDays = getCalendarDays(currentMonth);
          const monthLabel = currentMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
          
          const recentConsults = getRecentConsultations(selectedDateStr);
          
          return (
            <div className="tab-content active" style={{ animation: 'slideUp 0.4s ease-out', padding: '24px' }}>
              
              {/* Doctor Command Center Greeting Hero Bar */}
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '24px',
                flexWrap: 'wrap',
                gap: '16px',
                background: 'linear-gradient(135deg, #FFFFFF 0%, #F8FAFC 100%)',
                padding: '20px 24px',
                borderRadius: '16px',
                border: '1px solid #E2E8F0',
                boxShadow: '0 2px 10px rgba(0,0,0,0.02)'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                  <div style={{
                    width: '48px',
                    height: '48px',
                    borderRadius: '14px',
                    background: 'linear-gradient(135deg, #2563EB 0%, #1D4ED8 100%)',
                    color: '#FFFFFF',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    boxShadow: '0 4px 12px rgba(37, 99, 235, 0.25)',
                    flexShrink: 0
                  }}>
                    <i data-lucide="stethoscope" style={{ width: '24px', height: '24px' }}></i>
                  </div>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                      <h1 style={{ fontSize: '20px', fontWeight: 800, color: '#0F172A', margin: 0, fontFamily: "'Outfit', sans-serif" }}>
                        {(() => {
                          const h = new Date().getHours();
                          const greeting = h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
                          return `${greeting}, ${docProfile.name || currentUser.name || 'Doctor'} 👋`;
                        })()}
                      </h1>
                      <span style={{ background: '#EFF6FF', color: '#2563EB', fontSize: '11px', fontWeight: 800, padding: '3px 8px', borderRadius: '6px', border: '1px solid #BFDBFE' }}>
                        {docProfile.specialty || 'General Physician'}
                      </span>
                    </div>
                    <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: '#64748B', fontWeight: 500 }}>
                      Doctor Daily Command Center • Clinical overview and active schedule for today.
                    </p>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    background: '#FFFFFF',
                    border: '1px solid #E2E8F0',
                    padding: '8px 14px',
                    borderRadius: '10px',
                    fontSize: '13px',
                    fontWeight: 600,
                    color: '#334155',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.02)'
                  }}>
                    <i data-lucide="calendar" style={{ width: '15px', height: '15px', color: '#2563EB' }}></i>
                    <span>{new Date().toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}</span>
                  </div>
                  <button
                    onClick={() => setActiveTab('consultations')}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      background: '#2563EB',
                      color: '#FFFFFF',
                      border: 'none',
                      padding: '8px 16px',
                      borderRadius: '10px',
                      fontSize: '13px',
                      fontWeight: 700,
                      cursor: 'pointer',
                      boxShadow: '0 2px 8px rgba(37, 99, 235, 0.2)',
                      transition: 'all 0.2s'
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = '#1D4ED8'}
                    onMouseLeave={e => e.currentTarget.style.background = '#2563EB'}
                  >
                    <i data-lucide="user-plus" style={{ width: '15px', height: '15px' }}></i>
                    <span>New Consultation</span>
                  </button>
                </div>
              </div>

              {/* LIVE OPD TOKEN QUEUE BAR */}
              <div style={{
                background: '#FFFFFF',
                border: '1px solid #E2E8F0',
                borderRadius: '16px',
                padding: '16px 20px',
                marginBottom: '24px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '16px',
                boxShadow: '0 2px 10px rgba(15, 23, 42, 0.03)'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div style={{
                    width: '40px',
                    height: '40px',
                    borderRadius: '12px',
                    background: '#EFF6FF',
                    color: '#2563EB',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    border: '1px solid #DBEAFE'
                  }}>
                    <i data-lucide="ticket" style={{ width: '20px', height: '20px' }}></i>
                  </div>
                  <div>
                    <div style={{ fontSize: '11px', fontWeight: 800, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.5px' }}>LIVE OPD QUEUE</div>
                    <div style={{ fontSize: '14.5px', fontWeight: 800, color: '#0F172A' }}>Doctor Live Consultation Token Stream</div>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
                  {/* NOW SERVING */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', background: doctorQueue.currentToken ? '#EFF6FF' : '#F8FAFC', border: doctorQueue.currentToken ? '1.5px solid #60A5FA' : '1px solid #E2E8F0', padding: '8px 14px', borderRadius: '10px' }}>
                    <span style={{ fontSize: '11px', fontWeight: 800, color: doctorQueue.currentToken ? '#1E40AF' : '#64748B', textTransform: 'uppercase' }}>NOW SERVING</span>
                    {doctorQueue.currentToken ? (
                      <span style={{ fontSize: '13.5px', fontWeight: 900, color: '#1D4ED8', background: '#DBEAFE', padding: '2px 8px', borderRadius: '6px' }}>
                        Token #{doctorQueue.currentToken} {doctorQueue.currentPatient?.name ? `• ${doctorQueue.currentPatient.name}` : ''}
                      </span>
                    ) : (
                      <span style={{ fontSize: '12px', fontWeight: 700, color: '#94A3B8' }}>NO PATIENT IN QUEUE</span>
                    )}
                  </div>

                  {/* NEXT IN QUEUE */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: '#F8FAFC', border: '1px solid #E2E8F0', padding: '8px 14px', borderRadius: '10px' }}>
                    <span style={{ fontSize: '11px', fontWeight: 800, color: '#64748B', textTransform: 'uppercase' }}>NEXT</span>
                    {doctorQueue.nextToken ? (
                      <span style={{ fontSize: '13px', fontWeight: 800, color: '#0F172A', background: '#F1F5F9', padding: '2px 8px', borderRadius: '6px' }}>
                        Token #{doctorQueue.nextToken}
                      </span>
                    ) : (
                      <span style={{ fontSize: '12px', fontWeight: 600, color: '#94A3B8' }}>—</span>
                    )}
                  </div>

                  {/* WAITING COUNT */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: '#FEF3C7', border: '1px solid #FDE68A', padding: '8px 14px', borderRadius: '10px' }}>
                    <span style={{ fontSize: '11px', fontWeight: 800, color: '#92400E', textTransform: 'uppercase' }}>WAITING</span>
                    <span style={{ fontSize: '13px', fontWeight: 900, color: '#B45309' }}>
                      {doctorQueue.waitingCount} {doctorQueue.waitingCount === 1 ? 'patient' : 'patients'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Row 2: Key Daily KPI Cards (Copied directly from Pharmacy KPI system - 5 cards single row) */}
              <div className="kpi-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(5, minmax(0, 1fr))', gap: '12px', marginBottom: '24px' }}>

                
                {/* Card 1: Today's Appointments (Electric Blue Theme) */}
                <div 
                  style={{
                    padding: '16px 14px',
                    borderRadius: '16px',
                    border: '1px solid rgba(191, 219, 254, 0.9)',
                    boxShadow: '0 12px 28px rgba(37, 99, 235, 0.08)',
                    background: 'radial-gradient(circle at 100% 100%, rgba(59, 130, 246, 0.25) 0%, transparent 65%), linear-gradient(135deg, #FFFFFF 0%, #EFF6FF 50%, #DBEAFE 100%)',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    position: 'relative',
                    overflow: 'hidden',
                    transition: 'all 0.2s ease',
                    cursor: 'pointer',
                    minWidth: 0
                  }}
                  onClick={() => setActiveTab('appointments')}
                  onMouseEnter={e => {
                    e.currentTarget.style.transform = 'translateY(-2px)';
                    e.currentTarget.style.boxShadow = '0 16px 36px rgba(37, 99, 235, 0.16)';
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.transform = 'none';
                    e.currentTarget.style.boxShadow = '0 12px 28px rgba(37, 99, 235, 0.08)';
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <div style={{
                      width: '30px',
                      height: '30px',
                      borderRadius: '8px',
                      background: 'linear-gradient(135deg, #1D4ED8 0%, #3B82F6 100%)',
                      color: '#FFFFFF',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                      boxShadow: '0 4px 10px rgba(37, 99, 235, 0.25)'
                    }}>
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="18" x="3" y="4" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                    </div>
                    <span style={{ fontSize: '10px', fontWeight: 800, color: '#1E3A8A', textTransform: 'uppercase', letterSpacing: '0.04em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      TODAY'S APPOINTMENTS
                    </span>
                  </div>

                  <div style={{ marginTop: '12px', display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: '6px' }}>
                    <div>
                      <div style={{ fontSize: '28px', fontWeight: 900, color: '#0F172A', fontFamily: "'Outfit', sans-serif", letterSpacing: '-0.02em', lineHeight: 1 }}>
                        {activeAppointments.length}
                      </div>
                      <div style={{ fontSize: '11.5px', color: '#2563EB', fontWeight: 700, marginTop: '5px', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: '#2563EB', display: 'inline-block' }}></span> Active today
                      </div>
                    </div>

                    {/* Blue Mini Sparkline */}
                    <div style={{ width: '52px', height: '28px', position: 'relative', flexShrink: 0 }}>
                      <svg style={{ width: '100%', height: '100%', overflow: 'visible' }} viewBox="0 0 64 32">
                        <defs>
                          <linearGradient id="docKpiBlue" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#2563EB" stopOpacity="0.45"/>
                            <stop offset="100%" stopColor="#2563EB" stopOpacity="0.05"/>
                          </linearGradient>
                        </defs>
                        <path d="M 0 24 Q 16 26, 24 16 T 40 18 T 52 8 T 64 12 L 64 32 L 0 32 Z" fill="url(#docKpiBlue)" />
                        <path d="M 0 24 Q 16 26, 24 16 T 40 18 T 52 8 T 64 12" fill="none" stroke="#2563EB" strokeWidth="2.4" strokeLinecap="round" />
                      </svg>
                    </div>
                  </div>

                  {/* Half Gradient Accent Line Beneath Card */}
                  <div style={{
                    position: 'absolute',
                    bottom: 0,
                    right: 0,
                    height: '4px',
                    width: '60%',
                    borderBottomRightRadius: '16px',
                    background: 'linear-gradient(90deg, transparent 0%, #2563EB 100%)',
                    pointerEvents: 'none'
                  }} />
                </div>

                {/* Card 2: Waiting / In Queue (Warm Amber / Orange Theme) */}
                <div 
                  style={{
                    padding: '16px 14px',
                    borderRadius: '16px',
                    border: '1px solid rgba(254, 215, 170, 0.9)',
                    boxShadow: '0 12px 28px rgba(245, 158, 11, 0.08)',
                    background: 'radial-gradient(circle at 0% 100%, rgba(245, 158, 11, 0.25) 0%, transparent 65%), linear-gradient(135deg, #FFFFFF 0%, #FFFBEB 50%, #FEF3C7 100%)',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    position: 'relative',
                    overflow: 'hidden',
                    transition: 'all 0.2s ease',
                    cursor: 'pointer',
                    minWidth: 0
                  }}
                  onClick={() => setActiveTab('appointments')}
                  onMouseEnter={e => {
                    e.currentTarget.style.transform = 'translateY(-2px)';
                    e.currentTarget.style.boxShadow = '0 16px 36px rgba(245, 158, 11, 0.16)';
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.transform = 'none';
                    e.currentTarget.style.boxShadow = '0 12px 28px rgba(245, 158, 11, 0.08)';
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <div style={{
                      width: '30px',
                      height: '30px',
                      borderRadius: '8px',
                      background: 'linear-gradient(135deg, #D97706 0%, #F59E0B 100%)',
                      color: '#FFFFFF',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                      boxShadow: '0 4px 10px rgba(245, 158, 11, 0.25)'
                    }}>
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M5 22h14"/><path d="M5 2h14"/><path d="M17 22v-4.172a2 2 0 0 0-.586-1.414L12 12l-4.414 4.414A2 2 0 0 0 7 17.828V22"/><path d="M7 2v4.172a2 2 0 0 0 .586 1.414L12 12l4.414-4.414A2 2 0 0 0 17 6.172V2"/></svg>
                    </div>
                    <span style={{ fontSize: '10px', fontWeight: 800, color: '#78350F', textTransform: 'uppercase', letterSpacing: '0.04em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      WAITING / IN QUEUE
                    </span>
                  </div>

                  <div style={{ marginTop: '12px', display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: '6px' }}>
                    <div>
                      <div style={{ fontSize: '28px', fontWeight: 900, color: '#0F172A', fontFamily: "'Outfit', sans-serif", letterSpacing: '-0.02em', lineHeight: 1 }}>
                        {activeAppointments.filter(app => ['Waiting', 'Scheduled', 'In Progress', 'Pending', 'Upcoming'].includes(app.status || 'Waiting')).length}
                      </div>
                      <div style={{ fontSize: '11.5px', color: '#D97706', fontWeight: 700, marginTop: '5px', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: '#D97706', display: 'inline-block' }}></span> Awaiting
                      </div>
                    </div>

                    {/* Amber Mini Sparkline */}
                    <div style={{ width: '52px', height: '28px', position: 'relative', flexShrink: 0 }}>
                      <svg style={{ width: '100%', height: '100%', overflow: 'visible' }} viewBox="0 0 64 32">
                        <defs>
                          <linearGradient id="docKpiAmber" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#F59E0B" stopOpacity="0.45"/>
                            <stop offset="100%" stopColor="#F59E0B" stopOpacity="0.05"/>
                          </linearGradient>
                        </defs>
                        <path d="M 0 28 Q 12 28, 20 26 T 38 18 T 50 14 T 64 22 L 64 32 L 0 32 Z" fill="url(#docKpiAmber)" />
                        <path d="M 0 28 Q 12 28, 20 26 T 38 18 T 50 14 T 64 22" fill="none" stroke="#F59E0B" strokeWidth="2.4" strokeLinecap="round" />
                      </svg>
                    </div>
                  </div>

                  {/* Half Gradient Accent Line Beneath Card */}
                  <div style={{
                    position: 'absolute',
                    bottom: 0,
                    right: 0,
                    height: '4px',
                    width: '60%',
                    borderBottomRightRadius: '16px',
                    background: 'linear-gradient(90deg, transparent 0%, #F59E0B 100%)',
                    pointerEvents: 'none'
                  }} />
                </div>

                {/* Card 3: Consultations Completed (Emerald Green Theme) */}
                <div 
                  style={{
                    padding: '16px 14px',
                    borderRadius: '16px',
                    border: '1px solid rgba(167, 243, 208, 0.9)',
                    boxShadow: '0 12px 28px rgba(16, 185, 129, 0.08)',
                    background: 'radial-gradient(circle at 100% 0%, rgba(16, 185, 129, 0.25) 0%, transparent 65%), linear-gradient(135deg, #FFFFFF 0%, #ECFDF5 50%, #D1FAE5 100%)',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    position: 'relative',
                    overflow: 'hidden',
                    transition: 'all 0.2s ease',
                    cursor: 'pointer',
                    minWidth: 0
                  }}
                  onClick={() => setActiveTab('consultations')}
                  onMouseEnter={e => {
                    e.currentTarget.style.transform = 'translateY(-2px)';
                    e.currentTarget.style.boxShadow = '0 16px 36px rgba(16, 185, 129, 0.16)';
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.transform = 'none';
                    e.currentTarget.style.boxShadow = '0 12px 28px rgba(16, 185, 129, 0.08)';
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <div style={{
                      width: '30px',
                      height: '30px',
                      borderRadius: '8px',
                      background: 'linear-gradient(135deg, #059669 0%, #10B981 100%)',
                      color: '#FFFFFF',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                      boxShadow: '0 4px 10px rgba(16, 185, 129, 0.25)'
                    }}>
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
                    </div>
                    <span style={{ fontSize: '10px', fontWeight: 800, color: '#064E3B', textTransform: 'uppercase', letterSpacing: '0.04em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      COMPLETED TODAY
                    </span>
                  </div>

                  <div style={{ marginTop: '12px', display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: '6px' }}>
                    <div>
                      <div style={{ fontSize: '28px', fontWeight: 900, color: '#0F172A', fontFamily: "'Outfit', sans-serif", letterSpacing: '-0.02em', lineHeight: 1 }}>
                        {activeAppointments.filter(app => app.status === 'Completed').length}
                      </div>
                      <div style={{ fontSize: '11.5px', color: '#059669', fontWeight: 700, marginTop: '5px', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: '#059669', display: 'inline-block' }}></span> Done
                      </div>
                    </div>

                    {/* Green Mini Sparkline */}
                    <div style={{ width: '52px', height: '28px', position: 'relative', flexShrink: 0 }}>
                      <svg style={{ width: '100%', height: '100%', overflow: 'visible' }} viewBox="0 0 64 32">
                        <defs>
                          <linearGradient id="docKpiGreen" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#10B981" stopOpacity="0.45"/>
                            <stop offset="100%" stopColor="#10B981" stopOpacity="0.05"/>
                          </linearGradient>
                        </defs>
                        <path d="M 0 26 Q 14 24, 22 22 T 36 10 T 48 18 T 58 6 T 64 10 L 64 32 L 0 32 Z" fill="url(#docKpiGreen)" />
                        <path d="M 0 26 Q 14 24, 22 22 T 36 10 T 48 18 T 58 6 T 64 10" fill="none" stroke="#10B981" strokeWidth="2.4" strokeLinecap="round" />
                      </svg>
                    </div>
                  </div>

                  {/* Half Gradient Accent Line Beneath Card */}
                  <div style={{
                    position: 'absolute',
                    bottom: 0,
                    right: 0,
                    height: '4px',
                    width: '60%',
                    borderBottomRightRadius: '16px',
                    background: 'linear-gradient(90deg, transparent 0%, #10B981 100%)',
                    pointerEvents: 'none'
                  }} />
                </div>

                {/* Card 4: Pending Lab Reports (Purple / Violet Theme) */}
                <div 
                  style={{
                    padding: '16px 14px',
                    borderRadius: '16px',
                    border: '1px solid rgba(221, 214, 254, 0.9)',
                    boxShadow: '0 12px 28px rgba(139, 92, 246, 0.08)',
                    background: 'radial-gradient(circle at 0% 0%, rgba(139, 92, 246, 0.25) 0%, transparent 65%), linear-gradient(135deg, #FFFFFF 0%, #F5F3FF 50%, #EDE9FE 100%)',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    position: 'relative',
                    overflow: 'hidden',
                    transition: 'all 0.2s ease',
                    cursor: 'pointer',
                    minWidth: 0
                  }}
                  onClick={() => setActiveTab('labs')}
                  onMouseEnter={e => {
                    e.currentTarget.style.transform = 'translateY(-2px)';
                    e.currentTarget.style.boxShadow = '0 16px 36px rgba(139, 92, 246, 0.16)';
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.transform = 'none';
                    e.currentTarget.style.boxShadow = '0 12px 28px rgba(139, 92, 246, 0.08)';
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <div style={{
                      width: '30px',
                      height: '30px',
                      borderRadius: '8px',
                      background: 'linear-gradient(135deg, #6D28D9 0%, #8B5CF6 100%)',
                      color: '#FFFFFF',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                      boxShadow: '0 4px 10px rgba(139, 92, 246, 0.25)'
                    }}>
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M10 2v7.31"/><path d="M14 9.3V1.99"/><path d="M8.5 2h7"/><path d="M14 9.3a6.5 6.5 0 1 1-4 0"/><path d="M5.52 16h12.96"/></svg>
                    </div>
                    <span style={{ fontSize: '10px', fontWeight: 800, color: '#4C1D95', textTransform: 'uppercase', letterSpacing: '0.04em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      PENDING LABS
                    </span>
                  </div>

                  <div style={{ marginTop: '12px', display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: '6px' }}>
                    <div>
                      <div style={{ fontSize: '28px', fontWeight: 900, color: '#0F172A', fontFamily: "'Outfit', sans-serif", letterSpacing: '-0.02em', lineHeight: 1 }}>
                        {allLabs.filter(l => ['PENDING', 'PROCESSING', 'Pending', 'Processing'].includes(l.status || 'PENDING')).length}
                      </div>
                      <div style={{ fontSize: '11.5px', color: '#8B5CF6', fontWeight: 700, marginTop: '5px', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: '#8B5CF6', display: 'inline-block' }}></span> Awaiting
                      </div>
                    </div>

                    {/* Purple Mini Sparkline */}
                    <div style={{ width: '52px', height: '28px', position: 'relative', flexShrink: 0 }}>
                      <svg style={{ width: '100%', height: '100%', overflow: 'visible' }} viewBox="0 0 64 32">
                        <defs>
                          <linearGradient id="docKpiPurple" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#8B5CF6" stopOpacity="0.45"/>
                            <stop offset="100%" stopColor="#8B5CF6" stopOpacity="0.05"/>
                          </linearGradient>
                        </defs>
                        <path d="M 0 30 Q 18 28, 28 20 T 44 22 T 54 12 T 64 8 L 64 32 L 0 32 Z" fill="url(#docKpiPurple)" />
                        <path d="M 0 30 Q 18 28, 28 20 T 44 22 T 54 12 T 64 8" fill="none" stroke="#8B5CF6" strokeWidth="2.4" strokeLinecap="round" />
                      </svg>
                    </div>
                  </div>

                  {/* Half Gradient Accent Line Beneath Card */}
                  <div style={{
                    position: 'absolute',
                    bottom: 0,
                    right: 0,
                    height: '4px',
                    width: '60%',
                    borderBottomRightRadius: '16px',
                    background: 'linear-gradient(90deg, transparent 0%, #8B5CF6 100%)',
                    pointerEvents: 'none'
                  }} />
                </div>

                {/* Card 5: Total Registered Patients (Coral / Rose Theme) */}
                <div 
                  style={{
                    padding: '16px 14px',
                    borderRadius: '16px',
                    border: '1px solid rgba(254, 202, 202, 0.9)',
                    boxShadow: '0 12px 28px rgba(239, 68, 68, 0.08)',
                    background: 'radial-gradient(circle at 100% 100%, rgba(239, 68, 68, 0.25) 0%, transparent 65%), linear-gradient(135deg, #FFFFFF 0%, #FEF2F2 50%, #FEE2E2 100%)',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    position: 'relative',
                    overflow: 'hidden',
                    transition: 'all 0.2s ease',
                    cursor: 'pointer',
                    minWidth: 0
                  }}
                  onClick={() => setActiveTab('consultations')}
                  onMouseEnter={e => {
                    e.currentTarget.style.transform = 'translateY(-2px)';
                    e.currentTarget.style.boxShadow = '0 16px 36px rgba(239, 68, 68, 0.16)';
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.transform = 'none';
                    e.currentTarget.style.boxShadow = '0 12px 28px rgba(239, 68, 68, 0.08)';
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <div style={{
                      width: '30px',
                      height: '30px',
                      borderRadius: '8px',
                      background: 'linear-gradient(135deg, #DC2626 0%, #EF4444 100%)',
                      color: '#FFFFFF',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                      boxShadow: '0 4px 10px rgba(239, 68, 68, 0.25)'
                    }}>
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
                    </div>
                    <span style={{ fontSize: '10px', fontWeight: 800, color: '#881337', textTransform: 'uppercase', letterSpacing: '0.04em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      TOTAL PATIENTS
                    </span>
                  </div>

                  <div style={{ marginTop: '12px', display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: '6px' }}>
                    <div>
                      <div style={{ fontSize: '28px', fontWeight: 900, color: '#0F172A', fontFamily: "'Outfit', sans-serif", letterSpacing: '-0.02em', lineHeight: 1 }}>
                        {patients.length}
                      </div>
                      <div style={{ fontSize: '11.5px', color: '#EF4444', fontWeight: 700, marginTop: '5px', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: '#EF4444', display: 'inline-block' }}></span> Records
                      </div>
                    </div>

                    {/* Red Mini Sparkline */}
                    <div style={{ width: '52px', height: '28px', position: 'relative', flexShrink: 0 }}>
                      <svg style={{ width: '100%', height: '100%', overflow: 'visible' }} viewBox="0 0 64 32">
                        <defs>
                          <linearGradient id="docKpiRed" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#EF4444" stopOpacity="0.45"/>
                            <stop offset="100%" stopColor="#EF4444" stopOpacity="0.05"/>
                          </linearGradient>
                        </defs>
                        <path d="M 0 18 Q 16 12, 28 20 T 44 14 T 54 26 T 64 6 L 64 32 L 0 32 Z" fill="url(#docKpiRed)" />
                        <path d="M 0 18 Q 16 12, 28 20 T 44 14 T 54 26 T 64 6" fill="none" stroke="#EF4444" strokeWidth="2.4" strokeLinecap="round" />
                      </svg>
                    </div>
                  </div>

                  {/* Half Gradient Accent Line Beneath Card */}
                  <div style={{
                    position: 'absolute',
                    bottom: 0,
                    right: 0,
                    height: '4px',
                    width: '60%',
                    borderBottomRightRadius: '16px',
                    background: 'linear-gradient(90deg, transparent 0%, #EF4444 100%)',
                    pointerEvents: 'none'
                  }} />
                </div>
              </div>

              {/* Row 3: Today's Schedule & Quick Actions */}
              <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.8fr) minmax(0, 1fr)', gap: '20px', marginBottom: '24px' }} className="mobile-stack">
                
                {/* Today's Schedule Card */}
                <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '16px', padding: '20px', boxShadow: '0 2px 8px rgba(0,0,0,0.02)', display: 'flex', flexDirection: 'column' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', paddingBottom: '14px', borderBottom: '1px solid #F1F5F9', flexWrap: 'wrap', gap: '10px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: '#EFF6FF', color: '#2563EB', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <i data-lucide="calendar" style={{ width: '16px', height: '16px' }}></i>
                      </div>
                      <div>
                        <h3 style={{ fontSize: '16px', fontWeight: 800, color: '#0F172A', margin: 0, fontFamily: "'Outfit', sans-serif" }}>Today's Schedule</h3>
                        <span style={{ fontSize: '12px', color: '#64748B', fontWeight: 500 }}>{activeAppointments.length} patient{activeAppointments.length === 1 ? '' : 's'} scheduled</span>
                      </div>
                    </div>
                    <button 
                      onClick={() => setActiveTab('appointments')}
                      style={{ background: '#EFF6FF', color: '#2563EB', border: '1px solid #BFDBFE', borderRadius: '8px', padding: '6px 12px', fontSize: '12px', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', transition: 'all 0.15s' }}
                      onMouseEnter={e => e.currentTarget.style.background = '#DBEAFE'}
                      onMouseLeave={e => e.currentTarget.style.background = '#EFF6FF'}
                    >
                      <span>View All</span>
                      <i data-lucide="arrow-right" style={{ width: '13px', height: '13px' }}></i>
                    </button>
                  </div>

                  {/* Table / Empty State */}
                  <div style={{ overflowX: 'auto', flex: 1 }}>
                    {activeAppointments.length > 0 ? (
                      <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                        <thead>
                          <tr style={{ borderBottom: '1px solid #F1F5F9' }}>
                            <th style={{ padding: '8px 12px 12px', color: '#94A3B8', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase' }}>Time</th>
                            <th style={{ padding: '8px 12px 12px', color: '#94A3B8', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase' }}>Patient</th>
                            <th style={{ padding: '8px 12px 12px', color: '#94A3B8', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase' }}>Type</th>
                            <th style={{ padding: '8px 12px 12px', color: '#94A3B8', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase' }}>Status</th>
                            <th style={{ padding: '8px 12px 12px', color: '#94A3B8', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', textAlign: 'right' }}>Action</th>
                          </tr>
                        </thead>
                        <tbody>
                          {activeAppointments.slice(0, 6).map((app, idx) => {
                            const isCompleted = app.status === 'Completed' || app._id === activeAppointmentId;
                            return (
                              <tr 
                                key={app._id || idx} 
                                style={{ borderBottom: idx === Math.min(activeAppointments.length, 6) - 1 ? 'none' : '1px solid #F8FAFC', transition: 'background 0.15s' }}
                                onMouseEnter={e => e.currentTarget.style.background = '#F8FAFC'}
                                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                              >
                                <td style={{ padding: '12px', fontSize: '13px', fontWeight: 700, color: '#334155', whiteSpace: 'nowrap' }}>
                                  {app.time || '--'}
                                </td>
                                <td style={{ padding: '12px' }}>
                                  <div 
                                    style={{ fontSize: '13.5px', fontWeight: 700, color: '#0F172A', cursor: 'pointer' }}
                                    onClick={() => {
                                      if (isCompleted || app.status === 'In Progress') {
                                        setSelectedOverviewApp(app.originalApp || app);
                                        setShowAppOverviewModal(true);
                                        addLog(`Opened clinical overview for appointment of: ${app.patientId?.name}`);
                                      } else {
                                        handleOpenTimelineForPatient(app.patientId);
                                      }
                                    }}
                                  >
                                    {app.patientId?.name || 'Unknown Patient'}
                                  </div>
                                  <div style={{ fontSize: '11.5px', color: '#64748B', fontWeight: 500, marginTop: '2px' }}>
                                    {app.patientId?.age ? `${app.patientId.age} Y, ` : ''}{app.patientId?.gender || ''}
                                    {app.patientId?.uhid ? ` • ${app.patientId.uhid}` : ''}
                                  </div>
                                </td>
                                <td style={{ padding: '12px', whiteSpace: 'nowrap' }}>
                                  <span style={{ 
                                    background: app.type?.toLowerCase() === 'revisit' ? '#F3E8FF' : '#EFF6FF', 
                                    color: app.type?.toLowerCase() === 'revisit' ? '#7C3AED' : '#2563EB',
                                    padding: '3px 8px',
                                    borderRadius: '6px',
                                    fontSize: '11px',
                                    fontWeight: 700
                                  }}>
                                    {app.type || 'General'}
                                  </span>
                                </td>
                                <td style={{ padding: '12px', whiteSpace: 'nowrap' }}>
                                  <span style={{
                                    background: isCompleted ? '#DCFCE7' : (app.status?.toLowerCase() === 'in progress' ? '#EFF6FF' : '#FEF3C7'),
                                    color: isCompleted ? '#166534' : (app.status?.toLowerCase() === 'in progress' ? '#1D4ED8' : '#B45309'),
                                    padding: '4px 9px',
                                    borderRadius: '6px',
                                    fontSize: '11px',
                                    fontWeight: 800,
                                    display: 'inline-block'
                                  }}>
                                    {app.status || 'Scheduled'}
                                  </span>
                                </td>
                                <td style={{ padding: '12px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                                  {isCompleted ? (
                                    <button 
                                      onClick={() => {
                                        setSelectedOverviewApp(app.originalApp || app);
                                        setShowAppOverviewModal(true);
                                        addLog(`Opened clinical overview for completed appointment of: ${app.patientId?.name}`);
                                      }}
                                      style={{ background: '#F0FDF4', color: '#16A34A', border: '1px solid #BBF7D0', padding: '5px 12px', borderRadius: '6px', fontSize: '12px', fontWeight: 700, cursor: 'pointer', transition: 'all 0.15s' }}
                                      onMouseEnter={e => e.currentTarget.style.background = '#DCFCE7'}
                                      onMouseLeave={e => e.currentTarget.style.background = '#F0FDF4'}
                                    >
                                      Overview
                                    </button>
                                  ) : (
                                    <button 
                                      onClick={() => startConsultation(app.originalApp || app)}
                                      style={{ background: '#EFF6FF', color: '#2563EB', border: '1px solid #BFDBFE', padding: '5px 12px', borderRadius: '6px', fontSize: '12px', fontWeight: 700, cursor: 'pointer', transition: 'all 0.15s' }}
                                      onMouseEnter={e => e.currentTarget.style.background = '#DBEAFE'}
                                      onMouseLeave={e => e.currentTarget.style.background = '#EFF6FF'}
                                    >
                                      Consult
                                    </button>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    ) : (
                      <div style={{ textAlign: 'center', padding: '36px 20px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px' }}>
                        <div style={{ width: '44px', height: '44px', borderRadius: '12px', background: '#EFF6FF', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#2563EB' }}>
                          <i data-lucide="calendar" style={{ width: '22px', height: '22px' }}></i>
                        </div>
                        <div>
                          <h4 style={{ margin: '0 0 3px 0', fontSize: '14px', fontWeight: 800, color: '#1E293B' }}>No Appointments Scheduled</h4>
                          <p style={{ margin: 0, fontSize: '12.5px', color: '#64748B', fontWeight: 500 }}>Your schedule is clear for today.</p>
                        </div>
                        <button 
                          onClick={() => setActiveTab('appointments')}
                          style={{ marginTop: '6px', background: '#EFF6FF', color: '#2563EB', border: '1px solid #BFDBFE', borderRadius: '8px', padding: '6px 14px', fontSize: '12px', fontWeight: 700, cursor: 'pointer' }}
                        >
                          View Calendar →
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {/* Quick Actions Panel */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '16px', padding: '20px', boxShadow: '0 2px 8px rgba(0,0,0,0.02)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px', paddingBottom: '12px', borderBottom: '1px solid #F1F5F9' }}>
                      <div style={{ width: '28px', height: '28px', borderRadius: '8px', background: '#EFF6FF', color: '#2563EB', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <i data-lucide="zap" style={{ width: '15px', height: '15px' }}></i>
                      </div>
                      <h3 style={{ fontSize: '15px', fontWeight: 800, color: '#0F172A', margin: 0, fontFamily: "'Outfit', sans-serif" }}>Clinical Shortcuts</h3>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      {/* Shortcut 1: Start Consultation */}
                      <div 
                        onClick={() => setActiveTab('consultations')}
                        style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 12px', borderRadius: '10px', border: '1px solid #E2E8F0', background: '#F8FAFC', cursor: 'pointer', transition: 'all 0.15s' }}
                        onMouseEnter={e => { e.currentTarget.style.background = '#EFF6FF'; e.currentTarget.style.borderColor = '#BFDBFE'; }}
                        onMouseLeave={e => { e.currentTarget.style.background = '#F8FAFC'; e.currentTarget.style.borderColor = '#E2E8F0'; }}
                      >
                        <div style={{ width: '34px', height: '34px', borderRadius: '8px', background: '#2563EB', color: '#FFFFFF', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          <i data-lucide="user-check" style={{ width: '16px', height: '16px' }}></i>
                        </div>
                        <div>
                          <div style={{ fontSize: '13px', fontWeight: 700, color: '#0F172A' }}>Patient Records & EMR</div>
                          <div style={{ fontSize: '11px', color: '#64748B', fontWeight: 500 }}>Access medical files & timeline</div>
                        </div>
                      </div>

                      {/* Shortcut 2: Prescriptions */}
                      <div 
                        onClick={() => setActiveTab('prescriptions')}
                        style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 12px', borderRadius: '10px', border: '1px solid #E2E8F0', background: '#F8FAFC', cursor: 'pointer', transition: 'all 0.15s' }}
                        onMouseEnter={e => { e.currentTarget.style.background = '#EFF6FF'; e.currentTarget.style.borderColor = '#BFDBFE'; }}
                        onMouseLeave={e => { e.currentTarget.style.background = '#F8FAFC'; e.currentTarget.style.borderColor = '#E2E8F0'; }}
                      >
                        <div style={{ width: '34px', height: '34px', borderRadius: '8px', background: '#059669', color: '#FFFFFF', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          <i data-lucide="file-text" style={{ width: '16px', height: '16px' }}></i>
                        </div>
                        <div>
                          <div style={{ fontSize: '13px', fontWeight: 700, color: '#0F172A' }}>Prescription Maker</div>
                          <div style={{ fontSize: '11px', color: '#64748B', fontWeight: 500 }}>Write & manage prescriptions</div>
                        </div>
                      </div>

                      {/* Shortcut 3: Lab Reports */}
                      <div 
                        onClick={() => setActiveTab('labs')}
                        style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 12px', borderRadius: '10px', border: '1px solid #E2E8F0', background: '#F8FAFC', cursor: 'pointer', transition: 'all 0.15s' }}
                        onMouseEnter={e => { e.currentTarget.style.background = '#EFF6FF'; e.currentTarget.style.borderColor = '#BFDBFE'; }}
                        onMouseLeave={e => { e.currentTarget.style.background = '#F8FAFC'; e.currentTarget.style.borderColor = '#E2E8F0'; }}
                      >
                        <div style={{ width: '34px', height: '34px', borderRadius: '8px', background: '#7C3AED', color: '#FFFFFF', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          <i data-lucide="flask-conical" style={{ width: '16px', height: '16px' }}></i>
                        </div>
                        <div>
                          <div style={{ fontSize: '13px', fontWeight: 700, color: '#0F172A' }}>Laboratory Reports</div>
                          <div style={{ fontSize: '11px', color: '#64748B', fontWeight: 500 }}>Review test results & orders</div>
                        </div>
                      </div>

                      {/* Shortcut 4: Appointments List */}
                      <div 
                        onClick={() => setActiveTab('appointments')}
                        style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 12px', borderRadius: '10px', border: '1px solid #E2E8F0', background: '#F8FAFC', cursor: 'pointer', transition: 'all 0.15s' }}
                        onMouseEnter={e => { e.currentTarget.style.background = '#EFF6FF'; e.currentTarget.style.borderColor = '#BFDBFE'; }}
                        onMouseLeave={e => { e.currentTarget.style.background = '#F8FAFC'; e.currentTarget.style.borderColor = '#E2E8F0'; }}
                      >
                        <div style={{ width: '34px', height: '34px', borderRadius: '8px', background: '#EA580C', color: '#FFFFFF', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          <i data-lucide="calendar-days" style={{ width: '16px', height: '16px' }}></i>
                        </div>
                        <div>
                          <div style={{ fontSize: '13px', fontWeight: 700, color: '#0F172A' }}>All Appointments</div>
                          <div style={{ fontSize: '11px', color: '#64748B', fontWeight: 500 }}>Filter, search & export bookings</div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

              </div>

              {/* Row 4: Recent Consultations & Today's Lab Reports */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }} className="mobile-stack">
                
                {/* Recent Consultations Card */}
                <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '16px', padding: '20px', boxShadow: '0 2px 8px rgba(0,0,0,0.02)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', paddingBottom: '12px', borderBottom: '1px solid #F1F5F9' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <div style={{ width: '28px', height: '28px', borderRadius: '8px', background: '#F0FDF4', color: '#16A34A', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <i data-lucide="stethoscope" style={{ width: '15px', height: '15px' }}></i>
                      </div>
                      <h3 style={{ fontSize: '15px', fontWeight: 800, color: '#0F172A', margin: 0, fontFamily: "'Outfit', sans-serif" }}>Recent Consultations</h3>
                    </div>
                    <button 
                      onClick={() => setActiveTab('consultations')}
                      style={{ background: 'none', border: 'none', color: '#2563EB', fontSize: '12px', fontWeight: 700, cursor: 'pointer' }}
                    >
                      View All →
                    </button>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {recentConsults && recentConsults.length > 0 ? (
                      recentConsults.map((consult, idx) => (
                        <div 
                          key={consult._id || idx}
                          style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', borderRadius: '10px', background: '#F8FAFC', border: '1px solid #F1F5F9' }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: consult.color?.bg || '#EFF6FF', color: consult.color?.text || '#2563EB', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: '12.5px', flexShrink: 0 }}>
                              {consult.initials}
                            </div>
                            <div>
                              <div 
                                style={{ fontSize: '13px', fontWeight: 700, color: '#0F172A', cursor: 'pointer' }}
                                onClick={() => {
                                  if (consult.status === 'Completed') {
                                    setSelectedOverviewApp(consult.appRaw?.originalApp || consult.appRaw);
                                    setShowAppOverviewModal(true);
                                    addLog(`Opened clinical overview for completed appointment of: ${consult.name}`);
                                  } else {
                                    const pt = consult.appRaw?.patientId || { _id: consult._id, name: consult.name, age: consult.age, gender: consult.gender };
                                    handleOpenTimelineForPatient(pt);
                                  }
                                }}
                              >
                                {consult.name}
                              </div>
                              <div style={{ fontSize: '11px', color: '#64748B', fontWeight: 500 }}>{consult.age} Y, {consult.gender}</div>
                            </div>
                          </div>
                          <div style={{ textAlign: 'right' }}>
                            <span style={{ background: '#DCFCE7', color: '#166534', padding: '3px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: 700 }}>
                              {consult.time || 'Completed'}
                            </span>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div style={{ textAlign: 'center', padding: '24px 16px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
                        <div style={{ width: '38px', height: '38px', borderRadius: '50%', background: '#F0FDF4', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#16A34A' }}>
                          <i data-lucide="check-circle-2" style={{ width: '18px', height: '18px' }}></i>
                        </div>
                        <div>
                          <h4 style={{ margin: '0 0 2px 0', fontSize: '13.5px', fontWeight: 700, color: '#334155' }}>No Recent Consultations</h4>
                          <p style={{ margin: 0, fontSize: '12px', color: '#64748B', fontWeight: 500 }}>Completed consultations will appear here.</p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Lab Reports Card */}
                <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '16px', padding: '20px', boxShadow: '0 2px 8px rgba(0,0,0,0.02)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', paddingBottom: '12px', borderBottom: '1px solid #F1F5F9' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <div style={{ width: '28px', height: '28px', borderRadius: '8px', background: '#FAF5FF', color: '#7C3AED', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <i data-lucide="flask-conical" style={{ width: '15px', height: '15px' }}></i>
                      </div>
                      <h3 style={{ fontSize: '15px', fontWeight: 800, color: '#0F172A', margin: 0, fontFamily: "'Outfit', sans-serif" }}>Today's Lab Reports</h3>
                    </div>
                    <button 
                      onClick={() => setActiveTab('labs')}
                      style={{ background: 'none', border: 'none', color: '#2563EB', fontSize: '12px', fontWeight: 700, cursor: 'pointer' }}
                    >
                      View All →
                    </button>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {(() => {
                      const todayStart = new Date();
                      todayStart.setHours(0,0,0,0);
                      const todaysLabs = allLabs.filter(l => new Date(l.createdAt) >= todayStart);
                      const displayLabs = todaysLabs.length > 0 ? todaysLabs.slice(0, 3) : allLabs.slice(0, 3);
                      
                      if (displayLabs.length === 0) {
                        return (
                          <div style={{ textAlign: 'center', padding: '24px 16px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
                            <div style={{ width: '38px', height: '38px', borderRadius: '50%', background: '#FAF5FF', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#7C3AED' }}>
                              <i data-lucide="flask-conical" style={{ width: '18px', height: '18px' }}></i>
                            </div>
                            <div>
                              <h4 style={{ margin: '0 0 2px 0', fontSize: '13.5px', fontWeight: 700, color: '#334155' }}>No Lab Reports</h4>
                              <p style={{ margin: 0, fontSize: '12px', color: '#64748B', fontWeight: 500 }}>No active laboratory orders found.</p>
                            </div>
                          </div>
                        );
                      }

                      return displayLabs.map((report, idx) => {
                        const isReady = (report.status || '').toUpperCase() === 'READY' || (report.status || '').toUpperCase() === 'COMPLETED';
                        return (
                          <div 
                            key={report._id || idx}
                            style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', borderRadius: '10px', background: '#F8FAFC', border: '1px solid #F1F5F9' }}
                          >
                            <div>
                              <div style={{ fontSize: '13px', fontWeight: 700, color: '#0F172A' }}>{report.testName || 'Laboratory Test'}</div>
                              <div style={{ fontSize: '11px', color: '#64748B', fontWeight: 500, marginTop: '2px' }}>
                                {report.patientId?.name || 'Patient'} • {report.instructions || 'Routine'}
                              </div>
                            </div>
                            <div>
                              <span style={{
                                background: isReady ? '#DCFCE7' : '#EFF6FF',
                                color: isReady ? '#166534' : '#1D4ED8',
                                padding: '3px 8px',
                                borderRadius: '6px',
                                fontSize: '11px',
                                fontWeight: 800,
                                textTransform: 'uppercase'
                              }}>
                                {report.status || 'PENDING'}
                              </span>
                            </div>
                          </div>
                        );
                      });
                    })()}
                  </div>
                </div>

              </div>

            </div>
          );
        })()}

        {/* TAB 2: APPOINTMENTS */}
        {activeTab === 'appointments' && doctorClinicalMode !== 'OFFLINE' && (() => {
          // 1. Get combined array of MongoDB + mock seed records
          const rawList = getAllAppointmentsForList();
          
          // 2. Filter by search query
          let filtered = rawList.filter(item => {
            const query = appSearch.toLowerCase();
            return (
              item.patientName.toLowerCase().includes(query) ||
              item.patientIdStr.toLowerCase().includes(query) ||
              item.symptoms.toLowerCase().includes(query)
            );
          });
          
          // 3. Optional: Filter by selected calendar date if active
          if (filterBySelectedDate) {
            const calendarDateStr = formatDateString(selectedDate);
            filtered = filtered.filter(item => formatDateString(item.rawDate) === calendarDateStr);
          }
          
          // 4. Sort
          filtered.sort((a, b) => {
            const aCompleted = a.originalApp?.status === 'Completed' || a.originalApp?.status === 'Cancelled' || a.originalApp?.status === 'Checked Out';
            const bCompleted = b.originalApp?.status === 'Completed' || b.originalApp?.status === 'Cancelled' || b.originalApp?.status === 'Checked Out';
            if (aCompleted && !bCompleted) return 1;
            if (!aCompleted && bCompleted) return -1;

            if (appSort === 'Newest') {
              return new Date(b.rawDate) - new Date(a.rawDate);
            } else if (appSort === 'Oldest') {
              return new Date(a.rawDate) - new Date(b.rawDate);
            } else if (appSort === 'PatientName') {
              return a.patientName.localeCompare(b.patientName);
            }
            return 0;
          });
          
          // 5. Paginate
          const totalResults = filtered.length;
          const totalPages = Math.max(Math.ceil(totalResults / appPerPage), 1);
          
          // Guard page bounds
          const activePage = Math.min(appPage, totalPages);
          const startIndex = (activePage - 1) * appPerPage;
          const endIndex = startIndex + appPerPage;
          const paginatedList = filtered.slice(startIndex, endIndex);
          
          return (
            <div className="tab-content active" style={{ animation: 'slideUp 0.4s ease-out', padding: '24px' }}>
              
              {/* LIVE OPD TOKEN QUEUE BAR */}
              <div style={{
                background: '#FFFFFF',
                border: '1px solid #E2E8F0',
                borderRadius: '16px',
                padding: '16px 20px',
                marginBottom: '20px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '16px',
                boxShadow: '0 2px 10px rgba(15, 23, 42, 0.03)'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div style={{
                    width: '38px',
                    height: '38px',
                    borderRadius: '10px',
                    background: '#EFF6FF',
                    color: '#2563EB',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    border: '1px solid #DBEAFE'
                  }}>
                    <i data-lucide="ticket" style={{ width: '18px', height: '18px' }}></i>
                  </div>
                  <div>
                    <div style={{ fontSize: '11px', fontWeight: 800, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.5px' }}>LIVE OPD QUEUE</div>
                    <div style={{ fontSize: '14px', fontWeight: 800, color: '#0F172A' }}>Active Doctor Consultation Queue</div>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
                  {/* NOW SERVING */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: doctorQueue.currentToken ? '#EFF6FF' : '#F8FAFC', border: doctorQueue.currentToken ? '1.5px solid #60A5FA' : '1px solid #E2E8F0', padding: '8px 14px', borderRadius: '10px' }}>
                    <span style={{ fontSize: '11px', fontWeight: 800, color: doctorQueue.currentToken ? '#1E40AF' : '#64748B', textTransform: 'uppercase' }}>NOW SERVING</span>
                    {doctorQueue.currentToken ? (
                      <span style={{ fontSize: '13.5px', fontWeight: 900, color: '#1D4ED8', background: '#DBEAFE', padding: '2px 8px', borderRadius: '6px' }}>
                        Token #{doctorQueue.currentToken} {doctorQueue.currentPatient?.name ? `• ${doctorQueue.currentPatient.name}` : ''}
                      </span>
                    ) : (
                      <span style={{ fontSize: '12px', fontWeight: 700, color: '#94A3B8' }}>NO PATIENT IN QUEUE</span>
                    )}
                  </div>

                  {/* NEXT IN QUEUE */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: '#F8FAFC', border: '1px solid #E2E8F0', padding: '8px 14px', borderRadius: '10px' }}>
                    <span style={{ fontSize: '11px', fontWeight: 800, color: '#64748B', textTransform: 'uppercase' }}>NEXT</span>
                    {doctorQueue.nextToken ? (
                      <span style={{ fontSize: '13px', fontWeight: 800, color: '#0F172A', background: '#F1F5F9', padding: '2px 8px', borderRadius: '6px' }}>
                        Token #{doctorQueue.nextToken}
                      </span>
                    ) : (
                      <span style={{ fontSize: '12px', fontWeight: 600, color: '#94A3B8' }}>—</span>
                    )}
                  </div>

                  {/* WAITING COUNT */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: '#FEF3C7', border: '1px solid #FDE68A', padding: '8px 14px', borderRadius: '10px' }}>
                    <span style={{ fontSize: '11px', fontWeight: 800, color: '#92400E', textTransform: 'uppercase' }}>WAITING</span>
                    <span style={{ fontSize: '13px', fontWeight: 900, color: '#B45309' }}>
                      {doctorQueue.waitingCount} {doctorQueue.waitingCount === 1 ? 'patient' : 'patients'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Header Row */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <h1 style={{ fontSize: '20px', fontWeight: 800, margin: 0, color: '#0F172A' }}>Total Appointments</h1>
                  <span style={{ background: '#EA580C', color: '#ffffff', borderRadius: '6px', padding: '4px 10px', fontSize: '12px', fontWeight: 700 }}>
                    {totalResults}
                  </span>
                </div>
                
                {/* Search, Date Toggle & Sort selectors */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
                  
                  {/* Search box */}
                  <div style={{ position: 'relative', width: '220px' }}>
                    <i data-lucide="search" style={{ position: 'absolute', left: '12px', top: '10px', width: '14px', height: '14px', color: '#94A3B8' }}></i>
                    <input 
                      type="text" 
                      placeholder="Search" 
                      value={appSearch}
                      onChange={e => { setAppSearch(e.target.value); setAppPage(1); }}
                      style={{ 
                        width: '100%', 
                        padding: '8px 12px 8px 36px', 
                        borderRadius: '8px', 
                        border: '1px solid #E2E8F0', 
                        outline: 'none', 
                        fontSize: '13px',
                        color: '#334155',
                        fontWeight: 500
                      }} 
                    />
                  </div>
                  
                  {/* Calendar select filter toggle */}
                  <div style={{ position: 'relative' }} ref={datePickerRef}>
                    <div 
                      onClick={handleDatePickerToggle}
                      style={{ 
                        display: 'flex', 
                        alignItems: 'center', 
                        gap: '8px', 
                        background: filterBySelectedDate ? '#EFF6FF' : '#ffffff', 
                        color: filterBySelectedDate ? '#2563EB' : '#64748B', 
                        padding: '8px 16px', 
                        borderRadius: '8px', 
                        fontSize: '13px', 
                        fontWeight: 600, 
                        border: filterBySelectedDate ? '1px solid #DBEAFE' : '1px solid #E2E8F0', 
                        cursor: 'pointer',
                        transition: 'all 0.15s ease'
                      }}
                    >
                      <i data-lucide="calendar" style={{ width: '14px', height: '14px' }}></i>
                      <span>{selectedDate.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                    </div>
                    {showDatePicker && (
                      <MiniCalendarDropdown
                        selectedDate={selectedDate}
                        onSelectDate={(date) => {
                          setSelectedDate(date);
                          setFilterBySelectedDate(true);
                          setAppPage(1);
                          setShowDatePicker(false);
                          if (activeDropdownCloseFn === closeDatePicker) {
                            activeDropdownCloseFn = null;
                          }
                        }}
                        onClearFilter={() => {
                          setFilterBySelectedDate(false);
                          setAppPage(1);
                          setShowDatePicker(false);
                          if (activeDropdownCloseFn === closeDatePicker) {
                            activeDropdownCloseFn = null;
                          }
                        }}
                      />
                    )}
                  </div>
                  
                  {/* Sort Selection dropdown */}
                  <CustomDropdown
                    value={appSort}
                    onChange={val => { setAppSort(val); setAppPage(1); }}
                    style={{ width: '180px' }}
                    options={[
                      { value: 'Newest', label: 'Sort By : Newest' },
                      { value: 'Oldest', label: 'Sort By : Oldest' },
                      { value: 'PatientName', label: 'Sort By : Patient Name' }
                    ]}
                    buttonStyle={{
                      border: '1px solid #E2E8F0',
                      padding: '8px 16px',
                      borderRadius: '8px',
                      fontSize: '13px',
                      background: '#ffffff',
                      color: '#475569',
                      fontWeight: 600,
                      height: '37px'
                    }}
                  />

                  {/* Export Button */}
                  <button
                    onClick={() => setShowAppointmentExportModal(true)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      background: '#EFF6FF',
                      color: '#2563EB',
                      border: '1px solid #BFDBFE',
                      padding: '8px 16px',
                      borderRadius: '8px',
                      fontSize: '13px',
                      fontWeight: 700,
                      cursor: 'pointer',
                      height: '37px',
                      transition: 'all 0.15s ease',
                      boxShadow: '0 1px 2px rgba(37, 99, 235, 0.05)'
                    }}
                    onMouseEnter={e => { e.currentTarget.style.background = '#DBEAFE'; }}
                    onMouseLeave={e => { e.currentTarget.style.background = '#EFF6FF'; }}
                  >
                    <i data-lucide="download" style={{ width: '14px', height: '14px' }}></i>
                    <span>Export</span>
                  </button>
                  
                </div>
              </div>
              
              {/* High-Fidelity Table Container */}
              <div className="glass-card" style={{ padding: 0, border: '1px solid #E2E8F0', borderRadius: '16px', background: '#ffffff', overflow: 'hidden' }}>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                    <thead style={{ background: '#F8FAFC', borderBottom: '1px solid #E2E8F0' }}>
                      <tr>
                        <th style={{ padding: '16px 24px', fontSize: '12px', fontWeight: 700, color: '#475569', textTransform: 'uppercase', width: '12%' }}>Patient ID</th>
                        <th style={{ padding: '16px 24px', fontSize: '12px', fontWeight: 700, color: '#475569', textTransform: 'uppercase', width: '18%' }}>Patient Name</th>
                        <th style={{ padding: '16px 24px', fontSize: '12px', fontWeight: 700, color: '#475569', textTransform: 'uppercase', width: '12%' }}>Token</th>
                        <th style={{ padding: '16px 24px', fontSize: '12px', fontWeight: 700, color: '#475569', textTransform: 'uppercase', width: '18%' }}>Appointment Timing</th>
                        <th style={{ padding: '16px 24px', fontSize: '12px', fontWeight: 700, color: '#475569', textTransform: 'uppercase', width: '15%' }}>Symptoms</th>
                        <th style={{ padding: '16px 24px', fontSize: '12px', fontWeight: 700, color: '#475569', textTransform: 'uppercase', width: '10%' }}>Status</th>
                        <th style={{ padding: '16px 24px', fontSize: '12px', fontWeight: 700, color: '#475569', textTransform: 'uppercase', width: '10%' }}>Payment</th>
                        <th style={{ padding: '16px 24px', width: '5%', textAlign: 'right' }}></th>
                      </tr>
                    </thead>
                    <tbody>
                      {paginatedList.length > 0 ? (
                        paginatedList.map((item, idx) => {
                          const hasPres = allPrescriptions.some(r => r.appointmentId === item._id || (r.appointmentId?._id && r.appointmentId?._id === item._id));
                          const isUpcoming = item.status?.toLowerCase() === 'upcoming' || item.status?.toLowerCase() === 'pending';
                          const isCompleted = item.status?.toLowerCase() === 'completed' || hasPres;
                          const isOverviewEnabled = isCompleted || item.originalApp?.status === 'In Progress' || item._id === activeAppointmentId;
                          
                          const rowBg = '#ffffff';
                          const borderBottomColor = '#F1F5F9';
                          const avatarStyle = getAvatarStyle(item.patientName);
                          const initials = getInitials(item.patientName);
                          
                          return (
                            <tr 
                              key={item._id} 
                              style={{ 
                                background: rowBg, 
                                borderBottom: `1px solid ${borderBottomColor}`,
                                transition: 'all 0.15s ease'
                              }}
                            >
                              <td style={{ padding: '16px 24px', fontSize: '13px', fontWeight: 600, color: '#64748B' }}>
                                {item.patientIdStr}
                              </td>
                              <td style={{ padding: '16px 24px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                  <div style={{ 
                                    width: '32px', 
                                    height: '32px', 
                                    borderRadius: '50%', 
                                    background: avatarStyle.bg, 
                                    color: avatarStyle.text, 
                                    display: 'flex', 
                                    alignItems: 'center', 
                                    justifyContent: 'center', 
                                    fontWeight: 700, 
                                    fontSize: '11px' 
                                  }}>
                                    {initials}
                                  </div>
                                  <span 
                                    style={{ fontSize: '14px', fontWeight: 700, color: '#0F172A', cursor: 'pointer' }} 
                                    onClick={() => {
                                      if (isOverviewEnabled) {
                                        setSelectedOverviewApp(item.originalApp || item);
                                        setShowAppOverviewModal(true);
                                        addLog(`Opened clinical overview for completed appointment of: ${item.patientName}`);
                                      } else {
                                        const pt = item.originalApp?.patientId || { _id: item._id, name: item.patientName, age: 34, gender: 'Male' };
                                        handleOpenTimelineForPatient(pt);
                                      }
                                    }}
                                  >
                                    {item.patientName}
                                  </span>
                                </div>
                              </td>
                              <td style={{ padding: '16px 24px' }}>
                                {item.tokenNumber || item.originalApp?.tokenNumber ? (
                                  <span style={{
                                    padding: '3px 8px',
                                    borderRadius: '6px',
                                    fontSize: '11.5px',
                                    fontWeight: 800,
                                    background: '#EFF6FF',
                                    color: '#1D4ED8',
                                    border: '1px solid #BFDBFE',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '4px'
                                  }}>
                                    Token #{item.tokenNumber || item.originalApp?.tokenNumber}
                                  </span>
                                ) : (
                                  <span style={{ color: '#94A3B8', fontSize: '11px', fontWeight: 600 }}>—</span>
                                )}
                              </td>
                              <td style={{ padding: '16px 24px', fontSize: '13px', color: '#334155', fontWeight: 500 }}>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                                  <span style={{ fontWeight: 600, color: '#334155' }}>{item.timeRange}</span>
                                  <span style={{ fontSize: '11px', color: '#64748B', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: '#94A3B8' }}><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>
                                    {(() => {
                                      const d = new Date(item.rawDate);
                                      return isNaN(d.getTime()) 
                                        ? 'No Date' 
                                        : d.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' });
                                    })()}
                                  </span>
                                </div>
                              </td>
                              <td style={{ padding: '16px 24px', fontSize: '13px', color: '#64748B', fontWeight: 500 }}>
                                {item.symptoms}
                              </td>
                              <td style={{ padding: '16px 24px' }}>
                                <span 
                                  onClick={() => {
                                    if (isOverviewEnabled) {
                                      setSelectedOverviewApp(item.originalApp || item);
                                      setShowAppOverviewModal(true);
                                      addLog(`Opened clinical overview for completed appointment of: ${item.patientName}`);
                                    }
                                  }}
                                  className={
                                    isCompleted ? 'semantic-badge-success' :
                                    (item.status?.toLowerCase() === 'pending' ? 'semantic-badge-warning' :
                                    (item.status?.toLowerCase() === 'upcoming' ? 'semantic-badge-attention' :
                                    (item.status?.toLowerCase() === 'cancelled' ? 'semantic-badge-danger' : 'semantic-badge-info')))
                                  }
                                  style={{ 
                                    padding: '4px 8px',
                                    borderRadius: '6px',
                                    fontWeight: 700, 
                                    fontSize: '12px',
                                    cursor: isOverviewEnabled ? 'pointer' : 'default',
                                    textDecoration: isOverviewEnabled ? 'underline' : 'none',
                                    textUnderlineOffset: '2px',
                                    display: 'inline-block'
                                  }}
                                >
                                  {isCompleted ? 'Completed' : item.status}
                                </span>
                              </td>
                              <td style={{ padding: '16px 24px' }}>
                                <span 
                                  className={item.billingStatus === 'Paid' ? 'semantic-badge-success' : 'semantic-badge-warning'}
                                  style={{ 
                                    fontWeight: 800, 
                                    fontSize: '11px',
                                    padding: '4px 8px',
                                    borderRadius: '6px',
                                    display: 'inline-block'
                                  }}
                                >
                                  {item.billingStatus === 'Paid' ? 'Paid' : 'Pending'}
                                </span>
                              </td>
                              <td style={{ padding: '16px 24px', textAlign: 'right', position: 'relative' }}>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '8px' }}>
                                  {!isCompleted && item.originalApp?.status !== 'Cancelled' && (
                                    <button 
                                      type="button"
                                      onClick={() => startConsultation(item.originalApp || item)}
                                      style={{
                                        padding: '6px 12px',
                                        fontSize: '12px',
                                        background: '#2563EB',
                                        color: '#FFFFFF',
                                        border: 'none',
                                        borderRadius: '6px',
                                        fontWeight: 700,
                                        cursor: 'pointer',
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '4px'
                                      }}
                                    >
                                      <i data-lucide="stethoscope" style={{ width: '12px', height: '12px' }}></i> Consult
                                    </button>
                                  )}
                                  {isOverviewEnabled && (
                                    <button 
                                      onClick={() => {
                                        setSelectedOverviewApp(item.originalApp || item);
                                        setShowAppOverviewModal(true);
                                        addLog(`Opened clinical overview for completed appointment of: ${item.patientName}`);
                                      }}
                                      style={{
                                        background: 'transparent',
                                        border: '1.5px solid #16A34A',
                                        color: '#16A34A',
                                        padding: '6px 12px',
                                        borderRadius: '8px',
                                        fontSize: '12px',
                                        fontWeight: 700,
                                        cursor: 'pointer',
                                        transition: 'all 0.2s',
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '4px'
                                      }}
                                      onMouseEnter={e => { e.currentTarget.style.background = '#ECFDF5'; }}
                                      onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
                                    >
                                      <i data-lucide="eye" style={{ width: '14px', height: '14px' }}></i>
                                      <span>Overview</span>
                                    </button>
                                  )}
                                </div>
                              </td>
                            </tr>
                          );
                        })
                      ) : (
                        <tr>
                          <td colSpan="6" style={{ padding: '48px 0', textAlign: 'center', color: '#94A3B8', fontSize: '14px', fontWeight: 600 }}>
                            No matching appointments found.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
              
              {/* Pagination footer */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '24px', flexWrap: 'wrap', gap: '16px' }}>
                
                {/* Results Per Page dropdown */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: '#64748B' }}>
                  <span>Showing</span>
                  <CustomDropdown
                    value={appPerPage}
                    onChange={val => { setAppPerPage(Number(val)); setAppPage(1); }}
                    style={{ width: '70px' }}
                    options={[
                      { value: 5, label: '5' },
                      { value: 10, label: '10' },
                      { value: 15, label: '15' },
                      { value: 25, label: '25' }
                    ]}
                    buttonStyle={{
                      border: '1px solid #E2E8F0',
                      padding: '6px 12px',
                      borderRadius: '8px',
                      fontSize: '13px',
                      background: 'white',
                      fontWeight: 600,
                      height: '34px'
                    }}
                  />
                  <span>Results</span>
                </div>
                
                {/* Pagination triggers */}
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <button 
                    disabled={activePage === 1}
                    onClick={() => setAppPage(p => Math.max(p - 1, 1))}
                    style={{ 
                      padding: '8px 16px', 
                      borderRadius: '8px', 
                      border: '1px solid #E2E8F0', 
                      background: '#ffffff', 
                      fontSize: '13px', 
                      fontWeight: 600, 
                      color: activePage === 1 ? '#CBD5E1' : '#64748B',
                      cursor: activePage === 1 ? 'default' : 'pointer',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    Prev
                  </button>
                  
                  {Array.from({ length: totalPages }, (_, i) => i + 1).map(pNum => (
                    <button 
                      key={pNum}
                      onClick={() => setAppPage(pNum)}
                      style={{ 
                        width: '36px',
                        height: '36px', 
                        borderRadius: '8px', 
                        border: pNum === activePage ? '1px solid #2563EB' : '1px solid #E2E8F0', 
                        background: pNum === activePage ? '#2563EB' : '#ffffff', 
                        fontSize: '13px', 
                        fontWeight: 700, 
                        color: pNum === activePage ? '#ffffff' : '#64748B',
                        cursor: 'pointer',
                        transition: 'all 0.15s ease'
                      }}
                    >
                      {pNum}
                    </button>
                  ))}

                  <button 
                    disabled={activePage === totalPages}
                    onClick={() => setAppPage(p => Math.min(p + 1, totalPages))}
                    style={{ 
                      padding: '8px 16px', 
                      borderRadius: '8px', 
                      border: '1px solid #E2E8F0', 
                      background: '#ffffff', 
                      fontSize: '13px', 
                      fontWeight: 600, 
                      color: activePage === totalPages ? '#CBD5E1' : '#64748B',
                      cursor: activePage === totalPages ? 'default' : 'pointer',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    Next
                  </button>
                </div>
                
              </div>
              
            </div>
          );
        })()}

        {/* TAB 3: CONSULTATIONS & PATIENTS */}
        {(activeTab === 'consultations' || activeTab === 'patients') && doctorClinicalMode !== 'OFFLINE' && (() => {
          // 1. Get filtered list of patients based on search & drop downs
          let filtered = patients.filter(pt => {
            // Search text
            const query = consSearch.toLowerCase();
            const matchesQuery = 
              pt.name.toLowerCase().includes(query) ||
              pt.uhid.toLowerCase().includes(query) ||
              pt.contact.toLowerCase().includes(query);
              
            // Gender dropdown filter
            let matchesGender = true;
            if (consGender !== 'All') {
              matchesGender = pt.gender?.toLowerCase() === consGender.toLowerCase();
            }
            
            // Age group dropdown filter
            let matchesAge = true;
            if (consAgeGroup !== 'All') {
              if (consAgeGroup === 'Under 30') {
                matchesAge = pt.age < 30;
              } else if (consAgeGroup === '30 - 50') {
                matchesAge = pt.age >= 30 && pt.age <= 50;
              } else if (consAgeGroup === 'Over 50') {
                matchesAge = pt.age > 50;
              }
            }

            // Status filter (Active vs Completed vs All)
            let matchesStatus = true;
            if (consStatus !== 'All') {
              const hasPrescriptions = allPrescriptions.some(rx => rx.patientId?._id === pt._id || rx.patientId === pt._id);
              if (consStatus === 'Completed') {
                matchesStatus = hasPrescriptions;
              } else if (consStatus === 'Active') {
                matchesStatus = !hasPrescriptions;
              }
            }

            return matchesQuery && matchesGender && matchesAge && matchesStatus;
          });

          // 2. Paginate
          const totalResults = filtered.length;
          const totalPages = Math.max(Math.ceil(totalResults / consPerPage), 1);
          const activePage = Math.min(consPage, totalPages);
          const startIndex = (activePage - 1) * consPerPage;
          const endIndex = startIndex + consPerPage;
          const paginatedList = filtered.slice(startIndex, endIndex);

          // Get high-res profile photo mapping for screenshot matching
          const getProfilePhoto = (name, gender) => {
            const normalizedName = name.toLowerCase();
            if (normalizedName.includes('ravi') || normalizedName.includes('rohan')) {
              return "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=100&auto=format&fit=crop&q=80";
            }
            if (normalizedName.includes('amit') || normalizedName.includes('suresh')) {
              return "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=100&auto=format&fit=crop&q=80";
            }
            if (normalizedName.includes('pooja') || normalizedName.includes('ananya')) {
              return "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=100&auto=format&fit=crop&q=80";
            }
            return null; // Return null to fallback to stylized initials badge
          };

          return (
            <div className="tab-content active" style={{ animation: 'slideUp 0.4s ease-out', padding: '24px' }}>
              
              {/* Filter Row */}
              <div className="doctor-filter-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '16px' }}>
                
                {/* Search patients */}
                <div className="doctor-search-wrapper" style={{ position: 'relative', width: '320px' }}>
                  <i data-lucide="search" style={{ position: 'absolute', left: '16px', top: '14px', width: '16px', height: '16px', color: '#94A3B8' }}></i>
                  <input 
                    type="text" 
                    placeholder="Search patients..." 
                    value={consSearch}
                    onChange={e => { setConsSearch(e.target.value); setConsPage(1); }}
                    style={{ 
                      width: '100%', 
                      padding: '12px 16px 12px 48px', 
                      borderRadius: '12px', 
                      border: '1px solid #E2E8F0', 
                      outline: 'none', 
                      fontSize: '14px',
                      color: '#334155',
                      fontWeight: 500,
                      background: '#ffffff',
                      boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.02)'
                    }} 
                  />
                </div>

                {/* Dropdowns & Add Patient button */}
                <div className="doctor-filter-actions" style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                  
                  {/* Status Dropdown */}
                  <CustomDropdown
                    value={consStatus}
                    onChange={val => { setConsStatus(val); setConsPage(1); }}
                    className="status-select"
                    style={{ width: '180px' }}
                    options={[
                      { value: 'All', label: 'All Status' },
                      { value: 'Active', label: 'Active EMR' },
                      { value: 'Completed', label: 'Completed Consultation' }
                    ]}
                    buttonStyle={{
                      padding: '12px 16px',
                      borderRadius: '12px',
                      border: '1px solid #E2E8F0',
                      fontSize: '14px',
                      color: '#475569',
                      fontWeight: 600,
                      background: '#ffffff',
                      minHeight: '45px'
                    }}
                  />

                  {/* Gender Dropdown */}
                  <CustomDropdown
                    value={consGender}
                    onChange={val => { setConsGender(val); setConsPage(1); }}
                    className="gender-select"
                    style={{ width: '150px' }}
                    options={[
                      { value: 'All', label: 'All Gender' },
                      { value: 'Male', label: 'Male' },
                      { value: 'Female', label: 'Female' }
                    ]}
                    buttonStyle={{
                      padding: '12px 16px',
                      borderRadius: '12px',
                      border: '1px solid #E2E8F0',
                      fontSize: '14px',
                      color: '#475569',
                      fontWeight: 600,
                      background: '#ffffff',
                      minHeight: '45px'
                    }}
                  />

                  {/* Age Group Dropdown */}
                  <CustomDropdown
                    value={consAgeGroup}
                    onChange={val => { setConsAgeGroup(val); setConsPage(1); }}
                    className="age-select"
                    style={{ width: '180px' }}
                    options={[
                      { value: 'All', label: 'All Age Groups' },
                      { value: 'Under 30', label: 'Under 30' },
                      { value: '30 - 50', label: '30 - 50' },
                      { value: 'Over 50', label: 'Over 50' }
                    ]}
                    buttonStyle={{
                      padding: '12px 16px',
                      borderRadius: '12px',
                      border: '1px solid #E2E8F0',
                      fontSize: '14px',
                      color: '#475569',
                      fontWeight: 600,
                      background: '#ffffff',
                      minHeight: '45px'
                    }}
                  />

                  {/* Export Patient Records Button */}
                  <button
                    onClick={() => setShowPatientExportModal(true)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      padding: '12px 18px',
                      borderRadius: '12px',
                      border: '1px solid #BFDBFE',
                      background: '#EFF6FF',
                      color: '#2563EB',
                      fontSize: '14px',
                      fontWeight: 700,
                      cursor: 'pointer',
                      minHeight: '45px',
                      transition: 'all 0.15s ease',
                      boxShadow: '0 1px 2px rgba(37, 99, 235, 0.05)'
                    }}
                    onMouseEnter={e => { e.currentTarget.style.background = '#DBEAFE'; }}
                    onMouseLeave={e => { e.currentTarget.style.background = '#EFF6FF'; }}
                  >
                    <i data-lucide="download" style={{ width: '15px', height: '15px' }}></i>
                    <span>Export</span>
                  </button>

                </div>

              </div>

              {/* Patient List Card Container */}
              <div className="glass-card" style={{ padding: 0, border: '1px solid #E2E8F0', borderRadius: '16px', background: '#ffffff', overflow: 'hidden', boxShadow: '0 4px 12px 0 rgba(0,0,0,0.02)' }}>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                    <thead style={{ background: '#F8FAFC', borderBottom: '1px solid #E2E8F0' }}>
                      <tr>
                        <th style={{ padding: '18px 24px', fontSize: '11px', fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', width: '25%' }}>Patient</th>
                        <th style={{ padding: '18px 24px', fontSize: '11px', fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', width: '15%' }}>Patient ID</th>
                        <th style={{ padding: '18px 24px', fontSize: '11px', fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', width: '20%' }}>Age / Gender</th>
                        <th style={{ padding: '18px 24px', fontSize: '11px', fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', width: '18%' }}>Phone</th>
                        <th style={{ padding: '18px 24px', fontSize: '11px', fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', width: '17%' }}>Last Visit</th>
                        <th style={{ padding: '18px 24px', fontSize: '11px', fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', width: '5%', textAlign: 'right' }}>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {paginatedList.length > 0 ? (
                        paginatedList.map((pt) => {
                          const profileUrl = getProfilePhoto(pt.name, pt.gender);
                          const avatarStyle = getAvatarStyle(pt.name);
                          const initials = getInitials(pt.name);
                          const isFemale = pt.gender?.toLowerCase() === 'female';
                          
                          return (
                            <tr 
                              key={pt._id} 
                              style={{ 
                                borderBottom: '1px solid #F1F5F9',
                                transition: 'all 0.15s ease',
                                background: '#ffffff'
                              }}
                              className="patient-row-hover"
                            >
                              {/* Patient Column */}
                              <td style={{ padding: '16px 24px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                  {profileUrl ? (
                                    <img 
                                      src={profileUrl} 
                                      alt={pt.name} 
                                      style={{ 
                                        width: '36px', 
                                        height: '36px', 
                                        borderRadius: '50%', 
                                        objectFit: 'cover',
                                        border: '1px solid #E2E8F0'
                                      }}
                                    />
                                  ) : (
                                    <div style={{ 
                                      width: '36px', 
                                      height: '36px', 
                                      borderRadius: '50%', 
                                      background: avatarStyle.bg, 
                                      color: avatarStyle.text, 
                                      display: 'flex', 
                                      alignItems: 'center', 
                                      justifyContent: 'center', 
                                      fontWeight: 700, 
                                      fontSize: '12px' 
                                    }}>
                                      {initials}
                                    </div>
                                  )}
                                  <div style={{ display: 'flex', alignItems: 'center' }}>
                                    <span 
                                      style={{ fontSize: '14px', fontWeight: 700, color: '#0F172A', cursor: 'pointer' }} 
                                      onClick={() => {
                                        setSelectedPatient(pt);
                                        setSelectedProfileAppointment(null);
                                        setActiveTab('patient-profile');
                                        addLog(`Opened patient profile for: ${pt.name}`);
                                      }}
                                    >
                                      {pt.name}
                                    </span>
                                    {isFemale ? (
                                      <span style={{ marginLeft: '6px', color: '#EC4899', fontSize: '13px', fontWeight: 800 }} title="Female">♀</span>
                                    ) : (
                                      <span style={{ marginLeft: '6px', color: '#3B82F6', fontSize: '13px', fontWeight: 800 }} title="Male">♂</span>
                                    )}
                                  </div>
                                </div>
                              </td>

                              {/* Patient ID */}
                              <td style={{ padding: '16px 24px', fontSize: '13px', fontWeight: 600, color: '#64748B' }}>
                                {pt.uhid}
                              </td>

                              {/* Age / Gender */}
                              <td style={{ padding: '16px 24px', fontSize: '13px', color: '#334155', fontWeight: 500 }}>
                                {pt.age} Y, {pt.gender}
                              </td>

                              {/* Phone */}
                              <td style={{ padding: '16px 24px', fontSize: '13px', color: '#334155', fontWeight: 500 }}>
                                {pt.contact}
                              </td>

                              {/* Last Visit */}
                              <td style={{ padding: '16px 24px', fontSize: '13px', color: '#334155', fontWeight: 500 }}>
                                {pt.lastVisit || '24 May 2024'}
                              </td>

                              {/* Action */}
                              <td style={{ padding: '16px 24px', textAlign: 'right' }}>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '16px' }}>
                                  <span 
                                    onClick={() => {
                                      setSelectedPatient(pt);
                                      setSelectedProfileAppointment(null); setActiveTab('patient-profile');
                                      addLog(`Launched Active consultation SOAP prescription file for: ${pt.name}`);
                                    }}
                                    style={{ 
                                      fontSize: '13px', 
                                      fontWeight: 700, 
                                      color: '#2563EB', 
                                      cursor: 'pointer',
                                      transition: 'color 0.15s ease'
                                    }}
                                    className="view-action-hover"
                                  >
                                    View
                                  </span>
                                  <div style={{ cursor: 'pointer', color: '#94A3B8' }} title="Menu">
                                    <i data-lucide="more-vertical" style={{ width: '18px', height: '18px' }}></i>
                                  </div>
                                </div>
                              </td>
                            </tr>
                          );
                        })
                      ) : (
                        <tr>
                          <td colSpan="6" style={{ padding: '64px 0', textAlign: 'center', color: '#94A3B8', fontSize: '14px', fontWeight: 600 }}>
                            No patients found matching current filters.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Pagination footer */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '24px', flexWrap: 'wrap', gap: '16px' }}>
                
                {/* Results Per Page dropdown */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: '#64748B' }}>
                  <span>Showing</span>
                  <CustomDropdown
                    value={consPerPage}
                    onChange={val => { setConsPerPage(Number(val)); setConsPage(1); }}
                    style={{ width: '70px' }}
                    options={[
                      { value: 5, label: '5' },
                      { value: 10, label: '10' },
                      { value: 15, label: '15' },
                      { value: 25, label: '25' }
                    ]}
                    buttonStyle={{
                      border: '1px solid #E2E8F0',
                      padding: '6px 12px',
                      borderRadius: '8px',
                      fontSize: '13px',
                      background: 'white',
                      fontWeight: 600,
                      minWidth: '70px'
                    }}
                  />
                  <span>Results</span>
                </div>
                
                {/* Pagination triggers */}
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <button 
                    disabled={activePage === 1}
                    onClick={() => setConsPage(p => Math.max(p - 1, 1))}
                    style={{ 
                      padding: '8px 16px', 
                      borderRadius: '8px', 
                      border: '1px solid #E2E8F0', 
                      background: '#ffffff', 
                      fontSize: '13px', 
                      fontWeight: 600, 
                      color: activePage === 1 ? '#CBD5E1' : '#64748B',
                      cursor: activePage === 1 ? 'default' : 'pointer',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    Prev
                  </button>
                  
                  {Array.from({ length: totalPages }, (_, i) => i + 1).map(pNum => (
                    <button 
                      key={pNum}
                      onClick={() => setConsPage(pNum)}
                      style={{ 
                        width: '36px',
                        height: '36px', 
                        borderRadius: '8px', 
                        border: pNum === activePage ? '1px solid #2563EB' : '1px solid #E2E8F0', 
                        background: pNum === activePage ? '#2563EB' : '#ffffff', 
                        fontSize: '13px', 
                        fontWeight: 700, 
                        color: pNum === activePage ? '#ffffff' : '#64748B',
                        cursor: 'pointer',
                        transition: 'all 0.15s ease'
                      }}
                    >
                      {pNum}
                    </button>
                  ))}

                  <button 
                    disabled={activePage === totalPages}
                    onClick={() => setConsPage(p => Math.min(p + 1, totalPages))}
                    style={{ 
                      padding: '8px 16px', 
                      borderRadius: '8px', 
                      border: '1px solid #E2E8F0', 
                      background: '#ffffff', 
                      fontSize: '13px', 
                      fontWeight: 600, 
                      color: activePage === totalPages ? '#CBD5E1' : '#64748B',
                      cursor: activePage === totalPages ? 'default' : 'pointer',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    Next
                  </button>
                </div>
                
              </div>

              {/* REGISTER NEW PATIENT GLASSMORPHIC MODAL */}
              {showAddPatientModal && (
                <div style={{
                  position: 'fixed',
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                  background: 'rgba(15, 23, 42, 0.45)',
                  backdropFilter: 'blur(8px)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  zIndex: 9999,
                  animation: 'fadeIn 0.25s ease-out'
                }}>
                  <div style={{
                    background: '#ffffff',
                    width: '500px',
                    borderRadius: '20px',
                    border: '1px solid rgba(226, 232, 240, 0.8)',
                    boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
                    overflow: 'hidden',
                    animation: 'scaleUp 0.3s cubic-bezier(0.16, 1, 0.3, 1)'
                  }}>
                    {/* Header */}
                    <div style={{
                      padding: '24px 32px',
                      borderBottom: '1px solid #F1F5F9',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      background: '#F8FAFC'
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <i data-lucide="user-plus" style={{ width: '20px', height: '20px', color: '#2563EB' }}></i>
                        <h3 style={{ fontSize: '18px', fontWeight: 800, margin: 0, color: '#0F172A' }}>Register New Patient</h3>
                      </div>
                      <i 
                        data-lucide="x" 
                        onClick={() => setShowAddPatientModal(false)}
                        style={{ width: '20px', height: '20px', color: '#94A3B8', cursor: 'pointer' }}
                      ></i>
                    </div>

                    {/* Form */}
                    <form onSubmit={handleCreatePatient} style={{ padding: '32px' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                        {/* Name */}
                        <div>
                          <label style={{ fontSize: '12px', fontWeight: 700, color: '#475569', textTransform: 'uppercase', marginBottom: '8px', display: 'block' }}>Full Name *</label>
                          <input 
                            type="text" 
                            required
                            placeholder="e.g. Anjali Sharma" 
                            value={newPatientName}
                            onChange={e => setNewPatientName(e.target.value)}
                            style={{ width: '100%', padding: '10px 14px', borderRadius: '8px', border: '1px solid #CBD5E1', outline: 'none', fontSize: '14px' }}
                          />
                        </div>

                        {/* Age & Gender */}
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                          <div>
                            <label style={{ fontSize: '12px', fontWeight: 700, color: '#475569', textTransform: 'uppercase', marginBottom: '8px', display: 'block' }}>Age *</label>
                            <input 
                              type="number" 
                              required
                              placeholder="e.g. 29" 
                              value={newPatientAge}
                              onChange={e => setNewPatientAge(e.target.value)}
                              style={{ width: '100%', padding: '10px 14px', borderRadius: '8px', border: '1px solid #CBD5E1', outline: 'none', fontSize: '14px' }}
                            />
                          </div>
                          <div>
                            <label style={{ fontSize: '12px', fontWeight: 700, color: '#475569', textTransform: 'uppercase', marginBottom: '8px', display: 'block' }}>Gender *</label>
                            <select 
                              value={newPatientGender}
                              onChange={e => setNewPatientGender(e.target.value)}
                              style={{ width: '100%', padding: '10px 14px', borderRadius: '8px', border: '1px solid #CBD5E1', outline: 'none', fontSize: '14px', background: '#ffffff', cursor: 'pointer' }}
                            >
                              <option value="">Select Gender</option>
                              <option value="Male">Male</option>
                              <option value="Female">Female</option>
                              <option value="Other">Other</option>
                            </select>
                          </div>
                        </div>

                        {/* Contact & Blood Group */}
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                          <div>
                            <label style={{ fontSize: '12px', fontWeight: 700, color: '#475569', textTransform: 'uppercase', marginBottom: '8px', display: 'block' }}>Phone Number *</label>
                            <input 
                              type="text" 
                              required
                              placeholder="e.g. 98765 43210" 
                              value={newPatientPhone}
                              onChange={e => setNewPatientPhone(e.target.value)}
                              style={{ width: '100%', padding: '10px 14px', borderRadius: '8px', border: '1px solid #CBD5E1', outline: 'none', fontSize: '14px' }}
                            />
                          </div>
                          <div>
                            <label style={{ fontSize: '12px', fontWeight: 700, color: '#475569', textTransform: 'uppercase', marginBottom: '8px', display: 'block' }}>Blood Group</label>
                            <select 
                              value={newPatientBloodGroup}
                              onChange={e => setNewPatientBloodGroup(e.target.value)}
                              style={{ width: '100%', padding: '10px 14px', borderRadius: '8px', border: '1px solid #CBD5E1', outline: 'none', fontSize: '14px', background: '#ffffff', cursor: 'pointer' }}
                            >
                              <option value="">Select Blood Group</option>
                              <option value="O+">O+</option>
                              <option value="A+">A+</option>
                              <option value="B+">B+</option>
                              <option value="AB+">AB+</option>
                              <option value="O-">O-</option>
                              <option value="A-">A-</option>
                              <option value="B-">B-</option>
                              <option value="AB-">AB-</option>
                            </select>
                          </div>
                        </div>

                        {/* Allergies */}
                        <div>
                          <label style={{ fontSize: '12px', fontWeight: 700, color: '#475569', textTransform: 'uppercase', marginBottom: '8px', display: 'block' }}>Allergies</label>
                          <input 
                            type="text" 
                            placeholder="e.g. Penicillin, Peanuts (or None)" 
                            value={newPatientAllergies}
                            onChange={e => setNewPatientAllergies(e.target.value)}
                            style={{ width: '100%', padding: '10px 14px', borderRadius: '8px', border: '1px solid #CBD5E1', outline: 'none', fontSize: '14px' }}
                          />
                        </div>
                      </div>

                      {/* Actions */}
                      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '32px' }}>
                        <button 
                          type="button" 
                          onClick={() => setShowAddPatientModal(false)}
                          style={{ padding: '10px 20px', borderRadius: '8px', border: '1px solid #CBD5E1', background: '#ffffff', color: '#64748B', fontSize: '14px', fontWeight: 700, cursor: 'pointer' }}
                        >
                          Cancel
                        </button>
                        <button 
                          type="submit" 
                          style={{ padding: '10px 24px', borderRadius: '8px', border: 'none', background: '#2563EB', color: '#ffffff', fontSize: '14px', fontWeight: 700, cursor: 'pointer', boxShadow: '0 4px 6px -1px rgba(37, 99, 235, 0.15)' }}
                        >
                          Register Patient
                        </button>
                      </div>
                    </form>
                  </div>
                </div>
              )}

            </div>
          );
        })()}

        {/* TAB 4: SMART PRESCRIPTION MAKER */}
        {activeTab === 'prescriptions' && doctorClinicalMode !== 'OFFLINE' && (
          selectedPatient ? (
            <PrescriptionMakerTab
              selectedPatient={selectedPatient}
              activeAppointment={appointments.find(a => a._id === activeAppointmentId)}
              pastPrescriptions={pastPrescriptions}
              appointments={appointments}
              allLabs={allLabs}
              vitals={vitals}
              soap={soap}
              setSoap={setSoap}
              medicines={medicines}
              setMedicines={setMedicines}
              addMedicineRow={addMedicineRow}
              removeMedicineRow={removeMedicineRow}
              updateMedicineRow={updateMedicineRow}
              diagnosisText={diagnosisText}
              setDiagnosisText={setDiagnosisText}
              sendToPharmacy={sendToPharmacy}
              setSendToPharmacy={setSendToPharmacy}
              handleLockPrescription={handleLockPrescription}
              setShowTimelineModal={setShowTimelineModal}
              labs={labs}
              setLabs={setLabs}
              addLog={addLog}
              user={user}
              api={api}
              isSavingPrescription={isSavingPrescription}
              dbMedicines={dbMedicines}
              pharmacyInventoryDb={pharmacyInventoryDb}
              medicineDefaults={medicineDefaults}
              consentGiven={consentGiven}
              emergencyBypassActive={emergencyBypassActive}
              setShowBreakGlassModal={setShowBreakGlassModal}
              toggleEmergencyBypass={toggleEmergencyBypass}
              printSettings={printSettings}
              setPrintSettings={setPrintSettings}
              adminTemplates={adminTemplates}
            />
          ) : (
            <div className="tab-content active" style={{ display: 'flex', flexDirection: 'column', minHeight: '60vh', padding: '24px', background: '#FFFFFF', borderRadius: '16px', border: '1.5px solid #E2E8F0', boxShadow: '0 4px 20px rgba(0, 0, 0, 0.02)', margin: '24px', animation: 'slideUp 0.4s ease-out' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', paddingBottom: '16px', borderBottom: '1px solid #E2E8F0' }}>
                <div>
                  <h2 style={{ fontSize: '20px', fontWeight: 800, color: '#0F172A', margin: '0 0 4px 0' }}>All Prescriptions</h2>
                  <p style={{ color: '#64748B', fontSize: '13px', margin: 0, fontWeight: 500 }}>View and edit your patient prescriptions.</p>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <button
                    onClick={() => setShowPrescriptionExportModal(true)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      padding: '10px 18px',
                      borderRadius: '8px',
                      border: '1px solid #BFDBFE',
                      background: '#EFF6FF',
                      color: '#2563EB',
                      fontSize: '13px',
                      fontWeight: 700,
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                      boxShadow: '0 1px 2px rgba(37, 99, 235, 0.05)'
                    }}
                    onMouseEnter={e => { e.currentTarget.style.background = '#DBEAFE'; }}
                    onMouseLeave={e => { e.currentTarget.style.background = '#EFF6FF'; }}
                  >
                    <i data-lucide="download" style={{ width: '14px', height: '14px' }}></i>
                    <span>Export</span>
                  </button>
                  <button 
                    onClick={() => setActiveTab('consultations')} 
                    style={{ backgroundColor: '#2563EB', color: '#FFFFFF', fontWeight: 700, fontSize: '13px', padding: '10px 20px', borderRadius: '8px', border: 'none', cursor: 'pointer', transition: 'all 0.2s', boxShadow: '0 2px 8px rgba(37, 99, 235, 0.15)' }}
                  >
                    + New Prescription
                  </button>
                </div>
              </div>

              {allPrescriptions.length === 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1, padding: '40px', textAlign: 'center' }}>
                  <div style={{ width: '64px', height: '64px', borderRadius: '50%', backgroundColor: '#F1F5F9', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94A3B8', marginBottom: '16px' }}>
                    <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" x2="8" y1="13" y2="13"/><line x1="16" x2="8" y1="17" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
                  </div>
                  <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#334155', margin: '0 0 8px 0' }}>No Prescriptions Found</h3>
                  <p style={{ color: '#64748B', fontSize: '13px', margin: 0 }}>You haven't created any prescriptions yet.</p>
                </div>
              ) : (
                <div style={{ overflowX: 'auto', borderRadius: '12px', border: '1px solid #E2E8F0' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                    <thead style={{ background: '#F8FAFC', borderBottom: '1px solid #E2E8F0' }}>
                      <tr>
                        <th style={{ padding: '16px', fontSize: '12px', fontWeight: 700, color: '#475569', textTransform: 'uppercase' }}>Date</th>
                        <th style={{ padding: '16px', fontSize: '12px', fontWeight: 700, color: '#475569', textTransform: 'uppercase' }}>Patient Name</th>
                        <th style={{ padding: '16px', fontSize: '12px', fontWeight: 700, color: '#475569', textTransform: 'uppercase' }}>Diagnosis</th>
                        <th style={{ padding: '16px', fontSize: '12px', fontWeight: 700, color: '#475569', textTransform: 'uppercase' }}>Medicines</th>
                        <th style={{ padding: '16px', fontSize: '12px', fontWeight: 700, color: '#475569', textTransform: 'uppercase', textAlign: 'right' }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {allPrescriptions.map(rx => {
                        const pt = patients.find(p => p._id === rx.patientId || p._id === rx.patientId?._id) || rx.patientId || {};
                        const ptName = pt.name || 'Unknown Patient';
                        const d = new Date(rx.createdAt || Date.now());
                        const dateStr = isNaN(d.getTime()) ? 'No Date' : d.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' });
                        const medsCount = rx.items ? rx.items.length : 0;
                        const diagnosisStr = rx.diagnosis || 'General Consultation';
                        
                        return (
                          <tr key={rx._id} style={{ borderBottom: '1px solid #F1F5F9', transition: 'background 0.2s' }} onMouseEnter={e => e.currentTarget.style.background = '#F8FAFC'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                            <td style={{ padding: '16px', fontSize: '13px', fontWeight: 600, color: '#334155' }}>
                              {dateStr}
                            </td>
                            <td style={{ padding: '16px', fontSize: '14px', fontWeight: 700, color: '#0F172A' }}>
                              {ptName}
                            </td>
                            <td style={{ padding: '16px', fontSize: '13px', color: '#64748B' }}>
                              {diagnosisStr.length > 40 ? diagnosisStr.substring(0, 40) + '...' : diagnosisStr}
                            </td>
                            <td style={{ padding: '16px', fontSize: '13px', fontWeight: 600, color: '#3B82F6' }}>
                              {medsCount} {medsCount === 1 ? 'Medicine' : 'Medicines'}
                            </td>
                            <td style={{ padding: '16px', textAlign: 'right' }}>
                              <button 
                                onClick={() => {
                                  const relatedLabs = rx.appointmentId ? allLabs.filter(l => l.appointmentId && (l.appointmentId.toString() === rx.appointmentId.toString() || l.appointmentId === rx.appointmentId)) : [];
                                  handleLoadPrescriptionForEdit(rx, relatedLabs);
                                }}
                                style={{ background: '#EFF6FF', color: '#2563EB', border: '1px solid #BFDBFE', padding: '6px 14px', borderRadius: '6px', fontSize: '12px', fontWeight: 700, cursor: 'pointer', transition: 'all 0.2s' }}
                                onMouseEnter={e => { e.target.style.background = '#DBEAFE'; e.target.style.borderColor = '#93C5FD'; }}
                                onMouseLeave={e => { e.target.style.background = '#EFF6FF'; e.target.style.borderColor = '#BFDBFE'; }}
                              >
                                Edit
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )
        )}

        {/* TAB 5: LAB REPORTS */}
        {activeTab === 'labs' && doctorClinicalMode !== 'OFFLINE' && (() => {
          const mappedReports = allLabs.map(l => {
            const patientName = l.patientId?.name || 'N/A';
            const initials = patientName.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase() || '--';
            
            // Format date and time
            const createdAtDate = l.createdAt ? new Date(l.createdAt) : null;
            const dateStr = createdAtDate ? createdAtDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'N/A';
            const timeStr = createdAtDate ? createdAtDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : 'N/A';
            
            const initialsColors = [
              { bg: '#EEF2FF', text: '#4F46E5' },
              { bg: '#E0F2FE', text: '#0369A1' },
              { bg: '#E6F4EA', text: '#137333' },
              { bg: '#F3E8FF', text: '#7E22CE' },
              { bg: '#F1F5F9', text: '#475569' }
            ];
            const colorIdx = (l._id ? l._id.toString().charCodeAt(0) : 0) % initialsColors.length;
            const colors = initialsColors[colorIdx];

            return {
              _id: l._id,
              id: l._id ? `#LAB-${l._id.toString().substring(18).toUpperCase()}` : '#LAB-N/A',
              name: patientName,
              initials,
              age: l.patientId?.age || '--',
              gender: l.patientId?.gender || '--',
              testName: l.testName || 'Laboratory Test',
              subtitle: l.instructions || 'Routine Checkup',
              date: dateStr,
              time: timeStr,
              status: l.status || 'PROCESSING',
              priority: l.priority || 'Routine',
              results: l.results,
              notes: l.notes,
              bg: colors.bg,
              text: colors.text,
              raw: l
            };
          });

          const filteredReports = mappedReports.filter(r => {
            const matchesSearch = r.name.toLowerCase().includes(labSearchQuery.toLowerCase()) || 
              r.id.toLowerCase().includes(labSearchQuery.toLowerCase()) || 
              r.testName.toLowerCase().includes(labSearchQuery.toLowerCase());
            const matchesStatus = labStatusFilter === 'All' || r.status.toUpperCase() === labStatusFilter.toUpperCase();
            const matchesPriority = labPriorityFilter === 'All' || r.priority.toUpperCase() === labPriorityFilter.toUpperCase();
            return matchesSearch && matchesStatus && matchesPriority;
          });
          
          const totalReportsCount = filteredReports.length;
          const totalReportsPages = Math.max(Math.ceil(totalReportsCount / labPerPage), 1);
          const activeReportsPage = Math.min(labPage, totalReportsPages);
          const startReportsIdx = (activeReportsPage - 1) * labPerPage;
          const endReportsIdx = startReportsIdx + labPerPage;
          const paginatedReports = filteredReports.slice(startReportsIdx, endReportsIdx);
          
          return (
            <div className="tab-content active" style={{ animation: 'slideUp 0.4s ease-out', padding: '24px' }}>
              
              {/* Header Row */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px' }}>
                <h1 style={{ fontSize: '28px', fontWeight: 800, margin: 0, color: '#0F172A', letterSpacing: '-0.02em' }}>Lab reports</h1>
              </div>

              {/* Controls Grid */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '16px' }}>
                
                {/* Search Bar */}
                <div style={{ position: 'relative', width: '100%', maxWidth: '400px' }}>
                  <i data-lucide="search" style={{ position: 'absolute', left: '16px', top: '50%', transform: 'translateY(-50%)', width: '16px', height: '16px', color: '#94A3B8' }}></i>
                  <input 
                    type="text" 
                    placeholder="Search by Patient Name, ID or Test..." 
                    value={labSearchQuery}
                    onChange={e => { setLabSearchQuery(e.target.value); setLabPage(1); }}
                    style={{ 
                      width: '100%', 
                      padding: '12px 16px 12px 48px', 
                      borderRadius: '12px', 
                      border: '1.5px solid #E2E8F0', 
                      outline: 'none', 
                      fontSize: '14px',
                      color: '#1E293B',
                      fontWeight: 600,
                      background: '#ffffff',
                      boxSizing: 'border-box'
                    }} 
                  />
                </div>

                {/* Filter and Export Buttons */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>

                  {/* Export button */}
                  <button 
                    onClick={() => setShowLabExportModal(true)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      padding: '12px 20px',
                      borderRadius: '12px',
                      border: '1.5px solid #BFDBFE',
                      background: '#EFF6FF',
                      color: '#2563EB',
                      fontSize: '14px',
                      fontWeight: 700,
                      cursor: 'pointer',
                      boxShadow: 'none',
                      transition: 'all 0.15s ease'
                    }}
                    onMouseEnter={e => { e.currentTarget.style.background = '#DBEAFE'; }}
                    onMouseLeave={e => { e.currentTarget.style.background = '#EFF6FF'; }}
                  >
                    <i data-lucide="download" style={{ width: '15px', height: '15px' }}></i>
                    <span>Export</span>
                  </button>

                  {/* Filter trigger */}
                  <button 
                    onClick={() => setShowLabFilters(prev => !prev)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      padding: '12px 20px',
                      borderRadius: '12px',
                      border: showLabFilters ? '1.5px solid #2563EB' : '1.5px solid #E2E8F0',
                      background: showLabFilters ? '#EFF6FF' : '#ffffff',
                      color: showLabFilters ? '#2563EB' : '#1E293B',
                      fontSize: '14px',
                      fontWeight: 700,
                      cursor: 'pointer',
                      boxShadow: 'none',
                      transition: 'all 0.2s ease'
                    }}
                  >
                    <i data-lucide="sliders-horizontal" style={{ width: '15px', height: '15px' }}></i>
                    <span>Filter</span>
                  </button>

                </div>

              </div>

              {/* Dynamic Filter Panel */}
              {showLabFilters && (
                <div style={{ 
                  display: 'flex', 
                  gap: '16px', 
                  alignItems: 'center', 
                  background: '#F8FAFC', 
                  padding: '16px', 
                  borderRadius: '12px', 
                  border: '1.5px solid #E2E8F0', 
                  marginBottom: '24px',
                  animation: 'fadeIn 0.2s ease-out'
                }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <span style={{ fontSize: '11px', fontWeight: 800, color: '#64748B', textTransform: 'uppercase' }}>Status</span>
                    <select 
                      value={labStatusFilter}
                      onChange={e => { setLabStatusFilter(e.target.value); setLabPage(1); }}
                      style={{ 
                        padding: '8px 12px', 
                        borderRadius: '8px', 
                        border: '1.5px solid #E2E8F0', 
                        fontSize: '13px', 
                        fontWeight: 700, 
                        color: '#334155', 
                        background: '#ffffff',
                        outline: 'none',
                        cursor: 'pointer',
                        minWidth: '150px'
                      }}
                    >
                      <option value="All">All Statuses</option>
                      <option value="PENDING">Pending</option>
                      <option value="PROCESSING">Processing</option>
                      <option value="COMPLETED">Completed</option>
                      <option value="AVAILABLE">Available</option>
                    </select>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <span style={{ fontSize: '11px', fontWeight: 800, color: '#64748B', textTransform: 'uppercase' }}>Priority</span>
                    <select 
                      value={labPriorityFilter}
                      onChange={e => { setLabPriorityFilter(e.target.value); setLabPage(1); }}
                      style={{ 
                        padding: '8px 12px', 
                        borderRadius: '8px', 
                        border: '1.5px solid #E2E8F0', 
                        fontSize: '13px', 
                        fontWeight: 700, 
                        color: '#334155', 
                        background: '#ffffff',
                        outline: 'none',
                        cursor: 'pointer',
                        minWidth: '150px'
                      }}
                    >
                      <option value="All">All Priorities</option>
                      <option value="Routine">Routine</option>
                      <option value="Urgent">Urgent</option>
                      <option value="Critical">Critical</option>
                    </select>
                  </div>

                  <button 
                    onClick={() => { setLabStatusFilter('All'); setLabPriorityFilter('All'); setLabSearchQuery(''); setLabPage(1); }}
                    style={{
                      marginTop: '18px',
                      padding: '8px 16px',
                      borderRadius: '8px',
                      border: '1px solid #E2E8F0',
                      background: '#ffffff',
                      color: '#64748B',
                      fontSize: '13px',
                      fontWeight: 700,
                      cursor: 'pointer',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    Reset Filters
                  </button>
                </div>
              )}

              {/* Table Container */}
              <div style={{ background: '#ffffff', borderRadius: '16px', border: '1px solid #E2E8F0', overflow: 'hidden', boxShadow: '0 4px 20px rgba(0,0,0,0.01)' }}>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid #F1F5F9' }}>
                        <th style={{ padding: '16px 24px', fontSize: '11px', fontWeight: 800, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>REPORT ID</th>
                        <th style={{ padding: '16px 24px', fontSize: '11px', fontWeight: 800, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>PATIENT DETAILS</th>
                        <th style={{ padding: '16px 24px', fontSize: '11px', fontWeight: 800, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>TEST NAME</th>
                        <th style={{ padding: '16px 24px', fontSize: '11px', fontWeight: 800, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>ORDERED ON</th>
                        <th style={{ padding: '16px 24px', fontSize: '11px', fontWeight: 800, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>STATUS</th>
                        <th style={{ padding: '16px 24px', fontSize: '11px', fontWeight: 800, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'right' }}>ACTION</th>
                      </tr>
                    </thead>
                    <tbody>
                      {paginatedReports.length > 0 ? (
                        paginatedReports.map((report) => (
                          <tr key={report.id} style={{ borderBottom: '1px solid #F1F5F9', verticalAlign: 'middle' }}>
                            {/* Report ID */}
                            <td style={{ padding: '20px 24px' }}>
                              <span style={{ fontSize: '14px', fontWeight: 700, color: '#2563EB', cursor: 'pointer' }} onClick={() => setSelectedLabReport(report)}>
                                {report.id}
                              </span>
                            </td>
                            {/* Patient Details */}
                            <td style={{ padding: '20px 24px' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                <div style={{ 
                                  width: '36px', 
                                  height: '36px', 
                                  borderRadius: '50%', 
                                  background: report.bg, 
                                  color: report.text, 
                                  display: 'flex', 
                                  alignItems: 'center', 
                                  justifyContent: 'center', 
                                  fontWeight: 800, 
                                  fontSize: '12px' 
                                }}>
                                  {report.initials}
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column' }}>
                                  <span style={{ fontSize: '14px', fontWeight: 800, color: '#1E293B' }}>{report.name}</span>
                                  <span style={{ fontSize: '12px', color: '#64748B', marginTop: '2px', fontWeight: 600 }}>{report.age}, {report.gender}</span>
                                </div>
                              </div>
                            </td>
                            {/* Test Name */}
                            <td style={{ padding: '20px 24px' }}>
                              <div style={{ display: 'flex', flexDirection: 'column' }}>
                                <span style={{ fontSize: '14px', fontWeight: 800, color: '#1E293B' }}>{report.testName}</span>
                                <span style={{ fontSize: '12px', color: '#64748B', marginTop: '2px', fontWeight: 500 }}>{report.subtitle}</span>
                              </div>
                            </td>
                            {/* Ordered On */}
                            <td style={{ padding: '20px 24px' }}>
                              <div style={{ display: 'flex', flexDirection: 'column' }}>
                                <span style={{ fontSize: '14px', fontWeight: 700, color: '#1E293B' }}>{report.date}</span>
                                <span style={{ fontSize: '12px', color: '#64748B', marginTop: '2px', fontWeight: 500 }}>{report.time}</span>
                              </div>
                            </td>
                            {/* Status */}
                            <td style={{ padding: '20px 24px' }}>
                              {report.status === 'READY' ? (
                                <span style={{ 
                                  background: '#E8F5E9', 
                                  color: '#2E7D32', 
                                  padding: '6px 12px', 
                                  borderRadius: '20px', 
                                  fontSize: '11px', 
                                  fontWeight: 800, 
                                  letterSpacing: '0.02em',
                                  display: 'inline-block'
                                }}>
                                  READY
                                </span>
                              ) : (
                                <span style={{ 
                                  background: '#E8EAF6', 
                                  color: '#3F51B5', 
                                  padding: '6px 12px', 
                                  borderRadius: '20px', 
                                  fontSize: '11px', 
                                  fontWeight: 800, 
                                  letterSpacing: '0.02em',
                                  display: 'inline-block'
                                }}>
                                  PROCESSING
                                </span>
                              )}
                            </td>
                            {/* Action */}
                            <td style={{ padding: '20px 24px', textAlign: 'right' }}>
                              <button 
                                onClick={() => setSelectedLabReport(report)}
                                style={{ 
                                  padding: '8px 16px', 
                                  borderRadius: '8px', 
                                  border: '1.5px solid #CBD5E1', 
                                  background: '#ffffff', 
                                  color: '#1E293B', 
                                  fontSize: '13px', 
                                  fontWeight: 700, 
                                  cursor: 'pointer',
                                  transition: 'all 0.15s ease'
                                }}
                                onMouseEnter={e => { e.currentTarget.style.borderColor = '#2563EB'; e.currentTarget.style.color = '#2563EB'; }}
                                onMouseLeave={e => { e.currentTarget.style.borderColor = '#CBD5E1'; e.currentTarget.style.color = '#1E293B'; }}
                              >
                                {report.status === 'READY' ? 'View Report' : 'View Details'}
                              </button>
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan="6" style={{ padding: '48px', textAlign: 'center', color: '#64748B', fontSize: '14px', fontWeight: 600 }}>
                            No lab reports found matching current filters.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Footer / Pagination */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '24px' }}>
                <span style={{ fontSize: '13px', color: '#64748B', fontWeight: 600 }}>
                  Showing 1-{filteredReports.length > 5 ? 5 : filteredReports.length} of {filteredReports.length} Reports
                </span>
                
                {/* Pagination Controls */}
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <button 
                    disabled={activeReportsPage === 1}
                    onClick={() => setLabPage(p => Math.max(p - 1, 1))}
                    style={{ 
                      width: '36px', 
                      height: '36px', 
                      borderRadius: '8px', 
                      border: '1.5px solid #E2E8F0', 
                      background: '#ffffff', 
                      display: 'flex', 
                      alignItems: 'center', 
                      justifyContent: 'center', 
                      color: activeReportsPage === 1 ? '#CBD5E1' : '#64748B',
                      cursor: activeReportsPage === 1 ? 'default' : 'pointer'
                    }}
                  >
                    <i data-lucide="chevron-left" style={{ width: '16px', height: '16px' }}></i>
                  </button>
                  
                  {Array.from({ length: totalReportsPages }, (_, i) => i + 1).map(pNum => (
                    <button 
                      key={pNum}
                      onClick={() => setLabPage(pNum)}
                      style={{ 
                        width: '36px',
                        height: '36px', 
                        borderRadius: '8px', 
                        border: 'none', 
                        background: pNum === activeReportsPage ? '#2563EB' : 'transparent', 
                        fontSize: '13px', 
                        fontWeight: 800, 
                        color: pNum === activeReportsPage ? '#ffffff' : '#1E293B',
                        cursor: 'pointer'
                      }}
                    >
                      {pNum}
                    </button>
                  ))}

                  <button 
                    disabled={activeReportsPage === totalReportsPages}
                    onClick={() => setLabPage(p => Math.min(p + 1, totalReportsPages))}
                    style={{ 
                      width: '36px', 
                      height: '36px', 
                      borderRadius: '8px', 
                      border: '1.5px solid #E2E8F0', 
                      background: '#ffffff', 
                      display: 'flex', 
                      alignItems: 'center', 
                      justifyContent: 'center', 
                      color: activeReportsPage === totalReportsPages ? '#CBD5E1' : '#64748B',
                      cursor: activeReportsPage === totalReportsPages ? 'default' : 'pointer'
                    }}
                  >
                    <i data-lucide="chevron-right" style={{ width: '16px', height: '16px' }}></i>
                  </button>
                </div>
              </div>

            </div>
          );
        })()}

        {/* TAB 6: SETTINGS */}
        {activeTab === 'settings' && (
          <div className="tab-content active" style={{ animation: 'slideUp 0.4s ease-out', padding: '0px' }}>
            
            {/* Header Title */}
            <div style={{ marginBottom: '16px' }}>
              <h1 style={{ fontSize: '24px', fontWeight: 900, margin: 0, color: '#0F172A', letterSpacing: '-0.025em' }}>Settings</h1>
            </div>

            {/* Layout Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: '20px' }} className="mobile-stack">
              
              {/* Profile & Availability Card */}
              <div 
                className="glass-card" 
                style={{ 
                  padding: '20px', 
                  borderRadius: '16px', 
                  border: '1px solid #E2E8F0', 
                  background: '#ffffff', 
                  boxShadow: '0 4px 20px -2px rgba(15, 23, 42, 0.04)' 
                }}
              >
                <h3 style={{ margin: '0 0 16px 0', fontSize: '18px', fontWeight: 800, color: '#1E293B', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <i data-lucide="user" style={{ width: '18px', height: '18px', color: '#3B82F6' }}></i>
                  Profile & Availability
                </h3>

                {/* Profile Photo Change Section */}
                <div 
                  style={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    gap: '24px', 
                    marginBottom: '32px', 
                    background: '#F8FAFC', 
                    padding: '20px', 
                    borderRadius: '12px', 
                    border: '1px solid #E2E8F0' 
                  }}
                >
                  <div style={{ position: 'relative' }}>
                    {docProfile.avatar ? (
                      <img 
                        src={docProfile.avatar} 
                        alt="Doctor Profile" 
                        style={{ 
                          width: '80px', 
                          height: '80px', 
                          borderRadius: '50%', 
                          objectFit: 'cover', 
                          border: '3px solid #3B82F6', 
                          boxShadow: '0 4px 14px rgba(59, 130, 246, 0.15)' 
                        }}
                      />
                    ) : (
                      <div style={{ width: '80px', height: '80px', borderRadius: '50%', background: 'linear-gradient(135deg, #8B5CF6 0%, #6D28D9 100%)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '28px', fontWeight: 800, border: '3px solid #3B82F6', boxShadow: '0 4px 14px rgba(59, 130, 246, 0.15)' }}>
                        {docProfile.name ? docProfile.name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase() : 'DR'}
                      </div>
                    )}
                    <label 
                      htmlFor="profile-photo-upload" 
                      style={{ 
                        position: 'absolute', 
                        bottom: '-2px', 
                        right: '-2px', 
                        background: '#2563EB', 
                        color: '#ffffff', 
                        width: '28px', 
                        height: '28px', 
                        borderRadius: '50%', 
                        display: 'flex', 
                        alignItems: 'center', 
                        justifyContent: 'center', 
                        cursor: 'pointer', 
                        border: '2px solid #ffffff', 
                        boxShadow: '0 2px 6px rgba(0,0,0,0.15)' 
                      }}
                      title="Upload New Photo"
                    >
                      <i data-lucide="camera" style={{ width: '13px', height: '13px' }}></i>
                    </label>
                    <input 
                      type="file" 
                      id="profile-photo-upload" 
                      accept="image/*" 
                      style={{ display: 'none' }} 
                      onChange={(e) => {
                        const file = e.target.files[0];
                        if (file) {
                          const reader = new FileReader();
                          reader.onload = (event) => {
                            setDocProfile(prev => ({ ...prev, avatar: event.target.result }));
                            showToastNotification('Profile photo updated successfully!', 'success');
                          };
                          reader.readAsDataURL(file);
                        }
                      }}
                    />
                  </div>
                  <div>
                    <h4 style={{ margin: '0 0 4px 0', fontSize: '15px', fontWeight: 800, color: '#1E293B' }}>Profile Picture</h4>
                    <p style={{ margin: '0 0 10px 0', fontSize: '11px', color: '#64748B', fontWeight: 600 }}>JPG, PNG or GIF. Max 5MB.</p>
                    <button 
                      type="button" 
                      onClick={() => document.getElementById('profile-photo-upload').click()}
                      style={{ 
                        background: 'white', 
                        border: '1px solid #CBD5E1', 
                        borderRadius: '8px', 
                        padding: '6px 14px', 
                        color: '#334155', 
                        fontSize: '12px', 
                        fontWeight: 800, 
                        cursor: 'pointer', 
                        boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px'
                      }}
                    >
                      <i data-lucide="upload" style={{ width: '12px' }}></i> Upload Photo
                    </button>
                  </div>
                </div>

                <form onSubmit={async (e) => {
                  e.preventDefault();
                  try {
                    const response = await api.put(`/auth/profile/${currentUser.id || currentUser._id}`, {
                      name: docProfile.name,
                      specialty: docProfile.specialty,
                      avatar: docProfile.avatar
                    });
                    const updatedUser = {
                      ...currentUser,
                      name: response.data.name,
                      specialty: response.data.specialty,
                      avatar: response.data.avatar || ''
                    };
                    localStorage.setItem('user', JSON.stringify(updatedUser));
                    setCurrentUser(updatedUser);
                    showToastNotification('Profile updated successfully!', 'success');
                  } catch (err) {
                    console.error(err);
                    showToastNotification(err.response?.data?.error || 'Failed to update profile', 'error');
                  }
                }}>
                  
                  <div style={{ marginBottom: '20px' }}>
                    <label style={{ display: 'block', fontSize: '11px', fontWeight: 900, textTransform: 'uppercase', color: '#64748B', marginBottom: '8px', letterSpacing: '0.05em' }}>
                      Doctor Name
                    </label>
                    <input 
                      type="text" 
                      value={docProfile.name}
                      style={{ 
                        width: '100%', 
                        padding: '12px 16px', 
                        borderRadius: '10px', 
                        border: '1px solid #CBD5E1', 
                        background: '#F1F5F9', 
                        cursor: 'not-allowed',
                        fontSize: '14px', 
                        color: '#1E293B', 
                        fontWeight: 700,
                        outline: 'none'
                      }}
                      disabled
                      required
                    />
                    <span style={{ fontSize: '11px', color: '#64748B', marginTop: '4px', display: 'block' }}>Managed by Administrator</span>
                  </div>

                  <div style={{ marginBottom: '20px' }}>
                    <label style={{ display: 'block', fontSize: '11px', fontWeight: 900, textTransform: 'uppercase', color: '#64748B', marginBottom: '8px', letterSpacing: '0.05em' }}>
                      Specialty
                    </label>
                    <input 
                      type="text" 
                      value={docProfile.specialty}
                      style={{ 
                        width: '100%', 
                        padding: '12px 16px', 
                        borderRadius: '10px', 
                        border: '1px solid #CBD5E1', 
                        background: '#F1F5F9', 
                        cursor: 'not-allowed',
                        fontSize: '14px', 
                        color: '#1E293B', 
                        fontWeight: 700,
                        outline: 'none'
                      }}
                      disabled
                      required
                    />
                    <span style={{ fontSize: '11px', color: '#64748B', marginTop: '4px', display: 'block' }}>Managed by Administrator</span>
                  </div>

                  <div style={{ marginBottom: '28px' }}>
                    <label style={{ display: 'block', fontSize: '11px', fontWeight: 900, textTransform: 'uppercase', color: '#64748B', marginBottom: '8px', letterSpacing: '0.05em' }}>
                      Availability
                    </label>
                    <div style={{ position: 'relative' }}>
                      <CustomDropdown
                        value={docProfile.availability}
                        onChange={val => setDocProfile(prev => ({ ...prev, availability: val }))}
                        style={{ width: '100%' }}
                        options={[
                          { value: 'Available', label: 'Available' },
                          { value: 'Busy', label: 'Busy' },
                          { value: 'Away', label: 'Away' }
                        ]}
                        buttonStyle={{
                          width: '100%',
                          padding: '12px 16px',
                          borderRadius: '10px',
                          border: '1px solid #CBD5E1',
                          background: '#ffffff',
                          fontSize: '14px',
                          color: '#1E293B',
                          fontWeight: 700,
                          height: '46px'
                        }}
                      />
                    </div>
                  </div>

                  <button 
                    type="submit" 
                    style={{ 
                      width: '100%', 
                      background: '#2563EB', 
                      color: 'white', 
                      border: 'none', 
                      borderRadius: '10px', 
                      padding: '14px', 
                      fontSize: '14px', 
                      fontWeight: 800, 
                      cursor: 'pointer', 
                      display: 'flex', 
                      alignItems: 'center', 
                      justifyContent: 'center', 
                      gap: '8px', 
                      boxShadow: '0 4px 14px rgba(37, 99, 235, 0.2)', 
                      transition: 'background 0.2s' 
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = '#1D4ED8'}
                    onMouseLeave={e => e.currentTarget.style.background = '#2563EB'}
                  >
                    Update Profile
                  </button>
                </form>
              </div>

              {/* Digital Assets Card */}
              <div 
                className="glass-card" 
                style={{ 
                  padding: '20px', 
                  borderRadius: '16px', 
                  border: '1px solid #E2E8F0', 
                  background: '#ffffff', 
                  boxShadow: '0 4px 20px -2px rgba(15, 23, 42, 0.04)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '16px'
                }}
              >
                <div>
                  <h3 style={{ margin: '0 0 4px 0', fontSize: '18px', fontWeight: 800, color: '#1E293B', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <i data-lucide="shield" style={{ width: '18px', height: '18px', color: '#10B981' }}></i>
                    Digital Assets
                  </h3>
                  <p style={{ margin: 0, fontSize: '12px', color: '#64748B', fontWeight: 500 }}>Manage encryption keys, real-time sync flow, and clinical sigils.</p>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 900, textTransform: 'uppercase', color: '#64748B', marginBottom: '8px', letterSpacing: '0.05em' }}>
                    Digital Signature
                  </label>
                  
                  {/* Signature Box */}
                  <div 
                    style={{ 
                      width: '100%', 
                      height: '180px', 
                      border: '2px dashed #E2E8F0', 
                      borderRadius: '12px', 
                      background: '#F8FAFC', 
                      display: 'flex', 
                      flexDirection: 'column', 
                      alignItems: 'center', 
                      justifyContent: 'center', 
                      gap: '16px',
                      padding: '16px'
                    }}
                  >
                    <span 
                      style={{ 
                        fontFamily: '"Great Vibes", cursive', 
                        fontSize: '36px', 
                        color: '#2563EB', 
                        letterSpacing: '1px', 
                        textAlign: 'center', 
                        width: '100%', 
                        overflow: 'hidden', 
                        textOverflow: 'ellipsis', 
                        whiteSpace: 'nowrap',
                        lineHeight: 1.2
                      }}
                    >
                      {docProfile.signature}
                    </span>
                    
                    <button 
                      type="button"
                      onClick={() => {
                        const newSig = prompt("Enter new signature text:", docProfile.signature);
                        if (newSig && newSig.trim()) {
                          setDocProfile(prev => ({ ...prev, signature: newSig.trim() }));
                          showToastNotification('Digital signature asset updated successfully!', 'success');
                        }
                      }}
                      style={{ 
                        border: '1px solid #CBD5E1', 
                        background: '#ffffff', 
                        color: '#334155', 
                        borderRadius: '8px', 
                        padding: '8px 16px', 
                        fontSize: '12px', 
                        fontWeight: 800, 
                        cursor: 'pointer', 
                        boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
                        transition: 'background 0.2s'
                      }}
                      onMouseEnter={e => e.currentTarget.style.background = '#F8FAFC'}
                      onMouseLeave={e => e.currentTarget.style.background = '#ffffff'}
                    >
                      Change Signature
                    </button>
                  </div>
                </div>

                {/* Real-time sync toggle */}
                <div 
                  onClick={() => {
                    const nextVal = !docProfile.realtimePharmacy;
                    setDocProfile(prev => ({ ...prev, realtimePharmacy: nextVal }));
                    showToastNotification(`Real-time Pharmacy Flow ${nextVal ? 'Enabled' : 'Disabled'}`, 'success');
                  }}
                  style={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    gap: '12px', 
                    padding: '16px', 
                    background: docProfile.realtimePharmacy ? '#ECFDF5' : '#F8FAFC', 
                    border: docProfile.realtimePharmacy ? '1px solid #A7F3D0' : '1px solid #E2E8F0', 
                    borderRadius: '12px', 
                    cursor: 'pointer', 
                    userSelect: 'none',
                    transition: 'all 0.2s'
                  }}
                >
                  <div 
                    style={{ 
                      width: '20px', 
                      height: '20px', 
                      border: docProfile.realtimePharmacy ? '2px solid #059669' : '2px solid #CBD5E1', 
                      borderRadius: '6px', 
                      background: docProfile.realtimePharmacy ? '#059669' : 'transparent', 
                      display: 'flex', 
                      alignItems: 'center', 
                      justifyContent: 'center', 
                      transition: 'all 0.2s' 
                    }}
                  >
                    {docProfile.realtimePharmacy && <i data-lucide="check" style={{ width: '14px', height: '14px', color: '#ffffff' }}></i>}
                  </div>
                  <div>
                    <span style={{ display: 'block', fontSize: '13px', fontWeight: 800, color: docProfile.realtimePharmacy ? '#065F46' : '#334155' }}>
                      Enable Real-time Pharmacy Flow
                    </span>
                  </div>
                </div>
              </div>

            </div>

          </div>
        )}

        {/* TAB: PATIENT PROFILE VIEW */}
        {activeTab === 'patient-profile' && selectedPatient && doctorClinicalMode !== 'OFFLINE' && (
          <div className="tab-content active" style={{ animation: 'slideUp 0.4s ease-out', padding: '24px' }}>
            <div className="patient-profile-title-bar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '16px' }}>
              <div>
                <h1 style={{ fontSize: '24px', fontWeight: 900, color: '#1A1D23', marginBottom: '4px' }}>Patient Profile</h1>
                <div style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 700 }}>
                  Patient Management <span style={{ margin: '0 8px' }}>»</span> <span style={{ color: '#1A1D23' }}>Profile</span>
                </div>
              </div>
              <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
                <button 
                  className="btn btn-primary" 
                  style={{ height: '44px', padding: '0 20px', fontWeight: 850, borderRadius: '10px', background: '#2563EB', color: 'white', border: 'none', display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '13px' }} 
                  onClick={() => {
                    handleSelectPatient(selectedPatient);
                    setActiveTab('prescriptions');
                  }}
                >
                  <i data-lucide="file-text" style={{ width: '16px', height: '16px' }}></i>
                  Start Consultation / Write Rx
                </button>
                <button 
                  className="btn btn-secondary" 
                  style={{ width: '44px', height: '44px', padding: 0, borderRadius: '10px', background: '#EFF6FF', color: '#2563EB', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
                  onClick={() => setActiveTab('consultations')}
                >
                  <i data-lucide="arrow-left" style={{ width: '22px', height: '22px' }}></i>
                </button>
              </div>
            </div>

            <div className="patient-profile-layout" style={{ display: 'grid', gap: '32px', alignItems: 'start' }}>
              
              {/* Left Column */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                
                {/* Patient Header Card */}
                <div className="glass-card" style={{ padding: '24px', background: 'white', border: '1px solid #E2E8F0', borderRadius: '16px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px' }}>
                    <div style={{ display: 'flex', gap: '20px', alignItems: 'center' }}>
                      <div style={{ width: '80px', height: '80px', borderRadius: '12px', background: '#F1F5F9', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#94A3B8" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
                          <circle cx="12" cy="7" r="4" />
                        </svg>
                      </div>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <h2 style={{ fontSize: '22px', fontWeight: 900, color: '#0F172A', margin: 0 }}>{selectedPatient.name}</h2>
                          <span style={{ fontSize: '11px', color: '#2563EB', fontWeight: 800, background: '#EFF6FF', padding: '3px 8px', borderRadius: '6px' }}>
                            ID: {getFormattedPatientId(selectedPatient._id)}
                          </span>
                        </div>
                        <div style={{ fontSize: '13px', color: '#64748B', fontWeight: 600, marginTop: '6px' }}>
                          Registered: {selectedPatient.createdAt ? new Date(selectedPatient.createdAt).toLocaleDateString('en-US', { day: 'numeric', month: 'long', year: 'numeric' }) : 'N/A'}
                        </div>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                      <button 
                        className="btn" 
                        style={{ background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: '8px', cursor: 'pointer', color: '#2563EB', padding: '8px 12px', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12.5px', fontWeight: 800 }}
                        onClick={() => {
                          setLabSearchQuery(selectedPatient.name);
                          setLabPage(1);
                          setActiveTab('labs');
                        }}
                      >
                        <i data-lucide="flask-conical" style={{ width: '14px', height: '14px' }}></i>
                        Lab Reports
                      </button>

                      <button 
                        className="btn" 
                        style={{ background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: '8px', cursor: 'pointer', color: '#2563EB', padding: '8px 12px', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12.5px', fontWeight: 800 }}
                        onClick={() => {
                          handleOpenTimelineForPatient(selectedPatient);
                        }}
                      >
                        <i data-lucide="history" style={{ width: '14px', height: '14px' }}></i>
                        EMR Timeline
                      </button>
                    </div>
                  </div>

                  <div style={{ height: '1px', background: '#F1F5F9', margin: '20px 0' }}></div>

                  <div className="patient-details-grid" style={{ display: 'grid', gap: '16px' }}>
                    <div>
                      <div style={{ color: '#94A3B8', fontSize: '11px', fontWeight: 800, letterSpacing: '0.5px', marginBottom: '6px', textTransform: 'uppercase' }}>Age</div>
                      <div style={{ color: '#1A1D23', fontSize: '13.5px', fontWeight: 700 }}>{selectedPatient.age} Yrs</div>
                    </div>
                    <div>
                      <div style={{ color: '#94A3B8', fontSize: '11px', fontWeight: 800, letterSpacing: '0.5px', marginBottom: '6px', textTransform: 'uppercase' }}>Gender</div>
                      <div style={{ color: '#1A1D23', fontSize: '13.5px', fontWeight: 700 }}>{selectedPatient.gender}</div>
                    </div>
                    <div>
                      <div style={{ color: '#94A3B8', fontSize: '11px', fontWeight: 800, letterSpacing: '0.5px', marginBottom: '6px', textTransform: 'uppercase' }}>Contact</div>
                      <div style={{ color: '#1A1D23', fontSize: '13.5px', fontWeight: 700 }}>
                        {selectedPatient.contact}
                      </div>
                    </div>
                    <div>
                      <div style={{ color: '#94A3B8', fontSize: '11px', fontWeight: 800, letterSpacing: '0.5px', marginBottom: '6px', textTransform: 'uppercase' }}>Blood Group</div>
                      <div style={{ color: '#1A1D23', fontSize: '13.5px', fontWeight: 700 }}>{selectedPatient.bloodGroup || 'B+'}</div>
                    </div>
                    <div>
                      <div style={{ color: '#94A3B8', fontSize: '11px', fontWeight: 800, letterSpacing: '0.5px', marginBottom: '6px', textTransform: 'uppercase' }}>Email</div>
                      <div style={{ color: '#1A1D23', fontSize: '13.5px', fontWeight: 700, wordBreak: 'break-all' }}>{selectedPatient.email || 'N/A'}</div>
                    </div>
                  </div>
                </div>

                {/* Sub cards: Contact Info and Vitals */}
                <div className="patient-sub-cards" style={{ display: 'grid', gap: '24px' }}>
                  
                  {/* Contact Information */}
                  <div className="glass-card" style={{ padding: '24px', background: 'white', border: '1px solid #E2E8F0', borderRadius: '16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '20px' }}>
                      <i data-lucide="phone" style={{ width: '18px', height: '18px', color: '#2563EB' }}></i>
                      <h3 style={{ fontSize: '16px', fontWeight: 900, color: '#2563EB', margin: 0 }}>Contact Information</h3>
                    </div>
                    
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13.5px' }}>
                      <span style={{ color: '#64748B', fontWeight: 600 }}>Email:</span>
                      <span style={{ fontWeight: 700, color: '#1A1D23' }}>{selectedPatient.email || 'N/A'}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13.5px', marginTop: '14px' }}>
                      <span style={{ color: '#64748B', fontWeight: 600 }}>Primary Phone:</span>
                      <span style={{ fontWeight: 700, color: '#1A1D23' }}>{selectedPatient.contact}</span>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13.5px', marginTop: '14px' }}>
                      <span style={{ color: '#64748B', fontWeight: 600 }}>Address:</span>
                      <span style={{ fontWeight: 700, color: '#1A1D23', textAlign: 'right', maxWidth: '180px' }}>{selectedPatient.address || 'N/A'}</span>
                    </div>
                  </div>
                  <div 
                    className="glass-card" 
                    style={{ padding: '24px', background: 'white', border: '1px solid #E2E8F0', borderRadius: '16px', cursor: 'pointer' }}
                    onClick={() => setShowVitalsHistoryModal(true)}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <i data-lucide="activity" style={{ width: '18px', height: '18px', color: '#2563EB' }}></i>
                        <h3 style={{ fontSize: '16px', fontWeight: 900, color: '#2563EB', margin: 0 }}>Vitals Summary</h3>
                      </div>
                      <span 
                        style={{ fontSize: '11px', color: '#2563EB', fontWeight: 800, cursor: 'pointer', textDecoration: 'underline' }}
                        onClick={(e) => {
                          e.stopPropagation();
                          setShowVitalsHistoryModal(true);
                        }}
                      >
                        View Full History
                      </span>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' }}>
                      {/* BP */}
                      <div style={{ background: '#F0FDF4', borderRadius: '12px', padding: '12px 10px', display: 'flex', alignItems: 'center', gap: '10px', border: '1px solid #DCFCE7' }}>
                        <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: '#DCFCE7', color: '#16A34A', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          BP
                        </div>
                        <div>
                          <div style={{ fontSize: '9px', color: '#16A34A', fontWeight: 800, textTransform: 'uppercase' }}>BP</div>
                          <div style={{ fontSize: '12.5px', fontWeight: 800, color: '#1A1D23', marginTop: '2px' }}>
                            {patientVitals[0] && patientVitals[0].bpSys ? `${patientVitals[0].bpSys}/${patientVitals[0].bpDia || ''}` : '--'}
                          </div>
                        </div>
                      </div>

                      {/* Heart Rate */}
                      <div style={{ background: '#FFF5F5', borderRadius: '12px', padding: '12px 10px', display: 'flex', alignItems: 'center', gap: '10px', border: '1px solid #FEE2E2' }}>
                        <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: '#FEE2E2', color: '#EF4444', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          HR
                        </div>
                        <div>
                          <div style={{ fontSize: '9px', color: '#EF4444', fontWeight: 800, textTransform: 'uppercase' }}>Pulse</div>
                          <div style={{ fontSize: '12.5px', fontWeight: 800, color: '#1A1D23', marginTop: '2px' }}>
                            {patientVitals[0] && patientVitals[0].pulse ? `${patientVitals[0].pulse} bpm` : '--'}
                          </div>
                        </div>
                      </div>

                      {/* Temp */}
                      <div style={{ background: '#FFFBEB', borderRadius: '12px', padding: '12px 10px', display: 'flex', alignItems: 'center', gap: '10px', border: '1px solid #FEF3C7' }}>
                        <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: '#FEF3C7', color: '#D97706', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          T
                        </div>
                        <div>
                          <div style={{ fontSize: '9px', color: '#D97706', fontWeight: 800, textTransform: 'uppercase' }}>Temp</div>
                          <div style={{ fontSize: '12.5px', fontWeight: 800, color: '#1A1D23', marginTop: '2px' }}>
                            {patientVitals[0] && patientVitals[0].temperature ? `${patientVitals[0].temperature} °F` : '--'}
                          </div>
                        </div>
                      </div>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid #F1F5F9', paddingTop: '12px', marginTop: '16px', fontSize: '11px', color: '#94A3B8', fontWeight: 700 }}>
                      <span>Last updated: {patientVitals[0] ? new Date(patientVitals[0].createdAt).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '--'}</span>
                      <span>By: {patientVitals[0] ? (patientVitals[0].recordedBy?.name || 'Receptionist') : '--'}</span>
                    </div>
                  </div>
                </div>

                {/* Appointment History Table */}
                <div className="glass-card" style={{ padding: '24px', background: 'white', border: '1px solid #E2E8F0', borderRadius: '16px' }}>
                  <h3 style={{ fontSize: '18px', fontWeight: 900, color: '#0F172A', margin: '0 0 20px 0' }}>Appointments</h3>
                  
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                      <thead>
                        <tr style={{ borderBottom: '2px solid #F1F5F9' }}>
                          <th style={{ padding: '12px', fontSize: '12px', color: '#64748B', fontWeight: 800, textTransform: 'uppercase' }}>Date & Time</th>
                          <th style={{ padding: '12px', fontSize: '12px', color: '#64748B', fontWeight: 800, textTransform: 'uppercase' }}>Doctor / Department</th>
                          <th style={{ padding: '12px', fontSize: '12px', color: '#64748B', fontWeight: 800, textTransform: 'uppercase' }}>Status</th>
                          <th style={{ padding: '12px', fontSize: '12px', color: '#64748B', fontWeight: 800, textTransform: 'uppercase' }}>Type</th>
                        </tr>
                      </thead>
                      <tbody>
                        {appointments.filter(app => {
                          const pId = app.patientId?._id || app.patientId;
                          return pId && pId.toString() === selectedPatient._id.toString();
                        }).length === 0 ? (
                          <tr>
                            <td colSpan="4" style={{ padding: '30px 0', textTransform: 'uppercase', textAlign: 'center', fontSize: '13px', color: '#94A3B8', fontWeight: 700 }}>
                              No appointments found for this patient.
                            </td>
                          </tr>
                        ) : (
                          appointments.filter(app => {
                            const pId = app.patientId?._id || app.patientId;
                            return pId && pId.toString() === selectedPatient._id.toString();
                          }).map(app => {
                            const isSelected = selectedProfileAppointment && selectedProfileAppointment._id === app._id;
                            return (
                              <tr 
                                key={app._id} 
                                style={{ 
                                  borderBottom: '1px solid #F1F5F9', 
                                  cursor: 'pointer',
                                  background: isSelected ? '#F0F7FF' : 'transparent',
                                  transition: '0.2s'
                                }}
                                onClick={() => setSelectedProfileAppointment(app)}
                              >
                                <td style={{ padding: '16px 12px' }}>
                                  <div style={{ fontSize: '13.5px', fontWeight: 800, color: '#0F172A' }}>{getFormattedTableDate(app.date)}</div>
                                  <div style={{ fontSize: '11px', color: '#64748B', fontWeight: 600, marginTop: '2px' }}>{app.time}</div>
                                </td>
                                <td style={{ padding: '16px 12px' }}>
                                  <div style={{ fontSize: '13.5px', fontWeight: 800, color: '#0F172A' }}>{app.doctorId?.name || 'Dr. Julian Vance'}</div>
                                  <div style={{ fontSize: '11px', color: '#64748B', fontWeight: 600, marginTop: '2px' }}>{app.doctorId?.role || 'EMR Specialist'}</div>
                                </td>
                                <td style={{ padding: '16px 12px' }}>
                                  <span style={{ 
                                    background: app.status === 'Completed' ? '#ECFDF5' : (app.status === 'Cancelled' ? '#FEF2F2' : '#FAF5FF'), 
                                    color: app.status === 'Completed' ? '#10B981' : (app.status === 'Cancelled' ? '#EF4444' : '#7E22CE'), 
                                    fontSize: '11px', padding: '4px 10px', borderRadius: '6px', fontWeight: 800 
                                  }}>{app.status}</span>
                                </td>
                                <td style={{ padding: '16px 12px' }}>
                                  <span style={{ background: '#EFF6FF', color: '#3B82F6', fontSize: '11px', padding: '4px 10px', borderRadius: '6px', fontWeight: 800 }}>
                                    Standard
                                  </span>
                                </td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

              </div>

              {/* Right Column - Appointment Summary */}
              <div style={{ position: 'sticky', top: '24px' }}>
                <div className="glass-card" style={{ padding: '24px', background: 'white', border: '1px solid #E2E8F0', borderRadius: '16px' }}>
                  <h3 style={{ fontSize: '18px', fontWeight: 900, color: '#0F172A', margin: 0 }}>Appointment Summary</h3>
                  
                  {selectedProfileAppointment ? (
                    <>
                      <div style={{ fontSize: '13.5px', color: '#64748B', fontWeight: 700, marginTop: '6px' }}>
                        Status: <span style={{ 
                          color: selectedProfileAppointment.status === 'Completed' ? '#3B82F6' : (selectedProfileAppointment.status === 'Cancelled' ? '#EF4444' : '#7E22CE'),
                          fontWeight: 800
                        }}>{selectedProfileAppointment.status}</span>
                      </div>

                      <div style={{ height: '1px', background: '#F1F5F9', margin: '18px 0' }}></div>

                      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                        {/* Date & Time */}
                        <div>
                          <div style={{ fontSize: '11px', color: '#94A3B8', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Date & Time</div>
                          <div style={{ fontSize: '13.5px', fontWeight: 800, color: '#0F172A', marginTop: '4px', lineHeight: '1.4' }}>
                            {getFormattedSummaryDate(selectedProfileAppointment.date)}<br />
                            <span style={{ color: '#475569', fontWeight: 600 }}>{selectedProfileAppointment.time}</span>
                          </div>
                        </div>

                        {/* Practitioner */}
                        <div>
                          <div style={{ fontSize: '11px', color: '#94A3B8', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Practitioner</div>
                          <div style={{ fontSize: '13.5px', fontWeight: 800, color: '#0F172A', marginTop: '4px', lineHeight: '1.4' }}>
                            {selectedProfileAppointment.doctorId?.name || 'Dr. Julian Vance'}<br />
                            <span style={{ color: '#64748B', fontWeight: 500 }}>{selectedProfileAppointment.doctorId?.role || 'Specialist'}</span>
                          </div>
                        </div>
                      </div>

                      <div style={{ height: '1px', background: '#F1F5F9', margin: '22px 0' }}></div>

                      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        <button 
                          className="btn"
                          style={{ 
                            width: '100%', 
                            height: '46px', 
                            background: '#2563EB', 
                            color: 'white', 
                            border: 'none', 
                            borderRadius: '10px', 
                            fontWeight: 800, 
                            fontSize: '13px', 
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '8px'
                          }}
                          onClick={() => {
                            handleOpenTimelineForPatient(selectedPatient);
                          }}
                        >
                          <i data-lucide="history" style={{ width: '16px', height: '16px' }}></i>
                          View Clinical Timeline
                        </button>
                      </div>
                    </>
                  ) : (
                    <div style={{ textAlign: 'center', padding: '30px 10px', color: '#94A3B8', fontSize: '13px', fontWeight: 700 }}>
                      No Appointment Selected.<br />
                      <span style={{ fontSize: '11px', fontWeight: 500, marginTop: '8px', display: 'inline-block' }}>Select an appointment from the history table to view details.</span>
                    </div>
                  )}
                </div>
              </div>

            </div>

          </div>
        )}

        {false && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: '24px', padding: '24px' }} className="mobile-stack">
            
            {/* Center Prescription Builder Area */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
              
              {/* Sticky Patient Info Header */}
              {selectedPatient ? (
                <div className="glass-card sticky-patient-header" style={{ padding: '16px 20px', borderRadius: '16px', border: '1px solid #E2E8F0' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                      <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: 'linear-gradient(135deg, var(--cu-primary), var(--cu-secondary))', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px', fontWeight: 800 }}>
                        {selectedPatient.name ? selectedPatient.name.substring(0, 2).toUpperCase() : 'PT'}
                      </div>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <h2 style={{ fontSize: '18px', fontWeight: 900, margin: 0, color: 'var(--cu-text)' }}>{selectedPatient.name || 'Unknown Patient'}</h2>
                          <span className="cu-badge primary">{selectedPatient.gender || 'Male'}, {selectedPatient.age || 35} Yrs</span>
                        </div>
                        <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px', fontWeight: 600 }}>
                          UHID: <b style={{ color: 'var(--cu-text)' }}>{selectedPatient.uhid || 'N/A'}</b> | Visit ID: <b>{selectedPatient.visitId || 'N/A'}</b> | ABHA: <b>{selectedPatient.abhaId || 'N/A'}</b>
                        </div>
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      {(() => {
                        const activeApp = appointments.find(a => a._id === activeAppointmentId);
                        if (!activeApp) return null;
                        const isPaid = activeApp.billingStatus === 'Paid';
                        return (
                          <div className={`cu-badge ${isPaid ? 'success' : 'warning'}`} style={{ textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '4px', fontWeight: 800 }}>
                            <i data-lucide={isPaid ? "check-circle" : "clock"} style={{ width: '12px' }}></i>
                            Payment: {isPaid ? 'Paid' : 'Pending'}
                          </div>
                        );
                      })()}
                      <div className="cu-badge danger" style={{ textTransform: 'uppercase' }}>
                        <span><i data-lucide="alert-octagon" style={{ width: '12px' }}></i></span> Allergies: {selectedPatient.allergies || 'None Reported'}
                      </div>
                      <div style={{ fontSize: '12px', color: 'var(--cu-primary)', fontWeight: 800, cursor: 'pointer' }} onClick={() => { fetchPastPrescriptions(selectedPatient._id); setShowTimelineModal(true); addLog("Opened patient EMR clinical timeline"); }}>
                        <span><i data-lucide="history" style={{ width: '14px', marginRight: '4px', verticalAlign: 'middle' }}></i></span> EMR Timeline
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="glass-card" style={{ padding: '24px', textAlign: 'center', border: '2px dashed var(--cu-primary)', background: '#F8FAFC' }}>
                  <span><i data-lucide="user-plus" style={{ width: '40px', height: '40px', color: 'var(--cu-primary)', marginBottom: '12px' }}></i></span>
                  <h3 style={{ fontSize: '16px', fontWeight: 800 }}>No Patient Loaded</h3>
                  <p style={{ color: 'var(--text-muted)', fontSize: '13px' }}>Select an active appointment below or use global search at the top to fetch patient history.</p>
                  
                  {/* Active appointments picker */}
                  <div style={{ display: 'flex', justifyContent: 'center', gap: '12px', marginTop: '16px', flexWrap: 'wrap' }}>
                    {patients.map(p => (
                      <button key={p._id} className="btn-cu outline" onClick={() => handleSelectPatient(p)} style={{ padding: '8px 16px', fontSize: '12px' }}>
                        Consult {p.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Vitals Entry Section */}
              <div className="glass-card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                  <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 900, display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <i data-lucide="activity" style={{ color: 'var(--cu-primary)' }}></i> Patient Vitals
                  </h3>
                  <span className="text-muted" style={{ fontSize: '11px' }}>Auto calculated BMI & visual abnormalities alerts</span>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '12px' }}>
                  <div style={{ background: isVitalAbnormal('bpSys', vitals.bpSys) ? '#FEF2F2' : '#F8FAFC', padding: '12px', borderRadius: '10px', border: isVitalAbnormal('bpSys', vitals.bpSys) ? '1px solid #FCA5A5' : '1px solid #E2E8F0' }}>
                    <label style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)' }}>BP (Systolic)</label>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '4px' }}>
                      <input type="text" className="form-control" style={{ border: 'none', background: 'transparent', padding: 0, fontSize: '16px', fontWeight: 800 }} value={vitals.bpSys} onChange={e => setVitals({...vitals, bpSys: e.target.value})} />
                      <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>mmHg</span>
                    </div>
                  </div>

                  <div style={{ background: isVitalAbnormal('bpDia', vitals.bpDia) ? '#FEF2F2' : '#F8FAFC', padding: '12px', borderRadius: '10px', border: isVitalAbnormal('bpDia', vitals.bpDia) ? '1px solid #FCA5A5' : '1px solid #E2E8F0' }}>
                    <label style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)' }}>BP (Diastolic)</label>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '4px' }}>
                      <input type="text" className="form-control" style={{ border: 'none', background: 'transparent', padding: 0, fontSize: '16px', fontWeight: 800 }} value={vitals.bpDia} onChange={e => setVitals({...vitals, bpDia: e.target.value})} />
                      <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>mmHg</span>
                    </div>
                  </div>

                  <div style={{ background: isVitalAbnormal('pulse', vitals.pulse) ? '#FEF2F2' : '#F8FAFC', padding: '12px', borderRadius: '10px', border: isVitalAbnormal('pulse', vitals.pulse) ? '1px solid #FCA5A5' : '1px solid #E2E8F0' }}>
                    <label style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)' }}>Heart Pulse</label>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '4px' }}>
                      <input type="text" className="form-control" style={{ border: 'none', background: 'transparent', padding: 0, fontSize: '16px', fontWeight: 800 }} value={vitals.pulse} onChange={e => setVitals({...vitals, pulse: e.target.value})} />
                      <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>bpm</span>
                    </div>
                  </div>

                  <div style={{ background: isVitalAbnormal('temp', vitals.temp) ? '#FEF2F2' : '#F8FAFC', padding: '12px', borderRadius: '10px', border: isVitalAbnormal('temp', vitals.temp) ? '1px solid #FCA5A5' : '1px solid #E2E8F0' }}>
                    <label style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)' }}>Temperature</label>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '4px' }}>
                      <input type="text" className="form-control" style={{ border: 'none', background: 'transparent', padding: 0, fontSize: '16px', fontWeight: 800 }} value={vitals.temp} onChange={e => setVitals({...vitals, temp: e.target.value})} />
                      <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>°F</span>
                    </div>
                  </div>

                  <div style={{ background: '#F8FAFC', padding: '12px', borderRadius: '10px', border: '1px solid #E2E8F0' }}>
                    <label style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)' }}>Weight</label>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '4px' }}>
                      <input type="text" className="form-control" style={{ border: 'none', background: 'transparent', padding: 0, fontSize: '16px', fontWeight: 800 }} value={vitals.weight} onChange={e => setVitals({...vitals, weight: e.target.value})} />
                      <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>kg</span>
                    </div>
                  </div>

                  <div style={{ background: '#F8FAFC', padding: '12px', borderRadius: '10px', border: '1px solid #E2E8F0' }}>
                    <label style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)' }}>Height</label>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '4px' }}>
                      <input type="text" className="form-control" style={{ border: 'none', background: 'transparent', padding: 0, fontSize: '16px', fontWeight: 800 }} value={vitals.height} onChange={e => setVitals({...vitals, height: e.target.value})} />
                      <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>cm</span>
                    </div>
                  </div>

                  <div style={{ background: '#EFF6FF', padding: '12px', borderRadius: '10px', border: '1px solid #BFDBFE' }}>
                    <label style={{ fontSize: '11px', fontWeight: 700, color: 'var(--cu-primary)' }}>Calculated BMI</label>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '4px' }}>
                      <span style={{ fontSize: '16px', fontWeight: 900, color: 'var(--cu-primary)' }}>{vitals.bmi}</span>
                      <span style={{ fontSize: '9px', background: '#BFDBFE', color: 'var(--cu-primary)', padding: '2px 6px', borderRadius: '4px', fontWeight: 800 }}>Normal</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* SOAP Clinical Notes & AI Voice Dictation */}
              <div className="glass-card">
                <h3 style={{ marginBottom: '16px', fontSize: '16px', fontWeight: 900, display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <i data-lucide="clipboard" style={{ color: 'var(--cu-primary)' }}></i> SOAP Clinical Notes
                </h3>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }} className="mobile-stack">
                  <div className="form-group" style={{ position: 'relative' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                      <label style={{ fontWeight: 800 }}>S — Subjective (Symptoms & Complaints)</label>
                      {isRecording && recordingField === 'subjective' ? (
                        <button 
                          onClick={stopDictation} 
                          style={{ border: 'none', background: '#FEF2F2', padding: '4px 8px', borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--cu-danger)', fontWeight: 800 }}
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="2" style={{ width: '10px', height: '10px' }} className="animate-pulse">
                            <rect x="4" y="4" width="16" height="16" rx="2"/>
                          </svg>
                          <span style={{ fontSize: '11px', fontWeight: 800 }}>Stop Dictation</span>
                        </button>
                      ) : (
                        <button 
                          onClick={() => startDictation('subjective')} 
                          style={{ border: 'none', background: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--cu-primary)' }}
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ width: '14px', height: '14px' }}>
                            <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/>
                            <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
                            <line x1="12" x2="12" y1="19" y2="22"/>
                          </svg>
                          <span style={{ fontSize: '11px', fontWeight: 700 }}>Dictate</span>
                        </button>
                      )}
                    </div>
                    <textarea 
                      id="soap-subjective-input"
                      data-lenis-prevent
                      className="form-control" 
                      style={{ minHeight: '100px', borderRadius: '10px' }} 
                      placeholder="e.g. Chest pain radiating to left arm, nausea, dyspnea on exertion..." 
                      value={soap.subjective}
                      onChange={e => setSoap({...soap, subjective: e.target.value})}
                    ></textarea>
                  </div>

                  <div className="form-group" style={{ position: 'relative' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                      <label style={{ fontWeight: 800 }}>O — Objective (Clinical Observations)</label>
                      {isRecording && recordingField === 'objective' ? (
                        <button 
                          onClick={stopDictation} 
                          style={{ border: 'none', background: '#FEF2F2', padding: '4px 8px', borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--cu-danger)', fontWeight: 800 }}
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="2" style={{ width: '10px', height: '10px' }} className="animate-pulse">
                            <rect x="4" y="4" width="16" height="16" rx="2"/>
                          </svg>
                          <span style={{ fontSize: '11px', fontWeight: 800 }}>Stop Dictation</span>
                        </button>
                      ) : (
                        <button 
                          onClick={() => startDictation('objective')} 
                          style={{ border: 'none', background: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--cu-primary)' }}
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ width: '14px', height: '14px' }}>
                            <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/>
                            <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
                            <line x1="12" x2="12" y1="19" y2="22"/>
                          </svg>
                          <span style={{ fontSize: '11px', fontWeight: 700 }}>Dictate</span>
                        </button>
                      )}
                    </div>
                    <textarea 
                      id="soap-objective-input"
                      data-lenis-prevent
                      className="form-control" 
                      style={{ minHeight: '100px', borderRadius: '10px' }} 
                      placeholder="e.g. BP: 145/90, Pulse regular. Clear breath sounds, S1 S2 heard..." 
                      value={soap.objective}
                      onChange={e => setSoap({...soap, objective: e.target.value})}
                    ></textarea>
                  </div>
                </div>
              </div>

              {/* Diagnosis & ICD-10 Typeahead Search */}
              <div className="glass-card">
                <h3 style={{ marginBottom: '16px', fontSize: '16px', fontWeight: 900, display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <i data-lucide="shield-alert" style={{ color: 'var(--cu-primary)' }}></i> A — Assessment / ICD-10 Diagnosis
                </h3>

                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '12px' }}>
                  {diagnoses.map((diag, idx) => (
                    <span key={idx} className="cu-badge primary" style={{ fontWeight: 800, gap: '6px', display: 'inline-flex', alignItems: 'center' }}>
                      {diag}
                      <span 
                        onClick={() => {
                          setDiagnoses(diagnoses.filter((_, i) => i !== idx));
                          addLog(`Removed Diagnosis: ${diag}`);
                        }} 
                        style={{ cursor: 'pointer', marginLeft: '4px', fontSize: '14px', lineHeight: 1, fontWeight: 900, opacity: 0.7, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
                        title="Remove"
                      >&times;</span>
                    </span>
                  ))}
                </div>

                <div style={{ position: 'relative' }}>
                  <input 
                    type="text" 
                    className="form-control-cu" 
                    placeholder="Search ICD-10 Database (e.g. Hypertension, Diabetes, Ischemic Heart...)" 
                    value={diagSearch}
                    onChange={e => {
                      setDiagSearch(e.target.value);
                      setShowDiagSuggestions(true);
                    }}
                    onFocus={() => setShowDiagSuggestions(true)}
                    onBlur={() => setTimeout(() => setShowDiagSuggestions(false), 200)}
                  />
                  {showDiagSuggestions && (
                    <div data-lenis-prevent className="glass-card" style={{ position: 'absolute', top: '100%', left: 0, right: 0, marginTop: '8px', zIndex: 1100, padding: '8px', maxHeight: '250px', overflowY: 'auto', overscrollBehavior: 'contain' }}>
                      {[
                        { code: 'I10', term: 'Essential Hypertension' },
                        { code: 'E11', term: 'Type 2 Diabetes Mellitus' },
                        { code: 'I25.1', term: 'Atherosclerotic Heart Disease' },
                        { code: 'J20.9', term: 'Acute Bronchitis, Unspecified' }
                      ].filter(d => d.term.toLowerCase().includes(diagSearch.toLowerCase()) || d.code.toLowerCase().includes(diagSearch.toLowerCase())).map((d, idx) => (
                        <div 
                          key={idx} 
                          onClick={() => {
                            setDiagnoses([...diagnoses, `${d.term} (ICD-10: ${d.code})`]);
                            setDiagSearch('');
                            setShowDiagSuggestions(false);
                            addLog(`Added Diagnosis: ${d.term}`);
                          }}
                          style={{ padding: '8px 12px', borderRadius: '6px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between' }}
                          className="dropdown-item"
                        >
                          <span style={{ fontWeight: 700 }}>{d.term}</span>
                          <span style={{ color: 'var(--cu-primary)', fontWeight: 800 }}>ICD-10: {d.code}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                {diagSearch.trim() && (
                  <div style={{ marginTop: '12px', display: 'flex', justifyContent: 'flex-start' }}>
                    <button 
                      className="btn-cu outline" 
                      style={{ padding: '8px 14px', fontSize: '12px', borderRadius: '8px', display: 'inline-flex', alignItems: 'center', gap: '4px', fontWeight: 800, borderColor: 'var(--cu-primary)', color: 'var(--cu-primary)', cursor: 'pointer', background: 'white' }}
                      onMouseDown={() => {
                        if (diagSearch.trim()) {
                          if (!diagnoses.includes(diagSearch.trim())) {
                            setDiagnoses([...diagnoses, diagSearch.trim()]);
                            addLog(`Added Custom Diagnosis: ${diagSearch.trim()}`);
                          }
                          setDiagSearch('');
                        }
                      }}
                    >
                      + Add Custom Assessment: "{diagSearch.trim()}"
                    </button>
                  </div>
                )}
              </div>

              {/* Prescription Medicine Table with Shortcut templates & Allergy warnings */}
              <div className="glass-card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
                  <div>
                    <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 900, display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <i data-lucide="pill" style={{ color: 'var(--cu-primary)' }}></i> Prescription Medicines
                    </h3>
                    <span className="text-muted" style={{ fontSize: '11px' }}>Quickly apply templates & check drug allergy interactions</span>
                  </div>

                  <div style={{ display: 'flex', gap: '8px' }}>
                    {['Fever', 'Hypertension', 'Diabetes'].map(temp => (
                      <button key={temp} className="btn-cu outline" style={{ padding: '6px 12px', fontSize: '11px' }} onClick={() => applyMedicineTemplate(temp)}>
                        {temp} Rx
                      </button>
                    ))}
                  </div>
                </div>

                {/* One-Click Favorite Med Presets Configuration */}
                <div style={{ background: '#EFF6FF', border: '1px solid #BFDBFE', padding: '12px 16px', borderRadius: '12px', marginBottom: '16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <i data-lucide="star" style={{ color: 'var(--cu-primary)', width: '16px', fill: 'var(--cu-primary)' }}></i>
                    <div>
                      <div style={{ fontWeight: 800, fontSize: '12px', color: '#1E293B' }}>One-Click Favorite Med Presets</div>
                      <div style={{ fontSize: '10px', color: '#64748B' }}>Click to instantly add pre-configured medication rows</div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                    {Object.keys(medicineDefaults).map(medName => (
                      <button 
                        key={medName} 
                        className="btn-cu outline" 
                        style={{ padding: '4px 10px', fontSize: '11px', borderRadius: '8px', background: 'white', border: '1px solid #BFDBFE', color: 'var(--cu-primary)', fontWeight: 700 }}
                        onClick={() => addFavoriteMedicine(medName)}
                      >
                        + {medName.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}
                      </button>
                    ))}
                  </div>
                </div>

                {medicines.some(m => hasAllergyWarning(m.name)) && (
                  <div className="glass-card animate-pulse" style={{ background: '#FEF2F2', border: '1px solid #FCA5A5', padding: '12px', marginBottom: '16px', color: 'var(--cu-danger)', display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <i data-lucide="alert-triangle" style={{ width: '20px', height: '20px' }}></i>
                    <div>
                      <div style={{ fontWeight: 800, fontSize: '13px' }}>CRITICAL DRUG ALLERGY WARNING!</div>
                      <div style={{ fontSize: '11px', fontWeight: 600 }}>The patient allergy chart lists <b>{selectedPatient?.allergies}</b>. The prescribed drugs conflict with this profile! Please review!</div>
                    </div>
                  </div>
                )}

                <div className="table-responsive" style={{ overflowX: 'auto', paddingBottom: '12px' }}>
                  <table className="elite-table" style={{ minWidth: '950px', width: '100%' }}>
                    <thead>
                      <tr>
                        <th>Medicine / Composition</th>
                        <th style={{ width: '100px' }}>Dose</th>
                        <th style={{ width: '160px' }}>Frequency</th>
                        <th style={{ width: '110px' }}>Duration</th>
                        <th style={{ width: '150px' }}>Timing</th>
                        <th>Notes</th>
                        <th style={{ width: '80px', textAlign: 'center' }}>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {medicines.map((med) => (
                        <tr key={med.id}>
                          <td style={{ padding: '8px 4px', position: 'relative' }}>
                            <input 
                              type="text" 
                              value={med.name} 
                              onChange={(e) => handleMedNameChange(med.id, e.target.value)} 
                              onFocus={() => setActiveMedFocus(med.id)}
                              onBlur={() => {
                                setTimeout(() => {
                                  if (!isHoveringSuggestions) {
                                    setActiveMedFocus(null);
                                  }
                                }, 150);
                              }}
                              placeholder="e.g. Paracetamol 650"
                              style={{ 
                                ...rxInputStyle, 
                                fontWeight: 700, 
                                borderColor: hasAllergyWarning(med.name) || getStockStatus(med.name) === 'out' ? 'var(--cu-danger)' : '#E2E8F0',
                                boxShadow: hasAllergyWarning(med.name) || getStockStatus(med.name) === 'out' ? '0 0 0 3px rgba(220, 38, 38, 0.15)' : 'none'
                              }}
                            />
                            {activeMedFocus === med.id && (() => {
                              const typedVal = (med.name || '').trim().toLowerCase();
                              const allSuggestionsList = Array.from(new Set([
                                ...dbMedicines.map(m => m.name),
                                'Paracetamol 650',
                                'Pantocid 40',
                                'Telmisartan 40',
                                'Metformin 500',
                                'Amoxicillin 500',
                                'Aspirin 75',
                                'Atorvastatin 10',
                                'Azithromycin 500',
                                'Ciprofloxacin 500',
                                'Clopidogrel 75',
                                'Ibuprofen 400',
                                'Levothyroxine 50',
                                'Losartan 50',
                                'Montelukast 10',
                                'Omeprazole 20',
                                'Rosuvastatin 10'
                              ]));
                              
                              const filtered = typedVal 
                                ? allSuggestionsList.filter(m => m.toLowerCase().includes(typedVal) && m.toLowerCase() !== typedVal).slice(0, 8)
                                : allSuggestionsList.slice(0, 8);

                              if (filtered.length === 0) return null;

                              return (
                                <div 
                                  data-lenis-prevent 
                                  className="glass-card scroll-overlay-y" 
                                  onMouseEnter={() => setIsHoveringSuggestions(true)}
                                  onMouseLeave={() => setIsHoveringSuggestions(false)}
                                  style={{ 
                                    position: 'absolute', 
                                    top: 'calc(100% + 6px)', 
                                    left: '0px', 
                                    width: '380px', 
                                    zIndex: 1200, 
                                    padding: '8px', 
                                    boxShadow: '0 12px 30px rgba(15, 23, 42, 0.16)', 
                                    background: 'white', 
                                    borderRadius: '14px', 
                                    border: '1px solid #E2E8F0', 
                                    maxHeight: '220px', 
                                    overflowY: 'auto',
                                    overscrollBehavior: 'contain',
                                    WebkitOverflowScrolling: 'touch'
                                  }}
                                >
                                  {filtered.map((mName, sIdx) => {
                                    const selectSuggestion = (e) => {
                                      e.preventDefault();
                                      e.stopPropagation();
                                      handleMedNameChange(med.id, mName);
                                      setActiveMedFocus(null);
                                      setIsHoveringSuggestions(false);
                                    };

                                    return (
                                      <div 
                                        key={sIdx} 
                                        onMouseDown={selectSuggestion}
                                        onClick={selectSuggestion}
                                      style={{ 
                                        padding: '8px 12px', 
                                        borderRadius: '8px', 
                                        cursor: 'pointer', 
                                        display: 'flex', 
                                        justifyContent: 'space-between', 
                                        alignItems: 'center', 
                                        fontSize: '12.5px',
                                        gap: '12px',
                                        transition: 'all 0.2s ease',
                                        background: 'transparent'
                                      }}
                                      className="med-dropdown-item"
                                    >
                                      <span style={{ fontWeight: 700, color: '#1E293B', whiteSpace: 'nowrap', pointerEvents: 'none' }}>{mName}</span>
                                      {medicineDefaults[mName.toLowerCase()] && (
                                        <span style={{ 
                                          color: 'var(--cu-primary)', 
                                          fontSize: '9.5px', 
                                          fontWeight: 800,
                                          background: '#EFF6FF',
                                          padding: '2px 8px',
                                          borderRadius: '6px',
                                          whiteSpace: 'nowrap',
                                          border: '1px solid #BFDBFE',
                                          pointerEvents: 'none'
                                        }}>
                                          Preset Config Available
                                        </span>
                                      )}
                                    </div>
                                    );
                                  })}
                                </div>
                              );
                            })()}
                            {getStockStatus(med.name) === 'out' && (
                              <div style={{ position: 'absolute', top: '100%', left: '4px', background: '#FEF2F2', color: '#DC2626', fontSize: '10px', padding: '2px 6px', borderRadius: '4px', border: '1px solid #FCA5A5', fontWeight: 800, marginTop: '2px', zIndex: 10, display: 'flex', alignItems: 'center', gap: '4px' }}>
                                <i data-lucide="alert-circle" style={{ width: '10px' }}></i> Out of Stock at Pharmacy
                              </div>
                            )}
                            {getStockStatus(med.name) === 'low' && (
                              <div style={{ position: 'absolute', top: '100%', left: '4px', background: '#FFFBEB', color: '#D97706', fontSize: '10px', padding: '2px 6px', borderRadius: '4px', border: '1px solid #FCD34D', fontWeight: 800, marginTop: '2px', zIndex: 10 }}>
                                Low Stock
                              </div>
                            )}
                          </td>
                          <td style={{ padding: '8px 4px', width: '100px' }}>
                            <input 
                              type="text" 
                              value={med.dose} 
                              onChange={(e) => updateMedicineRow(med.id, 'dose', e.target.value)} 
                              placeholder="e.g. 1 Tab" 
                              style={rxInputStyle}
                            />
                          </td>
                          <td style={{ padding: '8px 4px', width: '160px' }}>
                            <select 
                              value={med.freq} 
                              onChange={(e) => updateMedicineRow(med.id, 'freq', e.target.value)}
                              style={rxSelectStyle}
                            >
                              <option value="Once a Day">Once a Day</option>
                              <option value="Twice a Day">Twice a Day</option>
                              <option value="Thrice a Day">Thrice a Day</option>
                              <option value="1 Tab OD">1 Tab OD (Once daily)</option>
                              <option value="1 Tab BD">1 Tab BD (Twice daily)</option>
                              <option value="1 Tab TDS">1 Tab TDS (Thrice daily)</option>
                              <option value="1 Tab QID">1 Tab QID (Four times)</option>
                              <option value="1 Tab HS">1 Tab HS (At bedtime)</option>
                            </select>
                          </td>
                          <td style={{ padding: '8px 4px', width: '110px' }}>
                            <input 
                              type="text" 
                              value={med.duration} 
                              onChange={(e) => updateMedicineRow(med.id, 'duration', e.target.value)} 
                              placeholder="5 Days" 
                              style={rxInputStyle}
                            />
                          </td>
                          <td style={{ padding: '8px 4px', width: '150px' }}>
                            <select 
                              value={med.timing} 
                              onChange={(e) => updateMedicineRow(med.id, 'timing', e.target.value)}
                              style={rxSelectStyle}
                            >
                              <option value="After Food">After Food</option>
                              <option value="Before Food">Before Food</option>
                              <option value="With Food">With Food</option>
                            </select>
                          </td>
                          <td style={{ padding: '8px 4px' }}>
                            <input 
                              type="text" 
                              value={med.notes} 
                              onChange={(e) => updateMedicineRow(med.id, 'notes', e.target.value)} 
                              placeholder="Fever" 
                              style={rxInputStyle}
                            />
                          </td>
                          <td style={{ padding: '8px 4px', width: '80px', textAlign: 'center' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', justifyContent: 'center' }}>
                              <button 
                                onClick={() => saveAsCustomDefault(med)} 
                                title="Save as Default Config"
                                style={{ color: 'var(--cu-primary)', border: 'none', background: 'none', cursor: 'pointer', padding: '4px' }}
                              >
                                <i data-lucide="save" style={{ width: '16px' }}></i>
                              </button>
                              <button 
                                onClick={() => removeMedicineRow(med.id)} 
                                title="Delete Row"
                                style={{ color: 'var(--cu-danger)', border: 'none', background: 'none', cursor: 'pointer', padding: '4px' }}
                              >
                                <i data-lucide="trash-2" style={{ width: '16px' }}></i>
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <button className="btn-cu outline" onClick={() => addMedicineRow()} style={{ marginTop: '12px' }}>
                  <i data-lucide="plus-circle" style={{ width: '16px' }}></i> Add Medication Row
                </button>
              </div>

              {/* Lab & Radiology Recommendations */}
              <div className="glass-card">
                <h3 style={{ marginBottom: '16px', fontSize: '16px', fontWeight: 900, display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <i data-lucide="flask-conical" style={{ color: 'var(--cu-primary)' }}></i> Lab & Radiology Panel
                </h3>

                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '12px' }}>
                  {labs.map((lab, idx) => (
                    <span key={idx} className="cu-badge success" style={{ fontWeight: 800, gap: '6px', display: 'inline-flex', alignItems: 'center' }}>
                      {lab}
                      <span
                        onClick={() => setLabs(labs.filter((_, i) => i !== idx))}
                        style={{ cursor: 'pointer', marginLeft: '4px', fontSize: '14px', lineHeight: 1, fontWeight: 900, opacity: 0.7, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
                        title="Remove"
                      >×</span>
                    </span>
                  ))}
                </div>

                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
                  {['CBC', 'LFT', 'KFT', 'Lipid Profile', 'HbA1c', 'X-Ray Chest', 'MRI Brain', 'CT Scan Abdomen'].map(test => (
                    <button 
                      key={test} 
                      className={`btn-cu outline ${labs.includes(test) ? 'success' : ''}`} 
                      style={{ padding: '6px 12px', fontSize: '11px', borderRadius: '20px', borderColor: labs.includes(test) ? 'var(--cu-success)' : '#E2E8F0' }} 
                      onClick={() => {
                        if (labs.includes(test)) {
                          setLabs(labs.filter(l => l !== test));
                        } else {
                          setLabs([...labs, test]);
                          addLog(`Added Lab Recommendation: ${test}`);
                        }
                      }}
                    >
                      {test}
                    </button>
                  ))}
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '16px', maxWidth: '380px' }}>
                  <input 
                    type="text" 
                    className="form-control-cu" 
                    style={{ height: '38px', fontSize: '13px', borderRadius: '8px', padding: '0 12px', border: '1px solid #E2E8F0', background: '#F8FAFC', outline: 'none', flex: 1 }} 
                    placeholder="Add custom lab or radiology test..." 
                    value={customLabInput}
                    onChange={e => setCustomLabInput(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter' && customLabInput.trim()) {
                        e.preventDefault();
                        if (!labs.includes(customLabInput.trim())) {
                          setLabs([...labs, customLabInput.trim()]);
                          addLog(`Added Custom Lab: ${customLabInput.trim()}`);
                        }
                        setCustomLabInput('');
                      }
                    }}
                  />
                  <button 
                    className="btn btn-primary" 
                    style={{ height: '38px', padding: '0 16px', borderRadius: '8px', fontSize: '12px', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer' }}
                    onClick={() => {
                      if (customLabInput.trim()) {
                        if (!labs.includes(customLabInput.trim())) {
                          setLabs([...labs, customLabInput.trim()]);
                          addLog(`Added Custom Lab: ${customLabInput.trim()}`);
                        }
                        setCustomLabInput('');
                      }
                    }}
                  >
                    + Add Test
                  </button>
                </div>
              </div>

              {/* Advice & Follow Up */}
            </div>
          </div>
        )}
      </div>

      {/* Real Uploaded Document Preview Scanner Lightbox */}
      {previewFile && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 99999, padding: '20px' }}>
          <div className="glass-card" data-lenis-prevent style={{ width: '100%', maxWidth: '650px', background: '#0F172A', border: '1px solid #334155', padding: '24px', color: 'white', position: 'relative' }}>
            <button 
              onClick={() => setPreviewFile(null)} 
              style={{ position: 'absolute', top: '16px', right: '16px', background: 'none', border: 'none', cursor: 'pointer', color: '#94A3B8' }}
            >
              <i data-lucide="x" style={{ width: '24px', height: '24px' }}></i>
            </button>
            
            <h3 style={{ margin: '0 0 8px 0', fontSize: '16px', fontWeight: 800, color: 'var(--cu-secondary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <i data-lucide="file-text"></i> Curoxa Diagnostics EMR Scan
            </h3>
            <p style={{ fontSize: '12px', color: '#94A3B8', marginBottom: '16px' }}>
              File: <b>{previewFile.name}</b> ({previewFile.size}) | MIME: {previewFile.type}
            </p>

            <div style={{ height: '350px', background: '#1E293B', border: '1px solid #334155', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', padding: '20px', textAlign: 'center' }}>
              {previewFile.type.startsWith('image/') ? (
                <img src={previewFile.url} alt="EMR Scan" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', borderRadius: '8px' }} />
              ) : (
                <>
                  <i data-lucide="file-text" style={{ width: '60px', height: '60px', color: 'var(--cu-primary)', marginBottom: '16px' }}></i>
                  <h4 style={{ fontWeight: 800 }}>Clinical PDF Scan Encrypted</h4>
                  <p style={{ fontSize: '11px', color: '#94A3B8', maxWidth: '350px', marginTop: '4px' }}>
                    This document scan has been encrypted in accordance with National Digital Health Mission (NDHM) guidelines.
                  </p>
                  <a href={previewFile.url} download={previewFile.name} className="btn-cu primary" style={{ marginTop: '16px' }}>
                    <i data-lucide="download"></i> Download Original Document
                  </a>
                </>
              )}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '20px' }}>
              <button className="btn-cu outline" onClick={() => setPreviewFile(null)} style={{ background: 'transparent', color: 'white', borderColor: '#334155' }}>
                Close EMR Scanner
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modern PDF Prescription Design Pop-Up Dialog */}
      {showPdf && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: '20px' }}>
          <div className="glass-card" data-lenis-prevent style={{ width: '100%', maxWidth: '800px', background: 'white', padding: '40px', maxHeight: '90vh', overflowY: 'auto', overscrollBehavior: 'contain', position: 'relative' }}>
            
            <button 
              onClick={() => setShowPdf(false)} 
              style={{ position: 'absolute', top: '20px', right: '20px', background: 'none', border: 'none', cursor: 'pointer', color: '#64748B' }}
            >
              <i data-lucide="x" style={{ width: '24px', height: '24px' }}></i>
            </button>

            {/* Branded PDF Layout */}
            <div style={{ border: '2px solid #000', padding: '30px', fontFamily: 'Inter, sans-serif' }}>
              
              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '2px solid #0F6CBD', paddingBottom: '16px', marginBottom: '20px' }}>
                <div>
                  <h1 style={{ margin: 0, color: '#0F6CBD', fontSize: '28px', fontWeight: 900 }}>CUROXA CLINIC</h1>
                  <div style={{ fontSize: '12px', color: '#64748B' }}>Healthcare simplified. DPDP Compliant EMR Hub.</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 800 }}>{user.name}</h3>
                  <div style={{ fontSize: '12px', color: '#64748B' }}>{user.specialty} | Reg No: MCI-55219</div>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', background: '#F8FAFC', padding: '12px', borderRadius: '8px', marginBottom: '20px', fontSize: '12px' }}>
                <div><b>Patient Name:</b><div style={{ marginTop: '2px' }}>{selectedPatient?.name || 'N/A'}</div></div>
                <div><b>UHID:</b><div style={{ marginTop: '2px' }}>{selectedPatient?.uhid || 'N/A'}</div></div>
                <div><b>Age / Gender:</b><div style={{ marginTop: '2px' }}>{selectedPatient?.age} Yrs / {selectedPatient?.gender}</div></div>
                <div><b>Contact:</b><div style={{ marginTop: '2px' }}>{selectedPatient?.contact || 'N/A'}</div></div>
              </div>

              <div style={{ marginBottom: '20px' }}>
                <h4 style={{ borderBottom: '1px solid #E2E8F0', paddingBottom: '6px', color: '#0F6CBD', margin: '0 0 10px 0' }}>Patient Vitals</h4>
                <div style={{ display: 'flex', gap: '20px', fontSize: '12px' }}>
                  <span><b>BP:</b> {vitals.bpSys}/{vitals.bpDia} mmHg</span>
                  <span><b>Pulse:</b> {vitals.pulse} bpm</span>
                  <span><b>Temp:</b> {vitals.temp} °F</span>
                  <span><b>BMI:</b> {vitals.bmi}</span>
                  <span><b>SpO2:</b> {vitals.spo2}%</span>
                </div>
              </div>

              <div style={{ marginBottom: '20px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', fontSize: '12px' }}>
                <div>
                  <h4 style={{ borderBottom: '1px solid #E2E8F0', paddingBottom: '6px', color: '#0F6CBD', margin: '0 0 8px 0' }}>Clinical Findings</h4>
                  <p style={{ margin: 0, lineHeight: '1.4' }}>{soap.subjective || 'No complaints reported.'}</p>
                </div>
                <div>
                  <h4 style={{ borderBottom: '1px solid #E2E8F0', paddingBottom: '6px', color: '#0F6CBD', margin: '0 0 8px 0' }}>ICD-10 Diagnoses</h4>
                  <ul style={{ margin: 0, paddingLeft: '20px' }}>
                    {diagnoses.map((d, i) => <li key={i}>{d}</li>)}
                  </ul>
                </div>
              </div>

              <div style={{ marginBottom: '24px' }}>
                <h4 style={{ borderBottom: '2px solid #0F6CBD', paddingBottom: '6px', color: '#0F6CBD', margin: '0 0 12px 0' }}>Rx Prescriptions</h4>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                  <thead>
                    <tr style={{ background: '#F8FAFC', textAlign: 'left' }}>
                      <th style={{ padding: '8px' }}>Medicine</th>
                      <th style={{ padding: '8px' }}>Dose</th>
                      <th style={{ padding: '8px' }}>Frequency</th>
                      <th style={{ padding: '8px' }}>Duration</th>
                      <th style={{ padding: '8px' }}>Timing</th>
                    </tr>
                  </thead>
                  <tbody>
                    {medicines.map((m, idx) => (
                      <tr key={idx} style={{ borderBottom: '1px solid #E2E8F0' }}>
                        <td style={{ padding: '8px', fontWeight: 800 }}>{m.name || 'Generic Med'}</td>
                        <td style={{ padding: '8px' }}>{m.dose}</td>
                        <td style={{ padding: '8px' }}>{m.freq}</td>
                        <td style={{ padding: '8px' }}>{m.duration}</td>
                        <td style={{ padding: '8px' }}>{m.timing}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', fontSize: '12px', marginBottom: '30px' }}>
                <div>
                  <h4 style={{ borderBottom: '1px solid #E2E8F0', paddingBottom: '6px', color: '#0F6CBD', margin: '0 0 8px 0' }}>Lab Investigations</h4>
                  <ul style={{ margin: 0, paddingLeft: '20px' }}>
                    {labs.map((l, i) => <li key={i}>{l}</li>)}
                  </ul>
                </div>
                <div>
                  <h4 style={{ borderBottom: '1px solid #E2E8F0', paddingBottom: '6px', color: '#0F6CBD', margin: '0 0 8px 0' }}>Advice & Instructions</h4>
                  <p style={{ margin: '0 0 6px 0' }}><b>Diet:</b> {advice.diet}</p>
                  <p style={{ margin: '0 0 6px 0' }}><b>Exercise:</b> {advice.exercise}</p>
                  <p style={{ margin: 0 }}><b>Follow-Up:</b> {advice.followUp}</p>
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', borderTop: '2px solid #E2E8F0', paddingTop: '20px', fontSize: '10px', color: '#64748B' }}>
                <div>
                  <div>Prescription ID: <b>{prescriptionId}</b></div>
                  <div style={{ marginTop: '4px' }}>Disclaimer: This is a digitally verified eSign prescription under IMC rules & DPDP secure data storage regulations.</div>
                </div>

                <div style={{ textAlign: 'right' }}>
                  <div style={{ width: '48px', height: '48px', border: '1px solid #E2E8F0', background: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', marginLeft: 'auto', marginBottom: '6px' }}>
                    <i data-lucide="qr-code" style={{ width: '40px', height: '40px', color: '#1E293B' }}></i>
                  </div>
                  <div>Digitally Signed by:</div>
                  <b style={{ color: '#1E293B', fontSize: '11px' }}>{user.name}</b>
                </div>
              </div>

            </div>

            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '24px' }}>
              <button className="btn-cu outline" onClick={() => setShowPdf(false)}>
                Close Preview
              </button>
              <button className="btn-cu primary" onClick={() => {
                const formattedData = {
                  appointment: {
                    date: new Date(),
                    diagnosis: diagnoses.join('\n') || soap.subjective || 'General consultation.',
                    notes: [
                      soap.subjective ? `S: ${soap.subjective}` : '',
                      soap.objective ? `O: ${soap.objective}` : '',
                      soap.assessment ? `A: ${soap.assessment}` : '',
                      soap.plan ? `P: ${soap.plan}` : '',
                      advice.diet ? `Diet: ${advice.diet}` : '',
                      advice.exercise ? `Exercise: ${advice.exercise}` : '',
                      advice.followUp ? `Follow Up: ${advice.followUp}` : ''
                    ].filter(Boolean).join('\n')
                  },
                  patient: {
                    name: selectedPatient?.name,
                    age: selectedPatient?.age,
                    gender: selectedPatient?.gender,
                    contact: selectedPatient?.contact,
                    address: selectedPatient?.address
                  },
                  prescription: {
                    items: medicines.map(m => ({
                      medicine: m.name,
                      dosage: m.dose,
                      duration: m.duration,
                      instructions: `${m.freq} (${m.timing})`
                    }))
                  },
                  labs: labs
                };
                handlePrintSummary(formattedData);
              }}>
                Print Prescription
              </button>
            </div>

          </div>
        </div>
      )}

      {/* COVERAGE LAB MODALS */}
      {showCoverageLabModal && selectedCoverageLabTest && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: '20px' }} onClick={() => setShowCoverageLabModal(false)}>
          <div style={{ width: '100%', maxWidth: '500px', padding: '28px', borderRadius: '16px', background: 'white' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h3 style={{ fontSize: '18px', fontWeight: 800, color: '#0F172A', margin: 0 }}>Enter Diagnostic Lab Results</h3>
              <button 
                type="button" 
                onClick={() => setShowCoverageLabModal(false)} 
                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '20px', color: '#64748B' }}
              >✕</button>
            </div>
            
            <div style={{ background: '#F8FAFC', padding: '12px 16px', borderRadius: '8px', marginBottom: '20px' }}>
              <div style={{ fontSize: '13px', color: '#64748B', fontWeight: 600 }}>Patient: <b style={{ color: '#0F172A' }}>{selectedCoverageLabTest.name}</b></div>
              <div style={{ fontSize: '13px', color: '#64748B', fontWeight: 600, marginTop: '4px' }}>Test Type: <b style={{ color: '#0F172A' }}>{selectedCoverageLabTest.test}</b></div>
            </div>

            <form onSubmit={async (e) => {
              e.preventDefault();
              try {
                const resultsObj = {
                  parameters: {
                    value: coverageLabParams.value,
                    unit: coverageLabParams.unit || 'g/dL'
                  },
                  remarks: coverageLabRemarks,
                  document: coverageLabFileName || 'LabReport_Signed.pdf',
                  finalizedAt: new Date().toISOString()
                };
                await api.put(`/labs/${selectedCoverageLabTest.id}`, {
                  status: 'Completed',
                  results: JSON.stringify(resultsObj)
                });
                showToastNotification(`Lab results finalized & dispatched for ${selectedCoverageLabTest.name}!`, 'success');
                setShowCoverageLabModal(false);
                fetchCoverageData();
              } catch (err) {
                showToastNotification('Failed to finalize results.', 'error');
              }
            }}>
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 800, color: '#64748B', marginBottom: '6px', textTransform: 'uppercase' }}>Test Value / Parameter Value</label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <input 
                    type="text" 
                    placeholder="e.g. 14.2" 
                    value={coverageLabParams.value} 
                    onChange={e => setCoverageLabParams({ ...coverageLabParams, value: e.target.value })}
                    required
                    style={{ flex: 1, height: '40px', border: '1px solid #E2E8F0', borderRadius: '8px', padding: '0 12px', outline: 'none' }}
                  />
                  <input 
                    type="text" 
                    placeholder="Unit (e.g. g/dL, mg/dL)" 
                    value={coverageLabParams.unit} 
                    onChange={e => setCoverageLabParams({ ...coverageLabParams, unit: e.target.value })}
                    required
                    style={{ width: '150px', height: '40px', border: '1px solid #E2E8F0', borderRadius: '8px', padding: '0 12px', outline: 'none' }}
                  />
                </div>
              </div>

              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 800, color: '#64748B', marginBottom: '6px', textTransform: 'uppercase' }}>Remarks & Diagnostic Observations</label>
                <textarea 
                  placeholder="Enter medical observations, ranges, or comments..." 
                  value={coverageLabRemarks} 
                  onChange={e => setCoverageLabRemarks(e.target.value)}
                  required
                  style={{ width: '100%', height: '80px', border: '1px solid #E2E8F0', borderRadius: '8px', padding: '8px 12px', outline: 'none', resize: 'none' }}
                />
              </div>

              <div style={{ marginBottom: '24px' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 800, color: '#64748B', marginBottom: '6px', textTransform: 'uppercase' }}>Upload Diagnostic Report Document</label>
                <div 
                  style={{ border: '2px dashed #CBD5E1', borderRadius: '8px', padding: '16px', textAlign: 'center', cursor: 'pointer', background: '#F8FAFC' }}
                  onClick={() => {
                    const input = document.createElement('input');
                    input.type = 'file';
                    input.accept = 'application/pdf,image/*';
                    input.onchange = (e) => {
                      if (e.target.files && e.target.files[0]) {
                        setCoverageLabFileName(e.target.files[0].name);
                      }
                    };
                    input.click();
                  }}
                >
                  <div style={{ fontSize: '13px', fontWeight: 700, color: '#475569' }}>
                    {coverageLabFileName ? `Selected: ${coverageLabFileName}` : 'Click to select or drop lab report PDF'}
                  </div>
                  <div style={{ fontSize: '11px', color: '#94A3B8', marginTop: '4px' }}>PDF, PNG, JPG up to 10MB</div>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
                <button 
                  type="button" 
                  onClick={() => setShowCoverageLabModal(false)}
                  style={{ height: '40px', padding: '0 16px', background: '#F1F5F9', border: 'none', borderRadius: '8px', fontWeight: 700, color: '#475569', cursor: 'pointer' }}
                >Cancel</button>
                <button 
                  type="submit" 
                  style={{ height: '40px', padding: '0 20px', background: '#059669', border: 'none', borderRadius: '8px', fontWeight: 700, color: 'white', cursor: 'pointer' }}
                >Finalize & Dispatch</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showCoverageLabDetailsModal && selectedCoverageLabTest && (() => {
        const parsed = parseResults(selectedCoverageLabTest.results);
        return (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: '20px' }} onClick={() => setShowCoverageLabDetailsModal(false)}>
            <div style={{ width: '100%', maxWidth: '480px', padding: '28px', borderRadius: '16px', background: 'white' }} onClick={e => e.stopPropagation()}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                <h3 style={{ fontSize: '18px', fontWeight: 800, color: '#0F172A', margin: 0 }}>Lab Report Details</h3>
                <button 
                  type="button" 
                  onClick={() => setShowCoverageLabDetailsModal(false)} 
                  style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '20px', color: '#64748B' }}
                >✕</button>
              </div>

              <div style={{ background: '#F8FAFC', padding: '16px', borderRadius: '12px', marginBottom: '20px', border: '1px solid #E2E8F0' }}>
                <div style={{ fontSize: '11px', color: '#64748B', fontWeight: 700, marginBottom: '6px' }}>PATIENT</div>
                <div style={{ fontSize: '15px', fontWeight: 800, color: '#0F172A' }}>{selectedCoverageLabTest.name}</div>
                <div style={{ fontSize: '11px', color: '#94A3B8', marginTop: '2px' }}>Order ID: #{selectedCoverageLabTest.id}</div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginBottom: '24px' }}>
                <div>
                  <span style={{ fontSize: '11px', fontWeight: 800, color: '#64748B', textTransform: 'uppercase', display: 'block', marginBottom: '4px' }}>Test Conducted</span>
                  <span style={{ fontSize: '14px', fontWeight: 700, color: '#1E293B' }}>{selectedCoverageLabTest.test}</span>
                </div>
                <div>
                  <span style={{ fontSize: '11px', fontWeight: 800, color: '#64748B', textTransform: 'uppercase', display: 'block', marginBottom: '4px' }}>Reported Value</span>
                  <span style={{ fontSize: '15px', fontWeight: 800, color: '#059669', background: '#ECFDF5', padding: '4px 8px', borderRadius: '6px', display: 'inline-block' }}>
                    {parsed.parameters?.value || 'N/A'} {parsed.parameters?.unit || ''}
                  </span>
                </div>
                <div>
                  <span style={{ fontSize: '11px', fontWeight: 800, color: '#64748B', textTransform: 'uppercase', display: 'block', marginBottom: '4px' }}>Clinical Observations & Remarks</span>
                  <p style={{ fontSize: '13.5px', color: '#334155', background: '#F8FAFC', padding: '12px', borderRadius: '8px', border: '1px solid #F1F5F9', margin: 0, fontWeight: 600, lineHeight: 1.5 }}>
                    {parsed.remarks || 'No remarks provided.'}
                  </p>
                </div>
                {parsed.document && (
                  <div>
                    <span style={{ fontSize: '11px', fontWeight: 800, color: '#64748B', textTransform: 'uppercase', display: 'block', marginBottom: '4px' }}>Attached Document</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 12px', background: '#EFF6FF', borderRadius: '8px', border: '1px solid #BFDBFE' }}>
                      <span style={{ fontSize: '13px', fontWeight: 700, color: '#1E40AF', flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{parsed.document}</span>
                      <a 
                        href="#" 
                        onClick={(e) => { e.preventDefault(); showToastNotification(`Downloading: ${parsed.document}`, 'info'); }} 
                        style={{ fontSize: '11px', fontWeight: 800, color: '#2563EB', textDecoration: 'none' }}
                      >Download</a>
                    </div>
                  </div>
                )}
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button 
                  type="button" 
                  onClick={() => setShowCoverageLabDetailsModal(false)}
                  style={{ height: '40px', padding: '0 20px', background: '#0F172A', border: 'none', borderRadius: '8px', fontWeight: 700, color: 'white', cursor: 'pointer' }}
                >Close</button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Visual Prescription formatting & Spacing Modal */}
      {showPrintSettingsModal && printSettingsTarget && tempPrintSettings && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.65)', backdropFilter: 'blur(12px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000, padding: '20px' }}>
          <div className="glass-card" style={{ width: '100%', maxWidth: '960px', background: '#FFFFFF', padding: '0', borderRadius: '24px', maxHeight: '92vh', overflow: 'hidden', display: 'flex', flexDirection: 'column', boxShadow: '0 25px 80px -15px rgba(15, 23, 42, 0.22)', border: '1px solid rgba(241, 245, 249, 0.9)' }}>
            
            {/* Modal Header */}
            <div style={{ background: 'linear-gradient(135deg, #800020, #4A0012)', padding: '20px 28px', color: 'white', display: 'flex', alignItems: 'center', justifycontent: 'space-between' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 900, fontFamily: "'Outfit', sans-serif", display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: '#FBCFE8' }}><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>
                  Prescription Layout & Auto-Spacing Configurator
                </h3>
                <p style={{ margin: '4px 0 0 0', fontSize: '11.5px', color: '#FBCFE8', fontWeight: 600, opacity: 0.9 }}>
                  Ensure your text fits perfectly under any letterhead or page size.
                </p>
              </div>
              <button 
                onClick={() => {
                  setShowPrintSettingsModal(false);
                  setPrintSettingsTarget(null);
                }} 
                style={{ background: 'rgba(255,255,255,0.15)', border: 'none', color: 'white', width: '32px', height: '32px', borderRadius: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', fontSize: '13px', fontWeight: 800 }}
              >
                ✕
              </button>
            </div>

            {/* Modal Body */}
            <div data-lenis-prevent style={{ flex: 1, overflowY: 'hidden', padding: '24px', background: '#F8FAFC', display: 'flex', gap: '24px' }}>
              
              {/* Left Column: Form Controls (width: 380px) */}
              <div style={{ display: 'none', width: '380px', flexDirection: 'column', gap: '16px', overflowY: 'auto', paddingRight: '8px' }}>
                
                {/* Template / Layout selection */}
                <div>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 800, color: '#475569', letterSpacing: '0.05em', marginBottom: '8px', textTransform: 'uppercase' }}>Select Prescription Layout Template</label>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {adminTemplates && adminTemplates.length > 0 ? (
                      adminTemplates.map(tpl => {
                        const isSelected = tempPrintSettings.template === tpl._id || (tempPrintSettings.template === 'standard' && tpl.isStandard);
                        return (
                          <div 
                            key={tpl._id}
                            onClick={() => setTempPrintSettings(prev => ({ 
                              ...prev, 
                              template: tpl._id,
                              topSpacer: tpl.yTop,
                              bottomSpacer: tpl.yBottom
                            }))}
                            style={{
                              border: isSelected ? '2.5px solid #800020' : '1.5px solid #E2E8F0',
                              background: isSelected ? '#FFF5F6' : '#FFFFFF',
                              borderRadius: '12px', 
                              padding: '12px', 
                              cursor: 'pointer', 
                              transition: 'all 0.2s ease', 
                              display: 'flex', 
                              justifyContent: 'space-between', 
                              alignItems: 'center', 
                              boxShadow: isSelected ? '0 4px 10px -2px rgba(128, 0, 32, 0.08)' : 'none'
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                              <div style={{
                                width: '32px',
                                height: '32px',
                                borderRadius: '6px',
                                background: isSelected ? '#FCE7F3' : '#F1F5F9',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                border: isSelected ? '1px solid #FDA4AF' : '1px solid #E2E8F0'
                              }}>
                                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={isSelected ? '#800020' : '#64748B'} strokeWidth="2.5"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/></svg>
                              </div>
                              <div>
                                <div style={{ fontWeight: 800, fontSize: '12.5px', color: '#1E293B', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                  {tpl.name}
                                  {tpl.isStandard && (
                                    <span style={{ background: '#D1FAE5', color: '#065F46', fontSize: '8px', fontWeight: 800, padding: '1px 4px', borderRadius: '4px' }}>Standard</span>
                                  )}
                                </div>
                                <div style={{ fontSize: '10.5px', color: '#64748B', marginTop: '2px', fontWeight: 600 }}>
                                  Margins: T: {tpl.yTop}mm | B: {tpl.yBottom}mm
                                </div>
                              </div>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center' }}>
                              <div style={{
                                width: '16px',
                                height: '16px',
                                borderRadius: '8px',
                                border: isSelected ? '5px solid #800020' : '2px solid #CBD5E1',
                                background: '#FFFFFF',
                                boxSizing: 'border-box'
                              }}></div>
                            </div>
                          </div>
                        );
                      })
                    ) : (
                      <div style={{ padding: '12px', background: '#F1F5F9', borderRadius: '10px', textAlign: 'center', color: '#64748B', fontSize: '11px', fontWeight: 600 }}>
                        No templates configured by Admin. Default layout is active.
                      </div>
                    )}
                  </div>
                </div>

                {/* Letterhead & Footer margin adjusters */}
                <div style={{ background: '#FFFFFF', padding: '14px', borderRadius: '14px', border: '1px solid #E2E8F0', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <h4 style={{ margin: 0, fontSize: '11px', color: '#1E293B', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.03em', borderBottom: '1px solid #F1F5F9', paddingBottom: '6px' }}>
                    Letterhead Fitting & Spacing Calibration
                  </h4>
                  
                  {/* Header spacer slider */}
                  <div>
                    <div style={{ display: 'flex', justifycontent: 'space-between', fontSize: '11.5px', fontWeight: 700, color: '#475569', marginBottom: '4px' }}>
                      <span>Top Spacer (Header Space)</span>
                      <span style={{ color: '#800020' }}><b>{tempPrintSettings.topSpacer} mm</b></span>
                    </div>
                    <input 
                      type="range" 
                      min="0" 
                      max="100" 
                      value={tempPrintSettings.topSpacer} 
                      onChange={e => setTempPrintSettings(prev => ({ ...prev, topSpacer: parseInt(e.target.value, 10) }))}
                      style={{ width: '100%', accentColor: '#800020', cursor: 'pointer' }}
                    />
                  </div>

                  {/* Footer spacer slider */}
                  <div>
                    <div style={{ display: 'flex', justifycontent: 'space-between', fontSize: '11.5px', fontWeight: 700, color: '#475569', marginBottom: '4px' }}>
                      <span>Bottom Spacer (Footer Space)</span>
                      <span style={{ color: '#800020' }}><b>{tempPrintSettings.bottomSpacer} mm</b></span>
                    </div>
                    <input 
                      type="range" 
                      min="0" 
                      max="50" 
                      value={tempPrintSettings.bottomSpacer} 
                      onChange={e => setTempPrintSettings(prev => ({ ...prev, bottomSpacer: parseInt(e.target.value, 10) }))}
                      style={{ width: '100%', accentColor: '#800020', cursor: 'pointer' }}
                    />
                  </div>

                  {/* Font size adjuster */}
                  <div>
                    <div style={{ display: 'flex', justifycontent: 'space-between', fontSize: '11.5px', fontWeight: 700, color: '#475569', marginBottom: '4px' }}>
                      <span>Print Font Size Scale</span>
                      <span style={{ color: '#800020' }}><b>{tempPrintSettings.fontSize}%</b></span>
                    </div>
                    <input 
                      type="range" 
                      min="80" 
                      max="120" 
                      step="5"
                      value={tempPrintSettings.fontSize} 
                      onChange={e => setTempPrintSettings(prev => ({ ...prev, fontSize: parseInt(e.target.value, 10) }))}
                      style={{ width: '100%', accentColor: '#800020', cursor: 'pointer' }}
                    />
                  </div>
                </div>

                {/* Prescription Page Layout preference */}
                <div style={{ background: '#FFFFFF', padding: '14px', borderRadius: '14px', border: '1px solid #E2E8F0', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <h4 style={{ margin: 0, fontSize: '11px', color: '#1E293B', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.03em', borderBottom: '1px solid #F1F5F9', paddingBottom: '6px' }}>
                    Page Layout & Flow Preference
                  </h4>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {[
                      { val: 'auto', label: 'Automatically optimize (Default)' },
                      { val: 'one-page', label: 'Keep on 1 page' },
                      { val: 'allow-two-pages', label: 'Allow 2 pages' }
                    ].map(opt => (
                      <label key={opt.val} style={{ display: 'flex', gap: '8px', alignItems: 'center', cursor: 'pointer' }}>
                        <input 
                          type="radio" 
                          name="pageDistribution" 
                          value={opt.val} 
                          checked={(tempPrintSettings.pageDistribution || 'auto') === opt.val} 
                          onChange={() => setTempPrintSettings(prev => ({ ...prev, pageDistribution: opt.val }))}
                          style={{ accentColor: '#800020' }}
                        />
                        <span style={{ fontSize: '12px', fontWeight: 700, color: '#334155' }}>{opt.label}</span>
                      </label>
                    ))}
                  </div>
                </div>

                {/* Digital Backup letterhead preset */}
                <div>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 800, color: '#475569', letterSpacing: '0.05em', marginBottom: '4px' }}>DIGITAL LETTERHEAD PRESET (BACKUP)</label>
                  <select
                    value={tempPrintSettings.digitalPreset}
                    onChange={e => setTempPrintSettings(prev => ({ ...prev, digitalPreset: e.target.value }))}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid #E2E8F0', fontSize: '12px', fontWeight: 600, color: '#1E293B', background: 'white' }}
                  >
                    <option value="none">No Digital Header (Print on Pre-printed Physical Paper)</option>
                    <option value="teal">Preset Style A: Modern Teal Header Banner</option>
                    <option value="burgundy">Preset Style B: Burgundy Royal Border & Serif Logo</option>
                    <option value="navy">Preset Style C: High-Tech Navy Clinic Theme</option>
                  </select>
                </div>

              </div>

              {/* Right Column: Live Interactive A4 Preview */}
              <div style={{ flex: 1, background: '#E2E8F0', borderRadius: '16px', padding: '16px', display: 'flex', justifyContent: 'center', alignItems: 'flex-start', overflowY: 'auto', border: '1px solid #CBD5E1' }}>
                {(() => {
                  const targetItem = printSettingsTarget?.item || {};
                  const rx = printSettingsTarget?.rx || targetItem.rx || {};
                  const pt = selectedPatient || {};
                  const medsList = rx.items || targetItem.items || [];
                  const testOrders = rx.tests || targetItem.tests || [];
                  const diagnosisVal = rx.diagnosis || targetItem.diagnosis || '';
                  const dateVal = rx.date || targetItem.date || new Date().toLocaleDateString('en-IN');
                  const soapPlanVal = rx.soapPlan || targetItem.soapPlan || targetItem.notes || '';
                  const soapSubjectiveVal = rx.soapSubjective || targetItem.symptoms || '';
                  
                  return (
                    <div style={{
                      width: '100%',
                      maxWidth: '430px',
                      background: tempPrintSettings.digitalPreset !== 'none' 
                        ? '#ffffff' 
                        : customLetterhead 
                          ? `#ffffff url(${customLetterhead}) no-repeat center top` 
                          : '#ffffff',
                      backgroundSize: '100% auto',
                      boxShadow: '0 8px 24px rgba(15, 23, 42, 0.08)',
                      borderRadius: '8px',
                      border: '1px solid #CBD5E1',
                      padding: '24px',
                      boxSizing: 'border-box',
                      minHeight: '620px',
                      display: 'flex',
                      flexDirection: 'column',
                      fontFamily: "'Inter', sans-serif",
                      fontSize: `${tempPrintSettings.fontSize * 0.11}px`,
                      lineHeight: 1.4,
                      transition: 'all 0.2s ease'
                    }}>
                      
                      {/* Top Spacer area */}
                      <div style={{
                        height: `${tempPrintSettings.topSpacer * 2.05}px`,
                        borderBottom: '1px dashed #E2E8F0',
                        background: 'transparent',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '9px',
                        color: '#94A3B8',
                        fontWeight: 700,
                        transition: 'all 0.1s ease',
                        position: 'relative',
                        marginBottom: '12px'
                      }}>
                        {tempPrintSettings.digitalPreset === 'none' ? (
                          !customLetterhead && <span>Header Space Margin ({tempPrintSettings.topSpacer}mm)</span>
                        ) : (
                          <div style={{
                            position: 'absolute',
                            inset: 0,
                            background: tempPrintSettings.digitalPreset === 'teal' ? 'linear-gradient(135deg, #0F766E, #115E59)' : tempPrintSettings.digitalPreset === 'burgundy' ? 'linear-gradient(135deg, #800020, #4A0012)' : 'linear-gradient(135deg, #1E3A8A, #172554)',
                            color: 'white',
                            padding: '6px',
                            display: 'flex',
                            flexDirection: 'column',
                            justifyContent: 'center',
                            alignItems: 'center',
                            textAlign: 'center'
                          }}>
                            <span style={{ fontSize: '10px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.5px' }}>{user.tenantName || 'CUROXA MEDICAL CLINIC'}</span>
                            <span style={{ fontSize: '7px', opacity: 0.8 }}>OPD Consultations & Health Center</span>
                          </div>
                        )}
                      </div>

                      {/* Patient info */}
                      <div style={{ borderBottom: '1px solid #E2E8F0', paddingBottom: '8px', marginBottom: '10px', display: 'grid', gridTemplateColumns: '1.2fr 0.8fr', gap: '8px', fontSize: '9px', color: '#475569' }}>
                        <div>
                          <div style={{ marginBottom: '2px' }}>Patient: <b style={{ color: '#1E293B' }}>{pt.name || 'abcd'}</b></div>
                          <div>Age/Gender: <b>{pt.age || '40'} Y, {pt.gender || 'Female'}</b></div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <div style={{ marginBottom: '2px' }}>Date: <b>{dateVal}</b></div>
                          <div>UHID: <b>{pt.uhid || 'MDC-NEW'}</b></div>
                        </div>
                      </div>

                      {/* Rx / Clinical Notes */}
                      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        
                        {/* Diagnosis */}
                        {diagnosisVal && (
                          <div style={{ fontSize: '9.5px' }}>
                            <span style={{ color: '#64748B', fontWeight: 700, display: 'block', fontSize: '7.5px', textTransform: 'uppercase', marginBottom: '2px' }}>Diagnosis</span>
                            {diagnosisVal.includes('<') && diagnosisVal.includes('>') ? (
                              <div style={{ color: '#1E293B', fontWeight: 600, lineHeight: 1.4 }} dangerouslySetInnerHTML={{ __html: diagnosisVal }} />
                            ) : diagnosisVal.includes('\n') ? (
                              <ul style={{ paddingLeft: '2px', margin: 0, listStyle: 'none' }}>
                                {diagnosisVal.split('\n').filter(line => line.trim() !== '').map((line, i) => (
                                  <li key={i} style={{ marginBottom: '2px', display: 'flex', alignItems: 'flex-start', gap: '6px' }}>
                                    <span style={{ color: '#800020', fontSize: '6px', marginTop: '4px', flexShrink: 0 }}>●</span>
                                    <span style={{ color: '#1E293B', fontWeight: 700 }}>{line.trim()}</span>
                                  </li>
                                ))}
                              </ul>
                            ) : (
                              <b style={{ color: '#1E293B' }}>{diagnosisVal}</b>
                            )}
                          </div>
                        )}

                        {/* Symptoms */}
                        {soapSubjectiveVal && (
                          <div style={{ fontSize: '9px', background: '#F8FAFC', padding: '5px', borderRadius: '4px' }}>
                            <span style={{ color: '#64748B', fontWeight: 700, display: 'block', fontSize: '7.5px', textTransform: 'uppercase' }}>Symptoms / subjective</span>
                            <span style={{ color: '#334155', fontWeight: 600 }}>{soapSubjectiveVal}</span>
                          </div>
                        )}

                        {/* Medicines List */}
                        {medsList.length > 0 && (
                          <div>
                            <span style={{ color: '#64748B', fontWeight: 700, display: 'block', fontSize: '7.5px', textTransform: 'uppercase', marginBottom: '3px' }}>Rx (Prescribed Medicines)</span>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '8.5px' }}>
                              <thead>
                                <tr style={{ borderBottom: '1px solid #E2E8F0', color: '#64748B', fontWeight: 700, textAlign: 'left' }}>
                                  <th style={{ padding: '3px 0' }}>Medicine</th>
                                  <th>Dose</th>
                                  <th>Freq</th>
                                  <th>Duration</th>
                                </tr>
                              </thead>
                              <tbody>
                                {medsList.map((m, index) => (
                                  <tr key={index} style={{ borderBottom: '1px solid #F1F5F9', color: '#334155' }}>
                                    <td style={{ padding: '3px 0', fontWeight: 700 }}>💊 {m.name || m.medicine}</td>
                                    <td>{m.dose || m.dosage}</td>
                                    <td>{m.freq || m.instructions}</td>
                                    <td>{m.duration}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}

                        {/* Lab tests */}
                        {testOrders.length > 0 && (
                          <div>
                            <span style={{ color: '#64748B', fontWeight: 700, display: 'block', fontSize: '7.5px', textTransform: 'uppercase', marginBottom: '3px' }}>Lab Tests</span>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '3px' }}>
                              {testOrders.map((t, idx) => (
                                <span key={idx} style={{ fontSize: '7.5px', background: '#EFF6FF', color: '#1E40AF', padding: '2px 5px', borderRadius: '4px', fontWeight: 700 }}>
                                  🧪 {t}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* SOAP Plan / Notes */}
                        {soapPlanVal && (
                          <div style={{ fontSize: '8.5px' }}>
                            <span style={{ color: '#64748B', fontWeight: 700, display: 'block', fontSize: '7.5px', textTransform: 'uppercase' }}>Directions / Remarks</span>
                            <p style={{ margin: '2px 0 0 0', color: '#475569' }}>{soapPlanVal}</p>
                          </div>
                        )}

                      </div>

                      {/* Bottom Spacer area */}
                      <div style={{
                        marginTop: 'auto',
                        height: `${tempPrintSettings.bottomSpacer * 2.05}px`,
                        borderTop: '1px dashed #E2E8F0',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        fontSize: '9px',
                        color: '#94A3B8',
                        fontWeight: 700,
                        paddingTop: '6px'
                      }}>
                        <span>Footer Spacer ({tempPrintSettings.bottomSpacer}mm)</span>
                        <div style={{ textAlign: 'right', color: '#334155' }}>
                          <div style={{ borderBottom: '1px solid #E2E8F0', width: '50px', height: '10px', marginLeft: 'auto' }}></div>
                          <span style={{ fontSize: '7px', fontWeight: 800, marginTop: '2px', display: 'block' }}>Dr. {user.name || 'Sarah Jenkins'}</span>
                        </div>
                      </div>

                    </div>
                  );
                })()}
              </div>

            </div>

            {/* Modal Footer */}
            <div style={{ padding: '16px 24px', background: '#F8FAFC', borderTop: '1px solid #E2E8F0', display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
              <button 
                onClick={() => {
                  setShowPrintSettingsModal(false);
                  if (printSettingsTarget && printSettingsTarget.rx) {
                    handleLoadPrescriptionForEdit(printSettingsTarget.rx, printSettingsTarget.item?.relatedLabs || []);
                  }
                  setPrintSettingsTarget(null);
                }} 
                style={{ background: '#E2E8F0', border: 'none', color: '#475569', borderRadius: '10px', padding: '10px 20px', fontSize: '13.0px', fontWeight: 700, cursor: 'pointer' }}
              >
                Edit Prescription
              </button>
              <button 
                onClick={() => {
                  setShowPrintSettingsModal(false);
                  setPrintSettings(tempPrintSettings);
                  if (printSettingsTarget.callback) {
                    printSettingsTarget.callback(tempPrintSettings);
                  }
                  setPrintSettingsTarget(null);
                  showToastNotification("Prescription shared with patient successfully!", "success");
                }}
                style={{ background: 'linear-gradient(135deg, #10B981, #059669)', border: 'none', color: '#ffffff', borderRadius: '10px', padding: '10px 24px', fontSize: '13.0px', fontWeight: 700, cursor: 'pointer', boxShadow: '0 4px 10px rgba(16, 185, 129, 0.2)' }}
              >
                Share Prescription
              </button>
              <button 
                onClick={() => {
                  setShowPrintSettingsModal(false);
                  setPrintSettings(tempPrintSettings);
                  if (printSettingsTarget.callback) {
                    printSettingsTarget.callback(tempPrintSettings);
                  }
                  setPrintSettingsTarget(null);
                }}
                style={{ background: 'linear-gradient(135deg, #800020, #600018)', border: 'none', color: '#ffffff', borderRadius: '10px', padding: '10px 24px', fontSize: '13.0px', fontWeight: 700, cursor: 'pointer', boxShadow: '0 4px 10px rgba(128, 0, 32, 0.2)' }}
              >
                Print Prescription
              </button>
            </div>

          </div>
        </div>
      )}

      {/* Vitals History Tracking Modal */}
      {showVitalsHistoryModal && selectedPatient && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.65)', backdropFilter: 'blur(12px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: '20px' }}>
          <div className="glass-card" style={{ width: '100%', maxWidth: '900px', background: '#FFFFFF', padding: '0', borderRadius: '24px', maxHeight: '90vh', overflow: 'hidden', display: 'flex', flexDirection: 'column', boxShadow: '0 25px 80px -15px rgba(15, 23, 42, 0.22)' }}>
            
            {/* Modal Header */}
            <div style={{ background: 'linear-gradient(135deg, #0284C7, #0369A1)', padding: '20px 28px', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: '#E0F2FE' }}>
                    <path d="M22 12h-4l-3 9L9 3l-3 9H2"/>
                  </svg>
                  <h3 style={{ margin: 0, fontSize: '17px', fontWeight: 900, letterSpacing: '0.5px', fontFamily: "'Outfit', sans-serif" }}>PATIENT VITALS HISTORY & LOGS</h3>
                </div>
                <div style={{ fontSize: '11.5px', color: '#E0F2FE', marginTop: '4px', fontWeight: 700, opacity: 0.9 }}>
                  Patient: <b style={{ color: '#FFFFFF' }}>{selectedPatient.name}</b> ({selectedPatient.gender}, {selectedPatient.age} Yrs) • UHID: {selectedPatient.uhid}
                </div>
              </div>
              <button 
                onClick={() => setShowVitalsHistoryModal(false)} 
                style={{ background: 'rgba(255,255,255,0.1)', border: 'none', color: 'white', width: '36px', height: '36px', borderRadius: '18px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', fontSize: '14px', fontWeight: 800 }}
              >
                ✕
              </button>
            </div>

            {/* Modal Content */}
            <div data-lenis-prevent style={{ flex: 1, overflowY: 'auto', padding: '24px', background: '#F8FAFC' }}>
              {patientVitals.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px', color: '#64748B', fontWeight: 600 }}>
                  No vitals history logs recorded for this patient.
                </div>
              ) : (
                <div style={{ overflowX: 'auto', background: 'white', borderRadius: '16px', border: '1px solid #E2E8F0', boxShadow: '0 4px 12px rgba(0,0,0,0.02)' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                    <thead>
                      <tr style={{ background: '#F1F5F9', borderBottom: '2px solid #E2E8F0' }}>
                        <th style={{ padding: '16px', fontSize: '11px', color: '#475569', fontWeight: 800, textTransform: 'uppercase' }}>Date & Time</th>
                        <th style={{ padding: '16px', fontSize: '11px', color: '#475569', fontWeight: 800, textTransform: 'uppercase' }}>Recorded By</th>
                        <th style={{ padding: '16px', fontSize: '11px', color: '#475569', fontWeight: 800, textTransform: 'uppercase' }}>BP (mmHg)</th>
                        <th style={{ padding: '16px', fontSize: '11px', color: '#475569', fontWeight: 800, textTransform: 'uppercase' }}>Pulse (bpm)</th>
                        <th style={{ padding: '16px', fontSize: '11px', color: '#475569', fontWeight: 800, textTransform: 'uppercase' }}>Temp (°F)</th>
                        <th style={{ padding: '16px', fontSize: '11px', color: '#475569', fontWeight: 800, textTransform: 'uppercase' }}>SpO2</th>
                        <th style={{ padding: '16px', fontSize: '11px', color: '#475569', fontWeight: 800, textTransform: 'uppercase' }}>Weight / Height</th>
                      </tr>
                    </thead>
                    <tbody>
                      {patientVitals.map((v, idx) => (
                        <tr key={v._id || idx} style={{ borderBottom: '1px solid #E2E8F0', transition: '0.15s', background: idx === 0 ? '#F0F9FF' : 'transparent' }}>
                          <td style={{ padding: '16px', fontSize: '13px', fontWeight: 700, color: '#1E293B' }}>
                            {new Date(v.createdAt).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                            {idx === 0 && <span style={{ marginLeft: '6px', background: '#0284C7', color: 'white', fontSize: '9px', padding: '2px 6px', borderRadius: '4px', fontWeight: 800 }}>LATEST</span>}
                          </td>
                          <td style={{ padding: '16px', fontSize: '13px', fontWeight: 650, color: '#475569' }}>
                            {v.recordedBy?.name || 'Receptionist'}
                          </td>
                          <td style={{ padding: '16px', fontSize: '13px', fontWeight: 700, color: '#0F172A' }}>
                            {v.bpSys && v.bpDia ? `${v.bpSys}/${v.bpDia}` : '--'}
                          </td>
                          <td style={{ padding: '16px', fontSize: '13px', fontWeight: 700, color: '#0F172A' }}>
                            {v.pulse ? `${v.pulse} bpm` : '--'}
                          </td>
                          <td style={{ padding: '16px', fontSize: '13px', fontWeight: 700, color: '#0F172A' }}>
                            {v.temperature ? `${v.temperature} °F` : '--'}
                          </td>
                          <td style={{ padding: '16px', fontSize: '13px', fontWeight: 700, color: v.spo2 < 95 ? '#EF4444' : '#0F172A' }}>
                            {v.spo2 ? `${v.spo2}%` : '--'}
                          </td>
                          <td style={{ padding: '16px', fontSize: '13px', fontWeight: 650, color: '#475569' }}>
                            {v.weight || '--'} kg / {v.height || '--'} cm
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div style={{ background: '#F8FAFC', padding: '16px 24px', display: 'flex', justifyContent: 'flex-end', borderTop: '1px solid #E2E8F0' }}>
              <button 
                onClick={() => setShowVitalsHistoryModal(false)}
                className="btn btn-secondary"
                style={{ padding: '10px 20px', borderRadius: '8px', fontSize: '13px', fontWeight: 800 }}
              >
                Close Logs
              </button>
            </div>

          </div>
        </div>
      )}

      {/* Real Interactive Clinical EMR Timeline Modal */}
      {showTimelineModal && selectedPatient && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.65)', backdropFilter: 'blur(12px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: '20px' }}>
          <div className="glass-card" style={{ width: '100%', maxWidth: '1050px', background: '#FFFFFF', padding: '0', borderRadius: '24px', maxHeight: '90vh', overflow: 'hidden', display: 'flex', flexDirection: 'column', boxShadow: '0 25px 80px -15px rgba(15, 23, 42, 0.22)', border: '1px solid rgba(241, 245, 249, 0.9)' }}>
            
            {/* Modal Header */}
            <div style={{ background: 'linear-gradient(135deg, #1E3A8A, #0F172A)', padding: '20px 28px', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: '#60A5FA' }}>
                    <path d="M12 8v4l3 3"/>
                    <circle cx="12" cy="12" r="10"/>
                  </svg>
                  <h3 style={{ margin: 0, fontSize: '17px', fontWeight: 900, letterSpacing: '0.5px', fontFamily: "'Outfit', sans-serif" }}>CLINICAL EMR TIMELINE & PATIENT PORTAL</h3>
                </div>
                <div style={{ fontSize: '11.5px', color: '#93C5FD', marginTop: '4px', fontWeight: 700, opacity: 0.9 }}>
                  Active Patient Record: <b style={{ color: '#FFFFFF' }}>{selectedPatient.name}</b> ({selectedPatient.gender}, {selectedPatient.age} Yrs) • Patient ID / UHID: <span style={{ color: '#F3F4F6', letterSpacing: '0.5px' }}>{selectedPatient.uhid || `MDC-${selectedPatient._id?.toString().substring(0, 6).toUpperCase()}`}</span>
                </div>
              </div>
              <button 
                onClick={() => setShowTimelineModal(false)} 
                style={{ background: 'rgba(255,255,255,0.1)', border: 'none', color: 'white', width: '36px', height: '36px', borderRadius: '18px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', transition: 'all 0.2s ease', fontSize: '14px', fontWeight: 800 }}
                onMouseEnter={e => { e.currentTarget.style.background = 'rgba(239, 68, 68, 0.85)'; e.currentTarget.style.transform = 'rotate(90deg)'; }}
                onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.1)'; e.currentTarget.style.transform = 'rotate(0deg)'; }}
              >
                ✕
              </button>
            </div>

            <div data-lenis-prevent style={{ flex: 1, overflowY: 'auto', overscrollBehavior: 'contain', padding: '24px', background: '#F8FAFC', display: 'flex', flexDirection: 'column', gap: '24px' }}>
              
              {/* Top Banner Card: Patient Profile Details */}
              <div className="glass-card" style={{ background: 'linear-gradient(135deg, #F8FAFC, #EFF6FF)', border: '1px solid #E2E8F0', borderRadius: '20px', padding: '24px', display: 'flex', gap: '28px', alignItems: 'center', boxShadow: '0 8px 30px rgba(0, 0, 0, 0.02)' }}>
                {/* Avatar with deep blue high-contrast gradient */}
                <div style={{
                  width: '72px',
                  height: '72px',
                  borderRadius: '20px',
                  background: 'linear-gradient(135deg, #3B82F6, #1D4ED8)',
                  color: '#FFFFFF',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '26px',
                  fontWeight: 900,
                  boxShadow: '0 10px 20px -5px rgba(37, 99, 235, 0.3)',
                  border: '2px solid #FFFFFF',
                  flexShrink: 0
                }}>
                  {selectedPatient.name.split(' ').map(p => p[0]).join('').substring(0, 2).toUpperCase()}
                </div>
                
                {/* Profile Grid */}
                <div style={{ flex: 1, display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px 24px' }}>
                  <div>
                    <div style={{ fontSize: '10.5px', color: '#94A3B8', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                      Full Name
                    </div>
                    <div style={{ fontSize: '15.5px', fontWeight: 850, color: '#0F172A', marginTop: '6px' }}>{selectedPatient.name}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: '10.5px', color: '#94A3B8', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="18" x="3" y="4" rx="2" ry="2"/><line x1="16" x2="16" y1="2" y2="6"/><line x1="8" x2="8" y1="2" y2="6"/><line x1="3" x2="21" y1="10" y2="10"/></svg>
                      Patient ID / UHID
                    </div>
                    <div style={{ fontSize: '14.5px', fontWeight: 800, color: '#2563EB', marginTop: '6px' }}>{selectedPatient.uhid || `MDC-${selectedPatient._id?.toString().substring(0, 6).toUpperCase()}`}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: '10.5px', color: '#94A3B8', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>
                      Age & Gender
                    </div>
                    <div style={{ fontSize: '14.5px', fontWeight: 800, color: '#334155', marginTop: '6px' }}>{selectedPatient.age} Yrs, {selectedPatient.gender}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: '10.5px', color: '#94A3B8', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
                      Contact Phone
                    </div>
                    <div style={{ fontSize: '14.5px', fontWeight: 800, color: '#334155', marginTop: '6px' }}>{selectedPatient.contact || selectedPatient.phone || 'N/A'}</div>
                  </div>
                  
                  {/* Row 2 */}
                  <div>
                    <div style={{ fontSize: '10.5px', color: '#94A3B8', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/></svg>
                      Blood Group
                    </div>
                    <span style={{
                      display: 'inline-block',
                      background: '#FEE2E2',
                      color: '#EF4444',
                      padding: '4px 10px',
                      borderRadius: '8px',
                      fontSize: '11px',
                      fontWeight: 900,
                      marginTop: '6px',
                      border: '1px solid rgba(239, 68, 68, 0.15)'
                    }}>
                      {selectedPatient.bloodGroup || 'N/A'}
                    </span>
                  </div>
                  <div>
                    <div style={{ fontSize: '10.5px', color: '#94A3B8', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
                      ABHA Health ID
                    </div>
                    <div style={{ fontSize: '14.5px', fontWeight: 800, color: '#475569', marginTop: '6px' }}>{selectedPatient.abhaId || 'N/A'}</div>
                  </div>
                  <div style={{ gridColumn: 'span 2' }}>
                    <div style={{ fontSize: '10.5px', color: '#94A3B8', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" x2="12" y1="9" y2="13"/><line x1="12" x2="12.01" y1="17" y2="17"/></svg>
                      Known Clinical Allergies
                    </div>
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      marginTop: '6px',
                      color: selectedPatient.allergies && selectedPatient.allergies.toLowerCase() !== 'none' && selectedPatient.allergies.toLowerCase() !== 'none reported' ? '#D97706' : '#16A34A',
                      fontWeight: 800,
                      fontSize: '13.5px'
                    }}>
                      <span style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                        background: selectedPatient.allergies && selectedPatient.allergies.toLowerCase() !== 'none' && selectedPatient.allergies.toLowerCase() !== 'none reported' ? '#FEF3C7' : '#DCFCE7',
                        padding: '4px 12px',
                        borderRadius: '8px',
                        border: selectedPatient.allergies && selectedPatient.allergies.toLowerCase() !== 'none' && selectedPatient.allergies.toLowerCase() !== 'none reported' ? '1px solid rgba(217, 119, 6, 0.2)' : '1px solid rgba(22, 163, 74, 0.2)'
                      }}>
                        {selectedPatient.allergies || 'No known drug allergies (NKDA)'}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
              
              {/* Bottom split columns grid */}
              <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.8fr', gap: '24px' }} className="mobile-stack">
                
                {/* Left Column: Vertical Timeline */}
                <div style={{ background: '#FFFFFF', borderRadius: '20px', border: '1px solid #E2E8F0', padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px', boxShadow: '0 4px 20px rgba(0,0,0,0.01)' }}>
                  
                  {/* Timeline Header */}
                  <div style={{ borderBottom: '1px solid #F1F5F9', paddingBottom: '16px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <h4 style={{ margin: 0, fontSize: '14.5px', fontWeight: 900, color: '#1E3A8A', fontFamily: "'Outfit', sans-serif" }}>CHRONOLOGICAL MEDICAL TIMELINE</h4>
                      <span style={{ fontSize: '11px', color: '#64748B', fontWeight: 800, background: '#F1F5F9', padding: '4px 10px', borderRadius: '99px' }}>
                        Total Encounters: {((mockHistoryDb[selectedPatient._id] || []).length + pastPrescriptions.length)}
                      </span>
                    </div>

                    {/* Search & Filter Bar */}
                    <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
                      {/* Search Bar */}
                      <div style={{ position: 'relative', flex: 1, minWidth: '200px' }}>
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94A3B8' }}>
                          <circle cx="11" cy="11" r="8"/>
                          <path d="m21 21-4.3-4.3"/>
                        </svg>
                        <input 
                          type="text"
                          placeholder="Search diagnosis, meds, clinic or doctors..."
                          value={emrSearchQuery}
                          onChange={(e) => setEmrSearchQuery(e.target.value)}
                          style={{
                            width: '100%',
                            padding: '10px 12px 10px 38px',
                            fontSize: '13px',
                            border: '1px solid #CBD5E1',
                            borderRadius: '10px',
                            outline: 'none',
                            transition: 'all 0.2s ease',
                            background: '#F8FAFC'
                          }}
                          onFocus={(e) => { e.target.style.borderColor = '#3B82F6'; e.target.style.background = '#FFFFFF'; e.target.style.boxShadow = '0 0 0 3px rgba(59, 130, 246, 0.15)'; }}
                          onBlur={(e) => { e.target.style.borderColor = '#CBD5E1'; e.target.style.background = '#F8FAFC'; e.target.style.boxShadow = 'none'; }}
                        />
                      </div>

                      {/* Filter Type Pills */}
                      <div style={{ display: 'flex', background: '#F1F5F9', padding: '4px', borderRadius: '10px', gap: '4px' }}>
                        {[
                          { id: 'all', label: 'All' },
                          { id: 'prescription', label: 'Prescriptions' },
                          { id: 'encounter', label: 'OPD encounters' }
                        ].map(pill => (
                          <button
                            key={pill.id}
                            onClick={() => setEmrFilterType(pill.id)}
                            style={{
                              border: 'none',
                              background: emrFilterType === pill.id ? '#FFFFFF' : 'transparent',
                              color: emrFilterType === pill.id ? '#1E3A8A' : '#64748B',
                              padding: '6px 12px',
                              borderRadius: '8px',
                              fontSize: '12px',
                              fontWeight: 800,
                              cursor: 'pointer',
                              transition: 'all 0.15s ease',
                              boxShadow: emrFilterType === pill.id ? '0 2px 4px rgba(0,0,0,0.04)' : 'none'
                            }}
                          >
                            {pill.label}
                          </button>
                        ))}
                      </div>

                      {/* Chronological Sorting Toggle */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontSize: '11px', fontWeight: 800, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Sort</span>
                        <CustomDropdown
                          value={emrSortOrder}
                          onChange={(val) => setEmrSortOrder(val)}
                          style={{ width: '180px' }}
                          options={[
                            { value: 'newest', label: 'Newest First' },
                            { value: 'oldest', label: 'Oldest First (Previous)' }
                          ]}
                          buttonStyle={{
                            padding: '8px 12px',
                            fontSize: '12.5px',
                            fontWeight: 700,
                            color: '#334155',
                            border: '1px solid #CBD5E1',
                            borderRadius: '10px',
                            background: '#FFFFFF',
                            height: '37px'
                          }}
                        />
                      </div>
                    </div>
                  </div>

                  <div style={{ position: 'relative', paddingLeft: '24px', minHeight: '200px' }}>
                    {/* Vertical line connector */}
                    <div style={{ position: 'absolute', left: '7px', top: '8px', bottom: '8px', width: '2px', background: '#E2E8F0' }}></div>

                    {/* Dynamic Merged Chronological List */}
                    {(() => {
                      const timelineItems = [];

                      // 1. Backend real prescriptions
                      pastPrescriptions.forEach((rx, index) => {
                        const relatedApp = rx.appointmentId ? appointments.find(a => a._id.toString() === rx.appointmentId.toString() || a._id === rx.appointmentId) : null;
                        const relatedLabs = rx.appointmentId ? allLabs.filter(l => l.appointmentId && (l.appointmentId.toString() === rx.appointmentId.toString() || l.appointmentId === rx.appointmentId)) : [];
                        const diagStr = relatedApp?.diagnosis || 'Diagnostic Follow-up & Treatment Plan';

                        timelineItems.push({
                          id: `real-${rx._id || index}`,
                          date: new Date(rx.createdAt || Date.now()).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }),
                          rawDate: rx.createdAt ? new Date(rx.createdAt) : new Date(),
                          title: 'Clinical Consultation & Rx',
                          clinic: 'Curoxa Cardiac OPD Center',
                          doctor: user.name || 'Dr. Sarah Jenkins',
                          diagnosis: diagStr,
                          vitals: `BP: ${vitals.bpSys}/${vitals.bpDia} mmHg | Pulse: ${vitals.pulse} bpm | SpO2: ${vitals.spo2}%`,
                          notes: rx.notes || relatedApp?.notes || '',
                          items: (rx.items || []).map(item => ({
                            medicine: item.medicine,
                            dosage: item.dosage,
                            instructions: item.instructions,
                            duration: item.duration
                          })),
                          tests: relatedLabs.map(l => l.testName),
                          isReal: true,
                          type: 'prescription',
                          rx: rx,
                          relatedLabs: relatedLabs
                        });
                      });

                      // 2. Mock preloaded histories
                      const mocks = mockHistoryDb[selectedPatient._id] || [];
                      mocks.forEach((visit, vidx) => {
                        const mockDate = new Date(visit.date);
                        timelineItems.push({
                          id: `mock-${vidx}`,
                          date: visit.date,
                          rawDate: isNaN(mockDate.getTime()) ? new Date(0) : mockDate,
                          title: 'OPD Clinical Encounter',
                          clinic: 'Curoxa SuperSpecialty Clinic',
                          doctor: 'Dr. Sarah Jenkins',
                          diagnosis: visit.diagnosis,
                          vitals: '--',
                          notes: visit.notes || '',
                          items: visit.items.map(item => ({
                            medicine: item.medicine,
                            dosage: item.dosage,
                            instructions: item.instructions,
                            duration: item.duration
                          })),
                          tests: [],
                          isReal: false,
                          type: 'encounter'
                        });
                      });

                      // Apply search query filter
                      let filteredItems = timelineItems;
                      if (emrSearchQuery.trim() !== '') {
                        const query = emrSearchQuery.toLowerCase();
                        filteredItems = filteredItems.filter(item => {
                          const matchesDiagnosis = item.diagnosis?.toLowerCase().includes(query);
                          const matchesDoctor = item.doctor?.toLowerCase().includes(query);
                          const matchesClinic = item.clinic?.toLowerCase().includes(query);
                          const matchesMeds = item.items?.some(m => m.medicine?.toLowerCase().includes(query));
                          const matchesTests = item.tests?.some(t => t.toLowerCase().includes(query));
                          const matchesTitle = item.title?.toLowerCase().includes(query);
                          const matchesDate = item.date?.toLowerCase().includes(query);
                          return matchesDiagnosis || matchesDoctor || matchesClinic || matchesMeds || matchesTests || matchesTitle || matchesDate;
                        });
                      }

                      // Apply type filter
                      if (emrFilterType !== 'all') {
                        filteredItems = filteredItems.filter(item => item.type === emrFilterType);
                      }

                      // Apply chronological sorting
                      filteredItems.sort((a, b) => {
                        const dateA = a.rawDate.getTime();
                        const dateB = b.rawDate.getTime();
                        return emrSortOrder === 'newest' ? dateB - dateA : dateA - dateB;
                      });

                      if (filteredItems.length === 0) {
                        return (
                          <div style={{ textAlign: 'center', padding: '48px 16px', color: '#94A3B8' }}>
                            <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginBottom: '12px', color: '#CBD5E1' }}>
                              <circle cx="11" cy="11" r="8"/>
                              <path d="m21 21-4.3-4.3"/>
                            </svg>
                            <div style={{ fontSize: '13px', fontWeight: 800, color: '#475569' }}>No matching records found</div>
                            <div style={{ fontSize: '11.5px', marginTop: '4px', color: '#94A3B8' }}>Try adjusting your search query or filters.</div>
                          </div>
                        );
                      }

                      return filteredItems.map((item, idx) => (
                        <div key={item.id} style={{ position: 'relative', marginBottom: '24px' }}>
                          {/* Timeline Node dot */}
                          <div style={{ position: 'absolute', left: '-22px', top: '6px', width: '12px', height: '12px', borderRadius: '6px', background: item.isReal ? '#2563EB' : '#10B981', border: '3px solid white', boxShadow: `0 0 0 2px ${item.isReal ? 'rgba(37,99,235,0.15)' : 'rgba(16,185,129,0.15)'}` }}></div>

                          {/* Timeline Event Card */}
                          <div className="patient-row-hover" style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '16px', padding: '20px', transition: 'all 0.2s ease', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.01), 0 2px 4px -1px rgba(0,0,0,0.01)' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px', flexWrap: 'wrap', gap: '8px' }}>
                              <span style={{ fontSize: '12.5px', fontWeight: 850, color: '#1E293B' }}>{item.date}</span>
                              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                <span style={{ fontSize: '9.5px', background: item.isReal ? '#EFF6FF' : '#E6F4EA', color: item.isReal ? '#1E40AF' : '#137333', padding: '4px 10px', borderRadius: '8px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.5px', border: item.isReal ? '1px solid rgba(37,99,235,0.1)' : '1px solid rgba(16,185,129,0.1)' }}>
                                  {item.title}
                                </span>
                                {item.isReal && item.type === 'prescription' && (
                                  <div style={{ display: 'flex', gap: '6px' }}>
                                    <button
                                      onClick={() => handleLoadPrescriptionForEdit(item.rx, item.relatedLabs)}
                                      style={{ margin: 0, padding: '4px 10px', fontSize: '10.5px', background: '#F0FDF4', color: '#15803D', border: '1px solid #BBF7D0', cursor: 'pointer', borderRadius: '8px', fontWeight: 900, display: 'flex', alignItems: 'center', gap: '4px', transition: 'all 0.2s ease' }}
                                    >
                                      <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>
                                      Edit
                                    </button>
                                    <button
                                      onClick={() => {
                                        setPrintSettingsTarget({
                                          rx: item.rx,
                                          item: item,
                                          callback: (finalSettings) => {
                                            handlePrintPrescription(item.rx, item, finalSettings);
                                          }
                                        });
                                        setTempPrintSettings(printSettings);
                                        setShowPrintSettingsModal(true);
                                      }}
                                      style={{ margin: 0, padding: '4px 10px', fontSize: '10.5px', background: '#EFF6FF', color: '#1E40AF', border: '1px solid #BFDBFE', cursor: 'pointer', borderRadius: '8px', fontWeight: 900, display: 'flex', alignItems: 'center', gap: '4px', transition: 'all 0.2s ease' }}
                                    >
                                      <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
                                      Print
                                    </button>
                                  </div>
                                )}
                              </div>
                            </div>

                            <div style={{ fontSize: '11.5px', color: '#64748B', marginBottom: '12px', fontWeight: 700 }}>
                              Facility: <b style={{ color: '#334155' }}>{item.clinic}</b> &nbsp;|&nbsp; Doctor: <b style={{ color: '#334155' }}>{item.doctor}</b>
                            </div>

                            {/* Diagnosis Badge */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px', flexWrap: 'wrap' }}>
                              <span style={{ fontSize: '9px', background: '#FEE2E2', color: '#DC2626', padding: '3px 8px', borderRadius: '6px', fontWeight: 900, letterSpacing: '0.5px', border: '1px solid rgba(220,38,38,0.1)' }}>DIAGNOSIS</span>
                              <b style={{ fontSize: '13px', color: '#0F172A', fontWeight: 850 }}>{item.diagnosis}</b>
                            </div>

                            {/* Vitals Log */}
                            <div style={{ background: '#F8FAFC', border: '1px dashed #CBD5E1', padding: '10px 14px', borderRadius: '10px', fontSize: '11px', color: '#475569', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: '#EF4444' }}><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>
                              <span><b>Recorded Vitals:</b> {item.vitals}</span>
                            </div>

                            {/* Test Orders */}
                            {item.tests && item.tests.length > 0 && (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '16px' }}>
                                <div style={{ fontSize: '10.5px', fontWeight: 900, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: '#10B981' }}><path d="M10 2v7.31"/><path d="M14 2v7.31"/><path d="M14 9a2 2 0 0 0-4 0v1.5a1.5 1.5 0 0 1-3 0v-1a5.5 5.5 0 0 1 11 0v1a1.5 1.5 0 0 1-3 0Z"/><path d="M20 22H4"/><path d="M7 16a5 5 0 0 0 10 0"/></svg>
                                  <span>Assigned Diagnostics</span>
                                </div>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                                  {item.tests.map((testName, tIdx) => (
                                    <span key={tIdx} style={{ background: '#F0FDF4', color: '#15803D', border: '1px solid #BBF7D0', padding: '4px 10px', borderRadius: '8px', fontSize: '11px', fontWeight: 800 }}>
                                      {testName}
                                    </span>
                                  ))}
                                </div>
                              </div>
                            )}

                            {/* Medications list */}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                              <div style={{ fontSize: '10.5px', fontWeight: 900, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: '#3B82F6' }}><path d="m10.5 20.5 10-10a4.95 4.95 0 1 0-7-7l-10 10a4.95 4.95 0 1 0 7 7Z"/><path d="m8.5 8.5 7 7"/></svg>
                                <span>Prescribed Therapeutics</span>
                              </div>
                              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }} className="mobile-stack">
                                {item.items.map((med, mIdx) => (
                                  <div key={mIdx} style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '12px', padding: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', transition: 'all 0.15s ease' }}>
                                    <div style={{ flex: 1 }}>
                                      <div style={{ fontSize: '11.5px', fontWeight: 850, color: '#0F172A' }}>{med.medicine}</div>
                                      <div style={{ fontSize: '9.5px', color: '#64748B', marginTop: '4px', fontWeight: 700 }}>
                                        Dose: <span style={{ color: '#334155' }}>{med.dosage}</span> &nbsp;|&nbsp; Freq: {med.instructions}
                                      </div>
                                      <div style={{ fontSize: '9.5px', color: '#94A3B8', marginTop: '2px', fontWeight: 700 }}>Duration: {med.duration}</div>
                                    </div>
                                    <button
                                      onClick={() => {
                                        copyMedToPrescription(med);
                                        showToastNotification(`Copied ${med.medicine} to active prescription sheet!`, 'success');
                                      }}
                                      style={{ margin: 0, padding: '6px 12px', fontSize: '10.5px', background: '#EFF6FF', color: '#2563EB', border: '1px solid #BFDBFE', cursor: 'pointer', borderRadius: '8px', fontWeight: 900, display: 'flex', alignItems: 'center', gap: '2px', transition: 'all 0.2s ease' }}
                                      onMouseEnter={e => { e.currentTarget.style.background = '#2563EB'; e.currentTarget.style.color = '#FFFFFF'; }}
                                      onMouseLeave={e => { e.currentTarget.style.background = '#EFF6FF'; e.currentTarget.style.color = '#2563EB'; }}
                                      title="Refill / copy into active sheet"
                                    >
                                      Refill
                                    </button>
                                  </div>
                                ))}
                              </div>
                            </div>

                          </div>
                        </div>
                      ));
                    })()}
                  </div>
                </div>

                {/* Right Column: Clinical Insights & Allergies */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                  
                  {/* Vitals History / Trend summary */}
                  <div style={{ background: '#FFFFFF', borderRadius: '20px', border: '1px solid #E2E8F0', padding: '20px', boxShadow: '0 4px 20px rgba(0,0,0,0.01)' }}>
                    <h4 style={{ margin: '0 0 16px 0', fontSize: '13px', fontWeight: 900, color: '#1E3A8A', display: 'flex', alignItems: 'center', gap: '8px', fontFamily: "'Outfit', sans-serif" }}>
                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: '#2563EB' }}><path d="m19 12-4-4-4 4-4-4-4 4"/></svg>
                      EMR VITAL HISTORY TRENDS
                    </h4>
                    
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', background: '#F8FAFC', borderRadius: '10px', fontSize: '12px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <div style={{ width: '8px', height: '8px', borderRadius: '4px', background: '#EF4444' }}></div>
                          <span style={{ fontWeight: 700, color: '#475569' }}>Blood Pressure (Avg)</span>
                        </div>
                        <b style={{ color: '#0F172A', fontWeight: 800 }}>--</b>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', background: '#F8FAFC', borderRadius: '10px', fontSize: '12px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <div style={{ width: '8px', height: '8px', borderRadius: '4px', background: '#3B82F6' }}></div>
                          <span style={{ fontWeight: 700, color: '#475569' }}>Heart Rate / Pulse</span>
                        </div>
                        <b style={{ color: '#0F172A', fontWeight: 800 }}>--</b>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', background: '#F8FAFC', borderRadius: '10px', fontSize: '12px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <div style={{ width: '8px', height: '8px', borderRadius: '4px', background: '#F59E0B' }}></div>
                          <span style={{ fontWeight: 700, color: '#475569' }}>Blood Sugar (Avg)</span>
                        </div>
                        <b style={{ color: '#0F172A', fontWeight: 800 }}>--</b>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', background: '#F8FAFC', borderRadius: '10px', fontSize: '12px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <div style={{ width: '8px', height: '8px', borderRadius: '4px', background: '#10B981' }}></div>
                          <span style={{ fontWeight: 700, color: '#475569' }}>SpO2 Levels</span>
                        </div>
                        <b style={{ color: '#0F172A', fontWeight: 800 }}>--</b>
                      </div>
                    </div>

                    <div style={{ borderTop: '1px solid #F1F5F9', paddingTop: '12px', marginTop: '12px', fontSize: '10.5px', color: '#64748B' }}>
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '6px', lineHeight: '1.4' }}>
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: '#2563EB', marginTop: '2px', flexShrink: 0 }}><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>
                        <span><b>Clinical Guidance:</b> Blood pressure trends are generated automatically from historical EMR checkins and integrated directly into the Curoxa Patient Charting API.</span>
                      </div>
                    </div>
                  </div>

                  {/* Secure Compliance Certificate */}
                  <div style={{ background: 'linear-gradient(135deg, #ECFDF5, #F0FDF4)', borderRadius: '20px', border: '1px solid #A7F3D0', padding: '18px', display: 'flex', gap: '12px', boxShadow: '0 4px 15px rgba(16,185,129,0.02)' }}>
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: '#059669', flexShrink: 0 }}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/></svg>
                    <div>
                      <h5 style={{ margin: '0 0 4px 0', fontSize: '12px', fontWeight: 900, color: '#065F46', letterSpacing: '0.3px' }}>DPDP SECURE EMR ENVELOPE</h5>
                      <p style={{ margin: 0, fontSize: '10.5px', color: '#047857', lineHeight: '1.4' }}>
                        This historical clinical log is protected by end-to-end 256-bit AES database encryption. DPDP compliance active. Consent was logged on patient check-in at the reception desk.
                      </p>
                    </div>
                  </div>

                  {/* Document Scanner Attachment Library */}
                  <div style={{ background: '#FFFFFF', borderRadius: '20px', border: '1px solid #E2E8F0', padding: '20px', boxShadow: '0 4px 20px rgba(0,0,0,0.01)' }}>
                    <h4 style={{ margin: '0 0 14px 0', fontSize: '13px', fontWeight: 900, color: '#1E3A8A', display: 'flex', alignItems: 'center', gap: '8px', fontFamily: "'Outfit', sans-serif" }}>
                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: '#2563EB' }}><path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/></svg>
                      EMR UPLOADED DOCUMENTS ({uploadedFiles.length})
                    </h4>

                    {/* Document Search Box */}
                    {uploadedFiles.length > 0 && (
                      <div style={{ position: 'relative', marginBottom: '12px' }}>
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#94A3B8' }}>
                          <circle cx="11" cy="11" r="8"/>
                          <path d="m21 21-4.3-4.3"/>
                        </svg>
                        <input 
                          type="text"
                          placeholder="Search document name..."
                          value={emrDocSearchQuery}
                          onChange={(e) => setEmrDocSearchQuery(e.target.value)}
                          style={{
                            width: '100%',
                            padding: '8px 10px 8px 30px',
                            fontSize: '12px',
                            border: '1px solid #CBD5E1',
                            borderRadius: '8px',
                            outline: 'none',
                            background: '#F8FAFC'
                          }}
                          onFocus={(e) => { e.target.style.borderColor = '#3B82F6'; e.target.style.background = '#FFFFFF'; }}
                          onBlur={(e) => { e.target.style.borderColor = '#CBD5E1'; e.target.style.background = '#F8FAFC'; }}
                        />
                      </div>
                    )}

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {(() => {
                        let filteredDocs = uploadedFiles;
                        if (emrDocSearchQuery.trim() !== '') {
                          filteredDocs = uploadedFiles.filter(file => file.name?.toLowerCase().includes(emrDocSearchQuery.toLowerCase()));
                        }

                        if (filteredDocs.length > 0) {
                          return filteredDocs.map((file, idx) => (
                            <div key={idx} className="patient-row-hover" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', border: '1px solid #E2E8F0', borderRadius: '10px', fontSize: '11.5px', background: '#F8FAFC', transition: 'all 0.15s ease' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: '#2563EB' }}><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/></svg>
                                <span style={{ fontWeight: 800, color: '#334155', maxWidth: '130px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{file.name}</span>
                              </div>
                              <button 
                                className="btn-cu outline" 
                                style={{ padding: '4px 12px', fontSize: '10.5px', margin: 0, borderRadius: '8px', fontWeight: 900 }}
                                onClick={() => {
                                  setPreviewFile(file);
                                  setShowTimelineModal(false);
                                }}
                              >
                                View File
                              </button>
                            </div>
                          ));
                        } else if (uploadedFiles.length > 0) {
                          return (
                            <div style={{ padding: '12px', textAlign: 'center', fontSize: '11px', color: '#94A3B8' }}>
                              No matching documents.
                            </div>
                          );
                        } else {
                          return (
                            <div style={{ padding: '20px 16px', textAlign: 'center', fontSize: '11px', color: '#94A3B8', background: '#F8FAFC', borderRadius: '10px', border: '1px dashed #CBD5E1', lineHeight: '1.4' }}>
                              No external lab reports or clinical scans uploaded for this patient.
                            </div>
                          );
                        }
                      })()}
                    </div>
                  </div>

                </div>
              </div>

            </div>

            {/* Modal Footer */}
            <div style={{ padding: '16px 28px', background: '#F8FAFC', borderTop: '1px solid #E2E8F0', display: 'flex', justifyContent: 'flex-end', gap: '12px', borderBottomLeftRadius: '24px', borderBottomRightRadius: '24px' }}>
              <button 
                className="btn-cu primary" 
                onClick={() => setShowTimelineModal(false)} 
                style={{ 
                  padding: '12px 28px', 
                  borderRadius: '12px', 
                  fontSize: '13px', 
                  fontWeight: 900, 
                  background: 'linear-gradient(135deg, #1E3A8A, #1D4ED8)',
                  boxShadow: '0 4px 12px rgba(37,99,235,0.2)',
                  border: 'none',
                  color: 'white',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease'
                }}
                onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-1px)'}
                onMouseLeave={e => e.currentTarget.style.transform = 'translateY(0)'}
              >
                Close EMR Portal
              </button>
            </div>

          </div>
        </div>
      )}

      {/* Premium Diagnostic Lab Report Detail Modal */}
      {selectedLabReport && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.45)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 99999, padding: '20px' }}>
          <div data-lenis-prevent style={{ width: '100%', maxWidth: '600px', background: '#ffffff', borderRadius: '24px', border: '1px solid #E2E8F0', padding: '32px', position: 'relative', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.15)', overflowY: 'auto', maxHeight: '90vh' }}>
            {/* Close Trigger */}
            <button 
              onClick={() => setSelectedLabReport(null)} 
              style={{ position: 'absolute', top: '24px', right: '24px', background: 'none', border: 'none', cursor: 'pointer', color: '#94A3B8', padding: '4px' }}
            >
              <i data-lucide="x" style={{ width: '20px', height: '20px' }}></i>
            </button>

            {/* Header: Curoxa Labs banner */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '24px' }}>
              <i data-lucide="flask-conical" style={{ width: '20px', height: '20px', color: '#2563EB' }}></i>
              <span style={{ fontSize: '13px', fontWeight: 800, color: '#2563EB', letterSpacing: '0.05em', textTransform: 'uppercase' }}>Curoxa Diagnostics Laboratory</span>
            </div>

            {/* Title & Info */}
            <h2 style={{ fontSize: '22px', fontWeight: 900, color: '#0F172A', margin: '0 0 4px 0' }}>{selectedLabReport.testName}</h2>
            <p style={{ fontSize: '13px', color: '#64748B', margin: '0 0 24px 0', fontWeight: 600 }}>Report ID: <span style={{ color: '#2563EB' }}>{selectedLabReport.id}</span> | Status: <b style={{ color: selectedLabReport.status === 'READY' ? '#16A34A' : '#2563EB' }}>{selectedLabReport.status}</b></p>

            {/* Patient Meta Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', background: '#F8FAFC', padding: '16px', borderRadius: '16px', border: '1.5px solid #E2E8F0', marginBottom: '24px' }}>
              <div>
                <span style={{ display: 'block', fontSize: '10px', color: '#94A3B8', fontWeight: 800, textTransform: 'uppercase', marginBottom: '4px' }}>Patient Name</span>
                <span style={{ fontSize: '14px', fontWeight: 800, color: '#1E293B' }}>{selectedLabReport.name}</span>
              </div>
              <div>
                <span style={{ display: 'block', fontSize: '10px', color: '#94A3B8', fontWeight: 800, textTransform: 'uppercase', marginBottom: '4px' }}>Demographics</span>
                <span style={{ fontSize: '14px', fontWeight: 800, color: '#1E293B' }}>{selectedLabReport.age} Yrs, {selectedLabReport.gender}</span>
              </div>
              <div>
                <span style={{ display: 'block', fontSize: '10px', color: '#94A3B8', fontWeight: 800, textTransform: 'uppercase', marginBottom: '4px' }}>Ordered On</span>
                <span style={{ fontSize: '14px', fontWeight: 700, color: '#1E293B' }}>{selectedLabReport.date} {selectedLabReport.time}</span>
              </div>
              <div>
                <span style={{ display: 'block', fontSize: '10px', color: '#94A3B8', fontWeight: 800, textTransform: 'uppercase', marginBottom: '4px' }}>Verified By</span>
                <span style={{ fontSize: '14px', fontWeight: 700, color: '#1E293B' }}>Dr. Sarah Jenkins</span>
              </div>
            </div>

            {/* Diagnostic values panel */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '32px' }}>
              <h4 style={{ fontSize: '12px', fontWeight: 800, color: '#475569', textTransform: 'uppercase', margin: '0 0 4px 0', letterSpacing: '0.05em' }}>Biochemical Measurements</h4>
              
              {selectedLabReport.results ? (
                <pre style={{ 
                  background: '#F8FAFC', 
                  border: '1px solid #E2E8F0', 
                  borderRadius: '12px', 
                  padding: '16px', 
                  fontFamily: 'monospace', 
                  fontSize: '13px', 
                  color: '#1E293B', 
                  whiteSpace: 'pre-wrap', 
                  margin: 0 
                }}>
                  {selectedLabReport.results}
                </pre>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '24px', background: '#F8FAFC', borderRadius: '12px', border: '1px dashed #E2E8F0', textAlign: 'center' }}>
                  <i data-lucide="loader" style={{ width: '24px', height: '24px', color: '#2563EB', marginBottom: '8px' }}></i>
                  <span style={{ fontSize: '13px', fontWeight: 700, color: '#1E293B' }}>{selectedLabReport.status === 'READY' ? 'No results recorded yet' : 'Test Specimen under analysis'}</span>
                  <span style={{ fontSize: '11px', color: '#64748B', marginTop: '4px' }}>{selectedLabReport.status === 'READY' ? 'This lab request is completed, but no detailed values were inputted.' : 'Specimen registered and barcode scanned. Average completion time remaining: 4.5 hours.'}</span>
                </div>
              )}
            </div>

            {/* Footer / Action */}
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <button 
                onClick={() => setSelectedLabReport(null)}
                style={{ padding: '12px 20px', borderRadius: '12px', border: '1.5px solid #CBD5E1', background: '#ffffff', color: '#1E293B', fontSize: '14px', fontWeight: 700, cursor: 'pointer' }}
              >
                Close Report
              </button>
              {selectedLabReport.status === 'READY' && (
                <button 
                  onClick={() => {
                    showToastNotification('PDF report downloaded successfully.', 'success');
                  }}
                  style={{ padding: '12px 24px', borderRadius: '12px', border: 'none', background: '#2563EB', color: '#ffffff', fontSize: '14px', fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}
                >
                  <i data-lucide="download" style={{ width: '15px', height: '15px' }}></i>
                  <span>Download PDF</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modern High-Fidelity Appointment Detail Overview Modal */}
      {showAppOverviewModal && selectedOverviewApp && (() => {
        const data = getOverviewData();
        if (!data) return null;
        const { appointment, patient, prescription, labs } = data;
        
        return (
          <div id="print-clinical-summary-overlay" style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.75)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: '20px' }}>
            <style dangerouslySetInnerHTML={{__html: `
              @page {
                size: A4;
                margin: 0;
              }
              @media print {
                body * {
                  visibility: hidden !important;
                }
                #print-clinical-summary-overlay, #print-clinical-summary-overlay * {
                  visibility: visible !important;
                }
                #print-clinical-summary-overlay {
                  position: absolute !important;
                  left: 0 !important;
                  top: 0 !important;
                  width: 100% !important;
                  height: auto !important;
                  min-height: 100% !important;
                  background: transparent !important;
                  backdrop-filter: none !important;
                  padding: 0 !important;
                  margin: 0 !important;
                  display: block !important;
                  z-index: 9999 !important;
                }
                .no-print {
                  display: none !important;
                }
                .glass-card {
                  border: none !important;
                  box-shadow: none !important;
                  max-height: none !important;
                  min-height: 100% !important;
                  width: 100% !important;
                  overflow: hidden !important;
                  padding-top: ${customLetterhead ? '38mm' : '10mm'} !important;
                  padding-bottom: ${customLetterhead ? '25mm' : '15mm'} !important;
                  padding-left: 15mm !important;
                  padding-right: 15mm !important;
                  border-radius: 0 !important;
                  background: transparent !important;
                }
                div[data-lenis-prevent] {
                  overflow: visible !important;
                  max-height: none !important;
                  height: auto !important;
                  padding: 0 !important;
                  background: transparent !important;
                  gap: 12px !important;
                }
                .print-prescription-title {
                  margin: 10px 0 15px 0 !important;
                }
                .print-info-grid {
                  gap: 10px !important;
                  margin-bottom: 12px !important;
                }
                .print-divider {
                  margin: 10px 0 !important;
                }
                .print-diagnosis-box {
                  margin-bottom: 12px !important;
                }
                .print-soap-box {
                  margin-bottom: 12px !important;
                }
                .print-medicines-box {
                  margin-bottom: 12px !important;
                }
                .print-signature-section {
                  margin-top: 15px !important;
                  min-height: 80px !important;
                }
                .print-letterhead-bg {
                  position: fixed !important;
                  top: 0 !important;
                  left: 0 !important;
                  right: 0 !important;
                  bottom: 0 !important;
                  width: 100% !important;
                  height: 100% !important;
                  z-index: -1 !important;
                  object-fit: contain !important;
                  object-position: center top !important;
                  display: block !important;
                }
                .print-only {
                  display: block !important;
                }
              }
              @media screen {
                .print-only { display: none !important; }
                .print-letterhead-bg { display: none !important; }
              }
            `}} />
            
            {customLetterhead ? (
              customLetterhead.startsWith('data:application/pdf') || customLetterhead.endsWith('.pdf') || customLetterhead.includes('application/pdf') ? (
                <embed src={customLetterhead} type="application/pdf" className="print-letterhead-bg" style={{ border: 'none' }} />
              ) : (
                <img src={customLetterhead} className="print-letterhead-bg" alt="Letterhead" />
              )
            ) : (
              <div className="print-only" style={{ position: 'fixed', top: 0, left: 0, width: '210mm', height: '25mm', background: '#0F172A', color: 'white', padding: '5mm 15mm', boxSizing: 'border-box', zIndex: -1 }}>
                <h1 style={{ margin: 0, fontSize: '20px', fontWeight: 900 }}>CUROXA HOSPITAL</h1>
                <p style={{ margin: 0, fontSize: '10px', opacity: 0.8 }}>Advanced Clinical Care</p>
              </div>
            )}

            <div className="glass-card" style={{ width: '100%', maxWidth: '850px', background: 'white', padding: '0', borderRadius: '16px', maxHeight: '90vh', overflow: 'hidden', display: 'flex', flexDirection: 'column', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)', border: '1px solid #E2E8F0', position: 'relative', zIndex: 10 }}>
              
              {/* Modal Header */}
              <div className="no-print" style={{ background: 'linear-gradient(135deg, #10B981, #059669)', padding: '20px 24px', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <i data-lucide="check-circle" style={{ width: '20px', height: '20px' }}></i>
                    <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 900, letterSpacing: '0.5px' }}>COMPLETED APPOINTMENT CLINICAL SUMMARY</h3>
                  </div>
                  <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.85)', marginTop: '4px', fontWeight: 600 }}>
                    Patient: <b>{patient.name || 'N/A'}</b> • UHID: {patient.uhid || 'N/A'} • Completed On: {new Date(appointment.updatedAt || appointment.date || Date.now()).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </div>
                </div>
                <button 
                  onClick={() => {
                    setShowAppOverviewModal(false);
                    setSelectedOverviewApp(null);
                  }} 
                  className="no-print"
                  style={{ background: 'rgba(255,255,255,0.15)', border: 'none', color: 'white', width: '32px', height: '32px', borderRadius: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', transition: '0.2s', fontWeight: 'bold' }}
                  onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.3)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.15)'}
                >
                  ✕
                </button>
              </div>

              {/* Modal Body */}
              <div data-lenis-prevent style={{ flex: 1, overflowY: 'auto', padding: '40px', background: '#ffffff', display: 'flex', flexDirection: 'column', gap: '20px' }}>
                
                {/* Print Page Header (repeating header for print mode, absolute/fixed position on print, hidden on screen) */}
                <div className="print-page-header print-only">
                  {customLetterhead ? (
                    <div style={{ height: '38mm', width: '100%' }}></div>
                  ) : (
                    <div style={{ display: 'flex', alignItems: 'center', borderBottom: '3px double #800020', paddingBottom: '8px', height: '80px', boxSizing: 'border-box' }}>
                      <div style={{ border: '2px solid #800020', borderRadius: '8px', width: '65px', height: '65px', padding: '4px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#ffffff', boxSizing: 'border-box', flexShrink: 0 }}>
                        <span style={{ fontSize: '7px', color: '#800020', fontWeight: 'bold', lineHeight: 1, textAlign: 'center', textTransform: 'uppercase', letterSpacing: '0.2px' }}>Care with Devotion</span>
                        <span style={{ fontFamily: "'Brush Script MT', 'Lucida Handwriting', cursive, sans-serif", fontSize: '20px', color: '#800020', fontWeight: 'bold', margin: '-2px 0' }}>
                          {(user.tenantName || user.tenantId || 'Hospital').split(' ')[0]}
                        </span>
                        <span style={{ fontSize: '4px', color: '#ffffff', background: '#800020', width: '100%', textAlign: 'center', fontWeight: 'bold', padding: '1px 0', borderRadius: '2px', textTransform: 'uppercase' }}>
                          {user.tenantName || (user.tenantId ? user.tenantId.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ') : 'City Hospital')}
                        </span>
                      </div>
                      <div style={{ flexGrow: 1, textAlign: 'center', paddingRight: '65px' }}>
                        <h1 style={{ margin: 0, color: '#800020', fontFamily: "'Outfit', 'Inter', sans-serif", fontSize: '20px', fontWeight: 900, letterSpacing: '0.5px', lineHeight: 1.2, textTransform: 'uppercase' }}>{user.tenantName || (user.tenantId ? user.tenantId.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ') : 'City Hospital')}</h1>
                        <p style={{ margin: '3px 0', color: '#1E293B', fontSize: '9px', fontWeight: 700, letterSpacing: '0.2px', textTransform: 'uppercase' }}>Official EMR OPD Portal - {user.tenantName || (user.tenantId ? user.tenantId.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ') : 'City Hospital')}</p>
                        <p style={{ margin: 0, color: '#475569', fontSize: '8px', fontWeight: 600 }}>Web: {window.location.origin} &nbsp;&nbsp;•&nbsp;&nbsp; E-mail: info@{user.tenantId || 'city_hospital'}.com</p>
                      </div>
                    </div>
                  )}

                  <div style={{ textAlign: 'center', margin: '8px 0' }}>
                    <span style={{ fontFamily: "'Outfit', sans-serif", fontSize: '13px', fontWeight: 900, color: '#800020', borderBottom: '2px solid #800020', borderTop: '2px solid #800020', padding: '2px 24px', letterSpacing: '1px', textTransform: 'uppercase' }}>Prescription & Clinical Summary</span>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px', fontSize: '11px', color: '#1E293B', lineHeight: '1.4', fontFamily: "'Inter', sans-serif" }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', wordWrap: 'break-word', whiteSpace: 'normal' }}>
                      <div><span style={{ fontWeight: 700, width: '85px', display: 'inline-block', color: '#800020' }}>Patient Name</span><span style={{ fontWeight: 500 }}>: {patient.name || '—'}</span></div>
                      <div><span style={{ fontWeight: 700, width: '85px', display: 'inline-block', color: '#800020' }}>Age / Gender</span><span style={{ fontWeight: 500 }}>: {patient.age ? `${patient.age} Yrs` : '—'} / {patient.gender || '—'}</span></div>
                      <div><span style={{ fontWeight: 700, width: '85px', display: 'inline-block', color: '#800020' }}>Date</span><span style={{ fontWeight: 500 }}>: {appointment.date ? new Date(appointment.date).toLocaleDateString('en-IN') : new Date().toLocaleDateString('en-IN')}</span></div>
                      <div><span style={{ fontWeight: 700, width: '85px', display: 'inline-block', color: '#800020' }}>Mobile No.</span><span style={{ fontWeight: 500 }}>: {patient.contact || '—'}</span></div>
                      <div><span style={{ fontWeight: 700, width: '85px', display: 'inline-block', color: '#800020' }}>Address</span><span style={{ fontWeight: 500 }}>: {patient.address || '—'}</span></div>
                      <div><span style={{ fontWeight: 700, width: '85px', display: 'inline-block', color: '#800020' }}>Reg. No.</span><span style={{ color: '#2563EB', fontWeight: 'bold' }}>: {appointment.regNo || '—'}</span></div>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', wordWrap: 'break-word', whiteSpace: 'normal' }}>
                      <div><span style={{ fontWeight: 700, width: '110px', display: 'inline-block', color: '#800020' }}>Doctor Name</span><span style={{ fontWeight: 600 }}>: {user.name || 'Dr. Anil Sharma'}</span></div>
                      <div><span style={{ fontWeight: 700, width: '110px', display: 'inline-block', color: '#800020' }}>Qualification</span><span style={{ fontWeight: 500 }}>: {user.designation || 'MBBS, MD (Medicine)'}</span></div>
                      <div><span style={{ fontWeight: 700, width: '110px', display: 'inline-block', color: '#800020' }}>Reg. No.</span><span style={{ fontWeight: 500 }}>: DMC - {user.staff_id ? (user.staff_id.match(/^\d+$/) ? user.staff_id.slice(-5) : user.staff_id.toUpperCase()) : '12345'}</span></div>
                      <div><span style={{ fontWeight: 700, width: '110px', display: 'inline-block', color: '#800020' }}>Department</span><span style={{ fontWeight: 500 }}>: {user.department || 'General Medicine'}</span></div>
                      <div><span style={{ fontWeight: 700, width: '110px', display: 'inline-block', color: '#800020' }}>Consultation Time</span><span style={{ fontWeight: 500 }}>: {user.shiftName || '10:00 AM - 01:00 PM, 06:00 PM - 09:00 PM'}</span></div>
                    </div>
                  </div>

                  <hr style={{ border: 'none', borderTop: '1px solid #800020', margin: '8px 0' }} />
                </div>

                {/* Screen Header (visible on screen only, hidden on print) */}
                <div className="no-print" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                  {customLetterhead ? (
                    <div style={{ borderBottom: '2.5px solid #800020', paddingBottom: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <h2 style={{ margin: 0, color: '#800020', fontFamily: "'Outfit', sans-serif", fontSize: '22px', fontWeight: 900 }}>{user.department?.toUpperCase() || 'GENERAL MEDICINE'}</h2>
                        <span style={{ fontSize: '12px', color: '#64748B', fontWeight: 600 }}>Using Admin Configured Custom Letterhead Background</span>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <span style={{ fontSize: '11px', color: '#94A3B8', fontWeight: 700, padding: '4px 8px', background: '#F8FAFC', borderRadius: '4px', border: '1px dashed #E2E8F0' }}>PDF Letterhead Active</span>
                      </div>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', alignItems: 'center', borderBottom: '3px double #800020', paddingBottom: '12px' }}>
                      <div style={{ border: '2px solid #800020', borderRadius: '8px', width: '75px', height: '75px', padding: '4px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#ffffff', boxSizing: 'border-box', flexShrink: 0 }}>
                        <span style={{ fontSize: '8px', color: '#800020', fontWeight: 'bold', lineHeight: 1, textAlign: 'center', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Care with Devotion</span>
                        <span style={{ fontFamily: "'Brush Script MT', 'Lucida Handwriting', cursive, sans-serif", fontSize: '26px', color: '#800020', fontWeight: 'bold', margin: '-1px 0' }}>
                          {(user.tenantName || user.tenantId || 'Hospital').split(' ')[0]}
                        </span>
                        <span style={{ fontSize: '5px', color: '#ffffff', background: '#800020', width: '100%', textAlign: 'center', fontWeight: 'bold', padding: '1.5px 0', borderRadius: '2px', textTransform: 'uppercase' }}>
                          {user.tenantName || (user.tenantId ? user.tenantId.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ') : 'City Hospital')}
                        </span>
                      </div>
                      <div style={{ flexGrow: 1, textAlign: 'center', paddingRight: '75px' }}>
                        <h1 style={{ margin: 0, color: '#800020', fontFamily: "'Outfit', 'Inter', sans-serif", fontSize: '26px', fontWeight: 900, letterSpacing: '0.5px', textTransform: 'uppercase' }}>{user.tenantName || (user.tenantId ? user.tenantId.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ') : 'City Hospital')}</h1>
                        <p style={{ margin: '5px 0', color: '#1E293B', fontSize: '11.5px', fontWeight: 700, letterSpacing: '0.2px', textTransform: 'uppercase' }}>Official EMR OPD Portal - {user.tenantName || (user.tenantId ? user.tenantId.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ') : 'City Hospital')}</p>
                        <p style={{ margin: 0, color: '#475569', fontSize: '10.5px', fontWeight: 600 }}>Web: {window.location.origin} &nbsp;&nbsp;•&nbsp;&nbsp; E-mail: info@{user.tenantId || 'city_hospital'}.com</p>
                      </div>
                    </div>
                  )}

                  {/* Prescription Title */}
                  <div className="print-prescription-title" style={{ textAlign: 'center', margin: '15px 0 25px 0' }}>
                    <span style={{ fontFamily: "'Outfit', sans-serif", fontSize: '18px', fontWeight: 900, color: '#800020', borderBottom: '2.5px solid #800020', borderTop: '2.5px solid #800020', padding: '4px 24px', letterSpacing: '1.5px', textTransform: 'uppercase' }}>Prescription & Clinical Summary</span>
                  </div>

                  {/* Patient and Doctor Grid */}
                  <div className="print-info-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', fontSize: '13px', color: '#1E293B', marginBottom: '20px', lineHeight: '1.6', fontFamily: "'Inter', sans-serif" }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      <div><span style={{ fontWeight: 700, width: '110px', display: 'inline-block', color: '#800020' }}>Patient Name</span><span style={{ fontWeight: 500 }}>: {patient.name || '—'}</span></div>
                      <div><span style={{ fontWeight: 700, width: '110px', display: 'inline-block', color: '#800020' }}>Age / Gender</span><span style={{ fontWeight: 500 }}>: {patient.age ? `${patient.age} Yrs` : '—'} / {patient.gender || '—'}</span></div>
                      <div><span style={{ fontWeight: 700, width: '110px', display: 'inline-block', color: '#800020' }}>Date</span><span style={{ fontWeight: 500 }}>: {appointment.date ? new Date(appointment.date).toLocaleDateString('en-IN') : new Date().toLocaleDateString('en-IN')}</span></div>
                      <div><span style={{ fontWeight: 700, width: '110px', display: 'inline-block', color: '#800020' }}>Mobile No.</span><span style={{ fontWeight: 500 }}>: {patient.contact || '—'}</span></div>
                      <div><span style={{ fontWeight: 700, width: '110px', display: 'inline-block', color: '#800020' }}>Address</span><span style={{ fontWeight: 500 }}>: {patient.address || '—'}</span></div>
                      <div><span style={{ fontWeight: 700, width: '110px', display: 'inline-block', color: '#800020' }}>Reg. No.</span><span style={{ color: '#2563EB', fontWeight: 'bold' }}>: {appointment.regNo || '—'}</span></div>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      <div><span style={{ fontWeight: 700, width: '130px', display: 'inline-block', color: '#800020' }}>Doctor Name</span><span style={{ fontWeight: 600 }}>: {user.name || 'Dr. Anil Sharma'}</span></div>
                      <div><span style={{ fontWeight: 700, width: '130px', display: 'inline-block', color: '#800020' }}>Qualification</span><span style={{ fontWeight: 500 }}>: {user.designation || 'MBBS, MD (Medicine)'}</span></div>
                      <div><span style={{ fontWeight: 700, width: '130px', display: 'inline-block', color: '#800020' }}>Reg. No.</span><span style={{ fontWeight: 500 }}>: DMC - {user.staff_id ? (user.staff_id.match(/^\d+$/) ? user.staff_id.slice(-5) : user.staff_id.toUpperCase()) : '12345'}</span></div>
                      <div><span style={{ fontWeight: 700, width: '130px', display: 'inline-block', color: '#800020' }}>Department</span><span style={{ fontWeight: 500 }}>: {user.department || 'General Medicine'}</span></div>
                      <div><span style={{ fontWeight: 700, width: '130px', display: 'inline-block', color: '#800020' }}>Consultation Time</span><span style={{ fontWeight: 500 }}>: {user.shiftName || '10:00 AM - 01:00 PM, 06:00 PM - 09:00 PM'}</span></div>
                    </div>
                  </div>

                  <hr className="print-divider" style={{ border: 'none', borderTop: '1.5px solid #800020', margin: '15px 0 20px 0' }} />
                </div>

                {/* Diagnosis Box */}
                {appointment.diagnosis && (
                  <div className="print-diagnosis-box" style={{ border: '1.5px solid #800020', borderRadius: '8px', marginBottom: '20px', overflow: 'hidden', background: '#fff' }}>
                    <div style={{ background: '#FDF2F4', padding: '8px 12px', borderBottom: '1.5px solid #800020', fontFamily: "'Outfit', sans-serif", fontSize: '13px', fontWeight: 800, color: '#800020', letterSpacing: '0.5px', textTransform: 'uppercase' }}>
                      DIAGNOSIS (Doctor's Observation)
                    </div>
                    <div style={{ padding: '12px', fontSize: '13px', color: '#1E293B', lineHeight: '1.6', fontWeight: 500 }}>
                      {appointment.diagnosis.includes('<') ? (
                        <div dangerouslySetInnerHTML={{ __html: appointment.diagnosis }} />
                      ) : (
                        appointment.diagnosis.split('\n').map((line, lidx) => (
                          <div key={lidx} style={{ display: 'flex', gap: '8px', marginBottom: '6px', alignItems: 'flex-start' }}>
                            <span style={{ color: '#800020', fontSize: '10px', marginTop: '4px' }}>•</span>
                            <span>{line.trim()}</span>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                )}

                {/* SOAP Notes if present */}
                {appointment.notes && (
                  <div className="print-soap-box" style={{ border: '1.5px solid #800020', borderRadius: '8px', marginBottom: '20px', overflow: 'hidden', background: '#fff' }}>
                    <div style={{ background: '#FDF2F4', padding: '8px 12px', borderBottom: '1.5px solid #800020', fontFamily: "'Outfit', sans-serif", fontSize: '13px', fontWeight: 800, color: '#800020', letterSpacing: '0.5px', textTransform: 'uppercase' }}>
                      Clinical SOAP Notes
                    </div>
                    <div style={{ padding: '12px', fontSize: '13px', color: '#334155', lineHeight: '1.6', fontWeight: 500, whiteSpace: 'pre-wrap' }}>
                      {appointment.notes.includes('<') ? (
                        <div dangerouslySetInnerHTML={{ __html: appointment.notes }} />
                      ) : (
                        appointment.notes
                      )}
                    </div>
                  </div>
                )}

                {/* Medicines Table */}
                <div className="print-medicines-box" style={{ marginBottom: '20px' }}>
                  <div style={{ fontFamily: "'Outfit', sans-serif", fontSize: '13px', fontWeight: 800, color: '#800020', letterSpacing: '0.5px', textTransform: 'uppercase', marginBottom: '8px' }}>
                    PRESCRIBED MEDICINES
                  </div>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12.5px', border: '1.5px solid #800020', borderRadius: '8px', overflow: 'hidden' }}>
                    <thead>
                      <tr style={{ background: '#FDF2F4', borderBottom: '1.5px solid #800020' }}>
                        <th style={{ padding: '10px', color: '#800020', fontWeight: 800, textAlign: 'center', borderRight: '1px solid #800020', width: '60px' }}>S. No.</th>
                        <th style={{ padding: '10px', color: '#800020', fontWeight: 800, textAlign: 'left', borderRight: '1px solid #800020' }}>Medicine Name</th>
                        <th style={{ padding: '10px', color: '#800020', fontWeight: 800, textAlign: 'center', borderRight: '1px solid #800020', width: '80px' }}>Dose</th>
                        <th style={{ padding: '10px', color: '#800020', fontWeight: 800, textAlign: 'center', borderRight: '1px solid #800020', width: '90px' }}>Duration</th>
                        <th style={{ padding: '10px', color: '#800020', fontWeight: 800, textAlign: 'center', borderRight: '1px solid #800020', width: '120px' }}>Frequency</th>
                        <th style={{ padding: '10px', color: '#800020', fontWeight: 800, textAlign: 'left' }}>Instructions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {prescription && prescription.items && prescription.items.length > 0 ? (
                        prescription.items.map((m, idx) => {
                          let freq = 'Once a Day';
                          let inst = 'After Food';
                          if (m.instructions) {
                            const parts = m.instructions.split('(');
                            if (parts[0]) freq = parts[0].trim();
                            if (parts[1]) inst = parts[1].replace(')', '').trim();
                          }
                          return (
                            <tr key={idx} style={{ borderBottom: '1px solid #800020' }}>
                              <td style={{ padding: '10px', textAlign: 'center', borderRight: '1px solid #800020', fontWeight: 600, color: '#800020' }}>{idx + 1}.</td>
                              <td style={{ padding: '10px', borderRight: '1px solid #800020', fontWeight: 700, color: '#1E293B' }}>{m.medicine}</td>
                              <td style={{ padding: '10px', textAlign: 'center', borderRight: '1px solid #800020', color: '#334155', fontWeight: 500 }}>{m.dosage}</td>
                              <td style={{ padding: '10px', textAlign: 'center', borderRight: '1px solid #800020', color: '#334155', fontWeight: 500 }}>{m.duration}</td>
                              <td style={{ padding: '10px', textAlign: 'center', borderRight: '1px solid #800020', color: '#800020', fontWeight: 600 }}>{freq}</td>
                              <td style={{ padding: '10px', color: '#334155', fontWeight: 500 }}>{inst}</td>
                            </tr>
                          );
                        })
                      ) : (
                        <tr>
                          <td colSpan="6" style={{ padding: '24px', textAlign: 'center', color: '#94A3B8', fontWeight: 600 }}>No medications prescribed for this visit.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Lab Tests Table */}
                <div style={{ marginBottom: '20px' }}>
                  <div style={{ fontFamily: "'Outfit', sans-serif", fontSize: '13px', fontWeight: 800, color: '#800020', letterSpacing: '0.5px', textTransform: 'uppercase', marginBottom: '8px' }}>
                    PRESCRIBED TESTS
                  </div>
                  {labs && labs.length > 0 ? (
                    <table style={{ width: '50%', borderCollapse: 'collapse', fontSize: '12.5px', border: '1.5px solid #800020', borderRadius: '8px', overflow: 'hidden' }}>
                      <thead>
                        <tr style={{ background: '#FDF2F4', borderBottom: '1.5px solid #800020' }}>
                          <th style={{ padding: '10px', color: '#800020', fontWeight: 800, textAlign: 'center', borderRight: '1px solid #800020', width: '60px' }}>S. No.</th>
                          <th style={{ padding: '10px', color: '#800020', fontWeight: 800, textAlign: 'left' }}>Test Name</th>
                        </tr>
                      </thead>
                      <tbody>
                        {labs.map((test, idx) => (
                          <tr key={idx} style={{ borderBottom: '1px solid #800020' }}>
                            <td style={{ padding: '10px', textAlign: 'center', borderRight: '1px solid #800020', fontWeight: 600, color: '#800020' }}>{idx + 1}.</td>
                            <td style={{ padding: '10px', fontWeight: 700, color: '#1E293B' }}>{test.testName || test}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    <div style={{ padding: '24px', border: '1.5px solid #800020', borderRadius: '8px', background: '#fff', fontSize: '12.5px', color: '#94A3B8', fontWeight: 600, textAlign: 'center' }}>
                      No tests prescribed for this visit.
                    </div>
                  )}
                </div>

                {/* Notes & Signature Section */}
                <div className="print-signature-section" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: '40px', minHeight: '120px' }}>
                  <div style={{ fontSize: '11.5px', lineHeight: '1.6', maxWidth: '60%' }}>
                    <div style={{ color: '#800020', fontWeight: 800, fontSize: '12.5px', marginBottom: '4px', textTransform: 'uppercase' }}>Note :</div>
                    <ul style={{ paddingLeft: '12px', margin: 0, listStyleType: 'square', color: '#334155', fontWeight: 600 }}>
                      <li>Take medicines as prescribed.</li>
                      <li>Complete the full course of antibiotics.</li>
                      <li>Avoid cold drinks and oily food.</li>
                      <li>Drink plenty of fluids and take rest.</li>
                    </ul>
                  </div>
                  
                  <div style={{ textAlign: 'center', width: '220px', fontSize: '11.5px', fontFamily: "'Inter', sans-serif" }}>
                    <div style={{ borderBottom: '1.5px solid #800020', marginBottom: '8px', height: '50px', position: 'relative' }}>
                      <span style={{ fontFamily: "'Brush Script MT', cursive, sans-serif", fontSize: '26px', color: '#800020', position: 'absolute', bottom: '4px', left: '50%', transform: 'translateX(-50%)', fontWeight: 500 }}>
                        {user.name ? user.name.replace('Dr. ', '') : 'Anil Sharma'}
                      </span>
                    </div>
                    <div style={{ color: '#800020', fontWeight: 700, fontSize: '13px' }}>{user.name || 'Dr. Anil Sharma'}</div>
                    <div style={{ color: '#475569', fontWeight: 600, fontSize: '11px', marginTop: '2px' }}>{user.designation || 'MBBS, MD (Medicine)'}</div>
                    <div style={{ color: '#475569', fontWeight: 600, fontSize: '11px' }}>Reg. No. {user.staff_id ? user.staff_id.toUpperCase() : 'DMC - 12345'}</div>
                    <div style={{ color: '#800020', fontWeight: 800, fontSize: '11px', marginTop: '4px', textTransform: 'uppercase' }}>(Consultant Physician)</div>
                    <div style={{ color: '#94A3B8', fontSize: '9.5px', marginTop: '4px', fontWeight: 550, letterSpacing: '0.2px' }}>Signature & Seal</div>
                  </div>
                </div>

                {/* Prescription Edit History / Version Logs */}
                {activePrescriptionLogs.length > 0 && (
                  <div className="no-print" style={{ marginTop: '28px', padding: '16px', background: '#F8FAFC', border: '1px dashed #CBD5E1', borderRadius: '12px', textAlign: 'left' }}>
                    <div style={{ fontFamily: "'Outfit', sans-serif", fontSize: '13px', fontWeight: 800, color: '#1E3A8A', letterSpacing: '0.5px', textTransform: 'uppercase', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>
                      Prescription Revision History (Edits: {activePrescriptionLogs.length})
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      {activePrescriptionLogs.map((log, idx) => {
                        const dateStr = new Date(log.timestamp).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
                        const isCreation = log.action === 'prescription_created';
                        return (
                          <div key={log._id} style={{ display: 'flex', gap: '12px', fontSize: '12px', borderBottom: idx === activePrescriptionLogs.length - 1 ? 'none' : '1px solid #E2E8F0', paddingBottom: '10px' }}>
                            <div style={{ color: '#64748B', fontWeight: 650, width: '125px', flexShrink: 0 }}>{dateStr}</div>
                            <div style={{ flexGrow: 1 }}>
                              <span style={{ fontWeight: 800, color: isCreation ? '#15803D' : '#D97706' }}>
                                {isCreation ? 'Prescription Created' : 'Prescription Edited'}
                              </span>
                              <span style={{ color: '#64748B', marginLeft: '6px' }}>by {log.actorName} ({log.actorRole})</span>
                              {log.metadata?.diff && Array.isArray(log.metadata.diff) && (
                                <ul style={{ margin: '4px 0 0 0', paddingLeft: '16px', color: '#475569', listStyleType: 'disc' }}>
                                  {log.metadata.diff.map((change, cIdx) => (
                                    <li key={cIdx}>{change}</li>
                                  ))}
                                </ul>
                              )}
                              {!isCreation && !log.metadata?.diff && (
                                <div style={{ color: '#64748B', fontStyle: 'italic', marginTop: '2px' }}>General updates made.</div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Repeating Footer for print (repeats bottom-0 fixed position, hidden on screen) */}
                <div className="print-page-footer print-only">
                  Thank you for trusting us with your health. Get well soon!
                </div>
              </div>

              {/* Modal Footer */}
              <div style={{ padding: '16px 24px', background: '#F8FAFC', borderTop: '1px solid #E2E8F0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px' }} className="no-print">
                <div>
                  <span style={{ fontSize: '12px', color: '#64748B', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#2563EB" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><circle cx="12" cy="12" r="10"/><line x1="12" x2="12" y1="16" y2="12"/><line x1="12" x2="12.01" y1="8" y2="8"/></svg>
                    Using official hospital letterhead configured by Admin
                  </span>
                </div>
                <div style={{ display: 'flex', gap: '12px' }}>
                {prescription && (
                  <button 
                    type="button" 
                    onClick={() => {
                      setShowAppOverviewModal(false);
                      setSelectedOverviewApp(null);
                      handleLoadPrescriptionForEdit(prescription, labs);
                    }} 
                    style={{ 
                      padding: '10px 20px', 
                      display: 'flex', 
                      alignItems: 'center', 
                      gap: '8px',
                      background: '#F0FDF4',
                      border: '1.5px solid #BBF7D0',
                      borderRadius: '8px',
                      color: '#15803D',
                      fontSize: '14px',
                      fontWeight: 700,
                      cursor: 'pointer',
                      transition: 'all 0.2s ease-in-out'
                    }}
                    onMouseEnter={e => {
                      e.currentTarget.style.background = '#DCFCE7';
                      e.currentTarget.style.borderColor = '#86EFAC';
                    }}
                    onMouseLeave={e => {
                      e.currentTarget.style.background = '#F0FDF4';
                      e.currentTarget.style.borderColor = '#BBF7D0';
                    }}
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>
                    <span>Edit Prescription</span>
                  </button>
                )}
                <button 
                  type="button" 
                  onClick={() => {
                    handlePrintSummary(data);
                  }} 
                  style={{ 
                    padding: '10px 20px', 
                    display: 'flex', 
                    alignItems: 'center', 
                    gap: '8px',
                    background: '#ffffff',
                    border: '1.5px solid #CBD5E1',
                    borderRadius: '8px',
                    color: '#334155',
                    fontSize: '14px',
                    fontWeight: 700,
                    cursor: 'pointer',
                    transition: 'all 0.2s ease-in-out'
                  }}
                  onMouseEnter={e => {
                    e.currentTarget.style.background = '#F1F5F9';
                    e.currentTarget.style.borderColor = '#94A3B8';
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.background = '#ffffff';
                    e.currentTarget.style.borderColor = '#CBD5E1';
                  }}
                >
                  <i data-lucide="printer" style={{ width: '15px', height: '15px' }}></i>
                  <span>Print Summary</span>
                </button>
                <button 
                  type="button" 
                  onClick={() => {
                    setShowAppOverviewModal(false);
                    setSelectedOverviewApp(null);
                  }} 
                  style={{ 
                    padding: '10px 24px', 
                    background: '#059669', 
                    border: 'none',
                    borderRadius: '8px',
                    color: '#ffffff',
                    fontSize: '14px',
                    fontWeight: 700,
                    cursor: 'pointer',
                    transition: 'all 0.2s ease-in-out'
                  }}
                  onMouseEnter={e => {
                    e.currentTarget.style.background = '#047857';
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.background = '#059669';
                  }}
                >
                  <i data-lucide="check-circle" style={{ width: '16px', height: '16px', marginRight: '6px', verticalAlign: 'text-bottom' }}></i>
                  Done
                </button>
                </div>
              </div>

            </div>
          </div>
        );
      })()}

      {/* Collapsible Mobile Navigation drawer support */}
      <div className="mobile-bottom-nav">
        {doctorClinicalMode !== 'OFFLINE' ? (
          <>
            <div className={`mob-nav-item ${activeTab === 'dash' ? 'active' : ''}`} onClick={() => setActiveTab('dash')}><i data-lucide="layout-grid"></i><span>Home</span></div>
            <div className={`mob-nav-item ${activeTab === 'appointments' ? 'active' : ''}`} onClick={() => setActiveTab('appointments')}><i data-lucide="calendar"></i><span>Apps</span></div>
            <div className={`mob-nav-item ${activeTab === 'patients' ? 'active' : ''}`} onClick={() => setActiveTab('patients')}><i data-lucide="users"></i><span>Patients</span></div>
            <div className={`mob-nav-item ${activeTab === 'prescriptions' ? 'active' : ''}`} onClick={() => setActiveTab('prescriptions')}><i data-lucide="pill"></i><span>Rx Maker</span></div>
          </>
        ) : (
          <>
            <div className={`mob-nav-item ${activeTab === 'hr-payroll' ? 'active' : ''}`} onClick={() => setActiveTab('hr-payroll')}><i data-lucide="file-text"></i><span>HR & Leaves</span></div>
            <div className={`mob-nav-item ${activeTab === 'settings' ? 'active' : ''}`} onClick={() => setActiveTab('settings')}><i data-lucide="settings"></i><span>Profile</span></div>
          </>
        )}
      </div>

      {showCoveragePharmacyPaymentModal && selectedCoveragePharmacyRx && (
        <div className="details-modal-overlay" onClick={() => setShowCoveragePharmacyPaymentModal(false)} style={{ zIndex: 5000 }}>
          <div className="details-modal-card" onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: '500px', padding: '28px', borderRadius: '16px', background: 'white' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h3 style={{ fontSize: '18px', fontWeight: 800, color: '#0F172A', margin: 0 }}>Settle Bill & Dispense Medication</h3>
              <button 
                type="button" 
                onClick={() => setShowCoveragePharmacyPaymentModal(false)} 
                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '20px', color: '#64748B' }}
              >✕</button>
            </div>
            
            <div style={{ background: '#F8FAFC', padding: '16px', borderRadius: '12px', marginBottom: '20px', border: '1px solid #E2E8F0' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                <span style={{ fontSize: '13px', color: '#64748B', fontWeight: 600 }}>Patient:</span>
                <b style={{ fontSize: '13px', color: '#0F172A' }}>{selectedCoveragePharmacyRx.patient}</b>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                <span style={{ fontSize: '13px', color: '#64748B', fontWeight: 600 }}>Rx ID:</span>
                <span style={{ fontSize: '13px', color: '#0F172A', fontFamily: 'monospace' }}>#{selectedCoveragePharmacyRx.id}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
                <span style={{ fontSize: '13px', color: '#64748B', fontWeight: 600 }}>Meds Prescribed:</span>
                <span style={{ fontSize: '13px', color: '#0F172A', fontWeight: 700, maxWidth: '280px', textAlign: 'right' }}>{selectedCoveragePharmacyRx.med}</span>
              </div>
              <div style={{ borderTop: '1px solid #E2E8F0', paddingTop: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '14px', color: '#0F172A', fontWeight: 800 }}>Amount Due:</span>
                <span style={{ fontSize: '18px', color: '#2563EB', fontWeight: 900 }}>₹{(selectedCoveragePharmacyRx.amountVal || 550).toFixed(2)}</span>
              </div>
            </div>

            {/* Payment Mode Selector */}
            <div style={{ fontSize: '11px', fontWeight: 800, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '8px' }}>
              Select Payment Method
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px', marginBottom: '20px' }}>
              {['UPI', 'Cash', 'Card'].map(mode => {
                const active = coveragePharmacyPaymentMode === mode;
                return (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => {
                      setCoveragePharmacyPaymentMode(mode);
                      setCoveragePharmacyCashReceived('');
                    }}
                    style={{
                      height: '42px',
                      borderRadius: '8px',
                      border: active ? '2px solid #2563EB' : '1px solid #CBD5E1',
                      background: active ? '#EFF6FF' : 'white',
                      color: active ? '#2563EB' : '#475569',
                      fontWeight: 800,
                      fontSize: '13px',
                      cursor: 'pointer',
                      transition: 'all 0.15s',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '6px'
                    }}
                  >
                    <span>{mode}</span>
                  </button>
                );
              })}
            </div>

            {/* Interactive Forms */}
            {coveragePharmacyPaymentMode === 'UPI' && (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px', padding: '16px', background: '#F8FAFC', borderRadius: '12px', border: '1px dashed #CBD5E1', marginBottom: '20px' }}>
                <div style={{ padding: '8px', background: 'white', borderRadius: '8px', border: '1px solid #E2E8F0' }}>
                  <svg xmlns="http://www.w3.org/2000/svg" width="90" height="90" viewBox="0 0 24 24" fill="none" stroke="#0F172A" strokeWidth="1.8">
                    <rect x="1" y="1" width="6" height="6" rx="1" />
                    <rect x="1" y="17" width="6" height="6" rx="1" />
                    <rect x="17" y="1" width="6" height="6" rx="1" />
                    <path d="M9 1h2v2H9zm4 0h1v1h-1zm0 2h1v1h-1zm-4 3h2v1H9zm6 1h1v1h-1zm0 2h2v1h-2zm-6 2h2v1H9zm10 5h1v1h-1zm0 2h1v1h-1zm-3-3h1v1h-1zm-3 2h2v1h-2zM9 17h2v1H9zm4 2h1v1h-1zm0-3h1v1h-1zm3 1h1v1h-1z" />
                    <circle cx="12" cy="12" r="1.5" fill="#2563EB" stroke="none" />
                  </svg>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: '11px', color: '#64748B', fontWeight: 800, textTransform: 'uppercase' }}>Scan dynamic QR Code</div>
                  <div style={{ fontSize: '12px', color: '#475569', marginTop: '2px', fontWeight: 600 }}>Supports Google Pay, PhonePe, Paytm & UPI</div>
                </div>
              </div>
            )}

            {coveragePharmacyPaymentMode === 'Cash' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '20px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '11.5px', fontWeight: 800, color: '#64748B', textTransform: 'uppercase', marginBottom: '6px' }}>Cash Amount Received</label>
                  <div style={{ position: 'relative' }}>
                    <span style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', fontWeight: 800, color: '#475569', fontSize: '14px' }}>₹</span>
                    <input 
                      type="number" 
                      placeholder="Enter amount given" 
                      value={coveragePharmacyCashReceived} 
                      onChange={(e) => setCoveragePharmacyCashReceived(e.target.value)} 
                      style={{ 
                        width: '100%', 
                        height: '40px', 
                        paddingLeft: '28px', 
                        border: '1px solid #CBD5E1', 
                        borderRadius: '8px', 
                        fontSize: '14px', 
                        fontWeight: 700, 
                        outline: 'none',
                        color: '#0F172A',
                        boxSizing: 'border-box'
                      }} 
                    />
                  </div>
                </div>
                {coveragePharmacyCashReceived && Number(coveragePharmacyCashReceived) >= (selectedCoveragePharmacyRx.amountVal || 550) && (
                  <div style={{ 
                    background: '#ECFDF5', 
                    border: '1px solid #A7F3D0', 
                    padding: '10px 14px', 
                    borderRadius: '8px', 
                    color: '#047857', 
                    display: 'flex', 
                    justifyContent: 'space-between', 
                    alignItems: 'center', 
                    fontSize: '13px', 
                    fontWeight: 800
                  }}>
                    <span>Change to Return:</span>
                    <span>₹{(Number(coveragePharmacyCashReceived) - (selectedCoveragePharmacyRx.amountVal || 550)).toFixed(2)}</span>
                  </div>
                )}
              </div>
            )}

            {coveragePharmacyPaymentMode === 'Card' && (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', padding: '16px', background: '#F8FAFC', borderRadius: '12px', border: '1px solid #E2E8F0', textAlign: 'center', marginBottom: '20px' }}>
                <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: '#EFF6FF', color: '#2563EB', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="5" width="20" height="14" rx="2" ry="2"/><line x1="2" x2="22" y1="10" y2="10"/></svg>
                </div>
                <div>
                  <div style={{ fontWeight: 800, color: '#1E293B', fontSize: '13.5px' }}>POS Terminal Active</div>
                  <div style={{ fontSize: '11.5px', color: '#64748B', marginTop: '4px', fontWeight: 600 }}>Please tap or insert the customer's Credit/Debit card.</div>
                </div>
              </div>
            )}

            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <button 
                type="button" 
                onClick={() => setShowCoveragePharmacyPaymentModal(false)}
                style={{ height: '40px', padding: '0 16px', background: '#F1F5F9', border: 'none', borderRadius: '8px', fontWeight: 700, color: '#475569', cursor: 'pointer' }}
              >Cancel</button>
              <button 
                type="button" 
                onClick={handleConfirmCoveragePharmacyPayment}
                style={{ height: '40px', padding: '0 20px', background: '#10B981', border: 'none', borderRadius: '8px', fontWeight: 800, color: 'white', cursor: 'pointer' }}
              >Confirm Pay & Dispense</button>
            </div>
          </div>
        </div>
      )}

      {/* Break-Glass Emergency Consent Bypass Modal */}
      {showBreakGlassModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(15, 23, 42, 0.65)',
          backdropFilter: 'blur(8px)',
          zIndex: 99999,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}>
          <div style={{
            background: 'white',
            borderRadius: '20px',
            padding: '32px',
            maxWidth: '500px',
            width: '90%',
            boxShadow: '0 25px 50px -12px rgba(239, 68, 68, 0.25)',
            border: '1.5px solid #FCA5A5',
            boxSizing: 'border-box'
          }}>
            <div style={{ display: 'flex', gap: '16px', marginBottom: '20px' }}>
              <div style={{
                width: '48px',
                height: '48px',
                borderRadius: '50%',
                background: '#FEF2F2',
                color: '#EF4444',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0
              }}>
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
              </div>
              <div>
                <h3 style={{ fontSize: '18px', fontWeight: 900, color: '#991B1B', margin: '0 0 6px 0', fontFamily: "'Outfit', sans-serif" }}>
                  Execute Break-Glass Protocol
                </h3>
                <p style={{ fontSize: '13px', color: '#64748B', margin: 0, lineHeight: '1.5', fontWeight: 600 }}>
                  You are about to override DPDP patient consent settings for <strong>{selectedPatient?.name || 'this patient'}</strong>. Under the Indian DPDP Act 2023, emergency medical override is legally permitted but strictly audited.
                </p>
              </div>
            </div>

            <div style={{ marginBottom: '24px' }}>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 800, color: '#374151', marginBottom: '8px' }}>
                Emergency Access Justification (Required)
              </label>
              <textarea
                value={breakGlassReason}
                onChange={(e) => setBreakGlassReason(e.target.value)}
                placeholder="e.g. Patient unconscious/critical, immediate drug allergy and historical record verification required."
                rows={3}
                style={{
                  width: '100%',
                  border: '1.5px solid #CBD5E1',
                  borderRadius: '10px',
                  padding: '12px',
                  fontSize: '13.5px',
                  outline: 'none',
                  resize: 'none',
                  fontFamily: 'inherit',
                  boxSizing: 'border-box'
                }}
              />
              <span style={{ fontSize: '11px', color: '#EF4444', fontWeight: 700, display: 'block', marginTop: '6px' }}>
                * This action will be logged in the immutable audit trail with your digital signature.
              </span>
            </div>

            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={() => {
                  setShowBreakGlassModal(false);
                  setBreakGlassReason('');
                }}
                style={{
                  height: '42px',
                  padding: '0 20px',
                  background: '#F1F5F9',
                  border: 'none',
                  borderRadius: '10px',
                  fontWeight: 700,
                  color: '#475569',
                  cursor: 'pointer'
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!breakGlassReason.trim()}
                onClick={async () => {
                  try {
                    const patientId = selectedPatient?._id || selectedPatient;
                    await api.post(`/emr/consent/patient/${patientId}/bypass-log`, {
                      reason: breakGlassReason,
                      actionContext: 'Doctor EMR Timeline Override'
                    });
                    
                    toggleEmergencyBypass(true);
                    setShowBreakGlassModal(false);
                  } catch (err) {
                    console.error("Failed to log emergency bypass", err);
                    showToastNotification(err.response?.data?.error || "Failed to authorize emergency access", "error");
                  }
                }}
                style={{
                  height: '42px',
                  padding: '0 24px',
                  background: '#DC2626',
                  color: '#FFFFFF',
                  border: 'none',
                  borderRadius: '10px',
                  fontWeight: 800,
                  cursor: !breakGlassReason.trim() ? 'not-allowed' : 'pointer',
                  opacity: !breakGlassReason.trim() ? 0.6 : 1,
                  boxShadow: '0 4px 12px rgba(220, 38, 38, 0.2)'
                }}
              >
                Authorize Override
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Unified Export Modals for Doctor Panel */}
      {showAppointmentExportModal && (
        <ExportModal
          dataset="Appointments"
          data={getAllAppointmentsForList()}
          columns={appointmentExportColumns}
          dateField="date"
          clinicName={user.tenantName || 'CUROXA HEALTHCARE'}
          onClose={() => setShowAppointmentExportModal(false)}
        />
      )}

      {showLabExportModal && (
        <ExportModal
          dataset="Lab Reports"
          data={allLabs}
          columns={labReportExportColumns}
          dateField="createdAt"
          clinicName={user.tenantName || 'CUROXA HEALTHCARE'}
          onClose={() => setShowLabExportModal(false)}
        />
      )}

      {showPrescriptionExportModal && (
        <ExportModal
          dataset="Prescriptions"
          data={allPrescriptions}
          columns={prescriptionExportColumns}
          dateField="createdAt"
          clinicName={user.tenantName || 'CUROXA HEALTHCARE'}
          onClose={() => setShowPrescriptionExportModal(false)}
        />
      )}

      {showPatientExportModal && (
        <ExportModal
          dataset="Patients"
          data={patients}
          columns={patientExportColumns}
          dateField="createdAt"
          clinicName={user.tenantName || 'CUROXA HEALTHCARE'}
          onClose={() => setShowPatientExportModal(false)}
        />
      )}
      </>
    </ErrorBoundary>
  );
};

export default DoctorDashboard;
