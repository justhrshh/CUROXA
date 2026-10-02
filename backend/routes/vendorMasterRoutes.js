const express = require('express');
const GlobalVendor = require('../models/GlobalVendor');
const HospitalVendorAssociation = require('../models/HospitalVendorAssociation');
const VendorRequest = require('../models/VendorRequest');
const SuperAdminAudit = require('../models/SuperAdminAudit');
const SuperAdminHospital = require('../models/SuperAdminHospital');
const { verifyToken, isSuperAdmin } = require('../middleware/authMiddleware');
const { getNextGlobalVendorCode, getNextVendorRequestNo } = require('../utils/vendorCodeGenerator');
const { generateVendorExportWorkbook } = require('../services/vendorExportService');
const { VENDOR_FIELDS } = require('../config/vendorSchemaRegistry');

// ─────────────────────────────────────────────────────────────────────────────
// 1. SUPERADMIN VENDOR MASTER ROUTER
// ─────────────────────────────────────────────────────────────────────────────
const superAdminRouter = express.Router();
superAdminRouter.use(verifyToken);

/**
 * GET /api/superadmin/vendors
 * List global vendors with search, status filtering, and pagination
 */
superAdminRouter.get('/', async (req, res) => {
  try {
    const { search, status, page = 1, limit = 25 } = req.query;
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 25));

    const conditions = [];

    if (status && status !== 'all') {
      conditions.push({ activeStatus: { $regex: new RegExp(`^${status}$`, 'i') } });
    }

    if (search && search.trim()) {
      const escaped = search.trim().replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');
      const r = new RegExp(escaped, 'i');
      conditions.push({
        $or: [
          { supplierName: r },
          { supplierCode: r },
          { gstNo: r },
          { panCardNo: r },
          { emailId: r },
          { primaryContactPerson: r },
          { primaryContactPersonMobileNo: r },
          { cinNo: r }
        ]
      });
    }

    const query = conditions.length === 0 ? {} : (conditions.length === 1 ? conditions[0] : { $and: conditions });
    const skip = (pageNum - 1) * limitNum;

    const [vendors, total] = await Promise.all([
      GlobalVendor.find(query).sort({ createdAt: -1 }).skip(skip).limit(limitNum).lean(),
      GlobalVendor.countDocuments(query)
    ]);

    res.json({
      success: true,
      data: vendors,
      pagination: {
        total,
        page: pageNum,
        limit: limitNum,
        pages: Math.ceil(total / limitNum) || 1
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/superadmin/vendors/export
 * Download Excel workbook with all 49 fields matching source structure
 */
superAdminRouter.get('/export', async (req, res) => {
  try {
    const { status } = req.query;
    const query = {};
    if (status && status !== 'all') {
      query.activeStatus = { $regex: new RegExp(`^${status}$`, 'i') };
    }

    const { buffer, filename, vendorCount } = await generateVendorExportWorkbook(query);

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('X-Vendor-Count', vendorCount);
    res.send(buffer);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/superadmin/vendors/:id
 * Retrieve full global vendor profile
 */
superAdminRouter.get('/:id', async (req, res) => {
  try {
    const vendor = await GlobalVendor.findById(req.params.id).lean();
    if (!vendor) {
      return res.status(404).json({ error: 'Global vendor not found' });
    }
    res.json({ success: true, data: vendor });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/superadmin/vendors
 * Create a new canonical global vendor with duplicate checks
 */
superAdminRouter.post('/', isSuperAdmin, async (req, res) => {
  try {
    const data = { ...req.body };

    if (!data.supplierName || !data.supplierName.trim()) {
      return res.status(400).json({ error: 'SupplierName is required' });
    }

    // Auto-generate supplierCode if not supplied
    if (!data.supplierCode || !data.supplierCode.trim()) {
      data.supplierCode = await getNextGlobalVendorCode();
    } else {
      data.supplierCode = data.supplierCode.trim().toUpperCase();
    }

    // Duplicate Check 1: Supplier Code
    const codeExists = await GlobalVendor.findOne({ supplierCode: data.supplierCode }).lean();
    if (codeExists) {
      return res.status(409).json({ error: `SupplierCode '${data.supplierCode}' already exists.` });
    }

    // Duplicate Check 2: GST No (if non-empty)
    if (data.gstNo && data.gstNo.trim()) {
      const cleanGst = data.gstNo.trim().toUpperCase();
      const gstExists = await GlobalVendor.findOne({ gstNo: cleanGst }).lean();
      if (gstExists) {
        return res.status(409).json({
          error: `A vendor with GSTNo '${cleanGst}' already exists: "${gstExists.supplierName}" (${gstExists.supplierCode})`
        });
      }
      data.gstNo = cleanGst;
    }

    // Duplicate Check 3: PAN Card No (if non-empty)
    if (data.panCardNo && data.panCardNo.trim()) {
      const cleanPan = data.panCardNo.trim().toUpperCase();
      const panExists = await GlobalVendor.findOne({ panCardNo: cleanPan }).lean();
      if (panExists) {
        return res.status(409).json({
          error: `A vendor with PANCardNo '${cleanPan}' already exists: "${panExists.supplierName}" (${panExists.supplierCode})`
        });
      }
      data.panCardNo = cleanPan;
    }

    // Duplicate Check 4: Supplier Name (case-insensitive exact match check)
    const nameExists = await GlobalVendor.findOne({
      supplierName: { $regex: new RegExp(`^${data.supplierName.trim().replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&')}$`, 'i') }
    }).lean();
    if (nameExists) {
      return res.status(409).json({
        error: `A vendor with name '${data.supplierName.trim()}' already exists (${nameExists.supplierCode})`
      });
    }

    data.createdByAdmin = req.user?.staff_id || req.user?.id || 'superadmin';
    const newVendor = await GlobalVendor.create(data);

    // Audit log
    try {
      await SuperAdminAudit.create({
        user: req.user?.name || 'Super Admin',
        action: 'GLOBAL_VENDOR_CREATED',
        details: `Created global vendor [${newVendor.supplierCode}] "${newVendor.supplierName}"`,
        ip: req.ip || ''
      });
    } catch (_) {}

    // Realtime notification
    const io = req.app.get("io");
    if (io) {
      io.emit("data_changed", { type: "global_vendors" });
    }

    res.status(201).json({ success: true, data: newVendor });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ error: 'Duplicate key error: Unique constraint violated on vendor' });
    }
    res.status(400).json({ error: err.message });
  }
});

/**
 * PUT /api/superadmin/vendors/:id
 * Update an existing canonical global vendor
 */
superAdminRouter.put('/:id', isSuperAdmin, async (req, res) => {
  try {
    const vendor = await GlobalVendor.findById(req.params.id);
    if (!vendor) {
      return res.status(404).json({ error: 'Global vendor not found' });
    }

    const data = { ...req.body };

    // Duplicate check on modified supplierCode
    if (data.supplierCode && data.supplierCode.trim().toUpperCase() !== vendor.supplierCode) {
      const cleanCode = data.supplierCode.trim().toUpperCase();
      const exists = await GlobalVendor.findOne({ _id: { $ne: vendor._id }, supplierCode: cleanCode }).lean();
      if (exists) {
        return res.status(409).json({ error: `SupplierCode '${cleanCode}' is already used by another vendor.` });
      }
      data.supplierCode = cleanCode;
    }

    // Duplicate check on modified GST
    if (data.gstNo && data.gstNo.trim()) {
      const cleanGst = data.gstNo.trim().toUpperCase();
      if (cleanGst !== (vendor.gstNo || '').toUpperCase()) {
        const exists = await GlobalVendor.findOne({ _id: { $ne: vendor._id }, gstNo: cleanGst }).lean();
        if (exists) {
          return res.status(409).json({ error: `GSTNo '${cleanGst}' already in use by vendor: "${exists.supplierName}"` });
        }
      }
      data.gstNo = cleanGst;
    }

    // Duplicate check on modified PAN
    if (data.panCardNo && data.panCardNo.trim()) {
      const cleanPan = data.panCardNo.trim().toUpperCase();
      if (cleanPan !== (vendor.panCardNo || '').toUpperCase()) {
        const exists = await GlobalVendor.findOne({ _id: { $ne: vendor._id }, panCardNo: cleanPan }).lean();
        if (exists) {
          return res.status(409).json({ error: `PANCardNo '${cleanPan}' already in use by vendor: "${exists.supplierName}"` });
        }
      }
      data.panCardNo = cleanPan;
    }

    // Apply updates for all valid registry fields
    VENDOR_FIELDS.forEach(f => {
      if (data[f.fieldKey] !== undefined) {
        vendor[f.fieldKey] = data[f.fieldKey];
      }
    });

    vendor.lastModifiedByAdmin = req.user?.staff_id || req.user?.id || 'superadmin';
    await vendor.save();

    try {
      await SuperAdminAudit.create({
        user: req.user?.name || 'Super Admin',
        action: 'GLOBAL_VENDOR_UPDATED',
        details: `Updated global vendor [${vendor.supplierCode}] "${vendor.supplierName}"`,
        ip: req.ip || ''
      });
    } catch (_) {}

    const io = req.app.get("io");
    if (io) {
      io.emit("data_changed", { type: "global_vendors" });
    }

    res.json({ success: true, data: vendor });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. SUPERADMIN VENDOR REQUEST REVIEW ROUTER
// ─────────────────────────────────────────────────────────────────────────────
const superAdminRequestRouter = express.Router();
superAdminRequestRouter.use(verifyToken);

/**
 * GET /api/superadmin/vendor-requests
 * Query vendor requests submitted by hospitals
 */
superAdminRequestRouter.get('/', async (req, res) => {
  try {
    const { status, tenantId, page = 1, limit = 25 } = req.query;
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 25));

    const query = {};
    if (status && status !== 'all') {
      query.status = status.toUpperCase();
    }
    if (tenantId && tenantId !== 'all') {
      query.tenantId = tenantId;
    }

    const skip = (pageNum - 1) * limitNum;
    const [requests, total] = await Promise.all([
      VendorRequest.find(query)
        .populate('approvedVendorId')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum)
        .lean(),
      VendorRequest.countDocuments(query)
    ]);

    res.json({
      success: true,
      data: requests,
      pagination: {
        total,
        page: pageNum,
        limit: limitNum,
        pages: Math.ceil(total / limitNum) || 1
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/superadmin/vendor-requests/:id
 * Retrieve single vendor request
 */
superAdminRequestRouter.get('/:id', async (req, res) => {
  try {
    const request = await VendorRequest.findById(req.params.id).populate('approvedVendorId').lean();
    if (!request) {
      return res.status(404).json({ error: 'Vendor request not found' });
    }
    res.json({ success: true, data: request });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/superadmin/vendor-requests/:id/approve
 * Approves a vendor request:
 * 1. Checks if a matching GlobalVendor exists (by GST, PAN, or Name)
 *    - If exists: reuse existing GlobalVendor
 *    - If none: create new GlobalVendor
 * 2. Automatically associates the GlobalVendor with the requesting hospital
 * 3. Updates request status to APPROVED
 */
superAdminRequestRouter.post('/:id/approve', isSuperAdmin, async (req, res) => {
  try {
    const request = await VendorRequest.findById(req.params.id);
    if (!request) {
      return res.status(404).json({ error: 'Vendor request not found' });
    }
    if (request.status !== 'PENDING' && request.status !== 'UNDER_REVIEW') {
      return res.status(400).json({ error: `Request cannot be approved from status '${request.status}'` });
    }

    const vData = request.vendorData || {};
    let globalVendor = null;

    // Check if an existing GlobalVendor matches by GST
    if (vData.gstNo && vData.gstNo.trim()) {
      globalVendor = await GlobalVendor.findOne({ gstNo: vData.gstNo.trim().toUpperCase() });
    }

    // Or check PAN
    if (!globalVendor && vData.panCardNo && vData.panCardNo.trim()) {
      globalVendor = await GlobalVendor.findOne({ panCardNo: vData.panCardNo.trim().toUpperCase() });
    }

    // Or check exact Name
    if (!globalVendor && vData.supplierName && vData.supplierName.trim()) {
      globalVendor = await GlobalVendor.findOne({
        supplierName: { $regex: new RegExp(`^${vData.supplierName.trim().replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&')}$`, 'i') }
      });
    }

    // If no existing GlobalVendor found, create a new one
    if (!globalVendor) {
      const code = vData.supplierCode && vData.supplierCode.trim()
        ? vData.supplierCode.trim().toUpperCase()
        : await getNextGlobalVendorCode();

      const newVendorPayload = {
        ...vData,
        supplierCode: code,
        supplierName: vData.supplierName || 'Unnamed Vendor',
        gstNo: vData.gstNo ? vData.gstNo.trim().toUpperCase() : '',
        panCardNo: vData.panCardNo ? vData.panCardNo.trim().toUpperCase() : '',
        activeStatus: 'Yes',
        createdByAdmin: req.user?.staff_id || req.user?.id || 'superadmin'
      };

      globalVendor = await GlobalVendor.create(newVendorPayload);
    }

    // Automatically create or update Hospital Vendor Association
    const association = await HospitalVendorAssociation.findOneAndUpdate(
      { tenantId: request.tenantId, vendorId: globalVendor._id },
      {
        tenantId: request.tenantId,
        vendorId: globalVendor._id,
        status: 'ACTIVE',
        associatedBy: req.user?.staff_id || req.user?.id || 'superadmin',
        associatedAt: new Date(),
        notes: `Approved via vendor request ${request.requestNo}`
      },
      { upsert: true, returnDocument: 'after' }
    );

    // Update the request
    request.status = 'APPROVED';
    request.approvedVendorId = globalVendor._id;
    request.reviewedBy = req.user?.staff_id || req.user?.id || 'superadmin';
    request.reviewedAt = new Date();
    await request.save();

    // Audit log
    try {
      await SuperAdminAudit.create({
        user: req.user?.name || 'Super Admin',
        action: 'VENDOR_REQUEST_APPROVED',
        details: `Approved request ${request.requestNo} for "${request.hospitalName || request.tenantId}". Associated vendor [${globalVendor.supplierCode}] "${globalVendor.supplierName}".`,
        ip: req.ip || ''
      });
    } catch (_) {}

    // Emit socket event to hospital room and platform
    const io = req.app.get("io");
    if (io) {
      io.to(request.tenantId).emit("data_changed", { type: "hospital_vendors" });
      io.to(request.tenantId).emit("data_changed", { type: "vendor_requests" });
      io.emit("data_changed", { type: "global_vendors" });
      io.emit("data_changed", { type: "vendor_requests" });
    }

    res.json({
      success: true,
      message: `Vendor request ${request.requestNo} approved and vendor associated successfully`,
      data: {
        request,
        vendor: globalVendor,
        association
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/superadmin/vendor-requests/:id/reject
 * Rejects a vendor request with mandatory reason.
 * Does NOT create GlobalVendor or Association.
 */
superAdminRequestRouter.post('/:id/reject', isSuperAdmin, async (req, res) => {
  try {
    const { rejectionReason } = req.body;
    if (!rejectionReason || !rejectionReason.trim()) {
      return res.status(400).json({ error: 'Rejection reason is required' });
    }

    const request = await VendorRequest.findById(req.params.id);
    if (!request) {
      return res.status(404).json({ error: 'Vendor request not found' });
    }
    if (request.status !== 'PENDING' && request.status !== 'UNDER_REVIEW') {
      return res.status(400).json({ error: `Request cannot be rejected from status '${request.status}'` });
    }

    request.status = 'REJECTED';
    request.rejectionReason = rejectionReason.trim();
    request.reviewedBy = req.user?.staff_id || req.user?.id || 'superadmin';
    request.reviewedAt = new Date();
    await request.save();

    try {
      await SuperAdminAudit.create({
        user: req.user?.name || 'Super Admin',
        action: 'VENDOR_REQUEST_REJECTED',
        details: `Rejected vendor request ${request.requestNo} for "${request.hospitalName || request.tenantId}". Reason: ${rejectionReason.trim()}`,
        ip: req.ip || ''
      });
    } catch (_) {}

    const io = req.app.get("io");
    if (io) {
      io.to(request.tenantId).emit("data_changed", { type: "vendor_requests" });
      io.emit("data_changed", { type: "vendor_requests" });
    }

    res.json({
      success: true,
      message: `Vendor request ${request.requestNo} rejected`,
      data: request
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. HOSPITAL VENDOR OPERATIONS ROUTER (Tenant-Isolated)
// ─────────────────────────────────────────────────────────────────────────────
const hospitalRouter = express.Router();
hospitalRouter.use(verifyToken);

/**
 * GET /api/hospital-vendors/my-vendors
 * Returns ONLY the vendors associated with the requesting hospital.
 * Details are read-only.
 */
hospitalRouter.get('/my-vendors', async (req, res) => {
  try {
    const tenantId = req.tenantId;
    if (!tenantId || tenantId === '__global__') {
      return res.status(400).json({ error: 'Valid tenant context required' });
    }

    const { search, status } = req.query;

    const query = { tenantId };
    if (status && status !== 'all') {
      query.status = status.toUpperCase();
    }

    const associations = await HospitalVendorAssociation.find(query)
      .populate('vendorId')
      .sort({ createdAt: -1 })
      .lean();

    let items = associations
      .filter(a => a.vendorId) // filter out deleted vendors
      .map(a => ({
        associationId: a._id,
        tenantId: a.tenantId,
        status: a.status,
        associatedAt: a.associatedAt,
        notes: a.notes,
        vendor: a.vendorId
      }));

    if (search && search.trim()) {
      const s = search.trim().toLowerCase();
      items = items.filter(it => {
        const v = it.vendor || {};
        return (
          (v.supplierName && v.supplierName.toLowerCase().includes(s)) ||
          (v.supplierCode && v.supplierCode.toLowerCase().includes(s)) ||
          (v.gstNo && v.gstNo.toLowerCase().includes(s)) ||
          (v.primaryContactPerson && v.primaryContactPerson.toLowerCase().includes(s))
        );
      });
    }

    res.json({
      success: true,
      count: items.length,
      data: items
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/hospital-vendors/available
 * Search active Global Vendors NOT yet associated with this hospital.
 */
hospitalRouter.get('/available', async (req, res) => {
  try {
    const tenantId = req.tenantId;
    if (!tenantId || tenantId === '__global__') {
      return res.status(400).json({ error: 'Valid tenant context required' });
    }

    const { search } = req.query;

    // Get IDs already associated
    const associatedVendorIds = await HospitalVendorAssociation.find({ tenantId }).distinct('vendorId');

    const conditions = [
      { _id: { $nin: associatedVendorIds } },
      { activeStatus: { $regex: /^yes$/i } }
    ];

    if (search && search.trim()) {
      const escaped = search.trim().replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');
      const r = new RegExp(escaped, 'i');
      conditions.push({
        $or: [
          { supplierName: r },
          { supplierCode: r },
          { gstNo: r },
          { panCardNo: r },
          { emailId: r }
        ]
      });
    }

    const query = { $and: conditions };
    const vendors = await GlobalVendor.find(query).limit(50).sort({ supplierName: 1 }).lean();

    res.json({
      success: true,
      data: vendors
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/hospital-vendors/associate
 * Associate an existing global vendor (or multiple) with this hospital.
 */
hospitalRouter.post('/associate', async (req, res) => {
  try {
    const tenantId = req.tenantId;
    if (!tenantId || tenantId === '__global__') {
      return res.status(400).json({ error: 'Valid tenant context required' });
    }

    const { vendorId, vendorIds } = req.body;
    const targetIds = Array.isArray(vendorIds)
      ? vendorIds
      : (vendorId ? [vendorId] : []);

    if (targetIds.length === 0) {
      return res.status(400).json({ error: 'At least one vendorId must be specified' });
    }

    // Verify vendors exist
    const validVendors = await GlobalVendor.find({ _id: { $in: targetIds } }).lean();
    if (validVendors.length === 0) {
      return res.status(404).json({ error: 'No matching global vendors found' });
    }

    const createdAssociations = [];
    for (const v of validVendors) {
      const assoc = await HospitalVendorAssociation.findOneAndUpdate(
        { tenantId, vendorId: v._id },
        {
          tenantId,
          vendorId: v._id,
          status: 'ACTIVE',
          associatedBy: req.user?.staff_id || req.user?.id || 'Hospital Staff',
          associatedAt: new Date()
        },
        { upsert: true, returnDocument: 'after' }
      );
      createdAssociations.push(assoc);
    }

    const io = req.app.get("io");
    if (io) {
      io.to(tenantId).emit("data_changed", { type: "hospital_vendors" });
    }

    res.status(201).json({
      success: true,
      message: `Successfully associated ${createdAssociations.length} vendor(s) with your hospital`,
      data: createdAssociations
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/hospital-vendors/request
 * Hospital proposes a new vendor for SuperAdmin approval.
 */
hospitalRouter.post('/request', async (req, res) => {
  try {
    const tenantId = req.tenantId;
    if (!tenantId || tenantId === '__global__') {
      return res.status(400).json({ error: 'Valid tenant context required' });
    }

    const vendorData = req.body.vendorData || req.body;
    if (!vendorData.supplierName || !vendorData.supplierName.trim()) {
      return res.status(400).json({ error: 'SupplierName is required in proposal' });
    }

    // Concurrency-safe request number
    const requestNo = await getNextVendorRequestNo();

    // Fetch hospital name for metadata
    let hospitalName = tenantId;
    try {
      const hosp = await SuperAdminHospital.findOne({ hospitalId: tenantId }).lean();
      if (hosp && hosp.name) hospitalName = hosp.name;
    } catch (_) {}

    const newRequest = await VendorRequest.create({
      requestNo,
      tenantId,
      hospitalName,
      vendorData,
      status: 'PENDING',
      submittedBy: req.user?.name || req.user?.email || 'Hospital Staff',
      submittedByStaffId: req.user?.staff_id || req.user?.id || '',
      submittedAt: new Date()
    });

    const io = req.app.get("io");
    if (io) {
      io.to(tenantId).emit("data_changed", { type: "vendor_requests" });
      io.emit("data_changed", { type: "vendor_requests" });
    }

    res.status(201).json({
      success: true,
      message: `Vendor request ${requestNo} submitted to SuperAdmin for approval`,
      data: newRequest
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

/**
 * GET /api/hospital-vendors/my-requests
 * Query requests submitted by this hospital.
 */
hospitalRouter.get('/my-requests', async (req, res) => {
  try {
    const tenantId = req.tenantId;
    if (!tenantId || tenantId === '__global__') {
      return res.status(400).json({ error: 'Valid tenant context required' });
    }

    const { status } = req.query;
    const query = { tenantId };
    if (status && status !== 'all') {
      query.status = status.toUpperCase();
    }

    const requests = await VendorRequest.find(query)
      .populate('approvedVendorId')
      .sort({ createdAt: -1 })
      .lean();

    res.json({
      success: true,
      data: requests
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = {
  superAdminRouter,
  superAdminRequestRouter,
  hospitalRouter
};
