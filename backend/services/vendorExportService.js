const XLSX = require('xlsx');
const GlobalVendor = require('../models/GlobalVendor');
const HospitalVendorAssociation = require('../models/HospitalVendorAssociation');
const { VENDOR_FIELDS } = require('../config/vendorSchemaRegistry');

/**
 * Generates an Excel workbook containing Global or Hospital-associated Vendors
 * matching the 49-column structure and exact headers of Vendor Master.xlsx
 */
async function generateVendorExportWorkbook(queryFilter = {}, options = {}) {
  let vendors = [];
  const tenantId = (typeof options === 'string' ? options : options.tenantId || queryFilter.tenantId) || '';

  if (tenantId) {
    const assocVendorIds = await HospitalVendorAssociation.find({
      tenantId,
      status: 'ACTIVE'
    }).distinct('vendorId');
    vendors = await GlobalVendor.find({ _id: { $in: assocVendorIds } }).sort({ createdAt: -1 }).lean();
  } else {
    const cleanFilter = { ...queryFilter };
    delete cleanFilter.tenantId;
    vendors = await GlobalVendor.find(cleanFilter).sort({ createdAt: -1 }).lean();
  }

  const headers = VENDOR_FIELDS.map(f => f.clientHeader);

  const rows = vendors.map((v, idx) => {
    return VENDOR_FIELDS.map(f => {
      if (f.fieldKey === 'sNo') {
        return v.sNo !== undefined && v.sNo !== null && v.sNo !== '' ? v.sNo : idx + 1;
      }
      const val = v[f.fieldKey];
      if (val === undefined || val === null) return '';
      if (val instanceof Date) return val.toISOString().split('T')[0];
      return String(val);
    });
  });

  let sheetData;
  if (rows.length === 0) {
    const sampleRow = VENDOR_FIELDS.map(f => {
      if (f.fieldKey === 'sNo') return 1;
      if (f.fieldKey === 'activeStatus') return 'Active';
      return '';
    });
    sheetData = [headers, sampleRow];
  } else {
    sheetData = [headers, ...rows];
  }

  const worksheet = XLSX.utils.aoa_to_sheet(sheetData);

  // Set column widths
  worksheet['!cols'] = headers.map(h => ({ wch: Math.max(h.length + 4, 14) }));

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Store Vendor Master');

  const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
  const prefix = tenantId ? `Hospital_${tenantId.replace(/\s+/g, '_')}_` : 'Quroxa_';
  const filename = `${prefix}Vendor_Master_${new Date().toISOString().split('T')[0]}.xlsx`;

  return {
    buffer,
    filename,
    vendorCount: vendors.length
  };
}

module.exports = {
  generateVendorExportWorkbook
};
