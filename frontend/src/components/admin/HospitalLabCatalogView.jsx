import React, { useState, useEffect, useMemo } from 'react';

const DEPARTMENTS = [
  'All',
  'Biochemistry',
  'Hematology',
  'Serology',
  'Molecular Biology',
  'Immunology',
  'Histopathology',
  'Microbiology',
  'Clinical Pathology',
  'Flowcytometry',
  'Cytology',
  'Immunohistochemistry',
  'Special Biochemistry',
  'Miscellaneous'
];

export default function HospitalLabCatalogView({ api, showToast, setLoading, currentUser }) {
  const [catalog, setCatalog] = useState([]);
  const [loadingCatalog, setLoadingCatalog] = useState(false);

  // Search & Filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [departmentFilter, setDepartmentFilter] = useState('All');
  const [statusFilter, setStatusFilter] = useState('All');
  const [currentPage, setCurrentPage] = useState(1);
  const PAGE_SIZE = 10;

  // Modals state
  const [showActivateModal, setShowActivateModal] = useState(false);
  const [showEditPriceModal, setShowEditPriceModal] = useState(false);
  const [showRequestModal, setShowRequestModal] = useState(false);

  // Unassigned global tests state for Activate Modal
  const [unassignedTests, setUnassignedTests] = useState([]);
  const [loadingUnassigned, setLoadingUnassigned] = useState(false);
  const [unassignedSearch, setUnassignedSearch] = useState('');
  const [unassignedDept, setUnassignedDept] = useState('All');
  const [selectedUnassignedItem, setSelectedUnassignedItem] = useState(null);
  const [activatePrice, setActivatePrice] = useState('');

  // Edit Price modal state
  const [editingItem, setEditingItem] = useState(null);
  const [newPrice, setNewPrice] = useState('');

  // Request New Test modal state
  const [requestForm, setRequestForm] = useState({
    testName: '',
    department: 'Hematology',
    sampleType: 'Blood',
    proposedPrice: '',
    turnaroundTime: '24 Hours',
    normalRange: '',
    unit: '',
    description: ''
  });

  // Fetch hospital's configured lab tests
  const fetchCatalog = async () => {
    setLoadingCatalog(true);
    try {
      const res = await api.get('/lab-tests/all');
      setCatalog(res.data || []);
    } catch (err) {
      console.error('Error fetching hospital lab catalog:', err);
      showToast?.('Failed to fetch hospital lab test catalog.', 'error');
    } finally {
      setLoadingCatalog(false);
    }
  };

  useEffect(() => {
    fetchCatalog();
  }, []);

  // Fetch unassigned global tests when Activate modal is opened
  const fetchUnassigned = async () => {
    setLoadingUnassigned(true);
    try {
      const params = {};
      if (unassignedDept && unassignedDept !== 'All') params.department = unassignedDept;
      if (unassignedSearch.trim()) params.search = unassignedSearch.trim();
      const res = await api.get('/lab-tests/unassigned', { params });
      setUnassignedTests(res.data?.data || []);
    } catch (err) {
      console.error('Error fetching unassigned global tests:', err);
    } finally {
      setLoadingUnassigned(false);
    }
  };

  useEffect(() => {
    if (showActivateModal) {
      fetchUnassigned();
    }
  }, [showActivateModal, unassignedDept, unassignedSearch]);

  // Filtered catalog
  const filteredCatalog = useMemo(() => {
    return catalog.filter(item => {
      const q = searchQuery.trim().toLowerCase();
      const matchesSearch = !q ||
        (item.testName || '').toLowerCase().includes(q) ||
        (item.testCode || '').toLowerCase().includes(q) ||
        (item.department || '').toLowerCase().includes(q) ||
        (item.category || '').toLowerCase().includes(q);

      const itemDept = item.department || item.category || '';
      const matchesDept = departmentFilter === 'All' || itemDept.toLowerCase() === departmentFilter.toLowerCase();

      const matchesStatus = statusFilter === 'All' ||
        (statusFilter === 'Active' && item.isActive) ||
        (statusFilter === 'Inactive' && !item.isActive);

      return matchesSearch && matchesDept && matchesStatus;
    });
  }, [catalog, searchQuery, departmentFilter, statusFilter]);

  // Pagination
  const totalPages = Math.ceil(filteredCatalog.length / PAGE_SIZE) || 1;
  const safePage = Math.min(Math.max(1, currentPage), totalPages);
  const startIndex = (safePage - 1) * PAGE_SIZE;
  const endIndex = Math.min(startIndex + PAGE_SIZE, filteredCatalog.length);
  const paginatedCatalog = filteredCatalog.slice(startIndex, endIndex);

  // Stats
  const totalActivated = catalog.length;
  const activeCount = catalog.filter(t => t.isActive).length;
  const inactiveCount = catalog.filter(t => !t.isActive).length;

  // Handler: Toggle active/inactive
  const handleToggleStatus = async (item) => {
    const previous = [...catalog];
    const nextActive = !item.isActive;
    // Optimistic UI update
    setCatalog(catalog.map(t => t._id === item._id ? { ...t, isActive: nextActive, status: nextActive ? 'Active' : 'Inactive' } : t));

    try {
      await api.put(`/lab-tests/${item._id}`, { isActive: nextActive });
      showToast?.(`Test '${item.testName}' ${nextActive ? 'activated' : 'deactivated'} for booking!`, 'success');
    } catch (err) {
      setCatalog(previous);
      showToast?.('Failed to update test status.', 'error');
    }
  };

  // Handler: Activate Global Test
  const handleActivateSubmit = async (e) => {
    e.preventDefault();
    if (!selectedUnassignedItem) {
      showToast?.('Please select a laboratory test to activate.', 'error');
      return;
    }
    const priceNum = Number(activatePrice);
    if (isNaN(priceNum) || priceNum < 0) {
      showToast?.('Please enter a valid non-negative hospital price.', 'error');
      return;
    }

    try {
      setLoading?.(true);
      await api.post('/lab-tests/activate', {
        masterItemId: selectedUnassignedItem._id,
        price: priceNum,
        mrp: priceNum
      });
      showToast?.(`Activated '[${selectedUnassignedItem.itemCode}] ${selectedUnassignedItem.itemName}' at ₹${priceNum}!`, 'success');
      setShowActivateModal(false);
      setSelectedUnassignedItem(null);
      setActivatePrice('');
      fetchCatalog();
    } catch (err) {
      console.error(err);
      showToast?.(err.response?.data?.error || 'Failed to activate test.', 'error');
    } finally {
      setLoading?.(false);
    }
  };

  // Handler: Save Edited Price
  const handleEditPriceSubmit = async (e) => {
    e.preventDefault();
    const priceNum = Number(newPrice);
    if (isNaN(priceNum) || priceNum < 0) {
      showToast?.('Please enter a valid non-negative price.', 'error');
      return;
    }

    try {
      setLoading?.(true);
      await api.put(`/lab-tests/${editingItem._id}`, {
        price: priceNum,
        mrp: priceNum,
        netRate: priceNum
      });
      showToast?.(`Updated price of '${editingItem.testName}' to ₹${priceNum}!`, 'success');
      setShowEditPriceModal(false);
      setEditingItem(null);
      fetchCatalog();
    } catch (err) {
      console.error(err);
      showToast?.(err.response?.data?.error || 'Failed to update price.', 'error');
    } finally {
      setLoading?.(false);
    }
  };

  // Handler: Remove / Deactivate Test from Hospital Catalog
  const handleRemoveTest = async (item) => {
    if (!window.confirm(`Are you sure you want to remove '${item.testName}' from your hospital catalog? Clinics will no longer be able to book this test.`)) {
      return;
    }
    try {
      setLoading?.(true);
      await api.delete(`/lab-tests/${item._id}`);
      showToast?.(`Removed '${item.testName}' from hospital catalog.`, 'success');
      fetchCatalog();
    } catch (err) {
      console.error(err);
      showToast?.(err.response?.data?.error || 'Failed to remove test.', 'error');
    } finally {
      setLoading?.(false);
    }
  };

  // Handler: Submit Request for New Test
  const handleRequestSubmit = async (e) => {
    e.preventDefault();
    if (!requestForm.testName.trim()) {
      showToast?.('Please provide the proposed test name.', 'error');
      return;
    }
    try {
      setLoading?.(true);
      const res = await api.post('/lab-tests/request-new', requestForm);
      showToast?.(res.data?.message || 'New test request submitted for Super Admin review!', 'success');
      setShowRequestModal(false);
      setRequestForm({
        testName: '',
        department: 'Hematology',
        sampleType: 'Blood',
        proposedPrice: '',
        turnaroundTime: '24 Hours',
        normalRange: '',
        unit: '',
        description: ''
      });
    } catch (err) {
      console.error(err);
      showToast?.(err.response?.data?.error || 'Failed to submit test request.', 'error');
    } finally {
      setLoading?.(false);
    }
  };

  // Handler: Export Hospital Catalog to Excel
  const handleExportCatalog = () => {
    if (catalog.length === 0) {
      showToast?.('No laboratory tests configured to export.', 'error');
      return;
    }
    // Generate clean CSV/Excel download
    const headers = ['Item Code', 'Test Name', 'Category', 'Department', 'Hospital Price (INR)', 'MRP (INR)', 'Sample Type', 'Turnaround Time', 'Status'];
    const rows = catalog.map(t => [
      t.testCode || '',
      `"${(t.testName || '').replace(/"/g, '""')}"`,
      'Lab Operation',
      t.department || t.category || '',
      t.price || 0,
      t.mrp || t.price || 0,
      t.sampleType || 'Blood',
      t.turnaroundTime || '24 Hours',
      t.isActive ? 'Active' : 'Inactive'
    ]);
    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `Hospital_Lab_Test_Catalog_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast?.('Hospital Lab Test Catalog exported successfully!', 'success');
  };

  return (
    <div className="tab-content active" style={{ animation: 'slideUp 0.35s ease-out', padding: '24px' }}>
      {/* 1. Header Section */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <h2 style={{ fontSize: '21px', fontWeight: 900, color: '#0F172A', margin: 0, letterSpacing: '-0.3px' }}>
              Hospital Test Catalog
            </h2>
            <span style={{ fontSize: '11px', fontWeight: 800, color: '#059669', background: '#ECFDF5', border: '1px solid #A7F3D0', padding: '2px 8px', borderRadius: '12px' }}>
              Global Item Master Integration
            </span>
          </div>
          <p style={{ fontSize: '13px', color: '#64748B', margin: '4px 0 0 0', fontWeight: 600 }}>
            Manage your hospital's activated diagnostic tests, configure hospital-specific pricing, and activate additional tests from the Global Item Master.
          </p>
        </div>

        {/* Action Buttons */}
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={handleExportCatalog}
            style={{
              padding: '9px 15px',
              background: '#F8FAFC',
              border: '1px solid #CBD5E1',
              borderRadius: '9px',
              color: '#334155',
              fontSize: '12.5px',
              fontWeight: 750,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            Export Catalog
          </button>

          <button
            type="button"
            onClick={() => setShowRequestModal(true)}
            style={{
              padding: '9px 15px',
              background: '#F3E8FF',
              border: '1px solid #D8B4FE',
              borderRadius: '9px',
              color: '#7E22CE',
              fontSize: '12.5px',
              fontWeight: 800,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
            Request New Test
          </button>

          <button
            type="button"
            onClick={() => {
              setSelectedUnassignedItem(null);
              setActivatePrice('');
              setShowActivateModal(true);
            }}
            style={{
              padding: '9px 18px',
              background: 'linear-gradient(135deg, #2563EB 0%, #1D4ED8 100%)',
              border: 'none',
              borderRadius: '9px',
              color: '#FFFFFF',
              fontSize: '12.5px',
              fontWeight: 800,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              boxShadow: '0 2px 8px rgba(37,99,235,0.25)'
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            Activate Global Test
          </button>
        </div>
      </div>

      {/* 2. Metrics & KPI Banner */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '14px', marginBottom: '20px' }}>
        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '12px', padding: '14px 18px', boxShadow: '0 1px 3px rgba(0,0,0,0.03)' }}>
          <div style={{ fontSize: '11.5px', fontWeight: 750, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Activated Tests</div>
          <div style={{ fontSize: '22px', fontWeight: 900, color: '#0F172A', marginTop: '4px' }}>{totalActivated}</div>
          <div style={{ fontSize: '11px', color: '#94A3B8', fontWeight: 600 }}>Configured for this hospital</div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '12px', padding: '14px 18px', boxShadow: '0 1px 3px rgba(0,0,0,0.03)' }}>
          <div style={{ fontSize: '11.5px', fontWeight: 750, color: '#059669', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Active for Booking</div>
          <div style={{ fontSize: '22px', fontWeight: 900, color: '#059669', marginTop: '4px' }}>{activeCount}</div>
          <div style={{ fontSize: '11px', color: '#94A3B8', fontWeight: 600 }}>Available in receptionist dropdown</div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '12px', padding: '14px 18px', boxShadow: '0 1px 3px rgba(0,0,0,0.03)' }}>
          <div style={{ fontSize: '11.5px', fontWeight: 750, color: '#EF4444', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Inactive Tests</div>
          <div style={{ fontSize: '22px', fontWeight: 900, color: '#EF4444', marginTop: '4px' }}>{inactiveCount}</div>
          <div style={{ fontSize: '11px', color: '#94A3B8', fontWeight: 600 }}>Hidden from clinic booking</div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '12px', padding: '14px 18px', boxShadow: '0 1px 3px rgba(0,0,0,0.03)' }}>
          <div style={{ fontSize: '11.5px', fontWeight: 750, color: '#2563EB', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Global Master Source</div>
          <div style={{ fontSize: '22px', fontWeight: 900, color: '#2563EB', marginTop: '4px' }}>1,273+</div>
          <div style={{ fontSize: '11px', color: '#94A3B8', fontWeight: 600 }}>Canonical tests in Global Item Master</div>
        </div>
      </div>

      {/* 3. Search & Department Filter Bar */}
      <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '12px', padding: '14px 18px', marginBottom: '18px', display: 'flex', gap: '14px', alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: '260px', position: 'relative' }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#94A3B8" strokeWidth="2.5" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }}><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input
            type="text"
            placeholder="Search by test name, code, or department..."
            value={searchQuery}
            onChange={e => { setSearchQuery(e.target.value); setCurrentPage(1); }}
            style={{ width: '100%', height: '38px', paddingLeft: '34px', paddingRight: '12px', border: '1px solid #CBD5E1', borderRadius: '8px', fontSize: '12.5px', outline: 'none', background: '#F8FAFC' }}
          />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <label style={{ fontSize: '12px', fontWeight: 750, color: '#475569' }}>DEPARTMENT:</label>
          <select
            value={departmentFilter}
            onChange={e => { setDepartmentFilter(e.target.value); setCurrentPage(1); }}
            style={{ height: '38px', padding: '0 12px', border: '1px solid #CBD5E1', borderRadius: '8px', fontSize: '12.5px', fontWeight: 700, color: '#0F172A', background: '#F8FAFC', outline: 'none' }}
          >
            {DEPARTMENTS.map(d => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <label style={{ fontSize: '12px', fontWeight: 750, color: '#475569' }}>STATUS:</label>
          <select
            value={statusFilter}
            onChange={e => { setStatusFilter(e.target.value); setCurrentPage(1); }}
            style={{ height: '38px', padding: '0 12px', border: '1px solid #CBD5E1', borderRadius: '8px', fontSize: '12.5px', fontWeight: 700, color: '#0F172A', background: '#F8FAFC', outline: 'none' }}
          >
            <option value="All">All Statuses</option>
            <option value="Active">Active Only</option>
            <option value="Inactive">Inactive Only</option>
          </select>
        </div>
      </div>

      {/* 4. Data Table */}
      <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '12px', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.03)' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
          <thead>
            <tr style={{ background: '#F8FAFC', borderBottom: '1px solid #E2E8F0' }}>
              <th style={{ padding: '12px 16px', fontSize: '11.5px', fontWeight: 800, color: '#475569', letterSpacing: '0.04em' }}>ITEM CODE</th>
              <th style={{ padding: '12px 16px', fontSize: '11.5px', fontWeight: 800, color: '#475569', letterSpacing: '0.04em' }}>TEST NAME</th>
              <th style={{ padding: '12px 16px', fontSize: '11.5px', fontWeight: 800, color: '#475569', letterSpacing: '0.04em' }}>CATEGORY</th>
              <th style={{ padding: '12px 16px', fontSize: '11.5px', fontWeight: 800, color: '#475569', letterSpacing: '0.04em' }}>DEPARTMENT</th>
              <th style={{ padding: '12px 16px', fontSize: '11.5px', fontWeight: 800, color: '#475569', letterSpacing: '0.04em' }}>HOSPITAL PRICE</th>
              <th style={{ padding: '12px 16px', fontSize: '11.5px', fontWeight: 800, color: '#475569', letterSpacing: '0.04em' }}>MRP</th>
              <th style={{ padding: '12px 16px', fontSize: '11.5px', fontWeight: 800, color: '#475569', letterSpacing: '0.04em' }}>STATUS</th>
              <th style={{ padding: '12px 16px', fontSize: '11.5px', fontWeight: 800, color: '#475569', letterSpacing: '0.04em', textAlign: 'right' }}>ACTIONS</th>
            </tr>
          </thead>
          <tbody>
            {loadingCatalog ? (
              <tr>
                <td colSpan="8" style={{ padding: '36px', textAlign: 'center', color: '#64748B', fontWeight: 700, fontSize: '13px' }}>
                  Loading hospital test catalog...
                </td>
              </tr>
            ) : paginatedCatalog.length === 0 ? (
              <tr>
                <td colSpan="8" style={{ padding: '48px 20px', textAlign: 'center' }}>
                  <div style={{ color: '#0F172A', fontWeight: 800, fontSize: '14px', marginBottom: '4px' }}>No laboratory tests found</div>
                  <div style={{ color: '#64748B', fontSize: '12.5px' }}>
                    {catalog.length === 0
                      ? "Your hospital has not activated any tests yet. Click 'Activate Global Test' to select tests from the Global Item Master."
                      : "No tests match your current search and filter criteria."}
                  </div>
                </td>
              </tr>
            ) : (
              paginatedCatalog.map(item => (
                <tr key={item._id} style={{ borderBottom: '1px solid #F1F5F9', background: item.isActive ? 'transparent' : '#FFFBEB' }}>
                  {/* Item Code */}
                  <td style={{ padding: '12px 16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ fontFamily: 'monospace', fontSize: '12px', fontWeight: 800, color: '#0F172A', background: '#F1F5F9', padding: '2px 6px', borderRadius: '4px', border: '1px solid #E2E8F0' }}>
                        {item.testCode || '—'}
                      </span>
                    </div>
                  </td>

                  {/* Test Name */}
                  <td style={{ padding: '12px 16px' }}>
                    <strong style={{ fontSize: '13px', color: '#0F172A', display: 'block' }}>{item.testName}</strong>
                    <div style={{ display: 'flex', gap: '6px', alignItems: 'center', marginTop: '2px' }}>
                      <span style={{ fontSize: '10.5px', color: '#475569', background: '#F1F5F9', padding: '1px 5px', borderRadius: '4px' }}>
                        {item.sampleType || 'Blood'}
                      </span>
                      {item.turnaroundTime && (
                        <span style={{ fontSize: '10px', color: '#64748B' }}>· TAT: {item.turnaroundTime}</span>
                      )}
                    </div>
                  </td>

                  {/* Category */}
                  <td style={{ padding: '12px 16px' }}>
                    <span style={{ fontSize: '11px', fontWeight: 700, color: '#475569', background: '#F1F5F9', padding: '3px 7px', borderRadius: '5px' }}>
                      Lab Operation
                    </span>
                  </td>

                  {/* Department */}
                  <td style={{ padding: '12px 16px' }}>
                    <span style={{ fontSize: '11.5px', fontWeight: 750, color: '#2563EB', background: '#EFF6FF', border: '1px solid #DBEAFE', padding: '2px 8px', borderRadius: '5px' }}>
                      {item.department || item.category || 'General'}
                    </span>
                  </td>

                  {/* Hospital Price */}
                  <td style={{ padding: '12px 16px' }}>
                    <span style={{ fontSize: '14px', fontWeight: 900, color: '#059669' }}>
                      ₹{Number(item.price || item.mrp || 0).toFixed(2)}
                    </span>
                  </td>

                  {/* MRP */}
                  <td style={{ padding: '12px 16px' }}>
                    <span style={{ fontSize: '12.5px', fontWeight: 700, color: '#64748B' }}>
                      ₹{Number(item.mrp || item.price || 0).toFixed(2)}
                    </span>
                  </td>

                  {/* Status Toggle */}
                  <td style={{ padding: '12px 16px' }}>
                    <button
                      type="button"
                      onClick={() => handleToggleStatus(item)}
                      style={{
                        padding: '3px 9px',
                        borderRadius: '12px',
                        fontSize: '11px',
                        fontWeight: 800,
                        border: '1px solid',
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px',
                        background: item.isActive ? '#ECFDF5' : '#FEF2F2',
                        borderColor: item.isActive ? '#A7F3D0' : '#FECACA',
                        color: item.isActive ? '#059669' : '#DC2626'
                      }}
                    >
                      <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: item.isActive ? '#10B981' : '#EF4444' }} />
                      {item.isActive ? 'Active' : 'Inactive'}
                    </button>
                  </td>

                  {/* Actions */}
                  <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                    <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end', alignItems: 'center' }}>
                      <button
                        type="button"
                        onClick={() => {
                          setEditingItem(item);
                          setNewPrice(item.price !== undefined ? String(item.price) : '0');
                          setShowEditPriceModal(true);
                        }}
                        style={{ padding: '5px 10px', background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: '6px', color: '#2563EB', fontSize: '11.5px', fontWeight: 750, cursor: 'pointer' }}
                        title="Edit Hospital Price"
                      >
                        Edit Price
                      </button>

                      <button
                        type="button"
                        onClick={() => handleRemoveTest(item)}
                        style={{ padding: '5px 9px', background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: '6px', color: '#DC2626', fontSize: '11.5px', fontWeight: 750, cursor: 'pointer' }}
                        title="Remove from Hospital Catalog"
                      >
                        ✕
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        {/* Pagination Bar */}
        {filteredCatalog.length > 0 && (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', background: '#F8FAFC', borderTop: '1px solid #E2E8F0' }}>
            <span style={{ fontSize: '12px', color: '#64748B', fontWeight: 600 }}>
              Showing <strong style={{ color: '#0F172A' }}>{startIndex + 1}–{endIndex}</strong> of <strong style={{ color: '#0F172A' }}>{filteredCatalog.length}</strong> tests
            </span>

            <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
              <button
                type="button"
                disabled={safePage <= 1}
                onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                style={{ padding: '4px 10px', border: '1px solid #CBD5E1', borderRadius: '6px', background: '#FFFFFF', fontSize: '12px', fontWeight: 700, cursor: safePage <= 1 ? 'not-allowed' : 'pointer', opacity: safePage <= 1 ? 0.5 : 1 }}
              >
                ← Prev
              </button>

              <span style={{ fontSize: '12px', fontWeight: 800, color: '#0F172A', padding: '0 8px' }}>
                Page {safePage} of {totalPages}
              </span>

              <button
                type="button"
                disabled={safePage >= totalPages}
                onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                style={{ padding: '4px 10px', border: '1px solid #CBD5E1', borderRadius: '6px', background: '#FFFFFF', fontSize: '12px', fontWeight: 700, cursor: safePage >= totalPages ? 'not-allowed' : 'pointer', opacity: safePage >= totalPages ? 0.5 : 1 }}
              >
                Next →
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ======================================================== */}
      {/* MODAL 1: ACTIVATE GLOBAL TEST                           */}
      {/* ======================================================== */}
      {showActivateModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.45)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 99999 }}>
          <div style={{ width: '600px', maxHeight: '90vh', background: '#FFFFFF', borderRadius: '16px', padding: '24px', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.15)', border: '1px solid #E2E8F0', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 900, color: '#0F172A' }}>
                  Activate Test from Global Item Master
                </h3>
                <span style={{ fontSize: '12px', color: '#64748B', fontWeight: 600 }}>
                  Select an existing canonical test from the Global Item Master and configure your hospital price.
                </span>
              </div>
              <button onClick={() => setShowActivateModal(false)} style={{ background: 'none', border: 'none', color: '#94A3B8', cursor: 'pointer', fontSize: '18px', fontWeight: 700 }}>✕</button>
            </div>

            {/* Department & Search Filters */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '10px' }}>
              <select
                value={unassignedDept}
                onChange={e => setUnassignedDept(e.target.value)}
                style={{ height: '36px', border: '1px solid #CBD5E1', borderRadius: '8px', padding: '0 10px', fontSize: '12px', fontWeight: 700, background: '#F8FAFC', outline: 'none' }}
              >
                {DEPARTMENTS.map(d => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>

              <input
                type="text"
                placeholder="Search global test name or code..."
                value={unassignedSearch}
                onChange={e => setUnassignedSearch(e.target.value)}
                style={{ height: '36px', padding: '0 12px', border: '1px solid #CBD5E1', borderRadius: '8px', fontSize: '12px', outline: 'none', background: '#F8FAFC' }}
              />
            </div>

            {/* Unassigned tests list */}
            <div style={{ flex: 1, maxHeight: '250px', overflowY: 'auto', border: '1px solid #E2E8F0', borderRadius: '10px', background: '#F8FAFC', padding: '6px' }}>
              {loadingUnassigned ? (
                <div style={{ padding: '24px', textAlign: 'center', color: '#64748B', fontSize: '12.5px', fontWeight: 700 }}>
                  Searching Global Item Master...
                </div>
              ) : unassignedTests.length === 0 ? (
                <div style={{ padding: '24px', textAlign: 'center', color: '#94A3B8', fontSize: '12.5px', fontWeight: 650 }}>
                  No unassigned laboratory tests match this filter.
                </div>
              ) : (
                unassignedTests.map(item => {
                  const isSelected = selectedUnassignedItem?._id === item._id;
                  return (
                    <div
                      key={item._id}
                      onClick={() => {
                        setSelectedUnassignedItem(item);
                        if (!activatePrice && item.categoryData?.price) {
                          setActivatePrice(String(item.categoryData.price));
                        }
                      }}
                      style={{
                        padding: '10px 12px',
                        marginBottom: '4px',
                        background: isSelected ? '#EFF6FF' : '#FFFFFF',
                        border: isSelected ? '1.5px solid #2563EB' : '1px solid #E2E8F0',
                        borderRadius: '8px',
                        cursor: 'pointer',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center'
                      }}
                    >
                      <div>
                        <div style={{ fontSize: '13px', fontWeight: 800, color: '#0F172A' }}>{item.itemName || item.genericName}</div>
                        <div style={{ fontSize: '11px', color: '#64748B', display: 'flex', gap: '8px', marginTop: '2px' }}>
                          <span style={{ fontFamily: 'monospace', fontWeight: 750 }}>{item.itemCode}</span>
                          <span>· Dept: <strong>{item.department || item.categoryType}</strong></span>
                          <span>· Specimen: {item.sampleType || 'Blood'}</span>
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        {isSelected && (
                          <span style={{ fontSize: '11px', fontWeight: 800, color: '#2563EB', background: '#DBEAFE', padding: '2px 8px', borderRadius: '6px' }}>
                            ✓ Selected
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Selected item configuration */}
            {selectedUnassignedItem && (
              <form onSubmit={handleActivateSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '12px', borderTop: '1px solid #E2E8F0', paddingTop: '12px' }}>
                <div style={{ background: '#F1F5F9', padding: '10px 14px', borderRadius: '8px' }}>
                  <div style={{ fontSize: '11.5px', color: '#475569', fontWeight: 700 }}>SELECTED TEST:</div>
                  <strong style={{ fontSize: '13.5px', color: '#0F172A' }}>
                    [{selectedUnassignedItem.itemCode}] {selectedUnassignedItem.itemName}
                  </strong>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <label style={{ fontSize: '12.5px', fontWeight: 800, color: '#1E293B' }}>
                    Hospital Tariff Price (₹) <span style={{ color: '#EF4444' }}>*</span>
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    required
                    placeholder="e.g. 350"
                    value={activatePrice}
                    onChange={e => setActivatePrice(e.target.value)}
                    style={{ flex: 1, height: '38px', padding: '0 12px', border: '1.5px solid #2563EB', borderRadius: '8px', fontSize: '14px', fontWeight: 800, color: '#0F172A', outline: 'none' }}
                  />
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '8px' }}>
                  <button
                    type="button"
                    onClick={() => setShowActivateModal(false)}
                    style={{ padding: '8px 16px', background: '#F1F5F9', border: '1px solid #CBD5E1', borderRadius: '8px', color: '#475569', fontSize: '12.5px', fontWeight: 700, cursor: 'pointer' }}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    style={{ padding: '8px 20px', background: '#2563EB', border: 'none', borderRadius: '8px', color: '#FFFFFF', fontSize: '12.5px', fontWeight: 800, cursor: 'pointer' }}
                  >
                    Activate for Hospital
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* MODAL 2: EDIT HOSPITAL PRICE                            */}
      {/* ======================================================== */}
      {showEditPriceModal && editingItem && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.45)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 99999 }}>
          <div style={{ width: '440px', background: '#FFFFFF', borderRadius: '16px', padding: '24px', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.15)', border: '1px solid #E2E8F0' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '17px', fontWeight: 900, color: '#0F172A' }}>
                  Edit Hospital Test Price
                </h3>
                <span style={{ fontSize: '12px', color: '#64748B' }}>Update hospital billing price without altering global master data</span>
              </div>
              <button onClick={() => setShowEditPriceModal(false)} style={{ background: 'none', border: 'none', color: '#94A3B8', cursor: 'pointer', fontSize: '18px', fontWeight: 700 }}>✕</button>
            </div>

            <form onSubmit={handleEditPriceSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', padding: '12px', borderRadius: '10px' }}>
                <div style={{ fontSize: '11px', color: '#64748B', fontWeight: 700 }}>TEST INFORMATION</div>
                <strong style={{ fontSize: '13.5px', color: '#0F172A', display: 'block', marginTop: '2px' }}>
                  {editingItem.testName}
                </strong>
                <div style={{ fontSize: '11.5px', color: '#475569', marginTop: '2px' }}>
                  Code: <strong>{editingItem.testCode}</strong> · Dept: <strong>{editingItem.department}</strong>
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 800, color: '#1E293B', marginBottom: '6px' }}>
                  Hospital Tariff Price (₹) <span style={{ color: '#EF4444' }}>*</span>
                </label>
                <input
                  type="number"
                  min="0"
                  step="any"
                  required
                  value={newPrice}
                  onChange={e => setNewPrice(e.target.value)}
                  style={{ width: '100%', height: '40px', padding: '0 12px', border: '1.5px solid #2563EB', borderRadius: '8px', fontSize: '15px', fontWeight: 800, color: '#0F172A', outline: 'none' }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
                <button
                  type="button"
                  onClick={() => setShowEditPriceModal(false)}
                  style={{ padding: '8px 16px', background: '#F1F5F9', border: '1px solid #CBD5E1', borderRadius: '8px', color: '#475569', fontSize: '12.5px', fontWeight: 700, cursor: 'pointer' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  style={{ padding: '8px 20px', background: '#059669', border: 'none', borderRadius: '8px', color: '#FFFFFF', fontSize: '12.5px', fontWeight: 800, cursor: 'pointer' }}
                >
                  Save Hospital Price
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* MODAL 3: REQUEST NEW TEST TO SUPER ADMIN                */}
      {/* ======================================================== */}
      {showRequestModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.45)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 99999 }}>
          <div style={{ width: '540px', background: '#FFFFFF', borderRadius: '16px', padding: '24px', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.15)', border: '1px solid #E2E8F0' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 900, color: '#0F172A' }}>
                  Request New Laboratory Test
                </h3>
                <span style={{ fontSize: '12px', color: '#64748B' }}>
                  Submit an Item Request for a new diagnostic test to be reviewed and added to the Global Item Master.
                </span>
              </div>
              <button onClick={() => setShowRequestModal(false)} style={{ background: 'none', border: 'none', color: '#94A3B8', cursor: 'pointer', fontSize: '18px', fontWeight: 700 }}>✕</button>
            </div>

            <form onSubmit={handleRequestSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 750, color: '#334155', marginBottom: '4px' }}>
                  Proposed Test Name <span style={{ color: '#EF4444' }}>*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. D-Dimer Quantitative Assay"
                  value={requestForm.testName}
                  onChange={e => setRequestForm({ ...requestForm, testName: e.target.value })}
                  style={{ width: '100%', height: '36px', padding: '0 10px', border: '1px solid #CBD5E1', borderRadius: '8px', fontSize: '13px', outline: 'none' }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 750, color: '#334155', marginBottom: '4px' }}>
                    Department <span style={{ color: '#EF4444' }}>*</span>
                  </label>
                  <select
                    value={requestForm.department}
                    onChange={e => setRequestForm({ ...requestForm, department: e.target.value })}
                    style={{ width: '100%', height: '36px', padding: '0 10px', border: '1px solid #CBD5E1', borderRadius: '8px', fontSize: '12.5px', fontWeight: 700, outline: 'none' }}
                  >
                    {DEPARTMENTS.filter(d => d !== 'All').map(d => (
                      <option key={d} value={d}>{d}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 750, color: '#334155', marginBottom: '4px' }}>
                    Sample / Specimen
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Plasma (Citrate), Blood"
                    value={requestForm.sampleType}
                    onChange={e => setRequestForm({ ...requestForm, sampleType: e.target.value })}
                    style={{ width: '100%', height: '36px', padding: '0 10px', border: '1px solid #CBD5E1', borderRadius: '8px', fontSize: '13px', outline: 'none' }}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 750, color: '#334155', marginBottom: '4px' }}>
                    Proposed Hospital Price (₹)
                  </label>
                  <input
                    type="number"
                    min="0"
                    placeholder="e.g. 650"
                    value={requestForm.proposedPrice}
                    onChange={e => setRequestForm({ ...requestForm, proposedPrice: e.target.value })}
                    style={{ width: '100%', height: '36px', padding: '0 10px', border: '1px solid #CBD5E1', borderRadius: '8px', fontSize: '13px', outline: 'none' }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 750, color: '#334155', marginBottom: '4px' }}>
                    Turnaround Time (TAT)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. 12 Hours, 24 Hours"
                    value={requestForm.turnaroundTime}
                    onChange={e => setRequestForm({ ...requestForm, turnaroundTime: e.target.value })}
                    style={{ width: '100%', height: '36px', padding: '0 10px', border: '1px solid #CBD5E1', borderRadius: '8px', fontSize: '13px', outline: 'none' }}
                  />
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 750, color: '#334155', marginBottom: '4px' }}>
                  Clinical Description / Justification
                </label>
                <textarea
                  rows="2"
                  placeholder="Clinical reason or diagnostic indications..."
                  value={requestForm.description}
                  onChange={e => setRequestForm({ ...requestForm, description: e.target.value })}
                  style={{ width: '100%', padding: '8px 10px', border: '1px solid #CBD5E1', borderRadius: '8px', fontSize: '12.5px', outline: 'none', resize: 'vertical' }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
                <button
                  type="button"
                  onClick={() => setShowRequestModal(false)}
                  style={{ padding: '8px 16px', background: '#F1F5F9', border: '1px solid #CBD5E1', borderRadius: '8px', color: '#475569', fontSize: '12.5px', fontWeight: 700, cursor: 'pointer' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  style={{ padding: '8px 20px', background: '#7E22CE', border: 'none', borderRadius: '8px', color: '#FFFFFF', fontSize: '12.5px', fontWeight: 800, cursor: 'pointer' }}
                >
                  Submit Item Request
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
