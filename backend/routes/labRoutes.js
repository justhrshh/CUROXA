const express = require('express');
const LabRequest = require('../models/LabRequest');
const { verifyToken } = require('../middleware/authMiddleware');
const { checkDoctorClinicalMode } = require('../middleware/subscriptionMiddleware');
const router = express.Router();

router.use(verifyToken);
router.use(checkDoctorClinicalMode);

// Get lab requests (scoped to tenant)
router.get('/', async (req, res) => {
  try {
    const query = { tenantId: req.tenantId };
    if (req.query.status) query.status = req.query.status;
    if (req.query.patientId) query.patientId = req.query.patientId;
    if (req.query.doctorId) query.doctorId = req.query.doctorId;

    const requests = await LabRequest.find(query)
      .populate('patientId', 'name age contact')
      .populate('doctorId', 'name')
      .sort({ createdAt: -1 });
    res.json(requests);
  } catch (error) {
    console.error("Get lab requests error:", error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

const LaboratoryMaster = require('../models/LaboratoryMaster');
const HospitalAffiliateLabConfig = require('../models/HospitalAffiliateLabConfig');

// Get active affiliate labs and configured default for current tenant
router.get('/affiliates', async (req, res) => {
  try {
    const config = await HospitalAffiliateLabConfig.findOne({ tenantId: req.tenantId })
      .populate('affiliateLabIds')
      .populate('defaultLabId')
      .lean();

    if (!config) {
      return res.json({
        success: true,
        affiliateLabs: [],
        defaultLab: null,
        defaultLabId: null
      });
    }

    const activeAffiliates = (config.affiliateLabIds || []).filter(l => l && l.isActive);
    let effectiveDefault = config.defaultLabId && config.defaultLabId.isActive ? config.defaultLabId : null;

    if (effectiveDefault && !activeAffiliates.some(l => l._id.toString() === effectiveDefault._id.toString())) {
      effectiveDefault = activeAffiliates.length > 0 ? activeAffiliates[0] : null;
    }

    res.json({
      success: true,
      affiliateLabs: activeAffiliates,
      defaultLab: effectiveDefault,
      defaultLabId: effectiveDefault ? effectiveDefault._id : null
    });
  } catch (error) {
    console.error("Get affiliate labs error in labRoutes:", error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create lab request (scoped to tenant)
router.post('/', async (req, res) => {
  const { appointmentId, patientId, doctorId, testName, notes, status, results, labId, labName } = req.body;
  try {
    let finalLabId = null;
    let finalLabName = (labName || '').trim();
    let finalLabCode = '';

    // Validate labId if provided
    if (labId) {
      // 1. Check if lab exists in LaboratoryMaster
      const labDoc = await LaboratoryMaster.findOne({ _id: labId, isActive: true }).lean();
      if (!labDoc) {
        return res.status(400).json({ error: 'Selected laboratory does not exist or is inactive.' });
      }

      // 2. Check if this lab is affiliated with this tenant
      const config = await HospitalAffiliateLabConfig.findOne({ tenantId: req.tenantId }).lean();
      if (config && config.affiliateLabIds && config.affiliateLabIds.length > 0) {
        const isAffiliated = config.affiliateLabIds.some(id => id.toString() === String(labId));
        if (!isAffiliated) {
          return res.status(400).json({ error: 'Selected laboratory is not an affiliated laboratory for this hospital.' });
        }
      }

      finalLabId = labDoc._id;
      finalLabName = labDoc.name;
      finalLabCode = labDoc.code || '';
    } else {
      // If labId not explicitly provided, auto-assign default lab if configured
      const config = await HospitalAffiliateLabConfig.findOne({ tenantId: req.tenantId })
        .populate('defaultLabId')
        .lean();
      if (config && config.defaultLabId && config.defaultLabId.isActive) {
        finalLabId = config.defaultLabId._id;
        finalLabName = config.defaultLabId.name;
        finalLabCode = config.defaultLabId.code || '';
      }
    }

    const request = await LabRequest.create({
      tenantId: req.tenantId,
      appointmentId,
      patientId,
      doctorId,
      testName,
      notes,
      status,
      results,
      labId: finalLabId,
      labName: finalLabName,
      labCode: finalLabCode
    });
    const io = req.app.get("io");
    if (io && req.tenantId) {
      io.to(req.tenantId).emit("data_changed", { type: "labs" });
    }
    res.status(201).json(request);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Update lab request (add results, change status, scoped to tenant)
router.put('/:id', async (req, res) => {
  const { appointmentId, patientId, doctorId, testName, notes, status, results } = req.body;
  try {
    const existing = await LabRequest.findOne({
      _id: req.params.id,
      tenantId: req.tenantId,
    });
    if (!existing) return res.status(404).json({ error: 'Request not found' });

    const updateObj = {};
    if (appointmentId !== undefined) updateObj.appointmentId = appointmentId;
    if (patientId !== undefined) updateObj.patientId = patientId;
    if (doctorId !== undefined) updateObj.doctorId = doctorId;
    if (testName !== undefined) updateObj.testName = testName;
    if (notes !== undefined) updateObj.notes = notes;
    if (status !== undefined) updateObj.status = status;
    if (results !== undefined) updateObj.results = results;

    const request = await LabRequest.findOneAndUpdate(
      { _id: req.params.id, tenantId: req.tenantId }, 
      updateObj, 
      { returnDocument: 'after' }
    );

    // Automated reagent stock decrementing on test completion
    if (status === 'Completed' && existing.status !== 'Completed') {
      const LabInventory = require('../models/LabInventory');
      const test = (request.testName || existing.testName || '').toLowerCase();
      
      const decrementReagent = async (reagentName, qty = 1) => {
        try {
          const item = await LabInventory.findOne({
            tenantId: req.tenantId,
            name: { $regex: new RegExp(reagentName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') }
          });
          if (item) {
            item.stock = Math.max(0, item.stock - qty);
            await item.save();
          }
        } catch (err) {
          console.error(`Failed to auto-decrement reagent ${reagentName}:`, err);
        }
      };

      if (test.includes('cbc') || test.includes('blood') || test.includes('hemoglobin') || test.includes('platelet') || test.includes('wbc')) {
        await decrementReagent('Hematology Reagent', 1);
        await decrementReagent('Vacuum Tubes (Red)', 1);
      } else if (test.includes('glucose') || test.includes('sugar') || test.includes('diabetes') || test.includes('fbs') || test.includes('hba1c')) {
        await decrementReagent('Glucose Test Strips', 1);
      } else if (test.includes('covid') || test.includes('swab') || test.includes('corona') || test.includes('pcr')) {
        await decrementReagent('COVID-19 Swab Kits', 1);
      }
    }

    const io = req.app.get("io");
    if (io && req.tenantId) {
      io.to(req.tenantId).emit("data_changed", { type: "labs" });
      io.to(req.tenantId).emit("data_changed", { type: "lab_inventory" });
    }
    res.json(request);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Delete lab requests for a specific appointment (scoped to tenant)
router.delete('/appointment/:appointmentId', async (req, res) => {
  try {
    await LabRequest.deleteMany({
      appointmentId: req.params.appointmentId,
      tenantId: req.tenantId
    });
    const io = req.app.get("io");
    if (io && req.tenantId) {
      io.to(req.tenantId).emit("data_changed", { type: "labs" });
    }
    res.json({ message: 'Lab requests deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
