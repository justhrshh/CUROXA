const express = require('express');
const router = express.Router();
const ItemMaster = require('../models/ItemMaster');
const HospitalMasterConfig = require('../models/HospitalMasterConfig');
const SuperAdminAudit = require('../models/SuperAdminAudit');
const SuperAdminHospital = require('../models/SuperAdminHospital');
const { verifyToken, isSuperAdmin } = require('../middleware/authMiddleware');
const {
  MASTER_SCHEMA_REGISTRY,
  getCategoryConfig,
  getDepartmentFields,
  getAllCategories,
  isColumnValidForCategory
} = require('../config/masterSchemaRegistry');
const { getNextMasterItemCode } = require('../utils/masterItemCodeGenerator');
const {
  generateMasterExportWorkbook,
  generateHospitalCommercialExportWorkbook,
  generateCanonicalMasterExportWorkbook
} = require('../services/masterExportService');

/**
 * GET /api/superadmin/masters/next-code
 * Query params: ?category=...
 * Returns next concurrency-safe itemCode respecting client numbering prefix
 */
router.get('/next-code', async (req, res) => {
  try {
    const { category } = req.query;
    if (!category) {
      return res.status(400).json({ error: 'category query parameter is required' });
    }
    const catConfig = getCategoryConfig(category);
    if (!catConfig) {
      return res.status(404).json({ error: `Category '${category}' not found in registry` });
    }
    const nextCode = await getNextMasterItemCode(category, '__global__');
    res.json({ success: true, category, nextCode });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.use(verifyToken);

// ─────────────────────────────────────────────────────────────────────────────
// SCHEMA REGISTRY & METADATA ENDPOINTS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * GET /api/superadmin/masters/registry
 * Returns the entire Master Schema Registry specification
 */
router.get('/registry', (req, res) => {
  res.json({
    success: true,
    data: MASTER_SCHEMA_REGISTRY
  });
});

/**
 * GET /api/superadmin/masters/categories
 * Returns lightweight list of categories, their departments, and status
 */
router.get('/categories', (req, res) => {
  res.json({
    success: true,
    data: getAllCategories()
  });
});

/**
 * GET /api/superadmin/masters/category-fields
 * Query params: ?category=...&department=...
 * Returns the exact field list for the requested category + department
 */
router.get('/category-fields', (req, res) => {
  const { category, department } = req.query;
  if (!category) {
    return res.status(400).json({ error: 'category query parameter is required' });
  }
  const catConfig = getCategoryConfig(category);
  if (!catConfig) {
    return res.status(404).json({ error: `Category '${category}' not found in registry` });
  }
  if (catConfig.status === 'SOURCE-CONFIRMATION-REQUIRED') {
    return res.json({
      success: true,
      status: 'SOURCE-CONFIRMATION-REQUIRED',
      message: `Category '${category}' is a product requirement awaiting client specification`,
      fields: []
    });
  }
  const fields = getDepartmentFields(category, department);
  res.json({
    success: true,
    category,
    department: department || (catConfig.hasDepartment ? null : 'N/A'),
    fields
  });
});
// ─────────────────────────────────────────────────────────────────────────────
// CANONICAL GLOBAL MASTER ITEMS (SuperAdmin only)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * GET /api/superadmin/masters/items
 * List global canonical master items with category, department, status, and search filters
 */
router.get('/items', async (req, res) => {
  try {
    const { category, department, status, search } = req.query;
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 25));

    const conditions = [{ scope: 'GLOBAL' }];

    if (category && category !== 'all') {
      conditions.push({
        $or: [{ category }, { categoryType: category }]
      });
    }
    if (department && department !== 'all') {
      const depts = (Array.isArray(department) ? department : String(department).split(','))
        .map(d => d.trim())
        .filter(d => d && d !== 'all');
      if (depts.length === 1) {
        conditions.push({
          $or: [{ department: depts[0] }, { departmentType: depts[0] }]
        });
      } else if (depts.length > 1) {
        conditions.push({
          $or: [
            { department: { $in: depts } },
            { departmentType: { $in: depts } }
          ]
        });
      }
    }
    if (status && status !== 'all') {
      conditions.push({ status });
    }
    if (search && search.trim()) {
      const escaped = search.trim().replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');
      const r = new RegExp(escaped, 'i');
      conditions.push({
        $or: [
          { itemCode: r },
          { itemName: r },
          { genericName: r },
          { brandName: r },
          { manufacturer: r },
          { manufactureName: r },
          { doctorsName: r },
          { doctorId: r }
        ]
      });
    }

    const query = conditions.length === 1 ? conditions[0] : { $and: conditions };

    const skip = (page - 1) * limit;
    const [items, total] = await Promise.all([
      ItemMaster.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      ItemMaster.countDocuments(query)
    ]);

    res.json({
      success: true,
      data: items,
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
 * GET /api/superadmin/masters/items/:id
 * Retrieve a single global master item
 */
router.get('/items/:id', async (req, res) => {
  try {
    const item = await ItemMaster.findOne({ _id: req.params.id, scope: 'GLOBAL' }).lean();
    if (!item) {
      return res.status(404).json({ error: 'Global master item not found' });
    }
    res.json({ success: true, data: item });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/superadmin/masters/items
 * Create a new canonical global master item
 */
router.post('/items', isSuperAdmin, async (req, res) => {
  try {
    const { category, department, itemName, itemCode: providedCode, categoryData = {}, ...rest } = req.body;

    if (!category) {
      return res.status(400).json({ error: 'Category is required' });
    }
    const catConfig = getCategoryConfig(category);
    if (!catConfig) {
      return res.status(400).json({ error: `Invalid category: '${category}'` });
    }
    if (catConfig.status === 'SOURCE-CONFIRMATION-REQUIRED') {
      return res.status(400).json({ error: `Category '${category}' is pending client specification and cannot accept records yet` });
    }
    if (catConfig.hasDepartment && !department) {
      return res.status(400).json({ error: `Department is required for category '${category}'` });
    }

    // Determine final ItemCode
    const finalCode = providedCode && String(providedCode).trim()
      ? String(providedCode).trim().toUpperCase()
      : await getNextMasterItemCode(category, '__global__');

    // Duplicate check in Global scope
    const existing = await ItemMaster.findOne({
      tenantId: '__global__',
      itemCode: finalCode
    }).lean();

    if (existing) {
      return res.status(409).json({ error: `ItemCode '${finalCode}' already exists in Global Catalog` });
    }

    // Resolve name
    const effectiveName = itemName || rest.genericName || rest.brandName || categoryData.itemName || categoryData.genericName || 'Unnamed Master Item';

    // Construct item payload preserving canonical fields
    const newItemPayload = {
      scope: 'GLOBAL',
      tenantId: '__global__',
      itemCode: finalCode,
      category,
      department: catConfig.hasDepartment ? department : '',
      categoryType: category,
      departmentType: catConfig.hasDepartment ? department : 'General',
      itemName: effectiveName,
      genericName: rest.genericName || effectiveName,
      brandName: rest.brandName || effectiveName,
      itemDescription: rest.itemDescription || categoryData.description || '',
      categoryData,
      // Canonical procurement unit compatibility
      purchasedUnit: rest.purchasedUnit || categoryData.purchasedUnit || 'Unit',
      consumptionUnit: rest.consumptionUnit || categoryData.consumptionUnit || 'Unit',
      converterFactor: Number(rest.converterFactor || categoryData.converter) || 1,
      packSizeDescription: rest.packSizeDescription || categoryData.packSize || '',
      issueMultiplier: Number(rest.issueMultiplier || categoryData.issueMultiplier) || 0,
      hsnCode: rest.hsnCode || categoryData.hsnCode || '',
      defaultGst: Number(rest.defaultGst || categoryData.gstnTax) || 5,
      isExpirable: rest.isExpirable !== undefined ? rest.isExpirable : (categoryData.expirable === 'Yes'),
      expiryCutoffDays: Number(rest.expiryCutoffDays || categoryData.expiryDateCutoff) || 0,
      manufacturer: rest.manufacturer || categoryData.manufactureName || '',
      catalogNo: rest.catalogNo || categoryData.catalogNo || '',
      // Direct indexed Excel attributes
      sampleType: categoryData.sampleType || rest.sampleType || '',
      gender: categoryData.gender || rest.gender || '',
      sampleOption: categoryData.sampleOption || rest.sampleOption || '',
      doctorsName: categoryData.doctorsName || rest.doctorsName || '',
      doctorId: categoryData.doctorId || rest.doctorId || '',
      machineId: categoryData.machineId || rest.machineId || '',
      machineName: categoryData.machineName || rest.machineName || '',
      manufactureId: categoryData.manufactureId || rest.manufactureId || '',
      manufactureName: categoryData.manufactureName || rest.manufactureName || '',
      status: rest.status || categoryData.status || 'Active',
      createdByAdmin: req.user?.staff_id || req.user?.id || 'superadmin'
    };

    const doc = await ItemMaster.create(newItemPayload);

    // Audit Log
    try {
      await SuperAdminAudit.create({
        user: req.user?.name || 'Super Admin',
        action: 'GLOBAL_MASTER_ITEM_CREATED',
        details: `Created master item [${finalCode}] "${effectiveName}" in ${category}${department ? ' / ' + department : ''}`,
        ip: req.ip || ''
      });
    } catch (_) {}

    res.status(201).json({ success: true, data: doc });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ error: 'Duplicate key error: An item with this code already exists' });
    }
    res.status(400).json({ error: err.message });
  }
});

/**
 * PUT /api/superadmin/masters/items/:id
 * Update a canonical global master item
 */
router.put('/items/:id', isSuperAdmin, async (req, res) => {
  try {
    const item = await ItemMaster.findOne({ _id: req.params.id, scope: 'GLOBAL' });
    if (!item) {
      return res.status(404).json({ error: 'Global master item not found' });
    }

    const { category, department, itemName, categoryData, ...rest } = req.body;

    if (category) {
      item.category = category;
      item.categoryType = category;
    }
    if (department !== undefined) {
      item.department = department;
      item.departmentType = department || 'General';
    }
    if (itemName) {
      item.itemName = itemName;
      item.genericName = itemName;
      item.brandName = itemName;
    }
    if (categoryData) {
      item.categoryData = { ...item.categoryData, ...categoryData };
    }

    // Update canonical fields
    Object.keys(rest).forEach(k => {
      if (k !== '_id' && k !== 'itemCode' && k !== 'scope' && k !== 'tenantId') {
        item[k] = rest[k];
      }
    });

    item.lastModifiedByAdmin = req.user?.staff_id || req.user?.id || 'superadmin';
    await item.save();

    try {
      await SuperAdminAudit.create({
        user: req.user?.name || 'Super Admin',
        action: 'GLOBAL_MASTER_ITEM_UPDATED',
        details: `Updated master item [${item.itemCode}] "${item.itemName}"`,
        ip: req.ip || ''
      });
    } catch (_) {}

    res.json({ success: true, data: item });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// HOSPITAL MASTER CONFIGURATION (Tenant Association & Price Isolation)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * GET /api/superadmin/masters/hospital-configs
 * Query hospital assignments with optional tenantId, category, and department filters
 */
router.get('/hospital-configs', async (req, res) => {
  try {
    const { tenantId, category, department, status } = req.query;
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 25));

    const isPlatformAdmin = ['superadmin', 'super_admin', 'platform_admin'].includes((req.user?.role || '').toLowerCase());
    
    // Non-superadmins are strictly locked to their own tenantId
    const effectiveTenantId = isPlatformAdmin ? (tenantId || undefined) : req.tenantId;

    const query = {};
    if (effectiveTenantId) query.tenantId = effectiveTenantId;
    if (category && category !== 'all') query.category = category;
    if (department && department !== 'all') query.department = department;
    if (status && status !== 'all') query.status = status;

    const skip = (page - 1) * limit;
    const [configs, total] = await Promise.all([
      HospitalMasterConfig.find(query)
        .populate('masterItemId')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      HospitalMasterConfig.countDocuments(query)
    ]);

    res.json({
      success: true,
      data: configs,
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
 * POST /api/superadmin/masters/hospital-configs/assign
 * Assigns a canonical global master item to a specific hospital with hospital-specific pricing
 * Enforces compound unique index: { tenantId: 1, masterItemId: 1 }
 */
router.post('/hospital-configs/assign', isSuperAdmin, async (req, res) => {
  try {
    const { tenantId, masterItemId, mrp = 0, netRate = 0, hospitalCost = 0, status = 'Active', assignedVia = 'DIRECT_ADMIN' } = req.body;

    if (!tenantId || !tenantId.trim()) {
      return res.status(400).json({ error: 'tenantId is required' });
    }
    if (!masterItemId) {
      return res.status(400).json({ error: 'masterItemId is required' });
    }

    const masterItem = await ItemMaster.findOne({ _id: masterItemId, scope: 'GLOBAL' }).lean();
    if (!masterItem) {
      return res.status(404).json({ error: 'Specified global master item not found' });
    }

    // Enforce compound uniqueness: check if already assigned to this hospital
    const existingConfig = await HospitalMasterConfig.findOne({
      tenantId: tenantId.trim().toLowerCase(),
      masterItemId
    }).lean();

    if (existingConfig) {
      return res.status(409).json({
        error: `Item [${masterItem.itemCode}] is already assigned to hospital '${tenantId}'`,
        existingConfigId: existingConfig._id
      });
    }

    const newConfig = await HospitalMasterConfig.create({
      tenantId: tenantId.trim().toLowerCase(),
      masterItemId,
      category: masterItem.category || masterItem.categoryType,
      department: masterItem.department || masterItem.departmentType || '',
      mrp: Number(mrp) || 0,
      netRate: Number(netRate) || 0,
      hospitalCost: Number(hospitalCost) || 0,
      status,
      approvalStatus: 'Approved',
      assignedVia,
      assignedBy: req.user?.staff_id || req.user?.id || 'superadmin',
      lastUpdatedBy: req.user?.staff_id || req.user?.id || 'superadmin'
    });

    try {
      await SuperAdminAudit.create({
        user: req.user?.name || 'Super Admin',
        action: 'HOSPITAL_MASTER_ASSIGNED',
        details: `Assigned [${masterItem.itemCode}] "${masterItem.itemName}" to hospital "${tenantId}" (MRP: ${mrp}, Net: ${netRate})`,
        ip: req.ip || ''
      });
    } catch (_) {}

    res.status(201).json({ success: true, data: newConfig });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ error: 'Compound uniqueness constraint violation: item already assigned to this hospital' });
    }
    res.status(400).json({ error: err.message });
  }
});

/**
 * PUT /api/superadmin/masters/hospital-configs/:id
 * Update hospital-specific pricing (mrp, netRate) and status without altering global master
 */
router.put('/hospital-configs/:id', isSuperAdmin, async (req, res) => {
  try {
    const config = await HospitalMasterConfig.findById(req.params.id);
    if (!config) {
      return res.status(404).json({ error: 'Hospital master configuration not found' });
    }

    const { mrp, netRate, hospitalCost, status } = req.body;

    if (mrp !== undefined) config.mrp = Number(mrp) || 0;
    if (netRate !== undefined) config.netRate = Number(netRate) || 0;
    if (hospitalCost !== undefined) config.hospitalCost = Number(hospitalCost) || 0;
    if (status) config.status = status;

    config.lastUpdatedBy = req.user?.staff_id || req.user?.id || 'superadmin';
    await config.save();

    try {
      await SuperAdminAudit.create({
        user: req.user?.name || 'Super Admin',
        action: 'HOSPITAL_MASTER_PRICE_UPDATED',
        details: `Updated hospital config ${config._id} for tenant "${config.tenantId}" (MRP: ${config.mrp}, Net: ${config.netRate}, Status: ${config.status})`,
        ip: req.ip || ''
      });
    } catch (_) {}

    res.json({ success: true, data: config });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

/**
 * DELETE /api/superadmin/masters/hospital-configs/:id
 * Remove a master item configuration from a hospital tenant
 */
router.delete('/hospital-configs/:id', isSuperAdmin, async (req, res) => {
  try {
    const config = await HospitalMasterConfig.findById(req.params.id);
    if (!config) {
      return res.status(404).json({ error: 'Hospital master configuration not found' });
    }

    await HospitalMasterConfig.findByIdAndDelete(req.params.id);

    try {
      await SuperAdminAudit.create({
        user: req.user?.name || 'Super Admin',
        action: 'HOSPITAL_MASTER_UNASSIGNED',
        details: `Removed assignment of item ${config.masterItemId} from hospital "${config.tenantId}"`,
        ip: req.ip || ''
      });
    } catch (_) {}

    res.json({ success: true, message: 'Hospital master item assignment removed successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/superadmin/masters/hospitals-list
 * Lightweight list of hospitals for tenant selector dropdown
 */
router.get('/hospitals-list', async (req, res) => {
  try {
    let hospitals = await SuperAdminHospital.find({ status: { $ne: 'Deleted' } })
      .select('name code hospitalId status')
      .sort({ name: 1 })
      .lean();

    if (!hospitals || hospitals.length === 0) {
      const distinctTenants = await HospitalMasterConfig.distinct('tenantId');
      hospitals = distinctTenants.map(t => ({ name: t, code: t, hospitalId: t }));
    }

    res.json({ success: true, data: hospitals });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/superadmin/masters/unassigned-global-items
 * Query global items not yet assigned to the specified hospital tenant
 */
router.get('/unassigned-global-items', async (req, res) => {
  try {
    const { tenantId, category, department, search } = req.query;
    if (!tenantId || !tenantId.trim()) {
      return res.status(400).json({ error: 'tenantId query parameter is required' });
    }

    const assignedIds = await HospitalMasterConfig.find({
      tenantId: tenantId.trim().toLowerCase()
    }).distinct('masterItemId');

    const conditions = [
      { scope: 'GLOBAL' },
      { _id: { $nin: assignedIds } }
    ];

    if (category && category !== 'all') {
      conditions.push({
        $or: [{ category }, { categoryType: category }]
      });
    }
    if (department && department !== 'all') {
      const depts = (Array.isArray(department) ? department : String(department).split(','))
        .map(d => d.trim())
        .filter(d => d && d !== 'all');
      if (depts.length === 1) {
        conditions.push({
          $or: [{ department: depts[0] }, { departmentType: depts[0] }]
        });
      } else if (depts.length > 1) {
        conditions.push({
          $or: [
            { department: { $in: depts } },
            { departmentType: { $in: depts } }
          ]
        });
      }
    }
    if (search && search.trim()) {
      const escaped = search.trim().replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');
      const r = new RegExp(escaped, 'i');
      conditions.push({
        $or: [
          { itemCode: r },
          { itemName: r },
          { genericName: r },
          { brandName: r }
        ]
      });
    }

    const query = { $and: conditions };

    const items = await ItemMaster.find(query).limit(50).lean();
    res.json({ success: true, data: items });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// QUROXA GLOBAL MASTER EXPORT ENDPOINTS (Department-Wise)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * GET /api/superadmin/masters/export/excel
 * Query params: ?category=...&department=...
 * Generates and streams upload-compatible department-wise Master Excel workbook
 */
router.get('/export/excel', async (req, res) => {
  try {
    const { category, department, exportType = 'HOSPITAL_COMMERCIAL' } = req.query;
    if (!category) {
      return res.status(400).json({ error: 'category query parameter is required' });
    }

    const effectiveDept = (department && department !== 'all') ? department : '';

    const result = exportType === 'GLOBAL_CANONICAL'
      ? await generateCanonicalMasterExportWorkbook(category, effectiveDept)
      : await generateHospitalCommercialExportWorkbook(category, effectiveDept, null, { tenantId: req.query.tenantId });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
    res.setHeader('X-Item-Count', result.itemCount);
    res.setHeader('X-Export-Type', result.exportType || exportType);
    res.send(result.buffer);
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

/**
 * GET /api/superadmin/masters/export/data
 * Query params: ?category=...&department=...
 * Returns all global master records for category + department for client-side PDF export
 */
router.get('/export/data', async (req, res) => {
  try {
    const { category, department } = req.query;
    if (!category) {
      return res.status(400).json({ error: 'category query parameter is required' });
    }

    const catConfig = getCategoryConfig(category);
    if (!catConfig) {
      return res.status(400).json({ error: `Invalid category: "${category}"` });
    }

    const query = {
      scope: 'GLOBAL',
      $or: [{ category }, { categoryType: category }]
    };

    let depts = [];
    if (catConfig.hasDepartment && department && department !== 'all') {
      depts = (Array.isArray(department) ? department : String(department).split(','))
        .map(d => d.trim())
        .filter(d => d && d !== 'all');
      if (depts.length === 1) {
        query.$and = [
          { $or: [{ department: depts[0] }, { departmentType: depts[0] }] }
        ];
      } else if (depts.length > 1) {
        query.$and = [
          { $or: [{ department: { $in: depts } }, { departmentType: { $in: depts } }] }
        ];
      }
    }

    const items = await ItemMaster.find(query).sort({ itemCode: 1 }).lean();
    res.json({
      success: true,
      category,
      department: depts.length > 0 ? depts.join(', ') : (catConfig.hasDepartment ? 'All Departments' : 'N/A'),
      total: items.length,
      data: items
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// HOSPITAL-SCOPED CATALOG VIEW (Tenant Isolated)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * GET /api/superadmin/masters/my-catalog
 * Enables hospital staff to query ONLY items configured and active for their hospital
 */
router.get('/my-catalog', async (req, res) => {
  try {
    const hospitalTenant = req.tenantId;
    if (!hospitalTenant || hospitalTenant === '__global__') {
      return res.status(400).json({ error: 'Valid hospital tenant context required' });
    }

    const { category, department, search } = req.query;
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 25));

    const query = {
      tenantId: hospitalTenant,
      status: 'Active',
      approvalStatus: 'Approved'
    };

    if (category && category !== 'all') query.category = category;
    if (department && department !== 'all') query.department = department;

    const skip = (page - 1) * limit;
    const [configs, total] = await Promise.all([
      HospitalMasterConfig.find(query)
        .populate('masterItemId')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      HospitalMasterConfig.countDocuments(query)
    ]);

    // Map into clean consumer format combining canonical master attributes with hospital price
    let items = configs.map(c => {
      const m = c.masterItemId || {};
      return {
        configId: c._id,
        masterItemId: m._id,
        itemCode: m.itemCode,
        itemName: m.itemName || m.genericName || m.brandName,
        category: c.category,
        department: c.department,
        hospitalMrp: c.mrp,
        hospitalNetRate: c.netRate,
        hospitalCost: c.hospitalCost,
        purchasedUnit: m.purchasedUnit,
        consumptionUnit: m.consumptionUnit,
        converterFactor: m.converterFactor,
        packSizeDescription: m.packSizeDescription,
        manufacturer: m.manufacturer || m.manufactureName,
        categoryData: m.categoryData || {},
        status: c.status
      };
    });

    if (search && search.trim()) {
      const s = search.trim().toLowerCase();
      items = items.filter(it =>
        (it.itemCode && it.itemCode.toLowerCase().includes(s)) ||
        (it.itemName && it.itemName.toLowerCase().includes(s)) ||
        (it.manufacturer && it.manufacturer.toLowerCase().includes(s))
      );
    }

    res.json({
      success: true,
      tenantId: hospitalTenant,
      data: items,
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

module.exports = router;
