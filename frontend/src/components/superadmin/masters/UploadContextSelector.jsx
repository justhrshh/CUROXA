import React, { useMemo } from 'react';
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

export default function UploadContextSelector({
  hospitals = [],
  selectedHospital = '',
  onChangeHospital,
  selectedCategory = '',
  onChangeCategory,
  selectedDepartment = '',
  onChangeDepartment,
  onDownloadTemplate,
  downloadingTemplate = false
}) {
  const categories = useMemo(() => getAllCategories(), []);

  const currentCatConfig = useMemo(() => {
    return selectedCategory ? getCategoryConfig(selectedCategory) : null;
  }, [selectedCategory]);

  const departments = useMemo(() => {
    if (!currentCatConfig || !currentCatConfig.hasDepartment) return [];
    return Object.keys(currentCatConfig.departments || {});
  }, [currentCatConfig]);

  const isTemplateReady = Boolean(
    selectedHospital &&
    selectedCategory &&
    selectedCategory !== 'Radiology'
  );

  return (
    <div style={{
      background: '#FFFFFF',
      borderRadius: '12px',
      border: '1px solid #E2E8F0',
      padding: '16px 20px',
      boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
      display: 'flex',
      flexDirection: 'column',
      gap: '14px'
    }}>
      {/* Header and Step Indicators */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{
            width: '28px',
            height: '28px',
            borderRadius: '6px',
            background: '#EFF6FF',
            color: '#2563EB',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            <LucideIcon name="sliders" size={15} />
          </div>
          <div>
            <h4 style={{ fontSize: '13px', fontWeight: 800, color: '#0F172A', margin: 0 }}>
              Clinic Master Ingestion Context
            </h4>
            <p style={{ fontSize: '11px', color: '#64748B', margin: 0 }}>
              Select target clinic, category, and department to bind upload and download exact template.
            </p>
          </div>
        </div>

        {/* Download Template Action */}
        <button
          type="button"
          onClick={onDownloadTemplate}
          disabled={!isTemplateReady || downloadingTemplate}
          title={!isTemplateReady ? 'Please select Clinic, Category, and Department first' : 'Download clean verified template'}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '6px 14px',
            borderRadius: '6px',
            border: isTemplateReady ? '1px solid #2563EB' : '1px solid #E2E8F0',
            background: isTemplateReady ? '#EFF6FF' : '#F8FAFC',
            color: isTemplateReady ? '#1D4ED8' : '#94A3B8',
            fontWeight: 700,
            fontSize: '12px',
            cursor: isTemplateReady && !downloadingTemplate ? 'pointer' : 'not-allowed',
            transition: 'all 0.15s ease'
          }}
        >
          {downloadingTemplate ? (
            <LucideIcon name="loader-2" size={14} className="animate-spin" />
          ) : (
            <LucideIcon name="download" size={14} />
          )}
          Download Excel Template
        </button>
      </div>

      {/* 3-Step Dropdown Grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
        gap: '12px',
        background: '#F8FAFC',
        padding: '12px',
        borderRadius: '8px',
        border: '1px solid #F1F5F9'
      }}>
        {/* STEP 1: Target Clinic */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <label style={{ fontSize: '11px', fontWeight: 800, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.4px', display: 'flex', alignItems: 'center', gap: '5px' }}>
            <span style={{ width: '16px', height: '16px', borderRadius: '50%', background: '#2563EB', color: '#FFFFFF', fontSize: '10px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800 }}>1</span>
            Target Clinic:
          </label>
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
            <select
              value={selectedHospital}
              onChange={(e) => onChangeHospital(e.target.value)}
              style={{
                width: '100%',
                height: '34px',
                padding: '0 28px 0 10px',
                borderRadius: '6px',
                border: selectedHospital ? '1.5px solid #2563EB' : '1px solid #CBD5E1',
                fontSize: '12.5px',
                fontWeight: 700,
                color: selectedHospital ? '#0F172A' : '#64748B',
                background: '#FFFFFF',
                cursor: 'pointer',
                outline: 'none',
                appearance: 'none',
                WebkitAppearance: 'none'
              }}
            >
              <option value="">-- Select Clinic ▼ --</option>
              {hospitals.map(h => (
                <option key={h.code || h.hospitalId} value={h.code || h.hospitalId}>
                  {h.name} ({h.code || h.hospitalId})
                </option>
              ))}
            </select>
            <span style={{ position: 'absolute', right: '10px', pointerEvents: 'none', color: '#64748B', display: 'flex' }}>
              <LucideIcon name="chevron-down" size={14} />
            </span>
          </div>
        </div>

        {/* STEP 2: Category */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <label style={{ fontSize: '11px', fontWeight: 800, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.4px', display: 'flex', alignItems: 'center', gap: '5px' }}>
            <span style={{ width: '16px', height: '16px', borderRadius: '50%', background: selectedHospital ? '#2563EB' : '#94A3B8', color: '#FFFFFF', fontSize: '10px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800 }}>2</span>
            Category:
          </label>
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
            <select
              value={selectedCategory}
              disabled={!selectedHospital}
              onChange={(e) => onChangeCategory(e.target.value)}
              style={{
                width: '100%',
                height: '34px',
                padding: '0 28px 0 10px',
                borderRadius: '6px',
                border: selectedCategory ? '1.5px solid #2563EB' : '1px solid #CBD5E1',
                fontSize: '12.5px',
                fontWeight: 700,
                color: !selectedHospital ? '#94A3B8' : selectedCategory ? '#0F172A' : '#64748B',
                background: !selectedHospital ? '#F1F5F9' : '#FFFFFF',
                cursor: !selectedHospital ? 'not-allowed' : 'pointer',
                outline: 'none',
                appearance: 'none',
                WebkitAppearance: 'none'
              }}
            >
              <option value="">-- Select Category ▼ --</option>
              {categories.map(cat => {
                const isBlocked = cat.name === 'Radiology' || cat.status === 'SOURCE-CONFIRMATION-REQUIRED';
                const deptCount = (cat.departments || []).length;
                const suffix = isBlocked
                  ? ' (Pending Confirmation - Blocked)'
                  : cat.hasDepartment
                  ? ` (${deptCount} Depts • ${cat.fieldCount}f)`
                  : ` (${cat.fieldCount}f)`;
                return (
                  <option key={cat.name} value={cat.name} disabled={isBlocked}>
                    {cat.name}{suffix}
                  </option>
                );
              })}
            </select>
            <span style={{ position: 'absolute', right: '10px', pointerEvents: 'none', color: '#64748B', display: 'flex' }}>
              <LucideIcon name="chevron-down" size={14} />
            </span>
          </div>
        </div>

        {/* STEP 3: Department */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <label style={{ fontSize: '11px', fontWeight: 800, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.4px', display: 'flex', alignItems: 'center', gap: '5px' }}>
            <span style={{ width: '16px', height: '16px', borderRadius: '50%', background: selectedCategory && currentCatConfig?.hasDepartment ? '#2563EB' : '#94A3B8', color: '#FFFFFF', fontSize: '10px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800 }}>3</span>
            Department:
          </label>
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
            <select
              value={selectedDepartment}
              disabled={!selectedCategory || !currentCatConfig?.hasDepartment || selectedCategory === 'Radiology'}
              onChange={(e) => onChangeDepartment(e.target.value)}
              style={{
                width: '100%',
                height: '34px',
                padding: '0 28px 0 10px',
                borderRadius: '6px',
                border: selectedDepartment ? '1.5px solid #0D9488' : '1px solid #CBD5E1',
                fontSize: '12.5px',
                fontWeight: 650,
                color: !selectedCategory || !currentCatConfig?.hasDepartment ? '#94A3B8' : selectedDepartment ? '#0F172A' : '#64748B',
                background: !selectedCategory || !currentCatConfig?.hasDepartment ? '#F1F5F9' : '#FFFFFF',
                cursor: !selectedCategory || !currentCatConfig?.hasDepartment ? 'not-allowed' : 'pointer',
                outline: 'none',
                appearance: 'none',
                WebkitAppearance: 'none'
              }}
            >
              {selectedCategory === 'Assets' ? (
                <option value="">No Department (15 Standard Columns)</option>
              ) : selectedCategory === 'Radiology' ? (
                <option value="">Upload Blocked (Pending Specification)</option>
              ) : !selectedCategory ? (
                <option value="">-- Select Category First --</option>
              ) : (
                <>
                  <option value="">All Departments (Category-wide Upload)</option>
                  {departments.map(dept => (
                    <option key={dept} value={dept}>
                      {dept}
                    </option>
                  ))}
                </>
              )}
            </select>
            <span style={{ position: 'absolute', right: '10px', pointerEvents: 'none', color: '#64748B', display: 'flex' }}>
              <LucideIcon name="chevron-down" size={14} />
            </span>
          </div>
        </div>
      </div>

      {/* Context Verification Strip */}
      {selectedHospital && selectedCategory && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          fontSize: '11.5px',
          padding: '6px 10px',
          borderRadius: '6px',
          background: '#F0FDFA',
          border: '1px solid #CCFBF1',
          color: '#0F766E'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <LucideIcon name="check-circle" size={13} color="#0D9488" />
            <span>Target Binding:</span>
            <strong style={{ color: '#134E4A' }}>
              {hospitals.find(h => (h.code || h.hospitalId) === selectedHospital)?.name || selectedHospital}
            </strong>
            <span>&rsaquo;</span>
            <strong style={{ color: '#134E4A' }}>{selectedCategory}</strong>
            {selectedDepartment && (
              <>
                <span>&rsaquo;</span>
                <strong style={{ color: '#134E4A' }}>{selectedDepartment}</strong>
              </>
            )}
          </div>
          <span style={{ fontSize: '10.5px', color: '#0D9488', fontWeight: 600 }}>
            {currentCatConfig?.sharedFields?.length || 0} columns expected
          </span>
        </div>
      )}
    </div>
  );
}
