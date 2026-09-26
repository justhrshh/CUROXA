const express = require("express");
const Prescription = require("../models/Prescription");
const Medicine = require("../models/Medicine");
const AuditLog = require("../models/AuditLog");
const Appointment = require("../models/Appointment");
const LabRequest = require("../models/LabRequest");
const { validateAndPlanFEFO, commitFEFOConsumption } = require("../utils/inventoryEngine");
const { sendEmail } = require("../utils/emailService");
const { resolveEmailLogoUrl } = require("../config/urls");
const { resolveTrustedHospitalBranding } = require("../utils/hospitalBrandingHelper");
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
      .populate("patientId", "name age gender contact email address uhId patientId bloodGroup")
      .populate("doctorId", "name specialty department designation staff_id")
      .populate("appointmentId", "diagnosis notes vitals date time status reason")
      .sort({ createdAt: -1 })
      .limit(parseInt(req.query.limit, 10) || 500)
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

    // Invariant 3: Cannot cancel an already dispensed prescription
    if (wasAlreadyDispensed && status === 'Cancelled') {
      return res.status(400).json({ error: "Cannot cancel a prescription that has already been dispensed to the patient." });
    }

    // Invariant 4: Atomic stock validation and deduction upon dispensing using FEFO
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

/**
 * Builds high-fidelity HTML email template for sharing prescription and encounter summary
 */
