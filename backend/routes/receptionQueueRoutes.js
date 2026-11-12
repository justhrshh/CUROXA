const express = require('express');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const router = express.Router();

const SuperAdminHospital = require('../models/SuperAdminHospital');
const Patient = require('../models/Patient');
const Appointment = require('../models/Appointment');
const ReceptionQueue = require('../models/ReceptionQueue');
const User = require('../models/User');
const LeaveRequest = require('../models/LeaveRequest');
const Counter = require('../models/Counter');
const Consent = require('../models/Consent');
const { verifyToken } = require('../middleware/authMiddleware');
const { getHospitalEffectiveModules } = require('../utils/subscriptionHelper');
const {
  normalizeQueueDate,
  allocateReceptionTicket,
  getReceptionQueueState,
  getPatientQueuePosition,
  broadcastReceptionQueueUpdate,
  getStaffReceptionQueueData,
  advanceReceptionQueue,
  skipReceptionTicket,
  completeReceptionTicket,
  serveReceptionTicket
} = require('../utils/receptionQueueEngine');
const { resolveTrustedHospitalBranding, buildBrandedOtpEmail } = require('../utils/hospitalBrandingHelper');
const { sendEmail } = require('../utils/emailService');
const { getJwtSecret } = require('../config/env');
const { resolveOrCreateUhid, generateHospitalPatientId } = require('../utils/identifierEngine');
const { createAndDispatchOtp, atomicVerifyOtp } = require('../services/otp/otpService');
const { normalizeIndianMobile, isValidIndianMobile, maskPhoneNumber } = require('../utils/phoneNormalization');

// Rate limiting in-memory caches (per-instance fast path)
// Map<cleanEmail, { count: number, resetAt: number, lastSentAt: number }>
const otpRateLimitMap = new Map();

// Helper to hash OTP with HMAC-SHA256 bound to server secret, email, and tenantId
// Fails closed if server secret is missing or too weak (never falls back to a hardcoded string)
const getOtpHmacSecret = () => {
  return getJwtSecret();
};

const hashOtp = (code, email, tenantId) => {
  const secret = getOtpHmacSecret();
  const cleanCode = String(code).trim();
  const cleanEmail = String(email || '').toLowerCase().trim();
  const cleanTenant = String(tenantId || '').toLowerCase().trim();
  return crypto.createHmac('sha256', secret)
    .update(`${cleanCode}:${cleanEmail}:${cleanTenant}`)
    .digest('hex');
};

/**
 * Resolves authoritative clinic record and verifies module enablement.
 * Fails closed if clinic is unknown, inactive, or not configured.
 */
async function resolveClinicAndModule(clinicCode) {
  if (!clinicCode || typeof clinicCode !== 'string') {
    return { error: 'Invalid clinic identifier.', status: 400 };
  }

  const cleanCode = clinicCode.trim().toLowerCase();
  const hospital = await SuperAdminHospital.findOne({
    $or: [
      { code: cleanCode },
      { hospitalId: cleanCode.toUpperCase() }
    ]
  });

  if (!hospital) {
    return { error: 'Clinic not found. Please verify the QR code.', status: 404 };
  }

  if (hospital.status && hospital.status.toLowerCase() !== 'active') {
    return { error: 'This clinic is currently inactive.', status: 403 };
  }

  const effectiveModules = await getHospitalEffectiveModules(hospital);
  const isModuleEnabled = Boolean(effectiveModules.receptionQueue?.enabled);

  return {
    hospital,
    tenantId: hospital.code,
    clinicCode: hospital.code,
    isModuleEnabled
  };
}

/**
 * Authoritative daily booked count for a doctor on a target date.
 * Considers:
 * 1. Active Appointments (excluding Cancelled)
 * 2. Active ReceptionQueue tickets holding this doctor on this target appointment date (Waiting, Called, Serving)
 */
async function calculateDoctorDailyBookedCount({ tenantId, doctorId, date, session = null }) {
  const normDate = normalizeQueueDate(date);
  const cleanTenant = String(tenantId).trim().toLowerCase();
  const startOfDay = new Date(`${normDate}T00:00:00.000Z`);
  const endOfDay = new Date(`${normDate}T23:59:59.999Z`);

  const appQuery = {
    tenantId: cleanTenant,
    doctorId,
    status: { $nin: ['Cancelled', 'No-Show', 'no-show', 'Skipped'] },
    $or: [
      { tokenDate: normDate },
      { date: { $gte: startOfDay, $lte: endOfDay } }
    ]
  };

  const queueQuery = {
    tenantId: cleanTenant,
    doctorId,
    targetAppointmentDate: normDate,
    status: { $in: ['Waiting', 'Called', 'Serving'] }
  };

  let appointments = [];
  let queueTickets = [];

  if (session) {
    appointments = await Appointment.find(appQuery, { patientId: 1 }).session(session).lean();
    queueTickets = await ReceptionQueue.find(queueQuery, { patientId: 1 }).session(session).lean();
  } else {
    appointments = await Appointment.find(appQuery, { patientId: 1 }).lean();
    queueTickets = await ReceptionQueue.find(queueQuery, { patientId: 1 }).lean();
  }

  const appointmentCount = appointments.length;

  // Build a set of patient IDs already counted under active appointments for this doctor & date
  const appPatientIds = new Set(
    appointments.map(a => a.patientId ? String(a.patientId) : null).filter(Boolean)
  );

  // Exclude any active queue ticket for a patient who already has an active appointment counted above
  const nonDuplicateQueueTickets = queueTickets.filter(t => {
    const pId = t.patientId ? String(t.patientId) : null;
    return !pId || !appPatientIds.has(pId);
  });

  const queueCount = nonDuplicateQueueTickets.length;

  return appointmentCount + queueCount;
}

/**
 * Evaluates whether a doctor is available on a specific date (evaluates weeklyOff and approved leaves).
 */
async function checkDoctorDateAvailability(doctor, dateStr, tenantId) {
  const daysOfWeek = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const targetDateObj = new Date(dateStr);
  if (isNaN(targetDateObj.getTime())) return { available: false, reason: 'Invalid date format' };
  
  const dayName = daysOfWeek[targetDateObj.getDay()];

  // Check weekly off
  if (doctor.weeklyOff) {
    let isOff = false;
    if (Array.isArray(doctor.weeklyOff)) {
      isOff = doctor.weeklyOff.some(d => String(d).trim().toLowerCase() === dayName.toLowerCase());
    } else if (typeof doctor.weeklyOff === 'string') {
      isOff = doctor.weeklyOff.trim().toLowerCase() === dayName.toLowerCase();
    }
    if (isOff) {
      return { available: false, reason: `Doctor is on weekly off (${dayName})` };
    }
  }

  // Check approved leaves
  const activeLeave = await LeaveRequest.findOne({
    tenantId: String(tenantId).trim().toLowerCase(),
    status: 'Approved',
    $or: [
      { employeeId: doctor.staff_id },
      { employeeName: new RegExp(`^${doctor.name}$`, 'i') }
    ],
    fromDate: { $lte: dateStr },
    toDate: { $gte: dateStr }
  }).lean();

  if (activeLeave) {
    return { available: false, reason: 'Doctor is on approved leave' };
  }

  return { available: true };
}

