const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const ItemMaster = require('../models/ItemMaster');
const HospitalMasterConfig = require('../models/HospitalMasterConfig');
const ItemMasterRequest = require('../models/ItemMasterRequest');
const SuperAdminHospital = require('../models/SuperAdminHospital');
const Counter = require('../models/Counter');
const LabTest = require('../models/LabTest');
const { verifyToken } = require('../middleware/authMiddleware');

router.use(verifyToken);

/**
 * Helper to normalize tenant ID from request context
 */
function getTenantId(req) {
  return (req.tenantId || req.user?.tenantId || 'city_hospital').trim().toLowerCase();
}

/**
 * GET /api/lab-tests
 * Returns ONLY active, hospital-configured tests for receptionist appointment dropdown
 * Source of truth: HospitalMasterConfig (populated from Global ItemMaster)
 */
router.get('/', async (req, res) => {
  try {
    const tenantId = getTenantId(req);

    const configs = await HospitalMasterConfig.find({
      tenantId,
      category: 'Lab Operation',
      status: 'Active',
      approvalStatus: 'Approved'
    })
      .populate('masterItemId')
      .sort({ createdAt: -1 })
      .lean();

    // Map into consumer format expected by receptionists and clinics
    const activeTests = configs
      .filter(c => c.masterItemId && c.masterItemId.status !== 'Inactive')
      .map(c => {
        const m = c.masterItemId;
        return {
          _id: c._id,
          configId: c._id,
          masterItemId: m._id,
          testCode: m.itemCode || '',
          testName: m.itemName || m.genericName || 'Laboratory Test',
          category: m.department || c.department || 'General',
          department: m.department || c.department || 'General',
          price: c.mrp !== undefined && c.mrp !== null ? c.mrp : 0,
          mrp: c.mrp !== undefined && c.mrp !== null ? c.mrp : 0,
          netRate: c.netRate !== undefined && c.netRate !== null ? c.netRate : 0,
          sampleType: m.sampleType || m.categoryData?.sampleType || 'Blood',
          turnaroundTime: m.categoryData?.turnaroundTime || '24 Hours',
          normalRange: m.categoryData?.normalRange || '',
          unit: m.categoryData?.unit || '',
          description: m.itemDescription || m.description || '',
          isActive: true
        };
      })
      .sort((a, b) => (a.category || '').localeCompare(b.category || '') || (a.testName || '').localeCompare(b.testName || ''));

    res.json(activeTests);
  } catch (err) {
    console.error('Error fetching active hospital lab tests:', err);
    res.status(500).json({ error: 'Failed to fetch active hospital lab tests' });
  }
});

/**
 * GET /api/lab-tests/all
 * Returns ALL hospital-configured tests (active and inactive) for Hospital Admin management
 */
router.get('/all', async (req, res) => {
  try {
    const tenantId = getTenantId(req);

    const configs = await HospitalMasterConfig.find({
      tenantId,
      category: 'Lab Operation'
    })
      .populate('masterItemId')
      .sort({ createdAt: -1 })
      .lean();

    const allConfiguredTests = configs
      .filter(c => c.masterItemId)
      .map(c => {
        const m = c.masterItemId;
        return {
          _id: c._id,
          configId: c._id,
          masterItemId: m._id,
          testCode: m.itemCode || '',
          testName: m.itemName || m.genericName || 'Laboratory Test',
          category: m.department || c.department || 'General',
          department: m.department || c.department || 'General',
          price: c.mrp !== undefined && c.mrp !== null ? c.mrp : 0,
          mrp: c.mrp !== undefined && c.mrp !== null ? c.mrp : 0,
          netRate: c.netRate !== undefined && c.netRate !== null ? c.netRate : 0,
          sampleType: m.sampleType || m.categoryData?.sampleType || 'Blood',
          turnaroundTime: m.categoryData?.turnaroundTime || '24 Hours',
          normalRange: m.categoryData?.normalRange || '',
          unit: m.categoryData?.unit || '',
          description: m.itemDescription || m.description || '',
          status: c.status || 'Active',
          isActive: c.status === 'Active'
        };
      })
      .sort((a, b) => (a.category || '').localeCompare(b.category || '') || (a.testName || '').localeCompare(b.testName || ''));

    res.json(allConfiguredTests);
  } catch (err) {
    console.error('Error fetching all hospital lab tests:', err);
    res.status(500).json({ error: 'Failed to fetch hospital lab test catalog' });
  }
});