function buildPrescriptionEmailHtml({ hospital, patient, doctor, appointment, prescription, items, labs, customNote }) {
  const hospitalName = hospital?.name || 'Quroxa Healthcare';
  const logoUrl = resolveEmailLogoUrl(hospital?.logo);
  const primaryColor = hospital?.primaryColor || '#2563eb';
  
  const patientName = patient?.name || 'Patient';
  const uhid = patient?.uhid || patient?.patientId || prescription?.patientId?.uhid || '—';
  const age = patient?.age ? `${patient.age} Yrs` : '—';
  const gender = patient?.gender || '—';
  const contact = patient?.contact || patient?.phone || '—';

  const docName = doctor?.name ? (doctor.name.startsWith('Dr.') ? doctor.name : `Dr. ${doctor.name}`) : 'Attending Doctor';
  const docSpecialty = doctor?.specialty || doctor?.department || 'General Medicine';
  const docReg = doctor?.staff_id ? (doctor.staff_id.match(/^\d+$/) ? doctor.staff_id.slice(-5) : doctor.staff_id.toUpperCase()) : '44442';

  const rxDate = prescription?.createdAt || appointment?.date || new Date();
  const dateFormatted = new Date(rxDate).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric'
  });

  const diagnosis = prescription?.diagnosis || appointment?.diagnosis || '';
  const notes = prescription?.notes || appointment?.notes || '';
  const medItems = Array.isArray(items) && items.length > 0 ? items : (prescription?.items || []);
  const labItems = Array.isArray(labs) && labs.length > 0 ? labs : [];

  // Vitals
  let vitalsArr = [];
  const vitalsObj = appointment?.vitals || patient?.vitals;
  if (typeof vitalsObj === 'string' && vitalsObj.trim()) {
    vitalsArr = vitalsObj.split('|').map(v => v.trim()).filter(Boolean);
  } else if (vitalsObj && typeof vitalsObj === 'object') {
    if (vitalsObj.bpSys) vitalsArr.push(`BP: ${vitalsObj.bpSys}/${vitalsObj.bpDia || ''} mmHg`);
    if (vitalsObj.pulse) vitalsArr.push(`Pulse: ${vitalsObj.pulse} bpm`);
    if (vitalsObj.temp) vitalsArr.push(`Temp: ${vitalsObj.temp} °F`);
    if (vitalsObj.weight) vitalsArr.push(`Weight: ${vitalsObj.weight} kg`);
  }

  // Logo Markup
  const logoMarkup = logoUrl ? `
    <div style="margin-bottom: 14px; text-align: center;">
      <img src="${logoUrl}" alt="${hospitalName}" width="160" border="0" style="max-height: 48px; max-width: 180px; width: auto; height: auto; object-fit: contain; background: #ffffff; padding: 4px 8px; border-radius: 8px; display: inline-block; outline: none; text-decoration: none;" />
    </div>
  ` : '';

  // Medicine Rows Markup
  const medicineRows = medItems.length > 0 ? medItems.map((m, idx) => {
    let freq = 'Once a Day';
    let inst = 'After Food';
    if (m.instructions) {
      const parts = m.instructions.split('(');
      if (parts[0]) freq = parts[0].trim();
      if (parts[1]) inst = parts[1].replace(')', '').trim();
    }
    return `
      <tr style="border-bottom: 1px solid #E2E8F0; background-color: ${idx % 2 === 0 ? '#FFFFFF' : '#F8FAFC'};">
        <td style="padding: 10px 12px; text-align: center; font-weight: 700; color: #64748B; font-size: 12px;">${idx + 1}</td>
        <td style="padding: 10px 12px; font-weight: 700; color: #0F172A; font-size: 13px;">${m.medicine || m.name || '—'}</td>
        <td style="padding: 10px 12px; text-align: center; font-size: 12px; color: #1E293B;">${m.dosage || m.dose || '—'}</td>
        <td style="padding: 10px 12px; text-align: center; font-size: 12px; color: #475569;">${m.duration || '—'}</td>
        <td style="padding: 10px 12px; text-align: center; font-size: 11px; font-weight: 700; color: #2563EB;">${freq}</td>
        <td style="padding: 10px 12px; font-size: 12px; color: #475569;">${inst}</td>
      </tr>
    `;
  }).join('') : `
    <tr>
      <td colspan="6" style="padding: 20px; text-align: center; color: #94A3B8; font-size: 13px;">No medications prescribed for this visit.</td>
    </tr>
  `;

  // Lab Tests Markup
  const labRows = labItems.length > 0 ? labItems.map((test, idx) => {
    const tName = test.testName || test.name || (typeof test === 'string' ? test : 'Test');
    return `
      <tr style="border-bottom: 1px solid #E2E8F0; background-color: ${idx % 2 === 0 ? '#FFFFFF' : '#F8FAFC'};">
        <td style="padding: 8px 12px; text-align: center; font-weight: 700; color: #64748B; font-size: 12px;">${idx + 1}</td>
        <td style="padding: 8px 12px; font-weight: 700; color: #0F172A; font-size: 13px;">${tName}</td>
      </tr>
    `;
  }).join('') : '';

  return `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #F1F5F9; padding: 30px 15px; color: #1E293B;">
      <div style="max-width: 680px; margin: 0 auto; background-color: #FFFFFF; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.08); border: 1px solid #E2E8F0;">
        
        <!-- Header -->
        <div style="background: linear-gradient(135deg, ${primaryColor} 0%, #1E3A8A 100%); padding: 28px 24px; text-align: center; color: #FFFFFF;">
          ${logoMarkup}
          <h1 style="margin: 0; font-size: 24px; font-weight: 800; letter-spacing: -0.02em; color: #FFFFFF;">${hospitalName}</h1>
          <p style="margin: 6px 0 0; font-size: 12px; color: rgba(255,255,255,0.9); font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase;">
            Official Medical Prescription & Clinical Summary
          </p>
        </div>

        ${customNote ? `
          <div style="background-color: #EFF6FF; border-left: 4px solid #2563EB; padding: 14px 20px; margin: 18px 24px 0 24px; border-radius: 6px;">
            <p style="margin: 0; font-size: 13px; color: #1E40AF; line-height: 1.5;"><strong>Note:</strong> ${customNote}</p>
          </div>
        ` : ''}

        <!-- Patient & Encounter Banner -->
        <div style="margin: 20px 24px; padding: 18px; background: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 12px;">
          <table style="width: 100%; border-collapse: collapse;">
            <tr>
              <td style="vertical-align: top; width: 55%; padding-right: 12px;">
                <div style="font-size: 17px; font-weight: 800; color: #0F172A; text-transform: capitalize;">${patientName}</div>
                <div style="font-size: 12px; color: #64748B; margin-top: 4px;">
                  <strong style="color: #1D4ED8;">UHID:</strong> ${uhid} &bull; ${age} &bull; ${gender}
                </div>
                ${contact && contact !== '—' ? `<div style="font-size: 12px; color: #64748B; margin-top: 3px;">Phone: <strong style="color: #1E293B;">${contact}</strong></div>` : ''}
              </td>
              <td style="vertical-align: top; width: 45%; text-align: right;">
                <div style="font-size: 12px; color: #64748B;">Date: <strong style="color: #0F172A;">${dateFormatted}</strong></div>
                <div style="font-size: 13.5px; font-weight: 700; color: #0F172A; margin-top: 4px;">${docName}</div>
                <div style="font-size: 11.5px; color: #64748B;">${docSpecialty} &bull; Reg: DMC-${docReg}</div>
              </td>
            </tr>
          </table>

          ${vitalsArr.length > 0 ? `
            <div style="margin-top: 12px; padding-top: 10px; border-top: 1px solid #E2E8F0; font-size: 11px; color: #475569;">
              <strong style="color: #0284C7; text-transform: uppercase; margin-right: 6px;">Vitals:</strong>
              ${vitalsArr.join('  •  ')}
            </div>
          ` : ''}
        </div>

        ${diagnosis || notes ? `
          <div style="margin: 0 24px 20px; padding: 14px 18px; background: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 10px;">
            ${diagnosis ? `
              <div style="margin-bottom: ${notes ? '8px' : '0'};">
                <span style="font-size: 11px; font-weight: 800; color: #B45309; text-transform: uppercase; letter-spacing: 0.04em;">Primary Diagnosis: </span>
                <span style="font-size: 13px; font-weight: 700; color: #0F172A;">${diagnosis}</span>
              </div>
            ` : ''}
            ${notes ? `
              <div>
                <span style="font-size: 11px; font-weight: 800; color: #475569; text-transform: uppercase; letter-spacing: 0.04em;">Clinical / SOAP Notes: </span>
                <span style="font-size: 12px; color: #334155; line-height: 1.5;">${notes}</span>
              </div>
            ` : ''}
          </div>
        ` : ''}

        <!-- Prescribed Medications Section -->
        <div style="margin: 0 24px 20px;">
          <div style="margin-bottom: 8px;">
            <span style="font-size: 12px; font-weight: 800; color: #0F172A; text-transform: uppercase; letter-spacing: 0.05em;">Prescribed Medications (${medItems.length})</span>
          </div>
          <table style="width: 100%; border-collapse: collapse; border: 1px solid #E2E8F0; border-radius: 8px; overflow: hidden;">
            <thead>
              <tr style="background-color: #F1F5F9; border-bottom: 1px solid #CBD5E1;">
                <th style="padding: 9px 12px; font-size: 11px; font-weight: 700; color: #475569; text-align: center; width: 30px;">#</th>
                <th style="padding: 9px 12px; font-size: 11px; font-weight: 700; color: #475569; text-align: left;">Medicine Name</th>
                <th style="padding: 9px 12px; font-size: 11px; font-weight: 700; color: #475569; text-align: center; width: 75px;">Dosage</th>
                <th style="padding: 9px 12px; font-size: 11px; font-weight: 700; color: #475569; text-align: center; width: 75px;">Duration</th>
                <th style="padding: 9px 12px; font-size: 11px; font-weight: 700; color: #475569; text-align: center; width: 95px;">Frequency</th>
                <th style="padding: 9px 12px; font-size: 11px; font-weight: 700; color: #475569; text-align: left;">Instructions</th>
              </tr>
            </thead>
            <tbody>
              ${medicineRows}
            </tbody>
          </table>
        </div>

        ${labItems.length > 0 ? `
          <!-- Lab Investigations -->
          <div style="margin: 0 24px 20px;">
            <div style="margin-bottom: 8px;">
              <span style="font-size: 12px; font-weight: 800; color: #0F172A; text-transform: uppercase; letter-spacing: 0.05em;">Recommended Lab Investigations (${labItems.length})</span>
            </div>
            <table style="width: 100%; border-collapse: collapse; border: 1px solid #E2E8F0; border-radius: 8px; overflow: hidden;">
              <thead>
                <tr style="background-color: #F1F5F9; border-bottom: 1px solid #CBD5E1;">
                  <th style="padding: 8px 12px; font-size: 11px; font-weight: 700; color: #475569; text-align: center; width: 30px;">#</th>
                  <th style="padding: 8px 12px; font-size: 11px; font-weight: 700; color: #475569; text-align: left;">Test / Investigation</th>
                </tr>
              </thead>
              <tbody>
                ${labRows}
              </tbody>
            </table>
          </div>
        ` : ''}

        <!-- General Advice & Digital Signature -->
        <div style="margin: 0 24px 24px; padding-top: 16px; border-top: 1.5px solid #E2E8F0;">
          <table style="width: 100%; border-collapse: collapse;">
            <tr>
              <td style="vertical-align: top; width: 60%; padding-right: 16px;">
                <div style="font-size: 11px; font-weight: 800; color: #0F172A; text-transform: uppercase; margin-bottom: 4px;">General Instructions:</div>
                <ul style="margin: 0; padding-left: 16px; font-size: 11.5px; color: #475569; line-height: 1.5;">
                  <li>Take all medicines strictly as prescribed at the indicated timings.</li>
                  <li>Complete the entire medication course. Do not stop midway without consulting.</li>
                  <li>In case of allergic reactions or unexpected symptoms, contact the hospital immediately.</li>
                </ul>
              </td>
              <td style="vertical-align: top; width: 40%; text-align: center;">
                <div style="background: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 8px; padding: 12px;">
                  <div style="font-family: 'Brush Script MT', 'Lucida Handwriting', cursive, sans-serif; font-size: 24px; color: #1E3A8A; height: 32px; line-height: 32px; border-bottom: 1px dashed #CBD5E1; margin-bottom: 6px;">
                    ${docName.replace(/^Dr\.?\s*/i, '')}
                  </div>
                  <div style="font-size: 12.5px; font-weight: 700; color: #0F172A;">${docName}</div>
                  <div style="font-size: 10.5px; color: #64748B;">Reg. DMC-${docReg}</div>
                  <div style="margin-top: 6px; font-size: 10px; font-weight: 700; color: #059669; background: #ECFDF5; border: 1px solid #A7F3D0; padding: 2px 6px; border-radius: 4px; display: inline-block;">
                    &check; Digitally Verified Record
                  </div>
                </div>
              </td>
            </tr>
          </table>
        </div>

        <!-- Footer -->
        <div style="background-color: #F8FAFC; border-top: 1px solid #E2E8F0; padding: 16px 24px; text-align: center;">
          <p style="margin: 0; font-size: 11.5px; color: #64748B; line-height: 1.4;">
            This email contains confidential medical records from <strong>${hospitalName}</strong> intended solely for the patient.
          </p>
          <p style="margin: 6px 0 0; font-size: 10.5px; color: #94A3B8;">
            &copy; 2026 ${hospitalName}. Powered by Quroxa Healthcare Systems.
          </p>
        </div>

      </div>
    </div>
  `;
}

