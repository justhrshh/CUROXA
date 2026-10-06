import React, { useState } from 'react';
import { Settings, Shield, BellRing, History, Check, Save, UserCheck, AlertTriangle } from 'lucide-react';

export default function SettingsView() {
  const [activeSetTab, setActiveSetTab] = useState('Approvals');
  const [toast, setToast] = useState(null);
  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  // Workflows state
  const [workflows, setWorkflows] = useState([
    { id: 'WF-1', name: 'Clinical Leave Approvals', description: 'Requires approval from both Department Head and Chief Medical Director.', stages: ['Dept Head', 'Chief Medical Director'], active: true },
    { id: 'WF-2', name: 'Biometric Attendance Adjustments', description: 'Immediate validation from Assigned HR Executive only.', stages: ['Assigned HR Executive'], active: true },
    { id: 'WF-3', name: 'Clinical Recruitment Offers', description: 'Must receive endorsement from CFO and CEO prior to dispatch.', stages: ['Clinic CFO', 'Chief Executive Officer'], active: true }
  ]);

  // Notifications setting state
  const [licenseReminders, setLicenseReminders] = useState(60);
  const [isBirthdayBroadcast, setIsBirthdayBroadcast] = useState(true);

  // Audits logs
  const auditLogs = [
    { timestamp: '2026-07-08 14:15:22', actor: 'HR Manager Admin', action: 'Approved Leave Request #LR-101', target: 'Dr. Sarah Jenkins' },
    { timestamp: '2026-07-08 11:04:10', actor: 'HR Manager Admin', action: 'Assigned Role "Senior Triage Nurse" & custom permissions', target: 'Nurse Marcus Vance' },
    { timestamp: '2026-07-07 16:30:45', actor: 'HR Manager Admin', action: 'Allocated Lenovo ThinkPad Yoga S/N: LPT-5011', target: 'Admissions Lead Alisha Chinai' },
    { timestamp: '2026-07-07 09:12:00', actor: 'System Biometrics Sync', action: 'Biometric Daily Logs Re-Synced (8 items)', target: 'Roster Integration Module' }
  ];

  const handleToggleWorkflow = (id) => {
    setWorkflows(prev => prev.map(w => {
      if (w.id === id) {
        return { ...w, active: !w.active };
      }
      return w;
    }));
    showToast('Multi-stage approval workflow configuration updated.', 'success');
  };

  const handleSaveSettings = () => {
    showToast('System settings and automated notification thresholds updated successfully.', 'success');
  };

  return (
    <div className="space-y-6" id="settings-workspace-root">
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
      <div className="flex flex-col md:flex-row md:items-center justify-between border-b border-slate-200 pb-3 gap-4">
        <div>
          <h1 className="text-xl font-display font-bold text-slate-900">Clinic HRMS Global Configurations</h1>
          <p className="text-slate-400 text-xs mt-0.5">Control hierarchical approval chains, automated credential alerts, and system compliance audit logs.</p>
        </div>

        <div className="flex bg-slate-100 p-1 rounded-xl self-start">
          <button
            onClick={() => setActiveSetTab('Approvals')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all flex items-center gap-1 ${
              activeSetTab === 'Approvals' ? 'bg-white text-blue-600 shadow-xs' : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <Shield className="w-4 h-4" />
            Approval Workflows
          </button>
          <button
            onClick={() => setActiveSetTab('Notifications')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all flex items-center gap-1 ${
              activeSetTab === 'Notifications' ? 'bg-white text-blue-600 shadow-xs' : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <BellRing className="w-4 h-4" />
            Automations & Alerts
          </button>
          <button
            onClick={() => setActiveSetTab('Audit')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all flex items-center gap-1 ${
              activeSetTab === 'Audit' ? 'bg-white text-blue-600 shadow-xs' : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <History className="w-4 h-4" />
            Admin Audit Trail
          </button>
        </div>
      </div>

      {/* VIEW 1: Approval Workflows */}
      {activeSetTab === 'Approvals' && (
        <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm space-y-6">
          <div>
            <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider">Multi-Tier Approvals Board</h3>
            <p className="text-[11px] text-slate-400 mt-0.5">Define which clinic executives must sign off on operational changes.</p>
          </div>

          <div className="space-y-4">
            {workflows.map((wf) => (
              <div key={wf.id} className="p-4 bg-slate-50 rounded-xl border border-slate-150 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                  <h4 className="font-bold text-xs text-slate-800">{wf.name}</h4>
                  <p className="text-[11px] text-slate-400 mt-0.5 leading-relaxed">{wf.description}</p>
                  
                  <div className="flex items-center gap-1.5 mt-3 text-[10px] font-bold text-slate-500 font-mono">
                    <span>Hierarchy chain:</span>
                    {wf.stages.map((stg, i) => (
                      <React.Fragment key={stg}>
                        {i > 0 && <span className="text-blue-500">&rarr;</span>}
                        <span className="px-1.5 py-0.5 bg-blue-50 text-blue-700 rounded">
                          {stg}
                        </span>
                      </React.Fragment>
                    ))}
                  </div>
                </div>

                <div className="flex items-center gap-3 self-end sm:self-center shrink-0">
                  <span className={`text-[10px] font-bold uppercase ${wf.active ? 'text-emerald-600' : 'text-slate-400'}`}>
                    {wf.active ? 'Active Flow' : 'Disabled'}
                  </span>
                  <button
                    onClick={() => handleToggleWorkflow(wf.id)}
                    className={`w-11 h-6 rounded-full p-0.5 transition-colors focus:outline-none ${
                      wf.active ? 'bg-blue-600' : 'bg-slate-300'
                    }`}
                  >
                    <div className={`w-5 h-5 bg-white rounded-full shadow-xs transition-transform transform ${
                      wf.active ? 'translate-x-5' : 'translate-x-0'
                    }`} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* VIEW 2: Automations & Notifications alerts */}
      {activeSetTab === 'Notifications' && (
        <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm space-y-6">
          <div>
            <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider">Automated Notification Rules</h3>
            <p className="text-[11px] text-slate-400 mt-0.5">Configure system thresholds for automated email and screen broadcast dispatch.</p>
          </div>

          <div className="space-y-4 text-xs">
            
            {/* Setting 1: License renewal warning */}
            <div className="p-4 bg-slate-50 rounded-xl border border-slate-100 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
              <div>
                <h4 className="font-bold text-slate-800">Clinician License Renewal Warnings</h4>
                <p className="text-[11px] text-slate-400 mt-0.5">Configure how many days in advance to ping clinicians regarding state license expirations.</p>
              </div>
              <div className="flex items-center gap-2 self-end sm:self-center">
                <input 
                  type="number" 
                  value={licenseReminders} 
                  onChange={(e) => setLicenseReminders(parseInt(e.target.value) || 30)}
                  className="w-16 p-1 border rounded text-xs text-center font-bold font-mono bg-white"
                />
                <span className="text-slate-500 font-semibold">Days prior</span>
              </div>
            </div>

            {/* Setting 2: Birthday announcement */}
            <div className="p-4 bg-slate-50 rounded-xl border border-slate-100 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
              <div>
                <h4 className="font-bold text-slate-800">Clinic Birthday Broadcast</h4>
                <p className="text-[11px] text-slate-400 mt-0.5">Automate Slack/Email greetings on employee birthdays.</p>
              </div>
              <button 
                onClick={() => setIsBirthdayBroadcast(!isBirthdayBroadcast)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg ${
                  isBirthdayBroadcast ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'
                }`}
              >
                {isBirthdayBroadcast ? 'Enabled' : 'Disabled'}
              </button>
            </div>

            <div className="pt-2 border-t border-slate-100 text-right">
              <button 
                onClick={handleSaveSettings}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold shadow-xs flex items-center gap-1 ml-auto"
              >
                <Save className="w-4 h-4" />
                Save Automation Rules
              </button>
            </div>

          </div>
        </div>
      )}

      {/* VIEW 3: System Audits Trail */}
      {activeSetTab === 'Audit' && (
        <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm space-y-4">
          <div>
            <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider">Joint Commission Admin Audit logs</h3>
            <p className="text-[11px] text-slate-400 mt-0.5">Chronological trail of operations made across employee databases for HIPAA auditing compliance.</p>
          </div>

          <div className="border border-slate-100 rounded-xl overflow-hidden shadow-sm text-xs">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                  <th className="px-6 py-3">Timestamp (UTC)</th>
                  <th className="px-6 py-3">Operator User</th>
                  <th className="px-6 py-3">Action Recorded</th>
                  <th className="px-6 py-3 text-right">Affected Target Node</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-mono text-[11px] text-slate-600">
                {auditLogs.map((log) => (
                  <tr key={log.timestamp} className="hover:bg-slate-50/50">
                    <td className="px-6 py-3 text-slate-400">{log.timestamp}</td>
                    <td className="px-6 py-3 font-semibold text-slate-700">{log.actor}</td>
                    <td className="px-6 py-3">{log.action}</td>
                    <td className="px-6 py-3 text-right font-semibold text-slate-700">{log.target}</td>
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
