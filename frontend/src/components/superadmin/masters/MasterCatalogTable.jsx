import { getAccessToken } from '../../../utils/authTokenStore';
import React, { useState, useEffect, useCallback } from 'react';
import * as Icons from 'lucide-react';
import { getCategoryConfig } from '../../../config/masterSchemaRegistry';
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

export default function MasterCatalogTable({
  category,
  department = '',
  onCreate,
  onEdit,
  onView,
  search: externalSearch,
  onSearchChange,
  statusFilter: externalStatusFilter,
  onStatusFilterChange,
  refreshTrigger,
  hideToolbar = false
}) {
  const catConfig = getCategoryConfig(category);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [internalSearch, setInternalSearch] = useState('');
  const [internalStatusFilter, setInternalStatusFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [pagination, setPagination] = useState({ total: 0, pages: 1 });

  const search = externalSearch !== undefined ? externalSearch : internalSearch;
  const setSearch = onSearchChange || setInternalSearch;
  const statusFilter = externalStatusFilter !== undefined ? externalStatusFilter : internalStatusFilter;
  const setStatusFilter = onStatusFilterChange || setInternalStatusFilter;

  // Fetch items from backend
  const fetchItems = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const token = (getAccessToken() || localStorage.getItem('token'));
      const params = new URLSearchParams();

      if (category && category !== 'all') {
        params.append('category', category);
      }
      if (department && department !== 'all') {
        params.append('department', department);
      }
      if (statusFilter && statusFilter !== 'all') {
        params.append('status', statusFilter);
      }
      if (search.trim()) {
        params.append('search', search.trim());
      }
      params.append('page', page.toString());
      params.append('limit', limit.toString());

      const targetUrl = getApiUrl(`/superadmin/masters/items?${params.toString()}`);
      const res = await fetch(targetUrl, {
        headers: token ? { Authorization: `Bearer ${token}` } : {}
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

      if (!res.ok) {
        let errMessage = `Failed to load items: HTTP ${res.status}`;
        try {
          const errData = await res.json();
          if (errData?.error) errMessage = errData.error;
        } catch (e) {}
        throw new Error(errMessage);
      }

      const data = await res.json();
      if (data.success) {
        setItems(data.data || []);
        if (data.pagination) {
          setPagination(data.pagination);
        }
      } else {
        throw new Error(data.error || 'Failed to load master items');
      }
    } catch (err) {
      console.error('[MASTER CATALOG] Fetch error:', err);
      setError(err.message || 'Error loading catalog');
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [category, department, statusFilter, search, page, limit]);

  // Reset page when filters change
  useEffect(() => {
    setPage(1);
  }, [category, department, statusFilter, search]);

  // Execute fetch
  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  // Execute fetch when refreshTrigger increments
  useEffect(() => {
    if (refreshTrigger) {
      fetchItems();
    }
  }, [refreshTrigger, fetchItems]);

  // Helper to extract nested or flat value
  const getItemValue = (item, key) => {
    if (!item) return '-';
    if (item[key] !== undefined && item[key] !== null && item[key] !== '') {
      return String(item[key]);
    }
    if (item.categoryData && item.categoryData[key] !== undefined && item.categoryData[key] !== null && item.categoryData[key] !== '') {
      return String(item.categoryData[key]);
    }
    return '-';
  };

  // Format client headers cleanly for compact enterprise table
  const formatColumnHeader = (key, defaultHeader) => {
    const customMap = {
      machineName: 'Machine',
      catalogNo: 'Catalog #',
      manufactureName: 'Manufacturer',
      packSize: 'Pack Size',
      itemTypeName: 'Item Type',
      sampleType: 'Sample Type',
      sampleOption: 'Sample Option',
      dosageForm: 'Dosage Form',
      doctorsName: "Doctor's Name",
      doctorId: 'Doctor ID',
      purchasedUnit: 'Unit',
      hsnCode: 'HSN'
    };
    if (customMap[key]) return customMap[key];
    if (defaultHeader) {
      return defaultHeader.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase()).trim();
    }
    return key;
  };

  const getContextualColumnWidth = (key) => {
    const widthMap = {
      machineName: '80px',
      catalogNo: '95px',
      manufactureName: '125px',
      packSize: '100px',
      itemTypeName: '110px',
      sampleType: '100px',
      sampleOption: '100px',
      dosageForm: '100px',
      doctorsName: '135px',
      doctorId: '85px',
      purchasedUnit: '80px',
      hsnCode: '80px'
    };
    return widthMap[key] || '95px';
  };

  // Derive category-specific columns strictly from verified registry fields
  const getContextualColumns = () => {
    if (!catConfig || !Array.isArray(catConfig.sharedFields)) return [];

    // Map of verified client fieldKeys per category (strictly present in client Excel)
    const categoryKeyMap = {
      'Pharmacy': ['dosageForm', 'strength', 'manufactureName', 'packSize'],
      'Lab Operation': ['machineName', 'catalogNo', 'manufactureName', 'packSize'],
      'Pathology': ['itemTypeName', 'sampleType', 'gender', 'sampleOption'],
      'Service': ['doctorsName', 'doctorId', 'itemTypeName'],
      'Assets': ['itemTypeName', 'manufactureName', 'purchasedUnit', 'packSize', 'hsnCode']
    };

    const targetKeys = categoryKeyMap[category] || [];

    // Strictly resolve against the registry sharedFields to ensure 100% parity
    return targetKeys
      .map((key) => catConfig.sharedFields.find((f) => f.fieldKey === key))
      .filter(Boolean)
      .map((f) => ({
        header: formatColumnHeader(f.fieldKey, f.clientHeader),
        key: f.fieldKey,
        col: f.excelColumn,
        width: getContextualColumnWidth(f.fieldKey)
      }));
  };

  const contextualColumns = getContextualColumns();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', width: '100%' }}>
      {/* Controls Bar */}
      {!hideToolbar && (
        <div style={{
          display: 'flex',
          flexWrap: 'wrap',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '10px',
          padding: '10px 14px',
          background: '#FFFFFF',
          borderRadius: '8px',
          border: '1px solid #E2E8F0',
          boxShadow: '0 1px 2px rgba(0,0,0,0.03)'
        }}>
          {/* Search & Status Filter */}
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px', flex: 1, minWidth: '260px' }}>
            {/* Search Box */}
            <div style={{ position: 'relative', flex: 1, minWidth: '200px', maxWidth: '380px' }}>
              <span style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#94A3B8', display: 'flex' }}>
                <LucideIcon name="search" size={14} />
              </span>
              <input
                type="text"
                placeholder={`Search by code, item name, manufacturer...`}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                style={{
                  width: '100%',
                  padding: '6px 10px 6px 32px',
                  borderRadius: '6px',
                  border: '1px solid #CBD5E1',
                  fontSize: '12px',
                  color: '#1E293B',
                  outline: 'none',
                  boxSizing: 'border-box'
                }}
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch('')}
                  style={{
                    position: 'absolute',
                    right: '8px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'none',
                    border: 'none',
                    color: '#94A3B8',
                    cursor: 'pointer',
                    display: 'flex',
                    padding: '2px'
                  }}
                >
                  <LucideIcon name="x" size={12} />
                </button>
              )}
            </div>

            {/* Status Dropdown */}
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              style={{
                padding: '6px 10px',
                borderRadius: '6px',
                border: '1px solid #CBD5E1',
                fontSize: '12px',
                color: '#334155',
                background: '#FFFFFF',
                cursor: 'pointer',
                outline: 'none'
              }}
            >
              <option value="all">All Statuses</option>
              <option value="ACTIVE">Active Only</option>
              <option value="INACTIVE">Inactive Only</option>
            </select>

            {/* Refresh Button */}
            <button
              type="button"
              onClick={fetchItems}
              disabled={loading}
              title="Refresh List"
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '6px 10px',
                borderRadius: '6px',
                border: '1px solid #CBD5E1',
                background: '#F8FAFC',
                color: '#475569',
                cursor: loading ? 'not-allowed' : 'pointer'
              }}
            >
              <LucideIcon name="refresh-cw" size={14} className={loading ? 'animate-spin' : ''} />
            </button>
          </div>

          {/* Action Button: Create Master Item */}
          <button
            type="button"
            onClick={onCreate}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '7px 14px',
              borderRadius: '6px',
              background: '#2563EB',
              color: '#FFFFFF',
              fontWeight: 700,
              fontSize: '12px',
              border: 'none',
              cursor: 'pointer',
              boxShadow: '0 1px 3px rgba(37,99,235,0.2)'
            }}
          >
            <LucideIcon name="plus" size={14} />
            Add Master Item
          </button>
        </div>
      )}

      {/* Error Banner */}
      {error && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          padding: '10px 14px',
          borderRadius: '8px',
          background: '#FEF2F2',
          border: '1px solid #FCA5A5',
          color: '#991B1B',
          fontSize: '12.5px'
        }}>
          <LucideIcon name="alert-circle" size={16} />
          <span>{error}</span>
          <button
            type="button"
            onClick={fetchItems}
            style={{
              marginLeft: 'auto',
              background: 'none',
              border: 'none',
              textDecoration: 'underline',
              color: '#991B1B',
              cursor: 'pointer',
              fontWeight: 700,
              fontSize: '12px'
            }}
          >
            Retry
          </button>
        </div>
      )}

      {/* Catalog Table */}
      <div style={{
        background: '#FFFFFF',
        borderRadius: '8px',
        border: '1px solid #E2E8F0',
        overflow: 'hidden',
        boxShadow: '0 1px 2px rgba(0,0,0,0.02)',
        display: 'flex',
        flexDirection: 'column'
      }}>
        <div style={{
          overflowX: 'hidden',
          overflowY: 'auto',
          maxHeight: 'calc(100vh - 295px)',
          width: '100%'
        }}>
          <table style={{ width: '100%', tableLayout: 'fixed', borderCollapse: 'collapse', textAlign: 'left', fontSize: '11.5px' }}>
            <thead style={{ position: 'sticky', top: 0, zIndex: 10, background: '#F8FAFC' }}>
              <tr style={{ background: '#F8FAFC', borderBottom: '1px solid #E2E8F0' }}>
                <th style={{ padding: '7px 6px', fontWeight: 700, color: '#475569', width: '78px', whiteSpace: 'nowrap' }}>Item Code</th>
                <th style={{ padding: '7px 6px', fontWeight: 700, color: '#475569', width: '190px', whiteSpace: 'nowrap' }}>Item Name</th>
                <th style={{ padding: '7px 6px', fontWeight: 700, color: '#475569', width: '105px', whiteSpace: 'nowrap' }}>Category</th>
                {catConfig?.hasDepartment && (
                  <th style={{ padding: '7px 6px', fontWeight: 700, color: '#475569', width: '125px', whiteSpace: 'nowrap' }}>Department</th>
                )}
                {contextualColumns.map((col) => (
                  <th key={col.key} style={{ padding: '7px 6px', fontWeight: 700, color: '#475569', width: col.width || '95px', whiteSpace: 'nowrap' }}>
                    {col.header}
                  </th>
                ))}
                <th style={{ padding: '7px 6px', fontWeight: 700, color: '#475569', textAlign: 'center', width: '58px', whiteSpace: 'nowrap' }}>Status</th>
                <th style={{ padding: '7px 6px', fontWeight: 700, color: '#475569', textAlign: 'right', width: '112px', whiteSpace: 'nowrap' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading && items.length === 0 ? (
                <tr>
                  <td colSpan={5 + (catConfig?.hasDepartment ? 1 : 0) + contextualColumns.length} style={{ padding: '48px 16px', textAlign: 'center', color: '#64748B' }}>
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '10px' }}>
                      <LucideIcon name="loader-2" size={20} className="animate-spin" />
                      <span>Loading master items...</span>
                    </div>
                  </td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={5 + (catConfig?.hasDepartment ? 1 : 0) + contextualColumns.length} style={{ padding: '48px 16px', textAlign: 'center' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', color: '#64748B' }}>
                      <LucideIcon name="inbox" size={36} color="#CBD5E1" />
                      <div style={{ fontSize: '15px', fontWeight: 700, color: '#334155' }}>No Master Items Found</div>
                      <div style={{ fontSize: '13px', maxWidth: '400px' }}>
                        {search
                          ? `No items matched your search query "${search}". Try clearing search filters.`
                          : `No items in ${category}${department ? ` (${department})` : ''} yet. Click "Add Master Item" to register the first one.`}
                      </div>
                      {!search && (
                        <button
                          type="button"
                          onClick={onCreate}
                          style={{
                            marginTop: '8px',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '6px',
                            padding: '8px 16px',
                            borderRadius: '6px',
                            background: '#2563EB',
                            color: '#FFFFFF',
                            fontSize: '12px',
                            fontWeight: 700,
                            border: 'none',
                            cursor: 'pointer'
                          }}
                        >
                          <LucideIcon name="plus" size={14} />
                          Add Master Item
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ) : (
                items.map((item, idx) => {
                  const isActive = item.status === 'ACTIVE';
                  const displayName = item.itemName || item.genericName || '-';

                  return (
                    <tr
                      key={item._id || idx}
                      style={{
                        borderBottom: '1px solid #F1F5F9',
                        transition: 'background 0.15s ease'
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = '#F8FAFC')}
                      onMouseLeave={(e) => (e.currentTarget.style.background = '#FFFFFF')}
                    >
                      {/* Item Code */}
                      <td style={{ padding: '6px 6px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        <span style={{
                          fontFamily: 'monospace',
                          fontWeight: 700,
                          fontSize: '11px',
                          color: '#2563EB',
                          background: '#EFF6FF',
                          padding: '2px 5px',
                          borderRadius: '4px'
                        }}>
                          {item.itemCode || '-'}
                        </span>
                      </td>

                      {/* Item Name */}
                      <td style={{ padding: '6px 6px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={`${displayName}${item.brandName ? ` (Brand: ${item.brandName})` : ''}`}>
                        <div style={{ fontWeight: 600, color: '#0F172A', fontSize: '12px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{displayName}</div>
                        {item.brandName && item.brandName !== displayName && (
                          <div style={{ fontSize: '10px', color: '#64748B', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>Brand: {item.brandName}</div>
                        )}
                      </td>

                      {/* Category */}
                      <td style={{ padding: '6px 6px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: '#475569', fontSize: '11.5px' }} title={item.category || item.categoryType || category || '-'}>
                        {item.category || item.categoryType || category || '-'}
                      </td>

                      {/* Department (if applicable) */}
                      {catConfig?.hasDepartment && (
                        <td style={{ padding: '6px 6px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: '#475569', fontSize: '11.5px' }} title={item.department || item.departmentType || department || '-'}>
                          {item.department || item.departmentType || department || '-'}
                        </td>
                      )}

                      {/* Contextual Columns */}
                      {contextualColumns.map((col) => {
                        const val = getItemValue(item, col.key);
                        return (
                          <td
                            key={col.key}
                            style={{
                              padding: '6px 6px',
                              whiteSpace: 'nowrap',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              color: '#334155',
                              fontSize: '11.5px'
                            }}
                            title={val}
                          >
                            {val}
                          </td>
                        );
                      })}

                      {/* Status */}
                      <td style={{ padding: '6px 6px', textAlign: 'center', whiteSpace: 'nowrap' }}>
                        <span style={{
                          fontSize: '10px',
                          fontWeight: 700,
                          padding: '2px 6px',
                          borderRadius: '8px',
                          background: isActive ? '#DCFCE7' : '#FEE2E2',
                          color: isActive ? '#166534' : '#991B1B'
                        }}>
                          {item.status || 'ACTIVE'}
                        </span>
                      </td>

                      {/* Actions */}
                      <td style={{ padding: '6px 6px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                        <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'flex-end', gap: '3px' }}>
                          <button
                            type="button"
                            onClick={() => onView && onView(item)}
                            title="View Item Details"
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              padding: '2px 5px',
                              borderRadius: '4px',
                              border: '1px solid #CBD5E1',
                              background: '#FFFFFF',
                              color: '#334155',
                              cursor: 'pointer',
                              fontSize: '11px',
                              fontWeight: 600
                            }}
                          >
                            <LucideIcon name="eye" size={11} style={{ marginRight: '2px' }} />
                            View
                          </button>
                          <button
                            type="button"
                            onClick={() => onEdit && onEdit(item)}
                            title="Edit Master Item"
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              padding: '2px 5px',
                              borderRadius: '4px',
                              border: '1px solid #93C5FD',
                              background: '#EFF6FF',
                              color: '#1D4ED8',
                              cursor: 'pointer',
                              fontSize: '11px',
                              fontWeight: 600
                            }}
                          >
                            <LucideIcon name="edit-3" size={11} style={{ marginRight: '2px' }} />
                            Edit
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Bar */}
        <div
          data-pagination-bar="true"
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: '10px',
            padding: '6px 14px',
            background: '#F8FAFC',
            borderTop: '1px solid #E2E8F0',
            fontSize: '11.5px',
            color: '#64748B',
            flexShrink: 0,
            position: 'sticky',
            bottom: 0,
            zIndex: 10
          }}
        >
          <div>
            Showing{' '}
            <span style={{ fontWeight: 700, color: '#1E293B' }}>
              {pagination.total > 0 ? (page - 1) * limit + 1 : 0}
            </span>{' '}
            to{' '}
            <span style={{ fontWeight: 700, color: '#1E293B' }}>
              {Math.min(page * limit, pagination.total)}
            </span>{' '}
            of <span style={{ fontWeight: 700, color: '#1E293B' }}>{pagination.total}</span> items
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '12px' }}>Rows per page:</span>
            <select
              value={limit}
              onChange={(e) => {
                setLimit(Number(e.target.value));
                setPage(1);
              }}
              style={{
                padding: '4px 8px',
                borderRadius: '6px',
                border: '1px solid #CBD5E1',
                fontSize: '12px',
                color: '#334155',
                background: '#FFFFFF',
                outline: 'none',
                cursor: 'pointer'
              }}
            >
              <option value="10">10</option>
              <option value="15">15</option>
              <option value="25">25</option>
              <option value="50">50</option>
              <option value="100">100</option>
            </select>

            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginLeft: '8px' }}>
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1 || loading}
                style={{
                  padding: '6px 10px',
                  borderRadius: '6px',
                  border: '1px solid #CBD5E1',
                  background: page <= 1 ? '#F1F5F9' : '#FFFFFF',
                  color: page <= 1 ? '#94A3B8' : '#334155',
                  cursor: page <= 1 ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center'
                }}
              >
                <LucideIcon name="chevron-left" size={14} />
              </button>
              <span style={{ fontSize: '12px', fontWeight: 600, color: '#1E293B', padding: '0 6px' }}>
                Page {page} of {pagination.pages || 1}
              </span>
              <button
                type="button"
                onClick={() => setPage((p) => Math.min(pagination.pages || 1, p + 1))}
                disabled={page >= (pagination.pages || 1) || loading}
                style={{
                  padding: '6px 10px',
                  borderRadius: '6px',
                  border: '1px solid #CBD5E1',
                  background: page >= (pagination.pages || 1) ? '#F1F5F9' : '#FFFFFF',
                  color: page >= (pagination.pages || 1) ? '#94A3B8' : '#334155',
                  cursor: page >= (pagination.pages || 1) ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center'
                }}
              >
                <LucideIcon name="chevron-right" size={14} />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
