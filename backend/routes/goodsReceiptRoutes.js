const express = require('express');
const GoodsReceipt = require('../models/GoodsReceipt');
const Medicine = require('../models/Medicine');
const MedicineBatch = require('../models/MedicineBatch');
const PurchaseOrder = require('../models/PurchaseOrder');
const AuditLog = require('../models/AuditLog');
const { verifyToken } = require('../middleware/authMiddleware');
const router = express.Router();

router.use(verifyToken);

/**
 * Authoritative financial calculator for a single GRN item row
 */
function calculateItemFinancials(item) {
  const qtyReceived = Math.max(0, Number(item.qtyReceived) || 0);
  const rejectedQty = Math.max(0, Number(item.rejectedQty) || 0);
  const purchaseRate = Math.max(0, Number(item.purchaseRate !== undefined && item.purchaseRate !== null ? item.purchaseRate : (item.price || 0)));
  const discountPercent = Math.max(0, Math.min(100, Number(item.discountPercent) || 0));
  const gstRate = Math.max(0, Number(item.gst !== undefined && item.gst !== null ? item.gst : 12));

  const grossAmount = qtyReceived * purchaseRate;
  const discountAmount = Math.round((grossAmount * (discountPercent / 100)) * 100) / 100;
  const taxableAmount = Math.max(0, Math.round((grossAmount - discountAmount) * 100) / 100);
  const gstAmount = Math.round((taxableAmount * (gstRate / 100)) * 100) / 100;
  const netAmount = Math.round((taxableAmount + gstAmount) * 100) / 100;
  const buyPrice = qtyReceived > 0 ? Math.round((netAmount / qtyReceived) * 100) / 100 : 0;

  const qtyOrdered = Number(item.qtyOrdered !== undefined ? item.qtyOrdered : (item.orderedQty || 0));

  return {
    itemType: item.itemType || 'Medicine',
    itemCode: item.itemCode || item.sku || '',
    sku: item.sku,
    name: item.name,
    unit: item.unit || 'Strip',
    barcode: item.barcode || '',
    batchNumber: item.batchNumber || '',
    mfgDate: item.mfgDate ? new Date(item.mfgDate) : null,
    expiryDate: item.expiryDate ? new Date(item.expiryDate) : null,
    qtyOrdered,
    orderedQty: qtyOrdered,
    previouslyReceivedQty: Number(item.previouslyReceivedQty || 0),
    remainingQty: Number(item.remainingQty || 0),
    qtyReceived,
    rejectedQty,
    rejectionReason: item.rejectionReason || '',
    price: purchaseRate,
    purchaseRate,
    discountPercent,
    discountAmount,
    gst: gstRate,
    gstAmount,
    buyPrice,
    netAmount
  };
}

/**
 * Calculates cumulative quantities received across all non-draft GRNs for a given PO
 */
async function getPOCumulativeReceived(tenantId, poId, excludeGrnId = null) {
  const query = {
    tenantId,
    poId,
    status: { $in: ['Submitted', 'Verified/Completed'] }
  };
  if (excludeGrnId) {
    query._id = { $ne: excludeGrnId };
  }
  const priorGrns = await GoodsReceipt.find(query);
  const receivedMap = {};
  for (const grn of priorGrns) {
    for (const it of (grn.items || [])) {
      const key = it.sku;
      receivedMap[key] = (receivedMap[key] || 0) + (Number(it.qtyReceived) || 0);
    }
  }
  return receivedMap;
}

