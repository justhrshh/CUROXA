const express = require('express');
const ItemMaster = require('../models/ItemMaster');
const Counter = require('../models/Counter');
const RoleCoverage = require('../models/RoleCoverage');
const AuditLog = require('../models/AuditLog');
const MedicineBatch = require('../models/MedicineBatch');
const { verifyToken } = require('../middleware/authMiddleware');

const router = express.Router();
router.use(verifyToken);

// ── Helper: is the current user a super admin? ────────────────────────────────
function isSuperAdminUser(req) {
  return ['superadmin', 'super_admin', 'platform_admin'].includes((req.user?.role || '').toLowerCase());
}

// GET /api/item-master/global/search — search global catalog (used by Vendor Quotation & PO)
router.get('/global/search', async (req, res) => {
  try {
    const { q } = req.query;
    if (!q || !q.trim()) return res.json({ success: true, data: [] });
    const escaped = q.trim().replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');
    const regex = new RegExp(escaped, 'i');
    const items = await ItemMaster.find({
      scope: 'GLOBAL',
      status: 'Active',
      $or: [
        { itemCode: regex },
        { genericName: regex },
        { brandName: regex },
        { manufacturer: regex },
        { composition: regex }
      ]
    }).limit(30).lean();
    res.json({ success: true, data: items.map(formatItemWithManufacturers) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * Concurrency-safe, tenant-bound sequence generator for Item Master
 * Format: ITM-YYYY-XXXX (e.g. ITM-2026-0001)
 */
async function getNextItemCode(tenantId, year = new Date().getFullYear()) {
  const counterKey = `item_master_${tenantId}_${year}`;
  
  // Seed counter from existing items if not present
  let counter = await Counter.findOne({ key: counterKey });
  if (!counter) {
    const prefix = `ITM-${year}-`;
    const highestItem = await ItemMaster.findOne({
      tenantId,
      itemCode: new RegExp(`^${prefix}`)
    }).sort({ itemCode: -1 }).lean();

    let initialSeq = 0;
    if (highestItem && highestItem.itemCode) {
      const parts = highestItem.itemCode.split('-');
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
    const candidateCode = `ITM-${year}-${String(updatedCounter.seq).padStart(4, '0')}`;
    const exists = await ItemMaster.findOne({ tenantId, itemCode: candidateCode }).lean();
    if (!exists) {
      return candidateCode;
    }
    attempts++;
  }
  return `ITM-${year}-${Date.now().toString().slice(-4)}`;
}

/**
 * Evaluates whether user is authorized to manage Item Master records.
 * Default: Admin and Pharmacy roles have full access.
 * Non-pharmacists can access via RoleCoverage delegation for 'ph-itemmaster'.
 */
async function checkItemMasterAuthorization(req) {
  if (!req.user) return false;
  const userRole = String(req.user.role || '').toLowerCase();
  if (userRole === 'admin' || userRole === 'pharmacy' || userRole === 'superadmin' || userRole === 'super_admin') {
    return true;
  }
  
  const staffId = req.user.staff_id || req.user.id || req.user._id;
  if (!staffId) return false;

  try {
    const coverageDoc = await RoleCoverage.findOne({ tenantId: req.tenantId }).lean();
    if (coverageDoc && coverageDoc.state && coverageDoc.state[staffId]) {
      const grant = coverageDoc.state[staffId]['ph-itemmaster'];
      if (grant && grant.on) {
        if (grant.type === 'temp' && grant.expiresAt) {
          return new Date(grant.expiresAt) > new Date();
        }
        return true;
      }
    }
  } catch (err) {
    console.warn('[ITEM MASTER] Role coverage lookup error:', err.message);
  }
  return false;
}

function formatItemWithManufacturers(item) {
  if (!item) return item;
  if (!item.manufacturers || item.manufacturers.length === 0) {
    if (item.manufacturer) {
      item.manufacturers = [{
        manufacturer: item.manufacturer,
        catalogNo: item.catalogNo || '',
        machineCompatibility: item.machineCompatibility || '',
        purchasedUnit: item.purchasedUnit || 'Box',
        converterFactor: item.converterFactor || 1,
        packSizeDescription: item.packSizeDescription || '',
        consumptionUnit: item.consumptionUnit || 'Tablet',
        issueMultiplier: item.issueMultiplier || 1,
        isActive: true
      }];
    } else {
      item.manufacturers = [];
    }
  }

  if (!item.packagingHierarchy || typeof item.packagingHierarchy !== 'object' || !item.packagingHierarchy.levels) {
    if (Number(item.converterFactor) > 1 && item.purchasedUnit !== item.consumptionUnit) {
      item.packagingHierarchy = {
        isBrokenDown: true,
        levels: [{
          levelIndex: 0,
          parentUnit: item.purchasedUnit || 'Box',
          quantity: Number(item.converterFactor) || 1,
          childUnit: item.consumptionUnit || 'Unit'
        }]
      };
    } else {
      item.packagingHierarchy = {
        isBrokenDown: false,
        levels: []
      };
    }
  }

  return item;
}

// GET /api/item-master — List items with server-side filtering & pagination
// scope=GLOBAL  → only global items (hospital browsing the catalog)
// scope=HOSPITAL → only hospital-scoped items (legacy)
// default        → global items (hospital sees global catalog)
router.get('/', async (req, res) => {
  try {
    const {
      search, category, categoryType, department, departmentType,
      temperature, storageTemperature, itemType, status, scope: scopeParam
    } = req.query;

    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(2000, Math.max(1, parseInt(req.query.limit, 10) || 50));

    // Determine query scope
    let query = {};
    if (scopeParam === 'HOSPITAL') {
      // Legacy: hospital-scoped only
      query = { tenantId: req.tenantId, scope: { $in: ['HOSPITAL', null] } };
    } else if (scopeParam === 'GLOBAL' || !scopeParam) {
      // Default: show global catalog to all authenticated users
      query = { scope: 'GLOBAL' };
      // Super admin also has their own hospital filter if needed
      if (isSuperAdminUser(req) && req.query.tenantId) {
        query = { tenantId: req.query.tenantId };
      }
    } else {
      query = { tenantId: req.tenantId };
    }

    const resolvedCategory = category || categoryType;
    if (resolvedCategory && resolvedCategory !== 'All' && resolvedCategory !== 'All Categories') {
      query.categoryType = resolvedCategory;
    }
    const resolvedDept = department || departmentType;
    if (resolvedDept && resolvedDept !== 'All' && resolvedDept !== 'All Departments') {
      query.departmentType = resolvedDept;
    }
    const resolvedTemp = temperature || storageTemperature;
    if (resolvedTemp && resolvedTemp !== 'All' && resolvedTemp !== 'All Temperatures') {
      query.storageTemperature = resolvedTemp;
    }
    if (itemType && itemType !== 'All' && itemType !== 'All Types') {
      query.itemType = itemType;
    }
    if (status && status !== 'All' && status !== 'All Status') {
      query.status = status;
    }
    if (search && search.trim()) {
      const q = search.trim();
      const escaped = q.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');
      const regex = new RegExp(escaped, 'i');
      query.$or = [
        { itemCode: regex }, { genericName: regex }, { brandName: regex },
        { manufacturer: regex }, { hsnCode: regex }, { catalogNo: regex }, { composition: regex }
      ];
    }

    const skip = (page - 1) * limit;
    const [items, totalCount] = await Promise.all([
      ItemMaster.find(query).sort({ itemCode: -1, createdAt: -1 }).skip(skip).limit(limit).lean(),
      ItemMaster.countDocuments(query)
    ]);

    const formattedItems = items.map(formatItemWithManufacturers);
    res.json({
      success: true,
      data: formattedItems,
      pagination: { total: totalCount, page, limit, pages: Math.ceil(totalCount / limit) || 1 }
    });
  } catch (error) {
    console.error('Get item master error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/item-master/:id — Single item details (global items readable by any hospital)
router.get('/:id', async (req, res) => {
  try {
    const isObjectId = /^[0-9a-fA-F]{24}$/.test(req.params.id);
    // Try to find by ID or itemCode — if GLOBAL, no tenant restriction
    let item = null;
    if (isObjectId) {
      item = await ItemMaster.findOne({ _id: req.params.id }).lean();
    } else {
      item = await ItemMaster.findOne({ itemCode: req.params.id.toUpperCase() }).lean();
    }
    if (!item) return res.status(404).json({ error: 'Item Master record not found' });
    // Tenant isolation: hospital users can only read their own items OR global items
    if (item.scope !== 'GLOBAL' && item.tenantId !== req.tenantId && !isSuperAdminUser(req)) {
      return res.status(403).json({ error: 'Access denied' });
    }
    res.json(formatItemWithManufacturers(item));
  } catch (error) {
    console.error('Get single item master error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});




// POST /api/item-master — Create canonical item
router.post('/', async (req, res) => {
  try {
    const isAllowed = await checkItemMasterAuthorization(req);
    if (!isAllowed) {
      return res.status(403).json({ error: 'Access denied: Requires Item Master permission (ph-itemmaster or Admin)' });
    }

    const {
      itemCode,
      genericName,
      brandName,
      itemName,
      itemDescription,
      categoryType,
      departmentType,
      itemType,
      hsnCode,
      defaultGst,
      storageTemperature,
      itemSpecification,
      makeModelNo,
      barcodeOption,
      barcodeFormat,
      isExpirable,
      expiryCutoffDays,
      inventoryRule,
      manufacturer,
      catalogNo,
      machineCompatibility,
      manufacturers,
      purchasedUnit,
      converterFactor,
      packSizeDescription,
      consumptionUnit,
      issueMultiplier,
      status
    } = req.body;

    // ── Resolve scope & tenantId ────────────────────────────────────────────
    const requestedScope = req.body.scope || 'HOSPITAL';
    let effectiveTenantId = req.tenantId;
    if (requestedScope === 'GLOBAL') {
      if (!isSuperAdminUser(req)) {
        return res.status(403).json({ error: 'Only Super Admin can create Global items. Use item request workflow.' });
      }
      effectiveTenantId = '__global__';
    }

    const resolvedGenericName = (genericName || itemName || '').trim();
    const resolvedBrandName = (brandName || itemName || resolvedGenericName).trim();
    const resolvedManufacturer = (manufacturer || (Array.isArray(manufacturers) && manufacturers[0] && manufacturers[0].manufacturer) || '').trim();

    // Required Field Validations
    if (!resolvedGenericName) {
      return res.status(400).json({ error: 'Item Name / Generic Name is required' });

    }
    if (!resolvedBrandName) {
      return res.status(400).json({ error: 'Brand Name is required' });
    }
    if (!categoryType || !categoryType.trim()) {
      return res.status(400).json({ error: 'Category Type is required' });
    }
    if (!departmentType || !departmentType.trim()) {
      return res.status(400).json({ error: 'Department Type is required' });
    }
    if (!hsnCode || !hsnCode.trim()) {
      return res.status(400).json({ error: 'HSN Code is required' });
    }
    if (!resolvedManufacturer) {
      return res.status(400).json({ error: 'Manufacturer is required' });
    }

    // Packaging & Unit Validations & Dynamic Packaging Hierarchy
    let convFactor = Number(converterFactor);
    let pUnit = String(purchasedUnit || 'Box').trim();
    let cUnit = String(consumptionUnit || 'Tablet').trim();
    let finalPackagingHierarchy = req.body.packagingHierarchy;

    if (finalPackagingHierarchy && typeof finalPackagingHierarchy === 'object') {
      if (!finalPackagingHierarchy.isBrokenDown) {
        convFactor = 1;
        pUnit = String(purchasedUnit || 'Unit').trim();
        cUnit = pUnit;
        finalPackagingHierarchy = {
          isBrokenDown: false,
          levels: []
        };
      } else if (Array.isArray(finalPackagingHierarchy.levels) && finalPackagingHierarchy.levels.length > 0) {
        // Validate hierarchy: each level must use a different unit (no adjacent duplicates)
        const chain = [pUnit.toLowerCase()];
        for (let i = 0; i < finalPackagingHierarchy.levels.length; i++) {
          const lvl = finalPackagingHierarchy.levels[i];
          const parent = String(lvl.parentUnit || (i === 0 ? pUnit : finalPackagingHierarchy.levels[i - 1]?.childUnit) || '').trim().toLowerCase();
          const child = String(lvl.childUnit || '').trim().toLowerCase();
          const q = Number(lvl.quantity);

          if (!child) {
            return res.status(400).json({ error: `Packaging level ${i + 1} child unit is required` });
          }
          if (!Number.isFinite(q) || q < 1) {
            return res.status(400).json({ error: `Packaging level ${i + 1} quantity must be 1 or greater` });
          }
          if (parent && parent === child) {
            return res.status(400).json({ error: 'Each packaging level must use a different unit.' });
          }
          if (chain.length > 0 && chain[chain.length - 1] === child) {
            return res.status(400).json({ error: 'Each packaging level must use a different unit.' });
          }
          chain.push(child);
        }

        const computedFactor = finalPackagingHierarchy.levels.reduce((acc, lvl) => {
          const q = Number(lvl.quantity);
          return acc * (Number.isFinite(q) && q > 0 ? q : 1);
        }, 1);
        convFactor = Math.max(1, computedFactor);
        const lastLvl = finalPackagingHierarchy.levels[finalPackagingHierarchy.levels.length - 1];
        if (lastLvl && lastLvl.childUnit) {
          cUnit = String(lastLvl.childUnit).trim();
        }
      }
    } else {
      if (!Number.isFinite(convFactor) || convFactor < 1) {
        return res.status(400).json({ error: 'Converter Factor must be a positive number greater than or equal to 1' });
      }
      if (convFactor > 1 && pUnit.toLowerCase() === cUnit.toLowerCase()) {
        return res.status(400).json({ error: 'Each packaging level must use a different unit.' });
      }
      finalPackagingHierarchy = convFactor > 1 && pUnit !== cUnit ? {
        isBrokenDown: true,
        levels: [{ levelIndex: 0, parentUnit: pUnit, quantity: convFactor, childUnit: cUnit }]
      } : {
        isBrokenDown: false,
        levels: []
      };
    }

    if (!pUnit) return res.status(400).json({ error: 'Purchased Unit is required' });
    if (!cUnit) return res.status(400).json({ error: 'Consumption Unit is required' });

    // Also allow 'Non-Consumable' as a valid itemType
    const validItemTypes = ['Medicine', 'Consumable', 'Reagent', 'Asset', 'Non-Consumable'];
    if (itemType && !validItemTypes.includes(itemType)) {
      return res.status(400).json({ error: `Invalid itemType. Allowed: ${validItemTypes.join(', ')}` });
    }

    const validTemps = ['Room Temperature', '2-8°C (Cold Chain)', 'Deep Freeze (< -20°C)', 'Cool (< 25°C)'];
    if (storageTemperature && !validTemps.includes(storageTemperature)) {
      return res.status(400).json({ error: `Invalid storageTemperature. Allowed: ${validTemps.join(', ')}` });
    }

    const validRules = ['FEFO', 'FIFO'];
    if (inventoryRule && !validRules.includes(inventoryRule)) {
      return res.status(400).json({ error: `Invalid inventoryRule. Allowed: ${validRules.join(', ')}` });
    }

    let finalItemCode = '';
    if (itemCode && itemCode.trim()) {
      finalItemCode = itemCode.trim().toUpperCase();
      const existing = await ItemMaster.findOne({ tenantId: effectiveTenantId, itemCode: finalItemCode }).lean();
      if (existing) {
        return res.status(400).json({ error: `Item Code '${finalItemCode}' already exists` });
      }
    } else {
      finalItemCode = await getNextItemCode(effectiveTenantId);
    }

    const item = await ItemMaster.create({
      scope: requestedScope,
      tenantId: effectiveTenantId,
      itemCode: finalItemCode,
      genericName: resolvedGenericName,
      brandName: resolvedBrandName,

      itemDescription: itemDescription ? itemDescription.trim() : '',
      categoryType: categoryType.trim(),
      departmentType: departmentType.trim(),
      itemType: itemType || 'Medicine',
      hsnCode: hsnCode.trim(),
      defaultGst: Number.isFinite(Number(defaultGst)) ? Number(defaultGst) : 12,
      storageTemperature: storageTemperature || 'Room Temperature',
      itemSpecification: itemSpecification ? itemSpecification.trim() : '',
      makeModelNo: makeModelNo ? makeModelNo.trim() : '',
      barcodeOption: barcodeOption || 'System Generated',
      barcodeFormat: barcodeFormat || 'Code128',
      isExpirable: isExpirable !== false,
      expiryCutoffDays: Number.isFinite(Number(expiryCutoffDays)) ? Number(expiryCutoffDays) : 90,
      inventoryRule: inventoryRule || 'FEFO',
      manufacturer: resolvedManufacturer,
      catalogNo: catalogNo ? catalogNo.trim() : (req.body.manufacturers?.[0]?.catalogNo || ''),
      machineCompatibility: machineCompatibility ? machineCompatibility.trim() : (req.body.manufacturers?.[0]?.machineCompatibility || ''),
      manufacturers: Array.isArray(req.body.manufacturers) && req.body.manufacturers.length > 0 ? req.body.manufacturers : [{
        manufacturer: resolvedManufacturer,
        catalogNo: catalogNo ? catalogNo.trim() : '',
        machineCompatibility: machineCompatibility ? machineCompatibility.trim() : '',
        purchasedUnit: pUnit,
        converterFactor: convFactor,
        packSizeDescription: packSizeDescription ? packSizeDescription.trim() : (convFactor === 1 ? `${pUnit} (As-is)` : `${pUnit} of ${convFactor} ${cUnit}s`),
        consumptionUnit: cUnit,
        issueMultiplier: Number.isFinite(Number(issueMultiplier)) ? Number(issueMultiplier) : 1,
        isActive: true
      }],
      purchasedUnit: pUnit,
      converterFactor: convFactor,
      packSizeDescription: packSizeDescription ? packSizeDescription.trim() : (convFactor === 1 ? `${pUnit} (As-is)` : `${pUnit} of ${convFactor} ${cUnit}s`),
      consumptionUnit: cUnit,
      issueMultiplier: Number.isFinite(Number(issueMultiplier)) ? Number(issueMultiplier) : 1,
      packagingHierarchy: finalPackagingHierarchy,
      status: status || 'Active'
    });

    try {
      await AuditLog.create({
        tenantId: req.tenantId,
        actor: req.user?.staff_id || req.user?.id || 'system',
        actorName: req.user?.name || 'Staff',
        actorRole: req.user?.role || 'Pharmacist',
        action: 'ITEM_MASTER_CREATED',
        target: item.itemCode,
        metadata: {
          itemCode: item.itemCode,
          genericName: item.genericName,
          brandName: item.brandName,
          purchasedUnit: item.purchasedUnit,
          consumptionUnit: item.consumptionUnit,
          converterFactor: item.converterFactor
        }
      });
    } catch (auditErr) {
      console.warn('[ITEM MASTER] AuditLog creation warning:', auditErr.message);
    }

    const io = req.app.get('io');
    if (io && req.tenantId) {
      io.to(req.tenantId).emit('data_changed', { type: 'item_master' });
    }

    res.status(201).json(formatItemWithManufacturers(item.toObject ? item.toObject() : item));
  } catch (error) {
    console.error('Create item master error:', error);
    if (error.code === 11000) {
      return res.status(400).json({ error: 'Duplicate Item Code constraint violation' });
    }
    res.status(400).json({ error: error.message });
  }
});

// PUT /api/item-master/:id — Update existing item
router.put('/:id', async (req, res) => {
  try {
    const isAllowed = await checkItemMasterAuthorization(req);
    if (!isAllowed) {
      return res.status(403).json({ error: 'Access denied: Requires Item Master permission (ph-itemmaster or Admin)' });
    }

    // Block hospital users from editing GLOBAL items
    const existingItem = await ItemMaster.findById(req.params.id).lean();
    if (existingItem && existingItem.scope === 'GLOBAL' && !isSuperAdminUser(req)) {
      return res.status(403).json({ error: 'Hospital users cannot modify Global Catalog items. Contact Super Admin.' });
    }

    const {
      genericName,
      brandName,
      itemName,
      itemDescription,
      categoryType,
      departmentType,
      itemType,
      hsnCode,
      defaultGst,
      storageTemperature,
      itemSpecification,
      makeModelNo,
      barcodeOption,
      barcodeFormat,
      isExpirable,
      expiryCutoffDays,
      inventoryRule,
      manufacturer,
      catalogNo,
      machineCompatibility,
      manufacturers,
      purchasedUnit,
      converterFactor,
      packSizeDescription,
      consumptionUnit,
      issueMultiplier,
      status
    } = req.body;

    const updateData = {};
    if (genericName !== undefined || itemName !== undefined) updateData.genericName = (genericName || itemName).trim();
    if (brandName !== undefined) updateData.brandName = brandName.trim();
    if (itemDescription !== undefined) updateData.itemDescription = itemDescription.trim();
    if (categoryType !== undefined) updateData.categoryType = categoryType.trim();
    if (departmentType !== undefined) updateData.departmentType = departmentType.trim();
    if (itemType !== undefined) updateData.itemType = itemType;
    if (hsnCode !== undefined) updateData.hsnCode = hsnCode.trim();
    if (defaultGst !== undefined) updateData.defaultGst = Number(defaultGst) || 0;
    if (storageTemperature !== undefined) updateData.storageTemperature = storageTemperature;
    if (itemSpecification !== undefined) updateData.itemSpecification = itemSpecification.trim();
    if (makeModelNo !== undefined) updateData.makeModelNo = makeModelNo.trim();
    if (barcodeOption !== undefined) updateData.barcodeOption = barcodeOption;
    if (barcodeFormat !== undefined) updateData.barcodeFormat = barcodeFormat;
    if (isExpirable !== undefined) updateData.isExpirable = Boolean(isExpirable);
    if (expiryCutoffDays !== undefined) updateData.expiryCutoffDays = Number(expiryCutoffDays) || 0;
    if (inventoryRule !== undefined) updateData.inventoryRule = inventoryRule;
    if (manufacturer !== undefined) updateData.manufacturer = manufacturer.trim();
    if (catalogNo !== undefined) updateData.catalogNo = catalogNo.trim();
    if (machineCompatibility !== undefined) updateData.machineCompatibility = machineCompatibility.trim();
    if (manufacturers !== undefined && Array.isArray(manufacturers)) {
      updateData.manufacturers = manufacturers;
      if (manufacturers.length > 0 && manufacturer === undefined) {
        updateData.manufacturer = manufacturers[0].manufacturer || '';
        if (catalogNo === undefined && manufacturers[0].catalogNo) updateData.catalogNo = manufacturers[0].catalogNo;
        if (machineCompatibility === undefined && manufacturers[0].machineCompatibility) updateData.machineCompatibility = manufacturers[0].machineCompatibility;
      }
    }
    if (purchasedUnit !== undefined) updateData.purchasedUnit = purchasedUnit.trim();
    if (converterFactor !== undefined) {
      const conv = Number(converterFactor);
      if (conv < 1) return res.status(400).json({ error: 'Converter factor must be at least 1' });
      updateData.converterFactor = conv;
    }
    if (packSizeDescription !== undefined) updateData.packSizeDescription = packSizeDescription.trim();
    if (consumptionUnit !== undefined) updateData.consumptionUnit = consumptionUnit.trim();
    if (issueMultiplier !== undefined) updateData.issueMultiplier = Number(issueMultiplier) || 1;
    if (status !== undefined) updateData.status = status;

    if (req.body.packagingHierarchy !== undefined && typeof req.body.packagingHierarchy === 'object') {
      const ph = req.body.packagingHierarchy;
      updateData.packagingHierarchy = ph;
      if (!ph.isBrokenDown) {
        updateData.converterFactor = 1;
        if (updateData.purchasedUnit) {
          updateData.consumptionUnit = updateData.purchasedUnit;
        }
      } else if (Array.isArray(ph.levels) && ph.levels.length > 0) {
        let pUnit = (updateData.purchasedUnit || '').toLowerCase();
        if (!pUnit) {
          const cur = await ItemMaster.findOne({ _id: req.params.id, tenantId: req.tenantId }).lean();
          pUnit = (cur?.purchasedUnit || 'Box').toLowerCase();
        }
        const chain = [pUnit];
        for (let i = 0; i < ph.levels.length; i++) {
          const lvl = ph.levels[i];
          const parent = String(lvl.parentUnit || (i === 0 ? pUnit : ph.levels[i - 1]?.childUnit) || '').trim().toLowerCase();
          const child = String(lvl.childUnit || '').trim().toLowerCase();
          const q = Number(lvl.quantity);

          if (!child) {
            return res.status(400).json({ error: `Packaging level ${i + 1} child unit is required` });
          }
          if (!Number.isFinite(q) || q < 1) {
            return res.status(400).json({ error: `Packaging level ${i + 1} quantity must be 1 or greater` });
          }
          if (parent && parent === child) {
            return res.status(400).json({ error: 'Each packaging level must use a different unit.' });
          }
          if (chain.length > 0 && chain[chain.length - 1] === child) {
            return res.status(400).json({ error: 'Each packaging level must use a different unit.' });
          }
          chain.push(child);
        }

        const computedFactor = ph.levels.reduce((acc, lvl) => {
          const q = Number(lvl.quantity);
          return acc * (Number.isFinite(q) && q > 0 ? q : 1);
        }, 1);
        updateData.converterFactor = Math.max(1, computedFactor);
        const lastLvl = ph.levels[ph.levels.length - 1];
        if (lastLvl && lastLvl.childUnit) {
          updateData.consumptionUnit = String(lastLvl.childUnit).trim();
        }
      }
    }

    // Mutability Guard: Prevent modifying packaging conversion units or factor if active batch stock exists
    if (converterFactor !== undefined || purchasedUnit !== undefined || consumptionUnit !== undefined || req.body.packagingHierarchy !== undefined) {
      const activeBatch = await MedicineBatch.findOne({
        tenantId: req.tenantId,
        itemMasterId: req.params.id,
        availableQuantity: { $gt: 0 }
      });
      if (activeBatch) {
        const currentItem = await ItemMaster.findOne({ _id: req.params.id, tenantId: req.tenantId });
        if (currentItem) {
          const candidateConv = updateData.converterFactor !== undefined ? updateData.converterFactor : (converterFactor !== undefined ? Number(converterFactor) : undefined);
          const candidatePurch = updateData.purchasedUnit !== undefined ? updateData.purchasedUnit : (purchasedUnit !== undefined ? purchasedUnit.trim() : undefined);
          const candidateCons = updateData.consumptionUnit !== undefined ? updateData.consumptionUnit : (consumptionUnit !== undefined ? consumptionUnit.trim() : undefined);

          const isConvChanged = candidateConv !== undefined && Number(candidateConv) !== Number(currentItem.converterFactor);
          const isPurchUnitChanged = candidatePurch !== undefined && candidatePurch.toLowerCase() !== (currentItem.purchasedUnit || '').toLowerCase();
          const isConsUnitChanged = candidateCons !== undefined && candidateCons.toLowerCase() !== (currentItem.consumptionUnit || '').toLowerCase();
          if (isConvChanged || isPurchUnitChanged || isConsUnitChanged) {
            return res.status(400).json({
              error: 'Cannot modify packaging units or converterFactor while active batch inventory exists for this item master.'
            });
          }
        }
      }
    }

    const item = await ItemMaster.findOneAndUpdate(
      { _id: req.params.id, tenantId: req.tenantId },
      updateData,
      { returnDocument: 'after' }
    );

    if (!item) {
      return res.status(404).json({ error: 'Item Master record not found' });
    }

    try {
      await AuditLog.create({
        tenantId: req.tenantId,
        actor: req.user?.staff_id || req.user?.id || 'system',
        actorName: req.user?.name || 'Staff',
        actorRole: req.user?.role || 'Pharmacist',
        action: 'ITEM_MASTER_UPDATED',
        target: item.itemCode,
        metadata: { itemCode: item.itemCode, updatedFields: Object.keys(updateData) }
      });
    } catch (auditErr) {
      console.warn('[ITEM MASTER] AuditLog creation warning:', auditErr.message);
    }

    const io = req.app.get('io');
    if (io && req.tenantId) {
      io.to(req.tenantId).emit('data_changed', { type: 'item_master' });
    }

    res.json(formatItemWithManufacturers(item.toObject ? item.toObject() : item));
  } catch (error) {
    console.error('Update item master error:', error);
    res.status(400).json({ error: error.message });
  }
});

// PUT /api/item-master/:id/toggle-status — Toggle Active/Inactive
router.put('/:id/toggle-status', async (req, res) => {
  try {
    const isAllowed = await checkItemMasterAuthorization(req);
    if (!isAllowed) {
      return res.status(403).json({ error: 'Access denied: Requires Item Master permission (ph-itemmaster or Admin)' });
    }

    // Super admins can toggle any item; hospital users can only toggle their own non-global items
    let current;
    if (isSuperAdminUser(req)) {
      current = await ItemMaster.findById(req.params.id);
    } else {
      current = await ItemMaster.findOne({ _id: req.params.id, tenantId: req.tenantId });
      if (current && current.scope === 'GLOBAL') {
        return res.status(403).json({ error: 'Hospital users cannot change status of Global Catalog items.' });
      }
    }
    if (!current) {
      return res.status(404).json({ error: 'Item Master record not found' });
    }

    current.status = current.status === 'Active' ? 'Inactive' : 'Active';
    await current.save();

    const io = req.app.get('io');
    if (io && req.tenantId) {
      io.to(req.tenantId).emit('data_changed', { type: 'item_master' });
    }

    res.json({ success: true, data: current });
  } catch (error) {
    console.error('Toggle status error:', error);
    res.status(400).json({ error: error.message });
  }
});

module.exports = router;
