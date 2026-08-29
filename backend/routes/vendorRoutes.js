const express = require('express');
const Vendor = require('../models/Vendor');
const { verifyToken } = require('../middleware/authMiddleware');
const router = express.Router();

router.use(verifyToken);

// Seeding default vendors if none exist
const seedDefaultVendors = async (tenantId) => {
  try {
    const count = await Vendor.countDocuments({ tenantId });
    if (count === 0) {
      const defaults = [
        {
          tenantId,
          name: "MedLife Distributors",
          code: "VEND-01",
          email: "contact@medlife.com",
          phone: "+91 99999 88888",
          address: "Sector 15, New Delhi, DL",
          medicines: [
            { name: "Paracetamol 650mg", sku: "PAR-650", price: 12.50, available: true },
            { name: "Azithromycin 500mg", sku: "AZI-500", price: 42.00, available: true },
            { name: "Cetirizine 10mg", sku: "CET-10", price: 8.00, available: true },
            { name: "Pantoprazole 40mg", sku: "PAN-40", price: 28.00, available: true },
            { name: "Amoxicillin 250mg", sku: "AMX-250", price: 21.00, available: true }
          ],
          purchaseHistory: [
            { poId: "PO-2026-001", date: new Date("2026-06-15"), amount: 12500, status: "Approved" }
          ]
        },
        {
          tenantId,
          name: "Global Pharma Supply",
          code: "VEND-02",
          email: "sales@globalpharma.com",
          phone: "+91 88888 77777",
          address: "Andheri East, Mumbai, MH",
          medicines: [
            { name: "Paracetamol 650mg", sku: "PAR-650", price: 14.00, available: true },
            { name: "Azithromycin 500mg", sku: "AZI-500", price: 38.50, available: true },
            { name: "Cetirizine 10mg", sku: "CET-10", price: 9.50, available: true },
            { name: "Pantoprazole 40mg", sku: "PAN-40", price: 24.50, available: true },
            { name: "Amoxicillin 250mg", sku: "AMX-250", price: 26.00, available: true }
          ],
          purchaseHistory: []
        },
        {
          tenantId,
          name: "Apex Healthcare",
          code: "VEND-03",
          email: "orders@apexhealth.in",
          phone: "+91 77777 66666",
          address: "Tech Zone, Bangalore, KA",
          medicines: [
            { name: "Paracetamol 650mg", sku: "PAR-650", price: 11.80, available: true },
            { name: "Azithromycin 500mg", sku: "AZI-500", price: 44.00, available: true },
            { name: "Cetirizine 10mg", sku: "CET-10", price: 7.20, available: true },
            { name: "Pantoprazole 40mg", sku: "PAN-40", price: 30.00, available: true },
            { name: "Amoxicillin 250mg", sku: "AMX-250", price: 19.50, available: true }
          ],
          purchaseHistory: []
        }
      ];
      await Vendor.insertMany(defaults);
      console.log(`Default vendors seeded successfully for tenant: ${tenantId}`);
    }
  } catch (err) {
    console.error('Failed to seed vendors', err);
  }
};

