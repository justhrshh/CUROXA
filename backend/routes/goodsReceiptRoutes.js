const express = require('express');
const mongoose = require('mongoose');
const GoodsReceipt = require('../models/GoodsReceipt');
const Medicine = require('../models/Medicine');
const MedicineBatch = require('../models/MedicineBatch');
const ItemMaster = require('../models/ItemMaster');
const PurchaseOrder = require('../models/PurchaseOrder');
const AuditLog = require('../models/AuditLog');
const { verifyToken } = require('../middleware/authMiddleware');
const router = express.Router();

router.use(verifyToken);

/**
 * Authoritative financial & packaging calculator for a single GRN item row
 * Separates physical received quantity vs rejected quantity.
 * Inventory conversion = acceptedPurchasedQty * converterFactor.
 */
function calculateItemFinancials(item) {
  const qtyReceived = Math.max(0, Number(item.qtyReceived) || 0);
  const rejectedQty = Math.max(0, Number(item.rejectedQty) || 0);
  const acceptedPurchasedQty = Math.max(0, qtyReceived - rejectedQty);
  const converterFactor = Number(item.converterFactor) > 0 ? Number(item.converterFactor) : 1;
  const convertedQuantity = acceptedPurchasedQty * converterFactor;

  const purchaseRate = Math.max(0, Number(item.purchaseRate !== undefined && item.purchaseRate !== null ? item.purchaseRate : (item.price || 0)));
  const discountPercent = Math.max(0, Math.min(100, Number(item.discountPercent) || 0));
  const gstRate = Math.max(0, Number(item.gst !== undefined && item.gst !== null ? item.gst : 12));

  // Invoice calculations are based on physical received goods
  const grossAmount = qtyReceived * purchaseRate;
  const discountAmount = Math.round((grossAmount * (discountPercent / 100)) * 100) / 100;
  const taxableAmount = Math.max(0, Math.round((grossAmount - discountAmount) * 100) / 100);
  const gstAmount = Math.round((taxableAmount * (gstRate / 100)) * 100) / 100;
  const netAmount = Math.round((taxableAmount + gstAmount) * 100) / 100;
  const buyPrice = qtyReceived > 0 ? Math.round((netAmount / qtyReceived) * 100) / 100 : 0;

  const qtyOrdered = Number(item.qtyOrdered !== undefined ? item.qtyOrdered : (item.orderedQty || 0));

  return {
    itemType: item.itemType || 'Medicine',
    itemMasterId: item.itemMasterId || null,
    itemCode: item.itemCode || item.sku || '',
    sku: item.sku,
    name: item.name,
    genericName: item.genericName || item.name || '',
    brandName: item.brandName || '',
    manufacturer: item.manufacturer || '',
    unit: item.unit || item.purchasedUnit || 'Strip',
    purchasedUnit: item.purchasedUnit || item.unit || 'Strip',
    packSize: item.packSize || '',
    converterFactor,
    consumptionUnit: item.consumptionUnit || 'Unit',
    qtyOrdered,
    orderedQty: qtyOrdered,
    previouslyReceivedQty: Number(item.previouslyReceivedQty || 0),
    remainingQty: Number(item.remainingQty || 0),
    qtyReceived,
    rejectedQty,
    rejectionReason: item.rejectionReason || '',
    acceptedPurchasedQty,
    convertedQuantity,
    convertedReceivedQty: convertedQuantity, // backward compatibility
    mrp: Number(item.mrp || 0),
    barcode: item.barcode || '',
    batchNumber: item.batchNumber || '',
    mfgDate: item.mfgDate ? new Date(item.mfgDate) : null,
    expiryDate: item.expiryDate ? new Date(item.expiryDate) : null,
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
 * Calculates cumulative ACCEPTED quantities received across all non-draft GRNs for a given PO
 * Note: Rejected units do not consume the remaining receivable PO quantity.
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
      const accepted = it.acceptedPurchasedQty !== undefined
        ? Number(it.acceptedPurchasedQty)
        : Math.max(0, (Number(it.qtyReceived) || 0) - (Number(it.rejectedQty) || 0));
      receivedMap[key] = (receivedMap[key] || 0) + accepted;
      if (it.itemCode && it.itemCode !== key) {
        receivedMap[it.itemCode] = (receivedMap[it.itemCode] || 0) + accepted;
      }
    }
  }
  return receivedMap;
}

