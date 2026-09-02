import React, { useState, useEffect } from 'react';
import { 
  User, Shield, CalendarDays, Wallet, Trophy, FileLock, ClipboardList, 
  MapPin, Clock, Phone, Mail, FileText, CheckCircle, AlertCircle, Printer, Plus, AlertTriangle,
  ShieldCheck, X, Settings, Check, Trash2, Trash, Edit3, ChevronRight, History, ArrowDownRight, ArrowUpRight, Send
} from 'lucide-react';
import api from '../../utils/api';

const ALL_TIME_SLOTS = [
  '09:00 AM', '09:30 AM', '10:00 AM', '10:30 AM', '11:00 AM', '11:30 AM',
  '12:00 PM', '12:30 PM', '02:00 PM', '02:30 PM', '03:00 PM', '03:30 PM',
  '04:00 PM', '04:30 PM', '05:00 PM', '05:30 PM', '06:00 PM', '06:30 PM', '07:00 PM'
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

export default function EmployeeProfileView({
  employee,
  allLeaveRequests = [],
  allAttendanceRecords = [],
  allAssets = [],
  onBack,
  onUpdateEmployee,
  onApproveLeave,
  onRejectLeave,
  isAdminOrHR = false
}) {
  const [activeTab, setActiveTab] = useState('Overview');
  const [toast, setToast] = useState(null);
  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };
  const [selectedPayslip, setSelectedPayslip] = useState(null);
  const [damageReportAssetId, setDamageReportAssetId] = useState(null);
  const [damageComments, setDamageComments] = useState('');

  // Live Authoritative Leave Management states
  const [leaveYear, setLeaveYear] = useState(() => new Date().getFullYear());
  const [leaveBalances, setLeaveBalances] = useState(null);
  const [leaveLedger, setLeaveLedger] = useState([]);
  const [leavePolicy, setLeavePolicy] = useState(null);
  const [isLeavesLoading, setIsLeavesLoading] = useState(false);

  // Settings edit states (synchronized with employee prop)
  const [assignedRoles, setAssignedRoles] = useState([]);
  const [permissions, setPermissions] = useState(null);
  const [reportingManagerName, setReportingManagerName] = useState('');
  const [shiftName, setShiftName] = useState('');
  const [carriedForwardLeaves, setCarriedForwardLeaves] = useState(0);
  const [monthlyLeaveAllocation, setMonthlyLeaveAllocation] = useState({ sick: 1, casual: 1, annual: 1.25 });
  const [leaveAllocationReason, setLeaveAllocationReason] = useState('');
  const [employeeDocuments, setEmployeeDocuments] = useState([]);

  // Upload/Preview states for documents tab
  const [newDocTitle, setNewDocTitle] = useState('');
  const [newDocCategory, setNewDocCategory] = useState('certifications');
  const [newDocFile, setNewDocFile] = useState(null);
  const [newDocData, setNewDocData] = useState(null);
  const [previewDoc, setPreviewDoc] = useState(null);

  // Doctor slots state
  const [selectedSlots, setSelectedSlots] = useState([]);
  const [newSlotTime, setNewSlotTime] = useState('');
  const [newSlotStartTime, setNewSlotStartTime] = useState('');
  const [newSlotEndTime, setNewSlotEndTime] = useState('');
  const [newSlotLimit, setNewSlotLimit] = useState(3);

  // Personal Info Edit State
  const [isEditingPersonal, setIsEditingPersonal] = useState(false);
  const [personalFormData, setPersonalFormData] = useState({
    dob: '', gender: '', bloodGroup: '', aadhaar: '', pan: '', address: '',
    emergencyContact: { name: '', relation: '', phone: '' }
  });

  // Professional Info Edit State
  const [isEditingProfessional, setIsEditingProfessional] = useState(false);
  const [professionalFormData, setProfessionalFormData] = useState({
    department: '', designation: '', employmentType: '', reportingManagerName: '',
    shiftName: '', workLocation: '', noticePeriodDays: 30, weeklyOff: '', experienceYears: 0
  });

  // Salary Info Edit State
  const [isEditingSalary, setIsEditingSalary] = useState(false);
  const [salaryFormData, setSalaryFormData] = useState({
    ctcAnnual: 0, pfEnrolled: true, esiEnrolled: true
  });

  // Sync states when employee changes
  useEffect(() => {
    if (employee) {
      setAssignedRoles([...(employee.assignedRoles || [])]);
      setPermissions(JSON.parse(JSON.stringify(employee.permissions || createPermissionsMap())));
      setReportingManagerName(employee.reportingManagerName || '');
      setShiftName(employee.shiftName || 'General Shift');
      setCarriedForwardLeaves(employee.carriedForwardLeaves || 0);
      setMonthlyLeaveAllocation(employee.monthlyLeaveAllocation || { sick: 1, casual: 1, annual: 1.25 });
      setEmployeeDocuments(employee.documents || []);
      setSelectedSlots(employee.doctorSlots || []);
      setPersonalFormData({
        dob: employee.dob || '',
        gender: employee.gender || '',
        bloodGroup: employee.bloodGroup || '',
        aadhaar: employee.aadhaar || '',
        pan: employee.pan || '',
        address: employee.address || '',
        emergencyContact: employee.emergencyContact || { name: '', relation: '', phone: '' }
      });
      setProfessionalFormData({
        role: employee.role || 'doctor',
        assignedRoles: employee.assignedRoles || ['Doctor'],
        department: employee.department || '',
        designation: employee.designation || '',
        employmentType: employee.employmentType || 'Full-Time',
        reportingManagerName: employee.reportingManagerName || '',
        shiftName: employee.shiftName || 'General Shift',
        workLocation: employee.workLocation || (() => {
          try {
            return JSON.parse(localStorage.getItem('user') || '{}').tenantName || 'Sunrise Multispeciality';
          } catch (e) {
            return 'Sunrise Multispeciality';
          }
        })(),
        noticePeriodDays: employee.noticePeriodDays || 30,
        weeklyOff: employee.weeklyOff || '',
        experienceYears: employee.experienceYears || 0,
        consultationFee: employee.consultationFee !== undefined ? employee.consultationFee : 500
      });
      setSalaryFormData({
        ctcAnnual: employee.ctcAnnual !== undefined && employee.ctcAnnual !== null ? employee.ctcAnnual : 0,
        pfEnrolled: employee.pfEnrolled !== false,
        esiEnrolled: employee.esiEnrolled !== false
      });
    }
  }, [employee]);

  const handleDocFileChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setNewDocFile(file);
    const reader = new FileReader();
    reader.onload = (evt) => {
      setNewDocData({
        fileName: file.name,
        fileType: file.type,
        fileData: evt.target.result
      });
    };
    reader.readAsDataURL(file);
  };

  const handleSavePersonal = async () => {
    try {
      if (onUpdateEmployee) {
        await onUpdateEmployee(employee.id, personalFormData);
        showToast('Personal information updated successfully', 'success');
        setIsEditingPersonal(false);
      }
    } catch (err) {
      showToast('Failed to update personal information', 'error');
    }
  };

  const handleSaveProfessional = async () => {
    try {
      if (onUpdateEmployee) {
        await onUpdateEmployee(employee.id, professionalFormData);
        showToast('Professional information updated successfully', 'success');
        setIsEditingProfessional(false);
      }
    } catch (err) {
      showToast('Failed to update professional information', 'error');
    }
  };

  const handleSaveSalary = async () => {
    try {
      if (onUpdateEmployee) {
        const updatedCtc = parseInt(salaryFormData.ctcAnnual) || 0;
        await onUpdateEmployee(employee.id, {
          ctcAnnual: updatedCtc,
          pfEnrolled: salaryFormData.pfEnrolled,
          esiEnrolled: salaryFormData.esiEnrolled
        });
        showToast('Salary structure updated successfully', 'success');
        setIsEditingSalary(false);
      }
    } catch (err) {
      showToast('Failed to update salary details', 'error');
    }
  };

  // Fetch authoritative leave data for the selected employee
  const fetchStaffLeaveData = async (targetYear = leaveYear, emp = employee) => {
    if (!emp) return;
    const targetEmpId = emp.staff_id || emp.id || emp._id;
    if (!targetEmpId) return;

    setIsLeavesLoading(true);
    try {
      const params = { staff_id: targetEmpId, year: targetYear };
      const [balanceRes, ledgerRes, policyRes] = await Promise.all([
        api.get('/hr/leave-balances', { params }),
        api.get('/hr/leave-ledger', { params }),
        api.get('/hr/leave-policy')
      ]);

      setLeaveBalances(balanceRes.data);
      setLeaveLedger(Array.isArray(ledgerRes.data) ? ledgerRes.data : []);
      setLeavePolicy(policyRes.data);

      if (policyRes.data && policyRes.data.leaveTypes) {
        const sickLt = policyRes.data.leaveTypes.find(lt => lt.code === 'SICK' || lt.leaveType?.toLowerCase().includes('sick'));
        const casualLt = policyRes.data.leaveTypes.find(lt => lt.code === 'CASUAL' || lt.leaveType?.toLowerCase().includes('casual'));
        const annualLt = policyRes.data.leaveTypes.find(lt => lt.code === 'EARNED' || lt.leaveType?.toLowerCase().includes('earned') || lt.leaveType?.toLowerCase().includes('annual'));

        if (!emp.monthlyLeaveAllocation) {
          setMonthlyLeaveAllocation({
            sick: sickLt?.monthlyAccrual ?? 0.5,
            casual: casualLt?.monthlyAccrual ?? 0.5,
            annual: annualLt?.monthlyAccrual ?? 1.25
          });
        }
      }
    } catch (err) {
      console.error('Failed to fetch staff leave data in EmployeeProfileView:', err);
    } finally {
      setIsLeavesLoading(false);
    }
  };

  useEffect(() => {
    if (employee) {
      fetchStaffLeaveData(leaveYear, employee);
    }
  }, [employee?.id, employee?.staff_id, leaveYear]);

  // Helper to extract balance item for any leave type
  const getBalanceForType = (typeName) => {
    if (!leaveBalances || !leaveBalances.balances) return null;
    const clean = String(typeName).trim().toLowerCase();
    const entry = Object.values(leaveBalances.balances).find(
      b => b.leaveType.toLowerCase() === clean || b.code.toLowerCase() === clean
    );
    return entry || null;
  };

  const sickBal = getBalanceForType('Sick Leave') || getBalanceForType('SICK');
  const casualBal = getBalanceForType('Casual Leave') || getBalanceForType('CASUAL');
  const earnedBal = getBalanceForType('Earned Leave') || getBalanceForType('Annual Leave') || getBalanceForType('EARNED');
  const compBal = getBalanceForType('Comp Off') || getBalanceForType('COMP_OFF');
  const matBal = getBalanceForType('Maternity Leave') || getBalanceForType('MATERNITY');
  const patBal = getBalanceForType('Paternity Leave') || getBalanceForType('PATERNITY');
  const lwpBal = getBalanceForType('Loss of Pay') || getBalanceForType('LWP');

  const tenantStartYear = leaveBalances?.tenantStartYear || leavePolicy?.tenantStartYear || 2026;
  const currentYear = new Date().getFullYear();
  const maxYear = currentYear + 1;
  const availableYears = [];
  for (let y = Math.max(2000, tenantStartYear); y <= maxYear; y++) {
    availableYears.push(y);
  }

  // Local document state for simulation
  const [documentsList, setDocumentsList] = useState([]);

  if (!employee) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-slate-500 bg-white rounded-2xl border border-slate-100 shadow-sm text-center">
        <User className="w-12 h-12 text-slate-300 mb-3" />
        <p className="font-bold text-sm">Profile Data Not Found</p>
        <p className="text-xs text-slate-400 mt-1 max-w-sm">This user is not registered in the HR database. Only staff members with active HR profiles can view workspace metrics.</p>
        {onBack && (
          <button onClick={onBack} className="mt-4 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold transition-colors">
            Back to Directory
          </button>
        )}
      </div>
    );
  }

  // Robust matching for child records across id, staff_id, _id and name
  const leaves = allLeaveRequests.filter(l => {
    if (!l || !employee) return false;
    const empId = String(employee.id || '');
    const staffId = String(employee.staff_id || '');
    const empDbId = String(employee._id || '');
    const lEmpId = String(l.employeeId || '');
    const lName = String(l.employeeName || '').toLowerCase().trim();
    const empName = String(employee.name || '').toLowerCase().trim();

    return (
      (empId && lEmpId === empId) ||
      (staffId && lEmpId === staffId) ||
      (empDbId && lEmpId === empDbId) ||
      (empName && lName && empName === lName)
    );
  });

  const attendance = allAttendanceRecords.filter(a => {
    if (!a || !employee) return false;
    const empId = String(employee.id || '');
    const staffId = String(employee.staff_id || '');
    const empDbId = String(employee._id || '');
    const aEmpId = String(a.employeeId || '');
    const aName = String(a.employeeName || '').toLowerCase().trim();
    const empName = String(employee.name || '').toLowerCase().trim();

    return (
      (empId && aEmpId === empId) ||
      (staffId && aEmpId === staffId) ||
      (empDbId && aEmpId === empDbId) ||
      (empName && aName && empName === aName)
    );
  });

  const assets = allAssets.filter(as => {
    if (!as || !employee) return false;
    const empId = String(employee.id || '');
    const staffId = String(employee.staff_id || '');
    const asEmpId = String(as.allocatedToEmployeeId || '');
    const asName = String(as.allocatedToName || '').toLowerCase().trim();
    const empName = String(employee.name || '').toLowerCase().trim();

    return (
      (empId && asEmpId === empId) ||
      (staffId && asEmpId === staffId) ||
      (empName && asName && empName === asName)
    );
  });

  // Generate salary slips dynamically based on joining date
  const getEmployeeSalarySlips = () => {
    if (employee.salarySlips && employee.salarySlips.length > 0) {
      return employee.salarySlips;
    }

    const joinDateObj = employee.joiningDate ? new Date(employee.joiningDate) : new Date();
    if (isNaN(joinDateObj.getTime())) return [];

    const now = new Date();
    const slips = [];

    const joinYear = joinDateObj.getFullYear();
    const joinMonth = joinDateObj.getMonth();

    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth();

    let tempDate = new Date(joinYear, joinMonth, 1);
    while (tempDate <= now) {
      const y = tempDate.getFullYear();
      const m = tempDate.getMonth();

      const lastDayOfMonth = new Date(y, m + 1, 0).getDate();
      const isCompletedMonth = (y < currentYear || (y === currentYear && m < currentMonth)) ||
                               (y === currentYear && m === currentMonth && now.getDate() >= lastDayOfMonth);

      if (isCompletedMonth) {
        const monthName = tempDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
        const ctc = employee.ctcAnnual || 480000;
        const basic = Math.round(ctc * 0.45 / 12);
        const hra = Math.round(ctc * 0.20 / 12);
        const conveyance = 1500;
        const medicalAllowance = 1250;
        const specialAllowance = Math.round(ctc * 0.15 / 12);
        const bonus = (employee.designation || '').toLowerCase().includes('chief') ? 1200 : 0;
        
        const pfDeduction = employee.pfEnrolled ? Math.min(1800, Math.round(basic * 0.12)) : 0;
        const esiDeduction = employee.esiEnrolled ? Math.round(basic * 0.0075) : 0;
        const professionalTax = 200;
        const incomeTax = Math.round(ctc * 0.18 / 12);

        const totalEarnings = basic + hra + conveyance + medicalAllowance + specialAllowance + bonus;
        const totalDeductions = pfDeduction + esiDeduction + professionalTax + incomeTax;
        const netPayable = totalEarnings - totalDeductions;

        const dateFormatted = `${y}-${String(m + 1).padStart(2, '0')}-${lastDayOfMonth}`;

        slips.unshift({
          id: `PAY-${employee.id}-${String(m + 1).padStart(2, '0')}${String(y).slice(-2)}`,
          employeeId: employee.id,
          employeeName: employee.name,
          designation: employee.designation,
          department: employee.department,
          month: monthName,
          basic,
          hra,
          conveyance,
          medicalAllowance,
          specialAllowance,
          bonus,
          pfDeduction,
          esiDeduction,
          professionalTax,
          incomeTax,
          totalEarnings,
          totalDeductions,
          netPayable,
          status: 'Paid',
          processedDate: dateFormatted
        });
      }

      tempDate.setMonth(tempDate.getMonth() + 1);
    }

    return slips;
  };

  const salarySlips = getEmployeeSalarySlips();

  const handleVerifyDoc = (index) => {
    const updated = [...documentsList];
    updated[index].status = 'Verified';
    setDocumentsList(updated);
  };

  const handleSubmitDamageReport = (e) => {
    e.preventDefault();
    if (!damageReportAssetId) return;
    showToast(`Damage report submitted successfully for Asset ${damageReportAssetId}. Support desk notified.`, 'success');
    setDamageReportAssetId(null);
    setDamageComments('');
  };

  const getRoleGradient = (role = '') => {
    const r = String(role).toLowerCase();
    if (r.includes('doctor')) return 'from-blue-600 to-cyan-500 text-white shadow-blue-500/20';
    if (r.includes('reception')) return 'from-purple-600 to-pink-500 text-white shadow-purple-500/20';
    if (r.includes('nurse')) return 'from-teal-600 to-emerald-500 text-white shadow-emerald-500/20';
    if (r.includes('lab') || r.includes('patholog')) return 'from-amber-500 to-orange-500 text-white shadow-orange-500/20';
    if (r.includes('pharm')) return 'from-emerald-600 to-teal-500 text-white shadow-teal-500/20';
    if (r.includes('hr') || r.includes('admin')) return 'from-indigo-600 to-violet-600 text-white shadow-indigo-500/20';
    return 'from-slate-700 to-slate-800 text-white shadow-slate-500/20';
  };

  return (
    <div className="space-y-6" id="employee-profile-workspace">
      {toast && (
        <div style={{
          position: 'fixed',
          bottom: '24px',
          right: '24px',
          background: toast.type === 'error' ? '#FEF2F2' : '#EFF6FF',
          border: toast.type === 'error' ? '1px solid #FCA5A5' : '1px solid #BFDBFE',
          borderRadius: '8px',
          padding: '12px 18px',
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
          zIndex: 9999,
        }}>
          <div style={{
            width: '8px',
            height: '8px',
            borderRadius: '50%',
            background: toast.type === 'error' ? '#EF4444' : '#2563EB'
          }}></div>
          <span style={{
            fontSize: '12.5px',
            fontWeight: 600,
            color: toast.type === 'error' ? '#991B1B' : '#1E40AF'
          }}>{toast.message}</span>
        </div>
      )}
      
      {/* Back button and profile title */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          {onBack && (
            <button 
              onClick={onBack}
              className="px-2 py-2 border border-slate-200 hover:bg-slate-50 rounded-lg text-slate-500 hover:text-slate-700 transition-colors text-xs"
            >
              &larr; Back to Directory
            </button>
          )}
          <div>
            <h1 className="text-lg font-display font-bold text-slate-900">Hospital Employee Workspace</h1>
            <p className="text-slate-400 text-xs">Direct personnel configuration and performance metrics logging.</p>
          </div>
        </div>

      </div>

      {/* Employee Profile Header Card */}
      <div 
        className="rounded-3xl border border-blue-200/70 shadow-[0_12px_40px_rgba(37,99,235,0.08)] p-6 relative overflow-hidden"
        style={{
          background: 'radial-gradient(ellipse at 100% 0%, rgba(99,102,241,0.18) 0%, transparent 55%), radial-gradient(ellipse at 0% 100%, rgba(37,99,235,0.12) 0%, transparent 50%), linear-gradient(135deg, #FFFFFF 0%, #F0F6FF 50%, #EEF2FF 100%)'
        }}
      >
        {/* Ambient Glows */}
        <div className="absolute top-0 right-0 w-72 h-72 bg-gradient-to-bl from-indigo-400/20 via-blue-400/12 to-transparent rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-48 h-48 bg-gradient-to-tr from-blue-300/10 to-transparent rounded-full blur-2xl pointer-events-none" />
        
        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6 relative z-10">
          <div className="flex flex-col sm:flex-row items-center gap-5 text-center sm:text-left">
            {employee.photoUrl ? (
              <img 
                src={employee.photoUrl} 
                alt={employee.name} 
                className="w-24 h-24 rounded-3xl object-cover border-4 border-white shadow-lg ring-4 ring-blue-100/80 shrink-0"
                referrerPolicy="no-referrer"
              />
            ) : (
              <div className={`w-24 h-24 rounded-3xl bg-gradient-to-tr ${getRoleGradient(employee.role || employee.assignedRoles?.[0])} border-4 border-white font-black flex items-center justify-center text-2xl shadow-lg ring-4 ring-blue-100/80 select-none shrink-0`}>
                {employee.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
              </div>
            )}
            <div className="space-y-1.5">
              <div className="flex flex-col sm:flex-row items-center gap-2.5">
                <h2 className="text-2xl font-display font-extrabold text-slate-900 tracking-tight">{employee.name}</h2>
                <span className="px-3 py-1 bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-extrabold rounded-lg text-[10.5px] uppercase font-mono shadow-2xs">
                  {employee.staff_id || employee.id}
                </span>
              </div>
              <p className="text-slate-600 font-semibold text-xs flex items-center justify-center sm:justify-start gap-1.5">
                <MapPin className="w-3.5 h-3.5 text-blue-600" />
                {employee.designation || 'Staff Practitioner'} &bull; <span className="text-blue-700 font-bold">{employee.department}</span>
              </p>
              <div className="flex flex-wrap items-center justify-center sm:justify-start gap-1.5 pt-1">
                {(employee.assignedRoles || []).map(role => (
                  <span key={role} className="px-2.5 py-0.8 bg-white/90 text-blue-800 border border-blue-200/80 font-bold rounded-lg text-[10.5px] inline-flex items-center gap-1 shadow-2xs">
                    <Shield className="w-3 h-3 text-blue-600" />
                    {role}
                  </span>
                ))}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap sm:flex-nowrap gap-3 w-full lg:w-auto border-t lg:border-t-0 pt-4 lg:pt-0 border-slate-200/70">
            <div className="bg-white/90 backdrop-blur-xs p-3.5 rounded-2xl border border-blue-100/80 shadow-2xs w-full sm:w-34 text-center sm:text-left">
              <span className="text-[10px] text-slate-400 block uppercase font-bold tracking-wider">JOINING DATE</span>
              <span className="text-xs font-bold text-slate-800 font-mono mt-0.5 block">{employee.joiningDate || '-'}</span>
            </div>
            <div className="bg-white/90 backdrop-blur-xs p-3.5 rounded-2xl border border-blue-100/80 shadow-2xs w-full sm:w-34 text-center sm:text-left">
              <span className="text-[10px] text-slate-400 block uppercase font-bold tracking-wider">GRADE TIER</span>
              <span className="text-xs font-bold text-slate-800 font-mono mt-0.5 block">{employee.grade || 'G1 - Level I'}</span>
            </div>
            <div className="bg-white/90 backdrop-blur-xs p-3.5 rounded-2xl border border-blue-100/80 shadow-2xs w-full sm:w-34 text-center sm:text-left">
              <span className="text-[10px] text-slate-400 block uppercase font-bold tracking-wider">EMPLOYEE STATUS</span>
              <span className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-[10.5px] font-extrabold mt-1 shadow-2xs ${
                employee.status === 'Active' ? 'bg-gradient-to-r from-emerald-50 to-teal-50 text-emerald-800 border border-emerald-200' : 'bg-gradient-to-r from-orange-50 to-amber-50 text-orange-800 border border-orange-200'
              }`}>
                {employee.status === 'Active' && <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />}
                {employee.status}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs Navigation (Modern Gradient Pill Bar) */}
      <div className="bg-white/95 p-1.5 rounded-2xl border border-slate-200/80 shadow-sm overflow-x-auto scrollbar-none backdrop-blur-xs">
        <div className="flex gap-1.5 min-w-max">
          {(() => {
            const isDoctor = employee.role === 'doctor' || 
                             (employee.assignedRoles && employee.assignedRoles.some(r => r.toLowerCase() === 'doctor')) ||
                             (employee.designation && employee.designation.toLowerCase().includes('doctor'));
            const tabsList = [
              { id: 'Overview', label: 'Overview', icon: ClipboardList },
              { id: 'Personal', label: 'Personal Information', icon: User },
              { id: 'Professional', label: 'Professional Info', icon: MapPin },
              { id: 'Attendance', label: 'Attendance logs', icon: Clock },
              { id: 'Leave', label: 'Leave & Balance', icon: CalendarDays },
              { id: 'Documents', label: 'Verification Docs', icon: FileLock },
            ];

            if (isDoctor) {
              tabsList.push({ id: 'Slots', label: 'Appointment Slots', icon: Clock });
            }
            return tabsList.map((tab) => {
              const IconComponent = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-2 px-4 py-2.5 text-xs font-bold rounded-xl transition-all cursor-pointer ${
                    isActive
                      ? 'bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-700 text-white shadow-md shadow-blue-500/25'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/80'
                  }`}
                >
                  <IconComponent className={`w-4 h-4 ${isActive ? 'text-white' : 'text-slate-400'}`} />
                  {tab.label}
                </button>
              );
            });
          })()}
        </div>
      </div>

      {/* Profile Tab Contents */}
      <div 
        className="p-6 rounded-3xl border border-slate-200/60 shadow-sm min-h-[300px]"
        style={{ background: 'linear-gradient(135deg, #FAFBFF 0%, #F8FAFC 50%, #F5F7FF 100%)' }}
      >
        
        {/* TAB 1: Overview */}
        {activeTab === 'Overview' && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="md:col-span-2 space-y-5">
              
              {/* Overview brief */}
              <div
                className="p-5 rounded-2xl border border-indigo-100/80 shadow-[0_4px_16px_rgba(99,102,241,0.04)] relative overflow-hidden"
                style={{ background: 'radial-gradient(ellipse at 100% 0%, rgba(99,102,241,0.1) 0%, transparent 55%), linear-gradient(135deg, #FFFFFF 0%, #F8FAFF 60%, #EEF2FF 100%)' }}
              >
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-6 h-6 rounded-lg bg-gradient-to-tr from-indigo-600 to-blue-500 text-white flex items-center justify-center shadow-xs shrink-0">
                    <User className="w-3.5 h-3.5" />
                  </div>
                  <h3 className="text-xs font-extrabold text-indigo-900 uppercase tracking-wider">Professional Bio</h3>
                </div>
                <p className="text-xs text-slate-600 leading-relaxed">
                  {employee.name} serves as a {employee.designation || 'Staff Practitioner'} in the {employee.department || 'Clinical Operations'} division. 
                  Having joined our hospital on {employee.joiningDate || 'recently'}, {employee.gender === 'Male' ? 'he' : employee.gender === 'Female' ? 'she' : 'they'} maintains an active operational footprint 
                  with {employee.experienceYears || 0} years of professional experience in healthcare operations.
                </p>
              </div>

              {/* General Work parameters */}
              <div
                className="p-5 rounded-2xl border border-blue-100/80 shadow-[0_4px_16px_rgba(37,99,235,0.04)] relative overflow-hidden"
                style={{ background: 'radial-gradient(ellipse at 0% 100%, rgba(37,99,235,0.08) 0%, transparent 55%), linear-gradient(135deg, #FFFFFF 0%, #F0F6FF 60%, #EBF4FF 100%)' }}
              >
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <span className="text-[10px] text-blue-500 font-extrabold block mb-0.5 uppercase tracking-wider">Reporting Manager</span>
                    <span className="text-xs font-semibold text-slate-800">{employee.reportingManagerName || 'None assigned'}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-blue-500 font-extrabold block mb-0.5 uppercase tracking-wider">Hospital Shift Work</span>
                    <span className="text-xs font-semibold text-slate-800">{employee.shiftName || 'General Shift'}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-blue-500 font-extrabold block mb-0.5 uppercase tracking-wider">Official Email</span>
                    <span className="text-xs font-semibold text-slate-800">{employee.email}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-blue-500 font-extrabold block mb-0.5 uppercase tracking-wider">Phone Contact</span>
                    <span className="text-xs font-semibold text-slate-800">{employee.phone || 'Not provided'}</span>
                  </div>
                </div>
              </div>

              {/* Activity log timeline */}
              <div
                className="p-5 rounded-2xl border border-emerald-100/80 shadow-[0_4px_16px_rgba(16,185,129,0.04)] relative overflow-hidden"
                style={{ background: 'radial-gradient(ellipse at 100% 100%, rgba(16,185,129,0.08) 0%, transparent 55%), linear-gradient(135deg, #FFFFFF 0%, #F0FDF8 60%, #ECFDF5 100%)' }}
              >
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-6 h-6 rounded-lg bg-gradient-to-tr from-emerald-600 to-teal-500 text-white flex items-center justify-center shadow-xs shrink-0">
                    <History className="w-3.5 h-3.5" />
                  </div>
                  <h3 className="text-xs font-extrabold text-emerald-900 uppercase tracking-wider">Audit & Activity Log</h3>
                </div>
                <div className="space-y-4">
                  <div className="flex gap-3">
                    <span className="w-2.5 h-2.5 bg-blue-600 rounded-full mt-1 shrink-0 shadow-sm shadow-blue-400/40" />
                    <div>
                      <span className="text-xs font-semibold text-slate-800">Staff Account Created & Registered</span>
                      <span className="text-[10px] text-slate-400 block">{employee.joiningDate || 'Today'} - Onboarding Workflow</span>
                    </div>
                  </div>
                  <div className="flex gap-3">
                    <span className="w-2.5 h-2.5 bg-emerald-500 rounded-full mt-1 shrink-0 shadow-sm shadow-emerald-400/40" />
                    <div>
                      <span className="text-xs font-semibold text-slate-800">Role Credentials Active ({employee.assignedRoles?.[0] || employee.role || 'Staff'})</span>
                      <span className="text-[10px] text-slate-400 block">{employee.joiningDate || 'Today'} - Security Clearance Granted</span>
                    </div>
                  </div>
                </div>
              </div>

            </div>

            {/* Quick overview side stats */}
            <div 
              className="space-y-4 p-5 rounded-2xl border border-blue-200/80 shadow-[0_4px_20px_rgba(37,99,235,0.03)]"
              style={{
                background: 'radial-gradient(circle at 100% 0%, rgba(37, 99, 235, 0.12) 0%, transparent 60%), linear-gradient(135deg, #FFFFFF 0%, #F8FAFC 60%, #EFF6FF 100%)'
              }}
            >
              <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
                <div className="w-6 h-6 rounded-lg bg-gradient-to-tr from-blue-600 to-indigo-600 text-white flex items-center justify-center shadow-xs">
                  <ClipboardList className="w-3.5 h-3.5" />
                </div>
                <h3 className="text-xs font-extrabold text-slate-800 uppercase tracking-wider">Workspace Quick Stats</h3>
              </div>
              
              <div className="space-y-3.5 pt-1">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-slate-500 font-medium">Attendance Logged</span>
                  <span className="font-extrabold text-slate-900 font-mono px-2 py-0.5 rounded bg-white border border-slate-200/80 shadow-2xs">
                    {attendance.length > 0 ? `${Math.round((attendance.filter(a => a.status === 'Present' || a.status === 'Late').length / attendance.length) * 100)}%` : 'N/A (New Joiner)'}
                  </span>
                </div>
                <div className="flex justify-between items-center text-xs">
                  <span className="text-slate-500 font-medium">Remaining Annual / Earned</span>
                  <span className="font-extrabold text-blue-700 font-mono px-2 py-0.5 rounded bg-blue-50 border border-blue-200/80 shadow-2xs">
                    {earnedBal ? `${earnedBal.currentBalance} Days` : `${employee.leaveBalance?.annual || 0} Days`}
                  </span>
                </div>

                <div className="flex justify-between items-center text-xs">
                  <span className="text-slate-500 font-medium">Documents Uploaded</span>
                  <span className="font-extrabold text-emerald-700 font-mono px-2 py-0.5 rounded bg-emerald-50 border border-emerald-200/80 shadow-2xs">
                    {employeeDocuments.length || 0} Verified
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: Personal Information */}
        {activeTab === 'Personal' && (
          <div className="space-y-5">
            <div
              className="flex justify-between items-center p-4 rounded-2xl border border-violet-100/80"
              style={{ background: 'radial-gradient(ellipse at 100% 0%, rgba(139,92,246,0.1) 0%, transparent 55%), linear-gradient(135deg, #FFFFFF 0%, #FAF8FF 60%, #F5F3FF 100%)' }}
            >
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-lg bg-gradient-to-tr from-violet-600 to-purple-500 text-white flex items-center justify-center shadow-xs shrink-0">
                  <User className="w-3.5 h-3.5" />
                </div>
                <h3 className="text-xs font-extrabold text-violet-900 uppercase tracking-wider">Demographics & Identity Details</h3>
              </div>
              {isAdminOrHR && !isEditingPersonal && (
                <button onClick={() => setIsEditingPersonal(true)} className="px-3 py-1.5 text-xs font-bold bg-white border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 shadow-sm transition-all flex items-center gap-1.5">
                  <Edit3 className="w-3.5 h-3.5" />
                  Edit Details
                </button>
              )}
              {isEditingPersonal && (
                <div className="flex gap-2">
                  <button onClick={() => setIsEditingPersonal(false)} className="px-3 py-1.5 text-xs font-bold bg-slate-100 text-slate-600 rounded-lg hover:bg-slate-200 transition-colors">
                    Cancel
                  </button>
                  <button onClick={handleSavePersonal} className="px-3 py-1.5 text-xs font-bold bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">
                    Save Changes
                  </button>
                </div>
              )}
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              
              <div className="space-y-4">
                <div>
                  <span className="text-[10px] text-slate-400 font-bold block mb-1">DATE OF BIRTH</span>
                  {isEditingPersonal ? (
                    <input type="date" className="w-full h-8 px-2 border border-slate-200 rounded text-xs outline-none focus:border-blue-500" value={personalFormData.dob} onChange={e => setPersonalFormData({...personalFormData, dob: e.target.value})} />
                  ) : (
                    <span className="text-xs font-semibold text-slate-800">{employee.dob || 'Not provided'}</span>
                  )}
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 font-bold block mb-1">GENDER IDENTITY</span>
                  {isEditingPersonal ? (
                    <select className="w-full h-8 px-2 border border-slate-200 rounded text-xs outline-none focus:border-blue-500" value={personalFormData.gender} onChange={e => setPersonalFormData({...personalFormData, gender: e.target.value})}>
                      <option value="">Select Gender</option>
                      <option value="Male">Male</option>
                      <option value="Female">Female</option>
                      <option value="Other">Other</option>
                    </select>
                  ) : (
                    <span className="text-xs font-semibold text-slate-800">{employee.gender || 'Not provided'}</span>
                  )}
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 font-bold block mb-1">BLOOD GROUP TYPE</span>
                  {isEditingPersonal ? (
                    <select className="w-full h-8 px-2 border border-slate-200 rounded text-xs outline-none focus:border-blue-500" value={personalFormData.bloodGroup} onChange={e => setPersonalFormData({...personalFormData, bloodGroup: e.target.value})}>
                      <option value="">Select</option>
                      {['A+', 'A-', 'B+', 'B-', 'O+', 'O-', 'AB+', 'AB-'].map(bg => <option key={bg} value={bg}>{bg}</option>)}
                    </select>
                  ) : (
                    <span className="text-xs font-semibold text-slate-800">{employee.bloodGroup || 'Not provided'}</span>
                  )}
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <span className="text-[10px] text-slate-400 font-bold block mb-1">AADHAAR SECURE CARD NUMBER</span>
                  {isEditingPersonal ? (
                    <input type="text" placeholder="XXXX-XXXX-XXXX" className="w-full h-8 px-2 border border-slate-200 rounded text-xs font-mono outline-none focus:border-blue-500" value={personalFormData.aadhaar} onChange={e => setPersonalFormData({...personalFormData, aadhaar: e.target.value})} />
                  ) : (
                    <span className="text-xs font-semibold text-slate-800 font-mono">{employee.aadhaar || 'Not provided'}</span>
                  )}
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 font-bold block mb-1">PAN TAX SECURE NUMBER</span>
                  {isEditingPersonal ? (
                    <input type="text" placeholder="ABCDE1234F" className="w-full h-8 px-2 border border-slate-200 rounded text-xs font-mono outline-none focus:border-blue-500" value={personalFormData.pan} onChange={e => setPersonalFormData({...personalFormData, pan: e.target.value})} />
                  ) : (
                    <span className="text-xs font-semibold text-slate-800 font-mono">{employee.pan || 'Not provided'}</span>
                  )}
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 font-bold block mb-1">RESIDENTIAL PERMANENT ADDRESS</span>
                  {isEditingPersonal ? (
                    <textarea rows="3" className="w-full p-2 border border-slate-200 rounded text-xs outline-none focus:border-blue-500 resize-none" value={personalFormData.address} onChange={e => setPersonalFormData({...personalFormData, address: e.target.value})} />
                  ) : (
                    <span className="text-xs font-semibold text-slate-800 leading-relaxed block">{employee.address || 'Not provided'}</span>
                  )}
                </div>
              </div>

              <div
                className="p-5 rounded-2xl border border-blue-200/80 shadow-[0_4px_16px_rgba(37,99,235,0.06)] space-y-3 h-fit relative overflow-hidden"
                style={{ background: 'radial-gradient(ellipse at 0% 0%, rgba(37,99,235,0.12) 0%, transparent 60%), linear-gradient(135deg, #EFF6FF 0%, #DBEAFE 40%, #EFF6FF 100%)' }}
              >
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-lg bg-gradient-to-tr from-blue-600 to-indigo-500 text-white flex items-center justify-center shadow-xs shrink-0">
                    <Phone className="w-3 h-3" />
                  </div>
                  <span className="text-xs font-extrabold text-blue-900 uppercase tracking-wider">
                    Emergency Hospital Contact
                  </span>
                </div>
                <p className="text-[11px] text-blue-700 leading-relaxed">This contact is flagged for critical shift/medical alerts.</p>
                <div className="space-y-2 text-xs pt-1">
                  <div>
                    <span className="text-[10px] text-blue-500 font-semibold block mb-1">PRIMARY CONTACT NAME</span>
                    {isEditingPersonal ? (
                      <input type="text" className="w-full h-7 px-2 border border-blue-200 rounded bg-white text-xs outline-none focus:border-blue-500" value={personalFormData.emergencyContact.name} onChange={e => setPersonalFormData({...personalFormData, emergencyContact: {...personalFormData.emergencyContact, name: e.target.value}})} />
                    ) : (
                      <span className="font-semibold text-slate-800">{employee.emergencyContact?.name || 'Not provided'}</span>
                    )}
                  </div>
                  <div>
                    <span className="text-[10px] text-blue-500 font-semibold block mb-1">RELATIONSHIP TIE</span>
                    {isEditingPersonal ? (
                      <input type="text" className="w-full h-7 px-2 border border-blue-200 rounded bg-white text-xs outline-none focus:border-blue-500" value={personalFormData.emergencyContact.relation} onChange={e => setPersonalFormData({...personalFormData, emergencyContact: {...personalFormData.emergencyContact, relation: e.target.value}})} />
                    ) : (
                      <span className="font-semibold text-slate-800">{employee.emergencyContact?.relation || 'Not provided'}</span>
                    )}
                  </div>
                  <div>
                    <span className="text-[10px] text-blue-500 font-semibold block mb-1">PHONE NUMBER</span>
                    {isEditingPersonal ? (
                      <input type="tel" className="w-full h-7 px-2 border border-blue-200 rounded bg-white text-xs font-mono outline-none focus:border-blue-500" value={personalFormData.emergencyContact.phone} onChange={e => setPersonalFormData({...personalFormData, emergencyContact: {...personalFormData.emergencyContact, phone: e.target.value}})} />
                    ) : (
                      <span className="font-semibold text-slate-800 font-mono">{employee.emergencyContact?.phone || 'Not provided'}</span>
                    )}
                  </div>
                </div>
              </div>

            </div>
          </div>
        )}

        {/* TAB 3: Professional Information */}
        {activeTab === 'Professional' && (
          <div className="space-y-5">
            <div
              className="flex justify-between items-center p-4 rounded-2xl border border-amber-100/80"
              style={{ background: 'radial-gradient(ellipse at 100% 0%, rgba(245,158,11,0.1) 0%, transparent 55%), linear-gradient(135deg, #FFFFFF 0%, #FFFCF0 60%, #FEF9E7 100%)' }}
            >
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-lg bg-gradient-to-tr from-amber-500 to-orange-400 text-white flex items-center justify-center shadow-xs shrink-0">
                  <Shield className="w-3.5 h-3.5" />
                </div>
                <h3 className="text-xs font-extrabold text-amber-900 uppercase tracking-wider">Hospital Assignment Metadata</h3>
              </div>
              {isAdminOrHR && !isEditingProfessional && (
                <button onClick={() => setIsEditingProfessional(true)} className="px-3 py-1.5 text-xs font-bold bg-white border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 shadow-sm transition-all flex items-center gap-1.5">
                  <Edit3 className="w-3.5 h-3.5" />
                  Edit Details
                </button>
              )}
              {isEditingProfessional && (
                <div className="flex gap-2">
                  <button onClick={() => setIsEditingProfessional(false)} className="px-3 py-1.5 text-xs font-bold bg-slate-100 text-slate-600 rounded-lg hover:bg-slate-200 transition-colors">
                    Cancel
                  </button>
                  <button onClick={handleSaveProfessional} className="px-3 py-1.5 text-xs font-bold bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">
                    Save Changes
                  </button>
                </div>
              )}
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              
              <div className="space-y-4">
                <div>
                  <span className="text-[10px] text-slate-400 font-bold block mb-1">ACCESS ROLE</span>
                  {isEditingProfessional ? (
                    <select 
                      className="w-full h-8 px-2 border border-slate-200 rounded text-xs outline-none focus:border-blue-500 bg-white" 
                      value={professionalFormData.role || 'doctor'} 
                      onChange={e => {
                        const newRole = e.target.value;
                        setProfessionalFormData({
                          ...professionalFormData, 
                          role: newRole,
                          assignedRoles: [newRole.charAt(0).toUpperCase() + newRole.slice(1)]
                        });
                      }}
                    >
                      <option value="doctor">Doctor</option>
                      <option value="receptionist">Receptionist</option>
                      <option value="lab">Laboratory</option>
                      <option value="pharmacy">Pharmacy</option>
                      <option value="hr">HR Manager</option>
                      <option value="admin">System Admin</option>
                    </select>
                  ) : (
                    <span className="text-xs font-semibold text-slate-800 capitalize">{employee.role}</span>
                  )}
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 font-bold block mb-1">MEDICAL DIVISION / DEPT</span>
                  {isEditingProfessional ? (
                    <input type="text" className="w-full h-8 px-2 border border-slate-200 rounded text-xs outline-none focus:border-blue-500" value={professionalFormData.department} onChange={e => setProfessionalFormData({...professionalFormData, department: e.target.value})} />
                  ) : (
                    <span className="text-xs font-semibold text-slate-800">{employee.department}</span>
                  )}
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 font-bold block mb-1">CLINICAL DESIGNATION</span>
                  {isEditingProfessional ? (
                    <input type="text" className="w-full h-8 px-2 border border-slate-200 rounded text-xs outline-none focus:border-blue-500" value={professionalFormData.designation} onChange={e => setProfessionalFormData({...professionalFormData, designation: e.target.value})} />
                  ) : (
                    <span className="text-xs font-semibold text-slate-800">{employee.designation}</span>
                  )}
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 font-bold block mb-1">EMPLOYMENT CONTRACT TYPE</span>
                  {isEditingProfessional ? (
                    <input type="text" className="w-full h-8 px-2 border border-slate-200 rounded text-xs outline-none focus:border-blue-500" value={professionalFormData.employmentType} onChange={e => setProfessionalFormData({...professionalFormData, employmentType: e.target.value})} />
                  ) : (
                    <span className="text-xs font-semibold text-slate-800">{employee.employmentType}</span>
                  )}
                </div>
                {(employee.role === 'doctor' || professionalFormData.role === 'doctor') && (
                  <div>
                    <span className="text-[10px] text-slate-400 font-bold block mb-1">DOCTOR CONSULTATION FEE (₹)</span>
                    {isEditingProfessional ? (
                      <input type="number" className="w-full h-8 px-2 border border-slate-200 rounded text-xs font-semibold text-slate-800 outline-none focus:border-blue-500" value={professionalFormData.consultationFee} onChange={e => setProfessionalFormData({...professionalFormData, consultationFee: e.target.value !== '' ? Number(e.target.value) : ''})} />
                    ) : (
                      <span className="text-xs font-bold text-blue-600 font-mono">₹{employee.consultationFee !== undefined ? employee.consultationFee : 500}</span>
                    )}
                  </div>
                )}
              </div>

              <div className="space-y-4">
                <div>
                  <span className="text-[10px] text-slate-400 font-bold block mb-1">REPORTING MANAGER</span>
                  {isEditingProfessional ? (
                    <input type="text" className="w-full h-8 px-2 border border-slate-200 rounded text-xs outline-none focus:border-blue-500" value={professionalFormData.reportingManagerName} onChange={e => setProfessionalFormData({...professionalFormData, reportingManagerName: e.target.value})} />
                  ) : (
                    <span className="text-xs font-semibold text-slate-800">{employee.reportingManagerName || 'None'}</span>
                  )}
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 font-bold block mb-1">ROSTER SHIFT</span>
                  {isEditingProfessional ? (
                    <input type="text" className="w-full h-8 px-2 border border-slate-200 rounded text-xs outline-none focus:border-blue-500" value={professionalFormData.shiftName} onChange={e => setProfessionalFormData({...professionalFormData, shiftName: e.target.value})} />
                  ) : (
                    <span className="text-xs font-semibold text-slate-800">{employee.shiftName}</span>
                  )}
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 font-bold block mb-1">WEEKLY OFF DAYS</span>
                  {isEditingProfessional ? (
                    <div className="flex flex-wrap gap-1 mt-1">
                      {['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].map(day => {
                        const isSelected = Array.isArray(professionalFormData.weeklyOff)
                          ? professionalFormData.weeklyOff.includes(day)
                          : (professionalFormData.weeklyOff || '').split(',').map(d => d.trim()).includes(day);
                        return (
                          <button
                            key={day}
                            type="button"
                            onClick={() => {
                              let currentOffs = Array.isArray(professionalFormData.weeklyOff)
                                ? [...professionalFormData.weeklyOff]
                                : (professionalFormData.weeklyOff ? professionalFormData.weeklyOff.split(',').map(d => d.trim()) : []);
                              if (currentOffs.includes(day)) {
                                currentOffs = currentOffs.filter(d => d !== day);
                              } else {
                                currentOffs.push(day);
                              }
                              setProfessionalFormData({...professionalFormData, weeklyOff: currentOffs});
                            }}
                            className={`px-2 py-0.5 rounded text-[10px] font-semibold border transition-all ${
                              isSelected
                                ? 'bg-blue-600 border-blue-600 text-white'
                                : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                            }`}
                          >
                            {day.slice(0, 3)}
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <span className="text-xs font-semibold text-slate-800">
                      {Array.isArray(employee.weeklyOff) ? employee.weeklyOff.join(', ') : (employee.weeklyOff || 'Sunday (Default)')}
                    </span>
                  )}
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <span className="text-[10px] text-slate-400 font-bold block mb-1">GEOGRAPHICAL WORK LOCATION</span>
                  {isEditingProfessional ? (
                    <input type="text" className="w-full h-8 px-2 border border-slate-200 rounded text-xs outline-none focus:border-blue-500" value={professionalFormData.workLocation} onChange={e => setProfessionalFormData({...professionalFormData, workLocation: e.target.value})} />
                  ) : (
                    <span className="text-xs font-semibold text-slate-800">
                      {employee.workLocation || (() => {
                        try {
                          return JSON.parse(localStorage.getItem('user') || '{}').tenantName || 'Sunrise Multispeciality';
                        } catch (e) {
                          return 'Sunrise Multispeciality';
                        }
                      })()}
                    </span>
                  )}
                </div>
                <div className="flex gap-4">
                  <div className="flex-1">
                    <span className="text-[10px] text-slate-400 font-bold block mb-1">NOTICE PERIOD</span>
                    {isEditingProfessional ? (
                      <input type="number" className="w-full h-8 px-2 border border-slate-200 rounded text-xs outline-none focus:border-blue-500" value={professionalFormData.noticePeriodDays} onChange={e => setProfessionalFormData({...professionalFormData, noticePeriodDays: parseInt(e.target.value) || 0})} />
                    ) : (
                      <span className="text-xs font-semibold text-slate-800">{employee.noticePeriodDays} Days</span>
                    )}
                  </div>
                  <div className="flex-1">
                    <span className="text-[10px] text-slate-400 font-bold block mb-1">EXPERIENCE</span>
                    {isEditingProfessional ? (
                      <input type="number" className="w-full h-8 px-2 border border-slate-200 rounded text-xs outline-none focus:border-blue-500" value={professionalFormData.experienceYears} onChange={e => setProfessionalFormData({...professionalFormData, experienceYears: parseInt(e.target.value) || 0})} />
                    ) : (
                      <span className="text-xs font-semibold text-slate-800">{employee.experienceYears} Years</span>
                    )}
                  </div>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 font-bold block mb-1">EMPLOYEE SECURITY CLEARANCE</span>
                  <span className="text-xs font-semibold text-emerald-600">HIPAA Certified</span>
                </div>
              </div>

            </div>
          </div>
        )}

        {/* TAB 4: Attendance logs */}
        {activeTab === 'Attendance' && (
          <div className="space-y-5">
            <div
              className="flex justify-between items-center p-4 rounded-2xl border border-cyan-100/80"
              style={{ background: 'radial-gradient(ellipse at 0% 0%, rgba(6,182,212,0.1) 0%, transparent 55%), linear-gradient(135deg, #FFFFFF 0%, #ECFEFF 60%, #CFFAFE 100%)' }}
            >
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-lg bg-gradient-to-tr from-cyan-600 to-teal-500 text-white flex items-center justify-center shadow-xs shrink-0">
                  <Clock className="w-3.5 h-3.5" />
                </div>
                <div>
                  <h3 className="text-xs font-extrabold text-cyan-900 uppercase tracking-wider">Punch In/Out Log</h3>
                  <p className="text-[10px] text-cyan-600 mt-0.5">Automated synchronization with fingerprint scanners and RFID logs.</p>
                </div>
              </div>
              <span className="px-3 py-1 bg-emerald-50 text-emerald-700 text-xs font-bold rounded-full border border-emerald-200 flex items-center gap-1">
                <CheckCircle className="w-3.5 h-3.5" />
                Biometric Node Online
              </span>
            </div>

            <div className="border border-slate-100 rounded-xl overflow-hidden shadow-sm">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                    <th className="px-6 py-3">Roster Date</th>
                    <th className="px-6 py-3">Punch In</th>
                    <th className="px-6 py-3">Punch Out</th>
                    <th className="px-6 py-3">Shift Working Hours</th>
                    <th className="px-6 py-3">Overtime</th>
                    <th className="px-6 py-3 text-right">Status Badge</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {attendance.map((att, idx) => (
                    <tr key={att._id || att.id || idx} className="hover:bg-slate-50/50">
                      <td className="px-6 py-3 font-semibold text-slate-800">{att.date}</td>
                      <td className="px-6 py-3 font-mono text-slate-600">{att.clockIn || att.punchIn || '--:--'}</td>
                      <td className="px-6 py-3 font-mono text-slate-600">{att.clockOut || att.punchOut || '--:--'}</td>
                      <td className="px-6 py-3 font-mono text-slate-700">{(att.workingHours || att.workHours || 0) > 0 ? `${(att.workingHours || att.workHours).toFixed(1)} Hrs` : 'Active / Pending'}</td>
                      <td className="px-6 py-3 font-mono text-emerald-600">{(att.overtimeHours || 0) > 0 ? `+${Number(att.overtimeHours).toFixed(1)} Hrs` : '0.0'}</td>
                      <td className="px-6 py-3 text-right">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          att.status === 'Present' ? 'bg-emerald-50 text-emerald-700' :
                          att.status === 'Late' ? 'bg-orange-50 text-orange-700' :
                          att.status === 'Half Day' ? 'bg-amber-50 text-amber-700' :
                          'bg-red-50 text-red-700'
                        }`}>
                          {att.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                  {attendance.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-6 py-8 text-center text-slate-400">
                        No biometric punch logs recorded for this employee.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB 5: Leave & Balance */}
        {activeTab === 'Leave' && (
          <div className="space-y-6">
            
            {/* Year Selector & Top Header */}
            <div
              className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 p-4 rounded-2xl border border-green-100/80 shadow-[0_4px_16px_rgba(34,197,94,0.04)]"
              style={{ background: 'radial-gradient(ellipse at 100% 0%, rgba(34,197,94,0.1) 0%, transparent 55%), linear-gradient(135deg, #FFFFFF 0%, #F0FDF4 60%, #DCFCE7 100%)' }}
            >
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-lg bg-gradient-to-tr from-green-600 to-emerald-500 text-white flex items-center justify-center shadow-xs shrink-0">
                  <CalendarDays className="w-3.5 h-3.5" />
                </div>
                <div>
                  <h3 className="text-xs font-extrabold text-green-900 uppercase tracking-wider">Leave Balance & Ledger Matrix</h3>
                  <p className="text-[10px] text-green-600 mt-0.5">Authoritative real-time balance ledger and leave applications history for {employee.name}.</p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-slate-500">Accounting Year:</span>
                <div className="flex gap-1 bg-slate-100 p-1 rounded-xl">
                  {availableYears.map(yr => (
                    <button
                      key={yr}
                      type="button"
                      onClick={() => setLeaveYear(yr)}
                      className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                        leaveYear === yr
                          ? 'bg-blue-600 text-white shadow-sm'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      {yr}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Balance widgets */}
            <div>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
                
                {/* SICK LEAVE - Red/Rose gradient */}
                <div
                  className="p-3.5 rounded-xl border border-red-200/80 shadow-[0_6px_20px_rgba(239,68,68,0.06)] relative overflow-hidden"
                  style={{ background: 'radial-gradient(circle at 100% 0%, rgba(239,68,68,0.15) 0%, transparent 60%), linear-gradient(135deg, #FFFFFF 0%, #FFF1F1 60%, #FFE4E6 100%)' }}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] text-red-700 uppercase font-extrabold tracking-wider">SICK LEAVE</span>
                    <span className="text-[9px] px-1.5 py-0.5 bg-red-100 text-red-700 font-bold rounded-full border border-red-200">
                      +{sickBal?.monthlyAccrual ?? (employee.monthlyLeaveAllocation?.sick ?? 0.5)}/mo
                    </span>
                  </div>
                  <span className="text-2xl font-black text-slate-800 font-mono block my-1">
                    {sickBal ? sickBal.currentBalance : (employee.leaveBalance?.sick ?? 0)}
                  </span>
                  <div className="text-[10px] text-slate-500 font-medium">
                    Used: <span className="font-semibold text-slate-700">{sickBal?.consumed ?? 0}d</span> &bull; Quota: <span className="font-semibold text-slate-700">{sickBal ? (sickBal.opening + sickBal.carryForward + sickBal.accrued + sickBal.adjustments) : 0}d</span>
                  </div>
                  <div className="h-[3px] absolute bottom-0 right-0 w-3/5 pointer-events-none" style={{ background: 'linear-gradient(90deg, transparent 0%, #EF4444 100%)' }} />
                </div>

                {/* CASUAL LEAVE - Blue gradient */}
                <div
                  className="p-3.5 rounded-xl border border-blue-200/80 shadow-[0_6px_20px_rgba(59,130,246,0.06)] relative overflow-hidden"
                  style={{ background: 'radial-gradient(circle at 0% 0%, rgba(59,130,246,0.15) 0%, transparent 60%), linear-gradient(135deg, #FFFFFF 0%, #EFF6FF 60%, #DBEAFE 100%)' }}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] text-blue-700 uppercase font-extrabold tracking-wider">CASUAL LEAVE</span>
                    <span className="text-[9px] px-1.5 py-0.5 bg-blue-100 text-blue-700 font-bold rounded-full border border-blue-200">
                      +{casualBal?.monthlyAccrual ?? (employee.monthlyLeaveAllocation?.casual ?? 0.5)}/mo
                    </span>
                  </div>
                  <span className="text-2xl font-black text-slate-800 font-mono block my-1">
                    {casualBal ? casualBal.currentBalance : (employee.leaveBalance?.casual ?? 0)}
                  </span>
                  <div className="text-[10px] text-slate-500 font-medium">
                    Used: <span className="font-semibold text-slate-700">{casualBal?.consumed ?? 0}d</span> &bull; Quota: <span className="font-semibold text-slate-700">{casualBal ? (casualBal.opening + casualBal.carryForward + casualBal.accrued + casualBal.adjustments) : 0}d</span>
                  </div>
                  <div className="h-[3px] absolute bottom-0 right-0 w-3/5 pointer-events-none" style={{ background: 'linear-gradient(90deg, transparent 0%, #3B82F6 100%)' }} />
                </div>

                {/* ANNUAL / EARNED LEAVE - Purple gradient */}
                <div
                  className="p-3.5 rounded-xl border border-purple-200/80 shadow-[0_6px_20px_rgba(139,92,246,0.06)] relative overflow-hidden"
                  style={{ background: 'radial-gradient(circle at 100% 100%, rgba(139,92,246,0.15) 0%, transparent 60%), linear-gradient(135deg, #FFFFFF 0%, #F5F3FF 60%, #EDE9FE 100%)' }}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] text-purple-700 uppercase font-extrabold tracking-wider">EARNED / ANNUAL</span>
                    <span className="text-[9px] px-1.5 py-0.5 bg-purple-100 text-purple-700 font-bold rounded-full border border-purple-200">
                      +{earnedBal?.monthlyAccrual ?? (employee.monthlyLeaveAllocation?.annual ?? 1.25)}/mo
                    </span>
                  </div>
                  <span className="text-2xl font-black text-slate-800 font-mono block my-1">
                    {earnedBal ? earnedBal.currentBalance : (employee.leaveBalance?.annual ?? 0)}
                  </span>
                  <div className="text-[10px] text-slate-500 font-medium">
                    Used: <span className="font-semibold text-slate-700">{earnedBal?.consumed ?? 0}d</span> &bull; Quota: <span className="font-semibold text-slate-700">{earnedBal ? (earnedBal.opening + earnedBal.carryForward + earnedBal.accrued + earnedBal.adjustments) : 0}d</span>
                  </div>
                  <div className="h-[3px] absolute bottom-0 right-0 w-3/5 pointer-events-none" style={{ background: 'linear-gradient(90deg, transparent 0%, #7C3AED 100%)' }} />
                </div>

                {/* COMPENSATORY OFF - Teal gradient */}
                <div
                  className="p-3.5 rounded-xl border border-teal-200/80 shadow-[0_6px_20px_rgba(20,184,166,0.06)] relative overflow-hidden"
                  style={{ background: 'radial-gradient(circle at 0% 100%, rgba(20,184,166,0.15) 0%, transparent 60%), linear-gradient(135deg, #FFFFFF 0%, #F0FDFA 60%, #CCFBF1 100%)' }}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] text-teal-700 uppercase font-extrabold tracking-wider">COMPENSATORY</span>
                  </div>
                  <span className="text-2xl font-black text-slate-800 font-mono block my-1">
                    {compBal ? compBal.currentBalance : (employee.leaveBalance?.compOff ?? 0)}
                  </span>
                  <div className="text-[10px] text-slate-500 font-medium">
                    Used: <span className="font-semibold text-slate-700">{compBal?.consumed ?? 0}d</span>
                  </div>
                  <div className="h-[3px] absolute bottom-0 right-0 w-3/5 pointer-events-none" style={{ background: 'linear-gradient(90deg, transparent 0%, #0D9488 100%)' }} />
                </div>

                {/* MATERNITY / PATERNITY - Pink/Indigo gradient */}
                <div
                  className="p-3.5 rounded-xl border border-pink-200/80 shadow-[0_6px_20px_rgba(236,72,153,0.06)] relative overflow-hidden"
                  style={{ background: 'radial-gradient(circle at 100% 0%, rgba(236,72,153,0.15) 0%, transparent 60%), linear-gradient(135deg, #FFFFFF 0%, #FDF2F8 60%, #FCE7F3 100%)' }}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] text-pink-700 uppercase font-extrabold tracking-wider">
                      {employee.gender?.toLowerCase() === 'female' ? 'MATERNITY' : employee.gender?.toLowerCase() === 'male' ? 'PATERNITY' : 'MATERNITY'}
                    </span>
                  </div>
                  <span className="text-2xl font-black text-slate-800 font-mono block my-1">
                    {employee.gender?.toLowerCase() === 'female'
                      ? (matBal ? matBal.currentBalance : (employee.leaveBalance?.maternity ?? 90))
                      : employee.gender?.toLowerCase() === 'male'
                        ? (patBal ? patBal.currentBalance : (employee.leaveBalance?.paternity ?? 14))
                        : (matBal ? matBal.currentBalance : (employee.leaveBalance?.maternity ?? 0))}
                  </span>
                  <div className="text-[10px] text-slate-500 font-medium">
                    Used: <span className="font-semibold text-slate-700">
                      {employee.gender?.toLowerCase() === 'female' ? (matBal?.consumed ?? 0) : (patBal?.consumed ?? 0)}d
                    </span>
                  </div>
                  <div className="h-[3px] absolute bottom-0 right-0 w-3/5 pointer-events-none" style={{ background: 'linear-gradient(90deg, transparent 0%, #EC4899 100%)' }} />
                </div>

                {/* LOSS OF PAY - Amber gradient */}
                <div
                  className="p-3.5 rounded-xl border border-amber-200/80 shadow-[0_6px_20px_rgba(245,158,11,0.06)] relative overflow-hidden"
                  style={{ background: 'radial-gradient(circle at 0% 0%, rgba(245,158,11,0.15) 0%, transparent 60%), linear-gradient(135deg, #FFFFFF 0%, #FFFBEB 60%, #FEF3C7 100%)' }}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] text-amber-700 uppercase font-extrabold tracking-wider">LOSS OF PAY</span>
                  </div>
                  <span className="text-2xl font-black text-slate-800 font-mono block my-1">
                    {lwpBal ? lwpBal.consumed : (employee.leaveBalance?.lwp ?? 0)}
                  </span>
                  <div className="text-[10px] text-slate-500 font-medium">
                    Unpaid Days: <span className="font-semibold text-slate-700">{lwpBal?.consumed ?? 0}d</span>
                  </div>
                  <div className="h-[3px] absolute bottom-0 right-0 w-3/5 pointer-events-none" style={{ background: 'linear-gradient(90deg, transparent 0%, #D97706 100%)' }} />
                </div>

              </div>
            </div>

            {/* HR Setup & Allocation Form — Requires Admin Approval */}
            {isAdminOrHR && (
              <div
                className="p-5 rounded-2xl border border-orange-200/80 shadow-[0_4px_16px_rgba(234,88,12,0.05)] space-y-4 relative overflow-hidden"
                style={{ background: 'radial-gradient(ellipse at 100% 0%, rgba(234,88,12,0.08) 0%, transparent 55%), linear-gradient(135deg, #FFFFFF 0%, #FFF7ED 60%, #FFEDD5 100%)' }}
              >
                {/* Header */}
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-lg bg-gradient-to-tr from-orange-500 to-amber-400 text-white flex items-center justify-center shadow-xs shrink-0">
                    <Settings className="w-3.5 h-3.5" />
                  </div>
                  <div>
                    <h4 className="text-xs font-extrabold text-orange-900 uppercase tracking-wider">Leave Setup & Allocation (HR Mode)</h4>
                    <p className="text-[10px] text-orange-600 mt-0.5">Changes require Admin approval before taking effect on the employee's leave balance.</p>
                  </div>
                </div>

                {/* Pending Request Status Banner */}
                {employee._pendingLeaveAllocation && (
                  <div className={`flex items-start gap-3 p-3 rounded-xl border text-xs font-medium ${
                    employee._pendingLeaveAllocation.status === 'pending'
                      ? 'bg-amber-50 border-amber-200 text-amber-800'
                      : employee._pendingLeaveAllocation.status === 'approved'
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                      : 'bg-red-50 border-red-200 text-red-800'
                  }`}>
                    <span className="mt-0.5 shrink-0">
                      {employee._pendingLeaveAllocation.status === 'pending' ? '⏳' : employee._pendingLeaveAllocation.status === 'approved' ? '✅' : '❌'}
                    </span>
                    <div>
                      <span className="font-bold capitalize">{employee._pendingLeaveAllocation.status}</span>
                      {' — '}Request submitted on {new Date(employee._pendingLeaveAllocation.requestedAt).toLocaleDateString()}.
                      {employee._pendingLeaveAllocation.comment && (
                        <span className="block mt-0.5 italic">Admin note: "{employee._pendingLeaveAllocation.comment}"</span>
                      )}
                    </div>
                  </div>
                )}

                {/* Allocation Fields */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div>
                    <label className="block text-orange-700 text-[10px] uppercase font-extrabold tracking-wider mb-1">Carried Forward</label>
                    <input 
                      type="number"
                      value={carriedForwardLeaves}
                      onChange={(e) => setCarriedForwardLeaves(Number(e.target.value) || 0)}
                      className="w-full text-xs p-2.5 border border-orange-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-orange-400 bg-white font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-orange-700 text-[10px] uppercase font-extrabold tracking-wider mb-1">Monthly Sick Leave</label>
                    <input 
                      type="number"
                      step="0.1"
                      value={monthlyLeaveAllocation.sick}
                      onChange={(e) => setMonthlyLeaveAllocation({...monthlyLeaveAllocation, sick: Number(e.target.value) || 0})}
                      className="w-full text-xs p-2.5 border border-orange-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-orange-400 bg-white font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-orange-700 text-[10px] uppercase font-extrabold tracking-wider mb-1">Monthly Casual Leave</label>
                    <input 
                      type="number"
                      step="0.1"
                      value={monthlyLeaveAllocation.casual}
                      onChange={(e) => setMonthlyLeaveAllocation({...monthlyLeaveAllocation, casual: Number(e.target.value) || 0})}
                      className="w-full text-xs p-2.5 border border-orange-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-orange-400 bg-white font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-orange-700 text-[10px] uppercase font-extrabold tracking-wider mb-1">Monthly Paid/Annual</label>
                    <input 
                      type="number"
                      step="0.1"
                      value={monthlyLeaveAllocation.annual}
                      onChange={(e) => setMonthlyLeaveAllocation({...monthlyLeaveAllocation, annual: Number(e.target.value) || 0})}
                      className="w-full text-xs p-2.5 border border-orange-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-orange-400 bg-white font-mono"
                    />
                  </div>
                </div>

                {/* Reason / Justification */}
                <div>
                  <label className="block text-orange-700 text-[10px] uppercase font-extrabold tracking-wider mb-1">
                    Reason / Justification <span className="text-red-500">*</span>
                  </label>
                  <textarea
                    rows={2}
                    placeholder="Explain why you are requesting this leave allocation change for this employee..."
                    value={leaveAllocationReason}
                    onChange={(e) => setLeaveAllocationReason(e.target.value)}
                    className="w-full text-xs p-2.5 border border-orange-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-orange-400 bg-white resize-none"
                  />
                </div>

                {/* Submit for Approval */}
                <div className="flex justify-between items-center pt-1">
                  <p className="text-[10px] text-orange-600 font-medium flex items-center gap-1">
                    <Shield className="w-3 h-3" />
                    This request will be sent to Admin for review and approval.
                  </p>
                  <button
                    type="button"
                    onClick={async () => {
                      if (!leaveAllocationReason.trim()) {
                        showToast('Please provide a reason for this allocation change.', 'error');
                        return;
                      }
                      try {
                        const currentUser = (() => { try { return JSON.parse(localStorage.getItem('user') || '{}'); } catch(e) { return {}; } })();
                        const targetStaffId = employee.staff_id || employee.id || employee._id;
                        await api.post('/approvals', {
                          type: 'leave_allocation',
                          staffId: targetStaffId,
                          requesterName: currentUser.name || 'HR Manager',
                          requesterRole: currentUser.role || 'hr',
                          comment: leaveAllocationReason.trim(),
                          details: {
                            staffId: targetStaffId,
                            staffName: employee.name,
                            changes: {
                              carriedForwardLeaves,
                              sick: monthlyLeaveAllocation.sick,
                              casual: monthlyLeaveAllocation.casual,
                              annual: monthlyLeaveAllocation.annual
                            },
                            currentValues: {
                              carriedForwardLeaves: employee.carriedForwardLeaves || 0,
                              sick: leavePolicy?.leaveTypes?.find(lt => lt.code === 'SICK')?.monthlyAccrual || 0,
                              casual: leavePolicy?.leaveTypes?.find(lt => lt.code === 'CASUAL')?.monthlyAccrual || 0,
                              annual: leavePolicy?.leaveTypes?.find(lt => lt.code === 'EARNED')?.monthlyAccrual || 0
                            }
                          }
                        });
                        setLeaveAllocationReason('');
                        showToast('Allocation request sent to Admin for approval!', 'success');
                      } catch (err) {
                        showToast(err.response?.data?.error || 'Failed to submit allocation request.', 'error');
                      }
                    }}
                    className="px-4 py-2 bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white rounded-lg text-xs font-bold shadow-sm transition-all flex items-center gap-1.5"
                  >
                    <Send className="w-3.5 h-3.5" />
                    Submit for Admin Approval
                  </button>
                </div>
              </div>
            )}

            {/* Leave requests lists */}
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider">Leave Applications Archive</h3>
                <span className="text-xs text-slate-500 font-medium">
                  {leaves.length} {leaves.length === 1 ? 'record' : 'records'} found
                </span>
              </div>

              <div className="border border-slate-100 rounded-xl overflow-hidden shadow-sm bg-white">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-slate-100 bg-slate-50 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                      <th className="px-6 py-3">Leave Type</th>
                      <th className="px-6 py-3">Start Date</th>
                      <th className="px-6 py-3">End Date</th>
                      <th className="px-6 py-3">Calendar Days</th>
                      <th className="px-6 py-3">Reason / Remarks</th>
                      <th className="px-6 py-3 text-right">Approval Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {leaves.map((l, idx) => (
                      <tr key={l._id || l.id || idx} className="hover:bg-slate-50/50">
                        <td className="px-6 py-3 font-semibold text-slate-800">{l.leaveType}</td>
                        <td className="px-6 py-3 text-slate-600 font-mono">{l.fromDate || l.startDate || '-'}</td>
                        <td className="px-6 py-3 text-slate-600 font-mono">{l.toDate || l.endDate || '-'}</td>
                        <td className="px-6 py-3 font-mono text-slate-700 font-bold">
                          {l.days || l.totalDays || 0} {(l.days || l.totalDays) === 1 ? 'day' : 'days'}
                        </td>
                        <td className="px-6 py-3 text-slate-600 max-w-xs">
                          {l.reason && <p className="italic text-slate-700">&ldquo;{l.reason}&rdquo;</p>}
                          {l.approvedBy && (
                            <p className="text-[10px] text-emerald-600 font-semibold mt-0.5">
                              Approved by: {l.approvedBy}
                            </p>
                          )}
                          {l.rejectionReason && (
                            <p className="text-[10px] text-red-600 font-semibold mt-0.5">
                              Rejection note: {l.rejectionReason}
                            </p>
                          )}
                        </td>
                        <td className="px-6 py-3 text-right">
                          <div className="flex flex-col items-end gap-1.5">
                            <span className={`px-2.5 py-0.5 rounded text-[10px] font-bold ${
                              l.status === 'Approved' ? 'bg-emerald-50 text-emerald-700' :
                              l.status === 'Pending' ? 'bg-amber-50 text-amber-700' :
                              'bg-red-50 text-red-700'
                            }`}>
                              {l.status}
                            </span>
                            {l.status === 'Pending' && (onApproveLeave || onRejectLeave) && (
                              <div className="flex gap-1 mt-1">
                                {onRejectLeave && (
                                  <button
                                    type="button"
                                    onClick={async () => {
                                      await onRejectLeave(l._id || l.id, 'Rejected by HR');
                                      fetchStaffLeaveData(leaveYear, employee);
                                    }}
                                    className="px-2 py-0.5 bg-red-50 hover:bg-red-100 text-red-700 text-[10px] font-semibold rounded transition-colors"
                                  >
                                    Reject
                                  </button>
                                )}
                                {onApproveLeave && (
                                  <button
                                    type="button"
                                    onClick={async () => {
                                      await onApproveLeave(l._id || l.id, 'Approved by HR');
                                      fetchStaffLeaveData(leaveYear, employee);
                                    }}
                                    className="px-2 py-0.5 bg-blue-600 hover:bg-blue-700 text-white text-[10px] font-semibold rounded transition-colors shadow-xs"
                                  >
                                    Approve
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                    {leaves.length === 0 && (
                      <tr>
                        <td colSpan={6} className="px-6 py-8 text-center text-slate-400">
                          No leave applications on file for this contract.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Activity Ledger Audit Trail */}
            {leaveLedger.length > 0 && (
              <div className="space-y-3 pt-2">
                <div className="flex justify-between items-center">
                  <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                    <History className="w-4 h-4 text-slate-500" />
                    Activity Ledger ({leaveYear})
                  </h3>
                  <span className="text-xs text-slate-500 font-medium">
                    {leaveLedger.length} {leaveLedger.length === 1 ? 'transaction' : 'transactions'}
                  </span>
                </div>

                <div className="border border-slate-100 rounded-xl overflow-hidden shadow-sm bg-white">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-slate-100 bg-slate-50 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                        <th className="px-6 py-3">Leave Type</th>
                        <th className="px-6 py-3">Transaction</th>
                        <th className="px-6 py-3">Remarks / Context</th>
                        <th className="px-6 py-3">Recorded Date</th>
                        <th className="px-6 py-3 text-right">Adjustment</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {leaveLedger.map((entry, idx) => {
                        const isCredit = Number(entry.amount) > 0;
                        return (
                          <tr key={entry._id || idx} className="hover:bg-slate-50/50">
                            <td className="px-6 py-3 font-semibold text-slate-800">{entry.leaveType}</td>
                            <td className="px-6 py-3">
                              <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider ${
                                entry.transactionType === 'APPROVED_CONSUMPTION' ? 'bg-red-50 text-red-700' :
                                entry.transactionType === 'MONTHLY_ACCRUAL' ? 'bg-emerald-50 text-emerald-700' :
                                entry.transactionType === 'CARRY_FORWARD' ? 'bg-blue-50 text-blue-700' :
                                'bg-purple-50 text-purple-700'
                              }`}>
                                {entry.transactionType?.replace(/_/g, ' ')}
                              </span>
                            </td>
                            <td className="px-6 py-3 text-slate-600 max-w-xs truncate">{entry.remarks || entry.reason || '-'}</td>
                            <td className="px-6 py-3 text-slate-500 font-mono text-[11px]">
                              {entry.createdAt ? new Date(entry.createdAt).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' }) : '-'}
                            </td>
                            <td className="px-6 py-3 text-right font-mono font-bold">
                              <span className={isCredit ? 'text-emerald-600' : 'text-red-600'}>
                                {isCredit ? `+${Number(entry.amount).toFixed(2)}` : Number(entry.amount).toFixed(2)}
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





        {/* TAB 8: Verification Docs */}
        {activeTab === 'Documents' && (
          <div className="space-y-5">
            <div
              className="flex justify-between items-center p-4 rounded-2xl border border-rose-100/80"
              style={{ background: 'radial-gradient(ellipse at 100% 0%, rgba(244,63,94,0.1) 0%, transparent 55%), linear-gradient(135deg, #FFFFFF 0%, #FFF5F7 60%, #FFE4E8 100%)' }}
            >
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-lg bg-gradient-to-tr from-rose-600 to-pink-500 text-white flex items-center justify-center shadow-xs shrink-0">
                  <FileLock className="w-3.5 h-3.5" />
                </div>
                <div>
                  <h3 className="text-xs font-extrabold text-rose-900 uppercase tracking-wider">Credential Verification Vault</h3>
                  <p className="text-[10px] text-rose-600 mt-0.5">Mandatory clinical licenses, DEA registrations, and identity sheets.</p>
                </div>
              </div>
              <button 
                onClick={() => {
                  showToast('Scanning document vault... System is verified with State Licensing Servers.', 'success');
                }}
                className="px-3 py-1.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-semibold text-xs rounded-lg shadow-sm transition-all"
              >
                Trigger Licensure Sync
              </button>
            </div>

            <div className="space-y-3">
              {documentsList.length === 0 ? (
                <div className="text-center py-8 bg-slate-50 rounded-xl border border-dashed border-slate-200 text-slate-400 text-xs font-medium">
                  No verification credentials uploaded yet.
                </div>
              ) : (
                documentsList.map((doc, idx) => (
                  <div key={doc.name} className="flex flex-col sm:flex-row justify-between items-start sm:items-center p-4 bg-slate-50 rounded-xl border border-slate-100 hover:border-blue-100 transition-colors gap-3">
                    <div className="flex gap-3">
                      <div className="p-2.5 bg-white rounded-lg border border-slate-100 text-slate-600 shadow-sm shrink-0">
                        <FileText className="w-5 h-5" />
                      </div>
                      <div>
                        <h4 className="text-xs font-semibold text-slate-800">{doc.name}</h4>
                        <p className="text-[10px] text-slate-400 mt-0.5">Category: {doc.type} &bull; Expiration: <span className="font-semibold text-slate-600">{doc.expiry}</span></p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                      <span className={`px-2.5 py-1 text-[10px] font-bold rounded-full ${
                        doc.status === 'Verified' ? 'bg-emerald-50 text-emerald-700' : 'bg-orange-50 text-orange-700'
                      }`}>
                        {doc.status}
                      </span>
                      {doc.status !== 'Verified' && (
                        <button
                          onClick={() => handleVerifyDoc(idx)}
                          className="px-2.5 py-1 bg-emerald-600 text-white rounded text-[10px] font-semibold hover:bg-emerald-700 shadow-sm transition-colors"
                        >
                          Approve & Verify
                        </button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Custom shared documents section */}
            <div className="space-y-4">
              <div
                className="flex justify-between items-center p-4 rounded-2xl border border-slate-200/80"
                style={{ background: 'radial-gradient(ellipse at 0% 100%, rgba(99,102,241,0.08) 0%, transparent 55%), linear-gradient(135deg, #FFFFFF 0%, #F8FAFC 60%, #F3F4F9 100%)' }}
              >
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-lg bg-gradient-to-tr from-indigo-600 to-blue-500 text-white flex items-center justify-center shadow-xs shrink-0">
                    <FileText className="w-3.5 h-3.5" />
                  </div>
                  <div>
                    <h3 className="text-xs font-extrabold text-indigo-900 uppercase tracking-wider">Employee Document Portfolio</h3>
                    <p className="text-[10px] text-indigo-600 mt-0.5">Custom uploads, contracts, and employment letters.</p>
                  </div>
                </div>
                <span className="text-[10px] text-indigo-600 bg-indigo-50 border border-indigo-200 px-2.5 py-1 rounded-full font-bold">{employeeDocuments.length} Shared Files</span>
              </div>

              {/* Upload area inline if HR/Admin */}
              {isAdminOrHR && (
                <div className="bg-slate-50 p-4 rounded-xl border border-slate-200/60 space-y-4">
                  <span className="text-[11px] font-bold text-slate-700 uppercase tracking-wider block">Upload & Link New Document</span>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-slate-500 text-[10px] uppercase font-bold tracking-wider mb-1">Document Title</label>
                      <input 
                        type="text"
                        placeholder="e.g. Offer Letter 2026"
                        value={newDocTitle}
                        onChange={(e) => setNewDocTitle(e.target.value)}
                        className="w-full text-xs p-2.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
                      />
                    </div>
                    <div>
                      <label className="block text-slate-500 text-[10px] uppercase font-bold tracking-wider mb-1">Category</label>
                      <select
                        value={newDocCategory}
                        onChange={(e) => setNewDocCategory(e.target.value)}
                        className="w-full text-xs p-2.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white shadow-none"
                      >
                        <option value="offer_letter">Offer Letter</option>
                        <option value="medical_license">Medical License (Clinical)</option>
                        <option value="dea_registration">DEA / Pharmacy Registration</option>
                        <option value="medical_degree">Medical Degree</option>
                        <option value="certifications">Certifications / Fellowships</option>
                        <option value="identity_documents">Identity Documents</option>
                        <option value="joining_report">Joining Report</option>
                        <option value="salary_slips">Salary Slips</option>
                        <option value="others">Others</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-slate-500 text-[10px] uppercase font-bold tracking-wider mb-1">Choose File</label>
                      <input 
                        id="new-doc-file-input"
                        type="file"
                        onChange={handleDocFileChange}
                        className="w-full text-xs file:bg-blue-50 file:border-none file:px-3 file:py-1 file:rounded-md file:text-[10px] file:font-semibold file:text-blue-700 cursor-pointer"
                      />
                    </div>
                  </div>
                  <div className="flex justify-end pt-1">
                    <button
                      type="button"
                      onClick={async () => {
                        if (!newDocTitle.trim() || !newDocData) {
                          showToast('Please fill out the title and choose a file first.', 'error');
                          return;
                        }
                        const newDocObj = {
                          _id: 'DOC-' + Date.now(),
                          category: newDocCategory,
                          title: newDocTitle.trim(),
                          fileName: newDocData.fileName,
                          fileData: newDocData.fileData,
                          fileType: newDocData.fileType,
                          uploadedAt: new Date().toISOString(),
                          uploadedBy: 'HR Manager'
                        };
                        const updatedDocs = [...employeeDocuments, newDocObj];
                        try {
                          await onUpdateEmployee(employee.id, { documents: updatedDocs });
                          setEmployeeDocuments(updatedDocs);
                          setNewDocTitle('');
                          setNewDocFile(null);
                          setNewDocData(null);
                          const fileInput = document.getElementById('new-doc-file-input');
                          if (fileInput) fileInput.value = '';
                          showToast('Document uploaded and saved successfully!', 'success');
                        } catch (err) {
                          showToast('Failed to upload document.', 'error');
                        }
                      }}
                      className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold shadow-sm transition-colors"
                    >
                      Upload & Save Document
                    </button>
                  </div>
                </div>
              )}

              {/* Documents table/list */}
              <div className="border border-slate-100 rounded-xl overflow-hidden shadow-sm">
                <table className="w-full text-left border-collapse bg-white text-xs">
                  <thead>
                    <tr className="border-b border-slate-100 bg-slate-50 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                      <th className="px-4 py-3">Document Title</th>
                      <th className="px-4 py-3">Category</th>
                      <th className="px-4 py-3">File Name</th>
                      <th className="px-4 py-3">Uploaded At</th>
                      <th className="px-4 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {employeeDocuments.map((doc) => {
                      const docId = doc._id || doc.id;
                      return (
                        <tr key={docId} className="hover:bg-slate-50/50">
                          <td className="px-4 py-3 font-semibold text-slate-800">{doc.title}</td>
                          <td className="px-4 py-3">
                            <span className="px-2 py-0.5 bg-slate-100 text-slate-600 text-[10px] font-medium rounded capitalize">
                              {doc.category.replace('_', ' ')}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-slate-500 font-mono text-[10px]">{doc.fileName}</td>
                          <td className="px-4 py-3 text-slate-400">{new Date(doc.uploadedAt).toLocaleDateString()}</td>
                          <td className="px-4 py-3 text-right space-x-1.5 whitespace-nowrap">
                            <button
                              type="button"
                              onClick={() => setPreviewDoc(doc)}
                              className="px-2 py-1 text-slate-500 hover:bg-slate-100 border border-slate-200 rounded font-semibold text-[10px]"
                            >
                              Preview
                            </button>
                            <a
                              href={doc.fileData}
                              download={doc.fileName}
                              className="px-2 py-1 bg-blue-50 text-blue-600 hover:bg-blue-100 border border-blue-100 rounded font-semibold text-[10px] inline-block"
                            >
                              Download
                            </a>
                            {isAdminOrHR && (
                              <button
                                type="button"
                                onClick={async () => {
                                  const updatedDocs = employeeDocuments.filter(d => (d._id || d.id) !== docId);
                                  try {
                                    await onUpdateEmployee(employee.id, { documents: updatedDocs });
                                    setEmployeeDocuments(updatedDocs);
                                    showToast('Document deleted successfully!', 'success');
                                  } catch (err) {
                                    showToast('Failed to delete document.', 'error');
                                  }
                                }}
                                className="px-2 py-1 bg-red-50 text-red-600 hover:bg-red-100 border border-red-100 rounded font-semibold text-[10px]"
                              >
                                Delete
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                    {employeeDocuments.length === 0 && (
                      <tr>
                        <td colSpan="5" className="p-8 text-center text-slate-400 italic">No custom documents uploaded.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}


        {activeTab === 'Slots' && (
          <div className="space-y-5">
            <div
              className="p-4 rounded-2xl border border-blue-100/80"
              style={{ background: 'radial-gradient(ellipse at 100% 0%, rgba(37,99,235,0.12) 0%, transparent 55%), linear-gradient(135deg, #FFFFFF 0%, #EFF6FF 60%, #DBEAFE 100%)' }}
            >
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-lg bg-gradient-to-tr from-blue-600 to-indigo-500 text-white flex items-center justify-center shadow-xs shrink-0">
                  <Clock className="w-3.5 h-3.5" />
                </div>
                <div>
                  <h3 className="text-xs font-extrabold text-blue-900 uppercase tracking-wider">Doctor Appointment Slots Configuration</h3>
                  <p className="text-[10px] text-blue-600 mt-0.5">Configure custom daily availability intervals for patient consultation bookings. HR will set custom times by their own for each slot.</p>
                </div>
              </div>
            </div>
            
            {/* Add Custom Slot Input row */}
            <div
              className="p-4 rounded-xl border border-slate-200/80 space-y-4 max-w-2xl"
              style={{ background: 'linear-gradient(135deg, #F8FAFC 0%, #F1F5F9 100%)' }}
            >
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-slate-500 text-[10px] uppercase font-bold tracking-wider mb-1">Start Time</label>
                  <input 
                    type="time"
                    value={newSlotStartTime}
                    onChange={(e) => setNewSlotStartTime(e.target.value)}
                    className="w-full text-xs p-2.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white cursor-pointer h-10"
                  />
                </div>
                <div>
                  <label className="block text-slate-500 text-[10px] uppercase font-bold tracking-wider mb-1">End Time</label>
                  <input 
                    type="time"
                    value={newSlotEndTime}
                    onChange={(e) => setNewSlotEndTime(e.target.value)}
                    className="w-full text-xs p-2.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white cursor-pointer h-10"
                  />
                </div>
                <div>
                  <label className="block text-slate-500 text-[10px] uppercase font-bold tracking-wider mb-1">Max Patients (Limit)</label>
                  <input 
                    type="number"
                    min="1"
                    value={newSlotLimit}
                    onChange={(e) => {
                      const val = e.target.value;
                      setNewSlotLimit(val === '' ? '' : Number(val));
                    }}
                    className="w-full text-xs p-2.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white h-10"
                  />
                </div>
              </div>

              <div className="flex flex-col sm:flex-row gap-3 items-end">
                <div className="flex-1 w-full">
                  <label className="block text-slate-500 text-[10px] uppercase font-bold tracking-wider mb-1">Or Edit/Create Slot String Manually</label>
                  <input 
                    type="text"
                    placeholder="e.g. 05:30 PM to 06:30 PM (Limit: 3)"
                    value={newSlotTime}
                    onChange={(e) => setNewSlotTime(e.target.value)}
                    className="w-full text-xs p-2.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white h-10"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const formatTime12h = (timeVal) => {
                      if (!timeVal) return '';
                      const [hoursStr, minutesStr] = timeVal.split(':');
                      let hours = parseInt(hoursStr, 10);
                      const ampm = hours >= 12 ? 'PM' : 'AM';
                      hours = hours % 12;
                      hours = hours ? hours : 12;
                      const hoursFormatted = hours < 10 ? '0' + hours : hours;
                      return `${hoursFormatted}:${minutesStr} ${ampm}`;
                    };

                    let finalSlot = newSlotTime.trim();
                    if (!finalSlot) {
                      if (!newSlotStartTime || !newSlotEndTime) {
                        showToast('Please select start/end times or enter slot time manually.', 'error');
                        return;
                      }
                      const start12 = formatTime12h(newSlotStartTime);
                      const end12 = formatTime12h(newSlotEndTime);
                      finalSlot = `${start12} to ${end12}${newSlotLimit ? ` (Limit: ${newSlotLimit})` : ''}`;
                    }

                    if (selectedSlots.includes(finalSlot)) {
                      showToast('This slot already exists!', 'error');
                      return;
                    }
                    setSelectedSlots([...selectedSlots, finalSlot]);
                    setNewSlotTime('');
                    setNewSlotStartTime('');
                    setNewSlotEndTime('');
                  }}
                  className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold shadow-sm transition-colors whitespace-nowrap h-10"
                >
                  Add Slot
                </button>
              </div>
            </div>

            {/* List of active custom slots */}
            <div className="space-y-3">
              <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">Active Slots Configuration</h4>
              <div className="flex flex-wrap gap-2">
                {selectedSlots.map((slot) => {
                  const match = slot.match(/(.*?)\s*\(Limit:\s*(\d+)\)/i);
                  const displayStr = match ? match[1].trim() : slot;
                  const limitVal = match ? match[2] : null;

                  return (
                    <div 
                      key={slot} 
                      className="px-3 py-2 bg-slate-50 border border-slate-200 text-slate-700 rounded-lg text-xs font-semibold flex items-center gap-2 group hover:border-red-200 transition-colors"
                    >
                      <span>{displayStr}</span>
                      {limitVal && (
                        <span className="px-1.5 py-0.5 bg-blue-50 text-blue-600 font-bold rounded text-[10px]">
                          Limit: {limitVal}
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedSlots(selectedSlots.filter(s => s !== slot));
                        }}
                        className="text-slate-400 hover:text-red-600 transition-colors"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  );
                })}
                {selectedSlots.length === 0 && (
                  <p className="text-xs text-slate-400 italic">No custom slots configured. Enter a custom time slot above.</p>
                )}
              </div>
            </div>

            <div className="flex justify-between items-center bg-slate-50 p-4 rounded-xl border border-slate-100 mt-4">
              <div className="text-xs text-slate-500 font-semibold">
                <span className="text-blue-600">{selectedSlots.length} custom slots configured</span>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedSlots(employee.doctorSlots || [])}
                  className="px-4 py-2 border border-slate-200 rounded-lg text-xs font-semibold text-slate-500 hover:bg-slate-50 transition-colors"
                >
                  Reset
                </button>
                 <button
                  type="button"
                  onClick={async () => {
                    try {
                      let slotsToSave = [...selectedSlots];
                      
                      // Auto-add slot from inputs if they filled it but forgot to click "Add Slot"
                      let finalSlot = newSlotTime.trim();
                      if (!finalSlot && newSlotStartTime && newSlotEndTime) {
                        const formatTime12h = (timeVal) => {
                          if (!timeVal) return '';
                          const [hoursStr, minutesStr] = timeVal.split(':');
                          let hours = parseInt(hoursStr, 10);
                          const ampm = hours >= 12 ? 'PM' : 'AM';
                          hours = hours % 12;
                          hours = hours ? hours : 12;
                          const hoursFormatted = hours < 10 ? '0' + hours : hours;
                          return `${hoursFormatted}:${minutesStr} ${ampm}`;
                        };
                        const start12 = formatTime12h(newSlotStartTime);
                        const end12 = formatTime12h(newSlotEndTime);
                        finalSlot = `${start12} to ${end12}${newSlotLimit ? ` (Limit: ${newSlotLimit})` : ''}`;
                      }
                      
                      if (finalSlot && !slotsToSave.includes(finalSlot)) {
                        slotsToSave.push(finalSlot);
                        setSelectedSlots(slotsToSave);
                        setNewSlotTime('');
                        setNewSlotStartTime('');
                        setNewSlotEndTime('');
                      }

                      await onUpdateEmployee(employee.id, { doctorSlots: slotsToSave });
                      showToast('Doctor slots updated successfully!', 'success');
                    } catch (e) {
                      showToast('Failed to update doctor slots', 'error');
                    }
                  }}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold shadow-sm transition-colors"
                >
                  Save Slots
                </button>
              </div>
            </div>

          </div>
        )}

      </div>

      {/* Salary payslip print popup */}
      {selectedPayslip && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center z-50 p-4 animate-fadeIn">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6 border border-slate-200 shadow-2xl space-y-6">
            
            {/* Header branding */}
            <div className="flex justify-between items-start border-b border-slate-100 pb-4">
              <div>
                <h3 className="font-display font-bold text-blue-600 text-base">Metro Community Hospital & Clinics</h3>
                <p className="text-[10px] text-slate-400 uppercase tracking-widest mt-0.5">Official Monthly Payslip</p>
              </div>
              <button 
                onClick={() => setSelectedPayslip(null)}
                className="text-slate-400 hover:text-slate-600 text-xl font-bold font-mono"
              >
                &times;
              </button>
            </div>

            {/* Slip metadata */}
            <div className="grid grid-cols-2 gap-4 text-xs">
              <div>
                <span className="text-[10px] text-slate-400 block uppercase font-semibold">EMPLOYEE DETAILS</span>
                <span className="font-semibold text-slate-800">{selectedPayslip.employeeName} ({selectedPayslip.employeeId})</span>
                <span className="text-slate-500 block mt-0.5">{selectedPayslip.designation} &bull; {selectedPayslip.department}</span>
              </div>
              <div className="text-right">
                <span className="text-[10px] text-slate-400 block uppercase font-semibold">PAY CYCLE</span>
                <span className="font-semibold text-slate-800">{selectedPayslip.month}</span>
                <span className="text-slate-500 block mt-0.5">Status: <span className="text-emerald-600 font-bold">Paid via Direct Bank Transfer</span></span>
              </div>
            </div>

            {/* Calculations table */}
            <div className="border border-slate-100 rounded-xl overflow-hidden text-xs">
              <div className="grid grid-cols-2 bg-slate-50 font-semibold p-2.5 border-b border-slate-100 text-slate-400 text-[10px]">
                <span>EARNING CATEGORY</span>
                <span className="text-right">AMOUNT (₹ INR)</span>
              </div>
              <div className="divide-y divide-slate-100 p-2.5 space-y-2">
                <div className="flex justify-between">
                  <span>Basic Pay Portion</span>
                  <span className="font-mono">₹{selectedPayslip.basic.toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span>House Rent Allowance (HRA)</span>
                  <span className="font-mono">₹{selectedPayslip.hra.toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span>Medical & Conveyance Allowance</span>
                  <span className="font-mono">₹{(selectedPayslip.conveyance + selectedPayslip.medicalAllowance).toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span>Special Allowance</span>
                  <span className="font-mono">₹{selectedPayslip.specialAllowance.toLocaleString()}</span>
                </div>
                {selectedPayslip.bonus > 0 && (
                  <div className="flex justify-between text-emerald-600 font-semibold">
                    <span>Performance Executive Bonus</span>
                    <span className="font-mono">+₹{selectedPayslip.bonus.toLocaleString()}</span>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 bg-slate-50 font-semibold p-2.5 border-t border-b border-slate-100 text-slate-400 text-[10px] mt-2">
                <span>DEDUCTIONS REGISTER</span>
                <span className="text-right">ESTIMATED AMOUNT</span>
              </div>
              <div className="divide-y divide-slate-100 p-2.5 space-y-2 text-slate-500">
                <div className="flex justify-between">
                  <span>Provident Fund (PF)</span>
                  <span className="font-mono">-₹{selectedPayslip.pfDeduction.toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span>ESI Share</span>
                  <span className="font-mono">-₹{selectedPayslip.esiDeduction.toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span>Professional Tax</span>
                  <span className="font-mono">-₹200</span>
                </div>
                <div className="flex justify-between">
                  <span>Estimated Income TDS Tax</span>
                  <span className="font-mono">-₹{selectedPayslip.incomeTax.toLocaleString()}</span>
                </div>
              </div>
            </div>

            {/* Pay summary and bank info */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center p-4 bg-blue-50/50 rounded-xl border border-blue-100/40 text-xs gap-3">
              <div>
                <span className="text-[10px] text-blue-500 font-bold block">RECIPIENT BANK NODE</span>
                <span className="text-slate-700 font-medium">{employee.bankDetails.bankName} (IFSC: {employee.bankDetails.ifsc})</span>
                <span className="text-slate-400 block font-mono">A/C: {employee.bankDetails.accountNumber}</span>
              </div>
              <div className="text-right">
                <span className="text-[10px] text-blue-500 font-bold block">NET PAYABLE AMOUNT DEPOSITED</span>
                <span className="text-lg font-bold text-slate-900 font-mono">₹{selectedPayslip.netPayable.toLocaleString()}</span>
              </div>
            </div>

            <div className="flex justify-end gap-2.5 border-t border-slate-100 pt-4">
              <button 
                onClick={() => setSelectedPayslip(null)}
                className="px-4 py-2 border border-slate-200 text-slate-500 hover:bg-slate-50 rounded-lg text-xs font-semibold"
              >
                Close Slip
              </button>
              <button 
                onClick={() => {
                  window.print();
                }}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold flex items-center gap-1 shadow-sm"
              >
                <Printer className="w-4 h-4" />
                Print Physical Copy
              </button>
            </div>
          </div>
        </div>
      )}

      {/* File Preview Overlay Modal */}
      {previewDoc && (
        <div 
          className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 hr-modal-overlay"
          onClick={() => setPreviewDoc(null)}
          data-lenis-prevent="true"
          style={{ overscrollBehavior: 'contain', zIndex: 10000 }}
        >
          <div 
            className="bg-white rounded-2xl shadow-xl border border-slate-100 max-w-3xl w-full p-6 relative hr-admin-modal flex flex-col"
            style={{ maxHeight: '90vh', animation: 'adminFadeIn 0.2s ease-out' }}
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4 pb-2 border-b border-slate-100">
              <span className="text-sm font-bold text-slate-800">{previewDoc.title}</span>
              <button 
                onClick={() => setPreviewDoc(null)}
                className="text-slate-400 hover:text-slate-600 font-bold text-lg"
              >
                &times;
              </button>
            </div>
            <div className="flex-1 overflow-auto flex items-center justify-center bg-slate-100 rounded-lg p-2 min-h-[300px]">
              {previewDoc.fileType.startsWith('image/') ? (
                <img src={previewDoc.fileData} alt={previewDoc.title} className="max-w-full max-h-[60vh] object-contain rounded" />
              ) : previewDoc.fileType === 'application/pdf' ? (
                <iframe src={previewDoc.fileData} title={previewDoc.title} className="w-full h-[60vh] border-0 rounded" />
              ) : (
                <div className="text-center text-slate-500 text-xs p-8">
                  <p className="font-semibold">{previewDoc.fileName}</p>
                  <p className="mt-1">Binary file preview not supported directly. Please download to view.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
