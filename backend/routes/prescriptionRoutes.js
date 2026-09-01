const express = require("express");
const Prescription = require("../models/Prescription");
const Medicine = require("../models/Medicine");
const AuditLog = require("../models/AuditLog");
const Appointment = require("../models/Appointment");
const LabRequest = require("../models/LabRequest");
const { validateAndPlanFEFO, commitFEFOConsumption } = require("../utils/inventoryEngine");
const { verifyToken } = require("../middleware/authMiddleware");
const { checkDoctorClinicalMode } = require("../middleware/subscriptionMiddleware");
const router = express.Router();

router.use(verifyToken);
router.use(checkDoctorClinicalMode);

// Get all prescriptions (filter by status or patientId, scoped to tenant)
router.get("/", async (req, res) => {
  try {
    const query = { tenantId: req.tenantId };
    if (req.query.status) query.status = req.query.status;
    if (req.query.patientId) query.patientId = req.query.patientId;

    // Projection: only fields the pharmacy queue / doctor history actually need
    const prescriptions = await Prescription.find(query)
      .select(
        "patientId doctorId items status createdAt updatedAt appointmentId prescriptionType images offlineMetadata editableUntil isLocked correctionHistory",
      )
      .populate("patientId", "name age contact")
      .populate("doctorId", "name specialty department designation staff_id")
      .sort({ createdAt: -1 })
      .limit(parseInt(req.query.limit, 10) || 200)
      .lean();
    res.json(prescriptions);
  } catch (error) {
    console.error("Get prescriptions error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Create a prescription (scoped to tenant) — NO premature stock deduction
router.post("/", async (req, res) => {
  const { patientId, doctorId, items, status, appointmentId } = req.body;
  try {
    const prescription = await Prescription.create({
      tenantId: req.tenantId,
      patientId,
      doctorId,
      items,
      status: status || 'Pending',
      appointmentId
    });

    // Fire-and-forget audit log
    AuditLog.create({
      tenantId: req.tenantId,
      actor: req.user.staff_id || req.user.id || "system",
      actorName: req.user.name || "",
      actorRole: req.user.role || "",
      action: "prescription_created",
      target: prescription._id.toString(),
      metadata: {
        patientId: prescription.patientId,
        itemCount: prescription.items?.length || 0,
      },
    }).catch(() => {});

    const io = req.app.get("io");
    if (io && req.tenantId) {
      io.to(req.tenantId).emit("data_changed", { type: "prescriptions" });
    }
    res.status(201).json(prescription);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Update status or edit prescription details (scoped to tenant)
router.put("/:id", async (req, res) => {
  const { items, status, appointmentId, labs, diagnosis, notes } = req.body;
  try {
    const rxId = req.params.id;
    const previous = await Prescription.findOne({
      _id: rxId,
      tenantId: req.tenantId,
    })
      .populate("patientId", "name")
      .lean();
    if (!previous)
      return res.status(404).json({ error: "Prescription not found" });

    const isDispenseTransition = (status === 'Dispensed' || status === 'Dispensed by Pharmacy');
    const wasAlreadyDispensed = (previous.status === 'Dispensed' || previous.status === 'Dispensed by Pharmacy');

    // Invariant 1: Prevent double dispensing
    if (isDispenseTransition && wasAlreadyDispensed) {
      return res.status(400).json({ error: "Prescription has already been dispensed and cannot be dispensed again." });
    }

    // Invariant 2: Cannot dispense a cancelled prescription
    if (isDispenseTransition && previous.status === 'Cancelled') {
      return res.status(400).json({ error: "Cannot dispense a cancelled prescription." });
    }

    // Invariant 3: Atomic stock validation and deduction upon dispensing using FEFO
    let stockModified = false;
    let fefoAllocationsSummary = [];
    if (isDispenseTransition && !wasAlreadyDispensed) {
      const itemsToDispense = items !== undefined ? items : previous.items;
      if (Array.isArray(itemsToDispense) && itemsToDispense.length > 0) {
        try {
          // Step 1: Pre-validate all items across prescription and compute FEFO allocations
          const fefoPlans = await validateAndPlanFEFO(req.tenantId, itemsToDispense);

          // Step 2: Atomically commit FEFO batch and aggregate Medicine.stock deductions
          await commitFEFOConsumption(req.tenantId, fefoPlans);
          stockModified = true;

          fefoAllocationsSummary = fefoPlans.map(p => ({
            medicine: p.medicineDoc.name,
            sku: p.medicineDoc.sku,
            quantity: p.quantity,
            allocations: p.allocations.map(a => ({ batchNumber: a.batchNumber, quantity: a.quantity }))
          }));
        } catch (invErr) {
          return res.status(400).json({ error: invErr.message });
        }
      }
    }

    const updateObj = {};
    if (items !== undefined) updateObj.items = items;
    if (status !== undefined) updateObj.status = status;
    if (appointmentId !== undefined) updateObj.appointmentId = appointmentId;

    const prescription = await Prescription.findOneAndUpdate(
      { _id: rxId, tenantId: req.tenantId },
      updateObj,
      { returnDocument: "after" }
    ).populate("patientId", "name");

    let pharmacistChanged = false;
    let labTechChanged = false;
    const diffDetails = [];

    // 1. Compare medicines (pharmacist/doctor changes)
    if (items !== undefined && previous.items) {
      const prevMap = new Map(previous.items.map(i => [i.medicine, i]));
      const newMap = new Map(items.map(i => [i.medicine, i]));

      for (const [name, newItem] of newMap) {
        if (!prevMap.has(name)) {
          diffDetails.push(`Added medicine: ${name} (${newItem.dosage}, ${newItem.duration})`);
          pharmacistChanged = true;
        } else {
          const oldItem = prevMap.get(name);
          const changes = [];
          if (oldItem.dosage !== newItem.dosage) changes.push(`dose (${oldItem.dosage} -> ${newItem.dosage})`);
          if (oldItem.duration !== newItem.duration) changes.push(`duration (${oldItem.duration} -> ${newItem.duration})`);
          if (oldItem.instructions !== newItem.instructions) changes.push(`instructions (${oldItem.instructions} -> ${newItem.instructions})`);
          if (changes.length > 0) {
            diffDetails.push(`Modified ${name}: ${changes.join(', ')}`);
            pharmacistChanged = true;
          }
        }
      }

      for (const [name, oldItem] of prevMap) {
        if (!newMap.has(name)) {
          diffDetails.push(`Removed medicine: ${name}`);
          pharmacistChanged = true;
        }
      }
    }

    // 2. Manage Labs & Compare (lab technician changes)
    const activeAppId = appointmentId || previous.appointmentId;
    if (labs !== undefined && activeAppId) {
      const existingLabs = await LabRequest.find({ appointmentId: activeAppId, tenantId: req.tenantId });
      const existingNames = existingLabs.map(l => l.testName.trim().toLowerCase());
      const newNames = labs.map(l => l.trim().toLowerCase());

      const toDelete = existingLabs.filter(l => !newNames.includes(l.testName.trim().toLowerCase()));
      if (toDelete.length > 0) {
        await LabRequest.deleteMany({ _id: { $in: toDelete.map(l => l._id) } });
        diffDetails.push(`Removed lab tests: ${toDelete.map(l => l.testName).join(', ')}`);
        labTechChanged = true;
      }

      const toCreate = labs.filter(name => !existingNames.includes(name.trim().toLowerCase()));
      for (const test of toCreate) {
        await LabRequest.create({
          tenantId: req.tenantId,
          appointmentId: activeAppId,
          patientId: previous.patientId?._id || previous.patientId,
          doctorId: req.user.id,
          testName: test.trim(),
          notes: 'Requested from Prescription EMR (Edited)'
        });
        labTechChanged = true;
      }
      if (toCreate.length > 0) {
        diffDetails.push(`Added lab tests: ${toCreate.join(', ')}`);
      }
    }

    // 3. Update Appointment diagnosis/notes if provided
    if (activeAppId && (diagnosis !== undefined || notes !== undefined)) {
      const previousApp = await Appointment.findById(activeAppId).lean();
      if (previousApp) {
        if (diagnosis !== undefined && diagnosis !== previousApp.diagnosis) {
          diffDetails.push(`Updated diagnosis: "${previousApp.diagnosis || 'None'}" -> "${diagnosis}"`);
        }
        if (notes !== undefined && notes !== previousApp.notes) {
          diffDetails.push(`Updated symptoms/subjective notes`);
        }
      }
      const appUpdate = {};
      if (diagnosis !== undefined) appUpdate.diagnosis = diagnosis;
      if (notes !== undefined) appUpdate.notes = notes;
      await Appointment.findByIdAndUpdate(activeAppId, appUpdate);
    }

    // Audit log for edits, dispensing, or status transitions
    AuditLog.create({
      tenantId: req.tenantId,
      actor: req.user.staff_id || req.user.id || "system",
      actorName: req.user.name || "",
      actorRole: req.user.role || "",
      action: isDispenseTransition ? "prescription_dispensed" : (pharmacistChanged || labTechChanged ? "prescription_edited" : "prescription_status_changed"),
      target: prescription._id.toString(),
      metadata: { 
        pharmacistChanged,
        labTechChanged,
        from: previous.status, 
        to: status || prescription.status,
        diff: diffDetails.length > 0 ? diffDetails : ["General updates"]
      },
    }).catch(() => {});

    const io = req.app.get("io");
    if (io && req.tenantId) {
      io.to(req.tenantId).emit("data_changed", { type: "prescriptions" });
      if (stockModified) {
        io.to(req.tenantId).emit("data_changed", { type: "medicines" });
      }
      if (labTechChanged) {
        io.to(req.tenantId).emit("data_changed", { type: "labs" });
      }

      // If changes are related to pharmacist or lab technician, emit specific notification event
      if (pharmacistChanged || labTechChanged) {
        const patientName = prescription.patientId?.name || "Patient";
        io.to(req.tenantId).emit("data_changed", {
          type: "prescription_updated",
          message: `Prescription for Patient "${patientName}" has been edited by Dr. ${req.user.name || 'Sarah'}`,
          changes: {
            pharmacist: pharmacistChanged,
            labTech: labTechChanged
          }
        });
      }
    }
    res.json(prescription);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// PUT /api/prescriptions/:id/offline-correction
// PHASE 6: Direct Prescription Correction Endpoint for Reception
router.put("/:id/offline-correction", async (req, res) => {
  try {
    const resolvedTenant = req.tenantId || req.user?.tenantId;
    if (!resolvedTenant) {
      return res.status(400).json({ error: 'Tenant context is required' });
    }

    // Role check: ONLY reception / receptionist (Requirement 6)
    const userRole = req.user?.role;
    if (userRole !== 'reception' && userRole !== 'receptionist') {
      return res.status(403).json({ 
        error: 'FORBIDDEN_ROLE', 
        message: 'Only Reception can submit handwritten prescription corrections.' 
      });
    }

    const prescription = await Prescription.findOne({
      _id: req.params.id,
      tenantId: resolvedTenant
    });

    if (!prescription) {
      return res.status(404).json({ error: 'Prescription not found' });
    }

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

    const rawImages = Array.isArray(req.body.images) ? req.body.images : [];
    if (rawImages.length === 0) {
      return res.status(400).json({
        error: 'EMPTY_PRESCRIPTION',
        message: 'A handwritten prescription must contain at least one page.'
      });
    }

    const normalizedImages = rawImages.map((img, idx) => ({
      pageNumber: idx + 1,
      url: img.url,
      originalName: img.originalName || `Page_${idx + 1}.jpg`,
      uploadedAt: img.uploadedAt || new Date()
    }));

    const previousImages = (prescription.images || []).map(img => ({
      pageNumber: img.pageNumber,
      url: img.url,
      originalName: img.originalName
    }));

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

    // Log to AuditLog (Requirement 1, 11)
    await AuditLog.create({
      tenantId: resolvedTenant,
      actor: actorId,
      actorName: actorName,
      actorRole: actorRole,
      action: detectedAction,
      target: prescription._id.toString(),
      metadata: {
        prescriptionId: prescription._id.toString(),
        appointmentId: prescription.appointmentId?.toString(),
        patientId: prescription.patientId?.toString(),
        doctorId: prescription.doctorId?.toString(),
        action: detectedAction,
        affectedPage: req.body.affectedPage || null,
        previousState: { images: previousImages },
        resultingState: { images: normalizedImages },
        notes: req.body.notes || `Prescription pages updated via ${detectedAction}`
      }
    });

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

    prescription.images = normalizedImages;
    await prescription.save();

    const io = req.app.get("io");
    if (io) {
      io.to(resolvedTenant).emit("data_changed", {
        type: "prescriptions",
        subType: "offline_handwritten",
        action: "prescription_corrected",
        correctionAction: detectedAction,
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

module.exports = router;