/**
 * Concurrency-safe atomic reservation against doctor daily capacity.
 * Ensures two concurrent patients cannot exceed dailyMaxCapacity.
 */
async function checkAndReserveDoctorCapacity({ tenantId, doctorId, date }) {
  const normDate = normalizeQueueDate(date);
  const cleanTenant = String(tenantId).trim().toLowerCase();

  const doctor = await User.findOne({
    _id: doctorId,
    tenantId: cleanTenant,
    role: 'doctor'
  }).lean();

  if (!doctor) {
    const err = new Error('Doctor not found in this clinic.');
    err.status = 404;
    throw err;
  }

  if (!doctor.dailyMaxCapacity || doctor.dailyMaxCapacity < 1) {
    const err = new Error('Doctor does not have daily booking capacity configured.');
    err.status = 400;
    throw err;
  }

  const availCheck = await checkDoctorDateAvailability(doctor, normDate, cleanTenant);
  if (!availCheck.available) {
    const err = new Error(availCheck.reason || 'Doctor is unavailable on this date.');
    err.status = 400;
    throw err;
  }

  const currentBooked = await calculateDoctorDailyBookedCount({ tenantId: cleanTenant, doctorId, date: normDate });
  if (currentBooked >= doctor.dailyMaxCapacity) {
    const err = new Error('This doctor has reached the maximum booking capacity for the selected date. Please select another doctor or date.');
    err.status = 409;
    err.code = 'CAPACITY_FULL';
    throw err;
  }

  const reservationKey = `doctor_cap_lock_${cleanTenant}_${String(doctorId)}_${normDate}`;

  // Concurrency-safe initialization & reconciliation:
  // 1. Ensure counter document exists with baseline set to currentBooked (never overwrites if already exists)
  await Counter.findOneAndUpdate(
    { key: reservationKey },
    { $setOnInsert: { seq: currentBooked } },
    { upsert: true }
  ).catch(() => {});

  // 2. Concurrency-safe upward sync: only raise seq if it is strictly less than currentBooked
  // If another concurrent request has already incremented seq, this condition fails and prevents overwriting
  await Counter.updateOne(
    { key: reservationKey, seq: { $lt: currentBooked } },
    { $set: { seq: currentBooked } }
  ).catch(() => {});

  // 3. Atomic conditional increment: guarantees capacity limit is never exceeded
  const reserved = await Counter.findOneAndUpdate(
    { key: reservationKey, seq: { $lt: doctor.dailyMaxCapacity } },
    { $inc: { seq: 1 } },
    { returnDocument: 'after' }
  );

  if (!reserved) {
    const err = new Error('This doctor has reached the maximum booking capacity for the selected date. Please select another doctor or date.');
    err.status = 409;
    err.code = 'CAPACITY_FULL';
    throw err;
  }

  return {
    doctor,
    normDate,
    reservationKey,
    releaseReservation: async () => {
      await Counter.findOneAndUpdate({ key: reservationKey }, { $inc: { seq: -1 } }).catch(() => {});
    }
  };
}

// ----------------------------------------------------
// 1. PUBLIC CLINIC VERIFICATION & LANDING
// GET /api/reception-queue/clinic/:clinicCode
// ----------------------------------------------------
router.get('/clinic/:clinicCode', async (req, res) => {
  try {
    const resolved = await resolveClinicAndModule(req.params.clinicCode);
    if (resolved.error) {
      return res.status(resolved.status).json({ error: resolved.error });
    }

    const { hospital, tenantId, isModuleEnabled } = resolved;
    const todayStr = normalizeQueueDate(new Date());

    if (!isModuleEnabled) {
      return res.status(200).json({
        moduleEnabled: false,
        message: 'The digital Reception Queue module is currently disabled for this clinic.',
        hospital: {
          name: hospital.name,
          code: hospital.code,
          logo: hospital.logo || '',
          address: hospital.address || '',
          phone: hospital.phone || ''
        }
      });
    }

    const queueState = await getReceptionQueueState(tenantId, todayStr);

    return res.json({
      moduleEnabled: true,
      hospital: {
        name: hospital.name,
        code: hospital.code,
        logo: hospital.logo || '',
        address: hospital.address || '',
        phone: hospital.phone || ''
      },
      queue: queueState
    });
  } catch (error) {
    console.error('[RECEPTION QUEUE CLINIC FETCH ERROR]:', error);
    return res.status(500).json({ error: 'Failed to retrieve clinic information.' });
  }
});

// ----------------------------------------------------
// 1A. PUBLIC ELIGIBLE DOCTORS LIST FOR QR BOOKING
// GET /api/reception-queue/clinic/:clinicCode/doctors
// ----------------------------------------------------
router.get('/clinic/:clinicCode/doctors', async (req, res) => {
  try {
    const resolved = await resolveClinicAndModule(req.params.clinicCode);
    if (resolved.error) {
      return res.status(resolved.status).json({ error: resolved.error });
    }

    if (!resolved.isModuleEnabled) {
      return res.status(403).json({
        error: 'Reception Queue registration is currently disabled for this clinic.'
      });
    }

    const todayStr = normalizeQueueDate(new Date());
    const targetDate = req.query.date ? normalizeQueueDate(req.query.date) : todayStr;

    if (targetDate < todayStr) {
      return res.status(400).json({ error: 'Cannot check availability for past dates.' });
    }

    // Query doctors for this clinic with dailyMaxCapacity explicitly configured and > 0
    const doctors = await User.find({
      tenantId: resolved.tenantId,
      role: 'doctor',
      dailyMaxCapacity: { $ne: null, $gt: 0 }
    }).select('name specialty department avatar dailyMaxCapacity weeklyOff staff_id').sort({ name: 1 }).lean();

    const eligibleDoctors = [];

    for (const doc of doctors) {
      const availCheck = await checkDoctorDateAvailability(doc, targetDate, resolved.tenantId);
      if (availCheck.available) {
        eligibleDoctors.push({
          _id: doc._id,
          name: doc.name,
          specialty: doc.specialty || doc.department || 'General Medicine',
          department: doc.department || '',
          avatar: doc.avatar || '',
          dailyMaxCapacity: doc.dailyMaxCapacity
        });
      }
    }

    return res.json({
      success: true,
      clinicCode: resolved.clinicCode,
      date: targetDate,
      doctors: eligibleDoctors
    });
  } catch (error) {
    console.error('[PUBLIC CLINIC DOCTORS FETCH ERROR]:', error);
    return res.status(500).json({ error: 'Failed to retrieve doctors list.' });
  }
});

