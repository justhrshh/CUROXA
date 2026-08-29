const Medicine = require('../models/Medicine');
const MedicineBatch = require('../models/MedicineBatch');

/**
 * FEFO (First Expiry, First Out) Inventory Engine
 */

/**
 * Step 1: Pre-validate all items across a prescription or sale prior to any stock mutation.
 * Calculates FEFO batch allocations for every item.
 */
async function validateAndPlanFEFO(tenantId, itemsRequested) {
  if (!Array.isArray(itemsRequested) || itemsRequested.length === 0) {
    throw new Error('At least one medicine item is required.');
  }

  const now = new Date();
  const plans = [];

  for (const rawItem of itemsRequested) {
    if (!rawItem) continue;
    const qty = Math.max(1, parseInt(rawItem.quantity, 10) || 1);

    // 1. Locate Medicine record
    let medicineDoc = null;
    if (rawItem.medicineId || rawItem._id) {
      medicineDoc = await Medicine.findOne({
        _id: rawItem.medicineId || rawItem._id,
        tenantId
      });
    }

    if (!medicineDoc && rawItem.sku) {
      medicineDoc = await Medicine.findOne({
        sku: String(rawItem.sku).trim().toUpperCase(),
        tenantId
      });
    }

    if (!medicineDoc) {
      const nameCand = String(rawItem.medicineName || rawItem.medicine || rawItem.name || '').trim();
      if (nameCand) {
        medicineDoc = await Medicine.findOne({ name: nameCand, tenantId });
        if (!medicineDoc) {
          const words = nameCand.split(/\s+/).filter(Boolean);
          if (words.length > 0) {
            const conditions = words.map(w => ({
              name: { $regex: new RegExp(w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') }
            }));
            medicineDoc = await Medicine.findOne({ $and: conditions, tenantId });
          }
        }
      }
    }

    if (!medicineDoc) {
      const medLabel = rawItem.medicineName || rawItem.medicine || rawItem.name || 'Unknown';
      throw new Error('Medicine "' + medLabel + '" is not found in pharmacy inventory.');
    }

    // 2. Query all MedicineBatch records for this medicine/SKU
    const cleanSku = String(medicineDoc.sku).trim().toUpperCase();
    const allBatchesForMed = await MedicineBatch.find({
      tenantId,
      $or: [
        { medicineId: medicineDoc._id },
        { sku: cleanSku }
      ]
    });

    // Filter eligible, non-expired, active batches sorted by earliest expiry (FEFO)
    const eligibleBatches = allBatchesForMed.filter(b => {
      if (b.availableQuantity <= 0) return false;
      if (b.status === 'Expired' || b.status === 'Depleted') return false;
      if (b.expiryDate && new Date(b.expiryDate) <= now) return false;
      return true;
    }).sort((a, b) => {
      if (!a.expiryDate) return 1;
      if (!b.expiryDate) return -1;
      return new Date(a.expiryDate).getTime() - new Date(b.expiryDate).getTime();
    });

    const totalValidBatchStock = eligibleBatches.reduce((sum, b) => sum + Number(b.availableQuantity || 0), 0);

    if (allBatchesForMed.length > 0) {
      // When batches are tracked for this medicine, stock must be satisfied by unexpired batches
      if (totalValidBatchStock < qty) {
        throw new Error(
          'Insufficient valid/unexpired stock for "' + medicineDoc.name + 
          '". Available valid: ' + totalValidBatchStock + ', Required: ' + qty + '.'
        );
      }

      // Compute FEFO allocation
      let remainingToAllocate = qty;
      const allocations = [];
      for (const batch of eligibleBatches) {
        if (remainingToAllocate <= 0) break;
        const take = Math.min(batch.availableQuantity, remainingToAllocate);
        allocations.push({
          batchId: batch._id,
          batchNumber: batch.batchNumber,
          expiryDate: batch.expiryDate,
          quantity: take
        });
        remainingToAllocate -= take;
      }

      plans.push({
        rawItem,
        medicineDoc,
        quantity: qty,
        allocations,
        totalValidBatchStock
      });
    } else {
      // Pure legacy inventory without MedicineBatch records
      if (medicineDoc.stock < qty) {
        throw new Error(
          'Insufficient stock for "' + medicineDoc.name + 
          '". Available: ' + medicineDoc.stock + ', Required: ' + qty + '.'
        );
      }
      plans.push({
        rawItem,
        medicineDoc,
        quantity: qty,
        allocations: [],
        totalValidBatchStock: medicineDoc.stock
      });
    }
  }

  return plans;
}

/**
 * Step 2: Commit FEFO inventory consumption across MedicineBatch and Medicine.stock.
 * Rolls back if any concurrency violation occurs.
 */
async function commitFEFOConsumption(tenantId, plans) {
  const rollbackStack = [];

  try {
    for (const plan of plans) {
      // 1. Deduct from EEFO allocated MedicineBatch records
      for (const alloc of plan.allocations) {
        const batch = await MedicineBatch.findOneAndUpdate(
          { _id: alloc.batchId, tenantId, availableQuantity: { $gte: alloc.quantity } },
          { $inc: { availableQuantity: -alloc.quantity } },
          { returnDocument: 'after' }
        );

        if (!batch) {
          throw new Error('Insufficient batch quantity for Batch "' + alloc.batchNumber + '" due to concurrent dispensing.');
        }

        rollbackStack.push({ type: 'batch', id: alloc.batchId, qty: alloc.quantity });

        if (batch.availableQuantity === 0) {
          batch.status = 'Depleted';
          await batch.save();
        }
      }

      // 2. Deduct from aggregate Medicine.stock
      const updatedMed = await Medicine.findOneAndUpdate(
        { _id: plan.medicineDoc._id, tenantId, stock: { $gte: plan.quantity } },
        { $inc: { stock: -plan.quantity } },
        { returnDocument: 'after' }
      );

      if (!updatedMed) {
        throw new Error('Insufficient aggregate stock for "' + plan.medicineDoc.name + '".');
      }

      rollbackStack.push({ type: 'medicine', id: plan.medicineDoc._id, qty: plan.quantity });

      if (updatedMed.stock === 0) updatedMed.status = 'Out of Stock';
      else if (updatedMed.stock <= 20) updatedMed.status = 'Low Stock';
      else updatedMed.status = 'In Stock';
      await updatedMed.save();
    }
  } catch (commitErr) {
    for (const rb of rollbackStack) {
      if (rb.type === 'batch') {
        await MedicineBatch.updateOne(
          { _id: rb.id, tenantId },
          { $inc: { availableQuantity: rb.qty }, $set: { status: 'Active' } }
        );
      } else if (rb.type === 'medicine') {
        await Medicine.updateOne(
          { _id: rb.id, tenantId },
          { $inc: { stock: rb.qty } }
        );
      }
    }
    throw commitErr;
  }
}

module.exports = {
  validateAndPlanFEFO,
  commitFEFOConsumption
};