import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../utils/api';
import HRPayroll from './HRPayroll';

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

const MOCK_COMPLETED_REPORTS = [];

const LabDashboard = () => {
  const tenantModules = (() => {
    try {
      return JSON.parse(localStorage.getItem('tenantModules') || '{}');
    } catch (e) {
      return {};
    }
  })();

  const [activeTab, setActiveTab] = useState('lab-dash'); // 'lab-dash', 'lab-requests', 'lab-reports', 'lab-inventory'
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  
  // Real Database Lab Inventory States
  const [labInventory, setLabInventory] = useState([]);
  const [showLabInventoryModal, setShowLabInventoryModal] = useState(false);
  const [labModalMode, setLabModalMode] = useState('add'); // 'add', 'edit', 'restock'
  const [labFormData, setLabFormData] = useState({
    name: '',
    category: 'Reagents',
    stock: 50,
    unit: 'L',
    threshold: 20,
    addQty: 10
  });
  const [currentLabItemId, setCurrentLabItemId] = useState(null);

  // Success / Error messages to replace native alert boxes
  const [successMessage, setSuccessMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [loading, setLoading] = useState(false);

  // Dynamic filter & pagination states
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [dateFilter, setDateFilter] = useState('All'); // Show all requests by default
  const [currentPage, setCurrentPage] = useState(1);
  const rowsPerPage = 5;

  // Reports Repository Specific Filter States (Screenshot 4)
  const [repPatientSearch, setRepPatientSearch] = useState('');
  const [repTestTypeFilter, setRepTestTypeFilter] = useState('All');
  const [repDateRangeFilter, setRepDateRangeFilter] = useState('Last 30 Days');
  const [appliedRepFilters, setAppliedRepFilters] = useState({
    patient: '',
    testType: 'All',
    dateRange: 'Last 30 Days'
  });
  const [repCurrentPage, setRepCurrentPage] = useState(1);

  const [selectedDate, setSelectedDate] = useState('');
  const [showDatePicker, setShowDatePicker] = useState(false);

  // Unified Interaction Details Modal States
  const [selectedRequestDetails, setSelectedRequestDetails] = useState(null);
  const [remarks, setRemarks] = useState('');
  const [paramVals, setParamVals] = useState({
    hemoglobin: '',
    wbc: '',
    platelets: ''
  });
  const [supplementaryDocuments, setSupplementaryDocuments] = useState([]);
  const [supplementaryDocType, setSupplementaryDocType] = useState('Raw Machine Data');

  const navigate = useNavigate();
  const [currentUser, setCurrentUser] = useState(() => JSON.parse(localStorage.getItem('user') || '{}'));
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => localStorage.getItem('curoxa_sidebar_collapsed') === 'true');
  const user = currentUser;

  const [showProfileEditModal, setShowProfileEditModal] = useState(false);
  const [profileEditName, setProfileEditName] = useState('');
  const [profileEditEmail, setProfileEditEmail] = useState('');
  const [profileEditAvatar, setProfileEditAvatar] = useState('');
  const [profileEditLoading, setProfileEditLoading] = useState(false);
  const [profileError, setProfileError] = useState('');
  const [profileSuccess, setProfileSuccess] = useState('');

  useEffect(() => {
    if (showProfileEditModal) {
      setProfileEditName(currentUser.name || '');
      setProfileEditEmail(currentUser.email || '');
      setProfileEditAvatar(currentUser.avatar || '');
      setProfileError('');
      setProfileSuccess('');
    }
  }, [showProfileEditModal, currentUser]);

  const handleUpdateProfileSubmit = async (e) => {
    e.preventDefault();
    setProfileEditLoading(true);
    setProfileError('');
    setProfileSuccess('');
    try {
      const response = await api.put(`/auth/profile/${currentUser.id || currentUser._id}`, {
        name: profileEditName,
        email: profileEditEmail,
        avatar: profileEditAvatar
      });
      const updatedUser = {
        ...currentUser,
        name: response.data.name,
        email: response.data.email,
        avatar: response.data.avatar || ''
      };
      localStorage.setItem('user', JSON.stringify(updatedUser));
      setCurrentUser(updatedUser);
      setProfileSuccess('Profile updated successfully!');
      setTimeout(() => {
        setShowProfileEditModal(false);
        setProfileSuccess('');
      }, 1500);
    } catch (err) {
      console.error(err);
      setProfileError(err.response?.data?.error || 'Failed to update profile');
    } finally {
      setProfileEditLoading(false);
    }
  };

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

  // Dynamic role coverage subtab states
  const [receptionistSubTab, setReceptionistSubTab] = useState('queue');
  const [pharmacySubTab, setPharmacySubTab] = useState('queue');

  // Dynamic role coverage real data / transaction states
  const [coverageQueue, setCoverageQueue] = useState([]);
  const [coverageAppts, setCoverageAppts] = useState([]);
  const [coverageBills, setCoverageBills] = useState([]);
  const [coveragePharmacyQueue, setCoveragePharmacyQueue] = useState([]);
  const [showCoveragePharmacyPaymentModal, setShowCoveragePharmacyPaymentModal] = useState(false);
  const [selectedCoveragePharmacyRx, setSelectedCoveragePharmacyRx] = useState(null);
  const [coveragePharmacyPaymentMode, setCoveragePharmacyPaymentMode] = useState('UPI');
  const [coveragePharmacyCashReceived, setCoveragePharmacyCashReceived] = useState('');
  const [doctorSearchQuery, setDoctorSearchQuery] = useState('');
  const [labSearchQuery, setLabSearchQuery] = useState('');
  const [pharmacySearchQuery, setPharmacySearchQuery] = useState('');
  const [coveragePharmacyInventory, setCoveragePharmacyInventory] = useState([]);
  const [patients, setPatients] = useState([]);
  const [coverageDoctors, setCoverageDoctors] = useState([]);
  const [patientVitals, setPatientVitals] = useState([]);
  const [showVitalsModal, setShowVitalsModal] = useState(false);
  const [vitalTemp, setVitalTemp] = useState('');
  const [vitalPulse, setVitalPulse] = useState('');
  const [vitalBpSys, setVitalBpSys] = useState('');
  const [vitalBpDia, setVitalBpDia] = useState('');
  const [vitalResp, setVitalResp] = useState('');
  const [vitalSpo2, setVitalSpo2] = useState('');
  const [vitalWeight, setVitalWeight] = useState('');
  const [vitalHeight, setVitalHeight] = useState('');

  const showToast = (message) => {
    setSuccessMessage(message);
    setTimeout(() => setSuccessMessage(''), 3000);
  };

  const handleConfirmCoveragePharmacyPayment = async () => {
    if (coveragePharmacyPaymentMode === 'Cash') {
      const cashNum = Number(coveragePharmacyCashReceived);
      const totalDue = selectedCoveragePharmacyRx.amountVal || 550;
      if (!coveragePharmacyCashReceived || cashNum < totalDue) {
        showToast('Insufficient cash received amount');
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
        console.error("Failed to auto-create billing record from lab pharmacy coverage dispense", billingErr);
      }

      showToast(`Payment of ₹${(selectedCoveragePharmacyRx.amountVal || 550).toFixed(2)} settled via ${coveragePharmacyPaymentMode}. Prescription dispensed successfully!`);
      setShowCoveragePharmacyPaymentModal(false);
      setSelectedCoveragePharmacyRx(null);
      fetchCoverageData();
    } catch (err) {
      console.error(err);
      showToast('Failed to settle payment and dispense prescription.');
    }
  };

  const redirectedTabsRef = useRef({});

  // Reset redirection flag on tab changes
  useEffect(() => {
    redirectedTabsRef.current = {
      [activeTab]: redirectedTabsRef.current[activeTab]
    };
  }, [activeTab]);

  // Restrict activeTab for cover users based on active coverage permissions
  useEffect(() => {
    const isCoverUser = currentUser?.role !== 'lab';
    if (!isCoverUser) return;
    if (!coverageState || Object.keys(coverageState).length === 0) return;

    let isPermitted = false;
    if (activeTab === 'lab-dash') {
      isPermitted = true;
    } else if (activeTab === 'lab-requests') {
      isPermitted = !!coverageState['lt-queue']?.on;
    } else if (activeTab === 'lab-reports') {
      isPermitted = !!(coverageState['lt-upload']?.on || coverageState['lt-dispatch']?.on);
    } else if (activeTab === 'lab-inventory') {
      isPermitted = !!coverageState['lt-reagents']?.on;
    } else {
      isPermitted = true;
    }

    if (!isPermitted) {
      if (coverageState['lt-queue']?.on) {
        setActiveTab('lab-requests');
      } else if (coverageState['lt-upload']?.on || coverageState['lt-dispatch']?.on) {
        setActiveTab('lab-reports');
      } else if (coverageState['lt-reagents']?.on) {
        setActiveTab('lab-inventory');
      } else {
        setActiveTab('lab-dash');
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

  useEffect(() => {
    const userName = user.name || '';

    const findUserCoverage = (allState) => {
      if (!allState || !userName) return {};
      if (allState[userName]) return allState[userName];
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

    window.addEventListener('storage', syncFromLocalStorage);

    const fetchBackendCoverage = async () => {
      try {
        const response = await api.get('/auth/role-coverage');
        if (response.data && typeof response.data === 'object') {
          localStorage.setItem('curoxa_pmState', JSON.stringify(response.data));
          setCoverageState(findUserCoverage(response.data));
        }
      } catch (err) {
        console.error('Failed to sync coverage from backend', err);
        syncFromLocalStorage();
      }
    };
    fetchBackendCoverage();

    const pollInterval = setInterval(fetchBackendCoverage, 5000);

    return () => {
      window.removeEventListener('storage', syncFromLocalStorage);
      clearInterval(pollInterval);
    };
  }, [user.name]);

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
            showToast(`New Role Coverage Assigned: ${permName}!`);
            
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
          showToast(`Role Coverage Revoked: ${permissionNames[k] || k}!`);
        });
      }
      
      prevCoverageKeysRef.current = activeKeys;
    }
  }, [coverageState]);

  const [labRequests, setLabRequests] = useState([]);
  
  // Hospital Lab Test Catalog & Dynamic Prices State
  const [labTestCatalog, setLabTestCatalog] = useState([]);
  const [showCatalogModal, setShowCatalogModal] = useState(false);
  const [editingCatalogItem, setEditingCatalogItem] = useState(null);
  const [catalogSearchQuery, setCatalogSearchQuery] = useState('');
  const [catalogCategoryFilter, setCatalogCategoryFilter] = useState('All');
  const [catalogStatusFilter, setCatalogStatusFilter] = useState('All');
  const [catalogForm, setCatalogForm] = useState({
    testCode: '',
    testName: '',
    category: 'Hematology',
    price: '',
    sampleType: 'Blood (EDTA)',
    turnaroundTime: '12 Hours',
    normalRange: '',
    unit: '',
    description: ''
  });

  const inputStyle = {
    width: '100%',
    height: '44px',
    background: '#F8FAFC',
    border: '1px solid #E2E8F0',
    borderRadius: '8px',
    padding: '0 12px',
    fontSize: '14px',
    fontWeight: 600,
    color: '#1E293B',
    boxSizing: 'border-box',
    outline: 'none',
    transition: 'all 0.2s ease',
  };

  const labelStyle = {
    display: 'block',
    fontSize: '11px',
    fontWeight: 800,
    color: '#64748B',
    marginBottom: '6px',
    textTransform: 'uppercase',
    letterSpacing: '0.5px'
  };

  const btnStyle = {
    width: '100%',
    height: '44px',
    background: '#2563EB',
    color: 'white',
    border: 'none',
    borderRadius: '8px',
    fontSize: '14px',
    fontWeight: 700,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'all 0.2s ease',
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

      // Pharmacy inventory for stock view
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

      // Patients list
      const ptsRes = await api.get('/patients');
      if (ptsRes.data && Array.isArray(ptsRes.data)) {
        const mapped = ptsRes.data.map(p => ({
          ...p,
          uhid: `MDC-${p._id.toString().substring(18).toUpperCase()}`
        }));
        setPatients(mapped);
      }

      // Staff (Doctors) list
      const staffRes = await api.get('/auth/users/all');
      if (staffRes.data && Array.isArray(staffRes.data)) {
        setCoverageDoctors(staffRes.data.filter(s => s.role === 'doctor'));
      }
    } catch (err) {
      console.error("Failed to fetch coverage data", err);
    }
  }, []);

  useEffect(() => {
    fetchData();
    // Poll data and coverage data every 5 seconds for real-time updates
    const pollInterval = setInterval(() => {
      fetchData();
      fetchCoverageData();
    }, 5000);
    return () => clearInterval(pollInterval);
  }, [fetchCoverageData]);

  useEffect(() => {
    const handleSync = (e) => {
      const { type, message, changes } = e.detail || {};
      console.log('[SOCKET] LabDashboard received sync event for:', type);
      if (type === 'coverage') {
        fetchCoverageData();
      } else if (type === 'prescription_updated') {
        if (changes && changes.labTech) {
          showToast(message || 'A lab order/prescription has been edited by the doctor!');
        }
        fetchData();
      } else {
        fetchData();
      }
    };
    window.addEventListener('curoxa_sync', handleSync);
    return () => window.removeEventListener('curoxa_sync', handleSync);
  }, []);

  const fetchData = async () => {
    try {
      const res = await api.get('/labs');
      setLabRequests(res.data);

      const invRes = await api.get('/lab-inventory');
      setLabInventory(invRes.data);

      const catRes = await api.get('/lab-tests/all');
      setLabTestCatalog(catRes.data || []);

      // Also refresh coverage-related data
      await fetchCoverageData();
    } catch (err) {
      console.error(err);
    }
  };
  
  const getUniqueLabRequests = (requests) => {
    const seen = new Set();
    const unique = [];
    (requests || []).forEach(req => {
      const pId = req.patientId?._id || req.patientId || 'unknown';
      const test = req.testName || 'unknown';
      const dateStr = req.createdAt ? new Date(req.createdAt).toDateString() : 'no-date';
      const status = req.status || 'unknown';
      const key = `${pId}-${test}-${status}-${dateStr}`;
      
      if (!seen.has(key)) {
        seen.add(key);
        unique.push(req);
      }
    });
    return unique;
  };

  const uniqueLabRequests = getUniqueLabRequests(labRequests);

  useEffect(() => {
    if (window.lucide) {
      window.lucide.createIcons();
    }
  }, [activeTab, labRequests, labInventory, selectedRequestDetails, showProfileMenu, showLabInventoryModal, showDatePicker, currentPage, statusFilter, dateFilter, appliedRepFilters, repCurrentPage]);

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    navigate('/login');
  };

  // Dynamic Avatar Initials and Palette Generator
  const getAvatarStyle = (name) => {
    const initials = name ? name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase() : 'PT';
    const charCode = initials.charCodeAt(0) + (initials.charCodeAt(1) || 0);
    const colorSchemes = [
      { bg: '#EFF6FF', text: '#2563EB' }, // Blue
      { bg: '#FFFBEB', text: '#D97706' }, // Orange/Yellow
      { bg: '#ECFDF5', text: '#059669' }, // Green
      { bg: '#FEF2F2', text: '#DC2626' }, // Red
      { bg: '#F5F3FF', text: '#7C3AED' }  // Purple
    ];
    const scheme = colorSchemes[charCode % colorSchemes.length];
    return { initials, ...scheme };
  };

  // Generate dynamic specimen metadata matching the layout screenshot
  const getTestSpecimenInfo = (testName) => {
    const test = (testName || '').toLowerCase();
    if (test.includes('blood') || test.includes('cbc') || test.includes('hemoglobin') || test.includes('platelet') || test.includes('wbc')) {
      return { code: 'CBC', desc: 'Whole Blood - EDTA' };
    }
    if (test.includes('lipid') || test.includes('sugar') || test.includes('hba1c') || test.includes('cholesterol') || test.includes('liver') || test.includes('lft') || test.includes('kft') || test.includes('urea') || test.includes('glucose')) {
      return { code: 'FBS', desc: 'Plasma - Fluoride' };
    }
    if (test.includes('thyroid') || test.includes('tsh') || test.includes('hormone') || test.includes('t3') || test.includes('t4') || test.includes('panel')) {
      return { code: 'THY', desc: 'Serum - Plain' };
    }
    if (test.includes('covid') || test.includes('pcr') || test.includes('rt-pcr') || test.includes('molecular') || test.includes('dna')) {
      return { code: 'PCR', desc: 'Nasopharyngeal Swab' };
    }
    if (test.includes('x-ray') || test.includes('xr') || test.includes('chest') || test.includes('scan') || test.includes('mri')) {
      return { code: 'XR', desc: 'Radiology Department' };
    }
    return { code: 'LAB', desc: 'Specimen Swab/Serum/Urine' };
  };

  // Dynamic Assigned Lab Department Generator
  const getAssignedLab = (testName) => {
    const test = (testName || '').toLowerCase();
    if (test.includes('blood') || test.includes('cbc') || test.includes('hemoglobin') || test.includes('platelet') || test.includes('wbc')) {
      return 'Hematology A';
    }
    if (test.includes('lipid') || test.includes('sugar') || test.includes('hba1c') || test.includes('cholesterol') || test.includes('liver') || test.includes('lft') || test.includes('kft') || test.includes('urea') || test.includes('glucose')) {
      return 'Biochemistry Main';
    }
    if (test.includes('thyroid') || test.includes('tsh') || test.includes('hormone') || test.includes('t3') || test.includes('t4') || test.includes('panel')) {
      return 'Hormone Lab';
    }
    if (test.includes('covid') || test.includes('pcr') || test.includes('rt-pcr') || test.includes('molecular') || test.includes('dna')) {
      return 'Molecular Lab';
    }
    return 'Biochemistry Main';
  };

  // Dynamic ABHA ID Generator based on patient email or name
  const getAbhaId = (name, email) => {
    if (email && email.includes('@')) {
      return email.split('@')[0].toUpperCase() + '@ABDM';
    }
    const cleanName = (name || 'patient').toLowerCase().replace(/\s+/g, '.');
    return cleanName + '@ABDM';
  };

  // Dynamic Status Badge formatting
  const renderStatusBadge = (status, results) => {
    if (status === 'Completed') {
      return (
        <span className="status-badge" style={{ background: '#ECFDF5', color: '#047857', border: '1px solid #A7F3D0' }}>
          Completed
        </span>
      );
    }
    if (status === 'In Progress') {
      return results ? (
        <span className="status-badge" style={{ background: '#FEF3C7', color: '#B45309', border: '1px solid #FCD34D' }}>
          Report Pending
        </span>
      ) : (
        <span className="status-badge" style={{ background: '#EFF6FF', color: '#1E40AF', border: '1px solid #BFDBFE' }}>
          Sample Collected
        </span>
      );
    }
    return (
      <span className="status-badge" style={{ background: '#F1F5F9', color: '#475569', border: '1px solid #CBD5E1' }}>
        Pending Sample
      </span>
    );
  };

  // Perform sample collection (Pending -> In Progress)
  const handleCollectSample = async (reqId) => {
    try {
      setLoading(true);
      const specimenInfo = getTestSpecimenInfo(selectedRequestDetails.testName);
      await api.put(`/labs/${reqId}`, { 
        status: 'In Progress',
        notes: `Sample Type: ${specimenInfo.desc}`
      });
      fetchData();
      setSuccessMessage("Sample collected successfully and sent to analysis!");
      setTimeout(() => setSuccessMessage(''), 3000);
      
      // Update local detailed request state
      const updatedReq = { ...selectedRequestDetails, status: 'In Progress', notes: `Sample Type: ${specimenInfo.desc}` };
      setSelectedRequestDetails(updatedReq);
    } catch (err) {
      console.error(err);
      setErrorMessage('Failed to collect sample');
      setTimeout(() => setErrorMessage(''), 3000);
    } finally {
      setLoading(false);
    }
  };

  // Save partial results as Draft (keeps In Progress, but marks as Report Pending)
  const handleSaveDraft = async (reqId) => {
    try {
      setLoading(true);
      const draftData = JSON.stringify({
        parameters: paramVals,
        remarks: remarks,
        isDraft: true
      });
      await api.put(`/labs/${reqId}`, { 
        results: draftData 
      });
      fetchData();
      setSuccessMessage("Draft results saved successfully!");
      setTimeout(() => setSuccessMessage(''), 3000);
      setSelectedRequestDetails(null);
    } catch (err) {
      console.error(err);
      setErrorMessage('Failed to save draft results');
      setTimeout(() => setErrorMessage(''), 3000);
    } finally {
      setLoading(false);
    }
  };

  // Finalize lab report (In Progress -> Completed)
  const handleFinalizeReport = async (reqId) => {
    try {
      setLoading(true);
      const finalData = JSON.stringify({
        parameters: paramVals,
        remarks: remarks,
        isDraft: false,
        finalizedAt: new Date().toISOString()
      });
      await api.put(`/labs/${reqId}`, { 
        status: 'Completed',
        results: finalData 
      });
      fetchData();
      setSuccessMessage("Lab report finalized and dispatched to EMR vault!");
      setTimeout(() => setSuccessMessage(''), 3000);
      setSelectedRequestDetails(null);
    } catch (err) {
      console.error(err);
      setErrorMessage('Failed to finalize lab report');
      setTimeout(() => setErrorMessage(''), 3000);
    } finally {
      setLoading(false);
    }
  };

  // Helper to safely parse JSON results from DB
  const parseResults = (resultsStr) => {
    if (!resultsStr) return { parameters: {}, remarks: '', isDraft: false };
    try {
      return JSON.parse(resultsStr);
    } catch (e) {
      return { parameters: {}, remarks: resultsStr || '', isDraft: false };
    }
  };

  // Open details modal and prefill inputs
  const handleOpenDetails = (req) => {
    setSelectedRequestDetails(req);
    const parsed = parseResults(req.results);
    setRemarks(parsed.remarks || '');
    setParamVals({
      hemoglobin: parsed.parameters?.hemoglobin || '',
      wbc: parsed.parameters?.wbc || '',
      platelets: parsed.parameters?.platelets || ''
    });
    const patientId = req.patientId?._id || req.patientId;
    if (patientId) {
      api.get(`/emr/vitals/patient/${patientId}`)
        .then(r => setPatientVitals(r.data || []))
        .catch(() => setPatientVitals([]));
    } else {
      setPatientVitals([]);
    }
  };

  const handleSaveVitals = async (e) => {
    if (e) e.preventDefault();
    const patientId = selectedRequestDetails?.patientId?._id || selectedRequestDetails?.patientId;
    if (!patientId) return;
    try {
      setLoading(true);
      const payload = {
        patientId,
        temperature: vitalTemp ? parseFloat(vitalTemp) : undefined,
        pulse: vitalPulse ? parseInt(vitalPulse) : undefined,
        bpSys: vitalBpSys ? parseInt(vitalBpSys) : undefined,
        bpDia: vitalBpDia ? parseInt(vitalBpDia) : undefined,
        respiration: vitalResp ? parseInt(vitalResp) : undefined,
        spo2: vitalSpo2 ? parseInt(vitalSpo2) : undefined,
        weight: vitalWeight ? parseFloat(vitalWeight) : undefined,
        height: vitalHeight ? parseFloat(vitalHeight) : undefined
      };

      await api.post('/emr/vitals', payload);
      showToast("Vitals recorded successfully");
      
      const res = await api.get(`/emr/vitals/patient/${patientId}`);
      setPatientVitals(res.data || []);
      setShowVitalsModal(false);
    } catch (err) {
      console.error("Failed to record vitals:", err);
      showToast("Failed to record vitals");
    } finally {
      setLoading(false);
    }
  };

  // Lab Inventory operations
  const handleOpenAddLabItem = () => {
    setLabModalMode('add');
    setLabFormData({
      name: '',
      category: 'Reagents',
      stock: 50,
      unit: 'L',
      threshold: 20,
      addQty: 10
    });
    setShowLabInventoryModal(true);
  };

  const handleOpenEditLabItem = (item) => {
    setLabModalMode('edit');
    setCurrentLabItemId(item._id);
    setLabFormData({
      name: item.name,
      category: item.category,
      stock: item.stock,
      unit: item.unit,
      threshold: item.threshold,
      addQty: 10
    });
    setShowLabInventoryModal(true);
  };

  const handleOpenRestockLabItem = (item) => {
    setLabModalMode('restock');
    setCurrentLabItemId(item._id);
    setLabFormData({
      name: item.name,
      category: item.category,
      stock: item.stock,
      unit: item.unit,
      threshold: item.threshold,
      addQty: 10
    });
    setShowLabInventoryModal(true);
  };

  const handleSaveLabItem = async (e) => {
    e.preventDefault();
    setLoading(true);
    setErrorMessage('');
    setSuccessMessage('');
    try {
      if (labModalMode === 'add') {
        await api.post('/lab-inventory', labFormData);
        setSuccessMessage('Lab item added successfully');
      } else if (labModalMode === 'restock') {
        await api.put(`/lab-inventory/${currentLabItemId}`, { 
          isRestock: true, 
          addQty: labFormData.addQty 
        });
        setSuccessMessage('Inventory restocked successfully');
      } else {
        await api.put(`/lab-inventory/${currentLabItemId}`, labFormData);
        setSuccessMessage('Lab item updated successfully');
      }
      setShowLabInventoryModal(false);
      fetchData();
      setTimeout(() => setSuccessMessage(''), 3000);
    } catch (err) {
      console.error(err);
      setErrorMessage(err.response?.data?.error || 'Failed to save item');
      setTimeout(() => setErrorMessage(''), 3000);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteLabItem = async (id) => {
    try {
      await api.delete(`/lab-inventory/${id}`);
      setSuccessMessage('Lab item deleted successfully');
      fetchData();
      setTimeout(() => setSuccessMessage(''), 3000);
    } catch (err) {
      console.error(err);
      setErrorMessage('Failed to delete item');
      setTimeout(() => setErrorMessage(''), 3000);
    }
  };

  // Filter requests based on search query, status, and date selectors
  const filteredRequests = uniqueLabRequests.filter(req => {
    // Search query match
    const nameMatch = (req.patientId?.name || '').toLowerCase().includes(searchQuery.toLowerCase()) || 
                      (req.patientId?._id || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
                      (req.patientId?.contact || '').includes(searchQuery);
    
    if (!nameMatch) return false;
 
    // Status filter match
    if (statusFilter !== 'All') {
      if (statusFilter === 'Pending') {
        if (req.status !== 'Pending') return false;
      } else if (statusFilter === 'Completed') {
        if (req.status !== 'Completed') return false;
      } else if (statusFilter === 'Sample Collected') {
        if (req.status !== 'In Progress' || parseResults(req.results).isDraft) return false;
      } else if (statusFilter === 'Report Pending') {
        if (req.status !== 'In Progress' || !parseResults(req.results).isDraft) return false;
      }
    }
 
    // Date filter match
    if (dateFilter !== 'All') {
      const matchDate = new Date();
      const reqDate = new Date(req.createdAt).toDateString();
      if (dateFilter === 'Today') {
        if (reqDate !== matchDate.toDateString()) return false;
      } else if (dateFilter === 'Yesterday') {
        matchDate.setDate(matchDate.getDate() - 1);
        if (reqDate !== matchDate.toDateString()) return false;
      } else if (dateFilter === 'Week') {
        const diffTime = Math.abs(new Date() - new Date(req.createdAt));
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        if (diffDays > 7) return false;
      }
    }
 
    return true;
  });
 
  // Filter Reports Repository List (Screenshot 4)
  const allCompletedReports = [
    ...uniqueLabRequests.filter(req => req.status === 'Completed'),
    ...MOCK_COMPLETED_REPORTS
  ];

  // Sort reports by completed date descending
  allCompletedReports.sort((a, b) => new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt));

  const repFilteredRequests = allCompletedReports.filter(req => {
    // Search filter
    const patientName = req.patientId?.name || '';
    const patientUHID = req.customId || `LAB-${req._id.substring(18).toUpperCase()}`;
    const nameMatch = patientName.toLowerCase().includes(appliedRepFilters.patient.toLowerCase()) ||
                      patientUHID.toLowerCase().includes(appliedRepFilters.patient.toLowerCase());
    
    if (!nameMatch) return false;

    // Test Type filter
    if (appliedRepFilters.testType !== 'All') {
      if (req.testName !== appliedRepFilters.testType) return false;
    }

    // Date Range filter
    if (appliedRepFilters.dateRange !== 'All Time') {
      const diffTime = Math.abs(new Date() - new Date(req.updatedAt || req.createdAt));
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      if (appliedRepFilters.dateRange === 'Last 30 Days' && diffDays > 30) return false;
      if (appliedRepFilters.dateRange === 'Last 7 Days' && diffDays > 7) return false;
      if (appliedRepFilters.dateRange === 'Today' && new Date(req.updatedAt || req.createdAt).toDateString() !== new Date().toDateString()) return false;
    }

    return true;
  });

  // Calculate Reports page pagination slice
  const repTotalPages = Math.ceil(repFilteredRequests.length / rowsPerPage) || 1;
  const repPaginatedRequests = repFilteredRequests.slice((repCurrentPage - 1) * rowsPerPage, repCurrentPage * rowsPerPage);

  // Calculate pagination slice for requests list
  const totalPages = Math.ceil(filteredRequests.length / rowsPerPage) || 1;
  const paginatedRequests = filteredRequests.slice((currentPage - 1) * rowsPerPage, currentPage * rowsPerPage);

  const todayStr = new Date().toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });

  // Extract unique test names from database and mock reports for dropdown options
  const uniqueTestTypes = Array.from(new Set([
    ...uniqueLabRequests.map(r => r.testName),
    ...MOCK_COMPLETED_REPORTS.map(r => r.testName)
  ]));

  return (
    <>
      <style>{`
        /* Scoped Premium styles to override the index.css dark sidebar for the Lab Portal */
        .sidebar {
          background: #FFFFFF !important;
          border-right: 1px solid #E2E8F0 !important;
          box-shadow: none !important;
          display: flex !important;
          flex-direction: column !important;
          width: 256px !important;
          height: calc(100vh / 0.9) !important;
          position: fixed !important;
          top: 0 !important;
          left: 0 !important;
          z-index: 100 !important;
        }
        .sidebar-logo {
          color: #2563EB !important;
          padding: 24px 24px 28px !important;
          border-bottom: 1px solid #F1F5F9 !important;
          font-weight: 800 !important;
        }
        .sidebar-logo i {
          color: #2563EB !important;
        }
        nav {
          display: flex !important;
          flex-direction: column !important;
          height: 100% !important;
          padding: 16px 0 !important;
        }
        .nav-link {
          color: #64748B !important;
          padding: 12px 20px !important;
          margin: 2px 16px !important;
          border-radius: 8px !important;
          border-left: none !important;
          font-size: 13.5px !important;
          font-weight: 700 !important;
          display: flex !important;
          align-items: center !important;
          gap: 12px !important;
          transition: all 0.2s ease !important;
        }
        .nav-link:hover {
          background: #F8FAFC !important;
          color: #0F172A !important;
        }
        .nav-link.active {
          background: #EFF6FF !important;
          color: #2563EB !important;
          font-weight: 800 !important;
        }
        .sidebar-user {
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
        .sidebar-user:hover {
          background: #F1F5F9 !important;
        }
        .sidebar-user .name {
          font-size: 13.5px !important;
          font-weight: 800 !important;
          color: #0F172A !important;
          line-height: 1.3 !important;
        }
        .sidebar-user .role {
          font-size: 11px !important;
          color: #64748B !important;
          font-weight: 600 !important;
        }
        .top-nav {
          background: #FFFFFF !important;
          border-bottom: 1px solid #E2E8F0 !important;
          margin-left: 256px !important;
          height: 56px !important;
          padding: 0 20px !important;
          display: flex !important;
          align-items: center !important;
          justify-content: flex-end !important;
          gap: 20px !important;
        }
        .search-wrapper {
          position: relative !important;
          flex: 1 !important;
          max-width: 380px !important;
          margin: 0 !important;
        }
        .search-wrapper i, .search-wrapper svg {
          position: absolute !important;
          left: 14px !important;
          top: 50% !important;
          transform: translateY(-50%) !important;
          color: #94A3B8 !important;
          pointer-events: none !important;
          width: 16px !important;
          height: 16px !important;
        }
        .search-wrapper .search-input {
          background: #F8FAFC !important;
          border: 1px solid #E2E8F0 !important;
          border-radius: 8px !important;
          padding-left: 40px !important;
          font-size: 13.5px !important;
          font-weight: 600 !important;
          height: 40px !important;
        }
        .search-wrapper .search-input:focus {
          border-color: #2563EB !important;
          background: #FFFFFF !important;
        }
        .bell-icon-btn {
          width: 40px;
          height: 40px;
          border-radius: 8px;
          background: #F8FAFC;
          border: 1px solid #E2E8F0;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          color: #64748B;
          position: relative;
          transition: all 0.2s;
        }
        .bell-icon-btn:hover {
          background: #F1F5F9;
          color: #0F172A;
        }
        .bell-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: #EF4444;
          position: absolute;
          top: 8px;
          right: 8px;
          border: 2px solid #FFFFFF;
        }
        .main-content {
          margin-left: 256px !important;
          background: #F8FAFC !important;
          padding: 16px !important;
        }
        .tab-content {
          padding: 0px !important;
        }
        .calendar-btn {
          width: 40px;
          height: 40px;
          border-radius: 8px;
          background: #EFF6FF;
          border: none;
          color: #2563EB;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: all 0.2s ease;
        }
        .calendar-btn:hover {
          background: #DBEAFE;
        }
        .kpi-container-custom {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 20px;
          margin-bottom: 32px;
        }
        .kpi-card-custom {
          background: #FFFFFF;
          border: 1px solid #E2E8F0;
          border-radius: 12px;
          padding: 18px 24px;
          display: flex;
          align-items: center;
          gap: 16px;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.01);
        }
        .kpi-icon-box-custom {
          width: 48px;
          height: 48px;
          border-radius: 10px;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .kpi-inner-content {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }
        .kpi-title-custom {
          font-size: 11px;
          font-weight: 800;
          color: #64748B;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }
        .kpi-value-custom {
          font-size: 26px;
          font-weight: 800;
          color: #0F172A;
          line-height: 1;
        }
        .avatar-circle-initials {
          width: 36px;
          height: 36px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: 800;
          font-size: 12.5px;
          font-family: inherit;
        }
        .elite-table-custom {
          width: 100%;
          border-collapse: separate;
          border-spacing: 0;
          margin: 0;
        }
        .elite-table-custom th {
          padding: 16px 24px;
          font-size: 11px;
          font-weight: 800;
          color: #64748B;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          border-bottom: 1px solid #E2E8F0;
          text-align: left;
        }
        .elite-table-custom td {
          padding: 16px 24px;
          border-bottom: 1px solid #F1F5F9;
          font-size: 13.5px;
          color: #0F172A;
          vertical-align: middle;
        }
        .elite-table-custom tr:hover td {
          background: #F8FAFC;
        }
        .details-link-btn {
          color: #2563EB;
          font-weight: 700;
          cursor: pointer;
          font-size: 13px;
          background: none;
          border: none;
          padding: 0;
          transition: color 0.15s ease;
        }
        .details-link-btn:hover {
          color: #1D4ED8;
          text-decoration: underline;
        }
        .open-btn-custom {
          background: #FFFFFF !important;
          border: 1.5px solid #2563EB !important;
          color: #2563EB !important;
          padding: 6px 18px !important;
          border-radius: 6px !important;
          font-weight: 700 !important;
          font-size: 12.5px !important;
          cursor: pointer !important;
          transition: all 0.2s ease !important;
          display: inline-flex !important;
          align-items: center !important;
          justify-content: center !important;
        }
        .open-btn-custom:hover {
          background: #2563EB !important;
          color: #FFFFFF !important;
        }
        .filter-select-custom {
          background: #FFFFFF;
          border: 1px solid #CBD5E1;
          border-radius: 6px;
          padding: 6px 12px;
          font-size: 13px;
          font-weight: 700;
          color: #475569;
          outline: none;
          cursor: pointer;
          height: 36px;
          transition: border-color 0.15s ease;
        }
        .filter-select-custom:focus {
          border-color: #2563EB;
        }
        .page-btn {
          width: 32px;
          height: 32px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          border-radius: 6px;
          border: 1px solid #E2E8F0;
          background: #FFFFFF;
          color: #475569;
          font-size: 13px;
          font-weight: 700;
          cursor: pointer;
          transition: all 0.2s;
        }
        .page-btn:hover {
          background: #F1F5F9;
          color: #0F172A;
        }
        .page-btn.active {
          background: #2563EB;
          color: #FFFFFF;
          border-color: #2563EB;
        }

        /* Detail View Card styles (to match the third screenshot) */
        .detail-card {
          background: #FFFFFF;
          border: 1px solid #E2E8F0;
          border-radius: 12px;
          padding: 24px;
          margin-bottom: 24px;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.01);
        }
        .detail-card-title {
          font-size: 14px;
          font-weight: 800;
          color: #0F172A;
          margin: 0 0 16px 0;
          display: flex;
          align-items: center;
          gap: 10px;
        }
        .detail-meta-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 24px;
        }
        .detail-meta-item {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }
        .detail-meta-label {
          font-size: 11px;
          font-weight: 800;
          color: #94A3B8;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }
        .detail-meta-val {
          font-size: 14px;
          font-weight: 700;
          color: #1E293B;
        }
        .specimen-badge-box {
          display: flex;
          align-items: center;
          gap: 16px;
          background: #FFFFFF;
          border: 1px solid #E2E8F0;
          border-radius: 10px;
          padding: 14px 20px;
          position: relative;
          min-width: 280px;
          flex: 1;
        }
        .specimen-code-icon {
          width: 38px;
          height: 38px;
          border-radius: 6px;
          background: #EFF6FF;
          color: #2563EB;
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: 800;
          font-size: 11px;
        }
        .upload-dashed-box {
          border: 2px dashed #CBD5E1;
          background: #F8FAFC;
          border-radius: 12px;
          padding: 40px 20px;
          text-align: center;
          cursor: pointer;
          transition: all 0.2s;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 12px;
        }
        .upload-dashed-box:hover {
          border-color: #2563EB;
          background: #EFF6FF;
        }

        /* Reports Repository Filters Container */
        .reports-filters-container-custom {
          background: #FFFFFF;
          border: 1px solid #E2E8F0;
          border-radius: 12px;
          padding: 20px 24px;
          margin-bottom: 24px;
          display: grid;
          grid-template-columns: 1fr 1fr 1fr auto;
          gap: 16px;
          align-items: flex-end;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.01);
        }
        .reports-filter-input-wrapper {
          position: relative;
          width: 100%;
        }
        .reports-filter-input-wrapper i {
          position: absolute;
          left: 12px;
          top: 50%;
          transform: translateY(-50%);
          color: #94A3B8;
        }
        .reports-filter-input {
          padding-left: 36px !important;
        }
        .table-responsive {
          width: 100% !important;
          overflow-x: auto !important;
          -webkit-overflow-scrolling: touch !important;
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
            padding: 16px !important;
          }
          .kpi-container-custom {
            grid-template-columns: 1fr 1fr;
          }
          .detail-meta-grid {
            grid-template-columns: 1fr 1fr;
          }
          .reports-filters-container-custom {
            grid-template-columns: 1fr;
          }
        }

        @media (max-width: 768px) {
          div.mobile-stack {
            grid-template-columns: 1fr !important;
            flex-direction: column !important;
            align-items: stretch !important;
            gap: 20px !important;
          }
          .lab-requests-filters-bar-custom {
            flex-direction: column !important;
            align-items: stretch !important;
            gap: 16px !important;
            padding: 16px !important;
          }
          .lab-requests-filters-inner-custom {
            flex-direction: column !important;
            align-items: stretch !important;
            width: 100% !important;
            gap: 10px !important;
          }
          .lab-requests-filters-inner-custom span {
            margin-bottom: 4px !important;
          }
          .lab-requests-filters-bar-custom select {
            width: 100% !important;
            height: 40px !important;
          }
          .lab-requests-filters-bar-custom button {
            align-self: flex-end !important;
            width: 40px !important;
            height: 40px !important;
          }
        }

        @media (max-width: 640px) {
          .kpi-container-custom {
            grid-template-columns: 1fr !important;
          }
          .search-wrapper {
            max-width: 180px !important;
          }
          .top-nav {
            padding: 0 12px !important;
            gap: 8px !important;
          }
        }

        @media (max-width: 480px) {
          .detail-meta-grid {
            grid-template-columns: 1fr !important;
          }
          .mobile-grid-2 {
            grid-template-columns: 1fr !important;
            gap: 12px !important;
          }
        }

        /* Additional Visual Enhancements for Reports Repository */
        .nav-link.active {
          background: #EFF6FF !important;
          color: #2563EB !important;
          font-weight: 800 !important;
          position: relative !important;
        }
        .nav-link.active::before {
          content: '' !important;
          position: absolute !important;
          left: 0 !important;
          top: 0 !important;
          bottom: 0 !important;
          width: 4px !important;
          background: #2563EB !important;
          border-top-left-radius: 8px !important;
          border-bottom-left-radius: 8px !important;
        }
        .reports-filters-container-custom label {
          display: block !important;
          font-size: 13px !important;
          font-weight: 600 !important;
          color: #475569 !important;
          margin-bottom: 8px !important;
          text-transform: none !important;
          letter-spacing: normal !important;
        }
        .reports-filter-input-wrapper i, .reports-filter-input-wrapper svg {
          position: absolute !important;
          left: 12px !important;
          top: 50% !important;
          transform: translateY(-50%) !important;
          color: #94A3B8 !important;
          width: 16px !important;
          height: 16px !important;
        }
        .date-select-wrapper i, .date-select-wrapper svg {
          position: absolute !important;
          left: 12px !important;
          top: 50% !important;
          transform: translateY(-50%) !important;
          color: #94A3B8 !important;
          width: 16px !important;
          height: 16px !important;
          pointer-events: none !important;
        }
        .status-badge-completed-custom {
          display: inline-flex !important;
          align-items: center !important;
          border-left: 3px solid #2563EB !important;
          background: #EFF6FF !important;
          color: #1E40AF !important;
          padding: 4px 8px !important;
          border-radius: 4px !important;
          font-size: 11px !important;
          font-weight: 800 !important;
          letter-spacing: 0.5px !important;
        }
        .status-badge-urgent-custom {
          display: inline-flex !important;
          align-items: center !important;
          border-left: 3px solid #EA580C !important;
          background: #FFF7ED !important;
          color: #C2410C !important;
          padding: 4px 8px !important;
          border-radius: 4px !important;
          font-size: 11px !important;
          font-weight: 800 !important;
          letter-spacing: 0.5px !important;
        }

        /* Dynamic Responsive Typography Overrides */
        @media (max-width: 1024px) {
          h1, [style*="fontSize: '28px'"], [style*="fontSize: '24px'"], [style*="fontSize:28px"], [style*="fontSize:24px"] {
            font-size: 20px !important;
          }
          h2 {
            font-size: 17px !important;
          }
          h3, [style*="fontSize: '18px'"], [style*="fontSize: '17px'"], [style*="fontSize:18px"], [style*="fontSize:17px"] {
            font-size: 15px !important;
          }
          .modern-kpi-val, .kpi-value-custom {
            font-size: 18px !important;
          }
          .modern-kpi-lbl, .kpi-title-custom {
            font-size: 10.5px !important;
          }
          .premium-table th, .elite-table th, .elite-table-custom th {
            font-size: 10px !important;
            padding: 10px 12px !important;
          }
          .premium-table td, .elite-table td, .elite-table-custom td {
            font-size: 12px !important;
            padding: 10px 12px !important;
          }
          .nav-link {
            font-size: 12.5px !important;
            padding: 10px 16px !important;
          }
          .search-input, .form-control {
            font-size: 12px !important;
            padding: 8px 12px !important;
          }
          .btn {
            font-size: 12px !important;
            padding: 8px 16px !important;
          }
          body, p, span, div, label {
            font-size: 12.5px !important;
          }
          .avail-info b {
            font-size: 12px !important;
          }
          .avail-info p {
            font-size: 10.5px !important;
          }
        }

        @media (max-width: 640px) {
          h1, [style*="fontSize: '28px'"], [style*="fontSize: '24px'"], [style*="fontSize:28px"], [style*="fontSize:24px"] {
            font-size: 17px !important;
          }
          h3, [style*="fontSize: '18px'"], [style*="fontSize: '17px'"], [style*="fontSize:18px"], [style*="fontSize:17px"] {
            font-size: 13.5px !important;
          }
          .modern-kpi-val, .kpi-value-custom {
            font-size: 16px !important;
          }
          .modern-kpi-lbl, .kpi-title-custom {
            font-size: 9.5px !important;
          }
          .premium-table th, .elite-table th, .elite-table-custom th {
            font-size: 9px !important;
            padding: 8px 10px !important;
          }
          .premium-table td, .elite-table td, .elite-table-custom td {
            font-size: 11px !important;
            padding: 8px 10px !important;
          }
          .nav-link {
            font-size: 12px !important;
            padding: 8px 12px !important;
          }
          .search-input, .form-control {
            font-size: 11.5px !important;
            padding: 6px 10px !important;
          }
          .btn {
            font-size: 11px !important;
            padding: 6px 12px !important;
          }
          body, p, span, div, label {
            font-size: 11.5px !important;
          }
        }
      `}</style>

      {/* Sidebar Navigation */}
      {/* Main Sidebar */}
      {activeTab !== 'hr-payroll' && (
        <div className={"sidebar " + (isSidebarCollapsed ? "collapsed " : "") + (mobileSidebarOpen ? "mobile-open" : "")} data-lenis-prevent>
        <div className="sidebar-logo" style={{ display: 'flex', alignItems: 'center', gap: '10px', position: 'relative', width: '100%' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '32px', height: '32px', borderRadius: '8px', background: 'var(--primary)', color: '#FFFFFF', fontWeight: 900, fontSize: '16px', boxShadow: '0 0 15px rgba(59, 113, 254, 0.15)', flexShrink: 0 }}>
            C
          </div>
          <span style={{ fontFamily: "'Outfit', sans-serif", fontWeight: 900, color: '#2563EB', letterSpacing: '-0.02em' }}>Curoxa</span>
          <button 
            className="sidebar-collapse-toggle desktop-only-flex"
            onClick={(e) => {
              e.stopPropagation();
              const newState = !isSidebarCollapsed;
              setIsSidebarCollapsed(newState);
              localStorage.setItem('curoxa_sidebar_collapsed', String(newState));
            }}
            style={{
              transform: isSidebarCollapsed ? 'rotate(180deg)' : 'none'
            }}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
          </button>
        </div>
        <nav style={{ flex: 1 }}>
          <a href="#" className={`nav-link ${activeTab === 'lab-dash' ? 'active' : ''}`} onClick={(e) => { e.preventDefault(); setActiveTab('lab-dash'); setSelectedRequestDetails(null); setMobileSidebarOpen(false); }}>
            <i data-lucide="layout-dashboard"></i> Overview
          </a>
          {(currentUser?.role === 'lab' || coverageState['lt-queue']?.on) && (
            <a href="#" className={`nav-link ${activeTab === 'lab-requests' ? 'active' : ''}`} onClick={(e) => { e.preventDefault(); setActiveTab('lab-requests'); setSelectedRequestDetails(null); setMobileSidebarOpen(false); }}>
              <i data-lucide="clipboard-list"></i> Lab requests
            </a>
          )}
          {(currentUser?.role === 'lab' || (coverageState['lt-upload']?.on || coverageState['lt-dispatch']?.on)) && (
            <a href="#" className={`nav-link ${activeTab === 'lab-reports' ? 'active' : ''}`} onClick={(e) => { e.preventDefault(); setActiveTab('lab-reports'); setSelectedRequestDetails(null); setMobileSidebarOpen(false); }}>
              <i data-lucide="file-text"></i> Reports
            </a>
          )}
          {(currentUser?.role === 'lab' || coverageState['lt-reagents']?.on) && (
            <a href="#" className={`nav-link ${activeTab === 'lab-inventory' ? 'active' : ''}`} onClick={(e) => { e.preventDefault(); setSelectedRequestDetails(null); setActiveTab('lab-inventory'); setMobileSidebarOpen(false); }}>
              <i data-lucide="package"></i> Inventory
            </a>
          )}
          {(currentUser?.role === 'lab' || currentUser?.role === 'admin' || coverageState['lt-queue']?.on) && (
            <a href="#" className={`nav-link ${activeTab === 'lab-catalog' ? 'active' : ''}`} onClick={(e) => { e.preventDefault(); setSelectedRequestDetails(null); setActiveTab('lab-catalog'); setMobileSidebarOpen(false); }}>
              <i data-lucide="tag"></i> Test Catalog & Prices
            </a>
          )}

          {/* DYNAMIC COVERAGE INTEGRATION LINKS */}
          {(Object.keys(coverageState || {}).some(k => k.startsWith('rc-') && coverageState[k]?.on)) && tenantModules.reception?.enabled !== false && (
            <a href="#" className="nav-link" onClick={(e) => { e.preventDefault(); window.open('/receptionist', '_blank'); setMobileSidebarOpen(false); }} style={{ color: '#E11D48', fontWeight: 800 }}>
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '8px', flexShrink: 0 }}><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/></svg>
              Receptionist Cover
            </a>
          )}
          {(Object.keys(coverageState || {}).some(k => k.startsWith('ph-') && coverageState[k]?.on)) && tenantModules.pharmacy?.enabled !== false && (
            <a href="#" className="nav-link" onClick={(e) => { e.preventDefault(); window.open('/pharmacy', '_blank'); setMobileSidebarOpen(false); }} style={{ color: '#2563EB', fontWeight: 800 }}>
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '8px', flexShrink: 0 }}><path d="M12 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
              Pharmacy Cover
            </a>
          )}
        </nav>

        {/* User Profile at bottom of Sidebar */}
        <div className="sidebar-user" onClick={(e) => { e.stopPropagation(); setShowProfileMenu(!showProfileMenu); }}>
          {currentUser.avatar ? (
            <img 
              src={currentUser.avatar} 
              alt="Sunny avatar" 
              className="user-avatar" 
              style={{ width: '40px', height: '40px', borderRadius: '50%', objectFit: 'cover', border: '2px solid #BFDBFE' }}
            />
          ) : (
            <div className="sidebar-user-avatar-initials" style={{ width: '40px', height: '40px', borderRadius: '50%', background: 'linear-gradient(135deg, #EC4899 0%, #D946EF 100%)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: '14px', marginRight: '10px', flexShrink: 0 }}>
              {currentUser.name ? currentUser.name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase() : 'LT'}
            </div>
          )}
          <div className="user-info" style={{ flex: 1 }}>
            <div className="name">{currentUser.name || 'Sunny'}</div>
            <div className="role">Lab Technician</div>
          </div>
          <i data-lucide="chevron-down" style={{ marginLeft: 'auto', width: '16px', color: '#94A3B8', transition: '0.3s', transform: showProfileMenu ? 'rotate(180deg)' : 'none' }}></i>

          {showProfileMenu && (
            <div 
              className="glass-card sidebar-profile-popover" 
              style={{ 
                position: 'absolute', 
                bottom: '72px', 
                left: '0px', 
                width: '208px', 
                zIndex: 3000, 
                padding: '8px', 
                boxShadow: '0 -10px 40px rgba(0,0,0,0.06)', 
                background: 'white',
                borderRadius: '12px',
                border: '1px solid #F1F5F9',
                animation: 'slideUp 0.2s ease-out'
              }}
              onClick={e => e.stopPropagation()}
            >
              <div style={{ padding: '10px 12px', borderBottom: '1px solid #F1F5F9', marginBottom: '6px' }}>
                <div style={{ fontWeight: 800, fontSize: '13.5px', color: '#0F172A' }}>{currentUser.name || 'Sunny'}</div>
                <div style={{ fontSize: '11px', color: '#64748B', fontWeight: 600 }}>Lab Technician</div>
              </div>
              <div 
                style={{ 
                  padding: '10px 12px', 
                  borderRadius: '8px', 
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
                onClick={() => {
                  setShowProfileEditModal(true);
                  setShowProfileMenu(false);
                }}
              >
                <i data-lucide="user" style={{ width: '16px', height: '16px' }}></i> Edit Profile
              </div>
              <div 
                style={{ 
                  padding: '10px 12px', 
                  borderRadius: '8px', 
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
                onClick={() => {
                  setActiveTab('hr-payroll');
                  setShowProfileMenu(false);
                }}
              >
                <i data-lucide="credit-card" style={{ width: '16px', height: '16px' }}></i> HR & Payroll
              </div>
              <div 
                style={{ 
                  padding: '10px 12px', 
                  borderRadius: '8px', 
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
                onClick={handleLogout}
              >
                <i data-lucide="log-out" style={{ width: '16px', height: '16px' }}></i> Logout
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

      {/* Header / Top Navigation */}
      {activeTab !== 'hr-payroll' && (
        <div className={"top-nav " + (isSidebarCollapsed ? "collapsed" : "")}>
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
            marginRight: 'auto'
          }}
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="4" x2="20" y1="12" y2="12"/><line x1="4" x2="20" y1="6" y2="6"/><line x1="4" x2="20" y1="18" y2="18"/></svg>
        </button>

        <div className="search-wrapper">
          <i data-lucide="search"></i>
          <input 
            type="text" 
            className="search-input" 
            placeholder="Search patient by mobile/ID"
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setCurrentPage(1);
            }}
          />
        </div>

        <div ref={notificationRef} style={{ position: 'relative' }}>
          <button 
            className="bell-icon-btn"
            onClick={() => {
              setShowNotifications(!showNotifications);
              setUnreadCount(0);
            }}
          >
            <i data-lucide="bell" style={{ width: '20px', height: '20px' }}></i>
            {unreadCount > 0 && <span className="bell-dot" style={{ background: '#EF4444' }}></span>}
          </button>

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

      {/* Main Content Area */}
      <div className={"main-content " + (activeTab === 'hr-payroll' ? "fullscreen-portal" : (isSidebarCollapsed ? "collapsed" : ""))} data-lenis-prevent>
        {successMessage && <div style={{ color: 'green', background: '#ECFDF5', border: '1px solid #A7F3D0', padding: '12px 20px', borderRadius: '12px', marginBottom: '24px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px' }}><i data-lucide="check-circle"></i>{successMessage}</div>}
        {errorMessage && <div style={{ color: 'red', background: '#FEF2F2', border: '1px solid #FCA5A5', padding: '12px 20px', borderRadius: '12px', marginBottom: '24px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px' }}><i data-lucide="alert-triangle"></i>{errorMessage}</div>}

        {activeTab === 'hr-payroll' && (
          <div className="tab-content active" style={{ animation: 'slideUp 0.4s ease-out', padding: 0 }}>
            <HRPayroll onExit={() => setActiveTab('lab-dash')} />
          </div>
        )}

        {/* PAGE-LEVEL DETAIL VIEW (Unlocked by clicking 'OPEN') */}
        {selectedRequestDetails ? (
          <div className="tab-content active" style={{ animation: 'slideUp 0.3s ease-out' }}>
            
            {/* Back Navigation Breadcrumb */}
            <div 
              style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '24px', cursor: 'pointer', color: '#64748B', fontSize: '13px', fontWeight: 700 }}
              onClick={() => setSelectedRequestDetails(null)}
            >
              <i data-lucide="arrow-left" style={{ width: '16px', height: '16px' }}></i>
              <span>Today's Tests</span>
              <span style={{ color: '#CBD5E1', fontSize: '12px' }}>&gt;</span>
              <span style={{ color: '#0F172A', fontWeight: 800 }}>Test Request #LR-{selectedRequestDetails._id.substring(18).toUpperCase()}</span>
            </div>

            {/* 1. Patient Info Card */}
            <div className="detail-card" style={{ display: 'flex', gap: '24px', alignItems: 'center' }}>
              <div style={{ width: '54px', height: '54px', borderRadius: '8px', background: '#EFF6FF', color: '#2563EB', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <i data-lucide="user" style={{ width: '26px', height: '26px' }}></i>
              </div>
              <div className="detail-meta-grid" style={{ flex: 1 }}>
                <div className="detail-meta-item">
                  <span className="detail-meta-label">Patient Name</span>
                  <span className="detail-meta-val" style={{ fontSize: '17px', fontWeight: 800 }}>{selectedRequestDetails.patientId?.name || 'N/A'}</span>
                </div>
                <div className="detail-meta-item">
                  <span className="detail-meta-label">Age / Gender</span>
                  <span className="detail-meta-val">{selectedRequestDetails.patientId?.age || '28'} Years / {selectedRequestDetails.patientId?.gender || 'Female'}</span>
                </div>
                <div className="detail-meta-item">
                  <span className="detail-meta-label">Mobile</span>
                  <span className="detail-meta-val">{selectedRequestDetails.patientId?.contact || '+91 98765 43210'}</span>
                </div>
                <div className="detail-meta-item">
                  <span className="detail-meta-label">ABHA ID</span>
                  <span className="detail-meta-val">{getAbhaId(selectedRequestDetails.patientId?.name, selectedRequestDetails.patientId?.email)}</span>
                </div>
              </div>
            </div>
 
            {/* Vitals Summary Card */}
            {(() => {
              const latestVital = patientVitals && patientVitals.length > 0 ? patientVitals[0] : null;
              return (
                <div className="detail-card" style={{ padding: '24px', background: 'white', border: '1px solid #E2E8F0', borderRadius: '12px', marginBottom: '24px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#2563EB" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
                      </svg>
                      <h3 style={{ fontSize: '15px', fontWeight: 900, color: '#2563EB', margin: 0 }}>Patient Vitals</h3>
                    </div>
                    <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                      <span 
                        style={{ fontSize: '11.5px', color: '#2563EB', fontWeight: 800, cursor: 'pointer', textDecoration: 'underline', display: 'flex', alignItems: 'center', gap: '4px' }}
                        onClick={() => {
                          setVitalTemp(latestVital?.temperature || '');
                          setVitalPulse(latestVital?.pulse || '');
                          setVitalBpSys(latestVital?.bpSys || '');
                          setVitalBpDia(latestVital?.bpDia || '');
                          setVitalResp(latestVital?.respiration || '');
                          setVitalSpo2(latestVital?.spo2 || '');
                          setVitalWeight(latestVital?.weight || '');
                          setVitalHeight(latestVital?.height || '');
                          setShowVitalsModal(true);
                        }}
                      >
                        Edit Vitals
                      </span>
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: '12px' }}>
                    {/* BP */}
                    <div style={{ background: '#F0FDF4', borderRadius: '10px', padding: '10px 8px', display: 'flex', flexDirection: 'column', gap: '4px', border: '1px solid #DCFCE7', alignItems: 'center', justifyContent: 'center' }}>
                      <div style={{ fontSize: '9px', color: '#16A34A', fontWeight: 800, textTransform: 'uppercase' }}>BP</div>
                      <div style={{ fontSize: '12px', fontWeight: 800, color: '#1A1D23' }}>
                        {latestVital && latestVital.bpSys ? `${latestVital.bpSys}/${latestVital.bpDia || ''}` : '--'} <span style={{ fontSize: '8px', color: '#64748B', fontWeight: 500 }}>mmHg</span>
                      </div>
                    </div>

                    {/* Heart Rate */}
                    <div style={{ background: '#FFF5F5', borderRadius: '10px', padding: '10px 8px', display: 'flex', flexDirection: 'column', gap: '4px', border: '1px solid #FEE2E2', alignItems: 'center', justifyContent: 'center' }}>
                      <div style={{ fontSize: '9px', color: '#EF4444', fontWeight: 800, textTransform: 'uppercase' }}>Heart Rate</div>
                      <div style={{ fontSize: '12px', fontWeight: 800, color: '#1A1D23' }}>
                        {latestVital && latestVital.pulse ? latestVital.pulse : '--'} <span style={{ fontSize: '8px', color: '#64748B', fontWeight: 500 }}>bpm</span>
                      </div>
                    </div>

                    {/* Temp */}
                    <div style={{ background: '#FFFBEB', borderRadius: '10px', padding: '10px 8px', display: 'flex', flexDirection: 'column', gap: '4px', border: '1px solid #FEF3C7', alignItems: 'center', justifyContent: 'center' }}>
                      <div style={{ fontSize: '9px', color: '#D97706', fontWeight: 800, textTransform: 'uppercase' }}>Temp</div>
                      <div style={{ fontSize: '12px', fontWeight: 800, color: '#1A1D23' }}>
                        {latestVital && latestVital.temperature ? latestVital.temperature : '--'} <span style={{ fontSize: '8px', color: '#64748B', fontWeight: 500 }}>°F</span>
                      </div>
                    </div>

                    {/* SpO2 */}
                    <div style={{ background: '#ECFDF5', borderRadius: '10px', padding: '10px 8px', display: 'flex', flexDirection: 'column', gap: '4px', border: '1px solid #D1FAE5', alignItems: 'center', justifyContent: 'center' }}>
                      <div style={{ fontSize: '9px', color: '#059669', fontWeight: 800, textTransform: 'uppercase' }}>SpO2</div>
                      <div style={{ fontSize: '12px', fontWeight: 800, color: '#1A1D23' }}>
                        {latestVital && latestVital.spo2 ? latestVital.spo2 : '--'} <span style={{ fontSize: '8px', color: '#64748B', fontWeight: 500 }}>%</span>
                      </div>
                    </div>

                    {/* Weight */}
                    <div style={{ background: '#EFF6FF', borderRadius: '10px', padding: '10px 8px', display: 'flex', flexDirection: 'column', gap: '4px', border: '1px solid #DBEAFE', alignItems: 'center', justifyContent: 'center' }}>
                      <div style={{ fontSize: '9px', color: '#3B82F6', fontWeight: 800, textTransform: 'uppercase' }}>Weight</div>
                      <div style={{ fontSize: '12px', fontWeight: 800, color: '#1A1D23' }}>
                        {latestVital && latestVital.weight ? latestVital.weight : '--'} <span style={{ fontSize: '8px', color: '#64748B', fontWeight: 500 }}>kg</span>
                      </div>
                    </div>

                    {/* Height */}
                    <div style={{ background: '#F5F5F7', borderRadius: '10px', padding: '10px 8px', display: 'flex', flexDirection: 'column', gap: '4px', border: '1px solid #E4E4E7', alignItems: 'center', justifyContent: 'center' }}>
                      <div style={{ fontSize: '9px', color: '#71717A', fontWeight: 800, textTransform: 'uppercase' }}>Height</div>
                      <div style={{ fontSize: '12px', fontWeight: 800, color: '#1A1D23' }}>
                        {latestVital && latestVital.height ? latestVital.height : '--'} <span style={{ fontSize: '8px', color: '#64748B', fontWeight: 500 }}>cm</span>
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid #F1F5F9', paddingTop: '10px', marginTop: '14px', fontSize: '10.5px', color: '#94A3B8', fontWeight: 700 }}>
                    <span>Last updated: {latestVital && latestVital.createdAt ? new Date(latestVital.createdAt).toLocaleDateString() : '--'}</span>
                    <span>By: {latestVital && latestVital.recordedBy?.name ? latestVital.recordedBy.name : '--'}</span>
                  </div>
                </div>
              );
            })()}

            {/* 2. Doctor Recommendation Card */}
            <div className="recommendation-card-custom detail-card" style={{ padding: 0 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 24px', borderBottom: '1px solid #E2E8F0' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 800, color: '#0F172A', fontSize: '14.5px' }}>
                  <i data-lucide="activity" style={{ color: '#2563EB', width: '18px', height: '18px' }}></i>
                  <span>Doctor Recommendation</span>
                </div>
                <span style={{ color: '#64748B', fontSize: '12.5px', fontWeight: 700 }}>
                  Ordered: {new Date(selectedRequestDetails.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}, {new Date(selectedRequestDetails.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
              <div style={{ padding: '24px' }}>
                <div style={{ marginBottom: '20px' }}>
                  <span className="detail-meta-label">Recommended By</span>
                  <div style={{ fontWeight: 800, color: '#1E293B', fontSize: '14px', marginTop: '4px' }}>
                    {selectedRequestDetails.doctorId?.name || 'Dr. Arvind Mukherjee'}
                  </div>
                  <div style={{ fontSize: '12px', color: '#64748B', fontWeight: 600 }}>Senior Cardiologist, Apollo Clinic</div>
                </div>

                <div>
                  <span className="detail-meta-label">Requested Tests</span>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px', marginTop: '10px' }}>
                    {(() => {
                      const spec = getTestSpecimenInfo(selectedRequestDetails.testName);
                      return (
                        <div className="specimen-badge-box">
                          <div className="specimen-code-icon">{spec.code}</div>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontWeight: 800, color: '#0F172A', fontSize: '13.5px' }}>{selectedRequestDetails.testName}</div>
                            <div style={{ fontSize: '11px', color: '#64748B', fontWeight: 600, marginTop: '2px' }}>{spec.desc}</div>
                          </div>
                          <i data-lucide="info" style={{ width: '16px', color: '#94A3B8' }}></i>
                        </div>
                      );
                    })()}
                  </div>
                </div>
              </div>
            </div>

            {/* 3. Sample Collection Pending / Collected block */}
            <div className="detail-card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '20px 24px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                <div style={{ 
                  width: '44px', 
                  height: '44px', 
                  borderRadius: '8px', 
                  background: selectedRequestDetails.status === 'Pending' ? '#EFF6FF' : '#ECFDF5', 
                  color: selectedRequestDetails.status === 'Pending' ? '#2563EB' : '#059669', 
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'center' 
                }}>
                  <i data-lucide={selectedRequestDetails.status === 'Pending' ? 'hourglass' : 'check'} style={{ width: '20px', height: '20px' }}></i>
                </div>
                <div>
                  <div style={{ fontWeight: 800, color: '#0F172A', fontSize: '14.5px' }}>
                    {selectedRequestDetails.status === 'Pending' ? 'Sample Collection Pending' : 'Sample Collected & Received'}
                  </div>
                  <div style={{ fontSize: '12.5px', color: '#64748B', fontWeight: 600, marginTop: '2px' }}>
                    {selectedRequestDetails.status === 'Pending' ? 'Waiting for phlebotomist to confirm collection.' : 'Sample received in laboratory. Standard specimen validation successfully completed.'}
                  </div>
                </div>
              </div>

              {selectedRequestDetails.status === 'Pending' && (
                <button 
                  className="btn btn-primary" 
                  style={{ height: '40px', padding: '0 20px', borderRadius: '8px', fontSize: '13px', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '8px' }}
                  onClick={() => handleCollectSample(selectedRequestDetails._id)}
                  disabled={loading}
                >
                  <i data-lucide="syringe"></i> Mark Sample Collected
                </button>
              )}
            </div>

            {/* 3.5. Supplementary Documents Upload */}
            {selectedRequestDetails.status !== 'Pending' && (
              <div className="detail-card" style={{ padding: '24px', marginBottom: '24px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                  <h3 style={{ fontSize: '14.5px', fontWeight: 800, color: '#0F172A', margin: 0 }}>Add Additional Documents <span style={{ color: '#64748B', fontSize: '13px', fontWeight: 600 }}>(Optional)</span></h3>
                </div>
                <div style={{ background: '#F8FAFC', border: '1px dashed #CBD5E1', padding: '20px', borderRadius: '12px' }}>
                  <div style={{ display: 'flex', gap: '16px', alignItems: 'flex-end', marginBottom: '16px' }}>
                    <div style={{ flex: 1 }}>
                      <label style={{ fontSize: '11px', fontWeight: 800, color: '#64748B', textTransform: 'uppercase', marginBottom: '6px', display: 'block' }}>Document Type</label>
                      <select 
                        className="form-control" 
                        value={supplementaryDocType} 
                        onChange={e => setSupplementaryDocType(e.target.value)}
                        style={{ width: '100%', height: '42px', borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '13px', fontWeight: 700, padding: '0 12px' }}
                      >
                        <option value="Raw Machine Data">Raw Machine Data</option>
                        <option value="Scanned Physical Chart">Scanned Physical Chart</option>
                        <option value="Instrument Output">Instrument Output</option>
                        <option value="Other">Other</option>
                      </select>
                    </div>
                    <div style={{ flex: 2 }}>
                      <label style={{ fontSize: '11px', fontWeight: 800, color: '#64748B', textTransform: 'uppercase', marginBottom: '6px', display: 'block' }}>Upload File</label>
                      <div style={{ display: 'flex', gap: '12px' }}>
                        <input 
                          type="file" 
                          id="lab-doc-upload"
                          className="form-control"
                          style={{ flex: 1, padding: '8px', height: '42px', fontSize: '13px', borderRadius: '8px', background: 'white' }}
                        />
                        <button 
                          type="button"
                          onClick={() => {
                            const fileInput = document.getElementById('lab-doc-upload');
                            if (fileInput.files.length > 0) {
                              setSupplementaryDocuments([...supplementaryDocuments, { type: supplementaryDocType, name: fileInput.files[0].name, size: (fileInput.files[0].size / 1024).toFixed(1) + ' KB' }]);
                              fileInput.value = '';
                            } else {
                              showToast('Please select a file to upload', 'error');
                            }
                          }}
                          style={{ padding: '0 20px', background: '#2563EB', color: 'white', border: 'none', borderRadius: '8px', fontWeight: 700, cursor: 'pointer', height: '42px' }}
                        >
                          Attach Document
                        </button>
                      </div>
                    </div>
                  </div>

                  {supplementaryDocuments.length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {supplementaryDocuments.map((doc, idx) => (
                        <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 16px', background: 'white', border: '1px solid #E2E8F0', borderRadius: '8px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                            <i data-lucide="file-text" style={{ width: '16px', color: '#64748B' }}></i>
                            <div>
                              <div style={{ fontSize: '13px', fontWeight: 700, color: '#0F172A' }}>{doc.name}</div>
                              <div style={{ fontSize: '11px', fontWeight: 600, color: '#64748B' }}>{doc.type} • {doc.size}</div>
                            </div>
                          </div>
                          <button 
                            type="button" 
                            onClick={() => setSupplementaryDocuments(supplementaryDocuments.filter((_, i) => i !== idx))}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#EF4444' }}
                          >
                            <i data-lucide="trash-2" style={{ width: '14px' }}></i>
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* 4. Upload Reports & Media (Disabled until sample is collected!) */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <h3 style={{ fontSize: '14.5px', fontWeight: 800, color: '#0F172A', margin: 0 }}>Upload Reports & Media</h3>
                {selectedRequestDetails.status === 'Pending' && (
                  <span style={{ fontSize: '12px', color: '#94A3B8', fontWeight: 700, fontStyle: 'italic' }}>
                    Unlock this section by collecting samples
                  </span>
                )}
              </div>

              <div 
                style={{ 
                  opacity: selectedRequestDetails.status === 'Pending' ? 0.5 : 1, 
                  pointerEvents: selectedRequestDetails.status === 'Pending' ? 'none' : 'auto',
                  transition: 'opacity 0.2s ease',
                  display: 'grid',
                  gridTemplateColumns: '1.2fr 0.8fr',
                  gap: '24px',
                  background: '#FFFFFF',
                  border: '1px solid #E2E8F0',
                  borderRadius: '12px',
                  padding: '24px',
                  marginBottom: '24px'
                }}
                className="mobile-stack"
              >
                {/* Left Column: Drag & Drop upload + Result Entries if In Progress */}
                <div>
                  <div className="upload-dashed-box" style={{ marginBottom: '24px' }}>
                    <i data-lucide="cloud" style={{ width: '40px', height: '40px', color: '#94A3B8' }}></i>
                    <div style={{ fontWeight: 800, color: '#334155', fontSize: '13.5px' }}>Click to upload or drag and drop</div>
                    <div style={{ fontSize: '11px', color: '#94A3B8', fontWeight: 600 }}>PDF, JPEG, PNG or DICOM (Max 50MB)</div>
                  </div>

                  {selectedRequestDetails.status === 'In Progress' && (
                    <div style={{ background: '#F8FAFC', padding: '20px', borderRadius: '12px', border: '1px solid #EFF6FF' }}>
                      <h4 style={{ fontSize: '12px', fontWeight: 800, color: '#0F172A', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '16px' }}>Test Parameters</h4>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                          <span style={{ flex: 1, fontWeight: 700, fontSize: '13px', color: '#475569' }}>Hemoglobin</span>
                          <input 
                            type="text" 
                            className="form-control" 
                            style={{ width: '120px', height: '36px', background: 'white' }} 
                            placeholder="e.g. 14.2" 
                            value={paramVals.hemoglobin}
                            onChange={(e) => setParamVals({ ...paramVals, hemoglobin: e.target.value })}
                          />
                          <span style={{ fontSize: '11px', color: '#94A3B8', width: '90px', textAlign: 'right', fontWeight: 600 }}>12.0 - 16.0 g/dL</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                          <span style={{ flex: 1, fontWeight: 700, fontSize: '13px', color: '#475569' }}>WBC Count</span>
                          <input 
                            type="text" 
                            className="form-control" 
                            style={{ width: '120px', height: '36px', background: 'white' }} 
                            placeholder="e.g. 7.2" 
                            value={paramVals.wbc}
                            onChange={(e) => setParamVals({ ...paramVals, wbc: e.target.value })}
                          />
                          <span style={{ fontSize: '11px', color: '#94A3B8', width: '90px', textAlign: 'right', fontWeight: 600 }}>4.0 - 11.0 k/µL</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                          <span style={{ flex: 1, fontWeight: 700, fontSize: '13px', color: '#475569' }}>Platelet Count</span>
                          <input 
                            type="text" 
                            className="form-control" 
                            style={{ width: '120px', height: '36px', background: 'white' }} 
                            placeholder="e.g. 250" 
                            value={paramVals.platelets}
                            onChange={(e) => setParamVals({ ...paramVals, platelets: e.target.value })}
                          />
                          <span style={{ fontSize: '11px', color: '#94A3B8', width: '90px', textAlign: 'right', fontWeight: 600 }}>150 - 450 k/µL</span>
                        </div>
                      </div>
                    </div>
                  )}

                  {selectedRequestDetails.status === 'Completed' && (
                    <div style={{ background: '#F0FDF4', padding: '20px', borderRadius: '12px', border: '1px solid #BBF7D0' }}>
                      <h4 style={{ fontSize: '12px', fontWeight: 800, color: '#047857', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '12px' }}>Finalized Parameters</h4>
                      {(() => {
                        const parsed = parseResults(selectedRequestDetails.results);
                        return (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '13px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ fontWeight: 600 }}>Hemoglobin</span><b style={{ color: '#0F172A' }}>{parsed.parameters?.hemoglobin ? `${parsed.parameters.hemoglobin} g/dL` : 'N/A'}</b></div>
                            <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ fontWeight: 600 }}>WBC Count</span><b style={{ color: '#0F172A' }}>{parsed.parameters?.wbc ? `${parsed.parameters.wbc} k/µL` : 'N/A'}</b></div>
                            <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ fontWeight: 600 }}>Platelet Count</span><b style={{ color: '#0F172A' }}>{parsed.parameters?.platelets ? `${parsed.parameters.platelets} k/µL` : 'N/A'}</b></div>
                          </div>
                        );
                      })()}
                    </div>
                  )}
                </div>

                {/* Right Column: Remarks + Controls */}
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <span className="detail-meta-label" style={{ marginBottom: '8px' }}>Technician Notes</span>
                  <textarea 
                    className="form-control" 
                    style={{ flex: 1, minHeight: '120px', background: '#FFFFFF', border: '1px solid #CBD5E1', borderRadius: '8px', padding: '12px', fontSize: '13px', outline: 'none', resize: 'none' }}
                    placeholder="Add observations or special remarks here..."
                    value={remarks}
                    onChange={(e) => setRemarks(e.target.value)}
                    disabled={selectedRequestDetails.status === 'Completed'}
                  ></textarea>

                  {selectedRequestDetails.status === 'In Progress' && (
                    <div style={{ display: 'flex', gap: '12px', marginTop: '16px' }}>
                      <button 
                        className="btn btn-secondary" 
                        style={{ flex: 1, height: '40px', borderRadius: '8px', fontSize: '13px', fontWeight: 800, justifyContent: 'center' }}
                        onClick={() => handleSaveDraft(selectedRequestDetails._id)}
                      >
                        Save Draft
                      </button>
                      <button 
                        className="btn btn-primary" 
                        style={{ flex: 1, height: '40px', borderRadius: '8px', fontSize: '13px', fontWeight: 800, justifyContent: 'center' }}
                        onClick={() => handleFinalizeReport(selectedRequestDetails._id)}
                      >
                        Finalize & Dispatch
                      </button>
                    </div>
                  )}

                  {selectedRequestDetails.status === 'Completed' && (
                    <div style={{ marginTop: '16px' }}>
                      <button 
                        className="btn btn-primary" 
                        style={{ width: '100%', height: '40px', borderRadius: '8px', fontSize: '13px', fontWeight: 800, justifyContent: 'center' }}
                        onClick={() => window.print()}
                      >
                        Print Report PDF
                      </button>
                    </div>
                  )}
                </div>

              </div>
            </div>

          </div>
        ) : (
          /* REGULAR TABS LIST VIEWS */
          <>
            {/* Tab 1: Laboratory Overview */}
            {activeTab === 'lab-dash' && (
              <div className="tab-content active" style={{ animation: 'slideUp 0.4s ease-out' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '32px' }}>
                  <div>
                    <h1 style={{ fontSize: '28px', fontWeight: 900, color: '#0F172A', fontFamily: "'Outfit', sans-serif", margin: '0 0 4px 0' }}>Laboratory Overview</h1>
                    <p style={{ color: '#64748B', fontWeight: 600, fontSize: '13.5px', margin: 0 }}>
                      Live operational metrics for Today, {selectedDate ? new Date(selectedDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : todayStr}
                    </p>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', position: 'relative' }}>
                    {selectedDate && (
                      <button 
                        onClick={() => setSelectedDate('')} 
                        style={{ fontSize: '12px', background: '#F1F5F9', border: '1px solid #E2E8F0', padding: '6px 12px', borderRadius: '6px', cursor: 'pointer', fontWeight: 700, color: '#64748B' }}
                      >
                        Clear Date Filter ×
                      </button>
                    )}
                    <button className="calendar-btn" onClick={() => setShowDatePicker(!showDatePicker)}>
                      <i data-lucide="calendar"></i>
                    </button>
                    {showDatePicker && (
                      <div className="glass-card animate-in" style={{ position: 'absolute', top: '48px', right: 0, zIndex: 1200, padding: '16px', width: '220px', background: 'white', border: '1px solid #E2E8F0', borderRadius: '12px', boxShadow: '0 10px 25px rgba(0,0,0,0.08)' }}>
                        <label style={labelStyle}>Select Date</label>
                        <input 
                          type="date" 
                          style={inputStyle} 
                          value={selectedDate} 
                          onChange={(e) => {
                            setSelectedDate(e.target.value);
                            setShowDatePicker(false);
                          }} 
                        />
                      </div>
                    )}
                  </div>
                </div>

                {/* KPI Metrics Dashboard Grid */}
                <div className="kpi-container-custom">
                  <div className="kpi-card-custom semantic-card-info">
                    <div className="kpi-icon-box-custom" style={{ background: '#EFF6FF', color: '#2563EB' }}>
                      <i data-lucide="plus-circle" style={{ width: '22px', height: '22px' }}></i>
                    </div>
                    <div className="kpi-inner-content">
                      <div className="kpi-title-custom">New Requests</div>
                      <div className="kpi-value-custom">{uniqueLabRequests.filter(r => r.status === 'Pending').length}</div>
                    </div>
                  </div>

                  <div className="kpi-card-custom semantic-card-info">
                    <div className="kpi-icon-box-custom" style={{ background: '#FFFBEB', color: '#D97706' }}>
                      <i data-lucide="refresh-cw" style={{ width: '20px', height: '20px' }}></i>
                    </div>
                    <div className="kpi-inner-content">
                      <div className="kpi-title-custom">In Progress</div>
                      <div className="kpi-value-custom">
                        {uniqueLabRequests.filter(r => r.status === 'In Progress' && !parseResults(r.results).isDraft).length}
                      </div>
                    </div>
                  </div>

                  <div className="kpi-card-custom semantic-card-info">
                    <div className="kpi-icon-box-custom" style={{ background: '#ECFDF5', color: '#059669' }}>
                      <i data-lucide="check-circle" style={{ width: '22px', height: '22px' }}></i>
                    </div>
                    <div className="kpi-inner-content">
                      <div className="kpi-title-custom">Completed Today</div>
                      <div className="kpi-value-custom">{uniqueLabRequests.filter(r => r.status === 'Completed').length}</div>
                    </div>
                  </div>

                  <div className="kpi-card-custom semantic-card-info">
                    <div className="kpi-icon-box-custom" style={{ background: '#FEF2F2', color: '#DC2626' }}>
                      <i data-lucide="alert-circle" style={{ width: '22px', height: '22px' }}></i>
                    </div>
                    <div className="kpi-inner-content">
                      <div className="kpi-title-custom">Pending Reports</div>
                      <div className="kpi-value-custom">
                        {uniqueLabRequests.filter(r => r.status === 'In Progress' && parseResults(r.results).isDraft).length}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Recent Lab Tests Table Card */}
                <div className="glass-card" style={{ padding: 0, overflow: 'hidden' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '24px 24px 8px' }}>
                    <h3 style={{ fontWeight: 800, fontSize: '17px', color: '#0F172A', margin: 0 }}>Recent Lab Tests</h3>
                    <button 
                      style={{ color: '#2563EB', fontWeight: 700, fontSize: '13px', background: 'none', border: 'none', cursor: 'pointer' }}
                      onClick={() => {
                        setActiveTab('lab-requests');
                        setDateFilter('All');
                      }}
                    >
                      View All Records
                    </button>
                  </div>
                  <div className="table-responsive">
                    <table className="elite-table-custom">
                      <thead>
                        <tr>
                          <th>Patient Name</th>
                          <th>Test Type</th>
                          <th>Assigned Lab</th>
                          <th>Status</th>
                          <th>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredRequests.slice(0, 8).map(req => {
                          const avatar = getAvatarStyle(req.patientId?.name);
                          return (
                            <tr key={req._id}>
                              <td>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                  <div className="avatar-circle-initials" style={{ background: avatar.bg, color: avatar.text }}>
                                    {avatar.initials}
                                  </div>
                                  <span style={{ fontWeight: 750, color: '#0F172A' }}>{req.patientId?.name || 'N/A'}</span>
                                </div>
                              </td>
                              <td>
                                <span style={{ fontWeight: 600, color: '#334155' }}>{req.testName}</span>
                              </td>
                              <td>
                                <span style={{ fontWeight: 600, color: '#64748B' }}>{getAssignedLab(req.testName)}</span>
                              </td>
                              <td>
                                {renderStatusBadge(req.status, req.results)}
                              </td>
                              <td>
                                <button className="details-link-btn" onClick={() => handleOpenDetails(req)}>
                                  View Details
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                        {filteredRequests.length === 0 && (
                          <tr>
                            <td colSpan="5" style={{ textAlign: 'center', padding: '40px', color: '#64748B', fontWeight: 600 }}>
                              No lab test requests matching the criteria.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {/* Tab 2: Lab Requests List (With Filters and Pagination) */}
            {activeTab === 'lab-requests' && (
              <div className="tab-content active" style={{ animation: 'slideUp 0.4s ease-out' }}>
                {/* Filters Bar */}
                <div className="lab-requests-filters-bar-custom" style={{
                  background: '#FFFFFF',
                  border: '1px solid #E2E8F0',
                  borderRadius: '8px',
                  padding: '12px 24px',
                  marginBottom: '24px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  boxShadow: '0 4px 12px rgba(0, 0, 0, 0.01)'
                }}>
                  <div className="lab-requests-filters-inner-custom" style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                    <span style={{ fontSize: '12px', fontWeight: 800, color: '#475569', letterSpacing: '0.5px' }}>FILTERS:</span>
                    
                    <select 
                      className="filter-select-custom"
                      value={statusFilter}
                      onChange={(e) => {
                        setStatusFilter(e.target.value);
                        setCurrentPage(1);
                      }}
                    >
                      <option value="All">Status: All</option>
                      <option value="Pending">Status: Pending Sample</option>
                      <option value="Sample Collected">Status: Sample Collected</option>
                      <option value="Report Pending">Status: Report Pending</option>
                      <option value="Completed">Status: Completed</option>
                    </select>

                    <select 
                      className="filter-select-custom"
                      value={dateFilter}
                      onChange={(e) => {
                        setDateFilter(e.target.value);
                        setCurrentPage(1);
                      }}
                    >
                      <option value="All">Date: All</option>
                      <option value="Today">Date: Today</option>
                      <option value="Yesterday">Date: Yesterday</option>
                      <option value="Week">Date: Last 7 Days</option>
                    </select>
                  </div>

                  <button 
                    onClick={() => {
                      fetchData();
                      setSuccessMessage("Database records updated successfully!");
                      setTimeout(() => setSuccessMessage(''), 2000);
                    }}
                    style={{
                      width: '36px',
                      height: '36px',
                      background: '#FFFFFF',
                      border: '1px solid #CBD5E1',
                      borderRadius: '6px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer',
                      color: '#475569',
                      transition: 'all 0.2s'
                    }}
                    title="Refresh Requests"
                    onMouseEnter={(e) => e.currentTarget.style.background = '#F8FAFC'}
                    onMouseLeave={(e) => e.currentTarget.style.background = '#FFFFFF'}
                  >
                    <i data-lucide="refresh-cw" style={{ width: '16px', height: '16px' }}></i>
                  </button>
                </div>

                {/* Requests Table Box */}
                <div className="glass-card" style={{ padding: 0, overflow: 'hidden' }}>
                  <div className="table-responsive">
                    <table className="elite-table-custom">
                      <thead>
                        <tr>
                          <th>Patient Name</th>
                          <th>Doctor Name</th>
                          <th>Test Type</th>
                          <th>Requested</th>
                          <th>Status</th>
                          <th>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {paginatedRequests.map(req => {
                          const reqTime = new Date(req.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                          return (
                            <tr key={req._id}>
                              <td>
                                <div>
                                  <div style={{ fontWeight: 800, color: '#0F172A', fontSize: '14px' }}>{req.patientId?.name || 'N/A'}</div>
                                  <div style={{ fontSize: '11px', color: '#94A3B8', marginTop: '2px', fontWeight: 600 }}>
                                    ID: #LAB-{req._id.substring(18).toUpperCase()} • {req.patientId?.gender || 'N/A'}, {req.patientId?.age || 'N/A'}
                                  </div>
                                </div>
                              </td>
                              <td>
                                <span style={{ fontWeight: 700, color: '#334155' }}>{req.doctorId?.name || 'N/A'}</span>
                              </td>
                              <td>
                                <span style={{ 
                                  background: '#F1F5F9', 
                                  color: '#475569', 
                                  borderRadius: '4px', 
                                  padding: '4px 8px', 
                                  fontSize: '12px', 
                                  fontWeight: 700 
                                }}>
                                  {req.testName}
                                </span>
                              </td>
                              <td>
                                <span style={{ fontWeight: 600, color: '#475569' }}>{reqTime}</span>
                              </td>
                              <td>
                                {renderStatusBadge(req.status, req.results)}
                              </td>
                              <td>
                                <button className="open-btn-custom" onClick={() => handleOpenDetails(req)}>
                                  OPEN
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                        {paginatedRequests.length === 0 && (
                          <tr>
                            <td colSpan="6" style={{ textAlign: 'center', padding: '40px', color: '#64748B', fontWeight: 600 }}>
                              No requests match the selected filters.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>

                  {/* Table Footer with Pagination matching the second screenshot */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 24px', borderTop: '1px solid #E2E8F0' }}>
                    <div style={{ fontSize: '13px', color: '#64748B', fontWeight: 600 }}>
                      Showing {paginatedRequests.length > 0 ? (currentPage - 1) * rowsPerPage + 1 : 0} - {Math.min(currentPage * rowsPerPage, filteredRequests.length)} of {filteredRequests.length} tests
                    </div>
                    <div style={{ display: 'flex', gap: '4px' }}>
                      <button 
                        disabled={currentPage === 1}
                        onClick={() => setCurrentPage(prev => prev - 1)}
                        className="page-btn"
                        style={{ opacity: currentPage === 1 ? 0.5 : 1 }}
                      >
                        <i data-lucide="chevron-left" style={{ width: '14px', height: '14px' }}></i>
                      </button>
                      {Array.from({ length: totalPages }, (_, i) => i + 1).map(pageNum => (
                        <button 
                          key={pageNum}
                          className={`page-btn ${currentPage === pageNum ? 'active' : ''}`}
                          onClick={() => setCurrentPage(pageNum)}
                        >
                          {pageNum}
                        </button>
                      ))}
                      <button 
                        disabled={currentPage === totalPages}
                        onClick={() => setCurrentPage(prev => prev + 1)}
                        className="page-btn"
                        style={{ opacity: currentPage === totalPages ? 0.5 : 1 }}
                      >
                        <i data-lucide="chevron-right" style={{ width: '14px', height: '14px' }}></i>
                      </button>
                    </div>
                  </div>

                </div>
              </div>
            )}

            {/* Tab 3: Reports Vault / Repository (Screenshot 4) */}
            {activeTab === 'lab-reports' && (
              <div className="tab-content active" style={{ animation: 'slideUp 0.4s ease-out' }}>
                
                {/* Title and stats layout */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '32px' }} className="mobile-stack">
                  <div>
                    <h1 style={{ fontSize: '28px', fontWeight: 950, color: '#0F172A', fontFamily: "'Outfit', sans-serif", margin: '0 0 4px 0' }}>Reports Repository</h1>
                    <p style={{ color: '#64748B', fontWeight: 600, fontSize: '13.5px', margin: 0 }}>
                      Access all completed clinical diagnostics and uploaded PDF reports.
                    </p>
                  </div>
                  
                  {/* KPI stats blocks */}
                  {(() => {
                    const displayTotalReports = labRequests.filter(r => r.status === 'Completed').length; // Real completed reports only.

                    const completedTodayDbCount = labRequests.filter(r => r.status === 'Completed' && new Date(r.updatedAt).toDateString() === new Date().toDateString()).length;
                    const displayUploadedToday = completedTodayDbCount;

                    return (
                      <div style={{ display: 'flex', gap: '16px' }}>
                        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '12px', padding: '16px 24px', minWidth: '160px', boxShadow: '0 4px 12px rgba(0, 0, 0, 0.01)' }}>
                          <div style={{ fontSize: '12.5px', fontWeight: 700, color: '#475569', marginBottom: '8px' }}>Total Reports</div>
                          <div style={{ fontSize: '28px', fontWeight: 900, color: '#2563EB', lineHeight: 1 }}>
                            {displayTotalReports.toLocaleString()}
                          </div>
                        </div>
                        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '12px', padding: '16px 24px', minWidth: '160px', boxShadow: '0 4px 12px rgba(0, 0, 0, 0.01)' }}>
                          <div style={{ fontSize: '12.5px', fontWeight: 700, color: '#475569', marginBottom: '8px' }}>Uploaded Today</div>
                          <div style={{ fontSize: '28px', fontWeight: 900, color: '#2563EB', lineHeight: 1 }}>
                            {displayUploadedToday}
                          </div>
                        </div>
                      </div>
                    );
                  })()}
                </div>

                {/* Filters Row */}
                <div className="reports-filters-container-custom">
                  <div style={{ width: '100%' }}>
                    <label>Patient Search</label>
                    <div className="reports-filter-input-wrapper">
                      <i data-lucide="user"></i>
                      <input 
                        type="text" 
                        style={inputStyle} 
                        className="reports-filter-input"
                        placeholder="Search by name or ID..."
                        value={repPatientSearch}
                        onChange={e => setRepPatientSearch(e.target.value)}
                      />
                    </div>
                  </div>

                  <div style={{ width: '100%' }}>
                    <label>Test Type</label>
                    <select 
                      style={inputStyle}
                      value={repTestTypeFilter}
                      onChange={e => setRepTestTypeFilter(e.target.value)}
                    >
                      <option value="All">All Test Types</option>
                      {uniqueTestTypes.map(tName => (
                        <option key={tName} value={tName}>{tName}</option>
                      ))}
                    </select>
                  </div>

                  <div style={{ width: '100%' }}>
                    <label>Date Range</label>
                    <div className="date-select-wrapper" style={{ position: 'relative' }}>
                      <select 
                        style={{ ...inputStyle, paddingLeft: '36px' }}
                        value={repDateRangeFilter}
                        onChange={e => setRepDateRangeFilter(e.target.value)}
                      >
                        <option value="Last 30 Days">Last 30 Days</option>
                        <option value="Last 7 Days">Last 7 Days</option>
                        <option value="Today">Today</option>
                        <option value="All Time">All Time</option>
                      </select>
                      <i data-lucide="calendar"></i>
                    </div>
                  </div>

                  <button 
                    className="btn btn-primary"
                    style={{ height: '44px', padding: '0 24px', borderRadius: '8px', fontSize: '13.5px', fontWeight: 800, background: '#2563EB', color: 'white', border: 'none', cursor: 'pointer' }}
                    onClick={() => {
                      setAppliedRepFilters({
                        patient: repPatientSearch,
                        testType: repTestTypeFilter,
                        dateRange: repDateRangeFilter
                      });
                      setRepCurrentPage(1);
                    }}
                  >
                    Apply Filters
                  </button>
                </div>

                {/* Completed Reports Table Card */}
                <div className="glass-card" style={{ padding: 0, overflow: 'hidden', border: '1px solid #E2E8F0', background: 'white', borderRadius: '12px' }}>
                  <div className="table-responsive">
                    <table className="elite-table-custom">
                      <thead>
                        <tr>
                          <th>Patient Name</th>
                          <th>Test Type</th>
                          <th>Status</th>
                          <th>Uploaded By</th>
                          <th>Upload Date</th>
                          <th>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {repPaginatedRequests.map(req => {
                          const testCode = getTestSpecimenInfo(req.testName).code;
                          
                          // Formatting date as "Oct 24, 2023 • 09:15 AM"
                          const formatReportDate = (dateStr) => {
                            const date = new Date(dateStr);
                            const datePart = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
                            let hours = date.getHours();
                            const minutes = date.getMinutes().toString().padStart(2, '0');
                            const ampm = hours >= 12 ? 'AM' : 'PM';
                            hours = hours % 12;
                            hours = hours ? hours : 12;
                            const hourStr = hours.toString().padStart(2, '0');
                            return `${datePart} • ${hourStr}:${minutes} ${ampm}`;
                          };

                          const isUrgent = req.isUrgent;
                          const uploadedBy = req.uploadedBy || req.doctorId?.name || 'Dr. James Wilson';
                          
                          return (
                            <tr key={req._id}>
                              <td>
                                <div>
                                  <div style={{ fontWeight: 800, color: '#0F172A', fontSize: '14px' }}>{req.patientId?.name || 'N/A'}</div>
                                  <div style={{ fontSize: '11px', color: '#94A3B8', marginTop: '2px', fontWeight: 600 }}>
                                    ID: {req.customId || `LAB-${req._id.substring(18).toUpperCase()}`}
                                  </div>
                                </div>
                              </td>
                              <td>
                                <span style={{ fontWeight: 700, color: '#334155' }}>
                                  {req.testName} {testCode && `(${testCode})`}
                                </span>
                              </td>
                              <td>
                                {isUrgent ? (
                                  <span className="status-badge-urgent-custom">
                                    URGENT
                                  </span>
                                ) : (
                                  <span className="status-badge-completed-custom">
                                    COMPLETED
                                  </span>
                                )}
                              </td>
                              <td>
                                <span style={{ fontWeight: 700, color: '#334155' }}>
                                  {uploadedBy}
                                </span>
                              </td>
                              <td>
                                <span style={{ fontWeight: 600, color: '#64748B' }}>
                                  {formatReportDate(req.updatedAt || req.createdAt)}
                                </span>
                              </td>
                              <td>
                                <button 
                                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748B', padding: '4px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
                                  onClick={() => handleOpenDetails(req)}
                                  title="Download Report"
                                >
                                  <i data-lucide="download" style={{ width: '18px', height: '18px' }}></i>
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                        {repPaginatedRequests.length === 0 && (
                          <tr>
                            <td colSpan="6" style={{ textAlign: 'center', padding: '40px', color: '#64748B', fontWeight: 600 }}>
                              No completed reports match the filter criteria.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>

                  {/* Reports Pagination Footer */}
                  {(() => {
                    const baseTotalReports = 1269;
                    const completedDbCount = labRequests.filter(r => r.status === 'Completed').length;
                    const displayTotalReports = baseTotalReports + 15 + completedDbCount;

                    return (
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 24px', borderTop: '1px solid #E2E8F0' }}>
                        <div style={{ fontSize: '13px', color: '#64748B', fontWeight: 600 }}>
                          Showing {(repCurrentPage - 1) * rowsPerPage + 1} to {Math.min(repCurrentPage * rowsPerPage, displayTotalReports)} of {displayTotalReports.toLocaleString()} reports
                        </div>
                        <div style={{ display: 'flex', gap: '4px' }}>
                          <button 
                            disabled={repCurrentPage === 1}
                            onClick={() => setRepCurrentPage(prev => prev - 1)}
                            className="page-btn"
                            style={{ width: 'auto', padding: '0 10px', opacity: repCurrentPage === 1 ? 0.5 : 1 }}
                          >
                            Previous
                          </button>
                          {Array.from({ length: repTotalPages }, (_, i) => i + 1).map(pageNum => (
                            <button 
                              key={pageNum}
                              className={`page-btn ${repCurrentPage === pageNum ? 'active' : ''}`}
                              onClick={() => setRepCurrentPage(pageNum)}
                            >
                              {pageNum}
                            </button>
                          ))}
                          <button 
                            disabled={repCurrentPage === repTotalPages}
                            onClick={() => setRepCurrentPage(prev => prev + 1)}
                            className="page-btn"
                            style={{ width: 'auto', padding: '0 10px', opacity: repCurrentPage === repTotalPages ? 0.5 : 1 }}
                          >
                            Next
                          </button>
                        </div>
                      </div>
                    );
                  })()}

                </div>

              </div>
            )}

            {/* Tab 4: Lab Inventory */}
            {activeTab === 'lab-inventory' && (
              <div className="tab-content active" style={{ animation: 'slideUp 0.4s ease-out' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                  <h1 style={{ fontSize: '26px', fontWeight: 900, margin: 0, color: '#0F172A' }}>Lab Inventory</h1>
                  <button className="btn btn-primary" onClick={handleOpenAddLabItem}><i data-lucide="plus"></i> Add Item</button>
                </div>
                <div className="glass-card" style={{ padding: 0, overflow: 'hidden' }}>
                  <div className="table-responsive">
                    <table className="elite-table-custom">
                      <thead>
                        <tr>
                          <th>Item</th>
                          <th>Category</th>
                          <th>Stock Level</th>
                          <th>Alert Threshold</th>
                          <th>Status</th>
                          <th>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {labInventory.map(item => (
                          <tr key={item._id || item.id}>
                            <td><span style={{ fontWeight: 750 }}>{item.name}</span></td>
                            <td><span style={{ fontWeight: 600, color: '#334155' }}>{item.category}</span></td>
                            <td style={{ fontWeight: 700 }}>{item.stock} {item.unit}</td>
                            <td>{item.threshold} {item.unit}</td>
                            <td>
                              <span className={`status-badge ${item.status === 'Healthy' ? 'available' : 'critical'}`}>
                                {item.status}
                              </span>
                            </td>
                            <td>
                              <div style={{ display: 'flex', gap: '8px' }}>
                                <button className="btn btn-secondary" style={{ padding: '6px 12px', fontSize: '11px' }} onClick={() => handleOpenEditLabItem(item)}>Edit</button>
                                <button className="btn btn-secondary" style={{ padding: '6px 12px', fontSize: '11px' }} onClick={() => handleOpenRestockLabItem(item)}>Restock</button>
                                <button className="btn btn-secondary" style={{ padding: '6px 12px', fontSize: '11px', color: 'var(--danger)', borderColor: '#FECACA' }} onClick={() => handleDeleteLabItem(item._id || item.id)}>Delete</button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {/* TAB: RECEPTIONIST DYNAMIC COVERAGE */}
            {activeTab === 'receptionist_cover' && (
              <div className="tab-content active" style={{ animation: 'slideUp 0.4s ease-out', padding: '24px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
                  <div>
                    <h2 style={{ fontSize: '20px', fontWeight: 800, color: '#0F172A', margin: '0 0 4px 0' }}>Receptionist Active Coverage</h2>
                    <p style={{ fontSize: '13px', color: '#64748B', margin: 0, fontWeight: 600 }}>Emergency Front Desk Duty Coverage. Manage patients queue, register new OPD visits and clear billing logs.</p>
                  </div>
                  <span className="badge-pill new" style={{ background: '#FFE4E6', color: '#E11D48', padding: '6px 12px', fontSize: '11px', fontWeight: 800 }}>
                    ● Active Receptionist Coverage
                  </span>
                </div>

                {/* Sub-navigation inside coverage */}
                <div style={{ display: 'flex', gap: '8px', borderBottom: '1px solid #E2E8F0', paddingBottom: '12px', marginBottom: '24px' }}>
                  {coverageState['rc-queue']?.on && (
                    <button 
                      type="button"
                      className={`btn-view-detail ${receptionistSubTab === 'queue' ? 'active' : ''}`}
                      onClick={() => setReceptionistSubTab('queue')}
                      style={{ background: receptionistSubTab === 'queue' ? '#E11D48' : 'transparent', color: receptionistSubTab === 'queue' ? 'white' : '#64748B', border: 'none', padding: '8px 16px', borderRadius: '8px', fontWeight: 700, cursor: 'pointer' }}
                    >
                      Token Queue
                    </button>
                  )}
                  {coverageState['rc-appt']?.on && (
                    <button 
                      type="button"
                      className={`btn-view-detail ${receptionistSubTab === 'appt' ? 'active' : ''}`}
                      onClick={() => setReceptionistSubTab('appt')}
                      style={{ background: receptionistSubTab === 'appt' ? '#E11D48' : 'transparent', color: receptionistSubTab === 'appt' ? 'white' : '#64748B', border: 'none', padding: '8px 16px', borderRadius: '8px', fontWeight: 700, cursor: 'pointer' }}
                    >
                      Appointments
                    </button>
                  )}
                  {coverageState['rc-register']?.on && (
                    <button 
                      type="button"
                      className={`btn-view-detail ${receptionistSubTab === 'register' ? 'active' : ''}`}
                      onClick={() => setReceptionistSubTab('register')}
                      style={{ background: receptionistSubTab === 'register' ? '#E11D48' : 'transparent', color: receptionistSubTab === 'register' ? 'white' : '#64748B', border: 'none', padding: '8px 16px', borderRadius: '8px', fontWeight: 700, cursor: 'pointer' }}
                    >
                      OPD Registration
                    </button>
                  )}
                  {coverageState['rc-billing']?.on && (
                    <button 
                      type="button"
                      className={`btn-view-detail ${receptionistSubTab === 'billing' ? 'active' : ''}`}
                      onClick={() => setReceptionistSubTab('billing')}
                      style={{ background: receptionistSubTab === 'billing' ? '#E11D48' : 'transparent', color: receptionistSubTab === 'billing' ? 'white' : '#64748B', border: 'none', padding: '8px 16px', borderRadius: '8px', fontWeight: 700, cursor: 'pointer' }}
                    >
                      Billing Ledger
                    </button>
                  )}
                </div>

                {/* SUBTAB: TOKEN QUEUE */}
                {receptionistSubTab === 'queue' && (
                  <div className="glass-card" style={{ padding: '24px', background: 'white', border: '1px solid #E2E8F0', borderRadius: '16px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                      <h3 style={{ fontSize: '16px', fontWeight: 800, color: '#0F172A', margin: 0 }}>OPD Daily Token Roster</h3>
                      <button 
                        type="button"
                        className="btn-cover-action receptionist-primary"
                        onClick={() => {
                          showToast("Calling Next Patient in Token Queue!");
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
                                      await api.put(`/appointments/${item.id}`, { status: 'Completed' });
                                      showToast(`Token ${item.token} marked as Completed!`);
                                      fetchCoverageData();
                                    } catch (e) {
                                      showToast('Failed to update appointment status.');
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
                        if (!patientId || !doctorId) {
                          showToast("Please select a patient and a doctor");
                          return;
                        }
                        
                        try {
                          await api.post('/appointments', {
                            patientId,
                            doctorId,
                            date: new Date(),
                            time: slot,
                            reason
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

                          showToast(`Appointment booked successfully!`);
                          e.target.reset();
                          fetchCoverageData();
                        } catch (err) {
                          showToast('Failed to book appointment.');
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
                        showToast(`Patient "${name}" registered successfully!`);
                        e.target.reset();
                        fetchCoverageData();
                      } catch (err) {
                        showToast('Failed to register patient.');
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
                                      showToast(`Payment ₹${bill.amount} collected for ${bill.name}!`);
                                      fetchCoverageData();
                                    } catch (e) {
                                      showToast('Failed to clear bill.');
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
                                  onClick={() => showToast("Re-printing duplicate receipt...")}
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

            {/* TAB: LAB TEST CATALOG & DYNAMIC PRICES */}
            {activeTab === 'lab-catalog' && (
              <div className="tab-content active" style={{ animation: 'slideUp 0.4s ease-out', padding: '24px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px', flexWrap: 'wrap', gap: '16px' }}>
                  <div>
                    <h2 style={{ fontSize: '22px', fontWeight: 800, color: '#0F172A', margin: '0 0 4px 0' }}>Hospital Lab Test Price Catalog</h2>
                    <p style={{ fontSize: '13px', color: '#64748B', margin: 0, fontWeight: 600 }}>Manage dynamic test pricing, specimen types, turnaround times, and diagnostic master settings for your hospital.</p>
                  </div>
                  <div style={{ display: 'flex', gap: '10px' }}>
                    <button
                      type="button"
                      onClick={async () => {
                        if (window.confirm("Reset hospital lab catalog to standard default pricing?")) {
                          try {
                            setLoading(true);
                            await api.post('/lab-tests/seed-default');
                            showToast("Lab Test Catalog reset to standard defaults!");
                            fetchData();
                          } catch (err) {
                            console.error(err);
                            showToast("Failed to reset catalog.");
                          } finally {
                            setLoading(false);
                          }
                        }
                      }}
                      style={{ padding: '10px 16px', background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '10px', color: '#475569', fontSize: '13px', fontWeight: 700, cursor: 'pointer' }}
                    >
                      Reset Defaults
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setEditingCatalogItem(null);
                        setCatalogForm({
                          testCode: `LAB-${Date.now().toString().slice(-4)}`,
                          testName: '',
                          category: 'Hematology',
                          price: '',
                          sampleType: 'Blood (EDTA)',
                          turnaroundTime: '12 Hours',
                          normalRange: '',
                          unit: '',
                          description: ''
                        });
                        setShowCatalogModal(true);
                      }}
                      style={{ padding: '10px 20px', background: '#2563EB', border: 'none', borderRadius: '10px', color: 'white', fontSize: '13px', fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', boxShadow: '0 4px 12px rgba(37,99,235,0.25)' }}
                    >
                      + Add New Test & Price
                    </button>
                  </div>
                </div>

                {/* Filter & Search Bar */}
                <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '14px', padding: '16px 20px', marginBottom: '24px', display: 'flex', gap: '16px', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ position: 'relative', flex: 1, minWidth: '240px' }}>
                    <input
                      type="text"
                      placeholder="Search test name or test code..."
                      value={catalogSearchQuery}
                      onChange={e => setCatalogSearchQuery(e.target.value)}
                      style={{ width: '100%', height: '42px', border: '1px solid #CBD5E1', borderRadius: '10px', padding: '0 14px 0 38px', fontSize: '13.5px', outline: 'none', color: '#0F172A', boxSizing: 'border-box' }}
                    />
                    <i data-lucide="search" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', width: '16px', height: '16px', color: '#64748B' }}></i>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontSize: '12px', fontWeight: 700, color: '#64748B' }}>CATEGORY:</span>
                      <select
                        value={catalogCategoryFilter}
                        onChange={e => setCatalogCategoryFilter(e.target.value)}
                        style={{ height: '42px', border: '1px solid #CBD5E1', borderRadius: '10px', padding: '0 14px', fontSize: '13px', fontWeight: 700, color: '#0F172A', background: '#F8FAFC', outline: 'none' }}
                      >
                        <option value="All">All Categories ({labTestCatalog.length})</option>
                        {Array.from(new Set(labTestCatalog.map(item => (item.category || 'General').trim()).filter(Boolean))).sort().map(cat => (
                          <option key={cat} value={cat}>{cat}</option>
                        ))}
                      </select>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontSize: '12px', fontWeight: 700, color: '#64748B' }}>STATUS:</span>
                      <select
                        value={catalogStatusFilter}
                        onChange={e => setCatalogStatusFilter(e.target.value)}
                        style={{ height: '42px', border: '1px solid #CBD5E1', borderRadius: '10px', padding: '0 14px', fontSize: '13px', fontWeight: 700, color: '#0F172A', background: '#F8FAFC', outline: 'none' }}
                      >
                        <option value="All">All Statuses</option>
                        <option value="Active">Active Tests Only</option>
                        <option value="Inactive">Deactivated Tests Only</option>
                      </select>
                    </div>
                  </div>
                </div>

                {/* Catalog Table */}
                <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '16px', overflow: 'hidden', boxShadow: '0 4px 12px rgba(0,0,0,0.02)' }}>
                  <table className="elite-table-custom">
                    <thead>
                      <tr>
                        <th>Test Code & Name</th>
                        <th>Category</th>
                        <th>Dynamic Price</th>
                        <th>Specimen / Tube</th>
                        <th>Turnaround</th>
                        <th style={{ textAlign: 'right' }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {labTestCatalog
                        .filter(item => {
                          const query = catalogSearchQuery.toLowerCase().trim();
                          const matchesQuery = !query || item.testName.toLowerCase().includes(query) || item.testCode.toLowerCase().includes(query);
                          const matchesCat = catalogCategoryFilter === 'All' || (item.category || '').trim() === catalogCategoryFilter;
                          const matchesStatus = catalogStatusFilter === 'All' || 
                                                (catalogStatusFilter === 'Active' && item.isActive) ||
                                                (catalogStatusFilter === 'Inactive' && !item.isActive);
                          return matchesQuery && matchesCat && matchesStatus;
                        })
                        .map(item => (
                          <tr key={item._id} style={{ background: item.isActive ? 'transparent' : '#FFF5F5' }}>
                            <td>
                              <div>
                                <strong style={{ fontSize: '14px', color: '#0F172A', display: 'block' }}>{item.testName}</strong>
                                <span style={{ fontSize: '11px', color: '#64748B', fontFamily: 'monospace', fontWeight: 700 }}>{item.testCode}</span>
                              </div>
                            </td>
                            <td>
                              <span style={{ padding: '4px 10px', borderRadius: '6px', fontSize: '11px', fontWeight: 800, background: '#EFF6FF', color: '#2563EB', border: '1px solid #BFDBFE' }}>
                                {item.category || 'General'}
                              </span>
                            </td>
                            <td>
                              <span style={{ fontSize: '15px', fontWeight: 900, color: '#059669' }}>
                                ₹{(item.price || 0).toLocaleString('en-IN')}
                              </span>
                            </td>
                            <td>
                              <span style={{ fontSize: '12.5px', color: '#334155', fontWeight: 600 }}>{item.sampleType || 'Blood'}</span>
                            </td>
                            <td>
                              <span style={{ fontSize: '12px', color: '#64748B', fontWeight: 600 }}>{item.turnaroundTime || '24 Hours'}</span>
                              </td>
                            <td style={{ textAlign: 'right' }}>
                              <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setEditingCatalogItem(item);
                                    setCatalogForm({
                                      testCode: item.testCode,
                                      testName: item.testName,
                                      category: item.category || 'Hematology',
                                      price: item.price,
                                      sampleType: item.sampleType || 'Blood (EDTA)',
                                      turnaroundTime: item.turnaroundTime || '12 Hours',
                                      normalRange: item.normalRange || '',
                                      unit: item.unit || '',
                                      description: item.description || ''
                                    });
                                    setShowCatalogModal(true);
                                  }}
                                  style={{ padding: '6px 12px', background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: '6px', color: '#2563EB', fontSize: '12px', fontWeight: 700, cursor: 'pointer' }}
                                >
                                  Edit Price
                                </button>
                                <button
                                  type="button"
                                  onClick={async () => {
                                    try {
                                      await api.put(`/lab-tests/${item._id}`, { isActive: !item.isActive });
                                      showToast(`Lab test '${item.testName}' ${item.isActive ? 'deactivated' : 'activated'}!`);
                                      fetchData();
                                    } catch (e) {
                                      showToast("Failed to toggle test status.");
                                    }
                                  }}
                                  style={{
                                    padding: '6px 12px',
                                    border: '1px solid',
                                    borderRadius: '6px',
                                    fontSize: '12px',
                                    fontWeight: 700,
                                    cursor: 'pointer',
                                    background: item.isActive ? '#FEF2F2' : '#ECFDF5',
                                    borderColor: item.isActive ? '#FCA5A5' : '#A7F3D0',
                                    color: item.isActive ? '#DC2626' : '#047857'
                                  }}
                                >
                                  {item.isActive ? 'Deactivate' : 'Activate'}
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>

                {/* MODAL: ADD / EDIT LAB TEST */}
                {showCatalogModal && (
                  <div style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.4)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 99999 }}>
                    <div style={{ width: '500px', background: '#FFFFFF', borderRadius: '16px', padding: '28px', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)', border: '1px solid #E2E8F0' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                        <div>
                          <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 800, color: '#0F172A' }}>
                            {editingCatalogItem ? 'Edit Hospital Lab Test & Price' : 'Add New Hospital Lab Test'}
                          </h3>
                          <span style={{ fontSize: '12px', color: '#64748B' }}>Configure test code, tariff price, and collection sample</span>
                        </div>
                        <button onClick={() => setShowCatalogModal(false)} style={{ background: 'none', border: 'none', color: '#94A3B8', cursor: 'pointer', fontSize: '18px', fontWeight: 700 }}>✕</button>
                      </div>

                      <form onSubmit={async (e) => {
                        e.preventDefault();
                        if (!catalogForm.testName || catalogForm.price === '') {
                          showToast("Please enter test name and price.");
                          return;
                        }
                        try {
                          setLoading(true);
                          if (editingCatalogItem) {
                            await api.put(`/lab-tests/${editingCatalogItem._id}`, catalogForm);
                            showToast(`Updated '${catalogForm.testName}' price to ₹${catalogForm.price}!`);
                          } else {
                            await api.post('/lab-tests', catalogForm);
                            showToast(`Added '${catalogForm.testName}' with price ₹${catalogForm.price}!`);
                          }
                          setShowCatalogModal(false);
                          fetchData();
                        } catch (err) {
                          console.error(err);
                          showToast(err.response?.data?.error || "Failed to save lab test.");
                        } finally {
                          setLoading(false);
                        }
                      }} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                        
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '12px' }}>
                          <div>
                            <label style={{ display: 'block', fontSize: '11px', fontWeight: 800, color: '#64748B', marginBottom: '4px' }}>TEST CODE</label>
                            <input 
                              type="text" 
                              value={catalogForm.testCode} 
                              onChange={e => setCatalogForm({ ...catalogForm, testCode: e.target.value })} 
                              style={{ width: '100%', height: '40px', border: '1px solid #CBD5E1', borderRadius: '8px', padding: '0 10px', fontSize: '13px', fontFamily: 'monospace', fontWeight: 700 }}
                              required 
                            />
                          </div>
                          <div>
                            <label style={{ display: 'block', fontSize: '11px', fontWeight: 800, color: '#64748B', marginBottom: '4px' }}>TEST NAME</label>
                            <input 
                              type="text" 
                              value={catalogForm.testName} 
                              onChange={e => setCatalogForm({ ...catalogForm, testName: e.target.value })} 
                              placeholder="e.g. Complete Blood Count (CBC)"
                              style={{ width: '100%', height: '40px', border: '1px solid #CBD5E1', borderRadius: '8px', padding: '0 10px', fontSize: '13px', fontWeight: 600 }}
                              required 
                            />
                          </div>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                          <div>
                            <label style={{ display: 'block', fontSize: '11px', fontWeight: 800, color: '#64748B', marginBottom: '4px' }}>CATEGORY</label>
                            <select
                              value={catalogForm.category}
                              onChange={e => setCatalogForm({ ...catalogForm, category: e.target.value })}
                              style={{ width: '100%', height: '40px', border: '1px solid #CBD5E1', borderRadius: '8px', padding: '0 10px', fontSize: '13px', fontWeight: 600, background: '#FFF' }}
                            >
                              {Array.from(new Set(labTestCatalog.map(item => (item.category || 'General').trim()).filter(Boolean))).sort().map(cat => (
                                <option key={cat} value={cat}>{cat}</option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label style={{ display: 'block', fontSize: '11px', fontWeight: 800, color: '#64748B', marginBottom: '4px' }}>HOSPITAL PRICE (₹)</label>
                            <input 
                              type="number" 
                              min="0"
                              value={catalogForm.price} 
                              onChange={e => setCatalogForm({ ...catalogForm, price: e.target.value })} 
                              placeholder="e.g. 350"
                              style={{ width: '100%', height: '40px', border: '1px solid #CBD5E1', borderRadius: '8px', padding: '0 10px', fontSize: '14px', fontWeight: 800, color: '#059669' }}
                              required 
                            />
                          </div>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                          <div>
                            <label style={{ display: 'block', fontSize: '11px', fontWeight: 800, color: '#64748B', marginBottom: '4px' }}>SAMPLE TYPE</label>
                            <input 
                              type="text" 
                              value={catalogForm.sampleType} 
                              onChange={e => setCatalogForm({ ...catalogForm, sampleType: e.target.value })} 
                              placeholder="e.g. Blood (EDTA), Urine"
                              style={{ width: '100%', height: '40px', border: '1px solid #CBD5E1', borderRadius: '8px', padding: '0 10px', fontSize: '13px' }}
                            />
                          </div>
                          <div>
                            <label style={{ display: 'block', fontSize: '11px', fontWeight: 800, color: '#64748B', marginBottom: '4px' }}>TURNAROUND TIME</label>
                            <input 
                              type="text" 
                              value={catalogForm.turnaroundTime} 
                              onChange={e => setCatalogForm({ ...catalogForm, turnaroundTime: e.target.value })} 
                              placeholder="e.g. 4 Hours, 24 Hours"
                              style={{ width: '100%', height: '40px', border: '1px solid #CBD5E1', borderRadius: '8px', padding: '0 10px', fontSize: '13px' }}
                            />
                          </div>
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '12px' }}>
                          <button
                            type="button"
                            onClick={() => setShowCatalogModal(false)}
                            style={{ padding: '10px 18px', background: '#F1F5F9', border: 'none', borderRadius: '8px', color: '#475569', fontWeight: 700, fontSize: '13px', cursor: 'pointer' }}
                          >
                            Cancel
                          </button>
                          <button
                            type="submit"
                            style={{ padding: '10px 22px', background: '#2563EB', border: 'none', borderRadius: '8px', color: 'white', fontWeight: 800, fontSize: '13px', cursor: 'pointer' }}
                          >
                            {editingCatalogItem ? 'Update Test Tariff' : 'Save New Test'}
                          </button>
                        </div>
                      </form>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* TAB: PHARMACY DYNAMIC COVERAGE */}
            {activeTab === 'pharmacy_cover' && (
              <div className="tab-content active" style={{ animation: 'slideUp 0.4s ease-out', padding: '24px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
                  <div>
                    <h2 style={{ fontSize: '20px', fontWeight: 800, color: '#0F172A', margin: '0 0 4px 0' }}>Pharmacy Active Coverage</h2>
                    <p style={{ fontSize: '13px', color: '#64748B', margin: 0, fontWeight: 600 }}>Providing emergency clinical oversight for Pharmacy. Manage Rx dispensing queue and stock levels.</p>
                  </div>
                  <span className="badge-pill new" style={{ background: '#DBEAFE', color: '#2563EB', padding: '6px 12px', fontSize: '11px', fontWeight: 800 }}>
                    ● Pharmacy Cover Duty
                  </span>
                </div>

                <div style={{ display: 'flex', gap: '8px', borderBottom: '1px solid #E2E8F0', paddingBottom: '12px', marginBottom: '24px' }}>
                  {coverageState['ph-queue']?.on && (
                    <button 
                      type="button"
                      className={`btn-view-detail ${pharmacySubTab === 'queue' ? 'active' : ''}`}
                      onClick={() => setPharmacySubTab('queue')}
                      style={{ background: pharmacySubTab === 'queue' ? '#2563EB' : 'transparent', color: pharmacySubTab === 'queue' ? 'white' : '#64748B', border: 'none', padding: '8px 16px', borderRadius: '8px', fontWeight: 700, cursor: 'pointer' }}
                    >
                      Rx Dispense Queue
                    </button>
                  )}
                  {(coverageState['ph-stock']?.on || coverageState['dr-stockview']?.on) && (
                    <button 
                      type="button"
                      className={`btn-view-detail ${pharmacySubTab === 'stock' ? 'active' : ''}`}
                      onClick={() => setPharmacySubTab('stock')}
                      style={{ background: pharmacySubTab === 'stock' ? '#2563EB' : 'transparent', color: pharmacySubTab === 'stock' ? 'white' : '#64748B', border: 'none', padding: '8px 16px', borderRadius: '8px', fontWeight: 700, cursor: 'pointer' }}
                    >
                      Medicine Stock
                    </button>
                  )}
                </div>

                {/* SUBTAB: RX DISPENSE QUEUE */}
                {pharmacySubTab === 'queue' && (
                  <div className="glass-card" style={{ padding: '24px', background: 'white', border: '1px solid #E2E8F0', borderRadius: '16px' }}>
                    <h3 style={{ fontSize: '16px', fontWeight: 800, color: '#0F172A', marginBottom: '20px' }}>Active Prescriptions Dispensing Queue</h3>
                    
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

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                      {coveragePharmacyQueue
                        .filter(p => 
                          p.patient?.toLowerCase().includes(pharmacySearchQuery.toLowerCase()) || 
                          p.id?.toLowerCase().includes(pharmacySearchQuery.toLowerCase()) ||
                          p.med?.toLowerCase().includes(pharmacySearchQuery.toLowerCase())
                        )
                        .map(item => (
                          <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px', border: '1px solid #F1F5F9', borderRadius: '12px' }}>
                            <div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <span style={{ fontSize: '14px', fontWeight: 800, color: '#1E293B' }}>{item.patient}</span>
                                <span className="badge-pill new" style={{ fontSize: '9px', padding: '2px 6px' }}>{item.type}</span>
                              </div>
                              <span style={{ fontSize: '13px', color: '#475569', fontWeight: 600, display: 'block', marginTop: '4px' }}>Rx: <b>{item.med}</b> (Qty: {item.qty})</span>
                              <span style={{ fontSize: '11px', color: '#94A3B8', fontWeight: 550 }}>Token ID: #{item.id}</span>
                            </div>
                            <button 
                              type="button"
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
                    </div>
                  </div>
                )}

                {/* SUBTAB: MEDICINE STOCK */}
                {pharmacySubTab === 'stock' && (
                  <div className="glass-card" style={{ padding: '24px', background: 'white', border: '1px solid #E2E8F0', borderRadius: '16px' }}>
                    <h3 style={{ fontSize: '16px', fontWeight: 800, color: '#0F172A', marginBottom: '20px' }}>Medicine Stock Levels</h3>
                    <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                      <thead>
                        <tr style={{ borderBottom: '1px solid #E2E8F0' }}>
                          <th style={{ padding: '12px 8px', color: '#64748B', fontSize: '12px', fontWeight: 800 }}>DRUG NAME</th>
                          <th style={{ padding: '12px 8px', color: '#64748B', fontSize: '12px', fontWeight: 800 }}>AVAILABLE STOCK</th>
                          <th style={{ padding: '12px 8px', color: '#64748B', fontSize: '12px', fontWeight: 800 }}>UNIT</th>
                          <th style={{ padding: '12px 8px', color: '#64748B', fontSize: '12px', fontWeight: 800 }}>STATUS</th>
                          <th style={{ padding: '12px 8px', color: '#64748B', fontSize: '12px', fontWeight: 800, textAlign: 'right' }}>ACTION</th>
                        </tr>
                      </thead>
                      <tbody>
                        {coveragePharmacyInventory.map((item, idx) => (
                          <tr key={idx} style={{ borderBottom: '1px solid #F1F5F9' }}>
                            <td style={{ padding: '16px 8px', fontWeight: 700, color: '#1E293B', fontSize: '13.5px' }}>{item.name}</td>
                            <td style={{ padding: '16px 8px', fontWeight: 800, color: '#0F172A', fontSize: '13.5px' }}>{item.stock}</td>
                            <td style={{ padding: '16px 8px', color: '#64748B', fontSize: '13px', fontWeight: 600 }}>{item.unit}</td>
                            <td style={{ padding: '16px 8px' }}>
                              <span className={`badge-pill ${item.status === 'In Stock' ? 'new' : 'waiting'}`} style={{ fontSize: '10px' }}>
                                {item.status}
                              </span>
                            </td>
                            <td style={{ padding: '16px 8px', textAlign: 'right' }}>
                              <button 
                                type="button"
                                className="btn-cover-action pharmacy-primary"
                                onClick={async () => {
                                  try {
                                    await api.put(`/medicines/${item.id}`, { stock: item.stock + 100 });
                                    showToast(`Restocked ${item.name} by +100 units!`);
                                    fetchCoverageData();
                                  } catch (e) {
                                    showToast('Failed to restock medicine.');
                                  }
                                }}
                              >
                                Restock +100
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
          </>
        )}
      </div>

      {/* RECORD / EDIT VITALS MODAL */}
      {showVitalsModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.65)', backdropFilter: 'blur(4px)', zIndex: 99999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
          <div className="glass-card" style={{ background: 'white', borderRadius: '16px', border: '1.5px solid #C4B5FD', padding: '28px', width: '100%', maxWidth: '520px', boxShadow: '0 20px 40px rgba(0,0,0,0.12)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', borderBottom: '1px solid #F1F5F9', paddingBottom: '12px' }}>
              <h3 style={{ fontSize: '18px', fontWeight: 900, color: '#1A1D23', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#2563EB" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
                </svg>
                Record Patient Vitals
              </h3>
              <button 
                type="button" 
                onClick={() => setShowVitalsModal(false)}
                style={{ background: 'none', border: 'none', color: '#64748B', cursor: 'pointer', padding: '4px', fontSize: '16px' }}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveVitals}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '24px' }}>
                <div className="form-group" style={{ margin: 0 }}>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 800, color: '#475569', marginBottom: '6px', textTransform: 'uppercase' }}>Temperature (°F)</label>
                  <input 
                    type="number" 
                    step="0.1" 
                    className="form-control" 
                    placeholder="e.g. 98.6"
                    style={{ height: '40px', borderRadius: '8px', border: '1px solid #CBD5E1', padding: '0 12px', width: '100%', background: 'white', color: '#1A1D23' }}
                    value={vitalTemp}
                    onChange={e => setVitalTemp(e.target.value)}
                  />
                </div>

                <div className="form-group" style={{ margin: 0 }}>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 800, color: '#475569', marginBottom: '6px', textTransform: 'uppercase' }}>Heart Rate / Pulse (bpm)</label>
                  <input 
                    type="number" 
                    className="form-control" 
                    placeholder="e.g. 72"
                    style={{ height: '40px', borderRadius: '8px', border: '1px solid #CBD5E1', padding: '0 12px', width: '100%', background: 'white', color: '#1A1D23' }}
                    value={vitalPulse}
                    onChange={e => setVitalPulse(e.target.value)}
                  />
                </div>

                <div className="form-group" style={{ margin: 0 }}>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 800, color: '#475569', marginBottom: '6px', textTransform: 'uppercase' }}>BP Systolic (mmHg)</label>
                  <input 
                    type="number" 
                    className="form-control" 
                    placeholder="e.g. 120"
                    style={{ height: '40px', borderRadius: '8px', border: '1px solid #CBD5E1', padding: '0 12px', width: '100%', background: 'white', color: '#1A1D23' }}
                    value={vitalBpSys}
                    onChange={e => setVitalBpSys(e.target.value)}
                  />
                </div>

                <div className="form-group" style={{ margin: 0 }}>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 800, color: '#475569', marginBottom: '6px', textTransform: 'uppercase' }}>BP Diastolic (mmHg)</label>
                  <input 
                    type="number" 
                    className="form-control" 
                    placeholder="e.g. 80"
                    style={{ height: '40px', borderRadius: '8px', border: '1px solid #CBD5E1', padding: '0 12px', width: '100%', background: 'white', color: '#1A1D23' }}
                    value={vitalBpDia}
                    onChange={e => setVitalBpDia(e.target.value)}
                  />
                </div>

                <div className="form-group" style={{ margin: 0 }}>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 800, color: '#475569', marginBottom: '6px', textTransform: 'uppercase' }}>Respiration (breaths/min)</label>
                  <input 
                    type="number" 
                    className="form-control" 
                    placeholder="e.g. 16"
                    style={{ height: '40px', borderRadius: '8px', border: '1px solid #CBD5E1', padding: '0 12px', width: '100%', background: 'white', color: '#1A1D23' }}
                    value={vitalResp}
                    onChange={e => setVitalResp(e.target.value)}
                  />
                </div>

                <div className="form-group" style={{ margin: 0 }}>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 800, color: '#475569', marginBottom: '6px', textTransform: 'uppercase' }}>Oxygen Saturation SpO2 (%)</label>
                  <input 
                    type="number" 
                    className="form-control" 
                    placeholder="e.g. 98"
                    style={{ height: '40px', borderRadius: '8px', border: '1px solid #CBD5E1', padding: '0 12px', width: '100%', background: 'white', color: '#1A1D23' }}
                    value={vitalSpo2}
                    onChange={e => setVitalSpo2(e.target.value)}
                  />
                </div>

                <div className="form-group" style={{ margin: 0 }}>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 800, color: '#475569', marginBottom: '6px', textTransform: 'uppercase' }}>Weight (kg)</label>
                  <input 
                    type="number" 
                    step="0.1" 
                    className="form-control" 
                    placeholder="e.g. 68.5"
                    style={{ height: '40px', borderRadius: '8px', border: '1px solid #CBD5E1', padding: '0 12px', width: '100%', background: 'white', color: '#1A1D23' }}
                    value={vitalWeight}
                    onChange={e => setVitalWeight(e.target.value)}
                  />
                </div>

                <div className="form-group" style={{ margin: 0 }}>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 800, color: '#475569', marginBottom: '6px', textTransform: 'uppercase' }}>Height (cm)</label>
                  <input 
                    type="number" 
                    className="form-control" 
                    placeholder="e.g. 175"
                    style={{ height: '40px', borderRadius: '8px', border: '1px solid #CBD5E1', padding: '0 12px', width: '100%', background: 'white', color: '#1A1D23' }}
                    value={vitalHeight}
                    onChange={e => setVitalHeight(e.target.value)}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
                <button 
                  type="button" 
                  onClick={() => setShowVitalsModal(false)}
                  style={{ height: '40px', padding: '0 20px', borderRadius: '8px', border: '1px solid #E2E8F0', background: '#F8FAFC', color: '#64748B', fontWeight: 800, cursor: 'pointer' }}
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  disabled={loading}
                  style={{ height: '40px', padding: '0 20px', borderRadius: '8px', border: 'none', background: '#2563EB', color: 'white', fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}
                >
                  {loading ? 'Saving...' : 'Save Vitals'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Unified Manage Reagent/Supply Modal */}
      {showLabInventoryModal && (
        <div className="modal-overlay" style={{ display: 'flex', zIndex: 1300, background: 'rgba(15, 23, 42, 0.6)', backdropFilter: 'blur(4px)', position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center' }} onClick={() => setShowLabInventoryModal(false)}>
          <div className="modal-box glass-card" style={{ width: '90%', maxWidth: '500px', background: 'white', padding: '32px', borderRadius: '24px', boxShadow: '0 20px 50px rgba(0,0,0,0.15)', position: 'relative' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
              <h2 style={{ fontSize: '20px', fontWeight: 900, color: '#1A1D23', margin: 0 }}>
                {labModalMode === 'add' ? 'Add Reagent/Supply' : labModalMode === 'restock' ? 'Restock Lab Supply' : 'Edit Supply Details'}
              </h2>
              <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748B' }} onClick={() => setShowLabInventoryModal(false)}>
                <i data-lucide="x" style={{ width: '20px', height: '20px' }}></i>
              </button>
            </div>

            <form onSubmit={handleSaveLabItem}>
              {labModalMode !== 'restock' ? (
                <>
                  <div className="form-group" style={{ marginBottom: '16px' }}>
                    <label style={labelStyle}>Supply Name</label>
                    <input type="text" style={inputStyle} value={labFormData.name} onChange={e => setLabFormData({...labFormData, name: e.target.value})} required placeholder="e.g. Hematology Reagent" />
                  </div>

                  <div className="mobile-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                    <div className="form-group">
                      <label style={labelStyle}>Category</label>
                      <select style={inputStyle} value={labFormData.category} onChange={e => setLabFormData({...labFormData, category: e.target.value})} required>
                        <option value="Reagents">Reagents</option>
                        <option value="Consumables">Consumables</option>
                        <option value="Equipment">Equipment</option>
                      </select>
                    </div>

                    <div className="form-group">
                      <label style={labelStyle}>Unit Type</label>
                      <select style={inputStyle} value={labFormData.unit} onChange={e => setLabFormData({...labFormData, unit: e.target.value})} required>
                        <option value="L">L</option>
                        <option value="units">units</option>
                        <option value="boxes">boxes</option>
                        <option value="kits">kits</option>
                      </select>
                    </div>
                  </div>

                  <div className="mobile-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                    <div className="form-group">
                      <label style={labelStyle}>Current Stock</label>
                      <input type="number" style={inputStyle} value={labFormData.stock} onChange={e => setLabFormData({...labFormData, stock: Number(e.target.value)})} required />
                    </div>

                    <div className="form-group">
                      <label style={labelStyle}>Low Threshold Alert</label>
                      <input type="number" style={inputStyle} value={labFormData.threshold} onChange={e => setLabFormData({...labFormData, threshold: Number(e.target.value)})} required />
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <div style={{ background: '#F8FAFC', padding: '16px', borderRadius: '12px', marginBottom: '24px' }}>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 800, textTransform: 'uppercase' }}>Supply Item</div>
                    <div style={{ fontSize: '18px', fontWeight: 900, color: '#1E293B' }}>{labFormData.name}</div>
                    <div style={{ marginTop: '12px', fontSize: '11px', color: 'var(--text-muted)', fontWeight: 800, textTransform: 'uppercase' }}>Current Inventory</div>
                    <div style={{ fontSize: '15px', fontWeight: 800, color: 'var(--primary)' }}>{labFormData.stock} {labFormData.unit} (Threshold: {labFormData.threshold})</div>
                  </div>
                  <div className="form-group" style={{ marginBottom: '24px' }}>
                    <label style={labelStyle}>Add Quantity</label>
                    <input type="number" style={inputStyle} value={labFormData.addQty} onChange={e => setLabFormData({...labFormData, addQty: Number(e.target.value)})} required min="1" />
                  </div>
                </>
              )}

              <div style={{ display: 'flex', gap: '16px', marginTop: '24px' }}>
                <button type="button" className="btn btn-secondary" style={{ flex: 1, justifyContent: 'center', height: '44px', borderRadius: '12px' }} onClick={() => setShowLabInventoryModal(false)}>Cancel</button>
                <button type="submit" disabled={loading} style={{ ...btnStyle, flex: 1 }}>
                  {loading ? 'Saving...' : labModalMode === 'add' ? 'Add Item' : labModalMode === 'restock' ? 'Restock Item' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Profile Edit Modal */}
      {showProfileEditModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(15, 23, 42, 0.3)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 4000 }}>
          <div style={{ background: 'white', width: '100%', maxWidth: '440px', padding: '28px', borderRadius: '24px', border: '1px solid #E2E8F0', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1), 0 10px 10px -5px rgba(0,0,0,0.04)' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
              <h2 style={{ fontSize: '18px', fontWeight: 800, color: '#0F172A', margin: 0 }}>Edit Lab Tech Profile</h2>
              <button 
                onClick={() => setShowProfileEditModal(false)}
                style={{ background: 'none', border: 'none', color: '#64748B', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '4px', borderRadius: '50%' }}
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" x2="6" y1="6" y2="18"/><line x1="6" x2="18" y1="6" y2="18"/></svg>
              </button>
            </div>

            {profileError && (
              <div style={{ padding: '12px', borderRadius: '8px', background: '#FEF2F2', border: '1px solid #FCA5A5', color: '#DC2626', fontSize: '13px', fontWeight: 600, marginBottom: '16px' }}>
                {profileError}
              </div>
            )}

            {profileSuccess && (
              <div style={{ padding: '12px', borderRadius: '8px', background: '#F0FDF4', border: '1px solid #86EFAC', color: '#16A34A', fontSize: '13px', fontWeight: 600, marginBottom: '16px' }}>
                {profileSuccess}
              </div>
            )}

            <form onSubmit={handleUpdateProfileSubmit}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '14px', marginBottom: '24px' }}>
                {profileEditAvatar ? (
                  <img 
                    src={profileEditAvatar} 
                    alt="Preview" 
                    style={{ width: '90px', height: '90px', borderRadius: '50%', objectFit: 'cover', border: '3px solid #EC4899', boxShadow: '0 8px 20px rgba(236,72,153,0.15)' }} 
                  />
                ) : (
                  <div style={{ width: '90px', height: '90px', borderRadius: '50%', background: 'linear-gradient(135deg, #EC4899 0%, #D946EF 100%)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '32px', fontWeight: 800, boxShadow: '0 8px 20px rgba(236,72,153,0.15)' }}>
                    {profileEditName ? profileEditName.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase() : 'LT'}
                  </div>
                )}
                
                <div>
                  <label style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '8px 14px', background: '#FDF2F8', color: '#DB2777', borderRadius: '8px', fontSize: '12px', fontWeight: 800, cursor: 'pointer', border: '1px dashed #EC4899' }}>
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" x2="12" y1="3" y2="15"/></svg>
                    Upload Picture
                    <input 
                      type="file" 
                      accept="image/*" 
                      style={{ display: 'none' }} 
                      onChange={(e) => {
                        const file = e.target.files[0];
                        if (file) {
                          if (file.size > 5000000) {
                            showToast("File size must be under 5MB");
                            return;
                          }
                          const reader = new FileReader();
                          reader.onload = (event) => {
                            setProfileEditAvatar(event.target.result);
                          };
                          reader.readAsDataURL(file);
                        }
                      }}
                    />
                  </label>
                  {profileEditAvatar && (
                    <button
                      type="button"
                      onClick={() => setProfileEditAvatar('')}
                      style={{ display: 'block', margin: '6px auto 0', background: 'none', border: 'none', color: '#EF4444', fontSize: '11px', fontWeight: 700, cursor: 'pointer' }}
                    >
                      Remove Picture
                    </button>
                  )}
                </div>
              </div>

               <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 800, marginBottom: '6px', color: '#475569' }}>Full Name</label>
                <input 
                  type="text" 
                  style={{ width: '100%', border: '1px solid #CBD5E1', borderRadius: '8px', height: '40px', padding: '0 12px', fontSize: '13px', fontWeight: 600, outline: 'none', backgroundColor: '#F1F5F9', cursor: 'not-allowed' }}
                  value={profileEditName} 
                  disabled
                  required 
                />
                <span style={{ fontSize: '11px', color: '#64748B', marginTop: '4px', display: 'block' }}>Managed by Administrator</span>
              </div>

              <div style={{ marginBottom: '20px' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 800, marginBottom: '6px', color: '#475569' }}>Email Address</label>
                <input 
                  type="email" 
                  style={{ width: '100%', border: '1px solid #CBD5E1', borderRadius: '8px', height: '40px', padding: '0 12px', fontSize: '13px', fontWeight: 600, outline: 'none', backgroundColor: '#F1F5F9', cursor: 'not-allowed' }}
                  value={profileEditEmail} 
                  disabled
                  required 
                />
                <span style={{ fontSize: '11px', color: '#64748B', marginTop: '4px', display: 'block' }}>Managed by Administrator</span>
              </div>

              <button 
                type="submit" 
                style={{ width: '100%', height: '44px', fontWeight: 800, borderRadius: '8px', background: '#EC4899', color: 'white', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 12px rgba(236, 72, 153, 0.2)' }}
                disabled={profileEditLoading}
              >
                {profileEditLoading ? 'Saving...' : 'Save Profile Changes'}
              </button>
            </form>
          </div>
        </div>
      )}

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
    </>
  );
};

export default LabDashboard;
