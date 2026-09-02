import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { 
  Search, Filter, Plus, Shield, ShieldCheck, Mail, Phone, Eye, 
  Trash2, Edit3, X, UserCheck, Briefcase, FileClock, ChevronDown, Check, Settings, Download,
  User, Lock, KeyRound, Stethoscope, Calendar, CreditCard, FileText, MapPin, HeartPulse,
  Sparkles, UserPlus, Droplet, Users, ChevronUp, Clock, AlertCircle
} from 'lucide-react';
import ExportModal from '../export/ExportModal';
import { staffExportColumns } from '../../utils/exportEngine';

const DOCTOR_SPECIALIZATIONS = [
  'General Medicine', 'Cardiology', 'Dermatology', 'Orthopedics', 'Pediatrics',
  'ENT', 'Ophthalmology', 'Neurology', 'Gynecology', 'Psychiatry',
  'Dentistry', 'Radiology', 'Pulmonology', 'Urology', 'Gastroenterology',
  'Nephrology', 'Oncology', 'Endocrinology', 'Rheumatology', 'General Surgery'
];


const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

// Inline constants (formerly from constants.js)
const HOSPITAL_DEPARTMENTS = [
  'Cardiology', 'Pediatrics', 'Emergency Medicine', 'Critical Care / ICU',
  'Outpatient Services', 'Pathology & Lab', 'Pharmacy', 'Hospital Administration',
  'Obstetrics & Gynecology'
];

function createDefaultPermission(overrides) {
  return { view: true, create: false, edit: false, delete: false, approve: false, export: false, assign: false, ...overrides };
}
function createPermissionsMap(overrides) {
  const categories = ['Appointments','Patient Management','Billing','EMR','Laboratory','Pharmacy','Inventory','Purchase','Reports','Staff Management','Revenue','Audit Logs','Settings'];
  const result = {};
  categories.forEach(cat => { result[cat] = createDefaultPermission(overrides?.[cat]); });
  return result;
}

const DEFAULT_ROLE_TEMPLATES = [
  { roleName: 'Super Admin', isTemplate: true, permissions: createPermissionsMap({ Appointments: { view:true,create:true,edit:true,delete:true,approve:true,export:true,assign:true }, 'Patient Management': { view:true,create:true,edit:true,delete:true,approve:true,export:true,assign:true }, Billing: { view:true,create:true,edit:true,delete:true,approve:true,export:true,assign:true }, EMR: { view:true,create:true,edit:true,delete:true,approve:true,export:true,assign:true }, Laboratory: { view:true,create:true,edit:true,delete:true,approve:true,export:true,assign:true }, Pharmacy: { view:true,create:true,edit:true,delete:true,approve:true,export:true,assign:true }, Inventory: { view:true,create:true,edit:true,delete:true,approve:true,export:true,assign:true }, Purchase: { view:true,create:true,edit:true,delete:true,approve:true,export:true,assign:true }, Reports: { view:true,create:true,edit:true,delete:true,approve:true,export:true,assign:true }, 'Staff Management': { view:true,create:true,edit:true,delete:true,approve:true,export:true,assign:true }, Revenue: { view:true,create:true,edit:true,delete:true,approve:true,export:true,assign:true }, 'Audit Logs': { view:true,create:true,edit:true,delete:true,approve:true,export:true,assign:true }, Settings: { view:true,create:true,edit:true,delete:true,approve:true,export:true,assign:true } }) },
  { roleName: 'Doctor', isTemplate: true, permissions: createPermissionsMap({ Appointments: { view:true,create:true,edit:true,approve:true,export:true }, 'Patient Management': { view:true,create:true,edit:true,export:true }, EMR: { view:true,create:true,edit:true,approve:true,export:true }, Laboratory: { view:true }, Pharmacy: { view:true }, Reports: { view:true,export:true } }) },
  { roleName: 'Nurse', isTemplate: true, permissions: createPermissionsMap({ Appointments: { view:true,create:true,edit:true }, 'Patient Management': { view:true,create:true,edit:true }, EMR: { view:true,edit:true }, Laboratory: { view:true }, Inventory: { view:true,edit:true } }) },
  { roleName: 'Pharmacist', isTemplate: true, permissions: createPermissionsMap({ Pharmacy: { view:true,create:true,edit:true,approve:true,export:true }, Inventory: { view:true,create:true,edit:true }, Reports: { view:true,export:true } }) },
  { roleName: 'HR', isTemplate: true, permissions: createPermissionsMap({ 'Staff Management': { view:true,create:true,edit:true,delete:true,approve:true,export:true,assign:true }, Reports: { view:true,create:true,edit:true,export:true }, Settings: { view:true,edit:true } }) },
  { roleName: 'Finance', isTemplate: true, permissions: createPermissionsMap({ Billing: { view:true,create:true,edit:true,approve:true,export:true }, Revenue: { view:true,create:true,approve:true,export:true }, Reports: { view:true,create:true,export:true } }) }
];

