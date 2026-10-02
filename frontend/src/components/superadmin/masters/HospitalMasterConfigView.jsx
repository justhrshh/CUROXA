import React, { useState, useEffect, useCallback, useMemo } from 'react';
import * as Icons from 'lucide-react';
import { getAllCategories, getCategoryConfig } from '../../../config/masterSchemaRegistry';

const LucideIcon = ({ name, ...props }) => {
  if (!name) return <Icons.HelpCircle {...props} />;
  const camelName = name
    .split('-')
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join('');
  const IconComponent = Icons[camelName] || Icons.HelpCircle;
  return <IconComponent {...props} />;
};

export default function HospitalMasterConfigView({ onSwitchTab }) {
  const [hospitals, setHospitals] = useState([]);
  const [selectedTenantId, setSelectedTenantId] = useState('');
  const [loadingHospitals, setLoadingHospitals] = useState(false);

  // Filters
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [departmentFilter, setDepartmentFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(25);

  // Data
  const [configs, setConfigs] = useState([]);
  const [pagination, setPagination] = useState({ total: 0, pages: 1 });
  const [loadingConfigs, setLoadingConfigs] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  // Modals
  const [isAssignModalOpen, setIsAssignModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingConfig, setEditingConfig] = useState(null);

  // Assign Modal State
  const [unassignedItems, setUnassignedItems] = useState([]);
  const [loadingUnassigned, setLoadingUnassigned] = useState(false);
  const [unassignedSearch, setUnassignedSearch] = useState('');
  const [selectedMasterItem, setSelectedMasterItem] = useState(null);
  const [assignForm, setAssignForm] = useState({
    mrp: '',
    netRate: '',
    hospitalCost: '',
    status: 'Active'
  });
  const [savingAssign, setSavingAssign] = useState(false);

  // Edit Modal State
  const [editForm, setEditForm] = useState({
    mrp: '',
    netRate: '',
    hospitalCost: '',
    status: 'Active'
  });
  const [savingEdit, setSavingEdit] = useState(false);

  const categories = useMemo(() => getAllCategories().filter(c => c.status !== 'SOURCE-CONFIRMATION-REQUIRED'), []);

  // Department options based on selected category filter
  const departmentsForFilter = useMemo(() => {
    if (categoryFilter === 'all') return [];
    const config = getCategoryConfig(categoryFilter);
    return config && config.hasDepartment ? Object.keys(config.departments || {}) : [];
  }, [categoryFilter]);

  // 1. Fetch Hospital List
  useEffect(() => {
    let isMounted = true;
    const fetchHospitals = async () => {
      try {
        setLoadingHospitals(true);
        const token = localStorage.getItem('token');
        const res = await fetch('/api/superadmin/masters/hospitals-list', {
          headers: token ? { Authorization: `Bearer ${token}` } : {}
        });
        const data = await res.json();
        if (isMounted && data.success && Array.isArray(data.data)) {
          setHospitals(data.data);
          if (data.data.length > 0 && !selectedTenantId) {
            setSelectedTenantId(data.data[0].code || data.data[0].hospitalId || '');
          }
        }
      } catch (err) {
        console.error('[HOSPITAL CONFIG] Load hospitals error:', err);
      } finally {
        if (isMounted) setLoadingHospitals(false);
      }
    };
    fetchHospitals();
    return () => { isMounted = false; };
  }, []);

  // 2. Fetch Hospital Configs for Selected Tenant
  const fetchConfigs = useCallback(async () => {
    if (!selectedTenantId) return;
    try {
      setLoadingConfigs(true);
      setErrorMessage('');
      const token = localStorage.getItem('token');
      const params = new URLSearchParams();
      params.append('tenantId', selectedTenantId);
      if (categoryFilter !== 'all') params.append('category', categoryFilter);
      if (departmentFilter !== 'all') params.append('department', departmentFilter);
      if (statusFilter !== 'all') params.append('status', statusFilter);
      params.append('page', page.toString());
      params.append('limit', limit.toString());

      const res = await fetch(`/api/superadmin/masters/hospital-configs?${params.toString()}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      });
      const data = await res.json();
      if (data.success) {
        setConfigs(data.data || []);
        if (data.pagination) setPagination(data.pagination);
      } else {
        throw new Error(data.error || 'Failed to load hospital configurations');
      }
    } catch (err) {
      console.error('[HOSPITAL CONFIG] Fetch error:', err);
      setErrorMessage(err.message || 'Error loading configurations');
      setConfigs([]);
    } finally {
      setLoadingConfigs(false);
    }
  }, [selectedTenantId, categoryFilter, departmentFilter, statusFilter, page, limit]);

  useEffect(() => {
    fetchConfigs();
  }, [fetchConfigs]);

  // 3. Fetch Unassigned Global Items for Assignment Modal
  const fetchUnassignedItems = useCallback(async () => {
    if (!selectedTenantId || !isAssignModalOpen) return;
    try {
      setLoadingUnassigned(true);
      const token = localStorage.getItem('token');
      const params = new URLSearchParams();
      params.append('tenantId', selectedTenantId);
      if (categoryFilter !== 'all') params.append('category', categoryFilter);
      if (unassignedSearch.trim()) params.append('search', unassignedSearch.trim());

      const res = await fetch(`/api/superadmin/masters/unassigned-global-items?${params.toString()}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      });
      const data = await res.json();
      if (data.success) {
        setUnassignedItems(data.data || []);
      }
    } catch (err) {
      console.error('[HOSPITAL CONFIG] Fetch unassigned error:', err);
    } finally {
      setLoadingUnassigned(false);
    }
  }, [selectedTenantId, isAssignModalOpen, categoryFilter, unassignedSearch]);

  useEffect(() => {
    if (isAssignModalOpen) {
      fetchUnassignedItems();
    }
  }, [isAssignModalOpen, fetchUnassignedItems]);

  // 4. Open Assign Modal
  const handleOpenAssignModal = () => {
    setSelectedMasterItem(null);
    setAssignForm({ mrp: '', netRate: '', hospitalCost: '', status: 'Active' });
    setUnassignedSearch('');
    setIsAssignModalOpen(true);
  };

  // 5. Submit Assignment
  const handleSaveAssign = async (e) => {
    e.preventDefault();
    if (!selectedMasterItem) {
      alert('Please select an item from the global master catalog');
      return;
    }
    try {
      setSavingAssign(true);
      const token = localStorage.getItem('token');
      const payload = {
        tenantId: selectedTenantId,
        masterItemId: selectedMasterItem._id,
        mrp: Number(assignForm.mrp) || 0,
        netRate: Number(assignForm.netRate) || 0,
        hospitalCost: Number(assignForm.hospitalCost) || 0,
        status: assignForm.status || 'Active'
      };

      const res = await fetch('/api/superadmin/masters/hospital-configs/assign', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to assign master item');
      }

      setSuccessMessage(`Assigned [${selectedMasterItem.itemCode}] to hospital '${selectedTenantId}' successfully`);
      setTimeout(() => setSuccessMessage(''), 4000);
      setIsAssignModalOpen(false);
      fetchConfigs();
    } catch (err) {
      alert(`Assignment failed: ${err.message}`);
    } finally {
      setSavingAssign(false);
    }
  };

  // 6. Open Edit Modal
  const handleOpenEditModal = (config) => {
    setEditingConfig(config);
    setEditForm({
      mrp: config.mrp || '',
      netRate: config.netRate || '',
      hospitalCost: config.hospitalCost || '',
      status: config.status || 'Active'
    });
    setIsEditModalOpen(true);
  };

  // 7. Save Edit Pricing
  const handleSaveEdit = async (e) => {
    e.preventDefault();
    if (!editingConfig) return;
    try {
      setSavingEdit(true);
      const token = localStorage.getItem('token');
      const payload = {
        mrp: Number(editForm.mrp) || 0,
        netRate: Number(editForm.netRate) || 0,
        hospitalCost: Number(editForm.hospitalCost) || 0,
        status: editForm.status
      };

      const res = await fetch(`/api/superadmin/masters/hospital-configs/${editingConfig._id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to update pricing');
      }

      setSuccessMessage(`Updated hospital pricing successfully`);
      setTimeout(() => setSuccessMessage(''), 4000);
      setIsEditModalOpen(false);
      fetchConfigs();
    } catch (err) {
      alert(`Update failed: ${err.message}`);
    } finally {
      setSavingEdit(false);
    }
  };

  // 8. Unassign Master Item
  const handleUnassign = async (config) => {
    const itemCode = config.masterItemId?.itemCode || 'Item';
    if (!window.confirm(`Are you sure you want to remove item [${itemCode}] from hospital '${selectedTenantId}'?`)) {
      return;
    }
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`/api/superadmin/masters/hospital-configs/${config._id}`, {
        method: 'DELETE',
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to unassign item');
      }
      setSuccessMessage(`Removed item from hospital catalog`);
      setTimeout(() => setSuccessMessage(''), 4000);
      fetchConfigs();
    } catch (err) {
      alert(`Unassign failed: ${err.message}`);
    }
  };

  const selectedHospitalObj = hospitals.find(h => (h.code || h.hospitalId) === selectedTenantId);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', width: '100%' }}>
      {/* ── 1. TENANT SELECTION & BANNER ── */}
      <div style={{
        background: '#FFFFFF',
        borderRadius: '12px',
        border: '1px solid #E2E8F0',
        padding: '16px 20px',
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '16px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.03)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{
            width: '40px',
            height: '40px',
            borderRadius: '10px',
            background: '#F5F3FF',
            color: '#7C3AED',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            <LucideIcon name="building-2" size={20} />
          </div>
          <div>
            <div style={{ fontSize: '11px', fontWeight: 800, color: '#7C3AED', textTransform: 'uppercase' }}>
              Multi-Tenant Price Isolation Layer
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '14px', fontWeight: 700, color: '#0F172A' }}>
                Hospital Tenant:
              </span>
              <select
                value={selectedTenantId}
                onChange={(e) => {
                  setSelectedTenantId(e.target.value);
                  setPage(1);
                }}
                disabled={loadingHospitals}
                style={{
                  padding: '6px 12px',
                  borderRadius: '8px',
                  border: '1px solid #CBD5E1',
                  fontSize: '13px',
                  fontWeight: 700,
                  color: '#1E293B',
                  background: '#FFFFFF',
                  cursor: 'pointer',
                  outline: 'none'
                }}
              >
                {hospitals.map((h) => {
                  const val = h.code || h.hospitalId;
                  return (
                    <option key={val} value={val}>
                      {h.name} ({val})
                    </option>
                  );
                })}
              </select>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{
            fontSize: '12px',
            color: '#64748B',
            background: '#F8FAFC',
            padding: '6px 12px',
            borderRadius: '8px',
            border: '1px solid #E2E8F0'
          }}>
            Assigned Items: <strong style={{ color: '#0F172A' }}>{pagination.total}</strong>
          </span>

          {/* Primary Business Workflow: Upload Hospital Master */}
          {onSwitchTab && (
            <button
              type="button"
              onClick={() => onSwitchTab('uploads')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '7px 14px',
                borderRadius: '6px',
                background: '#0F766E',
                color: '#FFFFFF',
                fontSize: '12px',
                fontWeight: 700,
                border: 'none',
                cursor: 'pointer',
                boxShadow: '0 1px 3px rgba(15,118,110,0.2)'
              }}
            >
              <LucideIcon name="upload-cloud" size={14} />
              Upload Hospital Master
            </button>
          )}

          {/* Secondary / Fallback: Manual Single Item Assignment */}
          <button
            type="button"
            onClick={handleOpenAssignModal}
            disabled={!selectedTenantId}
            title={!selectedTenantId ? 'Select a hospital first' : 'Manually assign an individual item'}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '5px',
              padding: '6px 12px',
              borderRadius: '6px',
              background: '#FFFFFF',
              color: selectedTenantId ? '#475569' : '#94A3B8',
              fontSize: '11.5px',
              fontWeight: 650,
              border: '1px solid #CBD5E1',
              cursor: selectedTenantId ? 'pointer' : 'not-allowed'
            }}
          >
            <LucideIcon name="plus" size={13} />
            Manual Item Assignment
          </button>
        </div>
      </div>

      {/* Success Notification */}
      {successMessage && (
        <div style={{
          background: '#ECFDF5',
          border: '1px solid #A7F3D0',
          borderRadius: '8px',
          padding: '10px 16px',
          color: '#065F46',
          fontSize: '13px',
          fontWeight: 600,
          display: 'flex',
          alignItems: 'center',
          gap: '8px'
        }}>
          <LucideIcon name="check-circle-2" size={16} color="#059669" />
          <span>{successMessage}</span>
        </div>
      )}

      {/* Error Notification */}
      {errorMessage && (
        <div style={{
          background: '#FEF2F2',
          border: '1px solid #FCA5A5',
          borderRadius: '8px',
          padding: '10px 16px',
          color: '#991B1B',
          fontSize: '13px',
          fontWeight: 600
        }}>
          {errorMessage}
        </div>
      )}

      {/* ── 2. FILTER CONTROLS BAR ── */}
      <div style={{
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        gap: '10px',
        padding: '12px 16px',
        background: '#FFFFFF',
        borderRadius: '10px',
        border: '1px solid #E2E8F0'
      }}>
        {/* Category Filter */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ fontSize: '12px', fontWeight: 600, color: '#64748B' }}>Category:</span>
          <select
            value={categoryFilter}
            onChange={(e) => {
              setCategoryFilter(e.target.value);
              setDepartmentFilter('all');
              setPage(1);
            }}
            style={{
              padding: '6px 10px',
              borderRadius: '6px',
              border: '1px solid #CBD5E1',
              fontSize: '12px',
              color: '#334155',
              background: '#FFFFFF'
            }}
          >
            <option value="all">All Categories</option>
            {categories.map((c) => (
              <option key={c.name} value={c.name}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        {/* Department Filter */}
        {departmentsForFilter.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ fontSize: '12px', fontWeight: 600, color: '#64748B' }}>Department:</span>
            <select
              value={departmentFilter}
              onChange={(e) => {
                setDepartmentFilter(e.target.value);
                setPage(1);
              }}
              style={{
                padding: '6px 10px',
                borderRadius: '6px',
                border: '1px solid #CBD5E1',
                fontSize: '12px',
                color: '#334155',
                background: '#FFFFFF'
              }}
            >
              <option value="all">All Departments</option>
              {departmentsForFilter.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Status Filter */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ fontSize: '12px', fontWeight: 600, color: '#64748B' }}>Status:</span>
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPage(1);
            }}
            style={{
              padding: '6px 10px',
              borderRadius: '6px',
              border: '1px solid #CBD5E1',
              fontSize: '12px',
              color: '#334155',
              background: '#FFFFFF'
            }}
          >
            <option value="all">All Statuses</option>
            <option value="Active">Active Only</option>
            <option value="Inactive">Inactive Only</option>
          </select>
        </div>

        {/* Refresh */}
        <button
          type="button"
          onClick={fetchConfigs}
          disabled={loadingConfigs}
          title="Refresh List"
          style={{
            padding: '6px 10px',
            borderRadius: '6px',
            border: '1px solid #CBD5E1',
            background: '#F8FAFC',
            color: '#475569',
            cursor: 'pointer',
            marginLeft: 'auto'
          }}
        >
          <LucideIcon name="refresh-cw" size={14} className={loadingConfigs ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* ── 3. HOSPITAL ASSIGNED CATALOG TABLE ── */}
      <div style={{
        background: '#FFFFFF',
        borderRadius: '12px',
        border: '1px solid #E2E8F0',
        overflow: 'hidden',
        boxShadow: '0 1px 3px rgba(0,0,0,0.03)'
      }}>
        <div style={{ overflowX: 'auto', width: '100%' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
            <thead>
              <tr style={{ background: '#F8FAFC', borderBottom: '1px solid #E2E8F0' }}>
                <th style={{ padding: '12px 16px', fontWeight: 700, color: '#475569' }}>Canonical Code</th>
                <th style={{ padding: '12px 16px', fontWeight: 700, color: '#475569', minWidth: '200px' }}>Item Name</th>
                <th style={{ padding: '12px 16px', fontWeight: 700, color: '#475569' }}>Category</th>
                <th style={{ padding: '12px 16px', fontWeight: 700, color: '#475569' }}>Department</th>
                <th style={{ padding: '12px 16px', fontWeight: 700, color: '#7C3AED', textAlign: 'right' }}>Hospital MRP</th>
                <th style={{ padding: '12px 16px', fontWeight: 700, color: '#7C3AED', textAlign: 'right' }}>Hospital Net Rate</th>
                <th style={{ padding: '12px 16px', fontWeight: 700, color: '#475569', textAlign: 'right' }}>Cost</th>
                <th style={{ padding: '12px 16px', fontWeight: 700, color: '#475569', textAlign: 'center' }}>Local Status</th>
                <th style={{ padding: '12px 16px', fontWeight: 700, color: '#475569', textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loadingConfigs && configs.length === 0 ? (
                <tr>
                  <td colSpan={9} style={{ padding: '40px', textAlign: 'center', color: '#64748B' }}>
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                      <LucideIcon name="loader-2" size={18} className="animate-spin" />
                      <span>Loading hospital configurations...</span>
                    </div>
                  </td>
                </tr>
              ) : configs.length === 0 ? (
                <tr>
                  <td colSpan={9} style={{ padding: '48px 16px', textAlign: 'center' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', color: '#64748B' }}>
                      <LucideIcon name="package-open" size={36} color="#CBD5E1" />
                      <div style={{ fontSize: '15px', fontWeight: 700, color: '#334155' }}>
                        No items assigned to {selectedHospitalObj?.name || selectedTenantId}
                      </div>
                      <div style={{ fontSize: '13px', maxWidth: '420px' }}>
                        This hospital currently has no active master item assignments. Click below to adopt and price canonical global items.
                      </div>
                      <button
                        type="button"
                        onClick={handleOpenAssignModal}
                        style={{
                          marginTop: '8px',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '6px',
                          padding: '8px 16px',
                          borderRadius: '6px',
                          background: '#7C3AED',
                          color: '#FFFFFF',
                          fontSize: '12px',
                          fontWeight: 700,
                          border: 'none',
                          cursor: 'pointer'
                        }}
                      >
                        <LucideIcon name="plus" size={14} />
                        Assign Global Item
                      </button>
                    </div>
                  </td>
                </tr>
              ) : (
                configs.map((cfg) => {
                  const m = cfg.masterItemId || {};
                  const isActive = (cfg.status || 'Active').toLowerCase() === 'active';

                  return (
                    <tr
                      key={cfg._id}
                      style={{ borderBottom: '1px solid #F1F5F9', transition: 'background 0.1s ease' }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = '#F8FAFC')}
                      onMouseLeave={(e) => (e.currentTarget.style.background = '#FFFFFF')}
                    >
                      {/* Canonical Code */}
                      <td style={{ padding: '12px 16px', whiteSpace: 'nowrap' }}>
                        <span style={{
                          fontFamily: 'monospace',
                          fontWeight: 700,
                          fontSize: '12px',
                          color: '#2563EB',
                          background: '#EFF6FF',
                          padding: '3px 8px',
                          borderRadius: '6px'
                        }}>
                          {m.itemCode || '—'}
                        </span>
                      </td>

                      {/* Item Name */}
                      <td style={{ padding: '12px 16px' }}>
                        <div style={{ fontWeight: 600, color: '#0F172A' }}>
                          {m.itemName || m.genericName || m.brandName || '—'}
                        </div>
                        {m.brandName && m.brandName !== m.itemName && (
                          <div style={{ fontSize: '11px', color: '#64748B' }}>Brand: {m.brandName}</div>
                        )}
                      </td>

                      {/* Category */}
                      <td style={{ padding: '12px 16px', color: '#475569' }}>
                        {cfg.category || m.category || '—'}
                      </td>

                      {/* Department */}
                      <td style={{ padding: '12px 16px', color: '#475569' }}>
                        {cfg.department || m.department || '—'}
                      </td>

                      {/* Hospital MRP */}
                      <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 700, color: '#7C3AED' }}>
                        ₹{Number(cfg.mrp || 0).toFixed(2)}
                      </td>

                      {/* Hospital Net Rate */}
                      <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 700, color: '#059669' }}>
                        ₹{Number(cfg.netRate || 0).toFixed(2)}
                      </td>

                      {/* Cost */}
                      <td style={{ padding: '12px 16px', textAlign: 'right', color: '#64748B' }}>
                        ₹{Number(cfg.hospitalCost || 0).toFixed(2)}
                      </td>

                      {/* Local Status */}
                      <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                        <span style={{
                          fontSize: '11px',
                          fontWeight: 700,
                          padding: '3px 8px',
                          borderRadius: '12px',
                          background: isActive ? '#DCFCE7' : '#FEE2E2',
                          color: isActive ? '#166534' : '#991B1B'
                        }}>
                          {cfg.status || 'Active'}
                        </span>
                      </td>

                      {/* Actions */}
                      <td style={{ padding: '12px 16px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                          <button
                            type="button"
                            onClick={() => handleOpenEditModal(cfg)}
                            title="Edit Hospital Pricing"
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                              padding: '5px 10px',
                              borderRadius: '6px',
                              border: '1px solid #C4B5FD',
                              background: '#F5F3FF',
                              color: '#6D28D9',
                              cursor: 'pointer',
                              fontSize: '12px',
                              fontWeight: 600
                            }}
                          >
                            <LucideIcon name="edit-3" size={13} />
                            Pricing
                          </button>

                          <button
                            type="button"
                            onClick={() => handleUnassign(cfg)}
                            title="Unassign from Hospital"
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              padding: '5px 8px',
                              borderRadius: '6px',
                              border: '1px solid #FECACA',
                              background: '#FEF2F2',
                              color: '#DC2626',
                              cursor: 'pointer',
                              fontSize: '12px'
                            }}
                          >
                            <LucideIcon name="trash-2" size={13} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '12px 16px',
          background: '#F8FAFC',
          borderTop: '1px solid #E2E8F0',
          fontSize: '12px',
          color: '#64748B'
        }}>
          <div>
            Showing <strong style={{ color: '#1E293B' }}>{configs.length}</strong> of{' '}
            <strong style={{ color: '#1E293B' }}>{pagination.total}</strong> assigned items
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <button
              type="button"
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page <= 1 || loadingConfigs}
              style={{
                padding: '4px 8px',
                borderRadius: '6px',
                border: '1px solid #CBD5E1',
                background: page <= 1 ? '#F1F5F9' : '#FFFFFF',
                cursor: page <= 1 ? 'not-allowed' : 'pointer'
              }}
            >
              Prev
            </button>
            <span>Page {page} of {pagination.pages || 1}</span>
            <button
              type="button"
              onClick={() => setPage(p => Math.min(pagination.pages || 1, p + 1))}
              disabled={page >= pagination.pages || loadingConfigs}
              style={{
                padding: '4px 8px',
                borderRadius: '6px',
                border: '1px solid #CBD5E1',
                background: page >= pagination.pages ? '#F1F5F9' : '#FFFFFF',
                cursor: page >= pagination.pages ? 'not-allowed' : 'pointer'
              }}
            >
              Next
            </button>
          </div>
        </div>
      </div>

      {/* ── 4. ASSIGN GLOBAL ITEM MODAL ── */}
      {isAssignModalOpen && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(15, 23, 42, 0.6)',
          backdropFilter: 'blur(2px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          padding: '20px'
        }}>
          <div style={{
            background: '#FFFFFF',
            borderRadius: '16px',
            width: '100%',
            maxWidth: '680px',
            maxHeight: '90vh',
            display: 'flex',
            flexDirection: 'column',
            boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)',
            overflow: 'hidden',
            border: '1px solid #E2E8F0'
          }}>
            <div style={{
              padding: '18px 24px',
              borderBottom: '1px solid #E2E8F0',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              background: '#F8FAFC'
            }}>
              <div>
                <h3 style={{ fontSize: '16px', fontWeight: 800, color: '#0F172A', margin: 0 }}>
                  Assign Canonical Master Item to Hospital
                </h3>
                <p style={{ fontSize: '12px', color: '#64748B', margin: '2px 0 0 0' }}>
                  Target Hospital: <strong style={{ color: '#7C3AED' }}>{selectedHospitalObj?.name} ({selectedTenantId})</strong>
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsAssignModalOpen(false)}
                style={{ background: 'none', border: 'none', color: '#94A3B8', cursor: 'pointer' }}
              >
                <LucideIcon name="x" size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveAssign} style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
              <div style={{ padding: '20px 24px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {/* Search Canonical Items */}
                <div>
                  <label style={{ fontSize: '12px', fontWeight: 700, color: '#334155', display: 'block', marginBottom: '6px' }}>
                    1. Select Canonical Global Master Item:
                  </label>
                  <div style={{ position: 'relative', marginBottom: '8px' }}>
                    <input
                      type="text"
                      placeholder="Search unassigned canonical items by name or code..."
                      value={unassignedSearch}
                      onChange={(e) => setUnassignedSearch(e.target.value)}
                      style={{
                        width: '100%',
                        boxSizing: 'border-box',
                        padding: '8px 12px 8px 32px',
                        borderRadius: '8px',
                        border: '1px solid #CBD5E1',
                        fontSize: '13px'
                      }}
                    />
                    <span style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#94A3B8' }}>
                      <LucideIcon name="search" size={14} />
                    </span>
                  </div>

                  {/* Items List */}
                  <div style={{
                    maxHeight: '160px',
                    overflowY: 'auto',
                    border: '1px solid #E2E8F0',
                    borderRadius: '8px',
                    background: '#F8FAFC'
                  }}>
                    {loadingUnassigned ? (
                      <div style={{ padding: '16px', textAlign: 'center', fontSize: '12px', color: '#64748B' }}>
                        Loading available items...
                      </div>
                    ) : unassignedItems.length === 0 ? (
                      <div style={{ padding: '16px', textAlign: 'center', fontSize: '12px', color: '#64748B' }}>
                        No unassigned global items found matching search.
                      </div>
                    ) : (
                      unassignedItems.map((item) => {
                        const isSelected = selectedMasterItem?._id === item._id;
                        return (
                          <div
                            key={item._id}
                            onClick={() => setSelectedMasterItem(item)}
                            style={{
                              padding: '8px 12px',
                              borderBottom: '1px solid #F1F5F9',
                              cursor: 'pointer',
                              background: isSelected ? '#EFF6FF' : '#FFFFFF',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              fontSize: '12px'
                            }}
                          >
                            <div>
                              <strong style={{ color: '#2563EB', fontFamily: 'monospace', marginRight: '8px' }}>
                                {item.itemCode}
                              </strong>
                              <span style={{ fontWeight: 600, color: '#0F172A' }}>
                                {item.itemName || item.genericName}
                              </span>
                              <span style={{ color: '#64748B', marginLeft: '6px' }}>
                                ({item.category}{item.department ? ` · ${item.department}` : ''})
                              </span>
                            </div>
                            {isSelected && (
                              <LucideIcon name="check" size={14} color="#2563EB" />
                            )}
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>

                {/* Selected Item Summary Card */}
                {selectedMasterItem && (
                  <div style={{
                    background: '#EFF6FF',
                    border: '1px solid #BFDBFE',
                    borderRadius: '8px',
                    padding: '10px 14px',
                    fontSize: '12px'
                  }}>
                    <div style={{ fontWeight: 700, color: '#1E3A8A' }}>
                      Selected: [{selectedMasterItem.itemCode}] {selectedMasterItem.itemName || selectedMasterItem.genericName}
                    </div>
                    <div style={{ color: '#3B82F6', marginTop: '2px' }}>
                      Category: {selectedMasterItem.category} | Department: {selectedMasterItem.department || 'N/A'}
                    </div>
                  </div>
                )}

                {/* Hospital Pricing Fields */}
                <div>
                  <label style={{ fontSize: '12px', fontWeight: 700, color: '#334155', display: 'block', marginBottom: '8px' }}>
                    2. Configure Hospital-Specific Rates (Isolated to this Tenant):
                  </label>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
                    <div>
                      <label style={{ fontSize: '11px', fontWeight: 700, color: '#64748B', display: 'block', marginBottom: '4px' }}>
                        Hospital MRP (₹)
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        placeholder="0.00"
                        value={assignForm.mrp}
                        onChange={(e) => setAssignForm({ ...assignForm, mrp: e.target.value })}
                        style={{
                          width: '100%',
                          boxSizing: 'border-box',
                          padding: '8px 10px',
                          borderRadius: '6px',
                          border: '1px solid #CBD5E1',
                          fontSize: '13px'
                        }}
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: '11px', fontWeight: 700, color: '#64748B', display: 'block', marginBottom: '4px' }}>
                        Hospital Net Rate (₹)
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        placeholder="0.00"
                        value={assignForm.netRate}
                        onChange={(e) => setAssignForm({ ...assignForm, netRate: e.target.value })}
                        style={{
                          width: '100%',
                          boxSizing: 'border-box',
                          padding: '8px 10px',
                          borderRadius: '6px',
                          border: '1px solid #CBD5E1',
                          fontSize: '13px'
                        }}
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: '11px', fontWeight: 700, color: '#64748B', display: 'block', marginBottom: '4px' }}>
                        Hospital Cost (₹)
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        placeholder="0.00"
                        value={assignForm.hospitalCost}
                        onChange={(e) => setAssignForm({ ...assignForm, hospitalCost: e.target.value })}
                        style={{
                          width: '100%',
                          boxSizing: 'border-box',
                          padding: '8px 10px',
                          borderRadius: '6px',
                          border: '1px solid #CBD5E1',
                          fontSize: '13px'
                        }}
                      />
                    </div>
                  </div>
                </div>

                {/* Status */}
                <div>
                  <label style={{ fontSize: '11px', fontWeight: 700, color: '#64748B', display: 'block', marginBottom: '4px' }}>
                    Local Operational Status:
                  </label>
                  <select
                    value={assignForm.status}
                    onChange={(e) => setAssignForm({ ...assignForm, status: e.target.value })}
                    style={{
                      padding: '8px 10px',
                      borderRadius: '6px',
                      border: '1px solid #CBD5E1',
                      fontSize: '13px',
                      width: '100%',
                      boxSizing: 'border-box',
                      background: '#FFFFFF'
                    }}
                  >
                    <option value="Active">Active</option>
                    <option value="Inactive">Inactive</option>
                  </select>
                </div>
              </div>

              {/* Modal Footer */}
              <div style={{
                padding: '14px 24px',
                borderTop: '1px solid #E2E8F0',
                display: 'flex',
                justifyContent: 'flex-end',
                gap: '10px',
                background: '#F8FAFC'
              }}>
                <button
                  type="button"
                  onClick={() => setIsAssignModalOpen(false)}
                  style={{
                    padding: '8px 16px',
                    borderRadius: '8px',
                    border: '1px solid #CBD5E1',
                    background: '#FFFFFF',
                    fontSize: '13px',
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingAssign || !selectedMasterItem}
                  style={{
                    padding: '8px 20px',
                    borderRadius: '8px',
                    border: 'none',
                    background: '#7C3AED',
                    color: '#FFFFFF',
                    fontSize: '13px',
                    fontWeight: 700,
                    cursor: savingAssign || !selectedMasterItem ? 'not-allowed' : 'pointer'
                  }}
                >
                  {savingAssign ? 'Assigning...' : 'Confirm Assignment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── 5. EDIT PRICING MODAL ── */}
      {isEditModalOpen && editingConfig && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(15, 23, 42, 0.6)',
          backdropFilter: 'blur(2px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          padding: '20px'
        }}>
          <div style={{
            background: '#FFFFFF',
            borderRadius: '16px',
            width: '100%',
            maxWidth: '520px',
            boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)',
            overflow: 'hidden',
            border: '1px solid #E2E8F0'
          }}>
            <div style={{
              padding: '18px 24px',
              borderBottom: '1px solid #E2E8F0',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              background: '#F8FAFC'
            }}>
              <div>
                <h3 style={{ fontSize: '16px', fontWeight: 800, color: '#0F172A', margin: 0 }}>
                  Edit Hospital Pricing Overrides
                </h3>
                <p style={{ fontSize: '12px', color: '#64748B', margin: '2px 0 0 0' }}>
                  Tenant: <strong style={{ color: '#7C3AED' }}>{selectedHospitalObj?.name}</strong>
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsEditModalOpen(false)}
                style={{ background: 'none', border: 'none', color: '#94A3B8', cursor: 'pointer' }}
              >
                <LucideIcon name="x" size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveEdit} style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {/* Readonly Master Spec */}
              <div style={{
                background: '#F8FAFC',
                border: '1px solid #E2E8F0',
                borderRadius: '8px',
                padding: '10px 14px',
                fontSize: '12px'
              }}>
                <div style={{ fontWeight: 700, color: '#1E293B' }}>
                  [{editingConfig.masterItemId?.itemCode}] {editingConfig.masterItemId?.itemName || editingConfig.masterItemId?.genericName}
                </div>
                <div style={{ fontSize: '11px', color: '#64748B', marginTop: '2px' }}>
                  Canonical Master Item · Changes below are strictly isolated to this hospital
                </div>
              </div>

              {/* Price Inputs */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px' }}>
                <div>
                  <label style={{ fontSize: '11px', fontWeight: 700, color: '#334155', display: 'block', marginBottom: '4px' }}>
                    Hospital MRP (₹)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={editForm.mrp}
                    onChange={(e) => setEditForm({ ...editForm, mrp: e.target.value })}
                    style={{
                      width: '100%',
                      boxSizing: 'border-box',
                      padding: '8px 10px',
                      borderRadius: '6px',
                      border: '1px solid #CBD5E1',
                      fontSize: '13px'
                    }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: '11px', fontWeight: 700, color: '#334155', display: 'block', marginBottom: '4px' }}>
                    Hospital Net Rate (₹)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={editForm.netRate}
                    onChange={(e) => setEditForm({ ...editForm, netRate: e.target.value })}
                    style={{
                      width: '100%',
                      boxSizing: 'border-box',
                      padding: '8px 10px',
                      borderRadius: '6px',
                      border: '1px solid #CBD5E1',
                      fontSize: '13px'
                    }}
                  />
                </div>
              </div>

              <div>
                <label style={{ fontSize: '11px', fontWeight: 700, color: '#334155', display: 'block', marginBottom: '4px' }}>
                  Hospital Cost (₹)
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={editForm.hospitalCost}
                  onChange={(e) => setEditForm({ ...editForm, hospitalCost: e.target.value })}
                  style={{
                    width: '100%',
                    boxSizing: 'border-box',
                    padding: '8px 10px',
                    borderRadius: '6px',
                    border: '1px solid #CBD5E1',
                    fontSize: '13px'
                  }}
                />
              </div>

              <div>
                <label style={{ fontSize: '11px', fontWeight: 700, color: '#334155', display: 'block', marginBottom: '4px' }}>
                  Status:
                </label>
                <select
                  value={editForm.status}
                  onChange={(e) => setEditForm({ ...editForm, status: e.target.value })}
                  style={{
                    padding: '8px 10px',
                    borderRadius: '6px',
                    border: '1px solid #CBD5E1',
                    fontSize: '13px',
                    width: '100%',
                    boxSizing: 'border-box',
                    background: '#FFFFFF'
                  }}
                >
                  <option value="Active">Active</option>
                  <option value="Inactive">Inactive</option>
                </select>
              </div>

              {/* Modal Footer */}
              <div style={{
                display: 'flex',
                justifyContent: 'flex-end',
                gap: '10px',
                marginTop: '8px',
                paddingTop: '12px',
                borderTop: '1px solid #E2E8F0'
              }}>
                <button
                  type="button"
                  onClick={() => setIsEditModalOpen(false)}
                  style={{
                    padding: '8px 16px',
                    borderRadius: '8px',
                    border: '1px solid #CBD5E1',
                    background: '#FFFFFF',
                    fontSize: '13px',
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingEdit}
                  style={{
                    padding: '8px 20px',
                    borderRadius: '8px',
                    border: 'none',
                    background: '#7C3AED',
                    color: '#FFFFFF',
                    fontSize: '13px',
                    fontWeight: 700,
                    cursor: savingEdit ? 'not-allowed' : 'pointer'
                  }}
                >
                  {savingEdit ? 'Saving...' : 'Update Pricing'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
