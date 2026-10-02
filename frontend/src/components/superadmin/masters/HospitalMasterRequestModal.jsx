import React, { useState, useEffect, useMemo } from 'react';
import * as Icons from 'lucide-react';
import axios from 'axios';
import {
  MASTER_SCHEMA_REGISTRY,
  getAllCategories,
  getCategoryConfig
} from '../../../config/masterSchemaRegistry';
import FieldRenderer from './FieldRenderer';

const LucideIcon = ({ name, ...props }) => {
  if (!name) return <Icons.HelpCircle {...props} />;
  const camelName = name
    .split('-')
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join('');
  const IconComponent = Icons[camelName] || Icons.HelpCircle;
  return <IconComponent {...props} />;
};

export default function HospitalMasterRequestModal({
  isOpen,
  onClose,
  tenantId = 'city_general',
  hospitalName = '',
  onSuccess
}) {
  const [activeTab, setActiveTab] = useState('pathA'); // 'pathA' (Assign Existing) | 'pathB' (Propose New)

  const categories = useMemo(() => {
    return getAllCategories().filter(c => c.status !== 'SOURCE-CONFIRMATION-REQUIRED');
  }, []);

  // Path A state
  const [selectedCategoryA, setSelectedCategoryA] = useState('Pharmacy');
  const [selectedDepartmentA, setSelectedDepartmentA] = useState('Medicine');
  const [unassignedItems, setUnassignedItems] = useState([]);
  const [loadingUnassigned, setLoadingUnassigned] = useState(false);
  const [searchQueryA, setSearchQueryA] = useState('');
  const [selectedMasterItem, setSelectedMasterItem] = useState(null);
  const [priceA, setPriceA] = useState({ mrp: '', netRate: '', hospitalCost: '' });
  const [reasonA, setReasonA] = useState('');
  const [duplicateWarningA, setDuplicateWarningA] = useState(null);

  // Path B state
  const [selectedCategoryB, setSelectedCategoryB] = useState('Pharmacy');
  const [selectedDepartmentB, setSelectedDepartmentB] = useState('Medicine');
  const [formDataB, setFormDataB] = useState({});
  const [priceB, setPriceB] = useState({ mrp: '', netRate: '', hospitalCost: '' });
  const [reasonB, setReasonB] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Department sync for Path A
  useEffect(() => {
    const config = getCategoryConfig(selectedCategoryA);
    if (config?.hasDepartment) {
      const depts = Object.keys(config.departments || {});
      setSelectedDepartmentA(depts[0] || '');
    } else {
      setSelectedDepartmentA('');
    }
    setSelectedMasterItem(null);
  }, [selectedCategoryA]);

  // Department sync for Path B
  useEffect(() => {
    const config = getCategoryConfig(selectedCategoryB);
    if (config?.hasDepartment) {
      const depts = Object.keys(config.departments || {});
      setSelectedDepartmentB(depts[0] || '');
    } else {
      setSelectedDepartmentB('');
    }
    setFormDataB({});
  }, [selectedCategoryB]);

  // Fetch unassigned items for Path A
  useEffect(() => {
    if (!isOpen || activeTab !== 'pathA' || !tenantId) return;

    let isMounted = true;
    const fetchUnassigned = async () => {
      setLoadingUnassigned(true);
      try {
        const token = localStorage.getItem('token');
        const res = await axios.get('/api/superadmin/masters/unassigned-global-items', {
          headers: { Authorization: `Bearer ${token}` },
          params: {
            tenantId,
            category: selectedCategoryA,
            department: selectedDepartmentA || undefined,
            search: searchQueryA || undefined
          }
        });
        if (isMounted && res.data.success) {
          setUnassignedItems(res.data.data || []);
        }
      } catch (err) {
        console.error('Error fetching unassigned items:', err);
      } finally {
        if (isMounted) setLoadingUnassigned(false);
      }
    };

    fetchUnassigned();
    return () => { isMounted = false; };
  }, [isOpen, activeTab, tenantId, selectedCategoryA, selectedDepartmentA, searchQueryA]);

  // Check duplicate for selected master item
  useEffect(() => {
    if (!selectedMasterItem) {
      setDuplicateWarningA(null);
      return;
    }

    let isMounted = true;
    const checkDup = async () => {
      try {
        const token = localStorage.getItem('token');
        const res = await axios.get('/api/item-requests/check-duplicate', {
          headers: { Authorization: `Bearer ${token}` },
          params: {
            tenantId,
            masterItemId: selectedMasterItem._id
          }
        });
        if (isMounted && res.data.success) {
          if (res.data.alreadyConfigured) {
            setDuplicateWarningA('This item is already configured in your hospital catalog.');
          } else if (res.data.pendingRequest) {
            setDuplicateWarningA(`An active request (${res.data.pendingRequest.requestNo}) is already pending review.`);
          } else {
            setDuplicateWarningA(null);
          }
        }
      } catch (_) {}
    };

    checkDup();
    return () => { isMounted = false; };
  }, [selectedMasterItem, tenantId]);

  // Form field change handler for Path B
  const handleFieldChangeB = (fieldKey, value) => {
    setFormDataB(prev => ({
      ...prev,
      [fieldKey]: value
    }));
  };

  // Submit Path A
  const handleSubmitPathA = async (e) => {
    e.preventDefault();
    if (!selectedMasterItem) {
      setErrorMsg('Please select a canonical global item to assign.');
      return;
    }
    if (duplicateWarningA) {
      setErrorMsg(duplicateWarningA);
      return;
    }

    setSubmitting(true);
    setErrorMsg('');
    try {
      const token = localStorage.getItem('token');
      const res = await axios.post('/api/item-requests', {
        requestType: 'ASSIGN_EXISTING_GLOBAL_ITEM',
        masterItemId: selectedMasterItem._id,
        category: selectedCategoryA,
        department: selectedDepartmentA,
        requestedMrp: Number(priceA.mrp) || 0,
        requestedNetRate: Number(priceA.netRate) || 0,
        requestedHospitalCost: Number(priceA.hospitalCost) || 0,
        reason: reasonA,
        hospitalName: hospitalName || tenantId
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (res.data.success) {
        setSuccessMsg(`Path A Request submitted! Request No: ${res.data.data.requestNo}`);
        setTimeout(() => {
          if (onSuccess) onSuccess(res.data.data);
          onClose();
        }, 1500);
      }
    } catch (err) {
      setErrorMsg(err.response?.data?.error || err.message || 'Submission failed');
    } finally {
      setSubmitting(false);
    }
  };

  // Submit Path B
  const handleSubmitPathB = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setErrorMsg('');
    try {
      const token = localStorage.getItem('token');
      const res = await axios.post('/api/item-requests', {
        requestType: 'NEW_GLOBAL_ITEM',
        category: selectedCategoryB,
        department: selectedDepartmentB,
        categoryData: formDataB,
        proposedItem: {
          itemName: formDataB.itemName || formDataB.genericName || formDataB.doctorsName || 'Proposed Master Item',
          genericName: formDataB.genericName || formDataB.itemName || '',
          brandName: formDataB.brandName || '',
          categoryType: selectedCategoryB,
          departmentType: selectedDepartmentB,
          ...formDataB
        },
        requestedMrp: Number(priceB.mrp) || 0,
        requestedNetRate: Number(priceB.netRate) || 0,
        requestedHospitalCost: Number(priceB.hospitalCost) || 0,
        reason: reasonB,
        hospitalName: hospitalName || tenantId
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (res.data.success) {
        setSuccessMsg(`Path B Request submitted! Request No: ${res.data.data.requestNo}`);
        setTimeout(() => {
          if (onSuccess) onSuccess(res.data.data);
          onClose();
        }, 1500);
      }
    } catch (err) {
      setErrorMsg(err.response?.data?.error || err.message || 'Submission failed');
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  const currentCatConfigB = getCategoryConfig(selectedCategoryB);
  const fieldsB = currentCatConfigB?.sharedFields || [];

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      zIndex: 9999,
      background: 'rgba(15, 23, 42, 0.65)',
      backdropFilter: 'blur(4px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '20px'
    }}>
      <div style={{
        background: '#FFFFFF',
        borderRadius: '16px',
        width: '100%',
        maxWidth: '920px',
        maxHeight: '90vh',
        display: 'flex',
        flexDirection: 'column',
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
        overflow: 'hidden'
      }}>
        {/* Header */}
        <div style={{
          padding: '20px 24px',
          borderBottom: '1px solid #E2E8F0',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          background: '#F8FAFC'
        }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div style={{
                width: '32px',
                height: '32px',
                borderRadius: '8px',
                background: '#DBEAFE',
                color: '#1D4ED8',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                <LucideIcon name="file-plus" size={18} />
              </div>
              <h2 style={{ fontSize: '18px', fontWeight: 800, color: '#0F172A', margin: 0 }}>
                Hospital Master Request
              </h2>
            </div>
            <p style={{ fontSize: '12px', color: '#64748B', margin: '4px 0 0 0' }}>
              Request item configuration for hospital: <strong>{hospitalName || tenantId}</strong> ({tenantId})
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#94A3B8',
              cursor: 'pointer',
              padding: '6px'
            }}
          >
            <LucideIcon name="x" size={20} />
          </button>
        </div>

        {/* Tab Selection */}
        <div style={{
          display: 'flex',
          borderBottom: '1px solid #E2E8F0',
          background: '#F1F5F9',
          padding: '4px 24px 0 24px',
          gap: '8px'
        }}>
          <button
            type="button"
            onClick={() => setActiveTab('pathA')}
            style={{
              padding: '10px 18px',
              borderTopLeftRadius: '8px',
              borderTopRightRadius: '8px',
              border: 'none',
              background: activeTab === 'pathA' ? '#FFFFFF' : 'transparent',
              color: activeTab === 'pathA' ? '#2563EB' : '#64748B',
              fontWeight: 700,
              fontSize: '13px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              boxShadow: activeTab === 'pathA' ? '0 -2px 4px rgba(0,0,0,0.03)' : 'none'
            }}
          >
            <LucideIcon name="link" size={16} />
            Path A: Request Existing Global Master
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('pathB')}
            style={{
              padding: '10px 18px',
              borderTopLeftRadius: '8px',
              borderTopRightRadius: '8px',
              border: 'none',
              background: activeTab === 'pathB' ? '#FFFFFF' : 'transparent',
              color: activeTab === 'pathB' ? '#2563EB' : '#64748B',
              fontWeight: 700,
              fontSize: '13px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              boxShadow: activeTab === 'pathB' ? '0 -2px 4px rgba(0,0,0,0.03)' : 'none'
            }}
          >
            <LucideIcon name="plus-circle" size={16} />
            Path B: Propose New Master Item
          </button>
        </div>

        {/* Body content */}
        <div style={{ padding: '24px', overflowY: 'auto', flex: 1 }}>
          {errorMsg && (
            <div style={{
              background: '#FEE2E2',
              color: '#991B1B',
              padding: '12px 16px',
              borderRadius: '8px',
              fontSize: '13px',
              fontWeight: 600,
              marginBottom: '16px'
            }}>
              {errorMsg}
            </div>
          )}
          {successMsg && (
            <div style={{
              background: '#DCFCE7',
              color: '#166534',
              padding: '12px 16px',
              borderRadius: '8px',
              fontSize: '13px',
              fontWeight: 600,
              marginBottom: '16px'
            }}>
              {successMsg}
            </div>
          )}

          {/* ────────────────── PATH A: ASSIGN EXISTING ────────────────── */}
          {activeTab === 'pathA' && (
            <form onSubmit={handleSubmitPathA} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div style={{
                background: '#EFF6FF',
                border: '1px solid #BFDBFE',
                borderRadius: '8px',
                padding: '12px 16px',
                fontSize: '12px',
                color: '#1E40AF',
                lineHeight: '1.5'
              }}>
                <strong>Path A Workflow:</strong> Search canonical items in the Global Catalog. On SuperAdmin approval, this item will be activated for your hospital with your requested local commercial pricing. Global master attributes remain immutable.
              </div>

              {/* Category & Department selectors */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '6px' }}>
                    Category
                  </label>
                  <select
                    value={selectedCategoryA}
                    onChange={(e) => setSelectedCategoryA(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      borderRadius: '8px',
                      border: '1px solid #CBD5E1',
                      fontSize: '13px',
                      background: '#FFFFFF'
                    }}
                  >
                    {categories.map(c => (
                      <option key={c.name} value={c.name}>{c.name}</option>
                    ))}
                  </select>
                </div>

                {getCategoryConfig(selectedCategoryA)?.hasDepartment && (
                  <div>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '6px' }}>
                      Department
                    </label>
                    <select
                      value={selectedDepartmentA}
                      onChange={(e) => setSelectedDepartmentA(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '8px 12px',
                        borderRadius: '8px',
                        border: '1px solid #CBD5E1',
                        fontSize: '13px',
                        background: '#FFFFFF'
                      }}
                    >
                      {Object.keys(getCategoryConfig(selectedCategoryA)?.departments || {}).map(d => (
                        <option key={d} value={d}>{d}</option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              {/* Master Item Search & Selection */}
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '6px' }}>
                  Search Global Catalog Items
                </label>
                <input
                  type="text"
                  placeholder="Filter by Item Code, Name, or Generic Name..."
                  value={searchQueryA}
                  onChange={(e) => setSearchQueryA(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: '8px',
                    border: '1px solid #CBD5E1',
                    fontSize: '13px',
                    marginBottom: '10px'
                  }}
                />

                <div style={{
                  border: '1px solid #E2E8F0',
                  borderRadius: '8px',
                  maxHeight: '180px',
                  overflowY: 'auto',
                  background: '#F8FAFC'
                }}>
                  {loadingUnassigned ? (
                    <div style={{ padding: '16px', textAlign: 'center', fontSize: '12px', color: '#64748B' }}>
                      Loading eligible global items...
                    </div>
                  ) : unassignedItems.length === 0 ? (
                    <div style={{ padding: '16px', textAlign: 'center', fontSize: '12px', color: '#94A3B8' }}>
                      No unassigned items found for this category/search. Try Path B to propose a new item.
                    </div>
                  ) : (
                    unassignedItems.map(item => {
                      const isSelected = selectedMasterItem?._id === item._id;
                      return (
                        <div
                          key={item._id}
                          onClick={() => setSelectedMasterItem(item)}
                          style={{
                            padding: '10px 14px',
                            borderBottom: '1px solid #F1F5F9',
                            cursor: 'pointer',
                            background: isSelected ? '#EFF6FF' : '#FFFFFF',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center'
                          }}
                        >
                          <div>
                            <div style={{ fontSize: '13px', fontWeight: 700, color: isSelected ? '#1E40AF' : '#1E293B' }}>
                              <span style={{ fontFamily: 'monospace', color: '#2563EB', marginRight: '8px' }}>
                                [{item.itemCode}]
                              </span>
                              {item.itemName || item.genericName}
                            </div>
                            <div style={{ fontSize: '11px', color: '#64748B', marginTop: '2px' }}>
                              {item.category} {item.department ? `· ${item.department}` : ''} {item.manufacturer ? `· ${item.manufacturer}` : ''}
                            </div>
                          </div>
                          {isSelected && (
                            <span style={{ fontSize: '11px', fontWeight: 800, color: '#2563EB', background: '#DBEAFE', padding: '2px 8px', borderRadius: '4px' }}>
                              Selected
                            </span>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              {duplicateWarningA && (
                <div style={{
                  background: '#FEF3C7',
                  color: '#92400E',
                  padding: '10px 14px',
                  borderRadius: '8px',
                  fontSize: '12px',
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}>
                  <LucideIcon name="alert-triangle" size={16} />
                  {duplicateWarningA}
                </div>
              )}

              {/* Read-only preview of selected item */}
              {selectedMasterItem && (
                <div style={{
                  background: '#F1F5F9',
                  borderRadius: '8px',
                  padding: '14px',
                  border: '1px solid #CBD5E1'
                }}>
                  <div style={{ fontSize: '12px', fontWeight: 800, color: '#334155', marginBottom: '8px', textTransform: 'uppercase' }}>
                    Canonical Global Specifications (Read-Only)
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px', fontSize: '12px' }}>
                    <div>
                      <span style={{ color: '#64748B' }}>Code:</span> <strong>{selectedMasterItem.itemCode}</strong>
                    </div>
                    <div>
                      <span style={{ color: '#64748B' }}>Purchased Unit:</span> <strong>{selectedMasterItem.purchasedUnit || 'Unit'}</strong>
                    </div>
                    <div>
                      <span style={{ color: '#64748B' }}>Consumption:</span> <strong>{selectedMasterItem.consumptionUnit || 'Unit'}</strong>
                    </div>
                    <div>
                      <span style={{ color: '#64748B' }}>Converter:</span> <strong>{selectedMasterItem.converterFactor || 1}</strong>
                    </div>
                  </div>
                </div>
              )}

              {/* Requested Pricing */}
              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 800, color: '#1E293B', marginBottom: '8px' }}>
                  Requested Hospital Commercial Rates (₹)
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
                  <div>
                    <span style={{ display: 'block', fontSize: '11px', color: '#64748B', marginBottom: '4px' }}>Hospital MRP (₹)</span>
                    <input
                      type="number"
                      step="0.01"
                      placeholder="0.00"
                      value={priceA.mrp}
                      onChange={(e) => setPriceA({ ...priceA, mrp: e.target.value })}
                      style={{
                        width: '100%',
                        padding: '8px 12px',
                        borderRadius: '8px',
                        border: '1px solid #CBD5E1',
                        fontSize: '13px'
                      }}
                    />
                  </div>
                  <div>
                    <span style={{ display: 'block', fontSize: '11px', color: '#64748B', marginBottom: '4px' }}>Hospital Net Rate (₹)</span>
                    <input
                      type="number"
                      step="0.01"
                      placeholder="0.00"
                      value={priceA.netRate}
                      onChange={(e) => setPriceA({ ...priceA, netRate: e.target.value })}
                      style={{
                        width: '100%',
                        padding: '8px 12px',
                        borderRadius: '8px',
                        border: '1px solid #CBD5E1',
                        fontSize: '13px'
                      }}
                    />
                  </div>
                  <div>
                    <span style={{ display: 'block', fontSize: '11px', color: '#64748B', marginBottom: '4px' }}>Hospital Cost (₹)</span>
                    <input
                      type="number"
                      step="0.01"
                      placeholder="0.00"
                      value={priceA.hospitalCost}
                      onChange={(e) => setPriceA({ ...priceA, hospitalCost: e.target.value })}
                      style={{
                        width: '100%',
                        padding: '8px 12px',
                        borderRadius: '8px',
                        border: '1px solid #CBD5E1',
                        fontSize: '13px'
                      }}
                    />
                  </div>
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '4px' }}>
                  Reason / Justification
                </label>
                <textarea
                  rows={2}
                  placeholder="Clinical or procurement justification for assigning this item..."
                  value={reasonA}
                  onChange={(e) => setReasonA(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: '8px',
                    border: '1px solid #CBD5E1',
                    fontSize: '12px'
                  }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
                <button
                  type="button"
                  onClick={onClose}
                  style={{
                    padding: '8px 18px',
                    borderRadius: '8px',
                    border: '1px solid #CBD5E1',
                    background: '#FFFFFF',
                    color: '#475569',
                    fontWeight: 700,
                    fontSize: '13px',
                    cursor: 'pointer'
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting || !selectedMasterItem || !!duplicateWarningA}
                  style={{
                    padding: '8px 22px',
                    borderRadius: '8px',
                    border: 'none',
                    background: (submitting || !selectedMasterItem || !!duplicateWarningA) ? '#94A3B8' : '#2563EB',
                    color: '#FFFFFF',
                    fontWeight: 700,
                    fontSize: '13px',
                    cursor: (submitting || !selectedMasterItem || !!duplicateWarningA) ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px'
                  }}
                >
                  {submitting && <LucideIcon name="loader-2" size={16} className="animate-spin" />}
                  Submit Path A Request
                </button>
              </div>
            </form>
          )}

          {/* ────────────────── PATH B: PROPOSE NEW MASTER ────────────────── */}
          {activeTab === 'pathB' && (
            <form onSubmit={handleSubmitPathB} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div style={{
                background: '#F0FDF4',
                border: '1px solid #BBF7D0',
                borderRadius: '8px',
                padding: '12px 16px',
                fontSize: '12px',
                color: '#166534',
                lineHeight: '1.5'
              }}>
                <strong>Path B Workflow:</strong> If an item does not exist in the Global Catalog, propose it using the verified client schema. On SuperAdmin approval, a canonical global item will be created and configured for your hospital.
              </div>

              {/* Category & Department selectors */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '6px' }}>
                    Category
                  </label>
                  <select
                    value={selectedCategoryB}
                    onChange={(e) => setSelectedCategoryB(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      borderRadius: '8px',
                      border: '1px solid #CBD5E1',
                      fontSize: '13px',
                      background: '#FFFFFF'
                    }}
                  >
                    {categories.map(c => (
                      <option key={c.name} value={c.name}>{c.name}</option>
                    ))}
                  </select>
                </div>

                {currentCatConfigB?.hasDepartment && (
                  <div>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '6px' }}>
                      Department
                    </label>
                    <select
                      value={selectedDepartmentB}
                      onChange={(e) => setSelectedDepartmentB(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '8px 12px',
                        borderRadius: '8px',
                        border: '1px solid #CBD5E1',
                        fontSize: '13px',
                        background: '#FFFFFF'
                      }}
                    >
                      {Object.keys(currentCatConfigB?.departments || {}).map(d => (
                        <option key={d} value={d}>{d}</option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              {/* Dynamic Fields from MASTER_SCHEMA_REGISTRY */}
              <div>
                <div style={{
                  fontSize: '13px',
                  fontWeight: 800,
                  color: '#1E293B',
                  marginBottom: '10px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}>
                  <LucideIcon name="sliders" size={16} />
                  Proposed Canonical Specifications ({fieldsB.length} Client Fields)
                </div>

                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
                  gap: '12px',
                  background: '#F8FAFC',
                  padding: '16px',
                  borderRadius: '10px',
                  border: '1px solid #E2E8F0',
                  maxHeight: '280px',
                  overflowY: 'auto'
                }}>
                  {fieldsB
                    .filter(f => f.pricingScope !== 'HOSPITAL_SPECIFIC' && f.fieldKey !== 'sNo' && f.fieldKey !== 'itemCode')
                    .map(field => (
                      <div key={field.fieldKey}>
                        <FieldRenderer
                          field={field}
                          value={formDataB[field.fieldKey] !== undefined ? formDataB[field.fieldKey] : (field.defaultValue ?? '')}
                          onChange={(val) => handleFieldChangeB(field.fieldKey, val)}
                          readOnly={field.readOnly}
                        />
                      </div>
                    ))}
                </div>
              </div>

              {/* Requested Pricing */}
              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 800, color: '#1E293B', marginBottom: '8px' }}>
                  Requested Hospital Commercial Rates (₹)
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
                  <div>
                    <span style={{ display: 'block', fontSize: '11px', color: '#64748B', marginBottom: '4px' }}>Hospital MRP (₹)</span>
                    <input
                      type="number"
                      step="0.01"
                      placeholder="0.00"
                      value={priceB.mrp}
                      onChange={(e) => setPriceB({ ...priceB, mrp: e.target.value })}
                      style={{
                        width: '100%',
                        padding: '8px 12px',
                        borderRadius: '8px',
                        border: '1px solid #CBD5E1',
                        fontSize: '13px'
                      }}
                    />
                  </div>
                  <div>
                    <span style={{ display: 'block', fontSize: '11px', color: '#64748B', marginBottom: '4px' }}>Hospital Net Rate (₹)</span>
                    <input
                      type="number"
                      step="0.01"
                      placeholder="0.00"
                      value={priceB.netRate}
                      onChange={(e) => setPriceB({ ...priceB, netRate: e.target.value })}
                      style={{
                        width: '100%',
                        padding: '8px 12px',
                        borderRadius: '8px',
                        border: '1px solid #CBD5E1',
                        fontSize: '13px'
                      }}
                    />
                  </div>
                  <div>
                    <span style={{ display: 'block', fontSize: '11px', color: '#64748B', marginBottom: '4px' }}>Hospital Cost (₹)</span>
                    <input
                      type="number"
                      step="0.01"
                      placeholder="0.00"
                      value={priceB.hospitalCost}
                      onChange={(e) => setPriceB({ ...priceB, hospitalCost: e.target.value })}
                      style={{
                        width: '100%',
                        padding: '8px 12px',
                        borderRadius: '8px',
                        border: '1px solid #CBD5E1',
                        fontSize: '13px'
                      }}
                    />
                  </div>
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '4px' }}>
                  Reason / Clinical Justification
                </label>
                <textarea
                  rows={2}
                  placeholder="Why is this new global master item needed? (e.g. newly introduced drug, procedure)..."
                  value={reasonB}
                  onChange={(e) => setReasonB(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: '8px',
                    border: '1px solid #CBD5E1',
                    fontSize: '12px'
                  }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
                <button
                  type="button"
                  onClick={onClose}
                  style={{
                    padding: '8px 18px',
                    borderRadius: '8px',
                    border: '1px solid #CBD5E1',
                    background: '#FFFFFF',
                    color: '#475569',
                    fontWeight: 700,
                    fontSize: '13px',
                    cursor: 'pointer'
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  style={{
                    padding: '8px 22px',
                    borderRadius: '8px',
                    border: 'none',
                    background: submitting ? '#94A3B8' : '#16A34A',
                    color: '#FFFFFF',
                    fontWeight: 700,
                    fontSize: '13px',
                    cursor: submitting ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px'
                  }}
                >
                  {submitting && <LucideIcon name="loader-2" size={16} className="animate-spin" />}
                  Submit Path B Proposal
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
