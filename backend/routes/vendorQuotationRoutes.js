const express = require('express');
const mongoose = require('mongoose');
const VendorQuotation = require('../models/VendorQuotation');
const ItemMaster = require('../models/ItemMaster');
const HospitalMasterConfig = require('../models/HospitalMasterConfig');
const GlobalVendor = require('../models/GlobalVendor');
const HospitalVendorAssociation = require('../models/HospitalVendorAssociation');
const Vendor = require('../models/Vendor');
const Counter = require('../models/Counter');
const RoleCoverage = require('../models/RoleCoverage');
const AuditLog = require('../models/AuditLog');
const { verifyToken } = require('../middleware/authMiddleware');

const router = express.Router();
router.use(verifyToken);

/**
 * ============================================================================
 * HELPER: CONCURRENCY-SAFE SEQUENCE GENERATOR FOR VENDOR QUOTATIONS
 * ============================================================================
 * Format: VQ-YYYY-XXXX (e.g. VQ-2026-0001)
 */
async function getNextQuotationNo(tenantId, year = new Date().getFullYear()) {
  const counterKey = `vendor_quotation_${tenantId}_${year}`;

  let counter = await Counter.findOne({ key: counterKey });
  if (!counter) {
    const prefix = `VQ-${year}-`;
    const highest = await VendorQuotation.findOne({
      tenantId,
      quotationNo: new RegExp(`^${prefix}`)
    }).sort({ quotationNo: -1 }).lean();

    let initialSeq = 0;
    if (highest && highest.quotationNo) {
      const parts = highest.quotationNo.split('-');
      if (parts.length >= 3) {
        const parsed = parseInt(parts[2], 10);
        if (!isNaN(parsed)) initialSeq = parsed;
      }
    }
    await Counter.findOneAndUpdate(
      { key: counterKey },
      { $setOnInsert: { seq: initialSeq } },
      { upsert: true }
    );
  }

  let attempts = 0;
  while (attempts < 20) {
    const updatedCounter = await Counter.findOneAndUpdate(
      { key: counterKey },
      { $inc: { seq: 1 } },
      { upsert: true, returnDocument: 'after' }
    );
    const candidateNo = `VQ-${year}-${String(updatedCounter.seq).padStart(4, '0')}`;
    const exists = await VendorQuotation.findOne({ tenantId, quotationNo: candidateNo }).lean();
    if (!exists) {
      return candidateNo;
    }
    attempts++;
  }
  return `VQ-${year}-${Date.now().toString().slice(-4)}`;
}

/**
 * ============================================================================
 * HELPER: AUTHORIZATION CHECK
 * ============================================================================
 */
async function checkQuotationAuthorization(req) {
  if (!req.user) return false;
  const userRole = String(req.user.role || '').toLowerCase();
  if (['admin', 'pharmacy', 'superadmin', 'super_admin', 'procurement'].includes(userRole)) {
    return true;
  }

  const staffId = req.user.staff_id || req.user.id || req.user._id;
  if (!staffId) return false;

  try {
    const coverageDoc = await RoleCoverage.findOne({ tenantId: req.tenantId }).lean();
    if (coverageDoc && coverageDoc.state && coverageDoc.state[staffId]) {
      const grant = coverageDoc.state[staffId]['ph-quotations'] || coverageDoc.state[staffId]['ph-itemmaster'];
      if (grant && grant.on) {
        if (grant.type === 'temp' && grant.expiresAt) {
          return new Date(grant.expiresAt) > new Date();
        }
        return true;
      }
    }
  } catch (err) {
    console.warn('[VENDOR QUOTATION] Role coverage check error:', err.message);
  }
  return false;
}

/**
 * ============================================================================
 * HELPER: VENDOR ELIGIBILITY VALIDATION
 * ============================================================================
 * Verifies that the vendor is associated with the hospital tenant and is Active.
 * Checks GlobalVendor + HospitalVendorAssociation first, then legacy Vendor.
 */
