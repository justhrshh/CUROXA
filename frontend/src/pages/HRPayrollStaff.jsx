import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import api, { clearPortalAuthContext, performLogout } from '../utils/api';
import SearchableDropdown from '../components/SearchableDropdown';
import { socket, joinTenantRoom } from '../utils/socket';

export default function HRPayrollStaff({ onExit }) {
  const navigate = useNavigate();
  const currentUser = JSON.parse(localStorage.getItem('user') || '{}');
  
  // Navigation tabs
  const isAdminOrHR = currentUser.role === 'admin' || currentUser.role === 'hr';
  const [activeTab, setActiveTab] = useState(() => {
    if (isAdminOrHR) return 'hr-dashboard';
    return 'dashboard';
  });

  // Admin Search & Filter States
  const [documentSearch, setDocumentSearch] = useState('');
  const [documentCategoryFilter, setDocumentCategoryFilter] = useState('all');
  const [directorySearch, setDirectorySearch] = useState('');
  const [directoryDeptFilter, setDirectoryDeptFilter] = useState('all');
  const [directoryRoleFilter, setDirectoryRoleFilter] = useState('all');
  const [attendanceSearch, setAttendanceSearch] = useState('');
  const [attendanceDate, setAttendanceDate] = useState(() => {
    const today = new Date();
    return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  });
  const [selectedStaffForCalendar, setSelectedStaffForCalendar] = useState(null);
  const [calendarYear, setCalendarYear] = useState(() => new Date().getFullYear());
  const [calendarMonth, setCalendarMonth] = useState(() => new Date().getMonth());
  const [payrollSearch, setPayrollSearch] = useState('');
  
  // Edit Staff State
  const [editingStaff, setEditingStaff] = useState(null);
  const [showEditStaffModal, setShowEditStaffModal] = useState(false);
  const [showEditStaffPassword, setShowEditStaffPassword] = useState(false);
  const [toast, setToast] = useState(null);
  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  // Attendance Date Switcher State
  const [selectedDate, setSelectedDate] = useState(() => new Date());

  // Document Preview State
  const [previewDoc, setPreviewDoc] = useState(null);

  // Initial Documents Data (No default mock documents)
  const initialCategories = {
    appointment_letter: {
      title: 'Appointment Letter',
      icon: 'file-text',
      color: '#2563EB',
      bgColor: '#EFF6FF',
      docs: []
    },
    offer_letter: {
      title: 'Offer Letter',
      icon: 'award',
      color: '#7C3AED',
      bgColor: '#F5F3FF',
      docs: []
    },
    salary_slips: {
      title: 'Salary Slips',
      icon: 'banknote',
      color: '#10B981',
      bgColor: '#ECFDF5',
      docs: []
    },
    identity_documents: {
      title: 'Identity Documents',
      icon: 'user',
      color: '#EA580C',
      bgColor: '#FFF7ED',
      docs: []
    },
    certifications: {
      title: 'Certifications',
      icon: 'graduation-cap',
      color: '#0284C7',
      bgColor: '#E0F2FE',
      docs: []
    }
  };

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

  const [employees, setEmployees] = useState([]);
  const [selectedEmployee, setSelectedEmployee] = useState(null);
  const [refreshPendingTrigger, setRefreshPendingTrigger] = useState(0);
  const [docUploadStaffId, setDocUploadStaffId] = useState('');
  const [docUploadCategory, setDocUploadCategory] = useState('appointment_letter');

  const [showAddStaffModal, setShowAddStaffModal] = useState(false);
  const [showAddStaffPassword, setShowAddStaffPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [newStaff, setNewStaff] = useState({ 
    staff_id: '', password: '', confirmPassword: '', role: getAvailableRoles()[0]?.value || 'doctor', name: '', max_slots: '', email: '',
    dob: '', gender: '', bloodGroup: '', aadhaar: '', pan: '', address: '', weeklyOff: '',
    emergencyContactName: '', emergencyContactRelation: '', emergencyContactPhone: ''
  });
  const [addStaffError, setAddStaffError] = useState('');

  const fetchEmployees = async () => {
    if (currentUser.role === 'admin' || currentUser.role === 'hr') {
      try {
        const res = await api.get('/admin/users');
        const formatted = res.data.map(user => {
          let initials = user.name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
          if (!initials) initials = 'ST';
          return {
            id: user._id || user.id,
            _id: user._id || user.id,
            staff_id: user.staff_id,
            name: user.name,
            role: user.role,
            email: user.email || '',
            joined: user.createdAt ? new Date(user.createdAt).toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' }) : 'Recently',
            dept: user.specialty || (user.role === 'doctor' ? 'General Medicine' : user.role === 'hr' ? 'HR & Administration' : 'Administration'),
            initials,
            documents: user.documents || [],
            carriedForwardLeaves: user.carriedForwardLeaves || 0,
            monthlyLeaveAllocation: user.monthlyLeaveAllocation || { sick: 1, casual: 1, annual: 1.25 },
            weeklyOff: user.weeklyOff || 'Sunday',
            shiftName: user.shiftName || 'General Shift'
          };
        });
        setEmployees(formatted);
        if (formatted.length > 0) {
          // If we had a selected employee, update it from the new list. Otherwise pick first.
          if (selectedEmployee) {
            const fresh = formatted.find(f => f.id === selectedEmployee.id);
            if (fresh) setSelectedEmployee(fresh);
            else setSelectedEmployee(formatted[0]);
          } else {
            setSelectedEmployee(formatted[0]);
          }
        }
      } catch (err) {
        console.warn('Fallback to local registry for HR portal:', err);
        const mockStaff = [
          { staff_id: 'EMP-1001', name: 'Dr. Anjali Mehta', role: 'doctor', email: 'anjali@curoxa.com', joined: '12 Jan 2023', dept: 'General Medicine', initials: 'AM', documents: [] },
          { staff_id: 'EMP-1002', name: 'Roshni Patel', role: 'receptionist', email: 'roshni@curoxa.com', joined: '18 Feb 2023', dept: 'Front desk', initials: 'RP', documents: [] },
          { staff_id: 'EMP-1003', name: 'Dr. Rajan K', role: 'doctor', email: 'rajan@curoxa.com', joined: '05 Mar 2024', dept: 'Ortho', initials: 'RK', documents: [] },
        ];
        setEmployees(mockStaff);
        if (!selectedEmployee) {
          setSelectedEmployee(mockStaff[0]);
        }
      }
    } else {
      try {
        const profileRes = await api.get('/hr/profile/me');
        const user = profileRes.data;
        let initials = user.name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
        if (!initials) initials = 'ST';
        const selfEmployee = {
          id: user._id || user.id,
          _id: user._id || user.id,
          staff_id: user.staff_id,
          name: user.name,
          role: user.role,
          email: user.email || '',
          joined: user.createdAt ? new Date(user.createdAt).toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' }) : 'Recently',
          dept: user.specialty || (user.role === 'doctor' ? 'General Medicine' : 'Administration'),
          initials,
          documents: user.documents || [],
          carriedForwardLeaves: user.carriedForwardLeaves || 0,
          monthlyLeaveAllocation: user.monthlyLeaveAllocation || { sick: 1, casual: 1, annual: 1.25 },
          reportingManagerName: user.reportingManagerName || 'Ishita Jain (Administrator)'
        };
        setEmployees([selfEmployee]);
        setSelectedEmployee(selfEmployee);
      } catch (err) {
        console.error('Failed to fetch self profile', err);
      }
    }
  };

  useEffect(() => {
    fetchEmployees();
  }, []);

  // Helper to dynamically group documents by category from selectedEmployee
  const getDocumentsFromEmployee = (emp) => {
    const categories = {
      appointment_letter: { title: 'Appointment Letter', color: '#2563EB', bgColor: '#EFF6FF', docs: [] },
      offer_letter: { title: 'Offer Letter', color: '#7C3AED', bgColor: '#F5F3FF', docs: [] },
      salary_slips: { title: 'Salary Slips', color: '#10B981', bgColor: '#ECFDF5', docs: [] },
      identity_documents: { title: 'Identity Documents', color: '#EA580C', bgColor: '#FFF7ED', docs: [] },
      certifications: { title: 'Certifications', color: '#0284C7', bgColor: '#E0F2FE', docs: [] }
    };

    if (emp && emp.documents) {
      emp.documents.forEach(doc => {
        const cat = doc.category || 'certifications';
        if (categories[cat]) {
          categories[cat].docs.push({
            id: doc._id || doc.id,
            _id: doc._id || doc.id,
            name: doc.title || doc.fileName,
            fileName: doc.fileName,
            fileType: doc.fileType,
            dataUrl: doc.fileData, // Base64 data
            uploadedAt: doc.uploadedAt,
            uploadedBy: doc.uploadedBy
          });
        }
      });
    }
    return categories;
  };

  const documentsData = getDocumentsFromEmployee(selectedEmployee);

  const handleDeleteDoc = async (categoryKey, docId) => {
    if (!selectedEmployee) return;
    try {
      const userId = selectedEmployee.id || selectedEmployee._id;
      const res = await api.delete(`/hr/users/${userId}/documents/${docId}`);
      if (res.data) {
        showToast("Document deleted successfully", "success");
        const updatedUser = res.data;
        const updatedEmp = {
          ...selectedEmployee,
          documents: updatedUser.documents
        };
        setSelectedEmployee(updatedEmp);
        setEmployees(prev => prev.map(emp => (emp.id === updatedUser._id || emp.id === updatedUser.id) ? updatedEmp : emp));
      }
    } catch (err) {
      console.error('Failed to delete document', err);
      showToast("Failed to delete document", "error");
    }
  };

  const handleUploadDoc = async (categoryKey, file) => {
    if (!file || !selectedEmployee) return;
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const payload = {
          category: categoryKey,
          title: file.name,
          fileName: file.name,
          fileType: file.type,
          fileData: e.target.result // Base64 string
        };
        const userId = selectedEmployee.id || selectedEmployee._id;
        const res = await api.post(`/hr/users/${userId}/documents`, payload);
        if (res.data) {
          showToast(`Successfully uploaded ${file.name}!`, "success");
          const updatedUser = res.data;
          const updatedEmp = {
            ...selectedEmployee,
            documents: updatedUser.documents
          };
          setSelectedEmployee(updatedEmp);
          setEmployees(prev => prev.map(emp => (emp.id === updatedUser._id || emp.id === updatedUser.id) ? updatedEmp : emp));
        }
      } catch (err) {
        console.error('Failed to upload document to DB', err);
        showToast('Failed to upload document', 'error');
      }
    };
    reader.readAsDataURL(file);
  };

  const handleHRUploadDocOnBehalf = async (staffId, categoryKey, file) => {
    if (!staffId || !categoryKey || !file) {
      showToast("Please select employee, category, and file first", "error");
      return;
    }
    const emp = employees.find(e => e.staff_id === staffId || e.id === staffId);
    if (!emp) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const payload = {
          category: categoryKey,
          title: file.name,
          fileName: file.name,
          fileType: file.type,
          fileData: e.target.result
        };
        const userId = emp.id || emp._id;
        const res = await api.post(`/hr/users/${userId}/documents`, payload);
        if (res.data) {
          showToast(`Document uploaded successfully for ${emp.name}`, "success");
          await fetchEmployees();
        }
      } catch (err) {
        console.error('Failed to upload document on behalf', err);
        showToast('Failed to upload document', 'error');
      }
    };
    reader.readAsDataURL(file);
  };

  const downloadDoc = (doc) => {
    let url = doc.dataUrl;
    if (url === 'dummy') {
      const blob = new Blob([`Curoxa Document: ${doc.name}\nGenerated on: ${new Date().toLocaleDateString()}`], { type: 'text/plain' });
      url = URL.createObjectURL(blob);
    }
    const link = document.createElement('a');
    link.href = url;
    link.download = doc.name;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleAddStaff = async (e) => {
    e.preventDefault();
    if (newStaff.password !== newStaff.confirmPassword) {
      setAddStaffError('Passwords do not match.');
      showToast('Passwords do not match.', 'error');
      return;
    }
    if (newStaff.role === 'doctor') {
      const currentOffs = Array.isArray(newStaff.weeklyOff)
        ? newStaff.weeklyOff
        : (newStaff.weeklyOff ? newStaff.weeklyOff.split(',').map(d => d.trim()) : []);
      if (currentOffs.length === 0) {
        setAddStaffError('Please select at least one Weekly Off day for the doctor.');
        showToast('Please select at least one Weekly Off day for the doctor.', 'error');
        return;
      }
    }
    setLoading(true);
    setAddStaffError('');

    try {
      const payload = {
        ...newStaff,
        emergencyContact: {
          name: newStaff.emergencyContactName,
          relation: newStaff.emergencyContactRelation,
          phone: newStaff.emergencyContactPhone
        }
      };
      await api.post('/admin/users', payload);
      showToast('Staff account created successfully!', 'success');
      setNewStaff({ 
        staff_id: '', password: '', confirmPassword: '', role: getAvailableRoles()[0]?.value || 'doctor', name: '', max_slots: '', email: '',
        dob: '', gender: '', bloodGroup: '', aadhaar: '', pan: '', address: '', weeklyOff: '',
        emergencyContactName: '', emergencyContactRelation: '', emergencyContactPhone: ''
      });
      setShowAddStaffModal(false);
      setShowAddStaffPassword(false);
      await fetchEmployees();
    } catch (err) {
      console.warn('Backend API error adding staff:', err);
      setAddStaffError(err.response?.data?.error || 'Failed to create staff account');
      showToast(err.response?.data?.error || 'Failed to create staff account', 'error');
    } finally {
      setLoading(false);
    }
  };

  // Administrative Helpers
  const handleDeleteStaff = async (id) => {
    try {
      await api.delete(`/admin/users/${id}`);
      showToast('Staff member deleted successfully', 'success');
      await fetchEmployees();
      setRefreshPendingTrigger(prev => prev + 1);
    } catch (err) {
      showToast(err.response?.data?.error || 'Failed to delete staff member', 'error');
    }
  };

  const handleEditStaff = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const payload = {
        name: editingStaff.name,
        role: editingStaff.role,
        email: editingStaff.email,
        specialty: editingStaff.dept || editingStaff.specialty,
        max_slots: editingStaff.max_slots,
        weeklyOff: editingStaff.weeklyOff || 'Sunday',
        shiftName: editingStaff.shiftName || 'General Shift'
      };
      if (editingStaff.password && editingStaff.password.trim()) {
        payload.password = editingStaff.password.trim();
      }
      await api.put(`/admin/users/${editingStaff.id}`, payload);
      showToast('Staff member details updated successfully', 'success');
      setShowEditStaffModal(false);
      setEditingStaff(null);
      await fetchEmployees();
      setRefreshPendingTrigger(prev => prev + 1);
    } catch (err) {
      showToast(err.response?.data?.error || 'Failed to update details', 'error');
    } finally {
      setLoading(false);
    }
  };

  const getAllEmployeeDocuments = () => {
    const allDocs = [];
    employees.forEach(emp => {
      if (emp.documents) {
        emp.documents.forEach(doc => {
          allDocs.push({
            id: doc._id || doc.id,
            _id: doc._id || doc.id,
            name: doc.title || doc.fileName,
            fileName: doc.fileName,
            fileType: doc.fileType,
            dataUrl: doc.fileData,
            uploadedAt: doc.uploadedAt,
            uploadedBy: doc.uploadedBy,
            categoryKey: doc.category,
            categoryTitle: doc.category ? doc.category.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ') : 'Other',
            employee: emp
          });
        });
      }
    });
    return allDocs;
  };

  const handleDeleteEmployeeDoc = async (emp, catKey, docId) => {
    try {
      const userId = emp.id || emp._id;
      const res = await api.delete(`/hr/users/${userId}/documents/${docId}`);
      if (res.data) {
        showToast("Document deleted successfully", "success");
        await fetchEmployees();
      }
    } catch (err) {
      console.error('Failed to delete document', err);
      showToast("Failed to delete document", "error");
    }
  };

  const getEmployeeDayStatus = (emp, dateStr) => {
    // Check if the date is before employee's joined date
    let joinedDateObj = null;
    if (emp?.joined && emp.joined !== 'Recently') {
      joinedDateObj = new Date(emp.joined);
      if (isNaN(joinedDateObj.getTime())) {
        joinedDateObj = null;
      }
    }
    
    if (joinedDateObj) {
      const bd = new Date(dateStr);
      const bdMidnight = new Date(bd.getFullYear(), bd.getMonth(), bd.getDate());
      const joinedMidnight = new Date(joinedDateObj.getFullYear(), joinedDateObj.getMonth(), joinedDateObj.getDate());
      if (bdMidnight < joinedMidnight) {
        return '-';
      }
    }

    const empId = emp.id || emp._id;
    const empStaffId = emp.staff_id;
    const match = globalAttendance.find(rec => 
      (rec.employeeId === empId || rec.employeeId === empStaffId || rec.employeeName === emp.name) && 
      rec.date === dateStr
    );
    if (match) return match.status;

    const hasLeave = globalLeaves.some(l => 
      l.status === 'Approved' && 
      (l.employeeId === empId || l.employeeId === empStaffId || l.employeeName === emp.name) &&
      dateStr >= l.fromDate && dateStr <= l.toDate
    );
    if (hasLeave) return 'Leave';

    const dateObj = new Date(dateStr);
    const dayOfWeek = dateObj.getDay();
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const empWeeklyOff = emp?.weeklyOff || 'Sunday';
    const isWeeklyOff = Array.isArray(empWeeklyOff)
      ? empWeeklyOff.includes(dayNames[dayOfWeek])
      : typeof empWeeklyOff === 'string'
        ? empWeeklyOff.split(',').map(d => d.trim()).includes(dayNames[dayOfWeek])
        : dayNames[dayOfWeek] === empWeeklyOff;
    if (isWeeklyOff) return 'Off';

    // Prevent showing future dates as Present
    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    if (dateStr > todayStr) {
      return '-';
    }

    return 'Present';
  };

  const getLeaveReason = (emp, dateStr) => {
    const empId = emp.id || emp._id;
    const empStaffId = emp.staff_id;
    const match = globalLeaves.find(l => 
      l.status === 'Approved' && 
      (l.employeeId === empId || l.employeeId === empStaffId || l.employeeName === emp.name) &&
      dateStr >= l.fromDate && dateStr <= l.toDate
    );
    if (match) return match.reason || 'Approved Leave';
    return '';
  };

  const handleUpdateEmployeeAttendance = async (emp, dateStr, status) => {
    try {
      const payload = {
        employeeId: emp.id || emp._id || emp.staff_id,
        employeeName: emp.name,
        department: emp.dept || emp.department || '',
        date: dateStr,
        status: status
      };
      const res = await api.post('/hr/attendance', payload);
      if (res.data) {
        showToast("Attendance updated successfully", "success");
        setRefreshPendingTrigger(prev => prev + 1);
      }
    } catch (err) {
      console.error('Failed to update attendance', err);
      showToast("Failed to update attendance", "error");
    }
  };

  const getEmployeeStats = (emp) => {
    const today = new Date();
    const year = today.getFullYear();
    const month = today.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    let present = 0;
    let absent = 0;
    let late = 0;
    let leave = 0;
    let off = 0;

    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const status = getEmployeeDayStatus(emp, dateStr);
      if (status === 'Present') present++;
      else if (status === 'Absent') absent++;
      else if (status === 'Late') late++;
      else if (status === 'Leave') leave++;
      else if (status === 'Off') off++;
    }

    const workingDays = present + late + absent;
    const rate = workingDays > 0 ? Math.round(((present + late) / workingDays) * 100) : 100;

    return { present, absent, late, leave, off, workingDays, rate };
  };

  // Leave Management State
  const [showLeaveModal, setShowLeaveModal] = useState(false);
  const [globalLeaves, setGlobalLeaves] = useState([]);
  const [globalAttendance, setGlobalAttendance] = useState([]);
  const [leaveYear, setLeaveYear] = useState(() => new Date().getFullYear());
  const [leaveBalances, setLeaveBalances] = useState(null);
  const [leaveLedger, setLeaveLedger] = useState([]);
  const [leavePolicy, setLeavePolicy] = useState(null);
  const [isLeavesLoading, setIsLeavesLoading] = useState(false);
  const [leavesError, setLeavesError] = useState(null);
  const [isSubmittingLeave, setIsSubmittingLeave] = useState(false);
  const [leaveActionModal, setLeaveActionModal] = useState({
    isOpen: false,
    leave: null,
    action: 'Approved',
    rejectionReason: '',
    isProcessing: false
  });

  const [newLeave, setNewLeave] = useState({
    type: 'Casual Leave',
    from: '',
    to: '',
    reason: '',
    halfDay: false
  });

  const [selectedDayNum, setSelectedDayNum] = useState(null);

  const fetchGlobalLeaves = async () => {
    try {
      const res = await api.get('/hr/leaves');
      setGlobalLeaves(res.data);
    } catch (err) {
      console.error('Failed to fetch global leaves', err);
    }
  };

  const fetchGlobalAttendance = async () => {
    try {
      const res = await api.get('/hr/attendance');
      setGlobalAttendance(res.data);
    } catch (err) {
      console.error('Failed to fetch global attendance', err);
    }
  };

  const fetchStaffLeaveData = async (targetYear = leaveYear, emp = selectedEmployee) => {
    const targetStaffId = emp?.staff_id || emp?.id || emp?._id || currentUser.staff_id;
    if (!targetStaffId && currentUser.role !== 'admin' && currentUser.role !== 'hr') return;

    setIsLeavesLoading(true);
    setLeavesError(null);
    try {
      const params = { year: targetYear };
      if (targetStaffId) params.staff_id = targetStaffId;

      const [balanceRes, ledgerRes, policyRes] = await Promise.all([
        api.get('/hr/leave-balances', { params }),
        api.get('/hr/leave-ledger', { params }),
        api.get('/hr/leave-policy')
      ]);

      setLeaveBalances(balanceRes.data);
      setLeaveLedger(Array.isArray(ledgerRes.data) ? ledgerRes.data : []);
      setLeavePolicy(policyRes.data);
    } catch (err) {
      console.error('Failed to fetch authoritative staff leave data:', err);
      setLeavesError(err.response?.data?.error || 'Failed to load leave records. Please click Retry.');
    } finally {
      setIsLeavesLoading(false);
    }
  };

  useEffect(() => {
    fetchGlobalLeaves();
    fetchGlobalAttendance();
    fetchStaffLeaveData(leaveYear, selectedEmployee);
  }, [refreshPendingTrigger, leaveYear, selectedEmployee?.staff_id, selectedEmployee?.id]);

  const selectedEmployeeRef = useRef(selectedEmployee);
  selectedEmployeeRef.current = selectedEmployee;
  const leaveYearRef = useRef(leaveYear);
  leaveYearRef.current = leaveYear;

  // Real-time synchronization via Socket.IO, window focus, & interval
  useEffect(() => {
    const tId = currentUser.tenantId || localStorage.getItem('tenantId');
    if (tId) {
      joinTenantRoom(tId);
    }

    const refreshAll = () => {
      fetchGlobalLeaves();
      fetchGlobalAttendance();
      fetchStaffLeaveData(leaveYearRef.current, selectedEmployeeRef.current);
    };

    const onDataChanged = (data) => {
      if (data && (data.type === 'leaves' || data.type === 'attendance' || data.type === 'staff')) {
        refreshAll();
      }
    };

    const handleSync = (e) => {
      const { type } = e.detail || {};
      if (!type || type === 'leaves' || type === 'leave' || type === 'attendance' || type === 'all') {
        refreshAll();
      }
    };

    const onWindowFocus = () => {
      refreshAll();
    };

    socket.on('data_changed', onDataChanged);
    window.addEventListener('curoxa_sync', handleSync);
    window.addEventListener('focus', onWindowFocus);

    return () => {
      socket.off('data_changed', onDataChanged);
      window.removeEventListener('curoxa_sync', handleSync);
      window.removeEventListener('focus', onWindowFocus);
    };
  }, []);

  const leaves = (selectedEmployee || currentUser) ? globalLeaves.filter(l => {
    const emp = selectedEmployee || currentUser;
    const targetId = String(emp.id || emp._id || emp.staff_id || '');
    const targetStaffId = String(emp.staff_id || '');
    const targetName = (emp.name || '').trim().toLowerCase();
    
    return (l.employeeId && (String(l.employeeId) === targetId || String(l.employeeId) === targetStaffId)) ||
           (l.employeeName && l.employeeName.trim().toLowerCase() === targetName);
  }).map(l => ({
    ...l,
    id: l._id || l.id,
    type: l.leaveType || l.type || 'Leave',
    from: l.fromDate || l.from,
    to: l.toDate || l.to,
    approver: l.status === 'Approved' ? (l.approvedBy || 'HR Manager') : (l.approvedBy || 'Pending Review')
  })) : [];

  const attendanceRecord = React.useMemo(() => {
    if (!selectedEmployee) return {};
    const empId = selectedEmployee.id || selectedEmployee._id;
    const empStaffId = selectedEmployee.staff_id;
    const filtered = globalAttendance.filter(rec => 
      rec.employeeId === empId || 
      rec.employeeId === empStaffId || 
      rec.employeeName === selectedEmployee.name
    );
    const dict = {};
    filtered.forEach(rec => {
      dict[rec.date] = rec.status;
    });
    return dict;
  }, [selectedEmployee, globalAttendance]);

  useEffect(() => {
    if (showLeaveModal || previewDoc || leaveActionModal.isOpen) {
      document.body.classList.add('modal-open');
    } else {
      document.body.classList.remove('modal-open');
    }
    return () => {
      document.body.classList.remove('modal-open');
    };
  }, [showLeaveModal, previewDoc, leaveActionModal.isOpen]);

  const getAllPendingLeaves = () => {
    return globalLeaves.filter(l => l.status === 'Pending').map(l => {
      const emp = employees.find(e => e.id === l.employeeId || e.staff_id === l.employeeId) || {
        name: l.employeeName,
        staff_id: l.employeeId,
        dept: l.department
      };
      return {
        ...l,
        id: l._id || l.id,
        from: l.fromDate,
        to: l.toDate,
        employee: emp
      };
    });
  };

  const handleOpenLeaveActionModal = (leave, action) => {
    setLeaveActionModal({
      isOpen: true,
      leave,
      action,
      rejectionReason: '',
      isProcessing: false
    });
  };

  const handleConfirmLeaveAction = async () => {
    if (!leaveActionModal.leave || leaveActionModal.isProcessing) return;
    setLeaveActionModal(prev => ({ ...prev, isProcessing: true }));
    const leave = leaveActionModal.leave;
    const leaveId = leave.id || leave._id;
    const action = leaveActionModal.action;

    try {
      const payload = {
        status: action,
        approvedBy: currentUser.name || 'HR Administrator',
        approvedDate: new Date().toISOString().split('T')[0]
      };
      if (action === 'Rejected') {
        payload.rejectionReason = leaveActionModal.rejectionReason || '';
      }

      const res = await api.put(`/hr/leaves/${leaveId}`, payload);
      if (res.data) {
        showToast(`Leave request ${action.toLowerCase()} successfully`, "success");
        setLeaveActionModal({ isOpen: false, leave: null, action: 'Approved', rejectionReason: '', isProcessing: false });
        setRefreshPendingTrigger(prev => prev + 1);
        fetchGlobalLeaves();
        fetchStaffLeaveData(leaveYear, selectedEmployee);
      }
    } catch (err) {
      console.error('Failed to process leave request:', err);
      const errMsg = err.response?.data?.error || `Failed to ${action.toLowerCase()} leave request`;
      showToast(errMsg, 'error');
      setLeaveActionModal(prev => ({ ...prev, isProcessing: false }));
    }
  };

  const handleApproveRejectLeave = async (emp, leaveId, status) => {
    const foundLeave = globalLeaves.find(l => (l._id === leaveId || l.id === leaveId));
    if (foundLeave) {
      handleOpenLeaveActionModal(foundLeave, status);
    }
  };

  // Canonical leave type normalizer to prevent runtime errors
  const normalizeLeaveTypeName = (name = '') => {
    const clean = String(name || '').toLowerCase().trim();
    if (clean.includes('sick')) return 'Sick Leave';
    if (clean.includes('casual')) return 'Casual Leave';
    if (clean.includes('earned') || clean.includes('annual')) return 'Earned Leave';
    if (clean.includes('maternity')) return 'Maternity Leave';
    if (clean.includes('paternity')) return 'Paternity Leave';
    if (clean.includes('comp')) return 'Comp Off';
    if (clean.includes('loss') || clean.includes('unpaid') || clean.includes('lwp')) return 'Loss of Pay';
    return name || 'Leave';
  };

  // Staff gender eligibility check
  const isLeaveTypeEligibleForStaff = (typeName, staffGender) => {
    const clean = String(typeName || '').toLowerCase().trim();
    const g = String(staffGender || '').toLowerCase().trim();
    if (clean.includes('maternity')) {
      return g === 'female' || g === 'f';
    }
    if (clean.includes('paternity')) {
      return g === 'male' || g === 'm';
    }
    return true;
  };

  // Authoritative operational year range (only from tenant start year to current+1)
  const tenantStartYear = leaveBalances?.tenantStartYear || leavePolicy?.tenantStartYear || 2026;
  const currentYear = new Date().getFullYear();
  const maxYear = currentYear + 1;
  const availableYears = [];
  for (let y = Math.max(2000, tenantStartYear); y <= maxYear; y++) {
    availableYears.push(y);
  }

  // Authoritative balance accessors from backend
  const getBalanceForType = (typeName) => {
    if (!leaveBalances || !leaveBalances.balances) return null;
    const clean = String(typeName).trim().toLowerCase();
    const entry = Object.values(leaveBalances.balances).find(
      b => b.leaveType.toLowerCase() === clean || b.code.toLowerCase() === clean
    );
    return entry || null;
  };

  const casualBal = getBalanceForType('Casual Leave') || getBalanceForType('CASUAL') || { currentBalance: 0, consumed: 0, opening: 0, accrued: 0, carryForward: 0 };
  const sickBal = getBalanceForType('Sick Leave') || getBalanceForType('SICK') || { currentBalance: 0, consumed: 0, opening: 0, accrued: 0, carryForward: 0 };
  const earnedBal = getBalanceForType('Earned Leave') || getBalanceForType('EARNED') || { currentBalance: 0, consumed: 0, opening: 0, accrued: 0, carryForward: 0 };

  const casualAvailable = casualBal.currentBalance;
  const sickAvailable = sickBal.currentBalance;
  const earnedAvailable = earnedBal.currentBalance;

  const today = new Date();
  const currentMonthStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
  
  const approvedLeaves = leaves.filter(l => l.status === 'Approved');
  const takenThisMonth = approvedLeaves
    .filter(l => (l.fromDate || l.from || '').startsWith(currentMonthStr))
    .reduce((acc, curr) => acc + (Number(curr.days) || 0), 0);

  // Form submit handler for staff new leave request
  const handleApplyLeave = async (e) => {
    e.preventDefault();
    if (isSubmittingLeave) return;

    if (!newLeave.from || !newLeave.to) {
      showToast('Please select valid start and end dates', 'error');
      return;
    }
    if (newLeave.from > newLeave.to) {
      showToast('Start date cannot be after end date', 'error');
      return;
    }

    // Calculate days between from and to
    const date1 = new Date(newLeave.from);
    const date2 = new Date(newLeave.to);
    const diffTime = Math.abs(date2 - date1);
    let diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;

    if (newLeave.halfDay) {
      diffDays = 0.5;
    }

    if (diffDays <= 0) {
      showToast('Requested days must be greater than 0', 'error');
      return;
    }

    // Check against leave policy & balance
    const chosenType = newLeave.type || 'Casual Leave';
    const typeBalance = getBalanceForType(chosenType);

    if (typeBalance && typeBalance.paid && typeBalance.code !== 'LWP') {
      if (diffDays > typeBalance.currentBalance) {
        showToast(`Insufficient balance for ${typeBalance.leaveType}. Requested: ${diffDays}d, Available: ${typeBalance.currentBalance}d`, 'error');
        return;
      }
    }

    // Check for conflicting requests in the existing leaves array
    const hasConflict = leaves.some(l => {
      if (l.status === 'Rejected' || l.status === 'Cancelled') return false;
      const lFrom = l.fromDate || l.from;
      const lTo = l.toDate || l.to;
      return (newLeave.from <= lTo && newLeave.to >= lFrom);
    });

    if (hasConflict) {
      showToast('You already have a pending or approved leave request covering these dates', 'error');
      return;
    }

    setIsSubmittingLeave(true);
    try {
      const targetEmpId = selectedEmployee?.staff_id || selectedEmployee?.id || selectedEmployee?._id || currentUser.staff_id;
      const targetEmpName = selectedEmployee?.name || currentUser.name;
      const targetDept = selectedEmployee?.dept || selectedEmployee?.department || currentUser.department || 'General';

      const newRequest = {
        employeeId: targetEmpId,
        employeeName: targetEmpName,
        department: targetDept,
        leaveType: chosenType,
        fromDate: newLeave.from,
        toDate: newLeave.to,
        days: diffDays,
        halfDay: newLeave.halfDay || false,
        status: 'Pending',
        reason: newLeave.reason || ''
      };

      const res = await api.post('/hr/leaves', newRequest);
      if (res.data) {
        showToast('Leave request submitted successfully (Pending Review)', 'success');
        setNewLeave({ type: 'Casual Leave', from: '', to: '', reason: '', halfDay: false });
        setShowLeaveModal(false);
        setRefreshPendingTrigger(prev => prev + 1);
        fetchGlobalLeaves();
        fetchStaffLeaveData(leaveYear, selectedEmployee);
      }
    } catch (err) {
      console.error('Failed to apply for leave:', err);
      showToast(err.response?.data?.error || 'Failed to submit leave request', 'error');
    } finally {
      setIsSubmittingLeave(false);
    }
  };

  // Format date helper
  const formatDate = (dateStr) => {
    const d = new Date(dateStr);
    const day = d.getDate();
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const month = months[d.getMonth()];
    return `${day < 10 ? '0' + day : day} ${month}`;
  };

  // Determine user details based on selected employee context
  const empInitials = selectedEmployee?.name ? selectedEmployee.name.split(' ').map(n => n[0]).join('').toUpperCase() : 'ST';
  const empRoleDisplay = selectedEmployee?.role ? (selectedEmployee.role === 'hr' ? 'HR Manager' : selectedEmployee.role.charAt(0).toUpperCase() + selectedEmployee.role.slice(1)) : 'Staff';
  const empStaffId = selectedEmployee?.staff_id || 'EMP-1042';
  const empJoinedDate = selectedEmployee?.joined || new Date().toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' });
  const empDept = selectedEmployee?.dept || 'Administration';
  const empEmail = selectedEmployee?.email || '';

  const userInitials = empInitials;
  const userRoleDisplay = empRoleDisplay;
  const staffId = empStaffId;
  const joinedDate = empJoinedDate;

  // Back button link based on user role
  const handleGoBack = () => {
    if (onExit) {
      onExit();
    } else {
      if (currentUser.role === 'admin') navigate('/admin');
      else if (currentUser.role === 'doctor') navigate('/doctor');
      else if (currentUser.role === 'receptionist') navigate('/receptionist');
      else if (currentUser.role === 'lab') navigate('/lab');
      else if (currentUser.role === 'pharmacy') navigate('/pharmacy');
      else {
        performLogout(navigate);
      }
    }
  };

  const canModifyCategory = (catKey) => {
    if (currentUser.role === 'admin' || currentUser.role === 'hr') return true;
    return catKey === 'identity_documents' || catKey === 'certifications';
  };

  const canDeleteDoc = (catKey) => {
    if (currentUser.role === 'admin' || currentUser.role === 'hr') return true;
    return catKey === 'identity_documents' || catKey === 'certifications';
  };
  const getDayStatus = (y, m, d) => {
    const dateStr = `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    
    // Check if the date is before selectedEmployee's joined date
    let joinedDateObj = null;
    if (selectedEmployee?.joined && selectedEmployee.joined !== 'Recently') {
      joinedDateObj = new Date(selectedEmployee.joined);
      if (isNaN(joinedDateObj.getTime())) {
        joinedDateObj = null;
      }
    }
    
    if (joinedDateObj) {
      const compareDate = new Date(y, m, d);
      const compareMidnight = new Date(compareDate.getFullYear(), compareDate.getMonth(), compareDate.getDate());
      const joinedMidnight = new Date(joinedDateObj.getFullYear(), joinedDateObj.getMonth(), joinedDateObj.getDate());
      if (compareMidnight < joinedMidnight) {
        return '-';
      }
    }

    // Check if there is an approved leave on this date
    const hasApprovedLeave = leaves.some(l => l.status === 'Approved' && dateStr >= l.from && dateStr <= l.to);
    if (hasApprovedLeave) {
      return 'Leave';
    }

    // Check if there is a rejected leave on this date
    const hasRejectedLeave = leaves.some(l => l.status === 'Rejected' && dateStr >= l.from && dateStr <= l.to);

    const today = new Date();
    const dateObj = new Date(y, m, d);
    const isToday = dateObj.toDateString() === today.toDateString();
    const isPast = dateObj < today && !isToday;
    const isFuture = dateObj > today && !isToday;

    // Check explicit attendance record first (if marked by HR or biometric)
    const record = attendanceRecord[dateStr];

    if (hasRejectedLeave) {
      if (isFuture) {
        return '';
      }
      if (isToday) {
        // If staff came (marked Present/Late/Off), show that. Otherwise show Pending.
        if (record === 'Present' || record === 'Late' || record === 'Off') {
          return record;
        }
        return 'Pending';
      }
      if (isPast) {
        // If staff came (marked Present/Late/Off), show that. Otherwise show Rejected.
        if (record === 'Present' || record === 'Late' || record === 'Off') {
          return record;
        }
        return 'Rejected';
      }
    }

    // Default/fallback attendance logic if no leave overrides apply
    if (record) {
      return record;
    }
    if (isFuture) {
      return ''; // Future day
    }
    if (isToday) {
      return 'Present';
    }
    const dayOfWeek = dateObj.getDay();
    if (dayOfWeek === 0) {
      return 'Off'; // Sunday is off
    }
    
    // Seed hash based on selected employee to show distinct, realistic data per employee
    const empSeed = selectedEmployee ? (selectedEmployee.staff_id || selectedEmployee.name || '') : '';
    let seedVal = 0;
    for (let i = 0; i < empSeed.length; i++) {
      seedVal += empSeed.charCodeAt(i);
    }

    const hash = (y * 33 + m * 7 + d * 13 + seedVal * 17) % 100;
    if (hash < 82) return 'Present';
    if (hash < 90) return 'Late';
    if (hash < 95) return 'Absent';
    return 'Leave';
  };

  if (isAdminOrHR) {
    return (
      <div className="admin-portal">
        <style>{`
          .admin-portal {
            font-family: 'Outfit', sans-serif;
            background: #F8FAFC;
            min-height: calc(100vh / 0.9);
            display: flex;
            color: #1E293B;
            width: 100%;
          }
          
          .admin-sidebar {
            width: 280px;
            background: #FFFFFF;
            border-right: 1px solid #E2E8F0;
            display: flex;
            flex-direction: column;
            position: fixed;
            top: 0;
            left: 0;
            height: calc(100vh / 0.9);
            z-index: 1000;
            transition: all 0.3s ease;
          }
          
          .admin-sidebar.collapsed {
            width: 80px;
          }
          
          .admin-sidebar-brand {
            padding: 24px;
            font-size: 20px;
            font-weight: 800;
            color: #2563EB;
            border-bottom: 1px solid #F1F5F9;
            display: flex;
            align-items: center;
            gap: 12px;
          }
          
          .admin-menu-item {
            display: flex;
            align-items: center;
            gap: 14px;
            padding: 12px 20px;
            border-radius: 12px;
            font-size: 14px;
            font-weight: 600;
            color: #64748B;
            cursor: pointer;
            transition: all 0.2s ease;
            border: none;
            background: transparent;
            width: 100%;
            text-align: left;
            margin-bottom: 4px;
          }
          
          .admin-menu-item:hover {
            background: #F8FAFC;
            color: #0F172A;
          }
          
          .admin-menu-item.active {
            background: #EFF6FF;
            color: #2563EB;
          }
          
          .admin-main-canvas {
            margin-left: 280px;
            flex: 1;
            display: flex;
            flex-direction: column;
            min-width: 0;
            transition: all 0.3s ease;
          }
          
          .admin-main-canvas.collapsed {
            margin-left: 80px;
          }
          
          .admin-top-header {
            height: 70px;
            background: #FFFFFF;
            border-bottom: 1px solid #E2E8F0;
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 0 32px;
            position: sticky;
            top: 0;
            z-index: 99;
          }
          
          .admin-content-body {
            padding: 32px;
            flex: 1;
            display: flex;
            flex-direction: column;
            gap: 24px;
          }
          
          .glass-card {
            background: #FFFFFF;
            border: 1px solid #E2E8F0;
            border-radius: 16px;
            padding: 24px;
            box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.02);
          }
          
          .admin-btn {
            height: 40px;
            padding: 0 16px;
            border-radius: 10px;
            font-size: 13px;
            font-weight: 750;
            display: inline-flex;
            align-items: center;
            gap: 8px;
            cursor: pointer;
            transition: all 0.2s;
            border: 1px solid #E2E8F0;
            background: white;
            color: #334155;
          }
          
          .admin-btn-primary {
            background: #2563EB;
            border-color: #2563EB;
            color: white;
          }
          
          .admin-btn-primary:hover {
            background: #1D4ED8;
          }
          
          .hr-admin-list-table {
            width: 100%;
            border-collapse: collapse;
          }
          
          .hr-admin-list-table th, .hr-admin-list-table td {
            padding: 12px 16px;
            text-align: left;
            border-bottom: 1px solid #F1F5F9;
          }
          
          .hr-admin-list-table th {
            font-size: 11px;
            font-weight: 800;
            color: #94A3B8;
            text-transform: uppercase;
          }
          
          .hr-admin-list-table td {
            font-size: 13px;
            font-weight: 700;
            color: #334155;
          }

          /* Attendance Calendar styles */
          .hr-calendar-day {
            position: relative;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            height: 50px;
            border-radius: 8px;
            font-size: 13px;
            font-weight: 700;
            border: 1px solid #E2E8F0;
            background: #FFFFFF;
            transition: all 0.2s ease;
          }
          
          .hr-calendar-day.status-present { background: #ECFDF5; border-color: #A7F3D0; color: #065F46; }
          .hr-calendar-day.status-absent { background: #FEF2F2; border-color: #FCA5A5; color: #991B1B; }
          .hr-calendar-day.status-late { background: #FFFBEB; border-color: #FDE68A; color: #92400E; }
          .hr-calendar-day.status-leave { background: #EFF6FF; border-color: #BFDBFE; color: #1E40AF; cursor: help; }
          .hr-calendar-day.status-off { background: #F8FAFC; border-color: #E2E8F0; color: #64748B; }
          .hr-calendar-day.status-- { background: #FFFFFF; border-color: #F1F5F9; color: #CBD5E1; }
          
          .hr-tooltip-container {
            visibility: hidden;
            position: absolute;
            bottom: 110%;
            left: 50%;
            transform: translateX(-50%);
            background-color: #0F172A;
            color: #FFFFFF;
            text-align: center;
            padding: 8px 12px;
            border-radius: 8px;
            font-size: 11px;
            width: 180px;
            white-space: normal;
            z-index: 10000;
            opacity: 0;
            transition: opacity 0.2s ease;
            box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1);
            border: 1px solid #334155;
            font-weight: 500;
            line-height: 1.4;
          }
          
          .hr-tooltip-container::after {
            content: "";
            position: absolute;
            top: 100%;
            left: 50%;
            margin-left: -5px;
            border-width: 5px;
            border-style: solid;
            border-color: #0F172A transparent transparent transparent;
          }
          
          .hr-calendar-day.status-leave:hover .hr-tooltip-container {
            visibility: visible;
            opacity: 1;
          }

          .hr-btn-xs {
            padding: 6px 12px;
            font-size: 11.5px;
            font-weight: 800;
            border-radius: 6px;
            cursor: pointer;
            border: none;
            transition: all 0.2s;
            display: inline-flex;
            align-items: center;
            justify-content: center;
          }
          .hr-btn-xs.approve {
            background-color: #10B981;
            color: white;
          }
          .hr-btn-xs.approve:hover {
            background-color: #0D9488;
          }
          .hr-btn-xs.reject {
            background-color: #EF4444;
            color: white;
          }
          .hr-btn-xs.reject:hover {
            background-color: #DC2626;
          }
        `}</style>

        {/* Sidebar */}
        <div className={`admin-sidebar ${isSidebarCollapsed ? 'collapsed' : ''}`}>
          <div className="admin-sidebar-brand">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/></svg>
            {!isSidebarCollapsed && <span style={{ fontWeight: 800 }}>Curoxa HR</span>}
          </div>

          <div style={{ flex: 1, padding: '16px' }} data-lenis-prevent>
            <button 
              className={`admin-menu-item ${activeTab === 'hr-dashboard' ? 'active' : ''}`}
              onClick={() => setActiveTab('hr-dashboard')}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect width="7" height="9" x="3" y="3" rx="1"/><rect width="7" height="5" x="14" y="3" rx="1"/><rect width="7" height="9" x="14" y="10" rx="1"/><rect width="7" height="5" x="3" y="14" rx="1"/></svg>
              {!isSidebarCollapsed && <span>HR Dashboard</span>}
            </button>

            <button 
              className={`admin-menu-item ${activeTab === 'hr-directory' ? 'active' : ''}`}
              onClick={() => setActiveTab('hr-directory')}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
              {!isSidebarCollapsed && <span>Team Directory</span>}
            </button>

            <button 
              className={`admin-menu-item ${activeTab === 'hr-attendance' ? 'active' : ''}`}
              onClick={() => setActiveTab('hr-attendance')}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="18" x="3" y="4" rx="2"/><line x1="16" x2="16" y1="2" y2="6"/><line x1="8" x2="8" y1="2" y2="6"/><line x1="3" x2="21" y1="10" y2="10"/><path d="m9 16 2 2 4-4"/></svg>
              {!isSidebarCollapsed && <span>Attendance Tracker</span>}
            </button>

            <button 
              className={`admin-menu-item ${activeTab === 'hr-leaves' ? 'active' : ''}`}
              onClick={() => setActiveTab('hr-leaves')}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M17.8 19.2L16 11l3.5-3.5C21 6 21.5 4 20 4s-2 1-3.5 3.5L8 6l-8.2 1.8 7.3 3.6-1.8 4.6 2.7 2.7 4.6-1.8z"/></svg>
              {!isSidebarCollapsed && <span>Leave Inbox</span>}
            </button>

            <button 
              className={`admin-menu-item ${activeTab === 'hr-payroll' ? 'active' : ''}`}
              onClick={() => setActiveTab('hr-payroll')}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect width="20" height="14" x="2" y="5" rx="2"/><line x1="2" x2="22" y1="10" y2="10"/></svg>
              {!isSidebarCollapsed && <span>Payroll Center</span>}
            </button>

            <button 
              className={`admin-menu-item ${activeTab === 'hr-documents' ? 'active' : ''}`}
              onClick={() => setActiveTab('hr-documents')}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M10 9H8"/><path d="M16 13H8"/><path d="M16 17H8"/></svg>
              {!isSidebarCollapsed && <span>Document Hub</span>}
            </button>



            <button 
              className={`admin-menu-item ${activeTab === 'profile' ? 'active' : ''}`}
              onClick={() => setActiveTab('profile')}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
              {!isSidebarCollapsed && <span>My Profile</span>}
            </button>
          </div>

          <div style={{ padding: '16px', borderTop: '1px solid #F1F5F9' }}>
            <button 
              className="admin-menu-item" 
              onClick={handleGoBack}
              style={{ color: '#DC2626' }}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" x2="9" y1="12" y2="12"/></svg>
              {!isSidebarCollapsed && <span>Exit Portal</span>}
            </button>
          </div>
        </div>

        {/* Main Canvas */}
        <div className={`admin-main-canvas ${isSidebarCollapsed ? 'collapsed' : ''}`}>
          <div className="admin-top-header">
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
              <button 
                onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
                style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#64748B', display: 'flex', alignItems: 'center' }}
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="4" x2="20" y1="12" y2="12"/><line x1="4" x2="20" y1="6" y2="6"/><line x1="4" x2="20" y1="18" y2="18"/></svg>
              </button>
              <div style={{ fontSize: '14px', fontWeight: 700, color: '#475569' }}>
                Clinic Administrator Portal
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: '13.5px', fontWeight: 800 }}>{currentUser.name || 'Priya Arora'}</div>
                <div style={{ fontSize: '11px', color: '#64748B', fontWeight: 600 }}>{currentUser.role?.toUpperCase()}</div>
              </div>
              <div style={{ width: '38px', height: '38px', borderRadius: '50%', background: '#EFF6FF', color: '#2563EB', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: '13px' }}>
                {currentUser.name ? currentUser.name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase() : 'PA'}
              </div>
            </div>
          </div>

          <div className="admin-content-body">
            {activeTab === 'hr-dashboard' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <h1 style={{ fontSize: '24px', fontWeight: 800, color: '#0F172A', margin: 0 }}>HR Operations Dashboard</h1>
                    <p style={{ fontSize: '13.5px', color: '#64748B', margin: '4px 0 0 0' }}>Overview of Sunrise Clinic staff and compliance structures.</p>
                  </div>
                </div>

                {/* Statistics Grid */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '20px' }}>
                  <div className="glass-card" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <span style={{ fontSize: '13px', fontWeight: 700, color: '#64748B' }}>Total Employees</span>
                    <span style={{ fontSize: '28px', fontWeight: 800, color: '#0F172A' }}>{employees.length}</span>
                  </div>
                  <div className="glass-card" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <span style={{ fontSize: '13px', fontWeight: 700, color: '#64748B' }}>Pending Leaves</span>
                    <span style={{ fontSize: '28px', fontWeight: 800, color: '#EA580C' }}>{getAllPendingLeaves().length}</span>
                  </div>
                  <div className="glass-card" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <span style={{ fontSize: '13px', fontWeight: 700, color: '#64748B' }}>Active Departments</span>
                    <span style={{ fontSize: '28px', fontWeight: 800, color: '#2563EB' }}>{new Set(employees.map(e => e.dept)).size || 1}</span>
                  </div>
                  <div className="glass-card" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <span style={{ fontSize: '13px', fontWeight: 700, color: '#64748B' }}>Clinical Staff</span>
                    <span style={{ fontSize: '28px', fontWeight: 800, color: '#10B981' }}>{employees.filter(e => e.role === 'doctor' || e.role === 'lab').length}</span>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.8fr', gap: '20px' }}>
                  {/* Pending Approvals */}
                  <div className="glass-card" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    <span style={{ fontSize: '16px', fontWeight: 800, color: '#0F172A', borderBottom: '1px solid #F1F5F9', paddingBottom: '12px' }}>Pending Leave Requests</span>
                    <div style={{ overflowX: 'auto' }}>
                      {getAllPendingLeaves().length > 0 ? (
                        <table className="hr-admin-list-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                          <thead>
                            <tr>
                              <th>Employee</th>
                              <th>Type</th>
                              <th>Days</th>
                              <th>Actions</th>
                            </tr>
                          </thead>
                          <tbody>
                            {getAllPendingLeaves().slice(0, 3).map(req => (
                              <tr key={req.id}>
                                <td>
                                  <span style={{ fontWeight: 800 }}>{req.employee.name}</span>
                                </td>
                                <td>{req.type}</td>
                                <td>{req.days} days</td>
                                <td>
                                  <div style={{ display: 'flex', gap: '8px' }}>
                                    <button className="hr-btn-xs approve" onClick={() => handleApproveRejectLeave(req.employee, req.id, 'Approved')}>Approve</button>
                                    <button className="hr-btn-xs reject" onClick={() => handleApproveRejectLeave(req.employee, req.id, 'Rejected')}>Reject</button>
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      ) : (
                        <div style={{ textAlign: 'center', padding: '24px 0', color: '#64748B', fontSize: '13px', fontWeight: 600 }}>
                          No pending requests to approve.
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Quick Directory */}
                  <div className="glass-card" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    <span style={{ fontSize: '16px', fontWeight: 800, color: '#0F172A', borderBottom: '1px solid #F1F5F9', paddingBottom: '12px' }}>Staff Overview</span>
                    <div data-lenis-prevent style={{ display: 'flex', flexDirection: 'column', gap: '12px', maxHeight: '250px', overflowY: 'auto' }}>
                      {employees.map(emp => (
                        <div key={emp.staff_id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', borderRadius: '10px', border: '1px solid #EFF6FF', background: '#F8FAFC' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: '#EFF6FF', color: '#2563EB', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 800 }}>
                              {emp.initials}
                            </div>
                            <div>
                              <span style={{ fontSize: '13px', fontWeight: 800, display: 'block' }}>{emp.name}</span>
                              <span style={{ fontSize: '10.5px', color: '#64748B' }}><span style={{ textTransform: 'capitalize' }}>{emp.role}</span> • {emp.dept}</span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'hr-directory' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <h1 style={{ fontSize: '24px', fontWeight: 800, color: '#0F172A', margin: 0 }}>Team Directory</h1>
                    <p style={{ fontSize: '13.5px', color: '#64748B', margin: '4px 0 0 0' }}>Manage roles, account passwords, and employment parameters.</p>
                  </div>
                  <button 
                    className="admin-btn admin-btn-primary" 
                    onClick={() => {
                      setNewStaff({ 
  staff_id: '', password: '', confirmPassword: '', role: getAvailableRoles()[0]?.value || 'doctor', name: '', max_slots: 10, email: '',
  dob: '', gender: '', bloodGroup: '', aadhaar: '', pan: '', address: '', weeklyOff: '',
  emergencyContactName: '', emergencyContactRelation: '', emergencyContactPhone: ''
});
                      setShowAddStaffModal(true);
                    }}
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M5 12h14"/><path d="M12 5v14"/></svg>
                    <span>Add New Employee</span>
                  </button>
                </div>

                {/* Filters Block */}
                <div className="glass-card" style={{ padding: '16px 20px', display: 'flex', gap: '16px', flexWrap: 'wrap', alignItems: 'center' }}>
                  <div style={{ position: 'relative', flex: 1, minWidth: '200px' }}>
                    <svg style={{ position: 'absolute', left: '12px', top: '13px', color: '#94A3B8' }} xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
                    <input 
                      type="text" 
                      placeholder="Search by name, email or staff ID..." 
                      className="hr-input-search"
                      style={{ width: '100%', height: '40px', paddingLeft: '38px', borderRadius: '10px', border: '1px solid #E2E8F0', outline: 'none', fontSize: '13px' }}
                      value={directorySearch}
                      onChange={e => setDirectorySearch(e.target.value)}
                    />
                  </div>
                  <div style={{ width: '180px' }}>
                    <SearchableDropdown
                      value={directoryDeptFilter}
                      onChange={setDirectoryDeptFilter}
                      options={[
                        { value: 'all', label: 'All Departments' },
                        ...Array.from(new Set(employees.map(e => e.dept))).map(d => ({ value: d, label: d }))
                      ]}
                      placeholder="All Departments"
                    />
                  </div>
                  <div style={{ width: '180px' }}>
                    <SearchableDropdown
                      value={directoryRoleFilter}
                      onChange={setDirectoryRoleFilter}
                      options={[
                        { value: 'all', label: 'All Access Levels' },
                        { value: 'doctor', label: 'Doctor' },
                        { value: 'receptionist', label: 'Receptionist' },
                        { value: 'lab', label: 'Laboratory' },
                        { value: 'pharmacy', label: 'Pharmacy' },
                        { value: 'hr', label: 'HR Manager' },
                        { value: 'admin', label: 'System Admin' }
                      ]}
                      placeholder="All Access Levels"
                    />
                  </div>
                </div>

                {/* Directory Grid */}
                <div className="glass-card" style={{ padding: 0 }} data-lenis-prevent>
                  {(() => {
                    const filtered = employees.filter(emp => {
                      const matchesSearch = emp.name.toLowerCase().includes(directorySearch.toLowerCase()) || 
                        emp.staff_id.toLowerCase().includes(directorySearch.toLowerCase()) || 
                        emp.email.toLowerCase().includes(directorySearch.toLowerCase());
                      const matchesDept = directoryDeptFilter === 'all' || emp.dept === directoryDeptFilter;
                      const matchesRole = directoryRoleFilter === 'all' || emp.role === directoryRoleFilter;
                      return matchesSearch && matchesDept && matchesRole;
                    });

                    return (
                      <table className="hr-admin-list-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                          <tr style={{ borderBottom: '1px solid #F1F5F9' }}>
                            <th style={{ padding: '14px 20px', textAlign: 'left', fontSize: '11px', color: '#94A3B8', fontWeight: 800 }}>Employee Name</th>
                            <th style={{ padding: '14px 20px', textAlign: 'left', fontSize: '11px', color: '#94A3B8', fontWeight: 800 }}>Access Level</th>
                            <th style={{ padding: '14px 20px', textAlign: 'left', fontSize: '11px', color: '#94A3B8', fontWeight: 800 }}>Email Address</th>
                            <th style={{ padding: '14px 20px', textAlign: 'left', fontSize: '11px', color: '#94A3B8', fontWeight: 800 }}>Joined Date</th>
                            <th style={{ padding: '14px 20px', textAlign: 'right', fontSize: '11px', color: '#94A3B8', fontWeight: 800 }}>Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {filtered.map(emp => (
                            <tr key={emp.staff_id} style={{ borderBottom: '1px solid #F1F5F9' }}>
                              <td style={{ padding: '14px 20px' }}>
                                <span style={{ fontWeight: 800, color: '#334155' }}>{emp.name}</span>
                                <span style={{ fontSize: '11px', color: '#64748B', display: 'block' }}>{emp.staff_id}</span>
                              </td>
                              <td style={{ padding: '14px 20px', textTransform: 'capitalize' }}>
                                <span style={{ fontSize: '11px', fontWeight: 800, padding: '4px 8px', borderRadius: '6px', background: emp.role === 'admin' || emp.role === 'hr' ? '#EFF6FF' : '#F1F5F9', color: emp.role === 'admin' || emp.role === 'hr' ? '#2563EB' : '#475569' }}>
                                  {emp.role}
                                </span>
                              </td>
                              <td style={{ padding: '14px 20px' }}>{emp.email || 'No email registered'}</td>
                              <td style={{ padding: '14px 20px' }}>{emp.joined}</td>
                              <td style={{ padding: '14px 20px', textAlign: 'right' }}>
                                <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                                  <button 
                                    className="hr-btn-xs" 
                                    style={{ background: '#F1F5F9', color: '#475569', border: '1px solid #CBD5E1' }} 
                                    onClick={() => {
                                      setEditingStaff(emp);
                                      setShowEditStaffModal(true);
                                    }}
                                  >
                                    Edit
                                  </button>
                                  <button className="hr-btn-xs reject" onClick={() => handleDeleteStaff(emp.id)}>Delete</button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    );
                  })()}
                </div>
              </div>
            )}

            {activeTab === 'hr-attendance' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <h1 style={{ fontSize: '24px', fontWeight: 800, color: '#0F172A', margin: 0 }}>Attendance Tracker</h1>
                    <p style={{ fontSize: '13.5px', color: '#64748B', margin: '4px 0 0 0' }}>Update and monitor daily attendance logs for all employees.</p>
                  </div>
                </div>

                {/* Controls bar */}
                <div className="glass-card" style={{ padding: '16px 20px', display: 'flex', gap: '16px', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                    <span style={{ fontSize: '13.5px', fontWeight: 800, color: '#334155' }}>Select Log Date:</span>
                    <input 
                      type="date" 
                      value={attendanceDate}
                      onChange={e => setAttendanceDate(e.target.value)}
                      style={{ height: '38px', padding: '0 12px', borderRadius: '8px', border: '1px solid #E2E8F0', outline: 'none', fontSize: '13px', fontWeight: 700 }}
                    />
                  </div>
                  <div style={{ width: '280px', position: 'relative' }}>
                    <svg style={{ position: 'absolute', left: '12px', top: '11px', color: '#94A3B8' }} xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
                    <input 
                      type="text" 
                      placeholder="Filter staff by name or role..." 
                      className="hr-input-search"
                      style={{ width: '100%', height: '38px', paddingLeft: '36px', borderRadius: '8px', border: '1px solid #E2E8F0', outline: 'none', fontSize: '13px' }}
                      value={attendanceSearch}
                      onChange={e => setAttendanceSearch(e.target.value)}
                    />
                  </div>
                </div>

                {/* Attendance Table */}
                <div className="glass-card" style={{ padding: 0 }} data-lenis-prevent>
                  {(() => {
                    const filtered = employees.filter(emp => 
                      emp.name.toLowerCase().includes(attendanceSearch.toLowerCase()) ||
                      emp.role.toLowerCase().includes(attendanceSearch.toLowerCase())
                    );

                    return (
                      <table className="hr-admin-list-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                          <tr style={{ borderBottom: '1px solid #F1F5F9' }}>
                            <th style={{ padding: '14px 20px', textAlign: 'left', fontSize: '11px', color: '#94A3B8', fontWeight: 800 }}>Employee Name</th>
                            <th style={{ padding: '14px 20px', textAlign: 'left', fontSize: '11px', color: '#94A3B8', fontWeight: 800 }}>Role</th>
                            <th style={{ padding: '14px 20px', textAlign: 'left', fontSize: '11px', color: '#94A3B8', fontWeight: 800 }}>Shift / Hours</th>
                            <th style={{ padding: '14px 20px', textAlign: 'left', fontSize: '11px', color: '#94A3B8', fontWeight: 800 }}>Attendance Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {filtered.map(emp => {
                            const status = getEmployeeDayStatus(emp, attendanceDate);
                            return (
                              <tr key={emp.staff_id} style={{ borderBottom: '1px solid #F1F5F9' }}>
                                <td style={{ padding: '14px 20px' }}>
                                  <span 
                                    style={{ fontWeight: 800, color: '#2563EB', cursor: 'pointer', textDecoration: 'underline' }}
                                    onClick={() => {
                                      setSelectedStaffForCalendar(emp);
                                      setCalendarYear(new Date().getFullYear());
                                      setCalendarMonth(new Date().getMonth());
                                    }}
                                  >
                                    {emp.name}
                                  </span>
                                  <span style={{ fontSize: '11px', color: '#64748B', display: 'block' }}>{emp.staff_id}</span>
                                </td>
                                <td style={{ padding: '14px 20px', textTransform: 'capitalize' }}>
                                  {emp.role}
                                </td>
                                <td style={{ padding: '14px 20px', color: '#64748B' }}>
                                  09:00 AM - 05:00 PM
                                </td>
                                <td style={{ padding: '14px 20px' }}>
                                  <select
                                    value={status}
                                    onChange={e => handleUpdateEmployeeAttendance(emp, attendanceDate, e.target.value)}
                                    style={{
                                      height: '32px',
                                      padding: '0 8px',
                                      borderRadius: '6px',
                                      border: '1px solid #E2E8F0',
                                      fontWeight: 750,
                                      fontSize: '12.5px',
                                      outline: 'none',
                                      color: status === 'Present' ? '#10B981' : status === 'Absent' ? '#EF4444' : status === 'Late' ? '#D97706' : status === 'Leave' ? '#2563EB' : '#64748B',
                                      background: 'white'
                                    }}
                                  >
                                    <option value="Present">Present</option>
                                    <option value="Absent">Absent</option>
                                    <option value="Late">Late</option>
                                    <option value="Leave">Leave</option>
                                    <option value="Off">Weekly Off</option>
                                  </select>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    );
                  })()}
                </div>
              </div>
            )}

            {activeTab === 'hr-leaves' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
                  <div>
                    <h1 style={{ fontSize: '24px', fontWeight: 800, color: '#0F172A', margin: 0 }}>Leave Request Inbox</h1>
                    <p style={{ fontSize: '13.5px', color: '#64748B', margin: '4px 0 0 0' }}>Review, verify balances, and approve or reject clinical staff leave applications.</p>
                  </div>

                  {/* Summary KPI Badges */}
                  <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                    <div style={{ padding: '6px 14px', borderRadius: '8px', background: '#FFFBEB', border: '1px solid #FDE68A', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#D97706' }}></span>
                      <span style={{ fontSize: '12.5px', fontWeight: 700, color: '#B45309' }}>
                        Pending: <strong>{globalLeaves.filter(l => l.status === 'Pending').length}</strong>
                      </span>
                    </div>
                    <div style={{ padding: '6px 14px', borderRadius: '8px', background: '#ECFDF5', border: '1px solid #A7F3D0', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#10B981' }}></span>
                      <span style={{ fontSize: '12.5px', fontWeight: 700, color: '#047857' }}>
                        Approved: <strong>{globalLeaves.filter(l => l.status === 'Approved').length}</strong>
                      </span>
                    </div>
                  </div>
                </div>

                {/* 1. Pending Approvals Section */}
                <div className="glass-card" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px', background: '#FFFFFF', borderRadius: '14px', border: '1px solid #E2E8F0' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #F1F5F9', paddingBottom: '12px' }}>
                    <span style={{ fontSize: '16px', fontWeight: 800, color: '#0F172A' }}>
                      Pending Approvals ({globalLeaves.filter(l => l.status === 'Pending').length})
                    </span>
                    <span style={{ fontSize: '12px', color: '#64748B' }}>Requires administrative review</span>
                  </div>

                  <div style={{ overflowX: 'auto' }}>
                    {globalLeaves.filter(l => l.status === 'Pending').length > 0 ? (
                      <table className="hr-admin-list-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                          <tr style={{ borderBottom: '1px solid #F1F5F9' }}>
                            <th style={{ textAlign: 'left', padding: '12px 14px', fontSize: '11.5px', color: '#64748B', fontWeight: 800 }}>Employee</th>
                            <th style={{ textAlign: 'left', padding: '12px 14px', fontSize: '11.5px', color: '#64748B', fontWeight: 800 }}>Department</th>
                            <th style={{ textAlign: 'left', padding: '12px 14px', fontSize: '11.5px', color: '#64748B', fontWeight: 800 }}>Leave Type</th>
                            <th style={{ textAlign: 'left', padding: '12px 14px', fontSize: '11.5px', color: '#64748B', fontWeight: 800 }}>Dates</th>
                            <th style={{ textAlign: 'left', padding: '12px 14px', fontSize: '11.5px', color: '#64748B', fontWeight: 800 }}>Days</th>
                            <th style={{ textAlign: 'left', padding: '12px 14px', fontSize: '11.5px', color: '#64748B', fontWeight: 800 }}>Reason</th>
                            <th style={{ textAlign: 'left', padding: '12px 14px', fontSize: '11.5px', color: '#64748B', fontWeight: 800 }}>Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {globalLeaves.filter(l => l.status === 'Pending').map(req => {
                            const emp = employees.find(e => e.id === req.employeeId || e.staff_id === req.employeeId) || {
                              name: req.employeeName,
                              staff_id: req.employeeId,
                              dept: req.department || 'General'
                            };

                            return (
                              <tr key={req._id || req.id} style={{ borderBottom: '1px solid #F8FAFC' }}>
                                <td style={{ padding: '12px 14px' }}>
                                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                                    <span style={{ fontWeight: 800, color: '#0F172A', fontSize: '13px' }}>{req.employeeName || emp.name}</span>
                                    <span style={{ fontSize: '11px', color: '#94A3B8' }}>{req.employeeId || emp.staff_id}</span>
                                  </div>
                                </td>
                                <td style={{ padding: '12px 14px', fontSize: '12.5px', color: '#475569', textTransform: 'capitalize' }}>
                                  {req.department || emp.dept || 'General'}
                                </td>
                                <td style={{ padding: '12px 14px', fontWeight: 700, color: '#2563EB', fontSize: '12.5px' }}>
                                  {req.leaveType || req.type}
                                </td>
                                <td style={{ padding: '12px 14px', fontSize: '12.5px', color: '#334155' }}>
                                  {formatDate(req.fromDate || req.from)} - {formatDate(req.toDate || req.to)}
                                </td>
                                <td style={{ padding: '12px 14px', fontSize: '12.5px', fontWeight: 800, color: '#0F172A' }}>
                                  {req.days} day{req.days > 1 ? 's' : ''}
                                </td>
                                <td style={{ padding: '12px 14px', fontStyle: 'italic', color: '#64748B', fontSize: '12px', maxWidth: '240px' }}>
                                  "{req.reason || 'No reason specified'}"
                                </td>
                                <td style={{ padding: '12px 14px' }}>
                                  <div style={{ display: 'flex', gap: '8px' }}>
                                    <button 
                                      className="hr-btn-xs approve" 
                                      onClick={() => handleOpenLeaveActionModal(req, 'Approved')}
                                      style={{ background: '#10B981', color: 'white', border: 'none', padding: '5px 12px', borderRadius: '6px', fontSize: '12px', fontWeight: 700, cursor: 'pointer' }}
                                    >
                                      Approve
                                    </button>
                                    <button 
                                      className="hr-btn-xs reject" 
                                      onClick={() => handleOpenLeaveActionModal(req, 'Rejected')}
                                      style={{ background: '#EF4444', color: 'white', border: 'none', padding: '5px 12px', borderRadius: '6px', fontSize: '12px', fontWeight: 700, cursor: 'pointer' }}
                                    >
                                      Reject
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    ) : (
                      <div style={{ textAlign: 'center', padding: '36px 0', color: '#64748B', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
                        <div style={{ width: '44px', height: '44px', borderRadius: '50%', background: '#F0FDF4', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#16A34A' }}>
                          <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                        </div>
                        <span style={{ fontSize: '14px', fontWeight: 700, color: '#334155' }}>All caught up!</span>
                        <span style={{ fontSize: '12px', color: '#94A3B8' }}>There are no pending leave requests requiring review.</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* 2. Processed Requests History Section */}
                <div className="glass-card" style={{ padding: 0, background: '#FFFFFF', borderRadius: '14px', border: '1px solid #E2E8F0', overflow: 'hidden' }} data-lenis-prevent>
                  <div style={{ padding: '16px 20px', borderBottom: '1px solid #F1F5F9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontWeight: 800, fontSize: '15px', color: '#0F172A' }}>Processed Requests History</span>
                    <span style={{ fontSize: '12px', fontWeight: 700, color: '#64748B' }}>
                      {globalLeaves.filter(l => l.status !== 'Pending').length} record(s)
                    </span>
                  </div>
                  {(() => {
                    const processedLeaves = globalLeaves.filter(l => l.status !== 'Pending');

                    if (processedLeaves.length === 0) {
                      return (
                        <div style={{ textAlign: 'center', padding: '36px 0', color: '#94A3B8', fontSize: '13px' }}>
                          No processed leave requests recorded yet.
                        </div>
                      );
                    }

                    return (
                      <div style={{ overflowX: 'auto' }}>
                        <table className="hr-admin-list-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                          <thead>
                            <tr style={{ borderBottom: '1px solid #F1F5F9', background: '#F8FAFC' }}>
                              <th style={{ textAlign: 'left', padding: '12px 14px', fontSize: '11.5px', color: '#64748B', fontWeight: 800 }}>Employee</th>
                              <th style={{ textAlign: 'left', padding: '12px 14px', fontSize: '11.5px', color: '#64748B', fontWeight: 800 }}>Leave Type</th>
                              <th style={{ textAlign: 'left', padding: '12px 14px', fontSize: '11.5px', color: '#64748B', fontWeight: 800 }}>Dates</th>
                              <th style={{ textAlign: 'left', padding: '12px 14px', fontSize: '11.5px', color: '#64748B', fontWeight: 800 }}>Total Days</th>
                              <th style={{ textAlign: 'left', padding: '12px 14px', fontSize: '11.5px', color: '#64748B', fontWeight: 800 }}>Status</th>
                              <th style={{ textAlign: 'left', padding: '12px 14px', fontSize: '11.5px', color: '#64748B', fontWeight: 800 }}>Approver / Remarks</th>
                            </tr>
                          </thead>
                          <tbody>
                            {processedLeaves.map(l => {
                              const sLower = (l.status || '').toLowerCase();
                              const statusStyles = {
                                approved: { bg: '#ECFDF5', color: '#047857', border: '#A7F3D0' },
                                rejected: { bg: '#FEF2F2', color: '#B91C1C', border: '#FECACA' },
                                cancelled: { bg: '#F8FAFC', color: '#64748B', border: '#E2E8F0' }
                              };
                              const sStyle = statusStyles[sLower] || statusStyles.cancelled;

                              return (
                                <tr key={l._id || l.id} style={{ borderBottom: '1px solid #F8FAFC' }}>
                                  <td style={{ padding: '12px 14px' }}>
                                    <span style={{ fontWeight: 800, color: '#0F172A', fontSize: '13px' }}>{l.employeeName || l.employeeId}</span>
                                    <span style={{ fontSize: '11px', color: '#64748B', display: 'block' }}>{l.employeeId} • {l.department || 'General'}</span>
                                  </td>
                                  <td style={{ padding: '12px 14px', fontWeight: 700, fontSize: '12.5px', color: '#334155' }}>
                                    {l.leaveType || l.type}
                                  </td>
                                  <td style={{ padding: '12px 14px', fontSize: '12.5px', color: '#475569' }}>
                                    {formatDate(l.fromDate || l.from)} - {formatDate(l.toDate || l.to)}
                                  </td>
                                  <td style={{ padding: '12px 14px', fontSize: '12.5px', fontWeight: 800 }}>
                                    {l.days} day(s)
                                  </td>
                                  <td style={{ padding: '12px 14px' }}>
                                    <span style={{
                                      fontSize: '11px',
                                      fontWeight: 800,
                                      padding: '4px 8px',
                                      borderRadius: '6px',
                                      background: sStyle.bg,
                                      color: sStyle.color,
                                      border: `1px solid ${sStyle.border}`,
                                      textTransform: 'capitalize'
                                    }}>
                                      {l.status}
                                    </span>
                                  </td>
                                  <td style={{ padding: '12px 14px', fontSize: '12px', color: '#64748B' }}>
                                    <div>{l.approvedBy || 'HR Administrator'} {l.approvedDate ? `(${l.approvedDate})` : ''}</div>
                                    {l.rejectionReason && (
                                      <div style={{ fontSize: '11px', color: '#DC2626', marginTop: '2px', fontStyle: 'italic' }}>
                                        Remarks: "{l.rejectionReason}"
                                      </div>
                                    )}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    );
                  })()}
                </div>
              </div>
            )}

            {activeTab === 'hr-payroll' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                <div>
                  <h1 style={{ fontSize: '24px', fontWeight: 800, color: '#0F172A', margin: 0 }}>Team Payroll Center</h1>
                  <p style={{ fontSize: '13.5px', color: '#64748B', margin: '4px 0 0 0' }}>Review salary structures, issue slips, and manage uploader logs.</p>
                </div>

                {/* Salary Spreadsheet */}
                <div className="glass-card" style={{ padding: 0 }} data-lenis-prevent>
                  <div style={{ padding: '16px 20px', borderBottom: '1px solid #F1F5F9', fontWeight: 800, fontSize: '15px' }}>
                    Salary & Remuneration Structure
                  </div>
                  <table className="hr-admin-list-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr>
                        <th>Employee Name</th>
                        <th>Department</th>
                        <th>Base Salary</th>
                        <th>Allowances</th>
                        <th>Deductions</th>
                        <th>Net Salary</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {employees.map(emp => {
                        const base = emp.role === 'doctor' ? 95000 : emp.role === 'hr' ? 70000 : 45000;
                        const allowances = emp.role === 'doctor' ? 12000 : 5000;
                        const deductions = 3000;
                        const net = base + allowances - deductions;

                        return (
                          <tr key={emp.staff_id}>
                            <td>
                              <span style={{ fontWeight: 800 }}>{emp.name}</span>
                              <span style={{ fontSize: '11px', color: '#64748B', display: 'block' }}>{emp.staff_id}</span>
                            </td>
                            <td style={{ textTransform: 'capitalize' }}>{emp.dept}</td>
                            <td>₹{base.toLocaleString()}</td>
                            <td>₹{allowances.toLocaleString()}</td>
                            <td>₹{deductions.toLocaleString()}</td>
                            <td><strong style={{ color: '#1E40AF' }}>₹{net.toLocaleString()}</strong></td>
                            <td>
                              <label className="hr-btn-xs" style={{ background: '#2563EB', color: 'white', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" x2="12" y1="3" y2="15"/></svg>
                                <span>Upload Slip</span>
                                <input 
                                  type="file" 
                                  style={{ display: 'none' }} 
                                  accept="application/pdf,image/*" 
                                  onChange={(e) => {
                                    if (e.target.files && e.target.files[0]) {
                                      const file = e.target.files[0];
                                      const reader = new FileReader();
                                      reader.onload = (evt) => {
                                        const key = `curoxa_hr_docs_${emp.staff_id || emp.name}`;
                                        const saved = localStorage.getItem(key);
                                        let docsObj = { appointment_letter: { docs: [] }, offer_letter: { docs: [] }, salary_slips: { title: 'Salary Slips', docs: [] }, identity_documents: { docs: [] }, certifications: { docs: [] } };
                                        if (saved) {
                                          try {
                                            docsObj = JSON.parse(saved);
                                          } catch (err) {}
                                        }
                                        if (!docsObj.salary_slips) docsObj.salary_slips = { title: 'Salary Slips', docs: [] };
                                        const newDoc = {
                                          id: Date.now().toString(),
                                          name: file.name,
                                          type: file.type,
                                          dataUrl: evt.target.result
                                        };
                                        docsObj.salary_slips.docs = [newDoc, ...(docsObj.salary_slips.docs || [])];
                                        localStorage.setItem(key, JSON.stringify(docsObj));
                                        setRefreshPendingTrigger(prev => prev + 1);
                                        showToast(`Payslip issued for ${emp.name}!`, "success");
                                      };
                                      reader.readAsDataURL(file);
                                    }
                                  }}
                                />
                              </label>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {activeTab === 'hr-documents' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <h1 style={{ fontSize: '24px', fontWeight: 800, color: '#0F172A', margin: 0 }}>Central Document Hub</h1>
                    <p style={{ fontSize: '13.5px', color: '#64748B', margin: '4px 0 0 0' }}>Manage credentials, salary slips, and compliance logs for all employees.</p>
                  </div>
                </div>

                {/* Upload Widget */}
                <div className="glass-card" style={{ padding: '20px' }}>
                  <h3 style={{ fontSize: '15px', fontWeight: 800, color: '#0F172A', margin: '0 0 12px 0' }}>Upload New Document on Behalf of Staff</h3>
                  <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', flex: 1, minWidth: '200px' }}>
                      <label style={{ fontSize: '12px', fontWeight: 800, color: '#64748B' }}>Select Employee</label>
                      <SearchableDropdown
                        value={docUploadStaffId}
                        onChange={setDocUploadStaffId}
                        options={employees.map(emp => ({ value: emp.staff_id, label: `${emp.name} (${emp.staff_id})` }))}
                        placeholder="Choose Employee..."
                      />
                    </div>
                    
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', flex: 1, minWidth: '180px' }}>
                      <label style={{ fontSize: '12px', fontWeight: 800, color: '#64748B' }}>Document Category</label>
                      <SearchableDropdown
                        value={docUploadCategory}
                        onChange={setDocUploadCategory}
                        options={[
                          { value: 'appointment_letter', label: 'Appointment Letter' },
                          { value: 'offer_letter', label: 'Offer Letter' },
                          { value: 'salary_slips', label: 'Salary Slips' },
                          { value: 'identity_documents', label: 'Identity Documents' },
                          { value: 'certifications', label: 'Certifications' }
                        ]}
                        placeholder="Select Category..."
                      />
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', flex: 1, minWidth: '200px' }}>
                      <label style={{ fontSize: '12px', fontWeight: 800, color: '#64748B' }}>Select Document File</label>
                      <label 
                        className="hr-btn-xs"
                        style={{ 
                          height: '40px',
                          padding: '0 16px',
                          background: '#2563EB',
                          color: 'white',
                          cursor: 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '6px',
                          borderRadius: '10px',
                          fontWeight: 800,
                          fontSize: '13px',
                          border: 'none',
                          justifyContent: 'center',
                          margin: 0
                        }}
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                        <span>Choose & Upload File</span>
                        <input 
                          type="file" 
                          style={{ display: 'none' }}
                          onChange={(e) => {
                            if (e.target.files && e.target.files[0]) {
                              handleHRUploadDocOnBehalf(docUploadStaffId, docUploadCategory, e.target.files[0]);
                              e.target.value = '';
                            }
                          }}
                        />
                      </label>
                    </div>
                  </div>
                </div>

                {/* Filters Block */}
                <div className="glass-card" style={{ padding: '16px 20px', display: 'flex', gap: '16px', flexWrap: 'wrap', alignItems: 'center' }}>
                  <div style={{ position: 'relative', flex: 1, minWidth: '240px' }}>
                    <svg style={{ position: 'absolute', left: '12px', top: '13px', color: '#94A3B8' }} xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
                    <input 
                      type="text" 
                      placeholder="Search by file name or uploader..." 
                      className="hr-input-search"
                      style={{ width: '100%', height: '40px', paddingLeft: '38px', borderRadius: '10px', border: '1px solid #E2E8F0', outline: 'none', fontSize: '13px' }}
                      value={documentSearch}
                      onChange={e => setDocumentSearch(e.target.value)}
                    />
                  </div>
                  <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                    {['all', 'appointment_letter', 'offer_letter', 'salary_slips', 'identity_documents', 'certifications'].map(cat => {
                      const label = cat === 'all' ? 'All Files' : cat.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
                      const active = documentCategoryFilter === cat;
                      return (
                        <button
                          key={cat}
                          onClick={() => setDocumentCategoryFilter(cat)}
                          style={{
                            height: '36px',
                            padding: '0 14px',
                            borderRadius: '8px',
                            border: active ? 'none' : '1px solid #E2E8F0',
                            background: active ? '#2563EB' : 'white',
                            color: active ? 'white' : '#64748B',
                            fontSize: '12.5px',
                            fontWeight: 700,
                            cursor: 'pointer',
                            transition: 'all 0.2s'
                          }}
                        >
                          {label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Documents List */}
                <div className="glass-card" style={{ padding: 0, overflowX: 'auto' }} data-lenis-prevent>
                  {(() => {
                    const allDocs = getAllEmployeeDocuments();
                    const filteredDocs = allDocs.filter(d => {
                      const matchesSearch = d.name.toLowerCase().includes(documentSearch.toLowerCase()) || 
                        d.employee.name.toLowerCase().includes(documentSearch.toLowerCase()) ||
                        d.employee.staff_id.toLowerCase().includes(documentSearch.toLowerCase());
                      const matchesCat = documentCategoryFilter === 'all' || d.categoryKey === documentCategoryFilter;
                      return matchesSearch && matchesCat;
                    });

                    if (filteredDocs.length === 0) {
                      return (
                        <div style={{ textAlign: 'center', padding: '48px 0', color: '#64748B', fontSize: '13.5px', fontWeight: 600 }}>
                          No employee documents match the selected filters.
                        </div>
                      );
                    }

                    return (
                      <table className="hr-admin-list-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                          <tr style={{ borderBottom: '1px solid #F1F5F9' }}>
                            <th style={{ padding: '14px 20px', textAlign: 'left', fontSize: '11px', color: '#94A3B8', fontWeight: 800 }}>Document Title</th>
                            <th style={{ padding: '14px 20px', textAlign: 'left', fontSize: '11px', color: '#94A3B8', fontWeight: 800 }}>Employee</th>
                            <th style={{ padding: '14px 20px', textAlign: 'left', fontSize: '11px', color: '#94A3B8', fontWeight: 800 }}>Category</th>
                            <th style={{ padding: '14px 20px', textAlign: 'right', fontSize: '11px', color: '#94A3B8', fontWeight: 800 }}>Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {filteredDocs.map(doc => (
                            <tr key={doc.id} style={{ borderBottom: '1px solid #F1F5F9' }}>
                              <td style={{ padding: '14px 20px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#2563EB" strokeWidth="2.5"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/></svg>
                                  <span style={{ fontWeight: 800 }}>{doc.name}</span>
                                </div>
                              </td>
                              <td style={{ padding: '14px 20px' }}>
                                <span style={{ fontWeight: 700 }}>{doc.employee.name}</span>
                                <span style={{ fontSize: '11px', color: '#64748B', display: 'block' }}>{doc.employee.staff_id}</span>
                              </td>
                              <td style={{ padding: '14px 20px' }}>
                                <span style={{ fontSize: '11px', fontWeight: 800, padding: '4px 8px', borderRadius: '6px', background: '#F1F5F9', color: '#475569' }}>
                                  {doc.categoryTitle}
                                </span>
                              </td>
                              <td style={{ padding: '14px 20px', textAlign: 'right' }}>
                                <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                                  <button className="hr-btn-xs" style={{ background: '#3B82F6', color: 'white' }} onClick={() => setPreviewDoc(doc)}>View</button>
                                  <button className="hr-btn-xs" style={{ background: '#F1F5F9', color: '#475569', border: '1px solid #CBD5E1' }} onClick={() => downloadDoc(doc)}>Download</button>
                                  <button className="hr-btn-xs reject" onClick={() => handleDeleteEmployeeDoc(doc.employee, doc.categoryKey, doc.id)}>Delete</button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    );
                  })()}
                </div>
              </div>
            )}



            {activeTab === 'profile' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                <div>
                  <h1 style={{ fontSize: '24px', fontWeight: 800, color: '#0F172A', margin: 0 }}>My Personal Profile</h1>
                  <p style={{ fontSize: '13.5px', color: '#64748B', margin: '4px 0 0 0' }}>View your clinic credentials, join dates, and parameters.</p>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '24px' }}>
                  <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px', padding: '32px' }}>
                    <div style={{ width: '96px', height: '96px', borderRadius: '50%', background: 'linear-gradient(135deg, #3B82F6 0%, #2563EB 100%)', color: 'white', fontSize: '32px', fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '4px solid #EFF6FF' }}>
                      {currentUser.name ? currentUser.name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase() : 'PA'}
                    </div>
                    <div style={{ textAlign: 'center' }}>
                      <h3 style={{ fontSize: '18px', fontWeight: 800, color: '#0F172A', margin: 0 }}>{currentUser.name}</h3>
                      <p style={{ fontSize: '12.5px', color: '#64748B', fontWeight: 600, margin: '4px 0 0 0' }}>{currentUser.role?.toUpperCase()} • Curoxa Clinic</p>
                    </div>
                  </div>
                  <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                    <span style={{ fontSize: '15px', fontWeight: 800, borderBottom: '1px solid #F1F5F9', paddingBottom: '12px' }}>Employment Details</span>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                      <div>
                        <span style={{ fontSize: '11px', color: '#94A3B8', fontWeight: 800, textTransform: 'uppercase' }}>Full Name</span>
                        <p style={{ fontSize: '14px', fontWeight: 700, margin: '4px 0 0 0' }}>{currentUser.name}</p>
                      </div>
                      <div>
                        <span style={{ fontSize: '11px', color: '#94A3B8', fontWeight: 800, textTransform: 'uppercase' }}>Email Address</span>
                        <p style={{ fontSize: '14px', fontWeight: 700, margin: '4px 0 0 0' }}>{currentUser.email || 'staff@curoxa.com'}</p>
                      </div>
                      <div>
                        <span style={{ fontSize: '11px', color: '#94A3B8', fontWeight: 800, textTransform: 'uppercase' }}>Staff ID</span>
                        <p style={{ fontSize: '14px', fontWeight: 700, margin: '4px 0 0 0' }}>{currentUser.staff_id || 'N/A'}</p>
                      </div>
                      <div>
                        <span style={{ fontSize: '11px', color: '#94A3B8', fontWeight: 800, textTransform: 'uppercase' }}>Joined Date</span>
                        <p style={{ fontSize: '14px', fontWeight: 700, margin: '4px 0 0 0' }}>{joinedDate}</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Modals for Admin Mode */}
        {showEditStaffModal && editingStaff && (
          <div 
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: 'rgba(15, 23, 42, 0.3)',
              backdropFilter: 'blur(8px)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 9999
            }}
            onClick={() => { setShowEditStaffModal(false); setShowEditStaffPassword(false); }}
          >
            <div 
              style={{
                background: '#FFFFFF',
                borderRadius: '16px',
                width: '90%',
                maxWidth: '480px',
                boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1), 0 10px 10px -5px rgba(0,0,0,0.04)',
                padding: '24px',
                animation: 'hrSlideIn 0.3s ease'
              }}
              onClick={e => e.stopPropagation()}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', borderBottom: '1px solid #E2E8F0', paddingBottom: '12px' }}>
                <span style={{ fontSize: '18px', fontWeight: 800, color: '#0F172A' }}>Edit Staff Account</span>
                <button 
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748B' }}
                  onClick={() => { setShowEditStaffModal(false); setShowEditStaffPassword(false); }}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" x2="6" y1="6" y2="18"/><line x1="6" x2="18" y1="6" y2="18"/></svg>
                </button>
              </div>
              
              <form onSubmit={handleEditStaff} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontSize: '12.5px', fontWeight: 700, color: '#334155' }}>Full Name</label>
                  <input 
                    type="text" 
                    style={{ height: '40px', padding: '0 12px', border: '1px solid #CBD5E1', borderRadius: '8px', fontSize: '14px', outline: 'none' }}
                    value={editingStaff.name} 
                    onChange={e => setEditingStaff({...editingStaff, name: e.target.value})} 
                    placeholder="e.g. Dr. Jane Smith" 
                    required 
                  />
                </div>
                {/* Password field: hidden when HR user edits an admin-level account */}
                {(currentUser.role === 'admin' || (editingStaff.role !== 'admin' && editingStaff.role !== 'superadmin')) && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <label style={{ fontSize: '12.5px', fontWeight: 700, color: '#334155' }}>Login Password (leave empty to keep unchanged)</label>
                    <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                      <input 
                        type={showEditStaffPassword ? 'text' : 'password'} 
                        style={{ height: '40px', padding: '0 40px 0 12px', border: '1px solid #CBD5E1', borderRadius: '8px', fontSize: '14px', outline: 'none', width: '100%' }}
                        value={editingStaff.password || ''} 
                        onChange={e => setEditingStaff({...editingStaff, password: e.target.value})} 
                        placeholder="••••••••" 
                        autoComplete="new-password"
                      />
                      <button 
                        type="button"
                        onClick={() => setShowEditStaffPassword(!showEditStaffPassword)}
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
                        {showEditStaffPassword ? (
                          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"/><path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"/><path d="M6.61 6.61A13.52 13.52 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61"/><line x1="2" x2="22" y1="2" y2="22"/></svg>
                        ) : (
                          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>
                        )}
                      </button>
                    </div>
                  </div>
                )}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontSize: '12.5px', fontWeight: 700, color: '#334155' }}>Access Role</label>
                  <SearchableDropdown
                    value={editingStaff.role} 
                    onChange={val => setEditingStaff({...editingStaff, role: val})}
                    options={getAvailableRoles()}
                    placeholder="Select Role"
                  />
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontSize: '12.5px', fontWeight: 700, color: '#334155' }}>Google Login Email</label>
                  <input 
                    type="email" 
                    style={{ height: '40px', padding: '0 12px', border: '1px solid #CBD5E1', borderRadius: '8px', fontSize: '14px', outline: 'none' }}
                    value={editingStaff.email || ''} 
                    onChange={e => setEditingStaff({...editingStaff, email: e.target.value})} 
                    placeholder="e.g. doctor.sarah@gmail.com" 
                  />
                </div>

                {editingStaff.role === 'doctor' && (
                  <>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      <label style={{ fontSize: '12.5px', fontWeight: 700, color: '#334155' }}>Daily Max Appointment Slots</label>
                      <input 
                        type="number" 
                        style={{ height: '40px', padding: '0 12px', border: '1px solid #CBD5E1', borderRadius: '8px', fontSize: '14px', outline: 'none' }}
                        min="1" 
                        max="100" 
                        value={editingStaff.max_slots || 10} 
                        onChange={e => setEditingStaff({...editingStaff, max_slots: Number(e.target.value)})} 
                        required 
                      />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      <label style={{ fontSize: '12.5px', fontWeight: 700, color: '#334155' }}>Doctor Consultation Fee (₹)</label>
                      <input 
                        type="number" 
                        style={{ height: '40px', padding: '0 12px', border: '1px solid #CBD5E1', borderRadius: '8px', fontSize: '14px', outline: 'none' }}
                        min="0" 
                        placeholder="e.g. 500"
                        value={editingStaff.consultationFee !== undefined ? editingStaff.consultationFee : 500} 
                        onChange={e => setEditingStaff({...editingStaff, consultationFee: e.target.value !== '' ? Number(e.target.value) : ''})} 
                        required 
                      />
                    </div>
                  </>
                )}

                {/* Weekly Off selector */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontSize: '12.5px', fontWeight: 700, color: '#334155' }}>Weekly Off Days</label>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                    {['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].map(day => {
                      const isSelected = Array.isArray(editingStaff.weeklyOff)
                        ? editingStaff.weeklyOff.includes(day)
                        : (editingStaff.weeklyOff || '').split(',').map(d => d.trim()).includes(day);
                      return (
                        <button
                          key={day}
                          type="button"
                          onClick={() => {
                            let currentOffs = Array.isArray(editingStaff.weeklyOff)
                              ? [...editingStaff.weeklyOff]
                              : (editingStaff.weeklyOff ? editingStaff.weeklyOff.split(',').map(d => d.trim()) : []);
                            if (currentOffs.includes(day)) {
                              currentOffs = currentOffs.filter(d => d !== day);
                            } else {
                              currentOffs.push(day);
                            }
                            setEditingStaff({...editingStaff, weeklyOff: currentOffs});
                          }}
                          style={{
                            padding: '6px 10px',
                            borderRadius: '6px',
                            fontSize: '12px',
                            fontWeight: 600,
                            border: '1px solid ' + (isSelected ? '#2563EB' : '#CBD5E1'),
                            background: isSelected ? '#2563EB' : '#FFFFFF',
                            color: isSelected ? '#FFFFFF' : '#475569',
                            cursor: 'pointer',
                            transition: 'all 0.2s'
                          }}
                        >
                          {day.slice(0, 3)}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <button 
                  type="submit" 
                  disabled={loading} 
                  style={{
                    height: '44px',
                    borderRadius: '8px',
                    border: 'none',
                    background: 'linear-gradient(135deg, #2563EB 0%, #1D4ED8 100%)',
                    color: '#FFFFFF',
                    fontSize: '14px',
                    fontWeight: 800,
                    cursor: loading ? 'not-allowed' : 'pointer',
                    opacity: loading ? 0.7 : 1,
                    marginTop: '10px'
                  }}
                >
                  {loading ? 'Updating...' : 'Save Changes'}
                </button>
              </form>
            </div>
          </div>
        )}

        {/* Attendance Calendar Modal */}
        {selectedStaffForCalendar && (
          <div 
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: 'rgba(15, 23, 42, 0.3)',
              backdropFilter: 'blur(8px)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 9999
            }}
            onClick={() => setSelectedStaffForCalendar(null)}
          >
            <div 
              style={{
                background: '#FFFFFF',
                borderRadius: '16px',
                width: '90%',
                maxWidth: '520px',
                boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1), 0 10px 10px -5px rgba(0,0,0,0.04)',
                padding: '24px',
                animation: 'hrSlideIn 0.3s ease',
                maxHeight: '90vh',
                overflowY: 'auto'
              }}
              onClick={e => e.stopPropagation()}
            >
              {/* Modal Header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', borderBottom: '1px solid #E2E8F0', paddingBottom: '12px' }}>
                <div>
                  <h3 style={{ fontSize: '18px', fontWeight: 800, color: '#0F172A', margin: 0 }}>
                    Attendance History
                  </h3>
                  <span style={{ fontSize: '13px', color: '#2563EB', fontWeight: 600 }}>
                    {selectedStaffForCalendar.name} ({selectedStaffForCalendar.staff_id})
                  </span>
                </div>
                <button 
                  onClick={() => setSelectedStaffForCalendar(null)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748B', display: 'flex', alignItems: 'center', padding: '4px' }}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                </button>
              </div>

              {/* Month/Year Navigation */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button 
                    onClick={() => {
                      if (calendarMonth === 0) {
                        setCalendarMonth(11);
                        setCalendarYear(prev => prev - 1);
                      } else {
                        setCalendarMonth(prev => prev - 1);
                      }
                    }}
                    style={{ background: '#F1F5F9', border: 'none', borderRadius: '6px', padding: '6px 10px', cursor: 'pointer', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                  >
                    &larr;
                  </button>
                  <button 
                    onClick={() => {
                      if (calendarMonth === 11) {
                        setCalendarMonth(0);
                        setCalendarYear(prev => prev + 1);
                      } else {
                        setCalendarMonth(prev => prev + 1);
                      }
                    }}
                    style={{ background: '#F1F5F9', border: 'none', borderRadius: '6px', padding: '6px 10px', cursor: 'pointer', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                  >
                    &rarr;
                  </button>
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <select 
                    value={calendarMonth} 
                    onChange={e => setCalendarMonth(parseInt(e.target.value))}
                    style={{ padding: '6px 10px', borderRadius: '6px', border: '1px solid #E2E8F0', fontWeight: 700, fontSize: '13px', outline: 'none' }}
                  >
                    {['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'].map((m, idx) => (
                      <option key={m} value={idx}>{m}</option>
                    ))}
                  </select>
                  <select 
                    value={calendarYear} 
                    onChange={e => setCalendarYear(parseInt(e.target.value))}
                    style={{ padding: '6px 10px', borderRadius: '6px', border: '1px solid #E2E8F0', fontWeight: 700, fontSize: '13px', outline: 'none' }}
                  >
                    {availableYears.map(y => (
                      <option key={y} value={y}>{y}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Calendar Grid */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '8px', textAlign: 'center', marginBottom: '20px' }}>
                {/* Weekday headers */}
                {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
                  <div key={d} style={{ fontSize: '11px', fontWeight: 800, color: '#94A3B8', textTransform: 'uppercase', paddingBottom: '4px' }}>
                    {d}
                  </div>
                ))}

                {/* Blank days offset */}
                {(() => {
                  const firstDayIndex = new Date(calendarYear, calendarMonth, 1).getDay();
                  const blanks = [];
                  for (let i = 0; i < firstDayIndex; i++) {
                    blanks.push(<div key={`blank-${i}`} />);
                  }
                  return blanks;
                })()}

                {/* Days of the month */}
                {(() => {
                  const totalDays = new Date(calendarYear, calendarMonth + 1, 0).getDate();
                  const dayCards = [];
                  for (let day = 1; day <= totalDays; day++) {
                    const dateStr = `${calendarYear}-${String(calendarMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                    const status = getEmployeeDayStatus(selectedStaffForCalendar, dateStr);
                    const leaveReason = status === 'Leave' ? getLeaveReason(selectedStaffForCalendar, dateStr) : '';

                    dayCards.push(
                      <div 
                        key={`day-${day}`} 
                        className={`hr-calendar-day status-${status.toLowerCase()}`}
                      >
                        <span style={{ fontSize: '12px' }}>{day}</span>
                        <span style={{ fontSize: '9px', fontWeight: 800, textTransform: 'uppercase' }}>{status}</span>
                        {status === 'Leave' && leaveReason && (
                          <div className="hr-tooltip-container" data-lenis-prevent>
                            <strong>Reason:</strong><br />
                            {leaveReason}
                          </div>
                        )}
                      </div>
                    );
                  }
                  return dayCards;
                })()}
              </div>

              {/* Legend */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', justifyContent: 'center', borderTop: '1px solid #E2E8F0', paddingTop: '16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', fontWeight: 700 }}>
                  <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#10B981' }}></span> Present
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', fontWeight: 700 }}>
                  <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#EF4444' }}></span> Absent
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', fontWeight: 700 }}>
                  <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#F59E0B' }}></span> Late
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', fontWeight: 700 }}>
                  <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#3B82F6' }}></span> Leave (Hover for reason)
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', fontWeight: 700 }}>
                  <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#94A3B8' }}></span> Off Day
                </div>
              </div>
            </div>
          </div>
        )}

        {showAddStaffModal && (
          <div 
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: 'rgba(15, 23, 42, 0.3)',
              backdropFilter: 'blur(8px)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 9999
            }}
            onClick={() => { setShowAddStaffModal(false); setShowAddStaffPassword(false); }}
          >
            <div 
              style={{
                background: '#FFFFFF',
                borderRadius: '16px',
                width: '90%',
                maxWidth: '480px',
                boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1), 0 10px 10px -5px rgba(0,0,0,0.04)',
                padding: '24px',
                animation: 'hrSlideIn 0.3s ease'
              }}
              onClick={e => e.stopPropagation()}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', borderBottom: '1px solid #E2E8F0', paddingBottom: '12px' }}>
                <span style={{ fontSize: '18px', fontWeight: 800, color: '#0F172A' }}>Add New Staff Account</span>
                <button 
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748B' }}
                  onClick={() => { setShowAddStaffModal(false); setShowAddStaffPassword(false); }}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" x2="6" y1="6" y2="18"/><line x1="6" x2="18" y1="6" y2="18"/></svg>
                </button>
              </div>
              
              <form onSubmit={handleAddStaff} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontSize: '12.5px', fontWeight: 700, color: '#334155' }}>Full Name</label>
                  <input 
                    type="text" 
                    style={{ height: '40px', padding: '0 12px', border: '1px solid #CBD5E1', borderRadius: '8px', fontSize: '14px', outline: 'none' }}
                    value={newStaff.name} 
                    onChange={e => setNewStaff({...newStaff, name: e.target.value})} 
                    placeholder="e.g. Dr. Jane Smith" 
                    required 
                  />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontSize: '12.5px', fontWeight: 700, color: '#334155' }}>Username (Staff ID)</label>
                  <input 
                    type="text" 
                    style={{ height: '40px', padding: '0 12px', border: '1px solid #CBD5E1', borderRadius: '8px', fontSize: '14px', outline: 'none' }}
                    value={newStaff.staff_id} 
                    onChange={e => setNewStaff({...newStaff, staff_id: e.target.value})} 
                    placeholder="e.g. janesmith" 
                    required 
                    autoComplete="new-username"
                  />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontSize: '12.5px', fontWeight: 700, color: '#334155' }}>Login Password</label>
                  <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                    <input 
                      type={showAddStaffPassword ? 'text' : 'password'} 
                      style={{ height: '40px', padding: '0 40px 0 12px', border: '1px solid #CBD5E1', borderRadius: '8px', fontSize: '14px', outline: 'none', width: '100%' }}
                      value={newStaff.password} 
                      onChange={e => setNewStaff({...newStaff, password: e.target.value})} 
                      placeholder="••••••••" 
                      required 
                      autoComplete="new-password"
                    />
                    <button 
                      type="button"
                      onClick={() => setShowAddStaffPassword(!showAddStaffPassword)}
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
                      {showAddStaffPassword ? (
                        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"/><path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"/><path d="M6.61 6.61A13.52 13.52 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61"/><line x1="2" x2="22" y1="2" y2="22"/></svg>
                      ) : (
                        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>
                      )}
                    </button>
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontSize: '12.5px', fontWeight: 700, color: '#334155' }}>Confirm Password</label>
                  <input 
                    type={showAddStaffPassword ? 'text' : 'password'} 
                    style={{ height: '40px', padding: '0 12px', border: `1px solid ${newStaff.confirmPassword && newStaff.password !== newStaff.confirmPassword ? '#EF4444' : '#CBD5E1'}`, borderRadius: '8px', fontSize: '14px', outline: 'none' }}
                    value={newStaff.confirmPassword} 
                    onChange={e => setNewStaff({...newStaff, confirmPassword: e.target.value})} 
                    placeholder="Re-enter password" 
                    required 
                    autoComplete="new-password"
                  />
                  {newStaff.confirmPassword && newStaff.password !== newStaff.confirmPassword && (
                    <p style={{ margin: '2px 0 0', fontSize: '11px', color: '#EF4444', fontWeight: 600 }}>Passwords do not match</p>
                  )}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontSize: '12.5px', fontWeight: 700, color: '#334155' }}>Access Role</label>
                  <SearchableDropdown
                    value={newStaff.role} 
                    onChange={val => setNewStaff({...newStaff, role: val})}
                    options={getAvailableRoles()}
                    placeholder="Select Role"
                  />
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontSize: '12.5px', fontWeight: 700, color: '#334155' }}>Google Login Email</label>
                  <input 
                    type="email" 
                    style={{ height: '40px', padding: '0 12px', border: '1px solid #CBD5E1', borderRadius: '8px', fontSize: '14px', outline: 'none' }}
                    value={newStaff.email} 
                    onChange={e => setNewStaff({...newStaff, email: e.target.value})} 
                    placeholder="e.g. doctor.sarah@gmail.com" 
                    autoComplete="off"
                  />
                </div>

                {newStaff.role === 'doctor' && (
                  <>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      <label style={{ fontSize: '12.5px', fontWeight: 700, color: '#334155' }}>Daily Max Appointment Slots</label>
                      <input 
                        type="number" 
                        style={{ height: '40px', padding: '0 12px', border: '1px solid #CBD5E1', borderRadius: '8px', fontSize: '14px', outline: 'none' }}
                        min="1" 
                        max="100" 
                        placeholder="e.g. 10"
                        value={newStaff.max_slots} 
                        onChange={e => setNewStaff({...newStaff, max_slots: Number(e.target.value)})} 
                        required 
                      />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      <label style={{ fontSize: '12.5px', fontWeight: 700, color: '#334155' }}>Doctor Consultation Fee (₹)</label>
                      <input 
                        type="number" 
                        style={{ height: '40px', padding: '0 12px', border: '1px solid #CBD5E1', borderRadius: '8px', fontSize: '14px', outline: 'none' }}
                        min="0" 
                        placeholder="e.g. 500"
                        value={newStaff.consultationFee !== undefined ? newStaff.consultationFee : 500} 
                        onChange={e => setNewStaff({...newStaff, consultationFee: e.target.value !== '' ? Number(e.target.value) : ''})} 
                        required 
                      />
                    </div>
                  </>
                )}

                <div style={{ height: '1px', background: '#E2E8F0', margin: '8px 0' }} />
                <span style={{ fontSize: '13px', fontWeight: 800, color: '#334155' }}>Personal & Demographic Data</span>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <label style={{ fontSize: '11px', fontWeight: 700, color: '#64748B' }}>DATE OF BIRTH</label>
                    <input type="date" style={{ height: '36px', padding: '0 8px', border: '1px solid #CBD5E1', borderRadius: '6px', fontSize: '13px', outline: 'none' }} value={newStaff.dob} onChange={e => setNewStaff({...newStaff, dob: e.target.value})} />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <label style={{ fontSize: '11px', fontWeight: 700, color: '#64748B' }}>GENDER</label>
                    <select style={{ height: '36px', padding: '0 8px', border: '1px solid #CBD5E1', borderRadius: '6px', fontSize: '13px', outline: 'none' }} value={newStaff.gender} onChange={e => setNewStaff({...newStaff, gender: e.target.value})}>
                      <option value="">Select</option><option value="Male">Male</option><option value="Female">Female</option><option value="Other">Other</option>
                    </select>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <label style={{ fontSize: '11px', fontWeight: 700, color: '#64748B' }}>BLOOD GROUP</label>
                    <select style={{ height: '36px', padding: '0 8px', border: '1px solid #CBD5E1', borderRadius: '6px', fontSize: '13px', outline: 'none' }} value={newStaff.bloodGroup} onChange={e => setNewStaff({...newStaff, bloodGroup: e.target.value})}>
                      <option value="">Select</option>{['A+', 'A-', 'B+', 'B-', 'O+', 'O-', 'AB+', 'AB-'].map(bg => <option key={bg} value={bg}>{bg}</option>)}
                    </select>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', gridColumn: 'span 2' }}>
                    <label style={{ fontSize: '11px', fontWeight: 700, color: '#64748B' }}>WEEKLY OFF</label>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                      {['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].map(day => {
                        const isSelected = Array.isArray(newStaff.weeklyOff)
                          ? newStaff.weeklyOff.includes(day)
                          : (newStaff.weeklyOff || '').split(',').map(d => d.trim()).includes(day);
                        return (
                          <button
                            key={day}
                            type="button"
                            onClick={() => {
                              let currentOffs = Array.isArray(newStaff.weeklyOff)
                                ? [...newStaff.weeklyOff]
                                : (newStaff.weeklyOff ? newStaff.weeklyOff.split(',').map(d => d.trim()) : []);
                              if (currentOffs.includes(day)) {
                                currentOffs = currentOffs.filter(d => d !== day);
                              } else {
                                currentOffs.push(day);
                              }
                              setNewStaff({...newStaff, weeklyOff: currentOffs});
                            }}
                            style={{
                              padding: '6px 10px',
                              borderRadius: '6px',
                              fontSize: '12px',
                              fontWeight: 600,
                              border: '1px solid ' + (isSelected ? '#2563EB' : '#CBD5E1'),
                              background: isSelected ? '#2563EB' : '#FFFFFF',
                              color: isSelected ? '#FFFFFF' : '#475569',
                              cursor: 'pointer',
                              transition: 'all 0.2s'
                            }}
                          >
                            {day.slice(0, 3)}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <label style={{ fontSize: '11px', fontWeight: 700, color: '#64748B' }}>AADHAAR</label>
                    <input type="text" placeholder="e.g. 1234-5678-9012" style={{ height: '36px', padding: '0 8px', border: '1px solid #CBD5E1', borderRadius: '6px', fontSize: '13px', fontFamily: 'monospace', outline: 'none' }} value={newStaff.aadhaar} onChange={e => setNewStaff({...newStaff, aadhaar: e.target.value})} />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <label style={{ fontSize: '11px', fontWeight: 700, color: '#64748B' }}>PAN</label>
                    <input type="text" placeholder="e.g. ABCDE1234F" style={{ height: '36px', padding: '0 8px', border: '1px solid #CBD5E1', borderRadius: '6px', fontSize: '13px', fontFamily: 'monospace', outline: 'none' }} value={newStaff.pan} onChange={e => setNewStaff({...newStaff, pan: e.target.value})} />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', gridColumn: '1 / -1' }}>
                    <label style={{ fontSize: '11px', fontWeight: 700, color: '#64748B' }}>ADDRESS</label>
                    <textarea rows="2" placeholder="e.g. Hospital Quarters, Building B" style={{ padding: '8px', border: '1px solid #CBD5E1', borderRadius: '6px', fontSize: '13px', outline: 'none', resize: 'none' }} value={newStaff.address} onChange={e => setNewStaff({...newStaff, address: e.target.value})} />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', gridColumn: '1 / -1' }}>
                    <span style={{ fontSize: '11px', fontWeight: 800, color: '#2563EB', marginTop: '4px' }}>EMERGENCY CONTACT</span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', gridColumn: '1 / -1' }}>
                    <label style={{ fontSize: '11px', fontWeight: 700, color: '#64748B' }}>NAME</label>
                    <input type="text" placeholder="e.g. John Doe" style={{ height: '36px', padding: '0 8px', border: '1px solid #CBD5E1', borderRadius: '6px', fontSize: '13px', outline: 'none' }} value={newStaff.emergencyContactName} onChange={e => setNewStaff({...newStaff, emergencyContactName: e.target.value})} />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <label style={{ fontSize: '11px', fontWeight: 700, color: '#64748B' }}>RELATION</label>
                    <input type="text" placeholder="e.g. Spouse" style={{ height: '36px', padding: '0 8px', border: '1px solid #CBD5E1', borderRadius: '6px', fontSize: '13px', outline: 'none' }} value={newStaff.emergencyContactRelation} onChange={e => setNewStaff({...newStaff, emergencyContactRelation: e.target.value})} />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <label style={{ fontSize: '11px', fontWeight: 700, color: '#64748B' }}>PHONE</label>
                    <input type="tel" placeholder="e.g. 9876543210" style={{ height: '36px', padding: '0 8px', border: '1px solid #CBD5E1', borderRadius: '6px', fontSize: '13px', fontFamily: 'monospace', outline: 'none' }} value={newStaff.emergencyContactPhone} onChange={e => setNewStaff({...newStaff, emergencyContactPhone: e.target.value})} />
                  </div>
                </div>

                <button 
                  type="submit" 
                  disabled={loading} 
                  style={{
                    height: '44px',
                    borderRadius: '8px',
                    border: 'none',
                    background: 'linear-gradient(135deg, #2563EB 0%, #1D4ED8 100%)',
                    color: '#FFFFFF',
                    fontSize: '14px',
                    fontWeight: 800,
                    cursor: loading ? 'not-allowed' : 'pointer',
                    opacity: loading ? 0.7 : 1,
                    marginTop: '10px'
                  }}
                >
                  {loading ? 'Processing...' : 'Create Account'}
                </button>
              </form>
            </div>
          </div>
        )}

        {previewDoc && (
          <div 
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: 'rgba(15, 23, 42, 0.4)',
              backdropFilter: 'blur(10px)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 99999
            }}
            onClick={() => setPreviewDoc(null)}
          >
            <div 
              style={{
                background: '#FFFFFF',
                borderRadius: '16px',
                width: '90%',
                height: '85%',
                maxWidth: '960px',
                boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)',
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden',
                animation: 'hrSlideIn 0.3s cubic-bezier(0.16, 1, 0.3, 1)'
              }}
              onClick={e => e.stopPropagation()}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 24px', borderBottom: '1px solid #E2E8F0' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#2563EB" strokeWidth="2.5"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/></svg>
                  <span style={{ fontSize: '15px', fontWeight: 800, color: '#0F172A' }}>{previewDoc.name}</span>
                </div>
                <button 
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748B', display: 'flex', alignItems: 'center' }}
                  onClick={() => setPreviewDoc(null)}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" x2="6" y1="6" y2="18"/><line x1="6" x2="18" y1="6" y2="18"/></svg>
                </button>
              </div>
              <div style={{ flex: 1, background: '#F1F5F9', padding: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'auto' }}>
                {previewDoc.type?.startsWith('image/') ? (
                  <img src={previewDoc.dataUrl} alt={previewDoc.name} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', borderRadius: '8px', boxShadow: '0 4px 6px rgba(0,0,0,0.05)' }} />
                ) : previewDoc.type === 'application/pdf' ? (
                  <iframe src={previewDoc.dataUrl} title={previewDoc.name} style={{ width: '100%', height: '100%', border: 'none', borderRadius: '8px', boxShadow: '0 4px 6px rgba(0,0,0,0.05)' }} />
                ) : (
                  <div style={{ textAlign: 'center', color: '#64748B' }}>
                    <svg style={{ marginBottom: '12px' }} xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/></svg>
                    <p style={{ fontWeight: 700 }}>Preview not supported for this file type</p>
                    <button className="hr-btn" style={{ marginTop: '12px' }} onClick={() => downloadDoc(previewDoc)}>Download to View</button>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {toast && (
          <div 
            style={{
              position: 'fixed',
              bottom: '24px',
              right: '24px',
              background: toast.type === 'error' ? '#EF4444' : '#10B981',
              color: '#FFFFFF',
              padding: '12px 20px',
              borderRadius: '10px',
              boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              zIndex: 999999,
              animation: 'hrSlideIn 0.25s ease'
            }}
          >
            {toast.type === 'error' ? (
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" x2="12" y1="8" y2="12"/><line x1="12" x2="12.01" y1="16" y2="16"/></svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M20 6 9 17l-5-5"/></svg>
            )}
            <span style={{ fontSize: '13px', fontWeight: 800 }}>{toast.msg}</span>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="hr-portal-container">
      <style>{`
        html, body {
          overflow: hidden !important;
          height: calc(100vh / 0.9) !important;
        }
        .hr-portal-container {
          display: flex;
          height: calc(100vh / 0.9);
          overflow: hidden;
          background-color: #F8FAFC;
          font-family: 'Urbanist', sans-serif;
          color: #0F172A;
        }

        /* Sidebar Design */
        .hr-sidebar {
          width: 256px;
          background-color: #FFFFFF;
          border-right: 1px solid #E2E8F0;
          display: flex;
          flex-direction: column;
          position: fixed;
          top: 0;
          left: 0;
          bottom: 0;
          z-index: 1000;
          transition: all 0.3s ease;
        }
        
        .hr-sidebar.collapsed {
          width: 70px;
        }

        .hr-sidebar-brand {
          padding: 24px;
          font-size: 18px;
          font-weight: 800;
          color: #2563EB;
          border-bottom: 1px solid #F1F5F9;
          display: flex;
          align-items: center;
          gap: 12px;
          white-space: nowrap;
          overflow: visible;
          position: relative;
        }

        .hr-employee-context-panel {
          padding: 16px;
          border-bottom: 1px solid #F1F5F9;
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .hr-employee-context-panel label {
          font-size: 10px;
          font-weight: 800;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          color: #94A3B8;
        }
        .hr-employee-context-select {
          width: 100%;
          padding: 8px 10px;
          border: 1px solid #E2E8F0;
          border-radius: 8px;
          font-size: 13px;
          font-weight: 700;
          color: #334155;
          background-color: #F8FAFC;
          outline: none;
          cursor: pointer;
        }
        .hr-employee-context-select:focus {
          border-color: #2563EB;
          background-color: #FFFFFF;
        }

        .hr-admin-stats-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 16px;
          margin-bottom: 24px;
        }
        .hr-admin-stat-card {
          background: white;
          border: 1px solid #E2E8F0;
          border-radius: 12px;
          padding: 16px 20px;
          display: flex;
          flex-direction: column;
          gap: 4px;
        }
        .hr-admin-stat-lbl {
          font-size: 13px;
          font-weight: 700;
          color: #64748B;
        }
        .hr-admin-stat-val {
          font-size: 24px;
          font-weight: 800;
          color: #0F172A;
        }
        .hr-admin-two-col {
          display: grid;
          grid-template-columns: 1.2fr 0.8fr;
          gap: 20px;
          margin-bottom: 24px;
        }
        .hr-admin-list-table {
          width: 100%;
          border-collapse: collapse;
        }
        .hr-admin-list-table th, .hr-admin-list-table td {
          padding: 12px 16px;
          text-align: left;
          border-bottom: 1px solid #F1F5F9;
        }
        .hr-admin-list-table th {
          font-size: 11px;
          font-weight: 800;
          color: #94A3B8;
          text-transform: uppercase;
        }
        .hr-admin-list-table td {
          font-size: 13px;
          font-weight: 700;
          color: #334155;
        }
        
        .hr-btn-xs {
          padding: 6px 12px;
          font-size: 11.5px;
          font-weight: 800;
          border-radius: 6px;
          cursor: pointer;
          border: none;
          transition: all 0.2s;
        }
        .hr-btn-xs.approve {
          background-color: #10B981;
          color: white;
        }
        .hr-btn-xs.approve:hover {
          background-color: #0D9488;
        }
        .hr-btn-xs.reject {
          background-color: #EF4444;
          color: white;
        }
        .hr-btn-xs.reject:hover {
          background-color: #DC2626;
        }

        .hr-sidebar.collapsed .hr-sidebar-brand {
          padding-left: 0;
          padding-right: 0;
          justify-content: center;
        }

        .hr-sidebar.collapsed .hr-menu-section-title {
          display: none;
        }

        .hr-sidebar.collapsed .hr-menu-item {
          width: 44px;
          height: 44px;
          margin: 6px auto;
          padding: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 12px;
        }

        .hr-sidebar.collapsed .hr-sidebar-footer {
          padding: 16px 0;
          display: flex;
          justify-content: center;
        }

        .hr-sidebar.collapsed .hr-sidebar-footer .hr-menu-item {
          width: 44px;
          height: 44px;
          margin: 0 auto;
          padding: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 12px;
        }

        .hr-brand-logo {
          width: 32px;
          height: 32px;
          border-radius: 8px;
          background: #2563EB;
          color: white;
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: 900;
          flex-shrink: 0;
        }

        .hr-sidebar-menu {
          padding: 24px 16px;
          display: flex;
          flex-direction: column;
          gap: 6px;
          flex: 1;
          overflow-y: auto;
        }

        .hr-menu-section-title {
          font-size: 11px;
          font-weight: 800;
          text-transform: uppercase;
          letter-spacing: 1px;
          color: #94A3B8;
          padding: 0 12px 8px;
          white-space: nowrap;
        }

        .hr-menu-item {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 12px;
          border-radius: 12px;
          font-size: 14px;
          font-weight: 700;
          color: #64748B;
          cursor: pointer;
          transition: all 0.2s ease;
          border: none;
          background: transparent;
          width: 100%;
          text-align: left;
        }

        .hr-menu-item:hover {
          background-color: #F1F5F9;
          color: #0F172A;
        }

        .hr-menu-item.active {
          background-color: #EFF6FF;
          color: #2563EB;
        }

        .hr-menu-item svg {
          flex-shrink: 0;
        }

        .hr-sidebar-footer {
          padding: 16px;
          border-top: 1px solid #F1F5F9;
        }

        /* Main Canvas Layout */
        .hr-main-canvas {
          margin-left: 256px;
          flex: 1;
          display: flex;
          flex-direction: column;
          min-width: 0;
          transition: all 0.3s ease;
          height: calc(100vh / 0.9);
          overflow: hidden;
        }

        .hr-main-canvas.collapsed {
          margin-left: 70px;
        }

        @media (max-width: 1024px) {
          .hr-sidebar {
            transform: translateX(-100%);
            z-index: 2010;
          }
          .hr-sidebar.mobile-open {
            transform: translateX(0);
          }
          .hr-main-canvas,
          .hr-main-canvas.collapsed {
            margin-left: 0 !important;
          }
          .hr-top-header {
            padding: 0 16px;
          }
        }

        /* Top Header */
        .hr-top-header {
          height: 64px;
          background: #FFFFFF;
          border-bottom: 1px solid #E2E8F0;
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0 32px;
          position: sticky;
          top: 0;
          z-index: 99;
        }

        .hr-header-search {
          position: relative;
          width: 320px;
        }

        .hr-header-search input {
          width: 100%;
          height: 38px;
          background-color: #F1F5F9;
          border: 1px solid transparent;
          border-radius: 10px;
          padding-left: 36px;
          font-size: 13px;
          font-weight: 600;
          outline: none;
          transition: all 0.2s;
        }

        .hr-header-search input:focus {
          background-color: white;
          border-color: #2563EB;
        }

        .hr-header-search svg {
          position: absolute;
          left: 12px;
          top: 10px;
          color: #94A3B8;
        }

        .hr-header-actions {
          display: flex;
          align-items: center;
          gap: 16px;
        }

        .hr-icon-badge-btn {
          width: 40px;
          height: 40px;
          border-radius: 10px;
          border: 1px solid #E2E8F0;
          background: white;
          display: flex;
          align-items: center;
          justify-content: center;
          position: relative;
          color: #64748B;
          cursor: pointer;
        }

        .hr-user-avatar-badge {
          width: 34px;
          height: 34px;
          border-radius: 50%;
          background: #EFF6FF;
          border: 1px solid #BFDBFE;
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: 800;
          font-size: 12px;
          color: #2563EB;
        }

        .hr-content-body {
          padding: 32px;
          flex: 1;
          overflow-y: auto;
        }

        /* Profile Banner Card */
        .hr-profile-banner {
          background: white;
          border: 1px solid #E2E8F0;
          border-radius: 16px;
          padding: 24px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 24px;
          box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.02);
        }

        .hr-profile-banner-left {
          display: flex;
          align-items: center;
          gap: 20px;
        }

        .hr-profile-banner-avatar {
          width: 72px;
          height: 72px;
          border-radius: 50%;
          background: linear-gradient(135deg, #2563EB 0%, #1D4ED8 100%);
          color: white;
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: 800;
          font-size: 24px;
          border: 4px solid #EFF6FF;
        }

        .hr-profile-banner-details h2 {
          font-size: 20px;
          font-weight: 800;
          color: #0F172A;
          margin-bottom: 4px;
        }

        .hr-profile-banner-meta {
          display: flex;
          flex-direction: column;
          gap: 2px;
          font-size: 13px;
          color: #64748B;
          font-weight: 600;
        }

        .hr-profile-banner-actions {
          display: flex;
          gap: 12px;
        }

        .hr-btn {
          height: 40px;
          padding: 0 16px;
          border-radius: 10px;
          font-size: 13px;
          font-weight: 750;
          display: inline-flex;
          align-items: center;
          gap: 8px;
          cursor: pointer;
          transition: all 0.2s;
          border: 1px solid #E2E8F0;
          background: white;
          color: #334155;
        }

        .hr-btn-primary {
          background: #2563EB;
          border-color: #2563EB;
          color: white;
        }

        .hr-btn-primary:hover {
          background: #1D4ED8;
        }

        .hr-btn:hover:not(.hr-btn-primary) {
          background: #F8FAFC;
        }

        /* 3-Column Grid Layout */
        .hr-dashboard-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 24px;
        }

        .hr-card {
          background: white;
          border: 1px solid #E2E8F0;
          border-radius: 16px;
          padding: 24px;
          box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.02);
        }

        .hr-card-title {
          font-size: 15px;
          font-weight: 800;
          color: #0F172A;
          margin-bottom: 20px;
        }

        /* Reports To widget */
        .hr-manager-widget {
          display: flex;
          flex-direction: column;
          align-items: flex-start;
          gap: 16px;
        }

        .hr-manager-header {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .hr-manager-avatar {
          width: 44px;
          height: 44px;
          border-radius: 50%;
          background: #F1F5F9;
          color: #475569;
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: 800;
          font-size: 15px;
        }

        .hr-manager-info h4 {
          font-size: 14px;
          font-weight: 800;
          color: #0F172A;
        }

        .hr-manager-info p {
          font-size: 12px;
          color: #64748B;
          font-weight: 600;
        }

        .hr-manager-contacts {
          display: flex;
          flex-direction: column;
          gap: 8px;
          font-size: 12.5px;
          color: #475569;
          font-weight: 600;
          width: 100%;
        }

        .hr-contact-row {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        /* Glance items */
        .hr-glance-list {
          display: flex;
          flex-direction: column;
          gap: 16px;
        }

        .hr-glance-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          font-size: 13.5px;
          font-weight: 700;
          color: #475569;
        }

        .hr-glance-label {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .hr-status-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
        }

        .hr-glance-val {
          font-weight: 800;
          color: #0F172A;
        }

        /* Upcoming List */
        .hr-upcoming-list {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .hr-upcoming-item {
          padding: 12px 14px;
          border-radius: 10px;
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .hr-upcoming-item.payroll {
          background-color: #FAF5FF;
          border-left: 4px solid #A855F7;
        }
        
        .hr-upcoming-item.leave {
          background-color: #ECFDF5;
          border-left: 4px solid #10B981;
        }

        .hr-upcoming-item.policy {
          background-color: #EFF6FF;
          border-left: 4px solid #3B82F6;
        }

        .hr-upcoming-lbl {
          font-size: 10px;
          font-weight: 800;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        .hr-upcoming-item.payroll .hr-upcoming-lbl { color: #A855F7; }
        .hr-upcoming-item.leave .hr-upcoming-lbl { color: #10B981; }
        .hr-upcoming-item.policy .hr-upcoming-lbl { color: #3B82F6; }

        .hr-upcoming-desc {
          font-size: 13px;
          font-weight: 800;
          color: #1F2937;
        }

        /* Attendance Tab Layout */
        .hr-attendance-kpis {
          display: grid;
          grid-template-columns: repeat(5, 1fr);
          gap: 16px;
          margin-bottom: 24px;
        }

        .hr-attendance-kpi-card {
          background: white;
          border: 1px solid #E2E8F0;
          border-radius: 12px;
          padding: 16px;
          display: flex;
          flex-direction: column;
          gap: 12px;
          box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.01);
        }

        .hr-att-kpi-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          font-size: 11px;
          font-weight: 800;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          color: #64748B;
        }

        .hr-att-kpi-val {
          font-size: 24px;
          font-weight: 900;
          color: #0F172A;
        }

        /* Monthly Calendar */
        .hr-calendar-wrapper {
          background: white;
          border: 1px solid #E2E8F0;
          border-radius: 16px;
          padding: 24px;
        }

        .hr-calendar-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 24px;
        }

        .hr-calendar-title {
          font-size: 16px;
          font-weight: 800;
          color: #0F172A;
        }

        .hr-calendar-indicators {
          display: flex;
          gap: 16px;
        }

        .hr-indicator-item {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 12px;
          font-weight: 700;
          color: #64748B;
        }

        .hr-calendar-grid {
          display: grid;
          grid-template-columns: repeat(7, 1fr);
          gap: 12px;
        }

        .hr-calendar-weekday {
          text-align: center;
          font-size: 12px;
          font-weight: 800;
          color: #64748B;
          padding-bottom: 8px;
          border-bottom: 1px solid #F1F5F9;
        }

        .hr-calendar-day-tile {
          background: #F8FAFC;
          border: 1px solid #E2E8F0;
          border-radius: 10px;
          padding: 12px;
          min-height: 80px;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          transition: all 0.2s;
        }

        .hr-calendar-day-tile.empty {
          background: transparent;
          border: none;
        }

        .hr-calendar-day-num {
          font-size: 13px;
          font-weight: 800;
          color: #475569;
        }

        .hr-calendar-day-status {
          font-size: 11px;
          font-weight: 800;
          align-self: flex-start;
          padding: 2px 6px;
          border-radius: 6px;
        }

        .hr-calendar-day-status.present { background: #ECFDF5; color: #10B981; }
        .hr-calendar-day-status.absent { background: #FEF2F2; color: #EF4444; }
        .hr-calendar-day-status.late { background: #FFFBEB; color: #F59E0B; }
        .hr-calendar-day-status.leave { background: #EFF6FF; color: #3B82F6; }
        .hr-calendar-day-status.off { background: #F1F5F9; color: #94A3B8; }
        .hr-calendar-day-status.pending { background: #FFFBEB; color: #F59E0B; }
        .hr-calendar-day-status.rejected { background: #FEF2F2; color: #EF4444; }

        /* Themed calendar tiles */
        .hr-calendar-day-tile.present {
          background: #ECFDF5;
          border-color: #D1FAE5;
        }
        .hr-calendar-day-tile.present .hr-calendar-day-num {
          color: #065F46;
        }
        .hr-calendar-day-tile.present .hr-calendar-day-status {
          background: #10B981;
          color: white;
        }

        .hr-calendar-day-tile.absent {
          background: #FEF2F2;
          border-color: #FEE2E2;
        }
        .hr-calendar-day-tile.absent .hr-calendar-day-num {
          color: #991B1B;
        }
        .hr-calendar-day-tile.absent .hr-calendar-day-status {
          background: #EF4444;
          color: white;
        }

        .hr-calendar-day-tile.late {
          background: #FFFBEB;
          border-color: #FEF3C7;
        }
        .hr-calendar-day-tile.late .hr-calendar-day-num {
          color: #92400E;
        }
        .hr-calendar-day-tile.late .hr-calendar-day-status {
          background: #F59E0B;
          color: white;
        }

        .hr-calendar-day-tile.leave {
          background: #EFF6FF;
          border-color: #DBEAFE;
        }
        .hr-calendar-day-tile.leave .hr-calendar-day-num {
          color: #1E40AF;
        }
        .hr-calendar-day-tile.leave .hr-calendar-day-status {
          background: #3B82F6;
          color: white;
        }

        .hr-calendar-day-tile.off {
          background: #F1F5F9;
          border-color: #E2E8F0;
        }
        .hr-calendar-day-tile.off .hr-calendar-day-num {
          color: #64748B;
        }
        .hr-calendar-day-tile.off .hr-calendar-day-status {
          background: #94A3B8;
          color: white;
        }

        .hr-calendar-day-tile.pending {
          background: #FFFBEB;
          border-color: #FEF3C7;
        }
        .hr-calendar-day-tile.pending .hr-calendar-day-num {
          color: #92400E;
        }
        .hr-calendar-day-tile.pending .hr-calendar-day-status {
          background: #F59E0B;
          color: white;
        }

        .hr-calendar-day-tile.rejected {
          background: #FEF2F2;
          border-color: #FEE2E2;
        }
        .hr-calendar-day-tile.rejected .hr-calendar-day-num {
          color: #991B1B;
        }
        .hr-calendar-day-tile.rejected .hr-calendar-day-status {
          background: #EF4444;
          color: white;
        }

        /* Leave Tab Layout */
        .hr-leave-kpis {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 16px;
          margin-bottom: 24px;
        }

        .hr-leave-kpi-card {
          background: white;
          border: 1px solid #E2E8F0;
          border-radius: 12px;
          padding: 20px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.01);
        }

        .hr-leave-kpi-left {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .hr-leave-kpi-lbl {
          font-size: 11px;
          font-weight: 800;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          color: #64748B;
        }

        .hr-leave-kpi-count {
          font-size: 24px;
          font-weight: 900;
          color: #0F172A;
        }

        .hr-leave-kpi-subtitle {
          font-size: 11px;
          color: #94A3B8;
          font-weight: 600;
        }

        .hr-leave-kpi-icon-wrapper {
          width: 44px;
          height: 44px;
          border-radius: 10px;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .hr-leave-kpi-icon-wrapper.green { background: #ECFDF5; color: #10B981; }
        .hr-leave-kpi-icon-wrapper.blue { background: #EFF6FF; color: #3B82F6; }

        /* Tables */
        .hr-table-card {
          background: white;
          border: 1px solid #E2E8F0;
          border-radius: 16px;
          padding: 24px;
          box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.02);
        }

        .hr-table {
          width: 100%;
          border-collapse: collapse;
          text-align: left;
        }

        .hr-table th {
          font-size: 11px;
          font-weight: 800;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          color: #64748B;
          padding: 12px 16px;
          border-bottom: 1px solid #E2E8F0;
        }

        .hr-table td {
          padding: 14px 16px;
          font-size: 13px;
          font-weight: 700;
          color: #334155;
          border-bottom: 1px solid #F1F5F9;
        }

        .hr-badge {
          display: inline-flex;
          align-items: center;
          padding: 4px 8px;
          border-radius: 6px;
          font-size: 11px;
          font-weight: 800;
        }

        .hr-badge.approved { background: #ECFDF5; color: #047857; }
        .hr-badge.pending { background: #FFFBEB; color: #B45309; }
        .hr-badge.rejected { background: #FEF2F2; color: #B91C1C; }

        /* Leave application modal */
        .hr-modal-overlay {
          position: fixed;
          inset: 0;
          background: rgba(15, 23, 42, 0.4);
          backdrop-filter: blur(8px);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 2000;
        }

        .hr-modal-box {
          background: white;
          border-radius: 16px;
          width: 480px;
          padding: 28px;
          border: 1px solid #E2E8F0;
          box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1);
          animation: scaleUp 0.25s ease-out;
        }

        @keyframes scaleUp {
          from { opacity: 0; transform: scale(0.95); }
          to { opacity: 1; transform: scale(1); }
        }

        .hr-modal-header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          margin-bottom: 24px;
        }

        .hr-modal-header h3 {
          font-size: 20px;
          font-weight: 800;
          color: #0F172A;
          margin: 0;
        }

        .hr-modal-form {
          display: flex;
          flex-direction: column;
          gap: 20px;
        }

        .hr-form-group {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }

        .hr-form-group label {
          font-size: 12.5px;
          font-weight: 700;
          color: #1e293b;
        }

        .hr-form-group select,
        .hr-form-group input,
        .hr-form-group textarea {
          width: 100%;
          height: 44px;
          border: 1.5px solid #E2E8F0;
          border-radius: 8px;
          padding: 0 14px;
          font-size: 13.5px;
          font-weight: 600;
          color: #334155;
          outline: none;
          background-color: #FFFFFF;
          transition: all 0.2s;
        }

        .hr-form-group select {
          appearance: none;
          background-image: url("data:image/svg+xml;charset=UTF-8,%3csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%2364748B' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3e%3cpolyline points='6 9 12 15 18 9'%3e%3c/polyline%3e%3c/svg%3e");
          background-repeat: no-repeat;
          background-position: right 14px center;
          background-size: 16px;
          padding-right: 40px !important;
          cursor: pointer;
        }

        .hr-form-group select:focus,
        .hr-form-group input:focus,
        .hr-form-group textarea:focus {
          border-color: #0070E0;
          box-shadow: 0 0 0 3px rgba(0, 112, 224, 0.1);
        }

        .hr-form-group textarea {
          height: 100px;
          padding: 12px 14px;
          resize: none;
        }

        .hr-half-day-label {
          display: flex;
          align-items: center;
          gap: 10px;
          cursor: pointer;
          user-select: none;
        }

        .hr-half-day-checkbox {
          position: absolute;
          opacity: 0;
          cursor: pointer;
          height: 0;
          width: 0;
        }

        .hr-half-day-custom-check {
          height: 20px;
          width: 20px;
          background-color: #FFF;
          border: 1.5px solid #CBD5E1;
          border-radius: 50%;
          display: inline-block;
          position: relative;
          transition: all 0.2s ease;
        }

        .hr-half-day-label:hover .hr-half-day-checkbox ~ .hr-half-day-custom-check {
          border-color: #94A3B8;
        }

        .hr-half-day-checkbox:checked ~ .hr-half-day-custom-check {
          border-color: #0070E0;
        }

        .hr-half-day-checkbox:checked ~ .hr-half-day-custom-check::after {
          content: "";
          position: absolute;
          top: 4px;
          left: 4px;
          width: 10px;
          height: 10px;
          border-radius: 50%;
          background: #0070E0;
        }

        .hr-modal-footer {
          display: flex;
          justify-content: flex-end;
          gap: 12px;
          margin-top: 12px;
        }

        .hr-modal-cancel-btn {
          background: white;
          border: 1.5px solid #CBD5E1;
          color: #475569;
          font-size: 13.5px;
          font-weight: 700;
          padding: 10px 24px;
          border-radius: 8px;
          cursor: pointer;
          transition: all 0.2s;
        }

        .hr-modal-cancel-btn:hover {
          background: #F8FAFC;
          border-color: #94A3B8;
        }

        .hr-modal-submit-btn {
          background: #0070E0;
          border: none;
          color: white;
          font-size: 13.5px;
          font-weight: 700;
          padding: 10px 24px;
          border-radius: 8px;
          cursor: pointer;
          transition: all 0.2s;
        }

        .hr-modal-submit-btn:hover {
          background: #0059B3;
        }

        /* Hierarchy view components */
        .hr-org-tree {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 32px;
          padding: 24px;
        }

        .hr-node {
          background: white;
          border: 1.5px solid #E2E8F0;
          border-radius: 12px;
          padding: 14px 20px;
          min-width: 180px;
          text-align: center;
          box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.02);
          position: relative;
        }

        .hr-node.primary {
          border-color: #2563EB;
          background: #EFF6FF;
        }

        .hr-node-name {
          font-size: 13.5px;
          font-weight: 800;
          color: #0F172A;
        }

        .hr-node-role {
          font-size: 11px;
          color: #64748B;
          font-weight: 600;
          margin-top: 2px;
        }

        .hr-tree-branch {
          display: flex;
          justify-content: center;
          gap: 40px;
          width: 100%;
        }

        .hr-branch-connector {
          height: 24px;
          width: 2px;
          background: #CBD5E1;
        }

        /* Documents Grid & Cards Layout */
        .hr-docs-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 24px;
          margin-top: 16px;
        }
        @media (max-width: 768px) {
          .hr-docs-grid {
            grid-template-columns: 1fr;
            gap: 16px;
          }
        }
        .hr-doc-card {
          background: white;
          border: 1px solid #E2E8F0;
          border-radius: 16px;
          padding: 24px;
          display: flex;
          flex-direction: column;
          gap: 20px;
          box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.01);
        }
        .hr-doc-card-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
        }
        .hr-doc-card-title-block {
          display: flex;
          align-items: center;
          gap: 12px;
        }
        .hr-doc-icon-badge {
          width: 44px;
          height: 44px;
          border-radius: 12px;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .hr-doc-card-title {
          font-size: 15px;
          font-weight: 800;
          color: #0F172A;
        }
        .hr-doc-list {
          display: flex;
          flex-direction: column;
          gap: 10px;
        }
        .hr-doc-item-row {
          background: #F8FAFC;
          border: 1px solid #EFF6FF;
          border-radius: 10px;
          padding: 10px 14px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
        }
        .hr-doc-item-left {
          display: flex;
          align-items: center;
          gap: 10px;
          color: #334155;
          font-size: 13px;
          font-weight: 700;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .hr-doc-item-actions {
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .hr-doc-action-btn {
          background: transparent;
          border: none;
          cursor: pointer;
          padding: 4px;
          border-radius: 6px;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: background 0.2s;
        }
        .hr-doc-action-btn:hover {
          background: #EFF6FF;
        }
        .hr-doc-upload-label {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          font-size: 12px;
          font-weight: 800;
          color: #2563EB;
          cursor: pointer;
          padding: 6px 12px;
          border-radius: 8px;
          background: #EFF6FF;
          transition: all 0.2s;
          align-self: flex-start;
        }
        .hr-doc-upload-label:hover {
          background: #DBEAFE;
        }

        /* Document Preview Modal */
        .hr-preview-modal-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(15, 23, 42, 0.4);
          backdrop-filter: blur(4px);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 9999;
          animation: fadeIn 0.2s ease-out;
        }
        .hr-preview-modal {
          background: white;
          border-radius: 16px;
          width: 90%;
          max-width: 800px;
          max-height: 90vh;
          display: flex;
          flex-direction: column;
          box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
          overflow: hidden;
          animation: slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1);
        }
        .hr-preview-modal-header {
          padding: 16px 24px;
          border-bottom: 1px solid #E2E8F0;
          display: flex;
          align-items: center;
          justify-content: space-between;
        }
        .hr-preview-modal-title {
          font-size: 16px;
          font-weight: 800;
          color: #0F172A;
        }
        .hr-preview-modal-body {
          padding: 24px;
          overflow-y: auto;
          flex: 1;
          background: #F8FAFC;
          min-height: 400px;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        /* Attendance Month switcher */
        .hr-att-switcher {
          display: flex;
          align-items: center;
          gap: 16px;
          background: white;
          padding: 8px 16px;
          border: 1px solid #E2E8F0;
          border-radius: 12px;
          width: fit-content;
          box-shadow: 0 2px 4px rgba(0,0,0,0.02);
        }
        .hr-att-switcher-btn {
          background: transparent;
          border: none;
          cursor: pointer;
          color: #64748B;
          width: 32px;
          height: 32px;
          border-radius: 8px;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.2s;
        }
        .hr-att-switcher-btn:hover {
          background: #F1F5F9;
          color: #0F172A;
        }
        .hr-att-switcher-title {
          font-size: 15px;
          font-weight: 800;
          color: #0F172A;
          min-width: 140px;
          text-align: center;
        }

        /* Recent Updates / Upcoming Feed */
        .hr-upcoming-list {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }
        .hr-upcoming-item {
          padding: 14px 16px;
          border-radius: 10px;
          border-left: 4px solid #CBD5E1;
          background: #F8FAFC;
          display: flex;
          flex-direction: column;
          gap: 4px;
          transition: transform 0.15s ease;
        }
        .hr-upcoming-item:hover {
          transform: translateX(2px);
        }
        .hr-upcoming-lbl {
          font-size: 10.5px;
          font-weight: 800;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          color: #64748B;
        }
        .hr-upcoming-desc {
          font-size: 13.5px;
          font-weight: 700;
          color: #0F172A;
        }
        /* Type variants */
        .hr-upcoming-item.leave {
          border-left-color: #10B981;
          background: #F0FDF4;
        }
        .hr-upcoming-item.leave .hr-upcoming-lbl { color: #059669; }
        .hr-upcoming-item.rejected {
          border-left-color: #EF4444;
          background: #FEF2F2;
        }
        .hr-upcoming-item.rejected .hr-upcoming-lbl { color: #DC2626; }
        .hr-upcoming-item.pending {
          border-left-color: #F59E0B;
          background: #FFFBEB;
        }
        .hr-upcoming-item.pending .hr-upcoming-lbl { color: #D97706; }
        .hr-upcoming-item.attendance {
          border-left-color: #3B82F6;
          background: #EFF6FF;
        }
        .hr-upcoming-item.attendance .hr-upcoming-lbl { color: #2563EB; }
        .hr-upcoming-item.payroll {
          border-left-color: #8B5CF6;
          background: #F5F3FF;
        }
        .hr-upcoming-item.payroll .hr-upcoming-lbl { color: #7C3AED; }
        .hr-upcoming-item.policy {
          border-left-color: #06B6D4;
          background: #ECFEFF;
        }
        .hr-upcoming-item.policy .hr-upcoming-lbl { color: #0891B2; }

        @media (max-width: 1024px) {
          .hr-dashboard-grid {
            grid-template-columns: 1fr !important;
            gap: 20px !important;
          }
          .hr-attendance-kpis {
            grid-template-columns: repeat(3, 1fr) !important;
            gap: 12px !important;
          }
          .hr-admin-stats-grid {
            grid-template-columns: repeat(2, 1fr) !important;
            gap: 16px !important;
          }
          .hr-admin-two-col {
            grid-template-columns: 1fr !important;
            gap: 20px !important;
          }
          .hr-content-body {
            padding: 16px !important;
          }
          .hr-top-header {
            padding: 0 16px !important;
          }
          .hr-profile-banner {
            flex-direction: column !important;
            align-items: flex-start !important;
            gap: 20px !important;
            padding: 16px !important;
          }
          .hr-profile-banner-left {
            flex-direction: column !important;
            align-items: flex-start !important;
            gap: 12px !important;
          }
        }

        @media (max-width: 768px) {
          .hr-attendance-kpis {
            grid-template-columns: repeat(2, 1fr) !important;
          }
          .hr-admin-stats-grid {
            grid-template-columns: 1fr !important;
          }
          .hr-calendar-wrapper {
            overflow-x: auto !important;
          }
          .hr-calendar-grid {
            min-width: 600px !important;
          }
        }

        @media (max-width: 480px) {
          .hr-attendance-kpis {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>

      {/* Mobile Sidebar Backdrop Overlay */}
      {mobileSidebarOpen && (
        <div className="mobile-backdrop" onClick={() => setMobileSidebarOpen(false)} />
      )}

      {/* Sidebar Navigation */}
      <div className={`hr-sidebar ${isSidebarCollapsed ? 'collapsed' : ''} ${mobileSidebarOpen ? 'mobile-open' : ''}`} data-lenis-prevent>
        <div className="hr-sidebar-brand" style={{ position: 'relative', width: '100%' }}>
          <div className="hr-brand-logo">C</div>
          {!isSidebarCollapsed && <span>Curoxa HR</span>}
          <button 
            className="sidebar-collapse-toggle desktop-only-flex"
            onClick={(e) => {
              e.stopPropagation();
              const newState = !isSidebarCollapsed;
              setIsSidebarCollapsed(newState);
            }}
            style={{
              transform: isSidebarCollapsed ? 'rotate(180deg)' : 'none'
            }}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
          </button>
        </div>

        {(currentUser.role === 'admin' || currentUser.role === 'hr') && !isSidebarCollapsed && (
          <div className="hr-employee-context-panel animate-in" style={{ display: 'flex', flexDirection: 'column', gap: '10px', padding: '16px 16px 12px 16px', borderBottom: '1px solid rgba(226, 232, 240, 0.8)' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <SearchableDropdown
                value={selectedEmployee?.staff_id || ''}
                onChange={(val) => {
                  const found = employees.find(emp => emp.staff_id === val);
                  if (found) setSelectedEmployee(found);
                }}
                options={employees.map(emp => ({
                  value: emp.staff_id,
                  label: `${emp.name} (${emp.role.toUpperCase()})`
                }))}
                placeholder="Choose Employee..."
              />
            </div>
            <button 
              type="button"
              style={{
                width: '100%',
                height: '36px',
                borderRadius: '8px',
                border: 'none',
                background: 'linear-gradient(135deg, #3B82F6 0%, #2563EB 100%)',
                color: '#FFFFFF',
                fontWeight: 800,
                fontSize: '12px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
                boxShadow: '0 2px 4px rgba(37, 99, 235, 0.15)',
                transition: 'all 0.2s'
              }}
              onClick={() => {
                setNewStaff({ 
  staff_id: '', password: '', confirmPassword: '', role: getAvailableRoles()[0]?.value || 'doctor', name: '', max_slots: 10, email: '',
  dob: '', gender: '', bloodGroup: '', aadhaar: '', pan: '', address: '', weeklyOff: '',
  emergencyContactName: '', emergencyContactRelation: '', emergencyContactPhone: ''
});
                setAddStaffError('');
                setShowAddStaffModal(true);
                setShowAddStaffPassword(false);
              }}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14"/><path d="M12 5v14"/></svg>
              <span>Add Staff Member</span>
            </button>
          </div>
        )}

        <div className="hr-sidebar-menu" data-lenis-prevent>
          <div className="hr-menu-section-title">
            {!isSidebarCollapsed ? 'HR & Payroll' : 'HR'}
          </div>
          <button 
            className={`hr-menu-item ${activeTab === 'dashboard' ? 'active' : ''}`}
            onClick={() => { setActiveTab('dashboard'); setMobileSidebarOpen(false); }}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect width="7" height="9" x="3" y="3" rx="1"/><rect width="7" height="5" x="14" y="3" rx="1"/><rect width="7" height="9" x="14" y="10" rx="1"/><rect width="7" height="5" x="3" y="14" rx="1"/></svg>
            {!isSidebarCollapsed && <span>My Dashboard</span>}
          </button>
          
          <button 
            className={`hr-menu-item ${activeTab === 'attendance' ? 'active' : ''}`}
            onClick={() => { setActiveTab('attendance'); setMobileSidebarOpen(false); }}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="18" x="3" y="4" rx="2"/><line x1="16" x2="16" y1="2" y2="6"/><line x1="8" x2="8" y1="2" y2="6"/><line x1="3" x2="21" y1="10" y2="10"/><path d="m9 16 2 2 4-4"/></svg>
            {!isSidebarCollapsed && <span>Attendance</span>}
          </button>

          <button 
            className={`hr-menu-item ${activeTab === 'leave' ? 'active' : ''}`}
            onClick={() => { setActiveTab('leave'); setMobileSidebarOpen(false); }}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M17.8 19.2L16 11l3.5-3.5C21 6 21.5 4 20 4s-2 1-3.5 3.5L8 6l-8.2 1.8 7.3 3.6-1.8 4.6 2.7 2.7 4.6-1.8z"/></svg>
            {!isSidebarCollapsed && <span>Leave Management</span>}
          </button>

          {(currentUser.role === 'admin' || currentUser.role === 'hr') && (
            <button 
              className={`hr-menu-item ${activeTab === 'payroll' ? 'active' : ''}`}
              onClick={() => { setActiveTab('payroll'); setMobileSidebarOpen(false); }}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect width="20" height="14" x="2" y="5" rx="2"/><line x1="2" x2="22" y1="10" y2="10"/></svg>
              {!isSidebarCollapsed && <span>Payroll</span>}
            </button>
          )}



          <button 
            className={`hr-menu-item ${activeTab === 'documents' ? 'active' : ''}`}
            onClick={() => { setActiveTab('documents'); setMobileSidebarOpen(false); }}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M10 9H8"/><path d="M16 13H8"/><path d="M16 17H8"/></svg>
            {!isSidebarCollapsed && <span>Documents</span>}
          </button>

          <button 
            className={`hr-menu-item ${activeTab === 'profile' ? 'active' : ''}`}
            onClick={() => { setActiveTab('profile'); setMobileSidebarOpen(false); }}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
            {!isSidebarCollapsed && <span>My Profile</span>}
          </button>
        </div>

        <div className="hr-sidebar-footer">
          <button 
            className="hr-menu-item" 
            onClick={() => { handleGoBack(); setMobileSidebarOpen(false); }}
            style={{ color: '#DC2626' }}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" x2="9" y1="12" y2="12"/></svg>
            {!isSidebarCollapsed && <span>{currentUser.role === 'hr' ? 'Logout' : 'Exit Portal'}</span>}
          </button>
        </div>
      </div>

      {/* Main Canvas */}
      <div className={`hr-main-canvas ${isSidebarCollapsed ? 'collapsed' : ''}`}>
        <div className="hr-top-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <button 
              className="hr-icon-badge-btn mobile-only-flex"
              onClick={() => setMobileSidebarOpen(!mobileSidebarOpen)}
              style={{ border: 'none', background: 'transparent' }}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="4" x2="20" y1="12" y2="12"/><line x1="4" x2="20" y1="6" y2="6"/><line x1="4" x2="20" y1="18" y2="18"/></svg>
            </button>
            <div className="hr-header-search">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
              <input type="text" placeholder="Search patients, staff, requests..." />
            </div>
          </div>
          <div className="hr-header-actions">
            <div className="hr-icon-badge-btn">
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg>
            </div>
            <div className="hr-user-avatar-badge">
              {userInitials}
            </div>
            <div style={{ textAlign: 'left' }} className="desktop-only">
              <div style={{ fontSize: '13px', fontWeight: 800 }}>{currentUser.name || 'Priya Arora'}</div>
              <div style={{ fontSize: '11px', color: '#64748B', fontWeight: 600 }}>Curoxa Clinic</div>
            </div>
          </div>
        </div>

        <div className="hr-content-body" data-lenis-prevent>
          {/* TAB 1: MY DASHBOARD */}
          {activeTab === 'dashboard' && (() => {
            const today = new Date();
            const y = today.getFullYear();
            const m = today.getMonth();
            const daysInMonth = new Date(y, m + 1, 0).getDate();
            let presentCount = 0;
            let absentCount = 0;
            let lateCount = 0;
            let leaveCount = 0;
            for (let d = 1; d <= daysInMonth; d++) {
              const status = getDayStatus(y, m, d);
              if (status && status !== 'Off') {
                if (status === 'Present') presentCount++;
                else if (status === 'Absent') absentCount++;
                else if (status === 'Late') lateCount++;
                else if (status === 'Leave') leaveCount++;
              }
            }

            return (
              <div className="animate-in">
                {currentUser.role === 'admin' || currentUser.role === 'hr' ? (
                  <>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginBottom: '24px' }}>
                      <h1 style={{ fontSize: '24px', fontWeight: 800 }}>HR Management Dashboard</h1>
                      <p style={{ fontSize: '13px', color: '#64748B', fontWeight: 600 }}>Overview of Curoxa staff and operations</p>
                    </div>

                    <div className="hr-admin-stats-grid">
                      <div className="hr-admin-stat-card semantic-card-info">
                        <span className="hr-admin-stat-lbl">Total Employees</span>
                        <span className="hr-admin-stat-val">{employees.length}</span>
                      </div>
                      <div className="hr-admin-stat-card semantic-card-warning">
                        <span className="hr-admin-stat-lbl">Pending Leaves</span>
                        <span className="hr-admin-stat-val">{getAllPendingLeaves().length}</span>
                      </div>
                      <div className="hr-admin-stat-card semantic-card-info">
                        <span className="hr-admin-stat-lbl">Departments</span>
                        <span className="hr-admin-stat-val">
                          {new Set(employees.map(e => e.dept)).size || 1}
                        </span>
                      </div>
                      <div className="hr-admin-stat-card semantic-card-success">
                        <span className="hr-admin-stat-lbl">Active Context</span>
                        <span className="hr-admin-stat-val" style={{ fontSize: '15px', color: '#2563EB' }}>
                          {selectedEmployee?.name || 'None'}
                        </span>
                      </div>
                    </div>

                    <div className="hr-admin-two-col">
                      <div className="hr-card" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                        <div className="hr-card-title" style={{ fontSize: '16px', borderBottom: '1px solid #F1F5F9', paddingBottom: '12px' }}>
                          Pending Leave Approvals
                        </div>
                        <div style={{ overflowX: 'auto' }}>
                          {getAllPendingLeaves().length > 0 ? (
                            <table className="hr-admin-list-table">
                              <thead>
                                <tr>
                                  <th>Employee</th>
                                  <th>Type</th>
                                  <th>Duration</th>
                                  <th>Days</th>
                                  <th>Actions</th>
                                </tr>
                              </thead>
                              <tbody>
                                {getAllPendingLeaves().map(req => (
                                  <tr key={req.id}>
                                    <td>
                                      <div style={{ display: 'flex', flexDirection: 'column' }}>
                                        <span style={{ fontWeight: 800 }}>{req.employee.name}</span>
                                        <span style={{ fontSize: '11px', color: '#94A3B8' }}>{req.employee.staff_id}</span>
                                      </div>
                                    </td>
                                    <td>{req.type}</td>
                                    <td>{formatDate(req.from)} - {formatDate(req.to)}</td>
                                    <td>{req.days} days</td>
                                    <td>
                                      <div style={{ display: 'flex', gap: '8px' }}>
                                        <button 
                                          className="hr-btn-xs approve" 
                                          onClick={() => handleApproveRejectLeave(req.employee, req.id, 'Approved')}
                                        >
                                          Approve
                                        </button>
                                        <button 
                                          className="hr-btn-xs reject" 
                                          onClick={() => handleApproveRejectLeave(req.employee, req.id, 'Rejected')}
                                        >
                                          Reject
                                        </button>
                                      </div>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          ) : (
                            <div style={{ textAlign: 'center', padding: '32px 0', color: '#94A3B8', fontSize: '13px', fontWeight: 600 }}>
                              No pending leave requests
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="hr-card" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                        <div className="hr-card-title" style={{ fontSize: '16px', borderBottom: '1px solid #F1F5F9', paddingBottom: '12px' }}>
                          Staff Directory
                        </div>
                        <div data-lenis-prevent style={{ display: 'flex', flexDirection: 'column', gap: '12px', maxHeight: '400px', overflowY: 'auto' }}>
                          {employees.map(emp => {
                            const isSelected = selectedEmployee?.staff_id === emp.staff_id;
                            return (
                              <div 
                                key={emp.staff_id} 
                                style={{ 
                                  display: 'flex', 
                                  alignItems: 'center', 
                                  justifyContent: 'space-between', 
                                  padding: '12px', 
                                  borderRadius: '10px', 
                                  border: isSelected ? '1px solid #2563EB' : '1px solid #E2E8F0',
                                  backgroundColor: isSelected ? '#EFF6FF' : 'white',
                                  transition: 'all 0.2s'
                                }}
                              >
                                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                  <div 
                                    style={{ 
                                      width: '36px', 
                                      height: '36px', 
                                      borderRadius: '50%', 
                                      backgroundColor: isSelected ? '#2563EB' : '#F1F5F9', 
                                      color: isSelected ? 'white' : '#64748B', 
                                      display: 'flex', 
                                      alignItems: 'center', 
                                      justifyContent: 'center',
                                      fontWeight: 800,
                                      fontSize: '12px'
                                    }}
                                  >
                                    {emp.initials}
                                  </div>
                                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                                    <span style={{ fontSize: '13.5px', fontWeight: 800 }}>{emp.name}</span>
                                    <span style={{ fontSize: '11px', color: '#64748B' }}>{emp.role.toUpperCase()} • {emp.dept}</span>
                                  </div>
                                </div>
                                <button 
                                  className="hr-btn-xs" 
                                  style={{ 
                                    backgroundColor: isSelected ? '#2563EB' : 'white',
                                    color: isSelected ? 'white' : '#475569',
                                    border: '1px solid ' + (isSelected ? '#2563EB' : '#CBD5E1'),
                                    fontSize: '11px'
                                  }}
                                  onClick={() => setSelectedEmployee(emp)}
                                >
                                  {isSelected ? 'Managing' : 'Manage'}
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  </>
                ) : (
                  <>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginBottom: '24px' }}>
                      <h1 style={{ fontSize: '24px', fontWeight: 800 }}>My Dashboard</h1>
                      <p style={{ fontSize: '13px', color: '#64748B', fontWeight: 600 }}>Your personal HR overview</p>
                    </div>

                    <div className="hr-profile-banner">
                      <div className="hr-profile-banner-left">
                        {currentUser.avatar ? (
                          <img src={currentUser.avatar} alt="Avatar" style={{ width: '72px', height: '72px', borderRadius: '50%', objectFit: 'cover', border: '4px solid #EFF6FF' }} />
                        ) : (
                          <div className="hr-profile-banner-avatar">{userInitials}</div>
                        )}
                        <div className="hr-profile-banner-details">
                          <h2>{currentUser.name || 'Staff User'}</h2>
                          <div className="hr-profile-banner-meta">
                            <span>{userRoleDisplay} • {empDept} • {staffId}</span>
                            <span>Curoxa Clinic • Joined {joinedDate}</span>
                          </div>
                        </div>
                      </div>
                      <div className="hr-profile-banner-actions">
                        <button className="hr-btn hr-btn-primary" onClick={() => setShowLeaveModal(true)}>
                          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M17.8 19.2L16 11l3.5-3.5C21 6 21.5 4 20 4s-2 1-3.5 3.5L8 6l-8.2 1.8 7.3 3.6-1.8 4.6 2.7 2.7 4.6-1.8z"/></svg>
                          Apply leave
                        </button>
                        {(currentUser.role === 'admin' || currentUser.role === 'hr') && (
                          <button className="hr-btn" onClick={() => setActiveTab('payroll')}>
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/></svg>
                            Download payslip
                          </button>
                        )}
                        <button className="hr-btn" onClick={() => setActiveTab('attendance')}>
                          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="18" x="3" y="4" rx="2"/><line x1="16" x2="16" y1="2" y2="6"/><line x1="8" x2="8" y1="2" y2="6"/><line x1="3" x2="21" y1="10" y2="10"/><path d="m9 16 2 2 4-4"/></svg>
                          View attendance
                        </button>

                      </div>
                    </div>

                    <div className="hr-dashboard-grid">
                      <div className="hr-card">
                        <div className="hr-card-title">Reports to</div>
                        <div className="hr-manager-widget">
                          <div className="hr-manager-header">
                            <div className="hr-manager-avatar">
                              {((selectedEmployee?.reportingManagerName || 'Ishita Jain').split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase())}
                            </div>
                            <div className="hr-manager-info">
                              <h4>{selectedEmployee?.reportingManagerName || 'Ishita Jain'}</h4>
                              <p>Reporting Manager</p>
                            </div>
                          </div>
                          <div className="hr-manager-contacts">
                            <div className="hr-contact-row">
                              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: '#94A3B8' }}><rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>
                              <span>{selectedEmployee?.reportingManagerName?.includes('Ishita') ? 'ishita.jain@curoxa.health' : 'admin@curoxa.health'}</span>
                            </div>
                            <div className="hr-contact-row">
                              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: '#94A3B8' }}><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
                              <span>+91 99999 88888</span>
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="hr-card">
                        <div className="hr-card-title">This month at a glance</div>
                        <div className="hr-glance-list">
                          <div className="hr-glance-row">
                            <div className="hr-glance-label">
                              <div className="hr-status-dot" style={{ backgroundColor: '#10B981' }} />
                              <span>Present days</span>
                            </div>
                            <span className="hr-glance-val">{presentCount}</span>
                          </div>
                          <div className="hr-glance-row">
                            <div className="hr-glance-label">
                              <div className="hr-status-dot" style={{ backgroundColor: '#EF4444' }} />
                              <span>Absent days</span>
                            </div>
                            <span className="hr-glance-val">{absentCount}</span>
                          </div>
                          <div className="hr-glance-row">
                            <div className="hr-glance-label">
                              <div className="hr-status-dot" style={{ backgroundColor: '#F59E0B' }} />
                              <span>Late marks</span>
                            </div>
                            <span className="hr-glance-val">{lateCount}</span>
                          </div>
                          <div className="hr-glance-row">
                            <div className="hr-glance-label">
                              <div className="hr-status-dot" style={{ backgroundColor: '#3B82F6' }} />
                              <span>Approved leaves</span>
                            </div>
                            <span className="hr-glance-val">{leaveCount}</span>
                          </div>
                        </div>
                      </div>

                      <div className="hr-card">
                        <div className="hr-card-title">Recent Updates</div>
                        <div className="hr-upcoming-list">
                          {(() => {
                            // Build real update items from the employee's leave records
                            const updateItems = [];

                            // Approved / Rejected leaves
                            leaves.filter(l => l.status === 'Approved' || l.status === 'Rejected').forEach(l => {
                              const isApproved = l.status === 'Approved';
                              updateItems.push({
                                key: `leave-${l.id}`,
                                type: isApproved ? 'leave' : 'rejected',
                                label: isApproved ? 'Approved Leave' : 'Rejected Leave',
                                desc: `${formatDate(l.from)} • ${l.type} leave — ${l.days} day${l.days > 1 ? 's' : ''}`,
                                date: l.from ? new Date(l.from) : new Date(0)
                              });
                            });

                            // Pending leaves
                            leaves.filter(l => l.status === 'Pending').forEach(l => {
                              updateItems.push({
                                key: `pending-${l.id}`,
                                type: 'pending',
                                label: 'Pending Review',
                                desc: `${formatDate(l.from)} – ${formatDate(l.to)} • ${l.type} leave`,
                                date: l.from ? new Date(l.from) : new Date(0)
                              });
                            });

                            // Today's attendance status
                            const todayStatus = getDayStatus(new Date().getFullYear(), new Date().getMonth(), new Date().getDate());
                            if (todayStatus && todayStatus !== 'Off') {
                              updateItems.push({
                                key: 'attendance-today',
                                type: 'attendance',
                                label: 'Today\'s Attendance',
                                desc: `Marked as ${todayStatus}`,
                                date: new Date()
                              });
                            }

                            // Sort update items by date descending (latest first)
                            updateItems.sort((a, b) => b.date.getTime() - a.date.getTime());

                            // Slice to get top 5 latest updates
                            const latestUpdates = updateItems.slice(0, 5);

                            if (latestUpdates.length === 0) {
                              return (
                                <div style={{ textAlign: 'center', padding: '16px', color: '#94A3B8', fontSize: '12.5px', fontWeight: 600 }}>
                                  No recent updates
                                </div>
                              );
                            }

                            return latestUpdates.map(item => (
                              <div key={item.key} className={`hr-upcoming-item ${item.type}`}>
                                <span className="hr-upcoming-lbl">{item.label}</span>
                                <span className="hr-upcoming-desc">{item.desc}</span>
                              </div>
                            ));
                          })()}
                        </div>
                      </div>
                    </div>
                  </>
                )}
              </div>
            );
          })()}

          {/* TAB 2: ATTENDANCE */}
          {activeTab === 'attendance' && (() => {
            const calendarYear = selectedDate.getFullYear();
            const calendarMonth = selectedDate.getMonth();
            const calendarDaysInMonth = new Date(calendarYear, calendarMonth + 1, 0).getDate();
            const calendarFirstDayIndex = new Date(calendarYear, calendarMonth, 1).getDay();
            const calendarPaddingCells = calendarFirstDayIndex === 0 ? 6 : calendarFirstDayIndex - 1;

            let workingDaysCount = 0;
            let presentCount = 0;
            let absentCount = 0;
            let lateCount = 0;
            let leaveCount = 0;

            for (let d = 1; d <= calendarDaysInMonth; d++) {
              const status = getDayStatus(calendarYear, calendarMonth, d);
              if (status && status !== 'Off') {
                workingDaysCount++;
                if (status === 'Present') presentCount++;
                else if (status === 'Absent') absentCount++;
                else if (status === 'Late') lateCount++;
                else if (status === 'Leave') leaveCount++;
              }
            }
            const attendanceRate = workingDaysCount > 0 ? Math.round(((presentCount + lateCount) / workingDaysCount) * 100) : 100;

            return (
              <div className="animate-in">
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginBottom: '24px' }}>
                  <h1 style={{ fontSize: '24px', fontWeight: 800 }}>Attendance</h1>
                  <p style={{ fontSize: '13px', color: '#64748B', fontWeight: 600 }}>Curoxa Clinic</p>
                </div>

                {/* Month Selector Switcher */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '24px' }}>
                  <button 
                    onClick={() => setSelectedDate(prev => new Date(prev.getFullYear(), prev.getMonth() - 1, 1))}
                    className="hr-att-switcher-btn"
                    style={{ background: 'white', border: '1px solid #E2E8F0', padding: '6px', borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
                  </button>
                  <span style={{ fontSize: '16px', fontWeight: 800 }}>
                    {selectedDate.toLocaleDateString('default', { month: 'long', year: 'numeric' })}
                  </span>
                  <button 
                    onClick={() => setSelectedDate(prev => new Date(prev.getFullYear(), prev.getMonth() + 1, 1))}
                    className="hr-att-switcher-btn"
                    style={{ background: 'white', border: '1px solid #E2E8F0', padding: '6px', borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
                  </button>
                </div>

                {/* KPI indicators */}
                <div className="hr-attendance-kpis">
                  <div className="hr-attendance-kpi-card semantic-card-info">
                    <div className="hr-att-kpi-header">
                      <span>Working Days</span>
                      <div className="hr-status-dot" style={{ backgroundColor: '#3B82F6' }} />
                    </div>
                    <div className="hr-att-kpi-val">{workingDaysCount}</div>
                  </div>
                  <div className="hr-attendance-kpi-card semantic-card-info">
                    <div className="hr-att-kpi-header">
                      <span>Present</span>
                      <div className="hr-status-dot" style={{ backgroundColor: '#10B981' }} />
                    </div>
                    <div className="hr-att-kpi-val">{presentCount}</div>
                  </div>
                  <div className="hr-attendance-kpi-card semantic-card-info">
                    <div className="hr-att-kpi-header">
                      <span>Absent</span>
                      <div className="hr-status-dot" style={{ backgroundColor: '#EF4444' }} />
                    </div>
                    <div className="hr-att-kpi-val">{absentCount}</div>
                  </div>
                  <div className="hr-attendance-kpi-card semantic-card-info">
                    <div className="hr-att-kpi-header">
                      <span>Late Marks</span>
                      <div className="hr-status-dot" style={{ backgroundColor: '#F59E0B' }} />
                    </div>
                    <div className="hr-att-kpi-val">{lateCount}</div>
                  </div>
                  <div className="hr-attendance-kpi-card semantic-card-info">
                    <div className="hr-att-kpi-header">
                      <span>Attendance %</span>
                      <div className="hr-status-dot" style={{ backgroundColor: '#8B5CF6' }} />
                    </div>
                    <div className="hr-att-kpi-val">{attendanceRate}%</div>
                  </div>
                </div>

                {/* Calendar card */}
                <div className="hr-calendar-wrapper">
                  <div className="hr-calendar-header">
                    <h3 className="hr-calendar-title">
                      {selectedDate.toLocaleDateString('default', { month: 'long', year: 'numeric' })}
                    </h3>
                    <div className="hr-calendar-indicators">
                      <div className="hr-indicator-item">
                        <div className="hr-status-dot" style={{ backgroundColor: '#10B981' }} />
                        <span>Present</span>
                      </div>
                      <div className="hr-indicator-item">
                        <div className="hr-status-dot" style={{ backgroundColor: '#EF4444' }} />
                        <span>Absent</span>
                      </div>
                      <div className="hr-indicator-item">
                        <div className="hr-status-dot" style={{ backgroundColor: '#F59E0B' }} />
                        <span>Late</span>
                      </div>
                      <div className="hr-indicator-item">
                        <div className="hr-status-dot" style={{ backgroundColor: '#3B82F6' }} />
                        <span>Leave</span>
                      </div>
                    </div>
                  </div>

                  <div className="hr-calendar-grid">
                    <div className="hr-calendar-weekday">Mon</div>
                    <div className="hr-calendar-weekday">Tue</div>
                    <div className="hr-calendar-weekday">Wed</div>
                    <div className="hr-calendar-weekday">Thu</div>
                    <div className="hr-calendar-weekday">Fri</div>
                    <div className="hr-calendar-weekday">Sat</div>
                    <div className="hr-calendar-weekday">Sun</div>

                    {/* Padding cells */}
                    {Array.from({ length: calendarPaddingCells }).map((_, i) => (
                      <div key={`pad-${i}`} className="hr-calendar-day-tile empty" />
                    ))}

                    {/* Day cells */}
                    {Array.from({ length: calendarDaysInMonth }).map((_, i) => {
                      const dayNum = i + 1;
                      const status = getDayStatus(calendarYear, calendarMonth, dayNum);
                      const statusClass = status.toLowerCase();
                      const isClickable = currentUser.role === 'admin' || currentUser.role === 'hr';

                      return (
                        <div 
                          key={`day-${dayNum}`} 
                          className={`hr-calendar-day-tile ${statusClass}`}
                          style={{
                            cursor: isClickable ? 'pointer' : 'default',
                            border: selectedDayNum === dayNum ? '2px solid #2563EB' : undefined,
                            transform: selectedDayNum === dayNum ? 'scale(1.02)' : 'none'
                          }}
                          onClick={() => {
                            if (isClickable) {
                              setSelectedDayNum(dayNum);
                            }
                          }}
                        >
                          <span className="hr-calendar-day-num">{dayNum}</span>
                          {status && (
                            <span className={`hr-calendar-day-status ${statusClass}`}>
                              {status}
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {selectedDayNum !== null && (
                  <div className="hr-card" style={{ marginTop: '20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <h4 style={{ fontSize: '15px', fontWeight: 800 }}>
                        Update Attendance for {selectedEmployee?.name || 'Staff'} on {selectedDayNum} {selectedDate.toLocaleDateString('default', { month: 'long', year: 'numeric' })}
                      </h4>
                      <button 
                        className="hr-btn-xs" 
                        style={{ backgroundColor: '#F1F5F9', color: '#475569' }} 
                        onClick={() => setSelectedDayNum(null)}
                      >
                        Cancel
                      </button>
                    </div>
                    <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                      {['Present', 'Absent', 'Late', 'Leave', 'Off'].map(opt => {
                        const dateStr = `${calendarYear}-${String(calendarMonth + 1).padStart(2, '0')}-${String(selectedDayNum).padStart(2, '0')}`;
                        const isCurrent = (attendanceRecord[dateStr] || getDayStatus(calendarYear, calendarMonth, selectedDayNum)) === opt;
                        return (
                          <button
                            key={opt}
                            className="hr-btn"
                            style={{
                              backgroundColor: isCurrent ? '#2563EB' : '#F8FAFC',
                              color: isCurrent ? 'white' : '#475569',
                              border: isCurrent ? '1px solid #2563EB' : '1px solid #E2E8F0',
                              fontWeight: 800
                            }}
                            onClick={() => {
                              const updated = {
                                ...attendanceRecord,
                                [dateStr]: opt
                              };
                              saveAttendanceForEmployee(updated);
                              setSelectedDayNum(null);
                            }}
                          >
                            {opt}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            );
          })()}

          {/* TAB 3: LEAVE MANAGEMENT */}
          {activeTab === 'leave' && (
            <div className="animate-in" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
              {/* Top Header & Year Selector Controls */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <h1 style={{ fontSize: '24px', fontWeight: 800, color: '#0F172A', margin: 0 }}>Leave Management</h1>
                    {leaveYear < new Date().getFullYear() && (
                      <span style={{ fontSize: '11px', fontWeight: 800, padding: '3px 8px', borderRadius: '6px', background: '#F1F5F9', color: '#64748B', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                        🔒 Read-Only History
                      </span>
                    )}
                  </div>
                  <p style={{ fontSize: '13px', color: '#64748B', fontWeight: 600, margin: 0 }}>
                    Yearly accounting, real-time balance ledger and request history for <strong>{selectedEmployee?.name || currentUser.name || 'Staff'}</strong>
                  </p>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                  {/* Year Switcher */}
                  <div style={{ display: 'inline-flex', alignItems: 'center', background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '10px', padding: '3px', gap: '2px' }}>
                    {availableYears.map(yr => (
                      <button
                        key={yr}
                        type="button"
                        onClick={() => setLeaveYear(yr)}
                        style={{
                          border: 'none',
                          background: leaveYear === yr ? '#2563EB' : 'transparent',
                          color: leaveYear === yr ? '#FFFFFF' : '#64748B',
                          fontWeight: leaveYear === yr ? 800 : 600,
                          fontSize: '12.5px',
                          padding: '6px 14px',
                          borderRadius: '7px',
                          cursor: 'pointer',
                          transition: 'all 0.15s ease'
                        }}
                      >
                        {yr}
                      </button>
                    ))}
                  </div>

                  {/* Apply Leave CTA */}
                  <button 
                    className="hr-btn hr-btn-primary" 
                    onClick={() => setShowLeaveModal(true)}
                    disabled={leaveYear < new Date().getFullYear()}
                    style={{
                      opacity: leaveYear < new Date().getFullYear() ? 0.6 : 1,
                      cursor: leaveYear < new Date().getFullYear() ? 'not-allowed' : 'pointer'
                    }}
                    title={leaveYear < new Date().getFullYear() ? 'Cannot apply leave in past historical years' : 'Apply for leave'}
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14"/><path d="M12 5v14"/></svg>
                    Apply leave
                  </button>
                </div>
              </div>

              {/* Error Alert if loading failed */}
              {leavesError && (
                <div style={{ background: '#FEF2F2', border: '1px solid #FCA5A5', padding: '12px 16px', borderRadius: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: '#991B1B', fontSize: '13px' }}>
                  <span>⚠️ {leavesError}</span>
                  <button 
                    type="button" 
                    onClick={() => fetchStaffLeaveData(leaveYear, selectedEmployee)}
                    style={{ background: '#EF4444', color: 'white', border: 'none', padding: '4px 12px', borderRadius: '6px', fontSize: '12px', fontWeight: 700, cursor: 'pointer' }}
                  >
                    Retry
                  </button>
                </div>
              )}

              {/* Authoritative Leave KPI Balance Cards */}
              <div className="hr-leave-kpis" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px' }}>
                {/* 1. Sick Leave Card */}
                <div className="hr-leave-kpi-card semantic-card-info" style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '12px', padding: '18px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', boxShadow: '0 1px 3px rgba(0,0,0,0.03)' }}>
                  <div className="hr-leave-kpi-left" style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span className="hr-leave-kpi-lbl" style={{ fontSize: '13px', fontWeight: 700, color: '#475569' }}>Sick Leave</span>
                      <span style={{ fontSize: '10px', fontWeight: 700, padding: '1px 6px', borderRadius: '4px', background: '#ECFDF5', color: '#047857' }}>+{sickBal.monthlyAccrual || 0.5}/mo</span>
                    </div>
                    <span className="hr-leave-kpi-count" style={{ fontSize: '28px', fontWeight: 800, color: '#0F172A', marginTop: '4px' }}>
                      {isLeavesLoading ? '...' : (sickAvailable ?? 0)}
                    </span>
                    <span className="hr-leave-kpi-subtitle" style={{ fontSize: '11.5px', color: '#64748B', fontWeight: 600 }}>
                      Used: <strong>{sickBal.consumed || 0}d</strong> • Quota: {Number((sickBal.opening + sickBal.carryForward + sickBal.accrued).toFixed(2))}d
                    </span>
                  </div>
                  <div className="hr-leave-kpi-icon-wrapper green" style={{ width: '40px', height: '40px', borderRadius: '10px', background: '#ECFDF5', color: '#10B981', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
                  </div>
                </div>

                {/* 2. Casual Leave Card */}
                <div className="hr-leave-kpi-card semantic-card-info" style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '12px', padding: '18px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', boxShadow: '0 1px 3px rgba(0,0,0,0.03)' }}>
                  <div className="hr-leave-kpi-left" style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span className="hr-leave-kpi-lbl" style={{ fontSize: '13px', fontWeight: 700, color: '#475569' }}>Casual Leave</span>
                      <span style={{ fontSize: '10px', fontWeight: 700, padding: '1px 6px', borderRadius: '4px', background: '#EFF6FF', color: '#2563EB' }}>+{casualBal.monthlyAccrual || 0.5}/mo</span>
                    </div>
                    <span className="hr-leave-kpi-count" style={{ fontSize: '28px', fontWeight: 800, color: '#0F172A', marginTop: '4px' }}>
                      {isLeavesLoading ? '...' : (casualAvailable ?? 0)}
                    </span>
                    <span className="hr-leave-kpi-subtitle" style={{ fontSize: '11.5px', color: '#64748B', fontWeight: 600 }}>
                      Used: <strong>{casualBal.consumed || 0}d</strong> • Quota: {Number((casualBal.opening + casualBal.carryForward + casualBal.accrued).toFixed(2))}d
                    </span>
                  </div>
                  <div className="hr-leave-kpi-icon-wrapper green" style={{ width: '40px', height: '40px', borderRadius: '10px', background: '#EFF6FF', color: '#2563EB', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>
                  </div>
                </div>

                {/* 3. Earned Leave Card */}
                <div className="hr-leave-kpi-card semantic-card-info" style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '12px', padding: '18px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', boxShadow: '0 1px 3px rgba(0,0,0,0.03)' }}>
                  <div className="hr-leave-kpi-left" style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span className="hr-leave-kpi-lbl" style={{ fontSize: '13px', fontWeight: 700, color: '#475569' }}>Earned Leave</span>
                      <span style={{ fontSize: '10px', fontWeight: 700, padding: '1px 6px', borderRadius: '4px', background: '#F5F3FF', color: '#7C3AED' }}>+{earnedBal.monthlyAccrual || 1.25}/mo</span>
                    </div>
                    <span className="hr-leave-kpi-count" style={{ fontSize: '28px', fontWeight: 800, color: '#0F172A', marginTop: '4px' }}>
                      {isLeavesLoading ? '...' : (earnedAvailable ?? 0)}
                    </span>
                    <span className="hr-leave-kpi-subtitle" style={{ fontSize: '11.5px', color: '#64748B', fontWeight: 600 }}>
                      Used: <strong>{earnedBal.consumed || 0}d</strong> • Quota: {Number((earnedBal.opening + earnedBal.carryForward + earnedBal.accrued).toFixed(2))}d
                    </span>
                  </div>
                  <div className="hr-leave-kpi-icon-wrapper green" style={{ width: '40px', height: '40px', borderRadius: '10px', background: '#F5F3FF', color: '#7C3AED', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                  </div>
                </div>

                {/* 4. Month Consumption KPI */}
                <div className="hr-leave-kpi-card semantic-card-info" style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '12px', padding: '18px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', boxShadow: '0 1px 3px rgba(0,0,0,0.03)' }}>
                  <div className="hr-leave-kpi-left" style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                    <span className="hr-leave-kpi-lbl" style={{ fontSize: '13px', fontWeight: 700, color: '#475569' }}>This Month Taken</span>
                    <span className="hr-leave-kpi-count" style={{ fontSize: '28px', fontWeight: 800, color: '#0F172A', marginTop: '4px' }}>
                      {takenThisMonth}
                    </span>
                    <span className="hr-leave-kpi-subtitle" style={{ fontSize: '11.5px', color: '#64748B', fontWeight: 600 }}>
                      Approved leaves in {new Date().toLocaleString('default', { month: 'short' })} {leaveYear}
                    </span>
                  </div>
                  <div className="hr-leave-kpi-icon-wrapper blue" style={{ width: '40px', height: '40px', borderRadius: '10px', background: '#FFF7ED', color: '#EA580C', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M17.8 19.2L16 11l3.5-3.5C21 6 21.5 4 20 4s-2 1-3.5 3.5L8 6l-8.2 1.8 7.3 3.6-1.8 4.6 2.7 2.7 4.6-1.8z"/></svg>
                  </div>
                </div>
              </div>

              {/* Split View: Requests History Table & Authoritative Ledger Timeline */}
              <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.4fr) minmax(0, 1fr)', gap: '24px' }}>
                {/* Left Column: Leave Requests Table */}
                <div className="glass-card" style={{ padding: '20px', borderRadius: '14px', background: '#FFFFFF', border: '1px solid #E2E8F0', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #F1F5F9', paddingBottom: '12px' }}>
                    <div>
                      <h3 style={{ fontSize: '16px', fontWeight: 800, color: '#0F172A', margin: 0 }}>Leave Requests ({leaveYear})</h3>
                      <span style={{ fontSize: '12px', color: '#64748B' }}>Real-time status of applied leave applications</span>
                    </div>
                    <span style={{ fontSize: '12px', fontWeight: 700, padding: '3px 8px', borderRadius: '6px', background: '#F8FAFC', color: '#475569' }}>
                      {leaves.filter(l => (l.from || '').startsWith(String(leaveYear))).length} record(s)
                    </span>
                  </div>

                  <div style={{ overflowX: 'auto' }}>
                    {isLeavesLoading ? (
                      <div style={{ textAlign: 'center', padding: '40px 0', color: '#64748B', fontSize: '13px' }}>
                        Loading leave records...
                      </div>
                    ) : (() => {
                      const yearLeaves = leaves.filter(l => (l.from || '').startsWith(String(leaveYear)));
                      if (yearLeaves.length === 0) {
                        return (
                          <div style={{ textAlign: 'center', padding: '48px 0', color: '#64748B', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
                            <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: '#F8FAFC', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94A3B8' }}>
                              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect width="18" height="18" x="3" y="4" rx="2" ry="2"/><line x1="16" x2="16" y1="2" y2="6"/><line x1="8" x2="8" y1="2" y2="6"/><line x1="3" x2="21" y1="10" y2="10"/></svg>
                            </div>
                            <span style={{ fontSize: '14px', fontWeight: 700, color: '#334155' }}>No leave requests yet</span>
                            <span style={{ fontSize: '12px' }}>You haven't submitted any leave requests for {leaveYear}.</span>
                          </div>
                        );
                      }

                      return (
                        <table className="hr-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                          <thead>
                            <tr>
                              <th style={{ textAlign: 'left', fontSize: '12px', fontWeight: 800, color: '#475569', padding: '10px 8px' }}>Leave Type</th>
                              <th style={{ textAlign: 'left', fontSize: '12px', fontWeight: 800, color: '#475569', padding: '10px 8px' }}>Dates</th>
                              <th style={{ textAlign: 'left', fontSize: '12px', fontWeight: 800, color: '#475569', padding: '10px 8px' }}>Days</th>
                              <th style={{ textAlign: 'left', fontSize: '12px', fontWeight: 800, color: '#475569', padding: '10px 8px' }}>Status</th>
                              <th style={{ textAlign: 'left', fontSize: '12px', fontWeight: 800, color: '#475569', padding: '10px 8px' }}>Approver / Reason</th>
                            </tr>
                          </thead>
                          <tbody>
                            {yearLeaves.map((leave) => {
                              const statusLower = (leave.status || 'Pending').toLowerCase();
                              const statusStyles = {
                                pending: { bg: '#FFFBEB', color: '#B45309', border: '#FDE68A' },
                                approved: { bg: '#ECFDF5', color: '#047857', border: '#A7F3D0' },
                                rejected: { bg: '#FEF2F2', color: '#B91C1C', border: '#FECACA' },
                                cancelled: { bg: '#F8FAFC', color: '#64748B', border: '#E2E8F0' }
                              };
                              const sStyle = statusStyles[statusLower] || statusStyles.pending;

                              return (
                                <tr key={leave.id} style={{ borderBottom: '1px solid #F1F5F9' }}>
                                  <td style={{ padding: '12px 8px', fontWeight: 700, color: '#0F172A', fontSize: '13px' }}>
                                    {leave.type}
                                  </td>
                                  <td style={{ padding: '12px 8px', fontSize: '12.5px', color: '#334155' }}>
                                    {formatDate(leave.from)} - {formatDate(leave.to)}
                                  </td>
                                  <td style={{ padding: '12px 8px', fontSize: '12.5px', fontWeight: 700 }}>
                                    {leave.days} day{leave.days > 1 ? 's' : ''}
                                  </td>
                                  <td style={{ padding: '12px 8px' }}>
                                    <span style={{
                                      fontSize: '11px',
                                      fontWeight: 800,
                                      padding: '4px 8px',
                                      borderRadius: '6px',
                                      background: sStyle.bg,
                                      color: sStyle.color,
                                      border: `1px solid ${sStyle.border}`,
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      gap: '4px',
                                      textTransform: 'capitalize'
                                    }}>
                                      {leave.status}
                                    </span>
                                  </td>
                                  <td style={{ padding: '12px 8px', fontSize: '12px', color: '#64748B' }}>
                                    <div>{leave.approver || 'Pending Review'}</div>
                                    {leave.reason && (
                                      <div style={{ fontSize: '11px', fontStyle: 'italic', color: '#94A3B8', marginTop: '2px' }}>
                                        "{leave.reason}"
                                      </div>
                                    )}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      );
                    })()}
                  </div>
                </div>

                {/* Right Column: Authoritative Ledger & Accrual Timeline */}
                <div className="glass-card" style={{ padding: '20px', borderRadius: '14px', background: '#FFFFFF', border: '1px solid #E2E8F0', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #F1F5F9', paddingBottom: '12px' }}>
                    <div>
                      <h3 style={{ fontSize: '16px', fontWeight: 800, color: '#0F172A', margin: 0 }}>Activity Ledger ({leaveYear})</h3>
                      <span style={{ fontSize: '12px', color: '#64748B' }}>Authoritative audit trail of credits & approved debits</span>
                    </div>
                    {(() => {
                      const empGender = selectedEmployee?.gender || currentUser?.gender || '';
                      const eligibleLedger = leaveLedger.filter(tx => isLeaveTypeEligibleForStaff(tx.leaveType, empGender));
                      return (
                        <span style={{ fontSize: '12px', fontWeight: 700, padding: '3px 8px', borderRadius: '6px', background: '#F8FAFC', color: '#475569' }}>
                          {eligibleLedger.length} transaction(s)
                        </span>
                      );
                    })()}
                  </div>

                  <div style={{ maxHeight: '480px', overflowY: 'auto' }} data-lenis-prevent>
                    {(() => {
                      const empGender = selectedEmployee?.gender || currentUser?.gender || '';
                      const eligibleLedger = leaveLedger.filter(tx => isLeaveTypeEligibleForStaff(tx.leaveType, empGender));

                      if (isLeavesLoading) {
                        return (
                          <div style={{ textAlign: 'center', padding: '32px 0', color: '#64748B', fontSize: '13px' }}>
                            Loading ledger activity...
                          </div>
                        );
                      }

                      if (eligibleLedger.length === 0) {
                        return (
                          <div style={{ textAlign: 'center', padding: '48px 0', color: '#64748B', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
                            <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: '#F8FAFC', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94A3B8' }}>
                              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" x2="8" y1="13" y2="13"/><line x1="16" x2="8" y1="17" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
                            </div>
                            <span style={{ fontSize: '14px', fontWeight: 700, color: '#334155' }}>No leave activity recorded</span>
                            <span style={{ fontSize: '12px' }}>No accrual or consumption transactions for {leaveYear}.</span>
                          </div>
                        );
                      }

                      return (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                          {eligibleLedger.map((tx, idx) => {
                            const isCredit = Number(tx.amount) > 0;
                            const formattedAmt = isCredit ? `+${tx.amount.toFixed(2)}` : `${tx.amount.toFixed(2)}`;
                            const txDate = tx.createdAt ? new Date(tx.createdAt).toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' }) : `${leaveYear}`;

                          return (
                            <div 
                              key={tx._id || idx}
                              style={{
                                padding: '12px 14px',
                                borderRadius: '10px',
                                background: isCredit ? '#F0FDF4' : '#FFF1F2',
                                border: `1px solid ${isCredit ? '#DCFCE7' : '#FFE4E6'}`,
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                gap: '12px'
                              }}
                            >
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                  <strong style={{ fontSize: '13px', color: '#0F172A' }}>{tx.leaveType}</strong>
                                  <span style={{
                                    fontSize: '10px',
                                    fontWeight: 700,
                                    padding: '1px 6px',
                                    borderRadius: '4px',
                                    background: isCredit ? '#DCFCE7' : '#FFE4E6',
                                    color: isCredit ? '#15803D' : '#BE123C',
                                    textTransform: 'uppercase'
                                  }}>
                                    {tx.transactionType?.replace(/_/g, ' ')}
                                  </span>
                                </div>
                                <span style={{ fontSize: '12px', color: '#475569' }}>
                                  {tx.reason || 'Ledger transaction'}
                                </span>
                                <span style={{ fontSize: '11px', color: '#94A3B8' }}>
                                  {txDate} • {tx.actor || 'System'}
                                </span>
                              </div>

                              <div style={{
                                fontSize: '15px',
                                fontWeight: 800,
                                color: isCredit ? '#16A34A' : '#E11D48',
                                whiteSpace: 'nowrap'
                              }}>
                                {formattedAmt}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    );
                  })()}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: PAYROLL */}
          {activeTab === 'payroll' && (currentUser.role === 'admin' || currentUser.role === 'hr') && (
            <div className="animate-in">
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginBottom: '24px' }}>
                <h1 style={{ fontSize: '24px', fontWeight: 800 }}>Payroll & Compensation</h1>
                <p style={{ fontSize: '13px', color: '#64748B', fontWeight: 600 }}>Overview of payslips and monthly salary structures</p>
              </div>

               <div className="hr-dashboard-grid" style={{ gridTemplateColumns: '2fr 1fr', marginBottom: '24px' }}>
                {/* Payslips table */}
                <div className="hr-table-card">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px 8px', borderBottom: '1px solid #F1F5F9' }}>
                    <h3 className="hr-card-title" style={{ margin: 0 }}>Recent Payslips</h3>
                    {(currentUser.role === 'admin' || currentUser.role === 'hr') && (
                      <div>
                        <label htmlFor="issue-payslip-input" className="hr-btn hr-btn-primary" style={{ padding: '6px 12px', fontSize: '12.5px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', margin: 0 }}>
                          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                          Issue Payslip
                        </label>
                        <input 
                          type="file" 
                          id="issue-payslip-input" 
                          style={{ display: 'none' }}
                          onChange={(e) => {
                            if (e.target.files && e.target.files[0]) {
                              handleUploadDoc('salary_slips', e.target.files[0]);
                            }
                          }}
                        />
                      </div>
                    )}
                  </div>
                  <table className="hr-table">
                    <thead>
                      <tr>
                        <th>Month / File</th>
                        <th>Reference</th>
                        <th>Net Amount</th>
                        <th>Status</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {documentsData.salary_slips?.docs.length > 0 ? (
                        documentsData.salary_slips.docs.map((doc, idx) => (
                          <tr key={doc.id}>
                            <td><b>{doc.name.replace(/\.[^/.]+$/, "")}</b></td>
                            <td>PAY-2026-{String(100 - idx).padStart(3, '0')}</td>
                            <td>₹{selectedEmployee?.role === 'doctor' ? '90,000' : '35,000'}</td>
                            <td><span className="hr-badge approved">Paid</span></td>
                            <td>
                              <div style={{ display: 'flex', gap: '8px' }}>
                                <button 
                                  className="hr-btn" 
                                  style={{ height: '32px', padding: '0 12px' }} 
                                  onClick={() => downloadDoc(doc)}
                                >
                                  Download
                                </button>
                                {(currentUser.role === 'admin' || currentUser.role === 'hr') && (
                                  <button 
                                    className="hr-btn" 
                                    style={{ height: '32px', padding: '0 12px', backgroundColor: '#EF4444', color: 'white', border: 'none' }} 
                                    onClick={() => handleDeleteDoc('salary_slips', doc.id)}
                                  >
                                    Delete
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan="5" style={{ textAlign: 'center', color: '#94A3B8', padding: '24px 0' }}>
                            No payslips have been issued yet.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
 
                {/* Salary breakdown card */}
                <div className="hr-card">
                  <h3 className="hr-card-title">Earnings Breakdown</h3>
                  <div className="hr-glance-list" style={{ gap: '12px' }}>
                    <div className="hr-glance-row">
                      <span>Basic Pay</span>
                      <span className="hr-glance-val">₹{selectedEmployee?.role === 'doctor' ? '65,000' : '25,000'}</span>
                    </div>
                    <div className="hr-glance-row">
                      <span>HRA</span>
                      <span className="hr-glance-val">₹{selectedEmployee?.role === 'doctor' ? '15,000' : '6,000'}</span>
                    </div>
                    <div className="hr-glance-row">
                      <span>Medical Allowance</span>
                      <span className="hr-glance-val">₹{selectedEmployee?.role === 'doctor' ? '5,000' : '2,500'}</span>
                    </div>
                    <div className="hr-glance-row">
                      <span>Special Allowance</span>
                      <span className="hr-glance-val">₹{selectedEmployee?.role === 'doctor' ? '5,000' : '1,500'}</span>
                    </div>
                    <div style={{ borderTop: '1px solid #E2E8F0', margin: '4px 0' }} />
                    <div className="hr-glance-row" style={{ color: '#0F172A', fontWeight: 800 }}>
                      <span>Gross Salary</span>
                      <span>₹{selectedEmployee?.role === 'doctor' ? '90,000' : '35,000'}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}



          {/* TAB 6: DOCUMENTS */}
          {activeTab === 'documents' && (
            <div className="animate-in">
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginBottom: '24px' }}>
                <h1 style={{ fontSize: '24px', fontWeight: 800 }}>HR Documents</h1>
                <p style={{ fontSize: '13px', color: '#64748B', fontWeight: 600 }}>Access, view, download or upload your employment documents and certificates</p>
              </div>

              <div className="hr-docs-grid">
                {Object.keys(documentsData)
                  .map((catKey) => {
                    const category = documentsData[catKey];
                  return (
                    <div key={catKey} className="hr-doc-card">
                      <div className="hr-doc-card-header">
                        <div className="hr-doc-card-title-block">
                          <div className="hr-doc-icon-badge" style={{ backgroundColor: category.bgColor, color: category.color }}>
                            {catKey === 'appointment_letter' && (
                              <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><line x1="10" y1="9" x2="8" y2="9"/></svg>
                            )}
                            {catKey === 'offer_letter' && (
                              <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="6"/><path d="M15.477 12.89 17 22l-5-3-5 3 1.523-9.11"/></svg>
                            )}
                            {catKey === 'salary_slips' && (
                              <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="20" height="12" x="2" y="6" rx="2"/><circle cx="12" cy="12" r="2"/><path d="M6 12h.01M18 12h.01"/></svg>
                            )}
                            {catKey === 'identity_documents' && (
                              <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                            )}
                            {catKey === 'certifications' && (
                              <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c0 2 2 3 6 3s6-1 6-3v-5"/></svg>
                            )}
                          </div>
                          <span className="hr-doc-card-title">{category.title}</span>
                        </div>

                        {/* File Upload Selector */}
                        {canModifyCategory(catKey) && (
                          <div>
                            <label htmlFor={`upload-${catKey}`} className="hr-doc-upload-label">
                              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                              <span>Add</span>
                            </label>
                            <input 
                              type="file" 
                              id={`upload-${catKey}`} 
                              style={{ display: 'none' }}
                              onChange={(e) => {
                                if (e.target.files && e.target.files[0]) {
                                  handleUploadDoc(catKey, e.target.files[0]);
                                }
                              }}
                            />
                          </div>
                        )}
                      </div>

                      <div className="hr-doc-list">
                        {category.docs.length > 0 ? (
                          category.docs.map((doc) => (
                            <div key={doc.id} className="hr-doc-item-row">
                              <div className="hr-doc-item-left" title={doc.name}>
                                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, color: '#64748B' }}><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/></svg>
                                <span style={{ textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>{doc.name}</span>
                              </div>
                              <div className="hr-doc-item-actions">
                                <button 
                                  className="hr-doc-action-btn"
                                  title="View Document"
                                  onClick={() => setPreviewDoc(doc)}
                                >
                                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#2563EB" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>
                                </button>
                                <button 
                                  className="hr-doc-action-btn"
                                  title="Download Document"
                                  onClick={() => downloadDoc(doc)}
                                >
                                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#10B981" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/></svg>
                                </button>
                                {canDeleteDoc(catKey) && doc.id !== 'app_1' && doc.id !== 'off_1' && doc.id !== 'sal_1' && doc.id !== 'sal_2' && doc.id !== 'sal_3' && doc.id !== 'id_1' && doc.id !== 'id_2' && doc.id !== 'cert_1' && (
                                  <button 
                                    className="hr-doc-action-btn"
                                    title="Delete Document"
                                    onClick={() => handleDeleteDoc(catKey, doc.id)}
                                  >
                                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#EF4444" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
                                  </button>
                                )}
                              </div>
                            </div>
                          ))
                        ) : (
                          <div style={{ textAlign: 'center', padding: '16px', color: '#94A3B8', fontSize: '12px', fontWeight: 600 }}>
                            No documents in this category
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* TAB 7: PROFILE */}
          {activeTab === 'profile' && (
            <div className="animate-in">
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginBottom: '24px' }}>
                <h1 style={{ fontSize: '24px', fontWeight: 800 }}>
                  {currentUser.role === 'admin' || currentUser.role === 'hr' ? 'Employee Profile' : 'My Profile'}
                </h1>
                <p style={{ fontSize: '13px', color: '#64748B', fontWeight: 600 }}>
                  {currentUser.role === 'admin' || currentUser.role === 'hr' ? 'Employment record and personal details' : 'Manage contact details and personal settings'}
                </p>
              </div>

              <div className="hr-dashboard-grid" style={{ gridTemplateColumns: '1fr 2fr' }}>
                {/* Profile card summary */}
                <div className="hr-card" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px' }}>
                  {selectedEmployee?.avatar ? (
                    <img src={selectedEmployee.avatar} alt="Avatar" style={{ width: '96px', height: '96px', borderRadius: '50%', objectFit: 'cover', border: '4px solid #EFF6FF' }} />
                  ) : (
                    <div className="hr-profile-banner-avatar" style={{ width: '96px', height: '96px', fontSize: '32px' }}>{userInitials}</div>
                  )}
                  <div style={{ textAlign: 'center' }}>
                    <h3 style={{ fontSize: '16px', fontWeight: 800 }}>{selectedEmployee?.name || 'Staff Member'}</h3>
                    <p style={{ fontSize: '12px', color: '#64748B', fontWeight: 600 }}>{userRoleDisplay} • Curoxa Clinic</p>
                  </div>
                  <button className="hr-btn" style={{ width: '100%', justifyContent: 'center' }} onClick={() => showToast('Edit avatar feature coming soon!', 'info')}>Change photo</button>
                </div>

                {/* Profile Details Sheets */}
                <div className="hr-card" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                  <h3 className="hr-card-title" style={{ borderBottom: '1px solid #F1F5F9', paddingBottom: '12px', marginBottom: 0 }}>Employment Details</h3>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                    <div>
                      <div style={{ fontSize: '11px', color: '#64748B', fontWeight: 800, textTransform: 'uppercase' }}>Full Name</div>
                      <div style={{ fontSize: '13.5px', fontWeight: 700, marginTop: '4px' }}>{selectedEmployee?.name || 'Staff Member'}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: '11px', color: '#64748B', fontWeight: 800, textTransform: 'uppercase' }}>Email Address</div>
                      <div style={{ fontSize: '13.5px', fontWeight: 700, marginTop: '4px' }}>{selectedEmployee?.email || 'staff@curoxa.com'}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: '11px', color: '#64748B', fontWeight: 800, textTransform: 'uppercase' }}>Staff ID</div>
                      <div style={{ fontSize: '13.5px', fontWeight: 700, marginTop: '4px' }}>{staffId}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: '11px', color: '#64748B', fontWeight: 800, textTransform: 'uppercase' }}>Job Role</div>
                      <div style={{ fontSize: '13.5px', fontWeight: 700, marginTop: '4px' }}>{userRoleDisplay}</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Apply Leave Modal */}
      {showLeaveModal && (
        <div className="hr-modal-overlay" data-lenis-prevent>
          <div className="hr-modal-box">
            <div className="hr-modal-header" style={{ width: '100%' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <h3 style={{ fontSize: '20px', fontWeight: 800, color: '#0F172A', margin: 0 }}>Apply for leave</h3>
                <span style={{ fontSize: '12px', color: '#64748B', fontWeight: 600 }}>
                  Reports to: <strong style={{ color: '#334155' }}>{selectedEmployee?.reportingManagerName || 'Ishita Jain (Administrator)'}</strong>
                </span>
              </div>
              <button 
                type="button"
                onClick={() => setShowLeaveModal(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748B', fontSize: '18px', fontWeight: 800, padding: 0, marginTop: '2px' }}
              >
                ✕
              </button>
            </div>
            
            <form onSubmit={handleApplyLeave} className="hr-modal-form">
              <div className="hr-form-group">
                <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span>Leave type</span>
                  {(() => {
                    const chosenBal = getBalanceForType(newLeave.type || 'Casual Leave');
                    if (chosenBal) {
                      return (
                        <span style={{ fontSize: '11.5px', fontWeight: 700, color: chosenBal.currentBalance > 0 ? '#059669' : '#DC2626' }}>
                          Available: {chosenBal.currentBalance} day(s)
                        </span>
                      );
                    }
                    return null;
                  })()}
                </label>
                <SearchableDropdown
                  value={newLeave.type}
                  onChange={(val) => setNewLeave({ ...newLeave, type: val })}
                  options={(() => {
                    const empGender = selectedEmployee?.gender || currentUser?.gender || '';
                    if (leavePolicy && Array.isArray(leavePolicy.leaveTypes)) {
                      return leavePolicy.leaveTypes
                        .filter(lt => lt.enabled && isLeaveTypeEligibleForStaff(lt.leaveType, empGender))
                        .map(lt => {
                          const bal = getBalanceForType(lt.leaveType);
                          const balTxt = bal ? `(${bal.currentBalance}d available)` : '';
                          return {
                            value: lt.leaveType,
                            label: `${lt.leaveType} ${balTxt}`.trim()
                          };
                        });
                    }
                    const defaultOptions = [
                      { value: 'Casual Leave', label: 'Casual Leave' },
                      { value: 'Sick Leave', label: 'Sick Leave' },
                      { value: 'Earned Leave', label: 'Earned Leave' },
                      { value: 'Maternity Leave', label: 'Maternity Leave' },
                      { value: 'Paternity Leave', label: 'Paternity Leave' },
                      { value: 'Comp Off', label: 'Comp Off' },
                      { value: 'Loss of Pay', label: 'Loss of Pay' }
                    ];
                    return defaultOptions.filter(opt => isLeaveTypeEligibleForStaff(opt.value, empGender));
                  })()}
                  placeholder="Select Leave Type"
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div className="hr-form-group">
                  <label>Start date</label>
                  <input 
                    type="date"
                    required
                    value={newLeave.from}
                    onChange={(e) => setNewLeave({ ...newLeave, from: e.target.value })}
                  />
                </div>

                <div className="hr-form-group">
                  <label>End date</label>
                  <input 
                    type="date"
                    required
                    value={newLeave.to}
                    onChange={(e) => setNewLeave({ ...newLeave, to: e.target.value })}
                  />
                </div>
              </div>

              {/* Duration Preview */}
              {newLeave.from && newLeave.to && (
                <div style={{ padding: '8px 12px', borderRadius: '8px', background: '#F8FAFC', border: '1px solid #E2E8F0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '12px' }}>
                  <span style={{ color: '#64748B', fontWeight: 600 }}>Estimated Duration:</span>
                  <strong style={{ color: '#0F172A' }}>
                    {(() => {
                      if (newLeave.halfDay) return '0.5 day (Half Day)';
                      const d1 = new Date(newLeave.from);
                      const d2 = new Date(newLeave.to);
                      if (d2 < d1) return 'Invalid Range (End < Start)';
                      const diff = Math.ceil(Math.abs(d2 - d1) / (1000 * 60 * 60 * 24)) + 1;
                      return `${diff} day(s)`;
                    })()}
                  </strong>
                </div>
              )}

              {/* Live Insufficient Balance Warning */}
              {(() => {
                const chosenBal = getBalanceForType(newLeave.type || 'Casual Leave');
                const empGender = selectedEmployee?.gender || currentUser?.gender || '';
                const isIneligible = !isLeaveTypeEligibleForStaff(newLeave.type || 'Casual Leave', empGender);
                
                let requestedDays = 0;
                if (newLeave.halfDay) {
                  requestedDays = 0.5;
                } else if (newLeave.from && newLeave.to) {
                  const d1 = new Date(newLeave.from);
                  const d2 = new Date(newLeave.to);
                  if (d2 >= d1) {
                    requestedDays = Math.ceil(Math.abs(d2 - d1) / (1000 * 60 * 60 * 24)) + 1;
                  }
                }

                const isPaidType = chosenBal ? chosenBal.paid : (newLeave.type !== 'Loss of Pay' && newLeave.type !== 'LWP');
                const isInsufficient = Boolean(
                  chosenBal &&
                  isPaidType &&
                  requestedDays > 0 &&
                  requestedDays > chosenBal.currentBalance
                );

                return (
                  <>
                    {isIneligible && (
                      <div style={{ padding: '10px 14px', borderRadius: '8px', background: '#FEF2F2', border: '1px solid #FECACA', color: '#B91C1C', fontSize: '12.5px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontSize: '16px' }}>⚠️</span>
                        <div>
                          <strong>Ineligible Leave Type:</strong> You are not eligible to apply for {newLeave.type}.
                        </div>
                      </div>
                    )}
                    {isInsufficient && !isIneligible && (
                      <div style={{ padding: '10px 14px', borderRadius: '8px', background: '#FEF2F2', border: '1px solid #FECACA', color: '#B91C1C', fontSize: '12.5px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontSize: '16px' }}>⚠️</span>
                        <div>
                          <strong>Insufficient balance:</strong> You have <strong>{chosenBal.currentBalance} day(s)</strong> available, but this request requires <strong>{requestedDays} day(s)</strong>.
                        </div>
                      </div>
                    )}
                  </>
                );
              })()}

              <div className="hr-half-day-container">
                <label className="hr-half-day-label">
                  <input 
                    type="checkbox" 
                    className="hr-half-day-checkbox"
                    checked={newLeave.halfDay || false}
                    onChange={(e) => setNewLeave({ ...newLeave, halfDay: e.target.checked })}
                  />
                  <span className="hr-half-day-custom-check"></span>
                  <span style={{ fontSize: '13px', fontWeight: 600, color: '#475569' }}>Half day application</span>
                </label>
              </div>

              <div className="hr-form-group">
                <label>Reason for Leave</label>
                <textarea 
                  placeholder="Provide a brief reason for your leave request"
                  required
                  rows={3}
                  value={newLeave.reason}
                  onChange={(e) => setNewLeave({ ...newLeave, reason: e.target.value })}
                />
              </div>

              <div className="hr-modal-footer" style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <button 
                  type="button" 
                  className="hr-modal-cancel-btn" 
                  onClick={() => setShowLeaveModal(false)}
                  disabled={isSubmittingLeave}
                >
                  Cancel
                </button>
                {(() => {
                  const chosenBal = getBalanceForType(newLeave.type || 'Casual Leave');
                  const empGender = selectedEmployee?.gender || currentUser?.gender || '';
                  const isIneligible = !isLeaveTypeEligibleForStaff(newLeave.type || 'Casual Leave', empGender);
                  
                  let requestedDays = 0;
                  if (newLeave.halfDay) {
                    requestedDays = 0.5;
                  } else if (newLeave.from && newLeave.to) {
                    const d1 = new Date(newLeave.from);
                    const d2 = new Date(newLeave.to);
                    if (d2 >= d1) {
                      requestedDays = Math.ceil(Math.abs(d2 - d1) / (1000 * 60 * 60 * 24)) + 1;
                    }
                  }

                  const isPaidType = chosenBal ? chosenBal.paid : (newLeave.type !== 'Loss of Pay' && newLeave.type !== 'LWP');
                  const isInsufficient = Boolean(
                    chosenBal &&
                    isPaidType &&
                    requestedDays > 0 &&
                    requestedDays > chosenBal.currentBalance
                  );

                  const isInvalidDates = !newLeave.from || !newLeave.to || (newLeave.to < newLeave.from);
                  const isBlocked = isSubmittingLeave || isIneligible || isInsufficient || isInvalidDates || requestedDays <= 0;

                  return (
                    <button 
                      type="submit" 
                      className="hr-modal-submit-btn"
                      disabled={isBlocked}
                      style={{
                        opacity: isBlocked ? 0.6 : 1,
                        cursor: isBlocked ? 'not-allowed' : 'pointer'
                      }}
                      title={isInsufficient ? 'Insufficient leave balance' : isIneligible ? 'Ineligible for this leave type' : ''}
                    >
                      {isSubmittingLeave ? 'Submitting...' : 'Submit Request'}
                    </button>
                  );
                })()}
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Leave Action Confirmation Modal */}
      {leaveActionModal.isOpen && leaveActionModal.leave && (
        <div className="hr-modal-overlay" data-lenis-prevent>
          <div className="hr-modal-box" style={{ maxWidth: '480px' }}>
            <div className="hr-modal-header" style={{ width: '100%' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <h3 style={{ fontSize: '18px', fontWeight: 800, color: leaveActionModal.action === 'Approved' ? '#047857' : '#B91C1C', margin: 0 }}>
                  {leaveActionModal.action === 'Approved' ? 'Approve Leave Request' : 'Reject Leave Request'}
                </h3>
                <span style={{ fontSize: '12px', color: '#64748B' }}>
                  Applicant: <strong style={{ color: '#0F172A' }}>{leaveActionModal.leave.employeeName || leaveActionModal.leave.employeeId}</strong>
                </span>
              </div>
              <button 
                type="button"
                onClick={() => setLeaveActionModal({ isOpen: false, leave: null, action: 'Approved', rejectionReason: '', isProcessing: false })}
                disabled={leaveActionModal.isProcessing}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748B', fontSize: '18px', fontWeight: 800, padding: 0 }}
              >
                ✕
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginTop: '12px' }}>
              <div style={{ background: '#F8FAFC', padding: '14px', borderRadius: '10px', border: '1px solid #E2E8F0', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                  <span style={{ color: '#64748B' }}>Leave Type:</span>
                  <strong style={{ color: '#0F172A' }}>{leaveActionModal.leave.leaveType || leaveActionModal.leave.type}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                  <span style={{ color: '#64748B' }}>Dates:</span>
                  <span style={{ fontWeight: 600, color: '#334155' }}>
                    {formatDate(leaveActionModal.leave.fromDate || leaveActionModal.leave.from)} - {formatDate(leaveActionModal.leave.toDate || leaveActionModal.leave.to)}
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                  <span style={{ color: '#64748B' }}>Total Days:</span>
                  <strong style={{ color: '#0F172A' }}>{leaveActionModal.leave.days} day(s)</strong>
                </div>
                {leaveActionModal.leave.reason && (
                  <div style={{ borderTop: '1px dashed #CBD5E1', paddingTop: '8px', fontSize: '12px', color: '#64748B', fontStyle: 'italic' }}>
                    Staff Reason: "{leaveActionModal.leave.reason}"
                  </div>
                )}
              </div>

              {leaveActionModal.action === 'Approved' ? (
                <div style={{ padding: '10px 12px', borderRadius: '8px', background: '#ECFDF5', border: '1px solid #A7F3D0', fontSize: '12px', color: '#065F46', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span>ℹ️</span>
                  <span>Approving will deduct <strong>{leaveActionModal.leave.days} day(s)</strong> from balance and log a debit transaction in the authoritative ledger.</span>
                </div>
              ) : (
                <div className="hr-form-group">
                  <label style={{ fontSize: '12.5px', fontWeight: 700, color: '#334155' }}>Rejection Reason / Remarks (Optional)</label>
                  <textarea
                    rows={2}
                    placeholder="e.g. Inadequate shift coverage on requested dates"
                    value={leaveActionModal.rejectionReason}
                    onChange={(e) => setLeaveActionModal({ ...leaveActionModal, rejectionReason: e.target.value })}
                    style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '13px' }}
                  />
                </div>
              )}

              <div className="hr-modal-footer" style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '8px' }}>
                <button 
                  type="button" 
                  className="hr-modal-cancel-btn" 
                  onClick={() => setLeaveActionModal({ isOpen: false, leave: null, action: 'Approved', rejectionReason: '', isProcessing: false })}
                  disabled={leaveActionModal.isProcessing}
                >
                  Cancel
                </button>
                <button 
                  type="button" 
                  className="hr-btn"
                  onClick={handleConfirmLeaveAction}
                  disabled={leaveActionModal.isProcessing}
                  style={{
                    background: leaveActionModal.action === 'Approved' ? '#10B981' : '#EF4444',
                    color: 'white',
                    fontWeight: 800,
                    padding: '8px 18px',
                    borderRadius: '8px',
                    border: 'none',
                    cursor: leaveActionModal.isProcessing ? 'not-allowed' : 'pointer',
                    opacity: leaveActionModal.isProcessing ? 0.7 : 1
                  }}
                >
                  {leaveActionModal.isProcessing ? 'Processing...' : leaveActionModal.action === 'Approved' ? 'Confirm Approval' : 'Confirm Rejection'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Document Preview Modal */}
      {previewDoc && (
        <div className="hr-preview-modal-overlay" data-lenis-prevent onClick={() => setPreviewDoc(null)}>
          <div className="hr-preview-modal" onClick={e => e.stopPropagation()}>
            <div className="hr-preview-modal-header">
              <span className="hr-preview-modal-title">{previewDoc.name}</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <button 
                  className="hr-btn" 
                  style={{ height: '32px', padding: '0 12px', display: 'flex', alignItems: 'center', gap: '6px' }}
                  onClick={() => downloadDoc(previewDoc)}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/></svg>
                  <span>Download</span>
                </button>
                <button 
                  className="hr-btn"
                  style={{ height: '32px', width: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}
                  onClick={() => setPreviewDoc(null)}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
              </div>
            </div>
            <div className="hr-preview-modal-body">
              {previewDoc.dataUrl === 'dummy' ? (
                <div style={{ padding: '40px', background: 'white', borderRadius: '12px', border: '1px solid #E2E8F0', width: '100%', maxWidth: '600px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', paddingBottom: '16px', borderBottom: '2px solid #E2E8F0' }}>
                    <div style={{ width: '40px', height: '40px', borderRadius: '8px', background: '#EFF6FF', color: '#2563EB', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900 }}>C</div>
                    <div>
                      <h4 style={{ fontSize: '15px', fontWeight: 900, margin: 0, color: '#0F172A' }}>Curoxa Clinical Portal</h4>
                      <span style={{ fontSize: '11px', color: '#64748B', fontWeight: 700 }}>EMPLOYEE DOCUMENT SYSTEM</span>
                    </div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <div>
                      <span style={{ fontSize: '10px', color: '#94A3B8', fontWeight: 800, textTransform: 'uppercase' }}>Document Name</span>
                      <p style={{ fontSize: '13.5px', fontWeight: 700, margin: '2px 0 0 0', color: '#334155' }}>{previewDoc.name}</p>
                    </div>
                    <div>
                      <span style={{ fontSize: '10px', color: '#94A3B8', fontWeight: 800, textTransform: 'uppercase' }}>Security Hash</span>
                      <p style={{ fontSize: '11px', fontFamily: 'monospace', margin: '2px 0 0 0', color: '#64748B' }}>
                        MD5:{Array.from({ length: 32 }, (_, i) => (i % 8 === 0 && i > 0 ? '-' : '') + Math.floor(Math.random() * 16).toString(16)).join('').toUpperCase()}
                      </p>
                    </div>
                    <div style={{ padding: '16px', background: '#F8FAFC', borderRadius: '8px', border: '1px dashed #CBD5E1', fontSize: '12.5px', color: '#475569', lineHeight: 1.5, fontWeight: 550 }}>
                      This is a secure system file stored directly in your employee profile workspace. Real file contents are protected by end-to-end organizational encryption policies. You may download this file locally using the download button above.
                    </div>
                  </div>
                </div>
              ) : previewDoc.type.startsWith('image/') ? (
                <img src={previewDoc.dataUrl} alt={previewDoc.name} style={{ maxWidth: '100%', maxHeight: '60vh', objectFit: 'contain', borderRadius: '8px' }} />
              ) : (
                <iframe src={previewDoc.dataUrl} title={previewDoc.name} style={{ width: '100%', height: '60vh', border: 'none', borderRadius: '8px' }} />
              )}
            </div>
          </div>
        </div>
      )}
      {toast && (
        <>
          <style>{`
            @keyframes hrSlideIn {
              from { transform: translateY(100px); opacity: 0; }
              to { transform: translateY(0); opacity: 1; }
            }
          `}</style>
          <div style={{
            position: 'fixed',
            bottom: '24px',
            right: '24px',
            backgroundColor: '#1E293B',
            color: '#F8FAFC',
            padding: '12px 20px',
            borderRadius: '12px',
            boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -4px rgba(0, 0, 0, 0.1)',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            zIndex: 9999,
            fontWeight: 700,
            fontSize: '13px',
            animation: 'hrSlideIn 0.3s ease forwards',
            borderLeft: toast.type === 'error' ? '4px solid #EF4444' : '4px solid #3B82F6'
          }}>
            {toast.type === 'error' ? (
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#EF4444" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#3B82F6" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>
            )}
            {toast.msg}
          </div>
        </>
      )}
      {showAddStaffModal && (
        <div 
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(15, 23, 42, 0.3)',
            backdropFilter: 'blur(8px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999
          }}
          onClick={() => { setShowAddStaffModal(false); setShowAddStaffPassword(false); setAddStaffError(''); }}
        >
          <div 
            style={{
              background: '#FFFFFF',
              borderRadius: '16px',
              width: '90%',
              maxWidth: '520px',
              maxHeight: '90vh',
              overflowY: 'auto',
              boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1), 0 10px 10px -5px rgba(0,0,0,0.04)',
              padding: '24px',
              animation: 'hrSlideIn 0.3s ease'
            }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', borderBottom: '1px solid #E2E8F0', paddingBottom: '12px' }}>
              <span style={{ fontSize: '18px', fontWeight: 800, color: '#0F172A' }}>Add New Staff Account</span>
              <button 
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748B' }}
                onClick={() => { setShowAddStaffModal(false); setShowAddStaffPassword(false); setAddStaffError(''); }}
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" x2="6" y1="6" y2="18"/><line x1="6" x2="18" y1="6" y2="18"/></svg>
              </button>
            </div>
            
            <form onSubmit={handleAddStaff} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {addStaffError && (
                <div style={{
                  background: '#FEE2E2',
                  border: '1px solid #FCA5A5',
                  color: '#991B1B',
                  padding: '12px 16px',
                  borderRadius: '8px',
                  fontSize: '13px',
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}>
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><circle cx="12" cy="12" r="10"/><line x1="12" x2="12" y1="8" y2="12"/><line x1="12" x2="12.01" y1="16" y2="16"/></svg>
                  <span>{addStaffError}</span>
                </div>
              )}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '12.5px', fontWeight: 700, color: '#334155' }}>Full Name</label>
                <input 
                  type="text" 
                  style={{ height: '40px', padding: '0 12px', border: '1px solid #CBD5E1', borderRadius: '8px', fontSize: '14px', outline: 'none' }}
                  value={newStaff.name} 
                  onChange={e => setNewStaff({...newStaff, name: e.target.value})} 
                  placeholder="e.g. Dr. Jane Smith" 
                  required 
                />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '12.5px', fontWeight: 700, color: '#334155' }}>Username (Staff ID)</label>
                <input 
                  type="text" 
                  style={{ height: '40px', padding: '0 12px', border: '1px solid #CBD5E1', borderRadius: '8px', fontSize: '14px', outline: 'none' }}
                  value={newStaff.staff_id} 
                  onChange={e => setNewStaff({...newStaff, staff_id: e.target.value})} 
                  placeholder="e.g. janesmith" 
                  required 
                  autoComplete="new-username"
                />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '12.5px', fontWeight: 700, color: '#334155' }}>Login Password</label>
                <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                  <input 
                    type={showAddStaffPassword ? 'text' : 'password'} 
                    style={{ height: '40px', padding: '0 40px 0 12px', border: '1px solid #CBD5E1', borderRadius: '8px', fontSize: '14px', outline: 'none', width: '100%' }}
                    value={newStaff.password} 
                    onChange={e => setNewStaff({...newStaff, password: e.target.value})} 
                    placeholder="••••••••" 
                    required 
                    autoComplete="new-password"
                  />
                  <button 
                    type="button"
                    onClick={() => setShowAddStaffPassword(!showAddStaffPassword)}
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
                    {showAddStaffPassword ? (
                      <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"/><path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"/><path d="M6.61 6.61A13.52 13.52 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61"/><line x1="2" x2="22" y1="2" y2="22"/></svg>
                    ) : (
                      <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>
                    )}
                  </button>
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '12.5px', fontWeight: 700, color: '#334155' }}>Confirm Password</label>
                <input 
                  type={showAddStaffPassword ? 'text' : 'password'} 
                  style={{ height: '40px', padding: '0 12px', border: `1px solid ${newStaff.confirmPassword && newStaff.password !== newStaff.confirmPassword ? '#EF4444' : '#CBD5E1'}`, borderRadius: '8px', fontSize: '14px', outline: 'none' }}
                  value={newStaff.confirmPassword} 
                  onChange={e => setNewStaff({...newStaff, confirmPassword: e.target.value})} 
                  placeholder="Re-enter password" 
                  required 
                  autoComplete="new-password"
                />
                {newStaff.confirmPassword && newStaff.password !== newStaff.confirmPassword && (
                  <p style={{ margin: '2px 0 0', fontSize: '11px', color: '#EF4444', fontWeight: 600 }}>Passwords do not match</p>
                )}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '12.5px', fontWeight: 700, color: '#334155' }}>Access Role</label>
                <SearchableDropdown
                  value={newStaff.role} 
                  onChange={val => setNewStaff({...newStaff, role: val})}
                  options={[
                    { value: 'doctor', label: 'Doctor' },
                    { value: 'receptionist', label: 'Receptionist' },
                    { value: 'lab', label: 'Laboratory' },
                    { value: 'pharmacy', label: 'Pharmacy' },
                    { value: 'hr', label: 'HR Manager' },
                    { value: 'admin', label: 'System Admin' }
                  ]}
                  placeholder="Select Role"
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '12.5px', fontWeight: 700, color: '#334155', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <svg style={{ width: '14px', height: '14px', flexShrink: 0 }} viewBox="0 0 24 24">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22c-.62-.62-1.05-1.37-1.35-2.22z"/>
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
                  </svg>
                  Google Login Email
                  <span style={{ fontSize: '10px', fontWeight: 600, color: '#94A3B8', marginLeft: '4px' }}>(optional)</span>
                </label>
                <input 
                  type="email" 
                  style={{ height: '40px', padding: '0 12px', border: '1px solid #CBD5E1', borderRadius: '8px', fontSize: '14px', outline: 'none' }}
                  value={newStaff.email} 
                  onChange={e => setNewStaff({...newStaff, email: e.target.value})} 
                  placeholder="e.g. doctor.sarah@gmail.com" 
                  autoComplete="off"
                />
              </div>

              {newStaff.role === 'doctor' && (
                <>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <label style={{ fontSize: '12.5px', fontWeight: 700, color: '#334155' }}>Daily Max Appointment Slots</label>
                    <input 
                      type="number" 
                      style={{ height: '40px', padding: '0 12px', border: '1px solid #CBD5E1', borderRadius: '8px', fontSize: '14px', outline: 'none' }}
                      min="1" 
                      max="100" 
                      value={newStaff.max_slots} 
                      onChange={e => setNewStaff({...newStaff, max_slots: Number(e.target.value)})} 
                      required 
                    />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <label style={{ fontSize: '12.5px', fontWeight: 700, color: '#334155' }}>Doctor Consultation Fee (₹)</label>
                    <input 
                      type="number" 
                      style={{ height: '40px', padding: '0 12px', border: '1px solid #CBD5E1', borderRadius: '8px', fontSize: '14px', outline: 'none' }}
                      min="0" 
                      placeholder="e.g. 500"
                      value={newStaff.consultationFee !== undefined ? newStaff.consultationFee : 500} 
                      onChange={e => setNewStaff({...newStaff, consultationFee: e.target.value !== '' ? Number(e.target.value) : ''})} 
                      required 
                    />
                  </div>
                </>
              )}

              <div style={{ height: '1px', background: '#E2E8F0', margin: '8px 0' }} />
              <span style={{ fontSize: '13px', fontWeight: 800, color: '#334155' }}>Personal & Demographic Data</span>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontSize: '11px', fontWeight: 700, color: '#64748B' }}>DATE OF BIRTH</label>
                  <input type="date" style={{ height: '36px', padding: '0 8px', border: '1px solid #CBD5E1', borderRadius: '6px', fontSize: '13px', outline: 'none' }} value={newStaff.dob} onChange={e => setNewStaff({...newStaff, dob: e.target.value})} />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontSize: '11px', fontWeight: 700, color: '#64748B' }}>GENDER</label>
                  <select style={{ height: '36px', padding: '0 8px', border: '1px solid #CBD5E1', borderRadius: '6px', fontSize: '13px', outline: 'none' }} value={newStaff.gender} onChange={e => setNewStaff({...newStaff, gender: e.target.value})}>
                    <option value="">Select</option><option value="Male">Male</option><option value="Female">Female</option><option value="Other">Other</option>
                  </select>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontSize: '11px', fontWeight: 700, color: '#64748B' }}>BLOOD GROUP</label>
                  <select style={{ height: '36px', padding: '0 8px', border: '1px solid #CBD5E1', borderRadius: '6px', fontSize: '13px', outline: 'none' }} value={newStaff.bloodGroup} onChange={e => setNewStaff({...newStaff, bloodGroup: e.target.value})}>
                    <option value="">Select</option>{['A+', 'A-', 'B+', 'B-', 'O+', 'O-', 'AB+', 'AB-'].map(bg => <option key={bg} value={bg}>{bg}</option>)}
                  </select>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', gridColumn: 'span 2' }}>
                  <label style={{ fontSize: '11px', fontWeight: 700, color: '#64748B' }}>WEEKLY OFF</label>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                    {['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].map(day => {
                      const isSelected = Array.isArray(newStaff.weeklyOff)
                        ? newStaff.weeklyOff.includes(day)
                        : (newStaff.weeklyOff || '').split(',').map(d => d.trim()).includes(day);
                      return (
                        <button
                          key={day}
                          type="button"
                          onClick={() => {
                            let currentOffs = Array.isArray(newStaff.weeklyOff)
                              ? [...newStaff.weeklyOff]
                              : (newStaff.weeklyOff ? newStaff.weeklyOff.split(',').map(d => d.trim()) : []);
                            if (currentOffs.includes(day)) {
                              currentOffs = currentOffs.filter(d => d !== day);
                            } else {
                              currentOffs.push(day);
                            }
                            setNewStaff({...newStaff, weeklyOff: currentOffs});
                          }}
                          style={{
                            padding: '6px 10px',
                            borderRadius: '6px',
                            fontSize: '12px',
                            fontWeight: 600,
                            border: '1px solid ' + (isSelected ? '#2563EB' : '#CBD5E1'),
                            background: isSelected ? '#2563EB' : '#FFFFFF',
                            color: isSelected ? '#FFFFFF' : '#475569',
                            cursor: 'pointer',
                            transition: 'all 0.2s'
                          }}
                        >
                          {day.slice(0, 3)}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontSize: '11px', fontWeight: 700, color: '#64748B' }}>AADHAAR</label>
                  <input type="text" placeholder="XXXX-XXXX-XXXX" style={{ height: '36px', padding: '0 8px', border: '1px solid #CBD5E1', borderRadius: '6px', fontSize: '13px', fontFamily: 'monospace', outline: 'none' }} value={newStaff.aadhaar} onChange={e => setNewStaff({...newStaff, aadhaar: e.target.value})} />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontSize: '11px', fontWeight: 700, color: '#64748B' }}>PAN</label>
                  <input type="text" placeholder="ABCDE1234F" style={{ height: '36px', padding: '0 8px', border: '1px solid #CBD5E1', borderRadius: '6px', fontSize: '13px', fontFamily: 'monospace', outline: 'none' }} value={newStaff.pan} onChange={e => setNewStaff({...newStaff, pan: e.target.value})} />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', gridColumn: '1 / -1' }}>
                  <label style={{ fontSize: '11px', fontWeight: 700, color: '#64748B' }}>ADDRESS</label>
                  <textarea rows="2" style={{ padding: '8px', border: '1px solid #CBD5E1', borderRadius: '6px', fontSize: '13px', outline: 'none', resize: 'none' }} value={newStaff.address} onChange={e => setNewStaff({...newStaff, address: e.target.value})} />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', gridColumn: '1 / -1' }}>
                  <span style={{ fontSize: '11px', fontWeight: 800, color: '#2563EB', marginTop: '4px' }}>EMERGENCY CONTACT</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', gridColumn: '1 / -1' }}>
                  <label style={{ fontSize: '11px', fontWeight: 700, color: '#64748B' }}>NAME</label>
                  <input type="text" style={{ height: '36px', padding: '0 8px', border: '1px solid #CBD5E1', borderRadius: '6px', fontSize: '13px', outline: 'none' }} value={newStaff.emergencyContactName} onChange={e => setNewStaff({...newStaff, emergencyContactName: e.target.value})} />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontSize: '11px', fontWeight: 700, color: '#64748B' }}>RELATION</label>
                  <input type="text" style={{ height: '36px', padding: '0 8px', border: '1px solid #CBD5E1', borderRadius: '6px', fontSize: '13px', outline: 'none' }} value={newStaff.emergencyContactRelation} onChange={e => setNewStaff({...newStaff, emergencyContactRelation: e.target.value})} />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontSize: '11px', fontWeight: 700, color: '#64748B' }}>PHONE</label>
                  <input type="tel" style={{ height: '36px', padding: '0 8px', border: '1px solid #CBD5E1', borderRadius: '6px', fontSize: '13px', fontFamily: 'monospace', outline: 'none' }} value={newStaff.emergencyContactPhone} onChange={e => setNewStaff({...newStaff, emergencyContactPhone: e.target.value})} />
                </div>
              </div>

              <button 
                type="submit" 
                disabled={loading} 
                style={{
                  height: '44px',
                  borderRadius: '8px',
                  border: 'none',
                  background: 'linear-gradient(135deg, #2563EB 0%, #1D4ED8 100%)',
                  color: '#FFFFFF',
                  fontSize: '14px',
                  fontWeight: 800,
                  cursor: loading ? 'not-allowed' : 'pointer',
                  opacity: loading ? 0.7 : 1,
                  marginTop: '10px'
                }}
              >
                {loading ? 'Processing...' : 'Create Account'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
