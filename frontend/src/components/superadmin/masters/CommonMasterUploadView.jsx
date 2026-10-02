import React, { useState } from 'react';
import * as Icons from 'lucide-react';
import HospitalMasterUploadView from './HospitalMasterUploadView';

const LucideIcon = ({ name, ...props }) => {
  if (!name) return <Icons.HelpCircle {...props} />;
  const camelName = name
    .split('-')
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join('');
  const IconComponent = Icons[camelName] || Icons.HelpCircle;
  return <IconComponent {...props} />;
};

export default function CommonMasterUploadView({ onSwitchTab }) {
  // Master Type selection: 'item-master' (active) | 'vendor-master' (coming soon) | 'stock-master' (coming soon)
  const [selectedMasterType, setSelectedMasterType] = useState('item-master');

  const MASTER_TYPES = [
    { id: 'item-master', label: 'Item Master', icon: 'package', active: true, tag: 'Active' },
    { id: 'vendor-master', label: 'Vendor Master', icon: 'truck', active: false, tag: 'Coming Soon' },
    { id: 'stock-master', label: 'Stock Master', icon: 'boxes', active: false, tag: 'Coming Soon' }
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', width: '100%', minWidth: 0, paddingBottom: '40px' }}>
      {/* ── TOP HEADER & MASTER TYPE SELECTOR ── */}
      <div style={{
        background: '#FFFFFF',
        borderRadius: '10px',
        border: '1px solid #E2E8F0',
        padding: '12px 18px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '12px',
        boxShadow: '0 1px 2px rgba(0,0,0,0.02)'
      }}>
        {/* Title & Context */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{
            width: '34px',
            height: '34px',
            borderRadius: '8px',
            background: '#EFF6FF',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#2563EB',
            flexShrink: 0
          }}>
            <LucideIcon name="upload-cloud" size={18} />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <h2 style={{ fontSize: '16px', fontWeight: 800, color: '#0F172A', margin: 0, letterSpacing: '-0.3px', lineHeight: 1.2 }}>
                Common Master Upload Center
              </h2>
              <span style={{ fontSize: '10.5px', fontWeight: 800, color: '#2563EB', background: '#DBEAFE', padding: '2px 7px', borderRadius: '5px' }}>
                Batch Ingestion
              </span>
            </div>
            <p style={{ fontSize: '11.5px', color: '#64748B', margin: 0, lineHeight: 1.3 }}>
              Unified ingestion gateway for master catalog spreadsheets and hospital commercial pricing
            </p>
          </div>
        </div>

        {/* Master Type Dropdown / Switcher */}
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
            Master Type:
          </label>
          <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}>
            <select
              value={selectedMasterType}
              onChange={(e) => setSelectedMasterType(e.target.value)}
              style={{
                height: '34px',
                padding: '0 30px 0 12px',
                borderRadius: '7px',
                border: '1.5px solid #CBD5E1',
                fontSize: '12.5px',
                fontWeight: 750,
                color: '#0F172A',
                background: '#F8FAFC',
                cursor: 'pointer',
                outline: 'none',
                appearance: 'none',
                WebkitAppearance: 'none',
                minWidth: '220px'
              }}
            >
              {MASTER_TYPES.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label} {!m.active ? `(${m.tag})` : ''}
                </option>
              ))}
            </select>
            <span style={{ position: 'absolute', right: '10px', pointerEvents: 'none', color: '#64748B', display: 'flex' }}>
              <LucideIcon name="chevron-down" size={13} />
            </span>
          </div>
        </div>
      </div>

      {/* ── CONDITIONAL MASTER VIEW ── */}
      {selectedMasterType === 'item-master' && (
        <HospitalMasterUploadView onSwitchTab={onSwitchTab} />
      )}

      {selectedMasterType === 'vendor-master' && (
        <div style={{
          background: '#FFFFFF',
          borderRadius: '12px',
          border: '1.5px dashed #CBD5E1',
          padding: '48px 24px',
          textAlign: 'center',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '12px',
          maxWidth: '680px',
          margin: '20px auto 0 auto'
        }}>
          <div style={{
            width: '48px',
            height: '48px',
            borderRadius: '12px',
            background: '#F1F5F9',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#64748B'
          }}>
            <LucideIcon name="truck" size={24} />
          </div>
          <h3 style={{ fontSize: '15px', fontWeight: 800, color: '#1E293B', margin: 0 }}>
            Vendor Master Upload — Coming Soon
          </h3>
          <p style={{ fontSize: '12.5px', color: '#64748B', maxWidth: '440px', lineHeight: 1.5, margin: 0 }}>
            Bulk vendor onboarding, catalog mapping, and supplier contract ingestion will be available in the upcoming Vendor Master release. Canonical schemas and validation pipelines are currently being finalized.
          </p>
          <div style={{ display: 'flex', gap: '8px', marginTop: '6px' }}>
            <span style={{ fontSize: '10.5px', fontWeight: 800, color: '#475569', background: '#F1F5F9', padding: '3px 9px', borderRadius: '6px' }}>
              Roadmap Milestone
            </span>
            <span style={{ fontSize: '10.5px', fontWeight: 800, color: '#0369A1', background: '#E0F2FE', padding: '3px 9px', borderRadius: '6px' }}>
              Phase 6+ Pipeline
            </span>
          </div>
        </div>
      )}

      {selectedMasterType === 'stock-master' && (
        <div style={{
          background: '#FFFFFF',
          borderRadius: '12px',
          border: '1.5px dashed #CBD5E1',
          padding: '48px 24px',
          textAlign: 'center',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '12px',
          maxWidth: '680px',
          margin: '20px auto 0 auto'
        }}>
          <div style={{
            width: '48px',
            height: '48px',
            borderRadius: '12px',
            background: '#F1F5F9',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#64748B'
          }}>
            <LucideIcon name="boxes" size={24} />
          </div>
          <h3 style={{ fontSize: '15px', fontWeight: 800, color: '#1E293B', margin: 0 }}>
            Stock Master Upload — Coming Soon
          </h3>
          <p style={{ fontSize: '12.5px', color: '#64748B', maxWidth: '440px', lineHeight: 1.5, margin: 0 }}>
            Bulk inventory intake, opening stock balance imports, batch expiration data, and warehouse location mappings will be enabled in the Stock Master phase.
          </p>
          <div style={{ display: 'flex', gap: '8px', marginTop: '6px' }}>
            <span style={{ fontSize: '10.5px', fontWeight: 800, color: '#475569', background: '#F1F5F9', padding: '3px 9px', borderRadius: '6px' }}>
              Roadmap Milestone
            </span>
            <span style={{ fontSize: '10.5px', fontWeight: 800, color: '#0369A1', background: '#E0F2FE', padding: '3px 9px', borderRadius: '6px' }}>
              Phase 7+ Pipeline
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