async function validateVendorEligibility(tenantId, vendorId) {
  if (!vendorId || !mongoose.Types.ObjectId.isValid(vendorId)) {
    return { valid: false, error: 'A valid vendor ID is required' };
  }

  // 1. Check GlobalVendor + HospitalVendorAssociation (Phase 2 canonical architecture)
  const association = await HospitalVendorAssociation.findOne({
    tenantId,
    vendorId,
    status: 'ACTIVE'
  }).populate('vendorId').lean();

  if (association && association.vendorId) {
    const gv = association.vendorId;
    const isGvActive = (gv.activeStatus || 'Yes').toLowerCase() === 'yes';
    if (!isGvActive) {
      return { valid: false, error: `Vendor '${gv.supplierName}' is marked Inactive globally.` };
    }
    return {
      valid: true,
      vendor: {
        _id: gv._id,
        name: gv.supplierName,
        code: gv.supplierCode || '',
        gstNo: gv.gstNo || '',
        panCardNo: gv.panCardNo || '',
        isGlobal: true
      }
    };
  }

  // 2. Fallback to legacy Vendor model (backward compatibility)
  const legacyVendor = await Vendor.findOne({
    _id: vendorId,
    tenantId,
    status: 'Active'
  }).lean();

  if (legacyVendor) {
    return {
      valid: true,
      vendor: {
        _id: legacyVendor._id,
        name: legacyVendor.name,
        code: legacyVendor.code || '',
        gstNo: legacyVendor.gstNumber || '',
        panCardNo: legacyVendor.panNumber || '',
        isGlobal: false
      }
    };
  }

  // If vendor exists globally but is NOT associated with this hospital:
  const unassociatedGlobal = await GlobalVendor.findById(vendorId).lean();
  if (unassociatedGlobal) {
    return {
      valid: false,
      error: `Vendor '${unassociatedGlobal.supplierName}' [${unassociatedGlobal.supplierCode}] exists globally but is NOT associated with your hospital. Please associate the vendor first in Vendor Master.`
    };
  }

  return { valid: false, error: 'Referenced vendor not found or not eligible for your hospital.' };
}

/**
 * ============================================================================
 * HELPER: ITEM ELIGIBILITY VALIDATION (HospitalMasterConfig)
 * ============================================================================
 * Strictly validates that the item has been selected and configured for the
 * hospital via HospitalMasterConfig with status === 'Active'.
 */
