const express = require('express');
const mongoose = require('mongoose');
const Appointment = require('../models/Appointment');
const Patient = require('../models/Patient');
const User = require('../models/User');
const { verifyToken } = require('../middleware/authMiddleware');
const router = express.Router();



router.use(verifyToken);

// Get all appointments (optionally filter by doctorId or patientId, scoped to tenant)
router.get('/', async (req, res) => {
  try {


    const query = {};
    let patientIds = [];
    
    // Cross-tenant patient scope: if requesting user is patient, find all their appointments across all registered patient and user records
    if (req.user && req.user.role === 'patient') {
      const phoneRaw = req.user.staff_id ? req.user.staff_id.split('_')[0] : null;
      const userPhone = req.user.phone || phoneRaw;
      const userEmail = req.user.email;

      // 1. Find all related user IDs for this patient across tenants (matching email or phone)
      const orConditionsUser = [];
      if (userEmail) orConditionsUser.push({ email: userEmail });
      if (userPhone) orConditionsUser.push({ phone: userPhone }, { staff_id: new RegExp('^' + userPhone) });
      
      let relatedUserIds = [req.user.id ? req.user.id.toString() : null].filter(Boolean);
      if (orConditionsUser.length > 0) {
        const relatedUsers = await User.find({ $or: orConditionsUser }).select('_id');
        relatedUsers.forEach(u => relatedUserIds.push(u._id.toString()));
      }

      // 2. Find all Patient records matching any related userId, or user's phone, email, contact, or staff_id
      const orConditionsPatient = [
        { userId: { $in: relatedUserIds.map(id => mongoose.Types.ObjectId.isValid(id) ? new mongoose.Types.ObjectId(id) : id) } }
      ];
      if (req.user.staff_id) orConditionsPatient.push({ contact: req.user.staff_id });
      if (phoneRaw) orConditionsPatient.push({ contact: phoneRaw });
      if (userPhone) orConditionsPatient.push({ contact: userPhone });
      if (userEmail) orConditionsPatient.push({ email: userEmail });

      const patientDocs = await Patient.find({ $or: orConditionsPatient });
      let allIds = patientDocs.map(p => p._id.toString());
      relatedUserIds.forEach(uid => allIds.push(uid));
      allIds = [...new Set(allIds)];

      const patientObjectIds = allIds.filter(id => mongoose.Types.ObjectId.isValid(id)).map(id => new mongoose.Types.ObjectId(id));
      const allPatientMatchers = [...allIds, ...patientObjectIds];

      if (req.query.doctorId) {
        query.doctorId = req.query.doctorId;
      } else {
        query.patientId = { $in: allPatientMatchers };
      }
    } else {
      query.tenantId = req.tenantId;
      if (req.query.doctorId) query.doctorId = req.query.doctorId;
      if (req.query.patientId) query.patientId = req.query.patientId;

      // Server-side enforcement: if the requesting user is a doctor and no
      // explicit doctorId filter was provided, automatically scope to their
      // own appointments so one doctor cannot see another's appointments.
      // However, if the doctor has receptionist coverage, they must be allowed
      // to view all appointments for the clinic.
      if (req.user && req.user.role === 'doctor' && !req.query.doctorId) {
        let hasReceptionistCoverage = false;
        try {
          const RoleCoverage = require('../models/RoleCoverage');
          const coverage = await RoleCoverage.findOne({ tenantId: req.tenantId });
          if (coverage && coverage.state) {
            const userName = req.user.name || '';
            const matchKey = Object.keys(coverage.state).find(
              k => k.toLowerCase().trim() === userName.toLowerCase().trim()
            );
            const staffPerms = matchKey ? coverage.state[matchKey] : null;
            if (staffPerms) {
              const now = new Date();
              hasReceptionistCoverage = Object.keys(staffPerms).some(permId => {
                const perm = staffPerms[permId];
                if (perm && perm.on && permId.startsWith('rc-')) {
                  if (perm.type === 'temp' && perm.expiresAt) {
                    return new Date(perm.expiresAt) > now;
                  }
                  return true;
                }
                return false;
              });
            }
          }
        } catch (err) {
          console.error("Failed to check receptionist coverage in appointments route:", err);
        }

        if (!hasReceptionistCoverage) {
          query.doctorId = req.user.id;
        }
      }
    }

    const appointments = await Appointment.find(query)
      .populate('patientId', 'name contact age ageMonths ageDays gender email address bloodGroup allergies currentMedications medicalHistory avatar referredBy patientId')
      .populate('doctorId', 'name role specialty consultationFee')
      .sort({ date: 1, time: 1 });

    // Join billingStatus from Billing records
    const Billing = require('../models/Billing');
    const appointmentIds = appointments.map(a => a._id);
    const bills = await Billing.find({ appointmentId: { $in: appointmentIds } });
    
    const billingMap = {};
    bills.forEach(b => {
      if (b.appointmentId) {
        const key = b.appointmentId.toString();
        // Prefer 'Paid' status if any bill for this appointment is Paid
        if (!billingMap[key] || b.status === 'Paid') {
          billingMap[key] = b.status;
        }
      }
    });

    let appsWithBilling = appointments.map(app => {
      const appObj = app.toObject();
      appObj.billingStatus = billingMap[app._id.toString()] || 'Unpaid';
      return appObj;
    });

    if (req.user && req.user.role === 'patient' && req.query.doctorId) {
      appsWithBilling = appsWithBilling.map(app => {
        const appPatientIdStr = String(app.patientId?._id || app.patientId);
        const isOwn = patientIds.includes(appPatientIdStr);
        if (!isOwn) {
          app.patientId = null;
          app.reason = 'Reserved';
          app.notes = '';
          app.diagnosis = '';
        }
        return app;
      });
    }

    res.json(appsWithBilling);
  } catch (error) {
    console.error("Get appointments error:", error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

const cleanTimeSlot = (timeStr) => {
  if (!timeStr) return '';
  return timeStr.split(/\(Limit:/i)[0].trim();
};

const checkSlotCapacity = async (doctorId, date, time, excludeAppointmentId = null) => {
  const User = require('../models/User');
  const doctorObj = await User.findById(doctorId);
  if (!doctorObj) {
    throw new Error('Doctor not found');
  }

  let limit = doctorObj.max_slots || 10;
  const targetTimeClean = cleanTimeSlot(time).toLowerCase();

  if (doctorObj.doctorSlots && doctorObj.doctorSlots.length > 0) {
    const matchingSlot = doctorObj.doctorSlots.find(s => {
      const sClean = cleanTimeSlot(s).toLowerCase();
      return sClean === targetTimeClean;
    });

    if (matchingSlot) {
      const match = matchingSlot.match(/\(Limit:\s*(\d+)\)/i);
      if (match) {
        limit = parseInt(match[1], 10);
      }
    }
  }

  const targetDate = new Date(date);
  const startOfDay = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate());
  const endOfDay = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate(), 23, 59, 59, 999);

  const query = {
    doctorId,
    status: { $ne: 'Cancelled' },
    date: { $gte: startOfDay, $lte: endOfDay }
  };
  if (excludeAppointmentId) {
    query._id = { $ne: excludeAppointmentId };
  }

  const appointments = await Appointment.find(query);

  const bookedCount = appointments.filter(app => {
    return cleanTimeSlot(app.time).toLowerCase() === targetTimeClean;
  }).length;

  if (bookedCount >= limit) {
    throw new Error(`This slot is fully booked. Slot limit is ${limit} patients.`);
  }
};

// Create an appointment (scoped to tenant)
router.post('/', async (req, res) => {
  const { patientId, doctorId, date, time, status, reason, notes, diagnosis, regNo } = req.body;
  try {
    const User = require('../models/User');
    const doctorObj = await User.findById(doctorId);
    if (!doctorObj) {
      return res.status(404).json({ error: 'Doctor not found' });
    }

    // Validate slot capacity limit
    if (doctorId && date && time) {
      await checkSlotCapacity(doctorId, date, time);
    }

    const resolvedTenantId = doctorObj.tenantId || req.tenantId;

    // Resolve / provision Patient record in target tenant
    const Patient = require('../models/Patient');
    let targetPatientId = patientId;
    const currentPatient = await Patient.findById(patientId);
    if (currentPatient && currentPatient.tenantId !== resolvedTenantId) {
      let targetPatient = await Patient.findOne({
        contact: currentPatient.contact,
        tenantId: resolvedTenantId
      });
      if (!targetPatient) {
        targetPatient = await Patient.create({
          tenantId: resolvedTenantId,
          name: currentPatient.name,
          age: currentPatient.age,
          gender: currentPatient.gender,
          contact: currentPatient.contact,
          email: currentPatient.email,
          address: currentPatient.address,
          bloodGroup: currentPatient.bloodGroup,
          allergies: currentPatient.allergies,
          currentMedications: currentPatient.currentMedications || '',
          medicalHistory: currentPatient.medicalHistory,
          avatar: currentPatient.avatar
        });

        const Consent = require('../models/Consent');
        await Consent.create({
          tenantId: resolvedTenantId,
          patientId: targetPatient._id,
          purposes: {
            treatment: true,
            insurance: true,
            research: false
          },
          status: 'Active',
          signature: 'Auto-consented during offline appointment booking',
          ipAddress: '127.0.0.1',
          userAgent: 'System Automated Workflow'
        });
      }
      targetPatientId = targetPatient._id;
    }

    const appointmentSource = req.body.source || (req.user && req.user.role === 'patient' ? 'Online' : 'Walk-In');

    const appointment = await Appointment.create({
      tenantId: resolvedTenantId,
      patientId: targetPatientId,
      doctorId: doctorId || null,
      date,
      time,
      status: status || 'Pending',
      reason,
      notes,
      diagnosis,
      regNo,
      source: appointmentSource
    });

    // Auto-dispatch Lab Request if appointment involves lab tests
    let labRequest = null;
    if (req.body.testName || req.body.appointmentType === 'Lab Test') {
      const LabRequest = require('../models/LabRequest');
      labRequest = await LabRequest.create({
        tenantId: resolvedTenantId,
        appointmentId: appointment._id,
        patientId: targetPatientId,
        doctorId: doctorId && doctorId !== 'null' ? doctorId : null,
        testName: req.body.testName || reason || 'Diagnostic Lab Test',
        notes: notes || '',
        status: 'Pending'
      });
    }

    // Auto-create Billing invoice/receipt if amount or payment details are provided
    let bill = null;
    if (req.body.amount !== undefined || req.body.paymentMode || req.body.testName) {
      const Billing = require('../models/Billing');
      const amount = Number(req.body.amount) || 0;
      const tax = Number(req.body.tax) || 0;
      const discount = Number(req.body.discount) || 0;
      const total = Math.max(0, amount + tax - discount);
      bill = await Billing.create({
        tenantId: resolvedTenantId,
        appointmentId: appointment._id,
        patientId: targetPatientId,
        amount,
        tax,
        discount,
        total,
        paymentMode: req.body.paymentMode || 'Cash',
        status: req.body.paymentStatus || 'Paid',
        items: req.body.items || [{ description: req.body.testName || reason || 'Lab Test Fee', amount }]
      });
    }

    const io = req.app.get("io");
    if (io) {
      const tenantKey = String(resolvedTenantId).trim().toLowerCase();
      io.to(tenantKey).emit("data_changed", { type: "appointments" });
      if (labRequest) {
        io.to(tenantKey).emit("data_changed", { type: "labs" });
      }
      if (bill) {
        io.to(tenantKey).emit("data_changed", { type: "billing" });
      }
    }

    const appObj = appointment.toObject();
    appObj.labRequest = labRequest;
    appObj.bill = bill;

    res.status(201).json(appObj);
  } catch (error) {
    console.error("Create Appointment Error:", error);
    res.status(400).json({ error: error.message });
  }
});

// Update appointment status or add notes/diagnosis (scoped to tenant)
router.put('/:id', async (req, res) => {
  const { patientId, doctorId, date, time, status, reason, notes, diagnosis } = req.body;
  try {
    const currentAppointment = await Appointment.findById(req.params.id);
    if (!currentAppointment) {
      return res.status(404).json({ error: 'Appointment not found' });
    }

    const checkDoctorId = doctorId || currentAppointment.doctorId;
    const checkDate = date || currentAppointment.date;
    const checkTime = time || currentAppointment.time;
    const checkStatus = status || currentAppointment.status;

    const isCancelled = checkStatus === 'Cancelled';
    const hasDetailsChanged = 
      String(checkDoctorId) !== String(currentAppointment.doctorId) ||
      new Date(checkDate).toDateString() !== new Date(currentAppointment.date).toDateString() ||
      cleanTimeSlot(checkTime).toLowerCase() !== cleanTimeSlot(currentAppointment.time).toLowerCase() ||
      (currentAppointment.status === 'Cancelled' && !isCancelled);

    if (!isCancelled && hasDetailsChanged) {
      await checkSlotCapacity(checkDoctorId, checkDate, checkTime, req.params.id);
    }

    const updateObj = {};
    if (patientId !== undefined) updateObj.patientId = patientId;
    if (doctorId !== undefined) updateObj.doctorId = doctorId;
    if (date !== undefined) updateObj.date = date;
    if (time !== undefined) updateObj.time = time;
    if (status !== undefined) updateObj.status = status;
    if (reason !== undefined) updateObj.reason = reason;
    if (notes !== undefined) updateObj.notes = notes;
    if (diagnosis !== undefined) updateObj.diagnosis = diagnosis;

    const appointment = await Appointment.findOneAndUpdate(
      { _id: req.params.id }, 
      updateObj, 
      { returnDocument: 'after' }
    );
    if (!appointment) return res.status(404).json({ error: 'Appointment not found' });
    const io = req.app.get("io");
    if (io) {
      io.to(String(req.tenantId).trim().toLowerCase()).emit("data_changed", { type: "appointments" });
      if (appointment.tenantId && appointment.tenantId !== req.tenantId) {
        io.to(String(appointment.tenantId).trim().toLowerCase()).emit("data_changed", { type: "appointments" });
      }
    }
    res.json(appointment);
  } catch (error) {
    console.error("PUT Appointment Error:", error);
    res.status(400).json({ error: error.message });
  }
});

// Delete an appointment (scoped to tenant)
router.delete('/:id', async (req, res) => {
  try {
    const appointment = await Appointment.findOneAndDelete({ _id: req.params.id });
    if (!appointment) return res.status(404).json({ error: 'Appointment not found' });
    const io = req.app.get("io");
    if (io) {
      io.to(String(req.tenantId).trim().toLowerCase()).emit("data_changed", { type: "appointments" });
      if (appointment.tenantId && appointment.tenantId !== req.tenantId) {
        io.to(String(appointment.tenantId).trim().toLowerCase()).emit("data_changed", { type: "appointments" });
      }
    }
    res.json({ message: 'Appointment deleted' });
  } catch (error) {
    console.error("Delete appointment error:", error);
    res.status(500).json({ error: 'Internal server error' });
  }
});


// Approve an appointment request, dynamically generate bill (with 1-time Reg fee if applicable), and request payment
router.put('/:id/approve', async (req, res) => {
  try {
    const appointment = await Appointment.findById(req.params.id)
      .populate('patientId')
      .populate('doctorId');
    if (!appointment) return res.status(404).json({ error: 'Appointment not found' });

    const User = require('../models/User');
    const Billing = require('../models/Billing');
    const doctorObj = appointment.doctorId;

    // 1. Check if patient has already been charged the One-Time Registration Fee in this tenant
    const existingRegBill = await Billing.findOne({
      tenantId: appointment.tenantId,
      patientId: appointment.patientId?._id || appointment.patientId,
      'items.description': { $regex: /Registration Fee/i }
    });

    const billItems = [];
    let totalAmount = 0;

    // If first time registering / no previous registration fee charged, add 1-Time OPD Reg Fee
    if (!existingRegBill) {
      const regFee = 50; // Standard 1-time OPD registration charge
      billItems.push({
        description: 'One-Time OPD Registration Fee',
        amount: regFee
      });
      totalAmount += regFee;
    }

    const consultFee = (doctorObj && doctorObj.consultationFee !== undefined && doctorObj.consultationFee !== null && !isNaN(doctorObj.consultationFee)) ? Number(doctorObj.consultationFee) : 0;
    billItems.push({
      description: `Doctor Consultation Fee (${doctorObj?.name || 'Doctor'})`,
      amount: consultFee
    });
    totalAmount += consultFee;

    // Create or update existing Unpaid Billing invoice
    let bill = await Billing.findOne({ appointmentId: appointment._id });
    if (!bill) {
      bill = await Billing.create({
        tenantId: appointment.tenantId,
        patientId: appointment.patientId?._id || appointment.patientId,
        appointmentId: appointment._id,
        items: billItems,
        totalAmount,
        status: 'Unpaid',
        paymentMethod: 'Online'
      });
    } else {
      bill.items = billItems;
      bill.totalAmount = totalAmount;
      bill.status = 'Unpaid';
      await bill.save();
    }

    appointment.status = 'Approved';
    appointment.paymentStatus = 'Pending';
    await appointment.save();

    const io = req.app.get("io");
    if (io) {
      io.to(String(appointment.tenantId).trim().toLowerCase()).emit("data_changed", { type: "appointments" });
      io.to(String(appointment.tenantId).trim().toLowerCase()).emit("data_changed", { type: "billing" });
    }

    res.json({
      success: true,
      message: 'Appointment approved and invoice created with payment request.',
      appointment,
      bill
    });
  } catch (error) {
    console.error("Approve appointment error:", error);
    res.status(500).json({ error: error.message || 'Failed to approve appointment' });
  }
});

// Reject an appointment request
router.put('/:id/reject', async (req, res) => {
  try {
    const appointment = await Appointment.findById(req.params.id);
    if (!appointment) return res.status(404).json({ error: 'Appointment not found' });

    appointment.status = 'Cancelled';
    await appointment.save();

    const io = req.app.get("io");
    if (io) {
      io.to(String(appointment.tenantId).trim().toLowerCase()).emit("data_changed", { type: "appointments" });
    }

    res.json({
      success: true,
      message: 'Appointment request has been rejected.',
      appointment
    });
  } catch (error) {
    console.error("Reject appointment error:", error);
    res.status(500).json({ error: error.message || 'Failed to reject appointment' });
  }
});

// Pay & Confirm appointment from Patient Portal
router.post('/:id/pay', async (req, res) => {
  try {
    const appointment = await Appointment.findById(req.params.id);
    if (!appointment) return res.status(404).json({ error: 'Appointment not found' });

    const Billing = require('../models/Billing');
    const paymentMethod = req.body.paymentMethod || 'Online (UPI/Card)';
    
    // Find or create bill
    let bill = await Billing.findOne({ appointmentId: appointment._id });
    if (bill) {
      bill.status = 'Paid';
      bill.paymentMethod = paymentMethod;
      await bill.save();
    }

    appointment.status = 'Confirmed';
    appointment.paymentStatus = 'Paid';
    await appointment.save();

    const io = req.app.get("io");
    if (io) {
      io.to(String(appointment.tenantId).trim().toLowerCase()).emit("data_changed", { type: "appointments" });
      io.to(String(appointment.tenantId).trim().toLowerCase()).emit("data_changed", { type: "billing" });
    }

    res.json({
      success: true,
      message: 'Payment completed successfully! Appointment is now confirmed.',
      appointment,
      bill
    });
  } catch (error) {
    console.error("Pay appointment error:", error);
    res.status(500).json({ error: error.message || 'Payment processing failed' });
  }
});

// Reception Check-in endpoint: server-authoritative token generation & queue entry
router.post('/:id/check-in', async (req, res) => {
  try {
    const appointment = await Appointment.findById(req.params.id);
    if (!appointment) {
      return res.status(404).json({ error: 'Appointment not found' });
    }

    // Ensure tenant isolation
    const resolvedTenant = appointment.tenantId || req.tenantId;

    // Idempotency: If patient already has a token, return existing token without reallocating
    if (appointment.tokenNumber !== null && appointment.tokenNumber !== undefined) {
      return res.json({
        success: true,
        message: 'Patient is already checked in.',
        alreadyCheckedIn: true,
        appointment,
        token: {
          tokenNumber: appointment.tokenNumber,
          tokenDisplay: appointment.tokenDisplay || String(appointment.tokenNumber),
          tokenDate: appointment.tokenDate,
          tokenDoctorId: appointment.tokenDoctorId,
          tokenSlotId: appointment.tokenSlotId,
          tokenAssignedAt: appointment.tokenAssignedAt,
          queueStatus: appointment.queueStatus
        }
      });
    }

    if (!appointment.doctorId) {
      return res.status(400).json({ error: 'Cannot check in an appointment without an assigned doctor' });
    }

    const { allocateDoctorToken } = require('../utils/queueEngine');

    // Server-authoritative atomic token allocation
    const tokenResult = await allocateDoctorToken({
      tenantId: resolvedTenant,
      doctorId: appointment.doctorId,
      date: appointment.date,
      time: appointment.time
    });

    appointment.tokenNumber = tokenResult.tokenNumber;
    appointment.tokenDisplay = tokenResult.tokenDisplay;
    appointment.tokenDate = tokenResult.tokenDate;
    appointment.tokenDoctorId = tokenResult.tokenDoctorId;
    appointment.tokenSlotId = tokenResult.tokenSlotId;
    appointment.tokenAssignedAt = tokenResult.tokenAssignedAt;
    appointment.queueStatus = 'Waiting';

    if (appointment.status !== 'Completed' && appointment.status !== 'Cancelled') {
      appointment.status = 'In Progress';
    }

    await appointment.save();

    const io = req.app.get("io");
    if (io) {
      const tenantKey = String(resolvedTenant).trim().toLowerCase();
      io.to(tenantKey).emit("data_changed", {
        type: "appointments",
        subType: "doctor_queue",
        doctorId: appointment.doctorId,
        date: tokenResult.tokenDate,
        lastIssuedToken: tokenResult.tokenNumber
      });
    }

    res.json({
      success: true,
      message: 'Patient checked in successfully and token generated.',
      appointment,
      token: tokenResult
    });
  } catch (error) {
    console.error("Check-in error:", error);
    res.status(400).json({ error: error.message || 'Check-in failed' });
  }
});

// Complete doctor consultation and advance live queue to next eligible patient
router.post('/:id/complete-consultation', async (req, res) => {
  try {
    const appointment = await Appointment.findById(req.params.id);
    if (!appointment) {
      return res.status(404).json({ error: 'Appointment not found' });
    }

    const resolvedTenant = String(req.tenantId || appointment.tenantId || 'city_hospital').trim().toLowerCase();
    const doctorId = appointment.doctorId;

    if (!doctorId) {
      return res.status(400).json({ error: 'Appointment does not have an assigned doctor' });
    }

    const { advanceDoctorQueue } = require('../utils/queueEngine');

    const result = await advanceDoctorQueue({
      tenantId: resolvedTenant,
      doctorId,
      appointmentId: appointment._id
    });

    const io = req.app.get("io");
    if (io) {
      io.to(resolvedTenant).emit("data_changed", {
        type: "appointments",
        subType: "doctor_queue",
        action: "queue_advanced",
        doctorId,
        date: result.queueState.date,
        currentToken: result.queueState.currentToken,
        currentAppointmentId: result.queueState.currentAppointmentId,
        nextToken: result.queueState.nextToken,
        waitingCount: result.queueState.waitingCount
      });
    }

    res.json({
      success: true,
      message: 'Consultation completed and live queue advanced.',
      appointment: result.completedAppointment,
      queue: result.queueState
    });
  } catch (error) {
    console.error("Complete consultation error:", error);
    res.status(400).json({ error: error.message || 'Failed to complete consultation' });
  }
});

// Get live doctor queue state and slot configuration
router.get('/doctor-queue/:doctorId', async (req, res) => {
  try {
    const { doctorId } = req.params;
    const User = require('../models/User');
    const doctorObj = await User.findById(doctorId);
    if (!doctorObj) {
      return res.status(404).json({ error: 'Doctor not found' });
    }

    const tenantId = req.tenantId || doctorObj.tenantId || 'city_hospital';
    const dateInput = req.query.date || new Date();
    const { normalizeDateString, getDoctorSlotRanges, getDoctorQueueState } = require('../utils/queueEngine');
    const dateStr = normalizeDateString(dateInput);

    const patientToken = req.query.patientToken || null;
    const slotRanges = getDoctorSlotRanges(doctorObj);
    const queueState = await getDoctorQueueState(tenantId, doctorId, dateStr, patientToken);

    const isPatientRole = req.user && req.user.role === 'patient';

    res.json({
      tenantId,
      doctorId,
      doctorName: doctorObj.name,
      specialty: doctorObj.specialty || '',
      date: dateStr,
      currentToken: queueState.currentToken,
      currentAppointmentId: isPatientRole ? undefined : queueState.currentAppointmentId,
      currentPatient: isPatientRole ? undefined : queueState.currentPatient,
      nextToken: queueState.nextToken,
      waitingCount: queueState.waitingCount,
      patientsAhead: queueState.patientsAhead,
      lastIssuedToken: queueState.lastIssuedToken,
      slotRanges,
      slotCounters: queueState.slotCounters || {},
      queueAppointments: isPatientRole ? undefined : (queueState.queueAppointments || [])
    });
  } catch (error) {
    console.error("Get doctor queue error:", error);
    res.status(500).json({ error: error.message || 'Failed to get doctor queue state' });
  }
});

module.exports = router;

