const express = require("express");
const bcrypt = require("bcrypt");
const User = require("../models/User");
const AuditLog = require("../models/AuditLog");
const { verifyToken, isAdmin, isHrOrAdmin } = require("../middleware/authMiddleware");
const router = express.Router();

// Helper: fire-and-forget audit log
const writeAudit = (req, action, target, metadata = {}) => {
  try {
    const actor = req.user ? (req.user.staff_id || req.user.id || "system") : "system";
    const actorName = req.user ? (req.user.name || "") : "";
    const actorRole = req.user ? (req.user.role || "admin") : "admin";
    AuditLog.create({
      tenantId: req.tenantId || "city_hospital",
      actor,
      actorName,
      actorRole,
      action,
      target: String(target || ""),
      metadata,
    }).catch((err) => {
      console.error("AuditLog create failed:", err.message);
    });
  } catch (err) {
    console.error("writeAudit failed synchronously:", err.message);
  }
};

// Apply token verification middleware to all routes in this file
router.use(verifyToken);

// Check username availability
router.get("/users/check-username", isHrOrAdmin, async (req, res) => {
  const { username } = req.query;
  if (!username) {
    return res.status(400).json({ error: "Username parameter is required" });
  }
  try {
    const cleanUsername = username.toLowerCase().trim();
    const existingUser = await User.findOne({
      $or: [
        { staff_id: cleanUsername },
        { phone: cleanUsername }
      ]
    });
    res.json({ available: !existingUser });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get all staff users (scoped to tenant)
router.get("/users", isHrOrAdmin, async (req, res) => {
  try {
    const users = await User.find(
      { tenantId: req.tenantId, role: { $nin: ["patient", "admin"] } }
    );
    res.json(users);
  } catch (error) {
    console.error("Admin route error:", error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create a new staff user (scoped to tenant)
router.post("/users", isHrOrAdmin, async (req, res) => {
  const { staff_id, password, role, name, max_slots, email } = req.body;

  if (!staff_id || !password || !role || !name) {
    return res.status(400).json({ error: "All fields are required" });
  }

  try {
    const cleanUsername = staff_id.toLowerCase().trim();
    const existingUser = await User.findOne({
      $or: [
        { staff_id: { $regex: new RegExp(`^${cleanUsername.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') } },
        { phone: { $regex: new RegExp(`^${cleanUsername.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') } }
      ]
    });
    if (existingUser) {
      return res
        .status(400)
        .json({ error: "Staff ID/Username or phone number already exists in the system. Please use a unique username/phone." });
    }

    if (req.body.phone) {
      const cleanPhone = req.body.phone.trim();
      const existingPhone = await User.findOne({
        $or: [
          { staff_id: { $regex: new RegExp(`^${cleanPhone.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') } },
          { phone: { $regex: new RegExp(`^${cleanPhone.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') } }
        ]
      });
      if (existingPhone) {
        return res
          .status(400)
          .json({ error: "This phone number is already registered to another staff/admin member." });
      }
    }

    const SuperAdminHospital = require("../models/SuperAdminHospital");
    const hospital = await SuperAdminHospital.findOne({ code: req.tenantId });
    if (hospital) {
      const staffLimit = hospital.limits.staffLimit || 20;
      const totalStaffCount = await User.countDocuments({ tenantId: req.tenantId, role: { $nin: ['patient', 'admin'] } });
      if (totalStaffCount >= staffLimit) {
        return res.status(403).json({ error: `Staff limit of ${staffLimit} reached under your current subscription plan. Please upgrade.` });
      }
    }

    const salt = await bcrypt.genSalt(10);
    const hash = await bcrypt.hash(password, salt);

    const newUser = await User.create({
      tenantId: req.tenantId,
      staff_id,
      password_hash: hash,
      role,
      name,
      email: email ? email.trim().toLowerCase() : "",
      max_slots: role === "doctor" ? (max_slots ? Number(max_slots) : 10) : undefined,
      consultationFee: role === "doctor" ? (req.body.consultationFee !== undefined ? Number(req.body.consultationFee) : 500) : undefined,
      specialty: req.body.specialty || '',
      phone: req.body.phone,
      gender: req.body.gender,
      dob: req.body.dob,
      bloodGroup: req.body.bloodGroup,
      address: req.body.address,
      emergencyContact: req.body.emergencyContact,
      aadhaar: req.body.aadhaar,
      pan: req.body.pan,
      department: req.body.department || req.body.specialty || (role === 'doctor' ? 'General Medicine' : role === 'hr' ? 'Hospital Administration' : 'Administration'),
      designation: req.body.designation || (role === 'doctor' ? 'Consultant Practitioner' : role === 'hr' ? 'HR Manager' : role.charAt(0).toUpperCase() + role.slice(1)),
      employmentType: req.body.employmentType || 'Full-Time',
      joiningDate: req.body.joiningDate || new Date().toISOString().split('T')[0],
      reportingManagerId: req.body.reportingManagerId || (req.user ? (req.user.staff_id || req.user.id || 'EMP-2026-100') : 'EMP-2026-100'),
      reportingManagerName: req.body.reportingManagerName || (req.user ? `${req.user.name} (Administrator)` : 'Ishita Jain (Administrator)'),
      workLocation: req.body.workLocation || 'Main Wing - Sunrise Clinic',
      shiftName: req.body.shiftName || 'Day Rotation',
      grade: req.body.grade || 'G3',
      experienceYears: req.body.experienceYears || 5,
      bankDetails: req.body.bankDetails || { accountHolder: name, accountNumber: '123456789012', bankName: 'State Bank of India', ifsc: 'SBIN0001234' },
      ctcAnnual: req.body.ctcAnnual || (role === 'doctor' ? 1800000 : role === 'hr' ? 1200000 : role === 'admin' ? 1500000 : 480000),
      pfEnrolled: req.body.pfEnrolled !== undefined ? req.body.pfEnrolled : true,
      esiEnrolled: req.body.esiEnrolled !== undefined ? req.body.esiEnrolled : false,
      taxBracket: req.body.taxBracket || '20% Bracket',
      leaveBalance: req.body.leaveBalance,
      doctorSlots: role === 'doctor' ? (req.body.doctorSlots || []) : [],
      weeklyOff: req.body.weeklyOff || 'Sunday',
      avatar: req.body.avatar || ''
    });

    writeAudit(req, "staff_created", newUser._id, { staff_id, role, name });

    res.status(201).json(newUser);
  } catch (error) {
    console.error("Create staff error:", error);
    res.status(500).json({ error: "Server error" });
  }
});

// Update a staff user (scoped to tenant)
router.put("/users/:id", isHrOrAdmin, async (req, res) => {
  const id = req.params.id;
  const { password } = req.body;
  console.log(`[UPDATE USER] ID: ${id}, Body:`, JSON.stringify(req.body));

  try {
    const updateFields = {};
    const allowedFields = [
      'name', 'role', 'specialty', 'email', 'phone', 'gender', 'dob', 
      'bloodGroup', 'address', 'emergencyContact', 'aadhaar', 'pan', 
      'department', 'designation', 'employmentType', 'joiningDate', 
      'reportingManagerId', 'reportingManagerName', 'workLocation', 
      'shiftName', 'grade', 'experienceYears', 'bankDetails', 'ctcAnnual', 
      'pfEnrolled', 'esiEnrolled', 'taxBracket', 'leaveBalance', 'avatar', 'status',
      'carriedForwardLeaves', 'monthlyLeaveAllocation', 'documents',
      'doctorSlots', 'weeklyOff', 'consultationFee'
    ];

    allowedFields.forEach(field => {
      if (req.body[field] !== undefined) {
        updateFields[field] = req.body[field];
      }
    });

    if (req.body.role === "doctor") {
      updateFields.max_slots = req.body.max_slots ? Number(req.body.max_slots) : 10;
    }

    const updateObj = { $set: updateFields };
    if (password && password.trim()) {
      const trimmedPassword = password.trim();
      const salt = await bcrypt.genSalt(10);
      updateFields.password_hash = await bcrypt.hash(trimmedPassword, salt);
      updateObj.$inc = { password_version: 1 };
    }

    const updatedUser = await User.findOneAndUpdate(
      { _id: id, tenantId: req.tenantId },
      updateObj,
      {
        returnDocument: 'after'
      },
    );

    if (updatedUser && password && password.trim()) {
      const io = req.app.get("io");
      if (io) {
        io.emit("session_revoked", { userId: updatedUser._id.toString(), staffId: updatedUser.staff_id });
      }
    }

    if (!updatedUser) {
      return res.status(404).json({ error: "User not found" });
    }

    writeAudit(req, "staff_updated", updatedUser._id, {
      staff_id: updatedUser.staff_id,
      role: updatedUser.role,
    });

    res.json(updatedUser);
  } catch (error) {
    console.error("Admin route error:", error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete a staff user (scoped to tenant)
router.delete("/users/:id", isHrOrAdmin, async (req, res) => {
  const id = req.params.id;
  const fs = require('fs');
  const path = require('path');
  const logFile = path.join(__dirname, '../delete_debug.txt');
  
  try {
    fs.appendFileSync(logFile, `[DELETE] Attempting delete for ID: ${id}, tenantId: ${req.tenantId}\n`);
    
    // First, find the user
    const targetUser = await User.findOne({
      _id: id,
      tenantId: req.tenantId,
    });
    
    if (!targetUser) {
      fs.appendFileSync(logFile, `[DELETE] User not found for ID: ${id}, tenantId: ${req.tenantId}\n`);
      return res.status(404).json({ error: "User not found" });
    }
    
    fs.appendFileSync(logFile, `[DELETE] Found user: ${targetUser.staff_id}, role: ${targetUser.role}. Proceeding to delete...\n`);
    
    // Perform delete
    await User.deleteOne({
      _id: id,
      tenantId: req.tenantId,
    });
    
    fs.appendFileSync(logFile, `[DELETE] Successfully deleted user document from DB.\n`);
    
    // Log audit trail
    writeAudit(req, "staff_deleted", targetUser._id, {
      staff_id: targetUser.staff_id,
      role: targetUser.role,
    });
    
    fs.appendFileSync(logFile, `[DELETE] Successfully logged audit trail.\n`);
    res.json({ message: "User deleted" });
  } catch (error) {
    console.error("Admin route error during user delete:", error);
    try {
      fs.appendFileSync(logFile, `[DELETE ERROR] ${error.message}\n${error.stack}\n`);
    } catch (err) {}
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get all low-stock inventory alerts from both Pharmacy (Medicine) and Laboratory (LabInventory) (scoped to tenant)
router.get("/inventory-alerts", isAdmin, async (req, res) => {
  try {
    const Medicine = require("../models/Medicine");
    const LabInventory = require("../models/LabInventory");

    const lowMedicines = await Medicine.find({
      status: { $in: ["Low Stock", "Out of Stock"] },
      tenantId: req.tenantId,
    });
    const lowLabReagents = await LabInventory.find({
      status: { $in: ["Low Stock", "Out of Stock"] },
      tenantId: req.tenantId,
    });

    // Format them with a consistent structure for the Admin Dashboard
    const alerts = [
      ...lowMedicines.map((m) => ({
        _id: m._id,
        name: m.name,
        category: m.category,
        stock: `${m.stock} ${m.unit}`,
        status: m.status === "Out of Stock" ? "Out of Stock" : "Low Stock",
        department: "Pharmacy",
        rawItem: m,
      })),
      ...lowLabReagents.map((l) => ({
        _id: l._id,
        name: l.name,
        category: l.category,
        stock: `${l.stock} ${l.unit}`,
        status: l.status === "Out of Stock" ? "Out of Stock" : "Low Stock",
        department: "Laboratory",
        rawItem: l,
      })),
    ];

    res.json(alerts);
  } catch (error) {
    console.error("Admin route error:", error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get subscription info (plan details & actual usage stats) for the current tenant
router.get("/subscription", isHrOrAdmin, async (req, res) => {
  try {
    const SuperAdminHospital = require('../models/SuperAdminHospital');
    const Patient = require('../models/Patient');
    const User = require('../models/User');
    const LabRequest = require('../models/LabRequest');

    // Find the hospital in the superadmin table by tenant code
    const hospital = await SuperAdminHospital.findOne({ code: req.tenantId.toLowerCase().trim() });
    if (!hospital) {
      return res.status(404).json({ error: "Hospital subscription records not found." });
    }

    // Dynamic stats:
    // 1. Patient registrations count
    const patientCount = await Patient.countDocuments({ tenantId: req.tenantId });

    // 2. Active staff accounts count (non-patients, non-admins)
    const staffCount = await User.countDocuments({ 
      tenantId: req.tenantId, 
      role: { $nin: ['patient', 'admin'] } 
    });

    // 3. Doctors count
    const doctorCount = await User.countDocuments({ 
      tenantId: req.tenantId, 
      role: 'doctor' 
    });

    // 4. Lab reports issued (completed lab requests)
    const labReportCount = await LabRequest.countDocuments({ 
      tenantId: req.tenantId, 
      status: 'Completed' 
    });

    // Parse goLiveDate / createdAt to calculate renewal
    let renewalDate = null;
    if (hospital.goLiveDate) {
      const baseDate = new Date(hospital.goLiveDate);
      if (!isNaN(baseDate.getTime())) {
        renewalDate = new Date(baseDate);
        renewalDate.setFullYear(renewalDate.getFullYear() + 1); // 1 year renewal cycle
      }
    }
    if (!renewalDate) {
      const baseDate = new Date(hospital.createdAt || Date.now());
      renewalDate = new Date(baseDate);
      renewalDate.setFullYear(renewalDate.getFullYear() + 1);
    }

    const SuperAdminInvoice = require('../models/SuperAdminInvoice');
    const invoices = await SuperAdminInvoice.find({ hospital: hospital.name }).sort({ createdAt: -1 });

    res.json({
      name: hospital.name,
      plan: hospital.plan,
      status: hospital.status,
      limits: hospital.limits || {
        doctorsLimit: 25,
        staffLimit: 50,
        patients: 5000,
        storageQuotaGb: 250
      },
      modules: hospital.modules || {},
      isGstVerified: hospital.isGstVerified || false,
      gstVerificationDetails: hospital.gstVerificationDetails || {},
      isLicenseVerified: hospital.isLicenseVerified || false,
      licenseVerificationDetails: hospital.licenseVerificationDetails || {},
      renewalDate: renewalDate.toISOString(),
      usage: {
        patientCount,
        staffCount,
        doctorCount,
        labReportCount
      },
      invoices
    });
  } catch (error) {
    console.error("Fetch subscription details error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Get all recent broadcasts (accessible to all authenticated staff)
router.get("/broadcasts", verifyToken, async (req, res) => {
  try {
    const SuperAdminBroadcast = require("../models/SuperAdminBroadcast");
    const broadcasts = await SuperAdminBroadcast.find({}).sort({ createdAt: -1 }).limit(20);
    res.json(broadcasts);
  } catch (error) {
    console.error("Fetch broadcasts error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Get subscription plans for pricing cards display
router.get("/plans", isHrOrAdmin, async (req, res) => {
  try {
    const SuperAdminPlan = require('../models/SuperAdminPlan');
    const plans = await SuperAdminPlan.find({});
    res.json(plans);
  } catch (error) {
    console.error("Fetch plans error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Letterhead management routes
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const SuperAdminHospital = require('../models/SuperAdminHospital');
const { PutObjectCommand } = require('@aws-sdk/client-s3');
const r2 = require('../config/r2');

const storage = multer.memoryStorage();
const uploadLetterhead = multer({ storage: storage, limits: { fileSize: 10 * 1024 * 1024 } }); // 10MB limit

// Get current hospital letterhead
router.get("/letterhead", async (req, res) => {
  try {
    const hospital = await SuperAdminHospital.findOne({ code: req.tenantId });
    if (!hospital) {
      return res.status(404).json({ error: "Hospital tenant not found" });
    }
    res.json({ 
      letterheadUrl: hospital.letterheadUrl || "",
      prescriptionTemplates: hospital.prescriptionTemplates || []
    });
  } catch (error) {
    console.error("Get letterhead error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Upload hospital letterhead
router.post("/letterhead", isAdmin, uploadLetterhead.single('letterhead'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded." });
    }

    // Convert directly to base64 Data URL to prevent ephemeral filesystem 404s
    const base64Data = req.file.buffer.toString('base64');
    const fileUrl = `data:${req.file.mimetype};base64,${base64Data}`;

    const hospital = await SuperAdminHospital.findOneAndUpdate(
      { code: req.tenantId },
      { $set: { letterheadUrl: fileUrl } },
      { new: true }
    );

    if (!hospital) {
      return res.status(404).json({ error: "Hospital tenant not found" });
    }

    writeAudit(req, "upload_letterhead", hospital._id, { url: fileUrl });
    res.json({ success: true, letterheadUrl: fileUrl });
  } catch (error) {
    console.error("Upload letterhead error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Clear hospital letterhead
router.post("/letterhead-clear", isAdmin, async (req, res) => {
  try {
    const hospital = await SuperAdminHospital.findOneAndUpdate(
      { code: req.tenantId },
      { $set: { letterheadUrl: "" } },
      { new: true }
    );
    if (!hospital) {
      return res.status(404).json({ error: "Hospital tenant not found" });
    }
    writeAudit(req, "clear_letterhead", hospital._id);
    res.json({ success: true, letterheadUrl: "" });
  } catch (error) {
    console.error("Clear letterhead error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Save or update prescription template
router.post("/prescription-templates", isAdmin, async (req, res) => {
  try {
    const { id, name, xLeft, xRight, yTop, yBottom, isStandard } = req.body;
    if (!name) {
      return res.status(400).json({ error: "Template name is required." });
    }

    const hospital = await SuperAdminHospital.findOne({ code: req.tenantId });
    if (!hospital) {
      return res.status(404).json({ error: "Hospital tenant not found" });
    }

    if (!hospital.prescriptionTemplates) {
      hospital.prescriptionTemplates = [];
    }

    if (id) {
      // Update existing template
      const tpl = hospital.prescriptionTemplates.id(id);
      if (tpl) {
        tpl.name = name;
        tpl.xLeft = xLeft || 15;
        tpl.xRight = xRight || 15;
        tpl.yTop = yTop || 38;
        tpl.yBottom = yBottom || 28;
        if (isStandard) {
          hospital.prescriptionTemplates.forEach(t => t.isStandard = false);
          tpl.isStandard = true;
        }
      } else {
        return res.status(404).json({ error: "Template not found." });
      }
    } else {
      // Create new template
      if (hospital.prescriptionTemplates.length >= 3) {
        return res.status(400).json({ error: "Maximum limit of 3 templates reached. Delete an existing template to create a new one." });
      }
      if (isStandard || hospital.prescriptionTemplates.length === 0) {
        hospital.prescriptionTemplates.forEach(t => t.isStandard = false);
      }
      hospital.prescriptionTemplates.push({
        name,
        xLeft: xLeft || 15,
        xRight: xRight || 15,
        yTop: yTop || 38,
        yBottom: yBottom || 28,
        isStandard: isStandard || hospital.prescriptionTemplates.length === 0
      });
    }

    await hospital.save();
    res.json({ success: true, prescriptionTemplates: hospital.prescriptionTemplates });
  } catch (error) {
    console.error("Save template error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Set template as standard (active)
router.post("/prescription-templates/set-standard", isAdmin, async (req, res) => {
  try {
    const { id } = req.body;
    const hospital = await SuperAdminHospital.findOne({ code: req.tenantId });
    if (!hospital) {
      return res.status(404).json({ error: "Hospital tenant not found" });
    }

    let found = false;
    hospital.prescriptionTemplates.forEach(t => {
      if (t._id.toString() === id) {
        t.isStandard = true;
        found = true;
      } else {
        t.isStandard = false;
      }
    });

    if (!found) {
      return res.status(404).json({ error: "Template not found." });
    }

    await hospital.save();
    res.json({ success: true, prescriptionTemplates: hospital.prescriptionTemplates });
  } catch (error) {
    console.error("Set standard template error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Delete prescription template
router.delete("/prescription-templates/:id", isAdmin, async (req, res) => {
  try {
    const hospital = await SuperAdminHospital.findOne({ code: req.tenantId });
    if (!hospital) {
      return res.status(404).json({ error: "Hospital tenant not found" });
    }

    hospital.prescriptionTemplates = hospital.prescriptionTemplates.filter(
      t => t._id.toString() !== req.params.id
    );

    // If we deleted the standard one and there are templates left, make the first one standard
    if (hospital.prescriptionTemplates.length > 0 && !hospital.prescriptionTemplates.some(t => t.isStandard)) {
      hospital.prescriptionTemplates[0].isStandard = true;
    }

    await hospital.save();
    res.json({ success: true, prescriptionTemplates: hospital.prescriptionTemplates });
  } catch (error) {
    console.error("Delete template error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

module.exports = router;
