import React, { useState, useRef, useEffect } from 'react';
import { 
  User, Phone, Mail, Lock, KeyRound, Eye, EyeOff, Sparkles, 
  ShieldCheck, Shield, Stethoscope, Clock, Plus, Check, 
  AlertCircle, ChevronDown, ChevronUp, Calendar, Users, 
  Droplet, CreditCard, FileText, MapPin, HeartPulse, ArrowLeft, Loader2
} from 'lucide-react';
import api from '../../utils/api';

export const DOCTOR_SPECIALIZATIONS = [
  'General Medicine', 'Cardiology', 'Dermatology', 'Orthopedics', 'Pediatrics',
  'ENT', 'Ophthalmology', 'Neurology', 'Gynecology', 'Psychiatry',
  'Dentistry', 'Radiology', 'Pulmonology', 'Urology', 'Gastroenterology',
  'Nephrology', 'Oncology', 'Endocrinology', 'Rheumatology', 'General Surgery'
];

export const ALL_DEPARTMENTS = [
  'General Medicine', 'Cardiology', 'Outpatient Services', 'Pathology & Lab',
  'Pharmacy', 'Hospital Administration', 'Data Protection & Compliance',
  'Emergency Medicine', 'Pediatrics', 'Radiology', 'Critical Care / ICU',
  'Inpatient Nursing', 'Orthopedics', 'Dermatology'
];

export const WEEKDAYS = [
  { key: 'Monday', label: 'Mon' },
  { key: 'Tuesday', label: 'Tue' },
  { key: 'Wednesday', label: 'Wed' },
  { key: 'Thursday', label: 'Thu' },
  { key: 'Friday', label: 'Fri' },
  { key: 'Saturday', label: 'Sat' },
  { key: 'Sunday', label: 'Sun' }
];

export const DEFAULT_DOCTOR_SLOTS = [
  '09:00 AM - 09:30 AM', '09:30 AM - 10:00 AM', '10:00 AM - 10:30 AM',
  '10:30 AM - 11:00 AM', '11:00 AM - 11:30 AM', '11:30 AM - 12:00 PM',
  '12:00 PM - 12:30 PM', '12:30 PM - 01:00 PM', '02:00 PM - 02:30 PM',
  '02:30 PM - 03:00 PM', '03:00 PM - 03:30 PM', '03:30 PM - 04:00 PM',
  '04:00 PM - 04:30 PM', '04:30 PM - 05:00 PM', '05:00 PM - 05:30 PM'
];

// Helper to generate 15-minute standard time options from 06:00 AM to 10:00 PM
export const TIME_OPTIONS = (() => {
  const options = [];
  for (let hour = 6; hour <= 22; hour++) {
    for (let min = 0; min < 60; min += 15) {
      const period = hour >= 12 ? 'PM' : 'AM';
      const displayHour = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
      const formatted = `${String(displayHour).padStart(2, '0')}:${String(min).padStart(2, '0')} ${period}`;
      const totalMinutes = hour * 60 + min;
      options.push({ value: formatted, totalMinutes });
    }
  }
  return options;
})();

