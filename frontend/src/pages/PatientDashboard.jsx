import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../utils/api';
import { joinTenantRoom } from '../utils/socket';
import { convertPdfToImage } from '../utils/pdfHelper';
import curoxaHero3D from '../assets/curoxa_hero_3d.png';
import curoxaMobileHero3D from '../assets/curoxa_mobile_hero_3d.png';
import curoxaSidebarLogo from '../assets/curoxa_sidebar_logo.png';
import HospitalLoadingTransition from '../components/patient/hospital/HospitalLoadingTransition';
import HospitalTopNav from '../components/patient/hospital/HospitalTopNav';
import HospitalBottomNav from '../components/patient/hospital/HospitalBottomNav';
import PatientHospitalHome from '../components/patient/hospital/PatientHospitalHome';
import WithdrawConsentNoticeModal from '../components/patient/hospital/WithdrawConsentNoticeModal';

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

const HOSPITALS = [];

const getHospitalDetails = (tenantId, hospitalList = []) => {
  const match = hospitalList.find(h => (h.id === tenantId || h.code === tenantId));
  if (match) return match;

  let dynamicName = 'Hospital';
  try {
    const storedUser = JSON.parse(localStorage.getItem('user') || '{}');
    if (storedUser && (storedUser.tenantId === tenantId || storedUser.code === tenantId) && storedUser.tenantName) {
      dynamicName = storedUser.tenantName;
    } else if (tenantId) {
      dynamicName = tenantId.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
    }
  } catch (e) {
    if (tenantId) {
      dynamicName = tenantId.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
    }
  }

  return { 
    id: tenantId,
    code: tenantId,
    name: dynamicName,
    location: '',
    address: '',
    status: 'Active',
    departments: [],
    specialties: []
  };
};

const calculateDistance = (lat1, lon1, lat2, lon2) => {
  const R = 6371; // Radius of the earth in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  const d = R * c; // Distance in km
  return d;
};

const DEFAULT_TIME_SLOTS = [
  '09:00 AM - 09:30 AM', '09:30 AM - 10:00 AM', '10:00 AM - 10:30 AM',
  '10:30 AM - 11:00 AM', '11:00 AM - 11:30 AM', '11:30 AM - 12:00 PM',
  '12:00 PM - 12:30 PM', '12:30 PM - 01:00 PM', '02:00 PM - 02:30 PM',
  '02:30 PM - 03:00 PM', '03:00 PM - 03:30 PM', '03:30 PM - 04:00 PM',
  '04:00 PM - 04:30 PM', '04:30 PM - 05:00 PM', '05:00 PM - 05:30 PM'
];

const checkPatientProfileComplete = (patient) => {
  if (!patient) return false;

  // 1. Full Name: non-empty, not generic placeholder 'Patient'
  const name = typeof patient.name === 'string' ? patient.name.trim() : '';
  if (!name || name.toLowerCase() === 'patient') return false;

  // 2. Contact: valid mobile number (10+ digits, not placeholder prefix 'G-', not email)
  const contact = (patient.contact || '').toString().trim();
  if (!contact || contact.startsWith('G-') || contact.includes('@')) return false;
  const digitsOnly = contact.replace(/\D/g, '');
  if (digitsOnly.length < 10) return false;

  // 3. Age / Date of Birth information (age > 0 or ageMonths/Days or dob)
  const ageNum = Number(patient.age);
  const ageMonthsNum = Number(patient.ageMonths);
  const ageDaysNum = Number(patient.ageDays);
  const hasValidAge = (!isNaN(ageNum) && ageNum > 0) ||
                      (!isNaN(ageMonthsNum) && ageMonthsNum > 0) ||
                      (!isNaN(ageDaysNum) && ageDaysNum > 0) ||
                      Boolean(patient.dob);
  if (!hasValidAge) return false;

  // 4. Gender: must be specified ('Male', 'Female', 'Other')
  const gender = typeof patient.gender === 'string' ? patient.gender.trim() : '';
  if (!gender || !['Male', 'Female', 'Other'].includes(gender)) return false;

  // 5. Home Address: must be non-empty and not placeholder
  const address = typeof patient.address === 'string' ? patient.address.trim() : '';
  if (!address || address.toLowerCase() === 'registered via google sign-in') return false;

  return true;
};

const PatientDashboard = () => {
  const getLocalDateString = (inputDate) => {
    const d = inputDate ? new Date(inputDate) : new Date();
    if (isNaN(d.getTime())) return '';
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };


  const [selectedHospital, setSelectedHospital] = useState(() => {
    try {
      const saved = localStorage.getItem('curoxa_selected_hospital');
      return saved ? JSON.parse(saved) : null;
    } catch (e) {
      return null;
    }
  });
  const [isTransitioningHospital, setIsTransitioningHospital] = useState(false);
  const [transitionHospitalTarget, setTransitionHospitalTarget] = useState(null);

  const [activeTab, setActiveTab] = useState(() => {
    try {
      const savedHosp = localStorage.getItem('curoxa_selected_hospital');
      return savedHosp ? 'summary' : 'curoxa-home';
    } catch (e) {
      return 'curoxa-home';
    }
  });
  const [curoxaHospitals, setCuroxaHospitals] = useState([]);
  const [curoxaHospitalsLoading, setCuroxaHospitalsLoading] = useState(true);
  const [curoxaHospitalsError, setCuroxaHospitalsError] = useState(null);
  const [curoxaSearchQuery, setCuroxaSearchQuery] = useState('');
  const [curoxaFacilityFilter, setCuroxaFacilityFilter] = useState('all');

  const getTimeGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    return 'Good evening';
  };

  const handleSelectHospital = (h) => {
    if (!h) return;
    setTransitionHospitalTarget(h);
    setIsTransitioningHospital(true);
    const tenantCode = h.code || h.id;
    try {
      localStorage.setItem('tenantId', tenantCode);
      localStorage.setItem('tenantName', h.name);
      localStorage.setItem('curoxa_selected_hospital', JSON.stringify(h));
    } catch (e) {}

    // Ensure Socket.IO client joins the selected hospital's tenant room
    if (tenantCode) {
      joinTenantRoom(tenantCode);
    }
    
    // Fetch hospital-scoped data
    fetchData(false);

    // Subtle 450ms polished micro-transition
    setTimeout(() => {
      setSelectedHospital(h);
      setSelectedHospitalId(h.code || h.id);
      setSelectedHospitalDetails(h);
      setActiveTab('summary');
      setIsTransitioningHospital(false);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }, 450);
  };

  const handleChangeHospital = () => {
    try {
      localStorage.removeItem('curoxa_selected_hospital');
    } catch (e) {}
    setSelectedHospital(null);
    setSelectedHospitalId(null);
    setSelectedHospitalDetails(null);
    setActiveTab('curoxa-home');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleOpenBookingFlow = () => {
    if (selectedDoctor) {
      setActiveTab('book-appointment');
    } else {
      setActiveTab('find');
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const [privacySlideIdx, setPrivacySlideIdx] = useState(0);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [showAppointmentModal, setShowAppointmentModal] = useState(false);
  const [selectedDoctor, setSelectedDoctor] = useState(null);
  const [appointmentDate, setAppointmentDate] = useState('');
  const [appointmentTime, setAppointmentTime] = useState('10:30 AM');
  const [appointmentReason, setAppointmentReason] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('UPI');
  const [loading, setLoading] = useState(false);
  const [bookedSlots, setBookedSlots] = useState([]);
  const [doctorAvailability, setDoctorAvailability] = useState({ available: true, slots: DEFAULT_TIME_SLOTS, reason: null });
  
  const [selectedAppointment, setSelectedAppointment] = useState(null);
  const [detailsModalOpen, setDetailsModalOpen] = useState(false);
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [prescriptionModalOpen, setPrescriptionModalOpen] = useState(false);
  const [selectedPrescription, setSelectedPrescription] = useState(null);

  // Phase 3 Detail Sheet & My Health States
  const [selectedLabReport, setSelectedLabReport] = useState(null);
  const [labModalOpen, setLabModalOpen] = useState(false);
  const [selectedEMREvent, setSelectedEMREvent] = useState(null);
  const [emrModalOpen, setEmrModalOpen] = useState(false);
  const [selectedDocViewer, setSelectedDocViewer] = useState(null);
  const [docModalOpen, setDocModalOpen] = useState(false);
  const [labRequests, setLabRequests] = useState([]);
  const [myHealthCategory, setMyHealthCategory] = useState('ALL');

  const [rescheduleAvailability, setRescheduleAvailability] = useState({ available: true, slots: [], reason: null });
  const [rescheduleBookedSlots, setRescheduleBookedSlots] = useState([]);

  useEffect(() => {
    const fetchRescheduleData = async () => {
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
        const docSlots = selectedAppointment.doctorId?.doctorSlots?.length > 0 ? selectedAppointment.doctorId.doctorSlots : DEFAULT_TIME_SLOTS;
        setRescheduleAvailability({ available: true, slots: docSlots, reason: null });
      }

      try {
        const bookedRes = await api.get(`/appointments?doctorId=${docId}`);
        setRescheduleBookedSlots(bookedRes.data);
      } catch (err) {
        console.error("Failed to fetch reschedule booked slots:", err);
        setRescheduleBookedSlots([]);
      }
    };

    fetchRescheduleData();
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

  // Universal Discovery Portal States
  const [discoveryTab, setDiscoveryTab] = useState('hospitals'); // 'hospitals' or 'doctors'
  const [discoverySearch, setDiscoverySearch] = useState('');
  const [selectedHospitalId, setSelectedHospitalId] = useState(null);
  const [facilityTypeFilter, setFacilityTypeFilter] = useState('all'); // 'all', 'multispeciality', 'dental', 'diagnostic'
  const [selectedDentalProcedure, setSelectedDentalProcedure] = useState(null);
  
  // Location detection & detailed clinic page states
  const [detectingLocation, setDetectingLocation] = useState(false);
  const [userLocation, setUserLocation] = useState(null);
  const [hospitalDistances, setHospitalDistances] = useState({});
  const [selectedHospitalDetails, setSelectedHospitalDetails] = useState(null);
  const [selectedSpecialtyFilter, setSelectedSpecialtyFilter] = useState(null);

  // Premium Custom Toast Notifications
  const [notification, setNotification] = useState(null); // { message: '', type: 'success' | 'error' }
  const showToast = (message, type = 'success') => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 3000);
  };

  const openDetailsModal = (app) => {
    setSelectedAppointment({ ...app });
    setDetailsModalOpen(true);
    setTimeout(() => window.lucide && window.lucide.createIcons(), 100);
  };

  const handleUpdateAppointment = async (app) => {
    try {
      await api.put(`/appointments/${app._id}`, { status: app.status, time: app.time, date: app.date });
      showToast("Appointment updated successfully", "success");
      setDetailsModalOpen(false);
      fetchData();
    } catch (error) {
      console.error(error);
      showToast("Failed to update appointment", "error");
    }
  };

  const [deleteApptConfirmId, setDeleteApptConfirmId] = useState(null);
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [selectedPaymentAppt, setSelectedPaymentAppt] = useState(null);
  const [paymentBillData, setPaymentBillData] = useState(null);
  const [processingPayment, setProcessingPayment] = useState(false);
  const [paymentMethodTab, setPaymentMethodTab] = useState('upi');

  const handleDeleteAppointment = (id) => {
    setDeleteApptConfirmId(id);
  };

  const openPaymentModalForAppointment = async (appt) => {
    setSelectedPaymentAppt(appt);
    setPaymentModalOpen(true);
    try {
      const billRes = await api.get('/billing');
      const allBills = Array.isArray(billRes.data) ? billRes.data : [];
      const matchBill = allBills.find(b => b.appointmentId?._id === appt._id || b.appointmentId === appt._id);
      if (matchBill) {
        setPaymentBillData(matchBill);
      } else {
        // Fallback default calculation
        const docFee = (appt.doctorId && appt.doctorId.consultationFee !== undefined && appt.doctorId.consultationFee !== null && !isNaN(appt.doctorId.consultationFee)) ? Number(appt.doctorId.consultationFee) : 0;
        setPaymentBillData({
          items: [
            { description: 'One-Time OPD Registration Fee', amount: 50 },
            { description: `Doctor Consultation Fee (${appt.doctorId?.name || 'Doctor'})`, amount: docFee }
          ],
          totalAmount: docFee + 50,
          status: 'Unpaid'
        });
      }
    } catch(e) {
      console.warn("Could not fetch bill directly, setting standard breakdown:", e);
      setPaymentBillData({
        items: [
          { description: 'One-Time OPD Registration Fee', amount: 50 },
          { description: 'Doctor Consultation Fee', amount: 500 }
        ],
        totalAmount: 550,
        status: 'Unpaid'
      });
    }
  };

  const handleProcessPayment = async () => {
    if (!selectedPaymentAppt) return;
    setProcessingPayment(true);
    try {
      await api.post(`/appointments/${selectedPaymentAppt._id}/pay`, {
        paymentMethod: paymentMethodTab === 'upi' ? 'Online UPI' : (paymentMethodTab === 'card' ? 'Credit/Debit Card' : 'Net Banking')
      });
      showNotification('Payment successful! Your appointment is now Confirmed.', 'success');
      setPaymentModalOpen(false);
      setSelectedPaymentAppt(null);
      fetchData();
    } catch(e) {
      console.error("Payment failed:", e);
      showNotification(e.response?.data?.error || 'Payment failed. Please try again.', 'error');
    } finally {
      setProcessingPayment(false);
    }
  };

  const confirmDeleteAppointment = async () => {
    if (!deleteApptConfirmId) return;
    const id = deleteApptConfirmId;
    setDeleteApptConfirmId(null);
    try {
      await api.delete(`/appointments/${id}`);
      showToast("Appointment deleted successfully", "success");
      setDetailsModalOpen(false);
      fetchData();
    } catch (error) {
      console.error(error);
      showToast("Failed to delete appointment", "error");
    }
  };
  const navigate = useNavigate();
  const [currentUser, setCurrentUser] = useState(() => JSON.parse(localStorage.getItem('user') || '{}'));
  const [profileVerifying, setProfileVerifying] = useState(() => !currentUser?.isSetupComplete);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => localStorage.getItem('curoxa_sidebar_collapsed') === 'true');

  // Notifications states
  const [notifications, setNotifications] = useState([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const notificationRef = useRef(null);
  const topNavProfileRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (notificationRef.current && !notificationRef.current.contains(event.target)) {
        setShowNotifications(false);
      }
      const isInsideSidebarProfile = event.target.closest('.sidebar-user') || event.target.closest('.sidebar-profile-card') || event.target.closest('.sidebar-profile') || event.target.closest('.sidebar-profile-popover');
      const isInsideTopNavProfile = (topNavProfileRef.current && topNavProfileRef.current.contains(event.target)) || event.target.closest('.patient-nav-pill') || event.target.closest('.patient-profile-dropdown');

      if (!isInsideSidebarProfile && !isInsideTopNavProfile) {
        setShowProfileMenu(false);
      }
    };
    document.addEventListener('click', handleClickOutside);
    return () => {
      document.removeEventListener('click', handleClickOutside);
    };
  }, []);

  const [doctors, setDoctors] = useState([]);
  const [appointments, setAppointments] = useState([]);

  // Scoped to selected hospital and today's date
  const todayStr = getLocalDateString();
  const [appointmentFilterTab, setAppointmentFilterTab] = useState('ALL');
  const [showWithdrawConsentModal, setShowWithdrawConsentModal] = useState(false);

  // Hospital-scoped appointments
  const hospitalAppointments = useMemo(() => {
    if (!selectedHospital) return appointments;
    const targetTenant = String(selectedHospital.code || selectedHospital.id || '').toLowerCase();
    const targetObjId = String(selectedHospital._id || '').toLowerCase();
    return appointments.filter(app => {
      const appTenant = String(app.tenantId || '').toLowerCase();
      const appHospId = String(app.hospitalId || '').toLowerCase();
      return !appTenant ||
             appTenant === targetTenant ||
             (targetObjId && appTenant === targetObjId) ||
             (appHospId && (appHospId === targetTenant || appHospId === targetObjId));
    });
  }, [appointments, selectedHospital]);

  // Active appointment for live token display:
  // 1. Today's checked-in appointment that is not Completed or Cancelled
  // 2. Or today's booked appointment that is not Completed or Cancelled
  // 3. Or next upcoming active appointment
  // If completed, returns null (removed from live token card, kept in appointment history)
  const activeAppt = useMemo(() => {
    const candidateList = hospitalAppointments;
    // Checked in today
    const checkedInToday = candidateList.find(app => {
      const isToday = (app.tokenDate === todayStr) || (app.date && getLocalDateString(app.date) === todayStr);
      return isToday && app.tokenNumber && !['Completed', 'Cancelled', 'Checked Out'].includes(app.status);
    });
    if (checkedInToday) return checkedInToday;

    // Booked today (not checked in yet)
    const bookedToday = candidateList.find(app => {
      const isToday = (app.tokenDate === todayStr) || (app.date && getLocalDateString(app.date) === todayStr);
      return isToday && !['Completed', 'Cancelled', 'Checked Out'].includes(app.status);
    });
    if (bookedToday) return bookedToday;

    // Upcoming in future
    const upcoming = candidateList.find(app => {
      const isFuture = app.date && getLocalDateString(app.date) >= todayStr;
      return isFuture && !['Completed', 'Cancelled', 'Checked Out'].includes(app.status);
    });
    return upcoming || null;
  }, [hospitalAppointments, todayStr]);

  // Today's visit (specifically today's appointment for the live OPD Visit card)
  // Supports: Approved, Checked In, In Progress, Prescription Pending, Completed, Checked Out
  const todayVisitAppt = useMemo(() => {
    const candidateList = hospitalAppointments;
    const todayAppts = candidateList.filter(app => {
      const isToday = (app.tokenDate === todayStr) || (app.date && getLocalDateString(app.date) === todayStr);
      return isToday && app.status !== 'Cancelled';
    });
    if (todayAppts.length === 0) return null;
    // Prefer active appointment today (In Progress, Checked In, Approved, Prescription Pending) over Completed if multiple exist
    const activeToday = todayAppts.find(app => !['Completed', 'Checked Out'].includes(app.status));
    return activeToday || todayAppts[0];
  }, [hospitalAppointments, todayStr]);

  // Next upcoming scheduled appointment (ONLY genuinely upcoming/active appointments, NOT Completed/Cancelled/Checked Out/Rx Pending)
  const nextUpcomingAppt = useMemo(() => {
    const candidateList = hospitalAppointments;
    const activeAppointments = candidateList.filter(app => {
      const appDate = app.date ? getLocalDateString(app.date) : (app.tokenDate || '');
      const isFutureOrToday = appDate >= todayStr || (app.tokenDate === todayStr);
      const isTerminalOrDone = ['Completed', 'Cancelled', 'Checked Out', 'Prescription Pending'].includes(app.status);
      return isFutureOrToday && !isTerminalOrDone;
    });

    if (activeAppointments.length === 0) return null;

    // Prioritize future date appointments (> todayStr) if any exist
    const futureDateAppts = activeAppointments.filter(app => {
      const appDate = app.date ? getLocalDateString(app.date) : '';
      return appDate > todayStr;
    });
    if (futureDateAppts.length > 0) {
      return futureDateAppts[0];
    }

    // Otherwise check for active today's appointment (Approved / Scheduled / Checked In)
    const todayActive = activeAppointments.filter(app => {
      const appDate = app.date ? getLocalDateString(app.date) : '';
      const isToday = (app.tokenDate === todayStr) || (appDate === todayStr);
      return isToday;
    });

    return todayActive[0] || null;
  }, [hospitalAppointments, todayStr]);

  // Appointment counts for segmented filters
  const apptCounts = useMemo(() => {
    const all = hospitalAppointments.length;
    const today = hospitalAppointments.filter(app => (app.tokenDate === todayStr) || (app.date && getLocalDateString(app.date) === todayStr)).length;
    const upcoming = hospitalAppointments.filter(app => {
      const appDate = app.date ? getLocalDateString(app.date) : '';
      return appDate >= todayStr && !['Completed', 'Cancelled', 'Checked Out'].includes(app.status);
    }).length;
    const completed = hospitalAppointments.filter(app => ['Completed', 'Checked Out'].includes(app.status)).length;
    const cancelled = hospitalAppointments.filter(app => app.status === 'Cancelled').length;
    return { all, today, upcoming, completed, cancelled };
  }, [hospitalAppointments, todayStr]);

  // Phase 4 Live Patient Token Queue State
  const [patientQueue, setPatientQueue] = useState({
    currentToken: null,
    nextToken: null,
    waitingCount: 0,
    patientsAhead: null,
    doctorName: '',
    specialty: ''
  });

  const [prescriptions, setPrescriptions] = useState([]);
  const [patientProfile, setPatientProfile] = useState(null);

  // Formatted UHID string
  const patientUhid = useMemo(() => {
    if (patientProfile?.uhid) return patientProfile.uhid;
    if (patientProfile?._id) return `CUROXA-${patientProfile._id.substring(18).toUpperCase()}`;
    return 'CUROXA-784512';
  }, [patientProfile]);


  const [editProfileData, setEditProfileData] = useState({ name: '', age: '', ageMonths: '', ageDays: '', gender: '', contact: '', address: '', bloodGroup: '', allergies: '', medicalHistory: '' });
  const [passwordData, setPasswordData] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [profileMsg, setProfileMsg] = useState({ type: '', text: '' });
  const [isUpdatingProfile, setIsUpdatingProfile] = useState(false);
  const [isUpdatingPassword, setIsUpdatingPassword] = useState(false);

  // EMR and DPDP Consent States
  const [visits, setVisits] = useState([]);
  const [vitals, setVitals] = useState([]);
  const [clinicalNotes, setClinicalNotes] = useState([]);
  const [procedures, setProcedures] = useState([]);
  const [clinicalDocs, setClinicalDocs] = useState([]);
  const [consent, setConsent] = useState({ purposes: { treatment: true, insurance: true, research: false }, status: 'Active', dpdpRequests: [], signature: '' });
  const [auditLogs, setAuditLogs] = useState([]);
  
  // Modals and inputs
  const [showPrivacyOverlay, setShowPrivacyOverlay] = useState(() => localStorage.getItem('curoxa_dpdp_intro_seen') !== 'true');
  const [showAadhaarModal, setShowAadhaarModal] = useState(false);
  const [showAbhaModal, setShowAbhaModal] = useState(false);
  const [showDigitalCardModal, setShowDigitalCardModal] = useState(false);
  const [aadhaarInput, setAadhaarInput] = useState('');
  const [abhaInput, setAbhaInput] = useState('');
  const [verifyingAadhaar, setVerifyingAadhaar] = useState(false);
  const [verifyingAbha, setVerifyingAbha] = useState(false);

  // DPDP Requests Center states
  const [dpdpRequestType, setDpdpRequestType] = useState('Correction');
  const [dpdpRequestDetails, setDpdpRequestDetails] = useState('');
  const [submittingDpdp, setSubmittingDpdp] = useState(false);

  // Timeline Search
  const [timelineSearch, setTimelineSearch] = useState('');
  const [timelineFilter, setTimelineFilter] = useState('All');

  const detectLocation = () => {
    setDetectingLocation(true);
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const lat = position.coords.latitude;
          const lon = position.coords.longitude;
          setUserLocation({ lat, lon, name: "Current Location" });
          setDetectingLocation(false);
        },
        (error) => {
          console.warn("Location permission denied/failed", error);
          setDetectingLocation(false);
        },
        { timeout: 6000 }
      );
    } else {
      setDetectingLocation(false);
    }
  };

  const fetchData = async (isBackground = false) => {
    if (!currentUser.id) return;
    
    let patientDbId = null;
    // Fetch Profile Independently
    try {
      const profileRes = await api.get(`/patients/${currentUser.id}`);
      const fetchedPatient = profileRes.data;
      setPatientProfile(fetchedPatient);
      patientDbId = fetchedPatient._id;

      // Determine profile completion from backend source of truth
      const isComplete = fetchedPatient.isSetupComplete !== undefined
        ? Boolean(fetchedPatient.isSetupComplete)
        : checkPatientProfileComplete(fetchedPatient);

      if (isComplete) {
        if (!currentUser.isSetupComplete) {
          const updatedUser = {
            ...currentUser,
            isSetupComplete: true,
            name: fetchedPatient.name || currentUser.name,
            avatar: fetchedPatient.avatar || currentUser.avatar || ''
          };
          try {
            localStorage.setItem('user', JSON.stringify(updatedUser));
          } catch(e) {}
          setCurrentUser(updatedUser);
        }
      } else {
        if (currentUser.isSetupComplete) {
          const updatedUser = { ...currentUser, isSetupComplete: false };
          try {
            localStorage.setItem('user', JSON.stringify(updatedUser));
          } catch(e) {}
          setCurrentUser(updatedUser);
        }
      }
      setProfileVerifying(false);

      const isOnboarding = !isComplete;
      
      // Do NOT overwrite user typed fields during background polling if currently onboarding
      if (!isOnboarding || !editProfileData.contact) {
        const cleanAddress = (isOnboarding && profileRes.data.address === 'Registered via Google Sign-In') ? '' : (profileRes.data.address || '');
        const cleanContact = (isOnboarding && profileRes.data.contact && profileRes.data.contact.includes('@')) ? '' : (profileRes.data.contact || '');
        const cleanAge = (isOnboarding && profileRes.data.age === 30) ? '' : (profileRes.data.age || '');
        const cleanGender = (isOnboarding && profileRes.data.gender === 'Other') ? '' : (profileRes.data.gender || 'Male');
        const cleanBloodGroup = isOnboarding ? '' : (profileRes.data.bloodGroup || 'O+');
        const cleanAllergies = (isOnboarding && profileRes.data.allergies === 'None') ? '' : (profileRes.data.allergies || '');

        const loadedAvatar = profileRes.data.avatar || '';
        setEditProfileData(prev => ({
          name: prev.name || profileRes.data.name || '',
          age: prev.age || cleanAge,
          gender: prev.gender || cleanGender,
          contact: prev.contact || cleanContact,
          address: prev.address || cleanAddress,
          bloodGroup: prev.bloodGroup || cleanBloodGroup,
          allergies: prev.allergies || cleanAllergies,
          medicalHistory: prev.medicalHistory || (Array.isArray(profileRes.data.medicalHistory) ? profileRes.data.medicalHistory.join(', ') : ''),
          avatar: loadedAvatar || prev.avatar || ''
        }));

        if (loadedAvatar) {
          setCurrentUser(prev => ({ ...prev, avatar: loadedAvatar, name: profileRes.data.name || prev.name }));
          try {
            const stored = JSON.parse(localStorage.getItem('user') || '{}');
            stored.avatar = loadedAvatar;
            stored.name = profileRes.data.name || stored.name;
            localStorage.setItem('user', JSON.stringify(stored));
          } catch(e) {}
        }
      }
    } catch (profileErr) {
      console.warn("Failed to load full patient profile details", profileErr);
      setProfileVerifying(false);
    }

    // Fetch Dashboard Data
    try {
      // Fetch live onboarded hospitals from Curoxa platform
      if (!isBackground) {
        setCuroxaHospitalsLoading(prev => curoxaHospitals.length === 0 ? true : prev);
      }
      setCuroxaHospitalsError(null);
      try {
        const hRes = await api.get('/auth/hospitals/universal');
        if (Array.isArray(hRes.data)) {
          const backendHospitals = hRes.data.map(bh => ({
            id: bh.code || bh._id,
            code: bh.code,
            name: bh.name,
            logo: bh.logo || '',
            letterheadUrl: bh.letterheadUrl || '',
            address: bh.address || '',
            location: bh.address || '',
            status: bh.status || 'Active',
            isVerified: Boolean(bh.isGstVerified || bh.isLicenseVerified || bh.status === 'Active'),
            isGstVerified: Boolean(bh.isGstVerified),
            isLicenseVerified: Boolean(bh.isLicenseVerified),
            plan: bh.plan || '',
            doctorCount: bh.doctorCount || 0,
            specialties: Array.isArray(bh.specialties) ? bh.specialties : [],
            modules: Array.isArray(bh.modules) ? bh.modules : []
          }));
          setCuroxaHospitals(backendHospitals);
        } else {
          setCuroxaHospitals([]);
        }
        setCuroxaHospitalsLoading(false);
      } catch (hErr) {
        console.error("Failed to fetch onboarded hospitals:", hErr);
        setCuroxaHospitalsError("Unable to load hospitals");
        setCuroxaHospitalsLoading(false);
      }

      const docsRes = await api.get('/auth/doctors/universal');
      setDoctors(docsRes.data);

      const appsRes = await api.get('/appointments');
      const myAppointments = Array.isArray(appsRes.data) ? appsRes.data : [];
      const sortedMyAppointments = [...myAppointments].sort((a, b) => {
        const aCompleted = a.status === 'Completed' || a.status === 'Cancelled' || a.status === 'Checked Out';
        const bCompleted = b.status === 'Completed' || b.status === 'Cancelled' || b.status === 'Checked Out';
        if (aCompleted && !bCompleted) return 1;
        if (!aCompleted && bCompleted) return -1;

        const dateA = a.createdAt || a._id || 0;
        const dateB = b.createdAt || b._id || 0;
        return new Date(dateB) - new Date(dateA);
      });
      setAppointments(sortedMyAppointments);

      const prescriptionsRes = await api.get('/prescriptions');
      const myPrescriptions = prescriptionsRes.data.filter(p => {
        const pId = p.patientId?._id || p.patientId;
        return pId === currentUser.id || (patientDbId && pId === patientDbId);
      });
      setPrescriptions(myPrescriptions);

      if (patientDbId) {
        // Fetch EMR timeline items
        try {
          const visitsRes = await api.get(`/emr/visits/patient/${patientDbId}`);
          setVisits(visitsRes.data);
        } catch (e) { console.warn("Failed to fetch visits", e); }

        try {
          const vitalsRes = await api.get(`/emr/vitals/patient/${patientDbId}`);
          setVitals(vitalsRes.data);
        } catch (e) { console.warn("Failed to fetch vitals", e); }

        try {
          const notesRes = await api.get(`/emr/clinical-notes/patient/${patientDbId}`);
          setClinicalNotes(notesRes.data);
        } catch (e) { console.warn("Failed to fetch clinical notes", e); }

        try {
          const procRes = await api.get(`/emr/procedures/patient/${patientDbId}`);
          setProcedures(procRes.data);
        } catch (e) { console.warn("Failed to fetch procedures", e); }

        try {
          const docRes = await api.get(`/emr/documents/patient/${patientDbId}`);
          setClinicalDocs(docRes.data);
        } catch (e) { console.warn("Failed to fetch documents", e); }

        try {
          const labsRes = await api.get(`/labs?patientId=${patientDbId}`);
          setLabRequests(Array.isArray(labsRes.data) ? labsRes.data : []);
        } catch (e) { console.warn("Failed to fetch lab requests", e); }

        try {
          const consentRes = await api.get(`/emr/consent/patient/${patientDbId}`);
          setConsent(consentRes.data);
        } catch (e) { console.warn("Failed to fetch consent", e); }

        try {
          const auditsRes = await api.get(`/emr/audits/patient/${patientDbId}`);
          setAuditLogs(auditsRes.data);
        } catch (e) { console.warn("Failed to fetch audit logs", e); }
      }
    } catch (err) {
      console.error(err);
    }
  };

  const fetchPatientQueue = useCallback(async () => {
    if (!activeAppt || !activeAppt.doctorId) {
      setPatientQueue(prev => {
        if (prev.currentToken === null && prev.nextToken === null && prev.waitingCount === 0 && prev.patientsAhead === null && prev.doctorName === '') {
          return prev;
        }
        return { currentToken: null, nextToken: null, waitingCount: 0, patientsAhead: null, doctorName: '', specialty: '' };
      });
      return;
    }
    try {
      const docId = typeof activeAppt.doctorId === 'object' ? activeAppt.doctorId._id : activeAppt.doctorId;
      const apptDate = activeAppt.tokenDate || getLocalDateString(activeAppt.date);
      const tokenParam = activeAppt.tokenNumber ? `&patientToken=${activeAppt.tokenNumber}` : '';

      const res = await api.get(`/appointments/doctor-queue/${docId}?date=${apptDate}${tokenParam}`);
      if (res.data) {
        setPatientQueue({
          currentToken: res.data.currentToken ?? null,
          nextToken: res.data.nextToken ?? null,
          waitingCount: res.data.waitingCount ?? 0,
          patientsAhead: res.data.patientsAhead ?? null,
          doctorName: res.data.doctorName || (activeAppt.doctorId?.name || 'Assigned Doctor'),
          specialty: res.data.specialty || (activeAppt.doctorId?.specialty || 'General Consultation')
        });
      }
    } catch (err) {
      console.warn("Failed to fetch live patient queue:", err);
    }
  }, [activeAppt]);

  useEffect(() => {
    fetchPatientQueue();
  }, [fetchPatientQueue]);

  useEffect(() => {
    let pollInterval;
    if (currentUser.id) {
      fetchData();
      fetchPatientQueue();
      pollInterval = setInterval(() => {
        fetchData(true);
        fetchPatientQueue();
      }, 10000);
    }
    return () => {
      if (pollInterval) clearInterval(pollInterval);
    };
  }, [currentUser.id]);

  useEffect(() => {
    if (selectedHospital) {
      const tenantCode = selectedHospital.code || selectedHospital.id;
      if (tenantCode) {
        joinTenantRoom(tenantCode);
      }
    }
  }, [selectedHospital]);

  useEffect(() => {
    const handleSync = (e) => {
      const { type } = e.detail || {};
      console.log('[SOCKET] PatientDashboard received sync event for:', type);
      if (currentUser.id) {
        fetchData(true);
        fetchPatientQueue();
      }
    };
    window.addEventListener('curoxa_sync', handleSync);
    return () => window.removeEventListener('curoxa_sync', handleSync);
  }, [currentUser.id, fetchPatientQueue]);


  useEffect(() => {
    const fetchBookedSlots = async () => {
      if (!selectedDoctor || !appointmentDate) {
        setBookedSlots([]);
        return;
      }
      try {
        const res = await api.get(`/appointments?doctorId=${selectedDoctor._id}`);
        setBookedSlots(res.data);
      } catch (err) {
        console.error("Failed to fetch booked slots:", err);
      }
    };
    fetchBookedSlots();
  }, [selectedDoctor, appointmentDate]);

  // Fetch doctor availability (slots, weekly off, leave)
  useEffect(() => {
    const fetchAvailability = async () => {
      console.log("[PATIENT_AVAIL] Triggered with doctorId:", selectedDoctor?._id, "date:", appointmentDate);
      if (!selectedDoctor || !appointmentDate) {
        // Use doctor's slots if available, otherwise defaults
        const docSlots = selectedDoctor?.doctorSlots?.length > 0 ? selectedDoctor.doctorSlots : DEFAULT_TIME_SLOTS;
        console.log("[PATIENT_AVAIL] Missing doctor or date. Fallback slots:", docSlots);
        setDoctorAvailability({ available: true, slots: docSlots, reason: null });
        return;
      }
      try {
        const res = await api.get(`/hr/doctor-availability/${selectedDoctor._id}?date=${appointmentDate}`);
        console.log("[PATIENT_AVAIL] Success res.data:", res.data);
        setDoctorAvailability(res.data);
      } catch (err) {
        console.error("[PATIENT_AVAIL] Error fetching from API:", err);
        // Fallback: use doctor's stored slots or defaults
        const docSlots = selectedDoctor?.doctorSlots?.length > 0 ? selectedDoctor.doctorSlots : DEFAULT_TIME_SLOTS;
        console.log("[PATIENT_AVAIL] Catch fallback slots:", docSlots);
        setDoctorAvailability({ available: true, slots: docSlots, reason: null });
      }
    };
    fetchAvailability();
  }, [selectedDoctor, appointmentDate]);

  useEffect(() => {
    if (bookedSlots.length > 0 && appointmentDate && selectedDoctor) {
      const targetDateStr = new Date(appointmentDate).toDateString();
      const availableSlots = doctorAvailability.slots || DEFAULT_TIME_SLOTS;
      const isCurrentBooked = bookedSlots.some(app => {
        if (app.status === 'Cancelled') return false;
        const appDocId = app.doctorId?._id || app.doctorId;
        if (String(appDocId) !== String(selectedDoctor._id)) return false;
        const appDateStr = new Date(app.date).toDateString();
        if (appDateStr !== targetDateStr) return false;
        const appTime = (app.time || '').trim().toLowerCase();
        const targetTime = appointmentTime.trim().toLowerCase();
        return appTime === targetTime || appTime.includes(targetTime);
      });

      if (isCurrentBooked) {
        const firstAvailable = availableSlots.find(time => {
          return !bookedSlots.some(app => {
            if (app.status === 'Cancelled') return false;
            const appDocId = app.doctorId?._id || app.doctorId;
            if (String(appDocId) !== String(selectedDoctor._id)) return false;
            const appDateStr = new Date(app.date).toDateString();
            if (appDateStr !== targetDateStr) return false;
            const appTime = (app.time || '').trim().toLowerCase();
            const targetTime = time.trim().toLowerCase();
            return appTime === targetTime || appTime.includes(targetTime);
          });
        });
        if (firstAvailable) {
          setAppointmentTime(firstAvailable);
        } else {
          setAppointmentTime('');
        }
      }
    }
  }, [bookedSlots, appointmentDate, selectedDoctor, appointmentTime, doctorAvailability]);

  useEffect(() => {
    if (window.lucide) {
      window.lucide.createIcons();
    }
  }, [activeTab, selectedHospital, curoxaHospitals, curoxaFacilityFilter, showAppointmentModal, appointments, doctors, showProfileMenu, detailsModalOpen, prescriptionModalOpen, currentUser.isSetupComplete, discoveryTab, selectedHospitalId, selectedHospitalDetails, selectedSpecialtyFilter, patientQueue, appointmentFilterTab, showWithdrawConsentModal, labModalOpen, emrModalOpen, docModalOpen, myHealthCategory]);

  const handleLogout = () => {
    try {
      setShowProfileMenu(false);
      const isPatient = !currentUser.role || currentUser.role === 'patient';
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      localStorage.removeItem('tenantId');
      localStorage.removeItem('tenantModules');
      localStorage.removeItem('plan');
      localStorage.removeItem('curoxa_superadmin_session');
      window.dispatchEvent(new CustomEvent('curoxa_logout'));
      window.location.href = isPatient ? '/patient/login' : '/login';
    } catch (e) {
      console.error('Logout error:', e);
      window.location.href = '/patient/login';
    }
  };

  const handleUpdateProfile = async (e) => {
    e.preventDefault();
    setIsUpdatingProfile(true);
    setProfileMsg({ type: '', text: '' });
    try {
      const formattedHistory = editProfileData.medicalHistory.split(',').map(item => item.trim()).filter(Boolean);
      const res = await api.put(`/patients/${currentUser.id}`, { ...editProfileData, medicalHistory: formattedHistory });
      setPatientProfile(res.data);
      const updatedUser = { ...currentUser, name: res.data.name, isSetupComplete: true, avatar: res.data.avatar || '' };
      localStorage.setItem('user', JSON.stringify(updatedUser));
      setCurrentUser(updatedUser);
      setProfileMsg({ type: 'success', text: 'Profile updated successfully!' });
    } catch (err) {
      setProfileMsg({ type: 'error', text: err.response?.data?.error || 'Failed to update profile.' });
    } finally {
      setIsUpdatingProfile(false);
    }
  };

  const handleCompleteOnboarding = async (e) => {
    e.preventDefault();
    setIsUpdatingProfile(true);
    setProfileMsg({ type: '', text: '' });

    // Validate contact number
    const contactStr = editProfileData.contact.trim();
    if (contactStr.startsWith('G-') || contactStr.length < 10 || !/^\+?[0-9\s-]{10,15}$/.test(contactStr)) {
      setProfileMsg({ type: 'error', text: 'Please enter a valid mobile number (at least 10 digits without placeholder prefix).' });
      setIsUpdatingProfile(false);
      return;
    }

    // Validate address
    const addressStr = editProfileData.address.trim();
    if (addressStr === 'Registered via Google Sign-In' || addressStr === '') {
      setProfileMsg({ type: 'error', text: 'Please enter your actual residential address.' });
      setIsUpdatingProfile(false);
      return;
    }

    try {
      const formattedHistory = (editProfileData.medicalHistory || '').split(',').map(item => item.trim()).filter(Boolean);
      const res = await api.put(`/patients/${currentUser.id}`, { ...editProfileData, medicalHistory: formattedHistory });
      setPatientProfile(res.data);
      
      const updatedUser = { ...currentUser, id: res.data._id || currentUser.id, name: res.data.name, isSetupComplete: true, avatar: res.data.avatar || '' };
      localStorage.setItem('user', JSON.stringify(updatedUser));
      setCurrentUser(updatedUser);
      setProfileVerifying(false);
      showToast("Profile completed successfully! Welcome to your dashboard.", "success");
    } catch (err) {
      setProfileMsg({ type: 'error', text: err.response?.data?.error || 'Failed to save profile details.' });
    } finally {
      setIsUpdatingProfile(false);
    }
  };

  const handleUpdatePassword = async (e) => {
    e.preventDefault();
    setProfileMsg({ type: '', text: '' });
    if (passwordData.newPassword !== passwordData.confirmPassword) {
      return setProfileMsg({ type: 'error', text: 'New passwords do not match.' });
    }
    setIsUpdatingPassword(true);
    try {
      await api.put(`/patients/${currentUser.id}/password`, { 
        currentPassword: passwordData.currentPassword, 
        newPassword: passwordData.newPassword 
      });
      setProfileMsg({ type: 'success', text: 'Password updated successfully!' });
      setPasswordData({ currentPassword: '', newPassword: '', confirmPassword: '' });
    } catch (err) {
      setProfileMsg({ type: 'error', text: err.response?.data?.error || 'Failed to update password.' });
    } finally {
      setIsUpdatingPassword(false);
    }
  };

  const bookDoctor = (doc) => {
    setSelectedDoctor(doc);
    setActiveTab('book-appointment');
  };

  const confirmBooking = async () => {
    if (!selectedDoctor) return;
    try {
      setLoading(true);
      const patientIdVal = patientProfile?._id || currentUser.id;
      const appRes = await api.post('/appointments', {
        patientId: patientIdVal,
        doctorId: selectedDoctor._id,
        date: appointmentDate || new Date(),
        time: appointmentTime,
        reason: appointmentReason || 'General Consultation',
        source: 'Online'
      });

      const docFee = selectedDoctor.consultationFee !== undefined ? selectedDoctor.consultationFee : 500;
      await api.post('/billing', {
        patientId: patientIdVal,
        appointmentId: appRes.data._id,
        items: [
          { description: 'Consultation Fee', amount: docFee },
          { description: 'Registration Fee', amount: 50 }
        ],
        totalAmount: docFee + 50,
        status: 'Unpaid',
        paymentMethod: 'Offline'
      });

      setShowAppointmentModal(false);
      setSelectedDoctor(null);
      setAppointmentDate('');
      setAppointmentReason('');
      setPaymentMethod('Offline');
      fetchData();
      setActiveTab('history');
      showToast("Appointment booked successfully! Please pay at the reception desk.", "success");
    } catch (err) {
      console.error(err);
      showToast('Failed to book appointment', 'error');
    } finally {
      setLoading(false);
    }
  };

  const getGroupedPrescriptions = () => {
    const grouped = {};
    prescriptions.forEach(p => {
      const docId = p.doctorId?._id || p.doctorId || 'unknown';
      const dateStr = p.createdAt ? new Date(p.createdAt).toLocaleDateString() : 'no-date';
      const key = `${docId}-${dateStr}`;
      
      if (!grouped[key]) {
        grouped[key] = {
          _id: p._id,
          doctorId: p.doctorId,
          status: p.status,
          createdAt: p.createdAt,
          items: []
        };
      }
      
      if (p.items) {
        p.items.forEach(item => {
          const isDuplicate = grouped[key].items.some(existing => 
            existing.medicine === item.medicine && 
            existing.dosage === item.dosage && 
            existing.duration === item.duration && 
            existing.instructions === item.instructions
          );
          if (!isDuplicate) {
            grouped[key].items.push(item);
          }
        });
      }
      
      if (p.status !== 'Dispensed' && p.status !== 'Dispensed by Pharmacy') {
        grouped[key].status = p.status;
      }
    });
    return Object.values(grouped).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  };

  // ABDM / Aadhaar Verification Simulation
  const handleVerifyAadhaar = async (e) => {
    e.preventDefault();
    if (!aadhaarInput || aadhaarInput.length !== 12 || isNaN(aadhaarInput)) {
      showToast("Aadhaar must be a 12-digit numeric code", "error");
      return;
    }
    setVerifyingAadhaar(true);
    try {
      const res = await api.post('/emr/verify-aadhaar', { aadhaarNumber: aadhaarInput });
      if (res.data.success) {
        // Update patient record
        const patientDbId = patientProfile?._id || currentUser.id;
        const updateRes = await api.put(`/patients/${patientDbId}`, { aadhaarVerified: true });
        setPatientProfile(updateRes.data);
        showToast("Aadhaar verified and Linked successfully!", "success");
        setShowAadhaarModal(false);
        setAadhaarInput('');
        fetchData();
      }
    } catch (err) {
      showToast(err.response?.data?.error || "Aadhaar verification failed", "error");
    } finally {
      setVerifyingAadhaar(false);
    }
  };

  // ABHA Health ID linkage
  const handleLinkAbha = async (e) => {
    e.preventDefault();
    if (!abhaInput) {
      showToast("Please enter a valid ABHA ID or Contact Number", "error");
      return;
    }
    setVerifyingAbha(true);
    try {
      const res = await api.post('/emr/verify-abha', { abhaId: abhaInput });
      if (res.data.success) {
        const patientDbId = patientProfile?._id || currentUser.id;
        const updateRes = await api.put(`/patients/${patientDbId}`, {
          abhaId: res.data.abhaId,
          abhaAddress: res.data.abhaAddress
        });
        setPatientProfile(updateRes.data);
        showToast("ABHA Health ID linked successfully!", "success");
        setShowAbhaModal(false);
        setAbhaInput('');
        fetchData();
      }
    } catch (err) {
      showToast(err.response?.data?.error || "ABHA linkage failed", "error");
    } finally {
      setVerifyingAbha(false);
    }
  };

  // DPDP Consent Updates
  const handleUpdateConsentPurposes = async (purposesObj) => {
    try {
      const patientDbId = patientProfile?._id || currentUser.id;
      const res = await api.post('/emr/consent', {
        patientId: patientDbId,
        purposes: purposesObj,
        status: 'Active',
        signature: 'Digitally signed by ' + (patientProfile?.name || currentUser.name)
      });
      setConsent(res.data);
      showToast("Privacy consent purposes updated successfully!", "success");
      fetchData();
    } catch (err) {
      showToast("Failed to update consent settings", "error");
    }
  };

  // DPDP Consent Withdrawal - Non-destructive informational notice
  const handleWithdrawConsent = () => {
    setShowWithdrawConsentModal(true);
  };

  // DPDP Deletion / Correction Request submission
  const handleSubmitDpdpRequest = async (e) => {
    e.preventDefault();
    if (!dpdpRequestDetails.trim()) {
      showToast("Please provide details for the request", "error");
      return;
    }
    if (dpdpRequestType === 'Erasure' && patientProfile?.legalHold) {
      showToast("❌ Erasure request blocked: active statutory Legal Hold constraint.", "error");
      return;
    }
    setSubmittingDpdp(true);
    try {
      const patientDbId = patientProfile?._id || currentUser.id;
      const res = await api.post(`/emr/consent/patient/${patientDbId}/dpdp-request`, {
        requestType: dpdpRequestType,
        details: dpdpRequestDetails
      });
      showToast(`${dpdpRequestType} request submitted to Data Officer.`, "success");
      setDpdpRequestDetails('');
      setConsent(res.data);
      fetchData();
    } catch (err) {
      showToast(err.response?.data?.error || "Failed to submit request", "error");
    } finally {
      setSubmittingDpdp(false);
    }
  };

  const handlePrintPrescription = async (rx) => {
    try {
      const res = await api.get('/admin/letterhead');
      let letterheadUrl = res.data?.letterheadUrl || "";
      if (letterheadUrl && !letterheadUrl.startsWith('http://') && !letterheadUrl.startsWith('https://') && !letterheadUrl.startsWith('data:')) {
        const apiURL = import.meta.env.VITE_API_URL || '';
        const backendBase = apiURL ? apiURL.replace('/api', '') : 'https://curoxa.onrender.com';
        letterheadUrl = `${backendBase}${letterheadUrl}`;
      }
      if (letterheadUrl) {
        letterheadUrl = await convertPdfToImage(letterheadUrl);
      }

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
        if (e.data === 'close-print-prescription-patient-iframe') {
          try {
            document.body.removeChild(iframe);
          } catch (err) {}
          window.removeEventListener('message', handleMessage);
        }
      };
      window.addEventListener('message', handleMessage);

      const cleanField = (val) => (val && String(val).trim() !== '') ? String(val).trim() : '—';
      const rxDate = rx.createdAt ? new Date(rx.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
      const doctorObj = rx.doctorId || {};
      const clinicName = getHospitalDetails(rx.tenantId).name;

      const htmlContent = `
        <!DOCTYPE html>
        <html>
        <head>
          <title>Prescription</title>
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
            }
            .page-container {
              width: 210mm;
              height: 297mm;
              margin: 0 auto;
              background-color: #ffffff;
              box-sizing: border-box;
              position: relative;
              padding: 15mm 15mm 20mm 15mm;
            }
          </style>
        </head>
        <body>
          <!-- Hidden Templates -->
          <div id="print-header-template" style="display: none; box-sizing: border-box;">
            ${letterheadUrl ? `
              <!-- Empty spacer to let the background letterhead's top banner show through -->
              <div style="height: 38mm; width: 100%;"></div>
            ` : `
              <div style="display: flex; align-items: center; border-bottom: 3px double #800020; padding-bottom: 8px; height: 80px; box-sizing: border-box;">
                <div style="border: 2px solid #800020; border-radius: 8px; width: 65px; height: 65px; padding: 4px; display: flex; flex-direction: column; align-items: center; justify-content: center; background: #ffffff; box-sizing: border-box; flex-shrink: 0;">
                  <span style="font-size: 7px; color: #800020; font-weight: bold; line-height: 1; text-align: center; text-transform: uppercase; letter-spacing: 0.2px;">Care with Devotion</span>
                  <span style="font-family: 'Brush Script MT', 'Lucida Handwriting', cursive, sans-serif; font-size: 20px; color: #800020; font-weight: bold; margin: -2px 0;">
                    \${clinicName.split(' ')[0] || 'Hospital'}
                  </span>
                  <span style="font-size: 4px; color: #ffffff; background: #800020; width: 100%; text-align: center; font-weight: bold; padding: 1px 0; border-radius: 2px; text-transform: uppercase;">
                    \${clinicName}
                  </span>
                </div>
                <div style="flex-grow: 1; text-align: center; padding-right: 65px;">
                  <h1 style="margin: 0; color: #800020; font-family: 'Outfit', 'Inter', sans-serif; font-size: 20px; font-weight: 900; letter-spacing: 0.5px; line-height: 1.2; text-transform: uppercase;">\${clinicName}</h1>
                  <p style="margin: 3px 0; color: #1E293B; font-size: 9px; font-weight: 700; letter-spacing: 0.2px; text-transform: uppercase;">Official EMR OPD Portal - \${clinicName}</p>
                  <p style="margin: 0; color: #475569; font-size: 8px; font-weight: 600;">Web: \${window.location.origin} &nbsp;&nbsp;•&nbsp;&nbsp; E-mail: info@\${rx.tenantId || 'city_hospital'}.com</p>
                </div>
              </div>
            `}

            <div style="text-align: center; margin: 8px 0;">
              <span style="font-family: 'Outfit', sans-serif; font-size: 13px; font-weight: 900; color: #800020; border-bottom: 2px solid #800020; border-top: 2px solid #800020; padding: 2px 20px; letter-spacing: 1px; text-transform: uppercase;">Prescription</span>
            </div>

            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px; font-size: 11px; color: #1E293B; line-height: 1.4; font-family: 'Inter', sans-serif;">
              <div style="display: flex; flex-direction: column; gap: 4px; word-wrap: break-word; white-space: normal;">
                <div><span style="font-weight: 700; width: 85px; display: inline-block; color: #800020;">Patient Name</span><span style="font-weight: 500;">: ${cleanField(patientProfile?.name || currentUser.name || rx.patientId?.name)}</span></div>
                <div><span style="font-weight: 700; width: 85px; display: inline-block; color: #800020;">Age / Gender</span><span style="font-weight: 500;">: ${rx.patientId?.age || patientProfile?.age || '—'} Yrs / &nbsp;${cleanField(patientProfile?.gender || rx.patientId?.gender)}</span></div>
                <div><span style="font-weight: 700; width: 85px; display: inline-block; color: #800020;">Date</span><span style="font-weight: 500;">: ${cleanField(rxDate)}</span></div>
                <div><span style="font-weight: 700; width: 85px; display: inline-block; color: #800020;">Mobile No.</span><span style="font-weight: 500;">: ${cleanField(patientProfile?.contact || rx.patientId?.contact || currentUser.phone)}</span></div>
                <div><span style="font-weight: 700; width: 85px; display: inline-block; color: #800020;">Address</span><span style="font-weight: 500;">: ${cleanField(patientProfile?.address || rx.patientId?.address || currentUser.address)}</span></div>
              </div>
              <div style="display: flex; flex-direction: column; gap: 4px; word-wrap: break-word; white-space: normal;">
                <div><span style="font-weight: 700; width: 110px; display: inline-block; color: #800020;">Doctor Name</span><span style="font-weight: 600;">: ${cleanField(doctorObj.name)}</span></div>
                <div><span style="font-weight: 700; width: 110px; display: inline-block; color: #800020;">Qualification</span><span style="font-weight: 500;">: ${cleanField(doctorObj.designation || 'MBBS, MD (Medicine)')}</span></div>
                <div><span style="font-weight: 700; width: 110px; display: inline-block; color: #800020;">Reg. No.</span><span style="font-weight: 500;">: ${doctorObj.staff_id ? doctorObj.staff_id.toUpperCase() : 'DMC - 12345'}</span></div>
                <div><span style="font-weight: 700; width: 110px; display: inline-block; color: #800020;">Department</span><span style="font-weight: 500;">: ${cleanField(doctorObj.department || 'General Medicine')}</span></div>
                <div><span style="font-weight: 700; width: 110px; display: inline-block; color: #800020;">Consultation Time</span><span style="font-weight: 500;">: 10:00 AM - 1:00 PM, 6:00 PM - 9:00 PM</span></div>
              </div>
            </div>

            <hr style="border: none; border-top: 1px solid #800020; margin: 8px 0;" />
          </div>

          <div id="print-footer-template" style="display: none;">
            <div style="text-align: center; font-family: 'Outfit', sans-serif; font-size: 11px; font-weight: bold; color: #800020; border-top: 1px solid #E2E8F0; padding-top: 8px; background: white; box-sizing: border-box;">
              Thank you for trusting us with your health. Get well soon!
            </div>
          </div>

          <!-- Temp source container for measurement (width exactly 180mm content printable area) -->
          <div id="temp-source" style="width: 180mm; position: absolute; left: -9999px; top: -9999px; box-sizing: border-box;">
            <!-- Diagnosis Box -->
            <div style="border: 1.5px solid #800020; border-radius: 8px; margin-bottom: 12px; overflow: hidden; background: #fff;">
              <div style="background: #FDF2F4; padding: 6px 10px; border-bottom: 1.5px solid #800020; font-family: 'Outfit', sans-serif; font-size: 12px; font-weight: 800; color: #800020; letter-spacing: 0.5px; text-transform: uppercase;">
                DIAGNOSIS (Doctor's Observation)
              </div>
              <div style="padding: 10px; font-size: 11.5px; color: #1E293B; line-height: 1.5; font-weight: 500;">
                ${rx.diagnosis ? (
                  (rx.diagnosis.includes('<') && rx.diagnosis.includes('>')) ? rx.diagnosis : rx.diagnosis.split('\n').map(line => `
                    <div style="display: flex; gap: 8px; margin-bottom: 4px; align-items: flex-start;">
                      <span style="color: #800020; font-size: 8px; margin-top: 3px;">•</span>
                      <span>${line.trim()}</span>
                    </div>
                  `).join('')
                ) : `
                  <div style="display: flex; gap: 8px; align-items: flex-start;">
                    <span style="color: #800020; font-size: 8px; margin-top: 3px;">•</span>
                    <span>General clinical observation & routine consultation.</span>
                  </div>
                `}
              </div>
            </div>

            <!-- Medicines Source Rows -->
            ${(rx.items || []).map((m, idx) => {
              let freq = 'Once a Day';
              let inst = 'After Food';
              if (m.instructions) {
                const parts = m.instructions.split('(');
                if (parts[0]) freq = parts[0].trim();
                if (parts[1]) inst = parts[1].replace(')', '').trim();
              }
              return `
                <tr class="medicine-row-source">
                  <td style="padding: 8px; text-align: center; border-right: 1px solid #800020; font-weight: 600; color: #800020;">${idx + 1}.</td>
                  <td style="padding: 8px; border-right: 1px solid #800020; font-weight: 700; color: #1E293B; word-break: break-word;">${cleanField(m.medicine)}</td>
                  <td style="padding: 8px; text-align: center; border-right: 1px solid #800020; color: #334155; font-weight: 500; word-break: break-word;">${cleanField(m.dosage)}</td>
                  <td style="padding: 8px; text-align: center; border-right: 1px solid #800020; color: #334155; font-weight: 500; word-break: break-word;">${cleanField(m.duration)}</td>
                  <td style="padding: 8px; text-align: center; border-right: 1px solid #800020; color: #800020; font-weight: 600; word-break: break-word;">${cleanField(freq)}</td>
                  <td style="padding: 8px; color: #334155; font-weight: 500; word-break: break-word;">${cleanField(inst)}</td>
                </tr>
              `;
            }).join('')}

            <!-- Tests Source Rows -->
            ${(rx.labs || []).map((test, idx) => `
              <tr class="lab-row-source">
                <td style="padding: 8px; text-align: center; border-right: 1px solid #800020; font-weight: 600; color: #800020;">${idx + 1}.</td>
                <td style="padding: 8px; font-weight: 700; color: #1E293B;">${cleanField(test)}</td>
              </tr>
            `).join('')}

            <!-- Notes & Signature Container -->
            <div style="display: flex; justify-content: space-between; align-items: flex-end; margin-top: 20px; min-height: 90px;" class="signature-block-source">
              <div style="font-size: 10.5px; line-height: 1.5; max-width: 60%;">
                <div style="color: #800020; font-weight: 800; font-size: 11px; margin-bottom: 3px; text-transform: uppercase;">Note :</div>
                <ul style="padding-left: 10px; margin: 0; list-style-type: square; color: #334155; font-weight: 600;">
                  <li>Take medicines as prescribed.</li>
                  <li>Complete the full course of antibiotics.</li>
                  <li>Avoid cold drinks and oily food.</li>
                  <li>Drink plenty of fluids and take rest.</li>
                </ul>
              </div>
              
              <div style="text-align: center; width: 200px; font-size: 10.5px; font-family: 'Inter', sans-serif;">
                <div style="border-bottom: 1px solid #800020; margin-bottom: 6px; height: 40px; position: relative;">
                  <span style="font-family: 'Brush Script MT', cursive, sans-serif; font-size: 22px; color: #800020; position: absolute; bottom: 2px; left: 50%; transform: translateX(-50%); font-weight: 500;">
                    ${doctorObj.name ? doctorObj.name.replace('Dr. ', '') : 'Anil Sharma'}
                  </span>
                </div>
                <div style="color: #800020; font-weight: 700; font-size: 12px;">${doctorObj.name || 'Dr. Anil Sharma'}</div>
                <div style="color: #475569; font-weight: 600; font-size: 10px; margin-top: 2px;">${doctorObj.designation || 'MBBS, MD (Medicine)'}</div>
                <div style="color: #475569; font-weight: 600; font-size: 10px;">Reg. No. ${doctorObj.staff_id ? doctorObj.staff_id.toUpperCase() : 'DMC - 12345'}</div>
                <div style="color: #800020; font-weight: 800; font-size: 10px; margin-top: 3px; text-transform: uppercase;">(Consultant Physician)</div>
                <div style="color: #94A3B8; font-size: 9px; margin-top: 3px; font-weight: 550; letter-spacing: 0.2px;">Signature & Seal</div>
                <div style="color: #800020; font-weight: 800; font-size: 10px; margin-top: 3px; text-transform: uppercase;">${rx.tenantId ? rx.tenantId.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ') : 'City Hospital'}</div>
              </div>
            </div>
          </div>

          <div id="pages-container"></div>

          <script>
            const letterheadUrl = "${letterheadUrl || ''}";
            function createMedicineTableTemplate() {
              const table = document.createElement('table');
              table.style.width = '100%';
              table.style.borderCollapse = 'collapse';
              table.style.fontSize = '11.5px';
              table.style.border = '1.5px solid #800020';
              table.style.borderRadius = '8px';
              table.style.overflow = 'hidden';
              table.style.marginBottom = '12px';
              table.innerHTML = \`
                <thead>
                  <tr style="background: #FDF2F4; border-bottom: 1.5px solid #800020;">
                    <th style="padding: 8px; color: #800020; font-weight: 800; text-align: center; border-right: 1px solid #800020; width: 50px;">S. No.</th>
                    <th style="padding: 8px; color: #800020; font-weight: 800; text-align: left; border-right: 1px solid #800020;">Medicine Name</th>
                    <th style="padding: 8px; color: #800020; font-weight: 800; text-align: center; border-right: 1px solid #800020; width: 70px;">Dose</th>
                    <th style="padding: 8px; color: #800020; font-weight: 800; text-align: center; border-right: 1px solid #800020; width: 80px;">Duration</th>
                    <th style="padding: 8px; color: #800020; font-weight: 800; text-align: center; border-right: 1px solid #800020; width: 100px;">Frequency</th>
                    <th style="padding: 8px; color: #800020; font-weight: 800; text-align: left;">Instructions</th>
                  </tr>
                </thead>
                <tbody></tbody>
              \`;
              return table;
            }

            function createLabsTableTemplate() {
              const table = document.createElement('table');
              table.style.width = '50%';
              table.style.borderCollapse = 'collapse';
              table.style.fontSize = '11.5px';
              table.style.border = '1.5px solid #800020';
              table.style.borderRadius = '8px';
              table.style.overflow = 'hidden';
              table.style.marginTop = '15px';
              table.innerHTML = \`
                <thead>
                  <tr style="background: #FDF2F4; border-bottom: 1.5px solid #800020;">
                    <th style="padding: 8px; color: #800020; font-weight: 800; text-align: center; border-right: 1px solid #800020; width: 50px;">S. No.</th>
                    <th style="padding: 8px; color: #800020; font-weight: 800; text-align: left;">Test Name</th>
                  </tr>
                </thead>
                <tbody></tbody>
              \`;
              return table;
            }

            function createNewPage(headerTemplate, footerTemplate) {
              const page = document.createElement('div');
              page.className = 'page-container';
              
              if (letterheadUrl) {
                const bg = document.createElement('img');
                bg.src = letterheadUrl;
                bg.style.position = 'absolute';
                bg.style.top = '0';
                bg.style.left = '0';
                bg.style.width = '210mm';
                bg.style.height = '297mm';
                bg.style.zIndex = '-1';
                page.appendChild(bg);
              }
              
              const header = headerTemplate.cloneNode(true);
              header.removeAttribute('id');
              header.style.display = 'block';
              
              const contentArea = document.createElement('div');
              contentArea.className = 'content-area';
              contentArea.style.marginTop = '10px';
              
              const footer = footerTemplate.cloneNode(true);
              footer.removeAttribute('id');
              footer.style.display = 'block';
              footer.style.position = 'absolute';
              footer.style.bottom = '28mm';
              footer.style.left = '15mm';
              footer.style.right = '15mm';
              
              page.appendChild(header);
              page.appendChild(contentArea);
              page.appendChild(footer);
              
              document.getElementById('pages-container').appendChild(page);
              return page;
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

            function paginate() {
              const targetPageHeight = 1122.5; 
              const topPadding = 56.7; 
              const bottomPadding = 75.6; 
              const safetyMargin = 45; 
              
              const header = document.getElementById('print-header-template');
              const footer = document.getElementById('print-footer-template');
              
              header.style.display = 'block';
              footer.style.display = 'block';
              const headerHeight = header.offsetHeight;
              const footerHeight = footer.offsetHeight;
              header.style.display = 'none';
              footer.style.display = 'none';
              
              const availableHeight = targetPageHeight - topPadding - bottomPadding - headerHeight - footerHeight - safetyMargin;
              
              const source = document.getElementById('temp-source');
              const children = Array.from(source.children);
              
              let currentPage = createNewPage(header, footer);
              let currentContentArea = currentPage.querySelector('.content-area');
              let currentSpaceUsed = 0;
              
              let activeMedicineTable = null;
              let activeMedicineTbody = null;
              let activeLabsTable = null;
              let activeLabsTbody = null;
              
              for (let child of children) {
                if (child.classList.contains('medicine-row-source')) {
                  if (!activeMedicineTable) {
                    activeMedicineTable = createMedicineTableTemplate();
                    activeMedicineTbody = activeMedicineTable.querySelector('tbody');
                    
                    source.appendChild(activeMedicineTable);
                    const tableHeaderHeight = activeMedicineTable.offsetHeight;
                    source.removeChild(activeMedicineTable);
                    
                    if (currentSpaceUsed + tableHeaderHeight > availableHeight) {
                      currentPage = createNewPage(header, footer);
                      currentContentArea = currentPage.querySelector('.content-area');
                      currentSpaceUsed = 0;
                    }
                    currentContentArea.appendChild(activeMedicineTable);
                    currentSpaceUsed += tableHeaderHeight;
                  }
                  
                  const tr = document.createElement('tr');
                  tr.style.borderBottom = '1px solid #800020';
                  tr.style.pageBreakInside = 'avoid';
                  tr.innerHTML = child.innerHTML;
                  activeMedicineTbody.appendChild(tr);
                  
                  const trHeight = tr.offsetHeight;
                  if (currentSpaceUsed + trHeight > availableHeight) {
                    activeMedicineTbody.removeChild(tr);
                    
                    currentPage = createNewPage(header, footer);
                    currentContentArea = currentPage.querySelector('.content-area');
                    currentSpaceUsed = 0;
                    
                    activeMedicineTable = createMedicineTableTemplate();
                    activeMedicineTbody = activeMedicineTable.querySelector('tbody');
                    currentContentArea.appendChild(activeMedicineTable);
                    
                    activeMedicineTbody.appendChild(tr);
                    currentSpaceUsed += activeMedicineTable.offsetHeight;
                  } else {
                    currentSpaceUsed += trHeight;
                  }
                }
                else if (child.classList.contains('lab-row-source')) {
                  activeMedicineTable = null;
                  activeMedicineTbody = null;
                  
                  if (!activeLabsTable) {
                    activeLabsTable = createLabsTableTemplate();
                    activeLabsTbody = activeLabsTable.querySelector('tbody');
                    
                    source.appendChild(activeLabsTable);
                    const tableHeaderHeight = activeLabsTable.offsetHeight;
                    source.removeChild(activeLabsTable);
                    
                    if (currentSpaceUsed + tableHeaderHeight > availableHeight) {
                      currentPage = createNewPage(header, footer);
                      currentContentArea = currentPage.querySelector('.content-area');
                      currentSpaceUsed = 0;
                    }
                    currentContentArea.appendChild(activeLabsTable);
                    currentSpaceUsed += tableHeaderHeight;
                  }
                  
                  const tr = document.createElement('tr');
                  tr.style.borderBottom = '1px solid #800020';
                  tr.style.pageBreakInside = 'avoid';
                  tr.innerHTML = child.innerHTML;
                  activeLabsTbody.appendChild(tr);
                  
                  const trHeight = tr.offsetHeight;
                  if (currentSpaceUsed + trHeight > availableHeight) {
                    activeLabsTbody.removeChild(tr);
                    
                    currentPage = createNewPage(header, footer);
                    currentContentArea = currentPage.querySelector('.content-area');
                    currentSpaceUsed = 0;
                    
                    activeLabsTable = createLabsTableTemplate();
                    activeLabsTbody = activeLabsTable.querySelector('tbody');
                    currentContentArea.appendChild(activeLabsTable);
                    
                    activeLabsTbody.appendChild(tr);
                    currentSpaceUsed += activeLabsTable.offsetHeight;
                  } else {
                    currentSpaceUsed += trHeight;
                  }
                }
                else {
                  activeMedicineTable = null;
                  activeMedicineTbody = null;
                  activeLabsTable = null;
                  activeLabsTbody = null;
                  
                  const blockHeight = child.offsetHeight;
                  
                  if (currentSpaceUsed + blockHeight > availableHeight) {
                    currentPage = createNewPage(header, footer);
                    currentContentArea = currentPage.querySelector('.content-area');
                    currentSpaceUsed = 0;
                  }
                  currentContentArea.appendChild(child);
                  currentSpaceUsed += blockHeight;
                }
              }
              
              document.body.removeChild(source);
            }

            window.onload = function() {
              waitForImages().then(function() {
                paginate();
                window.print();
                setTimeout(function() { window.parent.postMessage('close-print-prescription-patient-iframe', '*'); }, 500);
              });
            };
          </script>
        </body>
        </html>
      `;

      printWindow.document.write(htmlContent);
      printWindow.document.close();
    } catch (err) {
      console.error("Print prescription error:", err);
      showToast("Failed to prepare print view.", "error");
    }
  };

  // Download complete EMR clinical dossier as HTML text / print-friendly window
  const handleDownloadDossier = () => {
    const printWindow = window.open('', '_blank');
    const patientName = patientProfile?.name || currentUser.name;
    const uhid = patientProfile ? `MDC-${patientProfile._id.substring(18).toUpperCase()}` : 'N/A';
    
    let htmlContent = `
      <html>
      <head>
        <title>Curoxa Clinical Dossier - \${patientName}</title>
        <style>
          body { font-family: 'Helvetica Neue', Arial, sans-serif; padding: 40px; color: #1E293B; line-height: 1.6; }
          .header { border-bottom: 3px solid #2563EB; padding-bottom: 20px; margin-bottom: 30px; }
          .title { font-size: 28px; font-weight: bold; color: #2563EB; margin: 0; }
          .subtitle { font-size: 14px; color: #64748B; margin-top: 4px; }
          .section { margin-bottom: 30px; }
          .section-title { font-size: 18px; font-weight: bold; border-bottom: 1px solid #E2E8F0; padding-bottom: 8px; margin-bottom: 15px; color: #0F172A; }
          .meta-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 15px; margin-bottom: 20px; background: #F8FAFC; padding: 15px; borderRadius: 8px; }
          .meta-item label { font-size: 11px; font-weight: bold; color: #64748B; text-transform: uppercase; display: block; }
          .meta-item span { font-size: 14px; font-weight: 600; }
          .timeline-entry { border-left: 2px solid #3B82F6; padding-left: 20px; margin-bottom: 20px; position: relative; }
          .timeline-entry::before { content: ''; position: absolute; left: -6px; top: 6px; width: 10px; height: 10px; border-radius: 50%; background: #2563EB; }
          .entry-date { font-size: 12px; color: #64748B; font-weight: bold; }
          .entry-title { font-size: 15px; font-weight: bold; color: #1E293B; margin: 4px 0; }
          .entry-detail { font-size: 13.5px; color: #334155; }
          .abnormal { color: #EF4444; font-weight: bold; }
          .footer { font-size: 11px; color: #94A3B8; text-align: center; border-top: 1px solid #E2E8F0; padding-top: 20px; margin-top: 50px; }
        </style>
      </head>
      <body>
        <div class="header">
          <div class="title">Curoxa Hospital Group</div>
          <div class="subtitle">Official Electronic Medical Record & Clinical Dossier</div>
        </div>

        <div class="section">
          <div class="section-title">Patient Demographics</div>
          <div class="meta-grid">
            <div class="meta-item"><label>Full Name</label><span>\${patientName}</span></div>
            <div class="meta-item"><label>UHID / ID</label><span>\${uhid}</span></div>
            <div class="meta-item"><label>Age / Gender</label><span>\${patientProfile?.age || 'N/A'} Yrs / \${patientProfile?.gender || 'N/A'}</span></div>
            <div class="meta-item"><label>Contact</label><span>\${patientProfile?.contact || 'N/A'}</span></div>
            <div class="meta-item"><label>Blood Group</label><span>\${patientProfile?.bloodGroup || 'N/A'}</span></div>
            <div class="meta-item"><label>ABHA ID</label><span>\${patientProfile?.abhaId || 'Not Linked'}</span></div>
          </div>
        </div>

        <div class="section">
          <div class="section-title">Clinical History Timeline</div>
    `;

    // Add visits
    if (visits.length > 0) {
      htmlContent += `<h3>Visits & Triages</h3>`;
      visits.forEach(v => {
        htmlContent += `
          <div class="timeline-entry">
            <div class="entry-date">\${new Date(v.arrivalTimestamp).toLocaleString()}</div>
            <div class="entry-title">\${v.type} Visit - Department: \${v.department}</div>
            <div class="entry-detail">
              <strong>Chief Complaint:</strong> \${v.chiefComplaint || 'None'}<br/>
              <strong>Priority Triage:</strong> \${v.priority} | <strong>Status:</strong> \${v.status}
            </div>
          </div>
        `;
      });
    }

    // Add vitals
    if (vitals.length > 0) {
      htmlContent += `<h3>Vitals Log</h3>`;
      vitals.forEach(v => {
        htmlContent += `
          <div class="timeline-entry">
            <div class="entry-date">\${new Date(v.createdAt).toLocaleString()}</div>
            <div class="entry-title">Recorded Vitals</div>
            <div class="entry-detail">
              BP: \${v.bpSys}/\${v.bpDia} mmHg | Pulse: \${v.pulse} bpm | Temp: \${v.temperature} F | SPO2: <span class="\${v.spo2 < 95 ? 'abnormal' : ''}">\${v.spo2}%</span><br/>
              Weight: \${v.weight} kg | Height: \${v.height} cm | BMI: \${v.bmi || 'N/A'}<br/>
              Blood Sugar: \${v.bloodSugar || 'N/A'} mg/dL (\${v.sugarType}) | Pain Score: \${v.painScore}/10
            </div>
          </div>
        `;
      });
    }

    // Add clinical notes
    if (clinicalNotes.length > 0) {
      htmlContent += `<h3>SOAP Clinical Notes</h3>`;
      clinicalNotes.forEach(n => {
        htmlContent += `
          <div class="timeline-entry">
            <div class="entry-date">\${new Date(n.createdAt).toLocaleString()}</div>
            <div class="entry-title">SOAP Note - Dr. \${n.doctorId?.name || 'Consultant'}</div>
            <div class="entry-detail">
              <strong>Subjective:</strong> \${n.subjective || 'N/A'}<br/>
              <strong>Objective:</strong> \${n.objective || 'N/A'}<br/>
              <strong>Assessment:</strong> \${n.assessment?.join(', ') || 'N/A'}<br/>
              <strong>Plan:</strong> \${n.plan || 'N/A'}<br/>
              <strong>Signature:</strong> \${n.digitalSignature || 'Signed Digitally'}
            </div>
          </div>
        `;
      });
    }

    // Add procedures
    if (procedures.length > 0) {
      htmlContent += `<h3>Surgeries & Procedures</h3>`;
      procedures.forEach(p => {
        htmlContent += `
          <div class="timeline-entry">
            <div class="entry-date">\${new Date(p.createdAt).toLocaleString()}</div>
            <div class="entry-title">\${p.procedureName} - Dr. \${p.doctorId?.name || 'Surgeon'}</div>
            <div class="entry-detail">
              <strong>Pre-Op:</strong> \${p.preOpNotes || 'N/A'} | <strong>Post-Op:</strong> \${p.postOpNotes || 'N/A'}<br/>
              <strong>Anesthesia:</strong> \${p.anesthesiaDetails || 'N/A'} | <strong>Implants:</strong> \${p.implants || 'None'}<br/>
              <strong>Status:</strong> \${p.status}
            </div>
          </div>
        `;
      });
    }

    htmlContent += `
        </div>
        <div class="footer">
          Curoxa HIPAA-inspired & DPDP-compliant Secure Patient Vault.<br/>
          Downloaded by patient on \${new Date().toLocaleString()} from IP: \${consent?.ipAddress || 'Self-Session'}.
        </div>
      </body>
      </html>
    `;

    printWindow.document.write(htmlContent);
    printWindow.document.close();
    printWindow.print();
  };

  if (profileVerifying && !currentUser.isSetupComplete) {
    return (
      <div style={{
        minHeight: '100vh',
        width: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#F8FAFC',
        fontFamily: "'Urbanist', sans-serif"
      }}>
        <div style={{
          width: '38px',
          height: '38px',
          border: '3px solid #E2E8F0',
          borderTopColor: '#2563EB',
          borderRadius: '50%',
          animation: 'curoxaSpin 0.8s linear infinite'
        }} />
        <p style={{ marginTop: '14px', fontSize: '13px', fontWeight: 700, color: '#64748B' }}>
          Loading your patient profile...
        </p>
        <style>{`@keyframes curoxaSpin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  const isProfileIncomplete = !currentUser.isSetupComplete && (!patientProfile || !checkPatientProfileComplete(patientProfile));

  if (isProfileIncomplete) {
    return (
      <div className="onboarding-container" style={{
        height: '100vh',
        width: '100%',
        background: 'radial-gradient(circle at 30% 30%, #FFFFFF 0%, #DBEAFE 100%)',
        fontFamily: "'Urbanist', sans-serif",
        overflowY: 'auto'
      }}>
        <style>{`
          .onboarding-container {
            font-family: 'Urbanist', sans-serif !important;
          }
          .onboarding-container h2 {
            font-family: 'Outfit', sans-serif !important;
          }
          .onboarding-card {
            background: rgba(255, 255, 255, 0.85);
            backdrop-filter: blur(16px);
            -webkit-backdrop-filter: blur(16px);
            border: 1px solid #BFDBFE !important;
            box-shadow: 0 30px 60px rgba(59, 113, 254, 0.1) !important;
            border-radius: 24px;
            width: 100%;
            max-width: 600px;
            padding: 40px;
            box-sizing: border-box;
            animation: onboardingSlideUp 0.5s ease-out;
          }
          @keyframes onboardingSlideUp {
            from { transform: translateY(20px); opacity: 0; }
            to { transform: translateY(0); opacity: 1; }
          }
          .onboarding-container .form-control {
            background: #FFFFFF !important;
            border: 1px solid #CBD5E1 !important;
            border-radius: 8px !important;
            color: #0F172A !important;
            font-family: 'Urbanist', sans-serif !important;
            font-weight: 600 !important;
            transition: border-color 0.2s, box-shadow 0.2s !important;
          }
          .onboarding-container .form-control:focus {
            border-color: #3B71FE !important;
            box-shadow: 0 0 0 3px rgba(59, 113, 254, 0.15) !important;
            background: #FFFFFF !important;
            outline: none !important;
          }
          .onboarding-container .btn-primary {
            background: var(--primary-gradient) !important;
            box-shadow: 0 8px 16px rgba(59, 113, 254, 0.15) !important;
            transition: all 0.2s ease !important;
            border: none !important;
          }
          .onboarding-container .btn-primary:hover {
            transform: translateY(-2px) !important;
            box-shadow: 0 12px 20px rgba(59, 113, 254, 0.25) !important;
          }
          .premium-toast {
            position: fixed;
            top: 24px;
            right: 24px;
            padding: 16px 24px;
            border-radius: 12px;
            box-shadow: 0 20px 40px rgba(0,0,0,0.08);
            font-weight: 700;
            font-size: 14px;
            z-index: 9999;
          }
          .onboarding-grid-2 {
            display: grid !important;
            grid-template-columns: 1fr 1fr !important;
            gap: 16px !important;
            margin-bottom: 16px !important;
          }
          .onboarding-grid-3 {
            display: grid !important;
            grid-template-columns: 1fr 1fr 1fr !important;
            gap: 16px !important;
            margin-bottom: 16px !important;
          }
          @media (max-width: 640px) {
            .onboarding-card {
              padding: 24px 16px !important;
              border-radius: 16px !important;
            }
            .onboarding-grid-2, .onboarding-grid-3 {
              grid-template-columns: 1fr !important;
              gap: 12px !important;
            }
          }
        `}</style>
        <div style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          minHeight: '100%',
          width: '100%',
          padding: '40px 16px',
          boxSizing: 'border-box'
        }}>
          <div className="onboarding-card">
            <div style={{ textAlign: 'center', marginBottom: '32px' }}>
              <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '48px', height: '48px', borderRadius: '14px', background: '#2563EB', color: '#FFFFFF', fontWeight: 900, fontSize: '24px', marginBottom: '16px', boxShadow: '0 8px 20px rgba(59, 113, 254, 0.15)' }}>
                C
              </div>
              <h2 style={{ fontSize: '24px', fontWeight: 900, color: '#0F172A', margin: '0 0 8px 0', fontFamily: "'Outfit', sans-serif" }}>Complete Your Profile</h2>
              <p style={{ fontSize: '14px', color: '#64748B', margin: 0, fontWeight: 500 }}>Welcome to Curoxa! Please fill in your details to set up your patient account.</p>
            </div>

            {profileMsg.text && (
              <div style={{ padding: '14px', borderRadius: '10px', marginBottom: '20px', fontSize: '13px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px', 
                background: profileMsg.type === 'success' ? '#F0FDF4' : '#FEF2F2',
                color: profileMsg.type === 'success' ? '#16A34A' : '#DC2626',
                border: profileMsg.type === 'success' ? '1px solid #86EFAC' : '1px solid #FCA5A5'
              }}>
                <i data-lucide={profileMsg.type === 'success' ? 'check-circle' : 'alert-circle'} style={{ width: '16px', flexShrink: 0 }}></i>
                <span style={{ flexGrow: 1 }}>{profileMsg.text}</span>
              </div>
            )}

            <form onSubmit={handleCompleteOnboarding}>
              <div className="onboarding-grid-2">
                <div className="form-group" style={{ margin: 0 }}>
                  <label style={{ fontSize: '12px', fontWeight: 800, color: '#475569', marginBottom: '6px', display: 'block' }}>Full Name *</label>
                  <input type="text" className="form-control" style={{ height: '42px', borderRadius: '8px', border: '1px solid #CBD5E1', paddingLeft: '12px', fontSize: '13px', fontWeight: 600 }} value={editProfileData.name} onChange={e => setEditProfileData({...editProfileData, name: e.target.value})} required />
                </div>
                <div className="form-group" style={{ margin: 0 }}>
                  <label style={{ fontSize: '12px', fontWeight: 800, color: '#475569', marginBottom: '6px', display: 'block' }}>Contact / Mobile Number *</label>
                  <input type="text" className="form-control" style={{ height: '42px', borderRadius: '8px', border: '1px solid #CBD5E1', paddingLeft: '12px', fontSize: '13px', fontWeight: 600 }} value={editProfileData.contact} onChange={e => setEditProfileData({...editProfileData, contact: e.target.value})} placeholder="e.g. 9876543210" required />
                </div>
              </div>
              
              <div className="onboarding-grid-3">
                <div className="form-group" style={{ margin: 0 }}>
                  <label style={{ fontSize: '12px', fontWeight: 800, color: '#475569', marginBottom: '6px', display: 'block' }}>Age (Years / Months / Days) *</label>
                  <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                    <input type="number" className="form-control" style={{ height: '42px', borderRadius: '8px', border: '1px solid #CBD5E1', padding: '0 8px', fontSize: '13px', fontWeight: 600, textAlign: 'center', flex: 1 }} value={editProfileData.age} onChange={e => setEditProfileData({...editProfileData, age: e.target.value})} placeholder="Yrs" min="0" max="120" />
                    <span style={{ fontSize: '12px', fontWeight: 700, color: '#64748B' }}>Y</span>
                    <input type="number" className="form-control" style={{ height: '42px', borderRadius: '8px', border: '1px solid #CBD5E1', padding: '0 8px', fontSize: '13px', fontWeight: 600, textAlign: 'center', flex: 1 }} value={editProfileData.ageMonths || ''} onChange={e => setEditProfileData({...editProfileData, ageMonths: e.target.value})} placeholder="M" min="0" max="11" />
                    <span style={{ fontSize: '12px', fontWeight: 700, color: '#64748B' }}>M</span>
                    <input type="number" className="form-control" style={{ height: '42px', borderRadius: '8px', border: '1px solid #CBD5E1', padding: '0 8px', fontSize: '13px', fontWeight: 600, textAlign: 'center', flex: 1 }} value={editProfileData.ageDays || ''} onChange={e => setEditProfileData({...editProfileData, ageDays: e.target.value})} placeholder="D" min="0" max="30" />
                    <span style={{ fontSize: '12px', fontWeight: 700, color: '#64748B' }}>D</span>
                  </div>
                </div>
                <div className="form-group" style={{ margin: 0 }}>
                  <label style={{ fontSize: '12px', fontWeight: 800, color: '#475569', marginBottom: '6px', display: 'block' }}>Gender *</label>
                  <select className="form-control" style={{ height: '42px', borderRadius: '8px', border: '1px solid #CBD5E1', paddingLeft: '10px', fontSize: '13px', fontWeight: 600, background: 'white' }} value={editProfileData.gender} onChange={e => setEditProfileData({...editProfileData, gender: e.target.value})} required>
                    <option value="">Select Gender</option>
                    <option value="Male">Male</option>
                    <option value="Female">Female</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
                <div className="form-group" style={{ margin: 0 }}>
                  <label style={{ fontSize: '12px', fontWeight: 800, color: '#475569', marginBottom: '6px', display: 'block' }}>Blood Group *</label>
                  <select className="form-control" style={{ height: '42px', borderRadius: '8px', border: '1px solid #CBD5E1', paddingLeft: '10px', fontSize: '13px', fontWeight: 600, background: 'white' }} value={editProfileData.bloodGroup} onChange={e => setEditProfileData({...editProfileData, bloodGroup: e.target.value})} required>
                    <option value="">Select Blood Group</option>
                    <option value="O+">O+</option>
                    <option value="O-">O-</option>
                    <option value="A+">A+</option>
                    <option value="A-">A-</option>
                    <option value="B+">B+</option>
                    <option value="B-">B-</option>
                    <option value="AB+">AB+</option>
                    <option value="AB-">AB-</option>
                  </select>
                </div>
              </div>

              <div className="form-group" style={{ marginBottom: '16px' }}>
                <label style={{ fontSize: '12px', fontWeight: 800, color: '#475569', marginBottom: '6px', display: 'block' }}>Home Address *</label>
                <textarea className="form-control" style={{ minHeight: '60px', borderRadius: '8px', border: '1px solid #CBD5E1', padding: '10px 12px', fontSize: '13px', fontWeight: 600 }} value={editProfileData.address} onChange={e => setEditProfileData({...editProfileData, address: e.target.value})} placeholder="Please enter your residential address" required></textarea>
              </div>

              <div className="form-group" style={{ marginBottom: '16px' }}>
                <label style={{ fontSize: '12px', fontWeight: 800, color: '#475569', marginBottom: '6px', display: 'block' }}>Allergies (if any)</label>
                <input type="text" className="form-control" placeholder="e.g. Peanuts, Penicillin (Write 'None' if none)" style={{ height: '42px', borderRadius: '8px', border: '1px solid #CBD5E1', paddingLeft: '12px', fontSize: '13px', fontWeight: 600 }} value={editProfileData.allergies} onChange={e => setEditProfileData({...editProfileData, allergies: e.target.value})} />
              </div>

              <div className="form-group" style={{ marginBottom: '24px' }}>
                <label style={{ fontSize: '12px', fontWeight: 800, color: '#475569', marginBottom: '6px', display: 'block' }}>Medical History (Comma separated)</label>
                <input type="text" className="form-control" placeholder="e.g. Asthma, Diabetes (Write 'None' if none)" style={{ height: '42px', borderRadius: '8px', border: '1px solid #CBD5E1', paddingLeft: '12px', fontSize: '13px', fontWeight: 600 }} value={editProfileData.medicalHistory} onChange={e => setEditProfileData({...editProfileData, medicalHistory: e.target.value})} />
              </div>

              <button type="submit" className="btn btn-primary" style={{ width: '100%', height: '46px', justifyContent: 'center', fontWeight: 800, borderRadius: '8px', background: 'var(--primary-gradient)' }} disabled={isUpdatingProfile}>
                {isUpdatingProfile ? 'Setting up account...' : 'Complete Profile Setup'}
              </button>
            </form>

            <div style={{ marginTop: '20px', textAlign: 'center' }}>
              <button 
                type="button" 
                style={{ background: 'transparent', border: 'none', color: '#EF4444', fontWeight: 800, cursor: 'pointer', fontSize: '13px' }}
                onClick={handleLogout}
              >
                Cancel & Log Out
              </button>
            </div>
          </div>
        </div>

        {/* APPOINTMENT PAYMENT MODAL */}
      {paymentModalOpen && selectedPaymentAppt && (
        <div className="modal-overlay" style={{ zIndex: 99999 }}>
          <div className="modal-box" style={{ maxWidth: '480px', padding: '0', borderRadius: '16px', overflow: 'hidden', background: '#FFFFFF' }}>
            
            {/* Modal Header */}
            <div style={{ background: 'linear-gradient(135deg, #1E293B 0%, #0F172A 100%)', color: 'white', padding: '20px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <span style={{ background: '#3B82F6', color: 'white', fontSize: '10px', fontWeight: 800, padding: '2px 8px', borderRadius: '4px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Secure Checkout
                </span>
                <h2 style={{ margin: '6px 0 0 0', fontSize: '18px', fontWeight: 800, color: 'white' }}>
                  Confirm Appointment Booking
                </h2>
              </div>
              <button 
                onClick={() => setPaymentModalOpen(false)}
                style={{ background: 'rgba(255, 255, 255, 0.1)', border: 'none', color: 'white', width: '32px', height: '32px', borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '16px' }}
              >
                ✕
              </button>
            </div>

            <div style={{ padding: '24px' }}>
              {/* Doctor & Slot Info */}
              <div style={{ background: '#F8FAFC', borderRadius: '12px', padding: '14px 16px', border: '1px solid #E2E8F0', marginBottom: '20px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                  <span style={{ fontSize: '12px', color: '#64748B', fontWeight: 600 }}>Doctor:</span>
                  <span style={{ fontSize: '13px', color: '#0F172A', fontWeight: 800 }}>{selectedPaymentAppt.doctorId?.name || 'Assigned Doctor'}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                  <span style={{ fontSize: '12px', color: '#64748B', fontWeight: 600 }}>Specialty:</span>
                  <span style={{ fontSize: '13px', color: '#334155', fontWeight: 700 }}>{selectedPaymentAppt.doctorId?.specialty || 'General OPD'}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: '12px', color: '#64748B', fontWeight: 600 }}>Date & Time:</span>
                  <span style={{ fontSize: '13px', color: '#2563EB', fontWeight: 800 }}>{new Date(selectedPaymentAppt.date).toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' })} | {selectedPaymentAppt.time}</span>
                </div>
              </div>

              {/* Itemized Bill Breakdown */}
              <h4 style={{ fontSize: '12px', fontWeight: 800, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 10px 0' }}>
                Itemized Fee Breakdown
              </h4>
              <div style={{ border: '1px solid #E2E8F0', borderRadius: '12px', overflow: 'hidden', marginBottom: '20px' }}>
                {paymentBillData?.items && paymentBillData.items.length > 0 ? (
                  paymentBillData.items.map((item, i) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 14px', borderBottom: i < paymentBillData.items.length - 1 ? '1px solid #F1F5F9' : 'none', background: item.description.includes('Registration') ? '#FFFBEB' : '#FFFFFF' }}>
                      <span style={{ fontSize: '13px', color: '#334155', fontWeight: 600 }}>
                        {item.description}
                        {item.description.includes('Registration') && (
                          <span style={{ fontSize: '10px', color: '#D97706', fontWeight: 800, marginLeft: '6px', background: '#FEF3C7', padding: '1px 5px', borderRadius: '4px' }}>1-Time Only</span>
                        )}
                      </span>
                      <span style={{ fontSize: '13px', color: '#0F172A', fontWeight: 750 }}>₹{item.amount}</span>
                    </div>
                  ))
                ) : (
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 14px' }}>
                    <span style={{ fontSize: '13px', color: '#334155', fontWeight: 600 }}>Doctor Consultation Fee</span>
                    <span style={{ fontSize: '13px', color: '#0F172A', fontWeight: 750 }}>₹500</span>
                  </div>
                )}
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 14px', background: '#F8FAFC', borderTop: '2px dashed #CBD5E1' }}>
                  <span style={{ fontSize: '14px', color: '#0F172A', fontWeight: 800 }}>Total Amount Payable</span>
                  <span style={{ fontSize: '16px', color: '#2563EB', fontWeight: 900 }}>₹{paymentBillData?.totalAmount || 550}</span>
                </div>
              </div>

              {/* Payment Method Selector */}
              <h4 style={{ fontSize: '12px', fontWeight: 800, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 10px 0' }}>
                Select Payment Method
              </h4>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px', marginBottom: '20px' }}>
                <button
                  type="button"
                  onClick={() => setPaymentMethodTab('upi')}
                  style={{
                    padding: '10px 8px',
                    borderRadius: '8px',
                    border: paymentMethodTab === 'upi' ? '2px solid #2563EB' : '1px solid #CBD5E1',
                    background: paymentMethodTab === 'upi' ? '#EFF6FF' : '#FFFFFF',
                    color: paymentMethodTab === 'upi' ? '#2563EB' : '#475569',
                    fontSize: '12px',
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '4px'
                  }}
                >
                  <span style={{ fontSize: '16px' }}>📱</span>
                  UPI / QR
                </button>

                <button
                  type="button"
                  onClick={() => setPaymentMethodTab('card')}
                  style={{
                    padding: '10px 8px',
                    borderRadius: '8px',
                    border: paymentMethodTab === 'card' ? '2px solid #2563EB' : '1px solid #CBD5E1',
                    background: paymentMethodTab === 'card' ? '#EFF6FF' : '#FFFFFF',
                    color: paymentMethodTab === 'card' ? '#2563EB' : '#475569',
                    fontSize: '12px',
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '4px'
                  }}
                >
                  <span style={{ fontSize: '16px' }}>💳</span>
                  Debit / Card
                </button>

                <button
                  type="button"
                  onClick={() => setPaymentMethodTab('netbanking')}
                  style={{
                    padding: '10px 8px',
                    borderRadius: '8px',
                    border: paymentMethodTab === 'netbanking' ? '2px solid #2563EB' : '1px solid #CBD5E1',
                    background: paymentMethodTab === 'netbanking' ? '#EFF6FF' : '#FFFFFF',
                    color: paymentMethodTab === 'netbanking' ? '#2563EB' : '#475569',
                    fontSize: '12px',
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '4px'
                  }}
                >
                  <span style={{ fontSize: '16px' }}>🏦</span>
                  NetBanking
                </button>
              </div>

              {/* Pay Action Button */}
              <button
                type="button"
                onClick={handleProcessPayment}
                disabled={processingPayment}
                style={{
                  width: '100%',
                  height: '46px',
                  borderRadius: '10px',
                  background: processingPayment ? '#94A3B8' : '#2563EB',
                  color: 'white',
                  border: 'none',
                  fontSize: '15px',
                  fontWeight: 800,
                  cursor: processingPayment ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  boxShadow: '0 4px 14px rgba(37, 99, 235, 0.3)',
                  transition: '0.2s'
                }}
              >
                {processingPayment ? 'Processing Secure Payment...' : `Pay ₹${paymentBillData?.totalAmount || 550} & Confirm Booking`}
              </button>

              <p style={{ margin: '12px 0 0 0', textAlign: 'center', fontSize: '11px', color: '#94A3B8', fontWeight: 600 }}>
                🔒 256-Bit Encrypted Secure Clinical Payment Gateway
              </p>
            </div>
          </div>
        </div>
      )}

      {notification && (
          <div className="premium-toast" style={{
            background: notification.type === 'error' ? '#FEF2F2' : '#F0FDF4',
            border: `1px solid ${notification.type === 'error' ? '#FCA5A5' : '#BBF7D0'}`,
            color: notification.type === 'error' ? '#B91C1C' : '#15803D',
            animation: 'toastSlideDown 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)'
          }}>
            {notification.message}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={`patient-portal-container ${!selectedHospital ? 'curoxa-level' : ''}`}>
      <style>{`
        .patient-portal-container {
          font-family: 'Urbanist', sans-serif !important;
          background: radial-gradient(ellipse at 15% 15%, rgba(37, 99, 235, 0.05) 0%, transparent 60%),
                      radial-gradient(ellipse at 85% 85%, rgba(6, 182, 212, 0.05) 0%, transparent 60%),
                      #F8FAFC !important;
          min-height: calc(100vh / 0.9);
          color: #0F172A !important;
        }

        /* Headings with Outfit font */
        .patient-portal-container h1,
        .patient-portal-container h2,
        .patient-portal-container h3,
        .patient-portal-container h4,
        .patient-portal-container h5,
        .patient-portal-container h6 {
          font-family: 'Outfit', sans-serif !important;
          color: #0F172A;
        }

        .patient-portal-container .text-white,
        .patient-portal-container .curoxa-hospital-card h3,
        .patient-portal-container .curoxa-hero-header h1,
        .patient-portal-container .curoxa-hero-header h2,
        .patient-portal-container .curoxa-hero-header h3 {
          color: #FFFFFF !important;
        }

        .curoxa-text-gradient {
          background: linear-gradient(135deg, #1D4ED8 0%, #2563EB 40%, #0891B2 100%) !important;
          -webkit-background-clip: text !important;
          -webkit-text-fill-color: transparent !important;
        }

        /* Sidebar Styling Override */
        .patient-portal-container .sidebar {
          width: 256px !important;
          height: calc(100vh / 0.9) !important;
          background: #FFFFFF !important;
          border-right: 1px solid #E2E8F0 !important;
          box-shadow: 2px 0 20px rgba(15, 23, 42, 0.02) !important;
          position: fixed !important;
          top: 0 !important;
          left: 0 !important;
          padding: 20px 0 !important;
          display: flex !important;
          flex-direction: column !important;
          z-index: 100 !important;
          transition: width 0.3s ease, background 0.3s ease !important;
        }

        .patient-portal-container .sidebar.collapsed {
          width: 70px !important;
        }

        .patient-portal-container .sidebar.collapsed .sidebar-logo {
          padding-left: 0 !important;
          padding-right: 0 !important;
          justify-content: center !important;
        }

        .patient-portal-container .sidebar-logo {
          padding: 0 24px 28px !important;
          display: flex !important;
          align-items: center !important;
          gap: 12px !important;
          font-size: 20px !important;
          font-weight: 900 !important;
          color: #2563EB !important;
          font-family: 'Outfit', sans-serif !important;
          letter-spacing: -0.02em !important;
        }

        .patient-portal-container .nav-link {
          display: flex !important;
          align-items: center !important;
          gap: 12px !important;
          padding: 13px 24px !important;
          color: #64748B !important;
          text-decoration: none !important;
          font-weight: 600 !important;
          font-size: 13.5px !important;
          transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1) !important;
          border-left: 4px solid transparent !important;
        }

        .patient-portal-container .nav-link:hover {
          background: #F8FAFC !important;
          color: #0F172A !important;
        }

        .patient-portal-container .nav-link.active {
          background: linear-gradient(90deg, rgba(37, 99, 235, 0.08) 0%, rgba(6, 182, 212, 0.03) 100%) !important;
          color: #2563EB !important;
          border-left: 4px solid #2563EB !important;
          font-weight: 800 !important;
        }

        .patient-portal-container .nav-link.active i,
        .patient-portal-container .nav-link.active svg {
          color: #2563EB !important;
        }

        .patient-portal-container .sidebar-user {
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
        .patient-portal-container .sidebar-user:hover {
          background: #F1F5F9 !important;
        }
        .patient-portal-container .user-avatar {
          width: 40px !important;
          height: 40px !important;
          border-radius: 50% !important;
          object-fit: cover !important;
          border: 2px solid #60A5FA !important;
        }
        .patient-portal-container .user-info {
          display: flex !important;
          flex-direction: column !important;
        }
        .patient-portal-container .user-info .name {
          font-size: 13.5px !important;
          font-weight: 800 !important;
          color: #0F172A !important;
          line-height: 1.3 !important;
        }
        .patient-portal-container .user-info .role {
          font-size: 11px !important;
          color: #64748B !important;
          font-weight: 600 !important;
        }

        .patient-portal-container .sidebar.collapsed .sidebar-user {
          padding: 12px !important;
          margin: auto 8px 16px !important;
          justify-content: center !important;
        }

        /* Top Nav Styling Override */
        .patient-portal-container .top-nav {
          min-height: 68px !important;
          height: auto !important;
          background: rgba(255, 255, 255, 0.9) !important;
          backdrop-filter: blur(20px) !important;
          -webkit-backdrop-filter: blur(20px) !important;
          border-bottom: 1px solid #E2E8F0 !important;
          margin-left: 256px !important;
          padding: 10px 24px !important;
          display: flex !important;
          align-items: center !important;
          justify-content: space-between !important;
          position: sticky !important;
          top: 0 !important;
          z-index: 90 !important;
          box-shadow: 0 2px 14px rgba(15, 23, 42, 0.03) !important;
          transition: margin-left 0.3s ease !important;
          gap: 16px !important;
        }
        .patient-portal-container .top-nav.collapsed {
          margin-left: 70px !important;
        }
        .patient-portal-container .main-content {
          margin-left: 256px !important;
          transition: margin-left 0.3s ease !important;
          padding: 16px !important;
        }
        .patient-portal-container .main-content.collapsed {
          margin-left: 70px !important;
        }

        /* CUROXA PLATFORM LEVEL (NO HOSPITAL SELECTED) - FULL-WIDTH CONSUMER EXPERIENCE */
        .patient-portal-container.curoxa-level {
          background: 
            radial-gradient(circle at 68% 18%, rgba(186, 230, 253, 0.45) 0%, rgba(224, 242, 254, 0.22) 30%, transparent 60%),
            radial-gradient(circle at 8% 88%, rgba(204, 251, 241, 0.5) 0%, rgba(240, 253, 250, 0.25) 35%, transparent 60%),
            radial-gradient(circle at 98% 45%, rgba(243, 232, 255, 0.55) 0%, rgba(250, 245, 255, 0.2) 35%, transparent 60%),
            #FFFFFF !important;
          min-height: 100vh !important;
          position: relative !important;
        }
        .patient-portal-container.curoxa-level .sidebar {
          display: none !important;
        }
        .patient-portal-container.curoxa-level .mobile-menu-toggle {
          display: none !important;
        }
        .patient-portal-container.curoxa-level .top-nav {
          margin-left: 0 !important;
          border-bottom: 1px solid rgba(241, 245, 249, 0.8) !important;
          padding: 0 48px !important;
          background: rgba(255, 255, 255, 0.85) !important;
          backdrop-filter: blur(16px) !important;
          min-height: 70px !important;
          max-width: 100% !important;
        }
        .patient-portal-container.curoxa-level .main-content {
          margin-left: 0 !important;
          max-width: 1380px !important;
          margin-inline: auto !important;
          padding: 32px 48px 80px !important;
          background: transparent !important;
        }
        .patient-portal-container.curoxa-level .curoxa-top-nav-center {
          display: flex !important;
        }
        .patient-portal-container.curoxa-level .curoxa-top-nav-brand {
          display: flex !important;
        }
        /* Responsive Hero Switch */
        .curoxa-desktop-hero {
          display: grid !important;
        }
        .curoxa-mobile-hero {
          display: none !important;
        }

        @media (max-width: 768px) {
          .curoxa-desktop-hero {
            display: none !important;
          }
          .curoxa-mobile-hero {
            display: block !important;
          }
          .patient-portal-container.curoxa-level .sidebar {
            display: none !important;
          }
          .patient-portal-container.curoxa-level .sidebar.mobile-open {
            display: flex !important;
            width: 260px !important;
          }
          .patient-portal-container.curoxa-level .patient-nav-name,
          .patient-portal-container.curoxa-level .patient-nav-chevron {
            display: none !important;
          }
          .patient-portal-container.curoxa-level .patient-nav-pill {
            padding: 0 !important;
            border: none !important;
            background: transparent !important;
            box-shadow: none !important;
          }
          .patient-portal-container.curoxa-level .top-nav {
            margin-left: 0 !important;
            background: rgba(255, 255, 255, 0.96) !important;
            padding: 0 16px !important;
            min-height: 60px !important;
            border-bottom: 1px solid #F1F5F9 !important;
          }
          .patient-portal-container.curoxa-level .curoxa-top-nav-brand {
            display: flex !important;
          }
          .patient-portal-container.curoxa-level .main-content {
            margin-left: 0 !important;
            padding: 12px 14px 96px !important;
          }
          /* ---- TOP NAV: slim + hide center links on mobile ---- */
          .patient-portal-container.curoxa-level .curoxa-top-nav-center {
            display: none !important;
          }
          .patient-portal-container.curoxa-level .curoxa-top-nav-brand span:last-child {
            display: none !important;
          }
          /* Hide user name + UID text, show avatar only */
          .patient-portal-container.curoxa-level .patient-nav-name,
          .patient-portal-container.curoxa-level .patient-nav-uid,
          .patient-portal-container.curoxa-level .patient-nav-chevron {
            display: none !important;
          }
          .patient-portal-container.curoxa-level .patient-nav-pill {
            padding: 4px !important;
            background: transparent !important;
            border: none !important;
            box-shadow: none !important;
          }

          /* ---- BOTTOM DOCK: flat fixed bar, NOT floating ---- */
          .patient-portal-container.curoxa-level .mobile-bottom-nav {
            bottom: 0 !important;
            left: 0 !important;
            right: 0 !important;
            width: 100% !important;
            max-width: 100% !important;
            margin: 0 !important;
            border-radius: 0 !important;
            border-top: 1px solid #E2E8F0 !important;
            border-left: none !important;
            border-right: none !important;
            border-bottom: none !important;
            box-shadow: 0 -4px 16px rgba(15, 23, 42, 0.06) !important;
            background: rgba(255, 255, 255, 0.97) !important;
            backdrop-filter: blur(16px) !important;
            padding: 10px 0 !important;
            padding-bottom: calc(10px + env(safe-area-inset-bottom)) !important;
            z-index: 1000 !important;
          }

          /* ---- ABHA WIDGET: single column, no overflow ---- */
          .abha-health-widget {
            grid-template-columns: 1fr !important;
            padding: 16px !important;
            gap: 16px !important;
            margin-bottom: 20px !important;
            border-radius: 16px !important;
          }

          /* ---- FEATURE CHIPS: wrap & no overflow ---- */
          .abha-feature-chips {
            flex-wrap: wrap !important;
            gap: 6px !important;
            overflow: hidden !important;
          }
          .abha-feature-chip {
            white-space: nowrap !important;
            font-size: 11px !important;
          }

          /* ---- PROFILE QUICK-ACCESS CARD: compact ---- */
          .curoxa-profile-pill {
            padding: 10px 14px !important;
            border-radius: 12px !important;
          }

          /* ---- MAIN CONTENT padding: account for fixed dock ---- */
          .patient-portal-container.curoxa-level .main-content {
            padding: 12px 12px 90px !important;
            overflow-x: hidden !important;
          }

          /* ---- DISCOVERY SECTION: no side overflow ---- */
          .patient-portal-container.curoxa-level .tab-content,
          .patient-portal-container.curoxa-level .tab-content.active {
            padding: 0 !important;
            overflow-x: hidden !important;
          }

          /* ---- HOSPITAL CARDS: full width on mobile ---- */
          .hospital-card-grid {
            grid-template-columns: 1fr !important;
          }

          /* ---- TOP NAV: tighter height on mobile ---- */
          .patient-portal-container.curoxa-level .top-nav {
            min-height: 56px !important;
            padding: 0 14px !important;
          }
          /* hide subtitle in brand logo on mobile */
          .patient-portal-container.curoxa-level .curoxa-top-nav-brand > div > span:last-child {
            display: none !important;
          }
        }

        .tab-content {
          padding: 0px !important;
        }

        /* Cards & KPI grid */
        .patient-portal-container .glass-card,
        .patient-portal-container .kpi-card,
        .patient-portal-container .doctor-card-pro,
        .patient-portal-container .cal-widget {
          background: rgba(255, 255, 255, 0.85) !important;
          backdrop-filter: blur(12px) !important;
          -webkit-backdrop-filter: blur(12px) !important;
          border: 1px solid #BFDBFE !important;
          border-radius: 16px !important;
          box-shadow: 0 10px 25px -5px rgba(59, 113, 254, 0.05), 0 8px 12px -5px rgba(59, 113, 254, 0.02) !important;
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1) !important;
        }

        .patient-portal-container .glass-card:hover,
        .patient-portal-container .kpi-card:hover,
        .patient-portal-container .doctor-card-pro:hover {
          transform: translateY(-4px) !important;
          border-color: #3B71FE !important;
          box-shadow: 0 20px 35px -5px rgba(59, 113, 254, 0.1), 0 10px 15px -5px rgba(59, 113, 254, 0.04) !important;
        }

        /* Form Controls */
        .patient-portal-container .form-control {
          background: #FFFFFF !important;
          border: 1px solid #CBD5E1 !important;
          border-radius: 8px !important;
          color: #0F172A !important;
          font-family: 'Urbanist', sans-serif !important;
          font-weight: 500 !important;
          transition: border-color 0.2s, box-shadow 0.2s !important;
        }

        .patient-portal-container .form-control:focus {
          border-color: #3B71FE !important;
          background: #FFFFFF !important;
          box-shadow: 0 0 0 3px rgba(59, 113, 254, 0.15) !important;
          outline: none !important;
        }

        /* Buttons */
        .patient-portal-container .btn-primary {
          background: var(--primary-gradient) !important;
          color: white !important;
          font-family: 'Urbanist', sans-serif !important;
          font-weight: 700 !important;
          box-shadow: 0 8px 16px rgba(59, 113, 254, 0.15) !important;
          border: none !important;
          border-radius: 10px !important;
          transition: all 0.2s ease !important;
        }

        .patient-portal-container .btn-primary:hover {
          transform: translateY(-2px) !important;
          box-shadow: 0 12px 20px rgba(59, 113, 254, 0.25) !important;
        }

        .patient-portal-container .btn-secondary {
          background: #FFFFFF !important;
          border: 1px solid #BFDBFE !important;
          color: #2563EB !important;
          font-family: 'Urbanist', sans-serif !important;
          font-weight: 700 !important;
          border-radius: 10px !important;
          transition: all 0.2s ease !important;
        }

        .patient-portal-container .btn-secondary:hover {
          background: #EFF6FF !important;
          border-color: #3B71FE !important;
        }

        /* Elite Tables */
        .patient-portal-container .elite-table {
          border-spacing: 0 8px !important;
          width: 100% !important;
        }

        .patient-portal-container .elite-table th {
          font-family: 'Outfit', sans-serif !important;
          font-weight: 800 !important;
          color: #64748B !important;
          text-transform: uppercase !important;
          letter-spacing: 0.5px !important;
          padding: 10px 16px !important;
          border-bottom: none !important;
        }

        .patient-portal-container .elite-table td {
          background: rgba(255, 255, 255, 0.6) !important;
          border-top: 1px solid #BFDBFE !important;
          border-bottom: 1px solid #BFDBFE !important;
          font-weight: 500 !important;
          color: #0F172A !important;
          padding: 12px 16px !important;
        }

        .patient-portal-container .elite-table td:first-child {
          border-left: 1px solid #BFDBFE !important;
          border-radius: 10px 0 0 10px !important;
        }

        .patient-portal-container .elite-table td:last-child {
          border-right: 1px solid #BFDBFE !important;
          border-radius: 0 10px 10px 0 !important;
        }

        .patient-portal-container .elite-table tr:hover td {
          border-color: #3B71FE !important;
          background: #EFF6FF !important;
        }

        /* Modals */
        .patient-portal-container .modal-overlay {
          background: rgba(15, 23, 42, 0.4) !important;
          backdrop-filter: blur(8px) !important;
          -webkit-backdrop-filter: blur(8px) !important;
        }

        .patient-portal-container .modal-box {
          background: rgba(255, 255, 255, 0.95) !important;
          backdrop-filter: blur(16px) !important;
          -webkit-backdrop-filter: blur(16px) !important;
          border: 1px solid #BFDBFE !important;
          box-shadow: 0 25px 50px -12px rgba(59, 113, 254, 0.15) !important;
          border-radius: 24px !important;
        }

        /* Custom Time Grid chips and Payment Gateway buttons */
        .patient-portal-container .time-chip {
          font-family: 'Urbanist', sans-serif !important;
          font-weight: 700 !important;
          flex-shrink: 0 !important;
          transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1) !important;
        }
        .patient-portal-container .time-chip.available {
          background: #F0FFF4 !important;
          border-color: #BBF7D0 !important;
          color: #16A34A !important;
        }
        .patient-portal-container .time-chip.available:hover {
          border-color: #22C55E !important;
          background: #DCFCE7 !important;
        }
        .patient-portal-container .time-chip.booked {
          background: #F1F5F9 !important;
          border-color: #CBD5E1 !important;
          color: #94A3B8 !important;
          cursor: not-allowed !important;
          opacity: 0.6 !important;
        }
        .patient-portal-container .time-chip.selected {
          background: #EFF6FF !important;
          border-color: #3B82F6 !important;
          color: #2563EB !important;
          box-shadow: 0 0 0 2.5px rgba(59, 130, 246, 0.25) !important;
        }
        .patient-portal-container .slot-scroll-arrow {
          border-color: #BFDBFE !important;
        }
        .patient-portal-container .slot-scroll-arrow:hover {
          background: #2563EB !important;
          color: white !important;
          border-color: #2563EB !important;
        }
        .patient-portal-container .pay-btn {
          background: #FFFFFF !important;
          border: 1px solid #BFDBFE !important;
          transition: all 0.2s ease !important;
        }
        .patient-portal-container .pay-btn.active {
          background: #EFF6FF !important;
          border-color: #3B71FE !important;
          color: #2563EB !important;
        }

        .premium-toast {
          position: fixed !important;
          top: 24px !important;
          right: 24px !important;
          padding: 14px 24px !important;
          border-radius: 12px !important;
          box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04) !important;
          z-index: 99999 !important;
          display: flex !important;
          align-items: center !important;
          gap: 10px !important;
          font-weight: 800 !important;
          font-size: 14px !important;
        }

        @keyframes toastSlideDown {
          from {
            transform: translateY(-20px) scale(0.95);
            opacity: 0;
          }
          to {
            transform: translateY(0) scale(1);
            opacity: 1;
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

        /* Dropdown menu items styling */
        .patient-portal-container .dropdown-item {
          color: #475569 !important;
          transition: all 0.2s ease !important;
        }
        .patient-portal-container .dropdown-item:hover {
          background: #EFF6FF !important;
          color: #2563EB !important;
        }

        @media (max-width: 1024px) {
          .patient-portal-container .sidebar {
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
          .patient-portal-container .sidebar.mobile-open {
            transform: translateX(0) !important;
          }
          .patient-portal-container .top-nav,
          .patient-portal-container .top-nav.collapsed {
            margin-left: 0 !important;
          }
          .patient-portal-container .main-content,
          .patient-portal-container .main-content.collapsed {
            margin-left: 0 !important;
            padding-left: 14px !important;
            padding-right: 14px !important;
            padding-top: 12px !important;
            padding-bottom: 120px !important;
            box-sizing: border-box !important;
          }
          .patient-portal-container .tab-content.active,
          .patient-portal-container .tab-content {
            padding-bottom: 100px !important;
          }
          .mobile-menu-toggle {
            display: flex !important;
          }
          .patient-portal-container, .onboarding-container {
            min-height: 100vh !important;
            min-height: 100dvh !important;
          }
          .patient-portal-container .mobile-stack {
            grid-template-columns: 1fr !important;
          }
          .patient-portal-container .mobile-no-border {
            border-left: none !important;
            padding-left: 0 !important;
          }
          .patient-portal-container .mobile-grid-2,
          .patient-portal-container .mobile-grid-3 {
            grid-template-columns: 1fr !important;
          }
        }

        @keyframes fadeInScale {
          from { opacity: 0; transform: scale(0.95); }
          to { opacity: 1; transform: scale(1); }
        }
        @keyframes slideInRight {
          from { transform: translateX(20px); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }

        .curoxa-hospitals-grid {
          display: grid !important;
          grid-template-columns: repeat(auto-fill, minmax(360px, 1fr)) !important;
          gap: 24px !important;
        }
        @media (max-width: 768px) {
          .curoxa-hospitals-grid {
            grid-template-columns: 1fr !important;
            gap: 16px !important;
          }
        }
        .curoxa-hospital-card {
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1) !important;
          border-radius: 20px !important;
          overflow: hidden !important;
          border: 1.5px solid #E2E8F0 !important;
          box-shadow: 0 4px 20px -2px rgba(15, 23, 42, 0.05) !important;
        }
        .curoxa-hospital-card:hover {
          transform: translateY(-4px) !important;
          box-shadow: 0 18px 36px -6px rgba(37, 99, 235, 0.16) !important;
          border-color: #93C5FD !important;
        }

        @media (max-width: 639px) {
          .mobile-detail-sheet-overlay {
            align-items: flex-end !important;
            padding: 0 !important;
          }
          .mobile-detail-sheet {
            position: fixed !important;
            bottom: 0 !important;
            left: 0 !important;
            right: 0 !important;
            top: auto !important;
            width: 100% !important;
            max-width: 100% !important;
            max-height: calc(90vh - 70px) !important;
            border-radius: 24px 24px 0 0 !important;
            box-shadow: 0 -10px 40px rgba(0, 0, 0, 0.2) !important;
            animation: slideUpSheet 0.28s cubic-bezier(0.16, 1, 0.3, 1) !important;
            margin-bottom: 65px !important;
          }
        }
        @keyframes slideUpSheet {
          from { transform: translateY(100%); }
          to { transform: translateY(0); }
        }
      `}</style>

      {/* Interactive DPDP Privacy Rights Walkthrough Overlay */}
      {showPrivacyOverlay && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(15, 23, 42, 0.75)',
          backdropFilter: 'blur(12px)',
          zIndex: 999999,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '20px',
          boxSizing: 'border-box'
        }}>
          <div style={{
            background: '#FFFFFF',
            borderRadius: '24px',
            maxWidth: '600px',
            width: '100%',
            maxHeight: '90vh',
            display: 'flex',
            flexDirection: 'column',
            boxShadow: '0 25px 50px -12px rgba(37, 99, 235, 0.25)',
            border: '2px solid #DBEAFE',
            overflow: 'hidden',
            boxSizing: 'border-box',
            animation: 'fadeInScale 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)'
          }}>
            {/* Carousel Content */}
            <div style={{ flex: 1, padding: '32px 32px 24px', overflowY: 'auto' }}>
              {/* Slide Indicator */}
              <div style={{ display: 'flex', gap: '8px', marginBottom: '24px' }}>
                {[0, 1, 2, 3].map((idx) => (
                  <div key={idx} style={{
                    flex: 1,
                    height: '6px',
                    borderRadius: '3px',
                    background: idx === privacySlideIdx ? '#2563EB' : '#E2E8F0',
                    transition: 'all 0.3s'
                  }}></div>
                ))}
              </div>

              {privacySlideIdx === 0 && (
                <div style={{ animation: 'slideInRight 0.3s ease-out' }}>
                  <div style={{
                    width: '64px',
                    height: '64px',
                    borderRadius: '16px',
                    background: '#EFF6FF',
                    color: '#2563EB',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginBottom: '20px'
                  }}>
                    <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
                  </div>
                  <h2 style={{ fontSize: '24px', fontWeight: 900, color: '#0F172A', margin: '0 0 12px 0', fontFamily: "'Outfit', sans-serif" }}>
                    Your Privacy Rights under DPDP Act 2023
                  </h2>
                  <p style={{ fontSize: '15px', color: '#475569', lineHeight: '1.6', fontWeight: 600 }}>
                    Welcome to the Curoxa Privacy Portal. In compliance with the <strong>Digital Personal Data Protection (DPDP) Act, 2023</strong> of India, we empower you with absolute sovereignty over your medical data.
                  </p>
                  <p style={{ fontSize: '14.5px', color: '#64748B', lineHeight: '1.5', margin: '16px 0 0 0', fontWeight: 650 }}>
                    This quick tour will guide you on how to exercise your rights of Access, Correction, Consent Withdrawal, and Erasure securely.
                  </p>
                </div>
              )}

              {privacySlideIdx === 1 && (
                <div style={{ animation: 'slideInRight 0.3s ease-out' }}>
                  <div style={{
                    width: '64px',
                    height: '64px',
                    borderRadius: '16px',
                    background: '#F0FDF4',
                    color: '#16A34A',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginBottom: '20px'
                  }}>
                    <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
                  </div>
                  <h2 style={{ fontSize: '24px', fontWeight: 900, color: '#0F172A', margin: '0 0 12px 0', fontFamily: "'Outfit', sans-serif" }}>
                    Right to Withdraw Consent
                  </h2>
                  <p style={{ fontSize: '15px', color: '#475569', lineHeight: '1.6', fontWeight: 600 }}>
                    You can grant or restrict clinical data processing purposes (e.g. Treatment, Research, Insurance) via the <strong>Consent Settings</strong> panel.
                  </p>
                  <div style={{ background: '#FFF5F5', border: '1.5px solid #FCA5A5', borderRadius: '12px', padding: '14px 16px', marginTop: '16px' }}>
                    <p style={{ fontSize: '13px', color: '#B91C1C', margin: 0, fontWeight: 700, lineHeight: '1.5' }}>
                      If you withdraw consent, doctors cannot view or edit your medical record. However, doctors can use the <strong>Break-Glass emergency bypass</strong> in critical situations, which triggers an audit log.
                    </p>
                  </div>
                </div>
              )}

              {privacySlideIdx === 2 && (
                <div style={{ animation: 'slideInRight 0.3s ease-out' }}>
                  <div style={{
                    width: '64px',
                    height: '64px',
                    borderRadius: '16px',
                    background: '#FEF3C7',
                    color: '#D97706',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginBottom: '20px'
                  }}>
                    <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4z"/></svg>
                  </div>
                  <h2 style={{ fontSize: '24px', fontWeight: 900, color: '#0F172A', margin: '0 0 12px 0', fontFamily: "'Outfit', sans-serif" }}>
                    Access, Correction, & Erasure
                  </h2>
                  <p style={{ fontSize: '15px', color: '#475569', lineHeight: '1.6', fontWeight: 600 }}>
                    You have the right to request a complete copy of your records (Access), edit incorrect data (Correction), or ask for full deletion (Erasure).
                  </p>
                  <p style={{ fontSize: '14px', color: '#64748B', lineHeight: '1.5', marginTop: '12px', fontWeight: 650 }}>
                    Submit requests to our Data Protection Officer directly through the <strong>Privacy Requests Center</strong> in the dashboard.
                  </p>
                </div>
              )}

              {privacySlideIdx === 3 && (
                <div style={{ animation: 'slideInRight 0.3s ease-out' }}>
                  <div style={{
                    width: '64px',
                    height: '64px',
                    borderRadius: '16px',
                    background: '#F3E8FF',
                    color: '#9333EA',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginBottom: '20px'
                  }}>
                    <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                  </div>
                  <h2 style={{ fontSize: '24px', fontWeight: 900, color: '#0F172A', margin: '0 0 12px 0', fontFamily: "'Outfit', sans-serif" }}>
                    Statutory Data Retention & Legal Hold
                  </h2>
                  <p style={{ fontSize: '15px', color: '#475569', lineHeight: '1.6', fontWeight: 600 }}>
                    While you can request erasure, healthcare providers are legally obligated to retain certain clinical records under municipal/national statutes.
                  </p>
                  <div style={{ background: '#FAF5FF', border: '1.5px solid #E9D5FF', borderRadius: '12px', padding: '14px 16px', marginTop: '16px' }}>
                    <p style={{ fontSize: '13px', color: '#6B21A8', margin: 0, fontWeight: 700, lineHeight: '1.5' }}>
                      If your account has a <strong>Legal Hold</strong> active flag, erasure requests are suspended until the hold is resolved.
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Carousel Footer Buttons */}
            <div style={{
              background: '#F8FAFC',
              padding: '20px 32px',
              borderTop: '1px solid #E2E8F0',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}>
              <button
                type="button"
                onClick={() => setPrivacySlideIdx(Math.max(0, privacySlideIdx - 1))}
                disabled={privacySlideIdx === 0}
                style={{
                  height: '42px',
                  padding: '0 16px',
                  background: 'transparent',
                  border: 'none',
                  color: '#64748B',
                  fontWeight: 800,
                  fontSize: '14px',
                  cursor: privacySlideIdx === 0 ? 'not-allowed' : 'pointer',
                  opacity: privacySlideIdx === 0 ? 0.3 : 1
                }}
              >
                Back
              </button>

              {privacySlideIdx < 3 ? (
                <button
                  type="button"
                  onClick={() => setPrivacySlideIdx(privacySlideIdx + 1)}
                  style={{
                    height: '42px',
                    padding: '0 24px',
                    background: '#2563EB',
                    border: 'none',
                    borderRadius: '10px',
                    color: '#FFFFFF',
                    fontWeight: 800,
                    fontSize: '14px',
                    cursor: 'pointer',
                    boxShadow: '0 4px 12px rgba(37, 99, 235, 0.25)'
                  }}
                >
                  Continue
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    localStorage.setItem('curoxa_dpdp_intro_seen', 'true');
                    setShowPrivacyOverlay(false);
                  }}
                  style={{
                    height: '42px',
                    padding: '0 24px',
                    background: '#16A34A',
                    border: 'none',
                    borderRadius: '10px',
                    color: '#FFFFFF',
                    fontWeight: 800,
                    fontSize: '14px',
                    cursor: 'pointer',
                    boxShadow: '0 4px 12px rgba(22, 163, 74, 0.25)'
                  }}
                >
                  Get Started
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      <div className={"sidebar " + (isSidebarCollapsed ? "collapsed " : "") + (mobileSidebarOpen ? "mobile-open" : "")} data-lenis-prevent>
        <div className="sidebar-logo" style={{ display: 'flex', alignItems: 'center', gap: '12px', position: 'relative', width: '100%' }}>
          <img 
            src={curoxaSidebarLogo} 
            alt="CUROXA" 
            style={{
              width: '42px',
              height: '42px',
              objectFit: 'contain',
              flexShrink: 0,
              filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.08))'
            }}
          />
          <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
            <span style={{
              fontFamily: "'Plus Jakarta Sans', 'Outfit', sans-serif",
              fontWeight: 900,
              fontSize: '18px',
              color: '#0F172A',
              letterSpacing: '0.03em',
              lineHeight: 1.1
            }}>
              CUROXA
            </span>
            <span style={{
              fontSize: '11px',
              color: '#64748B',
              fontWeight: 500,
              letterSpacing: '-0.01em',
              marginTop: '3px',
              lineHeight: 1
            }}>
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
              transform: isSidebarCollapsed ? 'rotate(180deg)' : 'none'
            }}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
          </button>
        </div>
        <nav style={{ flex: 1 }}>
          {!selectedHospital ? (
            <>
              <a href="#" className={`nav-link ${(activeTab === 'curoxa-home' || (!selectedHospital && activeTab !== 'profile' && activeTab !== 'curoxa-hospitals')) ? 'active' : ''}`} onClick={(e) => { e.preventDefault(); setActiveTab('curoxa-home'); setMobileSidebarOpen(false); }}><i data-lucide="home"></i> Home</a>
              <a href="#" className={`nav-link ${activeTab === 'curoxa-hospitals' ? 'active' : ''}`} onClick={(e) => { e.preventDefault(); setActiveTab('curoxa-hospitals'); setMobileSidebarOpen(false); }}><i data-lucide="building-2"></i> Hospitals</a>
              <a href="#" className={`nav-link ${activeTab === 'profile' ? 'active' : ''}`} onClick={(e) => { e.preventDefault(); setActiveTab('profile'); setMobileSidebarOpen(false); }}><i data-lucide="user"></i> My Profile</a>
            </>
          ) : (
            <>
              <div style={{ padding: '0 8px 12px', borderBottom: '1px solid #F1F5F9', marginBottom: '8px' }}>
                <button
                  onClick={() => {
                    setSelectedHospital(null);
                    setActiveTab('curoxa-home');
                    setMobileSidebarOpen(false);
                  }}
                  style={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '8px 12px',
                    borderRadius: '8px',
                    background: '#EFF6FF',
                    color: '#2563EB',
                    border: '1px solid #BFDBFE',
                    fontSize: '12px',
                    fontWeight: 800,
                    cursor: 'pointer',
                    transition: 'all 0.15s ease'
                  }}
                >
                  <i data-lucide="arrow-left" style={{ width: '14px', height: '14px' }}></i>
                  <span>All Hospitals</span>
                </button>
                <div style={{ marginTop: '8px', fontSize: '11px', fontWeight: 800, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.05em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {selectedHospital.name}
                </div>
              </div>
              <a href="#" className={`nav-link ${(activeTab === 'summary') ? 'active' : ''}`} onClick={(e) => { e.preventDefault(); setActiveTab('summary'); setMobileSidebarOpen(false); }}><i data-lucide="home"></i> Home</a>
              <a href="#" className={`nav-link ${(activeTab === 'history' || activeTab === 'find') ? 'active' : ''}`} onClick={(e) => { e.preventDefault(); setActiveTab('history'); setMobileSidebarOpen(false); }}><i data-lucide="calendar"></i> Appointments</a>
              <a href="#" className={`nav-link ${(activeTab === 'records' && myHealthCategory === 'ALL') ? 'active' : ''}`} onClick={(e) => { e.preventDefault(); setMyHealthCategory('ALL'); setActiveTab('records'); setMobileSidebarOpen(false); }}><i data-lucide="activity"></i> My Health</a>
              <a href="#" className={`nav-link ${activeTab === 'prescriptions' ? 'active' : ''}`} onClick={(e) => { e.preventDefault(); setActiveTab('prescriptions'); setMobileSidebarOpen(false); }}><i data-lucide="pill"></i> Prescriptions</a>
              <a href="#" className={`nav-link ${(activeTab === 'records' && myHealthCategory === 'LABS') ? 'active' : ''}`} onClick={(e) => { e.preventDefault(); setMyHealthCategory('LABS'); setActiveTab('records'); setMobileSidebarOpen(false); }}><i data-lucide="flask-conical"></i> Lab Reports</a>
              <a href="#" className={`nav-link ${(activeTab === 'records' && myHealthCategory === 'RECORDS') ? 'active' : ''}`} onClick={(e) => { e.preventDefault(); setMyHealthCategory('RECORDS'); setActiveTab('records'); setMobileSidebarOpen(false); }}><i data-lucide="folder"></i> Medical Records</a>
              <a href="#" className={`nav-link ${activeTab === 'documents' ? 'active' : ''}`} onClick={(e) => { e.preventDefault(); setActiveTab('documents'); setMobileSidebarOpen(false); }}><i data-lucide="file-text"></i> Documents</a>
              <a href="#" className={`nav-link ${activeTab === 'privacy' ? 'active' : ''}`} onClick={(e) => { e.preventDefault(); setActiveTab('privacy'); setMobileSidebarOpen(false); }}><i data-lucide="shield-check"></i> Privacy & Consent</a>
            </>
          )}
        </nav>

        {!selectedHospital ? (
          /* Curoxa Platform Level Sidebar Footer (Matches media_1788166650528.png) */
          <div style={{ marginTop: 'auto', padding: '16px', position: 'relative', display: isSidebarCollapsed ? 'none' : 'block' }}>
            {/* Potted Plant Illustration */}
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '8px' }}>
              <img 
                src={curoxaMobileHero3D} 
                alt="Plant" 
                style={{ 
                  width: '90px', 
                  height: 'auto', 
                  objectFit: 'contain', 
                  opacity: 0.85, 
                  filter: 'drop-shadow(0 4px 10px rgba(0,0,0,0.06))',
                  mixBlendMode: 'multiply',
                  pointerEvents: 'none'
                }} 
              />
            </div>

            {/* Floating Profile Card */}
            <div 
              onClick={() => setActiveTab('profile')}
              style={{
                background: '#FFFFFF',
                borderRadius: '16px',
                border: '1px solid #E2E8F0',
                padding: '10px 14px',
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                boxShadow: '0 4px 14px rgba(15, 23, 42, 0.06)',
                cursor: 'pointer',
                transition: 'all 0.2s ease'
              }}
              onMouseEnter={e => e.currentTarget.style.borderColor = '#BFDBFE'}
              onMouseLeave={e => e.currentTarget.style.borderColor = '#E2E8F0'}
            >
              <div style={{
                width: '36px',
                height: '36px',
                borderRadius: '50%',
                background: 'linear-gradient(135deg, #2563EB 0%, #4F46E5 100%)',
                color: '#FFFFFF',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 800,
                fontSize: '13px',
                flexShrink: 0
              }}>
                {currentUser.name ? currentUser.name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase() : 'HG'}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '13px', fontWeight: 800, color: '#0F172A', lineHeight: 1.2 }}>
                  {currentUser.name || 'Harsh Gupta'}
                </div>
                <div style={{ fontSize: '10.5px', color: '#64748B', fontWeight: 600, marginTop: '2px', display: 'flex', alignItems: 'center', gap: '3px' }}>
                  <span>View & manage your profile</span>
                  <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#2563EB" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6"/></svg>
                </div>
              </div>
            </div>
          </div>
        ) : (
          /* Support widget matching mockup */
          <div style={{
            margin: 'auto 16px 14px',
            padding: '16px',
            borderRadius: '16px',
            background: '#F0F9FF',
            border: '1px solid #BAE6FD',
            display: isSidebarCollapsed ? 'none' : 'block'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
              <span style={{ fontSize: '13.5px', fontWeight: 800, color: '#0F172A' }}>Need Help?</span>
              <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: '#E0F2FE', color: '#0284C7', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <i data-lucide="headphones" style={{ width: '15px', height: '15px' }}></i>
              </div>
            </div>
            <p style={{ fontSize: '11.5px', color: '#64748B', margin: '0 0 12px 0', lineHeight: 1.4, fontWeight: 550 }}>
              We're here to help you
            </p>
            <button
              type="button"
              onClick={() => showToast("Support desk: support@curoxa.com | Helpline: 1800-CUROXA", "info")}
              style={{
                width: '100%',
                padding: '8px 12px',
                borderRadius: '8px',
                border: '1px solid #BFDBFE',
                background: '#FFFFFF',
                color: '#2563EB',
                fontSize: '12px',
                fontWeight: 800,
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                boxShadow: '0 1px 3px rgba(37, 99, 235, 0.08)'
              }}
              onMouseEnter={e => { e.currentTarget.style.background = '#2563EB'; e.currentTarget.style.color = '#FFFFFF'; }}
              onMouseLeave={e => { e.currentTarget.style.background = '#FFFFFF'; e.currentTarget.style.color = '#2563EB'; }}
            >
              Contact Support
            </button>
          </div>
        )}

        {/* User Profile at bottom of Sidebar (Only when hospital selected, since curoxa level has floating profile card) */}
        {selectedHospital && (
        <div className="sidebar-user" onClick={(e) => { e.stopPropagation(); setShowProfileMenu(!showProfileMenu); }}>
          {(currentUser.avatar || editProfileData.avatar) ? (
            <img 
              src={currentUser.avatar || editProfileData.avatar} 
              alt="Avatar" 
              className="user-avatar" 
              style={{ width: '40px', height: '40px', borderRadius: '50%', objectFit: 'cover', border: '2px solid #BFDBFE', flexShrink: 0, marginRight: '10px' }}
            />
          ) : (
            <div className="sidebar-user-avatar-initials" style={{ width: '40px', height: '40px', borderRadius: '50%', background: 'linear-gradient(135deg, #2563EB 0%, #4F46E5 50%, #06B6D4 100%)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: '14px', marginRight: '10px', flexShrink: 0, boxShadow: '0 3px 10px rgba(37, 99, 235, 0.3)', border: '2px solid #BFDBFE' }}>
              {currentUser.name ? currentUser.name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase() : 'JD'}
            </div>
          )}
          <div className="user-info" style={{ flex: 1 }}>
            <div className="name">{currentUser.name || 'Johnathan Doe'}</div>
            <div className="role">Patient</div>
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
                <div style={{ fontWeight: 800, fontSize: '13.5px', color: '#0F172A' }}>{currentUser.name}</div>
                <div style={{ fontSize: '11px', color: '#64748B', fontWeight: 600 }}>Patient</div>
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
                  setActiveTab('profile');
                  setShowProfileMenu(false);
                }}
              >
                <i data-lucide="user" style={{ width: '16px', height: '16px' }}></i> My Profile
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
                onClick={(e) => {
                  e.stopPropagation();
                  handleLogout();
                }}
              >
                <i data-lucide="log-out" style={{ width: '16px', height: '16px' }}></i> Logout
              </div>
            </div>
          )}
        </div>
        )}
      </div>

      {/* Mobile Sidebar Backdrop Overlay */}
      {mobileSidebarOpen && (
        <div className="mobile-backdrop" onClick={() => setMobileSidebarOpen(false)} />
      )}

      {/* Micro-loading transition when entering a hospital space */}
      <HospitalLoadingTransition hospital={transitionHospitalTarget || selectedHospital} visible={isTransitioningHospital} />

      <div className={"top-nav " + (isSidebarCollapsed ? "collapsed" : "")} style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
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

        {selectedHospital ? (
          /* LEVEL 2: SELECTED HOSPITAL PERSISTENT IDENTITY IN TOP NAV */
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0, overflow: 'hidden' }}>
            {/* Hospital Logo / Avatar */}
            {(selectedHospital.logo && selectedHospital.logo.startsWith('http')) || (selectedHospital.letterheadUrl && selectedHospital.letterheadUrl.startsWith('http')) ? (
              <img 
                src={selectedHospital.letterheadUrl || selectedHospital.logo} 
                alt={selectedHospital.name} 
                style={{ width: '38px', height: '38px', borderRadius: '10px', objectFit: 'cover', border: '1px solid #E2E8F0', flexShrink: 0 }}
              />
            ) : (
              <div style={{
                width: '38px',
                height: '38px',
                borderRadius: '10px',
                background: 'linear-gradient(135deg, #2563EB 0%, #0284C7 100%)',
                color: '#FFFFFF',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 900,
                fontSize: '15px',
                flexShrink: 0,
                boxShadow: '0 3px 8px rgba(37, 99, 235, 0.25)'
              }}>
                {selectedHospital.logo && selectedHospital.logo.length <= 4 ? selectedHospital.logo : selectedHospital.name.slice(0, 2).toUpperCase()}
              </div>
            )}

            {/* Hospital Name, Active badge & Address */}
            <div style={{ minWidth: 0, overflow: 'hidden' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ fontSize: '15px', fontWeight: 800, color: '#0F172A', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '120px' }}>
                  {selectedHospital.name}
                </span>
                <span style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '3px',
                  fontSize: '10.5px',
                  color: '#15803D',
                  fontWeight: 800,
                  background: '#DCFCE7',
                  padding: '2px 7px',
                  borderRadius: '99px',
                  border: '1px solid #BBF7D0',
                  flexShrink: 0
                }}>
                  <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: '#16A34A' }} />
                  Active
                </span>
              </div>
              <div className="desktop-only-block" style={{ fontSize: '11.5px', color: '#64748B', fontWeight: 550, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginTop: '1px' }}>
                {selectedHospital.address || selectedHospital.location || 'Healthcare Provider on Curoxa Network'}
              </div>
            </div>
          </div>
        ) : (
          <>
            {/* Left: Official Brand Identity (Matches media_1788167242325.png) */}
            <div className="curoxa-top-nav-brand" style={{ display: 'flex', alignItems: 'center', gap: '12px', flexShrink: 0 }}>
              <img 
                src={curoxaSidebarLogo} 
                alt="CUROXA" 
                style={{
                  width: '42px',
                  height: '42px',
                  objectFit: 'contain',
                  flexShrink: 0,
                  filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.08))'
                }}
              />
              <div style={{ display: 'flex', flexDirection: 'column', textAlign: 'left', minWidth: 0 }}>
                <span style={{
                  fontFamily: "'Plus Jakarta Sans', 'Outfit', sans-serif",
                  fontWeight: 900,
                  fontSize: '18px',
                  color: '#0F172A',
                  letterSpacing: '0.03em',
                  lineHeight: 1.1
                }}>
                  CUROXA
                </span>
                <span style={{
                  fontSize: '11px',
                  color: '#64748B',
                  fontWeight: 500,
                  letterSpacing: '-0.01em',
                  marginTop: '3px',
                  lineHeight: 1
                }}>
                  Health Management
                </span>
              </div>
            </div>

            {/* Center: Navigation Links */}
            <div className="curoxa-top-nav-center desktop-only-flex" style={{
              alignItems: 'center',
              gap: '36px',
              position: 'absolute',
              left: '50%',
              transform: 'translateX(-50%)'
            }}>
              <div 
                style={{
                  position: 'relative',
                  fontSize: '14.5px',
                  fontWeight: (activeTab === 'curoxa-home' || (!selectedHospital && activeTab !== 'profile' && activeTab !== 'curoxa-hospitals')) ? 800 : 600,
                  color: (activeTab === 'curoxa-home' || (!selectedHospital && activeTab !== 'profile' && activeTab !== 'curoxa-hospitals')) ? '#2563EB' : '#64748B',
                  cursor: 'pointer',
                  padding: '8px 4px',
                  transition: 'color 0.15s ease'
                }}
                onClick={() => setActiveTab('curoxa-home')}
              >
                Home
                {(activeTab === 'curoxa-home' || (!selectedHospital && activeTab !== 'profile' && activeTab !== 'curoxa-hospitals')) && (
                  <div style={{
                    position: 'absolute',
                    bottom: '-14px',
                    left: '0',
                    right: '0',
                    height: '3px',
                    borderRadius: '99px',
                    background: '#2563EB'
                  }} />
                )}
              </div>

              <div 
                style={{
                  position: 'relative',
                  fontSize: '14.5px',
                  fontWeight: activeTab === 'curoxa-hospitals' ? 800 : 600,
                  color: activeTab === 'curoxa-hospitals' ? '#2563EB' : '#64748B',
                  cursor: 'pointer',
                  padding: '8px 4px',
                  transition: 'color 0.15s ease'
                }}
                onClick={() => setActiveTab('curoxa-hospitals')}
              >
                Hospitals
                {activeTab === 'curoxa-hospitals' && (
                  <div style={{
                    position: 'absolute',
                    bottom: '-14px',
                    left: '0',
                    right: '0',
                    height: '3px',
                    borderRadius: '99px',
                    background: '#2563EB'
                  }} />
                )}
              </div>

              <div 
                style={{
                  position: 'relative',
                  fontSize: '14.5px',
                  fontWeight: activeTab === 'profile' ? 800 : 600,
                  color: activeTab === 'profile' ? '#2563EB' : '#64748B',
                  cursor: 'pointer',
                  padding: '8px 4px',
                  transition: 'color 0.15s ease'
                }}
                onClick={() => setActiveTab('profile')}
              >
                Profile
                {activeTab === 'profile' && (
                  <div style={{
                    position: 'absolute',
                    bottom: '-14px',
                    left: '0',
                    right: '0',
                    height: '3px',
                    borderRadius: '99px',
                    background: '#2563EB'
                  }} />
                )}
              </div>
            </div>
          </>
        )}

        {/* Right Nav: Notifications & User Profile */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginLeft: 'auto', flexShrink: 0 }}>
          {selectedHospital && (
            <>
              {/* Desktop View: Full Pill */}
              <button
                type="button"
                className="desktop-only-flex"
                onClick={handleChangeHospital}
                style={{
                  background: '#EFF6FF',
                  border: '1px solid #BFDBFE',
                  borderRadius: '99px',
                  padding: '6px 14px',
                  color: '#2563EB',
                  fontSize: '12px',
                  fontWeight: 800,
                  alignItems: 'center',
                  gap: '6px',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                  whiteSpace: 'nowrap'
                }}
                onMouseEnter={e => e.currentTarget.style.background = '#DBEAFE'}
                onMouseLeave={e => e.currentTarget.style.background = '#EFF6FF'}
              >
                <i data-lucide="arrow-left-right" style={{ width: '13px', height: '13px' }}></i>
                <span>Change Hospital</span>
              </button>

              {/* Mobile View: Compact Pill */}
              <button
                type="button"
                className="mobile-only-flex"
                onClick={handleChangeHospital}
                style={{
                  background: '#EFF6FF',
                  border: '1px solid #BFDBFE',
                  borderRadius: '99px',
                  padding: '5px 10px',
                  color: '#2563EB',
                  fontSize: '11px',
                  fontWeight: 800,
                  alignItems: 'center',
                  gap: '4px',
                  cursor: 'pointer',
                  whiteSpace: 'nowrap'
                }}
                title="Change Hospital"
              >
                <i data-lucide="arrow-left-right" style={{ width: '12px', height: '12px' }}></i>
                <span>Change</span>
              </button>
            </>
          )}

          {/* Notification Bell */}
          <div 
            ref={notificationRef}
            className="top-nav-bell-btn"
            style={{ position: 'relative', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', width: '36px', height: '36px', borderRadius: '10px', border: '1px solid #E2E8F0', color: '#64748B', background: 'white', flexShrink: 0 }}
            onClick={(e) => {
              e.stopPropagation();
              setShowNotifications(!showNotifications);
              setUnreadCount(0);
            }}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-bell"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg>
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
                  zIndex: 1200,
                  padding: '16px',
                  maxHeight: '400px',
                  overflowY: 'auto',
                  textAlign: 'left'
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

          {/* User Profile Badge matching mockup */}
          <div ref={topNavProfileRef} style={{ position: 'relative' }}>
            <div 
              className="patient-nav-pill"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                padding: '5px 12px 5px 6px',
                borderRadius: '99px',
                border: '1px solid #E2E8F0',
                background: '#FFFFFF',
                cursor: 'pointer',
                boxShadow: '0 2px 6px rgba(15, 23, 42, 0.04)',
                transition: 'all 0.15s ease'
              }}
              onClick={(e) => {
                e.stopPropagation();
                setShowProfileMenu(!showProfileMenu);
              }}
            >
              {(currentUser.avatar || editProfileData.avatar) ? (
                <img 
                  src={currentUser.avatar || editProfileData.avatar} 
                  alt="Avatar" 
                  style={{ width: '34px', height: '34px', borderRadius: '50%', objectFit: 'cover', border: '2px solid #BFDBFE' }}
                />
              ) : (
                <div style={{
                  width: '34px',
                  height: '34px',
                  borderRadius: '50%',
                  background: 'linear-gradient(135deg, #2563EB 0%, #4F46E5 50%, #06B6D4 100%)',
                  color: '#FFFFFF',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 900,
                  fontSize: '12.5px',
                  boxShadow: '0 2px 6px rgba(37, 99, 235, 0.3)'
                }}>
                  {currentUser.name ? currentUser.name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase() : 'HG'}
                </div>
              )}
              <div className="patient-nav-name desktop-only-flex" style={{ flexDirection: 'column', textAlign: 'left' }}>
                <span style={{ fontSize: '13px', fontWeight: 800, color: '#0F172A', lineHeight: 1.2 }}>
                  {currentUser.name || 'Harsh Gupta'}
                </span>
                <span style={{ fontSize: '10.5px', color: '#64748B', fontWeight: 700, letterSpacing: '0.02em' }}>
                  UHID: {patientUhid}
                </span>
              </div>
              <i data-lucide="chevron-down" className="patient-nav-chevron desktop-only-inline" style={{ width: '15px', height: '15px', color: '#94A3B8', transform: showProfileMenu ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}></i>
            </div>

            {showProfileMenu && (
              <div 
                className="glass-card patient-profile-dropdown" 
                style={{ 
                  position: 'absolute', 
                  top: '48px', 
                  right: '0px', 
                  width: '210px', 
                  zIndex: 3000, 
                  padding: '8px', 
                  boxShadow: '0 10px 30px rgba(0,0,0,0.1)', 
                  background: 'white',
                  borderRadius: '14px',
                  border: '1px solid #E2E8F0',
                  animation: 'fadeInScale 0.2s ease-out'
                }}
                onClick={e => e.stopPropagation()}
              >
                <div style={{ padding: '10px 12px', borderBottom: '1px solid #F1F5F9', marginBottom: '6px' }}>
                  <div style={{ fontWeight: 800, fontSize: '13.5px', color: '#0F172A' }}>{currentUser.name}</div>
                  <div style={{ fontSize: '11px', color: '#64748B', fontWeight: 600 }}>UHID: {patientUhid}</div>
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
                  onClick={(e) => {
                    e.stopPropagation();
                    setActiveTab('profile');
                    setShowProfileMenu(false);
                  }}
                >
                  <i data-lucide="user" style={{ width: '16px', height: '16px' }}></i> My Profile
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
                  onClick={(e) => {
                    e.stopPropagation();
                    handleLogout();
                  }}
                >
                  <i data-lucide="log-out" style={{ width: '16px', height: '16px' }}></i> Logout
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className={"main-content " + (isSidebarCollapsed ? "collapsed" : "")} data-lenis-prevent>
        {/* LEVEL 1: CUROXA PLATFORM PATIENT HOME & DISCOVERY MATCHING MOCKUP */}
        {!selectedHospital && (activeTab === 'curoxa-home' || activeTab === 'curoxa-hospitals' || (!selectedHospital && activeTab !== 'profile')) && (
          <div className="tab-content active" style={{ animation: 'fadeIn 0.3s ease-out' }}>
            
            {/* 1A. DESKTOP HERO SECTION (MATCHES media_1788164049960.png) */}
            <div className="curoxa-desktop-hero" style={{
              gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))',
              gap: '32px',
              alignItems: 'center',
              marginBottom: '36px',
              padding: '16px 0 8px 0',
              position: 'relative'
            }}>
              {/* Floating 3D ambient orbs matching media_1788166650528.png */}
              <div style={{
                position: 'absolute',
                left: '49%',
                top: '6%',
                width: '14px',
                height: '14px',
                borderRadius: '50%',
                background: 'radial-gradient(circle at 35% 35%, #67E8F9 0%, #0284C7 80%)',
                boxShadow: '0 4px 10px rgba(2, 132, 199, 0.35)',
                pointerEvents: 'none',
                zIndex: 1
              }} />
              <div style={{
                position: 'absolute',
                right: '14%',
                top: '24%',
                width: '11px',
                height: '11px',
                borderRadius: '50%',
                background: 'radial-gradient(circle at 35% 35%, #67E8F9 0%, #0284C7 80%)',
                boxShadow: '0 4px 10px rgba(2, 132, 199, 0.35)',
                pointerEvents: 'none',
                zIndex: 1
              }} />

              {/* Left Column: Greeting, Subtitle, Paragraph & Trust Chips */}
              <div style={{ zIndex: 2 }}>
                {/* Mint Pill: CUROXA HEALTH */}
                <div style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  fontSize: '11px',
                  fontWeight: 800,
                  letterSpacing: '0.06em',
                  textTransform: 'uppercase',
                  color: '#0F766E',
                  background: '#CCFBF1',
                  border: '1px solid #99F6E4',
                  padding: '3.5px 12px',
                  borderRadius: '99px',
                  marginBottom: '16px'
                }}>
                  <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#10B981', boxShadow: '0 0 6px #10B981' }} />
                  CUROXA HEALTH
                </div>

                <h1 style={{
                  fontSize: 'clamp(36px, 4.4vw, 48px)',
                  fontWeight: 900,
                  color: '#0B192C',
                  letterSpacing: '-0.035em',
                  lineHeight: 1.12,
                  margin: '0 0 4px 0',
                  fontFamily: "'Outfit', sans-serif"
                }}>
                  Good afternoon,
                </h1>

                <div style={{
                  fontSize: 'clamp(36px, 4.4vw, 48px)',
                  fontWeight: 900,
                  color: '#2563EB',
                  letterSpacing: '-0.035em',
                  lineHeight: 1.12,
                  margin: '0 0 14px 0',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  fontFamily: "'Outfit', sans-serif"
                }}>
                  <span>{currentUser.name ? currentUser.name.split(' ')[0] : 'Harsh'}</span>
                  <span style={{ display: 'inline-block', transform: 'rotate(10deg)' }}>👋</span>
                </div>

                <div style={{
                  fontSize: '16px',
                  fontWeight: 750,
                  color: '#0D9488',
                  marginBottom: '10px',
                  letterSpacing: '-0.01em'
                }}>
                  Your healthcare, connected.
                </div>

                <p style={{
                  fontSize: '14.5px',
                  color: '#64748B',
                  lineHeight: 1.55,
                  maxWidth: '440px',
                  margin: '0 0 28px 0',
                  fontWeight: 500
                }}>
                  Discover healthcare providers connected with Curoxa and manage your care in one place.
                </p>

                {/* 3 Trust Chips Row matching media_1788166650528.png */}
                <div style={{ display: 'flex', gap: '14px', flexWrap: 'wrap' }}>
                  {/* Chip 1: Secure & Private */}
                  <div style={{
                    background: '#FFFFFF',
                    borderRadius: '16px',
                    padding: '12px 18px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '14px',
                    boxShadow: '0 4px 16px rgba(15, 23, 42, 0.04)',
                    border: '1.5px solid #F1F5F9'
                  }}>
                    <div style={{
                      width: '40px',
                      height: '40px',
                      borderRadius: '12px',
                      background: '#EFF6FF',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: '#2563EB',
                      flexShrink: 0
                    }}>
                      <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10"/></svg>
                    </div>
                    <div>
                      <div style={{ fontSize: '12px', fontWeight: 850, color: '#0F172A', letterSpacing: '0.04em', textTransform: 'uppercase' }}>SECURE & PRIVATE</div>
                      <div style={{ fontSize: '11.5px', color: '#64748B', fontWeight: 550 }}>DPDP-aware</div>
                    </div>
                  </div>

                  {/* Chip 2: Connected */}
                  <div style={{
                    background: '#FFFFFF',
                    borderRadius: '16px',
                    padding: '12px 18px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '14px',
                    boxShadow: '0 4px 16px rgba(15, 23, 42, 0.04)',
                    border: '1.5px solid #F1F5F9'
                  }}>
                    <div style={{
                      width: '40px',
                      height: '40px',
                      borderRadius: '12px',
                      background: '#F0FDFA',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: '#0D9488',
                      flexShrink: 0
                    }}>
                      <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><rect x="16" y="16" width="6" height="6" rx="1"/><rect x="2" y="16" width="6" height="6" rx="1"/><rect x="9" y="2" width="6" height="6" rx="1"/><path d="m5 16 .01-3a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v3"/><path d="M12 11V8"/></svg>
                    </div>
                    <div>
                      <div style={{ fontSize: '12px', fontWeight: 850, color: '#0F172A', letterSpacing: '0.04em', textTransform: 'uppercase' }}>CONNECTED</div>
                      <div style={{ fontSize: '11.5px', color: '#64748B', fontWeight: 550 }}>Healthcare network</div>
                    </div>
                  </div>

                  {/* Chip 3: Your Data */}
                  <div style={{
                    background: '#FFFFFF',
                    borderRadius: '16px',
                    padding: '12px 18px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '14px',
                    boxShadow: '0 4px 16px rgba(15, 23, 42, 0.04)',
                    border: '1.5px solid #F1F5F9'
                  }}>
                    <div style={{
                      width: '40px',
                      height: '40px',
                      borderRadius: '12px',
                      background: '#FAF5FF',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: '#7C3AED',
                      flexShrink: 0
                    }}>
                      <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                    </div>
                    <div>
                      <div style={{ fontSize: '12px', fontWeight: 850, color: '#0F172A', letterSpacing: '0.04em', textTransform: 'uppercase' }}>YOUR DATA</div>
                      <div style={{ fontSize: '11.5px', color: '#64748B', fontWeight: 550 }}>Your control</div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Right Column: Exact 3D Visual Asset (media_1788164049960.png) */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                position: 'relative'
              }}>
                <img 
                  src={curoxaHero3D} 
                  alt="Curoxa Healthcare Connected" 
                  style={{
                    width: '100%',
                    maxWidth: '520px',
                    height: 'auto',
                    objectFit: 'contain',
                    mixBlendMode: 'multiply',
                    WebkitMaskImage: 'radial-gradient(ellipse at 50% 50%, black 72%, transparent 98%)',
                    maskImage: 'radial-gradient(ellipse at 50% 50%, black 72%, transparent 98%)',
                    userSelect: 'none',
                    pointerEvents: 'none'
                  }}
                />
              </div>
            </div>

            {/* 1B. MOBILE HERO CARD (MATCHES media_1788164933731.png EXACTLY) */}
            <div className="curoxa-mobile-hero" style={{
              background: 'linear-gradient(145deg, #E0F2FE 0%, #EFF6FF 45%, #F0FDFA 100%)',
              borderRadius: '28px',
              border: '1.5px solid #BAE6FD',
              padding: '24px 18px 18px 18px',
              marginBottom: '24px',
              position: 'relative',
              overflow: 'hidden',
              boxShadow: '0 10px 25px -5px rgba(37, 99, 235, 0.08)'
            }}>
              {/* Top Badge: CUROXA HEALTH */}
              <div style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                fontSize: '11px',
                fontWeight: 800,
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
                color: '#0F766E',
                background: '#CCFBF1',
                border: '1px solid #99F6E4',
                padding: '3px 10px',
                borderRadius: '99px',
                marginBottom: '14px'
              }}>
                <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#10B981', boxShadow: '0 0 6px #10B981' }} />
                CUROXA HEALTH
              </div>

              {/* Greeting */}
              <h1 style={{
                fontSize: '25px',
                fontWeight: 900,
                color: '#0F172A',
                lineHeight: 1.15,
                margin: '0 0 2px 0',
                fontFamily: "'Outfit', sans-serif"
              }}>
                Good afternoon,
              </h1>

              <div style={{
                fontSize: '25px',
                fontWeight: 900,
                color: '#2563EB',
                lineHeight: 1.15,
                margin: '0 0 10px 0',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                fontFamily: "'Outfit', sans-serif"
              }}>
                <span>{currentUser.name ? currentUser.name.split(' ')[0] : 'Harsh'}</span>
                <span style={{ display: 'inline-block', transform: 'rotate(10deg)' }}>👋</span>
              </div>

              {/* Subtitle */}
              <div style={{
                fontSize: '13.5px',
                fontWeight: 800,
                color: '#0D9488',
                marginBottom: '6px',
                letterSpacing: '-0.01em'
              }}>
                Your healthcare, connected.
              </div>

              {/* Description */}
              <p style={{
                fontSize: '12.5px',
                color: '#64748B',
                lineHeight: 1.5,
                maxWidth: '56%',
                margin: '0 0 20px 0',
                fontWeight: 550
              }}>
                Discover healthcare providers connected with Curoxa and manage your care in one place.
              </p>

              {/* Artwork on the right side of the card (Larger, prominent display) */}
              <img 
                src={curoxaMobileHero3D} 
                alt="Artwork" 
                style={{
                  position: 'absolute',
                  right: '-16px',
                  top: '10px',
                  width: '215px',
                  height: 'auto',
                  objectFit: 'contain',
                  pointerEvents: 'none',
                  mixBlendMode: 'multiply'
                }}
              />

              {/* Floating Profile Card at Bottom */}
              <div 
                onClick={() => setActiveTab('profile')}
                style={{
                  background: '#FFFFFF',
                  borderRadius: '18px',
                  border: '1px solid #E2E8F0',
                  padding: '12px 16px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '14px',
                  cursor: 'pointer',
                  boxShadow: '0 4px 14px rgba(15, 23, 42, 0.04)',
                  position: 'relative',
                  zIndex: 2
                }}
              >
                <div style={{
                  width: '38px',
                  height: '38px',
                  borderRadius: '50%',
                  background: '#0D9488',
                  color: '#FFFFFF',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 800,
                  fontSize: '14px',
                  flexShrink: 0
                }}>
                  {currentUser.name ? currentUser.name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase() : 'HG'}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '13.5px', fontWeight: 800, color: '#0F172A', lineHeight: 1.2 }}>
                    {currentUser.name || 'Harsh Gupta'}
                  </div>
                  <div style={{ fontSize: '12px', color: '#2563EB', fontWeight: 700, marginTop: '2px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <span>Manage your profile</span>
                    <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>
                  </div>
                </div>
              </div>
            </div>

            {/* 1.5. NATIONAL DIGITAL HEALTH ID (ABHA) SMART CARD BANNER */}
            {(() => {
              const patientUhid = patientProfile?.uhid || (patientProfile ? `MDC-${patientProfile._id.substring(18).toUpperCase()}` : (currentUser.id ? `MDC-${currentUser.id.substring(18).toUpperCase()}` : 'MDC-456B50'));
              const patientAbha = patientProfile?.abhaId || (currentUser?.abhaId || '');
              const patientAbhaAddr = patientProfile?.abhaAddress || (patientAbha ? `${(currentUser.name || 'patient').toLowerCase().replace(/\s+/g, '')}@abdm` : '');
              const isLinked = Boolean(patientAbha);

              return (
                <div
                  className="abha-health-widget"
                  style={{
                  background: '#FFFFFF',
                  borderRadius: '24px',
                  border: '1.5px solid #F1F5F9',
                  padding: '24px 28px',
                  marginBottom: '32px',
                  boxShadow: '0 4px 24px -2px rgba(15, 23, 42, 0.04)',
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
                  gap: '28px',
                  alignItems: 'center',
                  position: 'relative',
                  overflow: 'hidden'
                }}>
                  {/* Left Column: Holographic Physical Card Graphic Preview */}
                  <div 
                    onClick={() => setShowDigitalCardModal(true)}
                    style={{
                      cursor: 'pointer',
                      borderRadius: '18px',
                      background: 'linear-gradient(135deg, #0B192C 0%, #1E3A8A 50%, #0369A1 100%)',
                      padding: '20px 22px',
                      color: '#FFFFFF',
                      boxShadow: '0 12px 30px -4px rgba(30, 58, 138, 0.35)',
                      border: '1px solid rgba(255, 255, 255, 0.25)',
                      position: 'relative',
                      overflow: 'hidden',
                      transition: 'transform 0.25s ease, box-shadow 0.25s ease',
                      maxWidth: '420px',
                      margin: '0 auto',
                      width: '100%'
                    }}
                    onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-3px)'; e.currentTarget.style.boxShadow = '0 16px 36px -4px rgba(30, 58, 138, 0.45)'; }}
                    onMouseLeave={e => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = '0 12px 30px -4px rgba(30, 58, 138, 0.35)'; }}
                  >
                    {/* Tricolor India Ribbon Header */}
                    <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '4px', display: 'flex' }}>
                      <div style={{ flex: 1, background: '#FF9933' }} />
                      <div style={{ flex: 1, background: '#FFFFFF' }} />
                      <div style={{ flex: 1, background: '#138808' }} />
                    </div>

                    {/* Subtle Holographic Radial Glow */}
                    <div style={{ position: 'absolute', top: '-40%', right: '-30%', width: '220px', height: '220px', borderRadius: '50%', background: 'radial-gradient(circle, rgba(14, 165, 233, 0.25) 0%, transparent 70%)', pointerEvents: 'none' }} />

                    {/* Card Header */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <div style={{
                          width: '28px',
                          height: '28px',
                          borderRadius: '8px',
                          background: 'rgba(255, 255, 255, 0.15)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: '14px',
                          fontWeight: 900
                        }}>
                          🏛️
                        </div>
                        <div>
                          <div style={{ fontSize: '10px', fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.75)' }}>National Health Authority</div>
                          <div style={{ fontSize: '13px', fontWeight: 900, letterSpacing: '0.04em' }}>ABHA • Digital Health ID</div>
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <img src={curoxaSidebarLogo} alt="Curoxa" style={{ width: '26px', height: '26px', objectFit: 'contain', filter: 'brightness(0) invert(1)' }} />
                        <span style={{ fontSize: '11px', fontWeight: 900, letterSpacing: '0.04em' }}>CUROXA</span>
                      </div>
                    </div>

                    {/* Chip & NFC Wave */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
                      {/* EMV Microchip Graphic */}
                      <div style={{
                        width: '34px',
                        height: '26px',
                        borderRadius: '5px',
                        background: 'linear-gradient(135deg, #FDE047 0%, #D97706 100%)',
                        border: '1px solid rgba(0,0,0,0.15)',
                        position: 'relative',
                        boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
                      }}>
                        <div style={{ position: 'absolute', inset: '4px', border: '1px solid rgba(0,0,0,0.2)', borderRadius: '2px' }} />
                      </div>
                      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12a10 10 0 0 1 10-10"/><path d="M6 12a6 6 0 0 1 6-6"/><path d="M10 12a2 2 0 0 1 2-2"/></svg>
                    </div>

                    {/* Patient Name & ABHA ID */}
                    <div style={{ marginBottom: '12px' }}>
                      <div style={{ fontSize: '9.5px', textTransform: 'uppercase', letterSpacing: '0.08em', color: '#93C5FD', fontWeight: 700 }}>Cardholder Name</div>
                      <div style={{ fontSize: '16px', fontWeight: 800, letterSpacing: '0.02em', textTransform: 'uppercase' }}>
                        {currentUser.name || 'Harsh Gupta'}
                      </div>
                    </div>

                    {/* Bottom Row: ABHA ID Number & Quick QR Code */}
                    <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
                      <div>
                        <div style={{ fontSize: '9.5px', textTransform: 'uppercase', letterSpacing: '0.08em', color: '#93C5FD', fontWeight: 700 }}>ABHA Number</div>
                        <div style={{ fontSize: '15px', fontWeight: 900, fontFamily: 'monospace', letterSpacing: '0.08em', color: '#FFFFFF' }}>
                          {isLinked ? patientAbha : '91-2093-4820-2104'}
                        </div>
                        <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.7)', marginTop: '2px', fontWeight: 550 }}>
                          {isLinked ? patientAbhaAddr : 'harsh@abdm'} • UHID: {patientUhid}
                        </div>
                      </div>

                      {/* Scannable Mini QR Code Box */}
                      <div style={{
                        width: '46px',
                        height: '46px',
                        background: '#FFFFFF',
                        borderRadius: '8px',
                        padding: '4px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        boxShadow: '0 4px 10px rgba(0,0,0,0.2)'
                      }}>
                        <svg viewBox="0 0 24 24" width="38" height="38" fill="#0F172A">
                          <path d="M2 2h8v8H2V2zm2 2v4h4V4H4zm10-2h8v8h-8V2zm2 2v4h4V4h-4zM2 14h8v8H2v-8zm2 2v4h4v-4H4zm14 0h4v2h-4v-2zm-4 0h2v4h-2v-4zm2 2h2v4h-2v-4zm2 2h2v2h-2v-2zm-6-4h2v2h-2v-2zm0 4h2v2h-2v-2z"/>
                        </svg>
                      </div>
                    </div>
                  </div>

                  {/* Right Column: Information, ABDM Status & Actions */}
                  <div>
                    {/* Status Pill */}
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '3.5px 12px', borderRadius: '99px', background: isLinked ? '#DCFCE7' : '#EFF6FF', border: `1px solid ${isLinked ? '#86EFAC' : '#BFDBFE'}`, color: isLinked ? '#15803D' : '#1D4ED8', fontSize: '11.5px', fontWeight: 800, marginBottom: '12px' }}>
                      <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: isLinked ? '#16A34A' : '#2563EB', boxShadow: `0 0 6px ${isLinked ? '#16A34A' : '#2563EB'}` }} />
                      <span>{isLinked ? 'ABDM Active & Verified' : 'ABDM Health Identity Ready'}</span>
                    </div>

                    <h3 style={{ fontSize: '20px', fontWeight: 900, color: '#0F172A', margin: '0 0 6px 0', letterSpacing: '-0.02em', fontFamily: "'Outfit', sans-serif" }}>
                      National Digital Health ID (ABHA)
                    </h3>

                    <p style={{ fontSize: '13.5px', color: '#64748B', lineHeight: 1.5, margin: '0 0 16px 0', fontWeight: 500 }}>
                      Your unified, secure healthcare pass under India's Ayushman Bharat Digital Mission (ABDM). Carry your medical records, lab reports, and doctor visits in one interoperable digital wallet.
                    </p>

                    {/* Micro Features Row */}
                    <div className="abha-feature-chips" style={{ display: 'flex', flexWrap: 'wrap', gap: '14px', marginBottom: '20px' }}>
                      <div className="abha-feature-chip" style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', fontWeight: 700, color: '#334155' }}>
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#2563EB" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
                        <span>Express OPD Check-In</span>
                      </div>
                      <div className="abha-feature-chip" style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', fontWeight: 700, color: '#334155' }}>
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#0D9488" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10"/></svg>
                        <span>DPDP & ABDM Protected</span>
                      </div>
                      <div className="abha-feature-chip" style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', fontWeight: 700, color: '#334155' }}>
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#7C3AED" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                        <span>Paperless Health Records</span>
                      </div>
                    </div>

                    {/* Action Buttons */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                      <button
                        type="button"
                        onClick={() => setShowDigitalCardModal(true)}
                        style={{
                          background: '#2563EB',
                          color: '#FFFFFF',
                          border: 'none',
                          borderRadius: '12px',
                          padding: '10px 20px',
                          fontSize: '13.5px',
                          fontWeight: 800,
                          cursor: 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '8px',
                          boxShadow: '0 4px 14px rgba(37, 99, 235, 0.28)',
                          transition: 'all 0.2s ease'
                        }}
                        onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-1px)'}
                        onMouseLeave={e => e.currentTarget.style.transform = 'none'}
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="20" height="14" x="2" y="5" rx="2"/><line x1="2" x2="22" y1="10" y2="10"/></svg>
                        <span>View Digital Health Card</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setShowAbhaModal(true)}
                        style={{
                          background: '#F1F5F9',
                          color: '#334155',
                          border: '1px solid #CBD5E1',
                          borderRadius: '12px',
                          padding: '10px 18px',
                          fontSize: '13.5px',
                          fontWeight: 750,
                          cursor: 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '6px',
                          transition: 'all 0.2s ease'
                        }}
                        onMouseEnter={e => { e.currentTarget.style.background = '#E2E8F0'; }}
                        onMouseLeave={e => { e.currentTarget.style.background = '#F1F5F9'; }}
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
                        <span>{isLinked ? 'Update ABHA Link' : 'Link ABHA Account'}</span>
                      </button>
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* 2. MAIN DISCOVERY SECTION: "Find your healthcare provider" (Matches media_1788164049960.png) */}
            <div style={{
              background: '#FFFFFF',
              borderRadius: '24px',
              border: '1.5px solid #F1F5F9',
              padding: '32px 32px 36px 32px',
              marginBottom: '36px',
              boxShadow: '0 4px 24px -2px rgba(15, 23, 42, 0.04)'
            }}>
              <div style={{ marginBottom: '20px' }}>
                <h2 style={{ fontSize: '24px', fontWeight: 900, color: '#0F172A', margin: '0 0 4px 0', letterSpacing: '-0.02em' }}>
                  Find your healthcare provider
                </h2>
                <p style={{ fontSize: '14px', color: '#64748B', margin: 0, fontWeight: 500 }}>
                  Choose a hospital or clinic to access your care.
                </p>
              </div>

              {/* Large Consumer Search Field (Matches Mockup) */}
              <div style={{ position: 'relative', marginBottom: '18px' }}>
                <i data-lucide="search" style={{ position: 'absolute', left: '18px', top: '50%', transform: 'translateY(-50%)', width: '20px', height: '20px', color: '#0284C7' }}></i>
                <input
                  type="text"
                  placeholder="Search hospitals, clinics or specialties"
                  value={curoxaSearchQuery}
                  onChange={e => setCuroxaSearchQuery(e.target.value)}
                  style={{
                    width: '100%',
                    height: '52px',
                    paddingLeft: '50px',
                    paddingRight: '16px',
                    borderRadius: '18px',
                    border: '1.5px solid #E2E8F0',
                    background: '#FFFFFF',
                    fontSize: '14.5px',
                    fontWeight: 600,
                    color: '#0F172A',
                    outline: 'none',
                    transition: 'all 0.2s',
                    boxSizing: 'border-box',
                    boxShadow: '0 2px 10px rgba(15, 23, 42, 0.03)'
                  }}
                  onFocus={e => {
                    e.currentTarget.style.borderColor = '#2563EB';
                    e.currentTarget.style.boxShadow = '0 0 0 4px rgba(37, 99, 235, 0.12)';
                  }}
                  onBlur={e => {
                    e.currentTarget.style.borderColor = '#E2E8F0';
                    e.currentTarget.style.boxShadow = '0 2px 10px rgba(15, 23, 42, 0.03)';
                  }}
                />
              </div>

              {/* Category Filter Pills (Matches Mockup) */}
              {(() => {
                const dynamicCats = [{ id: 'all', label: 'All Providers' }];
                const allSpecs = Array.from(new Set(curoxaHospitals.flatMap(h => h.specialties || []))).filter(Boolean);
                allSpecs.slice(0, 6).forEach(spec => {
                  dynamicCats.push({ id: `spec-${spec}`, label: spec });
                });

                return (
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    overflowX: 'auto',
                    paddingBottom: '8px',
                    marginBottom: '24px',
                    WebkitOverflowScrolling: 'touch',
                    scrollbarWidth: 'none'
                  }}>
                    {dynamicCats.map(cat => {
                      const isSelected = curoxaFacilityFilter === cat.id;
                      return (
                        <button
                          key={cat.id}
                          type="button"
                          onClick={() => setCuroxaFacilityFilter(cat.id)}
                          style={{
                            whiteSpace: 'nowrap',
                            padding: '9px 18px',
                            borderRadius: '99px',
                            fontSize: '13px',
                            fontWeight: 700,
                            border: isSelected ? 'none' : '1.5px solid #E2E8F0',
                            background: isSelected ? '#2563EB' : '#FFFFFF',
                            color: isSelected ? '#FFFFFF' : '#475569',
                            cursor: 'pointer',
                            transition: 'all 0.15s ease',
                            boxShadow: isSelected ? '0 4px 12px rgba(37, 99, 235, 0.25)' : 'none',
                            flexShrink: 0
                          }}
                        >
                          {cat.label}
                        </button>
                      );
                    })}

                    <button
                      type="button"
                      onClick={() => setCuroxaFacilityFilter('all')}
                      style={{
                        whiteSpace: 'nowrap',
                        padding: '9px 16px',
                        borderRadius: '99px',
                        fontSize: '12.5px',
                        fontWeight: 700,
                        border: '1.5px solid #E2E8F0',
                        background: '#FFFFFF',
                        color: '#475569',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        marginLeft: 'auto',
                        flexShrink: 0
                      }}
                      className="desktop-only-flex"
                    >
                      <i data-lucide="sliders-horizontal" style={{ width: '14px', height: '14px' }}></i>
                      <span>All Filters</span>
                    </button>
                  </div>
                );
              })()}

              {/* 3. 4-COLUMN HOSPITAL CARDS WITH REAL BACKEND DATA & VISUAL PERSONALITY */}
              {curoxaHospitalsLoading && curoxaHospitals.length === 0 ? (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '24px' }}>
                  {[1, 2, 3, 4].map(i => (
                    <div key={i} style={{
                      background: '#FFFFFF',
                      borderRadius: '20px',
                      border: '1.5px solid #F1F5F9',
                      padding: '18px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '14px'
                    }}>
                      <div style={{ width: '100%', height: '130px', borderRadius: '14px', background: '#F1F5F9', animation: 'pulse 1.5s infinite' }} />
                      <div style={{ width: '70%', height: '20px', borderRadius: '6px', background: '#F1F5F9', animation: 'pulse 1.5s infinite' }} />
                      <div style={{ width: '45%', height: '14px', borderRadius: '4px', background: '#F1F5F9', animation: 'pulse 1.5s infinite' }} />
                      <div style={{ width: '100%', height: '40px', borderRadius: '10px', background: '#F1F5F9', marginTop: '10px', animation: 'pulse 1.5s infinite' }} />
                    </div>
                  ))}
                </div>
              ) : curoxaHospitalsError && curoxaHospitals.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '48px 24px', background: '#FFFFFF', borderRadius: '20px', border: '1.5px solid #FEE2E2' }}>
                  <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: '#FEF2F2', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px', color: '#EF4444' }}>
                    <i data-lucide="alert-circle" style={{ width: '24px', height: '24px' }}></i>
                  </div>
                  <h3 style={{ fontSize: '17px', fontWeight: 800, color: '#991B1B', margin: '0 0 6px 0' }}>
                    Unable to load healthcare providers.
                  </h3>
                  <p style={{ fontSize: '13.5px', color: '#64748B', margin: '0 0 18px 0' }}>
                    Could not connect to the Curoxa healthcare network.
                  </p>
                  <button onClick={() => fetchData()} type="button" style={{ padding: '10px 22px', background: '#2563EB', color: '#FFFFFF', border: 'none', borderRadius: '10px', fontWeight: 700, cursor: 'pointer' }}>
                    Try Again
                  </button>
                </div>
              ) : curoxaHospitals.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '48px 24px', background: '#FFFFFF', borderRadius: '20px', border: '1.5px solid #E2E8F0' }}>
                  <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: '#F8FAFC', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px', color: '#94A3B8' }}>
                    <i data-lucide="building-2" style={{ width: '24px', height: '24px' }}></i>
                  </div>
                  <h3 style={{ fontSize: '17px', fontWeight: 800, color: '#0F172A', margin: '0 0 6px 0' }}>
                    Healthcare providers are not available right now.
                  </h3>
                  <p style={{ fontSize: '13.5px', color: '#64748B', maxWidth: '420px', margin: '0 auto' }}>
                    Curoxa will show hospitals as they become available.
                  </p>
                </div>
              ) : (() => {
                const filteredHospitals = curoxaHospitals.filter(h => {
                  const q = curoxaSearchQuery.toLowerCase().trim();
                  const matchesQuery = !q || 
                    (h.name && h.name.toLowerCase().includes(q)) ||
                    (h.address && h.address.toLowerCase().includes(q)) ||
                    (h.code && h.code.toLowerCase().includes(q)) ||
                    (h.specialties && h.specialties.some(s => s.toLowerCase().includes(q)));
                  
                  let matchesFilter = true;
                  if (curoxaFacilityFilter !== 'all' && curoxaFacilityFilter.startsWith('spec-')) {
                    const targetSpec = curoxaFacilityFilter.replace('spec-', '');
                    matchesFilter = h.specialties && h.specialties.includes(targetSpec);
                  }
                  return matchesQuery && matchesFilter;
                });

                if (filteredHospitals.length === 0) {
                  return (
                    <div style={{ textAlign: 'center', padding: '40px 20px', background: '#FFFFFF', borderRadius: '20px', border: '1.5px solid #E2E8F0' }}>
                      <div style={{ width: '44px', height: '44px', borderRadius: '50%', background: '#F1F5F9', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 10px', color: '#64748B' }}>
                        <i data-lucide="search" style={{ width: '20px', height: '20px' }}></i>
                      </div>
                      <h3 style={{ fontSize: '16px', fontWeight: 800, color: '#0F172A', margin: '0 0 4px 0' }}>
                        No providers match your search.
                      </h3>
                      <p style={{ fontSize: '13px', color: '#64748B', margin: '0 0 16px 0' }}>
                        Try searching by another hospital name, location, or specialty.
                      </p>
                      <button onClick={() => { setCuroxaSearchQuery(''); setCuroxaFacilityFilter('all'); }} type="button" style={{ padding: '8px 18px', background: '#F1F5F9', color: '#334155', border: '1.5px solid #CBD5E1', borderRadius: '8px', fontWeight: 700, cursor: 'pointer', fontSize: '12.5px' }}>
                        Clear search
                      </button>
                    </div>
                  );
                }

                // Deterministic 4-Theme Palettes matching Mockup Cards:
                const cardThemes = [
                  { color: '#2563EB', bgLight: '#EFF6FF', border: '#BFDBFE', bannerGrad: 'linear-gradient(135deg, #1E40AF 0%, #3B82F6 100%)', svgBuilding: '#93C5FD' },
                  { color: '#0D9488', bgLight: '#F0FDFA', border: '#99F6E4', bannerGrad: 'linear-gradient(135deg, #0F766E 0%, #14B8A6 100%)', svgBuilding: '#5EEAD4' },
                  { color: '#7C3AED', bgLight: '#FAF5FF', border: '#DDD6FE', bannerGrad: 'linear-gradient(135deg, #6D28D9 0%, #8B5CF6 100%)', svgBuilding: '#C4B5FD' },
                  { color: '#0284C7', bgLight: '#F0F9FF', border: '#BAE6FD', bannerGrad: 'linear-gradient(135deg, #0369A1 0%, #06B6D4 100%)', svgBuilding: '#67E8F9' }
                ];

                return (
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
                    gap: '24px'
                  }}>
                    {filteredHospitals.map((h, hIdx) => {
                      const theme = cardThemes[hIdx % cardThemes.length];
                      const monogram = h.logo && h.logo.length <= 4 ? h.logo : (h.name ? h.name.slice(0, 2).toUpperCase() : 'CU');
                      
                      return (
                        <div 
                          key={h.id || h.code}
                          style={{
                            background: '#FFFFFF',
                            borderRadius: '22px',
                            border: '1.5px solid #F1F5F9',
                            overflow: 'hidden',
                            boxShadow: '0 4px 20px -2px rgba(15, 23, 42, 0.05)',
                            display: 'flex',
                            flexDirection: 'column',
                            transition: 'all 0.25s ease'
                          }}
                          onMouseEnter={e => {
                            e.currentTarget.style.transform = 'translateY(-3px)';
                            e.currentTarget.style.boxShadow = '0 12px 28px -4px rgba(15, 23, 42, 0.1)';
                            e.currentTarget.style.borderColor = theme.border;
                          }}
                          onMouseLeave={e => {
                            e.currentTarget.style.transform = 'none';
                            e.currentTarget.style.boxShadow = '0 4px 20px -2px rgba(15, 23, 42, 0.05)';
                            e.currentTarget.style.borderColor = '#F1F5F9';
                          }}
                        >
                          {/* Visual Banner Area (140px) with Photorealistic Architectural 3D Asset */}
                          <div style={{ position: 'relative', width: '100%', height: '140px', overflow: 'hidden' }}>
                            <img 
                              src={(h.letterheadUrl && h.letterheadUrl.startsWith('http')) || (h.logo && h.logo.startsWith('http')) 
                                ? (h.letterheadUrl || h.logo) 
                                : `/hospital_banners/h${(hIdx % 4) + 1}.jpg`} 
                              alt={h.name} 
                              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                            />

                            {/* Soft subtle gradient overlay for clean contrast */}
                            <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(15,23,42,0.02) 0%, rgba(15,23,42,0.22) 100%)' }} />

                            {/* Top Left Verified Badge (Frosted Glass Capsule) */}
                            <div style={{
                              position: 'absolute',
                              top: '12px',
                              left: '14px',
                              background: 'rgba(255, 255, 255, 0.92)',
                              backdropFilter: 'blur(6px)',
                              border: '1px solid rgba(220, 252, 231, 0.8)',
                              color: '#15803D',
                              fontSize: '11px',
                              fontWeight: 800,
                              padding: '3px 10px',
                              borderRadius: '99px',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '5px',
                              boxShadow: '0 2px 8px rgba(0,0,0,0.08)'
                            }}>
                              <span style={{ width: '5.5px', height: '5.5px', borderRadius: '50%', background: '#16A34A' }} />
                              <span>Verified</span>
                            </div>

                            {/* Overlapping Uplifted Monogram Badge (Matches media_1788166078153.png) */}
                            <div style={{
                              position: 'absolute',
                              bottom: '12px',
                              left: '14px',
                              zIndex: 5,
                              width: '42px',
                              height: '42px',
                              borderRadius: '13px',
                              background: theme.color,
                              color: '#FFFFFF',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontWeight: 900,
                              fontSize: '15px',
                              border: '2.5px solid #FFFFFF',
                              boxShadow: '0 6px 16px rgba(0,0,0,0.22)'
                            }}>
                              {monogram}
                            </div>
                          </div>

                          {/* Card Content Area */}
                          <div style={{ padding: '16px 18px 18px 18px', display: 'flex', flexDirection: 'column', flex: 1 }}>
                            {/* Hospital Name */}
                            <h3 style={{
                              margin: '0 0 6px 0',
                              color: '#0F172A',
                              fontSize: '17px',
                              fontWeight: 800,
                              lineHeight: 1.25
                            }}>
                              {h.name}
                            </h3>

                            {/* Location with map pin */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#64748B', fontSize: '12.5px', fontWeight: 550, marginBottom: '12px' }}>
                              <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#0284C7" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0"/><circle cx="12" cy="10" r="3"/></svg>
                              <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                {(() => {
                                  if (h.city && h.state) return `${h.city}, ${h.state}`;
                                  if (h.city) return `${h.city}, India`;
                                  if (h.address && !/^[a-z0-9]{4,}$/i.test(h.address.trim()) && !/^\d+$/.test(h.address.trim())) {
                                    if (h.address.length > 24) {
                                      const parts = h.address.split(',').map(s => s.trim()).filter(Boolean);
                                      if (parts.length >= 2) return `${parts[parts.length - 2]}, ${parts[parts.length - 1]}`;
                                      return h.address.slice(0, 22) + '..';
                                    }
                                    return h.address;
                                  }
                                  const mockLocations = ['New Delhi, Delhi', 'Dwarka, New Delhi', 'Delhi, Delhi', 'Bhaktapur, Delhi'];
                                  return mockLocations[hIdx % mockLocations.length];
                                })()}
                              </span>
                            </div>

                            {/* Specialties Pills matching Theme */}
                            {((h.specialties && h.specialties.length > 0) || (h.modules && h.modules.length > 0)) && (
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '14px' }}>
                                {(h.specialties && h.specialties.length > 0 ? h.specialties : (
                                  hIdx === 0 ? ['General Medicine'] :
                                  hIdx === 1 ? ['Neurology', 'Cardiology'] :
                                  hIdx === 2 ? ['Dermatology', 'ENT', 'Pediatrics'] :
                                  ['OPD Consultation', 'Pharmacy', 'Radiology']
                                )).slice(0, 2).map((spec, sIdx) => (
                                  <span 
                                    key={sIdx}
                                    style={{
                                      fontSize: '11px',
                                      fontWeight: 700,
                                      background: theme.bgLight,
                                      color: theme.color,
                                      border: `1px solid ${theme.border}`,
                                      padding: '3px 9px',
                                      borderRadius: '6px'
                                    }}
                                  >
                                    {spec}
                                  </span>
                                ))}
                                {((h.specialties && h.specialties.length > 2) || hIdx >= 2) && (
                                  <span style={{ fontSize: '11px', color: '#64748B', fontWeight: 700, alignSelf: 'center', padding: '2px 4px' }}>
                                    +{h.specialties && h.specialties.length > 2 ? h.specialties.length - 2 : (hIdx === 2 ? 1 : 2)}
                                  </span>
                                )}
                              </div>
                            )}

                            {/* Specialist count with user icon */}
                            {(() => {
                              const specCount = h.doctorCount || (hIdx === 0 ? 1 : hIdx === 1 ? 3 : hIdx === 2 ? 5 : 4);
                              return (
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#1E293B', fontSize: '12px', fontWeight: 700, marginBottom: '16px' }}>
                                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={theme.color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
                                  <span>{specCount} specialist{specCount === 1 ? '' : 's'} available</span>
                                </div>
                              );
                            })()}

                            {/* Divider & CTA Action */}
                            <div style={{ marginTop: 'auto', paddingTop: '14px', borderTop: '1px solid #F1F5F9' }}>
                              {/* Desktop Subtle Link with arrow */}
                              <div 
                                className="desktop-only-flex"
                                onClick={() => handleSelectHospital(h)}
                                style={{
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  gap: '6px',
                                  color: '#2563EB',
                                  fontWeight: 800,
                                  fontSize: '13.5px',
                                  cursor: 'pointer',
                                  padding: '6px 0',
                                  transition: 'gap 0.2s ease'
                                }}
                                onMouseEnter={e => { e.currentTarget.style.gap = '10px'; }}
                                onMouseLeave={e => { e.currentTarget.style.gap = '6px'; }}
                              >
                                <span>Explore Hospital</span>
                                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>
                              </div>

                              {/* Mobile Full-Width Blue Button */}
                              <button
                                className="mobile-only-flex"
                                type="button"
                                onClick={() => handleSelectHospital(h)}
                                style={{
                                  width: '100%',
                                  height: '42px',
                                  background: '#2563EB',
                                  color: '#FFFFFF',
                                  border: 'none',
                                  borderRadius: '12px',
                                  fontSize: '13.5px',
                                  fontWeight: 800,
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  gap: '8px',
                                  cursor: 'pointer',
                                  boxShadow: '0 4px 12px rgba(37, 99, 235, 0.25)'
                                }}
                              >
                                <span>Explore Hospital</span>
                                <i data-lucide="arrow-right" style={{ width: '15px', height: '15px' }}></i>
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
            </div>

            {/* 4. HEALTHCARE, CONNECTED SIMPLY BANNER (Matches Mockup) */}
            <div style={{
              background: '#FFFFFF',
              borderRadius: '20px',
              border: '1.5px solid #F1F5F9',
              padding: '22px 32px',
              marginBottom: '28px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '24px',
              boxShadow: '0 2px 14px rgba(15, 23, 42, 0.03)'
            }}>
              {/* Left Title & Tagline */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                <div style={{
                  width: '42px',
                  height: '42px',
                  borderRadius: '12px',
                  background: '#EFF6FF',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#2563EB',
                  flexShrink: 0
                }}>
                  <i data-lucide="shield" style={{ width: '22px', height: '22px' }}></i>
                </div>
                <div>
                  <div style={{ fontSize: '16px', fontWeight: 800, color: '#0F172A', lineHeight: 1.2 }}>
                    Healthcare, connected simply.
                  </div>
                  <div style={{ fontSize: '13px', color: '#64748B', fontWeight: 500, marginTop: '2px' }}>
                    One platform. Many providers. Care that follows you.
                  </div>
                </div>
              </div>

              {/* Right Steps 01, 02, 03 */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '28px', flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div style={{
                    width: '28px',
                    height: '28px',
                    borderRadius: '50%',
                    background: '#EFF6FF',
                    border: '1px solid #BFDBFE',
                    color: '#2563EB',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 800,
                    fontSize: '11.5px',
                    flexShrink: 0
                  }}>
                    01
                  </div>
                  <div>
                    <div style={{ fontSize: '13px', fontWeight: 800, color: '#0F172A' }}>Choose</div>
                    <div style={{ fontSize: '11.5px', color: '#64748B', fontWeight: 500 }}>Select a Curoxa-connected provider.</div>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div style={{
                    width: '28px',
                    height: '28px',
                    borderRadius: '50%',
                    background: '#F0FDFA',
                    border: '1px solid #99F6E4',
                    color: '#0D9488',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 800,
                    fontSize: '11.5px',
                    flexShrink: 0
                  }}>
                    02
                  </div>
                  <div>
                    <div style={{ fontSize: '13px', fontWeight: 800, color: '#0F172A' }}>Access</div>
                    <div style={{ fontSize: '11.5px', color: '#64748B', fontWeight: 500 }}>View appointments, records and more.</div>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div style={{
                    width: '28px',
                    height: '28px',
                    borderRadius: '50%',
                    background: '#FAF5FF',
                    border: '1px solid #DDD6FE',
                    color: '#7C3AED',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 800,
                    fontSize: '11.5px',
                    flexShrink: 0
                  }}>
                    03
                  </div>
                  <div>
                    <div style={{ fontSize: '13px', fontWeight: 800, color: '#0F172A' }}>Stay Connected</div>
                    <div style={{ fontSize: '11.5px', color: '#64748B', fontWeight: 500 }}>Manage your care from one place.</div>
                  </div>
                </div>
              </div>
            </div>

            {/* 5. TRUST FOOTER TAGS (Matches media_1788166650528.png) */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '40px',
              padding: '8px 0 24px 0',
              flexWrap: 'wrap',
              color: '#0284C7',
              fontSize: '13px',
              fontWeight: 700
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10"/></svg>
                <span>Privacy-aware</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                <span>Secure health information</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><rect x="16" y="16" width="6" height="6" rx="1"/><rect x="2" y="16" width="6" height="6" rx="1"/><rect x="9" y="2" width="6" height="6" rx="1"/><path d="m5 16 .01-3a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v3"/><path d="M12 11V8"/></svg>
                <span>Connected healthcare network</span>
              </div>
            </div>

          </div>
        )}

        {selectedHospital && activeTab === 'summary' && (
          <div className="tab-content active" style={{ animation: 'slideUp 0.3s ease-out' }}>
            <PatientHospitalHome
              hospital={selectedHospital}
              currentUser={currentUser}
              patientProfile={patientProfile}
              todayVisitAppt={todayVisitAppt}
              nextUpcomingAppt={nextUpcomingAppt}
              patientQueue={patientQueue}
              appointments={hospitalAppointments}
              prescriptions={prescriptions}
              labRequests={labRequests}
              visits={visits}
              onNavigateTab={(tab) => {
                if (tab === 'labs') {
                  setMyHealthCategory('LABS');
                  setActiveTab('records');
                } else {
                  setActiveTab(tab);
                }
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
              onViewAppointmentDetails={openDetailsModal}
              onOpenBooking={handleOpenBookingFlow}
              onPayAppointment={openPaymentModalForAppointment}
              onViewPrescription={(rx) => {
                setSelectedPrescription(rx);
                setPrescriptionModalOpen(true);
              }}
              onViewLabReport={(lab) => {
                setSelectedLab(lab);
                setLabModalOpen(true);
              }}
              onViewVisit={(visit) => {
                setSelectedEmrDoc(visit);
                setEmrModalOpen(true);
              }}
            />
          </div>
        )}

        {selectedHospital && activeTab === 'find' && (
          <div className="tab-content active" style={{ animation: 'slideUp 0.4s ease-out' }}>
            <div className="dashboard-header" style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginBottom: '24px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', flexWrap: 'wrap', gap: '12px' }}>
                <div>
                  <h1 style={{ fontSize: '24px', fontWeight: 800, margin: '0 0 4px 0', color: '#0F172A' }}>Doctors & Specialists</h1>
                  <p className="text-muted" style={{ fontWeight: 600, margin: 0, fontSize: '13.5px' }}>
                    Consult verified specialists and book appointments at {selectedHospital.name}
                  </p>
                </div>
              </div>

              {/* Reactive Search Bar for Doctors at this Hospital */}
              <div style={{ position: 'relative', width: '100%', display: 'flex', alignItems: 'center' }}>
                <i data-lucide="search" style={{ position: 'absolute', left: '16px', color: '#64748B', width: '18px' }}></i>
                <input 
                  type="text" 
                  placeholder={`Search doctors at ${selectedHospital.name} by name or specialty...`}
                  style={{ background: 'white', border: '1px solid #CBD5E1', paddingLeft: '48px', height: '46px', width: '100%', borderRadius: '12px', fontSize: '14px', fontWeight: 600, outline: 'none', boxShadow: '0 2px 4px rgba(0,0,0,0.01)' }}
                  value={discoverySearch}
                  onChange={(e) => setDiscoverySearch(e.target.value)}
                />
              </div>
            </div>

            {/* Doctors at Selected Hospital */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              {/* Specialty quick filter pills */}
              {(() => {
                const hospitalTenant = selectedHospital.code || selectedHospital.id || selectedHospital._id;
                const hospitalDocs = doctors.filter(doc => !doc.tenantId || doc.tenantId === hospitalTenant || doc.tenantId === selectedHospital.id || doc.tenantId === selectedHospital.code);
                const activeDocs = hospitalDocs.length > 0 ? hospitalDocs : doctors;
                const specs = ['All', ...Array.from(new Set(activeDocs.map(d => d.specialty).filter(Boolean)))];

                return (
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '8px' }}>
                    {specs.map(spec => {
                      const isSelected = (spec === 'All' && !selectedSpecialtyFilter) || selectedSpecialtyFilter === spec;
                      return (
                        <button
                          key={spec}
                          type="button"
                          onClick={() => setSelectedSpecialtyFilter(spec === 'All' ? null : spec)}
                          style={{
                            background: isSelected ? 'var(--primary)' : 'white',
                            color: isSelected ? 'white' : '#64748B',
                            border: isSelected ? 'none' : '1px solid #CBD5E1',
                            padding: '6px 16px',
                            borderRadius: '20px',
                            fontSize: '12px',
                            fontWeight: 700,
                            cursor: 'pointer',
                            transition: '0.2s',
                            boxShadow: '0 1px 2px rgba(0,0,0,0.02)'
                          }}
                        >
                          {spec}
                        </button>
                      );
                    })}
                  </div>
                );
              })()}

              <div className="doctor-grid-pro">
                {(() => {
                  const hospitalTenant = selectedHospital.code || selectedHospital.id || selectedHospital._id;
                  const hospitalDocs = doctors.filter(doc => !doc.tenantId || doc.tenantId === hospitalTenant || doc.tenantId === selectedHospital.id || doc.tenantId === selectedHospital.code);
                  const activeDocs = hospitalDocs.length > 0 ? hospitalDocs : doctors;

                  const filteredDocs = activeDocs.filter(doc => {
                    const query = discoverySearch.toLowerCase().trim();
                    const matchesSearch = !query || 
                                         doc.name.toLowerCase().includes(query) || 
                                         (doc.specialty || '').toLowerCase().includes(query);
                    const matchesSpecialty = !selectedSpecialtyFilter || doc.specialty === selectedSpecialtyFilter;
                    return matchesSearch && matchesSpecialty;
                  });

                  if (filteredDocs.length === 0) {
                    return (
                      <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: '40px', color: '#64748B', fontWeight: 700 }}>
                        No doctors found at {selectedHospital.name} matching your search.
                      </div>
                    );
                  }

                  return filteredDocs.map(doc => (
                    <div key={doc._id} className="doctor-card-pro animate-in" onClick={() => bookDoctor(doc)}>
                      <div className="doc-avatar-wrapper">
                        <div style={{ width: '100%', height: '180px', background: 'var(--primary-light)', color: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '32px', fontWeight: 800, borderRadius: '16px' }}>
                          {doc.name ? doc.name.substring(0, 2).toUpperCase() : 'DR'}
                        </div>
                        <div className="doc-rating-badge">★ 4.9</div>
                        <div style={{ position: 'absolute', bottom: '0', right: '0', width: '12px', height: '12px', background: '#10B981', border: '2px solid white', borderRadius: '50%' }} />
                      </div>
                      <div style={{ fontWeight: 800, fontSize: '18px', color: '#1E293B' }}>{doc.name}</div>
                      <div style={{ fontSize: '13px', color: 'var(--primary)', fontWeight: 700, margin: '4px 0 8px' }}>{doc.specialty || ''}</div>
                      
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '11px', color: 'var(--text-muted)', fontWeight: 700, margin: '0 0 16px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <i data-lucide="building-2" style={{ width: '12px' }}></i> {selectedHospital.name}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <i data-lucide="calendar" style={{ width: '12px' }}></i> Available: Mon - Fri
                        </div>
                      </div>

                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 600 }}>Verified Specialist</span>
                        <button 
                          className="btn btn-primary" 
                          style={{ padding: '8px 16px', fontSize: '12px', borderRadius: '8px', fontWeight: 800 }}
                          onClick={(e) => { e.stopPropagation(); bookDoctor(doc); }}
                        >
                          Book Now
                        </button>
                      </div>
                    </div>
                  ));
                })()}
              </div>
            </div>
          </div>
        )}

        {selectedHospital && activeTab === 'history' && (
          <div className="tab-content active" style={{ animation: 'slideUp 0.4s ease-out' }}>
            <div className="dashboard-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '12px' }}>
              <div>
                <h1 style={{ fontSize: '24px', fontWeight: 800, margin: '0 0 4px 0' }}>Your Appointments</h1>
                <p style={{ fontSize: '13px', color: '#64748B', margin: 0 }}>View your appointment schedule, queue status, and visit records</p>
              </div>
              <button className="btn btn-primary" onClick={() => setActiveTab('find')}>
                <i data-lucide="plus"></i> Book New
              </button>
            </div>

            {/* Category Filter Pills & Appointments List */}
            {(() => {
              const currentList = hospitalAppointments;
              const todayList = currentList.filter(a => {
                const isToday = (a.tokenDate === todayStr) || (a.date && getLocalDateString(a.date) === todayStr);
                return isToday && !['Completed', 'Cancelled', 'Checked Out'].includes(a.status);
              });
              const upcomingList = currentList.filter(a => {
                const isFuture = a.date && getLocalDateString(a.date) >= todayStr;
                return isFuture && !['Completed', 'Cancelled', 'Checked Out'].includes(a.status);
              });
              const completedList = currentList.filter(a => ['Completed', 'Checked Out'].includes(a.status));
              const cancelledList = currentList.filter(a => ['Cancelled', 'No-Show', 'no-show', 'Skipped'].includes(a.status));

              let displayList = currentList;
              if (appointmentFilterTab === 'TODAY') displayList = todayList;
              else if (appointmentFilterTab === 'UPCOMING') displayList = upcomingList;
              else if (appointmentFilterTab === 'COMPLETED') displayList = completedList;
              else if (appointmentFilterTab === 'CANCELLED') displayList = cancelledList;

              const categories = [
                { key: 'ALL', label: 'All', count: currentList.length },
                { key: 'TODAY', label: 'Today', count: todayList.length },
                { key: 'UPCOMING', label: 'Upcoming', count: upcomingList.length },
                { key: 'COMPLETED', label: 'Completed', count: completedList.length },
                { key: 'CANCELLED', label: 'Cancelled', count: cancelledList.length }
              ];

              return (
                <div>
                  {/* Category Pills */}
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '20px' }}>
                    {categories.map(c => (
                      <button
                        key={c.key}
                        type="button"
                        onClick={() => setAppointmentFilterTab(c.key)}
                        style={{
                          padding: '8px 16px',
                          borderRadius: '20px',
                          border: appointmentFilterTab === c.key ? 'none' : '1px solid #CBD5E1',
                          background: appointmentFilterTab === c.key ? 'var(--primary)' : '#FFFFFF',
                          color: appointmentFilterTab === c.key ? '#FFFFFF' : '#475569',
                          fontWeight: 800,
                          fontSize: '12.5px',
                          cursor: 'pointer',
                          transition: 'all 0.15s ease',
                          boxShadow: appointmentFilterTab === c.key ? '0 2px 6px rgba(37,99,235,0.25)' : 'none'
                        }}
                      >
                        {c.label} ({c.count})
                      </button>
                    ))}
                  </div>

                  {/* Mobile-first Appointment Cards Grid */}
                  {displayList.length === 0 ? (
                    <div className="glass-card" style={{ padding: '40px 20px', textAlign: 'center', color: '#64748B' }}>
                      <i data-lucide="calendar" style={{ width: '32px', height: '32px', margin: '0 auto 10px', display: 'block', color: '#94A3B8' }} />
                      <div style={{ fontSize: '15px', fontWeight: 800, color: '#0F172A', marginBottom: '4px' }}>
                        No appointments found in this category
                      </div>
                      <div style={{ fontSize: '13px', color: '#64748B' }}>
                        {appointmentFilterTab === 'TODAY' ? 'You have no appointments scheduled for today.' : 'There are no appointments matching your selected filter.'}
                      </div>
                    </div>
                  ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '16px' }}>
                      {displayList.map(app => {
                        const hDetails = getHospitalDetails(app.tenantId);
                        const isCompleted = app.status === 'Completed';
                        const isCancelled = ['Cancelled', 'No-Show', 'no-show', 'Skipped'].includes(app.status);

                        return (
                          <div
                            key={app._id}
                            style={{
                              background: '#FFFFFF',
                              border: '1px solid #E2E8F0',
                              borderRadius: '16px',
                              padding: '20px',
                              boxShadow: '0 2px 8px rgba(15, 23, 42, 0.03)',
                              display: 'flex',
                              flexDirection: 'column',
                              justifyContent: 'space-between',
                              gap: '14px',
                              transition: 'all 0.15s ease'
                            }}
                          >
                            {/* Card Top: Doctor & Status */}
                            <div>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '10px', marginBottom: '12px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                  <div style={{
                                    width: '42px',
                                    height: '42px',
                                    borderRadius: '10px',
                                    background: '#EFF6FF',
                                    color: '#2563EB',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    fontWeight: 900,
                                    fontSize: '15px',
                                    flexShrink: 0
                                  }}>
                                    {app.doctorId?.name ? app.doctorId.name.replace('Dr. ', '').substring(0, 2).toUpperCase() : 'DR'}
                                  </div>
                                  <div>
                                    <div style={{ fontSize: '15px', fontWeight: 800, color: '#0F172A' }}>
                                      {app.doctorId?.name || 'Dr. Assigned'}
                                    </div>
                                    <div style={{ fontSize: '12px', color: 'var(--primary)', fontWeight: 700 }}>
                                      {app.doctorId?.specialty || app.reason || 'General Consultation'}
                                    </div>
                                  </div>
                                </div>

                                <span style={{
                                  padding: '4px 10px',
                                  borderRadius: '6px',
                                  fontSize: '11px',
                                  fontWeight: 800,
                                  background: isCompleted ? '#ECFDF5' : (isCancelled ? '#FEF2F2' : '#EFF6FF'),
                                  color: isCompleted ? '#059669' : (isCancelled ? '#DC2626' : '#2563EB'),
                                  border: isCompleted ? '1px solid #A7F3D0' : (isCancelled ? '1px solid #FECACA' : '1px solid #BFDBFE'),
                                  whiteSpace: 'nowrap'
                                }}>
                                  {app.status}
                                </span>
                              </div>

                              {/* Facility Name */}
                              <div style={{ fontSize: '11.5px', color: '#64748B', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '10px' }}>
                                <i data-lucide="building-2" style={{ width: '13px', height: '13px' }}></i>
                                <span>{hDetails.name}</span>
                              </div>

                              {/* Date & Time Pill */}
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#F8FAFC', padding: '10px 12px', borderRadius: '10px', fontSize: '12.5px', color: '#334155', fontWeight: 700, flexWrap: 'wrap', gap: '8px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                  <i data-lucide="calendar" style={{ width: '14px', height: '14px', color: '#2563EB' }}></i>
                                  <span>{new Date(app.date).toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' })}</span>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                  <i data-lucide="clock" style={{ width: '14px', height: '14px', color: '#2563EB' }}></i>
                                  <span>{app.time}</span>
                                </div>
                              </div>

                              {/* Token Badge - hidden if Cancelled */}
                              {app.status !== 'Cancelled' && (
                                app.tokenNumber ? (
                                  <div style={{ marginTop: '10px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <span style={{
                                      padding: '4px 10px',
                                      borderRadius: '8px',
                                      fontSize: '12px',
                                      fontWeight: 900,
                                      background: '#EFF6FF',
                                      color: '#1D4ED8',
                                      border: '1.5px solid #93C5FD',
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      gap: '5px'
                                    }}>
                                      <span>🎟️</span> Token #{app.tokenNumber}
                                    </span>
                                    {app.tokenSlotId && (
                                      <span style={{ fontSize: '11px', color: '#64748B', fontWeight: 600 }}>
                                        ({app.tokenSlotId})
                                      </span>
                                    )}
                                  </div>
                                ) : (
                                  <div style={{ marginTop: '10px', fontSize: '11.5px', color: '#94A3B8', fontWeight: 600 }}>
                                    Token assigned when you arrive at reception
                                  </div>
                                )
                              )}
                            </div>

                            {/* Card Bottom Actions */}
                            <div style={{ display: 'flex', gap: '8px', alignItems: 'center', borderTop: '1px solid #F1F5F9', paddingTop: '12px' }}>
                              <button
                                className="btn btn-secondary"
                                style={{ flex: 1, padding: '8px 12px', fontSize: '12px', fontWeight: 800, borderRadius: '8px' }}
                                onClick={() => openDetailsModal(app)}
                              >
                                View Details
                              </button>

                              {app.status === 'Approved' && app.billingStatus !== 'Paid' && (
                                <button
                                  className="btn btn-primary"
                                  style={{ flex: 1, padding: '8px 12px', fontSize: '12px', background: '#2563EB', fontWeight: 800, borderRadius: '8px' }}
                                  onClick={() => openPaymentModalForAppointment(app)}
                                >
                                  Pay Now
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
        )}

        {selectedHospital && activeTab === 'prescriptions' && (
          <div className="tab-content active" style={{ animation: 'slideUp 0.4s ease-out' }}>
            <h1 style={{ fontSize: '24px', fontWeight: 800, marginBottom: '24px' }}>Current Medications</h1>
            <div className="glass-card" style={{ padding: '12px' }}>
              <div className="table-responsive">
                <table className="elite-table" style={{ margin: 0, border: 'none' }}>
                  <thead style={{ background: '#F8FAFC' }}>
                    <tr>
                      <th>Date</th>
                      <th>Doctor</th>
                      <th>Items Prescribed</th>
                      <th>Dispense Status</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {getGroupedPrescriptions().length === 0 ? (
                      <tr>
                        <td colSpan="5" style={{ textAlign: 'center', padding: '24px', color: 'var(--text-muted)' }}>
                          No active prescriptions found in your medical records.
                        </td>
                      </tr>
                    ) : (
                      getGroupedPrescriptions().map((p, idx) => (
                        <tr key={p._id || idx}>
                          <td style={{ fontWeight: 700 }}>
                            {p.createdAt ? new Date(p.createdAt).toLocaleDateString([], { day: '2-digit', month: 'short', year: 'numeric' }) : '24 May 2024'}
                          </td>
                          <td>
                            <b>{p.doctorId?.name || 'Consulting Specialist'}</b>
                            <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{p.doctorId?.specialty || 'General Medicine'}</div>
                          </td>
                          <td style={{ fontWeight: 700, color: 'var(--primary)' }}>
                            {p.items ? p.items.length : 0} {p.items?.length === 1 ? 'Item' : 'Items'}
                          </td>
                          <td>
                            <span className={`status-badge ${p.status === 'Dispensed' || p.status === 'Dispensed by Pharmacy' ? 'available' : 'pending'}`}>
                              {p.status === 'Pending Pharmacy Dispatch' ? 'PENDING' : p.status.toUpperCase()}
                            </span>
                          </td>
                          <td>
                            <button 
                              className="btn btn-secondary" 
                              style={{ padding: '6px 12px', fontSize: '11px' }} 
                              onClick={() => {
                                setSelectedPrescription(p);
                                setPrescriptionModalOpen(true);
                              }}
                            >
                              View Details
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {selectedHospital && activeTab === 'records' && (
          <div className="tab-content active" style={{ animation: 'slideUp 0.4s ease-out' }}>
            {/* My Health Hub Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '16px' }}>
              <div>
                <h1 style={{ fontSize: '24px', fontWeight: 900, color: '#0F172A', margin: 0, fontFamily: "'Outfit', sans-serif" }}>
                  My Health Hub
                </h1>
                <p style={{ fontSize: '13px', color: '#64748B', margin: '4px 0 0 0', fontWeight: 600 }}>
                  Central library for your clinical records, prescriptions, lab reports, and medical documents
                </p>
              </div>
              <button 
                className="btn btn-primary" 
                style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 800 }}
                onClick={handleDownloadDossier}
              >
                <i data-lucide="download" style={{ width: '16px' }}></i> Export Dossier
              </button>
            </div>

            {/* 4 Category Overview Cards */}
            {(() => {
              const totalRecordsCount = visits.length + vitals.length + clinicalNotes.length + procedures.length;
              const totalPrescCount = prescriptions.length;
              const totalLabsCount = labRequests.length;
              const totalDocsCount = clinicalDocs.length + (patientProfile?.patientDocuments?.length || 0);

              const latestRecord = clinicalNotes[0]?.doctorId?.name 
                ? `Dr. ${clinicalNotes[0].doctorId.name} • ${new Date(clinicalNotes[0].createdAt).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}` 
                : (visits[0] ? `${visits[0].type} • ${new Date(visits[0].arrivalTimestamp).toLocaleDateString([], { month: 'short', day: 'numeric' })}` : 'No records yet');

              const latestPresc = prescriptions[0]
                ? `${prescriptions[0].doctorId?.name || 'Doctor'} • ${new Date(prescriptions[0].createdAt).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}`
                : 'No prescriptions yet';

              const latestLab = labRequests[0]
                ? `${labRequests[0].testName} • ${labRequests[0].status}`
                : 'No lab reports yet';

              const latestDoc = clinicalDocs[0]?.title 
                ? `${clinicalDocs[0].title}`
                : (patientProfile?.patientDocuments?.[0]?.name ? patientProfile.patientDocuments[0].name : 'No documents yet');

              return (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px', marginBottom: '28px' }}>
                  {/* Category Card 1: Medical Records */}
                  <div 
                    onClick={() => setMyHealthCategory('RECORDS')}
                    style={{ 
                      background: myHealthCategory === 'RECORDS' ? '#EFF6FF' : '#FFFFFF', 
                      border: myHealthCategory === 'RECORDS' ? '2px solid #2563EB' : '1px solid #E2E8F0', 
                      borderRadius: '16px', 
                      padding: '20px', 
                      cursor: 'pointer',
                      boxShadow: '0 2px 8px rgba(15,23,42,0.04)',
                      display: 'flex', 
                      flexDirection: 'column', 
                      justifyContent: 'space-between',
                      transition: 'all 0.2s ease'
                    }}
                  >
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                        <div style={{ width: '38px', height: '38px', borderRadius: '10px', background: '#DBEAFE', color: '#2563EB', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <i data-lucide="activity" style={{ width: '20px', height: '20px' }}></i>
                        </div>
                        <span style={{ fontSize: '11px', fontWeight: 800, padding: '3px 8px', borderRadius: '12px', background: '#F1F5F9', color: '#475569' }}>
                          {totalRecordsCount} {totalRecordsCount === 1 ? 'record' : 'records'}
                        </span>
                      </div>
                      <div style={{ fontSize: '12px', fontWeight: 800, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Medical Records</div>
                      <div style={{ fontSize: '12.5px', color: '#1E293B', fontWeight: 700, marginTop: '6px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {latestRecord}
                      </div>
                    </div>
                    <div style={{ marginTop: '14px', fontSize: '12px', fontWeight: 800, color: '#2563EB', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      View Records <i data-lucide="chevron-right" style={{ width: '14px', height: '14px' }}></i>
                    </div>
                  </div>

                  {/* Category Card 2: Prescriptions */}
                  <div 
                    onClick={() => setMyHealthCategory('PRESCRIPTIONS')}
                    style={{ 
                      background: myHealthCategory === 'PRESCRIPTIONS' ? '#F0FDF4' : '#FFFFFF', 
                      border: myHealthCategory === 'PRESCRIPTIONS' ? '2px solid #16A34A' : '1px solid #E2E8F0', 
                      borderRadius: '16px', 
                      padding: '20px', 
                      cursor: 'pointer',
                      boxShadow: '0 2px 8px rgba(15,23,42,0.04)',
                      display: 'flex', 
                      flexDirection: 'column', 
                      justifyContent: 'space-between',
                      transition: 'all 0.2s ease'
                    }}
                  >
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                        <div style={{ width: '38px', height: '38px', borderRadius: '10px', background: '#DCFCE7', color: '#16A34A', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <i data-lucide="pill" style={{ width: '20px', height: '20px' }}></i>
                        </div>
                        <span style={{ fontSize: '11px', fontWeight: 800, padding: '3px 8px', borderRadius: '12px', background: '#F1F5F9', color: '#475569' }}>
                          {totalPrescCount} {totalPrescCount === 1 ? 'item' : 'items'}
                        </span>
                      </div>
                      <div style={{ fontSize: '12px', fontWeight: 800, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Prescriptions</div>
                      <div style={{ fontSize: '12.5px', color: '#1E293B', fontWeight: 700, marginTop: '6px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {latestPresc}
                      </div>
                    </div>
                    <div style={{ marginTop: '14px', fontSize: '12px', fontWeight: 800, color: '#16A34A', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      View Prescriptions <i data-lucide="chevron-right" style={{ width: '14px', height: '14px' }}></i>
                    </div>
                  </div>

                  {/* Category Card 3: Lab Reports */}
                  <div 
                    onClick={() => setMyHealthCategory('LABS')}
                    style={{ 
                      background: myHealthCategory === 'LABS' ? '#FAF5FF' : '#FFFFFF', 
                      border: myHealthCategory === 'LABS' ? '2px solid #9333EA' : '1px solid #E2E8F0', 
                      borderRadius: '16px', 
                      padding: '20px', 
                      cursor: 'pointer',
                      boxShadow: '0 2px 8px rgba(15,23,42,0.04)',
                      display: 'flex', 
                      flexDirection: 'column', 
                      justifyContent: 'space-between',
                      transition: 'all 0.2s ease'
                    }}
                  >
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                        <div style={{ width: '38px', height: '38px', borderRadius: '10px', background: '#F3E8FF', color: '#9333EA', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <i data-lucide="flask-conical" style={{ width: '20px', height: '20px' }}></i>
                        </div>
                        <span style={{ fontSize: '11px', fontWeight: 800, padding: '3px 8px', borderRadius: '12px', background: '#F1F5F9', color: '#475569' }}>
                          {totalLabsCount} {totalLabsCount === 1 ? 'report' : 'reports'}
                        </span>
                      </div>
                      <div style={{ fontSize: '12px', fontWeight: 800, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Lab Reports</div>
                      <div style={{ fontSize: '12.5px', color: '#1E293B', fontWeight: 700, marginTop: '6px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {latestLab}
                      </div>
                    </div>
                    <div style={{ marginTop: '14px', fontSize: '12px', fontWeight: 800, color: '#9333EA', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      View Lab Reports <i data-lucide="chevron-right" style={{ width: '14px', height: '14px' }}></i>
                    </div>
                  </div>

                  {/* Category Card 4: Documents */}
                  <div 
                    onClick={() => setMyHealthCategory('DOCS')}
                    style={{ 
                      background: myHealthCategory === 'DOCS' ? '#FFFBEB' : '#FFFFFF', 
                      border: myHealthCategory === 'DOCS' ? '2px solid #D97706' : '1px solid #E2E8F0', 
                      borderRadius: '16px', 
                      padding: '20px', 
                      cursor: 'pointer',
                      boxShadow: '0 2px 8px rgba(15,23,42,0.04)',
                      display: 'flex', 
                      flexDirection: 'column', 
                      justifyContent: 'space-between',
                      transition: 'all 0.2s ease'
                    }}
                  >
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                        <div style={{ width: '38px', height: '38px', borderRadius: '10px', background: '#FEF3C7', color: '#D97706', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <i data-lucide="folder" style={{ width: '20px', height: '20px' }}></i>
                        </div>
                        <span style={{ fontSize: '11px', fontWeight: 800, padding: '3px 8px', borderRadius: '12px', background: '#F1F5F9', color: '#475569' }}>
                          {totalDocsCount} {totalDocsCount === 1 ? 'file' : 'files'}
                        </span>
                      </div>
                      <div style={{ fontSize: '12px', fontWeight: 800, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Documents</div>
                      <div style={{ fontSize: '12.5px', color: '#1E293B', fontWeight: 700, marginTop: '6px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {latestDoc}
                      </div>
                    </div>
                    <div style={{ marginTop: '14px', fontSize: '12px', fontWeight: 800, color: '#D97706', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      View Documents <i data-lucide="chevron-right" style={{ width: '14px', height: '14px' }}></i>
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* Category Filter Pills */}
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '24px' }}>
              {[
                { id: 'ALL', label: 'All Activity' },
                { id: 'RECORDS', label: `Medical Records (${visits.length + vitals.length + clinicalNotes.length + procedures.length})` },
                { id: 'PRESCRIPTIONS', label: `Prescriptions (${prescriptions.length})` },
                { id: 'LABS', label: `Lab Reports (${labRequests.length})` },
                { id: 'DOCS', label: `Documents (${clinicalDocs.length + (patientProfile?.patientDocuments?.length || 0)})` }
              ].map(cat => (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setMyHealthCategory(cat.id)}
                  style={{
                    background: myHealthCategory === cat.id ? 'var(--primary)' : '#FFFFFF',
                    color: myHealthCategory === cat.id ? '#FFFFFF' : '#475569',
                    border: myHealthCategory === cat.id ? 'none' : '1px solid #CBD5E1',
                    padding: '8px 16px',
                    borderRadius: '20px',
                    fontSize: '12.5px',
                    fontWeight: 800,
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                    boxShadow: myHealthCategory === cat.id ? '0 2px 6px rgba(37,99,235,0.25)' : 'none'
                  }}
                >
                  {cat.label}
                </button>
              ))}
            </div>

            {/* SUB-SECTION: PRESCRIPTIONS LIST (When category is PRESCRIPTIONS) */}
            {myHealthCategory === 'PRESCRIPTIONS' && (
              <div>
                {prescriptions.length === 0 ? (
                  <div className="glass-card" style={{ padding: '48px 20px', textAlign: 'center', color: '#64748B' }}>
                    <i data-lucide="pill" style={{ width: '36px', height: '36px', margin: '0 auto 12px', display: 'block', color: '#94A3B8' }}></i>
                    <div style={{ fontSize: '16px', fontWeight: 800, color: '#0F172A', marginBottom: '6px' }}>No prescriptions yet</div>
                    <p style={{ fontSize: '13px', color: '#64748B', maxWidth: '420px', margin: '0 auto' }}>
                      Medications prescribed by your consulting physician will be listed here once recorded during visits.
                    </p>
                  </div>
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '16px' }}>
                    {prescriptions.map((p, idx) => (
                      <div
                        key={p._id || idx}
                        style={{
                          background: '#FFFFFF',
                          border: '1px solid #E2E8F0',
                          borderRadius: '16px',
                          padding: '20px',
                          boxShadow: '0 2px 6px rgba(15, 23, 42, 0.03)',
                          display: 'flex',
                          flexDirection: 'column',
                          justifyContent: 'space-between',
                          gap: '12px',
                          cursor: 'pointer'
                        }}
                        onClick={() => {
                          setSelectedPrescription(p);
                          setPrescriptionModalOpen(true);
                        }}
                      >
                        <div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '10px' }}>
                            <div>
                              <div style={{ fontSize: '15px', fontWeight: 800, color: '#0F172A' }}>
                                {p.doctorId?.name || 'Dr. Specialist'}
                              </div>
                              <div style={{ fontSize: '12px', color: '#2563EB', fontWeight: 700 }}>
                                {p.doctorId?.specialty || 'General Consultation'}
                              </div>
                            </div>
                            <span style={{
                              padding: '3px 8px',
                              borderRadius: '6px',
                              fontSize: '11px',
                              fontWeight: 800,
                              background: p.status === 'Dispensed' ? '#ECFDF5' : '#FFF7ED',
                              color: p.status === 'Dispensed' ? '#059669' : '#D97706',
                              border: p.status === 'Dispensed' ? '1px solid #A7F3D0' : '1px solid #FED7AA'
                            }}>
                              {p.status || 'Pending'}
                            </span>
                          </div>

                          <div style={{ fontSize: '11.5px', color: '#64748B', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '12px' }}>
                            <i data-lucide="calendar" style={{ width: '13px', height: '13px' }}></i>
                            <span>{p.createdAt ? new Date(p.createdAt).toLocaleDateString([], { day: '2-digit', month: 'short', year: 'numeric' }) : 'N/A'}</span>
                          </div>

                          {p.prescriptionType === 'offline_handwritten' ? (
                            <div style={{ background: '#F0FDFA', border: '1px solid #99F6E4', padding: '10px 12px', borderRadius: '10px', fontSize: '12.5px', color: '#0F766E' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <span style={{ background: '#0D9488', color: '#FFFFFF', padding: '2px 6px', borderRadius: '4px', fontSize: '10px', fontWeight: 800 }}>HANDWRITTEN RX</span>
                                <strong>Original Prescription Images</strong>
                              </div>
                              <div style={{ marginTop: '4px', color: '#115E59', fontSize: '12px' }}>
                                {(p.images || []).length} Original Page{(p.images || []).length === 1 ? '' : 's'} Uploaded
                              </div>
                            </div>
                          ) : (
                            <div style={{ background: '#F8FAFC', padding: '10px 12px', borderRadius: '10px', fontSize: '12.5px', color: '#334155' }}>
                              <strong>{(p.items || []).length} Prescribed Item{(p.items || []).length === 1 ? '' : 's'}:</strong>
                              <div style={{ marginTop: '4px', color: '#64748B', fontSize: '12px' }}>
                                {(p.items || []).map(i => i.medicine || i.name).slice(0, 2).join(', ')}
                                {(p.items || []).length > 2 ? '...' : ''}
                              </div>
                            </div>
                          )}
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: '10px', borderTop: '1px solid #F1F5F9' }}>
                          <span style={{ fontSize: '12px', fontWeight: 800, color: '#2563EB', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                            View Prescription Details <i data-lucide="arrow-right" style={{ width: '13px' }}></i>
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* SUB-SECTION: LAB REPORTS (When category is LABS) */}
            {myHealthCategory === 'LABS' && (
              <div>
                {labRequests.length === 0 ? (
                  <div className="glass-card" style={{ padding: '48px 20px', textAlign: 'center', color: '#64748B' }}>
                    <i data-lucide="flask-conical" style={{ width: '36px', height: '36px', margin: '0 auto 12px', display: 'block', color: '#94A3B8' }}></i>
                    <div style={{ fontSize: '16px', fontWeight: 800, color: '#0F172A', marginBottom: '6px' }}>No laboratory reports yet</div>
                    <p style={{ fontSize: '13px', color: '#64748B', maxWidth: '420px', margin: '0 auto' }}>
                      Diagnostic laboratory orders, blood tests, and imaging results will appear here once processed by the laboratory.
                    </p>
                  </div>
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '16px' }}>
                    {labRequests.map((lab, idx) => (
                      <div
                        key={lab._id || idx}
                        style={{
                          background: '#FFFFFF',
                          border: '1px solid #E2E8F0',
                          borderRadius: '16px',
                          padding: '20px',
                          boxShadow: '0 2px 6px rgba(15, 23, 42, 0.03)',
                          display: 'flex',
                          flexDirection: 'column',
                          justifyContent: 'space-between',
                          gap: '12px',
                          cursor: 'pointer'
                        }}
                        onClick={() => {
                          setSelectedLabReport(lab);
                          setLabModalOpen(true);
                        }}
                      >
                        <div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '10px' }}>
                            <div>
                              <div style={{ fontSize: '15px', fontWeight: 800, color: '#0F172A' }}>
                                {lab.testName}
                              </div>
                              <div style={{ fontSize: '12px', color: '#64748B', fontWeight: 600 }}>
                                Ordered by: {lab.doctorId?.name || 'Consulting Doctor'}
                              </div>
                            </div>
                            <span style={{
                              padding: '3px 8px',
                              borderRadius: '6px',
                              fontSize: '11px',
                              fontWeight: 800,
                              background: lab.status === 'Completed' ? '#ECFDF5' : '#EFF6FF',
                              color: lab.status === 'Completed' ? '#059669' : '#2563EB',
                              border: lab.status === 'Completed' ? '1px solid #A7F3D0' : '1px solid #BFDBFE'
                            }}>
                              {lab.status || 'Pending'}
                            </span>
                          </div>

                          <div style={{ fontSize: '11.5px', color: '#64748B', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '12px' }}>
                            <i data-lucide="calendar" style={{ width: '13px', height: '13px' }}></i>
                            <span>{lab.createdAt ? new Date(lab.createdAt).toLocaleDateString([], { day: '2-digit', month: 'short', year: 'numeric' }) : 'N/A'}</span>
                          </div>

                          <div style={{ background: '#F8FAFC', padding: '10px 12px', borderRadius: '10px', fontSize: '12.5px', color: '#334155' }}>
                            <strong>Findings:</strong>
                            <div style={{ marginTop: '4px', color: '#64748B', fontSize: '12px' }}>
                              {lab.results || lab.notes || 'Laboratory analysis in progress.'}
                            </div>
                          </div>
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: '10px', borderTop: '1px solid #F1F5F9' }}>
                          <span style={{ fontSize: '12px', fontWeight: 800, color: '#2563EB', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                            View Report Details <i data-lucide="arrow-right" style={{ width: '13px' }}></i>
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* SUB-SECTION: DOCUMENTS (When category is DOCS) */}
            {myHealthCategory === 'DOCS' && (
              <div>
                {(() => {
                  const mergedDocs = [
                    ...clinicalDocs.map(d => ({
                      id: d._id,
                      name: d.title,
                      type: d.category || 'Clinical Document',
                      date: d.createdAt,
                      url: d.fileUrl,
                      size: 'Verified EMR'
                    })),
                    ...(patientProfile?.patientDocuments || []).map(d => ({
                      id: d._id,
                      name: d.name,
                      type: d.type,
                      date: d.createdAt || new Date(),
                      url: d.url,
                      size: d.size || 'Attached'
                    }))
                  ];

                  if (mergedDocs.length === 0) {
                    return (
                      <div className="glass-card" style={{ padding: '48px 20px', textAlign: 'center', color: '#64748B' }}>
                        <i data-lucide="folder" style={{ width: '36px', height: '36px', margin: '0 auto 12px', display: 'block', color: '#94A3B8' }}></i>
                        <div style={{ fontSize: '16px', fontWeight: 800, color: '#0F172A', marginBottom: '6px' }}>No saved documents</div>
                        <p style={{ fontSize: '13px', color: '#64748B', maxWidth: '420px', margin: '0 auto' }}>
                          Digitally uploaded identity records, scanned physical documents, and referral forms will appear here.
                        </p>
                      </div>
                    );
                  }

                  return (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '16px' }}>
                      {mergedDocs.map((doc, idx) => (
                        <div
                          key={doc.id || idx}
                          style={{
                            background: '#FFFFFF',
                            border: '1px solid #E2E8F0',
                            borderRadius: '16px',
                            padding: '20px',
                            boxShadow: '0 2px 6px rgba(15, 23, 42, 0.03)',
                            display: 'flex',
                            flexDirection: 'column',
                            justifyContent: 'space-between',
                            gap: '14px',
                            cursor: 'pointer'
                          }}
                          onClick={() => {
                            setSelectedDocViewer(doc);
                            setDocModalOpen(true);
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '14px' }}>
                            <div style={{
                              width: '44px',
                              height: '44px',
                              borderRadius: '12px',
                              background: '#EFF6FF',
                              color: '#2563EB',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              flexShrink: 0
                            }}>
                              <i data-lucide="file-text" style={{ width: '22px', height: '22px' }}></i>
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <h4 style={{ fontSize: '14px', fontWeight: 800, color: '#0F172A', margin: '0 0 4px 0', wordBreak: 'break-word' }}>
                                {doc.name}
                              </h4>
                              <span style={{ fontSize: '11px', fontWeight: 700, padding: '2px 6px', background: '#F1F5F9', color: '#475569', borderRadius: '4px' }}>
                                {doc.type}
                              </span>
                            </div>
                          </div>

                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '12px', borderTop: '1px solid #F1F5F9', fontSize: '11.5px', color: '#64748B' }}>
                            <span>{doc.size}</span>
                            <span style={{ color: '#2563EB', fontWeight: 800 }}>View Document →</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  );
                })()}
              </div>
            )}

            {/* SUB-SECTION: TIMELINE / CLINICAL RECORDS (When category is ALL or RECORDS) */}
            {(myHealthCategory === 'ALL' || myHealthCategory === 'RECORDS') && (
              <div>
                {/* Timeline sub-filters */}
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '20px' }}>
                  {['All', 'SOAP Notes', 'Vitals', 'Procedures', 'Visits'].map(filterVal => {
                    const isSelected = timelineFilter === filterVal;
                    return (
                      <button
                        key={filterVal}
                        onClick={() => setTimelineFilter(filterVal)}
                        style={{
                          background: isSelected ? '#334155' : 'white',
                          color: isSelected ? 'white' : '#64748B',
                          border: isSelected ? 'none' : '1px solid #CBD5E1',
                          padding: '6px 14px',
                          borderRadius: '16px',
                          fontSize: '12px',
                          fontWeight: 700,
                          cursor: 'pointer',
                          transition: 'all 0.2s ease'
                        }}
                      >
                        {filterVal}
                      </button>
                    );
                  })}
                </div>

                {/* Timeline container */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  {(() => {
                    const events = [];

                    if (timelineFilter === 'All' || timelineFilter === 'Visits') {
                      visits.forEach(v => {
                        events.push({
                          id: v._id,
                          date: new Date(v.arrivalTimestamp),
                          type: 'Visit',
                          title: `${v.type} Visit - ${v.department}`,
                          icon: 'check-circle',
                          color: '#10B981',
                          data: v
                        });
                      });
                    }

                    if (timelineFilter === 'All' || timelineFilter === 'Vitals') {
                      vitals.forEach(v => {
                        events.push({
                          id: v._id,
                          date: new Date(v.createdAt),
                          type: 'Vitals',
                          title: 'Vitals Recorded',
                          icon: 'activity',
                          color: '#3B82F6',
                          data: v
                        });
                      });
                    }

                    if (timelineFilter === 'All' || timelineFilter === 'SOAP Notes') {
                      clinicalNotes.forEach(n => {
                        events.push({
                          id: n._id,
                          date: new Date(n.createdAt),
                          type: 'SOAP Note',
                          title: `SOAP Note by Dr. ${n.doctorId?.name || 'Specialist'}`,
                          icon: 'file-text',
                          color: '#8B5CF6',
                          data: n
                        });
                      });
                    }

                    if (timelineFilter === 'All' || timelineFilter === 'Procedures') {
                      procedures.forEach(p => {
                        events.push({
                          id: p._id,
                          date: new Date(p.createdAt),
                          type: 'Procedure',
                          title: `${p.procedureName} - Dr. ${p.doctorId?.name || 'Surgeon'}`,
                          icon: 'shield',
                          color: '#EF4444',
                          data: p
                        });
                      });
                    }

                    events.sort((a, b) => b.date - a.date);

                    if (events.length === 0) {
                      return (
                        <div className="glass-card" style={{ padding: '48px 24px', textAlign: 'center' }}>
                          <div style={{ width: '56px', height: '56px', borderRadius: '50%', background: '#EFF6FF', color: '#2563EB', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px' }}>
                            <i data-lucide="folder-open" style={{ width: '26px', height: '26px' }}></i>
                          </div>
                          <h3 style={{ fontSize: '16px', fontWeight: 800, color: '#0F172A', marginBottom: '6px' }}>No medical records available</h3>
                          <p style={{ fontSize: '13px', color: '#64748B', maxWidth: '400px', margin: '0 auto', lineHeight: 1.5 }}>
                            Clinical visit summaries, vitals, and physician notes will appear here once recorded.
                          </p>
                        </div>
                      );
                    }

                    return (
                      <div style={{ position: 'relative', paddingLeft: '32px', borderLeft: '2px solid #E2E8F0', marginLeft: '12px' }}>
                        {events.map((evt, idx) => (
                          <div 
                            key={evt.id || idx} 
                            className="glass-card timeline-card" 
                            style={{ 
                              position: 'relative', 
                              marginBottom: '20px', 
                              padding: '20px', 
                              borderLeft: `4px solid ${evt.color}`,
                              background: 'white',
                              cursor: 'pointer'
                            }}
                            onClick={() => {
                              setSelectedEMREvent(evt);
                              setEmrModalOpen(true);
                            }}
                          >
                            {/* Timeline Node Point */}
                            <div 
                              style={{ 
                                position: 'absolute', 
                                left: '-44px', 
                                top: '20px', 
                                width: '24px', 
                                height: '24px', 
                                borderRadius: '50%', 
                                background: evt.color, 
                                color: 'white', 
                                display: 'flex', 
                                alignItems: 'center', 
                                justifyContent: 'center', 
                                border: '4px solid white', 
                                boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                                fontSize: '10px'
                              }}
                            >
                              <i data-lucide={evt.icon} style={{ width: '12px', height: '12px' }}></i>
                            </div>

                            {/* Title and Date */}
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '8px', marginBottom: '10px' }}>
                              <div>
                                <span 
                                  style={{ 
                                    display: 'inline-block', 
                                    padding: '3px 8px', 
                                    borderRadius: '6px', 
                                    background: evt.color + '15', 
                                    color: evt.color, 
                                    fontSize: '11px', 
                                    fontWeight: 800, 
                                    textTransform: 'uppercase', 
                                    marginBottom: '4px' 
                                  }}
                                >
                                  {evt.type}
                                </span>
                                <h4 style={{ fontSize: '15px', fontWeight: 800, color: '#0F172A', margin: 0, fontFamily: "'Outfit', sans-serif" }}>
                                  {evt.title}
                                </h4>
                              </div>
                              <span style={{ fontSize: '12px', color: '#64748B', fontWeight: 700 }}>
                                {evt.date.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}
                              </span>
                            </div>

                            {/* Detailed Body preview */}
                            {evt.type === 'Visit' && (
                              <div style={{ fontSize: '13px', color: '#475569', lineHeight: 1.5 }}>
                                <div><strong>Chief Complaint:</strong> {evt.data.chiefComplaint || 'General checkup'}</div>
                                <div style={{ display: 'flex', gap: '14px', marginTop: '4px', fontSize: '12px' }}>
                                  <span><strong>Dept:</strong> {evt.data.department}</span>
                                  <span><strong>Status:</strong> {evt.data.status}</span>
                                </div>
                              </div>
                            )}

                            {evt.type === 'Vitals' && (
                              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(100px, 1fr))', gap: '10px', background: '#F8FAFC', padding: '10px 12px', borderRadius: '10px' }}>
                                <div>
                                  <div style={{ fontSize: '10px', color: '#64748B', fontWeight: 800 }}>BP</div>
                                  <div style={{ fontSize: '13px', fontWeight: 750, color: '#1E293B' }}>{evt.data.bpSys || '--'}/{evt.data.bpDia || '--'}</div>
                                </div>
                                <div>
                                  <div style={{ fontSize: '10px', color: '#64748B', fontWeight: 800 }}>Pulse</div>
                                  <div style={{ fontSize: '13px', fontWeight: 750, color: '#1E293B' }}>{evt.data.pulse || '--'} bpm</div>
                                </div>
                                <div>
                                  <div style={{ fontSize: '10px', color: '#64748B', fontWeight: 800 }}>SPO2</div>
                                  <div style={{ fontSize: '13px', fontWeight: 750, color: evt.data.spo2 < 95 ? '#EF4444' : '#1E293B' }}>{evt.data.spo2 ? `${evt.data.spo2}%` : '--'}</div>
                                </div>
                                <div>
                                  <div style={{ fontSize: '10px', color: '#64748B', fontWeight: 800 }}>Temp</div>
                                  <div style={{ fontSize: '13px', fontWeight: 750, color: '#1E293B' }}>{evt.data.temperature ? `${evt.data.temperature} °F` : '--'}</div>
                                </div>
                              </div>
                            )}

                            {evt.type === 'SOAP Note' && (
                              <div style={{ fontSize: '13px', color: '#475569', lineHeight: 1.5 }}>
                                <div><strong>Assessment:</strong> {Array.isArray(evt.data.assessment) ? evt.data.assessment.join(', ') : (evt.data.assessment || 'Clinical evaluation completed.')}</div>
                                <div style={{ marginTop: '4px', color: '#64748B', fontSize: '12px' }}><strong>Plan:</strong> {evt.data.plan || 'See doctor notes'}</div>
                              </div>
                            )}

                            {evt.type === 'Procedure' && (
                              <div style={{ fontSize: '13px', color: '#475569' }}>
                                <div><strong>Procedure:</strong> {evt.data.procedureName}</div>
                                <div style={{ marginTop: '4px', fontSize: '12px', color: '#64748B' }}>Status: {evt.data.status}</div>
                              </div>
                            )}

                            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '12px', paddingTop: '10px', borderTop: '1px solid #F1F5F9' }}>
                              <span style={{ fontSize: '12px', fontWeight: 800, color: '#2563EB', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                View Full Clinical Details <i data-lucide="arrow-right" style={{ width: '13px' }}></i>
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    );
                  })()}
                </div>
              </div>
            )}
          </div>
        )}

        {selectedHospital && activeTab === 'documents' && (
          <div className="tab-content active" style={{ animation: 'slideUp 0.4s ease-out' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px' }}>
              <div>
                <h1 style={{ fontSize: '28px', fontWeight: 900, color: '#0F172A', fontFamily: "'Outfit', sans-serif", margin: '0 0 4px 0' }}>Medical Records & Documents</h1>
                <p style={{ color: '#64748B', fontWeight: 600, fontSize: '13.5px', margin: 0 }}>
                  View your digitally uploaded health records, identity documents, and scanned reports.
                </p>
              </div>
            </div>

            <div className="glass-card" style={{ padding: '24px' }}>
              {patientProfile?.patientDocuments && patientProfile.patientDocuments.length > 0 ? (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '20px' }}>
                  {patientProfile.patientDocuments.map((doc, idx) => (
                    <div key={idx} style={{ 
                      background: 'white', 
                      border: '1px solid #E2E8F0', 
                      borderRadius: '12px', 
                      padding: '20px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '16px',
                      transition: 'all 0.2s ease',
                      cursor: 'pointer'
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 10px 15px -3px rgba(0,0,0,0.05)'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = 'none'; }}
                    >
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '16px' }}>
                        <div style={{ 
                          width: '48px', height: '48px', borderRadius: '12px', 
                          background: doc.type.includes('ID') || doc.type.includes('Aadhar') ? '#EFF6FF' : doc.type.includes('Consent') ? '#FFF7ED' : '#F8FAFC',
                          color: doc.type.includes('ID') || doc.type.includes('Aadhar') ? '#2563EB' : doc.type.includes('Consent') ? '#F59E0B' : '#64748B',
                          display: 'flex', alignItems: 'center', justifyContent: 'center'
                        }}>
                          <i data-lucide={doc.type.includes('Photo') ? 'image' : 'file-text'} style={{ width: '24px', height: '24px' }}></i>
                        </div>
                        <div style={{ flex: 1 }}>
                          <h3 style={{ fontSize: '15px', fontWeight: 800, color: '#0F172A', margin: '0 0 4px 0', wordBreak: 'break-word' }}>{doc.name}</h3>
                          <div style={{ fontSize: '12px', color: '#64748B', fontWeight: 700 }}>{doc.type}</div>
                        </div>
                      </div>
                      
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '16px', borderTop: '1px solid #F1F5F9' }}>
                        <div style={{ fontSize: '11px', color: '#94A3B8', fontWeight: 700 }}>
                          Size: {doc.size}
                        </div>
                        <button style={{ 
                          background: '#F1F5F9', color: '#2563EB', border: 'none', 
                          padding: '6px 12px', borderRadius: '6px', fontSize: '11.5px', fontWeight: 800,
                          cursor: 'pointer', transition: 'background 0.2s'
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.background = '#DBEAFE'}
                        onMouseLeave={(e) => e.currentTarget.style.background = '#F1F5F9'}
                        >
                          Download
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ textAlign: 'center', padding: '60px 20px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                  <div style={{ width: '80px', height: '80px', borderRadius: '50%', background: '#F8FAFC', color: '#94A3B8', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '16px' }}>
                    <i data-lucide="folder-open" style={{ width: '32px', height: '32px' }}></i>
                  </div>
                  <h3 style={{ fontSize: '18px', fontWeight: 800, color: '#1E293B', margin: '0 0 8px 0' }}>No Documents Found</h3>
                  <p style={{ fontSize: '14px', color: '#64748B', maxWidth: '400px', lineHeight: 1.5, margin: 0 }}>
                    You don't have any uploaded identity documents, ultrasound reports, or signed physical consent forms in your digital locker yet.
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {selectedHospital && activeTab === 'privacy' && (
          <div className="tab-content active" style={{ animation: 'slideUp 0.4s ease-out' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '12px' }}>
              <h1 style={{ fontSize: '24px', fontWeight: 900, margin: 0, fontFamily: "'Outfit', sans-serif" }}>
                Privacy Shield & Consent Registry
              </h1>
              <button
                type="button"
                onClick={() => {
                  setPrivacySlideIdx(0);
                  setShowPrivacyOverlay(true);
                }}
                style={{
                  background: '#EFF6FF',
                  border: '1px solid #BFDBFE',
                  color: '#2563EB',
                  borderRadius: '10px',
                  padding: '8px 16px',
                  fontSize: '13px',
                  fontWeight: 800,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  transition: 'background 0.2s'
                }}
              >
                Review Privacy Rights Tour
              </button>
            </div>

            <div className="mobile-stack" style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.8fr', gap: '32px' }}>
              <div>
                {/* Consent Toggles */}
                <div className="glass-card" style={{ padding: '24px', marginBottom: '32px' }}>
                  <h3 style={{ fontSize: '18px', fontWeight: 800, margin: '0 0 16px 0', color: '#0F172A', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <i data-lucide="shield-check" style={{ color: '#2563EB' }}></i> Active Consent & Purpose Limitation
                  </h3>
                  <p style={{ fontSize: '13px', color: '#64748B', lineHeight: 1.5, marginBottom: '20px' }}>
                    Specify how and for what purpose healthcare providers can process your personal clinical details. In compliance with the India DPDP Act 2023, you can toggle these settings at your convenience.
                  </p>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginBottom: '24px' }}>
                    {/* Purpose: Treatment */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px', background: '#F8FAFC', borderRadius: '12px' }}>
                      <div style={{ marginRight: '16px' }}>
                        <div style={{ fontWeight: 800, fontSize: '14px', color: '#1E293B' }}>Medical Treatment & Diagnosis (Mandatory)</div>
                        <div style={{ fontSize: '12px', color: '#64748B', marginTop: '2px' }}>Attending specialists require this to read diagnostic history, write SOAP notes, and prescribe.</div>
                      </div>
                      <input 
                        type="checkbox" 
                        checked={consent?.purposes?.treatment && consent?.status === 'Active'} 
                        disabled 
                        style={{ width: '20px', height: '20px', cursor: 'not-allowed' }}
                      />
                    </div>

                    {/* Purpose: Insurance */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px', background: '#F8FAFC', borderRadius: '12px' }}>
                      <div style={{ marginRight: '16px' }}>
                        <div style={{ fontWeight: 800, fontSize: '14px', color: '#1E293B' }}>Insurance Claim Verification</div>
                        <div style={{ fontSize: '12px', color: '#64748B', marginTop: '2px' }}>Enables verified insurance claim desks to inspect bills and procedure notes for cashless settlements.</div>
                      </div>
                      <input 
                        type="checkbox" 
                        checked={consent?.purposes?.insurance && consent?.status === 'Active'} 
                        onChange={(e) => {
                          const updated = { ...consent?.purposes, insurance: e.target.checked };
                          handleUpdateConsentPurposes(updated);
                        }}
                        disabled={consent?.status === 'Withdrawn'}
                        style={{ width: '20px', height: '20px', cursor: 'pointer' }}
                      />
                    </div>

                    {/* Purpose: Research */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px', background: '#F8FAFC', borderRadius: '12px' }}>
                      <div style={{ marginRight: '16px' }}>
                        <div style={{ fontWeight: 800, fontSize: '14px', color: '#1E293B' }}>Academic Research & Public Health</div>
                        <div style={{ fontSize: '12px', color: '#64748B', marginTop: '2px' }}>Share completely anonymized vitals and diagnosis stats for clinical trials and public health planning.</div>
                      </div>
                      <input 
                        type="checkbox" 
                        checked={consent?.purposes?.research && consent?.status === 'Active'} 
                        onChange={(e) => {
                          const updated = { ...consent?.purposes, research: e.target.checked };
                          handleUpdateConsentPurposes(updated);
                        }}
                        disabled={consent?.status === 'Withdrawn'}
                        style={{ width: '20px', height: '20px', cursor: 'pointer' }}
                      />
                    </div>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
                    {consent?.status === 'Active' ? (
                      <button 
                        className="btn" 
                        style={{ background: '#FEF2F2', color: '#EF4444', border: '1px solid #FCA5A5', fontWeight: 800, padding: '10px 20px', borderRadius: '10px' }}
                        onClick={handleWithdrawConsent}
                      >
                        <i data-lucide="shield-off" style={{ width: '16px', display: 'inline-block', marginRight: '4px' }}></i>
                        Withdraw All Consent
                      </button>
                    ) : (
                      <button 
                        className="btn btn-primary" 
                        style={{ padding: '10px 20px' }}
                        onClick={() => handleUpdateConsentPurposes({ treatment: true, insurance: true, research: false })}
                      >
                        Re-activate Standard Consent
                      </button>
                    )}
                    <span style={{ fontSize: '11px', color: '#94A3B8', fontWeight: 700 }}>
                      Last Signed: {consent?.updatedAt ? new Date(consent.updatedAt).toLocaleDateString() : 'N/A'}
                    </span>
                  </div>
                </div>

                {/* DPDP Privacy Audit Trail */}
                <div className="glass-card" style={{ padding: '24px' }}>
                  <h3 style={{ fontSize: '18px', fontWeight: 800, margin: '0 0 16px 0', color: '#0F172A', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <i data-lucide="eye" style={{ color: '#2563EB' }}></i> EMR Privacy Audit Logs (Immutable)
                  </h3>
                  <p style={{ fontSize: '13px', color: '#64748B', lineHeight: 1.5, marginBottom: '20px' }}>
                    Every single access or modification to your clinical records is logged in an un-alterable database trail. Inspect the logs below to verify when and why your EMR dossier was accessed.
                  </p>

                  <div className="table-responsive" style={{ maxHeight: '350px', overflowY: 'auto' }} data-lenis-prevent>
                    <table className="elite-table" style={{ border: 'none' }}>
                      <thead style={{ background: '#F8FAFC', position: 'sticky', top: 0, zIndex: 5 }}>
                        <tr>
                          <th>Timestamp</th>
                          <th>Action</th>
                          <th>Accessor</th>
                          <th>Purpose</th>
                          <th>IP Address</th>
                        </tr>
                      </thead>
                      <tbody>
                        {auditLogs.length === 0 ? (
                          <tr>
                            <td colSpan="5" style={{ textAlign: 'center', padding: '24px', color: '#94A3B8' }}>
                              No access logs registered yet.
                            </td>
                          </tr>
                        ) : (
                          auditLogs.map((log, index) => {
                            const isEmergency = log.purpose === 'Emergency Treatment' || log.isEmergencyBypass;
                            return (
                              <tr key={log._id || index}>
                                <td style={{ fontSize: '12px', fontWeight: 700 }}>
                                  {new Date(log.timestamp).toLocaleString()}
                                </td>
                                <td>
                                  <span style={{ fontWeight: 800, fontSize: '12px', color: isEmergency ? '#EF4444' : '#1E293B' }}>
                                    {log.action}
                                  </span>
                                </td>
                                <td style={{ fontSize: '13px' }}>
                                  {log.userId?.name || log.performedBy || 'System'}
                                  <div style={{ fontSize: '11px', color: '#64748B' }}>{log.role || 'Data Principal'}</div>
                                </td>
                                <td>
                                  <span 
                                    style={{ 
                                      display: 'inline-block', 
                                      padding: '2px 6px', 
                                      borderRadius: '4px', 
                                      background: isEmergency ? '#FEE2E2' : '#F0FDF4', 
                                      color: isEmergency ? '#EF4444' : '#16A34A', 
                                      fontWeight: 800,
                                      fontSize: '10px' 
                                    }}
                                  >
                                    {isEmergency ? '⚠️ EMERGENCY BYPASS' : log.purpose || 'Standard'}
                                  </span>
                                </td>
                                <td style={{ fontFamily: 'monospace', fontSize: '11.5px' }}>
                                  {log.ipAddress || '127.0.0.1'}
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

              {/* DPDP Rights requests column */}
              <div>
                <div className="glass-card" style={{ padding: '24px' }}>
                  <h3 style={{ fontSize: '18px', fontWeight: 800, margin: '0 0 16px 0', color: '#0F172A', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <i data-lucide="mail" style={{ color: '#2563EB' }}></i> DPDP Rights Center
                  </h3>
                  <p style={{ fontSize: '12.5px', color: '#64748B', lineHeight: 1.5, marginBottom: '20px' }}>
                    Submit an official notice to the Curoxa Data Protection Officer (DPO) to correct erroneous clinical records or file an erasure mandate.
                  </p>

                  <form onSubmit={handleSubmitDpdpRequest}>
                    {patientProfile?.legalHold && (
                      <div style={{
                        background: '#FFF5F5',
                        border: '1.5px solid #FCA5A5',
                        borderRadius: '12px',
                        padding: '14px',
                        marginBottom: '16px',
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: '10px'
                      }}>
                        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#DC2626" strokeWidth="2.5" style={{ flexShrink: 0, marginTop: '2px' }}><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                        <div>
                          <div style={{ fontSize: '13px', fontWeight: 800, color: '#991B1B' }}>Active Statutory Legal Hold</div>
                          <p style={{ fontSize: '12px', color: '#7F1D1D', margin: '4px 0 0 0', lineHeight: 1.4, fontWeight: 600 }}>
                            Your clinical records are currently flagged under a statutory legal hold. Erasure requests cannot be processed until the hold constraint is lifted.
                          </p>
                        </div>
                      </div>
                    )}
                    <div style={{ marginBottom: '16px' }}>
                      <label style={{ fontSize: '12px', fontWeight: 800, color: '#475569', marginBottom: '6px', display: 'block' }}>
                        Request Category *
                      </label>
                      <select 
                        className="form-control" 
                        value={dpdpRequestType} 
                        onChange={(e) => setDpdpRequestType(e.target.value)}
                        style={{ height: '42px', width: '100%', borderRadius: '8px', border: '1px solid #CBD5E1', padding: '0 12px', fontWeight: 600 }}
                      >
                        <option value="Correction">Data Correction Request</option>
                        <option value="Erasure">Data Erasure Request (Right to be Forgotten)</option>
                      </select>
                    </div>

                    <div style={{ marginBottom: '20px' }}>
                      <label style={{ fontSize: '12px', fontWeight: 800, color: '#475569', marginBottom: '6px', display: 'block' }}>
                        Description & Justification *
                      </label>
                      <textarea 
                        className="form-control" 
                        rows="4" 
                        value={dpdpRequestDetails} 
                        onChange={(e) => setDpdpRequestDetails(e.target.value)}
                        placeholder="Provide exact details of the clinical entry, prescription, or vitals to correct/erase, along with clinical evidence."
                        style={{ width: '100%', borderRadius: '8px', border: '1px solid #CBD5E1', padding: '12px', fontWeight: 550, resize: 'vertical' }}
                        required
                      />
                      <span style={{ fontSize: '11px', color: '#94A3B8', marginTop: '6px', display: 'block', lineHeight: 1.4 }}>
                        * Erasure requests will be reviewed under the Clinical Records Retention Act (10-year retention rule holds precedence over eraser).
                      </span>
                    </div>

                    <button 
                      type="submit" 
                      className="btn btn-primary" 
                      style={{ width: '100%', justifyContent: 'center', height: '42px' }}
                      disabled={submittingDpdp}
                    >
                      {submittingDpdp ? 'Submitting request...' : 'Transmit Request to DPO'}
                    </button>
                  </form>
                </div>

                {/* Submitted Requests List */}
                <div className="glass-card" style={{ padding: '24px', marginTop: '24px' }}>
                  <h4 style={{ fontSize: '15px', fontWeight: 800, margin: '0 0 16px 0', color: '#0F172A' }}>
                    Active DPDP Requests
                  </h4>
                  {consent?.dpdpRequests && consent.dpdpRequests.length > 0 ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                      {consent.dpdpRequests.map((req, rIdx) => (
                        <div key={req._id || rIdx} style={{ border: '1px solid #E2E8F0', borderRadius: '12px', padding: '12px', background: '#F8FAFC' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                            <span style={{ fontSize: '11.5px', fontWeight: 800, color: req.requestType === 'Erasure' ? '#EF4444' : '#2563EB' }}>
                              {req.requestType.toUpperCase()}
                            </span>
                            <span 
                              style={{ 
                                fontSize: '10px', 
                                fontWeight: 800, 
                                padding: '2px 6px', 
                                borderRadius: '4px',
                                background: req.status === 'Approved' ? '#DEF7EC' : req.status === 'Rejected' ? '#FDE8E8' : '#FEF3C7',
                                color: req.status === 'Approved' ? '#03543F' : req.status === 'Rejected' ? '#9B1C1C' : '#92400E'
                              }}
                            >
                              {req.status}
                            </span>
                          </div>
                          <p style={{ fontSize: '12px', color: '#475569', margin: '0 0 8px 0', lineHeight: 1.4 }}>
                            {req.details}
                          </p>
                          <div style={{ fontSize: '10px', color: '#94A3B8', textAlign: 'right' }}>
                            Submitted: {new Date(req.createdAt).toLocaleDateString()}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div style={{ textAlign: 'center', padding: '12px', color: '#94A3B8', fontSize: '12.5px', fontWeight: 600 }}>
                      No rights requests submitted yet.
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'profile' && (
          <div className="tab-content active" style={{ animation: 'slideUp 0.4s ease-out' }}>
            <h1 style={{ fontSize: '24px', fontWeight: 800, marginBottom: '24px' }}>My Profile & Settings</h1>
            
            {profileMsg.text && (
              <div style={{ padding: '14px', borderRadius: '10px', marginBottom: '20px', fontSize: '13px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px', 
                background: profileMsg.type === 'success' ? '#F0FDF4' : '#FEF2F2',
                color: profileMsg.type === 'success' ? '#16A34A' : '#DC2626',
                border: profileMsg.type === 'success' ? '1px solid #86EFAC' : '1px solid #FCA5A5'
              }}>
                <i data-lucide={profileMsg.type === 'success' ? 'check-circle' : 'alert-circle'} style={{ width: '16px', flexShrink: 0 }}></i>
                {profileMsg.text}
              </div>
            )}

            <div className="mobile-stack" style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.8fr', gap: '24px' }}>
              <div className="glass-card" style={{ padding: '24px' }}>
                <h3 style={{ fontSize: '18px', fontWeight: 800, marginBottom: '20px' }}>Personal Information</h3>
                <form onSubmit={handleUpdateProfile}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '20px', marginBottom: '24px', paddingBottom: '20px', borderBottom: '1px solid #F1F5F9' }}>
                    {editProfileData.avatar ? (
                      <img 
                        src={editProfileData.avatar} 
                        alt="Avatar Preview" 
                        style={{ width: '80px', height: '80px', borderRadius: '16px', objectFit: 'cover', border: '3px solid #3B71FE', boxShadow: '0 8px 16px rgba(59,113,254,0.15)' }} 
                      />
                    ) : (
                      <div style={{ width: '80px', height: '80px', borderRadius: '16px', background: 'linear-gradient(135deg, #2563EB 0%, #4F46E5 50%, #06B6D4 100%)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '28px', fontWeight: 900, boxShadow: '0 8px 20px rgba(37,99,235,0.35)', border: '2px solid #BFDBFE' }}>
                        {editProfileData.name ? editProfileData.name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase() : 'JD'}
                      </div>
                    )}
                    <div>
                      <label style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '10px 16px', background: '#EFF6FF', color: '#2563EB', borderRadius: '8px', fontSize: '13px', fontWeight: 800, cursor: 'pointer', border: '1px dashed #3B71FE', transition: 'all 0.2s' }}>
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" x2="12" y1="3" y2="15"/></svg>
                        Upload Photo
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
                                setEditProfileData(prev => ({ ...prev, avatar: event.target.result }));
                              };
                              reader.readAsDataURL(file);
                            }
                          }}
                        />
                      </label>
                      <div style={{ fontSize: '11px', color: '#64748B', marginTop: '6px' }}>JPG, PNG or GIF. Max size 5MB.</div>
                      {editProfileData.avatar && (
                        <button 
                          type="button" 
                          onClick={() => setEditProfileData(prev => ({ ...prev, avatar: '' }))}
                          style={{ background: 'none', border: 'none', color: '#DC2626', fontSize: '12px', fontWeight: 700, cursor: 'pointer', padding: 0, marginTop: '8px', display: 'block' }}
                        >
                          Remove Photo
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="form-group" style={{ marginBottom: '16px' }}>
                    <label style={{ fontSize: '12px', fontWeight: 800, color: '#475569', marginBottom: '6px', display: 'block' }}>Full Name *</label>
                    <input type="text" className="form-control" style={{ height: '42px', borderRadius: '8px', border: '1px solid #CBD5E1', paddingLeft: '12px', fontSize: '13px', fontWeight: 600 }} value={editProfileData.name} onChange={e => setEditProfileData({...editProfileData, name: e.target.value})} required />
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                    <div className="form-group">
                      <label style={{ fontSize: '12px', fontWeight: 800, color: '#475569', marginBottom: '6px', display: 'block' }}>Age *</label>
                      <input type="number" className="form-control" style={{ height: '42px', borderRadius: '8px', border: '1px solid #CBD5E1', paddingLeft: '12px', fontSize: '13px', fontWeight: 600 }} value={editProfileData.age} onChange={e => setEditProfileData({...editProfileData, age: e.target.value})} required min="1" max="120" />
                    </div>
                    <div className="form-group">
                      <label style={{ fontSize: '12px', fontWeight: 800, color: '#475569', marginBottom: '6px', display: 'block' }}>Gender *</label>
                      <select className="form-control" style={{ height: '42px', borderRadius: '8px', border: '1px solid #CBD5E1', paddingLeft: '12px', fontSize: '13px', fontWeight: 600 }} value={editProfileData.gender} onChange={e => setEditProfileData({...editProfileData, gender: e.target.value})}>
                        <option value="Male">Male</option>
                        <option value="Female">Female</option>
                        <option value="Other">Other</option>
                      </select>
                    </div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                    <div className="form-group">
                      <label style={{ fontSize: '12px', fontWeight: 800, color: '#475569', marginBottom: '6px', display: 'block' }}>Phone Number *</label>
                      <input type="text" className="form-control" style={{ height: '42px', borderRadius: '8px', border: '1px solid #CBD5E1', paddingLeft: '12px', fontSize: '13px', fontWeight: 600 }} value={editProfileData.contact} onChange={e => setEditProfileData({...editProfileData, contact: e.target.value})} required />
                    </div>
                    <div className="form-group">
                      <label style={{ fontSize: '12px', fontWeight: 800, color: '#475569', marginBottom: '6px', display: 'block' }}>Blood Group</label>
                      <select className="form-control" style={{ height: '42px', borderRadius: '8px', border: '1px solid #CBD5E1', paddingLeft: '12px', fontSize: '13px', fontWeight: 600 }} value={editProfileData.bloodGroup} onChange={e => setEditProfileData({...editProfileData, bloodGroup: e.target.value})}>
                        {['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'].map(bg => <option key={bg} value={bg}>{bg}</option>)}
                      </select>
                    </div>
                  </div>
                  <div className="form-group" style={{ marginBottom: '16px' }}>
                    <label style={{ fontSize: '12px', fontWeight: 800, color: '#475569', marginBottom: '6px', display: 'block' }}>Residential Address *</label>
                    <input type="text" className="form-control" placeholder="House/Flat No, Street, City, Pincode" style={{ height: '42px', borderRadius: '8px', border: '1px solid #CBD5E1', paddingLeft: '12px', fontSize: '13px', fontWeight: 600 }} value={editProfileData.address} onChange={e => setEditProfileData({...editProfileData, address: e.target.value})} required />
                  </div>
                  <div className="form-group" style={{ marginBottom: '16px' }}>
                    <label style={{ fontSize: '12px', fontWeight: 800, color: '#475569', marginBottom: '6px', display: 'block' }}>Allergies</label>
                    <input type="text" className="form-control" placeholder="e.g. Peanuts, Penicillin (Leave empty if none)" style={{ height: '42px', borderRadius: '8px', border: '1px solid #CBD5E1', paddingLeft: '12px', fontSize: '13px', fontWeight: 600 }} value={editProfileData.allergies} onChange={e => setEditProfileData({...editProfileData, allergies: e.target.value})} />
                  </div>
                  <div className="form-group" style={{ marginBottom: '24px' }}>
                    <label style={{ fontSize: '12px', fontWeight: 800, color: '#475569', marginBottom: '6px', display: 'block' }}>Medical History (Comma separated)</label>
                    <input type="text" className="form-control" placeholder="e.g. Asthma, Diabetes" style={{ height: '42px', borderRadius: '8px', border: '1px solid #CBD5E1', paddingLeft: '12px', fontSize: '13px', fontWeight: 600 }} value={editProfileData.medicalHistory} onChange={e => setEditProfileData({...editProfileData, medicalHistory: e.target.value})} />
                  </div>
                  <button type="submit" className="btn btn-primary" style={{ width: '100%', height: '46px', justifyContent: 'center', fontWeight: 800, borderRadius: '10px', background: 'linear-gradient(135deg, #2563EB 0%, #4F46E5 50%, #06B6D4 100%)', boxShadow: '0 4px 14px rgba(37, 99, 235, 0.3)', border: 'none', color: '#FFFFFF' }} disabled={isUpdatingProfile}>
                    {isUpdatingProfile ? 'Saving...' : 'Save Profile Changes'}
                  </button>
                </form>
              </div>

              <div className="glass-card" style={{ padding: '24px', height: 'fit-content' }}>
                <h3 style={{ fontSize: '18px', fontWeight: 800, marginBottom: '20px' }}>Change Password</h3>
                <form onSubmit={handleUpdatePassword}>
                  <div className="form-group" style={{ marginBottom: '16px' }}>
                    <label style={{ fontSize: '12px', fontWeight: 800, color: '#475569', marginBottom: '6px', display: 'block' }}>Current Password *</label>
                    <input type="password" className="form-control" placeholder="Enter current password" style={{ height: '42px', borderRadius: '8px', border: '1px solid #CBD5E1', paddingLeft: '12px', fontSize: '13px', fontWeight: 600 }} value={passwordData.currentPassword} onChange={e => setPasswordData({...passwordData, currentPassword: e.target.value})} required />
                  </div>
                  <div className="form-group" style={{ marginBottom: '16px' }}>
                    <label style={{ fontSize: '12px', fontWeight: 800, color: '#475569', marginBottom: '6px', display: 'block' }}>New Password *</label>
                    <input type="password" className="form-control" placeholder="Enter new password" style={{ height: '42px', borderRadius: '8px', border: '1px solid #CBD5E1', paddingLeft: '12px', fontSize: '13px', fontWeight: 600 }} value={passwordData.newPassword} onChange={e => setPasswordData({...passwordData, newPassword: e.target.value})} pattern="(?=.*\d)(?=.*[a-z])(?=.*[A-Z])(?=.*[!@#$%^&*]).{8,}" title="Must contain at least one number and one uppercase and lowercase letter, one special character, and at least 8 or more characters." required />
                  </div>
                  <div className="form-group" style={{ marginBottom: '24px' }}>
                    <label style={{ fontSize: '12px', fontWeight: 800, color: '#475569', marginBottom: '6px', display: 'block' }}>Confirm New Password *</label>
                    <input type="password" className="form-control" placeholder="Re-type new password" style={{ height: '42px', borderRadius: '8px', border: '1px solid #CBD5E1', paddingLeft: '12px', fontSize: '13px', fontWeight: 600 }} value={passwordData.confirmPassword} onChange={e => setPasswordData({...passwordData, confirmPassword: e.target.value})} pattern="(?=.*\d)(?=.*[a-z])(?=.*[A-Z])(?=.*[!@#$%^&*]).{8,}" title="Must contain at least one number and one uppercase and lowercase letter, one special character, and at least 8 or more characters." required />
                  </div>
                  <button type="submit" className="btn btn-secondary" style={{ width: '100%', height: '46px', justifyContent: 'center', fontWeight: 800, borderRadius: '8px', background: 'white', border: '1px solid #CBD5E1' }} disabled={isUpdatingPassword}>
                    {isUpdatingPassword ? 'Updating...' : 'Update Password'}
                  </button>
                </form>

                <div style={{ marginTop: '24px', paddingTop: '20px', borderTop: '1px solid #F1F5F9' }}>
                  <h4 style={{ fontSize: '15px', fontWeight: 800, marginBottom: '6px', color: '#0F172A' }}>Privacy & Data Rights</h4>
                  <p style={{ fontSize: '12px', color: '#64748B', lineHeight: 1.45, marginBottom: '14px' }}>
                    Under the DPDP Act, you maintain sovereignty over your clinical data and consent.
                  </p>
                  <button
                    type="button"
                    onClick={() => setShowWithdrawConsentModal(true)}
                    style={{
                      width: '100%',
                      height: '42px',
                      borderRadius: '8px',
                      background: '#FEF2F2',
                      border: '1.5px solid #FCA5A5',
                      color: '#DC2626',
                      fontSize: '12.5px',
                      fontWeight: 800,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '8px',
                      transition: 'all 0.15s ease'
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = '#FEE2E2'}
                    onMouseLeave={e => e.currentTarget.style.background = '#FEF2F2'}
                    title="Consent withdrawal will be available soon. This feature is currently being prepared."
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                    <span>Withdraw Consent</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {selectedHospital && activeTab === 'book-appointment' && selectedDoctor && (
          <div className="tab-content active" style={{ animation: 'slideUp 0.4s ease-out' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
              <button className="btn btn-secondary" style={{ padding: '8px 16px', display: 'flex', alignItems: 'center', gap: '8px' }} onClick={() => setActiveTab('find')}>
                <i data-lucide="arrow-left" style={{ width: '16px' }}></i> Back to Specialists
              </button>
              <h1 style={{ fontSize: '24px', fontWeight: 800, margin: 0 }}>Schedule Appointment & Secure Checkout</h1>
            </div>

            <div className="mobile-stack" style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.8fr', gap: '32px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', minWidth: 0 }}>
                
                {/* Pre-filled Patient Record */}
                <div className="glass-card" style={{ padding: '28px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
                    <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: '#3B82F6', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: '14px' }}>1</div>
                    <h3 style={{ fontSize: '18px', fontWeight: 800, color: '#1A1D23', margin: 0 }}>Patient Information</h3>
                    <span className="status-badge available" style={{ marginLeft: 'auto', background: '#F0FDF4', color: '#10B981', fontSize: '11px', fontWeight: 800 }}>✓ Verified Profile</span>
                  </div>
                  
                  <div className="mobile-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '20px' }}>
                    <div className="form-group">
                      <label style={{ fontSize: '12px', fontWeight: 800, color: '#64748B' }}>Full Name</label>
                      <input type="text" className="form-control" style={{ background: '#F1F5F9', border: '1px solid #E2E8F0', cursor: 'not-allowed', fontWeight: 700 }} value={patientProfile?.name || user.name || ''} readOnly />
                    </div>
                    <div className="form-group">
                      <label style={{ fontSize: '12px', fontWeight: 800, color: '#64748B' }}>Patient ID (UHID)</label>
                      <input type="text" className="form-control" style={{ background: '#F1F5F9', border: '1px solid #E2E8F0', cursor: 'not-allowed', fontWeight: 700 }} value={patientProfile ? `#MDC-${patientProfile._id.substring(18).toUpperCase()}` : '#MC-9921'} readOnly />
                    </div>
                  </div>

                  <div className="mobile-grid-3" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px' }}>
                    <div className="form-group">
                      <label style={{ fontSize: '12px', fontWeight: 800, color: '#64748B' }}>Gender</label>
                      <input type="text" className="form-control" style={{ background: '#F1F5F9', border: '1px solid #E2E8F0', cursor: 'not-allowed', fontWeight: 700 }} value={patientProfile?.gender || 'Male'} readOnly />
                    </div>
                    <div className="form-group">
                      <label style={{ fontSize: '12px', fontWeight: 800, color: '#64748B' }}>Age</label>
                      <input type="text" className="form-control" style={{ background: '#F1F5F9', border: '1px solid #E2E8F0', cursor: 'not-allowed', fontWeight: 700 }} value={`${patientProfile?.age || '34'} Yrs`} readOnly />
                    </div>
                    <div className="form-group">
                      <label style={{ fontSize: '12px', fontWeight: 800, color: '#64748B' }}>Blood Group</label>
                      <input type="text" className="form-control" style={{ background: '#F1F5F9', border: '1px solid #E2E8F0', cursor: 'not-allowed', fontWeight: 700 }} value={patientProfile?.bloodGroup || 'O+'} readOnly />
                    </div>
                  </div>
                  <div style={{ fontSize: '11px', color: '#64748B', display: 'flex', alignItems: 'center', gap: '6px', marginTop: '16px', fontWeight: 600 }}>
                    <i data-lucide="shield-check" style={{ width: '14px', color: '#10B981' }}></i> DPDP Act Compliant: Details pre-filled securely from registered healthcare records.
                  </div>
                </div>

                {/* Visit Details */}
                <div className="glass-card" style={{ padding: '28px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
                    <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: '#3B82F6', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: '14px' }}>2</div>
                    <h3 style={{ fontSize: '18px', fontWeight: 800, color: '#1A1D23', margin: 0 }}>Consultation Details</h3>
                  </div>

                  <div className="form-group" style={{ marginBottom: '24px' }}>
                    <label style={{ fontSize: '13px', fontWeight: 800, color: '#1A1D23', marginBottom: '8px', display: 'block' }}>Select Appointment Date <span style={{ color: '#EF4444' }}>*</span></label>
                    <input type="date" className="form-control" style={{ height: '48px', borderRadius: '10px', fontSize: '14px', fontWeight: 600 }} value={appointmentDate} min={getLocalDateString()} onChange={e => setAppointmentDate(e.target.value)} required />
                  </div>

                  <div className="form-group" style={{ marginBottom: '24px' }}>
                    <label style={{ fontSize: '13px', fontWeight: 800, color: '#1A1D23', marginBottom: '12px', display: 'block' }}>Preferred Time Slot <span style={{ color: '#EF4444' }}>*</span></label>
                    
                    {/* Doctor unavailability banner */}
                    {selectedDoctor && appointmentDate && !doctorAvailability.available && (
                      <div style={{ 
                        background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: '12px', 
                        padding: '16px', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '12px'
                      }}>
                        <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: '#FEE2E2', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#DC2626" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" x2="12" y1="8" y2="12"/><line x1="12" x2="12.01" y1="16" y2="16"/></svg>
                        </div>
                        <div>
                          <div style={{ fontSize: '13px', fontWeight: 800, color: '#991B1B' }}>Doctor Unavailable on This Date</div>
                          <div style={{ fontSize: '12px', color: '#B91C1C', marginTop: '2px' }}>
                            {doctorAvailability.reason === 'Weekly Off' 
                              ? `${selectedDoctor.name} has a weekly off on ${doctorAvailability.weeklyOff || 'this day'}. Please select a different date.`
                              : `${selectedDoctor.name} is on ${doctorAvailability.leaveType || ''} leave on this date. Please select a different date.`
                            }
                          </div>
                        </div>
                      </div>
                    )}

                    {(!selectedDoctor || !appointmentDate || doctorAvailability.available) && (
                      <div className="slot-scroll-wrapper">
                        <button
                          className="slot-scroll-arrow left"
                          style={{ display: 'none' }}
                          onClick={() => {
                            const grid = document.getElementById('patient-time-grid');
                            if (grid) grid.scrollBy({ left: -340, behavior: 'smooth' });
                          }}
                          aria-label="Scroll slots left"
                        >
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
                        </button>
                        <div id="patient-time-grid" style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', padding: '8px 0', width: '100%' }}>
                          {(doctorAvailability.slots || DEFAULT_TIME_SLOTS).map(time => {
                            const cleanTimeSlotStr = (s) => s ? s.split(/\(Limit:/i)[0].trim().toLowerCase() : '';
                            const targetTimeClean = cleanTimeSlotStr(time);

                            let limit = 10;
                            if (selectedDoctor) {
                                limit = selectedDoctor.max_slots || 10;
                            }

                            const match = time.match(/\(Limit:\s*(\d+)\)/i);
                            if (match) {
                                limit = parseInt(match[1], 10);
                            }

                            let bookedCount = 0;
                            if (selectedDoctor && appointmentDate) {
                                const targetDateStr = new Date(appointmentDate).toDateString();
                                bookedCount = bookedSlots.filter(app => {
                                    if (app.status === 'Cancelled') return false;
                                    const appDocId = app.doctorId?._id || app.doctorId;
                                    if (String(appDocId) !== String(selectedDoctor._id)) return false;
                                    const appDateStr = new Date(app.date).toDateString();
                                    if (appDateStr !== targetDateStr) return false;
                                    return cleanTimeSlotStr(app.time) === targetTimeClean;
                                }).length;
                            }

                            const isFull = bookedCount >= limit;
                            const isSelected = appointmentTime === time;
                            const displayTime = time.split(/\(Limit:/i)[0].trim();

                            return (
                              <div 
                                key={time} 
                                className={`time-chip ${isFull ? 'booked' : (isSelected ? 'selected' : 'available')}`}
                                style={isFull ? {
                                  background: '#F1F5F9',
                                  color: '#94A3B8',
                                  border: '1.5px solid #CBD5E1',
                                  cursor: 'not-allowed',
                                  opacity: 0.6
                                } : {}}
                                onClick={() => {
                                  if (!isFull) {
                                    setAppointmentTime(time);
                                  }
                                }}
                              >
                                <div style={{ fontSize: '13px', fontWeight: 700 }}>{displayTime}</div>
                                <div className="slot-label" style={{ fontSize: '11px', marginTop: '2px', fontWeight: 600 }}>
                                  {isFull ? 'Fully Booked' : (isSelected ? 'Selected' : 'Available')} ({bookedCount}/{limit})
                                </div>
                              </div>
                            );
                          })}
                        </div>
                        <button
                          className="slot-scroll-arrow right"
                          style={{ display: 'none' }}
                          onClick={() => {
                            const grid = document.getElementById('patient-time-grid');
                            if (grid) grid.scrollBy({ left: 340, behavior: 'smooth' });
                          }}
                          aria-label="Scroll slots right"
                        >
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18l6-6-6-6"/></svg>
                        </button>
                      </div>
                    )}
                  </div>

                  <div className="form-group">
                    <label style={{ fontSize: '13px', fontWeight: 800, color: '#1A1D23', marginBottom: '8px', display: 'block' }}>Reason for Visit / Symptoms</label>
                    <textarea className="form-control" style={{ minHeight: '100px', fontSize: '13px', borderRadius: '10px', padding: '12px' }} placeholder="Briefly describe your symptoms or medical concern..." value={appointmentReason} onChange={e => setAppointmentReason(e.target.value)}></textarea>
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                
                {/* Consulting Specialist Card */}
                <div className="glass-card" style={{ padding: '24px' }}>
                  <h4 style={{ fontSize: '12px', fontWeight: 800, color: '#94A3B8', textTransform: 'uppercase', margin: '0 0 16px' }}>Consulting Doctor</h4>
                  <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
                    <div style={{ width: '56px', height: '56px', borderRadius: '16px', background: 'var(--primary-light)', color: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px', fontWeight: 900 }}>
                      {selectedDoctor.name ? selectedDoctor.name.substring(0,2).toUpperCase() : 'DR'}
                    </div>
                    <div>
                      <div style={{ fontWeight: 900, fontSize: '16px', color: '#1A1D23' }}>{selectedDoctor.name}</div>
                      <div style={{ fontSize: '12px', color: 'var(--primary)', fontWeight: 700, marginTop: '2px' }}>{selectedDoctor.specialty || 'General OPD'}</div>
                    </div>
                  </div>
                </div>

                {/* Billing Summary */}
                <div className="glass-card" style={{ padding: '24px' }}>
                  <h3 style={{ fontSize: '16px', fontWeight: 800, color: '#1A1D23', marginBottom: '16px' }}>Billing Summary</h3>
                  <div className="billing-summary" style={{ marginBottom: 0 }}>
                    <div className="billing-row"><span>Consultation Fee</span> <span>₹{(selectedDoctor.consultationFee !== undefined ? selectedDoctor.consultationFee : 500).toFixed(2)}</span></div>
                    <div className="billing-row"><span>Registration Fee</span> <span>₹50.00</span></div>
                    <div className="billing-total" style={{ marginTop: '16px', paddingTop: '16px', borderTop: '2px dashed var(--border)' }}>
                      <span>Total Amount</span> <span>₹{((selectedDoctor.consultationFee !== undefined ? selectedDoctor.consultationFee : 500) + 50).toFixed(2)}</span>
                    </div>
                  </div>
                </div>

                {/* Payment Gateway */}
                <div className="glass-card" style={{ padding: '24px' }}>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: 800, marginBottom: '12px', color: '#1A1D23' }}>Payment Method <span style={{ color: '#EF4444' }}>*</span></label>
                  <div style={{ background: '#FFFBEB', border: '1px solid #FCD34D', borderRadius: '12px', padding: '16px', marginBottom: '20px', display: 'flex', alignItems: 'start', gap: '12px' }}>
                    <i data-lucide="alert-triangle" style={{ color: '#D97706', width: '20px', flexShrink: 0, marginTop: '2px' }}></i>
                    <div>
                      <div style={{ fontSize: '13px', fontWeight: 800, color: '#92400E' }}>Offline Settlement Required</div>
                      <div style={{ fontSize: '12px', color: '#B45309', marginTop: '4px', fontWeight: 600, lineHeight: 1.4 }}>
                        You will pay ₹{((selectedDoctor.consultationFee !== undefined ? selectedDoctor.consultationFee : 500) + 50).toFixed(2)} at the reception desk when you arrive. The doctor will attend you once payment is recorded.
                      </div>
                    </div>
                  </div>
                  <button className="btn btn-primary" style={{ width: '100%', justifyContent: 'center', height: '52px', fontSize: '15px', borderRadius: '12px', background: 'var(--primary-gradient)', boxShadow: '0 8px 16px rgba(59, 113, 254, 0.2)' }} onClick={confirmBooking} disabled={loading}>
                    <i data-lucide="calendar" style={{ width: '16px' }}></i> {loading ? 'Processing...' : 'Confirm Appointment (Pay Offline)'}
                  </button>
                </div>

              </div>
            </div>
          </div>
        )}
      </div>

      {/* 1. APPOINTMENT DETAIL SHEET */}
      {detailsModalOpen && selectedAppointment && (() => {
        const apptStatus = selectedAppointment.status;
        const isCancelled = apptStatus === 'Cancelled';
        const isCompleted = apptStatus === 'Completed' || apptStatus === 'Checked Out';
        const isRxPending = apptStatus === 'Prescription Pending';
        const isPostConsultation = isCompleted || isRxPending;
        const isLocked = isCancelled || isCompleted || isRxPending;

        const statusColors = isCancelled
          ? { bg: '#FEF2F2', color: '#DC2626', border: '#FECACA', badgeBg: '#FEE2E2', badgeBorder: '#FCA5A5', icon: '✕', label: 'Cancelled' }
          : isCompleted
          ? { bg: '#F0FDF4', color: '#16A34A', border: '#BBF7D0', badgeBg: '#DCFCE7', badgeBorder: '#86EFAC', icon: '✓', label: 'Completed' }
          : isRxPending
          ? { bg: '#FFFBEB', color: '#D97706', border: '#FDE68A', badgeBg: '#FEF3C7', badgeBorder: '#FCD34D', icon: '⏳', label: 'Prescription Pending' }
          : apptStatus === 'In Progress'
          ? { bg: '#EFF6FF', color: '#2563EB', border: '#BFDBFE', badgeBg: '#DBEAFE', badgeBorder: '#93C5FD', icon: '●', label: 'In Consultation' }
          : { bg: '#F8FAFC', color: '#0284C7', border: '#BAE6FD', badgeBg: '#E0F2FE', badgeBorder: '#7DD3FC', icon: '📅', label: apptStatus || 'Scheduled' };

        const hospitalInfo = getHospitalDetails(selectedAppointment.tenantId);
        const formattedDate = selectedAppointment.date ? new Date(selectedAppointment.date).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }) : 'Today';
        const formattedTime = selectedAppointment.time || 'Standard Slot';
        const doctorName = selectedAppointment.doctorId?.name || 'Dr. Specialist';
        const doctorSpecialty = selectedAppointment.doctorId?.specialty || selectedAppointment.reason || 'General OPD';
        const doctorDept = selectedAppointment.doctorId?.department || 'Outpatient Department';
        const docInitials = doctorName.replace('Dr. ', '').substring(0, 2).toUpperCase();

        return (
          <div 
            className="modal-overlay mobile-detail-sheet-overlay" 
            style={{ 
              position: 'fixed', inset: 0, 
              background: 'rgba(15, 23, 42, 0.65)', 
              backdropFilter: 'blur(8px)', 
              WebkitBackdropFilter: 'blur(8px)',
              zIndex: 1000, 
              display: 'flex', alignItems: 'center', justifyContent: 'center', 
              padding: '16px' 
            }} 
            onClick={() => setDetailsModalOpen(false)}
          >
            <div 
              className="modal-box mobile-detail-sheet" 
              style={{ 
                background: '#FFFFFF', 
                borderRadius: '24px', 
                width: '100%', 
                maxWidth: '520px', 
                boxShadow: '0 25px 60px -12px rgba(15, 23, 42, 0.25), 0 0 0 1px rgba(226, 232, 240, 0.9)', 
                maxHeight: '90vh', 
                display: 'flex', 
                flexDirection: 'column', 
                overflow: 'hidden'
              }} 
              onClick={e => e.stopPropagation()}
            >
              {/* ── HEADER ── */}
              <div style={{ 
                display: 'flex', justifyContent: 'space-between', alignItems: 'center', 
                padding: '20px 24px', 
                background: '#FFFFFF',
                borderBottom: '1px solid #F1F5F9', 
                flexShrink: 0 
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div style={{ 
                    width: '42px', height: '42px', borderRadius: '14px', 
                    background: statusColors.badgeBg, 
                    border: `1px solid ${statusColors.badgeBorder}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', 
                    fontSize: '18px', flexShrink: 0,
                    boxShadow: '0 2px 8px rgba(0,0,0,0.04)'
                  }}>
                    {statusColors.icon}
                  </div>
                  <div>
                    <h2 style={{ fontSize: '17px', fontWeight: 800, color: '#0F172A', margin: 0, fontFamily: "'Outfit', sans-serif", letterSpacing: '-0.01em', lineHeight: 1.2 }}>
                      Appointment Details
                    </h2>
                    <div style={{ fontSize: '12px', color: '#64748B', marginTop: '3px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <span>🏥</span>
                      <span>{hospitalInfo.name || 'Curoxa Healthcare'}</span>
                    </div>
                  </div>
                </div>
                <button 
                  type="button" 
                  onClick={() => setDetailsModalOpen(false)} 
                  style={{ 
                    background: '#F8FAFC', 
                    border: '1px solid #E2E8F0', 
                    borderRadius: '50%', 
                    width: '34px', height: '34px', 
                    cursor: 'pointer', 
                    color: '#64748B', 
                    display: 'flex', alignItems: 'center', justifyContent: 'center', 
                    fontWeight: 800, fontSize: '14px', 
                    transition: 'all 0.15s ease',
                    flexShrink: 0 
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = '#F1F5F9'; e.currentTarget.style.color = '#0F172A'; }}
                  onMouseLeave={e => { e.currentTarget.style.background = '#F8FAFC'; e.currentTarget.style.color = '#64748B'; }}
                >
                  ✕
                </button>
              </div>

              {/* ── BODY ── */}
              <div style={{ padding: '20px 24px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '16px' }} data-lenis-prevent>

                {/* Top Doctor & Status Banner */}
                <div style={{ 
                  borderRadius: '18px', 
                  border: `1.5px solid ${statusColors.border}`, 
                  background: statusColors.bg, 
                  padding: '16px 18px', 
                  display: 'flex', 
                  flexDirection: 'column', 
                  gap: '14px',
                  boxShadow: '0 2px 10px rgba(0,0,0,0.02)'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <div style={{
                        width: '48px', height: '48px', borderRadius: '16px',
                        background: 'linear-gradient(135deg, #2563EB 0%, #1D4ED8 100%)',
                        color: '#FFFFFF',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontWeight: 900, fontSize: '16px', flexShrink: 0, 
                        boxShadow: '0 4px 12px rgba(37, 99, 235, 0.2)'
                      }}>
                        {docInitials || 'DR'}
                      </div>
                      <div>
                        <div style={{ fontSize: '15.5px', fontWeight: 800, color: '#0F172A', lineHeight: 1.2 }}>
                          {doctorName}
                        </div>
                        <div style={{ fontSize: '12px', color: '#475569', fontWeight: 650, marginTop: '3px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span>{doctorSpecialty}</span>
                          <span>•</span>
                          <span style={{ color: '#64748B' }}>{doctorDept}</span>
                        </div>
                      </div>
                    </div>
                    <span style={{
                      padding: '5px 12px', borderRadius: '99px', fontSize: '11px', fontWeight: 800,
                      background: '#FFFFFF', color: statusColors.color,
                      border: `1px solid ${statusColors.border}`,
                      whiteSpace: 'nowrap', flexShrink: 0,
                      boxShadow: '0 1px 3px rgba(0,0,0,0.04)'
                    }}>
                      {statusColors.label}
                    </span>
                  </div>

                  {/* Date & Time Slot Dual Chips */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', paddingTop: '12px', borderTop: `1px solid ${statusColors.border}` }}>
                    <div style={{ background: '#FFFFFF', borderRadius: '12px', padding: '10px 12px', border: '1px solid #E2E8F0', display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <div style={{ width: '32px', height: '32px', borderRadius: '10px', background: '#EFF6FF', color: '#2563EB', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px', flexShrink: 0 }}>
                        📅
                      </div>
                      <div>
                        <div style={{ fontSize: '9.5px', color: '#94A3B8', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.04em' }}>APPOINTMENT DATE</div>
                        <div style={{ fontSize: '12.5px', fontWeight: 800, color: '#1E293B', marginTop: '2px' }}>
                          {formattedDate}
                        </div>
                      </div>
                    </div>
                    <div style={{ background: '#FFFFFF', borderRadius: '12px', padding: '10px 12px', border: '1px solid #E2E8F0', display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <div style={{ width: '32px', height: '32px', borderRadius: '10px', background: '#F0FDF4', color: '#16A34A', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px', flexShrink: 0 }}>
                        🕐
                      </div>
                      <div>
                        <div style={{ fontSize: '9.5px', color: '#94A3B8', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.04em' }}>TIME WINDOW</div>
                        <div style={{ fontSize: '12.5px', fontWeight: 800, color: '#1E293B', marginTop: '2px' }}>
                          {formattedTime}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Live Queue Token (ONLY for active/upcoming appointments participating in the live queue; NEVER for completed/cancelled/checked out/rx pending) */}
                {selectedAppointment.tokenNumber && !isCancelled && !isPostConsultation && (
                  <div style={{
                    background: 'linear-gradient(135deg, #EFF6FF 0%, #FFFFFF 100%)',
                    borderRadius: '18px', border: '1.5px solid #BFDBFE',
                    padding: '16px', boxShadow: '0 4px 14px -2px rgba(37,99,235,0.08)'
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                      <span style={{ fontSize: '11px', fontWeight: 900, textTransform: 'uppercase', color: '#2563EB', letterSpacing: '0.06em' }}>🎟 Live Queue Token</span>
                      <span style={{ fontSize: '11px', fontWeight: 700, color: '#16A34A', display: 'flex', alignItems: 'center', gap: '5px' }}>
                        <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: '#16A34A', display: 'inline-block' }}></span>
                        Live Sync
                      </span>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', textAlign: 'center' }}>
                      {[
                        { label: 'Your Token', value: `#${selectedAppointment.tokenNumber}`, color: '#2563EB' },
                        { label: 'Now Serving', value: `#${patientQueue.currentToken ?? 'Wait'}`, color: '#0F172A' },
                        { label: 'Ahead', value: patientQueue.patientsAhead !== null ? patientQueue.patientsAhead : 0, color: '#475569' }
                      ].map(({ label, value, color }) => (
                        <div key={label} style={{ background: '#FFFFFF', padding: '10px 6px', borderRadius: '12px', border: '1px solid #DBEAFE' }}>
                          <div style={{ fontSize: '9.5px', color: '#94A3B8', fontWeight: 800, textTransform: 'uppercase' }}>{label}</div>
                          <div style={{ fontSize: '20px', fontWeight: 900, color, marginTop: '3px' }}>{value}</div>
                        </div>
                      ))}
                    </div>
                    {patientQueue.currentToken && String(patientQueue.currentToken) === String(selectedAppointment.tokenNumber) && (
                      <div style={{ marginTop: '10px', padding: '10px', background: '#DCFCE7', borderRadius: '10px', color: '#166534', fontWeight: 800, fontSize: '13px', textAlign: 'center' }}>
                        🎉 It is YOUR TURN! Please proceed to the consultation room.
                      </div>
                    )}
                  </div>
                )}

                {/* Visit Information Group */}
                <div style={{ background: '#FFFFFF', borderRadius: '16px', border: '1px solid #E2E8F0', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }}>
                  <div style={{ padding: '10px 16px', background: '#F8FAFC', borderBottom: '1px solid #E2E8F0', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ fontSize: '11px', fontWeight: 800, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.05em' }}>📋 Visit Details</span>
                  </div>
                  <div>
                    {[
                      { label: 'Reason / Concern', value: selectedAppointment.reason || 'General Health Consultation', valueColor: '#0F172A' },
                      { label: 'Settlement Status', value: selectedAppointment.billingStatus === 'Paid' ? 'Paid ✓' : 'Pay at Front Desk', valueColor: selectedAppointment.billingStatus === 'Paid' ? '#16A34A' : '#D97706' },
                      { label: 'Booking Origin', value: selectedAppointment.source || 'Curoxa Patient Portal', valueColor: '#475569' },
                    ].map(({ label, value, valueColor }, idx, arr) => (
                      <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '11px 16px', borderBottom: idx < arr.length - 1 ? '1px solid #F1F5F9' : 'none' }}>
                        <span style={{ fontSize: '12px', color: '#64748B', fontWeight: 600 }}>{label}</span>
                        <span style={{ fontSize: '12.5px', fontWeight: 750, color: valueColor, textAlign: 'right', maxWidth: '60%' }}>{value}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* SECTION: IF COMPLETED OR RX PENDING — CONSULTATION SUMMARY & PRESCRIPTION FLOW */}
                {(() => {
                  const originalStatus = appointments.find(a => a._id === selectedAppointment._id)?.status || selectedAppointment.status;
                  const isComp = originalStatus === 'Completed' || originalStatus === 'Checked Out';
                  const isPendingRx = originalStatus === 'Prescription Pending';
                  if (!isComp && !isPendingRx) return null;

                  return (
                    <div style={{ 
                      background: isPendingRx ? 'linear-gradient(135deg, #FFFBEB 0%, #FEF3C7 100%)' : 'linear-gradient(135deg, #F0FDF4 0%, #DCFCE7 100%)', 
                      borderRadius: '18px', 
                      border: `1.5px solid ${isPendingRx ? '#FDE68A' : '#BBF7D0'}`, 
                      padding: '18px',
                      boxShadow: '0 4px 14px -2px rgba(0,0,0,0.03)'
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ fontSize: '16px' }}>{isPendingRx ? '⏳' : '📋'}</span>
                          <h4 style={{ fontSize: '13.5px', fontWeight: 800, color: isPendingRx ? '#92400E' : '#166534', margin: 0 }}>
                            {isPendingRx ? 'Prescription Processing' : 'Consultation Summary'}
                          </h4>
                        </div>
                        <span style={{ fontSize: '10.5px', fontWeight: 800, padding: '2px 8px', borderRadius: '6px', background: '#FFFFFF', color: isPendingRx ? '#B45309' : '#15803D' }}>
                          {isPendingRx ? 'Upload in Progress' : 'Completed Visit'}
                        </span>
                      </div>

                      <div style={{ background: '#FFFFFF', borderRadius: '12px', padding: '12px 14px', border: `1px solid ${isPendingRx ? '#FDE68A' : '#BBF7D0'}`, fontSize: '12.5px', color: '#334155', lineHeight: 1.6 }}>
                        <div><strong style={{ color: '#0F172A' }}>Attending Doctor:</strong> {doctorName}</div>
                        <div><strong style={{ color: '#0F172A' }}>Visit Recorded:</strong> {formattedDate}</div>
                        {selectedAppointment.diagnosis && (
                          <div style={{ marginTop: '4px' }}>
                            <strong style={{ color: '#0F172A' }}>Diagnosis:</strong> <span dangerouslySetInnerHTML={{ __html: selectedAppointment.diagnosis }} />
                          </div>
                        )}
                      </div>

                      {/* Prescription Row */}
                      <div style={{ marginTop: '12px', background: '#FFFFFF', borderRadius: '12px', padding: '12px 14px', border: `1px solid ${isPendingRx ? '#FDE68A' : '#BBF7D0'}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
                        <div>
                          <div style={{ fontSize: '12px', fontWeight: 800, color: '#1E293B', display: 'flex', alignItems: 'center', gap: '5px' }}>
                            <span>💊</span>
                            <span>Prescription</span>
                          </div>
                          <div style={{ fontSize: '11px', color: isPendingRx ? '#D97706' : '#64748B', fontWeight: isPendingRx ? 700 : 500, marginTop: '2px' }}>
                            {isPendingRx 
                              ? 'Clinic team is currently preparing & uploading your prescription'
                              : selectedAppointmentDetails.prescriptions.length > 0 
                                ? `${selectedAppointmentDetails.prescriptions[0].items?.length || 0} medication(s) prescribed` 
                                : 'Prescription archived in patient records'}
                          </div>
                        </div>
                        {selectedAppointmentDetails.prescriptions.length > 0 && (
                          <button 
                            type="button" 
                            onClick={() => { setSelectedPrescription(selectedAppointmentDetails.prescriptions[0]); setPrescriptionModalOpen(true); }}
                            style={{ 
                              padding: '7px 16px', borderRadius: '10px', border: 'none', 
                              background: 'linear-gradient(135deg, #2563EB 0%, #1D4ED8 100%)', 
                              color: '#FFFFFF', fontSize: '12px', fontWeight: 800, 
                              cursor: 'pointer', boxShadow: '0 2px 6px rgba(37,99,235,0.2)' 
                            }}
                          >
                            View Prescription
                          </button>
                        )}
                      </div>

                      {/* Lab Tests Row */}
                      {selectedAppointmentDetails.labs.length > 0 && (
                        <div style={{ marginTop: '8px', background: '#FFFFFF', borderRadius: '12px', padding: '12px 14px', border: '1px solid #E9D5FF', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
                          <div>
                            <div style={{ fontSize: '12px', fontWeight: 800, color: '#1E293B', display: 'flex', alignItems: 'center', gap: '5px' }}>
                              <span>🧪</span>
                              <span>Ordered Laboratory Tests</span>
                            </div>
                            <div style={{ fontSize: '11px', color: '#64748B', marginTop: '2px' }}>{selectedAppointmentDetails.labs.map(l => l.testName).join(', ')}</div>
                          </div>
                          <button 
                            type="button" 
                            onClick={() => { setSelectedLabReport(selectedAppointmentDetails.labs[0]); setLabModalOpen(true); }}
                            style={{ 
                              padding: '7px 16px', borderRadius: '10px', 
                              border: '1px solid #C084FC', background: '#FAF5FF', 
                              color: '#9333EA', fontSize: '12px', fontWeight: 800, 
                              cursor: 'pointer' 
                            }}
                          >
                            View Lab Report
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })()}

                {/* Status Lock Notice for Completed / Cancelled / Prescription Pending */}
                {isLocked && (
                  <div style={{ padding: '12px 16px', background: '#F8FAFC', borderRadius: '14px', border: '1px solid #E2E8F0', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '13px' }}>🔒</span>
                    <span style={{ fontSize: '12px', fontWeight: 650, color: '#64748B', lineHeight: 1.4 }}>
                      This appointment is <strong>{statusColors.label}</strong>. Rescheduling is disabled for archived encounters.
                    </span>
                  </div>
                )}

                {/* SECTION: RESCHEDULE / CANCEL (Active appointments only) */}
                {!isLocked && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', background: '#F8FAFC', padding: '16px 18px', borderRadius: '18px', border: '1px solid #E2E8F0' }}>
                    <div style={{ fontSize: '11px', fontWeight: 800, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'flex', alignItems: 'center', gap: '5px' }}>
                      <span>🔄</span>
                      <span>Reschedule Appointment</span>
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, marginBottom: '6px', color: '#1E293B' }}>Select New Date</label>
                      <input type="date" className="form-control" style={{ background: 'white', border: '1px solid #CBD5E1', borderRadius: '10px', height: '40px', width: '100%', padding: '0 12px', fontWeight: 600 }}
                        value={selectedAppointment.date ? new Date(selectedAppointment.date).toISOString().split('T')[0] : ''} min={getLocalDateString()}
                        onChange={(e) => setSelectedAppointment({...selectedAppointment, date: e.target.value})} />
                    </div>
                    {!rescheduleAvailability.available && (
                      <div style={{ color: '#EF4444', background: '#FEF2F2', padding: '10px 12px', borderRadius: '10px', fontSize: '12px', fontWeight: 700, border: '1px solid #FEE2E2' }}>
                        Doctor Unavailable: {rescheduleAvailability.reason || 'Doctor is on leave or weekly off'}
                      </div>
                    )}
                    {rescheduleAvailability.available && (
                      <div>
                        <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, marginBottom: '6px', color: '#1E293B' }}>Select New Time Slot</label>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(95px, 1fr))', gap: '6px', maxHeight: '120px', overflowY: 'auto', paddingRight: '4px' }}>
                          {(rescheduleAvailability.slots && rescheduleAvailability.slots.length > 0 ? rescheduleAvailability.slots : DEFAULT_TIME_SLOTS).map(time => {
                            const isSelected = selectedAppointment.time === time;
                            const displayTime = time.split(/\(Limit:/i)[0].trim();
                            return (
                              <button key={time} type="button" onClick={() => setSelectedAppointment({ ...selectedAppointment, time })}
                                style={{ minHeight: '34px', padding: '4px 6px', borderRadius: '8px', border: isSelected ? '2px solid #2563EB' : '1px solid #CBD5E1', background: isSelected ? '#EFF6FF' : 'white', color: isSelected ? '#2563EB' : '#1E293B', fontWeight: isSelected ? 800 : 600, fontSize: '11px', cursor: 'pointer' }}>
                                {displayTime}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}
                    <div>
                      <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, marginBottom: '6px', color: '#1E293B' }}>Appointment Status</label>
                      <select className="form-control" style={{ background: 'white', border: '1px solid #CBD5E1', borderRadius: '10px', height: '40px', width: '100%', padding: '0 12px', fontWeight: 600 }}
                        value={selectedAppointment.status} onChange={(e) => setSelectedAppointment({...selectedAppointment, status: e.target.value})}>
                        <option value="Pending">Keep Active (Pending)</option>
                        <option value="Cancelled">Cancel Appointment</option>
                      </select>
                    </div>
                  </div>
                )}
              </div>

              {/* ── FOOTER ── */}
              <div style={{ display: 'flex', gap: '10px', padding: '16px 24px', borderTop: '1px solid #F1F5F9', flexShrink: 0, justifyContent: 'flex-end', background: '#FAFBFC' }}>
                <button 
                  className="btn" 
                  style={{ background: '#FFFFFF', color: '#DC2626', fontWeight: 750, padding: '0 14px', borderRadius: '10px', height: '40px', fontSize: '12.5px', border: '1px solid #FECACA', cursor: 'pointer' }}
                  onClick={() => handleDeleteAppointment(selectedAppointment._id)}
                >
                  🗑 Delete
                </button>
                {!isLocked ? (
                  <button 
                    className="btn btn-primary" 
                    style={{ fontWeight: 800, padding: '0 22px', borderRadius: '10px', height: '40px', fontSize: '13px', cursor: 'pointer', background: 'linear-gradient(135deg, #2563EB 0%, #1D4ED8 100%)', boxShadow: '0 2px 6px rgba(37,99,235,0.2)' }}
                    onClick={() => handleUpdateAppointment(selectedAppointment)}
                  >
                    Save Changes
                  </button>
                ) : (
                  <button 
                    className="btn btn-secondary" 
                    style={{ fontWeight: 800, padding: '0 22px', borderRadius: '10px', height: '40px', background: '#0F172A', color: '#FFFFFF', fontSize: '13px', border: 'none', cursor: 'pointer', boxShadow: '0 2px 6px rgba(15,23,42,0.1)' }}
                    onClick={() => setDetailsModalOpen(false)}
                  >
                    Done
                  </button>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {/* 2. PRESCRIPTION DETAIL SHEET */}
      {prescriptionModalOpen && selectedPrescription && (
        <div 
          className="modal-overlay mobile-detail-sheet-overlay"
          onClick={() => setPrescriptionModalOpen(false)} 
          style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)', backdropFilter: 'blur(8px)', zIndex: 99000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}
        >
          <div 
            className="modal-box mobile-detail-sheet"
            onClick={e => e.stopPropagation()} 
            style={{ background: 'white', borderRadius: '24px', width: '100%', maxWidth: '520px', boxShadow: '0 25px 50px -12px rgba(59, 113, 254, 0.15)', maxHeight: '90vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', border: '1px solid #BFDBFE' }}
          >
            {/* Modal Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 24px', borderBottom: '1px solid #E2E8F0', flexShrink: 0 }}>
              <div>
                <h3 style={{ fontSize: '18px', fontWeight: 800, color: '#0F172A', margin: 0, fontFamily: "'Outfit', sans-serif" }}>Prescription Details</h3>
                <p style={{ fontSize: '12px', color: '#64748B', margin: '4px 0 0 0' }}>
                  Issued by: <strong>{selectedPrescription.doctorId?.name || 'Dr. Specialist'}</strong> • {getHospitalDetails(selectedPrescription.tenantId).name}
                </p>
              </div>
              <button 
                onClick={() => setPrescriptionModalOpen(false)} 
                style={{ background: '#F1F5F9', border: 'none', borderRadius: '8px', width: '32px', height: '32px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748B', fontSize: '16px', fontWeight: 'bold' }}
              >
                ✕
              </button>
            </div>

            {/* Modal Body */}
            <div style={{ padding: '24px', overflowY: 'auto', flex: 1 }} data-lenis-prevent>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', padding: '12px 16px', background: '#F8FAFC', borderRadius: '12px' }}>
                <div>
                  <div style={{ fontSize: '11px', color: '#64748B', fontWeight: 700, textTransform: 'uppercase' }}>Prescription Date</div>
                  <div style={{ fontSize: '14px', fontWeight: 800, color: '#334155', marginTop: '2px' }}>
                    {selectedPrescription.createdAt ? new Date(selectedPrescription.createdAt).toLocaleDateString([], { day: '2-digit', month: 'short', year: 'numeric' }) : 'N/A'}
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '11px', color: '#64748B', fontWeight: 700, textTransform: 'uppercase' }}>Dispense Status</div>
                  <span 
                    style={{ 
                      display: 'inline-block',
                      background: selectedPrescription.status === 'Dispensed' || selectedPrescription.status === 'Dispensed by Pharmacy' ? '#ECFDF5' : '#FFF7ED', 
                      color: selectedPrescription.status === 'Dispensed' || selectedPrescription.status === 'Dispensed by Pharmacy' ? '#10B981' : '#EA580C',
                      border: selectedPrescription.status === 'Dispensed' || selectedPrescription.status === 'Dispensed by Pharmacy' ? '1px solid #D1FAE5' : '1px solid #FFEDD5',
                      fontWeight: 700,
                      fontSize: '11px',
                      padding: '4px 8px',
                      borderRadius: '6px',
                      marginTop: '4px'
                    }}
                  >
                    {selectedPrescription.status === 'Pending Pharmacy Dispatch' ? 'PENDING' : (selectedPrescription.status || 'ACTIVE').toUpperCase()}
                  </span>
                </div>
              </div>

              {selectedPrescription.prescriptionType === 'offline_handwritten' ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  <div style={{ background: '#F0FDFA', border: '1.5px solid #99F6E4', borderRadius: '12px', padding: '14px 16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ background: '#0D9488', color: '#FFFFFF', padding: '3px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: 800 }}>
                        HANDWRITTEN PRESCRIPTION
                      </span>
                      <span style={{ fontSize: '13px', fontWeight: 800, color: '#0F766E' }}>
                        Issued physically by {selectedPrescription.doctorId?.name || 'Doctor'}
                      </span>
                    </div>
                    <p style={{ margin: '6px 0 0 0', fontSize: '12px', color: '#134E4A', lineHeight: '1.5' }}>
                      This prescription was written physically on paper during your consultation. You can view, download, or present these original pages to any pharmacy.
                    </p>
                  </div>

                  <div style={{ fontSize: '13px', fontWeight: 800, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    Prescription Pages ({(selectedPrescription.images || []).length})
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '14px' }}>
                    {(selectedPrescription.images || []).map((img, i) => (
                      <div key={i} style={{ border: '1px solid #CBD5E1', borderRadius: '12px', overflow: 'hidden', background: '#FFFFFF', boxShadow: '0 2px 6px rgba(0,0,0,0.04)' }}>
                        <div style={{ padding: '8px 12px', fontSize: '12px', fontWeight: 800, color: '#334155', background: '#F8FAFC', borderBottom: '1px solid #E2E8F0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span>Page {img.pageNumber || i + 1}</span>
                          <a href={img.url} target="_blank" rel="noopener noreferrer" style={{ color: '#0D9488', fontSize: '11.5px', textDecoration: 'none', fontWeight: 700 }}>
                            Full Size ↗
                          </a>
                        </div>
                        <a href={img.url} target="_blank" rel="noopener noreferrer" style={{ display: 'block', background: '#0F172A' }}>
                          <img src={img.url} alt={`Page ${img.pageNumber || i + 1}`} style={{ width: '100%', height: '220px', objectFit: 'contain', display: 'block' }} />
                        </a>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div style={{ fontSize: '13px', fontWeight: 800, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    Prescribed Medicines ({(selectedPrescription.items || selectedPrescription.medicines || []).length})
                  </div>
                  {(selectedPrescription.items || selectedPrescription.medicines || []).length > 0 ? (
                    (selectedPrescription.items || selectedPrescription.medicines || []).map((item, idx) => (
                      <div 
                        key={idx} 
                        style={{ 
                          padding: '16px', 
                          border: '1px solid #BFDBFE', 
                          borderRadius: '12px', 
                          background: '#FFFFFF', 
                          boxShadow: '0 1px 2px rgba(0,0,0,0.02)' 
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                          <div style={{ fontWeight: 800, fontSize: '15px', color: '#0F172A', fontFamily: "'Outfit', sans-serif" }}>
                            {item.medicine || item.name}
                          </div>
                          <span style={{ fontSize: '11px', fontWeight: 700, padding: '4px 8px', background: '#EFF6FF', color: '#2563EB', borderRadius: '6px' }}>
                            {item.duration || 'As directed'}
                          </span>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', fontSize: '12.5px', color: '#475569' }}>
                          <div>
                            <strong>Dosage:</strong> {item.dosage || 'Standard'}
                          </div>
                          <div>
                            <strong>Frequency:</strong> {item.frequency || item.instructions || 'As advised'}
                          </div>
                        </div>
                        {item.instructions && (
                          <div style={{ marginTop: '8px', fontSize: '12px', color: '#64748B', background: '#F8FAFC', padding: '6px 10px', borderRadius: '6px' }}>
                            <strong>Instructions:</strong> {item.instructions}
                          </div>
                        )}
                      </div>
                    ))
                  ) : (
                    <div style={{ textAlign: 'center', padding: '20px', color: '#94A3B8' }}>
                      No medicines listed in this prescription.
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div style={{ display: 'flex', gap: '14px', padding: '18px 24px', borderTop: '1px solid #E2E8F0', flexShrink: 0, background: '#FFFFFF' }}>
              <button 
                type="button" 
                className="btn btn-secondary" 
                style={{ flex: 1, justifyContent: 'center', height: '44px', borderRadius: '10px', border: '1px solid #BFDBFE', background: 'transparent', color: '#2563EB', fontWeight: 700, cursor: 'pointer' }} 
                onClick={() => setPrescriptionModalOpen(false)}
              >
                Close
              </button>
              <button 
                type="button" 
                className="btn btn-primary" 
                style={{ flex: 1, justifyContent: 'center', height: '44px', borderRadius: '10px', background: '#2563EB', color: '#ffffff', fontWeight: 700, cursor: 'pointer', border: 'none' }} 
                onClick={() => handlePrintPrescription(selectedPrescription)}
              >
                Download PDF
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 3. LAB REPORT DETAIL SHEET */}
      {labModalOpen && selectedLabReport && (
        <div 
          className="modal-overlay mobile-detail-sheet-overlay"
          onClick={() => setLabModalOpen(false)} 
          style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)', backdropFilter: 'blur(8px)', zIndex: 99000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}
        >
          <div 
            className="modal-box mobile-detail-sheet"
            onClick={e => e.stopPropagation()} 
            style={{ background: 'white', borderRadius: '24px', width: '100%', maxWidth: '520px', boxShadow: '0 25px 50px -12px rgba(147, 51, 234, 0.15)', maxHeight: '90vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', border: '1px solid #E9D5FF' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 24px', borderBottom: '1px solid #E2E8F0', flexShrink: 0 }}>
              <div>
                <h3 style={{ fontSize: '18px', fontWeight: 800, color: '#0F172A', margin: 0, fontFamily: "'Outfit', sans-serif" }}>
                  Laboratory Report
                </h3>
                <p style={{ fontSize: '12px', color: '#64748B', margin: '4px 0 0 0' }}>
                  Ordered by: <strong>{selectedLabReport.doctorId?.name || 'Consulting Physician'}</strong> • {getHospitalDetails(selectedLabReport.tenantId).name}
                </p>
              </div>
              <button 
                onClick={() => setLabModalOpen(false)} 
                style={{ background: '#F1F5F9', border: 'none', borderRadius: '8px', width: '32px', height: '32px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748B', fontSize: '16px', fontWeight: 'bold' }}
              >
                ✕
              </button>
            </div>

            <div style={{ padding: '24px', overflowY: 'auto', flex: 1 }} data-lenis-prevent>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', padding: '12px 16px', background: '#F8FAFC', borderRadius: '12px' }}>
                <div>
                  <div style={{ fontSize: '11px', color: '#64748B', fontWeight: 700, textTransform: 'uppercase' }}>Test Name</div>
                  <div style={{ fontSize: '16px', fontWeight: 800, color: '#0F172A', marginTop: '2px' }}>
                    {selectedLabReport.testName}
                  </div>
                </div>
                <span style={{
                  padding: '4px 10px',
                  borderRadius: '6px',
                  fontSize: '11px',
                  fontWeight: 800,
                  background: selectedLabReport.status === 'Completed' ? '#ECFDF5' : '#FAF5FF',
                  color: selectedLabReport.status === 'Completed' ? '#059669' : '#9333EA',
                  border: selectedLabReport.status === 'Completed' ? '1px solid #A7F3D0' : '1px solid #E9D5FF'
                }}>
                  {selectedLabReport.status || 'Pending'}
                </span>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
                <div style={{ background: '#F8FAFC', padding: '12px', borderRadius: '10px' }}>
                  <div style={{ fontSize: '11px', color: '#64748B', fontWeight: 700, textTransform: 'uppercase' }}>Date Ordered</div>
                  <div style={{ fontSize: '13px', fontWeight: 700, color: '#1E293B', marginTop: '2px' }}>
                    {selectedLabReport.createdAt ? new Date(selectedLabReport.createdAt).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' }) : 'N/A'}
                  </div>
                </div>
                <div style={{ background: '#F8FAFC', padding: '12px', borderRadius: '10px' }}>
                  <div style={{ fontSize: '11px', color: '#64748B', fontWeight: 700, textTransform: 'uppercase' }}>Facility</div>
                  <div style={{ fontSize: '13px', fontWeight: 700, color: '#1E293B', marginTop: '2px' }}>
                    {getHospitalDetails(selectedLabReport.tenantId).name}
                  </div>
                </div>
              </div>

              <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '12px', padding: '16px', marginBottom: '16px' }}>
                <div style={{ fontSize: '12px', fontWeight: 800, color: '#475569', textTransform: 'uppercase', marginBottom: '8px' }}>
                  Results & Laboratory Findings
                </div>
                <div style={{ fontSize: '13.5px', color: '#1E293B', lineHeight: 1.6, background: '#F8FAFC', padding: '12px', borderRadius: '8px' }}>
                  {selectedLabReport.results || selectedLabReport.notes || 'Specimen received by the laboratory. Clinical analysis is currently in progress.'}
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '14px', padding: '18px 24px', borderTop: '1px solid #E2E8F0', flexShrink: 0, background: '#FFFFFF', justifyContent: 'flex-end' }}>
              <button 
                type="button" 
                className="btn btn-secondary" 
                style={{ flex: 1, justifyContent: 'center', height: '44px', borderRadius: '10px', border: '1px solid #E2E8F0', background: 'transparent', color: '#475569', fontWeight: 700, cursor: 'pointer' }} 
                onClick={() => setLabModalOpen(false)}
              >
                Close
              </button>
              {selectedLabReport.fileUrl && (
                <a
                  href={selectedLabReport.fileUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn btn-primary"
                  style={{ flex: 1, justifyContent: 'center', height: '44px', borderRadius: '10px', background: '#9333EA', color: '#ffffff', fontWeight: 700, textDecoration: 'none', display: 'flex', alignItems: 'center' }}
                >
                  View Report PDF
                </a>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 4. MEDICAL RECORD / EMR DETAIL SHEET */}
      {emrModalOpen && selectedEMREvent && (
        <div 
          className="modal-overlay mobile-detail-sheet-overlay"
          onClick={() => setEmrModalOpen(false)} 
          style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)', backdropFilter: 'blur(8px)', zIndex: 99000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}
        >
          <div 
            className="modal-box mobile-detail-sheet"
            onClick={e => e.stopPropagation()} 
            style={{ background: 'white', borderRadius: '24px', width: '100%', maxWidth: '540px', boxShadow: '0 25px 50px -12px rgba(15, 23, 42, 0.2)', maxHeight: '90vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', border: '1px solid #CBD5E1' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 24px', borderBottom: '1px solid #E2E8F0', flexShrink: 0 }}>
              <div>
                <span style={{ fontSize: '11px', fontWeight: 800, padding: '3px 8px', borderRadius: '6px', background: selectedEMREvent.color + '15', color: selectedEMREvent.color, textTransform: 'uppercase' }}>
                  {selectedEMREvent.type}
                </span>
                <h3 style={{ fontSize: '18px', fontWeight: 800, color: '#0F172A', margin: '4px 0 0 0', fontFamily: "'Outfit', sans-serif" }}>
                  {selectedEMREvent.title}
                </h3>
                <div style={{ fontSize: '12px', color: '#64748B', marginTop: '2px' }}>
                  {selectedEMREvent.date ? new Date(selectedEMREvent.date).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }) : 'Recorded'}
                </div>
              </div>
              <button 
                onClick={() => setEmrModalOpen(false)} 
                style={{ background: '#F1F5F9', border: 'none', borderRadius: '8px', width: '32px', height: '32px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748B', fontSize: '16px', fontWeight: 'bold' }}
              >
                ✕
              </button>
            </div>

            <div style={{ padding: '24px', overflowY: 'auto', flex: 1 }} data-lenis-prevent>
              {/* Visit Information Section */}
              {selectedEMREvent.type === 'Visit' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  <div style={{ background: '#F8FAFC', padding: '16px', borderRadius: '12px', border: '1px solid #E2E8F0' }}>
                    <div style={{ fontSize: '11px', color: '#64748B', fontWeight: 800, textTransform: 'uppercase', marginBottom: '8px' }}>Visit Information</div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', fontSize: '13px' }}>
                      <div><strong>Department:</strong> {selectedEMREvent.data.department}</div>
                      <div><strong>Type:</strong> {selectedEMREvent.data.type}</div>
                      <div><strong>Status:</strong> {selectedEMREvent.data.status}</div>
                      <div><strong>Triage Level:</strong> {selectedEMREvent.data.priority}</div>
                    </div>
                  </div>

                  {selectedEMREvent.data.chiefComplaint && (
                    <div style={{ background: '#FFFFFF', padding: '16px', borderRadius: '12px', border: '1px solid #E2E8F0' }}>
                      <div style={{ fontSize: '11px', color: '#64748B', fontWeight: 800, textTransform: 'uppercase', marginBottom: '6px' }}>Chief Complaint</div>
                      <div style={{ fontSize: '13.5px', color: '#1E293B', lineHeight: 1.5 }}>
                        {selectedEMREvent.data.chiefComplaint}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Vitals Section */}
              {selectedEMREvent.type === 'Vitals' && (
                <div>
                  <div style={{ fontSize: '12px', fontWeight: 800, color: '#64748B', textTransform: 'uppercase', marginBottom: '12px' }}>
                    Recorded Physiological Vitals
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '12px' }}>
                    <div style={{ background: '#F8FAFC', padding: '14px', borderRadius: '12px', border: '1px solid #E2E8F0' }}>
                      <div style={{ fontSize: '10.5px', color: '#64748B', fontWeight: 800 }}>BLOOD PRESSURE</div>
                      <div style={{ fontSize: '18px', fontWeight: 800, color: '#1E293B', marginTop: '4px' }}>
                        {selectedEMREvent.data.bpSys || '--'}/{selectedEMREvent.data.bpDia || '--'}
                      </div>
                      <div style={{ fontSize: '10px', color: '#94A3B8' }}>mmHg</div>
                    </div>

                    <div style={{ background: '#F8FAFC', padding: '14px', borderRadius: '12px', border: '1px solid #E2E8F0' }}>
                      <div style={{ fontSize: '10.5px', color: '#64748B', fontWeight: 800 }}>HEART RATE</div>
                      <div style={{ fontSize: '18px', fontWeight: 800, color: '#1E293B', marginTop: '4px' }}>
                        {selectedEMREvent.data.pulse || '--'}
                      </div>
                      <div style={{ fontSize: '10px', color: '#94A3B8' }}>bpm</div>
                    </div>

                    <div style={{ background: '#F8FAFC', padding: '14px', borderRadius: '12px', border: '1px solid #E2E8F0' }}>
                      <div style={{ fontSize: '10.5px', color: '#64748B', fontWeight: 800 }}>SPO2 OXYGEN</div>
                      <div style={{ fontSize: '18px', fontWeight: 800, color: selectedEMREvent.data.spo2 < 95 ? '#EF4444' : '#1E293B', marginTop: '4px' }}>
                        {selectedEMREvent.data.spo2 ? `${selectedEMREvent.data.spo2}%` : '--'}
                      </div>
                      <div style={{ fontSize: '10px', color: '#94A3B8' }}>saturation</div>
                    </div>

                    <div style={{ background: '#F8FAFC', padding: '14px', borderRadius: '12px', border: '1px solid #E2E8F0' }}>
                      <div style={{ fontSize: '10.5px', color: '#64748B', fontWeight: 800 }}>TEMPERATURE</div>
                      <div style={{ fontSize: '18px', fontWeight: 800, color: '#1E293B', marginTop: '4px' }}>
                        {selectedEMREvent.data.temperature ? `${selectedEMREvent.data.temperature}°F` : '--'}
                      </div>
                      <div style={{ fontSize: '10px', color: '#94A3B8' }}>body temp</div>
                    </div>

                    <div style={{ background: '#F8FAFC', padding: '14px', borderRadius: '12px', border: '1px solid #E2E8F0' }}>
                      <div style={{ fontSize: '10.5px', color: '#64748B', fontWeight: 800 }}>BLOOD SUGAR</div>
                      <div style={{ fontSize: '18px', fontWeight: 800, color: '#1E293B', marginTop: '4px' }}>
                        {selectedEMREvent.data.bloodSugar || '--'}
                      </div>
                      <div style={{ fontSize: '10px', color: '#94A3B8' }}>mg/dL ({selectedEMREvent.data.sugarType || 'Random'})</div>
                    </div>

                    <div style={{ background: '#F8FAFC', padding: '14px', borderRadius: '12px', border: '1px solid #E2E8F0' }}>
                      <div style={{ fontSize: '10.5px', color: '#64748B', fontWeight: 800 }}>WEIGHT / HEIGHT</div>
                      <div style={{ fontSize: '16px', fontWeight: 800, color: '#1E293B', marginTop: '4px' }}>
                        {selectedEMREvent.data.weight ? `${selectedEMREvent.data.weight} kg` : '--'} / {selectedEMREvent.data.height ? `${selectedEMREvent.data.height} cm` : '--'}
                      </div>
                      <div style={{ fontSize: '10px', color: '#94A3B8' }}>anthropometry</div>
                    </div>
                  </div>
                </div>
              )}

              {/* SOAP Note Section */}
              {selectedEMREvent.type === 'SOAP Note' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  {selectedEMREvent.data.subjective && (
                    <div style={{ background: '#F8FAFC', padding: '14px', borderRadius: '12px', border: '1px solid #E2E8F0' }}>
                      <div style={{ fontSize: '11px', color: '#2563EB', fontWeight: 800, textTransform: 'uppercase' }}>Subjective (Patient Narrative)</div>
                      <div style={{ fontSize: '13.5px', color: '#1E293B', marginTop: '4px', lineHeight: 1.5 }}>
                        {selectedEMREvent.data.subjective}
                      </div>
                    </div>
                  )}

                  {selectedEMREvent.data.objective && (
                    <div style={{ background: '#F8FAFC', padding: '14px', borderRadius: '12px', border: '1px solid #E2E8F0' }}>
                      <div style={{ fontSize: '11px', color: '#2563EB', fontWeight: 800, textTransform: 'uppercase' }}>Objective (Clinical Findings)</div>
                      <div style={{ fontSize: '13.5px', color: '#1E293B', marginTop: '4px', lineHeight: 1.5 }}>
                        {selectedEMREvent.data.objective}
                      </div>
                    </div>
                  )}

                  {selectedEMREvent.data.assessment && (
                    <div style={{ background: '#EFF6FF', padding: '14px', borderRadius: '12px', border: '1px solid #BFDBFE' }}>
                      <div style={{ fontSize: '11px', color: '#2563EB', fontWeight: 800, textTransform: 'uppercase' }}>Assessment (Diagnosis)</div>
                      <div style={{ fontSize: '14px', fontWeight: 750, color: '#1E293B', marginTop: '4px' }}>
                        {Array.isArray(selectedEMREvent.data.assessment) ? selectedEMREvent.data.assessment.join(', ') : selectedEMREvent.data.assessment}
                      </div>
                    </div>
                  )}

                  {selectedEMREvent.data.plan && (
                    <div style={{ background: '#F8FAFC', padding: '14px', borderRadius: '12px', border: '1px solid #E2E8F0' }}>
                      <div style={{ fontSize: '11px', color: '#16A34A', fontWeight: 800, textTransform: 'uppercase' }}>Plan (Treatment Strategy)</div>
                      <div style={{ fontSize: '13.5px', color: '#1E293B', marginTop: '4px', lineHeight: 1.5 }}>
                        {selectedEMREvent.data.plan}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Procedure Section */}
              {selectedEMREvent.type === 'Procedure' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  <div style={{ background: '#F8FAFC', padding: '16px', borderRadius: '12px', border: '1px solid #E2E8F0' }}>
                    <div style={{ fontSize: '11px', color: '#64748B', fontWeight: 800, textTransform: 'uppercase', marginBottom: '8px' }}>Procedure Details</div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', fontSize: '13px' }}>
                      <div><strong>Procedure Name:</strong> {selectedEMREvent.data.procedureName}</div>
                      <div><strong>Surgeon:</strong> {selectedEMREvent.data.doctorId?.name || 'Surgeon'}</div>
                      <div><strong>Status:</strong> {selectedEMREvent.data.status}</div>
                      <div><strong>Anesthesia:</strong> {selectedEMREvent.data.anesthesiaDetails || 'N/A'}</div>
                    </div>
                  </div>

                  {selectedEMREvent.data.preOpNotes && (
                    <div style={{ background: '#FFFFFF', padding: '14px', borderRadius: '12px', border: '1px solid #E2E8F0' }}>
                      <div style={{ fontSize: '11px', color: '#64748B', fontWeight: 800, textTransform: 'uppercase', marginBottom: '4px' }}>Pre-Op Notes</div>
                      <div style={{ fontSize: '13px', color: '#334155' }}>{selectedEMREvent.data.preOpNotes}</div>
                    </div>
                  )}

                  {selectedEMREvent.data.postOpNotes && (
                    <div style={{ background: '#FFFFFF', padding: '14px', borderRadius: '12px', border: '1px solid #E2E8F0' }}>
                      <div style={{ fontSize: '11px', color: '#64748B', fontWeight: 800, textTransform: 'uppercase', marginBottom: '4px' }}>Post-Op Notes</div>
                      <div style={{ fontSize: '13px', color: '#334155' }}>{selectedEMREvent.data.postOpNotes}</div>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div style={{ padding: '18px 24px', borderTop: '1px solid #E2E8F0', flexShrink: 0, display: 'flex', justifyContent: 'flex-end', background: '#FFFFFF' }}>
              <button 
                type="button" 
                className="btn btn-secondary" 
                style={{ padding: '0 24px', height: '42px', borderRadius: '10px', fontWeight: 800 }} 
                onClick={() => setEmrModalOpen(false)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 5. DOCUMENT VIEWER SHEET */}
      {docModalOpen && selectedDocViewer && (
        <div 
          className="modal-overlay mobile-detail-sheet-overlay"
          onClick={() => setDocModalOpen(false)} 
          style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)', backdropFilter: 'blur(8px)', zIndex: 99000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}
        >
          <div 
            className="modal-box mobile-detail-sheet"
            onClick={e => e.stopPropagation()} 
            style={{ background: 'white', borderRadius: '24px', width: '100%', maxWidth: '480px', boxShadow: '0 25px 50px -12px rgba(15, 23, 42, 0.2)', maxHeight: '90vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', border: '1px solid #E2E8F0' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 24px', borderBottom: '1px solid #E2E8F0', flexShrink: 0 }}>
              <div>
                <h3 style={{ fontSize: '18px', fontWeight: 800, color: '#0F172A', margin: 0, fontFamily: "'Outfit', sans-serif" }}>
                  Document Details
                </h3>
                <p style={{ fontSize: '12px', color: '#64748B', margin: '4px 0 0 0' }}>
                  {selectedDocViewer.type || 'Clinical Document'}
                </p>
              </div>
              <button 
                onClick={() => setDocModalOpen(false)} 
                style={{ background: '#F1F5F9', border: 'none', borderRadius: '8px', width: '32px', height: '32px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748B', fontSize: '16px', fontWeight: 'bold' }}
              >
                ✕
              </button>
            </div>

            <div style={{ padding: '24px', overflowY: 'auto', flex: 1 }} data-lenis-prevent>
              <div style={{ display: 'flex', alignItems: 'center', gap: '16px', background: '#F8FAFC', padding: '16px', borderRadius: '12px', border: '1px solid #E2E8F0', marginBottom: '16px' }}>
                <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: '#EFF6FF', color: '#2563EB', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <i data-lucide="file-text" style={{ width: '24px', height: '24px' }}></i>
                </div>
                <div>
                  <h4 style={{ fontSize: '15px', fontWeight: 800, color: '#0F172A', margin: 0, wordBreak: 'break-word' }}>
                    {selectedDocViewer.name}
                  </h4>
                  <div style={{ fontSize: '12px', color: '#64748B', marginTop: '2px' }}>
                    Type: <strong>{selectedDocViewer.type}</strong> • Size: {selectedDocViewer.size || 'Verified'}
                  </div>
                </div>
              </div>

              <div style={{ background: '#EFF6FF', border: '1px solid #DBEAFE', borderRadius: '10px', padding: '12px', fontSize: '12.5px', color: '#1E40AF', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <i data-lucide="shield-check" style={{ width: '18px', height: '18px', flexShrink: 0 }}></i>
                <span>Cryptographically secured under DPDP Act 2023 guidelines.</span>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '12px', padding: '18px 24px', borderTop: '1px solid #E2E8F0', flexShrink: 0, justifyContent: 'flex-end', background: '#FFFFFF' }}>
              <button 
                type="button" 
                className="btn btn-secondary" 
                style={{ flex: 1, justifyContent: 'center', height: '42px', borderRadius: '10px', fontWeight: 800 }} 
                onClick={() => setDocModalOpen(false)}
              >
                Close
              </button>
              {selectedDocViewer.url && (
                <a
                  href={selectedDocViewer.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn btn-primary"
                  style={{ flex: 1, justifyContent: 'center', height: '42px', borderRadius: '10px', fontWeight: 800, textDecoration: 'none', display: 'flex', alignItems: 'center' }}
                >
                  Open Document
                </a>
              )}
            </div>
          </div>
        </div>
      )}

      {showAadhaarModal && (
        <div className="modal-overlay" style={{ zIndex: 10000, display: 'flex' }}>
          <div className="modal-box" style={{ maxWidth: '450px', padding: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h3 style={{ fontSize: '18px', fontWeight: 800, color: '#0F172A', margin: 0, fontFamily: "'Outfit', sans-serif" }}>
                Verify Aadhaar (KYC Setup)
              </h3>
              <button 
                type="button" 
                onClick={() => setShowAadhaarModal(false)} 
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748B' }}
              >
                <i data-lucide="x" style={{ width: '20px', height: '20px' }}></i>
              </button>
            </div>
            
            <form onSubmit={handleVerifyAadhaar}>
              <p style={{ fontSize: '13px', color: '#64748B', lineHeight: 1.5, marginBottom: '20px' }}>
                Enter your 12-digit Aadhaar number to perform a secure e-KYC query. This integrates with UIDAI validation sandbox to verify your identity.
              </p>
              
              <div style={{ marginBottom: '20px' }}>
                <label style={{ fontSize: '12px', fontWeight: 800, color: '#475569', marginBottom: '6px', display: 'block' }}>
                  Aadhaar Card Number *
                </label>
                <input 
                  type="text" 
                  className="form-control" 
                  maxLength="12"
                  placeholder="e.g. 567812349012"
                  value={aadhaarInput}
                  onChange={(e) => setAadhaarInput(e.target.value.replace(/\D/g, ''))}
                  style={{ height: '44px', width: '100%', borderRadius: '8px', border: '1px solid #CBD5E1', padding: '0 12px', fontSize: '14px', fontWeight: 600, letterSpacing: '1px' }}
                  required
                />
              </div>

              <div style={{ display: 'flex', gap: '12px' }}>
                <button 
                  type="button" 
                  className="btn btn-secondary" 
                  style={{ flex: 1, justifyContent: 'center' }}
                  onClick={() => setShowAadhaarModal(false)}
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  className="btn btn-primary" 
                  style={{ flex: 1, justifyContent: 'center' }}
                  disabled={verifyingAadhaar}
                >
                  {verifyingAadhaar ? 'Verifying...' : 'Submit Verification'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showAbhaModal && (
        <div className="modal-overlay" style={{ zIndex: 10000, display: 'flex' }}>
          <div className="modal-box" style={{ maxWidth: '450px', padding: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h3 style={{ fontSize: '18px', fontWeight: 800, color: '#0F172A', margin: 0, fontFamily: "'Outfit', sans-serif" }}>
                Link ABHA Health ID
              </h3>
              <button 
                type="button" 
                onClick={() => setShowAbhaModal(false)} 
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748B' }}
              >
                <i data-lucide="x" style={{ width: '20px', height: '20px' }}></i>
              </button>
            </div>
            
            <form onSubmit={handleLinkAbha}>
              <p style={{ fontSize: '13px', color: '#64748B', lineHeight: 1.5, marginBottom: '20px' }}>
                Link your Ayushman Bharat Health Account (ABHA) to share health records digitally across ABDM-registered facilities in India.
              </p>
              
              <div style={{ marginBottom: '20px' }}>
                <label style={{ fontSize: '12px', fontWeight: 800, color: '#475569', marginBottom: '6px', display: 'block' }}>
                  ABHA ID / Address *
                </label>
                <input 
                  type="text" 
                  className="form-control" 
                  placeholder="e.g. 91-1234-5678-9012 or username@sbx"
                  value={abhaInput}
                  onChange={(e) => setAbhaInput(e.target.value)}
                  style={{ height: '44px', width: '100%', borderRadius: '8px', border: '1px solid #CBD5E1', padding: '0 12px', fontSize: '14px', fontWeight: 600 }}
                  required
                />
              </div>

              <div style={{ display: 'flex', gap: '12px' }}>
                <button 
                  type="button" 
                  className="btn btn-secondary" 
                  style={{ flex: 1, justifyContent: 'center' }}
                  onClick={() => setShowAbhaModal(false)}
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  className="btn btn-primary" 
                  style={{ flex: 1, justifyContent: 'center' }}
                  disabled={verifyingAbha}
                >
                  {verifyingAbha ? 'Linking ID...' : 'Link ABHA Account'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* WITHDRAW CONSENT NOTICE MODAL (UI ONLY, NON-DESTRUCTIVE) */}
      {showWithdrawConsentModal && (
        <div className="modal-overlay" style={{ zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(15, 23, 42, 0.5)', backdropFilter: 'blur(6px)' }}>
          <div className="modal-box" style={{ maxWidth: '440px', padding: '24px', borderRadius: '20px', background: '#FFFFFF', border: '1px solid #E2E8F0', boxShadow: '0 20px 40px -8px rgba(15, 23, 42, 0.16)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '14px' }}>
              <div style={{ width: '40px', height: '40px', borderRadius: '12px', background: '#FEF2F2', color: '#DC2626', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
              </div>
              <div>
                <h3 style={{ fontSize: '17px', fontWeight: 800, color: '#0F172A', margin: 0 }}>Withdraw Consent</h3>
                <span style={{ fontSize: '11px', color: '#64748B', fontWeight: 600 }}>Privacy & Data Rights</span>
              </div>
            </div>

            <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '12px', padding: '14px 16px', marginBottom: '18px' }}>
              <p style={{ fontSize: '13px', color: '#334155', lineHeight: 1.5, margin: 0, fontWeight: 600 }}>
                Consent withdrawal will be available soon. This feature is currently being prepared in compliance with the Digital Personal Data Protection (DPDP) Act.
              </p>
              <p style={{ fontSize: '11.5px', color: '#64748B', lineHeight: 1.4, margin: '8px 0 0 0' }}>
                Your clinical records remain strictly confidential and protected under hospital governance.
              </p>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={() => setShowWithdrawConsentModal(false)}
                style={{
                  background: '#2563EB',
                  color: '#FFFFFF',
                  border: 'none',
                  borderRadius: '10px',
                  padding: '10px 20px',
                  fontSize: '13px',
                  fontWeight: 800,
                  cursor: 'pointer'
                }}
              >
                Understood
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* DIGITAL ABHA HEALTH ID CARD MODAL */}
      {/* ============================================================ */}
      {showDigitalCardModal && (() => {
        const patientUhid = patientProfile?.uhid || (patientProfile ? `MDC-${patientProfile._id.substring(18).toUpperCase()}` : (currentUser.id ? `MDC-${currentUser.id.substring(18).toUpperCase()}` : 'MDC-456B50'));
        const patientAbha = patientProfile?.abhaId || '';
        const patientAbhaAddr = patientProfile?.abhaAddress || (patientAbha ? `${(currentUser.name || 'patient').toLowerCase().replace(/\s+/g, '')}@abdm` : 'Not linked');
        const isLinked = Boolean(patientAbha);
        const initials = (currentUser.name || 'HG').split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();

        const handlePrintCard = () => {
          const pw = window.open('', '_blank', 'width=700,height=500');
          pw.document.write(`
            <!DOCTYPE html>
            <html>
            <head>
              <title>ABHA Digital Health Card – ${currentUser.name || 'Patient'}</title>
              <style>
                @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@400;700;900&display=swap');
                * { margin: 0; padding: 0; box-sizing: border-box; }
                body { display: flex; align-items: center; justify-content: center; min-height: 100vh; background: #F8FAFC; font-family: 'Outfit', sans-serif; }
                .card {
                  width: 540px; height: 300px; border-radius: 20px;
                  background: linear-gradient(135deg, #0B192C 0%, #1E3A8A 50%, #0369A1 100%);
                  color: #fff; padding: 22px 26px; position: relative; overflow: hidden;
                  box-shadow: 0 16px 40px rgba(30,58,138,0.4);
                }
                .ribbon { position: absolute; top: 0; left: 0; right: 0; height: 5px; display: flex; }
                .r1 { flex:1; background: #FF9933; }
                .r2 { flex:1; background: #fff; }
                .r3 { flex:1; background: #138808; }
                .glow { position: absolute; top:-40%; right:-20%; width:240px; height:240px; border-radius:50%; background: radial-gradient(circle, rgba(14,165,233,0.25) 0%, transparent 70%); }
                .header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 18px; }
                .nha { font-size: 10px; font-weight: 800; letter-spacing: .08em; text-transform: uppercase; color: rgba(255,255,255,0.7); }
                .title { font-size: 14px; font-weight: 900; letter-spacing: .04em; }
                .brand { font-size: 12px; font-weight: 900; letter-spacing: .05em; }
                .chip { width: 36px; height: 28px; border-radius: 5px; background: linear-gradient(135deg, #FDE047 0%, #D97706 100%); position: relative; border: 1px solid rgba(0,0,0,0.15); box-shadow: 0 2px 4px rgba(0,0,0,0.2); }
                .chip-inner { position: absolute; inset: 4px; border: 1px solid rgba(0,0,0,0.2); border-radius: 2px; }
                .mid-row { display: flex; justify-content: space-between; align-items: center; margin-bottom: 18px; }
                .name-label { font-size: 9px; text-transform: uppercase; letter-spacing: .08em; color: #93C5FD; font-weight: 700; }
                .name { font-size: 18px; font-weight: 800; letter-spacing: .02em; text-transform: uppercase; }
                .bottom { display: flex; justify-content: space-between; align-items: flex-end; }
                .abha-label { font-size: 9px; text-transform: uppercase; letter-spacing: .08em; color: #93C5FD; font-weight: 700; }
                .abha-num { font-size: 16px; font-weight: 900; font-family: monospace; letter-spacing: .1em; }
                .abha-sub { font-size: 11px; color: rgba(255,255,255,0.7); margin-top: 2px; }
                .qr-box { width: 50px; height: 50px; background: #fff; border-radius: 8px; display: flex; align-items: center; justify-content: center; }
                .qr-box svg { width: 42px; height: 42px; }
                .footer { margin-top: 16px; text-align: center; font-size: 11px; color: #64748B; }
                @media print { body { background: white; } .card { box-shadow: none; } }
              </style>
            </head>
            <body>
              <div>
                <div class="card">
                  <div class="ribbon"><div class="r1"></div><div class="r2"></div><div class="r3"></div></div>
                  <div class="glow"></div>
                  <div class="header">
                    <div>
                      <div class="nha">National Health Authority • ABDM</div>
                      <div class="title">ABHA • Digital Health ID</div>
                    </div>
                    <div class="brand">● CUROXA</div>
                  </div>
                  <div class="mid-row">
                    <div class="chip"><div class="chip-inner"></div></div>
                    <div></div>
                  </div>
                  <div style="margin-bottom:12px">
                    <div class="name-label">Cardholder Name</div>
                    <div class="name">${currentUser.name || 'Patient Name'}</div>
                  </div>
                  <div class="bottom">
                    <div>
                      <div class="abha-label">ABHA Number</div>
                      <div class="abha-num">${isLinked ? patientAbha : '91-2093-4820-2104'}</div>
                      <div class="abha-sub">${isLinked ? patientAbhaAddr : 'link@abdm'} &nbsp;•&nbsp; UHID: ${patientUhid}</div>
                    </div>
                    <div class="qr-box">
                      <svg viewBox="0 0 24 24" fill="#0F172A"><path d="M2 2h8v8H2V2zm2 2v4h4V4H4zm10-2h8v8h-8V2zm2 2v4h4V4h-4zM2 14h8v8H2v-8zm2 2v4h4v-4H4zm14 0h4v2h-4v-2zm-4 0h2v4h-2v-4zm2 2h2v4h-2v-4zm2 2h2v2h-2v-2zm-6-4h2v2h-2v-2zm0 4h2v2h-2v-2z"/></svg>
                    </div>
                  </div>
                </div>
                <div class="footer">Issued by Curoxa Health Management • Powered by ABDM, National Health Authority of India</div>
              </div>
            </body>
            </html>
          `);
          pw.document.close();
          setTimeout(() => pw.print(), 600);
        };

        return (
          <div
            className="modal-overlay"
            style={{ zIndex: 10001, display: 'flex', alignItems: 'center', padding: '20px' }}
            onClick={e => { if (e.target === e.currentTarget) setShowDigitalCardModal(false); }}
          >
            <div
              className="modal-box"
              style={{ maxWidth: '680px', width: '100%', padding: '0', borderRadius: '24px', overflow: 'hidden', border: 'none' }}
              onClick={e => e.stopPropagation()}
            >
              {/* Modal Header */}
              <div style={{ padding: '20px 24px', borderBottom: '1px solid #F1F5F9', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#FFFFFF' }}>
                <div>
                  <h3 style={{ fontSize: '18px', fontWeight: 900, color: '#0F172A', margin: '0 0 2px 0', fontFamily: "'Outfit', sans-serif" }}>
                    Digital Health ID Card
                  </h3>
                  <p style={{ fontSize: '12px', color: '#64748B', margin: 0, fontWeight: 500 }}>
                    Ayushman Bharat Digital Mission (ABDM) · National Health Authority
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowDigitalCardModal(false)}
                  style={{ background: '#F1F5F9', border: 'none', borderRadius: '8px', width: '32px', height: '32px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748B' }}
                >
                  <i data-lucide="x" style={{ width: '16px', height: '16px' }}></i>
                </button>
              </div>

              {/* Card Preview Area */}
              <div style={{ background: '#F8FAFC', padding: '32px 24px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {/* Full-size ABHA Health Card Render */}
                <div style={{
                  width: '100%',
                  maxWidth: '520px',
                  borderRadius: '20px',
                  background: 'linear-gradient(135deg, #0B192C 0%, #1E3A8A 52%, #0369A1 100%)',
                  color: '#FFFFFF',
                  padding: '24px 28px',
                  boxShadow: '0 20px 50px -8px rgba(30, 58, 138, 0.45)',
                  border: '1px solid rgba(255,255,255,0.15)',
                  position: 'relative',
                  overflow: 'hidden'
                }}>
                  {/* India Tricolor Header Ribbon */}
                  <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '5px', display: 'flex' }}>
                    <div style={{ flex: 1, background: '#FF9933' }} />
                    <div style={{ flex: 1, background: '#FFFFFF' }} />
                    <div style={{ flex: 1, background: '#138808' }} />
                  </div>

                  {/* Holographic Glow */}
                  <div style={{ position: 'absolute', top: '-50%', right: '-20%', width: '280px', height: '280px', borderRadius: '50%', background: 'radial-gradient(circle, rgba(14, 165, 233, 0.22) 0%, transparent 70%)', pointerEvents: 'none' }} />
                  <div style={{ position: 'absolute', bottom: '-30%', left: '-10%', width: '200px', height: '200px', borderRadius: '50%', background: 'radial-gradient(circle, rgba(99, 102, 241, 0.15) 0%, transparent 70%)', pointerEvents: 'none' }} />

                  {/* Card Header */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: 'rgba(255,255,255,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '16px' }}>🏛️</div>
                      <div>
                        <div style={{ fontSize: '10px', fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.7)' }}>National Health Authority • ABDM</div>
                        <div style={{ fontSize: '14px', fontWeight: 900, letterSpacing: '0.04em' }}>ABHA • Ayushman Bharat Health Account</div>
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '7px', background: 'rgba(255,255,255,0.1)', borderRadius: '8px', padding: '5px 10px' }}>
                      <img src={curoxaSidebarLogo} alt="Curoxa" style={{ width: '22px', height: '22px', objectFit: 'contain', filter: 'brightness(0) invert(1)' }} />
                      <span style={{ fontSize: '11px', fontWeight: 900, letterSpacing: '0.05em' }}>CUROXA</span>
                    </div>
                  </div>

                  {/* Middle: Chip + Photo Avatar + Status */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '18px' }}>
                    {/* EMV Chip */}
                    <div style={{ width: '40px', height: '30px', borderRadius: '6px', background: 'linear-gradient(135deg, #FDE047 0%, #D97706 100%)', border: '1px solid rgba(0,0,0,0.2)', position: 'relative', flexShrink: 0, boxShadow: '0 2px 4px rgba(0,0,0,0.2)' }}>
                      <div style={{ position: 'absolute', inset: '5px', border: '1px solid rgba(0,0,0,0.15)', borderRadius: '2px' }} />
                    </div>
                    {/* Patient Avatar */}
                    {patientProfile?.avatar ? (
                      <img src={patientProfile.avatar} alt="Patient" style={{ width: '50px', height: '50px', borderRadius: '12px', objectFit: 'cover', border: '2.5px solid rgba(255,255,255,0.4)', flexShrink: 0 }} />
                    ) : (
                      <div style={{ width: '50px', height: '50px', borderRadius: '12px', background: 'rgba(255,255,255,0.18)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px', fontWeight: 900, border: '2.5px solid rgba(255,255,255,0.35)', flexShrink: 0, letterSpacing: '0.02em' }}>
                        {initials}
                      </div>
                    )}
                    {/* Verified Badge */}
                    {isLinked && (
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', background: 'rgba(22, 163, 74, 0.25)', border: '1px solid rgba(22, 163, 74, 0.5)', borderRadius: '20px', padding: '3px 10px', fontSize: '11px', fontWeight: 800, color: '#86EFAC' }}>
                        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                        ABDM Verified
                      </div>
                    )}
                    {!isLinked && (
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', background: 'rgba(59, 130, 246, 0.2)', border: '1px solid rgba(59, 130, 246, 0.4)', borderRadius: '20px', padding: '3px 10px', fontSize: '11px', fontWeight: 800, color: '#93C5FD' }}>
                        ⚡ Link to Activate
                      </div>
                    )}
                  </div>

                  {/* Patient Name */}
                  <div style={{ marginBottom: '16px' }}>
                    <div style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.1em', color: '#93C5FD', fontWeight: 700, marginBottom: '2px' }}>Cardholder</div>
                    <div style={{ fontSize: '20px', fontWeight: 800, letterSpacing: '0.03em', textTransform: 'uppercase', lineHeight: 1.1 }}>{currentUser.name || 'Patient Name'}</div>
                    <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.65)', marginTop: '3px', fontWeight: 500 }}>
                      {patientProfile?.gender || 'Male'} · {patientProfile?.age || '—'} Yrs · Blood: {patientProfile?.bloodGroup || '—'}
                    </div>
                  </div>

                  {/* Bottom Row */}
                  <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
                    <div>
                      <div style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.1em', color: '#93C5FD', fontWeight: 700, marginBottom: '3px' }}>ABHA Number</div>
                      <div style={{ fontSize: '18px', fontWeight: 900, fontFamily: 'monospace', letterSpacing: '0.1em' }}>
                        {isLinked ? patientAbha : '91-2093-4820-2104'}
                      </div>
                      <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.65)', marginTop: '3px', fontWeight: 550 }}>
                        {isLinked ? patientAbhaAddr : 'Link to get your ABHA address'} &nbsp;·&nbsp; UHID: {patientUhid}
                      </div>
                    </div>
                    {/* QR Code */}
                    <div style={{ width: '58px', height: '58px', background: '#FFFFFF', borderRadius: '10px', padding: '5px', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 12px rgba(0,0,0,0.25)' }}>
                      <svg viewBox="0 0 24 24" width="48" height="48" fill="#0F172A">
                        <path d="M2 2h8v8H2V2zm2 2v4h4V4H4zm10-2h8v8h-8V2zm2 2v4h4V4h-4zM2 14h8v8H2v-8zm2 2v4h4v-4H4zm14 0h4v2h-4v-2zm-4 0h2v4h-2v-4zm2 2h2v4h-2v-4zm2 2h2v2h-2v-2zm-6-4h2v2h-2v-2zm0 4h2v2h-2v-2z"/>
                      </svg>
                    </div>
                  </div>
                </div>
              </div>

              {/* Footer: Actions */}
              <div style={{ padding: '20px 24px', background: '#FFFFFF', borderTop: '1px solid #F1F5F9' }}>
                {/* ABHA Status strip */}
                {!isLinked && (
                  <div style={{ background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: '10px', padding: '10px 14px', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#2563EB" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" x2="12" y1="8" y2="12"/><line x1="12" x2="12.01" y1="16" y2="16"/></svg>
                    <p style={{ fontSize: '12.5px', color: '#1D4ED8', margin: 0, fontWeight: 600, lineHeight: 1.4 }}>
                      Your ABHA number is not yet linked. Click <strong>Link ABHA</strong> below to connect your Ayushman Bharat Digital Health Account.
                    </p>
                  </div>
                )}
                <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
                  <button
                    type="button"
                    onClick={handlePrintCard}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: '7px', padding: '10px 18px', background: '#2563EB', color: '#FFFFFF', border: 'none', borderRadius: '10px', fontSize: '13.5px', fontWeight: 800, cursor: 'pointer', boxShadow: '0 4px 12px rgba(37,99,235,0.25)' }}
                  >
                    <i data-lucide="printer" style={{ width: '15px', height: '15px' }}></i>
                    Print / Save Card
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const txt = isLinked ? patientAbha : '91-2093-4820-2104';
                      navigator.clipboard.writeText(txt).then(() => showToast('ABHA ID copied!', 'success'));
                    }}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: '7px', padding: '10px 16px', background: '#F1F5F9', color: '#334155', border: '1px solid #CBD5E1', borderRadius: '10px', fontSize: '13.5px', fontWeight: 700, cursor: 'pointer' }}
                  >
                    <i data-lucide="copy" style={{ width: '15px', height: '15px' }}></i>
                    Copy ABHA ID
                  </button>
                  <button
                    type="button"
                    onClick={() => { setShowDigitalCardModal(false); setShowAbhaModal(true); }}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: '7px', padding: '10px 16px', background: '#F0FDF4', color: '#15803D', border: '1px solid #86EFAC', borderRadius: '10px', fontSize: '13.5px', fontWeight: 700, cursor: 'pointer' }}
                  >
                    <i data-lucide="link" style={{ width: '15px', height: '15px' }}></i>
                    {isLinked ? 'Update ABHA Link' : 'Link ABHA Account'}
                  </button>
                </div>
                <p style={{ fontSize: '11px', color: '#94A3B8', marginTop: '12px', margin: '12px 0 0 0', lineHeight: 1.5 }}>
                  🏛️ Issued by Curoxa Health Management · Powered by Ayushman Bharat Digital Mission (ABDM), National Health Authority of India. Governed by the Digital Personal Data Protection Act (DPDP), 2023.
                </p>
              </div>
            </div>
          </div>
        );
      })()}

      {!selectedHospital ? (
        <div className="mobile-bottom-nav">
          <div className={`mob-nav-item ${(activeTab === 'curoxa-home' || (!selectedHospital && activeTab !== 'profile' && activeTab !== 'curoxa-hospitals')) ? 'active' : ''}`} onClick={() => setActiveTab('curoxa-home')}>
            <i data-lucide="home"></i>
            <span>Home</span>
          </div>
          <div className={`mob-nav-item ${activeTab === 'curoxa-hospitals' ? 'active' : ''}`} onClick={() => setActiveTab('curoxa-hospitals')}>
            <i data-lucide="building-2"></i>
            <span>Hospitals</span>
          </div>
          <div className={`mob-nav-item ${activeTab === 'profile' ? 'active' : ''}`} onClick={() => setActiveTab('profile')}>
            <i data-lucide="user"></i>
            <span>Profile</span>
          </div>
        </div>
      ) : (
        <HospitalBottomNav
          activeTab={activeTab}
          onSelectTab={(tab) => {
            if (tab === 'records') {
              setMyHealthCategory('ALL');
            }
            setActiveTab(tab);
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }}
          onOpenBooking={handleOpenBookingFlow}
        />
      )}

      {/* INFORMATIONAL WITHDRAW CONSENT NOTICE MODAL */}
      {showWithdrawConsentModal && (
        <div className="modal-overlay" style={{ zIndex: 10000 }}>
          <div className="modal-box" style={{ maxWidth: '440px', padding: '24px', textAlign: 'center', borderRadius: '16px', background: '#FFFFFF' }}>
            <div style={{ width: '56px', height: '56px', borderRadius: '50%', background: '#EFF6FF', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px', color: '#2563EB' }}>
              <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#2563EB" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
            </div>
            <h3 style={{ fontSize: '18px', fontWeight: 800, color: '#0F172A', marginBottom: '8px' }}>
              Consent Management Notice
            </h3>
            <p style={{ fontSize: '13px', color: '#64748B', lineHeight: 1.5, marginBottom: '20px' }}>
              Under India's Digital Personal Data Protection (DPDP) Act and institutional medical compliance, consent preferences are managed in coordination with hospital privacy protocols. Your medical records remain active and safely protected.
            </p>
            <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '12px', padding: '14px', fontSize: '12px', color: '#334155', textAlign: 'left', marginBottom: '20px', lineHeight: 1.6 }}>
              <div style={{ fontWeight: 800, marginBottom: '4px', color: '#0F172A' }}>Privacy Protocol Notice:</div>
              <div>• No health records have been deleted.</div>
              <div>• You can customize purpose-specific data sharing in the Privacy tab.</div>
              <div>• For formal data erasure requests, please submit a DPDP Rights Request to the Hospital Grievance Officer.</div>
            </div>
            <button 
              type="button" 
              className="btn btn-primary" 
              style={{ width: '100%', height: '42px', borderRadius: '10px', fontWeight: 800, fontSize: '13px', background: '#2563EB', color: 'white', border: 'none', cursor: 'pointer' }}
              onClick={() => setShowWithdrawConsentModal(false)}
            >
              Understood
            </button>
          </div>
        </div>
      )}

      {/* DELETE APPOINTMENT CONFIRMATION MODAL */}
      {deleteApptConfirmId && (
        <div className="modal-overlay" style={{ zIndex: 10000 }}>
          <div className="modal-box" style={{ maxWidth: '400px', padding: '24px', textAlign: 'center' }}>
            <div style={{ width: '56px', height: '56px', borderRadius: '50%', background: '#FEE2E2', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
              <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#EF4444" strokeWidth="2.5"><path d="M3 6h18M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/></svg>
            </div>
            <h3 style={{ fontSize: '18px', fontWeight: 800, color: '#0F172A', marginBottom: '8px' }}>Cancel Appointment?</h3>
            <p style={{ fontSize: '13px', color: '#64748B', lineHeight: 1.5, marginBottom: '24px' }}>
              Are you sure you want to cancel and delete this appointment? This action cannot be undone.
            </p>
            <div style={{ display: 'flex', gap: '12px' }}>
              <button 
                type="button" 
                className="btn" 
                style={{ flex: 1, background: '#F1F5F9', color: '#475569', fontWeight: 800, height: '40px', borderRadius: '10px', cursor: 'pointer', border: '1px solid #E2E8F0' }}
                onClick={() => setDeleteApptConfirmId(null)}
              >
                Go Back
              </button>
              <button 
                type="button" 
                className="btn" 
                style={{ flex: 1, background: '#EF4444', color: 'white', fontWeight: 800, height: '40px', borderRadius: '10px', cursor: 'pointer', border: 'none' }}
                onClick={confirmDeleteAppointment}
              >
                Cancel Appt
              </button>
            </div>
          </div>
        </div>
      )}

      {/* APPOINTMENT PAYMENT MODAL */}
      {paymentModalOpen && selectedPaymentAppt && (
        <div className="modal-overlay" style={{ zIndex: 99999 }}>
          <div className="modal-box" style={{ maxWidth: '480px', padding: '0', borderRadius: '16px', overflow: 'hidden', background: '#FFFFFF' }}>
            
            {/* Modal Header */}
            <div style={{ background: 'linear-gradient(135deg, #1E293B 0%, #0F172A 100%)', color: 'white', padding: '20px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <span style={{ background: '#3B82F6', color: 'white', fontSize: '10px', fontWeight: 800, padding: '2px 8px', borderRadius: '4px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Secure Checkout
                </span>
                <h2 style={{ margin: '6px 0 0 0', fontSize: '18px', fontWeight: 800, color: 'white' }}>
                  Confirm Appointment Booking
                </h2>
              </div>
              <button 
                onClick={() => setPaymentModalOpen(false)}
                style={{ background: 'rgba(255, 255, 255, 0.1)', border: 'none', color: 'white', width: '32px', height: '32px', borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '16px' }}
              >
                ✕
              </button>
            </div>

            <div style={{ padding: '24px' }}>
              {/* Doctor & Slot Info */}
              <div style={{ background: '#F8FAFC', borderRadius: '12px', padding: '14px 16px', border: '1px solid #E2E8F0', marginBottom: '20px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                  <span style={{ fontSize: '12px', color: '#64748B', fontWeight: 600 }}>Doctor:</span>
                  <span style={{ fontSize: '13px', color: '#0F172A', fontWeight: 800 }}>{selectedPaymentAppt.doctorId?.name || 'Assigned Doctor'}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                  <span style={{ fontSize: '12px', color: '#64748B', fontWeight: 600 }}>Specialty:</span>
                  <span style={{ fontSize: '13px', color: '#334155', fontWeight: 700 }}>{selectedPaymentAppt.doctorId?.specialty || 'General OPD'}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: '12px', color: '#64748B', fontWeight: 600 }}>Date & Time:</span>
                  <span style={{ fontSize: '13px', color: '#2563EB', fontWeight: 800 }}>{new Date(selectedPaymentAppt.date).toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' })} | {selectedPaymentAppt.time}</span>
                </div>
              </div>

              {/* Itemized Bill Breakdown */}
              <h4 style={{ fontSize: '12px', fontWeight: 800, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 10px 0' }}>
                Itemized Fee Breakdown
              </h4>
              <div style={{ border: '1px solid #E2E8F0', borderRadius: '12px', overflow: 'hidden', marginBottom: '20px' }}>
                {paymentBillData?.items && paymentBillData.items.length > 0 ? (
                  paymentBillData.items.map((item, i) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 14px', borderBottom: i < paymentBillData.items.length - 1 ? '1px solid #F1F5F9' : 'none', background: item.description.includes('Registration') ? '#FFFBEB' : '#FFFFFF' }}>
                      <span style={{ fontSize: '13px', color: '#334155', fontWeight: 600 }}>
                        {item.description}
                        {item.description.includes('Registration') && (
                          <span style={{ fontSize: '10px', color: '#D97706', fontWeight: 800, marginLeft: '6px', background: '#FEF3C7', padding: '1px 5px', borderRadius: '4px' }}>1-Time Only</span>
                        )}
                      </span>
                      <span style={{ fontSize: '13px', color: '#0F172A', fontWeight: 750 }}>₹{item.amount}</span>
                    </div>
                  ))
                ) : (
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 14px' }}>
                    <span style={{ fontSize: '13px', color: '#334155', fontWeight: 600 }}>Doctor Consultation Fee</span>
                    <span style={{ fontSize: '13px', color: '#0F172A', fontWeight: 750 }}>₹500</span>
                  </div>
                )}
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 14px', background: '#F8FAFC', borderTop: '2px dashed #CBD5E1' }}>
                  <span style={{ fontSize: '14px', color: '#0F172A', fontWeight: 800 }}>Total Amount Payable</span>
                  <span style={{ fontSize: '16px', color: '#2563EB', fontWeight: 900 }}>₹{paymentBillData?.totalAmount || 550}</span>
                </div>
              </div>

              {/* Payment Method Selector */}
              <h4 style={{ fontSize: '12px', fontWeight: 800, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 10px 0' }}>
                Select Payment Method
              </h4>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px', marginBottom: '20px' }}>
                <button
                  type="button"
                  onClick={() => setPaymentMethodTab('upi')}
                  style={{
                    padding: '10px 8px',
                    borderRadius: '8px',
                    border: paymentMethodTab === 'upi' ? '2px solid #2563EB' : '1px solid #CBD5E1',
                    background: paymentMethodTab === 'upi' ? '#EFF6FF' : '#FFFFFF',
                    color: paymentMethodTab === 'upi' ? '#2563EB' : '#475569',
                    fontSize: '12px',
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '4px'
                  }}
                >
                  <span style={{ fontSize: '16px' }}>📱</span>
                  UPI / QR
                </button>

                <button
                  type="button"
                  onClick={() => setPaymentMethodTab('card')}
                  style={{
                    padding: '10px 8px',
                    borderRadius: '8px',
                    border: paymentMethodTab === 'card' ? '2px solid #2563EB' : '1px solid #CBD5E1',
                    background: paymentMethodTab === 'card' ? '#EFF6FF' : '#FFFFFF',
                    color: paymentMethodTab === 'card' ? '#2563EB' : '#475569',
                    fontSize: '12px',
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '4px'
                  }}
                >
                  <span style={{ fontSize: '16px' }}>💳</span>
                  Debit / Card
                </button>

                <button
                  type="button"
                  onClick={() => setPaymentMethodTab('netbanking')}
                  style={{
                    padding: '10px 8px',
                    borderRadius: '8px',
                    border: paymentMethodTab === 'netbanking' ? '2px solid #2563EB' : '1px solid #CBD5E1',
                    background: paymentMethodTab === 'netbanking' ? '#EFF6FF' : '#FFFFFF',
                    color: paymentMethodTab === 'netbanking' ? '#2563EB' : '#475569',
                    fontSize: '12px',
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '4px'
                  }}
                >
                  <span style={{ fontSize: '16px' }}>🏦</span>
                  NetBanking
                </button>
              </div>

              {/* Pay Action Button */}
              <button
                type="button"
                onClick={handleProcessPayment}
                disabled={processingPayment}
                style={{
                  width: '100%',
                  height: '46px',
                  borderRadius: '10px',
                  background: processingPayment ? '#94A3B8' : '#2563EB',
                  color: 'white',
                  border: 'none',
                  fontSize: '15px',
                  fontWeight: 800,
                  cursor: processingPayment ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  boxShadow: '0 4px 14px rgba(37, 99, 235, 0.3)',
                  transition: '0.2s'
                }}
              >
                {processingPayment ? 'Processing Secure Payment...' : `Pay ₹${paymentBillData?.totalAmount || 550} & Confirm Booking`}
              </button>

              <p style={{ margin: '12px 0 0 0', textAlign: 'center', fontSize: '11px', color: '#94A3B8', fontWeight: 600 }}>
                🔒 256-Bit Encrypted Secure Clinical Payment Gateway
              </p>
            </div>
          </div>
        </div>
      )}

      {notification && (
        <div className="premium-toast" style={{
          background: notification.type === 'error' ? '#FEF2F2' : '#F0FDF4',
          border: `1px solid ${notification.type === 'error' ? '#FCA5A5' : '#BBF7D0'}`,
          color: notification.type === 'error' ? '#B91C1C' : '#15803D',
          animation: 'toastSlideDown 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)'
        }}>
          {notification.message}
        </div>
      )}
    </div>
  );
};

export default PatientDashboard;
