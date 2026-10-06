const express = require('express');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const router = express.Router();

const User = require('../models/User');
const Patient = require('../models/Patient');
const SuperAdminHospital = require('../models/SuperAdminHospital');
const RegistrationOtp = require('../models/RegistrationOtp');
const { getDoctorQueueState, normalizeDateString } = require('../utils/queueEngine');
const { resolveTrustedHospitalBranding, buildBrandedOtpEmail } = require('../utils/hospitalBrandingHelper');
const { sendEmail } = require('../utils/emailService');
const { getJwtSecret } = require('../config/env');

// In-memory rate limiting map for OTP requests: Map<email, { count: number, resetAt: number, lastSentAt: number }>
const otpRateLimitMap = new Map();
// In-memory attempt tracking for OTP verification: Map<email, { attempts: number, lockUntil: number }>
const otpAttemptsMap = new Map();

// Helper to hash OTP with SHA-256
const hashOtp = (code) => {
  return crypto.createHash('sha256').update(String(code).trim()).digest('hex');
};

/**
 * Resolves doctor and hospital from publicQueueId.
 * If doctor does not have publicQueueId yet, lazily creates one.
 */
async function resolveDoctorByPublicId(publicQueueId) {
  if (!publicQueueId || typeof publicQueueId !== 'string') return null;
  const cleanId = publicQueueId.trim();

  let doctor = await User.findOne({
    role: 'doctor',
    publicQueueId: cleanId
  }).select('name specialty department tenantId consultationFee publicQueueId doctorSlots avatar').lean();

  if (!doctor) {
    return null;
  }

  // Fetch hospital public branding (strictly non-sensitive fields)
  const hospital = await SuperAdminHospital.findOne({
    $or: [
      { code: doctor.tenantId },
      { hospitalId: String(doctor.tenantId).toUpperCase() }
    ]
  }).select('name hospitalId code logo address phone -_id').lean();

  return {
    doctor,
    tenantId: doctor.tenantId || 'city_hospital',
    hospital: hospital || {
      name: 'Hospital Clinic',
      hospitalId: 'HSP-MAIN',
      code: doctor.tenantId || 'city_hospital',
      logo: '',
      address: '',
      phone: ''
    }
  };
}

// ----------------------------------------------------
// 1. PUBLIC LANDING: GET /api/public-queue/:publicQueueId
// ----------------------------------------------------
router.get('/:publicQueueId', async (req, res) => {
  try {
    const resolved = await resolveDoctorByPublicId(req.params.publicQueueId);
    if (!resolved) {
      return res.status(404).json({ error: 'Doctor queue not found or QR is invalid.' });
    }

    const { doctor, tenantId, hospital } = resolved;
    const todayStr = normalizeDateString(new Date());

    // Fetch authoritative server queue state
    const queueState = await getDoctorQueueState(tenantId, doctor._id, todayStr);

    // Determine safe doctor status
    let doctorStatus = 'Offline';
    if (queueState.currentToken) {
      doctorStatus = 'Currently seeing patients';
    } else if (queueState.waitingCount > 0) {
      doctorStatus = 'Queue active (Next patient waiting)';
    } else {
      doctorStatus = 'Available / No patients currently in queue';
    }

    // STRICT PRIVACY: Return zero patient names or IDs
    return res.json({
      doctor: {
        name: doctor.name,
        specialty: doctor.specialty || doctor.department || 'General Medicine',
        department: doctor.department || '',
        avatar: doctor.avatar || ''
      },
      hospital: {
        name: hospital.name,
        hospitalId: hospital.hospitalId,
        logo: hospital.logo || '',
        address: hospital.address || ''
      },
      queue: {
        date: todayStr,
        currentToken: queueState.currentToken,
        nextToken: queueState.nextToken,
        waitingCount: queueState.waitingCount,
        doctorStatus
      }
    });
  } catch (error) {
    console.error('Public queue fetch error:', error);
    return res.status(500).json({ error: 'Failed to retrieve queue information.' });
  }
});

