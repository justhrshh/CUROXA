const express = require('express');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const router = express.Router();

const User = require('../models/User');
const Patient = require('../models/Patient');
const SuperAdminHospital = require('../models/SuperAdminHospital');
const { getDoctorQueueState, normalizeDateString } = require('../utils/queueEngine');
const { resolveTrustedHospitalBranding, buildBrandedOtpEmail } = require('../utils/hospitalBrandingHelper');
const { sendEmail } = require('../utils/emailService');
const { getJwtSecret } = require('../config/env');
const { 
  createAndDispatchOtp, 
  atomicVerifyOtp,
  generateProfileSelectionToken,
  verifyAndConsumeProfileSelectionToken
} = require('../services/otp/otpService');
const { 
  normalizeIndianMobile, 
  isValidIndianMobile, 
  maskPhoneNumber 
} = require('../utils/phoneNormalization');

// ----------------------------------------------------
// PUBLIC DOCTOR QUEUE LIVE VIEW ROUTES
// ----------------------------------------------------

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
// Mobile SMS Primary via PING4SMS gateway
// ----------------------------------------------------
router.post('/:publicQueueId/send-otp', async (req, res) => {
  try {
    const resolved = await resolveDoctorByPublicId(req.params.publicQueueId);
    if (!resolved) {
      return res.status(404).json({ error: 'Invalid queue identifier.' });
    }

    const rawMobile = req.body.mobile || req.body.phone || req.body.contact;
    if (!rawMobile) {
      return res.status(400).json({ error: 'A valid 10-digit Indian mobile number is required.' });
    }

    const phoneValidation = normalizeIndianMobile(rawMobile);
    if (!phoneValidation.isValid) {
      return res.status(400).json({ error: phoneValidation.error || 'A valid 10-digit Indian mobile number is required.' });
    }

    const cleanMobile = phoneValidation.normalized;

    // Central challenge dispatch via otpService with Zero-Orphan Rollback commitment
    const dispatchResult = await createAndDispatchOtp({
      targetIdentifier: cleanMobile,
      identifierType: 'phone',
      tenantId: resolved.tenantId,
      purpose: 'PUBLIC_DOCTOR_QUEUE',
      deliveryChannel: 'sms',
      expiryMinutes: 10,
      _mockSmsTransport: req.body._mockSmsTransport || req.app.get('mockSmsTransport')
    });

    if (!dispatchResult.success) {
      return res.status(dispatchResult.status || 500).json({
        error: dispatchResult.error || 'Failed to deliver SMS verification code. Please check your mobile number or try again later.'
      });
    }

    const maskedMobile = maskPhoneNumber(cleanMobile);
    return res.json({
      success: true,
      channel: 'sms',
      message: `A 6-digit verification code has been dispatched via SMS to ${maskedMobile}.`,
      maskedMobile,
      mobile: maskedMobile
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

    const rawMobile = req.body.mobile || req.body.phone || req.body.contact;
    const { otp } = req.body;

    if (!rawMobile || !otp) {
      return res.status(400).json({ error: 'Mobile number and verification code are required.' });
    }

    const phoneValidation = normalizeIndianMobile(rawMobile);
    if (!phoneValidation.isValid) {
      return res.status(400).json({ error: phoneValidation.error || 'A valid 10-digit Indian mobile number is required.' });
    }

    const cleanMobile = phoneValidation.normalized;
    const cleanOtp = String(otp).trim();

    // 1. Central atomic verification (purpose: PUBLIC_DOCTOR_QUEUE)
    const verifyResult = await atomicVerifyOtp({
      targetIdentifier: cleanMobile,
      tenantId: resolved.tenantId,
      purpose: 'PUBLIC_DOCTOR_QUEUE',
      otpCandidate: cleanOtp
    });

    if (!verifyResult.success) {
      return res.status(verifyResult.status || 400).json({ error: verifyResult.error || 'Invalid verification code.' });
    }

    let secretKey;
    try {
      secretKey = getJwtSecret();
    } catch (e) {
      secretKey = process.env.JWT_SECRET || 'secret_key';
    }

    // 2. Query patient records matching this verified mobile strictly within this tenant
    const matchingPatients = await Patient.find({
      tenantId: resolved.tenantId,
      contact: cleanMobile
    }).sort({ updatedAt: -1 }).lean();

    // 3. Shared family mobile disambiguation: multiple profiles detected
    if (matchingPatients.length > 1) {
      const profileSelectionToken = await generateProfileSelectionToken({
        tenantId: resolved.tenantId,
        contact: cleanMobile,
        allowedPatientIds: matchingPatients.map(p => p._id.toString())
      });

      return res.json({
        isExisting: true,
        multipleProfiles: true,
        message: 'Multiple patient profiles found for this mobile number. Please select your profile.',
        profileSelectionToken,
        profiles: matchingPatients.map(p => ({
          id: p._id.toString(),
          name: p.name,
          uhId: p.uhId || p.patientId || '',
          gender: p.gender || '',
          age: p.age || null
        }))
      });
    }

    // 4. Single existing patient found
    if (matchingPatients.length === 1) {
      const patientDoc = matchingPatients[0];

      let userDoc = await User.findOne({ staff_id: cleanMobile, tenantId: resolved.tenantId }) ||
                    await User.findOne({ phone: cleanMobile, role: 'patient', tenantId: resolved.tenantId });

      if (!userDoc) {
        userDoc = await User.create({
          name: patientDoc.name,
          email: patientDoc.email || `${cleanMobile}_${patientDoc._id}@curoxa.patient`,
          phone: cleanMobile,
          staff_id: cleanMobile,
          role: 'patient',
          tenantId: patientDoc.tenantId || resolved.tenantId,
          isSetupComplete: true,
          password_hash: 'PATIENT_OTP_AUTH'
        });
      }

      const tokenPayload = {
        id: patientDoc._id,
        userId: userDoc._id,
        staff_id: userDoc.staff_id || cleanMobile,
        email: patientDoc.email || userDoc.email || '',
        phone: cleanMobile,
        role: 'patient',
        actualStaffRole: userDoc.role,
        tenantId: patientDoc.tenantId || resolved.tenantId
      };

      const token = jwt.sign(tokenPayload, secretKey, { expiresIn: '24h' });

      return res.json({
        isExisting: true,
        multipleProfiles: false,
        message: 'Identity verified successfully.',
        token,
        patient: {
          id: patientDoc._id,
          name: patientDoc.name,
          phone: cleanMobile,
          email: patientDoc.email || '',
          uhId: patientDoc?.uhId || '',
          patientId: patientDoc?.patientId || ''
        }
      });
    }

    // 5. Existing registered user without patient record
    let userDoc = await User.findOne({ phone: cleanMobile, role: 'patient', tenantId: resolved.tenantId });
    if (userDoc) {
      const tokenPayload = {
        id: userDoc._id,
        userId: userDoc._id,
        staff_id: userDoc.staff_id || cleanMobile,
        email: userDoc.email || '',
        phone: cleanMobile,
        role: 'patient',
        actualStaffRole: userDoc.role,
        tenantId: userDoc.tenantId || resolved.tenantId
      };
      const token = jwt.sign(tokenPayload, secretKey, { expiresIn: '24h' });

      return res.json({
        isExisting: true,
        multipleProfiles: false,
        message: 'Identity verified successfully.',
        token,
        patient: {
          id: userDoc._id,
          name: userDoc.name,
          phone: cleanMobile,
          email: userDoc.email || '',
          uhId: '',
          patientId: ''
        }
      });
    }

    // 6. NEW PATIENT: Issue safe temporary onboarding token (no fabricated DB patient record)
    const tempToken = jwt.sign(
      { emailOrPhone: cleanMobile, isNewPatient: true, role: 'patient' },
      secretKey,
      { expiresIn: '1h' }
    );

    return res.json({
      isExisting: false,
      multipleProfiles: false,
      message: 'Identity verified. Please complete patient registration.',
      tempToken,
      mobile: cleanMobile
    });
  } catch (error) {
    console.error('Verify queue OTP error:', error);
    return res.status(500).json({ error: 'Failed to verify code.' });
  }
});

// ----------------------------------------------------
// 3A. SELECT PROFILE: POST /api/public-queue/:publicQueueId/select-profile
// Secure disambiguation endpoint for shared family mobile numbers
// ----------------------------------------------------
router.post('/:publicQueueId/select-profile', async (req, res) => {
  try {
    const resolved = await resolveDoctorByPublicId(req.params.publicQueueId);
    if (!resolved) {
      return res.status(404).json({ error: 'Invalid queue identifier.' });
    }

    const { profileSelectionToken, patientId } = req.body;
    if (!profileSelectionToken || !patientId) {
      return res.status(400).json({ error: 'profileSelectionToken and patientId are required.' });
    }

    // 1. Atomically verify and consume single-use token in persistent storage
    const tokenValidation = await verifyAndConsumeProfileSelectionToken(profileSelectionToken, patientId);
    if (!tokenValidation.valid) {
      return res.status(403).json({ error: tokenValidation.error });
    }

    // 2. Fetch authenticated patient record strictly scoped to authorized tenant
    const patientDoc = await Patient.findOne({ _id: patientId, tenantId: tokenValidation.tenantId });
    if (!patientDoc) {
      return res.status(403).json({ error: 'Access denied. The requested patient profile is not authorized for this hospital session.' });
    }

    let secretKey;
    try {
      secretKey = getJwtSecret();
    } catch (e) {
      secretKey = process.env.JWT_SECRET || 'secret_key';
    }

    // 3. Resolve or create user account for this patient profile
    let userDoc = await User.findOne({ staff_id: patientDoc.contact, tenantId: patientDoc.tenantId }) ||
                  await User.findOne({ phone: patientDoc.contact, role: 'patient', tenantId: patientDoc.tenantId });

    if (!userDoc) {
      userDoc = await User.create({
        name: patientDoc.name,
        email: patientDoc.email || `${patientDoc.contact}_${patientDoc._id}@curoxa.patient`,
        phone: patientDoc.contact,
        staff_id: patientDoc.contact,
        role: 'patient',
        tenantId: patientDoc.tenantId || tokenValidation.tenantId,
        isSetupComplete: true,
        password_hash: 'PATIENT_OTP_AUTH'
      });
    }

    // 4. Generate authenticated 24h patient session token
    const tokenPayload = {
      id: patientDoc._id,
      userId: userDoc._id,
      staff_id: userDoc.staff_id || patientDoc.contact,
      email: patientDoc.email || userDoc.email || '',
      phone: patientDoc.contact,
      role: 'patient',
      actualStaffRole: userDoc.role,
      tenantId: patientDoc.tenantId || userDoc.tenantId || tokenValidation.tenantId
    };
    const token = jwt.sign(tokenPayload, secretKey, { expiresIn: '24h' });

    return res.json({
      success: true,
      message: 'Profile selected successfully.',
      token,
      patient: {
        id: patientDoc._id,
        name: patientDoc.name,
        phone: patientDoc.contact,
        email: patientDoc.email || '',
        uhId: patientDoc.uhId || '',
        patientId: patientDoc.patientId || ''
      }
    });
  } catch (error) {
    console.error('Select queue profile error:', error);
    return res.status(500).json({ error: 'Failed to select patient profile.' });
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
    const patientPhone = decoded.phone || (decoded.emailOrPhone && !decoded.emailOrPhone.includes('@') ? decoded.emailOrPhone : null);
    const patientId = decoded.id;

    const patientOrQuery = [];
    if (patientId) patientOrQuery.push({ _id: patientId });
    if (patientEmail && patientEmail.includes('@')) patientOrQuery.push({ email: patientEmail.toLowerCase().trim() });
    if (patientPhone) patientOrQuery.push({ contact: patientPhone.trim() });

    let currentPatient = null;
    if (patientOrQuery.length > 0) {
      currentPatient = await Patient.findOne({
        tenantId: resolved.tenantId,
        $or: patientOrQuery
      }).lean();
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