// ----------------------------------------------------
// 1A-2. PUBLIC DOCTOR AVAILABILITY FOR QR BOOKING
// GET /api/reception-queue/clinic/:clinicCode/doctor-availability
// ----------------------------------------------------
router.get('/clinic/:clinicCode/doctor-availability', async (req, res) => {
  try {
    const resolved = await resolveClinicAndModule(req.params.clinicCode);
    if (resolved.error) {
      return res.status(resolved.status).json({ error: resolved.error });
    }

    if (!resolved.isModuleEnabled) {
      return res.status(403).json({
        error: 'Reception Queue registration is currently disabled for this clinic.'
      });
    }

    const { doctorId, date } = req.query;
    if (!doctorId) {
      return res.status(400).json({ error: 'doctorId query parameter is required.' });
    }

    const todayStr = normalizeQueueDate(new Date());
    const targetDate = date ? normalizeQueueDate(date) : todayStr;

    if (targetDate < todayStr) {
      return res.status(400).json({ error: 'Cannot check availability for past dates.' });
    }

    const doctor = await User.findOne({
      _id: doctorId,
      tenantId: resolved.tenantId,
      role: 'doctor'
    }).select('name specialty department avatar dailyMaxCapacity weeklyOff staff_id').lean();

    if (!doctor) {
      return res.status(404).json({ error: 'Doctor not found or does not belong to this clinic.' });
    }

    if (!doctor.dailyMaxCapacity || doctor.dailyMaxCapacity < 1) {
      return res.status(400).json({ error: 'This doctor does not have daily booking capacity configured.' });
    }

    const availCheck = await checkDoctorDateAvailability(doctor, targetDate, resolved.tenantId);
    if (!availCheck.available) {
      return res.json({
        success: true,
        doctorId: doctor._id,
        date: targetDate,
        dailyCapacity: doctor.dailyMaxCapacity,
        bookedCount: 0,
        remainingSlots: 0,
        availableSlots: 0,
        isAvailable: false,
        isFull: true,
        status: availCheck.reason || 'Unavailable'
      });
    }

    const bookedCount = await calculateDoctorDailyBookedCount({
      tenantId: resolved.tenantId,
      doctorId: doctor._id,
      date: targetDate
    });

    const remainingSlots = Math.max(0, doctor.dailyMaxCapacity - bookedCount);
    const isAvailable = remainingSlots > 0;
    const isFull = remainingSlots <= 0;
    const status = isAvailable ? 'Available' : 'Fully Booked';

    return res.json({
      success: true,
      doctorId: doctor._id,
      date: targetDate,
      dailyCapacity: doctor.dailyMaxCapacity,
      bookedCount,
      remainingSlots,
      availableSlots: remainingSlots,
      isAvailable,
      isFull,
      status
    });
  } catch (error) {
    console.error('[PUBLIC DOCTOR AVAILABILITY ERROR]:', error);
    return res.status(500).json({ error: 'Failed to retrieve doctor availability.' });
  }
});

// ----------------------------------------------------
// 1B. PUBLIC RECEPTION DISPLAY FOR WAITING ROOMS (READ-ONLY)
// GET /api/reception-queue/display/:clinicCode
// ----------------------------------------------------
router.get('/display/:clinicCode', async (req, res) => {
  try {
    const resolved = await resolveClinicAndModule(req.params.clinicCode);
    if (resolved.error) {
      return res.status(resolved.status).json({ error: resolved.error });
    }

    const { hospital, tenantId, isModuleEnabled } = resolved;
    const todayStr = normalizeQueueDate(new Date());

    const queueState = await getReceptionQueueState(tenantId, todayStr);
    const hasActiveQueue = Boolean(queueState.isServing || (queueState.waitingCount > 0));

    let isDrainingMode = false;
    let displayState = 'idle';

    if (isModuleEnabled) {
      isDrainingMode = false;
      displayState = queueState.isServing ? 'serving' : 'idle';
    } else {
      if (hasActiveQueue) {
        isDrainingMode = true;
        displayState = queueState.isServing ? 'serving' : 'idle';
      } else {
        isDrainingMode = false;
        displayState = 'unavailable';
      }
    }

    return res.json({
      success: true,
      clinic: {
        name: hospital.name,
        code: (hospital.code || resolved.clinicCode).toUpperCase(),
        logo: hospital.logo || ''
      },
      queueDate: todayStr,
      currentTicketNumber: queueState.currentTicketNumber,
      currentTicketDisplay: queueState.currentTicketDisplay,
      isServing: queueState.isServing,
      waitingCount: queueState.waitingCount,
      totalIssuedToday: queueState.totalIssuedToday,
      isModuleEnabled,
      isDrainingMode,
      displayState,
      lastUpdated: new Date().toISOString()
    });
  } catch (error) {
    console.error('[RECEPTION DISPLAY FETCH ERROR]:', error);
    return res.status(500).json({ error: 'Failed to retrieve reception display data.' });
  }
});

// ----------------------------------------------------
// 2. DISPATCH RECEPTION OTP (Mobile SMS Primary / Legacy Email)
// POST /api/reception-queue/send-otp
// ----------------------------------------------------
router.post('/send-otp', async (req, res) => {
  try {
    const { clinicCode, contact, mobile, phone, email, _mockSmsTransport, _mockEmailTransport } = req.body;
    const resolved = await resolveClinicAndModule(clinicCode);
    if (resolved.error) {
      return res.status(resolved.status).json({ error: resolved.error });
    }

    if (!resolved.isModuleEnabled) {
      return res.status(403).json({
        error: 'Reception Queue registration is currently disabled for this clinic.'
      });
    }

    const rawContact = contact || mobile || phone;
    let targetIdentifier = null;
    let deliveryChannel = 'sms';
    let identifierType = 'phone';
    let cleanEmail = null;

    if (rawContact) {
      const phoneCheck = normalizeIndianMobile(rawContact);
      if (!phoneCheck.isValid) {
        return res.status(400).json({ error: phoneCheck.error || 'A valid 10-digit Indian mobile number is required.' });
      }
      targetIdentifier = phoneCheck.normalized;
      deliveryChannel = 'sms';
      identifierType = 'phone';
    } else if (email && typeof email === 'string' && email.includes('@')) {
      cleanEmail = email.toLowerCase().trim();
      targetIdentifier = cleanEmail;
      deliveryChannel = 'email';
      identifierType = 'email';
    } else {
      return res.status(400).json({ error: 'A valid 10-digit mobile number is required.' });
    }

    const now = Date.now();

    // Fast-path in-memory rate limiting check (30s cooldown, max 5 per 10 mins)
    const rateKey = `${resolved.tenantId}:${targetIdentifier}`;
    const rateInfo = otpRateLimitMap.get(rateKey) || { count: 0, resetAt: now + 10 * 60 * 1000, lastSentAt: 0 };
    if (now > rateInfo.resetAt) {
      rateInfo.count = 0;
      rateInfo.resetAt = now + 10 * 60 * 1000;
    }

    if (rateInfo.lastSentAt && (now - rateInfo.lastSentAt) < 30 * 1000) {
      const waitSec = Math.ceil((30 * 1000 - (now - rateInfo.lastSentAt)) / 1000);
      return res.status(429).json({ error: `Please wait ${waitSec} seconds before requesting a new code.` });
    }

    if (rateInfo.count >= 5) {
      return res.status(429).json({ error: 'Too many verification code requests. Please try again after 10 minutes.' });
    }

    const hospitalBranding = await resolveTrustedHospitalBranding(resolved.tenantId);
    let emailHtmlBody = null;
    if (deliveryChannel === 'email' && cleanEmail) {
      emailHtmlBody = (authoritativeOtp) => buildBrandedOtpEmail({
        otp: authoritativeOtp,
        title: `${hospitalBranding.name} Reception Check-In`,
        message: `Use the 6-digit verification code below to verify your identity and enter the reception queue at <strong>${hospitalBranding.name}</strong>. This code expires in <strong>10 minutes</strong>.`,
        hospital: hospitalBranding,
        expiryMinutes: 10
      }).html;
    }

    // Central challenge dispatch via otpService with Zero-Orphan Rollback commitment
    const dispatchResult = await createAndDispatchOtp({
      targetIdentifier,
      identifierType,
      tenantId: resolved.tenantId,
      purpose: 'RECEPTION_QUEUE',
      deliveryChannel,
      expiryMinutes: 10,
      subject: `${hospitalBranding.name} Reception Queue Verification Code`,
      html: emailHtmlBody,
      senderName: hospitalBranding.name,
      _mockSmsTransport,
      _mockEmailTransport
    });

    if (!dispatchResult.success) {
      return res.status(dispatchResult.status || 500).json({
        error: dispatchResult.error || 'Failed to dispatch verification code.'
      });
    }

    rateInfo.count += 1;
    rateInfo.lastSentAt = now;
    otpRateLimitMap.set(rateKey, rateInfo);

    const maskedTarget = deliveryChannel === 'sms' 
      ? maskPhoneNumber(targetIdentifier)
      : (cleanEmail ? cleanEmail.replace(/(?<=^.).+(?=@)/, '***') : '******');

    return res.json({
      success: true,
      channel: deliveryChannel,
      maskedTarget,
      message: deliveryChannel === 'sms'
        ? `A 6-digit verification code has been dispatched via SMS to ${maskedTarget}.`
        : 'If the email is valid, a verification code has been dispatched.'
    });
  } catch (error) {
    console.error('[RECEPTION SEND OTP ERROR]:', error);
    return res.status(500).json({ error: 'Unable to process verification code request.' });
  }
});