/**
 * GET /api/lab-tests/unassigned
 * Returns Global Item Master laboratory tests that are NOT yet activated for this hospital
 */
router.get('/unassigned', async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const { department, search } = req.query;

    const assignedIds = await HospitalMasterConfig.find({
      tenantId,
      category: 'Lab Operation'
    }).distinct('masterItemId');

    const conditions = [
      { scope: 'GLOBAL' },
      { $or: [{ category: 'Lab Operation' }, { categoryType: 'Lab Operation' }] },
      { status: 'Active' },
      { _id: { $nin: assignedIds } }
    ];

    if (department && department !== 'all') {
      conditions.push({
        $or: [{ department: department.trim() }, { departmentType: department.trim() }]
      });
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

    const unassigned = await ItemMaster.find({ $and: conditions })
      .sort({ itemCode: 1 })
      .limit(100)
      .lean();

    res.json({ success: true, data: unassigned });
  } catch (err) {
    console.error('Error fetching unassigned global lab tests:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/lab-tests/activate
 * Activates an existing Global Item Master laboratory test for this hospital with custom hospital pricing
 */
router.post('/activate', async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const { masterItemId, price, mrp, netRate } = req.body;

    if (!masterItemId) {
      return res.status(400).json({ error: 'masterItemId is required.' });
    }

    const masterItem = await ItemMaster.findOne({
      _id: masterItemId,
      scope: 'GLOBAL',
      $or: [{ category: 'Lab Operation' }, { categoryType: 'Lab Operation' }]
    }).lean();

    if (!masterItem) {
      return res.status(404).json({ error: 'Global laboratory test item not found.' });
    }

    const effectiveMrp = mrp !== undefined && mrp !== '' ? Number(mrp) : (price !== undefined && price !== '' ? Number(price) : 0);
    const effectiveNetRate = netRate !== undefined && netRate !== '' ? Number(netRate) : effectiveMrp;

    const config = await HospitalMasterConfig.findOneAndUpdate(
      { tenantId, masterItemId: masterItem._id },
      {
        $set: {
          category: 'Lab Operation',
          department: masterItem.department || masterItem.departmentType || 'Miscellaneous',
          mrp: effectiveMrp,
          netRate: effectiveNetRate,
          hospitalCost: effectiveNetRate,
          status: 'Active',
          approvalStatus: 'Approved',
          assignedVia: 'DIRECT_ADMIN',
          lastUpdatedBy: req.user?.name || req.user?.staff_id || 'Hospital Admin'
        }
      },
      { upsert: true, returnDocument: 'after' }
    ).populate('masterItemId');

    const io = req.app.get('io');
    if (io && tenantId) {
      io.to(tenantId).emit('data_changed', { type: 'lab_catalog' });
    }

    res.status(201).json({ success: true, data: config });
  } catch (err) {
    console.error('Error activating global lab test for hospital:', err);
    res.status(400).json({ error: err.message });
  }
});

/**
 * POST /api/lab-tests/request-new
 * Submits an ItemMasterRequest for a new laboratory test not currently in Global Item Master
 */
router.post('/request-new', async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const { testName, department, sampleType, description, proposedPrice, normalRange, unit, turnaroundTime } = req.body;

    if (!testName || !testName.trim()) {
      return res.status(400).json({ error: 'Test name is required.' });
    }

    const effectiveDept = (department || 'Hematology').trim();

    // Check if equivalent test already exists in Global ItemMaster
    const existing = await ItemMaster.findOne({
      scope: 'GLOBAL',
      category: 'Lab Operation',
      $or: [
        { itemName: new RegExp(`^${testName.trim()}$`, 'i') },
        { genericName: new RegExp(`^${testName.trim()}$`, 'i') }
      ]
    }).lean();

    if (existing) {
      return res.status(409).json({
        error: `A matching test '[${existing.itemCode}] ${existing.itemName}' already exists in Global Item Master. You can activate it directly.`,
        existingItem: existing
      });
    }

    let hospitalName = req.user?.hospitalName || tenantId;
    const hospDoc = await SuperAdminHospital.findOne({ code: tenantId }).lean();
    if (hospDoc && hospDoc.name) hospitalName = hospDoc.name;

    const year = new Date().getFullYear();
    const counterKey = `item_request_${year}`;
    const c = await Counter.findOneAndUpdate({ key: counterKey }, { $inc: { seq: 1 } }, { upsert: true, returnDocument: 'after' });
    const requestNo = `IMR-${year}-${String(c.seq).padStart(4, '0')}`;

    const newRequest = await ItemMasterRequest.create({
      requestNo,
      tenantId,
      hospitalName,
      requestedBy: req.user?.name || req.user?.staff_id || 'Hospital Admin',
      requestedByRole: req.user?.role || 'admin',
      requestType: 'NEW_GLOBAL_ITEM',
      category: 'Lab Operation',
      department: effectiveDept,
      proposedItem: {
        itemName: testName.trim(),
        genericName: testName.trim(),
        brandName: testName.trim(),
        department: effectiveDept,
        sampleType: sampleType || 'Blood',
        description: description || ''
      },
      categoryData: {
        sampleType: sampleType || 'Blood',
        normalRange: normalRange || '',
        unit: unit || '',
        turnaroundTime: turnaroundTime || '24 Hours'
      },
      requestedMrp: Number(proposedPrice) || 0,
      requestedNetRate: Number(proposedPrice) || 0,
      requestedHospitalCost: Number(proposedPrice) || 0,
      reason: description || 'Hospital requested new laboratory diagnostic test',
      status: 'PENDING'
    });

    const io = req.app.get('io');
    if (io) {
      io.emit('data_changed', { type: 'item_master_requests' });
    }

    res.status(201).json({
      success: true,
      message: 'Laboratory test request submitted for Super Admin review.',
      data: newRequest
    });
  } catch (err) {
    console.error('Error requesting new lab test:', err);
    res.status(400).json({ error: err.message });
  }
});