// Get all vendors (scoped to tenant)
router.get('/', async (req, res) => {
  try {
    // Disabled automatic mock vendor seeding as requested
    // await seedDefaultVendors(req.tenantId);
    const vendors = await Vendor.find({ tenantId: req.tenantId }).sort({ name: 1 });
    res.json(vendors);
  } catch (error) {
    console.error("Get vendors error:", error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Add a new vendor (scoped to tenant)
router.post('/', async (req, res) => {
  try {
    const { name, code, phone, email, address, type, medicines, attachments, creditLimit, creditDays, paymentMethod } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Vendor name is required' });
    }
    if (!code || !code.trim()) {
      return res.status(400).json({ error: 'Vendor code is required' });
    }

    // Rate list validation
    if (!Array.isArray(medicines) || medicines.length === 0) {
      return res.status(400).json({ error: 'At least one medicine/rate-list item is required' });
    }

    const seenSkus = new Set();
    const sanitizedMedicines = [];

    for (let i = 0; i < medicines.length; i++) {
      const item = medicines[i];
      if (!item.name || !item.name.trim()) {
        return res.status(400).json({ error: `Medicine name is required for item #${i + 1}` });
      }
      if (!item.sku || !item.sku.trim()) {
        return res.status(400).json({ error: `SKU code is required for medicine '${item.name}'` });
      }
      
      const cleanSku = item.sku.trim().toUpperCase();
      if (seenSkus.has(cleanSku)) {
        return res.status(400).json({ error: `Duplicate SKU '${cleanSku}' found in the submitted rate list` });
      }
      seenSkus.add(cleanSku);

      const priceVal = Number(item.price);
      if (!Number.isFinite(priceVal) || isNaN(priceVal) || priceVal <= 0) {
        return res.status(400).json({ error: `Purchase price must be a valid positive number for '${item.name}'` });
      }

      const gstVal = item.gst !== undefined && item.gst !== '' ? Number(item.gst) : 12;
      if (!Number.isFinite(gstVal) || isNaN(gstVal) || gstVal < 0) {
        return res.status(400).json({ error: `GST must be a valid non-negative number for '${item.name}'` });
      }

      sanitizedMedicines.push({
        name: item.name.trim(),
        sku: cleanSku,
        price: priceVal,
        gst: gstVal,
        available: item.available !== false
      });
    }

    const vendor = await Vendor.create({
      ...req.body,
      tenantId: req.tenantId,
      name: name.trim(),
      code: code.trim().toUpperCase(),
      type: type || 'Medicine',
      status: 'Proposed', // Force Proposed status for admin approval
      attachments: attachments || [],
      creditLimit: Number(creditLimit) || 0,
      creditDays: Number(creditDays) || 30,
      paymentMethod: paymentMethod || 'NEFT',
      medicines: sanitizedMedicines,
      purchaseHistory: []
    });

    const Approval = require('../models/Approval');
    await Approval.create({
      tenantId: req.tenantId,
      type: 'vendor_onboarding',
      staffId: req.user.staff_id || req.user.id || 'system',
      requesterName: req.user.name || 'Procurement Staff',
      requesterRole: req.user.role || 'staff',
      details: {
        vendorId: vendor._id,
        vendorName: vendor.name,
        vendorCode: vendor.code,
        contact: vendor.phone || vendor.email || '',
        gstNumber: vendor.gstNumber || '',
        address: vendor.address || '',
        items: sanitizedMedicines.map(m => ({
          name: m.name,
          sku: m.sku,
          price: m.price,
          gst: m.gst,
          available: m.available
        })),
        attachments: vendor.attachments || []
      },
      comment: `Proposed vendor onboarding approval for ${vendor.name}`
    });
    
    const io = req.app.get("io");
    if (io && req.tenantId) {
      io.to(req.tenantId).emit("data_changed", { type: "vendors" });
      io.to(req.tenantId).emit("data_changed", { type: "approvals" });
    }
    res.status(201).json(vendor);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Update a vendor (scoped to tenant)
router.put('/:id', async (req, res) => {
  try {
    const vendor = await Vendor.findOneAndUpdate(
      { _id: req.params.id, tenantId: req.tenantId },
      { 
        ...req.body,
        creditLimit: Number(req.body.creditLimit) || 0,
        creditDays: Number(req.body.creditDays) || 30,
      },
      { returnDocument: 'after' }
    );
    if (!vendor) return res.status(404).json({ error: 'Vendor not found' });
    
    const io = req.app.get("io");
    if (io && req.tenantId) {
      io.to(req.tenantId).emit("data_changed", { type: "vendors" });
    }
    res.json(vendor);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Update vendor's price list (scoped to tenant)
router.put('/:id/price-list', async (req, res) => {
  const { medicines } = req.body;
  try {
    const cleanMedicines = Array.isArray(medicines)
      ? medicines
          .filter(m => m && m.name && m.name.trim() !== '' && m.sku && m.sku.trim() !== '')
          .map(m => ({
            name: m.name.trim(),
            sku: m.sku.trim().toUpperCase(),
            price: Number(m.price || 0),
            gst: m.gst !== undefined ? Number(m.gst) : 12,
            available: m.available !== false
          }))
      : [];

    const vendor = await Vendor.findOneAndUpdate(
      { _id: req.params.id, tenantId: req.tenantId },
      { medicines: cleanMedicines },
      { returnDocument: 'after' }
    );
    if (!vendor) return res.status(404).json({ error: 'Vendor not found' });
    
    const io = req.app.get("io");
    if (io && req.tenantId) {
      io.to(req.tenantId).emit("data_changed", { type: "vendors" });
    }
    res.json(vendor);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Delete a vendor (scoped to tenant)
router.delete('/:id', async (req, res) => {
  try {
    const vendor = await Vendor.findOneAndDelete({ _id: req.params.id, tenantId: req.tenantId });
    if (!vendor) return res.status(404).json({ error: 'Vendor not found' });
    
    const io = req.app.get("io");
    if (io && req.tenantId) {
      io.to(req.tenantId).emit("data_changed", { type: "vendors" });
    }
    res.json({ message: 'Vendor deleted successfully', vendor });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