export default function EmployeeDirectoryView({
  employees = [],
  leaveRequests = [],
  onSelectEmployee,
  onAddEmployee,
  onUpdateEmployee,
  onDeactivateEmployee,
  initialIsAdding = false
}) {
  const tenantModules = JSON.parse(localStorage.getItem('tenantModules') || '{}');
  const getAvailableRoles = () => {
    const allRoles = [
      { value: 'doctor', label: 'Doctor', moduleKey: 'doctor' },
      { value: 'receptionist', label: 'Receptionist', moduleKey: 'reception' },
      { value: 'lab', label: 'Laboratory', moduleKey: 'laboratory' },
      { value: 'pharmacy', label: 'Pharmacy', moduleKey: 'pharmacy' },
      { value: 'hr', label: 'HR Manager', moduleKey: null },
      { value: 'admin', label: 'System Admin', moduleKey: null }
    ];
    return allRoles.filter(r => !r.moduleKey || tenantModules[r.moduleKey]?.enabled !== false);
  };

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedRole, setSelectedRole] = useState('All');
  const [selectedDept, setSelectedDept] = useState('All');
  const [selectedStatus, setSelectedStatus] = useState('All');
  const [showExportModal, setShowExportModal] = useState(false);



  // Add Employee state
  const [isAdding, setIsAdding] = useState(initialIsAdding);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [showOptionalDetails, setShowOptionalDetails] = useState(true);
  const [customSlotInput, setCustomSlotInput] = useState('');
  const [error, setError] = useState('');
  const addStaffFormRef = useRef(null);

  useEffect(() => {
    setIsAdding(initialIsAdding);
  }, [initialIsAdding]);

  useEffect(() => {
    const handleGlobalKeyDown = (e) => {
      if (e.key === 'Escape' && isAdding) {
        setIsAdding(false);
        resetForm();
      }
    };
    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [isAdding]);

  const handleFormKeyDown = (e) => {
    if (e.key === 'Enter') {
      if (e.target.tagName === 'TEXTAREA') {
        if (!e.ctrlKey) return;
      }
      if (e.target.tagName === 'BUTTON') return;

      e.preventDefault();

      const form = addStaffFormRef.current;
      if (!form) return;

      const focusable = Array.from(
        form.querySelectorAll(
          'input:not([disabled]):not([type="hidden"]):not([readonly]), select:not([disabled]), textarea:not([disabled])'
        )
      ).filter(el => el.offsetParent !== null && !el.closest('[style*="display: none"]'));

      const currentIndex = focusable.indexOf(e.target);
      if (currentIndex > -1 && currentIndex < focusable.length - 1) {
        const next = focusable[currentIndex + 1];
        next.focus();
        if (next.select && next.type !== 'date') {
          try { next.select(); } catch (_) {}
        }
      } else {
        if (form.requestSubmit) {
          form.requestSubmit();
        } else {
          form.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
        }
      }
    }
  };

  const resetForm = () => {
    setNewEmp({
      name: '',
      staff_id: '',
      password: '',
      confirmPassword: '',
      role: getAvailableRoles()[0]?.value || 'doctor',
      email: '',
      phone: '',
      gender: '',
      dob: '',
      bloodGroup: '',
      aadhaar: '',
      pan: '',
      address: '',
      emergencyContactName: '',
      emergencyContactRelation: '',
      emergencyContactPhone: '',
      specialty: '',
      employmentType: '',
      ctcAnnual: '',
      shiftName: '',
      workLocation: '',
      doctorSlots: ['09:00 AM - 09:30 AM', '09:30 AM - 10:00 AM', '10:00 AM - 10:30 AM', '10:30 AM - 11:00 AM', '11:00 AM - 11:30 AM', '11:30 AM - 12:00 PM', '12:00 PM - 12:30 PM', '12:30 PM - 01:00 PM', '02:00 PM - 02:30 PM', '02:30 PM - 03:00 PM', '03:00 PM - 03:30 PM', '03:30 PM - 04:00 PM', '04:00 PM - 04:30 PM', '04:30 PM - 05:00 PM', '05:00 PM - 05:30 PM'],
      weeklyOff: ''
    });
    setError('');
    setShowPassword(false);
    setShowConfirmPassword(false);
  };

  const getPasswordStrength = (pass) => {
    if (!pass) return { label: '', color: 'transparent' };
    const strongRegex = new RegExp("^(?=.*[a-z])(?=.*[A-Z])(?=.*[0-9])(?=.*[!@#\\$%\\^&\\*])(?=.{8,})");
    const mediumRegex = new RegExp("^(((?=.*[a-z])(?=.*[A-Z]))|((?=.*[a-z])(?=.*[0-9]))|((?=.*[A-Z])(?=.*[0-9])))(?=.{6,})");
    if (strongRegex.test(pass)) return { label: 'Strong', color: '#22C55E' };
    if (mediumRegex.test(pass)) return { label: 'Medium', color: '#EAB308' };
    return { label: 'Weak', color: '#EF4444' };
  };

  const [newEmp, setNewEmp] = useState({
    name: '',
    staff_id: '',
    password: '',
    confirmPassword: '',
    role: getAvailableRoles()[0]?.value || 'doctor',
    email: '',
    phone: '',
    gender: '',
    dob: '',
    bloodGroup: '',
    aadhaar: '',
    pan: '',
    address: '',
    emergencyContactName: '',
    emergencyContactRelation: '',
    emergencyContactPhone: '',
    specialty: '',
    employmentType: '',
    ctcAnnual: '',
    shiftName: '',
    workLocation: '',
    doctorSlots: ['09:00 AM - 09:30 AM', '09:30 AM - 10:00 AM', '10:00 AM - 10:30 AM', '10:30 AM - 11:00 AM', '11:00 AM - 11:30 AM', '11:30 AM - 12:00 PM', '12:00 PM - 12:30 PM', '12:30 PM - 01:00 PM', '02:00 PM - 02:30 PM', '02:30 PM - 03:00 PM', '03:00 PM - 03:30 PM', '03:30 PM - 04:00 PM', '04:00 PM - 04:30 PM', '04:30 PM - 05:00 PM', '05:00 PM - 05:30 PM'],
    weeklyOff: ''
  });

  const generateRandomPassword = () => {
    const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*';
    let pass = '';
    for (let i = 0; i < 10; i++) {
      pass += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setNewEmp(prev => ({ ...prev, password: pass, confirmPassword: pass }));
    setShowPassword(true);
    setShowConfirmPassword(true);
  };



  // Automatically generate Employee ID & add default parameters
  const handleCreateEmployee = async (e) => {
    e.preventDefault();
    if (isSubmitting) return;
    if (!newEmp.name || !newEmp.email || !newEmp.phone || !newEmp.password) {
      setError('Please fill in all mandatory fields (Name, Email, Phone Number, Password).');
      return;
    }
    if (newEmp.phone.length !== 10) {
      setError('Phone Number must be exactly 10 digits (it will be used as the Login Username).');
      return;
    }
    
    if (newEmp.password !== newEmp.confirmPassword) {
      setError('Passwords do not match.');
      setTimeout(() => document.getElementById('staff-form-error')?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50);
      return;
    }

    if (newEmp.role === 'doctor') {
      if (!newEmp.specialty) {
        setError('Please select a Specialization for the doctor.');
        setTimeout(() => document.getElementById('staff-form-error')?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50);
        return;
      }
      if (!newEmp.doctorSlots || newEmp.doctorSlots.length === 0) {
        setError('Please select at least one Attending Time Slot for the doctor.');
        setTimeout(() => document.getElementById('staff-form-error')?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50);
        return;
      }
    }

    setError('');
    setIsSubmitting(true);

    const defaultEmp = {
      id: newEmp.staff_id,
      staff_id: newEmp.staff_id,
      password: newEmp.password,
      name: newEmp.name,
      email: newEmp.email,
      phone: newEmp.phone || '',
      photoUrl: '',
      gender: newEmp.gender,
      dob: newEmp.dob || '',
      bloodGroup: newEmp.bloodGroup || '',
      address: newEmp.address || '',
      emergencyContact: {
        name: newEmp.emergencyContactName || '',
        relation: newEmp.emergencyContactRelation || '',
        phone: newEmp.emergencyContactPhone || ''
      },
      aadhaar: newEmp.aadhaar || '',
      pan: newEmp.pan || '',
      specialty: newEmp.role === 'doctor' ? newEmp.specialty : '',
      department: newEmp.role === 'doctor' 
        ? (newEmp.specialty || 'General Medicine') 
        : (newEmp.role === 'pharmacy' 
          ? 'Pharmacy' 
          : (newEmp.role === 'lab' 
            ? 'Pathology & Lab' 
            : (newEmp.role === 'receptionist' 
              ? 'Outpatient Services' 
              : (newEmp.role === 'hr' || newEmp.role === 'admin' 
                ? 'Hospital Administration' 
                : 'Administration')))),
      designation: newEmp.role === 'doctor' 
        ? 'Consultant Practitioner' 
        : (newEmp.role === 'hr' 
          ? 'HR Manager' 
          : (newEmp.role === 'pharmacy' 
            ? 'Pharmacist' 
            : (newEmp.role === 'lab' 
              ? 'Lab Technician' 
              : newEmp.role.charAt(0).toUpperCase() + newEmp.role.slice(1)))),
      employmentType: newEmp.employmentType || 'Full-Time',
      joiningDate: new Date().toISOString().split('T')[0],
      workLocation: newEmp.workLocation || 'Main Wing',
      shiftName: newEmp.shiftName || 'General Shift',
      grade: 'G1 - Level I',
      status: 'Probation',
      noticePeriodDays: 30,
      assignedRoles: [newEmp.role.charAt(0).toUpperCase() + newEmp.role.slice(1)],
      permissions: createPermissionsMap(),
      bankDetails: {
        accountHolder: newEmp.name,
        accountNumber: 'XXXXXXXXXXXX',
        bankName: 'Hospital Core Bank',
        ifsc: 'HCB0000101'
      },
      ctcAnnual: newEmp.ctcAnnual !== '' && !isNaN(parseInt(newEmp.ctcAnnual)) ? parseInt(newEmp.ctcAnnual) : 0,
      pfEnrolled: true,
      esiEnrolled: true,
      taxBracket: '10% Bracket',
      leaveBalance: {
        sick: 10,
        casual: 8,
        annual: 12,
        maternity: 0,
        paternity: 0,
        compOff: 0,
        lwp: 0
      },
      doctorSlots: newEmp.role === 'doctor' ? newEmp.doctorSlots : [],
      weeklyOff: newEmp.weeklyOff || 'Sunday',
      consultationFee: newEmp.role === 'doctor' ? (newEmp.consultationFee !== undefined && newEmp.consultationFee !== '' ? Number(newEmp.consultationFee) : 500) : undefined
    };

    try {
      await onAddEmployee(defaultEmp);
      resetForm();
      setIsAdding(false);
    } catch (err) {
      console.error('Error adding staff from EmployeeDirectory:', err);
      setError(err.response?.data?.error || err.message || 'Failed to onboard employee.');
      setTimeout(() => document.getElementById('staff-form-error')?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50);
    } finally {
      setIsSubmitting(false);
    }
  };



  // Helper functions matching Admin Panel
  const getStaffStatus = (emp) => {
    const todayStr = new Date().toISOString().split('T')[0];
    const todayDay = WEEKDAYS[new Date().getDay()];
    
    // Check if on approved leave
    const onLeave = leaveRequests.some(l => {
      const matchEmp = (
        l.employeeId === emp.id || 
        l.employeeId === emp.staff_id || 
        l.employeeId === emp._id || 
        (l.employeeName && emp.name && l.employeeName.toLowerCase() === emp.name.toLowerCase())
      );
      if (!matchEmp || l.status !== 'Approved') return false;
      const from = (l.fromDate || l.startDate || '').split('T')[0];
      const to = (l.toDate || l.endDate || '').split('T')[0];
      return from && to && todayStr >= from && todayStr <= to;
    });

    if (onLeave) return 'On Leave';

    // Check weekly off
    const daysOff = Array.isArray(emp.weeklyOff) ? emp.weeklyOff : (typeof emp.weeklyOff === 'string' ? emp.weeklyOff.split(',').map(s => s.trim()) : ['Sunday']);
    if (daysOff.includes(todayDay)) return 'Weekly Off';

    if (emp.status === 'Active' || !emp.status) return 'On Duty';
    return emp.status;
  };

  const getDaysOffString = (emp) => {
    if (Array.isArray(emp.weeklyOff)) {
      return emp.weeklyOff.length > 0 ? emp.weeklyOff.join(' + ') : 'Sunday';
    }
    if (typeof emp.weeklyOff === 'string' && emp.weeklyOff.trim()) {
      return emp.weeklyOff.replace(/,/g, ' +');
    }
    return 'Sunday';
  };

  const getInitials = (name = '') => {
    return name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase() || 'ST';
  };

  const activeTodayCount = employees.filter(e => {
    const st = getStaffStatus(e);
    return st === 'On Duty' || st === 'Active';
  }).length;

  const onLeaveCount = employees.filter(e => {
    const st = getStaffStatus(e);
    return st === 'On Leave';
  }).length;

  const pendingRequestsCount = leaveRequests.filter(l => l.status === 'Pending').length;

  // Unique departments for filter dropdown
  const uniqueDepts = Array.from(new Set([
    ...HOSPITAL_DEPARTMENTS,
    ...employees.map(e => e.department).filter(Boolean)
  ]));

  // Filtered employees list
  const filteredEmployees = employees.filter(emp => {
    // Search
    const term = searchTerm.toLowerCase();
    const matchesSearch = !term || 
      (emp.name && emp.name.toLowerCase().includes(term)) ||
      (emp.staff_id && String(emp.staff_id).toLowerCase().includes(term)) ||
      (emp.id && String(emp.id).toLowerCase().includes(term)) ||
      (emp.email && emp.email.toLowerCase().includes(term)) ||
      (emp.phone && String(emp.phone).includes(term)) ||
      (emp.department && emp.department.toLowerCase().includes(term)) ||
      (emp.designation && emp.designation.toLowerCase().includes(term)) ||
      (emp.role && emp.role.toLowerCase().includes(term)) ||
      ((emp.assignedRoles || []).some(r => r.toLowerCase().includes(term)));

    // Role
    let matchesRole = true;
    if (selectedRole !== 'All') {
      const empRole = (emp.role || '').toLowerCase();
      const assigned = (emp.assignedRoles || []).map(r => r.toLowerCase());
      if (selectedRole === 'doctor') {
        matchesRole = empRole.includes('doc') || assigned.some(r => r.includes('doc'));
      } else if (selectedRole === 'receptionist') {
        matchesRole = empRole.includes('reception') || assigned.some(r => r.includes('reception'));
      } else if (selectedRole === 'hr') {
        matchesRole = empRole.includes('hr') || assigned.some(r => r.includes('hr'));
      } else if (selectedRole === 'nurse') {
        matchesRole = empRole.includes('nurse') || assigned.some(r => r.includes('nurse'));
      } else if (selectedRole === 'staff') {
        matchesRole = !empRole.includes('doc') && !empRole.includes('reception') && !empRole.includes('hr');
      }
    }

    // Dept
    const matchesDept = selectedDept === 'All' || emp.department === selectedDept;

    // Status
    let matchesStatus = true;
    if (selectedStatus !== 'All') {
      const st = getStaffStatus(emp).toLowerCase();
      if (selectedStatus === 'onduty') {
        matchesStatus = st === 'on duty' || st === 'active';
      } else if (selectedStatus === 'onleave') {
        matchesStatus = st === 'on leave' || st === 'absent';
      } else if (selectedStatus === 'weeklyoff') {
        matchesStatus = st === 'weekly off';
      } else if (selectedStatus === 'inactive') {
        matchesStatus = st === 'inactive' || st === 'deactivated' || emp.status === 'Exited';
      }
    }

    return matchesSearch && matchesRole && matchesDept && matchesStatus;
  });

  return (
    <div className="space-y-6" id="employee-directory-root">
      
      {/* 1. TOP KPI CARDS MATCHING ADMIN PANEL */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        
        {/* Card 1: Total Staff (Blue Gradient with Bottom-Right Radial Glow) */}
        <div
          className="p-4 rounded-2xl border border-blue-200/90 shadow-[0_12px_28px_rgba(37,99,235,0.08)] hover:shadow-[0_16px_36px_rgba(37,99,235,0.16)] hover:-translate-y-0.5 transition-all flex flex-col justify-between relative overflow-hidden group cursor-pointer"
          style={{
            background: 'radial-gradient(circle at 100% 100%, rgba(37, 99, 235, 0.25) 0%, transparent 65%), linear-gradient(135deg, #FFFFFF 0%, #EFF6FF 50%, #DBEAFE 100%)'
          }}
          onClick={() => { setSelectedStatus('All'); setSelectedRole('All'); setSelectedDept('All'); setSearchTerm(''); }}
          title="Show all registered staff members"
        >
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-blue-700 to-blue-500 text-white flex items-center justify-center shrink-0 shadow-md shadow-blue-500/25">
              <Users className="w-4.5 h-4.5" />
            </div>
            <span className="text-[10px] font-extrabold text-blue-900 uppercase tracking-wider">Total Staff</span>
          </div>

          <div className="mt-3 flex items-end justify-between">
            <div>
              <div className="text-3xl font-black text-slate-900 tracking-tight leading-none">{employees.length}</div>
              <div className="text-xs text-blue-700 font-bold mt-1.5 truncate">
                Registered team members
              </div>
            </div>

            {/* Blue Mini Sparkline */}
            <div className="w-16 h-8 shrink-0 relative">
              <svg className="w-full h-full overflow-visible" viewBox="0 0 64 32">
                <defs>
                  <linearGradient id="staffBlueGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#2563EB" stopOpacity="0.45"/>
                    <stop offset="100%" stopColor="#2563EB" stopOpacity="0.05"/>
                  </linearGradient>
                </defs>
                <path d="M 0 24 Q 16 26, 24 16 T 40 18 T 52 8 T 64 12 L 64 32 L 0 32 Z" fill="url(#staffBlueGrad)" />
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

        {/* Card 2: On Duty Today (Emerald Gradient with Top-Right Radial Glow) */}
        <div
          className="p-4 rounded-2xl border border-emerald-200/90 shadow-[0_12px_28px_rgba(16,185,129,0.08)] hover:shadow-[0_16px_36px_rgba(16,185,129,0.16)] hover:-translate-y-0.5 transition-all flex flex-col justify-between relative overflow-hidden group cursor-pointer"
          style={{
            background: 'radial-gradient(circle at 100% 0%, rgba(16, 185, 129, 0.25) 0%, transparent 65%), linear-gradient(135deg, #FFFFFF 0%, #ECFDF5 50%, #D1FAE5 100%)'
          }}
          onClick={() => { setSelectedStatus('onduty'); }}
          title="Filter by staff on duty"
        >
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-emerald-600 to-teal-500 text-white flex items-center justify-center shrink-0 shadow-md shadow-emerald-500/25">
              <Clock className="w-4.5 h-4.5" />
            </div>
            <span className="text-[10px] font-extrabold text-emerald-900 uppercase tracking-wider">On Duty Today</span>
          </div>

          <div className="mt-3 flex items-end justify-between">
            <div>
              <div className="text-3xl font-black text-slate-900 tracking-tight leading-none">{activeTodayCount}</div>
              <div className="text-xs text-emerald-700 font-bold mt-1.5 truncate">
                Active on duty
              </div>
            </div>

            {/* Green Mini Sparkline */}
            <div className="w-16 h-8 shrink-0 relative">
              <svg className="w-full h-full overflow-visible" viewBox="0 0 64 32">
                <defs>
                  <linearGradient id="staffGreenGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#059669" stopOpacity="0.45"/>
                    <stop offset="100%" stopColor="#059669" stopOpacity="0.05"/>
                  </linearGradient>
                </defs>
                <path d="M 0 26 Q 14 24, 22 22 T 36 10 T 48 18 T 58 6 T 64 10 L 64 32 L 0 32 Z" fill="url(#staffGreenGrad)" />
                <path d="M 0 26 Q 14 24, 22 22 T 36 10 T 48 18 T 58 6 T 64 10" fill="none" stroke="#059669" strokeWidth="2.4" strokeLinecap="round" />
              </svg>
            </div>
          </div>

          {/* Half Gradient Accent Line Beneath Card */}
          <div 
            className="h-[4px] rounded-br-2xl absolute bottom-0 right-0 w-3/5 pointer-events-none"
            style={{
              background: 'linear-gradient(90deg, transparent 0%, #059669 100%)'
            }}
          />
        </div>

        {/* Card 3: On Leave / Absent (Amber Gradient with Bottom-Left Radial Glow) */}
        <div
          className="p-4 rounded-2xl border border-amber-200/90 shadow-[0_12px_28px_rgba(245,158,11,0.08)] hover:shadow-[0_16px_36px_rgba(245,158,11,0.16)] hover:-translate-y-0.5 transition-all flex flex-col justify-between relative overflow-hidden group cursor-pointer"
          style={{
            background: 'radial-gradient(circle at 0% 100%, rgba(245, 158, 11, 0.25) 0%, transparent 65%), linear-gradient(135deg, #FFFFFF 0%, #FFFBEB 50%, #FEF3C7 100%)'
          }}
          onClick={() => { setSelectedStatus('onleave'); }}
          title="Filter by staff on leave"
        >
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-amber-600 to-amber-400 text-white flex items-center justify-center shrink-0 shadow-md shadow-amber-500/25">
              <Calendar className="w-4.5 h-4.5" />
            </div>
            <span className="text-[10px] font-extrabold text-amber-900 uppercase tracking-wider">On Leave / Absent</span>
          </div>

          <div className="mt-3 flex items-end justify-between">
            <div>
              <div className="text-3xl font-black text-slate-900 tracking-tight leading-none">{onLeaveCount}</div>
              <div className="text-xs text-amber-700 font-bold mt-1.5 truncate">
                Away from duty
              </div>
            </div>

            {/* Amber Mini Sparkline */}
            <div className="w-16 h-8 shrink-0 relative">
              <svg className="w-full h-full overflow-visible" viewBox="0 0 64 32">
                <defs>
                  <linearGradient id="staffAmberGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#D97706" stopOpacity="0.45"/>
                    <stop offset="100%" stopColor="#D97706" stopOpacity="0.05"/>
                  </linearGradient>
                </defs>
                <path d="M 0 28 Q 12 28, 20 26 T 38 18 T 50 14 T 64 22 L 64 32 L 0 32 Z" fill="url(#staffAmberGrad)" />
                <path d="M 0 28 Q 12 28, 20 26 T 38 18 T 50 14 T 64 22" fill="none" stroke="#D97706" strokeWidth="2.4" strokeLinecap="round" />
              </svg>
            </div>
          </div>

          {/* Half Gradient Accent Line Beneath Card */}
          <div 
            className="h-[4px] rounded-br-2xl absolute bottom-0 right-0 w-3/5 pointer-events-none"
            style={{
              background: 'linear-gradient(90deg, transparent 0%, #D97706 100%)'
            }}
          />
        </div>

        {/* Card 4: Pending Requests (Purple Gradient with Top-Left Radial Glow) */}
        <div
          className="p-4 rounded-2xl border border-purple-200/90 shadow-[0_12px_28px_rgba(139,92,246,0.08)] hover:shadow-[0_16px_36px_rgba(139,92,246,0.16)] hover:-translate-y-0.5 transition-all flex flex-col justify-between relative overflow-hidden group cursor-pointer"
          style={{
            background: 'radial-gradient(circle at 0% 0%, rgba(139, 92, 246, 0.25) 0%, transparent 65%), linear-gradient(135deg, #FFFFFF 0%, #F5F3FF 50%, #EDE9FE 100%)'
          }}
          title="Pending HR and leave requests"
        >
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-purple-700 to-indigo-600 text-white flex items-center justify-center shrink-0 shadow-md shadow-purple-500/25">
              <AlertCircle className="w-4.5 h-4.5" />
            </div>
            <span className="text-[10px] font-extrabold text-purple-900 uppercase tracking-wider">Pending Requests</span>
          </div>

          <div className="mt-3 flex items-end justify-between">
            <div>
              <div className="text-3xl font-black text-slate-900 tracking-tight leading-none">{pendingRequestsCount}</div>
              <div className="text-xs text-purple-700 font-bold mt-1.5 truncate">
                Awaiting approval
              </div>
            </div>

            {/* Purple Mini Sparkline */}
            <div className="w-16 h-8 shrink-0 relative">
              <svg className="w-full h-full overflow-visible" viewBox="0 0 64 32">
                <defs>
                  <linearGradient id="staffPurpleGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#7C3AED" stopOpacity="0.45"/>
                    <stop offset="100%" stopColor="#7C3AED" stopOpacity="0.05"/>
                  </linearGradient>
                </defs>
                <path d="M 0 26 Q 14 24, 22 22 T 36 10 T 48 18 T 58 6 T 64 10 L 64 32 L 0 32 Z" fill="url(#staffPurpleGrad)" />
                <path d="M 0 26 Q 14 24, 22 22 T 36 10 T 48 18 T 58 6 T 64 10" fill="none" stroke="#7C3AED" strokeWidth="2.4" strokeLinecap="round" />
              </svg>
            </div>
          </div>

          {/* Half Gradient Accent Line Beneath Card */}
          <div 
            className="h-[4px] rounded-br-2xl absolute bottom-0 right-0 w-3/5 pointer-events-none"
            style={{
              background: 'linear-gradient(90deg, transparent 0%, #7C3AED 100%)'
            }}
          />
        </div>
      </div>

      {/* 2. SEARCH & FILTER TOOLBAR MATCHING REFERENCE UI */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-2 bg-white/95 backdrop-blur-md rounded-2xl border border-slate-200/80 shadow-xs">
        {/* Left Side: Search Bar */}
        <div className="relative flex items-center min-w-[260px] max-w-[380px] flex-1">
          <Search className="absolute left-3 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
          <input
            type="text"
            className="w-full h-9 pl-9 pr-8 bg-slate-50/80 border border-slate-200/90 rounded-xl text-xs font-semibold text-slate-800 placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
            placeholder="Search staff by name, role, department..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
          />
          {searchTerm && (
            <button
              className="absolute right-2.5 text-slate-400 hover:text-slate-600 font-bold text-xs"
              onClick={() => setSearchTerm('')}
              title="Clear search"
            >
              ✕
            </button>
          )}
        </div>

        {/* Right Side: Select Dropdowns & CTA */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Role Dropdown */}
          <div className="relative inline-flex items-center">
            <select
              className="h-9 pl-3 pr-8 bg-white border border-slate-200/90 rounded-xl text-xs font-bold text-slate-700 shadow-xs focus:outline-none focus:ring-2 focus:ring-blue-500/20 cursor-pointer hover:border-slate-300 transition-colors appearance-none"
              value={selectedRole}
              onChange={e => setSelectedRole(e.target.value)}
            >
              <option value="All">All Roles</option>
              <option value="doctor">Doctors</option>
              <option value="receptionist">Receptionists</option>
              <option value="hr">HR Managers</option>
              <option value="nurse">Nurses</option>
              <option value="staff">Other Staff</option>
            </select>
            <ChevronDown className="absolute right-2.5 w-3.5 h-3.5 text-slate-500 pointer-events-none" />
          </div>

          {/* Department Dropdown */}
          <div className="relative inline-flex items-center">
            <select
              className="h-9 pl-3 pr-8 bg-white border border-slate-200/90 rounded-xl text-xs font-bold text-slate-700 shadow-xs focus:outline-none focus:ring-2 focus:ring-blue-500/20 cursor-pointer hover:border-slate-300 transition-colors appearance-none"
              value={selectedDept}
              onChange={e => setSelectedDept(e.target.value)}
            >
              <option value="All">All Departments</option>
              {uniqueDepts.map(d => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
            <ChevronDown className="absolute right-2.5 w-3.5 h-3.5 text-slate-500 pointer-events-none" />
          </div>

          {/* Status Dropdown */}
          <div className="relative inline-flex items-center">
            <select
              className="h-9 pl-3 pr-8 bg-white border border-slate-200/90 rounded-xl text-xs font-bold text-slate-700 shadow-xs focus:outline-none focus:ring-2 focus:ring-blue-500/20 cursor-pointer hover:border-slate-300 transition-colors appearance-none"
              value={selectedStatus}
              onChange={e => setSelectedStatus(e.target.value)}
            >
              <option value="All">All Statuses</option>
              <option value="onduty">On Duty / Active</option>
              <option value="onleave">On Leave / Absent</option>
              <option value="weeklyoff">Weekly Off</option>
              <option value="inactive">Inactive / Deactivated</option>
            </select>
            <ChevronDown className="absolute right-2.5 w-3.5 h-3.5 text-slate-500 pointer-events-none" />
          </div>

          {/* Reset Button */}
          {(searchTerm || selectedRole !== 'All' || selectedDept !== 'All' || selectedStatus !== 'All') && (
            <button
              className="h-9 px-3 bg-red-50 text-red-600 border border-red-200 hover:bg-red-100 rounded-xl text-xs font-extrabold flex items-center gap-1.5 transition-all cursor-pointer"
              onClick={() => {
                setSearchTerm('');
                setSelectedRole('All');
                setSelectedDept('All');
                setSelectedStatus('All');
              }}
            >
              <X className="w-3.5 h-3.5" />
              Reset
            </button>
          )}

          {/* + Add Staff CTA */}
          <button
            className="h-9 px-4 rounded-xl text-xs font-extrabold text-white bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 shadow-md shadow-blue-500/20 flex items-center gap-1.5 transition-all cursor-pointer active:scale-95"
            onClick={() => { resetForm(); setIsAdding(true); }}
          >
            <Plus className="w-3.5 h-3.5" />
            Add Staff Member
          </button>
        </div>
      </div>

      {/* 3. STAFF DIRECTORY CARD & FULL DETAILED TABLE */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
        
        {/* Table Subheader */}
        <div className="flex items-center justify-between p-4 border-b border-slate-100 flex-wrap gap-2.5">
          <div className="flex items-center gap-2.5">
            <h3 className="text-sm font-extrabold text-slate-900 flex items-center gap-2">
              <Users className="w-4.5 h-4.5 text-blue-600" />
              Staff Directory
            </h3>
            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-blue-50 text-blue-700 border border-blue-100">
              {filteredEmployees.length} {filteredEmployees.length === 1 ? 'staff member' : 'staff members'}
            </span>
          </div>

          <button
            type="button"
            onClick={() => setShowExportModal(true)}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-white text-blue-600 border border-blue-200 hover:bg-blue-50 hover:border-blue-300 rounded-xl text-xs font-bold shadow-2xs transition-all cursor-pointer"
            title="Export filtered staff records"
          >
            <Download className="w-3.5 h-3.5 stroke-[2.2]" />
            Export
          </button>
        </div>

        {/* Detailed Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200/80 bg-slate-50/75">
                <th className="py-3 px-3 text-[10.5px] font-extrabold text-slate-500 uppercase tracking-wider text-center w-11">#</th>
                <th className="py-3 px-4 text-[10.5px] font-extrabold text-slate-500 uppercase tracking-wider">STAFF</th>
                <th className="py-3 px-3 text-[10.5px] font-extrabold text-slate-500 uppercase tracking-wider">ROLE</th>
                <th className="py-3 px-3 text-[10.5px] font-extrabold text-slate-500 uppercase tracking-wider">DEPARTMENT</th>
                <th className="py-3 px-3 text-[10.5px] font-extrabold text-slate-500 uppercase tracking-wider">CONTACT</th>
                <th className="py-3 px-3 text-[10.5px] font-extrabold text-slate-500 uppercase tracking-wider">JOINED</th>
                <th className="py-3 px-3 text-[10.5px] font-extrabold text-slate-500 uppercase tracking-wider">DAYS OFF</th>
                <th className="py-3 px-3 text-[10.5px] font-extrabold text-slate-500 uppercase tracking-wider">SHIFT / CAPACITY</th>
                <th className="py-3 px-3 text-[10.5px] font-extrabold text-slate-500 uppercase tracking-wider">LAST LOGIN</th>
                <th className="py-3 px-3 text-[10.5px] font-extrabold text-slate-500 uppercase tracking-wider">STATUS</th>
                <th className="py-3 pr-4 text-[10.5px] font-extrabold text-slate-500 uppercase tracking-wider text-right">ACTIONS</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {filteredEmployees.map((emp, idx) => {
                const serialNo = String(idx + 1).padStart(2, '0');
                const currentStatus = getStaffStatus(emp);
                const roleKey = (emp.role || emp.assignedRoles?.[0] || 'staff').toLowerCase();
                const daysOff = getDaysOffString(emp);

                // Avatar colors matching admin panel
                const avatarBg = roleKey.includes('doctor') ? 'bg-purple-100 text-purple-700 border border-purple-200' :
                                 roleKey.includes('reception') ? 'bg-amber-100 text-amber-700 border border-amber-200' :
                                 roleKey.includes('nurse') ? 'bg-emerald-100 text-emerald-700 border border-emerald-200' :
                                 'bg-blue-100 text-blue-700 border border-blue-200';

                // Role pill badge
                const rolePillClass = roleKey.includes('doctor') ? 'bg-purple-50 text-purple-700 border border-purple-200' :
                                      roleKey.includes('reception') ? 'bg-amber-50 text-amber-800 border border-amber-200' :
                                      roleKey.includes('nurse') ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' :
                                      roleKey.includes('hr') ? 'bg-blue-50 text-blue-700 border border-blue-200' :
                                      'bg-slate-50 text-slate-700 border border-slate-200';

                // Status dot pill
                const statusDotClass = (currentStatus === 'On Duty' || currentStatus === 'Active') ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' :
                                       currentStatus === 'On Leave' ? 'bg-amber-50 text-amber-800 border border-amber-200' :
                                       currentStatus === 'Weekly Off' ? 'bg-orange-50 text-orange-800 border border-orange-200' :
                                       'bg-slate-100 text-slate-600 border border-slate-200';

                return (
                  <tr key={emp.id} className="hover:bg-slate-50/60 transition-colors">
                    
                    {/* 1. # */}
                    <td className="text-center font-extrabold text-slate-400 text-[11.5px] py-3.5 px-3">
                      {serialNo}
                    </td>

                    {/* 2. STAFF */}
                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-2.5">
                        {emp.photoUrl ? (
                          <img 
                            src={emp.photoUrl} 
                            alt={emp.name} 
                            className="w-8.5 h-8.5 rounded-lg object-cover border border-slate-200 shrink-0"
                            referrerPolicy="no-referrer"
                          />
                        ) : (
                          <div className={`w-8.5 h-8.5 rounded-lg ${avatarBg} font-extrabold text-xs flex items-center justify-center shrink-0 select-none shadow-2xs`}>
                            {getInitials(emp.name)}
                          </div>
                        )}
                        <div className="min-w-0">
                          <div 
                            onClick={() => onSelectEmployee(emp.id)}
                            className="font-extrabold text-slate-900 hover:text-blue-600 cursor-pointer transition-colors text-xs truncate max-w-[160px]"
                          >
                            {emp.name}
                          </div>
                          <div className="text-[11px] text-slate-500 font-medium truncate max-w-[160px] mt-0.5">
                            {emp.designation || (roleKey.includes('doctor') ? 'Consultant Practitioner' : roleKey.includes('reception') ? 'Receptionist' : roleKey.includes('hr') ? 'HR Manager' : 'Staff Member')}
                          </div>
                        </div>
                      </div>
                    </td>

                    {/* 3. ROLE */}
                    <td className="py-3.5 px-3 whitespace-nowrap">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-extrabold uppercase tracking-wider ${rolePillClass}`}>
                        {emp.assignedRoles?.[0]?.toUpperCase() || emp.role?.toUpperCase() || 'STAFF'}
                      </span>
                    </td>

                    {/* 4. DEPARTMENT */}
                    <td className="py-3.5 px-3 whitespace-nowrap">
                      <span className="px-2.5 py-0.5 bg-slate-50 text-slate-700 border border-slate-200/90 rounded text-[11px] font-semibold">
                        {emp.department || 'Outpatient Services'}
                      </span>
                    </td>

                    {/* 5. CONTACT */}
                    <td className="py-3.5 px-3">
                      <div className="font-extrabold text-slate-800 text-[11.5px] font-mono whitespace-nowrap">
                        {emp.phone || emp.staff_id || '—'}
                      </div>
                      <div className="text-[11px] text-slate-500 font-medium truncate max-w-[150px] mt-0.5" title={emp.email || ''}>
                        {emp.email || '—'}
                      </div>
                    </td>

                    {/* 6. JOINED */}
                    <td className="py-3.5 px-3 whitespace-nowrap">
                      <div className="font-bold text-slate-800 text-xs">
                        {emp.joiningDate || '1 Sept 2026'}
                      </div>
                      <div className="text-[10.5px] text-slate-500 font-semibold mt-0.5">
                        {emp.employmentType || 'Full-Time'}
                      </div>
                    </td>

                    {/* 7. DAYS OFF */}
                    <td className="py-3.5 px-3 whitespace-nowrap">
                      <div className="font-bold text-slate-800 text-xs">
                        {daysOff}
                      </div>
                      <div className="text-[10.5px] text-slate-400 font-medium mt-0.5">
                        {emp.workLocation || 'Main Wing'}
                      </div>
                    </td>

                    {/* 8. SHIFT / CAPACITY */}
                    <td className="py-3.5 px-3 whitespace-nowrap">
                      <div className="font-bold text-slate-800 text-xs">
                        {emp.shiftName || 'General Shift'}
                      </div>
                      <div className="text-[10.5px] text-slate-500 font-semibold mt-0.5">
                        {roleKey.includes('doctor') ? `${emp.doctorSlots?.length || 10} slots/day` : 'Standard'}
                      </div>
                    </td>

                    {/* 9. LAST LOGIN */}
                    <td className="py-3.5 px-3 whitespace-nowrap">
                      <div className="text-xs text-slate-600 font-semibold">
                        {emp.lastLogin || 'Active Today'}
                      </div>
                    </td>

                    {/* 10. STATUS */}
                    <td className="py-3.5 px-3 whitespace-nowrap">
                      <span className={`px-2.5 py-0.8 rounded-full text-[10.5px] font-bold inline-flex items-center gap-1.5 ${statusDotClass}`}>
                        <span className="w-1.5 h-1.5 rounded-full bg-current" />
                        {currentStatus}
                      </span>
                    </td>

                    {/* 11. ACTIONS */}
                    <td className="py-3.5 pr-4 text-right whitespace-nowrap">
                      <button
                        onClick={() => onSelectEmployee(emp.id)}
                        className="px-3 py-1 bg-white hover:bg-blue-50 text-blue-600 border border-blue-200 hover:border-blue-300 rounded-lg text-xs font-bold transition-all shadow-2xs cursor-pointer"
                        title="View Employee Profile"
                      >
                        View Profile
                      </button>
                    </td>
                  </tr>
                );
              })}

              {filteredEmployees.length === 0 && (
                <tr>
                  <td colSpan={11} className="px-6 py-16 text-center text-slate-400">
                    <div className="flex flex-col items-center justify-center">
                      <Users className="w-10 h-10 text-slate-300 mb-2" />
                      <p className="font-bold text-sm text-slate-600">No staff members found</p>
                      <p className="text-xs text-slate-400 mt-0.5">No records matching the selected search and filter criteria.</p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Onboard New Employee Modal (Interactive Form) */}
      {isAdding && createPortal(
        <div 
          className="fixed inset-0 bg-slate-950/60 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 md:p-6 animate-fadeIn hr-modal-overlay" 
          style={{ zIndex: 99999 }}
          onClick={() => { setIsAdding(false); resetForm(); }}
        >
            <form 
              ref={addStaffFormRef}
              onSubmit={handleCreateEmployee}
              onKeyDown={handleFormKeyDown}
              autoComplete="off"
              className="bg-slate-50 rounded-2xl shadow-2xl border border-slate-200/90 max-w-4xl lg:max-w-[960px] w-full relative hr-admin-modal max-h-[92vh] flex flex-col overflow-hidden"
              style={{ animation: 'adminFadeIn 0.2s ease-out' }}
              onClick={e => e.stopPropagation()}
              onInvalidCapture={(e) => {
                const target = e.target;
                if (target) {
                  target.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }
              }}
            >
              {/* Premium Gradient Header */}
              <div className="flex items-center justify-between px-6 py-5 bg-gradient-to-r from-blue-700 via-indigo-700 to-blue-800 text-white rounded-t-2xl relative overflow-hidden shrink-0 shadow-md">
                {/* Background decorative ambient glow */}
                <div className="absolute -right-8 -top-8 w-36 h-36 rounded-full bg-white/10 blur-xl pointer-events-none" />
                <div className="absolute left-1/3 -bottom-10 w-32 h-32 rounded-full bg-indigo-400/15 blur-lg pointer-events-none" />

                <div className="flex items-center gap-3.5 relative z-10">
                  <div className="w-11 h-11 rounded-xl bg-white/15 backdrop-blur-md flex items-center justify-center text-white border border-white/25 shadow-inner">
                    <UserPlus className="w-5 h-5 text-blue-100" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2.5">
                      <h3 className="text-lg font-bold text-white tracking-tight leading-tight">Onboard New Hospital Staff</h3>
                      <span className="text-[10px] uppercase font-black tracking-wider px-2 py-0.5 rounded-full bg-white/20 text-white border border-white/25">
                        Clinic HR
                      </span>
                    </div>
                    <p className="text-xs text-blue-100/90 font-medium mt-0.5">
                      Configure login credentials, clinical access & staff profile
                    </p>
                  </div>
                </div>

                <button 
                  type="button"
                  className="w-8 h-8 rounded-xl bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-all duration-150 border border-white/15 relative z-10 cursor-pointer"
                  onClick={() => { setIsAdding(false); resetForm(); }}
                  title="Close form (Esc)"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Status / Guidance Sub-bar */}
              <div className="px-6 py-2.5 bg-white border-b border-slate-200/80 flex items-center justify-between text-xs text-slate-600 flex-wrap gap-2 shrink-0">
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-1.5">
                    <span className="inline-flex items-center gap-1 text-[10.5px] font-bold text-rose-700 bg-rose-50 border border-rose-200 px-2 py-0.5 rounded-md shadow-2xs">
                      <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse" />
                      Required
                    </span>
                    <span className="text-slate-500 font-medium text-[11px]">Compulsory for registration</span>
                  </div>
                  <span className="text-slate-300 hidden sm:inline">•</span>
                  <div className="flex items-center gap-1.5">
                    <span className="inline-flex items-center gap-1 text-[10.5px] font-semibold text-slate-600 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded-md">
                      Optional
                    </span>
                    <span className="text-slate-400 font-medium text-[11px]">Can be skipped or filled later</span>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 text-[11px] text-blue-700 font-semibold bg-blue-50/80 border border-blue-200/60 px-2.5 py-0.5 rounded-md">
                  <span>Press</span>
                  <kbd className="px-1.5 py-0.2 text-[10px] font-mono bg-white border border-blue-200 rounded shadow-2xs text-blue-900 font-bold">Enter ↵</kbd>
                  <span>for next field</span>
                </div>
              </div>

              {/* Modal Body with Logical Cards */}
              <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-5" style={{ maxHeight: 'calc(92vh - 180px)' }}>
                {error && (
                  <div id="staff-form-error" className="bg-rose-50 border border-rose-200 rounded-xl p-3.5 text-rose-800 text-xs font-semibold flex items-center gap-2.5 shadow-xs">
                    <AlertCircle className="w-5 h-5 text-rose-600 shrink-0" />
                    <span>{error}</span>
                  </div>
                )}

                {/* 1. Account Credentials & Security Card */}
                <div className="bg-white border border-blue-100 rounded-2xl p-4.5 shadow-sm space-y-4">
                  <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                    <div className="flex items-center gap-2.5">
                      <div className="w-7 h-7 rounded-lg bg-gradient-to-tr from-blue-600 to-indigo-600 text-white flex items-center justify-center shadow-xs">
                        <Lock className="w-3.5 h-3.5" />
                      </div>
                      <div>
                        <h4 className="text-xs font-bold uppercase tracking-wider text-slate-800">1. Account Credentials & Security</h4>
                        <p className="text-[11px] text-slate-400 font-medium">Used for staff authentication into CUROXA</p>
                      </div>
                    </div>
                    <span className="text-[10px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded-full bg-rose-50 text-rose-700 border border-rose-200/80">
                      Compulsory
                    </span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Full Name */}
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <label className="text-xs font-bold text-slate-700 flex items-center gap-1">
                          Full Name
                        </label>
                        <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.2 rounded bg-rose-50 text-rose-600 border border-rose-200">
                          Required
                        </span>
                      </div>
                      <div className="relative flex items-center group">
                        <User className="w-4 h-4 text-slate-400 absolute left-3.5 pointer-events-none group-focus-within:text-blue-600 transition-colors" />
                        <input 
                          type="text" 
                          required 
                          placeholder="e.g. Dr. Allison House"
                          value={newEmp.name}
                          onChange={(e) => setNewEmp({...newEmp, name: e.target.value})}
                          className="w-full h-10 pl-10 pr-3.5 bg-slate-50/70 hover:bg-white focus:bg-white border border-slate-200 hover:border-slate-300 focus:border-blue-500 rounded-xl text-xs font-semibold text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-4 focus:ring-blue-500/15 transition-all shadow-2xs"
                          autoComplete="off"
                        />
                      </div>
                    </div>

                    {/* Phone Number */}
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <label className="text-xs font-bold text-slate-700 flex items-center gap-1">
                          Phone Number (10 Digits)
                        </label>
                        <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.2 rounded bg-rose-50 text-rose-600 border border-rose-200">
                          Required
                        </span>
                      </div>
                      <div className="relative flex items-center group">
                        <Phone className="w-4 h-4 text-slate-400 absolute left-3.5 pointer-events-none group-focus-within:text-blue-600 transition-colors" />
                        <input 
                          type="tel" 
                          required 
                          maxLength={10}
                          placeholder="e.g. 9876543210"
                          value={newEmp.phone}
                          onChange={(e) => {
                            const val = e.target.value.replace(/\D/g, '').slice(0, 10);
                            setNewEmp({...newEmp, phone: val, staff_id: val});
                          }}
                          className="w-full h-10 pl-10 pr-3.5 bg-slate-50/70 hover:bg-white focus:bg-white border border-slate-200 hover:border-slate-300 focus:border-blue-500 rounded-xl text-xs font-semibold text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-4 focus:ring-blue-500/15 transition-all shadow-2xs"
                          autoComplete="off"
                        />
                      </div>
                      <span className="text-[10.5px] text-slate-400 font-medium mt-1 block">
                        Used as login username & for SMS/OTP notifications
                      </span>
                    </div>

                    {/* Username (Staff ID / Phone Number) */}
                    <div className="md:col-span-2">
                      <div className="flex items-center justify-between mb-1.5">
                        <label className="text-xs font-bold text-slate-700 flex items-center gap-1">
                          Username (Staff ID)
                        </label>
                        <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.2 rounded bg-emerald-50 text-emerald-700 border border-emerald-200">
                          Auto-Populated
                        </span>
                      </div>
                      <div className="relative flex items-center">
                        <ShieldCheck className="w-4 h-4 text-emerald-600 absolute left-3.5 pointer-events-none" />
                        <input 
                          type="text" 
                          readOnly
                          disabled
                          placeholder="Auto-populated from Phone Number"
                          value={newEmp.phone ? `Username: ${newEmp.phone}` : ''}
                          className="w-full h-10 pl-10 pr-3.5 bg-emerald-50/60 border border-emerald-200/80 rounded-xl text-xs font-mono font-bold text-emerald-900 cursor-not-allowed shadow-2xs"
                        />
                      </div>
                    </div>

                    {/* Login Password */}
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <label className="text-xs font-bold text-slate-700 flex items-center gap-1">
                          Login Password
                        </label>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={generateRandomPassword}
                            className="inline-flex items-center gap-1 text-[10.5px] bg-gradient-to-r from-blue-50 to-indigo-50 hover:from-blue-100 hover:to-indigo-100 text-blue-700 px-2 py-0.5 rounded-md border border-blue-200/80 font-bold transition-all shadow-2xs cursor-pointer active:scale-95"
                          >
                            <Sparkles className="w-3 h-3 text-blue-600" />
                            <span>Generate</span>
                          </button>
                          <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.2 rounded bg-rose-50 text-rose-600 border border-rose-200">
                            Required
                          </span>
                        </div>
                      </div>
                      <div className="relative flex items-center group">
                        <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 pointer-events-none group-focus-within:text-blue-600 transition-colors" />
                        <input 
                          type={showPassword ? 'text' : 'password'} 
                          required 
                          placeholder="••••••••"
                          value={newEmp.password}
                          onChange={(e) => setNewEmp({...newEmp, password: e.target.value})}
                          className="w-full h-10 pl-10 pr-10 bg-slate-50/70 hover:bg-white focus:bg-white border border-slate-200 hover:border-slate-300 focus:border-blue-500 rounded-xl text-xs font-semibold text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-4 focus:ring-blue-500/15 transition-all shadow-2xs"
                          autoComplete="new-password"
                        />
                        <button 
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute right-3 text-slate-400 hover:text-slate-600 p-1 cursor-pointer transition-colors"
                          title={showPassword ? 'Hide password' : 'Show password'}
                        >
                          {showPassword ? <Eye className="w-4 h-4" /> : <Eye className="w-4 h-4 opacity-50" />}
                        </button>
                      </div>

                      {/* Password strength visual meter */}
                      {newEmp.password && (
                        <div className="mt-1.5 flex items-center gap-2">
                          <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden flex gap-1">
                            <div className={`h-full rounded-full transition-all duration-300 ${
                              getPasswordStrength(newEmp.password).label === 'Weak' ? 'w-1/3 bg-rose-500' :
                              getPasswordStrength(newEmp.password).label === 'Medium' ? 'w-2/3 bg-amber-500' :
                              'w-full bg-emerald-500'
                            }`} />
                          </div>
                          <span className="text-[10.5px] font-bold" style={{ color: getPasswordStrength(newEmp.password).color }}>
                            {getPasswordStrength(newEmp.password).label}
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Confirm Password */}
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <label className="text-xs font-bold text-slate-700 flex items-center gap-1">
                          Confirm Password
                        </label>
                        <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.2 rounded bg-rose-50 text-rose-600 border border-rose-200">
                          Required
                        </span>
                      </div>
                      <div className="relative flex items-center group">
                        <KeyRound className="w-4 h-4 text-slate-400 absolute left-3.5 pointer-events-none group-focus-within:text-blue-600 transition-colors" />
                        <input 
                          type={showConfirmPassword ? 'text' : 'password'} 
                          required 
                          placeholder="••••••••"
                          value={newEmp.confirmPassword}
                          onChange={(e) => setNewEmp({...newEmp, confirmPassword: e.target.value})}
                          className={`w-full h-10 pl-10 pr-10 bg-slate-50/70 hover:bg-white focus:bg-white border rounded-xl text-xs font-semibold text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-4 transition-all shadow-2xs ${
                            newEmp.confirmPassword 
                              ? (newEmp.password === newEmp.confirmPassword ? 'border-emerald-400 focus:border-emerald-500 focus:ring-emerald-500/15' : 'border-rose-400 focus:border-rose-500 focus:ring-rose-500/15')
                              : 'border-slate-200 hover:border-slate-300 focus:border-blue-500 focus:ring-blue-500/15'
                          }`}
                          autoComplete="new-password"
                        />
                        <button 
                          type="button"
                          onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                          className="absolute right-3 text-slate-400 hover:text-slate-600 p-1 cursor-pointer transition-colors"
                          title={showConfirmPassword ? 'Hide password' : 'Show password'}
                        >
                          {showConfirmPassword ? <Eye className="w-4 h-4" /> : <Eye className="w-4 h-4 opacity-50" />}
                        </button>
                      </div>
                      {newEmp.confirmPassword && (
                        <div className="mt-1 flex items-center gap-1">
                          {newEmp.password === newEmp.confirmPassword ? (
                            <span className="text-[10.5px] font-bold text-emerald-600 flex items-center gap-1">
                              <Check className="w-3 h-3 text-emerald-600" /> Passwords match
                            </span>
                          ) : (
                            <span className="text-[10.5px] font-bold text-rose-600 flex items-center gap-1">
                              <X className="w-3 h-3 text-rose-600" /> Passwords do not match
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* 2. Role & Department Assignment Card */}
                <div className="bg-white border border-indigo-100 rounded-2xl p-4.5 shadow-sm space-y-4">
                  <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                    <div className="flex items-center gap-2.5">
                      <div className="w-7 h-7 rounded-lg bg-gradient-to-tr from-indigo-600 to-purple-600 text-white flex items-center justify-center shadow-xs">
                        <Briefcase className="w-3.5 h-3.5" />
                      </div>
                      <div>
                        <h4 className="text-xs font-bold uppercase tracking-wider text-slate-800">2. Role & Department Assignment</h4>
                        <p className="text-[11px] text-slate-400 font-medium">Access permissions and operational routing</p>
                      </div>
                    </div>
                    <span className="text-[10px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded-full bg-rose-50 text-rose-700 border border-rose-200/80">
                      Compulsory
                    </span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Access Role */}
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <label className="text-xs font-bold text-slate-700 flex items-center gap-1">
                          Access Role
                        </label>
                        <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.2 rounded bg-rose-50 text-rose-600 border border-rose-200">
                          Required
                        </span>
                      </div>
                      <div className="relative flex items-center group">
                        <Shield className="w-4 h-4 text-slate-400 absolute left-3.5 pointer-events-none group-focus-within:text-blue-600 transition-colors z-10" />
                        <select 
                          className="w-full h-10 pr-9 bg-slate-50/70 hover:bg-white focus:bg-white border border-slate-200 hover:border-slate-300 focus:border-blue-500 rounded-xl text-xs font-semibold text-slate-800 focus:outline-none focus:ring-4 focus:ring-blue-500/15 transition-all appearance-none cursor-pointer shadow-2xs"
                          style={{ paddingLeft: '44px', paddingRight: '36px' }}
                          value={newEmp.role} 
                          onChange={(e) => setNewEmp({...newEmp, role: e.target.value})}
                        >
                          {getAvailableRoles().map(r => (
                            <option key={r.value} value={r.value}>{r.label}</option>
                          ))}
                        </select>
                        <ChevronDown className="w-4 h-4 text-slate-400 absolute right-3 pointer-events-none z-10" />
                      </div>
                    </div>

                    {/* Hospital Email */}
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <label className="text-xs font-bold text-slate-700 flex items-center gap-1">
                          Hospital Email
                        </label>
                        <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.2 rounded bg-rose-50 text-rose-600 border border-rose-200">
                          Required
                        </span>
                      </div>
                      <div className="relative flex items-center group">
                        <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 pointer-events-none group-focus-within:text-blue-600 transition-colors" />
                        <input 
                          type="email" 
                          required
                          placeholder="e.g. allison.house@hospital.com"
                          value={newEmp.email}
                          onChange={(e) => setNewEmp({...newEmp, email: e.target.value})}
                          className="w-full h-10 pl-10 pr-3.5 bg-slate-50/70 hover:bg-white focus:bg-white border border-slate-200 hover:border-slate-300 focus:border-blue-500 rounded-xl text-xs font-semibold text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-4 focus:ring-blue-500/15 transition-all shadow-2xs"
                          autoComplete="off"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* 3. Clinical Configuration Card (Doctors Only) */}
                {newEmp.role === 'doctor' && (
                  <div className="bg-gradient-to-br from-white to-teal-50/20 border border-teal-200/80 rounded-2xl p-4.5 shadow-sm space-y-4">
                    <div className="flex items-center justify-between pb-3 border-b border-teal-100">
                      <div className="flex items-center gap-2.5">
                        <div className="w-7 h-7 rounded-lg bg-gradient-to-tr from-teal-600 to-emerald-600 text-white flex items-center justify-center shadow-xs">
                          <Stethoscope className="w-3.5 h-3.5" />
                        </div>
                        <div>
                          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-800">3. Doctor Clinical Configuration</h4>
                          <p className="text-[11px] text-teal-700 font-medium">Specialization, appointment fees, and OPD schedule</p>
                        </div>
                      </div>
                      <span className="text-[10px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded-full bg-teal-50 text-teal-700 border border-teal-200">
                        Doctor Setup
                      </span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {/* Specialization */}
                      <div>
                        <div className="flex items-center justify-between mb-1.5">
                          <label className="text-xs font-bold text-slate-700 flex items-center gap-1">
                            Medical Specialization
                          </label>
                          <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.2 rounded bg-rose-50 text-rose-600 border border-rose-200">
                            Required
                          </span>
                        </div>
                        <div className="relative flex items-center group">
                          <Stethoscope className="w-4 h-4 text-teal-600 absolute left-3.5 pointer-events-none z-10" />
                          <select 
                            value={newEmp.specialty}
                            onChange={(e) => setNewEmp({...newEmp, specialty: e.target.value})}
                            className="w-full h-10 pr-9 bg-slate-50/70 hover:bg-white focus:bg-white border border-slate-200 hover:border-slate-300 focus:border-teal-500 rounded-xl text-xs font-semibold text-slate-800 focus:outline-none focus:ring-4 focus:ring-teal-500/15 transition-all appearance-none cursor-pointer shadow-2xs"
                            style={{ paddingLeft: '44px', paddingRight: '36px' }}
                          >
                            <option value="">-- Select Specialization --</option>
                            {DOCTOR_SPECIALIZATIONS.map(spec => (
                              <option key={spec} value={spec}>{spec}</option>
                            ))}
                          </select>
                          <ChevronDown className="w-4 h-4 text-slate-400 absolute right-3 pointer-events-none z-10" />
                        </div>
                      </div>

                      {/* Doctor Consultation Fee */}
                      <div>
                        <div className="flex items-center justify-between mb-1.5">
                          <label className="text-xs font-bold text-slate-700 flex items-center gap-1">
                            Consultation Fee (₹ INR)
                          </label>
                          <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.2 rounded bg-blue-50 text-blue-700 border border-blue-200">
                            Default: ₹500
                          </span>
                        </div>
                        <div className="relative flex items-center group">
                          <span className="absolute left-3.5 font-bold text-sm text-slate-500 pointer-events-none group-focus-within:text-teal-600 transition-colors">₹</span>
                          <input 
                            type="number" 
                            min="0"
                            placeholder="e.g. 500"
                            value={newEmp.consultationFee !== undefined ? newEmp.consultationFee : 500}
                            onChange={(e) => setNewEmp({...newEmp, consultationFee: e.target.value !== '' ? Number(e.target.value) : ''})}
                            className="w-full h-10 pl-10 pr-3.5 bg-slate-50/70 hover:bg-white focus:bg-white border border-slate-200 hover:border-slate-300 focus:border-teal-500 rounded-xl text-xs font-semibold text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-4 focus:ring-teal-500/15 transition-all shadow-2xs"
                          />
                        </div>
                      </div>

                      {/* Attending Time Slots */}
                      <div className="md:col-span-2 space-y-2.5">
                        <div className="flex items-center justify-between flex-wrap gap-2">
                          <div className="flex items-center gap-2">
                            <label className="text-xs font-bold text-slate-700 flex items-center gap-1">
                              Attending OPD Time Slots
                            </label>
                            <span className="text-[10.5px] font-bold px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 border border-blue-200 shadow-2xs">
                              {(newEmp.doctorSlots || []).length} Active
                            </span>
                          </div>

                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                const allBase = [
                                  '09:00 AM - 09:30 AM', '09:30 AM - 10:00 AM', '10:00 AM - 10:30 AM',
                                  '10:30 AM - 11:00 AM', '11:00 AM - 11:30 AM', '11:30 AM - 12:00 PM',
                                  '12:00 PM - 12:30 PM', '12:30 PM - 01:00 PM', '02:00 PM - 02:30 PM',
                                  '02:30 PM - 03:00 PM', '03:00 PM - 03:30 PM', '03:30 PM - 04:00 PM',
                                  '04:00 PM - 04:30 PM', '04:30 PM - 05:00 PM', '05:00 PM - 05:30 PM',
                                  ...(newEmp.doctorSlots || [])
                                ];
                                setNewEmp({ ...newEmp, doctorSlots: Array.from(new Set(allBase)) });
                              }}
                              className="text-[11px] font-bold text-blue-600 hover:text-blue-800 underline cursor-pointer"
                            >
                              Select All
                            </button>
                            <span className="text-slate-300">|</span>
                            <button
                              type="button"
                              onClick={() => setNewEmp({ ...newEmp, doctorSlots: [] })}
                              className="text-[11px] font-bold text-slate-500 hover:text-rose-600 underline cursor-pointer"
                            >
                              Clear All
                            </button>
                            <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.2 rounded bg-rose-50 text-rose-600 border border-rose-200 ml-1">
                              Required (≥ 1)
                            </span>
                          </div>
                        </div>

                        {/* Add Custom Slot Input */}
                        <div className="flex gap-2">
                          <div className="relative flex-1 flex items-center">
                            <Clock className="w-4 h-4 text-slate-400 absolute left-3 pointer-events-none" />
                            <input 
                              type="text" 
                              placeholder="Add custom slot (e.g. 10:00 AM - 11:00 AM)" 
                              value={customSlotInput}
                              onChange={e => setCustomSlotInput(e.target.value)}
                              className="w-full h-9 pl-9 pr-3 bg-white border border-slate-200 hover:border-slate-300 focus:border-teal-500 rounded-lg text-xs font-semibold text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-3 focus:ring-teal-500/15 transition-all"
                            />
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              if (!customSlotInput.trim()) return;
                              const newSlot = customSlotInput.trim();
                              const currentSlots = newEmp.doctorSlots || [];
                              if (!currentSlots.includes(newSlot)) {
                                setNewEmp({
                                  ...newEmp,
                                  doctorSlots: [...currentSlots, newSlot]
                                });
                              }
                              setCustomSlotInput('');
                            }}
                            className="px-3.5 h-9 bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-700 hover:to-emerald-700 text-white rounded-lg text-xs font-bold transition-all shadow-xs cursor-pointer active:scale-95 flex items-center gap-1"
                          >
                            <Plus className="w-3.5 h-3.5" />
                            <span>Add Slot</span>
                          </button>
                        </div>

                        {/* Visual Legend */}
                        <div className="flex items-center justify-between text-[11px] px-1 text-slate-500 pt-0.5">
                          <div className="flex items-center gap-3">
                            <span className="inline-flex items-center gap-1.5 font-bold text-blue-700">
                              <span className="w-4 h-4 rounded bg-blue-600 text-white inline-flex items-center justify-center text-[10px] shadow-2xs">✓</span>
                              Selected (Scheduled OPD)
                            </span>
                            <span className="inline-flex items-center gap-1.5 font-medium text-slate-500">
                              <span className="w-4 h-4 rounded border border-dashed border-slate-400 bg-white text-slate-400 inline-flex items-center justify-center text-[10px]">+</span>
                              Deselected (Click to enable)
                            </span>
                          </div>
                          <span className="text-[10.5px] text-slate-400 hidden sm:inline">Click slot to toggle</span>
                        </div>

                        {/* Slots Pill Stack */}
                        <div className="flex flex-wrap gap-2 p-3.5 border border-teal-200/70 rounded-xl bg-teal-50/25 max-h-[160px] overflow-y-auto" data-lenis-prevent>
                          {Array.from(new Set([
                            '09:00 AM - 09:30 AM', '09:30 AM - 10:00 AM', '10:00 AM - 10:30 AM',
                            '10:30 AM - 11:00 AM', '11:00 AM - 11:30 AM', '11:30 AM - 12:00 PM',
                            '12:00 PM - 12:30 PM', '12:30 PM - 01:00 PM', '02:00 PM - 02:30 PM',
                            '02:30 PM - 03:00 PM', '03:00 PM - 03:30 PM', '03:30 PM - 04:00 PM',
                            '04:00 PM - 04:30 PM', '04:30 PM - 05:00 PM', '05:00 PM - 05:30 PM',
                            ...(newEmp.doctorSlots || [])
                          ])).map(slot => {
                            const isSelected = (newEmp.doctorSlots || []).includes(slot);
                            return (
                              <button
                                key={slot}
                                type="button"
                                onClick={() => {
                                  let currentSlots = [...(newEmp.doctorSlots || [])];
                                  if (currentSlots.includes(slot)) {
                                    currentSlots = currentSlots.filter(s => s !== slot);
                                  } else {
                                    currentSlots.push(slot);
                                  }
                                  setNewEmp({...newEmp, doctorSlots: currentSlots});
                                }}
                                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all cursor-pointer select-none active:scale-95 ${
                                  isSelected
                                    ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-xs shadow-blue-500/25 border border-blue-600'
                                    : 'bg-white hover:bg-blue-50/50 text-slate-600 border border-dashed border-slate-300 hover:border-blue-400 hover:text-blue-700'
                                }`}
                                title={isSelected ? 'Click to deselect (remove from schedule)' : 'Click to select (add to schedule)'}
                              >
                                {isSelected ? (
                                  <span className="w-3.5 h-3.5 rounded-full bg-white/20 flex items-center justify-center">
                                    <Check className="w-2.5 h-2.5 text-white stroke-[3]" />
                                  </span>
                                ) : (
                                  <span className="w-3.5 h-3.5 rounded-full bg-slate-100 flex items-center justify-center">
                                    <Plus className="w-2.5 h-2.5 text-slate-400" />
                                  </span>
                                )}
                                <span>{slot}</span>
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {/* Weekly Off Days */}
                      <div className="md:col-span-2 space-y-1.5">
                        <div className="flex items-center justify-between mb-1">
                          <div className="flex items-center gap-2">
                            <label className="text-xs font-bold text-slate-700 flex items-center gap-1">
                              Weekly Off Days
                            </label>
                            <span className="text-[10.5px] text-slate-500 font-medium">
                              (Mark which days doctor does NOT attend clinic)
                            </span>
                          </div>
                          <span className="text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.2 rounded bg-slate-100 text-slate-500 border border-slate-200">
                            Optional
                          </span>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {WEEKDAYS.map(day => {
                            const isSelected = Array.isArray(newEmp.weeklyOff)
                              ? newEmp.weeklyOff.includes(day)
                              : (newEmp.weeklyOff || '').split(',').map(d => d.trim()).includes(day);
                            return (
                              <button
                                key={day}
                                type="button"
                                onClick={() => {
                                  let currentOffs = Array.isArray(newEmp.weeklyOff)
                                    ? [...newEmp.weeklyOff]
                                    : (newEmp.weeklyOff ? newEmp.weeklyOff.split(',').map(d => d.trim()) : []);
                                  if (currentOffs.includes(day)) {
                                    currentOffs = currentOffs.filter(d => d !== day);
                                  } else {
                                    currentOffs.push(day);
                                  }
                                  setNewEmp({...newEmp, weeklyOff: currentOffs});
                                }}
                                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border transition-all cursor-pointer select-none active:scale-95 ${
                                  isSelected
                                    ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white border-transparent shadow-xs shadow-blue-500/25'
                                    : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                                }`}
                                title={isSelected ? `${day} marked as OFF (Click to mark Working)` : `${day} is Working (Click to mark OFF)`}
                              >
                                {isSelected && <Check className="w-3 h-3 text-white stroke-[3]" />}
                                <span>{day.slice(0, 3)}</span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* 4. Personal, Statutory & Emergency Details Card (Optional) */}
                <div className="bg-white border border-slate-200/90 rounded-2xl shadow-sm overflow-hidden">
                  <div 
                    className="flex items-center justify-between p-4.5 cursor-pointer bg-gradient-to-r from-slate-50 via-white to-slate-50 hover:bg-slate-100/50 transition-colors"
                    onClick={() => setShowOptionalDetails(!showOptionalDetails)}
                  >
                    <div className="flex items-center gap-2.5">
                      <div className="w-7 h-7 rounded-lg bg-gradient-to-tr from-slate-600 to-blue-600 text-white flex items-center justify-center shadow-xs">
                        <FileText className="w-3.5 h-3.5" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-800">4. Personal, Statutory & Emergency Details</h4>
                          <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.2 rounded-full bg-slate-100 text-slate-600 border border-slate-200">
                            All Optional
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-400 font-medium">Demographics, Aadhaar/PAN, Address & Emergency Contact</p>
                      </div>
                    </div>
                    <button 
                      type="button"
                      className="p-1 rounded-lg hover:bg-slate-200/60 text-slate-500 transition-colors"
                    >
                      {showOptionalDetails ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </button>
                  </div>

                  {showOptionalDetails && (
                    <div className="p-4.5 pt-2 border-t border-slate-100 space-y-4">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {/* Annual CTC */}
                        <div>
                          <div className="flex items-center justify-between mb-1.5">
                            <label className="text-xs font-bold text-slate-700 flex items-center gap-1">
                              Annual CTC (₹ INR)
                            </label>
                            <span className="text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.2 rounded bg-slate-100 text-slate-500 border border-slate-200">
                              Optional
                            </span>
                          </div>
                          <div className="relative flex items-center group">
                            <span className="absolute left-3.5 font-bold text-sm text-slate-400 pointer-events-none group-focus-within:text-blue-600 transition-colors">₹</span>
                            <input 
                              type="number" 
                              placeholder="e.g. 480000"
                              value={newEmp.ctcAnnual}
                              onChange={(e) => setNewEmp({...newEmp, ctcAnnual: e.target.value})}
                              className="w-full h-10 pl-10 pr-3.5 bg-slate-50/70 hover:bg-white focus:bg-white border border-slate-200 hover:border-slate-300 focus:border-blue-500 rounded-xl text-xs font-semibold text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-4 focus:ring-blue-500/15 transition-all shadow-2xs"
                            />
                          </div>
                        </div>

                        {/* Date of Birth */}
                        <div>
                          <div className="flex items-center justify-between mb-1.5">
                            <label className="text-xs font-bold text-slate-700 flex items-center gap-1">
                              Date of Birth
                            </label>
                            <span className="text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.2 rounded bg-slate-100 text-slate-500 border border-slate-200">
                              Optional
                            </span>
                          </div>
                          <div className="relative flex items-center group">
                            <Calendar className="w-4 h-4 text-slate-400 absolute left-3.5 pointer-events-none group-focus-within:text-blue-600 transition-colors z-10" />
                            <input 
                              type="date" 
                              value={newEmp.dob} 
                              onChange={e => setNewEmp({...newEmp, dob: e.target.value})} 
                              className="w-full h-10 pr-3.5 bg-slate-50/70 hover:bg-white focus:bg-white border border-slate-200 hover:border-slate-300 focus:border-blue-500 rounded-xl text-xs font-semibold text-slate-800 focus:outline-none focus:ring-4 focus:ring-blue-500/15 transition-all shadow-2xs"
                              style={{ paddingLeft: '44px' }}
                            />
                          </div>
                        </div>

                        {/* Gender */}
                        <div>
                          <div className="flex items-center justify-between mb-1.5">
                            <label className="text-xs font-bold text-slate-700 flex items-center gap-1">
                              Gender
                            </label>
                            <span className="text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.2 rounded bg-slate-100 text-slate-500 border border-slate-200">
                              Optional
                            </span>
                          </div>
                          <div className="relative flex items-center group">
                            <Users className="w-4 h-4 text-slate-400 absolute left-3.5 pointer-events-none group-focus-within:text-blue-600 transition-colors z-10" />
                            <select 
                              value={newEmp.gender} 
                              onChange={e => setNewEmp({...newEmp, gender: e.target.value})} 
                              className="w-full h-10 pr-9 bg-slate-50/70 hover:bg-white focus:bg-white border border-slate-200 hover:border-slate-300 focus:border-blue-500 rounded-xl text-xs font-semibold text-slate-800 focus:outline-none focus:ring-4 focus:ring-blue-500/15 transition-all appearance-none cursor-pointer shadow-2xs"
                              style={{ paddingLeft: '44px', paddingRight: '36px' }}
                            >
                              <option value="">-- Select Gender --</option>
                              <option value="Male">Male</option>
                              <option value="Female">Female</option>
                              <option value="Other">Other</option>
                            </select>
                            <ChevronDown className="w-4 h-4 text-slate-400 absolute right-3 pointer-events-none z-10" />
                          </div>
                        </div>

                        {/* Blood Group */}
                        <div>
                          <div className="flex items-center justify-between mb-1.5">
                            <label className="text-xs font-bold text-slate-700 flex items-center gap-1">
                              Blood Group
                            </label>
                            <span className="text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.2 rounded bg-slate-100 text-slate-500 border border-slate-200">
                              Optional
                            </span>
                          </div>
                          <div className="relative flex items-center group">
                            <Droplet className="w-4 h-4 text-rose-500 absolute left-3.5 pointer-events-none z-10" />
                            <select 
                              value={newEmp.bloodGroup} 
                              onChange={e => setNewEmp({...newEmp, bloodGroup: e.target.value})} 
                              className="w-full h-10 pr-9 bg-slate-50/70 hover:bg-white focus:bg-white border border-slate-200 hover:border-slate-300 focus:border-blue-500 rounded-xl text-xs font-semibold text-slate-800 focus:outline-none focus:ring-4 focus:ring-blue-500/15 transition-all appearance-none cursor-pointer shadow-2xs"
                              style={{ paddingLeft: '44px', paddingRight: '36px' }}
                            >
                              <option value="">-- Select Blood Group --</option>
                              {['A+', 'A-', 'B+', 'B-', 'O+', 'O-', 'AB+', 'AB-'].map(bg => <option key={bg} value={bg}>{bg}</option>)}
                            </select>
                            <ChevronDown className="w-4 h-4 text-slate-400 absolute right-3 pointer-events-none z-10" />
                          </div>
                        </div>

                        {/* Aadhaar Number */}
                        <div>
                          <div className="flex items-center justify-between mb-1.5">
                            <label className="text-xs font-bold text-slate-700 flex items-center gap-1">
                              Aadhaar Card (12 Digits)
                            </label>
                            <span className="text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.2 rounded bg-slate-100 text-slate-500 border border-slate-200">
                              Optional
                            </span>
                          </div>
                          <div className="relative flex items-center group">
                            <CreditCard className="w-4 h-4 text-slate-400 absolute left-3.5 pointer-events-none group-focus-within:text-blue-600 transition-colors" />
                            <input 
                              type="text" 
                              placeholder="e.g. 1234-5678-9012" 
                              value={newEmp.aadhaar} 
                              onChange={e => setNewEmp({...newEmp, aadhaar: e.target.value})} 
                              className="w-full h-10 pl-10 pr-3.5 bg-slate-50/70 hover:bg-white focus:bg-white border border-slate-200 hover:border-slate-300 focus:border-blue-500 rounded-xl text-xs font-mono font-semibold text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-4 focus:ring-blue-500/15 transition-all shadow-2xs"
                            />
                          </div>
                        </div>

                        {/* PAN Number */}
                        <div>
                          <div className="flex items-center justify-between mb-1.5">
                            <label className="text-xs font-bold text-slate-700 flex items-center gap-1">
                              PAN Card
                            </label>
                            <span className="text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.2 rounded bg-slate-100 text-slate-500 border border-slate-200">
                              Optional
                            </span>
                          </div>
                          <div className="relative flex items-center group">
                            <FileText className="w-4 h-4 text-slate-400 absolute left-3.5 pointer-events-none group-focus-within:text-blue-600 transition-colors" />
                            <input 
                              type="text" 
                              placeholder="e.g. ABCDE1234F" 
                              value={newEmp.pan} 
                              onChange={e => setNewEmp({...newEmp, pan: e.target.value.toUpperCase()})} 
                              className="w-full h-10 pl-10 pr-3.5 bg-slate-50/70 hover:bg-white focus:bg-white border border-slate-200 hover:border-slate-300 focus:border-blue-500 rounded-xl text-xs font-mono font-semibold text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-4 focus:ring-blue-500/15 transition-all shadow-2xs"
                            />
                          </div>
                        </div>

                        {/* Residential Address */}
                        <div className="md:col-span-2">
                          <div className="flex items-center justify-between mb-1.5">
                            <label className="text-xs font-bold text-slate-700 flex items-center gap-1">
                              Residential Address
                            </label>
                            <span className="text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.2 rounded bg-slate-100 text-slate-500 border border-slate-200">
                              Optional
                            </span>
                          </div>
                          <div className="relative flex group">
                            <MapPin className="w-4 h-4 text-slate-400 absolute left-3.5 top-3 pointer-events-none group-focus-within:text-blue-600 transition-colors" />
                            <textarea 
                              rows="2" 
                              placeholder="e.g. Staff Quarters, Building B, Room 402" 
                              value={newEmp.address} 
                              onChange={e => setNewEmp({...newEmp, address: e.target.value})} 
                              className="w-full pl-10 pr-3.5 py-2.5 bg-slate-50/70 hover:bg-white focus:bg-white border border-slate-200 hover:border-slate-300 focus:border-blue-500 rounded-xl text-xs font-semibold text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-4 focus:ring-blue-500/15 transition-all shadow-2xs resize-none"
                            />
                          </div>
                        </div>

                        {/* Emergency Contact */}
                        <div className="md:col-span-2 pt-2 border-t border-slate-100">
                          <div className="flex items-center gap-2 mb-3">
                            <HeartPulse className="w-4 h-4 text-rose-500" />
                            <span className="text-xs font-bold uppercase tracking-wider text-slate-700">Emergency Contact Person</span>
                            <span className="text-[10px] font-semibold px-2 py-0.2 rounded bg-slate-100 text-slate-500 border border-slate-200">Optional</span>
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                            <div>
                              <label className="text-[11px] font-semibold text-slate-600 mb-1 block">Contact Name</label>
                              <div className="relative flex items-center group">
                                <User className="w-3.5 h-3.5 text-slate-400 absolute left-3 pointer-events-none" />
                                <input 
                                  type="text" 
                                  placeholder="e.g. Jane Doe" 
                                  value={newEmp.emergencyContactName} 
                                  onChange={e => setNewEmp({...newEmp, emergencyContactName: e.target.value})} 
                                  className="w-full h-9 pl-8.5 pr-2.5 bg-slate-50/70 hover:bg-white focus:bg-white border border-slate-200 hover:border-slate-300 focus:border-blue-500 rounded-lg text-xs font-semibold text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-3 focus:ring-blue-500/15 transition-all"
                                />
                              </div>
                            </div>
                            <div>
                              <label className="text-[11px] font-semibold text-slate-600 mb-1 block">Relationship</label>
                              <div className="relative flex items-center group">
                                <Users className="w-3.5 h-3.5 text-slate-400 absolute left-3 pointer-events-none" />
                                <input 
                                  type="text" 
                                  placeholder="e.g. Spouse / Parent" 
                                  value={newEmp.emergencyContactRelation} 
                                  onChange={e => setNewEmp({...newEmp, emergencyContactRelation: e.target.value})} 
                                  className="w-full h-9 pl-8.5 pr-2.5 bg-slate-50/70 hover:bg-white focus:bg-white border border-slate-200 hover:border-slate-300 focus:border-blue-500 rounded-lg text-xs font-semibold text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-3 focus:ring-blue-500/15 transition-all"
                                />
                              </div>
                            </div>
                            <div>
                              <label className="text-[11px] font-semibold text-slate-600 mb-1 block">Contact Phone</label>
                              <div className="relative flex items-center group">
                                <Phone className="w-3.5 h-3.5 text-slate-400 absolute left-3 pointer-events-none" />
                                <input 
                                  type="tel" 
                                  maxLength={10}
                                  placeholder="e.g. 9876543210" 
                                  value={newEmp.emergencyContactPhone} 
                                  onChange={e => {
                                    const val = e.target.value.replace(/\D/g, '').slice(0, 10);
                                    setNewEmp({...newEmp, emergencyContactPhone: val});
                                  }} 
                                  className="w-full h-9 pl-8.5 pr-2.5 bg-slate-50/70 hover:bg-white focus:bg-white border border-slate-200 hover:border-slate-300 focus:border-blue-500 rounded-lg text-xs font-semibold text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-3 focus:ring-blue-500/15 transition-all"
                                />
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Modal Footer */}
              <div className="flex items-center justify-between p-4 sm:px-6 border-t border-slate-200/90 bg-white shrink-0">
                <div className="text-xs text-slate-500 font-medium hidden sm:flex items-center gap-1.5">
                  <span className="text-slate-400">Shortcut:</span>
                  <kbd className="px-2 py-0.5 text-[10.5px] font-mono bg-slate-100 border border-slate-200 rounded text-slate-700 font-bold shadow-2xs">Enter ↵</kbd>
                  <span className="text-slate-500">advances fields & submits</span>
                </div>

                <div className="flex items-center gap-3 ml-auto">
                  <button 
                    type="button" 
                    disabled={isSubmitting}
                    onClick={() => { setIsAdding(false); resetForm(); }}
                    className="h-10 px-5 border border-slate-200 hover:border-slate-300 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-50 active:scale-95 transition-all cursor-pointer disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button 
                    type="submit"
                    disabled={isSubmitting}
                    className="h-10 px-6 bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-700 hover:from-blue-700 hover:via-indigo-700 hover:to-blue-800 text-white rounded-xl font-bold text-xs shadow-md shadow-blue-500/25 active:scale-95 transition-all flex items-center gap-2 cursor-pointer disabled:opacity-60"
                  >
                    {isSubmitting ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                        <span>Registering...</span>
                      </>
                    ) : (
                      <>
                        <UserCheck className="w-4 h-4" />
                        <span>Register Staff Member</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </form>
        </div>
      , document.body)}

      {showExportModal && (
        <ExportModal
          dataset="Staff"
          data={filteredEmployees}
          columns={staffExportColumns}
          dateField={['joiningDate', 'createdAt']}
          currentFilters={{
            search: searchTerm,
            department: selectedDept,
            status: selectedStatus,
            type: selectedType
          }}
          clinicName="CUROXA HEALTHCARE"
          onClose={() => setShowExportModal(false)}
        />
      )}
    </div>
  );
}