// Get all GRNs (scoped to tenant)
router.get('/', async (req, res) => {
  try {
    const grns = await GoodsReceipt.find({ tenantId: req.tenantId }).sort({ receivedDate: -1, createdAt: -1 });
    res.json(grns);
  } catch (error) {
    console.error("Get GRNs error:", error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get a single GRN by ID
router.get('/:id', async (req, res) => {
  try {
    const grn = await GoodsReceipt.findOne({
      tenantId: req.tenantId,
      $or: [{ _id: req.params.id }, { grnId: req.params.id }]
    });
    if (!grn) {
      return res.status(404).json({ error: 'GRN not found' });
    }
    res.json(grn);
  } catch (error) {
    console.error("Get single GRN error:", error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create a new GRN and update stock automatically (scoped to tenant)
router.post('/', async (req, res) => {
  const {
    grnId,
    grnLocation,
    poId,
    poNumber,
    poDate,
    vendorId,
    vendorName,
    items,
    invoiceNumber,
    invoiceDate,
    invoiceAmount,
    invoiceUrl,
    notes,
    status
  } = req.body;

  try {
    if (!grnId) {
      return res.status(400).json({ error: 'GRN ID is required' });
    }
    if (!vendorId || !vendorName) {
      return res.status(400).json({ error: 'Vendor is required' });
    }
    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'At least one item is required' });
    }

    // 1. Validate manufacturing and expiry dates
    const todayStr = new Date().toISOString().split('T')[0];
    for (const item of items) {
      if (item.mfgDate && String(item.mfgDate).substring(0, 10) > todayStr) {
        return res.status(400).json({ error: `Manufacturing date for ${item.name} cannot be in the future!` });
      }
      if (item.mfgDate && item.expiryDate) {
        const mfgStr = String(item.mfgDate).substring(0, 10);
        const expStr = String(item.expiryDate).substring(0, 10);
        if (expStr <= mfgStr) {
          return res.status(400).json({ error: `Expiry date for ${item.name} must be after manufacturing date!` });
        }
      }
    }

    const currentStatus = status || 'Verified/Completed';
    let poDoc = null;
    let cumulativePriorRecv = {};

    // 2. Validate PO-linked quantities cumulatively against PO order
    if (poId) {
      poDoc = await PurchaseOrder.findOne({ _id: poId, tenantId: req.tenantId });
      if (!poDoc) {
        return res.status(404).json({ error: 'Referenced Purchase Order not found' });
      }

      cumulativePriorRecv = await getPOCumulativeReceived(req.tenantId, poDoc._id);

      for (const item of items) {
        const poItem = (poDoc.items || []).find(pi => pi.sku === item.sku) || (poDoc.items || []).find(pi => pi.name === item.name);
        const qtyOrdered = poItem ? (Number(poItem.requiredQty) || Number(poItem.qty) || 0) : (Number(item.qtyOrdered) || 0);
        const previouslyReceived = cumulativePriorRecv[item.sku] || 0;
        const remaining = Math.max(0, qtyOrdered - previouslyReceived);
        const qtyReceived = Math.max(0, Number(item.qtyReceived) || 0);

        if (currentStatus !== 'Draft') {
          if (qtyReceived > remaining) {
            return res.status(400).json({
              error: `Received quantity (${qtyReceived}) exceeds remaining order quantity (${remaining}) for ${item.name}!`
            });
          }
        }

        // Attach calculated tracking quantities for persistence
        item.qtyOrdered = qtyOrdered;
        item.orderedQty = qtyOrdered;
        item.previouslyReceivedQty = previouslyReceived;
        item.remainingQty = Math.max(0, remaining - (currentStatus !== 'Draft' ? qtyReceived : 0));
      }
    }

    // 3. Process Authoritative Financials
    const processedItems = items.map(calculateItemFinancials);
    const totalDiscount = Math.round(processedItems.reduce((acc, it) => acc + (it.discountAmount || 0), 0) * 100) / 100;
    const totalGst = Math.round(processedItems.reduce((acc, it) => acc + (it.gstAmount || 0), 0) * 100) / 100;
    const grandTotal = Math.round(processedItems.reduce((acc, it) => acc + (it.netAmount || 0), 0) * 100) / 100;

    // 4. Create the GRN record
    const grn = await GoodsReceipt.create({
      tenantId: req.tenantId,
      grnId,
      receivedDate: new Date(),
      grnDate: new Date(),
      grnLocation: grnLocation || 'Main Pharmacy Store',
      poId: poId || null,
      poNumber: poNumber || (poDoc ? poDoc.poId : ''),
      poDate: poDate ? new Date(poDate) : (poDoc ? poDoc.createdAt : null),
      vendorId,
      vendorName,
      status: currentStatus,
      invoiceNumber: invoiceNumber || '',
      invoiceDate: invoiceDate ? new Date(invoiceDate) : null,
      invoiceAmount: Number(invoiceAmount) || 0,
      invoiceUrl: invoiceUrl || '',
      totalDiscount,
      totalGst,
      grandTotal,
      items: processedItems,
      notes: notes || '',
      receivedBy: req.user ? req.user.name : 'Pharmacy Staff'
    });

    // 5. Update PO status using cumulative receipts across all GRNs for that PO
    if (poDoc && currentStatus !== 'Draft') {
      const updatedCumulativeRecv = await getPOCumulativeReceived(req.tenantId, poDoc._id);
      let allFullyReceived = true;
      let anyReceived = false;

      for (const poItem of (poDoc.items || [])) {
        const totalRecv = updatedCumulativeRecv[poItem.sku] || 0;
        const required = Number(poItem.requiredQty) || Number(poItem.qty) || 0;

        if (totalRecv < required) {
          allFullyReceived = false;
        }
        if (totalRecv > 0) {
          anyReceived = true;
        }
      }

      if (allFullyReceived) {
        poDoc.status = 'Fully Received';
      } else if (anyReceived) {
        poDoc.status = 'Partially Received';
      }
      await poDoc.save();
    }

    // 6. Update inventory/stock & MedicineBatch (ONLY accepted qtyReceived enters stock, rejectedQty is excluded!)
    if (currentStatus === 'Verified/Completed') {
      for (const item of processedItems) {
        const acceptedQuantity = Number(item.qtyReceived) || 0;
        if (acceptedQuantity <= 0) continue;

        const cleanSku = String(item.sku || '').trim().toUpperCase();
        let medicine = await Medicine.findOne({
          tenantId: req.tenantId,
          $or: [
            { sku: item.sku },
            { sku: cleanSku },
            { sku: String(item.sku || '').trim().toLowerCase() }
          ]
        });

        if (!medicine && item.name) {
          medicine = await Medicine.findOne({
            tenantId: req.tenantId,
            name: new RegExp(`^${item.name.trim()}$`, 'i')
          });
        }
        
        let priorStock = 0;
        if (medicine) {
          priorStock = Number(medicine.stock) || 0;
          const newStock = priorStock + acceptedQuantity;
          medicine.stock = newStock;
          if (item.expiryDate) {
            medicine.expiry = new Date(item.expiryDate).toLocaleDateString('en-IN', { month: '2-digit', year: 'numeric' });
          }
          
          if (newStock === 0) {
            medicine.status = 'Out of Stock';
          } else if (newStock <= 20) {
            medicine.status = 'Low Stock';
          } else {
            medicine.status = 'In Stock';
          }
          await medicine.save();
        } else {
          let stockStatus = 'In Stock';
          if (acceptedQuantity === 0) {
            stockStatus = 'Out of Stock';
          } else if (acceptedQuantity <= 20) {
            stockStatus = 'Low Stock';
          }

          medicine = await Medicine.create({
            tenantId: req.tenantId,
            name: item.name,
            sku: item.sku,
            stock: acceptedQuantity,
            unit: item.unit || 'Strip',
            mrp: Number(item.purchaseRate || item.price || 0) * 1.25,
            category: item.itemType || 'General',
            status: stockStatus,
            expiry: item.expiryDate ? new Date(item.expiryDate).toLocaleDateString('en-IN', { month: '2-digit', year: 'numeric' }) : '--'
          });
        }

        // Check if there was existing unbatched legacy stock for this medicine
        const existingBatchesForMed = await MedicineBatch.find({
          tenantId: req.tenantId,
          $or: [
            { medicineId: medicine._id },
            { sku: cleanSku }
          ]
        });
        const totalBatchedPrior = existingBatchesForMed.reduce((sum, b) => sum + (Number(b.availableQuantity) || 0), 0);
        const unbatchedLegacyQty = priorStock - totalBatchedPrior;
        if (unbatchedLegacyQty > 0) {
          let legacyExp = null;
          if (medicine.expiry && medicine.expiry !== '--') {
            const parts = medicine.expiry.split('/');
            if (parts.length === 2) {
              legacyExp = new Date(parseInt(parts[1], 10), parseInt(parts[0], 10) - 1, 28);
            }
          }
          if (!legacyExp || isNaN(legacyExp.getTime())) {
            legacyExp = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);
          }

          await MedicineBatch.create({
            tenantId: req.tenantId,
            medicineId: medicine._id,
            sku: cleanSku,
            name: medicine.name,
            batchNumber: 'INITIAL-STOCK',
            mfgDate: null,
            expiryDate: legacyExp,
            receivedQuantity: unbatchedLegacyQty,
            availableQuantity: unbatchedLegacyQty,
            purchaseRate: Number(medicine.mrp ? medicine.mrp * 0.7 : 0),
            mrp: Number(medicine.mrp || 0),
            grnId: 'LEGACY-STOCK',
            vendorName: 'Existing Inventory',
            status: 'Active'
          });
        }

        // Phase 1 MedicineBatch integration for received item
        const cleanBatchNumber = String(item.batchNumber || '').trim().toUpperCase() || 'DEFAULT';

        let batchDoc = await MedicineBatch.findOne({
          tenantId: req.tenantId,
          sku: cleanSku,
          batchNumber: cleanBatchNumber
        });

        if (batchDoc) {
          batchDoc.receivedQuantity += acceptedQuantity;
          batchDoc.availableQuantity += acceptedQuantity;
          if (item.expiryDate) batchDoc.expiryDate = item.expiryDate;
          if (item.mfgDate) batchDoc.mfgDate = item.mfgDate;
          if (item.purchaseRate || item.price) batchDoc.purchaseRate = Number(item.purchaseRate || item.price);
          if (item.mrp) batchDoc.mrp = Number(item.mrp);
          batchDoc.status = batchDoc.availableQuantity > 0 ? 'Active' : 'Depleted';
          await batchDoc.save();
        } else {
          await MedicineBatch.create({
            tenantId: req.tenantId,
            medicineId: medicine._id,
            sku: cleanSku,
            name: item.name,
            batchNumber: cleanBatchNumber,
            mfgDate: item.mfgDate || null,
            expiryDate: item.expiryDate || null,
            receivedQuantity: acceptedQuantity,
            availableQuantity: acceptedQuantity,
            purchaseRate: Number(item.purchaseRate || item.price || 0),
            mrp: Number(item.mrp || (Number(item.purchaseRate || item.price || 0) * 1.25)),
            grnId: grn.grnId,
            vendorName: grn.vendorName,
            status: 'Active'
          });
        }
      }
    }

    // 7. Write Audit Log
    try {
      await AuditLog.create({
        tenantId: req.tenantId,
        actor: req.user?.staff_id || req.user?.id || 'system',
        actorName: req.user?.name || 'Pharmacy Staff',
        actorRole: req.user?.role || 'Pharmacy',
        action: 'goods_receipt_created',
        target: grn.grnId,
        metadata: {
          grnId: grn.grnId,
          poNumber: grn.poNumber || 'Direct Purchase',
          vendorName: grn.vendorName,
          grandTotal: grn.grandTotal,
          itemCount: grn.items.length,
          status: grn.status,
          totalRejected: processedItems.reduce((acc, it) => acc + (it.rejectedQty || 0), 0)
        }
      });
    } catch (auditErr) {
      console.warn("AuditLog creation error (non-fatal):", auditErr);
    }

    // 8. Broadcast real-time Socket.io events
    const io = req.app.get("io");
    if (io && req.tenantId) {
      io.to(req.tenantId).emit("data_changed", { type: "goods_receipts" });
      io.to(req.tenantId).emit("data_changed", { type: "medicines" });
      io.to(req.tenantId).emit("data_changed", { type: "purchase_orders" });
    }

    res.status(201).json(grn);
  } catch (error) {
    console.error("Create GRN error:", error);
    res.status(400).json({ error: error.message });
  }
});

// Update an existing GRN and update stock/PO variance (scoped to tenant)
router.put('/:id', async (req, res) => {
  const { id } = req.params;
  const {
    grnLocation,
    poId,
    poNumber,
    poDate,
    vendorId,
    vendorName,
    items,
    invoiceNumber,
    invoiceDate,
    invoiceAmount,
    invoiceUrl,
    notes,
    status
  } = req.body;

  try {
    const oldGrn = await GoodsReceipt.findOne({ tenantId: req.tenantId, $or: [{ _id: id }, { grnId: id }] });
    if (!oldGrn) {
      return res.status(404).json({ error: 'GRN not found' });
    }

    // Strict 24-Hour Edit Window Enforcement
    const createdAtTime = new Date(oldGrn.createdAt || oldGrn.receivedDate || Date.now()).getTime();
    const ageMs = Date.now() - createdAtTime;
    const MAX_EDIT_AGE_MS = 24 * 60 * 60 * 1000;
    if (ageMs > MAX_EDIT_AGE_MS) {
      return res.status(403).json({ error: 'GRN editing period has expired (24 hours from creation).' });
    }

    const currentStatus = status || oldGrn.status;
    const targetPoId = poId !== undefined ? poId : oldGrn.poId;
    let poDoc = null;
    let cumulativePriorRecv = {};

    // Validate manufacturing and expiry dates
    if (items && Array.isArray(items)) {
      const todayStr = new Date().toISOString().split('T')[0];
      for (const item of items) {
        if (item.mfgDate && String(item.mfgDate).substring(0, 10) > todayStr) {
          return res.status(400).json({ error: `Manufacturing date for ${item.name} cannot be in the future!` });
        }
        if (item.mfgDate && item.expiryDate) {
          const mfgStr = String(item.mfgDate).substring(0, 10);
          const expStr = String(item.expiryDate).substring(0, 10);
          if (expStr <= mfgStr) {
            return res.status(400).json({ error: `Expiry date for ${item.name} must be after manufacturing date!` });
          }
        }
      }
    }

    // Validate PO items if linked
    if (targetPoId) {
      poDoc = await PurchaseOrder.findOne({ _id: targetPoId, tenantId: req.tenantId });
      if (poDoc) {
        cumulativePriorRecv = await getPOCumulativeReceived(req.tenantId, poDoc._id, oldGrn._id);
        if (items) {
          for (const item of items) {
            const poItem = (poDoc.items || []).find(pi => pi.sku === item.sku) || (poDoc.items || []).find(pi => pi.name === item.name);
            const qtyOrdered = poItem ? (Number(poItem.requiredQty) || Number(poItem.qty) || 0) : (Number(item.qtyOrdered) || 0);
            const previouslyReceived = cumulativePriorRecv[item.sku] || 0;
            const remaining = Math.max(0, qtyOrdered - previouslyReceived);
            const qtyReceived = Math.max(0, Number(item.qtyReceived) || 0);

            if (currentStatus !== 'Draft') {
              if (qtyReceived > remaining) {
                return res.status(400).json({
                  error: `Received quantity (${qtyReceived}) exceeds remaining order quantity (${remaining}) for ${item.name}!`
                });
              }
            }

            item.qtyOrdered = qtyOrdered;
            item.orderedQty = qtyOrdered;
            item.previouslyReceivedQty = previouslyReceived;
            item.remainingQty = Math.max(0, remaining - (currentStatus !== 'Draft' ? qtyReceived : 0));
          }
        }
      }
    }

    // 1. If old status was verified/completed, revert old accepted stock additions
    if (oldGrn.status === 'Verified/Completed') {
      for (const item of oldGrn.items) {
        const quantity = Number(item.qtyReceived) || 0;
        if (quantity <= 0) continue;

        const medicine = await Medicine.findOne({ sku: item.sku, tenantId: req.tenantId });
        if (medicine) {
          medicine.stock = Math.max(0, medicine.stock - quantity);
          if (medicine.stock === 0) {
            medicine.status = 'Out of Stock';
          } else if (medicine.stock <= 20) {
            medicine.status = 'Low Stock';
          } else {
            medicine.status = 'In Stock';
          }
          await medicine.save();
        }

        // Revert from MedicineBatch
        const cleanBatchNumber = String(item.batchNumber || '').trim().toUpperCase() || 'DEFAULT';
        const cleanSku = String(item.sku).trim().toUpperCase();
        const batchDoc = await MedicineBatch.findOne({
          tenantId: req.tenantId,
          sku: cleanSku,
          batchNumber: cleanBatchNumber
        });
        if (batchDoc) {
          batchDoc.receivedQuantity = Math.max(0, batchDoc.receivedQuantity - quantity);
          batchDoc.availableQuantity = Math.max(0, batchDoc.availableQuantity - quantity);
          batchDoc.status = batchDoc.availableQuantity > 0 ? 'Active' : 'Depleted';
          await batchDoc.save();
        }
      }
    }

    // 2. Process Authoritative Financials on items
    const rawItems = items || oldGrn.items;
    const processedItems = rawItems.map(calculateItemFinancials);
    const totalDiscount = Math.round(processedItems.reduce((acc, it) => acc + (it.discountAmount || 0), 0) * 100) / 100;
    const totalGst = Math.round(processedItems.reduce((acc, it) => acc + (it.gstAmount || 0), 0) * 100) / 100;
    const grandTotal = Math.round(processedItems.reduce((acc, it) => acc + (it.netAmount || 0), 0) * 100) / 100;

    // 3. Update GRN details
    oldGrn.grnLocation = grnLocation || oldGrn.grnLocation || 'Main Pharmacy Store';
    oldGrn.poId = targetPoId || null;
    oldGrn.poNumber = poNumber !== undefined ? poNumber : oldGrn.poNumber;
    if (poDate) oldGrn.poDate = new Date(poDate);
    oldGrn.vendorId = vendorId || oldGrn.vendorId;
    oldGrn.vendorName = vendorName || oldGrn.vendorName;
    oldGrn.status = currentStatus;
    oldGrn.invoiceNumber = invoiceNumber !== undefined ? invoiceNumber : oldGrn.invoiceNumber;
    if (invoiceDate !== undefined) oldGrn.invoiceDate = invoiceDate ? new Date(invoiceDate) : null;
    if (invoiceAmount !== undefined) oldGrn.invoiceAmount = Number(invoiceAmount) || 0;
    oldGrn.invoiceUrl = invoiceUrl !== undefined ? invoiceUrl : oldGrn.invoiceUrl;
    oldGrn.notes = notes !== undefined ? notes : oldGrn.notes;
    oldGrn.totalDiscount = totalDiscount;
    oldGrn.totalGst = totalGst;
    oldGrn.grandTotal = grandTotal;
    oldGrn.items = processedItems;
    oldGrn.receivedDate = new Date();
    oldGrn.receivedBy = req.user ? req.user.name : oldGrn.receivedBy;

    const updatedGrn = await oldGrn.save();

    // 4. If new status is Verified/Completed, apply new accepted stock addition (rejectedQty excluded)
    if (updatedGrn.status === 'Verified/Completed') {
      for (const item of processedItems) {
        const acceptedQuantity = Number(item.qtyReceived) || 0;
        if (acceptedQuantity <= 0) continue;

        let medicine = await Medicine.findOne({ sku: item.sku, tenantId: req.tenantId });
        if (medicine) {
          const newStock = medicine.stock + acceptedQuantity;
          medicine.stock = newStock;
          if (item.expiryDate) {
            medicine.expiry = new Date(item.expiryDate).toLocaleDateString('en-IN', { month: '2-digit', year: 'numeric' });
          }
          if (newStock === 0) {
            medicine.status = 'Out of Stock';
          } else if (newStock <= 20) {
            medicine.status = 'Low Stock';
          } else {
            medicine.status = 'In Stock';
          }
          await medicine.save();
        } else {
          let stockStatus = 'In Stock';
          if (acceptedQuantity === 0) {
            stockStatus = 'Out of Stock';
          } else if (acceptedQuantity <= 20) {
            stockStatus = 'Low Stock';
          }

          medicine = await Medicine.create({
            tenantId: req.tenantId,
            name: item.name,
            sku: item.sku,
            stock: acceptedQuantity,
            unit: item.unit || 'Strip',
            mrp: Number(item.purchaseRate || item.price || 0) * 1.25,
            category: item.itemType || 'General',
            status: stockStatus,
            expiry: item.expiryDate ? new Date(item.expiryDate).toLocaleDateString('en-IN', { month: '2-digit', year: 'numeric' }) : '--'
          });
        }

        // Phase 1 MedicineBatch integration on edit
        const cleanBatchNumber = String(item.batchNumber || '').trim().toUpperCase() || 'DEFAULT';
        const cleanSku = String(item.sku).trim().toUpperCase();

        let batchDoc = await MedicineBatch.findOne({
          tenantId: req.tenantId,
          sku: cleanSku,
          batchNumber: cleanBatchNumber
        });

        if (batchDoc) {
          batchDoc.receivedQuantity += acceptedQuantity;
          batchDoc.availableQuantity += acceptedQuantity;
          if (item.expiryDate) batchDoc.expiryDate = item.expiryDate;
          if (item.mfgDate) batchDoc.mfgDate = item.mfgDate;
          if (item.purchaseRate || item.price) batchDoc.purchaseRate = Number(item.purchaseRate || item.price);
          if (item.mrp) batchDoc.mrp = Number(item.mrp);
          batchDoc.status = batchDoc.availableQuantity > 0 ? 'Active' : 'Depleted';
          await batchDoc.save();
        } else {
          await MedicineBatch.create({
            tenantId: req.tenantId,
            medicineId: medicine._id,
            sku: cleanSku,
            name: item.name,
            batchNumber: cleanBatchNumber,
            mfgDate: item.mfgDate || null,
            expiryDate: item.expiryDate || null,
            receivedQuantity: acceptedQuantity,
            availableQuantity: acceptedQuantity,
            purchaseRate: Number(item.purchaseRate || item.price || 0),
            mrp: Number(item.mrp || (Number(item.purchaseRate || item.price || 0) * 1.25)),
            grnId: updatedGrn.grnId,
            vendorName: updatedGrn.vendorName,
            status: 'Active'
          });
        }
      }
    }

    // 5. Re-evaluate PO status using cumulative receipts
    if (poDoc) {
      const updatedCumulativeRecv = await getPOCumulativeReceived(req.tenantId, poDoc._id);
      let allFullyReceived = true;
      let anyReceived = false;

      for (const poItem of (poDoc.items || [])) {
        const totalRecv = updatedCumulativeRecv[poItem.sku] || 0;
        const required = Number(poItem.requiredQty) || Number(poItem.qty) || 0;

        if (totalRecv < required) {
          allFullyReceived = false;
        }
        if (totalRecv > 0) {
          anyReceived = true;
        }
      }

      if (allFullyReceived) {
        poDoc.status = 'Fully Received';
      } else if (anyReceived) {
        poDoc.status = 'Partially Received';
      }
      await poDoc.save();
    }

    // 6. Audit Log
    try {
      await AuditLog.create({
        tenantId: req.tenantId,
        actor: req.user?.staff_id || req.user?.id || 'system',
        actorName: req.user?.name || 'Pharmacy Staff',
        actorRole: req.user?.role || 'Pharmacy',
        action: 'goods_receipt_updated',
        target: updatedGrn.grnId,
        metadata: {
          grnId: updatedGrn.grnId,
          poNumber: updatedGrn.poNumber || 'Direct Purchase',
          status: updatedGrn.status,
          previousGrandTotal: oldGrn.grandTotal,
          updatedGrandTotal: updatedGrn.grandTotal,
          previousItems: (oldGrn.items || []).map(it => ({ sku: it.sku, qtyReceived: it.qtyReceived, rejectedQty: it.rejectedQty })),
          updatedItems: processedItems.map(it => ({ sku: it.sku, qtyReceived: it.qtyReceived, rejectedQty: it.rejectedQty })),
          totalRejected: processedItems.reduce((acc, it) => acc + (it.rejectedQty || 0), 0)
        }
      });
    } catch (auditErr) {
      console.warn("AuditLog update error (non-fatal):", auditErr);
    }

    // 7. Socket.io broadcast
    const io = req.app.get("io");
    if (io && req.tenantId) {
      io.to(req.tenantId).emit("data_changed", { type: "goods_receipts" });
      io.to(req.tenantId).emit("data_changed", { type: "medicines" });
      io.to(req.tenantId).emit("data_changed", { type: "purchase_orders" });
    }

    res.json(updatedGrn);
  } catch (error) {
    console.error("Update GRN error:", error);
    res.status(400).json({ error: error.message });
  }
});

module.exports = router;


