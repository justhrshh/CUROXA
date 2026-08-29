import React, { useState } from 'react';
import { 
  Users, UserCheck, CalendarDays, DollarSign, Clock, 
  ArrowRight, ShieldAlert, CheckCircle2, AlertCircle, BadgeCheck, Plus, Star,
  CalendarCheck2, ShieldCheck, Sparkles
} from 'lucide-react';

export default function DashboardView({
  isLoading = false,
  employees = [],
  leaveRequests = [],
  attendanceRecords = [],
  notifications = [],
  onApproveLeave,
  onRejectLeave,
  onApproveAttendance,
  onRejectAttendance,
  onSelectEmployee,
  onNavigate,
  jobs = [],
  candidates = []
}) {
  const [approvalComments, setApprovalComments] = useState({});
  const [selectedActionId, setSelectedActionId] = useState(null);

  // Dynamic today's date or fall back to the latest date in attendance records
  const getTodayDateStr = () => {
    if (attendanceRecords.length === 0) return new Date().toISOString().split('T')[0];
    const dates = attendanceRecords.map(r => r.date).sort();
    return dates[dates.length - 1] || new Date().toISOString().split('T')[0];
  };
  const todayDateStr = getTodayDateStr();

  // Computed Stats - 100% Dynamic
  const totalEmployees = employees.length;
  const presentToday = attendanceRecords.filter(r => r.date === todayDateStr && (r.status === 'Present' || r.status === 'Late')).length;
  const onLeaveToday = leaveRequests.filter(r => r.status === 'Approved' && (r.fromDate || r.startDate) <= todayDateStr && (r.toDate || r.endDate) >= todayDateStr).length;

  // Calculate dynamic joining count this week
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const joiningThisWeekCount = employees.filter(e => e.joiningDate && new Date(e.joiningDate) >= sevenDaysAgo).length;

  // Calculate dynamic approved leave for tomorrow
  const tomorrowObj = new Date();
  tomorrowObj.setDate(tomorrowObj.getDate() + 1);
  const tomorrowStr = tomorrowObj.toISOString().split('T')[0];
  const approvedTomorrowCount = leaveRequests.filter(r => r.status === 'Approved' && (r.fromDate || r.startDate) <= tomorrowStr && (r.toDate || r.endDate) >= tomorrowStr).length;

  // Dynamic Payroll Due Date (End of Current Month)
  const now = new Date();
  const lastDayOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const payrollDueDateStr = lastDayOfMonth.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

  const pendingApprovalsCount = leaveRequests.filter(r => r.status === 'Pending').length + 
                                 attendanceRecords.filter(r => r.correctionRequested && r.correctionStatus === 'Pending').length;

  // Department Distribution data with structured clinical colors
  const deptCounts = {};
  employees.forEach(emp => {
    const dept = emp.department || emp.role || emp.specialty || emp.specialization || 'Clinical';
    deptCounts[dept] = (deptCounts[dept] || 0) + 1;
  });

  const clinicalPalette = [
    '#2563EB', // Blue
    '#0D9488', // Teal / Cyan
    '#10B981', // Emerald Green
    '#F59E0B', // Amber / Orange
    '#8B5CF6', // Purple
    '#EC4899', // Pink
    '#64748B', // Slate
    '#0284C7'  // Sky Blue
  ];

  const departmentData = Object.entries(deptCounts).map(([name, count], idx) => ({
    name,
    count,
    percentage: Math.round((count / (totalEmployees || 1)) * 100),
    color: clinicalPalette[idx % clinicalPalette.length]
  })).sort((a, b) => b.count - a.count);

  return (
    <div className="space-y-6 relative max-w-full overflow-x-hidden" id="dashboard-view-root">
      
      {/* Background Soft Atmospheric Ambient Glow Orbs - Light and near-white */}
      <div className="absolute top-0 left-0 w-80 h-80 rounded-full bg-blue-300/8 blur-3xl pointer-events-none -z-10" />
      <div className="absolute top-1/4 right-0 w-80 h-80 rounded-full bg-purple-300/6 blur-3xl pointer-events-none -z-10" />
      <div className="absolute bottom-10 right-1/4 w-72 h-72 rounded-full bg-pink-300/6 blur-3xl pointer-events-none -z-10" />
      <div className="absolute bottom-10 left-10 w-72 h-72 rounded-full bg-emerald-300/6 blur-3xl pointer-events-none -z-10" />

      {/* 1. Hospital Command Center Hero Header Panel */}
      <div 
        className="relative p-6 rounded-3xl border border-blue-200/80 shadow-[0_15px_40px_rgba(37,99,235,0.08),0_2px_8px_rgba(0,0,0,0.02)] flex flex-col md:flex-row justify-between items-start md:items-center gap-6 overflow-hidden backdrop-blur-sm"
        style={{
          background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.98) 0%, rgba(239, 246, 255, 0.95) 35%, rgba(243, 232, 255, 0.9) 70%, rgba(254, 242, 242, 0.85) 100%)'
        }}
      >
        {/* Soft flowing purple-blue-pink abstract wave in background */}
        <div className="absolute right-0 top-0 bottom-0 w-3/5 pointer-events-none overflow-hidden opacity-75">
          <svg className="w-full h-full" viewBox="0 0 600 160" preserveAspectRatio="none">
            <defs>
              <linearGradient id="heroWaveGrad" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0"/>
                <stop offset="35%" stopColor="#DBEAFE" stopOpacity="0.5"/>
                <stop offset="70%" stopColor="#EDE9FE" stopOpacity="0.75"/>
                <stop offset="100%" stopColor="#FCE7F3" stopOpacity="0.9"/>
              </linearGradient>
            </defs>
            <path d="M 0 160 C 140 140, 220 40, 360 80 C 460 110, 520 20, 600 60 L 600 160 Z" fill="url(#heroWaveGrad)" />
          </svg>
        </div>

        {/* Scattered subtle glowing particles */}
        <div className="absolute top-4 right-1/3 w-2 h-2 rounded-full bg-blue-500/50 pointer-events-none animate-pulse" />
        <div className="absolute bottom-6 right-1/4 w-1.5 h-1.5 rounded-full bg-indigo-400/40 pointer-events-none" />
        <div className="absolute top-10 right-28 w-2.5 h-2.5 rounded-full bg-purple-400/35 pointer-events-none" />
        <div className="absolute top-3 right-1/2 w-1.5 h-1.5 rounded-full bg-pink-400/40 pointer-events-none" />

        {/* Left Side: 3D Isometric Hospital Building Illustration & Titles */}
        <div className="flex items-center gap-5 relative z-10">
          
          {/* 3D Isometric Hospital Building Graphic */}
          <div className="w-28 h-20 shrink-0 flex items-center justify-center drop-shadow-[0_8px_16px_rgba(37,99,235,0.18)]">
            <svg className="w-full h-full overflow-visible" viewBox="0 0 160 120">
              <defs>
                <linearGradient id="platGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#CBD5E1" />
                  <stop offset="100%" stopColor="#94A3B8" />
                </linearGradient>
                <linearGradient id="platTop" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" stopColor="#F1F5F9" />
                  <stop offset="100%" stopColor="#E2E8F0" />
                </linearGradient>
                <linearGradient id="wallLeft" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#38BDF8" />
                  <stop offset="100%" stopColor="#0284C7" />
                </linearGradient>
                <linearGradient id="wallRight" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#60A5FA" />
                  <stop offset="100%" stopColor="#1D4ED8" />
                </linearGradient>
                <linearGradient id="wallTop" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" stopColor="#BAE6FD" />
                  <stop offset="100%" stopColor="#93C5FD" />
                </linearGradient>
              </defs>

              {/* Base Isometric Ground Platform */}
              <path d="M 80 114 L 142 82 L 80 50 L 18 82 Z" fill="url(#platTop)" stroke="#94A3B8" strokeWidth="1" />
              <path d="M 18 82 L 80 114 L 80 120 L 18 88 Z" fill="url(#platGrad)" />
              <path d="M 80 114 L 142 82 L 142 88 L 80 120 Z" fill="#64748B" />

              {/* Isometric Trees / Bushes */}
              <ellipse cx="32" cy="74" rx="7" ry="10" fill="#10B981" />
              <ellipse cx="32" cy="73" rx="5" ry="8" fill="#34D399" />
              <ellipse cx="128" cy="74" rx="7" ry="10" fill="#10B981" />
              <ellipse cx="128" cy="73" rx="5" ry="8" fill="#34D399" />

              {/* Main Hospital Building Left Facade */}
              <path d="M 45 74 L 80 92 L 80 34 L 45 16 Z" fill="url(#wallLeft)" />
              {/* Main Hospital Building Right Facade */}
              <path d="M 80 92 L 115 74 L 115 16 L 80 34 Z" fill="url(#wallRight)" />
              {/* Roof Top */}
              <path d="M 80 34 L 115 16 L 80 -2 L 45 16 Z" fill="url(#wallTop)" />

              {/* Top Medical Cross Roof Sign Block */}
              <path d="M 68 12 L 80 18 L 80 0 L 68 -6 Z" fill="#1E40AF" />
              <path d="M 80 18 L 92 12 L 92 -6 L 80 0 Z" fill="#2563EB" />
              <path d="M 80 0 L 92 -6 L 80 -12 L 68 -6 Z" fill="#60A5FA" />
              {/* White Cross on the sign */}
              <path d="M 79 3 L 81 3 L 81 15 L 79 15 Z" fill="#FFFFFF" />
              <path d="M 75 7 L 85 7 L 85 9 L 75 9 Z" fill="#FFFFFF" />

              {/* Windows Grid on Left Facade */}
              <path d="M 50 32 L 57 36 L 57 43 L 50 39 Z" fill="#E0F2FE" />
              <path d="M 61 38 L 68 42 L 68 49 L 61 45 Z" fill="#E0F2FE" />
              <path d="M 72 44 L 78 47 L 78 54 L 72 51 Z" fill="#E0F2FE" />
              
              <path d="M 50 46 L 57 50 L 57 57 L 50 53 Z" fill="#E0F2FE" />
              <path d="M 61 52 L 68 56 L 68 63 L 61 59 Z" fill="#E0F2FE" />
              <path d="M 72 58 L 78 61 L 78 68 L 72 65 Z" fill="#E0F2FE" />

              {/* Windows Grid on Right Facade */}
              <path d="M 82 47 L 89 43 L 89 36 L 82 40 Z" fill="#DBEAFE" />
              <path d="M 93 41 L 100 37 L 100 30 L 93 34 Z" fill="#DBEAFE" />
              <path d="M 104 35 L 110 32 L 110 25 L 104 28 Z" fill="#DBEAFE" />

              <path d="M 82 61 L 89 57 L 89 50 L 82 54 Z" fill="#DBEAFE" />
              <path d="M 93 55 L 100 51 L 100 44 L 93 48 Z" fill="#DBEAFE" />
              <path d="M 104 49 L 110 46 L 110 39 L 104 42 Z" fill="#DBEAFE" />

              {/* Glass Entrance Door */}
              <path d="M 76 89 L 84 85 L 84 75 L 76 79 Z" fill="#FFFFFF" stroke="#0284C7" strokeWidth="1" />
              <path d="M 80 87 L 80 77" stroke="#0284C7" strokeWidth="1" />
            </svg>
          </div>

          <div>
            <h1 className="text-2xl font-black text-slate-900 tracking-tight">Hospital Command Center</h1>
            <p className="text-slate-500 text-xs mt-1 font-medium">Workforce status, staffing activity, and HR actions at a glance.</p>
          </div>
        </div>

        {/* Right Side: CTA Button */}
        <div className="relative z-10">
          <button 
            onClick={() => onNavigate('Directory', true)}
            className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-2 shadow-lg shadow-blue-500/35 active:scale-98"
          >
            <Plus className="w-4 h-4 stroke-[2.5]" />
            Add New Employee
          </button>
        </div>
      </div>

      {/* 2. Top 5 KPI Cards System With Visibly Rich Gradients & Sparklines */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        
        {/* 1. TOTAL STAFF (Electric Blue Gradient with Bottom-Right Radial Glow) */}
        <div 
          className="p-5 rounded-2xl border border-blue-200/90 shadow-[0_12px_28px_rgba(37,99,235,0.08)] hover:shadow-[0_16px_36px_rgba(37,99,235,0.16)] transition-all flex flex-col justify-between relative overflow-hidden group"
          style={{
            background: 'radial-gradient(circle at 100% 100%, rgba(59, 130, 246, 0.25) 0%, transparent 65%), linear-gradient(135deg, #FFFFFF 0%, #EFF6FF 50%, #DBEAFE 100%)'
          }}
        >
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-blue-700 to-blue-500 text-white flex items-center justify-center shrink-0 shadow-md shadow-blue-500/25">
              <Users className="w-4 h-4" />
            </div>
            <span className="text-[10px] font-extrabold text-blue-900 uppercase tracking-wider">Total Staff</span>
          </div>
          
          <div className="mt-4 flex items-end justify-between">
            {isLoading ? (
              <div className="space-y-2">
                <div className="h-7 w-14 bg-slate-200 animate-pulse rounded-md" />
                <div className="h-3 w-20 bg-slate-100 animate-pulse rounded" />
              </div>
            ) : (
              <div>
                <div className="text-3xl font-black text-slate-900 tracking-tight leading-none">{totalEmployees}</div>
                <div className="text-xs text-blue-700 font-bold mt-2 truncate">
                  {joiningThisWeekCount > 0 ? `+${joiningThisWeekCount} joining this week` : (totalEmployees > 0 ? `${totalEmployees} active roster` : 'No staff registered')}
                </div>
              </div>
            )}

            {/* Blue Mini Sparkline */}
            <div className="w-16 h-8 shrink-0 relative">
              <svg className="w-full h-full overflow-visible" viewBox="0 0 64 32">
                <defs>
                  <linearGradient id="kpiBlueGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#2563EB" stopOpacity="0.45"/>
                    <stop offset="100%" stopColor="#2563EB" stopOpacity="0.05"/>
                  </linearGradient>
                </defs>
                <path d="M 0 24 Q 16 26, 24 16 T 40 18 T 52 8 T 64 12 L 64 32 L 0 32 Z" fill="url(#kpiBlueGrad)" />
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

        {/* 2. PRESENT TODAY (Emerald Gradient with Top-Right Radial Glow) */}
        <div 
          className="p-5 rounded-2xl border border-emerald-200/90 shadow-[0_12px_28px_rgba(16,185,129,0.08)] hover:shadow-[0_16px_36px_rgba(16,185,129,0.16)] transition-all flex flex-col justify-between relative overflow-hidden group"
          style={{
            background: 'radial-gradient(circle at 100% 0%, rgba(16, 185, 129, 0.25) 0%, transparent 65%), linear-gradient(135deg, #FFFFFF 0%, #ECFDF5 50%, #D1FAE5 100%)'
          }}
        >
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-emerald-600 to-teal-500 text-white flex items-center justify-center shrink-0 shadow-md shadow-emerald-500/25">
              <UserCheck className="w-4 h-4" />
            </div>
            <span className="text-[10px] font-extrabold text-emerald-900 uppercase tracking-wider">Present Today</span>
          </div>

          <div className="mt-4 flex items-end justify-between">
            {isLoading ? (
              <div className="space-y-2">
                <div className="h-7 w-12 bg-slate-200 animate-pulse rounded-md" />
                <div className="h-3 w-16 bg-slate-100 animate-pulse rounded" />
              </div>
            ) : (
              <div>
                <div className="text-3xl font-black text-slate-900 tracking-tight leading-none">{presentToday}</div>
                <div className="text-xs text-emerald-700 font-bold mt-2 truncate">
                  {totalEmployees > 0 ? `${Math.round((presentToday / totalEmployees) * 100)}% active rate` : '0% active rate'}
                </div>
              </div>
            )}

            {/* Green Mini Sparkline */}
            <div className="w-16 h-8 shrink-0 relative">
              <svg className="w-full h-full overflow-visible" viewBox="0 0 64 32">
                <defs>
                  <linearGradient id="kpiGreenGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#10B981" stopOpacity="0.45"/>
                    <stop offset="100%" stopColor="#10B981" stopOpacity="0.05"/>
                  </linearGradient>
                </defs>
                <path d="M 0 26 Q 14 24, 22 22 T 36 10 T 48 18 T 58 6 T 64 10 L 64 32 L 0 32 Z" fill="url(#kpiGreenGrad)" />
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

        {/* 3. ON LEAVE (Amber / Orange Gradient with Bottom-Left Radial Glow) */}
        <div 
          className="p-5 rounded-2xl border border-amber-200/90 shadow-[0_12px_28px_rgba(245,158,11,0.08)] hover:shadow-[0_16px_36px_rgba(245,158,11,0.16)] transition-all flex flex-col justify-between relative overflow-hidden group"
          style={{
            background: 'radial-gradient(circle at 0% 100%, rgba(245, 158, 11, 0.25) 0%, transparent 65%), linear-gradient(135deg, #FFFFFF 0%, #FFFBEB 50%, #FEF3C7 100%)'
          }}
        >
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-amber-600 to-amber-400 text-white flex items-center justify-center shrink-0 shadow-md shadow-amber-500/25">
              <CalendarDays className="w-4 h-4" />
            </div>
            <span className="text-[10px] font-extrabold text-amber-900 uppercase tracking-wider">On Leave</span>
          </div>

          <div className="mt-4 flex items-end justify-between">
            {isLoading ? (
              <div className="space-y-2">
                <div className="h-7 w-12 bg-slate-200 animate-pulse rounded-md" />
                <div className="h-3 w-16 bg-slate-100 animate-pulse rounded" />
              </div>
            ) : (
              <div>
                <div className="text-3xl font-black text-slate-900 tracking-tight leading-none">{onLeaveToday}</div>
                <div className="text-xs text-amber-700 font-bold mt-2 truncate">
                  {approvedTomorrowCount > 0 ? `${approvedTomorrowCount} tomorrow` : (onLeaveToday > 0 ? `${onLeaveToday} on leave` : '0 on leave today')}
                </div>
              </div>
            )}

            {/* Orange Mini Sparkline */}
            <div className="w-16 h-8 shrink-0 relative">
              <svg className="w-full h-full overflow-visible" viewBox="0 0 64 32">
                <defs>
                  <linearGradient id="kpiAmberGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#F59E0B" stopOpacity="0.45"/>
                    <stop offset="100%" stopColor="#F59E0B" stopOpacity="0.05"/>
                  </linearGradient>
                </defs>
                <path d="M 0 24 Q 18 24, 30 16 T 48 10 T 58 18 T 64 14 L 64 32 L 0 32 Z" fill="url(#kpiAmberGrad)" />
                <path d="M 0 24 Q 18 24, 30 16 T 48 10 T 58 18 T 64 14" fill="none" stroke="#F59E0B" strokeWidth="2.4" strokeLinecap="round" />
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

        {/* 4. PAYROLL DUE (Violet / Purple Gradient with Top-Left Radial Glow) */}
        <div 
          className="p-5 rounded-2xl border border-purple-200/90 shadow-[0_12px_28px_rgba(139,92,246,0.08)] hover:shadow-[0_16px_36px_rgba(139,92,246,0.16)] transition-all flex flex-col justify-between relative overflow-hidden group"
          style={{
            background: 'radial-gradient(circle at 0% 0%, rgba(139, 92, 246, 0.25) 0%, transparent 65%), linear-gradient(135deg, #FFFFFF 0%, #F5F3FF 50%, #EDE9FE 100%)'
          }}
        >
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-purple-700 to-violet-500 text-white flex items-center justify-center shrink-0 shadow-md shadow-purple-500/25">
              <DollarSign className="w-4 h-4" />
            </div>
            <span className="text-[10px] font-extrabold text-purple-900 uppercase tracking-wider">Payroll Due</span>
          </div>

          <div className="mt-4 flex items-end justify-between">
            {isLoading ? (
              <div className="space-y-2">
                <div className="h-7 w-16 bg-slate-200 animate-pulse rounded-md" />
                <div className="h-3 w-20 bg-slate-100 animate-pulse rounded" />
              </div>
            ) : (
              <div>
                <div className="text-2xl font-black text-slate-900 tracking-tight leading-none">{payrollDueDateStr}</div>
                <div className="text-xs text-purple-700 font-bold mt-2 truncate">
                  {totalEmployees > 0 ? `Roster for ${totalEmployees} staff` : 'No staff enrolled'}
                </div>
              </div>
            )}

            {/* Purple Mini Sparkline */}
            <div className="w-16 h-8 shrink-0 relative">
              <svg className="w-full h-full overflow-visible" viewBox="0 0 64 32">
                <defs>
                  <linearGradient id="kpiPurpleGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#8B5CF6" stopOpacity="0.45"/>
                    <stop offset="100%" stopColor="#8B5CF6" stopOpacity="0.05"/>
                  </linearGradient>
                </defs>
                <path d="M 0 22 Q 18 22, 32 16 T 46 12 T 56 16 T 64 12 L 64 32 L 0 32 Z" fill="url(#kpiPurpleGrad)" />
                <path d="M 0 22 Q 18 22, 32 16 T 46 12 T 56 16 T 64 12" fill="none" stroke="#8B5CF6" strokeWidth="2.4" strokeLinecap="round" />
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

        {/* 5. PENDING ACTION (Pink / Coral Gradient with Bottom-Right Radial Glow) */}
        <div 
          className="p-5 rounded-2xl border border-rose-200/90 shadow-[0_12px_28px_rgba(244,63,94,0.08)] hover:shadow-[0_16px_36px_rgba(244,63,94,0.16)] transition-all flex flex-col justify-between relative overflow-hidden group"
          style={{
            background: 'radial-gradient(circle at 100% 100%, rgba(244, 63, 94, 0.25) 0%, transparent 65%), linear-gradient(135deg, #FFFFFF 0%, #FFF1F2 50%, #FFE4E6 100%)'
          }}
        >
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-rose-600 to-pink-500 text-white flex items-center justify-center shrink-0 shadow-md shadow-rose-500/25">
              <Clock className="w-4 h-4" />
            </div>
            <span className="text-[10px] font-extrabold text-rose-900 uppercase tracking-wider">Pending Action</span>
          </div>

          <div className="mt-4 flex items-end justify-between">
            {isLoading ? (
              <div className="space-y-2">
                <div className="h-7 w-12 bg-slate-200 animate-pulse rounded-md" />
                <div className="h-3 w-16 bg-slate-100 animate-pulse rounded" />
              </div>
            ) : (
              <div>
                <div className={`text-3xl font-black tracking-tight leading-none ${pendingApprovalsCount > 0 ? 'text-rose-600' : 'text-slate-900'}`}>{pendingApprovalsCount}</div>
                <div className="text-xs font-bold text-rose-700 mt-2 truncate">
                  {pendingApprovalsCount > 0 ? `${pendingApprovalsCount} requiring review` : 'All items reviewed'}
                </div>
              </div>
            )}

            {/* Rose/Red Mini Sparkline */}
            <div className="w-16 h-8 shrink-0 relative">
              <svg className="w-full h-full overflow-visible" viewBox="0 0 64 32">
                <defs>
                  <linearGradient id="kpiRoseGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#F43F5E" stopOpacity="0.45"/>
                    <stop offset="100%" stopColor="#F43F5E" stopOpacity="0.05"/>
                  </linearGradient>
                </defs>
                <path d="M 0 24 Q 16 24, 28 16 T 42 6 T 54 18 T 64 10 L 64 32 L 0 32 Z" fill="url(#kpiRoseGrad)" />
                <path d="M 0 24 Q 16 24, 28 16 T 42 6 T 54 18 T 64 10" fill="none" stroke="#F43F5E" strokeWidth="2.4" strokeLinecap="round" />
              </svg>
            </div>
          </div>

          {/* Half Gradient Accent Line Beneath Card */}
          <div 
            className="h-[4px] rounded-br-2xl absolute bottom-0 right-0 w-3/5 pointer-events-none"
            style={{
              background: 'linear-gradient(90deg, transparent 0%, #F43F5E 100%)'
            }}
          />
        </div>

      </div>

      {/* 3. Main Grid Layout (Pending HR Actions & Hospital Alerts) */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 w-full max-w-full min-w-0">
        
        {/* Left Column: Pending HR Actions (Mint / Cyan / Teal Theme) */}
        <div 
          className="p-6 rounded-3xl border border-emerald-100/90 shadow-[0_12px_36px_rgba(16,185,129,0.06)] flex flex-col justify-between"
          style={{
            background: 'linear-gradient(180deg, #FFFFFF 0%, #FAFCFB 100%)'
          }}
        >
          <div>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-emerald-600 to-teal-500 text-white flex items-center justify-center shrink-0 shadow-md shadow-emerald-500/20">
                  <CalendarCheck2 className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-slate-900 leading-tight">Pending HR Actions</h2>
                  <p className="text-slate-500 text-xs mt-0.5 font-medium">Approve or reject clinical leave requests and biometric attendance corrections.</p>
                </div>
              </div>
              <span className="px-3 py-1 text-[11px] font-bold rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 shrink-0">
                {isLoading ? '...' : `${pendingApprovalsCount} PENDING`}
              </span>
            </div>

            <div className="space-y-3 mt-4">
              {isLoading ? (
                <div className="space-y-3">
                  <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200/60 animate-pulse space-y-2.5">
                    <div className="flex gap-3 items-center">
                      <div className="w-10 h-10 rounded-xl bg-slate-200" />
                      <div className="space-y-1.5 flex-1">
                        <div className="h-4 w-36 bg-slate-200 rounded" />
                        <div className="h-3 w-48 bg-slate-100 rounded" />
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <>
                  {/* Leave Requests */}
                  {leaveRequests.filter(req => req.status === 'Pending').map(req => {
                    const reqId = req._id || req.id;
                    const matchedEmp = employees.find(e => e.id === req.employeeId || e.staff_id === req.employeeId);
                    const photoUrl = matchedEmp?.photoUrl || req.employeePhoto || '';

                    return (
                      <div key={reqId} className="p-4 bg-slate-50/90 rounded-2xl border border-slate-200/80 hover:border-blue-300 transition-colors shadow-sm">
                        <div className="flex justify-between items-start">
                          <div className="flex gap-3">
                            {photoUrl ? (
                              <img 
                                src={photoUrl} 
                                alt={req.employeeName} 
                                className="w-10 h-10 rounded-xl object-cover border border-slate-200 shadow-sm"
                                referrerPolicy="no-referrer"
                              />
                            ) : (
                              <div className="w-10 h-10 rounded-xl bg-blue-100 border border-blue-200 text-blue-700 font-bold flex items-center justify-center text-xs shrink-0 select-none">
                                {req.employeeName.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                              </div>
                            )}
                            <div>
                              <div className="flex items-center gap-2">
                                <h4 
                                  onClick={() => onSelectEmployee(req.employeeId)}
                                  className="font-bold text-sm text-slate-900 hover:text-blue-600 cursor-pointer"
                                >
                                  {req.employeeName}
                                </h4>
                                <span className="px-2 py-0.5 bg-blue-50 text-blue-700 text-[10px] font-bold rounded border border-blue-100">
                                  {req.department}
                                </span>
                              </div>
                              <p className="text-xs text-slate-500 mt-1">
                                Requested <span className="font-semibold text-slate-800">{req.leaveType}</span> for <span className="font-semibold text-slate-800">{req.totalDays || req.days} Days</span> ({req.startDate || req.fromDate} to {req.endDate || req.toDate})
                              </p>
                              {req.reason && (
                                <p className="text-xs text-slate-600 italic mt-2 bg-white p-2 rounded-lg border border-slate-200/70">
                                  &ldquo;{req.reason}&rdquo;
                                </p>
                              )}
                            </div>
                          </div>
                          <span className="px-2 py-0.5 bg-red-50 text-red-600 font-bold text-[10px] uppercase rounded border border-red-100">
                            Leave Request
                          </span>
                        </div>

                        {selectedActionId === reqId ? (
                          <div className="mt-3 flex flex-col gap-2 pt-3 border-t border-slate-200">
                            <input 
                              type="text" 
                              placeholder="Add HR feedback comments..."
                              value={approvalComments[reqId] || ''}
                              onChange={(e) => setApprovalComments({...approvalComments, [reqId]: e.target.value})}
                              className="text-xs p-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
                            />
                            <div className="flex justify-end gap-2 text-xs">
                              <button 
                                onClick={() => setSelectedActionId(null)}
                                className="px-3 py-1.5 text-slate-500 hover:bg-slate-100 rounded-lg font-semibold"
                              >
                                Cancel
                              </button>
                              <button 
                                onClick={() => {
                                  onRejectLeave(reqId, approvalComments[reqId] || 'Rejected by HR');
                                  setSelectedActionId(null);
                                }}
                                className="px-3 py-1.5 bg-red-50 text-red-600 border border-red-200 rounded-lg font-bold hover:bg-red-100"
                              >
                                Confirm Reject
                              </button>
                              <button 
                                onClick={() => {
                                  onApproveLeave(reqId, approvalComments[reqId] || 'Approved by HR Manager');
                                  setSelectedActionId(null);
                                }}
                                className="px-3 py-1.5 bg-blue-600 text-white rounded-lg font-bold hover:bg-blue-700"
                              >
                                Confirm Approve
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex justify-end gap-2 mt-3 pt-2.5 border-t border-slate-200/60">
                            <button 
                              onClick={() => setSelectedActionId(reqId)}
                              className="px-3 py-1.5 text-xs text-slate-600 hover:text-slate-900 hover:bg-slate-200/60 rounded-lg font-semibold transition-all"
                            >
                              Comments...
                            </button>
                            <button 
                              onClick={() => onRejectLeave(reqId, 'Rejected by HR')}
                              className="px-3 py-1.5 text-xs border border-red-200 text-red-600 hover:bg-red-50 rounded-lg font-semibold transition-all"
                            >
                              Reject
                            </button>
                            <button 
                              onClick={() => onApproveLeave(reqId, 'Approved via HR Quick Actions')}
                              className="px-3 py-1.5 text-xs bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-bold shadow-sm transition-all"
                            >
                              Approve
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}

                  {/* Attendance Corrections */}
                  {attendanceRecords.filter(rec => rec.correctionRequested && rec.correctionStatus === 'Pending').map(rec => {
                    const recId = rec._id || rec.id;
                    const matchedEmp = employees.find(e => e.id === rec.employeeId || e.staff_id === rec.employeeId);
                    const photoUrl = matchedEmp?.photoUrl || rec.employeePhoto || '';

                    return (
                      <div key={recId} className="p-4 bg-slate-50/90 rounded-2xl border border-slate-200/80 hover:border-amber-300 transition-colors shadow-sm">
                        <div className="flex justify-between items-start">
                          <div className="flex gap-3">
                            {photoUrl ? (
                              <img 
                                src={photoUrl} 
                                alt={rec.employeeName} 
                                className="w-10 h-10 rounded-xl object-cover border border-slate-200 shadow-sm"
                                referrerPolicy="no-referrer"
                              />
                            ) : (
                              <div className="w-10 h-10 rounded-xl bg-amber-100 border border-amber-200 text-amber-800 font-bold flex items-center justify-center text-xs shrink-0 select-none">
                                {rec.employeeName.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                              </div>
                            )}
                            <div>
                              <div className="flex items-center gap-2">
                                <h4 
                                  onClick={() => onSelectEmployee(rec.employeeId)}
                                  className="font-bold text-sm text-slate-900 hover:text-blue-600 cursor-pointer"
                                >
                                  {rec.employeeName}
                                </h4>
                                <span className="px-2 py-0.5 bg-amber-50 text-amber-700 text-[10px] font-bold rounded border border-amber-100">
                                  {rec.department}
                                </span>
                              </div>
                              <p className="text-xs text-slate-500 mt-1">
                                Biometric Correction Request for <span className="font-semibold text-slate-800">{rec.date}</span>
                              </p>
                              <div className="grid grid-cols-2 gap-4 mt-2 bg-white p-2.5 rounded-lg border border-slate-200/70 text-xs">
                                <div>
                                  <span className="text-slate-400 block text-[10px] font-bold uppercase">Punch Recorded</span>
                                  <span className="text-slate-600 line-through font-medium">{rec.punchIn || rec.clockIn} &rarr; {rec.punchOut || rec.clockOut}</span>
                                </div>
                                <div>
                                  <span className="text-blue-600 block text-[10px] font-bold uppercase">Proposed Correct Time</span>
                                  <span className="text-blue-700 font-bold">{rec.correctionPunchIn} &rarr; {rec.correctionPunchOut}</span>
                                </div>
                              </div>
                              {rec.correctionReason && (
                                <p className="text-xs text-slate-600 italic mt-2 bg-white p-2 rounded-lg border border-slate-200/70">
                                  &ldquo;{rec.correctionReason}&rdquo;
                                </p>
                              )}
                            </div>
                          </div>
                          <span className="px-2 py-0.5 bg-amber-50 text-amber-700 font-bold text-[10px] uppercase rounded border border-amber-100">
                            Attendance Correction
                          </span>
                        </div>

                        <div className="flex justify-end gap-2 mt-3 pt-2.5 border-t border-slate-200/60">
                          <button 
                            onClick={() => onRejectAttendance(recId)}
                            className="px-3 py-1.5 text-xs border border-red-200 text-red-600 hover:bg-red-50 rounded-lg font-semibold transition-all"
                          >
                            Reject
                          </button>
                          <button 
                            onClick={() => onApproveAttendance(recId)}
                            className="px-3 py-1.5 text-xs bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-bold shadow-sm transition-all"
                          >
                            Approve & Sync
                          </button>
                        </div>
                      </div>
                    );
                  })}

                  {/* Mint / Teal / Cyan Atmospheric Empty State */}
                  {pendingApprovalsCount === 0 && (
                    <div 
                      className="p-10 border border-emerald-200/90 rounded-2xl flex flex-col items-center justify-center text-center relative overflow-hidden shadow-inner"
                      style={{
                        background: 'linear-gradient(135deg, #ECFDF5 0%, #E6FFFA 50%, #CCFBF1 100%)',
                        backgroundImage: 'radial-gradient(rgba(16, 185, 129, 0.28) 1.2px, transparent 1.2px)',
                        backgroundSize: '16px 16px'
                      }}
                    >
                      <div className="w-12 h-12 rounded-full bg-white border-2 border-emerald-400 text-emerald-500 flex items-center justify-center mx-auto mb-3 shadow-lg shadow-emerald-500/20 ring-4 ring-emerald-100">
                        <CheckCircle2 className="w-6 h-6 stroke-[2.5]" />
                      </div>
                      <h4 className="font-extrabold text-slate-900 text-sm tracking-tight">All caught up!</h4>
                      <p className="text-slate-600 text-xs mt-1 max-w-xs leading-relaxed font-medium">No employee approvals or attendance corrections require your attention.</p>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>

        {/* Right Column: Hospital Alerts (Pink / Coral / White Theme) */}
        <div 
          className="p-6 rounded-3xl border border-rose-100/90 shadow-[0_12px_36px_rgba(244,63,94,0.06)] flex flex-col justify-between"
          style={{
            background: 'linear-gradient(180deg, #FFFFFF 0%, #FCF9FA 100%)'
          }}
        >
          <div>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-rose-600 to-pink-500 text-white flex items-center justify-center shrink-0 shadow-md shadow-rose-500/20">
                  <ShieldAlert className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900 leading-tight">Hospital Alerts</h3>
                  <p className="text-slate-500 text-xs mt-0.5 font-medium">Compliance risks, anniversary triggers, and license tracking.</p>
                </div>
              </div>
              <span className="px-2.5 py-0.5 bg-rose-50 text-rose-700 border border-rose-200 text-[10px] font-bold rounded-full shrink-0">
                Real-time Audits
              </span>
            </div>

            <div className="space-y-3 mt-4">
              {isLoading ? (
                <div className="space-y-3">
                  <div className="p-3.5 rounded-2xl border border-slate-200/60 bg-slate-50 animate-pulse space-y-2">
                    <div className="h-3.5 bg-slate-200 rounded w-1/2" />
                    <div className="h-3 bg-slate-100 rounded w-3/4" />
                  </div>
                </div>
              ) : notifications.length === 0 ? (
                <div 
                  className="p-10 border border-rose-200/90 rounded-2xl text-center flex flex-col items-center justify-center relative overflow-hidden shadow-inner"
                  style={{
                    background: 'linear-gradient(135deg, #FFF1F2 0%, #FFE4E6 50%, #FFF5F5 100%)',
                    backgroundImage: 'radial-gradient(rgba(244, 63, 94, 0.25) 1.2px, transparent 1.2px)',
                    backgroundSize: '16px 16px'
                  }}
                >
                  <div className="w-12 h-12 rounded-full bg-white border-2 border-emerald-400 text-emerald-500 flex items-center justify-center mx-auto mb-3 shadow-lg shadow-emerald-500/20 ring-4 ring-emerald-100">
                    <CheckCircle2 className="w-6 h-6 stroke-[2.5]" />
                  </div>
                  <h5 className="font-extrabold text-slate-900 text-sm tracking-tight">No active alerts</h5>
                  <p className="text-slate-600 text-xs mt-1 leading-relaxed font-medium">Hospital compliance and staff records are completely up to date.</p>
                </div>
              ) : (
                notifications.map(notif => (
                  <div 
                    key={notif.id} 
                    className={`p-3.5 rounded-2xl border flex gap-3 transition-colors ${
                      notif.read ? 'bg-white border-slate-200/70' : 'bg-blue-50/40 border-blue-100'
                    }`}
                  >
                    <div className="mt-0.5 shrink-0">
                      {notif.category === 'License Expiry' && <ShieldAlert className="w-4 h-4 text-red-500" />}
                      {notif.category === 'Probation Ending' && <AlertCircle className="w-4 h-4 text-amber-500" />}
                      {notif.category === 'Work Anniversary' && <BadgeCheck className="w-4 h-4 text-emerald-500" />}
                      {notif.category === 'Shift Changes' && <Clock className="w-4 h-4 text-blue-500" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-1">
                        <span className="font-bold text-xs text-slate-900 truncate">{notif.title}</span>
                        <span className="text-[10px] text-slate-400 font-mono shrink-0">{notif.date}</span>
                      </div>
                      <p className="text-xs text-slate-600 mt-1 leading-relaxed">{notif.message}</p>
                      {notif.employeeId && (
                        <button 
                          onClick={() => onSelectEmployee(notif.employeeId)}
                          className="text-[11px] text-blue-600 font-bold hover:underline mt-2 flex items-center gap-1"
                        >
                          View Employee Profile
                          <ArrowRight className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

      </div>

      {/* 4. Bottom Full-Width Workforce Distribution Panel with Rich Lavender Atmosphere & Dark Contrast Feature Card */}
      <div 
        className="p-6 rounded-3xl border border-slate-200/80 shadow-[0_15px_40px_rgba(30,58,138,0.06)] w-full max-w-full min-w-0"
        style={{
          background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.98) 0%, rgba(244, 247, 254, 0.95) 50%, rgba(238, 242, 255, 0.9) 100%)'
        }}
      >
        <div className="mb-5">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-blue-700 bg-blue-100/70 border border-blue-200 px-2 py-0.5 rounded-md">
              Workforce Allocation
            </span>
          </div>
          <h3 className="text-base font-bold text-slate-900 leading-tight mt-1.5">WORKFORCE DISTRIBUTION</h3>
          <p className="text-slate-500 text-xs mt-0.5 font-medium">Staff allocation across hospital roles and specialties.</p>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-center py-4">
            <div className="flex justify-center">
              <div className="w-40 h-40 rounded-full border-8 border-slate-200 animate-pulse flex items-center justify-center">
                <div className="h-6 w-12 bg-slate-200 rounded" />
              </div>
            </div>
            <div className="space-y-3">
              <div className="h-4 bg-slate-100 animate-pulse rounded w-3/4" />
              <div className="h-4 bg-slate-100 animate-pulse rounded w-2/3" />
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
            
            {/* Left: Dynamic Workforce Composition Donut Chart (4 cols) */}
            <div className="lg:col-span-4 relative flex justify-center py-2">
              <svg className="w-48 h-48" viewBox="0 0 100 100">
                {(() => {
                  if (departmentData.length === 0) {
                    return <circle cx="50" cy="50" r="38" fill="transparent" stroke="#E2E8F0" strokeWidth="12" />;
                  }
                  let accumulated = 0;
                  return departmentData.map((dept, i) => {
                    const pct = Math.max((dept.count / (totalEmployees || 1)) * 100, 4);
                    const strokeDash = `${pct} ${100 - pct}`;
                    const strokeOffset = 100 - accumulated + 25;
                    accumulated += pct;
                    return (
                      <circle
                        key={i}
                        cx="50"
                        cy="50"
                        r="38"
                        fill="transparent"
                        stroke={dept.color}
                        strokeWidth="11"
                        strokeDasharray={strokeDash}
                        strokeDashoffset={strokeOffset}
                        style={{ transition: 'stroke-width 0.2s ease' }}
                      />
                    );
                  });
                })()}
              </svg>
              {/* Donut Center */}
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                <span className="text-3xl font-black text-slate-900 leading-none">{totalEmployees}</span>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mt-1">Active Staff</span>
              </div>
            </div>

            {/* Middle: Structured Workforce Breakdown (4 cols) */}
            <div className="lg:col-span-4 space-y-2.5">
              <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2 flex justify-between">
                <span>Role / Specialty</span>
                <span>Count & Ratio</span>
              </div>
              {departmentData.length === 0 ? (
                <div className="text-xs text-slate-400 font-medium">No staff distribution data available.</div>
              ) : (
                departmentData.map((dept) => (
                  <div key={dept.name} className="flex justify-between items-center text-xs p-1.5 rounded-xl hover:bg-white/80 transition-colors">
                    <div className="flex items-center gap-2.5">
                      <span className="w-2.5 h-2.5 rounded-full shrink-0 shadow-sm" style={{ backgroundColor: dept.color }} />
                      <span className="text-slate-700 font-semibold truncate max-w-[160px]">{dept.name}</span>
                    </div>
                    <div className="flex items-center gap-3.5 shrink-0 font-mono">
                      <span className="text-slate-500 font-medium text-[11px]">{dept.count} Staff</span>
                      <span className="font-bold text-slate-900 w-9 text-right text-[11px] bg-white border border-slate-200/60 px-1.5 py-0.5 rounded shadow-sm">{dept.percentage}%</span>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Right: High-Contrast Dark Blue / Indigo Workforce Insight Feature Card (4 cols) */}
            <div 
              className="lg:col-span-4 p-6 rounded-3xl border border-blue-400/30 text-white flex flex-col justify-between space-y-4 relative overflow-hidden shadow-2xl shadow-blue-950/25"
              style={{
                background: 'linear-gradient(135deg, #0F172A 0%, #1E3A8A 45%, #312E81 100%)'
              }}
            >
              {/* Background abstract wave & grid lines */}
              <div className="absolute inset-0 pointer-events-none opacity-25">
                <svg className="w-full h-full" viewBox="0 0 200 140" preserveAspectRatio="none">
                  <path d="M 0 100 Q 50 40, 100 80 T 200 40 L 200 140 L 0 140 Z" fill="rgba(255,255,255,0.15)" />
                  <path d="M 0 100 Q 50 40, 100 80 T 200 40" fill="none" stroke="#93C5FD" strokeWidth="2" />
                </svg>
              </div>
              <div 
                className="absolute inset-0 pointer-events-none opacity-15"
                style={{
                  backgroundImage: 'radial-gradient(rgba(255, 255, 255, 0.4) 1px, transparent 1px)',
                  backgroundSize: '12px 12px'
                }}
              />

              <div className="relative z-10 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="w-10 h-10 rounded-2xl bg-white/10 backdrop-blur-md border border-white/20 text-cyan-300 flex items-center justify-center shadow-lg shadow-blue-950/40">
                    <Star className="w-5 h-5 fill-cyan-300 text-cyan-300" />
                  </div>
                  <span className="px-2.5 py-0.5 rounded-full bg-white/10 backdrop-blur-sm border border-white/15 text-[10px] font-extrabold tracking-wider text-cyan-300 uppercase">
                    Workforce Insight
                  </span>
                </div>

                <div>
                  <h4 className="text-base font-black text-white tracking-tight">
                    {totalEmployees} Active Staff Across {departmentData.length} {departmentData.length === 1 ? 'Specialty' : 'Specialties'}
                  </h4>
                  <p className="text-xs text-blue-100/90 leading-relaxed font-medium mt-1">
                    Workforce is allocated across {departmentData.length} distinct {departmentData.length === 1 ? 'area' : 'areas'} with 100% of staff actively rostered.
                  </p>
                </div>
              </div>

              <div className="relative z-10 pt-2 border-t border-white/10 flex items-center justify-between">
                <span className="text-[11px] font-bold text-blue-200/90 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-400" />
                  {totalEmployees} Active Roster
                </span>
                <span className="text-[11px] font-mono font-bold text-cyan-200">{departmentData.length} Specialties</span>
              </div>
            </div>

          </div>
        )}
      </div>

    </div>
  );
}

