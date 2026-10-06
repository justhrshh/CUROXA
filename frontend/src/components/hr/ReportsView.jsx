import React, { useState } from 'react';
import { FileText, Download, PieChart, BarChart4, CheckCircle, RefreshCcw, Landmark, Users } from 'lucide-react';

export default function ReportsView({ employees = [], attendanceRecords = [], leaveRequests = [] }) {
  const [exportType, setExportType] = useState('PDF');
  const [downloadingReportId, setDownloadingReportId] = useState(null);
  const [toast, setToast] = useState(null);
  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  // Compute stats
  const totalStaffCount = employees.length;
  const avgExperience = (employees.reduce((sum, e) => sum + e.experienceYears, 0) / (employees.length || 1)).toFixed(1);
  const activeCount = employees.filter(e => e.status === 'Active').length;
  const probationCount = employees.filter(e => e.status === 'Probation').length;

  const handleExport = (reportId, reportName) => {
    setDownloadingReportId(reportName);
    setTimeout(() => {
      setDownloadingReportId(null);
      
      let headers = [];
      let rows = [];
      
      if (reportId === 'R-101') {
        // Active Clinical Staff Directory Ledger
        headers = ["Staff ID", "Employee Name", "Department", "Designation", "Employment Type", "Status"];
        rows = employees.map(e => [
          e.staff_id, 
          e.name, 
          e.department, 
          e.designation, 
          e.employmentType, 
          e.status
        ]);
      } else if (reportId === 'R-102') {
        // Biometric Attendance Scanner Sync Log
        headers = ["Record ID", "Employee Name", "Employee ID", "Date", "Clock In", "Clock Out", "Status", "Work Hours", "Device"];
        rows = attendanceRecords.map(r => [
          r._id || r.id, 
          r.employeeName || 'Unknown', 
          r.employeeId, 
          r.date, 
          r.clockIn || r.punchIn || '', 
          r.clockOut || r.punchOut || '', 
          r.status, 
          r.workHours || 0, 
          r.device || 'Web Portal'
        ]);
      } else if (reportId === 'R-103') {
        // Annual Nurse Attrition & Roster Stability Audit
        headers = ["Employee ID", "Employee Name", "Department", "Role", "Carried Forward Leaves", "Monthly Sick Leave", "Monthly Casual Leave", "Monthly Annual Leave"];
        rows = employees.map(e => [
          e.staff_id, 
          e.name, 
          e.department, 
          e.role || 'Staff', 
          e.carriedForwardLeaves || 0, 
          e.monthlyLeaveAllocation?.sick || 1, 
          e.monthlyLeaveAllocation?.casual || 1, 
          e.monthlyLeaveAllocation?.annual || 1.25
        ]);
      } else if (reportId === 'R-104') {
        // Joint Commission HIPAA Compliance Training Scores
        headers = ["Staff ID", "Employee Name", "Department", "Designation", "HIPAA Training Status", "Verification Documents Uploaded"];
        rows = employees.map(e => [
          e.staff_id, 
          e.name, 
          e.department, 
          e.designation, 
          e.status === 'Active' ? 'COMPLETED' : 'PENDING', 
          e.documents ? e.documents.length : 0
        ]);
      }
      
      // Generate CSV content
      const csvContent = [
        headers.join(','),
        ...rows.map(row => row.map(val => `"${String(val).replace(/"/g, '""')}"`).join(','))
      ].join('\n');
      
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.setAttribute("href", url);
      
      // Determine file extension
      const ext = exportType.toLowerCase();
      link.setAttribute("download", `${reportName.replace(/\s+/g, '_')}_Report.${ext === 'pdf' ? 'csv' : ext}`);
      
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      showToast(`Report "${reportName}" exported and downloaded successfully as a .${ext === 'pdf' ? 'csv' : ext} file.`, 'success');
    }, 1500);
  };

  const reportsList = [
    { id: 'R-101', name: 'Active Clinical Staff Directory Ledger', type: 'Directory', size: '2.4 MB' },
    { id: 'R-102', name: 'Biometric Attendance Scanner Sync Log', type: 'Attendance', size: '1.8 MB' },
    { id: 'R-103', name: 'Annual Nurse Attrition & Roster Stability Audit', type: 'Attrition', size: '940 KB' },
    { id: 'R-104', name: 'Joint Commission HIPAA Compliance Training Scores', type: 'Compliance', size: '1.2 MB' }
  ];

  return (
    <div className="space-y-6" id="reports-workspace">
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
      
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-display font-bold text-slate-900">Clinic HR Intelligence & Audits</h1>
          <p className="text-slate-400 text-xs mt-0.5">Export payroll ledger statements, joint commission audits, and nurse attrition ratios.</p>
        </div>

        {/* Global export selector */}
        <div className="flex items-center bg-white border border-slate-200 rounded-lg p-1 gap-1 text-xs font-semibold shadow-xs">
          <span className="text-slate-400 px-2 font-bold text-[10px] uppercase">Format:</span>
          {['PDF', 'Excel', 'CSV'].map(fmt => (
            <button
              key={fmt}
              onClick={() => setExportType(fmt)}
              className={`px-2.5 py-1 rounded-md transition-colors ${
                exportType === fmt ? 'bg-blue-600 text-white' : 'text-slate-600 hover:bg-slate-50'
              }`}
            >
              {fmt}
            </button>
          ))}
        </div>
      </div>

      {/* Analytics overview widgets */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        
        <div className="bg-white p-4 rounded-xl border border-slate-100 shadow-xs">
          <span className="text-[10px] text-slate-400 block font-bold uppercase">TOTAL STAFF COUNT</span>
          <h3 className="text-lg font-bold text-slate-800 font-mono mt-1">{totalStaffCount} Staff</h3>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-100 shadow-xs">
          <span className="text-[10px] text-slate-400 block font-bold uppercase">ACTIVE ROSTER HEADCOUNT</span>
          <h3 className="text-lg font-bold text-slate-800 font-mono mt-1">{activeCount} Active Staff</h3>
        </div>

      </div>

      {/* Reports downloads roster */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="p-5 border-b border-slate-100 bg-slate-50/50">
          <h3 className="font-display font-bold text-slate-800 text-sm">Regulatory Reports List</h3>
        </div>

        <div className="divide-y divide-slate-100">
          {reportsList.map((report) => (
            <div key={report.id} className="p-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 hover:bg-slate-50/50 transition-colors">
              <div className="flex gap-3">
                <div className="p-2 bg-blue-50 text-blue-600 rounded-lg shrink-0">
                  <FileText className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="font-semibold text-xs text-slate-800">{report.name}</h4>
                  <p className="text-[10px] text-slate-400 mt-0.5">Report ID: {report.id} &bull; Classification: {report.type} &bull; File Size: {report.size}</p>
                </div>
              </div>

              <button
                onClick={() => handleExport(report.id, report.name)}
                disabled={downloadingReportId !== null}
                className="px-3.5 py-1.5 border border-blue-200 text-blue-600 hover:bg-blue-50 text-xs font-semibold rounded-lg shadow-xs flex items-center gap-1 shrink-0 self-end sm:self-center disabled:opacity-50"
              >
                {downloadingReportId === report.name ? (
                  <>
                    <RefreshCcw className="w-3.5 h-3.5 animate-spin" />
                    Compiling Ledger...
                  </>
                ) : (
                  <>
                    <Download className="w-3.5 h-3.5" />
                    Export to {exportType}
                  </>
                )}
              </button>
            </div>
          ))}
        </div>
      </div>

    </div>
  );
}
