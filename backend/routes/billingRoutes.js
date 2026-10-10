const express = require('express');
const Billing = require('../models/Billing');
const { verifyToken } = require('../middleware/authMiddleware');
const router = express.Router();
const DiscountSetting = require('../models/DiscountSetting');

router.use(verifyToken);

// Get discount setting (scoped to tenant)
router.get('/discount-setting', async (req, res) => {
  try {
    let setting = await DiscountSetting.findOne({ tenantId: req.tenantId });
    if (!setting) {
      setting = await DiscountSetting.create({
        tenantId: req.tenantId,
        allowedDiscountPercent: 10
      });
    }
    res.json(setting);
  } catch (error) {
    console.error("Get discount setting error:", error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update discount setting (scoped to tenant, admin/hr only)
router.post('/discount-setting', async (req, res) => {
  if (req.user.role !== 'admin' && req.user.role !== 'hr') {
    return res.status(403).json({ error: "Only Admin or HR can modify discount settings" });
  }
  const { allowedDiscountPercent } = req.body;
  if (allowedDiscountPercent === undefined || allowedDiscountPercent < 0 || allowedDiscountPercent > 100) {
    return res.status(400).json({ error: "Invalid allowed discount percentage" });
  }
  try {
    const setting = await DiscountSetting.findOneAndUpdate(
      { tenantId: req.tenantId },
      { allowedDiscountPercent: Number(allowedDiscountPercent) },
      { upsert: true, returnDocument: 'after' }
    );
    const io = req.app.get("io");
    if (io) {
      io.to(req.tenantId).emit("data_changed", { type: "discount_setting" });
    }
    res.json(setting);
  } catch (error) {
    console.error("Update discount setting error:", error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get bills (scoped to tenant)
router.get('/', async (req, res) => {
  try {
    const query = { tenantId: req.tenantId };
    if (req.query.patientId) query.patientId = req.query.patientId;
    if (req.query.appointmentId) query.appointmentId = req.query.appointmentId;

    const bills = await Billing.find(query)
      .populate('patientId', 'name contact')
      .sort({ createdAt: -1 });
    res.json(bills);
  } catch (error) {
    console.error("Get bills error:", error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create bill (scoped to tenant)
// Create bill (scoped to tenant, supports single or multimode simultaneous payments)
router.post('/', async (req, res) => {
  const {
    patientId,
    appointmentId,
    items,
    totalAmount,
    status,
    paymentMethod,
    payments,
    discountPercent,
    discountAmount,
    originalAmount,
    discountReason,
    notes,
    requestId,
    amountPaid
  } = req.body;

  try {
    let resolvedTenantId = req.tenantId;
    let resolvedPatientId = patientId;

    if (appointmentId) {
      const Appointment = require('../models/Appointment');
      const apptObj = await Appointment.findById(appointmentId);
      if (apptObj) {
        resolvedTenantId = apptObj.tenantId;
        resolvedPatientId = apptObj.patientId;
      }
    }

    const numTotal = Math.round((Number(totalAmount) || 0) * 100) / 100;
    let formattedPayments = [];

    // Process payments array if provided
    if (Array.isArray(payments) && payments.length > 0) {
      const validRows = payments.filter(p => Number(p.amount) > 0);
      const incomingTotal = Math.round(validRows.reduce((sum, p) => sum + (Number(p.amount) || 0), 0) * 100) / 100;

      if (incomingTotal > numTotal) {
        return res.status(400).json({
          error: `Total payment amount (₹${incomingTotal}) exceeds net payable (₹${numTotal}).`
        });
      }

      if (validRows.length > 0) {
        const collectionId = `PC-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
        formattedPayments = validRows.map((p, idx) => ({
          collectionId,
          paymentId: `PAY-${Date.now()}-${idx}-${Math.floor(Math.random() * 1000)}`,
          amount: Math.round(Number(p.amount) * 100) / 100,
          method: p.method || 'Cash',
          source: p.source || 'Reception',
          transactionRef: (p.transactionRef || '').trim(),
          recordedBy: req.user?.staff_id || req.user?._id || 'receptionist',
          recordedByName: req.user?.name || 'Receptionist',
          recordedAt: new Date(),
          notes: (p.notes || notes || '').trim(),
          requestId: requestId || null
        }));
      }
    } else {
      // Single payment fallback
      const singleAmt = amountPaid !== undefined && amountPaid !== ''
        ? Number(amountPaid)
        : (status === 'Paid' ? numTotal : 0);

      if (singleAmt > 0) {
        if (singleAmt > numTotal) {
          return res.status(400).json({
            error: `Payment amount (₹${singleAmt}) exceeds net payable (₹${numTotal}).`
          });
        }
        const collectionId = `PC-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
        formattedPayments = [{
          collectionId,
          paymentId: `PAY-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
          amount: Math.round(singleAmt * 100) / 100,
          method: paymentMethod || 'Cash',
          source: 'Reception',
          transactionRef: (req.body.transactionRef || '').trim(),
          recordedBy: req.user?.staff_id || req.user?._id || 'receptionist',
          recordedByName: req.user?.name || 'Receptionist',
          recordedAt: new Date(),
          notes: (notes || '').trim(),
          requestId: requestId || null
        }];
      }
    }

    const totalPaid = Math.round(formattedPayments.reduce((s, p) => s + p.amount, 0) * 100) / 100;
    const balanceDue = Math.max(0, Math.round((numTotal - totalPaid) * 100) / 100);
    const calculatedStatus = (totalPaid >= numTotal && numTotal > 0)
      ? 'Paid'
      : (totalPaid > 0 ? 'Partially Paid' : (status || 'Unpaid'));

    const finalMethod = formattedPayments.length > 0
      ? [...new Set(formattedPayments.map(p => p.method))].join(' + ')
      : (paymentMethod || 'Cash');

    const bill = new Billing({
      tenantId: resolvedTenantId,
      patientId: resolvedPatientId,
      appointmentId,
      items: items || [],
      originalAmount: originalAmount !== undefined ? Number(originalAmount) : numTotal,
      discountPercent: discountPercent !== undefined ? Number(discountPercent) : 0,
      discountAmount: discountAmount !== undefined ? Number(discountAmount) : 0,
      discountReason: discountReason || '',
      totalAmount: numTotal,
      amountPaid: totalPaid,
      balanceDue: balanceDue,
      status: calculatedStatus,
      paymentMethod: finalMethod,
      payments: formattedPayments
    });

    await bill.save();

    // Sync appointment paymentStatus and status if appointment linked
    if (appointmentId) {
      try {
        const Appointment = require('../models/Appointment');
        const apptObj = await Appointment.findById(appointmentId);
        if (apptObj) {
          apptObj.paymentStatus = bill.status === 'Paid' ? 'Paid' : (bill.status === 'Partially Paid' ? 'Partially Paid' : 'Pending');
          if (bill.status === 'Paid' && (apptObj.status === 'Pending' || apptObj.status === 'Pending Approval')) {
            apptObj.status = 'Confirmed';
          }
          await apptObj.save();
        }
      } catch (apptErr) {
        console.error("Error updating appointment paymentStatus in POST /billing:", apptErr);
      }
    }

    // Write audit log if payment collected
    if (formattedPayments.length > 0) {
      try {
        const AuditLog = require('../models/AuditLog');
        await AuditLog.create({
          tenantId: resolvedTenantId,
          actor: req.user?.staff_id || req.user?._id?.toString() || 'receptionist',
          actorName: req.user?.name || 'Receptionist',
          actorRole: req.user?.role || 'receptionist',
          action: formattedPayments.length > 1 ? 'PAYMENT_COLLECTED_MULTIMODE' : 'PAYMENT_COLLECTED',
          target: `Billing:${bill._id}`,
          metadata: {
            billId: bill._id,
            appointmentId,
            collectionId: formattedPayments[0]?.collectionId,
            totalCollected: bill.amountPaid,
            balanceDue: bill.balanceDue,
            status: bill.status,
            modes: formattedPayments.map(p => ({ method: p.method, amount: p.amount, ref: p.transactionRef }))
          }
        });
      } catch (auditErr) {
        console.error("Audit log creation error in POST /billing:", auditErr);
      }
    }

    const io = req.app.get("io");
    if (io) {
      io.to(req.tenantId).emit("data_changed", { type: "billing" });
      if (resolvedTenantId !== req.tenantId) {
        io.to(resolvedTenantId).emit("data_changed", { type: "billing" });
      }
      if (appointmentId) {
        io.to(req.tenantId).emit("data_changed", { type: "appointments" });
        if (resolvedTenantId !== req.tenantId) {
          io.to(resolvedTenantId).emit("data_changed", { type: "appointments" });
        }
      }
    }

    res.status(201).json(bill);
  } catch (error) {
    console.error("Create Billing Record Error:", error);
    res.status(400).json({ error: error.message });
  }
});

// Collect payment (supports single or split payments, partial payments, overpayment protection, and audit tracking)
router.post('/:id/collect-payment', async (req, res) => {
  try {
    const bill = await Billing.findOne({ _id: req.params.id, tenantId: req.tenantId }).populate('patientId', 'name contact');
    if (!bill) return res.status(404).json({ error: 'Bill not found' });

    const { payments: paymentEntries, discountPercent, discountReason, notes, requestId } = req.body;

    // Idempotency / Duplicate Submission Protection:
    // If a requestId is supplied and already recorded on this bill, return the existing bill immediately
    if (requestId && Array.isArray(bill.payments)) {
      const alreadyProcessed = bill.payments.some(p => p.requestId === requestId);
      if (alreadyProcessed) {
        return res.json({
          success: true,
          message: bill.status === 'Paid' ? 'Payment already completed in full.' : 'Payment already recorded.',
          bill,
          duplicateIgnored: true
        });
      }
    }

    // Optional discount adjustment at collection time
    if (discountPercent !== undefined && !isNaN(discountPercent)) {
      const discPct = Math.max(0, Math.min(100, Number(discountPercent)));
      const baseAmt = bill.originalAmount || bill.totalAmount;
      bill.originalAmount = baseAmt;
      bill.discountPercent = discPct;
      bill.discountAmount = Math.round(((baseAmt * discPct) / 100) * 100) / 100;
      bill.totalAmount = Math.round(Math.max(0, baseAmt - bill.discountAmount) * 100) / 100;
      bill.discountReason = discountReason || bill.discountReason || '';
    }

    if (!Array.isArray(paymentEntries) || paymentEntries.length === 0) {
      return res.status(400).json({ error: 'At least one payment entry is required' });
    }

    // Calculate current amount paid
    const currentPaid = (bill.payments || []).reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
    const payableTotal = Number(bill.totalAmount) || 0;
    const remainingBeforeThisRequest = Math.max(0, Math.round((payableTotal - currentPaid) * 100) / 100);

    // Filter and validate entries (Reject empty, non-positive, NaN, or invalid methods)
    let newEntriesSum = 0;
    const validatedNewEntries = [];
    const validMethods = ['Cash', 'UPI', 'Card', 'Netbanking', 'Online', 'Online UPI', 'Credit/Debit Card', 'Online (UPI/Card)'];

    // Generate a single Collection ID grouping this multimode payment operation
    const collectionId = `PC-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

    for (let i = 0; i < paymentEntries.length; i++) {
      const entry = paymentEntries[i];
      if (!entry || typeof entry !== 'object') {
        return res.status(400).json({ error: `Payment entry #${i + 1} is empty or invalid` });
      }

      const amt = Number(entry.amount);
      if (isNaN(amt) || amt <= 0) {
        return res.status(400).json({ error: `Payment entry #${i + 1} (${entry.method || 'Unknown'}) must have an amount greater than 0` });
      }
      if (!entry.method || !validMethods.includes(entry.method)) {
        return res.status(400).json({ error: `Invalid payment method: ${entry.method}. Allowed: ${validMethods.join(', ')}` });
      }

      newEntriesSum += amt;
      validatedNewEntries.push({
        collectionId,
        paymentId: entry.paymentId || `PAY-${Date.now()}-${Math.floor(Math.random() * 1000)}-${i + 1}`,
        amount: Math.round(amt * 100) / 100,
        method: entry.method,
        source: entry.source || 'Counter',
        transactionRef: (entry.transactionRef || '').trim(),
        recordedBy: req.user.staff_id || req.user.id || 'receptionist',
        recordedByName: req.user.name || '',
        recordedAt: new Date(),
        notes: (entry.notes || notes || '').trim(),
        requestId: requestId || null
      });
    }

    newEntriesSum = Math.round(newEntriesSum * 100) / 100;

    // Overpayment Protection: Total Paid cannot exceed Payable Amount
    if (newEntriesSum > remainingBeforeThisRequest + 0.001) {
      return res.status(400).json({
        error: `Overpayment not allowed. Remaining due is ₹${remainingBeforeThisRequest.toFixed(2)}, but total entered is ₹${newEntriesSum.toFixed(2)}`
      });
    }

    // Atomic application: All entries are appended together to bill.payments
    if (!bill.payments) bill.payments = [];
    bill.payments.push(...validatedNewEntries);

    // Set paymentMethod summary showing all active methods (e.g. 'Cash + UPI + Card')
    const uniqueMethods = [...new Set(bill.payments.map(p => p.method))];
    bill.paymentMethod = uniqueMethods.join(' + ');

    // Save triggers the pre-save hook to recalculate amountPaid, balanceDue, and status atomically
    await bill.save();

    // Sync appointment status and paymentStatus
    if (bill.appointmentId) {
      const Appointment = require('../models/Appointment');
      const appt = await Appointment.findById(bill.appointmentId);
      if (appt) {
        if (bill.status === 'Paid') {
          appt.paymentStatus = 'Paid';
          if (appt.status === 'Pending' || appt.status === 'Pending Approval') {
            appt.status = 'Confirmed';
          }
        } else if (bill.status === 'Partially Paid') {
          appt.paymentStatus = 'Partially Paid';
        }
        await appt.save();
      }
    }

    // Audit Log for receptionist payment recording
    const AuditLog = require('../models/AuditLog');
    await AuditLog.create({
      tenantId: req.tenantId,
      actor: req.user.staff_id || req.user.id || 'system',
      actorName: req.user.name || '',
      actorRole: req.user.role || 'receptionist',
      action: 'payment_collected',
      target: String(bill._id),
      metadata: {
        collectionId,
        newPayments: validatedNewEntries,
        totalPaid: bill.amountPaid,
        balanceDue: bill.balanceDue,
        status: bill.status,
        patientName: bill.patientId?.name || 'Unknown Patient'
      }
    }).catch(err => console.error("Audit log error for payment:", err));

    const io = req.app.get("io");
    if (io) {
      io.to(req.tenantId).emit("data_changed", { type: "billing" });
      io.to(req.tenantId).emit("data_changed", { type: "appointments" });
      if (bill.tenantId && bill.tenantId !== req.tenantId) {
        io.to(bill.tenantId).emit("data_changed", { type: "billing" });
        io.to(bill.tenantId).emit("data_changed", { type: "appointments" });
      }
    }

    res.json({
      success: true,
      message: bill.status === 'Paid' ? 'Payment completed in full!' : 'Partial payment recorded successfully.',
      collectionId,
      bill
    });
  } catch (error) {
    console.error("Collect payment error:", error);
    res.status(500).json({ error: error.message || 'Payment processing failed' });
  }
});

// Update bill (scoped to tenant)
router.put('/:id', async (req, res) => {
  const { patientId, appointmentId, items, totalAmount, status, paymentMethod, discountPercent, discountAmount, originalAmount, discountReason, payments } = req.body;
  try {
    const bill = await Billing.findOne({ _id: req.params.id, tenantId: req.tenantId });
    if (!bill) return res.status(404).json({ error: 'Bill not found' });

    if (patientId !== undefined) bill.patientId = patientId;
    if (appointmentId !== undefined) bill.appointmentId = appointmentId;
    if (items !== undefined) bill.items = items;
    if (totalAmount !== undefined) bill.totalAmount = totalAmount;
    if (discountPercent !== undefined) bill.discountPercent = discountPercent;
    if (discountAmount !== undefined) bill.discountAmount = discountAmount;
    if (originalAmount !== undefined) bill.originalAmount = originalAmount;
    if (discountReason !== undefined) bill.discountReason = discountReason;

    if (Array.isArray(payments) && payments.length > 0) {
      bill.payments = payments;
      const uniqueMethods = [...new Set(payments.map(p => p.method))];
      bill.paymentMethod = uniqueMethods.join(' + ');
    } else if (paymentMethod !== undefined) {
      bill.paymentMethod = paymentMethod;
      if (status === 'Paid' && (!bill.payments || bill.payments.length === 0)) {
        bill.payments = [{
          paymentId: `PAY-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
          amount: bill.totalAmount,
          method: paymentMethod,
          source: 'Counter',
          recordedBy: req.user.staff_id || req.user.id || 'receptionist',
          recordedByName: req.user.name || '',
          recordedAt: new Date()
        }];
      }
    }

    if (status !== undefined) bill.status = status;

    await bill.save();

    // Sync appointment paymentStatus
    if (bill.appointmentId) {
      const Appointment = require('../models/Appointment');
      const appt = await Appointment.findById(bill.appointmentId);
      if (appt) {
        if (bill.status === 'Paid') {
          appt.paymentStatus = 'Paid';
          if (appt.status === 'Pending' || appt.status === 'Pending Approval') {
            appt.status = 'Confirmed';
          }
        } else if (bill.status === 'Partially Paid') {
          appt.paymentStatus = 'Partially Paid';
        }
        await appt.save();
      }
    }

    // If discount was applied, create Audit Log
    if (discountPercent !== undefined && discountPercent > 0) {
      const AuditLog = require('../models/AuditLog');
      await AuditLog.create({
        tenantId: req.tenantId,
        actor: req.user.staff_id || req.user.id || 'system',
        actorName: req.user.name || '',
        actorRole: req.user.role || 'receptionist',
        action: 'discount_applied',
        target: String(bill._id),
        metadata: {
          discountPercent,
          discountAmount: bill.discountAmount,
          originalAmount: bill.originalAmount,
          discountReason: bill.discountReason,
          patientName: bill.patientId?.name || 'Unknown Patient'
        }
      }).catch(err => console.error("Audit log error for discount:", err));
    }

    const io = req.app.get("io");
    if (io) {
      io.to(req.tenantId).emit("data_changed", { type: "billing" });
      if (bill.tenantId && bill.tenantId !== req.tenantId) {
        io.to(bill.tenantId).emit("data_changed", { type: "billing" });
      }
    }
    res.json(bill);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

module.exports = router;
