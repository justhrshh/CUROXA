const express = require('express');
const Approval = require('../models/Approval');
const AuditLog = require('../models/AuditLog');
const Indent = require('../models/Indent');
const Vendor = require('../models/Vendor');
const Medicine = require('../models/Medicine');
const PurchaseOrder = require('../models/PurchaseOrder');
const { verifyToken, isAdmin } = require('../middleware/authMiddleware');
const tenantMiddleware = require('../middleware/tenantMiddleware');
const router = express.Router();

// GET /api/approvals — list approvals for current tenant
// Query params: status (pending|approved|denied), type, limit
router.get('/', verifyToken, tenantMiddleware, async (req, res) => {
  try {
    const filter = { tenantId: req.tenantId };
    if (req.query.status) filter.status = req.query.status;
    if (req.query.type) filter.type = req.query.type;
    const limit = Math.min(parseInt(req.query.limit, 10) || 100, 500);
    const approvals = await Approval.find(filter)
      .sort({ requestedAt: -1 })
      .limit(limit)
      .lean();

    // Enrich indent approvals with live items from Indent model so Admin always sees accurate approvedQty
    const Indent = require('../models/Indent');
    const indentApprovals = approvals.filter(a => (a.type === 'receptionist_indent' || a.type === 'Indent' || a.type === 'indent') && a.details?.indentId);
    if (indentApprovals.length > 0) {
      const indentIds = indentApprovals.map(a => a.details.indentId);
      const indents = await Indent.find({ _id: { $in: indentIds }, tenantId: req.tenantId }).lean();
      const indentMap = new Map(indents.map(i => [String(i._id), i]));
      for (const a of indentApprovals) {
        const matchingIndent = indentMap.get(String(a.details.indentId));
        if (matchingIndent && Array.isArray(matchingIndent.items) && matchingIndent.items.length > 0) {
          a.details.items = matchingIndent.items;
        }
      }
    }

    res.json(approvals);
  } catch (err) {
    console.error("Approvals error:", err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/approvals — create a new approval request (any authenticated user)
router.post('/', verifyToken, tenantMiddleware, async (req, res) => {
  try {
    const { type, staffId, requesterName, requesterRole, details, comment } = req.body;
    if (!type || !staffId || !requesterName) {
      return res.status(400).json({ error: 'type, staffId, and requesterName are required' });
    }
    const approval = await Approval.create({
      tenantId: req.tenantId,
      type,
      staffId,
      requesterName,
      requesterRole: requesterRole || req.user.role || '',
      details: details || {},
      comment: comment || ''
    });
    // Audit trail
    const auditMeta = { type, comment };
    if (type === 'vendor_medicine_addition') {
      auditMeta.vendor = details?.vendorName || details?.vendorCode || details?.vendorId;
      auditMeta.vendorId = details?.vendorId;
      auditMeta.medicine = details?.medicine?.name || details?.name;
      auditMeta.sku = details?.medicine?.sku || details?.sku;
      auditMeta.price = details?.medicine?.price !== undefined ? details?.medicine?.price : details?.price;
      auditMeta.gst = details?.medicine?.gst !== undefined ? details?.medicine?.gst : details?.gst;
    }
    await AuditLog.create({
      tenantId: req.tenantId,
      actor: staffId,
      actorName: requesterName,
      actorRole: requesterRole || req.user.role || '',
      action: type === 'vendor_medicine_addition' ? 'vendor_medicine_approval_requested' : 'approval_requested',
      target: approval._id.toString(),
      metadata: auditMeta
    });
    const io = req.app.get("io");
    if (io && req.tenantId) {
      io.to(req.tenantId).emit("data_changed", { type: "approvals" });
      if (type === 'vendor_medicine_addition' || type === 'vendor_onboarding' || type === 'item_price_update') {
        io.to(req.tenantId).emit("data_changed", { type: "vendors" });
      }
      if (type === 'receptionist_indent' || type === 'Indent' || type === 'indent') {
        io.to(req.tenantId).emit("data_changed", { type: "indents" });
      }
    }
    res.status(201).json(approval);
  } catch (err) {
    console.error("Approvals error:", err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PATCH /api/approvals/:id — approve or deny (admin only)
router.patch('/:id', verifyToken, isAdmin, tenantMiddleware, async (req, res) => {
  let session = null;
  let useTransaction = false;
  try {
    let { status, comment, approvedItems } = req.body;
    if (!['approved', 'denied'].includes(status)) {
      return res.status(400).json({ error: 'status must be approved or denied' });
    }

    const approval = await Approval.findOne({ _id: req.params.id, tenantId: req.tenantId });
    if (!approval) return res.status(404).json({ error: 'Approval not found' });

    // Validate receptionist_indent before making any changes
    let indentToUpdate = null;
    const isIndentType = (approval.type === 'receptionist_indent' || approval.type === 'Indent' || approval.type === 'indent');
    if (isIndentType) {
      const Indent = require('../models/Indent');
      const indentId = approval.details && approval.details.indentId;
      if (indentId) {
        indentToUpdate = await Indent.findOne({ _id: indentId, tenantId: req.tenantId });
        if (!indentToUpdate) {
          return res.status(404).json({ error: 'Associated Indent not found' });
        }

        if (status === 'approved') {
          const requestedItems = indentToUpdate.items || [];

          // If admin explicitly sent approvedItems, validate each entry.
          // If not sent at all (e.g. old frontend), auto-approve each item at its requiredQty.
          if (Array.isArray(approvedItems) && approvedItems.length > 0) {
            // Validate each explicitly provided approved qty
            for (let idx = 0; idx < requestedItems.length; idx++) {
              const reqItem = requestedItems[idx];
              const approvedEntry = approvedItems.find(
                it => (it.itemId && reqItem._id && String(it.itemId) === String(reqItem._id)) ||
                      (it.name && reqItem.name && reqItem.name.trim().toLowerCase() === it.name.trim().toLowerCase()) ||
                      (approvedItems.length === requestedItems.length && approvedItems[idx])
              );

              if (!approvedEntry) {
                return res.status(400).json({
                  error: `Missing approved quantity for requested item '${reqItem.name}'.`
                });
              }

              const raw = approvedEntry.approvedQty;
              if (raw === undefined || raw === null || (typeof raw === 'string' && raw.trim() === '') || typeof raw === 'boolean') {
                return res.status(400).json({
                  error: `Approved quantity is required for item '${reqItem.name}'`
                });
              }
              const val = Number(raw);
              if (!Number.isFinite(val) || isNaN(val) || val < 0) {
                return res.status(400).json({
                  error: `Approved quantity must be a valid non-negative number for item '${reqItem.name}'`
                });
              }
              if (val > reqItem.requiredQty) {
                return res.status(400).json({
                  error: `Approved quantity (${val}) cannot exceed requested quantity (${reqItem.requiredQty}) for item '${reqItem.name}'`
                });
              }
            }
          } else {
            // approvedItems not provided — auto-approve each item at its full requiredQty
            approvedItems = requestedItems.map(item => ({
              itemId: item._id,
              name: item.name,
              approvedQty: Number(item.requiredQty) || 0
            }));
          }
        }
      }
    }

    // Start MongoDB session and transaction for atomic persistence
    const mongoose = require('mongoose');
    try {
      session = await mongoose.startSession();
      session.startTransaction();
      useTransaction = true;
    } catch (sessionErr) {
      session = null;
      useTransaction = false;
    }

    const sessionOpt = useTransaction && session ? { session } : {};

    // Side effects based on type and status
    if (status === 'approved') {
      if (indentToUpdate) {
        indentToUpdate.status = 'Approved';
        const plainItems = (indentToUpdate.items || []).map((item, idx) => {
          const itemObj = item.toObject ? item.toObject() : { ...item };
          const matched = (approvedItems || []).find(
            it => (it.itemId && item._id && String(it.itemId) === String(item._id)) ||
                  (it.name && item.name && item.name.trim().toLowerCase() === it.name.trim().toLowerCase()) ||
                  (Array.isArray(approvedItems) && approvedItems.length === indentToUpdate.items.length && approvedItems[idx])
          );
          if (matched) {
            itemObj.approvedQty = Number(matched.approvedQty);
          } else {
            itemObj.approvedQty = (itemObj.approvedQty !== null && itemObj.approvedQty !== undefined) 
              ? Number(itemObj.approvedQty) 
              : Number(itemObj.requiredQty || 0);
          }
          itemObj.suppliedQty = Number(itemObj.suppliedQty) || 0;
          itemObj.utilizedQty = Number(itemObj.utilizedQty) || 0;
          return itemObj;
        });

        await Indent.updateOne(
          { _id: indentToUpdate._id, tenantId: req.tenantId },
          { $set: { status: 'Approved', items: plainItems } },
          sessionOpt
        );

        // Also update Approval details items so approvals API returns the exact approvedQty
        if (approval.details) {
          approval.details.items = plainItems;
        }
      } else if (approval.type === 'vendor_onboarding') {
        const Vendor = require('../models/Vendor');
        const Medicine = require('../models/Medicine');
        const vendorId = approval.details.vendorId;
        const itemsToApprove = Array.isArray(approvedItems) && approvedItems.length > 0 ? approvedItems : (approval.details?.items || []);

        if (vendorId) {
          const vendor = await Vendor.findOne({ _id: vendorId, tenantId: req.tenantId }).session(useTransaction && session ? session : null);
          if (vendor) {
            vendor.status = 'Active';
            if (Array.isArray(itemsToApprove) && itemsToApprove.length > 0) {
              const updatedMedicines = [...(vendor.medicines || [])];
              for (const apprItem of itemsToApprove) {
                if (!apprItem.name && !apprItem.sku) continue;
                const purchasePrice = Number(apprItem.purchasePrice !== undefined ? apprItem.purchasePrice : (apprItem.price !== undefined ? apprItem.price : 0));
                const sellingPrice = Number(apprItem.sellingPrice !== undefined && apprItem.sellingPrice !== null ? apprItem.sellingPrice : (apprItem.mrp !== undefined && apprItem.mrp !== null ? apprItem.mrp : purchasePrice));
                const matchIdx = updatedMedicines.findIndex(m => 
                  (m.sku && apprItem.sku && m.sku.trim().toUpperCase() === apprItem.sku.trim().toUpperCase()) ||
                  (m.name && apprItem.name && m.name.trim().toLowerCase() === apprItem.name.trim().toLowerCase())
                );
                if (matchIdx !== -1) {
                  updatedMedicines[matchIdx].price = purchasePrice; // Vendor wholesale rate
                  if (sellingPrice > 0) {
                    updatedMedicines[matchIdx].mrp = sellingPrice;
                    updatedMedicines[matchIdx].sellingPrice = sellingPrice;
                  }
                  updatedMedicines[matchIdx].gst = apprItem.gst !== undefined ? Number(apprItem.gst) : updatedMedicines[matchIdx].gst;
                } else {
                  updatedMedicines.push({
                    name: apprItem.name.trim(),
                    sku: (apprItem.sku || '').trim().toUpperCase(),
                    price: purchasePrice,
                    mrp: sellingPrice > 0 ? sellingPrice : purchasePrice,
                    sellingPrice: sellingPrice > 0 ? sellingPrice : purchasePrice,
                    gst: apprItem.gst !== undefined ? Number(apprItem.gst) : 12,
                    available: apprItem.available !== false
                  });
                }
              }
              vendor.medicines = updatedMedicines;
            }
            await vendor.save(sessionOpt);
          }
        }

        // For each approved medicine, ensure hospital Medicine record exists (zero stock)
        if (Array.isArray(itemsToApprove) && itemsToApprove.length > 0) {
          for (const item of itemsToApprove) {
            if (!item.sku || !item.name) continue;
            const cleanSku = item.sku.trim().toUpperCase();
            const purchasePrice = Number(item.purchasePrice !== undefined ? item.purchasePrice : (item.price !== undefined ? item.price : 0));
            const sellingPrice = Number(item.sellingPrice !== undefined && item.sellingPrice !== null ? item.sellingPrice : (item.mrp !== undefined && item.mrp !== null ? item.mrp : purchasePrice));

            const existingMedicine = await Medicine.findOne({ sku: cleanSku, tenantId: req.tenantId }).session(useTransaction && session ? session : null);

            if (existingMedicine) {
              if (item.name) existingMedicine.name = item.name.trim();
              if (sellingPrice > 0 && (!existingMedicine.mrp || existingMedicine.mrp === 0)) {
                existingMedicine.mrp = sellingPrice;
              }
              await existingMedicine.save(sessionOpt);
            } else {
              // Create new hospital Medicine record with 0 stock
              await Medicine.create([{
                tenantId: req.tenantId,
                name: item.name.trim(),
                category: item.category || 'General',
                sku: cleanSku,
                stock: 0,
                unit: item.unit || 'Strip',
                mrp: sellingPrice > 0 ? sellingPrice : purchasePrice,
                status: 'Out of Stock',
                expiry: '--'
              }], sessionOpt);
            }
          }

          if (approval.details) {
            approval.details.items = itemsToApprove;
          }
        }
      } else if (approval.type === 'item_price_update') {
        const Vendor = require('../models/Vendor');
        const vendorId = approval.details.vendorId;
        const itemsToUpdate = approval.details.items;
        if (vendorId && Array.isArray(itemsToUpdate)) {
          const vendor = await Vendor.findOne({ _id: vendorId, tenantId: req.tenantId }).session(useTransaction && session ? session : null);
          if (vendor) {
            vendor.medicines = (vendor.medicines || []).filter(m => m && m.name && m.name.trim() !== '' && m.sku && m.sku.trim() !== '');
            for (const item of itemsToUpdate) {
              if (!item || !item.sku) continue;
              const existingIdx = vendor.medicines.findIndex(m => m.sku === item.sku);
              if (existingIdx !== -1) {
                vendor.medicines[existingIdx].price = Number(item.proposedPrice);
              } else if (item.name && item.sku) {
                vendor.medicines.push({
                  name: item.name,
                  sku: item.sku,
                  price: Number(item.proposedPrice || 0),
                  available: true
                });
              }
            }
            await vendor.save(sessionOpt);
          }
        }
      } else if (approval.type === 'vendor_medicine_addition') {
        const Vendor = require('../models/Vendor');
        const vendorId = approval.details?.vendorId;
        const med = approval.details?.medicine || approval.details;
        if (vendorId && med && (med.name || med.sku)) {
          const vendor = await Vendor.findOne({ _id: vendorId, tenantId: req.tenantId }).session(useTransaction && session ? session : null);
          if (vendor) {
            const purchasePrice = Number(med.price !== undefined && med.price !== null ? med.price : 0);
            const sellingPrice = Number(med.sellingPrice !== undefined && med.sellingPrice !== null ? med.sellingPrice : (med.mrp !== undefined && med.mrp !== null ? med.mrp : purchasePrice));
            const cleanSku = (med.sku || '').trim().toUpperCase();
            const cleanName = (med.name || '').trim();

            // Sanitize existing medicines to purge any legacy empty/corrupted rows
            const cleanMeds = (vendor.medicines || [])
              .filter(m => m && m.name && m.name.trim() !== '' && m.sku && m.sku.trim() !== '')
              .map(m => ({
                name: m.name.trim(),
                sku: m.sku.trim().toUpperCase(),
                price: Number(m.price || 0),
                gst: m.gst !== undefined ? Number(m.gst) : 12,
                available: m.available !== false,
                mrp: Number(m.mrp || m.sellingPrice || m.price || 0),
                sellingPrice: Number(m.sellingPrice || m.mrp || m.price || 0)
              }));

            const existingIdx = cleanMeds.findIndex(m => 
              (cleanSku && m.sku === cleanSku) ||
              (cleanName && m.name.toLowerCase() === cleanName.toLowerCase())
            );

            if (existingIdx !== -1) {
              cleanMeds[existingIdx].price = purchasePrice;
              cleanMeds[existingIdx].gst = med.gst !== undefined ? Number(med.gst) : cleanMeds[existingIdx].gst;
              cleanMeds[existingIdx].available = med.available !== false;
              if (sellingPrice > 0) {
                cleanMeds[existingIdx].mrp = sellingPrice;
                cleanMeds[existingIdx].sellingPrice = sellingPrice;
              }
            } else if (cleanName && cleanSku) {
              cleanMeds.push({
                name: cleanName,
                sku: cleanSku,
                price: purchasePrice,
                gst: med.gst !== undefined ? Number(med.gst) : 12,
                available: med.available !== false,
                mrp: sellingPrice > 0 ? sellingPrice : purchasePrice,
                sellingPrice: sellingPrice > 0 ? sellingPrice : purchasePrice
              });
            }

            vendor.medicines = cleanMeds;
            await vendor.save(sessionOpt);
          }
        }
      } else if (approval.type === 'purchase_order_approval') {
        const PurchaseOrder = require('../models/PurchaseOrder');
        const Vendor = require('../models/Vendor');
        const poId = approval.details.poId || approval.details.id;
        if (poId) {
          const po = await PurchaseOrder.findOneAndUpdate(
            { _id: poId, tenantId: req.tenantId },
            { status: 'Approved' },
            { returnDocument: 'after', ...sessionOpt }
          );
          if (po) {
            if (po.vendorId) {
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
                },
                sessionOpt
              );
            }

            // If this is a child PO linked to a master parent PO, update parent status
            if (po.parentPOId) {
              const allChildren = await PurchaseOrder.find({ parentPOId: po.parentPOId, tenantId: req.tenantId }).session(useTransaction && session ? session : null);
              const parentPO = await PurchaseOrder.findOne({ poId: po.parentPOId, tenantId: req.tenantId }).session(useTransaction && session ? session : null);
              
              if (parentPO) {
                const approvedCount = allChildren.filter(c => c.status === 'Approved' || (c._id.toString() === po._id.toString())).length;
                const rejectedCount = allChildren.filter(c => c.status === 'Rejected' && c._id.toString() !== po._id.toString()).length;
                const totalChildren = allChildren.length;

                if (approvedCount === totalChildren) {
                  parentPO.status = 'Approved';
                } else if (rejectedCount === totalChildren) {
                  parentPO.status = 'Rejected';
                } else if (approvedCount > 0) {
                  parentPO.status = 'Partially Approved';
                }

                if (Array.isArray(parentPO.vendorOrders)) {
                  parentPO.vendorOrders.forEach(vo => {
                    if (vo.poId === po.poId || vo.vendorId?.toString() === po.vendorId?.toString()) {
                      vo.status = 'Approved';
                    }
                  });
                }
                await parentPO.save(sessionOpt);
              }
            }
          }
        }
      }
    } else if (status === 'denied') {
      if (indentToUpdate) {
        indentToUpdate.status = 'Rejected';
        if (indentToUpdate.items && Array.isArray(indentToUpdate.items)) {
          indentToUpdate.items.forEach(item => {
            item.approvedQty = null;
          });
        }
        await indentToUpdate.save(sessionOpt);
      } else if (isIndentType) {
        const Indent = require('../models/Indent');
        const indentId = approval.details && approval.details.indentId;
        if (indentId) {
          await Indent.findOneAndUpdate(
            { _id: indentId, tenantId: req.tenantId },
            { status: 'Rejected' },
            sessionOpt
          );
        }
      } else if (approval.type === 'vendor_onboarding') {
        const Vendor = require('../models/Vendor');
        const vendorId = approval.details.vendorId;
        if (vendorId) {
          await Vendor.findOneAndUpdate(
            { _id: vendorId, tenantId: req.tenantId },
            { status: 'Proposed/Rejected' },
            sessionOpt
          );
        }
      } else if (approval.type === 'purchase_order_approval') {
        const PurchaseOrder = require('../models/PurchaseOrder');
        const poId = approval.details.poId || approval.details.id;
        if (poId) {
          const po = await PurchaseOrder.findOneAndUpdate(
            { _id: poId, tenantId: req.tenantId },
            { status: 'Rejected' },
            { returnDocument: 'after', ...sessionOpt }
          );
          if (po && po.parentPOId) {
            const allChildren = await PurchaseOrder.find({ parentPOId: po.parentPOId, tenantId: req.tenantId }).session(useTransaction && session ? session : null);
            const parentPO = await PurchaseOrder.findOne({ poId: po.parentPOId, tenantId: req.tenantId }).session(useTransaction && session ? session : null);
            
            if (parentPO) {
              const approvedCount = allChildren.filter(c => c.status === 'Approved' && c._id.toString() !== po._id.toString()).length;
              const rejectedCount = allChildren.filter(c => c.status === 'Rejected' || (c._id.toString() === po._id.toString())).length;
              const totalChildren = allChildren.length;

              if (rejectedCount === totalChildren) {
                parentPO.status = 'Rejected';
              } else if (approvedCount === totalChildren) {
                parentPO.status = 'Approved';
              } else if (approvedCount > 0) {
                parentPO.status = 'Partially Approved';
              }

              if (Array.isArray(parentPO.vendorOrders)) {
                parentPO.vendorOrders.forEach(vo => {
                  if (vo.poId === po.poId || vo.vendorId?.toString() === po.vendorId?.toString()) {
                    vo.status = 'Rejected';
                  }
                });
              }
              await parentPO.save(sessionOpt);
            }
          }
        }
      }
    }

    // Update and save approval document
    approval.status = status;
    approval.comment = comment || '';
    approval.resolvedAt = new Date();
    approval.resolvedBy = req.user.staff_id || req.user.id || req.user.name || 'admin';
    await Approval.updateOne(
      { _id: approval._id, tenantId: req.tenantId },
      {
        $set: {
          status: status,
          comment: approval.comment,
          resolvedAt: approval.resolvedAt,
          resolvedBy: approval.resolvedBy,
          'details.items': approval.details?.items
        }
      },
      sessionOpt
    );

    // Commit transaction if active
    if (useTransaction && session) {
      await session.commitTransaction();
      await session.endSession();
      session = null;
    }

    // Audit trail
    const auditMeta = { type: approval.type, comment };
    if (approval.type === 'vendor_medicine_addition') {
      auditMeta.vendor = approval.details?.vendorName || approval.details?.vendorCode || approval.details?.vendorId;
      auditMeta.vendorId = approval.details?.vendorId;
      auditMeta.medicine = approval.details?.medicine?.name || approval.details?.name;
      auditMeta.sku = approval.details?.medicine?.sku || approval.details?.sku;
      if (status === 'denied') {
        auditMeta.rejectionReason = comment || 'Rejected by admin';
      }
    }
    await AuditLog.create({
      tenantId: req.tenantId,
      actor: req.user.staff_id || req.user.id || req.user.name || 'admin',
      actorName: req.user.name || '',
      actorRole: req.user.role || 'admin',
      action: approval.type === 'vendor_medicine_addition' ? `vendor_medicine_${status}` : `approval_${status}`,
      target: approval._id.toString(),
      metadata: auditMeta
    });

    const io = req.app.get("io");
    if (io && req.tenantId) {
      io.to(req.tenantId).emit("data_changed", { type: "approvals" });
      if (approval.type === 'receptionist_indent' || approval.type === 'Indent' || approval.type === 'indent') {
        io.to(req.tenantId).emit("data_changed", { type: "indents" });
      }
      if (approval.type === 'vendor_onboarding' || approval.type === 'vendor_medicine_addition') {
        io.to(req.tenantId).emit("data_changed", { type: "vendors" });
        if (approval.type === 'vendor_onboarding') {
          io.to(req.tenantId).emit("data_changed", { type: "medicines" });
        }
      }
      if (approval.type === 'purchase_order_approval') {
        io.to(req.tenantId).emit("data_changed", { type: "purchase_orders" });
        io.to(req.tenantId).emit("data_changed", { type: "vendors" });
      }
    }
    res.json(approval);
  } catch (err) {
    if (session) {
      try {
        await session.abortTransaction();
        await session.endSession();
      } catch (abortErr) {
        // ignore abort errors
      }
    }
    console.error("Approvals error:", err);
    res.status(500).json({ error: err.message, stack: err.stack });
  }
});

// DELETE /api/approvals/:id — admin only
router.delete('/:id', verifyToken, isAdmin, tenantMiddleware, async (req, res) => {
  try {
    const approval = await Approval.findOneAndDelete({ _id: req.params.id, tenantId: req.tenantId });
    if (!approval) return res.status(404).json({ error: 'Approval not found' });
    const io = req.app.get("io");
    if (io && req.tenantId) {
      io.to(req.tenantId).emit("data_changed", { type: "approvals" });
      if (approval && (approval.type === 'receptionist_indent' || approval.type === 'Indent' || approval.type === 'indent')) {
        io.to(req.tenantId).emit("data_changed", { type: "indents" });
      }
    }
    res.json({ message: 'Deleted', id: req.params.id });
  } catch (err) {
    console.error("Approvals error:", err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
