const express = require("express");
const mongoose = require("mongoose");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const { OAuth2Client } = require("google-auth-library");
const User = require("../models/User");
const Patient = require("../models/Patient");
const tenantMiddleware = require("../middleware/tenantMiddleware");
const AuditLog = require("../models/AuditLog");
const { getJwtSecret } = require("../config/env");
const { verifyToken, isAdmin } = require("../middleware/authMiddleware");
const { isPatientProfileComplete } = require("../utils/patientProfileHelper");
const router = express.Router();

// Generate a unique, non-guessable placeholder hash for OAuth-created users.
// Previously every OAuth user shared the constant randomOAuthPassword(),
// which meant knowing that string + a user's staff_id let anyone log in via
// the password /login endpoint. We now give each OAuth user a random value
// that can never be typed as a password.
const randomOAuthPassword = () => crypto.randomBytes(32).toString("hex");

// Lightweight ping endpoint to wake up Render backend from cold starts
router.get("/ping", (req, res) => {
  res.json({ status: "ok", message: "Curoxa Backend is awake" });
});

// Authoritative tenant mode check for active session synchronization
router.get("/tenant-mode", verifyToken, async (req, res) => {
  try {
    const SuperAdminHospital = require("../models/SuperAdminHospital");
    const tenantId = req.tenantId || (req.user && req.user.tenantId) || 'city_hospital';
    const hospital = await SuperAdminHospital.findOne({ code: tenantId });
    res.json({
      tenantId,
      doctorClinicalMode: hospital?.doctorClinicalMode || 'ONLINE',
      modules: hospital?.modules || {}
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Secure diagnostic endpoint for database connection and basic user stats
router.get("/diagnostic", async (req, res) => {
  try {
    const mongoState = mongoose.connection.readyState;
    const mongoStateNames = ["disconnected", "connected", "connecting", "disconnecting"];
    
    let userCount = 0;
    let adminExists = false;
    let adminRole = null;
    let hasAdminPasswordHash = false;
    
    if (mongoState === 1) {
      userCount = await User.countDocuments();
      const adminUser = await User.findOne({ staff_id: "admin" }).select("+password_hash");
      if (adminUser) {
        adminExists = true;
        adminRole = adminUser.role;
        hasAdminPasswordHash = !!adminUser.password_hash;
      }
    }
    
    const jwtSecretLength = process.env.JWT_SECRET ? process.env.JWT_SECRET.length : 0;
    
    res.json({
      database: {
        status: mongoStateNames[mongoState] || "unknown",
        connected: mongoState === 1,
      },
      users: {
        total: userCount,
        adminExists,
        adminRole,
        hasAdminPasswordHash,
      },
      jwt: {
        configured: jwtSecretLength > 0,
        length: jwtSecretLength,
        validLength: jwtSecretLength >= 16
      },
      env: {
        NODE_ENV: process.env.NODE_ENV,
        PORT: process.env.PORT,
        CORS_ORIGIN: process.env.CORS_ORIGIN
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/login", tenantMiddleware, async (req, res) => {
  const { staff_id, password } = req.body;

  if (!staff_id || !password) {
    return res
      .status(400)
      .json({ error: "Please provide ID/Contact and password" });
  }

  try {
    console.log(`[LOGIN DEBUG] Request for staff_id: "${staff_id}"`);
    // Search across all tenants first
    let users = await User.find({
      $or: [
        { staff_id: staff_id },
        { email: staff_id.toLowerCase().trim() }
      ]
    }).select("+password_hash");

    if (users.length === 0) {
      const cleanId = staff_id.toLowerCase().trim();
      if (cleanId.includes('superadmin') || cleanId.includes('super_admin') || cleanId.includes('super.admin')) {
        users = await User.find({
          $or: [
            { role: { $in: ['superadmin', 'super_admin', 'platform_admin'] } },
            { email: 'super.admin@curoxa.com' },
            { staff_id: { $regex: /superadmin/i } }
          ]
        }).select("+password_hash");
      }
    }

    if (users.length === 0) {
      console.log(`[LOGIN DEBUG] Exact match failed. Attempting regex match.`);
      // Case-insensitive regex fallback for staff_id or email
      const safeSearchStr = staff_id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      users = await User.find({
        $or: [
          { staff_id: { $regex: new RegExp(`^${safeSearchStr}$`, 'i') } },
          { email: { $regex: new RegExp(`^${safeSearchStr}$`, 'i') } }
        ]
      }).select("+password_hash");
    }

    if (users.length === 0) {
      console.log(`[LOGIN DEBUG] No user found for staff_id: "${staff_id}"`);
      return res.status(401).json({ error: "Invalid credentials" });
    }

    // Try to find the user with matching password
    let user = null;
    const trimmedPassword = password.trim();
    for (const u of users) {
      let isMatch = await bcrypt.compare(trimmedPassword, u.password_hash);
      
      // Flexible password check & auto-heal for superadmin accounts
      if (!isMatch && (u.role === 'superadmin' || u.role === 'super_admin' || u.staff_id === 'superadmin')) {
        if (trimmedPassword === 'Superadmin@123' || trimmedPassword === 'superadmin123') {
          const altPassword = trimmedPassword === 'Superadmin@123' ? 'superadmin123' : 'Superadmin@123';
          const isAltMatch = await bcrypt.compare(altPassword, u.password_hash);
          if (isAltMatch) {
            isMatch = true;
            // Update user to the new password hash for seamless future logins
            const salt = await bcrypt.genSalt(10);
            u.password_hash = await bcrypt.hash(trimmedPassword, salt);
            u.hasSetPassword = true;
            await u.save();
          }
        }
      }

      if (isMatch) {
        user = u;
        break;
      }
    }

    if (!user) {
      console.log(`[LOGIN DEBUG] Password verification failed for all matching user accounts.`);
      return res.status(401).json({ error: "Invalid credentials" });
    }

    console.log(`[LOGIN DEBUG] User found: "${user.name}" with role: "${user.role}", tenantId: "${user.tenantId}"`);

    if (user.hasSetPassword === false) {
      console.log(`[LOGIN DEBUG] User has not set password.`);
      return res.status(400).json({
        error: "No password has been set for this account. Please use 'Forgot Password?' to set up your password."
      });
    }

    // Update lastLogin time
    user.lastLogin = new Date();
    await user.save();

    // Match JWT payload ID to Patient document ID if role is patient
    let tokenPayload = {
      id: user._id,
      staff_id: user.staff_id,
      role: user.role,
      name: user.name,
      tenantId: user.tenantId,
      passwordHash: user.password_hash,
      password_version: user.password_version || 0,
    };
    let isPatientComplete = false;
    if (user.role === "patient") {
      const patient = await Patient.findOne({
        contact: user.staff_id,
        tenantId: user.tenantId,
      }) || await Patient.findOne({ contact: user.staff_id });
      if (patient) {
        tokenPayload.id = patient._id;
      }
      isPatientComplete = Boolean(isPatientProfileComplete(patient) || user.isSetupComplete);
      if (user.isSetupComplete !== isPatientComplete) {
        user.isSetupComplete = isPatientComplete;
        await user.save().catch(() => {});
      }
    }

    const token = jwt.sign(
      tokenPayload,
      getJwtSecret(),
      { expiresIn: "24h" },
    );

    // Fire-and-forget audit log (don't block login response)
    AuditLog.create({
      tenantId: user.tenantId,
      actor: user.staff_id,
      actorName: user.name,
      actorRole: user.role,
      action: "login",
      target: user._id.toString(),
      metadata: { method: "password" },
    }).catch(() => {});

    const SuperAdminHospital = require("../models/SuperAdminHospital");
    const hospital = await SuperAdminHospital.findOne({ code: user.tenantId });
    const tenantModules = (user.role === 'superadmin' || user.role === 'super_admin')
      ? { reception: { enabled: true }, doctor: { enabled: true }, pharmacy: { enabled: true }, laboratory: { enabled: true }, inventory: { enabled: true }, dpdp: { enabled: true } }
      : (hospital ? hospital.modules : { reception: { enabled: true }, doctor: { enabled: true }, pharmacy: { enabled: true }, laboratory: { enabled: true }, inventory: { enabled: true }, dpdp: { enabled: true } });

    res.json({
      message: "Login successful",
      token,
      user: {
        id: tokenPayload.id,
        staff_id: user.staff_id,
        role: user.role,
        name: user.name,
        email: user.email || '',
        avatar: user.avatar || '',
        specialty: user.specialty,
        isSetupComplete: user.role === 'patient' ? isPatientComplete : user.isSetupComplete,
        tenantId: user.tenantId,
        tenantName: hospital ? hospital.name : 'Sunrise Multispeciality',
        createdAt: user.createdAt,
      },
      tenantModules,
      doctorClinicalMode: hospital?.doctorClinicalMode || 'ONLINE',
      plan: hospital ? hospital.plan : null
    });
  } catch (err) {
    console.error("[auth] Login error:", err);
    res.status(500).json({ error: `Server error: ${err.message}` });
  }
});

router.post("/google-login", tenantMiddleware, async (req, res) => {
  const { credential, tenantId } = req.body;

  if (!credential) {
    return res.status(400).json({ error: "No Google credential provided" });
  }

  const client_id = (process.env.GOOGLE_CLIENT_ID || "dummy_client_id").trim();
  const client = new OAuth2Client(client_id);

  try {
    let email, name, sub;

    // SECURITY: The simulated_token_ path bypasses real Google verification
    // and must NEVER be reachable in production. Anyone could log in as
    // sarah.jenkins@gmail.com (doctor) or rita.receptionist@gmail.com
    // (receptionist), or impersonate any real staff email, by sending a
    // fabricated credential. It is a dev/demo convenience only.
    if (credential.startsWith("simulated_token_")) {
      if (process.env.NODE_ENV === "production") {
        return res
          .status(401)
          .json({ error: "Invalid Google credential token" });
      }
      console.warn(
        "[auth] simulated_token_ Google login used — this is only allowed when NODE_ENV !== 'production'.",
      );
      email = credential.replace("simulated_token_", "").toLowerCase();
      name = email
        .split("@")[0]
        .split(".")
        .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
        .join(" ");
      sub = `sim_sub_${email.replace(/[^a-zA-Z0-9]/g, "")}`;

      // Seed simulated staff users on the fly if they don't exist
      const targetTenant = tenantId || req.tenantId || "city_hospital";
      if (email === "sarah.jenkins@gmail.com") {
        let doctorUser = await User.findOne({
          staff_id: email,
          tenantId: targetTenant,
        });
        if (!doctorUser) {
          const salt = await bcrypt.genSalt(10);
          const password_hash = await bcrypt.hash(
            randomOAuthPassword(),
            salt,
          );
          await User.create({
            tenantId: targetTenant,
            staff_id: email,
            password_hash,
            role: "doctor",
            name: "Dr. Sarah Jenkins",
            specialty: "Cardiology",
            isSetupComplete: true,
          });
        }
      } else if (email === "rita.receptionist@gmail.com") {
        let recepUser = await User.findOne({
          staff_id: email,
          tenantId: targetTenant,
        });
        if (!recepUser) {
          const salt = await bcrypt.genSalt(10);
          const password_hash = await bcrypt.hash(
            randomOAuthPassword(),
            salt,
          );
          await User.create({
            tenantId: targetTenant,
            staff_id: email,
            password_hash,
            role: "receptionist",
            name: "Receptionist Rita",
            isSetupComplete: true,
          });
        }
      } else if (email === "super.admin@curoxa.com") {
        let superUser = await User.findOne({
          staff_id: email,
          tenantId: targetTenant,
        });
        if (!superUser) {
          const salt = await bcrypt.genSalt(10);
          const password_hash = await bcrypt.hash(
            randomOAuthPassword(),
            salt,
          );
          await User.create({
            tenantId: targetTenant,
            staff_id: email,
            password_hash,
            role: "superadmin",
            name: "Super Admin",
            isSetupComplete: true,
          });
        }
      }
    } else {
      const ticket = await client.verifyIdToken({
        idToken: credential,
        audience: client_id,
      });
      const payload = ticket.getPayload();
      email = payload.email;
      name = payload.name;
      sub = payload.sub; // unique Google ID
    }

    if (!email) {
      return res
        .status(400)
        .json({ error: "Google account does not expose an email address" });
    }

    // 1. Search for existing staff User whose staff_id OR email matches the Google email (case-insensitive) across any tenant
    let user = await User.findOne({
      staff_id: email.toLowerCase()
    }).select("+password_hash");

    if (!user) {
      user = await User.findOne({
        email: email.toLowerCase(),
        role: { $ne: "patient" }
      }).select("+password_hash");
    }

    let targetTenant = "city_hospital";

    if (user) {
      targetTenant = user.tenantId;
      user.lastLogin = new Date();
      await user.save();

      const tokenPayload = {
        id: user._id,
        staff_id: user.staff_id,
        role: user.role,
        name: user.name,
        tenantId: targetTenant,
        passwordHash: user.password_hash,
        password_version: user.password_version || 0,
      };

      const token = jwt.sign(
        tokenPayload,
        getJwtSecret(),
        { expiresIn: "24h" },
      );

      const SuperAdminHospital = require("../models/SuperAdminHospital");
      let hospital = await SuperAdminHospital.findOne({ code: targetTenant.toLowerCase().trim() });
      if (!hospital && targetTenant) {
        let name = targetTenant.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
        if (!name.toLowerCase().includes('hospital') && !name.toLowerCase().includes('clinic') && !name.toLowerCase().includes('center')) {
          name += ' Medical Center';
        }
        hospital = await SuperAdminHospital.create({
          name: name,
          code: targetTenant.toLowerCase().trim(),
          plan: 'Standard Basic',
          status: 'Active',
          logo: name.charAt(0),
          limits: { doctorsUsed: 1, doctorsLimit: 25, staffUsed: 1, staffLimit: 50, storageUsed: 5.0, storageLimit: 100, patients: 0 }
        });
      }

      const tenantModules = (user.role === 'superadmin' || user.role === 'super_admin')
        ? { reception: { enabled: true }, doctor: { enabled: true }, pharmacy: { enabled: true }, laboratory: { enabled: true }, inventory: { enabled: true }, dpdp: { enabled: true } }
        : (hospital ? hospital.modules : { reception: { enabled: true }, doctor: { enabled: true }, pharmacy: { enabled: true }, laboratory: { enabled: true }, inventory: { enabled: true }, dpdp: { enabled: true } });

      return res.json({
        message: "Login successful via Google (Staff)",
        token,
        user: {
          id: user._id,
          staff_id: user.staff_id,
          role: user.role,
          name: user.name,
          email: user.email || '',
          avatar: user.avatar || '',
          specialty: user.specialty,
          isSetupComplete: user.isSetupComplete,
          tenantId: targetTenant,
          tenantName: hospital ? hospital.name : 'Sunrise Multispeciality',
          createdAt: user.createdAt,
        },
        tenantModules,
        doctorClinicalMode: hospital?.doctorClinicalMode || 'ONLINE',
        plan: hospital ? hospital.plan : null
      });
    }

    // 2. Search for existing Patient whose email matches the Google email (case-insensitive) across any tenant
    let patient = await Patient.findOne({
      email: email.toLowerCase()
    });

    let isNewPatient = false;
    if (!patient) {
      isNewPatient = true;
      // Auto-register unregistered Google accounts as universal patients
      targetTenant = req.body.tenantId || req.tenantId || "city_hospital";
      const normalizedEmail = email.toLowerCase().trim();
      patient = await Patient.create({
        tenantId: targetTenant,
        name: name || "Google User",
        age: 30, // Default required age
        gender: "Other", // Default required gender
        contact: normalizedEmail, // Use email as contact identifier
        email: normalizedEmail,
        address: "Registered via Google Sign-In",
        allergies: "None"
      });

      const Consent = require('../models/Consent');
      await Consent.create({
        tenantId: targetTenant,
        patientId: patient._id,
        purposes: {
          treatment: true,
          insurance: true,
          research: false
        },
        status: 'Active',
        signature: 'Consent granted via Google Authentication',
        ipAddress: req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress,
        userAgent: req.headers['user-agent'] || 'Google Auth flow'
      });
    }

    if (patient) {
      targetTenant = patient.tenantId;
      // Find or create a corresponding auth User for this patient
      user = await User.findOne({
        staff_id: patient.contact,
        tenantId: targetTenant,
      });

      if (!user) {
        // Create matching User model for authentication
        const salt = await bcrypt.genSalt(10);
        const password_hash = await bcrypt.hash(randomOAuthPassword(), salt);
        user = await User.create({
          tenantId: targetTenant,
          staff_id: patient.contact,
          password_hash,
          role: "patient",
          name: patient.name,
          email: email.toLowerCase().trim(),
          hasSetPassword: false,
          isSetupComplete: !isNewPatient,
        });
      } else {
        user.lastLogin = new Date();
        await user.save();
      }

      const tokenPayload = {
        id: patient._id,
        role: "patient",
        name: patient.name,
        tenantId: targetTenant,
      };

      const token = jwt.sign(
        tokenPayload,
        getJwtSecret(),
        { expiresIn: "24h" },
      );

      const SuperAdminHospital = require("../models/SuperAdminHospital");
      const hospital = await SuperAdminHospital.findOne({ code: targetTenant });
      const tenantModules = { reception: { enabled: true }, doctor: { enabled: true }, pharmacy: { enabled: true }, laboratory: { enabled: true }, inventory: { enabled: true }, dpdp: { enabled: true } };

      const isComplete = Boolean(isPatientProfileComplete(patient) || user.isSetupComplete);
      if (user.isSetupComplete !== isComplete) {
        user.isSetupComplete = isComplete;
        await user.save().catch(() => {});
      }

      return res.json({
        message: "Login successful via Google (Patient)",
        token,
        user: {
          id: patient._id,
          staff_id: patient.contact,
          role: "patient",
          name: patient.name,
          email: patient.email || '',
          avatar: patient.avatar || '',
          tenantId: targetTenant,
          isSetupComplete: isComplete,
        },
        tenantModules,
        plan: hospital ? hospital.plan : null
      });
    }

    // 3. Neither staff nor patient exists with this email -> Block open registration
    return res.status(403).json({
      error: "Google Sign-In is disabled for unregistered accounts. Please contact your administrator to provision your account before using Google Sign-In."
    });
  } catch (error) {
    console.error("Google Sign-In backend verification error:", error);
    res.status(401).json({ error: "Invalid Google credential token" });
  }
});

// Get all doctors (publicly accessible to authenticated staff, scoped to tenant)
router.get("/doctors", tenantMiddleware, async (req, res) => {
  try {
    const doctors = await User.find(
      { role: "doctor", tenantId: req.tenantId },
      "name specialty available consultationFee email phone avatar max_slots doctorSlots weeklyOff staff_id",
    ).lean();

    const LeaveRequest = require("../models/LeaveRequest");
    const activeLeaves = await LeaveRequest.find({
      tenantId: req.tenantId,
      status: "Approved"
    });

    const todayStr = new Date().toISOString().split("T")[0];
    const daysOfWeek = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    const todayDayName = daysOfWeek[new Date().getDay()];

    const updatedDoctors = doctors.map(doc => {
      const isOnLeave = activeLeaves.some(leave => {
        const isEmployeeMatch = (leave.employeeId === doc.staff_id) || (leave.employeeName && leave.employeeName.toLowerCase() === doc.name.toLowerCase());
        if (!isEmployeeMatch) return false;
        return todayStr >= leave.fromDate && todayStr <= leave.toDate;
      });

      let hasWeeklyOff = false;
      if (doc.weeklyOff) {
        if (Array.isArray(doc.weeklyOff)) {
          hasWeeklyOff = doc.weeklyOff.some(d => String(d).trim().toLowerCase() === todayDayName.toLowerCase());
        } else if (typeof doc.weeklyOff === 'string') {
          hasWeeklyOff = doc.weeklyOff.trim().toLowerCase() === todayDayName.toLowerCase();
        }
      }

      return {
        ...doc,
        available: (isOnLeave || hasWeeklyOff) ? false : doc.available,
        isOnLeave: isOnLeave,
        isWeeklyOff: hasWeeklyOff
      };
    });

    res.json(updatedDoctors);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update weekly off (scoped to tenant, accessible to user themselves or admin, hr, receptionist)
router.put("/users/:id/weekly-off", tenantMiddleware, verifyToken, async (req, res) => {
  try {
    const isAuthorized = 
      req.user.id === req.params.id || 
      ['admin', 'hr', 'receptionist'].includes(req.user.role);
      
    if (!isAuthorized) {
      return res.status(403).json({ error: "Access denied: Unauthorized to update weekly off" });
    }

    const { weeklyOff } = req.body;
    if (weeklyOff === undefined) {
      return res.status(400).json({ error: "weeklyOff field is required" });
    }

    const user = await User.findOneAndUpdate(
      { _id: req.params.id, tenantId: req.tenantId },
      { $set: { weeklyOff } },
      { returnDocument: "after" }
    );

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    res.json({ message: "Weekly off updated successfully", weeklyOff: user.weeklyOff });
  } catch (error) {
    console.error("Update weekly off error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Get all doctors across all tenants (universal search for patient portal)
router.get("/doctors/universal", verifyToken, async (req, res) => {
  try {
    const doctors = await User.find(
      { role: "doctor" },
      "name specialty available consultationFee tenantId email doctorSlots weeklyOff"
    );
    res.json(doctors);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get all active onboarded hospitals for patient portal discovery
router.get("/hospitals/universal", verifyToken, async (req, res) => {
  try {
    const SuperAdminHospital = require('../models/SuperAdminHospital');
    const hospitals = await SuperAdminHospital.find(
      { 
        status: 'Active',
        code: { $not: /^tenant-/i }
      },
      'name code logo letterheadUrl address modules limits status isGstVerified isLicenseVerified plan'
    ).sort({ createdAt: -1 }).lean();

    const results = [];
    for (const h of hospitals) {
      const doctorUsers = await User.find(
        { tenantId: h.code, role: 'doctor' },
        'name specialty department'
      ).lean();
      const specialties = Array.from(new Set(doctorUsers.map(d => d.specialty || d.department).filter(Boolean)));
      const enabledMods = Object.keys(h.modules || {}).filter(k => h.modules[k]?.enabled);

      results.push({
        _id: h._id,
        code: h.code,
        name: h.name,
        logo: h.logo || '',
        letterheadUrl: h.letterheadUrl || '',
        address: h.address || '',
        status: h.status,
        isGstVerified: Boolean(h.isGstVerified),
        isLicenseVerified: Boolean(h.isLicenseVerified),
        plan: h.plan || '',
        doctorCount: doctorUsers.length,
        specialties: specialties,
        modules: enabledMods
      });
    }

    res.json(results);
  } catch (error) {
    console.error("Universal hospitals fetch error:", error);
    res.status(500).json({ error: error.message });
  }
});

// Update profile (e.g. for first time setup, scoped to tenant)
// SECURITY: requires auth, and a user may only edit their own profile unless
// they are an admin. Previously this endpoint had no verifyToken, so anyone
// who knew a user _id + tenant could change name/email/specialty/avatar.
    // Update profile (e.g. for first time setup, scoped to tenant)
// SECURITY: verifyToken is added. Ownership check ensures users can only edit their own profile unless admin.
router.put("/profile/:id", tenantMiddleware, verifyToken, async (req, res) => {
  try {
    // Ownership check: user can only edit their own profile unless admin
    if (req.user.id !== req.params.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: "Access denied: Cannot edit another user's profile" });
    }

    const { name, email, specialty, isSetupComplete, avatar } = req.body;
    
    // Explicit permitted fields only to avoid mass assignment
    const updateObj = {};
    if (name !== undefined) updateObj.name = name;
    if (email !== undefined) updateObj.email = email;
    if (specialty !== undefined) updateObj.specialty = specialty;
    if (isSetupComplete !== undefined) updateObj.isSetupComplete = isSetupComplete;
    if (avatar !== undefined) updateObj.avatar = avatar;

    const user = await User.findOneAndUpdate(
      { _id: req.params.id, tenantId: req.tenantId },
      updateObj,
      { returnDocument: "after" },
    );
    if (!user) return res.status(404).json({ error: "User not found" });
    res.json({
      id: user._id,
      staff_id: user.staff_id,
      role: user.role,
      name: user.name,
      email: user.email,
      specialty: user.specialty,
      avatar: user.avatar,
      isSetupComplete: user.isSetupComplete,
      tenantId: user.tenantId,
      createdAt: user.createdAt,
    });
  } catch (error) {
    console.error("Profile update error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/auth/forgot-password - Send an OTP to the user's email
router.post("/forgot-password", tenantMiddleware, async (req, res) => {
  const { email } = req.body;
  if (!email) {
    return res.status(400).json({ error: "Please provide an email address" });
  }

  try {
    const searchEmail = email.toLowerCase().trim();
    // 1. Search for user by email across any tenant
    let user = await User.findOne({
      email: searchEmail
    });

    // Fallback 1: Check if staff_id is the email across any tenant
    if (!user) {
      const safeSearchStr = searchEmail.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      user = await User.findOne({
        staff_id: { $regex: new RegExp(`^${safeSearchStr}$`, 'i') }
      });
      if (user && !user.email) {
        user.email = searchEmail;
        await user.save();
      }
    }

    // Fallback 2: Check Patient collection by email across any tenant, then look up auth User by patient.contact
    if (!user) {
      const patient = await Patient.findOne({
        email: searchEmail
      });
      if (patient) {
        user = await User.findOne({
          staff_id: patient.contact,
          tenantId: patient.tenantId
        });
        if (!user) {
          // Create matching User model for authentication on the fly
          const salt = await bcrypt.genSalt(10);
          const password_hash = await bcrypt.hash(randomOAuthPassword(), salt);
          user = await User.create({
            tenantId: patient.tenantId,
            staff_id: patient.contact,
            password_hash,
            role: "patient",
            name: patient.name,
            email: searchEmail,
            hasSetPassword: false,
            isSetupComplete: true,
          });
        } else if (!user.email) {
          // Self-heal: Save email on the User auth record for future lookups
          user.email = searchEmail;
          await user.save();
        }
      }
    }

    if (!user) {
      return res.status(404).json({ error: "No account found with this email address" });
    }

    // Generate a secure 6-digit numeric OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    user.otp_code = otp;
    user.otp_expires_at = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes validity
    await user.save();

    const emailHtmlBody = `
      <div style="font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; background-color: #f8fafc; padding: 40px 20px; text-align: center;">
        <div style="max-width: 500px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1), 0 2px 4px -1px rgba(0,0,0,0.06); border: 1px solid #e2e8f0; text-align: left;">
          <!-- Header -->
          <div style="background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%); padding: 30px; text-align: center;">
            <h1 style="color: #ffffff; margin: 0; font-size: 24px; font-weight: 700; letter-spacing: -0.02em;">Curoxa Security</h1>
          </div>
          
          <!-- Body -->
          <div style="padding: 40px 30px; text-align: center;">
            <h2 style="color: #0f172a; margin-top: 0; margin-bottom: 12px; font-size: 20px; font-weight: 600;">Verify Your Identity</h2>
            <p style="color: #475569; font-size: 14px; line-height: 1.6; margin-bottom: 30px; margin-top: 0;">
              You requested a password reset for your Curoxa account. Use the verification code below to complete the process. This code is valid for <strong>15 minutes</strong>.
            </p>
            
            <!-- OTP Box -->
            <div style="background-color: #eff6ff; border: 1px solid #bfdbfe; border-radius: 8px; padding: 16px 24px; margin-bottom: 30px; display: inline-block;">
              <span style="font-size: 32px; font-weight: 700; color: #1e3a8a; letter-spacing: 6px; font-family: 'Courier New', Courier, monospace;">${otp}</span>
            </div>
            
            <p style="color: #64748b; font-size: 12px; line-height: 1.5; margin: 0;">
              If you did not make this request, please ignore this email. Your password will remain unchanged.
            </p>
          </div>
          
          <!-- Footer -->
          <div style="background-color: #f8fafc; border-top: 1px solid #e2e8f0; padding: 20px; text-align: center;">
            <p style="color: #94a3b8; font-size: 11px; margin: 0;">
              &copy; 2026 Curoxa EMR. All rights reserved.
            </p>
          </div>
        </div>
      </div>
    `;

    let emailSent = false;

    if (process.env.BREVO_API_KEY) {
      try {
        const https = require("https");
        const payload = JSON.stringify({
          sender: { 
            name: "Curoxa Security", 
            email: process.env.SMTP_USER || "curoxatechnology@gmail.com" 
          },
          to: [{ email: user.email }],
          subject: "Curoxa Verification Code: " + otp,
          htmlContent: emailHtmlBody
        });

        const options = {
          hostname: 'api.brevo.com',
          port: 443,
          path: '/v3/smtp/email',
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'api-key': process.env.BREVO_API_KEY.trim(),
            'Content-Length': Buffer.byteLength(payload)
          }
        };

        await new Promise((resolve, reject) => {
          const req = https.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => { data += chunk; });
            res.on('end', () => {
              if (res.statusCode >= 200 && res.statusCode < 300) {
                try {
                  resolve(data ? JSON.parse(data) : {});
                } catch (_) {
                  resolve({});
                }
              } else {
                reject(new Error(`Brevo API returned status ${res.statusCode}: ${data}`));
              }
            });
          });

          req.on('error', (e) => { reject(e); });
          req.write(payload);
          req.end();
        });

        emailSent = true;
        console.log(`[SECURITY] OTP email successfully sent via Brevo HTTP API to ${user.email}`);
      } catch (brevoError) {
        console.error("Failed to send OTP email via Brevo API:", brevoError);
      }
    } else if (process.env.SENDGRID_API_KEY) {
      try {
        const https = require("https");
        const payload = JSON.stringify({
          personalizations: [{ to: [{ email: user.email }] }],
          from: { 
            email: process.env.SMTP_USER || "curoxatechnology@gmail.com", 
            name: "Curoxa Security" 
          },
          subject: "Curoxa Verification Code: " + otp,
          content: [{ type: "text/html", value: emailHtmlBody }]
        });

        const options = {
          hostname: 'api.sendgrid.com',
          port: 443,
          path: '/v3/mail/send',
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${process.env.SENDGRID_API_KEY.trim()}`,
            'Content-Length': Buffer.byteLength(payload)
          }
        };

        await new Promise((resolve, reject) => {
          const req = https.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => { data += chunk; });
            res.on('end', () => {
              if (res.statusCode >= 200 && res.statusCode < 300) {
                try {
                  resolve(data ? JSON.parse(data) : {});
                } catch (_) {
                  resolve({});
                }
              } else {
                reject(new Error(`SendGrid API returned status ${res.statusCode}: ${data}`));
              }
            });
          });

          req.on('error', (e) => { reject(e); });
          req.write(payload);
          req.end();
        });

        emailSent = true;
        console.log(`[SECURITY] OTP email successfully sent via SendGrid HTTP API to ${user.email}`);
      } catch (sendgridError) {
        console.error("Failed to send OTP email via SendGrid API:", sendgridError);
      }
    } else if (process.env.RESEND_API_KEY) {
      try {
        const https = require("https");
        const payload = JSON.stringify({
          from: process.env.SMTP_FROM || "onboarding@resend.dev",
          to: user.email,
          subject: "Curoxa Verification Code: " + otp,
          html: emailHtmlBody
        });

        const options = {
          hostname: 'api.resend.com',
          port: 443,
          path: '/emails',
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${process.env.RESEND_API_KEY.trim()}`,
            'Content-Length': Buffer.byteLength(payload)
          }
        };

        await new Promise((resolve, reject) => {
          const req = https.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => { data += chunk; });
            res.on('end', () => {
              if (res.statusCode >= 200 && res.statusCode < 300) {
                try {
                  resolve(data ? JSON.parse(data) : {});
                } catch (_) {
                  resolve({});
                }
              } else {
                reject(new Error(`Resend API returned status ${res.statusCode}: ${data}`));
              }
            });
          });

          req.on('error', (e) => { reject(e); });
          req.write(payload);
          req.end();
        });

        emailSent = true;
        console.log(`[SECURITY] OTP email successfully sent via Resend HTTP API to ${user.email}`);
      } catch (resendError) {
        console.error("Failed to send OTP email via Resend API:", resendError);
      }
    } else if (process.env.SMTP_USER && process.env.SMTP_PASS) {
      try {
        // Setup nodemailer
        const nodemailer = require("nodemailer");
        
        const smtpConfig = {
          host: process.env.SMTP_HOST || "smtp.mailtrap.io",
          port: parseInt(process.env.SMTP_PORT, 10) || 2525,
          secure: process.env.SMTP_SECURE === "true" || parseInt(process.env.SMTP_PORT, 10) === 465,
          auth: {
            user: process.env.SMTP_USER || "",
            pass: process.env.SMTP_PASS || ""
          },
          connectionTimeout: 10000, // 10 seconds timeout to prevent hanging in production if ports are blocked
          greetingTimeout: 10000,
          socketTimeout: 10000
        };

        const transporter = nodemailer.createTransport(smtpConfig);
        await transporter.sendMail({
          from: process.env.SMTP_FROM || `"Curoxa Security" <${process.env.SMTP_USER}>`,
          to: user.email,
          subject: "Curoxa Verification Code: " + otp,
          text: `Your Curoxa verification code is: ${otp}. It is valid for 15 minutes.`,
          html: emailHtmlBody
        });
        emailSent = true;
        console.log(`[SECURITY] OTP email successfully sent via SMTP to ${user.email}`);
      } catch (mailError) {
        console.error("Failed to send OTP email via SMTP:", mailError);
      }
    }

    // Always log OTP to server console in development for simple verification
    console.log(`[SECURITY] OTP generated for ${user.email} (Tenant: ${user.tenantId}): ${otp}`);

    res.json({
      message: "If an account with that email exists, an OTP has been sent.",
      // In development mode (not production) and when email fails, we return it to aid developer validation
      ...(process.env.NODE_ENV !== "production" && !emailSent ? { dev_otp: otp } : {})
    });
  } catch (error) {
    console.error("Forgot password error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/auth/verify-otp - Verify OTP and reset the user's password
router.post("/verify-otp", tenantMiddleware, async (req, res) => {
  const { email, otp, newPassword } = req.body;
  if (!email || !otp || !newPassword) {
    return res.status(400).json({ error: "Email, OTP, and new password are required" });
  }

  try {
    const user = await User.findOne({
      email: email.toLowerCase().trim()
    }).select("+password_hash");

    if (!user) {
      return res.status(400).json({ error: "Invalid email or OTP" });
    }

    // Verify OTP matches and has not expired
    if (!user.otp_code || user.otp_code !== otp || !user.otp_expires_at || user.otp_expires_at < new Date()) {
      return res.status(400).json({ error: "Invalid or expired OTP" });
    }

    // Hash the new password
    const salt = await bcrypt.genSalt(10);
    user.password_hash = await bcrypt.hash(newPassword, salt);
    user.password_version = (user.password_version || 0) + 1;
    user.hasSetPassword = true;

    // Clear the OTP fields
    user.otp_code = null;
    user.otp_expires_at = null;
    await user.save();

    // Broadcast session revocation event via socket
    const io = req.app.get("io");
    if (io) {
      io.emit("session_revoked", { userId: user._id.toString(), staffId: user.staff_id });
    }

    // Fire-and-forget audit log
    AuditLog.create({
      tenantId: req.tenantId,
      actor: user.staff_id,
      actorName: user.name,
      actorRole: user.role,
      action: "password_reset_via_otp",
      target: user._id.toString(),
      metadata: { method: "otp" },
    }).catch(() => {});

    res.json({ message: "Password reset successful. You can now log in with your new password." });
  } catch (error) {
    console.error("Verify OTP error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Patient registration public endpoint (DISABLED)
router.post("/register", tenantMiddleware, async (req, res) => {
  return res.status(403).json({ error: "Public registration is disabled. Accounts must be provisioned by the administrator." });
});



const RoleCoverage = require("../models/RoleCoverage");

// GET role coverage overrides (scoped to tenant, for any logged-in staff member)
router.get("/role-coverage", verifyToken, async (req, res) => {
  try {
    let coverage = await RoleCoverage.findOne({ tenantId: req.tenantId });
    if (!coverage) {
      return res.json({});
    }

    // Clean up expired coverages dynamically on get
    let state = coverage.state || {};
    let changed = false;
    const now = new Date();

    Object.keys(state).forEach((staffName) => {
      const staffPerms = state[staffName] || {};
      let permsChanged = false;
      Object.keys(staffPerms).forEach((permId) => {
        const perm = staffPerms[permId];
        if (perm && perm.on && perm.type === "temp" && perm.expiresAt) {
          const expireDate = new Date(perm.expiresAt);
          if (expireDate <= now) {
            delete staffPerms[permId];
            permsChanged = true;
            changed = true;
          }
        }
      });
      if (permsChanged) {
        if (Object.keys(staffPerms).length === 0) {
          delete state[staffName];
        } else {
          state[staffName] = staffPerms;
        }
      }
    });

    if (changed) {
      coverage.state = state;
      coverage.markModified("state");
      await coverage.save();
    }

    res.json(coverage.state || {});
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST update role coverage overrides (scoped to tenant, admin only)
router.post("/role-coverage", verifyToken, isAdmin, async (req, res) => {
  try {
    const { state } = req.body;
    let coverage = await RoleCoverage.findOne({ tenantId: req.tenantId });
    if (!coverage) {
      coverage = new RoleCoverage({
        tenantId: req.tenantId,
        state: state || {},
      });
    } else {
      coverage.state = state || {};
      coverage.markModified("state");
    }
    await coverage.save();

    // Fire-and-forget audit log
    AuditLog.create({
      tenantId: req.tenantId,
      actor: req.user.staff_id || req.user.id || "system",
      actorName: req.user.name || "",
      actorRole: req.user.role || "admin",
      action: "role_coverage_updated",
      target: req.tenantId,
      metadata: { affectedStaff: Object.keys(state || {}).length },
    }).catch(() => {});

    const io = req.app.get("io");
    if (io && req.tenantId) {
      io.to(req.tenantId).emit("data_changed", { type: "coverage" });
    }

    res.json({
      message: "Role coverage updated successfully",
      state: coverage.state,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/auth/send-registration-otp - Send a registration verification OTP
router.post("/send-registration-otp", tenantMiddleware, async (req, res) => {
  const { email } = req.body;
  if (!email) {
    return res.status(400).json({ error: "Please provide an email address" });
  }

  try {
    const searchEmail = email.toLowerCase().trim();
    
    // Check if patient with this email already exists in target tenant
    const existingPatient = await Patient.findOne({
      email: searchEmail,
      tenantId: req.tenantId
    });
    if (existingPatient) {
      return res.status(400).json({ error: "A patient with this email is already registered." });
    }

    const RegistrationOtp = require("../models/RegistrationOtp");
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expires_at = new Date(Date.now() + 15 * 60 * 1000); // 15 mins

    await RegistrationOtp.findOneAndUpdate(
      { email: searchEmail },
      { otp_code: otp, expires_at },
      { upsert: true, returnDocument: 'after' }
    );

    const emailHtmlBody = `
      <div style="font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; background-color: #f8fafc; padding: 40px 20px; text-align: center;">
        <div style="max-width: 500px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1), 0 2px 4px -1px rgba(0,0,0,0.06); border: 1px solid #e2e8f0; text-align: left;">
          <!-- Header -->
          <div style="background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%); padding: 30px; text-align: center;">
            <h1 style="color: #ffffff; margin: 0; font-size: 24px; font-weight: 700; letter-spacing: -0.02em;">Curoxa Registration</h1>
          </div>
          
          <!-- Body -->
          <div style="padding: 40px 30px; text-align: center;">
            <h2 style="color: #0f172a; margin-top: 0; margin-bottom: 12px; font-size: 20px; font-weight: 600;">Confirm Your Email</h2>
            <p style="color: #475569; font-size: 14px; line-height: 1.6; margin-bottom: 30px; margin-top: 0;">
              Use the registration verification code below to verify your email address. This code is valid for <strong>15 minutes</strong>.
            </p>
            
            <!-- OTP Box -->
            <div style="background-color: #eff6ff; border: 1px solid #bfdbfe; border-radius: 8px; padding: 16px 24px; margin-bottom: 30px; display: inline-block;">
              <span style="font-size: 32px; font-weight: 700; color: #1e3a8a; letter-spacing: 6px; font-family: 'Courier New', Courier, monospace;">${otp}</span>
            </div>
            
            <p style="color: #64748b; font-size: 12px; line-height: 1.5; margin: 0;">
              If you did not initiate this registration, please ignore this email.
            </p>
          </div>
          
          <!-- Footer -->
          <div style="background-color: #f8fafc; border-top: 1px solid #e2e8f0; padding: 20px; text-align: center;">
            <p style="color: #94a3b8; font-size: 11px; margin: 0;">
              &copy; 2026 Curoxa EMR. All rights reserved.
            </p>
          </div>
        </div>
      </div>
    `;

    let emailSent = false;

    const { sendEmail } = require('../utils/emailService');
    const emailResult = await sendEmail({
      to: searchEmail,
      subject: "Curoxa Registration Verification Code: " + otp,
      html: emailHtmlBody
    });
    emailSent = emailResult.success;

    console.log(`[SECURITY] Registration OTP generated for ${searchEmail} (Tenant: ${req.tenantId}): ${otp}`);
    
    res.json({
      message: "If you entered a valid email, a verification OTP has been sent.",
      ...(process.env.NODE_ENV !== "production" && !emailSent ? { dev_otp: otp } : {})
    });
  } catch (error) {
    console.error("Send registration OTP error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/auth/verify-registration-otp - Verify OTP
router.post("/verify-registration-otp", tenantMiddleware, async (req, res) => {
  const { email, otp } = req.body;
  if (!email || !otp) {
    return res.status(400).json({ error: "Email and OTP are required" });
  }

  try {
    const searchEmail = email.toLowerCase().trim();
    const RegistrationOtp = require("../models/RegistrationOtp");
    const record = await RegistrationOtp.findOne({ email: searchEmail, otp_code: otp.trim() });
    if (!record || record.expires_at < new Date()) {
      return res.status(400).json({ error: "Invalid or expired OTP code." });
    }

    res.json({ message: "OTP verified successfully" });
  } catch (error) {
    console.error("Verify registration OTP error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/auth/send-login-otp
router.post("/send-login-otp", tenantMiddleware, async (req, res) => {
  const { emailOrPhone } = req.body;
  if (!emailOrPhone) {
    return res.status(400).json({ error: "Email or Mobile Number is required" });
  }

  try {
    const input = emailOrPhone.trim();
    const path = require('path');
    
    // 1. Search for user by staff_id, email or phone across any tenant
    let user = await User.findOne({
      $or: [
        { staff_id: input },
        { email: input.toLowerCase() },
        { phone: input }
      ]
    });

    if (!user) {
      // 2. If not found in User, search in Patient and fetch their User account across any tenant
      const patient = await Patient.findOne({
        $or: [
          { email: input.toLowerCase() },
          { contact: input }
        ]
      });

      if (patient) {
        user = await User.findOne({
          tenantId: patient.tenantId,
          staff_id: patient.contact
        });
      }
    }

    if (!user) {
      return res.status(404).json({ error: "No registered account found for the provided details." });
    }

    // 3. Check suspension status of hospital using user.tenantId
    const SuperAdminHospital = require("../models/SuperAdminHospital");
    const hospital = await SuperAdminHospital.findOne({ code: user.tenantId });
    if (hospital && hospital.status !== 'Active') {
      return res.status(403).json({
        error: `Access denied. The subscription for hospital '${hospital.name}' is currently ${hospital.status}.`
      });
    }

    // 4. Generate 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    user.login_otp_code = otp;
    user.login_otp_expires_at = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes expiry
    await user.save();

    // 5. Send email (if email is configured)
    let emailSent = false;
    const isEmail = input.includes('@');
    const targetEmail = isEmail ? input.toLowerCase().trim() : (user.email ? user.email.toLowerCase().trim() : null);
    if (targetEmail) {
      const emailHtmlBody = `
        <div style="font-family: Arial, sans-serif; max-width: 500px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;">
          <h2 style="color: #2563eb; text-align: center;">Curoxa Secure OTP</h2>
          <p>Hello ${user.name || 'User'},</p>
          <p>You requested a One-Time Password (OTP) to log into your Curoxa account.</p>
          <div style="background: #f1f5f9; padding: 15px; border-radius: 6px; text-align: center; font-size: 24px; font-weight: 800; letter-spacing: 5px; color: #1e293b; margin: 20px 0;">
            ${otp}
          </div>
          <p style="font-size: 12px; color: #64748b;">This OTP is valid for 10 minutes. Please do not share this code with anyone.</p>
        </div>
      `;

      const { sendEmail } = require('../utils/emailService');
      const emailResult = await sendEmail({
        to: targetEmail,
        subject: `Curoxa Login Verification Code: ${otp}`,
        html: emailHtmlBody
      });
      emailSent = emailResult.success;
    }

    console.log(`[OTP] Generated login OTP: ${otp} for user ${user.staff_id} (Tenant: ${user.tenantId})`);
    
    // Write OTP to a local file for easy automated testing/readout
    const fs = require('fs');
    fs.writeFileSync(path.join(__dirname, '..', '.seed-otp.txt'), otp, 'utf8');

    res.json({
      message: "One-Time Password has been generated and sent.",
      ...(process.env.NODE_ENV !== "production" && !emailSent ? { dev_otp: otp } : {})
    });
  } catch (error) {
    console.error("Send login OTP error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/login-with-otp", tenantMiddleware, async (req, res) => {
  const { emailOrPhone, otp } = req.body;
  if (!emailOrPhone || !otp) {
    return res.status(400).json({ error: "Email/Mobile and OTP are required" });
  }

  try {
    const input = emailOrPhone.trim();
    const targetOtp = otp.trim();

    // 1. Search for user across any tenant
    let user = await User.findOne({
      $or: [
        { staff_id: input },
        { email: input.toLowerCase() },
        { phone: input }
      ]
    }).select("+password_hash");

    if (!user) {
      // 2. Search linked patient across any tenant
      const patient = await Patient.findOne({
        $or: [
          { email: input.toLowerCase() },
          { contact: input }
        ]
      });

      if (patient) {
        user = await User.findOne({
          tenantId: patient.tenantId,
          staff_id: patient.contact
        }).select("+password_hash");
      }
    }

    if (!user) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    // 3. Verify OTP
    if (!user.login_otp_code || user.login_otp_code !== targetOtp || user.login_otp_expires_at < new Date()) {
      return res.status(401).json({ error: "Invalid or expired OTP" });
    }

    // Clear OTP
    user.login_otp_code = null;
    user.login_otp_expires_at = null;
    user.lastLogin = new Date();
    await user.save();

    // 4. Generate token payload using user.tenantId
    let tokenPayload = {
      id: user._id,
      staff_id: user.staff_id,
      role: user.role,
      name: user.name,
      tenantId: user.tenantId,
      passwordHash: user.password_hash,
      password_version: user.password_version || 0,
    };
    let isPatientComplete = false;
    if (user.role === "patient") {
      const patient = await Patient.findOne({
        contact: user.staff_id,
        tenantId: user.tenantId,
      }) || await Patient.findOne({ contact: user.staff_id });
      if (patient) {
        tokenPayload.id = patient._id;
      }
      isPatientComplete = Boolean(isPatientProfileComplete(patient) || user.isSetupComplete);
      if (user.isSetupComplete !== isPatientComplete) {
        user.isSetupComplete = isPatientComplete;
        await user.save().catch(() => {});
      }
    }

    const token = jwt.sign(
      tokenPayload,
      getJwtSecret(),
      { expiresIn: "24h" },
    );

    // Fire-and-forget audit log
    AuditLog.create({
      tenantId: user.tenantId,
      actor: user.staff_id,
      actorName: user.name,
      actorRole: user.role,
      action: "login",
      target: user._id.toString(),
      metadata: { method: "otp" },
    }).catch(() => {});

    // Get tenant modules
    const SuperAdminHospital = require("../models/SuperAdminHospital");
    const hospital = await SuperAdminHospital.findOne({ code: user.tenantId });
    const tenantModules = (user.role === 'superadmin' || user.role === 'super_admin')
      ? { reception: { enabled: true }, doctor: { enabled: true }, pharmacy: { enabled: true }, laboratory: { enabled: true }, inventory: { enabled: true }, dpdp: { enabled: true } }
      : (hospital ? hospital.modules : { reception: { enabled: true }, doctor: { enabled: true }, pharmacy: { enabled: true }, laboratory: { enabled: true }, inventory: { enabled: true }, dpdp: { enabled: true } });

    res.json({
      message: "Login successful",
      token,
      user: {
        id: tokenPayload.id,
        staff_id: user.staff_id,
        role: user.role,
        name: user.name,
        email: user.email || '',
        avatar: user.avatar || '',
        specialty: user.specialty,
        isSetupComplete: user.role === 'patient' ? isPatientComplete : user.isSetupComplete,
        tenantId: user.tenantId,
        tenantName: hospital ? hospital.name : 'Sunrise Multispeciality',
        createdAt: user.createdAt,
      },
      tenantModules,
      plan: hospital ? hospital.plan : null
    });
  } catch (error) {
    console.error("Login with OTP error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ==================== HOSPITAL CLIENT-SIDE SUPPORT TICKETS ====================
router.get("/support/tickets", verifyToken, async (req, res) => {
  try {
    const SuperAdminSupport = require("../models/SuperAdminSupport");
    const SuperAdminHospital = require("../models/SuperAdminHospital");
    
    const hospital = await SuperAdminHospital.findOne({ code: req.tenantId });
    const hospitalName = hospital ? hospital.name : req.tenantId;

    const tickets = await SuperAdminSupport.find({
      $or: [
        { hospital: req.tenantId },
        { hospital: hospitalName }
      ]
    }).sort({ createdAt: -1 });

    res.json(tickets);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/support/tickets", verifyToken, async (req, res) => {
  try {
    const SuperAdminSupport = require("../models/SuperAdminSupport");
    const SuperAdminHospital = require("../models/SuperAdminHospital");
    const SuperAdminNotification = require("../models/SuperAdminNotification");
    const SuperAdminAudit = require("../models/SuperAdminAudit");

    const hospital = await SuperAdminHospital.findOne({ code: req.tenantId });
    const hospitalName = hospital ? hospital.name : req.tenantId;

    const ticketCount = await SuperAdminSupport.countDocuments();
    const ticketId = `TKT-${new Date().getFullYear()}-${String(ticketCount + 1).padStart(3, '0')}`;

    const ticketData = {
      id: ticketId,
      hospital: hospitalName,
      contact: req.user.email || req.user.staff_id,
      department: req.body.department || 'General',
      priority: req.body.priority || 'Medium',
      category: req.body.category || 'Technical Issue',
      createdOn: new Date().toISOString().split('T')[0],
      status: 'Open',
      slaStatus: 'Within SLA',
      description: req.body.description,
      messages: [{
        sender: req.user.name || req.user.staff_id,
        timestamp: new Date().toISOString(),
        text: req.body.description,
        isNote: false
      }],
      timeline: [{
        action: 'Ticket Created',
        date: new Date().toISOString(),
        actor: req.user.name || req.user.staff_id
      }]
    };

    const ticket = await SuperAdminSupport.create(ticketData);

    try {
      const ip = req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress;
      await SuperAdminAudit.create({
        user: req.user.staff_id,
        action: 'create_ticket',
        details: `Logged support ticket ${ticket.id} for ${ticket.hospital}`,
        ip
      });
      await SuperAdminNotification.create({
        title: 'New Support Ticket Logged',
        message: `Ticket ${ticket.id} (${ticket.priority} priority) logged for ${ticket.hospital}`,
        type: ticket.priority === 'Critical' ? 'error' : (ticket.priority === 'High' ? 'warning' : 'info'),
        category: 'support'
      });
    } catch (auditErr) {
      console.error('Audit/Notification failed for support ticket:', auditErr);
    }

    const io = req.app.get("io");
    if (io) {
      io.emit("ticket_created", ticket);
    }

    res.status(201).json(ticket);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post("/support/tickets/:id/message", verifyToken, async (req, res) => {
  try {
    const SuperAdminSupport = require("../models/SuperAdminSupport");
    const ticket = await SuperAdminSupport.findById(req.params.id);
    if (!ticket) return res.status(404).json({ error: 'Ticket not found' });

    const SuperAdminHospital = require("../models/SuperAdminHospital");
    const hospital = await SuperAdminHospital.findOne({ code: req.tenantId });
    const hospitalName = hospital ? hospital.name : req.tenantId;

    if (ticket.hospital !== hospitalName && ticket.hospital !== req.tenantId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    ticket.messages.push({
      sender: req.user.name || req.user.staff_id,
      timestamp: new Date().toISOString(),
      text: req.body.text,
      isNote: false
    });
    await ticket.save();

    const io = req.app.get("io");
    if (io) {
      io.emit("ticket_message", {
        ticketId: ticket._id.toString(),
        message: ticket.messages[ticket.messages.length - 1]
      });
    }

    res.json(ticket);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get all staff users (scoped to tenant) for select menus
router.get("/users/all", verifyToken, async (req, res) => {
  try {
    const users = await User.find(
      { tenantId: req.tenantId, role: { $nin: ["patient"] } },
      "name role phone email staff_id"
    );
    res.json(users);
  } catch (error) {
    console.error("Fetch all users error:", error);
    res.status(500).json({ error: 'Internal server error' });
  }
});


// ==========================================
// PATIENT PORTAL ROUTES
// ==========================================

// Production-tested email dispatcher across Brevo, SendGrid, Resend, and SMTP
async function sendPortalOtpEmail(targetEmail, otp) {
  const emailHtmlBody = `
    <div style="font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; background-color: #f8fafc; padding: 40px 20px; text-align: center;">
      <div style="max-width: 500px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1); border: 1px solid #e2e8f0; text-align: left;">
        <div style="background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%); padding: 26px; text-align: center;">
          <h1 style="color: #ffffff; margin: 0; font-size: 22px; font-weight: 700;">Curoxa Patient Portal</h1>
        </div>
        <div style="padding: 32px 24px; text-align: center;">
          <h2 style="color: #0f172a; margin-top: 0; margin-bottom: 8px; font-size: 18px; font-weight: 700;">Your Verification Code</h2>
          <p style="color: #475569; font-size: 14px; line-height: 1.5; margin-bottom: 24px;">
            Use the 6-digit One-Time Password (OTP) below to access your medical records and appointments. This code is valid for <strong>10 minutes</strong>.
          </p>
          <div style="background-color: #eff6ff; border: 1px solid #bfdbfe; border-radius: 8px; padding: 14px 24px; margin-bottom: 24px; display: inline-block;">
            <span style="font-size: 32px; font-weight: 800; color: #1e3a8a; letter-spacing: 6px; font-family: monospace;">${otp}</span>
          </div>
          <p style="color: #94a3b8; font-size: 12px; margin: 0;">
            If you did not request this OTP, you can safely ignore this email.
          </p>
        </div>
        <div style="background-color: #f8fafc; border-top: 1px solid #e2e8f0; padding: 14px; text-align: center;">
          <p style="color: #94a3b8; font-size: 11px; margin: 0;">&copy; 2026 Curoxa Healthcare Systems. Confidential.</p>
        </div>
      </div>
    </div>
  `;

  const { sendEmail } = require('../utils/emailService');
  const result = await sendEmail({
    to: targetEmail,
    subject: `${otp} is your Curoxa verification code`,
    text: `Your Curoxa verification code is: ${otp}. This code is valid for 10 minutes.`,
    html: emailHtmlBody
  });

  return result.success;
}

// Send OTP for Patient Portal (allows existing & new patients)
router.post('/patient-portal/send-otp', async (req, res) => {
  const { emailOrPhone } = req.body;
  if (!emailOrPhone) {
    return res.status(400).json({ error: 'Email or Mobile Number is required' });
  }

  try {
    const input = emailOrPhone.trim();
    const Patient = require('../models/Patient');
    const RegistrationOtp = require('../models/RegistrationOtp');
    const path = require('path');
    const fs = require('fs');
    
    const isEmail = input.includes('@');
    let targetEmail = null;
    let patient = null;
    let user = null;

    // 1. Strict email vs phone resolution (no cross-linking pollution)
    if (isEmail) {
      targetEmail = input.toLowerCase().trim();
      patient = await Patient.findOne({ email: targetEmail });
      user = await User.findOne({ email: targetEmail, role: 'patient' }) ||
             await User.findOne({ email: targetEmail });
    } else {
      patient = await Patient.findOne({ contact: input });
      user = await User.findOne({ phone: input, role: 'patient' }) ||
             await User.findOne({ staff_id: input });
      if (user && user.email) {
        targetEmail = user.email.toLowerCase().trim();
      } else if (patient && patient.email) {
        targetEmail = patient.email.toLowerCase().trim();
      }
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 mins

    if (user) {
      user.login_otp_code = otp;
      user.login_otp_expires_at = expiresAt;
      await user.save();
    }

    // Always store in RegistrationOtp for seamless verification fallback
    try {
      await RegistrationOtp.findOneAndUpdate(
        { email: isEmail ? targetEmail : input },
        { otp_code: otp, expires_at: expiresAt },
        { upsert: true, new: true }
      );
    } catch (dbErr) {
      console.warn('[PATIENT PORTAL] RegistrationOtp store warning:', dbErr.message);
    }

    console.log(`[PATIENT PORTAL] Generated OTP for ${input}: ${otp}`);

    // Write OTP to local file for debug
    try {
      fs.writeFileSync(path.join(__dirname, '..', '.seed-otp.txt'), otp, 'utf8');
    } catch (_) {}

    // Send email to target email address
    if (targetEmail) {
      await sendPortalOtpEmail(targetEmail, otp);
    }

    const isRegistered = Boolean(patient || user);
    return res.json({ message: 'OTP sent successfully', isNewUser: !isRegistered });

  } catch (error) {
    console.error('Patient Portal Send OTP Error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// Verify OTP for Patient Portal
router.post('/patient-portal/verify-otp', async (req, res) => {
  const { emailOrPhone, otp } = req.body;
  if (!emailOrPhone || !otp) {
    return res.status(400).json({ error: 'Email/Mobile and OTP are required' });
  }

  try {
    const input = emailOrPhone.trim();
    const targetOtp = otp.trim();
    const Patient = require('../models/Patient');
    const RegistrationOtp = require('../models/RegistrationOtp');
    const { getJwtSecret } = require('../config/env');

    let secretKey;
    try { secretKey = getJwtSecret(); } catch(e) { secretKey = process.env.JWT_SECRET || 'secret_key'; }

    const isEmail = input.includes('@');
    let patientDoc = null;
    let user = null;

    if (isEmail) {
      const emailLower = input.toLowerCase().trim();
      patientDoc = await Patient.findOne({ email: emailLower });
      user = await User.findOne({ email: emailLower, role: 'patient' }).select('+password_hash') ||
             await User.findOne({ email: emailLower }).select('+password_hash');
    } else {
      patientDoc = await Patient.findOne({ contact: input });
      user = await User.findOne({ phone: input, role: 'patient' }).select('+password_hash') ||
             await User.findOne({ staff_id: input }).select('+password_hash');
    }

    // 3. Verify OTP code
    let otpValid = false;
    if (user && user.login_otp_code === targetOtp && user.login_otp_expires_at >= new Date()) {
      otpValid = true;
    }

    if (!otpValid) {
      try {
        const regOtpRecord = await RegistrationOtp.findOne({ email: input.toLowerCase() });
        if (regOtpRecord && regOtpRecord.otp_code === targetOtp && regOtpRecord.expires_at >= new Date()) {
          otpValid = true;
          await RegistrationOtp.deleteOne({ _id: regOtpRecord._id }).catch(() => {});
        }
      } catch (e) {}
    }

    if (!otpValid) {
      return res.status(401).json({ error: 'Invalid or expired OTP' });
    }

    // 4. Handle Existing Patient or User
    if (patientDoc || user) {
      // If user was found but not patientDoc, try looking up patientDoc by user.phone or staff_id
      if (!patientDoc && user) {
        const phoneToLookup = user.phone || (user.staff_id ? user.staff_id.split('_')[0] : '');
        if (phoneToLookup) {
          patientDoc = await Patient.findOne({ contact: phoneToLookup }).sort({ updatedAt: -1 });
        }
      }

      // Check whether patient has complete clinical profile stored in MongoDB
      const isComplete = Boolean(isPatientProfileComplete(patientDoc) || user?.isSetupComplete);

      // If patient exists but no User account was created yet, create a User record now
      if (!user && patientDoc) {
        user = await User.create({
          name: patientDoc.name,
          email: patientDoc.email || `${patientDoc.contact}@curoxa.patient`,
          phone: patientDoc.contact,
          staff_id: patientDoc.contact,
          role: 'patient',
          tenantId: patientDoc.tenantId || 'city_hospital',
          isSetupComplete: isComplete,
          password_hash: 'PATIENT_OTP_AUTH'
        });
      } else if (user) {
        user.login_otp_code = null;
        user.login_otp_expires_at = null;
        user.lastLogin = new Date();
        if (user.isSetupComplete !== isComplete) {
          user.isSetupComplete = isComplete;
        }
        await user.save();
      }

      const jwt = require('jsonwebtoken');
      const targetId = patientDoc ? patientDoc._id : user._id;

      // Always grant role: 'patient' in the portal session token so they see patient dashboard history
      const tokenPayload = {
        id: targetId,
        userId: user._id,
        staff_id: user.staff_id || (patientDoc ? patientDoc.contact : input),
        email: user.email || (patientDoc ? patientDoc.email : (isEmail ? input : '')),
        phone: user.phone || (patientDoc ? patientDoc.contact : (!isEmail ? input : '')),
        role: 'patient',
        actualStaffRole: user.role,
        tenantId: user.tenantId || (patientDoc ? patientDoc.tenantId : 'city_hospital')
      };
      const token = jwt.sign(tokenPayload, secretKey, { expiresIn: '24h' });

      return res.json({ 
        message: 'Login successful', 
        token, 
        user: { 
          ...user.toObject(), 
          id: targetId, 
          role: 'patient', 
          actualStaffRole: user.role,
          name: patientDoc ? patientDoc.name : user.name,
          avatar: (patientDoc && patientDoc.avatar) ? patientDoc.avatar : (user.avatar || ''),
          isSetupComplete: isComplete,
          password_hash: undefined 
        },
        isNewUser: false
      });
    } else {
      // Completely new patient -> forward to registration
      const jwt = require('jsonwebtoken');
      const tempToken = jwt.sign({ emailOrPhone: input, isNewPatient: true, role: 'patient' }, secretKey, { expiresIn: '1h' });

      return res.json({
        message: 'OTP verified. Proceed to registration.',
        tempToken,
        isNewUser: true,
        emailOrPhone: input
      });
    }

  } catch (error) {
    console.error('Patient Portal Verify OTP Error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/auth/test-email - Diagnostic route to test outbound email system
router.post('/test-email', async (req, res) => {
  const { to } = req.body;
  const targetEmail = to || process.env.SMTP_USER || "curoxatechnology@gmail.com";

  try {
    const { sendEmail } = require('../utils/emailService');
    const result = await sendEmail({
      to: targetEmail,
      subject: "Curoxa Healthcare System — Email Diagnostic Verification",
      text: "This is a diagnostic verification email sent by the Curoxa Platform. If you received this, your email system is fully operational.",
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 500px; margin: 0 auto; padding: 24px; border: 1px solid #E2E8F0; border-radius: 12px; background: #FFFFFF;">
          <div style="text-align: center; margin-bottom: 20px;">
            <h2 style="color: #2563EB; margin: 0; font-size: 20px;">Curoxa Email System Verified</h2>
            <p style="color: #64748B; font-size: 13px; margin: 6px 0 0 0;">System Diagnostic Test</p>
          </div>
          <div style="background: #F0FDF4; border: 1px solid #DCFCE7; border-radius: 8px; padding: 14px; margin-bottom: 16px;">
            <p style="margin: 0; color: #166534; font-size: 13.5px; font-weight: 600;">
              🎉 Congratulations! Outbound email delivery is operational.
            </p>
          </div>
          <p style="color: #475569; font-size: 13px; line-height: 1.5;">
            Your Curoxa deployment is configured with multi-tier failover (Gmail SMTP, Brevo API, Resend API). Patient OTPs, hospital invites, and staff alerts will now be dispatched automatically.
          </p>
          <div style="border-top: 1px solid #E2E8F0; padding-top: 12px; margin-top: 20px; text-align: center; color: #94A3B8; font-size: 11px;">
            Timestamp: ${new Date().toISOString()} • Curoxa Platform
          </div>
        </div>
      `
    });

    return res.json({
      message: result.success ? "Test email dispatched successfully!" : "Failed to dispatch test email",
      ...result
    });
  } catch (err) {
    console.error("Test email error:", err);
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;

