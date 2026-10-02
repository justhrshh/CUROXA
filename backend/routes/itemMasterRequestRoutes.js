const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const ItemMasterRequest = require('../models/ItemMasterRequest');
const ItemMaster = require('../models/ItemMaster');
const HospitalMasterConfig = require('../models/HospitalMasterConfig');
const Counter = require('../models/Counter');
const AuditLog = require('../models/AuditLog');
const SuperAdminAudit = require('../models/SuperAdminAudit');
const { verifyToken, isSuperAdmin } = require('../middleware/authMiddleware');
const { getCategoryConfig } = require('../config/masterSchemaRegistry');
const { getNextMasterItemCode } = require('../utils/masterItemCodeGenerator');

router.use(verifyToken);

// ── Atomic Session Transaction Helper ─────────────────────────────────────────
async function runInTransaction(workFn) {
  const isProduction = process.env.NODE_ENV === 'production';
  let session = null;
  try {
    session = await mongoose.startSession();
    session.startTransaction({
      readConcern: { level: 'snapshot' },
      writeConcern: { w: 'majority' }
    });
    const result = await workFn(session);
    await session.commitTransaction();
    return result;
  } catch (err) {
    if (session && session.inTransaction()) {
      await session.abortTransaction();
    }
    // Check if MongoDB deployment does not support transactions (standalone instance)
    if (err.message && err.message.includes('Transaction numbers are only allowed on a replica set member or mongos')) {
      if (isProduction) {
        throw new Error('FATAL: Production database must support multi-document replica set transactions.');
      }
      console.warn('[WARN-DEV-ONLY] Non-transactional fallback active — standalone MongoDB detected. Enable replica set for full ACID guarantees.');
      return await workFn(null);
    }
    throw err;
  } finally {
    if (session) {
      session.endSession();
    }
  }
}

// ── Sequence generator for Request Number ─────────────────────────────────────
async function getNextRequestNo(year = new Date().getFullYear()) {
  const key = `item_request_${year}`;
  let counter = await Counter.findOne({ key });
  if (!counter) {
    const highest = await ItemMasterRequest.findOne({
      requestNo: new RegExp(`^IMR-${year}-`)
    }).sort({ requestNo: -1 }).lean();
    let init = 0;
    if (highest && highest.requestNo) {
      const p = highest.requestNo.split('-');
      if (p.length === 3) { const n = parseInt(p[2], 10); if (!isNaN(n)) init = n; }
    }
    await Counter.findOneAndUpdate({ key }, { $setOnInsert: { seq: init } }, { upsert: true });
  }
  for (let i = 0; i < 20; i++) {
    const c = await Counter.findOneAndUpdate({ key }, { $inc: { seq: 1 } }, { upsert: true, returnDocument: 'after' });
    const candidate = `IMR-${year}-${String(c.seq).padStart(4, '0')}`;
    const exists = await ItemMasterRequest.findOne({ requestNo: candidate }).lean();
    if (!exists) return candidate;
  }
  return `IMR-${year}-${Date.now().toString().slice(-4)}`;
}

// ── Price resolution helper (0 is a valid numeric value) ──────────────────────
function resolveApprovedPrice(approvedVal, requestedVal) {
  if (approvedVal !== null && approvedVal !== undefined && approvedVal !== '') {
    return Number(approvedVal);
  }
  if (requestedVal !== null && requestedVal !== undefined && requestedVal !== '') {
    return Number(requestedVal);
  }
  return 0;
}

// ── Normalize string for duplicate search ────────────────────────────────────
function normalize(s) {
  return (s || '').toLowerCase().replace(/\s+/g, ' ').replace(/\s*(\d+)\s*/g, '$1').trim();
}

// ─────────────────────────────────────────────────────────────────────────────
// HOSPITAL & SHARED ROUTES
// ─────────────────────────────────────────────────────────────────────────────

/**
 * GET /api/item-requests
 * Query requests. Hospital users can ONLY view requests for their own tenantId.
 * SuperAdmin can view all requests across all tenants.
 */
