import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../utils/api';
import { useRealTimeSync } from '../hooks/useRealTimeSync';
import HRPayroll from './HRPayroll';
import curoxaSidebarLogo from '../assets/curoxa_sidebar_logo.png';

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

const ReceptionistDashboard = () => {
  const tenantModules = (() => {
    try {
      return JSON.parse(localStorage.getItem('tenantModules') || '{}');
    } catch (e) {
      return {};
    }
  })();

  const getLocalDateString = () => {
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const [activeTab, setActiveTab] = useState('dash');
  const [registrationStep, setRegistrationStep] = useState(1);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
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
        const userObj = JSON.parse(localStorage.getItem('user') || '{}');
        const possibleKeys = [
          userObj.name,
          userObj.username,
          userObj.staff_id,
          userObj.email,
          userObj.id,
          userObj._id
        ].filter(Boolean).map(k => String(k).toLowerCase().trim());
        for (const [key, val] of Object.entries(parsed)) {
          if (possibleKeys.includes(key.toLowerCase().trim())) {
            return val || {};
          }
        }
      } catch (e) {}
    }
    return {};
  });

  // Dynamic role coverage subtab states
  const [doctorSubTab, setDoctorSubTab] = useState('consult');
  const [labSubTab, setLabSubTab] = useState('tests');
  const [pharmacySubTab, setPharmacySubTab] = useState('queue');

  // Dynamic role coverage real data / transaction states
  const [coverageReagents, setCoverageReagents] = useState([]);
  const [coverageLabRequests, setCoverageLabRequests] = useState([]);
  
  // Coverage Lab workflow states
  const [showCoverageLabModal, setShowCoverageLabModal] = useState(false);
  const [selectedCoverageLabTest, setSelectedCoverageLabTest] = useState(null);
  const [coverageLabRemarks, setCoverageLabRemarks] = useState('');
  const [coverageLabParams, setCoverageLabParams] = useState({ value: '', unit: '' });
  const [coverageLabFileName, setCoverageLabFileName] = useState('');
  const [showCoverageLabDetailsModal, setShowCoverageLabDetailsModal] = useState(false);
  const [showCoveragePharmacyPaymentModal, setShowCoveragePharmacyPaymentModal] = useState(false);
  const [selectedCoveragePharmacyRx, setSelectedCoveragePharmacyRx] = useState(null);
  const [coveragePharmacyPaymentMode, setCoveragePharmacyPaymentMode] = useState('UPI');
  const [coveragePharmacyCashReceived, setCoveragePharmacyCashReceived] = useState('');
  const [doctorSearchQuery, setDoctorSearchQuery] = useState('');
  const [labSearchQuery, setLabSearchQuery] = useState('');
  const [pharmacySearchQuery, setPharmacySearchQuery] = useState('');
  const [coveragePharmacyQueue, setCoveragePharmacyQueue] = useState([]);
  const [coveragePharmacyInventory, setCoveragePharmacyInventory] = useState([]);
  const [coverageConsultations, setCoverageConsultations] = useState([]);
  const [selectedConsultation, setSelectedConsultation] = useState(null);
  const [consultationNotes, setConsultationNotes] = useState('');
  const [consultationDiagnosis, setConsultationDiagnosis] = useState('');
  const [rxMedicines, setRxMedicines] = useState([
    { id: 1, name: 'Paracetamol 650', dose: '1 Tab', freq: '1 Tab BD', duration: '5 Days', timing: 'After Food', notes: 'For fever' }
  ]);
  const [rxPatientId, setRxPatientId] = useState('');
  const [rxDiagnosis, setRxDiagnosis] = useState('');

  // Bulk selection states for patient directory & indents tables
  const [selectedPatientIds, setSelectedPatientIds] = useState([]);
  const [selectedIndentIds, setSelectedIndentIds] = useState([]);

  // Batch SMS Modal states
  const [showBatchSmsModal, setShowBatchSmsModal] = useState(false);
  const [batchSmsTemplate, setBatchSmsTemplate] = useState('reminder');
  const [batchSmsMessage, setBatchSmsMessage] = useState('Dear Patient, this is an official reminder for your clinical visit at Curoxa Medical Center. Please arrive 10 mins early.');
  const [batchSmsSending, setBatchSmsSending] = useState(false);
  const [batchSmsSuccessToast, setBatchSmsSuccessToast] = useState('');

  // Examine patient workspace step states
  const [examineStep, setExamineStep] = useState('notes'); // 'notes', 'prescriptions', 'labs'
  const [consultationRxMedicines, setConsultationRxMedicines] = useState([]);
  const [consultationRxDiagnosis, setConsultationRxDiagnosis] = useState('');
  const [consultationLabTest, setConsultationLabTest] = useState('Complete Blood Count (CBC)');
  const [hasPrescriptionEnabled, setHasPrescriptionEnabled] = useState(false);
  const [hasLabOrderEnabled, setHasLabOrderEnabled] = useState(false);
  const [labPatientId, setLabPatientId] = useState('');

  // Available EMR diagnostic lab tests
  const availableTests = [
    'CBC', 'Vitamin D', 'HbA1c', 'LFT', 'KFT', 'Lipid Profile', 'TSH', 
    'Thyroid Panel', 'Urine Routine', 'Vitamin B12', 'Fasting Blood Sugar',
    'Post Prandial Blood Sugar', 'Serum Calcium', 'Iron Studies', 'X-Ray Chest'
  ];

  // Medicine Defaults for autocomplete auto-fill
  const medicineDefaults = {
    'paracetamol': { dose: '1 Tab', freq: 'BD', duration: '3 Days', timing: 'After Food' },
    'amoxicillin': { dose: '1 Cap', freq: 'TDS', duration: '5 Days', timing: 'After Food' },
    'ibuprofen': { dose: '1 Tab', freq: 'BD', duration: '3 Days', timing: 'After Food' },
    'pantoprazole': { dose: '1 Tab', freq: 'OD', duration: '7 Days', timing: 'Before Food' },
    'cetirizine': { dose: '1 Tab', freq: 'OD', duration: '5 Days', timing: 'At Bedtime' },
    'metformin': { dose: '1 Tab', freq: 'BD', duration: '15 Days', timing: 'After Food' },
    'atorvastatin': { dose: '1 Tab', freq: 'OD', duration: '30 Days', timing: 'At Bedtime' },
    'azithromycin': { dose: '1 Tab', freq: 'OD', duration: '3 Days', timing: 'Before Food' }
  };

  const [activeMedFocus, setActiveMedFocus] = useState(null);
  const [isHoveringSuggestions, setIsHoveringSuggestions] = useState(false);
  const [consultationLabTests, setConsultationLabTests] = useState([]);
  const [showLabSuggestions, setShowLabSuggestions] = useState(false);
  const [slipLabTests, setSlipLabTests] = useState([]);
  const [slipLabSearchQuery, setSlipLabSearchQuery] = useState('');
  const [showSlipLabSuggestions, setShowSlipLabSuggestions] = useState(false);

  const redirectedTabsRef = useRef({});

  // Reset redirection flag on tab changes
  useEffect(() => {
    redirectedTabsRef.current = {
      [activeTab]: redirectedTabsRef.current[activeTab]
    };
  }, [activeTab]);

  // Restrict activeTab for cover users based on active coverage permissions
  useEffect(() => {
    const isCoverUser = currentUser?.role !== 'receptionist';
    if (isCoverUser) {
      if (!coverageState || Object.keys(coverageState).length === 0) return;

      let isPermitted = false;
      if (activeTab === 'dash') {
        isPermitted = true;
      } else if (['patients', 'patient-details'].includes(activeTab)) {
        isPermitted = !!(coverageState['rc-register']?.on || coverageState['rc-upload']?.on || coverageState['rc-queue']?.on);
      } else if (activeTab === 'appointments') {
        isPermitted = !!coverageState['rc-appt']?.on;
      } else if (activeTab === 'staff') {
        isPermitted = false;
      } else if (activeTab === 'billing') {
        isPermitted = !!coverageState['rc-billing']?.on;
      } else if (activeTab === 'indent' || activeTab === 'new-indent') {
        isPermitted = !!coverageState['rc-reorder']?.on;
      } else {
        isPermitted = true;
      }

      if (!isPermitted) {
        if (coverageState['rc-register']?.on || coverageState['rc-upload']?.on || coverageState['rc-queue']?.on) {
          setActiveTab('patients');
        } else if (coverageState['rc-appt']?.on) {
          setActiveTab('appointments');
        } else if (coverageState['rc-billing']?.on) {
          setActiveTab('billing');
        } else if (coverageState['rc-reorder']?.on) {
          setActiveTab('indent');
        } else {
          setActiveTab('dash');
        }
      }
    } else {
      // For receptionist, utility request tabs are strictly gated by rc-reorder permission
      if (['indent', 'new-indent'].includes(activeTab) && !coverageState?.['rc-reorder']?.on) {
        setActiveTab('dash');
      }
    }
  }, [coverageState, activeTab, currentUser]);

  // Auto-redirect first subtab on activeTab cover change
  useEffect(() => {
    if (!coverageState || Object.keys(coverageState).length === 0) return;
    if (redirectedTabsRef.current[activeTab]) return;

    if (activeTab === 'doctor_cover') {
      if (coverageState['dr-consult']?.on) {
        setDoctorSubTab('consult');
        redirectedTabsRef.current[activeTab] = true;
      } else if (coverageState['dr-rx']?.on) {
        setDoctorSubTab('prescriptions');
        redirectedTabsRef.current[activeTab] = true;
      } else if (coverageState['dr-laborder']?.on) {
        setDoctorSubTab('labs');
        redirectedTabsRef.current[activeTab] = true;
      } else if (coverageState['dr-stockview']?.on) {
        setDoctorSubTab('stock');
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

  useEffect(() => {
    const userObj = currentUser || JSON.parse(localStorage.getItem('user') || '{}');
    const possibleKeys = [
      userObj.name,
      userObj.username,
      userObj.staff_id,
      userObj.email,
      userObj.id,
      userObj._id
    ].filter(Boolean).map(k => String(k).toLowerCase().trim());

    const findUserCoverage = (allState) => {
      if (!allState || typeof allState !== 'object') return {};
      for (const [key, val] of Object.entries(allState)) {
        if (possibleKeys.includes(key.toLowerCase().trim())) {
          return val || {};
        }
      }
      return {};
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
    window.addEventListener('curoxa_pmState_changed', syncFromLocalStorage);

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

    return () => {
      window.removeEventListener('storage', syncFromLocalStorage);
      window.removeEventListener('curoxa_pmState_changed', syncFromLocalStorage);
    };
  }, [currentUser]);

  // Notifications states
  const [notifications, setNotifications] = useState([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const prevCoverageKeysRef = useRef(null);
  const notificationRef = useRef(null);
  const globalSearchContainerRef = useRef(null);
  const sidebarRef = useRef(null);
  const sidebarNavRef = useRef(null);
  const medicineSearchContainerRef = useRef(null);
  const symptomDropdownRef = useRef(null);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [selectedBillForPayment, setSelectedBillForPayment] = useState(null);
  const [paymentMethod, setPaymentMethod] = useState('Cash');
  const [discountPercent, setDiscountPercent] = useState(0);
  const [discountReason, setDiscountReason] = useState('');
  const [allowedDiscountPercent, setAllowedDiscountPercent] = useState(10);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (notificationRef.current && !notificationRef.current.contains(event.target)) {
        setShowNotifications(false);
      }
      if (globalSearchContainerRef.current && !globalSearchContainerRef.current.contains(event.target)) {
        setShowGlobalDropdown(false);
      }
      if (medicineSearchContainerRef.current && !medicineSearchContainerRef.current.contains(event.target)) {
        setShowMedicineSuggestions(false);
        setMedicineSearchQuery('');
      }
      if (symptomDropdownRef.current && !symptomDropdownRef.current.contains(event.target)) {
        setSymptomDropdownOpen(false);
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
          showToast(`Role Coverage Revoked: ${permissionNames[k] || k}!`, 'info');
        });
      }
      
      prevCoverageKeysRef.current = activeKeys;
    }
  }, [coverageState]);

  const [appointments, setAppointments] = useState([]);
  const [patientsList, setPatientsList] = useState([]);
  const [staffList, setStaffList] = useState([]);
  const [doctors, setDoctors] = useState([]);
  const [bills, setBills] = useState([]);
  
  const [patientPhoto, setPatientPhoto] = useState(null);
  const [formData, setFormData] = useState({
    name: '', age: '', ageMonths: '', ageDays: '', gender: '', contact: '', email: '', doctorId: '', bloodGroup: '', address: '', medicalHistory: '', referredBy: '', allergies: 'None', currentMedications: ''
  });

  const [dpdpConsent, setDpdpConsent] = useState({ emrCreation: true, dataSharing: false });
  const [patientDocuments, setPatientDocuments] = useState([]);
  const [newDocType, setNewDocType] = useState('Aadhar / Voter Card');
  const [addOnOriginAppt, setAddOnOriginAppt] = useState(null);


  const [selectedSymptoms, setSelectedSymptoms] = useState([]);
  const [symptomDropdownOpen, setSymptomDropdownOpen] = useState(false);
  const availableSymptoms = ['Fever', 'Headache', 'Body Pain', 'Fatigue', 'Weakness', 'Cough', 'Nausea'];
  
  const [selectedSlot, setSelectedSlot] = useState('');
  const [bookingDate, setBookingDate] = useState(new Date().toISOString().split('T')[0]);

  // Doctor availability state for appointment booking
  const DEFAULT_RECEPTION_SLOTS = [
    '09:00 AM - 09:30 AM', '09:30 AM - 10:00 AM', '10:00 AM - 10:30 AM',
    '10:30 AM - 11:00 AM', '11:00 AM - 11:30 AM', '11:30 AM - 12:00 PM',
    '12:00 PM - 12:30 PM', '12:30 PM - 01:00 PM', '02:00 PM - 02:30 PM',
    '02:30 PM - 03:00 PM', '03:00 PM - 03:30 PM', '03:30 PM - 04:00 PM',
    '04:00 PM - 04:30 PM', '04:30 PM - 05:00 PM', '05:00 PM - 05:30 PM'
  ];
  const [receptionDoctorAvailability, setReceptionDoctorAvailability] = useState({ available: true, slots: DEFAULT_RECEPTION_SLOTS, reason: null });
  const [bookingPaymentMethod, setBookingPaymentMethod] = useState('');
  const [sendingOtp, setSendingOtp] = useState(false);
  const [otpSent, setOtpSent] = useState(false);
  const [verificationOtp, setVerificationOtp] = useState('');
  const [otpVerified, setOtpVerified] = useState(false);
  const [otpVerifying, setOtpVerifying] = useState(false);

  // Direct Lab Test vs OPD Appointment vs Clinical Service Booking state
  const [bookingType, setBookingType] = useState('opd'); // 'opd', 'lab', or 'service'
  const DEFAULT_HOSPITAL_LAB_TESTS = [
    { testName: 'Complete Blood Count (CBC)', testCode: 'CBC-101', category: 'Pathology', price: 350 },
    { testName: 'Lipid Profile (Cholesterol)', testCode: 'LIPID-102', category: 'Biochemistry', price: 600 },
    { testName: 'Thyroid Profile (T3 T4 TSH)', testCode: 'THY-103', category: 'Endocrinology', price: 500 },
    { testName: 'HbA1c (Glycated Hemoglobin)', testCode: 'HBA1C-104', category: 'Biochemistry', price: 450 },
    { testName: 'Liver Function Test (LFT)', testCode: 'LFT-105', category: 'Biochemistry', price: 700 },
    { testName: 'Kidney Function Test (KFT)', testCode: 'KFT-106', category: 'Biochemistry', price: 650 },
    { testName: 'Blood Sugar Fasting & PP', testCode: 'BS-107', category: 'Biochemistry', price: 150 },
    { testName: 'Urine Routine Examination', testCode: 'UR-108', category: 'Pathology', price: 200 },
    { testName: 'Chest X-Ray (PA View)', testCode: 'XR-109', category: 'Radiology', price: 400 },
    { testName: 'ECG (12 Lead)', testCode: 'ECG-110', category: 'Cardiology', price: 300 }
  ];
  const [hospitalLabTests, setHospitalLabTests] = useState([]);
  const [selectedLabTest, setSelectedLabTest] = useState('');
  const [selectedLabPrice, setSelectedLabPrice] = useState(0);
  const [labTestSearchQuery, setLabTestSearchQuery] = useState('');
  const [showLabTestDropdown, setShowLabTestDropdown] = useState(false);
  const [customLabTestName, setCustomLabTestName] = useState('');
  const [customLabTestPrice, setCustomLabTestPrice] = useState('');
  const [isSettlingPayment, setIsSettlingPayment] = useState(false);
  const [showSlipPdfModal, setShowSlipPdfModal] = useState(false);
  const [activeSlipData, setActiveSlipData] = useState(null);

  // Multiple Direct Lab Tests Selection list state
  const [selectedLabTestsList, setSelectedLabTestsList] = useState([]);

  // Dynamic Clinical Services (Dental, Root Canal, Braces, Physiotherapy) catalog & list state
  const [hospitalClinicalServices, setHospitalClinicalServices] = useState([
    { serviceName: 'Dental — Root Canal Treatment (RCT)', serviceCode: 'DEN-201', department: 'Dental', price: 3500 },
    { serviceName: 'Dental — Scaling & Polishing', serviceCode: 'DEN-202', department: 'Dental', price: 1500 },
    { serviceName: 'Dental — Tooth Extraction (Simple)', serviceCode: 'DEN-203', department: 'Dental', price: 1200 },
    { serviceName: 'Dental — Ceramic Crown Replacement', serviceCode: 'DEN-204', department: 'Dental', price: 5000 },
    { serviceName: 'Dental — Orthodontic Braces Consultation', serviceCode: 'DEN-205', department: 'Dental', price: 2500 },
    { serviceName: 'Physiotherapy — Posture & Pain Rehab', serviceCode: 'PHY-301', department: 'Physiotherapy', price: 800 }
  ]);
  const [selectedServicesList, setSelectedServicesList] = useState([]);
  const [serviceSearchQuery, setServiceSearchQuery] = useState('');
  const [showServiceDropdown, setShowServiceDropdown] = useState(false);

  // Multiple OPD Appointments List for the same patient at the same time
  const [additionalApptsList, setAdditionalApptsList] = useState([]);

  // Dashboard Date Range Filter State
  const [showDashboardDateFilter, setShowDashboardDateFilter] = useState(false);
  const [dashboardFilterPreset, setDashboardFilterPreset] = useState('today');
  const [dashboardFilterStartDate, setDashboardFilterStartDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [dashboardFilterEndDate, setDashboardFilterEndDate] = useState(() => new Date().toISOString().split('T')[0]);

  // ─── Indent Tab State ───────────────────────────────────────────────────────
  const [indentSearch, setIndentSearch] = useState('');
  const [indentSort, setIndentSort] = useState('newest');
  const [indentPage, setIndentPage] = useState(1);
  const INDENT_PAGE_SIZE = 10;
  
  const [indents, setIndents] = useState([]);
  const [medicines, setMedicines] = useState([]);

  // Form states for New Indent Request
  const [newIndentDept, setNewIndentDept] = useState('Pharmacy');
  const [newIndentType, setNewIndentType] = useState('Pharmaceuticals');
  const [newIndentReqDate, setNewIndentReqDate] = useState(new Date().toISOString().split('T')[0]);
  const [newIndentRequestedBy, setNewIndentRequestedBy] = useState(() => JSON.parse(localStorage.getItem('user') || '{}').name || 'Staff');
  const [newIndentContact, setNewIndentContact] = useState(() => JSON.parse(localStorage.getItem('user') || '{}').contact || 'N/A');
  const [newIndentPriority, setNewIndentPriority] = useState('Normal');
  const [newIndentRemarks, setNewIndentRemarks] = useState('');
  const [selectedMedicines, setSelectedMedicines] = useState([]);
  const [medicineSearchQuery, setMedicineSearchQuery] = useState('');
  const [showMedicineSuggestions, setShowMedicineSuggestions] = useState(false);
  const [activeCustomRowFocus, setActiveCustomRowFocus] = useState(null);
  const [isHoveringCustomSuggestions, setIsHoveringCustomSuggestions] = useState(false);
  const [newIndentAdditionalNotes, setNewIndentAdditionalNotes] = useState('');
  const [newIndentAttachments, setNewIndentAttachments] = useState([]);
  const [showReqByDropdown, setShowReqByDropdown] = useState(false);

  const [loading, setLoading] = useState(false);


  const [selectedAppointment, setSelectedAppointment] = useState(null);
  const [detailsModalOpen, setDetailsModalOpen] = useState(false);
  const [showOnlineReviewModal, setShowOnlineReviewModal] = useState(false);
  const [selectedOnlineRequest, setSelectedOnlineRequest] = useState(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showProfileMenu, setShowProfileMenu] = useState(false);

  const [rescheduleAvailability, setRescheduleAvailability] = useState({ available: true, slots: [], reason: null });

  useEffect(() => {
    const fetchRescheduleAvailability = async () => {
      if (!detailsModalOpen || !selectedAppointment) return;
      const docId = selectedAppointment.doctorId?._id || selectedAppointment.doctorId;
      if (!docId || !selectedAppointment.date) return;

      let dStr;
      try {
        dStr = new Date(selectedAppointment.date).toISOString().split('T')[0];
      } catch (e) {
        return;
      }

      try {
        const availRes = await api.get(`/hr/doctor-availability/${docId}?date=${dStr}`);
        setRescheduleAvailability(availRes.data);
      } catch (err) {
        console.error("Failed to fetch reschedule doctor availability:", err);
        const docSlots = selectedAppointment.doctorId?.doctorSlots?.length > 0 ? selectedAppointment.doctorId.doctorSlots : DEFAULT_RECEPTION_SLOTS;
        setRescheduleAvailability({ available: true, slots: docSlots, reason: null });
      }
    };

    fetchRescheduleAvailability();
  }, [detailsModalOpen, selectedAppointment?.date, selectedAppointment?.doctorId]);

  const [selectedAppointmentDetails, setSelectedAppointmentDetails] = useState({ prescriptions: [], labs: [] });

  useEffect(() => {
    const fetchAppointmentDetails = async () => {
      if (!detailsModalOpen || !selectedAppointment) return;
      const appId = selectedAppointment._id;
      
      try {
        // Fetch prescriptions and filter by appointmentId
        const pRes = await api.get('/prescriptions');
        const matchingPrescriptions = (pRes.data || []).filter(p => {
          const pAppId = p.appointmentId?._id || p.appointmentId;
          return String(pAppId) === String(appId);
        });

        // Fetch lab tests and filter by appointmentId
        const lRes = await api.get('/labs');
        const matchingLabs = (lRes.data || []).filter(l => {
          const lAppId = l.appointmentId?._id || l.appointmentId;
          return String(lAppId) === String(appId);
        });

        setSelectedAppointmentDetails({
          prescriptions: matchingPrescriptions,
          labs: matchingLabs
        });
      } catch (err) {
        console.error("Error fetching appointment details:", err);
        setSelectedAppointmentDetails({ prescriptions: [], labs: [] });
      }
    };

    fetchAppointmentDetails();
  }, [detailsModalOpen, selectedAppointment?._id]);

  const [isExistingPatient, setIsExistingPatient] = useState(null); // null = choose mode, true = existing, false = new register
  const [searchPatientQuery, setSearchPatientQuery] = useState('');
  const [pendingRegistrationPayload, setPendingRegistrationPayload] = useState(null);
  const [selectedPatient, setSelectedPatient] = useState(null);
  const [reschedulingAppointment, setReschedulingAppointment] = useState(null);
  
  // Patient Profile Details States
  const [selectedProfileAppointment, setSelectedProfileAppointment] = useState(null);
  const [isReschedulingProfileAppt, setIsReschedulingProfileAppt] = useState(false);
  const [rescheduleProfileDate, setRescheduleProfileDate] = useState('');
  const [rescheduleProfileTime, setRescheduleProfileTime] = useState('');
  const [prescriptionModalOpen, setPrescriptionModalOpen] = useState(false);
  const [selectedPrescription, setSelectedPrescription] = useState(null);
  const [labModalOpen, setLabModalOpen] = useState(false);
  const [selectedLabRequest, setSelectedLabRequest] = useState(null);
  const [allLabsModalOpen, setAllLabsModalOpen] = useState(false);
  const [patientLabReports, setPatientLabReports] = useState([]);
  const [selectedReportDetail, setSelectedReportDetail] = useState(null);
  const [selectedIndent, setSelectedIndent] = useState(null);
  const [showIndentModal, setShowIndentModal] = useState(false);
  
  // Date range filter states
  const [showDateFilter, setShowDateFilter] = useState(false);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // Patient Management search and filter states
  const [patientSearchText, setPatientSearchText] = useState('');
  const [showPatientFilters, setShowPatientFilters] = useState(false);
  const [patientGenderFilter, setPatientGenderFilter] = useState('All');
  const [patientStartRegDate, setPatientStartRegDate] = useState('');
  const [patientEndRegDate, setPatientEndRegDate] = useState('');
  const [patientBookingTypeFilter, setPatientBookingTypeFilter] = useState('All');
  const [globalSearchQuery, setGlobalSearchQuery] = useState('');
  const [showGlobalDropdown, setShowGlobalDropdown] = useState(false);
  const [appointmentSearch, setAppointmentSearch] = useState('');
  const [apptTypeFilter, setApptTypeFilter] = useState('All');
  const [staffSearch, setStaffSearch] = useState('');
  const [billingSearch, setBillingSearch] = useState('');
  const [patientVitals, setPatientVitals] = useState([]);
  const [patientClinicalNotes, setPatientClinicalNotes] = useState([]);
  const [patientPrescriptions, setPatientPrescriptions] = useState([]);
  const [patientLabTests, setPatientLabTests] = useState([]);
  const [showVitalsModal, setShowVitalsModal] = useState(false);
  const [vitalsCollapsed, setVitalsCollapsed] = useState(true);
  const [docsCollapsed, setDocsCollapsed] = useState(true);
  const [symptomSearchQuery, setSymptomSearchQuery] = useState('');
  const [vitalTemp, setVitalTemp] = useState('');
  const [vitalPulse, setVitalPulse] = useState('');
  const [vitalBpSys, setVitalBpSys] = useState('');
  const [vitalBpDia, setVitalBpDia] = useState('');
  const [vitalResp, setVitalResp] = useState('');
  const [vitalSpo2, setVitalSpo2] = useState('');
  const [vitalWeight, setVitalWeight] = useState('');
  const [vitalHeight, setVitalHeight] = useState('');
  const [bookingDiscountPercent, setBookingDiscountPercent] = useState(0);
  const [bookingDiscountReason, setBookingDiscountReason] = useState('');


  const getFormattedPatientId = (patientId, patientRaw) => {
    if (patientRaw?.patientId) return patientRaw.patientId;
    if (!patientId) return 'pat-00';
    const idStr = patientId.toString();
    if (idStr.toLowerCase().startsWith('pat-')) return idStr;
    const found = patientsList.find(p => p._id === idStr || p.id === idStr);
    if (found?.patientId) return found.patientId;
    if (idStr.length >= 24) {
      return `pat-${idStr.substring(22).toUpperCase()}`;
    }
    return `pat-${idStr.toUpperCase()}`;
  };

  const getNormalizedDateStr = (dateVal) => {
    if (!dateVal) return '';
    try {
      if (typeof dateVal === 'string' && dateVal.includes('T')) {
        return dateVal.split('T')[0];
      }
      const d = new Date(dateVal);
      if (isNaN(d.getTime())) return '';
      if (typeof dateVal === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateVal)) {
        return dateVal;
      }
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    } catch (e) {
      return '';
    }
  };

  const getFormattedDate = (dateStr) => {
    if (!dateStr) return '';
    try {
      return new Date(dateStr).toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: 'numeric' }) + ' - ';
    } catch (e) {
      return '';
    }
  };

  const getFilteredPatientsList = () => {
    return patientsList.filter(p => {
      // 1. Search Query
      const query = patientSearchText.toLowerCase().trim();
      if (query) {
        const nameMatch = p.name?.toLowerCase().includes(query);
        const idMatch = p._id?.toLowerCase().includes(query);
        const formattedId = getFormattedPatientId(p._id)?.toLowerCase().includes(query);
        const contactMatch = p.contact?.toLowerCase().includes(query);
        const emailMatch = p.email?.toLowerCase().includes(query);
        if (!nameMatch && !idMatch && !formattedId && !contactMatch && !emailMatch) {
          return false;
        }
      }

      // 2. Gender
      if (patientGenderFilter !== 'All') {
        if (p.gender?.toLowerCase() !== patientGenderFilter.toLowerCase()) {
          return false;
        }
      }

      // 3. Registration Date (calrender thing)
      if (p.createdAt) {
        const regDate = new Date(p.createdAt);
        const regDateOnly = new Date(regDate.getFullYear(), regDate.getMonth(), regDate.getDate());

        if (patientStartRegDate) {
          const start = new Date(patientStartRegDate);
          const startOnly = new Date(start.getFullYear(), start.getMonth(), start.getDate());
          if (regDateOnly < startOnly) return false;
        }

        if (patientEndRegDate) {
          const end = new Date(patientEndRegDate);
          const endOnly = new Date(end.getFullYear(), end.getMonth(), end.getDate());
          if (regDateOnly > endOnly) return false;
        }
      }

      // 4. Booking Type Filter
      if (patientBookingTypeFilter !== 'All') {
        if (patientBookingTypeFilter === 'Appointments') {
          const patientAppointments = (appointments || []).filter(app => {
            const appPatId = app.patientId?._id || app.patientId;
            return appPatId && p._id && appPatId.toString() === p._id.toString();
          });
          if (patientAppointments.length === 0) return false;
        }

        if (patientBookingTypeFilter === 'Lab Tests') {
          const patientLabs = (coverageLabRequests || []).filter(lab => {
            const labPatId = lab.rawItem?.patientId?._id || lab.rawItem?.patientId || lab.patientId;
            return labPatId && p._id && labPatId.toString() === p._id.toString();
          });
          const patientBills = (bills || []).filter(b => {
            const billPatId = b.patientId?._id || b.patientId;
            return billPatId && p._id && billPatId.toString() === p._id.toString();
          });
          const hasLabInBills = patientBills.some(b => 
            (b.items || []).some(item => (item.description || '').toLowerCase().includes('lab test:'))
          );
          const hasLabInRequests = patientLabs.length > 0;
          if (!hasLabInRequests && !hasLabInBills) return false;
        }

        if (patientBookingTypeFilter === 'Clinical Services') {
          const patientBills = (bills || []).filter(b => {
            const billPatId = b.patientId?._id || b.patientId;
            return billPatId && p._id && billPatId.toString() === p._id.toString();
          });
          const hasService = patientBills.some(b => 
            (b.items || []).some(item => (item.description || '').toLowerCase().includes('clinical procedure:'))
          );
          if (!hasService) return false;
        }
      }

      return true;
    });
  };

  const handleExportPatientsCSV = () => {
    const filtered = getFilteredPatientsList();
    if (filtered.length === 0) {
      showToast("No patients to export.", "info");
      return;
    }
    
    // Define CSV headers
    const headers = ["Patient ID", "Name", "Gender", "Mobile Number", "Email", "Registration Date & Time"];
    
    // Map patient data to CSV rows
    const rows = filtered.map(p => {
      const regDate = p.createdAt ? `${new Date(p.createdAt).toLocaleDateString()} ${new Date(p.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : 'N/A';
      return [
        getFormattedPatientId(p._id),
        p.name || '',
        p.gender || '',
        p.contact || '',
        p.email || '',
        regDate
      ].map(val => `"${String(val || '').replace(/"/g, '""')}"`).join(",");
    });
    
    const csvContent = [headers.join(","), ...rows].join("\n");
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `patients_export_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    
    showToast("Patients list exported successfully as CSV", "success");
  };

  const handleExportBillingCSV = () => {
    if (bills.length === 0) {
      showToast("No billing records to export.", "info");
      return;
    }

    const headers = ["Invoice ID", "Patient Name", "Date & Time", "Items", "Amount", "Payment Method", "Status"];

    const rows = bills.map(bill => {
      const invoiceId = `INV-${(bill._id || '').substring(Math.max(0, (bill._id || '').length - 6)).toUpperCase() || 'N/A'}`;
      const patientName = bill.patientId?.name || 'Unknown Patient';
      const dateTime = bill.createdAt ? `${new Date(bill.createdAt).toLocaleDateString()} ${new Date(bill.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : 'N/A';
      const items = (bill.items || []).map(i => `${String(i.description || '')} (₹${i.amount || 0})`).join('; ');
      const amount = `₹${(bill.totalAmount || 0).toFixed(2)}`;
      const paymentMethod = bill.paymentMethod || 'N/A';
      const status = bill.status || 'Unpaid';
      return [invoiceId, patientName, dateTime, items, amount, paymentMethod, status]
        .map(val => `"${String(val || '').replace(/"/g, '""')}"`).join(",");
    });

    const csvContent = [headers.join(","), ...rows].join("\n");
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `billing_export_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 1000);

    showToast("Billing report exported successfully as CSV", "success");
  };

  const handleMarkAsPaid = async (billId, paymentData = {}) => {
    try {
      const payload = {
        status: 'Paid',
        paymentMethod: paymentData.paymentMethod || 'Cash',
        discountPercent: paymentData.discountPercent || 0,
        discountAmount: paymentData.discountAmount || 0,
        originalAmount: paymentData.originalAmount || paymentData.totalAmount,
        totalAmount: paymentData.totalAmount,
        discountReason: paymentData.discountReason || ''
      };
      await api.put(`/billing/${billId}`, payload);
      showToast("Billing status updated to Paid successfully!", "success");
      fetchData();
    } catch (err) {
      console.error(err);
      showToast("Failed to update billing status.", "error");
    }
  };

  const handleMarkAsPaidSubmit = async (e) => {
    e.preventDefault();
    if (!selectedBillForPayment) return;
    
    if (discountPercent > allowedDiscountPercent) {
      showToast(`Discount cannot exceed the limit of ${allowedDiscountPercent}%`, 'error');
      return;
    }
    if (discountPercent > 0 && !discountReason.trim()) {
      showToast("Please provide a reason for the discount.", "error");
      return;
    }

    const origAmt = selectedBillForPayment.totalAmount;
    const discAmt = (origAmt * discountPercent) / 100;
    const finalAmt = origAmt - discAmt;

    try {
      setIsSettlingPayment(true);
      if (selectedBillForPayment.isPending && pendingRegistrationPayload) {
        // Execute deferred API calls
        let finalPatientId = pendingRegistrationPayload.patientId;
        
        if (!pendingRegistrationPayload.isExistingPatient) {
          const patientRes = await api.post('/patients', pendingRegistrationPayload.patientData);
          finalPatientId = patientRes.data._id;
          
          // Clear draft now that registration is successful
          if (pendingRegistrationPayload.patientData.contact) {
            localStorage.removeItem('curoxa_draft_' + pendingRegistrationPayload.patientData.contact);
          }
        }

        if (pendingRegistrationPayload.isLabOnly) {
          // Direct Lab Test Order Execution (No Doctor Required)
          await api.post('/labs', {
            patientId: finalPatientId,
            testName: pendingRegistrationPayload.labData.testName,
            notes: pendingRegistrationPayload.labData.notes || 'Direct Reception Walk-In Lab Test',
            status: 'Pending'
          });

          await api.post('/billing', {
            patientId: finalPatientId,
            items: pendingRegistrationPayload.billingData.items,
            originalAmount: origAmt,
            discountPercent: Number(discountPercent),
            discountAmount: discAmt,
            totalAmount: finalAmt,
            paymentMethod: paymentMethod,
            discountReason: discountPercent > 0 ? discountReason.trim() : '',
            status: 'Paid'
          });

          const patientObj = pendingRegistrationPayload.patientData || selectedPatient || formData;
          setActiveSlipData({
            receiptNo: `REC-${Date.now().toString().slice(-6)}`,
            date: new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }),
            patientName: patientObj.name || 'Patient',
            patientId: getFormattedPatientId(finalPatientId),
            contact: patientObj.contact || 'N/A',
            ageGender: `${patientObj.age || 'N/A'} / ${patientObj.gender || 'N/A'}`,
            testName: pendingRegistrationPayload.labData?.testName || selectedLabTest,
            items: pendingRegistrationPayload.billingData?.items || [{ description: selectedLabTest, amount: origAmt }],
            originalAmount: origAmt,
            discountAmount: discAmt,
            totalAmount: finalAmt,
            paymentMethod: paymentMethod,
            hospitalName: currentUser.tenantName || 'Curoxa Medical Center'
          });
          setShowSlipPdfModal(true);

          showToast("Direct Lab Order & Payment completed successfully! Receipt generated.", "success");
        } else if (pendingRegistrationPayload.isServiceOnly) {
          // Direct Clinical Service / Procedure Execution (Dental, Root Canal, Braces, etc.)
          await api.post('/billing', {
            patientId: finalPatientId,
            items: pendingRegistrationPayload.billingData.items,
            originalAmount: origAmt,
            discountPercent: Number(discountPercent),
            discountAmount: discAmt,
            totalAmount: finalAmt,
            paymentMethod: paymentMethod,
            discountReason: discountPercent > 0 ? discountReason.trim() : '',
            status: 'Paid'
          });

          const patientObj = pendingRegistrationPayload.patientData || selectedPatient || formData;
          setActiveSlipData({
            receiptNo: `REC-${Date.now().toString().slice(-6)}`,
            date: new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }),
            patientName: patientObj.name || 'Patient',
            patientId: getFormattedPatientId(finalPatientId),
            contact: patientObj.contact || 'N/A',
            ageGender: `${patientObj.age || 'N/A'} / ${patientObj.gender || 'N/A'}`,
            testName: pendingRegistrationPayload.serviceData?.serviceName || selectedServicesList.map(s => s.serviceName).join(', ') || 'Clinical Procedure',
            items: pendingRegistrationPayload.billingData?.items || [{ description: 'Clinical Procedure', amount: origAmt }],
            originalAmount: origAmt,
            discountAmount: discAmt,
            totalAmount: finalAmt,
            paymentMethod: paymentMethod,
            hospitalName: currentUser.tenantName || 'Curoxa Medical Center'
          });
          setShowSlipPdfModal(true);

          showToast("Direct Clinical Service Payment & Receipt completed successfully!", "success");
        } else {
          // Doctor OPD Appointment Booking Execution (supports single or multiple appointments)
          const apptsToCreate = pendingRegistrationPayload.appointmentsList || [pendingRegistrationPayload.appointmentData];
          let primaryApptId = null;

          for (const apptItem of apptsToCreate) {
            const appointmentRes = await api.post('/appointments', {
              patientId: finalPatientId,
              doctorId: apptItem.doctorId,
              date: apptItem.date,
              time: apptItem.time,
              reason: apptItem.reason
            });
            if (!primaryApptId) primaryApptId = appointmentRes.data._id;
          }

          await api.post('/billing', {
            patientId: finalPatientId,
            appointmentId: primaryApptId,
            items: pendingRegistrationPayload.billingData.items,
            originalAmount: origAmt,
            discountPercent: Number(discountPercent),
            discountAmount: discAmt,
            totalAmount: finalAmt,
            paymentMethod: paymentMethod,
            discountReason: discountPercent > 0 ? discountReason.trim() : '',
            status: 'Paid'
          });

          const patientObj = pendingRegistrationPayload.patientData || selectedPatient || formData;
          setActiveSlipData({
            receiptNo: `REC-${Date.now().toString().slice(-6)}`,
            date: new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }),
            patientName: patientObj.name || 'Patient',
            patientId: getFormattedPatientId(finalPatientId),
            contact: patientObj.contact || 'N/A',
            ageGender: `${patientObj.age || 'N/A'} / ${patientObj.gender || 'N/A'}`,
            testName: 'OPD Consultation & Booking Fee',
            items: pendingRegistrationPayload.billingData?.items || [{ description: 'OPD Consultation Fee', amount: origAmt }],
            originalAmount: origAmt,
            discountAmount: discAmt,
            totalAmount: finalAmt,
            paymentMethod: paymentMethod,
            hospitalName: currentUser.tenantName || 'Curoxa Medical Center'
          });
          setShowSlipPdfModal(true);

          showToast(`${apptsToCreate.length} Appointment(s) registered & Payment completed successfully!`, "success");
        }

        // Save vitals if any of them are filled in the form
        if (vitalTemp || vitalPulse || vitalBpSys || vitalBpDia || vitalResp || vitalSpo2 || vitalWeight || vitalHeight) {
          try {
            await api.post('/emr/vitals', {
              patientId: finalPatientId,
              temperature: vitalTemp ? parseFloat(vitalTemp) : undefined,
              pulse: vitalPulse ? parseInt(vitalPulse) : undefined,
              bpSys: vitalBpSys ? parseInt(vitalBpSys) : undefined,
              bpDia: vitalBpDia ? parseInt(vitalBpDia) : undefined,
              respiration: vitalResp ? parseInt(vitalResp) : undefined,
              spo2: vitalSpo2 ? parseInt(vitalSpo2) : undefined,
              weight: vitalWeight ? parseFloat(vitalWeight) : undefined,
              height: vitalHeight ? parseFloat(vitalHeight) : undefined
            });
            // Clear vitals form fields
            setVitalTemp('');
            setVitalPulse('');
            setVitalBpSys('');
            setVitalBpDia('');
            setVitalResp('');
            setVitalSpo2('');
            setVitalWeight('');
            setVitalHeight('');
          } catch (err) {
            console.error("Failed to save vitals during registration flow:", err);
          }
        }

        setPendingRegistrationPayload(null);
        
        // Reset form
        resetRegistrationForm();
        switchTab('appointments');
      } else {
        // Normal billing flow
        const payload = {
          status: 'Paid',
          paymentMethod: paymentMethod,
          discountPercent: Number(discountPercent),
          discountAmount: discAmt,
          originalAmount: origAmt,
          totalAmount: finalAmt,
          discountReason: discountPercent > 0 ? discountReason.trim() : ''
        };
        await api.put(`/billing/${selectedBillForPayment._id}`, payload);
        
        // Sync the associated appointment status to Paid
        const apptId = selectedBillForPayment.appointmentId?._id || selectedBillForPayment.appointmentId;
        if (apptId) {
          await api.put(`/appointments/${apptId}`, { status: 'Paid' }).catch(err => {
            console.warn("Failed to sync appointment status to Paid:", err);
          });
        }

        const patientObj = selectedBillForPayment.patientId || {};
        setActiveSlipData({
          receiptNo: `REC-${(selectedBillForPayment._id || '').slice(-6).toUpperCase()}`,
          date: new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }),
          patientName: patientObj.name || 'Patient',
          patientId: getFormattedPatientId(patientObj._id || selectedBillForPayment.patientId),
          contact: patientObj.contact || 'N/A',
          ageGender: `${patientObj.age || 'N/A'} / ${patientObj.gender || 'N/A'}`,
          testName: (selectedBillForPayment.items || []).map(i => i.description).join(', ') || 'Medical Services',
          items: selectedBillForPayment.items || [{ description: 'Hospital Services', amount: finalAmt }],
          originalAmount: origAmt,
          discountAmount: discAmt,
          totalAmount: finalAmt,
          paymentMethod: paymentMethod,
          hospitalName: currentUser.tenantName || 'Curoxa Medical Center'
        });
        setShowSlipPdfModal(true);

        showToast("Billing status updated to Paid successfully! Receipt generated.", "success");
      }

      setShowPaymentModal(false);
      setSelectedBillForPayment(null);
      fetchData();
    } catch (err) {
      console.error(err);
      showToast(err.response?.data?.error || "Failed to process payment and registration.", "error");
    } finally {
      setIsSettlingPayment(false);
    }
  };

  // Helper function to map live MongoDB appointments
  const getLatestAppointmentsList = () => {
    return filteredAppointments.map((app, idx) => {
      const pId = app.patientId?._id || app.patientId;
      const formattedId = getFormattedPatientId(pId);
      return {
        patientId: { _id: formattedId, name: app.patientId?.name || 'Anonymous Patient' },
        doctorId: { name: app.doctorId?.name || 'Dr. Andrew Clark' },
        status: app.status || 'Upcoming',
        time: app.time || '09:00 AM to 10:00 AM',
        rawObj: app
      };
    });
  };

  // Premium Custom Toast Notifications
  const [notification, setNotification] = useState(null); // { message: '', type: 'success' | 'error' }
  const showToast = (message, type = 'success') => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 3000);
  };

  const openOnlineRequestReviewModal = (app) => {
    // Merge full patient object from patientsList if available
    const pId = app.patientId?._id || app.patientId;
    const fullPatient = patientsList.find(p => String(p._id) === String(pId)) || app.patientId;
    setSelectedOnlineRequest({
      ...app,
      patientId: fullPatient
    });
    setShowOnlineReviewModal(true);
  };

  const openDetailsModal = (app) => {
    setSelectedAppointment({ ...app });
    setDetailsModalOpen(true);
    setShowDeleteConfirm(false);
    setTimeout(() => window.lucide && window.lucide.createIcons(), 100);
  };

  const handleUpdateWeeklyOff = async (doctorId, newWeeklyOff) => {
    try {
      await api.put(`/auth/users/${doctorId}/weekly-off`, { weeklyOff: newWeeklyOff });
      setDoctors(prev => prev.map(doc => doc._id === doctorId ? { ...doc, weeklyOff: newWeeklyOff } : doc));
      showToast("Weekly off updated successfully", "success");
    } catch (err) {
      console.error("Failed to update weekly off:", err);
      showToast("Failed to update weekly off", "error");
    }
  };

  const handleUpdateAppointment = async (app) => {
    try {
      // Optimistically update appointments state!
      setAppointments(prev => prev.map(a => a._id === app._id ? { ...a, status: app.status, time: app.time, date: app.date, doctorId: app.doctorId } : a));

      const doctorIdToUpdate = typeof app.doctorId === 'object' ? app.doctorId._id : app.doctorId;
      await api.put(`/appointments/${app._id}`, { status: app.status, time: app.time, date: app.date, doctorId: doctorIdToUpdate });
      
      // If the status is updated to 'Paid', find the associated bill and mark it as Paid too!
      if (app.status === 'Paid') {
        const associatedBill = bills.find(b => {
          const appBId = b.appointmentId?._id || b.appointmentId;
          return appBId && appBId.toString() === app._id.toString();
        });
        if (associatedBill && associatedBill.status !== 'Paid') {
          // Optimistically update bills state!
          setBills(prev => prev.map(b => b._id === associatedBill._id ? { ...b, status: 'Paid' } : b));
          await api.put(`/billing/${associatedBill._id}`, { status: 'Paid', paymentMethod: 'Cash' });
        }
      }

      showToast("Appointment updated successfully", "success");
      setDetailsModalOpen(false);
      fetchData();
    } catch (error) {
      console.error(error);
      showToast("Failed to update appointment", "error");
      fetchData();
    }
  };

  const handleDeleteAppointment = async (id) => {
    try {
      // Optimistically update appointments state!
      setAppointments(prev => prev.filter(a => a._id !== id));

      await api.delete(`/appointments/${id}`);
      showToast("Appointment deleted successfully", "success");
      setDetailsModalOpen(false);
      fetchData();
    } catch (error) {
      console.error(error);
      showToast("Failed to delete appointment", "error");
      fetchData();
    }
  };

  const handleDeleteAllPatients = async () => {
    if (!window.confirm("WARNING: Are you absolutely sure you want to delete ALL patients in this hospital? This action is irreversible and for testing purposes only.")) {
      return;
    }
    try {
      setLoading(true);
      const res = await api.delete('/patients/danger/delete-all-patients');
      showToast(res.data?.message || "All patients deleted successfully.", "success");
      fetchData();
    } catch (error) {
      console.error(error);
      showToast("Failed to delete all patients", "error");
      fetchData();
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmCoveragePharmacyPayment = async () => {
    if (coveragePharmacyPaymentMode === 'Cash') {
      const cashNum = Number(coveragePharmacyCashReceived);
      const totalDue = selectedCoveragePharmacyRx.amountVal || 550;
      if (!coveragePharmacyCashReceived || cashNum < totalDue) {
        showToast('Insufficient cash received amount', 'error');
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
        console.error("Failed to auto-create billing record from receptionist pharmacy coverage dispense", billingErr);
      }

      showToast(`Payment of ₹${(selectedCoveragePharmacyRx.amountVal || 550).toFixed(2)} settled via ${coveragePharmacyPaymentMode}. Prescription dispensed successfully!`, 'success');
      setShowCoveragePharmacyPaymentModal(false);
      setSelectedCoveragePharmacyRx(null);
      fetchCoverageData();
    } catch (err) {
      console.error(err);
      showToast('Failed to settle payment and dispense prescription.', 'error');
    }
  };

  const parseResults = (resultsStr) => {
    if (!resultsStr) return { parameters: {}, remarks: '', isDraft: false };
    try {
      return JSON.parse(resultsStr);
    } catch (e) {
      return { parameters: {}, remarks: resultsStr || '', isDraft: false };
    }
  };

  const fetchCoverageData = async () => {
    try {
      // Fetch lab reagents / inventory for lab coverage
      const labInvRes = await api.get('/lab-inventory');
      if (labInvRes.data && Array.isArray(labInvRes.data)) {
        setCoverageReagents(labInvRes.data.map(item => ({
          id: item._id,
          name: item.name || 'Unknown Reagent',
          level: `${item.stock || 0} ${item.unit || 'units'}`,
          minSafe: `${item.threshold || 0} ${item.unit || 'units'}`,
          status: (item.stock || 0) <= (item.threshold || 0) ? 'Low Stock' : 'Safe'
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

      // Fetch pharmacy queue (pending prescriptions) for pharmacy coverage
      const rxRes = await api.get('/prescriptions');
      if (rxRes.data && Array.isArray(rxRes.data)) {
        const pending = rxRes.data
          .filter(rx => rx.status === 'Pending Pharmacy Dispatch' || rx.status === 'Pending')
          .slice(0, 10)
          .map(rx => {
            const amountVal = rx.items ? rx.items.reduce((acc, curr) => acc + (curr.price || 50) * (curr.quantity || 1), 0) : 220;
            return {
              id: rx._id,
              patient: rx.patientId?.name || 'Unknown',
              patientId: rx.patientId?._id || rx.patientId,
              med: rx.items?.map(i => `${i.medicine} (${i.dosage || '1 Tab'})`).join(', ') || 'No items',
              qty: rx.items?.reduce((sum, i) => sum + (i.quantity || 1), 0) || 0,
              type: rx.items?.[0]?.category || 'Rx',
              items: rx.items || [],
              amountVal
            };
          });
        setCoveragePharmacyQueue(pending);
      }

      // Fetch pharmacy inventory for stock view
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

      // Fetch consultations / appointments for doctor coverage
      const appsRes = await api.get('/appointments');
      if (appsRes.data && Array.isArray(appsRes.data)) {
        const today = new Date().toISOString().split('T')[0];
        const todayApps = appsRes.data.filter(a => a.date && a.date.startsWith(today));
        const sortedTodayApps = [...todayApps].sort((a, b) => {
          const aCompleted = a.status === 'Completed' || a.status === 'Cancelled' || a.status === 'Checked Out';
          const bCompleted = b.status === 'Completed' || b.status === 'Cancelled' || b.status === 'Checked Out';
          if (aCompleted && !bCompleted) return 1;
          if (!aCompleted && bCompleted) return -1;

          const dateA = a.createdAt || a._id || 0;
          const dateB = b.createdAt || b._id || 0;
          return new Date(dateB) - new Date(dateA);
        });
        setCoverageConsultations(sortedTodayApps.map(app => ({
          id: app._id,
          name: app.patientId?.name || 'Unknown',
          age: app.patientId?.age || 0,
          gender: app.patientId?.gender || 'N/A',
          symptoms: app.reason || 'General Checkup',
          status: app.status || 'Upcoming',
          notes: app.notes || '',
          diagnosis: app.diagnosis || '',
          patientId: app.patientId?._id || ''
        })));
      }
    } catch (err) {
      console.error("Failed to fetch coverage data", err);
    }
  };

  const fetchData = async () => {
    try {
      const pts = await api.get('/patients');
      const sortedPatients = (pts.data || []).sort((a, b) => {
        if (a.createdAt && b.createdAt) {
          return new Date(b.createdAt) - new Date(a.createdAt);
        }
        if (a._id && b._id) {
          return b._id.localeCompare(a._id);
        }
        return 0;
      });
      setPatientsList(sortedPatients);

      const [appsRes, docsRes, staffRes, indentsRes, medsRes, billsRes] = await Promise.all([
        api.get('/appointments'),
        api.get('/auth/doctors'),
        api.get('/auth/users/all').catch(() => ({ data: [] })),
        api.get('/indents'),
        api.get('/medicines'),
        api.get('/billing')
      ]);

      const sortedApps = (appsRes.data || []).sort((a, b) => {
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
      setDoctors(docsRes.data);
      setStaffList(staffRes.data || []);
      setIndents(indentsRes.data);
      setMedicines(medsRes.data);
      setBills(billsRes.data);

      try {
        const labTestsRes = await api.get('/lab-tests');
        if (labTestsRes.data && Array.isArray(labTestsRes.data) && labTestsRes.data.length > 0) {
          const formatted = labTestsRes.data.map(item => ({
            testName: item.testName || item.name,
            testCode: item.testCode || item.code || 'LAB-100',
            category: item.category || 'Pathology',
            price: Number(item.price || item.fee || 0)
          }));
          setHospitalLabTests(formatted);
          
          // Auto sync price of currently selected test
          const matched = formatted.find(t => t.testName === selectedLabTest);
          if (matched) {
            setSelectedLabPrice(matched.price);
          }
        }
      } catch (e) {
        console.error("Failed to fetch hospital lab tests:", e);
      }

      try {
        const clinicalSrvRes = await api.get('/clinical-services');
        if (clinicalSrvRes.data && Array.isArray(clinicalSrvRes.data) && clinicalSrvRes.data.length > 0) {
          const formattedSrv = clinicalSrvRes.data.map(item => ({
            serviceName: item.serviceName,
            serviceCode: item.serviceCode || 'SRV-100',
            department: item.department || 'Dental',
            price: Number(item.price || 0)
          }));
          setHospitalClinicalServices(formattedSrv);
        }
      } catch (e) {
        console.error("Failed to fetch clinical services:", e);
      }

      try {
        const discountSettingRes = await api.get('/billing/discount-setting');
        setAllowedDiscountPercent(discountSettingRes.data.allowedDiscountPercent);
      } catch (discErr) {
        console.error("Failed to fetch discount setting", discErr);
      }


      // Also refresh coverage-related data
      await fetchCoverageData();
    } catch (err) {
      console.error("Failed to fetch data", err);
    }
  };

  const handleCreateLabOrder = async () => {
    if (selectedLabTestsList.length === 0) {
      showToast("Please add at least one lab test to the order.", "error");
      return;
    }
    if (!bookingPaymentMethod) {
      showToast("Please select a payment method.", "error");
      return;
    }
    if (Number(bookingDiscountPercent) > 0 && !bookingDiscountReason.trim()) {
      showToast("Please provide a reason for the discount.", "error");
      return;
    }
    if (!isExistingPatient && (!formData.name || !formData.contact)) {
      showToast("Please provide Patient Name and Contact Number.", "error");
      return;
    }

    try {
      setLoading(true);
      let targetPatientId = selectedPatient?._id;
      let patientObj = selectedPatient || formData;

      if (!isExistingPatient) {
        const pRes = await api.post('/patients', {
          name: formData.name,
          age: formData.age,
          gender: formData.gender,
          contact: formData.contact,
          email: formData.email,
          bloodGroup: formData.bloodGroup,
          address: formData.address,
          medicalHistory: formData.medicalHistory,
          referredBy: formData.referredBy || ''
        });
        targetPatientId = pRes.data._id;
        patientObj = pRes.data;
      }

      // Create Lab orders for each selected test
      for (const testItem of selectedLabTestsList) {
        await api.post('/labs', {
          patientId: targetPatientId,
          testName: testItem.testName,
          notes: 'Direct Walk-In Laboratory Test Order',
          status: 'Pending'
        });
      }

      // Create Billing record listing all tests
      const items = selectedLabTestsList.map(t => ({
        description: `Lab Test: ${t.testName}`,
        amount: Number(t.price || 0)
      }));
      if (!isExistingPatient) {
        items.push({ description: 'Registration Fee', amount: 50 });
      }

      const origAmt = selectedLabTestsList.reduce((sum, t) => sum + Number(t.price || 0), 0) + (isExistingPatient ? 0 : 50);
      const discAmt = (origAmt * Number(bookingDiscountPercent || 0)) / 100;
      const finalAmt = Math.max(0, origAmt - discAmt);

      await api.post('/billing', {
        patientId: targetPatientId,
        items,
        originalAmount: origAmt,
        discountPercent: Number(bookingDiscountPercent || 0),
        discountAmount: discAmt,
        totalAmount: finalAmt,
        paymentMethod: bookingPaymentMethod,
        discountReason: discAmt > 0 ? bookingDiscountReason.trim() : '',
        status: 'Paid'
      });

      // Generate Slip PDF Data
      setActiveSlipData({
        receiptNo: `REC-${Date.now().toString().slice(-6)}`,
        date: new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }),
        patientName: patientObj.name || 'Patient',
        patientId: getFormattedPatientId(targetPatientId),
        contact: patientObj.contact || 'N/A',
        ageGender: `${patientObj.age || 'N/A'} / ${patientObj.gender || 'N/A'}`,
        testName: selectedLabTestsList.map(t => t.testName).join(', '),
        items,
        originalAmount: origAmt,
        discountAmount: discAmt,
        totalAmount: finalAmt,
        paymentMethod: bookingPaymentMethod,
        hospitalName: currentUser.tenantName || 'Curoxa Medical Center'
      });
      setShowSlipPdfModal(true);

      showToast(`Direct Lab Order (${selectedLabTestsList.length} tests) & Payment settled successfully!`, 'success');
      
      // Reset
      setSelectedLabTestsList([]);
      setBookingPaymentMethod('');
      setBookingDiscountPercent(0);
      setBookingDiscountReason('');
      fetchData();
    } catch (err) {
      console.error("Failed to create lab order:", err);
      showToast(err.response?.data?.error || "Failed to create lab order.", "error");
    } finally {
      setLoading(false);
    }
  };

  const handleCreateServiceOrder = async () => {
    if (selectedServicesList.length === 0) {
      showToast("Please add at least one clinical service/procedure.", "error");
      return;
    }
    if (!bookingPaymentMethod) {
      showToast("Please select a payment method.", "error");
      return;
    }
    if (Number(bookingDiscountPercent) > 0 && !bookingDiscountReason.trim()) {
      showToast("Please provide a reason for the discount.", "error");
      return;
    }
    if (!isExistingPatient && (!formData.name || !formData.contact)) {
      showToast("Please provide Patient Name and Contact Number.", "error");
      return;
    }

    try {
      setLoading(true);
      let targetPatientId = selectedPatient?._id;
      let patientObj = selectedPatient || formData;

      if (!isExistingPatient) {
        const pRes = await api.post('/patients', {
          name: formData.name,
          age: formData.age,
          gender: formData.gender,
          contact: formData.contact,
          email: formData.email,
          bloodGroup: formData.bloodGroup,
          address: formData.address,
          medicalHistory: formData.medicalHistory,
          referredBy: formData.referredBy || ''
        });
        targetPatientId = pRes.data._id;
        patientObj = pRes.data;
      }

      // Create Billing record listing all clinical services
      const items = selectedServicesList.map(s => ({
        description: `Clinical Procedure: ${s.serviceName}`,
        amount: Number(s.price || 0)
      }));
      if (!isExistingPatient) {
        items.push({ description: 'Registration Fee', amount: 50 });
      }

      const origAmt = selectedServicesList.reduce((sum, s) => sum + Number(s.price || 0), 0) + (isExistingPatient ? 0 : 50);
      const discAmt = (origAmt * Number(bookingDiscountPercent || 0)) / 100;
      const finalAmt = Math.max(0, origAmt - discAmt);

      await api.post('/billing', {
        patientId: targetPatientId,
        items,
        originalAmount: origAmt,
        discountPercent: Number(bookingDiscountPercent || 0),
        discountAmount: discAmt,
        totalAmount: finalAmt,
        paymentMethod: bookingPaymentMethod,
        discountReason: discAmt > 0 ? bookingDiscountReason.trim() : '',
        status: 'Paid'
      });

      // Generate Slip PDF Data
      setActiveSlipData({
        receiptNo: `REC-${Date.now().toString().slice(-6)}`,
        date: new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }),
        patientName: patientObj.name || 'Patient',
        patientId: getFormattedPatientId(targetPatientId),
        contact: patientObj.contact || 'N/A',
        ageGender: `${patientObj.age || 'N/A'} / ${patientObj.gender || 'N/A'}`,
        testName: selectedServicesList.map(s => s.serviceName).join(', '),
        items,
        originalAmount: origAmt,
        discountAmount: discAmt,
        totalAmount: finalAmt,
        paymentMethod: bookingPaymentMethod,
        hospitalName: currentUser.tenantName || 'Curoxa Medical Center'
      });
      setShowSlipPdfModal(true);

      showToast(`Clinical Procedure Order (${selectedServicesList.length} services) & Payment settled successfully!`, 'success');
      
      // Reset
      setSelectedServicesList([]);
      setBookingPaymentMethod('');
      setBookingDiscountPercent(0);
      setBookingDiscountReason('');
      fetchData();
    } catch (err) {
      console.error("Failed to create clinical service order:", err);
      showToast(err.response?.data?.error || "Failed to create clinical service order.", "error");
    } finally {
      setLoading(false);
    }
  };

  // Fetch doctor availability when doctor or date changes for reception booking
  useEffect(() => {
    const fetchReceptionAvailability = async () => {
      console.log("[RECEPTION_AVAIL] Triggered with doctorId:", formData.doctorId, "date:", bookingDate);
      if (!formData.doctorId || !bookingDate) {
        const selectedDoc = doctors.find(d => String(d._id) === String(formData.doctorId));
        const docSlots = selectedDoc?.doctorSlots?.length > 0 ? selectedDoc.doctorSlots : DEFAULT_RECEPTION_SLOTS;
        console.log("[RECEPTION_AVAIL] Missing doctor or date. Fallback slots:", docSlots);
        setReceptionDoctorAvailability({ available: true, slots: docSlots, reason: null });
        return;
      }
      try {
        const res = await api.get(`/hr/doctor-availability/${formData.doctorId}?date=${bookingDate}`);
        console.log("[RECEPTION_AVAIL] Success res.data:", res.data);
        setReceptionDoctorAvailability(res.data);
      } catch (err) {
        console.error("[RECEPTION_AVAIL] Error fetching from API:", err);
        const selectedDoc = doctors.find(d => String(d._id) === String(formData.doctorId));
        const docSlots = selectedDoc?.doctorSlots?.length > 0 ? selectedDoc.doctorSlots : DEFAULT_RECEPTION_SLOTS;
        console.log("[RECEPTION_AVAIL] Catch fallback slots:", docSlots);
        setReceptionDoctorAvailability({ available: true, slots: docSlots, reason: null });
      }
    };
    fetchReceptionAvailability();
  }, [formData.doctorId, bookingDate, doctors]);

  const getUnifiedAppointmentsList = () => {
    const list = [];

    // 1. Doctor appointments
    if (appointments && Array.isArray(appointments)) {
      appointments.forEach(app => {
        list.push({
          id: app._id || app.id,
          patientId: app.patientId,
          patientName: app.patientId?.name || 'Unknown Patient',
          type: 'Appointment',
          detailName: app.doctorId?.name || app.doctor || 'OPD Consultation',
          date: app.date,
          time: app.time || '',
          status: app.status || 'Pending',
          rawItem: app
        });
      });
    }

    // 2. Lab tests (from coverageLabRequests or labs)
    if (coverageLabRequests && Array.isArray(coverageLabRequests)) {
      coverageLabRequests.forEach(lab => {
        const labPatId = lab.rawItem?.patientId || lab.patientId;
        const patObj = typeof labPatId === 'object' ? labPatId : patientsList.find(p => p._id === String(labPatId));
        list.push({
          id: lab.id || lab._id,
          patientId: patObj || labPatId,
          patientName: patObj?.name || lab.name || 'Unknown Patient',
          type: 'Lab Test',
          detailName: lab.test || 'General Lab Test',
          date: lab.rawItem?.createdAt ? new Date(lab.rawItem.createdAt).toISOString().split('T')[0] : '',
          time: lab.rawItem?.createdAt ? new Date(lab.rawItem.createdAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : '',
          status: lab.status || 'Pending',
          rawItem: lab.rawItem || lab
        });
      });
    }

    // 3. Clinical services (from bills)
    if (bills && Array.isArray(bills)) {
      bills.forEach(bill => {
        const serviceItems = (bill.items || []).filter(item => (item.description || '').toLowerCase().includes('clinical procedure:'));
        serviceItems.forEach((item, idx) => {
          const serviceName = item.description.replace('Clinical Procedure:', '').trim();
          list.push({
            id: `${bill._id || bill.id}-${idx}`,
            patientId: bill.patientId,
            patientName: bill.patientId?.name || 'Unknown Patient',
            type: 'Clinical Service',
            detailName: serviceName,
            date: bill.createdAt ? new Date(bill.createdAt).toISOString().split('T')[0] : '',
            time: bill.createdAt ? new Date(bill.createdAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : '',
            status: bill.status || 'Paid',
            rawItem: bill
          });
        });
      });
    }

    return list;
  };

  const getFilteredAppointments = () => {
    const unified = getUnifiedAppointmentsList();
    return unified.filter(item => {
      // 1. Type & Status Filter
      if (apptTypeFilter === 'Pending Approval') {
        const isPending = item.status === 'Pending Approval' || item.status === 'Pending' || item.rawItem?.status === 'Pending Approval' || item.rawItem?.status === 'Pending';
        if (!isPending) return false;
      } else if (apptTypeFilter !== 'All' && item.type !== apptTypeFilter) {
        return false;
      }

      // 2. Date Range Filter
      if (item.date) {
        const itemDate = new Date(item.date);
        const itemDateOnly = new Date(itemDate.getFullYear(), itemDate.getMonth(), itemDate.getDate());

        if (startDate) {
          const start = new Date(startDate);
          const startOnly = new Date(start.getFullYear(), start.getMonth(), start.getDate());
          if (itemDateOnly < startOnly) return false;
        }
        if (endDate) {
          const end = new Date(endDate);
          const endOnly = new Date(end.getFullYear(), end.getMonth(), end.getDate());
          if (itemDateOnly > endOnly) return false;
        }
      }

      // 3. Search query
      const query = appointmentSearch.toLowerCase().trim();
      if (query) {
        const patientNameMatch = (item.patientName || '').toLowerCase().includes(query);
        const detailMatch = (item.detailName || '').toLowerCase().includes(query);
        if (!patientNameMatch && !detailMatch) return false;
      }

      return true;
    });
  };

  const fetchIndents = async () => {
    try {
      const res = await api.get('/indents');
      const sortedIndents = (res.data || []).sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
      setIndents(sortedIndents);
    } catch (err) {
      console.error("Failed to fetch indents:", err);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    const handleSync = (e) => {
      const { type } = e.detail;
      console.log('[SOCKET] ReceptionistDashboard received sync event for:', type);
      if (type === 'coverage') {
        fetchCoverageData();
      } else if (type === 'indents' || type === 'indent') {
        fetchIndents();
      } else if (type === 'all' || !type) {
        fetchData();
      }
    };
    window.addEventListener('curoxa_sync', handleSync);
    return () => window.removeEventListener('curoxa_sync', handleSync);
  }, []);

  // Fallback polling: refresh indent data every 8s so the Utility Requests
  // table stays current even if the socket event is dropped or the connection
  // was temporarily lost. Lightweight — only fetches /api/indents.
  useEffect(() => {
    const interval = setInterval(() => {
      fetchIndents();
    }, 8000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (selectedPatient) {
      // Find all appointments for this patient
      const patientApps = appointments.filter(app => {
        const pId = app.patientId?._id || app.patientId;
        const targetId = selectedPatient._id;
        return pId && targetId && pId.toString() === targetId.toString();
      });
      // Sort appointments by date descending (latest first)
      const sorted = [...patientApps].sort((a, b) => {
        return new Date(b.date || 0) - new Date(a.date || 0);
      });
      // Set the default selected appointment to the latest one
      if (sorted.length > 0) {
        setSelectedProfileAppointment(sorted[0]);
      } else {
        setSelectedProfileAppointment(null);
      }
    } else {
      setSelectedProfileAppointment(null);
    }
  }, [selectedPatient, appointments]);

  useEffect(() => {
    if (selectedProfileAppointment) {
      const d = new Date(selectedProfileAppointment.date);
      const dateVal = !isNaN(d.getTime()) ? d.toISOString().split('T')[0] : '';
      setRescheduleProfileDate(dateVal);
      setRescheduleProfileTime(selectedProfileAppointment.time || '');
    } else {
      setRescheduleProfileDate('');
      setRescheduleProfileTime('');
    }
    setIsReschedulingProfileAppt(false);
  }, [selectedProfileAppointment]);

  const getWeeklyData = () => {
    const data = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    for (let i = 6; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const dateStr = d.toLocaleDateString();
      const dayName = d.toLocaleDateString('en-US', { weekday: 'short' });
      
      data.push({
        label: dayName,
        fullDate: dateStr,
        count: 0,
        walkin: 0,
        online: 0
      });
    }

    // Timezone-safe and date-format robust parser to match local calendar dates
    const parseDateSafe = (dStr) => {
      if (!dStr) return null;
      if (typeof dStr === 'string') {
        const match = dStr.match(/^(\d{4})-(\d{2})-(\d{2})/);
        if (match) {
          const [, y, m, day] = match;
          if (dStr.endsWith('T00:00:00.000Z') || !dStr.includes('T') || dStr.includes('T00:00:00')) {
            return new Date(parseInt(y), parseInt(m) - 1, parseInt(day));
          }
        }
      }
      return new Date(dStr);
    };

    appointments.forEach(app => {
      const appDate = parseDateSafe(app.createdAt || app.date);
      if (!appDate) return;
      const appDateStr = appDate.toLocaleDateString();
      const dayData = data.find(d => d.fullDate === appDateStr);
      if (dayData) {
        dayData.count += 1;
        if (app.source === 'Online') {
          dayData.online += 1;
        } else {
          dayData.walkin += 1;
        }
      }
    });

    return data;
  };

  const weeklyData = getWeeklyData();
  const maxCount = Math.max(...weeklyData.map(d => Math.max(d.walkin, d.online)), 5);

  const totalWalkin = weeklyData.reduce((sum, d) => sum + d.walkin, 0);
  const totalOnline = weeklyData.reduce((sum, d) => sum + d.online, 0);
  const totalVisits = totalWalkin + totalOnline;
  
  const allTimeWalkin = appointments.filter(app => app.source !== 'Online').length;
  const allTimeOnline = appointments.filter(app => app.source === 'Online').length;
  const allTimeTotal = allTimeWalkin + allTimeOnline;

  const overallWalkinPercent = allTimeTotal > 0 ? Math.round((allTimeWalkin / allTimeTotal) * 100) : 0;
  const overallOnlinePercent = allTimeTotal > 0 ? Math.round((allTimeOnline / allTimeTotal) * 100) : 0;

  const filteredAppointments = useMemo(() => {
    if (!dashboardFilterStartDate || !dashboardFilterEndDate) return appointments;
    let start = new Date(dashboardFilterStartDate);
    let end = new Date(dashboardFilterEndDate);
    if (start > end) {
      const temp = start;
      start = end;
      end = temp;
    }
    start.setHours(0, 0, 0, 0);
    end.setHours(23, 59, 59, 999);

    const pDateSafe = (dStr) => {
      if (!dStr) return null;
      const d = new Date(dStr);
      return isNaN(d.getTime()) ? null : d;
    };

    return appointments.filter(app => {
      const appDate = pDateSafe(app.createdAt || app.date);
      if (!appDate) return false;
      return appDate >= start && appDate <= end;
    });
  }, [appointments, dashboardFilterStartDate, dashboardFilterEndDate]);

  const filteredBills = useMemo(() => {
    if (!dashboardFilterStartDate || !dashboardFilterEndDate) return bills;
    let start = new Date(dashboardFilterStartDate);
    let end = new Date(dashboardFilterEndDate);
    if (start > end) {
      const temp = start;
      start = end;
      end = temp;
    }
    start.setHours(0, 0, 0, 0);
    end.setHours(23, 59, 59, 999);

    const pDateSafe = (dStr) => {
      if (!dStr) return null;
      const d = new Date(dStr);
      return isNaN(d.getTime()) ? null : d;
    };

    return bills.filter(b => {
      const bDate = pDateSafe(b.createdAt || b.date);
      if (!bDate) return false;
      return bDate >= start && bDate <= end;
    });
  }, [bills, dashboardFilterStartDate, dashboardFilterEndDate]);

  const filteredPatientsList = useMemo(() => {
    if (!dashboardFilterStartDate || !dashboardFilterEndDate) return patientsList;
    let start = new Date(dashboardFilterStartDate);
    let end = new Date(dashboardFilterEndDate);
    if (start > end) {
      const temp = start;
      start = end;
      end = temp;
    }
    start.setHours(0, 0, 0, 0);
    end.setHours(23, 59, 59, 999);

    const pDateSafe = (dStr) => {
      if (!dStr) return null;
      const d = new Date(dStr);
      return isNaN(d.getTime()) ? null : d;
    };

    return patientsList.filter(p => {
      const pDate = pDateSafe(p.createdAt);
      if (!pDate) return false;
      return pDate >= start && pDate <= end;
    });
  }, [patientsList, dashboardFilterStartDate, dashboardFilterEndDate]);

  const totalVisitsCount = useMemo(() => {
    const apptsCount = filteredAppointments.length;

    const labsCount = (filteredBills || []).reduce((sum, b) => {
      const labItems = (b.items || []).filter(item => (item.description || '').toLowerCase().includes('lab test:'));
      return sum + labItems.length;
    }, 0);

    const servicesCount = (filteredBills || []).reduce((sum, b) => {
      const serviceItems = (b.items || []).filter(item => (item.description || '').toLowerCase().includes('clinical procedure:'));
      return sum + serviceItems.length;
    }, 0);

    return apptsCount + labsCount + servicesCount;
  }, [filteredAppointments, filteredBills]);

  const getTrendData = () => {
    const today = new Date();
    today.setHours(23, 59, 59, 999);

    const sevenDaysAgo = new Date(today);
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const fourteenDaysAgo = new Date(today);
    fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);

    const parseDateSafe = (dStr) => {
      if (!dStr) return null;
      const d = new Date(dStr);
      return isNaN(d.getTime()) ? null : d;
    };

    let thisWeekWalkin = 0;
    let thisWeekOnline = 0;
    let lastWeekWalkin = 0;
    let lastWeekOnline = 0;

    appointments.forEach(app => {
      const appDate = parseDateSafe(app.createdAt || app.date);
      if (!appDate) return;

      if (appDate >= sevenDaysAgo && appDate <= today) {
        if (app.source === 'Online') thisWeekOnline++;
        else thisWeekWalkin++;
      } else if (appDate >= fourteenDaysAgo && appDate < sevenDaysAgo) {
        if (app.source === 'Online') lastWeekOnline++;
        else lastWeekWalkin++;
      }
    });

    const walkinTrend = lastWeekWalkin > 0 ? Math.round(((thisWeekWalkin - lastWeekWalkin) / lastWeekWalkin) * 100) : (thisWeekWalkin > 0 ? 100 : 0);
    const onlineTrend = lastWeekOnline > 0 ? Math.round(((thisWeekOnline - lastWeekOnline) / lastWeekOnline) * 100) : (thisWeekOnline > 0 ? 100 : 0);

    return { walkinTrend, onlineTrend };
  };

  const { walkinTrend, onlineTrend } = getTrendData();


  useEffect(() => {
    if (window.lucide) {
      window.lucide.createIcons();
    }
  });

  // Save draft for new patient registrations
  useEffect(() => {
    if (activeTab === 'registration-form' && !isExistingPatient && formData.contact && formData.contact.length >= 10) {
      try {
        localStorage.setItem('curoxa_draft_' + formData.contact, JSON.stringify(formData));
      } catch (e) {}
    }
  }, [formData, activeTab, isExistingPatient]);

  // Freeze background page scroll when Details Modal Dialog is active
  useEffect(() => {
    if (detailsModalOpen) {
      document.body.classList.add('modal-open');
    } else {
      document.body.classList.remove('modal-open');
    }
    return () => {
      document.body.classList.remove('modal-open');
    };
  }, [detailsModalOpen]);

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    navigate('/login');
  };

  const switchTab = (tabId, bypassReset = false) => {
    fetchData().catch(e => console.error("Error refreshing data:", e));
    setActiveTab(tabId);
    setMobileSidebarOpen(false);
    if (tabId === 'registration-form' && !bypassReset) {
      setIsExistingPatient(null);
      setSelectedPatient(null);
      
      let draftData = null;
      let contactToUse = '';
      if (searchPatientQuery && searchPatientQuery.trim().length >= 4) {
        contactToUse = searchPatientQuery.trim();
        try {
          const draftStr = localStorage.getItem('curoxa_draft_' + contactToUse);
          if (draftStr) draftData = JSON.parse(draftStr);
        } catch(e) {}
      } else if (globalSearchQuery && globalSearchQuery.trim().length >= 4) {
        contactToUse = globalSearchQuery.trim();
        try {
          const draftStr = localStorage.getItem('curoxa_draft_' + contactToUse);
          if (draftStr) draftData = JSON.parse(draftStr);
        } catch(e) {}
      }

      setSearchPatientQuery('');
      setGlobalSearchQuery('');
      setBookingPaymentMethod('');

      if (draftData) {
        setFormData(draftData);
        showToast("Restored unsaved draft for this number.", "info");
      } else {
        setFormData({ name: '', age: '', gender: '', contact: contactToUse || '', email: '', doctorId: '', bloodGroup: '', address: '', medicalHistory: '', referredBy: '', allergies: 'None', currentMedications: '' });
      }
    }
    if (tabId === 'new-indent') {
      setNewIndentDept('Pharmacy');
      setNewIndentType('Pharmaceuticals');
      setNewIndentReqDate(new Date().toISOString().split('T')[0]);
      setNewIndentRequestedBy(currentUser?.name || 'Staff');
      setNewIndentContact(currentUser?.contact || 'N/A');
      setNewIndentPriority('Normal');
      setNewIndentRemarks('');
      setSelectedMedicines([]);
      setMedicineSearchQuery('');
      setShowMedicineSuggestions(false);
      setNewIndentAdditionalNotes('');
      setNewIndentAttachments([]);
      setShowReqByDropdown(false);
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const toggleSymptom = (symptom) => {
    if (selectedSymptoms.includes(symptom)) {
      setSelectedSymptoms(selectedSymptoms.filter(s => s !== symptom));
    } else {
      setSelectedSymptoms([...selectedSymptoms, symptom]);
    }
    setSymptomDropdownOpen(false);
  };

  const getInitials = (name) => {
    if (!name) return '??';
    return name.split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2);
  };

  const handleSendOtp = async () => {
    if (!formData.email) {
      showToast("Please enter patient email first.", "error");
      return;
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(formData.email)) {
      showToast("Please enter a valid email address.", "error");
      return;
    }

    try {
      setSendingOtp(true);
      const res = await api.post('/auth/send-registration-otp', { email: formData.email });
      if (res.data.dev_otp) {
        showToast(`[DEV ONLY] OTP sent! Code: ${res.data.dev_otp}`, "success");
        setVerificationOtp(res.data.dev_otp);
      } else {
        showToast("Verification OTP sent to patient email.", "success");
      }
      setOtpSent(true);
    } catch (err) {
      console.error(err);
      showToast(err.response?.data?.error || "Failed to send OTP email.", "error");
    } finally {
      setSendingOtp(false);
    }
  };

  const handleVerifyOtp = async () => {
    if (!verificationOtp) {
      showToast("Please enter the 6-digit OTP code.", "error");
      return;
    }

    try {
      setOtpVerifying(true);
      await api.post('/auth/verify-registration-otp', { email: formData.email, otp: verificationOtp });
      showToast("Email address verified successfully!", "success");
      setOtpVerified(true);
      setOtpSent(false);
    } catch (err) {
      console.error(err);
      showToast(err.response?.data?.error || "Invalid or expired OTP code.", "error");
    } finally {
      setOtpVerifying(false);
    }
  };

  const handleCreateAppointment = async () => {
    try {
      setLoading(true);

      if (!isExistingPatient) {
        if (bookingType === 'lab' || bookingType === 'service') {
          if (!formData.name || !formData.age || !formData.contact || !formData.gender) {
            showToast("Please fill in Name, Age, Gender, and Contact for the patient.", "error");
            setLoading(false);
            return;
          }
          if (formData.contact.length !== 10) {
            showToast("Please enter a valid 10-digit mobile number.", "error");
            setLoading(false);
            return;
          }
        } else {
          if (!formData.name || !formData.age || !formData.contact) {
            showToast("Please fill in Name, Age, and Contact for the new patient.", "error");
            setLoading(false);
            return;
          }
          if (formData.contact.length !== 10) {
            showToast("Please enter a valid 10-digit mobile number.", "error");
            setLoading(false);
            return;
          }
          if (formData.email && formData.email.trim() !== '' && !otpVerified) {
            showToast("Please verify the patient's email using OTP before confirming, or clear the email field to proceed without it.", "error");
            setLoading(false);
            return;
          }
        }
      } else if (!selectedPatient) {
        showToast("Please select a patient.", "error");
        setLoading(false);
        return;
      }

      // Collect active doctor form selection
      const allApptsToBook = [...additionalApptsList];
      if (formData.doctorId && selectedSlot) {
        const docObj = doctors.find(d => String(d._id) === String(formData.doctorId));
        allApptsToBook.push({
          doctorId: formData.doctorId,
          doctorName: docObj ? docObj.name : 'Doctor',
          date: bookingDate,
          time: selectedSlot,
          reason: selectedSymptoms.join(', ') || 'General Checkup',
          fee: docObj ? (docObj.consultationFee || 500) : 500
        });
      }

      // Check for duplicate doctors in allApptsToBook
      const docIds = allApptsToBook.map(a => String(a.doctorId));
      const hasDuplicates = docIds.some((val, i) => docIds.indexOf(val) !== i);
      if (hasDuplicates) {
        showToast("You cannot book multiple appointments with the same doctor in a single visit. Please review your selected doctors.", "error");
        setLoading(false);
        return;
      }

      // Check if existing patient already has an appointment today with any of the selected doctors at the exact same time slot in database
      if (isExistingPatient && selectedPatient) {
        const cleanTimeSlotStr = (str) => {
          if (!str) return '';
          return str.split(/\(Limit/i)[0].replace(/\s+/g, ' ').trim().toLowerCase();
        };

        for (const apptToBook of allApptsToBook) {
          const alreadyHasApptInDb = appointments.some(appt => {
            const pId = appt.patientId && typeof appt.patientId === 'object' ? appt.patientId._id : appt.patientId;
            const dId = appt.doctorId && typeof appt.doctorId === 'object' ? appt.doctorId._id : appt.doctorId;
            const samePatient = String(pId) === String(selectedPatient._id);
            const sameDoctor = String(dId) === String(apptToBook.doctorId);
            const sameDay = new Date(appt.date).toDateString() === new Date(apptToBook.date).toDateString();
            const sameTime = cleanTimeSlotStr(appt.time) === cleanTimeSlotStr(apptToBook.time);
            const notCancelled = appt.status !== 'Cancelled';
            return samePatient && sameDoctor && sameDay && sameTime && notCancelled;
          });
          if (alreadyHasApptInDb) {
            showToast(`Patient ${selectedPatient.name} already has an appointment booked with ${apptToBook.doctorName} at this time slot (${apptToBook.time.split(/\(Limit/i)[0].trim()}) on this day.`, "error");
            setLoading(false);
            return;
          }
        }
      }

      if (allApptsToBook.length === 0) {
        showToast("Please select a Doctor and Time Slot for consultation.", "error");
        setLoading(false);
        return;
      }

      if (!bookingPaymentMethod) {
        showToast("Please select a Payment Method before confirming.", "error");
        setLoading(false);
        return;
      }

      if (Number(bookingDiscountPercent) > 0 && !bookingDiscountReason.trim()) {
        showToast("Please provide a reason for the discount.", "error");
        setLoading(false);
        return;
      }

      const billingItems = allApptsToBook.map(appt => ({
        description: `Consultation Fee (${appt.doctorName || 'Doctor'} - ${(appt.time || '').split('(Limit')[0].trim()})`,
        amount: appt.fee || 500
      }));
      if (!isExistingPatient) {
        billingItems.push({ description: 'Registration Fee', amount: 50 });
      }
      const billingTotal = billingItems.reduce((sum, item) => sum + item.amount, 0);

      const patientName = isExistingPatient && selectedPatient ? selectedPatient.name : formData.name;
      
      let finalPatientId = isExistingPatient ? selectedPatient._id : null;
      let patientObj = isExistingPatient ? selectedPatient : null;
      if (!isExistingPatient) {
        const patientRes = await api.post('/patients', {
          name: formData.name,
          age: parseInt(formData.age) || 0,
          ageMonths: parseInt(formData.ageMonths) || 0,
          ageDays: parseInt(formData.ageDays) || 0,
          gender: formData.gender,
          contact: formData.contact,
          email: formData.email,
          bloodGroup: formData.bloodGroup || 'O+',
          address: formData.address || '',
          medicalHistory: formData.medicalHistory ? formData.medicalHistory.split(',').map(item => item.trim()) : [],
          allergies: formData.allergies || 'None',
          currentMedications: formData.currentMedications || '',
          otp: verificationOtp,
          dpdpConsent: dpdpConsent,
          patientDocuments: patientDocuments,
          referredBy: formData.referredBy || '',
          avatar: patientPhoto || ''
        });
        finalPatientId = patientRes.data._id;
        patientObj = patientRes.data;
        if (formData.contact) {
          localStorage.removeItem('curoxa_draft_' + formData.contact);
        }
      } else {
        try {
          await api.put(`/patients/${selectedPatient._id}`, {
            name: selectedPatient.name,
            age: selectedPatient.age,
            gender: selectedPatient.gender,
            contact: selectedPatient.contact,
            currentMedications: formData.currentMedications || selectedPatient.currentMedications || '',
            allergies: formData.allergies !== undefined ? formData.allergies : (selectedPatient.allergies || 'None'),
            medicalHistory: formData.medicalHistory ? formData.medicalHistory.split(',').map(item => item.trim()) : selectedPatient.medicalHistory,
            ...(patientPhoto && patientPhoto.startsWith('data:image') ? { avatar: patientPhoto } : {})
          });
        } catch (err) {
          console.error("Failed to update patient details for existing patient:", err);
        }
      }

      // Book appointments
      const apptsToCreate = allApptsToBook;
      let primaryApptId = null;
      for (const apptItem of apptsToCreate) {
        const appointmentRes = await api.post('/appointments', {
          patientId: finalPatientId,
          doctorId: apptItem.doctorId,
          date: apptItem.date,
          time: apptItem.time,
          reason: apptItem.reason
        });
        if (!primaryApptId) primaryApptId = appointmentRes.data._id;
      }

      // Settle billing
      const origAmt = billingTotal;
      const discAmt = (origAmt * Number(bookingDiscountPercent || 0)) / 100;
      const finalAmt = Math.max(0, origAmt - discAmt);

      let isAddOnProcessed = false;
      if (addOnOriginAppt) {
        const existingBill = bills.find(b => {
          const apptId = b.appointmentId && typeof b.appointmentId === 'object' ? b.appointmentId._id : b.appointmentId;
          return String(apptId) === String(addOnOriginAppt._id);
        });
        if (existingBill) {
          const updatedItems = [...(existingBill.items || []), ...billingItems];
          const newOriginalAmount = (existingBill.originalAmount || 0) + origAmt;
          const currentDiscountPercent = Number(bookingDiscountPercent || existingBill.discountPercent || 0);
          const newDiscountAmount = (newOriginalAmount * currentDiscountPercent) / 100;
          const newTotalAmount = Math.max(0, newOriginalAmount - newDiscountAmount);

          await api.put(`/billing/${existingBill._id}`, {
            items: updatedItems,
            originalAmount: newOriginalAmount,
            discountPercent: currentDiscountPercent,
            discountAmount: newDiscountAmount,
            totalAmount: newTotalAmount,
            discountReason: newDiscountAmount > 0 ? (bookingDiscountReason.trim() || existingBill.discountReason || 'Add-On Discount') : ''
          });
          isAddOnProcessed = true;
        }
      }

      if (!isAddOnProcessed) {
        await api.post('/billing', {
          patientId: finalPatientId,
          appointmentId: primaryApptId,
          items: billingItems,
          originalAmount: origAmt,
          discountPercent: Number(bookingDiscountPercent || 0),
          discountAmount: discAmt,
          totalAmount: finalAmt,
          paymentMethod: bookingPaymentMethod || 'Cash',
          discountReason: discAmt > 0 ? bookingDiscountReason.trim() : '',
          status: 'Paid'
        });
      }

      // Save vitals if any of them are filled in the form
      if (vitalTemp || vitalPulse || vitalBpSys || vitalBpDia || vitalResp || vitalSpo2 || vitalWeight || vitalHeight) {
        try {
          await api.post('/emr/vitals', {
            patientId: finalPatientId,
            temperature: vitalTemp ? parseFloat(vitalTemp) : undefined,
            pulse: vitalPulse ? parseInt(vitalPulse) : undefined,
            bpSys: vitalBpSys ? parseInt(vitalBpSys) : undefined,
            bpDia: vitalBpDia ? parseInt(vitalBpDia) : undefined,
            resp: vitalResp ? parseInt(vitalResp) : undefined,
            spo2: vitalSpo2 ? parseInt(vitalSpo2) : undefined,
            weight: vitalWeight ? parseFloat(vitalWeight) : undefined,
            height: vitalHeight ? parseFloat(vitalHeight) : undefined
          });
          // Clear vitals form fields
          setVitalTemp('');
          setVitalPulse('');
          setVitalBpSys('');
          setVitalBpDia('');
          setVitalResp('');
          setVitalSpo2('');
          setVitalWeight('');
          setVitalHeight('');
        } catch (err) {
          console.error("Failed to save vitals during registration flow:", err);
        }
      }

      // Generate Slip PDF Data
      const activePatient = patientObj || selectedPatient || formData;
      
      let finalItems = billingItems;
      let finalOrigAmt = origAmt;
      let finalDiscAmt = discAmt;
      let finalTotalAmt = finalAmt;

      if (isAddOnProcessed && addOnOriginAppt) {
        const matchBill = bills.find(b => {
          const apptId = b.appointmentId && typeof b.appointmentId === 'object' ? b.appointmentId._id : b.appointmentId;
          return String(apptId) === String(addOnOriginAppt._id);
        });
        if (matchBill) {
          finalItems = [...(matchBill.items || []), ...billingItems];
          finalOrigAmt = (matchBill.originalAmount || 0) + origAmt;
          const pct = Number(bookingDiscountPercent || matchBill.discountPercent || 0);
          finalDiscAmt = (finalOrigAmt * pct) / 100;
          finalTotalAmt = finalOrigAmt - finalDiscAmt;
        }
      }

      setActiveSlipData({
        receiptNo: `REC-${Date.now().toString().slice(-6)}`,
        date: new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }),
        patientName: activePatient.name || 'Patient',
        patientId: getFormattedPatientId(finalPatientId),
        contact: activePatient.contact || 'N/A',
        ageGender: `${activePatient.age || 'N/A'} / ${activePatient.gender || 'N/A'}`,
        testName: 'OPD Consultation & Booking Fee',
        items: finalItems,
        originalAmount: finalOrigAmt,
        discountAmount: finalDiscAmt,
        totalAmount: finalTotalAmt,
        paymentMethod: bookingPaymentMethod || 'Cash',
        hospitalName: currentUser.tenantName || 'Curoxa Medical Center'
      });
      setShowSlipPdfModal(true);

      showToast(isAddOnProcessed ? "Add-On Appointment registered and existing visit billing updated successfully!" : `${apptsToCreate.length} Appointment(s) registered & Payment completed successfully!`, "success");

      // Reset Form State
      setFormData({ name: '', age: '', gender: '', contact: '', email: '', doctorId: '', bloodGroup: '', address: '', medicalHistory: '', referredBy: '', allergies: 'None', currentMedications: '' });
      setBookingDate(getLocalDateString());
      setSelectedSlot('');
      setSelectedSymptoms([]);
      setAdditionalApptsList([]);
      setIsExistingPatient(null);
      setSelectedPatient(null);
      setBookingPaymentMethod('');
      setBookingDiscountPercent(0);
      setBookingDiscountReason('');
      setOtpVerified(false);
      setOtpSent(false);
      setVerificationOtp('');
      setPatientDocuments([]);
      setReschedulingAppointment(null);
      setAddOnOriginAppt(null);

      fetchData();

    } catch (err) {
      console.error(err);
      showToast(err.response?.data?.error || err.message || 'Failed to complete booking and payment', 'error');
    } finally {
      setLoading(false);
    }
  };
  const getDisplayDob = (patient) => {
    if (!patient) return 'N/A';
    const age = patient.age || 30;
    const currentYear = new Date().getFullYear();
    const birthYear = currentYear - age;
    return `01/01/${birthYear} (${age} yrs)`;
  };

  const getFormattedSummaryDate = (dateStr) => {
    if (!dateStr) return 'N/A';
    const d = new Date(dateStr);
    const options = { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' };
    return d.toLocaleDateString('en-US', options);
  };

  const getFormattedTableDate = (dateStr) => {
    if (!dateStr) return 'N/A';
    const d = new Date(dateStr);
    const options = { day: 'numeric', month: 'short', year: 'numeric' };
    return d.toLocaleDateString('en-US', options);
  };

  const [cancelApptConfirmId, setCancelApptConfirmId] = useState(null);

  const handleCancelProfileAppointment = (apptId) => {
    setCancelApptConfirmId(apptId);
  };

  const confirmCancelProfileAppointment = async () => {
    if (!cancelApptConfirmId) return;
    const apptId = cancelApptConfirmId;
    setCancelApptConfirmId(null);
    try {
      setLoading(true);
      // Optimistically update appointments state!
      setAppointments(prev => prev.map(a => a._id === apptId ? { ...a, status: 'Cancelled' } : a));
      setSelectedProfileAppointment(prev => prev && prev._id === apptId ? { ...prev, status: 'Cancelled' } : prev);
      await api.put(`/appointments/${apptId}`, { status: 'Cancelled' });
      showToast("Appointment cancelled successfully", "success");
      await fetchData();
    } catch (err) {
      console.error(err);
      showToast("Failed to cancel appointment", "error");
      await fetchData();
    } finally {
      setLoading(false);
    }
  };

  const handleSaveProfileReschedule = async () => {
    if (!selectedProfileAppointment) return;
    const apptId = selectedProfileAppointment._id;
    try {
      setLoading(true);
      // Optimistically update appointments state!
      setAppointments(prev => prev.map(a => a._id === apptId ? { ...a, date: rescheduleProfileDate, time: rescheduleProfileTime, status: 'Rescheduled' } : a));
      setSelectedProfileAppointment(prev => prev && prev._id === apptId ? { ...prev, date: rescheduleProfileDate, time: rescheduleProfileTime, status: 'Rescheduled' } : prev);
      await api.put(`/appointments/${apptId}`, { date: rescheduleProfileDate, time: rescheduleProfileTime, status: 'Rescheduled' });
      showToast("Appointment rescheduled successfully", "success");
      setIsReschedulingProfileAppt(false);
      await fetchData();
    } catch (err) {
      console.error(err);
      showToast("Failed to reschedule appointment", "error");
      await fetchData();
    } finally {
      setLoading(false);
    }
  };

  const handleRescheduleSubmit = async () => {
    if (!reschedulingAppointment) return;
    const apptId = reschedulingAppointment._id;
    if (!bookingDate || !selectedSlot) {
      showToast("Please choose both date and time slot for rescheduling", "error");
      return;
    }
    try {
      setLoading(true);
      await api.put(`/appointments/${apptId}`, { date: bookingDate, time: selectedSlot, status: 'Rescheduled' });
      showToast("Appointment rescheduled successfully!", "success");
      
      setFormData({ name: '', age: '', gender: '', contact: '', email: '', doctorId: '', bloodGroup: '', address: '', medicalHistory: '', referredBy: '', allergies: 'None', currentMedications: '' });
      setSelectedSymptoms([]);
      setIsExistingPatient(null);
      setSearchPatientQuery('');
      setSelectedPatient(null);
      setBookingPaymentMethod('');
      setReschedulingAppointment(null);
      setBookingDate(getLocalDateString());
      setSelectedSlot('');

      await fetchData();
      switchTab('appointments');
    } catch (err) {
      console.error(err);
      showToast("Failed to reschedule appointment", "error");
      await fetchData();
    } finally {
      setLoading(false);
    }
  };

  const handleViewPrescription = async (apptId) => {
    try {
      setLoading(true);
      const res = await api.get(`/prescriptions?patientId=${selectedPatient._id}`);
      const rx = res.data.find(r => r.appointmentId === apptId || (r.appointmentId?._id && r.appointmentId._id === apptId));
      if (rx) {
        setSelectedPrescription(rx);
        setPrescriptionModalOpen(true);
      } else {
        showToast("No prescription has been generated for this appointment yet.", "info");
      }
    } catch (err) {
      console.error(err);
      showToast("Failed to load prescription.", "error");
    } finally {
      setLoading(false);
    }
  };

  const handleViewLabReport = async (apptId) => {
    try {
      setLoading(true);
      const res = await api.get(`/labs?patientId=${selectedPatient._id}`);
      const lab = res.data.find(l => l.appointmentId === apptId || (l.appointmentId?._id && l.appointmentId._id === apptId));
      if (lab) {
        setSelectedLabRequest(lab);
        setLabModalOpen(true);
      } else {
        showToast("No lab report has been generated for this appointment yet.", "info");
      }
    } catch (err) {
      console.error(err);
      showToast("Failed to load lab report.", "error");
    } finally {
      setLoading(false);
    }
  };

  const handleViewAllLabReports = async () => {
    if (!selectedPatient) return;
    try {
      setLoading(true);
      const res = await api.get(`/labs?patientId=${selectedPatient._id}`);
      if (res.data && res.data.length > 0) {
        setPatientLabReports(res.data);
      } else {
        setPatientLabReports([]);
      }
      setSelectedReportDetail(null);
      setAllLabsModalOpen(true);
    } catch (err) {
      console.error(err);
      setPatientLabReports([]);
      setSelectedReportDetail(null);
      setAllLabsModalOpen(true);
    } finally {
      setLoading(false);
    }
  };

  const resetRegistrationForm = () => {
    setFormData({ name: '', age: '', gender: '', contact: '', email: '', doctorId: '', bloodGroup: '', address: '', medicalHistory: '', referredBy: '', allergies: 'None', currentMedications: '' });
    setSelectedSymptoms([]);
    setIsExistingPatient(null);
    setSearchPatientQuery('');
    setSelectedPatient(null);
    setBookingPaymentMethod('');
    setOtpVerified(false);
    setOtpSent(false);
    setVerificationOtp('');
    setAdditionalApptsList([]);
    setSelectedSlot('');
    setBookingDate(new Date().toISOString().split('T')[0]);
    setReschedulingAppointment(null);
    setVitalTemp('');
    setVitalPulse('');
    setVitalBpSys('');
    setVitalBpDia('');
    setVitalResp('');
    setVitalSpo2('');
    setVitalWeight('');
    setVitalHeight('');
  };

  const handleCreateAppointmentForProfilePatient = () => {
    if (!selectedPatient) return;
    const pat = { ...selectedPatient };
    setFormData({
      name: pat.name,
      age: pat.age,
      gender: pat.gender,
      contact: pat.contact,
      email: pat.email || '',
      bloodGroup: pat.bloodGroup || 'O+',
      address: pat.address || '',
      medicalHistory: pat.medicalHistory ? pat.medicalHistory.join(', ') : '',
      doctorId: ''
    });
    setIsExistingPatient(true);
    setSelectedPatient(pat);
    switchTab('registration-form', true);
  };

  const [activePatientMenuId, setActivePatientMenuId] = useState(null);
  const [patientMenuPos, setPatientMenuPos] = useState({ top: 0, right: 0 });

  const handleOpenPatientProfile = async (patientIdOrObj) => {
    if (!patientIdOrObj) return;
    let patObj = null;
    if (patientIdOrObj.gender && patientIdOrObj._id) {
      patObj = patientIdOrObj;
    } else {
      const targetId = patientIdOrObj._id || patientIdOrObj;
      patObj = patientsList.find(p => p._id.toString() === targetId.toString());
    }

    if (patObj) {
      setSelectedPatient(patObj);
      switchTab('patient-details', true);
      
      try {
        const res = await api.get(`/emr/vitals/patient/${patObj._id}`);
        setPatientVitals(res.data || []);
      } catch (err) {
        console.error("Failed to fetch patient vitals", err);
        setPatientVitals([]);
      }
      try {
        const res = await api.get(`/emr/clinical-notes/patient/${patObj._id}`);
        setPatientClinicalNotes(res.data || []);
      } catch (err) {
        console.error(err);
        setPatientClinicalNotes([]);
      }
      try {
        const res = await api.get('/prescriptions');
        const patRx = (res.data || []).filter(r => {
          const pId = r.patientId?._id || r.patientId;
          return pId && pId.toString() === patObj._id.toString();
        });
        setPatientPrescriptions(patRx);
      } catch (err) {
        console.error(err);
        setPatientPrescriptions([]);
      }
      try {
        const res = await api.get('/labs').catch(() => api.get(`/labs/patient/${patObj._id}`));
        const data = res.data || [];
        const patLabs = Array.isArray(data) ? data.filter(l => {
          const pId = l.patientId?._id || l.patientId;
          return pId && pId.toString() === patObj._id.toString();
        }) : [];
        setPatientLabTests(patLabs);
      } catch (err) {
        console.error(err);
        setPatientLabTests([]);
      }
    }
  };

  const handleSaveVitals = async (e) => {
    if (e) e.preventDefault();
    if (!selectedPatient) return;
    try {
      setLoading(true);
      const payload = {
        patientId: selectedPatient._id,
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
      showToast("Vitals recorded successfully", "success");
      
      const res = await api.get(`/emr/vitals/patient/${selectedPatient._id}`);
      setPatientVitals(res.data || []);
      setShowVitalsModal(false);
    } catch (err) {
      console.error("Failed to record vitals:", err);
      showToast("Failed to record vitals", "error");
    } finally {
      setLoading(false);
    }
  };

  const handleRePrintPatientSlip = (p, targetBill = null) => {
    if (!p) return;
    const patientBills = bills.filter(b => {
      const pId = b.patientId?._id || b.patientId;
      return pId && pId.toString() === p._id.toString() && b.status === 'Paid';
    });

    if (patientBills.length === 0) {
      showToast(`No paid payment receipts found for ${p.name}.`, "info");
      return;
    }

    const billToPrint = targetBill || patientBills[0];

    setActiveSlipData({
      receiptNo: `REC-${(billToPrint._id || '').slice(-6).toUpperCase()}`,
      date: new Date(billToPrint.createdAt || Date.now()).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }),
      patientName: p.name || 'Patient',
      patientId: getFormattedPatientId(p._id),
      contact: p.contact || 'N/A',
      ageGender: `${p.age || 'N/A'} / ${p.gender || 'N/A'}`,
      testName: (billToPrint.items || []).map(i => i.description).join(', ') || 'Medical Services',
      items: billToPrint.items || [{ description: 'Hospital Services', amount: billToPrint.totalAmount }],
      originalAmount: billToPrint.originalAmount || billToPrint.totalAmount,
      discountAmount: billToPrint.discountAmount || 0,
      totalAmount: billToPrint.totalAmount,
      paymentMethod: billToPrint.paymentMethod || 'Cash',
      hospitalName: currentUser?.tenantName || 'Curoxa Medical Center'
    });
    setShowSlipPdfModal(true);
  };

  const getBillingItems = () => {
    if (bookingType === 'lab') {
      return selectedLabTestsList.map(item => ({ description: item.testName, amount: Number(item.price || 0) }));
    } else if (bookingType === 'service') {
      return selectedServicesList.map(item => ({ description: item.serviceName, amount: Number(item.price || 0) }));
    } else {
      const items = additionalApptsList.map(appt => ({
        description: `Consultation (${appt.doctorName})`,
        amount: Number(appt.fee !== undefined ? appt.fee : (doctors.find(d => String(d._id) === String(appt.doctorId))?.consultationFee || 500))
      }));
      
      const isCurrentDoctorAlreadyQueued = formData.doctorId && additionalApptsList.some(appt => String(appt.doctorId) === String(formData.doctorId));
      if (formData.doctorId && selectedSlot && !isCurrentDoctorAlreadyQueued) {
        const docObj = doctors.find(d => String(d._id) === String(formData.doctorId));
        items.push({
          description: `Consultation (${docObj ? docObj.name : 'Doctor'})`,
          amount: Number(docObj?.consultationFee || 500)
        });
      }
      return items;
    }
  };

  return (
    <>
      <style>{`
        /* Strict Box sizing safeguard */
        *, *::before, *::after {
          box-sizing: border-box !important;
        }

        html, body {
          background-color: #F8FAFC !important;
          font-family: 'Urbanist', sans-serif !important;
          overflow: hidden !important;
          margin: 0 !important;
          padding: 0 !important;
        }

        /* ADMIN SIDEBAR LIGHT THEME PIXEL-PERFECT STYLES */
        .admin-sidebar {
          width: 260px;
          background: rgba(255, 255, 255, 0.94);
          backdrop-filter: blur(16px);
          -webkit-backdrop-filter: blur(16px);
          color: #0F172A;
          display: flex;
          flex-direction: column;
          position: fixed;
          top: 0;
          bottom: 0;
          left: 0;
          z-index: 1000;
          border-right: 1px solid rgba(226, 232, 240, 0.85);
          border-top-right-radius: 28px;
          border-bottom-right-radius: 28px;
          box-shadow: 0 10px 30px -5px rgba(15, 23, 42, 0.04);
          overscroll-behavior: contain;
          transition: width 0.3s cubic-bezier(0.4, 0, 0.2, 1), transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        }

        .admin-sidebar.collapsed {
          width: 76px;
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
          margin: 0 auto !important;
          padding: 6px !important;
          justify-content: center !important;
          width: 44px !important;
          height: 44px !important;
        }
        
        /* Mobile sidebar styles */
        .admin-sidebar.mobile-open {
          transform: translateX(0);
          box-shadow: 4px 0 24px rgba(0, 0, 0, 0.08);
        }
        @media (max-width: 1024px) {
          .admin-sidebar {
            transform: translateX(-100%);
            transition: transform 0.3s ease;
            box-shadow: 4px 0 24px rgba(0, 0, 0, 0.08);
          }
        }

        .sidebar-brand-wrapper {
          position: relative;
          overflow: visible;
        }

        .sidebar-brand {
          padding: 24px 20px 16px 20px;
          display: flex;
          align-items: center;
          gap: 14px;
          position: relative;
          z-index: 10;
        }

        .sidebar-nav-container {
          flex: 1;
          overflow-y: auto;
          padding: 8px 12px 14px 12px;
          overscroll-behavior: contain;
          scrollbar-width: none;
          -ms-overflow-style: none;
        }
        .sidebar-nav-container::-webkit-scrollbar {
          display: none;
          width: 0;
          height: 0;
        }

        .sidebar-group {
          margin-bottom: 14px;
        }

        .sidebar-group-title {
          font-size: 12px;
          font-weight: 800;
          text-transform: uppercase;
          letter-spacing: 0.07em;
          line-height: 1.25;
          margin-bottom: 8px;
          padding: 4px 8px;
          border-radius: 8px;
          display: flex;
          align-items: center;
          gap: 6px;
          user-select: none;
        }

        .sidebar-zone-clinic {
          background: linear-gradient(180deg, rgba(240, 253, 250, 0.75) 0%, rgba(236, 254, 255, 0.45) 100%);
          border-radius: 18px;
          padding: 10px 8px;
          margin-top: 14px;
          margin-bottom: 14px;
          transition: all 0.25s ease;
        }

        .sidebar-zone-finance {
          background: linear-gradient(180deg, rgba(255, 247, 237, 0.8) 0%, rgba(254, 242, 242, 0.35) 100%);
          border-radius: 18px;
          padding: 10px 8px;
          margin-top: 14px;
          margin-bottom: 14px;
          transition: all 0.25s ease;
        }

        .sidebar-link {
          position: relative;
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 5px 8px;
          border-radius: 14px;
          color: #0F172A;
          text-decoration: none;
          font-weight: 600;
          font-size: 14px;
          line-height: 1.25;
          transition: all 0.22s cubic-bezier(0.4, 0, 0.2, 1);
          margin-bottom: 3px;
          cursor: pointer;
          user-select: none;
          border: 1px solid transparent;
        }

        .sidebar-link-text {
          line-height: 1.25;
          font-size: 13.5px;
          font-weight: 600;
          color: #0F172A;
          transition: all 0.2s ease;
        }

        .sidebar-link:hover:not(.active) {
          background-color: rgba(241, 245, 249, 0.85);
          transform: translateX(2px);
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
          width: 36px;
          height: 36px;
          border-radius: 11px;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          transition: all 0.2s ease;
        }

        .sidebar-profile-footer {
          position: relative;
          padding: 8px 10px 12px 10px;
          background: #FFFFFF;
          border-bottom-right-radius: 28px;
          flex-shrink: 0;
          z-index: 20;
        }
        .admin-sidebar.collapsed .sidebar-profile-footer {
          padding: 8px 6px 12px 6px;
        }
        .sidebar-profile-fade-top {
          position: absolute;
          top: -16px;
          left: 0;
          right: 0;
          height: 16px;
          background: linear-gradient(to bottom, rgba(255, 255, 255, 0) 0%, rgba(255, 255, 255, 0.45) 50%, rgba(255, 255, 255, 0.9) 100%);
          pointer-events: none;
          backdrop-filter: blur(0.75px);
          -webkit-backdrop-filter: blur(0.75px);
          z-index: 15;
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
          background: linear-gradient(135deg, #F59E0B 0%, #D97706 100%) !important;
          color: #FFFFFF !important;
          display: flex !important;
          align-items: center !important;
          justify-content: center !important;
          font-weight: 800 !important;
          font-size: 13px !important;
          box-shadow: 0 3px 8px rgba(245, 158, 11, 0.3) !important;
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
          width: 236px !important;
          z-index: 3000 !important;
          background: #FFFFFF !important;
          border-radius: 16px !important;
          border: 1px solid rgba(226, 232, 240, 0.9) !important;
          box-shadow: 0 20px 40px -10px rgba(15, 23, 42, 0.18), 0 0 1px 1px rgba(0, 0, 0, 0.04) !important;
          overflow: hidden !important;
          animation: slideUpFade 0.2s cubic-bezier(0.16, 1, 0.3, 1) !important;
        }
        .admin-sidebar.collapsed .sidebar-profile-popover-card {
          left: 76px !important;
          bottom: 10px !important;
        }
        @keyframes slideUpFade {
          from {
            opacity: 0;
            transform: translateY(8px) scale(0.98);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }
        .profile-popover-header {
          padding: 14px 14px 12px 14px !important;
          background: linear-gradient(90deg, #FFFFFF 0%, #EEF4FF 35%, #93C5FD 75%, #3B82F6 100%) !important;
          border-bottom: 1px solid #E2E8F0 !important;
          display: flex !important;
          align-items: center !important;
          gap: 10px !important;
          position: relative !important;
          overflow: hidden !important;
        }
        .profile-popover-header-glow {
          position: absolute !important;
          top: -20px !important;
          right: -20px !important;
          width: 90px !important;
          height: 90px !important;
          background: radial-gradient(circle, rgba(255, 255, 255, 0.4) 0%, rgba(255, 255, 255, 0) 70%) !important;
          pointer-events: none !important;
        }
        .profile-popover-header-name {
          font-size: 13.5px !important;
          font-weight: 800 !important;
          color: #0F172A !important;
          line-height: 1.2 !important;
          white-space: nowrap !important;
          text-overflow: ellipsis !important;
          overflow: hidden !important;
        }
        .profile-popover-header-role {
          font-size: 11px !important;
          font-weight: 600 !important;
          color: #475569 !important;
          line-height: 1.2 !important;
          margin-top: 2px !important;
          white-space: nowrap !important;
          text-overflow: ellipsis !important;
          overflow: hidden !important;
        }
        .profile-popover-body {
          padding: 6px 6px 8px 6px !important;
          background: #FFFFFF !important;
        }
        .profile-popover-item {
          padding: 7px 10px !important;
          border-radius: 10px !important;
          display: flex !important;
          align-items: center !important;
          gap: 10px !important;
          cursor: pointer !important;
          transition: background 0.15s ease !important;
          user-select: none !important;
        }
        .profile-popover-item:hover {
          background: #F4F7FF !important;
        }
        .profile-popover-item.logout-item:hover {
          background: #FEF2F2 !important;
        }
        .profile-popover-item-icon {
          width: 28px !important;
          height: 28px !important;
          border-radius: 8px !important;
          background: #F8FAFC !important;
          display: flex !important;
          align-items: center !important;
          justify-content: center !important;
          flex-shrink: 0 !important;
          color: #475569 !important;
          transition: all 0.15s ease !important;
        }
        .profile-popover-item:hover .profile-popover-item-icon {
          background: #EEF4FF !important;
          color: #2563EB !important;
        }
        .profile-popover-item.logout-item .profile-popover-item-icon {
          background: #FEF2F2 !important;
          color: #EF4444 !important;
        }
        .profile-popover-item.logout-item:hover .profile-popover-item-icon {
          background: #FEE2E2 !important;
          color: #DC2626 !important;
        }
        .profile-popover-item-texts {
          display: flex !important;
          flex-direction: column !important;
          min-width: 0 !important;
          flex: 1 !important;
        }
        .profile-popover-item-title {
          font-size: 12.5px !important;
          font-weight: 700 !important;
          color: #0F172A !important;
          line-height: 1.2 !important;
        }
        .profile-popover-item.logout-item .profile-popover-item-title {
          color: #DC2626 !important;
        }
        .profile-popover-item-sub {
          font-size: 10.5px !important;
          font-weight: 500 !important;
          color: #94A3B8 !important;
          line-height: 1.2 !important;
          margin-top: 1px !important;
        }
        .profile-popover-item.logout-item .profile-popover-item-sub {
          color: #F87171 !important;
        }

        /* TOP COMMAND BAR & CANVAS STYLING */
        .top-nav {
          margin-left: 260px !important;
          height: 76px !important;
          padding: 0 24px !important;
          border-bottom: 1px solid rgba(226, 232, 240, 0.85) !important;
          background: rgba(255, 255, 255, 0.94) !important;
          backdrop-filter: blur(16px) !important;
          -webkit-backdrop-filter: blur(16px) !important;
          display: flex !important;
          align-items: center !important;
          justify-content: space-between !important;
          position: fixed !important;
          top: 0 !important;
          right: 0 !important;
          left: 0 !important;
          z-index: 900 !important;
          box-shadow: 0 4px 20px -5px rgba(15, 23, 42, 0.03) !important;
          transition: margin-left 0.3s cubic-bezier(0.4, 0, 0.2, 1), left 0.3s cubic-bezier(0.4, 0, 0.2, 1) !important;
        }

        .top-nav.collapsed {
          margin-left: 76px !important;
        }

        @media (max-width: 1024px) {
          .top-nav {
            margin-left: 0 !important;
            padding: 0 16px !important;
          }
        }

        .main-content {
          margin-left: 260px !important;
          margin-top: 76px !important;
          min-height: calc(100vh - 76px) !important;
          padding: 24px 28px 90px 28px !important;
          background-color: #F8FAFC !important;
          background-image: 
            radial-gradient(at 0% 0%, rgba(219, 234, 254, 0.6) 0px, transparent 50%),
            radial-gradient(at 100% 0%, rgba(237, 233, 254, 0.55) 0px, transparent 45%),
            radial-gradient(at 50% 50%, rgba(240, 249, 255, 0.5) 0px, transparent 60%),
            radial-gradient(at 100% 100%, rgba(224, 242, 254, 0.5) 0px, transparent 50%),
            radial-gradient(at 0% 100%, rgba(243, 232, 255, 0.45) 0px, transparent 50%),
            linear-gradient(135deg, #F5F8FF 0%, #F8F7FF 45%, #F3FBFA 100%) !important;
          background-attachment: fixed !important;
          transition: margin-left 0.3s cubic-bezier(0.4, 0, 0.2, 1) !important;
          overflow-x: hidden !important;
        }

        .main-content.collapsed {
          margin-left: 76px !important;
        }

        @media (max-width: 1024px) {
          .main-content {
            margin-left: 0 !important;
            padding: 16px 14px 90px 14px !important;
          }
        }

        .tab-content {
          padding: 0px !important;
        }

        /* CUSTOM GLASS CARDS */
        .glass-card {
          background: #ffffff !important;
          border: 1px solid #F1F5F9 !important;
          border-radius: 16px !important;
          box-shadow: 0 4px 20px rgba(0,0,0,0.01) !important;
        }

        /* KPI CARD CUSTOM MODERNIZATION */
        .kpi-card-container {
          display: grid !important;
          grid-template-columns: repeat(4, 1fr) !important;
          gap: 20px !important;
          margin-bottom: 32px !important;
        }
        .modern-kpi-card {
          background: #ffffff !important;
          border: 1px solid #F1F5F9 !important;
          border-radius: 16px !important;
          padding: 24px !important;
          display: flex !important;
          align-items: center !important;
          gap: 20px !important;
          cursor: pointer !important;
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1) !important;
          box-shadow: 0 4px 20px rgba(0,0,0,0.01) !important;
        }
        .modern-kpi-card:hover {
          transform: translateY(-2px) !important;
          box-shadow: 0 12px 30px rgba(0,0,0,0.03) !important;
          border-color: #E2E8F0 !important;
        }
        .modern-kpi-icon {
          width: 48px !important;
          height: 48px !important;
          border-radius: 12px !important;
          display: flex !important;
          align-items: center !important;
          justify-content: center !important;
          flex-shrink: 0 !important;
        }
        .modern-kpi-icon i, .modern-kpi-icon svg {
          width: 20px !important;
          height: 20px !important;
        }
        .modern-kpi-lbl {
          font-size: 13px !important;
          font-weight: 700 !important;
          color: #64748B !important;
          margin-bottom: 4px !important;
        }
        .modern-kpi-val {
          font-size: 24px !important;
          font-weight: 900 !important;
          color: #0F172A !important;
          line-height: 1 !important;
        }

        /* PREMIUM TABLES */
        .premium-table {
          width: 100% !important;
          border-collapse: collapse !important;
          text-align: left !important;
        }
        .premium-table th {
          padding: 16px 24px !important;
          font-size: 11.5px !important;
          font-weight: 850 !important;
          color: #475569 !important;
          text-transform: uppercase !important;
          background: #F8FAFC !important;
          border-bottom: 1px solid #F1F5F9 !important;
          letter-spacing: 0.5px !important;
        }
        .premium-table td {
          padding: 16px 24px !important;
          font-size: 13.5px !important;
          color: #334155 !important;
          border-bottom: 1px solid #F1F5F9 !important;
          vertical-align: middle !important;
        }
        .premium-table tr:last-child td {
          border-bottom: none !important;
        }
        .premium-table tr:hover td {
          background-color: #FCFDFE !important;
        }

        /* MODERN BADGES */
        .badge-premium {
          display: inline-flex !important;
          align-items: center !important;
          gap: 6px !important;
          padding: 6px 12px !important;
          border-radius: 99px !important;
          font-size: 11.5px !important;
          font-weight: 800 !important;
        }
        .badge-premium.green {
          background: #DCFCE7 !important;
          color: #16A34A !important;
        }
        .badge-premium.red {
          background: #FEE2E2 !important;
          color: #DC2626 !important;
        }

        /* DOCTOR AVAILABILITY LIST */
        .doctor-avail-item {
          display: flex !important;
          align-items: center !important;
          justify-content: space-between !important;
          padding: 12px 0 !important;
          border-bottom: 1px solid #F1F5F9 !important;
        }
        .doctor-avail-item:last-child {
          border-bottom: none !important;
          padding-bottom: 0 !important;
        }
        .doctor-avail-item:first-child {
          padding-top: 0 !important;
        }
        .doctor-info-box {
          display: flex !important;
          align-items: center !important;
          gap: 12px !important;
        }
        .doctor-avatar-circle {
          width: 40px !important;
          height: 40px !important;
          border-radius: 50% !important;
          object-fit: cover !important;
          border: 1px solid #E2E8F0 !important;
        }
        .doctor-name-text {
          font-size: 14px !important;
          font-weight: 800 !important;
          color: #0F172A !important;
        }
        .doctor-spec-text {
          font-size: 12px !important;
          font-weight: 600 !important;
          color: #64748B !important;
          margin-top: 2px !important;
        }

        /* ANIMATIONS */
        @keyframes slideUp {
          from {
            opacity: 0;
            transform: translateY(12px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
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

          /* Safe-area spacing overrides for bottom sidebar profile on mobile */
          .sidebar-user {
            margin-bottom: 0 !important;
          }
          .sidebar-profile-popover {
            bottom: calc(72px + 32px + env(safe-area-inset-bottom, 32px)) !important;
          }
        }

        /* Dynamic Responsive Typography Overrides */
        @media (max-width: 1024px) {
          h1, [style*="fontSize: '28px'"], [style*="fontSize: '24px'"], [style*="fontSize:28px"], [style*="fontSize:24px"] {
            font-size: 20px !important;
          }
          h2 {
            font-size: 17px !important;
          }
          h3, [style*="fontSize: '14px'"], [style*="fontSize: '17px'"], [style*="fontSize:18px"], [style*="fontSize:17px"] {
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
          h3, [style*="fontSize: '14px'"], [style*="fontSize: '17px'"], [style*="fontSize:18px"], [style*="fontSize:17px"] {
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

        @media (max-width: 1024px) {
          div[style*="overflow-x"], div[style*="overflowX"] {
            overflow-x: auto !important;
            -webkit-overflow-scrolling: touch;
          }
          div[style*="overflow-x"] table, div[style*="overflowX"] table {
            min-width: 750px !important;
          }
        }
      `}</style>

      {notification && (
        <div className="premium-toast" style={{
          position: 'fixed',
          top: '24px',
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 99999,
          background: 'rgba(255, 255, 255, 0.95)',
          backdropFilter: 'blur(20px)',
          border: notification.type === 'error' ? '1px solid #FEE2E2' : '1px solid #ECFDF5',
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

      {/* 1. Light Theme Sidebar Navigation: Pixel-Perfect Reference Match */}
      {activeTab !== 'hr-payroll' && (
        <div 
          className={`admin-sidebar ${isSidebarCollapsed ? 'collapsed' : ''} ${mobileSidebarOpen ? 'mobile-open' : ''}`} 
          ref={sidebarRef}
          onClick={() => setMobileSidebarOpen(false)}
          data-lenis-prevent
        >
          {/* Top Branding & Decorative Waves */}
          <div className="sidebar-brand-wrapper">
            {/* Subtle flowing background waves */}
            <svg 
              className="sidebar-wave-bg" 
              viewBox="0 0 280 130" 
              fill="none" 
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
              <path d="M0,0 L280,0 L280,65 C215,100 155,70 85,105 C40,120 15,110 0,100 Z" fill="url(#curoxaWaveGrad1)" />
              <path d="M0,0 L280,0 L280,40 C195,80 135,50 55,90 C20,102 0,92 0,92 Z" fill="url(#curoxaWaveGrad2)" opacity="0.65" />
              <defs>
                <linearGradient id="curoxaWaveGrad1" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#DBEAFE" stopOpacity="0.85" />
                  <stop offset="50%" stopColor="#E0E7FF" stopOpacity="0.6" />
                  <stop offset="100%" stopColor="#F3E8FF" stopOpacity="0.2" />
                </linearGradient>
                <linearGradient id="curoxaWaveGrad2" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#BAE6FD" stopOpacity="0.75" />
                  <stop offset="100%" stopColor="#DDD6FE" stopOpacity="0.15" />
                </linearGradient>
              </defs>
            </svg>

            <div className="sidebar-brand">
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
              <div className="sidebar-brand-text-group" style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                <span className="sidebar-brand-text" style={{ fontFamily: "'Plus Jakarta Sans', 'Outfit', sans-serif", fontWeight: 900, fontSize: '18px', color: '#0F172A', letterSpacing: '0.03em', lineHeight: 1.1 }}>
                  CUROXA
                </span>
                <span className="sidebar-brand-subtitle" style={{ fontSize: '11px', color: '#64748B', fontWeight: 500, letterSpacing: '-0.01em', marginTop: '3px', lineHeight: 1 }}>
                  Health Management
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
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#1E293B" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
              </button>
            </div>
          </div>

          <div className="sidebar-nav-container" ref={sidebarNavRef}>
            {/* SECTION 1: OVERVIEW GROUP */}
            <div className="sidebar-group">
              <div className="sidebar-group-title" style={{ color: '#2563EB' }}>
                <span style={{ fontSize: '13px', lineHeight: 1 }}>•</span> OVERVIEW
              </div>
              
              <div 
                className={`sidebar-link ${activeTab === 'dash' ? 'active' : ''}`}
                onClick={() => switchTab('dash')}
              >
                {activeTab === 'dash' && (
                  <div style={{ position: 'absolute', left: '0px', top: '50%', transform: 'translateY(-50%)', width: '3.5px', height: '20px', borderRadius: '4px', background: '#2563EB' }} />
                )}
                <div className="sidebar-link-icon" style={{
                  background: activeTab === 'dash' ? 'linear-gradient(135deg, #2563EB 0%, #3B82F6 100%)' : '#EFF6FF',
                  color: activeTab === 'dash' ? '#FFFFFF' : '#2563EB',
                  boxShadow: activeTab === 'dash' ? '0 3px 10px rgba(37, 99, 235, 0.25)' : 'none'
                }}>
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="7" height="7" x="3" y="3" rx="1.5"/><rect width="7" height="7" x="14" y="3" rx="1.5"/><rect width="7" height="7" x="14" y="14" rx="1.5"/><rect width="7" height="7" x="3" y="14" rx="1.5"/></svg>
                </div>
                <span className="sidebar-link-text" style={{ fontSize: '13.5px', fontWeight: activeTab === 'dash' ? 700 : 600, color: activeTab === 'dash' ? '#2563EB' : '#0F172A', letterSpacing: '-0.01em' }}>
                  Dashboard
                </span>
              </div>
            </div>

            {/* SECTION 2: CLINICAL / PATIENT SERVICES GROUP */}
            <div className="sidebar-zone sidebar-zone-clinic">
              <div 
                className="sidebar-group-title"
                style={{ color: '#0D9488' }}
              >
                <span style={{ fontSize: '13px', lineHeight: 1 }}>•</span> PATIENT SERVICES
              </div>
              
              {(currentUser?.role === 'receptionist' || (coverageState['rc-register']?.on || coverageState['rc-upload']?.on || coverageState['rc-queue']?.on)) && (
                <div 
                  className={`sidebar-link ${['patients', 'patient-details'].includes(activeTab) ? 'active' : ''}`}
                  onClick={() => switchTab('patients')}
                >
                  {['patients', 'patient-details'].includes(activeTab) && (
                    <div style={{ position: 'absolute', left: '0px', top: '50%', transform: 'translateY(-50%)', width: '3.5px', height: '20px', borderRadius: '4px', background: '#0D9488' }} />
                  )}
                  <div className="sidebar-link-icon" style={{
                    background: ['patients', 'patient-details'].includes(activeTab) ? 'linear-gradient(135deg, #0D9488 0%, #14B8A6 100%)' : '#CCFBF1',
                    color: ['patients', 'patient-details'].includes(activeTab) ? '#FFFFFF' : '#0D9488',
                    boxShadow: ['patients', 'patient-details'].includes(activeTab) ? '0 3px 10px rgba(13, 148, 136, 0.25)' : 'none'
                  }}>
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
                  </div>
                  <span className="sidebar-link-text" style={{ fontSize: '13.5px', fontWeight: ['patients', 'patient-details'].includes(activeTab) ? 700 : 600, color: ['patients', 'patient-details'].includes(activeTab) ? '#0D9488' : '#0F172A', letterSpacing: '-0.01em' }}>
                    Patient Management
                  </span>
                </div>
              )}

              {(currentUser?.role === 'receptionist' || coverageState['rc-appt']?.on) && (
                <div 
                  className={`sidebar-link ${activeTab === 'appointments' ? 'active' : ''}`}
                  onClick={() => switchTab('appointments')}
                >
                  {activeTab === 'appointments' && (
                    <div style={{ position: 'absolute', left: '0px', top: '50%', transform: 'translateY(-50%)', width: '3.5px', height: '20px', borderRadius: '4px', background: '#0D9488' }} />
                  )}
                  <div className="sidebar-link-icon" style={{
                    background: activeTab === 'appointments' ? 'linear-gradient(135deg, #0D9488 0%, #14B8A6 100%)' : '#CCFBF1',
                    color: activeTab === 'appointments' ? '#FFFFFF' : '#0D9488',
                    boxShadow: activeTab === 'appointments' ? '0 3px 10px rgba(13, 148, 136, 0.25)' : 'none'
                  }}>
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="18" x="3" y="4" rx="2" ry="2"/><line x1="16" x2="16" y1="2" y2="6"/><line x1="8" x2="8" y1="2" y2="6"/><line x1="3" x2="21" y1="10" y2="10"/></svg>
                  </div>
                  <span className="sidebar-link-text" style={{ fontSize: '13.5px', fontWeight: activeTab === 'appointments' ? 700 : 600, color: activeTab === 'appointments' ? '#0D9488' : '#0F172A', letterSpacing: '-0.01em' }}>
                    Appointments
                  </span>
                </div>
              )}

              {currentUser?.role === 'receptionist' && (
                <div 
                  className={`sidebar-link ${activeTab === 'staff' ? 'active' : ''}`}
                  onClick={() => switchTab('staff')}
                >
                  {activeTab === 'staff' && (
                    <div style={{ position: 'absolute', left: '0px', top: '50%', transform: 'translateY(-50%)', width: '3.5px', height: '20px', borderRadius: '4px', background: '#0D9488' }} />
                  )}
                  <div className="sidebar-link-icon" style={{
                    background: activeTab === 'staff' ? 'linear-gradient(135deg, #0D9488 0%, #14B8A6 100%)' : '#CCFBF1',
                    color: activeTab === 'staff' ? '#FFFFFF' : '#0D9488',
                    boxShadow: activeTab === 'staff' ? '0 3px 10px rgba(13, 148, 136, 0.25)' : 'none'
                  }}>
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M19 11v6"/><path d="M22 14h-6"/></svg>
                  </div>
                  <span className="sidebar-link-text" style={{ fontSize: '13.5px', fontWeight: activeTab === 'staff' ? 700 : 600, color: activeTab === 'staff' ? '#0D9488' : '#0F172A', letterSpacing: '-0.01em' }}>
                    Staff Management
                  </span>
                </div>
              )}
            </div>

            {/* SECTION 3: FINANCE & OPERATIONS GROUP */}
            <div className="sidebar-zone sidebar-zone-finance">
              <div 
                className="sidebar-group-title"
                style={{ color: '#EA580C' }}
              >
                <span style={{ fontSize: '13px', lineHeight: 1 }}>•</span> OPERATIONS &amp; BILLING
              </div>

              {(currentUser?.role === 'receptionist' || coverageState['rc-billing']?.on) && (
                <div 
                  className={`sidebar-link ${activeTab === 'billing' ? 'active' : ''}`}
                  onClick={() => switchTab('billing')}
                >
                  {activeTab === 'billing' && (
                    <div style={{ position: 'absolute', left: '0px', top: '50%', transform: 'translateY(-50%)', width: '3.5px', height: '20px', borderRadius: '4px', background: '#EA580C' }} />
                  )}
                  <div className="sidebar-link-icon" style={{
                    background: activeTab === 'billing' ? 'linear-gradient(135deg, #EA580C 0%, #F97316 100%)' : '#FFEDD5',
                    color: activeTab === 'billing' ? '#FFFFFF' : '#EA580C',
                    boxShadow: activeTab === 'billing' ? '0 3px 10px rgba(234, 88, 12, 0.25)' : 'none'
                  }}>
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="20" height="14" x="2" y="5" rx="2"/><line x1="2" x2="22" y1="10" y2="10"/></svg>
                  </div>
                  <span className="sidebar-link-text" style={{ fontSize: '13.5px', fontWeight: activeTab === 'billing' ? 700 : 600, color: activeTab === 'billing' ? '#EA580C' : '#0F172A', letterSpacing: '-0.01em' }}>
                    Finance &amp; Billing
                  </span>
                </div>
              )}

              {coverageState?.['rc-reorder']?.on && (
                <div 
                  className={`sidebar-link ${['indent', 'new-indent'].includes(activeTab) ? 'active' : ''}`}
                  onClick={() => switchTab('indent')}
                >
                  {['indent', 'new-indent'].includes(activeTab) && (
                    <div style={{ position: 'absolute', left: '0px', top: '50%', transform: 'translateY(-50%)', width: '3.5px', height: '20px', borderRadius: '4px', background: '#EA580C' }} />
                  )}
                  <div className="sidebar-link-icon" style={{
                    background: ['indent', 'new-indent'].includes(activeTab) ? 'linear-gradient(135deg, #EA580C 0%, #F97316 100%)' : '#FFEDD5',
                    color: ['indent', 'new-indent'].includes(activeTab) ? '#FFFFFF' : '#EA580C',
                    boxShadow: ['indent', 'new-indent'].includes(activeTab) ? '0 3px 10px rgba(234, 88, 12, 0.25)' : 'none'
                  }}>
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect width="8" height="4" x="8" y="2" rx="1" ry="1"/></svg>
                  </div>
                  <span className="sidebar-link-text" style={{ fontSize: '13.5px', fontWeight: ['indent', 'new-indent'].includes(activeTab) ? 700 : 600, color: ['indent', 'new-indent'].includes(activeTab) ? '#EA580C' : '#0F172A', letterSpacing: '-0.01em' }}>
                    Utility Requests
                  </span>
                </div>
              )}
            </div>

            {/* SECTION 4: ACTIVE COVERAGES GROUP */}
            {(Object.keys(coverageState || {}).some(k => coverageState[k]?.on)) && (
              <div className="sidebar-group">
                <div className="sidebar-group-title" style={{ color: '#EF4444' }}>
                  <span style={{ fontSize: '13px', lineHeight: 1 }}>•</span> ACTIVE COVERAGES
                </div>
                {(Object.keys(coverageState || {}).some(k => (k.startsWith('dr-') || k.startsWith('doc-')) && coverageState[k]?.on)) && tenantModules.doctor?.enabled !== false && (
                  <div 
                    className="sidebar-link"
                    onClick={() => window.open('/doctor', '_blank')}
                    style={{ color: '#E11D48', fontWeight: 800 }}
                    title="Doctor Cover"
                  >
                    <div className="sidebar-link-icon" style={{ background: '#FFE4E6', color: '#E11D48' }}>
                      <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/></svg>
                    </div>
                    <span className="sidebar-link-text">Doctor Cover</span>
                  </div>
                )}
                {(Object.keys(coverageState || {}).some(k => k.startsWith('lt-') && coverageState[k]?.on)) && tenantModules.laboratory?.enabled !== false && (
                  <div 
                    className="sidebar-link"
                    onClick={() => window.open('/lab', '_blank')}
                    style={{ color: '#059669', fontWeight: 800 }}
                    title="Lab Cover"
                  >
                    <div className="sidebar-link-icon" style={{ background: '#D1FAE5', color: '#059669' }}>
                      <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M6 18H18"/><path d="M10 14H14"/><path d="M12 2v20"/><path d="M18 10H6"/></svg>
                    </div>
                    <span className="sidebar-link-text">Lab Cover</span>
                  </div>
                )}
                {(Object.keys(coverageState || {}).some(k => k.startsWith('ph-') && coverageState[k]?.on)) && tenantModules.pharmacy?.enabled !== false && (
                  <div 
                    className="sidebar-link"
                    onClick={() => window.open('/pharmacy', '_blank')}
                    style={{ color: '#2563EB', fontWeight: 800 }}
                    title="Pharmacy Cover"
                  >
                    <div className="sidebar-link-icon" style={{ background: '#DBEAFE', color: '#2563EB' }}>
                      <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
                    </div>
                    <span className="sidebar-link-text">Pharmacy Cover</span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Bottom Profile Section */}
          <div className="sidebar-profile-footer">
            <div className="sidebar-profile-fade-top" />
            <div className="sidebar-profile" onClick={(e) => { e.stopPropagation(); setShowProfileMenu(!showProfileMenu); }}>
              <div className="profile-avatar-wrap">
                {currentUser.avatar ? (
                  <img 
                    src={currentUser.avatar} 
                    alt="Avatar" 
                    className="profile-avatar"
                  />
                ) : (
                  <div className="profile-avatar-initials" style={{ background: 'linear-gradient(135deg, #F59E0B 0%, #D97706 100%)' }}>
                    {currentUser.name ? currentUser.name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase() : 'RC'}
                  </div>
                )}
                <span className="profile-avatar-status-dot" />
              </div>
              <div className="profile-info">
                <div className="profile-name">
                  {currentUser.name || 'Roshni'}
                </div>
                <div className="profile-role">
                  Receptionist
                </div>
              </div>
              <svg 
                xmlns="http://www.w3.org/2000/svg" 
                width="14" 
                height="14" 
                viewBox="0 0 24 24" 
                fill="none" 
                stroke="currentColor" 
                strokeWidth="2.5" 
                strokeLinecap="round" 
                strokeLinejoin="round" 
                className="profile-chevron" 
                style={{ 
                  marginLeft: 'auto', 
                  transform: showProfileMenu ? 'rotate(180deg)' : 'none' 
                }}
              >
                <path d="m18 15-6-6-6 6"/>
              </svg>

              {showProfileMenu && (
                <div 
                  className="sidebar-profile-popover-card" 
                  onClick={e => e.stopPropagation()}
                >
                  {/* Gradient Profile Header */}
                  <div className="profile-popover-header">
                    <div className="profile-popover-header-glow" />
                    <div className="profile-avatar-wrap">
                      {currentUser.avatar ? (
                        <img 
                          src={currentUser.avatar} 
                          alt="Avatar" 
                          className="profile-avatar"
                          style={{ border: '1.5px solid rgba(255,255,255,0.7)' }}
                        />
                      ) : (
                        <div 
                          className="profile-avatar-initials"
                          style={{ 
                            background: 'linear-gradient(135deg, #F59E0B 0%, #D97706 100%)',
                            boxShadow: '0 2px 8px rgba(0,0,0,0.25)',
                            border: '1.5px solid rgba(255,255,255,0.7)'
                          }}
                        >
                          {currentUser.name ? currentUser.name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase() : 'RC'}
                        </div>
                      )}
                      <span className="profile-avatar-status-dot" style={{ borderColor: '#FFFFFF' }} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0, zIndex: 1 }}>
                      <div className="profile-popover-header-name">
                        {currentUser.name || 'Roshni'}
                      </div>
                      <div className="profile-popover-header-role">
                        Front Desk Manager
                      </div>
                    </div>
                  </div>

                  {/* White Menu Body */}
                  <div className="profile-popover-body">
                    <div 
                      className="profile-popover-item"
                      onClick={() => {
                        switchTab('dash');
                        setShowProfileMenu(false);
                      }}
                    >
                      <div className="profile-popover-item-icon">
                        <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="7" height="9" x="3" y="3" rx="1"/><rect width="7" height="5" x="14" y="3" rx="1"/><rect width="7" height="9" x="14" y="10" rx="1"/><rect width="7" height="5" x="3" y="14" rx="1"/></svg>
                      </div>
                      <div className="profile-popover-item-texts">
                        <span className="profile-popover-item-title">Dashboard</span>
                        <span className="profile-popover-item-sub">Front desk overview</span>
                      </div>
                    </div>

                    <div 
                      className="profile-popover-item"
                      onClick={() => {
                        setShowProfileEditModal(true);
                        setShowProfileMenu(false);
                      }}
                    >
                      <div className="profile-popover-item-icon">
                        <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                      </div>
                      <div className="profile-popover-item-texts">
                        <span className="profile-popover-item-title">Edit Profile</span>
                        <span className="profile-popover-item-sub">Update profile details</span>
                      </div>
                    </div>

                    <div 
                      className="profile-popover-item"
                      onClick={() => {
                        setActiveTab('hr-payroll');
                        setShowProfileMenu(false);
                      }}
                    >
                      <div className="profile-popover-item-icon">
                        <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="20" height="14" x="2" y="5" rx="2"/><line x1="2" x2="22" y1="10" y2="10"/></svg>
                      </div>
                      <div className="profile-popover-item-texts">
                        <span className="profile-popover-item-title">HR &amp; Payroll</span>
                        <span className="profile-popover-item-sub">Manage payroll</span>
                      </div>
                    </div>

                    <div className="profile-popover-divider" style={{ height: '1px', background: '#F1F5F9', margin: '4px 6px' }} />

                    <div 
                      className="profile-popover-item logout-item"
                      onClick={handleLogout}
                    >
                      <div className="profile-popover-item-icon">
                        <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" x2="9" y1="12" y2="12"/></svg>
                      </div>
                      <div className="profile-popover-item-texts">
                        <span className="profile-popover-item-title">Logout</span>
                        <span className="profile-popover-item-sub">Exit session</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Mobile Sidebar Backdrop Overlay */}
      {mobileSidebarOpen && (
        <div className="mobile-backdrop" onClick={() => setMobileSidebarOpen(false)} />
      )}

      {/* Modern Top Command Bar */}
      {activeTab !== 'hr-payroll' && (
        <div className={"top-nav " + (isSidebarCollapsed ? "collapsed" : "")}>
          {/* Left: Command Center Title & Medical Shield Icon */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
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
                marginRight: '4px'
              }}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="4" x2="20" y1="12" y2="12"/><line x1="4" x2="20" y1="6" y2="6"/><line x1="4" x2="20" y1="18" y2="18"/></svg>
            </button>

            {/* Purple/Blue Command Shield Icon */}
            <div style={{
              width: '42px',
              height: '42px',
              borderRadius: '12px',
              background: 'linear-gradient(135deg, #4F46E5 0%, #7C3AED 100%)',
              color: '#FFFFFF',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 4px 14px rgba(79, 70, 229, 0.28)',
              flexShrink: 0
            }}>
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/></svg>
            </div>

            {/* Title & Status */}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '17px', fontWeight: 900, color: '#0F172A', letterSpacing: '-0.3px', lineHeight: 1.2 }}>
                  Front Desk Command Center
                </span>
                <span style={{
                  fontSize: '9.5px',
                  fontWeight: 850,
                  color: '#059669',
                  background: '#ECFDF5',
                  border: '1px solid #A7F3D0',
                  padding: '2px 7px',
                  borderRadius: '10px',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  letterSpacing: '0.03em'
                }}>
                  <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: '#10B981' }} />
                  SYSTEM ACTIVE
                </span>
              </div>
              <div style={{ fontSize: '11.5px', color: '#64748B', fontWeight: 550, marginTop: '2px', letterSpacing: '-0.01em' }}>
                {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })} · {currentUser.name || 'receptionist-1'}
              </div>
            </div>
          </div>

          {/* Center: Live Platform Telemetry & Shortcuts */}
          <div className="desktop-only-flex" style={{ alignItems: 'center', gap: '14px' }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 12px',
              borderRadius: '20px',
              background: '#F8FAFC',
              border: '1px solid #E2E8F0',
              fontSize: '12px',
              fontWeight: 650,
              color: '#334155'
            }}>
              <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: '#10B981', boxShadow: '0 0 0 2px rgba(16,185,129,0.2)' }} />
              <span>Network Status</span>
            </div>

            <button
              onClick={() => switchTab('appointments')}
              style={{
                background: 'transparent',
                border: 'none',
                color: '#64748B',
                fontSize: '12.5px',
                fontWeight: 650,
                cursor: 'pointer',
                padding: '6px 8px',
                borderRadius: '6px',
                transition: 'all 0.15s'
              }}
              onMouseEnter={e => e.currentTarget.style.color = '#2563EB'}
              onMouseLeave={e => e.currentTarget.style.color = '#64748B'}
            >
              Logs
            </button>

            <button
              onClick={() => setShowDashboardDateFilter(!showDashboardDateFilter)}
              style={{
                background: 'transparent',
                border: 'none',
                color: '#64748B',
                fontSize: '12.5px',
                fontWeight: 650,
                cursor: 'pointer',
                padding: '6px 8px',
                borderRadius: '6px',
                transition: 'all 0.15s'
              }}
              onMouseEnter={e => e.currentTarget.style.color = '#2563EB'}
              onMouseLeave={e => e.currentTarget.style.color = '#64748B'}
            >
              Analytics
            </button>
          </div>

          {/* Right: Search, Notifications, Shortcuts, Avatar */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            {/* Compact Search Input */}
            <div ref={globalSearchContainerRef} className="desktop-only-flex" style={{ position: 'relative', width: '220px' }}>
              <i data-lucide="search" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94A3B8', width: '14px', height: '14px' }}></i>
              <input 
                type="text" 
                className="search-input" 
                placeholder="Search patient..." 
                style={{
                  background: '#F8FAFC',
                  border: '1px solid #E2E8F0',
                  paddingLeft: '34px',
                  paddingRight: '12px',
                  height: '38px',
                  width: '100%',
                  borderRadius: '10px',
                  fontSize: '12.5px',
                  fontWeight: 600,
                  outline: 'none',
                  transition: 'all 0.2s'
                }} 
                value={globalSearchQuery}
                onChange={(e) => {
                  setGlobalSearchQuery(e.target.value);
                  setShowGlobalDropdown(true);
                }}
                onFocus={() => setShowGlobalDropdown(true)}
              />
              {showGlobalDropdown && globalSearchQuery.trim() !== '' && (
                <div 
                  style={{ 
                    position: 'absolute', 
                    top: 'calc(100% + 8px)', 
                    left: 0, 
                    width: '300px', 
                    background: 'white', 
                    borderRadius: '12px', 
                    border: '1px solid #E2E8F0', 
                    boxShadow: '0 12px 36px rgba(15,23,42,0.12)', 
                    zIndex: 99999, 
                    padding: '8px', 
                    maxHeight: '300px', 
                    overflowY: 'auto'
                  }}
                >
                  {(() => {
                    const query = globalSearchQuery.toLowerCase().trim();
                    const matches = patientsList.filter(p => 
                      (p.name || '').toLowerCase().includes(query) || 
                      (p.contact || '').toLowerCase().includes(query) ||
                      (p._id || '').toLowerCase().includes(query) ||
                      getFormattedPatientId(p._id).toLowerCase().includes(query)
                    );
                    
                    if (matches.length === 0) {
                      return (
                        <div style={{ padding: '12px', textAlign: 'center', color: '#94A3B8', fontSize: '12.5px', fontWeight: 600 }}>
                          No matching patients found
                        </div>
                      );
                    }
                    
                    return matches.map(p => (
                      <div 
                        key={p._id} 
                        onClick={() => {
                          handleOpenPatientProfile(p);
                          setGlobalSearchQuery('');
                          setShowGlobalDropdown(false);
                        }} 
                        style={{ 
                          padding: '10px 12px', 
                          borderRadius: '8px', 
                          cursor: 'pointer', 
                          display: 'flex', 
                          justifyContent: 'space-between', 
                          alignItems: 'center',
                          transition: 'background 0.2s',
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.background = '#F1F5F9'}
                        onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                      >
                        <div>
                          <div style={{ fontWeight: 700, fontSize: '13px', color: '#1E293B' }}>{p.name}</div>
                          <div style={{ fontSize: '11px', color: '#64748B', fontWeight: 550 }}>ID: {getFormattedPatientId(p._id)} | Mob: {p.contact || 'N/A'}</div>
                        </div>
                        <i data-lucide="chevron-right" style={{ width: '14px', color: '#94A3B8' }}></i>
                      </div>
                    ));
                  })()}
                </div>
              )}
            </div>

            {/* Notification Bell */}
            <div 
              ref={notificationRef}
              style={{
                position: 'relative',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '38px',
                height: '38px',
                borderRadius: '10px',
                background: '#FFFFFF',
                border: '1px solid #E2E8F0',
                color: '#64748B',
                boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
                transition: 'all 0.15s'
              }}
              onClick={() => {
                setShowNotifications(!showNotifications);
                setUnreadCount(0);
              }}
              onMouseEnter={e => { e.currentTarget.style.background = '#F8FAFC'; e.currentTarget.style.borderColor = '#CBD5E1'; }}
              onMouseLeave={e => { e.currentTarget.style.background = '#FFFFFF'; e.currentTarget.style.borderColor = '#E2E8F0'; }}
            >
              <i data-lucide="bell" style={{ width: '16px', height: '16px' }}></i>
              {unreadCount > 0 && (
                <span style={{ position: 'absolute', top: '-3px', right: '-3px', background: '#EF4444', color: 'white', borderRadius: '50%', width: '17px', height: '17px', fontSize: '9.5px', fontWeight: '900', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '2px solid white' }}>
                  {unreadCount}
                </span>
              )}

              {showNotifications && (
                <div data-lenis-prevent 
                  style={{
                    position: 'absolute',
                    top: '46px',
                    right: '0',
                    width: '320px',
                    background: 'rgba(255, 255, 255, 0.98)',
                    backdropFilter: 'blur(16px)',
                    borderRadius: '14px',
                    border: '1px solid #E2E8F0',
                    boxShadow: '0 16px 36px -8px rgba(15, 23, 42, 0.18)',
                    zIndex: 1000,
                    padding: '16px',
                    maxHeight: '400px',
                    overflowY: 'auto'
                  }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #F1F5F9', paddingBottom: '8px', marginBottom: '12px' }}>
                    <span style={{ fontWeight: 800, fontSize: '12.5px', color: '#0F172A' }}>Notifications</span>
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
                          <span style={{ fontWeight: 800, fontSize: '12px', color: '#1E293B' }}>{n.title}</span>
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

            {/* Help Button (?) */}
            <div 
              style={{
                width: '38px',
                height: '38px',
                borderRadius: '10px',
                background: '#FFFFFF',
                border: '1px solid #E2E8F0',
                color: '#64748B',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                fontSize: '13px',
                fontWeight: 800,
                boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
                transition: 'all 0.15s'
              }}
              title="Help &amp; Front Desk Guide"
              onClick={() => window.open('https://curoxa.com/support', '_blank')}
              onMouseEnter={e => { e.currentTarget.style.background = '#F8FAFC'; e.currentTarget.style.borderColor = '#CBD5E1'; }}
              onMouseLeave={e => { e.currentTarget.style.background = '#FFFFFF'; e.currentTarget.style.borderColor = '#E2E8F0'; }}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/></svg>
            </div>

            {/* Grid / Module Switcher (::) */}
            <div 
              style={{
                width: '38px',
                height: '38px',
                borderRadius: '10px',
                background: '#FFFFFF',
                border: '1px solid #E2E8F0',
                color: '#64748B',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
                transition: 'all 0.15s'
              }}
              title="Modules"
              onClick={() => switchTab('patients')}
              onMouseEnter={e => { e.currentTarget.style.background = '#F8FAFC'; e.currentTarget.style.borderColor = '#CBD5E1'; }}
              onMouseLeave={e => { e.currentTarget.style.background = '#FFFFFF'; e.currentTarget.style.borderColor = '#E2E8F0'; }}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect width="7" height="7" x="3" y="3" rx="1"/><rect width="7" height="7" x="14" y="3" rx="1"/><rect width="7" height="7" x="14" y="14" rx="1"/><rect width="7" height="7" x="3" y="14" rx="1"/></svg>
            </div>

            {/* User Avatar Pill */}
            <div 
              onClick={(e) => { e.stopPropagation(); setShowProfileMenu(!showProfileMenu); }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '3px 10px 3px 3px',
                borderRadius: '24px',
                background: '#EFF6FF',
                border: '1px solid #BFDBFE',
                cursor: 'pointer',
                transition: 'all 0.15s'
              }}
              onMouseEnter={e => e.currentTarget.style.borderColor = '#93C5FD'}
              onMouseLeave={e => e.currentTarget.style.borderColor = '#BFDBFE'}
            >
              <div style={{
                width: '32px',
                height: '32px',
                borderRadius: '50%',
                background: 'linear-gradient(135deg, #2563EB 0%, #7C3AED 100%)',
                color: '#FFFFFF',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 800,
                fontSize: '11.5px',
                flexShrink: 0
              }}>
                {currentUser.name ? currentUser.name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase() : 'RC'}
              </div>
              <span className="desktop-only-flex" style={{ fontSize: '12px', fontWeight: 800, color: '#1E40AF' }}>
                {currentUser.name || 'Receptionist'}
              </span>
            </div>
          </div>
        </div>
      )}

      <div className={"main-content " + (activeTab === 'hr-payroll' ? "fullscreen-portal" : (isSidebarCollapsed ? "collapsed" : ""))} data-lenis-prevent>
        {activeTab === 'hr-payroll' && (
          <div className="tab-content active" style={{ animation: 'slideUp 0.4s ease-out', padding: 0 }}>
            <HRPayroll onExit={() => setActiveTab('dash')} />
          </div>
        )}
        {activeTab === 'dash' && (
          <div className="tab-content active" style={{ animation: 'slideUp 0.4s ease-out' }}>
            
            {/* Online Patient Booking Requests Awaiting Approval */}
            {(() => {
              const pendingOnlineRequests = appointments.filter(a => 
                a.status === 'Pending Approval' || 
                (a.source === 'Online' && (a.status === 'Pending Approval' || a.status === 'Pending'))
              );
              if (pendingOnlineRequests.length === 0) return null;

              return (
                <div style={{
                  background: 'linear-gradient(135deg, #FFF7ED 0%, #FFEDD5 100%)',
                  border: '1.5px solid #FDBA74',
                  borderRadius: '16px',
                  padding: '20px 24px',
                  marginBottom: '24px',
                  boxShadow: '0 10px 25px -5px rgba(234, 88, 12, 0.12)'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '10px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <div style={{ width: '42px', height: '42px', borderRadius: '12px', background: '#EA580C', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><polyline points="16 11 18 13 22 9"/></svg>
                      </div>
                      <div>
                        <h3 style={{ margin: 0, fontSize: '17px', fontWeight: 800, color: '#9A3412', display: 'flex', alignItems: 'center', gap: '8px' }}>
                          Online Patient Registration Requests
                          <span style={{ background: '#EA580C', color: 'white', fontSize: '11px', padding: '2px 8px', borderRadius: '12px', fontWeight: 900 }}>
                            {pendingOnlineRequests.length} Pending Approval
                          </span>
                        </h3>
                        <p style={{ margin: '2px 0 0 0', fontSize: '12.5px', color: '#C2410C', fontWeight: 600 }}>
                          Patients registered through online portal. Click any card to review the complete submitted form & approve.
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Grid of Pending Requests */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '14px' }}>
                    {pendingOnlineRequests.map(app => {
                      const pat = app.patientId || {};
                      const doc = app.doctorId || {};
                      const ageDisplay = [
                        pat.age ? `${pat.age} Yrs` : null,
                        pat.ageMonths ? `${pat.ageMonths} M` : null,
                        pat.ageDays ? `${pat.ageDays} D` : null
                      ].filter(Boolean).join(' ') || 'Age N/A';

                      return (
                        <div
                          key={app._id}
                          onClick={() => openOnlineRequestReviewModal(app)}
                          style={{
                            background: '#FFFFFF',
                            borderRadius: '12px',
                            padding: '16px 18px',
                            border: '1px solid #FED7AA',
                            cursor: 'pointer',
                            transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                            boxShadow: '0 4px 10px rgba(0, 0, 0, 0.03)',
                            display: 'flex',
                            flexDirection: 'column',
                            justifyContent: 'space-between',
                            gap: '12px'
                          }}
                          onMouseEnter={e => {
                            e.currentTarget.style.transform = 'translateY(-2px)';
                            e.currentTarget.style.boxShadow = '0 8px 18px rgba(234, 88, 12, 0.18)';
                            e.currentTarget.style.borderColor = '#FB923C';
                          }}
                          onMouseLeave={e => {
                            e.currentTarget.style.transform = 'none';
                            e.currentTarget.style.boxShadow = '0 4px 10px rgba(0, 0, 0, 0.03)';
                            e.currentTarget.style.borderColor = '#FED7AA';
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                            {pat.avatar ? (
                              <img src={pat.avatar} alt="Patient" style={{ width: '44px', height: '44px', borderRadius: '50%', objectFit: 'cover', border: '2px solid #FB923C', flexShrink: 0 }} />
                            ) : (
                              <div style={{ width: '44px', height: '44px', borderRadius: '50%', background: 'linear-gradient(135deg, #FB923C 0%, #EA580C 100%)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: '15px', flexShrink: 0 }}>
                                {getInitials(pat.name || 'Patient')}
                              </div>
                            )}
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: '14.5px', fontWeight: 800, color: '#0F172A', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                {pat.name || 'Anonymous Patient'}
                              </div>
                              <div style={{ fontSize: '12px', color: '#64748B', fontWeight: 600 }}>
                                {pat.contact || 'No Contact'} • {pat.gender || 'N/A'}, {ageDisplay}
                              </div>
                            </div>
                          </div>

                          <div style={{ background: '#FFF7ED', padding: '8px 12px', borderRadius: '8px', fontSize: '12px' }}>
                            <div style={{ color: '#9A3412', fontWeight: 700 }}>
                              Doctor: <span style={{ color: '#0F172A', fontWeight: 800 }}>Dr. {doc.name || 'Assigned Doctor'} ({doc.specialty || 'General'})</span>
                            </div>
                            <div style={{ color: '#9A3412', fontWeight: 600, marginTop: '2px' }}>
                              Slot: <span style={{ color: '#EA580C', fontWeight: 800 }}>{getFormattedDate(app.date)} at {app.time}</span>
                            </div>
                            {app.reason && (
                              <div style={{ color: '#64748B', fontWeight: 600, marginTop: '4px', fontSize: '11px' }}>
                                Reason: <span style={{ color: '#334155' }}>{app.reason}</span>
                              </div>
                            )}
                          </div>

                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '6px', borderTop: '1px solid #F1F5F9' }}>
                            <span style={{ fontSize: '11px', color: '#EA580C', fontWeight: 800 }}>
                              ⚡ Click to Review Full Form
                            </span>
                            <button
                              type="button"
                              style={{ background: '#2563EB', color: 'white', border: 'none', padding: '6px 14px', borderRadius: '6px', fontSize: '11.5px', fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}
                              onClick={(e) => {
                                e.stopPropagation();
                                openOnlineRequestReviewModal(app);
                              }}
                            >
                              Review & Approve ➔
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })()}

            {/* 1. FRONT-DESK COMMAND CENTER HERO BANNER */}
            <div style={{
              background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.98) 0%, rgba(243, 244, 255, 0.92) 50%, rgba(238, 248, 255, 0.95) 100%)',
              border: '1px solid rgba(219, 234, 254, 0.9)',
              borderRadius: '20px',
              padding: '24px 28px',
              boxShadow: '0 4px 20px -4px rgba(37, 99, 235, 0.08), 0 1px 3px rgba(0, 0, 0, 0.02)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '18px',
              marginBottom: '22px',
              position: 'relative',
              overflow: 'hidden'
            }}>
              {/* Subtle background ambient mesh glow */}
              <div style={{
                position: 'absolute',
                top: '-40px',
                right: '-40px',
                width: '180px',
                height: '180px',
                borderRadius: '50%',
                background: 'radial-gradient(circle, rgba(99, 102, 241, 0.15) 0%, rgba(168, 85, 247, 0.05) 50%, transparent 70%)',
                pointerEvents: 'none'
              }} />

              {/* Left: Welcome Title & Context */}
              <div style={{ position: 'relative', zIndex: 1 }}>
                <div style={{ fontSize: '11.5px', fontWeight: 800, color: '#64748B', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '3px' }}>
                  WELCOME BACK,
                </div>
                <h1 style={{
                  fontSize: '28px',
                  fontWeight: 900,
                  margin: '0 0 4px 0',
                  letterSpacing: '-0.5px',
                  background: 'linear-gradient(135deg, #1E40AF 0%, #4338CA 50%, #7C3AED 100%)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  lineHeight: 1.15
                }}>
                  {user.name || currentUser.name || 'receptionist-1'}
                </h1>
                <div style={{ fontSize: '13px', color: '#475569', fontWeight: 600 }}>
                  Here's what's happening at your front desk today.
                </div>
              </div>

              {/* Right: Quick Action Buttons */}
              <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap', position: 'relative', zIndex: 1 }}>
                <button 
                  className="btn" 
                  style={{
                    height: '42px',
                    padding: '0 18px',
                    fontWeight: 800,
                    borderRadius: '12px',
                    background: 'linear-gradient(135deg, #2563EB 0%, #3B82F6 100%)',
                    color: '#FFFFFF',
                    border: 'none',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '8px',
                    cursor: 'pointer',
                    fontSize: '13px',
                    boxShadow: '0 4px 14px rgba(37, 99, 235, 0.28)',
                    transition: 'all 0.18s ease'
                  }} 
                  onClick={() => {
                    resetRegistrationForm();
                    setBookingType('opd');
                    switchTab('registration-form');
                  }}
                  onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-1.5px)'; e.currentTarget.style.boxShadow = '0 6px 18px rgba(37, 99, 235, 0.38)'; }}
                  onMouseLeave={e => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = '0 4px 14px rgba(37, 99, 235, 0.28)'; }}
                >
                  <i data-lucide="plus" style={{ width: '16px', strokeWidth: 3 }}></i> Create Appointment
                </button>
                <button 
                  className="btn" 
                  style={{
                    height: '42px',
                    padding: '0 18px',
                    fontWeight: 800,
                    borderRadius: '12px',
                    background: 'linear-gradient(135deg, #059669 0%, #10B981 100%)',
                    color: '#FFFFFF',
                    border: 'none',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '8px',
                    cursor: 'pointer',
                    fontSize: '13px',
                    boxShadow: '0 4px 14px rgba(5, 150, 105, 0.28)',
                    transition: 'all 0.18s ease'
                  }} 
                  onClick={() => {
                    resetRegistrationForm();
                    setBookingType('lab');
                    switchTab('registration-form');
                  }}
                  onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-1.5px)'; e.currentTarget.style.boxShadow = '0 6px 18px rgba(5, 150, 105, 0.38)'; }}
                  onMouseLeave={e => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = '0 4px 14px rgba(5, 150, 105, 0.28)'; }}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>
                  Book Lab Test
                </button>
                <button 
                  className="btn" 
                  style={{
                    height: '42px',
                    padding: '0 18px',
                    fontWeight: 800,
                    borderRadius: '12px',
                    background: 'linear-gradient(135deg, #7C3AED 0%, #8B5CF6 100%)',
                    color: '#FFFFFF',
                    border: 'none',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '8px',
                    cursor: 'pointer',
                    fontSize: '13px',
                    boxShadow: '0 4px 14px rgba(124, 58, 237, 0.28)',
                    transition: 'all 0.18s ease'
                  }} 
                  onClick={() => {
                    resetRegistrationForm();
                    setBookingType('service');
                    switchTab('registration-form');
                  }}
                  onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-1.5px)'; e.currentTarget.style.boxShadow = '0 6px 18px rgba(124, 58, 237, 0.38)'; }}
                  onMouseLeave={e => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = '0 4px 14px rgba(124, 58, 237, 0.28)'; }}
                >
                  <i data-lucide="sparkles" style={{ width: '16px', height: '16px' }}></i>
                  Book Direct Service
                </button>
                <button 
                  className="btn" 
                  style={{
                    width: '42px',
                    height: '42px',
                    padding: 0,
                    borderRadius: '12px',
                    background: showDashboardDateFilter ? '#2563EB' : '#FFFFFF',
                    color: showDashboardDateFilter ? '#FFFFFF' : '#475569',
                    border: '1px solid #CBD5E1',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.04)'
                  }}
                  onClick={() => setShowDashboardDateFilter(!showDashboardDateFilter)}
                  title="Filter dashboard by date / date range"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                    <line x1="16" y1="2" x2="16" y2="6" />
                    <line x1="8" y1="2" x2="8" y2="6" />
                    <line x1="3" y1="10" x2="21" y2="10" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Dashboard Date Filter Bar */}
            {showDashboardDateFilter && (
              <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '14px', padding: '16px 20px', marginBottom: '20px', boxShadow: '0 4px 16px rgba(0,0,0,0.04)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap', animation: 'slideDown 0.25s ease-out' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: '#EFF6FF', color: '#2563EB', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800 }}>
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                  </div>
                  <div>
                    <div style={{ fontSize: '13.5px', fontWeight: 800, color: '#0F172A' }}>Dashboard Date Range Filter</div>
                    <div style={{ fontSize: '11.5px', color: '#64748B', fontWeight: 550 }}>Filter live queue, schedule, and revenue metrics by date</div>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                  <div style={{ display: 'flex', background: '#F8FAFC', padding: '3px', borderRadius: '8px', border: '1px solid #E2E8F0' }}>
                    {[
                      { key: 'today', label: 'Today' },
                      { key: '7days', label: 'Last 7 Days' },
                      { key: '30days', label: 'Last 30 Days' },
                      { key: 'custom', label: 'Custom Range' }
                    ].map(p => (
                      <button
                        key={p.key}
                        type="button"
                        onClick={() => {
                          setDashboardFilterPreset(p.key);
                          if (p.key === 'today') {
                            const todayStr = getLocalDateString();
                            setDashboardFilterStartDate(todayStr);
                            setDashboardFilterEndDate(todayStr);
                          } else if (p.key === '7days') {
                            const d = new Date();
                            d.setDate(d.getDate() - 7);
                            setDashboardFilterStartDate(d.toISOString().split('T')[0]);
                            setDashboardFilterEndDate(getLocalDateString());
                          } else if (p.key === '30days') {
                            const d = new Date();
                            d.setDate(d.getDate() - 30);
                            setDashboardFilterStartDate(d.toISOString().split('T')[0]);
                            setDashboardFilterEndDate(getLocalDateString());
                          }
                        }}
                        style={{
                          padding: '6px 12px',
                          borderRadius: '6px',
                          border: 'none',
                          background: dashboardFilterPreset === p.key ? '#2563EB' : 'transparent',
                          color: dashboardFilterPreset === p.key ? '#FFFFFF' : '#64748B',
                          fontWeight: 700,
                          fontSize: '12px',
                          cursor: 'pointer',
                          transition: 'all 0.15s'
                        }}
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>

                  {dashboardFilterPreset === 'custom' && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <input
                        type="date"
                        value={dashboardFilterStartDate}
                        onChange={e => setDashboardFilterStartDate(e.target.value)}
                        style={{ height: '34px', border: '1px solid #CBD5E1', borderRadius: '6px', padding: '0 8px', fontSize: '12px', fontWeight: 600, outline: 'none', background: 'white' }}
                      />
                      <span style={{ fontSize: '12px', color: '#64748B', fontWeight: 700 }}>to</span>
                      <input
                        type="date"
                        value={dashboardFilterEndDate}
                        onChange={e => setDashboardFilterEndDate(e.target.value)}
                        style={{ height: '34px', border: '1px solid #CBD5E1', borderRadius: '6px', padding: '0 8px', fontSize: '12px', fontWeight: 600, outline: 'none', background: 'white' }}
                      />
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* 2. 4 VISUALLY DISTINCT KPI COMMAND CARDS */}
            {(() => {
              const completedAppts = filteredAppointments.filter(a => a.status === 'Completed' || a.status === 'Paid');
              const waitingAppts = filteredAppointments.filter(a => a.status === 'Waiting' || a.status === 'Checked In' || a.status === 'Pending' || a.status === 'Pending Approval' || (!['Completed', 'Paid', 'Cancelled'].includes(a.status)));
              const availableDocs = doctors.filter(d => !d.isWeeklyOff && !d.isOnLeave && d.available !== false);
              const paidBills = filteredBills.filter(b => b.status === 'Paid');
              const totalRevenueToday = paidBills.reduce((sum, b) => sum + (b.totalAmount || 0), 0);
              const completionPercent = filteredAppointments.length > 0 ? Math.round((completedAppts.length / filteredAppointments.length) * 100) : 0;

              return (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 w-full mb-6">
                  {/* Card 1: Today's Appointments (Electric Blue Gradient) */}
                  <div 
                    className="p-5 rounded-2xl border border-blue-200/90 shadow-[0_12px_28px_rgba(37,99,235,0.08)] hover:shadow-[0_16px_36px_rgba(37,99,235,0.16)] hover:-translate-y-0.5 transition-all flex flex-col justify-between relative overflow-hidden group cursor-pointer"
                    style={{
                      background: 'radial-gradient(circle at 100% 100%, rgba(59, 130, 246, 0.25) 0%, transparent 65%), linear-gradient(135deg, #FFFFFF 0%, #EFF6FF 50%, #DBEAFE 100%)'
                    }}
                    onClick={() => switchTab('appointments')}
                  >
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-blue-700 to-blue-500 text-white flex items-center justify-center shrink-0 shadow-md shadow-blue-500/25">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="18" x="3" y="4" rx="2"/><line x1="16" x2="16" y1="2" y2="6"/><line x1="8" x2="8" y1="2" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                      </div>
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="text-[10px] font-extrabold text-blue-900 uppercase tracking-wider">Today's Appointments</span>
                      </div>
                    </div>
                    
                    <div className="mt-4 flex items-end justify-between">
                      <div>
                        <div className="text-3xl font-black text-slate-900 tracking-tight leading-none">{filteredAppointments.length}</div>
                        <div className="text-xs text-blue-700 font-bold mt-2 truncate">
                          {completedAppts.length} completed · {filteredAppointments.length - completedAppts.length} pending ({completionPercent}% Done)
                        </div>
                      </div>

                      {/* Blue Mini Sparkline */}
                      <div className="w-16 h-8 shrink-0 relative">
                        <svg className="w-full h-full overflow-visible" viewBox="0 0 64 32">
                          <defs>
                            <linearGradient id="kpiBlueGradRec" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor="#2563EB" stopOpacity="0.45"/>
                              <stop offset="100%" stopColor="#2563EB" stopOpacity="0.05"/>
                            </linearGradient>
                          </defs>
                          <path d="M 0 24 Q 16 26, 24 16 T 40 18 T 52 8 T 64 12 L 64 32 L 0 32 Z" fill="url(#kpiBlueGradRec)" />
                          <path d="M 0 24 Q 16 26, 24 16 T 40 18 T 52 8 T 64 12" fill="none" stroke="#2563EB" strokeWidth="2.4" strokeLinecap="round" />
                        </svg>
                      </div>
                    </div>

                    {/* Half Gradient Accent Line Beneath Card */}
                    <div 
                      className="h-[4px] rounded-br-2xl absolute bottom-0 right-0 w-3/5 pointer-events-none"
                      style={{
                        background: 'linear-gradient(90deg, transparent 0%, #2563EB 100%)'
                      }}
                    />
                  </div>

                  {/* Card 2: Waiting in Queue (Purple/Violet Gradient) */}
                  <div 
                    className="p-5 rounded-2xl border border-purple-200/90 shadow-[0_12px_28px_rgba(139,92,246,0.08)] hover:shadow-[0_16px_36px_rgba(139,92,246,0.16)] hover:-translate-y-0.5 transition-all flex flex-col justify-between relative overflow-hidden group cursor-pointer"
                    style={{
                      background: 'radial-gradient(circle at 0% 0%, rgba(139, 92, 246, 0.25) 0%, transparent 65%), linear-gradient(135deg, #FFFFFF 0%, #F5F3FF 50%, #EDE9FE 100%)'
                    }}
                    onClick={() => switchTab('appointments')}
                  >
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-purple-700 to-indigo-600 text-white flex items-center justify-center shrink-0 shadow-md shadow-purple-500/25">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                      </div>
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="text-[10px] font-extrabold text-purple-900 uppercase tracking-wider">Waiting in Queue</span>
                      </div>
                    </div>
                    
                    <div className="mt-4 flex items-end justify-between">
                      <div>
                        <div className="text-3xl font-black text-slate-900 tracking-tight leading-none">{waitingAppts.length}</div>
                        <div className="text-xs text-purple-700 font-bold mt-2 truncate">
                          Active Room Intake · ~12m avg wait
                        </div>
                      </div>

                      {/* Purple Mini Sparkline */}
                      <div className="w-16 h-8 shrink-0 relative">
                        <svg className="w-full h-full overflow-visible" viewBox="0 0 64 32">
                          <defs>
                            <linearGradient id="kpiPurpleGradRec" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor="#8B5CF6" stopOpacity="0.45"/>
                              <stop offset="100%" stopColor="#8B5CF6" stopOpacity="0.05"/>
                            </linearGradient>
                          </defs>
                          <path d="M 0 26 Q 16 26, 26 24 T 42 16 T 54 8 T 64 12 L 64 32 L 0 32 Z" fill="url(#kpiPurpleGradRec)" />
                          <path d="M 0 26 Q 16 26, 26 24 T 42 16 T 54 8 T 64 12" fill="none" stroke="#8B5CF6" strokeWidth="2.4" strokeLinecap="round" />
                        </svg>
                      </div>
                    </div>

                    {/* Half Gradient Accent Line Beneath Card */}
                    <div 
                      className="h-[4px] rounded-br-2xl absolute bottom-0 right-0 w-3/5 pointer-events-none"
                      style={{
                        background: 'linear-gradient(90deg, transparent 0%, #8B5CF6 100%)'
                      }}
                    />
                  </div>

                  {/* Card 3: Collected Today (Emerald Green Gradient) */}
                  <div 
                    className="p-5 rounded-2xl border border-emerald-200/90 shadow-[0_12px_28px_rgba(16,185,129,0.08)] hover:shadow-[0_16px_36px_rgba(16,185,129,0.16)] hover:-translate-y-0.5 transition-all flex flex-col justify-between relative overflow-hidden group cursor-pointer"
                    style={{
                      background: 'radial-gradient(circle at 100% 0%, rgba(16, 185, 129, 0.25) 0%, transparent 65%), linear-gradient(135deg, #FFFFFF 0%, #ECFDF5 50%, #D1FAE5 100%)'
                    }}
                    onClick={() => switchTab('billing')}
                  >
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-emerald-600 to-teal-500 text-white flex items-center justify-center shrink-0 shadow-md shadow-emerald-500/25">
                        <span className="text-base font-black font-sans leading-none">₹</span>
                      </div>
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="text-[10px] font-extrabold text-emerald-900 uppercase tracking-wider">Collected Today</span>
                      </div>
                    </div>
                    
                    <div className="mt-4 flex items-end justify-between">
                      <div>
                        <div className="text-3xl font-black text-slate-900 tracking-tight leading-none">
                          ₹{totalRevenueToday.toLocaleString('en-IN')}
                        </div>
                        <div className="text-xs text-emerald-700 font-bold mt-2 truncate">
                          {paidBills.length} receipts settled · 100% cleared
                        </div>
                      </div>

                      {/* Green Mini Sparkline */}
                      <div className="w-16 h-8 shrink-0 relative">
                        <svg className="w-full h-full overflow-visible" viewBox="0 0 64 32">
                          <defs>
                            <linearGradient id="kpiGreenGradRec" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor="#10B981" stopOpacity="0.45"/>
                              <stop offset="100%" stopColor="#10B981" stopOpacity="0.05"/>
                            </linearGradient>
                          </defs>
                          <path d="M 0 26 Q 14 24, 22 22 T 36 10 T 48 18 T 58 6 T 64 10 L 64 32 L 0 32 Z" fill="url(#kpiGreenGradRec)" />
                          <path d="M 0 26 Q 14 24, 22 22 T 36 10 T 48 18 T 58 6 T 64 10" fill="none" stroke="#10B981" strokeWidth="2.4" strokeLinecap="round" />
                        </svg>
                      </div>
                    </div>

                    {/* Half Gradient Accent Line Beneath Card */}
                    <div 
                      className="h-[4px] rounded-br-2xl absolute bottom-0 right-0 w-3/5 pointer-events-none"
                      style={{
                        background: 'linear-gradient(90deg, transparent 0%, #10B981 100%)'
                      }}
                    />
                  </div>

                  {/* Card 4: Doctors Available (Amber / Orange Gradient) */}
                  <div 
                    className="p-5 rounded-2xl border border-amber-200/90 shadow-[0_12px_28px_rgba(245,158,11,0.08)] hover:shadow-[0_16px_36px_rgba(245,158,11,0.16)] hover:-translate-y-0.5 transition-all flex flex-col justify-between relative overflow-hidden group cursor-pointer"
                    style={{
                      background: 'radial-gradient(circle at 0% 100%, rgba(245, 158, 11, 0.25) 0%, transparent 65%), linear-gradient(135deg, #FFFFFF 0%, #FFFBEB 50%, #FEF3C7 100%)'
                    }}
                    onClick={() => switchTab('staff')}
                  >
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-amber-600 to-amber-400 text-white flex items-center justify-center shrink-0 shadow-md shadow-amber-500/25">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M4.8 2.3A.3.3 0 1 0 5 2H4a2 2 0 0 0-2 2v5a6 6 0 0 0 6 6v0a6 6 0 0 0 6-6V4a2 2 0 0 0-2-2h-1a.2.2 0 1 0 .3.3"/><path d="M8 15v1a6 6 0 0 0 6 6v0a6 6 0 0 0 6-6v-4"/><circle cx="20" cy="10" r="2"/></svg>
                      </div>
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="text-[10px] font-extrabold text-amber-900 uppercase tracking-wider">Doctors Available</span>
                      </div>
                    </div>
                    
                    <div className="mt-4 flex items-end justify-between">
                      <div>
                        <div className="text-3xl font-black text-slate-900 tracking-tight leading-none">
                          {availableDocs.length} <span className="text-sm font-bold text-amber-800">/ {doctors.length}</span>
                        </div>
                        <div className="text-xs text-amber-700 font-bold mt-2 truncate">
                          {doctors.length - availableDocs.length > 0 ? `${doctors.length - availableDocs.length} off duty / on leave` : '100% on duty'}
                        </div>
                      </div>

                      {/* Amber Mini Sparkline */}
                      <div className="w-16 h-8 shrink-0 relative">
                        <svg className="w-full h-full overflow-visible" viewBox="0 0 64 32">
                          <defs>
                            <linearGradient id="kpiAmberGradRec" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor="#F59E0B" stopOpacity="0.45"/>
                              <stop offset="100%" stopColor="#F59E0B" stopOpacity="0.05"/>
                            </linearGradient>
                          </defs>
                          <path d="M 0 28 Q 18 28, 28 26 T 44 18 T 56 6 T 64 8 L 64 32 L 0 32 Z" fill="url(#kpiAmberGradRec)" />
                          <path d="M 0 28 Q 18 28, 28 26 T 44 18 T 56 6 T 64 8" fill="none" stroke="#F59E0B" strokeWidth="2.4" strokeLinecap="round" />
                        </svg>
                      </div>
                    </div>

                    {/* Half Gradient Accent Line Beneath Card */}
                    <div 
                      className="h-[4px] rounded-br-2xl absolute bottom-0 right-0 w-3/5 pointer-events-none"
                      style={{
                        background: 'linear-gradient(90deg, transparent 0%, #F59E0B 100%)'
                      }}
                    />
                  </div>
                </div>
              );
            })()}

            {/* 3. MAIN ASYMMETRIC DASHBOARD GRID */}
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.8fr) minmax(0, 1fr)', gap: '24px', alignItems: 'start', marginBottom: '24px' }}>
              
              {/* LEFT COLUMN: TODAY'S SCHEDULE & WAITING QUEUE */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', minWidth: 0 }}>
                
                {/* Panel 1: TODAY'S SCHEDULE (TIMELINE) */}
                <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '18px', padding: '24px 26px', boxShadow: '0 2px 10px rgba(15, 23, 42, 0.03)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <div style={{ width: '34px', height: '34px', borderRadius: '10px', background: '#EFF6FF', color: '#2563EB', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <i data-lucide="calendar" style={{ width: '17px', height: '17px' }}></i>
                      </div>
                      <div>
                        <h3 style={{ fontSize: '15.5px', fontWeight: 850, color: '#0F172A', margin: 0 }}>Today's Schedule</h3>
                        <span style={{ fontSize: '11.5px', color: '#64748B', fontWeight: 550 }}>Live appointment timeline &amp; clinical consultations</span>
                      </div>
                    </div>
                    <button
                      onClick={() => switchTab('appointments')}
                      style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', color: '#2563EB', fontSize: '11.5px', fontWeight: 750, padding: '6px 12px', borderRadius: '8px', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '5px', transition: 'all 0.15s' }}
                      onMouseEnter={e => { e.currentTarget.style.background = '#EFF6FF'; e.currentTarget.style.borderColor = '#BFDBFE'; }}
                      onMouseLeave={e => { e.currentTarget.style.background = '#F8FAFC'; e.currentTarget.style.borderColor = '#E2E8F0'; }}
                    >
                      View All <i data-lucide="arrow-right" style={{ width: '13px', height: '13px' }}></i>
                    </button>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {filteredAppointments.length === 0 ? (
                      <div style={{ textAlign: 'center', padding: '36px 16px', color: '#64748B', background: 'linear-gradient(135deg, #F8FAFC 0%, #EEF2FF 100%)', borderRadius: '14px', border: '1px dashed #CBD5E1' }}>
                        <div style={{ width: '48px', height: '48px', borderRadius: '14px', background: '#FFFFFF', color: '#2563EB', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 10px auto', boxShadow: '0 4px 12px rgba(37, 99, 235, 0.12)' }}>
                          <i data-lucide="calendar-check" style={{ width: '24px', height: '24px' }}></i>
                        </div>
                        <div style={{ fontSize: '14px', fontWeight: 800, color: '#1E293B' }}>No appointments scheduled for this view</div>
                        <div style={{ fontSize: '12px', color: '#64748B', marginTop: '3px' }}>Click "+ Create Appointment" to schedule an OPD patient slot</div>
                      </div>
                    ) : (
                      filteredAppointments.slice(0, 5).map((app, idx) => {
                        const isCompleted = app.status === 'Completed' || app.status === 'Paid';
                        const isCancelled = app.status === 'Cancelled';
                        const isPending = !isCompleted && !isCancelled;
                        const patientName = app.patientId?.name || 'Walk-in Patient';
                        const doctorName = app.doctorId?.name || 'Assigned Specialist';
                        const specialty = app.doctorId?.specialty || 'General Medicine';
                        const timeSlot = app.time || '09:30 AM';

                        return (
                          <div
                            key={app._id || idx}
                            onClick={() => openDetailsModal(app)}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              padding: '12px 16px',
                              borderRadius: '12px',
                              background: idx === 0 && isPending ? '#F0F9FF' : '#FAFBFD',
                              border: idx === 0 && isPending ? '1px solid #BAE6FD' : '1px solid #F1F5F9',
                              transition: 'all 0.15s ease',
                              cursor: 'pointer',
                              gap: '12px'
                            }}
                            onMouseEnter={e => { e.currentTarget.style.background = '#FFFFFF'; e.currentTarget.style.boxShadow = '0 4px 12px rgba(15,23,42,0.06)'; e.currentTarget.style.borderColor = '#CBD5E1'; }}
                            onMouseLeave={e => { e.currentTarget.style.background = idx === 0 && isPending ? '#F0F9FF' : '#FAFBFD'; e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.borderColor = idx === 0 && isPending ? '#BAE6FD' : '#F1F5F9'; }}
                          >
                            {/* Time & Dot */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: '100px' }}>
                              <span style={{
                                width: '9px',
                                height: '9px',
                                borderRadius: '50%',
                                background: isCompleted ? '#10B981' : isCancelled ? '#EF4444' : '#2563EB',
                                boxShadow: isPending ? '0 0 0 3px rgba(37,99,235,0.15)' : 'none',
                                flexShrink: 0
                              }} />
                              <span style={{ fontSize: '12.5px', fontWeight: 800, color: '#0F172A', fontVariantNumeric: 'tabular-nums' }}>
                                {timeSlot}
                              </span>
                            </div>

                            {/* Patient Info */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1, minWidth: 0 }}>
                              <div style={{
                                width: '32px',
                                height: '32px',
                                borderRadius: '50%',
                                background: '#EFF6FF',
                                color: '#2563EB',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontWeight: 800,
                                fontSize: '11px',
                                flexShrink: 0,
                                border: '1px solid #DBEAFE'
                              }}>
                                {patientName.split(' ').map(p => p[0]).join('').substring(0, 2).toUpperCase()}
                              </div>
                              <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                                <span style={{ fontSize: '13px', fontWeight: 800, color: '#0F172A', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                  {patientName}
                                </span>
                                <span style={{ fontSize: '11px', color: '#64748B', fontWeight: 550 }}>
                                  ID: {getFormattedPatientId(app.patientId?._id || app.patientId)}
                                </span>
                              </div>
                            </div>

                            {/* Doctor info */}
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', minWidth: '140px' }} className="desktop-only-flex">
                              <span style={{ fontSize: '12px', fontWeight: 750, color: '#334155' }}>
                                Dr. {doctorName.replace(/^Dr\.\s*/i, '')}
                              </span>
                              <span style={{ fontSize: '10.5px', color: '#64748B', fontWeight: 600 }}>
                                {specialty}
                              </span>
                            </div>

                            {/* Status badge */}
                            <span style={{
                              fontSize: '10px',
                              fontWeight: 800,
                              padding: '3px 9px',
                              borderRadius: '20px',
                              textTransform: 'uppercase',
                              letterSpacing: '0.4px',
                              background: isCompleted ? '#D1FAE5' : isCancelled ? '#FEE2E2' : '#DBEAFE',
                              color: isCompleted ? '#065F46' : isCancelled ? '#991B1B' : '#1E40AF',
                              border: `1px solid ${isCompleted ? '#A7F3D0' : isCancelled ? '#FECACA' : '#BFDBFE'}`,
                              flexShrink: 0
                            }}>
                              {app.status || 'Scheduled'}
                            </span>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>

                {/* Panel 2: WAITING QUEUE (OPERATIONALLY CRITICAL) */}
                {(() => {
                  const waitingQueue = filteredAppointments.filter(a => a.status === 'Waiting' || a.status === 'Checked In' || a.status === 'Pending' || a.status === 'Pending Approval' || (!['Completed', 'Paid', 'Cancelled'].includes(a.status)));

                  return (
                    <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '18px', padding: '24px 26px', boxShadow: '0 2px 10px rgba(15, 23, 42, 0.03)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <div style={{ width: '34px', height: '34px', borderRadius: '10px', background: '#FEF3C7', color: '#D97706', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <i data-lucide="users" style={{ width: '17px', height: '17px' }}></i>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <h3 style={{ fontSize: '15.5px', fontWeight: 850, color: '#0F172A', margin: 0 }}>Waiting Queue</h3>
                            <span style={{ fontSize: '10.5px', fontWeight: 800, background: '#FEF3C7', color: '#92400E', padding: '2px 8px', borderRadius: '12px', border: '1px solid #FDE68A' }}>
                              {waitingQueue.length} Waiting
                            </span>
                          </div>
                        </div>
                        <button
                          onClick={() => switchTab('appointments')}
                          style={{ background: '#FFFBEB', border: '1px solid #FCD34D', color: '#B45309', fontSize: '11.5px', fontWeight: 750, padding: '6px 12px', borderRadius: '8px', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '5px', transition: 'all 0.15s' }}
                          onMouseEnter={e => { e.currentTarget.style.background = '#FEF3C7'; }}
                          onMouseLeave={e => { e.currentTarget.style.background = '#FFFBEB'; }}
                        >
                          Manage Queue <i data-lucide="arrow-right" style={{ width: '13px', height: '13px' }}></i>
                        </button>
                      </div>

                      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        {waitingQueue.length === 0 ? (
                          <div style={{ textAlign: 'center', padding: '32px 16px', background: 'linear-gradient(135deg, #F0FDF4 0%, #ECFDF5 100%)', borderRadius: '14px', border: '1px solid #BBF7D0', color: '#15803D' }}>
                            <div style={{ width: '44px', height: '44px', borderRadius: '12px', background: '#FFFFFF', color: '#16A34A', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 8px auto', boxShadow: '0 4px 12px rgba(22, 163, 74, 0.14)' }}>
                              <i data-lucide="check-circle" style={{ width: '24px', height: '24px' }}></i>
                            </div>
                            <div style={{ fontSize: '13.5px', fontWeight: 850, color: '#166534' }}>Waiting Room is Clear</div>
                            <div style={{ fontSize: '12px', color: '#15803D', marginTop: '3px' }}>All checked-in patients have been attended or none are currently in queue.</div>
                          </div>
                        ) : (
                          waitingQueue.slice(0, 4).map((app, idx) => {
                            const patientName = app.patientId?.name || 'Walk-in Patient';
                            const doctorName = app.doctorId?.name || 'Specialist on Duty';
                            const specialty = app.doctorId?.specialty || 'General Medicine';
                            const tokenNum = String(idx + 1).padStart(2, '0');

                            return (
                              <div
                                key={app._id || idx}
                                onClick={() => openDetailsModal(app)}
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'space-between',
                                  padding: '12px 16px',
                                  borderRadius: '12px',
                                  background: '#FFFDF7',
                                  border: '1px solid #FEF3C7',
                                  transition: 'all 0.15s ease',
                                  cursor: 'pointer',
                                  gap: '12px'
                                }}
                                onMouseEnter={e => { e.currentTarget.style.background = '#FFFFFF'; e.currentTarget.style.borderColor = '#F59E0B'; e.currentTarget.style.boxShadow = '0 4px 12px rgba(217,119,6,0.1)'; }}
                                onMouseLeave={e => { e.currentTarget.style.background = '#FFFDF7'; e.currentTarget.style.borderColor = '#FEF3C7'; e.currentTarget.style.boxShadow = 'none'; }}
                              >
                                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                  <div style={{
                                    width: '34px',
                                    height: '34px',
                                    borderRadius: '10px',
                                    background: '#FEF3C7',
                                    color: '#B45309',
                                    fontWeight: 900,
                                    fontSize: '12px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    flexShrink: 0
                                  }}>
                                    #{tokenNum}
                                  </div>
                                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                                    <span style={{ fontSize: '13px', fontWeight: 800, color: '#0F172A' }}>{patientName}</span>
                                    <span style={{ fontSize: '11px', color: '#64748B', fontWeight: 550 }}>Mob: {app.patientId?.contact || 'N/A'}</span>
                                  </div>
                                </div>

                                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }} className="desktop-only-flex">
                                  <span style={{ fontSize: '12px', fontWeight: 750, color: '#334155' }}>Dr. {doctorName.replace(/^Dr\.\s*/i, '')}</span>
                                  <span style={{ fontSize: '10.5px', color: '#64748B', fontWeight: 600 }}>{specialty}</span>
                                </div>

                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                  <span style={{ fontSize: '11px', fontWeight: 700, color: '#64748B', fontVariantNumeric: 'tabular-nums' }}>
                                    {app.time || 'Queue'}
                                  </span>
                                  <span style={{ fontSize: '10px', fontWeight: 800, padding: '3px 8px', borderRadius: '20px', background: '#FEF3C7', color: '#92400E', border: '1px solid #FCD34D' }}>
                                    WAITING
                                  </span>
                                </div>
                              </div>
                            );
                          })
                        )}
                      </div>
                    </div>
                  );
                })()}

              </div>{/* END LEFT COLUMN */}


              {/* RIGHT COLUMN: QUICK ACTIONS, DOCTOR AVAILABILITY & COLLECTION SNAPSHOT */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', minWidth: 0 }}>
                
                {/* Panel 1: QUICK ACTIONS PANEL */}
                <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '18px', padding: '22px 24px', boxShadow: '0 2px 10px rgba(15, 23, 42, 0.03)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
                    <div style={{ width: '30px', height: '30px', borderRadius: '8px', background: '#EFF6FF', color: '#2563EB', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <i data-lucide="zap" style={{ width: '15px', height: '15px' }}></i>
                    </div>
                    <h3 style={{ fontSize: '15px', fontWeight: 850, color: '#0F172A', margin: 0 }}>Quick Actions</h3>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                    {[
                      {
                        title: 'Register Patient',
                        desc: 'New OPD profile',
                        icon: 'user-plus',
                        color: '#2563EB',
                        bg: '#EFF6FF',
                        border: '#BFDBFE',
                        action: () => { resetRegistrationForm(); setBookingType('opd'); switchTab('registration-form'); }
                      },
                      {
                        title: 'Book Appt',
                        desc: 'Doctor OPD slot',
                        icon: 'calendar-plus',
                        color: '#059669',
                        bg: '#ECFDF5',
                        border: '#A7F3D0',
                        action: () => { resetRegistrationForm(); setBookingType('opd'); switchTab('registration-form'); }
                      },
                      {
                        title: 'Check-in',
                        desc: 'Mark arrived',
                        icon: 'check-circle-2',
                        color: '#D97706',
                        bg: '#FFFBEB',
                        border: '#FDE68A',
                        action: () => switchTab('appointments')
                      },
                      {
                        title: 'Collect Payment',
                        desc: 'Generate receipt',
                        icon: 'credit-card',
                        color: '#7C3AED',
                        bg: '#FAF5FF',
                        border: '#DDD6FE',
                        action: () => switchTab('billing')
                      }
                    ].map(item => (
                      <div
                        key={item.title}
                        onClick={item.action}
                        style={{
                          padding: '12px 14px',
                          borderRadius: '14px',
                          background: item.bg,
                          border: `1px solid ${item.border}`,
                          cursor: 'pointer',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '6px',
                          transition: 'all 0.18s ease'
                        }}
                        onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = `0 6px 16px ${item.color}25`; e.currentTarget.style.borderColor = item.color; }}
                        onMouseLeave={e => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.borderColor = item.border; }}
                      >
                        <div style={{ width: '32px', height: '32px', borderRadius: '10px', background: '#FFFFFF', color: item.color, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
                          <i data-lucide={item.icon} style={{ width: '16px', height: '16px' }}></i>
                        </div>
                        <div>
                          <div style={{ fontSize: '12.5px', fontWeight: 800, color: '#0F172A', lineHeight: 1.2 }}>{item.title}</div>
                          <div style={{ fontSize: '10.5px', color: '#64748B', fontWeight: 550, marginTop: '2px' }}>{item.desc}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Panel 2: DOCTOR AVAILABILITY */}
                <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '18px', padding: '22px 24px', boxShadow: '0 2px 10px rgba(15, 23, 42, 0.03)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <div style={{ width: '30px', height: '30px', borderRadius: '8px', background: '#ECFDF5', color: '#059669', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <i data-lucide="stethoscope" style={{ width: '15px', height: '15px' }}></i>
                      </div>
                      <h3 style={{ fontSize: '15px', fontWeight: 850, color: '#0F172A', margin: 0 }}>Doctor Availability</h3>
                    </div>
                    <button
                      onClick={() => switchTab('staff')}
                      style={{ background: 'none', border: 'none', color: '#2563EB', fontSize: '11.5px', fontWeight: 750, cursor: 'pointer', padding: 0 }}
                    >
                      View All →
                    </button>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {doctors.length === 0 ? (
                      <div style={{ textAlign: 'center', padding: '16px', color: '#64748B', fontSize: '12px' }}>
                        No doctors registered.
                      </div>
                    ) : (
                      doctors.slice(0, 4).map((doc, idx) => {
                        const isOff = doc.isWeeklyOff;
                        const isLeave = doc.isOnLeave;
                        const isUnavailable = doc.available === false;
                        const isAvailable = !isOff && !isLeave && !isUnavailable;
                        
                        // Derived patient count for doctor today
                        const docAppts = filteredAppointments.filter(a => String(a.doctorId?._id || a.doctorId) === String(doc._id));
                        const docPatientsCount = docAppts.length;
                        const maxTarget = 8;
                        const utilizationPercent = Math.min(100, Math.round((docPatientsCount / maxTarget) * 100));

                        return (
                          <div
                            key={doc._id || idx}
                            style={{
                              display: 'flex',
                              flexDirection: 'column',
                              gap: '6px',
                              padding: '10px 12px',
                              borderRadius: '12px',
                              background: '#F8FAFC',
                              border: '1px solid #F1F5F9'
                            }}
                          >
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                                <div style={{
                                  width: '30px',
                                  height: '30px',
                                  borderRadius: '50%',
                                  background: isAvailable ? '#D1FAE5' : '#FEE2E2',
                                  color: isAvailable ? '#065F46' : '#991B1B',
                                  fontWeight: 800,
                                  fontSize: '11px',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  flexShrink: 0
                                }}>
                                  {doc.name ? doc.name.split(' ').map(p => p[0]).join('').substring(0, 2).toUpperCase() : 'DR'}
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                                  <span style={{ fontSize: '12.5px', fontWeight: 800, color: '#0F172A', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                    {doc.name}
                                  </span>
                                  <span style={{ fontSize: '10.5px', color: '#64748B', fontWeight: 600 }}>
                                    {doc.specialty || 'General Medicine'}
                                  </span>
                                </div>
                              </div>

                              <span style={{
                                fontSize: '10px',
                                fontWeight: 800,
                                padding: '2px 8px',
                                borderRadius: '12px',
                                background: isAvailable ? '#D1FAE5' : isOff ? '#FEF3C7' : '#FEE2E2',
                                color: isAvailable ? '#065F46' : isOff ? '#92400E' : '#991B1B',
                                border: `1px solid ${isAvailable ? '#A7F3D0' : isOff ? '#FDE68A' : '#FECACA'}`
                              }}>
                                {isAvailable ? 'Available' : isOff ? 'Weekoff' : 'On Leave'}
                              </span>
                            </div>

                            {/* Live Utilization Line */}
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '10.5px', color: '#64748B', fontWeight: 600 }}>
                              <span>Patients today: <strong style={{ color: '#0F172A' }}>{docPatientsCount}</strong></span>
                              <span>{utilizationPercent}% active</span>
                            </div>
                            <div style={{ height: '4px', background: '#E2E8F0', borderRadius: '4px', overflow: 'hidden' }}>
                              <div style={{ width: `${Math.max(5, utilizationPercent)}%`, height: '100%', background: isAvailable ? '#10B981' : '#94A3B8', borderRadius: '4px' }} />
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>

                {/* Panel 3: COLLECTION SNAPSHOT */}
                {(() => {
                  const paidBills = filteredBills.filter(b => b.status === 'Paid');
                  const totalPaid = paidBills.reduce((sum, b) => sum + (b.totalAmount || 0), 0);
                  const totalPending = filteredBills.filter(b => b.status !== 'Paid').reduce((sum, b) => sum + (b.totalAmount || 0), 0);
                  const totalGross = totalPaid + totalPending;
                  const collectionRate = totalGross > 0 ? Math.round((totalPaid / totalGross) * 100) : 100;

                  // Category Breakdown
                  const opdRev = filteredBills.reduce((sum, b) => {
                    const opdItems = (b.items || []).filter(i => !((i.description || '').toLowerCase().includes('lab') || (i.description || '').toLowerCase().includes('pharmacy') || (i.description || '').toLowerCase().includes('procedure')));
                    return sum + (b.status === 'Paid' ? opdItems.reduce((s, i) => s + (i.amount || i.total || i.price || 0), 0) : 0);
                  }, 0);

                  const labRev = filteredBills.reduce((sum, b) => {
                    const labItems = (b.items || []).filter(i => (i.description || '').toLowerCase().includes('lab'));
                    return sum + (b.status === 'Paid' ? labItems.reduce((s, i) => s + (i.amount || i.total || i.price || 0), 0) : 0);
                  }, 0);

                  const serviceRev = Math.max(0, totalPaid - (opdRev + labRev));

                  return (
                    <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '18px', padding: '22px 24px', boxShadow: '0 2px 10px rgba(15, 23, 42, 0.03)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <div style={{ width: '30px', height: '30px', borderRadius: '8px', background: '#FAF5FF', color: '#7C3AED', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <i data-lucide="receipt" style={{ width: '15px', height: '15px' }}></i>
                          </div>
                          <h3 style={{ fontSize: '15px', fontWeight: 850, color: '#0F172A', margin: 0 }}>Collection Snapshot</h3>
                        </div>
                        <span style={{ fontSize: '11px', fontWeight: 800, color: '#7C3AED', background: '#F5F3FF', padding: '2px 8px', borderRadius: '12px', border: '1px solid #DDD6FE' }}>
                          {collectionRate}% Settled
                        </span>
                      </div>

                      <div style={{ fontSize: '26px', fontWeight: 900, color: '#0F172A', letterSpacing: '-0.5px', marginBottom: '10px' }}>
                        ₹{totalPaid.toLocaleString()}
                      </div>

                      {/* Collection Progress Bar */}
                      <div style={{ height: '6px', background: '#F1F5F9', borderRadius: '6px', overflow: 'hidden', marginBottom: '8px' }}>
                        <div style={{ width: `${Math.max(5, collectionRate)}%`, height: '100%', background: 'linear-gradient(90deg, #7C3AED 0%, #2563EB 100%)', borderRadius: '6px' }} />
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#64748B', fontWeight: 600, marginBottom: '14px' }}>
                        <span>Collected: <strong style={{ color: '#059669' }}>₹{totalPaid.toLocaleString()}</strong></span>
                        <span>Pending: <strong style={{ color: '#DC2626' }}>₹{totalPending.toLocaleString()}</strong></span>
                      </div>

                      {/* Department Breakdown Mini Table */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', borderTop: '1px solid #F1F5F9', paddingTop: '10px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11.5px', color: '#475569', fontWeight: 600 }}>
                          <span>OPD Consultation</span>
                          <span style={{ fontWeight: 800, color: '#0F172A' }}>₹{opdRev > 0 ? opdRev.toLocaleString() : totalPaid.toLocaleString()}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11.5px', color: '#475569', fontWeight: 600 }}>
                          <span>Diagnostic Lab</span>
                          <span style={{ fontWeight: 800, color: '#0F172A' }}>₹{labRev.toLocaleString()}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11.5px', color: '#475569', fontWeight: 600 }}>
                          <span>Direct Services &amp; Misc</span>
                          <span style={{ fontWeight: 800, color: '#0F172A' }}>₹{serviceRev.toLocaleString()}</span>
                        </div>
                      </div>
                    </div>
                  );
                })()}

              </div>{/* END RIGHT COLUMN */}
            </div>


            {/* 4. RECENT RECEPTION ACTIVITY FEED */}
            {(() => {
              // Synthesize recent activities from actual live application events
              const activities = [];

              // Recent payments
              filteredBills.filter(b => b.status === 'Paid').slice(0, 3).forEach(b => {
                activities.push({
                  id: `bill-${b._id}`,
                  title: `Payment received from ${b.patientName || b.patientId?.name || 'Walk-in Patient'}`,
                  subtitle: `Amount: ₹${(b.totalAmount || 0).toLocaleString()} · Method: ${b.paymentMethod || 'Cash'}`,
                  time: b.createdAt || b.date,
                  icon: 'credit-card',
                  color: '#059669',
                  bg: '#ECFDF5',
                  border: '#A7F3D0'
                });
              });

              // Recent appointments
              filteredAppointments.slice(0, 3).forEach(a => {
                activities.push({
                  id: `appt-${a._id}`,
                  title: `Appointment booked for ${a.patientId?.name || 'Patient'}`,
                  subtitle: `With Dr. ${a.doctorId?.name || 'Specialist'} (${a.time || 'Today'})`,
                  time: a.createdAt || a.date,
                  icon: 'calendar-check',
                  color: '#2563EB',
                  bg: '#EFF6FF',
                  border: '#BFDBFE'
                });
              });

              // Recent patient registrations
              filteredPatientsList.slice(0, 2).forEach(p => {
                activities.push({
                  id: `pat-${p._id}`,
                  title: `New patient profile registered: ${p.name}`,
                  subtitle: `ID: ${getFormattedPatientId(p._id)} · Contact: ${p.contact || 'N/A'}`,
                  time: p.createdAt,
                  icon: 'user-plus',
                  color: '#7C3AED',
                  bg: '#FAF5FF',
                  border: '#DDD6FE'
                });
              });

              // Sort by date/time descending
              activities.sort((a, b) => new Date(b.time || 0) - new Date(a.time || 0));

              return (
                <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '18px', padding: '24px 26px', boxShadow: '0 2px 10px rgba(15, 23, 42, 0.03)', marginBottom: '30px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <div style={{ width: '34px', height: '34px', borderRadius: '10px', background: '#F8FAFC', color: '#0F172A', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid #E2E8F0' }}>
                        <i data-lucide="activity" style={{ width: '17px', height: '17px' }}></i>
                      </div>
                      <div>
                        <h3 style={{ fontSize: '15.5px', fontWeight: 850, color: '#0F172A', margin: 0 }}>Recent Activity</h3>
                        <span style={{ fontSize: '11.5px', color: '#64748B', fontWeight: 550 }}>Front-desk transaction &amp; operational audit stream</span>
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '14px' }}>
                    {activities.length === 0 ? (
                      <div style={{ textAlign: 'center', padding: '24px', color: '#64748B', fontSize: '12.5px', gridColumn: '1 / -1' }}>
                        No recent activity recorded yet today.
                      </div>
                    ) : (
                      activities.slice(0, 4).map((act, idx) => (
                        <div
                          key={act.id || idx}
                          style={{
                            display: 'flex',
                            alignItems: 'flex-start',
                            gap: '12px',
                            padding: '14px 16px',
                            borderRadius: '14px',
                            background: '#F8FAFC',
                            border: `1px solid #E2E8F0`,
                            transition: 'all 0.15s ease'
                          }}
                          onMouseEnter={e => { e.currentTarget.style.background = '#FFFFFF'; e.currentTarget.style.borderColor = act.color; e.currentTarget.style.boxShadow = '0 4px 14px rgba(15,23,42,0.06)'; }}
                          onMouseLeave={e => { e.currentTarget.style.background = '#F8FAFC'; e.currentTarget.style.borderColor = '#E2E8F0'; e.currentTarget.style.boxShadow = 'none'; }}
                        >
                          <div style={{
                            width: '34px',
                            height: '34px',
                            borderRadius: '10px',
                            background: act.bg,
                            color: act.color,
                            border: `1px solid ${act.border}`,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            flexShrink: 0
                          }}>
                            <i data-lucide={act.icon} style={{ width: '16px', height: '16px' }}></i>
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, flex: 1 }}>
                            <span style={{ fontSize: '12.5px', fontWeight: 800, color: '#0F172A', lineHeight: 1.3 }}>
                              {act.title}
                            </span>
                            <span style={{ fontSize: '11px', color: '#64748B', fontWeight: 550, marginTop: '2px' }}>
                              {act.subtitle}
                            </span>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              );
            })()}

            {/* 5. FLOATING ACTION DOCK */}
            <div style={{
              position: 'fixed',
              bottom: '20px',
              left: '50%',
              transform: isSidebarCollapsed ? 'translateX(-50%)' : 'translateX(calc(-50% + 130px))',
              zIndex: 1100,
              background: 'rgba(255, 255, 255, 0.92)',
              backdropFilter: 'blur(16px)',
              WebkitBackdropFilter: 'blur(16px)',
              border: '1px solid rgba(226, 232, 240, 0.9)',
              boxShadow: '0 16px 36px -8px rgba(15, 23, 42, 0.14), 0 2px 6px rgba(0, 0, 0, 0.04)',
              borderRadius: '40px',
              padding: '6px 14px',
              display: 'flex',
              gap: '6px',
              alignItems: 'center',
              transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
            }}>
              {[
                { id: 'help', title: 'Help & Guide', icon: 'help-circle', color: '#2563EB', bg: '#EFF6FF', action: () => window.open('https://curoxa.com/help', '_blank') },
                { id: 'dash', title: 'Dashboard', icon: 'layout-grid', color: '#7C3AED', bg: '#FAF5FF', action: () => switchTab('dash') },
                { id: 'patients', title: 'Patients', icon: 'users', color: '#059669', bg: '#ECFDF5', action: () => switchTab('patients') },
                { id: 'appt', title: 'Appointments', icon: 'calendar', color: '#0284C7', bg: '#F0F9FF', action: () => switchTab('appointments') },
                { id: 'billing', title: 'Finance & Billing', icon: 'wallet', color: '#EA580C', bg: '#FFF7ED', action: () => switchTab('billing') },
                { id: 'doctors', title: 'Doctor Roster', icon: 'stethoscope', color: '#10B981', bg: '#ECFDF5', action: () => switchTab('staff') },
                { id: 'filter', title: 'Date Filter', icon: 'filter', color: '#DB2777', bg: '#FDF2F8', action: () => setShowDashboardDateFilter(prev => !prev) },
                { id: 'refresh', title: 'Live Sync', icon: 'refresh-cw', color: '#6366F1', bg: '#EEF2FF', action: () => window.location.reload() }
              ].map(d => (
                <button
                  key={d.id}
                  onClick={d.action}
                  style={{
                    width: '36px',
                    height: '36px',
                    borderRadius: '50%',
                    border: 'none',
                    background: d.bg,
                    color: d.color,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    transition: 'all 0.18s cubic-bezier(0.4, 0, 0.2, 1)',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.04)'
                  }}
                  title={d.title}
                  onMouseEnter={e => {
                    e.currentTarget.style.transform = 'translateY(-3px) scale(1.1)';
                    e.currentTarget.style.boxShadow = `0 6px 16px ${d.color}35`;
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.transform = 'none';
                    e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.04)';
                  }}
                >
                  <i data-lucide={d.icon} style={{ width: '16px', height: '16px' }}></i>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* PATIENTS TAB */}
        {activeTab === 'patients' && (
          <div className="tab-content active" style={{ animation: 'slideUp 0.4s ease-out' }}>
            <div className="dashboard-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
              <div>
                <h2 style={{ fontSize: '24px', fontWeight: 800, color: '#1A1D23', marginBottom: '4px' }}>Patients</h2>
                <div style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 700 }}>Home <span style={{ margin: '0 8px' }}>»</span> <span style={{ color: '#1A1D23' }}>Patients</span></div>
              </div>
              <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                <button 
                  className="btn btn-primary" 
                  style={{ height: '26px', padding: '0 16px', fontWeight: 700, borderRadius: '2px', background: '#059669', color: 'white', border: 'none', display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '13px' }} 
                  onClick={() => {
                    resetRegistrationForm();
                    setBookingType('lab');
                    switchTab('registration-form');
                  }}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>
                  Book Lab Test
                </button>
                <button 
                  className="btn btn-primary" 
                  style={{ height: '26px', padding: '0 16px', fontWeight: 700, borderRadius: '2px', background: '#2563EB', color: '#FFFFFF', border: 'none', display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '13px' }} 
                  onClick={() => {
                    resetRegistrationForm();
                    setBookingType('opd');
                    switchTab('registration-form');
                  }}
                >
                  <i data-lucide="plus" style={{ width: '16px', strokeWidth: 3 }}></i> Create Appointment
                </button>
                <button 
                  className="btn btn-secondary" 
                  style={{ height: '26px', padding: '0 16px', fontWeight: 700, borderRadius: '2px', background: '#FEE2E2', color: '#EF4444', border: '1px solid #FCA5A5', display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '13px' }} 
                  onClick={handleDeleteAllPatients}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
                  Delete All (Test)
                </button>
                <button 
                  className="btn btn-secondary" 
                  style={{ width: '38px', height: '26px', padding: 0, borderRadius: '2px', background: '#EFF6FF', color: '#2563EB', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
                  onClick={() => switchTab('appointments')}
                  title="View Appointments"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#2563EB" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                    <line x1="16" y1="2" x2="16" y2="6" />
                    <line x1="8" y1="2" x2="8" y2="6" />
                    <line x1="3" y1="10" x2="21" y2="10" />
                  </svg>
                </button>
              </div>
            </div>
            
            <div className="glass-card" style={{ padding: '12px' }}>
              <div className="filter-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <div style={{ flex: 1, maxWidth: '400px', position: 'relative', display: 'flex', alignItems: 'center' }}>
                    <i data-lucide="search" style={{ position: 'absolute', left: '16px', color: '#64748B', width: '18px' }}></i>
                    <input 
                      type="text" 
                      className="search-input" 
                      placeholder="Search Patients..." 
                      value={patientSearchText}
                      onChange={e => setPatientSearchText(e.target.value)}
                      style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', paddingLeft: '44px', height: '26px', width: '100%', borderRadius: '4px', fontSize: '12px', fontWeight: 600 }} 
                    />
                </div>
                <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                    <button 
                      className="btn btn-secondary" 
                      style={{ padding: '0 16px', height: '26px', display: 'flex', alignItems: 'center', gap: '8px', background: showPatientFilters ? 'rgba(59, 130, 246, 0.15)' : '#EFF6FF', border: showPatientFilters ? '1px solid #93C5FD' : 'none', color: '#2563EB' }}
                      onClick={() => { setShowPatientFilters(!showPatientFilters); setTimeout(() => window.lucide && window.lucide.createIcons(), 100); }}
                    >
                      <i data-lucide="filter" style={{ width: '18px' }}></i> Filter
                    </button>
                    <button 
                      className="btn btn-secondary" 
                      style={{ padding: '0 16px', height: '26px', display: 'flex', alignItems: 'center', gap: '8px', background: '#EFF6FF', border: 'none', color: '#2563EB' }}
                      onClick={handleExportPatientsCSV}
                    >
                      <i data-lucide="download" style={{ width: '18px' }}></i> Export
                    </button>
                </div>
              </div>

              {/* Sliding Patient Filter Panel */}
              {showPatientFilters && (
                <div className="glass-card" style={{ padding: '12px', marginBottom: '12px', animation: 'slideDown 0.3s ease-out', border: '1.5px solid #BFDBFE', background: '#F8FAFC', borderRadius: '4px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                    <h4 style={{ fontSize: '12px', fontWeight: 800, color: '#1E293B', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <i data-lucide="filter" style={{ width: '18px', color: '#2563EB' }}></i> Select Patient Filters
                    </h4>
                    {(patientGenderFilter !== 'All' || patientStartRegDate || patientEndRegDate || patientBookingTypeFilter !== 'All') && (
                      <button 
                        className="btn" 
                        style={{ fontSize: '12px', padding: '4px 10px', background: 'transparent', color: '#EF4444', fontWeight: 700, border: 'none', cursor: 'pointer' }}
                        onClick={() => { 
                          setPatientGenderFilter('All'); 
                          setPatientStartRegDate(''); 
                          setPatientEndRegDate(''); 
                          setPatientBookingTypeFilter('All');
                        }}
                      >
                        Clear Filters
                      </button>
                    )}
                  </div>

                  <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
                    <div className="form-group" style={{ margin: 0, flex: 1, minWidth: '150px' }}>
                      <label style={{ fontSize: '11px', fontWeight: 800, color: '#64748B', marginBottom: '6px', display: 'block', textTransform: 'uppercase' }}>Gender</label>
                      <select 
                        className="form-control" 
                        style={{ height: '40px', borderRadius: '2px', border: '1px solid #CBD5E1', padding: '0 12px', background: 'white', fontWeight: 600, color: '#334155', width: '100%' }}
                        value={patientGenderFilter}
                        onChange={e => setPatientGenderFilter(e.target.value)}
                      >
                        <option value="All">All Genders</option>
                        <option value="Male">Male</option>
                        <option value="Female">Female</option>
                        <option value="Other">Other</option>
                      </select>
                    </div>

                    <div className="form-group" style={{ margin: 0, flex: 1, minWidth: '180px' }}>
                      <label style={{ fontSize: '11px', fontWeight: 800, color: '#64748B', marginBottom: '6px', display: 'block', textTransform: 'uppercase' }}>Booking Type</label>
                      <select 
                        className="form-control" 
                        style={{ height: '40px', borderRadius: '2px', border: '1px solid #CBD5E1', padding: '0 12px', background: 'white', fontWeight: 600, color: '#334155', width: '100%' }}
                        value={patientBookingTypeFilter}
                        onChange={e => setPatientBookingTypeFilter(e.target.value)}
                      >
                        <option value="All">All Patients (No filter)</option>
                        <option value="Appointments">Patients with Appointments</option>
                        <option value="Lab Tests">Patients with Lab Tests</option>
                        <option value="Clinical Services">Patients with Clinical Services</option>
                      </select>
                    </div>

                    <div className="form-group" style={{ margin: 0, flex: 1, minWidth: '180px' }}>
                      <label style={{ fontSize: '11px', fontWeight: 800, color: '#64748B', marginBottom: '6px', display: 'block', textTransform: 'uppercase' }}>Registered From (Calendar)</label>
                      <input 
                        type="date" 
                        className="form-control" 
                        style={{ height: '40px', borderRadius: '2px', border: '1px solid #CBD5E1', padding: '0 12px', background: 'white', fontWeight: 600, color: '#334155', width: '100%' }} 
                        value={patientStartRegDate} 
                        onChange={e => setPatientStartRegDate(e.target.value)} 
                      />
                    </div>

                    <div className="form-group" style={{ margin: 0, flex: 1, minWidth: '180px' }}>
                      <label style={{ fontSize: '11px', fontWeight: 800, color: '#64748B', marginBottom: '6px', display: 'block', textTransform: 'uppercase' }}>Registered To (Calendar)</label>
                      <input 
                        type="date" 
                        className="form-control" 
                        style={{ height: '40px', borderRadius: '2px', border: '1px solid #CBD5E1', padding: '0 12px', background: 'white', fontWeight: 600, color: '#334155', width: '100%' }} 
                        value={patientEndRegDate} 
                        onChange={e => setPatientEndRegDate(e.target.value)} 
                      />
                    </div>
                  </div>
                </div>
              )}
               <div className="table-responsive">
                 <table className="elite-table" style={{ margin: 0, borderCollapse: 'collapse', borderSpacing: 0 }}>
                  <thead style={{ background: '#F8FAFC' }}>
                      <tr>
                          <th style={{ width: '40px' }}>
                            <input 
                              type="checkbox" 
                              checked={getFilteredPatientsList().length > 0 && selectedPatientIds.length === getFilteredPatientsList().length}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setSelectedPatientIds(getFilteredPatientsList().map(p => p._id));
                                } else {
                                  setSelectedPatientIds([]);
                                }
                              }}
                              title="Select All Patients"
                            />
                          </th>
                          <th>Patient ID</th>
                          <th>Name</th>
                          <th>Gender</th>
                          <th>Mobile Number</th>
                          <th>Email</th>
                          <th style={{ width: '40px' }}></th>
                      </tr>
                  </thead>
                  <tbody>
                    {getFilteredPatientsList().length === 0 ? (
                      <tr>
                        <td colSpan="7" style={{ textAlign: 'center', padding: '32px', color: '#64748B', fontSize: '14.5px', fontWeight: 600 }}>
                          No patients found matching the criteria.
                        </td>
                      </tr>
                    ) : (
                      getFilteredPatientsList().map(p => (
                        <tr key={p._id} className="patients-table" style={{ borderBottom: '1px solid #F1F5F9', background: selectedPatientIds.includes(p._id) ? '#EFF6FF' : 'transparent' }}>
                            <td onClick={e => e.stopPropagation()}>
                              <input 
                                type="checkbox" 
                                checked={selectedPatientIds.includes(p._id)}
                                onChange={(e) => {
                                  e.stopPropagation();
                                  if (e.target.checked) {
                                    setSelectedPatientIds(prev => [...prev, p._id]);
                                  } else {
                                    setSelectedPatientIds(prev => prev.filter(id => id !== p._id));
                                  }
                                }}
                              />
                            </td>
                            <td style={{ color: '#64748B', fontWeight: 600 }}>{getFormattedPatientId(p._id)}</td>
                            <td>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer' }} onClick={() => handleOpenPatientProfile(p)}>
                                    <span style={{ fontWeight: 700, color: '#1A1D23' }}>{p.name} {p.age ? `(${p.age} Yrs)` : ''}</span>
                                </div>
                            </td>
                            <td style={{ color: '#64748B', fontWeight: 600 }}>{p.gender}</td>
                            <td style={{ color: '#64748B', fontWeight: 600 }}>{p.contact}</td>
                            <td style={{ color: '#64748B', fontWeight: 600 }}>{p.email || 'N/A'}</td>
                            <td>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  const pIdStr = String(p._id);
                                  if (activePatientMenuId && String(activePatientMenuId) === pIdStr) {
                                    setActivePatientMenuId(null);
                                  } else {
                                    const btnRect = e.currentTarget.getBoundingClientRect();
                                    setPatientMenuPos({
                                      top: btnRect.bottom + 4,
                                      right: Math.max(10, window.innerWidth - btnRect.right)
                                    });
                                    setActivePatientMenuId(p._id);
                                  }
                                }}
                                style={{ background: (activePatientMenuId && String(activePatientMenuId) === String(p._id)) ? '#EFF6FF' : 'transparent', border: 'none', cursor: 'pointer', padding: '6px', borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                              >
                                <i data-lucide="more-vertical" style={{ width: '18px', color: (activePatientMenuId && String(activePatientMenuId) === String(p._id)) ? '#2563EB' : '#64748B' }}></i>
                              </button>
                            </td>
                        </tr>
                      ))
                    )}
                  </tbody>
              </table>
            </div>

            {/* Floating Bulk Action Bar */}
            {selectedPatientIds.length > 0 && (
              <div style={{ background: '#0F172A', color: 'white', padding: '14px 22px', borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '16px', boxShadow: '0 12px 28px rgba(15, 23, 42, 0.3)', border: '1px solid #334155', animation: 'slideUp 0.25s cubic-bezier(0.16, 1, 0.3, 1)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <span style={{ background: '#2563EB', color: 'white', padding: '4px 12px', borderRadius: '6px', fontSize: '12.5px', fontWeight: 800 }}>{selectedPatientIds.length} Selected</span>
                  <span style={{ fontSize: '12px', fontWeight: 700, color: '#E2E8F0' }}>Bulk Batch Actions</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <button 
                    type="button" 
                    onClick={() => setShowBatchSmsModal(true)}
                    style={{ padding: '8px 16px', background: '#334155', color: 'white', border: '1px solid #475569', borderRadius: '2px', fontSize: '12.5px', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', transition: 'all 0.15s' }}
                    onMouseEnter={e => e.currentTarget.style.background = '#475569'}
                    onMouseLeave={e => e.currentTarget.style.background = '#334155'}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                    Send Batch SMS / Alert
                  </button>
                  <button 
                    type="button" 
                    onClick={() => {
                      const selectedPatients = patientsList.filter(p => selectedPatientIds.includes(p._id));
                      const csvHeader = "ID,Name,Gender,Contact,Email\n";
                      const csvRows = selectedPatients.map(p => `"${getFormattedPatientId(p._id)}","${p.name}","${p.gender}","${p.contact}","${p.email || ''}"`).join("\n");
                      const blob = new Blob([csvHeader + csvRows], { type: 'text/csv' });
                      const url = window.URL.createObjectURL(blob);
                      const a = document.createElement('a');
                      a.href = url;
                      a.download = `patient_batch_export_${new Date().toISOString().slice(0,10)}.csv`;
                      a.click();
                      window.URL.revokeObjectURL(url);
                      setBatchSmsSuccessToast(`Exported ${selectedPatientIds.length} patient record(s) to CSV!`);
                      setTimeout(() => setBatchSmsSuccessToast(''), 4000);
                    }}
                    style={{ padding: '8px 16px', background: '#059669', color: 'white', border: 'none', borderRadius: '2px', fontSize: '12.5px', fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', boxShadow: '0 4px 12px rgba(5,150,105,0.25)', transition: 'all 0.15s' }}
                    onMouseEnter={e => e.currentTarget.style.background = '#047857'}
                    onMouseLeave={e => e.currentTarget.style.background = '#059669'}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                    Export Selected CSV
                  </button>
                  <button 
                    type="button" 
                    onClick={() => setSelectedPatientIds([])}
                    style={{ padding: '8px 14px', background: 'transparent', color: '#94A3B8', border: '1px solid #475569', borderRadius: '2px', fontSize: '12.5px', fontWeight: 700, cursor: 'pointer' }}
                  >
                    Clear Selection
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
        )}

        {/* PATIENT DETAILS TAB */}
        {activeTab === 'patient-details' && selectedPatient && (
          <div className="tab-content active" style={{ animation: 'slideUp 0.4s ease-out' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <button 
                  onClick={() => switchTab('patients')}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: '40px',
                    height: '40px',
                    borderRadius: '2px',
                    border: '1.5px solid #E2E8F0',
                    background: 'white',
                    cursor: 'pointer',
                    color: '#64748B',
                    transition: 'all 0.2s',
                    boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.color = '#2563EB'; e.currentTarget.style.borderColor = '#BFDBFE'; e.currentTarget.style.background = '#EFF6FF'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.color = '#64748B'; e.currentTarget.style.borderColor = '#E2E8F0'; e.currentTarget.style.background = 'white'; }}
                  title="Back to Patient List"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="19" y1="12" x2="5" y2="12" />
                    <polyline points="12 19 5 12 12 5" />
                  </svg>
                </button>
                <div>
                  <h1 style={{ fontSize: '24px', fontWeight: 900, color: '#1A1D23', marginBottom: '4px' }}>Patient Profile</h1>
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 700 }}>
                    Patient Management <span style={{ margin: '0 8px' }}>»</span> <span style={{ color: '#1A1D23' }}>Profile</span>
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                <button className="btn btn-primary" style={{ height: '26px', padding: '0 20px', fontWeight: 850, borderRadius: '2px', background: '#2563EB', color: 'white', border: 'none', display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '13px' }} onClick={handleCreateAppointmentForProfilePatient}>
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="12" y1="5" x2="12" y2="19" />
                    <line x1="5" y1="12" x2="19" y2="12" />
                  </svg>
                  Create Appointment
                </button>
                <button 
                  className="btn btn-secondary" 
                  style={{ width: '44px', height: '26px', padding: 0, borderRadius: '2px', background: '#EFF6FF', color: '#2563EB', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
                  onClick={() => switchTab('appointments')}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#2563EB" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                    <line x1="16" y1="2" x2="16" y2="6" />
                    <line x1="8" y1="2" x2="8" y2="6" />
                    <line x1="3" y1="10" x2="21" y2="10" />
                  </svg>
                </button>
              </div>
            </div>

            <div className="mobile-stack" style={{ display: 'grid', gridTemplateColumns: '1fr 380px', gap: '32px', alignItems: 'start' }}>
              
              {/* Left Column */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                
                {/* Patient Header Card */}
                <div className="glass-card" style={{ padding: '12px', background: 'white', border: '1px solid #E2E8F0', borderRadius: '16px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div style={{ display: 'flex', gap: '20px', alignItems: 'center' }}>
                      <div style={{ width: '80px', height: '80px', borderRadius: '4px', background: '#F1F5F9', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, overflow: 'hidden' }}>
                        {selectedPatient.avatar ? (
                          <img src={selectedPatient.avatar} alt="Patient Avatar" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        ) : (
                          <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#94A3B8" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
                            <circle cx="12" cy="7" r="4" />
                          </svg>
                        )}
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
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                      <button 
                        className="btn" 
                        style={{ background: '#ECFDF5', border: '1px solid #A7F3D0', borderRadius: '2px', cursor: 'pointer', color: '#059669', padding: '8px 12px', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12.5px', fontWeight: 800 }}
                        onClick={() => handleRePrintPatientSlip(selectedPatient)}
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="6 9 6 2 18 2 18 9"/>
                          <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/>
                          <rect x="6" y="14" width="12" height="8"/>
                        </svg>
                        Re-Print Slip
                      </button>

                      <button 
                        className="btn" 
                        style={{ background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: '2px', cursor: 'pointer', color: '#2563EB', padding: '8px 12px', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12.5px', fontWeight: 800 }}
                        onClick={handleViewAllLabReports}
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                          <polyline points="14 2 14 8 20 8"/>
                          <line x1="16" y1="13" x2="8" y2="13"/>
                          <line x1="16" y1="17" x2="8" y2="17"/>
                          <polyline points="10 9 9 9 8 9"/>
                        </svg>
                        Lab Reports
                      </button>

                      <button 
                        className="btn" 
                        style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '2px', cursor: 'pointer', color: '#2563EB', padding: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                        title="Edit Patient Info"
                        onClick={() => {
                          setFormData({
                            name: selectedPatient.name,
                            age: selectedPatient.age,
                            gender: selectedPatient.gender,
                            contact: selectedPatient.contact,
                            email: selectedPatient.email || '',
                            bloodGroup: selectedPatient.bloodGroup || 'O+',
                            address: selectedPatient.address || '',
                            medicalHistory: selectedPatient.medicalHistory ? selectedPatient.medicalHistory.join(', ') : '',
                            doctorId: ''
                          });
                          setIsExistingPatient(true);
                          switchTab('registration-form', true);
                        }}
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M12 20h9" />
                          <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
                        </svg>
                      </button>
                    </div>
                  </div>

                  <div style={{ height: '1px', background: '#F1F5F9', margin: '20px 0' }}></div>

                  <div style={{ display: 'grid', gridTemplateColumns: '0.6fr 0.6fr 1.2fr 0.8fr 2fr', gap: '8px' }}>
                    <div>
                      <div style={{ color: '#94A3B8', fontSize: '11px', fontWeight: 800, letterSpacing: '0.5px', marginBottom: '6px', textTransform: 'uppercase' }}>Age</div>
                      <div style={{ color: '#1A1D23', fontSize: '12px', fontWeight: 700 }}>{selectedPatient.age} Yrs</div>
                    </div>
                    <div>
                      <div style={{ color: '#94A3B8', fontSize: '11px', fontWeight: 800, letterSpacing: '0.5px', marginBottom: '6px', textTransform: 'uppercase' }}>Gender</div>
                      <div style={{ color: '#1A1D23', fontSize: '12px', fontWeight: 700 }}>{selectedPatient.gender}</div>
                    </div>
                    <div>
                      <div style={{ color: '#94A3B8', fontSize: '11px', fontWeight: 800, letterSpacing: '0.5px', marginBottom: '6px', textTransform: 'uppercase' }}>Contact</div>
                      <div style={{ color: '#1A1D23', fontSize: '12px', fontWeight: 700 }}>
                        {selectedPatient.contact}
                      </div>
                    </div>
                    <div>
                      <div style={{ color: '#94A3B8', fontSize: '11px', fontWeight: 800, letterSpacing: '0.5px', marginBottom: '6px', textTransform: 'uppercase' }}>Blood Group</div>
                      <div style={{ color: '#1A1D23', fontSize: '12px', fontWeight: 700 }}>{selectedPatient.bloodGroup || 'B+'}</div>
                    </div>
                    <div>
                      <div style={{ color: '#94A3B8', fontSize: '11px', fontWeight: 800, letterSpacing: '0.5px', marginBottom: '6px', textTransform: 'uppercase' }}>Email</div>
                      <div style={{ color: '#1A1D23', fontSize: '12px', fontWeight: 700, wordBreak: 'break-all' }}>{selectedPatient.email || 'N/A'}</div>
                    </div>
                  </div>
                </div>

                {/* Sub cards: Contact Info and Vitals */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.2fr', gap: '12px' }}>
                  
                  {/* Contact Information */}
                  <div className="glass-card" style={{ padding: '12px', background: 'white', border: '1px solid #E2E8F0', borderRadius: '16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '20px' }}>
                      <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#2563EB" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
                      </svg>
                      <h3 style={{ fontSize: '14px', fontWeight: 900, color: '#2563EB', margin: 0 }}>Contact Information</h3>
                    </div>
                    
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
                        <span style={{ color: '#64748B', fontWeight: 600 }}>Email:</span>
                        <span style={{ fontWeight: 700, color: '#1A1D23' }}>{selectedPatient.email || 'N/A'}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
                        <span style={{ color: '#64748B', fontWeight: 600 }}>Primary Phone:</span>
                        <span style={{ fontWeight: 700, color: '#1A1D23' }}>{selectedPatient.contact}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
                        <span style={{ color: '#64748B', fontWeight: 600 }}>Alternate Phone:</span>
                        <span style={{ fontWeight: 700, color: '#1A1D23' }}>{selectedPatient.alternateContact || 'N/A'}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
                        <span style={{ color: '#64748B', fontWeight: 600 }}>Address:</span>
                        <span style={{ fontWeight: 700, color: '#1A1D23', textAlign: 'right', maxWidth: '180px' }}>{selectedPatient.address || 'N/A'}</span>
                      </div>
                    </div>
                  </div>



                  {/* Vitals Summary */}
                  {(() => {
                    const latestVital = patientVitals && patientVitals.length > 0 ? patientVitals[0] : null;
                    return (
                      <div className="glass-card" style={{ padding: '12px', background: 'white', border: '1px solid #E2E8F0', borderRadius: '16px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#2563EB" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
                            </svg>
                            <h3 style={{ fontSize: '14px', fontWeight: 900, color: '#2563EB', margin: 0 }}>Vitals Summary</h3>
                          </div>
                          <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                            <span 
                              style={{ fontSize: '11px', color: '#2563EB', fontWeight: 800, cursor: 'pointer', textDecoration: 'underline', display: 'flex', alignItems: 'center', gap: '4px' }}
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
                            <span style={{ fontSize: '11px', color: '#64748B', fontWeight: 800, cursor: 'pointer', textDecoration: 'underline' }}>View Full History</span>
                          </div>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' }}>
                          {/* BP */}
                          <div style={{ background: '#F0FDF4', borderRadius: '4px', padding: '12px 10px', display: 'flex', alignItems: 'center', gap: '10px', border: '1px solid #DCFCE7' }}>
                            <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: '#DCFCE7', color: '#16A34A', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                <circle cx="12" cy="12" r="10"/>
                                <path d="m16 12-4-4-4 4"/>
                                <path d="M12 16V8"/>
                              </svg>
                            </div>
                            <div>
                              <div style={{ fontSize: '9px', color: '#16A34A', fontWeight: 800, textTransform: 'uppercase' }}>Blood Pressure</div>
                              <div style={{ fontSize: '12.5px', fontWeight: 800, color: '#1A1D23', marginTop: '2px' }}>
                                {latestVital && latestVital.bpSys ? `${latestVital.bpSys}/${latestVital.bpDia || ''}` : '--'} <span style={{ fontSize: '9px', color: '#64748B', fontWeight: 500 }}>mmHg</span>
                              </div>
                            </div>
                          </div>

                          {/* Heart Rate */}
                          <div style={{ background: '#FFF5F5', borderRadius: '4px', padding: '12px 10px', display: 'flex', alignItems: 'center', gap: '10px', border: '1px solid #FEE2E2' }}>
                            <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: '#FEE2E2', color: '#EF4444', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" />
                              </svg>
                            </div>
                            <div>
                              <div style={{ fontSize: '9px', color: '#EF4444', fontWeight: 800, textTransform: 'uppercase' }}>Heart Rate</div>
                              <div style={{ fontSize: '12.5px', fontWeight: 800, color: '#1A1D23', marginTop: '2px' }}>
                                {latestVital && latestVital.pulse ? latestVital.pulse : '--'} <span style={{ fontSize: '9px', color: '#64748B', fontWeight: 500 }}>bpm</span>
                              </div>
                            </div>
                          </div>

                          {/* Temp */}
                          <div style={{ background: '#FFFBEB', borderRadius: '4px', padding: '12px 10px', display: 'flex', alignItems: 'center', gap: '10px', border: '1px solid #FEF3C7' }}>
                            <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: '#FEF3C7', color: '#D97706', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M14 14.76V3.5a2.5 2.5 0 0 0-5 0v11.26a4.5 4.5 0 1 0 5 0z" />
                              </svg>
                            </div>
                            <div>
                              <div style={{ fontSize: '9px', color: '#D97706', fontWeight: 800, textTransform: 'uppercase' }}>Temperature</div>
                              <div style={{ fontSize: '12.5px', fontWeight: 800, color: '#1A1D23', marginTop: '2px' }}>
                                {latestVital && latestVital.temperature ? latestVital.temperature : '--'} <span style={{ fontSize: '9px', color: '#64748B', fontWeight: 500 }}>°F</span>
                              </div>
                            </div>
                          </div>
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid #F1F5F9', paddingTop: '12px', marginTop: '16px', fontSize: '11px', color: '#94A3B8', fontWeight: 700 }}>
                          <span>Last updated: {latestVital && latestVital.createdAt ? new Date(latestVital.createdAt).toLocaleDateString() : '--'}</span>
                          <span>By: {latestVital && latestVital.recordedBy?.name ? latestVital.recordedBy.name : '--'}</span>
                        </div>
                      </div>
                    );
                  })()}
                </div>

                {/* Appointment History Table */}
                <div className="glass-card" style={{ padding: '12px', background: 'white', border: '1px solid #E2E8F0', borderRadius: '16px' }}>
                  <h3 style={{ fontSize: '14px', fontWeight: 900, color: '#0F172A', margin: '0 0 20px 0' }}>Appointments</h3>
                  
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                      <thead>
                        <tr style={{ borderBottom: '2px solid #F1F5F9' }}>
                          <th style={{ padding: '12px', fontSize: '12px', color: '#64748B', fontWeight: 800, textTransform: 'uppercase' }}>Date & Time</th>
                          <th style={{ padding: '12px', fontSize: '12px', color: '#64748B', fontWeight: 800, textTransform: 'uppercase' }}>Doctor / Department</th>
                          <th style={{ padding: '12px', fontSize: '12px', color: '#64748B', fontWeight: 800, textTransform: 'uppercase' }}>Consultation Type</th>
                          <th style={{ padding: '12px', fontSize: '12px', color: '#64748B', fontWeight: 800, textTransform: 'uppercase' }}>Status</th>
                          <th style={{ padding: '12px', fontSize: '12px', color: '#64748B', fontWeight: 800, textTransform: 'uppercase' }}>Payment</th>
                        </tr>
                      </thead>
                      <tbody>
                        {appointments.filter(app => {
                          const pId = app.patientId?._id || app.patientId;
                          return pId && pId.toString() === selectedPatient._id.toString();
                        }).length === 0 ? (
                          <tr>
                            <td colSpan="5" style={{ padding: '30px 0', textTransform: 'uppercase', textAlign: 'center', fontSize: '13px', color: '#94A3B8', fontWeight: 700 }}>
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
                                className="patient-app-row"
                              >
                                {/* Date & Time */}
                                <td style={{ padding: '16px 12px' }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                    <div style={{ width: '28px', height: '28px', borderRadius: '6px', background: '#EFF6FF', color: '#2563EB', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                        <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                                        <line x1="16" y1="2" x2="16" y2="6" />
                                        <line x1="8" y1="2" x2="8" y2="6" />
                                        <line x1="3" y1="10" x2="21" y2="10" />
                                      </svg>
                                    </div>
                                    <div>
                                      <div style={{ fontSize: '12px', fontWeight: 800, color: '#0F172A' }}>{getFormattedTableDate(app.date)}</div>
                                      <div style={{ fontSize: '11px', color: '#64748B', fontWeight: 600, marginTop: '2px' }}>{app.time}</div>
                                    </div>
                                  </div>
                                </td>
                                
                                {/* Doctor / Department */}
                                <td style={{ padding: '16px 12px' }}>
                                  <div style={{ fontSize: '12px', fontWeight: 800, color: '#0F172A' }}>{app.doctorId?.name || 'Dr. Ankit Sharma'}</div>
                                  <div style={{ fontSize: '11px', color: '#64748B', fontWeight: 600, marginTop: '2px' }}>{app.doctorId?.role || 'General Medicine'}</div>
                                </td>

                                {/* Consultation Type */}
                                <td style={{ padding: '16px 12px' }}>
                                  <span style={{ background: '#EFF6FF', color: '#3B82F6', fontSize: '11px', padding: '4px 10px', borderRadius: '6px', fontWeight: 800 }}>
                                    First Visit
                                  </span>
                                </td>

                                {/* Status & Approval Action */}
                                <td style={{ padding: '16px 12px' }}>
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', alignItems: 'flex-start' }}>
                                    <span style={{ 
                                      background: app.status === 'Completed' ? '#ECFDF5' : (app.status === 'Cancelled' ? '#FEF2F2' : (app.status === 'Pending Approval' || app.status === 'Pending' ? '#FFF7ED' : '#FAF5FF')), 
                                      color: app.status === 'Completed' ? '#10B981' : (app.status === 'Cancelled' ? '#EF4444' : (app.status === 'Pending Approval' || app.status === 'Pending' ? '#EA580C' : '#7E22CE')), 
                                      fontSize: '11px', padding: '4px 10px', borderRadius: '6px', fontWeight: 800 
                                    }}>{app.status}</span>

                                    {(app.status === 'Pending' || app.status === 'Pending Approval') && (
                                      <button
                                        type="button"
                                        className="btn btn-success"
                                        style={{ padding: '4px 10px', fontSize: '10.5px', background: '#10B981', color: 'white', border: 'none', borderRadius: '4px', fontWeight: 800, cursor: 'pointer' }}
                                        onClick={async (e) => {
                                          e.stopPropagation();
                                          try {
                                            await api.put('/appointments/' + app._id + '/approve');
                                            showToast('Appointment Approved! Payment request generated.', 'success');
                                            fetchData();
                                          } catch(err) {
                                            showToast(err.response?.data?.error || 'Failed to approve', 'error');
                                          }
                                        }}
                                      >
                                        ✓ Approve
                                      </button>
                                    )}
                                  </div>
                                </td>

                                {/* Payment */}
                                <td style={{ padding: '16px 12px' }}>
                                  {(() => {
                                    const associatedBill = bills.find(b => {
                                      const appBId = b.appointmentId?._id || b.appointmentId;
                                      return appBId && appBId.toString() === app._id.toString();
                                    });
                                    const feeVal = associatedBill ? associatedBill.totalAmount : (app.doctorId?.consultationFee || 500);
                                    const payStatus = associatedBill?.status || 'Unpaid';
                                    return (
                                      <div>
                                        <div style={{ fontSize: '12px', fontWeight: 800, color: '#1E293B' }}>₹{Number(feeVal).toFixed(2)}</div>
                                        <div style={{ 
                                          fontSize: '10px', 
                                          color: payStatus === 'Paid' ? '#16A34A' : '#DC2626', 
                                          fontWeight: 800, 
                                          marginTop: '2px' 
                                        }}>{payStatus.toUpperCase()}</div>
                                      </div>
                                    );
                                  })()}
                                </td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Dynamic Patient Journey Timeline */}
                <div className="glass-card" style={{ padding: '12px', background: 'white', border: '1px solid #E2E8F0', borderRadius: '16px', marginTop: '24px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#2563EB" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="10"/>
                        <polyline points="12 6 12 12 16 14"/>
                      </svg>
                      <h3 style={{ fontSize: '14px', fontWeight: 900, color: '#0F172A', margin: 0 }}>Dynamic Patient Journey</h3>
                    </div>
                    <span style={{ fontSize: '12px', background: '#EFF6FF', color: '#2563EB', padding: '4px 10px', borderRadius: '20px', fontWeight: 800 }}>
                      Live Track
                    </span>
                  </div>

                  <div style={{ position: 'relative', paddingLeft: '32px', borderLeft: '2px solid #E2E8F0', marginLeft: '12px', marginTop: '20px' }}>
                    {(() => {
                      const journeyEvents = [];

                      // 1. Patient Registration
                      if (selectedPatient.createdAt) {
                        journeyEvents.push({
                          id: 'reg-' + selectedPatient._id,
                          date: new Date(selectedPatient.createdAt),
                          type: 'Registration',
                          title: 'Patient Profile Registered',
                          description: `Registered at portal under contact: ${selectedPatient.contact}. Initial profile created successfully.`,
                          icon: 'user-plus',
                          color: '#2563EB'
                        });
                      }

                      // 2. Appointments
                      appointments.filter(app => {
                        const pId = app.patientId?._id || app.patientId;
                        return pId && pId.toString() === selectedPatient._id.toString();
                      }).forEach(app => {
                        journeyEvents.push({
                          id: 'appt-' + app._id,
                          date: new Date(app.date),
                          type: 'Appointment',
                          title: `OPD Appointment with ${app.doctorId?.name || 'Specialist'}`,
                          description: `Scheduled slot: ${app.time} | Status: ${app.status} | Doctor: ${app.doctorId?.name} (${app.doctorId?.role || 'OPD'})`,
                          icon: 'calendar',
                          color: '#8B5CF6'
                        });
                      });

                      // 3. SOAP Notes
                      patientClinicalNotes.forEach(n => {
                        journeyEvents.push({
                          id: 'soap-' + n._id,
                          date: new Date(n.createdAt),
                          type: 'Doctor Consultation',
                          title: `SOAP Note by ${n.doctorId?.name || 'Consultant'}`,
                          description: `Subjective: ${n.subjective || 'N/A'} | Assessment: ${n.assessment?.join(', ') || 'N/A'} | Plan: ${n.plan || 'N/A'}`,
                          icon: 'file-text',
                          color: '#10B981'
                        });
                      });

                      // 4. Prescriptions
                      patientPrescriptions.forEach(p => {
                        journeyEvents.push({
                          id: 'rx-' + p._id,
                          date: new Date(p.createdAt),
                          type: 'Prescription',
                          title: `Prescription issued by ${p.doctorId?.name || 'Doctor'}`,
                          description: `Medicines: ${p.medicines?.map(m => `${m.name} (${m.dosage})`).join(', ') || 'None'}`,
                          icon: 'pill',
                          color: '#EC4899'
                        });
                      });

                      // 5. Vitals
                      patientVitals.forEach(v => {
                        journeyEvents.push({
                          id: 'vital-' + v._id,
                          date: new Date(v.createdAt),
                          type: 'Vitals Recorded',
                          title: 'EMR Patient Vitals',
                          description: `BP: ${v.bpSys}/${v.bpDia} mmHg | Pulse: ${v.pulse} bpm | Temp: ${v.temperature} °F | SpO2: ${v.spo2}%`,
                          icon: 'activity',
                          color: '#EF4444'
                        });
                      });

                      // 6. Lab Tests
                      patientLabTests.forEach(l => {
                        journeyEvents.push({
                          id: 'lab-' + (l._id || l.id),
                          date: new Date(l.createdAt || Date.now()),
                          type: 'Lab Investigation',
                          title: `Lab Test: ${l.testName || l.test || 'Diagnostic Request'}`,
                          description: `Status: ${l.status} | Results/Findings: ${l.results || 'Pending report publication'}`,
                          icon: 'flask-conical',
                          color: '#F59E0B'
                        });
                      });

                      // 7. Bills
                      bills.filter(b => {
                        const pId = b.patientId?._id || b.patientId;
                        return pId && pId.toString() === selectedPatient._id.toString();
                      }).forEach(b => {
                        journeyEvents.push({
                          id: 'bill-' + b._id,
                          date: new Date(b.createdAt || Date.now()),
                          type: 'Payment',
                          title: `Invoice Settle - ₹${b.totalAmount?.toFixed(2)}`,
                          description: `Payment Method: ${b.paymentMethod || 'Cash'} | Status: ${b.status} | Items: ${b.items?.map(i => i.description).join(', ')}`,
                          icon: 'wallet',
                          color: '#06B6D4'
                        });
                      });

                      // Sort events: newest first
                      journeyEvents.sort((a, b) => b.date - a.date);

                      if (journeyEvents.length === 0) {
                        return (
                          <div style={{ padding: '10px', textAlign: 'center', color: '#64748B' }}>
                            No journey records found for this patient.
                          </div>
                        );
                      }

                      return journeyEvents.map((evt, idx) => (
                        <div 
                          key={evt.id || idx} 
                          style={{ 
                            position: 'relative', 
                            marginBottom: '20px', 
                            background: '#F8FAFC', 
                            border: '1px solid #E2E8F0', 
                            borderRadius: '4px', 
                            padding: '16px',
                            borderLeft: `4px solid ${evt.color}`
                          }}
                        >
                          {/* Timeline icon dot */}
                          <div 
                            style={{ 
                              position: 'absolute', 
                              left: '-45px', 
                              top: '16px', 
                              width: '24px', 
                              height: '24px', 
                              borderRadius: '50%', 
                              background: evt.color, 
                              color: 'white', 
                              display: 'flex', 
                              alignItems: 'center', 
                              justifyContent: 'center', 
                              border: '4px solid white',
                              boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
                            }}
                          >
                            <i data-lucide={evt.icon} style={{ width: '11px', height: '11px' }}></i>
                          </div>

                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '8px', marginBottom: '8px' }}>
                            <div>
                              <span style={{ fontSize: '10px', fontWeight: 800, textTransform: 'uppercase', color: evt.color, background: evt.color + '15', padding: '3px 8px', borderRadius: '6px', display: 'inline-block', marginBottom: '4px' }}>
                                {evt.type}
                              </span>
                              <h4 style={{ fontSize: '14.5px', fontWeight: 800, color: '#1E293B', margin: 0 }}>
                                {evt.title}
                              </h4>
                            </div>
                            <span style={{ fontSize: '11px', color: '#64748B', fontWeight: 600 }}>
                              {evt.date.toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                            </span>
                          </div>
                          <p style={{ fontSize: '12.5px', color: '#475569', margin: 0, fontWeight: 550, lineHeight: '1.4' }}>
                            {evt.description}
                          </p>
                        </div>
                      ));
                    })()}
                  </div>
                </div>

              </div>

              {/* Right Column - Appointment Summary */}
              <div style={{ position: 'sticky', top: '24px' }}>
                <div className="glass-card" style={{ padding: '12px', background: 'white', border: '1px solid #E2E8F0', borderRadius: '16px' }}>
                  <h3 style={{ fontSize: '14px', fontWeight: 900, color: '#0F172A', margin: 0 }}>Appointment Summary</h3>
                  
                  {selectedProfileAppointment ? (
                    <>
                      <div style={{ fontSize: '12px', color: '#64748B', fontWeight: 700, marginTop: '6px' }}>
                        Status: <span style={{ 
                          color: selectedProfileAppointment.status === 'Completed' ? '#3B82F6' : (selectedProfileAppointment.status === 'Cancelled' ? '#EF4444' : '#7E22CE'),
                          fontWeight: 800
                        }}>{selectedProfileAppointment.status}</span>
                      </div>

                      <div style={{ height: '1px', background: '#F1F5F9', margin: '18px 0' }}></div>

                      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                        {/* Date & Time */}
                        <div style={{ display: 'flex', gap: '14px', alignItems: 'flex-start', width: '100%' }}>
                          <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: '#EFF6FF', color: '#2563EB', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                              <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                              <line x1="16" y1="2" x2="16" y2="6" />
                              <line x1="8" y1="2" x2="8" y2="6" />
                              <line x1="3" y1="10" x2="21" y2="10" />
                            </svg>
                          </div>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: '11px', color: '#94A3B8', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Date & Time</div>
                            {isReschedulingProfileAppt ? (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '6px', width: '100%' }}>
                                <input 
                                  type="date" 
                                  className="form-control" 
                                  style={{ background: 'white', border: '1px solid #CBD5E1', borderRadius: '2px', height: '26px', width: '100%', padding: '0 10px', fontSize: '13px', fontWeight: 600 }}
                                  value={rescheduleProfileDate}
                                  min={getLocalDateString()}
                                  onChange={(e) => setRescheduleProfileDate(e.target.value)} 
                                />
                                <input 
                                  type="time" 
                                  className="form-control" 
                                  style={{ background: 'white', border: '1px solid #CBD5E1', borderRadius: '2px', height: '26px', width: '100%', padding: '0 10px', fontSize: '13px', fontWeight: 600 }}
                                  value={rescheduleProfileTime} 
                                  onChange={(e) => setRescheduleProfileTime(e.target.value)} 
                                />
                              </div>
                            ) : (
                              <div style={{ fontSize: '12px', fontWeight: 800, color: '#0F172A', marginTop: '4px', lineHeight: '1.4' }}>
                                {getFormattedSummaryDate(selectedProfileAppointment.date)}<br />
                                <span style={{ color: '#475569', fontWeight: 600 }}>{selectedProfileAppointment.time}</span>
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Practitioner */}
                        <div style={{ display: 'flex', gap: '14px', alignItems: 'flex-start' }}>
                          <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: '#EFF6FF', color: '#2563EB', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                              <circle cx="9" cy="7" r="4" />
                              <line x1="19" y1="8" x2="19" y2="14" />
                              <line x1="22" y1="11" x2="16" y2="11" />
                            </svg>
                          </div>
                          <div>
                            <div style={{ fontSize: '11px', color: '#94A3B8', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Practitioner</div>
                            <div style={{ fontSize: '12px', fontWeight: 800, color: '#0F172A', marginTop: '4px', lineHeight: '1.4' }}>
                              {selectedProfileAppointment.doctorId?.name || 'Dr. Julian Vance'}<br />
                              <span style={{ color: '#64748B', fontWeight: 500 }}>{selectedProfileAppointment.doctorId?.role || 'Senior Cardiologist'}</span>
                            </div>
                          </div>
                        </div>

                        {/* Department */}
                        <div style={{ display: 'flex', gap: '14px', alignItems: 'flex-start' }}>
                          <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: '#EFF6FF', color: '#2563EB', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                              <rect x="4" y="2" width="16" height="20" rx="2" ry="2"/>
                              <line x1="9" y1="22" x2="9" y2="16"/>
                              <line x1="8" y1="12" x2="8" y2="12.01"/>
                              <line x1="12" y1="12" x2="12" y2="12.01"/>
                              <line x1="16" y1="12" x2="16" y2="12.01"/>
                              <line x1="8" y1="16" x2="8" y2="16.01"/>
                              <line x1="12" y1="16" x2="12" y2="16.01"/>
                              <line x1="16" y1="16" x2="16" y2="16.01"/>
                              <line x1="8" y1="8" x2="8" y2="8.01"/>
                              <line x1="12" y1="8" x2="12" y2="8.01"/>
                              <line x1="16" y1="8" x2="16" y2="8.01"/>
                            </svg>
                          </div>
                          <div>
                            <div style={{ fontSize: '11px', color: '#94A3B8', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Department</div>
                            <div style={{ fontSize: '12px', fontWeight: 800, color: '#0F172A', marginTop: '4px', lineHeight: '1.4' }}>
                              {((selectedProfileAppointment.doctorId?.specialty || selectedProfileAppointment.doctorId?.role || 'Cardiology').replace('Doctor', '').trim() + ' Wing')}<br />
                              <span style={{ color: '#64748B', fontWeight: 500 }}>
                                {(() => {
                                  const docId = String(selectedProfileAppointment.doctorId?._id || '');
                                  let sum = 0;
                                  for (let i = 0; i < docId.length; i++) sum += docId.charCodeAt(i);
                                  const floorNum = (sum % 4) + 1;
                                  const roomNum = floorNum * 100 + (sum % 20) + 1;
                                  const suffixes = ['st', 'nd', 'rd', 'th'];
                                  const suffix = floorNum <= 3 ? suffixes[floorNum - 1] : 'th';
                                  return `${floorNum}${suffix} Floor, Room ${roomNum}`;
                                })()}
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* Location */}
                        <div style={{ display: 'flex', gap: '14px', alignItems: 'flex-start' }}>
                          <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: '#EFF6FF', color: '#2563EB', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/>
                              <circle cx="12" cy="10" r="3"/>
                            </svg>
                          </div>
                          <div>
                            <div style={{ fontSize: '11px', color: '#94A3B8', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Location</div>
                            <div style={{ fontSize: '12px', fontWeight: 800, color: '#0F172A', marginTop: '4px', lineHeight: '1.4' }}>
                              {currentUser?.tenantName || 'Main Medical Plaza'}<br />
                              <span style={{ color: '#64748B', fontWeight: 500 }}>{selectedProfileAppointment.doctorId?.address || 'Downtown Campus'}</span>
                            </div>
                          </div>
                        </div>
                      </div>

                      <div style={{ height: '1px', background: '#F1F5F9', margin: '22px 0' }}></div>

                      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        {selectedProfileAppointment.status === 'Completed' ? (
                          <>
                            <button 
                              className="btn"
                              style={{ 
                                width: '100%', 
                                height: '26px', 
                                background: '#2563EB', 
                                color: 'white', 
                                border: 'none', 
                                borderRadius: '2px', 
                                fontWeight: 800, 
                                fontSize: '13px', 
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '8px'
                              }}
                              onClick={() => handleViewPrescription(selectedProfileAppointment._id)}
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                                <polyline points="14 2 14 8 20 8"/>
                                <line x1="16" y1="13" x2="8" y2="13"/>
                                <line x1="16" y1="17" x2="8" y2="17"/>
                                <polyline points="10 9 9 9 8 9"/>
                              </svg>
                              View Prescription
                            </button>
                            <button 
                              className="btn"
                              style={{ 
                                width: '100%', 
                                height: '26px', 
                                background: '#EFF6FF', 
                                color: '#2563EB', 
                                border: '1px solid #BFDBFE', 
                                borderRadius: '2px', 
                                fontWeight: 800, 
                                fontSize: '13px', 
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '8px'
                              }}
                              onClick={() => handleViewLabReport(selectedProfileAppointment._id)}
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/>
                                <rect x="8" y="2" width="8" height="4" rx="1" ry="1"/>
                              </svg>
                              View Lab report
                            </button>
                          </>
                        ) : selectedProfileAppointment.status === 'Cancelled' ? (
                          <div style={{ padding: '12px', background: '#FEF2F2', color: '#EF4444', borderRadius: '2px', fontSize: '13px', fontWeight: 800, textAlign: 'center', border: '1px solid #FEE2E2' }}>
                            Appointment Cancelled
                          </div>
                        ) : isReschedulingProfileAppt ? (
                          <>
                            <button 
                              className="btn"
                              style={{ 
                                width: '100%', 
                                height: '26px', 
                                background: 'linear-gradient(135deg, #2563EB 0%, #1D4ED8 100%)', 
                                color: 'white', 
                                border: 'none', 
                                borderRadius: '2px', 
                                fontWeight: 800, 
                                fontSize: '13px', 
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '8px'
                              }}
                              onClick={handleSaveProfileReschedule}
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                <polyline points="20 6 9 17 4 12" />
                              </svg>
                              Confirm Reschedule
                            </button>
                            <button 
                              className="btn"
                              style={{ 
                                width: '100%', 
                                height: '26px', 
                                background: '#F1F5F9', 
                                color: '#64748B', 
                                border: '1px solid #E2E8F0', 
                                borderRadius: '2px', 
                                fontWeight: 800, 
                                fontSize: '13px', 
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '8px'
                              }}
                              onClick={() => {
                                setIsReschedulingProfileAppt(false);
                                if (selectedProfileAppointment) {
                                  const d = new Date(selectedProfileAppointment.date);
                                  const dateVal = !isNaN(d.getTime()) ? d.toISOString().split('T')[0] : '';
                                  setRescheduleProfileDate(dateVal);
                                  setRescheduleProfileTime(selectedProfileAppointment.time || '');
                                }
                              }}
                            >
                              Cancel
                            </button>
                          </>
                        ) : cancelApptConfirmId === selectedProfileAppointment._id ? (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', background: '#FEF2F2', padding: '12px', borderRadius: '2px', border: '1px solid #FEE2E2', animation: 'fadeIn 0.2s ease-out' }}>
                            <div style={{ fontSize: '12px', fontWeight: 800, color: '#EF4444', textAlign: 'center', marginBottom: '4px' }}>Cancel this appointment?</div>
                            <div style={{ display: 'flex', gap: '8px' }}>
                              <button 
                                className="btn" 
                                style={{ background: 'white', color: '#64748B', border: '1px solid #E2E8F0', fontWeight: 800, padding: '0', borderRadius: '2px', height: '36px', fontSize: '12.5px', flex: 1, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }} 
                                onClick={() => setCancelApptConfirmId(null)}
                              >
                                Keep
                              </button>
                              <button 
                                className="btn" 
                                style={{ background: '#EF4444', color: 'white', border: 'none', fontWeight: 800, padding: '0', borderRadius: '2px', height: '36px', fontSize: '12.5px', flex: 1, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }} 
                                onClick={confirmCancelProfileAppointment}
                              >
                                Confirm Cancel
                              </button>
                            </div>
                          </div>
                        ) : (
                          <>
                            <button 
                              className="btn"
                              style={{ 
                                width: '100%', 
                                height: '26px', 
                                background: 'white', 
                                color: '#2563EB', 
                                border: '1.5px solid #2563EB', 
                                borderRadius: '2px', 
                                fontWeight: 800, 
                                fontSize: '13px', 
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '8px'
                              }}
                              onClick={() => {
                                if (selectedProfileAppointment) {
                                  setIsReschedulingProfileAppt(true);
                                  const d = new Date(selectedProfileAppointment.date);
                                  const dateVal = !isNaN(d.getTime()) ? d.toISOString().split('T')[0] : '';
                                  setRescheduleProfileDate(dateVal);
                                  setRescheduleProfileTime(selectedProfileAppointment.time || '');
                                }
                              }}
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                                <line x1="16" y1="2" x2="16" y2="6" />
                                <line x1="8" y1="2" x2="8" y2="6" />
                                <line x1="3" y1="10" x2="21" y2="10" />
                              </svg>
                              Reschedule Appointment
                            </button>
                            <button 
                              className="btn"
                              style={{ 
                                width: '100%', 
                                height: '26px', 
                                background: 'white', 
                                color: '#EF4444', 
                                border: '1.5px solid #FCA5A5', 
                                borderRadius: '2px', 
                                fontWeight: 800, 
                                fontSize: '13px', 
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '8px'
                              }}
                              onClick={() => handleCancelProfileAppointment(selectedProfileAppointment._id)}
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                <circle cx="12" cy="12" r="10" />
                                <line x1="15" y1="9" x2="9" y2="15" />
                                <line x1="9" y1="9" x2="15" y2="15" />
                              </svg>
                              Cancel Appointment
                            </button>
                          </>
                        )}
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

            {/* View Prescription Modal */}
            {prescriptionModalOpen && selectedPrescription && (
              <div onClick={() => setPrescriptionModalOpen(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)', backdropFilter: 'blur(4px)', zIndex: 9000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '10px' }}>
                <div onClick={e => e.stopPropagation()} style={{ background: 'white', borderRadius: '20px', padding: '32px', width: '100%', maxWidth: '600px', boxShadow: '0 24px 64px rgba(0,0,0,0.15)', animation: 'slideUp 0.3s ease-out' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                    <div>
                      <div style={{ fontSize: '20px', fontWeight: 900, color: '#0F172A' }}>Prescription Details</div>
                      <div style={{ fontSize: '12px', color: '#64748B', fontWeight: 600, marginTop: '2px' }}>Issued by {selectedPrescription.doctorId?.name || 'Dr. Julian Vance'}</div>
                    </div>
                    <button onClick={() => setPrescriptionModalOpen(false)} style={{ background: '#F1F5F9', border: 'none', borderRadius: '2px', width: '32px', height: '22px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748B', fontSize: '14px', fontWeight: 'bold' }}>✕</button>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '400px', overflowY: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                      <thead>
                        <tr style={{ borderBottom: '2px solid #F1F5F9' }}>
                          <th style={{ padding: '10px 12px', fontSize: '11px', fontWeight: 800, color: '#64748B', textTransform: 'uppercase' }}>Medicine</th>
                          <th style={{ padding: '10px 12px', fontSize: '11px', fontWeight: 800, color: '#64748B', textTransform: 'uppercase' }}>Dosage</th>
                          <th style={{ padding: '10px 12px', fontSize: '11px', fontWeight: 800, color: '#64748B', textTransform: 'uppercase' }}>Duration</th>
                          <th style={{ padding: '10px 12px', fontSize: '11px', fontWeight: 800, color: '#64748B', textTransform: 'uppercase' }}>Instructions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedPrescription.items && selectedPrescription.items.map((item, idx) => (
                          <tr key={idx} style={{ borderBottom: '1px solid #F1F5F9' }}>
                            <td style={{ padding: '12px', fontSize: '12px', fontWeight: 850, color: '#0F172A' }}>{item.medicine}</td>
                            <td style={{ padding: '12px', fontSize: '13px', fontWeight: 700, color: '#475569' }}>{item.dosage}</td>
                            <td style={{ padding: '12px', fontSize: '13px', fontWeight: 700, color: '#475569' }}>{item.duration}</td>
                            <td style={{ padding: '12px', fontSize: '12.5px', color: '#64748B', fontWeight: 600 }}>{item.instructions || 'After meals'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

             {/* View Lab Report Modal is now rendered globally at the end of the file */}

            {/* View All Lab Reports Modal */}
            {allLabsModalOpen && selectedPatient && (
              <div onClick={() => setAllLabsModalOpen(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)', backdropFilter: 'blur(4px)', zIndex: 9000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '10px' }}>
                <div onClick={e => e.stopPropagation()} style={{ background: 'white', borderRadius: '20px', padding: '32px', width: '100%', maxWidth: '700px', boxShadow: '0 24px 64px rgba(0,0,0,0.15)', animation: 'slideUp 0.3s ease-out', display: 'flex', flexDirection: 'column', maxHeight: '90vh' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexShrink: 0 }}>
                    <div>
                      <div style={{ fontSize: '20px', fontWeight: 900, color: '#0F172A' }}>Lab Reports History</div>
                      <div style={{ fontSize: '13px', color: '#64748B', fontWeight: 600, marginTop: '2px' }}>Patient: {selectedPatient.name} ({getFormattedPatientId(selectedPatient._id)})</div>
                    </div>
                    <button onClick={() => setAllLabsModalOpen(false)} style={{ background: '#F1F5F9', border: 'none', borderRadius: '2px', width: '32px', height: '22px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748B', fontSize: '14px', fontWeight: 'bold' }}>✕</button>
                  </div>

                  <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px', paddingRight: '4px' }}>
                    {patientLabReports.length === 0 ? (
                      <div style={{ textAlign: 'center', padding: '40px 20px', color: '#94A3B8', fontWeight: 600 }}>No lab reports recorded for this patient.</div>
                    ) : (
                      patientLabReports.map((report) => {
                        const isExpanded = selectedReportDetail?._id === report._id;
                        return (
                          <div 
                            key={report._id} 
                            style={{ 
                              border: '1px solid #E2E8F0', 
                              borderRadius: '4px', 
                              background: '#F8FAFC', 
                              padding: '16px',
                              transition: 'all 0.2s ease-in-out'
                            }}
                          >
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }} onClick={() => setSelectedReportDetail(isExpanded ? null : report)}>
                              <div>
                                <div style={{ fontSize: '12px', fontWeight: 850, color: '#0F172A' }}>{report.testName}</div>
                                <div style={{ fontSize: '12px', color: '#64748B', fontWeight: 600, marginTop: '4px' }}>
                                  Ordered on: {new Date(report.createdAt).toLocaleDateString('en-US', { day: 'numeric', month: 'long', year: 'numeric' })}
                                </div>
                              </div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                <span style={{ 
                                  fontSize: '11px', 
                                  fontWeight: 800, 
                                  padding: '4px 10px', 
                                  borderRadius: '6px', 
                                  background: report.status === 'Completed' ? '#DCFCE7' : '#FEF3C7', 
                                  color: report.status === 'Completed' ? '#15803D' : '#D97706' 
                                }}>
                                  {report.status}
                                </span>
                                <svg 
                                  xmlns="http://www.w3.org/2000/svg" 
                                  width="18" 
                                  height="18" 
                                  viewBox="0 0 24 24" 
                                  fill="none" 
                                  stroke="#64748B" 
                                  strokeWidth="2.5" 
                                  strokeLinecap="round" 
                                  strokeLinejoin="round"
                                  style={{ transform: isExpanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}
                                >
                                  <polyline points="6 9 12 15 18 9" />
                                </svg>
                              </div>
                            </div>

                            {isExpanded && (
                              <div style={{ marginTop: '16px', paddingTop: '16px', borderTop: '1px dashed #E2E8F0', animation: 'slideDown 0.2s ease-out' }}>
                                <div style={{ fontSize: '12px', fontWeight: 800, color: '#475569', textTransform: 'uppercase', marginBottom: '8px', letterSpacing: '0.05em' }}>Investigation Findings</div>
                                <div style={{ 
                                  padding: '16px', 
                                  background: 'white', 
                                  border: '1px solid #E2E8F0', 
                                  borderRadius: '2px', 
                                  fontFamily: 'monospace', 
                                  fontSize: '13px', 
                                  color: '#1E293B', 
                                  lineHeight: '1.6', 
                                  whiteSpace: 'pre-wrap' 
                                }}>
                                  {report.results || 'No findings recorded yet.'}
                                </div>
                                {report.notes && (
                                  <div style={{ marginTop: '12px', fontSize: '12.5px', color: '#64748B', fontStyle: 'italic' }}>
                                    <strong>Notes:</strong> {report.notes}
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

                                                                        {/* REGISTRATION FORM TAB */}
        {activeTab === 'registration-form' && (
          <div className="tab-content active" style={{ animation: 'slideUp 0.4s ease-out' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2px' }}>
              <h1 style={{ fontSize: '16px', fontWeight: 800, color: '#1A1D23', margin: 0 }}>Registration and appointment</h1>
            </div>

            {isExistingPatient === null ? (
              <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 'calc(100vh - 120px)' }}>
                <div style={{ width: '600px', padding: '40px', borderRadius: '16px', background: 'white', border: '1px solid #E2E8F0', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1), 0 10px 10px -5px rgba(0,0,0,0.04)' }}>
                  
                  {/* Header: User Icon + Title + Subtitle */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '20px', marginBottom: '24px' }}>
                    <div style={{ width: '64px', height: '64px', borderRadius: '50%', background: '#EFF6FF', color: '#3B82F6', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <i data-lucide="user" style={{ width: '32px', height: '32px' }}></i>
                    </div>
                    <div>
                      <h2 style={{ fontSize: '24px', fontWeight: 800, color: '#0F172A', margin: '0 0 8px 0', fontFamily: "'Inter', sans-serif" }}>Registered Patient</h2>
                      <p style={{ fontSize: '14px', color: '#64748B', margin: 0, fontWeight: 500 }}>Search and select an existing patient to book an appointment.</p>
                    </div>
                  </div>

                  {/* Search Field with magnifying glass on the right */}
                  <div style={{ position: 'relative', marginBottom: '8px' }}>
                    <input
                      type="text"
                      placeholder="Search by Patient ID or Phone Number"
                      style={{
                        height: '56px',
                        paddingRight: '56px',
                        paddingLeft: '20px',
                        borderRadius: '12px',
                        fontSize: '16px',
                        fontWeight: 600,
                        border: '2px solid #CBD5E1',
                        width: '100%',
                        boxSizing: 'border-box',
                        outline: 'none',
                        transition: 'border-color 0.2s',
                        color: '#0F172A'
                      }}
                      onFocus={e => e.target.style.borderColor = '#3B82F6'}
                      onBlur={e => e.target.style.borderColor = '#CBD5E1'}
                      value={searchPatientQuery}
                      onChange={e => setSearchPatientQuery(e.target.value)}
                    />
                    <i data-lucide="search" style={{ position: 'absolute', right: '20px', top: '18px', color: '#94A3B8', width: '20px', height: '20px' }}></i>
                  </div>

                  {/* Search Autocomplete List */}
                  {searchPatientQuery.trim().length > 0 && (
                    <div data-lenis-prevent style={{ maxHeight: '300px', overflowY: 'auto', border: '1px solid #E2E8F0', borderRadius: '12px', background: 'white', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)', marginTop: '8px' }}>
                      {patientsList.filter(p => {
                        const q = searchPatientQuery.toLowerCase();
                        return p.name.toLowerCase().includes(q) || p.contact.toLowerCase().includes(q) || p._id.toLowerCase().includes(q);
                      }).length === 0 ? (
                        <div
                          style={{ padding: '24px', textAlign: 'center', color: '#64748B', cursor: 'pointer', transition: '0.2s', background: '#F8FAFC' }}
                          onClick={() => {
                            setSelectedPatient(null);
                            const isNumeric = /^\d+$/.test(searchPatientQuery.trim());
                            setFormData({
                              name: !isNumeric ? searchPatientQuery : '',
                              age: '',
                              gender: '',
                              contact: isNumeric ? searchPatientQuery : '',
                              email: '',
                              doctorId: formData.doctorId,
                              bloodGroup: '',
                              address: '',
                              medicalHistory: '',
                              referredBy: '',
                              allergies: 'None',
                              currentMedications: ''
                            });
                            setIsExistingPatient(false);
                            setSearchPatientQuery('');
                          }}
                          onMouseEnter={(e) => e.currentTarget.style.background = '#F0FDF4'}
                          onMouseLeave={(e) => e.currentTarget.style.background = '#F8FAFC'}
                        >
                          <div style={{ marginBottom: '8px', fontSize: '15px', fontWeight: 600 }}>No matching patients found.</div>
                          <div style={{ color: '#10B981', fontWeight: 700, fontSize: '16px' }}>Click here to register a new patient &rarr;</div>
                        </div>
                      ) : (
                        patientsList.filter(p => {
                          const q = searchPatientQuery.toLowerCase();
                          return p.name.toLowerCase().includes(q) || p.contact.toLowerCase().includes(q) || p._id.toLowerCase().includes(q);
                        }).map(p => (
                          <div
                            key={p._id}
                            style={{ padding: '16px 20px', borderBottom: '1px solid #F1F5F9', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', transition: '0.2s' }}
                            onClick={() => {
                              setSelectedPatient(p);
                              setFormData({
                                name: p.name,
                                age: p.age,
                                gender: p.gender,
                                contact: p.contact,
                                email: p.email || '',
                                bloodGroup: p.bloodGroup || 'O+',
                                address: p.address || '',
                                medicalHistory: p.medicalHistory ? p.medicalHistory.join(', ') : '',
                                doctorId: formData.doctorId,
                                allergies: p.allergies || 'None',
                                currentMedications: p.currentMedications || ''
                              });
                              setIsExistingPatient(true);
                            }}
                            onMouseEnter={(e) => e.currentTarget.style.background = '#F8FAFC'}
                            onMouseLeave={(e) => e.currentTarget.style.background = 'white'}
                          >
                            <div>
                              <div style={{ fontWeight: 800, fontSize: '16px', color: '#0F172A' }}>{p.name}</div>
                              <div style={{ fontSize: '13px', color: '#64748B', fontWeight: 600, marginTop: '4px' }}>
                                #{p._id.substring(18).toUpperCase()} • {p.gender} • {p.age} Yrs
                              </div>
                              <div
                                style={{ fontSize: '13px', color: '#10B981', fontWeight: 800, marginTop: '6px', display: 'inline-block', cursor: 'pointer' }}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedPatient(null);
                                  setFormData({
                                    name: '',
                                    age: '',
                                    gender: '',
                                    contact: p.contact,
                                    email: '',
                                    doctorId: formData.doctorId,
                                    bloodGroup: '',
                                    address: '',
                                    medicalHistory: '',
                                    referredBy: '',
                                    allergies: 'None',
                                    currentMedications: ''
                                  });
                                  setIsExistingPatient(false);
                                  setSearchPatientQuery('');
                                }}
                              >
                                + Register Family
                              </div>
                            </div>
                            <div style={{ textAlign: 'right' }}>
                              <div style={{ fontSize: '14px', fontWeight: 800, color: '#3B82F6' }}>{p.contact}</div>
                              <span style={{ fontSize: '12px', background: '#EFF6FF', color: '#2563EB', padding: '4px 12px', borderRadius: '6px', fontWeight: 800, display: 'inline-block', marginTop: '6px' }}>
                                Select
                              </span>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </div>
              </div>
) : (
              <>
              {/* ========================================== */}
              {/* ACTUAL DENSE FORM LAYOUT */}
              {/* ========================================== */}
              
<style>{`
  .impressive-input { transition: all 0.2s ease-in-out; border: 1px solid #0F172A; }
  .impressive-input:focus:not([readonly]) { border-color: #3B82F6 !important; box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.15) !important; outline: none; background: white !important; }
  .impressive-input:hover:not([readonly]):not(:focus) { border-color: #94A3B8; }
  .required-empty { border-color: #EF4444 !important; box-shadow: 0 0 0 3px rgba(239, 68, 68, 0.15) !important; }
  
  .impressive-select { transition: all 0.2s ease-in-out; border: 1px solid #0F172A; }
  .impressive-select:focus:not([disabled]) { border-color: #3B82F6 !important; box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.15) !important; outline: none; }
  
  .impressive-btn-main { background: linear-gradient(135deg, #2563EB 0%, #1D4ED8 100%) !important; box-shadow: 0 4px 14px rgba(37,99,235,0.3) !important; transition: all 0.2s; }
  .impressive-btn-main:hover { transform: translateY(-1px); box-shadow: 0 6px 20px rgba(37,99,235,0.4) !important; background: linear-gradient(135deg, #1D4ED8 0%, #1E40AF 100%) !important; }
  .impressive-btn-main:active { transform: translateY(1px); box-shadow: 0 2px 4px rgba(37,99,235,0.3) !important; }
  
  .vitals-box { background: linear-gradient(to right, #FFF1F2, #FFF7ED) !important; border-color: #FECDD3 !important; }
  .billing-box { background: linear-gradient(to right, #F0FDF4, #ECFDF5) !important; border-color: #A7F3D0 !important; }
  
  .slot-btn { transition: all 0.2s ease; }
  .slot-btn:hover:not(.slot-full) { border-color: #3B82F6 !important; transform: scale(1.02); }
`}</style>
<div style={{ background: 'white', borderRadius: '12px', boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.08), 0 8px 10px -6px rgba(0, 0, 0, 0.04)', display: 'flex', flexDirection: 'column', height: 'calc(100vh - 120px)', overflow: 'hidden', border: '1px solid #E2E8F0' }}>

                
                {/* Header / Title Bar */}
                <div style={{ background: 'linear-gradient(90deg, #F0F9FF 0%, #FFFFFF 100%)', padding: '12px 16px', borderBottom: '1px solid #E2E8F0', borderLeft: '4px solid #3B82F6', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <div style={{ width: '28px', height: '28px', borderRadius: '6px', background: '#EFF6FF', color: '#3B82F6', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <i data-lucide="clipboard-list" style={{ width: '16px', height: '16px' }}></i>
                  </div>
                  <h1 style={{ fontWeight: 800, fontSize: '15px', color: '#0F172A', margin: 0 }}>New Registration & Appointment</h1>
                  <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#10B981' }}></span>
                    <span style={{ fontSize: '11px', fontWeight: 600, color: '#64748B' }}>System Online</span>
                  </div>
                </div>

                <div style={{ display: 'flex', flex: 1, minHeight: 0, background: '#FFFFFF' }}>
                  
                  {/* Main Form Area (Left) */}
                  <div style={{ flex: 1, padding: '16px', borderRight: '1px solid #E2E8F0', display: 'flex', flexDirection: 'column', gap: '16px', overflowY: 'auto' }}>
                    
                    {/* Patient Info Grid */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(250px, 1fr) minmax(250px, 1fr) minmax(250px, 1fr)', gap: '8px 24px' }}>
                      {(() => {
                        const isFormStarted = Boolean(formData.age || formData.title || formData.gender || formData.doctorId || formData.address);
                        const renderField = (label, children, isReq=false) => (
                          <div style={{ display: 'flex', alignItems: 'center' }}>
                            <div style={{ width: '100px', fontSize: '11.5px', fontWeight: 600, color: '#475569', display: 'flex', alignItems: 'center' }}>
                              {label}
                              {isReq && <span style={{ color: '#EF4444', fontSize: '16px', marginLeft: '3px', marginTop: '4px' }}>*</span>}
                            </div>
                            <div style={{ width: '12px', fontSize: '11.5px', color: '#94A3B8' }}>:</div>
                            <div style={{ flex: 1, display: 'flex', minWidth: 0 }}>{children}</div>
                          </div>
                        );
                        const inputStyle = { width: '100%', height: '28px', fontSize: '13px', padding: '0 8px', borderRadius: '6px', background: isExistingPatient ? '#F8FAFC' : 'white', color: '#0F172A' };
                        const selectStyle = { ...inputStyle, padding: '0 4px', cursor: isExistingPatient ? 'not-allowed' : 'pointer' };

                        return (
                          <>
                            {renderField("Mobile No.", <input type="text" className={`impressive-input ${!formData.contact && isFormStarted ? 'required-empty' : ''}`} style={inputStyle} value={formData.contact} onChange={e => { const val = e.target.value.replace(/\D/g, '').substring(0, 10); setFormData({...formData, contact: val}); }} readOnly={isExistingPatient} />)}
                            {renderField("Title", 
                              <select 
                                className={`impressive-select ${!formData.title && isFormStarted ? 'required-empty' : ''}`}
                                style={selectStyle} 
                                value={formData.title || ''} 
                                onChange={e => {
                                  const selectedTitle = e.target.value;
                                  let autoGender = formData.gender;
                                  if (selectedTitle === 'Mr.') autoGender = 'Male';
                                  else if (selectedTitle === 'Mrs.' || selectedTitle === 'Miss') autoGender = 'Female';
                                  else if (selectedTitle === 'Prefer not to say') autoGender = 'Other';
                                  setFormData({...formData, title: selectedTitle, gender: autoGender});
                                }} 
                                disabled={isExistingPatient}
                              >
                                <option value="">--Select--</option>
                                <option value="Mr.">Mr.</option>
                                <option value="Mrs.">Mrs.</option>
                                <option value="Miss">Miss</option>
                                <option value="Prefer not to say">Prefer not to say</option>
                              </select>, true
                            )}
                            {renderField("Patient Name", <input type="text" className={`impressive-input ${!formData.name && isFormStarted ? 'required-empty' : ''}`} style={inputStyle} value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} readOnly={isExistingPatient} />)}
                            {renderField("Gender", 
                              <select className={`impressive-select ${!formData.gender && isFormStarted ? 'required-empty' : ''}`} style={selectStyle} value={formData.gender} onChange={e => setFormData({...formData, gender: e.target.value})} disabled={isExistingPatient}>
                                <option value="">--Select--</option><option value="Male">Male</option><option value="Female">Female</option><option value="Other">Other</option>
                              </select>, true
                            )}

                            {renderField("Age", (
                              <div style={{ display: 'flex', gap: '4px', width: '100%', alignItems: 'center' }}>
                                <input 
                                  type="number" 
                                  min="0" 
                                  max="120"
                                  placeholder="Yrs" 
                                  className={`impressive-input ${!formData.age && !formData.ageMonths && !formData.ageDays && isFormStarted ? 'required-empty' : ''}`} 
                                  style={{ ...inputStyle, flex: 1, minWidth: 0, padding: '0 4px', textAlign: 'center' }} 
                                  value={formData.age} 
                                  onChange={e => setFormData({...formData, age: e.target.value})} 
                                  readOnly={isExistingPatient} 
                                />
                                <span style={{ fontSize: '11px', color: '#64748B', fontWeight: 700 }}>Y</span>

                                <input 
                                  type="number" 
                                  min="0" 
                                  max="11"
                                  placeholder="Mths" 
                                  className="impressive-input" 
                                  style={{ ...inputStyle, flex: 1, minWidth: 0, padding: '0 4px', textAlign: 'center' }} 
                                  value={formData.ageMonths || ''} 
                                  onChange={e => setFormData({...formData, ageMonths: e.target.value})} 
                                  readOnly={isExistingPatient} 
                                />
                                <span style={{ fontSize: '11px', color: '#64748B', fontWeight: 700 }}>M</span>

                                <input 
                                  type="number" 
                                  min="0" 
                                  max="30"
                                  placeholder="Days" 
                                  className="impressive-input" 
                                  style={{ ...inputStyle, flex: 1, minWidth: 0, padding: '0 4px', textAlign: 'center' }} 
                                  value={formData.ageDays || ''} 
                                  onChange={e => setFormData({...formData, ageDays: e.target.value})} 
                                  readOnly={isExistingPatient} 
                                />
                                <span style={{ fontSize: '11px', color: '#64748B', fontWeight: 700 }}>D</span>
                              </div>
                            ))}
                            {renderField("Email", 
                              <>
                                <input type="text" className="impressive-input" style={{...inputStyle, background: (isExistingPatient || otpVerified) ? '#F8FAFC' : 'white'}} value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} readOnly={isExistingPatient || otpVerified} />
                                {!isExistingPatient && !otpVerified && <button type="button" onClick={handleSendOtp} style={{ height: '26px', fontSize: '11px', marginLeft: '6px', background: '#EFF6FF', color: '#2563EB', border: '1px solid #BFDBFE', borderRadius: '4px', padding: '0 10px', fontWeight: 600, cursor: 'pointer' }}>Verify</button>}
                              </>
                            )}
                            {bookingType === 'lab' ? (
                              renderField("Referred By", <input type="text" className="impressive-input" style={inputStyle} value={formData.referredBy || ''} onChange={e => setFormData({...formData, referredBy: e.target.value})} readOnly={isExistingPatient} />)
                            ) : (
                              renderField("Blood Group", 
                                <select className="impressive-select" style={selectStyle} value={formData.bloodGroup} onChange={e => setFormData({...formData, bloodGroup: e.target.value})} disabled={isExistingPatient}>
                                  <option value="">--Select--</option><option value="O+">O+</option><option value="O-">O-</option><option value="A+">A+</option><option value="A-">A-</option><option value="B+">B+</option><option value="B-">B-</option><option value="AB+">AB+</option><option value="AB-">AB-</option>
                                </select>
                              )
                            )}

                            <div style={{ gridColumn: 'span 2' }}>
                              {renderField("Address", <input type="text" className="impressive-input" style={inputStyle} value={formData.address} onChange={e => setFormData({...formData, address: e.target.value})} readOnly={isExistingPatient} />)}
                            </div>
                            {renderField("Medical Hist.", <input type="text" className="impressive-input" style={inputStyle} value={formData.medicalHistory} onChange={e => setFormData({...formData, medicalHistory: e.target.value})} readOnly={isExistingPatient} />)}
                            
                            {renderField("Allergies", <input type="text" className="impressive-input" style={{...inputStyle, background: 'white'}} value={formData.allergies} onChange={e => setFormData({...formData, allergies: e.target.value})} />)}
                            <div style={{ gridColumn: 'span 2' }}>
                              {renderField("Current Meds.", <input type="text" className="impressive-input" style={{...inputStyle, background: 'white'}} value={formData.currentMedications} onChange={e => setFormData({...formData, currentMedications: e.target.value})} />)}
                            </div>
                          </>
                        );
                      })()}
                    </div>

                    <div style={{ height: '1px', background: '#E2E8F0', margin: '4px 0' }}></div>

                    {/* Visit & Appointment Details */}
                    {bookingType === 'opd' && (
                      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(250px, 1fr) minmax(250px, 1fr) minmax(250px, 1fr)', gap: '8px 24px' }}>
                        {(() => {
                          const renderField = (label, children) => (
                            <div style={{ display: 'flex', alignItems: 'center' }}>
                              <div style={{ width: '100px', fontSize: '11.5px', fontWeight: 600, color: '#475569' }}>{label}</div>
                              <div style={{ width: '12px', fontSize: '11.5px', color: '#94A3B8' }}>:</div>
                              <div style={{ flex: 1, display: 'flex', minWidth: 0 }}>{children}</div>
                            </div>
                          );
                          const inputStyle = { width: '100%', height: '26px', fontSize: '12px', padding: '0 8px', border: '1px solid #CBD5E1', borderRadius: '4px', background: 'white', color: '#0F172A', outline: 'none' };

                          return (
                            <>
                              {renderField("Symptoms", 
                                <div className="custom-dropdown-container" style={{ width: '100%', position: 'relative' }}>
                                  <div className="custom-dropdown-trigger impressive-input" onClick={() => { if (!reschedulingAppointment) { setSymptomDropdownOpen(!symptomDropdownOpen); if (symptomDropdownOpen) setSymptomSearchQuery(''); } }} style={{ ...inputStyle, display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: reschedulingAppointment ? 'not-allowed' : 'pointer', padding: '0 8px', height: 'auto', minHeight: '26px', opacity: reschedulingAppointment ? 0.6 : 1 }}>
                                      <div className="selected-items" style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', padding: '2px 0' }} data-lenis-prevent>
                                          {selectedSymptoms.length > 0 ? (
                                              selectedSymptoms.map(s => (
                                                <div key={s} className="symptom-tag" style={{ background: '#F1F5F9', color: '#334155', padding: '2px 6px', fontSize: '10.5px', borderRadius: '4px', display: 'flex', alignItems: 'center', gap: '4px', border: '1px solid #E2E8F0', fontWeight: 600 }}>
                                                    {s}
                                                    <span 
                                                      onClick={(e) => { e.stopPropagation(); !reschedulingAppointment && toggleSymptom(s); }}
                                                      style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
                                                    >
                                                        <i data-lucide="x" style={{ pointerEvents: 'none', width: '12px', height: '12px' }}></i>
                                                    </span>
                                                </div>
                                              ))
                                          ) : (
                                              <span style={{ color: '#94A3B8', fontSize: '11px', fontWeight: 500 }}>Select symptoms...</span>
                                          )}
                                      </div>
                                      <i data-lucide="chevron-down" style={{ width: '14px', height: '14px', color: '#94A3B8', transition: '0.3s', transform: symptomDropdownOpen ? 'rotate(180deg)' : 'none' }}></i>
                                  </div>
                                  {symptomDropdownOpen && (
                                      <div className="dropdown-options-box show" style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: 'white', border: '1px solid #CBD5E1', borderRadius: '4px', marginTop: '4px', maxHeight: '150px', overflowY: 'auto', zIndex: 100, boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' }} data-lenis-prevent>
                                          <div style={{ padding: '6px', position: 'sticky', top: 0, background: 'white', borderBottom: '1px solid #F1F5F9' }}>
                                              <input type="text" autoFocus placeholder="Search symptoms..." value={symptomSearchQuery} onChange={e => setSymptomSearchQuery(e.target.value)} onClick={e => e.stopPropagation()} onKeyDown={e => { if (e.key === 'Enter' && symptomSearchQuery.trim()) { toggleSymptom(symptomSearchQuery.trim()); setSymptomSearchQuery(''); setSymptomDropdownOpen(false); } }} style={{ width: '100%', border: '1px solid #E2E8F0', borderRadius: '4px', padding: '6px 8px', fontSize: '11.5px', outline: 'none', background: '#F8FAFC' }} />
                                          </div>
                                          {(() => {
                                              const filtered = availableSymptoms.filter(s => s.toLowerCase().includes(symptomSearchQuery.toLowerCase()));
                                              return (
                                                  <>
                                                      {filtered.map(s => (
                                                          <div key={s} className="option-item" onClick={() => { toggleSymptom(s); setSymptomDropdownOpen(false); }} style={{ padding: '6px 12px', fontSize: '11.5px', cursor: 'pointer', borderBottom: '1px solid #F1F5F9', fontWeight: 600, color: '#334155' }} onMouseOver={e => e.target.style.background = '#F8FAFC'} onMouseOut={e => e.target.style.background = 'white'}>
                                                            {s}
                                                          </div>
                                                      ))}
                                                      {filtered.length === 0 && symptomSearchQuery.trim() !== '' && (
                                                          <div className="option-item" onClick={() => { toggleSymptom(symptomSearchQuery.trim()); setSymptomSearchQuery(''); setSymptomDropdownOpen(false); }} style={{ padding: '6px 12px', fontSize: '11.5px', cursor: 'pointer', color: '#0F172A', fontWeight: 600, fontStyle: 'italic' }}>
                                                              Press Enter to add "{symptomSearchQuery}"
                                                          </div>
                                                      )}
                                                      {filtered.length === 0 && symptomSearchQuery.trim() === '' && (
                                                          <div style={{ padding: '6px 12px', fontSize: '11.5px', color: '#94A3B8' }}>No symptoms found.</div>
                                                      )}
                                                  </>
                                              );
                                          })()}
                                      </div>
                                  )}
                                </div>
                              )}
                              {renderField("Doctor", 
                                <select className="impressive-select" style={inputStyle} value={formData.doctorId} onChange={e => { setFormData({...formData, doctorId: e.target.value}); setSelectedSlot(''); }} disabled={!!reschedulingAppointment}>
                                  <option value="">-- Choose Doctor --</option>
                                  {doctors.map(doc => (<option key={doc._id} value={doc._id}>{doc.name}</option>))}
                                </select>
                              )}
                              {renderField("Date", 
                                <input type="date" className="impressive-input" style={inputStyle} value={bookingDate} min={getLocalDateString()} onChange={e => { setBookingDate(e.target.value); setSelectedSlot(''); }} disabled={!!reschedulingAppointment} />
                              )}
                            </>
                          );
                        })()}

                        <div style={{ gridColumn: '1 / -1', display: 'flex', gap: '8px', flexWrap: 'wrap', minHeight: '24px', alignItems: 'center' }}>
                          {selectedSymptoms.length > 0 && <span style={{ fontSize: '11px', color: '#64748B', fontWeight: 600, marginRight: '8px' }}>Added Symptoms:</span>}
                          {selectedSymptoms.map(s => (
                            <div key={s} style={{ background: '#F1F5F9', color: '#334155', padding: '4px 10px', fontSize: '11px', borderRadius: '12px', border: '1px solid #E2E8F0', display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 500 }}>
                              {s} <span onClick={() => !reschedulingAppointment && toggleSymptom(s)} style={{ cursor: 'pointer', color: '#94A3B8', fontWeight: 'bold' }}>×</span>
                            </div>
                          ))}
                        </div>

                        <div style={{ gridColumn: '1 / -1', display: 'flex', alignItems: 'flex-start', border: '1px dashed #CBD5E1', borderRadius: '8px', padding: '12px', background: '#F8FAFC', minHeight: '60px' }}>
                          <div style={{ width: '100px', fontSize: '11.5px', fontWeight: 700, color: '#334155', marginTop: '6px' }}>Available Slots</div>
                          <div style={{ width: '12px', fontSize: '11.5px', color: '#94A3B8', marginTop: '6px' }}>:</div>
                          <div style={{ flex: 1, display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                            {(!formData.doctorId || !bookingDate) ? (
                              <span style={{ fontSize: '12px', color: '#94A3B8', marginTop: '4px', fontStyle: 'italic' }}>Please select a doctor and date to view slots</span>
                            ) : !receptionDoctorAvailability.available ? (
                              <span style={{ fontSize: '12px', color: '#DC2626', fontWeight: 600, marginTop: '4px' }}><i data-lucide="alert-circle" style={{ width: '14px', verticalAlign: 'middle', marginRight: '4px' }}></i>Doctor Unavailable ({receptionDoctorAvailability.reason || 'Leave'})</span>
                            ) : (
                              (receptionDoctorAvailability.slots || DEFAULT_RECEPTION_SLOTS).map(time => {
                                let limit = 5;
                                const match = time.match(/\(Limit:\s*(\d+)\)/i);
                                if (match) limit = parseInt(match[1], 10);
                                const cleanTimeSlotStr = (str) => { if (!str) return ''; return str.split(/\(Limit:/i)[0].replace(/\s+/g, ' ').trim().toLowerCase(); };
                                const targetTimeClean = cleanTimeSlotStr(time);
                                const targetDateStr = new Date(bookingDate).toDateString();
                                let bookedCount = 0;
                                if (formData.doctorId && bookingDate) {
                                    bookedCount = appointments.filter(app => {
                                        if (app.status === 'Cancelled') return false;
                                        const appDocId = app.doctorId?._id || app.doctorId;
                                        if (String(appDocId) !== String(formData.doctorId)) return false;
                                        if (new Date(app.date).toDateString() !== targetDateStr) return false;
                                        return cleanTimeSlotStr(app.time) === targetTimeClean;
                                    }).length;
                                }
                                const isFull = bookedCount >= limit;
                                const isSelected = selectedSlot === time;
                                const displayTime = time.split(/\(Limit:/i)[0].trim();
                                return (
                                    <div key={time} onClick={() => { if (!isFull) setSelectedSlot(time); }} style={{ padding: '6px 12px', borderRadius: '6px', border: isSelected ? '2px solid #2563EB' : '1px solid #CBD5E1', fontSize: '11.5px', fontWeight: 600, cursor: isFull ? 'not-allowed' : 'pointer', background: isSelected ? '#EFF6FF' : (isFull ? '#F1F5F9' : 'white'), color: isSelected ? '#1D4ED8' : (isFull ? '#94A3B8' : '#334155'), transition: 'all 0.15s ease' }}>
                                        {displayTime} {isFull && <span style={{ color: '#DC2626', marginLeft: '4px', fontSize: '10px' }}>(Full)</span>}
                                    </div>
                                );
                              })
                            )}
                          </div>
                        </div>
                      </div>
                    )}

                    <div style={{ height: '1px', background: '#E2E8F0', margin: '4px 0' }}></div>

                    {/* Vitals and Consent */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(250px, 1fr) minmax(250px, 1fr) minmax(250px, 1fr)', gap: '8px 24px' }}>
                      {(() => {
                        const isFormStarted = Boolean(formData.age || formData.title || formData.gender || formData.doctorId || formData.address);
                        const renderField = (label, children, isReq=false) => (
                          <div style={{ display: 'flex', alignItems: 'center' }}>
                            <div style={{ width: '100px', fontSize: '11.5px', fontWeight: 600, color: '#475569', display: 'flex', alignItems: 'center' }}>
                              {label}
                              {isReq && <span style={{ color: '#EF4444', fontSize: '16px', marginLeft: '3px', marginTop: '4px' }}>*</span>}
                            </div>
                            <div style={{ width: '12px', fontSize: '11.5px', color: '#94A3B8' }}>:</div>
                            <div style={{ flex: 1, display: 'flex', minWidth: 0 }}>{children}</div>
                          </div>
                        );
                        const inputStyle = { width: '100%', height: '26px', fontSize: '12px', padding: '0 8px', border: '1px solid #CBD5E1', borderRadius: '4px', background: 'white' };

                        return (
                          <>
                            {renderField("Temp (°F)", <input type="number" step="0.1" className="impressive-input" style={inputStyle} value={vitalTemp} onChange={e => setVitalTemp(e.target.value)} />)}
                            {renderField("Pulse (bpm)", <input type="number" className="impressive-input" style={inputStyle} value={vitalPulse} onChange={e => setVitalPulse(e.target.value)} />)}
                            {renderField("Weight (kg)", <input type="number" step="0.1" className="impressive-input" style={inputStyle} value={vitalWeight} onChange={e => setVitalWeight(e.target.value)} />)}
                            {renderField("BP Sys", <input type="number" className="impressive-input" style={inputStyle} value={vitalBpSys} onChange={e => setVitalBpSys(e.target.value)} />)}
                            {renderField("BP Dia", <input type="number" className="impressive-input" style={inputStyle} value={vitalBpDia} onChange={e => setVitalBpDia(e.target.value)} />)}
                            {renderField("Height (cm)", <input type="number" className="impressive-input" style={inputStyle} value={vitalHeight} onChange={e => setVitalHeight(e.target.value)} />)}
                            
                            <div className="vitals-box" style={{ gridColumn: '1 / -1', display: 'flex', gap: '24px', alignItems: 'center', marginTop: '4px', padding: '10px 16px', borderRadius: '8px', border: '1px solid' }}>
                              <span style={{ fontSize: '12px', fontWeight: 700, color: '#334155' }}>Patient Consent:</span>
                              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', cursor: 'pointer', color: '#475569', fontWeight: 500 }}>
                                <input type="checkbox" checked={dpdpConsent.emrCreation} onChange={e => setDpdpConsent({...dpdpConsent, emrCreation: e.target.checked})} style={{ width: '14px', height: '14px', accentColor: '#2563EB' }} /> EMR Records Creation
                              </label>
                              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', cursor: 'pointer', color: '#475569', fontWeight: 500 }}>
                                <input type="checkbox" checked={dpdpConsent.dataSharing} onChange={e => setDpdpConsent({...dpdpConsent, dataSharing: e.target.checked})} style={{ width: '14px', height: '14px', accentColor: '#2563EB' }} /> Data Sharing (Research)
                              </label>
                            </div>
                          </>
                        );
                      })()}
                    </div>

                    {/* Bottom Billing Table Area */}
                    <div className="billing-box" style={{ marginTop: 'auto', border: '1px solid', borderRadius: '10px', padding: '16px', boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.02)' }}>
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '24px' }}>
                        
                        {/* Payment Details */}
                        <div style={{ flex: 1, display: 'grid', gridTemplateColumns: 'minmax(200px, 1fr) minmax(200px, 1fr)', gap: '12px 24px' }}>
                          <div style={{ display: 'flex', alignItems: 'center' }}>
                            <div style={{ width: '100px', fontSize: '12px', fontWeight: 700, color: '#334155' }}>Currency</div>
                            <div style={{ width: '12px', fontSize: '12px', color: '#94A3B8' }}>:</div>
                            <select className="impressive-select" style={{ height: '28px', fontSize: '12px', padding: '0 8px', border: '1px solid #CBD5E1', borderRadius: '4px', width: '120px', background: 'white' }}><option>INR (₹)</option></select>
                          </div>

                          <div style={{ display: 'flex', alignItems: 'center' }}>
                            <div style={{ width: '100px', fontSize: '12px', fontWeight: 700, color: '#334155' }}>Payment Mode</div>
                            <div style={{ width: '12px', fontSize: '12px', color: '#94A3B8' }}>:</div>
                            <div style={{ display: 'flex', gap: '12px' }}>
                              {['Cash', 'UPI', 'Other'].map(method => (
                                <label key={method} style={{ fontSize: '12px', display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontWeight: 500, color: '#475569' }}>
                                  <input type="radio" checked={bookingPaymentMethod === method} onChange={() => setBookingPaymentMethod(method)} name="paymode" style={{ accentColor: '#2563EB' }} /> {method}
                                </label>
                              ))}
                            </div>
                          </div>

                          <div style={{ display: 'flex', alignItems: 'center' }}>
                            <div style={{ width: '100px', fontSize: '12px', fontWeight: 700, color: '#334155' }}>Discount (%)</div>
                            <div style={{ width: '12px', fontSize: '12px', color: '#94A3B8' }}>:</div>
                            <input type="number" min="0" max={allowedDiscountPercent} value={bookingDiscountPercent || ''} onChange={e => { setBookingDiscountPercent(Math.min(allowedDiscountPercent, Math.max(0, Number(e.target.value)))); if(!Number(e.target.value)) setBookingDiscountReason(''); }} style={{ height: '28px', fontSize: '12px', padding: '0 8px', border: '1px solid #CBD5E1', borderRadius: '4px', width: '80px', textAlign: 'right', background: 'white' }} />
                          </div>
                          
                          {Number(bookingDiscountPercent) > 0 && (
                            <div style={{ display: 'flex', alignItems: 'center', marginTop: '12px' }}>
                              <div style={{ width: '100px', fontSize: '12px', fontWeight: 700, color: '#334155' }}>Reason <span style={{ color: '#EF4444' }}>*</span></div>
                              <div style={{ width: '12px', fontSize: '12px', color: '#94A3B8' }}>:</div>
                              <input type="text" placeholder="Required" value={bookingDiscountReason} onChange={e => setBookingDiscountReason(e.target.value)} style={{ height: '28px', fontSize: '12px', padding: '0 8px', border: '1px solid #CBD5E1', borderRadius: '4px', flex: 1, background: 'white' }} />
                            </div>
                          )}
                        </div>

                        {/* Totals Summary */}
                        {(() => {
                          const subtotalVal = getBillingItems().reduce((sum, item) => sum + item.amount, 0) + ((!isExistingPatient && getBillingItems().length > 0) ? 50 : 0);
                          const discAmt = (subtotalVal * Number(bookingDiscountPercent || 0)) / 100;
                          const finalTotalVal = Math.max(0, subtotalVal - discAmt);
                          return (
                            <div style={{ width: '280px', background: 'white', border: '1px solid #E2E8F0', borderRadius: '6px', padding: '12px', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#475569', marginBottom: '6px' }}><span>Gross Amount</span><span style={{ fontWeight: 600 }}>₹{subtotalVal.toFixed(2)}</span></div>
                              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#EF4444', marginBottom: '8px' }}><span>Discount Amount</span><span style={{ fontWeight: 600 }}>-₹{discAmt.toFixed(2)}</span></div>
                              <div style={{ borderTop: '1px dashed #CBD5E1', margin: '8px 0' }}></div>
                              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '16px', fontWeight: 900, background: 'linear-gradient(135deg, #10B981 0%, #059669 100%)', padding: '8px 12px', borderRadius: '6px', color: 'white', margin: '-4px -8px' }}><span>Net Amount</span><span>₹{finalTotalVal.toFixed(2)}</span></div>
                            </div>
                          );
                        })()}
                      </div>
                    </div>

                  </div>

                  {/* Action Sidebar (Right) */}
                  <div style={{ width: '220px', background: '#F8FAFC', padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px', borderLeft: '1px solid #E2E8F0' }}>
                    
                    <input type="file" id="patientPhotoUpload" style={{ display: 'none' }} accept="image/png, image/jpeg" onChange={(e) => { if (e.target.files && e.target.files[0]) { const file = e.target.files[0]; const reader = new FileReader(); reader.onloadend = () => { setPatientPhoto(reader.result); }; reader.readAsDataURL(file); } }} />
                    <input type="file" id="patientCameraUpload" style={{ display: 'none' }} accept="image/png, image/jpeg" capture="environment" onChange={(e) => { if (e.target.files && e.target.files[0]) { const file = e.target.files[0]; const reader = new FileReader(); reader.onloadend = () => { setPatientPhoto(reader.result); }; reader.readAsDataURL(file); } }} />
                    <div style={{ width: '100%', height: '160px', borderRadius: '8px', border: '2px dashed #CBD5E1', background: 'white', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '8px', position: 'relative', overflow: 'hidden' }}>
                      {patientPhoto ? (
                        <img src={patientPhoto} alt="Patient" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      ) : (
                        <>
                          <div style={{ width: '64px', height: '64px', borderRadius: '50%', background: '#F1F5F9', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '8px' }}>
                            <i data-lucide="camera" style={{ width: '24px', height: '24px', color: '#94A3B8' }}></i>
                          </div>
                          <span style={{ fontSize: '11.5px', color: '#64748B', fontWeight: 600 }}>No Image Available</span>
                        </>
                      )}
                    </div>
                    
                    <button type="button" onClick={() => document.getElementById('patientCameraUpload').click()} style={{ width: '100%', padding: '8px 0', fontSize: '12px', fontWeight: 600, background: 'white', color: '#3B82F6', border: '1px solid #BFDBFE', borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', transition: 'all 0.2s' }} onMouseOver={e => e.target.style.background = '#EFF6FF'} onMouseOut={e => e.target.style.background = 'white'}><i data-lucide="camera" style={{ width: '14px' }}></i> Capture Photo</button>
                    <button type="button" onClick={() => document.getElementById('patientPhotoUpload').click()} style={{ width: '100%', padding: '8px 0', fontSize: '12px', fontWeight: 600, background: 'white', color: '#3B82F6', border: '1px solid #BFDBFE', borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', transition: 'all 0.2s' }} onMouseOver={e => e.target.style.background = '#EFF6FF'} onMouseOut={e => e.target.style.background = 'white'}><i data-lucide="upload" style={{ width: '14px' }}></i> Upload Document</button>
                    
                    <div style={{ flex: 1 }}></div>

                    {!isExistingPatient && otpSent && !otpVerified && (
                      <div style={{ background: '#FEF2F2', padding: '12px', borderRadius: '8px', border: '1px solid #FECACA', marginBottom: '8px' }}>
                        <div style={{ fontSize: '11px', fontWeight: 700, color: '#991B1B', marginBottom: '6px' }}>Verify Mobile/Email OTP</div>
                        <input type="text" maxLength={6} placeholder="######" className="impressive-input" style={{ width: '100%', height: '30px', textAlign: 'center', border: '1px solid #FCA5A5', borderRadius: '4px', fontSize: '14px', letterSpacing: '2px', fontWeight: 'bold', marginBottom: '8px' }} value={verificationOtp} onChange={e => setVerificationOtp(e.target.value.replace(/\D/g, ''))} />
                        <button type="button" onClick={handleVerifyOtp} disabled={otpVerifying} style={{ width: '100%', background: '#EF4444', color: 'white', border: 'none', padding: '8px 0', borderRadius: '4px', fontWeight: 600, cursor: 'pointer', fontSize: '12px' }}>{otpVerifying ? 'Verifying...' : 'Submit OTP'}</button>
                      </div>
                    )}

                    <button type="button" onClick={() => { setSelectedPatient(null); setIsExistingPatient(null); setFormData({name: '', age: '', gender: '', contact: '', email: '', doctorId: '', bloodGroup: '', address: '', medicalHistory: '', referredBy: '', allergies: 'None', currentMedications: ''}); }} style={{ width: '100%', padding: '10px 0', fontSize: '12px', fontWeight: 600, background: '#F1F5F9', color: '#475569', border: '1px solid #CBD5E1', borderRadius: '6px', cursor: 'pointer', transition: 'all 0.2s' }} onMouseOver={e => e.target.style.background = '#E2E8F0'} onMouseOut={e => e.target.style.background = '#F1F5F9'}>Clear / Cancel</button>
                    
                    <button type="button" className="impressive-btn-main" onClick={reschedulingAppointment ? handleRescheduleSubmit : (bookingType === 'lab' ? handleCreateLabOrder : bookingType === 'service' ? handleCreateServiceOrder : handleCreateAppointment)} disabled={loading} style={{ width: '100%', padding: '14px 0', fontSize: '15px', fontWeight: 900, color: 'white', border: 'none', borderRadius: '8px', cursor: loading ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                      <i data-lucide="check-circle" style={{ width: '18px' }}></i> {loading ? 'Saving...' : (reschedulingAppointment ? 'Reschedule' : 'Register Patient')}
                    </button>
                  </div>

                </div>
              </div>
              </>
            )}
          </div>
        )}

        {/* APPOINTMENTS TAB */}
        {activeTab === 'appointments' && (
          <div className="tab-content active" style={{ animation: 'slideUp 0.4s ease-out' }}>
            
            {/* Header: Title + Button Group */}
            <div className="dashboard-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
              <h2 style={{ fontSize: '18px', fontWeight: 800, color: '#1A1D23' }}>Appointments</h2>
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <button 
                  className="btn btn-primary" 
                  style={{ display: 'flex', alignItems: 'center', gap: '4px', height: '20px', padding: '0 16px', borderRadius: '2px', fontWeight: 700, fontSize: '11px' }} 
                  onClick={() => switchTab('registration-form')}
                >
                  <i data-lucide="plus" style={{ width: '16px', height: '16px' }}></i> Create Appointment
                </button>
                <button 
                  className="btn" 
                  style={{ 
                    width: '38px', 
                    height: '20px', 
                    padding: 0,
                    borderRadius: '2px', 
                    background: showDateFilter ? '#2563EB' : '#EFF6FF', 
                    color: showDateFilter ? '#FFFFFF' : '#2563EB', 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'center',
                    border: 'none',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease'
                  }}
                  onClick={() => {
                    setShowDateFilter(!showDateFilter);
                    setTimeout(() => window.lucide && window.lucide.createIcons(), 100);
                  }}
                  title="Filter appointments by date"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="18" x="3" y="4" rx="2" ry="2"/><line x1="16" x2="16" y1="2" y2="6"/><line x1="8" x2="8" y1="2" y2="6"/><line x1="3" x2="21" y1="10" y2="10"/></svg>
                </button>
              </div>
            </div>

            {/* Sliding Date Range Filter Panel */}
            {showDateFilter && (
              <div className="glass-card" style={{ padding: '4px', marginBottom: '4px', animation: 'slideDown 0.3s ease-out', border: '1px solid #BFDBFE', background: '#F8FAFC' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                  <h4 style={{ fontSize: '10px', fontWeight: 800, color: '#1E293B', margin: 0, display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <i data-lucide="calendar-days" style={{ width: '18px', color: 'var(--primary)' }}></i> Select Appointment Date Range
                  </h4>
                  {(startDate || endDate) && (
                    <button 
                      className="btn" 
                      style={{ fontSize: '10px', padding: '4px 10px', background: 'transparent', color: '#EF4444', fontWeight: 700, border: 'none', cursor: 'pointer' }}
                      onClick={() => { setStartDate(''); setEndDate(''); }}
                    >
                      Clear Filter
                    </button>
                  )}
                </div>

                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
                  <div className="form-group" style={{ margin: 0, flex: 1, minWidth: '180px' }}>
                    <label style={{ fontSize: '10px', fontWeight: 800, color: '#64748B', marginBottom: '2px', display: 'block', textTransform: 'uppercase' }}>From Date</label>
                    <input 
                      type="date" 
                      className="form-control" 
                      style={{ height: '40px', borderRadius: '2px', border: '1px solid #CBD5E1', padding: '0 12px' }} 
                      value={startDate} 
                      onChange={e => setStartDate(e.target.value)} 
                    />
                  </div>
                  <div className="form-group" style={{ margin: 0, flex: 1, minWidth: '180px' }}>
                    <label style={{ fontSize: '10px', fontWeight: 800, color: '#64748B', marginBottom: '2px', display: 'block', textTransform: 'uppercase' }}>To Date</label>
                    <input 
                      type="date" 
                      className="form-control" 
                      style={{ height: '40px', borderRadius: '2px', border: '1px solid #CBD5E1', padding: '0 12px' }} 
                      value={endDate} 
                      onChange={e => setEndDate(e.target.value)} 
                    />
                  </div>

                  {/* Preset Shortcuts */}
                  <div style={{ display: 'flex', gap: '4px' }}>
                    <button 
                      className="btn btn-secondary" 
                      style={{ height: '40px', fontSize: '10px', fontWeight: 700, padding: '0 16px', borderRadius: '2px', border: '1px solid #E2E8F0', background: 'white' }} 
                      onClick={() => {
                        const todayStr = new Date().toISOString().split('T')[0];
                        setStartDate(todayStr);
                        setEndDate(todayStr);
                      }}
                    >
                      Today
                    </button>
                    <button 
                      className="btn btn-secondary" 
                      style={{ height: '40px', fontSize: '10px', fontWeight: 700, padding: '0 16px', borderRadius: '2px', border: '1px solid #E2E8F0', background: 'white' }} 
                      onClick={() => {
                        const today = new Date();
                        const past7 = new Date();
                        past7.setDate(today.getDate() - 7);
                        setStartDate(past7.toISOString().split('T')[0]);
                        setEndDate(today.toISOString().split('T')[0]);
                      }}
                    >
                      Last 7 Days
                    </button>
                    <button 
                      className="btn btn-secondary" 
                      style={{ height: '40px', fontSize: '10px', fontWeight: 700, padding: '0 16px', borderRadius: '2px', border: '1px solid #E2E8F0', background: 'white' }} 
                      onClick={() => {
                        const today = new Date();
                        const past30 = new Date();
                        past30.setDate(today.getDate() - 30);
                        setStartDate(past30.toISOString().split('T')[0]);
                        setEndDate(today.toISOString().split('T')[0]);
                      }}
                    >
                      Last 30 Days
                    </button>
                  </div>
                </div>

                {/* Filter matches info */}
                <div style={{ marginTop: '14px', fontSize: '10px', color: '#475569', fontWeight: 600 }}>
                  Found <span style={{ color: 'var(--primary)', fontWeight: 800 }}>{getFilteredAppointments().length}</span> matching appointments.
                </div>
              </div>
            )}

            {(() => {
              const unifiedList = getUnifiedAppointmentsList();
              const counts = { All: unifiedList.length, Appointment: 0, 'Lab Test': 0, 'Clinical Service': 0 };
              unifiedList.forEach(item => {
                if (counts[item.type] !== undefined) counts[item.type]++;
              });
              const pendingReqCount = unifiedList.filter(item => item.status === 'Pending Approval' || item.status === 'Pending' || item.rawItem?.status === 'Pending Approval' || item.rawItem?.status === 'Pending').length;

              return (
                <div style={{ display: 'flex', gap: '10px', marginBottom: '4px', flexWrap: 'wrap' }}>
                  {[
                    { key: 'All', label: 'All Bookings', count: counts.All, color: '#3B82F6', bg: '#EFF6FF' },
                    { key: 'Pending Approval', label: 'Online Requests (Pending)', count: pendingReqCount, color: '#EA580C', bg: '#FFF7ED' },
                    { key: 'Appointment', label: 'Appointments (OPD)', count: counts.Appointment, color: '#2563EB', bg: '#EFF6FF' },
                    { key: 'Lab Test', label: 'Lab Tests', count: counts['Lab Test'], color: '#10B981', bg: '#ECFDF5' },
                    { key: 'Clinical Service', label: 'Clinical Services', count: counts['Clinical Service'], color: '#8B5CF6', bg: '#F5F3FF' }
                  ].map(pill => (
                    <button
                      key={pill.key}
                      onClick={() => setApptTypeFilter(pill.key)}
                      style={{
                        padding: '8px 16px',
                        borderRadius: '20px',
                        fontWeight: 700,
                        fontSize: '13px',
                        cursor: 'pointer',
                        border: apptTypeFilter === pill.key ? `2px solid ${pill.color}` : '1.5px solid #E2E8F0',
                        background: apptTypeFilter === pill.key ? pill.bg : 'white',
                        color: apptTypeFilter === pill.key ? pill.color : '#64748B',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        transition: 'all 0.2s'
                      }}
                    >
                      {pill.label}
                      <span style={{ fontSize: '11px', background: apptTypeFilter === pill.key ? 'rgba(255,255,255,0.7)' : '#F1F5F9', padding: '2px 6px', borderRadius: '2px', color: apptTypeFilter === pill.key ? pill.color : '#64748B' }}>
                        {pill.count}
                      </span>
                    </button>
                  ))}
                </div>
              );
            })()}

            <div style={{ display: 'flex', gap: '8px', marginBottom: '20px', alignItems: 'center' }}>
              <div style={{ flex: 1, position: 'relative', display: 'flex', alignItems: 'center' }}>
                <i data-lucide="search" style={{ position: 'absolute', left: '16px', color: '#64748B', width: '16px' }}></i>
                <input 
                  type="text" 
                  placeholder="Search appointments by patient name, doctor, test or service..." 
                  style={{ background: 'white', border: '1px solid #CBD5E1', paddingLeft: '44px', height: '42px', width: '100%', borderRadius: '2px', fontSize: '13px', fontWeight: 600, outline: 'none', boxShadow: '0 2px 4px rgba(0,0,0,0.02)' }}
                  value={appointmentSearch}
                  onChange={(e) => setAppointmentSearch(e.target.value)}
                />
              </div>
            </div>

            <div className="glass-card" style={{ padding: '12px' }}>
              <div className="table-responsive">
                <table className="elite-table" style={{ margin: 0 }}>
                  <thead style={{ background: '#F8FAFC' }}>
                    <tr>
                      <th>Patient</th>
                      <th>Type</th>
                      <th>Doctor / Detail</th>
                      <th>Time</th>
                      <th>Status</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(() => {
                      const renderedIds = new Set();
                      const filteredList = getFilteredAppointments();

                      return filteredList.map(app => {
                        if (renderedIds.has(app.id)) return null;

                        // For non-appointments (Lab tests, Clinical services), render normally
                        if (app.type !== 'Appointment') {
                          renderedIds.add(app.id);
                          return (
                            <tr key={app.id}>
                              <td>
                                <div 
                                  style={{ display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer' }}
                                  onClick={() => app.patientId && handleOpenPatientProfile(typeof app.patientId === 'object' ? app.patientId : { _id: app.patientId, name: app.patientName })}
                                  onMouseEnter={(e) => { e.currentTarget.querySelector('.patient-name-span').style.color = '#2563EB'; }}
                                  onMouseLeave={(e) => { e.currentTarget.querySelector('.patient-name-span').style.color = '#1A1D23'; }}
                                >
                                  <div style={{ width: '32px', height: '22px', borderRadius: '50%', background: 'var(--primary-light)', color: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: '12px' }}>
                                    {getInitials(app.patientName)}
                                  </div>
                                  <span className="patient-name-span" style={{ fontWeight: 700, color: '#1A1D23', transition: 'color 0.2s' }}>{app.patientName}</span>
                                </div>
                              </td>
                              <td>
                                <span style={{
                                  padding: '4px 8px',
                                  borderRadius: '6px',
                                  fontSize: '12px',
                                  fontWeight: 700,
                                  background: app.type === 'Lab Test' ? '#ECFDF5' : '#F5F3FF',
                                  color: app.type === 'Lab Test' ? '#10B981' : '#8B5CF6',
                                  border: app.type === 'Lab Test' ? '1px solid #A7F3D0' : '1px solid #DDD6FE'
                                }}>
                                  {app.type}
                                </span>
                              </td>
                              <td style={{ fontWeight: 700, color: '#334155' }}>{app.detailName}</td>
                              <td style={{ fontWeight: 600 }}>
                                {getFormattedDate(app.date)}
                                {app.time}
                              </td>
                              <td>
                                <span className={`status-badge ${
                                  app.status === 'Completed' || app.status === 'Paid' ? 'available' : 
                                  app.status === 'Rescheduled' ? 'rescheduled' :
                                  (app.status === 'Cancelled' ? 'critical' : 'pending')
                                }`} style={app.status === 'Rescheduled' ? { background: '#E0F2FE', color: '#0369A1' } : {}}>
                                  {app.status}
                                </span>
                              </td>
                              <td>
                                <div style={{ display: 'flex', gap: '8px' }}>
                                  <button 
                                    className="btn btn-secondary" 
                                    style={{ padding: '6px 12px', fontSize: '12px' }} 
                                    onClick={() => {
                                      if (app.type === 'Lab Test') {
                                        setSelectedLabRequest({
                                          testName: app.rawItem?.testName || app.rawItem?.test || app.detailName,
                                          results: app.rawItem?.results || ''
                                        });
                                        setLabModalOpen(true);
                                      } else {
                                        showToast(`${app.type}: ${app.detailName} (${app.status})`, 'info');
                                      }
                                    }}
                                  >
                                    View Details
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        }

                        // Group all appointments for the same patient together
                        const sameDayAppts = filteredList.filter(a => 
                          a.type === 'Appointment' && 
                          String(a.patientId?._id || a.patientId) === String(app.patientId?._id || app.patientId)
                        );

                        // Mark all of these as rendered
                        sameDayAppts.forEach(a => renderedIds.add(a.id));

                        // The first one is the "primary" appointment
                        const primaryApp = sameDayAppts[0];
                        const addOnApps = sameDayAppts.slice(1);

                        return (
                          <React.Fragment key={primaryApp.id}>
                            {/* Render the Primary Appointment Row */}
                            <tr style={{ background: sameDayAppts.length > 1 ? '#FAF5FF' : 'transparent', borderBottom: sameDayAppts.length > 1 ? 'none' : '1px solid #F1F5F9' }}>
                              <td>
                                <div 
                                  style={{ display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer' }}
                                  onClick={() => primaryApp.patientId && handleOpenPatientProfile(typeof primaryApp.patientId === 'object' ? primaryApp.patientId : { _id: primaryApp.patientId, name: primaryApp.patientName })}
                                  onMouseEnter={(e) => { e.currentTarget.querySelector('.patient-name-span').style.color = '#2563EB'; }}
                                  onMouseLeave={(e) => { e.currentTarget.querySelector('.patient-name-span').style.color = '#1A1D23'; }}
                                >
                                  <div style={{ width: '32px', height: '22px', borderRadius: '50%', background: 'var(--primary-light)', color: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: '12px' }}>
                                    {getInitials(primaryApp.patientName)}
                                  </div>
                                  <div>
                                    <span className="patient-name-span" style={{ fontWeight: 700, color: '#1A1D23', transition: 'color 0.2s' }}>{primaryApp.patientName}</span>
                                    {sameDayAppts.length > 1 && (
                                      <span style={{ 
                                        marginLeft: '8px', 
                                        fontSize: '9.5px', 
                                        background: '#7C3AED', 
                                        color: '#FFFFFF', 
                                        borderRadius: '4px', 
                                        padding: '2px 6px', 
                                        fontWeight: 800,
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '3px'
                                      }}>
                                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path></svg>
                                        Multi-Visit
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </td>
                              <td>
                                <span style={{
                                  padding: '4px 8px',
                                  borderRadius: '6px',
                                  fontSize: '12px',
                                  fontWeight: 700,
                                  background: '#EFF6FF',
                                  color: '#2563EB',
                                  border: '1px solid #BFDBFE'
                                }}>
                                  {primaryApp.type}
                                </span>
                              </td>
                              <td style={{ fontWeight: 700, color: '#334155' }}>
                                {primaryApp.detailName}
                              </td>
                              <td style={{ fontWeight: 600 }}>
                                {getFormattedDate(primaryApp.date)}
                                {primaryApp.time}
                              </td>
                              <td>
                                <span className={`status-badge ${
                                  primaryApp.status === 'Completed' || primaryApp.status === 'Paid' ? 'available' : 
                                  primaryApp.status === 'Rescheduled' ? 'rescheduled' :
                                  (primaryApp.status === 'Cancelled' ? 'critical' : 'pending')
                                }`} style={primaryApp.status === 'Rescheduled' ? { background: '#E0F2FE', color: '#0369A1' } : {}}>
                                  {primaryApp.status}
                                </span>
                              </td>
                              <td>
                                <div style={{ display: 'flex', gap: '8px' }}>
                                  <button 
                                    className="btn btn-secondary" 
                                    style={{ padding: '6px 12px', fontSize: '12px' }} 
                                    onClick={() => openDetailsModal(primaryApp.rawItem)}
                                  >
                                    View Details
                                  </button>
                                  {primaryApp.type === 'Appointment' && (primaryApp.status === 'Pending Approval' || (primaryApp.rawItem?.source === 'Online' && primaryApp.status === 'Pending')) && (
                                    <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                                      <button
                                        className="btn btn-success"
                                        style={{ padding: '6px 12px', fontSize: '12px', background: '#10B981', borderColor: '#10B981', color: 'white', display: 'flex', alignItems: 'center', gap: '4px', borderRadius: '6px', fontWeight: 700, cursor: 'pointer' }}
                                        onClick={async () => {
                                          try {
                                            const res = await api.put('/appointments/' + primaryApp.rawItem._id + '/approve');
                                            showToast('Appointment Approved! Payment request generated (with 1-time Reg Fee if applicable).', 'success');
                                            fetchData();
                                          } catch(e) {
                                            showToast(e.response?.data?.error || 'Failed to approve', 'error');
                                          }
                                        }}
                                      >
                                        Approve & Request Payment
                                      </button>
                                      <button
                                        className="btn btn-danger"
                                        style={{ padding: '6px 12px', fontSize: '12px', background: '#EF4444', borderColor: '#EF4444', color: 'white', display: 'flex', alignItems: 'center', gap: '4px', borderRadius: '6px', fontWeight: 700, cursor: 'pointer' }}
                                        onClick={async () => {
                                          try {
                                            await api.put('/appointments/' + primaryApp.rawItem._id + '/reject');
                                            showToast('Appointment request rejected', 'info');
                                            fetchData();
                                          } catch(e) {
                                            showToast(e.response?.data?.error || 'Failed to reject', 'error');
                                          }
                                        }}
                                      >
                                        Reject
                                      </button>
                                    </div>
                                  )}
                                  {primaryApp.type === 'Appointment' && (primaryApp.status === 'Scheduled' || primaryApp.status === 'Paid' || primaryApp.status === 'Confirmed') && (
                                    <button
                                      className="btn btn-primary"
                                      style={{ padding: '6px 12px', fontSize: '12px', background: '#8B5CF6', borderColor: '#8B5CF6', display: 'flex', alignItems: 'center', gap: '4px' }}
                                      onClick={() => {
                                        const patientData = typeof primaryApp.patientId === 'object' ? primaryApp.patientId : null;
                                        if (patientData) {
                                          setSelectedPatient(patientData);
                                          setAddOnOriginAppt(primaryApp.rawItem);
                                          setFormData({
                                            name: patientData.name || '',
                                            age: patientData.age || '',
                                            gender: patientData.gender || '',
                                            contact: patientData.contact || '',
                                            email: patientData.email || '',
                                            bloodGroup: patientData.bloodGroup || 'O+',
                                            address: patientData.address || '',
                                            medicalHistory: patientData.medicalHistory ? (Array.isArray(patientData.medicalHistory) ? patientData.medicalHistory.join(', ') : patientData.medicalHistory) : '',
                                            doctorId: ''
                                          });
                                          setIsExistingPatient(true);
                                          switchTab('registration-form', true);
                                          showToast(`Adding-on appointment for ${patientData.name}. Choose a doctor and slot.`, 'success');
                                        } else {
                                          showToast("Patient details not found.", "error");
                                        }
                                      }}
                                    >
                                      <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                                      Add-On
                                    </button>
                                  )}
                                </div>
                              </td>
                            </tr>

                            {/* Render any Add-On Appointment Sub-Rows */}
                            {addOnApps.map((addOn, subIdx) => (
                              <tr 
                                key={addOn.id} 
                                style={{ 
                                  background: '#FAF5FF', 
                                  borderBottom: subIdx === addOnApps.length - 1 ? '1px solid #F1F5F9' : 'none' 
                                }}
                              >
                                <td style={{ paddingLeft: '24px' }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#7C3AED', fontSize: '12px', fontWeight: 700 }}>
                                    <span style={{ fontSize: '14px', color: '#A78BFA' }}>↳</span>
                                    <span>Add-On Visit</span>
                                  </div>
                                </td>
                                <td>
                                  <span style={{
                                    padding: '2px 6px',
                                    borderRadius: '4px',
                                    fontSize: '10.5px',
                                    fontWeight: 700,
                                    background: '#F5F3FF',
                                    color: '#7C3AED',
                                    border: '1px solid #DDD6FE'
                                  }}>
                                    Add-On appt
                                  </span>
                                </td>
                                <td style={{ fontWeight: 700, color: '#4F46E5', fontSize: '13px' }}>
                                  {addOn.detailName}
                                </td>
                                <td style={{ fontWeight: 600, fontSize: '12.5px' }}>
                                  {getFormattedDate(addOn.date)}
                                  {addOn.time}
                                </td>
                                <td>
                                  <span className={`status-badge ${
                                    addOn.status === 'Completed' || addOn.status === 'Paid' ? 'available' : 
                                    addOn.status === 'Rescheduled' ? 'rescheduled' :
                                    (addOn.status === 'Cancelled' ? 'critical' : 'pending')
                                  }`} style={{ fontSize: '11px', padding: '3px 8px' }}>
                                    {addOn.status}
                                  </span>
                                </td>
                                <td>
                                  <div style={{ display: 'flex', gap: '8px' }}>
                                    <button 
                                      className="btn btn-secondary" 
                                      style={{ padding: '4px 10px', fontSize: '11px' }} 
                                      onClick={() => openDetailsModal(addOn.rawItem)}
                                    >
                                      View Details
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </React.Fragment>
                        );
                      });
                    })()}
                    {getFilteredAppointments().length === 0 && (
                      <tr>
                        <td colSpan="6" style={{ textAlign: 'center', padding: '40px', color: '#64748B', fontWeight: 600 }}>
                          {appointmentSearch.trim() ? `No matches found matching "${appointmentSearch}"` : "No bookings found for the selected type / date range."}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* STAFF TAB */}
        {activeTab === 'staff' && (
            <div className="tab-content active" style={{ animation: 'slideUp 0.4s ease-out' }}>
              <div className="dashboard-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                  <h2 style={{ fontSize: '24px', fontWeight: 800, color: '#1A1D23' }}>Staff Management</h2>
              </div>
              <div style={{ display: 'flex', gap: '8px', marginBottom: '20px', alignItems: 'center' }}>
                <div style={{ flex: 1, position: 'relative', display: 'flex', alignItems: 'center' }}>
                  <i data-lucide="search" style={{ position: 'absolute', left: '16px', color: '#64748B', width: '16px' }}></i>
                  <input 
                    type="text" 
                    placeholder="Search staff by name, role, or ID..." 
                    style={{ background: 'white', border: '1px solid #CBD5E1', paddingLeft: '44px', height: '42px', width: '100%', borderRadius: '2px', fontSize: '13px', fontWeight: 600, outline: 'none', boxShadow: '0 2px 4px rgba(0,0,0,0.02)' }}
                    value={staffSearch}
                    onChange={(e) => setStaffSearch(e.target.value)}
                  />
                </div>
              </div>

              <div className="glass-card" style={{ padding: '12px' }}>
                  <div className="table-responsive">
                    <table className="elite-table" style={{ margin: 0 }}>
                        <thead style={{ background: '#F8FAFC' }}>
                            <tr>
                                <th>Staff Name</th>
                                <th>Role</th>
                                <th>Contact</th>
                                <th>Status</th>
                            </tr>
                        </thead>
                        <tbody>
                            {(() => {
                                const query = staffSearch.toLowerCase().trim();
                                const daysOfWeek = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
                                const todayDayName = daysOfWeek[new Date().getDay()];

                                const filtered = doctors.filter(doc => 
                                    !query || 
                                    (doc.name || '').toLowerCase().includes(query) || 
                                    (doc.specialty || '').toLowerCase().includes(query) ||
                                    (doc.staff_id || '').toLowerCase().includes(query)
                                );
                                
                                if (filtered.length === 0) {
                                    return (
                                        <tr>
                                            <td colSpan="4" style={{ textAlign: 'center', padding: '40px', color: '#64748B', fontWeight: 600 }}>
                                                No staff members found matching "{staffSearch}"
                                            </td>
                                        </tr>
                                    );
                                }
                                
                                return filtered.map(doc => {
                                    let isWeeklyOffToday = false;
                                    if (doc.weeklyOff) {
                                        if (Array.isArray(doc.weeklyOff)) {
                                            isWeeklyOffToday = doc.weeklyOff.some(d => String(d).trim().toLowerCase() === todayDayName.toLowerCase());
                                        } else if (typeof doc.weeklyOff === 'string') {
                                            isWeeklyOffToday = doc.weeklyOff.split(',').map(d => d.trim().toLowerCase()).includes(todayDayName.toLowerCase());
                                        }
                                    }

                                    return (
                                        <tr key={doc._id || doc.id}>
                                            <td>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                                    <div style={{ width: '32px', height: '22px', borderRadius: '50%', background: 'var(--primary-light)', color: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: '12px' }}>
                                                      {getInitials(doc.name || 'Staff')}
                                                    </div>
                                                    <span style={{ fontWeight: 700, color: '#1A1D23' }}>{doc.name || 'Unnamed Staff'}</span>
                                                </div>
                                            </td>
                                            <td style={{ fontWeight: 600 }}>{doc.specialty || ''}</td>
                                            <td>
                                                <div style={{ fontSize: '13px', fontWeight: 700 }}>ID: {doc.staff_id || 'N/A'}</div>
                                                <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600 }}>{doc.name ? `${doc.name.split(' ')[0].toLowerCase()}@curoxa.com` : 'Contact Required'}</div>
                                            </td>
                                            <td>
                                                <span className={`status-badge ${isWeeklyOffToday ? 'cancelled' : 'available'}`}>
                                                    {isWeeklyOffToday ? 'Weekly Off' : 'Available'}
                                                </span>
                                            </td>
                                        </tr>
                                    );
                                });
                            })()}
                        </tbody>
                    </table>
                  </div>
              </div>
            </div>
        )}

        {/* BILLING TAB */}
        {activeTab === 'billing' && (
            <div className="tab-content active" style={{ animation: 'slideUp 0.4s ease-out' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                  <h2 style={{ fontSize: '24px', fontWeight: 800, color: '#1A1D23' }}>Finance & Billing</h2>
                  <button className="btn btn-primary" onClick={handleExportBillingCSV}><i data-lucide="download"></i> Export Report</button>
              </div>
              <div className="ph-kpi-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)', marginBottom: '12px' }}>
                  <div className="kpi-card semantic-card-info" style={{ padding: '12px' }}>
                      <div className="kpi-icon-box" style={{ background: '#F0FDF4', color: '#10B981' }}><i data-lucide="trending-up"></i></div>
                      <div>
                        <div style={{ fontSize: '11px', color: '#64748B', fontWeight: 800 }}>TOTAL REVENUE</div>
                        <div style={{ fontSize: '24px', fontWeight: 900 }}>₹{bills.filter(b => b.status === 'Paid').reduce((sum, b) => sum + (b.totalAmount || 0), 0).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</div>
                      </div>
                  </div>
                  <div className="kpi-card semantic-card-warning" style={{ padding: '12px' }}>
                      <div className="kpi-icon-box" style={{ background: '#FFFBEB', color: '#F59E0B' }}><i data-lucide="clock"></i></div>
                      <div>
                        <div style={{ fontSize: '11px', color: '#64748B', fontWeight: 800 }}>PENDING PAYMENTS</div>
                        <div style={{ fontSize: '24px', fontWeight: 900 }}>₹{bills.filter(b => b.status === 'Unpaid' || !b.status).reduce((sum, b) => sum + (b.totalAmount || 0), 0).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</div>
                      </div>
                  </div>
                  <div className="kpi-card semantic-card-info" style={{ padding: '12px' }}>
                      <div className="kpi-icon-box" style={{ background: '#EEF2FF', color: '#6366F1' }}><i data-lucide="credit-card"></i></div>
                      <div>
                        <div style={{ fontSize: '11px', color: '#64748B', fontWeight: 800 }}>TRANSACTIONS TODAY</div>
                        <div style={{ fontSize: '24px', fontWeight: 900 }}>{bills.filter(b => new Date(b.createdAt).toDateString() === new Date().toDateString()).length}</div>
                      </div>
                  </div>
              </div>
              <div style={{ display: 'flex', gap: '8px', marginBottom: '20px', alignItems: 'center' }}>
                <div style={{ flex: 1, position: 'relative', display: 'flex', alignItems: 'center' }}>
                  <i data-lucide="search" style={{ position: 'absolute', left: '16px', color: '#64748B', width: '16px' }}></i>
                  <input 
                    type="text" 
                    placeholder="Search invoices by patient name, Invoice ID, or status..." 
                    style={{ background: 'white', border: '1px solid #CBD5E1', paddingLeft: '44px', height: '42px', width: '100%', borderRadius: '2px', fontSize: '13px', fontWeight: 600, outline: 'none', boxShadow: '0 2px 4px rgba(0,0,0,0.02)' }}
                    value={billingSearch}
                    onChange={(e) => setBillingSearch(e.target.value)}
                  />
                </div>
              </div>

              <div className="glass-card" style={{ padding: '12px' }}>
                  <div className="table-responsive">
                    <table className="elite-table" style={{ margin: 0 }}>
                        <thead style={{ background: '#F8FAFC' }}>
                            <tr>
                                <th>Invoice ID</th>
                                <th>Patient Name</th>
                                <th>Date</th>
                                <th>Amount</th>
                                <th>Status</th>
                                <th>Action</th>
                            </tr>
                        </thead>
                        <tbody>
                            {(() => {
                                const query = billingSearch.toLowerCase().trim();
                                const filtered = bills.filter(b => {
                                    if (!query) return true;
                                    const invId = `#INV-${(b._id || '').substring(Math.max(0, (b._id || '').length - 6)).toUpperCase() || 'N/A'}`;
                                    return (b.patientId?.name || '').toLowerCase().includes(query) || 
                                           invId.toLowerCase().includes(query) || 
                                           (b.status || 'Unpaid').toLowerCase().includes(query);
                                });

                                const sorted = [...filtered].sort((a, b) => {
                                    const aPaid = (a.status || 'Unpaid') === 'Paid';
                                    const bPaid = (b.status || 'Unpaid') === 'Paid';
                                    if (aPaid && !bPaid) return 1;
                                    if (!aPaid && bPaid) return -1;
                                    return new Date(b.createdAt || b.date) - new Date(a.createdAt || a.date);
                                });
                                
                                if (sorted.length === 0) {
                                    return (
                                        <tr>
                                            <td colSpan="6" style={{ textAlign: 'center', padding: '32px', color: '#94A3B8', fontWeight: 600 }}>
                                                {billingSearch.trim() ? `No billing records found matching "${billingSearch}"` : "No transactions found"}
                                            </td>
                                        </tr>
                                    );
                                }
                                
                                return sorted.map((bill, idx) => (
                                    <tr key={bill._id || idx}>
                                        <td style={{ fontWeight: 700, color: 'var(--primary)' }}>#INV-{(bill._id || '').substring(Math.max(0, (bill._id || '').length - 6)).toUpperCase() || 'N/A'}</td>
                                        <td style={{ fontWeight: 600 }}>{bill.patientId?.name || 'Unknown Patient'}</td>
                                        <td>{new Date(bill.createdAt || bill.date).toLocaleDateString([], { day: '2-digit', month: 'short', year: 'numeric' })}</td>
                                        <td style={{ fontWeight: 800 }}>
                                            <div>₹{(bill.totalAmount || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                                            {bill.discountPercent > 0 && (
                                                <div style={{ fontSize: '10px', color: '#EF4444', fontWeight: 700, marginTop: '2px' }}>
                                                    ({bill.discountPercent}% off of ₹{(bill.originalAmount || (bill.totalAmount + bill.discountAmount)).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })})
                                                </div>
                                            )}
                                        </td>
                                        <td><span className={`status-badge ${bill.status === 'Paid' ? 'available' : 'pending'}`}>{bill.status || 'Unpaid'}</span></td>
                                        <td>
                                            {bill.status !== 'Paid' ? (
                                                <button 
                                                    className="btn btn-primary" 
                                                    style={{ padding: '6px 12px', fontSize: '11px', fontWeight: 800, background: 'var(--primary-gradient)', border: 'none', borderRadius: '6px' }}
                                                    onClick={() => {
                                                      setSelectedBillForPayment(bill);
                                                      setDiscountPercent(0);
                                                      setDiscountReason('');
                                                      setPaymentMethod('Cash');
                                                      setShowPaymentModal(true);
                                                    }}
                                                >
                                                    Mark as Paid
                                                </button>
                                            ) : (
                                                <span style={{ fontSize: '12px', color: '#16A34A', fontWeight: 800 }}>Settled</span>
                                            )}
                                        </td>
                                    </tr>
                                ));
                            })()}
                        </tbody>
                    </table>
                  </div>
              </div>
            </div>
        )}

        {/* PROFILE TAB */}
        {activeTab === 'profile' && (
          <div className="tab-content active" style={{ animation: 'slideUp 0.4s ease-out' }}>
            <div className="dashboard-header" style={{ marginBottom: '16px' }}>
              <h2 style={{ fontSize: '24px', fontWeight: 800, color: '#1A1D23' }}>My Profile</h2>
              <p style={{ color: '#64748B', fontWeight: 600 }}>Manage your personal information and security</p>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '350px 1fr', gap: '32px' }} className="mobile-stack">
              <div className="glass-card" style={{ padding: '32px', textAlign: 'center' }}>
                <div style={{ position: 'relative', width: '120px', height: '120px', margin: '0 auto 24px' }}>
                  <img src="https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&q=80&w=200" style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover', border: '4px solid var(--primary-light)' }} alt="Profile" />
                  <div style={{ position: 'absolute', bottom: '0', right: '0', width: '36px', height: '36px', background: 'var(--primary)', color: 'white', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '3px solid white', cursor: 'pointer' }}>
                    <i data-lucide="camera" style={{ width: '16px' }}></i>
                  </div>
                </div>
                <h3 style={{ fontSize: '20px', fontWeight: 900, color: '#1A1D23', marginBottom: '4px' }}>{user.name || 'Roshni Singh'}</h3>
                <p style={{ fontSize: '12px', color: '#64748B', fontWeight: 700, marginBottom: '12px' }}>Senior Receptionist</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', textAlign: 'left' }}>
                  <div style={{ padding: '12px', background: '#F8FAFC', borderRadius: '4px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <i data-lucide="mail" style={{ width: '18px', color: 'var(--primary)' }}></i>
                    <span style={{ fontSize: '13px', fontWeight: 600 }}>{user.email || 'roshni@curoxa.com'}</span>
                  </div>
                  <div style={{ padding: '12px', background: '#F8FAFC', borderRadius: '4px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <i data-lucide="phone" style={{ width: '18px', color: 'var(--primary)' }}></i>
                    <span style={{ fontSize: '13px', fontWeight: 600 }}>+91 98765 43210</span>
                  </div>
                </div>
                <button className="btn btn-secondary" style={{ width: '100%', marginTop: '32px', justifyContent: 'center', color: 'var(--danger)', border: '1px solid #FEE2E2' }} onClick={handleLogout}>
                  <i data-lucide="log-out"></i> Logout
                </button>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div className="glass-card" style={{ padding: '32px' }}>
                  <h3 style={{ fontSize: '14px', fontWeight: 800, marginBottom: '12px' }}>Edit Profile</h3>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '12px' }}>
                    <div className="form-group">
                      <label>Full Name</label>
                      <input type="text" className="form-control" defaultValue={user.name || 'Roshni Singh'} style={{ height: '48px' }} />
                    </div>
                    <div className="form-group">
                      <label>Email Address</label>
                      <input type="email" className="form-control" defaultValue={user.email || 'roshni@curoxa.com'} style={{ height: '48px' }} />
                    </div>
                    <div className="form-group">
                      <label>Mobile Number</label>
                      <input type="text" className="form-control" defaultValue="+91 98765 43210" style={{ height: '48px' }} />
                    </div>
                    <div className="form-group">
                      <label>Employee ID</label>
                      <input type="text" className="form-control" defaultValue="MED-RE-099" readOnly style={{ height: '48px', background: '#F8FAFC' }} />
                    </div>
                  </div>
                  <button className="btn btn-primary" style={{ padding: '0 32px', height: '48px' }}>Save Changes</button>
                </div>

                <div className="glass-card" style={{ padding: '32px' }}>
                  <h3 style={{ fontSize: '14px', fontWeight: 800, marginBottom: '12px' }}>Change Password</h3>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '20px', marginBottom: '12px' }}>
                    <div className="form-group">
                      <label>Current Password</label>
                      <input type="password" className="form-control" placeholder="********" style={{ height: '48px' }} />
                    </div>
                    <div className="form-group">
                      <label>New Password</label>
                      <input type="password" className="form-control" placeholder="New Password" style={{ height: '48px' }} pattern="(?=.*\d)(?=.*[a-z])(?=.*[A-Z])(?=.*[!@#$%^&*]).{8,}" title="Must contain at least one number and one uppercase and lowercase letter, one special character, and at least 8 or more characters." required />
                    </div>
                    <div className="form-group">
                      <label>Confirm Password</label>
                      <input type="password" className="form-control" placeholder="Confirm Password" style={{ height: '48px' }} pattern="(?=.*\d)(?=.*[a-z])(?=.*[A-Z])(?=.*[!@#$%^&*]).{8,}" title="Must contain at least one number and one uppercase and lowercase letter, one special character, and at least 8 or more characters." required />
                    </div>
                  </div>
                  <button className="btn btn-primary" style={{ padding: '0 32px', height: '48px' }}>Update Password</button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* SETTINGS TAB */}
        {activeTab === 'settings' && (
          <div className="tab-content active" style={{ animation: 'slideUp 0.4s ease-out' }}>
            <div className="dashboard-header" style={{ marginBottom: '16px' }}>
              <h2 style={{ fontSize: '24px', fontWeight: 800, color: '#1A1D23' }}>System Settings</h2>
              <p style={{ color: '#64748B', fontWeight: 600 }}>Configure your workspace and preferences</p>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '12px' }}>
              <div className="glass-card" style={{ padding: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                  <div style={{ width: '40px', height: '40px', background: '#EFF6FF', color: 'var(--primary)', borderRadius: '2px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><i data-lucide="bell" style={{ width: '20px' }}></i></div>
                  <h3 style={{ fontSize: '14px', fontWeight: 800 }}>Notifications</h3>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div><div style={{ fontSize: '12px', fontWeight: 700 }}>Email Alerts</div><div style={{ fontSize: '12px', color: '#64748B' }}>Receive daily summaries</div></div>
                    <input type="checkbox" defaultChecked />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div><div style={{ fontSize: '12px', fontWeight: 700 }}>Push Notifications</div><div style={{ fontSize: '12px', color: '#64748B' }}>Instant app alerts</div></div>
                    <input type="checkbox" defaultChecked />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div><div style={{ fontSize: '12px', fontWeight: 700 }}>SMS Updates</div><div style={{ fontSize: '12px', color: '#64748B' }}>Patient appointment reminders</div></div>
                    <input type="checkbox" />
                  </div>
                </div>
              </div>

              <div className="glass-card" style={{ padding: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                  <div style={{ width: '40px', height: '40px', background: '#F0FDF4', color: '#10B981', borderRadius: '2px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><i data-lucide="shield" style={{ width: '20px' }}></i></div>
                  <h3 style={{ fontSize: '14px', fontWeight: 800 }}>Privacy & Security</h3>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div><div style={{ fontSize: '12px', fontWeight: 700 }}>Two-Factor Auth</div><div style={{ fontSize: '12px', color: '#64748B' }}>Extra layer of security</div></div>
                    <button className="btn btn-secondary" style={{ fontSize: '11px', padding: '6px 12px' }}>Enable</button>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div><div style={{ fontSize: '12px', fontWeight: 700 }}>Active Sessions</div><div style={{ fontSize: '12px', color: '#64748B' }}>Manage logged-in devices</div></div>
                    <button className="btn btn-secondary" style={{ fontSize: '11px', padding: '6px 12px' }}>View</button>
                  </div>
                </div>
              </div>

              <div className="glass-card" style={{ padding: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                  <div style={{ width: '40px', height: '40px', background: '#FFFBEB', color: '#F59E0B', borderRadius: '2px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><i data-lucide="palette" style={{ width: '20px' }}></i></div>
                  <h3 style={{ fontSize: '14px', fontWeight: 800 }}>Appearance</h3>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div><div style={{ fontSize: '12px', fontWeight: 700 }}>Dark Mode</div><div style={{ fontSize: '12px', color: '#64748B' }}>Toggle system theme</div></div>
                    <button className="btn btn-secondary" style={{ fontSize: '11px', padding: '6px 12px' }}>Enable</button>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div><div style={{ fontSize: '12px', fontWeight: 700 }}>Compact View</div><div style={{ fontSize: '12px', color: '#64748B' }}>Higher density layout</div></div>
                    <input type="checkbox" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* UTILITY REQUESTS TAB */}
        {activeTab === 'indent' && (() => {
          const filtered = indents
            .filter(ind => {
              const matchesSearch = 
                (ind.indentId || '').toLowerCase().includes(indentSearch.toLowerCase()) ||
                (ind.status || '').toLowerCase().includes(indentSearch.toLowerCase()) ||
                (ind.items || []).some(item => (item.name || '').toLowerCase().includes(indentSearch.toLowerCase()));
              return matchesSearch;
            })
            .sort((a, b) => {
              if (indentSort === 'newest') return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
              if (indentSort === 'oldest') return new Date(a.createdAt || 0) - new Date(b.createdAt || 0);
              if (indentSort === 'priority') {
                const pA = a.priority === 'Urgent' ? 1 : 0;
                const pB = b.priority === 'Urgent' ? 1 : 0;
                return pB - pA;
              }
              return 0;
            });
          const totalPages = Math.ceil(filtered.length / INDENT_PAGE_SIZE) || 1;
          const paginated = filtered.slice((indentPage - 1) * INDENT_PAGE_SIZE, indentPage * INDENT_PAGE_SIZE);

          const statusStyle = (s) => {
            switch (s) {
              case 'Pending': return { background: '#FEF3C7', color: '#D97706', padding: '4px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 800 };
              case 'Approved': return { background: '#EFF6FF', color: '#2563EB', padding: '4px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 800 };
              case 'Awaiting Stock': return { background: '#FEF2F2', color: '#DC2626', padding: '4px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 800 };
              case 'Partially Fulfilled': return { background: '#FFF3E0', color: '#E65100', padding: '4px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 800 };
              case 'Fulfilled':
              case 'Received': return { background: '#D1FAE5', color: '#065F46', padding: '4px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 800 };
              case 'Rejected':
              case 'Cannot Fulfill': return { background: '#FEE2E2', color: '#991B1B', padding: '4px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 800 };
              default: return { background: '#F1F5F9', color: '#64748B', padding: '4px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 800 };
            }
          };

          const rowBg = (s) => {
            if (s === 'Pending') return 'rgba(254, 243, 199, 0.15)';
            if (s === 'Approved') return 'rgba(239, 246, 255, 0.25)';
            if (s === 'Awaiting Stock') return 'rgba(254, 242, 242, 0.25)';
            if (s === 'Partially Fulfilled') return 'rgba(255, 243, 224, 0.2)';
            if (s === 'Fulfilled' || s === 'Received') return 'rgba(209, 250, 229, 0.15)';
            if (s === 'Rejected' || s === 'Cannot Fulfill') return 'rgba(254, 226, 226, 0.2)';
            return 'transparent';
          };

          const avatarColors = ['#EFF6FF','#F0FDF4','#FDF2F8','#FFF7ED','#F5F3FF','#ECFDF5'];
          const avatarText  = ['#2563EB','#16A34A','#DB2777','#EA580C','#7C3AED','#059669'];

          return (
            <div className="tab-content active" style={{ animation: 'slideUp 0.4s ease-out' }}>

              {/* Header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '28px' }}>
                <div>
                  <h1 style={{ fontSize: '24px', fontWeight: 900, color: '#0F172A', margin: '0 0 4px 0' }}>Utility Requests &amp; Tracking</h1>
                  <div style={{ fontSize: '13px', color: '#94A3B8', fontWeight: 600 }}>
                    <span style={{ color: '#64748B' }}>Home</span>
                    <span style={{ margin: '0 6px', color: '#CBD5E1' }}>»</span>
                    <span>Utility Requests</span>
                  </div>
                </div>
                <button
                  onClick={() => switchTab('new-indent')}
                  style={{ display: 'flex', alignItems: 'center', gap: '8px', background: '#2563EB', color: 'white', border: 'none', borderRadius: '4px', padding: '0 20px', height: '36px', fontWeight: 800, fontSize: '13px', cursor: 'pointer', boxShadow: '0 4px 12px rgba(37,99,235,0.25)' }}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                  Create Utility Request
                </button>
              </div>

              {/* Table Card */}
              <div className="glass-card" style={{ padding: 0, overflow: 'hidden' }}>

                {/* Card Header: count + search + sort */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 24px', borderBottom: '1px solid #F1F5F9' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <span style={{ fontSize: '14px', fontWeight: 900, color: '#0F172A' }}>Total Utility Requests</span>
                    <span style={{ background: '#2563EB', color: 'white', borderRadius: '99px', padding: '2px 10px', fontSize: '12px', fontWeight: 800 }}>{filtered.length}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#94A3B8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ position: 'absolute', left: '10px' }}><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                      <input
                        type="text"
                        placeholder="Search requests..."
                        value={indentSearch}
                        onChange={e => { setIndentSearch(e.target.value); setIndentPage(1); }}
                        style={{ paddingLeft: '32px', paddingRight: '12px', height: '36px', border: '1px solid #E2E8F0', borderRadius: '4px', fontSize: '13px', outline: 'none', width: '200px', background: '#F8FAFC', fontFamily: 'inherit' }}
                      />
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12.5px', fontWeight: 700, color: '#64748B' }}>
                      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="15" y2="12"/><line x1="3" y1="18" x2="9" y2="18"/></svg>
                      Sort By :
                      <select value={indentSort} onChange={e => setIndentSort(e.target.value)} style={{ border: 'none', background: 'transparent', fontWeight: 700, fontSize: '12.5px', color: '#0F172A', outline: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>
                        <option value="newest">Newest</option>
                        <option value="oldest">Oldest</option>
                        <option value="priority">Priority</option>
                      </select>
                    </div>
                  </div>
                </div>

                {/* Table */}
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                    <thead>
                      <tr style={{ background: '#F8FAFC' }}>
                        <th style={{ padding: '14px 16px', width: '40px' }}>
                          <input 
                            type="checkbox" 
                            checked={paginated.length > 0 && selectedIndentIds.length === paginated.length}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedIndentIds(paginated.map(ind => ind._id || ind.indentId));
                              } else {
                                setSelectedIndentIds([]);
                              }
                            }}
                            title="Select All"
                          />
                        </th>
                        <th style={{ padding: '14px 16px', fontSize: '11.5px', fontWeight: 800, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.5px', whiteSpace: 'nowrap' }}>Request ID</th>
                        <th style={{ padding: '14px 16px', fontSize: '11.5px', fontWeight: 800, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Items</th>
                        <th style={{ padding: '14px 16px', fontSize: '11.5px', fontWeight: 800, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.5px', whiteSpace: 'nowrap' }}>Priority</th>
                        <th style={{ padding: '14px 16px', fontSize: '11.5px', fontWeight: 800, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.5px', textAlign: 'center', whiteSpace: 'nowrap' }}>Requested</th>
                        <th style={{ padding: '14px 16px', fontSize: '11.5px', fontWeight: 800, color: '#2563EB', textTransform: 'uppercase', letterSpacing: '0.5px', textAlign: 'center', whiteSpace: 'nowrap' }}>Approved</th>
                        <th style={{ padding: '14px 16px', fontSize: '11.5px', fontWeight: 800, color: '#16A34A', textTransform: 'uppercase', letterSpacing: '0.5px', textAlign: 'center', whiteSpace: 'nowrap' }}>Supplied</th>
                        <th style={{ padding: '14px 16px', fontSize: '11.5px', fontWeight: 800, color: '#D97706', textTransform: 'uppercase', letterSpacing: '0.5px', textAlign: 'center', whiteSpace: 'nowrap' }}>Remaining</th>
                        <th style={{ padding: '14px 16px', fontSize: '11.5px', fontWeight: 800, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.5px', whiteSpace: 'nowrap' }}>Status</th>
                        <th style={{ padding: '14px 16px', fontSize: '11.5px', fontWeight: 800, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.5px', textAlign: 'right' }}>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {paginated.length === 0 ? (
                        <tr><td colSpan={10} style={{ textAlign: 'center', padding: '48px', color: '#94A3B8', fontWeight: 600 }}>No utility requests found</td></tr>
                      ) : paginated.map((ind, idx) => {
                        const itemKey = ind._id || ind.indentId || idx;
                        const isSelected = selectedIndentIds.includes(itemKey);
                        const isPending = ind.status === 'Pending' || ind.status === 'Draft';
                        const reqTotal = (ind.items || []).reduce((sum, it) => sum + (Number(it.requiredQty) || 0), 0);
                        const hasApproved = (ind.items || []).some(it => it.approvedQty !== null && it.approvedQty !== undefined);
                        const appTotal = hasApproved ? (ind.items || []).reduce((sum, it) => (it.approvedQty !== null && it.approvedQty !== undefined ? sum + Number(it.approvedQty) : sum), 0) : null;
                        const supTotal = (ind.items || []).reduce((sum, it) => sum + (Number(it.suppliedQty) || 0), 0);
                        const remTotal = hasApproved ? (ind.items || []).reduce((sum, it) => (it.approvedQty !== null && it.approvedQty !== undefined ? sum + Math.max(0, Number(it.approvedQty) - (Number(it.suppliedQty) || 0)) : sum), 0) : null;

                        return (
                          <tr 
                            key={itemKey} 
                            onClick={() => { setSelectedIndent(ind); setShowIndentModal(true); }}
                            style={{ background: isSelected ? '#EFF6FF' : rowBg(ind.status), borderBottom: '1px solid rgba(241,245,249,0.8)', cursor: 'pointer' }}
                          >
                            <td onClick={e => e.stopPropagation()} style={{ padding: '14px 16px' }}>
                              <input 
                                type="checkbox" 
                                checked={isSelected}
                                onChange={(e) => {
                                  e.stopPropagation();
                                  if (e.target.checked) {
                                    setSelectedIndentIds(prev => [...prev, itemKey]);
                                  } else {
                                    setSelectedIndentIds(prev => prev.filter(id => id !== itemKey));
                                  }
                                }}
                              />
                            </td>
                            <td style={{ padding: '14px 16px', fontWeight: 800, color: '#0F172A', fontSize: '13px' }}>{ind.indentId}</td>
                            <td style={{ padding: '14px 16px' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <div style={{ width: '30px', height: '30px', borderRadius: '4px', background: avatarColors[idx % avatarColors.length], color: avatarText[idx % avatarText.length], display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 900, flexShrink: 0 }}>
                                  <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m10.5 20.5 10-10a4.95 4.95 0 1 0-7-7l-10 10a4.95 4.95 0 1 0 7 7Z"/><path d="m8.5 8.5 7 7"/></svg>
                                </div>
                                <span style={{ fontWeight: 700, color: '#1E293B', fontSize: '13px', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap', maxWidth: '240px' }} title={(ind.items || []).map(it => it.name).join(', ')}>
                                  {(ind.items || []).map(it => it.name).join(', ') || 'No Items'}
                                </span>
                              </div>
                            </td>
                            <td style={{ padding: '14px 16px' }}>
                              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', fontWeight: 700, fontSize: '12px', color: ind.priority === 'Urgent' ? '#DC2626' : '#475569' }}>
                                {ind.priority === 'Urgent' && <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="18 15 12 9 6 15"/></svg>}
                                {ind.priority}
                              </span>
                            </td>
                            <td style={{ padding: '14px 16px', fontWeight: 700, color: '#475569', fontSize: '13px', textAlign: 'center' }}>
                              {reqTotal}
                            </td>
                            <td style={{ padding: '14px 16px', fontWeight: 800, color: '#2563EB', fontSize: '13px', textAlign: 'center' }}>
                              {isPending || appTotal === null ? '—' : appTotal}
                            </td>
                            <td style={{ padding: '14px 16px', fontWeight: 800, color: '#16A34A', fontSize: '13px', textAlign: 'center' }}>
                              {supTotal}
                            </td>
                            <td style={{ padding: '14px 16px', fontWeight: 800, color: remTotal !== null && remTotal > 0 ? '#D97706' : '#64748B', fontSize: '13px', textAlign: 'center' }}>
                              {isPending || remTotal === null ? '—' : remTotal}
                            </td>
                            <td style={{ padding: '14px 16px' }}>
                              <span style={statusStyle(ind.status)}>{ind.status}</span>
                            </td>
                            <td onClick={e => e.stopPropagation()} style={{ padding: '14px 16px', textAlign: 'right' }}>
                              <button
                                onClick={() => { setSelectedIndent(ind); setShowIndentModal(true); }}
                                style={{ padding: '5px 12px', background: '#F1F5F9', color: '#334155', border: '1px solid #E2E8F0', borderRadius: '4px', fontSize: '11.5px', fontWeight: 700, cursor: 'pointer' }}
                              >
                                View Details
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Pagination */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 24px', borderTop: '1px solid #F1F5F9' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: '#64748B', fontWeight: 600 }}>
                    Showing
                    <select
                      value={INDENT_PAGE_SIZE}
                      style={{ border: '1px solid #E2E8F0', borderRadius: '6px', padding: '2px 6px', fontFamily: 'inherit', fontWeight: 700, fontSize: '12.5px', outline: 'none', background: 'white' }}
                      readOnly
                    >
                      <option>10</option>
                    </select>
                    Results
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <button onClick={() => setIndentPage(p => Math.max(1, p - 1))} disabled={indentPage === 1} style={{ padding: '6px 12px', border: '1px solid #E2E8F0', borderRadius: '2px', background: 'white', cursor: indentPage === 1 ? 'not-allowed' : 'pointer', fontWeight: 700, color: '#475569', fontSize: '13px', opacity: indentPage === 1 ? 0.5 : 1 }}>Prev</button>
                    {Array.from({ length: totalPages }, (_, i) => i + 1).map(pg => (
                      <button key={pg} onClick={() => setIndentPage(pg)} style={{ padding: '6px 10px', border: pg === indentPage ? 'none' : '1px solid #E2E8F0', borderRadius: '2px', background: pg === indentPage ? '#2563EB' : 'white', color: pg === indentPage ? 'white' : '#475569', fontWeight: 800, fontSize: '13px', cursor: 'pointer', minWidth: '32px' }}>{pg}</button>
                    ))}
                    <button onClick={() => setIndentPage(p => Math.min(totalPages, p + 1))} disabled={indentPage === totalPages} style={{ padding: '6px 12px', border: '1px solid #E2E8F0', borderRadius: '2px', background: 'white', cursor: indentPage === totalPages ? 'not-allowed' : 'pointer', fontWeight: 700, color: '#475569', fontSize: '13px', opacity: indentPage === totalPages ? 0.5 : 1 }}>Next</button>
                  </div>
                </div>
              </div>

              {/* Floating Bulk Action Bar for Indents */}
              {selectedIndentIds.length > 0 && (
                <div style={{ background: '#0F172A', color: 'white', padding: '14px 22px', borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '16px', boxShadow: '0 12px 28px rgba(15, 23, 42, 0.3)', border: '1px solid #334155', animation: 'slideUp 0.25s cubic-bezier(0.16, 1, 0.3, 1)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <span style={{ background: '#2563EB', color: 'white', padding: '4px 12px', borderRadius: '6px', fontSize: '12.5px', fontWeight: 800 }}>{selectedIndentIds.length} Selected</span>
                    <span style={{ fontSize: '12px', fontWeight: 700, color: '#E2E8F0' }}>Batch Operations for Purchase Indents</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <button 
                      type="button" 
                      onClick={() => {
                        alert(`Approve batch request submitted for ${selectedIndentIds.length} selected indents.`);
                      }}
                      style={{ padding: '8px 16px', background: '#059669', color: 'white', border: 'none', borderRadius: '2px', fontSize: '12.5px', fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', boxShadow: '0 4px 12px rgba(5,150,105,0.25)' }}
                    >
                      Batch Approve
                    </button>
                    <button 
                      type="button" 
                      onClick={() => setSelectedIndentIds([])}
                      style={{ padding: '8px 14px', background: 'transparent', color: '#94A3B8', border: '1px solid #475569', borderRadius: '2px', fontSize: '12.5px', fontWeight: 700, cursor: 'pointer' }}
                    >
                      Clear Selection
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })()}

        {/* ══════════════════════════════════════════════════════════
            NEW INDENT REQUEST TAB
        ══════════════════════════════════════════════════════════ */}
        {activeTab === 'new-indent' && (() => {
          const filteredMeds = medicineSearchQuery.trim() === '' ? [] : medicines.filter(med =>
            (med.name || '').toLowerCase().includes(medicineSearchQuery.toLowerCase()) ||
            (med.category || '').toLowerCase().includes(medicineSearchQuery.toLowerCase())
          ).slice(0, 8);

          const indentUsers = staffList && staffList.length > 0
            ? staffList.map(u => ({
                name: u.name,
                initials: (u.name || 'ST').split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase() || 'ST',
                role: u.role || 'Staff',
                contact: u.phone || 'N/A'
              }))
            : [
                { name: JSON.parse(localStorage.getItem('user') || '{}').name || 'Staff', initials: (JSON.parse(localStorage.getItem('user') || '{}').name || 'Staff').split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase() || 'ST', role: JSON.parse(localStorage.getItem('user') || '{}').role || 'Staff', contact: JSON.parse(localStorage.getItem('user') || '{}').contact || '9876543210' }
              ];

          const handleAddMedicine = (med) => {
            if (selectedMedicines.some(m => m.name.toLowerCase() === med.name.toLowerCase())) {
              showToast(`${med.name} is already added!`, "info");
              return;
            }
            setSelectedMedicines([
              ...selectedMedicines,
              {
                name: med.name,
                category: med.category || 'Pharmaceuticals',
                unit: med.unit || 'Strip',
                requiredQty: 10,
                availableStock: med.stock !== undefined ? med.stock : 0,
                mrp: med.mrp !== undefined ? med.mrp : 50.00,
                isCustom: false
              }
            ]);
            setMedicineSearchQuery('');
            setShowMedicineSuggestions(false);
          };

          const handleAddCustomItem = () => {
            setSelectedMedicines([
              ...selectedMedicines,
              {
                name: '',
                category: 'General',
                unit: 'Strip',
                requiredQty: 10,
                availableStock: 0,
                mrp: 50.00,
                isCustom: true
              }
            ]);
          };

          const handleRemoveItem = (index) => {
            setSelectedMedicines(selectedMedicines.filter((_, idx) => idx !== index));
          };

          const handleUpdateItem = (index, field, value) => {
            const updated = [...selectedMedicines];
            updated[index][field] = value;
            setSelectedMedicines(updated);
          };

          const handleFileChange = (e) => {
            const files = Array.from(e.target.files || []);
            setNewIndentAttachments([
              ...newIndentAttachments,
              ...files.map(f => f.name)
            ]);
          };

          const handleSubmitIndent = async (status = 'Pending') => {
            if (selectedMedicines.length === 0) {
              showToast("Please add at least one item/pharmaceutical to order.", "error");
              return;
            }
            // Validate names
            if (selectedMedicines.some(item => !item.name.trim())) {
              showToast("Please provide names for all items.", "error");
              return;
            }
            // Validate quantities
            if (selectedMedicines.some(item => Number(item.requiredQty) <= 0)) {
              showToast("All items must have a quantity of 1 or more.", "error");
              return;
            }

            setLoading(true);
            try {
              const totalQty = selectedMedicines.reduce((sum, item) => sum + (Number(item.requiredQty) || 0), 0);
              const payload = {
                department: newIndentDept,
                indentType: newIndentType,
                requiredDate: new Date(newIndentReqDate),
                requestedBy: newIndentRequestedBy,
                contactNumber: newIndentContact,
                priority: newIndentPriority,
                purpose: newIndentRemarks,
                additionalNotes: newIndentAdditionalNotes,
                attachments: newIndentAttachments,
                items: selectedMedicines.map(item => ({
                  name: item.name,
                  category: item.category,
                  unit: item.unit,
                  requiredQty: Number(item.requiredQty) || 0,
                  availableStock: Number(item.availableStock) || 0,
                  mrp: Number(item.mrp) || 50
                })),
                totalQty,
                status
              };

              const res = await api.post('/indents', payload);
              const successMsg = status === 'Draft' 
                ? `Purchase Indent ${res.data.indentId} saved as draft!`
                : `Purchase Indent ${res.data.indentId} submitted successfully!`;
              showToast(successMsg, "success");
              fetchData();
              switchTab('indent');
            } catch (err) {
              console.error(err);
              showToast(err.response?.data?.error || "Failed to submit indent request", "error");
            } finally {
              setLoading(false);
            }
          };

          const totalItems = selectedMedicines.length;
          const totalQuantity = selectedMedicines.reduce((sum, item) => sum + (Number(item.requiredQty) || 0), 0);
          const estimatedTotal = selectedMedicines.reduce((sum, item) => sum + (Number(item.requiredQty) || 0) * (Number(item.mrp) || 50), 0);

          const getCategoryTheme = (cat) => {
            const c = (cat || '').toLowerCase();
            if (c.includes('pain') || c.includes('analgesic')) return { bg: '#FEE2E2', color: '#EF4444' };
            if (c.includes('antibiotic')) return { bg: '#FEF3C7', color: '#D97706' };
            if (c.includes('allergy') || c.includes('antihistamine') || c.includes('anti-allergic')) return { bg: '#E0F2FE', color: '#0284C7' };
            if (c.includes('acid') || c.includes('gastro') || c.includes('rehydration') || c.includes('antacid')) return { bg: '#E0FDF4', color: '#16A34A' };
            return { bg: '#F1F5F9', color: '#475569' };
          };

          return (
            <div className="tab-content active" style={{ animation: 'slideUp 0.4s ease-out', paddingBottom: '40px' }}>
              
              {/* Back Link */}
              <div style={{ marginBottom: '12px' }}>
                <button
                  onClick={() => switchTab('indent')}
                  style={{ background: 'none', border: 'none', color: '#2563EB', fontWeight: 800, fontSize: '12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', padding: 0 }}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>
                  Back to Indents
                </button>
              </div>

              {/* Title Header */}
              <div style={{ marginBottom: '16px' }}>
                <h1 style={{ fontSize: '26px', fontWeight: 900, color: '#0F172A', margin: '0 0 8px 0' }}>New Indent Request</h1>
                <p style={{ fontSize: '12px', color: '#64748B', fontWeight: 600, margin: 0 }}>Request pharmaceuticals and medical supplies for your department.</p>
              </div>

              {/* Grid Container */}
              <div style={{ display: 'grid', gridTemplateColumns: '1.8fr 1fr', gap: '32px', alignItems: 'start' }} className="mobile-stack">
                
                {/* LEFT COLUMN */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
                  
                  {/* Card 1: Indent Information */}
                  <div className="glass-card" style={{ padding: '32px', position: 'relative' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px', borderBottom: '1px solid #F1F5F9', paddingBottom: '16px' }}>
                      <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#2563EB" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
                      <span style={{ fontSize: '14px', fontWeight: 900, color: '#0F172A' }}>Indent Information</span>
                    </div>

                    {/* Row 1 Grid */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px', marginBottom: '12px' }} className="mobile-stack">
                      {/* Department */}
                      <div>
                        <label style={{ display: 'block', fontSize: '11px', fontWeight: 800, color: '#475569', textTransform: 'uppercase', marginBottom: '8px', letterSpacing: '0.5px' }}>Department <span style={{ color: '#EF4444' }}>*</span></label>
                        <select
                          value={newIndentDept}
                          onChange={e => setNewIndentDept(e.target.value)}
                          style={{ width: '100%', height: '26px', border: '1px solid #E2E8F0', borderRadius: '2px', padding: '0 12px', fontSize: '12px', fontWeight: 600, outline: 'none', background: '#F8FAFC', fontFamily: 'inherit' }}
                        >
                          <option value="Pharmacy">Pharmacy</option>
                          <option value="Reception">Reception</option>
                          <option value="Outpatient (OPD)">Outpatient (OPD)</option>
                          <option value="Inpatient (IPD)">Inpatient (IPD)</option>
                        </select>
                      </div>

                      {/* Indent Type */}
                      <div>
                        <label style={{ display: 'block', fontSize: '11px', fontWeight: 800, color: '#475569', textTransform: 'uppercase', marginBottom: '8px', letterSpacing: '0.5px' }}>Indent Type <span style={{ color: '#EF4444' }}>*</span></label>
                        <select
                          value={newIndentType}
                          onChange={e => setNewIndentType(e.target.value)}
                          style={{ width: '100%', height: '26px', border: '1px solid #E2E8F0', borderRadius: '2px', padding: '0 12px', fontSize: '12px', fontWeight: 600, outline: 'none', background: '#F8FAFC', fontFamily: 'inherit' }}
                        >
                          <option value="Pharmaceuticals">Pharmaceuticals</option>
                          <option value="Medical Supplies">Medical Supplies</option>
                          <option value="Lab Consumables">Lab Consumables</option>
                          <option value="Office Supplies">Office Supplies</option>
                        </select>
                      </div>

                      {/* Required Date */}
                      <div>
                        <label style={{ display: 'block', fontSize: '11px', fontWeight: 800, color: '#475569', textTransform: 'uppercase', marginBottom: '8px', letterSpacing: '0.5px' }}>Required Date <span style={{ color: '#EF4444' }}>*</span></label>
                        <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                          <input
                            type="date"
                            value={newIndentReqDate}
                            min={getLocalDateString()}
                            onChange={e => setNewIndentReqDate(e.target.value)}
                            style={{ width: '100%', height: '26px', border: '1px solid #E2E8F0', borderRadius: '2px', padding: '0 12px', fontSize: '12px', fontWeight: 600, outline: 'none', background: '#F8FAFC', fontFamily: 'inherit' }}
                          />
                        </div>
                      </div>
                    </div>

                    {/* Row 2 Grid */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px', marginBottom: '12px' }} className="mobile-stack">
                      {/* Requested By (Custom Dropdown) */}
                      <div style={{ position: 'relative' }}>
                        <label style={{ display: 'block', fontSize: '11px', fontWeight: 800, color: '#475569', textTransform: 'uppercase', marginBottom: '8px', letterSpacing: '0.5px' }}>Requested By <span style={{ color: '#EF4444' }}>*</span></label>
                        <div 
                          onClick={() => setShowReqByDropdown(!showReqByDropdown)}
                          style={{ width: '100%', height: '26px', border: '1px solid #E2E8F0', borderRadius: '2px', padding: '0 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#F8FAFC', cursor: 'pointer', userSelect: 'none' }}
                        >
                          {(() => {
                            const selectedUser = indentUsers.find(u => u.name === newIndentRequestedBy) || indentUsers[0];
                            return (
                              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: '#EFF6FF', color: '#2563EB', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 900 }}>
                                  {selectedUser.initials}
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column' }}>
                                  <span style={{ fontSize: '13px', fontWeight: 700, color: '#0F172A', lineHeight: '1.2' }}>{selectedUser.name}</span>
                                  <span style={{ fontSize: '10.5px', color: '#64748B', fontWeight: 600 }}>{selectedUser.role}</span>
                                </div>
                              </div>
                            );
                          })()}
                          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#64748B" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
                        </div>

                        {showReqByDropdown && (
                          <div style={{ position: 'absolute', top: '75px', left: 0, right: 0, background: 'white', borderRadius: '2px', boxShadow: '0 10px 25px -5px rgba(0,0,0,0.1), 0 8px 10px -6px rgba(0,0,0,0.1)', border: '1px solid #E2E8F0', zIndex: 100, overflow: 'hidden' }}>
                            {indentUsers.map(u => (
                              <div
                                key={u.name}
                                onClick={() => {
                                  setNewIndentRequestedBy(u.name);
                                  setNewIndentContact(u.contact);
                                  setShowReqByDropdown(false);
                                }}
                                style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 12px', cursor: 'pointer', borderBottom: '1px solid #F1F5F9', transition: 'background 0.2s' }}
                                onMouseEnter={e => e.currentTarget.style.background = '#F8FAFC'}
                                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                              >
                                <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: '#EFF6FF', color: '#2563EB', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 900 }}>
                                  {u.initials}
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column' }}>
                                  <span style={{ fontSize: '13px', fontWeight: 700, color: '#0F172A', lineHeight: '1.2' }}>{u.name}</span>
                                  <span style={{ fontSize: '10.5px', color: '#64748B', fontWeight: 600 }}>{u.role}</span>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Contact Number */}
                      <div>
                        <label style={{ display: 'block', fontSize: '11px', fontWeight: 800, color: '#475569', textTransform: 'uppercase', marginBottom: '8px', letterSpacing: '0.5px' }}>Contact Number</label>
                        <input
                          type="text"
                          placeholder="Enter contact number"
                          value={newIndentContact}
                          onChange={e => setNewIndentContact(e.target.value)}
                          style={{ width: '100%', height: '26px', border: '1px solid #E2E8F0', borderRadius: '2px', padding: '0 12px', fontSize: '12px', fontWeight: 600, outline: 'none', background: '#F8FAFC', fontFamily: 'inherit' }}
                        />
                      </div>

                      {/* Priority */}
                      <div>
                        <label style={{ display: 'block', fontSize: '11px', fontWeight: 800, color: '#475569', textTransform: 'uppercase', marginBottom: '8px', letterSpacing: '0.5px' }}>Priority</label>
                        <select
                          value={newIndentPriority}
                          onChange={e => setNewIndentPriority(e.target.value)}
                          style={{ width: '100%', height: '26px', border: '1px solid #E2E8F0', borderRadius: '2px', padding: '0 12px', fontSize: '12px', fontWeight: 600, outline: 'none', background: '#F8FAFC', fontFamily: 'inherit' }}
                        >
                          <option value="Normal">Normal</option>
                          <option value="Urgent">Urgent</option>
                        </select>
                      </div>
                    </div>

                    {/* Remarks */}
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                        <label style={{ fontSize: '11px', fontWeight: 800, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.5px', margin: 0 }}>Purpose / Remarks</label>
                        <span style={{ fontSize: '11px', color: '#94A3B8', fontWeight: 700 }}>{newIndentRemarks.length}/250</span>
                      </div>
                      <textarea
                        placeholder="Enter purpose or additional remarks (optional)"
                        value={newIndentRemarks}
                        onChange={e => setNewIndentRemarks(e.target.value.slice(0, 250))}
                        style={{ width: '100%', height: '80px', border: '1px solid #E2E8F0', borderRadius: '2px', padding: '12px', fontSize: '12px', fontWeight: 600, outline: 'none', background: '#F8FAFC', resize: 'none', fontFamily: 'inherit' }}
                      />
                    </div>
                  </div>

                  {/* Card 2: Add Pharmaceuticals */}
                  <div className="glass-card" style={{ padding: '32px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px', borderBottom: '1px solid #F1F5F9', paddingBottom: '16px' }}>
                      <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#2563EB" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="9"/><rect x="14" y="3" width="7" height="5"/><rect x="14" y="12" width="7" height="9"/><rect x="3" y="16" width="7" height="5"/></svg>
                      <span style={{ fontSize: '14px', fontWeight: 900, color: '#0F172A' }}>Add Pharmaceuticals</span>
                    </div>

                    {/* Search / Add Custom Item row */}
                    <div style={{ display: 'flex', gap: '8px', marginBottom: '12px', position: 'relative' }} className="mobile-stack">
                      
                      {/* Search box wrapper */}
                      <div ref={medicineSearchContainerRef} style={{ flex: 1, position: 'relative' }}>
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#94A3B8" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ position: 'absolute', left: '16px', top: '14px' }}><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                        <input
                          id="indent-medicine-search"
                          type="text"
                          placeholder="Search medicine by name, brand, or composition"
                          value={medicineSearchQuery}
                          onChange={e => {
                            setMedicineSearchQuery(e.target.value);
                            setShowMedicineSuggestions(true);
                          }}
                          onFocus={() => setShowMedicineSuggestions(true)}
                          style={{ width: '100%', height: '26px', border: '1px solid #E2E8F0', borderRadius: '2px', paddingLeft: '44px', paddingRight: '16px', fontSize: '12px', fontWeight: 600, outline: 'none', background: '#F8FAFC', fontFamily: 'inherit' }}
                        />

                        {/* Autocomplete Dropdown */}
                        {showMedicineSuggestions && medicineSearchQuery.trim() !== '' && (
                          <div style={{ position: 'absolute', top: '48px', left: 0, right: 0, background: 'white', borderRadius: '2px', boxShadow: '0 10px 25px -5px rgba(0,0,0,0.1), 0 8px 10px -6px rgba(0,0,0,0.1)', border: '1px solid #E2E8F0', zIndex: 100, overflow: 'hidden' }}>
                            {filteredMeds.length === 0 ? (
                              <div style={{ padding: '14px 16px', fontSize: '13px', color: '#94A3B8', fontWeight: 600 }}>No matching medicines found. Click "+ Add Another Item" below to add custom item.</div>
                            ) : (
                              filteredMeds.map(med => (
                                <div
                                  key={med._id}
                                  onClick={() => handleAddMedicine(med)}
                                  style={{ padding: '12px 16px', borderBottom: '1px solid #F1F5F9', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', transition: 'background 0.2s' }}
                                  onMouseEnter={e => e.currentTarget.style.background = '#F8FAFC'}
                                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                                >
                                  <div>
                                    <div style={{ fontSize: '12px', fontWeight: 700, color: '#1E293B' }}>{med.name}</div>
                                    <div style={{ fontSize: '11px', color: '#64748B', fontWeight: 600 }}>{med.category} · SKU: {med.sku} · MRP: ₹{med.mrp || 50}</div>
                                  </div>
                                  <div style={{ fontSize: '12px', fontWeight: 700, color: med.stock > 20 ? '#16A34A' : med.stock > 0 ? '#D97706' : '#DC2626' }}>
                                    Stock: {med.stock}
                                  </div>
                                </div>
                              ))
                            )}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Selected items list table */}
                    <div style={{ overflowX: 'auto' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                        <thead>
                          <tr style={{ borderBottom: '1px solid #F1F5F9' }}>
                            <th style={{ padding: '12px 16px', fontSize: '11px', fontWeight: 800, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.5px', minWidth: '300px' }}>Medicine / Item</th>
                            <th style={{ padding: '12px 16px', fontSize: '11px', fontWeight: 800, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.5px', minWidth: '130px' }}>Category</th>
                            <th style={{ padding: '12px 16px', fontSize: '11px', fontWeight: 800, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.5px', minWidth: '110px' }}>Unit</th>
                            <th style={{ padding: '12px 16px', fontSize: '11px', fontWeight: 800, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.5px', textAlign: 'center', minWidth: '130px' }}>Required Qty</th>
                            <th style={{ padding: '12px 16px', fontSize: '11px', fontWeight: 800, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.5px', textAlign: 'center', minWidth: '110px' }}>Available Stock</th>
                            <th style={{ padding: '12px 16px', width: '60px' }}></th>
                          </tr>
                        </thead>
                        <tbody>
                          {selectedMedicines.length === 0 ? (
                            <tr>
                              <td colSpan={6} style={{ padding: '36px', textAlign: 'center', color: '#94A3B8', fontWeight: 600, fontSize: '12px' }}>
                                No items added yet. Search above or click "+ Add Another Item" below to begin.
                              </td>
                            </tr>
                          ) : selectedMedicines.map((item, idx) => {
                            const theme = getCategoryTheme(item.category);
                            return (
                              <tr key={idx} style={{ borderBottom: '1px solid #F8FAFC' }}>
                                
                                {/* Medicine / Item */}
                                <td style={{ padding: '16px', minWidth: '300px' }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', width: '100%' }}>
                                    <div style={{ width: '36px', height: '36px', borderRadius: '2px', background: theme.bg, color: theme.color, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                      <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m10.5 20.5 10-10a4.95 4.95 0 1 0-7-7l-10 10a4.95 4.95 0 1 0 7 7Z"/><path d="m8.5 8.5 7 7"/></svg>
                                    </div>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: 1, minWidth: 0 }}>
                                      {item.isCustom ? (
                                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', width: '100%' }}>
                                          <div style={{ position: 'relative', flex: 1, minWidth: '160px' }}>
                                            <input
                                              type="text"
                                              placeholder="Enter medicine name..."
                                              value={item.name}
                                              onChange={e => handleUpdateItem(idx, 'name', e.target.value)}
                                              onFocus={() => setActiveCustomRowFocus(idx)}
                                              onBlur={() => {
                                                setTimeout(() => {
                                                  if (!isHoveringCustomSuggestions) {
                                                    setActiveCustomRowFocus(null);
                                                  }
                                                }, 150);
                                              }}
                                              style={{ height: '36px', border: '1px solid #CBD5E1', borderRadius: '2px', padding: '0 10px', fontSize: '13px', fontWeight: 600, outline: 'none', width: '100%', background: '#FFFFFF', boxSizing: 'border-box' }}
                                            />
                                            {activeCustomRowFocus === idx && (() => {
                                              const typedVal = (item.name || '').trim().toLowerCase();
                                              const filtered = typedVal
                                                ? medicines.filter(m => 
                                                    (m.name || '').toLowerCase().includes(typedVal) ||
                                                    (m.category || '').toLowerCase().includes(typedVal)
                                                  ).slice(0, 8)
                                                : medicines.slice(0, 8);

                                              if (filtered.length === 0) return null;

                                              return (
                                                <div 
                                                  data-lenis-prevent 
                                                  onMouseEnter={() => setIsHoveringCustomSuggestions(true)}
                                                  onMouseLeave={() => setIsHoveringCustomSuggestions(false)}
                                                  style={{ 
                                                    position: 'absolute', 
                                                    top: 'calc(100% + 4px)', 
                                                    left: '0px', 
                                                    width: '280px', 
                                                    zIndex: 1200, 
                                                    padding: '6px', 
                                                    maxHeight: '220px', 
                                                    boxShadow: '0 10px 25px rgba(0,0,0,0.08), 0 4px 12px rgba(0,0,0,0.04)',
                                                    borderRadius: '2px',
                                                    border: '1px solid #E2E8F0',
                                                    background: '#ffffff',
                                                    overflowY: 'auto'
                                                  }}
                                                >
                                                  {filtered.map(med => (
                                                    <div
                                                      key={med._id}
                                                      onClick={() => {
                                                        const updated = [...selectedMedicines];
                                                        updated[idx] = {
                                                          name: med.name,
                                                          category: med.category || 'General',
                                                          unit: med.unit || 'Strip',
                                                          requiredQty: updated[idx].requiredQty || 10,
                                                          availableStock: med.stock !== undefined ? med.stock : 0,
                                                          mrp: med.mrp !== undefined ? med.mrp : 50.00,
                                                          isCustom: false
                                                        };
                                                        setSelectedMedicines(updated);
                                                        setActiveCustomRowFocus(null);
                                                        setIsHoveringCustomSuggestions(false);
                                                      }}
                                                      style={{ 
                                                        padding: '8px 12px', 
                                                        borderBottom: '1px solid #F1F5F9', 
                                                        cursor: 'pointer', 
                                                        display: 'flex', 
                                                        justifyContent: 'space-between', 
                                                        alignItems: 'center', 
                                                        transition: 'background 0.2s',
                                                        borderRadius: '6px'
                                                      }}
                                                      onMouseEnter={e => e.currentTarget.style.background = '#F8FAFC'}
                                                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                                                    >
                                                      <div>
                                                        <div style={{ fontSize: '12.5px', fontWeight: 700, color: '#1E293B', textAlign: 'left' }}>{med.name}</div>
                                                        <div style={{ fontSize: '10px', color: '#64748B', fontWeight: 600, textAlign: 'left' }}>{med.category} · MRP: ₹{med.mrp || 50}</div>
                                                      </div>
                                                      <span style={{ fontSize: '11px', fontWeight: 700, color: med.stock > 0 ? '#16A34A' : '#DC2626' }}>
                                                        Stock: {med.stock}
                                                      </span>
                                                    </div>
                                                  ))}
                                                </div>
                                              );
                                            })()}
                                          </div>
                                          <div style={{ display: 'flex', alignItems: 'center', gap: '2px', flexShrink: 0 }}>
                                            <span style={{ fontSize: '11px', fontWeight: 700, color: '#64748B' }}>₹</span>
                                            <input
                                              type="number"
                                              placeholder="MRP"
                                              value={item.mrp !== undefined && item.mrp !== null ? item.mrp : ''}
                                              onChange={e => handleUpdateItem(idx, 'mrp', Math.max(0, Number(e.target.value) || 0))}
                                              style={{ height: '36px', border: '1px solid #CBD5E1', borderRadius: '2px', padding: '0 8px', fontSize: '13px', fontWeight: 600, outline: 'none', width: '64px', background: '#FFFFFF' }}
                                              title="Unit MRP Price"
                                            />
                                          </div>
                                        </div>
                                      ) : (
                                        <>
                                          <span style={{ fontWeight: 700, color: '#1E293B', fontSize: '12px' }}>{item.name}</span>
                                          <span style={{ fontSize: '11px', color: '#64748B', fontWeight: 600 }}>{item.unit} · MRP: ₹{item.mrp}</span>
                                        </>
                                      )}
                                    </div>
                                  </div>
                                </td>

                                {/* Category */}
                                <td style={{ padding: '16px' }}>
                                  {item.isCustom ? (
                                    <input
                                      type="text"
                                      placeholder="Category"
                                      value={item.category}
                                      onChange={e => handleUpdateItem(idx, 'category', e.target.value)}
                                      style={{ height: '36px', border: '1px solid #E2E8F0', borderRadius: '6px', padding: '0 8px', fontSize: '13px', fontWeight: 600, outline: 'none', width: '120px' }}
                                    />
                                  ) : (
                                    <span style={{ fontSize: '13px', color: '#475569', fontWeight: 700 }}>{item.category}</span>
                                  )}
                                </td>

                                {/* Unit */}
                                <td style={{ padding: '16px' }}>
                                  <select
                                    value={item.unit}
                                    onChange={e => handleUpdateItem(idx, 'unit', e.target.value)}
                                    style={{ height: '36px', border: '1px solid #E2E8F0', borderRadius: '6px', padding: '0 8px', fontSize: '13px', fontWeight: 600, outline: 'none', background: 'white', fontFamily: 'inherit' }}
                                  >
                                    <option value="Strip">Strip</option>
                                    <option value="Capsule">Capsule</option>
                                    <option value="Tablet">Tablet</option>
                                    <option value="Bottle">Bottle</option>
                                    <option value="Box">Box</option>
                                    <option value="Vial">Vial</option>
                                  </select>
                                </td>

                                {/* Required Qty */}
                                <td style={{ padding: '16px', textAlign: 'center' }}>
                                  <div style={{ display: 'inline-flex', alignItems: 'center', border: '1px solid #E2E8F0', borderRadius: '2px', overflow: 'hidden', background: '#F8FAFC' }}>
                                    <button
                                      onClick={() => handleUpdateItem(idx, 'requiredQty', Math.max(1, (Number(item.requiredQty) || 0) - 1))}
                                      style={{ width: '32px', height: '22px', border: 'none', background: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#475569', fontWeight: 800 }}
                                    >
                                      -
                                    </button>
                                    <input
                                      type="number"
                                      value={item.requiredQty}
                                      onChange={e => handleUpdateItem(idx, 'requiredQty', Math.max(1, Number(e.target.value) || 0))}
                                      style={{ width: '48px', height: '22px', border: 'none', borderLeft: '1px solid #E2E8F0', borderRight: '1px solid #E2E8F0', textAlign: 'center', fontSize: '13px', fontWeight: 800, background: 'white', outline: 'none' }}
                                    />
                                    <button
                                      onClick={() => handleUpdateItem(idx, 'requiredQty', (Number(item.requiredQty) || 0) + 1)}
                                      style={{ width: '32px', height: '22px', border: 'none', background: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#475569', fontWeight: 800 }}
                                    >
                                      +
                                    </button>
                                  </div>
                                </td>

                                {/* Available Stock */}
                                <td style={{ padding: '16px', textAlign: 'center' }}>
                                  <span style={{ fontSize: '12px', fontWeight: 800, color: item.availableStock > 20 ? '#10B981' : item.availableStock > 0 ? '#F59E0B' : '#EF4444' }}>
                                    {item.availableStock}
                                  </span>
                                </td>

                                {/* Action (Remove) */}
                                <td style={{ padding: '16px', textAlign: 'right' }}>
                                  <button
                                    onClick={() => handleRemoveItem(idx)}
                                    style={{ background: 'none', border: 'none', color: '#94A3B8', cursor: 'pointer', padding: '4px', transition: 'color 0.2s' }}
                                    onMouseEnter={e => e.currentTarget.style.color = '#EF4444'}
                                    onMouseLeave={e => e.currentTarget.style.color = '#94A3B8'}
                                  >
                                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
                                  </button>
                                </td>

                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>

                    {/* Add Another Item Button */}
                    <div style={{ marginTop: '20px' }}>
                      <button
                        onClick={handleAddCustomItem}
                        style={{ background: 'none', border: '1px solid #2563EB', color: '#2563EB', borderRadius: '2px', padding: '0 16px', height: '26px', fontWeight: 800, fontSize: '13px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                        Add Another Item
                      </button>
                    </div>

                  </div>

                </div>

                {/* RIGHT COLUMN */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
                  
                  {/* Card 3: Indent Summary */}
                  <div className="glass-card" style={{ padding: '28px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px', borderBottom: '1px solid #F1F5F9', paddingBottom: '12px' }}>
                      <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#2563EB" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>
                      <span style={{ fontSize: '12px', fontWeight: 900, color: '#0F172A' }}>Indent Summary</span>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '12px', color: '#64748B', fontWeight: 600 }}>Total Items</span>
                        <span style={{ fontSize: '12px', fontWeight: 800, color: '#0F172A' }}>{totalItems}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '12px', color: '#64748B', fontWeight: 600 }}>Total Quantity</span>
                        <span style={{ fontSize: '12px', fontWeight: 800, color: '#0F172A' }}>{totalQuantity}</span>
                      </div>

                      <hr style={{ border: 'none', borderTop: '1px solid #E2E8F0', margin: '12px 0 6px 0' }} />

                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '14.5px', fontWeight: 800, color: '#0F172A' }}>Estimated Total</span>
                        <span style={{ fontSize: '14px', fontWeight: 900, color: '#2563EB' }}>
                          {new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(estimatedTotal)}
                        </span>
                      </div>

                      {/* Info Alert Box */}
                      <div style={{ background: '#EFF6FF', border: '1px solid #DBEAFE', borderRadius: '2px', padding: '14px 16px', display: 'flex', gap: '12px', marginTop: '16px' }}>
                        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#2563EB" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: '2px' }}><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
                        <div style={{ fontSize: '12.5px', color: '#1E40AF', fontWeight: 600, lineHeight: '1.4' }}>
                          <div style={{ fontWeight: 800, marginBottom: '2px' }}>This is an indent request.</div>
                          Final approval and amount may vary based on stock and purchase.
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Card 4: Attachments */}
                  <div className="glass-card" style={{ padding: '28px' }}>
                    <span style={{ display: 'block', fontSize: '12px', fontWeight: 900, color: '#0F172A', marginBottom: '16px' }}>Attachments (Optional)</span>
                    
                    <label 
                      htmlFor="indent-attachments-file"
                      style={{ 
                        display: 'block', 
                        border: '2px dashed #CBD5E1', 
                        borderRadius: '4px', 
                        padding: '32px 20px', 
                        textAlign: 'center', 
                        background: '#F8FAFC', 
                        cursor: 'pointer', 
                        transition: 'border-color 0.2s' 
                      }}
                      onMouseEnter={e => e.currentTarget.style.borderColor = '#2563EB'}
                      onMouseLeave={e => e.currentTarget.style.borderColor = '#CBD5E1'}
                    >
                      <input 
                        type="file" 
                        id="indent-attachments-file" 
                        multiple 
                        onChange={handleFileChange} 
                        style={{ display: 'none' }} 
                      />
                      <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#94A3B8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginBottom: '12px', color: '#94A3B8' }}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                      <div style={{ fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '4px' }}>
                        Drag & drop files here
                      </div>
                      <div style={{ fontSize: '13px', fontWeight: 700, color: '#2563EB', textDecoration: 'underline', marginBottom: '8px' }}>
                        or browse
                      </div>
                      <div style={{ fontSize: '11px', color: '#94A3B8', fontWeight: 650 }}>
                        Supports: PDF, JPG, PNG (Max 5MB)
                      </div>
                    </label>

                    {/* File List */}
                    {newIndentAttachments.length > 0 && (
                      <div style={{ marginTop: '16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        {newIndentAttachments.map((fName, idx) => (
                          <div key={idx} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#EFF6FF', borderRadius: '2px', padding: '8px 12px', border: '1px solid #DBEAFE' }}>
                            <span style={{ fontSize: '12px', fontWeight: 700, color: '#1E40AF', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap', maxWidth: '200px' }} title={fName}>
                              {fName}
                            </span>
                            <button 
                              onClick={() => setNewIndentAttachments(newIndentAttachments.filter((_, i) => i !== idx))} 
                              style={{ background: 'none', border: 'none', color: '#EF4444', cursor: 'pointer', padding: '2px', display: 'flex', alignItems: 'center' }}
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Card 5: Additional Notes */}
                  <div className="glass-card" style={{ padding: '28px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                      <span style={{ fontSize: '12px', fontWeight: 900, color: '#0F172A' }}>Additional Notes (Optional)</span>
                      <span style={{ fontSize: '11px', color: '#94A3B8', fontWeight: 700 }}>{newIndentAdditionalNotes.length}/250</span>
                    </div>
                    <textarea
                      placeholder="Enter any additional information..."
                      value={newIndentAdditionalNotes}
                      onChange={e => setNewIndentAdditionalNotes(e.target.value.slice(0, 250))}
                      style={{ width: '100%', height: '80px', border: '1px solid #E2E8F0', borderRadius: '2px', padding: '12px', fontSize: '12px', fontWeight: 600, outline: 'none', background: '#F8FAFC', resize: 'none', fontFamily: 'inherit' }}
                    />
                  </div>

                </div>

              </div>

              {/* Submit Buttons */}
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '32px', borderTop: '1px solid #F1F5F9', paddingTop: '24px' }}>
                <button
                  onClick={() => switchTab('indent')}
                  style={{ height: '26px', border: '1px solid #E2E8F0', background: 'white', color: '#475569', borderRadius: '2px', padding: '0 24px', fontWeight: 800, fontSize: '12px', cursor: 'pointer' }}
                >
                  Cancel
                </button>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    onClick={() => handleSubmitIndent('Draft')}
                    disabled={loading}
                    style={{ height: '26px', border: '1.5px solid #2563EB', background: 'white', color: '#2563EB', borderRadius: '2px', padding: '0 24px', fontWeight: 800, fontSize: '12px', cursor: 'pointer', opacity: loading ? 0.7 : 1 }}
                  >
                    Save as Draft
                  </button>
                  <button
                    onClick={() => handleSubmitIndent('Pending')}
                    disabled={loading}
                    style={{ height: '26px', border: 'none', background: '#2563EB', color: 'white', borderRadius: '2px', padding: '0 24px', fontWeight: 800, fontSize: '12px', cursor: 'pointer', opacity: loading ? 0.7 : 1 }}
                    onMouseEnter={e => e.currentTarget.style.background = '#1D4ED8'}
                    onMouseLeave={e => e.currentTarget.style.background = '#2563EB'}
                  >
                    Submit Indent
                  </button>
                </div>
              </div>

            </div>
          );
        })()}

        {/* TAB: DOCTOR DYNAMIC COVERAGE */}
        {activeTab === 'doctor_cover' && (
          <div className="tab-content active" style={{ animation: 'slideUp 0.4s ease-out', padding: '12px' }}>
            {/* Header gradient card */}
            <div className="glass-card" style={{
              background: 'linear-gradient(135deg, #FFE4E6 0%, #FECDD3 100%)',
              border: '1px solid #FDA4AF',
              padding: '28px',
              borderRadius: '20px',
              marginBottom: '12px',
              position: 'relative',
              overflow: 'hidden'
            }}>
              <div style={{ position: 'relative', zIndex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                  <span className="badge-pill new" style={{ background: '#E11D48', color: 'white', padding: '6px 14px', fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    ● Active Clinical Coverage
                  </span>
                </div>
                <h2 style={{ fontSize: '26px', fontWeight: 800, color: '#9F1239', margin: '0 0 8px 0', fontFamily: 'Urbanist, sans-serif' }}>Doctor Active Coverage</h2>
                <p style={{ fontSize: '14.5px', color: '#BE123C', margin: 0, fontWeight: 600, maxWidth: '650px', lineHeight: '1.5' }}>
                  Emergency Clinical Duty Coverage. Write SOAP notes, prescribe medicines, and review consultations. All actions are logged under active practitioner credentials.
                </p>
              </div>
              <div style={{
                position: 'absolute',
                right: '-30px',
                bottom: '-30px',
                fontSize: '150px',
                color: 'rgba(225, 29, 72, 0.05)',
                fontWeight: 900,
                pointerEvents: 'none',
                userSelect: 'none'
              }}>
                DR
              </div>
            </div>

            {/* Sub-navigation inside coverage */}
            <div style={{ display: 'flex', gap: '12px', background: '#F8FAFC', padding: '8px', borderRadius: '4px', border: '1px solid #E2E8F0', marginBottom: '12px', flexWrap: 'wrap' }}>
              {coverageState['dr-consult']?.on && (
                <button 
                  className={`btn-cover-tab ${doctorSubTab === 'consult' ? 'active doctor' : ''}`}
                  onClick={() => { setDoctorSubTab('consult'); setTimeout(() => window.lucide && window.lucide.createIcons(), 100); }}
                  style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
                >
                  <i data-lucide="users" style={{ width: '16px', height: '16px' }}></i>
                  Consultation Queue
                </button>
              )}
              {coverageState['dr-rx']?.on && (
                <button 
                  className={`btn-cover-tab ${doctorSubTab === 'prescriptions' ? 'active doctor' : ''}`}
                  onClick={() => { setDoctorSubTab('prescriptions'); setTimeout(() => window.lucide && window.lucide.createIcons(), 100); }}
                  style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
                >
                  <i data-lucide="pill" style={{ width: '16px', height: '16px' }}></i>
                  Prescription Writer
                </button>
              )}
              {coverageState['dr-laborder']?.on && (
                <button 
                  className={`btn-cover-tab ${doctorSubTab === 'labs' ? 'active doctor' : ''}`}
                  onClick={() => { setDoctorSubTab('labs'); setTimeout(() => window.lucide && window.lucide.createIcons(), 100); }}
                  style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
                >
                  <i data-lucide="beaker" style={{ width: '16px', height: '16px' }}></i>
                  Lab Orders
                </button>
              )}
              {coverageState['dr-stockview']?.on && (
                <button 
                  className={`btn-cover-tab ${doctorSubTab === 'stock' ? 'active doctor' : ''}`}
                  onClick={() => { setDoctorSubTab('stock'); setTimeout(() => window.lucide && window.lucide.createIcons(), 100); }}
                  style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
                >
                  <i data-lucide="clipboard-list" style={{ width: '16px', height: '16px' }}></i>
                  Pharmacy Stock View
                </button>
              )}
            </div>

            {doctorSubTab === 'consult' && (
              <div className="glass-card" style={{ padding: '12px', background: 'white', border: '1px solid #E2E8F0', borderRadius: '16px', boxShadow: '0 4px 20px rgba(0,0,0,0.02)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                  <h3 style={{ fontSize: '14px', fontWeight: 800, color: '#0F172A', display: 'flex', alignItems: 'center', gap: '8px', margin: 0 }}>
                    <i data-lucide="users" style={{ color: '#E11D48' }}></i>
                    Consultation Roster
                  </h3>
                  <span className="badge-pill" style={{ background: '#FFF1F2', color: '#E11D48', fontWeight: 700, fontSize: '12px' }}>
                    {coverageConsultations.length} Patient{coverageConsultations.length !== 1 ? 's' : ''} in Queue
                  </span>
                </div>
                {selectedConsultation ? (
                  <div style={{ border: '1px solid #E2E8F0', borderRadius: '16px', padding: '12px', background: '#F8FAFC', boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.01)' }}>
                    {/* Patient Profile Summary Card */}
                    <div className="glass-card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px', background: 'white', borderRadius: '4px', border: '1px solid #E2E8F0', marginBottom: '12px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                        <div style={{
                          width: '46px',
                          height: '26px',
                          borderRadius: '4px',
                          background: '#FFF1F2',
                          color: '#E11D48',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontWeight: 800,
                          fontSize: '14px'
                        }}>
                          <i data-lucide="user"></i>
                        </div>
                        <div>
                          <div style={{ fontSize: '14px', fontWeight: 800, color: '#0F172A' }}>{selectedConsultation.name}</div>
                          <div style={{ fontSize: '12.5px', color: '#64748B', marginTop: '2px', fontWeight: 600 }}>
                            Patient ID: <span style={{ fontFamily: 'monospace', color: '#334155', fontWeight: 700 }}>{selectedConsultation.patientId || 'N/A'}</span> · {selectedConsultation.age}y ({selectedConsultation.gender})
                          </div>
                        </div>
                      </div>
                      <button 
                        type="button" 
                        className="btn-cover-action doctor-outline" 
                        onClick={() => setSelectedConsultation(null)} 
                        style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                      >
                        <i data-lucide="arrow-left" style={{ width: '14px', height: '14px' }}></i>
                        Cancel Consultation
                      </button>
                    </div>

                    {/* Step-navigation within the Examination workspace */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                      <button 
                        type="button"
                        className={`btn-cover-tab ${examineStep === 'notes' ? 'active doctor' : ''}`}
                        onClick={() => { setExamineStep('notes'); setTimeout(() => window.lucide && window.lucide.createIcons(), 100); }}
                        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '12px' }}
                      >
                        <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '20px', height: '20px', borderRadius: '50%', background: examineStep === 'notes' ? 'white' : '#E2E8F0', color: examineStep === 'notes' ? '#E11D48' : '#64748B', fontSize: '11px', fontWeight: 900 }}>1</span>
                        <i data-lucide="clipboard-list" style={{ width: '16px', height: '16px' }}></i>
                        Clinical Notes
                      </button>
                      <button 
                        type="button"
                        className={`btn-cover-tab ${examineStep === 'prescriptions' ? 'active doctor' : ''}`}
                        onClick={() => { setExamineStep('prescriptions'); setTimeout(() => window.lucide && window.lucide.createIcons(), 100); }}
                        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '12px' }}
                      >
                        <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '20px', height: '20px', borderRadius: '50%', background: examineStep === 'prescriptions' ? 'white' : '#E2E8F0', color: examineStep === 'prescriptions' ? '#E11D48' : '#64748B', fontSize: '11px', fontWeight: 900 }}>2</span>
                        <i data-lucide="pill" style={{ width: '16px', height: '16px' }}></i>
                        Prescription {hasPrescriptionEnabled ? '✓' : ''}
                      </button>
                      <button 
                        type="button"
                        className={`btn-cover-tab ${examineStep === 'labs' ? 'active doctor' : ''}`}
                        onClick={() => { setExamineStep('labs'); setTimeout(() => window.lucide && window.lucide.createIcons(), 100); }}
                        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '12px' }}
                      >
                        <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '20px', height: '20px', borderRadius: '50%', background: examineStep === 'labs' ? 'white' : '#E2E8F0', color: examineStep === 'labs' ? '#E11D48' : '#64748B', fontSize: '11px', fontWeight: 900 }}>3</span>
                        <i data-lucide="beaker" style={{ width: '16px', height: '16px' }}></i>
                        Lab Tests {hasLabOrderEnabled ? '✓' : ''}
                      </button>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', minHeight: '260px' }}>
                      {/* STEP 1: SOAP CLINICAL NOTES */}
                      {examineStep === 'notes' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
                          <div className="glass-card" style={{ background: '#FFFDFD', padding: '18px', border: '1px solid #FEE2E2', borderRadius: '4px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                              <i data-lucide="clipboard-list" style={{ color: '#E11D48', width: '18px', height: '18px' }}></i>
                              <label style={{ fontSize: '12px', fontWeight: 800, color: '#9F1239', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Chief Complaints / Symptoms</label>
                            </div>
                            <div style={{ fontSize: '14.5px', color: '#3F0712', fontWeight: 650, lineHeight: '1.4' }}>{selectedConsultation.symptoms}</div>
                          </div>
                          <div>
                            <label style={{ fontSize: '12px', fontWeight: 800, color: '#475569', textTransform: 'uppercase', marginBottom: '6px', display: 'block', letterSpacing: '0.5px' }}>Diagnosis</label>
                            <input 
                              type="text" 
                              placeholder="e.g. Acute Viral Bronchitis" 
                              value={consultationDiagnosis} 
                              onChange={e => {
                                setConsultationDiagnosis(e.target.value);
                                setConsultationRxDiagnosis(e.target.value);
                              }} 
                              style={{ width: '100%', height: '42px', border: '1px solid #CBD5E1', borderRadius: '2px', padding: '0 14px', fontSize: '12px', fontWeight: 650, outline: 'none', background: 'white', transition: 'border 0.2s' }} 
                              onFocus={e => e.target.style.borderColor = '#E11D48'}
                              onBlur={e => e.target.style.borderColor = '#CBD5E1'}
                            />
                          </div>
                          <div>
                            <label style={{ fontSize: '12px', fontWeight: 800, color: '#475569', textTransform: 'uppercase', marginBottom: '6px', display: 'block', letterSpacing: '0.5px' }}>SOAP / Clinical Notes</label>
                            <textarea 
                              placeholder="Write clinical examination findings, vitals summary, and clinical advice..." 
                              value={consultationNotes} 
                              onChange={e => setConsultationNotes(e.target.value)} 
                              style={{ width: '100%', height: '110px', border: '1px solid #CBD5E1', borderRadius: '2px', padding: '12px 14px', fontSize: '12px', fontWeight: 650, outline: 'none', resize: 'none', background: 'white', transition: 'border 0.2s' }} 
                              onFocus={e => e.target.style.borderColor = '#E11D48'}
                              onBlur={e => e.target.style.borderColor = '#CBD5E1'}
                            />
                          </div>

                          <div style={{ marginTop: '8px', padding: '14px', background: '#F1F5F9', borderRadius: '2px', display: 'flex', gap: '12px', border: '1px solid #E2E8F0' }}>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '12px', fontWeight: 700, color: '#334155', cursor: 'pointer' }}>
                              <input 
                                type="checkbox" 
                                checked={hasPrescriptionEnabled} 
                                onChange={e => {
                                  setHasPrescriptionEnabled(e.target.checked);
                                  if (e.target.checked) {
                                    setExamineStep('prescriptions');
                                    setTimeout(() => window.lucide && window.lucide.createIcons(), 100);
                                  }
                                }} 
                                style={{ width: '18px', height: '18px', cursor: 'pointer', accentColor: '#E11D48' }}
                              />
                              Prescribe Medicines
                            </label>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '12px', fontWeight: 700, color: '#334155', cursor: 'pointer' }}>
                              <input 
                                type="checkbox" 
                                checked={hasLabOrderEnabled} 
                                onChange={e => {
                                  setHasLabOrderEnabled(e.target.checked);
                                  if (e.target.checked) {
                                    setExamineStep('labs');
                                    setTimeout(() => window.lucide && window.lucide.createIcons(), 100);
                                  }
                                }} 
                                style={{ width: '18px', height: '18px', cursor: 'pointer', accentColor: '#E11D48' }}
                              />
                              Order Laboratory Tests
                            </label>
                          </div>
                        </div>
                      )}

                      {/* STEP 2: PRESCRIPTION WRITER */}
                      {examineStep === 'prescriptions' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <h4 style={{ margin: 0, fontSize: '14.5px', fontWeight: 800, color: '#0F172A', display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <i data-lucide="pill" style={{ color: '#E11D48' }}></i>
                              Prescribe Medicines
                            </h4>
                            <button 
                              type="button" 
                              className="btn-cover-action doctor-outline" 
                              onClick={() => setConsultationRxMedicines(prev => [...prev, { id: Date.now(), name: '', dose: '', freq: '', duration: '', timing: 'After Food', notes: '' }])} 
                              style={{ padding: '6px 14px', fontSize: '12.5px', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                            >
                              <i data-lucide="plus" style={{ width: '14px', height: '14px' }}></i>
                              Add Drug Row
                            </button>
                          </div>

                          <div style={{ background: 'white', borderRadius: '4px', border: '1px solid #E2E8F0', padding: '8px', overflowX: 'auto', boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                              <thead>
                                <tr style={{ borderBottom: '1px solid #F1F5F9' }}>
                                  <th style={{ padding: '10px 8px', fontSize: '11px', fontWeight: 800, color: '#64748B', textAlign: 'left', textTransform: 'uppercase' }}>DRUG NAME</th>
                                  <th style={{ padding: '10px 8px', fontSize: '11px', fontWeight: 800, color: '#64748B', textAlign: 'left', textTransform: 'uppercase' }}>DOSAGE</th>
                                  <th style={{ padding: '10px 8px', fontSize: '11px', fontWeight: 800, color: '#64748B', textAlign: 'left', textTransform: 'uppercase' }}>FREQUENCY</th>
                                  <th style={{ padding: '10px 8px', fontSize: '11px', fontWeight: 800, color: '#64748B', textAlign: 'left', textTransform: 'uppercase' }}>DURATION</th>
                                  <th style={{ padding: '10px 8px', fontSize: '11px', fontWeight: 800, color: '#64748B', textAlign: 'left', textTransform: 'uppercase' }}>TIMING</th>
                                  <th style={{ padding: '10px 8px', fontSize: '11px', fontWeight: 800, color: '#64748B', textAlign: 'right', textTransform: 'uppercase' }}>ACTION</th>
                                </tr>
                              </thead>
                              <tbody>
                                {consultationRxMedicines.map((med) => (
                                  <tr key={med.id} style={{ borderBottom: '1px solid #F8FAFC' }}>
                                    <td style={{ padding: '8px', position: 'relative' }}>
                                      <input 
                                        type="text" 
                                        value={med.name} 
                                        placeholder="Type medicine..." 
                                        onChange={e => {
                                          const val = e.target.value;
                                          setConsultationRxMedicines(prev => prev.map(m => m.id === med.id ? { ...m, name: val } : m));
                                          
                                          // Auto-fill from defaults on exact match
                                          const matchKey = Object.keys(medicineDefaults).find(k => k.toLowerCase() === val.toLowerCase().trim());
                                          if (matchKey) {
                                            const def = medicineDefaults[matchKey];
                                            setConsultationRxMedicines(prev => prev.map(m => m.id === med.id ? { ...m, dose: def.dose || m.dose, freq: def.freq || m.freq, duration: def.duration || m.duration, timing: def.timing || m.timing } : m));
                                          }
                                        }} 
                                        onFocus={() => setActiveMedFocus(med.id)}
                                        onBlur={() => {
                                          setTimeout(() => {
                                            if (!isHoveringSuggestions) {
                                              setActiveMedFocus(null);
                                            }
                                          }, 150);
                                        }}
                                        style={{ width: '160px', height: '36px', border: '1px solid #CBD5E1', borderRadius: '2px', padding: '0 10px', fontSize: '13px', outline: 'none', background: 'white' }} 
                                        required 
                                      />
                                      {activeMedFocus === med.id && (() => {
                                        const typedVal = (med.name || '').trim().toLowerCase();
                                        const allNames = Array.from(new Set([
                                          ...(coveragePharmacyInventory || []).map(m => m.name),
                                          ...Object.keys(medicineDefaults).map(k => k.charAt(0).toUpperCase() + k.slice(1))
                                        ]));
                                        const filtered = typedVal 
                                          ? allNames.filter(n => n.toLowerCase().includes(typedVal) && n.toLowerCase() !== typedVal).slice(0, 6)
                                          : allNames.slice(0, 6);
                                        if (filtered.length === 0) return null;
                                        return (
                                          <div 
                                            data-lenis-prevent
                                            onMouseEnter={() => setIsHoveringSuggestions(true)}
                                            onMouseLeave={() => setIsHoveringSuggestions(false)}
                                            style={{ 
                                              position: 'absolute', top: 'calc(100% + 4px)', left: 0, 
                                              width: '260px', zIndex: 1200, padding: '4px',
                                              boxShadow: '0 10px 30px rgba(15, 23, 42, 0.15)', 
                                              background: 'white', borderRadius: '2px', 
                                              border: '1px solid #E2E8F0',
                                              maxHeight: '180px', overflowY: 'auto'
                                            }}
                                          >
                                            {filtered.map((mName, sIdx) => {
                                              const dbMatch = (coveragePharmacyInventory || []).find(m => m.name.toLowerCase() === mName.toLowerCase());
                                              const stockStatus = dbMatch?.status || null;
                                              const stockColor = stockStatus === 'In Stock' ? '#16A34A' : stockStatus === 'Low Stock' ? '#D97706' : stockStatus === 'Out of Stock' ? '#DC2626' : '#64748B';
                                              const stockBg = stockStatus === 'In Stock' ? '#DCFCE7' : stockStatus === 'Low Stock' ? '#FEF3C7' : stockStatus === 'Out of Stock' ? '#FEE2E2' : '#F1F5F9';
                                              
                                              const selectSuggestion = (e) => {
                                                e.preventDefault();
                                                e.stopPropagation();
                                                const matchedKey = Object.keys(medicineDefaults)
                                                  .sort((a, b) => b.length - a.length)
                                                  .find(k => mName.toLowerCase().includes(k.toLowerCase()) || k.toLowerCase().includes(mName.toLowerCase()));
                                                if (matchedKey) {
                                                  const def = medicineDefaults[matchedKey];
                                                  setConsultationRxMedicines(prev => prev.map(m => m.id === med.id ? { ...m, name: mName, dose: def.dose || m.dose, freq: def.freq || m.freq, duration: def.duration || m.duration, timing: def.timing || m.timing } : m));
                                                } else {
                                                  setConsultationRxMedicines(prev => prev.map(m => m.id === med.id ? { ...m, name: mName } : m));
                                                }
                                                setActiveMedFocus(null);
                                                setIsHoveringSuggestions(false);
                                              };

                                              return (
                                                <div 
                                                  key={sIdx} 
                                                  onMouseDown={selectSuggestion}
                                                  onClick={selectSuggestion}
                                                  style={{ 
                                                    padding: '8px 10px', borderRadius: '6px', cursor: 'pointer', 
                                                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                                    fontSize: '12.5px', transition: 'all 0.15s ease',
                                                    textAlign: 'left'
                                                  }}
                                                  onMouseEnter={e => e.currentTarget.style.background = '#F1F5F9'}
                                                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                                                >
                                                  <span style={{ fontWeight: 700, color: '#1E293B', pointerEvents: 'none' }}>{mName}</span>
                                                  {stockStatus && (
                                                    <span style={{ fontSize: '9.5px', fontWeight: 800, color: stockColor, padding: '2px 6px', borderRadius: '4px', background: stockBg, pointerEvents: 'none' }}>
                                                      {stockStatus}
                                                    </span>
                                                  )}
                                                </div>
                                              );
                                            })}
                                          </div>
                                        );
                                      })()}
                                    </td>
                                    <td style={{ padding: '8px' }}>
                                      <input 
                                        type="text" 
                                        value={med.dose} 
                                        placeholder="e.g. 1 Tab" 
                                        onChange={e => {
                                          const val = e.target.value;
                                          setConsultationRxMedicines(prev => prev.map(m => m.id === med.id ? { ...m, dose: val } : m));
                                        }} 
                                        style={{ width: '85px', height: '36px', border: '1px solid #CBD5E1', borderRadius: '2px', padding: '0 8px', fontSize: '13px', outline: 'none' }} 
                                      />
                                    </td>
                                    <td style={{ padding: '8px' }}>
                                      <input 
                                        type="text" 
                                        value={med.freq} 
                                        placeholder="e.g. BD" 
                                        onChange={e => {
                                          const val = e.target.value;
                                          setConsultationRxMedicines(prev => prev.map(m => m.id === med.id ? { ...m, freq: val } : m));
                                        }} 
                                        style={{ width: '85px', height: '36px', border: '1px solid #CBD5E1', borderRadius: '2px', padding: '0 8px', fontSize: '13px', outline: 'none' }} 
                                      />
                                    </td>
                                    <td style={{ padding: '8px' }}>
                                      <input 
                                        type="text" 
                                        value={med.duration} 
                                        placeholder="e.g. 5 Days" 
                                        onChange={e => {
                                          const val = e.target.value;
                                          setConsultationRxMedicines(prev => prev.map(m => m.id === med.id ? { ...m, duration: val } : m));
                                        }} 
                                        style={{ width: '85px', height: '36px', border: '1px solid #CBD5E1', borderRadius: '2px', padding: '0 8px', fontSize: '13px', outline: 'none' }} 
                                      />
                                    </td>
                                    <td style={{ padding: '8px' }}>
                                      <select 
                                        value={med.timing} 
                                        onChange={e => {
                                          const val = e.target.value;
                                          setConsultationRxMedicines(prev => prev.map(m => m.id === med.id ? { ...m, timing: val } : m));
                                        }} 
                                        style={{ height: '36px', border: '1px solid #CBD5E1', borderRadius: '2px', fontSize: '12.5px', fontWeight: 600, outline: 'none', cursor: 'pointer', padding: '0 4px', background: 'white' }}
                                      >
                                        <option value="After Food">After Food</option>
                                        <option value="Before Food">Before Food</option>
                                        <option value="Empty Stomach">Empty Stomach</option>
                                        <option value="At Bedtime">At Bedtime</option>
                                      </select>
                                    </td>
                                    <td style={{ padding: '8px', textAlign: 'right' }}>
                                      <button 
                                        type="button" 
                                        className="btn-cover-action doctor-outline" 
                                        onClick={() => setConsultationRxMedicines(prev => prev.filter(m => m.id !== med.id))} 
                                        style={{ color: '#EF4444', borderColor: '#FEE2E2', padding: '6px 10px', fontSize: '12px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                                      >
                                        <i data-lucide="trash-2" style={{ width: '12px', height: '12px' }}></i>
                                        Delete
                                      </button>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>

                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px' }}>
                            <input 
                              type="checkbox" 
                              id="enableRxCheck" 
                              checked={hasPrescriptionEnabled} 
                              onChange={e => setHasPrescriptionEnabled(e.target.checked)} 
                              style={{ width: '18px', height: '18px', cursor: 'pointer', accentColor: '#E11D48' }}
                            />
                            <label htmlFor="enableRxCheck" style={{ fontSize: '13px', fontWeight: 700, color: '#475569', cursor: 'pointer' }}>
                              Include this prescription with consultation completion
                            </label>
                          </div>
                        </div>
                      )}

                      {/* STEP 3: LAB ORDERS */}
                      {examineStep === 'labs' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                          <h4 style={{ margin: 0, fontSize: '14.5px', fontWeight: 800, color: '#0F172A', display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <i data-lucide="beaker" style={{ color: '#E11D48' }}></i>
                            Order Lab Investigations
                          </h4>
                          <div>
                            <label style={{ fontSize: '12px', fontWeight: 800, color: '#475569', textTransform: 'uppercase', marginBottom: '8px', display: 'block', letterSpacing: '0.5px' }}>Search & Select Laboratory Investigations</label>
                            
                            <div style={{ position: 'relative' }}>
                              <input 
                                type="text" 
                                placeholder="Search tests (e.g. CBC, Lipid Profile, HbA1c...)" 
                                value={labSearchQuery}
                                onChange={e => {
                                  setLabSearchQuery(e.target.value);
                                  setShowLabSuggestions(true);
                                }}
                                onFocus={() => setShowLabSuggestions(true)}
                                onBlur={() => setTimeout(() => setShowLabSuggestions(false), 200)}
                                style={{ width: '100%', height: '42px', border: '1px solid #CBD5E1', borderRadius: '2px', padding: '0 14px', fontSize: '12px', fontWeight: 650, outline: 'none', background: 'white' }} 
                              />
                              
                              {showLabSuggestions && labSearchQuery.trim() && (
                                <div 
                                  data-lenis-prevent
                                  style={{
                                    position: 'absolute',
                                    top: '100%',
                                    left: 0,
                                    right: 0,
                                    background: 'white',
                                    border: '1px solid #E2E8F0',
                                    borderRadius: '2px',
                                    boxShadow: '0 10px 30px rgba(0,0,0,0.1)',
                                    zIndex: 10,
                                    marginTop: '4px',
                                    maxHeight: '180px',
                                    overflowY: 'auto',
                                    padding: '4px'
                                  }}
                                >
                                  {availableTests
                                    .filter(t => t.toLowerCase().includes(labSearchQuery.toLowerCase()))
                                    .map(t => (
                                      <div 
                                        key={t}
                                        onMouseDown={() => {
                                          if (!consultationLabTests.includes(t)) {
                                            setConsultationLabTests(prev => [...prev, t]);
                                            setHasLabOrderEnabled(true);
                                          }
                                          setLabSearchQuery('');
                                          setShowLabSuggestions(false);
                                        }}
                                        style={{ padding: '8px 12px', borderRadius: '6px', cursor: 'pointer', fontSize: '13px', fontWeight: 700, color: '#334155', transition: '0.2s', textAlign: 'left' }}
                                        onMouseEnter={e => e.currentTarget.style.background = '#F1F5F9'}
                                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                                      >
                                        {t}
                                      </div>
                                    ))}
                                </div>
                              )}
                            </div>

                            {/* Selected Lab Badges */}
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '12px' }}>
                              {consultationLabTests.map(lab => (
                                <span 
                                  key={lab} 
                                  style={{ 
                                    background: '#F5F3FF', 
                                    color: '#7C3AED', 
                                    border: '1px solid #E9D5FF', 
                                    fontSize: '12px', 
                                    fontWeight: 800, 
                                    padding: '6px 12px', 
                                    borderRadius: '20px', 
                                    display: 'inline-flex', 
                                    alignItems: 'center', 
                                    gap: '6px' 
                                  }}
                                >
                                  {lab}
                                  <span 
                                    onClick={() => setConsultationLabTests(prev => prev.filter(item => item !== lab))}
                                    style={{ cursor: 'pointer', fontSize: '12px', fontWeight: 'bold', color: '#7C3AED', display: 'inline-flex', alignItems: 'center' }}
                                  >
                                    ×
                                  </span>
                                </span>
                              ))}
                            </div>
                          </div>
                          
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '8px' }}>
                            <input 
                              type="checkbox" 
                              id="enableLabCheck" 
                              checked={hasLabOrderEnabled} 
                              onChange={e => setHasLabOrderEnabled(e.target.checked)} 
                              style={{ width: '18px', height: '18px', cursor: 'pointer', accentColor: '#E11D48' }}
                            />
                            <label htmlFor="enableLabCheck" style={{ fontSize: '13px', fontWeight: 700, color: '#475569', cursor: 'pointer' }}>
                              Include these lab test orders with consultation completion
                            </label>
                          </div>
                        </div>
                      )}
                    </div>

                    <div style={{ display: 'flex', gap: '12px', borderTop: '1px solid #E2E8F0', paddingTop: '20px', marginTop: '24px' }}>
                      {examineStep !== 'notes' && (
                        <button 
                          type="button" 
                          className="btn-cover-action doctor-outline" 
                          onClick={() => {
                            if (examineStep === 'prescriptions') setExamineStep('notes');
                            if (examineStep === 'labs') setExamineStep('prescriptions');
                            setTimeout(() => window.lucide && window.lucide.createIcons(), 100);
                          }}
                          style={{ flex: 1, height: '26px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
                        >
                          <i data-lucide="arrow-left" style={{ width: '16px', height: '16px' }}></i>
                          Back
                        </button>
                      )}
                      
                      {examineStep !== 'labs' ? (
                        <button 
                          type="button" 
                          className="btn-cover-action doctor-primary" 
                          onClick={() => {
                            if (examineStep === 'notes') setExamineStep('prescriptions');
                            else if (examineStep === 'prescriptions') setExamineStep('labs');
                            setTimeout(() => window.lucide && window.lucide.createIcons(), 100);
                          }}
                          style={{ flex: 1, height: '26px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
                        >
                          Next Step
                          <i data-lucide="arrow-right" style={{ width: '16px', height: '16px' }}></i>
                        </button>
                      ) : null}

                      <button 
                        type="button"
                        className="btn-cover-action doctor-primary" 
                        style={{ flex: 2, height: '26px', background: '#10B981', borderColor: '#10B981', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
                        onMouseEnter={e => e.currentTarget.style.background = '#059669'}
                        onMouseLeave={e => e.currentTarget.style.background = '#10B981'}
                        onClick={async () => {
                          if (!consultationDiagnosis) {
                            showToast("Please provide a diagnosis first.", "error");
                            setExamineStep('notes');
                            return;
                          }
                          try {
                            // 1. Save consultation SOAP notes & complete appointment
                            await api.put(`/appointments/${selectedConsultation.id}`, {
                              status: 'Completed',
                              notes: consultationNotes,
                              diagnosis: consultationDiagnosis
                            });
                            showToast(`Consultation note saved successfully for ${selectedConsultation.name}!`, 'success');

                            // 2. Save prescription if enabled
                            if (hasPrescriptionEnabled && consultationRxMedicines.length > 0) {
                              const items = consultationRxMedicines.map(m => {
                                const days = parseInt(m.duration, 10) || 5;
                                let dailyFreq = 1;
                                const f = (m.freq || 'OD').toLowerCase();
                                if (f.includes('twice') || f.includes('bd') || f.includes('2')) dailyFreq = 2;
                                else if (f.includes('thrice') || f.includes('tds') || f.includes('3')) dailyFreq = 3;
                                else if (f.includes('four') || f.includes('qd') || f.includes('4')) dailyFreq = 4;
                                const qty = days * dailyFreq;
                                return {
                                  medicine: m.name,
                                  dosage: m.dose || '1 Tab',
                                  duration: m.duration || '5 Days',
                                  instructions: `${m.freq || 'OD'} · ${m.timing || 'After Food'}. ${m.notes || ''}`.trim(),
                                  quantity: qty
                                };
                              });
                              await api.post('/prescriptions', {
                                patientId: selectedConsultation.patientId,
                                doctorId: doctors[0]?._id || null,
                                appointmentId: selectedConsultation.id,
                                diagnosis: consultationRxDiagnosis || consultationDiagnosis,
                                items,
                                status: 'Pending Pharmacy Dispatch'
                              });
                              showToast(`Prescription saved and dispatched successfully!`, 'success');
                            }

                            // 3. Save lab orders if enabled
                            if (hasLabOrderEnabled && consultationLabTests.length > 0) {
                              for (const test of consultationLabTests) {
                                await api.post('/labs', {
                                  patientId: selectedConsultation.patientId,
                                  doctorId: doctors[0]?._id || null,
                                  appointmentId: selectedConsultation.id,
                                  testName: test,
                                  status: 'Pending'
                                });
                              }
                              showToast(`${consultationLabTests.length} lab test${consultationLabTests.length > 1 ? 's' : ''} referred successfully!`, 'success');
                            }

                            // Reset state
                            setSelectedConsultation(null);
                            setConsultationNotes('');
                            setConsultationDiagnosis('');
                            setConsultationRxDiagnosis('');
                            setConsultationRxMedicines([]);
                            setConsultationLabTest('Complete Blood Count (CBC)');
                            setConsultationLabTests([]);
                            setHasPrescriptionEnabled(false);
                            setHasLabOrderEnabled(false);
                            fetchCoverageData();
                          } catch (e) {
                            console.error(e);
                            showToast("Failed to complete consultation on backend.", "error");
                          }
                        }}
                      >
                        <i data-lucide="check-circle" style={{ width: '18px', height: '18px' }}></i>
                        Save & Complete Consultation
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div style={{ marginBottom: '16px', position: 'relative' }}>
                      <input 
                        type="text" 
                        placeholder="Search patient by name or patient ID..." 
                        value={doctorSearchQuery}
                        onChange={e => setDoctorSearchQuery(e.target.value)}
                        style={{ width: '100%', height: '40px', border: '1px solid #CBD5E1', borderRadius: '2px', padding: '0 12px 0 36px', fontSize: '12px', outline: 'none', color: '#0F172A', boxSizing: 'border-box' }}
                      />
                      <i data-lucide="search" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', width: '16px', height: '16px', color: '#64748B', display: 'flex', alignItems: 'center' }}></i>
                    </div>
                    <div className="table-responsive">
                      <table className="elite-table" style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                        <thead>
                          <tr>
                            <th style={{ width: '60px' }}>AVATAR</th>
                            <th>PATIENT INFO</th>
                            <th>CHIEF COMPLAINTS</th>
                            <th>STATUS</th>
                            <th style={{ textAlign: 'right' }}>ACTIONS</th>
                          </tr>
                        </thead>
                        <tbody>
                          {coverageConsultations
                            .filter(c => 
                              c.name?.toLowerCase().includes(doctorSearchQuery.toLowerCase()) || 
                              c.patientId?.toLowerCase().includes(doctorSearchQuery.toLowerCase())
                            )
                            .map((item, idx) => {
                              const initials = (item.name || '').split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
                              return (
                                <tr key={idx} style={{ transition: 'background 0.2s' }}>
                                  <td>
                                    <div style={{
                                      width: '40px',
                                      height: '40px',
                                      borderRadius: '50%',
                                      background: item.gender === 'Female' ? '#FCE7F3' : '#DBEAFE',
                                      color: item.gender === 'Female' ? '#DB2777' : '#2563EB',
                                      display: 'flex',
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                      fontWeight: 800,
                                      fontSize: '12px',
                                      border: '1px solid rgba(0,0,0,0.05)'
                                    }}>
                                      {initials}
                                    </div>
                                  </td>
                                  <td>
                                    <div style={{ fontWeight: 800, color: '#1E293B', fontSize: '12px' }}>{item.name}</div>
                                    <div style={{ fontSize: '12px', color: '#64748B', marginTop: '2px', fontWeight: 600 }}>
                                      Patient ID: <span style={{ fontFamily: 'monospace', color: '#334155', fontWeight: 700 }}>{item.patientId || 'N/A'}</span> · {item.age}y ({item.gender})
                                    </div>
                                  </td>
                                  <td>
                                    <div style={{ fontWeight: 700, color: '#475569', fontSize: '12px' }}>{item.reason || 'Routine Checkup'}</div>
                                    {item.notes && <div style={{ fontSize: '11px', color: '#94A3B8', marginTop: '2px' }}>{item.notes}</div>}
                                  </td>
                                  <td>
                                    <span className="badge-pill" style={{
                                      background: item.status === 'Completed' ? '#E6F4EA' : item.status === 'Checked Out' ? '#EFF6FF' : '#FFF7ED',
                                      color: item.status === 'Completed' ? '#059669' : item.status === 'Checked Out' ? '#2563EB' : '#D97706',
                                      fontWeight: 800,
                                      fontSize: '12px'
                                    }}>{item.status}</span>
                                  </td>
                                  <td style={{ textAlign: 'right' }}>
                                    {item.status !== 'Completed' && item.status !== 'Checked Out' ? (
                                      <button 
                                        type="button"
                                        className="btn-cover-action doctor-primary"
                                        onClick={() => {
                                          setSelectedConsultation(item);
                                          setConsultationNotes(item.notes || '');
                                          setConsultationDiagnosis(item.diagnosis || '');
                                          setExamineStep('notes');
                                          setHasPrescriptionEnabled(false);
                                          setHasLabOrderEnabled(false);
                                          setConsultationRxDiagnosis(item.diagnosis || '');
                                          setConsultationRxMedicines([
                                            { id: Date.now(), name: 'Paracetamol 650', dose: '1 Tab', freq: '1 Tab BD', duration: '5 Days', timing: 'After Food', notes: 'For fever' }
                                          ]);
                                          setConsultationLabTest('Complete Blood Count (CBC)');
                                          setRxPatientId(item.patientId || '');
                                          setRxDiagnosis(item.diagnosis || '');
                                          setLabPatientId(item.patientId || '');
                                          setTimeout(() => window.lucide && window.lucide.createIcons(), 100);
                                        }}
                                        style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                                      >
                                        <i data-lucide="stethoscope" style={{ width: '13px', height: '13px' }}></i>
                                        Examine Patient
                                      </button>
                                    ) : (
                                      <button 
                                        type="button"
                                        className="btn-cover-action doctor-outline"
                                        onClick={() => {
                                          showToast(`Diagnosis: ${item.diagnosis || 'None'}. Notes: ${item.notes || 'No notes'}`);
                                        }}
                                        style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                                      >
                                        <i data-lucide="eye" style={{ width: '13px', height: '13px' }}></i>
                                        View Notes
                                      </button>
                                    )}
                                  </td>
                                </tr>
                              );
                            })}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}
              </div>
            )}

            {/* SUBTAB: PRESCRIPTION WRITER */}
            {doctorSubTab === 'prescriptions' && (
              <div className="glass-card" style={{ padding: '12px', background: 'white', border: '1px solid #E2E8F0', borderRadius: '16px', boxShadow: '0 4px 20px rgba(0,0,0,0.02)' }}>
                <h3 style={{ fontSize: '14px', fontWeight: 800, color: '#0F172A', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <i data-lucide="pill" style={{ color: '#E11D48' }}></i>
                  Emergency Prescription Composer
                </h3>
                <form onSubmit={async (e) => {
                  e.preventDefault();
                  if (!rxPatientId) {
                    showToast('Please select a patient', 'error');
                    return;
                  }
                  try {
                    const items = rxMedicines.map(m => {
                      const days = parseInt(m.duration, 10) || 5;
                      let dailyFreq = 1;
                      const f = (m.freq || 'OD').toLowerCase();
                      if (f.includes('twice') || f.includes('bd') || f.includes('2')) dailyFreq = 2;
                      else if (f.includes('thrice') || f.includes('tds') || f.includes('3')) dailyFreq = 3;
                      else if (f.includes('four') || f.includes('qd') || f.includes('4')) dailyFreq = 4;
                      const qty = days * dailyFreq;
                      return {
                        medicine: m.name,
                        dosage: m.dose || '1 Tab',
                        duration: m.duration || '5 Days',
                        instructions: `${m.freq || 'OD'} · ${m.timing || 'After Food'}. ${m.notes || ''}`.trim(),
                        quantity: qty
                      };
                    });
                    await api.post('/prescriptions', {
                      patientId: rxPatientId,
                      doctorId: doctors[0]?._id || null,
                      diagnosis: rxDiagnosis,
                      items,
                      status: 'Pending Pharmacy Dispatch'
                    });
                    showToast(`Prescription saved and dispatched successfully!`, 'success');
                    setRxPatientId('');
                    setRxDiagnosis('');
                    setRxMedicines([{ id: Date.now(), name: 'Paracetamol 650', dose: '1 Tab', freq: '1 Tab BD', duration: '5 Days', timing: 'After Food', notes: 'For fever' }]);
                    fetchCoverageData();
                  } catch (err) {
                    console.error(err);
                    showToast('Failed to save prescription on backend.', 'error');
                  }
                }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '20px' }}>
                    <div>
                      <label style={{ fontSize: '12px', fontWeight: 800, color: '#475569', textTransform: 'uppercase', marginBottom: '8px', display: 'block', letterSpacing: '0.5px' }}>Patient Name / ID</label>
                      <select value={rxPatientId} onChange={e => setRxPatientId(e.target.value)} style={{ width: '100%', height: '42px', border: '1px solid #CBD5E1', borderRadius: '2px', padding: '0 12px', fontSize: '12px', fontWeight: 700, color: '#334155', cursor: 'pointer', outline: 'none', background: 'white' }} required>
                        <option value="">Select Patient...</option>
                        {patientsList.map(p => (
                          <option key={p._id} value={p._id}>{p.name} ({p.contact || 'No contact'})</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label style={{ fontSize: '12px', fontWeight: 800, color: '#475569', textTransform: 'uppercase', marginBottom: '8px', display: 'block', letterSpacing: '0.5px' }}>Diagnosis</label>
                      <input type="text" placeholder="e.g. Hypertension, Viral Fever" value={rxDiagnosis} onChange={e => setRxDiagnosis(e.target.value)} style={{ width: '100%', height: '42px', border: '1px solid #CBD5E1', borderRadius: '2px', padding: '0 14px', fontSize: '12px', fontWeight: 650, outline: 'none', background: 'white' }} required />
                    </div>
                  </div>

                  <div style={{ marginBottom: '12px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                      <h4 style={{ margin: 0, fontSize: '14.5px', fontWeight: 800, color: '#0F172A', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <i data-lucide="list" style={{ color: '#E11D48', width: '16px', height: '16px' }}></i>
                        Prescribed Medications
                      </h4>
                      <button type="button" className="btn-cover-action doctor-outline" onClick={() => setRxMedicines(prev => [...prev, { id: Date.now(), name: '', dose: '', freq: '', duration: '', timing: 'After Food', notes: '' }])} style={{ padding: '6px 12px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                        <i data-lucide="plus" style={{ width: '14px', height: '14px' }}></i>
                        Add Row
                      </button>
                    </div>

                    <div style={{ background: 'white', borderRadius: '4px', border: '1px solid #E2E8F0', padding: '8px', overflowX: 'auto' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                          <tr style={{ borderBottom: '1px solid #F1F5F9' }}>
                            <th style={{ padding: '10px 8px', fontSize: '11px', fontWeight: 800, color: '#64748B', textAlign: 'left', textTransform: 'uppercase' }}>MEDICINE NAME</th>
                            <th style={{ padding: '10px 8px', fontSize: '11px', fontWeight: 800, color: '#64748B', textAlign: 'left', textTransform: 'uppercase' }}>DOSAGE</th>
                            <th style={{ padding: '10px 8px', fontSize: '11px', fontWeight: 800, color: '#64748B', textAlign: 'left', textTransform: 'uppercase' }}>FREQUENCY</th>
                            <th style={{ padding: '10px 8px', fontSize: '11px', fontWeight: 800, color: '#64748B', textAlign: 'left', textTransform: 'uppercase' }}>DURATION</th>
                            <th style={{ padding: '10px 8px', fontSize: '11px', fontWeight: 800, color: '#64748B', textAlign: 'left', textTransform: 'uppercase' }}>TIMING</th>
                            <th style={{ padding: '10px 8px', fontSize: '11px', fontWeight: 800, color: '#64748B', textAlign: 'right', textTransform: 'uppercase' }}>ACTION</th>
                          </tr>
                        </thead>
                        <tbody>
                          {rxMedicines.map((med, index) => (
                            <tr key={med.id} style={{ borderBottom: '1px solid #F8FAFC' }}>
                              <td style={{ padding: '8px', position: 'relative' }}>
                                <input 
                                  type="text" 
                                  value={med.name} 
                                  placeholder="Type medicine..." 
                                  onChange={e => {
                                    const val = e.target.value;
                                    setRxMedicines(prev => prev.map(m => m.id === med.id ? { ...m, name: val } : m));
                                    // Auto-fill from defaults on exact match
                                    const matchKey = Object.keys(medicineDefaults).find(k => k.toLowerCase() === val.toLowerCase().trim());
                                    if (matchKey) {
                                      const def = medicineDefaults[matchKey];
                                      setRxMedicines(prev => prev.map(m => m.id === med.id ? { ...m, dose: def.dose || m.dose, freq: def.freq || m.freq, duration: def.duration || m.duration, timing: def.timing || m.timing } : m));
                                    }
                                  }}
                                  onFocus={() => setActiveMedFocus(med.id)}
                                  onBlur={() => {
                                    setTimeout(() => {
                                      if (!isHoveringSuggestions) {
                                        setActiveMedFocus(null);
                                      }
                                    }, 150);
                                  }}
                                  style={{ width: '160px', height: '36px', border: '1px solid #CBD5E1', borderRadius: '2px', padding: '0 10px', fontSize: '13px', outline: 'none' }} 
                                  required 
                                />
                                {activeMedFocus === med.id && (() => {
                                  const typedVal = (med.name || '').trim().toLowerCase();
                                  const allNames = Array.from(new Set([
                                    ...(coveragePharmacyInventory || []).map(m => m.name),
                                    ...Object.keys(medicineDefaults).map(k => k.charAt(0).toUpperCase() + k.slice(1))
                                  ]));
                                  const filtered = typedVal 
                                    ? allNames.filter(n => n.toLowerCase().includes(typedVal) && n.toLowerCase() !== typedVal).slice(0, 6)
                                    : allNames.slice(0, 6);
                                  if (filtered.length === 0) return null;
                                  return (
                                    <div 
                                      data-lenis-prevent 
                                      onMouseEnter={() => setIsHoveringSuggestions(true)}
                                      onMouseLeave={() => setIsHoveringSuggestions(false)}
                                      style={{ 
                                        position: 'absolute', top: 'calc(100% + 4px)', left: 0, 
                                        width: '260px', zIndex: 1200, padding: '4px',
                                        boxShadow: '0 10px 30px rgba(15, 23, 42, 0.15)', 
                                        background: 'white', borderRadius: '2px', 
                                        border: '1px solid #E2E8F0',
                                        maxHeight: '180px', overflowY: 'auto'
                                      }}
                                    >
                                      {filtered.map((mName, sIdx) => {
                                        const dbMatch = (coveragePharmacyInventory || []).find(m => m.name.toLowerCase() === mName.toLowerCase());
                                        const stockStatus = dbMatch?.status || null;
                                        const stockColor = stockStatus === 'In Stock' ? '#16A34A' : stockStatus === 'Low Stock' ? '#D97706' : stockStatus === 'Out of Stock' ? '#DC2626' : '#64748B';
                                        const stockBg = stockStatus === 'In Stock' ? '#DCFCE7' : stockStatus === 'Low Stock' ? '#FEF3C7' : stockStatus === 'Out of Stock' ? '#FEE2E2' : '#F1F5F9';
                                        
                                        const selectSuggestion = (e) => {
                                          e.preventDefault();
                                          e.stopPropagation();
                                          const matchedKey = Object.keys(medicineDefaults)
                                            .sort((a, b) => b.length - a.length)
                                            .find(k => mName.toLowerCase().includes(k.toLowerCase()) || k.toLowerCase().includes(mName.toLowerCase()));
                                          if (matchedKey) {
                                            const def = medicineDefaults[matchedKey];
                                            setRxMedicines(prev => prev.map(m => m.id === med.id ? { ...m, name: mName, dose: def.dose || m.dose, freq: def.freq || m.freq, duration: def.duration || m.duration, timing: def.timing || m.timing } : m));
                                          } else {
                                            setRxMedicines(prev => prev.map(m => m.id === med.id ? { ...m, name: mName } : m));
                                          }
                                          setActiveMedFocus(null);
                                          setIsHoveringSuggestions(false);
                                        };

                                        return (
                                          <div 
                                            key={sIdx} 
                                            onMouseDown={selectSuggestion}
                                            onClick={selectSuggestion}
                                            style={{ 
                                              padding: '8px 10px', borderRadius: '6px', cursor: 'pointer', 
                                              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                              fontSize: '12.5px', transition: 'all 0.15s ease',
                                              textAlign: 'left'
                                            }}
                                            onMouseEnter={e => e.currentTarget.style.background = '#F1F5F9'}
                                            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                                          >
                                            <span style={{ fontWeight: 700, color: '#1E293B', pointerEvents: 'none' }}>{mName}</span>
                                            {stockStatus && (
                                              <span style={{ fontSize: '9.5px', fontWeight: 800, color: stockColor, padding: '2px 6px', borderRadius: '4px', background: stockBg, pointerEvents: 'none' }}>
                                                {stockStatus}
                                              </span>
                                            )}
                                          </div>
                                        );
                                      })}
                                    </div>
                                  );
                                })()}
                              </td>
                              <td style={{ padding: '8px' }}>
                                <input type="text" value={med.dose} placeholder="e.g. 1 Tab" onChange={e => {
                                  const val = e.target.value;
                                  setRxMedicines(prev => prev.map(m => m.id === med.id ? { ...m, dose: val } : m));
                                }} style={{ width: '85px', height: '36px', border: '1px solid #CBD5E1', borderRadius: '2px', padding: '0 8px', fontSize: '13px', outline: 'none' }} />
                              </td>
                              <td style={{ padding: '8px' }}>
                                <input type="text" value={med.freq} placeholder="e.g. OD" onChange={e => {
                                  const val = e.target.value;
                                  setRxMedicines(prev => prev.map(m => m.id === med.id ? { ...m, freq: val } : m));
                                }} style={{ width: '85px', height: '36px', border: '1px solid #CBD5E1', borderRadius: '2px', padding: '0 8px', fontSize: '13px', outline: 'none' }} />
                              </td>
                              <td style={{ padding: '8px' }}>
                                <input type="text" value={med.duration} placeholder="e.g. 5 Days" onChange={e => {
                                  const val = e.target.value;
                                  setRxMedicines(prev => prev.map(m => m.id === med.id ? { ...m, duration: val } : m));
                                }} style={{ width: '85px', height: '36px', border: '1px solid #CBD5E1', borderRadius: '2px', padding: '0 8px', fontSize: '13px', outline: 'none' }} />
                              </td>
                              <td style={{ padding: '8px' }}>
                                <select value={med.timing} onChange={e => {
                                  const val = e.target.value;
                                  setRxMedicines(prev => prev.map(m => m.id === med.id ? { ...m, timing: val } : m));
                                }} style={{ height: '36px', border: '1px solid #CBD5E1', borderRadius: '2px', fontSize: '12.5px', fontWeight: 600, outline: 'none', cursor: 'pointer', padding: '0 4px', background: 'white' }}>
                                  <option value="After Food">After Food</option>
                                  <option value="Before Food">Before Food</option>
                                  <option value="Empty Stomach">Empty Stomach</option>
                                  <option value="At Bedtime">At Bedtime</option>
                                </select>
                              </td>
                              <td style={{ padding: '8px', textAlign: 'right' }}>
                                <button type="button" disabled={rxMedicines.length === 1} className="btn-cover-action doctor-outline" onClick={() => setRxMedicines(prev => prev.filter(m => m.id !== med.id))} style={{ color: '#EF4444', borderColor: '#FEE2E2', padding: '6px 10px', fontSize: '12px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                  <i data-lucide="trash-2" style={{ width: '12px', height: '12px' }}></i>
                                  Delete
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  <button type="submit" className="btn-cover-action doctor-primary" style={{ width: '100%', height: '26px', fontSize: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                    <i data-lucide="send" style={{ width: '16px', height: '16px' }}></i>
                    Save & Dispatch Prescription to Pharmacy
                  </button>
                </form>
              </div>
            )}

            {/* SUBTAB: LAB ORDERS */}
            {doctorSubTab === 'labs' && (
              <div className="glass-card" style={{ padding: '12px', background: 'white', border: '1px solid #E2E8F0', borderRadius: '16px', boxShadow: '0 4px 20px rgba(0,0,0,0.02)' }}>
                <h3 style={{ fontSize: '14px', fontWeight: 800, color: '#0F172A', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <i data-lucide="beaker" style={{ color: '#E11D48' }}></i>
                  Clinical Diagnostic Referral
                </h3>
                <form onSubmit={async (e) => {
                  e.preventDefault();
                  if (!labPatientId) {
                    showToast('Please select a patient', 'error');
                    return;
                  }
                  if (slipLabTests.length === 0) {
                    showToast('Please select at least one laboratory test', 'error');
                    return;
                  }
                  try {
                    for (const test of slipLabTests) {
                      await api.post('/labs', {
                        patientId: labPatientId,
                        doctorId: doctors[0]?._id || null,
                        testName: test,
                        status: 'Pending'
                      });
                    }
                    showToast(`${slipLabTests.length} lab test${slipLabTests.length > 1 ? 's' : ''} referred successfully!`, 'success');
                    setLabPatientId('');
                    setSlipLabTests([]);
                    setSlipLabSearchQuery('');
                    fetchCoverageData();
                  } catch (err) {
                    console.error(err);
                    showToast('Failed to issue lab order.', 'error');
                  }
                }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '20px' }}>
                    <div>
                      <label style={{ fontSize: '12px', fontWeight: 800, color: '#475569', textTransform: 'uppercase', marginBottom: '8px', display: 'block', letterSpacing: '0.5px' }}>Patient Name</label>
                      <select name="labPatientId" value={labPatientId} onChange={e => setLabPatientId(e.target.value)} style={{ width: '100%', height: '42px', border: '1px solid #CBD5E1', borderRadius: '2px', padding: '0 12px', fontSize: '12px', fontWeight: 700, color: '#334155', cursor: 'pointer', outline: 'none', background: 'white' }} required>
                        <option value="">Select Patient...</option>
                        {patientsList.map(p => (
                          <option key={p._id} value={p._id}>{p.name} ({p.contact || 'No contact'})</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label style={{ fontSize: '12px', fontWeight: 800, color: '#475569', textTransform: 'uppercase', marginBottom: '8px', display: 'block', letterSpacing: '0.5px' }}>Search & Select Laboratory Investigations</label>
                      
                      <div style={{ position: 'relative' }}>
                        <input 
                          type="text" 
                          placeholder="Search tests (e.g. CBC, Vitamin D...)" 
                          value={slipLabSearchQuery}
                          onChange={e => {
                            setSlipLabSearchQuery(e.target.value);
                            setShowSlipLabSuggestions(true);
                          }}
                          onFocus={() => setShowSlipLabSuggestions(true)}
                          onBlur={() => setTimeout(() => setShowSlipLabSuggestions(false), 200)}
                          style={{ width: '100%', height: '42px', border: '1px solid #CBD5E1', borderRadius: '2px', padding: '0 12px', fontSize: '12px', fontWeight: 650, outline: 'none', background: 'white' }} 
                        />
                        
                        {showSlipLabSuggestions && slipLabSearchQuery.trim() && (
                          <div 
                            data-lenis-prevent
                            style={{
                              position: 'absolute',
                              top: '100%',
                              left: 0,
                              right: 0,
                              background: 'white',
                              border: '1px solid #E2E8F0',
                              borderRadius: '2px',
                              boxShadow: '0 10px 30px rgba(0,0,0,0.1)',
                              zIndex: 10,
                              marginTop: '4px',
                              maxHeight: '180px',
                              overflowY: 'auto',
                              padding: '4px'
                            }}
                          >
                            {availableTests
                              .filter(t => t.toLowerCase().includes(slipLabSearchQuery.toLowerCase()))
                              .map(t => (
                                <div 
                                  key={t}
                                  onMouseDown={() => {
                                    if (!slipLabTests.includes(t)) {
                                      setSlipLabTests(prev => [...prev, t]);
                                    }
                                    setSlipLabSearchQuery('');
                                    setShowSlipLabSuggestions(false);
                                  }}
                                  style={{ padding: '8px 12px', borderRadius: '6px', cursor: 'pointer', fontSize: '13px', fontWeight: 700, color: '#334155', transition: '0.2s', textAlign: 'left' }}
                                  onMouseEnter={e => e.currentTarget.style.background = '#F1F5F9'}
                                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                                >
                                  {t}
                                </div>
                              ))}
                          </div>
                        )}
                      </div>

                      {/* Selected Lab Badges */}
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '12px' }}>
                        {slipLabTests.map(lab => (
                          <span 
                            key={lab} 
                            style={{ 
                              background: '#F5F3FF', 
                              color: '#7C3AED', 
                              border: '1px solid #E9D5FF', 
                              fontSize: '12px', 
                              fontWeight: 800, 
                              padding: '6px 12px', 
                              borderRadius: '20px', 
                              display: 'inline-flex', 
                              alignItems: 'center', 
                              gap: '6px' 
                            }}
                          >
                            {lab}
                            <span 
                              onClick={() => setSlipLabTests(prev => prev.filter(item => item !== lab))}
                              style={{ cursor: 'pointer', fontSize: '12px', fontWeight: 'bold', color: '#7C3AED', display: 'inline-flex', alignItems: 'center' }}
                            >
                              ×
                            </span>
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                  <button type="submit" className="btn-cover-action doctor-primary" style={{ width: '100%', height: '26px', fontSize: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                    <i data-lucide="file-text" style={{ width: '16px', height: '16px' }}></i>
                    Issue Lab Investigation Referral Slip
                  </button>
                </form>
              </div>
            )}

            {/* SUBTAB: PHARMACY STOCK VIEW */}
            {doctorSubTab === 'stock' && (
              <div className="glass-card" style={{ padding: '12px', background: 'white', border: '1px solid #E2E8F0', borderRadius: '16px', boxShadow: '0 4px 20px rgba(0,0,0,0.02)' }}>
                <h3 style={{ fontSize: '14px', fontWeight: 800, color: '#0F172A', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <i data-lucide="clipboard-list" style={{ color: '#E11D48' }}></i>
                  Pharmacy Live Formulary Status
                </h3>
                <div className="table-responsive">
                  <table className="elite-table" style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                    <thead>
                      <tr>
                        <th>DRUG NAME</th>
                        <th>CURRENT STOCK</th>
                        <th>STATUS</th>
                      </tr>
                    </thead>
                    <tbody>
                      {coveragePharmacyInventory.map((item, idx) => {
                        const isHigh = item.stock > 50;
                        const isLow = item.stock > 0 && item.stock <= 50;
                        const badgeClass = isHigh ? 'new' : isLow ? 'waiting' : 'revisit';
                        const badgeStyle = isHigh 
                          ? { background: '#DCFCE7', color: '#16A34A' } 
                          : isLow 
                          ? { background: '#FEF3C7', color: '#D97706' } 
                          : { background: '#FEE2E2', color: '#DC2626' };
                        return (
                          <tr key={idx}>
                            <td style={{ padding: '14px 10px', fontWeight: 700, color: '#1E293B', fontSize: '12px' }}>{item.name}</td>
                            <td style={{ padding: '14px 10px', fontWeight: 800, color: '#0F172A', fontSize: '12px' }}>{item.stock} {item.unit}</td>
                            <td style={{ padding: '14px 10px' }}>
                              <span className={`badge-pill ${badgeClass}`} style={{ ...badgeStyle, fontSize: '11px', fontWeight: 800 }}>
                                {item.status}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* TAB: LAB DYNAMIC COVERAGE */}
        {activeTab === 'lab_cover' && (
          <div className="tab-content active" style={{ animation: 'slideUp 0.4s ease-out', padding: '12px' }}>
            {/* Emerald header card */}
            <div className="glass-card" style={{
              background: 'linear-gradient(135deg, #D1FAE5 0%, #A7F3D0 100%)',
              border: '1px solid #6EE7B7',
              padding: '28px',
              borderRadius: '20px',
              marginBottom: '12px',
              position: 'relative',
              overflow: 'hidden'
            }}>
              <div style={{ position: 'relative', zIndex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                  <span className="badge-pill new" style={{ background: '#059669', color: 'white', padding: '6px 14px', fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    ● Clinical Lab Coverage
                  </span>
                </div>
                <h2 style={{ fontSize: '26px', fontWeight: 800, color: '#065F46', margin: '0 0 8px 0', fontFamily: 'Urbanist, sans-serif' }}>Laboratory Active Coverage</h2>
                <p style={{ fontSize: '14.5px', color: '#047857', margin: 0, fontWeight: 600, maxWidth: '650px', lineHeight: '1.5' }}>
                  Providing emergency clinical oversight for Diagnostic Lab. All report signing and sample collection runs under delegated supervisor privileges.
                </p>
              </div>
              <div style={{
                position: 'absolute',
                right: '-30px',
                bottom: '-30px',
                fontSize: '150px',
                color: 'rgba(5, 150, 105, 0.05)',
                fontWeight: 900,
                pointerEvents: 'none',
                userSelect: 'none'
              }}>
                LAB
              </div>
            </div>

            <div style={{ display: 'flex', gap: '12px', background: '#F8FAFC', padding: '8px', borderRadius: '4px', border: '1px solid #E2E8F0', marginBottom: '12px', flexWrap: 'wrap' }}>
              {coverageState['lt-queue']?.on && (
                <button 
                  className={`btn-cover-tab ${labSubTab === 'tests' ? 'active lab' : ''}`}
                  onClick={() => { setLabSubTab('tests'); setTimeout(() => window.lucide && window.lucide.createIcons(), 100); }}
                  style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
                >
                  <i data-lucide="test-tube" style={{ width: '16px', height: '16px' }}></i>
                  Emergency Test Orders
                </button>
              )}
              {coverageState['lt-reagents']?.on && (
                <button 
                  className={`btn-cover-tab ${labSubTab === 'reagents' ? 'active lab' : ''}`}
                  onClick={() => { setLabSubTab('reagents'); setTimeout(() => window.lucide && window.lucide.createIcons(), 100); }}
                  style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
                >
                  <i data-lucide="beaker" style={{ width: '16px', height: '16px' }}></i>
                  Reagents & Kits Inventory
                </button>
              )}
            </div>

            {/* SUBTAB: TESTS QUEUE */}
            {labSubTab === 'tests' && (
              <div className="glass-card" style={{ padding: '12px', background: 'white', border: '1px solid #E2E8F0', borderRadius: '16px', boxShadow: '0 4px 20px rgba(0,0,0,0.02)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                  <h3 style={{ fontSize: '14px', fontWeight: 800, color: '#0F172A', display: 'flex', alignItems: 'center', gap: '8px', margin: 0 }}>
                    <i data-lucide="test-tube" style={{ color: '#059669' }}></i>
                    Diagnostic Test Orders Queue
                  </h3>
                  <span className="badge-pill" style={{ background: '#E6F4EA', color: '#059669', fontWeight: 700, fontSize: '12px' }}>
                    {coverageLabRequests.length} Active Request{coverageLabRequests.length !== 1 ? 's' : ''}
                  </span>
                </div>
                
                <div style={{ marginBottom: '20px', position: 'relative' }}>
                  <input 
                    type="text" 
                    placeholder="Search patient by name or test ID..." 
                    value={labSearchQuery}
                    onChange={e => setLabSearchQuery(e.target.value)}
                    style={{ width: '100%', height: '40px', border: '1px solid #CBD5E1', borderRadius: '2px', padding: '0 12px 0 36px', fontSize: '12px', outline: 'none', color: '#0F172A', boxSizing: 'border-box' }}
                  />
                  <i data-lucide="search" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', width: '16px', height: '16px', color: '#64748B', display: 'flex', alignItems: 'center' }}></i>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {coverageLabRequests
                    .filter(t => 
                      t.name?.toLowerCase().includes(labSearchQuery.toLowerCase()) || 
                      t.id?.toLowerCase().includes(labSearchQuery.toLowerCase()) ||
                      t.test?.toLowerCase().includes(labSearchQuery.toLowerCase())
                    )
                    .map(test => {
                    const isHigh = test.priority === 'High' || test.priority === 'Critical';
                    const isMedium = test.priority === 'Medium';
                    const priorityStyle = isHigh 
                      ? { background: '#FEE2E2', color: '#DC2626' } 
                      : isMedium 
                      ? { background: '#FEF3C7', color: '#D97706' } 
                      : { background: '#E2E8F0', color: '#475569' };
                    return (
                      <div key={test.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px', border: '1px solid #E2E8F0', borderRadius: '4px', background: '#F8FAFC', transition: 'all 0.2s' }}>
                        <div style={{ display: 'flex', gap: '14px', alignItems: 'center' }}>
                          <div style={{ width: '42px', height: '42px', borderRadius: '2px', background: '#ECFDF5', color: '#059669', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <i data-lucide="test-tube"></i>
                          </div>
                          <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                              <span style={{ fontSize: '12px', fontWeight: 800, color: '#1E293B' }}>{test.name}</span>
                              <span className="badge-pill" style={{ ...priorityStyle, fontSize: '10px', padding: '3px 8px', fontWeight: 800 }}>{test.priority} Priority</span>
                            </div>
                            <span style={{ fontSize: '13px', color: '#475569', fontWeight: 600, display: 'block', marginTop: '6px' }}>
                              Test Ordered: <b style={{ color: '#059669' }}>{test.test}</b>
                            </span>
                            <span style={{ fontSize: '12px', color: '#94A3B8', fontWeight: 550, display: 'block', marginTop: '4px' }}>
                              Order ID: <span style={{ fontFamily: 'monospace' }}>#{test.id}</span> · Status: <span style={{ fontWeight: 700, color: '#475569' }}>{test.status}</span>
                            </span>
                          </div>
                        </div>
                        <div>
                          {test.status === 'Pending' ? (
                            <button 
                              type="button"
                              className="btn-cover-action lab-primary"
                              onClick={async () => {
                                try {
                                  await api.put(`/labs/${test.id}`, {
                                    status: 'In Progress',
                                    notes: 'Specimen sample collected by delegated clinical coverage.'
                                  });
                                  showToast(`Sample collected successfully for ${test.name}!`, 'success');
                                  fetchCoverageData();
                                } catch (e) {
                                  showToast('Failed to update sample status.', 'error');
                                }
                              }}
                              style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                            >
                              <i data-lucide="droplet" style={{ width: '13px', height: '13px' }}></i>
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
                              style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                            >
                              <i data-lucide="edit" style={{ width: '13px', height: '13px' }}></i>
                              Enter Results
                            </button>
                          ) : (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                              <span style={{ fontSize: '12px', color: '#059669', fontWeight: 800, display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                <i data-lucide="check-circle" style={{ width: '15px', height: '15px' }}></i>
                                Signed & Dispatched
                              </span>
                              <button 
                                type="button"
                                className="btn-cover-action lab-primary"
                                style={{ background: '#475569', color: 'white', padding: '6px 12px', fontSize: '12px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                                onClick={() => {
                                  setSelectedCoverageLabTest(test);
                                  setShowCoverageLabDetailsModal(true);
                                }}
                              >
                                <i data-lucide="eye" style={{ width: '12px', height: '12px' }}></i>
                                View Report
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* SUBTAB: REAGENTS */}
            {labSubTab === 'reagents' && (
              <div className="glass-card" style={{ padding: '12px', background: 'white', border: '1px solid #E2E8F0', borderRadius: '16px', boxShadow: '0 4px 20px rgba(0,0,0,0.02)' }}>
                <h3 style={{ fontSize: '14px', fontWeight: 800, color: '#0F172A', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <i data-lucide="beaker" style={{ color: '#059669' }}></i>
                  Diagnostic Reagents Ledger
                </h3>
                <div className="table-responsive">
                  <table className="elite-table" style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                    <thead>
                      <tr>
                        <th>REAGENT NAME</th>
                        <th>STOCK LEVEL</th>
                        <th>MIN SAFE STOCK</th>
                        <th>STATUS</th>
                        <th style={{ textAlign: 'right' }}>ACTION</th>
                      </tr>
                    </thead>
                    <tbody>
                      {coverageReagents.map((item, idx) => {
                        const isSafe = item.status === 'Safe' || item.status === 'Normal';
                        const badgeStyle = isSafe 
                          ? { background: '#DCFCE7', color: '#16A34A' } 
                          : { background: '#FEE2E2', color: '#DC2626' };
                        return (
                          <tr key={idx}>
                            <td style={{ padding: '14px 10px', fontWeight: 700, color: '#1E293B', fontSize: '12px' }}>{item.name}</td>
                            <td style={{ padding: '14px 10px', fontWeight: 800, color: '#0F172A', fontSize: '12px' }}>{item.level}</td>
                            <td style={{ padding: '14px 10px', color: '#64748B', fontSize: '13px', fontWeight: 600 }}>{item.minSafe}</td>
                            <td style={{ padding: '14px 10px' }}>
                              <span className={`badge-pill ${isSafe ? 'new' : 'revisit'}`} style={{ ...badgeStyle, fontSize: '11px', fontWeight: 800 }}>
                                {item.status}
                              </span>
                            </td>
                            <td style={{ padding: '14px 10px', textAlign: 'right' }}>
                              <button 
                                type="button"
                                className="btn-cover-action lab-primary"
                                onClick={async () => {
                                  try {
                                    await api.put(`/lab-inventory/${item.id}`, {
                                      isRestock: true,
                                      addQty: 50
                                    });
                                    showToast(`Restocked reagent ${item.name} successfully!`, 'success');
                                    fetchCoverageData();
                                  } catch (e) {
                                    showToast('Failed to restock reagent.', 'error');
                                  }
                                }}
                                style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                              >
                                <i data-lucide="refresh-cw" style={{ width: '12px', height: '12px' }}></i>
                                Restock Reagent
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* TAB: PHARMACY DYNAMIC COVERAGE */}
        {activeTab === 'pharmacy_cover' && (
          <div className="tab-content active" style={{ animation: 'slideUp 0.4s ease-out', padding: '12px' }}>
            {/* Royal blue header card */}
            <div className="glass-card" style={{
              background: 'linear-gradient(135deg, #DBEAFE 0%, #BFDBFE 100%)',
              border: '1px solid #93C5FD',
              padding: '28px',
              borderRadius: '20px',
              marginBottom: '12px',
              position: 'relative',
              overflow: 'hidden'
            }}>
              <div style={{ position: 'relative', zIndex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                  <span className="badge-pill new" style={{ background: '#2563EB', color: 'white', padding: '6px 14px', fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    ● Pharmacy Duty Cover
                  </span>
                </div>
                <h2 style={{ fontSize: '26px', fontWeight: 800, color: '#1E3A8A', margin: '0 0 8px 0', fontFamily: 'Urbanist, sans-serif' }}>Pharmacy Active Coverage</h2>
                <p style={{ fontSize: '14.5px', color: '#1D4ED8', margin: 0, fontWeight: 600, maxWidth: '650px', lineHeight: '1.5' }}>
                  Dispensing and inventory controls active. Dispense prescriptions and manage stock levels under active pharmacist coverage credentials.
                </p>
              </div>
              <div style={{
                position: 'absolute',
                right: '-30px',
                bottom: '-30px',
                fontSize: '150px',
                color: 'rgba(37, 99, 235, 0.05)',
                fontWeight: 900,
                pointerEvents: 'none',
                userSelect: 'none'
              }}>
                PH
              </div>
            </div>

            <div style={{ display: 'flex', gap: '12px', background: '#F8FAFC', padding: '8px', borderRadius: '4px', border: '1px solid #E2E8F0', marginBottom: '12px', flexWrap: 'wrap' }}>
              {coverageState['ph-queue']?.on && (
                <button 
                  className={`btn-cover-tab ${pharmacySubTab === 'queue' ? 'active pharmacy' : ''}`}
                  onClick={() => { setPharmacySubTab('queue'); setTimeout(() => window.lucide && window.lucide.createIcons(), 100); }}
                  style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
                >
                  <i data-lucide="pill" style={{ width: '16px', height: '16px' }}></i>
                  Prescription Dispensing
                </button>
              )}
              {(coverageState['ph-stock']?.on || coverageState['dr-stockview']?.on) && (
                <button 
                  className={`btn-cover-tab ${pharmacySubTab === 'stock' ? 'active pharmacy' : ''}`}
                  onClick={() => { setPharmacySubTab('stock'); setTimeout(() => window.lucide && window.lucide.createIcons(), 100); }}
                  style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
                >
                  <i data-lucide="package" style={{ width: '16px', height: '16px' }}></i>
                  Medicine Inventory
                </button>
              )}
            </div>

            {/* SUBTAB: DISPENSING QUEUE */}
            {pharmacySubTab === 'queue' && (
              <div className="glass-card" style={{ padding: '12px', background: 'white', border: '1px solid #E2E8F0', borderRadius: '16px', boxShadow: '0 4px 20px rgba(0,0,0,0.02)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                  <h3 style={{ fontSize: '14px', fontWeight: 800, color: '#0F172A', display: 'flex', alignItems: 'center', gap: '8px', margin: 0 }}>
                    <i data-lucide="pill" style={{ color: '#2563EB' }}></i>
                    Active Prescription Dispensing Queue
                  </h3>
                  <span className="badge-pill" style={{ background: '#EBF5FF', color: '#2563EB', fontWeight: 700, fontSize: '12px' }}>
                    {coveragePharmacyQueue.length} Order{coveragePharmacyQueue.length !== 1 ? 's' : ''} Pending
                  </span>
                </div>

                <div style={{ marginBottom: '20px', position: 'relative' }}>
                  <input 
                    type="text" 
                    placeholder="Search patient by name or Rx ID..." 
                    value={pharmacySearchQuery}
                    onChange={e => setPharmacySearchQuery(e.target.value)}
                    style={{ width: '100%', height: '40px', border: '1px solid #CBD5E1', borderRadius: '2px', padding: '0 12px 0 36px', fontSize: '12px', outline: 'none', color: '#0F172A', boxSizing: 'border-box' }}
                  />
                  <i data-lucide="search" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', width: '16px', height: '16px', color: '#64748B', display: 'flex', alignItems: 'center' }}></i>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {coveragePharmacyQueue
                    .filter(p => 
                      p.patient?.toLowerCase().includes(pharmacySearchQuery.toLowerCase()) || 
                      p.id?.toLowerCase().includes(pharmacySearchQuery.toLowerCase()) ||
                      p.med?.toLowerCase().includes(pharmacySearchQuery.toLowerCase())
                    )
                    .map(item => (
                    <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px', border: '1px solid #E2E8F0', borderRadius: '4px', background: '#F8FAFC', transition: 'all 0.2s' }}>
                      <div style={{ display: 'flex', gap: '14px', alignItems: 'center' }}>
                        <div style={{ width: '42px', height: '42px', borderRadius: '2px', background: '#EBF5FF', color: '#2563EB', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <i data-lucide="package"></i>
                        </div>
                        <div>
                          <span style={{ fontSize: '12px', fontWeight: 800, color: '#1E293B' }}>{item.patient}</span>
                          <span style={{ fontSize: '12px', color: '#475569', fontWeight: 600, display: 'block', marginTop: '6px' }}>
                            Medication: <b style={{ color: '#2563EB' }}>{item.med}</b> · Qty: <span style={{ fontWeight: 800, color: '#0F172A' }}>{item.qty}</span>
                          </span>
                          <span style={{ fontSize: '12px', color: '#94A3B8', fontWeight: 550, display: 'block', marginTop: '4px' }}>
                            Rx ID: <span style={{ fontFamily: 'monospace' }}>#{item.id}</span> · Category: <span style={{ fontWeight: 700, color: '#64748B' }}>{item.type}</span>
                          </span>
                        </div>
                      </div>
                      <button 
                        type="button"
                        className="btn-cover-action pharmacy-primary"
                        onClick={() => {
                          setSelectedCoveragePharmacyRx(item);
                          setCoveragePharmacyPaymentMode('UPI');
                          setCoveragePharmacyCashReceived('');
                          setShowCoveragePharmacyPaymentModal(true);
                        }}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                      >
                        <i data-lucide="package-check" style={{ width: '14px', height: '14px' }}></i>
                        Dispense & Pack
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* SUBTAB: STOCK */}
            {pharmacySubTab === 'stock' && (
              <div className="glass-card" style={{ padding: '12px', background: 'white', border: '1px solid #E2E8F0', borderRadius: '16px', boxShadow: '0 4px 20px rgba(0,0,0,0.02)' }}>
                <h3 style={{ fontSize: '14px', fontWeight: 800, color: '#0F172A', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <i data-lucide="package" style={{ color: '#2563EB' }}></i>
                  Medicine Formulary Inventory
                </h3>
                <div className="table-responsive">
                  <table className="elite-table" style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                    <thead>
                      <tr>
                        <th>MEDICINE NAME</th>
                        <th>STOCK LEVEL</th>
                        <th>STATUS</th>
                        <th style={{ textAlign: 'right' }}>ACTION</th>
                      </tr>
                    </thead>
                    <tbody>
                      {coveragePharmacyInventory.map((item, idx) => {
                        const isHigh = item.stock > 50;
                        const isLow = item.stock > 0 && item.stock <= 50;
                        const badgeClass = isHigh ? 'new' : isLow ? 'waiting' : 'revisit';
                        const badgeStyle = isHigh 
                          ? { background: '#DCFCE7', color: '#16A34A' } 
                          : isLow 
                          ? { background: '#FEF3C7', color: '#D97706' } 
                          : { background: '#FEE2E2', color: '#DC2626' };
                        return (
                          <tr key={idx}>
                            <td style={{ padding: '14px 10px', fontWeight: 700, color: '#1E293B', fontSize: '12px' }}>{item.name}</td>
                            <td style={{ padding: '14px 10px', fontWeight: 800, color: '#0F172A', fontSize: '12px' }}>{item.stock} {item.unit}</td>
                            <td style={{ padding: '14px 10px' }}>
                              <span className={`badge-pill ${badgeClass}`} style={{ ...badgeStyle, fontSize: '11px', fontWeight: 800 }}>
                                {item.status}
                              </span>
                            </td>
                            <td style={{ padding: '14px 10px', textAlign: 'right' }}>
                              <button 
                                type="button"
                                className="btn-cover-action pharmacy-primary"
                                onClick={async () => {
                                  try {
                                    await api.put(`/medicines/${item.id}`, {
                                      stock: item.stock + 100
                                    });
                                    showToast(`Restocked 100 units of ${item.name} successfully!`, 'success');
                                    fetchCoverageData();
                                  } catch (e) {
                                    showToast('Failed to restock medicine.', 'error');
                                  }
                                }}
                                style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                              >
                                <i data-lucide="plus-circle" style={{ width: '12px', height: '12px' }}></i>
                                Restock Stock
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

      </div>

      <div className="mobile-bottom-nav">
        {/* MOBILE BOTTOM NAV */}
        <div className={`mob-nav-item ${activeTab === 'dash' ? 'active' : ''}`} onClick={() => switchTab('dash')}>
          <i data-lucide="layout-grid"></i><span>Home</span>
        </div>
        <div className={`mob-nav-item ${activeTab === 'appointments' ? 'active' : ''}`} onClick={() => switchTab('appointments')}>
          <i data-lucide="calendar"></i><span>Apps</span>
        </div>
        <div className={`mob-nav-item ${activeTab === 'patients' ? 'active' : ''}`} onClick={() => switchTab('patients')}>
          <i data-lucide="users"></i><span>Patients</span>
        </div>
        <div className={`mob-nav-item ${activeTab === 'billing' ? 'active' : ''}`} onClick={() => switchTab('billing')}>
          <i data-lucide="wallet"></i><span>Bills</span>
        </div>
      </div>

      {/* APPOINTMENT DETAILS MODAL */}
      {detailsModalOpen && selectedAppointment && (
        <div className="details-modal-overlay" onClick={() => { setDetailsModalOpen(false); setShowDeleteConfirm(false); }}>
          <div className="details-modal-card" onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <h2 style={{ fontSize: '20px', fontWeight: 900, color: '#1A1D23' }}>Appointment Details</h2>
              <button className="btn-close" onClick={() => { setDetailsModalOpen(false); setShowDeleteConfirm(false); }}><i data-lucide="x"></i></button>
            </div>
            
            <div style={{ marginBottom: '16px' }}>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '12px' }}>
                <div style={{ width: '48px', height: '48px', borderRadius: '4px', background: 'var(--primary-light)', color: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px', fontWeight: 800 }}>
                  {getInitials(selectedAppointment.patientId?.name)}
                </div>
                <div>
                  <div style={{ fontWeight: 800, fontSize: '14px', color: '#1A1D23' }}>{selectedAppointment.patientId?.name}</div>
                  <div style={{ fontSize: '13px', color: '#64748B', fontWeight: 600 }}>ID: #{selectedAppointment.patientId?._id?.substring(18).toUpperCase()}</div>
                </div>
              </div>
              
              {/* Online Request Approval Action Box */}
              {(() => {
                const currentStatus = appointments.find(a => a._id === selectedAppointment._id)?.status || selectedAppointment.status;
                if (currentStatus === 'Pending' || currentStatus === 'Pending Approval') {
                  return (
                    <div style={{ background: '#EFF6FF', border: '1.5px solid #3B82F6', borderRadius: '8px', padding: '14px 16px', marginBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                      <div>
                        <div style={{ fontSize: '13px', fontWeight: 800, color: '#1E40AF', display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span style={{ background: '#2563EB', color: 'white', fontSize: '10px', padding: '2px 6px', borderRadius: '4px', fontWeight: 900 }}>ACTION REQUIRED</span>
                          Online Request (Pending Approval)
                        </div>
                        <div style={{ fontSize: '12px', color: '#475569', marginTop: '2px', fontWeight: 500 }}>
                          Approve this request to generate the bill invoice and notify the patient to complete payment.
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <button
                          type="button"
                          className="btn btn-success"
                          style={{ background: '#10B981', color: 'white', fontWeight: 800, padding: '8px 16px', borderRadius: '6px', fontSize: '12px', cursor: 'pointer', border: 'none', display: 'flex', alignItems: 'center', gap: '6px' }}
                          onClick={async () => {
                            try {
                              await api.put('/appointments/' + selectedAppointment._id + '/approve');
                              showToast('Appointment Approved! Payment request sent to patient.', 'success');
                              setDetailsModalOpen(false);
                              fetchData();
                            } catch(e) {
                              showToast(e.response?.data?.error || 'Failed to approve', 'error');
                            }
                          }}
                        >
                          ✓ Approve & Request Payment
                        </button>
                        <button
                          type="button"
                          className="btn btn-danger"
                          style={{ background: '#EF4444', color: 'white', fontWeight: 800, padding: '8px 12px', borderRadius: '6px', fontSize: '12px', cursor: 'pointer', border: 'none' }}
                          onClick={async () => {
                            try {
                              await api.put('/appointments/' + selectedAppointment._id + '/reject');
                              showToast('Appointment request rejected.', 'info');
                              setDetailsModalOpen(false);
                              fetchData();
                            } catch(e) {
                              showToast('Failed to reject', 'error');
                            }
                          }}
                        >
                          ✕ Reject
                        </button>
                      </div>
                    </div>
                  );
                }
                return null;
              })()}

              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '20px' }}>
                {(() => {
                  const originalStatus = appointments.find(a => a._id === selectedAppointment._id)?.status || selectedAppointment.status;
                  const isLocked = originalStatus === 'Cancelled' || originalStatus === 'Completed' || originalStatus === 'Checked Out';
                  const isCompleted = originalStatus === 'Completed' || originalStatus === 'Checked Out';

                  if (isLocked) {
                    return (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <div style={{ background: '#FFFBEB', border: '1px solid #FDE68A', padding: '10px 14px', borderRadius: '2px', fontSize: '12.5px', color: '#92400E', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <i data-lucide="lock" style={{ width: '14px', height: '14px', flexShrink: 0 }}></i>
                          <span>Status Lock: This appointment has been {originalStatus}. It cannot be rescheduled or modified.</span>
                        </div>

                        {isCompleted && (
                          <div style={{ borderTop: '1px solid #E2E8F0', paddingTop: '16px' }}>
                            <h3 style={{ fontSize: '12px', fontWeight: 800, color: '#1E293B', marginBottom: '12px' }}>Clinical Summary</h3>
                            
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginTop: '16px' }}>
                              <div>
                                <div style={{ fontSize: '11px', color: '#64748B', fontWeight: 700, textTransform: 'uppercase', marginBottom: '6px' }}>Prescribed Medicines</div>
                                {selectedAppointmentDetails.prescriptions.length === 0 ? (
                                  <div style={{ fontSize: '13px', color: '#64748B', fontStyle: 'italic' }}>No active prescription.</div>
                                ) : (
                                  selectedAppointmentDetails.prescriptions.map((presc, idx) => (
                                    <div key={presc._id || idx} style={{ background: '#EFF6FF', padding: '10px 12px', borderRadius: '2px', marginBottom: '6px', border: '1px solid #DBEAFE' }}>
                                      {(presc.items || []).map((item, i) => (
                                        <div key={i} style={{ fontSize: '13px', color: '#1E293B', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px' }}>
                                          <i data-lucide="pill" style={{ width: '13px', height: '13px', color: '#2563EB' }}></i> {item.name} - {item.dosage} ({item.duration})
                                        </div>
                                      ))}
                                    </div>
                                  ))
                                )}
                              </div>

                              <div>
                                <div style={{ fontSize: '11px', color: '#64748B', fontWeight: 700, textTransform: 'uppercase', marginBottom: '6px' }}>Ordered Lab Tests</div>
                                {selectedAppointmentDetails.labs.length === 0 ? (
                                  <div style={{ fontSize: '13px', color: '#64748B', fontStyle: 'italic' }}>No lab tests ordered.</div>
                                ) : (
                                  <div style={{ background: '#F0FDF4', padding: '10px 12px', borderRadius: '2px', border: '1px solid #DCFCE7' }}>
                                    {selectedAppointmentDetails.labs.map((lab, idx) => (
                                      <div key={lab._id || idx} style={{ fontSize: '13px', color: '#16A34A', fontWeight: 600, display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                                        <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                          <i data-lucide="flask-conical" style={{ width: '13px', height: '13px', color: '#16A34A' }}></i> {lab.testName}
                                        </span>
                                        <span style={{ fontSize: '11px', background: '#DCFCE7', padding: '2px 6px', borderRadius: '4px', textTransform: 'uppercase' }}>{lab.status}</span>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  }

                  return (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      <div>
                        <label style={{ display: 'block', fontSize: '12px', fontWeight: 800, marginBottom: '8px', color: '#1A1D23' }}>Reschedule Doctor</label>
                        <select
                          className="form-control"
                          style={{ background: 'white', border: '1px solid #CBD5E1', borderRadius: '2px', height: '26px', width: '100%', padding: '0 12px', fontWeight: 600, appearance: 'none', cursor: 'pointer' }}
                          value={selectedAppointment.doctorId?._id || selectedAppointment.doctorId || ''}
                          onChange={(e) => {
                            const newDocId = e.target.value;
                            const newDocObj = doctors.find(d => String(d._id) === String(newDocId)) || newDocId;
                            setSelectedAppointment({...selectedAppointment, doctorId: newDocObj, time: ''});
                          }}
                        >
                          <option value="">Select Doctor</option>
                          {doctors.map(d => (
                            <option key={d._id} value={d._id}>Dr. {d.name} ({d.specialty || 'General'})</option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label style={{ display: 'block', fontSize: '12px', fontWeight: 800, marginBottom: '8px', color: '#1A1D23' }}>Reschedule Date</label>
                        <input 
                          type="date" 
                          className="form-control" 
                          style={{ background: 'white', border: '1px solid #CBD5E1', borderRadius: '2px', height: '26px', width: '100%', padding: '0 12px', fontWeight: 600 }}
                          value={(() => {
                            if (!selectedAppointment.date) return '';
                            const d = new Date(selectedAppointment.date);
                            if (isNaN(d.getTime())) return '';
                            const year = d.getFullYear();
                            const month = String(d.getMonth() + 1).padStart(2, '0');
                            const day = String(d.getDate()).padStart(2, '0');
                            return `${year}-${month}-${day}`;
                          })()}
                          min={getLocalDateString()}
                          onChange={(e) => setSelectedAppointment({...selectedAppointment, date: e.target.value})} 
                        />
                      </div>

                      {!rescheduleAvailability.available && (
                        <div style={{ color: '#EF4444', background: '#FEF2F2', padding: '12px', borderRadius: '2px', fontSize: '12px', fontWeight: 700, border: '1px solid #FEE2E2' }}>
                          Doctor Unavailable: {rescheduleAvailability.reason || 'Doctor is on leave or weekly off'}
                        </div>
                      )}

                      {rescheduleAvailability.available && (
                        <div>
                          <label style={{ display: 'block', fontSize: '12px', fontWeight: 800, marginBottom: '8px', color: '#1A1D23' }}>Reschedule Time Slot</label>
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))', gap: '8px', maxHeight: '140px', overflowY: 'auto', paddingRight: '4px', border: '1px solid #E2E8F0', padding: '10px', borderRadius: '2px', background: '#F8FAFC' }}>
                            {(rescheduleAvailability.slots && rescheduleAvailability.slots.length > 0 ? rescheduleAvailability.slots : DEFAULT_RECEPTION_SLOTS).map(time => {
                              const docId = selectedAppointment.doctorId?._id || selectedAppointment.doctorId;
                              const cleanTimeSlotStr = (s) => s ? s.split(/\(Limit:/i)[0].trim().toLowerCase() : '';
                              const targetTimeClean = cleanTimeSlotStr(time);

                              let limit = 10;
                              const selectedDocObj = doctors.find(d => String(d._id) === String(docId));
                              if (selectedDocObj) {
                                  limit = selectedDocObj.max_slots || 10;
                              }

                              const match = time.match(/\(Limit:\s*(\d+)\)/i);
                              if (match) {
                                  limit = parseInt(match[1], 10);
                              }

                              let bookedCount = 0;
                              const targetDateStr = new Date(selectedAppointment.date).toDateString();
                              bookedCount = appointments.filter(app => {
                                  if (app._id === selectedAppointment._id) return false;
                                  if (app.status === 'Cancelled') return false;
                                  const appDocId = app.doctorId?._id || app.doctorId;
                                  if (String(appDocId) !== String(docId)) return false;
                                  const appDateStr = new Date(app.date).toDateString();
                                  if (appDateStr !== targetDateStr) return false;
                                  return cleanTimeSlotStr(app.time) === targetTimeClean;
                              }).length;

                              const isFull = bookedCount >= limit;
                              const isSelected = selectedAppointment.time === time;
                              const displayTime = time.split(/\(Limit:/i)[0].trim();

                              return (
                                <button
                                  key={time}
                                  type="button"
                                  disabled={isFull}
                                  onClick={() => setSelectedAppointment({ ...selectedAppointment, time })}
                                  style={{
                                    minHeight: '26px',
                                    padding: '4px 8px',
                                    borderRadius: '2px',
                                    border: isSelected ? '2px solid #2563EB' : '1px solid #CBD5E1',
                                    background: isFull ? '#E2E8F0' : (isSelected ? '#EFF6FF' : 'white'),
                                    color: isFull ? '#94A3B8' : (isSelected ? '#2563EB' : '#1E293B'),
                                    fontWeight: isSelected ? 800 : 600,
                                    fontSize: '11px',
                                    cursor: isFull ? 'not-allowed' : 'pointer',
                                    transition: 'all 0.15s',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    alignItems: 'center',
                                    justifyContent: 'center'
                                  }}
                                >
                                  <span style={{ fontWeight: 700 }}>{displayTime}</span>
                                  <span style={{ fontSize: '9px', opacity: 0.8 }}>({bookedCount}/{limit})</span>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>

              {(() => {
                const associatedBill = bills.find(b => {
                  const appBId = b.appointmentId?._id || b.appointmentId;
                  return appBId && appBId.toString() === selectedAppointment._id.toString();
                });
                if (!associatedBill) return null;
                return (
                  <div style={{ marginTop: '24px', padding: '16px', borderRadius: '4px', background: '#F8FAFC', border: '1px solid #E2E8F0' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                      <span style={{ fontSize: '12px', fontWeight: 800, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Billing & Invoice</span>
                      <span className={`status-badge ${associatedBill.status === 'Paid' ? 'available' : 'pending'}`} style={{ margin: 0, padding: '4px 10px', fontSize: '11px', fontWeight: 700 }}>
                        {associatedBill.status || 'Unpaid'}
                      </span>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '13px', color: '#64748B', fontWeight: 600 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span>Invoice Number:</span>
                        <span style={{ color: '#0F172A', fontWeight: 700 }}>#INV-{(associatedBill._id || '').substring(Math.max(0, (associatedBill._id || '').length - 6)).toUpperCase() || 'N/A'}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span>Total Charge:</span>
                        <span style={{ color: '#0F172A', fontWeight: 700 }}>₹{(associatedBill.totalAmount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                      </div>
                      {associatedBill.discountPercent > 0 && (
                        <div style={{ display: 'flex', justifyContent: 'space-between', color: '#EF4444' }}>
                          <span>Discount ({associatedBill.discountPercent}%):</span>
                          <span>-₹{((associatedBill.originalAmount || associatedBill.totalAmount) - associatedBill.totalAmount).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                        </div>
                      )}
                    </div>
                    {associatedBill.status !== 'Paid' && (
                      <button
                        type="button"
                        className="btn btn-primary animate-in"
                        style={{
                          width: '100%',
                          height: '26px',
                          borderRadius: '2px',
                          fontSize: '12px',
                          fontWeight: 800,
                          marginTop: '14px',
                          background: 'linear-gradient(135deg, #10B981 0%, #059669 100%)',
                          border: 'none',
                          color: '#FFFFFF',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '6px',
                          boxShadow: '0 2px 4px rgba(16, 185, 129, 0.15)'
                        }}
                        onClick={() => {
                          setSelectedBillForPayment(associatedBill);
                          setDiscountPercent(0);
                          setDiscountReason('');
                          setPaymentMethod('Cash');
                          setShowPaymentModal(true);
                          setDetailsModalOpen(false);
                        }}
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect width="20" height="14" x="2" y="5" rx="2"/><line x1="2" x2="22" y1="10" y2="10"/></svg>
                        <span>Collect Payment & Apply Discount</span>
                      </button>
                    )}
                  </div>
                );
              })()}
            </div>
            
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', alignItems: 'center', minHeight: '44px' }}>
              {(() => {
                const originalStatus = appointments.find(a => a._id === selectedAppointment._id)?.status || selectedAppointment.status;
                const isLocked = originalStatus === 'Cancelled' || originalStatus === 'Completed' || originalStatus === 'Checked Out';

                if (showDeleteConfirm) {
                  return (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', animation: 'fadeIn 0.2s ease-out' }}>
                      <span style={{ fontSize: '12px', fontWeight: 800, color: '#EF4444' }}>Are you sure?</span>
                      <button className="btn" style={{ background: '#F1F5F9', color: '#64748B', fontWeight: 800, padding: '0 16px', borderRadius: '2px', height: '26px', fontSize: '13px', display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setShowDeleteConfirm(false)}>Cancel</button>
                      <button className="btn" style={{ background: '#EF4444', color: 'white', fontWeight: 800, padding: '0 20px', borderRadius: '2px', height: '26px', fontSize: '13px', display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => { handleDeleteAppointment(selectedAppointment._id); setShowDeleteConfirm(false); }}>Confirm Delete</button>
                    </div>
                  );
                }

                return (
                  <>
                    <button className="btn" style={{ background: '#FEE2E2', color: '#EF4444', fontWeight: 800, padding: '0 20px', borderRadius: '2px', height: '26px', display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setShowDeleteConfirm(true)}>Delete</button>
                    {!isLocked ? (
                      <button className="btn btn-primary" style={{ fontWeight: 800, padding: '0 24px', borderRadius: '2px', height: '26px', display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => handleUpdateAppointment(selectedAppointment)}>Save Changes</button>
                    ) : (
                      <button className="btn btn-secondary" style={{ fontWeight: 800, padding: '0 24px', borderRadius: '2px', height: '26px', background: '#F1F5F9', color: '#475569', display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => { setDetailsModalOpen(false); setShowDeleteConfirm(false); }}>Close</button>
                    )}
                  </>
                );
              })()}
            </div>
          </div>
        </div>
      )}

            {/* COMPLETE ONLINE PATIENT REGISTRATION FORM REVIEW MODAL */}
      {showOnlineReviewModal && selectedOnlineRequest && (
        <div className="details-modal-overlay" onClick={() => setShowOnlineReviewModal(false)} style={{ zIndex: 99999 }}>
          <div 
            className="details-modal-card" 
            onClick={e => e.stopPropagation()} 
            style={{ width: '100%', maxWidth: '800px', maxHeight: '90vh', overflowY: 'auto', padding: '0', borderRadius: '16px', background: '#FFFFFF' }}
          >
            {/* Header */}
            <div style={{ background: 'linear-gradient(135deg, #1E293B 0%, #0F172A 100%)', color: 'white', padding: '20px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ background: '#EA580C', color: 'white', fontSize: '11px', fontWeight: 900, padding: '3px 8px', borderRadius: '4px', textTransform: 'uppercase' }}>
                    Online Registration Review
                  </span>
                  <span style={{ fontSize: '12px', color: '#94A3B8', fontWeight: 600 }}>
                    Submitted via Patient Portal
                  </span>
                </div>
                <h2 style={{ margin: '6px 0 0 0', fontSize: '20px', fontWeight: 800, color: 'white' }}>
                  {selectedOnlineRequest.patientId?.name || 'Patient Registration Form'}
                </h2>
              </div>
              <button 
                onClick={() => setShowOnlineReviewModal(false)}
                style={{ background: 'rgba(255, 255, 255, 0.1)', border: 'none', color: 'white', width: '34px', height: '34px', borderRadius: '8px', cursor: 'pointer', fontSize: '18px' }}
              >
                ✕
              </button>
            </div>

            <div style={{ padding: '24px' }}>
              {(() => {
                const pId = selectedOnlineRequest.patientId?._id || selectedOnlineRequest.patientId;
                const pat = (patientsList && patientsList.find(p => String(p._id) === String(pId))) || selectedOnlineRequest.patientId || {};
                const doc = selectedOnlineRequest.doctorId || {};
                const docFee = (doc.consultationFee !== undefined && doc.consultationFee !== null && !isNaN(doc.consultationFee)) ? Number(doc.consultationFee) : 0;
                
                return (
                  <div>
                    {/* Patient Photo & Primary Header Info */}
                    <div style={{ display: 'flex', gap: '20px', alignItems: 'center', background: '#F8FAFC', padding: '16px 20px', borderRadius: '12px', border: '1px solid #E2E8F0', marginBottom: '20px' }}>
                      {pat.avatar ? (
                        <img 
                          src={pat.avatar} 
                          alt="Patient Photo" 
                          style={{ width: '80px', height: '80px', borderRadius: '12px', objectFit: 'cover', border: '3px solid #2563EB', flexShrink: 0 }} 
                        />
                      ) : (
                        <div style={{ width: '80px', height: '80px', borderRadius: '12px', background: 'linear-gradient(135deg, #3B82F6 0%, #1D4ED8 100%)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '28px', fontWeight: 900, flexShrink: 0 }}>
                          {getInitials(pat.name || 'Patient')}
                        </div>
                      )}
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: '18px', fontWeight: 900, color: '#0F172A' }}>{pat.name || 'N/A'}</div>
                        <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', marginTop: '6px', fontSize: '13px', color: '#475569', fontWeight: 600 }}>
                          <div>📱 Contact: <b style={{ color: '#0F172A' }}>{pat.contact || 'N/A'}</b></div>
                          <div>✉️ Email: <b style={{ color: (pat.email && pat.email !== 'n/a') ? '#0F172A' : '#94A3B8' }}>{(pat.email && pat.email !== 'n/a') ? pat.email : 'Not Provided'}</b></div>
                          <div>🩸 Blood: <b style={{ color: '#EF4444' }}>{pat.bloodGroup || 'O+'}</b></div>
                        </div>
                      </div>
                    </div>

                    {/* Form Sections */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '20px' }}>
                      
                      {/* Section 1: Demographics */}
                      <div style={{ border: '1px solid #E2E8F0', borderRadius: '10px', padding: '14px 16px' }}>
                        <h4 style={{ margin: '0 0 10px 0', fontSize: '12px', fontWeight: 800, color: '#2563EB', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                          1. Personal & Demographic Details
                        </h4>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '13px' }}>
                          <div><span style={{ color: '#64748B', fontWeight: 600 }}>Gender:</span> <b style={{ color: '#0F172A' }}>{pat.gender || 'N/A'}</b></div>
                          <div>
                            <span style={{ color: '#64748B', fontWeight: 600 }}>Age:</span> <b style={{ color: '#0F172A' }}>
                              {[
                                pat.age ? `${pat.age} Years` : null,
                                pat.ageMonths ? `${pat.ageMonths} Months` : null,
                                pat.ageDays ? `${pat.ageDays} Days` : null
                              ].filter(Boolean).join(', ') || 'Not specified'}
                            </b>
                          </div>
                          <div><span style={{ color: '#64748B', fontWeight: 600 }}>Address:</span> <b style={{ color: '#0F172A' }}>{pat.address || 'Not Provided'}</b></div>
                          <div><span style={{ color: '#64748B', fontWeight: 600 }}>Referred By:</span> <b style={{ color: '#0F172A' }}>{pat.referredBy || 'Self'}</b></div>
                        </div>
                      </div>

                      {/* Section 2: Clinical Details */}
                      <div style={{ border: '1px solid #E2E8F0', borderRadius: '10px', padding: '14px 16px' }}>
                        <h4 style={{ margin: '0 0 10px 0', fontSize: '12px', fontWeight: 800, color: '#2563EB', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                          2. Clinical Symptoms & History
                        </h4>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '13px' }}>
                          <div><span style={{ color: '#64748B', fontWeight: 600 }}>Reported Symptoms:</span> <b style={{ color: '#EA580C' }}>{selectedOnlineRequest.reason || 'General Consultation'}</b></div>
                          <div><span style={{ color: '#64748B', fontWeight: 600 }}>Allergies:</span> <b style={{ color: pat.allergies && pat.allergies !== 'None' ? '#DC2626' : '#16A34A' }}>{pat.allergies || 'None'}</b></div>
                          <div><span style={{ color: '#64748B', fontWeight: 600 }}>Current Medications:</span> <b style={{ color: '#0F172A' }}>{pat.currentMedications || 'None'}</b></div>
                          <div><span style={{ color: '#64748B', fontWeight: 600 }}>Medical History:</span> <b style={{ color: '#0F172A' }}>{Array.isArray(pat.medicalHistory) ? pat.medicalHistory.join(', ') : (pat.medicalHistory || 'None')}</b></div>
                        </div>
                      </div>
                    </div>

                    {/* Section 3: Requested Appointment & Dynamic Bill Breakdown */}
                    <div style={{ background: '#F0FDF4', border: '1.5px solid #86EFAC', borderRadius: '12px', padding: '16px 20px', marginBottom: '20px' }}>
                      <h4 style={{ margin: '0 0 12px 0', fontSize: '13px', fontWeight: 800, color: '#166534', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                        3. Requested Consultation & Dynamic Fee Breakdown
                      </h4>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                        <div>
                          <div style={{ fontSize: '13px', color: '#166534', fontWeight: 600 }}>Doctor: <b style={{ color: '#0F172A' }}>Dr. {doc.name || 'Doctor'} ({doc.specialty || 'General'})</b></div>
                          <div style={{ fontSize: '13px', color: '#166534', fontWeight: 600, marginTop: '4px' }}>Date & Slot: <b style={{ color: '#0F172A' }}>{getFormattedDate(selectedOnlineRequest.date)} at {selectedOnlineRequest.time}</b></div>
                        </div>
                        <div style={{ background: '#FFFFFF', padding: '10px 14px', borderRadius: '8px', border: '1px solid #BBF7D0' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#475569', marginBottom: '4px' }}>
                            <span>One-Time OPD Reg. Fee:</span>
                            <span style={{ fontWeight: 800, color: '#D97706' }}>₹50 (1-Time)</span>
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#475569', marginBottom: '6px' }}>
                            <span>Dr. {doc.name || 'Doctor'} Fee:</span>
                            <span style={{ fontWeight: 800, color: '#0F172A' }}>₹{docFee}</span>
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13.5px', color: '#0F172A', fontWeight: 900, borderTop: '1px dashed #CBD5E1', paddingTop: '6px' }}>
                            <span>Total Invoice Payable:</span>
                            <span style={{ color: '#16A34A' }}>₹{docFee + 50}</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Action Buttons */}
                    <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', borderTop: '1px solid #E2E8F0', paddingTop: '18px' }}>
                      <button
                        type="button"
                        className="btn"
                        style={{ padding: '0 20px', height: '42px', borderRadius: '8px', background: '#F1F5F9', color: '#475569', fontWeight: 800, border: '1px solid #CBD5E1', cursor: 'pointer' }}
                        onClick={() => setShowOnlineReviewModal(false)}
                      >
                        Cancel
                      </button>

                      <button
                        type="button"
                        className="btn"
                        style={{ padding: '0 20px', height: '42px', borderRadius: '8px', background: '#FEE2E2', color: '#DC2626', fontWeight: 800, border: '1px solid #FCA5A5', cursor: 'pointer' }}
                        onClick={async () => {
                          try {
                            await api.put('/appointments/' + selectedOnlineRequest._id + '/reject');
                            showToast('Appointment request rejected.', 'info');
                            setShowOnlineReviewModal(false);
                            fetchData();
                          } catch(e) {
                            showToast('Failed to reject request', 'error');
                          }
                        }}
                      >
                        ✕ Reject Request
                      </button>

                      <button
                        type="button"
                        className="btn"
                        style={{ padding: '0 26px', height: '42px', borderRadius: '8px', background: 'linear-gradient(135deg, #10B981 0%, #059669 100%)', color: 'white', fontWeight: 900, border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', boxShadow: '0 4px 12px rgba(16, 185, 129, 0.3)' }}
                        onClick={async () => {
                          try {
                            await api.put('/appointments/' + selectedOnlineRequest._id + '/approve');
                            showToast('Appointment Approved! Payment request (with dynamic fee) sent to patient.', 'success');
                            setShowOnlineReviewModal(false);
                            fetchData();
                          } catch(e) {
                            showToast(e.response?.data?.error || 'Failed to approve', 'error');
                          }
                        }}
                      >
                        ✓ Approve & Request Payment (₹{docFee + 50})
                      </button>
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>
        </div>
      )}

      {/* COVERAGE LAB MODALS */}
      {showCoverageLabModal && selectedCoverageLabTest && (
        <div className="details-modal-overlay" onClick={() => setShowCoverageLabModal(false)} style={{ zIndex: 5000 }}>
          <div className="details-modal-card" onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: '500px', padding: '28px', borderRadius: '16px', background: 'white' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h3 style={{ fontSize: '14px', fontWeight: 800, color: '#0F172A', margin: 0 }}>Enter Diagnostic Lab Results</h3>
              <button 
                type="button" 
                onClick={() => setShowCoverageLabModal(false)} 
                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '20px', color: '#64748B' }}
              >✕</button>
            </div>
            
            <div style={{ background: '#F8FAFC', padding: '12px 16px', borderRadius: '2px', marginBottom: '20px' }}>
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
                showToast(`Lab results finalized & dispatched for ${selectedCoverageLabTest.name}!`, 'success');
                setShowCoverageLabModal(false);
                fetchCoverageData();
              } catch (err) {
                showToast('Failed to finalize results.', 'error');
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
                    style={{ flex: 1, height: '40px', border: '1px solid #E2E8F0', borderRadius: '2px', padding: '0 12px', outline: 'none' }}
                  />
                  <input 
                    type="text" 
                    placeholder="Unit (e.g. g/dL, mg/dL)" 
                    value={coverageLabParams.unit} 
                    onChange={e => setCoverageLabParams({ ...coverageLabParams, unit: e.target.value })}
                    required
                    style={{ width: '150px', height: '40px', border: '1px solid #E2E8F0', borderRadius: '2px', padding: '0 12px', outline: 'none' }}
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
                  style={{ width: '100%', height: '80px', border: '1px solid #E2E8F0', borderRadius: '2px', padding: '8px 12px', outline: 'none', resize: 'none' }}
                />
              </div>

              <div style={{ marginBottom: '12px' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 800, color: '#64748B', marginBottom: '6px', textTransform: 'uppercase' }}>Upload Diagnostic Report Document</label>
                <div 
                  style={{ border: '2px dashed #CBD5E1', borderRadius: '2px', padding: '16px', textAlign: 'center', cursor: 'pointer', background: '#F8FAFC' }}
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
                  style={{ height: '40px', padding: '0 16px', background: '#F1F5F9', border: 'none', borderRadius: '2px', fontWeight: 700, color: '#475569', cursor: 'pointer' }}
                >Cancel</button>
                <button 
                  type="submit" 
                  style={{ height: '40px', padding: '0 20px', background: '#059669', border: 'none', borderRadius: '2px', fontWeight: 700, color: 'white', cursor: 'pointer' }}
                >Finalize & Dispatch</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showCoveragePharmacyPaymentModal && selectedCoveragePharmacyRx && (
        <div className="details-modal-overlay" onClick={() => setShowCoveragePharmacyPaymentModal(false)} style={{ zIndex: 5000 }}>
          <div className="details-modal-card" onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: '500px', padding: '28px', borderRadius: '16px', background: 'white' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h3 style={{ fontSize: '14px', fontWeight: 800, color: '#0F172A', margin: 0 }}>Settle Bill & Dispense Medication</h3>
              <button 
                type="button" 
                onClick={() => setShowCoveragePharmacyPaymentModal(false)} 
                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '20px', color: '#64748B' }}
              >✕</button>
            </div>
            
            <div style={{ background: '#F8FAFC', padding: '16px', borderRadius: '4px', marginBottom: '20px', border: '1px solid #E2E8F0' }}>
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
                <span style={{ fontSize: '12px', color: '#0F172A', fontWeight: 800 }}>Amount Due:</span>
                <span style={{ fontSize: '14px', color: '#2563EB', fontWeight: 900 }}>₹{(selectedCoveragePharmacyRx.amountVal || 550).toFixed(2)}</span>
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
                      borderRadius: '2px',
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
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px', padding: '16px', background: '#F8FAFC', borderRadius: '4px', border: '1px dashed #CBD5E1', marginBottom: '20px' }}>
                <div style={{ padding: '8px', background: 'white', borderRadius: '2px', border: '1px solid #E2E8F0' }}>
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
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 800, color: '#64748B', textTransform: 'uppercase', marginBottom: '6px' }}>Cash Amount Received</label>
                  <div style={{ position: 'relative' }}>
                    <span style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', fontWeight: 800, color: '#475569', fontSize: '12px' }}>₹</span>
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
                        borderRadius: '2px', 
                        fontSize: '12px', 
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
                    borderRadius: '2px', 
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
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', padding: '16px', background: '#F8FAFC', borderRadius: '4px', border: '1px solid #E2E8F0', textAlign: 'center', marginBottom: '20px' }}>
                <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: '#EFF6FF', color: '#2563EB', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="5" width="20" height="14" rx="2" ry="2"/><line x1="2" x2="22" y1="10" y2="10"/></svg>
                </div>
                <div>
                  <div style={{ fontWeight: 800, color: '#1E293B', fontSize: '12px' }}>POS Terminal Active</div>
                  <div style={{ fontSize: '12px', color: '#64748B', marginTop: '4px', fontWeight: 600 }}>Please tap or insert the customer's Credit/Debit card.</div>
                </div>
              </div>
            )}

            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <button 
                type="button" 
                onClick={() => setShowCoveragePharmacyPaymentModal(false)}
                style={{ height: '40px', padding: '0 16px', background: '#F1F5F9', border: 'none', borderRadius: '2px', fontWeight: 700, color: '#475569', cursor: 'pointer' }}
              >Cancel</button>
              <button 
                type="button" 
                onClick={handleConfirmCoveragePharmacyPayment}
                style={{ height: '40px', padding: '0 20px', background: '#10B981', border: 'none', borderRadius: '2px', fontWeight: 800, color: 'white', cursor: 'pointer' }}
              >Confirm Pay & Dispense</button>
            </div>
          </div>
        </div>
      )}

      {showCoverageLabDetailsModal && selectedCoverageLabTest && (() => {
        const parsed = parseResults(selectedCoverageLabTest.results);
        return (
          <div className="details-modal-overlay" onClick={() => setShowCoverageLabDetailsModal(false)} style={{ zIndex: 5000 }}>
            <div className="details-modal-card" onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: '480px', padding: '28px', borderRadius: '16px', background: 'white' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                <h3 style={{ fontSize: '14px', fontWeight: 800, color: '#0F172A', margin: 0 }}>Lab Report Details</h3>
                <button 
                  type="button" 
                  onClick={() => setShowCoverageLabDetailsModal(false)} 
                  style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '20px', color: '#64748B' }}
                >✕</button>
              </div>

              <div style={{ background: '#F8FAFC', padding: '16px', borderRadius: '4px', marginBottom: '20px', border: '1px solid #E2E8F0' }}>
                <div style={{ fontSize: '11px', color: '#64748B', fontWeight: 700, marginBottom: '6px' }}>PATIENT</div>
                <div style={{ fontSize: '12px', fontWeight: 800, color: '#0F172A' }}>{selectedCoverageLabTest.name}</div>
                <div style={{ fontSize: '11px', color: '#94A3B8', marginTop: '2px' }}>Order ID: #{selectedCoverageLabTest.id}</div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginBottom: '12px' }}>
                <div>
                  <span style={{ fontSize: '11px', fontWeight: 800, color: '#64748B', textTransform: 'uppercase', display: 'block', marginBottom: '4px' }}>Test Conducted</span>
                  <span style={{ fontSize: '12px', fontWeight: 700, color: '#1E293B' }}>{selectedCoverageLabTest.test}</span>
                </div>
                <div>
                  <span style={{ fontSize: '11px', fontWeight: 800, color: '#64748B', textTransform: 'uppercase', display: 'block', marginBottom: '4px' }}>Reported Value</span>
                  <span style={{ fontSize: '12px', fontWeight: 800, color: '#059669', background: '#ECFDF5', padding: '4px 8px', borderRadius: '6px', display: 'inline-block' }}>
                    {parsed.parameters?.value || 'N/A'} {parsed.parameters?.unit || ''}
                  </span>
                </div>
                <div>
                  <span style={{ fontSize: '11px', fontWeight: 800, color: '#64748B', textTransform: 'uppercase', display: 'block', marginBottom: '4px' }}>Clinical Observations & Remarks</span>
                  <p style={{ fontSize: '12px', color: '#334155', background: '#F8FAFC', padding: '12px', borderRadius: '2px', border: '1px solid #F1F5F9', margin: 0, fontWeight: 600, lineHeight: 1.5 }}>
                    {parsed.remarks || 'No remarks provided.'}
                  </p>
                </div>
                {parsed.document && (
                  <div>
                    <span style={{ fontSize: '11px', fontWeight: 800, color: '#64748B', textTransform: 'uppercase', display: 'block', marginBottom: '4px' }}>Attached Document</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 12px', background: '#EFF6FF', borderRadius: '2px', border: '1px solid #BFDBFE' }}>
                      <span style={{ fontSize: '13px', fontWeight: 700, color: '#1E40AF', flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{parsed.document}</span>
                      <a 
                        href="#" 
                        onClick={(e) => { e.preventDefault(); showToast(`Downloading: ${parsed.document}`, "info"); }} 
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
                  style={{ height: '40px', padding: '0 20px', background: '#0F172A', border: 'none', borderRadius: '2px', fontWeight: 700, color: 'white', cursor: 'pointer' }}
                >Close</button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Profile Edit Modal */}
      {showProfileEditModal && (
        <div className="details-modal-overlay" onClick={() => setShowProfileEditModal(false)} style={{ zIndex: 4000 }}>
          <div className="details-modal-card" onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: '440px', padding: '28px', borderRadius: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <h2 style={{ fontSize: '14px', fontWeight: 800, color: '#0F172A', margin: 0 }}>Edit Receptionist Profile</h2>
              <button 
                onClick={() => setShowProfileEditModal(false)}
                style={{ background: 'none', border: 'none', color: '#64748B', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '4px', borderRadius: '50%' }}
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" x2="6" y1="6" y2="18"/><line x1="6" x2="18" y1="6" y2="18"/></svg>
              </button>
            </div>

            {profileError && (
              <div style={{ padding: '12px', borderRadius: '2px', background: '#FEF2F2', border: '1px solid #FCA5A5', color: '#DC2626', fontSize: '13px', fontWeight: 600, marginBottom: '16px' }}>
                {profileError}
              </div>
            )}

            {profileSuccess && (
              <div style={{ padding: '12px', borderRadius: '2px', background: '#F0FDF4', border: '1px solid #86EFAC', color: '#16A34A', fontSize: '13px', fontWeight: 600, marginBottom: '16px' }}>
                {profileSuccess}
              </div>
            )}

            <form onSubmit={handleUpdateProfileSubmit}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '14px', marginBottom: '12px' }}>
                {profileEditAvatar ? (
                  <img 
                    src={profileEditAvatar} 
                    alt="Preview" 
                    style={{ width: '90px', height: '90px', borderRadius: '50%', objectFit: 'cover', border: '3px solid #F59E0B', boxShadow: '0 8px 20px rgba(245,158,11,0.15)' }} 
                  />
                ) : (
                  <div style={{ width: '90px', height: '90px', borderRadius: '50%', background: 'linear-gradient(135deg, #F59E0B 0%, #D97706 100%)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '32px', fontWeight: 800, boxShadow: '0 8px 20px rgba(245,158,11,0.15)' }}>
                    {profileEditName ? profileEditName.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase() : 'RC'}
                  </div>
                )}
                
                <div>
                  <label style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '8px 14px', background: '#FFF7ED', color: '#EA580C', borderRadius: '2px', fontSize: '12px', fontWeight: 800, cursor: 'pointer', border: '1px dashed #F59E0B' }}>
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
                            showToast("File size must be under 5MB", "error");
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
                  className="form-control" 
                  style={{ width: '100%', border: '1px solid #CBD5E1', borderRadius: '2px', height: '40px', padding: '0 12px', fontSize: '13px', fontWeight: 600, backgroundColor: '#F1F5F9', cursor: 'not-allowed' }}
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
                  className="form-control" 
                  style={{ width: '100%', border: '1px solid #CBD5E1', borderRadius: '2px', height: '40px', padding: '0 12px', fontSize: '13px', fontWeight: 600, backgroundColor: '#F1F5F9', cursor: 'not-allowed' }}
                  value={profileEditEmail} 
                  disabled
                  required 
                />
                <span style={{ fontSize: '11px', color: '#64748B', marginTop: '4px', display: 'block' }}>Managed by Administrator</span>
              </div>

              <button 
                type="submit" 
                className="btn btn-primary" 
                style={{ width: '100%', height: '26px', fontWeight: 800, borderRadius: '2px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                disabled={profileEditLoading}
              >
                {profileEditLoading ? 'Saving...' : 'Save Profile Changes'}
              </button>
            </form>
          </div>
        </div>
      )}

      {showPaymentModal && selectedBillForPayment && (
        <div className="details-modal-overlay" data-lenis-prevent onClick={() => { setShowPaymentModal(false); setPendingRegistrationPayload(null); }}>
          <div className="details-modal-card" onClick={e => e.stopPropagation()} style={{ maxWidth: '480px', padding: '12px' }}>
            <div className="details-modal-header" style={{ marginBottom: '20px', borderBottom: '1px solid #F1F5F9', paddingBottom: '12px' }}>
              <span className="details-modal-title" style={{ fontSize: '14px', fontWeight: 800, color: '#0F172A' }}>Process Appointment Payment</span>
              <button className="details-modal-close" onClick={() => { setShowPaymentModal(false); setPendingRegistrationPayload(null); }}>✕</button>
            </div>
            
            <form onSubmit={handleMarkAsPaidSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', color: '#64748B', marginBottom: '6px' }}>Patient Name</label>
                <input 
                  type="text" 
                  style={{ width: '100%', height: '40px', border: '1px solid #E2E8F0', borderRadius: '2px', padding: '0 12px', fontSize: '12px', fontWeight: 600, backgroundColor: '#F8FAFC' }}
                  value={selectedBillForPayment.patientId?.name || 'Unknown'} 
                  readOnly 
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', color: '#64748B', marginBottom: '6px' }}>Total Charge</label>
                  <input 
                    type="text" 
                    style={{ width: '100%', height: '40px', border: '1px solid #E2E8F0', borderRadius: '2px', padding: '0 12px', fontSize: '12px', fontWeight: 700, backgroundColor: '#F8FAFC' }}
                    value={`₹${selectedBillForPayment.totalAmount.toLocaleString()}`} 
                    readOnly 
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', color: '#64748B', marginBottom: '6px' }}>Discount (%)</label>
                  <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                    <input 
                      type="number" 
                      min="0"
                      max={allowedDiscountPercent}
                      style={{ width: '100%', height: '40px', border: '1px solid #CBD5E1', borderRadius: '2px', padding: '0 28px 0 12px', fontSize: '12px', fontWeight: 800 }}
                      value={discountPercent} 
                      onChange={e => setDiscountPercent(Math.min(allowedDiscountPercent, Math.max(0, Number(e.target.value))))} 
                    />
                    <span style={{ position: 'absolute', right: '12px', fontWeight: 800, color: '#64748B' }}>%</span>
                  </div>
                  <span style={{ fontSize: '10.5px', color: '#64748B', display: 'block', marginTop: '4px', fontWeight: 600 }}>Max limit: {allowedDiscountPercent}%</span>
                </div>
              </div>

              {discountPercent > 0 && (
                <div className="animate-in">
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', color: '#EF4444', marginBottom: '6px' }}>Discount Reason *</label>
                  <input 
                    type="text" 
                    placeholder="e.g. Senior Citizen / Staff Relative"
                    style={{ width: '100%', height: '40px', border: '1px solid #FCA5A5', borderRadius: '2px', padding: '0 12px', fontSize: '12px', fontWeight: 600 }}
                    value={discountReason} 
                    onChange={e => setDiscountReason(e.target.value)} 
                    required={discountPercent > 0}
                  />
                </div>
              )}

              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', color: '#64748B', marginBottom: '6px' }}>Payment Method</label>
                <select 
                  style={{ width: '100%', height: '40px', border: '1px solid #CBD5E1', borderRadius: '2px', padding: '0 8px', fontSize: '12px', fontWeight: 600, background: 'white' }}
                  value={paymentMethod}
                  onChange={e => setPaymentMethod(e.target.value)}
                >
                  <option value="Cash">Cash</option>
                  <option value="Card">Card</option>
                  <option value="UPI">UPI</option>
                  <option value="Netbanking">Netbanking</option>
                </select>
              </div>

              <div style={{ backgroundColor: '#F8FAFC', borderRadius: '2px', padding: '16px', marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '8px', border: '1px solid #E2E8F0' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', color: '#64748B', fontWeight: 600 }}>
                  <span>Original Total:</span>
                  <span>₹{selectedBillForPayment.totalAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                </div>
                {discountPercent > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', color: '#EF4444', fontWeight: 600 }}>
                    <span>Discount Applied:</span>
                    <span>-₹{((selectedBillForPayment.totalAmount * discountPercent) / 100).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                  </div>
                )}
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#0F172A', fontWeight: 850, borderTop: '1px dashed #CBD5E1', paddingTop: '8px', marginTop: '4px' }}>
                  <span>Net Payable Amount:</span>
                  <span style={{ color: '#2563EB', fontSize: '17px' }}>₹{(selectedBillForPayment.totalAmount - (selectedBillForPayment.totalAmount * discountPercent) / 100).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '16px', borderTop: '1px solid #F1F5F9', paddingTop: '16px' }}>
                <button type="button" className="btn btn-secondary" style={{ height: '40px', padding: '0 20px', borderRadius: '2px', fontWeight: 700 }} onClick={() => { setShowPaymentModal(false); setPendingRegistrationPayload(null); }}>Cancel</button>
                <button type="submit" className="btn btn-primary" style={{ height: '40px', padding: '0 24px', borderRadius: '2px', fontWeight: 800, background: 'var(--primary-gradient)', border: 'none' }} disabled={isSettlingPayment}>
                  {isSettlingPayment ? 'Processing Payment & Registering...' : 'Complete Payment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* Indent Order Summary / Requisition Tracking Modal */}
      {showIndentModal && selectedIndent && (() => {
        const indentStatusStyle = (s) => {
          switch (s) {
            case 'Pending': return { background: '#FEF3C7', color: '#D97706', padding: '4px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 800 };
            case 'Approved': return { background: '#EFF6FF', color: '#2563EB', padding: '4px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 800 };
            case 'Awaiting Stock': return { background: '#FEF2F2', color: '#DC2626', padding: '4px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 800 };
            case 'Partially Fulfilled': return { background: '#FFF3E0', color: '#E65100', padding: '4px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 800 };
            case 'Fulfilled':
            case 'Received': return { background: '#D1FAE5', color: '#065F46', padding: '4px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 800 };
            case 'Rejected':
            case 'Cannot Fulfill': return { background: '#FEE2E2', color: '#991B1B', padding: '4px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 800 };
            default: return { background: '#F1F5F9', color: '#64748B', padding: '4px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 800 };
          }
        };

        const getStatusBanner = (status) => {
          switch (status) {
            case 'Pending':
            case 'Draft':
              return {
                text: 'Waiting for Admin Approval',
                bg: '#FEF3C7',
                color: '#92400E',
                border: '#FDE68A'
              };
            case 'Approved':
              return {
                text: 'Approved by Admin — waiting for Pharmacy fulfillment',
                bg: '#EFF6FF',
                color: '#1E40AF',
                border: '#BFDBFE'
              };
            case 'Awaiting Stock':
              return {
                text: 'Temporarily unavailable — Pharmacy will supply when stock is available.',
                bg: '#FEF2F2',
                color: '#991B1B',
                border: '#FECACA'
              };
            case 'Partially Fulfilled':
              return {
                text: 'Partially fulfilled — remaining approved quantity is pending.',
                bg: '#FFF3E0',
                color: '#9A3412',
                border: '#FED7AA'
              };
            case 'Fulfilled':
            case 'Received':
              return {
                text: 'Requisition complete — all approved units have been supplied.',
                bg: '#D1FAE5',
                color: '#065F46',
                border: '#A7F3D0'
              };
            case 'Rejected':
            case 'Cannot Fulfill':
              return {
                text: 'Request rejected by Admin.',
                bg: '#FEE2E2',
                color: '#991B1B',
                border: '#FECACA'
              };
            default:
              return {
                text: status,
                bg: '#F8FAFC',
                color: '#475569',
                border: '#E2E8F0'
              };
          }
        };

        const banner = getStatusBanner(selectedIndent.status);

        return (
          <div onClick={() => { setShowIndentModal(false); setSelectedIndent(null); }} style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)', backdropFilter: 'blur(4px)', zIndex: 9000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '10px' }}>
            <div onClick={e => e.stopPropagation()} style={{ background: 'white', borderRadius: '20px', padding: '32px', width: '100%', maxWidth: '680px', boxShadow: '0 24px 64px rgba(0,0,0,0.15)', animation: 'slideUp 0.3s ease-out', display: 'flex', flexDirection: 'column', maxHeight: '90vh' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexShrink: 0 }}>
                <div>
                  <div style={{ fontSize: '20px', fontWeight: 900, color: '#0F172A' }}>Utility Requisition Tracking</div>
                  <div style={{ fontSize: '13px', color: '#64748B', fontWeight: 600, marginTop: '2px' }}>Request ID: {selectedIndent.indentId}</div>
                </div>
                <button onClick={() => { setShowIndentModal(false); setSelectedIndent(null); }} style={{ background: '#F1F5F9', border: 'none', borderRadius: '4px', width: '32px', height: '32px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748B', fontSize: '14px', fontWeight: 'bold' }}>✕</button>
              </div>

              <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '16px', paddingRight: '4px' }}>
                
                {/* Status Explanation Banner */}
                <div style={{ padding: '12px 16px', background: banner.bg, color: banner.color, border: `1px solid ${banner.border}`, borderRadius: '8px', fontSize: '13px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                  <span>{banner.text}</span>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
                  <div>
                    <span style={{ fontSize: '11px', color: '#94A3B8', fontWeight: 800, textTransform: 'uppercase' }}>Department</span>
                    <div style={{ fontSize: '13px', fontWeight: 700, color: '#1E293B', marginTop: '2px' }}>{selectedIndent.department}</div>
                  </div>
                  <div>
                    <span style={{ fontSize: '11px', color: '#94A3B8', fontWeight: 800, textTransform: 'uppercase' }}>Requested Date</span>
                    <div style={{ fontSize: '13px', fontWeight: 700, color: '#1E293B', marginTop: '2px' }}>
                      {new Date(selectedIndent.createdAt || selectedIndent.requiredDate).toLocaleDateString('en-US', { day: 'numeric', month: 'long', year: 'numeric' })}
                    </div>
                  </div>
                  <div>
                    <span style={{ fontSize: '11px', color: '#94A3B8', fontWeight: 800, textTransform: 'uppercase' }}>Requested By</span>
                    <div style={{ fontSize: '13px', fontWeight: 700, color: '#1E293B', marginTop: '2px' }}>{selectedIndent.requestedBy}</div>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <span style={{ fontSize: '11px', color: '#94A3B8', fontWeight: 800, textTransform: 'uppercase' }}>Current Status:</span>
                  <span style={indentStatusStyle(selectedIndent.status)}>{selectedIndent.status}</span>
                  {selectedIndent.priority === 'Urgent' && (
                    <span style={{ background: '#FEE2E2', color: '#DC2626', padding: '4px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 800 }}>⚡ Urgent</span>
                  )}
                </div>

                <div style={{ borderTop: '1px solid #F1F5F9', paddingTop: '16px' }}>
                  <h4 style={{ fontSize: '13px', fontWeight: 800, color: '#475569', marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Requested Items Breakdown</h4>
                  <div style={{ border: '1px solid #E2E8F0', borderRadius: '8px', overflow: 'hidden' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                      <thead>
                        <tr style={{ background: '#F8FAFC', borderBottom: '1px solid #E2E8F0' }}>
                          <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 700, color: '#475569' }}>Item Name</th>
                          <th style={{ padding: '10px 14px', textAlign: 'center', fontWeight: 700, color: '#475569' }}>Requested</th>
                          <th style={{ padding: '10px 14px', textAlign: 'center', fontWeight: 800, color: '#2563EB' }}>Approved</th>
                          <th style={{ padding: '10px 14px', textAlign: 'center', fontWeight: 800, color: '#16A34A' }}>Supplied</th>
                          <th style={{ padding: '10px 14px', textAlign: 'center', fontWeight: 800, color: '#D97706' }}>Remaining</th>
                          <th style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 700, color: '#475569' }}>Item Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(selectedIndent.items || []).map((item, idx) => {
                          const isApproved = item.approvedQty !== null && item.approvedQty !== undefined;
                          const reqQty = Number(item.requiredQty) || 0;
                          const appQty = isApproved ? Number(item.approvedQty) : null;
                          const supQty = Number(item.suppliedQty || 0);
                          const remQty = isApproved ? Math.max(0, appQty - supQty) : null;

                          let itemStatusLabel = 'Pending Approval';
                          let itemStatusBg = '#FEF3C7';
                          let itemStatusColor = '#D97706';

                          if (selectedIndent.status === 'Rejected' || selectedIndent.status === 'Cannot Fulfill') {
                            itemStatusLabel = 'Rejected';
                            itemStatusBg = '#FEE2E2';
                            itemStatusColor = '#991B1B';
                          } else if (isApproved) {
                            if (supQty >= appQty && appQty > 0) {
                              itemStatusLabel = '✓ Fulfilled';
                              itemStatusBg = '#D1FAE5';
                              itemStatusColor = '#065F46';
                            } else if (supQty > 0) {
                              itemStatusLabel = `Partial (${supQty}/${appQty})`;
                              itemStatusBg = '#FFF3E0';
                              itemStatusColor = '#E65100';
                            } else if (selectedIndent.status === 'Awaiting Stock') {
                              itemStatusLabel = 'Awaiting Stock';
                              itemStatusBg = '#FEF2F2';
                              itemStatusColor = '#DC2626';
                            } else {
                              itemStatusLabel = 'Approved (Pending Supply)';
                              itemStatusBg = '#EFF6FF';
                              itemStatusColor = '#2563EB';
                            }
                          }

                          return (
                            <tr key={idx} style={{ borderBottom: idx === (selectedIndent.items || []).length - 1 ? 'none' : '1px solid #F1F5F9' }}>
                              <td style={{ padding: '10px 14px', fontWeight: 700, color: '#0F172A' }}>
                                <div>{item.name}</div>
                                <div style={{ fontSize: '11px', color: '#64748B', fontWeight: 500 }}>{item.category || item.unit || 'Strip'}</div>
                              </td>
                              <td style={{ padding: '10px 14px', textAlign: 'center', fontWeight: 700, color: '#475569' }}>
                                {reqQty}
                              </td>
                              <td style={{ padding: '10px 14px', textAlign: 'center', fontWeight: 800, color: '#2563EB' }}>
                                {appQty !== null ? appQty : '—'}
                              </td>
                              <td style={{ padding: '10px 14px', textAlign: 'center', fontWeight: 800, color: '#16A34A' }}>
                                {supQty}
                              </td>
                              <td style={{ padding: '10px 14px', textAlign: 'center', fontWeight: 800, color: remQty !== null && remQty > 0 ? '#D97706' : '#64748B' }}>
                                {remQty !== null ? remQty : '—'}
                              </td>
                              <td style={{ padding: '10px 14px', textAlign: 'right' }}>
                                <span style={{ background: itemStatusBg, color: itemStatusColor, padding: '3px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 800 }}>
                                  {itemStatusLabel}
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>

                {selectedIndent.purpose && (
                  <div style={{ borderTop: '1px solid #F1F5F9', paddingTop: '14px' }}>
                    <span style={{ fontSize: '11px', color: '#94A3B8', fontWeight: 800, textTransform: 'uppercase' }}>Remarks/Purpose:</span>
                    <div style={{ fontSize: '13px', color: '#475569', marginTop: '4px', fontStyle: 'italic' }}>{selectedIndent.purpose}</div>
                  </div>
                )}
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', padding: '20px 0 0 0', borderTop: '1px solid #F1F5F9', flexShrink: 0, marginTop: '20px' }}>
                <button 
                  onClick={() => { setShowIndentModal(false); setSelectedIndent(null); }}
                  style={{ height: '40px', padding: '0 20px', borderRadius: '4px', border: '1px solid #CBD5E1', background: 'white', cursor: 'pointer', fontWeight: 700, fontSize: '13px', color: '#475569' }}
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        );
      })()}
      {/* PATIENT ACTION MENU POPOVER */}
      {activePatientMenuId && (() => {
        const targetPatient = patientsList.find(p => String(p._id) === String(activePatientMenuId));
        if (!targetPatient) return null;
        return (
          <>
            <div 
              style={{ position: 'fixed', inset: 0, zIndex: 999998, background: 'transparent' }}
              onClick={(e) => {
                e.stopPropagation();
                setActivePatientMenuId(null);
              }}
            />
            <div
              style={{
                position: 'fixed',
                top: `${patientMenuPos.top}px`,
                right: `${patientMenuPos.right}px`,
                zIndex: 999999,
                background: '#FFFFFF',
                border: '1.5px solid #E2E8F0',
                borderRadius: '4px',
                boxShadow: '0 12px 30px rgba(0, 0, 0, 0.18)',
                width: '215px',
                overflow: 'hidden',
                padding: '6px 0'
              }}
            >
              <div
                onClick={() => {
                  setActivePatientMenuId(null);
                  handleOpenPatientProfile(targetPatient);
                }}
                style={{ padding: '10px 14px', fontSize: '12.5px', fontWeight: 700, color: '#1E293B', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '10px', transition: 'background 0.15s' }}
                onMouseEnter={e => e.currentTarget.style.background = '#F1F5F9'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#2563EB" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                View Patient Profile
              </div>

              <div
                onClick={() => {
                  setActivePatientMenuId(null);
                  handleRePrintPatientSlip(targetPatient);
                }}
                style={{ padding: '10px 14px', fontSize: '12.5px', fontWeight: 700, color: '#059669', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '10px', transition: 'background 0.15s' }}
                onMouseEnter={e => e.currentTarget.style.background = '#ECFDF5'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
                Re-Print Receipt / Slip
              </div>

              <div
                onClick={() => {
                  setActivePatientMenuId(null);
                  setFormData({ name: targetPatient.name, age: targetPatient.age, gender: targetPatient.gender, contact: targetPatient.contact, email: targetPatient.email || '', doctorId: '' });
                  setIsExistingPatient(true);
                  setSelectedPatient(targetPatient);
                  switchTab('registration-form', true);
                }}
                style={{ padding: '10px 14px', fontSize: '12.5px', fontWeight: 700, color: '#7C3AED', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '10px', transition: 'background 0.15s' }}
                onMouseEnter={e => e.currentTarget.style.background = '#F5F3FF'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#7C3AED" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                Book / Order Procedure
              </div>

              <div
                onClick={() => {
                  setActivePatientMenuId(null);
                  setFormData({
                    name: targetPatient.name,
                    age: targetPatient.age,
                    gender: targetPatient.gender,
                    contact: targetPatient.contact,
                    email: targetPatient.email || '',
                    bloodGroup: targetPatient.bloodGroup || 'O+',
                    address: targetPatient.address || '',
                    medicalHistory: targetPatient.medicalHistory ? targetPatient.medicalHistory.join(', ') : '',
                    doctorId: ''
                  });
                  setIsExistingPatient(true);
                  switchTab('registration-form', true);
                }}
                style={{ padding: '10px 14px', fontSize: '12.5px', fontWeight: 700, color: '#475569', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '10px', transition: 'background 0.15s' }}
                onMouseEnter={e => e.currentTarget.style.background = '#F8FAFC'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#475569" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>
                Edit Patient Info
              </div>
            </div>
          </>
        );
      })()}

      {/* PAYMENT & DIAGNOSTIC LAB / CLINICAL ORDER SLIP PDF MODAL */}
      {showSlipPdfModal && activeSlipData && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.65)', backdropFilter: 'blur(4px)', zIndex: 99999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '10px' }}>
          <style>{`
            @media print {
              @page {
                size: A4 portrait;
                margin: 0;
              }
              html, body {
                width: 210mm !important;
                height: 297mm !important;
                margin: 0 !important;
                padding: 0 !important;
                background: #FFFFFF !important;
                -webkit-print-color-adjust: exact !important;
                print-color-adjust: exact !important;
              }
              body * {
                visibility: hidden !important;
              }
              #printable-receipt-slip, #printable-receipt-slip * {
                visibility: visible !important;
                -webkit-print-color-adjust: exact !important;
                print-color-adjust: exact !important;
              }
              #printable-receipt-slip {
                position: relative !important;
                left: 0 !important;
                top: 0 !important;
                transform: none !important;
                width: 210mm !important;
                max-width: 210mm !important;
                height: 297mm !important;
                min-height: 297mm !important;
                box-sizing: border-box !important;
                box-shadow: none !important;
                border: none !important;
                padding: 20mm 20mm 15mm 20mm !important;
                margin: 0 auto !important;
                background: #FFFFFF !important;
                color: #0F172A !important;
                border-radius: 0 !important;
                display: flex !important;
                flex-direction: column !important;
                justify-content: space-between !important;
              }
              .print-diagonal-watermark {
                position: absolute !important;
                top: 46% !important;
                left: 50% !important;
                transform: translate(-50%, -50%) rotate(-35deg) !important;
                opacity: 0.16 !important;
                -webkit-print-color-adjust: exact !important;
                print-color-adjust: exact !important;
                display: block !important;
                visibility: visible !important;
                z-index: 0 !important;
                text-align: center !important;
                white-space: nowrap !important;
                width: 100% !important;
              }
              .print-diagonal-watermark-text {
                font-size: 130px !important;
                font-weight: 900 !important;
                color: #475569 !important;
                letter-spacing: 28px !important;
                text-transform: uppercase !important;
                line-height: 1 !important;
                -webkit-print-color-adjust: exact !important;
                print-color-adjust: exact !important;
              }
              .print-diagonal-watermark-subtext {
                font-size: 26px !important;
                font-weight: 800 !important;
                color: #64748B !important;
                letter-spacing: 14px !important;
                text-transform: uppercase !important;
                margin-top: 14px !important;
                -webkit-print-color-adjust: exact !important;
                print-color-adjust: exact !important;
              }
              .no-print {
                display: none !important;
              }
            }
          `}</style>

          <div id="printable-receipt-slip" style={{ background: '#FFFFFF', borderRadius: '16px', width: '100%', maxWidth: '720px', padding: '36px 40px', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)', border: '1px solid #E2E8F0', position: 'relative', overflow: 'hidden' }}>
            {/* Top Right Close Button */}
            <button 
              type="button"
              className="no-print"
              onClick={() => {
                setShowSlipPdfModal(false);
                setActiveSlipData(null);
                switchTab('patients');
              }}
              style={{
                position: 'absolute',
                top: '16px',
                right: '16px',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                color: '#64748B',
                padding: '8px',
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'background 0.2s',
                zIndex: 10
              }}
              onMouseEnter={e => e.currentTarget.style.backgroundColor = '#F1F5F9'}
              onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
            
            {/* Massive Diagonal Watermark - CUROXA (Optimized for PDF Print) */}
            <div 
              className="print-diagonal-watermark"
              style={{ 
                position: 'absolute', 
                top: '48%', 
                left: '50%', 
                transform: 'translate(-50%, -50%) rotate(-35deg)', 
                opacity: 0.14, 
                pointerEvents: 'none', 
                userSelect: 'none', 
                whiteSpace: 'nowrap',
                zIndex: 0, 
                WebkitPrintColorAdjust: 'exact', 
                printColorAdjust: 'exact',
                textAlign: 'center',
                width: '100%'
              }}
            >
              <div className="print-diagonal-watermark-text" style={{ fontSize: '110px', fontWeight: 900, color: '#64748B', letterSpacing: '24px', textTransform: 'uppercase', fontFamily: "'Outfit', sans-serif", lineHeight: 1 }}>
                CUROXA
              </div>
              <div className="print-diagonal-watermark-subtext" style={{ fontSize: '22px', fontWeight: 800, color: '#64748B', letterSpacing: '12px', textTransform: 'uppercase', marginTop: '12px' }}>
                HEALTHCARE • MEDICAL RECEIPT
              </div>
            </div>

            {/* Header */}
            <div style={{ borderBottom: '2px solid #2563EB', paddingBottom: '16px', marginBottom: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', position: 'relative', zIndex: 1 }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div style={{ width: '42px', height: '42px', borderRadius: '2px', background: '#2563EB', WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact', color: '#FFFFFF', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 12px rgba(37,99,235,0.3)', flexShrink: 0 }}>
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M11 2a2 2 0 0 0-2 2v5H4a2 2 0 0 0-2 2v2a2 2 0 0 0 2 2h5v5a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2v-5h5a2 2 0 0 0 2-2v-2a2 2 0 0 0-2-2h-5V4a2 2 0 0 0-2-2h-2z"/>
                    </svg>
                  </div>
                  <div>
                    <h2 style={{ margin: 0, fontSize: '21px', fontWeight: 900, color: '#0F172A', fontFamily: "'Outfit', sans-serif" }}>{activeSlipData.hospitalName || 'Curoxa Medical Center'}</h2>
                    <span style={{ fontSize: '11px', color: '#2563EB', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.8px', display: 'block', marginTop: '2px' }}>Official Payment Receipt & Clinical Service Order Slip</span>
                  </div>
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <span style={{ fontSize: '12.5px', fontWeight: 900, color: '#2563EB', background: '#EFF6FF', padding: '4px 12px', borderRadius: '6px', border: '1px solid #BFDBFE', display: 'inline-block', WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' }}>{activeSlipData.receiptNo}</span>
                <div style={{ fontSize: '11px', color: '#64748B', marginTop: '6px', fontWeight: 600 }}>Date: {activeSlipData.date}</div>
              </div>
            </div>

            {/* Patient Meta Details */}
            <div style={{ background: '#F8FAFC', borderRadius: '4px', padding: '16px', border: '1px solid #E2E8F0', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '20px', position: 'relative', zIndex: 1, WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' }}>
              <div>
                <span style={{ fontSize: '10px', fontWeight: 800, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.5px' }}>PATIENT NAME</span>
                <div style={{ fontSize: '12px', fontWeight: 800, color: '#0F172A', marginTop: '2px' }}>{activeSlipData.patientName}</div>
                <div style={{ fontSize: '11px', color: '#64748B', fontWeight: 700, marginTop: '2px' }}>UHID: {activeSlipData.patientId}</div>
              </div>
              <div>
                <span style={{ fontSize: '10px', fontWeight: 800, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.5px' }}>AGE / GENDER / CONTACT</span>
                <div style={{ fontSize: '12px', fontWeight: 700, color: '#334155', marginTop: '2px' }}>{activeSlipData.ageGender}</div>
                <div style={{ fontSize: '11px', color: '#64748B', fontWeight: 600, marginTop: '2px' }}>Phone: {activeSlipData.contact}</div>
              </div>
            </div>

            {/* Order & Payment Items Table */}
            <div style={{ border: '1px solid #E2E8F0', borderRadius: '2px', overflow: 'hidden', marginBottom: '20px', position: 'relative', zIndex: 1 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                <thead>
                  <tr style={{ background: '#F1F5F9', borderBottom: '1px solid #E2E8F0', WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' }}>
                    <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 800, color: '#475569', width: '50px' }}>#</th>
                    <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 800, color: '#475569' }}>Investigation / Procedure Description</th>
                    <th style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 800, color: '#475569', width: '120px' }}>Amount (₹)</th>
                  </tr>
                </thead>
                <tbody>
                  {(activeSlipData.items || []).map((item, idx) => (
                    <tr key={idx} style={{ borderBottom: '1px solid #F1F5F9', background: idx % 2 === 1 ? '#FAFAFA' : '#FFFFFF', WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' }}>
                      <td style={{ padding: '10px 14px', fontWeight: 700, color: '#64748B' }}>{idx + 1}</td>
                      <td style={{ padding: '10px 14px', fontWeight: 800, color: '#0F172A' }}>{item.description || item.name || activeSlipData.testName}</td>
                      <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 800, color: '#0F172A' }}>₹{(item.amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Price Summary & Payment Status */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#F0FDF4', border: '1.5px solid #BBF7D0', padding: '14px 18px', borderRadius: '2px', marginBottom: '20px', position: 'relative', zIndex: 1, WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' }}>
              <div>
                <span style={{ fontSize: '11px', fontWeight: 800, color: '#15803D', textTransform: 'uppercase', letterSpacing: '0.5px' }}>PAYMENT STATUS</span>
                <div style={{ fontSize: '12px', fontWeight: 900, color: '#166534', display: 'flex', alignItems: 'center', gap: '8px', marginTop: '3px' }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#15803D" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
                    <polyline points="22 4 12 14.01 9 11.01"/>
                  </svg>
                  PAID via {activeSlipData.paymentMethod || activeSlipData.paymentMode || 'Cash'}
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <span style={{ fontSize: '11px', fontWeight: 800, color: '#15803D', textTransform: 'uppercase', letterSpacing: '0.5px' }}>TOTAL RECEIVED</span>
                <div style={{ fontSize: '22px', fontWeight: 900, color: '#15803D', fontFamily: "'Outfit', sans-serif" }}>₹{(activeSlipData.totalAmount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</div>
              </div>
            </div>

            {/* Instructions, Barcode & Signature */}
            <div style={{ background: '#F8FAFC', border: '1px dashed #CBD5E1', padding: '14px 16px', borderRadius: '2px', marginBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'relative', zIndex: 1, WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#2563EB" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginTop: '1px', shrink: 0 }}>
                  <circle cx="12" cy="12" r="10"/>
                  <line x1="12" y1="16" x2="12" y2="12"/>
                  <line x1="12" y1="8" x2="12.01" y2="8"/>
                </svg>
                <div>
                  <div style={{ fontSize: '12px', color: '#334155', fontWeight: 700 }}>
                    <strong>Instructions:</strong> Please present this computer-generated official receipt at the counter.
                  </div>
                  <div style={{ fontSize: '10.5px', color: '#64748B', marginTop: '2px' }}>Authorized Signature / Computer Generated Receipt</div>
                </div>
              </div>
              <div style={{ textAlign: 'right', paddingLeft: '16px', display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                <svg width="120" height="28" viewBox="0 0 120 28" style={{ display: 'block' }}>
                  <rect x="0" y="0" width="3" height="24" fill="#334155"/>
                  <rect x="5" y="0" width="1" height="24" fill="#334155"/>
                  <rect x="8" y="0" width="2" height="24" fill="#334155"/>
                  <rect x="12" y="0" width="4" height="24" fill="#334155"/>
                  <rect x="18" y="0" width="1" height="24" fill="#334155"/>
                  <rect x="21" y="0" width="3" height="24" fill="#334155"/>
                  <rect x="26" y="0" width="2" height="24" fill="#334155"/>
                  <rect x="30" y="0" width="1" height="24" fill="#334155"/>
                  <rect x="33" y="0" width="4" height="24" fill="#334155"/>
                  <rect x="39" y="0" width="2" height="24" fill="#334155"/>
                  <rect x="43" y="0" width="1" height="24" fill="#334155"/>
                  <rect x="46" y="0" width="3" height="24" fill="#334155"/>
                  <rect x="51" y="0" width="2" height="24" fill="#334155"/>
                  <rect x="55" y="0" width="4" height="24" fill="#334155"/>
                  <rect x="61" y="0" width="1" height="24" fill="#334155"/>
                  <rect x="64" y="0" width="3" height="24" fill="#334155"/>
                  <rect x="69" y="0" width="2" height="24" fill="#334155"/>
                  <rect x="73" y="0" width="1" height="24" fill="#334155"/>
                  <rect x="76" y="0" width="4" height="24" fill="#334155"/>
                  <rect x="82" y="0" width="2" height="24" fill="#334155"/>
                  <rect x="86" y="0" width="1" height="24" fill="#334155"/>
                  <rect x="89" y="0" width="3" height="24" fill="#334155"/>
                  <rect x="94" y="0" width="2" height="24" fill="#334155"/>
                  <rect x="98" y="0" width="4" height="24" fill="#334155"/>
                  <rect x="104" y="0" width="1" height="24" fill="#334155"/>
                  <rect x="107" y="0" width="3" height="24" fill="#334155"/>
                  <rect x="112" y="0" width="2" height="24" fill="#334155"/>
                  <rect x="116" y="0" width="1" height="24" fill="#334155"/>
                </svg>
                <div style={{ fontSize: '9px', color: '#64748B', fontWeight: 800, marginTop: '2px', letterSpacing: '1px' }}>{activeSlipData.receiptNo}</div>
              </div>
            </div>

            {/* Official Footer Bar with Website Link */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '12px', borderTop: '1px solid #E2E8F0', fontSize: '11px', color: '#64748B', fontWeight: 700, position: 'relative', zIndex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#2563EB" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10"/>
                  <line x1="2" y1="12" x2="22" y2="12"/>
                  <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
                </svg>
                <span style={{ color: '#2563EB', fontWeight: 800 }}>www.curoxa-healthcare.com</span>
              </div>
              <div style={{ fontSize: '10.5px', color: '#94A3B8', fontWeight: 600 }}>
                Official Computer Generated Receipt • Valid Without Physical Signature
              </div>
            </div>

            {/* Actions (Hidden when printing or saving PDF) */}
            <div className="no-print" style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', paddingTop: '16px', borderTop: '1px solid #F1F5F9', marginTop: '16px', position: 'relative', zIndex: 1 }}>
              <button
                type="button"
                onClick={() => window.print()}
                style={{ padding: '10px 18px', background: '#F8FAFC', border: '1px solid #CBD5E1', borderRadius: '2px', color: '#334155', fontWeight: 700, fontSize: '13px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', transition: 'all 0.15s ease' }}
                onMouseEnter={e => e.currentTarget.style.background = '#F1F5F9'}
                onMouseLeave={e => e.currentTarget.style.background = '#F8FAFC'}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="6 9 6 2 18 2 18 9"/>
                  <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/>
                  <rect x="6" y="14" width="12" height="8"/>
                </svg>
                Print Slip
              </button>
              <button
                type="button"
                onClick={() => window.print()}
                style={{ padding: '10px 18px', background: '#059669', border: 'none', borderRadius: '2px', color: 'white', fontWeight: 800, fontSize: '13px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', boxShadow: '0 4px 12px rgba(5,150,105,0.25)', transition: 'all 0.15s ease' }}
                onMouseEnter={e => e.currentTarget.style.background = '#047857'}
                onMouseLeave={e => e.currentTarget.style.background = '#059669'}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                  <polyline points="7 10 12 15 17 10"/>
                  <line x1="12" y1="15" x2="12" y2="3"/>
                </svg>
                Save as PDF
              </button>
              <button
                type="button"
                onClick={() => {
                  const rawNumber = activeSlipData.contact || '';
                  const cleanNumber = rawNumber.replace(/\D/g, '');
                  const phoneWithCountry = cleanNumber.length === 10 ? `91${cleanNumber}` : cleanNumber;
                  const message = `Hello, here is your payment receipt & clinical service order slip from ${activeSlipData.hospitalName || 'Curoxa Medical Center'}.\n\nReceipt No: ${activeSlipData.receiptNo}\nTotal Amount: ₹${activeSlipData.totalAmount}\nUHID: ${activeSlipData.patientId}\n\nThank you!`;
                  const url = `https://wa.me/${phoneWithCountry}?text=${encodeURIComponent(message)}`;
                  window.open(url, '_blank');
                }}
                style={{ padding: '10px 18px', background: '#2563EB', border: 'none', borderRadius: '2px', color: 'white', fontWeight: 800, fontSize: '13px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', boxShadow: '0 4px 12px rgba(37,99,235,0.25)', transition: 'all 0.15s ease' }}
                onMouseEnter={e => e.currentTarget.style.background = '#1D4ED8'}
                onMouseLeave={e => e.currentTarget.style.background = '#2563EB'}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
                  <polyline points="16 6 12 2 8 6" />
                  <line x1="12" y1="2" x2="12" y2="15" />
                </svg>
                Share
              </button>
            </div>
          </div>
        </div>
      )}

      {/* RECORD / EDIT VITALS MODAL */}
      {showVitalsModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.65)', backdropFilter: 'blur(4px)', zIndex: 99999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '10px' }}>
          <div className="glass-card" style={{ background: 'white', borderRadius: '16px', border: '1.5px solid #C4B5FD', padding: '28px', width: '100%', maxWidth: '520px', boxShadow: '0 20px 40px rgba(0,0,0,0.12)', animation: 'slideUp 0.3s ease-out' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', borderBottom: '1px solid #F1F5F9', paddingBottom: '12px' }}>
              <h3 style={{ fontSize: '14px', fontWeight: 900, color: '#1A1D23', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#2563EB" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
                </svg>
                Record Patient Vitals
              </h3>
              <button 
                type="button" 
                onClick={() => setShowVitalsModal(false)}
                style={{ background: 'none', border: 'none', color: '#64748B', cursor: 'pointer', padding: '4px' }}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveVitals}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '12px' }}>
                <div className="form-group" style={{ margin: 0 }}>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 800, color: '#475569', marginBottom: '6px', textTransform: 'uppercase' }}>Temperature (°F)</label>
                  <input 
                    type="number" 
                    step="0.1" 
                    className="form-control" 
                    placeholder="e.g. 98.6"
                    style={{ height: '40px', borderRadius: '2px', border: '1px solid #CBD5E1', padding: '0 12px', width: '100%' }}
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
                    style={{ height: '40px', borderRadius: '2px', border: '1px solid #CBD5E1', padding: '0 12px', width: '100%' }}
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
                    style={{ height: '40px', borderRadius: '2px', border: '1px solid #CBD5E1', padding: '0 12px', width: '100%' }}
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
                    style={{ height: '40px', borderRadius: '2px', border: '1px solid #CBD5E1', padding: '0 12px', width: '100%' }}
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
                    style={{ height: '40px', borderRadius: '2px', border: '1px solid #CBD5E1', padding: '0 12px', width: '100%' }}
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
                    style={{ height: '40px', borderRadius: '2px', border: '1px solid #CBD5E1', padding: '0 12px', width: '100%' }}
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
                    style={{ height: '40px', borderRadius: '2px', border: '1px solid #CBD5E1', padding: '0 12px', width: '100%' }}
                    value={vitalWeight}
                    onChange={e => setVitalWeight(e.target.value)}
                  />
                </div>

                <div className="form-group" style={{ margin: 0 }}>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 800, color: '#475569', marginBottom: '6px', textTransform: 'uppercase' }}>Height (cm)</label>
                  <input 
                    type="number" 
                    className="form-control" 
                    placeholder="e.g. 170"
                    style={{ height: '40px', borderRadius: '2px', border: '1px solid #CBD5E1', padding: '0 12px', width: '100%' }}
                    value={vitalHeight}
                    onChange={e => setVitalHeight(e.target.value)}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', borderTop: '1px solid #F1F5F9', paddingTop: '16px' }}>
                <button 
                  type="button" 
                  className="btn btn-secondary" 
                  style={{ height: '42px', padding: '0 20px', borderRadius: '2px', border: '1.5px solid #CBD5E1', background: 'white', color: '#475569', fontWeight: 700 }}
                  onClick={() => setShowVitalsModal(false)}
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  className="btn btn-primary" 
                  style={{ height: '42px', padding: '0 24px', borderRadius: '2px', background: '#2563EB', color: 'white', fontWeight: 800, border: 'none' }}
                  disabled={loading}
                >
                  {loading ? 'Saving...' : 'Save Vitals'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* BATCH SMS / BROADCAST COMMUNICATION MODAL */}
      {showBatchSmsModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.65)', backdropFilter: 'blur(6px)', zIndex: 999999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '10px' }}>
          <div style={{ background: '#FFFFFF', borderRadius: '16px', width: '100%', maxWidth: '540px', padding: '28px', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)', border: '1px solid #E2E8F0', animation: 'zoomIn 0.2s cubic-bezier(0.16, 1, 0.3, 1)' }}>
            
            {/* Modal Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', paddingBottom: '14px', borderBottom: '1px solid #F1F5F9' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{ width: '38px', height: '26px', borderRadius: '2px', background: '#EFF6FF', color: '#2563EB', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: '17px', fontWeight: 800, color: '#0F172A' }}>Dispatch Batch SMS / Notification</h3>
                  <span style={{ fontSize: '12px', color: '#64748B', fontWeight: 600 }}>Broadcast SMS alert to {selectedPatientIds.length} selected patient(s)</span>
                </div>
              </div>
              <button 
                type="button" 
                onClick={() => setShowBatchSmsModal(false)}
                style={{ background: '#F1F5F9', border: 'none', borderRadius: '2px', width: '32px', height: '22px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#64748B' }}
              >
                ✕
              </button>
            </div>

            {/* Selected Patients Summary Chips */}
            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 800, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '8px' }}>
                RECIPIENTS ({selectedPatientIds.length})
              </label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', maxHeight: '90px', overflowY: 'auto', padding: '10px', background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '2px' }}>
                {patientsList.filter(p => selectedPatientIds.includes(p._id)).map(p => (
                  <span key={p._id} style={{ background: '#EFF6FF', color: '#1D4ED8', border: '1px solid #BFDBFE', padding: '3px 8px', borderRadius: '6px', fontSize: '12px', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                    👤 {p.name} ({p.contact})
                  </span>
                ))}
              </div>
            </div>

            {/* Template Selector */}
            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 800, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '8px' }}>
                SMS TEMPLATE
              </label>
              <select 
                value={batchSmsTemplate}
                onChange={(e) => {
                  const val = e.target.value;
                  setBatchSmsTemplate(val);
                  if (val === 'reminder') {
                    setBatchSmsMessage('Dear Patient, this is an official reminder for your clinical visit at Curoxa Medical Center. Please arrive 10 mins early.');
                  } else if (val === 'lab') {
                    setBatchSmsMessage('Dear Patient, your diagnostic lab test results are ready at Curoxa Medical Center. You can collect your report at counter 2.');
                  } else if (val === 'general') {
                    setBatchSmsMessage('Dear Valued Patient, Curoxa Medical Center wishes you good health! Our specialized OPD clinics are open Mon-Sat 9 AM - 8 PM.');
                  }
                }}
                style={{ width: '100%', height: '42px', borderRadius: '2px', border: '1px solid #CBD5E1', padding: '0 12px', fontSize: '13px', fontWeight: 700, color: '#0F172A', background: '#FFFFFF', outline: 'none' }}
              >
                <option value="reminder">Appointment & Visit Reminder</option>
                <option value="lab">Lab Test Result Ready Notification</option>
                <option value="general">Hospital Announcement / OPD Schedule</option>
                <option value="custom">Custom SMS Message</option>
              </select>
            </div>

            {/* Message Body Textarea */}
            <div style={{ marginBottom: '20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                <label style={{ fontSize: '12px', fontWeight: 800, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.5px' }}>MESSAGE CONTENT</label>
                <span style={{ fontSize: '11px', color: '#64748B', fontWeight: 700 }}>{batchSmsMessage.length} chars (1 SMS per patient)</span>
              </div>
              <textarea 
                rows="4"
                value={batchSmsMessage}
                onChange={(e) => setBatchSmsMessage(e.target.value)}
                placeholder="Enter SMS message content to broadcast..."
                style={{ width: '100%', padding: '12px', borderRadius: '2px', border: '1px solid #CBD5E1', fontSize: '13px', fontFamily: 'inherit', color: '#0F172A', outline: 'none', background: '#F8FAFC', resize: 'none' }}
              />
            </div>

            {/* Action Buttons */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', paddingTop: '14px', borderTop: '1px solid #F1F5F9' }}>
              <button 
                type="button" 
                onClick={() => setShowBatchSmsModal(false)}
                style={{ padding: '10px 18px', background: '#F1F5F9', border: '1px solid #CBD5E1', borderRadius: '2px', color: '#475569', fontWeight: 700, fontSize: '13px', cursor: 'pointer' }}
              >
                Cancel
              </button>
              <button 
                type="button"
                disabled={batchSmsSending || !batchSmsMessage.trim()}
                onClick={() => {
                  setBatchSmsSending(true);
                  setTimeout(() => {
                    setBatchSmsSending(false);
                    setShowBatchSmsModal(false);
                    setBatchSmsSuccessToast(`Batch SMS successfully dispatched to ${selectedPatientIds.length} patient(s)!`);
                    setSelectedPatientIds([]);
                    setTimeout(() => setBatchSmsSuccessToast(''), 4500);
                  }, 1000);
                }}
                style={{ padding: '10px 22px', background: '#2563EB', border: 'none', borderRadius: '2px', color: 'white', fontWeight: 800, fontSize: '13px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', boxShadow: '0 4px 12px rgba(37,99,235,0.25)', opacity: batchSmsSending ? 0.7 : 1 }}
              >
                {batchSmsSending ? 'Dispatching SMS...' : `Dispatch SMS to ${selectedPatientIds.length} Patient(s)`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* SUCCESS TOAST NOTIFICATION */}
      {batchSmsSuccessToast && (
        <div style={{ position: 'fixed', bottom: '28px', right: '28px', background: '#0F172A', color: 'white', padding: '14px 20px', borderRadius: '4px', border: '1px solid #22C55E', boxShadow: '0 20px 40px rgba(0, 0, 0, 0.3)', display: 'flex', alignItems: 'center', gap: '12px', zIndex: 999999, animation: 'slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1)' }}>
          <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: '#22C55E', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: '12px' }}>✓</div>
          <div style={{ fontSize: '12px', fontWeight: 700, color: '#F8FAFC' }}>{batchSmsSuccessToast}</div>
        </div>
      )}
      {/* View Lab Report Modal (Rendered globally so it can be opened from any tab) */}
      {labModalOpen && selectedLabRequest && (
        <div onClick={() => setLabModalOpen(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)', backdropFilter: 'blur(4px)', zIndex: 9000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '10px' }}>
          <div onClick={e => e.stopPropagation()} style={{ background: 'white', borderRadius: '20px', padding: '32px', width: '100%', maxWidth: '600px', boxShadow: '0 24px 64px rgba(0,0,0,0.15)', animation: 'slideUp 0.3s ease-out' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <div>
                <div style={{ fontSize: '20px', fontWeight: 900, color: '#0F172A' }}>Lab Investigation Report</div>
                <div style={{ fontSize: '12px', color: '#64748B', fontWeight: 600, marginTop: '2px' }}>Test Name: {selectedLabRequest.testName}</div>
              </div>
              <button onClick={() => setLabModalOpen(false)} style={{ background: '#F1F5F9', border: 'none', borderRadius: '2px', width: '32px', height: '22px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748B', fontSize: '14px', fontWeight: 'bold' }}>✕</button>
            </div>

            <div style={{ padding: '10px', background: '#F8FAFC', borderRadius: '4px', border: '1px solid #E2E8F0', whiteSpace: 'pre-wrap', fontFamily: 'monospace', fontSize: '13px', color: '#1E293B', lineHeight: '1.6', maxHeight: '400px', overflowY: 'auto' }}>
              {selectedLabRequest.results || 'Report is pending completion.'}
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default ReceptionistDashboard;
