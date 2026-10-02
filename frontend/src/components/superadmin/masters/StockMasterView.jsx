import React from 'react';
import * as Icons from 'lucide-react';

const LucideIcon = ({ name, ...props }) => {
  if (!name) return <Icons.HelpCircle {...props} />;
  const camelName = name
    .split('-')
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join('');
  const IconComponent = Icons[camelName] || Icons.HelpCircle;
  return <IconComponent {...props} />;
};

export default function StockMasterView() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', width: '100%', minWidth: 0, paddingBottom: '40px' }}>
      {/* Header Banner */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '12px',
        background: '#FFFFFF',
        padding: '12px 18px',
        borderRadius: '8px',
        border: '1px solid #E2E8F0',
        boxShadow: '0 1px 2px rgba(0,0,0,0.02)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{
            width: '36px',
            height: '36px',
            borderRadius: '8px',
            background: '#F0FDF4',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#16A34A'
          }}>
            <LucideIcon name="boxes" size={20} />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <h2 style={{ fontSize: '16px', fontWeight: 800, color: '#0F172A', margin: 0 }}>
                Stock Master
              </h2>
              <span style={{
                fontSize: '10px',
                fontWeight: 750,
                padding: '2px 7px',
                borderRadius: '4px',
                background: '#DCFCE7',
                color: '#15803D',
                letterSpacing: '0.3px'
              }}>
                PHASE 3 ROADMAP
              </span>
            </div>
            <p style={{ fontSize: '12px', color: '#64748B', margin: '2px 0 0 0' }}>
              Hospital inventory configurations, batch allocation, and warehouse tracking
            </p>
          </div>
        </div>

        <div style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '6px',
          padding: '6px 12px',
          borderRadius: '6px',
          background: '#F8FAFC',
          border: '1px solid #E2E8F0',
          color: '#475569',
          fontSize: '12px',
          fontWeight: 600
        }}>
          <LucideIcon name="shield-check" size={14} color="#16A34A" />
          Inventory Scope Protected
        </div>
      </div>

      {/* Main Roadmap Card */}
      <div style={{
        background: '#FFFFFF',
        borderRadius: '10px',
        border: '1px solid #E2E8F0',
        padding: '48px 32px',
        textAlign: 'center',
        boxShadow: '0 1px 3px rgba(0,0,0,0.02)'
      }}>
        <div style={{
          width: '64px',
          height: '64px',
          borderRadius: '16px',
          background: '#F0FDF4',
          color: '#16A34A',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          margin: '0 auto 20px auto'
        }}>
          <LucideIcon name="boxes" size={32} />
        </div>
        <h3 style={{ fontSize: '18px', fontWeight: 800, color: '#0F172A', marginBottom: '8px' }}>
          Stock Master Management
        </h3>
        <p style={{ fontSize: '13.5px', color: '#475569', maxWidth: '620px', margin: '0 auto 24px auto', lineHeight: 1.6 }}>
          Stock Master will operate only on items configured in the hospital's active catalogue.
          Real-time stock ledger, batch tracking, expiry date monitoring, and issue multipliers will be managed here.
        </p>

        {/* Feature Preview Cards */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: '14px',
          maxWidth: '820px',
          margin: '0 auto 24px auto',
          textAlign: 'left'
        }}>
          <div style={{ background: '#F8FAFC', padding: '16px', borderRadius: '8px', border: '1px solid #E2E8F0' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 700, color: '#0F172A', fontSize: '13px', marginBottom: '6px' }}>
              <LucideIcon name="layers" size={16} color="#16A34A" />
              Batch & Expiry Control
            </div>
            <p style={{ fontSize: '11.5px', color: '#64748B', margin: 0, lineHeight: 1.5 }}>
              FEFO/FIFO allocation, expiry cutoff thresholds, and quarantine controls.
            </p>
          </div>

          <div style={{ background: '#F8FAFC', padding: '16px', borderRadius: '8px', border: '1px solid #E2E8F0' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 700, color: '#0F172A', fontSize: '13px', marginBottom: '6px' }}>
              <LucideIcon name="map-pin" size={16} color="#16A34A" />
              Rack & Warehouse Locations
            </div>
            <p style={{ fontSize: '11.5px', color: '#64748B', margin: 0, lineHeight: 1.5 }}>
              Multi-store physical bin tracking matching registry rackLocation fields.
            </p>
          </div>

          <div style={{ background: '#F8FAFC', padding: '16px', borderRadius: '8px', border: '1px solid #E2E8F0' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 700, color: '#0F172A', fontSize: '13px', marginBottom: '6px' }}>
              <LucideIcon name="arrow-down-circle" size={16} color="#16A34A" />
              GRN Intake & Reorder Alerts
            </div>
            <p style={{ fontSize: '11.5px', color: '#64748B', margin: 0, lineHeight: 1.5 }}>
              Automated inward goods ledger and low-stock reorder thresholds.
            </p>
          </div>
        </div>

        <div style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '8px',
          padding: '8px 16px',
          borderRadius: '8px',
          background: '#F0FDF4',
          border: '1px solid #BBF7D0',
          color: '#15803D',
          fontSize: '12.5px',
          fontWeight: 650
        }}>
          <LucideIcon name="info" size={15} color="#16A34A" />
          Scheduled for Phase 3 implementation following Vendor Master completion.
        </div>
      </div>
    </div>
  );
}