// ----------------------------------------------------
// 3. VERIFY OTP & DETECT PATIENT STATUS
// POST /api/reception-queue/verify-otp
// ----------------------------------------------------
router.post('/verify-otp', async (req, res) => {
  try {
    const { clinicCode, contact, mobile, phone, email, otp, doctorId, targetAppointmentDate } = req.body;
    const resolved = await resolveClinicAndModule(clinicCode);
    if (resolved.error) {
      return res.status(resolved.status).json({ error: resolved.error });
    }

    if (!resolved.isModuleEnabled) {
      return res.status(403).json({
        error: 'Reception Queue registration is currently disabled for this clinic.'
      });
    }

    const rawContact = contact || mobile || phone;
    let targetIdentifier = null;
    let isMobile = false;
    let cleanEmail = null;

    if (rawContact) {
      const phoneCheck = normalizeIndianMobile(rawContact);
      if (!phoneCheck.isValid) {
        return res.status(400).json({ error: phoneCheck.error || 'A valid 10-digit mobile number is required.' });
      }
      targetIdentifier = phoneCheck.normalized;
      isMobile = true;
    } else if (email && typeof email === 'string' && email.includes('@')) {
      cleanEmail = email.toLowerCase().trim();
      targetIdentifier = cleanEmail;
      isMobile = false;
    } else {
      return res.status(400).json({ error: 'Mobile number and verification code are required.' });
    }

    if (!otp) {
      return res.status(400).json({ error: 'Verification code is required.' });
    }

    const cleanOtp = String(otp).trim();
    const now = Date.now();

    // Central atomic OTP verification
    const verifyResult = await atomicVerifyOtp({
      targetIdentifier,
      candidateOtp: cleanOtp,
      tenantId: resolved.tenantId,
      purpose: 'RECEPTION_QUEUE'
    });

    if (!verifyResult.success) {
      return res.status(verifyResult.status || 400).json({ error: verifyResult.error });
    }

    let secretKey;
    try {
      secretKey = getJwtSecret();
    } catch (e) {
      secretKey = process.env.JWT_SECRET || 'secret_key';
    }

    const cleanDoctorId = doctorId ? String(doctorId).trim() : null;
    const cleanTargetDate = targetAppointmentDate ? normalizeQueueDate(targetAppointmentDate) : null;

    const sessionPayload = {
      contact: isMobile ? targetIdentifier : null,
      email: !isMobile ? cleanEmail : null,
      tenantId: resolved.tenantId,
      clinicCode: resolved.clinicCode,
      purpose: 'reception_queue_registration',
      doctorId: cleanDoctorId,
      targetAppointmentDate: cleanTargetDate
    };
    const sessionToken = jwt.sign(sessionPayload, secretKey, { expiresIn: '30m' });

    // ── PATIENT DETECTION WITHIN THIS CLINIC ──
    const patientQuery = isMobile 
      ? { tenantId: resolved.tenantId, contact: targetIdentifier }
      : { tenantId: resolved.tenantId, email: cleanEmail };

    const matchingPatients = await Patient.find(patientQuery)
      .select('_id name contact uhId patientId gender age dob email createdAt')
      .lean();

    // Case 1: Ambiguous Patient Match
    if (matchingPatients.length > 1) {
      return res.json({
        status: 'ambiguous_match',
        sessionToken,
        message: `Multiple patient profiles were found with this ${isMobile ? 'mobile number' : 'email'} at this clinic. For your privacy, please proceed to the reception desk for in-person verification.`
      });
    }

    const todayStr = normalizeQueueDate(new Date());

    // Case 2: Exactly One Existing Patient Found
    if (matchingPatients.length === 1) {
      const patientDoc = matchingPatients[0];

      const relevantStatuses = [
        'Pending', 'Pending Approval', 'Approved', 'Confirmed',
        'Waiting', 'In Progress', 'Prescription Pending', 'Paid'
      ];

      const startOfToday = new Date();
      startOfToday.setHours(0, 0, 0, 0);

      const activeAppointments = await Appointment.find({
        tenantId: resolved.tenantId,
        patientId: patientDoc._id,
        status: { $in: relevantStatuses },
        date: { $gte: startOfToday }
      }).populate('doctorId', 'name specialty department avatar').sort({ date: 1, time: 1 }).lean();

      // Case 2A: Existing Patient WITH Relevant Appointment
      if (activeAppointments.length > 0) {
        return res.json({
          status: 'existing_patient_with_appointment',
          patient: {
            name: patientDoc.name,
            uhId: patientDoc.uhId || '',
            patientId: patientDoc.patientId || ''
          },
          appointments: activeAppointments.map(a => ({
            id: a._id,
            date: a.date,
            time: a.time,
            status: a.status,
            doctorName: a.doctorId?.name ? `Dr. ${a.doctorId.name}` : 'Consulting Doctor',
            specialty: a.doctorId?.specialty || a.doctorId?.department || 'General Medicine'
          })),
          message: 'You have an active appointment scheduled. Please report directly to the reception desk for check-in.'
        });
      }

      // Case 2B: Existing Patient WITHOUT Relevant Appointment
      // Enforce capacity check if doctorId & targetAppointmentDate provided
      let capacityReservation = null;
      if (cleanDoctorId && cleanTargetDate) {
        try {
          capacityReservation = await checkAndReserveDoctorCapacity({
            tenantId: resolved.tenantId,
            doctorId: cleanDoctorId,
            date: cleanTargetDate
          });
        } catch (capErr) {
          return res.status(capErr.status || 409).json({
            error: capErr.message || 'This doctor has reached the maximum booking capacity for the selected date. Please select another doctor or date.'
          });
        }
      }

      let ticket;
      try {
        ticket = await allocateReceptionTicket({
          tenantId: resolved.tenantId,
          clinicCode: resolved.clinicCode,
          queueDate: todayStr,
          patientType: 'Existing',
          patientId: patientDoc._id,
          existingPatientDetails: {
            name: patientDoc.name,
            uhId: patientDoc.uhId || '',
            patientId: patientDoc.patientId || ''
          },
          doctorId: cleanDoctorId || null,
          targetAppointmentDate: cleanTargetDate || null
        });
      } catch (ticketErr) {
        if (capacityReservation) {
          await capacityReservation.releaseReservation();
        }
        throw ticketErr;
      }

      // Real-time broadcast
      const io = req.app.get('io');
      broadcastReceptionQueueUpdate(io, resolved.clinicCode, resolved.tenantId, todayStr);

      const position = await getPatientQueuePosition(ticket);

      return res.json({
        status: 'existing_patient_ticket_issued',
        sessionToken: ticket.sessionToken,
        ticket: {
          ticketNumber: ticket.ticketNumber,
          ticketDisplay: ticket.ticketDisplay,
          status: ticket.status,
          queueDate: ticket.queueDate,
          clinicCode: ticket.clinicCode,
          patientType: 'Existing',
          patientName: patientDoc.name,
          doctorId: ticket.doctorId,
          targetAppointmentDate: ticket.targetAppointmentDate
        },
        position
      });
    }

    // Case 3: No Matching Patient Found -> Requires Basic Preliminary Details
    return res.json({
      status: 'new_patient_details_required',
      sessionToken,
      verifiedContact: isMobile ? targetIdentifier : null,
      verifiedEmail: !isMobile ? cleanEmail : null,
      doctorId: cleanDoctorId,
      targetAppointmentDate: cleanTargetDate,
      message: `${isMobile ? 'Mobile number' : 'Email'} verified. Please provide basic details to join the reception queue.`
    });
  } catch (error) {
    console.error('[RECEPTION VERIFY OTP ERROR]:', error);
    return res.status(500).json({ error: 'Failed to verify code.' });
  }
});

