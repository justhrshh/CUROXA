import React, { useState, useEffect } from 'react';
import { 
  Clock, Calendar, CheckSquare, Plus, Check, X, CalendarDays, AlertCircle, 
  Settings2, RefreshCcw, Smile, CalendarClock, Eye, UserCheck
} from 'lucide-react';

const originalFetch = window.fetch;
const fetch = async (url, options = {}) => {
  const baseUrl = import.meta.env.VITE_API_URL || '/api';
  let targetUrl = url;
  if (url && typeof url === 'string' && url.startsWith('/api')) {
    if (baseUrl.startsWith('http')) {
      targetUrl = url.replace('/api', baseUrl);
    }
  }
  return originalFetch(targetUrl, options);
};

export default function AttendanceLeaveView({
  employees = [],
  leaveRequests = [],
  attendanceRecords = [],
  onApproveLeave,
  onRejectLeave,
  onApproveAttendance,
  onRejectAttendance,
  onSaveAttendance
}) {
  const [activeSubTab, setActiveSubTab] = useState('Leaves');
  const [toast, setToast] = useState(null);
  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };
  
  // Calendar Roster states
  const [viewMode, setViewMode] = useState('Table'); // 'Table' or 'Calendar'
  const [selectedCalendarEmployeeId, setSelectedCalendarEmployeeId] = useState('');
  const [calendarDate, setCalendarDate] = useState(new Date());
  
  // Override Modal state
  const [overrideModalOpen, setOverrideModalOpen] = useState(false);
  const [overrideDate, setOverrideDate] = useState('');
  const [overrideClockIn, setOverrideClockIn] = useState('');
  const [overrideClockOut, setOverrideClockOut] = useState('');
  const [overrideStatus, setOverrideStatus] = useState('Present');

  // Days in month helper
  const getDaysInMonth = (date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const firstDayIndex = new Date(year, month, 1).getDay();
    const totalDays = new Date(year, month + 1, 0).getDate();
    
    const days = [];
    for (let i = 0; i < firstDayIndex; i++) {
      days.push(null);
    }
    for (let i = 1; i <= totalDays; i++) {
      const dayStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
      days.push({ dayNum: i, dateStr: dayStr });
    }
    return days;
  };

  const calculateWorkHours = (inTime, outTime) => {
    if (!inTime || !outTime) return 0;
    const [inH, inM] = inTime.split(':').map(Number);
    const [outH, outM] = outTime.split(':').map(Number);
    if (isNaN(inH) || isNaN(inM) || isNaN(outH) || isNaN(outM)) return 0;
    
    let diffMs = (outH * 60 + outM) - (inH * 60 + inM);
    if (diffMs < 0) {
      diffMs += 24 * 60; // overnight
    }
    return Number((diffMs / 60).toFixed(2));
  };

  const handleOpenOverride = (dateStr) => {
    if (!selectedCalendarEmployeeId) {
      showToast('Please select an employee first.', 'error');
      return;
    }
    setOverrideDate(dateStr);
    
    const emp = employees.find(e => e.id === selectedCalendarEmployeeId || e.staff_id === selectedCalendarEmployeeId);
    const existing = attendanceRecords.find(
      r => (r.employeeId === selectedCalendarEmployeeId || r.employeeId === emp?.id || r.employeeId === emp?.staff_id) && r.date === dateStr
    );
    
    if (existing) {
      setOverrideClockIn(existing.clockIn || existing.punchIn || '');
      setOverrideClockOut(existing.clockOut || existing.punchOut || '');
      setOverrideStatus(existing.status || 'Present');
    } else {
      const emp = employees.find(e => e.id === selectedCalendarEmployeeId || e.staff_id === selectedCalendarEmployeeId);
      
      const leave = leaveRequests.find(req => 
        (req.employeeId === selectedCalendarEmployeeId || req.employeeId === emp?.staff_id || req.employeeId === emp?.id) &&
        req.status === 'Approved' &&
        dateStr >= (req.fromDate || req.startDate) &&
        dateStr <= (req.toDate || req.endDate)
      );

      const dateObj = new Date(dateStr + 'T00:00:00');
      const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      const dayName = dayNames[dateObj.getDay()];
      const isWeeklyOff = emp && (
        Array.isArray(emp.weeklyOff)
          ? emp.weeklyOff.includes(dayName)
          : typeof emp.weeklyOff === 'string'
            ? emp.weeklyOff.split(',').map(d => d.trim()).includes(dayName)
            : dayName === (emp.weeklyOff || 'Sunday')
      );

      if (leave) {
        setOverrideStatus('Leave');
      } else if (isWeeklyOff) {
        setOverrideStatus('Holiday');
      } else {
        // For past/today default to Absent
        const cellDate = new Date(dateStr + 'T00:00:00');
        const todayDate = new Date();
        todayDate.setHours(0,0,0,0);
        if (cellDate <= todayDate) {
          setOverrideStatus('Absent');
        } else {
          setOverrideStatus('Present');
        }
      }
      setOverrideClockIn('');
      setOverrideClockOut('');
    }
    setOverrideModalOpen(true);
  };

  const handleSaveOverride = () => {
    const emp = employees.find(e => e.id === selectedCalendarEmployeeId || e.staff_id === selectedCalendarEmployeeId);
    if (!emp) return;
    
    const existing = attendanceRecords.find(
      r => (r.employeeId === selectedCalendarEmployeeId || r.employeeId === emp?.id || r.employeeId === emp?.staff_id) && r.date === overrideDate
    );
    
    const calculatedHours = calculateWorkHours(overrideClockIn, overrideClockOut);
    const otHours = Math.max(0, calculatedHours - 8);

    const recordToSave = {
      ...(existing || {}),
      employeeId: emp.id || emp.staff_id,
      employeeName: emp.name,
      employeePhoto: emp.photo || '',
      department: emp.department,
      date: overrideDate,
      clockIn: overrideClockIn,
      clockOut: overrideClockOut,
      status: overrideStatus,
      workHours: calculatedHours,
      workingHours: calculatedHours,
      overtimeHours: otHours
    };
    
    onSaveAttendance(recordToSave);
    setOverrideModalOpen(false);
  };

  // Dynamic today's date based on the latest attendance records
  const getTodayDateStr = () => {
    if (attendanceRecords.length === 0) return new Date().toISOString().split('T')[0];
    const dates = attendanceRecords.map(r => r.date).sort();
    return dates[dates.length - 1] || new Date().toISOString().split('T')[0];
  };
  const today = getTodayDateStr();
  const todayRecords = attendanceRecords.filter(r => r.date === today);
  const presentCount = todayRecords.filter(r => r.status === 'Present').length;
  const lateCount = todayRecords.filter(r => r.status === 'Late').length;
  const halfDayCount = todayRecords.filter(r => r.status === 'Half Day').length;
  const absentCount = Math.max(0, employees.length - presentCount - lateCount - halfDayCount);

  // Leave policies state (should come from backend props)
  const [policies, setPolicies] = useState(() => {
    // Try to get from backend data if available
    const lb = (employees.length > 0 && employees[0].leaveBalance) ? employees[0].leaveBalance : {};
    return [
      { type: 'Sick Leave', paid: true, days: lb.sick || 12, carryForward: true, description: 'Medical emergency and recovery. Requires board doctor advisory if >3 days.', enabled: true },
      { type: 'Casual Leave', paid: true, days: lb.casual || 10, carryForward: false, description: 'Personal affairs, travel, or unplanned personal engagements.', enabled: true },
      { type: 'Annual Leave (Earned)', paid: true, days: lb.annual || 15, carryForward: true, description: 'Pre-planned vacations. Minimum 14-day advance booking notice.', enabled: true },
      { type: 'Maternity Leave', paid: true, days: lb.maternity || 90, carryForward: false, description: 'Fully paid medical prenatal and postnatal care leave.', enabled: true },
      { type: 'Comp Off', paid: true, days: lb.compOff || 5, carryForward: false, description: 'Earned compensatory leaves in lieu of emergency weekend ICU call duty.', enabled: true }
    ];
  });

  const [editingPolicyIdx, setEditingPolicyIdx] = useState(null);
  const [editingDays, setEditingDays] = useState(0);

  // Holiday list for calendar - should be fetched from backend
  const [holidays, setHolidays] = useState([]);
  
  // Fetch holidays from backend on mount
  useEffect(() => {
    const fetchHolidays = async () => {
      try {
        // Try to fetch from backend API
        const response = await fetch('/api/hr/holidays');
        if (response.ok) {
          const data = await response.json();
          setHolidays(data);
        }
      } catch (err) {
        console.log('Holidays not available from backend, using empty list');
      }
    };
    fetchHolidays();
  }, []);

  // Adjust policies
  const handleSavePolicy = (idx) => {
    const updated = [...policies];
    updated[idx].days = editingDays;
    setPolicies(updated);
    setEditingPolicyIdx(null);
  };

  return (
    <div className="space-y-6" id="attendance-leave-workspace">
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
      
      {/* Navigation subheader */}
      <div className="flex flex-col md:flex-row md:items-center justify-between border-b border-slate-200 pb-3 gap-4">
        <div>
          <h1 className="text-xl font-display font-bold text-slate-900">Workforce Attendance & Leave</h1>
          <p className="text-slate-400 text-xs mt-0.5">Approve biometric correction queues, monitor daily rosters, and manage clinic vacation schedules.</p>
        </div>

        <div className="flex bg-slate-100 p-1 rounded-xl self-start">
          <button
            onClick={() => setActiveSubTab('Leaves')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all flex items-center gap-1 ${
              activeSubTab === 'Leaves' ? 'bg-white text-blue-600 shadow-xs' : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <CalendarDays className="w-4 h-4" />
            Leave Requests
          </button>
          <button
            onClick={() => setActiveSubTab('Attendance')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all flex items-center gap-1 ${
              activeSubTab === 'Attendance' ? 'bg-white text-blue-600 shadow-xs' : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <Clock className="w-4 h-4" />
            Biometric Attendance
          </button>
          <button
            onClick={() => setActiveSubTab('Policies')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all flex items-center gap-1 ${
              activeSubTab === 'Policies' ? 'bg-white text-blue-600 shadow-xs' : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <Settings2 className="w-4 h-4" />
            Leave Policies
          </button>
          <button
            onClick={() => setActiveSubTab('Holidays')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all flex items-center gap-1 ${
              activeSubTab === 'Holidays' ? 'bg-white text-blue-600 shadow-xs' : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <CalendarClock className="w-4 h-4" />
            Holiday Calendar
          </button>
        </div>
      </div>

      {/* RENDER ACTIVE SUBTAB 1: Attendance Logs & Corrections */}
      {activeSubTab === 'Attendance' && (
        <div className="space-y-6">
          
          {/* 5 KPI CARDS ROW MATCHING DASHBOARD VISUAL LANGUAGE */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 w-full mb-6">
            {/* Card 1: Total Staff Rostered (Electric Blue Gradient with Bottom-Right Radial Glow) */}
            <div
              className="p-4 rounded-2xl border border-blue-200/90 shadow-[0_12px_28px_rgba(37,99,235,0.08)] hover:shadow-[0_16px_36px_rgba(37,99,235,0.16)] hover:-translate-y-0.5 transition-all flex flex-col justify-between relative overflow-hidden group cursor-pointer"
              style={{
                background: 'radial-gradient(circle at 100% 100%, rgba(59, 130, 246, 0.25) 0%, transparent 65%), linear-gradient(135deg, #FFFFFF 0%, #EFF6FF 50%, #DBEAFE 100%)'
              }}
              title="Total staff rostered for today"
            >
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-blue-700 to-blue-500 text-white flex items-center justify-center shrink-0 shadow-md shadow-blue-500/25">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
                </div>
                <span className="text-[10px] font-extrabold text-blue-900 uppercase tracking-wider">Total Rostered</span>
              </div>

              <div className="mt-3 flex items-end justify-between">
                <div>
                  <div className="text-3xl font-black text-slate-900 tracking-tight leading-none">{employees.length}</div>
                  <div className="text-xs text-blue-700 font-bold mt-1.5 truncate">
                    Active workforce
                  </div>
                </div>

                {/* Blue Mini Sparkline */}
                <div className="w-16 h-8 shrink-0 relative">
                  <svg className="w-full h-full overflow-visible" viewBox="0 0 64 32">
                    <defs>
                      <linearGradient id="attBlueGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#2563EB" stopOpacity="0.45"/>
                        <stop offset="100%" stopColor="#2563EB" stopOpacity="0.05"/>
                      </linearGradient>
                    </defs>
                    <path d="M 0 24 Q 16 26, 24 16 T 40 18 T 52 8 T 64 12 L 64 32 L 0 32 Z" fill="url(#attBlueGrad)" />
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

            {/* Card 2: Present Today (Emerald Gradient with Top-Right Radial Glow) */}
            <div
              className="p-4 rounded-2xl border border-emerald-200/90 shadow-[0_12px_28px_rgba(16,185,129,0.08)] hover:shadow-[0_16px_36px_rgba(16,185,129,0.16)] hover:-translate-y-0.5 transition-all flex flex-col justify-between relative overflow-hidden group cursor-pointer"
              style={{
                background: 'radial-gradient(circle at 100% 0%, rgba(16, 185, 129, 0.25) 0%, transparent 65%), linear-gradient(135deg, #FFFFFF 0%, #ECFDF5 50%, #D1FAE5 100%)'
              }}
              title="Verified staff present today"
            >
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-emerald-600 to-teal-500 text-white flex items-center justify-center shrink-0 shadow-md shadow-emerald-500/25">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
                </div>
                <span className="text-[10px] font-extrabold text-emerald-900 uppercase tracking-wider">Present Today</span>
              </div>

              <div className="mt-3 flex items-end justify-between">
                <div>
                  <div className="text-3xl font-black text-slate-900 tracking-tight leading-none">{presentCount}</div>
                  <div className="text-xs text-emerald-700 font-bold mt-1.5 truncate">
                    On duty & verified
                  </div>
                </div>

                {/* Emerald Mini Sparkline */}
                <div className="w-16 h-8 shrink-0 relative">
                  <svg className="w-full h-full overflow-visible" viewBox="0 0 64 32">
                    <defs>
                      <linearGradient id="attGreenGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#059669" stopOpacity="0.45"/>
                        <stop offset="100%" stopColor="#059669" stopOpacity="0.05"/>
                      </linearGradient>
                    </defs>
                    <path d="M 0 26 Q 14 24, 22 22 T 36 10 T 48 18 T 58 6 T 64 10 L 64 32 L 0 32 Z" fill="url(#attGreenGrad)" />
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

            {/* Card 3: Late Arrivals (Amber Gradient with Top-Left Radial Glow) */}
            <div
              className="p-4 rounded-2xl border border-amber-200/90 shadow-[0_12px_28px_rgba(245,158,11,0.08)] hover:shadow-[0_16px_36px_rgba(245,158,11,0.16)] hover:-translate-y-0.5 transition-all flex flex-col justify-between relative overflow-hidden group cursor-pointer"
              style={{
                background: 'radial-gradient(circle at 0% 0%, rgba(245, 158, 11, 0.25) 0%, transparent 65%), linear-gradient(135deg, #FFFFFF 0%, #FFFBEB 50%, #FEF3C7 100%)'
              }}
              title="Staff who clocked in after grace period"
            >
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-amber-600 to-amber-400 text-white flex items-center justify-center shrink-0 shadow-md shadow-amber-500/25">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 14 14"/></svg>
                </div>
                <span className="text-[10px] font-extrabold text-amber-900 uppercase tracking-wider">Late Arrivals</span>
              </div>

              <div className="mt-3 flex items-end justify-between">
                <div>
                  <div className="text-3xl font-black text-slate-900 tracking-tight leading-none">{lateCount}</div>
                  <div className="text-xs text-amber-700 font-bold mt-1.5 truncate">
                    Shift grace exceeded
                  </div>
                </div>

                {/* Amber Mini Sparkline */}
                <div className="w-16 h-8 shrink-0 relative">
                  <svg className="w-full h-full overflow-visible" viewBox="0 0 64 32">
                    <defs>
                      <linearGradient id="attAmberGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#D97706" stopOpacity="0.45"/>
                        <stop offset="100%" stopColor="#D97706" stopOpacity="0.05"/>
                      </linearGradient>
                    </defs>
                    <path d="M 0 28 Q 12 28, 20 26 T 38 18 T 50 14 T 64 22 L 64 32 L 0 32 Z" fill="url(#attAmberGrad)" />
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

            {/* Card 4: Half Days Active (Purple Gradient with Bottom-Left Radial Glow) */}
            <div
              className="p-4 rounded-2xl border border-purple-200/90 shadow-[0_12px_28px_rgba(139,92,246,0.08)] hover:shadow-[0_16px_36px_rgba(139,92,246,0.16)] hover:-translate-y-0.5 transition-all flex flex-col justify-between relative overflow-hidden group cursor-pointer"
              style={{
                background: 'radial-gradient(circle at 0% 100%, rgba(139, 92, 246, 0.25) 0%, transparent 65%), linear-gradient(135deg, #FFFFFF 0%, #F5F3FF 50%, #EDE9FE 100%)'
              }}
              title="Staff active on half day shift"
            >
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-purple-700 to-indigo-600 text-white flex items-center justify-center shrink-0 shadow-md shadow-purple-500/25">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 2a10 10 0 0 1 0 20z"/></svg>
                </div>
                <span className="text-[10px] font-extrabold text-purple-900 uppercase tracking-wider">Half Days Active</span>
              </div>

              <div className="mt-3 flex items-end justify-between">
                <div>
                  <div className="text-3xl font-black text-slate-900 tracking-tight leading-none">{halfDayCount}</div>
                  <div className="text-xs text-purple-700 font-bold mt-1.5 truncate">
                    Partial shift logged
                  </div>
                </div>

                {/* Purple Mini Sparkline */}
                <div className="w-16 h-8 shrink-0 relative">
                  <svg className="w-full h-full overflow-visible" viewBox="0 0 64 32">
                    <defs>
                      <linearGradient id="attPurpleGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#7C3AED" stopOpacity="0.45"/>
                        <stop offset="100%" stopColor="#7C3AED" stopOpacity="0.05"/>
                      </linearGradient>
                    </defs>
                    <path d="M 0 26 Q 16 26, 26 24 T 42 16 T 54 8 T 64 12 L 64 32 L 0 32 Z" fill="url(#attPurpleGrad)" />
                    <path d="M 0 26 Q 16 26, 26 24 T 42 16 T 54 8 T 64 12" fill="none" stroke="#7C3AED" strokeWidth="2.4" strokeLinecap="round" />
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

            {/* Card 5: Unexcused Absences (Crimson Gradient with Bottom-Right Radial Glow) */}
            <div
              className="p-4 rounded-2xl border border-red-200/90 shadow-[0_12px_28px_rgba(239,68,68,0.08)] hover:shadow-[0_16px_36px_rgba(239,68,68,0.16)] hover:-translate-y-0.5 transition-all flex flex-col justify-between relative overflow-hidden group cursor-pointer"
              style={{
                background: 'radial-gradient(circle at 100% 100%, rgba(239, 68, 68, 0.25) 0%, transparent 65%), linear-gradient(135deg, #FFFFFF 0%, #FEF2F2 50%, #FEE2E2 100%)'
              }}
              title="Staff absent without leave approval"
            >
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-red-600 to-rose-500 text-white flex items-center justify-center shrink-0 shadow-md shadow-red-500/25">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
                </div>
                <span className="text-[10px] font-extrabold text-red-900 uppercase tracking-wider">Unexcused Absences</span>
              </div>

              <div className="mt-3 flex items-end justify-between">
                <div>
                  <div className="text-3xl font-black text-slate-900 tracking-tight leading-none">{absentCount > 0 ? absentCount : 0}</div>
                  <div className="text-xs text-red-700 font-bold mt-1.5 truncate">
                    No punch / unapproved
                  </div>
                </div>

                {/* Red Mini Sparkline */}
                <div className="w-16 h-8 shrink-0 relative">
                  <svg className="w-full h-full overflow-visible" viewBox="0 0 64 32">
                    <defs>
                      <linearGradient id="attRedGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#EF4444" stopOpacity="0.45"/>
                        <stop offset="100%" stopColor="#EF4444" stopOpacity="0.05"/>
                      </linearGradient>
                    </defs>
                    <path d="M 0 26 Q 16 26, 26 24 T 42 16 T 54 8 T 64 12 L 64 32 L 0 32 Z" fill="url(#attRedGrad)" />
                    <path d="M 0 26 Q 16 26, 26 24 T 42 16 T 54 8 T 64 12" fill="none" stroke="#EF4444" strokeWidth="2.4" strokeLinecap="round" />
                  </svg>
                </div>
              </div>

              {/* Half Gradient Accent Line Beneath Card */}
              <div 
                className="h-[4px] rounded-br-2xl absolute bottom-0 right-0 w-3/5 pointer-events-none"
                style={{
                  background: 'linear-gradient(90deg, transparent 0%, #EF4444 100%)'
                }}
              />
            </div>
          </div>


          {/* Roster database logs card */}
          <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm space-y-4">
            <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4">
              <div>
                <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider">
                  {viewMode === 'Table' ? 'Active Shifts Daily Attendance Log' : 'Roster Calendar & Admin Override'}
                </h3>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  {viewMode === 'Table' 
                    ? 'Biometric punch activity logged by staff for today.' 
                    : 'Select a staff member below to view calendar and click a cell to override.'}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setViewMode('Table')}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                    viewMode === 'Table' 
                      ? 'bg-blue-600 text-white shadow-sm' 
                      : 'bg-slate-150 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  Table Log
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setViewMode('Calendar');
                    if (!selectedCalendarEmployeeId && employees.length > 0) {
                      setSelectedCalendarEmployeeId(employees[0].id || employees[0].staff_id);
                    }
                  }}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                    viewMode === 'Calendar' 
                      ? 'bg-blue-600 text-white shadow-sm' 
                      : 'bg-slate-150 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  Calendar Override
                </button>
                <button 
                  onClick={() => showToast('Refreshing live biometric integration node ... done', 'success')}
                  className="px-3 py-1.5 bg-slate-50 hover:bg-slate-100 text-slate-600 font-semibold text-xs border border-slate-200 rounded-lg flex items-center gap-1 shadow-xs"
                >
                  <RefreshCcw className="w-3.5 h-3.5" />
                  Re-Sync Scanners
                </button>
              </div>
            </div>

            {viewMode === 'Table' ? (
              <div className="border border-slate-100 rounded-xl overflow-hidden shadow-sm">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-slate-100 bg-slate-50 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                      <th className="px-6 py-3.5">Staff Name & ID</th>
                      <th className="px-6 py-3.5">Roster Date</th>
                      <th className="px-6 py-3.5">Punch In</th>
                      <th className="px-6 py-3.5">Punch Out</th>
                      <th className="px-6 py-3.5">Logged Hours</th>
                      <th className="px-6 py-3.5">Overtime Duration</th>
                      <th className="px-6 py-3.5 text-right">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {attendanceRecords.map((att) => (
                      <tr key={att._id || att.id} className="hover:bg-slate-50/50">
                        <td className="px-6 py-3">
                          <div className="flex items-center gap-2">
                            <img src={att.employeePhoto || ''} alt={att.employeeName} className="w-7 h-7 rounded-full object-cover border" />
                            <div>
                              <span className="font-semibold text-slate-800 block">{att.employeeName}</span>
                              <span className="text-[10px] text-slate-400 font-mono font-medium">{att.employeeId}</span>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-3 text-slate-600 font-medium">{att.date}</td>
                        <td className="px-6 py-3 font-mono text-slate-600">{att.clockIn || att.punchIn || '—'}</td>
                        <td className="px-6 py-3 font-mono text-slate-600">{att.clockOut || att.punchOut || '—'}</td>
                        <td className="px-6 py-3 font-mono text-slate-700 font-medium">{(att.workHours !== undefined ? att.workHours : att.workingHours) > 0 ? `${(att.workHours !== undefined ? att.workHours : att.workingHours).toFixed(1)} Hrs` : 'Active / Pending'}</td>
                        <td className="px-6 py-3 font-mono text-emerald-600">{att.overtimeHours > 0 ? `+${att.overtimeHours.toFixed(1)} Hrs` : '0.0'}</td>
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
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Employee Selection dropdown & Month Selection */}
                <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4 bg-slate-50 p-4 rounded-xl border border-slate-100">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-slate-600">Select Employee:</span>
                    <select
                      value={selectedCalendarEmployeeId}
                      onChange={(e) => setSelectedCalendarEmployeeId(e.target.value)}
                      className="text-xs p-2 border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 font-semibold"
                    >
                      <option value="">-- Choose Employee --</option>
                      {employees.map(e => (
                        <option key={e.id || e.staff_id} value={e.id || e.staff_id}>
                          {e.name} ({e.staff_id})
                        </option>
                      ))}
                    </select>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <button 
                      type="button"
                      onClick={() => {
                        const prev = new Date(calendarDate.getFullYear(), calendarDate.getMonth() - 1, 1);
                        setCalendarDate(prev);
                      }}
                      className="p-1.5 bg-white border border-slate-200 rounded hover:bg-slate-50 text-slate-600 text-xs font-bold font-mono"
                    >
                      &lt;
                    </button>
                    <span className="text-xs font-bold text-slate-800 uppercase min-w-[120px] text-center">
                      {calendarDate.toLocaleString('default', { month: 'long', year: 'numeric' })}
                    </span>
                    <button 
                      type="button"
                      onClick={() => {
                        const next = new Date(calendarDate.getFullYear(), calendarDate.getMonth() + 1, 1);
                        setCalendarDate(next);
                      }}
                      className="p-1.5 bg-white border border-slate-200 rounded hover:bg-slate-50 text-slate-600 text-xs font-bold font-mono"
                    >
                      &gt;
                    </button>
                  </div>
                </div>

                {/* Calendar Grid */}
                <div className="border border-slate-100 rounded-xl overflow-hidden shadow-sm">
                  {/* Grid Headers */}
                  <div className="grid grid-cols-7 bg-slate-50 border-b border-slate-100 text-[10px] font-bold text-slate-400 uppercase text-center py-2">
                    <div>Sun</div>
                    <div>Mon</div>
                    <div>Tue</div>
                    <div>Wed</div>
                    <div>Thu</div>
                    <div>Fri</div>
                    <div>Sat</div>
                  </div>
                  {/* Grid Days */}
                  <div className="grid grid-cols-7 divide-x divide-y divide-slate-100 bg-white">
                    {(() => {
                      const emp = employees.find(e => e.id === selectedCalendarEmployeeId || e.staff_id === selectedCalendarEmployeeId);
                      return getDaysInMonth(calendarDate).map((day, idx) => {
                        if (!day) return <div key={`empty-${idx}`} className="h-24 bg-slate-50/40" />;
                        
                        // Match record
                        const record = attendanceRecords.find(
                          r => (r.employeeId === selectedCalendarEmployeeId || r.employeeId === emp?.id || r.employeeId === emp?.staff_id) && r.date === day.dateStr
                        );
                        
                        // Check for approved leave
                        const leave = leaveRequests.find(req => 
                          (req.employeeId === selectedCalendarEmployeeId || req.employeeId === emp?.staff_id || req.employeeId === emp?.id) &&
                          req.status === 'Approved' &&
                          day.dateStr >= (req.fromDate || req.startDate) &&
                          day.dateStr <= (req.toDate || req.endDate)
                        );
                        
                        // Check for weekly off
                        const dateObj = new Date(day.dateStr + 'T00:00:00');
                        const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
                        const dayName = dayNames[dateObj.getDay()];
                        const isWeeklyOff = emp && (
                          Array.isArray(emp.weeklyOff)
                            ? emp.weeklyOff.includes(dayName)
                            : typeof emp.weeklyOff === 'string'
                              ? emp.weeklyOff.split(',').map(d => d.trim()).includes(dayName)
                              : dayName === (emp.weeklyOff || 'Sunday')
                        );
                        
                        // Check if date is past
                        const cellDate = new Date(day.dateStr + 'T00:00:00');
                        const todayDate = new Date();
                        todayDate.setHours(0,0,0,0);
                        const isPast = cellDate < todayDate;

                        let statusText = '';
                        let statusStyle = '';
                        let timeRangeStr = '';
                        
                        if (record) {
                          statusText = record.status;
                          timeRangeStr = (record.clockIn || record.punchIn) 
                            ? `${record.clockIn || record.punchIn} - ${record.clockOut || record.punchOut || '...'}`
                            : '';
                          
                          if (record.status === 'Present') {
                            statusStyle = 'bg-emerald-50 text-emerald-700 border border-emerald-100';
                          } else if (record.status === 'Late') {
                            statusStyle = 'bg-orange-50 text-orange-700 border border-orange-100';
                          } else if (record.status === 'Half Day') {
                            statusStyle = 'bg-amber-50 text-amber-700 border border-amber-100';
                          } else if (record.status === 'Holiday') {
                            statusStyle = 'bg-blue-50 text-blue-700 border border-blue-100';
                          } else if (record.status === 'Work From Home') {
                            statusStyle = 'bg-purple-50 text-purple-700 border border-purple-100';
                          } else if (record.status === 'Leave') {
                            statusStyle = 'bg-rose-50 text-rose-700 border border-rose-100';
                          } else {
                            statusStyle = 'bg-red-50 text-red-700 border border-red-100';
                          }
                        } else if (leave) {
                          statusText = `Leave (${leave.leaveType})`;
                          statusStyle = 'bg-rose-50 text-rose-700 border border-rose-100';
                        } else if (isWeeklyOff) {
                          statusText = 'Weekly Off';
                          statusStyle = 'bg-slate-100 text-slate-500 border border-slate-200';
                        } else if (isPast) {
                          statusText = 'Absent';
                          statusStyle = 'bg-red-50 text-red-700 border border-red-100';
                        } else {
                          statusText = 'Click to Log';
                          statusStyle = 'text-slate-300 italic group-hover:text-slate-400';
                        }
                        
                        return (
                          <div 
                            key={day.dateStr} 
                            onClick={() => handleOpenOverride(day.dateStr)}
                            className="h-24 p-2 flex flex-col justify-between hover:bg-slate-50 cursor-pointer transition-colors relative group"
                          >
                            <span className="text-[10px] font-bold text-slate-400">{day.dayNum}</span>
                            
                            <div className="flex-1 flex flex-col justify-end gap-1">
                              <span className={`px-1.5 py-0.5 rounded text-[8px] font-bold text-center block w-full truncate ${statusStyle}`}>
                                {statusText}
                              </span>
                              {timeRangeStr ? (
                                <span className="text-[8px] text-slate-400 font-mono text-center block">
                                  {timeRangeStr}
                                </span>
                              ) : (
                                (statusText === 'Present' || statusText === 'Late' || statusText === 'Half Day' || statusText === 'Work From Home') && (
                                  <span className="text-[8px] text-slate-300 font-mono text-center block">—</span>
                                )
                              )}
                            </div>
                          </div>
                        );
                      });
                    })()}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* RENDER ACTIVE SUBTAB 2: Leave requests and applications */}
      {activeSubTab === 'Leaves' && (
        <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm space-y-5">
          <div>
            <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider">Operational Leave Requests Registry</h3>
            <p className="text-[11px] text-slate-400 mt-0.5">Authorizations requested by doctors, nurses, and technicians.</p>
          </div>

          <div className="space-y-4">
            {(() => {
              const sortedLeaves = [...leaveRequests].sort((a, b) => {
                if (a.status === 'Pending' && b.status !== 'Pending') return -1;
                if (a.status !== 'Pending' && b.status === 'Pending') return 1;
                return new Date(b.createdAt || b.appliedDate || 0) - new Date(a.createdAt || a.appliedDate || 0);
              });

              if (sortedLeaves.length === 0) {
                return (
                  <div className="text-center text-slate-400 py-10">
                    No active leave applications found in history.
                  </div>
                );
              }

              return sortedLeaves.map((req) => (
                <div key={req._id || req.id} className="p-4 bg-slate-50 border border-slate-155 rounded-xl hover:border-blue-150 transition-colors">
                  <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                    <div className="flex gap-3">
                      <img 
                        src={req.employeePhoto || ''} 
                        alt={req.employeeName} 
                        className="w-10 h-10 rounded-full object-cover border"
                        referrerPolicy="no-referrer"
                      />
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <h4 className="font-bold text-xs text-slate-800">{req.employeeName} ({req.employeeId})</h4>
                          <span className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded text-[9px] font-bold">
                            {req.department}
                          </span>
                        </div>
                        
                        <p className="text-xs text-slate-500 mt-1">
                          Application: <span className="font-semibold text-slate-700">{req.leaveType}</span> &bull; Duration: <span className="font-semibold text-slate-700">{req.days || req.totalDays || 0} Day{(req.days || req.totalDays) > 1 ? 's' : ''}</span> ({req.fromDate || req.startDate} to {req.toDate || req.endDate})
                        </p>

                        <p className="text-[11px] text-slate-600 italic mt-2 bg-white p-2 rounded border border-slate-100">
                          &ldquo;{req.reason}&rdquo;
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-col items-end gap-3 self-end md:self-center">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        req.status === 'Approved' ? 'bg-emerald-50 text-emerald-700' :
                        req.status === 'Pending' ? 'bg-amber-50 text-amber-700' :
                        'bg-red-50 text-red-700'
                      }`}>
                        {req.status}
                      </span>

                      {req.status === 'Pending' && (
                        <div className="flex gap-1.5">
                          <button 
                            onClick={() => onRejectLeave(req._id || req.id, 'Rejected by HR')}
                            className="px-2.5 py-1 text-[11px] border border-red-200 text-red-600 hover:bg-red-50 rounded font-semibold cursor-pointer"
                          >
                            Reject
                          </button>
                          <button 
                            onClick={() => onApproveLeave(req._id || req.id, 'Approved by HR Manager')}
                            className="px-2.5 py-1 text-[11px] bg-blue-600 text-white hover:bg-blue-700 rounded font-semibold shadow-xs cursor-pointer"
                          >
                            Approve
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ));
            })()}
          </div>
        </div>
      )}

      {/* RENDER ACTIVE SUBTAB 3: Policy Configuration */}
      {activeSubTab === 'Policies' && (
        <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm space-y-6">
          <div>
            <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider">Leave Policy Configuration Board</h3>
            <p className="text-[11px] text-slate-400 mt-0.5">Control the standard annual leave allotments for clinical staff types.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {policies.length > 0 ? (
              policies.map((policy, idx) => (
                <div key={policy.type} className="p-4 bg-slate-50 rounded-xl border border-slate-100 flex flex-col justify-between">
                  <div>
                    <div className="flex justify-between items-start">
                      <div className="flex items-center gap-2">
                        <h4 className={`font-bold text-xs ${policy.enabled !== false ? 'text-slate-800' : 'text-slate-400 line-through font-normal'}`}>{policy.type}</h4>
                        {policy.enabled === false && (
                          <span className="px-1.5 py-0.5 bg-slate-200 text-slate-500 rounded text-[9px] font-bold uppercase tracking-wider">Disabled</span>
                        )}
                      </div>
                      <div className="flex items-center gap-3">
                        <span className={`font-bold text-xs font-mono ${policy.enabled !== false ? 'text-blue-600' : 'text-slate-400'}`}>
                          {policy.days} Days / year
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            const updated = [...policies];
                            updated[idx] = { ...updated[idx], enabled: updated[idx].enabled !== false ? false : true };
                            setPolicies(updated);
                            showToast(`${policy.type} leave policy ${updated[idx].enabled ? 'enabled' : 'disabled'} successfully!`, 'success');
                          }}
                          className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                            policy.enabled !== false ? 'bg-blue-600' : 'bg-slate-300'
                          }`}
                        >
                          <span
                            className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
                              policy.enabled !== false ? 'translate-x-4' : 'translate-x-0'
                            }`}
                          />
                        </button>
                      </div>
                    </div>
                    <p className="text-[11px] text-slate-500 mt-2 leading-relaxed">{policy.description}</p>
                    
                    <div className="flex items-center gap-4 text-[10px] text-slate-400 mt-3 font-medium">
                      <span>Carry Forward: {policy.carryForward ? 'Enabled' : 'Disabled'}</span>
                      <span>Class: Fully Paid</span>
                    </div>
                  </div>

                  <div className="border-t border-slate-200 mt-4 pt-3 text-right">
                    {editingPolicyIdx === idx ? (
                      <div className="flex justify-end gap-1.5 items-center">
                        <input 
                          type="number" 
                          value={editingDays} 
                          onChange={(e) => setEditingDays(parseInt(e.target.value) || 0)}
                          className="w-16 p-1 border rounded text-xs text-center font-semibold bg-white"
                        />
                        <button 
                          onClick={() => handleSavePolicy(idx)}
                          className="p-1 bg-emerald-600 text-white rounded hover:bg-emerald-700"
                          title="Save Allotment"
                        >
                          <Check className="w-3.5 h-3.5" />
                        </button>
                        <button 
                          onClick={() => setEditingPolicyIdx(null)}
                          className="p-1 bg-slate-200 text-slate-600 rounded hover:bg-slate-300"
                          title="Cancel"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => { setEditingPolicyIdx(idx); setEditingDays(policy.days); }}
                        className="px-4 py-2 text-xs font-bold bg-white border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 shadow-sm transition-all inline-flex items-center gap-1.5"
                      >
                        <Settings2 className="w-3.5 h-3.5" />
                        Configure Allotment
                      </button>
                    )}
                  </div>
                </div>
              ))
            ) : (
              <div className="col-span-2 text-center text-slate-500 py-8">
                No leave policies configured yet. Policies should be loaded from the backend.
              </div>
            )}
          </div>
        </div>
      )}

      {/* RENDER ACTIVE SUBTAB 4: Holiday Calendar */}
      {activeSubTab === 'Holidays' && (
        <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm space-y-4">
          <div>
            <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider">Hospital Holiday Schedule 2026</h3>
            <p className="text-[11px] text-slate-400 mt-0.5">Mandatory clinical closure or restricted duty roster dates.</p>
          </div>

          <div className="border border-slate-100 rounded-xl overflow-hidden shadow-sm">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                  <th className="px-6 py-3">Holiday Name</th>
                  <th className="px-6 py-3">Scheduled Date</th>
                  <th className="px-6 py-3 text-right">Holiday Group</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {holidays.length > 0 ? (
                  holidays.map((h) => (
                    <tr key={h.name} className="hover:bg-slate-50/50">
                      <td className="px-6 py-3 font-semibold text-slate-800">{h.name}</td>
                      <td className="px-6 py-3 text-slate-600 font-mono font-medium">{h.date}</td>
                      <td className="px-6 py-3 text-right">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          h.type === 'National' ? 'bg-blue-50 text-blue-700' : 'bg-purple-50 text-purple-700'
                        }`}>
                          {h.type}
                        </span>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan="3" className="px-6 py-3 text-center text-slate-500">
                      No holidays configured yet. Holidays should be loaded from the backend.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Attendance Roster Admin Override Modal */}
      {overrideModalOpen && (
        <div 
          className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 hr-modal-overlay z-50 animate-fadeIn"
          onClick={() => setOverrideModalOpen(false)}
        >
          <div 
            className="bg-white rounded-2xl shadow-xl border border-slate-100 max-w-md w-full p-6 relative hr-admin-modal flex flex-col"
            style={{ animation: 'adminFadeIn 0.2s ease-out' }}
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4 pb-2 border-b border-slate-100">
              <div>
                <span className="text-sm font-bold text-slate-800 uppercase block">Roster Shift Override</span>
                <span className="text-[10px] text-slate-400 font-mono mt-0.5">Date: {overrideDate}</span>
              </div>
              <button 
                onClick={() => setOverrideModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 font-bold text-lg"
              >
                &times;
              </button>
            </div>
            
            <div className="space-y-4 text-xs">
              <div>
                <label className="block text-slate-500 text-[10px] uppercase font-bold tracking-wider mb-1">Roster Status</label>
                <select
                  value={overrideStatus}
                  onChange={(e) => setOverrideStatus(e.target.value)}
                  className="w-full text-xs p-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
                >
                  <option value="Present">Present</option>
                  <option value="Absent">Absent</option>
                  <option value="Leave">Leave</option>
                  <option value="Half Day">Half Day</option>
                  <option value="Late">Late</option>
                  <option value="Holiday">Holiday</option>
                  <option value="Work From Home">Work From Home</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-slate-500 text-[10px] uppercase font-bold tracking-wider mb-1">Clock In Time</label>
                  <input 
                    type="time" 
                    value={overrideClockIn}
                    onChange={(e) => setOverrideClockIn(e.target.value)}
                    disabled={overrideStatus === 'Absent' || overrideStatus === 'Holiday' || overrideStatus === 'Leave'}
                    className="w-full text-xs p-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white font-mono"
                  />
                </div>
                <div>
                  <label className="block text-slate-500 text-[10px] uppercase font-bold tracking-wider mb-1">Clock Out Time</label>
                  <input 
                    type="time" 
                    value={overrideClockOut}
                    onChange={(e) => setOverrideClockOut(e.target.value)}
                    disabled={overrideStatus === 'Absent' || overrideStatus === 'Holiday' || overrideStatus === 'Leave'}
                    className="w-full text-xs p-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white font-mono"
                  />
                </div>
              </div>

              {overrideClockIn && overrideClockOut && overrideStatus !== 'Absent' && overrideStatus !== 'Holiday' && overrideStatus !== 'Leave' && (
                <div className="bg-slate-50 p-3 rounded-lg border border-slate-100 font-mono text-[10px] text-slate-600 flex justify-between">
                  <span>ESTIMATED WORKING HOURS:</span>
                  <span className="font-bold text-slate-800">{calculateWorkHours(overrideClockIn, overrideClockOut)} Hrs</span>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 mt-6 pt-4 border-t border-slate-100">
              <button 
                type="button" 
                onClick={() => setOverrideModalOpen(false)}
                className="px-4 py-2 border border-slate-200 rounded-lg text-xs font-semibold text-slate-500 hover:bg-slate-50 transition-colors"
              >
                Cancel
              </button>
              <button 
                type="button"
                onClick={handleSaveOverride}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold shadow-sm transition-colors"
              >
                Apply Override
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}