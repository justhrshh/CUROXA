/**
 * ============================================================================
 * QUROXA — STOCK MASTER SCHEMA REGISTRY (AUTHORITATIVE SOURCE OF TRUTH)
 * ============================================================================
 * Defines the canonical columns for the Client-Provided Stock Master Excel
 * Workbook (Initial Inventory Import).
 *
 * Rules:
 * 1. Headers are explicit and unambiguous.
 * 2. Item Code is the canonical reference to HospitalMasterConfig / ItemMaster.
 * 3. Buying Price and MRP are captured as commercial values for initial stock.
 * 4. Selling Price is NOT present (Selling Price = MRP - Discount at Dispense).
 * 5. Batch, Expiry, and Quantity are mandatory for physical inventory.
 * 6. Buying Price <= MRP is enforced.
 */

const STOCK_MASTER_COLUMNS = [
  {
    header: 'S.No',
    key: 'sNo',
    required: false,
    type: 'number',
    example: 1,
    description: 'Sequence number'
  },
  {
    header: 'Item Code',
    key: 'itemCode',
    required: true,
    type: 'string',
    example: '980000001',
    description: 'Canonical item code registered in Hospital Item Master'
  },
  {
    header: 'Item Name',
    key: 'itemName',
    required: true,
    type: 'string',
    example: 'Paracetamol 500 mg Tablet',
    description: 'Canonical name of the item'
  },
  {
    header: 'Batch Number',
    key: 'batchNumber',
    required: true,
    type: 'string',
    example: 'BATCH-2026-A1',
    description: 'Manufacturer / Vendor batch number'
  },
  {
    header: 'Expiry Date (YYYY-MM-DD)',
    key: 'expiryDate',
    required: true,
    type: 'date',
    example: '2027-12-31',
    description: 'Expiration date in YYYY-MM-DD format (must be in future)'
  },
  {
    header: 'Manufacturing Date (YYYY-MM-DD)',
    key: 'mfgDate',
    required: false,
    type: 'date',
    example: '2025-01-01',
    description: 'Manufacturing date in YYYY-MM-DD format (cannot be future)'
  },
  {
    header: 'Quantity',
    key: 'quantity',
    required: true,
    type: 'number',
    example: 100,
    description: 'Physical count of units in consumption unit'
  },
  {
    header: 'Unit',
    key: 'unit',
    required: false,
    type: 'string',
    example: 'Tablet',
    description: 'Consumption unit (Tablet, Capsule, Vial, etc.)'
  },
  {
    header: 'Buying Price (Per Unit)',
    key: 'buyingPrice',
    required: true,
    type: 'number',
    example: 18.00,
    description: 'Cost / Purchase rate per unit (Must be <= MRP)'
  },
  {
    header: 'MRP (Per Unit)',
    key: 'mrp',
    required: true,
    type: 'number',
    example: 25.00,
    description: 'Maximum Retail Price per unit'
  },
  {
    header: 'Vendor Name',
    key: 'vendorName',
    required: false,
    type: 'string',
    example: 'Global Pharma Supplies',
    description: 'Supplying vendor name (optional for initial stock)'
  },
  {
    header: 'Storage Location',
    key: 'storageLocation',
    required: false,
    type: 'string',
    example: 'Main Pharmacy - Rack A1',
    description: 'Physical bin/shelf location'
  }
];

module.exports = {
  STOCK_MASTER_COLUMNS
};
