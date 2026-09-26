const express = require('express');
const router = express.Router();
const ItemMasterRequest = require('../models/ItemMasterRequest');
const ItemMaster = require('../models/ItemMaster');
const Counter = require('../models/Counter');
const AuditLog = require('../models/AuditLog');
const SuperAdminAudit = require('../models/SuperAdminAudit');
const { verifyToken, isSuperAdmin } = require('../middleware/authMiddleware');

router.use(verifyToken);

// ── Sequence generator ────────────────────────────────────────────────────────
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

// ── Normalize string for duplicate detection ─────────────────────────────────
function normalize(s) {
  return (s || '').toLowerCase().replace(/\s+/g, ' ').replace(/\s*(\d+)\s*/g, '$1').trim();
}

// ─────────────────────────────────────────────────────────────────────────────
// HOSPITAL ROUTES (tenant-scoped)
// ─────────────────────────────────────────────────────────────────────────────

// GET /api/item-requests — hospital sees own requests
router.get('/', async (req, res) => {
  try {
    const isAdmin = ['superadmin', 'super_admin', 'platform_admin'].includes((req.user?.role || '').toLowerCase());
    const query = isAdmin ? {} : { tenantId: req.tenantId };
    const { status, search } = req.query;
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 25));

    if (status && status !== 'all') query.status = status;
    if (search && search.trim()) {
      const r = new RegExp(search.trim().replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&'), 'i');
      query.$or = [{ requestNo: r }, { 'proposedItem.genericName': r }, { 'proposedItem.brandName': r }, { 'proposedItem.manufacturer': r }];
    }

    const skip = (page - 1) * limit;
    const [data, total] = await Promise.all([
      ItemMasterRequest.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      ItemMasterRequest.countDocuments(query)
    ]);
    res.json({ success: true, data, pagination: { total, page, limit, pages: Math.ceil(total / limit) || 1 } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/item-requests — hospital submits a new request
router.post('/', async (req, res) => {
  try {
    const { proposedItem, reason, hospitalName } = req.body;
    if (!proposedItem || !proposedItem.genericName || !proposedItem.genericName.trim()) {
      return res.status(400).json({ error: 'Generic Name is required' });
    }
    if (!proposedItem.manufacturer || !proposedItem.manufacturer.trim()) {
      return res.status(400).json({ error: 'Manufacturer is required' });
    }
    if (!proposedItem.categoryType || !proposedItem.categoryType.trim()) {
      return res.status(400).json({ error: 'Category Type is required' });
    }
    const requestNo = await getNextRequestNo();
    const doc = await ItemMasterRequest.create({
      requestNo,
      tenantId: req.tenantId,
      hospitalName: hospitalName || req.tenantId,
      requestedBy: req.user?.staff_id || req.user?.id || 'unknown',
      requestedByName: req.user?.name || '',
      requestedByRole: req.user?.role || '',
      proposedItem,
      reason: reason || '',
      status: 'SUBMITTED',
      history: [{
        action: 'SUBMITTED',
        actor: req.user?.staff_id || req.user?.id || 'unknown',
        actorName: req.user?.name || '',
        actorRole: req.user?.role || '',
        note: 'Request submitted by hospital',
        timestamp: new Date()
      }]
    });
    try {
      await AuditLog.create({
        tenantId: req.tenantId,
        actor: req.user?.staff_id || req.user?.id || 'system',
        actorName: req.user?.name || '',
        actorRole: req.user?.role || '',
        action: 'ITEM_REQUEST_SUBMITTED',
        target: requestNo,
        metadata: { requestNo, genericName: proposedItem.genericName }
      });
    } catch (_) {}
    res.status(201).json({ success: true, data: doc });
  } catch (err) {
    if (err.code === 11000) return res.status(400).json({ error: 'Duplicate request number. Please try again.' });
    res.status(400).json({ error: err.message });
  }
});

// GET /api/item-requests/:id
router.get('/:id', async (req, res) => {
  try {
    const isAdmin = ['superadmin', 'super_admin', 'platform_admin'].includes((req.user?.role || '').toLowerCase());
    const query = { _id: req.params.id };
    if (!isAdmin) query.tenantId = req.tenantId;
    const doc = await ItemMasterRequest.findOne(query).populate('approvedItemMasterId', 'itemCode genericName brandName').lean();
    if (!doc) return res.status(404).json({ error: 'Request not found' });
    res.json({ success: true, data: doc });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/item-requests/:id — hospital updates a DRAFT request
router.put('/:id', async (req, res) => {
  try {
    const doc = await ItemMasterRequest.findOne({ _id: req.params.id, tenantId: req.tenantId });
    if (!doc) return res.status(404).json({ error: 'Request not found' });
    if (doc.status !== 'DRAFT') return res.status(400).json({ error: 'Only DRAFT requests can be edited' });
    const { proposedItem, reason } = req.body;
    if (proposedItem) doc.proposedItem = { ...doc.proposedItem, ...proposedItem };
    if (reason !== undefined) doc.reason = reason;
    doc.history.push({ action: 'UPDATED', actor: req.user?.staff_id || 'unknown', actorName: req.user?.name || '', actorRole: req.user?.role || '', note: 'Request updated', timestamp: new Date() });
    await doc.save();
    res.json({ success: true, data: doc });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// PUT /api/item-requests/:id/cancel
router.put('/:id/cancel', async (req, res) => {
  try {
    const doc = await ItemMasterRequest.findOne({ _id: req.params.id, tenantId: req.tenantId });
    if (!doc) return res.status(404).json({ error: 'Request not found' });
    if (!['DRAFT', 'SUBMITTED'].includes(doc.status)) return res.status(400).json({ error: 'Cannot cancel a request in current status' });
    doc.status = 'CANCELLED';
    doc.history.push({ action: 'CANCELLED', actor: req.user?.staff_id || 'unknown', actorName: req.user?.name || '', actorRole: req.user?.role || '', note: 'Cancelled by hospital', timestamp: new Date() });
    await doc.save();
    res.json({ success: true, data: doc });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// SUPER ADMIN ROUTES
// ─────────────────────────────────────────────────────────────────────────────

// GET /api/item-requests/admin/all
router.get('/admin/all', isSuperAdmin, async (req, res) => {
  try {
    const { status, search, tenantId } = req.query;
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 25));
    const query = {};
    if (status && status !== 'all') query.status = status;
    if (tenantId) query.tenantId = tenantId;
    if (search && search.trim()) {
      const r = new RegExp(search.trim().replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&'), 'i');
      query.$or = [{ requestNo: r }, { 'proposedItem.genericName': r }, { 'proposedItem.brandName': r }, { hospitalName: r }];
    }
    const skip = (page - 1) * limit;
    const [data, total] = await Promise.all([
      ItemMasterRequest.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit).populate('approvedItemMasterId', 'itemCode genericName').lean(),
      ItemMasterRequest.countDocuments(query)
    ]);
    res.json({ success: true, data, pagination: { total, page, limit, pages: Math.ceil(total / limit) || 1 } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/item-requests/admin/duplicate-check
router.get('/admin/duplicate-check', isSuperAdmin, async (req, res) => {
  try {
    const { genericName, strength, dosageForm, manufacturer, brandName, catalogNo, makeModelNo, itemType } = req.query;
    if (!genericName && !catalogNo && !makeModelNo) return res.json({ success: true, duplicates: [] });
    const normGeneric = normalize(genericName || '');
    const normCat = normalize(catalogNo || '');
    const normModel = normalize(makeModelNo || '');

    const allGlobal = await ItemMaster.find({ scope: 'GLOBAL', status: 'Active' })
      .select('genericName brandName manufacturer strength dosageForm itemCode catalogNo makeModelNo itemType _id packSizeDescription')
      .lean();

    const matches = allGlobal.filter(item => {
      // 1. Direct catalog/model exact match
      if (normCat && normalize(item.catalogNo) === normCat) return true;
      if (normModel && normalize(item.makeModelNo) === normModel) return true;

      // 2. Generic Name fuzzy match
      const gNorm = normalize(item.genericName);
      const gMatch = normGeneric && (gNorm.includes(normGeneric) || normGeneric.includes(gNorm));
      if (!gMatch) return false;

      // 3. For medicines: match strength, dosageForm, or manufacturer
      if (itemType === 'Medicine' || item.itemType === 'Medicine') {
        const mMatch = !manufacturer || normalize(item.manufacturer).includes(normalize(manufacturer)) || normalize(manufacturer).includes(normalize(item.manufacturer));
        const sMatch = !strength || normalize(item.strength || '') === normalize(strength);
        const dMatch = !dosageForm || normalize(item.dosageForm || '') === normalize(dosageForm);
        return mMatch || sMatch || dMatch;
      }

      // 4. For non-medicines: match manufacturer or brand
      const mMatch = !manufacturer || normalize(item.manufacturer).includes(normalize(manufacturer)) || normalize(manufacturer).includes(normalize(item.manufacturer));
      const bMatch = !brandName || normalize(item.brandName).includes(normalize(brandName));
      return mMatch || bMatch;
    });
    res.json({ success: true, duplicates: matches });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/item-requests/admin/:id/review — mark under review
router.put('/admin/:id/review', isSuperAdmin, async (req, res) => {
  try {
    const doc = await ItemMasterRequest.findById(req.params.id);
    if (!doc) return res.status(404).json({ error: 'Request not found' });
    if (doc.status !== 'SUBMITTED') return res.status(400).json({ error: 'Request must be SUBMITTED to mark as under review' });
    doc.status = 'UNDER_REVIEW';
    doc.reviewedBy = req.user?.staff_id || req.user?.id || 'superadmin';
    doc.reviewedByName = req.user?.name || 'Super Admin';
    doc.history.push({ action: 'UNDER_REVIEW', actor: req.user?.staff_id || 'superadmin', actorName: req.user?.name || '', actorRole: req.user?.role || '', note: req.body.note || 'Under review by Super Admin', timestamp: new Date() });
    await doc.save();
    res.json({ success: true, data: doc });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// PUT /api/item-requests/admin/:id/approve
router.put('/admin/:id/approve', isSuperAdmin, async (req, res) => {
  try {
    const doc = await ItemMasterRequest.findById(req.params.id);
    if (!doc) return res.status(404).json({ error: 'Request not found' });
    if (!['SUBMITTED', 'UNDER_REVIEW'].includes(doc.status)) return res.status(400).json({ error: 'Request is not in a state that can be approved' });

    const { linkToExistingId, note } = req.body;
    let globalItem = null;

    if (linkToExistingId) {
      // Link to existing global item instead of creating new
      globalItem = await ItemMaster.findOne({ _id: linkToExistingId, scope: 'GLOBAL' }).lean();
      if (!globalItem) return res.status(404).json({ error: 'Specified global item not found' });
      doc.linkedToExistingItem = true;
    } else {
      // Create new global item from proposed data
      const p = doc.proposedItem;
      const year = new Date().getFullYear();
      const counterKey = `item_master_global_${year}`;
      let itemCode;
      for (let i = 0; i < 20; i++) {
        const c = await Counter.findOneAndUpdate({ key: counterKey }, { $inc: { seq: 1 } }, { upsert: true, returnDocument: 'after' });
        const candidate = `ITM-${year}-${String(c.seq).padStart(4, '0')}`;
        const exists = await ItemMaster.findOne({ tenantId: '__global__', itemCode: candidate }).lean();
        if (!exists) { itemCode = candidate; break; }
      }
      if (!itemCode) itemCode = `ITM-${year}-${Date.now().toString().slice(-4)}`;

      globalItem = await ItemMaster.create({
        scope: 'GLOBAL',
        tenantId: '__global__',
        itemCode,
        genericName: p.genericName || '',
        brandName: p.brandName || p.genericName || '',
        itemDescription: p.itemDescription || '',
        categoryType: p.categoryType || 'General',
        departmentType: p.departmentType || 'General',
        itemType: p.itemType || 'Medicine',
        hsnCode: p.hsnCode || '',
        defaultGst: p.defaultGst || 12,
        storageTemperature: p.storageTemperature || 'Room Temperature',
        isExpirable: p.isExpirable !== false,
        inventoryRule: 'FEFO',
        manufacturer: p.manufacturer || '',
        composition: p.composition || '',
        strength: p.strength || '',
        strengthUnit: p.strengthUnit || '',
        dosageForm: p.dosageForm || '',
        routeOfAdministration: p.routeOfAdministration || '',
        scheduleClassification: p.scheduleClassification || '',
        material: p.material || '',
        sizeDimensions: p.sizeDimensions || '',
        sterility: p.sterility || '',
        disposalType: p.disposalType || '',
        machineCompatibility: p.machineCompatibility || '',
        catalogNo: p.catalogNo || '',
        testPackVolume: p.testPackVolume || '',
        makeModelNo: p.makeModelNo || '',
        itemSpecification: p.itemSpecification || '',
        warrantyMonths: Number(p.warrantyMonths) || 0,
        maintenanceCycle: p.maintenanceCycle || '',
        purchasedUnit: p.purchasedUnit || 'Box',
        consumptionUnit: p.consumptionUnit || 'Unit',
        converterFactor: p.converterFactor || 1,
        packSizeDescription: p.packSizeDescription || '',
        packagingHierarchy: p.packagingHierarchy || { isBrokenDown: false, levels: [] },
        manufacturers: [{ manufacturer: p.manufacturer || '', purchasedUnit: p.purchasedUnit || 'Box', converterFactor: p.converterFactor || 1, consumptionUnit: p.consumptionUnit || 'Unit', isActive: true }],
        status: 'Active',
        approvedFromRequestId: doc._id,
        createdByAdmin: req.user?.staff_id || req.user?.id || 'superadmin'
      });
    }

    doc.status = 'APPROVED';
    doc.approvedItemMasterId = globalItem._id;
    doc.approvedItemCode = globalItem.itemCode;
    doc.reviewedBy = req.user?.staff_id || req.user?.id || 'superadmin';
    doc.reviewedByName = req.user?.name || 'Super Admin';
    doc.reviewedAt = new Date();
    doc.reviewNotes = note || '';
    doc.history.push({ action: 'APPROVED', actor: req.user?.staff_id || 'superadmin', actorName: req.user?.name || '', actorRole: req.user?.role || '', note: doc.linkedToExistingItem ? `Linked to existing item: ${globalItem.itemCode}` : `Global item created: ${globalItem.itemCode}`, timestamp: new Date() });
    await doc.save();

    try {
      await SuperAdminAudit.create({ user: req.user?.name || 'Super Admin', action: 'ITEM_REQUEST_APPROVED', details: `Approved request ${doc.requestNo} → ${globalItem.itemCode}`, ip: req.ip || '' });
    } catch (_) {}

    res.json({ success: true, data: doc, globalItem: { itemCode: globalItem.itemCode, genericName: globalItem.genericName, _id: globalItem._id } });
  } catch (err) {
    if (err.code === 11000) return res.status(400).json({ error: 'Item Code conflict. Please try again.' });
    res.status(400).json({ error: err.message });
  }
});

// PUT /api/item-requests/admin/:id/reject
router.put('/admin/:id/reject', isSuperAdmin, async (req, res) => {
  try {
    const doc = await ItemMasterRequest.findById(req.params.id);
    if (!doc) return res.status(404).json({ error: 'Request not found' });
    if (!['SUBMITTED', 'UNDER_REVIEW'].includes(doc.status)) return res.status(400).json({ error: 'Request cannot be rejected in current status' });
    const { rejectionReason, note } = req.body;
    if (!rejectionReason || !rejectionReason.trim()) return res.status(400).json({ error: 'Rejection reason is required' });
    doc.status = 'REJECTED';
    doc.rejectionReason = rejectionReason.trim();
    doc.reviewedBy = req.user?.staff_id || req.user?.id || 'superadmin';
    doc.reviewedByName = req.user?.name || 'Super Admin';
    doc.reviewedAt = new Date();
    doc.reviewNotes = note || '';
    doc.history.push({ action: 'REJECTED', actor: req.user?.staff_id || 'superadmin', actorName: req.user?.name || '', actorRole: req.user?.role || '', note: rejectionReason, timestamp: new Date() });
    await doc.save();
    try {
      await SuperAdminAudit.create({ user: req.user?.name || 'Super Admin', action: 'ITEM_REQUEST_REJECTED', details: `Rejected request ${doc.requestNo}: ${rejectionReason}`, ip: req.ip || '' });
    } catch (_) {}
    res.json({ success: true, data: doc });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