// ----------------------------------------------------
// 4. SUBMIT PRELIMINARY DETAILS FOR NEW PATIENT & CREATE PERMANENT RECORD
// POST /api/reception-queue/register-new
// ----------------------------------------------------
router.post('/register-new', async (req, res) => {
  try {
    const { 
      sessionToken, 
      clinicCode, 
      title, 
      name, 
      gender, 
      age, 
      dob, 
      email: customEmail, 
      bloodGroup, 
      address, 
      allergies, 
      idempotencyKey,
      doctorId,
      targetAppointmentDate
    } = req.body;

    const resolved = await resolveClinicAndModule(clinicCode);
    if (resolved.error) {
      return res.status(resolved.status).json({ error: resolved.error });
    }

    if (!resolved.isModuleEnabled) {
      return res.status(403).json({
        error: 'Reception Queue registration is currently disabled for this clinic.'
      });
    }

    // Verify session token
    let secretKey;
    try {
      secretKey = getJwtSecret();
    } catch (e) {
      secretKey = process.env.JWT_SECRET || 'secret_key';
    }

    let decoded;
    try {
      decoded = jwt.verify(sessionToken, secretKey);
    } catch (jwtErr) {
      return res.status(401).json({ error: 'Session expired or invalid. Please verify your mobile number again.' });
    }

    if (!decoded || decoded.purpose !== 'reception_queue_registration' || decoded.tenantId !== resolved.tenantId) {
      return res.status(403).json({ error: 'Unauthorized or cross-clinic session.' });
    }

    // Security: Bind strictly to verified session. Never trust unverified client-supplied contact!
    let targetContact = decoded.contact;
    if (!targetContact) {
      // Legacy email session: validate body.contact
      if (req.body.contact) {
        const phoneCheck = normalizeIndianMobile(req.body.contact);
        if (phoneCheck.isValid) {
          targetContact = phoneCheck.normalized;
        }
      }
      if (!targetContact) {
        return res.status(400).json({ error: 'A valid 10-digit mobile number is required.' });
      }
    }

    // Optional email validation
    let targetEmail = 'N/A';
    if (customEmail && typeof customEmail === 'string' && customEmail.trim()) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      const cleanCustomEmail = customEmail.trim().toLowerCase();
      if (!emailRegex.test(cleanCustomEmail)) {
        return res.status(400).json({ error: 'Please provide a valid email address or leave it empty.' });
      }
      targetEmail = cleanCustomEmail;
    } else if (decoded.email) {
      targetEmail = decoded.email.toLowerCase().trim();
    }

    // 1. Upfront Idempotency Check: if idempotencyKey supplied and already processed, return cached ticket immediately
    if (idempotencyKey) {
      const existingTicket = await ReceptionQueue.findOne({
        tenantId: resolved.tenantId,
        idempotencyKey: String(idempotencyKey).trim()
      });
      if (existingTicket) {
        const position = await getPatientQueuePosition(existingTicket);
        return res.json({
          status: 'new_patient_ticket_issued',
          sessionToken: existingTicket.sessionToken,
          ticket: {
            ticketNumber: existingTicket.ticketNumber,
            ticketDisplay: existingTicket.ticketDisplay,
            status: existingTicket.status,
            queueDate: existingTicket.queueDate,
            clinicCode: existingTicket.clinicCode,
            patientType: existingTicket.patientType,
            patientName: existingTicket.preliminaryDetails?.name || 'Patient',
            doctorId: existingTicket.doctorId,
            targetAppointmentDate: existingTicket.targetAppointmentDate
          },
          position
        });
      }
    }

    // Server-side validation of submitted preliminary details
    if (!name || typeof name !== 'string' || name.trim().length < 2) {
      return res.status(400).json({ error: 'Patient full name is required (minimum 2 characters).' });
    }

    const validGenders = ['Male', 'Female', 'Other'];
    if (!gender || !validGenders.includes(gender)) {
      return res.status(400).json({ error: 'Gender must be Male, Female, or Other.' });
    }

    const numAge = age ? parseInt(age, 10) : (dob ? Math.max(0, new Date().getFullYear() - new Date(dob).getFullYear()) : 0);

    const cleanDoctorId = doctorId || decoded.doctorId || null;
    const cleanTargetDate = targetAppointmentDate || decoded.targetAppointmentDate || null;

    // Concurrency-Safe Atomic Capacity Check if booking doctor
    let capacityReservation = null;
    if (cleanDoctorId && cleanTargetDate) {
      try {
        capacityReservation = await checkAndReserveDoctorCapacity({
          tenantId: resolved.tenantId,
          doctorId: cleanDoctorId,
          date: cleanTargetDate
        });
      } catch (capErr) {
        return res.status(capErr.status || 409).json({
          error: capErr.message || 'This doctor has reached the maximum booking capacity for the selected date. Please select another doctor or date.'
        });
      }
    }

    // CRITICAL: Create or Resolve Permanent Patient Record
    let isNewlyCreatedPatient = false;
    const patientLookupConditions = [{ contact: targetContact }];
    if (targetEmail && targetEmail !== 'N/A') {
      patientLookupConditions.push({ email: targetEmail });
    }

    let permanentPatient = await Patient.findOne({
      tenantId: resolved.tenantId,
      $or: patientLookupConditions
    });

    if (!permanentPatient) {
      isNewlyCreatedPatient = true;
      try {
        const targetUhid = await resolveOrCreateUhid({
          contact: targetContact,
          name: name.trim(),
          email: targetEmail !== 'N/A' ? targetEmail : '',
          abhaId: ''
        });
        const targetHospitalPatientId = await generateHospitalPatientId(resolved.tenantId);

        permanentPatient = await Patient.create({
          tenantId: resolved.tenantId,
          uhId: targetUhid,
          patientId: targetHospitalPatientId,
          title: typeof title === 'string' ? title.trim() : '',
          name: name.trim(),
          contact: targetContact,
          gender,
          age: numAge,
          dob: dob || '',
          email: targetEmail,
          bloodGroup: typeof bloodGroup === 'string' ? bloodGroup.trim() : '',
          address: typeof address === 'string' ? address.trim() : '',
          allergies: (typeof allergies === 'string' && allergies.trim()) ? allergies.trim() : 'None'
        });

        try {
          await Consent.create({
            tenantId: resolved.tenantId,
            patientId: permanentPatient._id,
            purposes: { treatment: true, insurance: true, research: false },
            status: 'Active',
            signature: 'Digitally signed via Reception QR Registration',
            ipAddress: req.ip || req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '127.0.0.1',
            userAgent: req.headers['user-agent'] || 'Reception QR'
          });
        } catch (cErr) {
          console.warn('[RECEPTION QR] Consent creation non-fatal warning:', cErr.message);
        }
      } catch (patCreateErr) {
        if (capacityReservation) {
          await capacityReservation.releaseReservation();
        }
        throw patCreateErr;
      }
    }

    const todayStr = normalizeQueueDate(new Date());

    // Allocate Reception Queue ticket with permanent patientId, doctorId, targetAppointmentDate
    let ticket;
    try {
      ticket = await allocateReceptionTicket({
        tenantId: resolved.tenantId,
        clinicCode: resolved.clinicCode,
        queueDate: todayStr,
        patientType: 'New',
        patientId: permanentPatient._id,
        existingPatientDetails: {
          name: permanentPatient.name,
          uhId: permanentPatient.uhId || '',
          patientId: permanentPatient.patientId || ''
        },
        preliminaryDetails: {
          title: permanentPatient.title || '',
          name: permanentPatient.name,
          contact: permanentPatient.contact,
          gender: permanentPatient.gender,
          age: permanentPatient.age,
          dob: permanentPatient.dob || '',
          email: permanentPatient.email,
          bloodGroup: permanentPatient.bloodGroup || '',
          address: permanentPatient.address || '',
          allergies: permanentPatient.allergies || ''
        },
        idempotencyKey: idempotencyKey ? String(idempotencyKey).trim() : null,
        doctorId: cleanDoctorId || null,
        targetAppointmentDate: cleanTargetDate ? normalizeQueueDate(cleanTargetDate) : null
      });
    } catch (ticketErr) {
      if (isNewlyCreatedPatient && permanentPatient?._id) {
        // FAIL-CLOSED GUARD:
        // Do not interpret a failed ReceptionQueue.exists() database query as "no ticket exists".
        // If the query fails, preserve Patient and Consent records and log a structured error.
        let canDelete = false;
        try {
          const hasTicket = await ReceptionQueue.exists({
            tenantId: resolved.tenantId,
            patientId: permanentPatient._id
          });
          if (!hasTicket) {
            canDelete = true;
          } else {
            console.warn('[RECEPTION_ROLLBACK_BLOCKED] Ticket exists for patient; preserving record.', {
              tenantId: resolved.tenantId,
              patientId: permanentPatient._id
            });
          }
        } catch (dbCheckErr) {
          console.error('[RECEPTION_ROLLBACK_FAIL_CLOSED] Database error during ticket existence check. Preserving Patient and Consent records.', {
            tenantId: resolved.tenantId,
            patientId: permanentPatient._id,
            error: dbCheckErr.message
          });
          canDelete = false; // FAIL-CLOSED
        }

        if (canDelete) {
          // Double-check existence to prevent race condition between check and delete
          const doubleCheck = await ReceptionQueue.exists({
            tenantId: resolved.tenantId,
            patientId: permanentPatient._id
          }).catch(() => true); // fail-closed on error

          if (!doubleCheck) {
            await Patient.deleteOne({ _id: permanentPatient._id, tenantId: resolved.tenantId }).catch((delErr) => {
              console.error('[RECEPTION_ROLLBACK_ERROR] Failed to delete patient:', delErr.message);
            });
            await Consent.deleteMany({ patientId: permanentPatient._id, tenantId: resolved.tenantId }).catch((delErr) => {
              console.error('[RECEPTION_ROLLBACK_ERROR] Failed to delete consent:', delErr.message);
            });
          }
        }
      }
      if (capacityReservation) {
        await capacityReservation.releaseReservation();
      }
      throw ticketErr;
    }

    // Real-time broadcast
    const io = req.app.get('io');
    broadcastReceptionQueueUpdate(io, resolved.clinicCode, resolved.tenantId, todayStr);

    const position = await getPatientQueuePosition(ticket);

    return res.json({
      status: 'new_patient_ticket_issued',
      sessionToken: ticket.sessionToken,
      ticket: {
        ticketNumber: ticket.ticketNumber,
        ticketDisplay: ticket.ticketDisplay,
        status: ticket.status,
        queueDate: ticket.queueDate,
        clinicCode: ticket.clinicCode,
        patientType: 'New',
        patientName: permanentPatient.name,
        doctorId: ticket.doctorId,
        targetAppointmentDate: ticket.targetAppointmentDate
      },
      patient: {
        _id: permanentPatient._id,
        uhId: permanentPatient.uhId,
        patientId: permanentPatient.patientId,
        name: permanentPatient.name
      },
      position
    });
  } catch (error) {
    console.error('[RECEPTION REGISTER NEW ERROR]:', error);
    return res.status(500).json({ error: 'Failed to join reception queue.' });
  }
});

