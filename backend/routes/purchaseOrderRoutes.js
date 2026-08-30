const express = require('express');
const PurchaseOrder = require('../models/PurchaseOrder');
const Vendor = require('../models/Vendor');
const { verifyToken } = require('../middleware/authMiddleware');
const router = express.Router();

router.use(verifyToken);

function getFinancialYearString(date = new Date()) {
  const month = date.getMonth(); // 0-11
  const year = date.getFullYear();
  let fyStart, fyEnd;
  if (month >= 3) { // April is month index 3
    fyStart = year;
    fyEnd = year + 1;
  } else {
    fyStart = year - 1;
    fyEnd = year;
  }
  const fyEndShort = String(fyEnd).slice(-2);
  return `${fyStart}-${fyEndShort}`; // e.g. "2026-27"
}

async function getNextPoId(tenantId) {
  const fyStr = getFinancialYearString();
  const prefix = `PO-${fyStr}-`;

  // Find all purchase orders matching prefix for this tenant to find true max serial
  const pos = await PurchaseOrder.find({
    tenantId,
    poId: { $regex: `^${prefix}` }
  }, { poId: 1 });

  let maxSerial = 0;
  for (const p of pos) {
    if (p.poId) {
      const match = p.poId.match(/PO-\d{4}-\d{2}-(\d+)/);
      if (match && match[1]) {
        const num = parseInt(match[1], 10);
        if (!isNaN(num) && num > maxSerial) {
          maxSerial = num;
        }
      }
    }
  }

  const nextSerial = maxSerial + 1;
  return `${prefix}${String(nextSerial).padStart(4, '0')}`;
}

