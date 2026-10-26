const express = require('express');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const router = express.Router();

const SuperAdminHospital = require('../models/SuperAdminHospital');
const Patient = require('../models/Patient');
const Appointment = require('../models/Appointment');
const ReceptionQueue = require('../models/ReceptionQueue');
const ReceptionOtp = require('../models/ReceptionOtp');
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
  completeReceptionTicket
} = require('../utils/receptionQueueEngine');
const { resolveTrustedHospitalBranding, buildBrandedOtpEmail } = require('../utils/hospitalBrandingHelper');
const { sendEmail } = require('../utils/emailService');
const { getJwtSecret } = require('../config/env');

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
// 1B. PUBLIC RECEPTION DISPLAY FOR WAITING ROOMS (READ-ONLY)
// GET /api/reception-queue/display/:clinicCode
// Strictly sanitized queue status for public screens (TV, monitors, tablets).
// Zero patient identifiers, zero administrative controls, zero database writes.
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
        // Module disabled by Super Admin, but in-flight tickets remain for staff to drain
        isDrainingMode = true;
        displayState = queueState.isServing ? 'serving' : 'idle';
      } else {
        // Module disabled and queue is empty/drained
        isDrainingMode = false;
        displayState = 'unavailable';
      }
    }

    return res.json({
      success: true,
      clinic: {
        name: hospital.name,
        code: (hospital.code || cleanClinicCode).toUpperCase(),
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
// 2. DISPATCH EMAIL OTP
// POST /api/reception-queue/send-otp
// ----------------------------------------------------
router.post('/send-otp', async (req, res) => {
  try {
    const { clinicCode, email } = req.body;
    const resolved = await resolveClinicAndModule(clinicCode);
    if (resolved.error) {
      return res.status(resolved.status).json({ error: resolved.error });
    }

    if (!resolved.isModuleEnabled) {
      return res.status(403).json({
        error: 'Reception Queue registration is currently disabled for this clinic.'
      });
    }

    if (!email || typeof email !== 'string' || !email.includes('@')) {
      return res.status(400).json({ error: 'A valid email address is required.' });
    }

    const cleanEmail = email.toLowerCase().trim();
    const now = Date.now();

    // Rate Limiting Check
    const rateInfo = otpRateLimitMap.get(cleanEmail) || { count: 0, resetAt: now + 10 * 60 * 1000, lastSentAt: 0 };
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

    // Generate 6-digit cryptographic OTP
    const rawOtp = crypto.randomInt(100000, 999999).toString();
    const expiresAt = new Date(now + 10 * 60 * 1000); // 10 minutes expiry

    // Save in tenant-scoped ReceptionOtp collection (HMAC-SHA256 hashed for security)
    await ReceptionOtp.findOneAndUpdate(
      { email: cleanEmail, tenantId: resolved.tenantId },
      {
        clinicCode: resolved.clinicCode,
        otp_code: hashOtp(rawOtp, cleanEmail, resolved.tenantId),
        expires_at: expiresAt,
        attempts: 0,
        lockUntil: null,
        consumed: false
      },
      { upsert: true, returnDocument: 'after' }
    );

    rateInfo.count += 1;
    rateInfo.lastSentAt = now;
    otpRateLimitMap.set(cleanEmail, rateInfo);

    // Send email using existing white-labeled branding
    const hospitalBranding = await resolveTrustedHospitalBranding(resolved.tenantId);
    const emailHtmlBody = buildBrandedOtpEmail({
      otp: rawOtp,
      title: `${hospitalBranding.name} Reception Check-In`,
      message: `Use the 6-digit verification code below to verify your identity and enter the reception queue at <strong>${hospitalBranding.name}</strong>. This code expires in <strong>10 minutes</strong>.`,
      hospital: hospitalBranding,
      expiryMinutes: 10
    });

    try {
      await sendEmail({
        to: cleanEmail,
        subject: `${rawOtp} is your Reception Queue verification code - ${hospitalBranding.name}`,
        text: `Your ${hospitalBranding.name} reception verification code is: ${rawOtp}. Valid for 10 minutes.`,
        html: emailHtmlBody,
        senderName: hospitalBranding.name
      });
    } catch (mailErr) {
      console.warn('[RECEPTION OTP EMAIL WARNING]:', mailErr.message);
    }

    return res.json({
      success: true,
      message: 'If the email is valid, a verification code has been dispatched.'
    });
  } catch (error) {
    console.error('[RECEPTION SEND OTP ERROR]:', error);
    return res.status(500).json({ error: 'Unable to process verification code request.' });
  }
});

// ----------------------------------------------------
// 3. VERIFY EMAIL OTP & DETECT PATIENT STATUS
// POST /api/reception-queue/verify-otp
// ----------------------------------------------------
router.post('/verify-otp', async (req, res) => {
  try {
    const { clinicCode, email, otp } = req.body;
    const resolved = await resolveClinicAndModule(clinicCode);
    if (resolved.error) {
      return res.status(resolved.status).json({ error: resolved.error });
    }

    if (!resolved.isModuleEnabled) {
      return res.status(403).json({
        error: 'Reception Queue registration is currently disabled for this clinic.'
      });
    }

    if (!email || !otp) {
      return res.status(400).json({ error: 'Email and verification code are required.' });
    }

    const cleanEmail = email.toLowerCase().trim();
    const cleanOtp = String(otp).trim();
    const now = Date.now();

    // Look up stored OTP strictly scoped to this tenant
    const otpDoc = await ReceptionOtp.findOne({
      email: cleanEmail,
      tenantId: resolved.tenantId
    });

    if (!otpDoc || otpDoc.expires_at < new Date() || otpDoc.consumed) {
      return res.status(400).json({
        error: 'Verification code has expired or was already used. Please request a new code.'
      });
    }

    // Check durable brute-force lockout on the OTP document
    if (otpDoc.lockUntil && otpDoc.lockUntil > new Date()) {
      const waitMin = Math.ceil((new Date(otpDoc.lockUntil).getTime() - now) / 60000);
      return res.status(429).json({ error: `Too many invalid attempts. Please try again in ${waitMin} minutes.` });
    }

    // Server-secret-based HMAC verification with constant-time equality check
    const candidateHash = hashOtp(cleanOtp, cleanEmail, resolved.tenantId);
    let isOtpValid = false;
    try {
      const storedBuf = Buffer.from(otpDoc.otp_code, 'hex');
      const candBuf = Buffer.from(candidateHash, 'hex');
      if (storedBuf.length === candBuf.length && crypto.timingSafeEqual(storedBuf, candBuf)) {
        isOtpValid = true;
      }
    } catch (cmpErr) {
      isOtpValid = false;
    }

    if (!isOtpValid) {
      otpDoc.attempts = (otpDoc.attempts || 0) + 1;
      if (otpDoc.attempts >= 5) {
        otpDoc.lockUntil = new Date(now + 15 * 60 * 1000); // 15 mins lock
      }
      await otpDoc.save();
      return res.status(400).json({ error: 'Invalid verification code.' });
    }

    // Mark OTP as consumed to prevent replay attacks
    otpDoc.consumed = true;
    otpDoc.verifiedAt = new Date();
    await otpDoc.save();

    // Create short-lived reception registration session token
    let secretKey;
    try {
      secretKey = getJwtSecret();
    } catch (e) {
      secretKey = process.env.JWT_SECRET || 'secret_key';
    }

    const sessionPayload = {
      email: cleanEmail,
      tenantId: resolved.tenantId,
      clinicCode: resolved.clinicCode,
      purpose: 'reception_queue_registration'
    };
    const sessionToken = jwt.sign(sessionPayload, secretKey, { expiresIn: '30m' });

    // ── PATIENT DETECTION WITHIN THIS CLINIC ──
    const matchingPatients = await Patient.find({
      tenantId: resolved.tenantId,
      email: cleanEmail
    }).select('_id name contact uhId patientId gender age dob email createdAt').lean();

    // Case 1: Ambiguous Patient Match (Multiple patients with same email in this clinic)
    if (matchingPatients.length > 1) {
      return res.json({
        status: 'ambiguous_match',
        sessionToken,
        message: 'Multiple patient profiles were found with this email at this clinic. For your privacy, please proceed to the reception desk for in-person verification.'
      });
    }

    const todayStr = normalizeQueueDate(new Date());

    // Case 2: Exactly One Existing Patient Found
    if (matchingPatients.length === 1) {
      const patientDoc = matchingPatients[0];

      // Check for active / relevant appointments (not cancelled, completed, or no-show)
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
      // Inform patient of existing appointment, DO NOT issue reception queue ticket, DO NOT allocate doctor token
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
      // Issue (or return today's existing) Reception Queue Ticket
      const ticket = await allocateReceptionTicket({
        tenantId: resolved.tenantId,
        clinicCode: resolved.clinicCode,
        queueDate: todayStr,
        patientType: 'Existing',
        patientId: patientDoc._id,
        existingPatientDetails: {
          name: patientDoc.name,
          uhId: patientDoc.uhId || '',
          patientId: patientDoc.patientId || ''
        }
      });

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
          patientName: patientDoc.name
        },
        position
      });
    }

    // Case 3: No Matching Patient Found -> Requires Basic Preliminary Details
    return res.json({
      status: 'new_patient_details_required',
      sessionToken,
      verifiedEmail: cleanEmail,
      message: 'Email verified. Please provide basic details to join the reception queue.'
    });
  } catch (error) {
    console.error('[RECEPTION VERIFY OTP ERROR]:', error);
    return res.status(500).json({ error: 'Failed to verify code.' });
  }
});

