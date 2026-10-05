import React, { useState, useEffect, useMemo } from 'react';
import * as Icons from 'lucide-react';
import {
  MASTER_SCHEMA_REGISTRY,
  getAllCategories,
  getCategoryConfig
} from '../../../config/masterSchemaRegistry';
import MasterCatalogTable from './MasterCatalogTable';
import MasterDynamicForm from './MasterDynamicForm';
import HospitalMasterConfigView from './HospitalMasterConfigView';
import {
  downloadMasterExcel,
  downloadHospitalExcel,
  downloadCanonicalExcel,
  downloadMasterPdf
} from '../../../utils/globalMasterExport';

const LucideIcon = ({ name, ...props }) => {
  if (!name) return <Icons.HelpCircle {...props} />;
  const camelName = name
    .split('-')
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join('');
  const IconComponent = Icons[camelName] || Icons.HelpCircle;
  return <IconComponent {...props} />;
};

const CATEGORY_ICONS = {
  'Lab Operation': 'flask-conical',
  'Pharmacy': 'pill',
  'Pathology': 'microscope',
  'Service': 'stethoscope',
  'Radiology': 'scan',
  'Assets': 'box'
};

export default function MasterManagementView() {
  // Search & Filter state for Master Catalog
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  // Export State
  const [isExportOpen, setIsExportOpen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [exportError, setExportError] = useState('');

  // Sub-navigation: 'catalog' | 'hospital-pricing' | 'approvals' | 'uploads'
  const [activeSubTab, setActiveSubTab] = useState('catalog');

  // Master Categories from registry
  const categories = useMemo(() => getAllCategories(), []);

  // Category & Department Selection (Category required, Department optional multi-select filter)
  const [selectedCategory, setSelectedCategory] = useState('Lab Operation');
  const [selectedDepartments, setSelectedDepartments] = useState([]);
  const [isDeptDropdownOpen, setIsDeptDropdownOpen] = useState(false);

  // Derived selectedDepartment string for backward compatibility with table and export queries
  const selectedDepartment = useMemo(() => {
    return selectedDepartments.join(',');
  }, [selectedDepartments]);

  // Form / Table view mode: 'list' | 'create' | 'edit' | 'view'
  const [viewMode, setViewMode] = useState('list');
  const [activeItem, setActiveItem] = useState(null);

  // Unsaved changes tracking
  const [formIsDirty, setFormIsDirty] = useState(false);
  const [pendingAction, setPendingAction] = useState(null);
  const [showDiscardModal, setShowDiscardModal] = useState(false);

  // Current category config
  const currentCategoryConfig = useMemo(() => {
    return getCategoryConfig(selectedCategory);
  }, [selectedCategory]);

  // Adjust department when category changes
  const handleSelectCategory = (catName) => {
    if (formIsDirty) {
      setPendingAction(() => () => applyCategoryChange(catName));
      setShowDiscardModal(true);
      return;
    }
    applyCategoryChange(catName);
  };

  const applyCategoryChange = (catName) => {
    setSelectedCategory(catName);
    setSelectedDepartments([]);
    setIsDeptDropdownOpen(false);
    setViewMode('list');
    setActiveItem(null);
    setFormIsDirty(false);
  };

  // Adjust department
  const handleSelectDepartment = (deptName) => {
    if (formIsDirty) {
      setPendingAction(() => () => applyDepartmentChange(deptName));
      setShowDiscardModal(true);
      return;
    }
    applyDepartmentChange(deptName);
  };

  const applyDepartmentChange = (deptName) => {
    setSelectedDepartment(deptName);
    setViewMode('list');
    setActiveItem(null);
    setFormIsDirty(false);
  };

  // Form Mode Handlers
  const handleCreate = () => {
    setActiveItem(null);
    setViewMode('create');
  };

  const handleEdit = (item) => {
    setActiveItem(item);
    setViewMode('edit');
  };

  const handleView = (item) => {
    setActiveItem(item);
    setViewMode('view');
  };

  const handleCancelForm = () => {
    if (formIsDirty) {
      setPendingAction(() => () => {
        setViewMode('list');
        setActiveItem(null);
        setFormIsDirty(false);
      });
      setShowDiscardModal(true);
      return;
    }
    setViewMode('list');
    setActiveItem(null);
  };

  const handleSaveSuccess = (savedItem) => {
    setFormIsDirty(false);
    setViewMode('list');
    setActiveItem(null);
  };

  // Discard modal confirmation
  const confirmDiscard = () => {
    setFormIsDirty(false);
    setShowDiscardModal(false);
    if (pendingAction) {
      pendingAction();
      setPendingAction(null);
    }
  };

  const cancelDiscard = () => {
    setShowDiscardModal(false);
    setPendingAction(null);
  };

  // List of departments for current category
  const departmentList = useMemo(() => {
    if (!currentCategoryConfig || !currentCategoryConfig.hasDepartment) return [];
    return Object.keys(currentCategoryConfig.departments || {});
  }, [currentCategoryConfig]);

  // Export Handlers (Supports Category-wide '' or specific Department)
  const handleExportHospitalExcel = async (deptOverride) => {
    try {
      setIsExporting(true);
      setExportError('');
      const dept = deptOverride !== undefined ? deptOverride : selectedDepartment;
      await downloadHospitalExcel(selectedCategory, dept);
    } catch (err) {
      setExportError(err.message || 'Export Hospital Excel failed');
    } finally {
      setIsExporting(false);
    }
  };

  const handleExportCanonicalExcel = async (deptOverride) => {
    try {
      setIsExporting(true);
      setExportError('');
      const dept = deptOverride !== undefined ? deptOverride : selectedDepartment;
      await downloadCanonicalExcel(selectedCategory, dept);
    } catch (err) {
      setExportError(err.message || 'Export Global Master Excel failed');
    } finally {
      setIsExporting(false);
    }
  };

  const handleExportPdf = async (deptOverride) => {
    try {
      setIsExporting(true);
      setExportError('');
      const dept = deptOverride !== undefined ? deptOverride : selectedDepartment;
      await downloadMasterPdf(selectedCategory, dept);
    } catch (err) {
      setExportError(err.message || 'Export PDF failed');
    } finally {
      setIsExporting(false);
    }
  };

  // Close export & department dropdowns when clicking outside
  useEffect(() => {
    if (!isExportOpen && !isDeptDropdownOpen) return;
    const handleClickOutside = (e) => {
      if (isExportOpen && !e.target.closest('[data-export-dropdown]')) {
        setIsExportOpen(false);
      }
      if (isDeptDropdownOpen && !e.target.closest('[data-dept-dropdown]')) {
        setIsDeptDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isExportOpen, isDeptDropdownOpen]);


  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: viewMode === 'list' ? '8px' : '4px', width: '100%', minWidth: 0, paddingBottom: viewMode === 'list' ? '12px' : '90px' }}>
      {/* ── 1. SUB-NAVIGATION TABS (COMPACT) ── */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '4px',
        background: '#F1F5F9',
        padding: '3px',
        borderRadius: '7px',
        width: 'fit-content'
      }}>
        {/* Catalog */}
        <button
          type="button"
          onClick={() => setActiveSubTab('catalog')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '5px',
            padding: '4px 12px',
            borderRadius: '5px',
            fontSize: '12px',
            fontWeight: 700,
            border: 'none',
            cursor: 'pointer',
            background: activeSubTab === 'catalog' ? '#FFFFFF' : 'transparent',
            color: activeSubTab === 'catalog' ? '#1E293B' : '#64748B',
            boxShadow: activeSubTab === 'catalog' ? '0 1px 2px rgba(0,0,0,0.06)' : 'none'
          }}
        >
          <LucideIcon name="database" size={13} color={activeSubTab === 'catalog' ? '#2563EB' : '#64748B'} />
          Catalog
        </button>

        {/* Hospital Pricing */}
        <button
          type="button"
          onClick={() => setActiveSubTab('hospital-pricing')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '5px',
            padding: '4px 12px',
            borderRadius: '5px',
            fontSize: '12px',
            fontWeight: 700,
            border: 'none',
            cursor: 'pointer',
            background: activeSubTab === 'hospital-pricing' ? '#FFFFFF' : 'transparent',
            color: activeSubTab === 'hospital-pricing' ? '#7C3AED' : '#64748B',
            boxShadow: activeSubTab === 'hospital-pricing' ? '0 1px 2px rgba(0,0,0,0.06)' : 'none'
          }}
        >
          <LucideIcon name="building-2" size={13} color={activeSubTab === 'hospital-pricing' ? '#7C3AED' : '#64748B'} />
          Hospital Pricing
        </button>
      </div>

      {/* ── HOSPITAL MASTER PRICING & CONFIGURATION VIEW ── */}
      {activeSubTab === 'hospital-pricing' && (
        <HospitalMasterConfigView onSwitchTab={setActiveSubTab} />
      )}

      {/* ── 3. MASTER CATALOG PRIMARY WORKFLOW ── */}
      {activeSubTab === 'catalog' && (
        <>
          {/* STEP 1 & 2: SELECTION & ACTION TOOLBAR (Visible only when in list view) */}
          {viewMode === 'list' && (
            <>
              {/* STEP 1: COMPACT CATEGORY & DEPARTMENT DROPDOWN SELECTOR BAR (~40px) */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '12px',
                background: '#FFFFFF',
            borderRadius: '8px',
            border: '1px solid #E2E8F0',
            padding: '6px 12px',
            boxShadow: '0 1px 2px rgba(0,0,0,0.02)',
            flexWrap: 'wrap'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap' }}>
              {/* Category Dropdown */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <label style={{
                  fontSize: '11px',
                  fontWeight: 800,
                  color: '#475569',
                  textTransform: 'uppercase',
                  letterSpacing: '0.4px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '5px',
                  whiteSpace: 'nowrap'
                }}>
                  <LucideIcon name="layers" size={13} color="#2563EB" />
                  Category:
                </label>
                <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}>
                  <select
                    value={selectedCategory}
                    onChange={(e) => handleSelectCategory(e.target.value)}
                    style={{
                      height: '32px',
                      padding: '0 28px 0 10px',
                      borderRadius: '6px',
                      border: '1.5px solid #CBD5E1',
                      fontSize: '12.5px',
                      fontWeight: 700,
                      color: '#0F172A',
                      background: '#F8FAFC',
                      cursor: 'pointer',
                      outline: 'none',
                      appearance: 'none',
                      WebkitAppearance: 'none',
                      minWidth: '170px'
                    }}
                  >
                    {categories.map((cat) => {
                      const catName = cat.name || cat.categoryName;
                      const isPending = cat.status === 'SOURCE-CONFIRMATION-REQUIRED';
                      return (
                        <option key={catName} value={catName}>
                          {catName}{isPending ? ' (Pending Confirmation)' : ''}
                        </option>
                      );
                    })}
                  </select>
                  <span style={{ position: 'absolute', right: '8px', pointerEvents: 'none', color: '#64748B', display: 'flex' }}>
                    <LucideIcon name="chevron-down" size={13} />
                  </span>
                </div>
              </div>

              {/* Department Multi-Select Checkbox Dropdown (Optional filter; hidden for categories without departments like Assets) */}
              {currentCategoryConfig?.hasDepartment && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <label style={{
                    fontSize: '11px',
                    fontWeight: 800,
                    color: '#475569',
                    textTransform: 'uppercase',
                    letterSpacing: '0.4px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '5px',
                    whiteSpace: 'nowrap'
                  }}>
                    <LucideIcon name="building-2" size={13} color="#0D9488" />
                    Department:
                  </label>
                  <div style={{ position: 'relative' }} data-dept-dropdown="true">
                    <button
                      type="button"
                      onClick={() => setIsDeptDropdownOpen(prev => !prev)}
                      disabled={currentCategoryConfig?.status === 'SOURCE-CONFIRMATION-REQUIRED'}
                      style={{
                        height: '32px',
                        padding: '0 10px',
                        borderRadius: '6px',
                        border: '1.5px solid #CBD5E1',
                        fontSize: '12.5px',
                        fontWeight: 650,
                        color: currentCategoryConfig?.status === 'SOURCE-CONFIRMATION-REQUIRED' ? '#94A3B8' : '#0F172A',
                        background: currentCategoryConfig?.status === 'SOURCE-CONFIRMATION-REQUIRED' ? '#F1F5F9' : '#F8FAFC',
                        cursor: currentCategoryConfig?.status === 'SOURCE-CONFIRMATION-REQUIRED' ? 'not-allowed' : 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '8px',
                        minWidth: '180px',
                        maxWidth: '280px'
                      }}
                      title={selectedDepartments.length > 1 ? selectedDepartments.join(', ') : ''}
                    >
                      <span style={{
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        textAlign: 'left'
                      }}>
                        {selectedDepartments.length === 0
                          ? 'All Departments'
                          : selectedDepartments.length === 1
                          ? selectedDepartments[0]
                          : `${selectedDepartments.length} Departments Selected`}
                      </span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '5px', flexShrink: 0 }}>
                        {selectedDepartments.length > 1 && (
                          <span style={{
                            fontSize: '10px',
                            fontWeight: 800,
                            background: '#0D9488',
                            color: '#FFFFFF',
                            borderRadius: '10px',
                            padding: '1px 6px',
                            lineHeight: 1.2
                          }}>
                            {selectedDepartments.length}
                          </span>
                        )}
                        <LucideIcon name="chevron-down" size={13} color="#64748B" />
                      </div>
                    </button>

                    {isDeptDropdownOpen && (
                      <div style={{
                        position: 'absolute',
                        left: 0,
                        top: 'calc(100% + 4px)',
                        background: '#FFFFFF',
                        border: '1px solid #CBD5E1',
                        borderRadius: '8px',
                        boxShadow: '0 6px 18px rgba(0,0,0,0.12)',
                        zIndex: 110,
                        minWidth: '250px',
                        maxHeight: '340px',
                        display: 'flex',
                        flexDirection: 'column',
                        overflow: 'hidden'
                      }}>
                        {/* Header */}
                        <div style={{
                          padding: '7px 10px',
                          background: '#F8FAFC',
                          borderBottom: '1px solid #E2E8F0',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          fontSize: '11px'
                        }}>
                          <span style={{ fontWeight: 700, color: '#475569' }}>
                            Departments ({departmentList.length})
                          </span>
                          {selectedDepartments.length > 0 && (
                            <button
                              type="button"
                              onClick={() => setSelectedDepartments([])}
                              style={{
                                background: 'none',
                                border: 'none',
                                color: '#0D9488',
                                fontWeight: 700,
                                cursor: 'pointer',
                                fontSize: '11px',
                                padding: '0 3px'
                              }}
                            >
                              Clear Filter
                            </button>
                          )}
                        </div>

                        {/* "All Departments" Option */}
                        <div
                          onClick={() => setSelectedDepartments([])}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            padding: '8px 12px',
                            cursor: 'pointer',
                            borderBottom: '1px solid #F1F5F9',
                            background: selectedDepartments.length === 0 ? '#F0FDFA' : '#FFFFFF',
                            transition: 'background 0.1s ease'
                          }}
                          onMouseEnter={e => { if (selectedDepartments.length !== 0) e.currentTarget.style.background = '#F8FAFC'; }}
                          onMouseLeave={e => { if (selectedDepartments.length !== 0) e.currentTarget.style.background = '#FFFFFF'; }}
                        >
                          <input
                            type="checkbox"
                            checked={selectedDepartments.length === 0}
                            onChange={() => setSelectedDepartments([])}
                            style={{ cursor: 'pointer', accentColor: '#0D9488' }}
                          />
                          <span style={{
                            fontSize: '12px',
                            fontWeight: selectedDepartments.length === 0 ? 750 : 500,
                            color: selectedDepartments.length === 0 ? '#0D9488' : '#1E293B'
                          }}>
                            All Departments
                          </span>
                        </div>

                        {/* Department Checkbox List */}
                        <div style={{ overflowY: 'auto', flex: 1, padding: '4px 0' }}>
                          {departmentList.map(dept => {
                            const isChecked = selectedDepartments.includes(dept);
                            const toggleDept = () => {
                              if (isChecked) {
                                const next = selectedDepartments.filter(d => d !== dept);
                                setSelectedDepartments(next);
                              } else {
                                setSelectedDepartments([...selectedDepartments, dept]);
                              }
                            };

                            return (
                              <div
                                key={dept}
                                onClick={toggleDept}
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '8px',
                                  padding: '6px 12px',
                                  cursor: 'pointer',
                                  background: isChecked ? '#F0FDFA' : '#FFFFFF',
                                  transition: 'background 0.1s ease'
                                }}
                                onMouseEnter={e => { if (!isChecked) e.currentTarget.style.background = '#F8FAFC'; }}
                                onMouseLeave={e => { if (!isChecked) e.currentTarget.style.background = '#FFFFFF'; }}
                              >
                                <input
                                  type="checkbox"
                                  checked={isChecked}
                                  onChange={toggleDept}
                                  style={{ cursor: 'pointer', accentColor: '#0D9488' }}
                                />
                                <span style={{
                                  fontSize: '12px',
                                  fontWeight: isChecked ? 700 : 400,
                                  color: isChecked ? '#0F766E' : '#334155'
                                }}>
                                  {dept}
                                </span>
                              </div>
                            );
                          })}
                        </div>

                        {/* Footer Info */}
                        {selectedDepartments.length > 0 && (
                          <div style={{
                            padding: '6px 10px',
                            background: '#F8FAFC',
                            borderTop: '1px solid #E2E8F0',
                            fontSize: '10.5px',
                            color: '#64748B',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center'
                          }}>
                            <span>{selectedDepartments.length} of {departmentList.length} selected</span>
                            <button
                              type="button"
                              onClick={() => setIsDeptDropdownOpen(false)}
                              style={{
                                padding: '2px 8px',
                                borderRadius: '4px',
                                background: '#0D9488',
                                color: '#FFFFFF',
                                border: 'none',
                                fontSize: '10.5px',
                                fontWeight: 700,
                                cursor: 'pointer'
                              }}
                            >
                              Apply
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* STEP 2: LOCAL CATALOG ACTION TOOLBAR (Search, Status Filter, Refresh, + Add Item, Export) */}
          {viewMode === 'list' && currentCategoryConfig?.status !== 'SOURCE-CONFIRMATION-REQUIRED' && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '10px',
              background: '#FFFFFF',
              borderRadius: '8px',
              border: '1px solid #E2E8F0',
              padding: '6px 12px',
              boxShadow: '0 1px 2px rgba(0,0,0,0.02)',
              flexWrap: 'wrap'
            }}>
              {/* Left: Search, Status Filter, Refresh */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1, minWidth: '260px', maxWidth: '640px' }}>
                {/* Search Box */}
                <div style={{ position: 'relative', flex: 1, minWidth: '160px', maxWidth: '320px' }}>
                  <span style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#94A3B8', display: 'flex' }}>
                    <LucideIcon name="search" size={13} />
                  </span>
                  <input
                    type="text"
                    placeholder="Search code, item, manufacturer..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '5px 26px 5px 28px',
                      borderRadius: '6px',
                      border: '1px solid #CBD5E1',
                      fontSize: '12px',
                      color: '#1E293B',
                      outline: 'none',
                      background: '#F8FAFC',
                      boxSizing: 'border-box'
                    }}
                  />
                  {search && (
                    <button
                      type="button"
                      onClick={() => setSearch('')}
                      style={{
                        position: 'absolute',
                        right: '6px',
                        top: '50%',
                        transform: 'translateY(-50%)',
                        background: 'none',
                        border: 'none',
                        color: '#94A3B8',
                        cursor: 'pointer',
                        display: 'flex',
                        padding: '2px'
                      }}
                    >
                      <LucideIcon name="x" size={11} />
                    </button>
                  )}
                </div>

                {/* Status Filter */}
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  style={{
                    height: '30px',
                    padding: '0 8px',
                    borderRadius: '6px',
                    border: '1px solid #CBD5E1',
                    fontSize: '12px',
                    color: '#334155',
                    background: '#FFFFFF',
                    cursor: 'pointer',
                    outline: 'none'
                  }}
                >
                  <option value="all">All Statuses</option>
                  <option value="ACTIVE">Active Only</option>
                  <option value="INACTIVE">Inactive Only</option>
                </select>

                {/* Refresh Button */}
                <button
                  type="button"
                  onClick={() => setRefreshTrigger(prev => prev + 1)}
                  title="Refresh List"
                  style={{
                    height: '30px',
                    width: '30px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderRadius: '6px',
                    border: '1px solid #CBD5E1',
                    background: '#F8FAFC',
                    color: '#475569',
                    cursor: 'pointer'
                  }}
                >
                  <LucideIcon name="refresh-cw" size={13} />
                </button>
              </div>

              {/* Right: Horizontally Aligned [ + Add Item ] [ Export ▼ ] */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <button
                  type="button"
                  onClick={handleCreate}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '5px',
                    height: '30px',
                    padding: '0 12px',
                    borderRadius: '6px',
                    background: '#2563EB',
                    color: '#FFFFFF',
                    fontSize: '12px',
                    fontWeight: 700,
                    border: 'none',
                    cursor: 'pointer',
                    boxShadow: '0 1px 2px rgba(37,99,235,0.2)',
                    whiteSpace: 'nowrap'
                  }}
                >
                  <LucideIcon name="plus" size={13} />
                  <span>Add Item</span>
                </button>

                {/* Export Excel Dropdown Menu */}
                <div style={{ position: 'relative' }} data-export-dropdown="true">
                  <button
                    type="button"
                    onClick={() => setIsExportOpen(prev => !prev)}
                    disabled={isExporting}
                    title="Export Item Master Excel"
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '5px',
                      height: '30px',
                      padding: '0 11px',
                      borderRadius: '6px',
                      border: '1px solid #10B981',
                      background: '#ECFDF5',
                      color: '#065F46',
                      fontSize: '12px',
                      fontWeight: 750,
                      cursor: isExporting ? 'not-allowed' : 'pointer',
                      boxShadow: '0 1px 2px rgba(0,0,0,0.02)'
                    }}
                  >
                    <LucideIcon name="file-spreadsheet" size={13} color="#059669" />
                    <span>{isExporting ? 'Exporting...' : 'Export'}</span>
                    <LucideIcon name="chevron-down" size={12} color="#059669" />
                  </button>

                  {isExportOpen && (
                    <div style={{
                      position: 'absolute',
                      right: 0,
                      top: 'calc(100% + 4px)',
                      background: '#FFFFFF',
                      border: '1px solid #E2E8F0',
                      borderRadius: '8px',
                      boxShadow: '0 4px 14px rgba(0,0,0,0.12)',
                      zIndex: 100,
                      minWidth: '260px',
                      padding: '5px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '3px'
                    }}>
                      {/* Option 1: Entire Category (Primary default) */}
                      <button
                        type="button"
                        onClick={() => { setIsExportOpen(false); handleExportHospitalExcel(''); }}
                        style={{
                          display: 'flex',
                          alignItems: 'flex-start',
                          gap: '8px',
                          padding: '8px 10px',
                          borderRadius: '6px',
                          background: 'transparent',
                          border: 'none',
                          textAlign: 'left',
                          cursor: 'pointer'
                        }}
                        onMouseEnter={e => e.currentTarget.style.background = '#F0FDF4'}
                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                      >
                        <LucideIcon name="layers" size={15} color="#059669" style={{ marginTop: '2px' }} />
                        <div>
                          <div style={{ fontSize: '12px', fontWeight: 750, color: '#065F46' }}>
                            Entire Category
                          </div>
                          <div style={{ fontSize: '10.5px', color: '#64748B' }}>
                            All {selectedCategory} items across all departments
                          </div>
                        </div>
                      </button>

                      {/* Option 2: Selected Department(s) */}
                      {currentCategoryConfig?.hasDepartment && (
                        <button
                          type="button"
                          disabled={selectedDepartments.length === 0}
                          onClick={() => {
                            if (selectedDepartments.length === 0) return;
                            setIsExportOpen(false);
                            handleExportHospitalExcel(selectedDepartments.join(','));
                          }}
                          style={{
                            display: 'flex',
                            alignItems: 'flex-start',
                            gap: '8px',
                            padding: '8px 10px',
                            borderRadius: '6px',
                            background: 'transparent',
                            border: 'none',
                            textAlign: 'left',
                            cursor: selectedDepartments.length === 0 ? 'not-allowed' : 'pointer',
                            opacity: selectedDepartments.length === 0 ? 0.45 : 1
                          }}
                          onMouseEnter={e => { if (selectedDepartments.length > 0) e.currentTarget.style.background = '#F8FAFC'; }}
                          onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
                          title={selectedDepartments.length === 0 ? 'Disabled: Set to All Departments (Use "Entire Category" above)' : `Export selected department(s)`}
                        >
                          <LucideIcon name="building-2" size={15} color={selectedDepartments.length > 0 ? '#0D9488' : '#94A3B8'} style={{ marginTop: '2px' }} />
                          <div>
                            <div style={{ fontSize: '12px', fontWeight: 700, color: selectedDepartments.length > 0 ? '#0F172A' : '#94A3B8' }}>
                              {selectedDepartments.length === 0
                                ? 'Current Department'
                                : selectedDepartments.length === 1
                                ? `Current Department (${selectedDepartments[0]})`
                                : `Selected Departments (${selectedDepartments.length})`}
                            </div>
                            <div style={{ fontSize: '10.5px', color: '#64748B' }}>
                              {selectedDepartments.length === 0
                                ? 'Select 1 or more departments above to enable'
                                : selectedDepartments.length === 1
                                ? `Export only ${selectedDepartments[0]} items`
                                : `Export items from: ${selectedDepartments.join(', ')}`}
                            </div>
                          </div>
                        </button>
                      )}

                      <div style={{ height: '1px', background: '#F1F5F9', margin: '3px 0' }} />

                      {/* Canonical Master Export */}
                      <button
                        type="button"
                        onClick={() => { setIsExportOpen(false); handleExportCanonicalExcel(selectedDepartment); }}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                          padding: '7px 10px',
                          borderRadius: '6px',
                          background: 'transparent',
                          border: 'none',
                          textAlign: 'left',
                          cursor: 'pointer'
                        }}
                        onMouseEnter={e => e.currentTarget.style.background = '#F8FAFC'}
                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                      >
                        <LucideIcon name="database" size={14} color="#64748B" />
                        <div style={{ fontSize: '11.5px', fontWeight: 600, color: '#334155' }}>
                          Export Global Master (Raw Canonical)
                        </div>
                      </button>

                      {/* PDF Export */}
                      <button
                        type="button"
                        onClick={() => { setIsExportOpen(false); handleExportPdf(selectedDepartment); }}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                          padding: '7px 10px',
                          borderRadius: '6px',
                          background: 'transparent',
                          border: 'none',
                          textAlign: 'left',
                          cursor: 'pointer'
                        }}
                        onMouseEnter={e => e.currentTarget.style.background = '#F8FAFC'}
                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                      >
                        <LucideIcon name="file-text" size={14} color="#DC2626" />
                        <div style={{ fontSize: '11.5px', fontWeight: 600, color: '#334155' }}>
                          Export PDF Catalog
                        </div>
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </>
      )}

          {/* Export Error Alert */}
          {exportError && (
            <div style={{
              background: '#FEF2F2',
              border: '1px solid #FCA5A5',
              borderRadius: '7px',
              padding: '6px 12px',
              fontSize: '11.5px',
              color: '#991B1B',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between'
            }}>
              <span>{exportError}</span>
              <button
                type="button"
                onClick={() => setExportError('')}
                style={{ background: 'none', border: 'none', color: '#991B1B', fontWeight: 800, cursor: 'pointer' }}
              >
                ✕
              </button>
            </div>
          )}

          {/* Radiology Pending Warning (if selected) */}
          {currentCategoryConfig?.status === 'SOURCE-CONFIRMATION-REQUIRED' && (
            <div style={{
              background: '#FFFBEB',
              border: '1px solid #FCD34D',
              borderRadius: '7px',
              padding: '8px 12px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}>
              <LucideIcon name="alert-triangle" size={16} color="#D97706" />
              <div style={{ fontSize: '11.5px', color: '#92400E', flex: 1 }}>
                <strong>Radiology Configuration Pending:</strong> SOURCE-CONFIRMATION-REQUIRED. The registry is ready to ingest client specifications without arbitrary placeholders.
              </div>
            </div>
          )}

          {/* STEP 2: CONTENT VIEW (CATALOG TABLE OR DYNAMIC FORM) */}
          {currentCategoryConfig?.status !== 'SOURCE-CONFIRMATION-REQUIRED' && (
            <div>

              {/* View Switch */}
              {viewMode === 'list' ? (
                <MasterCatalogTable
                  category={selectedCategory}
                  department={selectedDepartment}
                  onCreate={handleCreate}
                  onEdit={handleEdit}
                  onView={handleView}
                  search={search}
                  onSearchChange={setSearch}
                  statusFilter={statusFilter}
                  onStatusFilterChange={setStatusFilter}
                  refreshTrigger={refreshTrigger}
                  hideToolbar={true}
                />
              ) : (
                <MasterDynamicForm
                  category={selectedCategory}
                  department={selectedDepartment}
                  initialData={activeItem}
                  mode={viewMode}
                  onSaveSuccess={handleSaveSuccess}
                  onCancel={handleCancelForm}
                  onDirtyChange={setFormIsDirty}
                />
              )}
            </div>
          )}
        </>
      )}

      {/* ── 4. UNSAVED CHANGES CONFIRMATION MODAL ── */}
      {showDiscardModal && (
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
            maxWidth: '440px',
            boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1), 0 10px 10px -5px rgba(0,0,0,0.04)',
            overflow: 'hidden',
            border: '1px solid #E2E8F0'
          }}>
            <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{
                width: '44px',
                height: '44px',
                borderRadius: '50%',
                background: '#FEE2E2',
                color: '#DC2626',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                <LucideIcon name="alert-triangle" size={24} />
              </div>
              <div>
                <h3 style={{ fontSize: '17px', fontWeight: 800, color: '#0F172A', margin: '0 0 6px 0' }}>
                  Discard Unsaved Changes?
                </h3>
                <p style={{ fontSize: '13px', color: '#64748B', margin: 0, lineHeight: '1.5' }}>
                  You have unsaved changes in this form. Switching categories or returning to the catalog will discard all modifications.
                </p>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '8px' }}>
                <button
                  type="button"
                  onClick={cancelDiscard}
                  style={{
                    padding: '8px 16px',
                    borderRadius: '8px',
                    border: '1px solid #CBD5E1',
                    background: '#FFFFFF',
                    color: '#334155',
                    fontSize: '13px',
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                >
                  Stay on Form
                </button>
                <button
                  type="button"
                  onClick={confirmDiscard}
                  style={{
                    padding: '8px 16px',
                    borderRadius: '8px',
                    border: 'none',
                    background: '#DC2626',
                    color: '#FFFFFF',
                    fontSize: '13px',
                    fontWeight: 700,
                    cursor: 'pointer'
                  }}
                >
                  Discard Changes
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
