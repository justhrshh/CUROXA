const express = require('express');
const MedicineBatch = require('../models/MedicineBatch');
const Medicine = require('../models/Medicine');
const InventoryWriteOff = require('../models/InventoryWriteOff');
const AuditLog = require('../models/AuditLog');
const { verifyToken } = require('../middleware/authMiddleware');

const router = express.Router();
router.use(verifyToken);

/**
 * Dynamic Expiry Risk Classification
 */
function classifyBatch(batch, now = new Date()) {
  const available = Number(batch.availableQuantity) || 0;
  if (available <= 0 || batch.status === 'Depleted') {
    return {
      risk: 'DEPLETED',
      daysRemaining: null,
      isExpired: false,
      priority: 5
    };
  }

  if (!batch.expiryDate) {
    return {
      risk: 'SAFE',
      daysRemaining: 9999,
      isExpired: false,
      priority: 4
    };
  }

  const exp = new Date(batch.expiryDate);
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const expDateNorm = new Date(exp.getFullYear(), exp.getMonth(), exp.getDate());

  const diffMs = expDateNorm.getTime() - startOfToday.getTime();
  const daysRemaining = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

  if (daysRemaining < 0) {
    return { risk: 'EXPIRED', daysRemaining, isExpired: true, priority: 1 };
  } else if (daysRemaining <= 30) {
    return { risk: 'CRITICAL', daysRemaining, isExpired: false, priority: 2 };
  } else if (daysRemaining <= 90) {
    return { risk: 'WARNING', daysRemaining, isExpired: false, priority: 3 };
  } else {
    return { risk: 'SAFE', daysRemaining, isExpired: false, priority: 4 };
  }
}

