import React, { useState, useEffect, useMemo, useRef } from 'react';
import * as Icons from 'lucide-react';
import { getDepartmentFields, getCategoryConfig } from '../../../config/masterSchemaRegistry';
import { getApiUrl } from '../../../utils/api';

const LucideIcon = ({ name, ...props }) => {
  if (!name) return <Icons.HelpCircle {...props} />;
  const camelName = name
    .split('-')
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join('');
  const IconComponent = Icons[camelName] || Icons.HelpCircle;
  return <IconComponent {...props} />;
};

// Helper to format camelCase / raw headers into clean title-cased labels
function formatLabelDisplay(header) {
  if (!header) return '';
  const trimmed = String(header).trim();
  const known = {
    itemTypeName: 'Item Type Name',
    makeandModelNo: 'Make & Model No.',
    MakeandModelNo: 'Make & Model No.',
    manufactureId: 'Manufacture ID',
    ManufactureID: 'Manufacture ID',
    manufactureName: 'Manufacture Name',
    ManufactureName: 'Manufacture Name',
    machineId: 'Machine ID',
    MachineID: 'Machine ID',
    machineName: 'Machine Name',
    MachineName: 'Machine Name',
    catalogNo: 'Catalog No.',
    CatalogNo: 'Catalog No.',
    purchasedUnit: 'Purchased Unit',
    PurchasedUnit: 'Purchased Unit',
    consumptionUnit: 'Consumption Unit',
    ConsumptionUnit: 'Consumption Unit',
    packSize: 'Pack Size',
    PackSize: 'Pack Size',
    issueMultiplier: 'Issue Multiplier',
    IssueMultiplier: 'Issue Multiplier',
    expiryDateCutoff: 'Expiry Cutoff (Days)',
    ExpiryDateCutoff: 'Expiry Cutoff (Days)',
    gstnTax: 'GST / Tax (%)',
    GSTNTax: 'GST / Tax (%)',
    hsnCode: 'HSN Code',
    HSNCode: 'HSN Code',
    dosageForm: 'Dosage Form',
    sampleType: 'Sample Type',
    sampleOption: 'Sample Option',
    doctorsName: "Doctor's Name",
    doctorId: 'Doctor ID',
    requiredPrescription: 'Prescription Req.',
    itemCode: 'Item Code',
    itemName: 'Item Name',
    genericName: 'Generic Name',
    brandName: 'Brand Name',
    sNo: 'S.No.',
    rackLocation: 'Rack Location',
    imageUrl: 'Image URL',
    usageDetails: 'Usage Details',
    mrp: 'MRP',
    netRate: 'Net Rate',
    status: 'Status',
    expirable: 'Expirable',
    category: 'Category',
    department: 'Department',
    description: 'Description',
    specification: 'Specification',
    gender: 'Gender',
    converter: 'Converter'
  };
  if (known[trimmed]) return known[trimmed];
  return trimmed
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .replace(/_/g, ' ')
    .trim();
}

function getCategoryFallbackCode(cat) {
  const rules = {
    'Lab Operation': { prefix: '99', digits: 9 },
    'Pharmacy': { prefix: '98', digits: 9 },
    'Pathology': { prefix: '95', digits: 8 },
    'Service': { prefix: '94', digits: 9 },
    'Assets': { prefix: '73', digits: 10 }
  };
  const rule = rules[cat];
  if (!rule) {
    const year = new Date().getFullYear();
    const rand = Math.floor(1000 + Math.random() * 9000);
    return `ITM-${year}-${rand}`;
  }
  const seqDigits = rule.digits - rule.prefix.length;
  const seq = (Date.now() % Math.pow(10, seqDigits)).toString().padStart(seqDigits, '0');
  return `${rule.prefix}${seq}`;
}