async function validateItemEligibility(tenantId, itemMasterId) {
  if (!itemMasterId || !mongoose.Types.ObjectId.isValid(itemMasterId)) {
    return { valid: false, error: 'A valid itemMasterId is required.' };
  }

  // 1. Resolve through HospitalMasterConfig
  const config = await HospitalMasterConfig.findOne({
    tenantId,
    masterItemId: itemMasterId,
    status: 'Active'
  }).populate('masterItemId').lean();

  if (config && config.masterItemId) {
    const im = config.masterItemId;
    if (im.status && im.status !== 'Active') {
      return { valid: false, error: `Item '${im.itemName || im.genericName}' (${im.itemCode}) is Inactive in Master catalog.` };
    }
    return {
      valid: true,
      config,
      item: im
    };
  }

  // 2. If item exists in ItemMaster globally but has NOT been selected by hospital:
  const globalItem = await ItemMaster.findById(itemMasterId).lean();
  if (globalItem) {
    return {
      valid: false,
      error: `Item '${globalItem.itemName || globalItem.genericName}' [${globalItem.itemCode}] is not in your hospital's selected catalog (HospitalMasterConfig). Please add the item to your hospital catalog first.`
    };
  }

  return { valid: false, error: 'Referenced Item Master record not found.' };
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. SEARCH ELIGIBLE VENDORS (Hospital-Associated Only)
// ─────────────────────────────────────────────────────────────────────────────
router.get('/eligible-vendors', async (req, res) => {
  try {
    const tenantId = req.tenantId;
    if (!tenantId) {
      return res.status(400).json({ error: 'Valid tenant context required' });
    }

    const { search } = req.query;

    // 1. Fetch active associations
    const associations = await HospitalVendorAssociation.find({
      tenantId,
      status: 'ACTIVE'
    }).populate('vendorId').lean();

    let list = associations
      .filter(a => a.vendorId && (a.vendorId.activeStatus || 'Yes').toLowerCase() === 'yes')
      .map(a => ({
        _id: a.vendorId._id,
        name: a.vendorId.supplierName,
        code: a.vendorId.supplierCode || '',
        category: a.vendorId.supplierCategory || '',
        type: a.vendorId.supplierType || '',
        gstNo: a.vendorId.gstNo || '',
        panCardNo: a.vendorId.panCardNo || '',
        contactPerson: a.vendorId.primaryContactPerson || '',
        mobile: a.vendorId.primaryContactPersonMobileNo || '',
        isGlobal: true
      }));

    // 2. Also include legacy vendors for backward compatibility if any exist without duplicate ID
    const existingIds = new Set(list.map(v => v._id.toString()));
    const legacyVendors = await Vendor.find({ tenantId, status: 'Active' }).lean();
    legacyVendors.forEach(lv => {
      if (!existingIds.has(lv._id.toString())) {
        list.push({
          _id: lv._id,
          name: lv.name,
          code: lv.code || '',
          category: lv.supplierCategory || lv.type || '',
          type: lv.type || '',
          gstNo: lv.gstNumber || '',
          panCardNo: lv.panNumber || '',
          contactPerson: lv.contactPerson || '',
          mobile: lv.phone || '',
          isGlobal: false
        });
      }
    });

    // 3. Search filter
    if (search && search.trim()) {
      const s = search.trim().toLowerCase();
      list = list.filter(v =>
        (v.name && v.name.toLowerCase().includes(s)) ||
        (v.code && v.code.toLowerCase().includes(s)) ||
        (v.gstNo && v.gstNo.toLowerCase().includes(s)) ||
        (v.contactPerson && v.contactPerson.toLowerCase().includes(s))
      );
    }

    list.sort((a, b) => a.name.localeCompare(b.name));

    res.json({
      success: true,
      count: list.length,
      data: list
    });
  } catch (err) {
    console.error('[VENDOR QUOTATION] Eligible vendors error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. SEARCH ELIGIBLE ITEMS (Hospital-Selected Catalog Only)
// ─────────────────────────────────────────────────────────────────────────────
router.get('/eligible-items', async (req, res) => {
  try {
    const tenantId = req.tenantId;
    if (!tenantId) {
      return res.status(400).json({ error: 'Valid tenant context required' });
    }

    const { search, limit = 50 } = req.query;

    const configs = await HospitalMasterConfig.find({
      tenantId,
      status: 'Active'
    })
      .populate('masterItemId')
      .lean();

    let items = configs
      .filter(c => c.masterItemId && (c.masterItemId.status === 'Active' || !c.masterItemId.status))
      .map(c => {
        const im = c.masterItemId;
        return {
          hospitalMasterConfigId: c._id,
          itemMasterId: im._id,
          itemCode: im.itemCode,
          itemName: im.itemName || im.genericName,
          genericName: im.genericName,
          brandName: im.brandName || '',
          category: im.categoryType || c.category || '',
          department: im.departmentType || c.department || '',
          manufacturer: im.manufacturer || '',
          hsnCode: im.hsnCode || '',
          purchasedUnit: im.purchasedUnit || 'Box',
          packSize: im.packSizeDescription || '',
          converterFactor: Number(im.converterFactor) || 1,
          consumptionUnit: im.consumptionUnit || 'Unit',
          defaultGst: Number(im.defaultGst) || 12,
          hospitalCost: Number(c.hospitalCost) || 0,
          hospitalMrp: Number(c.mrp) || 0
        };
      });

    if (search && search.trim()) {
      const s = search.trim().toLowerCase();
      items = items.filter(it =>
        (it.itemCode && it.itemCode.toLowerCase().includes(s)) ||
        (it.itemName && it.itemName.toLowerCase().includes(s)) ||
        (it.genericName && it.genericName.toLowerCase().includes(s)) ||
        (it.brandName && it.brandName.toLowerCase().includes(s)) ||
        (it.manufacturer && it.manufacturer.toLowerCase().includes(s))
      );
    }

    const limited = items.slice(0, Math.min(200, parseInt(limit, 10) || 50));

    res.json({
      success: true,
      count: limited.length,
      data: limited
    });
  } catch (err) {
    console.error('[VENDOR QUOTATION] Eligible items error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. VALIDATE VENDOR ENDPOINT
// ─────────────────────────────────────────────────────────────────────────────
router.get('/validate-vendor/:vendorId', async (req, res) => {
  try {
    const result = await validateVendorEligibility(req.tenantId, req.params.vendorId);
    if (!result.valid) {
      return res.status(400).json({ success: false, error: result.error });
    }
    res.json({ success: true, vendor: result.vendor });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. VALIDATE ITEM ENDPOINT
// ─────────────────────────────────────────────────────────────────────────────
router.get('/validate-item/:itemMasterId', async (req, res) => {
  try {
    const result = await validateItemEligibility(req.tenantId, req.params.itemMasterId);
    if (!result.valid) {
      return res.status(400).json({ success: false, error: result.error });
    }
    res.json({ success: true, item: result.item, config: result.config });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. GET /api/vendor-quotations — List hospital quotations
// ─────────────────────────────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const query = { tenantId: req.tenantId };
    const {
      search,
      vendorId,
      itemMasterId,
      status,
      expired
    } = req.query;

    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(2000, Math.max(1, parseInt(req.query.limit, 10) || 50));

    if (vendorId) query.vendorId = vendorId;
    if (itemMasterId) query.itemMasterId = itemMasterId;
    if (status && status !== 'all') query.status = status;

    if (expired === 'true') {
      query.validTill = { $lt: new Date() };
    } else if (expired === 'false') {
      query.validTill = { $gte: new Date() };
    }

    if (search && search.trim()) {
      const s = search.trim();
      const escaped = s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const searchRegex = new RegExp(escaped, 'i');
      query.$or = [
        { quotationNo: searchRegex },
        { referenceNo: searchRegex },
        { vendorName: searchRegex },
        { vendorCode: searchRegex },
        { genericName: searchRegex },
        { brandName: searchRegex },
        { itemCode: searchRegex }
      ];
    }

    const total = await VendorQuotation.countDocuments(query);
    const quotations = await VendorQuotation.find(query)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean();

    return res.json({
      success: true,
      data: quotations,
      pagination: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit) || 1
      }
    });
  } catch (err) {
    console.error('[VENDOR QUOTATION] List error:', err);
    return res.status(500).json({ success: false, message: 'Server error listing vendor quotations', error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. GET /api/vendor-quotations/active-for-item/:itemMasterId
// ─────────────────────────────────────────────────────────────────────────────
router.get('/active-for-item/:itemMasterId', async (req, res) => {
  try {
    const { itemMasterId } = req.params;
    const now = new Date();

    const quotations = await VendorQuotation.find({
      tenantId: req.tenantId,
      itemMasterId,
      status: 'Active',
      validTill: { $gte: now },
      $or: [
        { effectiveFrom: { $exists: false } },
        { effectiveFrom: null },
        { effectiveFrom: { $lte: now } }
      ]
    }).sort({ netEffectiveRate: 1 }).lean();

    return res.json({ success: true, data: quotations });
  } catch (err) {
    console.error('[VENDOR QUOTATION] Active for item lookup error:', err);
    return res.status(500).json({ success: false, message: 'Failed to fetch active quotations for item', error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// 7. GET /api/vendor-quotations/:id — Single quotation detail
// ─────────────────────────────────────────────────────────────────────────────
router.get('/:id', async (req, res) => {
  try {
    const quotation = await VendorQuotation.findOne({
      _id: req.params.id,
      tenantId: req.tenantId
    }).lean();

    if (!quotation) {
      return res.status(404).json({ success: false, message: 'Vendor quotation not found' });
    }
    return res.json({ success: true, data: quotation });
  } catch (err) {
    console.error('[VENDOR QUOTATION] Detail error:', err);
    return res.status(500).json({ success: false, message: 'Server error fetching quotation', error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// 8. POST /api/vendor-quotations — Create new vendor quotation (Single or Multi-line)
// ─────────────────────────────────────────────────────────────────────────────
router.post('/', async (req, res) => {
  try {
    const authorized = await checkQuotationAuthorization(req);
    if (!authorized) {
      return res.status(403).json({
        success: false,
        error: 'Forbidden: Insufficient permissions to manage vendor quotations'
      });
    }

    const {
      vendorId,
      quotationNo: providedQuotationNo,
      referenceNo = '',
      validFrom,
      validTill,
      leadTimeDays = 3,
      minimumOrderQty = 1,
      termsAndConditions = '',
      termsList = [],
      supplierState = '',
      supplierAddress = '',
      supplierType = '',
      gstNo = '',
      deliveryState = '',
      centreType = '',
      centre = '',
      deliveryLocation = '',
      machine: defaultMachine = '',
      quotationDocUrl = '',
      documents = [],
      status = 'Active',
      supersedePrevious = true,
      items: incomingItems,
      // Single line direct fields fallback:
      itemMasterId,
      ratePerPurchasedUnit,
      discountPercent = 0,
      gstPercent = 0,
      mrp = 0
    } = req.body;

    const tenantId = req.tenantId;
    if (!tenantId) {
      return res.status(400).json({ success: false, error: 'Valid hospital tenant context required' });
    }

    // 1. SERVER-SIDE VENDOR ELIGIBILITY VALIDATION
    const vendorCheck = await validateVendorEligibility(tenantId, vendorId);
    if (!vendorCheck.valid) {
      return res.status(400).json({ success: false, error: vendorCheck.error });
    }
    const vendor = vendorCheck.vendor;

    // 2. VALIDITY CHECKS
    if (!validTill) {
      return res.status(400).json({ success: false, error: 'Validity end date (validTill) is required' });
    }
    const parsedValidTill = new Date(validTill);
    if (isNaN(parsedValidTill.getTime())) {
      return res.status(400).json({ success: false, error: 'Invalid validTill date' });
    }

    const parsedEffectiveFrom = validFrom ? new Date(validFrom) : new Date();

    // 3. NORMALIZE ITEMS LIST
    let itemsToProcess = [];
    if (Array.isArray(incomingItems) && incomingItems.length > 0) {
      itemsToProcess = incomingItems;
    } else if (itemMasterId) {
      itemsToProcess = [{
        itemMasterId,
        ratePerPurchasedUnit,
        discountPercent,
        gstPercent,
        mrp,
        leadTimeDays,
        minimumOrderQty
      }];
    } else {
      return res.status(400).json({
        success: false,
        error: 'At least one item is required in the quotation'
      });
    }

    // 4. PREVENT DUPLICATE ITEMS WITHIN THIS QUOTATION SUBMISSION
    const seenItemIds = new Set();
    for (let i = 0; i < itemsToProcess.length; i++) {
      const it = itemsToProcess[i];
      const sId = String(it.itemMasterId);
      if (seenItemIds.has(sId)) {
        return res.status(400).json({
          success: false,
          error: `Duplicate item found in quotation lines at row #${i + 1}. Each item can only be added once per quotation.`
        });
      }
      seenItemIds.add(sId);
    }

    // Determine Quotation Number
    const quotationNo = providedQuotationNo && providedQuotationNo.trim()
      ? providedQuotationNo.trim().toUpperCase()
      : await getNextQuotationNo(tenantId);

    const createdRecords = [];

    // 5. PROCESS AND VALIDATE EACH ITEM AGAINST HospitalMasterConfig
    for (let i = 0; i < itemsToProcess.length; i++) {
      const line = itemsToProcess[i];
      const pRate = Number(line.ratePerPurchasedUnit);

      if (!Number.isFinite(pRate) || pRate <= 0) {
        return res.status(400).json({
          success: false,
          error: `Rate per purchased unit must be greater than zero for item row #${i + 1}`
        });
      }

      // SERVER-SIDE ITEM ELIGIBILITY VALIDATION (Must be active in HospitalMasterConfig)
      const itemCheck = await validateItemEligibility(tenantId, line.itemMasterId);
      if (!itemCheck.valid) {
        return res.status(400).json({
          success: false,
          error: `Item row #${i + 1}: ${itemCheck.error}`
        });
      }

      const { item, config } = itemCheck;

      // Extract canonical values
      const pUnit = line.purchasedUnit || item.purchasedUnit || 'Box';
      const cFactor = Number(line.converterFactor) > 0 ? Number(line.converterFactor) : (Number(item.converterFactor) || 1);
      const cUnit = line.consumptionUnit || item.consumptionUnit || 'Unit';
      const packSize = line.packSize || item.packSizeDescription || '';

      const disc = Math.max(0, Math.min(100, Number(line.discountPercent) || 0));
      const gst = Math.max(0, Math.min(100, line.gstPercent !== undefined ? Number(line.gstPercent) : (item.defaultGst ?? 12)));
      const lineMrp = Number(line.mrp) >= 0 ? Number(line.mrp) : 0;

      // Rate derivations
      const netRatePurchased = pRate * (1 - disc / 100) * (1 + gst / 100);
      const ratePerConsUnit = pRate / cFactor;
      const netEffective = netRatePurchased / cFactor;

      // If requested, mark previous active quotation for this specific vendor + item as Superseded
      if (supersedePrevious) {
        await VendorQuotation.updateMany(
          {
            tenantId,
            vendorId: vendor._id,
            itemMasterId: item._id,
            status: 'Active'
          },
          { $set: { status: 'Superseded' } }
        );
      }

      const quoteDoc = new VendorQuotation({
        tenantId,
        quotationNo,
        referenceNo: referenceNo.trim(),
        vendorId: vendor._id,
        vendorName: vendor.name,
        vendorCode: vendor.code || '',
        itemMasterId: item._id,
        hospitalMasterConfigId: config._id,
        itemCode: item.itemCode,
        genericName: item.genericName,
        brandName: (line.brandName || item.brandName || '').trim(),
        category: item.categoryType || config.category || '',
        department: item.departmentType || config.department || '',
        manufacturer: item.manufacturer || '',
        hsnCode: item.hsnCode || '',
        purchasedUnit: pUnit,
        packSize,
        converterFactor: cFactor,
        consumptionUnit: cUnit,
        ratePerPurchasedUnit: Number(pRate.toFixed(4)),
        mrp: Number(lineMrp.toFixed(2)),
        ratePerConsumptionUnit: Number(ratePerConsUnit.toFixed(4)),
        supplierState: supplierState || vendor.state || '',
        supplierAddress: supplierAddress || vendor.address || '',
        supplierType: supplierType || vendor.type || '',
        gstNo: gstNo || vendor.gstNo || '',
        deliveryState: deliveryState || '',
        centreType: centreType || '',
        centre: centre || '',
        deliveryLocation: deliveryLocation || '',
        catalogNo: line.catalogNo || '',
        machine: line.machine || defaultMachine || '',
        discountPercent: disc,
        discountAmount: Number(line.discountAmount) || Number((pRate * (disc / 100)).toFixed(2)),
        igstPercent: Number(line.igstPercent || 0),
        cgstPercent: Number(line.cgstPercent || 0),
        sgstPercent: Number(line.sgstPercent || 0),
        gstPercent: gst,
        gstAmount: Number(line.gstAmount) || Number(((pRate * (1 - disc / 100)) * (gst / 100)).toFixed(2)),
        netRatePerPurchasedUnit: Number(netRatePurchased.toFixed(4)),
        netEffectiveRate: Number(netEffective.toFixed(4)),
        leadTimeDays: Number(line.leadTimeDays || leadTimeDays) || 3,
        minimumOrderQty: Number(line.minimumOrderQty || minimumOrderQty) || 1,
        effectiveFrom: parsedEffectiveFrom,
        validTill: parsedValidTill,
        status,
        quotationDocUrl: quotationDocUrl || '',
        documents: Array.isArray(documents) ? documents : [],
        termsAndConditions: termsAndConditions.trim(),
        termsList: Array.isArray(termsList) ? termsList : [],
        createdBy: req.user?.name || req.user?.username || 'System',
        createdByRole: req.user?.role || ''
      });

      await quoteDoc.save();
      createdRecords.push(quoteDoc);
    }

    // Audit Log
    try {
      await AuditLog.create({
        tenantId,
        action: 'CREATE_VENDOR_QUOTATION',
        module: 'Procurement',
        performedBy: req.user?.staff_id || req.user?.id || 'system',
        details: {
          quotationNo,
          referenceNo,
          vendorName: vendor.name,
          itemCount: createdRecords.length,
          items: createdRecords.map(r => ({ itemCode: r.itemCode, rate: r.ratePerPurchasedUnit, netEffectiveRate: r.netEffectiveRate }))
        }
      });
    } catch (_) {}

    // Emit Realtime event
    try {
      const io = req.app.get('io');
      if (io && tenantId) {
        io.to(tenantId.toLowerCase()).emit('vendor_quotation_created', {
          quotationNo,
          count: createdRecords.length
        });
      }
    } catch (_) {}

    return res.status(201).json({
      success: true,
      message: `Vendor quotation ${quotationNo} recorded with ${createdRecords.length} item(s)`,
      data: createdRecords.length === 1 ? createdRecords[0] : createdRecords,
      records: createdRecords
    });
  } catch (err) {
    console.error('[VENDOR QUOTATION] Creation error:', err);
    if (err.code === 11000) {
      return res.status(409).json({
        success: false,
        error: 'Duplicate line item detected: this quotation already contains this item.'
      });
    }
    return res.status(500).json({
      success: false,
      error: err.message || 'Server error creating vendor quotation'
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// 9. PUT /api/vendor-quotations/:id — Update existing quotation line
// ─────────────────────────────────────────────────────────────────────────────
router.put('/:id', async (req, res) => {
  try {
    const authorized = await checkQuotationAuthorization(req);
    if (!authorized) {
      return res.status(403).json({
        success: false,
        error: 'Forbidden: Insufficient permissions to update vendor quotation'
      });
    }

    const quotation = await VendorQuotation.findOne({
      _id: req.params.id,
      tenantId: req.tenantId
    });

    if (!quotation) {
      return res.status(404).json({ success: false, error: 'Vendor quotation not found' });
    }

    // 1. Re-validate vendor association
    const targetVendorId = req.body.vendorId || quotation.vendorId;
    const vendorCheck = await validateVendorEligibility(req.tenantId, targetVendorId);
    if (!vendorCheck.valid) {
      return res.status(400).json({ success: false, error: vendorCheck.error });
    }

    // 2. Re-validate item eligibility against HospitalMasterConfig
    const targetItemMasterId = req.body.itemMasterId || quotation.itemMasterId;
    const itemCheck = await validateItemEligibility(req.tenantId, targetItemMasterId);
    if (!itemCheck.valid) {
      return res.status(400).json({ success: false, error: itemCheck.error });
    }

    const { item, config } = itemCheck;

    // Updatable fields
    const updatable = [
      'referenceNo',
      'brandName',
      'purchasedUnit',
      'packSize',
      'converterFactor',
      'ratePerPurchasedUnit',
      'mrp',
      'discountPercent',
      'gstPercent',
      'leadTimeDays',
      'minimumOrderQty',
      'validTill',
      'effectiveFrom',
      'status',
      'quotationDocUrl',
      'termsAndConditions'
    ];

    updatable.forEach((field) => {
      if (req.body[field] !== undefined) {
        quotation[field] = req.body[field];
      }
    });

    // Update canonical references if changed
    quotation.vendorId = vendorCheck.vendor._id;
    quotation.vendorName = vendorCheck.vendor.name;
    quotation.vendorCode = vendorCheck.vendor.code || '';
    quotation.itemMasterId = item._id;
    quotation.hospitalMasterConfigId = config._id;
    quotation.itemCode = item.itemCode;
    quotation.genericName = item.genericName;
    quotation.category = item.categoryType || config.category || quotation.category;
    quotation.department = item.departmentType || config.department || quotation.department;
    quotation.manufacturer = item.manufacturer || quotation.manufacturer;

    // Recalculate derived rates
    const cFactor = Number(quotation.converterFactor) > 0 ? Number(quotation.converterFactor) : 1;
    const pRate = Number(quotation.ratePerPurchasedUnit) || 0;
    const disc = Math.max(0, Math.min(100, Number(quotation.discountPercent) || 0));
    const gst = Math.max(0, Math.min(100, Number(quotation.gstPercent) || 0));

    const netRatePurchased = pRate * (1 - disc / 100) * (1 + gst / 100);
    quotation.ratePerConsumptionUnit = Number((pRate / cFactor).toFixed(4));
    quotation.netRatePerPurchasedUnit = Number(netRatePurchased.toFixed(4));
    quotation.netEffectiveRate = Number((netRatePurchased / cFactor).toFixed(4));

    await quotation.save();

    // Audit log
    try {
      await AuditLog.create({
        tenantId: req.tenantId,
        action: 'UPDATE_VENDOR_QUOTATION',
        module: 'Procurement',
        performedBy: req.user?.staff_id || req.user?.id || 'system',
        details: {
          quotationNo: quotation.quotationNo,
          vendorName: quotation.vendorName,
          itemCode: quotation.itemCode,
          netEffectiveRate: quotation.netEffectiveRate,
          status: quotation.status
        }
      });
    } catch (_) {}

    return res.json({
      success: true,
      message: 'Vendor quotation updated successfully',
      data: quotation
    });
  } catch (err) {
    console.error('[VENDOR QUOTATION] Update error:', err);
    return res.status(500).json({
      success: false,
      error: err.message || 'Server error updating vendor quotation'
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// 10. PUT /api/vendor-quotations/:id/toggle-status
// ─────────────────────────────────────────────────────────────────────────────
router.put('/:id/toggle-status', async (req, res) => {
  try {
    const authorized = await checkQuotationAuthorization(req);
    if (!authorized) {
      return res.status(403).json({
        success: false,
        error: 'Forbidden: Insufficient permissions'
      });
    }

    const { status } = req.body;
    if (!status || !['Active', 'Expired', 'Superseded', 'Pending_Approval', 'Draft'].includes(status)) {
      return res.status(400).json({ success: false, error: 'Valid status is required' });
    }

    const quotation = await VendorQuotation.findOne({
      _id: req.params.id,
      tenantId: req.tenantId
    });

    if (!quotation) {
      return res.status(404).json({ success: false, error: 'Vendor quotation not found' });
    }

    quotation.status = status;
    await quotation.save();

    return res.json({
      success: true,
      message: `Quotation status updated to ${status}`,
      data: quotation
    });
  } catch (err) {
    console.error('[VENDOR QUOTATION] Status update error:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