// Get all GRNs (scoped to tenant)
router.get('/', async (req, res) => {
  try {
    const filter = { tenantId: req.tenantId };
    if (req.query.status) filter.status = req.query.status;
    if (req.query.vendorId) filter.vendorId = req.query.vendorId;
    if (req.query.poId) filter.poId = req.query.poId;

    const isPaginationRequested = req.query.page !== undefined || req.query.limit !== undefined || req.query.paginated === 'true';
    if (isPaginationRequested) {
      const page = Math.max(1, parseInt(req.query.page, 10) || 1);
      const limit = Math.max(1, Math.min(100, parseInt(req.query.limit, 10) || 20));
      const skip = (page - 1) * limit;

      const [total, grns] = await Promise.all([
        GoodsReceipt.countDocuments(filter),
        GoodsReceipt.find(filter).sort({ receivedDate: -1, createdAt: -1 }).skip(skip).limit(limit)
      ]);

      return res.json({
        data: grns,
        pagination: {
          total,
          page,
          limit,
          pages: Math.ceil(total / limit)
        }
      });
    }

    const grns = await GoodsReceipt.find(filter).sort({ receivedDate: -1, createdAt: -1 });
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

    const currentStatus = status || 'Verified/Completed';
    const todayStr = new Date().toISOString().split('T')[0];

    // 1. Validate Item Master, Expiry Cutoff, and Dates
    for (let idx = 0; idx < items.length; idx++) {
      const item = items[idx];

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

      let itemMaster = null;

      if (item.itemMasterId) {
        // Step 1: Verify Item Master exists (hospital-scoped or global catalog)
        itemMaster = await ItemMaster.findOne({
          _id: item.itemMasterId,
          $or: [{ tenantId: req.tenantId }, { scope: 'GLOBAL' }]
        });
        if (!itemMaster) {
          return res.status(400).json({ error: `Item Master not found or belongs to another hospital for line #${idx + 1}` });
        }

        // Step 2: Verify Item Master is Active
        if (itemMaster.status !== 'Active') {
          return res.status(400).json({ error: `Item Master '${itemMaster.brandName || itemMaster.genericName}' (${itemMaster.itemCode}) is Inactive and cannot be received` });
        }

        // Step 3: Enforce packaging consistency (converterFactor, purchasedUnit, consumptionUnit)
        if (item.converterFactor && Math.abs(Number(item.converterFactor) - itemMaster.converterFactor) > 0.001) {
          return res.status(400).json({
            error: `Converter factor mismatch for '${item.name}': received ${item.converterFactor}, canonical is ${itemMaster.converterFactor}`
          });
        }

        item.converterFactor = itemMaster.converterFactor;
        item.purchasedUnit = itemMaster.purchasedUnit;
        item.consumptionUnit = itemMaster.consumptionUnit;
        item.packSize = item.packSize || itemMaster.packSizeDescription || '';
        item.brandName = item.brandName || itemMaster.brandName || '';
        item.manufacturer = itemMaster.manufacturer || item.manufacturer || '';
        item.itemCode = itemMaster.itemCode;
        item.genericName = itemMaster.genericName;
      } else {
        // Legacy fallback: check if SKU exists in canonical Item Master catalog (tenant or global)
        const cleanSku = String(item.sku || '').trim().toUpperCase();
        itemMaster = await ItemMaster.findOne({
          $or: [{ tenantId: req.tenantId }, { scope: 'GLOBAL' }],
          itemCode: cleanSku
        });

        if (itemMaster) {
          if (itemMaster.status !== 'Active') {
            return res.status(400).json({ error: `Item Master '${itemMaster.brandName || itemMaster.genericName}' (${itemMaster.itemCode}) is Inactive and cannot be received` });
          }
          item.itemMasterId = itemMaster._id;
          item.converterFactor = itemMaster.converterFactor;
          item.purchasedUnit = itemMaster.purchasedUnit;
          item.consumptionUnit = itemMaster.consumptionUnit;
          item.itemCode = itemMaster.itemCode;
          item.genericName = itemMaster.genericName;
          item.brandName = item.brandName || itemMaster.brandName || '';
          item.manufacturer = itemMaster.manufacturer || item.manufacturer || '';
        } else {
          // Check if existing medicine exists in legacy inventory
          const existingMed = await Medicine.findOne({ tenantId: req.tenantId, sku: item.sku });
          if (!existingMed) {
            // UNKNOWN ITEM REJECTION: Do NOT allow unknown uncataloged items to automatically create stock
            return res.status(400).json({
              error: `Unknown item '${item.name}' (SKU: ${item.sku}) is not registered in the Item Master catalog. Unregistered items cannot be received.`
            });
          }
        }
      }

      // Step 4: Shelf Life Cutoff Validation from Item Master
      if (itemMaster && currentStatus !== 'Draft') {
        if (itemMaster.isExpirable) {
          if (!item.expiryDate) {
            return res.status(400).json({ error: `Expiry date is required for expirable item '${item.name}'` });
          }
          const expTime = new Date(item.expiryDate).getTime();
          if (expTime < Date.now()) {
            return res.status(400).json({ error: `Item '${item.name}' has already expired!` });
          }
          if (itemMaster.expiryCutoffDays > 0) {
            const cutoffTime = Date.now() + (itemMaster.expiryCutoffDays * 24 * 60 * 60 * 1000);
            if (expTime < cutoffTime) {
              return res.status(400).json({
                error: `Item '${item.name}' does not meet shelf life requirement: must have at least ${itemMaster.expiryCutoffDays} days remaining before expiry.`
              });
            }
          }
        }
      }
    }

    // 2. Validate PO-linked quantities cumulatively against PO order
    let poDoc = null;
    let cumulativePriorRecv = {};

    if (poId) {
      poDoc = await PurchaseOrder.findOne({ _id: poId, tenantId: req.tenantId });
      if (!poDoc) {
        return res.status(404).json({ error: 'Referenced Purchase Order not found' });
      }

      cumulativePriorRecv = await getPOCumulativeReceived(req.tenantId, poDoc._id);

      for (const item of items) {
        const poItem = (poDoc.items || []).find(pi => 
          pi.sku === item.sku || 
          pi.itemCode === item.sku ||
          (item.itemMasterId && pi.itemMasterId && String(pi.itemMasterId) === String(item.itemMasterId))
        ) || (poDoc.items || []).find(pi => pi.name === item.name);

        const qtyOrdered = poItem ? (Number(poItem.requiredQty) || Number(poItem.qty) || 0) : (Number(item.qtyOrdered) || 0);
        const previouslyReceived = cumulativePriorRecv[item.sku] || (poItem?.itemCode ? cumulativePriorRecv[poItem.itemCode] : 0) || 0;
        const remaining = Math.max(0, qtyOrdered - previouslyReceived);

        const qtyReceived = Math.max(0, Number(item.qtyReceived) || 0);
        const rejectedQty = Math.max(0, Number(item.rejectedQty) || 0);
        const acceptedPurchasedQty = Math.max(0, qtyReceived - rejectedQty);

        if (currentStatus !== 'Draft') {
          if (acceptedPurchasedQty > remaining) {
            return res.status(400).json({
              error: `Accepted quantity (${acceptedPurchasedQty}) exceeds remaining order quantity (${remaining}) for ${item.name}!`
            });
          }
        }

        // Attach calculated tracking quantities for persistence
        item.qtyOrdered = qtyOrdered;
        item.orderedQty = qtyOrdered;
        item.previouslyReceivedQty = previouslyReceived;
        item.acceptedPurchasedQty = acceptedPurchasedQty;
        item.remainingQty = Math.max(0, remaining - (currentStatus !== 'Draft' ? acceptedPurchasedQty : 0));
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
      inventoryPosted: false,
      inventoryPostedAt: null,
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

    // 5. Update inventory/stock & MedicineBatch (ONLY accepted quantity converted to consumption units)
    if (currentStatus === 'Verified/Completed') {
      let session = null;
      let useTransaction = false;
      try {
        session = await mongoose.startSession();
        session.startTransaction();
        useTransaction = true;
      } catch (sessionErr) {
        session = null;
        useTransaction = false;
      }
      const sessionOpt = useTransaction && session ? { session } : {};

      try {
        for (const item of processedItems) {
          const acceptedPurchased = Number(item.acceptedPurchasedQty) || 0;
          if (acceptedPurchased <= 0) continue;

          const converter = Number(item.converterFactor) > 0 ? Number(item.converterFactor) : 1;
          const convertedQuantity = acceptedPurchased * converter;
          const cleanSku = String(item.sku || '').trim().toUpperCase();
          const cleanBatchNumber = String(item.batchNumber || '').trim().toUpperCase() || 'DEFAULT';

          // A. Atomic update on MedicineBatch ($inc)
          const batchFilter = {
            tenantId: req.tenantId,
            sku: cleanSku,
            batchNumber: cleanBatchNumber
          };
          if (item.itemMasterId) {
            batchFilter.itemMasterId = item.itemMasterId;
          }

          let batchDoc = await MedicineBatch.findOneAndUpdate(
            batchFilter,
            {
              $inc: {
                availableQuantity: convertedQuantity,
                receivedQuantity: convertedQuantity
              },
              $set: {
                status: 'Active',
                expiryDate: item.expiryDate || null,
                mfgDate: item.mfgDate || null,
                brandName: item.brandName || '',
                manufacturer: item.manufacturer || '',
                consumptionUnit: item.consumptionUnit || 'Unit',
                grnId: grn.grnId,
                vendorName: grn.vendorName,
                purchaseRate: Number(item.purchaseRate || item.price || 0),
                mrp: Number(item.mrp || 0)
              }
            },
            { returnDocument: 'after', ...sessionOpt }
          );

          if (!batchDoc) {
            const newBatch = await MedicineBatch.create([{
              tenantId: req.tenantId,
              itemMasterId: item.itemMasterId || null,
              sku: cleanSku,
              name: item.name,
              brandName: item.brandName || '',
              manufacturer: item.manufacturer || '',
              storageTemperature: 'Normal',
              consumptionUnit: item.consumptionUnit || 'Unit',
              batchNumber: cleanBatchNumber,
              mfgDate: item.mfgDate || null,
              expiryDate: item.expiryDate || null,
              receivedQuantity: convertedQuantity,
              availableQuantity: convertedQuantity,
              purchaseRate: Number(item.purchaseRate || item.price || 0),
              mrp: Number(item.mrp || 0),
              grnId: grn.grnId,
              vendorName: grn.vendorName,
              status: 'Active'
            }], sessionOpt);
            batchDoc = newBatch[0];
          }

          // B. Atomic update on Medicine aggregate stock ($inc)
          let medicine = await Medicine.findOneAndUpdate(
            { tenantId: req.tenantId, sku: cleanSku },
            {
              $inc: { stock: convertedQuantity },
              $set: {
                expiry: item.expiryDate ? new Date(item.expiryDate).toLocaleDateString('en-IN', { month: '2-digit', year: 'numeric' }) : '--'
              }
            },
            { returnDocument: 'after', ...sessionOpt }
          );

          if (medicine) {
            const newStock = medicine.stock;
            const stockStatus = newStock === 0 ? 'Out of Stock' : (newStock <= 20 ? 'Low Stock' : 'In Stock');
            await Medicine.updateOne({ _id: medicine._id }, { $set: { status: stockStatus } }, sessionOpt);
            if (batchDoc && !batchDoc.medicineId) {
              await MedicineBatch.updateOne({ _id: batchDoc._id }, { $set: { medicineId: medicine._id } }, sessionOpt);
            }
          } else {
            // Anchor aggregate record for canonical Item Master items
            const stockStatus = convertedQuantity === 0 ? 'Out of Stock' : (convertedQuantity <= 20 ? 'Low Stock' : 'In Stock');
            const createdMed = await Medicine.create([{
              tenantId: req.tenantId,
              name: item.name,
              sku: cleanSku,
              stock: convertedQuantity,
              unit: item.consumptionUnit || 'Unit',
              mrp: Number(item.mrp || (Number(item.purchaseRate || 0) * 1.25)),
              category: item.itemType || 'Medicine',
              status: stockStatus,
              expiry: item.expiryDate ? new Date(item.expiryDate).toLocaleDateString('en-IN', { month: '2-digit', year: 'numeric' }) : '--'
            }], sessionOpt);

            if (batchDoc && !batchDoc.medicineId) {
              await MedicineBatch.updateOne({ _id: batchDoc._id }, { $set: { medicineId: createdMed[0]._id } }, sessionOpt);
            }
          }
        }

        // C. Mark GRN as inventoryPosted (Idempotency protection)
        grn.inventoryPosted = true;
        grn.inventoryPostedAt = new Date();
        await grn.save(sessionOpt);

        if (useTransaction && session) {
          await session.commitTransaction();
          session.endSession();
        }
      } catch (mutationErr) {
        if (useTransaction && session) {
          await session.abortTransaction();
          session.endSession();
        }
        throw mutationErr;
      }
    }

    // 6. Update PO status using cumulative receipts across all GRNs for that PO
    if (poDoc && currentStatus !== 'Draft') {
      const updatedCumulativeRecv = await getPOCumulativeReceived(req.tenantId, poDoc._id);
      let allFullyReceived = true;
      let anyReceived = false;

      for (const poItem of (poDoc.items || [])) {
        const totalRecv = updatedCumulativeRecv[poItem.sku] || (poItem.itemCode ? updatedCumulativeRecv[poItem.itemCode] : 0) || 0;
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

      // If child PO, synchronize parent Master PO
      if (poDoc.parentPOId) {
        const allChildren = await PurchaseOrder.find({ parentPOId: poDoc.parentPOId, tenantId: req.tenantId });
        const parentPO = await PurchaseOrder.findOne({ poId: poDoc.parentPOId, tenantId: req.tenantId });
        if (parentPO) {
          const allFully = allChildren.every(c => (c._id.toString() === poDoc._id.toString() ? poDoc.status : c.status) === 'Fully Received');
          const anyRec = allChildren.some(c => ['Partially Received', 'Fully Received'].includes(c._id.toString() === poDoc._id.toString() ? poDoc.status : c.status));
          if (allFully) {
            parentPO.status = 'Fully Received';
          } else if (anyRec) {
            parentPO.status = 'Partially Received';
          }
          if (Array.isArray(parentPO.vendorOrders)) {
            parentPO.vendorOrders.forEach(vo => {
              if (vo.poId === poDoc.poId) vo.status = poDoc.status;
            });
          }
          await parentPO.save();
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
        action: currentStatus === 'Verified/Completed' ? 'goods_receipt_inventory_posted' : 'goods_receipt_created',
        target: grn.grnId,
        metadata: {
          grnId: grn.grnId,
          poNumber: grn.poNumber || 'Direct Purchase',
          vendorName: grn.vendorName,
          grandTotal: grn.grandTotal,
          itemCount: grn.items.length,
          status: grn.status,
          totalAcceptedPurchased: processedItems.reduce((acc, it) => acc + (it.acceptedPurchasedQty || 0), 0),
          totalRejectedPurchased: processedItems.reduce((acc, it) => acc + (it.rejectedQty || 0), 0),
          totalConvertedConsumptionQty: processedItems.reduce((acc, it) => acc + (it.convertedQuantity || 0), 0)
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

// Update an existing GRN and update stock/PO variance using exact delta logic (scoped to tenant)
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
    const todayStr = new Date().toISOString().split('T')[0];

    // Validate manufacturing and expiry dates
    if (items && Array.isArray(items)) {
      for (let idx = 0; idx < items.length; idx++) {
        const item = items[idx];
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

        // Validate Item Master if present (tenant or global catalog)
        if (item.itemMasterId) {
          const im = await ItemMaster.findOne({
            _id: item.itemMasterId,
            $or: [{ tenantId: req.tenantId }, { scope: 'GLOBAL' }]
          });
          if (!im) {
            return res.status(400).json({ error: `Item Master not found or belongs to another hospital for line #${idx + 1}` });
          }
          if (im.status !== 'Active') {
            return res.status(400).json({ error: `Item Master '${im.brandName || im.genericName}' (${im.itemCode}) is Inactive and cannot be received` });
          }
          item.converterFactor = im.converterFactor;
          item.purchasedUnit = im.purchasedUnit;
          item.consumptionUnit = im.consumptionUnit;
        }
      }
    }

    // Validate PO items if linked
    let poDoc = null;
    let cumulativePriorRecv = {};
    if (targetPoId) {
      poDoc = await PurchaseOrder.findOne({ _id: targetPoId, tenantId: req.tenantId });
      if (poDoc) {
        cumulativePriorRecv = await getPOCumulativeReceived(req.tenantId, poDoc._id, oldGrn._id);
        if (items) {
          for (const item of items) {
            const poItem = (poDoc.items || []).find(pi => 
              pi.sku === item.sku || 
              pi.itemCode === item.sku ||
              (item.itemMasterId && pi.itemMasterId && String(pi.itemMasterId) === String(item.itemMasterId))
            ) || (poDoc.items || []).find(pi => pi.name === item.name);

            const qtyOrdered = poItem ? (Number(poItem.requiredQty) || Number(poItem.qty) || 0) : (Number(item.qtyOrdered) || 0);
            const previouslyReceived = cumulativePriorRecv[item.sku] || 0;
            const remaining = Math.max(0, qtyOrdered - previouslyReceived);
            const curAccepted = Math.max(0, (Number(item.qtyReceived) || 0) - (Number(item.rejectedQty) || 0));

            if (currentStatus !== 'Draft') {
              if (curAccepted > remaining) {
                return res.status(400).json({
                  error: `Accepted quantity (${curAccepted}) exceeds remaining order quantity (${remaining}) for ${item.name}!`
                });
              }
            }

            item.qtyOrdered = qtyOrdered;
            item.orderedQty = qtyOrdered;
            item.previouslyReceivedQty = previouslyReceived;
            item.acceptedPurchasedQty = curAccepted;
            item.remainingQty = Math.max(0, remaining - (currentStatus !== 'Draft' ? curAccepted : 0));
          }
        }
      }
    }

    // Process Authoritative Financials
    const rawItems = items || oldGrn.items;
    const processedItems = rawItems.map(calculateItemFinancials);
    const totalDiscount = Math.round(processedItems.reduce((acc, it) => acc + (it.discountAmount || 0), 0) * 100) / 100;
    const totalGst = Math.round(processedItems.reduce((acc, it) => acc + (it.gstAmount || 0), 0) * 100) / 100;
    const grandTotal = Math.round(processedItems.reduce((acc, it) => acc + (it.netAmount || 0), 0) * 100) / 100;

    // Delta-Based Inventory Reconciliation
    // Maps each SKU/Item to old accepted converted qty vs new accepted converted qty
    const oldQtyMap = {};
    if (oldGrn.inventoryPosted || oldGrn.status === 'Verified/Completed') {
      for (const it of (oldGrn.items || [])) {
        const factor = Number(it.converterFactor) > 0 ? Number(it.converterFactor) : 1;
        const accepted = it.acceptedPurchasedQty !== undefined
          ? Number(it.acceptedPurchasedQty)
          : Math.max(0, (Number(it.qtyReceived) || 0) - (Number(it.rejectedQty) || 0));
        const conv = it.convertedQuantity !== undefined ? Number(it.convertedQuantity) : (accepted * factor);
        const key = String(it.sku).trim().toUpperCase();
        oldQtyMap[key] = (oldQtyMap[key] || 0) + conv;
      }
    }

    const newQtyMap = {};
    if (currentStatus === 'Verified/Completed') {
      for (const it of processedItems) {
        const conv = Number(it.convertedQuantity) || 0;
        const key = String(it.sku).trim().toUpperCase();
        newQtyMap[key] = (newQtyMap[key] || 0) + conv;
      }
    }

    // Calculate union of SKUs involved in inventory delta
    const allSkus = new Set([...Object.keys(oldQtyMap), ...Object.keys(newQtyMap)]);
    for (const sku of allSkus) {
      const oldVal = oldQtyMap[sku] || 0;
      const newVal = newQtyMap[sku] || 0;
      const delta = newVal - oldVal;

      if (delta !== 0) {
        // Atomic update on Medicine aggregate stock
        await Medicine.findOneAndUpdate(
          { tenantId: req.tenantId, sku },
          { $inc: { stock: delta } }
        );

        // Atomic update on MedicineBatch
        // Find matching item in processedItems or oldGrn.items
        const matchedItem = processedItems.find(it => String(it.sku).trim().toUpperCase() === sku) ||
          oldGrn.items.find(it => String(it.sku).trim().toUpperCase() === sku);
        const batchNum = String(matchedItem?.batchNumber || '').trim().toUpperCase() || 'DEFAULT';

        await MedicineBatch.findOneAndUpdate(
          { tenantId: req.tenantId, sku, batchNumber: batchNum },
          { $inc: { availableQuantity: delta, receivedQuantity: delta } }
        );
      }
    }

    // Update GRN details
    oldGrn.grnLocation = grnLocation || oldGrn.grnLocation || 'Main Pharmacy Store';
    oldGrn.poId = targetPoId || null;
    oldGrn.poNumber = poNumber !== undefined ? poNumber : oldGrn.poNumber;
    if (poDate) oldGrn.poDate = new Date(poDate);
    oldGrn.vendorId = vendorId || oldGrn.vendorId;
    oldGrn.vendorName = vendorName || oldGrn.vendorName;
    oldGrn.status = currentStatus;
    oldGrn.inventoryPosted = currentStatus === 'Verified/Completed';
    oldGrn.inventoryPostedAt = currentStatus === 'Verified/Completed' ? (oldGrn.inventoryPostedAt || new Date()) : null;
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

    // Re-evaluate PO status using cumulative receipts
    if (poDoc) {
      const updatedCumulativeRecv = await getPOCumulativeReceived(req.tenantId, poDoc._id);
      let allFullyReceived = true;
      let anyReceived = false;

      for (const poItem of (poDoc.items || [])) {
        const totalRecv = updatedCumulativeRecv[poItem.sku] || (poItem.itemCode ? updatedCumulativeRecv[poItem.itemCode] : 0) || 0;
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

      if (poDoc.parentPOId) {
        const allChildren = await PurchaseOrder.find({ parentPOId: poDoc.parentPOId, tenantId: req.tenantId });
        const parentPO = await PurchaseOrder.findOne({ poId: poDoc.parentPOId, tenantId: req.tenantId });
        if (parentPO) {
          const allFully = allChildren.every(c => (c._id.toString() === poDoc._id.toString() ? poDoc.status : c.status) === 'Fully Received');
          const anyRec = allChildren.some(c => ['Partially Received', 'Fully Received'].includes(c._id.toString() === poDoc._id.toString() ? poDoc.status : c.status));
          if (allFully) {
            parentPO.status = 'Fully Received';
          } else if (anyRec) {
            parentPO.status = 'Partially Received';
          }
          if (Array.isArray(parentPO.vendorOrders)) {
            parentPO.vendorOrders.forEach(vo => {
              if (vo.poId === poDoc.poId) vo.status = poDoc.status;
            });
          }
          await parentPO.save();
        }
      }
    }

    // Write Audit Log
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
          totalAcceptedPurchased: processedItems.reduce((acc, it) => acc + (it.acceptedPurchasedQty || 0), 0),
          totalRejectedPurchased: processedItems.reduce((acc, it) => acc + (it.rejectedQty || 0), 0)
        }
      });
    } catch (auditErr) {
      console.warn("AuditLog update error (non-fatal):", auditErr);
    }

    // Socket.io broadcast
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
