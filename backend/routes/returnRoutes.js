const express = require('express');
const ReturnLog = require('../models/ReturnLog');
const Medicine = require('../models/Medicine');
const { verifyToken, forbidPatientRole } = require('../middleware/authMiddleware');
const router = express.Router();

router.use(verifyToken);
router.use(forbidPatientRole);

// Get all return logs (scoped to tenant)
router.get('/', async (req, res) => {
  try {
    const returns = await ReturnLog.find({ tenantId: req.tenantId })
      .populate('prescriptionId', 'status createdAt')
      .sort({ createdAt: -1 });
    res.json(returns);
  } catch (error) {
    console.error("Get returns error:", error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create a return log (scoped to tenant)
router.post('/', async (req, res) => {
  const { returnType, patientName, patientPhone, prescriptionId, prescriptionCode, items, totalRefund } = req.body;
  try {
    const count = await ReturnLog.countDocuments({ tenantId: req.tenantId });
    const returnId = `RET-${1000 + count + 1}`;

    const returnLog = await ReturnLog.create({
      tenantId: req.tenantId,
      returnId,
      returnType,
      patientName,
      patientPhone,
      prescriptionId,
      prescriptionCode,
      items,
      totalRefund: Number(totalRefund) || 0,
      loggedBy: req.user.name || 'Pharmacist'
    });

    // Update stock levels for restocked items
    if (Array.isArray(items) && items.length > 0) {
      for (const item of items) {
        if (item.action === 'Restocked') {
          const qty = Number(item.quantity) || 0;
          if (qty > 0) {
            // Find by name matching or fallback regex
            let med = await Medicine.findOne({ name: item.medicineName, tenantId: req.tenantId });
            if (!med) {
              // Try regex search
              const words = String(item.medicineName).split(/\s+/).filter(Boolean);
              if (words.length > 0) {
                const conditions = words.map(w => ({
                  name: { $regex: new RegExp(w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') }
                }));
                med = await Medicine.findOne({
                  $and: conditions,
                  tenantId: req.tenantId
                });
              }
            }

            if (med) {
              med.stock = med.stock + qty;
              if (med.stock === 0) med.status = 'Out of Stock';
              else if (med.stock <= 20) med.status = 'Low Stock';
              else med.status = 'In Stock';
              await med.save();
            }
          }
        }
      }
    }

    const io = req.app.get("io");
    if (io && req.tenantId) {
      io.to(req.tenantId).emit("data_changed", { type: "returns" });
      io.to(req.tenantId).emit("data_changed", { type: "medicines" });
    }

    res.status(201).json(returnLog);
  } catch (error) {
    console.error("Create return error:", error);
    res.status(400).json({ error: error.message });
  }
});

module.exports = router;
