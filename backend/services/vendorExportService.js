const XLSX = require('xlsx');
const GlobalVendor = require('../models/GlobalVendor');
const { VENDOR_FIELDS } = require('../config/vendorSchemaRegistry');

/**
 * Generates an Excel workbook containing all Global Vendors
 * matching the 49-column structure and exact headers of Vendor Master.xlsx
 */
async function generateVendorExportWorkbook(queryFilter = {}) {
  const vendors = await GlobalVendor.find(queryFilter).sort({ createdAt: -1 }).lean();

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

  const sheetData = [headers, ...rows];
  const worksheet = XLSX.utils.aoa_to_sheet(sheetData);

  // Set column widths
  worksheet['!cols'] = headers.map(h => ({ wch: Math.max(h.length + 4, 14) }));

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Store Vendor Master');

  const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
  const filename = `Quroxa_Vendor_Master_${new Date().toISOString().split('T')[0]}.xlsx`;

  return {
    buffer,
    filename,
    vendorCount: vendors.length
  };
}

module.exports = {
  generateVendorExportWorkbook
};
