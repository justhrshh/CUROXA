import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import * as Icons from 'lucide-react';
import { getAccessToken } from '../../utils/authTokenStore';
import { getPublicFrontendUrl } from '../../utils/urlConfig';

const LucideIcon = ({ name, ...props }) => {
  if (!name) return <Icons.HelpCircle {...props} />;
  const camelName = name
    .split('-')
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join('');
  const IconComponent = Icons[camelName] || Icons.HelpCircle;
  return <IconComponent {...props} />;
};

const getSuperAdminToken = () =>
  getAccessToken() ||
  (typeof localStorage !== 'undefined'
    ? localStorage.getItem('token') || localStorage.getItem('superadminToken')
    : null);

const validatePANFormat = (pan) => {
  if (!pan) return true;
  const panRegex = /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/;
  return panRegex.test(pan?.trim().toUpperCase());
};

const validateGSTINFormat = (gstin) => {
  if (!gstin) return true;
  const gstinRegex = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;
  return gstinRegex.test(gstin?.trim().toUpperCase());
};

const validateCINFormat = (cin) => {
  if (!cin) return true;
  const cinRegex = /^[LU][0-9]{5}[A-Z]{2}[0-9]{4}[A-Z]{3}[0-9]{6}$/i;
  return cinRegex.test(cin?.trim());
};

const validateDrugLicenseFormat = (license) => {
  if (!license) return true;
  const licenseRegex = /^[A-Z0-9][A-Z0-9\-\/\s]{3,28}[A-Z0-9]$/i;
  return licenseRegex.test(license?.trim());
};

const validateCertificateFormat = (cert) => {
  if (!cert) return true;
  const certRegex = /^[A-Z0-9][A-Z0-9\-\/\s]{3,28}[A-Z0-9]$/i;
  return certRegex.test(cert.trim());
};

const ToggleSwitch = ({ checked, onChange, disabled }) => {
  return (
    <label style={{ display: 'inline-flex', alignItems: 'center', cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.6 : 1, position: 'relative' }}>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        style={{ opacity: 0, width: 0, height: 0, position: 'absolute' }}
      />
      <span style={{
        width: '42px',
        height: '24px',
        borderRadius: '9999px',
        backgroundColor: checked ? '#2563EB' : '#CBD5E1',
        transition: 'background-color 0.2s',
        display: 'inline-block',
        position: 'relative'
      }}>
        <span style={{
          width: '18px',
          height: '18px',
          borderRadius: '50%',
          backgroundColor: '#FFFFFF',
          position: 'absolute',
          top: '3px',
          left: '3px',
          transition: 'transform 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
          transform: checked ? 'translateX(18px)' : 'translateX(0px)',
          boxShadow: '0 1px 3px rgba(0,0,0,0.2)'
        }} />
      </span>
    </label>
  );
};