// Share prescription via email handler
async function handleSharePrescription(req, res) {
  try {
    const { email, customNote, patient, doctor, appointment, items, labs, diagnosis, notes } = req.body;
    const rxId = req.params.id;

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email || !emailRegex.test(String(email).trim())) {
      return res.status(400).json({ error: "Please provide a valid recipient email address." });
    }

    let prescriptionDoc = null;
    if (rxId && rxId !== 'new' && rxId !== 'draft') {
      try {
        prescriptionDoc = await Prescription.findOne({
          _id: rxId,
          tenantId: req.tenantId
        })
          .populate("patientId")
          .populate("doctorId")
          .lean();
      } catch (findErr) {
        console.warn("[PRESCRIPTION SHARE] Error fetching prescription by ID:", findErr.message);
      }
    }

    // Resolve hospital branding from MongoDB tenant
    const hospital = await resolveTrustedHospitalBranding(req.tenantId || req.user?.tenantId);
    const senderName = hospital?.name || 'Quroxa Healthcare';

    // Merge patient info
    const resolvedPatient = {
      name: patient?.name || prescriptionDoc?.patientId?.name || 'Patient',
      uhid: patient?.uhid || patient?.patientId || prescriptionDoc?.patientId?.uhid || prescriptionDoc?.patientId?.patientId || '',
      age: patient?.age || prescriptionDoc?.patientId?.age || '',
      gender: patient?.gender || prescriptionDoc?.patientId?.gender || '',
      contact: patient?.contact || patient?.phone || prescriptionDoc?.patientId?.contact || ''
    };

    // Merge doctor info
    const resolvedDoctor = {
      name: doctor?.name || prescriptionDoc?.doctorId?.name || req.user?.name || 'Attending Doctor',
      specialty: doctor?.specialty || doctor?.department || prescriptionDoc?.doctorId?.specialty || prescriptionDoc?.doctorId?.department || '',
      staff_id: doctor?.staff_id || prescriptionDoc?.doctorId?.staff_id || req.user?.staff_id || ''
    };

    // Merge items
    const resolvedItems = (items && Array.isArray(items) && items.length > 0)
      ? items
      : (prescriptionDoc?.items || []);

    // Merge labs
    const resolvedLabs = (labs && Array.isArray(labs) && labs.length > 0)
      ? labs
      : [];

    const resolvedPrescription = prescriptionDoc || {
      diagnosis: diagnosis || appointment?.diagnosis || '',
      notes: notes || appointment?.notes || '',
      createdAt: req.body.date || appointment?.date || new Date()
    };

    const emailHtml = buildPrescriptionEmailHtml({
      hospital,
      patient: resolvedPatient,
      doctor: resolvedDoctor,
      appointment: appointment || {},
      prescription: resolvedPrescription,
      items: resolvedItems,
      labs: resolvedLabs,
      customNote
    });

    const subject = `Prescription & Clinical Summary - ${resolvedPatient.name} - ${senderName}`;
    const plainText = `Prescription & Clinical Summary for ${resolvedPatient.name} from ${senderName}. Please view this email using an HTML-compatible email client to read your complete medication instructions.`;

    const sendResult = await sendEmail({
      to: email.trim(),
      subject,
      text: plainText,
      html: emailHtml,
      senderName
    });

    if (!sendResult.success) {
      const errDetail = sendResult.results?.[0]?.error || "Unknown email delivery failure";
      return res.status(502).json({
        error: `Failed to deliver email: ${errDetail}`,
        details: sendResult
      });
    }

    // Fire-and-forget audit log
    AuditLog.create({
      tenantId: req.tenantId,
      actor: req.user?.staff_id || req.user?.id || "system",
      actorName: req.user?.name || "",
      actorRole: req.user?.role || "",
      action: "prescription_shared_email",
      target: rxId || (prescriptionDoc ? prescriptionDoc._id.toString() : "direct_share"),
      metadata: {
        recipientEmail: email.trim(),
        patientName: resolvedPatient.name,
        itemCount: resolvedItems.length,
        senderName
      }
    }).catch(() => {});

    return res.json({
      success: true,
      message: `Prescription shared successfully with ${email.trim()} from ${senderName}`,
      sendResult
    });
  } catch (error) {
    console.error("Prescription share email error:", error);
    return res.status(500).json({ error: error.message || "Failed to share prescription via email" });
  }
}

// Routes for sharing prescription
router.post("/share", handleSharePrescription);
router.post("/:id/share", handleSharePrescription);

module.exports = router;
