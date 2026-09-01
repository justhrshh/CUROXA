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

// Create lab request (scoped to tenant)
router.post('/', async (req, res) => {
  const { appointmentId, patientId, doctorId, testName, notes, status, results } = req.body;
  try {
    const request = await LabRequest.create({
      tenantId: req.tenantId,
      appointmentId,
      patientId,
      doctorId,
      testName,
      notes,
      status,
      results
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