export default function MasterDynamicForm({
  category,
  department = '',
  initialData = null,
  mode = 'create',
  onSaveSuccess,
  onCancel,
  onDirtyChange
}) {
  const isView = mode === 'view';
  const isEdit = mode === 'edit';
  const isCreate = mode === 'create';

  const catConfig = useMemo(() => getCategoryConfig(category), [category]);
  const departmentList = useMemo(() => {
    if (!catConfig?.hasDepartment) return [];
    return Object.keys(catConfig.departments || {});
  }, [catConfig]);

  // If in create mode and department is not single-concrete, default to first department
  const [formDepartment, setFormDepartment] = useState(() => {
    if (initialData?.department) return initialData.department;
    if (department && department !== 'All Departments' && !department.includes(',')) {
      return department;
    }
    return departmentList[0] || '';
  });

  // Effective department for fields lookup
  const activeDepartment = catConfig?.hasDepartment ? formDepartment : '';

  // Get exact registry fields for category + activeDepartment
  const fields = useMemo(() => {
    return getDepartmentFields(category, activeDepartment);
  }, [category, activeDepartment]);

  const [formData, setFormData] = useState({});
  const [errors, setErrors] = useState({});
  const [loadingCode, setLoadingCode] = useState(false);
  const [saving, setSaving] = useState(false);
  const [serverError, setServerError] = useState('');
  const [isDirty, setIsDirty] = useState(false);

  const initialSnapshot = useRef(null);

  // Initialize form data when category, activeDepartment, or initialData changes
  useEffect(() => {
    let initialValues = {};

    fields.forEach((f) => {
      if (initialData) {
        if (initialData[f.fieldKey] !== undefined && initialData[f.fieldKey] !== null) {
          initialValues[f.fieldKey] = initialData[f.fieldKey];
        } else if (initialData.categoryData && initialData.categoryData[f.fieldKey] !== undefined) {
          initialValues[f.fieldKey] = initialData.categoryData[f.fieldKey];
        } else {
          initialValues[f.fieldKey] = f.defaultValue !== null ? f.defaultValue : '';
        }
      } else {
        if (f.fieldKey === 'category') {
          initialValues['category'] = category;
        } else if (f.fieldKey === 'department') {
          initialValues['department'] = activeDepartment;
        } else if (f.fieldKey === 'status') {
          initialValues['status'] = 'Active';
        } else if (f.fieldKey === 'expirable') {
          initialValues['expirable'] = 'Yes';
        } else if (f.fieldKey === 'converter') {
          initialValues['converter'] = 1;
        } else if (f.fieldKey === 'issueMultiplier') {
          initialValues['issueMultiplier'] = 0;
        } else if (f.fieldKey === 'expiryDateCutoff') {
          initialValues['expiryDateCutoff'] = 0;
        } else if (f.fieldKey === 'gstnTax') {
          initialValues['gstnTax'] = 5;
        } else if (f.defaultValue !== null && f.defaultValue !== undefined) {
          initialValues[f.fieldKey] = f.defaultValue;
        } else {
          initialValues[f.fieldKey] = '';
        }
      }
    });

    initialValues['category'] = category;
    if (catConfig?.hasDepartment) {
      initialValues['department'] = activeDepartment;
    }
    if (!initialValues['status']) {
      initialValues['status'] = 'Active';
    }
    if (isCreate) {
      initialValues['itemCode'] = initialValues['itemCode'] || formData.itemCode || getCategoryFallbackCode(category);
    }

    setFormData(initialValues);
    initialSnapshot.current = JSON.stringify(initialValues);
    setIsDirty(false);
    if (onDirtyChange) onDirtyChange(false);
    setErrors({});
    setServerError('');
  }, [category, activeDepartment, initialData, fields]);

  // Fetch concurrency-safe itemCode in create mode
  useEffect(() => {
    if (isCreate && category) {
      let isMounted = true;
      const fetchNextCode = async () => {
        try {
          setLoadingCode(true);
          const token = localStorage.getItem('token');
          const targetUrl = getApiUrl(`/superadmin/masters/next-code?category=${encodeURIComponent(category)}`);
          const res = await fetch(targetUrl, {
            headers: token ? { Authorization: token.startsWith('Bearer ') ? token : `Bearer ${token}` } : {}
          });
          const contentType = res.headers.get('content-type') || '';
          if (contentType.includes('application/json')) {
            const data = await res.json();
            if (isMounted && data.success && data.nextCode) {
              setFormData((prev) => ({
                ...prev,
                itemCode: data.nextCode
              }));
              return;
            }
          }
        } catch (err) {
          console.warn('[MASTER FORM] Failed to fetch next code:', err.message);
        } finally {
          if (isMounted) setLoadingCode(false);
        }

        // Fallback local code if server response wasn't set
        if (isMounted) {
          setFormData((prev) => {
            if (!prev.itemCode || !String(prev.itemCode).trim()) {
              return { ...prev, itemCode: getCategoryFallbackCode(category) };
            }
            return prev;
          });
        }
      };
      fetchNextCode();
      return () => { isMounted = false; };
    }
  }, [isCreate, category]);

  // Handle department change within form
  const handleDepartmentChange = (newDept) => {
    setFormDepartment(newDept);
    setFormData((prev) => ({
      ...prev,
      department: newDept
    }));
    setIsDirty(true);
    if (onDirtyChange) onDirtyChange(true);
  };

  // Handle individual field value changes
  const handleFieldChange = (fieldKey, value) => {
    if (fieldKey === 'department') {
      handleDepartmentChange(value);
      return;
    }

    setFormData((prev) => {
      const updated = { ...prev, [fieldKey]: value };

      // If expirable changes to 'No', zero out expiryDateCutoff
      if (fieldKey === 'expirable' && (value === 'No' || value === false || value === 'no')) {
        updated.expiryDateCutoff = 0;
      }

      // Sync itemName and genericName if one is typed and the other matches
      if (fieldKey === 'itemName' && (!prev.genericName || prev.genericName === prev.itemName)) {
        updated.genericName = value;
      } else if (fieldKey === 'genericName' && (!prev.itemName || prev.itemName === prev.genericName)) {
        updated.itemName = value;
      }

      const dirty = JSON.stringify(updated) !== initialSnapshot.current;
      setIsDirty(dirty);
      if (onDirtyChange) onDirtyChange(dirty);

      return updated;
    });

    if (errors[fieldKey]) {
      setErrors((prev) => ({ ...prev, [fieldKey]: null }));
    }
  };

  // Reset form to initial snapshot
  const handleReset = () => {
    if (initialSnapshot.current) {
      try {
        const restored = JSON.parse(initialSnapshot.current);
        setFormData(restored);
        setErrors({});
        setServerError('');
        setIsDirty(false);
        if (onDirtyChange) onDirtyChange(false);
      } catch (e) {
        console.error('Failed to reset form data', e);
      }
    }
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // GROUP REGISTRY FIELDS INTO HIGH-INFORMATION DENSE SECTIONS
  // ─────────────────────────────────────────────────────────────────────────────
  const sections = useMemo(() => {
    const generalKeys = ['category', 'department', 'itemTypeName', 'itemCode', 'itemName', 'genericName', 'brandName', 'description', 'specification', 'usageDetails', 'status'];
    const clinicalKeys = ['dosageForm', 'strength', 'sampleType', 'gender', 'sampleOption', 'doctorsName', 'doctorId', 'requiredPrescription'];
    const manufacturingKeys = ['makeandModelNo', 'manufactureId', 'manufactureName', 'catalogNo', 'machineId', 'machineName', 'rackLocation', 'imageUrl'];
    const unitKeys = ['purchasedUnit', 'converter', 'packSize', 'consumptionUnit', 'issueMultiplier'];
    const regulatoryKeys = ['sNo', 'hsnCode', 'gstnTax', 'expirable', 'expiryDateCutoff'];
    const pricingKeys = ['mrp', 'netRate'];

    const getFieldsForKeys = (keys) => fields.filter((f) => keys.includes(f.fieldKey));
    const assignedKeys = [...generalKeys, ...clinicalKeys, ...manufacturingKeys, ...unitKeys, ...regulatoryKeys, ...pricingKeys];
    const otherFields = fields.filter((f) => !assignedKeys.includes(f.fieldKey));

    return [
      { id: 'general', title: 'Item Identity & Classification', icon: 'package', fields: getFieldsForKeys(generalKeys) },
      { id: 'clinical', title: 'Clinical & Specialty Specification', icon: 'stethoscope', fields: getFieldsForKeys(clinicalKeys) },
      { id: 'manufacturing', title: 'Manufacture Detail & Equipment', icon: 'factory', fields: getFieldsForKeys(manufacturingKeys) },
      { id: 'units', title: 'Unit & Packaging Specification', icon: 'boxes', fields: getFieldsForKeys(unitKeys) },
      { id: 'regulatory', title: 'Tax & Regulatory Compliance', icon: 'shield-check', fields: getFieldsForKeys(regulatoryKeys) },
      { id: 'pricing', title: 'Commercial Pricing (Hospital Layer)', icon: 'tag', fields: getFieldsForKeys(pricingKeys) },
      ...(otherFields.length > 0 ? [{ id: 'other', title: 'Additional Item Attributes', icon: 'layers', fields: otherFields }] : [])
    ].filter((s) => s.fields.length > 0);
  }, [fields]);

  // Form Submission
  const handleSubmit = async (e) => {
    if (e) e.preventDefault();
    if (isView) return;

    setServerError('');
    const newErrors = {};

    if (!formData.itemCode || !String(formData.itemCode).trim()) {
      newErrors.itemCode = 'Item Code is required';
    }
    const nameVal = formData.itemName || formData.genericName || formData.brandName || formData.doctorId;
    if (!nameVal || !String(nameVal).trim()) {
      newErrors.itemName = 'Item Name is required';
    }
    if (!category) {
      newErrors.category = 'Category is required';
    }
    if (catConfig?.hasDepartment && (!activeDepartment || !String(activeDepartment).trim())) {
      newErrors.department = 'Department is required';
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      setServerError('Please fill all required fields (marked with red line).');
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    try {
      setSaving(true);
      const token = localStorage.getItem('token');
      const url = getApiUrl(isEdit ? `/superadmin/masters/items/${initialData._id}` : '/superadmin/masters/items');
      const method = isEdit ? 'PUT' : 'POST';

      const payload = {
        category,
        department: catConfig?.hasDepartment ? activeDepartment : '',
        itemName: nameVal,
        genericName: formData.genericName || nameVal,
        brandName: formData.brandName || nameVal,
        itemCode: formData.itemCode,
        categoryData: { ...formData, category, department: catConfig?.hasDepartment ? activeDepartment : '' }
      };

      const res = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify(payload)
      });

      const contentType = res.headers.get('content-type') || '';
      if (!contentType.includes('application/json')) {
        const text = await res.text();
        throw new Error(
          res.status === 404 || text.includes('<!doctype') || text.includes('<html')
            ? `API server returned HTML (Status ${res.status}). Verify backend service availability.`
            : `Server returned non-JSON response (${res.status} ${res.statusText || ''})`
        );
      }

      const result = await res.json();
      if (!res.ok || !result.success) {
        throw new Error(result.error || 'Failed to save master item');
      }

      setIsDirty(false);
      if (onDirtyChange) onDirtyChange(false);
      if (onSaveSuccess) onSaveSuccess(result.data);
    } catch (err) {
      setServerError(err.message);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } finally {
      setSaving(false);
    }
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // RENDER ALIGNED ENTERPRISE FIELD (MATCHING VENDOR MASTER EXACTLY)
  // ─────────────────────────────────────────────────────────────────────────────
  const renderAlignedField = (field, isReadOnly = false, labelWidth = '120px') => {
    const value = formData[field.fieldKey] !== undefined && formData[field.fieldKey] !== null ? formData[field.fieldKey] : '';
    const isRequired = field.systemRequired || field.fieldKey === 'itemCode' || field.fieldKey === 'itemName';
    const isMissingRequired = isRequired && (!value || !value.toString().trim());
    const displayLabel = formatLabelDisplay(field.clientHeader || field.fieldKey);
    const isFieldDisabled = isView || isReadOnly || field.readOnly || (field.fieldKey === 'expiryDateCutoff' && (formData.expirable === 'No' || formData.expirable === false || formData.expirable === 'no'));

    return (
      <div
        key={field.fieldKey}
        style={{
          display: 'grid',
          gridTemplateColumns: `${labelWidth} 10px minmax(0, 1fr)`,
          alignItems: 'center',
          minHeight: '32px',
          width: '100%',
          minWidth: 0,
          boxSizing: 'border-box'
        }}
      >
        {/* Label on the left - fixed width */}
        <label
          htmlFor={field.fieldKey}
          title={field.clientHeader || displayLabel}
          style={{
            fontSize: '11px',
            fontWeight: isRequired ? 700 : 550,
            color: isRequired ? '#0F172A' : '#334155',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            cursor: 'default',
            minWidth: 0,
            lineHeight: '1.2'
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

        {/* Input / Select / Checkbox on the right with guaranteed Red Line */}
        <div style={{ position: 'relative', width: '100%', minWidth: 0, display: 'flex', alignItems: 'center' }}>
          
          {/* Department Selector */}
          {field.fieldKey === 'department' ? (
            catConfig?.hasDepartment && departmentList.length > 0 ? (
              <select
                id="department"
                disabled={isView || isReadOnly}
                value={activeDepartment || ''}
                onChange={e => handleDepartmentChange(e.target.value)}
                style={{
                  width: '100%',
                  height: '30px',
                  boxSizing: 'border-box',
                  padding: '0 24px 0 8px',
                  borderRadius: '4px',
                  border: errors.department ? '1.5px solid #DC2626' : '1px solid #CBD5E1',
                  borderBottom: isRequired ? (isMissingRequired ? '2.5px solid #DC2626' : '2px solid #10B981') : '1px solid #CBD5E1',
                  background: isView ? '#F8FAFC' : '#FFFFFF',
                  fontSize: '11px',
                  color: '#0F172A',
                  outline: 'none',
                  cursor: isView ? 'default' : 'pointer',
                  WebkitAppearance: 'none',
                  MozAppearance: 'none',
                  appearance: 'none',
                  backgroundImage: "url(\"data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%2364748b' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3e%3c/svg%3e\")",
                  backgroundPosition: 'right 6px center',
                  backgroundRepeat: 'no-repeat',
                  backgroundSize: '14px 14px'
                }}
              >
                {departmentList.map(d => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            ) : (
              <input
                id="department"
                type="text"
                disabled={true}
                value={activeDepartment || '—'}
                style={{
                  width: '100%',
                  height: '30px',
                  boxSizing: 'border-box',
                  padding: '0 8px',
                  borderRadius: '4px',
                  border: '1px solid #CBD5E1',
                  background: '#F8FAFC',
                  fontSize: '11px',
                  color: '#64748B'
                }}
              />
            )
          ) : field.fieldKey === 'category' ? (
            <input
              id="category"
              type="text"
              disabled={true}
              value={category || ''}
              style={{
                width: '100%',
                height: '30px',
                boxSizing: 'border-box',
                padding: '0 8px',
                borderRadius: '4px',
                border: '1px solid #CBD5E1',
                background: '#F8FAFC',
                fontSize: '11px',
                color: '#1E293B',
                fontWeight: 650
              }}
            />
          ) : field.fieldKey === 'status' ? (
            <select
              id="status"
              disabled={isView || isReadOnly}
              value={value || 'Active'}
              onChange={e => handleFieldChange('status', e.target.value)}
              style={{
                width: '100%',
                height: '30px',
                boxSizing: 'border-box',
                padding: '0 24px 0 8px',
                borderRadius: '4px',
                border: '1px solid #CBD5E1',
                background: isView ? '#F8FAFC' : '#FFFFFF',
                fontSize: '11px',
                color: '#0F172A',
                outline: 'none',
                cursor: isView ? 'default' : 'pointer',
                WebkitAppearance: 'none',
                appearance: 'none',
                backgroundImage: "url(\"data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%2364748b' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3e%3c/svg%3e\")",
                backgroundPosition: 'right 6px center',
                backgroundRepeat: 'no-repeat',
                backgroundSize: '14px 14px'
              }}
            >
              <option value="Active">Active</option>
              <option value="Inactive">Inactive</option>
            </select>
          ) : field.fieldKey === 'expirable' ? (
            <label style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '7px',
              cursor: isFieldDisabled ? 'not-allowed' : 'pointer',
              height: '30px',
              userSelect: 'none'
            }}>
              <input
                type="checkbox"
                id="expirable"
                checked={value === 'Yes' || value === true || String(value).toLowerCase() === 'yes'}
                disabled={isFieldDisabled}
                onChange={e => handleFieldChange('expirable', e.target.checked ? 'Yes' : 'No')}
                style={{
                  width: '16px',
                  height: '16px',
                  accentColor: '#2563EB',
                  cursor: isFieldDisabled ? 'not-allowed' : 'pointer'
                }}
              />
              <span style={{
                fontSize: '11px',
                fontWeight: 650,
                color: (value === 'Yes' || value === true || String(value).toLowerCase() === 'yes') ? '#1D4ED8' : '#64748B'
              }}>
                {(value === 'Yes' || value === true || String(value).toLowerCase() === 'yes') ? 'Yes (Expirable Item)' : 'No (Non-Expirable)'}
              </span>
            </label>
          ) : field.fieldKey === 'sNo' ? (
            <input
              id="sNo"
              type="text"
              disabled={true}
              value={value || '—'}
              style={{
                width: '100%',
                height: '30px',
                boxSizing: 'border-box',
                padding: '0 8px',
                borderRadius: '4px',
                border: '1px solid #E2E8F0',
                background: '#F8FAFC',
                fontSize: '11px',
                color: '#94A3B8'
              }}
            />
          ) : (field.optionsSource === 'CLIENT_CONFIRMED' && Array.isArray(field.allowedValues) && field.allowedValues.length > 0) || field.inputType === 'select' ? (
            <select
              id={field.fieldKey}
              disabled={isFieldDisabled}
              value={value}
              onChange={e => handleFieldChange(field.fieldKey, e.target.value)}
              style={{
                width: '100%',
                height: '30px',
                boxSizing: 'border-box',
                padding: '0 24px 0 8px',
                borderRadius: '4px',
                border: errors[field.fieldKey] ? '1.5px solid #DC2626' : '1px solid #CBD5E1',
                borderBottom: isRequired ? (isMissingRequired ? '2.5px solid #DC2626' : '2px solid #10B981') : '1px solid #CBD5E1',
                background: isFieldDisabled ? '#F8FAFC' : '#FFFFFF',
                fontSize: '11px',
                color: '#0F172A',
                outline: 'none',
                cursor: isFieldDisabled ? 'default' : 'pointer',
                WebkitAppearance: 'none',
                appearance: 'none',
                backgroundImage: "url(\"data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%2364748b' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3e%3c/svg%3e\")",
                backgroundPosition: 'right 6px center',
                backgroundRepeat: 'no-repeat',
                backgroundSize: '14px 14px'
              }}
            >
              <option value="">-- Select --</option>
              {(field.allowedValues || []).map(opt => (
                <option key={String(opt)} value={opt}>{opt}</option>
              ))}
            </select>
          ) : (
            <input
              id={field.fieldKey}
              type={field.inputType === 'number' ? 'number' : 'text'}
              step={field.inputType === 'number' ? 'any' : undefined}
              disabled={isFieldDisabled || field.fieldKey === 'itemCode'}
              readOnly={field.fieldKey === 'itemCode'}
              placeholder={
                field.fieldKey === 'itemCode' && loadingCode
                  ? 'Generating code...'
                  : field.placeholder || `Enter ${displayLabel}...`
              }
              value={value}
              onChange={e => {
                if (field.fieldKey === 'itemCode') return; // Cannot edit itemCode
                const val = e.target.value;
                handleFieldChange(field.fieldKey, field.inputType === 'number' ? (val === '' ? '' : Number(val)) : val);
              }}
              style={{
                width: '100%',
                height: '30px',
                boxSizing: 'border-box',
                padding: field.fieldKey === 'itemCode' ? '0 100px 0 8px' : '0 8px',
                borderRadius: '4px',
                border: errors[field.fieldKey] ? '1.5px solid #DC2626' : '1px solid #CBD5E1',
                borderBottom: field.fieldKey === 'itemCode'
                  ? '2px solid #10B981'
                  : isRequired 
                    ? (isMissingRequired ? '2.5px solid #DC2626' : '2px solid #10B981') 
                    : '1px solid #CBD5E1',
                background: field.fieldKey === 'itemCode' ? '#F8FAFC' : (isFieldDisabled ? '#F8FAFC' : '#FFFFFF'),
                fontSize: '11px',
                color: '#0F172A',
                outline: 'none',
                cursor: field.fieldKey === 'itemCode' ? 'not-allowed' : (isFieldDisabled ? 'default' : 'text'),
                fontFamily: field.fieldKey === 'itemCode' ? 'monospace' : 'inherit',
                fontWeight: field.fieldKey === 'itemCode' ? 700 : 'normal'
              }}
            />
          )}

          {field.fieldKey === 'itemCode' && (
            <span style={{
              position: 'absolute',
              right: '6px',
              fontSize: '9px',
              fontWeight: 750,
              color: '#047857',
              background: '#ECFDF5',
              border: '1px solid #A7F3D0',
              padding: '1.5px 6px',
              borderRadius: '3px',
              pointerEvents: 'none',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '3px'
            }}>
              <LucideIcon name="lock" size={9} />
              Auto-Generated
            </span>
          )}

          {errors[field.fieldKey] && (
            <span style={{
              position: 'absolute',
              bottom: '-14px',
              left: '2px',
              fontSize: '9px',
              color: '#DC2626',
              fontWeight: 700
            }}>
              {errors[field.fieldKey]}
            </span>
          )}
        </div>
      </div>
    );
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', width: '100%', minWidth: 0, paddingBottom: '90px' }}>
      
      {/* ── 1. MODERN TOP ACTION BAR ── */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        background: '#FFFFFF',
        border: '1px solid #E2E8F0',
        borderRadius: '8px',
        padding: '8px 14px',
        boxShadow: '0 1px 2px rgba(0,0,0,0.02)'
      }}>
        {/* Left: Back button & Form Identity */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <button
            type="button"
            onClick={onCancel}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '5px 12px',
              borderRadius: '5px',
              border: '1px solid #CBD5E1',
              background: '#FFFFFF',
              color: '#334155',
              fontSize: '12px',
              fontWeight: 650,
              cursor: 'pointer',
              transition: 'all 0.15s ease'
            }}
            onMouseEnter={e => e.currentTarget.style.background = '#F8FAFC'}
            onMouseLeave={e => e.currentTarget.style.background = '#FFFFFF'}
          >
            <LucideIcon name="arrow-left" size={13} />
            Catalog
          </button>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '13.5px', fontWeight: 800, color: '#0F172A' }}>
              {isCreate ? 'Add Master Item' : isEdit ? 'Edit Master Item' : 'View Master Item Details'}
            </span>
            <span style={{
              fontSize: '10px',
              fontWeight: 800,
              padding: '2px 7px',
              borderRadius: '4px',
              background: isView ? '#F1F5F9' : (isEdit ? '#FEF3C7' : '#EFF6FF'),
              color: isView ? '#475569' : (isEdit ? '#D97706' : '#2563EB')
            }}>
              {isView ? 'VIEW' : (isEdit ? 'EDIT' : 'ADD')}
            </span>

            {/* Category / Department Tag */}
            <span style={{
              fontSize: '11px',
              fontWeight: 700,
              color: '#0D9488',
              background: '#F0FDFA',
              border: '1px solid #CCFBF1',
              padding: '2px 9px',
              borderRadius: '12px',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '5px'
            }}>
              <LucideIcon name="tag" size={11} color="#0D9488" />
              {category} {activeDepartment ? `· ${activeDepartment}` : ''}
            </span>

            {formData.itemCode && (
              <span style={{
                fontSize: '11px',
                fontWeight: 750,
                color: '#2563EB',
                background: '#EFF6FF',
                border: '1px solid #BFDBFE',
                padding: '2px 8px',
                borderRadius: '12px',
                fontFamily: 'monospace'
              }}>
                #{formData.itemCode}
              </span>
            )}
          </div>
        </div>

        {/* Right: Action Buttons */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button
            type="button"
            onClick={onCancel}
            disabled={saving}
            style={{
              padding: '5px 14px',
              borderRadius: '5px',
              border: '1px solid #CBD5E1',
              background: '#FFFFFF',
              color: '#475569',
              fontSize: '12px',
              fontWeight: 650,
              cursor: 'pointer'
            }}
          >
            {isView ? 'Back' : 'Cancel'}
          </button>
        </div>
      </div>

      {/* ── 2. QUICK SECTION ANCHOR NAV (SINGLE-PAGE FORM) ── */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        overflowX: 'auto',
        padding: '6px 10px',
        background: '#FFFFFF',
        border: '1px solid #E2E8F0',
        borderRadius: '8px',
        boxShadow: '0 1px 2px rgba(0,0,0,0.02)'
      }}>
        <span style={{ fontSize: '10.5px', fontWeight: 800, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.3px', marginRight: '4px', whiteSpace: 'nowrap' }}>
          Form Sections:
        </span>
        {sections.map((s, idx) => (
          <button
            key={s.id}
            type="button"
            onClick={() => {
              const el = document.getElementById(`section-${s.id}`);
              if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '5px',
              padding: '4px 10px',
              borderRadius: '5px',
              border: '1px solid #E2E8F0',
              background: '#F8FAFC',
              color: '#334155',
              fontSize: '11px',
              fontWeight: 650,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              transition: 'all 0.15s ease'
            }}
            onMouseEnter={e => {
              e.currentTarget.style.background = '#EFF6FF';
              e.currentTarget.style.borderColor = '#BFDBFE';
              e.currentTarget.style.color = '#1D4ED8';
            }}
            onMouseLeave={e => {
              e.currentTarget.style.background = '#F8FAFC';
              e.currentTarget.style.borderColor = '#E2E8F0';
              e.currentTarget.style.color = '#334155';
            }}
          >
            <span style={{
              width: '16px',
              height: '16px',
              borderRadius: '50%',
              background: '#2563EB',
              color: '#FFFFFF',
              fontSize: '9.5px',
              fontWeight: 800,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              {idx + 1}
            </span>
            {s.title}
            <span style={{ fontSize: '10px', color: '#94A3B8' }}>({s.fields.length})</span>
          </button>
        ))}
      </div>

      {/* Server / Validation Error Banner */}
      {serverError && (
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
          <span>{serverError}</span>
        </div>
      )}

      {/* ── 3. SINGLE-PAGE CONTINUOUS SECTIONS (ALL FIELDS FULLY RENDERED) ── */}
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {sections.map((section, sIdx) => {
          const sectionRequiredCount = section.fields.filter(f => f.systemRequired || f.fieldKey === 'itemCode' || f.fieldKey === 'itemName').length;

          return (
            <div id={`section-${section.id}`} key={section.id} style={{ display: 'flex', flexDirection: 'column', scrollMarginTop: '80px' }}>
              {/* Dark Blue Header Banner */}
              <div style={{
                background: 'linear-gradient(90deg, #1E3A8A 0%, #2563EB 100%)',
                color: '#FFFFFF',
                padding: '7px 14px',
                borderRadius: '6px 6px 0 0',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                fontSize: '11px',
                fontWeight: 800,
                letterSpacing: '0.4px',
                textTransform: 'uppercase',
                boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
                  <LucideIcon name={section.icon || 'layers'} size={13} style={{ color: '#93C5FD' }} />
                  <span>{sIdx + 1}. {section.title}</span>
                </div>
                <span style={{
                  fontSize: '9.5px',
                  fontWeight: 700,
                  background: 'rgba(255, 255, 255, 0.16)',
                  border: '1px solid rgba(255, 255, 255, 0.25)',
                  padding: '1px 8px',
                  borderRadius: '10px',
                  letterSpacing: '0.2px',
                  textTransform: 'none'
                }}>
                  {section.fields.length} {section.fields.length === 1 ? 'FIELD' : 'FIELDS'} {sectionRequiredCount > 0 ? `· ${sectionRequiredCount} REQUIRED` : ''}
                </span>
              </div>

              {/* Card Body - 3 Column Aligned Grid */}
              <div style={{
                background: '#FFFFFF',
                border: '1px solid #E2E8F0',
                borderTop: 'none',
                borderRadius: '0 0 6px 6px',
                padding: '12px 14px',
                display: 'grid',
                gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
                columnGap: '20px',
                rowGap: '12px',
                boxShadow: '0 1px 2px rgba(0,0,0,0.02)'
              }}>
                {section.fields.map(f => renderAlignedField(f, isView, '120px'))}
              </div>
            </div>
          );
        })}

        {/* ── 4. BOTTOM ACTION BAR (SINGLE-PAGE FORM) ── */}
        <div id="form-actions-bottom" style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: '#FFFFFF',
          border: '1px solid #CBD5E1',
          borderRadius: '8px',
          padding: '12px 18px',
          marginTop: '12px',
          marginBottom: '24px',
          boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
          flexShrink: 0
        }}>
          {/* Left: Summary */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '12px', color: '#475569' }}>
            <span style={{ fontWeight: 700, color: '#0F172A', display: 'flex', alignItems: 'center', gap: '5px' }}>
              <LucideIcon name="check-circle-2" size={14} color="#2563EB" />
              All Sections ({fields.length} Fields)
            </span>
            {(!formData.itemName?.toString().trim()) ? (
              <span style={{ color: '#DC2626', fontSize: '11px', fontWeight: 750, background: '#FEE2E2', padding: '2px 8px', borderRadius: '4px' }}>
                * Item Name required (marked with red line)
              </span>
            ) : (
              <span style={{ color: '#15803D', fontSize: '11px', fontWeight: 750, background: '#DCFCE7', padding: '2px 8px', borderRadius: '4px' }}>
                ✓ All mandatory fields complete
              </span>
            )}
          </div>

          {/* Right: Actions */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              type="button"
              onClick={onCancel}
              disabled={saving}
              style={{
                padding: '6px 14px',
                borderRadius: '5px',
                border: '1px solid #CBD5E1',
                background: '#FFFFFF',
                color: '#475569',
                fontSize: '12px',
                fontWeight: 650,
                cursor: 'pointer'
              }}
            >
              Cancel
            </button>

            {!isView && (
              <button
                type="button"
                onClick={handleReset}
                disabled={saving}
                style={{
                  padding: '6px 14px',
                  borderRadius: '5px',
                  border: '1px solid #CBD5E1',
                  background: '#FFFFFF',
                  color: '#64748B',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                Reset
              </button>
            )}

            {!isView && (
              <button
                type="button"
                disabled={saving}
                onClick={handleSubmit}
                style={{
                  padding: '7px 24px',
                  borderRadius: '6px',
                  border: 'none',
                  background: 'linear-gradient(135deg, #2563EB 0%, #1D4ED8 100%)',
                  color: '#FFFFFF',
                  fontSize: '12.5px',
                  fontWeight: 800,
                  cursor: saving ? 'not-allowed' : 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '7px',
                  boxShadow: '0 2px 4px rgba(37,99,235,0.35)',
                  transition: 'all 0.15s ease'
                }}
              >
                {saving && <LucideIcon name="loader-2" size={14} style={{ animation: 'spin 1s linear infinite' }} />}
                {!saving && <LucideIcon name="save" size={14} />}
                {saving ? 'Saving...' : (isEdit ? 'Update Item' : 'Save Item')}
              </button>
            )}
          </div>
        </div>

      </form>
    </div>
  );
}
