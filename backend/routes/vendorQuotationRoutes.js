const express = require('express');
const VendorQuotation = require('../models/VendorQuotation');
const ItemMaster = require('../models/ItemMaster');
const Vendor = require('../models/Vendor');
const Counter = require('../models/Counter');
const RoleCoverage = require('../models/RoleCoverage');
const AuditLog = require('../models/AuditLog');
const { verifyToken } = require('../middleware/authMiddleware');

const router = express.Router();
router.use(verifyToken);

/**
 * Concurrency-safe sequence generator for Vendor Quotations
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
      if (parts.length === 3) {
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
 * Role coverage & authorization check for Vendor Quotations
 */
async function checkQuotationAuthorization(req) {
  if (!req.user) return false;
  const userRole = String(req.user.role || '').toLowerCase();
  if (['admin', 'pharmacy', 'superadmin', 'super_admin'].includes(userRole)) {
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

// GET /api/vendor-quotations — List quotations with server-side pagination & filters
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
        pages: Math.ceil(total / limit)
      }
    });
  } catch (err) {
    console.error('[VENDOR QUOTATION] List error:', err);
    return res.status(500).json({ success: false, message: 'Server error listing vendor quotations', error: err.message });
  }
});

// GET /api/vendor-quotations/active-for-item/:itemMasterId — Fetch active quotations for an item
router.get('/active-for-item/:itemMasterId', async (req, res) => {
  try {
    const { itemMasterId } = req.params;
    const now = new Date();

    const quotations = await VendorQuotation.find({
      tenantId: req.tenantId,
      itemMasterId,
      status: 'Active',
      validTill: { $gte: now }
    }).sort({ netEffectiveRate: 1 }).lean();

    return res.json({ success: true, data: quotations });
  } catch (err) {
    console.error('[VENDOR QUOTATION] Active for item lookup error:', err);
    return res.status(500).json({ success: false, message: 'Failed to fetch active quotations for item', error: err.message });
  }
});

// GET /api/vendor-quotations/:id — Get single quotation
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

// POST /api/vendor-quotations — Create new vendor quotation
router.post('/', async (req, res) => {
  try {
    const authorized = await checkQuotationAuthorization(req);
    if (!authorized) {
      return res.status(403).json({
        success: false,
        message: 'Forbidden: Insufficient permissions to manage vendor quotations'
      });
    }

    const {
      vendorId,
      itemMasterId,
      purchasedUnit,
      packSize,
      converterFactor,
      ratePerPurchasedUnit,
      discountPercent = 0,
      gstPercent = 0,
      leadTimeDays = 3,
      minimumOrderQty = 1,
      validTill,
      termsAndConditions,
      quotationDocUrl,
      supersedePrevious = true
    } = req.body;

    if (!vendorId || !itemMasterId) {
      return res.status(400).json({
        success: false,
        message: 'Vendor and Item Master references are required'
      });
    }

    if (!ratePerPurchasedUnit || Number(ratePerPurchasedUnit) <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Rate per purchased unit must be greater than zero'
      });
    }

    if (!validTill) {
      return res.status(400).json({
        success: false,
        message: 'Validity end date (validTill) is required'
      });
    }

    // Lookup Item Master (matches hospital-scoped OR global catalog item)
    const item = await ItemMaster.findOne({
      _id: itemMasterId,
      $or: [{ tenantId: req.tenantId }, { scope: 'GLOBAL' }]
    });
    if (!item) {
      return res.status(404).json({ success: false, message: 'Referenced Item Master not found' });
    }

    // Lookup Vendor
    const vendor = await Vendor.findOne({ _id: vendorId, tenantId: req.tenantId });
    if (!vendor) {
      return res.status(404).json({ success: false, message: 'Referenced Vendor not found' });
    }

    const pUnit = purchasedUnit || item.purchasedUnit || 'Box';
    const cFactor = Number(converterFactor) > 0 ? Number(converterFactor) : (item.converterFactor || 1);
    const pRate = Number(ratePerPurchasedUnit);
    const disc = Math.max(0, Math.min(100, Number(discountPercent) || 0));
    const gst = Math.max(0, Math.min(100, Number(gstPercent) || (item.defaultGst ?? 12)));

    // Calculation formulas
    const netRatePurchased = pRate * (1 - disc / 100) * (1 + gst / 100);
    const ratePerConsUnit = pRate / cFactor;
    const netEffective = netRatePurchased / cFactor;

    // Concurrency-safe quotation number
    const quotationNo = await getNextQuotationNo(req.tenantId);

    // If requested, mark previous active quotation as Superseded
    if (supersedePrevious) {
      await VendorQuotation.updateMany(
        {
          tenantId: req.tenantId,
          vendorId: vendor._id,
          itemMasterId: item._id,
          status: 'Active'
        },
        { $set: { status: 'Superseded' } }
      );
    }

    const newQuotation = new VendorQuotation({
      tenantId: req.tenantId,
      quotationNo,
      vendorId: vendor._id,
      vendorName: vendor.name,
      vendorCode: vendor.code || '',
      itemMasterId: item._id,
      itemCode: item.itemCode,
      genericName: item.genericName,
      brandName: req.body.brandName || item.brandName || '',
      purchasedUnit: pUnit,
      packSize: packSize || item.packSizeDescription || '',
      converterFactor: cFactor,
      ratePerPurchasedUnit: pRate,
      ratePerConsumptionUnit: Number(ratePerConsUnit.toFixed(4)),
      discountPercent: disc,
      gstPercent: gst,
      netRatePerPurchasedUnit: Number(netRatePurchased.toFixed(4)),
      netEffectiveRate: Number(netEffective.toFixed(4)),
      leadTimeDays: Number(leadTimeDays) || 3,
      minimumOrderQty: Number(minimumOrderQty) || 1,
      validTill: new Date(validTill),
      status: 'Active',
      quotationDocUrl: quotationDocUrl || '',
      termsAndConditions: termsAndConditions || '',
      createdBy: req.user.name || req.user.username || 'System'
    });

    await newQuotation.save();

    // Audit log
    await AuditLog.create({
      tenantId: req.tenantId,
      action: 'CREATE_VENDOR_QUOTATION',
      module: 'Procurement',
      performedBy: req.user.id || req.user._id,
      details: {
        quotationNo: newQuotation.quotationNo,
        vendorName: newQuotation.vendorName,
        itemCode: newQuotation.itemCode,
        ratePerPurchasedUnit: newQuotation.ratePerPurchasedUnit,
        netEffectiveRate: newQuotation.netEffectiveRate
      }
    }).catch(err => console.warn('[AUDIT LOG ERROR]', err.message));

    // Real-time socket broadcast
    try {
      const io = req.app.get('io');
      if (io && req.tenantId) {
        io.to(req.tenantId.toLowerCase()).emit('vendor_quotation_created', newQuotation);
      }
    } catch (e) {
      console.warn('[SOCKET BROADCAST ERROR]', e.message);
    }

    return res.status(201).json({
      success: true,
      message: 'Vendor quotation created successfully',
      data: newQuotation
    });
  } catch (err) {
    console.error('[VENDOR QUOTATION] Creation error:', err);
    return res.status(500).json({
      success: false,
      message: 'Server error creating vendor quotation',
      error: err.message
    });
  }
});

