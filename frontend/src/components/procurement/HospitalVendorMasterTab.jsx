import React, { useState, useEffect, useCallback } from 'react';
import * as Icons from 'lucide-react';
import api from '../../utils/api';
import {
  VENDOR_SECTIONS,
  VENDOR_FIELDS,
  getVendorFieldsBySection
} from '../../config/vendorSchemaRegistry';

const LucideIcon = ({ name, size = 16, color = 'currentColor', style = {} }) => {
  if (!name) return <Icons.HelpCircle size={size} color={color} style={style} />;
  const camelName = name
    .split('-')
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join('');
  const IconComponent = Icons[camelName] || Icons.HelpCircle;
  return <IconComponent size={size} color={color} style={style} />;
};

export default function HospitalVendorMasterTab({ showToast = () => {} }) {
  // Navigation: 'my-vendors' | 'my-requests'
  const [subTab, setSubTab] = useState('my-vendors');

  // In-Page Sub-Views: null | 'picker' | 'request-form' | 'view-vendor' | 'view-request'
  const [activeView, setActiveView] = useState(null);

  // Associated Vendors
  const [associatedVendors, setAssociatedVendors] = useState([]);
  const [loadingVendors, setLoadingVendors] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Hospital Requests
  const [requests, setRequests] = useState([]);
  const [loadingRequests, setLoadingRequests] = useState(false);

  // Available Global Vendors for In-Page Picker
  const [availableVendors, setAvailableVendors] = useState([]);
  const [loadingAvailable, setLoadingAvailable] = useState(false);
  const [pickerSearch, setPickerSearch] = useState('');
  const [selectedVendorIds, setSelectedVendorIds] = useState(new Set());
  const [associating, setAssociating] = useState(false);

  // Read-only Details
  const [viewingVendor, setViewingVendor] = useState(null);

  // Request New Vendor Form
  const [requestFormData, setRequestFormData] = useState({});
  const [submittingRequest, setSubmittingRequest] = useState(false);
  const [requestFormError, setRequestFormError] = useState(null);

  // View Request Details
  const [viewingRequest, setViewingRequest] = useState(null);
  const [currentStep, setCurrentStep] = useState(1); // 1 | 2 | 3 | 4 | 'all'

  // ─────────────────────────────────────────────────────────────────────────────
  // STEP WIZARD CONFIGURATION & ALIGNED FIELD RENDERER
  // ─────────────────────────────────────────────────────────────────────────────
  const VENDOR_FORM_STEPS = [
    { step: 1, id: 'supplier', shortTitle: '1. Supplier Profile', title: 'Supplier Profile & Address', icon: 'building-2', fieldCount: 16, hasRequired: true, requiredCount: 4, desc: 'Identity, classification & office address' },
    { step: 2, id: 'contacts', shortTitle: '2. Contact Persons', title: 'Concern Person Details', icon: 'users', fieldCount: 8, hasRequired: true, requiredCount: 1, desc: 'Primary & secondary contact representatives' },
    { step: 3, id: 'statutory', shortTitle: '3. Statutory & MSME', title: 'Statutory / MSME / PAN Registration', icon: 'file-check-2', fieldCount: 13, hasRequired: false, requiredCount: 0, desc: 'Corporate, PAN, ESI, PF, ISO & MSME' },
    { step: 4, id: 'banking', shortTitle: '4. Banking & Terms', title: 'Bank, GST & Terms & Conditions', icon: 'landmark', fieldCount: 12, hasRequired: false, requiredCount: 0, desc: 'Bank accounts, GST & commercial terms' },
    { step: 'all', id: 'all', shortTitle: 'All Sections', title: 'Complete Overview (All 49 Fields)', icon: 'layers', fieldCount: 49, hasRequired: true, requiredCount: 5, desc: 'Single-page view of all 49 fields' }
  ];

  const renderHospitalAlignedField = (field, isReadOnly, valuesObj, onChangeFn, customLabel = null, labelWidth = '112px') => {
    const value = valuesObj[field.fieldKey] !== undefined && valuesObj[field.fieldKey] !== null ? valuesObj[field.fieldKey] : '';
    const readOnly = isReadOnly;
    const isRequired = field.systemRequired || field.clientRequired === true;
    const isMissingRequired = isRequired && (!value || !value.toString().trim());
    const displayLabel = customLabel || field.clientHeader;

    return (
      <div
        key={field.fieldKey}
        style={{
          display: 'grid',
          gridTemplateColumns: `${labelWidth} 10px minmax(0, 1fr)`,
          alignItems: 'center',
          height: '26px',
          width: '100%',
          minWidth: 0,
          boxSizing: 'border-box'
        }}
      >
        {/* Label on the left - fixed width */}
        <label
          htmlFor={field.fieldKey}
          title={field.clientHeader}
          style={{
            fontSize: '11px',
            fontWeight: isRequired ? 700 : 550,
            color: isRequired ? '#0F172A' : '#334155',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            cursor: 'default',
            minWidth: 0
          }}
        >
          {displayLabel}
          {isRequired && <span style={{ color: '#DC2626', marginLeft: '2px', fontWeight: 800 }}>*</span>}
        </label>

        {/* Colon separator ':' - fixed 10px centered */}
        <span style={{
          color: '#64748B',
          fontWeight: 700,
          fontSize: '11px',
          textAlign: 'center',
          userSelect: 'none'
        }}>:</span>

        {/* Input / Select on the right with guaranteed Red Line */}
        <div style={{ position: 'relative', width: '100%', minWidth: 0, display: 'flex', alignItems: 'center' }}>
          {field.inputType === 'select' ? (
            <select
              id={field.fieldKey}
              disabled={readOnly}
              value={value}
              onChange={e => onChangeFn && onChangeFn(field.fieldKey, e.target.value)}
              style={{
                width: '100%',
                height: '26px',
                boxSizing: 'border-box',
                padding: '0 24px 0 8px',
                borderRadius: '4px',
                border: '1px solid #CBD5E1',
                borderBottom: isRequired 
                  ? (isMissingRequired ? '2.5px solid #DC2626' : '2px solid #10B981') 
                  : '1px solid #CBD5E1',
                background: readOnly ? '#F8FAFC' : '#FFFFFF',
                fontSize: '11px',
                color: '#0F172A',
                outline: 'none',
                cursor: readOnly ? 'default' : 'pointer',
                WebkitAppearance: 'none',
                MozAppearance: 'none',
                appearance: 'none',
                backgroundImage: "url(\"data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%2364748b' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3e%3c/svg%3e\")",
                backgroundPosition: 'right 6px center',
                backgroundRepeat: 'no-repeat',
                backgroundSize: '14px 14px'
              }}
            >
              <option value="">-- Select --</option>
              {(field.allowedValues || []).map(opt => (
                <option key={opt} value={opt}>{opt}</option>
              ))}
            </select>
          ) : (
            <input
              id={field.fieldKey}
              type={field.inputType || 'text'}
              disabled={readOnly}
              placeholder={field.placeholder || ''}
              value={value}
              onChange={e => onChangeFn && onChangeFn(field.fieldKey, e.target.value)}
              style={{
                width: '100%',
                height: '26px',
                boxSizing: 'border-box',
                padding: '0 8px',
                borderRadius: '4px',
                border: '1px solid #CBD5E1',
                borderBottom: isRequired 
                  ? (isMissingRequired ? '2.5px solid #DC2626' : '2px solid #10B981') 
                  : '1px solid #CBD5E1',
                background: readOnly ? '#F8FAFC' : '#FFFFFF',
                fontSize: '11px',
                color: '#0F172A',
                outline: 'none'
              }}
            />
          )}

          {/* Absolute Red Bottom Line Indicator */}
          {isRequired && isMissingRequired && (
            <div style={{
              position: 'absolute',
              bottom: 0,
              left: 0,
              right: 0,
              height: '2.5px',
              backgroundColor: '#DC2626',
              borderRadius: '0 0 3px 3px',
              pointerEvents: 'none',
              zIndex: 10
            }} />
          )}
        </div>
      </div>
    );
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // 1. FETCH MY ASSOCIATED VENDORS
  // ─────────────────────────────────────────────────────────────────────────────
  const fetchMyVendors = useCallback(async () => {
    try {
      setLoadingVendors(true);
      const res = await api.get('/hospital-vendors/my-vendors', {
        params: { search: searchQuery }
      });
      if (res.data?.success) {
        setAssociatedVendors(res.data.data || []);
      }
    } catch (err) {
      try {
        const fallbackRes = await api.get('/vendors/hospital', {
          params: { search: searchQuery }
        });
        if (fallbackRes.data?.success) {
          setAssociatedVendors(fallbackRes.data.data || []);
        }
      } catch (e) {
        console.error('Failed to fetch hospital vendors', e);
      }
    } finally {
      setLoadingVendors(false);
    }
  }, [searchQuery]);

  // ─────────────────────────────────────────────────────────────────────────────
  // 2. FETCH MY VENDOR REQUESTS
  // ─────────────────────────────────────────────────────────────────────────────
  const fetchMyRequests = useCallback(async () => {
    try {
      setLoadingRequests(true);
      const res = await api.get('/hospital-vendors/my-requests');
      if (res.data?.success) {
        setRequests(res.data.data || []);
      }
    } catch (err) {
      try {
        const fallbackRes = await api.get('/vendors/requests');
        if (fallbackRes.data?.success) {
          setRequests(fallbackRes.data.data || []);
        }
      } catch (e) {
        console.error('Failed to fetch requests', e);
      }
    } finally {
      setLoadingRequests(false);
    }
  }, []);

  useEffect(() => {
    fetchMyVendors();
  }, [fetchMyVendors]);

  useEffect(() => {
    fetchMyRequests();
  }, [fetchMyRequests]);

  // ─────────────────────────────────────────────────────────────────────────────
  // 3. IN-PAGE PICKER HANDLERS
  // ─────────────────────────────────────────────────────────────────────────────
  const openAssociatePicker = async () => {
    setActiveView('picker');
    setSelectedVendorIds(new Set());
    setPickerSearch('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
    try {
      setLoadingAvailable(true);
      const res = await api.get('/hospital-vendors/available');
      if (res.data?.success) {
        setAvailableVendors(res.data.data || []);
      }
    } catch (err) {
      try {
        const fallbackRes = await api.get('/vendors/global-available');
        if (fallbackRes.data?.success) {
          setAvailableVendors(fallbackRes.data.data || []);
        }
      } catch (e) {
        showToast('Failed to load available global vendors', 'error');
      }
    } finally {
      setLoadingAvailable(false);
    }
  };

  const handleSearchAvailable = async (term) => {
    setPickerSearch(term);
    try {
      setLoadingAvailable(true);
      const res = await api.get('/hospital-vendors/available', {
        params: { search: term }
      });
      if (res.data?.success) {
        setAvailableVendors(res.data.data || []);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingAvailable(false);
    }
  };

  const toggleSelectVendor = (id) => {
    setSelectedVendorIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleAssociateSelected = async () => {
    const ids = Array.from(selectedVendorIds);
    if (ids.length === 0) {
      showToast('Select at least one vendor to associate', 'warning');
      return;
    }

    try {
      setAssociating(true);
      const res = await api.post('/hospital-vendors/associate', { vendorIds: ids });
      if (res.data?.success) {
        showToast(res.data.message || 'Vendors associated successfully!');
        setActiveView(null);
        fetchMyVendors();
      } else {
        showToast(res.data?.error || 'Association failed', 'error');
      }
    } catch (err) {
      showToast(err.response?.data?.error || err.message || 'Association failed', 'error');
    } finally {
      setAssociating(false);
    }
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // 4. IN-PAGE REQUEST NEW VENDOR FORM
  // ─────────────────────────────────────────────────────────────────────────────
  const openNewRequestForm = () => {
    const initial = {};
    VENDOR_FIELDS.forEach(f => {
      initial[f.fieldKey] = f.fieldKey === 'activeStatus' ? 'Yes' : (f.fieldKey === 'isMsmeRegistration' ? 'No' : '');
    });
    setRequestFormData(initial);
    setRequestFormError(null);
    setCurrentStep(1);
    setActiveView('request-form');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleRequestFieldChange = (key, val) => {
    setRequestFormData(prev => ({
      ...prev,
      [key]: val
    }));
  };

  const handleSubmitVendorRequest = async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    const missing = [];
    if (!requestFormData.supplierName?.trim()) missing.push('Supplier Name');
    if (!requestFormData.supplierType?.trim()) missing.push('Supplier Type');
    if (!requestFormData.supplierCategory?.trim()) missing.push('Supplier Category');
    if (!requestFormData.organizationType?.trim()) missing.push('Organization Type');
    if (!requestFormData.primaryContactPerson?.trim()) missing.push('Primary Contact');

    if (missing.length > 0) {
      setRequestFormError(`Please fill all required fields (marked with red line): ${missing.join(', ')}`);
      if (!requestFormData.supplierName?.trim() || !requestFormData.supplierType?.trim() || !requestFormData.supplierCategory?.trim() || !requestFormData.organizationType?.trim()) {
        setCurrentStep(1);
      } else if (!requestFormData.primaryContactPerson?.trim()) {
        setCurrentStep(2);
      }
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    try {
      setSubmittingRequest(true);
      setRequestFormError(null);

      const res = await api.post('/hospital-vendors/request', {
        vendorData: requestFormData
      });

      if (res.data?.success) {
        showToast(res.data.message || 'Vendor request submitted to SuperAdmin!');
        setActiveView(null);
        setSubTab('my-requests');
        fetchMyRequests();
      } else {
        setRequestFormError(res.data?.error || 'Failed to submit request');
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    } catch (err) {
      setRequestFormError(err.response?.data?.error || err.message || 'Failed to submit request');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } finally {
      setSubmittingRequest(false);
    }
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // VIEW A: IN-PAGE GLOBAL VENDOR PICKER (NO POP-UPS!)
  // ─────────────────────────────────────────────────────────────────────────────
  if (activeView === 'picker') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', width: '100%', minWidth: 0, paddingBottom: '40px' }}>
        {/* Header */}
        <div style={{
          background: '#FFFFFF',
          borderRadius: '8px',
          border: '1px solid #E2E8F0',
          padding: '12px 18px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '12px',
          boxShadow: '0 1px 2px rgba(0,0,0,0.02)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <button
              onClick={() => setActiveView(null)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 12px',
                borderRadius: '6px',
                border: '1px solid #CBD5E1',
                background: '#FFFFFF',
                color: '#334155',
                fontSize: '12px',
                fontWeight: 650,
                cursor: 'pointer'
              }}
            >
              <LucideIcon name="arrow-left" size={14} />
              Back to My Vendors
            </button>
            <div style={{ height: '22px', width: '1px', background: '#E2E8F0' }} />
            <div>
              <h2 style={{ fontSize: '16px', fontWeight: 800, color: '#0F172A', margin: 0 }}>
                Select Existing Global Vendors
              </h2>
              <div style={{ fontSize: '11.5px', color: '#64748B' }}>
                Select approved vendors from the Global Master to associate with your hospital
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              type="button"
              onClick={() => setActiveView(null)}
              style={{
                padding: '7px 16px',
                borderRadius: '6px',
                border: '1px solid #CBD5E1',
                background: '#FFFFFF',
                color: '#475569',
                fontSize: '12px',
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              Cancel
            </button>

            <button
              type="button"
              disabled={selectedVendorIds.size === 0 || associating}
              onClick={handleAssociateSelected}
              style={{
                padding: '7px 20px',
                borderRadius: '6px',
                border: 'none',
                background: selectedVendorIds.size === 0 ? '#94A3B8' : '#2563EB',
                color: '#FFFFFF',
                fontSize: '12px',
                fontWeight: 700,
                cursor: selectedVendorIds.size === 0 || associating ? 'not-allowed' : 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              {associating && <LucideIcon name="loader-2" size={14} style={{ animation: 'spin 1s linear infinite' }} />}
              Associate Selected ({selectedVendorIds.size})
            </button>
          </div>
        </div>

        {/* Search Bar */}
        <div style={{
          background: '#FFFFFF',
          borderRadius: '8px',
          border: '1px solid #E2E8F0',
          padding: '12px 18px',
          display: 'flex',
          alignItems: 'center',
          gap: '10px'
        }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            flex: 1,
            maxWidth: '420px',
            background: '#F8FAFC',
            border: '1px solid #E2E8F0',
            borderRadius: '6px',
            padding: '7px 12px'
          }}>
            <LucideIcon name="search" size={14} color="#94A3B8" />
            <input
              type="text"
              placeholder="Search unassociated global vendors by name, GST, code..."
              value={pickerSearch}
              onChange={e => handleSearchAvailable(e.target.value)}
              style={{
                border: 'none',
                background: 'transparent',
                outline: 'none',
                fontSize: '12.5px',
                width: '100%',
                color: '#1E293B'
              }}
            />
          </div>
          <div style={{ marginLeft: 'auto', fontSize: '12px', color: '#64748B' }}>
            Selected: <strong>{selectedVendorIds.size}</strong> vendor(s)
          </div>
        </div>

        {/* Table of Available Global Vendors */}
        <div style={{
          background: '#FFFFFF',
          borderRadius: '8px',
          border: '1px solid #E2E8F0',
          overflow: 'hidden'
        }}>
          {loadingAvailable ? (
            <div style={{ padding: '40px', textAlign: 'center', color: '#64748B' }}>
              <LucideIcon name="loader-2" size={24} style={{ animation: 'spin 1s linear infinite', margin: '0 auto 8px auto' }} />
              Searching Global Vendors...
            </div>
          ) : availableVendors.length === 0 ? (
            <div style={{ padding: '40px', textAlign: 'center', color: '#64748B' }}>
              <LucideIcon name="check-circle" size={32} color="#CBD5E1" style={{ margin: '0 auto 10px auto' }} />
              <div style={{ fontWeight: 600, fontSize: '14px', color: '#334155' }}>All global vendors are already associated or none found</div>
            </div>
          ) : (
            <div style={{ overflowX: 'auto', width: '100%' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '12px' }}>
                <thead>
                  <tr style={{ background: '#F8FAFC', borderBottom: '1px solid #E2E8F0', color: '#475569', fontWeight: 700, fontSize: '11px', textTransform: 'uppercase' }}>
                    <th style={{ padding: '10px 12px', width: '40px', textAlign: 'center' }}></th>
                    <th style={{ padding: '10px 12px', width: '120px' }}>Code</th>
                    <th style={{ padding: '10px 12px' }}>Supplier Name</th>
                    <th style={{ padding: '10px 12px', width: '140px' }}>Type / Org</th>
                    <th style={{ padding: '10px 12px', width: '150px' }}>GST / PAN</th>
                    <th style={{ padding: '10px 12px', width: '160px' }}>Contact</th>
                    <th style={{ padding: '10px 12px', width: '130px' }}>City</th>
                  </tr>
                </thead>
                <tbody>
                  {availableVendors.map(v => {
                    const isChecked = selectedVendorIds.has(v._id);
                    return (
                      <tr
                        key={v._id}
                        onClick={() => toggleSelectVendor(v._id)}
                        style={{
                          borderBottom: '1px solid #F1F5F9',
                          cursor: 'pointer',
                          background: isChecked ? '#EFF6FF' : 'transparent',
                          transition: 'background 0.15s ease'
                        }}
                      >
                        <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => {}}
                            style={{ cursor: 'pointer' }}
                          />
                        </td>
                        <td style={{ padding: '10px 12px', fontFamily: 'monospace', fontWeight: 700, color: '#1D4ED8' }}>
                          {v.supplierCode}
                        </td>
                        <td style={{ padding: '10px 12px', fontWeight: 650, color: '#0F172A' }}>
                          {v.supplierName}
                        </td>
                        <td style={{ padding: '10px 12px', color: '#475569' }}>
                          {v.supplierType} {v.organizationType ? `(${v.organizationType})` : ''}
                        </td>
                        <td style={{ padding: '10px 12px', fontSize: '11.5px', color: '#475569' }}>
                          {v.gstNo || v.panCardNo || '—'}
                        </td>
                        <td style={{ padding: '10px 12px', fontSize: '11.5px', color: '#475569' }}>
                          {v.primaryContactPersonMobileNo || v.primaryContactPerson || '—'}
                        </td>
                        <td style={{ padding: '10px 12px', color: '#475569' }}>
                          {v.bank1City || v.stateCode || '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // VIEW B: IN-PAGE READ-ONLY VENDOR PROFILE (STRICTLY READ-ONLY FOR HOSPITALS)
  // ─────────────────────────────────────────────────────────────────────────────
  if (activeView === 'view-vendor' && viewingVendor) {
    const supplierFields = getVendorFieldsBySection('supplier_details');
    const contactFields = getVendorFieldsBySection('concern_person_details');
    const statutoryFields = getVendorFieldsBySection('statutory_details');
    const bankFields = getVendorFieldsBySection('bank_details');
    const gstFields = getVendorFieldsBySection('gst_details');
    const termsFields = getVendorFieldsBySection('terms_conditions');

    // Step 1 groupings
    const identityFieldKeys = ['supplierName', 'supplierCode', 'supplierType', 'supplierCategory', 'organizationType', 'activeStatus', 'sNo', 'supplierId'];
    const addressFieldKeys = ['houseNo', 'street', 'stateCode', 'pinCode', 'landline', 'faxNo', 'emailId', 'website'];
    const identityFields = supplierFields.filter(f => identityFieldKeys.includes(f.fieldKey)).sort((a,b) => identityFieldKeys.indexOf(a.fieldKey) - identityFieldKeys.indexOf(b.fieldKey));
    const addressFields = supplierFields.filter(f => addressFieldKeys.includes(f.fieldKey)).sort((a,b) => addressFieldKeys.indexOf(a.fieldKey) - addressFieldKeys.indexOf(b.fieldKey));

    // Step 2 groupings
    const primaryFieldKeys = ['primaryContactPerson', 'primaryContactPersonDesignation', 'primaryContactPersonMobileNo', 'primaryContactPersonEmailId'];
    const secondaryFieldKeys = ['secondaryContactPerson', 'secondaryContactPersonDesignation', 'secondaryContactPersonMobileNo', 'secondaryContactPersonEmailId'];
    const primaryFields = contactFields.filter(f => primaryFieldKeys.includes(f.fieldKey)).sort((a,b) => primaryFieldKeys.indexOf(a.fieldKey) - primaryFieldKeys.indexOf(b.fieldKey));
    const secondaryFields = contactFields.filter(f => secondaryFieldKeys.includes(f.fieldKey)).sort((a,b) => secondaryFieldKeys.indexOf(a.fieldKey) - secondaryFieldKeys.indexOf(b.fieldKey));

    // Step 3 groupings
    const corporateFieldKeys = ['cinNo', 'rocNo', 'nameonPanCard', 'panCardNo', 'pfRegistartionNo', 'esiRegistrationNo'];
    const complianceFieldKeys = ['isoCertificationNo', 'isoValidUpto', 'pollutioncontrolBoardCertificationNo', 'pollutionValidUpto', 'isMsmeRegistration', 'msmeRegistrationNo', 'msmeRegistrationValidDate'];
    const corporateFields = statutoryFields.filter(f => corporateFieldKeys.includes(f.fieldKey)).sort((a,b) => corporateFieldKeys.indexOf(a.fieldKey) - corporateFieldKeys.indexOf(b.fieldKey));
    const complianceFields = statutoryFields.filter(f => complianceFieldKeys.includes(f.fieldKey)).sort((a,b) => complianceFieldKeys.indexOf(a.fieldKey) - complianceFieldKeys.indexOf(b.fieldKey));

    // Step 4 groupings
    const bankGstFields = [...bankFields, ...gstFields];

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', width: '100%', minWidth: 0 }}>
        {/* STICKY TOP ACTION BAR */}
        <div style={{
          position: 'sticky',
          top: 0,
          zIndex: 40,
          background: 'rgba(255, 255, 255, 0.98)',
          backdropFilter: 'blur(8px)',
          borderRadius: '8px',
          border: '1px solid #CBD5E1',
          padding: '8px 14px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '8px',
          boxShadow: '0 2px 4px rgba(0,0,0,0.03)'
        }}>
          {/* Left: Back button + Title */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <button
              onClick={() => setActiveView(null)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
                padding: '5px 10px',
                borderRadius: '5px',
                border: '1px solid #CBD5E1',
                background: '#FFFFFF',
                color: '#334155',
                fontSize: '11.5px',
                fontWeight: 700,
                cursor: 'pointer'
              }}
            >
              <LucideIcon name="arrow-left" size={13} />
              My Vendors
            </button>

            <div style={{ height: '18px', width: '1px', background: '#E2E8F0' }} />

            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ fontSize: '14px', fontWeight: 800, color: '#0F172A' }}>
                Profile: {viewingVendor.supplierName || 'Global Vendor'}
              </span>
              <span style={{
                fontSize: '10px',
                fontWeight: 750,
                padding: '1px 6px',
                borderRadius: '4px',
                background: '#F1F5F9',
                color: '#475569'
              }}>
                READ ONLY
              </span>
            </div>
          </div>

          {/* Right: Close Profile */}
          <button
            type="button"
            onClick={() => setActiveView(null)}
            style={{
              padding: '5px 14px',
              borderRadius: '5px',
              border: '1px solid #CBD5E1',
              background: '#FFFFFF',
              color: '#475569',
              fontSize: '11.5px',
              fontWeight: 650,
              cursor: 'pointer'
            }}
          >
            Close Profile
          </button>
        </div>

        {/* MODERN INTERACTIVE STEPPER BAR */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: '#FFFFFF',
          border: '1px solid #E2E8F0',
          borderRadius: '8px',
          padding: '6px 10px',
          gap: '6px',
          boxShadow: '0 1px 2px rgba(0,0,0,0.02)'
        }}>
          {VENDOR_FORM_STEPS.map((s) => {
            const isAll = s.step === 'all';
            const isCurrent = currentStep === s.step;
            const isCompleted = typeof currentStep === 'number' && typeof s.step === 'number' && currentStep > s.step;

            return (
              <button
                key={s.id}
                type="button"
                onClick={() => setCurrentStep(s.step)}
                style={{
                  flex: isAll ? '0 0 auto' : 1,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '6px 10px',
                  borderRadius: '6px',
                  border: isCurrent ? '1.5px solid #2563EB' : '1px solid #E2E8F0',
                  background: isCurrent ? '#EFF6FF' : (isCompleted ? '#F8FAFC' : '#FFFFFF'),
                  cursor: 'pointer',
                  textAlign: 'left',
                  transition: 'all 0.15s ease'
                }}
              >
                {!isAll && (
                  <div style={{
                    width: '22px',
                    height: '22px',
                    borderRadius: '50%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '11px',
                    fontWeight: 800,
                    background: isCurrent ? '#2563EB' : (isCompleted ? '#10B981' : '#F1F5F9'),
                    color: isCurrent || isCompleted ? '#FFFFFF' : '#64748B',
                    flexShrink: 0
                  }}>
                    {isCompleted && !isCurrent ? '✓' : s.step}
                  </div>
                )}
                {isAll && (
                  <LucideIcon name="layers" size={14} color={isCurrent ? '#2563EB' : '#64748B'} />
                )}
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: '11.5px', fontWeight: isCurrent ? 800 : 650, color: isCurrent ? '#1D4ED8' : '#1E293B', whiteSpace: 'nowrap' }}>
                    {s.shortTitle}
                  </div>
                  <div style={{ fontSize: '10px', color: '#64748B', whiteSpace: 'nowrap' }}>
                    {s.fieldCount} fields
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {/* STEP CONTENT WORKING AREA (READ-ONLY) */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', width: '100%' }}>
          {/* STEP 1: SUPPLIER PROFILE & ADDRESS */}
          {(currentStep === 1 || currentStep === 'all') && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', width: '100%' }}>
              {/* Card 1A: Identification & Classification */}
              <div style={{ background: '#FFFFFF', border: '1px solid #CBD5E1', borderRadius: '6px', overflow: 'hidden', boxShadow: '0 1px 2px rgba(0,0,0,0.02)' }}>
                <div style={{ background: 'linear-gradient(90deg, #1E40AF 0%, #2563EB 50%, #3B82F6 100%)', color: '#FFFFFF', padding: '5px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '11px', fontWeight: 750, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <LucideIcon name="building-2" size={13} color="#FFFFFF" />
                    <span>Supplier Identity & Classification</span>
                  </div>
                  <span style={{ fontSize: '10px', opacity: 0.9, fontWeight: 600 }}>8 Fields</span>
                </div>
                <div style={{ padding: '8px 12px', display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', columnGap: '16px', rowGap: '6px' }}>
                  {identityFields.map(f => renderHospitalAlignedField(f, true, viewingVendor, null, null, '112px'))}
                </div>
              </div>

              {/* Card 1B: Office Address & Communication */}
              <div style={{ background: '#FFFFFF', border: '1px solid #CBD5E1', borderRadius: '6px', overflow: 'hidden', boxShadow: '0 1px 2px rgba(0,0,0,0.02)' }}>
                <div style={{ background: 'linear-gradient(90deg, #1E40AF 0%, #2563EB 50%, #3B82F6 100%)', color: '#FFFFFF', padding: '5px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '11px', fontWeight: 750, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <LucideIcon name="map-pin" size={13} color="#FFFFFF" />
                    <span>Office Address & Communication</span>
                  </div>
                  <span style={{ fontSize: '10px', opacity: 0.9, fontWeight: 600 }}>8 Fields</span>
                </div>
                <div style={{ padding: '8px 12px', display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', columnGap: '16px', rowGap: '6px' }}>
                  {addressFields.map(f => renderHospitalAlignedField(f, true, viewingVendor, null, null, '112px'))}
                </div>
              </div>
            </div>
          )}

          {/* STEP 2: CONCERN PERSON DETAILS */}
          {(currentStep === 2 || currentStep === 'all') && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', width: '100%' }}>
              {/* Card 2A: Primary Contact Person */}
              <div style={{ background: '#FFFFFF', border: '1px solid #CBD5E1', borderRadius: '6px', overflow: 'hidden', boxShadow: '0 1px 2px rgba(0,0,0,0.02)' }}>
                <div style={{ background: 'linear-gradient(90deg, #1E40AF 0%, #2563EB 50%, #3B82F6 100%)', color: '#FFFFFF', padding: '5px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '11px', fontWeight: 750, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <LucideIcon name="user-check" size={13} color="#FFFFFF" />
                    <span>Primary Contact Person</span>
                  </div>
                  <span style={{ fontSize: '10px', opacity: 0.9, fontWeight: 600 }}>4 Fields</span>
                </div>
                <div style={{ padding: '8px 12px', display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', columnGap: '16px', rowGap: '6px' }}>
                  {primaryFields.map(f => {
                    let label = f.clientHeader;
                    if (f.fieldKey === 'primaryContactPerson') label = 'Contact Name';
                    if (f.fieldKey === 'primaryContactPersonDesignation') label = 'Designation';
                    if (f.fieldKey === 'primaryContactPersonMobileNo') label = 'Mobile No.';
                    if (f.fieldKey === 'primaryContactPersonEmailId') label = 'Email ID';
                    return renderHospitalAlignedField(f, true, viewingVendor, null, label, '95px');
                  })}
                </div>
              </div>

              {/* Card 2B: Secondary Contact Person */}
              <div style={{ background: '#FFFFFF', border: '1px solid #CBD5E1', borderRadius: '6px', overflow: 'hidden', boxShadow: '0 1px 2px rgba(0,0,0,0.02)' }}>
                <div style={{ background: 'linear-gradient(90deg, #1E40AF 0%, #2563EB 50%, #3B82F6 100%)', color: '#FFFFFF', padding: '5px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '11px', fontWeight: 750, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <LucideIcon name="users" size={13} color="#FFFFFF" />
                    <span>Secondary Contact Person</span>
                  </div>
                  <span style={{ fontSize: '10px', opacity: 0.9, fontWeight: 600 }}>4 Fields</span>
                </div>
                <div style={{ padding: '8px 12px', display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', columnGap: '16px', rowGap: '6px' }}>
                  {secondaryFields.map(f => {
                    let label = f.clientHeader;
                    if (f.fieldKey === 'secondaryContactPerson') label = 'Contact Name';
                    if (f.fieldKey === 'secondaryContactPersonDesignation') label = 'Designation';
                    if (f.fieldKey === 'secondaryContactPersonMobileNo') label = 'Mobile No.';
                    if (f.fieldKey === 'secondaryContactPersonEmailId') label = 'Email ID';
                    return renderHospitalAlignedField(f, true, viewingVendor, null, label, '95px');
                  })}
                </div>
              </div>
            </div>
          )}

          {/* STEP 3: STATUTORY / MSME / PAN REGISTRATION */}
          {(currentStep === 3 || currentStep === 'all') && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', width: '100%' }}>
              {/* Card 3A: Corporate & Tax Registrations */}
              <div style={{ background: '#FFFFFF', border: '1px solid #CBD5E1', borderRadius: '6px', overflow: 'hidden', boxShadow: '0 1px 2px rgba(0,0,0,0.02)' }}>
                <div style={{ background: 'linear-gradient(90deg, #1E40AF 0%, #2563EB 50%, #3B82F6 100%)', color: '#FFFFFF', padding: '5px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '11px', fontWeight: 750, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <LucideIcon name="file-text" size={13} color="#FFFFFF" />
                    <span>Corporate & Tax Registrations</span>
                  </div>
                  <span style={{ fontSize: '10px', opacity: 0.9, fontWeight: 600 }}>6 Fields</span>
                </div>
                <div style={{ padding: '8px 12px', display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', columnGap: '16px', rowGap: '6px' }}>
                  {corporateFields.map(f => {
                    let label = f.clientHeader;
                    if (f.fieldKey === 'panCardNo') label = 'PAN Card No';
                    if (f.fieldKey === 'nameonPanCard') label = 'Name on PAN';
                    if (f.fieldKey === 'pfRegistartionNo') label = 'PF Reg No';
                    if (f.fieldKey === 'esiRegistrationNo') label = 'ESI Reg No';
                    return renderHospitalAlignedField(f, true, viewingVendor, null, label, '112px');
                  })}
                </div>
              </div>

              {/* Card 3B: Certifications & MSME Compliance */}
              <div style={{ background: '#FFFFFF', border: '1px solid #CBD5E1', borderRadius: '6px', overflow: 'hidden', boxShadow: '0 1px 2px rgba(0,0,0,0.02)' }}>
                <div style={{ background: 'linear-gradient(90deg, #1E40AF 0%, #2563EB 50%, #3B82F6 100%)', color: '#FFFFFF', padding: '5px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '11px', fontWeight: 750, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <LucideIcon name="award" size={13} color="#FFFFFF" />
                    <span>Certifications & MSME Compliance</span>
                  </div>
                  <span style={{ fontSize: '10px', opacity: 0.9, fontWeight: 600 }}>7 Fields</span>
                </div>
                <div style={{ padding: '8px 12px', display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', columnGap: '16px', rowGap: '6px' }}>
                  {complianceFields.map(f => {
                    let label = f.clientHeader;
                    if (f.fieldKey === 'isoCertificationNo') label = 'ISO Cert No';
                    if (f.fieldKey === 'isoValidUpto') label = 'ISO Valid Upto';
                    if (f.fieldKey === 'pollutioncontrolBoardCertificationNo') label = 'Pollution Cert';
                    if (f.fieldKey === 'pollutionValidUpto') label = 'Pollution Valid';
                    if (f.fieldKey === 'isMsmeRegistration') label = 'MSME Reg?';
                    if (f.fieldKey === 'msmeRegistrationNo') label = 'MSME Reg No';
                    if (f.fieldKey === 'msmeRegistrationValidDate') label = 'MSME Valid';
                    return renderHospitalAlignedField(f, true, viewingVendor, null, label, '112px');
                  })}
                </div>
              </div>
            </div>
          )}

          {/* STEP 4: BANKING, GST & TERMS */}
          {(currentStep === 4 || currentStep === 'all') && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', width: '100%' }}>
              {/* Card 4A: Bank & GST Details */}
              <div style={{ background: '#FFFFFF', border: '1px solid #CBD5E1', borderRadius: '6px', overflow: 'hidden', boxShadow: '0 1px 2px rgba(0,0,0,0.02)' }}>
                <div style={{ background: 'linear-gradient(90deg, #1E40AF 0%, #2563EB 50%, #3B82F6 100%)', color: '#FFFFFF', padding: '5px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '11px', fontWeight: 750, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <LucideIcon name="landmark" size={13} color="#FFFFFF" />
                    <span>Bank Accounts & GST Details</span>
                  </div>
                  <span style={{ fontSize: '10px', opacity: 0.9, fontWeight: 600 }}>9 Fields</span>
                </div>
                <div style={{ padding: '8px 12px', display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', columnGap: '16px', rowGap: '6px' }}>
                  {bankGstFields.map(f => {
                    let label = f.clientHeader;
                    if (f.fieldKey === 'banKAccountsNo') label = 'Bank A/C No';
                    if (f.fieldKey === 'bankIfscCode') label = 'IFSC Code';
                    if (f.fieldKey === 'banKAddress') label = 'Bank Address';
                    if (f.fieldKey === 'bankAddress2') label = 'Bank Address 2';
                    if (f.fieldKey === 'bank1City') label = 'City';
                    return renderHospitalAlignedField(f, true, viewingVendor, null, label, '112px');
                  })}
                </div>
              </div>

              {/* Card 4B: Commercial Terms & Conditions */}
              <div style={{ background: '#FFFFFF', border: '1px solid #CBD5E1', borderRadius: '6px', overflow: 'hidden', boxShadow: '0 1px 2px rgba(0,0,0,0.02)' }}>
                <div style={{ background: 'linear-gradient(90deg, #1E40AF 0%, #2563EB 50%, #3B82F6 100%)', color: '#FFFFFF', padding: '5px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '11px', fontWeight: 750, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <LucideIcon name="scroll-text" size={13} color="#FFFFFF" />
                    <span>Commercial Terms & Notes</span>
                  </div>
                  <span style={{ fontSize: '10px', opacity: 0.9, fontWeight: 600 }}>3 Fields</span>
                </div>
                <div style={{ padding: '8px 12px', display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', columnGap: '16px', rowGap: '6px' }}>
                  {termsFields.map(f => renderHospitalAlignedField(f, true, viewingVendor, null, null, '112px'))}
                </div>
              </div>
            </div>
          )}

          {/* STEP WIZARD FOOTER NAVIGATION */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: '#FFFFFF',
            border: '1px solid #CBD5E1',
            borderRadius: '8px',
            padding: '8px 16px',
            boxShadow: '0 1px 2px rgba(0,0,0,0.02)'
          }}>
            <button
              type="button"
              disabled={currentStep === 1 || currentStep === 'all'}
              onClick={() => setCurrentStep(prev => typeof prev === 'number' ? Math.max(1, prev - 1) : 1)}
              style={{
                padding: '6px 14px',
                borderRadius: '5px',
                border: '1px solid #CBD5E1',
                background: currentStep === 1 || currentStep === 'all' ? '#F8FAFC' : '#FFFFFF',
                color: currentStep === 1 || currentStep === 'all' ? '#94A3B8' : '#334155',
                fontSize: '12px',
                fontWeight: 650,
                cursor: currentStep === 1 || currentStep === 'all' ? 'not-allowed' : 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              <LucideIcon name="arrow-left" size={13} />
              Previous Step
            </button>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: '#475569' }}>
              {typeof currentStep === 'number' ? (
                <>
                  <span>Step <strong>{currentStep}</strong> of <strong>4</strong>:</span>
                  <span style={{ fontWeight: 700, color: '#0F172A' }}>{VENDOR_FORM_STEPS[currentStep - 1]?.title}</span>
                </>
              ) : (
                <span style={{ fontWeight: 700, color: '#0F172A' }}>All Sections Overview</span>
              )}
            </div>

            {typeof currentStep === 'number' && currentStep < 4 ? (
              <button
                type="button"
                onClick={() => setCurrentStep(prev => prev + 1)}
                style={{
                  padding: '6px 16px',
                  borderRadius: '5px',
                  border: 'none',
                  background: '#2563EB',
                  color: '#FFFFFF',
                  fontSize: '12px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                Next Step
                <LucideIcon name="arrow-right" size={13} />
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setActiveView(null)}
                style={{
                  padding: '6px 16px',
                  borderRadius: '5px',
                  border: '1px solid #CBD5E1',
                  background: '#FFFFFF',
                  color: '#334155',
                  fontSize: '12px',
                  fontWeight: 700,
                  cursor: 'pointer'
                }}
              >
                Close Profile
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // VIEW C: IN-PAGE REQUEST NEW VENDOR PROPOSAL FORM (STEP WIZARD)
  // ─────────────────────────────────────────────────────────────────────────────
  if (activeView === 'request-form') {
    const supplierFields = getVendorFieldsBySection('supplier_details');
    const contactFields = getVendorFieldsBySection('concern_person_details');
    const statutoryFields = getVendorFieldsBySection('statutory_details');
    const bankFields = getVendorFieldsBySection('bank_details');
    const gstFields = getVendorFieldsBySection('gst_details');
    const termsFields = getVendorFieldsBySection('terms_conditions');

    // Step 1 groupings
    const identityFieldKeys = ['supplierName', 'supplierCode', 'supplierType', 'supplierCategory', 'organizationType', 'activeStatus', 'sNo', 'supplierId'];
    const addressFieldKeys = ['houseNo', 'street', 'stateCode', 'pinCode', 'landline', 'faxNo', 'emailId', 'website'];
    const identityFields = supplierFields.filter(f => identityFieldKeys.includes(f.fieldKey)).sort((a,b) => identityFieldKeys.indexOf(a.fieldKey) - identityFieldKeys.indexOf(b.fieldKey));
    const addressFields = supplierFields.filter(f => addressFieldKeys.includes(f.fieldKey)).sort((a,b) => addressFieldKeys.indexOf(a.fieldKey) - addressFieldKeys.indexOf(b.fieldKey));

    // Step 2 groupings
    const primaryFieldKeys = ['primaryContactPerson', 'primaryContactPersonDesignation', 'primaryContactPersonMobileNo', 'primaryContactPersonEmailId'];
    const secondaryFieldKeys = ['secondaryContactPerson', 'secondaryContactPersonDesignation', 'secondaryContactPersonMobileNo', 'secondaryContactPersonEmailId'];
    const primaryFields = contactFields.filter(f => primaryFieldKeys.includes(f.fieldKey)).sort((a,b) => primaryFieldKeys.indexOf(a.fieldKey) - primaryFieldKeys.indexOf(b.fieldKey));
    const secondaryFields = contactFields.filter(f => secondaryFieldKeys.includes(f.fieldKey)).sort((a,b) => secondaryFieldKeys.indexOf(a.fieldKey) - secondaryFieldKeys.indexOf(b.fieldKey));

    // Step 3 groupings
    const corporateFieldKeys = ['cinNo', 'rocNo', 'nameonPanCard', 'panCardNo', 'pfRegistartionNo', 'esiRegistrationNo'];
    const complianceFieldKeys = ['isoCertificationNo', 'isoValidUpto', 'pollutioncontrolBoardCertificationNo', 'pollutionValidUpto', 'isMsmeRegistration', 'msmeRegistrationNo', 'msmeRegistrationValidDate'];
    const corporateFields = statutoryFields.filter(f => corporateFieldKeys.includes(f.fieldKey)).sort((a,b) => corporateFieldKeys.indexOf(a.fieldKey) - corporateFieldKeys.indexOf(b.fieldKey));
    const complianceFields = statutoryFields.filter(f => complianceFieldKeys.includes(f.fieldKey)).sort((a,b) => complianceFieldKeys.indexOf(a.fieldKey) - complianceFieldKeys.indexOf(b.fieldKey));

    // Step 4 groupings
    const bankGstFields = [...bankFields, ...gstFields];

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', width: '100%', minWidth: 0 }}>
        {/* STICKY TOP ACTION BAR — NEVER HIDDEN, ALWAYS ACCESSIBLE */}
        <div style={{
          position: 'sticky',
          top: 0,
          zIndex: 40,
          background: 'rgba(255, 255, 255, 0.98)',
          backdropFilter: 'blur(8px)',
          borderRadius: '8px',
          border: '1px solid #CBD5E1',
          padding: '8px 14px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '8px',
          boxShadow: '0 2px 4px rgba(0,0,0,0.03)'
        }}>
          {/* Left: Back button + Title */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <button
              onClick={() => setActiveView(null)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
                padding: '5px 10px',
                borderRadius: '5px',
                border: '1px solid #CBD5E1',
                background: '#FFFFFF',
                color: '#334155',
                fontSize: '11.5px',
                fontWeight: 700,
                cursor: 'pointer'
              }}
            >
              <LucideIcon name="arrow-left" size={13} />
              My Vendors
            </button>

            <div style={{ height: '18px', width: '1px', background: '#E2E8F0' }} />

            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ fontSize: '14px', fontWeight: 800, color: '#0F172A' }}>
                Request New Global Vendor (Step Wizard)
              </span>
              <span style={{
                fontSize: '10px',
                fontWeight: 750,
                padding: '1px 6px',
                borderRadius: '4px',
                background: '#FEF3C7',
                color: '#B45309'
              }}>
                REQUIRES ADMIN APPROVAL
              </span>
            </div>
          </div>

          {/* Right: Action Buttons — ALWAYS PROMINENT AND VISIBLE */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              type="button"
              onClick={() => setActiveView(null)}
              style={{
                padding: '5px 12px',
                borderRadius: '5px',
                border: '1px solid #CBD5E1',
                background: '#FFFFFF',
                color: '#475569',
                fontSize: '11.5px',
                fontWeight: 650,
                cursor: 'pointer'
              }}
            >
              Cancel
            </button>

            <button
              type="button"
              disabled={submittingRequest}
              onClick={handleSubmitVendorRequest}
              style={{
                padding: '5px 18px',
                borderRadius: '5px',
                border: 'none',
                background: '#2563EB',
                color: '#FFFFFF',
                fontSize: '12px',
                fontWeight: 750,
                cursor: submittingRequest ? 'not-allowed' : 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                boxShadow: '0 1px 3px rgba(37,99,235,0.3)'
              }}
            >
              {submittingRequest && <LucideIcon name="loader-2" size={13} style={{ animation: 'spin 1s linear infinite' }} />}
              Submit Proposal
            </button>
          </div>
        </div>

        {/* MODERN INTERACTIVE STEPPER BAR */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: '#FFFFFF',
          border: '1px solid #E2E8F0',
          borderRadius: '8px',
          padding: '6px 10px',
          gap: '6px',
          boxShadow: '0 1px 2px rgba(0,0,0,0.02)'
        }}>
          {VENDOR_FORM_STEPS.map((s) => {
            const isAll = s.step === 'all';
            const isCurrent = currentStep === s.step;
            const isCompleted = typeof currentStep === 'number' && typeof s.step === 'number' && currentStep > s.step;
            const isStep1Missing = s.step === 1 && (!requestFormData.supplierName?.trim() || !requestFormData.supplierType?.trim() || !requestFormData.supplierCategory?.trim() || !requestFormData.organizationType?.trim());
            const isStep2Missing = s.step === 2 && !requestFormData.primaryContactPerson?.trim();
            const isMissingRequired = isStep1Missing || isStep2Missing;

            return (
              <button
                key={s.id}
                type="button"
                onClick={() => setCurrentStep(s.step)}
                style={{
                  flex: isAll ? '0 0 auto' : 1,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '6px 10px',
                  borderRadius: '6px',
                  border: isCurrent ? '1.5px solid #2563EB' : '1px solid #E2E8F0',
                  background: isCurrent ? '#EFF6FF' : (isCompleted ? '#F8FAFC' : '#FFFFFF'),
                  cursor: 'pointer',
                  textAlign: 'left',
                  transition: 'all 0.15s ease'
                }}
              >
                {!isAll && (
                  <div style={{
                    width: '22px',
                    height: '22px',
                    borderRadius: '50%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '11px',
                    fontWeight: 800,
                    background: isCurrent ? '#2563EB' : (isCompleted ? '#10B981' : (isMissingRequired ? '#FEE2E2' : '#F1F5F9')),
                    color: isCurrent || isCompleted ? '#FFFFFF' : (isMissingRequired ? '#DC2626' : '#64748B'),
                    flexShrink: 0
                  }}>
                    {isCompleted && !isCurrent ? '✓' : s.step}
                  </div>
                )}
                {isAll && (
                  <LucideIcon name="layers" size={14} color={isCurrent ? '#2563EB' : '#64748B'} />
                )}
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <span style={{
                      fontSize: '11.5px',
                      fontWeight: isCurrent ? 800 : 650,
                      color: isCurrent ? '#1D4ED8' : '#1E293B',
                      whiteSpace: 'nowrap'
                    }}>
                      {s.shortTitle}
                    </span>
                    {s.hasRequired && isMissingRequired && (
                      <span style={{ fontSize: '10px', color: '#DC2626', fontWeight: 900 }} title="Contains required field">*</span>
                    )}
                  </div>
                  <div style={{ fontSize: '10px', color: '#64748B', whiteSpace: 'nowrap' }}>
                    {s.fieldCount} fields {s.hasRequired ? `• ${s.requiredCount} Required` : ''}
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {/* Error Banner */}
        {requestFormError && (
          <div style={{
            background: '#FEE2E2',
            borderLeft: '4px solid #EF4444',
            color: '#991B1B',
            padding: '8px 14px',
            fontSize: '12px',
            fontWeight: 600,
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            borderRadius: '5px'
          }}>
            <LucideIcon name="alert-circle" size={15} color="#DC2626" />
            {requestFormError}
          </div>
        )}

        {/* STEP CONTENT WORKING AREA */}
        <form onSubmit={handleSubmitVendorRequest} style={{ display: 'flex', flexDirection: 'column', gap: '8px', width: '100%' }}>
          {/* STEP 1: SUPPLIER PROFILE & ADDRESS */}
          {(currentStep === 1 || currentStep === 'all') && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', width: '100%' }}>
              {/* Card 1A: Identification & Classification */}
              <div style={{ background: '#FFFFFF', border: '1px solid #CBD5E1', borderRadius: '6px', overflow: 'hidden', boxShadow: '0 1px 2px rgba(0,0,0,0.02)' }}>
                <div style={{ background: 'linear-gradient(90deg, #1E40AF 0%, #2563EB 50%, #3B82F6 100%)', color: '#FFFFFF', padding: '5px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '11px', fontWeight: 750, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <LucideIcon name="building-2" size={13} color="#FFFFFF" />
                    <span>Supplier Identity & Classification</span>
                  </div>
                  <span style={{ fontSize: '10px', opacity: 0.95, fontWeight: 700 }}>
                    8 Fields • <strong style={{ color: '#FEE2E2', textDecoration: 'underline' }}>4 Required (Red Line)</strong>
                  </span>
                </div>
                <div style={{ padding: '8px 12px', display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', columnGap: '16px', rowGap: '6px' }}>
                  {identityFields.map(f => renderHospitalAlignedField(f, false, requestFormData, handleRequestFieldChange, null, '112px'))}
                </div>
              </div>

              {/* Card 1B: Office Address & Communication */}
              <div style={{ background: '#FFFFFF', border: '1px solid #CBD5E1', borderRadius: '6px', overflow: 'hidden', boxShadow: '0 1px 2px rgba(0,0,0,0.02)' }}>
                <div style={{ background: 'linear-gradient(90deg, #1E40AF 0%, #2563EB 50%, #3B82F6 100%)', color: '#FFFFFF', padding: '5px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '11px', fontWeight: 750, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <LucideIcon name="map-pin" size={13} color="#FFFFFF" />
                    <span>Office Address & Communication</span>
                  </div>
                  <span style={{ fontSize: '10px', opacity: 0.9, fontWeight: 600 }}>8 Fields</span>
                </div>
                <div style={{ padding: '8px 12px', display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', columnGap: '16px', rowGap: '6px' }}>
                  {addressFields.map(f => renderHospitalAlignedField(f, false, requestFormData, handleRequestFieldChange, null, '112px'))}
                </div>
              </div>
            </div>
          )}

          {/* STEP 2: CONCERN PERSON DETAILS */}
          {(currentStep === 2 || currentStep === 'all') && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', width: '100%' }}>
              {/* Card 2A: Primary Contact Person */}
              <div style={{ background: '#FFFFFF', border: '1px solid #CBD5E1', borderRadius: '6px', overflow: 'hidden', boxShadow: '0 1px 2px rgba(0,0,0,0.02)' }}>
                <div style={{ background: 'linear-gradient(90deg, #1E40AF 0%, #2563EB 50%, #3B82F6 100%)', color: '#FFFFFF', padding: '5px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '11px', fontWeight: 750, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <LucideIcon name="user-check" size={13} color="#FFFFFF" />
                    <span>Primary Contact Person</span>
                  </div>
                  <span style={{ fontSize: '10px', opacity: 0.95, fontWeight: 700 }}>
                    4 Fields • <strong style={{ color: '#FEE2E2', textDecoration: 'underline' }}>Primary Contact * Required (Red Line)</strong>
                  </span>
                </div>
                <div style={{ padding: '8px 12px', display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', columnGap: '16px', rowGap: '6px' }}>
                  {primaryFields.map(f => {
                    let label = f.clientHeader;
                    if (f.fieldKey === 'primaryContactPerson') label = 'Contact Name';
                    if (f.fieldKey === 'primaryContactPersonDesignation') label = 'Designation';
                    if (f.fieldKey === 'primaryContactPersonMobileNo') label = 'Mobile No.';
                    if (f.fieldKey === 'primaryContactPersonEmailId') label = 'Email ID';
                    return renderHospitalAlignedField(f, false, requestFormData, handleRequestFieldChange, label, '95px');
                  })}
                </div>
              </div>

              {/* Card 2B: Secondary Contact Person */}
              <div style={{ background: '#FFFFFF', border: '1px solid #CBD5E1', borderRadius: '6px', overflow: 'hidden', boxShadow: '0 1px 2px rgba(0,0,0,0.02)' }}>
                <div style={{ background: 'linear-gradient(90deg, #1E40AF 0%, #2563EB 50%, #3B82F6 100%)', color: '#FFFFFF', padding: '5px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '11px', fontWeight: 750, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <LucideIcon name="users" size={13} color="#FFFFFF" />
                    <span>Secondary Contact Person</span>
                  </div>
                  <span style={{ fontSize: '10px', opacity: 0.9, fontWeight: 600 }}>4 Fields</span>
                </div>
                <div style={{ padding: '8px 12px', display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', columnGap: '16px', rowGap: '6px' }}>
                  {secondaryFields.map(f => {
                    let label = f.clientHeader;
                    if (f.fieldKey === 'secondaryContactPerson') label = 'Contact Name';
                    if (f.fieldKey === 'secondaryContactPersonDesignation') label = 'Designation';
                    if (f.fieldKey === 'secondaryContactPersonMobileNo') label = 'Mobile No.';
                    if (f.fieldKey === 'secondaryContactPersonEmailId') label = 'Email ID';
                    return renderHospitalAlignedField(f, false, requestFormData, handleRequestFieldChange, label, '95px');
                  })}
                </div>
              </div>
            </div>
          )}

          {/* STEP 3: STATUTORY / MSME / PAN REGISTRATION */}
          {(currentStep === 3 || currentStep === 'all') && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', width: '100%' }}>
              {/* Card 3A: Corporate & Tax Registrations */}
              <div style={{ background: '#FFFFFF', border: '1px solid #CBD5E1', borderRadius: '6px', overflow: 'hidden', boxShadow: '0 1px 2px rgba(0,0,0,0.02)' }}>
                <div style={{ background: 'linear-gradient(90deg, #1E40AF 0%, #2563EB 50%, #3B82F6 100%)', color: '#FFFFFF', padding: '5px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '11px', fontWeight: 750, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <LucideIcon name="file-text" size={13} color="#FFFFFF" />
                    <span>Corporate & Tax Registrations</span>
                  </div>
                  <span style={{ fontSize: '10px', opacity: 0.9, fontWeight: 600 }}>6 Fields</span>
                </div>
                <div style={{ padding: '8px 12px', display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', columnGap: '16px', rowGap: '6px' }}>
                  {corporateFields.map(f => {
                    let label = f.clientHeader;
                    if (f.fieldKey === 'panCardNo') label = 'PAN Card No';
                    if (f.fieldKey === 'nameonPanCard') label = 'Name on PAN';
                    if (f.fieldKey === 'pfRegistartionNo') label = 'PF Reg No';
                    if (f.fieldKey === 'esiRegistrationNo') label = 'ESI Reg No';
                    return renderHospitalAlignedField(f, false, requestFormData, handleRequestFieldChange, label, '112px');
                  })}
                </div>
              </div>

              {/* Card 3B: Certifications & MSME Compliance */}
              <div style={{ background: '#FFFFFF', border: '1px solid #CBD5E1', borderRadius: '6px', overflow: 'hidden', boxShadow: '0 1px 2px rgba(0,0,0,0.02)' }}>
                <div style={{ background: 'linear-gradient(90deg, #1E40AF 0%, #2563EB 50%, #3B82F6 100%)', color: '#FFFFFF', padding: '5px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '11px', fontWeight: 750, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <LucideIcon name="award" size={13} color="#FFFFFF" />
                    <span>Certifications & MSME Compliance</span>
                  </div>
                  <span style={{ fontSize: '10px', opacity: 0.9, fontWeight: 600 }}>7 Fields</span>
                </div>
                <div style={{ padding: '8px 12px', display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', columnGap: '16px', rowGap: '6px' }}>
                  {complianceFields.map(f => {
                    let label = f.clientHeader;
                    if (f.fieldKey === 'isoCertificationNo') label = 'ISO Cert No';
                    if (f.fieldKey === 'isoValidUpto') label = 'ISO Valid Upto';
                    if (f.fieldKey === 'pollutioncontrolBoardCertificationNo') label = 'Pollution Cert';
                    if (f.fieldKey === 'pollutionValidUpto') label = 'Pollution Valid';
                    if (f.fieldKey === 'isMsmeRegistration') label = 'MSME Reg?';
                    if (f.fieldKey === 'msmeRegistrationNo') label = 'MSME Reg No';
                    if (f.fieldKey === 'msmeRegistrationValidDate') label = 'MSME Valid';
                    return renderHospitalAlignedField(f, false, requestFormData, handleRequestFieldChange, label, '112px');
                  })}
                </div>
              </div>
            </div>
          )}

          {/* STEP 4: BANKING, GST & TERMS */}
          {(currentStep === 4 || currentStep === 'all') && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', width: '100%' }}>
              {/* Card 4A: Bank & GST Details */}
              <div style={{ background: '#FFFFFF', border: '1px solid #CBD5E1', borderRadius: '6px', overflow: 'hidden', boxShadow: '0 1px 2px rgba(0,0,0,0.02)' }}>
                <div style={{ background: 'linear-gradient(90deg, #1E40AF 0%, #2563EB 50%, #3B82F6 100%)', color: '#FFFFFF', padding: '5px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '11px', fontWeight: 750, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <LucideIcon name="landmark" size={13} color="#FFFFFF" />
                    <span>Bank Accounts & GST Details</span>
                  </div>
                  <span style={{ fontSize: '10px', opacity: 0.9, fontWeight: 600 }}>9 Fields</span>
                </div>
                <div style={{ padding: '8px 12px', display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', columnGap: '16px', rowGap: '6px' }}>
                  {bankGstFields.map(f => {
                    let label = f.clientHeader;
                    if (f.fieldKey === 'banKAccountsNo') label = 'Bank A/C No';
                    if (f.fieldKey === 'bankIfscCode') label = 'IFSC Code';
                    if (f.fieldKey === 'banKAddress') label = 'Bank Address';
                    if (f.fieldKey === 'bankAddress2') label = 'Bank Address 2';
                    if (f.fieldKey === 'bank1City') label = 'City';
                    return renderHospitalAlignedField(f, false, requestFormData, handleRequestFieldChange, label, '112px');
                  })}
                </div>
              </div>

              {/* Card 4B: Commercial Terms & Conditions */}
              <div style={{ background: '#FFFFFF', border: '1px solid #CBD5E1', borderRadius: '6px', overflow: 'hidden', boxShadow: '0 1px 2px rgba(0,0,0,0.02)' }}>
                <div style={{ background: 'linear-gradient(90deg, #1E40AF 0%, #2563EB 50%, #3B82F6 100%)', color: '#FFFFFF', padding: '5px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '11px', fontWeight: 750, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <LucideIcon name="scroll-text" size={13} color="#FFFFFF" />
                    <span>Commercial Terms & Notes</span>
                  </div>
                  <span style={{ fontSize: '10px', opacity: 0.9, fontWeight: 600 }}>3 Fields</span>
                </div>
                <div style={{ padding: '8px 12px', display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', columnGap: '16px', rowGap: '6px' }}>
                  {termsFields.map(f => renderHospitalAlignedField(f, false, requestFormData, handleRequestFieldChange, null, '112px'))}
                </div>
              </div>
            </div>
          )}

          {/* STEP WIZARD FOOTER NAVIGATION */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: '#FFFFFF',
            border: '1px solid #CBD5E1',
            borderRadius: '8px',
            padding: '8px 16px',
            boxShadow: '0 1px 2px rgba(0,0,0,0.02)'
          }}>
            <button
              type="button"
              disabled={currentStep === 1 || currentStep === 'all'}
              onClick={() => setCurrentStep(prev => typeof prev === 'number' ? Math.max(1, prev - 1) : 1)}
              style={{
                padding: '6px 14px',
                borderRadius: '5px',
                border: '1px solid #CBD5E1',
                background: currentStep === 1 || currentStep === 'all' ? '#F8FAFC' : '#FFFFFF',
                color: currentStep === 1 || currentStep === 'all' ? '#94A3B8' : '#334155',
                fontSize: '12px',
                fontWeight: 650,
                cursor: currentStep === 1 || currentStep === 'all' ? 'not-allowed' : 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              <LucideIcon name="arrow-left" size={13} />
              Previous Step
            </button>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: '#475569' }}>
              {typeof currentStep === 'number' ? (
                <>
                  <span>Step <strong>{currentStep}</strong> of <strong>4</strong>:</span>
                  <span style={{ fontWeight: 700, color: '#0F172A' }}>{VENDOR_FORM_STEPS[currentStep - 1]?.title}</span>
                  {currentStep === 1 && (!requestFormData.supplierName?.trim() || !requestFormData.supplierType?.trim() || !requestFormData.supplierCategory?.trim() || !requestFormData.organizationType?.trim()) && (
                    <span style={{ color: '#DC2626', fontSize: '11px', fontWeight: 750, background: '#FEE2E2', padding: '2px 8px', borderRadius: '4px', border: '1px solid #FCA5A5' }}>
                      * 4 Required Fields Incomplete (Red Line)
                    </span>
                  )}
                  {currentStep === 2 && !requestFormData.primaryContactPerson?.trim() && (
                    <span style={{ color: '#DC2626', fontSize: '11px', fontWeight: 750, background: '#FEE2E2', padding: '2px 8px', borderRadius: '4px', border: '1px solid #FCA5A5' }}>
                      * Primary Contact Person Required (Red Line)
                    </span>
                  )}
                </>
              ) : (
                <span style={{ fontWeight: 700, color: '#0F172A' }}>All Sections Overview</span>
              )}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              {typeof currentStep === 'number' && currentStep < 4 && (
                <button
                  type="button"
                  onClick={() => setCurrentStep(prev => prev + 1)}
                  style={{
                    padding: '6px 16px',
                    borderRadius: '5px',
                    border: 'none',
                    background: '#2563EB',
                    color: '#FFFFFF',
                    fontSize: '12px',
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px'
                  }}
                >
                  Next Step
                  <LucideIcon name="arrow-right" size={13} />
                </button>
              )}

              {(currentStep === 4 || currentStep === 'all') && (
                <button
                  type="button"
                  disabled={submittingRequest}
                  onClick={handleSubmitVendorRequest}
                  style={{
                    padding: '6px 20px',
                    borderRadius: '5px',
                    border: 'none',
                    background: '#16A34A',
                    color: '#FFFFFF',
                    fontSize: '12px',
                    fontWeight: 750,
                    cursor: submittingRequest ? 'not-allowed' : 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    boxShadow: '0 1px 3px rgba(22,163,74,0.3)'
                  }}
                >
                  {submittingRequest && <LucideIcon name="loader-2" size={13} style={{ animation: 'spin 1s linear infinite' }} />}
                  Submit Proposal for SuperAdmin Approval
                </button>
              )}
            </div>
          </div>
        </form>
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // VIEW D: MAIN HOSPITAL TABLES (MY VENDORS & MY REQUESTS)
  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', width: '100%', minWidth: 0, paddingBottom: '32px' }}>
      {/* Top Header & Sub-Tabs */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '12px',
        background: '#FFFFFF',
        padding: '10px 16px',
        borderRadius: '8px',
        border: '1px solid #E2E8F0',
        boxShadow: '0 1px 2px rgba(0,0,0,0.02)'
      }}>
        {/* Left Sub-Tabs */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <button
            onClick={() => setSubTab('my-vendors')}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '7px',
              padding: '7px 14px',
              borderRadius: '6px',
              fontSize: '13px',
              fontWeight: subTab === 'my-vendors' ? 700 : 500,
              background: subTab === 'my-vendors' ? '#2563EB' : 'transparent',
              color: subTab === 'my-vendors' ? '#FFFFFF' : '#475569',
              border: 'none',
              cursor: 'pointer',
              transition: 'all 0.15s ease'
            }}
          >
            <LucideIcon name="building-2" size={15} color={subTab === 'my-vendors' ? '#FFFFFF' : '#64748B'} />
            My Vendors
            <span style={{
              fontSize: '11px',
              padding: '1px 6px',
              borderRadius: '10px',
              background: subTab === 'my-vendors' ? 'rgba(255,255,255,0.25)' : '#F1F5F9',
              color: subTab === 'my-vendors' ? '#FFFFFF' : '#64748B'
            }}>
              {associatedVendors.length}
            </span>
          </button>

          <button
            onClick={() => setSubTab('my-requests')}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '7px',
              padding: '7px 14px',
              borderRadius: '6px',
              fontSize: '13px',
              fontWeight: subTab === 'my-requests' ? 700 : 500,
              background: subTab === 'my-requests' ? '#2563EB' : 'transparent',
              color: subTab === 'my-requests' ? '#FFFFFF' : '#475569',
              border: 'none',
              cursor: 'pointer',
              transition: 'all 0.15s ease'
            }}
          >
            <LucideIcon name="clipboard-list" size={15} color={subTab === 'my-requests' ? '#FFFFFF' : '#64748B'} />
            Vendor Requests
            <span style={{
              fontSize: '11px',
              padding: '1px 6px',
              borderRadius: '10px',
              background: subTab === 'my-requests' ? 'rgba(255,255,255,0.25)' : '#F1F5F9',
              color: subTab === 'my-requests' ? '#FFFFFF' : '#64748B'
            }}>
              {requests.length}
            </span>
          </button>
        </div>

        {/* Right Action Buttons */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button
            onClick={openAssociatePicker}
            style={{
              height: '32px',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '0 12px',
              borderRadius: '6px',
              border: '1px solid #CBD5E1',
              background: '#FFFFFF',
              color: '#1E293B',
              fontSize: '12.5px',
              fontWeight: 650,
              cursor: 'pointer'
            }}
          >
            <LucideIcon name="link" size={14} color="#2563EB" />
            Add Existing Vendor
          </button>

          <button
            onClick={openNewRequestForm}
            style={{
              height: '32px',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '0 14px',
              borderRadius: '6px',
              border: 'none',
              background: '#2563EB',
              color: '#FFFFFF',
              fontSize: '12.5px',
              fontWeight: 650,
              cursor: 'pointer',
              boxShadow: '0 1px 2px rgba(37,99,235,0.2)'
            }}
          >
            <LucideIcon name="plus" size={14} color="#FFFFFF" />
            Request New Vendor
          </button>
        </div>
      </div>

      {/* SUB-TAB 1: MY ASSOCIATED VENDORS TABLE */}
      {subTab === 'my-vendors' && (
        <div style={{
          background: '#FFFFFF',
          borderRadius: '8px',
          border: '1px solid #E2E8F0',
          boxShadow: '0 1px 2px rgba(0,0,0,0.02)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden'
        }}>
          {/* Search bar */}
          <div style={{
            padding: '10px 16px',
            borderBottom: '1px solid #F1F5F9',
            display: 'flex',
            alignItems: 'center',
            gap: '10px'
          }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              flex: 1,
              maxWidth: '360px',
              background: '#F8FAFC',
              border: '1px solid #E2E8F0',
              borderRadius: '6px',
              padding: '6px 10px'
            }}>
              <LucideIcon name="search" size={14} color="#94A3B8" />
              <input
                type="text"
                placeholder="Search my vendors by Name, Code, GST..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                style={{
                  border: 'none',
                  background: 'transparent',
                  outline: 'none',
                  fontSize: '12px',
                  width: '100%',
                  color: '#1E293B'
                }}
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  style={{ border: 'none', background: 'transparent', cursor: 'pointer', padding: 0 }}
                >
                  <LucideIcon name="x" size={13} color="#94A3B8" />
                </button>
              )}
            </div>

            <div style={{ marginLeft: 'auto', fontSize: '11.5px', color: '#64748B' }}>
              Vendors configured for your hospital
            </div>
          </div>

          {/* Table */}
          <div style={{ overflowX: 'auto', width: '100%' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '12px' }}>
              <thead>
                <tr style={{ background: '#F8FAFC', borderBottom: '1px solid #E2E8F0', color: '#475569', fontWeight: 700, fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  <th style={{ padding: '9px 12px', width: '50px' }}>#</th>
                  <th style={{ padding: '9px 12px', width: '110px' }}>Code</th>
                  <th style={{ padding: '9px 12px', minWidth: '180px' }}>Vendor Name</th>
                  <th style={{ padding: '9px 12px', width: '130px' }}>Type / Category</th>
                  <th style={{ padding: '9px 12px', minWidth: '160px' }}>Primary Contact</th>
                  <th style={{ padding: '9px 12px', width: '140px' }}>GST / PAN</th>
                  <th style={{ padding: '9px 12px', width: '130px' }}>Location</th>
                  <th style={{ padding: '9px 12px', width: '80px', textAlign: 'center' }}>Status</th>
                  <th style={{ padding: '9px 12px', width: '90px', textAlign: 'right' }}>Details</th>
                </tr>
              </thead>
              <tbody>
                {loadingVendors ? (
                  <tr>
                    <td colSpan={9} style={{ padding: '36px', textAlign: 'center', color: '#64748B' }}>
                      <LucideIcon name="loader-2" size={24} style={{ animation: 'spin 1s linear infinite', margin: '0 auto 8px auto' }} />
                      Loading associated vendors...
                    </td>
                  </tr>
                ) : associatedVendors.length === 0 ? (
                  <tr>
                    <td colSpan={9} style={{ padding: '40px', textAlign: 'center', color: '#64748B' }}>
                      <LucideIcon name="building-2" size={32} color="#CBD5E1" style={{ margin: '0 auto 10px auto' }} />
                      <div style={{ fontWeight: 600, fontSize: '14px', color: '#334155' }}>No vendors associated with your hospital</div>
                      <p style={{ fontSize: '12px', color: '#94A3B8', margin: '4px 0 16px 0' }}>
                        Click <strong>"+ Add Existing Vendor"</strong> to link vendors from the Global Master, or <strong>"+ Request New Vendor"</strong> to propose a new supplier.
                      </p>
                      <button
                        onClick={openAssociatePicker}
                        style={{
                          padding: '6px 14px',
                          borderRadius: '6px',
                          border: 'none',
                          background: '#2563EB',
                          color: '#FFFFFF',
                          fontSize: '12px',
                          fontWeight: 650,
                          cursor: 'pointer'
                        }}
                      >
                        + Add Existing Vendor
                      </button>
                    </td>
                  </tr>
                ) : (
                  associatedVendors.map((item, idx) => {
                    const v = item.vendor || {};
                    return (
                      <tr
                        key={item.associationId}
                        style={{
                          borderBottom: '1px solid #F1F5F9',
                          transition: 'background 0.15s ease'
                        }}
                        onMouseEnter={e => e.currentTarget.style.background = '#F8FAFC'}
                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                      >
                        <td style={{ padding: '9px 12px', color: '#64748B' }}>{idx + 1}</td>
                        <td style={{ padding: '9px 12px' }}>
                          <span style={{
                            fontFamily: 'monospace',
                            fontWeight: 700,
                            color: '#1D4ED8',
                            background: '#EFF6FF',
                            padding: '2px 6px',
                            borderRadius: '4px',
                            fontSize: '11px'
                          }}>
                            {v.supplierCode || '—'}
                          </span>
                        </td>
                        <td style={{ padding: '9px 12px' }}>
                          <div style={{ fontWeight: 650, color: '#0F172A' }}>{v.supplierName}</div>
                          {v.organizationType && (
                            <div style={{ fontSize: '10.5px', color: '#64748B' }}>{v.organizationType}</div>
                          )}
                        </td>
                        <td style={{ padding: '9px 12px', color: '#334155' }}>
                          <div>{v.supplierType || '—'}</div>
                          {v.supplierCategory && (
                            <div style={{ fontSize: '10.5px', color: '#64748B' }}>{v.supplierCategory}</div>
                          )}
                        </td>
                        <td style={{ padding: '9px 12px' }}>
                          <div style={{ fontWeight: 600, color: '#334155' }}>{v.primaryContactPerson || '—'}</div>
                          <div style={{ fontSize: '11px', color: '#64748B' }}>
                            {v.primaryContactPersonMobileNo || v.emailId || ''}
                          </div>
                        </td>
                        <td style={{ padding: '9px 12px', fontSize: '11px' }}>
                          {v.gstNo && <div style={{ color: '#0F172A', fontWeight: 600 }}>GST: {v.gstNo}</div>}
                          {v.panCardNo && <div style={{ color: '#64748B' }}>PAN: {v.panCardNo}</div>}
                          {!v.gstNo && !v.panCardNo && <span style={{ color: '#94A3B8' }}>—</span>}
                        </td>
                        <td style={{ padding: '9px 12px', fontSize: '11px', color: '#334155' }}>
                          {v.bank1City || v.stateCode || v.pinCode ? `${v.bank1City || ''} ${v.stateCode || ''}` : '—'}
                        </td>
                        <td style={{ padding: '9px 12px', textAlign: 'center' }}>
                          <span style={{
                            display: 'inline-block',
                            padding: '2px 8px',
                            borderRadius: '12px',
                            fontSize: '10.5px',
                            fontWeight: 700,
                            background: item.status === 'ACTIVE' ? '#DCFCE7' : '#F1F5F9',
                            color: item.status === 'ACTIVE' ? '#15803D' : '#64748B'
                          }}>
                            {item.status || 'ACTIVE'}
                          </span>
                        </td>
                        <td style={{ padding: '9px 12px', textAlign: 'right' }}>
                          <button
                            onClick={() => {
                              setViewingVendor(v);
                              setActiveView('view-vendor');
                              window.scrollTo({ top: 0, behavior: 'smooth' });
                            }}
                            title="View Read-Only Details"
                            style={{
                              padding: '4px 8px',
                              borderRadius: '4px',
                              border: '1px solid #CBD5E1',
                              background: '#FFFFFF',
                              color: '#2563EB',
                              cursor: 'pointer',
                              fontSize: '11px',
                              fontWeight: 600,
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px'
                            }}
                          >
                            <LucideIcon name="eye" size={13} />
                            View
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* SUB-TAB 2: MY VENDOR REQUESTS TABLE */}
      {subTab === 'my-requests' && (
        <div style={{
          background: '#FFFFFF',
          borderRadius: '8px',
          border: '1px solid #E2E8F0',
          boxShadow: '0 1px 2px rgba(0,0,0,0.02)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden'
        }}>
          <div style={{ overflowX: 'auto', width: '100%' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '12px' }}>
              <thead>
                <tr style={{ background: '#F8FAFC', borderBottom: '1px solid #E2E8F0', color: '#475569', fontWeight: 700, fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  <th style={{ padding: '9px 12px', width: '120px' }}>Request No</th>
                  <th style={{ padding: '9px 12px', minWidth: '180px' }}>Proposed Supplier</th>
                  <th style={{ padding: '9px 12px', width: '150px' }}>Contact Person</th>
                  <th style={{ padding: '9px 12px', width: '140px' }}>GST / PAN</th>
                  <th style={{ padding: '9px 12px', width: '130px' }}>Submitted Date</th>
                  <th style={{ padding: '9px 12px', width: '110px', textAlign: 'center' }}>Status</th>
                  <th style={{ padding: '9px 12px', minWidth: '150px' }}>Admin Feedback</th>
                </tr>
              </thead>
              <tbody>
                {loadingRequests ? (
                  <tr>
                    <td colSpan={7} style={{ padding: '36px', textAlign: 'center', color: '#64748B' }}>
                      <LucideIcon name="loader-2" size={24} style={{ animation: 'spin 1s linear infinite', margin: '0 auto 8px auto' }} />
                      Loading submitted requests...
                    </td>
                  </tr>
                ) : requests.length === 0 ? (
                  <tr>
                    <td colSpan={7} style={{ padding: '40px', textAlign: 'center', color: '#64748B' }}>
                      <LucideIcon name="clipboard-list" size={32} color="#CBD5E1" style={{ margin: '0 auto 10px auto' }} />
                      <div style={{ fontWeight: 600, fontSize: '14px', color: '#334155' }}>No vendor requests submitted yet</div>
                      <p style={{ fontSize: '12px', color: '#94A3B8', margin: '4px 0 16px 0' }}>
                        If you need to purchase from a supplier not present in the Global Master, click "+ Request New Vendor".
                      </p>
                      <button
                        onClick={openNewRequestForm}
                        style={{
                          padding: '6px 14px',
                          borderRadius: '6px',
                          border: 'none',
                          background: '#2563EB',
                          color: '#FFFFFF',
                          fontSize: '12px',
                          fontWeight: 650,
                          cursor: 'pointer'
                        }}
                      >
                        + Request New Vendor
                      </button>
                    </td>
                  </tr>
                ) : (
                  requests.map(req => {
                    const vData = req.vendorData || {};
                    const isPending = req.status === 'PENDING';
                    const isApproved = req.status === 'APPROVED';
                    const isRejected = req.status === 'REJECTED';

                    return (
                      <tr
                        key={req._id}
                        style={{
                          borderBottom: '1px solid #F1F5F9',
                          transition: 'background 0.15s ease'
                        }}
                        onMouseEnter={e => e.currentTarget.style.background = '#F8FAFC'}
                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                      >
                        <td style={{ padding: '9px 12px' }}>
                          <span style={{
                            fontFamily: 'monospace',
                            fontWeight: 700,
                            color: '#0F172A',
                            background: '#F1F5F9',
                            padding: '2px 6px',
                            borderRadius: '4px',
                            fontSize: '11px'
                          }}>
                            {req.requestNo}
                          </span>
                        </td>
                        <td style={{ padding: '9px 12px' }}>
                          <div style={{ fontWeight: 700, color: '#0F172A' }}>{vData.supplierName}</div>
                          {vData.supplierType && (
                            <div style={{ fontSize: '10.5px', color: '#64748B' }}>{vData.supplierType}</div>
                          )}
                        </td>
                        <td style={{ padding: '9px 12px' }}>
                          <div style={{ fontWeight: 600, color: '#334155' }}>{vData.primaryContactPerson || '—'}</div>
                          <div style={{ fontSize: '11px', color: '#64748B' }}>{vData.primaryContactPersonMobileNo || ''}</div>
                        </td>
                        <td style={{ padding: '9px 12px', fontSize: '11px' }}>
                          {vData.gstNo && <div style={{ color: '#0F172A', fontWeight: 600 }}>GST: {vData.gstNo}</div>}
                          {vData.panCardNo && <div style={{ color: '#64748B' }}>PAN: {vData.panCardNo}</div>}
                          {!vData.gstNo && !vData.panCardNo && <span style={{ color: '#94A3B8' }}>—</span>}
                        </td>
                        <td style={{ padding: '9px 12px', fontSize: '11px', color: '#64748B' }}>
                          {new Date(req.createdAt).toLocaleDateString()}
                        </td>
                        <td style={{ padding: '9px 12px', textAlign: 'center' }}>
                          <span style={{
                            display: 'inline-block',
                            padding: '2px 8px',
                            borderRadius: '12px',
                            fontSize: '10.5px',
                            fontWeight: 750,
                            background: isPending ? '#FEF3C7' : (isApproved ? '#DCFCE7' : '#FEE2E2'),
                            color: isPending ? '#B45309' : (isApproved ? '#15803D' : '#B91C1C')
                          }}>
                            {req.status}
                          </span>
                        </td>
                        <td style={{ padding: '9px 12px', fontSize: '11px' }}>
                          {isApproved && (
                            <span style={{ color: '#15803D', fontWeight: 600 }}>
                              ✓ Approved & Associated
                            </span>
                          )}
                          {isRejected && (
                            <div style={{ color: '#B91C1C' }}>
                              <strong>Reason:</strong> {req.rejectionReason}
                            </div>
                          )}
                          {isPending && (
                            <span style={{ color: '#94A3B8' }}>Awaiting SuperAdmin review</span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
