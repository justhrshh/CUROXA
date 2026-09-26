import React, { useState, useEffect, useCallback, useRef } from 'react';
import api from '../../utils/api';
import { exportEngine, vendorQuotationExportColumns } from '../../utils/exportEngine';
import VendorQuotationModal from './VendorQuotationModal';

export default function VendorQuotationsTab({ vendors = [], showToast }) {
  const [quotations, setQuotations] = useState([]);
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [vendorFilter, setVendorFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('Active');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(25);
  const [pagination, setPagination] = useState({ total: 0, pages: 1 });

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingQuotation, setEditingQuotation] = useState(null);

  const showToastRef = useRef(showToast);
  useEffect(() => {
    showToastRef.current = showToast;
  }, [showToast]);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(search);
    }, 300);
    return () => clearTimeout(handler);
  }, [search]);

  const fetchQuotations = useCallback(async (isInitial = false) => {
    try {
      if (isInitial) {
        setInitialLoading(true);
      }
      setLoading(true);
      const params = {
        page,
        limit,
        search: debouncedSearch.trim() || undefined,
        vendorId: vendorFilter !== 'all' ? vendorFilter : undefined,
        status: statusFilter !== 'all' ? statusFilter : undefined
      };

      const res = await api.get('/vendor-quotations', { params });
      if (res.data && res.data.success) {
        setQuotations(res.data.data || []);
        setPagination(res.data.pagination || { total: 0, pages: 1 });
      }
    } catch (err) {
      console.error('Fetch Vendor Quotations error:', err);
      if (showToastRef.current) showToastRef.current('Failed to load vendor quotations', 'error');
    } finally {
      setLoading(false);
      setInitialLoading(false);
    }
  }, [page, limit, debouncedSearch, vendorFilter, statusFilter]);

  useEffect(() => {
    fetchQuotations(quotations.length === 0);
  }, [fetchQuotations]);

  const handleToggleStatus = async (quotation, newStatus) => {
    try {
      const res = await api.put(`/vendor-quotations/${quotation._id}/toggle-status`, { status: newStatus });
      if (res.data && res.data.success) {
        if (showToastRef.current) showToastRef.current(`Quotation status updated to ${newStatus}`, 'success');
        fetchQuotations(false);
      }
    } catch (err) {
      console.error('Status toggle error:', err);
      if (showToastRef.current) showToastRef.current('Failed to update quotation status', 'error');
    }
  };

  const handleExport = (format) => {
    if (quotations.length === 0) {
      if (showToastRef.current) showToastRef.current('No quotations available to export', 'error');
      return;
    }
    exportEngine({
      data: quotations,
      columns: vendorQuotationExportColumns,
      title: 'Vendor Quotations',
      subtitle: `Exported on ${new Date().toLocaleDateString('en-IN')}`,
      format,
      filename: `Vendor_Quotations_${new Date().toISOString().split('T')[0]}`
    });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* TOP ACTION BAR */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 800, color: '#0F172A' }}>Vendor Quotations</h2>
          <span style={{ background: '#E2E8F0', color: '#334155', padding: '3px 10px', borderRadius: '20px', fontSize: '12px', fontWeight: 700 }}>
            {pagination.total || quotations.length} Quotations
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {/* Export Dropdown */}
          <div style={{ display: 'inline-flex', borderRadius: '8px', overflow: 'hidden', border: '1px solid #CBD5E1' }}>
            <button
              onClick={() => handleExport('excel')}
              className="proc-btn"
              style={{ background: '#FFFFFF', color: '#166534', border: 'none', padding: '8px 12px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}
              title="Export Excel"
            >
              📊 Excel
            </button>
            <button
              onClick={() => handleExport('csv')}
              className="proc-btn"
              style={{ background: '#FFFFFF', color: '#0F172A', borderLeft: '1px solid #E2E8F0', border: 'none', padding: '8px 12px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}
              title="Export CSV"
            >
              📄 CSV
            </button>
            <button
              onClick={() => handleExport('pdf')}
              className="proc-btn"
              style={{ background: '#FFFFFF', color: '#991B1B', borderLeft: '1px solid #E2E8F0', border: 'none', padding: '8px 12px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}
              title="Export PDF"
            >
              📕 PDF
            </button>
          </div>

          <button
            onClick={() => {
              setEditingQuotation(null);
              setIsModalOpen(true);
            }}
            className="proc-btn proc-btn-primary"
            style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 16px', fontSize: '13px', fontWeight: 700 }}
          >
            <span>+</span> Add Quotation / Rate
          </button>
        </div>
      </div>

      {/* FILTER ROW */}
      <div style={{ background: '#FFFFFF', padding: '16px 20px', borderRadius: '12px', border: '1px solid #E2E8F0', display: 'flex', flexWrap: 'wrap', gap: '14px', alignItems: 'center' }}>
        <div style={{ flex: '1 1 240px' }}>
          <input
            type="text"
            className="proc-input"
            placeholder="Search quotation no, vendor, item name..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            style={{ width: '100%' }}
          />
        </div>

        <div style={{ flex: '0 0 200px' }}>
          <select
            className="proc-select"
            value={vendorFilter}
            onChange={(e) => {
              setVendorFilter(e.target.value);
              setPage(1);
            }}
          >
            <option value="all">All Vendors</option>
            {vendors.map(v => (
              <option key={v._id} value={v._id}>{v.name}</option>
            ))}
          </select>
        </div>

        <div style={{ flex: '0 0 160px' }}>
          <select
            className="proc-select"
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPage(1);
            }}
          >
            <option value="all">All Statuses</option>
            <option value="Active">Active Only</option>
            <option value="Superseded">Superseded</option>
            <option value="Expired">Expired</option>
          </select>
        </div>

        <button
          onClick={() => {
            setSearch('');
            setVendorFilter('all');
            setStatusFilter('Active');
            setPage(1);
          }}
          className="proc-btn proc-btn-secondary"
          style={{ padding: '8px 12px', fontSize: '12.5px' }}
        >
          Reset Filters
        </button>
      </div>

      {/* QUOTATIONS TABLE */}
      <div style={{ background: '#FFFFFF', borderRadius: '12px', border: '1px solid #E2E8F0', overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table className="proc-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead>
              <tr style={{ background: '#F8FAFC', borderBottom: '1px solid #E2E8F0' }}>
                <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 700, color: '#475569' }}>Quotation No</th>
                <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 700, color: '#475569' }}>Vendor Name</th>
                <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 700, color: '#475569' }}>Item & Brand</th>
                <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 700, color: '#475569' }}>Purchased Rate</th>
                <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 700, color: '#166534', background: '#F0FDF4' }}>
                  Effective Net Cost / Unit
                </th>
                <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 700, color: '#475569' }}>Validity & Lead</th>
                <th style={{ padding: '12px 16px', textAlign: 'center', fontWeight: 700, color: '#475569' }}>Status</th>
                <th style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 700, color: '#475569' }}>Actions</th>
              </tr>
            </thead>
            <tbody style={{ opacity: loading && !initialLoading ? 0.6 : 1, transition: 'opacity 0.2s ease' }}>
              {initialLoading ? (
                <tr>
                  <td colSpan="8" style={{ textAlign: 'center', padding: '40px', color: '#64748B' }}>
                    Loading Vendor Quotations...
                  </td>
                </tr>
              ) : quotations.length === 0 ? (
                <tr>
                  <td colSpan="8" style={{ textAlign: 'center', padding: '40px', color: '#64748B' }}>
                    No vendor quotations found.
                  </td>
                </tr>
              ) : (
                quotations.map((q) => {
                  const isExpired = new Date(q.validTill) < new Date();
                  const pUnit = q.purchasedUnit || 'Box';
                  const cUnit = q.consumptionUnit || 'Unit';
                  const factor = q.converterFactor || 1;

                  return (
                    <tr key={q._id} style={{ borderBottom: '1px solid #F1F5F9' }}>
                      {/* QUOTATION NO */}
                      <td style={{ padding: '14px 16px', verticalAlign: 'middle' }}>
                        <span style={{ fontFamily: 'monospace', fontWeight: 700, color: '#7C3AED', background: '#F5F3FF', padding: '4px 8px', borderRadius: '6px', fontSize: '12px' }}>
                          {q.quotationNo}
                        </span>
                      </td>

                      {/* VENDOR */}
                      <td style={{ padding: '14px 16px', verticalAlign: 'middle' }}>
                        <div style={{ fontWeight: 700, color: '#0F172A' }}>{q.vendorName}</div>
                        {q.vendorCode && (
                          <div style={{ fontSize: '11px', color: '#64748B' }}>Code: {q.vendorCode}</div>
                        )}
                      </td>

                      {/* ITEM */}
                      <td style={{ padding: '14px 16px', verticalAlign: 'middle' }}>
                        <div style={{ fontWeight: 700, color: '#0F172A' }}>{q.genericName}</div>
                        <div style={{ fontSize: '11px', color: '#2563EB', fontWeight: 600 }}>{q.itemCode}</div>
                        {q.brandName && (
                          <div style={{ fontSize: '11px', color: '#64748B' }}>Brand: {q.brandName}</div>
                        )}
                      </td>

                      {/* PURCHASED RATE */}
                      <td style={{ padding: '14px 16px', verticalAlign: 'middle' }}>
                        <div style={{ fontWeight: 700, color: '#0F172A', fontSize: '13.5px' }}>
                          ₹{Number(q.ratePerPurchasedUnit || 0).toFixed(2)} / {pUnit}
                        </div>
                        <div style={{ fontSize: '11px', color: '#64748B' }}>
                          Disc: {q.discountPercent || 0}% | GST: {q.gstPercent || 0}%
                        </div>
                        <div style={{ fontSize: '11px', color: '#475569' }}>
                          (1 {pUnit} = {factor} {cUnit})
                        </div>
                      </td>

                      {/* NET EFFECTIVE COST */}
                      <td style={{ padding: '14px 16px', verticalAlign: 'middle', background: '#F0FDF4' }}>
                        <div style={{ fontWeight: 900, color: '#15803D', fontSize: '14.5px' }}>
                          ₹{Number(q.netEffectiveRate || 0).toFixed(4)}
                        </div>
                        <div style={{ fontSize: '11px', color: '#166534' }}>
                          per {cUnit} (Net Effective)
                        </div>
                      </td>

                      {/* VALIDITY & LEAD */}
                      <td style={{ padding: '14px 16px', verticalAlign: 'middle', fontSize: '12px' }}>
                        <div style={{ color: isExpired ? '#DC2626' : '#334155', fontWeight: isExpired ? 700 : 500 }}>
                          Till: {q.validTill ? new Date(q.validTill).toLocaleDateString('en-IN') : '--'}
                        </div>
                        <div style={{ fontSize: '11px', color: '#64748B' }}>
                          Lead time: {q.leadTimeDays || 3} days | Min: {q.minimumOrderQty || 1}
                        </div>
                      </td>

                      {/* STATUS */}
                      <td style={{ padding: '14px 16px', verticalAlign: 'middle', textAlign: 'center' }}>
                        <span style={{
                          display: 'inline-block',
                          padding: '3px 10px',
                          borderRadius: '12px',
                          fontSize: '11.5px',
                          fontWeight: 700,
                          background: q.status === 'Active' && !isExpired ? '#DCFCE7' : '#F1F5F9',
                          color: q.status === 'Active' && !isExpired ? '#166534' : '#64748B'
                        }}>
                          {isExpired ? 'Expired' : q.status}
                        </span>
                      </td>

                      {/* ACTIONS */}
                      <td style={{ padding: '14px 16px', verticalAlign: 'middle', textAlign: 'right' }}>
                        <div style={{ display: 'inline-flex', gap: '8px' }}>
                          <button
                            onClick={() => {
                              setEditingQuotation(q);
                              setIsModalOpen(true);
                            }}
                            className="proc-btn"
                            style={{ background: '#F8FAFC', border: '1px solid #CBD5E1', padding: '5px 10px', fontSize: '12px', borderRadius: '6px', cursor: 'pointer' }}
                            title="Edit Quotation"
                          >
                            Edit
                          </button>

                          {q.status === 'Active' && (
                            <button
                              onClick={() => handleToggleStatus(q, 'Superseded')}
                              className="proc-btn"
                              style={{ background: '#FFFBEB', border: '1px solid #FDE68A', color: '#B45309', padding: '5px 8px', fontSize: '11.5px', borderRadius: '6px', cursor: 'pointer' }}
                              title="Mark Superseded"
                            >
                              Supersede
                            </button>
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

        {/* PAGINATION BAR */}
        {pagination.pages > 1 && (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 20px', borderTop: '1px solid #E2E8F0', background: '#F8FAFC' }}>
            <span style={{ fontSize: '12.5px', color: '#64748B' }}>
              Showing Page {page} of {pagination.pages} ({pagination.total} total quotations)
            </span>

            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                disabled={page <= 1}
                onClick={() => setPage(p => Math.max(1, p - 1))}
                className="proc-btn proc-btn-secondary"
                style={{ padding: '6px 12px', fontSize: '12px' }}
              >
                Previous
              </button>
              <button
                disabled={page >= pagination.pages}
                onClick={() => setPage(p => p + 1)}
                className="proc-btn proc-btn-secondary"
                style={{ padding: '6px 12px', fontSize: '12px' }}
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* MODAL */}
      <VendorQuotationModal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setEditingQuotation(null);
        }}
        onSaveSuccess={fetchQuotations}
        editingQuotation={editingQuotation}
        vendors={vendors}
        showToast={showToast}
      />
    </div>
  );
}
