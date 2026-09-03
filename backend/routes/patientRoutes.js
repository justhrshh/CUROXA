const express = require('express');
const Patient = require('../models/Patient');
const User = require('../models/User');
const { verifyToken } = require('../middleware/authMiddleware');
const { checkDoctorClinicalMode } = require('../middleware/subscriptionMiddleware');
const { isPatientProfileComplete } = require('../utils/patientProfileHelper');
const router = express.Router();

router.use(verifyToken);
router.use(checkDoctorClinicalMode);

// Get all patients (scoped to tenant)
router.get('/', async (req, res) => {
  try {
    const patients = await Patient.find({ tenantId: req.tenantId }).sort({ createdAt: 1 });
    let changed = false;
    for (let i = 0; i < patients.length; i++) {
      if (!patients[i].patientId) {
        patients[i].patientId = `pat-${String(i + 1).padStart(2, '0')}`;
        await patients[i].save();
        changed = true;
      }
    }
    const patientsToReturn = changed ? await Patient.find({ tenantId: req.tenantId }).sort({ createdAt: -1 }) : patients.reverse();
    res.json(patientsToReturn);
  } catch (error) {
    console.error("Get patients error:", error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create a new patient (scoped to tenant)
router.post('/', async (req, res) => {
  const { name, age, ageMonths, ageDays, gender, contact, email, address, bloodGroup, allergies, currentMedications, medicalHistory, avatar, otp } = req.body;
  try {
    if (!contact || contact.trim() === '') {
      return res.status(400).json({ error: "Contact/Phone number is mandatory for patient registration." });
    }

    const fallbackOtpEmail = (req.user && req.user.emailOrPhone && req.user.emailOrPhone.includes('@')) ? req.user.emailOrPhone.toLowerCase().trim() : '';
    const cleanEmail = (email && email.trim() && email.trim().toLowerCase() !== 'n/a') ? email.toLowerCase().trim() : fallbackOtpEmail;
    const cleanContact = contact.trim();

    // Check if email is already registered to another patient (case-insensitive)
    if (cleanEmail && cleanEmail !== '') {
      const existingEmailPatient = await Patient.findOne({
        tenantId: req.tenantId,
        email: { $regex: new RegExp(`^${cleanEmail.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') }
      });
      if (existingEmailPatient) {
        return res.status(400).json({ error: "This email address is already registered to another patient." });
      }
    }
    // Check if contact/phone number is already registered to another patient (case-insensitive)
    const existingContactPatient = await Patient.findOne({
      tenantId: req.tenantId,
      contact: { $regex: new RegExp(`^${cleanContact.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') }
    });
    if (existingContactPatient) {
      return res.status(400).json({ error: "This phone number is already linked to another patient account." });
    }

    if (otp) {
      try {
        const RegistrationOtp = require('../models/RegistrationOtp');
        const otpRecord = await RegistrationOtp.findOne({ email: cleanEmail, otp_code: otp });
        if (otpRecord) {
          await RegistrationOtp.deleteOne({ _id: otpRecord._id }).catch(() => {});
        }
      } catch (otpErr) {
        console.warn("OTP check warning:", otpErr);
      }
    }

    const count = await Patient.countDocuments({ tenantId: req.tenantId });
    let nextSeq = count + 1;
    let formattedId = `pat-${String(nextSeq).padStart(2, '0')}`;
    let exists = await Patient.exists({ tenantId: req.tenantId, patientId: formattedId });
    while (exists) {
      nextSeq++;
      formattedId = `pat-${String(nextSeq).padStart(2, '0')}`;
      exists = await Patient.exists({ tenantId: req.tenantId, patientId: formattedId });
    }

    const patient = await Patient.create({
      tenantId: req.tenantId,
      patientId: formattedId,
      name,
      age: parseInt(age) || 0,
      ageMonths: parseInt(ageMonths) || 0,
      ageDays: parseInt(ageDays) || 0,
      gender,
      contact: cleanContact,
      email: cleanEmail,
      address,
      referredBy: req.body.referredBy || '',
      bloodGroup,
      allergies,
      currentMedications: currentMedications || '',
      medicalHistory: Array.isArray(medicalHistory) ? medicalHistory : (medicalHistory ? [medicalHistory] : []),
      avatar
    });
    const Consent = require('../models/Consent');
    const dpdpConsent = req.body.dpdpConsent || { emrCreation: true, dataSharing: false };
    await Consent.create({
      tenantId: req.tenantId,
      patientId: patient._id,
      purposes: {
        treatment: !!dpdpConsent.emrCreation,
        insurance: true,
        research: !!dpdpConsent.dataSharing
      },
      status: (dpdpConsent.emrCreation === false) ? 'Withdrawn' : 'Active',
      signature: `Digitally signed on registration`,
      ipAddress: req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress,
      userAgent: req.headers['user-agent'] || 'System UI'
    });

    
    // Automatically create a User account for the patient so they can login to the portal
    try {
      const User = require('../models/User');
      const existingUser = await User.findOne({ tenantId: req.tenantId, staff_id: cleanContact });
      if (!existingUser) {
        await User.create({
          tenantId: req.tenantId,
          staff_id: cleanContact,
          name: name,
          email: cleanEmail !== 'n/a' ? cleanEmail : undefined,
          phone: cleanContact,
          avatar: avatar || '',
          role: 'patient',
          password_hash: 'not-applicable', // Patient logs in via OTP
          status: 'Active'
        });
      } else if (avatar && !existingUser.avatar) {
        existingUser.avatar = avatar;
        await existingUser.save();
      }
    } catch (userErr) {
      console.warn("Failed to create User record for patient:", userErr);
    }

    const io = req.app.get("io");
    if (io && req.tenantId) {
      io.to(req.tenantId).emit("data_changed", { type: "patients" });
    }

    const jwt = require('jsonwebtoken');
    const { getJwtSecret } = require('../config/env');
    let secretKey;
    try { secretKey = getJwtSecret(); } catch(e) { secretKey = process.env.JWT_SECRET || 'secret_key'; }

    const token = jwt.sign({
      id: patient._id,
      staff_id: patient.contact,
      role: 'patient',
      tenantId: patient.tenantId
    }, secretKey, { expiresIn: '24h' });

    res.status(201).json({
      ...patient.toObject(),
      token,
      user: {
        id: patient._id,
        _id: patient._id,
        name: patient.name,
        contact: patient.contact,
        email: patient.email,
        avatar: patient.avatar || avatar || '',
        role: 'patient',
        isSetupComplete: true,
        tenantId: patient.tenantId
      }
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Get a single patient (scoped to tenant or universal patient self-lookup)
router.get('/:id', async (req, res) => {
  try {
    let patient = null;

    // 1. Try finding by _id within tenant
    try {
      if (req.tenantId) {
        patient = await Patient.findOne({ _id: req.params.id, tenantId: req.tenantId });
      }
    } catch(e) {}

    // 2. If requesting user is a patient, allow looking up own patient record
    if (!patient && req.user && req.user.role === 'patient') {
      const isSelf = (req.user.id === req.params.id || req.params.id === 'me' || req.user.staff_id === req.params.id);
      if (isSelf) {
        try {
          const reqUserPhone = req.user.phone || (req.user.staff_id ? req.user.staff_id.split('_')[0] : '');
          patient = await Patient.findOne({ contact: reqUserPhone, tenantId: req.tenantId }) || 
                    await Patient.findOne({ contact: req.user.staff_id, tenantId: req.tenantId }) ||
                    await Patient.findOne({ _id: req.user.id, tenantId: req.tenantId });
        } catch(e) {}

        // Auto-provision patient record if user exists and is completing onboarding
        if (!patient) {
          const userObj = await User.findById(req.user.id) ||
                          (req.user?.staff_id ? await User.findOne({ staff_id: req.user.staff_id, tenantId: req.tenantId }) : null);
          if (userObj) {
            const effectiveTenant = req.tenantId || userObj.tenantId || 'city_hospital';
            const count = await Patient.countDocuments({ tenantId: effectiveTenant });
            let nextSeq = count + 1;
            let formattedId = `pat-${String(nextSeq).padStart(2, '0')}`;
            let exists = await Patient.exists({ tenantId: effectiveTenant, patientId: formattedId });
            while (exists) {
              nextSeq++;
              formattedId = `pat-${String(nextSeq).padStart(2, '0')}`;
              exists = await Patient.exists({ tenantId: effectiveTenant, patientId: formattedId });
            }

            patient = new Patient({
              patientId: formattedId,
              name: userObj.name || 'Patient',
              age: userObj.age || 0,
              ageMonths: 0,
              ageDays: 0,
              gender: userObj.gender || 'Male',
              contact: userObj.phone || userObj.staff_id || req.user?.staff_id || '9999999999',
              email: userObj.email || '',
              address: userObj.address || '',
              bloodGroup: userObj.bloodGroup || 'O+',
              allergies: userObj.allergies || '',
              currentMedications: '',
              medicalHistory: [],
              avatar: userObj.avatar || '',
              tenantId: effectiveTenant
            });
            await patient.save();

            userObj.staff_id = patient.contact;
            userObj.name = patient.name;
            userObj.isSetupComplete = true;
            await userObj.save();

            const io = req.app.get("io");
            if (io && effectiveTenant) {
              io.to(effectiveTenant).emit("data_changed", { type: "patients" });
            }

            const isComplete = isPatientProfileComplete(patient);
            return res.json({
              ...patient.toObject(),
              isSetupComplete: isComplete
            });
          }
        }
      }
    }

    if (!patient) {
      return res.status(404).json({ error: 'Patient not found' });
    }

    const isComplete = isPatientProfileComplete(patient);
    // Sync with User table if user exists
    try {
      const u = await User.findOne({ staff_id: patient.contact }) || await User.findOne({ phone: patient.contact });
      if (u && u.isSetupComplete !== isComplete) {
        u.isSetupComplete = isComplete;
        await u.save();
      }
    } catch (e) {}

    res.json({
      ...patient.toObject(),
      isSetupComplete: isComplete
    });
  } catch (error) {
    console.error("Get patient error:", error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update patient details (profile & settings, scoped to tenant)
router.put('/:id', async (req, res) => {
  const { name, age, ageMonths, ageDays, gender, contact, address, bloodGroup, allergies, currentMedications, medicalHistory, avatar } = req.body;
  try {
    let patient = null;
    try { patient = await Patient.findOne({ _id: req.params.id, tenantId: req.tenantId }); } catch(e) {}
    if (!patient) {
      try {
        const userObj = await User.findOne({ _id: req.params.id, tenantId: req.tenantId });
        if (userObj && userObj.role === 'patient') {
          patient = await Patient.findOne({ contact: userObj.staff_id, tenantId: req.tenantId });
        }
      } catch(e) {}
    }
    if (!patient) return res.status(404).json({ error: 'Patient not found' });

    // SECURITY: Ensure ownership (only the user themselves or an admin may update details)
    const user = await User.findOne({ staff_id: patient.contact, tenantId: req.tenantId });
    const isOwner = (req.user.id === patient._id.toString()) || (user && req.user.id === user._id.toString());
    const isAdmin = req.user.role === 'admin';
    if (!isOwner && !isAdmin) {
      return res.status(403).json({ error: 'Access denied: Cannot edit another user\'s profile' });
    }

    // Check email uniqueness if email is provided in update
    const targetEmail = req.body.email;
    if (targetEmail && targetEmail.trim() !== '' && targetEmail.trim().toLowerCase() !== 'n/a') {
      const cleanEmail = targetEmail.toLowerCase().trim();
      const existingEmailPatient = await Patient.findOne({
        tenantId: req.tenantId,
        _id: { $ne: patient._id },
        email: { $regex: new RegExp(`^${cleanEmail.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') }
      });
      if (existingEmailPatient) {
        return res.status(400).json({ error: "This email address is already registered to another patient." });
      }
      patient.email = cleanEmail;
    }

    // Check contact/phone uniqueness if contact is updated
    if (contact && contact.trim() !== '' && contact.trim() !== patient.contact) {
      const cleanContact = contact.trim();
      const existingContactPatient = await Patient.findOne({
        tenantId: req.tenantId,
        _id: { $ne: patient._id },
        contact: { $regex: new RegExp(`^${cleanContact.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') }
      });
      if (existingContactPatient) {
        return res.status(400).json({ error: "This phone number is already linked to another patient account." });
      }
      patient.contact = cleanContact;
    } else if (contact) {
      patient.contact = contact.trim();
    }

    const oldContact = patient.contact;

    // Update Patient details
    patient.name = name || patient.name;
    patient.age = parseInt(age) || patient.age;
    patient.gender = gender || patient.gender;
    patient.address = address !== undefined ? address : patient.address;
    patient.referredBy = req.body.referredBy !== undefined ? req.body.referredBy : patient.referredBy;
    patient.bloodGroup = bloodGroup || patient.bloodGroup;
    patient.allergies = allergies !== undefined ? allergies : patient.allergies;
    patient.currentMedications = currentMedications !== undefined ? currentMedications : patient.currentMedications;
    patient.medicalHistory = medicalHistory || patient.medicalHistory;
    patient.avatar = avatar !== undefined ? avatar : patient.avatar;

    await patient.save();

    const isComplete = isPatientProfileComplete(patient);

    // Sync with User authentication table
    if (user) {
      user.name = patient.name;
      user.staff_id = patient.contact;
      user.avatar = patient.avatar;
      user.isSetupComplete = isComplete;
      await user.save();
    }

    const io = req.app.get("io");
    if (io && req.tenantId) {
      io.to(req.tenantId).emit("data_changed", { type: "patients" });
    }

    res.json({
      ...patient.toObject(),
      isSetupComplete: isComplete
    });
  } catch (error) {
    console.error("Update patient error:", error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update patient password (scoped to tenant)
router.put('/:id/password', async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  const bcrypt = require('bcrypt');

  try {
    let patient = null;
    try { patient = await Patient.findOne({ _id: req.params.id, tenantId: req.tenantId }); } catch(e) {}
    
    let userObj = null;
    try { userObj = await User.findOne({ _id: req.params.id, tenantId: req.tenantId }); } catch(e) {}

    if (!patient && userObj && userObj.role === 'patient') {
      try { patient = await Patient.findOne({ contact: userObj.staff_id, tenantId: req.tenantId }); } catch(e) {}
    }

    if (!patient) return res.status(404).json({ error: 'Patient not found' });

    const user = await User.findOne({ staff_id: patient.contact, tenantId: req.tenantId }).select("+password_hash");
    if (!user) return res.status(404).json({ error: 'Authentication user not found' });

    // SECURITY: Ensure ownership (only the user themselves or an admin may update their password)
    const isOwner = (req.user.id === patient._id.toString()) || (req.user.id === user._id.toString());
    const isAdmin = req.user.role === 'admin';
    if (!isOwner && !isAdmin) {
      return res.status(403).json({ error: 'Access denied: Cannot change password for another user' });
    }

    // Verify current password
    const isMatch = await bcrypt.compare(currentPassword, user.password_hash);
    if (!isMatch) {
      return res.status(400).json({ error: 'Current password is incorrect' });
    }

    // Hash and update new password
    const salt = await bcrypt.genSalt(10);
    user.password_hash = await bcrypt.hash(newPassword, salt);
    user.password_version = (user.password_version || 0) + 1;
    await user.save();

    // Broadcast session revocation event via socket
    const io = req.app.get("io");
    if (io) {
      io.emit("session_revoked", { userId: user._id.toString(), staffId: user.staff_id });
    }

    res.json({ message: 'Password updated successfully' });
  } catch (error) {
    console.error("Update password error:", error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Bulk delete all patients (scoped to tenant - FOR TESTING)
router.delete('/danger/delete-all-patients', async (req, res) => {
  try {
    const patients = await Patient.find({ tenantId: req.tenantId });
    const patientContacts = patients.map(p => p.contact);
    
    await Patient.deleteMany({ tenantId: req.tenantId });
    await User.deleteMany({ staff_id: { $in: patientContacts }, tenantId: req.tenantId, role: 'patient' });
    
    const io = req.app.get("io");
    if (io && req.tenantId) {
      io.to(req.tenantId).emit("data_changed", { type: "patients" });
    }
    
    res.json({ message: `Successfully deleted ${patients.length} patient records.` });
  } catch (error) {
    console.error("Bulk delete patients error:", error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete a patient (scoped to tenant)
router.delete('/:id', async (req, res) => {
  try {
    let patient = null;
    try { patient = await Patient.findOne({ _id: req.params.id, tenantId: req.tenantId }); } catch(e) {}
    if (!patient) return res.status(404).json({ error: 'Patient not found' });

    // SECURITY: Ensure only admin (or user themselves) can delete a profile
    const user = await User.findOne({ staff_id: patient.contact, tenantId: req.tenantId });
    const isOwner = (req.user.id === patient._id.toString()) || (user && req.user.id === user._id.toString());
    const isAdmin = req.user.role === 'admin';
    if (!isOwner && !isAdmin) {
      return res.status(403).json({ error: 'Access denied: Cannot delete another user\'s profile' });
    }

    await Patient.findOneAndDelete({ _id: patient._id, tenantId: req.tenantId });
    
    // Also delete corresponding User account
    await User.findOneAndDelete({ staff_id: patient.contact, tenantId: req.tenantId });
    
    const io = req.app.get("io");
    if (io && req.tenantId) {
      io.to(req.tenantId).emit("data_changed", { type: "patients" });
    }

    res.json({ message: 'Patient deleted successfully' });
  } catch (error) {
    console.error("Delete patient error:", error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
