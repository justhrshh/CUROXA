const express = require('express');
const { PharmacySale, PharmacySaleCounter } = require('../models/PharmacySale');
const Medicine = require('../models/Medicine');
const Prescription = require('../models/Prescription');
const Patient = require('../models/Patient');
const AuditLog = require('../models/AuditLog');
const { validateAndPlanFEFO, commitFEFOConsumption } = require('../utils/inventoryEngine');
const { verifyToken } = require('../middleware/authMiddleware');

const router = express.Router();

router.use(verifyToken);

/**
 * Atomic, collision-safe Sale ID generator per tenant and year
 * Target Format: SL-YYYY-0001
 */
async function getNextSaleId(tenantId) {
  const currentYear = new Date().getFullYear();
  const counter = await PharmacySaleCounter.findOneAndUpdate(
    { tenantId, year: currentYear },
    { $inc: { seq: 1 } },
    { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true }
  );
  return `SL-${currentYear}-${String(counter.seq).padStart(4, '0')}`;
}

/**
 * Authoritative financial calculator for a single sale item
 */
function calculateItemFinancials(item, medicineDoc, stockImpact = 'DEDUCTED') {
  const qty = Math.max(1, parseInt(item.quantity, 10) || 1);
  const mrp = Number(medicineDoc ? medicineDoc.mrp : (item.mrp || item.price || 0)) || 0;
  const discountPercent = Math.max(0, Math.min(100, Number(item.discountPercent) || 0));
  const gstPercent = Math.max(0, Math.min(100, Number(item.gstPercent) || 0));

  const gross = qty * mrp;
  const discountAmount = Math.round((gross * (discountPercent / 100)) * 100) / 100;
  const taxable = Math.max(0, Math.round((gross - discountAmount) * 100) / 100);
  const gstAmount = Math.round((taxable * (gstPercent / 100)) * 100) / 100;
  const netAmount = Math.round((taxable + gstAmount) * 100) / 100;

  return {
    medicineId: medicineDoc ? medicineDoc._id : (item.medicineId || null),
    medicineName: medicineDoc ? medicineDoc.name : String(item.medicineName || item.medicine || item.name || '').trim(),
    sku: medicineDoc ? medicineDoc.sku : (item.sku || ''),
    batchNumber: item.batchNumber || '',
    expiryDate: medicineDoc && medicineDoc.expiry ? medicineDoc.expiry : (item.expiryDate || ''),
    quantity: qty,
    unit: medicineDoc ? medicineDoc.unit : (item.unit || 'Strip'),
    mrp,
    discountPercent,
    discountAmount,
    gstPercent,
    gstAmount,
    netAmount,
    stockImpact
  };
}