/**
 * PUT /api/lab-tests/:id
 * Updates hospital-specific price or operational status (Active / Inactive) in HospitalMasterConfig
 */
router.put('/:id', async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const id = req.params.id;
    const { price, mrp, netRate, isActive, status } = req.body;

    const updateFields = {};
    if (mrp !== undefined && mrp !== '') updateFields.mrp = Number(mrp);
    else if (price !== undefined && price !== '') updateFields.mrp = Number(price);

    if (netRate !== undefined && netRate !== '') updateFields.netRate = Number(netRate);
    else if (updateFields.mrp !== undefined) updateFields.netRate = updateFields.mrp;

    if (isActive !== undefined) {
      updateFields.status = isActive ? 'Active' : 'Inactive';
    } else if (status !== undefined) {
      updateFields.status = status;
    }

    updateFields.lastUpdatedBy = req.user?.name || req.user?.staff_id || 'Hospital Admin';

    const query = {
      tenantId,
      category: 'Lab Operation'
    };

    if (mongoose.isValidObjectId(id)) {
      query.$or = [{ _id: id }, { masterItemId: id }];
    } else {
      query._id = id;
    }

    const config = await HospitalMasterConfig.findOneAndUpdate(
      query,
      { $set: updateFields },
      { returnDocument: 'after' }
    ).populate('masterItemId');

    if (!config) {
      return res.status(404).json({ error: 'Hospital laboratory test configuration not found.' });
    }

    const io = req.app.get('io');
    if (io && tenantId) {
      io.to(tenantId).emit('data_changed', { type: 'lab_catalog' });
    }

    res.json({ success: true, data: config });
  } catch (err) {
    console.error('Error updating hospital lab test:', err);
    res.status(400).json({ error: err.message });
  }
});

/**
 * DELETE /api/lab-tests/:id
 * Deactivates / removes hospital test configuration from HospitalMasterConfig
 */
router.delete('/:id', async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const id = req.params.id;

    const query = {
      tenantId,
      category: 'Lab Operation'
    };

    if (mongoose.isValidObjectId(id)) {
      query.$or = [{ _id: id }, { masterItemId: id }];
    } else {
      query._id = id;
    }

    const config = await HospitalMasterConfig.findOneAndDelete(query);

    if (!config) {
      return res.status(404).json({ error: 'Hospital laboratory test configuration not found.' });
    }

    const io = req.app.get('io');
    if (io && tenantId) {
      io.to(tenantId).emit('data_changed', { type: 'lab_catalog' });
    }

    res.json({ success: true, message: 'Laboratory test removed from hospital catalog.' });
  } catch (err) {
    console.error('Error removing hospital lab test:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