// ----------------------------------------------------
// 5. SECURE TICKET STATUS & POSITION LOOKUP
// GET /api/reception-queue/ticket/:sessionToken
// ----------------------------------------------------
router.get('/ticket/:sessionToken', async (req, res) => {
  try {
    const { sessionToken } = req.params;
    if (!sessionToken || typeof sessionToken !== 'string') {
      return res.status(400).json({ error: 'Ticket session token is required.' });
    }

    const ticket = await ReceptionQueue.findOne({ sessionToken: sessionToken.trim() })
      .populate('doctorId', 'name specialty department avatar');

    if (!ticket) {
      return res.status(404).json({ error: 'Ticket not found or session expired.' });
    }

    const hospital = await SuperAdminHospital.findOne({ code: ticket.tenantId }).select('name code logo phone address').lean();
    const position = await getPatientQueuePosition(ticket);

    const patientName = ticket.patientType === 'Existing'
      ? (ticket.existingPatientDetails?.name || 'Patient')
      : (ticket.preliminaryDetails?.name || 'Patient');

    return res.json({
      ticket: {
        ticketNumber: ticket.ticketNumber,
        ticketDisplay: ticket.ticketDisplay,
        status: ticket.status,
        queueDate: ticket.queueDate,
        clinicCode: ticket.clinicCode,
        patientType: ticket.patientType,
        patientName,
        doctorId: ticket.doctorId?._id || ticket.doctorId || null,
        doctorName: ticket.doctorId?.name ? `Dr. ${ticket.doctorId.name}` : null,
        doctorSpecialty: ticket.doctorId?.specialty || null,
        targetAppointmentDate: ticket.targetAppointmentDate || null,
        createdAt: ticket.createdAt
      },
      hospital: {
        name: hospital?.name || 'Clinic',
        code: ticket.clinicCode,
        logo: hospital?.logo || ''
      },
      position
    });
  } catch (error) {
    console.error('[RECEPTION TICKET LOOKUP ERROR]:', error);
    return res.status(500).json({ error: 'Failed to retrieve ticket status.' });
  }
});

