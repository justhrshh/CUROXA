const GoodsReceipt = require('../models/GoodsReceipt');
const Medicine = require('../models/Medicine');
const MedicineBatch = require('../models/MedicineBatch');

/**
 * Safe, deterministic backfill utility for existing historical GRN data.
 * Only converts records with explicit, authentic batch numbers and quantities.
 * Does NOT fabricate baches, quantities, or dates.
 */
async function backfillMedicineBatches(tenantId = null) {
  const query = { status: 'Verified/Completed' };
  if (tenantId) query.tenantId = tenantId;

  const grns = await GoodsReceipt.find(query).lean();
  let backfilledCount = 0;

  for (const grn of grns) {
    if (!Array.isArray(grn.items)) continue;

    for (const item of grn.items) {
      const acceptedQty = Number(item.qtyReceived) || 0;
      const rawBatch = String(item.batchNumber || '').trim().toUpperCase();
      const rawSku = String(item.sku || '').trim().toUpperCase();

      if (acceptedQty <= 0 || !rawBatch || !rawSku) continue;

      // Check if MedicineBatch already exists
      let batchDoc = await MedicineBatch.findOne({
        tenantId: grn.tenantId,
        sku: rawSku,
        batchNumber: rawBatch
      });

      if (!batchDoc) {
        const med = await Medicine.findOne({ tenantId: grn.tenantId, sku: rawSku });
        if (med) {
          await MedicineBatch.create({
            tenantId: grn.tenantId,
            medicineId: med._id,
            sku: rawSku,
            name: item.name || med.name,
            batchNumber: rawBatch,
            mfgDate: item.mfgDate || null,
            expiryDate: item.expiryDate || null,
            receivedQuantity: acceptedQty,
            availableQuantity: acceptedQty,
            purchaseRate: Number(item.purchaseRate || item.price || 0),
            mrp: Number(item.mrp || (Number(item.purchaseRate || item.price || 0) * 1.25)),
            grnId: grn.grnId,
            vendorName: grn.vendorName,
            status: 'Active'
          });
          backfilledCount++;
        }
      }
    }
  }

  return backfilledCount;
}

module.exports = { backfillMedicineBatches };