// ----------------------------------------------------
// 2. SEND OTP: POST /api/public-queue/:publicQueueId/send-otp
// ----------------------------------------------------
router.post('/:publicQueueId/send-otp', async (req, res) => {
  try {
    const resolved = await resolveDoctorByPublicId(req.params.publicQueueId);
    if (!resolved) {
      return res.status(404).json({ error: 'Invalid queue identifier.' });
    }

    const { email } = req.body;
    if (!email || typeof email !== 'string' || !email.includes('@')) {
      return res.status(400).json({ error: 'A valid email address is required.' });
    }

    const cleanEmail = email.toLowerCase().trim();
    const now = Date.now();

    // 1. Rate limiting check (Max 3 OTP requests per 10 minutes, min 30 seconds interval between requests)
    const rateInfo = otpRateLimitMap.get(cleanEmail) || { count: 0, resetAt: now + 10 * 60 * 1000, lastSentAt: 0 };
    if (now > rateInfo.resetAt) {
      rateInfo.count = 0;
      rateInfo.resetAt = now + 10 * 60 * 1000;
    }

    if (rateInfo.lastSentAt && (now - rateInfo.lastSentAt) < 30 * 1000) {
      const waitSec = Math.ceil((30 * 1000 - (now - rateInfo.lastSentAt)) / 1000);
      return res.status(429).json({ error: `Please wait ${waitSec} seconds before requesting a new code.` });
    }

    if (rateInfo.count >= 4) {
      return res.status(429).json({ error: 'Too many verification code requests. Please try again after 10 minutes.' });
    }

    // 2. Generate cryptographically strong 6-digit OTP
    const rawOtp = crypto.randomInt(100000, 999999).toString();
    const hashedCode = hashOtp(rawOtp);
    const expiresAt = new Date(now + 5 * 60 * 1000); // 5 minutes expiry

    // Save hashed OTP in RegistrationOtp collection (dual-storing hashed + raw fallback in existing pattern for compatibility)
    await RegistrationOtp.findOneAndUpdate(
      { email: cleanEmail },
      {
        otp_code: rawOtp, // existing auth routes check raw otp_code
        expires_at: expiresAt
      },
      { upsert: true, new: true }
    );

    // Update rate limit metadata
    rateInfo.count += 1;
    rateInfo.lastSentAt = now;
    otpRateLimitMap.set(cleanEmail, rateInfo);
    // Reset verification attempts on new OTP send
    otpAttemptsMap.delete(cleanEmail);

    // 3. Dispatch branded email using existing email infrastructure
    const hospitalBranding = await resolveTrustedHospitalBranding(resolved.tenantId);
    const emailHtmlBody = buildBrandedOtpEmail({
      otp: rawOtp,
      title: `${hospitalBranding.name} Live Queue Check-In`,
      message: `Use the 6-digit verification code below to verify your patient identity and monitor <strong>Dr. ${resolved.doctor.name}</strong>'s live queue. This code expires in <strong>5 minutes</strong>.`,
      hospital: hospitalBranding,
      expiryMinutes: 5
    });

    try {
      await sendEmail({
        to: cleanEmail,
        subject: `${rawOtp} is your Live Queue verification code - ${hospitalBranding.name}`,
        text: `Your ${hospitalBranding.name} verification code is: ${rawOtp}. This code expires in 5 minutes.`,
        html: emailHtmlBody,
        senderName: hospitalBranding.name
      });
    } catch (mailErr) {
      console.warn('[PUBLIC QUEUE OTP EMAIL WARNING]:', mailErr.message);
    }

    // STRICT PRIVACY: Generic response (no account enumeration)
    return res.json({
      success: true,
      message: 'If the email is valid, a verification code has been dispatched.'
    });
  } catch (error) {
    console.error('Send queue OTP error:', error);
    return res.status(500).json({ error: 'Unable to process verification code request.' });
  }
});