// ----------------------------------------------------
// 6. STAFF RECEPTION QUEUE MANAGEMENT ENDPOINTS
// ----------------------------------------------------

/**
 * Authorization guard for reception staff operations
 */
const authorizeStaffReception = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  const allowedRoles = ['receptionist', 'admin', 'superadmin', 'super_admin', 'platform_admin'];
  if (!allowedRoles.includes(req.user.role)) {
    if (req.user.role !== 'staff') {
      return res.status(403).json({ error: 'Access denied: Receptionist or Admin role required.' });
    }
  }
  if (!req.user.tenantId && req.user.role !== 'superadmin' && req.user.role !== 'super_admin') {
    return res.status(403).json({ error: 'Tenant context missing.' });
  }
  next();
};

/**
 * GET /api/reception-queue/staff/queue
 * Retrieves active queue for authenticated receptionist.
 */
router.get('/staff/queue', verifyToken, authorizeStaffReception, async (req, res) => {
  try {
    const tenantId = req.user.tenantId || req.query.tenantId;
    const hospital = await SuperAdminHospital.findOne({ code: tenantId });
    if (!hospital) {
      return res.status(404).json({ error: 'Clinic tenant record not found.' });
    }

    const effectiveModules = await getHospitalEffectiveModules(hospital);
    const isModuleEnabled = Boolean(effectiveModules.receptionQueue?.enabled);
    const isDrainingMode = !isModuleEnabled;

    const queueDate = req.query.date ? normalizeQueueDate(req.query.date) : normalizeQueueDate(new Date());

    const queueData = await getStaffReceptionQueueData({ tenantId, queueDate });

    return res.json({
      success: true,
      ...queueData,
      isDrainingMode,
      isModuleEnabled,
      hospital: {
        name: hospital.name,
        code: hospital.code,
        logo: hospital.logo || ''
      }
    });
  } catch (error) {
    console.error('[STAFF RECEPTION QUEUE FETCH ERROR]:', error);
    return res.status(500).json({ error: 'Failed to retrieve reception queue.' });
  }
});

/**
 * POST /api/reception-queue/staff/next
 * Advances the queue.
 */
router.post('/staff/next', verifyToken, authorizeStaffReception, async (req, res) => {
  try {
    const tenantId = req.user.tenantId || req.body.tenantId;
    const hospital = await SuperAdminHospital.findOne({ code: tenantId });
    if (!hospital) {
      return res.status(404).json({ error: 'Clinic tenant record not found.' });
    }

    const queueDate = req.body.date ? normalizeQueueDate(req.body.date) : normalizeQueueDate(new Date());
    const currentTicketId = req.body.currentTicketId || null;

    const advanceResult = await advanceReceptionQueue({
      tenantId,
      clinicCode: hospital.code,
      queueDate,
      currentTicketId
    });

    const io = req.app.get('io');
    broadcastReceptionQueueUpdate(io, hospital.code, tenantId, queueDate);

    const updatedQueueData = await getStaffReceptionQueueData({ tenantId, queueDate });

    return res.json({
      success: true,
      advanceResult,
      ...updatedQueueData
    });
  } catch (error) {
    console.error('[STAFF RECEPTION QUEUE NEXT ERROR]:', error);
    return res.status(500).json({ error: 'Failed to advance queue.' });
  }
});

/**
 * POST /api/reception-queue/staff/skip
 * Skips a patient ticket.
 */
router.post('/staff/skip', verifyToken, authorizeStaffReception, async (req, res) => {
  try {
    const tenantId = req.user.tenantId || req.body.tenantId;
    const hospital = await SuperAdminHospital.findOne({ code: tenantId });
    if (!hospital) {
      return res.status(404).json({ error: 'Clinic tenant record not found.' });
    }

    const queueDate = req.body.date ? normalizeQueueDate(req.body.date) : normalizeQueueDate(new Date());
    const ticketId = req.body.ticketId || null;

    const skipResult = await skipReceptionTicket({
      tenantId,
      clinicCode: hospital.code,
      queueDate,
      ticketId
    });

    const io = req.app.get('io');
    broadcastReceptionQueueUpdate(io, hospital.code, tenantId, queueDate);

    const updatedQueueData = await getStaffReceptionQueueData({ tenantId, queueDate });

    return res.json({
      success: true,
      skipResult,
      ...updatedQueueData
    });
  } catch (error) {
    console.error('[STAFF RECEPTION QUEUE SKIP ERROR]:', error);
    return res.status(500).json({ error: 'Failed to skip ticket.' });
  }
});

/**
 * POST /api/reception-queue/staff/complete/:ticketId
 * Marks a ticket as completed after desk processing.
 */
router.post('/staff/complete/:ticketId', verifyToken, authorizeStaffReception, async (req, res) => {
  try {
    const tenantId = req.user.tenantId || req.body.tenantId;
    const hospital = await SuperAdminHospital.findOne({ code: tenantId });
    const { ticketId } = req.params;
    const { patientId } = req.body;

    const completed = await completeReceptionTicket({
      tenantId,
      ticketId,
      patientId: patientId || null
    });

    if (!completed) {
      return res.status(404).json({ error: 'Ticket not found.' });
    }

    const queueDate = completed.queueDate;
    const io = req.app.get('io');
    broadcastReceptionQueueUpdate(io, hospital?.code || completed.clinicCode, tenantId, queueDate);

    return res.json({
      success: true,
      ticket: completed
    });
  } catch (error) {
    console.error('[STAFF RECEPTION QUEUE COMPLETE ERROR]:', error);
    return res.status(500).json({ error: 'Failed to complete ticket.' });
  }
});

/**
 * POST /api/reception-queue/staff/serve/:ticketId
 * Sets a specific ticket to 'Serving' status.
 */