// GET /api/pharmacy-sales — List sales with filtering and pagination (tenant-scoped)
router.get('/', async (req, res) => {
  try {
    const query = { tenantId: req.tenantId };

    if (req.query.saleType) {
      query.saleType = req.query.saleType.toUpperCase();
    }
    if (req.query.status) {
      query.status = req.query.status.toUpperCase();
    }
    if (req.query.prescriptionId) {
      query.prescriptionId = req.query.prescriptionId;
    }
    if (req.query.patientId) {
      query.patientId = req.query.patientId;
    }
    if (req.query.customerMobile) {
      query.customerMobile = req.query.customerMobile;
    }

    // Date range filter
    if (req.query.startDate || req.query.endDate) {
      query.createdAt = {};
      if (req.query.startDate) {
        const start = new Date(req.query.startDate);
        start.setHours(0, 0, 0, 0);
        query.createdAt.$gte = start;
      }
      if (req.query.endDate) {
        const end = new Date(req.query.endDate);
        end.setHours(23, 59, 59, 999);
        query.createdAt.$lte = end;
      }
    }

    // Free text search
    if (req.query.search && req.query.search.trim()) {
      const q = req.query.search.trim();
      const escaped = q.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');
      const regex = new RegExp(escaped, 'i');
      query.$or = [
        { saleId: regex },
        { customerName: regex },
        { customerMobile: regex },
        { doctorName: regex },
        { prescriptionCode: regex }
      ];
    }

    const limit = Math.min(200, Math.max(1, parseInt(req.query.limit, 10) || 50));
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const skip = (page - 1) * limit;

    const [sales, totalCount] = await Promise.all([
      PharmacySale.find(query)
        .populate('prescriptionId', 'status createdAt appointmentId')
        .populate('patientId', 'name contact age gender patientId')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      PharmacySale.countDocuments(query)
    ]);

    res.json({
      sales,
      pagination: {
        total: totalCount,
        page,
        limit,
        pages: Math.ceil(totalCount / limit) || 1
      }
    });
  } catch (error) {
    console.error('Get pharmacy sales error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/pharmacy-sales/:id — Single sale by ID (tenant-scoped)
router.get('/:id', async (req, res) => {
  try {
    const isObjectId = /^[0-9a-fA-F]{24}$/.test(req.params.id);
    const query = {
      tenantId: req.tenantId,
      ...(isObjectId ? { $or: [{ _id: req.params.id }, { saleId: req.params.id }] } : { saleId: req.params.id })
    };

    const sale = await PharmacySale.findOne(query)
      .populate('prescriptionId', 'status createdAt appointmentId items')
      .populate('patientId', 'name contact age gender patientId')
      .lean();

    if (!sale) {
      return res.status(404).json({ error: 'Pharmacy sale not found' });
    }

    res.json(sale);
  } catch (error) {
    console.error('Get pharmacy sale by ID error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/pharmacy-sales — Create a new pharmacy sale (Direct or Prescription)
router.post('/', async (req, res) => {
  const {
    saleType,
    prescriptionId,
    patientId,
    patientIdentifier,
    customerName,
    customerMobile,
    doctorName,
    pharmacistName,
    pharmacistId,
    pharmacyLocation,
    items,
    paymentMethod,
    amountReceived,
    transactionRef,
    notes
  } = req.body;

  try {
    // 1. Validate saleType
    const normalizedSaleType = String(saleType || '').toUpperCase().trim();
    if (normalizedSaleType !== 'DIRECT' && normalizedSaleType !== 'PRESCRIPTION') {
      return res.status(400).json({ error: 'Invalid saleType. Must be DIRECT or PRESCRIPTION.' });
    }

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Sale must contain at least one medicine item.' });
    }

    // 2. Validate payment method
    const validPaymentMethods = ['Cash', 'UPI', 'Card'];
    const resolvedPaymentMethod = validPaymentMethods.includes(paymentMethod) ? paymentMethod : 'Cash';

    let resolvedDoctorName = 'Self / No Doctor';
    let resolvedCustomerName = customerName ? String(customerName).trim() : '';
    let resolvedCustomerMobile = customerMobile ? String(customerMobile).trim() : '';
    let resolvedPatientId = patientId || null;
    let resolvedPatientIdentifier = patientIdentifier || null;
    let resolvedPrescriptionId = null;
    let resolvedPrescriptionCode = null;

    // -------------------------------------------------------------
    // BRANCH A: PRESCRIPTION SALE
    // -------------------------------------------------------------
    if (normalizedSaleType === 'PRESCRIPTION') {
      if (!prescriptionId) {
        return res.status(400).json({ error: 'prescriptionId is required for PRESCRIPTION saleType.' });
      }

      // Check for duplicate prescription sale
      const existingSale = await PharmacySale.findOne({
        tenantId: req.tenantId,
        prescriptionId,
        status: { $ne: 'CANCELLED' }
      });

      if (existingSale) {
        return res.status(400).json({
          error: 'A pharmacy sale record already exists for this prescription.',
          saleId: existingSale.saleId
        });
      }

      const prescription = await Prescription.findOne({
        _id: prescriptionId,
        tenantId: req.tenantId
      })
        .populate('patientId', 'name contact age gender patientId')
        .populate('doctorId', 'name specialty');

      if (!prescription) {
        return res.status(404).json({ error: 'Referenced prescription not found.' });
      }

      resolvedPrescriptionId = prescription._id;
      resolvedPrescriptionCode = `RX-${prescription._id.toString().slice(-6).toUpperCase()}`;
      resolvedDoctorName = prescription.doctorId?.name || doctorName || 'Doctor';
      
      if (!resolvedCustomerName) {
        resolvedCustomerName = prescription.patientId?.name || 'Registered Patient';
      }
      if (!resolvedCustomerMobile) {
        resolvedCustomerMobile = prescription.patientId?.contact || '';
      }
      if (!resolvedPatientId && prescription.patientId?._id) {
        resolvedPatientId = prescription.patientId._id;
      }
      if (!resolvedPatientIdentifier) {
        resolvedPatientIdentifier = prescription.patientId?.patientId || (prescription.patientId?._id ? `MDC-${prescription.patientId._id.toString().slice(-4).toUpperCase()}` : null);
      }
    } else {
      // -----------------------------------------------------------
      // BRANCH B: DIRECT SALE
      // -----------------------------------------------------------
      if (prescriptionId) {
        return res.status(400).json({ error: 'prescriptionId must be null for DIRECT saleType.' });
      }
      resolvedDoctorName = 'Self / No Doctor';
      if (!resolvedCustomerName) {
        resolvedCustomerName = 'Walk-in Customer';
      }
    }

    // 3. Process Line Items, FEFO Planning, and Authoritative Financials
    const processedItems = [];
    const stockImpact = normalizedSaleType === 'DIRECT' ? 'DEDUCTED' : 'PRE_DEDUCTED';
    let fefoPlans = [];

    if (normalizedSaleType === 'DIRECT') {
      try {
        // Step A: Pre-validate all items and calculate FEFO batch allocations
        fefoPlans = await validateAndPlanFEFO(req.tenantId, items);
      } catch (fefoErr) {
        return res.status(400).json({ error: fefoErr.message });
      }

      for (const plan of fefoPlans) {
        const rawItem = plan.rawItem;
        const formattedItem = calculateItemFinancials(rawItem, plan.medicineDoc, stockImpact);
        
        // Enrich with FEFO allocated batch metadata for future traceability
        if (plan.allocations && plan.allocations.length > 0) {
          formattedItem.batchNumber = plan.allocations.map(a => a.batchNumber).join(', ');
          const firstAllocWithExp = plan.allocations.find(a => a.expiryDate);
          if (firstAllocWithExp && firstAllocWithExp.expiryDate) {
            formattedItem.expiryDate = new Date(firstAllocWithExp.expiryDate).toLocaleDateString('en-IN', { month: '2-digit', year: 'numeric' });
          }
        }
        processedItems.push(formattedItem);
      }
    } else {
      // PRESCRIPTION sale: financials only, inventory was pre-deducted upon dispensing
      for (const rawItem of items) {
        if (!rawItem) continue;
        const qty = parseInt(rawItem.quantity, 10);
        if (isNaN(qty) || qty <= 0) {
          return res.status(400).json({ error: `Invalid quantity for item "${rawItem.medicineName || rawItem.medicine || 'Unknown'}". Must be greater than 0.` });
        }

        let medicineDoc = null;
        if (rawItem.medicineId) {
          medicineDoc = await Medicine.findOne({ _id: rawItem.medicineId, tenantId: req.tenantId });
        }
        if (!medicineDoc && rawItem.sku) {
          medicineDoc = await Medicine.findOne({ sku: rawItem.sku, tenantId: req.tenantId });
        }
        if (!medicineDoc && (rawItem.medicineName || rawItem.medicine || rawItem.name)) {
          const medName = String(rawItem.medicineName || rawItem.medicine || rawItem.name).trim();
          medicineDoc = await Medicine.findOne({ name: medName, tenantId: req.tenantId });
        }

        const formattedItem = calculateItemFinancials(rawItem, medicineDoc, stockImpact);
        processedItems.push(formattedItem);
      }
    }

    if (processedItems.length === 0) {
      return res.status(400).json({ error: 'No valid medicine items could be processed.' });
    }

    // 4. Calculate Financial Totals Server-Side
    const subtotal = Math.round(processedItems.reduce((acc, it) => acc + (it.quantity * it.mrp), 0) * 100) / 100;
    const totalDiscount = Math.round(processedItems.reduce((acc, it) => acc + it.discountAmount, 0) * 100) / 100;
    const totalGst = Math.round(processedItems.reduce((acc, it) => acc + it.gstAmount, 0) * 100) / 100;
    const grandTotal = Math.round(processedItems.reduce((acc, it) => acc + it.netAmount, 0) * 100) / 100;

    const numAmountReceived = Math.max(0, Number(amountReceived) || grandTotal);
    const changeReturned = resolvedPaymentMethod === 'Cash' ? Math.max(0, Math.round((numAmountReceived - grandTotal) * 100) / 100) : 0;

    // 5. Atomic FEFO Stock & Batch Deduction for DIRECT SALE
    if (normalizedSaleType === 'DIRECT') {
      try {
        await commitFEFOConsumption(req.tenantId, fefoPlans);
      } catch (commitErr) {
        return res.status(400).json({ error: commitErr.message });
      }
    }

    // 6. Generate Sequential Sale ID and Create Permanent PharmacySale Document
    let sale;
    try {
      const saleId = await getNextSaleId(req.tenantId);
      const now = new Date();
      const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

      sale = await PharmacySale.create({
        tenantId: req.tenantId,
        saleId,
        saleDate: now,
        saleTime: timeStr,
        saleType: normalizedSaleType,
        prescriptionId: resolvedPrescriptionId,
        prescriptionCode: resolvedPrescriptionCode,
        patientId: resolvedPatientId,
        patientIdentifier: resolvedPatientIdentifier,
        customerName: resolvedCustomerName,
        customerMobile: resolvedCustomerMobile,
        doctorName: resolvedDoctorName,
        pharmacistName: pharmacistName || req.user.name || 'Pharmacist',
        pharmacistId: pharmacistId || req.user.staff_id || '',
        pharmacyLocation: pharmacyLocation || 'Main Pharmacy',
        status: 'COMPLETED',
        items: processedItems,
        subtotal,
        totalDiscount,
        totalGst,
        grandTotal,
        paymentMethod: resolvedPaymentMethod,
        paymentStatus: 'PAID',
        amountReceived: numAmountReceived,
        changeReturned,
        transactionRef: transactionRef || '',
        notes: notes || ''
      });
    } catch (createError) {
      // Rollback stock deduction if creation failed
      if (normalizedSaleType === 'DIRECT') {
        for (const rollback of successfullyDeducted) {
          await Medicine.updateOne(
            { _id: rollback.medicineId, tenantId: req.tenantId },
            { $inc: { stock: rollback.qty } }
          );
        }
      }
      console.error('Create PharmacySale error:', createError);
      return res.status(400).json({ error: createError.message });
    }

    // 7. Fire-and-Forget Audit Log (strict operational metadata only)
    AuditLog.create({
      tenantId: req.tenantId,
      actor: req.user.staff_id || req.user.id || 'system',
      actorName: req.user.name || 'Pharmacist',
      actorRole: req.user.role || 'pharmacy',
      action: 'pharmacy_sale_created',
      target: sale._id.toString(),
      metadata: {
        saleId: sale.saleId,
        saleType: sale.saleType,
        grandTotal: sale.grandTotal,
        paymentMethod: sale.paymentMethod,
        itemCount: sale.items.length,
        prescriptionId: sale.prescriptionId || null,
        isDirectSale: sale.saleType === 'DIRECT'
      }
    }).catch(() => {});

    // 8. Real-time Socket Broadcast
    const io = req.app.get('io');
    if (io && req.tenantId) {
      io.to(req.tenantId).emit('data_changed', { type: 'pharmacy_sales' });
      if (normalizedSaleType === 'DIRECT') {
        io.to(req.tenantId).emit('data_changed', { type: 'medicines' });
      }
    }

    res.status(201).json(sale);
  } catch (error) {
    console.error('POST /api/pharmacy-sales unexpected error:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

module.exports = router;