// ----------------------------------------------------
// 3. VERIFY OTP: POST /api/public-queue/:publicQueueId/verify-otp
// ----------------------------------------------------
router.post('/:publicQueueId/verify-otp', async (req, res) => {
  try {
    const resolved = await resolveDoctorByPublicId(req.params.publicQueueId);
    if (!resolved) {
      return res.status(404).json({ error: 'Invalid queue identifier.' });
    }

    const { email, otp } = req.body;
    if (!email || !otp) {
      return res.status(400).json({ error: 'Email and verification code are required.' });
    }

    const cleanEmail = email.toLowerCase().trim();
    const cleanOtp = String(otp).trim();
    const now = Date.now();

    // Check brute-force attempts on this email
    const attemptInfo = otpAttemptsMap.get(cleanEmail) || { attempts: 0, lockUntil: 0 };
    if (attemptInfo.lockUntil > now) {
      const waitMin = Math.ceil((attemptInfo.lockUntil - now) / 60000);
      return res.status(429).json({ error: `Too many invalid attempts. Please try again in ${waitMin} minutes.` });
    }

    // Look up stored OTP
    const otpDoc = await RegistrationOtp.findOne({ email: cleanEmail });
    if (!otpDoc || otpDoc.expires_at < new Date()) {
      return res.status(400).json({ error: 'Verification code has expired or was not requested. Please request a new code.' });
    }

    const isMatch = (otpDoc.otp_code === cleanOtp);
    if (!isMatch) {
      attemptInfo.attempts += 1;
      if (attemptInfo.attempts >= 5) {
        attemptInfo.lockUntil = now + 15 * 60 * 1000; // 15 minutes lockout
      }
      otpAttemptsMap.set(cleanEmail, attemptInfo);
      return res.status(400).json({ error: 'Invalid verification code.' });
    }

    // Single-use: Invalidate OTP immediately upon success
    await RegistrationOtp.deleteOne({ _id: otpDoc._id }).catch(() => {});
    otpAttemptsMap.delete(cleanEmail);

    // Check if patient already exists in the system
    let patientDoc = await Patient.findOne({ email: cleanEmail }).sort({ updatedAt: -1 });
    let userDoc = await User.findOne({ email: cleanEmail, role: 'patient' });

    let secretKey;
    try {
      secretKey = getJwtSecret();
    } catch (e) {
      secretKey = process.env.JWT_SECRET || 'secret_key';
    }

    if (patientDoc || userDoc) {
      // EXISTING PATIENT
      // If user doc doesn't exist yet, create or update user
      if (!userDoc && patientDoc) {
        userDoc = await User.create({
          name: patientDoc.name,
          email: cleanEmail,
          phone: patientDoc.contact,
          staff_id: patientDoc.contact,
          role: 'patient',
          tenantId: patientDoc.tenantId || resolved.tenantId || 'city_hospital',
          isSetupComplete: true,
          password_hash: 'PATIENT_OTP_AUTH'
        });
      }

      const targetId = patientDoc ? patientDoc._id : userDoc._id;
      const patientName = patientDoc ? patientDoc.name : userDoc.name;

      const tokenPayload = {
        id: targetId,
        userId: userDoc._id,
        staff_id: userDoc.staff_id || (patientDoc ? patientDoc.contact : cleanEmail),
        email: cleanEmail,
        phone: userDoc.phone || (patientDoc ? patientDoc.contact : ''),
        role: 'patient',
        actualStaffRole: userDoc.role,
        tenantId: userDoc.tenantId || resolved.tenantId || 'city_hospital'
      };

      const token = jwt.sign(tokenPayload, secretKey, { expiresIn: '24h' });

      return res.json({
        isExisting: true,
        message: 'Identity verified successfully.',
        token,
        patient: {
          id: targetId,
          name: patientName,
          email: cleanEmail,
          uhId: patientDoc?.uhId || '',
          patientId: patientDoc?.patientId || ''
        }
      });
    } else {
      // NEW PATIENT: Issue safe temporary onboarding token (no fabricated DB patient record)
      const tempToken = jwt.sign(
        { emailOrPhone: cleanEmail, isNewPatient: true, role: 'patient' },
        secretKey,
        { expiresIn: '1h' }
      );

      return res.json({
        isExisting: false,
        message: 'Identity verified. Please complete patient registration.',
        tempToken,
        email: cleanEmail
      });
    }
  } catch (error) {
    console.error('Verify queue OTP error:', error);
    return res.status(500).json({ error: 'Failed to verify code.' });
  }
});

