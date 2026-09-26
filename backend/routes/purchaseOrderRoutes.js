const express = require('express');
const PurchaseOrder = require('../models/PurchaseOrder');
const Vendor = require('../models/Vendor');
const ItemMaster = require('../models/ItemMaster');
const VendorQuotation = require('../models/VendorQuotation');
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

    // Server-side pagination support (with backwards-compatible array fallback)
    const isPaginationRequested = req.query.page !== undefined || req.query.limit !== undefined || req.query.paginated === 'true';
    if (isPaginationRequested) {
      const page = Math.max(1, parseInt(req.query.page, 10) || 1);
      const limit = Math.max(1, Math.min(100, parseInt(req.query.limit, 10) || 20));
      const skip = (page - 1) * limit;

      const [total, pos] = await Promise.all([
        PurchaseOrder.countDocuments(filter),
        PurchaseOrder.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit)
      ]);

      return res.json({
        data: pos,
        pagination: {
          total,
          page,
          limit,
          pages: Math.ceil(total / limit)
        }
      });
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
      const qty = Number(it.requiredQty || it.qty || 0);
      if (!Number.isFinite(qty) || qty <= 0) {
        return res.status(400).json({ error: `Quantity must be a positive number for line #${idx + 1}` });
      }

      let itemDoc = null;
      let quotationDoc = null;
      let vObj = null;
      let vId = null;

      // 1. MODERN PIPELINE: When itemMasterId or quotationId is provided
      if (it.itemMasterId || it.quotationId) {
        if (!it.itemMasterId) {
          return res.status(400).json({ error: `Item Master reference is required for line #${idx + 1}` });
        }

        // Step 1 & 2: Verify Item Master exists (either hospital-scoped or global catalog)
        itemDoc = await ItemMaster.findOne({
          _id: it.itemMasterId,
          $or: [{ tenantId: req.tenantId }, { scope: 'GLOBAL' }]
        });
        if (!itemDoc) {
          return res.status(400).json({ error: `Item Master not found or belongs to another hospital for line #${idx + 1}` });
        }

        // Step 3: Verify Item Master is Active
        if (itemDoc.status !== 'Active') {
          return res.status(400).json({ error: `Item Master '${itemDoc.brandName || itemDoc.genericName}' (${itemDoc.itemCode}) is Inactive and cannot be ordered` });
        }

        // Step 4 & 5: Verify Vendor Quotation exists and belongs to current tenant
        if (!it.quotationId) {
          return res.status(400).json({ error: `Vendor Quotation is required for '${itemDoc.brandName || itemDoc.genericName}'` });
        }

        quotationDoc = await VendorQuotation.findOne({ _id: it.quotationId, tenantId: req.tenantId });
        if (!quotationDoc) {
          return res.status(400).json({ error: `Vendor Quotation not found or belongs to another hospital for line #${idx + 1}` });
        }

        // Step 6: Verify quotation references the selected Item Master
        if (quotationDoc.itemMasterId.toString() !== itemDoc._id.toString()) {
          return res.status(400).json({ error: `Vendor Quotation '${quotationDoc.quotationNo}' does not reference selected Item Master '${itemDoc.itemCode}'` });
        }

        // Step 7: Verify quotation status (must be Active or Approved)
        const now = new Date();
        if (quotationDoc.status !== 'Active' && quotationDoc.status !== 'Approved') {
          return res.status(400).json({ error: `Vendor Quotation '${quotationDoc.quotationNo}' is not active/approved (status: ${quotationDoc.status})` });
        }
        if (quotationDoc.validTill && new Date(quotationDoc.validTill) < now) {
          return res.status(400).json({ error: `Vendor Quotation '${quotationDoc.quotationNo}' expired on ${new Date(quotationDoc.validTill).toLocaleDateString()}` });
        }
        if (quotationDoc.effectiveTo && new Date(quotationDoc.effectiveTo) < now) {
          return res.status(400).json({ error: `Vendor Quotation '${quotationDoc.quotationNo}' expired on ${new Date(quotationDoc.effectiveTo).toLocaleDateString()}` });
        }
        if (quotationDoc.effectiveFrom && new Date(quotationDoc.effectiveFrom) > now) {
          return res.status(400).json({ error: `Vendor Quotation '${quotationDoc.quotationNo}' is not yet effective` });
        }

        // Step 8: Verify quotation vendor belongs to current tenant and is Active
        vId = quotationDoc.vendorId.toString();
        vObj = activeVendorMap.get(vId);
        if (!vObj) {
          return res.status(400).json({ error: `Vendor '${quotationDoc.vendorName}' is inactive or not found for quotation '${quotationDoc.quotationNo}'` });
        }

        // Step 8b: Verify quotation vendor matches selected vendor (if specified on item or PO)
        if (it.vendorId && it.vendorId.toString() !== vId) {
          return res.status(400).json({ error: `Vendor mismatch: Quotation '${quotationDoc.quotationNo}' belongs to vendor '${quotationDoc.vendorName}' but item specified a different vendor` });
        }
        if (req.body.vendorId && req.body.vendorId.toString() !== vId) {
          return res.status(400).json({ error: `Vendor mismatch: Purchase order specifies vendor '${req.body.vendorId}' but quotation belongs to vendor '${quotationDoc.vendorName}'` });
        }

        // Step 8c: Verify packaging metadata and converterFactor consistency if supplied by client
        const canonicalConverter = Number(quotationDoc.converterFactor || itemDoc.converterFactor || 1);
        if (it.converterFactor && Math.abs(Number(it.converterFactor) - canonicalConverter) > 0.001) {
          return res.status(400).json({ error: `Packaging inconsistency: Converter factor (${it.converterFactor}) does not match authoritative quotation/item master converter factor (${canonicalConverter})` });
        }
      } else {
        // 2. LEGACY FALLBACK: When neither itemMasterId nor quotationId is provided
        if (!it.name || !it.name.trim()) {
          return res.status(400).json({ error: `Item name is required for line #${idx + 1}` });
        }
        if (!it.sku || !it.sku.trim()) {
          return res.status(400).json({ error: `SKU is required for item '${it.name}'` });
        }

        // Attempt to find active ItemMaster by SKU or name (tenant or global catalog)
        itemDoc = await ItemMaster.findOne({
          $or: [{ tenantId: req.tenantId }, { scope: 'GLOBAL' }],
          status: 'Active',
          $and: [
            {
              $or: [
                { itemCode: it.sku.trim().toUpperCase() },
                { genericName: { $regex: new RegExp(`^${it.name.trim()}$`, 'i') } }
              ]
            }
          ]
        });

        if (itemDoc) {
          const activeQuotation = await VendorQuotation.findOne({
            tenantId: req.tenantId,
            itemMasterId: itemDoc._id,
            status: 'Active',
            validTill: { $gte: new Date() }
          }).sort({ netEffectiveRate: 1 });

          if (activeQuotation && activeVendorMap.has(activeQuotation.vendorId.toString())) {
            quotationDoc = activeQuotation;
            vObj = activeVendorMap.get(activeQuotation.vendorId.toString());
            vId = vObj._id.toString();
          }
        }

        if (!vObj) {
          vId = it.vendorId ? it.vendorId.toString() : null;
          vObj = vId ? activeVendorMap.get(vId) : null;
        }

        if (!vObj) {
          // Find vendor supplying this item in legacy medicines
          let cheapestVendor = null;
          let lowestPrice = Infinity;
          for (const v of activeVendors) {
            const match = (v.medicines || []).find(m => m.sku === it.sku.trim().toUpperCase() && m.available !== false);
            if (match && Number(match.price) < lowestPrice) {
              lowestPrice = Number(match.price);
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
      }

      // Step 9: Resolve Authoritative Server-Side Pricing, Taxes, and Packaging Conversion
      let unitPrice = 0;
      let discountPercent = 0;
      let taxRate = 12;
      let cFactor = 1;
      let pUnit = 'Unit';
      let cUnit = 'Unit';
      let packSize = '';
      let brandName = '';
      let manufacturer = '';
      let itemCode = '';
      let genericName = '';
      let itemName = '';

      if (quotationDoc) {
        unitPrice = Number(quotationDoc.ratePerPurchasedUnit);
        discountPercent = Number(quotationDoc.discountPercent || 0);
        taxRate = Number(quotationDoc.gstPercent !== undefined ? quotationDoc.gstPercent : (itemDoc?.defaultGst ?? 12));
        cFactor = Number(quotationDoc.converterFactor || itemDoc?.converterFactor || 1);
        pUnit = quotationDoc.purchasedUnit || itemDoc?.purchasedUnit || 'Unit';
        cUnit = itemDoc?.consumptionUnit || 'Unit';
        packSize = quotationDoc.packSize || itemDoc?.packSizeDescription || '';
        brandName = quotationDoc.brandName || itemDoc?.brandName || '';
        manufacturer = itemDoc?.manufacturer || '';
        itemCode = quotationDoc.itemCode || itemDoc?.itemCode || '';
        genericName = quotationDoc.genericName || itemDoc?.genericName || '';
        itemName = genericName || itemDoc?.genericName || it.name || 'Medicine';
      } else if (itemDoc) {
        itemCode = itemDoc.itemCode;
        genericName = itemDoc.genericName;
        brandName = itemDoc.brandName;
        manufacturer = itemDoc.manufacturer || '';
        pUnit = itemDoc.purchasedUnit || 'Unit';
        cUnit = itemDoc.consumptionUnit || 'Unit';
        cFactor = itemDoc.converterFactor || 1;
        packSize = itemDoc.packSizeDescription || '';
        itemName = itemDoc.genericName;
        const medRate = (vObj.medicines || []).find(m => m.sku === itemDoc.itemCode.toUpperCase() && m.available !== false);
        unitPrice = medRate ? Number(medRate.price) : Number(it.price || 0);
        taxRate = medRate && medRate.gst !== undefined ? Number(medRate.gst) : (itemDoc.defaultGst || 12);
      } else {
        const medRate = (vObj.medicines || []).find(m => m.sku === it.sku.trim().toUpperCase() && m.available !== false);
        unitPrice = medRate ? Number(medRate.price) : Number(it.price || 0);
        taxRate = medRate && medRate.gst !== undefined ? Number(medRate.gst) : (Number(it.tax) || 12);
        itemName = it.name.trim();
        itemCode = it.sku.trim().toUpperCase();
        genericName = it.name.trim();
        pUnit = it.purchasedUnit || 'Unit';
        cUnit = it.consumptionUnit || 'Unit';
        cFactor = Number(it.converterFactor) > 0 ? Number(it.converterFactor) : 1;
        packSize = it.packSize || '';
      }

      if (unitPrice <= 0) {
        return res.status(400).json({ error: `Valid positive purchase price not found for '${itemName}' from vendor '${vObj.name}'` });
      }

      // Authoritative calculations (server cannot be tricked by frontend price tampering)
      const expConsQty = qty * cFactor;
      const lineSubtotal = qty * unitPrice;
      const lineDiscount = lineSubtotal * (discountPercent / 100);
      const taxableAmount = lineSubtotal - lineDiscount;
      const lineTax = (taxableAmount * taxRate) / 100;
      const lineTotal = taxableAmount + lineTax;

      grandSubtotal += lineSubtotal;
      grandTaxAmount += lineTax;
      grandTotal += lineTotal;

      // Step 10: Construct validated, canonical PO line item
      const sanitizedLine = {
        itemId: it.itemId || it._id || undefined,
        itemMasterId: itemDoc ? itemDoc._id : undefined,
        quotationId: quotationDoc ? quotationDoc._id : undefined,
        itemCode: itemCode || it.sku.trim().toUpperCase(),
        name: itemName,
        genericName: genericName || itemName,
        sku: itemCode || it.sku.trim().toUpperCase(),
        brandName,
        manufacturer,
        purchasedUnit: pUnit,
        packSize,
        converterFactor: cFactor,
        consumptionUnit: cUnit,
        requiredQty: qty,
        expectedConsumptionQty: expConsQty,
        price: unitPrice,
        discount: discountPercent,
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
