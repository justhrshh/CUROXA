import React, { useState } from 'react';
import { Laptop, ArrowRightLeft, ShieldAlert, CheckCircle, Plus, ClipboardList, Trash2, Tag } from 'lucide-react';
import api from '../../utils/api';

export default function AssetsView({ assets = [], employees = [], onRefreshAssets }) {
  const [isAllocating, setIsAllocating] = useState(false);
  const [toast, setToast] = useState(null);
  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };
  const [newAlloc, setNewAlloc] = useState({
    assetId: '',
    employeeId: '',
    employeeName: ''
  });

  const availableAssets = assets.filter(a => a.status === 'Available' || a.status === 'Active' && !a.assignedTo);
  const activeAllocations = assets.filter(a => a.assignedTo);
  const inStorageCount = assets.length - activeAllocations.length;

  React.useEffect(() => {
    if (availableAssets.length > 0 && !newAlloc.assetId) {
      setNewAlloc(prev => ({
        ...prev,
        assetId: availableAssets[0]._id || availableAssets[0].id
      }));
    }
    if (employees.length > 0 && !newAlloc.employeeId) {
      setNewAlloc(prev => ({
        ...prev,
        employeeId: employees[0].id || employees[0]._id,
        employeeName: employees[0].name
      }));
    }
  }, [assets, employees]);

  const handleAllocate = async (e) => {
    e.preventDefault();
    if (!newAlloc.assetId || !newAlloc.employeeId) {
      showToast('Please select an available asset and an employee.', 'error');
      return;
    }
    try {
      const assetId = newAlloc.assetId;
      await api.put(`/hr/assets/${assetId}`, {
        status: 'Active',
        assignedTo: newAlloc.employeeName,
        assignedDate: new Date().toISOString().split('T')[0]
      });
      setIsAllocating(false);
      if (onRefreshAssets) onRefreshAssets();
      showToast(`Asset successfully assigned to ${newAlloc.employeeName}. Shift access privileges generated.`, 'success');
    } catch (err) {
      console.error(err);
      showToast('Failed to assign asset.', 'error');
    }
  };

  const handleReturnAsset = async (id) => {
    try {
      await api.put(`/hr/assets/${id}`, {
        status: 'Active',
        assignedTo: '',
        assignedDate: ''
      });
      if (onRefreshAssets) onRefreshAssets();
      showToast(`Asset returned successfully to clinic supply closet. Re-indexed as "Available".`, 'success');
    } catch (err) {
      console.error(err);
      showToast('Failed to return asset.', 'error');
    }
  };

  return (
    <div className="space-y-6" id="assets-management-workspace">
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
          <h1 className="text-xl font-display font-bold text-slate-900">Clinic Physical Asset Allocation</h1>
          <p className="text-slate-400 text-xs mt-0.5">Track RFID badges, clinical tablets, and medical monitors allocated across medical staff.</p>
        </div>
        
        <button 
          onClick={() => setIsAllocating(true)}
          className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold shadow-sm flex items-center gap-1 self-start"
        >
          <Plus className="w-4 h-4" />
          Assign Inventory Item
        </button>
      </div>

      {/* Asset register metrics */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white p-4 rounded-xl border border-slate-100 shadow-xs flex items-center gap-3">
          <div className="p-2.5 bg-blue-50 text-blue-600 rounded-lg">
            <ClipboardList className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[10px] text-slate-400 block font-bold">TOTAL REGISTERED ITEMS</span>
            <span className="text-base font-bold text-slate-800 font-mono">{assets.length} Assets</span>
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-100 shadow-xs flex items-center gap-3">
          <div className="p-2.5 bg-emerald-50 text-emerald-600 rounded-lg">
            <CheckCircle className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[10px] text-slate-400 block font-bold">ACTIVE ALLOCATIONS</span>
            <span className="text-base font-bold text-slate-800 font-mono">{activeAllocations.length} Handed Out</span>
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-100 shadow-xs flex items-center gap-3">
          <div className="p-2.5 bg-orange-50 text-orange-600 rounded-lg">
            <Tag className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[10px] text-slate-400 block font-bold">AVAILABLE IN LOCKER</span>
            <span className="text-base font-bold text-slate-800 font-mono">{inStorageCount} In Storage</span>
          </div>
        </div>
      </div>

      {/* Assets Database table */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="p-5 border-b border-slate-100 bg-slate-50/50">
          <h3 className="font-display font-bold text-slate-800 text-sm">Physical Hardware Ledger</h3>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                <th className="px-6 py-3.5">Asset S/N & Name</th>
                <th className="px-6 py-3.5">Asset Type</th>
                <th className="px-6 py-3.5">Allocated Recipient</th>
                <th className="px-6 py-3.5">Allocation Date</th>
                <th className="px-6 py-3.5">Status</th>
                <th className="px-6 py-3.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {assets.map((ast) => (
                <tr key={ast._id || ast.id} className="hover:bg-slate-50/50">
                  <td className="px-6 py-4 font-semibold text-slate-800">
                    <div>{ast.assetName || ast.name}</div>
                    <span className="text-[10px] font-mono text-slate-400 font-medium">S/N: {ast.serialNumber}</span>
                  </td>
                  <td className="px-6 py-4">
                    <span className="px-2 py-0.5 bg-slate-100 text-slate-600 rounded text-[10px] font-semibold">
                      {ast.category || ast.type}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-slate-700 font-medium">
                    {ast.assignedTo || '— (In Supply Locker)'}
                  </td>
                  <td className="px-6 py-4 text-slate-500">
                    {ast.assignedDate || '—'}
                  </td>
                  <td className="px-6 py-4">
                    <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold ${
                      ast.assignedTo ? 'bg-blue-50 text-blue-700' : 'bg-emerald-50 text-emerald-700'
                    }`}>
                      {ast.assignedTo ? 'Allocated' : 'Available'}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    {ast.assignedTo && (
                      <button 
                        onClick={() => handleReturnAsset(ast._id || ast.id)}
                        className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg text-xs font-semibold flex items-center gap-1 ml-auto border border-blue-100"
                      >
                        <ArrowRightLeft className="w-3.5 h-3.5" />
                        Return to Storage
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Assignment modal */}
      {isAllocating && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xl max-w-sm w-full space-y-4 animate-fadeIn">
            <div className="flex justify-between items-start">
              <div>
                <h3 className="font-display font-bold text-slate-900 text-sm">Assign Supply Closet Item</h3>
                <p className="text-[10px] text-slate-400">Configure physical EMR nodes or RFID entry badges.</p>
              </div>
              <button onClick={() => setIsAllocating(false)} className="text-slate-400 hover:text-slate-600">&times;</button>
            </div>

            <form onSubmit={handleAllocate} className="space-y-4 text-xs">
              <div>
                <label className="block text-slate-500 font-semibold mb-1">Select Available Item</label>
                <select 
                  value={newAlloc.assetId}
                  onChange={(e) => setNewAlloc({...newAlloc, assetId: e.target.value})}
                  className="w-full p-2.5 border border-slate-200 rounded-lg bg-white"
                >
                  {availableAssets.map(a => (
                    <option key={a._id || a.id} value={a._id || a.id}>{a.assetName || a.name} ({a.serialNumber})</option>
                  ))}
                  {availableAssets.length === 0 && (
                    <option disabled>No items available in Storage</option>
                  )}
                </select>
              </div>

              <div>
                <label className="block text-slate-500 font-semibold mb-1">Select Assignee Recipient</label>
                <select 
                  value={newAlloc.employeeId}
                  onChange={(e) => {
                    const emp = employees.find(emp => (emp.id || emp._id) === e.target.value);
                    setNewAlloc({
                      ...newAlloc,
                      employeeId: e.target.value,
                      employeeName: emp ? emp.name : ''
                    });
                  }}
                  className="w-full p-2.5 border border-slate-200 rounded-lg bg-white"
                >
                  {employees.map(emp => (
                    <option key={emp.id || emp._id} value={emp.id || emp._id}>{emp.name}</option>
                  ))}
                </select>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button 
                  type="button" 
                  onClick={() => setIsAllocating(false)}
                  className="px-4 py-2 border border-slate-200 text-slate-500 hover:bg-slate-50 rounded-lg"
                >
                  Cancel
                </button>
                <button 
                  type="submit"
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold shadow-sm"
                >
                  Complete Allocation
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
