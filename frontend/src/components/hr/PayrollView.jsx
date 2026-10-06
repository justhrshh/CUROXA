import React, { useState } from 'react';
import { 
  DollarSign, Landmark, FileText, CheckCircle2, ShieldCheck, HelpCircle, 
  ChevronRight, BadgePercent, Download, Printer, CircleDollarSign
} from 'lucide-react';
import api from '../../utils/api';

export default function PayrollView({ employees = [], onRefresh }) {
  const [selectedSlip, setSelectedSlip] = useState(null);
  const [generateModalOpen, setGenerateModalOpen] = useState(false);
  const [targetEmployee, setTargetEmployee] = useState(null);
  const [toast, setToast] = useState(null);
  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };
  
  // Manual input states
  const [baseSalary, setBaseSalary] = useState('');
  const [allowances, setAllowances] = useState('');
  const [deductions, setDeductions] = useState('');

  // Helper to find payslip document for a specific month
  const getPayslipForMonth = (emp, month = 'July 2026') => {
    return emp.documents?.find(
      doc => doc.category === 'salary_slips' && doc.title === `Payslip - ${month}`
    );
  };

  // Helper to parse Base64 HTML document into values
  const parsePayslipDoc = (doc) => {
    if (!doc || !doc.fileData) return null;
    try {
      const base64 = doc.fileData.split(',')[1];
      const html = atob(base64);
      
      const getVal = (regex) => {
        const m = html.match(regex);
        return m && m[1] ? parseFloat(m[1]) : 0;
      };
      
      const baseSalary = getVal(/Basic Salary Base<\/td>\s*<td[^>]*>([\d.]+)<\/td>/i);
      const allowances = getVal(/Allowances & Reimbursements<\/td>\s*<td[^>]*>\+([\d.]+)<\/td>/i);
      const deductions = getVal(/Custom Deductions<\/td>\s*<td[^>]*>-([\d.]+)<\/td>/i);
      const tax = getVal(/Professional Income Tax \(10%\)<\/td>\s*<td[^>]*>-([\d.]+)<\/td>/i);
      const netPay = getVal(/Net Take-Home Remuneration<\/td>\s*<td[^>]*>([\d.]+)<\/td>/i);
      
      return { baseSalary, allowances, deductions, tax, netPay };
    } catch (e) {
      console.error('Error parsing payslip doc', e);
      return null;
    }
  };

  // Compute stats
  const generatedSlips = employees.map(emp => {
    const doc = getPayslipForMonth(emp);
    return doc ? parsePayslipDoc(doc) : null;
  }).filter(Boolean);

  const totalMonthlyPayout = generatedSlips.reduce((sum, s) => sum + s.netPay, 0);
  const totalTaxWithheld = generatedSlips.reduce((sum, s) => sum + s.tax, 0);
  const totalProcessed = generatedSlips.length;
  const pendingApprovalsCount = employees.length - totalProcessed;

  // Open manual generation modal
  const handleOpenGenerate = (emp) => {
    setTargetEmployee(emp);
    // Suggest default values based on employee CTC
    const defaultBase = Math.round((emp.ctcAnnual || 600000) * 0.45 / 12);
    const defaultAllowances = Math.round((emp.ctcAnnual || 600000) * 0.35 / 12);
    const defaultDeductions = Math.round((emp.ctcAnnual || 600000) * 0.05 / 12);
    
    setBaseSalary(defaultBase.toString());
    setAllowances(defaultAllowances.toString());
    setDeductions(defaultDeductions.toString());
    setGenerateModalOpen(true);
  };

  // Submit manual payslip generation
  const handleGeneratePayslip = async () => {
    if (!targetEmployee) return;
    try {
      const numBase = parseFloat(baseSalary) || 0;
      const numAllowances = parseFloat(allowances) || 0;
      const numDeductions = parseFloat(deductions) || 0;
      const calculatedTax = Math.round(numBase * 0.10); // Standard 10% tax
      const calculatedNetPay = Math.max(0, numBase + numAllowances - numDeductions - calculatedTax);

      const payload = {
        employeeId: targetEmployee._id || targetEmployee.id,
        month: 'July 2026',
        baseSalary: numBase,
        allowances: numAllowances,
        deductions: numDeductions,
        tax: calculatedTax,
        netPay: calculatedNetPay
      };
      
      const res = await api.post('/hr/payslips', payload);
      if (res.data) {
        showToast(`Successfully generated July 2026 payslip for ${targetEmployee.name}!`, 'success');
        setGenerateModalOpen(false);
        if (onRefresh) {
          await onRefresh();
        }
      }
    } catch (err) {
      console.error('Failed to generate payslip', err);
      showToast('Error generating payslip. Please try again.', 'error');
    }
  };

  // Dynamic values for modal preview
  const previewBase = parseFloat(baseSalary) || 0;
  const previewAllowances = parseFloat(allowances) || 0;
  const previewDeductions = parseFloat(deductions) || 0;
  const previewTax = Math.round(previewBase * 0.10);
  const previewNetPay = Math.max(0, previewBase + previewAllowances - previewDeductions - previewTax);

  return (
    <div className="space-y-6" id="payroll-workspace-root">
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
      
      {/* Header section */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-display font-bold text-slate-900">Clinic Payroll & Salary Dashboard</h1>
          <p className="text-slate-400 text-xs mt-0.5">Automated tax structures, provident fund compliance, and bank dispatch summaries.</p>
        </div>
      </div>

      {/* Top Financial Stats widgets */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-xl border border-slate-100 shadow-xs flex items-center gap-4">
          <div className="p-3 bg-blue-50 text-blue-600 rounded-xl">
            <Landmark className="w-6 h-6" />
          </div>
          <div>
            <span className="text-[10px] text-slate-400 block font-bold uppercase">TOTAL PAYOUT (INR)</span>
            <h3 className="text-lg font-bold text-slate-800 font-mono">₹{totalMonthlyPayout.toLocaleString()}</h3>
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-100 shadow-xs flex items-center gap-4">
          <div className="p-3 bg-emerald-50 text-emerald-600 rounded-xl">
            <CheckCircle2 className="w-6 h-6" />
          </div>
          <div>
            <span className="text-[10px] text-slate-400 block font-bold uppercase">EMPLOYEES PROCESSED</span>
            <h3 className="text-lg font-bold text-slate-800 font-mono">{totalProcessed} / {employees.length}</h3>
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-100 shadow-xs flex items-center gap-4">
          <div className="p-3 bg-orange-50 text-orange-600 rounded-xl">
            <BadgePercent className="w-6 h-6" />
          </div>
          <div>
            <span className="text-[10px] text-slate-400 block font-bold uppercase">TDS TAX WITHHELD</span>
            <h3 className="text-lg font-bold text-slate-800 font-mono">₹{totalTaxWithheld.toLocaleString()}</h3>
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-100 shadow-xs flex items-center gap-4">
          <div className="p-3 bg-purple-50 text-purple-600 rounded-xl">
            <CircleDollarSign className="w-6 h-6" />
          </div>
          <div>
            <span className="text-[10px] text-slate-400 block font-bold uppercase">PENDING TRANSFERS</span>
            <h3 className="text-lg font-bold text-slate-800 font-mono">{pendingApprovalsCount} Employees</h3>
          </div>
        </div>
      </div>

      {/* Main Payroll Roster Table */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="p-5 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
          <div>
            <h3 className="font-display font-bold text-slate-800 text-sm">Staff Compensation Matrix</h3>
            <p className="text-[11px] text-slate-400 mt-0.5">Breakdowns of CTC, basic allowances, provident fund deductions, and net payouts.</p>
          </div>
          <span className="text-xs text-slate-400 font-medium">Cycle: <span className="font-semibold text-slate-800">July 2026</span></span>
        </div>

        <div className="overflow-x-auto font-sans">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                <th className="px-6 py-3.5">Employee Details</th>
                <th className="px-6 py-3.5">Annual CTC (₹ INR)</th>
                <th className="px-6 py-3.5">Base Salary</th>
                <th className="px-6 py-3.5">Allowances</th>
                <th className="px-6 py-3.5">Deductions</th>
                <th className="px-6 py-3.5">Tax (10%)</th>
                <th className="px-6 py-3.5">Net Payout</th>
                <th className="px-6 py-3.5">Status</th>
                <th className="px-6 py-3.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {employees.map((emp) => {
                const doc = getPayslipForMonth(emp);
                const parsed = doc ? parsePayslipDoc(doc) : null;
                const hasGenerated = !!parsed;

                // Estimate defaults if not yet generated
                const estBase = Math.round((emp.ctcAnnual || 600000) * 0.45 / 12);
                const estAllowances = Math.round((emp.ctcAnnual || 600000) * 0.35 / 12);
                const estDeductions = Math.round((emp.ctcAnnual || 600000) * 0.05 / 12);
                const estTax = Math.round(estBase * 0.10);
                const estNetPay = estBase + estAllowances - estDeductions - estTax;

                const displayBase = hasGenerated ? parsed.baseSalary : estBase;
                const displayAllowances = hasGenerated ? parsed.allowances : estAllowances;
                const displayDeductions = hasGenerated ? parsed.deductions : estDeductions;
                const displayTax = hasGenerated ? parsed.tax : estTax;
                const displayNet = hasGenerated ? parsed.netPay : estNetPay;

                return (
                  <tr key={emp._id || emp.id} className="hover:bg-slate-50/50 transition-colors">
                    
                    {/* Employee Profile */}
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        {emp.photo ? (
                          <img src={emp.photo} alt={emp.name} className="w-8 h-8 rounded-full object-cover border" />
                        ) : (
                          <div className="w-8 h-8 rounded-full bg-blue-50 border text-blue-600 font-bold flex items-center justify-center text-[10px] shrink-0 select-none">
                            {emp.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                          </div>
                        )}
                        <div>
                          <span className="font-semibold text-slate-900 block">{emp.name}</span>
                          <span className="text-[10px] text-slate-400 font-mono font-medium">{emp.staff_id || emp.id} &bull; {emp.department}</span>
                        </div>
                      </div>
                    </td>

                    {/* CTC */}
                    <td className="px-6 py-4 font-semibold text-slate-500 font-mono">
                      ₹{(emp.ctcAnnual || 600000).toLocaleString()}
                    </td>

                    {/* Basic */}
                    <td className="px-6 py-4 font-mono text-slate-600">
                      ₹{displayBase.toLocaleString()}
                    </td>

                    {/* Allowances */}
                    <td className="px-6 py-4 font-mono text-slate-600">
                      ₹{displayAllowances.toLocaleString()}
                    </td>

                    {/* Deductions */}
                    <td className="px-6 py-4 font-mono text-red-500">
                      -₹{displayDeductions.toLocaleString()}
                    </td>

                    {/* Tax */}
                    <td className="px-6 py-4 font-mono text-red-500">
                      -₹{displayTax.toLocaleString()}
                    </td>

                    {/* Net Payout */}
                    <td className="px-6 py-4 font-mono font-bold text-emerald-600">
                      ₹{displayNet.toLocaleString()}
                    </td>

                    {/* Status badge */}
                    <td className="px-6 py-4">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        hasGenerated ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'
                      }`}>
                        {hasGenerated ? 'Generated' : 'Draft'}
                      </span>
                    </td>

                    {/* Actions */}
                    <td className="px-6 py-4 text-right space-x-1 whitespace-nowrap">
                      {hasGenerated ? (
                        <button 
                          onClick={() => setSelectedSlip(doc)}
                          className="px-2.5 py-1.5 bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-700 rounded font-semibold text-[11px] transition-colors"
                        >
                          Preview Slip
                        </button>
                      ) : (
                        <button 
                          onClick={() => handleOpenGenerate(emp)}
                          className="px-2.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded font-semibold text-[11px] shadow-xs transition-colors"
                        >
                          Generate Payslip
                        </button>
                      )}
                    </td>

                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Manual Salary Generator Modal */}
      {generateModalOpen && targetEmployee && (
        <div 
          className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 hr-modal-overlay z-50 animate-fadeIn"
          onClick={() => setGenerateModalOpen(false)}
        >
          <div 
            className="bg-white rounded-2xl shadow-xl border border-slate-100 max-w-md w-full p-6 relative hr-admin-modal flex flex-col"
            style={{ animation: 'adminFadeIn 0.2s ease-out' }}
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4 pb-2 border-b border-slate-100">
              <div>
                <span className="text-sm font-bold text-slate-800 uppercase block">Manual Salary Generation</span>
                <span className="text-[10px] text-slate-400 font-mono mt-0.5">{targetEmployee.name} ({targetEmployee.staff_id})</span>
              </div>
              <button 
                onClick={() => setGenerateModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 font-bold text-lg"
              >
                &times;
              </button>
            </div>
            
            <div className="space-y-4 text-xs">
              <div>
                <label className="block text-slate-500 text-[10px] uppercase font-bold tracking-wider mb-1">Base Salary (INR)</label>
                <input 
                  type="number" 
                  value={baseSalary}
                  onChange={(e) => setBaseSalary(e.target.value)}
                  className="w-full text-xs p-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white font-mono"
                />
              </div>

              <div>
                <label className="block text-slate-500 text-[10px] uppercase font-bold tracking-wider mb-1">Allowances (INR)</label>
                <input 
                  type="number" 
                  value={allowances}
                  onChange={(e) => setAllowances(e.target.value)}
                  className="w-full text-xs p-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white font-mono"
                />
              </div>

              <div>
                <label className="block text-slate-500 text-[10px] uppercase font-bold tracking-wider mb-1">Deductions (INR)</label>
                <input 
                  type="number" 
                  value={deductions}
                  onChange={(e) => setDeductions(e.target.value)}
                  className="w-full text-xs p-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white font-mono"
                />
              </div>

              <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 space-y-2 font-mono text-[10px] text-slate-600">
                <div className="flex justify-between">
                  <span>Auto Professional Tax (10%):</span>
                  <span className="font-bold text-red-500">-₹{previewTax.toLocaleString()}</span>
                </div>
                <div className="flex justify-between border-t border-slate-200 pt-2 font-sans text-xs font-bold text-slate-800">
                  <span>ESTIMATED NET PAY:</span>
                  <span className="text-emerald-600 font-mono">₹{previewNetPay.toLocaleString()}</span>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 mt-6 pt-4 border-t border-slate-100">
              <button 
                type="button" 
                onClick={() => setGenerateModalOpen(false)}
                className="px-4 py-2 border border-slate-200 rounded-lg text-xs font-semibold text-slate-500 hover:bg-slate-50 transition-colors"
              >
                Cancel
              </button>
              <button 
                type="button"
                onClick={handleGeneratePayslip}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold shadow-sm transition-colors"
              >
                Save & Generate Slip
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Salary slip preview modal */}
      {selectedSlip && (
        <div 
          className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 hr-modal-overlay z-50 animate-fadeIn"
          onClick={() => setSelectedSlip(null)}
        >
          <div 
            className="bg-white rounded-2xl shadow-xl border border-slate-100 max-w-3xl w-full p-6 relative hr-admin-modal flex flex-col"
            style={{ maxHeight: '90vh', animation: 'adminFadeIn 0.2s ease-out' }}
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4 pb-2 border-b border-slate-100">
              <span className="text-sm font-bold text-slate-800 uppercase tracking-wider">{selectedSlip.title}</span>
              <button 
                onClick={() => setSelectedSlip(null)}
                className="text-slate-400 hover:text-slate-600 font-bold text-lg"
              >
                &times;
              </button>
            </div>
            <div className="flex-1 overflow-auto flex items-center justify-center bg-slate-100 rounded-lg p-2 min-h-[400px]">
              <iframe 
                src={selectedSlip.fileData} 
                title={selectedSlip.title} 
                className="w-full h-[65vh] border-0 rounded bg-white shadow-inner" 
              />
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
