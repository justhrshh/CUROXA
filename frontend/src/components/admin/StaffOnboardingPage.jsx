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
  'Pharmacy', 'Clinic Administration', 'Data Protection & Compliance',
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
  availableRoles = [],
  onSubmit = null,
  hospitalName = null,
  backLabel = null
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
    title: rolesList[0]?.value === 'doctor' ? 'Dr.' : 'Mr.',
    name: '',
    phone: '',
    staff_id: '',
    employeeId: '',
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
      dept = 'Clinic Administration';
      desig = 'HR Manager';
    } else if (newRole === 'admin') {
      dept = 'Clinic Administration';
      desig = 'System Administrator';
    }

    let newTitle = formData.title;
    if (newRole === 'doctor' && (newTitle === 'Mr.' || !newTitle)) {
      newTitle = 'Dr.';
    } else if (newRole !== 'doctor' && newTitle === 'Dr.') {
      newTitle = 'Mr.';
    }

    setFormData(prev => ({
      ...prev,
      role: newRole,
      title: newTitle,
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
    if (!formData.title || !formData.title.trim()) errors.title = 'Title is required.';
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
      title: formData.title || 'Mr.',
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
      emergencyContact: (formData.emergencyContactName || formData.emergencyContactPhone || formData.emergencyContactRelation) ? {
        name: formData.emergencyContactName,
        relation: formData.emergencyContactRelation,
        phone: formData.emergencyContactPhone
      } : undefined
    };

    try {
      setIsSubmitting(true);
      let createdUser;
      if (onSubmit) {
        createdUser = await onSubmit(payload);
      } else {
        const res = await api.post('/admin/users', payload);
        createdUser = res.data;
      }

      // Requirement 21: Show Success Toast
      showToast('✓ Employee added successfully.', 'success');

      // Return to employee list and ensure visibility
      onStaffCreated(createdUser || payload);
    } catch (err) {
      console.error('Employee creation error:', err);
      const msg = err.response?.data?.error || err.message || 'Unable to add employee. Please try again.';
      setFormError(msg);
      showToast(msg, 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const tableInp = {
    height: '26px',
    borderRadius: '3px',
    border: '1px solid #CBD5E1',
    background: '#FFFFFF',
    fontSize: '11.5px',
    fontWeight: 500,
    color: '#0F172A',
    width: '100%',
    padding: '0 8px',
    outline: 'none',
    boxSizing: 'border-box'
  };

  const fieldRow = {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    height: '26px'
  };

  const labelStyle = {
    width: '125px',
    textAlign: 'left',
    fontSize: '11px',
    fontWeight: 650,
    color: '#334155',
    flexShrink: 0
  };

  const colonStyle = {
    width: '6px',
    textAlign: 'center',
    fontSize: '11px',
    fontWeight: 700,
    color: '#64748B',
    flexShrink: 0
  };

  const sectionHeaderStyle = {
    gridColumn: '1 / -1',
    background: '#F1F5F9',
    borderTop: '1px solid #CBD5E1',
    borderBottom: '1px solid #CBD5E1',
    padding: '4px 10px',
    fontSize: '11px',
    fontWeight: 800,
    letterSpacing: '0.04em',
    color: '#0F172A',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: '6px',
    marginBottom: '2px'
  };

  return (
    <div style={{ width: '100%', minHeight: '100%', boxSizing: 'border-box' }}>
      <div style={{ width: '100%', background: '#FFFFFF', border: '1px solid #CBD5E1', borderRadius: '4px', boxShadow: '0 1px 3px rgba(0,0,0,0.06)', overflow: 'hidden', boxSizing: 'border-box' }}>

        {/* ─── WORKSTATION TOP BANNER ─── */}
        <div style={{
          background: 'linear-gradient(135deg, #2563EB 0%, #1D4ED8 100%)',
          color: '#FFFFFF',
          padding: '7px 16px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <button
              type="button"
              onClick={onCancel}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                padding: '2px 8px',
                borderRadius: '3px',
                border: '1px solid rgba(255,255,255,0.3)',
                background: 'rgba(255,255,255,0.15)',
                color: '#FFFFFF',
                fontSize: '11px',
                fontWeight: 700,
                cursor: 'pointer'
              }}
            >
              <ArrowLeft style={{ width: 12, height: 12 }} />
              <span>{backLabel || 'Back to Employees'}</span>
            </button>
            <div style={{ width: '1px', height: '14px', background: 'rgba(255,255,255,0.3)' }} />
            <span style={{ fontSize: '13.5px', fontWeight: 800, letterSpacing: '0.01em' }}>
              Add New Employee • Staff Onboarding Workstation
            </span>
            {hospitalName && (
              <span style={{ fontSize: '11px', fontWeight: 600, background: 'rgba(255,255,255,0.2)', padding: '1px 8px', borderRadius: '3px' }}>
                {hospitalName}
              </span>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '10.5px', fontWeight: 700, background: 'rgba(255,255,255,0.2)', padding: '2px 8px', borderRadius: '3px' }}>
              <span style={{ color: '#FECDD3', fontWeight: 900 }}>*</span> Required Fields
            </span>
          </div>
        </div>

        {/* Global Error Banner */}
        {formError && (
          <div style={{ margin: '10px 16px 0', padding: '8px 12px', background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: '3px', fontSize: '12px', color: '#B91C1C', fontWeight: 650, display: 'flex', alignItems: 'center', gap: '8px' }}>
            <AlertCircle style={{ width: 14, height: 14, color: '#EF4444', flexShrink: 0 }} />
            <span>{formError}</span>
          </div>
        )}

        <form
          ref={formRef}
          onSubmit={handleSubmit}
          onKeyDown={handleKeyDown}
          autoComplete="off"
          style={{ padding: '10px 16px 14px' }}
        >

          {/* ─── CONTINUOUS 3-COLUMN TABLE GRID ─── */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr 1fr',
            columnGap: '16px',
            rowGap: '6px',
            alignItems: 'center'
          }}>

            {/* ══════════════════════════════════════════════════════════════════
                SECTION 1: ACCOUNT & SECURITY CREDENTIALS
               ══════════════════════════════════════════════════════════════════ */}
            <div style={sectionHeaderStyle}>
              <span>1. ACCOUNT & SECURITY CREDENTIALS</span>
              <span style={{ fontSize: '10px', fontWeight: 600, color: '#64748B' }}>
                Core Login Identity & Access Credentials
              </span>
            </div>

            <div style={{
              gridColumn: '1 / -1',
              display: 'grid',
              gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
              columnGap: '16px',
              rowGap: '6px',
              alignItems: 'center'
            }}>
              {/* ROW 1: Title, Name, Phone, Login ID */}
              {/* Col 1: Title */}
              <div style={fieldRow}>
                <span style={{ ...labelStyle, width: '90px' }}>
                  Title <span style={{ color: '#EF4444' }}>*</span>
                </span>
                <span style={colonStyle}>:</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <select
                    id="title-select"
                    name="title"
                    value={formData.title}
                    onChange={e => {
                      setFormData({ ...formData, title: e.target.value });
                      if (fieldErrors.title) setFieldErrors(prev => ({ ...prev, title: '' }));
                    }}
                    style={{
                      ...tableInp,
                      cursor: 'pointer',
                      fontWeight: 650,
                      ...(fieldErrors.title ? { borderColor: '#EF4444', background: '#FEF2F2' } : {})
                    }}
                  >
                    <option value="">Select Title</option>
                    <option value="Mr.">Mr.</option>
                    <option value="Mrs.">Mrs.</option>
                    <option value="Ms.">Ms.</option>
                    <option value="Dr.">Dr.</option>
                  </select>
                </div>
              </div>

              {/* Col 2: Full Legal Name */}
              <div style={fieldRow}>
                <span style={{ ...labelStyle, width: '105px' }}>
                  Full Legal Name <span style={{ color: '#EF4444' }}>*</span>
                </span>
                <span style={colonStyle}>:</span>
                <div style={{ flex: 1, minWidth: 0, position: 'relative' }}>
                  <input
                    type="text"
                    name="name"
                    placeholder="e.g. Rajesh Sharma"
                    value={formData.name}
                    onChange={e => {
                      setFormData({ ...formData, name: e.target.value });
                      if (fieldErrors.name) setFieldErrors(prev => ({ ...prev, name: '' }));
                    }}
                    style={{
                      ...tableInp,
                      ...(fieldErrors.name ? { borderColor: '#EF4444', background: '#FEF2F2' } : {})
                    }}
                  />
                </div>
              </div>

              {/* Col 3: Phone Number */}
              <div style={fieldRow}>
                <span style={{ ...labelStyle, width: '95px' }}>
                  Phone Number <span style={{ color: '#EF4444' }}>*</span>
                </span>
                <span style={colonStyle}>:</span>
                <div style={{ flex: 1, minWidth: 0, position: 'relative' }}>
                  <input
                    type="tel"
                    name="phone"
                    maxLength={10}
                    placeholder="10-digit mobile"
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
                    style={{
                      ...tableInp,
                      ...(fieldErrors.phone ? { borderColor: '#EF4444', background: '#FEF2F2' } : {})
                    }}
                  />
                </div>
              </div>

              {/* Col 4: System Login ID (Auto-populated from phone) */}
              <div style={fieldRow}>
                <span style={{ ...labelStyle, width: '105px' }}>
                  System Login ID
                </span>
                <span style={colonStyle}>:</span>
                <div style={{ flex: 1, minWidth: 0, position: 'relative', display: 'flex', alignItems: 'center' }}>
                  <input
                    type="text"
                    name="staff_id"
                    readOnly
                    value={formData.phone || 'Auto-populated from Phone'}
                    style={{
                      ...tableInp,
                      background: '#F8FAFC',
                      fontFamily: 'monospace',
                      fontWeight: 700,
                      color: '#475569',
                      paddingRight: formData.phone.length === 10 ? '75px' : '8px',
                      cursor: 'not-allowed'
                    }}
                  />
                  {formData.phone.length === 10 && (
                    <span style={{
                      position: 'absolute',
                      right: '6px',
                      fontSize: '10px',
                      fontWeight: 800,
                      color: '#059669',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '2px'
                    }}>
                      <Check style={{ width: 11, height: 11, strokeWidth: 3 }} /> Valid ID
                    </span>
                  )}
                </div>
              </div>

              {/* ROW 2: Employee ID, Password, Confirm Password, Work Location */}
              {/* Col 1: Employee ID */}
              <div style={fieldRow}>
                <span style={{ ...labelStyle, width: '90px' }}>
                  Employee ID
                </span>
                <span style={colonStyle}>:</span>
                <div style={{ flex: 1, minWidth: 0, position: 'relative' }}>
                  <input
                    type="text"
                    name="employeeId"
                    readOnly
                    value={formData.employeeId || 'Auto-generated on creation'}
                    style={{
                      ...tableInp,
                      background: '#F8FAFC',
                      fontFamily: 'monospace',
                      fontWeight: 700,
                      color: '#64748B',
                      cursor: 'not-allowed'
                    }}
                    title="Authoritative Employee ID generated on creation by server"
                  />
                </div>
              </div>

              {/* Col 2: Login Password */}
              <div style={fieldRow}>
                <span style={{ ...labelStyle, width: '105px' }}>
                  Login Password <span style={{ color: '#EF4444' }}>*</span>
                </span>
                <span style={colonStyle}>:</span>
                <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: '3px' }}>
                  <div style={{ flex: 1, position: 'relative', display: 'flex', alignItems: 'center', minWidth: 0 }}>
                    <input
                      type={showPassword ? 'text' : 'password'}
                      name="password"
                      placeholder="Enter password"
                      value={formData.password}
                      style={{
                        ...tableInp,
                        paddingRight: '26px',
                        letterSpacing: (!showPassword && formData.password) ? '0.18em' : 'normal',
                        fontSize: (!showPassword && formData.password) ? '14px' : '11.5px',
                        ...(fieldErrors.password ? { borderColor: '#EF4444', background: '#FEF2F2' } : {})
                      }}
                      onChange={e => {
                        setFormData({ ...formData, password: e.target.value });
                        if (fieldErrors.password) setFieldErrors(prev => ({ ...prev, password: '' }));
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      style={{ position: 'absolute', right: '5px', background: 'none', border: 'none', cursor: 'pointer', color: '#64748B', display: 'flex', alignItems: 'center', padding: 0 }}
                      title={showPassword ? 'Hide password' : 'Show password'}
                    >
                      {showPassword ? <EyeOff style={{ width: 13, height: 13 }} /> : <Eye style={{ width: 13, height: 13 }} />}
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={generateSecurePassword}
                    style={{
                      height: '26px',
                      padding: '0 6px',
                      borderRadius: '3px',
                      border: '1px solid #BFDBFE',
                      background: '#EFF6FF',
                      color: '#1D4ED8',
                      fontSize: '10.5px',
                      fontWeight: 700,
                      cursor: 'pointer',
                      whiteSpace: 'nowrap',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '3px',
                      flexShrink: 0
                    }}
                    title="Generate strong random password"
                  >
                    <Sparkles style={{ width: 11, height: 11 }} />
                    <span>Generate</span>
                  </button>
                </div>
              </div>

              {/* Col 3: Confirm Password */}
              <div style={fieldRow}>
                <span style={{ ...labelStyle, width: '110px' }}>
                  Confirm Password <span style={{ color: '#EF4444' }}>*</span>
                </span>
                <span style={colonStyle}>:</span>
                <div style={{ flex: 1, minWidth: 0, position: 'relative', display: 'flex', alignItems: 'center' }}>
                  <input
                    type={showConfirmPassword ? 'text' : 'password'}
                    name="confirmPassword"
                    placeholder="Re-enter password"
                    value={formData.confirmPassword}
                    style={{
                      ...tableInp,
                      paddingRight: formData.confirmPassword ? '80px' : '26px',
                      letterSpacing: (!showConfirmPassword && formData.confirmPassword) ? '0.18em' : 'normal',
                      fontSize: (!showConfirmPassword && formData.confirmPassword) ? '14px' : '11.5px',
                      ...(fieldErrors.confirmPassword ? { borderColor: '#EF4444', background: '#FEF2F2' } : {})
                    }}
                    onChange={e => {
                      setFormData({ ...formData, confirmPassword: e.target.value });
                      if (fieldErrors.confirmPassword) setFieldErrors(prev => ({ ...prev, confirmPassword: '' }));
                    }}
                  />
                  {formData.confirmPassword && (
                    <span style={{
                      position: 'absolute',
                      right: '25px',
                      fontSize: '10px',
                      fontWeight: 800,
                      color: formData.password === formData.confirmPassword ? '#059669' : '#DC2626'
                    }}>
                      {formData.password === formData.confirmPassword ? '✓ Matched' : 'Mismatch'}
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    style={{ position: 'absolute', right: '5px', background: 'none', border: 'none', cursor: 'pointer', color: '#64748B', display: 'flex', alignItems: 'center', padding: 0 }}
                    title={showConfirmPassword ? 'Hide password' : 'Show password'}
                  >
                    {showConfirmPassword ? <EyeOff style={{ width: 13, height: 13 }} /> : <Eye style={{ width: 13, height: 13 }} />}
                  </button>
                </div>
              </div>

              {/* Col 4: Work Location */}
              <div style={fieldRow}>
                <span style={{ ...labelStyle, width: '90px' }}>
                  Work Location
                </span>
                <span style={colonStyle}>:</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <input
                    type="text"
                    name="workLocation"
                    placeholder="Main Wing - Clinical Center"
                    value={formData.workLocation}
                    onChange={e => setFormData({ ...formData, workLocation: e.target.value })}
                    style={tableInp}
                  />
                </div>
              </div>
            </div>

            {/* ══════════════════════════════════════════════════════════════════
                SECTION 2: ROLE & EMPLOYMENT ACCESS
               ══════════════════════════════════════════════════════════════════ */}
            <div style={sectionHeaderStyle}>
              <span>2. ROLE & EMPLOYMENT ACCESS</span>
              <span style={{ fontSize: '10px', fontWeight: 600, color: '#64748B' }}>
                Access Permissions, Department & Employment Terms
              </span>
            </div>

            {/* ROW 3: Role, Work Email, Employment Type */}
            {/* Col 1: Access Role */}
            <div style={fieldRow}>
              <span style={labelStyle}>
                Access Role <span style={{ color: '#EF4444' }}>*</span>
              </span>
              <span style={colonStyle}>:</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <select
                  name="role"
                  value={formData.role}
                  onChange={e => handleRoleChange(e.target.value)}
                  style={{ ...tableInp, cursor: 'pointer', fontWeight: 650 }}
                >
                  {rolesList.map(r => (
                    <option key={r.value} value={r.value}>{r.label}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Col 2: Work Email */}
            <div style={fieldRow}>
              <span style={labelStyle}>
                Work Email <span style={{ color: '#94A3B8', fontWeight: 500 }}>(Opt)</span>
              </span>
              <span style={colonStyle}>:</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <input
                  type="email"
                  name="email"
                  placeholder="employee.name@clinic.com"
                  value={formData.email}
                  onChange={e => {
                    setFormData({ ...formData, email: e.target.value });
                    if (fieldErrors.email) setFieldErrors(prev => ({ ...prev, email: '' }));
                  }}
                  style={{
                    ...tableInp,
                    ...(fieldErrors.email ? { borderColor: '#EF4444', background: '#FEF2F2' } : {})
                  }}
                />
              </div>
            </div>

            {/* Col 3: Employment Type */}
            <div style={fieldRow}>
              <span style={labelStyle}>
                Employment Type
              </span>
              <span style={colonStyle}>:</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <select
                  name="employmentType"
                  value={formData.employmentType}
                  onChange={e => setFormData({ ...formData, employmentType: e.target.value })}
                  style={{ ...tableInp, cursor: 'pointer' }}
                >
                  <option value="Full-Time">Full-Time</option>
                  <option value="Part-Time">Part-Time</option>
                  <option value="Contract">Contract</option>
                  <option value="Visiting">Visiting Consultant</option>
                </select>
              </div>
            </div>

            {/* ROW 4: Joining Date, Department, Designation */}
            {/* Col 1: Joining Date */}
            <div style={fieldRow}>
              <span style={labelStyle}>
                Joining Date
              </span>
              <span style={colonStyle}>:</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <input
                  type="date"
                  name="joiningDate"
                  value={formData.joiningDate}
                  onChange={e => setFormData({ ...formData, joiningDate: e.target.value })}
                  style={{ ...tableInp, cursor: 'pointer' }}
                />
              </div>
            </div>

            {/* Col 2: Department */}
            <div style={fieldRow}>
              <span style={labelStyle}>
                Department
              </span>
              <span style={colonStyle}>:</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <input
                  type="text"
                  name="department"
                  placeholder="e.g. Outpatient Services"
                  value={formData.department}
                  onChange={e => setFormData({ ...formData, department: e.target.value })}
                  style={tableInp}
                />
              </div>
            </div>

            {/* Col 3: Designation */}
            <div style={fieldRow}>
              <span style={labelStyle}>
                Designation
              </span>
              <span style={colonStyle}>:</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <input
                  type="text"
                  name="designation"
                  placeholder="e.g. Front Desk Executive"
                  value={formData.designation}
                  onChange={e => setFormData({ ...formData, designation: e.target.value })}
                  style={tableInp}
                />
              </div>
            </div>

            {/* ══════════════════════════════════════════════════════════════════
                SECTION 3: PROFESSIONAL CONFIGURATION (Doctor Only)
               ══════════════════════════════════════════════════════════════════ */}
            {formData.role === 'doctor' && (
              <>
                <div style={sectionHeaderStyle}>
                  <span>3. PROFESSIONAL & CLINICAL CONFIGURATION</span>
                  <span style={{ fontSize: '10px', fontWeight: 600, color: '#64748B' }}>
                    Clinical Specialization, Consultation Fee & OPD Limits
                  </span>
                </div>

                {/* Col 1: Specialization */}
                <div style={fieldRow}>
                  <span style={labelStyle}>
                    Specialization <span style={{ color: '#EF4444' }}>*</span>
                  </span>
                  <span style={colonStyle}>:</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
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
                      style={{
                        ...tableInp,
                        cursor: 'pointer',
                        fontWeight: 650,
                        ...(fieldErrors.specialty ? { borderColor: '#EF4444', background: '#FEF2F2' } : {})
                      }}
                    >
                      <option value="">-- Select Specialization --</option>
                      {DOCTOR_SPECIALIZATIONS.map(spec => (
                        <option key={spec} value={spec}>{spec}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Col 2: Consultation Fee */}
                <div style={fieldRow}>
                  <span style={labelStyle}>
                    Consult Fee (₹)
                  </span>
                  <span style={colonStyle}>:</span>
                  <div style={{ flex: 1, minWidth: 0, position: 'relative', display: 'flex', alignItems: 'center' }}>
                    <span style={{ position: 'absolute', left: '7px', fontSize: '11px', fontWeight: 700, color: '#64748B' }}>₹</span>
                    <input
                      type="number"
                      min="0"
                      name="consultationFee"
                      placeholder="500"
                      value={formData.consultationFee}
                      onChange={e => setFormData({ ...formData, consultationFee: e.target.value })}
                      style={{ ...tableInp, paddingLeft: '20px' }}
                    />
                  </div>
                </div>

                {/* Col 3: Max Daily Slots */}
                <div style={fieldRow}>
                  <span style={labelStyle}>
                    Max Slots / Day
                  </span>
                  <span style={colonStyle}>:</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <input
                      type="number"
                      min="1"
                      name="max_slots"
                      placeholder="10"
                      value={formData.max_slots}
                      onChange={e => setFormData({ ...formData, max_slots: e.target.value })}
                      style={tableInp}
                    />
                  </div>
                </div>
              </>
            )}

            {/* ══════════════════════════════════════════════════════════════════
                SECTION 4: SCHEDULE & ATTENDANCE AVAILABILITY
               ══════════════════════════════════════════════════════════════════ */}
            <div style={sectionHeaderStyle}>
              <span>{formData.role === 'doctor' ? '4. SCHEDULE & ATTENDANCE AVAILABILITY' : '3. SCHEDULE & ATTENDANCE AVAILABILITY'}</span>
              <span style={{ fontSize: '10px', fontWeight: 600, color: '#64748B' }}>
                Weekly Off-Duty Schedule & Operational Attendance
              </span>
            </div>

            {/* Weekly Off Days Selection (Spans Full Width across 3 Columns) */}
            <div style={{ gridColumn: '1 / -1', display: 'flex', alignItems: 'center', gap: '4px', minHeight: '28px' }}>
              <span style={labelStyle}>
                Weekly Off Days
              </span>
              <span style={colonStyle}>:</span>
              <div style={{ flex: 1, display: 'flex', flexWrap: 'wrap', gap: '5px', alignItems: 'center' }}>
                {WEEKDAYS.map(day => {
                  const isOff = Array.isArray(formData.weeklyOff)
                    ? formData.weeklyOff.includes(day.key)
                    : (formData.weeklyOff ? String(formData.weeklyOff).split(',').map(d => d.trim()).includes(day.key) : false);

                  return (
                    <button
                      key={day.key}
                      type="button"
                      onClick={() => toggleWeeklyOffDay(day.key)}
                      style={{
                        height: '24px',
                        padding: '0 8px',
                        borderRadius: '3px',
                        border: isOff ? '1px solid #0F172A' : '1px solid #CBD5E1',
                        background: isOff ? '#0F172A' : '#FFFFFF',
                        color: isOff ? '#FFFFFF' : '#334155',
                        fontSize: '11px',
                        fontWeight: isOff ? 750 : 550,
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px',
                        transition: 'all 0.1s ease'
                      }}
                      title={isOff ? `${day.key} is marked as OFF` : `${day.key} is Working`}
                    >
                      {isOff && <Check style={{ width: 11, height: 11, strokeWidth: 3 }} />}
                      <span>{day.label}</span>
                    </button>
                  );
                })}
                <span style={{ fontSize: '10px', color: '#64748B', marginLeft: '6px' }}>
                  (Dark badge indicates regular scheduled off day)
                </span>
              </div>
            </div>

            {/* Doctor OPD Slots (Only when role is doctor) */}
            {formData.role === 'doctor' && (
              <div style={{ gridColumn: '1 / -1', marginTop: '4px', paddingTop: '6px', borderTop: '1px dashed #E2E8F0' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ fontSize: '11px', fontWeight: 750, color: '#0F172A' }}>
                      Attending OPD Time Slots <span style={{ color: '#EF4444' }}>*</span>
                    </span>
                    <span style={{ fontSize: '10.5px', color: '#64748B', fontWeight: 600 }}>
                      ({(formData.doctorSlots || []).length} active)
                    </span>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <button
                      type="button"
                      onClick={handleSelectAllSlots}
                      style={{ background: 'none', border: 'none', color: '#2563EB', fontSize: '11px', fontWeight: 700, cursor: 'pointer', textDecoration: 'underline' }}
                    >
                      Select All
                    </button>
                    <span style={{ color: '#CBD5E1' }}>|</span>
                    <button
                      type="button"
                      onClick={handleClearAllSlots}
                      style={{ background: 'none', border: 'none', color: '#64748B', fontSize: '11px', fontWeight: 700, cursor: 'pointer', textDecoration: 'underline' }}
                    >
                      Clear All
                    </button>
                    <span style={{ color: '#CBD5E1' }}>|</span>
                    <button
                      type="button"
                      onClick={() => setIsSlotPickerOpen(!isSlotPickerOpen)}
                      style={{
                        height: '22px',
                        padding: '0 8px',
                        borderRadius: '3px',
                        border: 'none',
                        background: 'linear-gradient(135deg, #2563EB 0%, #1D4ED8 100%)',
                        color: '#FFFFFF',
                        fontSize: '10.5px',
                        fontWeight: 700,
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '3px'
                      }}
                    >
                      <Plus style={{ width: 11, height: 11 }} />
                      <span>Add Custom Slot</span>
                    </button>
                  </div>
                </div>

                {fieldErrors.doctorSlots && (
                  <p style={{ margin: '0 0 6px 0', fontSize: '11px', color: '#EF4444', fontWeight: 600 }}>{fieldErrors.doctorSlots}</p>
                )}

                {/* Slot Picker Dropdown Popover */}
                {isSlotPickerOpen && (
                  <div style={{ padding: '8px 12px', marginBottom: '8px', background: '#F8FAFC', border: '1px solid #CBD5E1', borderRadius: '4px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                      <span style={{ fontSize: '11px', fontWeight: 750, color: '#0F172A', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <Clock style={{ width: 12, height: 12, color: '#2563EB' }} />
                        <span>Select Time Range for Custom OPD Slot</span>
                      </span>
                      <button
                        type="button"
                        onClick={() => { setIsSlotPickerOpen(false); setSlotPickerError(''); }}
                        style={{ background: 'none', border: 'none', color: '#64748B', fontWeight: 800, cursor: 'pointer', fontSize: '12px' }}
                      >
                        ✕
                      </button>
                    </div>

                    {slotPickerError && (
                      <div style={{ padding: '4px 8px', background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: '3px', fontSize: '11px', color: '#B91C1C', marginBottom: '6px' }}>
                        {slotPickerError}
                      </div>
                    )}

                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <span style={{ fontSize: '11px', fontWeight: 650, color: '#334155' }}>Start:</span>
                        <select
                          value={slotPickerStart}
                          onChange={e => {
                            const s = e.target.value;
                            setSlotPickerStart(s);
                            const startObj = TIME_OPTIONS.find(t => t.value === s);
                            if (startObj) {
                              const next30Obj = TIME_OPTIONS.find(t => t.totalMinutes === startObj.totalMinutes + 30);
                              if (next30Obj) setSlotPickerEnd(next30Obj.value);
                            }
                          }}
                          style={{ ...tableInp, width: '110px', height: '24px', cursor: 'pointer' }}
                        >
                          {TIME_OPTIONS.map(opt => (
                            <option key={opt.value} value={opt.value}>{opt.value}</option>
                          ))}
                        </select>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <span style={{ fontSize: '11px', fontWeight: 650, color: '#334155' }}>End:</span>
                        <select
                          value={slotPickerEnd}
                          onChange={e => setSlotPickerEnd(e.target.value)}
                          style={{ ...tableInp, width: '110px', height: '24px', cursor: 'pointer' }}
                        >
                          {TIME_OPTIONS.map(opt => (
                            <option key={opt.value} value={opt.value}>{opt.value}</option>
                          ))}
                        </select>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '3px', marginLeft: '6px' }}>
                        <span style={{ fontSize: '10.5px', color: '#64748B' }}>Preset:</span>
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
                            style={{ padding: '1px 5px', background: '#FFFFFF', border: '1px solid #CBD5E1', borderRadius: '2px', fontSize: '10px', fontWeight: 650, color: '#334155', cursor: 'pointer' }}
                          >
                            +{mins}m
                          </button>
                        ))}
                      </div>

                      <div style={{ marginLeft: 'auto', display: 'flex', gap: '4px' }}>
                        <button
                          type="button"
                          onClick={() => { setIsSlotPickerOpen(false); setSlotPickerError(''); }}
                          style={{ height: '24px', padding: '0 8px', borderRadius: '3px', border: '1px solid #CBD5E1', background: '#FFFFFF', fontSize: '11px', fontWeight: 650, cursor: 'pointer', color: '#334155' }}
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={handleAddSlotFromPicker}
                          style={{ height: '24px', padding: '0 10px', borderRadius: '3px', border: 'none', background: 'linear-gradient(135deg, #2563EB 0%, #1D4ED8 100%)', color: '#FFFFFF', fontSize: '11px', fontWeight: 700, cursor: 'pointer' }}
                        >
                          Add Slot
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* Compact Selectable Chips Stack */}
                <div style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: '4px',
                  padding: '5px 8px',
                  background: '#F8FAFC',
                  border: '1px solid #CBD5E1',
                  borderRadius: '3px',
                  maxHeight: '120px',
                  overflowY: 'auto'
                }}>
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
                        style={{
                          height: '23px',
                          padding: '0 7px',
                          borderRadius: '3px',
                          border: isSelected ? '1px solid #1D4ED8' : '1px solid #CBD5E1',
                          background: isSelected ? 'linear-gradient(135deg, #2563EB 0%, #1D4ED8 100%)' : '#FFFFFF',
                          color: isSelected ? '#FFFFFF' : '#334155',
                          fontSize: '10.5px',
                          fontWeight: isSelected ? 750 : 500,
                          cursor: 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                          transition: 'all 0.1s ease',
                          boxShadow: isSelected ? '0 1px 4px rgba(37, 99, 235, 0.25)' : 'none'
                        }}
                        title={isSelected ? 'Click to deselect slot' : 'Click to select slot'}
                      >
                        {isSelected ? (
                          <Check style={{ width: 10, height: 10, strokeWidth: 3 }} />
                        ) : (
                          <span style={{ width: 4, height: 4, borderRadius: '50%', background: '#94A3B8' }} />
                        )}
                        <span>{slot}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* ══════════════════════════════════════════════════════════════════
                SECTION 5: PERSONAL, STATUTORY & EMERGENCY DETAILS (OPTIONAL)
               ══════════════════════════════════════════════════════════════════ */}
            <div
              id="section-personal-details-toggle"
              onClick={() => setShowOptionalDetails(!showOptionalDetails)}
              style={{
                ...sectionHeaderStyle,
                cursor: 'pointer',
                userSelect: 'none',
                background: '#F8FAFC'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span>{formData.role === 'doctor' ? '5. PERSONAL, STATUTORY & EMERGENCY DETAILS' : '4. PERSONAL, STATUTORY & EMERGENCY DETAILS'}</span>
                <span style={{ fontSize: '10px', fontWeight: 600, color: '#64748B' }}>
                  (Demographics, Aadhaar, PAN, Address & Emergency Contact - Optional)
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '10.5px', color: '#2563EB', fontWeight: 700 }}>
                <span>{showOptionalDetails ? 'Hide Section ▲' : 'Show Section ▼'}</span>
              </div>
            </div>

            {showOptionalDetails && (
              <>
                {/* ROW 7: CTC, DOB, Gender */}
                {/* Col 1: Annual CTC */}
                <div style={fieldRow}>
                  <span style={labelStyle}>
                    Annual CTC (₹)
                  </span>
                  <span style={colonStyle}>:</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <input
                      type="number"
                      min="0"
                      placeholder="e.g. 600000"
                      value={formData.ctcAnnual}
                      onChange={e => setFormData({ ...formData, ctcAnnual: e.target.value })}
                      style={tableInp}
                    />
                  </div>
                </div>

                {/* Col 2: Date of Birth */}
                <div style={fieldRow}>
                  <span style={labelStyle}>
                    Date of Birth
                  </span>
                  <span style={colonStyle}>:</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <input
                      type="date"
                      value={formData.dob}
                      onChange={e => setFormData({ ...formData, dob: e.target.value })}
                      style={{ ...tableInp, cursor: 'pointer' }}
                    />
                  </div>
                </div>

                {/* Col 3: Gender */}
                <div style={fieldRow}>
                  <span style={labelStyle}>
                    Gender
                  </span>
                  <span style={colonStyle}>:</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <select
                      value={formData.gender}
                      onChange={e => setFormData({ ...formData, gender: e.target.value })}
                      style={{ ...tableInp, cursor: 'pointer' }}
                    >
                      <option value="">-- Select Gender --</option>
                      <option value="Male">Male</option>
                      <option value="Female">Female</option>
                      <option value="Other">Other</option>
                    </select>
                  </div>
                </div>

                {/* ROW 8: Blood Group, Aadhaar, PAN */}
                {/* Col 1: Blood Group */}
                <div style={fieldRow}>
                  <span style={labelStyle}>
                    Blood Group
                  </span>
                  <span style={colonStyle}>:</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <select
                      value={formData.bloodGroup}
                      onChange={e => setFormData({ ...formData, bloodGroup: e.target.value })}
                      style={{ ...tableInp, cursor: 'pointer' }}
                    >
                      <option value="">-- Select Blood Group --</option>
                      {['A+', 'A-', 'B+', 'B-', 'O+', 'O-', 'AB+', 'AB-'].map(bg => (
                        <option key={bg} value={bg}>{bg}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Col 2: Aadhaar Card */}
                <div style={fieldRow}>
                  <span style={labelStyle}>
                    Aadhaar Card
                  </span>
                  <span style={colonStyle}>:</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <input
                      type="text"
                      maxLength={12}
                      placeholder="12-digit number"
                      value={formData.aadhaar}
                      onChange={e => setFormData({ ...formData, aadhaar: e.target.value.replace(/\D/g, '') })}
                      style={{ ...tableInp, fontFamily: 'monospace' }}
                    />
                  </div>
                </div>

                {/* Col 3: PAN Card */}
                <div style={fieldRow}>
                  <span style={labelStyle}>
                    PAN Card
                  </span>
                  <span style={colonStyle}>:</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <input
                      type="text"
                      maxLength={10}
                      placeholder="10-char PAN"
                      value={formData.pan}
                      onChange={e => setFormData({ ...formData, pan: e.target.value.toUpperCase() })}
                      style={{ ...tableInp, fontFamily: 'monospace', textTransform: 'uppercase' }}
                    />
                  </div>
                </div>

                {/* ROW 9: Residential Address (Spans 2 columns) & Emergency Contact Name */}
                {/* Col 1 & 2: Residential Address */}
                <div style={{ gridColumn: 'span 2', display: 'flex', alignItems: 'center', gap: '4px', height: '26px' }}>
                  <span style={labelStyle}>
                    Residential Address
                  </span>
                  <span style={colonStyle}>:</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <input
                      type="text"
                      placeholder="Street address, city, state, postal pin code..."
                      value={formData.address}
                      onChange={e => setFormData({ ...formData, address: e.target.value })}
                      style={tableInp}
                    />
                  </div>
                </div>

                {/* Col 3: Emergency Contact Name */}
                <div style={fieldRow}>
                  <span style={labelStyle}>
                    Emergency Contact
                  </span>
                  <span style={colonStyle}>:</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <input
                      type="text"
                      placeholder="Next of Kin / Contact Name"
                      value={formData.emergencyContactName}
                      onChange={e => setFormData({ ...formData, emergencyContactName: e.target.value })}
                      style={tableInp}
                    />
                  </div>
                </div>

                {/* ROW 10: Relationship & Emergency Contact Phone */}
                {/* Col 1: Relationship */}
                <div style={fieldRow}>
                  <span style={labelStyle}>
                    Relationship
                  </span>
                  <span style={colonStyle}>:</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <select
                      id="emergency-relation-select"
                      name="emergencyContactRelation"
                      value={formData.emergencyContactRelation}
                      onChange={e => setFormData({ ...formData, emergencyContactRelation: e.target.value })}
                      style={{ ...tableInp, cursor: 'pointer' }}
                    >
                      <option value="">-- Select Relationship --</option>
                      {Boolean(formData.emergencyContactRelation && !['Spouse', 'Parent', 'Child', 'Sibling', 'Relative', 'Guardian', 'Other'].includes(formData.emergencyContactRelation)) && (
                        <option value={formData.emergencyContactRelation}>{formData.emergencyContactRelation}</option>
                      )}
                      {['Spouse', 'Parent', 'Child', 'Sibling', 'Relative', 'Guardian', 'Other'].map(rel => (
                        <option key={rel} value={rel}>{rel}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Col 2: Emergency Contact Phone */}
                <div style={fieldRow}>
                  <span style={labelStyle}>
                    Emergency Phone
                  </span>
                  <span style={colonStyle}>:</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <input
                      type="tel"
                      maxLength={10}
                      placeholder="10-digit emergency phone"
                      value={formData.emergencyContactPhone}
                      onChange={e => setFormData({ ...formData, emergencyContactPhone: e.target.value.replace(/\D/g, '') })}
                      style={tableInp}
                    />
                  </div>
                </div>

                {/* Col 3: Empty spacer */}
                <div />
              </>
            )}

          </div>

          {/* ══════════════════════════════════════════════════════════════════
              ACTION BUTTONS FOOTER
             ══════════════════════════════════════════════════════════════════ */}
          <div style={{
            marginTop: '14px',
            paddingTop: '10px',
            borderTop: '1px solid #CBD5E1',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between'
          }}>
            <button
              type="button"
              onClick={() => {
                setFormData({
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
                  weeklyOff: ['Sunday'],
                  doctorSlots: [...DEFAULT_DOCTOR_SLOTS],
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
                setFieldErrors({});
                setFormError('');
              }}
              style={{
                background: 'none',
                border: 'none',
                color: '#64748B',
                fontSize: '11px',
                fontWeight: 650,
                cursor: 'pointer',
                padding: '4px 8px'
              }}
            >
              Clear Fields
            </button>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <button
                type="button"
                onClick={onCancel}
                disabled={isSubmitting}
                style={{
                  height: '28px',
                  padding: '0 14px',
                  borderRadius: '3px',
                  border: '1px solid #CBD5E1',
                  background: '#FFFFFF',
                  color: '#334155',
                  fontSize: '11.5px',
                  fontWeight: 700,
                  cursor: 'pointer'
                }}
              >
                Cancel
              </button>

              <button
                id="onboard-employee-submit-btn"
                type="submit"
                disabled={isSubmitting}
                style={{
                  height: '28px',
                  padding: '0 18px',
                  borderRadius: '3px',
                  border: 'none',
                  background: 'linear-gradient(135deg, #2563EB 0%, #1D4ED8 100%)',
                  color: '#FFFFFF',
                  fontSize: '11.5px',
                  fontWeight: 800,
                  cursor: isSubmitting ? 'not-allowed' : 'pointer',
                  opacity: isSubmitting ? 0.7 : 1,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  boxShadow: '0 4px 12px rgba(37, 99, 235, 0.35)'
                }}
              >
                {isSubmitting ? (
                  <>
                    <Loader2 style={{ width: 13, height: 13, animation: 'spin 1s linear infinite' }} />
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
