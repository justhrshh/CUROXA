const express = require('express');
const mongoose = require('mongoose');
const Appointment = require('../models/Appointment');
const Patient = require('../models/Patient');
const User = require('../models/User');
const { verifyToken } = require('../middleware/authMiddleware');
const { checkDoctorClinicalMode } = require('../middleware/subscriptionMiddleware');
const router = express.Router();

router.use(verifyToken);
router.use(checkDoctorClinicalMode);

// Get all appointments (optionally filter by doctorId or patientId, scoped to tenant)
router.get('/', async (req, res) => {
  try {
    // Auto-cancel past appointments where patient didn't check in on the day of appointment
    try {
      const now = new Date();
      const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      await Appointment.updateMany(
        {
          date: { $lt: startOfToday },
          tokenNumber: null,
          status: { $nin: ['Completed', 'Cancelled', 'Prescription Pending'] }
        },
        {
          $set: {
            status: 'Cancelled',
            notes: 'Auto-cancelled: Patient did not check in on appointment day'
          }
        }
      );
    } catch (autoCancelErr) {
      console.error("Auto-cancel sweep error:", autoCancelErr);
    }

    const query = {};
    let patientIds = [];
    
    // Cross-tenant patient scope: if requesting user is patient, find all their appointments across all registered patient and user records
    if (req.user && req.user.role === 'patient') {
      let userPhone = req.user.phone;
      let userEmail = req.user.email;

      // Safe database fallback for already-issued JWTs that omitted email or phone
      if ((!userEmail || !userPhone) && (req.user.userId || req.user.id)) {
        try {
          const fallbackUser = await User.findById(req.user.userId || req.user.id).select('email phone').lean();
          if (fallbackUser) {
            userEmail = userEmail || fallbackUser.email;
            userPhone = userPhone || fallbackUser.phone;
          }
        } catch (dbErr) {
          console.warn('[APPOINTMENTS] User fallback lookup warning:', dbErr.message);
        }
      }

      const phoneRaw = req.user.staff_id ? req.user.staff_id.split('_')[0] : null;
      userPhone = userPhone || phoneRaw;

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
      .populate('patientId', 'name contact age ageMonths ageDays gender email address bloodGroup allergies currentMedications medicalHistory avatar referredBy patientId uhId')
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
  const { patientId, doctorId, date, time, status, reason, notes, diagnosis, regNo, visitEpisodeId, parentAppointmentId } = req.body;
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
        const { resolveOrCreateUhid, generateHospitalPatientId } = require('../utils/identifierEngine');
        const targetUhid = currentPatient.uhId || await resolveOrCreateUhid({
          contact: currentPatient.contact,
          name: currentPatient.name,
          email: currentPatient.email,
          abhaId: currentPatient.abhaId
        });
        const targetHospitalPatientId = await generateHospitalPatientId(resolvedTenantId);

        targetPatient = await Patient.create({
          tenantId: resolvedTenantId,
          uhId: targetUhid,
          patientId: targetHospitalPatientId,
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

    // Resolve Visit Episode Context
    let resolvedEpisodeId = visitEpisodeId || null;
    let resolvedParentAppointmentId = parentAppointmentId || null;

    if (resolvedParentAppointmentId) {
      const parentAppt = await Appointment.findById(resolvedParentAppointmentId);
      if (parentAppt) {
        if (!resolvedEpisodeId) {
          resolvedEpisodeId = parentAppt.visitEpisodeId || parentAppt._id.toString();
          if (!parentAppt.visitEpisodeId) {
            parentAppt.visitEpisodeId = resolvedEpisodeId;
            await parentAppt.save();
          }
        }
      }
    }

    // CRITICAL REQUIREMENT 6: SAME DOCTOR ADD-ON IS NOT ALLOWED
    // If this appointment belongs to a visit episode (Add Appointment flow), verify no active appointment with the same doctor exists in this episode
    if (resolvedEpisodeId) {
      const existingEpisodeAppointments = await Appointment.find({
        tenantId: resolvedTenantId,
        visitEpisodeId: resolvedEpisodeId,
        status: { $ne: 'Cancelled' }
      });
      const sameDoctorFound = existingEpisodeAppointments.some(
        app => String(app.doctorId) === String(doctorId)
      );
      if (sameDoctorFound) {
        return res.status(400).json({
          error: 'Cannot book multiple appointments with the same doctor in a single visit episode.'
        });
      }
    } else {
      // Fresh appointment flow: assign a brand-new visitEpisodeId
      resolvedEpisodeId = new mongoose.Types.ObjectId().toString();
    }

    const appointmentSource = req.body.source || (req.user && req.user.role === 'patient' ? 'Online' : 'Walk-In');

    // CRITICAL REQUIREMENT 4: Do NOT generate Visit ID during appointment booking
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
      source: appointmentSource,
      visitEpisodeId: resolvedEpisodeId,
      parentAppointmentId: resolvedParentAppointmentId,
      visitId: null, // Left null until check-in
      visitRef: null
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

    // Idempotency: If patient already has a token, return existing token and visitId without reallocating
    if (appointment.tokenNumber !== null && appointment.tokenNumber !== undefined) {
      return res.json({
        success: true,
        message: 'Patient is already checked in.',
        alreadyCheckedIn: true,
        appointment,
        visitId: appointment.visitId,
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

    // Ensure check-in is not permitted for future-dated appointments (anytime check-in allowed on scheduled appointment date)
    if (appointment.date) {
      const { normalizeDateString } = require('../utils/queueEngine');
      const todayStr = normalizeDateString(new Date());
      const apptDateStr = normalizeDateString(appointment.date);
      if (apptDateStr > todayStr) {
        return res.status(400).json({
          error: `Check-in is only available on the scheduled appointment date (${apptDateStr}).`
        });
      }
    }

    // Resolve or create Visit Episode & Visit ID
    const { generateVisitId } = require('../utils/identifierEngine');
    const Visit = require('../models/Visit');
    const Patient = require('../models/Patient');

    const episodeId = appointment.visitEpisodeId || appointment._id.toString();
    if (!appointment.visitEpisodeId) {
      appointment.visitEpisodeId = episodeId;
    }

    // Check if any appointment in this visit episode already has a visitId
    let resolvedVisitId = appointment.visitId;
    let resolvedVisitDoc = null;

    if (resolvedVisitId) {
      resolvedVisitDoc = await Visit.findOne({ tenantId: resolvedTenant, visitId: resolvedVisitId });
    } else {
      const siblingWithVisit = await Appointment.findOne({
        tenantId: resolvedTenant,
        visitEpisodeId: episodeId,
        visitId: { $ne: null }
      });
      if (siblingWithVisit && siblingWithVisit.visitId) {
        resolvedVisitId = siblingWithVisit.visitId;
        resolvedVisitDoc = await Visit.findOne({ tenantId: resolvedTenant, visitId: resolvedVisitId });
      }
    }

    // If still no Visit ID, this is the FIRST check-in for this visit episode!
    // Generate exactly ONE Visit ID for the entire visit episode.
    if (!resolvedVisitId) {
      resolvedVisitId = await generateVisitId(resolvedTenant, appointment.date);
      const patientDoc = await Patient.findById(appointment.patientId);

      resolvedVisitDoc = await Visit.create({
        tenantId: resolvedTenant,
        visitId: resolvedVisitId,
        visitEpisodeId: episodeId,
        patientId: appointment.patientId,
        uhId: patientDoc?.uhId || '',
        hospitalPatientId: patientDoc?.patientId || '',
        doctorId: appointment.doctorId,
        appointmentIds: [appointment._id],
        department: 'OPD',
        type: 'OPD',
        arrivalTimestamp: new Date(),
        chiefComplaint: appointment.reason || 'Consultation',
        status: 'Checked-in'
      });
    } else if (resolvedVisitDoc) {
      if (!resolvedVisitDoc.appointmentIds.some(id => String(id) === String(appointment._id))) {
        resolvedVisitDoc.appointmentIds.push(appointment._id);
        await resolvedVisitDoc.save();
      }
    }

    appointment.visitId = resolvedVisitId;
    appointment.visitRef = resolvedVisitDoc ? resolvedVisitDoc._id : null;

    // Associate all sibling appointments in the same visit episode with this Visit ID
    await Appointment.updateMany(
      {
        tenantId: resolvedTenant,
        visitEpisodeId: episodeId,
        visitId: null
      },
      {
        $set: {
          visitId: resolvedVisitId,
          visitRef: resolvedVisitDoc ? resolvedVisitDoc._id : null
        }
      }
    );

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

    // Determine if this newly checked-in token is the active currentToken for this doctor
    const DoctorQueue = require('../models/DoctorQueue');
    const queueDoc = await DoctorQueue.findOne({
      tenantId: String(resolvedTenant).trim().toLowerCase(),
      doctorId: appointment.doctorId,
      date: tokenResult.tokenDate
    });

    const isCurrentActive = queueDoc && queueDoc.currentToken === tokenResult.tokenNumber;

    if (isCurrentActive) {
      appointment.status = 'In Progress';
      appointment.queueStatus = 'Serving';
    } else {
      appointment.status = 'Waiting';
      appointment.queueStatus = 'Waiting';
    }

    await appointment.save();

    const { syncDoctorQueueState } = require('../utils/queueEngine');
    await syncDoctorQueueState(resolvedTenant, appointment.doctorId, tokenResult.tokenDate);

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
      io.to(tenantKey).emit("data_changed", {
        type: "visits",
        visitId: resolvedVisitId
      });
    }

    res.json({
      success: true,
      message: 'Patient checked in successfully and token generated.',
      appointment,
      token: tokenResult,
      visitId: resolvedVisitId,
      visit: resolvedVisitDoc
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

    const { normalizeDateString, advanceDoctorQueue } = require('../utils/queueEngine');
    const dateStr = appointment.tokenDate || normalizeDateString(appointment.date);
    const DoctorQueue = require('../models/DoctorQueue');
    const queueDoc = await DoctorQueue.findOne({
      tenantId: resolvedTenant,
      doctorId,
      date: dateStr
    });

    const activeCurrentToken = queueDoc ? queueDoc.currentToken : null;
    if (activeCurrentToken === null || appointment.tokenNumber !== activeCurrentToken) {
      return res.status(400).json({
        error: `Cannot complete consultation for Token #${appointment.tokenNumber}. Doctor's currently active consultation is Token #${activeCurrentToken || 'None'}.`
      });
    }

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

// Receptionist records that the physical doctor consultation has finished in offline mode
router.post('/:id/finish-consultation', async (req, res) => {
  try {
    const appointment = await Appointment.findById(req.params.id);
    if (!appointment) {
      return res.status(404).json({ error: 'Appointment not found' });
    }

    const resolvedTenant = String(req.tenantId || appointment.tenantId || 'city_hospital').trim().toLowerCase();
    
    // Server-side authorization check: Only reception or admin role
    const userRole = req.user?.role;
    if (userRole !== 'reception' && userRole !== 'receptionist' && userRole !== 'admin') {
      return res.status(403).json({ error: 'Only Receptionist or Admin can record consultation completion in offline mode' });
    }

    // Verify hospital Doctor Clinical Mode is OFFLINE
    const SuperAdminHospital = require('../models/SuperAdminHospital');
    const hospital = await SuperAdminHospital.findOne({ code: resolvedTenant });
    if (!hospital || hospital.doctorClinicalMode !== 'OFFLINE') {
      return res.status(400).json({ error: 'Consultation Finished action is only available when Doctor Clinical Mode is OFFLINE' });
    }

    const doctorId = appointment.doctorId;
    if (!doctorId) {
      return res.status(400).json({ error: 'Appointment does not have an assigned doctor' });
    }

    // Idempotency check: If already marked Prescription Pending
    if (appointment.status === 'Prescription Pending') {
      return res.json({
        success: true,
        alreadyFinished: true,
        message: 'Consultation already marked as finished (Prescription Pending).',
        appointment
      });
    }

    if (appointment.status === 'Completed' || appointment.status === 'Cancelled') {
      return res.status(400).json({ error: `Cannot finish consultation for appointment in ${appointment.status} status` });
    }

    // Must have checked in and been part of the live queue
    if (appointment.tokenNumber === null || appointment.tokenNumber === undefined) {
      return res.status(400).json({ error: 'Cannot finish consultation for an appointment that has not checked in' });
    }

    // Verify that this appointment is the doctor's currently active consultation (appointment.tokenNumber === currentToken)
    const { normalizeDateString, advanceDoctorQueue } = require('../utils/queueEngine');
    const dateStr = appointment.tokenDate || normalizeDateString(appointment.date);
    const DoctorQueue = require('../models/DoctorQueue');
    const queueDoc = await DoctorQueue.findOne({
      tenantId: resolvedTenant,
      doctorId,
      date: dateStr
    });

    const activeCurrentToken = queueDoc ? queueDoc.currentToken : null;
    if (activeCurrentToken === null || appointment.tokenNumber !== activeCurrentToken) {
      return res.status(400).json({
        error: `Cannot finish consultation for Token #${appointment.tokenNumber}. Doctor's currently active consultation is Token #${activeCurrentToken || 'None'}.`
      });
    }

    const result = await advanceDoctorQueue({
      tenantId: resolvedTenant,
      doctorId,
      appointmentId: appointment._id,
      targetStatus: 'Prescription Pending'
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
      message: 'Physical consultation finished. Appointment is now Prescription Pending.',
      appointment: result.completedAppointment,
      queue: result.queueState
    });
  } catch (error) {
    console.error("Finish consultation error:", error);
    res.status(400).json({ error: error.message || 'Failed to finish consultation' });
  }
});

// Multer storage for offline handwritten prescription pages
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const prescriptionImageStorage = multer.memoryStorage();
const uploadPrescriptionImage = multer({
  storage: prescriptionImageStorage,
  limits: { fileSize: 15 * 1024 * 1024 }, // 15MB limit per image
  fileFilter: (req, file, cb) => {
    if (file.mimetype && file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files (JPG, PNG, WebP) are allowed. PDF or documents are not supported.'));
    }
  }
});

// Upload handwritten prescription page image (offline doctor clinical mode)
router.post('/upload-prescription-image', (req, res, next) => {
  uploadPrescriptionImage.single('prescriptionPage')(req, res, (err) => {
    if (err) {
      return res.status(400).json({ error: err.message || 'Prescription image upload failed' });
    }
    next();
  });
}, async (req, res) => {
  try {
    const userRole = req.user?.role;
    if (userRole !== 'reception' && userRole !== 'receptionist' && userRole !== 'admin') {
      return res.status(403).json({ error: 'Only Receptionist or Admin can upload handwritten prescription images' });
    }

    const SuperAdminHospital = require('../models/SuperAdminHospital');
    const resolvedTenant = String(req.tenantId || 'city_hospital').trim().toLowerCase();
    const hospital = await SuperAdminHospital.findOne({ code: resolvedTenant });
    if (!hospital || hospital.doctorClinicalMode !== 'OFFLINE') {
      return res.status(400).json({ error: 'Handwritten prescription upload is only available in OFFLINE mode' });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'No prescription image file uploaded' });
    }

    const uploadsDir = path.join(__dirname, '../uploads/prescriptions');
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }

    const ext = path.extname(req.file.originalname).toLowerCase() || '.jpg';
    const safeFileName = `${resolvedTenant}_${Date.now()}_${Math.random().toString(36).substring(2, 8)}${ext}`;
    const targetPath = path.join(uploadsDir, safeFileName);
    fs.writeFileSync(targetPath, req.file.buffer);

    const fileUrl = `/uploads/prescriptions/${safeFileName}`;
    res.json({
      success: true,
      url: fileUrl,
      originalName: req.file.originalname
    });
  } catch (err) {
    console.error('Upload prescription image error:', err);
    res.status(500).json({ error: err.message || 'Failed to upload prescription image' });
  }
});

// Record offline handwritten prescription and transition appointment from Prescription Pending to Completed
router.post('/:id/offline-prescription', async (req, res) => {
  try {
    const appointment = await Appointment.findById(req.params.id);
    if (!appointment) {
      return res.status(404).json({ error: 'Appointment not found' });
    }

    const resolvedTenant = String(req.tenantId || appointment.tenantId || 'city_hospital').trim().toLowerCase();
    if (String(appointment.tenantId).trim().toLowerCase() !== resolvedTenant) {
      return res.status(403).json({ error: 'Tenant mismatch: access denied' });
    }

    // Server-side authorization check: Only reception or admin role
    const userRole = req.user?.role;
    if (userRole !== 'reception' && userRole !== 'receptionist' && userRole !== 'admin') {
      return res.status(403).json({ error: 'Only Receptionist or Admin can record offline prescriptions' });
    }

    // Verify hospital Doctor Clinical Mode is OFFLINE
    const SuperAdminHospital = require('../models/SuperAdminHospital');
    const hospital = await SuperAdminHospital.findOne({ code: resolvedTenant });
    if (!hospital || hospital.doctorClinicalMode !== 'OFFLINE') {
      return res.status(400).json({ error: 'Offline prescription upload is only available when Doctor Clinical Mode is OFFLINE' });
    }

    // Mutual exclusivity check: Cannot upload if already marked as No Prescription Provided
    if (appointment.noPrescriptionProvided) {
      return res.status(400).json({ error: 'This appointment was already marked as No Prescription Provided' });
    }

    // Idempotency: Check if prescription already exists for this appointment
    const Prescription = require('../models/Prescription');
    const existingRx = await Prescription.findOne({
      tenantId: resolvedTenant,
      appointmentId: appointment._id
    });

    if (existingRx) {
      if (appointment.status !== 'Completed') {
        appointment.status = 'Completed';
        await appointment.save();
      }
      return res.json({
        success: true,
        alreadyCreated: true,
        message: 'Prescription already created for this appointment.',
        prescription: existingRx,
        appointment
      });
    }

    // Appointment must be in Prescription Pending state
    if (appointment.status !== 'Prescription Pending') {
      return res.status(400).json({ error: `Cannot upload prescription for appointment in ${appointment.status} status. Must be Prescription Pending.` });
    }

    const rawImages = Array.isArray(req.body.images) ? req.body.images : [];
    if (rawImages.length === 0) {
      return res.status(400).json({ error: 'At least one prescription image page is required' });
    }

    // Process and normalize image pages in requested order
    const uploadsDir = path.join(__dirname, '../uploads/prescriptions');
    const normalizedImages = rawImages.map((img, idx) => {
      let fileUrl = img.url;
      // Convert base64 data URL to static file if provided
      if (fileUrl && fileUrl.startsWith('data:image/')) {
        try {
          const matches = fileUrl.match(/^data:image\/([a-zA-Z0-9+]+);base64,(.+)$/);
          if (matches) {
            const ext = matches[1] === 'jpeg' ? '.jpg' : `.${matches[1]}`;
            if (!fs.existsSync(uploadsDir)) {
              fs.mkdirSync(uploadsDir, { recursive: true });
            }
            const safeName = `${resolvedTenant}_${Date.now()}_page${idx + 1}_${Math.random().toString(36).substring(2, 6)}${ext}`;
            fs.writeFileSync(path.join(uploadsDir, safeName), Buffer.from(matches[2], 'base64'));
            fileUrl = `/uploads/prescriptions/${safeName}`;
          }
        } catch (e) {
          console.warn('Could not save base64 data URL to file:', e);
        }
      }
      return {
        pageNumber: idx + 1,
        url: fileUrl,
        originalName: img.originalName || `Page_${idx + 1}.jpg`,
        uploadedAt: img.uploadedAt || new Date()
      };
    });

    // Create the ONE Prescription document
    const prescription = await Prescription.create({
      tenantId: resolvedTenant,
      appointmentId: appointment._id,
      patientId: appointment.patientId,
      doctorId: appointment.doctorId,
      items: [], // Zero digital/fabricated items for handwritten prescription
      status: 'Pending Pharmacy Dispatch',
      prescriptionType: 'offline_handwritten',
      images: normalizedImages,
      editableUntil: new Date(Date.now() + 24 * 60 * 60 * 1000), // Phase 6: 24-hour edit window
      isLocked: false,
      offlineMetadata: {
        uploadedBy: req.user._id || req.user.id,
        uploadedByRole: req.user.role,
        notes: req.body.notes || 'Offline handwritten prescription uploaded by Reception'
      }
    });

    // Mark appointment as Completed ONLY after prescription is successfully persisted
    appointment.status = 'Completed';
    await appointment.save();

    // Central AuditLog entry for initial creation (Phase 6 Requirement 1, 12)
    const AuditLog = require('../models/AuditLog');
    AuditLog.create({
      tenantId: resolvedTenant,
      actor: req.user.staff_id || req.user.id || req.user._id?.toString() || 'reception',
      actorName: req.user.name || 'Reception Staff',
      actorRole: req.user.role || 'reception',
      action: 'PRESCRIPTION_CREATED',
      target: prescription._id.toString(),
      metadata: {
        prescriptionId: prescription._id.toString(),
        appointmentId: appointment._id.toString(),
        patientId: appointment.patientId.toString(),
        doctorId: appointment.doctorId?.toString(),
        pageCount: normalizedImages.length,
        editableUntil: prescription.editableUntil
      }
    }).catch(err => console.warn('AuditLog creation non-fatal error:', err));

    // Emit Socket.IO real-time event
    const io = req.app.get("io");
    if (io) {
      io.to(resolvedTenant).emit("data_changed", {
        type: "prescriptions",
        subType: "offline_handwritten",
        action: "prescription_created",
        appointmentId: appointment._id,
        prescriptionId: prescription._id
      });
      io.to(resolvedTenant).emit("data_changed", {
        type: "appointments",
        action: "appointment_completed",
        appointmentId: appointment._id
      });
    }

    res.json({
      success: true,
      message: 'Handwritten prescription uploaded and appointment completed successfully.',
      prescription,
      appointment
    });
  } catch (error) {
    console.error("Offline prescription upload error:", error);
    res.status(400).json({ error: error.message || 'Failed to record offline prescription' });
  }
});

// PUT /api/appointments/:id/offline-prescription
// PHASE 6: 24-Hour Edit Window & Audited Corrections for Handwritten Prescriptions
router.put('/:id/offline-prescription', verifyToken, async (req, res) => {
  try {
    const resolvedTenant = req.tenantId || req.user?.tenantId;
    if (!resolvedTenant) {
      return res.status(400).json({ error: 'Tenant context is required' });
    }

    // Role check: ONLY reception / receptionist can perform corrections (Requirement 6)
    const userRole = req.user?.role;
    if (userRole !== 'reception' && userRole !== 'receptionist') {
      return res.status(403).json({ 
        error: 'FORBIDDEN_ROLE', 
        message: 'Only Reception can submit handwritten prescription corrections.' 
      });
    }

    // Load authoritative appointment
    const appointment = await Appointment.findOne({
      _id: req.params.id,
      tenantId: resolvedTenant
    });

    if (!appointment) {
      return res.status(404).json({ error: 'Appointment not found' });
    }

    // Find authoritative prescription
    const Prescription = require('../models/Prescription');
    const prescription = await Prescription.findOne({
      appointmentId: appointment._id,
      tenantId: resolvedTenant
    });

    if (!prescription) {
      return res.status(404).json({ error: 'No prescription found for this appointment' });
    }

    // Invariant: applies ONLY to offline_handwritten prescriptions (Requirement 20)
    if (prescription.prescriptionType !== 'offline_handwritten') {
      return res.status(400).json({ 
        error: 'INVALID_PRESCRIPTION_TYPE', 
        message: 'Only offline handwritten prescriptions can be corrected via this endpoint.' 
      });
    }

    // 24-Hour Edit Window Check (Server-authoritative, Requirement 2, 3, 4)
    const now = Date.now();
    const deadline = prescription.editableUntil 
      ? new Date(prescription.editableUntil).getTime() 
      : new Date(prescription.createdAt).getTime() + 24 * 60 * 60 * 1000;

    if (now >= deadline || prescription.isLocked) {
      return res.status(403).json({
        error: 'PRESCRIPTION_EDIT_WINDOW_EXPIRED',
        message: 'The 24-hour correction window for this prescription has expired.'
      });
    }

    // Minimum 1 page invariant (Requirement 18)
    const rawImages = Array.isArray(req.body.images) ? req.body.images : [];
    if (rawImages.length === 0) {
      return res.status(400).json({
        error: 'EMPTY_PRESCRIPTION',
        message: 'A handwritten prescription must contain at least one page.'
      });
    }

    // Normalize image set with sequential 1-based page numbers
    const uploadsDir = path.join(__dirname, '../uploads/prescriptions');
    const normalizedImages = rawImages.map((img, idx) => {
      let fileUrl = img.url;
      if (fileUrl && fileUrl.startsWith('data:image/')) {
        try {
          const matches = fileUrl.match(/^data:image\/([a-zA-Z0-9+]+);base64,(.+)$/);
          if (matches) {
            const ext = matches[1] === 'jpeg' ? '.jpg' : `.${matches[1]}`;
            if (!fs.existsSync(uploadsDir)) {
              fs.mkdirSync(uploadsDir, { recursive: true });
            }
            const safeName = `${resolvedTenant}_${Date.now()}_page${idx + 1}_${Math.random().toString(36).substring(2, 6)}${ext}`;
            const targetPath = path.join(uploadsDir, safeName);
            fs.writeFileSync(targetPath, Buffer.from(matches[2], 'base64'));
            fileUrl = `/uploads/prescriptions/${safeName}`;
          }
        } catch (e) {
          console.warn('Could not save base64 data URL to file:', e);
        }
      }
      return {
        pageNumber: idx + 1,
        url: fileUrl,
        originalName: img.originalName || `Page_${idx + 1}.jpg`,
        uploadedAt: img.uploadedAt || new Date()
      };
    });

    // Capture previous state for audit (Requirement 9, 11)
    const previousImages = (prescription.images || []).map(img => ({
      pageNumber: img.pageNumber,
      url: img.url,
      originalName: img.originalName
    }));

    // Detect semantic action (Requirement 11, 14, 15, 16, 17)
    let detectedAction = req.body.actionType;
    if (!detectedAction || !['PAGE_ADDED', 'PAGE_REMOVED', 'PAGE_REPLACED', 'PAGES_REORDERED'].includes(detectedAction)) {
      const prevUrls = previousImages.map(img => img.url);
      const newUrls = normalizedImages.map(img => img.url);
      if (newUrls.length < prevUrls.length) {
        detectedAction = 'PAGE_REMOVED';
      } else if (newUrls.length > prevUrls.length) {
        detectedAction = 'PAGE_ADDED';
      } else {
        const prevSet = new Set(prevUrls);
        const allPresent = newUrls.every(u => prevSet.has(u));
        if (allPresent) {
          detectedAction = 'PAGES_REORDERED';
        } else {
          detectedAction = 'PAGE_REPLACED';
        }
      }
    }

    const actorId = req.user.staff_id || req.user.id || req.user._id?.toString() || 'reception';
    const actorName = req.user.name || 'Reception Staff';
    const actorRole = req.user.role || 'reception';

    // Record in central AuditLog (Requirement 1, 11)
    const AuditLog = require('../models/AuditLog');
    await AuditLog.create({
      tenantId: resolvedTenant,
      actor: actorId,
      actorName: actorName,
      actorRole: actorRole,
      action: detectedAction,
      target: prescription._id.toString(),
      metadata: {
        prescriptionId: prescription._id.toString(),
        appointmentId: appointment._id.toString(),
        patientId: appointment.patientId.toString(),
        doctorId: appointment.doctorId?.toString(),
        action: detectedAction,
        affectedPage: req.body.affectedPage || null,
        previousState: { images: previousImages },
        resultingState: { images: normalizedImages },
        notes: req.body.notes || `Prescription pages updated via ${detectedAction}`
      }
    });

    // Record in prescription's embedded correctionHistory (Requirement 9, 11)
    if (!prescription.correctionHistory) prescription.correctionHistory = [];
    prescription.correctionHistory.push({
      action: detectedAction,
      actorId,
      actorRole,
      actorName,
      timestamp: new Date(),
      affectedPage: req.body.affectedPage || null,
      previousState: { images: previousImages },
      resultingState: { images: normalizedImages },
      notes: req.body.notes || ''
    });

    // Update images (Historical image files are NOT physically deleted from disk)
    prescription.images = normalizedImages;
    await prescription.save();

    // Emit Socket.IO event for real-time synchronization
    const io = req.app.get("io");
    if (io) {
      io.to(resolvedTenant).emit("data_changed", {
        type: "prescriptions",
        subType: "offline_handwritten",
        action: "prescription_corrected",
        correctionAction: detectedAction,
        appointmentId: appointment._id,
        prescriptionId: prescription._id
      });
    }

    res.json({
      success: true,
      action: detectedAction,
      message: `Prescription updated successfully (${detectedAction}).`,
      prescription
    });
  } catch (error) {
    console.error("Prescription correction error:", error);
    res.status(500).json({ error: error.message || 'Failed to update prescription' });
  }
});

// Record that no prescription was provided by doctor and transition appointment from Prescription Pending to Completed
router.post('/:id/no-prescription', async (req, res) => {
  try {
    const appointment = await Appointment.findById(req.params.id);
    if (!appointment) {
      return res.status(404).json({ error: 'Appointment not found' });
    }

    const resolvedTenant = String(req.tenantId || appointment.tenantId || 'city_hospital').trim().toLowerCase();
    if (String(appointment.tenantId).trim().toLowerCase() !== resolvedTenant) {
      return res.status(403).json({ error: 'Tenant mismatch: access denied' });
    }

    // Server-side authorization check: Only reception or admin role
    const userRole = req.user?.role;
    if (userRole !== 'reception' && userRole !== 'receptionist' && userRole !== 'admin') {
      return res.status(403).json({ error: 'Only Receptionist or Admin can record consultation completion' });
    }

    // Verify hospital Doctor Clinical Mode is OFFLINE
    const SuperAdminHospital = require('../models/SuperAdminHospital');
    const hospital = await SuperAdminHospital.findOne({ code: resolvedTenant });
    if (!hospital || hospital.doctorClinicalMode !== 'OFFLINE') {
      return res.status(400).json({ error: 'No Prescription resolution is only available when Doctor Clinical Mode is OFFLINE' });
    }

    // Mutual exclusivity: Check if a prescription already exists
    const Prescription = require('../models/Prescription');
    const existingRx = await Prescription.findOne({
      tenantId: resolvedTenant,
      appointmentId: appointment._id
    });
    if (existingRx) {
      return res.status(400).json({ error: 'A prescription was already recorded for this appointment. Cannot mark as No Prescription.' });
    }

    // Idempotency: If already completed with no prescription
    if (appointment.noPrescriptionProvided && appointment.status === 'Completed') {
      return res.json({
        success: true,
        alreadyCompleted: true,
        message: 'Appointment was already completed with No Prescription Provided.',
        appointment
      });
    }

    // Appointment must be in Prescription Pending state
    if (appointment.status !== 'Prescription Pending') {
      return res.status(400).json({ error: `Cannot resolve appointment in ${appointment.status} status. Must be Prescription Pending.` });
    }

    // Mark appointment Completed with noPrescriptionProvided = true
    appointment.status = 'Completed';
    appointment.noPrescriptionProvided = true;
    if (!appointment.notes) {
      appointment.notes = 'No prescription provided by doctor (Consultation completed).';
    } else if (!appointment.notes.includes('No prescription provided')) {
      appointment.notes += ' [No prescription provided by doctor]';
    }
    await appointment.save();

    // Emit Socket.IO real-time event
    const io = req.app.get("io");
    if (io) {
      io.to(resolvedTenant).emit("data_changed", {
        type: "appointments",
        action: "appointment_completed",
        appointmentId: appointment._id,
        noPrescriptionProvided: true
      });
    }

    res.json({
      success: true,
      message: 'Appointment completed successfully with No Prescription Provided.',
      appointment
    });
  } catch (error) {
    console.error("No-prescription completion error:", error);
    res.status(400).json({ error: error.message || 'Failed to complete appointment' });
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