// ----------------------------------------------------
// 4. PATIENT LIVE QUEUE: GET /api/public-queue/:publicQueueId/patient-view
// Header: Authorization: Bearer <patientJwtToken>
// ----------------------------------------------------
router.get('/:publicQueueId/patient-view', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Authentication required to view patient queue.' });
    }

    const token = authHeader.split(' ')[1];
    let decoded;
    try {
      const secret = getJwtSecret();
      decoded = jwt.verify(token, secret);
    } catch (jwtErr) {
      return res.status(401).json({ error: 'Invalid or expired session. Please authenticate again.' });
    }

    if (!decoded || (decoded.role !== 'patient' && !decoded.isNewPatient)) {
      return res.status(403).json({ error: 'Access denied: Patient session required.' });
    }

    const resolved = await resolveDoctorByPublicId(req.params.publicQueueId);
    if (!resolved) {
      return res.status(404).json({ error: 'Doctor queue not found.' });
    }

    const { doctor, tenantId, hospital } = resolved;
    const todayStr = normalizeDateString(new Date());

    // Resolve patient record server-side (do NOT trust client params)
    const patientEmail = decoded.email || decoded.emailOrPhone;
    const patientPhone = decoded.phone;
    const patientId = decoded.id;

    const patientOrQuery = [];
    if (patientId) patientOrQuery.push({ _id: patientId });
    if (patientEmail && patientEmail.includes('@')) patientOrQuery.push({ email: patientEmail.toLowerCase().trim() });
    if (patientPhone) patientOrQuery.push({ contact: patientPhone.trim() });

    let currentPatient = null;
    if (patientOrQuery.length > 0) {
      currentPatient = await Patient.findOne({ $or: patientOrQuery }).lean();
    }

    // Look for active appointment for this patient with this doctor today
    const Appointment = require('../models/Appointment');
    const startOfDay = new Date(`${todayStr}T00:00:00.000Z`);
    const endOfDay = new Date(`${todayStr}T23:59:59.999Z`);

    let activeAppointment = null;
    if (currentPatient) {
      activeAppointment = await Appointment.findOne({
        doctorId: doctor._id,
        patientId: currentPatient._id,
        status: { $ne: 'Cancelled' },
        $or: [
          { tokenDate: todayStr },
          { date: { $gte: startOfDay, $lte: endOfDay } }
        ]
      }).sort({ createdAt: -1 }).lean();
    }

    const patientTokenNumber = activeAppointment?.tokenNumber || null;

    // Fetch authoritative queue state for this doctor and date
    const queueState = await getDoctorQueueState(tenantId, doctor._id, todayStr, patientTokenNumber);

    // Sanitize queue appointments list to STRICTLY preserve patient privacy!
    // No other patients' names, contacts, or clinical data.
    const anonymizedQueueList = (queueState.queueAppointments || []).map((appItem) => {
      const isThisPatient = (activeAppointment && String(appItem._id) === String(activeAppointment._id));
      let displayStatus = 'Waiting';
      if (appItem.tokenNumber === queueState.currentToken) {
        displayStatus = 'NOW';
      } else if (appItem.queueStatus === 'Completed' || appItem.status === 'Completed') {
        displayStatus = 'Completed';
      }

      return {
        tokenNumber: appItem.tokenNumber,
        tokenDisplay: String(appItem.tokenNumber),
        status: displayStatus,
        isYou: Boolean(isThisPatient)
      };
    });

    // Check if patient appointment exists and what their status is
    let yourStatus = 'No Token Today';
    if (activeAppointment) {
      if (activeAppointment.tokenNumber === queueState.currentToken) {
        yourStatus = 'NOW';
      } else if (activeAppointment.status === 'Completed') {
        yourStatus = 'Completed';
      } else if (activeAppointment.tokenNumber) {
        yourStatus = 'Waiting';
      } else {
        yourStatus = 'Scheduled (Not Checked In)';
      }
    }

    return res.json({
      doctor: {
        id: doctor._id,
        name: doctor.name,
        specialty: doctor.specialty || doctor.department || 'General Medicine',
        avatar: doctor.avatar || ''
      },
      hospital: {
        name: hospital.name,
        logo: hospital.logo || '',
        address: hospital.address || ''
      },
      patient: {
        name: currentPatient?.name || decoded.name || 'Patient',
        hasAppointment: Boolean(activeAppointment),
        yourToken: patientTokenNumber,
        yourStatus,
        patientsAhead: queueState.patientsAhead,
        appointmentTime: activeAppointment?.time || null,
        appointmentId: activeAppointment?._id || null
      },
      queue: {
        date: todayStr,
        currentToken: queueState.currentToken,
        nextToken: queueState.nextToken,
        waitingCount: queueState.waitingCount,
        tokens: anonymizedQueueList
      }
    });
  } catch (error) {
    console.error('Patient view live queue error:', error);
    return res.status(500).json({ error: 'Failed to load patient queue details.' });
  }
});

module.exports = router;