export default function StaffOnboardingPage({ 
  onCancel = () => {}, 
  onStaffCreated = () => {}, 
  showToast = () => {},
  availableRoles = [] 
}) {
  const formRef = useRef(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});

  // Password Visibility
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // Optional Section Toggle
  const [showOptionalDetails, setShowOptionalDetails] = useState(false);

  // Time Slot Picker Modal / Box State
  const [isSlotPickerOpen, setIsSlotPickerOpen] = useState(false);
  const [slotPickerStart, setSlotPickerStart] = useState('10:00 AM');
  const [slotPickerEnd, setSlotPickerEnd] = useState('10:30 AM');
  const [slotPickerError, setSlotPickerError] = useState('');

  // Default Roles Fallback
  const rolesList = availableRoles.length > 0 ? availableRoles : [
    { value: 'doctor', label: 'Doctor' },
    { value: 'receptionist', label: 'Receptionist' },
    { value: 'nurse', label: 'Nurse' },
    { value: 'lab', label: 'Laboratory' },
    { value: 'pharmacy', label: 'Pharmacy' },
    { value: 'hr', label: 'HR Manager' },
    { value: 'admin', label: 'System Admin' }
  ];

  // Core Form State
  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    staff_id: '',
    email: '',
    joiningDate: new Date().toISOString().split('T')[0],
    password: '',
    confirmPassword: '',
    role: rolesList[0]?.value || 'doctor',
    department: 'General Medicine',
    designation: 'Consultant Practitioner',
    employmentType: 'Full-Time',
    workLocation: 'Main Wing - Sunrise Clinic',
    shiftName: 'General Shift',
    specialty: 'General Medicine',
    consultationFee: 500,
    max_slots: 10,
    weeklyOff: ['Sunday'], // ALL ROLES support weekly off
    doctorSlots: [...DEFAULT_DOCTOR_SLOTS],
    // Optional Details
    ctcAnnual: '',
    dob: '',
    gender: '',
    bloodGroup: '',
    aadhaar: '',
    pan: '',
    address: '',
    emergencyContactName: '',
    emergencyContactRelation: '',
    emergencyContactPhone: ''
  });

  // Automatically adjust default department and designation when role changes
  const handleRoleChange = (newRole) => {
    let dept = 'Administration';
    let desig = newRole.charAt(0).toUpperCase() + newRole.slice(1);

    if (newRole === 'doctor') {
      dept = formData.specialty || 'General Medicine';
      desig = 'Consultant Practitioner';
    } else if (newRole === 'receptionist') {
      dept = 'Outpatient Services';
      desig = 'Front Desk Executive';
    } else if (newRole === 'nurse') {
      dept = 'Inpatient Nursing';
      desig = 'Staff Nurse';
    } else if (newRole === 'lab') {
      dept = 'Pathology & Lab';
      desig = 'Lab Technician';
    } else if (newRole === 'pharmacy') {
      dept = 'Pharmacy';
      desig = 'Pharmacist';
    } else if (newRole === 'hr') {
      dept = 'Hospital Administration';
      desig = 'HR Manager';
    } else if (newRole === 'admin') {
      dept = 'Hospital Administration';
      desig = 'System Administrator';
    }

    setFormData(prev => ({
      ...prev,
      role: newRole,
      department: dept,
      designation: desig
    }));
  };

  // Password Generator
  const generateSecurePassword = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%';
    let pass = '';
    for (let i = 0; i < 10; i++) {
      pass += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    // Ensure at least 1 digit, 1 upper, 1 lower, 1 special
    pass = pass + '9!A';
    setFormData(prev => ({ ...prev, password: pass, confirmPassword: pass }));
    setShowPassword(true);
    setShowConfirmPassword(true);
    setFieldErrors(prev => ({ ...prev, password: '', confirmPassword: '' }));
  };

  // Toggle Weekly Off Day (FOR ALL ROLES)
  const toggleWeeklyOffDay = (dayName) => {
    setFormData(prev => {
      let current = Array.isArray(prev.weeklyOff)
        ? [...prev.weeklyOff]
        : (prev.weeklyOff ? String(prev.weeklyOff).split(',').map(d => d.trim()) : []);

      if (current.includes(dayName)) {
        current = current.filter(d => d !== dayName);
      } else {
        current.push(dayName);
      }
      return { ...prev, weeklyOff: current };
    });
  };

  // Toggle Doctor OPD Slot
  const toggleDoctorSlot = (slot) => {
    setFormData(prev => {
      const current = prev.doctorSlots || [];
      if (current.includes(slot)) {
        return { ...prev, doctorSlots: current.filter(s => s !== slot) };
      } else {
        return { ...prev, doctorSlots: [...current, slot] };
      }
    });
  };

  // Select All / Clear All OPD Slots
  const handleSelectAllSlots = () => {
    const all = Array.from(new Set([...DEFAULT_DOCTOR_SLOTS, ...(formData.doctorSlots || [])]));
    setFormData(prev => ({ ...prev, doctorSlots: all }));
  };

  const handleClearAllSlots = () => {
    setFormData(prev => ({ ...prev, doctorSlots: [] }));
  };

  // Handle Add Slot via Time Picker
  const handleAddSlotFromPicker = () => {
    setSlotPickerError('');
    if (!slotPickerStart || !slotPickerEnd) {
      setSlotPickerError('Please select both Start Time and End Time.');
      return;
    }

    const startObj = TIME_OPTIONS.find(t => t.value === slotPickerStart);
    const endObj = TIME_OPTIONS.find(t => t.value === slotPickerEnd);

    if (startObj && endObj) {
      if (endObj.totalMinutes <= startObj.totalMinutes) {
        setSlotPickerError('End Time must be after Start Time.');
        return;
      }
    }

    const newSlotStr = `${slotPickerStart} - ${slotPickerEnd}`;
    const currentSlots = formData.doctorSlots || [];

    if (currentSlots.includes(newSlotStr)) {
      setSlotPickerError(`Slot '${newSlotStr}' is already in the list.`);
      return;
    }

    setFormData(prev => ({
      ...prev,
      doctorSlots: [...(prev.doctorSlots || []), newSlotStr]
    }));

    setIsSlotPickerOpen(false);
    setSlotPickerError('');
    showToast(`Added slot: ${newSlotStr}`, 'info');
  };

  // Keyboard navigation without accidental form submit on Enter
  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      if (e.target.tagName === 'TEXTAREA') return;
      if (e.target.tagName === 'BUTTON') return;

      e.preventDefault();
      const form = formRef.current;
      if (!form) return;

      const focusable = Array.from(
        form.querySelectorAll('input:not([disabled]):not([readonly]), select:not([disabled]), textarea:not([disabled])')
      ).filter(el => el.offsetParent !== null);

      const currentIndex = focusable.indexOf(e.target);
      if (currentIndex > -1 && currentIndex < focusable.length - 1) {
        const next = focusable[currentIndex + 1];
        next.focus();
        if (next.select && next.type !== 'date') {
          try { next.select(); } catch (_) {}
        }
      }
    }
  };

  // Form Validation & Submit
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (isSubmitting) return;

    setFormError('');
    const errors = {};

    // Validate Required Fields
    if (!formData.name.trim()) errors.name = 'Full legal name is required.';
    if (!formData.phone.trim()) {
      errors.phone = 'Phone number is required.';
    } else if (formData.phone.replace(/\D/g, '').length !== 10) {
      errors.phone = 'Phone number must be exactly 10 digits.';
    }

    // Validate Email only if provided (Optional)
    if (formData.email && formData.email.trim()) {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email.trim())) {
        errors.email = 'Enter a valid email address.';
      }
    }

    if (!formData.password) {
      errors.password = 'Login password is required.';
    } else if (formData.password.length < 6) {
      errors.password = 'Password must be at least 6 characters.';
    }

    if (!formData.confirmPassword) {
      errors.confirmPassword = 'Confirm password is required.';
    } else if (formData.password !== formData.confirmPassword) {
      errors.confirmPassword = 'Passwords do not match.';
    }

    if (!formData.role) errors.role = 'Role selection is required.';

    if (formData.role === 'doctor') {
      if (!formData.specialty) errors.specialty = 'Specialization is required for Doctor.';
      if (!formData.doctorSlots || formData.doctorSlots.length === 0) {
        errors.doctorSlots = 'Please select at least one attending OPD time slot.';
      }
    }

    if (Object.keys(errors).length > 0) {
      console.log('VALIDATION ERRORS IN SUBMIT:', JSON.stringify(errors));
      setFieldErrors(errors);
      setFormError('Please resolve the highlighted errors before submitting.');
      // Scroll to first error
      const firstKey = Object.keys(errors)[0];
      const el = document.querySelector(`[name="${firstKey}"]`);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }

    setFieldErrors({});

    // Construct backend payload
    const payload = {
      name: formData.name.trim(),
      phone: formData.phone.trim(),
      staff_id: formData.phone.trim(),
      email: formData.email ? formData.email.trim().toLowerCase() : '',
      joiningDate: formData.joiningDate || new Date().toISOString().split('T')[0],
      password: formData.password,
      role: formData.role,
      department: formData.department || (formData.role === 'doctor' ? (formData.specialty || 'General Medicine') : 'Administration'),
      designation: formData.designation || (formData.role.charAt(0).toUpperCase() + formData.role.slice(1)),
      employmentType: formData.employmentType || 'Full-Time',
      workLocation: formData.workLocation || 'Main Wing',
      shiftName: formData.shiftName,
      // Weekly Off (Persisted for ALL ROLES)
      weeklyOff: Array.isArray(formData.weeklyOff) && formData.weeklyOff.length > 0
        ? formData.weeklyOff
        : ['Sunday'],
      // Doctor Specific Fields
      specialty: formData.role === 'doctor' ? formData.specialty : undefined,
      consultationFee: formData.role === 'doctor' ? Number(formData.consultationFee) || 500 : undefined,
      max_slots: formData.role === 'doctor' ? Number(formData.max_slots) || 10 : undefined,
      doctorSlots: formData.role === 'doctor' ? formData.doctorSlots : [],
      // Optional Demographics
      ctcAnnual: formData.ctcAnnual !== '' ? Number(formData.ctcAnnual) : undefined,
      dob: formData.dob || undefined,
      gender: formData.gender || undefined,
      bloodGroup: formData.bloodGroup || undefined,
      aadhaar: formData.aadhaar || undefined,
      pan: formData.pan ? formData.pan.toUpperCase() : undefined,
      address: formData.address || undefined,
      emergencyContact: (formData.emergencyContactName || formData.emergencyContactPhone) ? {
        name: formData.emergencyContactName,
        relation: formData.emergencyContactRelation,
        phone: formData.emergencyContactPhone
      } : undefined
    };

    try {
      setIsSubmitting(true);
      const res = await api.post('/admin/users', payload);
      const createdUser = res.data;

      // Requirement 21: Show Success Toast
      showToast('✓ Employee added successfully.', 'success');

      // Return to employee list and ensure visibility
      onStaffCreated(createdUser);
    } catch (err) {
      console.error('Employee creation error:', err);
      const msg = err.response?.data?.error || err.message || 'Unable to add employee. Please try again.';
      setFormError(msg);
      showToast(msg, 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 py-6 px-4 sm:px-6 lg:px-8 text-slate-800">
      <div className="max-w-6xl mx-auto pb-20">
        
        {/* ── TOP HEADER / BREADCRUMB ── */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-5">
          <div>
            <button
              type="button"
              onClick={onCancel}
              className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-600 hover:text-slate-900 bg-white border border-slate-300 hover:border-slate-400 px-3 py-1.5 rounded-lg shadow-2xs transition-colors cursor-pointer mb-2"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Back to Employees</span>
            </button>
            <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
              Add New Employee
            </h1>
            <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
              Create login credentials, assign role and configure employee access.
            </p>
          </div>

          <div className="flex items-center gap-2 self-start sm:self-auto">
            <span className="text-xs font-semibold text-slate-600 bg-slate-200/80 px-2.5 py-1 rounded-md flex items-center gap-1">
              <span className="text-rose-500 font-black text-base leading-none select-none">*</span> Required fields
            </span>
          </div>
        </div>

        {/* Global Error Banner */}
        {formError && (
          <div className="mb-4 p-3.5 bg-rose-50 border border-rose-200 rounded-xl text-xs sm:text-sm text-rose-700 font-semibold flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-rose-500 shrink-0" />
            <span className="flex-1">{formError}</span>
          </div>
        )}

        <form 
          ref={formRef} 
          onSubmit={handleSubmit} 
          onKeyDown={handleKeyDown} 
          autoComplete="off"
          className="space-y-4"
        >

          {/* ══════════════════════════════════════════════════════════════════
              SECTION 1: ACCOUNT & SECURITY
             ══════════════════════════════════════════════════════════════════ */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
            <div className="px-5 py-2.5 bg-slate-50/70 border-b border-slate-200 flex items-center justify-between">
              <div>
                <h2 className="text-xs sm:text-[13px] font-black uppercase tracking-wider text-slate-800 m-0">
                  1. Account & Security
                </h2>
                <p className="text-xs text-slate-500 m-0 mt-0.5">
                  Core login credentials and employee identity
                </p>
              </div>
            </div>

            <div className="p-4 sm:p-5 grid grid-cols-1 md:grid-cols-6 gap-3.5">
              
              {/* Full Legal Name */}
              <div className="md:col-span-2">
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Full Legal Name <span className="text-rose-500 font-black text-sm ml-0.5 select-none leading-none">*</span>
                </label>
                <div className="relative flex items-center">
                  <User className="w-4 h-4 text-slate-400 absolute left-3 pointer-events-none" />
                  <input
                    type="text"
                    name="name"
                    placeholder="e.g. Dr. Rajesh Sharma"
                    value={formData.name}
                    onChange={e => {
                      setFormData({ ...formData, name: e.target.value });
                      if (fieldErrors.name) setFieldErrors(prev => ({ ...prev, name: '' }));
                    }}
                    className={`w-full h-9.5 pl-9 pr-3.5 bg-white border ${
                      fieldErrors.name ? 'border-rose-400 bg-rose-50/30' : 'border-slate-300 focus:border-blue-600'
                    } rounded-lg text-xs sm:text-sm font-semibold text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all`}
                  />
                </div>
                {fieldErrors.name && (
                  <p className="text-xs text-rose-600 font-medium mt-1">{fieldErrors.name}</p>
                )}
              </div>

              {/* Phone Number */}
              <div className="md:col-span-2">
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Phone Number <span className="text-rose-500 font-black text-sm ml-0.5 select-none leading-none">*</span>
                </label>
                <div className="relative flex items-center">
                  <Phone className="w-4 h-4 text-slate-400 absolute left-3 pointer-events-none" />
                  <input
                    type="tel"
                    name="phone"
                    maxLength="10"
                    placeholder="10-digit mobile number"
                    value={formData.phone}
                    onChange={e => {
                      const digits = e.target.value.replace(/\D/g, '');
                      setFormData({ 
                        ...formData, 
                        phone: digits,
                        staff_id: digits 
                      });
                      if (fieldErrors.phone) setFieldErrors(prev => ({ ...prev, phone: '' }));
                    }}
                    className={`w-full h-9.5 pl-9 pr-3.5 bg-white border ${
                      fieldErrors.phone ? 'border-rose-400 bg-rose-50/30' : 'border-slate-300 focus:border-blue-600'
                    } rounded-lg text-xs sm:text-sm font-semibold text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all`}
                  />
                </div>
                {fieldErrors.phone && (
                  <p className="text-xs text-rose-600 font-medium mt-1">{fieldErrors.phone}</p>
                )}
              </div>

              {/* System Login ID / Employee ID (Auto-populated from phone) */}
              <div className="md:col-span-2">
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  System Login ID / Employee ID
                </label>
                <div className="relative flex items-center">
                  <ShieldCheck className="w-4 h-4 text-emerald-600 absolute left-3 pointer-events-none" />
                  <input
                    type="text"
                    name="staff_id"
                    readOnly
                    value={formData.phone || 'Auto-populated from Phone Number'}
                    className="w-full h-9.5 pl-9 pr-24 bg-slate-100/80 border border-slate-200 rounded-lg text-xs sm:text-sm font-bold text-slate-600 cursor-not-allowed select-none font-mono"
                  />
                  {formData.phone.length === 10 && (
                    <span className="absolute right-3 text-xs font-bold text-emerald-600 flex items-center gap-1">
                      <Check className="w-3.5 h-3.5 stroke-[3]" /> Valid ID
                    </span>
                  )}
                </div>
              </div>

              {/* Login Password */}
              <div className="md:col-span-3">
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-bold text-slate-700">
                    Login Password <span className="text-rose-500 font-black text-sm ml-0.5 select-none leading-none">*</span>
                  </label>
                  <button
                    type="button"
                    onClick={generateSecurePassword}
                    className="text-xs font-bold text-blue-700 hover:text-blue-800 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded px-2 py-0.5 flex items-center gap-1 transition-colors cursor-pointer"
                  >
                    <Sparkles className="w-3 h-3" />
                    <span>Generate</span>
                  </button>
                </div>
                <div className="relative flex items-center">
                  <Lock className="w-4 h-4 text-slate-400 absolute left-3 pointer-events-none" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    name="password"
                    placeholder="Enter password"
                    value={formData.password}
                    style={{
                      letterSpacing: (!showPassword && formData.password) ? '0.24em' : 'normal',
                      fontSize: (!showPassword && formData.password) ? '18px' : '13px'
                    }}
                    onChange={e => {
                      setFormData({ ...formData, password: e.target.value });
                      if (fieldErrors.password) setFieldErrors(prev => ({ ...prev, password: '' }));
                    }}
                    className={`w-full h-9.5 pl-9 pr-10 bg-white border placeholder:tracking-normal placeholder:font-normal placeholder:text-xs ${
                      fieldErrors.password ? 'border-rose-400 bg-rose-50/30' : 'border-slate-300 focus:border-blue-600'
                    } rounded-lg font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-2.5 p-1 text-slate-400 hover:text-slate-600 cursor-pointer"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {fieldErrors.password && (
                  <p className="text-xs text-rose-600 font-medium mt-1">{fieldErrors.password}</p>
                )}
              </div>

              {/* Confirm Password */}
              <div className="md:col-span-3">
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-bold text-slate-700">
                    Confirm Password <span className="text-rose-500 font-black text-sm ml-0.5 select-none leading-none">*</span>
                  </label>
                  {formData.confirmPassword && (
                    <span className={`text-[11px] font-bold ${
                      formData.password === formData.confirmPassword ? 'text-emerald-600' : 'text-rose-600'
                    }`}>
                      {formData.password === formData.confirmPassword ? '✓ Matched' : 'Mismatch'}
                    </span>
                  )}
                </div>
                <div className="relative flex items-center">
                  <KeyRound className="w-4 h-4 text-slate-400 absolute left-3 pointer-events-none" />
                  <input
                    type={showConfirmPassword ? 'text' : 'password'}
                    name="confirmPassword"
                    placeholder="Re-enter password"
                    value={formData.confirmPassword}
                    style={{
                      letterSpacing: (!showConfirmPassword && formData.confirmPassword) ? '0.24em' : 'normal',
                      fontSize: (!showConfirmPassword && formData.confirmPassword) ? '18px' : '13px'
                    }}
                    onChange={e => {
                      setFormData({ ...formData, confirmPassword: e.target.value });
                      if (fieldErrors.confirmPassword) setFieldErrors(prev => ({ ...prev, confirmPassword: '' }));
                    }}
                    className={`w-full h-9.5 pl-9 pr-10 bg-white border placeholder:tracking-normal placeholder:font-normal placeholder:text-xs ${
                      fieldErrors.confirmPassword ? 'border-rose-400 bg-rose-50/30' : 'border-slate-300 focus:border-blue-600'
                    } rounded-lg font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="absolute right-2.5 p-1 text-slate-400 hover:text-slate-600 cursor-pointer"
                  >
                    {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {fieldErrors.confirmPassword && (
                  <p className="text-xs text-rose-600 font-medium mt-1">{fieldErrors.confirmPassword}</p>
                )}
              </div>

            </div>
          </div>

          {/* ══════════════════════════════════════════════════════════════════
              SECTION 2: ROLE & ACCESS ASSIGNMENT
             ══════════════════════════════════════════════════════════════════ */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
            <div className="px-5 py-2.5 bg-slate-50/70 border-b border-slate-200">
              <h2 className="text-xs sm:text-[13px] font-black uppercase tracking-wider text-slate-800 m-0">
                2. Role & Access
              </h2>
              <p className="text-xs text-slate-500 m-0 mt-0.5">
                Role assignment, work email and employment terms
              </p>
            </div>

            <div className="p-4 sm:p-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
              
              {/* Access Role - NO overlapping left icon */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Access Role <span className="text-rose-500 font-black text-sm ml-0.5 select-none leading-none">*</span>
                </label>
                <div className="relative flex items-center">
                  <select
                    name="role"
                    value={formData.role}
                    onChange={e => handleRoleChange(e.target.value)}
                    className="w-full h-9.5 px-3.5 pr-8 bg-white border border-slate-300 focus:border-blue-600 rounded-lg text-xs sm:text-sm font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all appearance-none cursor-pointer"
                  >
                    {rolesList.map(r => (
                      <option key={r.value} value={r.value}>{r.label}</option>
                    ))}
                  </select>
                  <ChevronDown className="w-4 h-4 text-slate-400 absolute right-3 pointer-events-none" />
                </div>
              </div>

              {/* Hospital / Work Email (Optional) */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Work Email <span className="text-slate-400 font-normal text-xs ml-1">(Optional)</span>
                </label>
                <div className="relative flex items-center">
                  <Mail className="w-4 h-4 text-slate-400 absolute left-3 pointer-events-none" />
                  <input
                    type="email"
                    name="email"
                    placeholder="employee.name@hospital.com"
                    value={formData.email}
                    onChange={e => {
                      setFormData({ ...formData, email: e.target.value });
                      if (fieldErrors.email) setFieldErrors(prev => ({ ...prev, email: '' }));
                    }}
                    className={`w-full h-9.5 pl-9 pr-3.5 bg-white border ${
                      fieldErrors.email ? 'border-rose-400 bg-rose-50/30' : 'border-slate-300 focus:border-blue-600'
                    } rounded-lg text-xs sm:text-sm font-semibold text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all`}
                  />
                </div>
                {fieldErrors.email && (
                  <p className="text-xs text-rose-600 font-medium mt-1">{fieldErrors.email}</p>
                )}
              </div>

              {/* Employment Type */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Employment Type
                </label>
                <div className="relative flex items-center">
                  <select
                    name="employmentType"
                    value={formData.employmentType}
                    onChange={e => setFormData({ ...formData, employmentType: e.target.value })}
                    className="w-full h-9.5 px-3.5 pr-8 bg-white border border-slate-300 focus:border-blue-600 rounded-lg text-xs sm:text-sm font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all appearance-none cursor-pointer"
                  >
                    <option value="Full-Time">Full-Time</option>
                    <option value="Part-Time">Part-Time</option>
                    <option value="Contract">Contract</option>
                    <option value="Visiting">Visiting Consultant</option>
                  </select>
                  <ChevronDown className="w-4 h-4 text-slate-400 absolute right-3 pointer-events-none" />
                </div>
              </div>

              {/* Joining Date */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Joining Date
                </label>
                <div className="relative flex items-center">
                  <Calendar className="w-4 h-4 text-slate-400 absolute left-3 pointer-events-none" />
                  <input
                    type="date"
                    name="joiningDate"
                    value={formData.joiningDate}
                    onChange={e => setFormData({ ...formData, joiningDate: e.target.value })}
                    className="w-full h-9.5 pl-9 pr-3 bg-white border border-slate-300 focus:border-blue-600 rounded-lg text-xs sm:text-sm font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all cursor-pointer"
                  />
                </div>
              </div>

            </div>
          </div>

          {/* ══════════════════════════════════════════════════════════════════
              SECTION 3: PROFESSIONAL / ROLE CONFIGURATION (Doctor Only)
             ══════════════════════════════════════════════════════════════════ */}
          {formData.role === 'doctor' && (
            <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
              <div className="px-5 py-2.5 bg-slate-50/70 border-b border-slate-200">
                <h2 className="text-xs sm:text-[13px] font-black uppercase tracking-wider text-slate-800 m-0">
                  3. Professional Configuration
                </h2>
                <p className="text-xs text-slate-500 m-0 mt-0.5">
                  Clinical specialization and patient consultation fees
                </p>
              </div>

              <div className="p-4 sm:p-5 grid grid-cols-1 md:grid-cols-2 gap-3.5">
                
                {/* Specialization - NO overlapping left icon */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Medical Specialization <span className="text-rose-500 font-black text-sm ml-0.5 select-none leading-none">*</span>
                  </label>
                  <div className="relative flex items-center">
                    <select
                      name="specialty"
                      value={formData.specialty}
                      onChange={e => {
                        setFormData({ 
                          ...formData, 
                          specialty: e.target.value,
                          department: e.target.value 
                        });
                        if (fieldErrors.specialty) setFieldErrors(prev => ({ ...prev, specialty: '' }));
                      }}
                      className={`w-full h-9.5 px-3.5 pr-8 bg-white border ${
                        fieldErrors.specialty ? 'border-rose-400 bg-rose-50/30' : 'border-slate-300 focus:border-blue-600'
                      } rounded-lg text-xs sm:text-sm font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all appearance-none cursor-pointer`}
                    >
                      <option value="">-- Select Specialization --</option>
                      {DOCTOR_SPECIALIZATIONS.map(spec => (
                        <option key={spec} value={spec}>{spec}</option>
                      ))}
                    </select>
                    <ChevronDown className="w-4 h-4 text-slate-400 absolute right-3 pointer-events-none" />
                  </div>
                  {fieldErrors.specialty && (
                    <p className="text-xs text-rose-600 font-medium mt-1">{fieldErrors.specialty}</p>
                  )}
                </div>

                {/* Consultation Fee */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Consultation Fee <span className="text-slate-500 font-normal">(₹ INR)</span>
                  </label>
                  <div className="relative flex items-center">
                    <span className="absolute left-3 text-sm font-bold text-slate-400">₹</span>
                    <input
                      type="number"
                      min="0"
                      name="consultationFee"
                      placeholder="e.g. 500"
                      value={formData.consultationFee}
                      onChange={e => setFormData({ ...formData, consultationFee: e.target.value })}
                      className="w-full h-9.5 pl-8 pr-3.5 bg-white border border-slate-300 focus:border-blue-600 rounded-lg text-xs sm:text-sm font-semibold text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all"
                    />
                  </div>
                </div>

              </div>
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════════════
              SECTION 4: SCHEDULE & AVAILABILITY (WEEKLY OFF FOR ALL ROLES)
             ══════════════════════════════════════════════════════════════════ */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
            <div className="px-5 py-2.5 bg-slate-50/70 border-b border-slate-200">
              <h2 className="text-xs sm:text-[13px] font-black uppercase tracking-wider text-slate-800 m-0">
                {formData.role === 'doctor' ? '4. Schedule & Availability' : '3. Schedule & Availability'}
              </h2>
              <p className="text-xs text-slate-500 m-0 mt-0.5">
                Working days and regular attendance schedule
              </p>
            </div>

            <div className="p-4 sm:p-5 space-y-4">
              
              {/* Weekly Off Selection — Available for EVERY staff role */}
              <div>
                <div className="mb-2">
                  <label className="block text-xs font-bold text-slate-800">
                    Weekly Off Days
                  </label>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Select the day(s) this employee is not scheduled to attend duty.
                  </p>
                </div>

                <div className="flex flex-wrap gap-2 pt-0.5">
                  {WEEKDAYS.map(day => {
                    const isOff = Array.isArray(formData.weeklyOff)
                      ? formData.weeklyOff.includes(day.key)
                      : (formData.weeklyOff ? String(formData.weeklyOff).split(',').map(d => d.trim()).includes(day.key) : false);

                    return (
                      <button
                        key={day.key}
                        type="button"
                        onClick={() => toggleWeeklyOffDay(day.key)}
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border transition-all cursor-pointer select-none active:scale-95 ${
                          isOff
                            ? 'bg-slate-900 border-slate-900 text-white shadow-2xs'
                            : 'bg-white border-slate-300 text-slate-700 hover:border-slate-400 hover:bg-slate-50'
                        }`}
                        title={isOff ? `${day.key} is marked as OFF` : `${day.key} is Working`}
                      >
                        {isOff ? <Check className="w-3.5 h-3.5 text-white stroke-[3]" /> : null}
                        <span>{day.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Doctor OPD Slots (Only when role is doctor) */}
              {formData.role === 'doctor' && (
                <div className="pt-3.5 border-t border-slate-100">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-2.5">
                    <div>
                      <label className="block text-xs font-bold text-slate-800">
                        Attending OPD Slots <span className="text-rose-500 font-black text-sm ml-0.5 select-none leading-none">*</span>
                      </label>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Patient appointment slots available for booking ({(formData.doctorSlots || []).length} active)
                      </p>
                    </div>

                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={handleSelectAllSlots}
                        className="text-xs font-bold text-blue-700 hover:underline cursor-pointer"
                      >
                        Select All
                      </button>
                      <span className="text-slate-300">|</span>
                      <button
                        type="button"
                        onClick={handleClearAllSlots}
                        className="text-xs font-bold text-slate-500 hover:text-rose-600 hover:underline cursor-pointer"
                      >
                        Clear All
                      </button>
                      <span className="text-slate-300">|</span>
                      <button
                        type="button"
                        onClick={() => setIsSlotPickerOpen(!isSlotPickerOpen)}
                        className="inline-flex items-center gap-1 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 px-2.5 py-1 rounded-md shadow-2xs transition-colors cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Add Slot</span>
                      </button>
                    </div>
                  </div>

                  {fieldErrors.doctorSlots && (
                    <p className="text-xs text-rose-600 font-medium mb-2.5">{fieldErrors.doctorSlots}</p>
                  )}

                  {/* ── TIME SLOT PICKER (Requirement 11-14: No manual text typing!) ── */}
                  {isSlotPickerOpen && (
                    <div className="p-3.5 mb-3 bg-slate-50 border border-slate-300 rounded-xl space-y-2.5">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                          <Clock className="w-3.5 h-3.5 text-blue-600" />
                          <span>Select Time Range for New Slot</span>
                        </span>
                        <button
                          type="button"
                          onClick={() => { setIsSlotPickerOpen(false); setSlotPickerError(''); }}
                          className="text-xs text-slate-400 hover:text-slate-600 font-bold cursor-pointer"
                        >
                          ✕
                        </button>
                      </div>

                      {slotPickerError && (
                        <div className="p-2 bg-rose-50 border border-rose-200 rounded text-xs text-rose-600 font-medium">
                          {slotPickerError}
                        </div>
                      )}

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-center">
                        {/* Start Time */}
                        <div>
                          <label className="block text-[11px] font-bold text-slate-600 mb-1">
                            Start Time
                          </label>
                          <select
                            value={slotPickerStart}
                            onChange={e => {
                              const s = e.target.value;
                              setSlotPickerStart(s);
                              // Auto calculate +30 mins for end time if possible
                              const startObj = TIME_OPTIONS.find(t => t.value === s);
                              if (startObj) {
                                const next30Obj = TIME_OPTIONS.find(t => t.totalMinutes === startObj.totalMinutes + 30);
                                if (next30Obj) setSlotPickerEnd(next30Obj.value);
                              }
                            }}
                            className="w-full h-9 px-3 bg-white border border-slate-300 rounded-lg text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 cursor-pointer"
                          >
                            {TIME_OPTIONS.map(opt => (
                              <option key={opt.value} value={opt.value}>{opt.value}</option>
                            ))}
                          </select>
                        </div>

                        {/* End Time */}
                        <div>
                          <label className="block text-[11px] font-bold text-slate-600 mb-1">
                            End Time
                          </label>
                          <select
                            value={slotPickerEnd}
                            onChange={e => setSlotPickerEnd(e.target.value)}
                            className="w-full h-9 px-3 bg-white border border-slate-300 rounded-lg text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 cursor-pointer"
                          >
                            {TIME_OPTIONS.map(opt => (
                              <option key={opt.value} value={opt.value}>{opt.value}</option>
                            ))}
                          </select>
                        </div>
                      </div>

                      {/* Quick Presets & Add Button */}
                      <div className="flex items-center justify-between pt-1">
                        <div className="flex items-center gap-1.5 text-[11px] text-slate-500">
                          <span>Preset:</span>
                          {[15, 30, 45, 60].map(mins => (
                            <button
                              key={mins}
                              type="button"
                              onClick={() => {
                                const startObj = TIME_OPTIONS.find(t => t.value === slotPickerStart);
                                if (startObj) {
                                  const targetObj = TIME_OPTIONS.find(t => t.totalMinutes === startObj.totalMinutes + mins);
                                  if (targetObj) setSlotPickerEnd(targetObj.value);
                                }
                              }}
                              className="px-2 py-0.5 bg-white border border-slate-200 rounded text-slate-600 hover:bg-slate-100 font-semibold cursor-pointer"
                            >
                              +{mins}m
                            </button>
                          ))}
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => { setIsSlotPickerOpen(false); setSlotPickerError(''); }}
                            className="px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 text-xs font-bold cursor-pointer"
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            onClick={handleAddSlotFromPicker}
                            className="px-3.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-2xs cursor-pointer"
                          >
                            Add Slot
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Compact Selectable Chips Stack */}
                  <div className="flex flex-wrap gap-2 p-3 bg-slate-50 border border-slate-200 rounded-xl max-h-[160px] overflow-y-auto">
                    {Array.from(new Set([
                      ...DEFAULT_DOCTOR_SLOTS,
                      ...(formData.doctorSlots || [])
                    ])).map(slot => {
                      const isSelected = (formData.doctorSlots || []).includes(slot);
                      return (
                        <button
                          key={slot}
                          type="button"
                          onClick={() => toggleDoctorSlot(slot)}
                          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer select-none active:scale-95 ${
                            isSelected
                              ? 'bg-blue-600 text-white shadow-2xs border border-blue-600'
                              : 'bg-white hover:bg-slate-100 text-slate-700 border border-slate-300'
                          }`}
                          title={isSelected ? 'Click to deselect slot' : 'Click to select slot'}
                        >
                          {isSelected ? (
                            <Check className="w-3 h-3 text-white stroke-[3]" />
                          ) : (
                            <span className="w-1.5 h-1.5 rounded-full bg-slate-300" />
                          )}
                          <span>{slot}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

            </div>
          </div>

          {/* ══════════════════════════════════════════════════════════════════
              SECTION 5: PERSONAL, STATUTORY & EMERGENCY (OPTIONAL)
             ══════════════════════════════════════════════════════════════════ */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
            <button
              type="button"
              onClick={() => setShowOptionalDetails(!showOptionalDetails)}
              className="w-full px-5 py-2.5 bg-slate-50/70 hover:bg-slate-100/70 flex items-center justify-between transition-colors border-b border-slate-200 text-left cursor-pointer"
            >
              <div>
                <h2 className="text-xs sm:text-[13px] font-black uppercase tracking-wider text-slate-800 m-0">
                  {formData.role === 'doctor' ? '5. Personal & Statutory Details' : '4. Personal & Statutory Details'}
                </h2>
                <p className="text-xs text-slate-500 m-0 mt-0.5">
                  Demographics, Aadhaar/PAN, Address & Emergency Contact
                </p>
              </div>

              <div className="flex items-center gap-2">
                {showOptionalDetails ? (
                  <ChevronUp className="w-4 h-4 text-slate-500" />
                ) : (
                  <ChevronDown className="w-4 h-4 text-slate-500" />
                )}
              </div>
            </button>

            {showOptionalDetails && (
              <div className="p-4 sm:p-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
                
                {/* Annual CTC */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Annual CTC <span className="text-slate-500 font-normal">(₹ INR)</span>
                  </label>
                  <input
                    type="number"
                    min="0"
                    placeholder="e.g. 600000"
                    value={formData.ctcAnnual}
                    onChange={e => setFormData({ ...formData, ctcAnnual: e.target.value })}
                    className="w-full h-9.5 px-3 bg-white border border-slate-300 focus:border-blue-600 rounded-lg text-xs sm:text-sm font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                  />
                </div>

                {/* Date of Birth */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Date of Birth
                  </label>
                  <input
                    type="date"
                    value={formData.dob}
                    onChange={e => setFormData({ ...formData, dob: e.target.value })}
                    className="w-full h-9.5 px-3 bg-white border border-slate-300 focus:border-blue-600 rounded-lg text-xs sm:text-sm font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                  />
                </div>

                {/* Gender */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Gender
                  </label>
                  <select
                    value={formData.gender}
                    onChange={e => setFormData({ ...formData, gender: e.target.value })}
                    className="w-full h-9.5 px-3 bg-white border border-slate-300 focus:border-blue-600 rounded-lg text-xs sm:text-sm font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 cursor-pointer"
                  >
                    <option value="">-- Select Gender --</option>
                    <option value="Male">Male</option>
                    <option value="Female">Female</option>
                    <option value="Other">Other</option>
                  </select>
                </div>

                {/* Blood Group */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Blood Group
                  </label>
                  <select
                    value={formData.bloodGroup}
                    onChange={e => setFormData({ ...formData, bloodGroup: e.target.value })}
                    className="w-full h-9.5 px-3 bg-white border border-slate-300 focus:border-blue-600 rounded-lg text-xs sm:text-sm font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 cursor-pointer"
                  >
                    <option value="">-- Select Blood Group --</option>
                    {['A+', 'A-', 'B+', 'B-', 'O+', 'O-', 'AB+', 'AB-'].map(bg => (
                      <option key={bg} value={bg}>{bg}</option>
                    ))}
                  </select>
                </div>

                {/* Aadhaar Number */}
                <div className="lg:col-span-2">
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Aadhaar Card <span className="text-slate-500 font-normal">(12 Digits)</span>
                  </label>
                  <input
                    type="text"
                    maxLength="12"
                    placeholder="XXXX XXXX XXXX"
                    value={formData.aadhaar}
                    onChange={e => setFormData({ ...formData, aadhaar: e.target.value.replace(/\D/g, '') })}
                    className="w-full h-9.5 px-3 bg-white border border-slate-300 focus:border-blue-600 rounded-lg text-xs sm:text-sm font-semibold text-slate-900 font-mono focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                  />
                </div>

                {/* PAN Number */}
                <div className="lg:col-span-2">
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    PAN Card <span className="text-slate-500 font-normal">(10 Chars)</span>
                  </label>
                  <input
                    type="text"
                    maxLength="10"
                    placeholder="ABCDE1234F"
                    value={formData.pan}
                    onChange={e => setFormData({ ...formData, pan: e.target.value.toUpperCase() })}
                    className="w-full h-9.5 px-3 bg-white border border-slate-300 focus:border-blue-600 rounded-lg text-xs sm:text-sm font-semibold text-slate-900 uppercase font-mono focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                  />
                </div>

                {/* Residential Address */}
                <div className="lg:col-span-4">
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Residential Address
                  </label>
                  <textarea
                    rows="2"
                    placeholder="Street address, city, state, postal pin code..."
                    value={formData.address}
                    onChange={e => setFormData({ ...formData, address: e.target.value })}
                    className="w-full p-2.5 bg-white border border-slate-300 focus:border-blue-600 rounded-lg text-xs sm:text-sm font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                  />
                </div>

                {/* Emergency Contact Name */}
                <div className="lg:col-span-2">
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Emergency Contact Name
                  </label>
                  <input
                    type="text"
                    placeholder="Next of Kin / Contact Name"
                    value={formData.emergencyContactName}
                    onChange={e => setFormData({ ...formData, emergencyContactName: e.target.value })}
                    className="w-full h-9.5 px-3 bg-white border border-slate-300 focus:border-blue-600 rounded-lg text-xs sm:text-sm font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                  />
                </div>

                {/* Emergency Contact Relation */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Relationship
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Spouse / Parent"
                    value={formData.emergencyContactRelation}
                    onChange={e => setFormData({ ...formData, emergencyContactRelation: e.target.value })}
                    className="w-full h-9.5 px-3 bg-white border border-slate-300 focus:border-blue-600 rounded-lg text-xs sm:text-sm font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                  />
                </div>

                {/* Emergency Contact Phone */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Emergency Contact Phone
                  </label>
                  <input
                    type="tel"
                    maxLength="10"
                    placeholder="10-digit emergency phone"
                    value={formData.emergencyContactPhone}
                    onChange={e => setFormData({ ...formData, emergencyContactPhone: e.target.value.replace(/\D/g, '') })}
                    className="w-full h-9.5 px-3 bg-white border border-slate-300 focus:border-blue-600 rounded-lg text-xs sm:text-sm font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                  />
                </div>

              </div>
            )}
          </div>

          {/* ══════════════════════════════════════════════════════════════════
              STICKY BOTTOM ACTION BAR (Clean buttons only - no helper row)
             ══════════════════════════════════════════════════════════════════ */}
          <div className="fixed bottom-0 left-0 right-0 z-[999] bg-white/95 backdrop-blur-md border-t border-slate-200 px-4 sm:px-8 py-3 shadow-lg">
            <div className="max-w-6xl mx-auto flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={onCancel}
                disabled={isSubmitting}
                className="px-5 py-2 rounded-lg border border-slate-300 hover:border-slate-400 bg-white hover:bg-slate-50 text-slate-700 text-xs sm:text-sm font-bold transition-all cursor-pointer"
              >
                Cancel
              </button>
              <button
                id="onboard-employee-submit-btn"
                type="submit"
                onClick={handleSubmit}
                disabled={isSubmitting}
                className="px-6 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white text-xs sm:text-sm font-bold shadow-sm transition-all cursor-pointer flex items-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Adding Employee...</span>
                  </>
                ) : (
                  <span>Add Employee</span>
                )}
              </button>
            </div>
          </div>

        </form>

      </div>
    </div>
  );
}
