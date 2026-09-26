import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../utils/api';
import { exportEngine, itemMasterExportColumns } from '../../utils/exportEngine';
import ItemRequestModal from './ItemRequestModal';

export default function ItemMasterTab({ showToast, userRole }) {
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [itemTypeFilter, setItemTypeFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [limit] = useState(25);
  const [pagination, setPagination] = useState({ total: 0, pages: 1 });
  const [isRequestModalOpen, setIsRequestModalOpen] = useState(false);

  const showToastRef = useRef(showToast);
  useEffect(() => { showToastRef.current = showToast; }, [showToast]);

  const isSuperAdmin = ['superadmin', 'super_admin', 'admin'].includes((userRole || '').toLowerCase());

  // Debounce search
  useEffect(() => {
    const handler = setTimeout(() => { setDebouncedSearch(search); }, 300);
    return () => clearTimeout(handler);
  }, [search]);

  const fetchItems = useCallback(async (isInitial = false) => {
    try {
      if (isInitial) setInitialLoading(true);
      setLoading(true);
      const params = {
        scope: 'GLOBAL',
        page,
        limit,
        search: debouncedSearch.trim() || undefined,
        categoryType: categoryFilter !== 'all' ? categoryFilter : undefined,
        itemType: itemTypeFilter !== 'all' ? itemTypeFilter : undefined,
        status: statusFilter !== 'all' ? statusFilter : undefined
      };
      const res = await api.get('/item-master', { params });
      if (res.data) {
        setItems(res.data.data || res.data || []);
        setPagination(res.data.pagination || { total: (res.data.data || res.data || []).length, pages: 1 });
      }
    } catch (err) {
      console.error('Fetch Item Master error:', err);
      if (showToastRef.current) showToastRef.current('Failed to load global item catalog', 'error');
    } finally {
      setLoading(false);
      setInitialLoading(false);
    }
  }, [page, limit, debouncedSearch, categoryFilter, itemTypeFilter, statusFilter]);

  useEffect(() => { fetchItems(items.length === 0); }, [fetchItems]);

  const handleExport = (format) => {
    if (items.length === 0) { if (showToastRef.current) showToastRef.current('No items to export', 'error'); return; }
    exportEngine({
      data: items, columns: itemMasterExportColumns, title: 'Global Item Master Catalog',
      subtitle: `Exported on ${new Date().toLocaleDateString('en-IN')}`, format,
      filename: `Global_Item_Master_${new Date().toISOString().split('T')[0]}`
    });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* GLOBAL CATALOG BANNER */}
      <div style={{
        background: 'linear-gradient(135deg, #EFF6FF 0%, #F0FDF4 100%)',
        border: '1px solid #BFDBFE',
        borderRadius: '12px',
        padding: '14px 20px',
        display: 'flex',
        alignItems: 'center',
        gap: '12px'
      }}>
        <span style={{ fontSize: '24px' }}>🌐</span>
        <div>
          <div style={{ fontWeight: 800, color: '#1E3A5F', fontSize: '14px' }}>
            Global Item Master · Centrally Managed
          </div>
          <div style={{ fontSize: '12px', color: '#3B82F6', marginTop: '2px' }}>
            This catalog is owned and maintained by <strong>Quroxa Super Admin</strong>.
            Hospitals can browse and search items. To add a new item, submit a request.
          </div>
        </div>
        <span style={{
          marginLeft: 'auto',
          background: '#2563EB',
          color: '#fff',
          padding: '3px 12px',
          borderRadius: '20px',
          fontSize: '11px',
          fontWeight: 700,
          whiteSpace: 'nowrap'
        }}>
          🔒 Read-Only for Hospitals
        </span>
      </div>

      {/* TOP ACTION BAR */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 800, color: '#0F172A' }}>Item Master Catalog</h2>
          <span style={{ background: '#E2E8F0', color: '#334155', padding: '3px 10px', borderRadius: '20px', fontSize: '12px', fontWeight: 700 }}>
            {pagination.total || items.length} Items
          </span>
          <span style={{ background: '#DCFCE7', color: '#166534', padding: '3px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: 700 }}>
            🌐 Global Catalog
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {/* Export */}
          <div style={{ display: 'inline-flex', borderRadius: '8px', overflow: 'hidden', border: '1px solid #CBD5E1' }}>
            <button onClick={() => handleExport('excel')} className="proc-btn"
              style={{ background: '#FFFFFF', color: '#166534', border: 'none', padding: '8px 12px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>
              📊 Excel
            </button>
            <button onClick={() => handleExport('csv')} className="proc-btn"
              style={{ background: '#FFFFFF', color: '#0F172A', borderLeft: '1px solid #E2E8F0', border: 'none', padding: '8px 12px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>
              📄 CSV
            </button>
            <button onClick={() => handleExport('pdf')} className="proc-btn"
              style={{ background: '#FFFFFF', color: '#991B1B', borderLeft: '1px solid #E2E8F0', border: 'none', padding: '8px 12px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>
              📕 PDF
            </button>
          </div>

          {/* Super admin can navigate to create page; hospital users submit a request */}
          {isSuperAdmin ? (
            <button
              onClick={() => navigate('/procurement/item-master/new')}
              className="proc-btn proc-btn-primary"
              style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 16px', fontSize: '13px', fontWeight: 700 }}>
              <span>+</span> Add Item
            </button>
          ) : (
            <button
              onClick={() => setIsRequestModalOpen(true)}
              className="proc-btn"
              style={{
                display: 'flex', alignItems: 'center', gap: '6px',
                padding: '8px 16px', fontSize: '13px', fontWeight: 700,
                background: '#2563EB', color: '#fff', border: 'none',
                borderRadius: '8px', cursor: 'pointer'
              }}>
              📋 Request New Item
            </button>
          )}
        </div>
      </div>

      {/* FILTER & SEARCH ROW */}
      <div style={{ background: '#FFFFFF', padding: '16px 20px', borderRadius: '12px', border: '1px solid #E2E8F0', display: 'flex', flexWrap: 'wrap', gap: '14px', alignItems: 'center' }}>
        <div style={{ flex: '1 1 240px', position: 'relative' }}>
          <input
            type="text" className="proc-input"
            placeholder="Search by code, generic name, brand, manufacturer..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            style={{ width: '100%' }}
          />
        </div>

        <div style={{ flex: '0 0 160px' }}>
          <select className="proc-select" value={categoryFilter}
            onChange={(e) => { setCategoryFilter(e.target.value); setPage(1); }}>
            <option value="all">All Categories</option>
            <option value="Drugs">Drugs</option>
            <option value="Surgical">Surgical</option>
            <option value="Consumable">Consumable</option>
            <option value="General Store">General Store</option>
            <option value="Equipment">Equipment</option>
            <option value="Laboratory">Laboratory</option>
          </select>
        </div>

        <div style={{ flex: '0 0 140px' }}>
          <select className="proc-select" value={itemTypeFilter}
            onChange={(e) => { setItemTypeFilter(e.target.value); setPage(1); }}>
            <option value="all">All Types</option>
            <option value="Medicine">Medicine</option>
            <option value="Consumable">Consumable</option>
            <option value="Reagent">Reagent</option>
            <option value="Asset">Asset</option>
            <option value="Non-Consumable">Non-Consumable</option>
          </select>
        </div>

        <div style={{ flex: '0 0 130px' }}>
          <select className="proc-select" value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}>
            <option value="all">All Status</option>
            <option value="Active">Active</option>
            <option value="Inactive">Inactive</option>
          </select>
        </div>

        <button onClick={() => { setSearch(''); setCategoryFilter('all'); setItemTypeFilter('all'); setStatusFilter('all'); setPage(1); }}
          className="proc-btn proc-btn-secondary" style={{ padding: '8px 12px', fontSize: '12.5px' }}>
          Reset
        </button>
      </div>

      {/* ITEMS TABLE */}
      <div style={{ background: '#FFFFFF', borderRadius: '12px', border: '1px solid #E2E8F0', overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table className="proc-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead>
              <tr style={{ background: '#F8FAFC', borderBottom: '1px solid #E2E8F0' }}>
                <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 700, color: '#475569' }}>Item Code</th>
                <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 700, color: '#475569' }}>Generic Name · Brand</th>
                <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 700, color: '#475569' }}>Type / Category</th>
                <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 700, color: '#166534', background: '#F0FDF4' }}>Packaging</th>
                <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 700, color: '#475569' }}>GST %</th>
                <th style={{ padding: '12px 16px', textAlign: 'center', fontWeight: 700, color: '#475569' }}>Status</th>
                {isSuperAdmin && (
                  <th style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 700, color: '#475569' }}>Actions</th>
                )}
              </tr>
            </thead>
            <tbody style={{ opacity: loading && !initialLoading ? 0.6 : 1, transition: 'opacity 0.2s ease' }}>
              {initialLoading ? (
                <tr><td colSpan="7" style={{ textAlign: 'center', padding: '40px', color: '#64748B' }}>Loading Global Item Catalog...</td></tr>
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan="7" style={{ textAlign: 'center', padding: '48px', color: '#64748B' }}>
                    <div style={{ fontSize: '36px', marginBottom: '12px' }}>🌐</div>
                    <div style={{ fontWeight: 700, color: '#0F172A', marginBottom: '6px' }}>Global Catalog is empty</div>
                    <div style={{ fontSize: '12.5px', color: '#64748B', marginBottom: '16px' }}>
                      {isSuperAdmin
                        ? 'Create the first global item using the "Add Item" button above.'
                        : 'No items match your search. Submit a "Request New Item" to add items to the catalog.'}
                    </div>
                    {!isSuperAdmin && (
                      <button onClick={() => setIsRequestModalOpen(true)}
                        style={{ background: '#2563EB', color: '#fff', border: 'none', padding: '8px 18px', borderRadius: '8px', fontWeight: 700, cursor: 'pointer', fontSize: '13px' }}>
                        📋 Request New Item
                      </button>
                    )}
                  </td>
                </tr>
              ) : (
                items.map((item) => {
                  const factor = item.converterFactor || 1;
                  const pUnit = item.purchasedUnit || 'Box';
                  const cUnit = item.consumptionUnit || 'Unit';

                  return (
                    <tr key={item._id} style={{ borderBottom: '1px solid #F1F5F9' }}>
                      {/* ITEM CODE */}
                      <td style={{ padding: '14px 16px', verticalAlign: 'middle' }}>
                        <span style={{ fontFamily: 'monospace', fontWeight: 700, color: '#2563EB', background: '#EFF6FF', padding: '4px 8px', borderRadius: '6px', fontSize: '12px' }}>
                          {item.itemCode}
                        </span>
                        <div style={{ marginTop: '4px' }}>
                          <span style={{ background: '#DCFCE7', color: '#166534', fontSize: '10px', fontWeight: 700, padding: '2px 6px', borderRadius: '10px' }}>
                            🌐 Global
                          </span>
                        </div>
                      </td>

                      {/* NAME & BRAND */}
                      <td style={{ padding: '14px 16px', verticalAlign: 'middle' }}>
                        <div style={{ fontWeight: 700, color: '#0F172A', fontSize: '13.5px' }}>{item.genericName}</div>
                        {item.brandName && (
                          <div style={{ fontSize: '12px', color: '#64748B' }}>Brand: <strong style={{ color: '#334155' }}>{item.brandName}</strong></div>
                        )}
                        {item.manufacturer && (
                          <div style={{ fontSize: '11px', color: '#64748B' }}>Mfg: {item.manufacturer}</div>
                        )}
                        {item.composition && (
                          <div style={{ fontSize: '11px', color: '#7C3AED', marginTop: '2px' }}>{item.composition}</div>
                        )}
                      </td>

                      {/* TYPE / CATEGORY */}
                      <td style={{ padding: '14px 16px', verticalAlign: 'middle' }}>
                        <span style={{
                          background: item.itemType === 'Medicine' ? '#EDE9FE' : item.itemType === 'Consumable' ? '#FEF3C7' : '#F1F5F9',
                          color: item.itemType === 'Medicine' ? '#5B21B6' : item.itemType === 'Consumable' ? '#92400E' : '#475569',
                          padding: '2px 8px', borderRadius: '10px', fontSize: '11px', fontWeight: 700
                        }}>{item.itemType || 'Medicine'}</span>
                        <div style={{ fontSize: '11px', color: '#64748B', marginTop: '4px' }}>{item.categoryType || '—'}</div>
                      </td>

                      {/* PACKAGING */}
                      <td style={{ padding: '14px 16px', verticalAlign: 'middle', background: '#F0FDF4' }}>
                        <div style={{ fontWeight: 700, color: '#15803D' }}>
                          1 {pUnit} = {factor} {cUnit}{factor !== 1 ? 's' : ''}
                        </div>
                        {item.packSizeDescription && (
                          <div style={{ fontSize: '11px', color: '#166534' }}>{item.packSizeDescription}</div>
                        )}
                      </td>

                      {/* GST */}
                      <td style={{ padding: '14px 16px', verticalAlign: 'middle', fontWeight: 600 }}>
                        {item.defaultGst !== undefined ? `${item.defaultGst}%` : '12%'}
                      </td>

                      {/* STATUS */}
                      <td style={{ padding: '14px 16px', verticalAlign: 'middle', textAlign: 'center' }}>
                        <span style={{
                          display: 'inline-block', padding: '3px 10px', borderRadius: '12px', fontSize: '11.5px', fontWeight: 700,
                          background: item.status === 'Active' ? '#DCFCE7' : '#F1F5F9',
                          color: item.status === 'Active' ? '#166534' : '#64748B'
                        }}>{item.status || 'Active'}</span>
                      </td>

                      {/* ACTIONS — only for super admin */}
                      {isSuperAdmin && (
                        <td style={{ padding: '14px 16px', verticalAlign: 'middle', textAlign: 'right' }}>
                          <div style={{ display: 'inline-flex', gap: '8px' }}>
                            <button
                              onClick={() => navigate(`/procurement/item-master/${item._id}/edit`)}
                              className="proc-btn"
                              style={{ background: '#F8FAFC', border: '1px solid #CBD5E1', padding: '5px 10px', fontSize: '12px', borderRadius: '6px', cursor: 'pointer' }}>
                              Edit
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* PAGINATION */}
        {pagination.pages > 1 && (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 20px', borderTop: '1px solid #E2E8F0', background: '#F8FAFC' }}>
            <span style={{ fontSize: '12.5px', color: '#64748B' }}>
              Page {page} of {pagination.pages} ({pagination.total} items)
            </span>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button disabled={page <= 1} onClick={() => setPage(p => Math.max(1, p - 1))}
                className="proc-btn proc-btn-secondary" style={{ padding: '6px 12px', fontSize: '12px' }}>
                Previous
              </button>
              <button disabled={page >= pagination.pages} onClick={() => setPage(p => p + 1)}
                className="proc-btn proc-btn-secondary" style={{ padding: '6px 12px', fontSize: '12px' }}>
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ITEM REQUEST MODAL */}
      <ItemRequestModal
        isOpen={isRequestModalOpen}
        onClose={() => setIsRequestModalOpen(false)}
        onSuccess={() => {
          setIsRequestModalOpen(false);
          if (showToastRef.current) showToastRef.current('Item request submitted successfully!', 'success');
        }}
        showToast={showToast}
      />
    </div>
  );
}