router.get('/', async (req, res) => {
  try {
    const isAdmin = ['superadmin', 'super_admin', 'platform_admin'].includes((req.user?.role || '').toLowerCase());
    const query = isAdmin ? {} : { tenantId: req.tenantId };
    const { status, search, requestType, category } = req.query;
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 25));

    if (status && status !== 'all') query.status = status;
    if (requestType && requestType !== 'all') query.requestType = requestType;
    if (category && category !== 'all') query.category = category;
    if (search && search.trim()) {
      const r = new RegExp(search.trim().replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&'), 'i');
      query.$or = [
        { requestNo: r },
        { hospitalName: r },
        { 'proposedItem.itemName': r },
        { 'proposedItem.genericName': r },
        { 'proposedItem.brandName': r },
        { 'categoryData.itemName': r }
      ];
    }

    const skip = (page - 1) * limit;
    const [data, total] = await Promise.all([
      ItemMasterRequest.find(query)
        .populate('masterItemId', 'itemCode itemName genericName brandName category department')
        .populate('approvedItemMasterId', 'itemCode itemName genericName brandName')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      ItemMasterRequest.countDocuments(query)
    ]);

    res.json({
      success: true,
      data,
      pagination: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit) || 1
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/item-requests/check-duplicate
 * Check if an item is already assigned or already pending approval for the current hospital
 */
router.get('/check-duplicate', async (req, res) => {
  try {
    const tenantId = req.query.tenantId || req.tenantId;
    const { masterItemId } = req.query;

    if (!tenantId) {
      return res.status(400).json({ error: 'tenantId is required' });
    }

    let alreadyConfigured = false;
    let pendingRequest = null;

    if (masterItemId && mongoose.Types.ObjectId.isValid(masterItemId)) {
      const existingConfig = await HospitalMasterConfig.findOne({
        tenantId,
        masterItemId
      }).lean();
      alreadyConfigured = !!existingConfig;

      pendingRequest = await ItemMasterRequest.findOne({
        tenantId,
        masterItemId,
        status: { $in: ['PENDING', 'UNDER_REVIEW', 'SUBMITTED'] }
      }).select('requestNo status createdAt').lean();
    }

    res.json({
      success: true,
      alreadyConfigured,
      pendingRequest
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/item-requests
 * Submit a master request. Supports:
 * - Path A: ASSIGN_EXISTING_GLOBAL_ITEM
 * - Path B: NEW_GLOBAL_ITEM
 */
router.post('/', async (req, res) => {
  try {
    const {
      requestType = 'NEW_GLOBAL_ITEM',
      masterItemId,
      category,
      department,
      proposedItem = {},
      categoryData = {},
      requestedMrp = 0,
      requestedNetRate = 0,
      requestedHospitalCost = 0,
      reason = '',
      hospitalName
    } = req.body;

    const tenantId = req.tenantId;
    if (!tenantId) {
      return res.status(400).json({ error: 'Valid tenant context required to submit master requests.' });
    }

    const numRequestedMrp = Number(requestedMrp) || 0;
    const numRequestedNetRate = Number(requestedNetRate) || 0;
    const numRequestedHospitalCost = Number(requestedHospitalCost) || 0;

    let finalCategory = category;
    let finalDepartment = department || '';
    let linkedMasterItem = null;

    // ── PATH A: ASSIGN_EXISTING_GLOBAL_ITEM ─────────────────────────────────
    if (requestType === 'ASSIGN_EXISTING_GLOBAL_ITEM') {
      if (!masterItemId || !mongoose.Types.ObjectId.isValid(masterItemId)) {
        return res.status(400).json({ error: 'A valid masterItemId is required for Path A assignment requests.' });
      }

      linkedMasterItem = await ItemMaster.findOne({ _id: masterItemId, scope: 'GLOBAL' }).lean();
      if (!linkedMasterItem) {
        return res.status(404).json({ error: 'Target canonical global item not found.' });
      }

      // 1. Check if already configured for this hospital
      const alreadyConfig = await HospitalMasterConfig.findOne({
        tenantId,
        masterItemId
      }).lean();
      if (alreadyConfig) {
        return res.status(409).json({ error: 'This item is already configured in your hospital catalog.' });
      }

      // 2. Check if a request is already pending
      const activePending = await ItemMasterRequest.findOne({
        tenantId,
        masterItemId,
        status: { $in: ['PENDING', 'UNDER_REVIEW', 'SUBMITTED'] }
      }).lean();
      if (activePending) {
        return res.status(409).json({ error: `An active request (${activePending.requestNo}) for this item is already pending SuperAdmin review.` });
      }

      finalCategory = linkedMasterItem.category || finalCategory;
      finalDepartment = linkedMasterItem.department || finalDepartment;
    }

    // ── PATH B: NEW_GLOBAL_ITEM ─────────────────────────────────────────────
    if (requestType === 'NEW_GLOBAL_ITEM') {
      if (!finalCategory) {
        return res.status(400).json({ error: 'Category is required for new item proposal.' });
      }
      const catConfig = getCategoryConfig(finalCategory);
      if (!catConfig) {
        return res.status(400).json({ error: `Invalid category: "${finalCategory}"` });
      }
      if (catConfig.status === 'SOURCE-CONFIRMATION-REQUIRED') {
        return res.status(400).json({ error: `Category "${finalCategory}" is pending client specification and cannot accept records yet.` });
      }
      if (catConfig.hasDepartment && !finalDepartment) {
        return res.status(400).json({ error: `Department is required for category "${finalCategory}".` });
      }
    }

    const requestNo = await getNextRequestNo();

    const doc = await ItemMasterRequest.create({
      requestNo,
      tenantId,
      hospitalName: hospitalName || tenantId,
      requestType,
      masterItemId: requestType === 'ASSIGN_EXISTING_GLOBAL_ITEM' ? masterItemId : null,
      category: finalCategory,
      department: finalDepartment,
      proposedItem,
      categoryData,
      requestedMrp: numRequestedMrp,
      requestedNetRate: numRequestedNetRate,
      requestedHospitalCost: numRequestedHospitalCost,
      approvedMrp: null,
      approvedNetRate: null,
      approvedHospitalCost: null,
      reason,
      status: 'PENDING',
      requestedBy: req.user?.staff_id || req.user?.id || 'unknown',
      requestedByName: req.user?.name || '',
      requestedByRole: req.user?.role || '',
      history: [{
        action: 'SUBMITTED',
        actor: req.user?.staff_id || req.user?.id || 'unknown',
        actorName: req.user?.name || '',
        actorRole: req.user?.role || '',
        note: requestType === 'ASSIGN_EXISTING_GLOBAL_ITEM'
          ? `Submitted Path A request to assign existing global item ${linkedMasterItem?.itemCode}`
          : `Submitted Path B proposal for new ${finalCategory} master item`,
        metadata: {
          requestType,
          requestedPricing: { mrp: numRequestedMrp, netRate: numRequestedNetRate, cost: numRequestedHospitalCost }
        },
        timestamp: new Date()
      }]
    });

    try {
      await AuditLog.create({
        tenantId,
        actor: req.user?.staff_id || req.user?.id || 'system',
        actorName: req.user?.name || '',
        actorRole: req.user?.role || '',
        action: 'ITEM_REQUEST_SUBMITTED',
        target: requestNo,
        metadata: { requestNo, requestType, category: finalCategory }
      });
    } catch (_) {}

    res.status(201).json({ success: true, data: doc });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ error: 'An active request for this item is already pending review.' });
    }
    res.status(400).json({ error: err.message });
  }
});

/**
 * GET /api/item-requests/:id
 * Retrieve a single request by ID. Tenant-isolated for hospital staff.
 */
router.get('/:id', async (req, res) => {
  try {
    const isAdmin = ['superadmin', 'super_admin', 'platform_admin'].includes((req.user?.role || '').toLowerCase());
    const query = { _id: req.params.id };
    if (!isAdmin) query.tenantId = req.tenantId;

    const doc = await ItemMasterRequest.findOne(query)
      .populate('masterItemId')
      .populate('approvedItemMasterId')
      .lean();

    if (!doc) return res.status(404).json({ error: 'Request not found' });
    res.json({ success: true, data: doc });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * PUT /api/item-requests/:id/cancel
 * Hospital user cancels their own pending request
 */
router.put('/:id/cancel', async (req, res) => {
  try {
    const doc = await ItemMasterRequest.findOne({ _id: req.params.id, tenantId: req.tenantId });
    if (!doc) return res.status(404).json({ error: 'Request not found' });
    if (!['DRAFT', 'SUBMITTED', 'PENDING'].includes(doc.status)) {
      return res.status(400).json({ error: `Cannot cancel request in "${doc.status}" status.` });
    }

    doc.status = 'CANCELLED';
    doc.history.push({
      action: 'CANCELLED',
      actor: req.user?.staff_id || 'unknown',
      actorName: req.user?.name || '',
      actorRole: req.user?.role || '',
      note: 'Cancelled by hospital user',
      timestamp: new Date()
    });
    await doc.save();

    res.json({ success: true, data: doc });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// SUPER ADMIN MANAGEMENT & APPROVAL ROUTES
// ─────────────────────────────────────────────────────────────────────────────

/**
 * GET /api/item-requests/admin/all
 * Super Admin global request list with advanced filters
 */
router.get('/admin/all', isSuperAdmin, async (req, res) => {
  try {
    const { status, search, tenantId, requestType, category } = req.query;
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 25));
    const query = {};

    if (status && status !== 'all') query.status = status;
    if (tenantId && tenantId !== 'all') query.tenantId = tenantId;
    if (requestType && requestType !== 'all') query.requestType = requestType;
    if (category && category !== 'all') query.category = category;

    if (search && search.trim()) {
      const r = new RegExp(search.trim().replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&'), 'i');
      query.$or = [
        { requestNo: r },
        { hospitalName: r },
        { 'proposedItem.itemName': r },
        { 'proposedItem.genericName': r },
        { 'categoryData.itemName': r }
      ];
    }

    const skip = (page - 1) * limit;
    const [data, total] = await Promise.all([
      ItemMasterRequest.find(query)
        .populate('masterItemId', 'itemCode itemName genericName brandName category department')
        .populate('approvedItemMasterId', 'itemCode itemName genericName brandName')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      ItemMasterRequest.countDocuments(query)
    ]);

    res.json({
      success: true,
      data,
      pagination: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit) || 1
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * PUT /api/item-requests/admin/:id/review
 * Mark request as UNDER_REVIEW by SuperAdmin
 */
router.put('/admin/:id/review', isSuperAdmin, async (req, res) => {
  try {
    const doc = await ItemMasterRequest.findById(req.params.id);
    if (!doc) return res.status(404).json({ error: 'Request not found' });
    if (!['SUBMITTED', 'PENDING'].includes(doc.status)) {
      return res.status(400).json({ error: `Request must be in SUBMITTED or PENDING status to mark as under review (current: ${doc.status})` });
    }

    doc.status = 'UNDER_REVIEW';
    doc.reviewedBy = req.user?.staff_id || req.user?.id || 'superadmin';
    doc.reviewedByName = req.user?.name || 'Super Admin';
    doc.history.push({
      action: 'UNDER_REVIEW',
      actor: req.user?.staff_id || 'superadmin',
      actorName: req.user?.name || 'Super Admin',
      actorRole: req.user?.role || 'Super Admin',
      note: req.body.note || 'Review started by Super Admin',
      timestamp: new Date()
    });
    await doc.save();

    res.json({ success: true, data: doc });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

/**
 * PUT /api/item-requests/admin/:id/convert-to-assign
 * Formal conversion of a NEW_GLOBAL_ITEM proposal to ASSIGN_EXISTING_GLOBAL_ITEM
 * When SuperAdmin matches proposal with an existing canonical global item
 */
router.put('/admin/:id/convert-to-assign', isSuperAdmin, async (req, res) => {
  try {
    const { canonicalMasterItemId, note } = req.body;
    if (!canonicalMasterItemId || !mongoose.Types.ObjectId.isValid(canonicalMasterItemId)) {
      return res.status(400).json({ error: 'Valid canonicalMasterItemId is required.' });
    }

    const doc = await ItemMasterRequest.findById(req.params.id);
    if (!doc) return res.status(404).json({ error: 'Request not found' });
    if (!['SUBMITTED', 'PENDING', 'UNDER_REVIEW'].includes(doc.status)) {
      return res.status(400).json({ error: `Cannot convert request in "${doc.status}" status.` });
    }

    const canonicalItem = await ItemMaster.findOne({ _id: canonicalMasterItemId, scope: 'GLOBAL' }).lean();
    if (!canonicalItem) {
      return res.status(404).json({ error: 'Canonical global master item not found.' });
    }

    // Check if hospital already has this canonical item configured
    const existingConfig = await HospitalMasterConfig.findOne({
      tenantId: doc.tenantId,
      masterItemId: canonicalMasterItemId
    }).lean();
    if (existingConfig) {
      return res.status(409).json({ error: `Hospital "${doc.tenantId}" already has this item configured in its catalog.` });
    }

    // Mutate request to Path A without status pollution
    doc.requestType = 'ASSIGN_EXISTING_GLOBAL_ITEM';
    doc.masterItemId = canonicalItem._id;
    doc.wasConvertedFromNewItem = true;
    doc.status = 'UNDER_REVIEW';

    doc.history.push({
      action: 'CONVERTED_TO_ASSIGN_EXISTING',
      actor: req.user?.staff_id || 'superadmin',
      actorName: req.user?.name || 'Super Admin',
      actorRole: req.user?.role || 'Super Admin',
      note: note || `Converted proposal to assign existing canonical item ${canonicalItem.itemCode} (${canonicalItem.itemName || canonicalItem.genericName})`,
      metadata: {
        matchedMasterItemId: canonicalItem._id,
        matchedItemCode: canonicalItem.itemCode,
        retainedRequestedPricing: {
          mrp: doc.requestedMrp,
          netRate: doc.requestedNetRate,
          hospitalCost: doc.requestedHospitalCost
        }
      },
      timestamp: new Date()
    });

    await doc.save();

    res.json({
      success: true,
      message: `Request converted to Path A and matched to ${canonicalItem.itemCode}`,
      data: doc
    });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ error: 'An active assignment request for this hospital and canonical item already exists.' });
    }
    res.status(400).json({ error: err.message });
  }
});

/**
 * PUT /api/item-requests/admin/:id/approve
 * Atomic approval of request.
 * - Path A: Creates HospitalMasterConfig only (aborts if config already exists).
 * - Path B: Creates canonical ItemMaster (0 price) + HospitalMasterConfig for requesting tenant.
 * - Preserves requested pricing immutably; stores approved pricing with explicit null checks.
 */
router.put('/admin/:id/approve', isSuperAdmin, async (req, res) => {
  try {
    const { approvedMrp, approvedNetRate, approvedHospitalCost, note } = req.body;

    const result = await runInTransaction(async (session) => {
      const q = ItemMasterRequest.findById(req.params.id);
      if (session) q.session(session);
      const doc = await q;

      if (!doc) {
        const notFound = new Error('Request not found');
        notFound.statusCode = 404;
        throw notFound;
      }

      if (!['SUBMITTED', 'PENDING', 'UNDER_REVIEW'].includes(doc.status)) {
        const invalidState = new Error(`Request cannot be approved in current status: "${doc.status}"`);
        invalidState.statusCode = 400;
        throw invalidState;
      }

      // Determine final approved pricing with explicit null checks (0 is a valid price)
      const finalMrp = resolveApprovedPrice(approvedMrp, doc.requestedMrp);
      const finalNetRate = resolveApprovedPrice(approvedNetRate, doc.requestedNetRate);
      const finalHospitalCost = resolveApprovedPrice(approvedHospitalCost, doc.requestedHospitalCost);

      let canonicalMasterId = doc.masterItemId;
      let finalCanonicalItemCode = doc.approvedItemCode || '';

      // ───────────────────────────────────────────────────────────────────────
      // PATH A: ASSIGN_EXISTING_GLOBAL_ITEM
      // ───────────────────────────────────────────────────────────────────────
      if (doc.requestType === 'ASSIGN_EXISTING_GLOBAL_ITEM') {
        if (!canonicalMasterId) {
          const missingId = new Error('Path A request lacks canonical masterItemId.');
          missingId.statusCode = 400;
          throw missingId;
        }

        const canonicalItemQ = ItemMaster.findOne({ _id: canonicalMasterId, scope: 'GLOBAL' });
        if (session) canonicalItemQ.session(session);
        const canonicalItem = await canonicalItemQ.lean();

        if (!canonicalItem) {
          const itemNotFound = new Error('Target canonical ItemMaster does not exist in GLOBAL scope.');
          itemNotFound.statusCode = 404;
          throw itemNotFound;
        }
        finalCanonicalItemCode = canonicalItem.itemCode;

        // INVARIANT: Never use unconditional upsert! Must fail if config already exists.
        const existingConfigQ = HospitalMasterConfig.findOne({
          tenantId: doc.tenantId,
          masterItemId: canonicalMasterId
        });
        if (session) existingConfigQ.session(session);
        const existingConfig = await existingConfigQ;

        if (existingConfig) {
          const conflictErr = new Error(`Hospital "${doc.tenantId}" already has an active configuration for master item ${canonicalItem.itemCode}. Existing pricing cannot be overwritten.`);
          conflictErr.statusCode = 409;
          throw conflictErr;
        }

        // Create new configuration inside transaction
        const createConfigOpts = session ? { session } : {};
        await HospitalMasterConfig.create([{
          tenantId: doc.tenantId,
          masterItemId: canonicalMasterId,
          category: doc.category || canonicalItem.category,
          department: doc.department || canonicalItem.department || '',
          mrp: finalMrp,
          netRate: finalNetRate,
          hospitalCost: finalHospitalCost,
          status: 'Active',
          approvalStatus: 'Approved',
          assignedVia: 'HOSPITAL_REQUEST',
          assignedRequestId: doc._id
        }], createConfigOpts);
      }

      // ───────────────────────────────────────────────────────────────────────
      // PATH B: NEW_GLOBAL_ITEM
      // ───────────────────────────────────────────────────────────────────────
      if (doc.requestType === 'NEW_GLOBAL_ITEM') {
        const catConfig = getCategoryConfig(doc.category);
        if (!catConfig) {
          const errCat = new Error(`Invalid category "${doc.category}" for Path B item creation.`);
          errCat.statusCode = 400;
          throw errCat;
        }

        finalCanonicalItemCode = await getNextMasterItemCode(doc.category, '__global__');

        const p = doc.proposedItem || {};
        const cd = doc.categoryData || {};
        const effectiveName = p.itemName || cd.itemName || p.genericName || cd.genericName || p.doctorsName || cd.doctorsName || 'Unnamed Master Item';

        // 1. Create canonical global ItemMaster (zero pricing)
        const createItemOpts = session ? { session } : {};
        const [globalItem] = await ItemMaster.create([{
          scope: 'GLOBAL',
          tenantId: '__global__',
          itemCode: finalCanonicalItemCode,
          category: doc.category,
          department: catConfig.hasDepartment ? (doc.department || '') : '',
          categoryType: doc.category,
          departmentType: catConfig.hasDepartment ? (doc.department || 'General') : 'General',
          itemName: effectiveName,
          genericName: p.genericName || cd.genericName || effectiveName,
          brandName: p.brandName || cd.brandName || effectiveName,
          itemDescription: p.itemDescription || cd.description || '',
          categoryData: cd,
          purchasedUnit: p.purchasedUnit || cd.purchasedUnit || 'Unit',
          consumptionUnit: p.consumptionUnit || cd.consumptionUnit || 'Unit',
          converterFactor: Number(p.converterFactor || cd.converter) || 1,
          packSizeDescription: p.packSizeDescription || cd.packSize || '',
          issueMultiplier: Number(p.issueMultiplier || cd.issueMultiplier) || 0,
          hsnCode: p.hsnCode || cd.hsnCode || '',
          defaultGst: Number(p.defaultGst || cd.gstnTax) || 5,
          isExpirable: p.isExpirable !== undefined ? p.isExpirable : (cd.expirable === 'Yes'),
          expiryCutoffDays: Number(p.expiryCutoffDays || cd.expiryDateCutoff) || 0,
          manufacturer: p.manufacturer || cd.manufactureName || '',
          catalogNo: p.catalogNo || cd.catalogNo || '',
          sampleType: cd.sampleType || p.sampleType || '',
          gender: cd.gender || p.gender || '',
          sampleOption: cd.sampleOption || p.sampleOption || '',
          doctorsName: cd.doctorsName || p.doctorsName || '',
          doctorId: cd.doctorId || p.doctorId || '',
          machineId: cd.machineId || p.machineId || '',
          machineName: cd.machineName || p.machineName || '',
          manufactureId: cd.manufactureId || p.manufactureId || '',
          manufactureName: cd.manufactureName || p.manufactureName || '',
          requiredPrescription: cd.requiredPrescription || p.requiredPrescription || '',
          status: 'Active',
          approvedFromRequestId: doc._id,
          createdByAdmin: req.user?.staff_id || req.user?.id || 'superadmin'
        }], createItemOpts);

        canonicalMasterId = globalItem._id;

        // 2. Create HospitalMasterConfig for requesting tenant
        const createConfigOpts = session ? { session } : {};
        await HospitalMasterConfig.create([{
          tenantId: doc.tenantId,
          masterItemId: canonicalMasterId,
          category: doc.category,
          department: catConfig.hasDepartment ? (doc.department || '') : '',
          mrp: finalMrp,
          netRate: finalNetRate,
          hospitalCost: finalHospitalCost,
          status: 'Active',
          approvalStatus: 'Approved',
          assignedVia: 'HOSPITAL_REQUEST',
          assignedRequestId: doc._id
        }], createConfigOpts);
      }

      // ───────────────────────────────────────────────────────────────────────
      // TERMINAL REQUEST UPDATE (Preserves requested, records approved)
      // ───────────────────────────────────────────────────────────────────────
      doc.status = 'APPROVED';
      doc.approvedItemMasterId = canonicalMasterId;
      doc.approvedItemCode = finalCanonicalItemCode;
      doc.approvedMrp = finalMrp;
      doc.approvedNetRate = finalNetRate;
      doc.approvedHospitalCost = finalHospitalCost;
      doc.reviewedBy = req.user?.staff_id || req.user?.id || 'superadmin';
      doc.reviewedByName = req.user?.name || 'Super Admin';
      doc.reviewedAt = new Date();
      doc.reviewNotes = note || '';

      doc.history.push({
        action: 'APPROVED',
        actor: req.user?.staff_id || 'superadmin',
        actorName: req.user?.name || 'Super Admin',
        actorRole: req.user?.role || 'Super Admin',
        note: doc.requestType === 'ASSIGN_EXISTING_GLOBAL_ITEM'
          ? `Path A Approved: assigned ${finalCanonicalItemCode} to ${doc.tenantId}`
          : `Path B Approved: created global master ${finalCanonicalItemCode} and configured for ${doc.tenantId}`,
        metadata: {
          requestType: doc.requestType,
          approvedItemCode: finalCanonicalItemCode,
          pricingComparison: {
            requested: { mrp: doc.requestedMrp, netRate: doc.requestedNetRate, hospitalCost: doc.requestedHospitalCost },
            approved: { mrp: finalMrp, netRate: finalNetRate, hospitalCost: finalHospitalCost }
          }
        },
        timestamp: new Date()
      });

      const saveOpts = session ? { session } : {};
      await doc.save(saveOpts);

      try {
        const auditOpts = session ? { session } : {};
        await SuperAdminAudit.create([{
          user: req.user?.name || 'Super Admin',
          action: doc.requestType === 'ASSIGN_EXISTING_GLOBAL_ITEM'
            ? 'ITEM_REQUEST_APPROVED_ASSIGN_EXISTING'
            : 'ITEM_REQUEST_APPROVED_NEW_GLOBAL',
          details: `Approved request ${doc.requestNo} for tenant "${doc.tenantId}" → ${finalCanonicalItemCode} (MRP: ${finalMrp}, Net: ${finalNetRate})`,
          ip: req.ip || ''
        }], auditOpts);
      } catch (_) {}

      return doc;
    });

    res.json({ success: true, data: result });
  } catch (err) {
    const status = err.statusCode || (err.code === 11000 ? 409 : 400);
    res.status(status).json({ error: err.message });
  }
});

/**
 * PUT /api/item-requests/admin/:id/reject
 * Reject request with mandatory rejection reason. Zero master or config records created.
 */
router.put('/admin/:id/reject', isSuperAdmin, async (req, res) => {
  try {
    const doc = await ItemMasterRequest.findById(req.params.id);
    if (!doc) return res.status(404).json({ error: 'Request not found' });
    if (!['SUBMITTED', 'PENDING', 'UNDER_REVIEW'].includes(doc.status)) {
      return res.status(400).json({ error: `Request cannot be rejected in current status: "${doc.status}"` });
    }

    const { rejectionReason, note } = req.body;
    if (!rejectionReason || !rejectionReason.trim()) {
      return res.status(400).json({ error: 'Rejection reason is required.' });
    }

    doc.status = 'REJECTED';
    doc.rejectionReason = rejectionReason.trim();
    doc.reviewedBy = req.user?.staff_id || req.user?.id || 'superadmin';
    doc.reviewedByName = req.user?.name || 'Super Admin';
    doc.reviewedAt = new Date();
    doc.reviewNotes = note || '';

    doc.history.push({
      action: 'REJECTED',
      actor: req.user?.staff_id || 'superadmin',
      actorName: req.user?.name || 'Super Admin',
      actorRole: req.user?.role || 'Super Admin',
      note: rejectionReason.trim(),
      timestamp: new Date()
    });

    await doc.save();

    try {
      await SuperAdminAudit.create({
        user: req.user?.name || 'Super Admin',
        action: 'ITEM_REQUEST_REJECTED',
        details: `Rejected request ${doc.requestNo} for hospital "${doc.tenantId}": ${rejectionReason.trim()}`,
        ip: req.ip || ''
      });
    } catch (_) {}

    res.json({ success: true, data: doc });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
