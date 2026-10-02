import React, { useState, useEffect, useCallback } from 'react';
import * as Icons from 'lucide-react';
import {
  VENDOR_SECTIONS,
  VENDOR_FIELDS,
  getVendorFieldsBySection
} from '../../../config/vendorSchemaRegistry';
import { getApiUrl } from '../../../utils/api';

const API_BASE = getApiUrl('/superadmin/vendors');
const REQUESTS_API_BASE = getApiUrl('/superadmin/vendor-requests');

const LucideIcon = ({ name, size = 15, color = 'currentColor', style = {} }) => {
  if (!name) return <Icons.HelpCircle size={size} color={color} style={style} />;
  const camelName = name
    .split('-')
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join('');
  const IconComponent = Icons[camelName] || Icons.HelpCircle;
  return <IconComponent size={size} color={color} style={style} />;
};

export default function VendorMasterView() {
  // Navigation: 'catalog' | 'requests'
  const [activeSubTab, setActiveSubTab] = useState('catalog');

  // In-page form state: null | { mode: 'add' | 'edit' | 'view', vendor: {...} }
  const [vendorFormState, setVendorFormState] = useState(null);
  const [formData, setFormData] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState(null);
  const [currentStep, setCurrentStep] = useState(1); // 1 | 2 | 3 | 4 | 'all'

  // In-page Request Action state: null | { type: 'approve' | 'reject' | 'view', request: {...} }
  const [requestActionState, setRequestActionState] = useState(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  // Catalog state
  const [vendors, setVendors] = useState([]);
  const [loadingVendors, setLoadingVendors] = useState(false);
  const [vendorSearch, setVendorSearch] = useState('');
  const [vendorStatusFilter, setVendorStatusFilter] = useState('all');
  const [vendorPage, setVendorPage] = useState(1);
  const [vendorLimit, setVendorLimit] = useState(25);
  const [vendorTotal, setVendorTotal] = useState(0);
  const [vendorPages, setVendorPages] = useState(1);

  // Requests state
  const [requests, setRequests] = useState([]);
  const [loadingRequests, setLoadingRequests] = useState(false);
  const [requestStatusFilter, setRequestStatusFilter] = useState('all');
  const [pendingRequestsCount, setPendingRequestsCount] = useState(0);

  // Notification toast
  const [toast, setToast] = useState(null);
  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3500);
  };

  const getAuthHeaders = () => {
    const token = localStorage.getItem('token');
    return {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    };
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // FETCH VENDORS (CATALOG)
  // ─────────────────────────────────────────────────────────────────────────────
  const fetchVendors = useCallback(async () => {
    try {
      setLoadingVendors(true);
      const params = new URLSearchParams({
        page: vendorPage,
        limit: vendorLimit,
        status: vendorStatusFilter,
        search: vendorSearch
      });

      const res = await fetch(`${API_BASE}?${params.toString()}`, {
        headers: getAuthHeaders()
      });
      const data = await res.json();

      if (data.success) {
        setVendors(data.data || []);
        setVendorTotal(data.pagination?.total || 0);
        setVendorPages(data.pagination?.pages || 1);
      } else {
        showToast(data.error || 'Failed to fetch global vendors', 'error');
      }
    } catch (err) {
      showToast(err.message || 'Error connecting to server', 'error');
    } finally {
      setLoadingVendors(false);
    }
  }, [vendorPage, vendorLimit, vendorStatusFilter, vendorSearch]);

  // ─────────────────────────────────────────────────────────────────────────────
  // FETCH VENDOR REQUESTS
  // ─────────────────────────────────────────────────────────────────────────────
  const fetchRequests = useCallback(async () => {
    try {
      setLoadingRequests(true);
      const params = new URLSearchParams({
        status: requestStatusFilter,
        limit: 100
      });

      const res = await fetch(`${REQUESTS_API_BASE}?${params.toString()}`, {
        headers: getAuthHeaders()
      });
      const data = await res.json();

      if (data.success) {
        setRequests(data.data || []);
        const pending = (data.data || []).filter(r => r.status === 'PENDING').length;
        setPendingRequestsCount(pending);
      }
    } catch (err) {
      console.error('Failed to fetch requests', err);
    } finally {
      setLoadingRequests(false);
    }
  }, [requestStatusFilter]);

  useEffect(() => {
    fetchVendors();
  }, [fetchVendors]);

  useEffect(() => {
    fetchRequests();
  }, [fetchRequests]);

  // ─────────────────────────────────────────────────────────────────────────────
  // EXPORT EXCEL
  // ─────────────────────────────────────────────────────────────────────────────
  const handleExportExcel = async () => {
    try {
      showToast('Generating Excel export...', 'info');
      const params = new URLSearchParams({
        status: vendorStatusFilter
      });
      const res = await fetch(`${API_BASE}/export?${params.toString()}`, {
        headers: getAuthHeaders()
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || 'Export failed');
      }

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Quroxa_Vendor_Master_${new Date().toISOString().split('T')[0]}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      showToast('Vendor Master exported successfully');
    } catch (err) {
      showToast(err.message || 'Export error', 'error');
    }
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // IN-PAGE FORM HANDLERS
  // ─────────────────────────────────────────────────────────────────────────────
  const openAddForm = () => {
    const initial = {};
    VENDOR_FIELDS.forEach(f => {
      initial[f.fieldKey] = f.fieldKey === 'activeStatus' ? 'Yes' : (f.fieldKey === 'isMsmeRegistration' ? 'No' : '');
    });
    setFormData(initial);
    setFormError(null);
    setCurrentStep(1);
    setVendorFormState({ mode: 'add' });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const openEditForm = (vendor) => {
    const data = {};
    VENDOR_FIELDS.forEach(f => {
      data[f.fieldKey] = vendor[f.fieldKey] !== undefined && vendor[f.fieldKey] !== null ? vendor[f.fieldKey] : '';
    });
    setFormData({ ...data, _id: vendor._id });
    setFormError(null);
    setCurrentStep(1);
    setVendorFormState({ mode: 'edit', vendor });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const openViewForm = (vendor) => {
    const data = {};
    VENDOR_FIELDS.forEach(f => {
      data[f.fieldKey] = vendor[f.fieldKey] !== undefined && vendor[f.fieldKey] !== null ? vendor[f.fieldKey] : '';
    });
    setFormData({ ...data, _id: vendor._id });
    setFormError(null);
    setCurrentStep(1);
    setVendorFormState({ mode: 'view', vendor });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const closeForm = () => {
    setVendorFormState(null);
    setFormData({});
    setFormError(null);
  };

  const handleFieldChange = (key, value) => {
    setFormData(prev => ({
      ...prev,
      [key]: value
    }));
  };

  const handleSaveVendor = async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    const missing = [];
    if (!formData.supplierName?.trim()) missing.push('Supplier Name');
    if (!formData.supplierType?.trim()) missing.push('Supplier Type');
    if (!formData.supplierCategory?.trim()) missing.push('Supplier Category');
    if (!formData.organizationType?.trim()) missing.push('Organization Type');
    if (!formData.primaryContactPerson?.trim()) missing.push('Primary Contact');

    if (missing.length > 0) {
      setFormError(`Please fill all required fields (marked with red line): ${missing.join(', ')}`);
      if (!formData.supplierName?.trim() || !formData.supplierType?.trim() || !formData.supplierCategory?.trim() || !formData.organizationType?.trim()) {
        setCurrentStep(1);
      } else if (!formData.primaryContactPerson?.trim()) {
        setCurrentStep(2);
      }
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    try {
      setSubmitting(true);
      setFormError(null);

      const isEdit = vendorFormState.mode === 'edit';
      const endpoint = isEdit ? `${API_BASE}/${formData._id}` : API_BASE;
      const method = isEdit ? 'PUT' : 'POST';

      const res = await fetch(endpoint, {
        method,
        headers: getAuthHeaders(),
        body: JSON.stringify(formData)
      });
      const data = await res.json();

      if (data.success) {
        showToast(isEdit ? 'Vendor updated successfully' : 'Vendor created successfully');
        closeForm();
        fetchVendors();
      } else {
        setFormError(data.error || 'Failed to save vendor');
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    } catch (err) {
      setFormError(err.message || 'An error occurred while saving');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } finally {
      setSubmitting(false);
    }
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // REQUEST APPROVAL / REJECTION HANDLERS
  // ─────────────────────────────────────────────────────────────────────────────
  const handleApproveRequest = async (requestId) => {
    try {
      setActionLoading(true);
      const res = await fetch(`${REQUESTS_API_BASE}/${requestId}/approve`, {
        method: 'POST',
        headers: getAuthHeaders()
      });
      const data = await res.json();

      if (data.success) {
        showToast('Vendor request approved and vendor associated successfully!');
        setRequestActionState(null);
        fetchRequests();
        fetchVendors();
      } else {
        showToast(data.error || 'Failed to approve request', 'error');
      }
    } catch (err) {
      showToast(err.message || 'Error executing approval', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const handleRejectRequest = async (requestId) => {
    if (!rejectionReason || !rejectionReason.trim()) {
      showToast('Please provide a reason for rejection', 'error');
      return;
    }

    try {
      setActionLoading(true);
      const res = await fetch(`${REQUESTS_API_BASE}/${requestId}/reject`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ rejectionReason: rejectionReason.trim() })
      });
      const data = await res.json();

      if (data.success) {
        showToast('Vendor request rejected');
        setRequestActionState(null);
        setRejectionReason('');
        fetchRequests();
      } else {
        showToast(data.error || 'Failed to reject request', 'error');
      }
    } catch (err) {
      showToast(err.message || 'Error rejecting request', 'error');
    } finally {
      setActionLoading(false);
    }
  };

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

  const renderAlignedField = (field, isReadOnly = false, customLabel = null, labelWidth = '112px') => {
    const value = formData[field.fieldKey] !== undefined && formData[field.fieldKey] !== null ? formData[field.fieldKey] : '';
    const readOnly = isReadOnly || (vendorFormState?.mode === 'edit' && field.fieldKey === 'supplierCode');
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
              onChange={e => handleFieldChange(field.fieldKey, e.target.value)}
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
              onChange={e => handleFieldChange(field.fieldKey, e.target.value)}
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
          {isRequired && !isMissingRequired && (
            <div style={{
              position: 'absolute',
              bottom: 0,
              left: 0,
              right: 0,
              height: '2px',
              backgroundColor: '#10B981',
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
  // RENDER VIEW A: MODERN STEP-WISE VENDOR WIZARD FORM
  // ─────────────────────────────────────────────────────────────────────────────
  if (vendorFormState) {
    const isView = vendorFormState.mode === 'view';
    const isEdit = vendorFormState.mode === 'edit';
    const isAdd = vendorFormState.mode === 'add';

    const supplierFields = getVendorFieldsBySection('supplier_details');
    const contactFields = getVendorFieldsBySection('concern_person_details');
    const statutoryFields = getVendorFieldsBySection('statutory_details');
    const bankFields = getVendorFieldsBySection('bank_details');
    const gstFields = getVendorFieldsBySection('gst_details');
    const termsFields = getVendorFieldsBySection('terms_conditions');

    // Step 1 groupings: 8 Identification + 8 Address/Contact
    const identityFieldKeys = ['supplierName', 'supplierCode', 'supplierType', 'supplierCategory', 'organizationType', 'activeStatus', 'sNo', 'supplierId'];
    const addressFieldKeys = ['houseNo', 'street', 'stateCode', 'pinCode', 'landline', 'faxNo', 'emailId', 'website'];
    const identityFields = supplierFields.filter(f => identityFieldKeys.includes(f.fieldKey)).sort((a,b) => identityFieldKeys.indexOf(a.fieldKey) - identityFieldKeys.indexOf(b.fieldKey));
    const addressFields = supplierFields.filter(f => addressFieldKeys.includes(f.fieldKey)).sort((a,b) => addressFieldKeys.indexOf(a.fieldKey) - addressFieldKeys.indexOf(b.fieldKey));

    // Step 2 groupings: 4 Primary + 4 Secondary
    const primaryFieldKeys = ['primaryContactPerson', 'primaryContactPersonDesignation', 'primaryContactPersonMobileNo', 'primaryContactPersonEmailId'];
    const secondaryFieldKeys = ['secondaryContactPerson', 'secondaryContactPersonDesignation', 'secondaryContactPersonMobileNo', 'secondaryContactPersonEmailId'];
    const primaryFields = contactFields.filter(f => primaryFieldKeys.includes(f.fieldKey)).sort((a,b) => primaryFieldKeys.indexOf(a.fieldKey) - primaryFieldKeys.indexOf(b.fieldKey));
    const secondaryFields = contactFields.filter(f => secondaryFieldKeys.includes(f.fieldKey)).sort((a,b) => secondaryFieldKeys.indexOf(a.fieldKey) - secondaryFieldKeys.indexOf(b.fieldKey));

    // Step 3 groupings: 6 Corporate/Tax + 7 Compliance/MSME
    const corporateFieldKeys = ['cinNo', 'rocNo', 'nameonPanCard', 'panCardNo', 'pfRegistartionNo', 'esiRegistrationNo'];
    const complianceFieldKeys = ['isoCertificationNo', 'isoValidUpto', 'pollutioncontrolBoardCertificationNo', 'pollutionValidUpto', 'isMsmeRegistration', 'msmeRegistrationNo', 'msmeRegistrationValidDate'];
    const corporateFields = statutoryFields.filter(f => corporateFieldKeys.includes(f.fieldKey)).sort((a,b) => corporateFieldKeys.indexOf(a.fieldKey) - corporateFieldKeys.indexOf(b.fieldKey));
    const complianceFields = statutoryFields.filter(f => complianceFieldKeys.includes(f.fieldKey)).sort((a,b) => complianceFieldKeys.indexOf(a.fieldKey) - complianceFieldKeys.indexOf(b.fieldKey));

    // Step 4 groupings: 9 Bank/GST + 3 Terms
    const bankGstFields = [...bankFields, ...gstFields];

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', width: '100%', minWidth: 0 }}>
        {/* Toast */}
        {toast && (
          <div style={{
            position: 'fixed',
            top: '20px',
            right: '20px',
            zIndex: 9999,
            padding: '10px 16px',
            borderRadius: '6px',
            background: toast.type === 'error' ? '#EF4444' : (toast.type === 'info' ? '#3B82F6' : '#10B981'),
            color: '#FFFFFF',
            fontWeight: 650,
            fontSize: '13px',
            boxShadow: '0 8px 20px rgba(0,0,0,0.18)',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}>
            <LucideIcon name={toast.type === 'error' ? 'alert-triangle' : (toast.type === 'info' ? 'info' : 'check-circle-2')} size={16} color="#FFFFFF" />
            {toast.message}
          </div>
        )}

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
              onClick={closeForm}
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
              Catalog
            </button>

            <div style={{ height: '18px', width: '1px', background: '#E2E8F0' }} />

            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ fontSize: '14px', fontWeight: 800, color: '#0F172A' }}>
                {isAdd && 'Add Global Vendor (Step Wizard)'}
                {isEdit && `Edit: ${formData.supplierName || 'Vendor'}`}
                {isView && `Profile: ${formData.supplierName || 'Vendor'}`}
              </span>
              <span style={{
                fontSize: '10px',
                fontWeight: 750,
                padding: '1px 6px',
                borderRadius: '4px',
                background: isView ? '#F1F5F9' : '#DBEAFE',
                color: isView ? '#475569' : '#1E40AF'
              }}>
                {vendorFormState.mode.toUpperCase()}
              </span>
            </div>
          </div>

          {/* Right: Action Buttons — ALWAYS PROMINENT AND VISIBLE */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              type="button"
              onClick={closeForm}
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
              {isView ? 'Back' : 'Cancel'}
            </button>

            {!isView && (
              <button
                type="button"
                disabled={submitting}
                onClick={handleSaveVendor}
                style={{
                  padding: '5px 18px',
                  borderRadius: '5px',
                  border: 'none',
                  background: '#2563EB',
                  color: '#FFFFFF',
                  fontSize: '12px',
                  fontWeight: 750,
                  cursor: submitting ? 'not-allowed' : 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  boxShadow: '0 1px 3px rgba(37,99,235,0.3)'
                }}
              >
                {submitting && <LucideIcon name="loader-2" size={13} style={{ animation: 'spin 1s linear infinite' }} />}
                {isAdd ? 'Create Global Vendor' : 'Save Changes'}
              </button>
            )}
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
            const isStep1Missing = !formData.supplierName?.trim() || !formData.supplierType?.trim() || !formData.supplierCategory?.trim() || !formData.organizationType?.trim();
            const isStep2Missing = !formData.primaryContactPerson?.trim();
            const isStepMissing = (s.step === 1 && isStep1Missing) || (s.step === 2 && isStep2Missing);

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
                    background: isCurrent ? '#2563EB' : (isCompleted ? '#10B981' : (isStepMissing ? '#FEE2E2' : '#F1F5F9')),
                    color: isCurrent || isCompleted ? '#FFFFFF' : (isStepMissing ? '#DC2626' : '#64748B'),
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
                    {s.hasRequired && isStepMissing && (
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
        {formError && (
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
            {formError}
          </div>
        )}

        {/* STEP CONTENT WORKING AREA */}
        <form onSubmit={handleSaveVendor} style={{ display: 'flex', flexDirection: 'column', gap: '8px', width: '100%' }}>
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
                <div style={{ padding: '8px 12px', display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', columnGap: '20px', rowGap: '8px' }}>
                  {identityFields.map(f => renderAlignedField(f, isView, null, '120px'))}
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
                <div style={{ padding: '8px 12px', display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', columnGap: '20px', rowGap: '8px' }}>
                  {addressFields.map(f => renderAlignedField(f, isView, null, '120px'))}
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
                <div style={{ padding: '8px 12px', display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', columnGap: '16px', rowGap: '8px' }}>
                  {primaryFields.map(f => {
                    let label = f.clientHeader;
                    if (f.fieldKey === 'primaryContactPerson') label = 'Contact Name';
                    if (f.fieldKey === 'primaryContactPersonDesignation') label = 'Designation';
                    if (f.fieldKey === 'primaryContactPersonMobileNo') label = 'Mobile No.';
                    if (f.fieldKey === 'primaryContactPersonEmailId') label = 'Email ID';
                    return renderAlignedField(f, isView, label, '95px');
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
                <div style={{ padding: '8px 12px', display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', columnGap: '16px', rowGap: '8px' }}>
                  {secondaryFields.map(f => {
                    let label = f.clientHeader;
                    if (f.fieldKey === 'secondaryContactPerson') label = 'Contact Name';
                    if (f.fieldKey === 'secondaryContactPersonDesignation') label = 'Designation';
                    if (f.fieldKey === 'secondaryContactPersonMobileNo') label = 'Mobile No.';
                    if (f.fieldKey === 'secondaryContactPersonEmailId') label = 'Email ID';
                    return renderAlignedField(f, isView, label, '95px');
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
                <div style={{ padding: '8px 12px', display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', columnGap: '20px', rowGap: '8px' }}>
                  {corporateFields.map(f => {
                    let label = f.clientHeader;
                    if (f.fieldKey === 'panCardNo') label = 'PAN Card No';
                    if (f.fieldKey === 'nameonPanCard') label = 'Name on PAN';
                    if (f.fieldKey === 'pfRegistartionNo') label = 'PF Reg No';
                    if (f.fieldKey === 'esiRegistrationNo') label = 'ESI Reg No';
                    return renderAlignedField(f, isView, label, '120px');
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
                <div style={{ padding: '8px 12px', display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', columnGap: '20px', rowGap: '8px' }}>
                  {complianceFields.map(f => {
                    let label = f.clientHeader;
                    if (f.fieldKey === 'isoCertificationNo') label = 'ISO Cert No';
                    if (f.fieldKey === 'isoValidUpto') label = 'ISO Valid Upto';
                    if (f.fieldKey === 'pollutioncontrolBoardCertificationNo') label = 'Pollution Cert';
                    if (f.fieldKey === 'pollutionValidUpto') label = 'Pollution Valid';
                    if (f.fieldKey === 'isMsmeRegistration') label = 'MSME Reg?';
                    if (f.fieldKey === 'msmeRegistrationNo') label = 'MSME Reg No';
                    if (f.fieldKey === 'msmeRegistrationValidDate') label = 'MSME Valid';
                    return renderAlignedField(f, isView, label, '120px');
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
                <div style={{ padding: '8px 12px', display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', columnGap: '20px', rowGap: '8px' }}>
                  {bankGstFields.map(f => {
                    let label = f.clientHeader;
                    if (f.fieldKey === 'banKAccountsNo') label = 'Bank A/C No';
                    if (f.fieldKey === 'bankIfscCode') label = 'IFSC Code';
                    if (f.fieldKey === 'banKAddress') label = 'Bank Address';
                    if (f.fieldKey === 'bankAddress2') label = 'Bank Address 2';
                    if (f.fieldKey === 'bank1City') label = 'City';
                    return renderAlignedField(f, isView, label, '120px');
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
                <div style={{ padding: '8px 12px', display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', columnGap: '20px', rowGap: '8px' }}>
                  {termsFields.map(f => renderAlignedField(f, isView, null, '120px'))}
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
                  {currentStep === 1 && (!formData.supplierName?.trim() || !formData.supplierType?.trim() || !formData.supplierCategory?.trim() || !formData.organizationType?.trim()) && (
                    <span style={{ color: '#DC2626', fontSize: '11px', fontWeight: 750, background: '#FEE2E2', padding: '2px 8px', borderRadius: '4px' }}>
                      * 4 Required fields with red line incomplete
                    </span>
                  )}
                  {currentStep === 2 && !formData.primaryContactPerson?.trim() && (
                    <span style={{ color: '#DC2626', fontSize: '11px', fontWeight: 750, background: '#FEE2E2', padding: '2px 8px', borderRadius: '4px' }}>
                      * Primary Contact with red line required
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

              {(!isView && (currentStep === 4 || currentStep === 'all')) && (
                <button
                  type="button"
                  disabled={submitting}
                  onClick={handleSaveVendor}
                  style={{
                    padding: '6px 20px',
                    borderRadius: '5px',
                    border: 'none',
                    background: '#16A34A',
                    color: '#FFFFFF',
                    fontSize: '12px',
                    fontWeight: 750,
                    cursor: submitting ? 'not-allowed' : 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    boxShadow: '0 1px 3px rgba(22,163,74,0.3)'
                  }}
                >
                  {submitting && <LucideIcon name="loader-2" size={13} style={{ animation: 'spin 1s linear infinite' }} />}
                  {isAdd ? 'Create Global Vendor' : 'Save Changes'}
                </button>
              )}
            </div>
          </div>
        </form>
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // RENDER VIEW B: IN-PAGE REQUEST REVIEW
  // ─────────────────────────────────────────────────────────────────────────────
  if (requestActionState) {
    const { type, request } = requestActionState;
    const vData = request.vendorData || {};

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', width: '100%', minWidth: 0 }}>
        {/* Header */}
        <div style={{
          background: '#FFFFFF',
          borderRadius: '8px',
          border: '1px solid #E2E8F0',
          padding: '10px 16px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          boxShadow: '0 1px 2px rgba(0,0,0,0.02)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <button
              onClick={() => setRequestActionState(null)}
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
                fontWeight: 650,
                cursor: 'pointer'
              }}
            >
              <LucideIcon name="arrow-left" size={13} />
              Requests
            </button>
            <div style={{ height: '18px', width: '1px', background: '#E2E8F0' }} />
            <div>
              <h2 style={{ fontSize: '14px', fontWeight: 800, color: '#0F172A', margin: 0 }}>
                {type === 'approve' && `Approve Proposal: ${request.requestNo}`}
                {type === 'reject' && `Reject Proposal: ${request.requestNo}`}
                {type === 'view' && `Proposal Details: ${request.requestNo}`}
              </h2>
              <div style={{ fontSize: '11px', color: '#64748B' }}>
                Submitted by {request.hospitalName || request.tenantId} on {new Date(request.createdAt).toLocaleDateString()}
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              type="button"
              onClick={() => setRequestActionState(null)}
              style={{
                padding: '5px 14px',
                borderRadius: '5px',
                border: '1px solid #CBD5E1',
                background: '#FFFFFF',
                color: '#475569',
                fontSize: '11.5px',
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              Cancel
            </button>

            {type === 'approve' && (
              <button
                type="button"
                disabled={actionLoading}
                onClick={() => handleApproveRequest(request._id)}
                style={{
                  padding: '5px 18px',
                  borderRadius: '5px',
                  border: 'none',
                  background: '#10B981',
                  color: '#FFFFFF',
                  fontSize: '11.5px',
                  fontWeight: 750,
                  cursor: actionLoading ? 'not-allowed' : 'pointer'
                }}
              >
                {actionLoading ? 'Approving...' : 'Confirm & Approve'}
              </button>
            )}

            {type === 'reject' && (
              <button
                type="button"
                disabled={actionLoading}
                onClick={() => handleRejectRequest(request._id)}
                style={{
                  padding: '5px 18px',
                  borderRadius: '5px',
                  border: 'none',
                  background: '#EF4444',
                  color: '#FFFFFF',
                  fontSize: '11.5px',
                  fontWeight: 750,
                  cursor: actionLoading ? 'not-allowed' : 'pointer'
                }}
              >
                {actionLoading ? 'Rejecting...' : 'Confirm Rejection'}
              </button>
            )}
          </div>
        </div>

        {/* Content Card */}
        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '8px', padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '6px', padding: '12px' }}>
            <h3 style={{ margin: '0 0 8px 0', fontSize: '14px', fontWeight: 800, color: '#0F172A' }}>
              {vData.supplierName || 'Unnamed Vendor'}
            </h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '8px', fontSize: '11.5px' }}>
              <div><span style={{ color: '#64748B' }}>Type / Org:</span> <strong>{vData.supplierType || '—'} / {vData.organizationType || '—'}</strong></div>
              <div><span style={{ color: '#64748B' }}>GST No:</span> <strong>{vData.gstNo || '—'}</strong></div>
              <div><span style={{ color: '#64748B' }}>PAN Card No:</span> <strong>{vData.panCardNo || '—'}</strong></div>
              <div><span style={{ color: '#64748B' }}>Contact Person:</span> <strong>{vData.primaryContactPerson || '—'} ({vData.primaryContactPersonMobileNo || '—'})</strong></div>
              <div><span style={{ color: '#64748B' }}>Email:</span> <strong>{vData.emailId || '—'}</strong></div>
              <div><span style={{ color: '#64748B' }}>Bank:</span> <strong>{vData.bank || '—'}</strong></div>
            </div>
          </div>

          {type === 'approve' && (
            <div style={{
              background: '#EFF6FF',
              border: '1px solid #BFDBFE',
              borderRadius: '6px',
              padding: '12px',
              fontSize: '12px',
              color: '#1E40AF',
              display: 'flex',
              gap: '8px'
            }}>
              <LucideIcon name="info" size={16} color="#2563EB" style={{ flexShrink: 0 }} />
              <div>
                <strong>Approval Action:</strong> Approving will create this vendor globally in the canonical master (or reuse existing vendor if GST/PAN matches) and immediately link it to <strong>{request.hospitalName || request.tenantId}</strong>.
              </div>
            </div>
          )}

          {type === 'reject' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label style={{ fontSize: '12px', fontWeight: 700, color: '#0F172A' }}>
                Rejection Reason <span style={{ color: '#DC2626' }}>*</span>
              </label>
              <textarea
                rows={3}
                placeholder="Specify the reason why this vendor proposal is being rejected..."
                value={rejectionReason}
                onChange={e => setRejectionReason(e.target.value)}
                style={{
                  padding: '8px 10px',
                  borderRadius: '5px',
                  border: '1px solid #CBD5E1',
                  fontSize: '12px',
                  outline: 'none'
                }}
              />
            </div>
          )}

          {type === 'view' && request.status === 'REJECTED' && (
            <div style={{ background: '#FEE2E2', border: '1px solid #FECACA', borderRadius: '6px', padding: '12px', fontSize: '12px', color: '#991B1B' }}>
              <strong>Rejection Reason:</strong> {request.rejectionReason}
            </div>
          )}
        </div>
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // RENDER VIEW C: MAIN CATALOG & REQUESTS TABLES
  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', width: '100%', minWidth: 0 }}>
      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed',
          top: '20px',
          right: '20px',
          zIndex: 9999,
          padding: '10px 18px',
          borderRadius: '6px',
          background: toast.type === 'error' ? '#EF4444' : (toast.type === 'info' ? '#3B82F6' : '#10B981'),
          color: '#FFFFFF',
          fontWeight: 650,
          fontSize: '13px',
          boxShadow: '0 8px 20px rgba(0,0,0,0.18)',
          display: 'flex',
          alignItems: 'center',
          gap: '8px'
        }}>
          <LucideIcon name={toast.type === 'error' ? 'alert-triangle' : (toast.type === 'info' ? 'info' : 'check-circle-2')} size={16} color="#FFFFFF" />
          {toast.message}
        </div>
      )}

      {/* TOP COMPACT TOOLBAR & SUB-TABS */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '10px',
        background: '#FFFFFF',
        padding: '8px 14px',
        borderRadius: '7px',
        border: '1px solid #E2E8F0',
        boxShadow: '0 1px 2px rgba(0,0,0,0.02)'
      }}>
        {/* Left Sub-Tabs */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <button
            onClick={() => setActiveSubTab('catalog')}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 12px',
              borderRadius: '5px',
              fontSize: '12.5px',
              fontWeight: activeSubTab === 'catalog' ? 700 : 500,
              background: activeSubTab === 'catalog' ? '#2563EB' : 'transparent',
              color: activeSubTab === 'catalog' ? '#FFFFFF' : '#475569',
              border: 'none',
              cursor: 'pointer',
              transition: 'all 0.15s ease'
            }}
          >
            <LucideIcon name="truck" size={14} color={activeSubTab === 'catalog' ? '#FFFFFF' : '#64748B'} />
            Vendor Catalog
            <span style={{
              fontSize: '10.5px',
              padding: '1px 5px',
              borderRadius: '10px',
              background: activeSubTab === 'catalog' ? 'rgba(255,255,255,0.25)' : '#F1F5F9',
              color: activeSubTab === 'catalog' ? '#FFFFFF' : '#64748B'
            }}>
              {vendorTotal}
            </span>
          </button>

          <button
            onClick={() => setActiveSubTab('requests')}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 12px',
              borderRadius: '5px',
              fontSize: '12.5px',
              fontWeight: activeSubTab === 'requests' ? 700 : 500,
              background: activeSubTab === 'requests' ? '#2563EB' : 'transparent',
              color: activeSubTab === 'requests' ? '#FFFFFF' : '#475569',
              border: 'none',
              cursor: 'pointer',
              transition: 'all 0.15s ease'
            }}
          >
            <LucideIcon name="clipboard-list" size={14} color={activeSubTab === 'requests' ? '#FFFFFF' : '#64748B'} />
            Vendor Requests
            {pendingRequestsCount > 0 ? (
              <span style={{
                fontSize: '10.5px',
                padding: '1px 6px',
                borderRadius: '10px',
                background: '#FEF3C7',
                color: '#B45309',
                fontWeight: 750
              }}>
                {pendingRequestsCount} Pending
              </span>
            ) : (
              <span style={{
                fontSize: '10.5px',
                padding: '1px 5px',
                borderRadius: '10px',
                background: activeSubTab === 'requests' ? 'rgba(255,255,255,0.25)' : '#F1F5F9',
                color: activeSubTab === 'requests' ? '#FFFFFF' : '#64748B'
              }}>
                {requests.length}
              </span>
            )}
          </button>
        </div>

        {/* Right Action Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {activeSubTab === 'catalog' && (
            <>
              <select
                value={vendorStatusFilter}
                onChange={e => {
                  setVendorStatusFilter(e.target.value);
                  setVendorPage(1);
                }}
                style={{
                  height: '30px',
                  padding: '0 8px',
                  borderRadius: '5px',
                  border: '1px solid #CBD5E1',
                  background: '#FFFFFF',
                  fontSize: '12px',
                  color: '#334155',
                  outline: 'none',
                  cursor: 'pointer'
                }}
              >
                <option value="all">All Status</option>
                <option value="Yes">Active</option>
                <option value="No">Inactive</option>
              </select>

              <button
                onClick={handleExportExcel}
                style={{
                  height: '30px',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '5px',
                  padding: '0 10px',
                  borderRadius: '5px',
                  border: '1px solid #CBD5E1',
                  background: '#FFFFFF',
                  color: '#334155',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                <LucideIcon name="download" size={13} color="#059669" />
                Export
              </button>

              <button
                onClick={openAddForm}
                style={{
                  height: '30px',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '5px',
                  padding: '0 12px',
                  borderRadius: '5px',
                  border: 'none',
                  background: '#2563EB',
                  color: '#FFFFFF',
                  fontSize: '12px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  boxShadow: '0 1px 2px rgba(37,99,235,0.2)'
                }}
              >
                <LucideIcon name="plus" size={14} color="#FFFFFF" />
                Add Vendor
              </button>
            </>
          )}

          {activeSubTab === 'requests' && (
            <select
              value={requestStatusFilter}
              onChange={e => setRequestStatusFilter(e.target.value)}
              style={{
                height: '30px',
                padding: '0 8px',
                borderRadius: '5px',
                border: '1px solid #CBD5E1',
                background: '#FFFFFF',
                fontSize: '12px',
                color: '#334155',
                outline: 'none',
                cursor: 'pointer'
              }}
            >
              <option value="all">All Status</option>
              <option value="PENDING">Pending Review</option>
              <option value="APPROVED">Approved</option>
              <option value="REJECTED">Rejected</option>
            </select>
          )}
        </div>
      </div>

      {/* SUB-TAB 1: VENDOR CATALOG TABLE */}
      {activeSubTab === 'catalog' && (
        <div style={{
          background: '#FFFFFF',
          borderRadius: '7px',
          border: '1px solid #E2E8F0',
          boxShadow: '0 1px 2px rgba(0,0,0,0.02)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden'
        }}>
          {/* Table Search Bar */}
          <div style={{
            padding: '8px 14px',
            borderBottom: '1px solid #F1F5F9',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              flex: 1,
              maxWidth: '360px',
              background: '#F8FAFC',
              border: '1px solid #E2E8F0',
              borderRadius: '5px',
              padding: '5px 8px'
            }}>
              <LucideIcon name="search" size={13} color="#94A3B8" />
              <input
                type="text"
                placeholder="Search by Name, Code, GST, PAN, Mobile..."
                value={vendorSearch}
                onChange={e => {
                  setVendorSearch(e.target.value);
                  setVendorPage(1);
                }}
                style={{
                  border: 'none',
                  background: 'transparent',
                  outline: 'none',
                  fontSize: '11.5px',
                  width: '100%',
                  color: '#1E293B'
                }}
              />
              {vendorSearch && (
                <button
                  onClick={() => {
                    setVendorSearch('');
                    setVendorPage(1);
                  }}
                  style={{ border: 'none', background: 'transparent', cursor: 'pointer', padding: 0 }}
                >
                  <LucideIcon name="x" size={12} color="#94A3B8" />
                </button>
              )}
            </div>
          </div>

          {/* Table Element */}
          <div style={{ overflowX: 'auto', width: '100%' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '11.5px' }}>
              <thead>
                <tr style={{ background: '#F8FAFC', borderBottom: '1px solid #E2E8F0', color: '#475569', fontWeight: 700, fontSize: '10.5px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  <th style={{ padding: '8px 10px', width: '45px' }}>S.No</th>
                  <th style={{ padding: '8px 10px', width: '105px' }}>Code</th>
                  <th style={{ padding: '8px 10px', minWidth: '170px' }}>Supplier Name</th>
                  <th style={{ padding: '8px 10px', width: '120px' }}>Type / Category</th>
                  <th style={{ padding: '8px 10px', minWidth: '150px' }}>Primary Contact</th>
                  <th style={{ padding: '8px 10px', width: '135px' }}>GST / PAN</th>
                  <th style={{ padding: '8px 10px', minWidth: '140px' }}>Bank & Account</th>
                  <th style={{ padding: '8px 10px', width: '75px', textAlign: 'center' }}>Status</th>
                  <th style={{ padding: '8px 10px', width: '90px', textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {loadingVendors ? (
                  <tr>
                    <td colSpan={9} style={{ padding: '30px', textAlign: 'center', color: '#64748B' }}>
                      <LucideIcon name="loader-2" size={20} style={{ animation: 'spin 1s linear infinite', margin: '0 auto 6px auto' }} />
                      Loading Global Vendors...
                    </td>
                  </tr>
                ) : vendors.length === 0 ? (
                  <tr>
                    <td colSpan={9} style={{ padding: '36px', textAlign: 'center', color: '#64748B' }}>
                      <LucideIcon name="truck" size={28} color="#CBD5E1" style={{ margin: '0 auto 8px auto' }} />
                      <div style={{ fontWeight: 600, fontSize: '13px', color: '#334155' }}>No vendors found</div>
                    </td>
                  </tr>
                ) : (
                  vendors.map((v, idx) => {
                    const rowNum = (vendorPage - 1) * vendorLimit + idx + 1;
                    const isActive = (v.activeStatus || 'yes').toLowerCase() === 'yes';

                    return (
                      <tr
                        key={v._id}
                        style={{
                          borderBottom: '1px solid #F1F5F9',
                          transition: 'background 0.15s ease'
                        }}
                        onMouseEnter={e => e.currentTarget.style.background = '#F8FAFC'}
                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                      >
                        <td style={{ padding: '7px 10px', color: '#64748B' }}>{v.sNo || rowNum}</td>
                        <td style={{ padding: '7px 10px' }}>
                          <span style={{
                            fontFamily: 'monospace',
                            fontWeight: 700,
                            color: '#1D4ED8',
                            background: '#EFF6FF',
                            padding: '2px 5px',
                            borderRadius: '3px',
                            fontSize: '10.5px'
                          }}>
                            {v.supplierCode || '—'}
                          </span>
                        </td>
                        <td style={{ padding: '7px 10px' }}>
                          <div style={{ fontWeight: 650, color: '#0F172A' }}>{v.supplierName}</div>
                          {v.organizationType && (
                            <div style={{ fontSize: '10px', color: '#64748B' }}>{v.organizationType}</div>
                          )}
                        </td>
                        <td style={{ padding: '7px 10px', color: '#334155' }}>
                          <div>{v.supplierType || '—'}</div>
                          {v.supplierCategory && (
                            <div style={{ fontSize: '10px', color: '#64748B' }}>{v.supplierCategory}</div>
                          )}
                        </td>
                        <td style={{ padding: '7px 10px' }}>
                          <div style={{ fontWeight: 600, color: '#334155' }}>{v.primaryContactPerson || '—'}</div>
                          <div style={{ fontSize: '10.5px', color: '#64748B' }}>
                            {v.primaryContactPersonMobileNo || v.emailId || ''}
                          </div>
                        </td>
                        <td style={{ padding: '7px 10px', fontSize: '10.5px' }}>
                          {v.gstNo && (
                            <div style={{ color: '#0F172A', fontWeight: 600 }}>GST: {v.gstNo}</div>
                          )}
                          {v.panCardNo && (
                            <div style={{ color: '#64748B' }}>PAN: {v.panCardNo}</div>
                          )}
                          {!v.gstNo && !v.panCardNo && <span style={{ color: '#94A3B8' }}>—</span>}
                        </td>
                        <td style={{ padding: '7px 10px', fontSize: '10.5px' }}>
                          <div style={{ fontWeight: 600, color: '#334155' }}>{v.bank || '—'}</div>
                          {v.bankAccountsNo && (
                            <div style={{ color: '#64748B', fontFamily: 'monospace' }}>A/C: {v.bankAccountsNo}</div>
                          )}
                        </td>
                        <td style={{ padding: '7px 10px', textAlign: 'center' }}>
                          <span style={{
                            display: 'inline-block',
                            padding: '1px 7px',
                            borderRadius: '10px',
                            fontSize: '10px',
                            fontWeight: 700,
                            background: isActive ? '#DCFCE7' : '#F1F5F9',
                            color: isActive ? '#15803D' : '#64748B'
                          }}>
                            {isActive ? 'Active' : 'Inactive'}
                          </span>
                        </td>
                        <td style={{ padding: '7px 10px', textAlign: 'right' }}>
                          <div style={{ display: 'inline-flex', gap: '3px' }}>
                            <button
                              onClick={() => openViewForm(v)}
                              title="View Vendor Details"
                              style={{
                                padding: '3px 6px',
                                borderRadius: '4px',
                                border: '1px solid #E2E8F0',
                                background: '#FFFFFF',
                                color: '#475569',
                                cursor: 'pointer',
                                fontSize: '10.5px'
                              }}
                            >
                              <LucideIcon name="eye" size={12} />
                            </button>
                            <button
                              onClick={() => openEditForm(v)}
                              title="Edit Vendor"
                              style={{
                                padding: '3px 6px',
                                borderRadius: '4px',
                                border: '1px solid #E2E8F0',
                                background: '#FFFFFF',
                                color: '#2563EB',
                                cursor: 'pointer',
                                fontSize: '10.5px'
                              }}
                            >
                              <LucideIcon name="pencil" size={12} />
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

          {/* DOCKED BOTTOM PAGINATION */}
          <div style={{
            padding: '8px 14px',
            borderTop: '1px solid #E2E8F0',
            background: '#F8FAFC',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            fontSize: '11.5px',
            color: '#64748B'
          }}>
            <div>
              Showing {vendors.length > 0 ? (vendorPage - 1) * vendorLimit + 1 : 0} to{' '}
              {Math.min(vendorPage * vendorLimit, vendorTotal)} of {vendorTotal} vendors
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <button
                disabled={vendorPage <= 1}
                onClick={() => setVendorPage(p => Math.max(1, p - 1))}
                style={{
                  padding: '3px 8px',
                  borderRadius: '4px',
                  border: '1px solid #CBD5E1',
                  background: vendorPage <= 1 ? '#F1F5F9' : '#FFFFFF',
                  color: vendorPage <= 1 ? '#94A3B8' : '#334155',
                  cursor: vendorPage <= 1 ? 'not-allowed' : 'pointer',
                  fontWeight: 600,
                  fontSize: '11px'
                }}
              >
                &larr; Prev
              </button>
              <span style={{ fontWeight: 600, color: '#334155' }}>
                Page {vendorPage} of {vendorPages}
              </span>
              <button
                disabled={vendorPage >= vendorPages}
                onClick={() => setVendorPage(p => Math.min(vendorPages, p + 1))}
                style={{
                  padding: '3px 8px',
                  borderRadius: '4px',
                  border: '1px solid #CBD5E1',
                  background: vendorPage >= vendorPages ? '#F1F5F9' : '#FFFFFF',
                  color: vendorPage >= vendorPages ? '#94A3B8' : '#334155',
                  cursor: vendorPage >= vendorPages ? 'not-allowed' : 'pointer',
                  fontWeight: 600,
                  fontSize: '11px'
                }}
              >
                Next &rarr;
              </button>
            </div>
          </div>
        </div>
      )}

      {/* SUB-TAB 2: VENDOR REQUESTS TABLE */}
      {activeSubTab === 'requests' && (
        <div style={{
          background: '#FFFFFF',
          borderRadius: '7px',
          border: '1px solid #E2E8F0',
          boxShadow: '0 1px 2px rgba(0,0,0,0.02)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden'
        }}>
          <div style={{ overflowX: 'auto', width: '100%' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '11.5px' }}>
              <thead>
                <tr style={{ background: '#F8FAFC', borderBottom: '1px solid #E2E8F0', color: '#475569', fontWeight: 700, fontSize: '10.5px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  <th style={{ padding: '8px 10px', width: '110px' }}>Request No</th>
                  <th style={{ padding: '8px 10px', width: '130px' }}>Hospital</th>
                  <th style={{ padding: '8px 10px', minWidth: '170px' }}>Proposed Supplier</th>
                  <th style={{ padding: '8px 10px', width: '140px' }}>Contact Person</th>
                  <th style={{ padding: '8px 10px', width: '130px' }}>GST / PAN</th>
                  <th style={{ padding: '8px 10px', width: '120px' }}>Submitted</th>
                  <th style={{ padding: '8px 10px', width: '90px', textAlign: 'center' }}>Status</th>
                  <th style={{ padding: '8px 10px', width: '140px', textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {loadingRequests ? (
                  <tr>
                    <td colSpan={8} style={{ padding: '30px', textAlign: 'center', color: '#64748B' }}>
                      <LucideIcon name="loader-2" size={20} style={{ animation: 'spin 1s linear infinite', margin: '0 auto 6px auto' }} />
                      Loading vendor requests...
                    </td>
                  </tr>
                ) : requests.length === 0 ? (
                  <tr>
                    <td colSpan={8} style={{ padding: '36px', textAlign: 'center', color: '#64748B' }}>
                      <LucideIcon name="check-circle" size={28} color="#CBD5E1" style={{ margin: '0 auto 8px auto' }} />
                      <div style={{ fontWeight: 600, fontSize: '13px', color: '#334155' }}>No vendor requests found</div>
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
                        <td style={{ padding: '7px 10px' }}>
                          <span style={{
                            fontFamily: 'monospace',
                            fontWeight: 700,
                            color: '#0F172A',
                            background: '#F1F5F9',
                            padding: '2px 5px',
                            borderRadius: '3px',
                            fontSize: '10.5px'
                          }}>
                            {req.requestNo}
                          </span>
                        </td>
                        <td style={{ padding: '7px 10px' }}>
                          <div style={{ fontWeight: 650, color: '#334155' }}>{req.hospitalName || req.tenantId}</div>
                          <div style={{ fontSize: '10px', color: '#64748B' }}>Tenant: {req.tenantId}</div>
                        </td>
                        <td style={{ padding: '7px 10px' }}>
                          <div style={{ fontWeight: 700, color: '#0F172A' }}>{vData.supplierName || '—'}</div>
                          {vData.organizationType && (
                            <div style={{ fontSize: '10px', color: '#64748B' }}>{vData.organizationType}</div>
                          )}
                        </td>
                        <td style={{ padding: '7px 10px' }}>
                          <div style={{ fontWeight: 600, color: '#334155' }}>{vData.primaryContactPerson || '—'}</div>
                          <div style={{ fontSize: '10.5px', color: '#64748B' }}>{vData.primaryContactPersonMobileNo || ''}</div>
                        </td>
                        <td style={{ padding: '7px 10px', fontSize: '10.5px' }}>
                          {vData.gstNo && <div style={{ color: '#0F172A', fontWeight: 600 }}>GST: {vData.gstNo}</div>}
                          {vData.panCardNo && <div style={{ color: '#64748B' }}>PAN: {vData.panCardNo}</div>}
                          {!vData.gstNo && !vData.panCardNo && <span style={{ color: '#94A3B8' }}>—</span>}
                        </td>
                        <td style={{ padding: '7px 10px', fontSize: '10.5px', color: '#64748B' }}>
                          <div>{new Date(req.createdAt).toLocaleDateString()}</div>
                          <div style={{ fontSize: '10px' }}>by {req.submittedBy || 'Hospital Staff'}</div>
                        </td>
                        <td style={{ padding: '7px 10px', textAlign: 'center' }}>
                          <span style={{
                            display: 'inline-block',
                            padding: '1px 7px',
                            borderRadius: '10px',
                            fontSize: '10px',
                            fontWeight: 750,
                            background: isPending ? '#FEF3C7' : (isApproved ? '#DCFCE7' : '#FEE2E2'),
                            color: isPending ? '#B45309' : (isApproved ? '#15803D' : '#B91C1C')
                          }}>
                            {req.status}
                          </span>
                        </td>
                        <td style={{ padding: '7px 10px', textAlign: 'right' }}>
                          <div style={{ display: 'inline-flex', gap: '4px' }}>
                            <button
                              onClick={() => setRequestActionState({ type: 'view', request: req })}
                              title="View Proposal Details"
                              style={{
                                padding: '3px 7px',
                                borderRadius: '4px',
                                border: '1px solid #CBD5E1',
                                background: '#FFFFFF',
                                color: '#475569',
                                cursor: 'pointer',
                                fontSize: '10.5px',
                                fontWeight: 600
                              }}
                            >
                              View
                            </button>
                            {isPending && (
                              <>
                                <button
                                  onClick={() => setRequestActionState({ type: 'approve', request: req })}
                                  title="Approve Proposal"
                                  style={{
                                    padding: '3px 7px',
                                    borderRadius: '4px',
                                    border: 'none',
                                    background: '#10B981',
                                    color: '#FFFFFF',
                                    cursor: 'pointer',
                                    fontSize: '10.5px',
                                    fontWeight: 650
                                  }}
                                >
                                  Approve
                                </button>
                                <button
                                  onClick={() => {
                                    setRejectionReason('');
                                    setRequestActionState({ type: 'reject', request: req });
                                  }}
                                  title="Reject Proposal"
                                  style={{
                                    padding: '3px 7px',
                                    borderRadius: '4px',
                                    border: 'none',
                                    background: '#EF4444',
                                    color: '#FFFFFF',
                                    cursor: 'pointer',
                                    fontSize: '10.5px',
                                    fontWeight: 650
                                  }}
                                >
                                  Reject
                                </button>
                              </>
                            )}
                          </div>
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
