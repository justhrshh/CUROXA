import React, { useState, useEffect, useMemo, useRef } from 'react';
import * as Icons from 'lucide-react';
import FieldRenderer from './FieldRenderer';
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

const SECTION_ICONS = {
  general: 'package',
  clinical: 'stethoscope',
  manufacturing: 'factory',
  units: 'boxes',
  regulatory: 'shield-check',
  pricing: 'tag',
  other: 'layers'
};

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
      // Priority 1: initialData (from edit/view)
      if (initialData) {
        if (initialData[f.fieldKey] !== undefined && initialData[f.fieldKey] !== null) {
          initialValues[f.fieldKey] = initialData[f.fieldKey];
        } else if (initialData.categoryData && initialData.categoryData[f.fieldKey] !== undefined) {
          initialValues[f.fieldKey] = initialData.categoryData[f.fieldKey];
        } else {
          initialValues[f.fieldKey] = f.defaultValue !== null ? f.defaultValue : '';
        }
      } else {
        // Priority 2: defaults from registry
        if (f.fieldKey === 'category') {
          initialValues['category'] = category;
        } else if (f.fieldKey === 'department') {
          initialValues['department'] = activeDepartment;
        } else if (f.defaultValue !== null && f.defaultValue !== undefined) {
          initialValues[f.fieldKey] = f.defaultValue;
        } else {
          initialValues[f.fieldKey] = '';
        }
      }
    });

    // Ensure category and department are explicitly set
    initialValues['category'] = category;
    if (catConfig?.hasDepartment) {
      initialValues['department'] = activeDepartment;
    }

    setFormData(initialValues);
    initialSnapshot.current = JSON.stringify(initialValues);
    setIsDirty(false);
    if (onDirtyChange) onDirtyChange(false);
    setErrors({});
    setServerError('');
  }, [category, activeDepartment, initialData, fields]);

  // Fetch concurrency-safe itemCode in create mode if empty
  useEffect(() => {
    if (isCreate && category && !formData.itemCode && !loadingCode) {
      let isMounted = true;
      const fetchNextCode = async () => {
        try {
          setLoadingCode(true);
          const targetUrl = getApiUrl(`/superadmin/masters/next-code?category=${encodeURIComponent(category)}`);
          const res = await fetch(targetUrl, {
            headers: token ? { Authorization: `Bearer ${token}` } : {}
          });
          const contentType = res.headers.get('content-type') || '';
          if (!contentType.includes('application/json')) {
            throw new Error(`Non-JSON response (Status ${res.status})`);
          }
          const data = await res.json();
          if (isMounted && data.success && data.nextCode) {
            setFormData((prev) => ({
              ...prev,
              itemCode: data.nextCode
            }));
          }
        } catch (err) {
          console.warn('[MASTER FORM] Failed to fetch next code:', err.message);
        } finally {
          if (isMounted) setLoadingCode(false);
        }
      };
      fetchNextCode();
      return () => { isMounted = false; };
    }
  }, [isCreate, category, formData.itemCode]);

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

      // If expirable changes to 'No', reset/zero out expiryDateCutoff
      if (fieldKey === 'expirable' && (value === 'No' || value === false || value === 'no')) {
        updated.expiryDateCutoff = 0;
      }

      // Keep itemName and genericName synced if user types into either
      if (fieldKey === 'itemName' && (!prev.genericName || prev.genericName === prev.itemName)) {
        updated.genericName = value;
      } else if (fieldKey === 'genericName' && (!prev.itemName || prev.itemName === prev.genericName)) {
        updated.itemName = value;
      }

      // Check dirty state
      const dirty = JSON.stringify(updated) !== initialSnapshot.current;
      setIsDirty(dirty);
      if (onDirtyChange) onDirtyChange(dirty);

      return updated;
    });

    if (errors[fieldKey]) {
      setErrors((prev) => ({ ...prev, [fieldKey]: null }));
    }
  };

  // Reset form to initial state
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

  // Group fields into structured compact sections
  const sections = useMemo(() => {
    const generalKeys = ['category', 'department', 'itemTypeName', 'itemCode', 'itemName', 'genericName', 'brandName', 'description', 'specification', 'usageDetails', 'status'];
    const clinicalKeys = ['dosageForm', 'strength', 'sampleType', 'gender', 'sampleOption', 'doctorsName', 'doctorId', 'requiredPrescription'];
    const manufacturingKeys = ['manufactureId', 'manufactureName', 'catalogNo', 'machineId', 'machineName', 'makeandModelNo', 'rackLocation', 'imageUrl'];
    const unitKeys = ['purchasedUnit', 'converter', 'packSize', 'consumptionUnit', 'issueMultiplier'];
    const regulatoryKeys = ['hsnCode', 'gstnTax', 'expirable', 'expiryDateCutoff', 'sNo'];
    const pricingKeys = ['mrp', 'netRate'];

    const getFieldsForKeys = (keys) => fields.filter((f) => keys.includes(f.fieldKey));
    const assignedKeys = [...generalKeys, ...clinicalKeys, ...manufacturingKeys, ...unitKeys, ...regulatoryKeys, ...pricingKeys];
    const otherFields = fields.filter((f) => !assignedKeys.includes(f.fieldKey));

    return [
      { id: 'general', title: 'Item Detail', fields: getFieldsForKeys(generalKeys) },
      { id: 'clinical', title: 'Clinical & Specialty Detail', fields: getFieldsForKeys(clinicalKeys) },
      { id: 'manufacturing', title: 'Manufacture Detail', fields: getFieldsForKeys(manufacturingKeys) },
      { id: 'units', title: 'Unit & Packaging Detail', fields: getFieldsForKeys(unitKeys) },
      { id: 'regulatory', title: 'Tax & Regulatory Detail', fields: getFieldsForKeys(regulatoryKeys) },
      { id: 'pricing', title: 'Commercial Pricing (Hospital Layer)', fields: getFieldsForKeys(pricingKeys) },
      ...(otherFields.length > 0 ? [{ id: 'other', title: 'Additional Item Attributes', fields: otherFields }] : [])
    ].filter((s) => s.fields.length > 0);
  }, [fields]);

  // Form Submission
  const handleSubmit = async (e) => {
    if (e) e.preventDefault();
    if (isView) return;

    setServerError('');
    const newErrors = {};

    // Validate system-required identity keys
    if (!formData.itemCode || !String(formData.itemCode).trim()) {
      newErrors.itemCode = 'Item Code is required';
    }
    const nameVal = formData.itemName || formData.genericName || formData.brandName || formData.doctorId;
    if (!nameVal || !String(nameVal).trim()) {
      newErrors.itemName = 'Item Name / Procedure is required';
    }
    if (!category) {
      newErrors.category = 'Category is required';
    }
    if (catConfig?.hasDepartment && (!activeDepartment || !String(activeDepartment).trim())) {
      newErrors.department = 'Department is required';
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      setServerError('Please resolve the required fields before saving.');
      return;
    }

    try {
      setSaving(true);
      const token = localStorage.getItem('token');
      const url = getApiUrl(isEdit ? `/superadmin/masters/items/${initialData._id}` : '/superadmin/masters/items');
      const method = isEdit ? 'PUT' : 'POST';

      // Split payload into canonical top-level fields vs categoryData
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
        throw new Error(result.error || 'Failed to save master record');
      }

      setIsDirty(false);
      if (onDirtyChange) onDirtyChange(false);
      if (onSaveSuccess) onSaveSuccess(result.data);
    } catch (err) {
      setServerError(err.message);
    } finally {
      setSaving(false);
    }
  };

  // Determine if a field should span full width
  const isFullWidthField = (fieldKey) => {
    return ['description', 'specification', 'usageDetails', 'makeandModelNo'].includes(fieldKey);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', width: '100%', minWidth: 0 }}>
      {/* ── 1. COMPACT FORM HEADER (Only One Header on Page) ── */}
      <div style={{
        background: 'linear-gradient(180deg, #FFFFFF 0%, #F8FAFC 100%)',
        border: '1px solid #E2E8F0',
        borderRadius: '6px',
        padding: '5px 12px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '10px',
        boxShadow: '0 1px 3px rgba(15,23,42,0.03)'
      }}>
        {/* Left: Mode Title + Scope */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            background: isCreate ? '#EFF6FF' : isEdit ? '#FFFBEB' : '#F1F5F9',
            border: isCreate ? '1px solid #DBEAFE' : isEdit ? '1px solid #FDE68A' : '1px solid #E2E8F0',
            padding: '2px 8px',
            borderRadius: '12px'
          }}>
            <LucideIcon name={isCreate ? "plus-circle" : isEdit ? "edit-3" : "eye"} size={13} style={{ color: isCreate ? '#2563EB' : isEdit ? '#D97706' : '#475569' }} />
            <span style={{
              fontSize: '12px',
              fontWeight: 800,
              color: isCreate ? '#1E40AF' : isEdit ? '#B45309' : '#0F172A'
            }}>
              {isCreate ? 'Add Master Item' : isEdit ? 'Edit Master Item' : 'View Master Item'}
            </span>
          </div>

          <span style={{ color: '#CBD5E1' }}>|</span>

          <span style={{
            background: '#F1F5F9',
            border: '1px solid #E2E8F0',
            padding: '2px 8px',
            borderRadius: '12px',
            fontSize: '11px',
            color: '#334155',
            fontWeight: 700
          }}>
            {category} {catConfig?.hasDepartment && activeDepartment ? `· ${activeDepartment}` : ''}
          </span>

          {formData.itemCode && (
            <span style={{
              fontSize: '11px',
              fontFamily: 'monospace',
              fontWeight: 750,
              color: '#0369A1',
              background: '#F0F9FF',
              border: '1px solid #BAE6FD',
              padding: '2px 8px',
              borderRadius: '12px',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px'
            }}>
              <LucideIcon name="tag" size={10} style={{ color: '#0284C7' }} />
              {formData.itemCode}
            </span>
          )}
        </div>

        {/* Right: Quick Action Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <button
            type="button"
            onClick={onCancel}
            disabled={saving}
            style={{
              padding: '3px 12px',
              borderRadius: '5px',
              border: '1px solid #CBD5E1',
              background: '#FFFFFF',
              color: '#475569',
              fontSize: '11.5px',
              fontWeight: 700,
              cursor: 'pointer',
              transition: 'all 0.15s ease'
            }}
          >
            {isView ? 'Close' : 'Cancel'}
          </button>
          {!isView && (
            <button
              type="button"
              onClick={handleSubmit}
              disabled={saving}
              style={{
                padding: '3px 14px',
                borderRadius: '5px',
                border: 'none',
                background: 'linear-gradient(135deg, #2563EB 0%, #1D4ED8 100%)',
                color: '#FFFFFF',
                fontSize: '11.5px',
                fontWeight: 700,
                cursor: saving ? 'wait' : 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
                boxShadow: '0 1px 3px rgba(37,99,235,0.25)',
                transition: 'all 0.15s ease'
              }}
            >
              <LucideIcon name="save" size={12} />
              {saving ? 'Saving...' : isEdit ? 'Update Item' : 'Save Item'}
            </button>
          )}
        </div>
      </div>

      {/* Server Error Alert */}
      {serverError && (
        <div style={{
          background: '#FEF2F2',
          border: '1px solid #FCA5A5',
          borderRadius: '5px',
          padding: '5px 10px',
          color: '#B91C1C',
          fontSize: '11.5px',
          fontWeight: 600
        }}>
          ⚠ {serverError}
        </div>
      )}

      {/* ── 2. DENSE HIGH-INFORMATION FORM SECTIONS ── */}
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '0' }}>
        {sections.map((section) => (
          <div key={section.id} style={{ marginBottom: '4px' }}>
            {/* Compact Blue Section Banner (Inspired by Store Item Master Reference) */}
            <div style={{
              background: 'linear-gradient(90deg, #1E293B 0%, #1E3A8A 55%, #2563EB 100%)',
              color: '#FFFFFF',
              padding: '2.5px 10px',
              borderRadius: '5px 5px 0 0',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              fontSize: '11px',
              fontWeight: 750,
              letterSpacing: '0.4px',
              textTransform: 'uppercase',
              lineHeight: 1.2
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <LucideIcon name={SECTION_ICONS[section.id] || 'layers'} size={12} style={{ color: '#93C5FD' }} />
                <span>{section.title}</span>
              </div>
              <span style={{
                fontSize: '9.5px',
                fontWeight: 700,
                background: 'rgba(255, 255, 255, 0.16)',
                border: '1px solid rgba(255, 255, 255, 0.25)',
                padding: '1px 7px',
                borderRadius: '10px',
                letterSpacing: '0.2px',
                textTransform: 'none'
              }}>
                {section.fields.length} {section.fields.length === 1 ? 'field' : 'fields'}
              </span>
            </div>

            {/* Dense Section Body */}
            <div style={{
              background: '#FFFFFF',
              border: '1px solid #E2E8F0',
              borderTop: 'none',
              borderRadius: '0 0 5px 5px',
              padding: '5px 10px',
              boxShadow: '0 1px 2px rgba(15,23,42,0.02)',
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))',
              gap: '4px 14px'
            }}>
              {section.fields.map((f) => {
                const fullWidth = isFullWidthField(f.fieldKey);
                  const isExpirableNo = formData.expirable === 'No' || formData.expirable === false || formData.expirable === 'no';
                  const isFieldDisabled = isView || (f.fieldKey === 'expiryDateCutoff' && isExpirableNo);

                  return (
                    <div
                      key={f.fieldKey}
                      style={{
                        gridColumn: fullWidth ? '1 / -1' : 'auto',
                        minWidth: 0
                      }}
                    >
                      <FieldRenderer
                        field={f}
                        value={formData[f.fieldKey]}
                        onChange={handleFieldChange}
                        disabled={isFieldDisabled}
                        error={errors[f.fieldKey]}
                        layout="horizontal"
                        labelWidth="125px"
                        departmentList={f.fieldKey === 'department' ? departmentList : []}
                      />
                    </div>
                  );
              })}
            </div>
          </div>
        ))}

        {/* ── 3. COMPACT BOTTOM ACTION ROW (Reset / Cancel / Save) ── */}
        <div style={{
          position: 'sticky',
          bottom: 0,
          background: 'linear-gradient(180deg, rgba(255,255,255,0.95) 0%, #FFFFFF 100%)',
          backdropFilter: 'blur(6px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '10px',
          marginTop: '6px',
          padding: '8px 0 10px 0',
          borderTop: '1px solid #E2E8F0',
          boxShadow: '0 -2px 8px rgba(0, 0, 0, 0.05)',
          zIndex: 20
        }}>
          {!isView && (
            <button
              type="button"
              onClick={handleReset}
              disabled={saving}
              style={{
                padding: '3px 14px',
                borderRadius: '5px',
                border: '1px solid #CBD5E1',
                background: '#F8FAFC',
                color: '#475569',
                fontSize: '11.5px',
                fontWeight: 700,
                cursor: 'pointer',
                transition: 'all 0.15s ease'
              }}
            >
              Reset
            </button>
          )}
          <button
            type="button"
            onClick={onCancel}
            disabled={saving}
            style={{
              padding: '3px 14px',
              borderRadius: '5px',
              border: '1px solid #CBD5E1',
              background: '#FFFFFF',
              color: '#475569',
              fontSize: '11.5px',
              fontWeight: 700,
              cursor: 'pointer',
              transition: 'all 0.15s ease'
            }}
          >
            {isView ? 'Back to Catalog' : 'Cancel'}
          </button>
          {!isView && (
            <button
              type="submit"
              disabled={saving}
              style={{
                padding: '3px 18px',
                borderRadius: '5px',
                border: 'none',
                background: 'linear-gradient(135deg, #2563EB 0%, #1D4ED8 100%)',
                color: '#FFFFFF',
                fontSize: '11.5px',
                fontWeight: 700,
                cursor: saving ? 'wait' : 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
                boxShadow: '0 1px 3px rgba(37,99,235,0.25)'
              }}
            >
              <LucideIcon name="save" size={13} />
              {saving ? 'Saving...' : isEdit ? 'Update Master Item' : 'Save Master Item'}
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
