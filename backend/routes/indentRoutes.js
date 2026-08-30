const express = require('express');
const mongoose = require('mongoose');
const Indent = require('../models/Indent');
const Medicine = require('../models/Medicine');
const Approval = require('../models/Approval');
const { verifyToken } = require('../middleware/authMiddleware');
const router = express.Router();

router.use(verifyToken);

// GET /api/indents — Fetch indents with strict role-based filtering
router.get('/', async (req, res) => {
  try {
    const userRole = (req.user && req.user.role) ? req.user.role.toLowerCase() : '';
    const isPharmacy = userRole === 'pharmacy' || userRole === 'pharmacist' || req.query.role === 'pharmacy';
    const filter = { tenantId: req.tenantId };

    if (isPharmacy) {
      // Pharmacy must NEVER see 'Pending' or 'Draft' unapproved requests
      const allowedPharmacyStatuses = ['Approved', 'Partially Fulfilled', 'Awaiting Stock', 'Fulfilled', 'Cannot Fulfill', 'Received'];
      if (req.query.status && allowedPharmacyStatuses.includes(req.query.status)) {
        filter.status = req.query.status;
      } else {
        filter.status = { $in: allowedPharmacyStatuses };
      }
    } else {
      if (req.query.status) {
        filter.status = req.query.status;
      }
    }

    const indents = await Indent.find(filter).sort({ createdAt: -1 });
    res.json(indents);
  } catch (error) {
    console.error("Get indents error:", error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/indents — Create a new indent request
router.post('/', async (req, res) => {
  const { department, indentType, requiredDate, requestedBy, contactNumber, priority, purpose, items } = req.body;
  try {
    const count = await Indent.countDocuments({ tenantId: req.tenantId });
    const nextNum = count + 26;
    const indentId = `#MR00${nextNum}`;

    let totalQty = 0;
    const sanitizedItems = (items || []).map(item => {
      const reqQty = Number(item.requiredQty) || 1;
      totalQty += reqQty;
      return {
        name: item.name,
        category: item.category || '',
        unit: item.unit || 'Strip',
        requiredQty: reqQty,
        approvedQty: null, // Always null at creation
        suppliedQty: 0,
        utilizedQty: 0,
        availableStock: Number(item.availableStock) || 0,
        mrp: Number(item.mrp) || 50.00
      };
    });

    const indent = await Indent.create({
      tenantId: req.tenantId,
      indentId,
      department,
      indentType,
      requiredDate,
      requestedBy,
      contactNumber,
      priority: priority || 'Normal',
      purpose,
      items: sanitizedItems,
      totalQty,
      status: 'Pending'
    });

    await Approval.create({
      tenantId: req.tenantId,
      type: 'receptionist_indent',
      staffId: req.user.staff_id || req.user.id || 'system',
      requesterName: requestedBy || req.user.name || 'Receptionist',
      requesterRole: req.user.role || 'receptionist',
      details: {
        indentId: indent._id,
        indentNumber: indent.indentId,
        department,
        items: indent.items,
        purpose,
        priority: priority || 'Normal'
      },
      comment: purpose || ''
    });

    const io = req.app.get("io");
    if (io && req.tenantId) {
      io.to(req.tenantId).emit("data_changed", { type: "indents" });
      io.to(req.tenantId).emit("data_changed", { type: "approvals" });
    }
    res.status(201).json(indent);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// PUT /api/indents/:id — Fulfill, partially fulfill, or update status of an indent
router.put('/:id', async (req, res) => {
  const { status, suppliedItems } = req.body;
  let session = null;
  let useTransaction = false;

  try {
    const indent = await Indent.findOne({ _id: req.params.id, tenantId: req.tenantId });
    if (!indent) {
      return res.status(404).json({ error: 'Indent not found' });
    }

    // 1. Simple status transition (e.g. Receptionist marking 'Received', or marking 'Cannot Fulfill' with no items)
    if (!suppliedItems && status) {
      if (status === 'Received') {
        indent.status = 'Received';
        await indent.save();
      } else if (status === 'Cannot Fulfill') {
        indent.status = 'Cannot Fulfill';
        await indent.save();
      } else if (status === 'Awaiting Stock') {
        indent.status = 'Awaiting Stock';
        await indent.save();
      } else if (status === 'Fulfilled' || status === 'Partially Fulfilled') {
        indent.status = status;
        await indent.save();
      } else {
        indent.status = status;
        await indent.save();
      }

      const io = req.app.get("io");
      if (io && req.tenantId) {
        io.to(req.tenantId).emit("data_changed", { type: "indents" });
      }
      return res.json(indent);
    }

    // 2. Pharmacy Fulfillment with suppliedItems
    if (Array.isArray(suppliedItems)) {
      // Validate eligibility
      if (indent.status === 'Pending' || indent.status === 'Draft' || indent.status === 'Rejected') {
        return res.status(400).json({ error: 'Indent is not approved for fulfillment' });
      }
      if (indent.status === 'Cannot Fulfill') {
        return res.status(400).json({ error: 'Indent was marked as Cannot Fulfill' });
      }

      // Pre-validation and medicine stock checks
      const medicinesToUpdate = [];
      let totalNewSupplyDelta = 0;

      for (const item of indent.items) {
        if (item.approvedQty === null || item.approvedQty === undefined) {
          return res.status(400).json({ error: `Item '${item.name}' has no authorized approved quantity` });
        }

        const alreadySupplied = Number(item.suppliedQty || 0);
        const remainingApproved = Math.max(0, Number(item.approvedQty) - alreadySupplied);

        const suppliedEntry = suppliedItems.find(
          it => (it.itemId && item._id && String(it.itemId) === String(item._id)) ||
                (it.name && item.name && it.name.trim().toLowerCase() === item.name.trim().toLowerCase())
        );

        let additionalSupply = 0;
        if (suppliedEntry && suppliedEntry.supplyQty !== undefined && suppliedEntry.supplyQty !== null && suppliedEntry.supplyQty !== '') {
          const parsedQty = Number(suppliedEntry.supplyQty);
          if (isNaN(parsedQty) || parsedQty < 0) {
            return res.status(400).json({ error: `Invalid supply quantity (${suppliedEntry.supplyQty}) for item '${item.name}'` });
          }
          if (parsedQty > remainingApproved) {
            return res.status(400).json({
              error: `Requested supply quantity (${parsedQty}) exceeds remaining approved quantity (${remainingApproved}) for item '${item.name}'`
            });
          }
          additionalSupply = parsedQty;
        }

        if (additionalSupply > 0) {
          const med = await Medicine.findOne({ tenantId: req.tenantId, name: item.name });
          if (!med) {
            return res.status(404).json({ error: `Medicine '${item.name}' not found in inventory` });
          }
          if (additionalSupply > med.stock) {
            return res.status(400).json({
              error: `Requested supply quantity (${additionalSupply}) exceeds available stock (${med.stock}) for medicine '${item.name}'`
            });
          }
          medicinesToUpdate.push({ med, additionalSupply, item });
          totalNewSupplyDelta += additionalSupply;
        }
      }

      // Check if all zero supply due to zero stock and requested Awaiting Stock
      if (totalNewSupplyDelta === 0 && (status === 'Awaiting Stock' || suppliedItems.length === 0)) {
        indent.status = 'Awaiting Stock';
        await indent.save();

        const io = req.app.get("io");
        if (io && req.tenantId) {
          io.to(req.tenantId).emit("data_changed", { type: "indents" });
        }
        return res.json(indent);
      }

      // Multi-document transaction for stock deduction + indent fulfillment
      try {
        session = await mongoose.startSession();
        session.startTransaction();
        useTransaction = true;
      } catch (sessionErr) {
        session = null;
        useTransaction = false;
      }

      const sessionOpt = useTransaction && session ? { session } : {};

      // 1. Deduct stock for medicines
      for (const { med, additionalSupply } of medicinesToUpdate) {
        med.stock = Math.max(0, med.stock - additionalSupply);
        if (med.stock === 0) med.status = 'Out of Stock';
        else if (med.stock <= 20) med.status = 'Low Stock';
        else med.status = 'In Stock';
        await med.save(sessionOpt);
      }

      // 2. Update Indent items supplied & utilized quantities
      for (const { item, additionalSupply } of medicinesToUpdate) {
        item.suppliedQty = (Number(item.suppliedQty) || 0) + additionalSupply;
        item.utilizedQty = item.suppliedQty;
      }

      // 3. Compute final Indent status
      if (status === 'Cannot Fulfill') {
        indent.status = 'Cannot Fulfill';
      } else {
        const isAllFullySupplied = indent.items.every(it => Number(it.suppliedQty || 0) >= Number(it.approvedQty || 0));
        const hasAnySupplied = indent.items.some(it => Number(it.suppliedQty || 0) > 0);

        if (isAllFullySupplied) {
          indent.status = 'Fulfilled';
        } else if (hasAnySupplied) {
          indent.status = 'Partially Fulfilled';
        } else {
          indent.status = 'Awaiting Stock';
        }
      }

      await indent.save(sessionOpt);

      if (useTransaction && session) {
        await session.commitTransaction();
        await session.endSession();
        session = null;
      }

      const io = req.app.get("io");
      if (io && req.tenantId) {
        io.to(req.tenantId).emit("data_changed", { type: "indents" });
        if (totalNewSupplyDelta > 0) {
          io.to(req.tenantId).emit("data_changed", { type: "medicines" });
        }
      }

      return res.json(indent);
    }

    res.status(400).json({ error: 'Invalid update payload' });
  } catch (error) {
    if (session) {
      try {
        await session.abortTransaction();
        await session.endSession();
      } catch (abortErr) {}
    }
    console.error("Update indent error:", error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

module.exports = router;
