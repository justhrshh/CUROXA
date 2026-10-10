import React, { useState } from 'react';
import * as Icons from 'lucide-react';
import HospitalMasterUploadView from './HospitalMasterUploadView';
import VendorMasterUploadView from './VendorMasterUploadView';
import StockMasterUploadView from './StockMasterUploadView';

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
  // Master Type selection: 'item-master' | 'vendor-master' | 'stock-master'
  const [selectedMasterType, setSelectedMasterType] = useState('item-master');

  const MASTER_TABS = [
    {
      id: 'item-master',
      title: 'Item Master',
      subtitle: 'Global catalogue + clinic commercial selection/pricing',
      icon: 'package',
      activeColor: '#2563EB',
      lightColor: '#EFF6FF',
      badge: 'Active & Verified'
    },
    {
      id: 'vendor-master',
      title: 'Vendor Master',
      subtitle: '49-column Store Vendor Master + clinic association',
      icon: 'truck',
      activeColor: '#059669',
      lightColor: '#ECFDF5',
      badge: 'Live Gateway'
    },
    {
      id: 'stock-master',
      title: 'Stock Master',
      subtitle: 'Clinic-scoped inventory balances & batch tracking',
      icon: 'boxes',
      activeColor: '#7C3AED',
      lightColor: '#FAF5FF',
      badge: 'Clinic Scoped'
    }
  ];

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      gap: 'clamp(14px, 2vh, 24px)',
      width: '100%',
      minWidth: 0,
      paddingTop: 'clamp(6px, 1vh, 16px)',
      paddingBottom: 'clamp(80px, 14vh, 160px)',
      scrollPaddingBottom: '14vh',
      boxSizing: 'border-box'
    }}>
      {/* ── TOP HEADER & MASTER NAVIGATION TABS ── */}
      <div style={{
        background: '#FFFFFF',
        borderRadius: '12px',
        border: '1px solid #E2E8F0',
        padding: 'clamp(14px, 2vh, 22px) clamp(16px, 2vw, 24px)',
        boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
        display: 'flex',
        flexDirection: 'column',
        gap: 'clamp(12px, 1.6vh, 18px)'
      }}>
        {/* Title & Gateway Description */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{
              width: '38px',
              height: '38px',
              borderRadius: '9px',
              background: '#EFF6FF',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#2563EB',
              flexShrink: 0
            }}>
              <LucideIcon name="upload-cloud" size={20} />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <h2 style={{ fontSize: '17px', fontWeight: 800, color: '#0F172A', margin: 0, letterSpacing: '-0.3px', lineHeight: 1.2 }}>
                  Common Master Upload / Download Center
                </h2>
                <span style={{ fontSize: '11px', fontWeight: 800, color: '#2563EB', background: '#DBEAFE', padding: '2px 8px', borderRadius: '5px' }}>
                  Unified Gateway
                </span>
              </div>
              <p style={{ fontSize: '12px', color: '#64748B', margin: '2px 0 0 0', lineHeight: 1.3 }}>
                Centralized gateway for exporting master templates and ingesting Excel workbooks across Item, Vendor, and Stock masters.
              </p>
            </div>
          </div>
        </div>

        {/* 3 Master Cards / Navigation Tabs */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: '12px',
          paddingTop: '4px'
        }}>
          {MASTER_TABS.map((tab) => {
            const isSelected = selectedMasterType === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setSelectedMasterType(tab.id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  padding: '12px 14px',
                  borderRadius: '10px',
                  border: isSelected ? `2px solid ${tab.activeColor}` : '1px solid #E2E8F0',
                  background: isSelected ? tab.lightColor : '#F8FAFC',
                  cursor: 'pointer',
                  textAlign: 'left',
                  transition: 'all 0.15s ease',
                  boxShadow: isSelected ? `0 2px 6px ${tab.activeColor}20` : 'none',
                  outline: 'none'
                }}
              >
                <div style={{
                  width: '36px',
                  height: '36px',
                  borderRadius: '8px',
                  background: isSelected ? tab.activeColor : '#E2E8F0',
                  color: isSelected ? '#FFFFFF' : '#64748B',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0
                }}>
                  <LucideIcon name={tab.icon} size={18} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '4px' }}>
                    <span style={{
                      fontSize: '13.5px',
                      fontWeight: 800,
                      color: isSelected ? tab.activeColor : '#0F172A'
                    }}>
                      {tab.title}
                    </span>
                    <span style={{
                      fontSize: '10px',
                      fontWeight: 750,
                      color: isSelected ? tab.activeColor : '#64748B',
                      background: isSelected ? '#FFFFFF' : '#E2E8F0',
                      padding: '1px 6px',
                      borderRadius: '4px'
                    }}>
                      {tab.badge}
                    </span>
                  </div>
                  <p style={{
                    fontSize: '11px',
                    color: isSelected ? '#334155' : '#64748B',
                    margin: '2px 0 0 0',
                    lineHeight: 1.25,
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis'
                  }}>
                    {tab.subtitle}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── ACTIVE MASTER WORKFLOW ── */}
      {selectedMasterType === 'item-master' && (
        <HospitalMasterUploadView onSwitchTab={onSwitchTab} />
      )}

      {selectedMasterType === 'vendor-master' && (
        <VendorMasterUploadView onSwitchTab={onSwitchTab} />
      )}

      {selectedMasterType === 'stock-master' && (
        <StockMasterUploadView onSwitchTab={onSwitchTab} />
      )}
    </div>
  );
}
