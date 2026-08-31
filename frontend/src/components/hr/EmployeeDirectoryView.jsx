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
  const [selectedDept, setSelectedDept] = useState('All');
  const [selectedStatus, setSelectedStatus] = useState('All');
  const [selectedType, setSelectedType] = useState('All');
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

  // Filter logic
  const filteredEmployees = employees.filter(emp => {
    const matchesSearch = emp.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          emp.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          emp.email.toLowerCase().includes(searchTerm.toLowerCase());
    
    const empRoleLower = (emp.role || '').toLowerCase();
    const empDeptLower = (emp.department || '').toLowerCase();
    const empDesignationLower = (emp.designation || '').toLowerCase();

    const matchesDept = selectedDept === 'All' || 
                        emp.department === selectedDept ||
                        (selectedDept === 'Pharmacy' && (empRoleLower === 'pharmacy' || empRoleLower === 'pharmacist' || empDeptLower === 'pharmacy' || empDesignationLower.includes('pharmacist'))) ||
                        (selectedDept === 'Pathology & Lab' && (empRoleLower === 'lab' || empRoleLower === 'laboratory' || empDeptLower === 'pathology & lab' || empDesignationLower.includes('lab'))) ||
                        (selectedDept === 'Hospital Administration' && (empRoleLower === 'hr' || empRoleLower === 'admin' || empRoleLower === 'superadmin' || empRoleLower === 'super admin' || empDeptLower === 'hospital administration' || empDesignationLower.includes('admin') || empDesignationLower.includes('hr'))) ||
                        (selectedDept === 'Outpatient Services' && (empRoleLower === 'receptionist' || empRoleLower === 'reception' || empDeptLower === 'outpatient services'));

    const matchesStatus = selectedStatus === 'All' || emp.status === selectedStatus;
    const matchesType = selectedType === 'All' || emp.employmentType === selectedType;

    return matchesSearch && matchesDept && matchesStatus && matchesType;
  });

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



  return (
    <div className="space-y-6" id="employee-directory-root">
      
      {/* Header bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-display font-bold text-slate-900">Hospital Medical & Admin Staff</h1>
          <p className="text-slate-400 text-xs mt-0.5">Comprehensive employee records, credential settings, and reporting structure.</p>
        </div>
        <div className="flex items-center gap-2 self-start">
          <button 
            type="button"
            onClick={() => setShowExportModal(true)}
            className="bg-white hover:bg-slate-50 text-blue-600 border border-blue-200 px-3.5 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 shadow-xs transition-all cursor-pointer"
            title="Export filtered staff records"
          >
            <Download className="w-4 h-4 stroke-[2.2]" />
            Export
          </button>
          <button 
            onClick={() => { resetForm(); setIsAdding(true); }}
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 shadow-sm transition-all"
          >
            <Plus className="w-4 h-4" />
            Onboard New Staff
          </button>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white p-4 rounded-xl border border-slate-100 shadow-sm space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          
          {/* Search */}
          <div className="relative flex items-center">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 pointer-events-none" />
            <input 
              type="text" 
              placeholder="Search by Name, ID, or Email..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-4 h-10 rounded-lg text-xs font-medium border border-slate-200 focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
            />
          </div>

          {/* Dept filter */}
          <div className="relative flex items-center">
            <select 
              value={selectedDept}
              onChange={(e) => setSelectedDept(e.target.value)}
              className="w-full pl-3 pr-8 h-10 rounded-lg text-xs font-semibold border border-slate-200 focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white appearance-none"
            >
              <option value="All">All Departments</option>
              {HOSPITAL_DEPARTMENTS.map(dept => (
                <option key={dept} value={dept}>{dept}</option>
              ))}
            </select>
            <ChevronDown className="w-4 h-4 text-slate-400 absolute right-3 pointer-events-none" />
          </div>

          {/* Status filter */}
          <div className="relative flex items-center">
            <select 
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              className="w-full pl-3 pr-8 h-10 rounded-lg text-xs font-semibold border border-slate-200 focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white appearance-none"
            >
              <option value="All">All Statuses</option>
              <option value="Active">Active</option>
              <option value="Probation">Probation</option>
              <option value="Notice Period">Notice Period</option>
              <option value="Exited">Exited</option>
            </select>
            <ChevronDown className="w-4 h-4 text-slate-400 absolute right-3 pointer-events-none" />
          </div>

          {/* Employment Type filter */}
          <div className="relative flex items-center">
            <select 
              value={selectedType}
              onChange={(e) => setSelectedType(e.target.value)}
              className="w-full pl-3 pr-8 h-10 rounded-lg text-xs font-semibold border border-slate-200 focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white appearance-none"
            >
              <option value="All">All Types</option>
              <option value="Full-Time">Full-Time</option>
              <option value="Part-Time">Part-Time</option>
              <option value="Consultant">Consultant</option>
              <option value="Contract">Contract</option>
            </select>
            <ChevronDown className="w-4 h-4 text-slate-400 absolute right-3 pointer-events-none" />
          </div>

        </div>
      </div>

      {/* Directory Table */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/50">
                <th className="px-6 py-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Employee Name & ID</th>
                <th className="px-6 py-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Role & Specialization</th>
                <th className="px-6 py-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Assigned Security Roles</th>
                <th className="px-6 py-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Weekly Off</th>
                <th className="px-6 py-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Status</th>
                <th className="px-6 py-4 text-xs font-semibold text-slate-400 uppercase tracking-wider text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {filteredEmployees.map((emp) => (
                <tr key={emp.id} className="hover:bg-slate-50/50 transition-colors">
                  
                  {/* Photo & Name */}
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      {emp.photoUrl ? (
                        <img 
                          src={emp.photoUrl} 
                          alt={emp.name} 
                          className="w-10 h-10 rounded-full object-cover border border-slate-200"
                          referrerPolicy="no-referrer"
                        />
                      ) : (
                        <div className="w-10 h-10 rounded-full bg-blue-50 border border-slate-200 text-blue-600 font-bold flex items-center justify-center text-xs shrink-0 select-none">
                          {emp.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                        </div>
                      )}
                      <div>
                        <h4 
                          onClick={() => onSelectEmployee(emp.id)}
                          className="font-semibold text-slate-900 hover:text-blue-600 cursor-pointer transition-colors"
                        >
                          {emp.name}
                        </h4>
                      </div>
                    </div>
                  </td>

                  {/* Role & Specialization */}
                  <td className="px-6 py-4">
                    <div className="text-slate-700 font-medium">{emp.assignedRoles?.[0] || emp.designation || 'Staff'}</div>
                    {(emp.specialty || emp.department) && (
                      <span className="text-[10px] text-slate-400 block mt-0.5">{emp.specialty || emp.department}</span>
                    )}
                  </td>
                  {/* Assigned Security Roles */}
                  <td className="px-6 py-4">
                    <div className="flex flex-wrap gap-1">
                      {emp.assignedRoles.map((role) => (
                        <span 
                          key={role} 
                          className="px-2 py-0.5 bg-blue-50 text-blue-700 font-semibold rounded text-[10px] flex items-center gap-0.5"
                        >
                          <Shield className="w-3 h-3" />
                          {role}
                        </span>
                      ))}
                    </div>
                  </td>

                  {/* Weekly Off */}
                  <td className="px-6 py-4">
                    <span className="px-2 py-0.5 bg-orange-50 text-orange-700 font-semibold rounded text-[10px]">
                      {Array.isArray(emp.weeklyOff) ? emp.weeklyOff.join(', ') : (emp.weeklyOff || 'Sunday')}
                    </span>
                  </td>

                  {/* Status Badge */}
                  <td className="px-6 py-4">
                    <span className={`inline-flex px-2.5 py-1 rounded-full text-[10px] font-bold ${
                      emp.status === 'Active' ? 'bg-emerald-50 text-emerald-700' :
                      emp.status === 'Probation' ? 'bg-orange-50 text-orange-700' :
                      emp.status === 'Notice Period' ? 'bg-red-50 text-red-700' :
                      'bg-slate-100 text-slate-500'
                    }`}>
                      {emp.status}
                    </span>
                  </td>

                  {/* Actions Column */}
                  <td className="px-6 py-4 text-right space-x-1.5 whitespace-nowrap">
                    <button 
                      onClick={() => onSelectEmployee(emp.id)}
                      className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
                      title="View Profile"
                    >
                      <Eye className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}

              {filteredEmployees.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-slate-400">
                    No hospital staff records matching the specified filters.
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