router.post('/staff/serve/:ticketId', verifyToken, authorizeStaffReception, async (req, res) => {
  try {
    const tenantId = req.user.tenantId || req.body.tenantId;
    const hospital = await SuperAdminHospital.findOne({ code: tenantId });
    if (!hospital) {
      return res.status(404).json({ error: 'Clinic tenant record not found.' });
    }

    const { ticketId } = req.params;
    const queueDate = req.body.date ? normalizeQueueDate(req.body.date) : normalizeQueueDate(new Date());

    const servingTicket = await serveReceptionTicket({
      tenantId,
      clinicCode: hospital.code,
      queueDate,
      ticketId
    });

    if (!servingTicket) {
      return res.status(404).json({ error: 'Ticket not found.' });
    }

    const io = req.app.get('io');
    broadcastReceptionQueueUpdate(io, hospital.code, tenantId, queueDate);

    const updatedQueueData = await getStaffReceptionQueueData({ tenantId, queueDate });

    return res.json({
      success: true,
      ticket: servingTicket,
      ...updatedQueueData
    });
  } catch (error) {
    console.error('[STAFF RECEPTION QUEUE SERVE ERROR]:', error);
    return res.status(500).json({ error: 'Failed to set ticket as serving.' });
  }
});

/**
 * GET /api/reception-queue/staff/ticket/:ticketId
 * Retrieves full details for an individual ticket.
 */
router.get('/staff/ticket/:ticketId', verifyToken, authorizeStaffReception, async (req, res) => {
  try {
    const tenantId = req.user.tenantId || req.query.tenantId;
    const { ticketId } = req.params;

    const ticket = await ReceptionQueue.findOne({
      _id: ticketId,
      tenantId
    })
      .populate('patientId', 'name contact uhId patientId gender age dob email address')
      .populate('doctorId', 'name specialty department avatar');

    if (!ticket) {
      return res.status(404).json({ error: 'Ticket not found or cross-clinic access denied.' });
    }

    return res.json({ ticket });
  } catch (error) {
    console.error('[STAFF TICKET FETCH ERROR]:', error);
    return res.status(500).json({ error: 'Failed to retrieve ticket details.' });
  }
});

// ----------------------------------------------------
// 7. CLINIC ADMIN DOCTOR CAPACITY MANAGEMENT ENDPOINTS
// ----------------------------------------------------

/**
 * GET /api/reception-queue/admin/doctor-capacities
 * Returns daily capacities, booked counts and availability for all doctors in this clinic.
 */
router.get('/admin/doctor-capacities', verifyToken, authorizeStaffReception, async (req, res) => {
  try {
    const tenantId = req.user.tenantId || req.query.tenantId;
    if (!tenantId) {
      return res.status(400).json({ error: 'Tenant context required.' });
    }

    const todayStr = normalizeQueueDate(new Date());
    const targetDate = req.query.date ? normalizeQueueDate(req.query.date) : todayStr;

    const doctors = await User.find({
      tenantId,
      role: 'doctor'
    }).select('name specialty department dailyMaxCapacity weeklyOff staff_id avatar').sort({ name: 1 }).lean();

    const capacities = [];

    for (const doc of doctors) {
      const availCheck = await checkDoctorDateAvailability(doc, targetDate, tenantId);
      const isConfigured = Boolean(doc.dailyMaxCapacity && doc.dailyMaxCapacity > 0);
      let bookedCount = 0;
      let remainingCapacity = 0;
      let status = 'Unconfigured';

      if (isConfigured) {
        bookedCount = await calculateDoctorDailyBookedCount({ tenantId, doctorId: doc._id, date: targetDate });
        remainingCapacity = Math.max(0, doc.dailyMaxCapacity - bookedCount);

        if (!availCheck.available) {
          status = availCheck.reason || 'Unavailable';
        } else if (remainingCapacity === 0) {
          status = 'Fully Booked';
        } else {
          status = 'Available';
        }
      } else {
        status = 'Not Configured';
      }

      capacities.push({
        _id: doc._id,
        name: doc.name,
        specialty: doc.specialty || doc.department || 'General Medicine',
        department: doc.department || '',
        avatar: doc.avatar || '',
        dailyMaxCapacity: doc.dailyMaxCapacity || null,
        bookedCount,
        remainingCapacity: isConfigured ? remainingCapacity : null,
        remainingSlots: isConfigured ? remainingCapacity : null,
        status,
        statusBadge: status === 'Fully Booked' ? 'Full' : status,
        isConfigured,
        weeklyOff: doc.weeklyOff || 'Sunday'
      });
    }

    return res.json({
      success: true,
      date: targetDate,
      capacities
    });
  } catch (error) {
    console.error('[ADMIN DOCTOR CAPACITIES ERROR]:', error);
    return res.status(500).json({ error: 'Failed to retrieve doctor capacities.' });
  }
});

/**
 * PUT /api/reception-queue/admin/doctor-capacity/:doctorId
 * Updates the daily QR capacity for a specific doctor.
 */
router.put('/admin/doctor-capacity/:doctorId', verifyToken, async (req, res) => {
  try {
    if (!req.user || !['admin', 'superadmin', 'super_admin'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Access denied: Clinic Administrator privileges required.' });
    }

    const tenantId = req.user.tenantId;
    if (!tenantId) {
      return res.status(400).json({ error: 'Tenant context required.' });
    }

    const { doctorId } = req.params;
    const { dailyMaxCapacity } = req.body;

    if (dailyMaxCapacity === null || dailyMaxCapacity === undefined || dailyMaxCapacity === '') {
      const updated = await User.findOneAndUpdate(
        { _id: doctorId, tenantId, role: 'doctor' },
        { $set: { dailyMaxCapacity: null } },
        { returnDocument: 'after' }
      );
      if (!updated) {
        return res.status(404).json({ error: 'Doctor not found in this clinic.' });
      }
      return res.json({
        success: true,
        message: 'Doctor capacity cleared.',
        doctor: { _id: updated._id, dailyMaxCapacity: null }
      });
    }

    const numCapacity = parseInt(dailyMaxCapacity, 10);
    if (isNaN(numCapacity) || numCapacity < 1) {
      return res.status(400).json({ error: 'Daily capacity must be a positive integer (minimum 1).' });
    }

    const updated = await User.findOneAndUpdate(
      { _id: doctorId, tenantId, role: 'doctor' },
      { $set: { dailyMaxCapacity: numCapacity } },
      { returnDocument: 'after' }
    );

    if (!updated) {
      return res.status(404).json({ error: 'Doctor not found in this clinic.' });
    }

    return res.json({
      success: true,
      message: `Doctor ${updated.name}'s daily QR capacity set to ${numCapacity}.`,
      doctor: {
        _id: updated._id,
        name: updated.name,
        dailyMaxCapacity: updated.dailyMaxCapacity
      }
    });
  } catch (error) {
    console.error('[UPDATE DOCTOR CAPACITY ERROR]:', error);
    return res.status(500).json({ error: 'Failed to update doctor capacity.' });
  }
});

module.exports = router;
module.exports.calculateDoctorDailyBookedCount = calculateDoctorDailyBookedCount;
module.exports.checkDoctorDateAvailability = checkDoctorDateAvailability;
module.exports.checkAndReserveDoctorCapacity = checkAndReserveDoctorCapacity;
