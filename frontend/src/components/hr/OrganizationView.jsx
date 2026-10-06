import React, { useState } from 'react';
import { 
  Network, Building2, UserSquare2, ChevronRight, Eye, Users, 
  MapPin, Award, CheckCircle, ShieldAlert, BadgeCheck, Phone, Mail, Activity
} from 'lucide-react';

export default function OrganizationView({ employees = [], onSelectEmployee }) {
  const [orgTab, setOrgTab] = useState('Hierarchy');
  const [focusedStaffId, setFocusedStaffId] = useState(null);
  const [toast, setToast] = useState(null);
  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  // Helper to query the live employees list passed from the backend
  const getEmployeeByIdOrName = (id, name) => {
    let matched = employees.find(e => e.id === id || e.staff_id === id);
    if (!matched && name) {
      matched = employees.find(e => e.name.toLowerCase().includes(name.toLowerCase()));
    }
    return matched;
  };

  // Pre-load a few non-direct employees for the tree simulation
  const mockCEO = {
    id: 'EMP-2026-100',
    name: 'Dr. Michael Vance',
    designation: 'Chief Executive Officer (CEO)',
    department: 'Clinic Administration',
    photoUrl: '',
    directReportsCount: 3,
    email: 'michael.vance@clinic.com',
    performanceScore: 4.9,
    attendanceRate: '99.1%',
    leaveBalance: 12
  };

  const mockDirector = {
    id: 'EMP-2026-110',
    name: 'Alisha Chinai',
    designation: 'Operations Director',
    department: 'Clinic Administration',
    photoUrl: '',
    directReportsCount: 4,
    email: 'alisha.chinai@clinic.com',
    performanceScore: 4.7,
    attendanceRate: '98.5%',
    leaveBalance: 20
  };

  // Find employee details for tree clicking
  const getFocusedEmployeeInfo = () => {
    let info = null;
    if (focusedStaffId === mockCEO.id) {
      info = { ...mockCEO };
    } else if (focusedStaffId === mockDirector.id) {
      info = { ...mockDirector };
    } else {
      const matched = employees.find(e => e.id === focusedStaffId);
      if (matched) {
        info = {
          id: matched.id,
          name: matched.name,
          designation: matched.designation,
          department: matched.department,
          photoUrl: matched.photoUrl,
          directReportsCount: employees.filter(e => e.reportingManagerId === matched.id).length,
          email: matched.email,
          performanceScore: 4.8, // simulated fallback
          attendanceRate: '97.4%',
          leaveBalance: matched.leaveBalance?.annual || 0
        };
      }
    }

    if (info) {
      const dbEmp = getEmployeeByIdOrName(info.id, info.name);
      if (dbEmp) {
        info.photoUrl = dbEmp.photoUrl || '';
      } else {
        info.photoUrl = '';
      }
    }
    return info;
  };

  const focusedInfo = getFocusedEmployeeInfo();

  // Departments List with computed metrics
  const departmentMetrics = [
    { name: 'Cardiology', code: 'CARD', head: 'Dr. Sarah Jenkins', headcount: employees.filter(e => e.department === 'Cardiology').length, budget: '₹14,50,000 / mo', status: 'Optimal' },
    { name: 'Emergency Medicine', code: 'EMER', head: 'Dr. Richard Helms (Consultant)', headcount: employees.filter(e => e.department === 'Emergency Medicine').length, budget: '₹20,00,000 / mo', status: 'Optimal' },
    { name: 'Outpatient Services', code: 'OPD', head: 'Alisha Chinai', headcount: employees.filter(e => e.department === 'Outpatient Services').length, budget: '₹7,50,000 / mo', status: 'Optimal' },
    { name: 'Pharmacy', code: 'PHAR', head: 'Kevin Smith', headcount: employees.filter(e => e.department === 'Pharmacy').length, budget: '₹10,00,000 / mo', status: 'Optimal' },
    { name: 'Pathology & Lab', code: 'PATH', head: 'Dr. Evelyn Martinez', headcount: employees.filter(e => e.department === 'Pathology & Lab').length, budget: '₹9,50,000 / mo', status: 'Under-staffed' },
    { name: 'Clinic Administration', code: 'ADMIN', head: 'Dr. Michael Vance', headcount: employees.filter(e => e.department === 'Clinic Administration').length, budget: '₹12,50,000 / mo', status: 'Optimal' },
  ];

  // Designations Matrix
  const designationsList = [
    { title: 'Chief Medical Director', grade: 'G5 - Board Level', band: 'Senior Management', licenses: 'State MD Practice Certification' },
    { title: 'Chief Cardiologist', grade: 'G5 - Consultant IV', band: 'Consulting Staff', licenses: 'MD & Cardiology Specialization Board' },
    { title: 'Senior Lab Director', grade: 'G4 - Specialist', band: 'Allied Health Staff', licenses: 'MD & Pathology Board Certificate' },
    { title: 'Senior Triage Nurse', grade: 'G2 - Specialist Nurse', band: 'Nursing Cadre', licenses: 'Registered Nurse (RN) Practice State ID' },
    { title: 'Head Pharmacist', grade: 'G3 - Lead Specialist', band: 'Pharmacy Operations', licenses: 'Registered Pharmacist State Drug License' },
    { title: 'Operations Manager', grade: 'G5 - Executive Manager', band: 'Administrative', licenses: 'Healthcare Management MBA/Certified' },
    { title: 'Head Receptionist', grade: 'G1 - Executive', band: 'Support Operations', licenses: 'Public Communication Certification' },
  ];

  return (
    <div className="space-y-6" id="organization-structure-workspace">
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
      
      {/* Header tab switcher */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-display font-bold text-slate-900">Clinic Hierarchy & Departments</h1>
          <p className="text-slate-400 text-xs mt-0.5">Explore institutional reporting lines, clinical directorates, and nursing designations.</p>
        </div>
        
        {/* Toggle navigation */}
        <div className="flex bg-slate-100 p-1 rounded-xl self-start">
          <button
            onClick={() => { setOrgTab('Hierarchy'); setFocusedStaffId(null); }}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all flex items-center gap-1 ${
              orgTab === 'Hierarchy' ? 'bg-white text-blue-600 shadow-xs' : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <Network className="w-4 h-4" />
            Reporting Organ Tree
          </button>
          <button
            onClick={() => setOrgTab('Departments')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all flex items-center gap-1 ${
              orgTab === 'Departments' ? 'bg-white text-blue-600 shadow-xs' : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <Building2 className="w-4 h-4" />
            Clinic Departments
          </button>
          <button
            onClick={() => setOrgTab('Designations')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all flex items-center gap-1 ${
              orgTab === 'Designations' ? 'bg-white text-blue-600 shadow-xs' : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <UserSquare2 className="w-4 h-4" />
            Grade & Designations
          </button>
        </div>
      </div>

      {/* RENDER VIEW 1: Hierarchy Tree */}
      {orgTab === 'Hierarchy' && (
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          
          {/* Visual Reporting Tree block */}
          <div className="xl:col-span-2 bg-white p-6 rounded-2xl border border-slate-100 shadow-sm overflow-hidden flex flex-col justify-center">
            <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wider mb-2">Clinic Executive Reporting Lines</h2>
            <p className="text-slate-400 text-xs mb-8">Click on any officer block to inspect clinical status, direct reports, and active leave balances.</p>

            {/* Tree Chart */}
            <div className="flex flex-col items-center space-y-6">
              
              {/* Level 1: CEO */}
              {(() => {
                const dbEmp = getEmployeeByIdOrName(mockCEO.id, mockCEO.name);
                const photoUrl = dbEmp?.photoUrl || '';
                return (
                  <div 
                    onClick={() => setFocusedStaffId(mockCEO.id)}
                    className={`p-4 rounded-xl border text-center cursor-pointer transition-all w-56 ${
                      focusedStaffId === mockCEO.id 
                        ? 'bg-blue-600 border-blue-600 text-white shadow-md' 
                        : 'bg-slate-50 border-slate-100 text-slate-800 hover:border-blue-400'
                    }`}
                  >
                    {photoUrl ? (
                      <img 
                        src={photoUrl} 
                        alt={mockCEO.name} 
                        className="w-10 h-10 rounded-full mx-auto object-cover border-2 border-white shadow-xs"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <div className={`w-10 h-10 rounded-full mx-auto border-2 border-white shadow-xs font-bold flex items-center justify-center text-xs select-none ${
                        focusedStaffId === mockCEO.id ? 'bg-blue-700 text-white' : 'bg-blue-50 text-blue-600'
                      }`}>
                        {mockCEO.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                      </div>
                    )}
                    <h3 className="font-semibold text-xs mt-2">{mockCEO.name}</h3>
                    <p className={`text-[10px] ${focusedStaffId === mockCEO.id ? 'text-blue-100' : 'text-slate-400'} mt-0.5`}>{mockCEO.designation}</p>
                  </div>
                );
              })()}

              {/* Connector line */}
              <div className="w-0.5 h-6 bg-slate-300" />

              {/* Level 2: Operations Director */}
              {(() => {
                const dbEmp = getEmployeeByIdOrName(mockDirector.id, mockDirector.name);
                const photoUrl = dbEmp?.photoUrl || '';
                return (
                  <div 
                    onClick={() => setFocusedStaffId(mockDirector.id)}
                    className={`p-4 rounded-xl border text-center cursor-pointer transition-all w-56 ${
                      focusedStaffId === mockDirector.id 
                        ? 'bg-blue-600 border-blue-600 text-white shadow-md' 
                        : 'bg-slate-50 border-slate-100 text-slate-800 hover:border-blue-400'
                    }`}
                  >
                    {photoUrl ? (
                      <img 
                        src={photoUrl} 
                        alt={mockDirector.name} 
                        className="w-10 h-10 rounded-full mx-auto object-cover border-2 border-white shadow-xs"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <div className={`w-10 h-10 rounded-full mx-auto border-2 border-white shadow-xs font-bold flex items-center justify-center text-xs select-none ${
                        focusedStaffId === mockDirector.id ? 'bg-blue-700 text-white' : 'bg-blue-50 text-blue-600'
                      }`}>
                        {mockDirector.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                      </div>
                    )}
                    <h3 className="font-semibold text-xs mt-2">{mockDirector.name}</h3>
                    <p className={`text-[10px] ${focusedStaffId === mockDirector.id ? 'text-blue-100' : 'text-slate-400'} mt-0.5`}>{mockDirector.designation}</p>
                  </div>
                );
              })()}

              {/* Connector lines branches */}
              <div className="relative w-full max-w-lg flex flex-col items-center">
                <div className="w-0.5 h-6 bg-slate-300" />
                <div className="absolute top-6 left-[10%] right-[10%] h-0.5 bg-slate-300" />
              </div>

              {/* Level 3: Department Heads (4 Branches) */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 w-full">
                
                {/* Branch 1: Sarah Jenkins (Cardiology) */}
                {(() => {
                  const dbEmp = getEmployeeByIdOrName('EMP-2026-101', 'Sarah Jenkins');
                  const photoUrl = dbEmp?.photoUrl || '';
                  return (
                    <div 
                      onClick={() => setFocusedStaffId('EMP-2026-101')}
                      className={`p-3.5 rounded-xl border text-center cursor-pointer transition-all ${
                        focusedStaffId === 'EMP-2026-101' 
                          ? 'bg-blue-600 border-blue-600 text-white shadow-md' 
                          : 'bg-slate-50 border-slate-100 text-slate-800 hover:border-blue-400'
                      }`}
                    >
                      {photoUrl ? (
                        <img 
                          src={photoUrl} 
                          alt="Dr. Sarah Jenkins" 
                          className="w-8 h-8 rounded-full mx-auto object-cover border border-white"
                          referrerPolicy="no-referrer"
                        />
                      ) : (
                        <div className={`w-8 h-8 rounded-full mx-auto border border-white font-bold flex items-center justify-center text-[10px] select-none ${
                          focusedStaffId === 'EMP-2026-101' ? 'bg-blue-700 text-white' : 'bg-blue-50 text-blue-600'
                        }`}>
                          SJ
                        </div>
                      )}
                      <h4 className="font-semibold text-[11px] mt-1.5 truncate">Dr. Sarah Jenkins</h4>
                      <span className={`text-[9px] ${focusedStaffId === 'EMP-2026-101' ? 'text-blue-100' : 'text-slate-400'} block mt-0.5`}>Cardiology Chief</span>
                    </div>
                  );
                })()}

                {/* Branch 2: Aaron Patel (Pediatrics) */}
                {(() => {
                  const dbEmp = getEmployeeByIdOrName('EMP-2026-104', 'Aaron Patel');
                  const photoUrl = dbEmp?.photoUrl || '';
                  return (
                    <div 
                      onClick={() => setFocusedStaffId('EMP-2026-104')}
                      className={`p-3.5 rounded-xl border text-center cursor-pointer transition-all ${
                        focusedStaffId === 'EMP-2026-104' 
                          ? 'bg-blue-600 border-blue-600 text-white shadow-md' 
                          : 'bg-slate-50 border-slate-100 text-slate-800 hover:border-blue-400'
                      }`}
                    >
                      {photoUrl ? (
                        <img 
                          src={photoUrl} 
                          alt="Dr. Aaron Patel" 
                          className="w-8 h-8 rounded-full mx-auto object-cover border border-white"
                          referrerPolicy="no-referrer"
                        />
                      ) : (
                        <div className={`w-8 h-8 rounded-full mx-auto border border-white font-bold flex items-center justify-center text-[10px] select-none ${
                          focusedStaffId === 'EMP-2026-104' ? 'bg-blue-700 text-white' : 'bg-blue-50 text-blue-600'
                        }`}>
                          AP
                        </div>
                      )}
                      <h4 className="font-semibold text-[11px] mt-1.5 truncate">Dr. Aaron Patel</h4>
                      <span className={`text-[9px] ${focusedStaffId === 'EMP-2026-104' ? 'text-blue-100' : 'text-slate-400'} block mt-0.5`}>Pediatrics Head</span>
                    </div>
                  );
                })()}

                {/* Branch 3: Kevin Smith (Pharmacy) */}
                {(() => {
                  const dbEmp = getEmployeeByIdOrName('EMP-2026-106', 'Kevin Smith');
                  const photoUrl = dbEmp?.photoUrl || '';
                  return (
                    <div 
                      onClick={() => setFocusedStaffId('EMP-2026-106')}
                      className={`p-3.5 rounded-xl border text-center cursor-pointer transition-all ${
                        focusedStaffId === 'EMP-2026-106' 
                          ? 'bg-blue-600 border-blue-600 text-white shadow-md' 
                          : 'bg-slate-50 border-slate-100 text-slate-800 hover:border-blue-400'
                      }`}
                    >
                      {photoUrl ? (
                        <img 
                          src={photoUrl} 
                          alt="Kevin Smith" 
                          className="w-8 h-8 rounded-full mx-auto object-cover border border-white"
                          referrerPolicy="no-referrer"
                        />
                      ) : (
                        <div className={`w-8 h-8 rounded-full mx-auto border border-white font-bold flex items-center justify-center text-[10px] select-none ${
                          focusedStaffId === 'EMP-2026-106' ? 'bg-blue-700 text-white' : 'bg-blue-50 text-blue-600'
                        }`}>
                          KS
                        </div>
                      )}
                      <h4 className="font-semibold text-[11px] mt-1.5 truncate">Kevin Smith</h4>
                      <span className={`text-[9px] ${focusedStaffId === 'EMP-2026-106' ? 'text-blue-100' : 'text-slate-400'} block mt-0.5`}>Pharmacy Chief</span>
                    </div>
                  );
                })()}

                {/* Branch 4: Evelyn Martinez (Lab) */}
                {(() => {
                  const dbEmp = getEmployeeByIdOrName('EMP-2026-107', 'Evelyn Martinez');
                  const photoUrl = dbEmp?.photoUrl || '';
                  return (
                    <div 
                      onClick={() => setFocusedStaffId('EMP-2026-107')}
                      className={`p-3.5 rounded-xl border text-center cursor-pointer transition-all ${
                        focusedStaffId === 'EMP-2026-107' 
                          ? 'bg-blue-600 border-blue-600 text-white shadow-md' 
                          : 'bg-slate-50 border-slate-100 text-slate-800 hover:border-blue-400'
                      }`}
                    >
                      {photoUrl ? (
                        <img 
                          src={photoUrl} 
                          alt="Dr. Evelyn Martinez" 
                          className="w-8 h-8 rounded-full mx-auto object-cover border border-white"
                          referrerPolicy="no-referrer"
                        />
                      ) : (
                        <div className={`w-8 h-8 rounded-full mx-auto border border-white font-bold flex items-center justify-center text-[10px] select-none ${
                          focusedStaffId === 'EMP-2026-107' ? 'bg-blue-700 text-white' : 'bg-blue-50 text-blue-600'
                        }`}>
                          EM
                        </div>
                      )}
                      <h4 className="font-semibold text-[11px] mt-1.5 truncate">Dr. E. Martinez</h4>
                      <span className={`text-[9px] ${focusedStaffId === 'EMP-2026-107' ? 'text-blue-100' : 'text-slate-400'} block mt-0.5`}>Lab Director</span>
                    </div>
                  );
                })()}

              </div>

            </div>
          </div>

          {/* Interactive Officer Profile contextual drawer card */}
          <div className="bg-slate-50 p-6 rounded-2xl border border-slate-100 flex flex-col justify-between">
            {focusedInfo ? (
              <div className="space-y-6">
                <div>
                  <span className="px-2.5 py-0.5 bg-blue-50 text-blue-600 text-[10px] font-bold rounded uppercase">
                    Focused Node Info
                  </span>
                  <h3 className="text-base font-display font-bold text-slate-900 mt-2">Hierarchy Node Summary</h3>
                  <p className="text-slate-400 text-xs mt-0.5">Live values queried dynamically from credential database.</p>
                </div>

                {/* Basic officer summary */}
                <div className="bg-white p-4 rounded-xl border border-slate-200/60 shadow-sm text-center">
                  {focusedInfo.photoUrl ? (
                    <img 
                      src={focusedInfo.photoUrl} 
                      alt={focusedInfo.name} 
                      className="w-16 h-16 rounded-full mx-auto object-cover border border-slate-200"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <div className="w-16 h-16 rounded-full mx-auto bg-blue-50 border border-slate-200 text-blue-600 font-bold flex items-center justify-center text-lg select-none">
                      {focusedInfo.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                    </div>
                  )}
                  <h4 className="font-bold text-slate-800 text-sm mt-3">{focusedInfo.name}</h4>
                  <span className="text-[10px] text-slate-400 block">{focusedInfo.designation}</span>
                  <span className="px-2 py-0.5 bg-slate-100 text-slate-500 rounded font-semibold text-[9px] mt-1 inline-block uppercase">
                    {focusedInfo.department}
                  </span>
                </div>

                {/* Metadata variables */}
                <div className="space-y-3 text-xs bg-white p-4 rounded-xl border border-slate-200/60">
                  <div className="flex justify-between">
                    <span className="text-slate-500">Official Email:</span>
                    <span className="font-medium text-slate-800">{focusedInfo.email}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Direct Reports Count:</span>
                    <span className="font-bold text-blue-600 font-mono">{focusedInfo.directReportsCount} Team Members</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Performance Score (Q2):</span>
                    <span className="font-bold text-slate-800 font-mono">{focusedInfo.performanceScore} / 5.0</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Biometric Sync Rate:</span>
                    <span className="font-bold text-slate-800 font-mono">{focusedInfo.attendanceRate}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Annual Leave Balance:</span>
                    <span className="font-bold text-slate-800 font-mono">{focusedInfo.leaveBalance} Days left</span>
                  </div>
                </div>

                <div className="space-y-2 pt-2">
                  <button 
                    onClick={() => onSelectEmployee(focusedInfo.id)}
                    className="w-full py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs rounded-lg text-center shadow-sm block"
                  >
                    Manage Employee profile workspace
                  </button>
                  <button 
                    onClick={() => {
                      showToast(`Direct communication thread initiated with ${focusedInfo.name} (${focusedInfo.email}).`, 'success');
                    }}
                    className="w-full py-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-600 font-semibold text-xs rounded-lg text-center block"
                  >
                    Send Direct Operational Alert
                  </button>
                </div>
              </div>
            ) : (
              <div className="text-center py-20 flex flex-col items-center justify-center space-y-3">
                <Network className="w-12 h-12 text-slate-300" />
                <h4 className="font-semibold text-slate-800 text-sm">Explore Node Detail</h4>
                <p className="text-slate-400 text-xs px-6">Click on any manager or clinical head block in the hierarchy tree to inspect details, performance, and report lines.</p>
              </div>
            )}
          </div>

        </div>
      )}

      {/* RENDER VIEW 2: Departments list */}
      {orgTab === 'Departments' && (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                  <th className="px-6 py-4">Department Code & Name</th>
                  <th className="px-6 py-4">Head of Department (HoD)</th>
                  <th className="px-6 py-4">Assigned Personnel Headcount</th>
                  <th className="px-6 py-4">Operations Monthly Cost Alloc</th>
                  <th className="px-6 py-4">Audit Compliance Status</th>
                  <th className="px-6 py-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {departmentMetrics.map((dept) => (
                  <tr key={dept.code} className="hover:bg-slate-50/50">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <span className="w-7 h-7 rounded-lg bg-blue-50 text-blue-600 font-bold flex items-center justify-center text-[10px]">
                          {dept.code}
                        </span>
                        <div>
                          <span className="font-semibold text-slate-900 block">{dept.name}</span>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-slate-700 font-medium">{dept.head}</td>
                    <td className="px-6 py-4 font-mono font-bold text-slate-800">{dept.headcount} Staff members</td>
                    <td className="px-6 py-4 font-mono text-slate-600">{dept.budget}</td>
                    <td className="px-6 py-4">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        dept.status === 'Optimal' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'
                      }`}>
                        {dept.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button 
                        onClick={() => {
                          showToast(`Filtered directory for Department: ${dept.name}`, 'success');
                        }}
                        className="px-2.5 py-1 text-xs text-blue-600 hover:bg-blue-50 rounded"
                      >
                        Inspect Staff List
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* RENDER VIEW 3: Designations Matrix */}
      {orgTab === 'Designations' && (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                  <th className="px-6 py-4">Official Designation Title</th>
                  <th className="px-6 py-4">Clinic Grade Tier</th>
                  <th className="px-6 py-4">Functional Cadre Band</th>
                  <th className="px-6 py-4">Required State Credentials / Licenses</th>
                  <th className="px-6 py-4 text-right">Settings</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {designationsList.map((desig) => (
                  <tr key={desig.title} className="hover:bg-slate-50/50">
                    <td className="px-6 py-4 font-semibold text-slate-900">{desig.title}</td>
                    <td className="px-6 py-4 font-mono font-bold text-slate-700">{desig.grade}</td>
                    <td className="px-6 py-4 text-slate-500">{desig.band}</td>
                    <td className="px-6 py-4">
                      <span className="px-2 py-1 bg-slate-100 text-slate-600 rounded text-[10px] font-medium font-mono leading-relaxed inline-block">
                        {desig.licenses}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button 
                        onClick={() => showToast(`Operational template settings for ${desig.title} is locked. Admin override required.`, 'error')}
                        className="px-2.5 py-1 text-[11px] text-slate-400 hover:text-slate-600 rounded"
                      >
                        Edit Requirements
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

    </div>
  );
}