export default function HospitalProfileView({
  hospitalId: propHospitalId,
  onBack,
  onImpersonate,
  plans: propPlans = [],
  onHospitalUpdated
}) {
  const navigate = useNavigate();
  const { hospitalId: routeHospitalId } = useParams();
  const targetId = propHospitalId || routeHospitalId;

  // Data & loading states
  const [hospital, setHospital] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [plans, setPlans] = useState(propPlans);
  const [activeTab, setActiveTab] = useState('overview'); // 'overview', 'branding', 'modules', 'legal', 'admin', 'actions'

  // Toast feedback state
  const [toast, setToast] = useState({ show: false, text: '', type: 'info' });
  const showToast = (text, type = 'info') => {
    setToast({ show: true, text, type });
    setTimeout(() => setToast({ show: false, text: '', type: 'info' }), 4000);
  };

  // Section 1: Branding Draft State
  const [brandingDraft, setBrandingDraft] = useState({ name: '', logo: '' });
  const [brandingSaving, setBrandingSaving] = useState(false);
  const [brandingError, setBrandingError] = useState('');
  const [brandingDragOver, setBrandingDragOver] = useState(false);
  const logoInputRef = useRef(null);

  // Section 2: Module Draft State
  const [moduleDraft, setModuleDraft] = useState({});
  const [moduleSaving, setModuleSaving] = useState(false);
  const [moduleSavedSuccess, setModuleSavedSuccess] = useState(false);
  const [moduleDirty, setModuleDirty] = useState(false);

  // Doctor Clinical Mode
  const [clinicalModeUpdating, setClinicalModeUpdating] = useState(false);

  // Limits Sliders
  const [limitsDraft, setLimitsDraft] = useState({ staffLimit: 20, storageLimit: 50, doctorsLimit: 25 });
  const [limitsSaving, setLimitsSaving] = useState(false);

  // Subscription Plan Upgrade State
  const [selectedPlanUpgrade, setSelectedPlanUpgrade] = useState('');
  const [planSaving, setPlanSaving] = useState(false);

  // Section 3: Legal & Compliance Draft State
  const [complianceDraft, setComplianceDraft] = useState({
    csm: '',
    address: '',
    panNumber: '',
    corpId: '',
    signatoryName: '',
    gst: '',
    license: '',
    fireSafetyCertificate: '',
    pollutionCertificate: ''
  });
  const [complianceSaving, setComplianceSaving] = useState(false);
  const [complianceDirty, setComplianceDirty] = useState(false);
  const [complianceSuccess, setComplianceSuccess] = useState(false);

  // Section 4: Admin Credentials State
  const [adminUsername, setAdminUsername] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [credentialsUpdating, setCredentialsUpdating] = useState(false);
  const [credentialsMsg, setCredentialsMsg] = useState({ text: '', type: '' });

  // Confirmation modal state for destructive actions
  const [confirmModal, setConfirmModal] = useState(null);

  // Fetch full hospital data
  const fetchHospital = async () => {
    if (!targetId) {
      setLoadError('No hospital identifier provided.');
      setLoading(false);
      return;
    }
    setLoading(true);
    setLoadError('');
    try {
      const token = getSuperAdminToken();
      const res = await fetch(`/api/superadmin/hospitals/${targetId}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      if (!res.ok) {
        if (res.status === 404) {
          throw new Error(`Hospital "${targetId}" not found.`);
        }
        throw new Error(`Failed to load hospital profile (HTTP ${res.status}).`);
      }
      const data = await res.json();
      setHospital(data);

      // Populate draft forms
      setBrandingDraft({
        name: data.name || '',
        logo: data.logo && data.logo !== 'H' ? data.logo : ''
      });

      setModuleDraft(data.modules || {});
      setModuleDirty(false);

      setLimitsDraft({
        staffLimit: data.limits?.staffLimit || 20,
        storageLimit: data.limits?.storageLimit || 50,
        doctorsLimit: data.limits?.doctorsLimit || 25
      });

      setComplianceDraft({
        csm: data.csm || '',
        address: data.address || '',
        panNumber: data.panNumber || '',
        corpId: data.corpId || '',
        signatoryName: data.signatoryName || '',
        gst: data.gst || '',
        license: data.license || '',
        fireSafetyCertificate: data.fireSafetyCertificate || '',
        pollutionCertificate: data.pollutionCertificate || ''
      });
      setComplianceDirty(false);

      setAdminUsername(data.adminUsername || '');
      setAdminPassword('');
      setCredentialsMsg({ text: '', type: '' });

    } catch (err) {
      console.error('Hospital profile load error:', err);
      setLoadError(err.message || 'Error loading hospital data');
    } finally {
      setLoading(false);
    }
  };

  // Fetch plans if not provided
  useEffect(() => {
    if (plans.length === 0) {
      const token = getSuperAdminToken();
      if (token) {
        fetch('/api/superadmin/plans', { headers: { 'Authorization': `Bearer ${token}` } })
          .then(r => r.ok ? r.json() : [])
          .then(data => setPlans(data))
          .catch(() => {});
      }
    }
  }, []);

  useEffect(() => {
    fetchHospital();
  }, [targetId]);

  // Back action
  const handleBackToClinics = () => {
    if (onBack) {
      onBack();
    } else {
      navigate('/hospitals');
    }
  };

  // Handle Logo Upload
  const handleLogoFile = (file) => {
    setBrandingError('');
    if (!file) return;
    if (!['image/png', 'image/jpeg', 'image/jpg', 'image/svg+xml'].includes(file.type)) {
      setBrandingError('Only PNG, JPG, or SVG image formats are permitted.');
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setBrandingError('Logo file size must be less than 2 MB.');
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      setBrandingDraft(prev => ({ ...prev, logo: e.target.result }));
    };
    reader.readAsDataURL(file);
  };

  // Save Branding
  const handleSaveBranding = async () => {
    if (!hospital) return;
    setBrandingSaving(true);
    setBrandingError('');
    try {
      const token = getSuperAdminToken();
      const body = {
        name: brandingDraft.name.trim() || hospital.name,
        logo: brandingDraft.logo || 'H'
      };
      const res = await fetch(`/api/superadmin/hospitals/${hospital._id || hospital.hospitalId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(body)
      });
      if (res.ok) {
        const updated = await res.json();
        setHospital(prev => ({ ...prev, ...updated }));
        if (hospital.hospitalId) {
          const hospIdUpper = hospital.hospitalId.toUpperCase();
          try {
            sessionStorage.setItem(`curoxa_portal_${hospIdUpper}`, JSON.stringify({
              hospitalId: hospIdUpper,
              name: updated.name,
              logo: updated.logo,
              status: updated.status || hospital.status || 'Active'
            }));
            window.dispatchEvent(new CustomEvent('curoxa_portal_branding_updated', {
              detail: { hospitalId: hospIdUpper }
            }));
          } catch (_) {}
        }
        showToast('Clinic branding updated successfully!', 'success');
        if (onHospitalUpdated) onHospitalUpdated(updated);
      } else {
        const errData = await res.json().catch(() => ({}));
        setBrandingError(errData.error || 'Failed to save branding.');
      }
    } catch (err) {
      setBrandingError(err.message || 'Network error saving branding');
    } finally {
      setBrandingSaving(false);
    }
  };

  // Save Modules
  const handleSaveModules = async () => {
    if (!hospital) return;
    setModuleSaving(true);
    setModuleSavedSuccess(false);
    try {
      const token = getSuperAdminToken();
      const res = await fetch(`/api/superadmin/hospitals/${hospital._id || hospital.hospitalId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ modules: moduleDraft })
      });
      if (res.ok) {
        const updated = await res.json();
        setHospital(prev => ({ ...prev, ...updated }));
        setModuleDirty(false);
        setModuleSavedSuccess(true);
        showToast('Module configuration saved successfully!', 'success');
        setTimeout(() => setModuleSavedSuccess(false), 3500);
        if (onHospitalUpdated) onHospitalUpdated(updated);
      } else {
        const errData = await res.json().catch(() => ({}));
        showToast(errData.error || 'Failed to save module configuration.', 'error');
      }
    } catch (err) {
      showToast(err.message || 'Error updating modules', 'error');
    } finally {
      setModuleSaving(false);
    }
  };

  // Toggle Doctor Clinical Mode
  const handleUpdateClinicalMode = async (mode) => {
    if (!hospital || hospital.doctorClinicalMode === mode) return;
    setClinicalModeUpdating(true);
    const originalMode = hospital.doctorClinicalMode;
    setHospital(prev => ({ ...prev, doctorClinicalMode: mode }));
    try {
      const token = getSuperAdminToken();
      const res = await fetch(`/api/superadmin/hospitals/${hospital._id || hospital.hospitalId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ doctorClinicalMode: mode })
      });
      if (res.ok) {
        const updated = await res.json();
        setHospital(prev => ({ ...prev, ...updated }));
        showToast(`Doctor Clinical Mode set to ${mode}`, 'success');
        if (onHospitalUpdated) onHospitalUpdated(updated);
      } else {
        setHospital(prev => ({ ...prev, doctorClinicalMode: originalMode }));
        showToast('Failed to update clinical mode.', 'error');
      }
    } catch (err) {
      setHospital(prev => ({ ...prev, doctorClinicalMode: originalMode }));
      showToast('Network error updating clinical mode.', 'error');
    } finally {
      setClinicalModeUpdating(false);
    }
  };

  // Save Limits
  const handleSaveLimits = async (updatedLimits) => {
    if (!hospital) return;
    setLimitsSaving(true);
    try {
      const token = getSuperAdminToken();
      const res = await fetch(`/api/superadmin/hospitals/${hospital._id || hospital.hospitalId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ limits: updatedLimits })
      });
      if (res.ok) {
        const updated = await res.json();
        setHospital(prev => ({ ...prev, ...updated }));
        showToast('System limits updated successfully!', 'success');
        if (onHospitalUpdated) onHospitalUpdated(updated);
      } else {
        showToast('Failed to update limits.', 'error');
      }
    } catch (err) {
      showToast('Error updating limits.', 'error');
    } finally {
      setLimitsSaving(false);
    }
  };

  // Format plan string
  const formatPlanString = (subPlan, cycle = 'monthly') => {
    const plan = subPlan || 'professional';
    const isAnnual = cycle === 'annual';
    const p = plans.find(p => p.matchKey === plan || p.tier?.toLowerCase() === plan.toLowerCase());
    if (p) {
      return isAnnual
        ? `${p.tier} Annual (₹${p.annualPrice?.toLocaleString()}/mo)`
        : `${p.tier} (₹${p.monthlyPrice?.toLocaleString()}/mo)`;
    }
    if (plan.includes('basic')) return 'Standard Basic';
    if (plan.includes('enterprise')) return 'Enterprise Elite';
    return plan;
  };

  // Save Plan Upgrade
  const handleSavePlanUpgrade = async () => {
    if (!hospital || !selectedPlanUpgrade) return;
    setPlanSaving(true);
    try {
      const token = getSuperAdminToken();
      const val = selectedPlanUpgrade;
      const planObj = plans.find(p => p.tier === val || p.matchKey === val || formatPlanString(p.matchKey) === val);

      let docLimit = 50;
      let staffLimit = 100;
      let storageLimit = 200;
      let revenue = val;
      let newModules = {
        reception: { enabled: true },
        doctor: { enabled: true },
        dpdp: { enabled: true },
        pharmacy: { enabled: true },
        laboratory: { enabled: true },
        inventory: { enabled: false }
      };

      if (planObj) {
        docLimit = planObj.docs || 50;
        staffLimit = planObj.staff || 100;
        storageLimit = parseInt(planObj.storage) || 200;
        revenue = `₹${(planObj.monthlyPrice || 0).toLocaleString()}/mo`;
        const modKeys = planObj.modules || [];
        newModules = {
          reception: { enabled: modKeys.includes('reception') },
          doctor: { enabled: modKeys.includes('doctor') },
          dpdp: { enabled: modKeys.includes('dpdp') },
          pharmacy: { enabled: modKeys.includes('pharmacy') },
          laboratory: { enabled: modKeys.includes('laboratory') },
          inventory: { enabled: modKeys.includes('inventory') }
        };
      }

      const updatedLimits = {
        ...hospital.limits,
        doctorsLimit: docLimit,
        staffLimit,
        storageLimit
      };

      const res = await fetch(`/api/superadmin/hospitals/${hospital._id || hospital.hospitalId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({
          plan: val,
          limits: updatedLimits,
          modules: newModules,
          revenue
        })
      });

      if (res.ok) {
        const updated = await res.json();
        setHospital(prev => ({ ...prev, ...updated }));
        setSelectedPlanUpgrade('');
        showToast(`Subscription plan updated to "${val}"!`, 'success');
        if (onHospitalUpdated) onHospitalUpdated(updated);
      } else {
        showToast('Failed to update subscription plan.', 'error');
      }
    } catch (err) {
      showToast('Error updating plan.', 'error');
    } finally {
      setPlanSaving(false);
    }
  };

  // Save Legal & Compliance
  const handleSaveCompliance = async () => {
    if (!hospital) return;

    if (complianceDraft.panNumber && !validatePANFormat(complianceDraft.panNumber)) {
      showToast('Invalid PAN format (e.g. ABCDE1234F)', 'error');
      return;
    }
    if (complianceDraft.gst && !validateGSTINFormat(complianceDraft.gst)) {
      showToast('Invalid GSTIN format (15 characters, e.g. 07METRO8827P1ZX)', 'error');
      return;
    }
    if (complianceDraft.corpId && !validateCINFormat(complianceDraft.corpId)) {
      showToast('Invalid CIN/Corporate ID format (e.g. U85110DL2025PTC384920)', 'error');
      return;
    }
    if (complianceDraft.license && !validateDrugLicenseFormat(complianceDraft.license)) {
      showToast('Invalid Drug License format (5-30 chars, e.g. DL-293849/2026)', 'error');
      return;
    }
    if (complianceDraft.fireSafetyCertificate && !validateCertificateFormat(complianceDraft.fireSafetyCertificate)) {
      showToast('Invalid Fire Safety Certificate format (5-30 chars)', 'error');
      return;
    }
    if (complianceDraft.pollutionCertificate && !validateCertificateFormat(complianceDraft.pollutionCertificate)) {
      showToast('Invalid Pollution Certificate format (5-30 chars)', 'error');
      return;
    }

    setComplianceSaving(true);
    setComplianceSuccess(false);
    try {
      const token = getSuperAdminToken();
      const res = await fetch(`/api/superadmin/hospitals/${hospital._id || hospital.hospitalId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(complianceDraft)
      });
      if (res.ok) {
        const updated = await res.json();
        setHospital(prev => ({ ...prev, ...updated }));
        setComplianceDirty(false);
        setComplianceSuccess(true);
        showToast('Legal & compliance details saved successfully!', 'success');
        setTimeout(() => setComplianceSuccess(false), 3500);
        if (onHospitalUpdated) onHospitalUpdated(updated);
      } else {
        const errData = await res.json().catch(() => ({}));
        showToast(errData.error || 'Failed to save compliance details.', 'error');
      }
    } catch (err) {
      showToast(err.message || 'Error saving compliance details', 'error');
    } finally {
      setComplianceSaving(false);
    }
  };

  // Update Admin Credentials
  const handleUpdateAdminCredentials = async () => {
    if (!hospital) return;
    if (!adminUsername && !adminPassword) {
      setCredentialsMsg({ text: 'Please provide either an Admin Username or a New Password.', type: 'error' });
      return;
    }
    setCredentialsUpdating(true);
    setCredentialsMsg({ text: 'Updating credentials securely...', type: 'info' });
    try {
      const token = getSuperAdminToken();
      const res = await fetch(`/api/superadmin/hospitals/${hospital._id || hospital.hospitalId}/admin`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          adminUsername: adminUsername.trim(),
          adminPassword: adminPassword ? adminPassword.trim() : undefined
        })
      });
      const data = await res.json();
      if (res.ok) {
        setCredentialsMsg({ text: data.message || 'Admin credentials updated successfully!', type: 'success' });
        setAdminPassword('');
        showToast('Admin credentials updated successfully!', 'success');
      } else {
        setCredentialsMsg({ text: data.error || 'Failed to update credentials.', type: 'error' });
      }
    } catch (err) {
      setCredentialsMsg({ text: 'Network error updating credentials.', type: 'error' });
    } finally {
      setCredentialsUpdating(false);
    }
  };

  // Suspend / Reactivate Action
  const handleToggleSuspension = () => {
    if (!hospital) return;
    const isCurrentlyActive = hospital.status === 'Active';
    const nextStatus = isCurrentlyActive ? 'Suspended' : 'Active';
    const title = isCurrentlyActive ? 'Suspend Hospital Account?' : 'Reactivate Hospital Account?';
    const message = isCurrentlyActive
      ? `Are you sure you want to suspend "${hospital.name}"? Users and staff associated with this clinic will lose access to their portal until reactivated.`
      : `Are you sure you want to reactivate "${hospital.name}"? Hospital staff and patients will immediately regain access.`;

    setConfirmModal({
      title,
      message,
      confirmText: isCurrentlyActive ? 'Suspend Account' : 'Reactivate Account',
      cancelText: 'Cancel',
      danger: isCurrentlyActive,
      onConfirm: async () => {
        const token = getSuperAdminToken();
        try {
          const res = await fetch(`/api/superadmin/hospitals/${hospital._id || hospital.hospitalId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({ status: nextStatus })
          });
          if (res.ok) {
            const updated = await res.json();
            setHospital(prev => ({ ...prev, ...updated, status: nextStatus }));
            showToast(`Clinic "${hospital.name}" ${nextStatus.toLowerCase()} successfully!`, nextStatus === 'Suspended' ? 'warning' : 'success');
            setConfirmModal(null);
            if (onHospitalUpdated) onHospitalUpdated(updated);
          } else {
            const errData = await res.json().catch(() => ({}));
            showToast(errData.error || 'Failed to update status.', 'error');
            setConfirmModal(null);
          }
        } catch (err) {
          showToast('Error updating status.', 'error');
          setConfirmModal(null);
        }
      }
    });
  };

  // Delete Clinic Action
  const handleDeleteClinic = () => {
    if (!hospital) return;
    setConfirmModal({
      title: 'Permanently Delete Clinic Account?',
      message: `Are you sure you want to permanently delete "${hospital.name}"? This action cannot be undone. All staff user accounts, patient records, and clinical logs associated with this clinic will be purged permanently.`,
      confirmText: 'Yes, Delete Clinic Permanently',
      cancelText: 'Cancel',
      danger: true,
      onConfirm: async () => {
        const token = getSuperAdminToken();
        try {
          const res = await fetch(`/api/superadmin/hospitals/${hospital._id || hospital.hospitalId}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
          });
          if (res.ok) {
            showToast(`Clinic "${hospital.name}" has been permanently deleted.`, 'success');
            setConfirmModal(null);
            handleBackToClinics();
          } else {
            const errData = await res.json().catch(() => ({}));
            showToast(errData.error || 'Failed to delete clinic.', 'error');
            setConfirmModal(null);
          }
        } catch (err) {
          showToast('Error deleting clinic.', 'error');
          setConfirmModal(null);
        }
      }
    });
  };

  // Loading State
  if (loading) {
    return (
      <div style={{ padding: '40px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
        <LucideIcon name="loader-2" className="animate-spin" style={{ width: '36px', height: '36px', color: '#2563EB', marginBottom: '16px' }} />
        <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: '#1E293B' }}>Loading Hospital Profile...</h3>
        <p style={{ margin: '6px 0 0', fontSize: '13px', color: '#64748B' }}>Fetching verified tenant data and subscription configuration</p>
      </div>
    );
  }

  // Error / Not Found State
  if (loadError || !hospital) {
    return (
      <div style={{ padding: '40px', maxWidth: '600px', margin: '40px auto', background: '#FFFFFF', borderRadius: '16px', border: '1px solid #E2E8F0', textAlign: 'center', boxShadow: '0 4px 20px rgba(0,0,0,0.06)' }}>
        <div style={{ width: '56px', height: '56px', borderRadius: '14px', background: '#FEF2F2', color: '#DC2626', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
          <LucideIcon name="alert-triangle" style={{ width: '28px', height: '28px' }} />
        </div>
        <h2 style={{ fontSize: '18px', fontWeight: 800, color: '#0F172A', margin: '0 0 8px' }}>Hospital Not Found</h2>
        <p style={{ fontSize: '13px', color: '#64748B', margin: '0 0 24px', lineHeight: 1.5 }}>
          {loadError || `Unable to resolve hospital with identifier "${targetId}".`}
        </p>
        <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
          <button
            type="button"
            onClick={fetchHospital}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '10px 18px',
              borderRadius: '8px',
              fontSize: '13px',
              fontWeight: 700,
              background: '#F1F5F9',
              color: '#334155',
              border: '1px solid #CBD5E1',
              cursor: 'pointer'
            }}
          >
            <LucideIcon name="refresh-cw" style={{ width: '14px', height: '14px' }} />
            <span>Retry</span>
          </button>
          <button
            type="button"
            onClick={handleBackToClinics}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '10px 20px',
              borderRadius: '8px',
              fontSize: '13px',
              fontWeight: 700,
              background: '#2563EB',
              color: '#FFFFFF',
              border: 'none',
              cursor: 'pointer'
            }}
          >
            <LucideIcon name="arrow-left" style={{ width: '14px', height: '14px' }} />
            <span>Back to Clinics</span>
          </button>
        </div>
      </div>
    );
  }

  const initials = (hospital.name || 'H').split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
  const portalUrl = hospital.hospitalId ? `${getPublicFrontendUrl()}/portal/${hospital.hospitalId}` : '';
  const isSuspended = hospital.status === 'Suspended';

  return (
    <div style={{ width: '100%', minWidth: 0, boxSizing: 'border-box', padding: '10px 4px 80px 4px', margin: 0, display: 'flex', flexDirection: 'column' }}>
      {/* Toast Banner */}
      {toast.show && (
        <div style={{
          position: 'fixed',
          top: '24px',
          right: '24px',
          zIndex: 999999,
          background: toast.type === 'success' ? '#16A34A' : toast.type === 'error' ? '#DC2626' : toast.type === 'warning' ? '#EA580C' : '#2563EB',
          color: '#FFFFFF',
          padding: '12px 20px',
          borderRadius: '10px',
          fontSize: '13px',
          fontWeight: 700,
          boxShadow: '0 8px 24px rgba(0,0,0,0.18)',
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          animation: 'slideIn 0.2s ease-out'
        }}>
          <LucideIcon name={toast.type === 'success' ? 'check-circle' : 'info'} style={{ width: '16px', height: '16px' }} />
          <span>{toast.text}</span>
        </div>
      )}

      {/* Confirmation Modal */}
      {confirmModal && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(15, 23, 42, 0.65)',
          backdropFilter: 'blur(4px)',
          zIndex: 999999,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '20px'
        }}>
          <div style={{
            background: '#FFFFFF',
            borderRadius: '16px',
            padding: '28px',
            maxWidth: '480px',
            width: '100%',
            boxShadow: '0 20px 50px rgba(0,0,0,0.25)',
            border: '1px solid #E2E8F0'
          }}>
            <div style={{
              width: '44px',
              height: '44px',
              borderRadius: '12px',
              background: confirmModal.danger ? '#FEF2F2' : '#EFF6FF',
              color: confirmModal.danger ? '#DC2626' : '#2563EB',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: '16px'
            }}>
              <LucideIcon name={confirmModal.danger ? 'alert-triangle' : 'help-circle'} style={{ width: '22px', height: '22px' }} />
            </div>
            <h3 style={{ margin: '0 0 8px', fontSize: '17px', fontWeight: 800, color: '#0F172A' }}>
              {confirmModal.title}
            </h3>
            <p style={{ margin: '0 0 24px', fontSize: '13px', color: '#64748B', lineHeight: 1.5 }}>
              {confirmModal.message}
            </p>
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={() => setConfirmModal(null)}
                style={{
                  padding: '9px 16px',
                  borderRadius: '8px',
                  fontSize: '13px',
                  fontWeight: 650,
                  background: '#FFFFFF',
                  color: '#475569',
                  border: '1px solid #CBD5E1',
                  cursor: 'pointer'
                }}
              >
                {confirmModal.cancelText || 'Cancel'}
              </button>
              <button
                type="button"
                onClick={confirmModal.onConfirm}
                style={{
                  padding: '9px 18px',
                  borderRadius: '8px',
                  fontSize: '13px',
                  fontWeight: 700,
                  background: confirmModal.danger ? '#DC2626' : '#2563EB',
                  color: '#FFFFFF',
                  border: 'none',
                  cursor: 'pointer',
                  boxShadow: confirmModal.danger ? '0 2px 8px rgba(220, 38, 38, 0.3)' : '0 2px 8px rgba(37, 99, 235, 0.3)'
                }}
              >
                {confirmModal.confirmText || 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Top Breadcrumb & Back Action */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
        <button
          type="button"
          onClick={handleBackToClinics}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            padding: '8px 14px',
            borderRadius: '8px',
            fontSize: '12.5px',
            fontWeight: 700,
            background: '#FFFFFF',
            color: '#334155',
            border: '1px solid #CBD5E1',
            cursor: 'pointer',
            transition: 'all 0.15s ease',
            boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
          }}
          onMouseOver={e => e.currentTarget.style.background = '#F8FAFC'}
          onMouseOut={e => e.currentTarget.style.background = '#FFFFFF'}
        >
          <LucideIcon name="arrow-left" style={{ width: '15px', height: '15px' }} />
          <span>Back to Clinics</span>
        </button>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{
            fontSize: '11px',
            fontWeight: 750,
            padding: '4px 10px',
            borderRadius: '6px',
            background: isSuspended ? '#FEF2F2' : '#F0FDF4',
            color: isSuspended ? '#DC2626' : '#16A34A',
            border: `1px solid ${isSuspended ? '#FECACA' : '#BBF7D0'}`
          }}>
            ● {hospital.status || 'Active'}
          </span>
          <span style={{
            fontSize: '11px',
            fontWeight: 700,
            padding: '4px 10px',
            borderRadius: '6px',
            background: '#EFF6FF',
            color: '#2563EB',
            border: '1px solid #BFDBFE'
          }}>
            {hospital.plan || 'Standard Basic'}
          </span>
        </div>
      </div>

      {/* Hero Header Card */}
      <div style={{
        background: '#FFFFFF',
        borderRadius: '16px',
        padding: '24px 28px',
        border: '1px solid #E2E8F0',
        boxShadow: '0 4px 20px rgba(0,0,0,0.04)',
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '20px',
        marginBottom: '24px',
        width: '100%',
        boxSizing: 'border-box'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '18px' }}>
          <div style={{
            width: '64px',
            height: '64px',
            borderRadius: '14px',
            background: '#EFF6FF',
            color: '#2563EB',
            border: '1.5px solid #DBEAFE',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontWeight: 800,
            fontSize: '22px',
            flexShrink: 0,
            overflow: 'hidden'
          }}>
            {hospital.logo && hospital.logo !== 'H' && (hospital.logo.startsWith('data:') || hospital.logo.startsWith('http://') || hospital.logo.startsWith('https://') || hospital.logo.startsWith('/uploads/')) ? (
              <img src={hospital.logo} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
            ) : (
              initials
            )}
          </div>

          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <h1 style={{ margin: 0, fontSize: '20px', fontWeight: 800, color: '#0F172A' }}>
                {hospital.name}
              </h1>
              {hospital.hospitalId && (
                <span style={{
                  fontFamily: 'monospace',
                  fontWeight: 800,
                  fontSize: '12px',
                  background: '#DBEAFE',
                  color: '#1E40AF',
                  padding: '3px 9px',
                  borderRadius: '6px',
                  border: '1px solid #BFDBFE'
                }}>
                  {hospital.hospitalId}
                </span>
              )}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '6px', fontSize: '12px', color: '#64748B' }}>
              <span>Code: <strong style={{ color: '#334155' }}>{hospital.code}</strong></span>
              <span>•</span>
              <span>CSM: <strong style={{ color: '#334155' }}>{hospital.csm || 'Unassigned'}</strong></span>
              <span>•</span>
              <span>Health Score: <strong style={{ color: hospital.healthScore >= 90 ? '#16A34A' : '#EA580C' }}>{hospital.healthScore || 100}%</strong></span>
            </div>
          </div>
        </div>

        {/* Header Action Buttons */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          {portalUrl ? (
            <>
              <a
                href={portalUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '9px 15px',
                  borderRadius: '8px',
                  fontSize: '12px',
                  fontWeight: 700,
                  textDecoration: 'none',
                  background: '#2563EB',
                  color: '#FFFFFF',
                  boxShadow: '0 2px 6px rgba(37, 99, 235, 0.25)'
                }}
              >
                <LucideIcon name="external-link" style={{ width: '14px', height: '14px' }} />
                <span>Open Portal</span>
              </a>
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(portalUrl).then(() => {
                    showToast(`Copied portal URL: ${portalUrl}`, 'success');
                  }).catch(() => {
                    showToast('Failed to copy to clipboard', 'error');
                  });
                }}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '9px 14px',
                  borderRadius: '8px',
                  fontSize: '12px',
                  fontWeight: 700,
                  background: '#FFFFFF',
                  color: '#334155',
                  border: '1px solid #CBD5E1',
                  cursor: 'pointer'
                }}
              >
                <LucideIcon name="copy" style={{ width: '14px', height: '14px' }} />
                <span>Copy Link</span>
              </button>
            </>
          ) : null}

          <button
            type="button"
            onClick={() => {
              if (onImpersonate) {
                onImpersonate(hospital);
              } else {
                localStorage.setItem('curoxa_superadmin_session', JSON.stringify({
                  tenantId: hospital.code,
                  hospitalName: hospital.name,
                  hospitalId: hospital.hospitalId
                }));
                showToast(`Impersonation session initiated for ${hospital.name}`, 'success');
              }
            }}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '9px 15px',
              borderRadius: '8px',
              fontSize: '12px',
              fontWeight: 700,
              background: '#0F172A',
              color: '#FFFFFF',
              border: 'none',
              cursor: 'pointer',
              boxShadow: '0 2px 6px rgba(15, 23, 42, 0.2)'
            }}
          >
            <LucideIcon name="shield" style={{ width: '14px', height: '14px' }} />
            <span>Impersonate Portal</span>
          </button>
        </div>
      </div>

      {/* Navigation Tabs / Pills */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '24px', overflowX: 'auto', paddingBottom: '4px', width: '100%', boxSizing: 'border-box' }}>
        {[
          { id: 'overview', label: 'Overview & Branding', icon: 'image' },
          { id: 'modules', label: 'Subscription & Modules', icon: 'sliders' },
          { id: 'legal', label: 'Registration & Legal', icon: 'file-text' },
          { id: 'admin', label: 'Admin Credentials', icon: 'key' },
          { id: 'actions', label: 'Administrative Operations', icon: 'settings' }
        ].map(tab => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                padding: '9px 18px',
                borderRadius: '10px',
                fontSize: '12.5px',
                fontWeight: 700,
                background: isActive ? '#2563EB' : '#FFFFFF',
                color: isActive ? '#FFFFFF' : '#475569',
                border: `1px solid ${isActive ? '#2563EB' : '#E2E8F0'}`,
                cursor: 'pointer',
                transition: 'all 0.15s ease',
                whiteSpace: 'nowrap',
                boxShadow: isActive ? '0 2px 6px rgba(37, 99, 235, 0.25)' : 'none'
              }}
            >
              <LucideIcon name={tab.icon} style={{ width: '15px', height: '15px' }} />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* MAIN CONTENT PANELS */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', width: '100%', boxSizing: 'border-box' }}>

        {/* SECTION 1: OVERVIEW & BRANDING */}
        {(activeTab === 'overview' || activeTab === 'all') && (
          <div style={{ background: '#FFFFFF', borderRadius: '16px', border: '1px solid #E2E8F0', padding: '24px 28px', boxShadow: '0 2px 10px rgba(0,0,0,0.02)', width: '100%', boxSizing: 'border-box' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px', borderBottom: '1px solid #F1F5F9', paddingBottom: '14px' }}>
              <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: '#EFF6FF', color: '#2563EB', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <LucideIcon name="palette" style={{ width: '16px', height: '16px' }} />
              </div>
              <div>
                <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 800, color: '#0F172A' }}>Branding & Portal Access</h3>
                <p style={{ margin: '2px 0 0', fontSize: '12px', color: '#64748B' }}>Configure public display identity, portal logo, and canonical access link</p>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '24px' }}>
              {/* Left Column: Name & Portal Access */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 750, color: '#334155', marginBottom: '6px' }}>
                    Clinic / Hospital Display Name
                  </label>
                  <input
                    type="text"
                    value={brandingDraft.name}
                    onChange={e => setBrandingDraft(prev => ({ ...prev, name: e.target.value }))}
                    placeholder="Enter hospital name"
                    style={{
                      width: '100%',
                      padding: '10px 14px',
                      borderRadius: '8px',
                      border: '1.5px solid #CBD5E1',
                      fontSize: '13px',
                      color: '#0F172A',
                      outline: 'none',
                      boxSizing: 'border-box'
                    }}
                  />
                </div>

                <div style={{ background: '#F8FAFC', padding: '16px', borderRadius: '10px', border: '1px solid #E2E8F0', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '11px', fontWeight: 800, color: '#64748B', textTransform: 'uppercase' }}>Portal URL</span>
                    {hospital.hospitalId && (
                      <span style={{ fontSize: '10.5px', fontWeight: 750, color: '#1E40AF', background: '#DBEAFE', padding: '2px 8px', borderRadius: '4px' }}>
                        ID: {hospital.hospitalId}
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: '12px', color: '#1E293B', fontFamily: 'monospace', background: '#FFFFFF', padding: '10px 12px', borderRadius: '6px', border: '1px solid #CBD5E1', wordBreak: 'break-all' }}>
                    {portalUrl || 'Unavailable'}
                  </div>
                  <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
                    <a
                      href={portalUrl || '#'}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        flex: 1,
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '6px',
                        padding: '8px 12px',
                        borderRadius: '6px',
                        fontSize: '11.5px',
                        fontWeight: 700,
                        textDecoration: 'none',
                        background: '#2563EB',
                        color: '#FFFFFF'
                      }}
                    >
                      <LucideIcon name="external-link" style={{ width: '13px', height: '13px' }} />
                      <span>Open Portal</span>
                    </a>
                    <button
                      type="button"
                      onClick={() => {
                        if (portalUrl) {
                          navigator.clipboard.writeText(portalUrl);
                          showToast(`Copied portal URL: ${portalUrl}`, 'success');
                        }
                      }}
                      style={{
                        flex: 1,
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '6px',
                        padding: '8px 12px',
                        borderRadius: '6px',
                        fontSize: '11.5px',
                        fontWeight: 700,
                        background: '#FFFFFF',
                        color: '#334155',
                        border: '1px solid #CBD5E1',
                        cursor: 'pointer'
                      }}
                    >
                      <LucideIcon name="copy" style={{ width: '13px', height: '13px' }} />
                      <span>Copy Link</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* Right Column: Logo Upload & Dropzone */}
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 750, color: '#334155', marginBottom: '6px' }}>
                  Clinic Logo (PNG, JPG, or SVG, max 2MB)
                </label>
                <div
                  style={{
                    width: '100%',
                    height: '140px',
                    borderRadius: '12px',
                    border: brandingDragOver ? '2px dashed #2563EB' : '2px dashed #CBD5E1',
                    background: brandingDragOver ? '#EFF6FF' : '#F8FAFC',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    overflow: 'hidden',
                    transition: 'all 0.15s ease',
                    position: 'relative'
                  }}
                  onClick={() => logoInputRef.current && logoInputRef.current.click()}
                  onDragOver={e => { e.preventDefault(); setBrandingDragOver(true); }}
                  onDragLeave={() => setBrandingDragOver(false)}
                  onDrop={e => {
                    e.preventDefault();
                    setBrandingDragOver(false);
                    const f = e.dataTransfer.files?.[0];
                    if (f) handleLogoFile(f);
                  }}
                >
                  {brandingDraft.logo && brandingDraft.logo !== 'H' ? (
                    <div style={{ position: 'relative', width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '12px' }}>
                      <img src={brandingDraft.logo} alt="Logo Preview" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px', color: '#64748B' }}>
                      <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: '#EFF6FF', color: '#2563EB', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <LucideIcon name="upload-cloud" style={{ width: '20px', height: '20px' }} />
                      </div>
                      <span style={{ fontSize: '12px', fontWeight: 650, color: '#1E293B' }}>Click or drag & drop logo here</span>
                      <span style={{ fontSize: '11px', color: '#94A3B8' }}>PNG, JPG, or SVG (max 2 MB)</span>
                    </div>
                  )}
                </div>

                <input
                  ref={logoInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/jpg,image/svg+xml"
                  style={{ display: 'none' }}
                  onChange={e => {
                    if (e.target.files?.[0]) handleLogoFile(e.target.files[0]);
                  }}
                />

                <div style={{ display: 'flex', gap: '8px', marginTop: '10px', alignItems: 'center' }}>
                  <button
                    type="button"
                    onClick={() => logoInputRef.current && logoInputRef.current.click()}
                    style={{
                      fontSize: '11.5px',
                      fontWeight: 700,
                      color: '#2563EB',
                      background: '#EFF6FF',
                      border: '1px solid #BFDBFE',
                      borderRadius: '6px',
                      padding: '6px 14px',
                      cursor: 'pointer'
                    }}
                  >
                    {brandingDraft.logo && brandingDraft.logo !== 'H' ? 'Change Image' : 'Upload Image'}
                  </button>
                  {brandingDraft.logo && brandingDraft.logo !== 'H' && (
                    <button
                      type="button"
                      onClick={() => setBrandingDraft(prev => ({ ...prev, logo: '' }))}
                      style={{
                        fontSize: '11.5px',
                        fontWeight: 700,
                        color: '#DC2626',
                        background: '#FEF2F2',
                        border: '1px solid #FECACA',
                        borderRadius: '6px',
                        padding: '6px 14px',
                        cursor: 'pointer'
                      }}
                    >
                      Remove Logo
                    </button>
                  )}
                </div>

                {brandingError && (
                  <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', color: '#DC2626', borderRadius: '8px', padding: '8px 12px', fontSize: '12px', marginTop: '12px' }}>
                    {brandingError}
                  </div>
                )}
              </div>
            </div>

            <div style={{ marginTop: '24px', borderTop: '1px solid #F1F5F9', paddingTop: '16px', display: 'flex', justifyContent: 'flex-end' }}>
              <button
                type="button"
                disabled={brandingSaving}
                onClick={handleSaveBranding}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '10px 20px',
                  borderRadius: '8px',
                  fontSize: '13px',
                  fontWeight: 700,
                  background: '#2563EB',
                  color: '#FFFFFF',
                  border: 'none',
                  cursor: brandingSaving ? 'not-allowed' : 'pointer',
                  boxShadow: '0 2px 8px rgba(37, 99, 235, 0.25)'
                }}
              >
                {brandingSaving ? (
                  <>
                    <LucideIcon name="loader-2" className="animate-spin" style={{ width: '15px', height: '15px' }} />
                    <span>Saving Branding...</span>
                  </>
                ) : (
                  <>
                    <LucideIcon name="save" style={{ width: '15px', height: '15px' }} />
                    <span>Save Branding Changes</span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {/* SECTION 2: SUBSCRIPTION & MODULE CONFIGURATION */}
        {(activeTab === 'modules' || activeTab === 'all') && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            {/* Software Module Flags */}
            <div style={{ background: '#FFFFFF', borderRadius: '16px', border: '1px solid #E2E8F0', padding: '24px 28px', boxShadow: '0 2px 10px rgba(0,0,0,0.02)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px', borderBottom: '1px solid #F1F5F9', paddingBottom: '14px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: '#EFF6FF', color: '#2563EB', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <LucideIcon name="sliders" style={{ width: '16px', height: '16px' }} />
                  </div>
                  <div>
                    <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 800, color: '#0F172A' }}>Software Module Access Flags</h3>
                    <p style={{ margin: '2px 0 0', fontSize: '12px', color: '#64748B' }}>Authoritative Super Admin module overrides for this clinic</p>
                  </div>
                </div>
                <span style={{ fontSize: '11px', fontWeight: 750, color: '#2563EB', background: '#EFF6FF', padding: '3px 10px', borderRadius: '6px', border: '1px solid #DBEAFE' }}>
                  Authoritative Overrides Active
                </span>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px' }}>
                {['reception', 'doctor', 'pharmacy', 'laboratory', 'inventory', 'dpdp'].map(mod => {
                  const isEnabled = moduleDraft?.[mod]?.enabled !== undefined
                    ? Boolean(moduleDraft[mod].enabled)
                    : (hospital.modules?.[mod]?.enabled !== undefined ? Boolean(hospital.modules[mod].enabled) : true);

                  const planStr = String(hospital.plan || '').toLowerCase();
                  const isBasic = planStr.includes('basic') || planStr.includes('standard');
                  const planAllows = isBasic ? (mod === 'reception' || mod === 'doctor') : true;
                  const isCustomOverride = isEnabled && !planAllows;

                  return (
                    <div key={mod} style={{ background: '#F8FAFC', padding: '16px', borderRadius: '12px', border: '1px solid #E2E8F0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ textTransform: 'capitalize', fontWeight: 700, fontSize: '13px', color: '#0F172A' }}>
                            {mod} Module
                          </span>
                          {isCustomOverride && (
                            <span style={{ fontSize: '9.5px', fontWeight: 750, padding: '1px 6px', borderRadius: '4px', background: '#F3E8FF', color: '#7E22CE', border: '1px solid #E9D5FF' }}>
                              Custom Override
                            </span>
                          )}
                          {!planAllows && !isEnabled && (
                            <span style={{ fontSize: '9.5px', fontWeight: 750, padding: '1px 6px', borderRadius: '4px', background: '#F1F5F9', color: '#64748B', border: '1px solid #E2E8F0' }}>
                              Plan Excluded
                            </span>
                          )}
                          {planAllows && (
                            <span style={{ fontSize: '9.5px', fontWeight: 750, padding: '1px 6px', borderRadius: '4px', background: '#F0FDF4', color: '#16A34A', border: '1px solid #BBF7D0' }}>
                              Plan Default
                            </span>
                          )}
                        </div>
                        <span style={{ fontSize: '11px', color: '#64748B' }}>
                          {isCustomOverride
                            ? 'Authoritative override active'
                            : !planAllows
                              ? 'Excluded by subscription plan tier'
                              : 'Included in base subscription tier'}
                        </span>
                      </div>

                      <ToggleSwitch
                        checked={isEnabled}
                        onChange={(val) => {
                          setModuleDraft(prev => ({
                            ...prev,
                            [mod]: {
                              ...(prev[mod] || {}),
                              enabled: val,
                              lastMod: new Date().toLocaleDateString()
                            }
                          }));
                          setModuleDirty(true);
                          setModuleSavedSuccess(false);
                        }}
                      />
                    </div>
                  );
                })}
              </div>

              <div style={{ marginTop: '20px', borderTop: '1px solid #F1F5F9', paddingTop: '16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  {moduleDirty && (
                    <span style={{ fontSize: '12px', color: '#EA580C', fontWeight: 650, display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                      <LucideIcon name="alert-circle" style={{ width: '14px', height: '14px' }} />
                      <span>Unsaved module changes. Click save to persist.</span>
                    </span>
                  )}
                  {moduleSavedSuccess && (
                    <span style={{ fontSize: '12px', color: '#16A34A', fontWeight: 650, display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                      <LucideIcon name="check-circle" style={{ width: '14px', height: '14px' }} />
                      <span>Module configuration saved successfully!</span>
                    </span>
                  )}
                </div>

                <button
                  type="button"
                  disabled={moduleSaving}
                  onClick={handleSaveModules}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '10px 20px',
                    borderRadius: '8px',
                    fontSize: '13px',
                    fontWeight: 700,
                    background: moduleDirty ? '#2563EB' : '#0F172A',
                    color: '#FFFFFF',
                    border: 'none',
                    cursor: moduleSaving ? 'not-allowed' : 'pointer',
                    boxShadow: moduleDirty ? '0 2px 8px rgba(37, 99, 235, 0.25)' : 'none'
                  }}
                >
                  {moduleSaving ? (
                    <>
                      <LucideIcon name="loader-2" className="animate-spin" style={{ width: '15px', height: '15px' }} />
                      <span>Saving Modules...</span>
                    </>
                  ) : (
                    <>
                      <LucideIcon name="save" style={{ width: '15px', height: '15px' }} />
                      <span>Save Module Access</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Doctor Clinical Mode & Limits */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '24px' }}>
              {/* Doctor Clinical Mode Card */}
              <div style={{ background: '#FFFFFF', borderRadius: '16px', border: '1px solid #E2E8F0', padding: '24px 28px', boxShadow: '0 2px 10px rgba(0,0,0,0.02)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
                  <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 800, color: '#0F172A' }}>Doctor Clinical Mode</h3>
                  <span style={{
                    fontSize: '10.5px',
                    fontWeight: 800,
                    padding: '3px 9px',
                    borderRadius: '12px',
                    background: (hospital.doctorClinicalMode || 'ONLINE') === 'ONLINE' ? '#EFF6FF' : '#FFF7ED',
                    color: (hospital.doctorClinicalMode || 'ONLINE') === 'ONLINE' ? '#2563EB' : '#EA580C',
                    border: `1px solid ${(hospital.doctorClinicalMode || 'ONLINE') === 'ONLINE' ? '#BFDBFE' : '#FED7AA'}`
                  }}>
                    ● {hospital.doctorClinicalMode || 'ONLINE'}
                  </span>
                </div>

                <div style={{ display: 'flex', gap: '8px', background: '#F1F5F9', padding: '4px', borderRadius: '10px', marginBottom: '14px' }}>
                  <button
                    type="button"
                    disabled={clinicalModeUpdating}
                    onClick={() => handleUpdateClinicalMode('ONLINE')}
                    style={{
                      flex: 1,
                      padding: '9px 12px',
                      borderRadius: '8px',
                      fontSize: '12px',
                      fontWeight: 800,
                      border: 'none',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                      background: (hospital.doctorClinicalMode || 'ONLINE') === 'ONLINE' ? '#2563EB' : 'transparent',
                      color: (hospital.doctorClinicalMode || 'ONLINE') === 'ONLINE' ? '#FFFFFF' : '#64748B',
                      boxShadow: (hospital.doctorClinicalMode || 'ONLINE') === 'ONLINE' ? '0 2px 6px rgba(37, 99, 235, 0.3)' : 'none'
                    }}
                  >
                    ONLINE Mode
                  </button>
                  <button
                    type="button"
                    disabled={clinicalModeUpdating}
                    onClick={() => handleUpdateClinicalMode('OFFLINE')}
                    style={{
                      flex: 1,
                      padding: '9px 12px',
                      borderRadius: '8px',
                      fontSize: '12px',
                      fontWeight: 800,
                      border: 'none',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                      background: (hospital.doctorClinicalMode || 'ONLINE') === 'OFFLINE' ? '#EA580C' : 'transparent',
                      color: (hospital.doctorClinicalMode || 'ONLINE') === 'OFFLINE' ? '#FFFFFF' : '#64748B',
                      boxShadow: (hospital.doctorClinicalMode || 'ONLINE') === 'OFFLINE' ? '0 2px 6px rgba(234, 88, 12, 0.3)' : 'none'
                    }}
                  >
                    OFFLINE Mode
                  </button>
                </div>

                <div style={{ fontSize: '12px', lineHeight: 1.5, color: '#64748B', background: '#F8FAFC', padding: '14px', borderRadius: '10px', border: '1px solid #E2E8F0' }}>
                  {(hospital.doctorClinicalMode || 'ONLINE') === 'ONLINE' ? (
                    <div>
                      <strong style={{ color: '#0F172A', display: 'block', marginBottom: '4px' }}>Digital EMR Consultation:</strong>
                      Doctors use Quroxa's online clinical interface for digital prescriptions, diagnosis coding, and direct pharmacy dispensing queues.
                    </div>
                  ) : (
                    <div>
                      <strong style={{ color: '#0F172A', display: 'block', marginBottom: '4px' }}>Physical Handwritten Mode:</strong>
                      Doctors prescribe on physical paper. Reception or staff scans and uploads prescriptions into the system.
                    </div>
                  )}
                </div>
              </div>

              {/* System Limits & Storage */}
              <div style={{ background: '#FFFFFF', borderRadius: '16px', border: '1px solid #E2E8F0', padding: '24px 28px', boxShadow: '0 2px 10px rgba(0,0,0,0.02)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
                  <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 800, color: '#0F172A' }}>Provisioned Limits</h3>
                  <span style={{ fontSize: '11px', color: '#64748B' }}>Storage & User Quotas</span>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: '6px' }}>
                      <span style={{ fontWeight: 700, color: '#334155' }}>Staff Accounts</span>
                      <span style={{ color: '#64748B' }}><strong>{hospital.limits?.staffUsed || 0}</strong> of {limitsDraft.staffLimit} used</span>
                    </div>
                    <input
                      type="range"
                      min="1"
                      max="100"
                      value={limitsDraft.staffLimit}
                      onChange={e => setLimitsDraft(prev => ({ ...prev, staffLimit: parseInt(e.target.value) }))}
                      onMouseUp={() => handleSaveLimits({ ...hospital.limits, staffLimit: limitsDraft.staffLimit })}
                      onTouchEnd={() => handleSaveLimits({ ...hospital.limits, staffLimit: limitsDraft.staffLimit })}
                      style={{ width: '100%', accentColor: '#2563EB' }}
                    />
                  </div>

                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: '6px' }}>
                      <span style={{ fontWeight: 700, color: '#334155' }}>Storage Quota</span>
                      <span style={{ color: '#64748B' }}><strong>{hospital.limits?.storageUsed || 0} GB</strong> of {limitsDraft.storageLimit} GB used</span>
                    </div>
                    <input
                      type="range"
                      min="10"
                      max="500"
                      step="10"
                      value={limitsDraft.storageLimit}
                      onChange={e => setLimitsDraft(prev => ({ ...prev, storageLimit: parseInt(e.target.value) }))}
                      onMouseUp={() => handleSaveLimits({ ...hospital.limits, storageLimit: limitsDraft.storageLimit })}
                      onTouchEnd={() => handleSaveLimits({ ...hospital.limits, storageLimit: limitsDraft.storageLimit })}
                      style={{ width: '100%', accentColor: '#2563EB' }}
                    />
                  </div>
                </div>

                {/* Plan Upgrade Dropdown */}
                <div style={{ marginTop: '20px', paddingTop: '16px', borderTop: '1px solid #F1F5F9' }}>
                  <label style={{ display: 'block', fontSize: '11.5px', fontWeight: 750, color: '#334155', marginBottom: '6px' }}>
                    SUBSCRIPTION PLAN TIER
                  </label>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <select
                      value={selectedPlanUpgrade || hospital.plan || ''}
                      onChange={e => setSelectedPlanUpgrade(e.target.value)}
                      style={{
                        flex: 1,
                        padding: '8px 12px',
                        borderRadius: '8px',
                        border: '1.5px solid #CBD5E1',
                        fontSize: '12px',
                        color: '#0F172A',
                        outline: 'none',
                        background: '#FFFFFF'
                      }}
                    >
                      {plans.map(p => (
                        <option key={p._id || p.matchKey} value={p.tier || p.matchKey}>
                          {p.tier} (₹{(p.monthlyPrice || 0).toLocaleString()}/mo)
                        </option>
                      ))}
                      <option value="Standard Basic">Standard Basic</option>
                      <option value="Enterprise Elite">Enterprise Elite</option>
                      <option value="Custom Plan">Custom Plan</option>
                    </select>

                    <button
                      type="button"
                      disabled={planSaving || !selectedPlanUpgrade || selectedPlanUpgrade === hospital.plan}
                      onClick={handleSavePlanUpgrade}
                      style={{
                        padding: '8px 14px',
                        borderRadius: '8px',
                        fontSize: '12px',
                        fontWeight: 700,
                        background: (!selectedPlanUpgrade || selectedPlanUpgrade === hospital.plan) ? '#E2E8F0' : '#2563EB',
                        color: (!selectedPlanUpgrade || selectedPlanUpgrade === hospital.plan) ? '#94A3B8' : '#FFFFFF',
                        border: 'none',
                        cursor: (!selectedPlanUpgrade || selectedPlanUpgrade === hospital.plan) ? 'not-allowed' : 'pointer'
                      }}
                    >
                      {planSaving ? 'Updating...' : 'Upgrade Plan'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* SECTION 3: REGISTRATION & LEGAL DETAILS */}
        {(activeTab === 'legal' || activeTab === 'all') && (
          <div style={{ background: '#FFFFFF', borderRadius: '16px', border: '1px solid #E2E8F0', padding: '24px 28px', boxShadow: '0 2px 10px rgba(0,0,0,0.02)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px', borderBottom: '1px solid #F1F5F9', paddingBottom: '14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: '#EFF6FF', color: '#2563EB', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <LucideIcon name="file-text" style={{ width: '16px', height: '16px' }} />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 800, color: '#0F172A' }}>Hospital Details, Legal & Compliance</h3>
                  <p style={{ margin: '2px 0 0', fontSize: '12px', color: '#64748B' }}>Corporate registry IDs, verified tax credentials, and regulatory filings</p>
                </div>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '20px' }}>
              {/* Physical Address */}
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                  Registered Physical Address
                </label>
                <input
                  type="text"
                  value={complianceDraft.address}
                  onChange={e => {
                    setComplianceDraft(prev => ({ ...prev, address: e.target.value }));
                    setComplianceDirty(true);
                  }}
                  placeholder="Clinic Physical Address, City, State, PIN"
                  style={{ width: '100%', padding: '10px 14px', borderRadius: '8px', border: '1.5px solid #CBD5E1', fontSize: '13px', outline: 'none', boxSizing: 'border-box' }}
                />
              </div>

              {/* CSM */}
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                  Customer Success Manager (CSM)
                </label>
                <input
                  type="text"
                  value={complianceDraft.csm}
                  onChange={e => {
                    setComplianceDraft(prev => ({ ...prev, csm: e.target.value }));
                    setComplianceDirty(true);
                  }}
                  placeholder="Assigned CS Lead"
                  style={{ width: '100%', padding: '10px 14px', borderRadius: '8px', border: '1.5px solid #CBD5E1', fontSize: '13px', outline: 'none', boxSizing: 'border-box' }}
                />
              </div>

              {/* PAN Number */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                  <label style={{ fontSize: '12px', fontWeight: 700, color: '#334155' }}>PAN Number</label>
                  <span style={{ fontSize: '10.5px', color: complianceDraft.panNumber?.length === 10 ? '#16A34A' : '#94A3B8', fontWeight: 700 }}>
                    {complianceDraft.panNumber?.length || 0}/10
                  </span>
                </div>
                <input
                  type="text"
                  maxLength={10}
                  value={complianceDraft.panNumber}
                  onChange={e => {
                    const val = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10);
                    setComplianceDraft(prev => ({ ...prev, panNumber: val }));
                    setComplianceDirty(true);
                  }}
                  placeholder="e.g. ABCDE1234F"
                  style={{
                    width: '100%',
                    padding: '10px 14px',
                    borderRadius: '8px',
                    border: `1.5px solid ${complianceDraft.panNumber ? (validatePANFormat(complianceDraft.panNumber) ? '#10B981' : '#EF4444') : '#CBD5E1'}`,
                    fontSize: '13px',
                    outline: 'none',
                    boxSizing: 'border-box'
                  }}
                />
                {complianceDraft.panNumber && !validatePANFormat(complianceDraft.panNumber) && (
                  <span style={{ fontSize: '11px', color: '#EF4444', marginTop: '4px', display: 'block' }}>
                    Format: 5 letters, 4 digits, 1 letter (e.g. ABCDE1234F)
                  </span>
                )}
              </div>

              {/* CIN / Corp ID */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                  <label style={{ fontSize: '12px', fontWeight: 700, color: '#334155' }}>CIN / Corporate ID</label>
                  <span style={{ fontSize: '10.5px', color: complianceDraft.corpId?.length === 21 ? '#16A34A' : '#94A3B8', fontWeight: 700 }}>
                    {complianceDraft.corpId?.length || 0}/21
                  </span>
                </div>
                <input
                  type="text"
                  maxLength={21}
                  value={complianceDraft.corpId}
                  onChange={e => {
                    const val = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 21);
                    setComplianceDraft(prev => ({ ...prev, corpId: val }));
                    setComplianceDirty(true);
                  }}
                  placeholder="e.g. U85110DL2025PTC384920"
                  style={{
                    width: '100%',
                    padding: '10px 14px',
                    borderRadius: '8px',
                    border: `1.5px solid ${complianceDraft.corpId ? (validateCINFormat(complianceDraft.corpId) ? '#10B981' : '#EF4444') : '#CBD5E1'}`,
                    fontSize: '13px',
                    outline: 'none',
                    boxSizing: 'border-box'
                  }}
                />
              </div>

              {/* Signatory Name */}
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                  Authorized Signatory Name
                </label>
                <input
                  type="text"
                  maxLength={70}
                  value={complianceDraft.signatoryName}
                  onChange={e => {
                    const val = e.target.value.replace(/[^a-zA-Z\s\.\,\'-]/g, '').slice(0, 70);
                    setComplianceDraft(prev => ({ ...prev, signatoryName: val }));
                    setComplianceDirty(true);
                  }}
                  placeholder="Authorized Signatory Name"
                  style={{ width: '100%', padding: '10px 14px', borderRadius: '8px', border: '1.5px solid #CBD5E1', fontSize: '13px', outline: 'none', boxSizing: 'border-box' }}
                />
              </div>

              {/* GSTIN */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                  <label style={{ fontSize: '12px', fontWeight: 700, color: '#334155' }}>GSTIN</label>
                  <span style={{ fontSize: '10.5px', color: complianceDraft.gst?.length === 15 ? '#16A34A' : '#94A3B8', fontWeight: 700 }}>
                    {complianceDraft.gst?.length || 0}/15
                  </span>
                </div>
                <input
                  type="text"
                  maxLength={15}
                  value={complianceDraft.gst}
                  onChange={e => {
                    const val = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 15);
                    setComplianceDraft(prev => ({ ...prev, gst: val }));
                    setComplianceDirty(true);
                  }}
                  placeholder="e.g. 07METRO8827P1ZX"
                  style={{
                    width: '100%',
                    padding: '10px 14px',
                    borderRadius: '8px',
                    border: `1.5px solid ${complianceDraft.gst ? (validateGSTINFormat(complianceDraft.gst) ? '#10B981' : '#EF4444') : '#CBD5E1'}`,
                    fontSize: '13px',
                    outline: 'none',
                    boxSizing: 'border-box'
                  }}
                />
                {hospital.isGstVerified && hospital.gstVerificationDetails && (
                  <div style={{ marginTop: '6px', padding: '6px 10px', background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: '6px', fontSize: '11px', color: '#166534' }}>
                    <strong>✓ Verified GSTIN:</strong> {hospital.gstVerificationDetails.legalName || 'Registered Entity'} ({hospital.gstVerificationDetails.state || 'Active'})
                  </div>
                )}
              </div>

              {/* Drug License */}
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                  Drug License Number
                </label>
                <input
                  type="text"
                  maxLength={30}
                  value={complianceDraft.license}
                  onChange={e => {
                    const val = e.target.value.toUpperCase().replace(/[^A-Z0-9\-\/\s]/g, '').slice(0, 30);
                    setComplianceDraft(prev => ({ ...prev, license: val }));
                    setComplianceDirty(true);
                  }}
                  placeholder="e.g. DL-293849/2026"
                  style={{
                    width: '100%',
                    padding: '10px 14px',
                    borderRadius: '8px',
                    border: `1.5px solid ${complianceDraft.license ? (validateDrugLicenseFormat(complianceDraft.license) ? '#10B981' : '#EF4444') : '#CBD5E1'}`,
                    fontSize: '13px',
                    outline: 'none',
                    boxSizing: 'border-box'
                  }}
                />
                {hospital.isLicenseVerified && hospital.licenseVerificationDetails && (
                  <div style={{ marginTop: '6px', padding: '6px 10px', background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: '6px', fontSize: '11px', color: '#166534' }}>
                    <strong>✓ Verified Drug License:</strong> Valid Until {hospital.licenseVerificationDetails.validUntil}
                  </div>
                )}
              </div>

              {/* Fire Safety */}
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                  Fire Safety Certificate
                </label>
                <input
                  type="text"
                  maxLength={30}
                  value={complianceDraft.fireSafetyCertificate}
                  onChange={e => {
                    const val = e.target.value.toUpperCase().replace(/[^A-Z0-9\-\/\s]/g, '').slice(0, 30);
                    setComplianceDraft(prev => ({ ...prev, fireSafetyCertificate: val }));
                    setComplianceDirty(true);
                  }}
                  placeholder="e.g. FSC-990-2026"
                  style={{ width: '100%', padding: '10px 14px', borderRadius: '8px', border: '1.5px solid #CBD5E1', fontSize: '13px', outline: 'none', boxSizing: 'border-box' }}
                />
              </div>

              {/* Pollution Certificate */}
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                  Pollution Control Certificate
                </label>
                <input
                  type="text"
                  maxLength={30}
                  value={complianceDraft.pollutionCertificate}
                  onChange={e => {
                    const val = e.target.value.toUpperCase().replace(/[^A-Z0-9\-\/\s]/g, '').slice(0, 30);
                    setComplianceDraft(prev => ({ ...prev, pollutionCertificate: val }));
                    setComplianceDirty(true);
                  }}
                  placeholder="e.g. PCB-MED-7491"
                  style={{ width: '100%', padding: '10px 14px', borderRadius: '8px', border: '1.5px solid #CBD5E1', fontSize: '13px', outline: 'none', boxSizing: 'border-box' }}
                />
              </div>
            </div>

            <div style={{ marginTop: '24px', borderTop: '1px solid #F1F5F9', paddingTop: '16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                {complianceDirty && (
                  <span style={{ fontSize: '12px', color: '#EA580C', fontWeight: 650, display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                    <LucideIcon name="alert-circle" style={{ width: '14px', height: '14px' }} />
                    <span>Unsaved changes in legal & compliance details.</span>
                  </span>
                )}
                {complianceSuccess && (
                  <span style={{ fontSize: '12px', color: '#16A34A', fontWeight: 650, display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                    <LucideIcon name="check-circle" style={{ width: '14px', height: '14px' }} />
                    <span>Details saved successfully!</span>
                  </span>
                )}
              </div>

              <button
                type="button"
                disabled={complianceSaving}
                onClick={handleSaveCompliance}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '10px 20px',
                  borderRadius: '8px',
                  fontSize: '13px',
                  fontWeight: 700,
                  background: complianceDirty ? '#2563EB' : '#0F172A',
                  color: '#FFFFFF',
                  border: 'none',
                  cursor: complianceSaving ? 'not-allowed' : 'pointer',
                  boxShadow: complianceDirty ? '0 2px 8px rgba(37, 99, 235, 0.25)' : 'none'
                }}
              >
                {complianceSaving ? (
                  <>
                    <LucideIcon name="loader-2" className="animate-spin" style={{ width: '15px', height: '15px' }} />
                    <span>Saving Details...</span>
                  </>
                ) : (
                  <>
                    <LucideIcon name="save" style={{ width: '15px', height: '15px' }} />
                    <span>Save Legal & Compliance Details</span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {/* SECTION 4: ADMIN CREDENTIALS */}
        {(activeTab === 'admin' || activeTab === 'all') && (
          <div style={{ background: '#FFFFFF', borderRadius: '16px', border: '1px solid #E2E8F0', padding: '24px 28px', boxShadow: '0 2px 10px rgba(0,0,0,0.02)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px', borderBottom: '1px solid #F1F5F9', paddingBottom: '14px' }}>
              <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: '#EFF6FF', color: '#2563EB', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <LucideIcon name="key" style={{ width: '16px', height: '16px' }} />
              </div>
              <div>
                <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 800, color: '#0F172A' }}>Clinic Administrator Credentials</h3>
                <p style={{ margin: '2px 0 0', fontSize: '12px', color: '#64748B' }}>Update hospital administrator login phone/staff ID or rotate master password</p>
              </div>
            </div>

            <div style={{ maxWidth: '850px', width: '100%', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                  Admin Staff ID / Phone (Username)
                </label>
                <input
                  type="text"
                  maxLength={10}
                  value={adminUsername}
                  onChange={e => setAdminUsername(e.target.value.slice(0, 10))}
                  placeholder="Admin Username (10 digits)"
                  style={{ width: '100%', padding: '10px 14px', borderRadius: '8px', border: '1.5px solid #CBD5E1', fontSize: '13px', outline: 'none', boxSizing: 'border-box' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                  New Password
                </label>
                <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={adminPassword}
                    onChange={e => setAdminPassword(e.target.value)}
                    placeholder="Enter new administrator password"
                    style={{ width: '100%', padding: '10px 42px 10px 14px', borderRadius: '8px', border: '1.5px solid #CBD5E1', fontSize: '13px', outline: 'none', boxSizing: 'border-box' }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(p => !p)}
                    style={{
                      position: 'absolute',
                      right: '12px',
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      color: '#64748B',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}
                  >
                    <LucideIcon name={showPassword ? 'eye-off' : 'eye'} style={{ width: '16px', height: '16px' }} />
                  </button>
                </div>
                <span style={{ fontSize: '11px', color: '#94A3B8', marginTop: '4px', display: 'block' }}>
                  Updating password immediately revokes active sessions and increments security version.
                </span>
              </div>

              {credentialsMsg.text && (
                <div style={{
                  padding: '10px 14px',
                  borderRadius: '8px',
                  fontSize: '12px',
                  fontWeight: 650,
                  background: credentialsMsg.type === 'success' ? '#F0FDF4' : credentialsMsg.type === 'error' ? '#FEF2F2' : '#EFF6FF',
                  color: credentialsMsg.type === 'success' ? '#166534' : credentialsMsg.type === 'error' ? '#991B1B' : '#1E40AF',
                  border: `1px solid ${credentialsMsg.type === 'success' ? '#BBF7D0' : credentialsMsg.type === 'error' ? '#FECACA' : '#BFDBFE'}`
                }}>
                  {credentialsMsg.text}
                </div>
              )}

              <button
                type="button"
                disabled={credentialsUpdating}
                onClick={handleUpdateAdminCredentials}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  padding: '10px 20px',
                  borderRadius: '8px',
                  fontSize: '13px',
                  fontWeight: 700,
                  background: '#2563EB',
                  color: '#FFFFFF',
                  border: 'none',
                  cursor: credentialsUpdating ? 'not-allowed' : 'pointer',
                  boxShadow: '0 2px 8px rgba(37, 99, 235, 0.25)',
                  marginTop: '6px'
                }}
              >
                {credentialsUpdating ? (
                  <>
                    <LucideIcon name="loader-2" className="animate-spin" style={{ width: '15px', height: '15px' }} />
                    <span>Updating Credentials...</span>
                  </>
                ) : (
                  <>
                    <LucideIcon name="check" style={{ width: '15px', height: '15px' }} />
                    <span>Update Credentials</span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {/* SECTION 5: ADMINISTRATIVE OPERATIONS & DANGER ZONE */}
        {(activeTab === 'actions' || activeTab === 'all') && (
          <div style={{ background: '#FFFFFF', borderRadius: '16px', border: '1px solid #E2E8F0', padding: '24px 28px', boxShadow: '0 2px 10px rgba(0,0,0,0.02)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px', borderBottom: '1px solid #F1F5F9', paddingBottom: '14px' }}>
              <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: '#EFF6FF', color: '#2563EB', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <LucideIcon name="shield-alert" style={{ width: '16px', height: '16px' }} />
              </div>
              <div>
                <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 800, color: '#0F172A' }}>Administrative Operations</h3>
                <p style={{ margin: '2px 0 0', fontSize: '12px', color: '#64748B' }}>Impersonation, account suspension, and destructive tenant deletion</p>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', maxWidth: '850px', width: '100%' }}>
              {/* Impersonation Card */}
              <div style={{ background: '#F8FAFC', padding: '16px 20px', borderRadius: '12px', border: '1px solid #E2E8F0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <h4 style={{ margin: '0 0 2px', fontSize: '13px', fontWeight: 750, color: '#0F172A' }}>Tenant Portal Impersonation</h4>
                  <p style={{ margin: 0, fontSize: '11.5px', color: '#64748B' }}>Access the clinic portal directly with administrative oversight</p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    if (onImpersonate) {
                      onImpersonate(hospital);
                    } else {
                      localStorage.setItem('curoxa_superadmin_session', JSON.stringify({
                        tenantId: hospital.code,
                        hospitalName: hospital.name,
                        hospitalId: hospital.hospitalId
                      }));
                      showToast(`Impersonating ${hospital.name}...`, 'success');
                    }
                  }}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '8px 16px',
                    borderRadius: '8px',
                    fontSize: '12px',
                    fontWeight: 700,
                    background: '#2563EB',
                    color: '#FFFFFF',
                    border: 'none',
                    cursor: 'pointer'
                  }}
                >
                  <LucideIcon name="shield" style={{ width: '14px', height: '14px' }} />
                  <span>Impersonate</span>
                </button>
              </div>

              {/* Suspension Card */}
              <div style={{ background: '#F8FAFC', padding: '16px 20px', borderRadius: '12px', border: '1px solid #E2E8F0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <h4 style={{ margin: '0 0 2px', fontSize: '13px', fontWeight: 750, color: '#0F172A' }}>
                    {isSuspended ? 'Account is Suspended' : 'Account is Active'}
                  </h4>
                  <p style={{ margin: 0, fontSize: '11.5px', color: '#64748B' }}>
                    {isSuspended ? 'Clinic staff and patients are currently locked out of this portal' : 'Suspend access temporarily without deleting data'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleToggleSuspension}
                  style={{
                    padding: '8px 16px',
                    borderRadius: '8px',
                    fontSize: '12px',
                    fontWeight: 700,
                    background: isSuspended ? '#16A34A' : '#EF4444',
                    color: '#FFFFFF',
                    border: 'none',
                    cursor: 'pointer'
                  }}
                >
                  {isSuspended ? 'Reactivate Clinic' : 'Suspend Clinic'}
                </button>
              </div>

              {/* Danger Zone: Delete Clinic */}
              <div style={{ background: '#FEF2F2', padding: '16px 20px', borderRadius: '12px', border: '1px solid #FECACA', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '10px' }}>
                <div>
                  <h4 style={{ margin: '0 0 2px', fontSize: '13px', fontWeight: 800, color: '#991B1B' }}>Permanently Delete Clinic</h4>
                  <p style={{ margin: 0, fontSize: '11.5px', color: '#B91C1C' }}>Irreversible. Purges all staff, patient records, and clinical logs.</p>
                </div>
                <button
                  type="button"
                  onClick={handleDeleteClinic}
                  style={{
                    padding: '8px 16px',
                    borderRadius: '8px',
                    fontSize: '12px',
                    fontWeight: 700,
                    background: '#DC2626',
                    color: '#FFFFFF',
                    border: 'none',
                    cursor: 'pointer'
                  }}
                >
                  Delete Clinic
                </button>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