// GET /api/inventory-expiry/summary — KPI Cards Aggregation
router.get('/summary', async (req, res) => {
  try {
    const batches = await MedicineBatch.find({ tenantId: req.tenantId }).lean();
    const now = new Date();

    let expiredUnits = 0;
    let criticalUnits = 0;
    let warningUnits = 0;
    let atRiskValue = 0;
    let affectedBatchesCount = 0;

    for (const batch of batches) {
      const avail = Number(batch.availableQuantity) || 0;
      if (avail <= 0 || batch.status === 'Depleted') continue;

      const riskInfo = classifyBatch(batch, now);
      const rate = Number(batch.purchaseRate) || 0;
      const stockVal = avail * rate;

      if (riskInfo.risk === 'EXPIRED') {
        expiredUnits += avail;
        atRiskValue += stockVal;
        affectedBatchesCount++;
      } else if (riskInfo.risk === 'CRITICAL') {
        criticalUnits += avail;
        atRiskValue += stockVal;
        affectedBatchesCount++;
      } else if (riskInfo.risk === 'WARNING') {
        warningUnits += avail;
        atRiskValue += stockVal;
        affectedBatchesCount++;
      }
    }

    res.json({
      expiredUnits,
      criticalUnits,
      warningUnits,
      atRiskValue: Math.round(atRiskValue * 100) / 100,
      affectedBatchesCount
    });
  } catch (error) {
    console.error('Get expiry summary error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/inventory-expiry — List batches with risk classification, filtering, pagination
router.get('/', async (req, res) => {
  try {
    const now = new Date();
    const search = String(req.query.search || '').trim();
    const riskFilter = String(req.query.risk || 'ALL_RISKS').toUpperCase();
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(200, Math.max(1, parseInt(req.query.limit, 10) || 50));

    const batches = await MedicineBatch.find({ tenantId: req.tenantId })
      .populate('medicineId', 'category unit mrp')
      .lean();

    let results = batches.map(b => {
      const riskInfo = classifyBatch(b, now);
      const avail = Number(b.availableQuantity) || 0;
      const rate = Number(b.purchaseRate) || 0;
      const stockValue = Math.round(avail * rate * 100) / 100;
      const mrp = Number(b.mrp || b.medicineId?.mrp || 0);
      const unit = b.medicineId?.unit || 'Strip';
      const category = b.medicineId?.category || 'General';

      return {
        _id: b._id,
        medicineId: b.medicineId?._id || b.medicineId,
        name: b.name,
        sku: b.sku,
        batchNumber: b.batchNumber,
        mfgDate: b.mfgDate,
        expiryDate: b.expiryDate,
        receivedQuantity: b.receivedQuantity,
        availableQuantity: avail,
        purchaseRate: rate,
        mrp,
        unit,
        category,
        stockValue,
        grnId: b.grnId,
        vendorName: b.vendorName,
        risk: riskInfo.risk,
        daysRemaining: riskInfo.daysRemaining,
        isExpired: riskInfo.isExpired,
        priority: riskInfo.priority
      };
    });

    // Filter by Risk
    if (riskFilter === 'EXPIRED') {
      results = results.filter(r => r.risk === 'EXPIRED');
    } else if (riskFilter === 'CRITICAL') {
      results = results.filter(r => r.risk === 'CRITICAL');
     } else if (riskFilter === 'WARNING') {
      results = results.filter(r => r.risk === 'WARNING');
    } else if (riskFilter === 'SAFE') {
      results = results.filter(r => r.risk === 'SAFE');
    } else if (riskFilter === 'ALL_RISKS') {
      results = results.filter(r => ['EXPIRED', 'CRITICAL', 'WARNING'].includes(r.risk));
    } else if (riskFilter === 'ALL') {
      // All non-depleted
      results = results.filter(r => r.risk !== 'DEPLETED');
    }

    // Search filter
    if (search) {
      const q = search.toLowerCase();
      results = results.filter(r => 
        (r.name && r.name.toLowerCase().includes(q)) ||
        (r.sku && r.sku.toLowerCase().includes(q)) ||
        (r.batchNumber && r.batchNumber.toLowerCase().includes(q))
      );
    }

    // Sorting: EXPIRED (prio 1) -> CRITICAL (2) -> WARNING (3) -> SAFE (4)
    results.sort((a, b) => {
      if (a.priority !== b.priority) return a.priority - b.priority;
      if (!a.expiryDate) return 1;
      if (!b.expiryDate) return -1;
      return new Date(a.expiryDate).getTime() - new Date(b.expiryDate).getTime();
    });

    const totalCount = results.length;
    const skip = (page - 1) * limit;
    const pagedItems = results.slice(skip, skip + limit);

    res.json({
      batches: pagedItems,
      pagination: {
        total: totalCount,
        page,
        limit,
        pages: Math.ceil(totalCount / limit) || 1
      }
    });
  } catch (error) {
    console.error('Get expiry batches error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/inventory-expiry/:batchId — Single batch details
router.get('/:batchId', async (req, res) => {
  try {
    const batch = await MedicineBatch.findOne({
      _id: req.params.batchId,
      tenantId: req.tenantId
    }).populate('medicineId').lean();

    if (!batch) return res.status(404).json({ error: 'Medicine batch not found.' });

    const riskInfo = classifyBatch(batch);
    res.json({ ...batch, ...riskInfo });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/inventory-expiry/:batchId/write-off — Atomic Inventory Write-Off
router.post('/:batchId/write-off', async (req, res) => {
  const { quantity, reason } = req.body;
  const writeOffQty = Math.max(1, parseInt(quantity, 10) || 0);

  if (writeOffQty <= 0) {
    return res.status(400).json({ error: 'Write-off quantity must be at least 1.' });
  }

  try {
    // 1. Atomically find and deduct availableQuantity from MedicineBatch
    const batch = await MedicineBatch.findOneAndUpdate(
      { _id: req.params.batchId, tenantId: req.tenantId, availableQuantity: { $gte: writeOffQty } },
      { $inc: { availableQuantity: -writeOffQty } },
      { returnDocument: 'after' }
    );

    if (!batch) {
      return res.status(400).json({
        error: 'Insufficient available batch quantity for write-off or batch not found.'
      });
    }

    if (batch.availableQuantity === 0) {
      batch.status = 'Depleted';
      await batch.save();
    }

    // 2. Atomically deduct from aggregate Medicine.stock
    const medicine = await Medicine.findOneAndUpdate(
      { _id: batch.medicineId, tenantId: req.tenantId },
      { $inc: { stock: -writeOffQty } },
      { returnDocument: 'after' }
    );

    if (medicine) {
      if (medicine.stock <= 0) {
        medicine.stock = 0;
        medicine.status = 'Out of Stock';
      } else if (medicine.stock <= 20) {
        medicine.status = 'Low Stock';
      } else {
        medicine.status = 'In Stock';
      }
      await medicine.save();
    }

    // 3. Create permanent InventoryWriteOff record
    const unitCost = Number(batch.purchaseRate || 0);
    const totalValue = Math.round(writeOffQty * unitCost * 100) / 100;
    const count = await InventoryWriteOff.countDocuments({ tenantId: req.tenantId });
    const writeOffId = 'WO-' + new Date().getFullYear() + '-' + String(count + 1).padStart(4, '0');

    const writeOffRecord = await InventoryWriteOff.create({
      tenantId: req.tenantId,
      writeOffId,
      medicineId: batch.medicineId,
      sku: batch.sku,
      medicineName: batch.name,
      batchId: batch._id,
      batchNumber: batch.batchNumber,
      expiryDate: batch.expiryDate,
      quantity: writeOffQty,
      unitCost,
      totalValue,
      reason: reason || 'Expired Inventory Write-Off',
      status: 'Written Off',
      grnId: batch.grnId,
      vendorName: batch.vendorName,
      detectedAt: new Date(),
      detectedBy: req.user?.name || 'Pharmacist',
      approvedAt: new Date(),
      approvedBy: req.user?.name || 'Pharmacist'
    });

    // 4. Audit Log
    await AuditLog.create({
      tenantId: req.tenantId,
      actor: req.user?.staff_id || req.user?.id || 'system',
      actorName: req.user?.name || 'Pharmacist',
      actorRole: req.user?.role || 'Pharmacy',
      action: 'INVENTORY_EXPIRY_WRITE_OFF',
      target: writeOffId,
      details: 'Written off ' + writeOffQty + ' units of ' + batch.name + ' (Batch: ' + batch.batchNumber + ') valued at ₹' + totalValue,
      metadata: {
        writeOffId,
        sku: batch.sku,
        batchNumber: batch.batchNumber,
        quantity: writeOffQty,
        unitCost,
        totalValue
      }
    });

    const io = req.app.get('io');
    if (io && req.tenantId) {
      io.to(req.tenantId).emit('data_changed', { type: 'medicines' });
      io.to(req.tenantId).emit('data_changed', { type: 'inventory_expiry' });
    }

    res.status(201).json({
      message: 'Batch successfully written off.',
      writeOffRecord,
      remainingBatchQty: batch.availableQuantity,
      remainingMedicineStock: medicine ? medicine.stock : 0
    });
  } catch (error) {
    console.error('Write-off error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