// ----------------------------------------------------
// 4. SUBMIT PRELIMINARY DETAILS FOR NEW PATIENT
// POST /api/reception-queue/register-new
// ----------------------------------------------------
router.post('/register-new', async (req, res) => {
  try {
    const { sessionToken, clinicCode, name, contact, gender, age, dob, idempotencyKey } = req.body;

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
      return res.status(401).json({ error: 'Session expired or invalid. Please verify your email again.' });
    }

    if (!decoded || decoded.purpose !== 'reception_queue_registration' || decoded.tenantId !== resolved.tenantId) {
      return res.status(403).json({ error: 'Unauthorized or cross-clinic session.' });
    }

    const verifiedEmail = decoded.email;

    // Server-side validation of submitted preliminary details
    if (!name || typeof name !== 'string' || name.trim().length < 2) {
      return res.status(400).json({ error: 'Patient full name is required (minimum 2 characters).' });
    }

    const cleanContact = String(contact || '').trim().replace(/\D/g, '');
    if (!cleanContact || cleanContact.length < 10) {
      return res.status(400).json({ error: 'A valid 10-digit mobile number is required.' });
    }

    const validGenders = ['Male', 'Female', 'Other'];
    if (!gender || !validGenders.includes(gender)) {
      return res.status(400).json({ error: 'Gender must be Male, Female, or Other.' });
    }

    const numAge = age ? parseInt(age, 10) : (dob ? Math.max(0, new Date().getFullYear() - new Date(dob).getFullYear()) : 0);

    const todayStr = normalizeQueueDate(new Date());

    // CRITICAL: Allocate Reception Queue ticket WITHOUT creating permanent Patient, User, Appointment, or Visit records
    const ticket = await allocateReceptionTicket({
      tenantId: resolved.tenantId,
      clinicCode: resolved.clinicCode,
      queueDate: todayStr,
      patientType: 'New',
      preliminaryDetails: {
        name: name.trim(),
        contact: cleanContact,
        gender,
        age: numAge,
        dob: dob || '',
        email: verifiedEmail
      },
      idempotencyKey: idempotencyKey ? String(idempotencyKey).trim() : null
    });

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
        patientName: name.trim()
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

    const ticket = await ReceptionQueue.findOne({ sessionToken: sessionToken.trim() });
    if (!ticket) {
      return res.status(404).json({ error: 'Ticket not found or session expired.' });
    }

    // Retrieve clinic info (allowed even if module is disabled, so existing tickets can be monitored)
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
    // If not direct role, check if user has temporary role delegation
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
 * Supports Draining Mode: If module is disabled by Super Admin, staff can still view and drain existing tickets.
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
 * Advances the queue: completes current serving ticket (if any), promotes next waiting.
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

    // Real-time broadcast to public room & staff
    const io = req.app.get('io');
    broadcastReceptionQueueUpdate(io, hospital.code, tenantId, queueDate);

    // Return fresh queue dataset
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
 * Skips a patient ticket atomically and advances queue.
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

    // Real-time broadcast
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
    }).populate('patientId', 'name contact uhId patientId gender age dob email address');

    if (!ticket) {
      return res.status(404).json({ error: 'Ticket not found or cross-clinic access denied.' });
    }

    return res.json({ ticket });
  } catch (error) {
    console.error('[STAFF TICKET FETCH ERROR]:', error);
    return res.status(500).json({ error: 'Failed to retrieve ticket details.' });
  }
});

module.exports = router;
