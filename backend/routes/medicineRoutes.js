const express = require('express');
const Medicine = require('../models/Medicine');
const { verifyToken } = require('../middleware/authMiddleware');
const router = express.Router();

router.use(verifyToken);

// Seed helper (scoped to tenant)
const seedDefaultMedicines = async (tenantId) => {
  // Auto-seeding disabled to ensure only real user data is displayed
  return;
};

// Get all medicines (scoped to tenant)
router.get('/', async (req, res) => {
  try {
    await seedDefaultMedicines(req.tenantId);

    const isPaginationRequested = req.query.page !== undefined || req.query.limit !== undefined || req.query.paginated === 'true';
    if (isPaginationRequested) {
      const page = Math.max(1, parseInt(req.query.page, 10) || 1);
      const limit = Math.max(1, Math.min(2000, parseInt(req.query.limit, 10) || 50));
      const skip = (page - 1) * limit;

      const [total, medicines] = await Promise.all([
        Medicine.countDocuments({ tenantId: req.tenantId }),
        Medicine.find({ tenantId: req.tenantId }).sort({ createdAt: -1 }).skip(skip).limit(limit)
      ]);

      return res.json({
        data: medicines,
        pagination: {
          total,
          page,
          limit,
          pages: Math.ceil(total / limit)
        }
      });
    }

    const medicines = await Medicine.find({ tenantId: req.tenantId }).sort({ createdAt: -1 });
    res.json(medicines);
  } catch (error) {
    console.error("Get medicines error:", error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Add a new medicine (scoped to tenant)
router.post('/', async (req, res) => {
  const { name, category, sku, stock, unit, mrp, expiry } = req.body;
  try {
    // Determine status based on stock level
    let status = 'In Stock';
    const stockVal = Number(stock) || 0;
    if (stockVal === 0) {
      status = 'Out of Stock';
    } else if (stockVal <= 20) {
      status = 'Low Stock';
    }
    
    const medicine = await Medicine.create({
      tenantId: req.tenantId,
      name,
      category,
      sku,
      stock: stockVal,
      unit,
      mrp: Number(mrp) || 0,
      expiry,
      status
    });
    const io = req.app.get("io");
    if (io && req.tenantId) {
      io.to(req.tenantId).emit("data_changed", { type: "medicines" });
    }
    res.status(201).json(medicine);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Update a medicine (Edit or Restock, scoped to tenant)
router.put('/:id', async (req, res) => {
  const { name, category, sku, stock, unit, mrp, expiry } = req.body;
  try {
    const updateData = {};
    if (name !== undefined) updateData.name = name;
    if (category !== undefined) updateData.category = category;
    if (sku !== undefined) updateData.sku = sku;
    if (unit !== undefined) updateData.unit = unit;
    if (mrp !== undefined) updateData.mrp = Number(mrp) || 0;
    if (expiry !== undefined) updateData.expiry = expiry;

    if (stock !== undefined) {
      const stockVal = Number(stock) || 0;
      updateData.stock = stockVal;
      if (stockVal === 0) {
        updateData.status = 'Out of Stock';
      } else if (stockVal <= 20) {
        updateData.status = 'Low Stock';
      } else {
        updateData.status = 'In Stock';
      }
    }
    
    const medicine = await Medicine.findOneAndUpdate(
      { _id: req.params.id, tenantId: req.tenantId }, 
      updateData, 
      { returnDocument: 'after' }
    );
    if (!medicine) return res.status(404).json({ error: 'Medicine not found' });
    const io = req.app.get("io");
    if (io && req.tenantId) {
      io.to(req.tenantId).emit("data_changed", { type: "medicines" });
    }
    res.json(medicine);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Delete a medicine (scoped to tenant)
router.delete('/:id', async (req, res) => {
  try {
    const medicine = await Medicine.findOneAndDelete({ _id: req.params.id, tenantId: req.tenantId });
    if (!medicine) return res.status(404).json({ error: 'Medicine not found' });
    const io = req.app.get("io");
    if (io && req.tenantId) {
      io.to(req.tenantId).emit("data_changed", { type: "medicines" });
    }
    res.json({ message: 'Medicine deleted successfully' });
  } catch (error) {
    console.error("Delete medicine error:", error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get medicine by SKU / Barcode (scoped to tenant)
router.get('/barcode/:sku', async (req, res) => {
  try {
    const medicine = await Medicine.findOne({ tenantId: req.tenantId, sku: req.params.sku });
    if (!medicine) {
      return res.status(404).json({ error: 'Medicine not found with this barcode' });
    }
    res.json(medicine);
  } catch (error) {
    console.error("Get medicine barcode error:", error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