// Get all Purchase Orders (scoped to tenant & role)
router.get('/', async (req, res) => {
  try {
    const filter = { tenantId: req.tenantId };

    // Server-side Vendor Portal Isolation: Vendors only see their own approved child POs
    if (req.user && (req.user.role === 'vendor' || req.user.vendorId)) {
      const vId = req.user.vendorId || req.user.id || req.user._id;
      filter.vendorId = vId;
      filter.status = 'Approved';
      filter.isParent = false;
    } else {
      if (req.query.vendorId) filter.vendorId = req.query.vendorId;
      if (req.query.status) filter.status = req.query.status;
      if (req.query.parentPOId) filter.parentPOId = req.query.parentPOId;
      if (req.query.isParent !== undefined) filter.isParent = req.query.isParent === 'true';
    }

    const pos = await PurchaseOrder.find(filter).sort({ createdAt: -1 });
    res.json(pos);
  } catch (error) {
    console.error("Get purchase orders error:", error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get next sequential PO number
router.get('/next-number', async (req, res) => {
  try {
    const nextNumber = await getNextPoId(req.tenantId);
    res.json({ nextNumber });
  } catch (error) {
    console.error("Get next PO number error:", error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get single Purchase Order by ID with role authorization
router.get('/:id', async (req, res) => {
  try {
    const filter = { _id: req.params.id, tenantId: req.tenantId };
    if (req.user && (req.user.role === 'vendor' || req.user.vendorId)) {
      const vId = req.user.vendorId || req.user.id || req.user._id;
      filter.vendorId = vId;
      filter.status = 'Approved';
      filter.isParent = false;
    }
    const po = await PurchaseOrder.findOne(filter);
    if (!po) return res.status(404).json({ error: 'Purchase Order not found' });
    res.json(po);
  } catch (error) {
    console.error("Get single purchase order error:", error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create a new Consolidated Purchase Order (with automatic Vendor Splitting)
router.post('/', async (req, res) => {
  console.log("BACKEND RECEIVED PO req.body:", JSON.stringify(req.body, null, 2));
  const { items, requestedBy, expectedDelivery, notes } = req.body;
  try {
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'At least one item is required to create a purchase order' });
    }

    // 1. Validate Active Vendors and sanitize line items
    const activeVendors = await Vendor.find({ tenantId: req.tenantId, status: 'Active' });
    const activeVendorMap = new Map(activeVendors.map(v => [v._id.toString(), v]));

    const vendorGroups = {};
    const sanitizedItems = [];
    let grandSubtotal = 0;
    let grandTaxAmount = 0;
    let grandTotal = 0;

    for (let idx = 0; idx < items.length; idx++) {
      const it = items[idx];
      if (!it.name || !it.name.trim()) {
        return res.status(400).json({ error: `Item name is required for line #${idx + 1}` });
      }
      if (!it.sku || !it.sku.trim()) {
        return res.status(400).json({ error: `SKU is required for item '${it.name}'` });
      }
      
      const qty = Number(it.requiredQty || it.qty || 0);
      if (!Number.isFinite(qty) || qty <= 0) {
        return res.status(400).json({ error: `Quantity must be a positive number for '${it.name}'` });
      }

      // Determine vendor
      let vId = it.vendorId ? it.vendorId.toString() : null;
      let vObj = vId ? activeVendorMap.get(vId) : null;

      if (!vObj) {
        // Find cheapest active vendor supplying this item if vendorId was not explicitly passed
        let cheapestVendor = null;
        let lowestPrice = Infinity;
        let bestGst = 12;

        for (const v of activeVendors) {
          const match = (v.medicines || []).find(m => m.sku === it.sku.trim().toUpperCase() && m.available !== false);
          if (match && Number(match.price) < lowestPrice) {
            lowestPrice = Number(match.price);
            bestGst = match.gst !== undefined ? Number(match.gst) : 12;
            cheapestVendor = v;
          }
        }

        if (cheapestVendor) {
          vObj = cheapestVendor;
          vId = cheapestVendor._id.toString();
        } else if (activeVendors.length > 0) {
          vObj = activeVendors[0];
          vId = vObj._id.toString();
        } else {
          return res.status(400).json({ error: `No Active vendor available to fulfill '${it.name}'` });
        }
      }

      // Read vendor rate list to verify authoritative price & GST
      const medRate = (vObj.medicines || []).find(m => m.sku === it.sku.trim().toUpperCase() && m.available !== false);
      const unitPrice = medRate ? Number(medRate.price) : (Number(it.price) || 0);
      const taxRate = medRate && medRate.gst !== undefined ? Number(medRate.gst) : (Number(it.tax) || 12);
      
      if (unitPrice <= 0) {
        return res.status(400).json({ error: `Valid positive purchase price not found for '${it.name}' from vendor '${vObj.name}'` });
      }

      const lineSubtotal = qty * unitPrice;
      const lineTax = (lineSubtotal * taxRate) / 100;
      const lineTotal = lineSubtotal + lineTax;

      grandSubtotal += lineSubtotal;
      grandTaxAmount += lineTax;
      grandTotal += lineTotal;

      const sanitizedLine = {
        itemId: it.itemId || it._id || undefined,
        name: it.name.trim(),
        sku: it.sku.trim().toUpperCase(),
        requiredQty: qty,
        price: unitPrice,
        tax: taxRate,
        total: Math.round(lineTotal * 100) / 100,
        vendorId: vObj._id,
        vendorName: vObj.name
      };

      sanitizedItems.push(sanitizedLine);

      if (!vendorGroups[vId]) {
        vendorGroups[vId] = {
          vendor: vObj,
          items: [],
          subtotal: 0,
          taxAmount: 0,
          totalAmount: 0
        };
      }
      vendorGroups[vId].items.push(sanitizedLine);
      vendorGroups[vId].subtotal += lineSubtotal;
      vendorGroups[vId].taxAmount += lineTax;
      vendorGroups[vId].totalAmount += lineTotal;
    }

    // 2. Determine distinct vendors involved in the procurement request
    const vendorKeys = Object.keys(vendorGroups);
    const distinctVendorCount = vendorKeys.length;
    const Approval = require('../models/Approval');
    const generatedPoId = await getNextPoId(req.tenantId);

    // SCENARIO A — SINGLE VENDOR: Create a direct, normal Purchase Order (no Master PO, no sub-PO, no suffix)
    if (distinctVendorCount === 1) {
      const singleVendorKey = vendorKeys[0];
      const grp = vendorGroups[singleVendorKey];
      const poTotal = Math.round(grp.totalAmount * 100) / 100;
      const poSubtotal = Math.round(grp.subtotal * 100) / 100;
      const poTax = Math.round(grp.taxAmount * 100) / 100;

      const singlePO = await PurchaseOrder.create({
        tenantId: req.tenantId,
        poId: generatedPoId,
        parentPOId: null,
        isParent: false,
        vendorId: grp.vendor._id,
        vendorName: grp.vendor.name,
        items: grp.items,
        subtotal: poSubtotal,
        taxAmount: poTax,
        totalAmount: poTotal,
        totalItems: grp.items.length,
        totalVendors: 1,
        vendorOrders: [],
        requestedBy: requestedBy || req.user.name || 'Pharmacist',
        status: 'Pending Approval',
        expectedDelivery: expectedDelivery ? new Date(expectedDelivery) : null,
        notes: notes || ''
      });

      // Create Admin Approval document directly for this normal single-vendor PO
      await Approval.create({
        tenantId: req.tenantId,
        type: 'purchase_order_approval',
        staffId: req.user.staff_id || req.user.id || 'system',
        requesterName: requestedBy || req.user.name || 'Pharmacist',
        requesterRole: req.user.role || 'pharmacist',
        details: {
          poId: singlePO._id,
          poNumber: singlePO.poId,
          parentPOId: null,
          parentPONumber: null,
          vendorId: grp.vendor._id,
          vendorName: grp.vendor.name,
          items: singlePO.items,
          subtotal: poSubtotal,
          taxAmount: poTax,
          totalAmount: poTotal
        },
        comment: `Purchase Order approval request for ${singlePO.poId} (${grp.vendor.name})`
      });

      // Emit targeted Socket.IO notifications
      const io = req.app.get("io");
      if (io && req.tenantId) {
        io.to(req.tenantId).emit("data_changed", { type: "purchase_orders" });
        io.to(req.tenantId).emit("data_changed", { type: "approvals" });
      }

      return res.status(201).json({
        message: 'Purchase order created successfully',
        parentPO: singlePO,
        purchaseOrder: singlePO,
        childPOsCount: 0,
        isParent: false
      });
    }

    // SCENARIO B — MULTIPLE VENDORS (distinctVendorCount > 1): Create Master PO + vendor-specific Sub-POs
    const parentPoId = generatedPoId;
    const childOrders = [];
    const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    for (let i = 0; i < vendorKeys.length; i++) {
      const vKey = vendorKeys[i];
      const grp = vendorGroups[vKey];
      const suffix = LETTERS[i % LETTERS.length];
      const childPoId = `${parentPoId}-${suffix}`;
      const childTotal = Math.round(grp.totalAmount * 100) / 100;
      const childSubtotal = Math.round(grp.subtotal * 100) / 100;
      const childTax = Math.round(grp.taxAmount * 100) / 100;

      const childPO = await PurchaseOrder.create({
        tenantId: req.tenantId,
        poId: childPoId,
        parentPOId: parentPoId,
        isParent: false,
        vendorId: grp.vendor._id,
        vendorName: grp.vendor.name,
        items: grp.items,
        subtotal: childSubtotal,
        taxAmount: childTax,
        totalAmount: childTotal,
        totalItems: grp.items.length,
        totalVendors: 1,
        requestedBy: requestedBy || req.user.name || 'Pharmacist',
        status: 'Pending Approval',
        expectedDelivery: expectedDelivery ? new Date(expectedDelivery) : null,
        notes: notes || ''
      });

      childOrders.push({
        poId: childPO.poId,
        vendorId: grp.vendor._id,
        vendorName: grp.vendor.name,
        totalAmount: childTotal,
        status: 'Pending Approval'
      });

      // Create distinct Admin Approval document per vendor PO
      await Approval.create({
        tenantId: req.tenantId,
        type: 'purchase_order_approval',
        staffId: req.user.staff_id || req.user.id || 'system',
        requesterName: requestedBy || req.user.name || 'Pharmacist',
        requesterRole: req.user.role || 'pharmacist',
        details: {
          poId: childPO._id,
          poNumber: childPO.poId,
          parentPOId: parentPoId,
          parentPONumber: parentPoId,
          vendorId: grp.vendor._id,
          vendorName: grp.vendor.name,
          items: childPO.items,
          subtotal: childSubtotal,
          taxAmount: childTax,
          totalAmount: childTotal
        },
        comment: `Purchase Order approval request for ${childPO.poId} (${grp.vendor.name})`
      });
    }

    // Create Master Parent Consolidated PO
    const parentPO = await PurchaseOrder.create({
      tenantId: req.tenantId,
      poId: parentPoId,
      parentPOId: null,
      isParent: true,
      vendorId: null,
      vendorName: 'Consolidated Multiple Suppliers',
      items: sanitizedItems,
      subtotal: Math.round(grandSubtotal * 100) / 100,
      taxAmount: Math.round(grandTaxAmount * 100) / 100,
      totalAmount: Math.round(grandTotal * 100) / 100,
      totalItems: sanitizedItems.length,
      totalVendors: vendorKeys.length,
      vendorOrders: childOrders,
      requestedBy: requestedBy || req.user.name || 'Pharmacist',
      status: 'Pending Approval',
      expectedDelivery: expectedDelivery ? new Date(expectedDelivery) : null,
      notes: notes || ''
    });

    // Emit targeted Socket.IO notifications
    const io = req.app.get("io");
    if (io && req.tenantId) {
      io.to(req.tenantId).emit("data_changed", { type: "purchase_orders" });
      io.to(req.tenantId).emit("data_changed", { type: "approvals" });
    }

    res.status(201).json({
      message: 'Consolidated purchase order created and split into vendor orders successfully',
      parentPO,
      childPOsCount: childOrders.length
    });
  } catch (error) {
    console.error("Create purchase order error:", error);
    res.status(400).json({ error: error.message });
  }
});

// Edit / Update a Purchase Order (scoped to tenant - used by Admin)
router.put('/:id', async (req, res) => {
  const { items, totalAmount, paidAmount, vendorId, vendorName, status, expectedDelivery } = req.body;
  try {
    const updateData = {};
    if (items !== undefined) updateData.items = items;
    if (totalAmount !== undefined) updateData.totalAmount = totalAmount;
    if (paidAmount !== undefined) updateData.paidAmount = paidAmount;
    if (vendorId !== undefined) updateData.vendorId = vendorId;
    if (vendorName !== undefined) updateData.vendorName = vendorName;
    if (status !== undefined) updateData.status = status;
    if (expectedDelivery !== undefined) updateData.expectedDelivery = expectedDelivery ? new Date(expectedDelivery) : null;

    const po = await PurchaseOrder.findOneAndUpdate(
      { _id: req.params.id, tenantId: req.tenantId },
      updateData,
      { returnDocument: 'after' }
    );
    
    if (!po) return res.status(404).json({ error: 'Purchase Order not found' });

    // Also update vendor purchase history if approved
    if (status === 'Approved') {
      await Vendor.findOneAndUpdate(
        { _id: po.vendorId, tenantId: req.tenantId },
        {
          $push: {
            purchaseHistory: {
              poId: po.poId,
              date: new Date(),
              amount: po.totalAmount,
              status: 'Approved'
            }
          }
        }
      );
    }

    const io = req.app.get("io");
    if (io && req.tenantId) {
      io.to(req.tenantId).emit("data_changed", { type: "purchase_orders" });
      if (status === 'Approved') {
        io.to(req.tenantId).emit("data_changed", { type: "vendors" });
      }
    }
    res.json(po);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Delete a Purchase Order (scoped to tenant)
router.delete('/:id', async (req, res) => {
  try {
    const po = await PurchaseOrder.findOneAndDelete({ _id: req.params.id, tenantId: req.tenantId });
    if (!po) return res.status(404).json({ error: 'Purchase Order not found' });

    const io = req.app.get("io");
    if (io && req.tenantId) {
      io.to(req.tenantId).emit("data_changed", { type: "purchase_orders" });
    }
    res.json({ message: 'Purchase Order deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Approve Purchase Order
router.put('/:id/approve', async (req, res) => {
  try {
    const po = await PurchaseOrder.findOneAndUpdate(
      { _id: req.params.id, tenantId: req.tenantId },
      { status: 'Approved' },
      { returnDocument: 'after' }
    );
    if (!po) return res.status(404).json({ error: 'Purchase Order not found' });

    // Push into vendor purchase history
    await Vendor.findOneAndUpdate(
      { _id: po.vendorId, tenantId: req.tenantId },
      {
        $push: {
          purchaseHistory: {
            poId: po.poId,
            date: new Date(),
            amount: po.totalAmount,
            status: 'Approved'
          }
        }
      }
    );

    const io = req.app.get("io");
    if (io && req.tenantId) {
      io.to(req.tenantId).emit("data_changed", { type: "purchase_orders" });
      io.to(req.tenantId).emit("data_changed", { type: "vendors" });
    }
    res.json(po);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

module.exports = router;