// PUT /api/vendor-quotations/:id — Update vendor quotation
router.put('/:id', async (req, res) => {
  try {
    const authorized = await checkQuotationAuthorization(req);
    if (!authorized) {
      return res.status(403).json({
        success: false,
        message: 'Forbidden: Insufficient permissions to update vendor quotation'
      });
    }

    const quotation = await VendorQuotation.findOne({
      _id: req.params.id,
      tenantId: req.tenantId
    });

    if (!quotation) {
      return res.status(404).json({ success: false, message: 'Vendor quotation not found' });
    }

    const updatable = [
      'brandName',
      'purchasedUnit',
      'packSize',
      'converterFactor',
      'ratePerPurchasedUnit',
      'discountPercent',
      'gstPercent',
      'leadTimeDays',
      'minimumOrderQty',
      'validTill',
      'status',
      'quotationDocUrl',
      'termsAndConditions'
    ];

    updatable.forEach((field) => {
      if (req.body[field] !== undefined) {
        quotation[field] = req.body[field];
      }
    });

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
    await AuditLog.create({
      tenantId: req.tenantId,
      action: 'UPDATE_VENDOR_QUOTATION',
      module: 'Procurement',
      performedBy: req.user.id || req.user._id,
      details: {
        quotationNo: quotation.quotationNo,
        vendorName: quotation.vendorName,
        itemCode: quotation.itemCode,
        netEffectiveRate: quotation.netEffectiveRate,
        status: quotation.status
      }
    }).catch(err => console.warn('[AUDIT LOG ERROR]', err.message));

    // Real-time socket broadcast
    try {
      const io = req.app.get('io');
      if (io && req.tenantId) {
        io.to(req.tenantId.toLowerCase()).emit('vendor_quotation_updated', quotation);
      }
    } catch (e) {
      console.warn('[SOCKET BROADCAST ERROR]', e.message);
    }

    return res.json({
      success: true,
      message: 'Vendor quotation updated successfully',
      data: quotation
    });
  } catch (err) {
    console.error('[VENDOR QUOTATION] Update error:', err);
    return res.status(500).json({
      success: false,
      message: 'Server error updating vendor quotation',
      error: err.message
    });
  }
});

// PUT /api/vendor-quotations/:id/toggle-status — Change quotation status
router.put('/:id/toggle-status', async (req, res) => {
  try {
    const authorized = await checkQuotationAuthorization(req);
    if (!authorized) {
      return res.status(403).json({
        success: false,
        message: 'Forbidden: Insufficient permissions'
      });
    }

    const { status } = req.body;
    if (!status || !['Active', 'Expired', 'Superseded', 'Pending_Approval'].includes(status)) {
      return res.status(400).json({ success: false, message: 'Valid status is required' });
    }

    const quotation = await VendorQuotation.findOne({
      _id: req.params.id,
      tenantId: req.tenantId
    });

    if (!quotation) {
      return res.status(404).json({ success: false, message: 'Vendor quotation not found' });
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
    return res.status(500).json({ success: false, message: 'Server error updating status', error: err.message });
  }
});

module.exports = router;
