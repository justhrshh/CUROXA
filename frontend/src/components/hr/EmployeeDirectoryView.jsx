import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { 
  Search, Filter, Plus, Shield, ShieldCheck, Mail, Phone, Eye, 
  Trash2, Edit3, X, UserCheck, Briefcase, FileClock, ChevronDown, Check, Settings, Download
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
  const [customSlotInput, setCustomSlotInput] = useState('');
  const [error, setError] = useState('');

  React.useEffect(() => {
    setIsAdding(initialIsAdding);
  }, [initialIsAdding]);

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
          className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 animate-fadeIn hr-modal-overlay" 
          style={{ zIndex: 99999 }}
        >
            <form 
              onSubmit={handleCreateEmployee}
              autoComplete="off"
              className="bg-white rounded-2xl shadow-xl border border-slate-100 max-w-2xl w-full relative hr-admin-modal max-h-[90vh] flex flex-col"
              style={{ animation: 'adminFadeIn 0.2s ease-out' }}
              onClick={e => e.stopPropagation()}
              onInvalidCapture={(e) => {
                const target = e.target;
                if (target) {
                  target.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }
              }}
            >
              <div className="flex items-center justify-between p-6 pb-4 border-b border-slate-100 bg-white">
                <span className="text-lg font-display font-bold text-slate-800">Onboard New Hospital Staff</span>
                <button 
                  type="button"
                  className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors" 
                  onClick={() => { setIsAdding(false); resetForm(); }}
                  title="Close form"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-6 space-y-4" style={{ maxHeight: 'calc(90vh - 160px)' }}>
              {error && (
                <div id="staff-form-error" style={{
                  gridColumn: 'span 2',
                  background: '#FEE2E2',
                  border: '1px solid #FCA5A5',
                  color: '#991B1B',
                  padding: '12px 16px',
                  borderRadius: '8px',
                  marginBottom: '16px',
                  fontSize: '13px',
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}>
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><circle cx="12" cy="12" r="10"/><line x1="12" x2="12" y1="8" y2="12"/><line x1="12" x2="12.01" y1="16" y2="16"/></svg>
                  <span>{error}</span>
                </div>
              )}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-3">
                
                {/* Full name */}
                <div className="admin-input-group">
                  <label className="admin-input-label">Full Name *</label>
                  <input 
                    type="text" 
                    required 
                    placeholder="e.g. Dr. Allison House"
                    value={newEmp.name}
                    onChange={(e) => setNewEmp({...newEmp, name: e.target.value})}
                    className="admin-text-input"
                    autoComplete="new-password"
                  />
                </div>

                {/* Username */}
                <div className="admin-input-group">
                  <label className="admin-input-label">Username (Staff ID / Phone Number) *</label>
                  <input 
                    type="text" 
                    readOnly
                    disabled
                    placeholder="Auto-populated from Phone Number"
                    value={newEmp.phone}
                    className="admin-text-input bg-slate-50 cursor-not-allowed font-semibold text-slate-600"
                    autoComplete="new-password"
                  />
                </div>

                {/* Password */}
                <div className="admin-input-group">
                  <div className="flex justify-between items-center w-full">
                    <label className="admin-input-label mb-0">Login Password *</label>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={generateRandomPassword}
                        className="text-[10px] bg-blue-50 hover:bg-blue-100 text-blue-600 px-2 py-0.5 rounded border border-blue-200 font-bold transition-all"
                      >
                        Generate
                      </button>
                      {newEmp.password && (
                        <span style={{ fontSize: '10px', fontWeight: 700, color: getPasswordStrength(newEmp.password).color }}>
                          {getPasswordStrength(newEmp.password).label}
                        </span>
                      )}
                    </div>
                  </div>
                  <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                    <input 
                      type={showPassword ? 'text' : 'password'} 
                      className="admin-text-input" 
                      style={{ paddingRight: '40px', width: '100%' }}
                      required 
                      placeholder="••••••••"
                      value={newEmp.password}
                      onChange={(e) => setNewEmp({...newEmp, password: e.target.value})}
                      autoComplete="new-password"
                    />
                    <button 
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      style={{
                        position: 'absolute',
                        right: '12px',
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        color: '#64748B',
                        padding: 0,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                      }}
                    >
                      {showPassword ? (
                        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"/><path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"/><path d="M6.61 6.61A13.52 13.52 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61"/><line x1="2" x2="22" y1="2" y2="22"/></svg>
                      ) : (
                        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>
                      )}
                    </button>
                  </div>
                </div>

                {/* Confirm Password */}
                <div className="admin-input-group">
                  <label className="admin-input-label">Confirm Password *</label>
                  <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                    <input 
                      type={showConfirmPassword ? 'text' : 'password'} 
                      className="admin-text-input" 
                      style={{ 
                        paddingRight: '40px', 
                        width: '100%', 
                        borderColor: newEmp.confirmPassword ? (newEmp.password === newEmp.confirmPassword ? '#22C55E' : '#EF4444') : '#CBD5E1' 
                      }}
                      required 
                      placeholder="••••••••"
                      value={newEmp.confirmPassword}
                      onChange={(e) => setNewEmp({...newEmp, confirmPassword: e.target.value})}
                      autoComplete="new-password"
                    />
                    <button 
                      type="button"
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      style={{
                        position: 'absolute',
                        right: '12px',
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        color: '#64748B',
                        padding: 0,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                      }}
                    >
                      {showConfirmPassword ? (
                        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"/><path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"/><path d="M6.61 6.61A13.52 13.52 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61"/><line x1="2" x2="22" y1="2" y2="22"/></svg>
                      ) : (
                        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>
                      )}
                    </button>
                  </div>
                  {newEmp.confirmPassword && (
                    <span style={{ fontSize: '10px', fontWeight: 600, color: newEmp.password === newEmp.confirmPassword ? '#22C55E' : '#EF4444', marginTop: '4px' }}>
                      {newEmp.password === newEmp.confirmPassword ? 'Passwords match' : 'Passwords do not match'}
                    </span>
                  )}
                </div>

                {/* Access Role */}
                <div className="admin-input-group">
                  <label className="admin-input-label">Access Role *</label>
                  <select 
                    className="admin-text-input" 
                    style={{ padding: '0 8px' }}
                    value={newEmp.role} 
                    onChange={(e) => setNewEmp({...newEmp, role: e.target.value})}
                  >
                    {getAvailableRoles().map(r => (
                      <option key={r.value} value={r.value}>{r.label}</option>
                    ))}
                  </select>
                </div>

                {/* Email */}
                <div className="admin-input-group">
                  <label className="admin-input-label">Hospital Email *</label>
                  <input 
                    type="email" 
                    required
                    placeholder="e.g. allison.house@hospital.com"
                    value={newEmp.email}
                    onChange={(e) => setNewEmp({...newEmp, email: e.target.value})}
                    className="admin-text-input"
                  />
                </div>

                {/* Phone */}
                <div className="admin-input-group">
                  <label className="admin-input-label">Phone Number *</label>
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
                    className="admin-text-input"
                  />
                </div>

                {/* Specialization (Doctor only) */}
                {newEmp.role === 'doctor' && (
                  <>
                    <div className="admin-input-group">
                      <label className="admin-input-label">Specialization *</label>
                      <select 
                        value={newEmp.specialty}
                        onChange={(e) => setNewEmp({...newEmp, specialty: e.target.value})}
                        className="admin-text-input"
                        style={{ padding: '0 8px' }}
                      >
                        <option value="">-- Select Specialization --</option>
                        {DOCTOR_SPECIALIZATIONS.map(spec => (
                          <option key={spec} value={spec}>{spec}</option>
                        ))}
                      </select>
                    </div>
                    <div className="admin-input-group">
                      <label className="admin-input-label">Doctor Consultation Fee (₹)</label>
                      <input 
                        type="number" 
                        placeholder="e.g. 500"
                        value={newEmp.consultationFee !== undefined ? newEmp.consultationFee : 500}
                        onChange={(e) => setNewEmp({...newEmp, consultationFee: e.target.value !== '' ? Number(e.target.value) : ''})}
                        className="admin-text-input"
                      />
                    </div>
                    
                    <div className="admin-input-group col-span-2 mt-1">
                      <label className="admin-input-label">Attending Time Slots (Required) *</label>
                      
                      {/* Add Custom Slot */}
                      <div className="flex gap-2 mb-3">
                        <input 
                          type="text" 
                          placeholder="e.g. 10:00 AM - 11:00 AM" 
                          value={customSlotInput}
                          onChange={e => setCustomSlotInput(e.target.value)}
                          className="admin-text-input flex-1"
                          style={{ height: '36px' }}
                        />
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
                          className="px-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold transition-colors"
                        >
                          Add Custom
                        </button>
                      </div>

                      <div className="flex flex-wrap gap-1.5 p-3 border border-slate-200 rounded-xl bg-slate-50 max-h-[140px] overflow-y-auto" data-lenis-prevent>
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
                              className={`px-2.5 py-1 rounded text-xs font-bold border transition-all ${
                                isSelected
                                  ? 'bg-blue-50 border-blue-500 text-blue-600 shadow-sm'
                                  : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                              }`}
                            >
                              {slot}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </>
                )}

                {/* Weekly Off Days */}
                <div className="admin-input-group col-span-2">
                  <label className="admin-input-label">Weekly Off Days</label>
                  <div className="flex flex-wrap gap-1.5 mt-1">
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
                          className={`px-2.5 py-1 rounded text-xs font-semibold border transition-all ${
                            isSelected
                              ? 'bg-blue-600 border-blue-600 text-white shadow-sm'
                              : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                          }`}
                        >
                          {day.slice(0, 3)}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Annual CTC */}
                <div className="admin-input-group">
                  <label className="admin-input-label">Annual CTC (₹ INR)</label>
                  <input 
                    type="number" 
                    placeholder="e.g. 480000"
                    value={newEmp.ctcAnnual}
                    onChange={(e) => setNewEmp({...newEmp, ctcAnnual: e.target.value})}
                    className="admin-text-input"
                  />
                </div>
                
                <div className="col-span-1 md:col-span-2 my-2 border-t border-slate-100"></div>
                <div className="col-span-1 md:col-span-2">
                  <span className="text-xs font-bold text-slate-800 uppercase tracking-wider">Personal & Demographic Data</span>
                </div>

                {/* DOB */}
                <div className="admin-input-group">
                  <label className="admin-input-label">Date of Birth</label>
                  <input type="date" value={newEmp.dob} onChange={e => setNewEmp({...newEmp, dob: e.target.value})} className="admin-text-input" />
                </div>
                
                {/* Gender */}
                <div className="admin-input-group">
                  <label className="admin-input-label">Gender</label>
                  <select value={newEmp.gender} onChange={e => setNewEmp({...newEmp, gender: e.target.value})} className="admin-text-input" style={{ padding: '0 8px' }}>
                    <option value="">-- Select Gender --</option>
                    <option value="Male">Male</option>
                    <option value="Female">Female</option>
                    <option value="Other">Other</option>
                  </select>
                </div>

                {/* Blood Group */}
                <div className="admin-input-group">
                  <label className="admin-input-label">Blood Group</label>
                  <select value={newEmp.bloodGroup} onChange={e => setNewEmp({...newEmp, bloodGroup: e.target.value})} className="admin-text-input" style={{ padding: '0 8px' }}>
                    <option value="">-- Select Blood Group --</option>
                    {['A+', 'A-', 'B+', 'B-', 'O+', 'O-', 'AB+', 'AB-'].map(bg => <option key={bg} value={bg}>{bg}</option>)}
                  </select>
                </div>

                {/* Aadhaar */}
                <div className="admin-input-group">
                  <label className="admin-input-label">Aadhaar Number</label>
                  <input type="text" placeholder="e.g. 1234-5678-9012" value={newEmp.aadhaar} onChange={e => setNewEmp({...newEmp, aadhaar: e.target.value})} className="admin-text-input font-mono" />
                </div>

                {/* PAN */}
                <div className="admin-input-group">
                  <label className="admin-input-label">PAN Number</label>
                  <input type="text" placeholder="e.g. ABCDE1234F" value={newEmp.pan} onChange={e => setNewEmp({...newEmp, pan: e.target.value})} className="admin-text-input font-mono" />
                </div>

                {/* Address */}
                <div className="admin-input-group col-span-1 md:col-span-2">
                  <label className="admin-input-label">Residential Address</label>
                  <textarea rows="2" placeholder="e.g. Hospital Quarters, Building B" value={newEmp.address} onChange={e => setNewEmp({...newEmp, address: e.target.value})} className="admin-text-input h-auto py-2" />
                </div>

                <div className="col-span-1 md:col-span-2 mt-2">
                  <span className="text-[11px] font-bold text-blue-600 uppercase tracking-wider">Emergency Contact</span>
                </div>

                {/* Emergency Contact */}
                <div className="admin-input-group">
                  <label className="admin-input-label">Name</label>
                  <input type="text" placeholder="e.g. John Doe" value={newEmp.emergencyContactName} onChange={e => setNewEmp({...newEmp, emergencyContactName: e.target.value})} className="admin-text-input" />
                </div>
                <div className="admin-input-group">
                  <label className="admin-input-label">Relation</label>
                  <input type="text" placeholder="e.g. Spouse" value={newEmp.emergencyContactRelation} onChange={e => setNewEmp({...newEmp, emergencyContactRelation: e.target.value})} className="admin-text-input" />
                </div>
                <div className="admin-input-group">
                  <label className="admin-input-label">Phone</label>
                  <input 
                    type="tel" 
                    maxLength={10}
                    placeholder="e.g. 9876543210" 
                    value={newEmp.emergencyContactPhone} 
                    onChange={e => {
                      const val = e.target.value.replace(/\D/g, '').slice(0, 10);
                      setNewEmp({...newEmp, emergencyContactPhone: val});
                    }} 
                    className="admin-text-input" 
                  />
                </div>
                </div>
              </div>

              <div className="flex justify-end gap-3 p-6 pt-4 border-t border-slate-100 bg-white">
                <button 
                  type="button" 
                  disabled={isSubmitting}
                  onClick={() => { setIsAdding(false); resetForm(); }}
                  className="px-5 border border-slate-200 rounded-lg text-xs font-semibold text-slate-500 hover:bg-slate-50 transition-colors flex items-center justify-center disabled:opacity-50"
                  style={{ height: '44px' }}
                >
                  Cancel
                </button>
                <button 
                  type="submit"
                  disabled={isSubmitting}
                  className="admin-submit-btn flex items-center justify-center gap-2"
                  style={{ width: 'auto', padding: '0 24px', marginTop: 0, opacity: isSubmitting ? 0.75 : 1, cursor: isSubmitting ? 'not-allowed' : 'pointer' }}
                >
                  {isSubmitting ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                      <span>Registering...</span>
                    </>
                  ) : (
                    'Register Staff Member'
                  )}
                </button>
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
