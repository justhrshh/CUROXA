import { getAccessToken } from '../../../utils/authTokenStore';
import React, { useState, useEffect } from 'react';
import * as Icons from 'lucide-react';
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

export default function StockMasterView({ onSwitchTab }) {
  const [hospitals, setHospitals] = useState([]);
  const [selectedHospital, setSelectedHospital] = useState('');
  const [batches, setBatches] = useState([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');

  // Fetch hospitals
  useEffect(() => {
    let isMounted = true;
    const fetchHospitals = async () => {
      try {
        const token = (getAccessToken() || localStorage.getItem('token'));
        const res = await fetch(getApiUrl('/superadmin/masters/hospitals-list'), {
          headers: token ? { Authorization: `Bearer ${token}` } : {}
        });
        const data = await res.json();
        if (isMounted && data.success && Array.isArray(data.data)) {
          setHospitals(data.data);
          if (data.data.length > 0 && !selectedHospital) {
            setSelectedHospital(data.data[0].code || data.data[0].hospitalId);
          }
        }
      } catch (err) {
        console.error('Failed to load hospitals for Stock Master:', err);
      }
    };
    fetchHospitals();
    return () => { isMounted = false; };
  }, []);

  // Fetch stock balances when hospital changes
  useEffect(() => {
    if (!selectedHospital) return;
    let isMounted = true;
    const fetchStock = async () => {
      try {
        setLoading(true);
        setError('');
        const token = (getAccessToken() || localStorage.getItem('token'));
        // Query medicines/inventory for selected hospital
        const res = await fetch(getApiUrl(`/medicines?paginated=false`), {
          headers: {
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
            'x-tenant-id': selectedHospital
          }
        });
        const data = await res.json();
        if (isMounted) {
          const list = Array.isArray(data) ? data : (data.data || []);
          setBatches(list);
        }
      } catch (err) {
        if (isMounted) setError('Failed to load hospital stock balances.');
      } finally {
        if (isMounted) setLoading(false);
      }
    };
    fetchStock();
    return () => { isMounted = false; };
  }, [selectedHospital]);

  const filteredBatches = batches.filter(b => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (b.name && b.name.toLowerCase().includes(q)) ||
           (b.sku && b.sku.toLowerCase().includes(q)) ||
           (b.category && b.category.toLowerCase().includes(q));
  });

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
                Stock Master & Physical Inventory Ledger
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
                LIVE LEDGER
              </span>
            </div>
            <p style={{ fontSize: '12px', color: '#64748B', margin: '2px 0 0 0' }}>
              Real-time hospital inventory balances, batch tracking, and commercial valuations
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <select
            value={selectedHospital}
            onChange={(e) => setSelectedHospital(e.target.value)}
            style={{
              height: '34px',
              padding: '0 10px',
              borderRadius: '6px',
              border: '1.5px solid #16A34A',
              fontSize: '12px',
              fontWeight: 700,
              color: '#0F172A',
              background: '#FFFFFF',
              outline: 'none',
              cursor: 'pointer'
            }}
          >
            {hospitals.map(h => (
              <option key={h.code || h.hospitalId} value={h.code || h.hospitalId}>
                {h.name} ({h.code || h.hospitalId})
              </option>
            ))}
          </select>

          {onSwitchTab && (
            <button
              type="button"
              onClick={() => onSwitchTab('master-upload')}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 12px',
                borderRadius: '6px',
                background: '#16A34A',
                border: 'none',
                color: '#FFFFFF',
                fontSize: '12px',
                fontWeight: 700,
                cursor: 'pointer'
              }}
            >
              <LucideIcon name="upload" size={14} />
              Stock Import / Template
            </button>
          )}
        </div>
      </div>

      {/* Search & Metrics Strip */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '12px',
        background: '#FFFFFF',
        padding: '12px 18px',
        borderRadius: '8px',
        border: '1px solid #E2E8F0'
      }}>
        <input
          type="text"
          placeholder="Filter stock by name, SKU, or category..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{
            flex: 1,
            minWidth: '240px',
            maxWidth: '400px',
            height: '34px',
            padding: '0 12px',
            borderRadius: '6px',
            border: '1px solid #CBD5E1',
            fontSize: '12.5px',
            outline: 'none'
          }}
        />

        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', fontSize: '12px', color: '#64748B' }}>
          <span>Total Items: <strong style={{ color: '#0F172A' }}>{batches.length}</strong></span>
          <span>In Stock: <strong style={{ color: '#16A34A' }}>{batches.filter(b => (b.stock || 0) > 0).length}</strong></span>
          <span>Out of Stock: <strong style={{ color: '#EF4444' }}>{batches.filter(b => (b.stock || 0) <= 0).length}</strong></span>
        </div>
      </div>

      {/* Stock Table */}
      <div style={{
        background: '#FFFFFF',
        borderRadius: '10px',
        border: '1px solid #E2E8F0',
        overflow: 'hidden',
        boxShadow: '0 1px 3px rgba(0,0,0,0.02)'
      }}>
        {loading ? (
          <div style={{ padding: '40px', textAlign: 'center', color: '#64748B', fontSize: '13px' }}>
            Loading stock balances for {selectedHospital}...
          </div>
        ) : filteredBatches.length === 0 ? (
          <div style={{ padding: '40px', textAlign: 'center', color: '#64748B', fontSize: '13px' }}>
            No stock inventory found for hospital <strong>{selectedHospital}</strong>.
            <div style={{ marginTop: '8px', fontSize: '12px' }}>
              Use the Stock Master Upload flow or complete a Goods Receipt (GRN) to intake inventory.
            </div>
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12.5px' }}>
            <thead>
              <tr style={{ background: '#F8FAFC', borderBottom: '1.5px solid #E2E8F0', textAlign: 'left' }}>
                <th style={{ padding: '10px 14px', color: '#475569', fontWeight: 800 }}>Item Name</th>
                <th style={{ padding: '10px 14px', color: '#475569', fontWeight: 800 }}>SKU / Item Code</th>
                <th style={{ padding: '10px 14px', color: '#475569', fontWeight: 800 }}>Category</th>
                <th style={{ padding: '10px 14px', color: '#475569', fontWeight: 800, textAlign: 'right' }}>Stock Balance</th>
                <th style={{ padding: '10px 14px', color: '#475569', fontWeight: 800, textAlign: 'right' }}>MRP</th>
                <th style={{ padding: '10px 14px', color: '#475569', fontWeight: 800 }}>Expiry</th>
                <th style={{ padding: '10px 14px', color: '#475569', fontWeight: 800 }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {filteredBatches.map((b, idx) => (
                <tr key={b._id || idx} style={{ borderBottom: '1px solid #F1F5F9' }}>
                  <td style={{ padding: '10px 14px', fontWeight: 700, color: '#0F172A' }}>{b.name}</td>
                  <td style={{ padding: '10px 14px', fontFamily: 'monospace', color: '#334155', fontWeight: 700 }}>{b.sku}</td>
                  <td style={{ padding: '10px 14px', color: '#64748B' }}>{b.category}</td>
                  <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 800, color: '#0F172A' }}>
                    {b.stock} {b.unit || ''}
                  </td>
                  <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 800, color: '#16A34A' }}>
                    ₹{Number(b.mrp || 0).toFixed(2)}
                  </td>
                  <td style={{ padding: '10px 14px', color: '#64748B' }}>{b.expiry || '--'}</td>
                  <td style={{ padding: '10px 14px' }}>
                    <span style={{
                      padding: '3px 8px',
                      borderRadius: '4px',
                      fontSize: '11px',
                      fontWeight: 750,
                      background: (b.stock || 0) <= 0 ? '#FEE2E2' : (b.stock || 0) <= 20 ? '#FEF3C7' : '#DCFCE7',
                      color: (b.stock || 0) <= 0 ? '#DC2626' : (b.stock || 0) <= 20 ? '#D97706' : '#15803D'
                    }}>
                      {b.status || ((b.stock || 0) <= 0 ? 'Out of Stock' : (b.stock || 0) <= 20 ? 'Low Stock' : 'In Stock')}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
